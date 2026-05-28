package pipeline

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

func resolveBookNarrationScope(book BookSource, requested *BookScope) (string, *BookScope, error) {
	if requested == nil || requested.Type == "" || requested.Type == BookScopeTypeBook {
		scope := &BookScope{Type: BookScopeTypeBook, Label: "Full book"}
		return book.Text, scope, nil
	}
	switch requested.Type {
	case BookScopeTypeChapter:
		for _, chapter := range book.Chapters {
			if chapter.Index == requested.ChapterIndex {
				text := strings.TrimSpace(chapter.Text)
				if text == "" && chapter.PageStart > 0 && chapter.PageEnd >= chapter.PageStart {
					text = strings.TrimSpace(pagesText(book.Pages, chapter.PageStart, chapter.PageEnd))
				}
				if text == "" {
					return "", nil, fmt.Errorf("chapter %d has no readable text", requested.ChapterIndex)
				}
				scope := &BookScope{
					Type:         BookScopeTypeChapter,
					ChapterIndex: chapter.Index,
					Label:        chapter.Title,
				}
				if strings.TrimSpace(scope.Label) == "" {
					scope.Label = fmt.Sprintf("Chapter %d", chapter.Index)
				}
				return text, scope, nil
			}
		}
		return "", nil, fmt.Errorf("chapter %d was not found in book source", requested.ChapterIndex)
	case BookScopeTypePages:
		pageStart := requested.PageStart
		pageEnd := requested.PageEnd
		if pageStart <= 0 || pageEnd <= 0 || pageEnd < pageStart {
			return "", nil, fmt.Errorf("invalid PDF page range")
		}
		selectedPages := make([]BookSourcePage, 0, pageEnd-pageStart+1)
		for _, page := range book.Pages {
			if page.Index >= pageStart && page.Index <= pageEnd {
				selectedPages = append(selectedPages, page)
			}
		}
		if len(selectedPages) == 0 {
			return "", nil, fmt.Errorf("pages %d-%d were not found in book source", pageStart, pageEnd)
		}
		parts := make([]string, 0, len(selectedPages))
		for _, page := range selectedPages {
			if text := strings.TrimSpace(page.Text); text != "" {
				parts = append(parts, text)
			}
		}
		text := strings.Join(parts, "\n\n")
		if strings.TrimSpace(text) == "" {
			return "", nil, fmt.Errorf("pages %d-%d have no readable text", pageStart, pageEnd)
		}
		label := fmt.Sprintf("Pages %d-%d", pageStart, pageEnd)
		if pageStart == pageEnd {
			label = fmt.Sprintf("Page %d", pageStart)
		}
		return text, &BookScope{
			Type:      BookScopeTypePages,
			PageStart: pageStart,
			PageEnd:   pageEnd,
			Label:     label,
		}, nil
	default:
		return "", nil, fmt.Errorf("unsupported book narration scope: %s", requested.Type)
	}
}

