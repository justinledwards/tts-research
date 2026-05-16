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
	GeneratedAt time.Time `json:"generatedAt"`
	ProjectID   string    `json:"projectId"`
	SourceID    string    `json:"sourceId"`
	SourceName  string    `json:"sourceName"`
	SourcePath  string    `json:"sourcePath"`
	SourceType  string    `json:"sourceType"`
}

func (service *Service) extractBookSourceIR(
	ctx context.Context,
	kind BookSourceKind,
	sourcePath string,
	sourceFileName string,
	book BookSource,
	generatedAt time.Time,
) (contentir.Document, error) {
	switch kind {
	case BookSourceKindPDF:
		extraction, err := service.extractPDFBookSource(ctx, sourcePath, sourceFileName)
		if err != nil {
			return contentir.Document{}, err
		}
		book.Title = extraction.title
		book.Author = extraction.author
		book.Text = extraction.text
		book.Pages = extraction.pages
		book.Chapters = extraction.chapters
		book.StructureVersion = extraction.structureVersion()
		book.DefaultSectionID = extraction.defaultSectionID
		book.ReadingOrder = extraction.readingOrder
		book.Sections = extraction.sections
		book.Warnings = extraction.warnings
		book.WordSpans = extraction.spans
		book.WordCount = len(extraction.spans)
		book.PageCount = len(extraction.pages)
		book.ChapterCount = countNarratableChapters(extraction.chapters)
		return BookSourceToIR(book, generatedAt), nil
	case BookSourceKindEPUB, BookSourceKindDOCX, BookSourceKindHTML:
		return service.runBookAdapter(ctx, kind, sourcePath, sourceFileName, book, generatedAt)
	default:
		return contentir.Document{}, fmt.Errorf("unsupported book source type")
	}
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
