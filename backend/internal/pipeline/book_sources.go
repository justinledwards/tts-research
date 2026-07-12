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

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

const bookSourceMetadataFilename = "book.json"
const bookSourceStructureVersion = "book-source-structure.v2"

const (
	bookSectionRoleFrontmatter = "frontmatter"
	bookSectionRoleBody        = "body"
	bookSectionRoleBackmatter  = "backmatter"
	bookSectionRoleAppendix    = "appendix"
)

type bookSourceExtraction struct {
	title            string
	author           string
	text             string
	pages            []BookSourcePage
	chapters         []BookSourceChapter
	sections         []BookSourceSection
	readingOrder     []string
	defaultSectionID string
	warnings         []string
	spans            []BookSourceWordSpan
}

type pythonPDFExtraction struct {
	Title  string `json:"title"`
	Author string `json:"author"`
	Pages  []struct {
		Label string `json:"label"`
		Text  string `json:"text"`
	} `json:"pages"`
	Outlines []struct {
		Title string `json:"title"`
		Page  int    `json:"page"`
	} `json:"outlines"`
}

func (extraction bookSourceExtraction) structureVersion() string {
	if len(extraction.sections) == 0 {
		return ""
	}
	return bookSourceStructureVersion
}

func (service *Service) CreateBookSource(
	ctx context.Context,
	projectID string,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
) (BookSource, error) {
	return service.CreateBookSourceWithOptions(ctx, projectID, []BookSourceUpload{{
		Path:     sourcePath,
		Filename: sourceFileName,
		Bytes:    sourceBytes,
	}}, BookSourceImportOptions{})
}

func (service *Service) CreateBookSourceWithOptions(
	ctx context.Context,
	projectID string,
	uploads []BookSourceUpload,
	options BookSourceImportOptions,
) (BookSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return BookSource{}, err
	}
	kind, err := detectBookSourceKindFromUploads(uploads)
	if err != nil {
		return BookSource{}, err
	}
	options = normalizeBookSourceImportOptions(options)
	sourceFileName := bookSourceUploadName(uploads, kind)
	sourceBytes := bookSourceUploadBytes(uploads)

	now := time.Now().UTC()
	bookID := newID()
	outputDir, err := filepath.Abs(filepath.Join(service.options.BookSourceDir, bookID))
	if err != nil {
		return BookSource{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return BookSource{}, err
	}
	sourcePaths := make([]string, 0, len(uploads))
	for index, upload := range uploads {
		uploadPath := filepath.Join(outputDir, storedBookSourceFilename(upload.Filename, index, len(uploads)))
		if err := copyFile(upload.Path, uploadPath); err != nil {
			return BookSource{}, fmt.Errorf("store book source: %w", err)
		}
		sourcePaths = append(sourcePaths, uploadPath)
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
	sourceRevisionID := bookSourceRevisionID(book.ID)
	if incrementalBookSourceKind(kind) {
		if len(sourcePaths) == 0 {
			return BookSource{}, fmt.Errorf("%s incremental extraction requires a persisted source file", kind)
		}
		if _, revision, err := service.PersistSourceLifecycle(sourceLifecycleRequestFromBookSource(book, sourcePaths[0], sourceRevisionID)); err != nil {
			return BookSource{}, fmt.Errorf("persist %s source lifecycle: %w", kind, err)
		} else {
			sourceRevisionID = revision.RevisionID
		}
	}
	var incrementalCompletionStatus SourceLifecycleWorkStatus
	document, extractErr := service.extractBookSourceIR(ctx, kind, sourcePaths, sourceFileName, book, now, options)
	if extractErr != nil {
		book.Status = BookSourceStatusFailed
		book.Error = extractErr.Error()
		readiness := bookSourceFailedReadiness(book, SourceReadinessFailureExtraction, extractErr.Error())
		book.SourceReadiness = &readiness
		if incrementalBookSourceKind(kind) {
			if statusErr := service.UpdateSourceLifecycleWorkStatus(book.ID, sourceRevisionID, SourceLifecycleWorkStatusFailed); statusErr != nil {
				return BookSource{}, statusErr
			}
		}
	} else {
		book = BookSourceFromIR(document, book)
		readiness := bookSourceNeedsMetadataReadiness(book)
		book.SourceReadiness = &readiness
		if incrementalBookSourceKind(kind) {
			if err := service.persistIncrementalBookSourceManifests(ctx, book, document, sourceRevisionID, now); err != nil {
				_ = service.UpdateSourceLifecycleWorkStatus(book.ID, sourceRevisionID, SourceLifecycleWorkStatusFailed)
				return BookSource{}, fmt.Errorf("persist %s incremental manifest snapshots: %w", kind, err)
			}
			incrementalCompletionStatus = SourceLifecycleWorkStatusComplete
			if len(incrementalDocumentWarnings(document)) > 0 {
				incrementalCompletionStatus = SourceLifecycleWorkStatusCompleteWithWarnings
			}
		}
	}

	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		if incrementalBookSourceKind(kind) && extractErr == nil {
			_ = service.UpdateSourceLifecycleWorkStatus(book.ID, sourceRevisionID, SourceLifecycleWorkStatusFailed)
		}
		return BookSource{}, err
	}
	if extractErr == nil {
		if err := service.writeBookSourceContentIRDocument(book.ID, document); err != nil {
			if incrementalBookSourceKind(kind) {
				_ = service.UpdateSourceLifecycleWorkStatus(book.ID, sourceRevisionID, SourceLifecycleWorkStatusFailed)
			}
			return BookSource{}, err
		}
	} else {
		if err := service.writeBookSourceContentIR(book); err != nil {
			return BookSource{}, err
		}
	}
	if incrementalBookSourceKind(kind) && extractErr == nil {
		if err := service.UpdateSourceLifecycleWorkStatus(book.ID, sourceRevisionID, incrementalCompletionStatus); err != nil {
			return BookSource{}, err
		}
	}
	return book, nil
}

