package contentir

import (
	"fmt"
	"math"
	"strconv"
	"strings"
)

const LocatorEnvelopeVersion = "locator-envelope.v1"

type ReadiumLocator struct {
	Href      string                 `json:"href"`
	Type      string                 `json:"type"`
	Title     string                 `json:"title,omitempty"`
	Locations ReadiumLocations       `json:"locations,omitempty"`
	Text      *ReadiumText           `json:"text,omitempty"`
	Metadata  map[string]interface{} `json:"metadata,omitempty"`
}

type ReadiumLocations struct {
	Fragments        []string `json:"fragments,omitempty"`
	Progression      *float64 `json:"progression,omitempty"`
	TotalProgression *float64 `json:"totalProgression,omitempty"`
	Position         int      `json:"position,omitempty"`
	CSSSelector      string   `json:"cssSelector,omitempty"`
	PartialCFI       string   `json:"partialCfi,omitempty"`
}

type ReadiumText struct {
	Before    string `json:"before,omitempty"`
	Highlight string `json:"highlight,omitempty"`
	After     string `json:"after,omitempty"`
}

type LocatorEnvelope struct {
	SchemaVersion   string          `json:"schemaVersion"`
	Kind            string          `json:"kind"`
	SourceID        string          `json:"sourceId"`
	NodeID          string          `json:"nodeId,omitempty"`
	ScopeKey        string          `json:"scopeKey,omitempty"`
	ActiveWordIndex int             `json:"activeWordIndex,omitempty"`
	Locator         *Locator        `json:"locator,omitempty"`
	Readium         *ReadiumLocator `json:"readium,omitempty"`
	TextQuote       string          `json:"textQuote,omitempty"`
}

type LocatorContext struct {
	Kind             string
	SourceID         string
	NodeID           string
	ScopeKey         string
	ActiveWordIndex  int
	Title            string
	TextQuote        string
	TotalProgression *float64
	Position         int
}

func NewLocatorEnvelope(locator *Locator, context LocatorContext) LocatorEnvelope {
	kind := strings.TrimSpace(context.Kind)
	if kind == "" {
		kind = "resume"
	}
	envelope := LocatorEnvelope{
		SchemaVersion:   LocatorEnvelopeVersion,
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

func ExportReadiumLocator(locator Locator, context LocatorContext) ReadiumLocator {
	textQuote := strings.TrimSpace(firstNonEmpty(context.TextQuote, locatorTextQuote(locator)))
	output := ReadiumLocator{
		Title: strings.TrimSpace(context.Title),
		Text:  readiumText(textQuote),
	}
	if context.Position > 0 {
		output.Locations.Position = context.Position
	}
	if context.TotalProgression != nil {
		output.Locations.TotalProgression = context.TotalProgression
	}

	switch strings.TrimSpace(locator.Type) {
	case "epub":
		epub := locator.EPUB
		if epub == nil && locator.HTML != nil {
			epub = &EPUBLocator{
				Href:        locator.HTML.Href,
				Fragment:    locator.HTML.Fragment,
				TextQuote:   locator.HTML.TextQuote,
				Progression: locator.HTML.Progression,
				EPUBCFI:     locator.HTML.EPUBCFI,
			}
		}
		if epub == nil {
			return ReadiumLocator{}
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
			return ReadiumLocator{}
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
			return ReadiumLocator{}
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
			return ReadiumLocator{}
		}
		page := locator.OCR.PageIndex + 1
		output.Href = firstNonEmpty(context.SourceID, "image-set")
		output.Type = "image/*"
		output.Title = firstNonEmpty(output.Title, "Page "+strconv.Itoa(page))
		output.Locations.Fragments = []string{"page=" + strconv.Itoa(page)}
		output.Locations.Position = firstPositive(context.Position, page)
	case "markdown":
		if locator.Markdown == nil {
			return ReadiumLocator{}
		}
		output.Href = locator.Markdown.Path
		output.Type = "text/markdown"
		output.Locations.Fragments = []string{"line=" + strconv.Itoa(locator.Markdown.LineStart)}
		output.Locations.Position = firstPositive(context.Position, locator.Markdown.LineStart)
	case "docx":
		if locator.DOCX == nil {
			return ReadiumLocator{}
		}
		output.Href = firstNonEmpty(context.SourceID, "document.docx")
		output.Type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
		output.Locations.Fragments = []string{"paragraph=" + strconv.Itoa(locator.DOCX.ParagraphIndex+1)}
		output.Locations.Position = firstPositive(context.Position, locator.DOCX.ParagraphIndex+1)
	default:
		return ReadiumLocator{}
	}
	return output
}

func ImportReadiumLocator(readium ReadiumLocator) Locator {
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
		return NewPublicEPUBLocator(href, cleanFragment(fragment), textQuote, readium.Locations.Progression, readium.Locations.PartialCFI, "")
	case strings.Contains(mediaType, "html"):
		return NewHTMLLocator(href, cleanFragment(fragment), textQuote, readium.Locations.Progression, "")
	case strings.Contains(mediaType, "pdf"):
		return NewPDFLocator(indexFromFragment(fragment, "page"), nil, nil, nil)
	case strings.Contains(mediaType, "markdown"):
		line := indexFromFragment(fragment, "line") + 1
		return NewMarkdownLocator(href, line, line, 1, 1, "")
	case strings.Contains(mediaType, "wordprocessingml"):
		return NewDOCXLocator(indexFromFragment(fragment, "paragraph"), nil, "")
	default:
		return Locator{}
	}
}

func LocatorsMatch(left *Locator, right *Locator) bool {
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

func effectiveEPUBLocator(locator Locator) *EPUBLocator {
	if locator.EPUB != nil {
		return locator.EPUB
	}
	if locator.Type == "epub" && locator.HTML != nil {
		return &EPUBLocator{
			Href:        locator.HTML.Href,
			Fragment:    locator.HTML.Fragment,
			TextQuote:   locator.HTML.TextQuote,
			Progression: locator.HTML.Progression,
			EPUBCFI:     locator.HTML.EPUBCFI,
		}
	}
	return nil
}

func locatorTextQuote(locator Locator) string {
	switch {
	case locator.EPUB != nil:
		return locator.EPUB.TextQuote
	case locator.HTML != nil:
		return locator.HTML.TextQuote
	default:
		return ""
	}
}

func readiumText(textQuote string) *ReadiumText {
	if strings.TrimSpace(textQuote) == "" {
		return nil
	}
	return &ReadiumText{Highlight: strings.TrimSpace(textQuote)}
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
