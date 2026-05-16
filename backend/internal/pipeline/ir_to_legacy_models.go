package pipeline

import (
	"encoding/json"
	"fmt"
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
	book.Title = firstNonEmpty(metadataValueString(document.Metadata, "title"), book.Title)
	book.Author = firstNonEmpty(
		metadataValueString(document.Metadata, "author"),
		metadataValueString(document.Metadata, "creator"),
		book.Author,
	)
	if document.SourceType == "bookSource" && nodesHavePDFLocators(document.Nodes) {
		return pdfBookSourceFromIR(document, book)
	}
	if sections := bookSectionsFromIRMetadata(document.Metadata); len(sections) > 0 {
		return structuredBookSourceFromIR(document, book, sections)
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
	book.Sections = sectionsFromPages(book.Pages, 2)
	book.StructureVersion = bookSourceStructureVersion
	book.ReadingOrder = sectionReadingOrder(book.Sections)
	book.DefaultSectionID = firstNarratableSectionID(book.Sections)
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

func structuredBookSourceFromIR(
	document contentir.Document,
	book BookSource,
	sections []BookSourceSection,
) BookSource {
	chapters := make([]BookSourceChapter, 0, len(sections))
	textParts := make([]string, 0, len(sections))
	for _, section := range sections {
		nodes := nodesForSection(document.Nodes, section.ID)
		if len(nodes) == 0 {
			continue
		}
		text := strings.TrimSpace(textFromIRNodes(nodes))
		if text == "" {
			continue
		}
		chapterIndex := section.ChapterIndex
		if chapterIndex <= 0 {
			chapterIndex = len(chapters) + 1
		}
		chapter := BookSourceChapter{
			Index:               chapterIndex,
			ID:                  firstNonEmpty(section.ID, nodes[0].NodeID),
			Title:               firstNonEmpty(section.Title, chapterTitle(firstLine(text), chapterIndex)),
			Text:                text,
			WordCount:           countWords(text),
			Role:                firstNonEmpty(section.Role, "body"),
			IsNarratable:        section.IsNarratable,
			SourceHref:          firstNonEmpty(section.SourceHref, htmlHrefFromIRNode(nodes[0])),
			EstimatedDurationMS: estimateBookDurationMS(countWords(text)),
		}
		chapters = append(chapters, chapter)
		textParts = append(textParts, text)
	}
	book.Chapters = chapters
	book.Text = strings.Join(textParts, "\n\n")
	book.WordSpans = spansFromChapters(chapters)
	book.WordCount = len(book.WordSpans)
	book.ChapterCount = countNarratableChapters(book.Chapters)
	book.Sections = normalizeIRBookSections(sections, chapters)
	book.StructureVersion = bookSourceStructureVersion
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

func textFromIRNodes(nodes []contentir.Node) string {
	parts := make([]string, 0, len(nodes))
	for _, node := range nodes {
		text := strings.TrimSpace(firstNonEmpty(node.SpeechText, node.DisplayText, node.NormalisedText))
		if text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n\n")
}

func nodesForSection(nodes []contentir.Node, sectionID string) []contentir.Node {
	filtered := make([]contentir.Node, 0)
	for _, node := range nodes {
		if metadataValueString(node.Metadata, "sectionId") == sectionID {
			filtered = append(filtered, node)
		}
	}
	return filtered
}

func bookSectionsFromIRMetadata(metadata contentir.Metadata) []BookSourceSection {
	raw, ok := metadata["sections"]
	if !ok {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	sections := make([]BookSourceSection, 0, len(items))
	for index, item := range items {
		value, ok := item.(map[string]any)
		if !ok {
			continue
		}
		section := BookSourceSection{
			ID:                  firstNonEmpty(metadataValueString(value, "id"), fmt.Sprintf("section-%04d", index+1)),
			Index:               metadataValueInt(value, "index", index),
			Title:               firstNonEmpty(metadataValueString(value, "title"), "Section"),
			Role:                firstNonEmpty(metadataValueString(value, "role"), "body"),
			IsNarratable:        metadataValueBool(value, "isNarratable", true),
			Kind:                firstNonEmpty(metadataValueString(value, "kind"), "chapter"),
			ChapterIndex:        metadataValueInt(value, "chapterIndex", index+1),
			PageStart:           metadataValueInt(value, "pageStart", 0),
			PageEnd:             metadataValueInt(value, "pageEnd", 0),
			SourceHref:          metadataValueString(value, "sourceHref"),
			WordCount:           metadataValueInt(value, "wordCount", 0),
			EstimatedDurationMS: metadataValueInt(value, "estimatedDurationMs", 0),
			Warnings:            metadataValueStringSlice(value, "warnings"),
		}
		sections = append(sections, section)
	}
	return sections
}

func normalizeIRBookSections(sections []BookSourceSection, chapters []BookSourceChapter) []BookSourceSection {
	chapterByID := map[string]BookSourceChapter{}
	for _, chapter := range chapters {
		chapterByID[chapter.ID] = chapter
	}
	normalized := make([]BookSourceSection, 0, len(sections))
	for index, section := range sections {
		chapter, ok := chapterByID[section.ID]
		if ok {
			section.ChapterIndex = chapter.Index
			section.WordCount = chapter.WordCount
			section.EstimatedDurationMS = chapter.EstimatedDurationMS
		}
		if section.Index < 0 {
			section.Index = index
		}
		normalized = append(normalized, section)
	}
	return normalized
}

func metadataValueString(metadata map[string]any, key string) string {
	if metadata == nil {
		return ""
	}
	value, ok := metadata[key]
	if !ok {
		return ""
	}
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	default:
		return ""
	}
}

func metadataValueInt(metadata map[string]any, key string, fallback int) int {
	if metadata == nil {
		return fallback
	}
	switch value := metadata[key].(type) {
	case int:
		return value
	case int64:
		return int(value)
	case float64:
		return int(value)
	case json.Number:
		parsed, err := value.Int64()
		if err == nil {
			return int(parsed)
		}
	}
	return fallback
}

func metadataValueBool(metadata map[string]any, key string, fallback bool) bool {
	if metadata == nil {
		return fallback
	}
	value, ok := metadata[key].(bool)
	if !ok {
		return fallback
	}
	return value
}

func metadataValueStringSlice(metadata map[string]any, key string) []string {
	raw, ok := metadata[key]
	if !ok {
		return nil
	}
	values, ok := raw.([]any)
	if !ok {
		return nil
	}
	output := make([]string, 0, len(values))
	for _, value := range values {
		if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
			output = append(output, strings.TrimSpace(text))
		}
	}
	return output
}
