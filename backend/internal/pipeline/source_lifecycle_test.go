package pipeline

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPersistSourceLifecycleStoresEnvelopeRevisionAndRawArtifact(t *testing.T) {
	service := newSourceLifecycleTestService(t)

	envelope, revision, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:               "source-alpha",
		RevisionID:             "rev-one",
		ProjectID:              "project-alpha",
		SourceKind:             SourceEnvelopeKindProject,
		Lifecycle:              SourceEnvelopeLifecycleActive,
		Origin:                 SourceOrigin{Method: SourceOriginMethodPaste, FileName: "notes.md", ContentType: "text/markdown"},
		RawText:                "# Notes\n\nPersist this source independently from jobs.",
		RawArtifactContentType: "text/markdown",
		RawArtifactFileName:    "notes.md",
		WorkStatus:             SourceLifecycleWorkStatusComplete,
	})
	if err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	if envelope.SourceID == "" || envelope.SourceID == revision.RevisionID {
		t.Fatalf("source identity was not persisted separately from revision id: envelope=%#v revision=%#v", envelope, revision)
	}
	if envelope.CurrentRevisionID != revision.RevisionID {
		t.Fatalf("current revision = %q, want %q", envelope.CurrentRevisionID, revision.RevisionID)
	}

	envelopePath := filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", sourceLifecycleEnvelopeFilename)
	revisionPath := filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-one", sourceLifecycleRevisionFilename)
	var storedEnvelope SourceEnvelope
	readSourceLifecycleJSON(t, envelopePath, &storedEnvelope)
	if storedEnvelope.SchemaVersion != sourceEnvelopeSchemaVersion || storedEnvelope.SourceID != "source-alpha" || storedEnvelope.ProjectID != "project-alpha" {
		t.Fatalf("stored envelope = %#v, want source-envelope.v1 project source identity", storedEnvelope)
	}
	if storedEnvelope.Origin.Method != SourceOriginMethodPaste || storedEnvelope.Origin.FileName != "notes.md" || storedEnvelope.Origin.ContentHash == "" {
		t.Fatalf("stored origin = %#v, want paste source metadata with content hash", storedEnvelope.Origin)
	}

	var storedRevision SourceRevision
	readSourceLifecycleJSON(t, revisionPath, &storedRevision)
	if storedRevision.SchemaVersion != sourceRevisionSchemaVersion || storedRevision.SourceID != storedEnvelope.SourceID || storedRevision.RevisionID != "rev-one" {
		t.Fatalf("stored revision = %#v, want source-revision.v1 tied to source identity", storedRevision)
	}
	if storedRevision.RevisionState != SourceRevisionStateCurrent || storedRevision.RevisionOrdinal != 1 {
		t.Fatalf("revision state/ordinal = %q/%d, want current/1", storedRevision.RevisionState, storedRevision.RevisionOrdinal)
	}
	rawBytes, err := os.ReadFile(storedRevision.RawArtifact.URI)
	if err != nil {
		t.Fatalf("read raw artifact returned error: %v", err)
	}
	wantBytes := []byte("# Notes\n\nPersist this source independently from jobs.")
	if string(rawBytes) != string(wantBytes) {
		t.Fatalf("raw artifact = %q, want original text", string(rawBytes))
	}
	checksum := sha256.Sum256(wantBytes)
	if storedRevision.RawArtifact.SHA256 != hex.EncodeToString(checksum[:]) {
		t.Fatalf("raw artifact sha256 = %q, want checksum of persisted bytes", storedRevision.RawArtifact.SHA256)
	}
	if storedRevision.RawArtifact.ByteLength != int64(len(wantBytes)) || storedRevision.RawArtifact.ContentType != "text/markdown" {
		t.Fatalf("raw artifact metadata = %#v, want bytes and content type", storedRevision.RawArtifact)
	}
	if status := metadataWorkStatus(storedRevision.Metadata); status != SourceLifecycleWorkStatusComplete {
		t.Fatalf("revision work status = %q, want complete", status)
	}
}

