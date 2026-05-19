package highlightmap

import (
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/contentir/readiumbridge"
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
	BookSourceID    string                     `json:"bookSourceId,omitempty"`
	ScopeKey        string                     `json:"scopeKey,omitempty"`
	ActiveWordIndex int                        `json:"activeWordIndex,omitempty"`
	Locator         *contentir.Locator         `json:"locator,omitempty"`
	LocatorEnvelope *contentir.LocatorEnvelope `json:"locatorEnvelope,omitempty"`
	TextQuote       string                     `json:"textQuote,omitempty"`
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
		position.LocatorEnvelope = contentirLocatorEnvelope(position, "highlight")
		return position
	}
	position.ActiveWordIndex = max(0, tokenIndex)
	position.LocatorEnvelope = contentirLocatorEnvelope(position, "highlight")
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
	return readiumbridge.LocatorsMatch(position.Locator, locator)
}

func contentirLocatorEnvelope(position ReadingPosition, kind string) *contentir.LocatorEnvelope {
	envelope := readiumbridge.NewLocatorEnvelope(position.Locator, contentir.LocatorContext{
		Kind:            kind,
		SourceID:        position.BookSourceID,
		ScopeKey:        position.ScopeKey,
		ActiveWordIndex: position.ActiveWordIndex,
		TextQuote:       position.TextQuote,
	})
	return &envelope
}
