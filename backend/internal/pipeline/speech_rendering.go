package pipeline

import (
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/lexicon"
	speechmath "github.com/justinedwards/tts-research/backend/internal/math"
	"github.com/justinedwards/tts-research/backend/internal/normalise"
	"github.com/justinedwards/tts-research/backend/internal/ssml"
)

const speechRenderMetadataKey = "speechRender"

type SpeechRenderOptions struct {
	ProjectID      string
	VoiceProfileID string
	Locale         string
	TTSEngine      string
	Kind           NarrationBlockKind
	FallbackLang   string
}

type SpeechRenderResult struct {
	PlainText      string                    `json:"plainText"`
	SSML           string                    `json:"ssml,omitempty"`
	Lang           string                    `json:"lang"`
	Locale         string                    `json:"locale"`
	LanguageSpans  []normalise.LanguageSpan  `json:"languageSpans,omitempty"`
	Pronunciations []lexicon.Decision        `json:"pronunciations,omitempty"`
	Normalisations []normalise.Decision      `json:"normalisations,omitempty"`
	MathPreview    *speechmath.PreviewResult `json:"mathPreview,omitempty"`
	Warnings       []string                  `json:"warnings,omitempty"`
}

func (service *Service) RenderSpeechText(text string, options SpeechRenderOptions) SpeechRenderResult {
	locale := normalise.NormalizeLocale(options.Locale)
	base := strings.TrimSpace(text)
	kind := options.Kind
	if kind != NarrationBlockKindMath && looksLikeStandaloneMath(base) {
		kind = NarrationBlockKindMath
	}
	var mathPreview *speechmath.PreviewResult
	if kind == NarrationBlockKindMath {
		preview := speechmath.Preview(base)
		mathPreview = &preview
		base = preview.Speech
	}

	projectLexicon, _ := service.loadProjectLexiconForRender(options.ProjectID)
	profileLexicon, _ := service.loadVoiceProfileLexiconForRender(options.VoiceProfileID)
	rendered, profileDecisions := lexicon.Apply(base, profileLexicon)
	rendered, projectDecisions := lexicon.Apply(rendered, projectLexicon)
	pronunciations := append(profileDecisions, projectDecisions...)

	rendered, numberDecisions := normalise.NormalizeNumbersDatesCurrency(rendered, locale)
	rendered, acronymDecisions := normalise.NormalizeAcronyms(rendered)
	rendered = strings.NewReplacer("&", " and ", "°", " degrees ", "=", " equals ", "+", " plus ").Replace(rendered)
	rendered = strings.Join(strings.Fields(rendered), " ")
	normalisations := append(numberDecisions, acronymDecisions...)

	spans := normalise.DetectLanguageSpans(rendered, firstNonEmpty(options.FallbackLang, normalise.LocaleLanguage(locale)))
	lang := normalise.DominantLanguage(spans, normalise.LocaleLanguage(locale))
	ssmlText := ssml.Serialize(ssml.Document{Text: rendered, Lang: lang})
	warnings := []string{}
	if len(spans) > 1 {
		warnings = append(warnings, "mixed_language")
	}
	if mathPreview != nil {
		warnings = append(warnings, mathPreview.Warnings...)
	}
	return SpeechRenderResult{
		PlainText:      strings.TrimSpace(rendered),
		SSML:           ssmlText,
		Lang:           lang,
		Locale:         locale,
		LanguageSpans:  spans,
		Pronunciations: pronunciations,
		Normalisations: normalisations,
		MathPreview:    mathPreview,
		Warnings:       uniqueStrings(warnings),
	}
}

func looksLikeStandaloneMath(text string) bool {
	trimmed := strings.TrimSpace(text)
	lower := strings.ToLower(trimmed)
	if trimmed == "" {
		return false
	}
	if strings.HasPrefix(trimmed, "$$") && strings.HasSuffix(trimmed, "$$") {
		return true
	}
	if strings.HasPrefix(trimmed, `\[`) && strings.HasSuffix(trimmed, `\]`) {
		return true
	}
	if strings.HasPrefix(lower, "<math") {
		return true
	}
	return strings.HasPrefix(trimmed, `\frac`) ||
		strings.HasPrefix(trimmed, `\sqrt`) ||
		strings.Contains(trimmed, `\frac{`) ||
		strings.Contains(trimmed, `\sqrt{`)
}

func (service *Service) applySpeechRenderToPreparedSource(source PreparedSource, options SpeechRenderOptions) PreparedSource {
	source = sanitizePreparedSourceReferenceCueLeaks(source, service.options.SourcePrepSentenceMaxRunes)
	options.ProjectID = firstNonEmpty(options.ProjectID, source.ProjectID)
	for index := range source.Blocks {
		block := source.Blocks[index]
		if block.SpeakMode == NarrationSpeakModeSkip || strings.TrimSpace(block.SpokenText) == "" {
			source.Blocks[index] = block
			continue
		}
		renderInput := block.SpokenText
		options.Kind = block.Kind
		if block.Kind != NarrationBlockKindMath && looksLikeStandaloneMath(block.Text) {
			options.Kind = NarrationBlockKindMath
			renderInput = block.Text
		}
		options.FallbackLang = block.Language
		rendered := service.RenderSpeechText(renderInput, options)
		block.SpokenText = rendered.PlainText
		block.Language = rendered.Lang
		block.LanguageSpans = rendered.LanguageSpans
		block.Pronunciations = rendered.Pronunciations
		block.Normalisations = rendered.Normalisations
		block.MathPreview = rendered.MathPreview
		block.Warnings = uniqueStrings(append(block.Warnings, rendered.Warnings...))
		if block.Metadata == nil {
			block.Metadata = map[string]any{}
		}
		block.Metadata[speechRenderMetadataKey] = rendered
		block.Segments, block.Warnings = resetPolicySegments(block, service.options.SourcePrepSentenceMaxRunes)
		block.EstimatedDurationMS = estimateBookDurationMS(countWords(block.SpokenText))
		source.Blocks[index] = block
	}
	source.SpeechText = preparedSourceSpeechText(source.Blocks)
	source.WordCount = countWords(source.SpeechText)
	source.SegmentCount = countPreparedSegments(source.Blocks)
	source.Summary = summarizePreparedSource(source.Blocks)
	source = sanitizePreparedSourceReferenceCueLeaks(source, service.options.SourcePrepSentenceMaxRunes)
	return source
}

func (service *Service) loadProjectLexiconForRender(projectID string) (lexicon.Lexicon, error) {
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		projectID = defaultProjectID
	}
	return service.projectLexiconStore(projectID).Load()
}

func (service *Service) loadVoiceProfileLexiconForRender(profileID string) (lexicon.Lexicon, error) {
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		return lexicon.Lexicon{Version: lexicon.StoreVersion, Scope: lexicon.ScopeVoiceProfile, Entries: []lexicon.Entry{}}, nil
	}
	return service.voiceProfileLexiconStore(profileID).Load()
}