func TestSourceLifecycleStartupMarksOnlyActiveWorkInterrupted(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "active-source",
		RevisionID: "active-revision",
		ProjectID:  "project-alpha",
		SourceKind: SourceEnvelopeKindProject,
		Lifecycle:  SourceEnvelopeLifecycleActive,
		Origin:     SourceOrigin{Method: SourceOriginMethodPaste, FileName: "active.txt", ContentType: "text/plain"},
		RawText:    "active work",
		WorkStatus: SourceLifecycleWorkStatusRunning,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle active returned error: %v", err)
	}
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "complete-source",
		RevisionID: "complete-revision",
		ProjectID:  "project-alpha",
		SourceKind: SourceEnvelopeKindProject,
		Lifecycle:  SourceEnvelopeLifecycleActive,
		Origin:     SourceOrigin{Method: SourceOriginMethodPaste, FileName: "complete.txt", ContentType: "text/plain"},
		RawText:    "complete work",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle complete returned error: %v", err)
	}

	_ = NewService(nil, nil, nil, options)

	var activeEnvelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, "active-source", sourceLifecycleEnvelopeFilename), &activeEnvelope)
	if status := metadataWorkStatus(activeEnvelope.Metadata); status != SourceLifecycleWorkStatusInterruptedRetriable {
		t.Fatalf("active envelope status = %q, want interrupted_retriable", status)
	}
	if activeEnvelope.Metadata[sourceLifecycleInterruptedAtMetadataKey] == "" {
		t.Fatalf("active envelope interruptedAt missing: %#v", activeEnvelope.Metadata)
	}
	var activeRevision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, "active-source", "revisions", "active-revision", sourceLifecycleRevisionFilename), &activeRevision)
	if status := metadataWorkStatus(activeRevision.Metadata); status != SourceLifecycleWorkStatusInterruptedRetriable {
		t.Fatalf("active revision status = %q, want interrupted_retriable", status)
	}

	var completeEnvelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, "complete-source", sourceLifecycleEnvelopeFilename), &completeEnvelope)
	if status := metadataWorkStatus(completeEnvelope.Metadata); status != SourceLifecycleWorkStatusComplete {
		t.Fatalf("complete envelope status = %q, want complete", status)
	}
	if _, ok := completeEnvelope.Metadata[sourceLifecycleInterruptedAtMetadataKey]; ok {
		t.Fatalf("complete envelope was incorrectly marked interrupted: %#v", completeEnvelope.Metadata)
	}
	var completeRevision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, "complete-source", "revisions", "complete-revision", sourceLifecycleRevisionFilename), &completeRevision)
	if status := metadataWorkStatus(completeRevision.Metadata); status != SourceLifecycleWorkStatusComplete {
		t.Fatalf("complete revision status = %q, want complete", status)
	}
}

func TestCreatePreparedSourcePersistsSourceLifecycle(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	prepared, err := service.CreatePreparedSource(nil, defaultProjectID, CreatePreparedSourceRequest{
		Kind:              PreparedSourceKindText,
		Text:              "Prepared source text is stored as raw source lifecycle input.",
		SourceName:        "prepared.txt",
		SourceContentType: "text/plain",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if prepared.ID == "" {
		t.Fatal("prepared source id is empty")
	}

	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, prepared.ID, sourceLifecycleEnvelopeFilename), &envelope)
	if envelope.SourceID != prepared.ID || envelope.CurrentRevisionID == "" || envelope.SourceKind != SourceEnvelopeKindProject {
		t.Fatalf("prepared lifecycle envelope = %#v, want project source identity for prepared source", envelope)
	}
	if envelope.Origin.Method != SourceOriginMethodPaste || envelope.Origin.FileName != "prepared.txt" {
		t.Fatalf("prepared lifecycle origin = %#v, want paste provenance", envelope.Origin)
	}
	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, prepared.ID, "revisions", envelope.CurrentRevisionID, sourceLifecycleRevisionFilename), &revision)
	rawBytes, err := os.ReadFile(revision.RawArtifact.URI)
	if err != nil {
		t.Fatalf("read prepared raw artifact returned error: %v", err)
	}
	if string(rawBytes) != "Prepared source text is stored as raw source lifecycle input." {
		t.Fatalf("prepared raw artifact = %q, want original text", string(rawBytes))
	}
}

