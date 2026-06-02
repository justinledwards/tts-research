package pipeline_test

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestPreparedSourceReadinessConfirmationPersistsReadyFacts(t *testing.T) {
	t.Parallel()

	sourcePrepDir := t.TempDir()
	service := newBookSourceServiceWithOptions(t, pipeline.Options{SourcePrepDir: sourcePrepDir})
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		SourceName: "draft.txt",
		Text:       "# Detected title\n\nBody copy for narration.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if source.SourceReadiness == nil || source.SourceReadiness.State != pipeline.SourceReadinessStateNeedsMetadata {
		t.Fatalf("initial readiness = %#v, want needsMetadata", source.SourceReadiness)
	}
	if source.Status != pipeline.PreparedSourceStatusReady {
		t.Fatalf("status = %q, want legacy ready status", source.Status)
	}

	confirmed, err := service.ConfirmPreparedSourceReadiness(source.ID, pipeline.SourceReadinessConfirmationRequest{
		Language:            "en-US",
		SourceType:          "document",
		SpeechPolicyProfile: "Education",
		StructureChoice:     "sections",
		StructureLabel:      "1 heading and 1 body block",
		Title:               "Confirmed title",
		VoiceProfileID:      "voice-en",
	})
	if err != nil {
		t.Fatalf("ConfirmPreparedSourceReadiness returned error: %v", err)
	}
	if confirmed.SourceReadiness == nil {
		t.Fatal("confirmed source should include sourceReadiness")
	}
	if confirmed.SourceReadiness.State != pipeline.SourceReadinessStateReady {
		t.Fatalf("confirmed readiness state = %q, want ready", confirmed.SourceReadiness.State)
	}
	if confirmed.SourceReadiness.PreparedAt == nil {
		t.Fatal("confirmed readiness should include preparedAt")
	}
	if confirmed.SourceReadiness.Title != "Confirmed title" {
		t.Fatalf("readiness title = %q, want confirmed title", confirmed.SourceReadiness.Title)
	}
	if confirmed.SourceReadiness.Language != "en-US" || confirmed.SourceReadiness.SourceType != "document" {
		t.Fatalf("readiness facts = %#v, want confirmed language/source type", confirmed.SourceReadiness)
	}
	if !containsString(confirmed.SourceReadiness.ConfirmedFields, "policy") ||
		!containsString(confirmed.SourceReadiness.ConfirmedFields, "voice") {
		t.Fatalf("confirmed fields = %#v, want policy and voice", confirmed.SourceReadiness.ConfirmedFields)
	}

	metadataBytes, err := os.ReadFile(filepath.Join(sourcePrepDir, confirmed.ID, "source-prep.json"))
	if err != nil {
		t.Fatalf("ReadFile(source-prep.json) returned error: %v", err)
	}
	var persisted pipeline.PreparedSource
	if err := json.Unmarshal(metadataBytes, &persisted); err != nil {
		t.Fatalf("Unmarshal persisted source returned error: %v", err)
	}
	if persisted.SourceReadiness == nil ||
		persisted.SourceReadiness.State != pipeline.SourceReadinessStateReady ||
		persisted.SourceReadiness.Title != "Confirmed title" {
		t.Fatalf("persisted readiness = %#v, want ready confirmed title", persisted.SourceReadiness)
	}
}

func TestPreparedSourceReadinessBecomesStaleWhenSourcePrepChanges(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		SourceName: "policy.txt",
		Text:       "A source that will change policy.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	confirmed, err := service.ConfirmPreparedSourceReadiness(source.ID, pipeline.SourceReadinessConfirmationRequest{
		Language:       "en-US",
		SourceType:     "document",
		StructureLabel: "1 spoken block",
		Title:          "Policy source",
	})
	if err != nil {
		t.Fatalf("ConfirmPreparedSourceReadiness returned error: %v", err)
	}
	if confirmed.SourceReadiness == nil || confirmed.SourceReadiness.State != pipeline.SourceReadinessStateReady {
		t.Fatalf("confirmed readiness = %#v, want ready", confirmed.SourceReadiness)
	}

	updated, err := service.UpdatePreparedSourceSpeechPolicy(source.ID, pipeline.SourceSpeechPolicyUpdateRequest{
		Profile: "Accessibility",
	})
	if err != nil {
		t.Fatalf("UpdatePreparedSourceSpeechPolicy returned error: %v", err)
	}
	if updated.SourceReadiness == nil || updated.SourceReadiness.State != pipeline.SourceReadinessStateStale {
		t.Fatalf("updated readiness = %#v, want stale", updated.SourceReadiness)
	}
	if updated.SourceReadiness.StaleReason == "" {
		t.Fatalf("stale readiness = %#v, want stale reason", updated.SourceReadiness)
	}
}