func (service *Service) ListProjectBookSources(projectID string) ([]BookSource, error) {
	return service.listProjectBookSources(projectID, false)
}

func (service *Service) ListProjectBookSourcesSummary(projectID string) ([]BookSource, error) {
	return service.listProjectBookSources(projectID, true)
}

func (service *Service) listProjectBookSources(projectID string, summary bool) ([]BookSource, error) {
	project, err := service.GetProject(projectID)
	if err != nil {
		return nil, err
	}

	service.mu.RLock()
	books := make([]BookSource, 0)
	for _, book := range service.books {
		if book.ProjectID == project.ID {
			nextBook := book.BookSource
			ensureBookStructureMetadata(&nextBook)
			nextBook = ensureBookSourceReadiness(nextBook)
			if summary {
				nextBook = summarizeBookSource(nextBook)
			}
			books = append(books, nextBook)
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
	nextBook := book.BookSource
	ensureBookStructureMetadata(&nextBook)
	nextBook = ensureBookSourceReadiness(nextBook)
	return nextBook, nil
}

func (service *Service) GetBookSourceScope(id string, requested *BookScope) (BookSourceScopeContent, error) {
	return service.bookSourceScopeContent(id, requested, SpeechPolicyPreviewRequest{})
}

func (service *Service) PreviewBookSourceScopeSpeechPolicy(
	id string,
	request SpeechPolicyPreviewRequest,
) (BookSourceScopeContent, error) {
	return service.bookSourceScopeContent(id, request.Scope, request)
}

func (service *Service) UpdateBookSourceSpeechPolicy(id string, request SourceSpeechPolicyUpdateRequest) (BookSource, error) {
	service.mu.RLock()
	stored, ok := service.books[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return BookSource{}, ErrBookSourceNotFound
	}
	book := stored.BookSource
	project, err := service.GetProject(book.ProjectID)
	if err != nil {
		return BookSource{}, err
	}
	if request.Clear {
		book.SourceSpeechPolicyProfile = ""
		book.SourceSpeechPolicyOverrides = policy.Overrides{}
	} else {
		profileName := strings.TrimSpace(request.Profile)
		if profileName != "" {
			resolved, err := resolveProjectSpeechPolicyProfile(project, profileName)
			if err != nil {
				return BookSource{}, err
			}
			book.SourceSpeechPolicyProfile = resolved
		}
		book.SourceSpeechPolicyOverrides = policy.NormalizeOverrides(request.Overrides)
	}
	book.UpdatedAt = time.Now().UTC()
	ensureBookStructureMetadata(&book)
	book = ensureBookSourceReadiness(book)
	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		return BookSource{}, err
	}
	return book, nil
}

func (service *Service) ConfirmBookSourceReadiness(id string, request SourceReadinessConfirmationRequest) (BookSource, error) {
	service.mu.RLock()
	stored, ok := service.books[strings.TrimSpace(id)]
	service.mu.RUnlock()
	if !ok {
		return BookSource{}, ErrBookSourceNotFound
	}
	book := stored.BookSource
	ensureBookStructureMetadata(&book)
	if book.Status != BookSourceStatusReady {
		readiness := bookSourceFailedReadiness(book, SourceReadinessFailureExtraction, book.Error)
		book.SourceReadiness = &readiness
		return book, nil
	}
	now := time.Now().UTC()
	if title := strings.TrimSpace(request.Title); title != "" {
		book.Title = title
	}
	if profile := strings.TrimSpace(request.SpeechPolicyProfile); profile != "" {
		book.SourceSpeechPolicyProfile = profile
	}
	readiness := confirmedBookSourceReadiness(book, request, now)
	book.SourceReadiness = &readiness
	book.UpdatedAt = now
	service.updateBookSource(storedBookSource{BookSource: book})
	if err := service.writeBookSourceMetadata(book); err != nil {
		return BookSource{}, err
	}
	return book, nil
}

func (service *Service) bookSourceScopeContent(
	id string,
	requested *BookScope,
	request SpeechPolicyPreviewRequest,
) (BookSourceScopeContent, error) {
	book, err := service.GetBookSource(id)
	if err != nil {
		return BookSourceScopeContent{}, err
	}
	if book.Status != BookSourceStatusReady {
		return BookSourceScopeContent{}, fmt.Errorf("book source is not ready")
	}
	text, scope, err := resolveBookNarrationScope(book, requested)
	if err != nil {
		return BookSourceScopeContent{}, err
	}
	spans := bookScopeSpans(book, scope)
	section := findBookSectionForScope(book, scope)
	warnings := append([]string(nil), book.Warnings...)
	if section != nil {
		warnings = append(warnings, section.Warnings...)
	}
	policySource, prepWarnings := service.bookScopePolicySource(book, scope, text, request)
	blocks := policySource.Blocks
	skippedItems := policySource.SkippedItems
	warnings = append(warnings, prepWarnings...)
	return BookSourceScopeContent{
		BookSourceID:         book.ID,
		Scope:                *scope,
		Text:                 text,
		WordSpans:            spans,
		Section:              section,
		WordCount:            len(spans),
		EstimatedDurationMS:  estimateBookDurationMS(len(spans)),
		SourceStructureValid: strings.TrimSpace(book.StructureVersion) != "",
		Blocks:               blocks,
		SkippedItems:         skippedItems,
		Summary:              summarizePreparedSource(blocks),
		Warnings:             uniqueStrings(warnings),
	}, nil
}

func (service *Service) bookScopePolicySource(
	book BookSource,
	scope *BookScope,
	text string,
	request SpeechPolicyPreviewRequest,
) (PreparedSource, []string) {
	blocks, warnings := service.bookScopeBlocks(book, scope, text)
	return service.bookPolicySourceForBlocks(book, blocks, request), warnings
}

func (service *Service) bookTextPolicySource(
	book BookSource,
	text string,
	request SpeechPolicyPreviewRequest,
) (PreparedSource, []string) {
	blocks, _, warnings := prepareNarrationBlocks(text, service.options.SourcePrepSentenceMaxRunes)
	return service.bookPolicySourceForBlocks(book, blocks, request), warnings
}

func (service *Service) bookPolicySourceForBlocks(
	book BookSource,
	blocks []NarrationBlock,
	request SpeechPolicyPreviewRequest,
) PreparedSource {
	profileName := strings.TrimSpace(request.Profile)
	project, err := service.GetProject(book.ProjectID)
	if err == nil && profileName != "" {
		if _, err := resolveProjectSpeechPolicyProfile(project, profileName); err != nil {
			profileName = ""
		}
	}
	source := PreparedSource{
		ID:        "book-scope-preview",
		ProjectID: book.ProjectID,
		Kind:      PreparedSourceKindBook,
		Blocks:    blocks,
	}
	if err == nil {
		return applySpeechPolicyToPreparedSourceWithEvaluator(
			source,
			speechPolicyEvaluatorForSource(project, book.SourceSpeechPolicyProfile, book.SourceSpeechPolicyOverrides, profileName, request.Overrides),
			service.options.SourcePrepSentenceMaxRunes,
		)
	}
	return applySpeechPolicyToPreparedSource(source, profileName, request.Overrides, service.options.SourcePrepSentenceMaxRunes)
}

func (service *Service) bookScopeBlocks(
	book BookSource,
	scope *BookScope,
	text string,
) ([]NarrationBlock, []string) {
	if document, err := service.bookSourceContentIR(book); err == nil {
		nodes := contentIRNodesForBookScope(document, book, scope)
		if len(nodes) > 0 {
			blocks := make([]NarrationBlock, 0, len(nodes))
			for index, node := range nodes {
				blocks = append(blocks, narrationBlockFromIRNode(node, index))
			}
			return blocks, nodeWarnings(nodes)
		}
	}
	blocks, _, warnings := prepareNarrationBlocks(text, service.options.SourcePrepSentenceMaxRunes)
	return blocks, warnings
}

func contentIRNodesForBookScope(
	document contentir.Document,
	book BookSource,
	scope *BookScope,
) []contentir.Node {
	if scope == nil || scope.Type == BookScopeTypeBook {
		return document.Nodes
	}
	switch scope.Type {
	case BookScopeTypeChapter:
		for _, chapter := range book.Chapters {
			if chapter.Index != scope.ChapterIndex {
				continue
			}
			if strings.TrimSpace(chapter.ID) != "" {
				if nodes := nodesForSection(document.Nodes, chapter.ID); len(nodes) > 0 {
					return nodes
				}
				return nodesByChapterIndex(document.Nodes, chapter.Index)
			}
			return nodesByChapterIndex(document.Nodes, chapter.Index)
		}
	case BookScopeTypePages:
		filtered := make([]contentir.Node, 0)
		for _, node := range document.Nodes {
			pageIndex := pageIndexFromIRNode(node)
			if pageIndex >= scope.PageStart && pageIndex <= scope.PageEnd {
				filtered = append(filtered, node)
			}
		}
		return filtered
	}
	return nil
}

func nodesByChapterIndex(nodes []contentir.Node, chapterIndex int) []contentir.Node {
	filtered := make([]contentir.Node, 0)
	for _, node := range nodes {
		if metadataValueInt(node.Metadata, "chapterIndex", 0) == chapterIndex ||
			metadataValueInt(node.Metadata, "sectionIndex", -1)+1 == chapterIndex {
			filtered = append(filtered, node)
		}
	}
	return filtered
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
	narrationText, scope, err := resolveBookNarrationScope(book, request.BookScope)
	if err != nil {
		return VoiceJob{}, err
	}
	useRequestSpeechText := false
	if trimmedSpeechText := strings.TrimSpace(request.SpeechText); trimmedSpeechText != "" {
		narrationText = trimmedSpeechText
		useRequestSpeechText = true
	}
	policyRequest := SpeechPolicyPreviewRequest{
		Profile:        request.SpeechPolicyProfile,
		Overrides:      request.SpeechPolicyOverrides,
		VoiceProfileID: request.VoiceProfileID,
		Locale:         request.Locale,
		TTSEngine:      request.TTSEngine,
	}
	var policySource PreparedSource
	var warnings []string
	if useRequestSpeechText {
		policySource, warnings = service.bookTextPolicySource(book, narrationText, policyRequest)
	} else {
		policySource, warnings = service.bookScopePolicySource(book, scope, narrationText, policyRequest)
	}
	narrationText = strings.TrimSpace(policySource.SpeechText)
	if narrationText == "" {
		return VoiceJob{}, ErrEmptyText
	}
	request.ProjectID = book.ProjectID
	request.BookSourceID = book.ID
	request.BookScope = scope
	request.SourceKind = string(PreparedSourceKindBook)
	request.ProgressTargetID = progressTargetForBookScope(book.ID, scope)
	request.Text = narrationText
	request.SpeechPolicyProfile = policySource.SpeechPolicyProfile
	request.SpeechPolicyOverrides = policy.NormalizeOverrides(request.SpeechPolicyOverrides)
	job, err := service.CreateJob(ctx, request)
	if err != nil {
		return VoiceJob{}, err
	}
	if len(warnings) > 0 {
		service.updateJob(job.ID, func(stored *storedJob) {
			stored.SegmentationWarnings = uniqueStrings(warnings)
		})
		if updated, getErr := service.GetJob(job.ID); getErr == nil {
			job = updated
		}
	}
	return job, nil
}

func (service *Service) BookCinemaDiagnostics() BookCinemaDiagnostics {
	pdftotextAvailable := commandAvailable("pdftotext")
	pythonFallbackAvailable := service.pythonPDFExtractorAvailable()
	extractor := "unavailable"
	setup := "Install poppler-utils for pdftotext or keep the managed Python pypdf fallback available."
	if pdftotextAvailable {
		extractor = "pdftotext"
		setup = ""
	} else if pythonFallbackAvailable {
		extractor = "python-fallback"
		setup = ""
	}
	return BookCinemaDiagnostics{
		PDFExtractor:             extractor,
		PDFExtractorAvailable:    pdftotextAvailable || pythonFallbackAvailable,
		PDFStrict:                service.options.BookPDFRequireTextExtractor,
		PDFSetup:                 setup,
		PDFToTextAvailable:       pdftotextAvailable,
		PythonFallbackAvailable:  pythonFallbackAvailable,
		PythonFallbackConfigured: strings.TrimSpace(service.options.BookPDFPythonPath) != "" && strings.TrimSpace(service.options.BookPDFExtractorScriptPath) != "",
		PythonPath:               service.options.BookPDFPythonPath,
		PythonScript:             service.options.BookPDFExtractorScriptPath,
		Adapters:                 service.AdapterDiagnostics(),
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
	case BookSourceKindDOCX, BookSourceKindHTML, BookSourceKindMarkdown:
		return bookSourceExtraction{}, fmt.Errorf("adapter-backed book source extraction requires service context")
	default:
		return bookSourceExtraction{}, fmt.Errorf("unsupported book source type")
	}
}

func (service *Service) extractBookSource(
	ctx context.Context,
	kind BookSourceKind,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	switch kind {
	case BookSourceKindPDF:
		return service.extractPDFBookSource(ctx, sourcePath, sourceFileName)
	case BookSourceKindEPUB:
		return extractEPUBBookSource(sourcePath, sourceFileName)
	case BookSourceKindDOCX, BookSourceKindHTML, BookSourceKindMarkdown:
		return bookSourceExtraction{}, fmt.Errorf("adapter-backed book source extraction uses Content IR")
	default:
		return bookSourceExtraction{}, fmt.Errorf("unsupported book source type")
	}
}

func extractPDFBookSource(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	return extractPDFBookSourceWithFallback(ctx, sourcePath, sourceFileName, "", "")
}

func (service *Service) extractPDFBookSource(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	return extractPDFBookSourceWithFallback(
		ctx,
		sourcePath,
		sourceFileName,
		service.options.BookPDFPythonPath,
		service.options.BookPDFExtractorScriptPath,
	)
}

func extractPDFBookSourceWithFallback(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
	pythonPath string,
	scriptPath string,
) (bookSourceExtraction, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	var pdftotextErr error
	if pdftotext, err := exec.LookPath("pdftotext"); err == nil {
		command := exec.CommandContext(ctx, pdftotext, "-layout", "-enc", "UTF-8", sourcePath, "-")
		output, outputErr := command.Output()
		if outputErr != nil {
			pdftotextErr = outputErr
		} else {
			extraction, extractionErr := extractionFromPDFText(string(output), sourceFileName)
			if extractionErr == nil {
				return extraction, nil
			}
			pdftotextErr = extractionErr
		}
	} else {
		pdftotextErr = err
	}
	if strings.TrimSpace(pythonPath) != "" && strings.TrimSpace(scriptPath) != "" {
		extraction, err := extractPDFWithPythonFallback(ctx, pythonPath, scriptPath, sourcePath, sourceFileName)
		if err == nil {
			return extraction, nil
		}
		return bookSourceExtraction{}, fmt.Errorf("extract PDF text layer: pdftotext unavailable or failed (%v); python fallback failed: %w", pdftotextErr, err)
	}
	return bookSourceExtraction{}, fmt.Errorf("pdftotext or managed Python pypdf fallback is required for local PDF text-layer import: %w", pdftotextErr)
}

func extractionFromPDFText(value string, sourceFileName string) (bookSourceExtraction, error) {
	if strings.TrimSpace(value) == "" {
		return bookSourceExtraction{}, fmt.Errorf("PDF has no readable text layer")
	}
	rawPages := strings.Split(strings.ReplaceAll(value, "\r\n", "\n"), "\f")
	if len(rawPages) > 1 && strings.TrimSpace(rawPages[len(rawPages)-1]) == "" {
		rawPages = rawPages[:len(rawPages)-1]
	}
	rawPages = cleanPDFPageTexts(rawPages)
	pages := make([]BookSourcePage, 0, len(rawPages))
	spans := make([]BookSourceWordSpan, 0)
	textParts := make([]string, 0, len(rawPages))
	offset := 0
	for _, rawPage := range rawPages {
		pageText := normalizeBookText(rawPage)
		if strings.TrimSpace(pageText) != "" && len(textParts) > 0 {
			offset += 2
		}
		pageIndex := len(pages) + 1
		pageSpans := buildBookWordSpans(pageText, pageIndex, 0, offset)
		spans = append(spans, pageSpans...)
		pages = append(pages, BookSourcePage{
			Index:     pageIndex,
			Label:     fmt.Sprintf("Page %d", pageIndex),
			Text:      pageText,
			WordCount: len(pageSpans),
		})
		if strings.TrimSpace(pageText) != "" {
			textParts = append(textParts, pageText)
			offset += len(pageText)
		}
	}
	combinedText := strings.Join(textParts, "\n\n")
	sections, chapters := buildPDFSectionsFromPages(pages, nil)
	return bookSourceExtraction{
		title:            cleanBookTitle(strings.TrimSuffix(filepath.Base(sourceFileName), filepath.Ext(sourceFileName))),
		text:             combinedText,
		pages:            pages,
		chapters:         chapters,
		sections:         sections,
		readingOrder:     sectionReadingOrder(sections),
		defaultSectionID: firstNarratableSectionID(sections),
		spans:            normalizeBookSpanIndexes(spans),
	}, nil
}

func extractPDFWithPythonFallback(
	ctx context.Context,
	pythonPath string,
	scriptPath string,
	sourcePath string,
	sourceFileName string,
) (bookSourceExtraction, error) {
	command := exec.CommandContext(ctx, pythonPath, scriptPath, sourcePath)
	output, err := command.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			return bookSourceExtraction{}, fmt.Errorf("%w: %s", err, strings.TrimSpace(string(exitErr.Stderr)))
		}
		return bookSourceExtraction{}, err
	}
	var extracted pythonPDFExtraction
	if err := json.Unmarshal(output, &extracted); err != nil {
		return bookSourceExtraction{}, fmt.Errorf("decode python PDF extraction: %w", err)
	}
	rawPageTexts := make([]string, 0, len(extracted.Pages))
	for _, page := range extracted.Pages {
		rawPageTexts = append(rawPageTexts, page.Text)
	}
	cleanedPageTexts := cleanPDFPageTexts(rawPageTexts)
	pages := make([]BookSourcePage, 0, len(extracted.Pages))
	spans := make([]BookSourceWordSpan, 0)
	textParts := make([]string, 0, len(extracted.Pages))
	offset := 0
	for index, page := range extracted.Pages {
		pageText := ""
		if index < len(cleanedPageTexts) {
			pageText = normalizeBookText(cleanedPageTexts[index])
		}
		if strings.TrimSpace(pageText) == "" {
			continue
		}
		if len(textParts) > 0 {
			offset += 2
		}
		pageIndex := len(pages) + 1
		pageSpans := buildBookWordSpans(pageText, pageIndex, 0, offset)
		label := strings.TrimSpace(page.Label)
		if label == "" {
			label = fmt.Sprintf("Page %d", pageIndex)
		}
		spans = append(spans, pageSpans...)
		pages = append(pages, BookSourcePage{
			Index:     pageIndex,
			Label:     label,
			Text:      pageText,
			WordCount: len(pageSpans),
		})
		textParts = append(textParts, pageText)
		offset += len(pageText)
	}
	combinedText := strings.Join(textParts, "\n\n")
	if strings.TrimSpace(combinedText) == "" {
		return bookSourceExtraction{}, fmt.Errorf("PDF has no readable text layer")
	}
	title := strings.TrimSpace(extracted.Title)
	if title == "" {
		title = cleanBookTitle(strings.TrimSuffix(filepath.Base(sourceFileName), filepath.Ext(sourceFileName)))
	}
	sections, chapters := buildPDFSectionsFromPages(pages, extracted.Outlines)
	return bookSourceExtraction{
		title:            cleanBookTitle(title),
		author:           strings.TrimSpace(extracted.Author),
		text:             combinedText,
		pages:            pages,
		chapters:         chapters,
		sections:         sections,
		readingOrder:     sectionReadingOrder(sections),
		defaultSectionID: firstNarratableSectionID(sections),
		spans:            normalizeBookSpanIndexes(spans),
	}, nil
}

