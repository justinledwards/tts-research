package policy

import (
	"fmt"
	"regexp"
	"strings"
)

var markdownLinkLikePattern = regexp.MustCompile(`!?\[([^\]]*)\]\([^)]+\)`)

type Evaluator struct {
	profile      ProfileName
	profileID    string
	profileLabel string
	settings     Settings
	overrides    Overrides
}

func NewEvaluator(profileName ProfileName, overrides Overrides) Evaluator {
	profile, settings, normalizedOverrides := ResolveSettings(profileName, overrides)
	return Evaluator{
		profile:      profile,
		profileID:    string(profile),
		profileLabel: string(profile),
		settings:     settings,
		overrides:    normalizedOverrides,
	}
}

func NewEvaluatorForSettings(profileID string, profileLabel string, settings Settings, overrides Overrides) Evaluator {
	normalizedOverrides := NormalizeOverrides(overrides)
	normalizedSettings := NormalizeSettings(settings, ProfileByName(DefaultProfileName).Settings)
	if normalizedOverrides.Mode != "" {
		normalizedSettings.Mode = normalizedOverrides.Mode
	}
	if normalizedOverrides.TableMode != "" {
		normalizedSettings.TableMode = normalizedOverrides.TableMode
	}
	if normalizedOverrides.CodeMode != "" {
		normalizedSettings.CodeMode = normalizedOverrides.CodeMode
	}
	if normalizedOverrides.MathMode != "" {
		normalizedSettings.MathMode = normalizedOverrides.MathMode
	}
	if normalizedOverrides.FootnoteMode != "" {
		normalizedSettings.FootnoteMode = normalizedOverrides.FootnoteMode
	}
	if normalizedOverrides.ImageMode != "" {
		normalizedSettings.ImageMode = normalizedOverrides.ImageMode
	}
	profileID = strings.TrimSpace(profileID)
	if profileID == "" {
		profileID = string(DefaultProfileName)
	}
	profileLabel = strings.TrimSpace(profileLabel)
	if profileLabel == "" {
		profileLabel = profileID
	}
	return Evaluator{
		profile:      NormalizeProfileName(profileID),
		profileID:    profileID,
		profileLabel: profileLabel,
		settings:     normalizedSettings,
		overrides:    normalizedOverrides,
	}
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
	case "table", "code", "math", "image", "caption":
		if lowerKind == "caption" {
			return "image"
		}
		return lowerKind
	case "citation", "footnote", "endnote":
		return "footnote"
	}
	switch lowerRole {
	case "table", "code", "math", "image", "caption":
		if lowerRole == "caption" {
			return "image"
		}
		return lowerRole
	case "citation", "footnote", "endnote":
		return "footnote"
	}
	trimmed := strings.TrimSpace(text)
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
		return evaluator.decision("table", string(TableModeRowLinear), ModeSpeak, linearizeTable(element.Text))
	case TableModeInteractive:
		return evaluator.decision("table", string(TableModeInteractive), ModeInteractive, "")
	default:
		return evaluator.decision("table", string(TableModeSummary), ModeSummarise, summarizeTable(element.Text))
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
	source := OverrideSourceForElement(element, evaluator.overrides)
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

func summarizeTable(text string) string {
	lines := nonEmptyLines(text)
	if len(lines) == 0 {
		return "A table appears here and is summarised for spoken playback."
	}
	headers := tableCells(lines[0])
	if len(headers) > 0 {
		return fmt.Sprintf("A table appears here with columns: %s.", strings.Join(headers, ", "))
	}
	return "A table appears here and is summarised for spoken playback."
}

func linearizeTable(text string) string {
	lines := nonEmptyLines(text)
	if len(lines) == 0 {
		return "Empty table."
	}
	headers := tableCells(lines[0])
	rows := make([]string, 0)
	for _, line := range lines[1:] {
		if looksLikeTableDivider(line) {
			continue
		}
		cells := tableCells(line)
		if len(cells) == 0 {
			continue
		}
		parts := make([]string, 0, len(cells))
		for index, cell := range cells {
			if index < len(headers) && headers[index] != "" {
				parts = append(parts, headers[index]+": "+cell)
			} else {
				parts = append(parts, cell)
			}
		}
		rows = append(rows, strings.Join(parts, "; "))
	}
	if len(rows) == 0 {
		return summarizeTable(text)
	}
	return "Table. " + strings.Join(rows, ". ") + "."
}

func summarizeCode(text string, language string) string {
	lineCount := len(nonEmptyLines(text))
	if lineCount == 0 {
		return "An empty code block appears here."
	}
	label := "code block"
	if language != "" {
		label = language + " code block"
	}
	return fmt.Sprintf("A %s with %d line%s appears here.", label, lineCount, pluralSuffix(lineCount))
}

func syntaxAwareCodeSpeech(text string, language string) string {
	summary := summarizeCode(text, language)
	clean := strings.Join(strings.Fields(strings.TrimSpace(text)), " ")
	if clean == "" {
		return summary
	}
	if len(clean) > 220 {
		clean = strings.TrimSpace(clean[:220]) + "..."
	}
	return summary + " " + clean
}

func semanticMathText(text string) string {
	return strings.NewReplacer("$$", "", "\\[", "", "\\]", "", "^", " to the power of ", "_", " subscript ", "=", " equals ", "+", " plus ", "-", " minus ").Replace(strings.TrimSpace(text))
}

func literalMathText(text string) string {
	return strings.Join(strings.Fields(strings.NewReplacer("$$", "", "\\[", "", "\\]", "").Replace(strings.TrimSpace(text))), " ")
}

func imageDescription(text string, altText string, long bool) string {
	if altText != "" {
		if long {
			return "Image description: " + altText + "."
		}
		return "Image: " + altText + "."
	}
	clean := cleanInline(text)
	if clean == "" {
		return "Image without descriptive text."
	}
	if long {
		return "Image or caption: " + clean + "."
	}
	return clean
}

func imageAltText(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "![") {
		return ""
	}
	matches := markdownLinkLikePattern.FindStringSubmatch(trimmed)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(matches[1])
}

func nonEmptyLines(text string) []string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	output := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			output = append(output, strings.TrimSpace(line))
		}
	}
	return output
}

func tableCells(line string) []string {
	parts := strings.Split(strings.Trim(line, "| "), "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cell := cleanInline(part)
		if cell != "" {
			cells = append(cells, cell)
		}
	}
	return cells
}

func looksLikeTableDivider(line string) bool {
	trimmed := strings.Trim(line, "|: -")
	return trimmed == ""
}

func cleanInline(input string) string {
	clean := markdownLinkLikePattern.ReplaceAllString(input, "$1")
	clean = strings.NewReplacer("**", "", "__", "", "~~", "", "`", "", "•", "").Replace(clean)
	clean = strings.Trim(clean, " \t-*`_")
	return strings.Join(strings.Fields(clean), " ")
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}
