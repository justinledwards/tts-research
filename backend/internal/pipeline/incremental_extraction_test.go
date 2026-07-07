package pipeline

import (
	"archive/zip"
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func TestIncrementalHTMLBookSourceWritesReadableUnitAndReadalongSnapshots(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	observed := make([]IncrementalExtractionSnapshot, 0)
	options.incrementalExtractionObserver = func(_ context.Context, snapshot IncrementalExtractionSnapshot) {
		if snapshot.Kind == BookSourceKindHTML {
			observed = append(observed, snapshot)
		}
	}
	service := NewService(nil, nil, nil, options)
	sourcePath := writeIncrementalHTMLFixture(t)
	info, err := os.Stat(sourcePath)
	if err != nil {
		t.Fatalf("Stat HTML fixture returned error: %v", err)
	}

	book, err := service.CreateBookSource(context.Background(), defaultProjectID, sourcePath, "incremental.html", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource(html) returned error: %v", err)
	}
	if book.Kind != BookSourceKindHTML || book.Status != BookSourceStatusReady {
		t.Fatalf("book = %#v, want ready HTML source", book)
	}
	document, err := service.GetContentIR(book.ID)
	if err != nil {
		t.Fatalf("GetContentIR(html) returned error: %v", err)
	}
	if len(document.Nodes) < 3 {
		t.Fatalf("HTML fixture produced %d Content IR nodes, want at least 3", len(document.Nodes))
	}
	if len(observed) != len(document.Nodes) {
		t.Fatalf("observed %d incremental snapshots, want one per Content IR node (%d)", len(observed), len(document.Nodes))
	}

	first := observed[0]
	if first.SourceID != book.ID || first.SourceRevisionID != bookSourceRevisionID(book.ID) || first.ExtractionRevisionID == "" {
		t.Fatalf("first snapshot binding = %#v, want stable source/revision/extraction IDs", first)
	}
	if first.ReadingUnitManifest.Summary.UnitCount != 1 || first.ReadingUnitManifest.Summary.ReadableCount != 1 || len(first.ReadalongManifest.UnitIDs) != 1 {
		t.Fatalf("first snapshot = %#v / %#v, want one readable unit and one readalong unit", first.ReadingUnitManifest.Summary, first.ReadalongManifest.UnitIDs)
	}
	if first.ReadingUnitManifest.Units[0].UnitID != document.Nodes[0].NodeID || first.ReadingUnitManifest.Units[0].Fingerprint != metadataValueString(document.Nodes[0].Metadata, "fingerprint") {
		t.Fatalf("first unit = %#v, want stable Content IR node identity/fingerprint", first.ReadingUnitManifest.Units[0])
	}
	if first.ReadingUnitManifest.Units[0].Locator["type"] != "html" {
		t.Fatalf("first unit locator = %#v, want HTML locator", first.ReadingUnitManifest.Units[0].Locator)
	}

	final := observed[len(observed)-1]
	if final.ReadingUnitManifest.Summary.UnitCount != len(document.Nodes) || final.ReadalongManifest.ReadingUnitManifestID != final.ReadingUnitManifest.ManifestID {
		t.Fatalf("final snapshot = %#v / %#v, want all units and readalong bound to reading-unit manifest", final.ReadingUnitManifest, final.ReadalongManifest)
	}
	if !reflect.DeepEqual(final.ReadalongManifest.UnitIDs, contentIRNodeIDs(document)) {
		t.Fatalf("final readalong unit IDs = %#v, want Content IR node IDs %#v", final.ReadalongManifest.UnitIDs, contentIRNodeIDs(document))
	}
	currentReadingUnit, err := service.GetCurrentReadingUnitManifest(book.ID, bookSourceRevisionID(book.ID))
	if err != nil {
		t.Fatalf("GetCurrentReadingUnitManifest(html) returned error: %v", err)
	}
	if currentReadingUnit.ManifestID != final.ReadingUnitManifest.ManifestID {
		t.Fatalf("current reading-unit manifest = %q, want final %q", currentReadingUnit.ManifestID, final.ReadingUnitManifest.ManifestID)
	}
	if len(observed) > 1 {
		superseded, err := service.GetReadingUnitManifest(first.ReadingUnitManifest.ManifestID)
		if err != nil {
			t.Fatalf("GetReadingUnitManifest(first) returned error: %v", err)
		}
		if superseded.State != ManifestSnapshotStateSuperseded || superseded.SupersededByManifestID == "" {
			t.Fatalf("first reading-unit manifest = %#v, want superseded by a later incremental snapshot", superseded)
		}
	}

	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, book.ID, sourceLifecycleEnvelopeFilename), &envelope)
	if envelope.SourceID != book.ID || envelope.CurrentRevisionID != bookSourceRevisionID(book.ID) || metadataWorkStatus(envelope.Metadata) != SourceLifecycleWorkStatusComplete {
		t.Fatalf("HTML source lifecycle envelope = %#v, want complete source-bound lifecycle", envelope)
	}
}

