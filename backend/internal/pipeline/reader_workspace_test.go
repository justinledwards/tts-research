package pipeline

import (
	"bytes"
	"encoding/json"
	"errors"
	"math"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func readerWorkspaceTestService(t *testing.T) *Service {
	t.Helper()
	projectDir := t.TempDir()
	now := time.Now().UTC()
	return &Service{
		options:  Options{ProjectDataDir: projectDir},
		projects: map[string]VoiceProject{"project-1": {ID: "project-1", Name: "Reader", CreatedAt: now, UpdatedAt: now}},
		jobs:     map[string]storedJob{}, sourcePreps: map[string]PreparedSource{}, books: map[string]storedBookSource{},
		sourceEnvelopes: map[string]SourceEnvelope{},
	}
}

func addWorkspaceSource(service *Service, id, text string, updated time.Time) {
	service.sourcePreps[id] = PreparedSource{ID: id, ProjectID: "project-1", Status: PreparedSourceStatusReady, Text: text, UpdatedAt: updated}
}

func addWorkspaceRun(service *Service, id, sourceID string, updated time.Time) {
	service.jobs[id] = storedJob{VoiceJob: VoiceJob{
		ID: id, ProjectID: "project-1", PreparedSourceID: sourceID, Status: JobStatusCompleted,
		AudioURL: "/api/voice-jobs/" + id + "/audio", DurationMS: 1000, CreatedAt: updated, UpdatedAt: updated,
		PartialAudioManifest: &PartialAudioManifest{Status: "complete", ReadySegments: 1, TotalSegments: 1, CompleteEnough: true},
	}}
}

func TestReaderWorkspaceSnapshotFallbackOrderAndNoAutoplay(t *testing.T) {
	service := readerWorkspaceTestService(t)
	now := time.Now().UTC()
	addWorkspaceSource(service, "new-source", "new", now)
	addWorkspaceSource(service, "run-source", "run", now.Add(-time.Hour))
	addWorkspaceRun(service, "completed-run", "run-source", now.Add(-time.Minute))

	result, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatalf("GetReaderWorkspace returned error: %v", err)
	}
	if stringValue(result.Snapshot.RunID) != "completed-run" || result.Snapshot.SourceID != "run-source" {
		t.Fatalf("fallback = %#v, want newest compatible completed run before newest source", result.Snapshot)
	}
	encoded, _ := json.Marshal(result.Snapshot)
	if string(encoded) == "" || containsJSONKey(encoded, "autoplay") || containsJSONKey(encoded, "playing") {
		t.Fatalf("snapshot contains an autoplay transport field: %s", encoded)
	}
}

func TestReaderWorkspaceRestoreInvalidCheckpointDegradesToSource(t *testing.T) {
	service := readerWorkspaceTestService(t)
	now := time.Now().UTC()
	addWorkspaceSource(service, "source-1", "readable", now)
	addWorkspaceRun(service, "run-1", "source-1", now)
	current, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	saved := current.Snapshot
	saved.ProjectRevision = 7
	saved.RunCompatibilityKey = pointer("browser-invented")
	saved.ReaderLocator = &contentir.LocatorEnvelope{SchemaVersion: contentir.LocatorEnvelopeVersion, SourceID: "source-1", NodeID: "missing"}
	saved.PlaybackCursorMS = pointer(int64(900))
	if err := writeReaderWorkspaceAtomic(service.readerWorkspacePath("project-1"), saved); err != nil {
		t.Fatal(err)
	}

	restored, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	if restored.Snapshot.SourceID != "source-1" || restored.Snapshot.RunID != nil || restored.Snapshot.PlaybackCursorMS == nil || *restored.Snapshot.PlaybackCursorMS != 0 || restored.Snapshot.ReaderLocator != nil {
		t.Fatalf("restored = %#v, want readable source-only state", restored.Snapshot)
	}
	if restored.Snapshot.ProjectRevision != 7 || restored.Snapshot.SyncFidelity == nil || *restored.Snapshot.SyncFidelity != SyncFidelitySourceOnly {
		t.Fatalf("degraded revision/fidelity = %#v", restored.Snapshot)
	}
}

