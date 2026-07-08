package pipeline_test

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func findPreparedBlockContaining(blocks []pipeline.NarrationBlock, text string) *pipeline.NarrationBlock {
	for index := range blocks {
		if strings.Contains(blocks[index].Text, text) {
			return &blocks[index]
		}
	}
	return nil
}

func findPreparedBlockByKind(
	blocks []pipeline.NarrationBlock,
	kind pipeline.NarrationBlockKind,
) *pipeline.NarrationBlock {
	for index := range blocks {
		if blocks[index].Kind == kind {
			return &blocks[index]
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func newMockService(t *testing.T, checker pipeline.VoiceChecker) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{
			MaxRetries:             3,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			BookSourceDir:          t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			ProgressDataDir:        t.TempDir(),
			PlaybackSessionDir:     t.TempDir(),
		},
	)
}

func newRecordingTTSService(
	t *testing.T,
	engineID string,
	agent pipeline.TTSAgent,
	supportsSSML bool,
) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agent,
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             3,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			BookSourceDir:          t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			ProgressDataDir:        t.TempDir(),
			PlaybackSessionDir:     t.TempDir(),
			DefaultTTSEngine:       engineID,
			TTSEngines: []pipeline.TTSEngineRegistration{{
				ID:    engineID,
				Agent: agent,
				Diagnostics: pipeline.TTSEngineDiagnostics{
					ID:           engineID,
					Label:        engineID,
					Status:       "ready",
					Local:        true,
					SupportsSSML: supportsSSML,
				},
			}},
		},
	)
}

func newBookSourceService(t *testing.T) *pipeline.Service {
	t.Helper()

	return newBookSourceServiceWithOptions(t, pipeline.Options{})
}

func newBookSourceServiceWithPDFScript(t *testing.T, scriptPath string) *pipeline.Service {
	t.Helper()

	return newBookSourceServiceWithOptions(t, pipeline.Options{
		BookPDFPythonPath:          "/bin/sh",
		BookPDFExtractorScriptPath: scriptPath,
	})
}

func newBookSourceServiceWithOptions(t *testing.T, options pipeline.Options) *pipeline.Service {
	t.Helper()
	if options.MaxRetries == 0 {
		options.MaxRetries = 3
	}
	if options.JobDataDir == "" {
		options.JobDataDir = t.TempDir()
	}
	if options.ProjectDataDir == "" {
		options.ProjectDataDir = t.TempDir()
	}
	if options.BookSourceDir == "" {
		options.BookSourceDir = t.TempDir()
	}
	if options.SourcePrepDir == "" {
		options.SourcePrepDir = t.TempDir()
	}
	if options.ProgressDataDir == "" {
		options.ProgressDataDir = t.TempDir()
	}
	if options.PlaybackSessionDir == "" {
		options.PlaybackSessionDir = t.TempDir()
	}
	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
}

func writeTestPDFExtractorScript(t *testing.T) string {
	t.Helper()
	scriptPath := filepath.Join(t.TempDir(), "pdf_extract_fixture.sh")
	body := `#!/bin/sh
if [ "${1:-}" = "--check" ]; then
  exit 0
fi
cat <<'JSON'
{"adapterVersion":"pdf-adapter-test","document":{"schemaVersion":"content-ir.v1","id":"fixture","sourceType":"bookSource","sourceId":"fixture","projectId":"default","sourceName":"fixture.pdf","adapterVersion":"pdf-adapter-test","generatedAt":"2026-05-16T12:00:00Z","metadata":{"title":"PDF Fixture","supportTier":"B","supportTierLabel":"Tier B: born-digital PDF","confidence":0.9,"extractorChain":[{"id":"detect","label":"Detect format and text-layer health","status":"done","confidence":1},{"id":"fixture","label":"Fixture extractor","status":"done","confidence":0.9}],"warnings":[]},"nodes":[{"nodeId":"page-0001","parentId":"","orderKey":"00000001","kind":"body","role":"body","displayText":"This is the first page.","normalisedText":"This is the first page.","speechText":"This is the first page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":0,"readingOrderIndex":0}},"offsets":{"start":0,"end":23},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"},{"nodeId":"page-0002","parentId":"","orderKey":"00000002","kind":"body","role":"body","displayText":"This is the second page.","normalisedText":"This is the second page.","speechText":"This is the second page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":1,"readingOrderIndex":0}},"offsets":{"start":25,"end":49},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"},{"nodeId":"page-0003","parentId":"","orderKey":"00000003","kind":"body","role":"body","displayText":"This is the third page.","normalisedText":"This is the third page.","speechText":"This is the third page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":2,"readingOrderIndex":0}},"offsets":{"start":51,"end":74},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"}]},"metadata":{"title":"PDF Fixture","supportTier":"B","supportTierLabel":"Tier B: born-digital PDF","confidence":0.9,"warnings":[]},"title":"PDF Fixture","warnings":[]}
JSON
`
	if err := os.WriteFile(scriptPath, []byte(body), 0o755); err != nil {
		t.Fatalf("WriteFile script returned error: %v", err)
	}
	return scriptPath
}

