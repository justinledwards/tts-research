package highlightmap

import (
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

type WordSpan struct {
	Index       int    `json:"index"`
	Text        string `json:"text"`
	PageIndex   int    `json:"pageIndex,omitempty"`
	Chapter     int    `json:"chapter,omitempty"`
	StartOffset int    `json:"startOffset"`
	EndOffset   int    `json:"endOffset"`
}

type ReadingPosition struct {
	BookSourceID    string             `json:"bookSourceId,omitempty"`
	ScopeKey        string             `json:"scopeKey,omitempty"`
	ActiveWordIndex int                `json:"activeWordIndex,omitempty"`
	Locator         *contentir.Locator `json:"locator,omitempty"`
	TextQuote       string             `json:"textQuote,omitempty"`
}

func readingPositionForTiming(
	bookSourceID string,
	scopeKey string,
	text string,
	wordSpans []WordSpan,
	tokenIndex int,
) ReadingPosition {
	position := ReadingPosition{
		BookSourceID: strings.TrimSpace(bookSourceID),
		ScopeKey:     strings.TrimSpace(scopeKey),
		TextQuote:    strings.TrimSpace(text),
	}
	if tokenIndex >= 0 && tokenIndex < len(wordSpans) {
		span := wordSpans[tokenIndex]
		position.ActiveWordIndex = span.Index
		position.TextQuote = firstNonEmpty(span.Text, text)
		position.Locator = locatorForWordSpan(span)
		return position
	}
	position.ActiveWordIndex = max(0, tokenIndex)
	return position
}

func locatorForWordSpan(span WordSpan) *contentir.Locator {
	if span.PageIndex > 0 {
		locator := contentir.NewPDFLocator(span.PageIndex, nil, nil, nil)
		return &locator
	}
	if span.Chapter > 0 {
		progression := 0.0
		if span.StartOffset > 0 || span.EndOffset > 0 {
			progression = float64(span.StartOffset) / float64(max(1, span.EndOffset))
		}
		locator := contentir.NewHTMLLocator(
			"",
			"chapter-"+strconv.Itoa(span.Chapter),
			span.Text,
			&progression,
			"",
		)
		return &locator
	}
	return nil
}

func PositionMatchesLocator(position ReadingPosition, locator *contentir.Locator) bool {
	if locator == nil || position.Locator == nil {
		return false
	}
	if position.Locator.Type != locator.Type {
		return false
	}
	if locator.HTML != nil && position.Locator.HTML != nil {
		return position.Locator.HTML.Href == locator.HTML.Href &&
			position.Locator.HTML.Fragment == locator.HTML.Fragment
	}
	if locator.PDF != nil && position.Locator.PDF != nil {
		return position.Locator.PDF.PageIndex == locator.PDF.PageIndex
	}
	if locator.DOCX != nil && position.Locator.DOCX != nil {
		return position.Locator.DOCX.ParagraphIndex == locator.DOCX.ParagraphIndex
	}
	if locator.Markdown != nil && position.Locator.Markdown != nil {
		return position.Locator.Markdown.Path == locator.Markdown.Path &&
			position.Locator.Markdown.LineStart == locator.Markdown.LineStart
	}
	return false
}
