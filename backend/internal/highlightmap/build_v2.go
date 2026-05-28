package highlightmap

import (
	"fmt"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

const SchemaVersionV2 = "highlight-map.v2"

type HighlightMapV2 struct {
	SchemaVersion    string                `json:"schemaVersion"`
	SourceID         string                `json:"sourceId"`
	ScopeKey         string                `json:"scopeKey"`
	GeneratedAudioID string                `json:"generatedAudioId"`
	SpeechPlanID     string                `json:"speechPlanId"`
	ContentIRVersion string                `json:"contentIrVersion"`
	GeneratedAt      time.Time             `json:"generatedAt"`
	DurationMS       int                   `json:"durationMs"`
	TimingLevels     []string              `json:"timingLevels"`
	Summary          HighlightMapV2Summary `json:"summary"`
	Entries          []HighlightMapV2Entry `json:"entries"`
	Warnings         []string              `json:"warnings,omitempty"`
	Metadata         map[string]any        `json:"metadata,omitempty"`
}

type HighlightMapV2Summary struct {
	Status            string   `json:"status"`
	PrimaryLevel      string   `json:"primaryLevel"`
	EntryCount        int      `json:"entryCount"`
	WordCount         int      `json:"wordCount"`
	PhraseCount       int      `json:"phraseCount"`
	SentenceCount     int      `json:"sentenceCount"`
	BlockCount        int      `json:"blockCount"`
	TimingSources     []string `json:"timingSources"`
	Confidence        float64  `json:"confidence"`
	DriftBudgetMS     int      `json:"driftBudgetMs"`
	FallbackMode      string   `json:"fallbackMode"`
	Degraded          bool     `json:"degraded"`
	Reason            string   `json:"reason,omitempty"`
	AlignmentWarnings []string `json:"alignmentWarnings,omitempty"`
}

type HighlightMapV2Traceability struct {
	SourceTextMatch     string `json:"sourceTextMatch,omitempty"`
	NormalizedTextMatch string `json:"normalizedTextMatch,omitempty"`
	SpokenTextMatch     string `json:"spokenTextMatch,omitempty"`
	PolicyTransform     string `json:"policyTransform,omitempty"`
}

type HighlightMapV2Entry struct {
	EntryID               string                      `json:"entryId,omitempty"`
	Level                 string                      `json:"level"`
	SourceID              string                      `json:"sourceId"`
	ScopeKey              string                      `json:"scopeKey"`
	GeneratedAudioID      string                      `json:"generatedAudioId"`
	SpeechPlanID          string                      `json:"speechPlanId"`
	SpokenTokenID         string                      `json:"spokenTokenId,omitempty"`
	ContentIRVersion      string                      `json:"contentIrVersion"`
	SourceLocator         contentir.Locator           `json:"sourceLocator"`
	NodeID                string                      `json:"nodeId"`
	SegmentID             string                      `json:"segmentId,omitempty"`
	SourceWordID          string                      `json:"sourceWordId,omitempty"`
	SourceWordIndex       *int                        `json:"sourceWordIndex,omitempty"`
	TextQuote             string                      `json:"textQuote"`
	RawText               string                      `json:"rawText"`
	NormalizedText        string                      `json:"normalizedText"`
	SpokenText            string                      `json:"spokenText"`
	ReadingPosition       ReadingPosition             `json:"readingPosition,omitempty"`
	TokenIndex            *int                        `json:"tokenIndex"`
	FragmentIndex         *int                        `json:"fragmentIndex"`
	SentenceIndex         *int                        `json:"sentenceIndex"`
	AudioStartMS          int                         `json:"audioStartMs"`
	AudioEndMS            int                         `json:"audioEndMs"`
	ProviderTimingStartMS *int                        `json:"providerTimingStartMs"`
	ProviderTimingEndMS   *int                        `json:"providerTimingEndMs"`
	AlignedStartMS        *int                        `json:"alignedStartMs"`
	AlignedEndMS          *int                        `json:"alignedEndMs"`
	TimingSource          string                      `json:"timingSource"`
	Confidence            float64                     `json:"confidence"`
	DriftBudgetMS         int                         `json:"driftBudgetMs"`
	AlignmentWarnings     []string                    `json:"alignmentWarnings"`
	FallbackMode          string                      `json:"fallbackMode"`
	AllowsOverlap         bool                        `json:"allowsOverlap,omitempty"`
	Traceability          *HighlightMapV2Traceability `json:"traceability,omitempty"`
}

type BuildV2Request struct {
	JobID        string
	BookSourceID string
	ScopeKey     string
	SpeechPlanID string
	Text         string
	WordSpans    []WordSpan
	Fragments    alignment.FragmentTimingArtifact
	Tokens       alignment.TokenTimingArtifact
	GeneratedAt  time.Time
	Quality      alignment.AlignmentQualityReport
	Warnings     []string
}

func BuildV2(request BuildV2Request) HighlightMapV2 {
	if request.GeneratedAt.IsZero() {
		request.GeneratedAt = time.Now().UTC()
	}
	sourceID := firstNonEmpty(request.BookSourceID, request.JobID, "source")
	scopeKey := firstNonEmpty(request.ScopeKey, "source")
	speechPlanID := firstNonEmpty(request.SpeechPlanID, request.JobID, "speech-plan")
	timingSource := alignment.HighlightMapV2TimingSource(request.Fragments.Source, request.Tokens.Source)
	warnings := uniqueStrings(append(request.Warnings, request.Quality.AlignmentWarnings...))
	entries := make([]HighlightMapV2Entry, 0, len(request.Fragments.Fragments)+len(request.Tokens.Tokens))
	for _, fragment := range request.Fragments.Fragments {
		fragmentIndex := fragment.Index
		position := readingPositionForTiming(
			sourceID,
			scopeKey,
			fragment.Text,
			request.WordSpans,
			fragment.TokenStart,
		)
		entries = append(entries, v2Entry(v2EntryInput{
			audioEndMS:       fragment.EndMS,
			audioStartMS:     fragment.StartMS,
			confidence:       fragment.Confidence,
			entryIndex:       len(entries),
			fallbackMode:     fallbackModeForQuality(request.Quality),
			fragmentIndex:    &fragmentIndex,
			generatedAudioID: request.JobID,
			level:            "phrase",
			readingPosition:  position,
			scopeKey:         scopeKey,
			sourceID:         sourceID,
			sourceWordIndex:  sourceWordIndexForTiming(request.WordSpans, fragment.TokenStart),
			sourceLocator:    locatorForV2Entry(request.WordSpans, fragment.TokenStart, fragment.Text, position),
			speechPlanID:     speechPlanID,
			text:             fragment.Text,
			timingSource:     timingSource,
			warnings:         warnings,
		}))
	}
	if request.Quality.WordTimingReliable {
		for _, token := range request.Tokens.Tokens {
			tokenIndex := token.Index
			fragmentIndex := token.FragmentIndex
			position := readingPositionForTiming(
				sourceID,
				scopeKey,
				token.Text,
				request.WordSpans,
				token.Index,
			)
			entries = append(entries, v2Entry(v2EntryInput{
				audioEndMS:       token.EndMS,
				audioStartMS:     token.StartMS,
				confidence:       token.Confidence,
				entryIndex:       len(entries),
				fallbackMode:     "none",
				fragmentIndex:    &fragmentIndex,
				generatedAudioID: request.JobID,
				level:            "word",
				readingPosition:  position,
				scopeKey:         scopeKey,
				sourceID:         sourceID,
				sourceWordIndex:  sourceWordIndexForTiming(request.WordSpans, token.Index),
				sourceLocator:    locatorForV2Entry(request.WordSpans, token.Index, token.Text, position),
				speechPlanID:     speechPlanID,
				text:             token.Text,
				timingSource:     timingSource,
				tokenIndex:       &tokenIndex,
				warnings:         nil,
			}))
		}
	}
	summary := v2Summary(entries, request, timingSource, warnings)
	return HighlightMapV2{
		SchemaVersion:    SchemaVersionV2,
		SourceID:         sourceID,
		ScopeKey:         scopeKey,
		GeneratedAudioID: firstNonEmpty(request.JobID, "generated-audio"),
		SpeechPlanID:     speechPlanID,
		ContentIRVersion: "content-ir.v1",
		GeneratedAt:      request.GeneratedAt.UTC(),
		DurationMS:       firstPositive(request.Fragments.DurationMS, request.Tokens.DurationMS),
		TimingLevels:     timingLevelsForEntries(entries),
		Summary:          summary,
		Entries:          entries,
		Warnings:         warnings,
		Metadata: map[string]any{
			"alignmentMode":                  request.Quality.Mode,
			"alignmentQuality":               request.Quality.Quality,
			"alignmentRequiredForWordTiming": !request.Quality.WordTimingReliable && request.Quality.PrimaryLevel != alignment.AlignmentLevelWord,
		},
	}
}

type v2EntryInput struct {
	audioEndMS       int
	audioStartMS     int
	confidence       float64
	entryIndex       int
	fallbackMode     string
	fragmentIndex    *int
	generatedAudioID string
	level            string
	readingPosition  ReadingPosition
	scopeKey         string
	sourceID         string
	sourceWordIndex  *int
	sourceLocator    contentir.Locator
	speechPlanID     string
	text             string
	timingSource     string
	tokenIndex       *int
	warnings         []string
}

func v2Entry(input v2EntryInput) HighlightMapV2Entry {
	providerStart, providerEnd, alignedStart, alignedEnd := timingAnchorsForV2(
		input.timingSource,
		input.audioStartMS,
		input.audioEndMS,
	)
	sourceWordIndex := input.sourceWordIndex
	sourceWordID := ""
	if sourceWordIndex != nil {
		sourceWordID = sourceWordIDForV2(input.sourceID, input.scopeKey, *sourceWordIndex)
	}
	return HighlightMapV2Entry{
		EntryID:               fmt.Sprintf("%s:%04d", input.level, input.entryIndex),
		Level:                 input.level,
		SourceID:              input.sourceID,
		ScopeKey:              input.scopeKey,
		GeneratedAudioID:      firstNonEmpty(input.generatedAudioID, "generated-audio"),
		SpeechPlanID:          input.speechPlanID,
		SpokenTokenID:         spokenTokenIDForV2(input.speechPlanID, input.level, input.tokenIndex, input.fragmentIndex, input.entryIndex),
		ContentIRVersion:      "content-ir.v1",
		SourceLocator:         input.sourceLocator,
		NodeID:                fmt.Sprintf("%s:%s:%04d", input.scopeKey, input.level, input.entryIndex),
		SegmentID:             fmt.Sprintf("segment-%04d", max(1, input.entryIndex+1)),
		SourceWordID:          sourceWordID,
		SourceWordIndex:       sourceWordIndex,
		TextQuote:             strings.TrimSpace(input.text),
		RawText:               strings.TrimSpace(input.text),
		NormalizedText:        strings.TrimSpace(input.text),
		SpokenText:            strings.TrimSpace(input.text),
		ReadingPosition:       input.readingPosition,
		TokenIndex:            input.tokenIndex,
		FragmentIndex:         input.fragmentIndex,
		SentenceIndex:         nil,
		AudioStartMS:          input.audioStartMS,
		AudioEndMS:            input.audioEndMS,
		ProviderTimingStartMS: providerStart,
		ProviderTimingEndMS:   providerEnd,
		AlignedStartMS:        alignedStart,
		AlignedEndMS:          alignedEnd,
		TimingSource:          input.timingSource,
		Confidence:            round(input.confidence),
		DriftBudgetMS:         driftBudgetForV2(input.level),
		AlignmentWarnings:     uniqueStrings(input.warnings),
		FallbackMode:          input.fallbackMode,
		Traceability: &HighlightMapV2Traceability{
			SourceTextMatch:     strings.TrimSpace(input.text),
			NormalizedTextMatch: strings.TrimSpace(input.text),
			SpokenTextMatch:     strings.TrimSpace(input.text),
		},
	}
}

func v2Summary(
	entries []HighlightMapV2Entry,
	request BuildV2Request,
	timingSource string,
	warnings []string,
) HighlightMapV2Summary {
	counts := map[string]int{}
	for _, entry := range entries {
		counts[entry.Level] += 1
	}
	primaryLevel := string(request.Quality.PrimaryLevel)
	if primaryLevel == "" {
		primaryLevel = "phrase"
	}
	return HighlightMapV2Summary{
		Status:            firstNonEmpty(request.Fragments.Status, request.Tokens.Status, "complete"),
		PrimaryLevel:      primaryLevel,
		EntryCount:        len(entries),
		WordCount:         counts["word"],
		PhraseCount:       counts["phrase"],
		SentenceCount:     counts["sentence"],
		BlockCount:        counts["block"],
		TimingSources:     []string{timingSource},
		Confidence:        round(request.Quality.Confidence.Overall),
		DriftBudgetMS:     driftBudgetForV2(primaryLevel),
		FallbackMode:      fallbackModeForQuality(request.Quality),
		Degraded:          request.Quality.Quality == alignment.AlignmentQualityDegraded || request.Quality.Quality == alignment.AlignmentQualityUnavailable,
		Reason:            request.Quality.FallbackReason,
		AlignmentWarnings: warnings,
	}
}

func timingLevelsForEntries(entries []HighlightMapV2Entry) []string {
	seen := map[string]bool{}
	levels := make([]string, 0, 2)
	for _, entry := range entries {
		if !seen[entry.Level] {
			seen[entry.Level] = true
			levels = append(levels, entry.Level)
		}
	}
	if len(levels) == 0 {
		return []string{"block"}
	}
	return levels
}

func fallbackModeForQuality(report alignment.AlignmentQualityReport) string {
	switch report.Quality {
	case alignment.AlignmentQualityExact, alignment.AlignmentQualityGood:
		if report.WordTimingReliable {
			return "none"
		}
		return "word-to-phrase"
	case alignment.AlignmentQualityPhraseOnly:
		return "word-to-phrase"
	case alignment.AlignmentQualityUnavailable:
		return "unavailable"
	default:
		return "block-only"
	}
}

func timingAnchorsForV2(source string, startMS int, endMS int) (*int, *int, *int, *int) {
	start := startMS
	end := endMS
	switch source {
	case "provider-word", "provider-mark":
		return &start, &end, nil, nil
	case "forced-alignment", "phrase-estimate":
		return nil, nil, &start, &end
	default:
		return nil, nil, nil, nil
	}
}

func driftBudgetForV2(level string) int {
	switch level {
	case "word":
		return 150
	case "phrase":
		return 350
	default:
		return 700
	}
}

func locatorForV2Entry(spans []WordSpan, index int, text string, position ReadingPosition) contentir.Locator {
	if position.Locator != nil {
		return *position.Locator
	}
	if index >= 0 && index < len(spans) {
		if locator := locatorForWordSpan(spans[index]); locator != nil {
			return *locator
		}
	}
	progression := 0.0
	return contentir.NewHTMLLocator("", "source", text, &progression, "")
}

func sourceWordIndexForTiming(spans []WordSpan, tokenIndex int) *int {
	if tokenIndex >= 0 && tokenIndex < len(spans) {
		index := spans[tokenIndex].Index
		return &index
	}
	return nil
}

func sourceWordIDForV2(sourceID string, scopeKey string, sourceWordIndex int) string {
	return fmt.Sprintf("%s:%s:word:%d", firstNonEmpty(sourceID, "source"), firstNonEmpty(scopeKey, "scope"), sourceWordIndex)
}

func spokenTokenIDForV2(
	speechPlanID string,
	level string,
	tokenIndex *int,
	fragmentIndex *int,
	entryIndex int,
) string {
	prefix := firstNonEmpty(speechPlanID, "speech-plan")
	if tokenIndex != nil {
		return fmt.Sprintf("%s:token:%d", prefix, *tokenIndex)
	}
	if fragmentIndex != nil {
		return fmt.Sprintf("%s:fragment:%d", prefix, *fragmentIndex)
	}
	return fmt.Sprintf("%s:%s:%d", prefix, firstNonEmpty(level, "entry"), entryIndex)
}
