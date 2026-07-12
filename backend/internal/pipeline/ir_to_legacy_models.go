package pipeline

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
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
	source = sanitizePreparedSourceReferenceCueLeaks(source, defaultSourcePrepSentenceMaxRunes)
	source.SpeechText = preparedSourceSpeechText(source.Blocks)
	source.WordCount = countWords(source.SpeechText)
	source.BlockCount = len(source.Blocks)
	source.SegmentCount = countPreparedSegments(source.Blocks)
	source.Summary = summarizePreparedSource(source.Blocks)
	return source
}

func BookSourceFromIR(document contentir.Document, book BookSource) BookSource {
	book.Title = firstNonEmpty(metadataValueString(document.Metadata, "title"), book.Title)
	book.Author = firstNonEmpty(
		metadataValueString(document.Metadata, "author"),
		metadataValueString(document.Metadata, "creator"),
		book.Author,
	)
	book.Ingestion = ingestionDiagnosticsFromIRMetadata(document.Metadata)
	book.Warnings = uniqueStrings(append(metadataValueStringSlice(document.Metadata, "warnings"), nodeWarnings(document.Nodes)...))
	var next BookSource
	if document.SourceType == "bookSource" && nodesHavePageLocators(document.Nodes) {
		next = pagedBookSourceFromIR(document, book)
	} else if sections := bookSectionsFromIRMetadata(document.Metadata); len(sections) > 0 {
		next = structuredBookSourceFromIR(document, book, sections)
	} else {
		next = chapterBookSourceFromIR(document, book)
	}
	if next.Kind == BookSourceKindPDF {
		next.Warnings = uniqueStrings(append(next.Warnings, pdfExtractionQualityWarnings(next.Text)...))
	}
	return next
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

func pagedBookSourceFromIR(document contentir.Document, book BookSource) BookSource {
	nodesByPage := map[int][]contentir.Node{}
	pageIndexes := make([]int, 0)
	for _, node := range document.Nodes {
		pageIndex := pageIndexFromIRNode(node)
		if _, ok := nodesByPage[pageIndex]; !ok {
			pageIndexes = append(pageIndexes, pageIndex)
		}
		nodesByPage[pageIndex] = append(nodesByPage[pageIndex], node)
	}
	sort.Ints(pageIndexes)
	pages := make([]BookSourcePage, 0, len(pageIndexes))
	textParts := make([]string, 0, len(pageIndexes))
	for _, pageIndex := range pageIndexes {
		page := pageFromIRNodes(nodesByPage[pageIndex], pageIndex)
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

func pageFromIRNodes(nodes []contentir.Node, pageIndex int) BookSourcePage {
	text := strings.TrimSpace(textFromIRNodes(nodes))
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

func nodesHavePageLocators(nodes []contentir.Node) bool {
	for _, node := range nodes {
		if node.Provenance.Locator.PDF != nil || node.Provenance.Locator.OCR != nil {
			return true
		}
	}
	return false
}

func pageIndexFromIRNode(node contentir.Node) int {
	if node.Provenance.Locator.PDF != nil {
		return node.Provenance.Locator.PDF.PageIndex + 1
	}
	if node.Provenance.Locator.OCR != nil {
		return node.Provenance.Locator.OCR.PageIndex + 1
	}
	return metadataValueInt(node.Metadata, "pageIndex", 1)
}

func nodeWarnings(nodes []contentir.Node) []string {
	warnings := make([]string, 0)
	for _, node := range nodes {
		warnings = append(warnings, node.Warnings...)
	}
	return warnings
}

var (
	pdfLikelySplitWordPattern = regexp.MustCompile(`(?i)\b[a-z]{3,}\s+[a-z]\b`)
	pdfLikelyFusedWordPattern = regexp.MustCompile(`\b[a-z]{12,}[A-Z][A-Za-z]*\b`)
)

func pdfExtractionQualityWarnings(text string) []string {
	warnings := make([]string, 0, 2)
	if len(pdfLikelySplitWordPattern.FindAllString(text, 24)) >= 20 {
		warnings = append(warnings, "PDF text extraction may contain split words; Book Cinema will prefer word-span text when rendering highlights.")
	}
	if len(pdfLikelyFusedWordPattern.FindAllString(text, 8)) >= 4 {
		warnings = append(warnings, "PDF text extraction may contain fused words; inspect the source text before trusting spoken form.")
	}
	return warnings
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
	if node.Provenance.Locator.EPUB != nil {
		return node.Provenance.Locator.EPUB.Href
	}
	if node.Provenance.Locator.HTML != nil {
		return node.Provenance.Locator.HTML.Href
	}
	return ""
}

func textFromIRNodes(nodes []contentir.Node) string {
	parts := make([]string, 0, len(nodes))
	for _, node := range nodes {
		if (node.Kind == "bibliography" || node.Kind == "citation") && strings.TrimSpace(node.SpeechText) == "" {
			continue
		}
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
	var items []any
	switch typed := raw.(type) {
	case []any:
		items = typed
	case []map[string]any:
		items = make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, item)
		}
	case []BookSourceSection:
		sections := make([]BookSourceSection, len(typed))
		copy(sections, typed)
		return sections
	default:
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

func ingestionDiagnosticsFromIRMetadata(metadata contentir.Metadata) *IngestionDiagnostics {
	if metadata == nil {
		return nil
	}
	supportTier := metadataValueString(metadata, "supportTier")
	if supportTier == "" {
		return nil
	}
	return &IngestionDiagnostics{
		SupportTier:      supportTier,
		SupportTierLabel: metadataValueString(metadata, "supportTierLabel"),
		Confidence:       metadataValueFloat(metadata, "confidence", 0),
		ImportProfile:    metadataValueString(metadata, "importProfile"),
		PDFTableMode:     metadataValueString(metadata, "pdfTableMode"),
		ExtractorChain:   extractorChainFromIRMetadata(metadata),
		Warnings:         metadataValueStringSlice(metadata, "warnings"),
	}
}

func extractorChainFromIRMetadata(metadata contentir.Metadata) []ExtractorChainStep {
	raw, ok := metadata["extractorChain"]
	if !ok {
		return nil
	}
	items, ok := raw.([]any)
	if !ok {
		return nil
	}
	steps := make([]ExtractorChainStep, 0, len(items))
	for _, item := range items {
		value, ok := item.(map[string]any)
		if !ok {
			continue
		}
		steps = append(steps, ExtractorChainStep{
			ID:         metadataValueString(value, "id"),
			Label:      metadataValueString(value, "label"),
			Status:     metadataValueString(value, "status"),
			Confidence: metadataValueFloat(value, "confidence", 0),
			Warnings:   metadataValueStringSlice(value, "warnings"),
		})
	}
	return steps
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

func metadataValueFloat(metadata map[string]any, key string, fallback float64) float64 {
	if metadata == nil {
		return fallback
	}
	switch value := metadata[key].(type) {
	case float64:
		return value
	case float32:
		return float64(value)
	case int:
		return float64(value)
	case int64:
		return float64(value)
	case json.Number:
		parsed, err := value.Float64()
		if err == nil {
			return parsed
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