func TestPersistSourceLifecycleRollsBackNewRevisionWhenEnvelopeWriteFails(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-one",
		RawText:    "first revision",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle first returned error: %v", err)
	}

	writeErr := errors.New("injected envelope write failure")
	withSourceLifecycleJSONWriter(t, func(path string, payload interface{}) error {
		if envelope, ok := payload.(SourceEnvelope); ok && envelope.CurrentRevisionID == "rev-two" {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})

	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-two",
		RawText:    "second revision",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); !errors.Is(err, writeErr) {
		t.Fatalf("PersistSourceLifecycle second error = %v, want injected envelope failure", err)
	}

	var storedEnvelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", sourceLifecycleEnvelopeFilename), &storedEnvelope)
	if storedEnvelope.CurrentRevisionID != "rev-one" {
		t.Fatalf("stored envelope current revision = %q, want rev-one after rollback", storedEnvelope.CurrentRevisionID)
	}
	var storedRevision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-one", sourceLifecycleRevisionFilename), &storedRevision)
	if storedRevision.RevisionState != SourceRevisionStateCurrent || storedRevision.SupersededByRevisionID != "" {
		t.Fatalf("stored first revision = %#v, want still current after failed new revision", storedRevision)
	}
	if _, err := os.Stat(filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-two")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rev-two directory stat = %v, want removed rollback artifact", err)
	}
	service.mu.RLock()
	memoryEnvelope := service.sourceEnvelopes["source-alpha"]
	_, hasRevTwo := service.sourceRevisions["rev-two"]
	service.mu.RUnlock()
	if memoryEnvelope.CurrentRevisionID != "rev-one" || hasRevTwo {
		t.Fatalf("memory state after failed persist = envelope %#v hasRevTwo=%v, want original only", memoryEnvelope, hasRevTwo)
	}
}

func TestPersistSourceLifecycleRollsBackEnvelopeWhenPreviousRevisionWriteFails(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-one",
		RawText:    "first revision",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle first returned error: %v", err)
	}

	writeErr := errors.New("injected previous revision write failure")
	withSourceLifecycleJSONWriter(t, func(path string, payload interface{}) error {
		if revision, ok := payload.(SourceRevision); ok && revision.RevisionID == "rev-one" && revision.RevisionState == SourceRevisionStateSuperseded {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})

	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-two",
		RawText:    "second revision",
		WorkStatus: SourceLifecycleWorkStatusComplete,
	}); !errors.Is(err, writeErr) {
		t.Fatalf("PersistSourceLifecycle second error = %v, want injected previous revision failure", err)
	}

	var storedEnvelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", sourceLifecycleEnvelopeFilename), &storedEnvelope)
	if storedEnvelope.CurrentRevisionID != "rev-one" {
		t.Fatalf("stored envelope current revision = %q, want rev-one after rollback", storedEnvelope.CurrentRevisionID)
	}
	var storedRevision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-one", sourceLifecycleRevisionFilename), &storedRevision)
	if storedRevision.RevisionState != SourceRevisionStateCurrent || storedRevision.SupersededByRevisionID != "" {
		t.Fatalf("stored first revision = %#v, want still current after rollback", storedRevision)
	}
	if _, err := os.Stat(filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-two")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("rev-two directory stat = %v, want removed rollback artifact", err)
	}
}