func TestReaderWorkspaceSnapshotV0MigrationUsesServerEvidence(t *testing.T) {
	service := readerWorkspaceTestService(t)
	now := time.Now().UTC()
	addWorkspaceSource(service, "source-1", "truth", now)
	addWorkspaceRun(service, "run-1", "source-1", now)
	path := service.readerWorkspacePath("project-1")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := []byte(`{"schemaVersion":"reader_workspace_snapshot.v0","projectId":"project-1","sourceId":"source-1","runId":"run-1","playbackCursorMs":42}`)
	if err := os.WriteFile(path, legacy, 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	projection := service.readerWorkspaceProjectionLocked("project-1", "source-1", "run-1")
	if result.Snapshot.SchemaVersion != ReaderWorkspaceSchemaVersion || result.Snapshot.SourceRevisionID != projection.SourceRevisionID || stringValue(result.Snapshot.RunCompatibilityKey) != projection.RunCompatibilityKey {
		t.Fatalf("migration = %#v, server projection = %#v", result.Snapshot, projection)
	}
	if result.Snapshot.PlaybackCursorMS == nil || *result.Snapshot.PlaybackCursorMS != 42 {
		t.Fatalf("migrated cursor = %v, want 42", result.Snapshot.PlaybackCursorMS)
	}
	assertReaderWorkspaceStable(t, service, result)
}

func TestReaderWorkspaceSnapshotV0InvalidLocatorDegradesCheckpoint(t *testing.T) {
	service := readerWorkspaceTestService(t)
	now := time.Now().UTC()
	addWorkspaceSource(service, "source-1", "truth", now)
	addWorkspaceRun(service, "run-1", "source-1", now)
	path := service.readerWorkspacePath("project-1")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	legacy := []byte(`{"schemaVersion":"reader_workspace_snapshot.v0","projectId":"project-1","sourceId":"source-1","runId":"run-1","readerLocator":{"unitId":"u1"},"playbackCursorMs":42}`)
	if err := os.WriteFile(path, legacy, 0o644); err != nil {
		t.Fatal(err)
	}

	result, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	if result.Snapshot.RunID != nil || result.Snapshot.ReaderLocator != nil || result.Snapshot.PlaybackCursorMS == nil || *result.Snapshot.PlaybackCursorMS != 0 {
		t.Fatalf("invalid legacy locator restored as %#v, want degraded source-only checkpoint", result.Snapshot)
	}
	assertReaderWorkspaceStable(t, service, result)
}

func TestReaderWorkspaceSourceOnlyCheckpointStableAcrossGetsAndRestart(t *testing.T) {
	service := readerWorkspaceTestService(t)
	addWorkspaceSource(service, "source-1", "truth", time.Now().UTC())
	source := service.sourcePreps["source-1"]
	source.Blocks = []NarrationBlock{{ID: "node-1"}}
	service.sourcePreps["source-1"] = source
	addWorkspaceRun(service, "run-1", "source-1", time.Now().UTC())

	base, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	request := base.Snapshot
	request.SourceID = "source-1"
	request.RunID = nil
	request.ReaderLocator = &contentir.LocatorEnvelope{SchemaVersion: contentir.LocatorEnvelopeVersion, SourceID: "source-1", NodeID: "node-1"}
	request.PlaybackCursorMS = pointer(int64(321))
	request.PlaybackRate = pointer(1.25)
	request.FollowPreference = pointer(true)
	saved, err := service.PutReaderWorkspace("project-1", request, ReaderWorkspaceWriteCondition{IfMatch: base.ETag})
	if err != nil {
		t.Fatal(err)
	}
	assertReaderWorkspaceStable(t, service, saved)

	restarted := readerWorkspaceTestService(t)
	restarted.options.ProjectDataDir = service.options.ProjectDataDir
	restarted.sourcePreps = service.sourcePreps
	assertReaderWorkspaceStable(t, restarted, saved)
}

func TestReaderWorkspaceRevisionCASRestartAndConcurrentRace(t *testing.T) {
	service := readerWorkspaceTestService(t)
	addWorkspaceSource(service, "source-1", "truth", time.Now().UTC())
	base, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	request := base.Snapshot
	request.SourceID = "source-1"
	first, err := service.PutReaderWorkspace("project-1", request, ReaderWorkspaceWriteCondition{IfMatch: base.ETag})
	if err != nil {
		t.Fatalf("first PutReaderWorkspace: %v", err)
	}
	if first.Snapshot.ProjectRevision != 1 {
		t.Fatalf("revision = %d, want 1", first.Snapshot.ProjectRevision)
	}

	restarted := readerWorkspaceTestService(t)
	restarted.options.ProjectDataDir = service.options.ProjectDataDir
	restarted.sourcePreps = service.sourcePreps
	reloaded, err := restarted.GetReaderWorkspace("project-1")
	if err != nil || reloaded.Snapshot.ProjectRevision != 1 || reloaded.ETag != first.ETag {
		t.Fatalf("restart restore = %#v, %v", reloaded, err)
	}

	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(cursor int64) {
			defer wg.Done()
			candidate := reloaded.Snapshot
			candidate.PlaybackCursorMS = pointer(cursor)
			_, putErr := restarted.PutReaderWorkspace("project-1", candidate, ReaderWorkspaceWriteCondition{IfMatch: reloaded.ETag})
			results <- putErr
		}(int64(i + 1))
	}
	wg.Wait()
	close(results)
	successes, stale := 0, 0
	for result := range results {
		switch {
		case result == nil:
			successes++
		case errors.Is(result, ErrReaderWorkspaceStale):
			stale++
		default:
			t.Fatalf("concurrent PutReaderWorkspace error: %v", result)
		}
	}
	if successes != 1 || stale != 1 {
		t.Fatalf("concurrent results successes=%d stale=%d, want 1/1", successes, stale)
	}
	payload, err := readBoundedFile(restarted.readerWorkspacePath("project-1"), readerWorkspaceMaxBytes)
	if err != nil || !json.Valid(payload) {
		t.Fatalf("persisted snapshot is not bounded atomic JSON: %v, %s", err, payload)
	}
}

