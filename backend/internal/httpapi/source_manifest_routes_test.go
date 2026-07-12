package httpapi_test

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestSourceManifestEventReplayAndSnapshotRoutes(t *testing.T) {
	service := newSourceManifestHTTPTestService(t)
	app := httpapi.NewRouter(service)

	if _, _, err := service.PersistSourceLifecycle(pipeline.SourceLifecyclePersistRequest{
		SourceID:   "route-source",
		RevisionID: "route-rev",
		RawText:    "route source",
		CreatedAt:  time.Date(2026, 5, 17, 1, 12, 0, 0, time.UTC),
		WorkStatus: pipeline.SourceLifecycleWorkStatusComplete,
	}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	readingUnit, err := service.PersistReadingUnitManifest(routeReadingUnitManifest("route-rum", 1))
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	readalong, err := service.PersistReadalongManifest(routeReadalongManifest("route-ram", readingUnit.ManifestID, 1))
	if err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}

	replayResponse := performSourceManifestRequest(t, app, "/api/source-manifest/events?sourceId=route-source&afterSequence=1")
	if replayResponse.StatusCode != http.StatusOK {
		t.Fatalf("events status = %d, want %d", replayResponse.StatusCode, http.StatusOK)
	}
	defer replayResponse.Body.Close()
	var replay pipeline.SourceManifestEventReplay
	if err := json.NewDecoder(replayResponse.Body).Decode(&replay); err != nil {
		t.Fatalf("decode replay: %v", err)
	}
	if replay.Gap || len(replay.Events) != 2 || replay.Events[0].EventType != pipeline.SourceManifestEventReadingUnitManifestWritten || replay.Events[1].Subject.ReadalongManifestID != readalong.ManifestID {
		t.Fatalf("replay = %#v, want manifest events after source lifecycle cursor", replay)
	}

	snapshotResponse := performSourceManifestRequest(t, app, "/api/source-manifest/snapshot?sourceId=route-source")
	if snapshotResponse.StatusCode != http.StatusOK {
		t.Fatalf("snapshot status = %d, want %d", snapshotResponse.StatusCode, http.StatusOK)
	}
	defer snapshotResponse.Body.Close()
	var snapshot pipeline.SourceManifestSnapshotFallback
	if err := json.NewDecoder(snapshotResponse.Body).Decode(&snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if snapshot.SourceEnvelope == nil || snapshot.SourceEnvelope.CurrentRevisionID != "route-rev" || snapshot.CurrentReadingUnitManifest == nil || snapshot.CurrentReadingUnitManifest.ManifestID != readingUnit.ManifestID || snapshot.CurrentReadalongManifest == nil || snapshot.CurrentReadalongManifest.ManifestID != readalong.ManifestID {
		t.Fatalf("snapshot = %#v, want authoritative lifecycle and current manifests", snapshot)
	}
}

func TestSourceManifestStreamRouteReplaysEventsOnceWithoutGap(t *testing.T) {
	service := newSourceManifestHTTPTestService(t)
	app := httpapi.NewRouter(service)
	if _, _, err := service.PersistSourceLifecycle(pipeline.SourceLifecyclePersistRequest{SourceID: "route-source", RevisionID: "route-rev", RawText: "stream"}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	for index := 1; index <= 3; index++ {
		manifest := routeReadingUnitManifest("stream-rum-"+string(rune('0'+index)), index)
		if _, err := service.PersistReadingUnitManifest(manifest); err != nil {
			t.Fatalf("PersistReadingUnitManifest %d returned error: %v", index, err)
		}
	}

	path := "/api/source-manifest/events/stream?sourceId=route-source&afterSequence=1&once=1"
	response := performSourceManifestRequest(t, app, path)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read stream body: %v", err)
	}
	bodyText := string(body)
	if !strings.Contains(bodyText, "event: source-manifest-event") || !strings.Contains(bodyText, "reading_unit_manifest_written") || strings.Contains(bodyText, "source-manifest-gap") {
		t.Fatalf("stream body = %q, want replayed manifest events without gap", bodyText)
	}
}

func TestSourceManifestStreamRouteSignalsGapWhenReplayLimitTruncatesBacklog(t *testing.T) {
	service := newSourceManifestHTTPTestService(t)
	app := httpapi.NewRouter(service)
	if _, _, err := service.PersistSourceLifecycle(pipeline.SourceLifecyclePersistRequest{SourceID: "route-source", RevisionID: "route-rev", RawText: "stream"}); err != nil {
		t.Fatalf("PersistSourceLifecycle returned error: %v", err)
	}
	for index := 1; index <= 3; index++ {
		manifest := routeReadingUnitManifest("stream-truncated-rum-"+string(rune('0'+index)), index)
		if _, err := service.PersistReadingUnitManifest(manifest); err != nil {
			t.Fatalf("PersistReadingUnitManifest %d returned error: %v", index, err)
		}
	}

	path := "/api/source-manifest/events/stream?sourceId=route-source&afterSequence=1&limit=1&once=1"
	response := performSourceManifestRequest(t, app, path)
	if response.StatusCode != http.StatusOK {
		t.Fatalf("stream status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read stream body: %v", err)
	}
	bodyText := string(body)
	if !strings.Contains(bodyText, "event: source-manifest-gap") || !strings.Contains(bodyText, "\"snapshotRequired\":true") || !strings.Contains(bodyText, "\"latestSequence\":4") {
		t.Fatalf("stream body = %q, want snapshot-required replay-truncation gap envelope", bodyText)
	}
	if !strings.Contains(bodyText, "event: source-manifest-event") || !strings.Contains(bodyText, "reading_unit_manifest_written") {
		t.Fatalf("stream body = %q, want truncated replay event after gap envelope", bodyText)
	}
}

func TestSourceManifestRoutesValidateBadRequestsAndMissingSnapshot(t *testing.T) {
	service := newSourceManifestHTTPTestService(t)
	app := httpapi.NewRouter(service)

	badReplay := performSourceManifestRequest(t, app, "/api/source-manifest/events?afterSequence=-1")
	if badReplay.StatusCode != http.StatusBadRequest {
		t.Fatalf("bad replay status = %d, want %d", badReplay.StatusCode, http.StatusBadRequest)
	}
	defer badReplay.Body.Close()

	missingSnapshot := performSourceManifestRequest(t, app, "/api/source-manifest/snapshot?sourceId="+url.QueryEscape("missing-source"))
	if missingSnapshot.StatusCode != http.StatusNotFound {
		t.Fatalf("missing snapshot status = %d, want %d", missingSnapshot.StatusCode, http.StatusNotFound)
	}
	defer missingSnapshot.Body.Close()
}

func performSourceManifestRequest(t *testing.T, app *fiber.App, path string) *http.Response {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, path, nil)
	if err != nil {
		t.Fatalf("NewRequest(%s) returned error: %v", path, err)
	}
	response, err := app.Test(request, fiber.TestConfig{Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("app.Test(%s) returned error: %v", path, err)
	}
	return response
}

func newSourceManifestHTTPTestService(t *testing.T) *pipeline.Service {
	t.Helper()
	baseDir := t.TempDir()
	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
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
		},
	)
}

