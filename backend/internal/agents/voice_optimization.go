package agents

import (
	"context"
	"regexp"
	"strings"
)

const VoiceOptimizationPrompt = `You are a voice optimization agent. You take inputs from research agents and output high quality and accurate text for a Text to Speech agent.
Your job is to replace tricky characters, measurements, formulas, or codeblocks, and rewrite text to flow in a more natural way when spoken out loud.
There are many tricky words, acronyms, onomatopoeic sounds, or regional variants that can just be avoided by writing in a better way so the TTS is less jarring.`

type VoiceOptimizationAgent struct{}

func NewVoiceOptimizationAgent() *VoiceOptimizationAgent {
	return &VoiceOptimizationAgent{}
}

func (agent *VoiceOptimizationAgent) Optimize(_ context.Context, input string) (string, error) {
	normalized := strings.TrimSpace(input)
	normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
	normalized = normalizeMarkdownForSpeech(normalized)
	normalized = whitespacePattern.ReplaceAllString(normalized, " ")

	return strings.TrimSpace(normalized), nil
}

func (agent *VoiceOptimizationAgent) ProviderName() string {
	return "rules"
}

var (
	codeFencePattern       = regexp.MustCompile("(?s)```.*?```")
	imagePattern           = regexp.MustCompile(`!\[([^\]]*)\]\([^)]+\)`)
	linkPattern            = regexp.MustCompile(`\[([^\]]+)\]\([^)]+\)`)
	htmlTagPattern         = regexp.MustCompile(`<[^>]+>`)
	headingPattern         = regexp.MustCompile(`^#{1,6}\s+(.+)$`)
	blockquotePattern      = regexp.MustCompile(`^>\s?(.+)$`)
	bulletPattern          = regexp.MustCompile(`^[-*+]\s+(.+)$`)
	numberedListPattern    = regexp.MustCompile(`^\d+[.)]\s+(.+)$`)
	horizontalRulePattern  = regexp.MustCompile(`^[-*_]{3,}$`)
	tableDividerPattern    = regexp.MustCompile(`^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$`)
	inlineCodePattern      = regexp.MustCompile("`([^`]+)`")
	markdownMarkerReplacer = strings.NewReplacer("**", "", "__", "", "*", "", "_", "", "~~", "")
	whitespacePattern      = regexp.MustCompile(`\s+`)
)

func normalizeMarkdownForSpeech(input string) string {
	normalized := codeFencePattern.ReplaceAllString(input, "\ncode sample omitted for spoken playback.\n")
	normalized = imagePattern.ReplaceAllString(normalized, "$1")
	normalized = linkPattern.ReplaceAllString(normalized, "$1")
	normalized = htmlTagPattern.ReplaceAllString(normalized, " ")
	normalized = inlineCodePattern.ReplaceAllString(normalized, "$1")

	lines := strings.Split(normalized, "\n")
	spokenLines := make([]string, 0, len(lines))
	for _, line := range lines {
		spoken := normalizeMarkdownLineForSpeech(line)
		if spoken == "" {
			continue
		}
		spokenLines = append(spokenLines, spoken)
	}
	return joinSpeechLines(spokenLines)
}

func normalizeMarkdownLineForSpeech(line string) string {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || horizontalRulePattern.MatchString(trimmed) || tableDividerPattern.MatchString(trimmed) {
		return ""
	}
	trimmed = headingPattern.ReplaceAllString(trimmed, "$1")
	trimmed = blockquotePattern.ReplaceAllString(trimmed, "$1")
	trimmed = bulletPattern.ReplaceAllString(trimmed, "$1")
	trimmed = numberedListPattern.ReplaceAllString(trimmed, "$1")
	trimmed = markdownMarkerReplacer.Replace(trimmed)
	if strings.Contains(trimmed, "|") {
		return normalizeMarkdownTableRow(trimmed)
	}
	return strings.TrimSpace(trimmed)
}

func normalizeMarkdownTableRow(row string) string {
	cells := strings.Split(strings.Trim(row, "| "), "|")
	spokenCells := make([]string, 0, len(cells))
	for _, cell := range cells {
		spokenCell := strings.TrimSpace(markdownMarkerReplacer.Replace(cell))
		if spokenCell != "" {
			spokenCells = append(spokenCells, spokenCell)
		}
	}
	return strings.Join(spokenCells, ", ")
}

func joinSpeechLines(lines []string) string {
	var builder strings.Builder
	for _, line := range lines {
		if builder.Len() > 0 {
			if endsWithTerminalPunctuation(builder.String()) {
				builder.WriteString(" ")
			} else {
				builder.WriteString(". ")
			}
		}
		builder.WriteString(line)
	}
	return builder.String()
}

func endsWithTerminalPunctuation(value string) bool {
	value = strings.TrimSpace(value)
	return strings.HasSuffix(value, ".") ||
		strings.HasSuffix(value, "!") ||
		strings.HasSuffix(value, "?") ||
		strings.HasSuffix(value, ";") ||
		strings.HasSuffix(value, ":")
}
