package policy

import (
	"strings"
)

type Evaluator struct {
	profile          ProfileName
	profileID        string
	profileLabel     string
	settings         Settings
	sourceOverrides  Overrides
	sessionOverrides Overrides
	baseSource       string
}

func NewEvaluator(profileName ProfileName, overrides Overrides) Evaluator {
	profile, settings, normalizedOverrides := ResolveSettings(profileName, overrides)
	return Evaluator{
		profile:          profile,
		profileID:        string(profile),
		profileLabel:     string(profile),
		settings:         settings,
		sessionOverrides: normalizedOverrides,
		baseSource:       "profile",
	}
}

func NewEvaluatorForSettings(profileID string, profileLabel string, settings Settings, overrides Overrides) Evaluator {
	return NewLayeredEvaluatorForSettings(profileID, profileLabel, settings, Overrides{}, overrides, "profile")
}

func NewLayeredEvaluatorForSettings(profileID string, profileLabel string, settings Settings, sourceOverrides Overrides, sessionOverrides Overrides, baseSource string) Evaluator {
	normalizedSourceOverrides := NormalizeOverrides(sourceOverrides)
	normalizedSessionOverrides := NormalizeOverrides(sessionOverrides)
	normalizedSettings := NormalizeSettings(settings, ProfileByName(DefaultProfileName).Settings)
	normalizedSettings = applyOverrides(normalizedSettings, normalizedSourceOverrides)
	normalizedSettings = applyOverrides(normalizedSettings, normalizedSessionOverrides)
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		profileID = string(DefaultProfileName)
	}
	profileLabel = strings.TrimSpace(profileLabel)
	if profileLabel == "" {
		profileLabel = profileID
	}
	baseSource = strings.TrimSpace(baseSource)
	if baseSource == "" {
		baseSource = "profile"
	}
	return Evaluator{
		profile:          NormalizeProfileName(profileID),
		profileID:        profileID,
		profileLabel:     profileLabel,
		settings:         normalizedSettings,
		sourceOverrides:  normalizedSourceOverrides,
		sessionOverrides: normalizedSessionOverrides,
		baseSource:       baseSource,
	}
}

func applyOverrides(settings Settings, overrides Overrides) Settings {
	if overrides.Mode != "" {
		settings.Mode = overrides.Mode
	}
	if overrides.TableMode != "" {
		settings.TableMode = overrides.TableMode
	}
	if overrides.TableHeaderMode != "" {
		settings.TableHeaderMode = overrides.TableHeaderMode
	}
	if overrides.CodeMode != "" {
		settings.CodeMode = overrides.CodeMode
	}
	if overrides.MathMode != "" {
		settings.MathMode = overrides.MathMode
	}
	if overrides.FootnoteMode != "" {
		settings.FootnoteMode = overrides.FootnoteMode
	}
	if overrides.ImageMode != "" {
		settings.ImageMode = overrides.ImageMode
	}
	if overrides.CaptionMode != "" {
		settings.CaptionMode = overrides.CaptionMode
	}
	if overrides.CitationMode != "" {
		settings.CitationMode = overrides.CitationMode
	}
	if overrides.ListMarkerMode != "" {
		settings.ListMarkerMode = overrides.ListMarkerMode
	}
	if overrides.AdmonitionMode != "" {
		settings.AdmonitionMode = overrides.AdmonitionMode
	}
	if overrides.QuoteMode != "" {
		settings.QuoteMode = overrides.QuoteMode
	}
	return settings
}

func (evaluator Evaluator) Settings() Settings {
	return evaluator.settings
}

func (evaluator Evaluator) Profile() ProfileName {
	return evaluator.profile
}

func (evaluator Evaluator) ProfileID() string {
	if strings.TrimSpace(evaluator.profileID) == "" {
		return string(evaluator.profile)
	}
	return evaluator.profileID
}

func (evaluator Evaluator) Evaluate(element Element) Decision {
	elementKind := ElementKind(element.Kind, element.Role, element.Text, element.Warnings)
	switch elementKind {
	case "frontmatter":
		return evaluator.decision("frontmatter", "metadata", ModeSkip, "")
	case "embedded":
		return evaluator.decision("embedded", "safeFallback", ModeOnDemand, "")
	case "directive":
		return evaluator.decision("directive", "safeFallback", ModeOnDemand, "")
	case "admonition":
		return evaluator.evaluateAdmonition(element)
	case "quote":
		return evaluator.evaluateQuote(element)
	case "list":
		return evaluator.evaluateList(element)
	case "caption":
		return evaluator.evaluateCaption(element)
	case "citation":
		return evaluator.evaluateCitation(element)
	case "reference":
		return evaluator.evaluateReference(element)
	case "artifact_token", "unknown_inline_marker":
		return evaluator.evaluateArtifactToken(elementKind, element)
	case "table":
		return evaluator.evaluateTable(element)
	case "code":
		return evaluator.evaluateCode(element)
	case "math":
		return evaluator.evaluateMath(element)
	case "footnote":
		return evaluator.evaluateFootnote(element)
	case "image":
		return evaluator.evaluateImage(element)
	default:
		return evaluator.decision("prose", string(evaluator.settings.Mode), evaluator.settings.Mode, cleanInline(element.Text))
	}
}