func TestIncrementalEPUBBookSourceWritesDegradedCurrentSnapshotsAndReloads(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	observed := make([]IncrementalExtractionSnapshot, 0)
	options.incrementalExtractionObserver = func(_ context.Context, snapshot IncrementalExtractionSnapshot) {
		if snapshot.Kind == BookSourceKindEPUB {
			observed = append(observed, snapshot)
		}
	}
	service := NewService(nil, nil, nil, options)
	sourcePath := writeIncrementalEPUBFixture(t)
	info, err := os.Stat(sourcePath)
	if err != nil {
		t.Fatalf("Stat EPUB fixture returned error: %v", err)
	}

	book, err := service.CreateBookSource(context.Background(), defaultProjectID, sourcePath, "incremental.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource(epub) returned error: %v", err)
	}
	document, err := service.GetContentIR(book.ID)
	if err != nil {
		t.Fatalf("GetContentIR(epub) returned error: %v", err)
	}
	if len(document.Nodes) < 4 {
		t.Fatalf("EPUB fixture produced %d Content IR nodes, want at least 4", len(document.Nodes))
	}
	if len(observed) != len(document.Nodes) {
		t.Fatalf("observed %d EPUB snapshots, want %d", len(observed), len(document.Nodes))
	}
	final := observed[len(observed)-1]
	if final.SourceID != book.ID || final.SourceRevisionID != bookSourceRevisionID(book.ID) {
		t.Fatalf("final EPUB snapshot binding = %#v, want book source/revision binding", final)
	}
	if final.ReadingUnitManifest.Summary.Degraded == nil || !*final.ReadingUnitManifest.Summary.Degraded || len(final.ReadingUnitManifest.Warnings) == 0 {
		t.Fatalf("final EPUB summary/warnings = %#v / %#v, want degraded warning-bearing completion", final.ReadingUnitManifest.Summary, final.ReadingUnitManifest.Warnings)
	}
	if final.ReadingUnitManifest.Units[0].Locator["type"] != "epub" {
		t.Fatalf("first EPUB unit locator = %#v, want EPUB locator", final.ReadingUnitManifest.Units[0].Locator)
	}
	assertManifestUnitsMatchContentIR(t, final.ReadingUnitManifest, document)
	if !reflect.DeepEqual(final.ReadalongManifest.UnitIDs, contentIRNodeIDs(document)) {
		t.Fatalf("final EPUB readalong units = %#v, want Content IR node IDs", final.ReadalongManifest.UnitIDs)
	}

	reloaded := NewService(nil, nil, nil, options)
	reloadedReadingUnit, err := reloaded.GetCurrentReadingUnitManifest(book.ID, bookSourceRevisionID(book.ID))
	if err != nil {
		t.Fatalf("reloaded GetCurrentReadingUnitManifest(epub) returned error: %v", err)
	}
	if reloadedReadingUnit.ManifestID != final.ReadingUnitManifest.ManifestID || reloadedReadingUnit.SourceRevisionID != bookSourceRevisionID(book.ID) {
		t.Fatalf("reloaded reading-unit manifest = %#v, want final source-bound current", reloadedReadingUnit)
	}
	reloadedReadalong, err := reloaded.GetCurrentReadalongManifest(book.ID, bookSourceRevisionID(book.ID))
	if err != nil {
		t.Fatalf("reloaded GetCurrentReadalongManifest(epub) returned error: %v", err)
	}
	if reloadedReadalong.ManifestID != final.ReadalongManifest.ManifestID || reloadedReadalong.ReadingUnitManifestID != final.ReadingUnitManifest.ManifestID {
		t.Fatalf("reloaded readalong manifest = %#v, want final bound readalong current", reloadedReadalong)
	}

	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, book.ID, "revisions", bookSourceRevisionID(book.ID), sourceLifecycleRevisionFilename), &revision)
	if revision.SourceID != book.ID || metadataWorkStatus(revision.Metadata) != SourceLifecycleWorkStatusCompleteWithWarnings {
		t.Fatalf("EPUB source revision = %#v, want complete_with_warnings source revision", revision)
	}
}