func cleanPDFPageTexts(rawPages []string) []string {
	normalizedPages := make([]string, 0, len(rawPages))
	lineCounts := map[string]int{}
	for _, rawPage := range rawPages {
		pageText := normalizeBookText(rawPage)
		pageText = cleanPDFArtifacts(pageText)
		normalizedPages = append(normalizedPages, pageText)
		for _, line := range strings.Split(pageText, "\n") {
			line = strings.TrimSpace(line)
			if line == "" || len(line) > 96 {
				continue
			}
			lineCounts[strings.ToLower(line)]++
		}
	}
	repeatedThreshold := max(3, len(normalizedPages)/4)
	cleanedPages := make([]string, 0, len(normalizedPages))
	for _, pageText := range normalizedPages {
		lines := make([]string, 0)
		for _, line := range strings.Split(pageText, "\n") {
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				lines = append(lines, "")
				continue
			}
			lower := strings.ToLower(trimmed)
			if strings.Contains(lower, "oceanofpdf.com") {
				continue
			}
			if lineCounts[lower] >= repeatedThreshold && looksLikePDFRunningHeader(trimmed) {
				continue
			}
			lines = append(lines, line)
		}
		cleanedPages = append(cleanedPages, normalizeBookText(strings.Join(lines, "\n")))
	}
	return cleanedPages
}