func pagesText(pages []BookSourcePage, pageStart int, pageEnd int) string {
	parts := make([]string, 0, pageEnd-pageStart+1)
	for _, page := range pages {
		if page.Index >= pageStart && page.Index <= pageEnd {
			if text := strings.TrimSpace(page.Text); text != "" {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n\n")
}

func cloneBookScope(scope *BookScope) *BookScope {
	if scope == nil {
		return nil
	}
	cloned := *scope
	return &cloned
}

func cloneReadingPosition(position *ReadingPosition) *ReadingPosition {
	if position == nil {
		return nil
	}
	cloned := *position
	if position.Locator != nil {
		locator := *position.Locator
		cloned.Locator = &locator
	}
	if position.LocatorEnvelope != nil {
		envelope := *position.LocatorEnvelope
		cloned.LocatorEnvelope = &envelope
	}
	return &cloned
}

func summarizeBookSource(book BookSource) BookSource {
	book.Text = ""
	book.WordSpans = nil
	if len(book.Pages) > 0 {
		pages := make([]BookSourcePage, len(book.Pages))
		copy(pages, book.Pages)
		for index := range pages {
			pages[index].Text = ""
		}
		book.Pages = pages
	}
	if len(book.Chapters) > 0 {
		chapters := make([]BookSourceChapter, len(book.Chapters))
		copy(chapters, book.Chapters)
		for index := range chapters {
			chapters[index].Text = ""
		}
		book.Chapters = chapters
	}
	return book
}

func ensureBookStructureMetadata(book *BookSource) {
	if book == nil {
		return
	}
	if strings.TrimSpace(book.StructureVersion) == "" && (len(book.Chapters) > 0 || len(book.Pages) > 0) {
		book.StructureVersion = bookSourceStructureVersion
	}
	if len(book.Sections) == 0 {
		if len(book.Chapters) > 0 {
			book.Sections = sectionsFromChapters(book.Chapters)
		} else if len(book.Pages) > 0 {
			book.Sections = sectionsFromPages(book.Pages, 2)
		}
	}
	if len(book.ReadingOrder) == 0 && len(book.Sections) > 0 {
		book.ReadingOrder = make([]string, 0, len(book.Sections))
		for _, section := range book.Sections {
			book.ReadingOrder = append(book.ReadingOrder, section.ID)
		}
	}
	if strings.TrimSpace(book.DefaultSectionID) == "" {
		book.DefaultSectionID = firstNarratableSectionID(book.Sections)
	}
	if book.ChapterCount == 0 && len(book.Chapters) > 0 {
		book.ChapterCount = countNarratableChapters(book.Chapters)
	}
}

func sectionsFromChapters(chapters []BookSourceChapter) []BookSourceSection {
	sections := make([]BookSourceSection, 0, len(chapters))
	for _, chapter := range chapters {
		role := normalizeBookSectionRole(chapter.Role, chapter.Title, chapter.SourceHref)
		isNarratable := chapter.IsNarratable || role == bookSectionRoleBody
		id := strings.TrimSpace(chapter.ID)
		if id == "" {
			id = fmt.Sprintf("chapter-%d", chapter.Index)
		}
		sections = append(sections, BookSourceSection{
			ID:                  id,
			Index:               len(sections),
			Title:               chapterTitle(chapter.Title, chapter.Index),
			Role:                role,
			IsNarratable:        isNarratable,
			Kind:                "chapter",
			ChapterIndex:        chapter.Index,
			PageStart:           chapter.PageStart,
			PageEnd:             chapter.PageEnd,
			SourceHref:          chapter.SourceHref,
			WordCount:           chapter.WordCount,
			EstimatedDurationMS: estimateBookDurationMS(chapter.WordCount),
			Warnings:            chapter.Warnings,
		})
	}
	return sections
}

func sectionsFromPages(pages []BookSourcePage, spreadSize int) []BookSourceSection {
	if spreadSize <= 0 {
		spreadSize = 2
	}
	sections := make([]BookSourceSection, 0)
	for index := 0; index < len(pages); index += spreadSize {
		start := pages[index].Index
		end := pages[min(index+spreadSize-1, len(pages)-1)].Index
		wordCount := 0
		for _, page := range pages[index:min(index+spreadSize, len(pages))] {
			wordCount += page.WordCount
		}
		rangeText := pagesText(pages, start, end)
		isNarratable := wordCount > 0 && !looksLikePDFTableOfContents(rangeText)
		role := bookSectionRoleBody
		if !isNarratable && wordCount > 0 {
			role = bookSectionRoleFrontmatter
		}
		label := pageRangeLabel(start, end)
		sections = append(sections, BookSourceSection{
			ID:                  fmt.Sprintf("pages-%d-%d", start, end),
			Index:               len(sections),
			Title:               label,
			Role:                role,
			IsNarratable:        isNarratable,
			Kind:                "pages",
			PageStart:           start,
			PageEnd:             end,
			WordCount:           wordCount,
			EstimatedDurationMS: estimateBookDurationMS(wordCount),
		})
	}
	return sections
}

func firstNarratableSectionID(sections []BookSourceSection) string {
	for _, section := range sections {
		if section.IsNarratable {
			return section.ID
		}
	}
	if len(sections) > 0 {
		return sections[0].ID
	}
	return ""
}

func countNarratableChapters(chapters []BookSourceChapter) int {
	count := 0
	for _, chapter := range chapters {
		if chapter.IsNarratable || chapter.Role == "" {
			count++
		}
	}
	return count
}

func bookScopeSpans(book BookSource, scope *BookScope) []BookSourceWordSpan {
	if scope == nil {
		return book.WordSpans
	}
	spans := book.WordSpans
	switch scope.Type {
	case BookScopeTypeChapter:
		filtered := make([]BookSourceWordSpan, 0)
		for _, span := range spans {
			if span.Chapter == scope.ChapterIndex {
				filtered = append(filtered, span)
			}
		}
		return filtered
	case BookScopeTypePages:
		filtered := make([]BookSourceWordSpan, 0)
		for _, span := range spans {
			if span.PageIndex >= scope.PageStart && span.PageIndex <= scope.PageEnd {
				filtered = append(filtered, span)
			}
		}
		return filtered
	default:
		return spans
	}
}

func findBookSectionForScope(book BookSource, scope *BookScope) *BookSourceSection {
	if scope == nil {
		return nil
	}
	for _, section := range book.Sections {
		if scope.Type == BookScopeTypeChapter && section.ChapterIndex == scope.ChapterIndex {
			nextSection := section
			return &nextSection
		}
		if scope.Type == BookScopeTypePages &&
			section.PageStart == scope.PageStart &&
			section.PageEnd == scope.PageEnd {
			nextSection := section
			return &nextSection
		}
	}
	return nil
}

func estimateBookDurationMS(wordCount int) int {
	if wordCount <= 0 {
		return 0
	}
	const wordsPerMinute = 155
	return int(float64(wordCount) / wordsPerMinute * 60_000)
}

func chapterTitle(title string, index int) string {
	if strings.TrimSpace(title) != "" {
		return strings.TrimSpace(title)
	}
	return fmt.Sprintf("Chapter %d", index)
}

func pageRangeLabel(start int, end int) string {
	if start == end {
		return fmt.Sprintf("Page %d", start)
	}
	return fmt.Sprintf("Pages %d-%d", start, end)
}

func commandAvailable(commandName string) bool {
	_, err := exec.LookPath(commandName)
	return err == nil
}

func (service *Service) pythonPDFExtractorAvailable() bool {
	scriptPath, err := service.pdfAdapterCLIPath()
	if err != nil {
		return false
	}
	pythonPath := service.pdfAdapterPythonPath()
	command := exec.Command(pythonPath, scriptPath, "--check")
	return command.Run() == nil
}

func (service *Service) reloadBookSources() {
	baseDir, err := filepath.Abs(service.options.BookSourceDir)
	if err != nil {
		return
	}
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}

	books := make(map[string]storedBookSource)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), bookSourceMetadataFilename))
		if readErr != nil {
			continue
		}
		var book BookSource
		if err := jsonUnmarshalBook(metadataBytes, &book); err != nil {
			continue
		}
		if strings.TrimSpace(book.ID) == "" {
			continue
		}
		if strings.TrimSpace(book.ProjectID) == "" {
			book.ProjectID = defaultProjectID
		}
		if book.CreatedAt.IsZero() {
			book.CreatedAt = time.Now().UTC()
		}
		if book.UpdatedAt.IsZero() {
			book.UpdatedAt = book.CreatedAt
		}
		books[book.ID] = storedBookSource{BookSource: book}
	}

	service.mu.Lock()
	service.books = books
	service.mu.Unlock()
}

