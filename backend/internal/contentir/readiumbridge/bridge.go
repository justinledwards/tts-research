package readiumbridge

import (
	"fmt"
	"math"
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

// NewLocatorEnvelope wraps a public Content IR locator with the best-effort
// Readium locator projection used for bookmarks, playback resume, and deep-link
// handoff. The Content IR locator remains authoritative; Readium is carried as
// an interoperable view for clients that understand the Readium Web Publication
// locator shape.
func NewLocatorEnvelope(locator *contentir.Locator, context contentir.LocatorContext) contentir.LocatorEnvelope {
	kind := strings.TrimSpace(context.Kind)
	if kind == "" {
		kind = "resume"
	}
	envelope := contentir.LocatorEnvelope{
		SchemaVersion:   contentir.LocatorEnvelopeVersion,
		Kind:            kind,
		SourceID:        strings.TrimSpace(context.SourceID),
		NodeID:          strings.TrimSpace(context.NodeID),
		ScopeKey:        strings.TrimSpace(context.ScopeKey),
		ActiveWordIndex: context.ActiveWordIndex,
		Locator:         locator,
		TextQuote:       strings.TrimSpace(context.TextQuote),
	}
	if locator != nil {
		readium := ExportReadiumLocator(*locator, context)
		if readium.Href != "" && readium.Type != "" {
			envelope.Readium = &readium
		}
	}
	return envelope
}

// ExportReadiumLocator maps a standards-facing Content IR locator to a Readium
// locator without changing the ingestion surface. EPUB/XHTML, HTML, PDF,
// DOCX, Markdown, and OCR/image locators keep their native anchors where
// Readium has an equivalent href, media type, progression, fragment, or
// position field.
func ExportReadiumLocator(locator contentir.Locator, context contentir.LocatorContext) contentir.ReadiumLocator {
	textQuote := strings.TrimSpace(firstNonEmpty(context.TextQuote, locatorTextQuote(locator)))
	output := contentir.ReadiumLocator{
		Title: strings.TrimSpace(context.Title),
		Text:  readiumText(context.TextBefore, textQuote, context.TextAfter),
	}
	if context.Position > 0 {
		output.Locations.Position = context.Position
	}
	if context.TotalProgression != nil {
		output.Locations.TotalProgression = context.TotalProgression
	}

	switch strings.TrimSpace(locator.Type) {
	case "epub":
		epub := effectiveEPUBLocator(locator)
		if epub == nil {
			return contentir.ReadiumLocator{}
		}
		output.Href = epub.Href
		output.Type = "application/xhtml+xml"
		output.Locations.Progression = epub.Progression
		if strings.TrimSpace(epub.Fragment) != "" {
			output.Locations.Fragments = append(output.Locations.Fragments, epub.Fragment)
			output.Locations.CSSSelector = "#" + epub.Fragment
		}
		if partial := partialCFI(epub.EPUBCFI); partial != "" {
			output.Locations.PartialCFI = partial
		}
	case "html":
		if locator.HTML == nil {
			return contentir.ReadiumLocator{}
		}
		output.Href = locator.HTML.Href
		output.Type = "text/html"
		output.Locations.Progression = locator.HTML.Progression
		if strings.TrimSpace(locator.HTML.Fragment) != "" {
			output.Locations.Fragments = []string{locator.HTML.Fragment}
			output.Locations.CSSSelector = "#" + locator.HTML.Fragment
		}
	case "pdf":
		if locator.PDF == nil {
			return contentir.ReadiumLocator{}
		}
		output.Href = firstNonEmpty(context.SourceID, "document.pdf")
		output.Type = "application/pdf"
		page := locator.PDF.PageIndex + 1
		output.Title = firstNonEmpty(output.Title, "Page "+strconv.Itoa(page))
		output.Locations.Fragments = []string{"page=" + strconv.Itoa(page)}
		if locator.PDF.BBox != nil {
			bbox := locator.PDF.BBox
			output.Locations.Fragments = append(output.Locations.Fragments, fmt.Sprintf("viewrect=%s,%s,%s,%s",
				readiumNumber(bbox.X), readiumNumber(bbox.Y), readiumNumber(bbox.Width), readiumNumber(bbox.Height)))
		}
		output.Locations.Position = firstPositive(context.Position, page)
	case "ocr":
		if locator.OCR == nil {
			return contentir.ReadiumLocator{}
		}
		page := locator.OCR.PageIndex + 1
		output.Href = firstNonEmpty(context.SourceID, "image-set")
		output.Type = "image/*"
		output.Title = firstNonEmpty(output.Title, "Page "+strconv.Itoa(page))
		output.Locations.Fragments = []string{"page=" + strconv.Itoa(page)}
		output.Locations.Position = firstPositive(context.Position, page)
	case "markdown":
		if locator.Markdown == nil {
			return contentir.ReadiumLocator{}
		}
		output.Href = locator.Markdown.Path
		output.Type = "text/markdown"
		output.Locations.Fragments = []string{"line=" + strconv.Itoa(locator.Markdown.LineStart)}
		output.Locations.Position = firstPositive(context.Position, locator.Markdown.LineStart)
	case "docx":
		if locator.DOCX == nil {
			return contentir.ReadiumLocator{}
		}
		output.Href = firstNonEmpty(context.SourceID, "document.docx")
		output.Type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		output.Locations.Fragments = []string{"paragraph=" + strconv.Itoa(locator.DOCX.ParagraphIndex+1)}
		output.Locations.Position = firstPositive(context.Position, locator.DOCX.ParagraphIndex+1)
	default:
		return contentir.ReadiumLocator{}
	}
	return output
}

// ImportReadiumLocator converts a Readium locator back into the closest public
// Content IR locator. The import path is intentionally conservative: it
// restores stable document anchors and page/paragraph/line positions, while
// leaving unsupported Readium metadata out of the Content IR locator.
func ImportReadiumLocator(readium contentir.ReadiumLocator) contentir.Locator {
	mediaType := strings.ToLower(strings.TrimSpace(readium.Type))
	href := strings.TrimSpace(readium.Href)
	fragment := ""
	if len(readium.Locations.Fragments) > 0 {
		fragment = strings.TrimSpace(readium.Locations.Fragments[0])
	}
	textQuote := ""
	if readium.Text != nil {
		textQuote = strings.TrimSpace(readium.Text.Highlight)
	}
	switch {
	case strings.Contains(mediaType, "epub") || strings.Contains(mediaType, "xhtml"):
		return contentir.NewPublicEPUBLocator(href, cleanFragment(fragment), textQuote, readium.Locations.Progression, readium.Locations.PartialCFI, "")
	case strings.Contains(mediaType, "html"):
		return contentir.NewHTMLLocator(href, cleanFragment(fragment), textQuote, readium.Locations.Progression, "")
	case strings.Contains(mediaType, "pdf"):
		return contentir.NewPDFLocator(indexFromFragment(fragment, "page"), nil, nil, nil)
	case strings.Contains(mediaType, "image"):
		return contentir.NewOCRLocator(indexFromFragment(fragment, "page"), nil, "", 0)
	case strings.Contains(mediaType, "markdown"):
		line := indexFromFragment(fragment, "line") + 1
		return contentir.NewMarkdownLocator(href, line, line, 1, 1, "")
	case strings.Contains(mediaType, "wordprocessingml"):
		return contentir.NewDOCXLocator(indexFromFragment(fragment, "paragraph"), nil, "")
	default:
		return contentir.Locator{}
	}
}

// LocatorsMatch compares two Content IR locators at the durable resume-anchor
// level used by the bridge goldens. It ignores presentation-only Readium fields
// such as title text and focuses on the canonical href, fragment, page,
// paragraph, or line identity for each supported source kind.
func LocatorsMatch(left *contentir.Locator, right *contentir.Locator) bool {
	if left == nil || right == nil || left.Type != right.Type {
		return false
	}
	switch {
	case left.EPUB != nil || right.EPUB != nil:
		leftEPUB := effectiveEPUBLocator(*left)
		rightEPUB := effectiveEPUBLocator(*right)
		return leftEPUB != nil && rightEPUB != nil &&
			leftEPUB.Href == rightEPUB.Href &&
			leftEPUB.Fragment == rightEPUB.Fragment
	case left.HTML != nil || right.HTML != nil:
		return left.HTML != nil && right.HTML != nil &&
			left.HTML.Href == right.HTML.Href &&
			left.HTML.Fragment == right.HTML.Fragment
	case left.PDF != nil || right.PDF != nil:
		return left.PDF != nil && right.PDF != nil && left.PDF.PageIndex == right.PDF.PageIndex
	case left.OCR != nil || right.OCR != nil:
		return left.OCR != nil && right.OCR != nil && left.OCR.PageIndex == right.OCR.PageIndex
	case left.DOCX != nil || right.DOCX != nil:
		return left.DOCX != nil && right.DOCX != nil && left.DOCX.ParagraphIndex == right.DOCX.ParagraphIndex
	case left.Markdown != nil || right.Markdown != nil:
		return left.Markdown != nil && right.Markdown != nil &&
			left.Markdown.Path == right.Markdown.Path &&
			left.Markdown.LineStart == right.Markdown.LineStart
	default:
		return false
	}
}

func effectiveEPUBLocator(locator contentir.Locator) *contentir.EPUBLocator {
	if locator.EPUB != nil {
		return locator.EPUB
	}
	if locator.Type == "epub" && locator.HTML != nil {
		return &contentir.EPUBLocator{
			Href:        locator.HTML.Href,
			Fragment:    locator.HTML.Fragment,
			TextQuote:   locator.HTML.TextQuote,
			Progression: locator.HTML.Progression,
			EPUBCFI:     locator.HTML.EPUBCFI,
		}
	}
	return nil
}

func locatorTextQuote(locator contentir.Locator) string {
	switch {
	case locator.EPUB != nil:
		return locator.EPUB.TextQuote
	case locator.HTML != nil:
		return locator.HTML.TextQuote
	default:
		return ""
	}
}

func readiumText(before string, textQuote string, after string) *contentir.ReadiumText {
	before = strings.TrimSpace(before)
	textQuote = strings.TrimSpace(textQuote)
	after = strings.TrimSpace(after)
	if before == "" && textQuote == "" && after == "" {
		return nil
	}
	return &contentir.ReadiumText{
		Before:    before,
		Highlight: textQuote,
		After:     after,
	}
}

func partialCFI(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	trimmed = strings.TrimPrefix(trimmed, "epubcfi(")
	trimmed = strings.TrimSuffix(trimmed, ")")
	if index := strings.Index(trimmed, "!"); index >= 0 && index+1 < len(trimmed) {
		return trimmed[index+1:]
	}
	return trimmed
}

func indexFromFragment(fragment string, key string) int {
	value := strings.TrimSpace(fragment)
	value = strings.TrimPrefix(value, key+"=")
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0
	}
	return parsed - 1
}

func cleanFragment(fragment string) string {
	trimmed := strings.TrimSpace(fragment)
	if strings.Contains(trimmed, "=") {
		return ""
	}
	return strings.TrimPrefix(trimmed, "#")
}

func readiumNumber(value float64) string {
	if math.Trunc(value) == value {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}