func cleanPDFArtifacts(value string) string {
	replacements := map[string]string{
		"\x00": "",
		"ﬀ":    "ff",
		"ﬁ":    "fi",
		"ﬂ":    "fl",
		"ﬃ":    "ffi",
		"ﬄ":    "ffl",
		"’":    "'",
		"“":    "\"",
		"”":    "\"",
	}
	cleaned := value
	for oldValue, newValue := range replacements {
		cleaned = strings.ReplaceAll(cleaned, oldValue, newValue)
	}
	cleaned = regexp.MustCompile(`(?m)-\s*\n\s*`).ReplaceAllString(cleaned, "")
	cleaned = regexp.MustCompile(`\b([A-Z]) ([a-z]{2,})\b`).ReplaceAllString(cleaned, "$1$2")
	cleaned = regexp.MustCompile(`(?im)^\s*(?:OceanofPDF\.com|Generated by OceanofPDF\.com)\s*$`).ReplaceAllString(cleaned, "")
	return normalizeBookText(cleaned)
}

func looksLikePDFRunningHeader(line string) bool {
	lower := strings.ToLower(strings.TrimSpace(line))
	if lower == "" {
		return false
	}
	if strings.Contains(lower, "oceanofpdf") {
		return true
	}
	if regexp.MustCompile(`^\d+$`).MatchString(lower) {
		return true
	}
	wordCount := len(strings.Fields(lower))
	return wordCount <= 8
}

