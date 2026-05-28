package pipeline

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"mime"
	"net/url"
	"path"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/text"
)

func sentenceSafeSegments(text string, maxRunes int) ([]NarrationSegment, []string) {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return nil, nil
	}
	if maxRunes <= 0 {
		maxRunes = defaultSourcePrepSentenceMaxRunes
	}
	sentences := splitSentencePieces(clean)
	segments := make([]NarrationSegment, 0, len(sentences))
	warnings := make([]string, 0)
	cursor := 0
	for _, sentence := range sentences {
		sentence = strings.TrimSpace(sentence)
		if sentence == "" {
			continue
		}
		start := strings.Index(clean[cursor:], sentence)
		if start < 0 {
			start = cursor
		} else {
			start += cursor
		}
		end := start + len(sentence)
		segmentWarnings := []string{}
		if utf8.RuneCountInString(sentence) > maxRunes {
			segmentWarnings = append(segmentWarnings, warningSentenceTooLong)
			warnings = append(warnings, warningSentenceTooLong)
		}
		segments = append(segments, NarrationSegment{
			Index:       len(segments) + 1,
			Text:        sentence,
			StartOffset: start,
			EndOffset:   end,
			Warnings:    segmentWarnings,
		})
		cursor = end
	}
	return segments, uniqueStrings(warnings)
}

func normalizeReadableSourceText(input string) string {
	trimmed := strings.TrimSpace(strings.ReplaceAll(input, "\r\n", "\n"))
	trimmed = strings.ReplaceAll(trimmed, "\r", "\n")
	if strings.Contains(trimmed, "<") && strings.Contains(trimmed, ">") {
		trimmed = htmlScriptStylePattern.ReplaceAllString(trimmed, " ")
		trimmed = htmlBlockBreakPattern.ReplaceAllString(trimmed, "\n")
		trimmed = htmlTagSpeechPattern.ReplaceAllString(trimmed, " ")
		trimmed = html.UnescapeString(trimmed)
	}
	return strings.TrimSpace(trimmed)
}

func readableHTMLFragment(input string) string {
	cleaned := strings.TrimSpace(input)
	if cleaned == "" {
		return cleaned
	}
	cleaned = htmlScriptStylePattern.ReplaceAllString(cleaned, " ")
	cleaned = htmlChromePattern.ReplaceAllString(cleaned, " ")

	best := ""
	bestWords := 0
	for _, pattern := range []*regexp.Regexp{
		htmlArticlePattern,
		htmlMainPattern,
		htmlRoleMainPattern,
		htmlReadableClassPattern,
	} {
		for _, match := range pattern.FindAllStringSubmatch(cleaned, -1) {
			if len(match) < 2 {
				continue
			}
			candidate := strings.TrimSpace(match[len(match)-1])
			wordCount := countWords(normalizeReadableSourceText(candidate))
			if wordCount > bestWords {
				best = candidate
				bestWords = wordCount
			}
		}
		if bestWords >= 80 {
			return best
		}
	}
	if bestWords >= 24 {
		return best
	}
	return cleaned
}

func inferReadableHTMLTitle(input string, readableText string, fallback string) string {
	if title := firstHTMLText(input, htmlHeadingOnePattern); title != "" {
		return title
	}
	if title := firstHTMLText(input, htmlTitlePattern); title != "" {
		return title
	}
	for _, line := range strings.Split(readableText, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		words := countWords(line)
		if words >= 3 && words <= 24 {
			return line
		}
	}
	return inferPreparedSourceTitle(readableText, fallback)
}

func firstHTMLText(input string, pattern *regexp.Regexp) string {
	matches := pattern.FindStringSubmatch(input)
	if len(matches) < 2 {
		return ""
	}
	return strings.TrimSpace(normalizeReadableSourceText(matches[1]))
}

func cleanMarkdownInline(input string) string {
	clean := stripMarkdownInlineArtifacts(input)
	clean = markdownImagePattern.ReplaceAllString(clean, "$1")
	clean = markdownLinkPattern.ReplaceAllString(clean, "$1")
	clean = inlineCodeSpeechPattern.ReplaceAllString(clean, "$1")
	clean = strings.NewReplacer("**", "", "__", "", "~~", "", "•", "").Replace(clean)
	clean = strings.Trim(clean, " \t-*`_")
	return strings.Join(strings.Fields(clean), " ")
}

