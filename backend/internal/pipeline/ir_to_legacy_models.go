package pipeline

import (
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func PreparedSourceFromIR(document contentir.Document, source PreparedSource) PreparedSource {
	blocks := make([]NarrationBlock, 0, len(document.Nodes))
	for index, node := range document.Nodes {
		blocks = append(blocks, narrationBlockFromIRNode(node, index))
	}
	source.Blocks = blocks
	source.Metadata = map[string]any(document.Metadata)
	source.SpeechText = preparedSourceSpeechText(blocks)
	source.WordCount = countWords(source.SpeechText)
	source.BlockCount = len(blocks)
	source.SegmentCount = countPreparedSegments(blocks)
	source.Summary = summarizePreparedSource(blocks)
	return source
}

func BookSourceFromIR(document contentir.Document, book BookSource) BookSource {
	if document.SourceType == "bookSource" && nodesHavePDFLocators(document.Nodes) {
		return pdfBookSourceFromIR(document, book)
	}
	return chapterBookSourceFromIR(document, book)
}

func narrationBlockFromIRNode(node contentir.Node, index int) NarrationBlock {
	mode := NarrationSpeakMode(node.Speech.PolicyHint.Mode)
	if mode == "" {
		mode = NarrationSpeakModeSpeak
	}
	block := newNarrationBlock(
		index,
		NarrationBlockKind(node.Kind),
		mode,
		labelForBlock(NarrationBlockKind(node.Kind), node.DisplayText),
		node.DisplayText,
		node.SpeechText,
		node.Provenance.Offsets.Start,
		node.Provenance.Offsets.End,
		defaultSourcePrepSentenceMaxRunes,
	)
	block.ID = node.NodeID
	block.Warnings = contentIRStringSlice(node.Warnings)
	block.Confidence = node.Confidence
	block.Language = node.Lang
	block.Emphasis = node.Speech.PolicyHint.Emphasis
	block.PauseBeforeMS = node.Speech.PolicyHint.PauseBeforeMS
	block.PauseAfterMS = node.Speech.PolicyHint.PauseAfterMS
	block.Metadata = map[string]any(node.Metadata)
	block.SpeechPolicy = node.Speech.SpeechPolicy
	return block
}

func pdfBookSourceFromIR(document contentir.Document, book BookSource) BookSource {
	pages := make([]BookSourcePage, 0, len(document.Nodes))
	textParts := make([]string, 0, len(document.Nodes))
	for _, node := range document.Nodes {
		page := pageFromIRNode(node, len(pages)+1)
		pages = append(pages, page)
		textParts = append(textParts, page.Text)
	}
	book.Pages = pages
	book.Text = strings.Join(textParts, "\n\n")
	book.WordSpans = spansFromPages(pages)
	book.WordCount = len(book.WordSpans)
	book.PageCount = len(book.Pages)
	book.ChapterCount = countNarratableChapters(book.Chapters)
	return book
}

func chapterBookSourceFromIR(document contentir.Document, book BookSource) BookSource {
	chapters := make([]BookSourceChapter, 0, len(document.Nodes))
	textParts := make([]string, 0, len(document.Nodes))
	for _, node := range document.Nodes {
		chapter := chapterFromIRNode(node, len(chapters)+1)
		chapters = append(chapters, chapter)
		textParts = append(textParts, chapter.Text)
	}
	book.Chapters = chapters
	book.Text = strings.Join(textParts, "\n\n")
	book.WordSpans = spansFromChapters(chapters)
	book.WordCount = len(book.WordSpans)
	book.ChapterCount = countNarratableChapters(book.Chapters)
	book.Sections = sectionsFromChapters(book.Chapters)
	book.ReadingOrder = sectionReadingOrder(book.Sections)
	book.DefaultSectionID = firstNarratableSectionID(book.Sections)
	return book
}

func pageFromIRNode(node contentir.Node, fallbackIndex int) BookSourcePage {
	pageIndex := fallbackIndex
	if node.Provenance.Locator.PDF != nil {
		pageIndex = node.Provenance.Locator.PDF.PageIndex + 1
	}
	text := strings.TrimSpace(firstNonEmpty(node.SpeechText, node.DisplayText))
	return BookSourcePage{Index: pageIndex, Label: pageRangeLabel(pageIndex, pageIndex), Text: text, WordCount: countWords(text)}
}

func chapterFromIRNode(node contentir.Node, fallbackIndex int) BookSourceChapter {
	text := strings.TrimSpace(firstNonEmpty(node.SpeechText, node.DisplayText))
	return BookSourceChapter{
		Index:        fallbackIndex,
		ID:           node.NodeID,
		Title:        chapterTitle(firstLine(text), fallbackIndex),
		Text:         text,
		WordCount:    countWords(text),
		Role:         firstNonEmpty(node.Role, "body"),
		IsNarratable: strings.TrimSpace(text) != "" && node.Role != bookSectionRoleFrontmatter && node.Role != bookSectionRoleBackmatter,
		SourceHref:   htmlHrefFromIRNode(node),
	}
}

func spansFromPages(pages []BookSourcePage) []BookSourceWordSpan {
	spans := make([]BookSourceWordSpan, 0)
	offset := 0
	for index, page := range pages {
		if index > 0 {
			offset += 2
		}
		spans = append(spans, buildBookWordSpans(page.Text, page.Index, 0, offset)...)
		offset += len(page.Text)
	}
	return normalizeBookSpanIndexes(spans)
}

func spansFromChapters(chapters []BookSourceChapter) []BookSourceWordSpan {
	spans := make([]BookSourceWordSpan, 0)
	offset := 0
	for index, chapter := range chapters {
		if index > 0 {
			offset += 2
		}
		spans = append(spans, buildBookWordSpans(chapter.Text, 0, chapter.Index, offset)...)
		offset += len(chapter.Text)
	}
	return normalizeBookSpanIndexes(spans)
}

func nodesHavePDFLocators(nodes []contentir.Node) bool {
	for _, node := range nodes {
		if node.Provenance.Locator.PDF != nil {
			return true
		}
	}
	return false
}

func firstLine(value string) string {
	for _, line := range strings.Split(value, "\n") {
		if strings.TrimSpace(line) != "" {
			return strings.TrimSpace(line)
		}
	}
	return ""
}

func htmlHrefFromIRNode(node contentir.Node) string {
	if node.Provenance.Locator.HTML == nil {
		return ""
	}
	return node.Provenance.Locator.HTML.Href
}