func ElementKind(kind string, role string, text string, warnings []string) string {
	lowerKind := strings.ToLower(strings.TrimSpace(kind))
	lowerRole := strings.ToLower(strings.TrimSpace(role))
	switch lowerKind {
	case "admonition", "directive", "embedded", "frontmatter", "table", "code", "math", "image", "caption", "citation", "reference", "artifact_token", "unknown_inline_marker", "list", "quote":
		return lowerKind
	case "footnote", "endnote":
		return "footnote"
	}
	switch lowerRole {
	case "admonition", "directive", "embedded", "frontmatter", "table", "code", "math", "image", "caption", "citation", "reference", "artifact_token", "unknown_inline_marker", "list", "quote":
		return lowerRole
	case "footnote", "endnote":
		return "footnote"
	}
	trimmed := strings.TrimSpace(text)
	if containsRawInlineArtifact(trimmed) && strings.TrimSpace(stripRawInlineArtifacts(trimmed)) == "" {
		return "citation"
	}
	if strings.HasPrefix(trimmed, "$$") && strings.HasSuffix(trimmed, "$$") {
		return "math"
	}
	if strings.HasPrefix(trimmed, "![") {
		return "image"
	}
	return "prose"
}

func (evaluator Evaluator) evaluateTable(element Element) Decision {
	switch evaluator.settings.TableMode {
	case TableModeSkip:
		return evaluator.decision("table", string(TableModeSkip), ModeSkip, "")
	case TableModeRowLinear:
		return evaluator.decision("table", string(TableModeRowLinear), ModeSpeak, linearizeTable(element.Text, evaluator.settings.TableHeaderMode))
	case TableModeInteractive:
		return evaluator.decision("table", string(TableModeInteractive), ModeInteractive, "")
	default:
		return evaluator.decision("table", string(TableModeSummary), ModeSummarise, summarizeTable(element.Text))
	}
}

func (evaluator Evaluator) evaluateCaption(element Element) Decision {
	switch evaluator.settings.CaptionMode {
	case CaptionModeSkip:
		return evaluator.decision("caption", string(CaptionModeSkip), ModeSkip, "")
	case CaptionModeOnDemand:
		return evaluator.decision("caption", string(CaptionModeOnDemand), ModeOnDemand, "")
	default:
		return evaluator.decision("caption", string(CaptionModeSpeak), ModeSpeak, cleanInline(element.Text))
	}
}

func (evaluator Evaluator) evaluateCitation(element Element) Decision {
	switch evaluator.settings.CitationMode {
	case CitationModeSkip:
		return evaluator.decision("citation", string(CitationModeSkip), ModeSkip, "")
	case CitationModeInline:
		return evaluator.decision("citation", string(CitationModeInline), ModeSpeak, safeCitationSpeech(element.Text, "Citation marker."))
	case CitationModeEndnote:
		return evaluator.decision("citation", string(CitationModeEndnote), ModeOnDemand, "")
	default:
		return evaluator.decision("citation", string(CitationModeOnDemand), ModeOnDemand, "")
	}
}

func (evaluator Evaluator) evaluateReference(element Element) Decision {
	switch evaluator.settings.CitationMode {
	case CitationModeSkip:
		return evaluator.decision("reference", string(CitationModeSkip), ModeSkip, "")
	case CitationModeInline:
		return evaluator.decision("reference", string(CitationModeInline), ModeSpeak, safeCitationSpeech(element.Text, "Reference marker."))
	case CitationModeEndnote:
		return evaluator.decision("reference", string(CitationModeEndnote), ModeOnDemand, "")
	default:
		return evaluator.decision("reference", string(CitationModeOnDemand), ModeOnDemand, "")
	}
}

func (evaluator Evaluator) evaluateArtifactToken(elementName string, element Element) Decision {
	if evaluator.settings.Mode == ModeLiteral {
		return evaluator.decision(elementName, string(ModeLiteral), ModeLiteral, strings.TrimSpace(element.Text))
	}
	switch evaluator.settings.CitationMode {
	case CitationModeSkip:
		return evaluator.decision(elementName, string(CitationModeSkip), ModeSkip, "")
	case CitationModeInline:
		return evaluator.decision(elementName, string(CitationModeInline), ModeSpeak, safeCitationSpeech(element.Text, "Artifact marker."))
	case CitationModeEndnote:
		return evaluator.decision(elementName, string(CitationModeEndnote), ModeOnDemand, "")
	default:
		return evaluator.decision(elementName, string(CitationModeOnDemand), ModeOnDemand, "")
	}
}