func TestIncrementalReadalongWriteFailureDoesNotLeaveCurrentReadingUnitHalfPair(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	observed := make([]IncrementalExtractionSnapshot, 0)
	options.incrementalExtractionObserver = func(_ context.Context, snapshot IncrementalExtractionSnapshot) {
		if snapshot.Kind == BookSourceKindHTML {
			observed = append(observed, snapshot)
		}
	}
	service := NewService(nil, nil, nil, options)
	sourcePath := writeIncrementalHTMLFixture(t)
	info, err := os.Stat(sourcePath)
	if err != nil {
		t.Fatalf("Stat HTML fixture returned error: %v", err)
	}

	writeErr := errors.New("injected readalong write failure")
	withManifestSnapshotJSONWriter(t, func(path string, payload interface{}) error {
		if manifest, ok := payload.(ReadalongManifest); ok && manifest.SourceID != "" && manifest.ManifestRevision == 2 {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})

	book, err := service.CreateBookSource(context.Background(), defaultProjectID, sourcePath, "incremental.html", info.Size())
	if !errors.Is(err, writeErr) {
		t.Fatalf("CreateBookSource(html) error = %v, want injected readalong failure", err)
	}
	if book.ID != "" {
		t.Fatalf("CreateBookSource(html) book = %#v, want zero value on manifest failure", book)
	}
	if len(observed) != 1 {
		t.Fatalf("observed %d snapshots, want only first durable pair before injected failure", len(observed))
	}
	assertCurrentIncrementalPair(t, service, observed[0])

	reloaded := NewService(nil, nil, nil, options)
	assertCurrentIncrementalPair(t, reloaded, observed[0])

	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, observed[0].SourceID, "revisions", observed[0].SourceRevisionID, sourceLifecycleRevisionFilename), &revision)
	if metadataWorkStatus(revision.Metadata) != SourceLifecycleWorkStatusFailed {
		t.Fatalf("source revision work status = %q, want failed after readalong write error", metadataWorkStatus(revision.Metadata))
	}
}

func TestIncrementalContentIRWriteFailureLeavesLifecycleFailedNotComplete(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	options.incrementalExtractionObserver = func(_ context.Context, snapshot IncrementalExtractionSnapshot) {
		if snapshot.Kind != BookSourceKindHTML || snapshot.ReadingUnitManifest.Metadata["complete"] != true {
			return
		}
		contentIRPath := filepath.Join(options.BookSourceDir, snapshot.SourceID, contentIRFilename)
		if err := os.MkdirAll(contentIRPath, 0o755); err != nil {
			t.Fatalf("MkdirAll content-ir blocker returned error: %v", err)
		}
	}
	service := NewService(nil, nil, nil, options)
	sourcePath := writeIncrementalHTMLFixture(t)
	info, err := os.Stat(sourcePath)
	if err != nil {
		t.Fatalf("Stat HTML fixture returned error: %v", err)
	}

	_, err = service.CreateBookSource(context.Background(), defaultProjectID, sourcePath, "incremental.html", info.Size())
	if err == nil {
		t.Fatalf("CreateBookSource(html) error = nil, want content IR write failure")
	}

	entries, readErr := os.ReadDir(service.Options().SourceLifecycleDataDir)
	if readErr != nil {
		t.Fatalf("ReadDir source lifecycle returned error: %v", readErr)
	}
	if len(entries) != 1 {
		t.Fatalf("source lifecycle entries = %d, want exactly one failed incremental source", len(entries))
	}
	sourceID := entries[0].Name()
	sourceRevisionID := bookSourceRevisionID(sourceID)
	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, sourceID, sourceLifecycleEnvelopeFilename), &envelope)
	if metadataWorkStatus(envelope.Metadata) == SourceLifecycleWorkStatusComplete || metadataWorkStatus(envelope.Metadata) == SourceLifecycleWorkStatusCompleteWithWarnings {
		t.Fatalf("source envelope work status = %q, want not complete after content IR write failure", metadataWorkStatus(envelope.Metadata))
	}
	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, sourceID, "revisions", sourceRevisionID, sourceLifecycleRevisionFilename), &revision)
	if metadataWorkStatus(revision.Metadata) != SourceLifecycleWorkStatusFailed {
		t.Fatalf("source revision work status = %q, want failed after content IR write failure", metadataWorkStatus(revision.Metadata))
	}
}

