package contentir

type Locator struct {
	Type     string           `json:"type"`
	Markdown *MarkdownLocator `json:"markdown,omitempty"`
	HTML     *HTMLLocator     `json:"html,omitempty"`
	PDF      *PDFLocator      `json:"pdf,omitempty"`
	DOCX     *DOCXLocator     `json:"docx,omitempty"`
	OCR      *OCRLocator      `json:"ocr,omitempty"`
}

type MarkdownLocator struct {
	Path        string `json:"path"`
	LineStart   int    `json:"lineStart"`
	LineEnd     int    `json:"lineEnd"`
	ColumnStart int    `json:"columnStart"`
	ColumnEnd   int    `json:"columnEnd"`
	ASTPath     string `json:"astPath"`
}

type HTMLLocator struct {
	Href        string   `json:"href"`
	Fragment    string   `json:"fragment"`
	TextQuote   string   `json:"textQuote,omitempty"`
	Progression *float64 `json:"progression,omitempty"`
	EPUBCFI     string   `json:"epubCfi,omitempty"`
}

type PDFLocator struct {
	PageIndex         int     `json:"pageIndex"`
	BBox              *BBox   `json:"bbox,omitempty"`
	Polygon           []Point `json:"polygon,omitempty"`
	ReadingOrderIndex *int    `json:"readingOrderIndex,omitempty"`
}

type DOCXLocator struct {
	ParagraphIndex int    `json:"paragraphIndex"`
	RunIndex       *int   `json:"runIndex,omitempty"`
	BookmarkID     string `json:"bookmarkId,omitempty"`
}

type OCRLocator struct {
	PageIndex     int     `json:"pageIndex"`
	Polygon       []Point `json:"polygon"`
	OCREngine     string  `json:"ocrEngine"`
	OCRConfidence float64 `json:"ocrConfidence"`
}

type BBox struct {
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

type Point struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

func NewMarkdownLocator(
	path string,
	lineStart int,
	lineEnd int,
	columnStart int,
	columnEnd int,
	astPath string,
) Locator {
	return Locator{
		Type: "markdown",
		Markdown: &MarkdownLocator{
			Path:        path,
			LineStart:   lineStart,
			LineEnd:     lineEnd,
			ColumnStart: columnStart,
			ColumnEnd:   columnEnd,
			ASTPath:     astPath,
		},
	}
}

func NewHTMLLocator(href string, fragment string, textQuote string, progression *float64, epubCFI string) Locator {
	return Locator{
		Type: "html",
		HTML: &HTMLLocator{
			Href:        href,
			Fragment:    fragment,
			TextQuote:   textQuote,
			Progression: progression,
			EPUBCFI:     epubCFI,
		},
	}
}

func NewEPUBLocator(href string, fragment string, textQuote string, progression *float64, epubCFI string) Locator {
	locator := NewHTMLLocator(href, fragment, textQuote, progression, epubCFI)
	locator.Type = "epub"
	return locator
}

func NewPDFLocator(pageIndex int, bbox *BBox, polygon []Point, readingOrderIndex *int) Locator {
	return Locator{
		Type: "pdf",
		PDF: &PDFLocator{
			PageIndex:         pageIndex,
			BBox:              bbox,
			Polygon:           polygon,
			ReadingOrderIndex: readingOrderIndex,
		},
	}
}

func NewDOCXLocator(paragraphIndex int, runIndex *int, bookmarkID string) Locator {
	return Locator{
		Type: "docx",
		DOCX: &DOCXLocator{
			ParagraphIndex: paragraphIndex,
			RunIndex:       runIndex,
			BookmarkID:     bookmarkID,
		},
	}
}

func NewOCRLocator(pageIndex int, polygon []Point, ocrEngine string, ocrConfidence float64) Locator {
	return Locator{
		Type: "ocr",
		OCR: &OCRLocator{
			PageIndex:     pageIndex,
			Polygon:       polygon,
			OCREngine:     ocrEngine,
			OCRConfidence: ocrConfidence,
		},
	}
}
