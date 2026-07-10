package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

const pythonModuleProbeTimeout = time.Second

type adapterCLIResult struct {
	AdapterVersion string             `json:"adapterVersion"`
	Author         string             `json:"author,omitempty"`
	Capabilities   AdapterCapability  `json:"capabilities"`
	Diagnostics    AdapterDiagnostics `json:"diagnostics"`
	Document       contentir.Document `json:"document"`
	Metadata       map[string]any     `json:"metadata,omitempty"`
	Title          string             `json:"title,omitempty"`
	Warnings       []string           `json:"warnings,omitempty"`
}

type adapterCLIPayload struct {
	GeneratedAt   time.Time `json:"generatedAt"`
	ImportProfile string    `json:"importProfile,omitempty"`
	PDFTableMode  string    `json:"pdfTableMode,omitempty"`
	ProjectID     string    `json:"projectId"`
	SourceID      string    `json:"sourceId"`
	SourceName    string    `json:"sourceName"`
	SourcePath    string    `json:"sourcePath"`
	SourcePaths   []string  `json:"sourcePaths,omitempty"`
	SourceType    string    `json:"sourceType"`
}

func (service *Service) extractBookSourceIR(
	ctx context.Context,
	kind BookSourceKind,
	sourcePaths []string,
	sourceFileName string,
	book BookSource,
	generatedAt time.Time,
	options BookSourceImportOptions,
) (contentir.Document, error) {
	switch kind {
	case BookSourceKindPDF, BookSourceKindImage:
		return service.runPDFAdapter(ctx, sourcePaths, sourceFileName, book, generatedAt, options)
	case BookSourceKindMarkdown:
		if len(sourcePaths) == 0 {
			return contentir.Document{}, fmt.Errorf("markdown adapter requires a source file")
		}
		return service.markdownBookSourceIR(sourcePaths[0], sourceFileName, book, generatedAt)
	case BookSourceKindEPUB, BookSourceKindDOCX, BookSourceKindHTML:
		if len(sourcePaths) == 0 {
			return contentir.Document{}, fmt.Errorf("%s adapter requires a source file", kind)
		}
		return service.runBookAdapter(ctx, kind, sourcePaths[0], sourceFileName, book, generatedAt)
	default:
		return contentir.Document{}, fmt.Errorf("unsupported book source type")
	}
}

func (service *Service) markdownBookSourceIR(
	sourcePath string,
	sourceFileName string,
	book BookSource,
	generatedAt time.Time,
) (contentir.Document, error) {
	data, err := os.ReadFile(sourcePath)
	if err != nil {
		return contentir.Document{}, fmt.Errorf("read markdown book source: %w", err)
	}
	sourceText := strings.TrimSpace(string(data))
	if sourceText == "" {
		return contentir.Document{}, ErrEmptyText
	}
	preprocessed := preprocessReadableSource(
		sourceText,
		sourceFileName,
		"text/markdown",
		service.options.SourcePrepSentenceMaxRunes,
		"strict",
		"",
	)
	blocks, sections := markdownBookSectionsFromBlocks(preprocessed.Blocks)
	metadata := cloneAnyMap(preprocessed.Metadata)
	if metadata == nil {
		metadata = map[string]any{}
	}
	title := firstNonEmpty(preprocessed.Title, markdownFirstHeading(sourceText), cleanBookTitle(strings.TrimSuffix(filepath.Base(sourceFileName), filepath.Ext(sourceFileName))))
	metadata["title"] = title
	metadata["sourceFormat"] = "markdown"
	metadata["renderMode"] = "markdown"
	metadata["sections"] = markdownBookSectionMetadata(sections)
	source := PreparedSource{
		ID:                  book.ID,
		ProjectID:           book.ProjectID,
		Status:              PreparedSourceStatusReady,
		Kind:                PreparedSourceKindBook,
		SourceName:          sourceFileName,
		SourceContentType:   "text/markdown",
		SourceBytes:         book.SourceBytes,
		PreprocessorID:      firstNonEmpty(preprocessed.PreprocessorID, "markdown-book"),
		PreprocessorVersion: firstNonEmpty(preprocessed.PreprocessorVersion, "markdown-book-source-v1"),
		SourceFormat:        "markdown",
		RenderMode:          "markdown",
		MarkdownParseMode:   firstNonEmpty(preprocessed.MarkdownParseMode, "strict"),
		Title:               title,
		Text:                sourceText,
		Blocks:              blocks,
		Warnings:            preprocessed.Warnings,
		Metadata:            metadata,
		SpeechText:          preparedSourceSpeechText(blocks),
		WordCount:           countWords(preparedSourceSpeechText(blocks)),
		BlockCount:          len(blocks),
		SegmentCount:        countPreparedSegments(blocks),
		Summary:             summarizePreparedSource(blocks),
		CreatedAt:           generatedAt.UTC(),
		UpdatedAt:           generatedAt.UTC(),
	}
	document := PreparedSourceToIR(source, generatedAt)
	document.SourceType = "bookSource"
	document.SourceID = book.ID
	document.ID = book.ID
	document.ProjectID = book.ProjectID
	document.SourceName = sourceFileName
	document.AdapterVersion = firstNonEmpty(source.PreprocessorVersion, "markdown-book-source-v1")
	return document, nil
}