func shouldSkipCitationBlock(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}
	citationStripped := stripMarkdownInlineArtifacts(trimmed)
	citationStripped = strings.Trim(citationStripped, " []().,;:|")
	if citationStripped == "" {
		return true
	}
	return strings.Count(trimmed, "cite") >= 2 && countWords(citationStripped) <= 6
}

func containsCitationMarkup(text string) bool {
	for _, pattern := range markdownInlineArtifactPatterns() {
		if pattern.MatchString(text) {
			return true
		}
	}
	return false
}

func stripMarkdownInlineArtifacts(text string) string {
	clean := text
	for _, pattern := range markdownInlineArtifactPatterns() {
		clean = pattern.ReplaceAllString(clean, " ")
	}
	return clean
}

func markdownInlineArtifactPatterns() []*regexp.Regexp {
	return []*regexp.Regexp{
		chatGPTCitationPattern,
		citationGlyphPattern,
		contentReferencePattern,
		malformedCitationPattern,
		turnCitationPattern,
		footnoteReferencePattern,
		referenceMarkerPattern,
		bracketedMetadataPattern,
	}
}

func tableLinesOrRaw(raw string) []string {
	lines := strings.Split(raw, "\n")
	output := make([]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) != "" {
			output = append(output, line)
		}
	}
	return output
}

func summarizeMarkdownTable(lines []string) string {
	if len(lines) == 0 {
		return "A table appears here and is omitted from spoken playback."
	}
	headers := markdownTableCells(lines[0])
	if len(headers) > 0 {
		return fmt.Sprintf("A table appears here with columns: %s.", strings.Join(headers, ", "))
	}
	return "A table appears here and is summarized for spoken playback."
}

func markdownTableCells(line string) []string {
	parts := strings.Split(strings.Trim(line, "| "), "|")
	cells := make([]string, 0, len(parts))
	for _, part := range parts {
		cell := cleanMarkdownInline(part)
		if cell != "" {
			cells = append(cells, cell)
		}
	}
	return cells
}

