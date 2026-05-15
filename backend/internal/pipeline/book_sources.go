package pipeline

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

const bookSourceMetadataFilename = "book.json"

type bookSourceExtraction struct {
	title    string
	author   string
	text     string
	pages    []BookSourcePage
	chapters []BookSourceChapter
	spans    []BookSourceWordSpan
}

func (service *Service) CreateBookSource(
	ctx context.Context,
	projectID string,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
) (BookSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return BookSource{}, err
	}
	kind, err := detectBookSourceKind(sourceFileName)
	if err != nil {
		return BookSource{}, err
	}

	now := time.Now().UTC()
	bookID := newID()
	outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, bookID))
	if err != nil {
		return BookSource{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return BookSource{}, err
	}
	uploadPath := filepath.Join(outputDir, "source"+strings.ToLower(filepath.Ext(sourceFileName)))
	if err := copyFile(sourcePath, uploadPath); err != nil {
		return BookSource{}, fmt.Errorf("store book source: %w", err)
	}

	book := BookSource{
		ID:          bookID,
		ProjectID:   project.ID,
		Status:      BookSourceStatusReady,
		Kind:        kind,
		SourceFile:  strings.TrimSpace(sourceFileName),
		SourceBytes: sourceBytes,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	extraction, extractErr := extractBookSource(ctx, kind, uploadPath, sourceFileName)
	if extractErr != nil {
		book.Status = BookSourceStatusFailed
		book.Error = extractErr.Error()
	} else {
		book.Title = extraction.title
		book.Author = extraction.author
		book.Text = extraction.text
		book.Pages = extraction.pages
		book.Chapters = extraction.chapters
		book.WordSpans = extraction.spans
		book.WordCount = len(extraction.spans)
		book.PageCount = len(extraction.pages)
		book.ChapterCount = len(extraction.chapters)
	}

	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		return BookSource{}, err
	}
	return book, nil
}

func (service *Service) ListProjectBookSources(projectID string) ([]BookSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return nil, err
	}

	service.mu.RLock()
	books := make([]BookSource, 0)
	for _, book := range service.books {
		if book.ProjectID == project.ID {
			books = append(books, book.BookSource)
		}
	}
	service.mu.RUnlock()

	sort.SliceStable(books, func(left int, right int) bool {
		return books[left].UpdatedAt.After(books[right].UpdatedAt)
	})
	return books, nil
}

func (service *Service) GetBookSource(id string) (BookSource, error) {
	service.mu.RLock()
	book, ok := service.books[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return BookSource{}, ErrBookSourceNotFound
	}
	return book.BookSource, nil
}

func (service *Service) CreateBookNarrationJob(
	ctx context.Context,
	bookSourceID string,
	request CreateJobRequest,
) (VoiceJob, error) {
	book, err := service.GetBookSource(bookSourceID)
	if err != nil {
		return VoiceJob{}, err
	}
	if book.Status != BookSourceStatusReady || strings.TrimSpace(book.Text) == "" {
		return VoiceJob{}, fmt.Errorf("book source is not ready for narration")
	}
	request.ProjectID = book.ProjectID
	request.Text = book.Text
	return service.CreateJob(ctx, request)
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
	return service.writeBookSourceMetadata(book)
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
	default:
		return "", fmt.Errorf("unsupported book source type; upload a PDF or EPUB")
	}
}

func extractBookSource(
	ctx context.Context,
	kind BookSourceKind,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	switch kind {
	case BookSourceKindPDF:
		return extractPDFBookSource(ctx, sourcePath, sourceFileName)
	case BookSourceKindEPUB:
		return extractEPUBBookSource(sourcePath, sourceFileName)
	default:
		return bookSourceExtraction{}, fmt.Errorf("unsupported book source type")
	}
}

func extractPDFBookSource(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	pdftotext, err := exec.LookPath("pdftotext")
	if err != nil {
		return bookSourceExtraction{}, fmt.Errorf("pdftotext is required for local PDF text-layer import")
	}
	command := exec.CommandContext(ctx, pdftotext, "-layout", "-enc", "UTF-8", sourcePath, "-")
	output, err := command.Output()
	if err != nil {
		return bookSourceExtraction{}, fmt.Errorf("extract PDF text layer: %w", err)
	}
	text := normalizeBookText(string(output))
	if strings.TrimSpace(text) == "" {
		return bookSourceExtraction{}, fmt.Errorf("PDF has no readable text layer")
	}
	rawPages := strings.Split(strings.ReplaceAll(text, "\r\n", "\n"), "\f")
	pages := make([]BookSourcePage, 0, len(rawPages))
	spans := make([]BookSourceWordSpan, 0)
	textParts := make([]string, 0, len(rawPages))
	offset := 0
	for index, rawPage := range rawPages {
		pageText := normalizeBookText(rawPage)
		if strings.TrimSpace(pageText) == "" {
			continue
		}
		if len(textParts) > 0 {
			offset += 2
		}
		pageSpans := buildBookWordSpans(pageText, index+1, 0, offset)
		spans = append(spans, pageSpans...)
		pages = append(pages, BookSourcePage{
			Index:     len(pages) + 1,
			Label:     fmt.Sprintf("Page %d", len(pages)+1),
			Text:      pageText,
			WordCount: len(pageSpans),
		})
		textParts = append(textParts, pageText)
		offset += len(pageText)
	}
	combinedText := strings.Join(textParts, "\n\n")
	return bookSourceExtraction{
		title: strings.TrimSuffix(filepath.Base(sourceFileName), filepath.Ext(sourceFileName)),
		text:  combinedText,
		pages: pages,
		spans: normalizeBookSpanIndexes(spans),
	}, nil
}

