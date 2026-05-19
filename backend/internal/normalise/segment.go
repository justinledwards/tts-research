package normalise

import (
	"strings"
	"unicode/utf8"
)

type Segment struct {
	Index       int    `json:"index"`
	Text        string `json:"text"`
	StartOffset int    `json:"startOffset"`
	EndOffset   int    `json:"endOffset"`
	Lang        string `json:"lang"`
	Locale      string `json:"locale"`
}

func SegmentText(text string, maxRunes int, spans []LanguageSpan, locale string) []Segment {
	clean := strings.TrimSpace(text)
	if clean == "" {
		return nil
	}
	if maxRunes <= 0 {
		maxRunes = 300
	}
	locale = NormalizeLocale(locale)
	pieces := sentencePieces(clean)
	segments := make([]Segment, 0, len(pieces))
	cursor := 0
	for _, piece := range pieces {
		piece = strings.TrimSpace(piece)
		if piece == "" {
			continue
		}
		start := strings.Index(clean[cursor:], piece)
		if start < 0 {
			start = cursor
		} else {
			start += cursor
		}
		end := start + len(piece)
		for utf8.RuneCountInString(piece) > maxRunes {
			cut := runeCutIndex(piece, maxRunes)
			left := strings.TrimSpace(piece[:cut])
			if left != "" {
				segments = append(segments, newSegment(len(segments)+1, left, start, start+len(left), spans, locale))
			}
			piece = strings.TrimSpace(piece[cut:])
			start = end - len(piece)
		}
		if piece != "" {
			segments = append(segments, newSegment(len(segments)+1, piece, start, end, spans, locale))
		}
		cursor = end
	}
	return segments
}

func newSegment(index int, text string, start int, end int, spans []LanguageSpan, locale string) Segment {
	return Segment{
		Index:       index,
		Text:        text,
		StartOffset: start,
		EndOffset:   end,
		Lang:        languageAtOffset(spans, start, LocaleLanguage(locale)),
		Locale:      locale,
	}
}

func languageAtOffset(spans []LanguageSpan, offset int, fallback string) string {
	for _, span := range spans {
		if offset >= span.StartOffset && offset < span.EndOffset {
			return NormalizeLanguage(span.Lang)
		}
	}
	if fallback == "" {
		return DefaultLang
	}
	return NormalizeLanguage(fallback)
}

func sentencePieces(text string) []string {
	pieces := make([]string, 0)
	start := 0
	for offset, value := range text {
		if value == '.' || value == '!' || value == '?' || value == '\n' {
			end := offset + len(string(value))
			pieces = append(pieces, text[start:end])
			start = end
		}
	}
	if start < len(text) {
		pieces = append(pieces, text[start:])
	}
	return pieces
}

func runeCutIndex(text string, maxRunes int) int {
	count := 0
	lastSpace := -1
	for offset, value := range text {
		if value == ' ' || value == '\t' {
			lastSpace = offset
		}
		count++
		if count >= maxRunes {
			if lastSpace > 0 {
				return lastSpace
			}
			return offset + len(string(value))
		}
	}
	return len(text)
}