func (service *Service) updateBookSource(book storedBookSource) {
	service.mu.Lock()
	service.books[book.ID] = book
	service.mu.Unlock()
}

func (service *Service) writeBookSourceMetadata(book BookSource) error {
	outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, book.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, bookSourceMetadataFilename), book)
}

func (service *Service) importBundleBookSource(book BookSource, projectID string) error {
	now := time.Now().UTC()
	book.ID = newID()
	book.ProjectID = projectID
	book.CreatedAt = now
	book.UpdatedAt = now
	if book.Status == "" {
		book.Status = BookSourceStatusReady
	}
	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		return err
	}
	return service.writeBookSourceContentIR(book)
}

func (service *Service) removeProjectBookSources(projectID string) error {
	service.mu.RLock()
	bookIDs := make([]string, 0)
	for id, book := range service.books {
		if book.ProjectID == projectID {
			bookIDs = append(bookIDs, id)
		}
	}
	service.mu.RUnlock()

	for _, id := range bookIDs {
		outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, id))
		if err == nil {
			_ = os.RemoveAll(outputDir)
		}
		service.mu.Lock()
		delete(service.books, id)
		service.mu.Unlock()
	}
	return nil
}

func detectBookSourceKind(sourceFileName string) (BookSourceKind, error) {
	switch strings.ToLower(filepath.Ext(sourceFileName)) {
	case ".pdf":
		return BookSourceKindPDF, nil
	case ".epub":
		return BookSourceKindEPUB, nil
	case ".docx":
		return BookSourceKindDOCX, nil
	case ".md", ".markdown":
		return BookSourceKindMarkdown, nil
	case ".html", ".htm", ".zip":
		return BookSourceKindHTML, nil
	case ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp":
		return BookSourceKindImage, nil
	default:
		return "", fmt.Errorf("unsupported book source type; upload a PDF, EPUB, DOCX, Markdown, HTML, zipped HTML package, or image")
	}
}