func extractEPUBBookSource(sourcePath string, sourceFileName string) (bookSourceExtraction, error) {
	reader, err := zip.OpenReader(sourcePath)
	if err != nil {
		return bookSourceExtraction{}, fmt.Errorf("open EPUB: %w", err)
	}
	defer reader.Close()

	fileByName := map[string]*zip.File{}
	for _, file := range reader.File {
		fileByName[file.Name] = file
	}
	container, err := readZipText(fileByName["META-INF/container.xml"])
	if err != nil {
		return bookSourceExtraction{}, fmt.Errorf("read EPUB container: %w", err)
	}
	rootPath := firstRegexGroup(container, `full-path=["']([^"']+)["']`)
	if rootPath == "" {
		return bookSourceExtraction{}, fmt.Errorf("EPUB container does not declare a package document")
	}
	opf, err := readZipText(fileByName[rootPath])
	if err != nil {
		return bookSourceExtraction{}, fmt.Errorf("read EPUB package document: %w", err)
	}
	baseDir := filepath.ToSlash(filepath.Dir(rootPath))
	if baseDir == "." {
		baseDir = ""
	}
	title := html.UnescapeString(stripXMLTags(firstRegexGroup(opf, `(?is)<dc:title[^>]*>(.*?)</dc:title>`)))
	author := html.UnescapeString(stripXMLTags(firstRegexGroup(opf, `(?is)<dc:creator[^>]*>(.*?)</dc:creator>`)))
	manifest := parseEPUBManifest(opf, baseDir)
	spine := parseEPUBSpine(opf)
	if len(spine) == 0 {
		for id := range manifest {
			spine = append(spine, id)
		}
		sort.Strings(spine)
	}

	chapters := make([]BookSourceChapter, 0, len(spine))
	spans := make([]BookSourceWordSpan, 0)
	textParts := make([]string, 0, len(spine))
	offset := 0
	for _, id := range spine {
		path := manifest[id]
		if path == "" {
			continue
		}
		chapterHTML, readErr := readZipText(fileByName[path])
		if readErr != nil {
			continue
		}
		chapterText := htmlToBookText(chapterHTML)
		if strings.TrimSpace(chapterText) == "" {
			continue
		}
		if len(textParts) > 0 {
			offset += 2
		}
		chapterIndex := len(chapters) + 1
		chapterSpans := buildBookWordSpans(chapterText, 0, chapterIndex, offset)
		spans = append(spans, chapterSpans...)
		chapters = append(chapters, BookSourceChapter{
			Index:     chapterIndex,
			Title:     inferChapterTitle(chapterHTML, chapterIndex),
			Text:      chapterText,
			WordCount: len(chapterSpans),
		})
		textParts = append(textParts, chapterText)
		offset += len(chapterText)
	}
	combinedText := strings.Join(textParts, "\n\n")
	if strings.TrimSpace(combinedText) == "" {
		return bookSourceExtraction{}, fmt.Errorf("EPUB has no readable XHTML text")
	}
	if strings.TrimSpace(title) == "" {
		title = strings.TrimSuffix(filepath.Base(sourceFileName), filepath.Ext(sourceFileName))
	}
	return bookSourceExtraction{
		title:    strings.TrimSpace(title),
		author:   strings.TrimSpace(author),
		text:     combinedText,
		chapters: chapters,
		spans:    normalizeBookSpanIndexes(spans),
	}, nil
}

func parseEPUBManifest(opf string, baseDir string) map[string]string {
	manifest := map[string]string{}
	itemPattern := regexp.MustCompile(`(?is)<item\s+[^>]*>`)
	idPattern := regexp.MustCompile(`\bid=["']([^"']+)["']`)
	hrefPattern := regexp.MustCompile(`\bhref=["']([^"']+)["']`)
	mediaPattern := regexp.MustCompile(`\bmedia-type=["']([^"']+)["']`)
	for _, item := range itemPattern.FindAllString(opf, -1) {
		id := regexSubmatch(idPattern, item)
		href := regexSubmatch(hrefPattern, item)
		mediaType := regexSubmatch(mediaPattern, item)
		if id == "" || href == "" {
			continue
		}
		if !strings.Contains(mediaType, "xhtml") && !strings.Contains(mediaType, "html") {
			continue
		}
		path := filepath.ToSlash(filepath.Clean(filepath.Join(baseDir, href)))
		manifest[id] = path
	}
	return manifest
}