func TestUpdateSourceLifecycleWorkStatusWriteFailureKeepsMemoryAndDiskStatus(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-one",
		RawText:    "running work",
		WorkStatus: SourceLifecycleWorkStatusRunning,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}

	writeErr := errors.New("injected revision status write failure")
	withSourceLifecycleJSONWriter(t, func(path string, payload interface{}) error {
		if _, ok := payload.(SourceRevision); ok {
			return writeErr
		}
		return writeJSONAtomic(path, payload)
	})

	if err := service.UpdateSourceLifecycleWorkStatus("source-alpha", "rev-one", SourceLifecycleWorkStatusComplete); !errors.Is(err, writeErr) {
		t.Fatalf("UpdateSourceLifecycleWorkStatus error = %v, want injected revision failure", err)
	}
	service.mu.RLock()
	memoryEnvelope := cloneSourceEnvelope(service.sourceEnvelopes["source-alpha"])
	memoryRevision := cloneSourceRevision(service.sourceRevisions["rev-one"])
	service.mu.RUnlock()
	if status := metadataWorkStatus(memoryEnvelope.Metadata); status != SourceLifecycleWorkStatusRunning {
		t.Fatalf("memory envelope status = %q, want running after failed write", status)
	}
	if status := metadataWorkStatus(memoryRevision.Metadata); status != SourceLifecycleWorkStatusRunning {
		t.Fatalf("memory revision status = %q, want running after failed write", status)
	}
	var storedRevision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(service.Options().SourceLifecycleDataDir, "source-alpha", "revisions", "rev-one", sourceLifecycleRevisionFilename), &storedRevision)
	if status := metadataWorkStatus(storedRevision.Metadata); status != SourceLifecycleWorkStatusRunning {
		t.Fatalf("stored revision status = %q, want running after failed write", status)
	}
}

func TestReloadSourceLifecycleDoesNotLoadInterruptedStatusWhenWriteFails(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	if _, _, err := service.PersistSourceLifecycle(SourceLifecyclePersistRequest{
		SourceID:   "source-alpha",
		RevisionID: "rev-one",
		RawText:    "running work",
		WorkStatus: SourceLifecycleWorkStatusRunning,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}

	writeErr := errors.New("injected reload interruption write failure")
	withSourceLifecycleJSONWriter(t, func(path string, payload interface{}) error {
		return writeErr
	})
	reloaded := NewService(nil, nil, nil, options)
	reloaded.mu.RLock()
	memoryEnvelope := cloneSourceEnvelope(reloaded.sourceEnvelopes["source-alpha"])
	memoryRevision := cloneSourceRevision(reloaded.sourceRevisions["rev-one"])
	reloaded.mu.RUnlock()
	if status := metadataWorkStatus(memoryEnvelope.Metadata); status != SourceLifecycleWorkStatusRunning {
		t.Fatalf("reloaded envelope status = %q, want running because interrupted write failed", status)
	}
	if status := metadataWorkStatus(memoryRevision.Metadata); status != SourceLifecycleWorkStatusRunning {
		t.Fatalf("reloaded revision status = %q, want running because interrupted write failed", status)
	}
}

func TestCreateTemporarySourceURLPersistsOriginalHTMLRawArtifact(t *testing.T) {
	rawHTML := `<!doctype html><html><head><title>Raw HTML Source</title></head><body><nav>Navigation chrome</nav><article><h1>Raw HTML Source</h1><p>The readable article text should be extracted separately.</p></article></body></html>`
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = response.Write([]byte(rawHTML))
	}))
	defer server.Close()

	options := sourceLifecycleTestOptions(t)
	options.SourceURLAllowPrivate = true
	service := NewService(nil, nil, nil, options)
	temporary, err := service.CreateTemporarySource(context.Background(), CreateTemporarySourceRequest{
		Kind: PreparedSourceKindURL,
		URL:  server.URL + "/article",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	if strings.Contains(temporary.Text, "<article") || strings.Contains(temporary.Text, "Navigation chrome") {
		t.Fatalf("temporary text = %q, want extracted readable text separate from raw HTML", temporary.Text)
	}

	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, temporary.ID, sourceLifecycleEnvelopeFilename), &envelope)
	if status := metadataWorkStatus(envelope.Metadata); status != SourceLifecycleWorkStatusComplete {
		t.Fatalf("temporary envelope status = %q, want complete after temporary source persisted", status)
	}
	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, temporary.ID, "revisions", temporary.ID+"-rev", sourceLifecycleRevisionFilename), &revision)
	if status := metadataWorkStatus(revision.Metadata); status != SourceLifecycleWorkStatusComplete {
		t.Fatalf("temporary revision status = %q, want complete after temporary source persisted", status)
	}
	rawBytes, err := os.ReadFile(revision.RawArtifact.URI)
	if err != nil {
		t.Fatalf("read raw temporary artifact returned error: %v", err)
	}
	if string(rawBytes) != rawHTML {
		t.Fatalf("raw temporary artifact = %q, want original fetched HTML", string(rawBytes))
	}
	if revision.RawArtifact.ByteLength != int64(len([]byte(rawHTML))) || !strings.HasPrefix(revision.RawArtifact.ContentType, "text/html") {
		t.Fatalf("raw artifact metadata = %#v, want original HTML bytes/content type", revision.RawArtifact)
	}
}