func buildPDFSectionsFromPages(
	pages []BookSourcePage,
	outlines []struct {
		Title string `json:"title"`
		Page  int    `json:"page"`
	},
) ([]BookSourceSection, []BookSourceChapter) {
	if len(pages) == 0 {
		return nil, nil
	}
	pageByIndex := map[int]BookSourcePage{}
	for _, page := range pages {
		pageByIndex[page.Index] = page
	}
	cleanOutlines := make([]struct {
		Title string
		Page  int
	}, 0, len(outlines))
	for _, outline := range outlines {
		title := normalizeBookText(outline.Title)
		if title == "" || outline.Page <= 0 || outline.Page > len(pages) {
			continue
		}
		cleanOutlines = append(cleanOutlines, struct {
			Title string
			Page  int
		}{Title: title, Page: outline.Page})
	}
	sort.SliceStable(cleanOutlines, func(left int, right int) bool {
		return cleanOutlines[left].Page < cleanOutlines[right].Page
	})
	if len(cleanOutlines) == 0 {
		return buildPDFPageRangeSections(pages, 2)
	}
	sections := make([]BookSourceSection, 0, len(cleanOutlines))
	chapters := make([]BookSourceChapter, 0, len(cleanOutlines))
	for index, outline := range cleanOutlines {
		start := outline.Page
		end := len(pages)
		if index+1 < len(cleanOutlines) {
			end = max(start, cleanOutlines[index+1].Page-1)
		}
		wordCount := 0
		for pageIndex := start; pageIndex <= end; pageIndex++ {
			wordCount += pageByIndex[pageIndex].WordCount
		}
		role := normalizeBookSectionRole("", outline.Title, "")
		isNarratable := role == bookSectionRoleBody && wordCount > 0
		chapterIndex := len(chapters) + 1
		section := BookSourceSection{
			ID:                  fmt.Sprintf("pdf-outline-%d", chapterIndex),
			Index:               len(sections),
			Title:               outline.Title,
			Role:                role,
			IsNarratable:        isNarratable,
			Kind:                "chapter",
			ChapterIndex:        chapterIndex,
			PageStart:           start,
			PageEnd:             end,
			WordCount:           wordCount,
			EstimatedDurationMS: estimateBookDurationMS(wordCount),
		}
		sections = append(sections, section)
		chapters = append(chapters, BookSourceChapter{
			Index:               chapterIndex,
			ID:                  section.ID,
			Title:               outline.Title,
			Text:                pagesText(pages, start, end),
			WordCount:           wordCount,
			Role:                role,
			IsNarratable:        isNarratable,
			PageStart:           start,
			PageEnd:             end,
			EstimatedDurationMS: section.EstimatedDurationMS,
		})
	}
	return sections, chapters
}