func writeTestEPUB(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
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
  <metadata>
    <dc:title>Northern Lights</dc:title>
    <dc:creator>Ada Reader</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter-one"/>
    <itemref idref="chapter-two"/>
  </spine>
</package>`,
		"OPS/chapter-one.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Opening</title></head>
<body><h1>Opening</h1><p>Det var en kylig kväll i Stockholm.</p></body></html>`,
		"OPS/chapter-two.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second Chapter</title></head>
<body><h1>Second Chapter</h1><p>The second chapter keeps the reader moving.</p></body></html>`,
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

func writeStructuredTestEPUB(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
		"EPUB/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>Structured Book</dc:title>
    <dc:creator>Reader Example</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>
    <item id="about" href="about.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="copyright"/>
    <itemref idref="chapter-one"/>
    <itemref idref="chapter-two"/>
    <itemref idref="about"/>
  </spine>
</package>`,
		"EPUB/nav.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc">
<ol>
<li><a href="copyright.xhtml">Copyright</a></li>
<li><a href="chapter-one.xhtml">Chapter 1: A Clean Start</a></li>
<li><a href="chapter-two.xhtml">Chapter 2: A Wider Sky</a></li>
<li><a href="about.xhtml">About the Author</a></li>
</ol>
</nav></body></html>`,
		"EPUB/copyright.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Copyright</title></head>
<body><h1>Copyright</h1><p>Copyright page. Not for narration.</p></body></html>`,
		"EPUB/chapter-one.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Raw One</title></head>
<body><h1>Raw One</h1><p>The first real chapter starts with clean narration text for the reader.</p></body></html>`,
		"EPUB/chapter-two.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Raw Two</title></head>
<body><h1>Raw Two</h1><p>The second real chapter keeps the guided cinema moving forward.</p></body></html>`,
		"EPUB/about.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>About</title></head>
<body><h1>About the Author</h1><p>Back matter. Not for narration.</p></body></html>`,
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

func writeTestDOCX(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create DOCX returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"docProps/core.xml": `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>DOCX Integration Fixture</dc:title><dc:creator>Adapter Writer</dc:creator></cp:coreProperties>`,
		"word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`,
		"word/footnotes.xml": `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:footnote w:id="2"><w:p><w:r><w:t>Footnote detail.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
		"word/endnotes.xml": `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:endnote w:id="3"><w:p><w:r><w:t>Endnote detail.</w:t></w:r></w:p></w:endnote></w:endnotes>`,
		"word/comments.xml": `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:comment w:id="4"><w:p><w:r><w:t>Comment detail.</w:t></w:r></w:p></w:comment></w:comments>`,
		"word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
<w:p><w:r><w:t>Body paragraph with notes.</w:t></w:r><w:footnoteReference w:id="2"/><w:commentReference w:id="4"/></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>List item one.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>Figure 1. A caption.</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="Diagram alt text"/><a:blip r:embed="rId5"/></wp:inline></w:drawing></w:r></w:p>
<w:p><w:r><w:t>Paragraph with endnote.</w:t></w:r><w:endnoteReference w:id="3"/></w:p>
</w:body></w:document>`,
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
		t.Fatalf("Close DOCX returned error: %v", err)
	}
	return outputPath
}

func writeTestHTML(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	if err := os.WriteFile(outputPath, []byte(testHTMLFixture()), 0o644); err != nil {
		t.Fatalf("Write HTML returned error: %v", err)
	}
	return outputPath
}

func testHTMLFixture() string {
	return `<!doctype html><html lang="en"><head><title>Synthetic Article</title></head><body><main><article>
<h1 id="synthetic-article">Synthetic Article</h1>
<p>Article lead paragraph with enough words for spans.</p>
<figure><img src="desk.jpg" alt="A newsroom desk"/><figcaption>Useful figure caption.</figcaption></figure>
<table><tr><th>Metric</th><td>Value</td></tr></table>
</article></main></body></html>`
}

func findTestSection(sections []pipeline.BookSourceSection, id string) *pipeline.BookSourceSection {
	for _, section := range sections {
		if section.ID == id {
			nextSection := section
			return &nextSection
		}
	}
	return nil
}

func waitForJob(t *testing.T, service *pipeline.Service, id string, status pipeline.JobStatus) pipeline.VoiceJob {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.Status == status {
			if status == pipeline.JobStatusCompleted && job.TemporarySourceID != "" {
				source, sourceErr := service.GetTemporarySource(job.TemporarySourceID)
				if sourceErr == nil && source.Status != pipeline.TemporarySourceStateGenerating {
					return job
				}
			} else {
				return job
			}
		}
		if job.Status == pipeline.JobStatusFailed {
			t.Fatalf("job failed: %s", job.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, _ := service.GetJob(id)
	t.Fatalf("job status = %q, want %q", job.Status, status)
	return pipeline.VoiceJob{}
}

func waitForFailedJob(t *testing.T, service *pipeline.Service, id string) pipeline.VoiceJob {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.Status == pipeline.JobStatusFailed {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, _ := service.GetJob(id)
	t.Fatalf("job status = %q, want %q", job.Status, pipeline.JobStatusFailed)
	return pipeline.VoiceJob{}
}

func waitForAudioSegments(t *testing.T, service *pipeline.Service, id string, minSegments int) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.AudioReadySegments >= minSegments {
			return
		}
		if job.Status == pipeline.JobStatusFailed {
			t.Fatalf("job failed: %s", job.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, err := service.GetJob(id)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	t.Fatalf("audio segments ready = %d, want >= %d", job.AudioReadySegments, minSegments)
}