func TestCreateTemporarySourceMarksLifecycleFailedWhenTemporaryPersistenceFails(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	blockingFile := filepath.Join(t.TempDir(), "temporary-source-data-file")
	if err := os.WriteFile(blockingFile, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("write blocking file returned error: %v", err)
	}
	options.TemporarySourceDataDir = blockingFile
	service := NewService(nil, nil, nil, options)

	_, err := service.CreateTemporarySource(context.Background(), CreateTemporarySourceRequest{
		Kind:       PreparedSourceKindText,
		Text:       "Temporary lifecycle should not be complete if downstream persistence fails.",
		SourceName: "temporary.txt",
	})
	if err == nil {
		t.Fatal("CreateTemporarySource returned nil error, want temporary persistence failure")
	}

	entries, readErr := os.ReadDir(options.SourceLifecycleDataDir)
	if readErr != nil {
		t.Fatalf("ReadDir source lifecycle returned error: %v", readErr)
	}
	if len(entries) != 1 {
		t.Fatalf("source lifecycle entries = %d, want one failed lifecycle", len(entries))
	}
	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, entries[0].Name(), sourceLifecycleEnvelopeFilename), &envelope)
	if status := metadataWorkStatus(envelope.Metadata); status != SourceLifecycleWorkStatusFailed {
		t.Fatalf("temporary envelope status = %q, want failed after downstream persistence failure", status)
	}
	var revision SourceRevision
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, entries[0].Name(), "revisions", envelope.CurrentRevisionID, sourceLifecycleRevisionFilename), &revision)
	if status := metadataWorkStatus(revision.Metadata); status != SourceLifecycleWorkStatusFailed {
		t.Fatalf("temporary revision status = %q, want failed after downstream persistence failure", status)
	}
}

func newSourceLifecycleTestService(t *testing.T) *Service {
	t.Helper()
	return NewService(nil, nil, nil, sourceLifecycleTestOptions(t))
}

func withSourceLifecycleJSONWriter(t *testing.T, writer func(path string, payload interface{}) error) {
	t.Helper()
	previous := writeJSONAtomicForSourceLifecycle
	writeJSONAtomicForSourceLifecycle = writer
	t.Cleanup(func() {
		writeJSONAtomicForSourceLifecycle = previous
	})
}

func sourceLifecycleTestOptions(t *testing.T) Options {
	t.Helper()
	baseDir := t.TempDir()
	return Options{
		MaxRetries:             1,
		JobDataDir:             filepath.Join(baseDir, "jobs"),
		ProjectDataDir:         filepath.Join(baseDir, "projects"),
		SourceLifecycleDataDir: filepath.Join(baseDir, "source-lifecycle"),
		TemporarySourceDataDir: filepath.Join(baseDir, "temporary-sources"),
		TemporaryArtifactDir:   filepath.Join(baseDir, "temporary-artifacts"),
		TemporaryAudioDir:      filepath.Join(baseDir, "temporary-audio"),
		TemporaryProgressDir:   filepath.Join(baseDir, "temporary-progress"),
		BookSourceDir:          filepath.Join(baseDir, "book-sources"),
		SourcePrepDir:          filepath.Join(baseDir, "source-preps"),
		ProgressDataDir:        filepath.Join(baseDir, "progress"),
		PlaybackSessionDir:     filepath.Join(baseDir, "playback-sessions"),
	}
}

func readSourceLifecycleJSON(t *testing.T, path string, target any) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var data []byte
	var err error
	for {
		data, err = os.ReadFile(path)
		if err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("read %s returned error: %v", path, err)
	}
	if err := jsonUnmarshal(data, target); err != nil {
		t.Fatalf("decode %s returned error: %v", path, err)
	}
}
