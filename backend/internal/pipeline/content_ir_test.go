package pipeline

import (
	"archive/zip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

var goldenContentIRTime = time.Date(2026, 5, 16, 12, 0, 0, 0, time.UTC)

func TestContentIRGoldenFixtures(t *testing.T) {
	t.Parallel()

	service := newContentIRTestService(t)
	for _, test := range []struct {
		name     string
		document contentir.Document
	}{
		{"simple_markdown", simpleMarkdownIRFixture(t, service)},
		{"markdown_table_code_citation", richMarkdownIRFixture(t, service)},
		{"small_epub_chapter", smallEPUBIRFixture(t, service)},
		{"born_digital_pdf_page", pdfIRFixture(t)},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			assertContentIRGolden(t, test.name+".json", test.document)
		})
	}
}

func TestPreparedSourceIRRoundTrip(t *testing.T) {
	t.Parallel()

	service := newContentIRTestService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", CreatePreparedSourceRequest{
		Kind:       PreparedSourceKindFile,
		SourceName: "roundtrip.md",
		Text:       "# Heading\n\nA sentence for narration.\n\n```go\nfmt.Println(\"skip\")\n```",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}

	roundTrip := PreparedSourceFromIR(PreparedSourceToIR(source, goldenContentIRTime), source)
	if roundTrip.SpeechText != source.SpeechText {
		t.Fatalf("speech text = %q, want %q", roundTrip.SpeechText, source.SpeechText)
	}
	if roundTrip.Blocks[0].SpeechPolicy.Profile != source.Blocks[0].SpeechPolicy.Profile {
		t.Fatalf("speech policy profile = %q, want %q", roundTrip.Blocks[0].SpeechPolicy.Profile, source.Blocks[0].SpeechPolicy.Profile)
	}
	if roundTrip.Summary.SkippedBlockCount != source.Summary.SkippedBlockCount {
		t.Fatalf("skipped blocks = %d, want %d", roundTrip.Summary.SkippedBlockCount, source.Summary.SkippedBlockCount)
	}
	if len(roundTrip.Blocks) != len(source.Blocks) || roundTrip.Blocks[0].ID != source.Blocks[0].ID {
		t.Fatalf("blocks = %#v, want ids from %#v", roundTrip.Blocks, source.Blocks)
	}
}

func TestGetContentIRSanitizesStaleSentenceWarnings(t *testing.T) {
	t.Parallel()

	service := newContentIRTestService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", CreatePreparedSourceRequest{
		Kind:       PreparedSourceKindFile,
		SourceName: "research.md",
		Text:       "Gartner reports that organisations with successful AI initiatives invest up to four times more in data quality, governance, AI-ready people, and change management than poor performers, and that organisations with the highest maturity of AI-ready data and analytics capabilities achieve up to 65% greater business outcomes.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	document := PreparedSourceToIR(source, goldenContentIRTime)
	document.Nodes[0].Warnings = append(document.Nodes[0].Warnings, warningSentenceTooLong)
	document.Nodes[0].Speech.SpeechPolicy = contentir.SpeechMetadata{}.SpeechPolicy
	encoded, err := contentir.JSONSerializer{}.Encode(document)
	if err != nil {
		t.Fatalf("Encode returned error: %v", err)
	}
	if err := os.WriteFile(filepath.Join(service.preparedSourceDataDir(source.ID), contentIRFilename), encoded, 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}

	loaded, err := service.GetContentIR(source.ID)
	if err != nil {
		t.Fatalf("GetContentIR returned error: %v", err)
	}
	if hasWarning(loaded.Nodes[0].Warnings, warningSentenceTooLong) {
		t.Fatalf("node warnings = %#v, want stale sentence_too_long removed", loaded.Nodes[0].Warnings)
	}
	if loaded.Nodes[0].Speech.SpeechPolicy.Profile != "Enterprise" {
		t.Fatalf("speech policy was not backfilled: %#v", loaded.Nodes[0].Speech.SpeechPolicy)
	}
}

func TestPreviewContentIRSpeechPolicyAppliesCurrentOverrides(t *testing.T) {
	t.Parallel()

	service := newContentIRTestService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", CreatePreparedSourceRequest{
		Kind:       PreparedSourceKindFile,
		SourceName: "preview.md",
		Text:       "# Preview\n\n```go\nfmt.Println(\"hello\")\n```",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	document, err := service.PreviewContentIRSpeechPolicy(source.ID, SpeechPolicyPreviewRequest{
		Profile:   "Enterprise",
		Overrides: policy.Overrides{CodeMode: policy.CodeModeLiteral},
	})
	if err != nil {
		t.Fatalf("PreviewContentIRSpeechPolicy returned error: %v", err)
	}
	var codeNode *contentir.Node
	for index := range document.Nodes {
		if document.Nodes[index].Kind == string(NarrationBlockKindCode) {
			codeNode = &document.Nodes[index]
			break
		}
	}
	if codeNode == nil {
		t.Fatalf("preview nodes = %#v, want code node", document.Nodes)
	}
	if codeNode.Speech.SpeechPolicy.Mode != string(policy.ModeLiteral) ||
		!strings.Contains(codeNode.SpeechText, "fmt.Println") {
		t.Fatalf("code node speech = %#v text=%q, want literal override", codeNode.Speech.SpeechPolicy, codeNode.SpeechText)
	}
}

func TestBookSourceIRRoundTrip(t *testing.T) {
	t.Parallel()

	service := newContentIRTestService(t)
	epubPath := writeContentIRTestEPUB(t)
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "content-ir.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}

	roundTrip := BookSourceFromIR(BookSourceToIR(book, goldenContentIRTime), book)
	if roundTrip.Text != book.Text {
		t.Fatalf("text = %q, want %q", roundTrip.Text, book.Text)
	}
	if len(roundTrip.Chapters) != len(book.Chapters) || len(roundTrip.WordSpans) != len(book.WordSpans) {
		t.Fatalf("round trip chapters/spans = %d/%d, want %d/%d", len(roundTrip.Chapters), len(roundTrip.WordSpans), len(book.Chapters), len(book.WordSpans))
	}
}