func detectBookSourceKindFromUploads(uploads []BookSourceUpload) (BookSourceKind, error) {
	if len(uploads) == 0 {
		return "", fmt.Errorf("book source upload is required")
	}
	if len(uploads) == 1 {
		return detectBookSourceKind(uploads[0].Filename)
	}
	for _, upload := range uploads {
		kind, err := detectBookSourceKind(upload.Filename)
		if err != nil {
			return "", err
		}
		if kind != BookSourceKindImage {
			return "", fmt.Errorf("multiple book source files must be ordered images")
		}
	}
	return BookSourceKindImage, nil
}

func normalizeBookSourceImportOptions(options BookSourceImportOptions) BookSourceImportOptions {
	return BookSourceImportOptions{
		ImportProfile: normalizeBookImportProfile(options.ImportProfile),
		PDFTableMode:  normalizePDFTableMode(options.PDFTableMode),
	}
}

func normalizeBookImportProfile(profile BookImportProfile) BookImportProfile {
	switch profile {
	case BookImportProfileScholarly:
		return BookImportProfileScholarly
	default:
		return BookImportProfileAuto
	}
}

func normalizePDFTableMode(mode PDFTableMode) PDFTableMode {
	switch mode {
	case PDFTableModeOff, PDFTableModeStructured:
		return mode
	default:
		return PDFTableModeAuto
	}
}

func bookSourceUploadName(uploads []BookSourceUpload, kind BookSourceKind) string {
	if len(uploads) == 1 {
		return strings.TrimSpace(uploads[0].Filename)
	}
	if kind == BookSourceKindImage {
		return fmt.Sprintf("%d image pages", len(uploads))
	}
	return "Book source"
}

func bookSourceUploadBytes(uploads []BookSourceUpload) int64 {
	var total int64
	for _, upload := range uploads {
		total += upload.Bytes
	}
	return total
}

func storedBookSourceFilename(filename string, index int, total int) string {
	extension := strings.ToLower(filepath.Ext(filename))
	if extension == "" {
		extension = ".bin"
	}
	if total <= 1 {
		return "source" + extension
	}
	return fmt.Sprintf("source-%04d%s", index+1, extension)
}

func imageExtensionForContentType(contentType string) string {
	switch strings.ToLower(strings.TrimSpace(contentType)) {
	case "image/jpeg", "image/jpg":
		return ".jpg"
	case "image/tiff":
		return ".tiff"
	case "image/bmp":
		return ".bmp"
	case "image/webp":
		return ".webp"
	default:
		return ".png"
	}
}