func (evaluator Evaluator) evaluateList(element Element) Decision {
	text := cleanInline(element.Text)
	if evaluator.settings.ListMarkerMode == ListMarkerModeAnnounce && text != "" {
		text = "List item: " + text
	}
	return evaluator.decision("list", string(evaluator.settings.ListMarkerMode), ModeSpeak, text)
}

func (evaluator Evaluator) evaluateAdmonition(element Element) Decision {
	switch evaluator.settings.AdmonitionMode {
	case AdmonitionModeSkip:
		return evaluator.decision("admonition", string(AdmonitionModeSkip), ModeSkip, "")
	case AdmonitionModeSummarise:
		return evaluator.decision("admonition", string(AdmonitionModeSummarise), ModeSummarise, summarizeInline("Admonition", element.Text))
	default:
		return evaluator.decision("admonition", string(AdmonitionModeSpeak), ModeSpeak, cleanInline(element.Text))
	}
}

func (evaluator Evaluator) evaluateQuote(element Element) Decision {
	switch evaluator.settings.QuoteMode {
	case QuoteModeSkip:
		return evaluator.decision("quote", string(QuoteModeSkip), ModeSkip, "")
	case QuoteModeSummarise:
		return evaluator.decision("quote", string(QuoteModeSummarise), ModeSummarise, summarizeInline("Quote", element.Text))
	default:
		return evaluator.decision("quote", string(QuoteModeSpeak), ModeSpeak, cleanInline(element.Text))
	}
}

func (evaluator Evaluator) evaluateCode(element Element) Decision {
	language := strings.TrimSpace(element.Language)
	switch evaluator.settings.CodeMode {
	case CodeModeSkip:
		return evaluator.decision("code", string(CodeModeSkip), ModeSkip, "")
	case CodeModeLiteral:
		return evaluator.decision("code", string(CodeModeLiteral), ModeLiteral, strings.TrimSpace(element.Text))
	case CodeModeSyntaxAware:
		return evaluator.decision("code", string(CodeModeSyntaxAware), ModeLiteral, syntaxAwareCodeSpeech(element.Text, language))
	default:
		return evaluator.decision("code", string(CodeModeSummary), ModeSummarise, summarizeCode(element.Text, language))
	}
}

func (evaluator Evaluator) evaluateMath(element Element) Decision {
	switch evaluator.settings.MathMode {
	case MathModeSkip:
		return evaluator.decision("math", string(MathModeSkip), ModeSkip, "")
	case MathModeLiteralSafe:
		return evaluator.decision("math", string(MathModeLiteralSafe), ModeLiteral, "Math expression: "+literalMathText(element.Text)+".")
	default:
		return evaluator.decision("math", string(MathModeSemantic), ModeSpeak, "Math expression: "+semanticMathText(element.Text)+".")
	}
}

func (evaluator Evaluator) evaluateFootnote(element Element) Decision {
	switch evaluator.settings.FootnoteMode {
	case FootnoteModeSkip:
		return evaluator.decision("footnote", string(FootnoteModeSkip), ModeSkip, "")
	case FootnoteModeInline:
		return evaluator.decision("footnote", string(FootnoteModeInline), ModeSpeak, cleanInline(element.Text))
	case FootnoteModeEndnote:
		return evaluator.decision("footnote", string(FootnoteModeEndnote), ModeOnDemand, "")
	default:
		return evaluator.decision("footnote", string(FootnoteModeOnDemand), ModeOnDemand, "")
	}
}

func (evaluator Evaluator) evaluateImage(element Element) Decision {
	altText := imageAltText(element.Text)
	switch evaluator.settings.ImageMode {
	case ImageModeSkip:
		return evaluator.decision("image", string(ImageModeSkip), ModeSkip, "")
	case ImageModeDescribeLong:
		return evaluator.decision("image", string(ImageModeDescribeLong), ModeDescribeLong, imageDescription(element.Text, altText, true))
	case ImageModeDescribeShort:
		return evaluator.decision("image", string(ImageModeDescribeShort), ModeDescribeShort, imageDescription(element.Text, altText, false))
	default:
		return evaluator.decision("image", string(ImageModeAltFirst), ModeDescribeShort, imageDescription(element.Text, altText, false))
	}
}

func (evaluator Evaluator) decision(element string, elementMode string, mode Mode, speechText string) Decision {
	source := evaluator.overrideSourceForElement(element)
	return Decision{
		Policy: SpeechPolicy{
			Profile:     evaluator.ProfileID(),
			Element:     element,
			ElementMode: elementMode,
			Mode:        string(mode),
			Explanation: Explain(evaluator.profileLabel, element, elementMode, mode, source),
		},
		SpeechText: strings.TrimSpace(speechText),
	}
}

func (evaluator Evaluator) overrideSourceForElement(element string) string {
	if source := OverrideSourceForElement(element, evaluator.sessionOverrides); source == "session override" {
		return source
	}
	if source := OverrideSourceForElement(element, evaluator.sourceOverrides); source == "session override" {
		return "source override"
	}
	if strings.TrimSpace(evaluator.baseSource) == "" {
		return "profile"
	}
	return evaluator.baseSource
}
