package policy

import (
	"fmt"
	"regexp"
	"strings"
)

var markdownLinkLikePattern = regexp.MustCompile(`!?\[([^\]]*)\]\([^)]+\)`)
var rawCitationGlyphPattern = regexp.MustCompile(`cite[^]*`)
var rawChatGPTBracketCitationPattern = regexp.MustCompile(`(?i)\[cite\]\s*\[\s*turn\d+(?:search|view|news|fetch)\d+\s*\]`)
var rawContentReferencePattern = regexp.MustCompile(`:contentReference\[[^\]\n]+\]\{[^}\n]*\}`)
var rawMalformedCitationPattern = regexp.MustCompile(`(?i)\[(?:cite|citation|source|reference)(?::[^\]\n]*)?\]`)
var rawTurnCitationPattern = regexp.MustCompile(`\bturn\d+(?:search|view|news|fetch)\d+\b`)
var rawFootnoteReferencePattern = regexp.MustCompile(`\[\^[^\]\s]+\]`)
var rawReferenceMarkerPattern = regexp.MustCompile(`\[(?:\d+(?:\s*(?:,|-|–)\s*\d+)*(?:,\s*p\.?\s*\d+)?|[A-Z][A-Za-z .'-]{1,40}(?:19|20)\d{2}[^\]\n]{0,20})\]`)
var rawBracketedMetadataPattern = regexp.MustCompile(`(?i)\[(?:todo|note|metadata|draft|review|debug|loc(?:ator)?|id|ref)[:\s][^\]\n]{0,80}\]`)

var rawInlineArtifactPatterns = []*regexp.Regexp{
	rawChatGPTBracketCitationPattern,
	rawCitationGlyphPattern,
	rawContentReferencePattern,
	rawMalformedCitationPattern,
	rawTurnCitationPattern,
	rawFootnoteReferencePattern,
	rawReferenceMarkerPattern,
	rawBracketedMetadataPattern,
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

func linearizeTable(text string, headerMode TableHeaderMode) string {
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
			if headerMode != TableHeaderModeNone && index < len(headers) && headers[index] != "" {
				parts = append(parts, headers[index]+": "+cell)
			} else {
				parts = append(parts, cell)
			}
		}
		rowText := strings.Join(parts, "; ")
		if headerMode == TableHeaderModeRowAndColumn {
			rowText = fmt.Sprintf("Row %d. %s", len(rows)+1, rowText)
		}
		rows = append(rows, rowText)
	}
	if len(rows) == 0 {
		return summarizeTable(text)
	}
	return "Table. " + strings.Join(rows, ". ") + "."
}

func summarizeInline(label string, text string) string {
	clean := cleanInline(text)
	if clean == "" {
		return label + " appears here."
	}
	words := strings.Fields(clean)
	if len(words) <= 16 {
		return label + ": " + clean
	}
	return fmt.Sprintf("%s summary: %s.", label, strings.Join(words[:16], " "))
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
	clean = stripRawInlineArtifacts(clean)
	clean = strings.NewReplacer("**", "", "__", "", "~~", "", "`", "", "•", "").Replace(clean)
	clean = strings.Trim(clean, " \t-*`_")
	clean = strings.TrimLeft(clean, " \t:;,.")
	return strings.Join(strings.Fields(clean), " ")
}

func safeCitationSpeech(input string, fallback string) string {
	if containsRawInlineArtifact(input) {
		clean := cleanInline(input)
		if clean == "" {
			return fallback
		}
		return clean
	}
	clean := cleanInline(input)
	if clean == "" {
		return fallback
	}
	return clean
}

func containsRawInlineArtifact(input string) bool {
	for _, pattern := range rawInlineArtifactPatterns {
		if pattern.MatchString(input) {
			return true
		}
	}
	return false
}

func stripRawInlineArtifacts(input string) string {
	clean := input
	for _, pattern := range rawInlineArtifactPatterns {
		clean = pattern.ReplaceAllString(clean, " ")
	}
	return clean
}

func pluralSuffix(count int) string {
	if count == 1 {
		return ""
	}
	return "s"
}