func buildPDFPageRangeSections(pages []BookSourcePage, spreadSize int) ([]BookSourceSection, []BookSourceChapter) {
	sections := sectionsFromPages(pages, spreadSize)
	chapters := make([]BookSourceChapter, 0, len(sections))
	for _, section := range sections {
		chapters = append(chapters, BookSourceChapter{
			Index:               len(chapters) + 1,
			ID:                  section.ID,
			Title:               section.Title,
			Text:                pagesText(pages, section.PageStart, section.PageEnd),
			WordCount:           section.WordCount,
			Role:                section.Role,
			IsNarratable:        section.IsNarratable,
			PageStart:           section.PageStart,
			PageEnd:             section.PageEnd,
			EstimatedDurationMS: section.EstimatedDurationMS,
		})
	}
	return sections, chapters
}

func sectionReadingOrder(sections []BookSourceSection) []string {
	readingOrder := make([]string, 0, len(sections))
	for _, section := range sections {
		readingOrder = append(readingOrder, section.ID)
	}
	return readingOrder
}

func normalizeBookSectionRole(role string, title string, sourceHref string) string {
	if normalizedRole := strings.ToLower(strings.TrimSpace(role)); normalizedRole != "" {
		switch normalizedRole {
		case bookSectionRoleFrontmatter, bookSectionRoleBody, bookSectionRoleBackmatter, bookSectionRoleAppendix:
			return normalizedRole
		}
	}
	value := strings.ToLower(strings.TrimSpace(title + " " + sourceHref))
	switch {
	case strings.Contains(value, "_cop_"),
		strings.Contains(value, "_toc_"),
		strings.Contains(value, "_tp_"),
		strings.Contains(value, "_cvi_"),
		strings.Contains(value, "_fm-"),
		strings.Contains(value, "_ded_"),
		strings.Contains(value, "titlepage"),
		strings.Contains(value, "frontmatter"):
		return bookSectionRoleFrontmatter
	case strings.Contains(value, "_ack_"),
		strings.Contains(value, "_ata_"),
		strings.Contains(value, "_adc_"),
		strings.Contains(value, "next-reads"),
		strings.Contains(value, "backmatter"):
		return bookSectionRoleBackmatter
	case strings.Contains(value, "cover"),
		strings.Contains(value, "title page"),
		strings.Contains(value, "copyright"),
		strings.Contains(value, "contents"),
		strings.Contains(value, "table of contents"),
		strings.Contains(value, "toc"),
		strings.Contains(value, "dedication"):
		return bookSectionRoleFrontmatter
	case strings.Contains(value, "acknowledg"),
		strings.Contains(value, "about the author"),
		strings.Contains(value, "other titles"),
		strings.Contains(value, "also by"),
		strings.Contains(value, "advertisement"),
		strings.Contains(value, "next read"):
		return bookSectionRoleBackmatter
	case strings.Contains(value, "appendix"):
		return bookSectionRoleAppendix
	default:
		return bookSectionRoleBody
	}
}

