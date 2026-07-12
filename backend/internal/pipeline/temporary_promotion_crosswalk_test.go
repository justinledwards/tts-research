package pipeline

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
)

func TestTemporarySourcePromotionPersistsCrosswalkAndRemapsProgress(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	temporary, err := service.CreateTemporarySource(context.Background(), CreateTemporarySourceRequest{
		Kind:       PreparedSourceKindText,
		Text:       "Temporary crosswalk source.\n\nSecond paragraph for promoted audio.",
		SourceName: "crosswalk.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	job, err := service.CreateTemporarySourceJob(context.Background(), temporary.ID, CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreateTemporarySourceJob returned error: %v", err)
	}
	completed := waitForPipelineJob(t, service, job.ID, JobStatusCompleted)
	temporaryRevisionID := service.currentSourceRevisionID(temporary.ID, temporary.ID+"-rev")
	readingUnit := testReadingUnitManifest("tmp-rum-001", 1, ManifestSnapshotStateCurrent)
	readingUnit.SourceID = temporary.ID
	readingUnit.SourceRevisionID = temporaryRevisionID
	readingUnit.ExtractionRevisionID = "tmp-er-001"
	readingUnit.Units[0].Locator = map[string]any{"sourceId": temporary.ID, "scopeKey": "temporary-source:" + temporary.ID}
	readingUnit.Units[0].Provenance = map[string]any{"sourceId": temporary.ID, "revisionId": temporaryRevisionID}
	persistedReadingUnit, err := service.PersistReadingUnitManifest(readingUnit)
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	readalong := testReadalongManifest("tmp-ram-001", persistedReadingUnit.ManifestID, 1, ManifestSnapshotStateCurrent)
	readalong.SourceID = temporary.ID
	readalong.SourceRevisionID = temporaryRevisionID
	readalong.ExtractionRevisionID = readingUnit.ExtractionRevisionID
	readalong.AudioArtifactIDs = []string{completed.ID}
	readalong.HighlightMapIDs = []string{completed.ID + ":highlight-map-v2"}
	persistedReadalong, err := service.PersistReadalongManifest(readalong)
	if err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}
	temporaryTargetID := progressTargetForTemporarySource(temporary.ID)
	bookmarkID := "bookmark-temporary-crosswalk"
	if _, err := service.UpdatePlaybackProgress(temporaryTargetID, PlaybackProgressUpdate{
		TargetID:          temporaryTargetID,
		JobID:             completed.ID,
		TemporarySourceID: temporary.ID,
		CurrentTimeSec:    3,
		DurationSec:       12,
		Progress:          0.25,
		ActiveWordIndex:   2,
		ReadingPosition: &ReadingPosition{
			TemporarySourceID: temporary.ID,
			ScopeKey:          temporaryTargetID,
			ActiveWordIndex:   2,
			LocatorEnvelope: &contentir.LocatorEnvelope{
				SourceID: temporary.ID,
				ScopeKey: temporaryTargetID,
			},
		},
		AddBookmark: &ProgressBookmark{
			ID:             bookmarkID,
			Label:          "keep bookmark",
			CurrentTimeSec: 3,
			ReadingPosition: &ReadingPosition{
				TemporarySourceID: temporary.ID,
				ScopeKey:          temporaryTargetID,
			},
		},
	}); err != nil {
		t.Fatalf("UpdatePlaybackProgress returned error: %v", err)
	}
	if _, err := service.StartPlaybackSession(PlaybackProgressUpdate{
		TargetID:          temporaryTargetID,
		JobID:             completed.ID,
		TemporarySourceID: temporary.ID,
		ReadingPosition: &ReadingPosition{
			TemporarySourceID: temporary.ID,
			ScopeKey:          temporaryTargetID,
		},
	}); err != nil {
		t.Fatalf("StartPlaybackSession returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("crosswalk.md", 1, 1, 1, 28, "/children/0")
	temporaryProgress := DurableProgress{
		ProgressID:          "temporary-progress-crosswalk",
		SourceID:            temporary.ID,
		ReadalongManifestID: persistedReadalong.ManifestID,
		SourceRevisionID:    temporaryRevisionID,
		AudioArtifactID:     completed.ID,
		Kind:                DurableProgressKindResume,
		State:               DurableProgressStateCurrent,
		UpdatedAt:           time.Now().UTC(),
		Canonical:           true,
		LocatorEnvelope: contentir.LocatorEnvelope{
			SchemaVersion:   contentir.LocatorEnvelopeVersion,
			Kind:            string(DurableProgressKindResume),
			SourceID:        temporary.ID,
			NodeID:          persistedReadingUnit.Units[0].NodeID,
			ScopeKey:        temporaryTargetID,
			ActiveWordIndex: 2,
			Locator:         &locator,
			TextQuote:       "Temporary crosswalk source",
		},
		Position: DurableProgressPosition{
			UnitID:          persistedReadingUnit.Units[0].UnitID,
			SegmentID:       "segment-temporary-crosswalk",
			ActiveWordIndex: 2,
			AudioOffsetMS:   3000,
			TextQuote:       "Temporary crosswalk source",
		},
	}
	if _, err := service.PersistDurableProgress(temporaryProgress); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}
	project, err := service.CreateProject("Crosswalk project")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	promoted, err := service.PromoteTemporarySource(context.Background(), temporary.ID, TemporarySourcePromotionRequest{
		ProjectID: project.ID,
		Keep: TemporarySourcePromotionKeep{
			ExtractedSource: true,
			GeneratedAudio:  true,
			TimingMaps:      true,
			Progress:        true,
			Bookmarks:       true,
		},
	})
	if err != nil {
		t.Fatalf("PromoteTemporarySource returned error: %v", err)
	}
	crosswalkID, ok := promoted.Metadata["promotionCrosswalkId"].(string)
	if !ok || crosswalkID == "" {
		t.Fatalf("promotionCrosswalkId metadata = %#v, want id", promoted.Metadata["promotionCrosswalkId"])
	}
	crosswalk, err := service.GetPromotionCrosswalk(crosswalkID)
	if err != nil {
		t.Fatalf("GetPromotionCrosswalk returned error: %v", err)
	}
	if !hasPromotionMapping(crosswalk.SourceIDMappings, temporary.ID, promoted.ID) || crosswalk.TemporarySourceID != temporary.ID || crosswalk.ProjectSourceID != promoted.ID {
		t.Fatalf("crosswalk source mapping = %#v, want temporary->promoted source", crosswalk)
	}
	if !hasPromotionMapping(crosswalk.AudioArtifactIDMappings, completed.ID, firstProjectJobID(t, service, project.ID, promoted.ID)) {
		t.Fatalf("audio artifact mappings = %#v, want temporary job to promoted job", crosswalk.AudioArtifactIDMappings)
	}
	if crosswalk.FromManifestID != persistedReadalong.ManifestID || crosswalk.ToManifestID == "" || crosswalk.ToManifestID == persistedReadalong.ManifestID {
		t.Fatalf("crosswalk manifest ids = %q -> %q, want temporary readalong to promoted readalong", crosswalk.FromManifestID, crosswalk.ToManifestID)
	}
	if len(crosswalk.ReadingUnitManifestIDMappings) == 0 || len(crosswalk.ReadalongManifestIDMappings) == 0 || len(crosswalk.ProgressIDMappings) == 0 || len(crosswalk.SegmentIDMappings) == 0 {
		t.Fatalf("crosswalk mappings = %#v, want manifest, progress, and segment mappings", crosswalk)
	}
	assertPromotionCrosswalkJSONContract(t, options, promoted.ID, crosswalkID)
	promotedReadalong, err := service.GetCurrentReadalongManifest(promoted.ID, promoted.ID+"-rev")
	if err != nil {
		t.Fatalf("GetCurrentReadalongManifest(promoted) returned error: %v", err)
	}
	if promotedReadalong.SourceID != promoted.ID || promotedReadalong.ReadingUnitManifestID == persistedReadingUnit.ManifestID || containsString(promotedReadalong.ProgressIDs, temporaryProgress.ProgressID) {
		t.Fatalf("promoted readalong = %#v, want durable IDs without temporary progress", promotedReadalong)
	}
	promotedProgressID := mappedTo(crosswalk.ProgressIDMappings, temporaryProgress.ProgressID)
	promotedProgress, err := service.GetDurableProgress(promotedProgressID)
	if err != nil {
		t.Fatalf("GetDurableProgress(promoted) returned error: %v", err)
	}
	projectTargetID := progressTargetForPreparedSource(promoted.ID)
	if promotedProgress.SourceID != promoted.ID || promotedProgress.ReadalongManifestID != promotedReadalong.ManifestID || promotedProgress.AudioArtifactID == completed.ID || promotedProgress.LocatorEnvelope.SourceID != promoted.ID {
		t.Fatalf("promoted durable progress = %#v, want durable source/readalong/audio mapping", promotedProgress)
	}
	if promotedProgress.LocatorEnvelope.ScopeKey != projectTargetID || strings.Contains(promotedProgress.LocatorEnvelope.ScopeKey, "temporary-source:") || promotedProgress.Position.UnitID == "" || promotedProgress.Position.SegmentID == "" {
		t.Fatalf("promoted durable progress anchors = %#v/%#v, want durable/remapped scope, unit, and segment", promotedProgress.LocatorEnvelope, promotedProgress.Position)
	}
	service.mu.RLock()
	promotedPlayback, ok := service.progress[progressTargetForPreparedSource(promoted.ID)]
	service.mu.RUnlock()
	if !ok {
		t.Fatalf("promoted playback progress missing for prepared source %s", promoted.ID)
	}
	if promotedPlayback.TemporarySourceID != "" || promotedPlayback.PreparedSourceID != promoted.ID || promotedPlayback.ReadingPosition == nil || promotedPlayback.ReadingPosition.TemporarySourceID != "" || promotedPlayback.ReadingPosition.BookSourceID != promoted.ID || promotedPlayback.ReadingPosition.ScopeKey != projectTargetID || strings.Contains(promotedPlayback.ReadingPosition.ScopeKey, "temporary-source:") {
		t.Fatalf("promoted playback progress = %#v, want durable prepared-source target", promotedPlayback)
	}
	if len(promotedPlayback.Bookmarks) != 1 || promotedPlayback.Bookmarks[0].ReadingPosition == nil || promotedPlayback.Bookmarks[0].ReadingPosition.TemporarySourceID != "" || promotedPlayback.Bookmarks[0].ReadingPosition.BookSourceID != promoted.ID || promotedPlayback.Bookmarks[0].ReadingPosition.ScopeKey != projectTargetID || strings.Contains(promotedPlayback.Bookmarks[0].ReadingPosition.ScopeKey, "temporary-source:") {
		t.Fatalf("promoted playback bookmarks = %#v, want remapped bookmark", promotedPlayback.Bookmarks)
	}
	promotedSession, err := service.GetTemporarySource(temporary.ID)
	if err != nil {
		t.Fatalf("GetTemporarySource(promoted temporary) returned error: %v", err)
	}
	if promotedSession.Status != TemporarySourceStatePromoted || promotedSession.PromotedSourceID != promoted.ID || promotedSession.Metadata["promotionCrosswalkId"] != crosswalkID {
		t.Fatalf("promoted temporary session = %#v, want promoted lifecycle with crosswalk id", promotedSession)
	}
	var envelope SourceEnvelope
	readSourceLifecycleJSON(t, filepath.Join(options.SourceLifecycleDataDir, temporary.ID, sourceLifecycleEnvelopeFilename), &envelope)
	if envelope.Lifecycle != SourceEnvelopeLifecyclePromoted || envelope.PromotedToSourceID != promoted.ID || envelope.Metadata["promotionCrosswalkId"] != crosswalkID {
		t.Fatalf("temporary source envelope = %#v, want promoted lifecycle and crosswalk", envelope)
	}
	reloaded := NewService(agents.NewVoiceOptimizationAgent(), agents.NewMockTTSAgent(), agents.NewMockVoiceCheckerAgent(), options)
	if _, err := reloaded.GetPromotionCrosswalk(crosswalkID); err != nil {
		t.Fatalf("reloaded GetPromotionCrosswalk returned error: %v", err)
	}
	if err := service.DeleteTemporarySource(temporary.ID); err != nil {
		t.Fatalf("DeleteTemporarySource returned error: %v", err)
	}
	if _, _, err := service.GetAudio(firstProjectJobID(t, service, project.ID, promoted.ID)); err != nil {
		t.Fatalf("promoted audio should survive temporary deletion: %v", err)
	}
}