func TestReaderWorkspaceSnapshotRejectsTraversalAndBoundedJSON(t *testing.T) {
	service := readerWorkspaceTestService(t)
	if _, err := service.GetReaderWorkspace("../project-1"); !errors.Is(err, ErrProjectNotFound) {
		t.Fatalf("traversal error = %v, want project not found", err)
	}
	addWorkspaceSource(service, "source-1", "truth", time.Now().UTC())
	base, _ := service.GetReaderWorkspace("project-1")
	candidate := base.Snapshot
	candidate.SourceID = "source-1"
	candidate.ReaderLocator = &contentir.LocatorEnvelope{SchemaVersion: contentir.LocatorEnvelopeVersion, SourceID: "source-1", NodeID: string(make([]byte, 17*1024))}
	if _, err := service.PutReaderWorkspace("project-1", candidate, ReaderWorkspaceWriteCondition{IfMatch: base.ETag}); !errors.Is(err, ErrReaderWorkspaceInvalid) {
		t.Fatalf("oversize locator error = %v, want invalid", err)
	}
}

func TestPutReaderWorkspaceRejectsInvalidPlaybackValuesWithoutMutation(t *testing.T) {
	service := readerWorkspaceTestService(t)
	addWorkspaceSource(service, "source-1", "truth", time.Now().UTC())
	base, err := service.GetReaderWorkspace("project-1")
	if err != nil {
		t.Fatal(err)
	}
	candidate := base.Snapshot
	candidate.SourceID = "source-1"
	candidate.PlaybackCursorMS = pointer(int64(0))
	candidate.PlaybackRate = pointer(1.0)
	saved, err := service.PutReaderWorkspace("project-1", candidate, ReaderWorkspaceWriteCondition{IfMatch: base.ETag})
	if err != nil {
		t.Fatal(err)
	}
	path := service.readerWorkspacePath("project-1")
	wantFile, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	wantSnapshot, err := json.Marshal(saved.Snapshot)
	if err != nil {
		t.Fatal(err)
	}

	negativeOne := int64(-1)
	aboveMaxCursor := readerWorkspaceMaxJSONInt + 1
	negativeRate := -1.0
	zeroRate := 0.0
	aboveMaxRate := math.Nextafter(readerWorkspaceMaxRate, math.Inf(1))
	nanRate := math.NaN()
	positiveInfRate := math.Inf(1)
	negativeInfRate := math.Inf(-1)
	tests := []struct {
		name   string
		cursor *int64
		rate   *float64
	}{
		{name: "negative cursor", cursor: &negativeOne},
		{name: "cursor above JSON integer maximum", cursor: &aboveMaxCursor},
		{name: "negative rate", rate: &negativeRate},
		{name: "zero rate", rate: &zeroRate},
		{name: "rate above maximum", rate: &aboveMaxRate},
		{name: "NaN rate", rate: &nanRate},
		{name: "positive infinite rate", rate: &positiveInfRate},
		{name: "negative infinite rate", rate: &negativeInfRate},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := saved.Snapshot
			if test.cursor != nil {
				request.PlaybackCursorMS = test.cursor
			}
			if test.rate != nil {
				request.PlaybackRate = test.rate
			}
			current, putErr := service.PutReaderWorkspace("project-1", request, ReaderWorkspaceWriteCondition{IfMatch: saved.ETag})
			if !errors.Is(putErr, ErrReaderWorkspaceInvalid) {
				t.Fatalf("PutReaderWorkspace error = %v, want ErrReaderWorkspaceInvalid", putErr)
			}
			currentSnapshot, marshalErr := json.Marshal(current.Snapshot)
			if marshalErr != nil {
				t.Fatal(marshalErr)
			}
			if current.ETag != saved.ETag || !bytes.Equal(currentSnapshot, wantSnapshot) {
				t.Fatalf("rejection changed current state: etag %q -> %q, snapshot %s -> %s", saved.ETag, current.ETag, wantSnapshot, currentSnapshot)
			}
			gotFile, readErr := os.ReadFile(path)
			if readErr != nil {
				t.Fatal(readErr)
			}
			if !bytes.Equal(gotFile, wantFile) {
				t.Fatalf("rejection changed durable bytes:\nwant %s\ngot  %s", wantFile, gotFile)
			}
			assertReaderWorkspaceStable(t, service, saved)
		})
	}
}