func markdownBookSectionsFromBlocks(blocks []NarrationBlock) ([]NarrationBlock, []BookSourceSection) {
	if len(blocks) == 0 {
		return nil, nil
	}
	nextBlocks := cloneNarrationBlocks(blocks)
	sections := make([]BookSourceSection, 0)
	currentIndex := -1
	ensureSection := func(title string, role string) int {
		if strings.TrimSpace(title) == "" {
			title = "Document"
		}
		sectionID := fmt.Sprintf("markdown-section-%04d", len(sections)+1)
		sections = append(sections, BookSourceSection{
			ID:           sectionID,
			Index:        len(sections),
			Title:        title,
			Role:         firstNonEmpty(role, bookSectionRoleBody),
			IsNarratable: true,
			Kind:         "chapter",
			ChapterIndex: len(sections) + 1,
		})
		return len(sections) - 1
	}
	for index := range nextBlocks {
		block := &nextBlocks[index]
		if block.Kind == NarrationBlockKindHeading || block.Kind == NarrationBlockKindSubheading {
			currentIndex = ensureSection(firstNonEmpty(strings.TrimSpace(block.Label), cleanMarkdownInline(block.Text)), bookSectionRoleBody)
		} else if currentIndex < 0 {
			currentIndex = ensureSection("Document", bookSectionRoleBody)
		}
		section := &sections[currentIndex]
		text := strings.TrimSpace(firstNonEmpty(block.SpokenText, block.Text))
		section.WordCount += countWords(text)
		section.EstimatedDurationMS = estimateBookDurationMS(section.WordCount)
		if block.Metadata == nil {
			block.Metadata = map[string]any{}
		}
		block.Metadata["sectionId"] = section.ID
	}
	return nextBlocks, sections
}

func markdownBookSectionMetadata(sections []BookSourceSection) []map[string]any {
	items := make([]map[string]any, 0, len(sections))
	for _, section := range sections {
		items = append(items, map[string]any{
			"id":                  section.ID,
			"index":               section.Index,
			"title":               section.Title,
			"role":                section.Role,
			"isNarratable":        section.IsNarratable,
			"kind":                section.Kind,
			"chapterIndex":        section.ChapterIndex,
			"wordCount":           section.WordCount,
			"estimatedDurationMs": section.EstimatedDurationMS,
		})
	}
	return items
}