func routeReadingUnitManifest(manifestID string, revision int) pipeline.ReadingUnitManifest {
	degraded := false
	return pipeline.ReadingUnitManifest{
		ManifestID:           manifestID,
		SourceID:             "route-source",
		SourceRevisionID:     "route-rev",
		ExtractionRevisionID: "route-er",
		ManifestRevision:     revision,
		State:                pipeline.ManifestSnapshotStateCurrent,
		GeneratedAt:          time.Date(2026, 5, 17, 1, 13, revision, 0, time.UTC),
		Units: []pipeline.ReadingUnitManifestUnit{
			{
				UnitID:      "route-unit",
				OrderKey:    "00000001",
				Readiness:   pipeline.ReadingUnitReadinessReadable,
				Fingerprint: "route-fp",
			},
		},
		Summary: pipeline.ReadingUnitManifestSummary{UnitCount: 1, ReadableCount: 1, Degraded: &degraded},
	}
}

func routeReadalongManifest(manifestID string, readingUnitManifestID string, revision int) pipeline.ReadalongManifest {
	return pipeline.ReadalongManifest{
		ManifestID:            manifestID,
		SourceID:              "route-source",
		SourceRevisionID:      "route-rev",
		ExtractionRevisionID:  "route-er",
		ReadingUnitManifestID: readingUnitManifestID,
		ManifestRevision:      revision,
		State:                 pipeline.ManifestSnapshotStateCurrent,
		GeneratedAt:           time.Date(2026, 5, 17, 1, 14, revision, 0, time.UTC),
		UnitIDs:               []string{"route-unit"},
	}
}