func preparedSourceSpeechText(blocks []NarrationBlock) string {
	parts := make([]string, 0, len(blocks))
	for _, block := range blocks {
		if block.SpeakMode == NarrationSpeakModeSkip {
			continue
		}
		text := strings.TrimSpace(block.SpokenText)
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n\n")
}

func countPreparedSegments(blocks []NarrationBlock) int {
	total := 0
	for _, block := range blocks {
		if block.SpeakMode != NarrationSpeakModeSkip {
			total += len(block.Segments)
		}
	}
	return total
}

func summarizePreparedSource(blocks []NarrationBlock) PreparedSourceSummary {
	var summary PreparedSourceSummary
	for _, block := range blocks {
		switch block.Kind {
		case NarrationBlockKindHeading, NarrationBlockKindSubheading:
			summary.HeadingCount += 1
		case NarrationBlockKindCitation, NarrationBlockKindFootnote, NarrationBlockKindReference, NarrationBlockKindArtifact, NarrationBlockKindUnknownMark:
			if block.SpeakMode == NarrationSpeakModeSkip {
				summary.CitationSkipCount += 1
			}
		}
		if hasWarning(block.Warnings, "citation_removed") {
			summary.CitationSkipCount += 1
		}
		if block.SpeakMode == NarrationSpeakModeSkip {
			summary.SkippedBlockCount += 1
		} else {
			summary.SpokenBlockCount += 1
			summary.SentenceSegmentCount += len(block.Segments)
		}
	}
	return summary
}

func summarizePreparedSourcePayload(source PreparedSource) PreparedSource {
	source.Text = ""
	source.SpeechText = ""
	for index := range source.Blocks {
		source.Blocks[index].Text = truncateString(source.Blocks[index].Text, 220)
		source.Blocks[index].SpokenText = truncateString(source.Blocks[index].SpokenText, 220)
	}
	return source
}

func skippedSourceItem(block NarrationBlock, reason string) SkippedSourceItem {
	return SkippedSourceItem{
		ID:     block.ID,
		Kind:   block.Kind,
		Text:   truncateString(block.Text, 240),
		Reason: reason,
		Offset: block.StartOffset,
	}
}

func inferPreparedSourceTitle(text string, fallback string) string {
	if title := markdownFirstHeading(text); title != "" {
		return title
	}
	for _, line := range strings.Split(text, "\n") {
		if matches := markdownHeadingLine.FindStringSubmatch(strings.TrimSpace(line)); len(matches) == 3 {
			return cleanMarkdownInline(matches[2])
		}
	}
	return strings.TrimSpace(fallback)
}

func detectPreparedSourceFormat(sourceName string, contentType string, input string) string {
	lowerName := strings.ToLower(strings.TrimSpace(sourceName))
	lowerType := strings.ToLower(strings.TrimSpace(contentType))
	switch {
	case strings.Contains(lowerType, "markdown") || strings.HasSuffix(lowerName, ".md") || strings.HasSuffix(lowerName, ".markdown"):
		return "markdown"
	case strings.Contains(lowerType, "html") || strings.HasSuffix(lowerName, ".html") || strings.HasSuffix(lowerName, ".htm"):
		return "html"
	case strings.HasSuffix(lowerName, ".csv") || strings.HasSuffix(lowerName, ".json") || strings.HasSuffix(lowerName, ".log"):
		return "structured"
	case strings.Contains(strings.TrimSpace(input), "\n# ") || strings.HasPrefix(strings.TrimSpace(input), "# "):
		return "markdown"
	default:
		return "plain"
	}
}

func markdownFirstHeading(input string) string {
	source := []byte(input)
	reader := text.NewReader(source)
	document := goldmark.New(
		goldmark.WithExtensions(extension.GFM),
		goldmark.WithParserOptions(parser.WithAutoHeadingID()),
	).Parser().Parse(reader)
	title := ""
	_ = ast.Walk(document, func(node ast.Node, entering bool) (ast.WalkStatus, error) {
		if title != "" || !entering {
			return ast.WalkContinue, nil
		}
		heading, ok := node.(*ast.Heading)
		if !ok || heading.Level > 3 {
			return ast.WalkContinue, nil
		}
		title = cleanMarkdownInline(string(heading.Text(source)))
		if title != "" {
			return ast.WalkStop, nil
		}
		return ast.WalkContinue, nil
	})
	return title
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func labelForBlock(kind NarrationBlockKind, text string) string {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return string(kind)
	}
	return truncateString(trimmed, 70)
}

func confidenceForBlock(kind NarrationBlockKind, mode NarrationSpeakMode) float64 {
	if mode == NarrationSpeakModeSkip {
		return 0.98
	}
	switch kind {
	case NarrationBlockKindTable:
		return 0.82
	case NarrationBlockKindDirective, NarrationBlockKindEmbedded:
		return 0.72
	}
	return 0.94
}

func countWords(text string) int {
	return len(strings.Fields(strings.TrimSpace(text)))
}

func hasWarning(warnings []string, warning string) bool {
	for _, item := range warnings {
		if item == warning {
			return true
		}
	}
	return false
}

func removeWarning(warnings []string, warning string) []string {
	if len(warnings) == 0 {
		return warnings
	}
	output := make([]string, 0, len(warnings))
	for _, item := range warnings {
		if item != warning {
			output = append(output, item)
		}
	}
	if len(output) == 0 {
		return nil
	}
	return output
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	output := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		output = append(output, value)
	}
	return output
}

func truncateString(value string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return strings.TrimSpace(string(runes[:maxRunes-1])) + "…"
}

func filenameFromURL(parsed *url.URL, contentType string) string {
	name := path.Base(parsed.Path)
	if name == "." || name == "/" || name == "" {
		name = "source"
	}
	if ext := filepath.Ext(name); ext == "" {
		if extensions, err := mime.ExtensionsByType(contentType); err == nil && len(extensions) > 0 {
			name += extensions[0]
		}
	}
	return name
}

func ensureFilenameExtension(name string, extension string) string {
	if strings.EqualFold(filepath.Ext(name), extension) {
		return name
	}
	return strings.TrimSuffix(name, filepath.Ext(name)) + extension
}

func progressTargetForPreparedSource(sourceID string) string {
	return "prepared:" + strings.TrimSpace(sourceID)
}

func progressTargetForBookScope(bookID string, scope *BookScope) string {
	parts := []string{"book", strings.TrimSpace(bookID)}
	if scope != nil {
		parts = append(parts, string(scope.Type), strconv.Itoa(scope.ChapterIndex), strconv.Itoa(scope.PageStart), strconv.Itoa(scope.PageEnd))
	}
	return strings.Join(parts, ":")
}

func jsonUnmarshal(data []byte, output any) error {
	decoder := jsonDecoder(bytes.NewReader(data))
	return decoder.Decode(output)
}

func jsonDecoder(reader io.Reader) interface{ Decode(any) error } {
	return json.NewDecoder(reader)
}