func TestIncrementalFallbackUnitIdentityUsesNodePosition(t *testing.T) {
	document := contentir.Document{
		ID:       "doc-fallback",
		SourceID: "source-fallback",
		Nodes: []contentir.Node{
			{
				NormalisedText: "Repeated fallback text.",
				Provenance:     contentir.NewProvenance("html", "source-fallback", contentir.NewHTMLLocator("fallback.html", "first", "Repeated fallback text.", nil, ""), 0, 23),
			},
			{
				NormalisedText: "Repeated fallback text.",
				Provenance:     contentir.NewProvenance("html", "source-fallback", contentir.NewHTMLLocator("fallback.html", "second", "Repeated fallback text.", nil, ""), 24, 47),
			},
		},
	}
	first, err := readingUnitManifestUnitFromContentIRNode(document, document.Nodes[0], 0)
	if err != nil {
		t.Fatalf("readingUnitManifestUnitFromContentIRNode(first) returned error: %v", err)
	}
	second, err := readingUnitManifestUnitFromContentIRNode(document, document.Nodes[1], 1)
	if err != nil {
		t.Fatalf("readingUnitManifestUnitFromContentIRNode(second) returned error: %v", err)
	}
	if first.UnitID == second.UnitID {
		t.Fatalf("fallback unit IDs collided: %q", first.UnitID)
	}
	if first.OrderKey != "00000001" || second.OrderKey != "00000002" {
		t.Fatalf("fallback order keys = %q/%q, want position keys", first.OrderKey, second.OrderKey)
	}
}

func TestIncrementalExtractionDoesNotWriteManifestSnapshotsForLowerTierDOCXFailure(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	sourcePath := filepath.Join(t.TempDir(), "not-really.docx")
	if err := os.WriteFile(sourcePath, []byte("not a zip docx"), 0o644); err != nil {
		t.Fatalf("WriteFile DOCX fixture returned error: %v", err)
	}
	info, err := os.Stat(sourcePath)
	if err != nil {
		t.Fatalf("Stat DOCX fixture returned error: %v", err)
	}
	_, _ = service.CreateBookSource(context.Background(), defaultProjectID, sourcePath, "not-really.docx", info.Size())
	entries, readErr := os.ReadDir(service.Options().SourceLifecycleDataDir)
	if readErr != nil && !os.IsNotExist(readErr) {
		t.Fatalf("ReadDir source lifecycle returned error: %v", readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("source lifecycle entries after DOCX failure = %d, want none for non-HTML/EPUB incremental lane", len(entries))
	}
}

func assertCurrentIncrementalPair(t *testing.T, service *Service, snapshot IncrementalExtractionSnapshot) {
	t.Helper()
	currentReadingUnit, err := service.GetCurrentReadingUnitManifest(snapshot.SourceID, snapshot.SourceRevisionID)
	if err != nil {
		t.Fatalf("GetCurrentReadingUnitManifest returned error: %v", err)
	}
	if currentReadingUnit.ManifestID != snapshot.ReadingUnitManifest.ManifestID {
		t.Fatalf("current reading-unit manifest = %q, want last durable pair reading-unit %q", currentReadingUnit.ManifestID, snapshot.ReadingUnitManifest.ManifestID)
	}
	currentReadalong, err := service.GetCurrentReadalongManifest(snapshot.SourceID, snapshot.SourceRevisionID)
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest returned error: %v", err)
	}
	if currentReadalong.ManifestID != snapshot.ReadalongManifest.ManifestID || currentReadalong.ReadingUnitManifestID != currentReadingUnit.ManifestID {
		t.Fatalf("current readalong manifest = %#v, want last durable pair bound to reading-unit %q", currentReadalong, currentReadingUnit.ManifestID)
	}
}