func parseEPUBSpine(opf string) []string {
	spinePattern := regexp.MustCompile(`(?is)<itemref\s+[^>]*>`)
	idrefPattern := regexp.MustCompile(`\bidref=["']([^"']+)["']`)
	spine := make([]string, 0)
	for _, item := range spinePattern.FindAllString(opf, -1) {
		idref := regexSubmatch(idrefPattern, item)
		if idref != "" {
			spine = append(spine, idref)
		}
	}
	return spine
}

func htmlToBookText(value string) string {
	clean := regexp.MustCompile(`(?is)<head[^>]*>.*?</head>|<script[^>]*>.*?</script>|<style[^>]*>.*?</style>|<svg[^>]*>.*?</svg>|<math[^>]*>.*?</math>`).ReplaceAllString(value, " ")
	clean = regexp.MustCompile(`(?i)<br\s*/?>`).ReplaceAllString(clean, "\n")
	clean = regexp.MustCompile(`(?i)</(p|div|section|article|h[1-6]|li|blockquote)>`).ReplaceAllString(clean, "\n")
	clean = stripXMLTags(clean)
	clean = html.UnescapeString(clean)
	return normalizeBookText(clean)
}

func inferChapterTitle(chapterHTML string, index int) string {
	for _, pattern := range []string{
		`(?is)<h1[^>]*>(.*?)</h1>`,
		`(?is)<h2[^>]*>(.*?)</h2>`,
		`(?is)<title[^>]*>(.*?)</title>`,
	} {
		title := normalizeBookText(html.UnescapeString(stripXMLTags(firstRegexGroup(chapterHTML, pattern))))
		if title != "" {
			return title
		}
	}
	return fmt.Sprintf("Chapter %d", index)
}

func buildBookWordSpans(text string, pageIndex int, chapterIndex int, offset int) []BookSourceWordSpan {
	spans := make([]BookSourceWordSpan, 0)
	start := -1
	for index, r := range text {
		if unicode.IsSpace(r) {
			if start >= 0 {
				spans = append(spans, bookSpanFromRange(text, start, index, pageIndex, chapterIndex, offset))
				start = -1
			}
			continue
		}
		if start < 0 {
			start = index
		}
	}
	if start >= 0 {
		spans = append(spans, bookSpanFromRange(text, start, len(text), pageIndex, chapterIndex, offset))
	}
	return spans
}

func bookSpanFromRange(
	text string,
	start int,
	end int,
	pageIndex int,
	chapterIndex int,
	offset int,
) BookSourceWordSpan {
	token := strings.TrimFunc(text[start:end], func(r rune) bool {
		return unicode.IsPunct(r) || unicode.IsSymbol(r)
	})
	if token == "" {
		token = strings.TrimSpace(text[start:end])
	}
	return BookSourceWordSpan{
		Text:        token,
		PageIndex:   pageIndex,
		Chapter:     chapterIndex,
		StartOffset: offset + start,
		EndOffset:   offset + end,
	}
}

func normalizeBookSpanIndexes(spans []BookSourceWordSpan) []BookSourceWordSpan {
	normalized := make([]BookSourceWordSpan, 0, len(spans))
	for _, span := range spans {
		if strings.TrimSpace(span.Text) == "" {
			continue
		}
		span.Index = len(normalized)
		normalized = append(normalized, span)
	}
	return normalized
}

func normalizeBookText(value string) string {
	lines := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\n")
	cleanLines := make([]string, 0, len(lines))
	for _, line := range lines {
		clean := strings.Join(strings.Fields(line), " ")
		if clean == "" {
			if len(cleanLines) > 0 && cleanLines[len(cleanLines)-1] != "" {
				cleanLines = append(cleanLines, "")
			}
			continue
		}
		cleanLines = append(cleanLines, clean)
	}
	clean := strings.TrimSpace(strings.Join(cleanLines, "\n"))
	clean = regexp.MustCompile(`\n{3,}`).ReplaceAllString(clean, "\n\n")
	return clean
}

func stripXMLTags(value string) string {
	return regexp.MustCompile(`(?is)<[^>]+>`).ReplaceAllString(value, " ")
}

func firstRegexGroup(value string, pattern string) string {
	return regexSubmatch(regexp.MustCompile(pattern), value)
}

func regexSubmatch(pattern *regexp.Regexp, value string) string {
	match := pattern.FindStringSubmatch(value)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func readZipText(file *zip.File) (string, error) {
	if file == nil {
		return "", os.ErrNotExist
	}
	reader, err := file.Open()
	if err != nil {
		return "", err
	}
	defer reader.Close()
	var buffer bytes.Buffer
	if _, err := io.Copy(&buffer, reader); err != nil {
		return "", err
	}
	if !utf8.Valid(buffer.Bytes()) {
		return strings.ToValidUTF8(buffer.String(), ""), nil
	}
	return buffer.String(), nil
}

func jsonUnmarshalBook(data []byte, target *BookSource) error {
	return json.Unmarshal(data, target)
}