func TestPutReaderWorkspaceAcceptsPlaybackSchemaBoundaries(t *testing.T) {
	tests := []struct {
		name   string
		cursor int64
		rate   float64
	}{
		{name: "minimum cursor and positive rate", cursor: 0, rate: math.SmallestNonzeroFloat64},
		{name: "maximum cursor and rate", cursor: readerWorkspaceMaxJSONInt, rate: readerWorkspaceMaxRate},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := readerWorkspaceTestService(t)
			addWorkspaceSource(service, "source-1", "truth", time.Now().UTC())
			base, err := service.GetReaderWorkspace("project-1")
			if err != nil {
				t.Fatal(err)
			}
			request := base.Snapshot
			request.SourceID = "source-1"
			request.PlaybackCursorMS = pointer(test.cursor)
			request.PlaybackRate = pointer(test.rate)
			saved, err := service.PutReaderWorkspace("project-1", request, ReaderWorkspaceWriteCondition{IfMatch: base.ETag})
			if err != nil {
				t.Fatalf("PutReaderWorkspace: %v", err)
			}
			if int64Value(saved.Snapshot.PlaybackCursorMS) != test.cursor || floatValue(saved.Snapshot.PlaybackRate) != test.rate {
				t.Fatalf("saved cursor/rate = %d/%g, want %d/%g", int64Value(saved.Snapshot.PlaybackCursorMS), floatValue(saved.Snapshot.PlaybackRate), test.cursor, test.rate)
			}
			assertReaderWorkspaceStable(t, service, saved)
		})
	}
}

func containsJSONKey(payload []byte, key string) bool {
	var object map[string]any
	_ = json.Unmarshal(payload, &object)
	_, ok := object[key]
	return ok
}

func assertReaderWorkspaceStable(t *testing.T, service *Service, want ReaderWorkspaceResult) {
	t.Helper()
	wantBytes, err := json.Marshal(want.Snapshot)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		got, err := service.GetReaderWorkspace("project-1")
		if err != nil {
			t.Fatal(err)
		}
		gotBytes, err := json.Marshal(got.Snapshot)
		if err != nil {
			t.Fatal(err)
		}
		if got.ETag != want.ETag || string(gotBytes) != string(wantBytes) {
			t.Fatalf("GET %d changed projection: etag %q -> %q, bytes %s -> %s", i+1, want.ETag, got.ETag, wantBytes, gotBytes)
		}
	}
}