func assertManifestUnitsMatchContentIR(t *testing.T, manifest ReadingUnitManifest, document contentir.Document) {
	t.Helper()
	if len(manifest.Units) != len(document.Nodes) {
		t.Fatalf("manifest units = %d, Content IR nodes = %d", len(manifest.Units), len(document.Nodes))
	}
	for index, unit := range manifest.Units {
		node := document.Nodes[index]
		if unit.UnitID != node.NodeID || unit.NodeID != node.NodeID || unit.OrderKey != node.OrderKey || unit.Fingerprint != metadataValueString(node.Metadata, "fingerprint") {
			t.Fatalf("unit[%d] = %#v, want node id/order/fingerprint from %#v", index, unit, node)
		}
		if unit.ContentIRID != document.ID || unit.Readiness != ReadingUnitReadinessReadable {
			t.Fatalf("unit[%d] = %#v, want readable unit bound to Content IR %q", index, unit, document.ID)
		}
	}
}

func contentIRNodeIDs(document contentir.Document) []string {
	ids := make([]string, 0, len(document.Nodes))
	for _, node := range document.Nodes {
		ids = append(ids, node.NodeID)
	}
	return ids
}

func writeIncrementalHTMLFixture(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "incremental.html")
	body := `<!doctype html><html lang="en"><head><title>Incremental HTML</title></head><body><main>
		<h1 id="intro">Incremental HTML</h1>
		<p id="alpha">Alpha paragraph becomes readable first.</p>
		<p id="beta">Beta paragraph becomes readable second.</p>
	</main></body></html>`
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatalf("WriteFile HTML fixture returned error: %v", err)
	}
	return path
}

func writeIncrementalEPUBFixture(t *testing.T) string {
	t.Helper()
	outputPath := filepath.Join(t.TempDir(), "incremental.epub")
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB fixture returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
			<rootfiles><rootfile full-path="EPUB/package.opf" /></rootfiles>
		</container>`,
		"EPUB/package.opf": `<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
			<metadata><dc:title>Incremental EPUB</dc:title><dc:creator>Fixture Author</dc:creator><dc:language>en</dc:language></metadata>
			<manifest>
				<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
				<item id="intro" href="intro.xhtml" media-type="application/xhtml+xml" />
				<item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml" />
			</manifest>
			<spine><itemref idref="intro" /><itemref idref="chapter" /></spine>
		</package>`,
		"EPUB/nav.xhtml": `<html><body><nav epub:type="toc"><ol>
			<li><a href="intro.xhtml">Intro</a></li>
			<li><a href="chapter.xhtml">Chapter</a></li>
		</ol></nav></body></html>`,
		"EPUB/intro.xhtml": `<html><head><title>Intro Raw</title></head><body>
			<h1 id="intro-heading">Intro</h1>
			<p id="intro-a">Intro paragraph A is readable.</p>
			<p id="intro-b">Intro paragraph B is readable.</p>
		</body></html>`,
		"EPUB/chapter.xhtml": `<html><head><title>Chapter Raw</title></head><body>
			<h1 id="chapter-heading">Chapter</h1>
			<p id="chapter-a">Chapter paragraph A is readable.</p>
		</body></html>`,
	}
	paths := make([]string, 0, len(files))
	for path := range files {
		paths = append(paths, path)
	}
	sort.Strings(paths)
	for _, path := range paths {
		writer, createErr := zipWriter.Create(path)
		if createErr != nil {
			t.Fatalf("Create EPUB entry returned error: %v", createErr)
		}
		if _, writeErr := writer.Write([]byte(strings.TrimSpace(files[path]))); writeErr != nil {
			t.Fatalf("Write EPUB entry returned error: %v", writeErr)
		}
	}
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("Close EPUB zip writer returned error: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close EPUB fixture returned error: %v", err)
	}
	return outputPath
}