func isNarratableBookSection(role string, title string, text string) bool {
	if normalizeBookSectionRole(role, title, "") != bookSectionRoleBody {
		return false
	}
	wordCount := len(buildBookWordSpans(text, 0, 0, 0))
	return wordCount >= 3
}

func looksLikePDFTableOfContents(text string) bool {
	normalized := strings.TrimSpace(text)
	if normalized == "" {
		return false
	}
	compact := strings.ToLower(strings.Join(strings.Fields(normalized), " "))
	if strings.Contains(compact, "chapter 1 chapter 2 chapter 3") {
		return true
	}
	chapterRefs := regexp.MustCompile(`(?i)\bchapter\s+\d+\b`).FindAllString(normalized, -1)
	if len(chapterRefs) < 5 {
		return false
	}
	sentenceMarks := strings.Count(normalized, ".") + strings.Count(normalized, "?") + strings.Count(normalized, "!")
	return sentenceMarks <= len(chapterRefs)/2 && countWords(normalized) <= len(chapterRefs)*6
}

func cleanBookTitle(value string) string {
	title := strings.TrimSpace(value)
	title = strings.ReplaceAll(title, "_", " ")
	title = regexp.MustCompile(`(?i)\bOceanofPDF\.com\b`).ReplaceAllString(title, "")
	title = regexp.MustCompile(`(?i)\bOceanofPDF\b`).ReplaceAllString(title, "")
	title = regexp.MustCompile(`(?i)\bcom\b`).ReplaceAllString(title, "")
	title = strings.ReplaceAll(title, "-", " ")
	title = normalizeBookText(title)
	title = regexp.MustCompile(`\s+`).ReplaceAllString(title, " ")
	return strings.Trim(title, " ._-")
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
	navLabels := parseEPUBNavigationLabels(opf, manifest, fileByName)
	spine := parseEPUBSpine(opf)
	if len(spine) == 0 {
		for id := range manifest {
			spine = append(spine, id)
		}
		sort.Strings(spine)
	}

	chapters := make([]BookSourceChapter, 0, len(spine))
	sections := make([]BookSourceSection, 0, len(spine))
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
		title := navLabels[stripEPUBFragment(path)]
		if strings.TrimSpace(title) == "" {
			title = inferChapterTitle(chapterHTML, chapterIndex)
		}
		role := normalizeBookSectionRole("", title, path)
		isNarratable := isNarratableBookSection(role, title, chapterText)
		sectionID := fmt.Sprintf("epub-%d", chapterIndex)
		spans = append(spans, chapterSpans...)
		chapters = append(chapters, BookSourceChapter{
			Index:               chapterIndex,
			ID:                  sectionID,
			Title:               title,
			Text:                chapterText,
			WordCount:           len(chapterSpans),
			Role:                role,
			IsNarratable:        isNarratable,
			SourceHref:          path,
			EstimatedDurationMS: estimateBookDurationMS(len(chapterSpans)),
		})
		sections = append(sections, BookSourceSection{
			ID:                  sectionID,
			Index:               len(sections),
			Title:               title,
			Role:                role,
			IsNarratable:        isNarratable,
			Kind:                "chapter",
			ChapterIndex:        chapterIndex,
			SourceHref:          path,
			WordCount:           len(chapterSpans),
			EstimatedDurationMS: estimateBookDurationMS(len(chapterSpans)),
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
		title:            cleanBookTitle(title),
		author:           strings.TrimSpace(author),
		text:             combinedText,
		chapters:         chapters,
		sections:         sections,
		readingOrder:     sectionReadingOrder(sections),
		defaultSectionID: firstNarratableSectionID(sections),
		spans:            normalizeBookSpanIndexes(spans),
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
		if !strings.Contains(mediaType, "xhtml") &&
			!strings.Contains(mediaType, "html") &&
			!strings.Contains(mediaType, "dtbncx") &&
			!strings.HasSuffix(strings.ToLower(href), ".ncx") {
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

func parseEPUBNavigationLabels(
	opf string,
	manifest map[string]string,
	fileByName map[string]*zip.File,
) map[string]string {
	labels := map[string]string{}
	navPath := findEPUBNavPath(opf, manifest)
	if navPath != "" {
		if navHTML, err := readZipText(fileByName[navPath]); err == nil {
			for path, label := range parseEPUBNavHTMLLabels(navHTML, navPath) {
				labels[path] = label
			}
		}
	}
	ncxPath := findEPUBNCXPath(opf, manifest)
	if ncxPath != "" {
		if ncx, err := readZipText(fileByName[ncxPath]); err == nil {
			for path, label := range parseEPUBNCXLabels(ncx, ncxPath) {
				if labels[path] == "" {
					labels[path] = label
				}
			}
		}
	}
	return labels
}

func findEPUBNavPath(opf string, manifest map[string]string) string {
	itemPattern := regexp.MustCompile(`(?is)<item\s+[^>]*>`)
	idPattern := regexp.MustCompile(`\bid=["']([^"']+)["']`)
	propertiesPattern := regexp.MustCompile(`\bproperties=["']([^"']+)["']`)
	for _, item := range itemPattern.FindAllString(opf, -1) {
		id := regexSubmatch(idPattern, item)
		properties := strings.ToLower(regexSubmatch(propertiesPattern, item))
		if id != "" && strings.Contains(properties, "nav") {
			return manifest[id]
		}
	}
	for id, path := range manifest {
		lower := strings.ToLower(id + " " + path)
		if strings.Contains(lower, "nav") {
			return path
		}
	}
	return ""
}

func findEPUBNCXPath(opf string, manifest map[string]string) string {
	itemPattern := regexp.MustCompile(`(?is)<item\s+[^>]*>`)
	idPattern := regexp.MustCompile(`\bid=["']([^"']+)["']`)
	hrefPattern := regexp.MustCompile(`\bhref=["']([^"']+)["']`)
	mediaPattern := regexp.MustCompile(`\bmedia-type=["']([^"']+)["']`)
	for _, item := range itemPattern.FindAllString(opf, -1) {
		id := regexSubmatch(idPattern, item)
		href := regexSubmatch(hrefPattern, item)
		mediaType := strings.ToLower(regexSubmatch(mediaPattern, item))
		if id == "" || href == "" {
			continue
		}
		if strings.Contains(mediaType, "dtbncx") || strings.HasSuffix(strings.ToLower(href), ".ncx") {
			return manifest[id]
		}
	}
	return ""
}

func parseEPUBNavHTMLLabels(navHTML string, navPath string) map[string]string {
	labels := map[string]string{}
	linkPattern := regexp.MustCompile(`(?is)<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)</a>`)
	tocPattern := regexp.MustCompile(`(?is)<nav\b[^>]*(?:epub:type|type)=["'][^"']*\btoc\b[^"']*["'][^>]*>(.*?)</nav>`)
	if tocBody := regexSubmatch(tocPattern, navHTML); tocBody != "" {
		navHTML = tocBody
	}
	baseDir := filepath.ToSlash(filepath.Dir(navPath))
	if baseDir == "." {
		baseDir = ""
	}
	for _, match := range linkPattern.FindAllStringSubmatch(navHTML, -1) {
		if len(match) < 3 {
			continue
		}
		path := cleanEPUBHref(baseDir, match[1])
		label := normalizeBookText(html.UnescapeString(stripXMLTags(match[2])))
		if path != "" && label != "" {
			labels[path] = label
		}
	}
	return labels
}

func parseEPUBNCXLabels(ncx string, ncxPath string) map[string]string {
	labels := map[string]string{}
	pointPattern := regexp.MustCompile(`(?is)<navPoint\b[^>]*>(.*?)</navPoint>`)
	textPattern := regexp.MustCompile(`(?is)<text[^>]*>(.*?)</text>`)
	srcPattern := regexp.MustCompile(`(?is)<content\b[^>]*src=["']([^"']+)["']`)
	baseDir := filepath.ToSlash(filepath.Dir(ncxPath))
	if baseDir == "." {
		baseDir = ""
	}
	for _, match := range pointPattern.FindAllStringSubmatch(ncx, -1) {
		if len(match) < 2 {
			continue
		}
		body := match[1]
		path := cleanEPUBHref(baseDir, regexSubmatch(srcPattern, body))
		label := normalizeBookText(html.UnescapeString(stripXMLTags(regexSubmatch(textPattern, body))))
		if path != "" && label != "" {
			labels[path] = label
		}
	}
	return labels
}

func cleanEPUBHref(baseDir string, href string) string {
	href = stripEPUBFragment(strings.TrimSpace(href))
	if href == "" {
		return ""
	}
	return filepath.ToSlash(filepath.Clean(filepath.Join(baseDir, href)))
}

func stripEPUBFragment(value string) string {
	if index := strings.Index(value, "#"); index >= 0 {
		value = value[:index]
	}
	return filepath.ToSlash(filepath.Clean(value))
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
	value = strings.ReplaceAll(value, "\x00", "")
	value = strings.ReplaceAll(value, "\r\n", "\n")
	value = strings.ReplaceAll(value, "\r", "\n")
	value = strings.ReplaceAll(value, "ﬀ", "ff")
	value = strings.ReplaceAll(value, "ﬁ", "fi")
	value = strings.ReplaceAll(value, "ﬂ", "fl")
	value = strings.ReplaceAll(value, "ﬃ", "ffi")
	value = strings.ReplaceAll(value, "ﬄ", "ffl")
	lines := strings.Split(value, "\n")
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