func waitForPipelineJob(t *testing.T, service *Service, id string, status JobStatus) VoiceJob {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err == nil && job.Status == status {
			if status == JobStatusCompleted {
				// Completion marks temporary-source artifacts after the job status update.
				service.markTemporarySourceJobCompleted(id)
			}
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	job, err := service.GetJob(id)
	if err != nil {
		t.Fatalf("GetJob(%s) after wait returned error: %v", id, err)
	}
	t.Fatalf("job %s status = %q, want %q", id, job.Status, status)
	return VoiceJob{}
}

func firstProjectJobID(t *testing.T, service *Service, projectID string, preparedSourceID string) string {
	t.Helper()
	jobs, err := service.ListProjectJobs(projectID)
	if err != nil {
		t.Fatalf("ListProjectJobs returned error: %v", err)
	}
	for _, job := range jobs {
		if job.PreparedSourceID == preparedSourceID {
			return job.ID
		}
	}
	t.Fatalf("project jobs = %#v, want job for source %s", jobs, preparedSourceID)
	return ""
}

func hasPromotionMapping(mappings []PromotionCrosswalkIDMapping, from string, to string) bool {
	for _, mapping := range mappings {
		if mapping.FromID == from && mapping.ToID == to {
			return true
		}
	}
	return false
}

func mappedTo(mappings []PromotionCrosswalkIDMapping, from string) string {
	for _, mapping := range mappings {
		if mapping.FromID == from {
			return mapping.ToID
		}
	}
	return ""
}

func containsString(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func assertPromotionCrosswalkJSONContract(t *testing.T, options Options, promotedSourceID string, crosswalkID string) {
	t.Helper()
	path := filepath.Join(options.SourceLifecycleDataDir, sourceLifecycleDataPathID(promotedSourceID), promotionCrosswalkDirName, sourceLifecycleDataPathID(crosswalkID)+".json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile promotion crosswalk returned error: %v", err)
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		t.Fatalf("decode promotion crosswalk json returned error: %v", err)
	}
	for _, legacy := range []string{"createdAt", "temporarySourceId", "projectSourceId", "sourceIdMappings", "revisionIdMappings", "progressIdMappings"} {
		if _, ok := raw[legacy]; ok {
			t.Fatalf("promotion crosswalk json contains legacy field %q: %s", legacy, data)
		}
	}
	for _, required := range []string{"schemaVersion", "crosswalkId", "promotedAt", "fromSourceId", "toSourceId", "fromManifestId", "toManifestId", "identityMappings"} {
		if _, ok := raw[required]; !ok {
			t.Fatalf("promotion crosswalk json missing required field %q: %s", required, data)
		}
	}
	identity, ok := raw["identityMappings"].(map[string]any)
	if !ok {
		t.Fatalf("identityMappings = %#v, want object", raw["identityMappings"])
	}
	for _, required := range []string{"sourceRevisionIds", "readingUnitIds", "audioArtifactIds", "progressIds"} {
		items, ok := identity[required].([]any)
		if !ok {
			t.Fatalf("identityMappings.%s = %#v, want array", required, identity[required])
		}
		for _, item := range items {
			mapping, ok := item.(map[string]any)
			if !ok || mapping["from"] == "" || mapping["to"] == "" {
				t.Fatalf("identityMappings.%s item = %#v, want from/to object", required, item)
			}
		}
	}
}

func TestTemporarySourcePromotionRollbackRemovesProgressArtifactsOnSessionWriteFailure(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	temporary, err := service.CreateTemporarySource(context.Background(), CreateTemporarySourceRequest{
		Kind:       PreparedSourceKindText,
		Text:       "Rollback crosswalk source.\n\nSecond paragraph for rollback.",
		SourceName: "rollback.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	job, err := service.CreateTemporarySourceJob(context.Background(), temporary.ID, CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreateTemporarySourceJob returned error: %v", err)
	}
	completed := waitForPipelineJob(t, service, job.ID, JobStatusCompleted)
	temporaryRevisionID := service.currentSourceRevisionID(temporary.ID, temporary.ID+"-rev")
	readingUnit := testReadingUnitManifest("tmp-rum-rollback", 1, ManifestSnapshotStateCurrent)
	readingUnit.SourceID = temporary.ID
	readingUnit.SourceRevisionID = temporaryRevisionID
	readingUnit.ExtractionRevisionID = "tmp-er-rollback"
	persistedReadingUnit, err := service.PersistReadingUnitManifest(readingUnit)
	if err != nil {
		t.Fatalf("PersistReadingUnitManifest returned error: %v", err)
	}
	readalong := testReadalongManifest("tmp-ram-rollback", persistedReadingUnit.ManifestID, 1, ManifestSnapshotStateCurrent)
	readalong.SourceID = temporary.ID
	readalong.SourceRevisionID = temporaryRevisionID
	readalong.ExtractionRevisionID = readingUnit.ExtractionRevisionID
	readalong.AudioArtifactIDs = []string{completed.ID}
	readalong.HighlightMapIDs = []string{completed.ID + ":highlight-map-v2"}
	persistedReadalong, err := service.PersistReadalongManifest(readalong)
	if err != nil {
		t.Fatalf("PersistReadalongManifest returned error: %v", err)
	}
	temporaryTargetID := progressTargetForTemporarySource(temporary.ID)
	if _, err := service.UpdatePlaybackProgress(temporaryTargetID, PlaybackProgressUpdate{
		TargetID:          temporaryTargetID,
		JobID:             completed.ID,
		TemporarySourceID: temporary.ID,
		CurrentTimeSec:    4,
		DurationSec:       12,
		Progress:          0.33,
		ReadingPosition: &ReadingPosition{
			TemporarySourceID: temporary.ID,
			ScopeKey:          temporaryTargetID,
		},
	}); err != nil {
		t.Fatalf("UpdatePlaybackProgress returned error: %v", err)
	}
	if _, err := service.StartPlaybackSession(PlaybackProgressUpdate{
		TargetID:          temporaryTargetID,
		JobID:             completed.ID,
		TemporarySourceID: temporary.ID,
		ReadingPosition: &ReadingPosition{
			TemporarySourceID: temporary.ID,
			ScopeKey:          temporaryTargetID,
		},
	}); err != nil {
		t.Fatalf("StartPlaybackSession returned error: %v", err)
	}
	locator := contentir.NewMarkdownLocator("rollback.md", 1, 1, 1, 24, "/children/0")
	if _, err := service.PersistDurableProgress(DurableProgress{
		ProgressID:          "temporary-progress-rollback",
		SourceID:            temporary.ID,
		ReadalongManifestID: persistedReadalong.ManifestID,
		SourceRevisionID:    temporaryRevisionID,
		AudioArtifactID:     completed.ID,
		Kind:                DurableProgressKindResume,
		State:               DurableProgressStateCurrent,
		UpdatedAt:           time.Now().UTC(),
		Canonical:           true,
		LocatorEnvelope: contentir.LocatorEnvelope{
			SchemaVersion: contentir.LocatorEnvelopeVersion,
			Kind:          string(DurableProgressKindResume),
			SourceID:      temporary.ID,
			NodeID:        persistedReadingUnit.Units[0].NodeID,
			ScopeKey:      temporaryTargetID,
			Locator:       &locator,
			TextQuote:     "Rollback crosswalk source",
		},
		Position: DurableProgressPosition{
			UnitID:    persistedReadingUnit.Units[0].UnitID,
			SegmentID: "segment-temporary-rollback",
			TextQuote: "Rollback crosswalk source",
		},
	}); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}
	project, err := service.CreateProject("Rollback project")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	if err := os.RemoveAll(options.PlaybackSessionDir); err != nil {
		t.Fatalf("RemoveAll(PlaybackSessionDir) returned error: %v", err)
	}
	if err := os.WriteFile(options.PlaybackSessionDir, []byte("not a directory"), 0o644); err != nil {
		t.Fatalf("WriteFile(PlaybackSessionDir blocker) returned error: %v", err)
	}
	if _, err := service.PromoteTemporarySource(context.Background(), temporary.ID, TemporarySourcePromotionRequest{
		ProjectID: project.ID,
		Keep: TemporarySourcePromotionKeep{
			ExtractedSource: true,
			GeneratedAudio:  true,
			TimingMaps:      true,
			Progress:        true,
			Bookmarks:       true,
		},
	}); err == nil {
		t.Fatal("PromoteTemporarySource returned nil error, want playback session write failure")
	}
	assertNoPromotedProgressResidue(t, service, project.ID)
	if err := os.Remove(options.PlaybackSessionDir); err != nil {
		t.Fatalf("Remove(PlaybackSessionDir blocker) returned error: %v", err)
	}
	if err := os.MkdirAll(options.PlaybackSessionDir, 0o755); err != nil {
		t.Fatalf("MkdirAll(PlaybackSessionDir) returned error: %v", err)
	}
	reloaded := NewService(agents.NewVoiceOptimizationAgent(), agents.NewMockTTSAgent(), agents.NewMockVoiceCheckerAgent(), options)
	assertNoPromotedProgressResidue(t, reloaded, project.ID)
}

func assertNoPromotedProgressResidue(t *testing.T, service *Service, projectID string) {
	t.Helper()
	service.mu.RLock()
	defer service.mu.RUnlock()
	for _, progress := range service.progress {
		if progress.ProjectID == projectID {
			t.Fatalf("playback progress residue for project %s: %#v", projectID, progress)
		}
	}
	for _, session := range service.sessions {
		if session.ProjectID == projectID {
			t.Fatalf("playback session residue for project %s: %#v", projectID, session)
		}
	}
	for _, progress := range service.durableProgress {
		if progress.MetadataString("promotedFromSourceId") != "" {
			t.Fatalf("durable progress promotion residue for project %s: %#v", projectID, progress)
		}
	}
}