func (service *Service) runPDFAdapter(
	ctx context.Context,
	sourcePaths []string,
	sourceFileName string,
	book BookSource,
	generatedAt time.Time,
	options BookSourceImportOptions,
) (contentir.Document, error) {
	if len(sourcePaths) == 0 {
		return contentir.Document{}, fmt.Errorf("PDF adapter requires at least one source file")
	}
	scriptPath, err := service.pdfAdapterCLIPath()
	if err != nil {
		return contentir.Document{}, err
	}
	pythonPath := service.pdfAdapterPythonPath()
	payload, err := json.Marshal(adapterCLIPayload{
		GeneratedAt:   generatedAt,
		ImportProfile: string(normalizeBookImportProfile(options.ImportProfile)),
		PDFTableMode:  string(normalizePDFTableMode(options.PDFTableMode)),
		ProjectID:     book.ProjectID,
		SourceID:      book.ID,
		SourceName:    sourceFileName,
		SourcePath:    sourcePaths[0],
		SourcePaths:   sourcePaths,
		SourceType:    "bookSource",
	})
	if err != nil {
		return contentir.Document{}, err
	}
	command := exec.CommandContext(ctx, pythonPath, scriptPath)
	command.Stdin = bytes.NewReader(payload)
	output, err := command.CombinedOutput()
	if err != nil {
		return contentir.Document{}, fmt.Errorf("pdf adapter failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	var result adapterCLIResult
	if err := json.Unmarshal(output, &result); err != nil {
		return contentir.Document{}, fmt.Errorf("decode pdf adapter output: %w", err)
	}
	document := result.Document
	if document.SchemaVersion == "" || len(document.Nodes) == 0 {
		return contentir.Document{}, fmt.Errorf("pdf adapter returned no Content IR nodes")
	}
	document.ID = book.ID
	document.SourceID = book.ID
	document.ProjectID = book.ProjectID
	document.SourceName = sourceFileName
	document.SourceType = "bookSource"
	if document.AdapterVersion == "" {
		document.AdapterVersion = firstNonEmpty(result.AdapterVersion, "pdf-adapter-v1")
	}
	if document.GeneratedAt.IsZero() {
		document.GeneratedAt = generatedAt.UTC()
	}
	return document, nil
}

func (service *Service) runBookAdapter(
	ctx context.Context,
	kind BookSourceKind,
	sourcePath string,
	sourceFileName string,
	book BookSource,
	generatedAt time.Time,
) (contentir.Document, error) {
	cliPath, err := adapterCLIPath(string(kind))
	if err != nil {
		return contentir.Document{}, err
	}
	payload, err := json.Marshal(adapterCLIPayload{
		GeneratedAt: generatedAt,
		ProjectID:   book.ProjectID,
		SourceID:    book.ID,
		SourceName:  sourceFileName,
		SourcePath:  sourcePath,
		SourceType:  "bookSource",
	})
	if err != nil {
		return contentir.Document{}, err
	}
	command := exec.CommandContext(ctx, "node", cliPath)
	command.Stdin = bytes.NewReader(payload)
	output, err := command.CombinedOutput()
	if err != nil {
		return contentir.Document{}, fmt.Errorf("%s adapter failed: %w: %s", kind, err, strings.TrimSpace(string(output)))
	}
	var result adapterCLIResult
	if err := json.Unmarshal(output, &result); err != nil {
		return contentir.Document{}, fmt.Errorf("decode %s adapter output: %w", kind, err)
	}
	document := result.Document
	if document.SchemaVersion == "" || len(document.Nodes) == 0 {
		return contentir.Document{}, fmt.Errorf("%s adapter returned no Content IR nodes", kind)
	}
	document.ID = book.ID
	document.SourceID = book.ID
	document.ProjectID = book.ProjectID
	document.SourceName = sourceFileName
	document.SourceType = "bookSource"
	if document.AdapterVersion == "" {
		document.AdapterVersion = result.AdapterVersion
	}
	if document.GeneratedAt.IsZero() {
		document.GeneratedAt = generatedAt.UTC()
	}
	return document, nil
}

func (service *Service) AdapterCapabilities() []AdapterCapability {
	return []AdapterCapability{
		{
			AdapterID:   "pdf",
			Extensions:  []string{".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".webp"},
			MimeTypes:   []string{"application/pdf", "image/png", "image/jpeg", "image/tiff", "image/webp"},
			SourceKinds: []string{"file", "url", "bookSource"},
			Features: map[string]any{
				"bibliography":     true,
				"confidence":       true,
				"extractorChain":   true,
				"figures":          true,
				"ocr":              true,
				"supportTiers":     []string{"A", "B", "C", "D", "E"},
				"tables":           true,
				"taggedPDF":        true,
				"imageBatchImport": true,
			},
		},
		{
			AdapterID:   "epub",
			Extensions:  []string{".epub"},
			MimeTypes:   []string{"application/epub+zip"},
			SourceKinds: []string{"file", "url", "bookSource"},
			Features: map[string]any{
				"captions":       true,
				"epubCfi":        "best-effort",
				"fragments":      true,
				"mediaOverlays":  true,
				"metadata":       true,
				"spineTraversal": true,
				"tables":         true,
			},
		},
		{
			AdapterID:   "docx",
			Extensions:  []string{".docx"},
			MimeTypes:   []string{"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
			SourceKinds: []string{"file", "bookSource"},
			Features: map[string]any{
				"captions":               true,
				"comments":               true,
				"endnotes":               true,
				"footnotes":              true,
				"headings":               true,
				"images":                 true,
				"lists":                  true,
				"paragraphRunProvenance": true,
				"tables":                 true,
			},
		},
		{
			AdapterID:   "markdown",
			Extensions:  []string{".md", ".markdown"},
			MimeTypes:   []string{"text/markdown", "text/x-markdown"},
			SourceKinds: []string{"file", "url", "bookSource"},
			Features: map[string]any{
				"headings":        true,
				"lists":           true,
				"tables":          true,
				"code":            true,
				"renderMode":      "markdown",
				"preAudioPreview": true,
				"speechPolicyIR":  true,
			},
		},
		{
			AdapterID:   "html",
			Extensions:  []string{".html", ".htm", ".zip"},
			MimeTypes:   []string{"text/html", "application/xhtml+xml", "application/zip"},
			SourceKinds: []string{"file", "url", "bookSource"},
			Features: map[string]any{
				"altText":         true,
				"captions":        true,
				"figures":         true,
				"fragments":       true,
				"langPropagation": true,
				"semanticBlocks":  true,
				"tables":          true,
			},
		},
	}
}

func (service *Service) AdapterDiagnostics() map[string]AdapterDiagnostics {
	diagnostics := map[string]AdapterDiagnostics{}
	for _, capability := range service.AdapterCapabilities() {
		if capability.AdapterID == "pdf" {
			diagnostics[capability.AdapterID] = service.pdfAdapterDiagnostics()
			continue
		}
		cliPath, err := adapterCLIPath(capability.AdapterID)
		status := "available"
		warnings := []string{}
		available := err == nil && commandAvailable("node")
		if err != nil {
			status = "missing"
			warnings = append(warnings, err.Error())
		} else if !commandAvailable("node") {
			status = "node-unavailable"
			warnings = append(warnings, "node executable is not available")
		}
		diagnostics[capability.AdapterID] = AdapterDiagnostics{
			AdapterID: capability.AdapterID,
			Available: available,
			Status:    status,
			CLIPath:   cliPath,
			Warnings:  warnings,
		}
	}
	return diagnostics
}

func (service *Service) pdfAdapterDiagnostics() AdapterDiagnostics {
	scriptPath, err := service.pdfAdapterCLIPath()
	warnings := []string{}
	if err != nil {
		warnings = append(warnings, err.Error())
	}
	pythonPath := service.pdfAdapterPythonPath()
	pythonAvailable := commandAvailable(pythonPath)
	if !pythonAvailable {
		warnings = append(warnings, "python executable is not available")
	}
	pymupdfAvailable := service.pythonModuleAvailable("fitz")
	pdfplumberAvailable := service.pythonModuleAvailable("pdfplumber")
	ocrmypdfAvailable := commandAvailable("ocrmypdf")
	tesseractAvailable := commandAvailable("tesseract")
	pdftotextAvailable := commandAvailable("pdftotext")
	tools := map[string]AdapterToolDiagnostics{
		"python":     adapterToolStatus(pythonAvailable),
		"pymupdf":    adapterToolStatus(pymupdfAvailable),
		"pdfplumber": adapterToolStatus(pdfplumberAvailable),
		"ocrmypdf":   adapterToolStatus(ocrmypdfAvailable),
		"tesseract":  adapterToolStatus(tesseractAvailable),
		"grobid":     adapterToolStatus(commandAvailable("grobid")),
		"pdftotext":  adapterToolStatus(pdftotextAvailable),
	}
	extractorAvailable := pymupdfAvailable || pdftotextAvailable || ocrmypdfAvailable || tesseractAvailable
	if !extractorAvailable {
		warnings = append(warnings, "no PDF text or OCR extractor is available")
	}
	available := err == nil && pythonAvailable && extractorAvailable
	status := "available"
	if !available {
		status = "missing"
	}
	return AdapterDiagnostics{
		AdapterID: "pdf",
		Available: available,
		Status:    status,
		CLIPath:   scriptPath,
		Warnings:  warnings,
		Tools:     tools,
	}
}

func adapterToolStatus(available bool) AdapterToolDiagnostics {
	status := "missing"
	if available {
		status = "available"
	}
	return AdapterToolDiagnostics{Available: available, Status: status}
}

func (service *Service) pythonModuleAvailable(moduleName string) bool {
	pythonPath := service.pdfAdapterPythonPath()
	if !commandAvailable(pythonPath) {
		return false
	}
	ctx, cancel := context.WithTimeout(context.Background(), pythonModuleProbeTimeout)
	defer cancel()
	command := exec.CommandContext(ctx, pythonPath, "-c", "import "+moduleName)
	return command.Run() == nil
}

func (service *Service) pdfAdapterPythonPath() string {
	configured := strings.TrimSpace(service.options.BookPDFPythonPath)
	if configured != "" && commandAvailable(configured) {
		return configured
	}
	if python3, err := exec.LookPath("python3"); err == nil {
		return python3
	}
	if configured != "" {
		return configured
	}
	return "python3"
}

func (service *Service) pdfAdapterCLIPath() (string, error) {
	scriptPath := strings.TrimSpace(service.options.BookPDFExtractorScriptPath)
	if scriptPath == "" {
		scriptPath = defaultBookPDFExtractorScriptPath
	}
	if filepath.IsAbs(scriptPath) {
		if _, err := os.Stat(scriptPath); err != nil {
			return scriptPath, err
		}
		return scriptPath, nil
	}
	root, err := repositoryRoot()
	if err != nil {
		return scriptPath, err
	}
	absPath := filepath.Join(root, scriptPath)
	if _, err := os.Stat(absPath); err != nil {
		return absPath, err
	}
	return absPath, nil
}

func adapterCLIPath(adapterID string) (string, error) {
	root, err := repositoryRoot()
	if err != nil {
		return "", err
	}
	path := filepath.Join(root, "adapters", adapterID, "cli.js")
	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return path, fmt.Errorf("%s adapter CLI is missing", adapterID)
		}
		return path, err
	}
	return path, nil
}

func repositoryRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	for {
		if fileExists(filepath.Join(dir, "package.json")) && fileExists(filepath.Join(dir, "adapters")) {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("repository root not found")
		}
		dir = parent
	}
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