func simpleMarkdownIRFixture(t *testing.T, service *Service) contentir.Document {
	t.Helper()
	source, err := service.CreatePreparedSource(context.Background(), "default", CreatePreparedSourceRequest{
		Kind:       PreparedSourceKindFile,
		SourceName: "simple.md",
		Text:       "# Title\n\nHello world.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource(simple) returned error: %v", err)
	}
	source.ID = "simple-markdown"
	return PreparedSourceToIR(source, goldenContentIRTime)
}

func richMarkdownIRFixture(t *testing.T, service *Service) contentir.Document {
	t.Helper()
	source, err := service.CreatePreparedSource(context.Background(), "default", CreatePreparedSourceRequest{
		Kind:       PreparedSourceKindFile,
		SourceName: "research.md",
		Text: strings.Join([]string{
			"# Findings",
			"",
			"| Metric | Value |",
			"|---|---|",
			"| Latency | 12ms |",
			"",
			"```go",
			"fmt.Println(\"skip\")",
			"```",
			"",
			"citeturn1search0",
		}, "\n"),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource(rich) returned error: %v", err)
	}
	source.ID = "markdown-table-code-citation"
	return PreparedSourceToIR(source, goldenContentIRTime)
}

func smallEPUBIRFixture(t *testing.T, service *Service) contentir.Document {
	t.Helper()
	epubPath := writeContentIRTestEPUB(t)
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "content-ir.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource(epub) returned error: %v", err)
	}
	book.ID = "small-epub-chapter"
	return BookSourceToIR(book, goldenContentIRTime)
}

func pdfIRFixture(t *testing.T) contentir.Document {
	t.Helper()
	book := BookSource{
		ID:          "pdf-fixture",
		ProjectID:   "default",
		Status:      BookSourceStatusReady,
		Kind:        BookSourceKindPDF,
		SourceFile:  "page.pdf",
		SourceBytes: 32,
		Title:       "PDF Fixture",
		Text:        "The first page has a born-digital text layer.",
		WordCount:   8,
		PageCount:   1,
		Pages: []BookSourcePage{{
			Index:     1,
			Label:     "Page 1",
			Text:      "The first page has a born-digital text layer.",
			WordCount: 8,
		}},
		WordSpans: normalizeBookSpanIndexes(buildBookWordSpans("The first page has a born-digital text layer.", 1, 0, 0)),
		CreatedAt: goldenContentIRTime,
		UpdatedAt: goldenContentIRTime,
	}
	return BookSourceToIR(book, goldenContentIRTime)
}

func assertContentIRGolden(t *testing.T, filename string, document contentir.Document) {
	t.Helper()
	actual, err := contentir.JSONSerializer{}.Encode(document)
	if err != nil {
		t.Fatalf("Encode returned error: %v", err)
	}
	goldenPath := filepath.Join("..", "contentir", "testdata", "golden", filename)
	if os.Getenv("UPDATE_CONTENT_IR_GOLDEN") == "1" {
		if err := os.WriteFile(goldenPath, actual, 0o644); err != nil {
			t.Fatalf("Update golden %s returned error: %v", goldenPath, err)
		}
		return
	}
	expected, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("ReadFile(%s) returned error: %v\nActual:\n%s", goldenPath, err, actual)
	}
	expectedCanonical := canonicalContentIRJSON(t, expected)
	actualCanonical := canonicalContentIRJSON(t, actual)
	if expectedCanonical != actualCanonical {
		t.Fatalf("golden mismatch for %s\nExpected:\n%s\nActual:\n%s", filename, expectedCanonical, actualCanonical)
	}
}

func canonicalContentIRJSON(t *testing.T, data []byte) string {
	t.Helper()
	var decoded contentir.Document
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("content IR should decode as JSON: %v", err)
	}
	encoded, err := contentir.JSONSerializer{}.Encode(decoded)
	if err != nil {
		t.Fatalf("Encode canonical content IR returned error: %v", err)
	}
	return strings.TrimSpace(string(encoded))
}

func newContentIRTestService(t *testing.T) *Service {
	t.Helper()
	return NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		Options{
			MaxRetries:         3,
			JobDataDir:         t.TempDir(),
			ProjectDataDir:     t.TempDir(),
			BookSourceDir:      t.TempDir(),
			SourcePrepDir:      t.TempDir(),
			ProgressDataDir:    t.TempDir(),
			PlaybackSessionDir: t.TempDir(),
		},
	)
}

func writeContentIRTestEPUB(t *testing.T) string {
	t.Helper()
	outputPath := filepath.Join(t.TempDir(), "content-ir.epub")
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
		"OPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata><dc:title>Content IR Book</dc:title><dc:creator>Ada Reader</dc:creator></metadata>
  <manifest><item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter-one"/></spine>
</package>`,
		"OPS/chapter-one.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Opening</title></head>
<body><h1>Opening</h1><p>Content IR keeps structure and spoken text together.</p></body></html>`,
	}
	for path, body := range files {
		writer, createErr := zipWriter.Create(path)
		if createErr != nil {
			t.Fatalf("Create zip file returned error: %v", createErr)
		}
		if _, writeErr := writer.Write([]byte(body)); writeErr != nil {
			t.Fatalf("Write zip file returned error: %v", writeErr)
		}
	}
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("Close zip writer returned error: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close EPUB returned error: %v", err)
	}
	return outputPath
}
