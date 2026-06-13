package pipeline_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
	"github.com/justinedwards/tts-research/backend/internal/sourceprep"
)

func TestTemporarySourceLifecycleCreatesGeneratesDeletesAndPromotesByCopy(t *testing.T) {
	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "Temporary narration source.\n\nSecond paragraph for generated audio.",
		SourceName: "scratch.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	if temporary.ProjectID != "" {
		t.Fatalf("temporary project id = %q, want empty project boundary", temporary.ProjectID)
	}
	if temporary.SourceOwner != pipeline.SourceOwnerTemporary {
		t.Fatalf("source owner = %q, want temporary", temporary.SourceOwner)
	}
	if !strings.HasPrefix(temporary.ID, "tmp_") || temporary.Scope != pipeline.SourceArtifactScopeTemporary {
		t.Fatalf("temporary id/scope = %q/%q, want disjoint temporary envelope", temporary.ID, temporary.Scope)
	}
	if _, err := os.Stat(filepath.Join(service.Options().TemporaryArtifactDir, temporary.ID, "source.txt")); err != nil {
		t.Fatalf("temporary extraction artifact should exist: %v", err)
	}

	confirmed, err := service.ConfirmTemporarySourceReadiness(temporary.ID, pipeline.SourceReadinessConfirmationRequest{
		Title:          "Scratch narration",
		SourceType:     "document",
		Language:       "en",
		StructureLabel: "2 spoken blocks",
	})
	if err != nil {
		t.Fatalf("ConfirmTemporarySourceReadiness returned error: %v", err)
	}
	if confirmed.Title != "Scratch narration" {
		t.Fatalf("confirmed title = %q, want updated title", confirmed.Title)
	}
	if confirmed.Metadata["sourceType"] != "document" || confirmed.Metadata["language"] != "en" {
		t.Fatalf("confirmed metadata = %#v, want source type and language", confirmed.Metadata)
	}

	job, err := service.CreateTemporarySourceJob(context.Background(), temporary.ID, pipeline.CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreateTemporarySourceJob returned error: %v", err)
	}
	if job.ProjectID != "" {
		t.Fatalf("temporary job project id = %q, want empty", job.ProjectID)
	}
	if job.TemporarySourceID != temporary.ID {
		t.Fatalf("temporary job source id = %q, want %q", job.TemporarySourceID, temporary.ID)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if !strings.Contains(completed.AudioPath, service.Options().TemporaryAudioDir) {
		t.Fatalf("audio path = %q, want temporary audio dir %q", completed.AudioPath, service.Options().TemporaryAudioDir)
	}
	if _, _, err := service.GetAudio(job.ID); err != nil {
		t.Fatalf("GetAudio(temporary job) returned error: %v", err)
	}
	if completed.Timing == nil || completed.Timing.HighlightMapURL == "" {
		t.Fatalf("temporary job timing = %#v, want highlight and timing artifacts", completed.Timing)
	}
	if _, err := service.GetHighlightMap(job.ID); err != nil {
		t.Fatalf("GetHighlightMap(temporary job) returned error: %v", err)
	}
	if _, err := service.GetFragmentTiming(job.ID); err != nil {
		t.Fatalf("GetFragmentTiming(temporary job) returned error: %v", err)
	}
	audioReadySession, err := service.GetTemporarySource(temporary.ID)
	if err != nil {
		t.Fatalf("GetTemporarySource after temporary generation returned error: %v", err)
	}
	if audioReadySession.Status != pipeline.TemporarySourceStateAudioReady {
		t.Fatalf("temporary status = %q, want audio_ready", audioReadySession.Status)
	}
	artifacts, err := service.ListTemporarySourceArtifacts(temporary.ID)
	if err != nil {
		t.Fatalf("ListTemporarySourceArtifacts returned error: %v", err)
	}
	if !hasSourceArtifactKind(artifacts, pipeline.SourceArtifactKindGeneratedAudio) ||
		!hasSourceArtifactKind(artifacts, pipeline.SourceArtifactKindTiming) ||
		!hasSourceArtifactKind(artifacts, pipeline.SourceArtifactKindValidation) {
		t.Fatalf("artifacts = %#v, want generated audio, timing, and validation refs", artifacts)
	}

	project, err := service.CreateProject("Promoted")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	promoted, err := service.PromoteTemporarySource(context.Background(), temporary.ID, pipeline.TemporarySourcePromotionRequest{
		ProjectID:                  project.ID,
		PreserveGeneratedArtifacts: true,
	})
	if err != nil {
		t.Fatalf("PromoteTemporarySource returned error: %v", err)
	}
	if promoted.ID == temporary.ID || promoted.ProjectID != project.ID || promoted.TemporarySourceID != "" {
		t.Fatalf("promoted source = %#v, want project-owned source without temporary id field", promoted)
	}
	if promoted.Metadata["sourceType"] != "document" || promoted.SourceReadiness.SourceType != "document" {
		t.Fatalf("promoted metadata/readiness = %#v/%#v, want confirmed source type", promoted.Metadata, promoted.SourceReadiness)
	}
	manifest, ok := promoted.Metadata["promotion"].(pipeline.TemporarySourcePromotionManifest)
	if !ok {
		t.Fatalf("promotion manifest = %#v, want safe provenance note", promoted.Metadata["promotion"])
	}
	if manifest.TemporarySourceID != temporary.ID || !manifest.Keep.GeneratedAudio || !manifest.Keep.TimingMaps {
		t.Fatalf("promotion manifest = %#v, want temporary provenance and kept generated artifacts", manifest)
	}
	if _, err := os.Stat(filepath.Join(service.Options().SourcePrepDir, promoted.ID, "source-prep.json")); err != nil {
		t.Fatalf("promoted source metadata should exist: %v", err)
	}
	projectJobs, err := service.ListProjectJobs(project.ID)
	if err != nil {
		t.Fatalf("ListProjectJobs returned error: %v", err)
	}
	var promotedJob *pipeline.VoiceJob
	for index := range projectJobs {
		if projectJobs[index].PreparedSourceID == promoted.ID {
			promotedJob = &projectJobs[index]
			break
		}
	}
	if promotedJob == nil {
		t.Fatalf("project jobs = %#v, want preserved generated audio job for promoted source", projectJobs)
	}
	if promotedJob.TemporarySourceID != "" || promotedJob.AudioPath == "" || promotedJob.Timing == nil {
		t.Fatalf("promoted job = %#v, want durable project audio with timing", promotedJob)
	}
	if _, _, err := service.GetAudio(promotedJob.ID); err != nil {
		t.Fatalf("GetAudio(promoted job) returned error: %v", err)
	}
	if _, err := service.GetHighlightMap(promotedJob.ID); err != nil {
		t.Fatalf("GetHighlightMap(promoted job) returned error: %v", err)
	}

	if err := service.DeleteTemporarySource(temporary.ID); err != nil {
		t.Fatalf("DeleteTemporarySource returned error: %v", err)
	}
	if _, err := service.GetTemporarySource(temporary.ID); !errors.Is(err, pipeline.ErrTemporarySourceNotFound) {
		t.Fatalf("GetTemporarySource after delete error = %v, want not found", err)
	}
	if _, err := os.Stat(completed.AudioPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary audio stat error = %v, want removed", err)
	}
	if _, _, err := service.GetAudio(promotedJob.ID); err != nil {
		t.Fatalf("promoted audio should survive temporary deletion: %v", err)
	}
	if _, err := service.GetPreparedSource(promoted.ID); err != nil {
		t.Fatalf("promoted project source should survive temporary deletion: %v", err)
	}
}

func hasSourceArtifactKind(artifacts []pipeline.SourceArtifactRef, kind pipeline.SourceArtifactKind) bool {
	for _, artifact := range artifacts {
		if artifact.Kind == kind {
			return true
		}
	}
	return false
}

func TestTemporarySourceCleanupPreservesExpiredRecoveryMetadata(t *testing.T) {
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             1,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			TemporarySourceTTL:     time.Millisecond,
		},
	)
	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "Temporary source that should expire.",
		SourceName: "expires.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	artifactPath := filepath.Join(service.Options().TemporaryArtifactDir, temporary.ID, "source.txt")
	if _, err := os.Stat(artifactPath); err != nil {
		t.Fatalf("temporary artifact should exist before cleanup: %v", err)
	}
	time.Sleep(5 * time.Millisecond)
	if _, err := service.CleanupExpiredTemporarySources(time.Now().UTC()); err != nil {
		t.Fatalf("CleanupExpiredTemporarySources returned error: %v", err)
	}
	recovered, err := service.GetTemporarySource(temporary.ID)
	if err != nil {
		t.Fatalf("GetTemporarySource expired recovery returned error: %v", err)
	}
	if recovered.Status != pipeline.TemporarySourceStateExpired || recovered.Text != "" || len(recovered.Artifacts) != 0 {
		t.Fatalf("recovered = %#v, want expired metadata without artifacts", recovered)
	}
	if recovered.Error == "" {
		t.Fatalf("recovered error message is empty, want recovery explanation")
	}
	if _, err := os.Stat(artifactPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("artifact stat error = %v, want removed artifact", err)
	}
	if _, err := service.CreateTemporarySourceJob(context.Background(), temporary.ID, pipeline.CreateJobRequest{}); !errors.Is(err, pipeline.ErrTemporarySourceExpired) {
		t.Fatalf("CreateTemporarySourceJob after cleanup error = %v, want expired", err)
	}
	summary := service.TemporaryStorageUsageSummary(time.Now().UTC())
	if summary.ExpiredCount != 1 {
		t.Fatalf("summary expired count = %d, want 1", summary.ExpiredCount)
	}
	if _, err := service.ClearExpiredTemporarySources(time.Now().UTC()); err != nil {
		t.Fatalf("ClearExpiredTemporarySources returned error: %v", err)
	}
	if _, err := service.GetTemporarySource(temporary.ID); !errors.Is(err, pipeline.ErrTemporarySourceNotFound) {
		t.Fatalf("GetTemporarySource after clear error = %v, want not found", err)
	}
}

func TestTemporaryCleanupAllArtifactsDoesNotAffectPromotedProjectArtifacts(t *testing.T) {
	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "Temporary narration source with audio to promote.",
		SourceName: "promote-cleanup.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	job, err := service.CreateTemporarySourceJob(context.Background(), temporary.ID, pipeline.CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreateTemporarySourceJob returned error: %v", err)
	}
	_ = waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	project, err := service.CreateProject("Promoted cleanup")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	promoted, err := service.PromoteTemporarySource(context.Background(), temporary.ID, pipeline.TemporarySourcePromotionRequest{
		ProjectID: project.ID,
		Keep: pipeline.TemporarySourcePromotionKeep{
			ExtractedSource: true,
			GeneratedAudio:  true,
			TimingMaps:      true,
		},
	})
	if err != nil {
		t.Fatalf("PromoteTemporarySource returned error: %v", err)
	}
	projectJobs, err := service.ListProjectJobs(project.ID)
	if err != nil {
		t.Fatalf("ListProjectJobs returned error: %v", err)
	}
	var promotedJob *pipeline.VoiceJob
	for index := range projectJobs {
		if projectJobs[index].PreparedSourceID == promoted.ID {
			promotedJob = &projectJobs[index]
			break
		}
	}
	if promotedJob == nil {
		t.Fatalf("project jobs = %#v, want promoted generated audio", projectJobs)
	}
	if _, err := service.CleanupTemporarySource(temporary.ID, pipeline.TemporarySourceCleanupRequest{
		Action: pipeline.TemporarySourceCleanupRemoveAllArtifacts,
	}); err != nil {
		t.Fatalf("CleanupTemporarySource returned error: %v", err)
	}
	if _, _, err := service.GetAudio(promotedJob.ID); err != nil {
		t.Fatalf("promoted audio should survive temporary cleanup: %v", err)
	}
	if _, err := service.GetHighlightMap(promotedJob.ID); err != nil {
		t.Fatalf("promoted timing should survive temporary cleanup: %v", err)
	}
	if _, err := service.GetPreparedSource(promoted.ID); err != nil {
		t.Fatalf("promoted source should survive temporary cleanup: %v", err)
	}
}

func TestTemporarySourceCleanupRejectsPathTraversalIDs(t *testing.T) {
	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	projectArtifactRoot := filepath.Join(service.Options().SourcePrepDir, "project-artifact-root")
	if err := os.MkdirAll(projectArtifactRoot, 0o755); err != nil {
		t.Fatalf("mkdir project artifact root: %v", err)
	}
	projectArtifactPath := filepath.Join(projectArtifactRoot, "source-prep.json")
	if err := os.WriteFile(projectArtifactPath, []byte(`{"project":"durable"}`), 0o644); err != nil {
		t.Fatalf("write project artifact: %v", err)
	}

	if err := service.DeleteTemporarySource("../source-preps/project-artifact-root"); !errors.Is(err, pipeline.ErrTemporarySourceNotFound) {
		t.Fatalf("DeleteTemporarySource traversal error = %v, want temporary source not found", err)
	}
	if _, err := service.CleanupTemporarySource("../source-preps/project-artifact-root", pipeline.TemporarySourceCleanupRequest{
		Action: pipeline.TemporarySourceCleanupRemoveAllArtifacts,
	}); !errors.Is(err, pipeline.ErrTemporarySourceNotFound) {
		t.Fatalf("CleanupTemporarySource traversal error = %v, want temporary source not found", err)
	}
	if _, err := os.Stat(projectArtifactPath); err != nil {
		t.Fatalf("project artifact should survive traversal cleanup attempt: %v", err)
	}
}

func TestTemporarySourcePromotionRejectsDuplicateProjectSourceUnlessKeepBoth(t *testing.T) {
	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	project, err := service.CreateProject("Duplicates")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	first, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "First duplicate body.",
		SourceName: "duplicate.md",
		URL:        "https://example.test/duplicate",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource first returned error: %v", err)
	}
	if _, err := service.PromoteTemporarySource(context.Background(), first.ID, pipeline.TemporarySourcePromotionRequest{
		ProjectID: project.ID,
		Title:     "Duplicate title",
	}); err != nil {
		t.Fatalf("PromoteTemporarySource first returned error: %v", err)
	}
	second, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "Second duplicate body.",
		SourceName: "duplicate-again.md",
		URL:        "https://example.test/duplicate",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource second returned error: %v", err)
	}
	if _, err := service.PromoteTemporarySource(context.Background(), second.ID, pipeline.TemporarySourcePromotionRequest{
		ProjectID: project.ID,
		Title:     "Duplicate title",
	}); !errors.Is(err, pipeline.ErrTemporarySourceConflict) {
		t.Fatalf("PromoteTemporarySource duplicate error = %v, want conflict", err)
	}
	promoted, err := service.PromoteTemporarySource(context.Background(), second.ID, pipeline.TemporarySourcePromotionRequest{
		ConflictResolution: "keepBoth",
		ProjectID:          project.ID,
		Title:              "Duplicate title",
	})
	if err != nil {
		t.Fatalf("PromoteTemporarySource keepBoth returned error: %v", err)
	}
	if promoted.ProjectID != project.ID || promoted.ID == second.ID {
		t.Fatalf("promoted keepBoth source = %#v, want new project source", promoted)
	}
}

func TestTemporaryWebpageMetadataAndPromotion(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = response.Write([]byte(`<!doctype html>
<html lang="en">
<head>
  <title>Temporary Webpage Fixture</title>
  <link rel="canonical" href="https://example.com/articles/temporary-webpage-fixture">
  <meta name="author" content="Fixture Author">
  <meta property="og:site_name" content="Fixture Site">
</head>
<body>
  <nav>Subscribe Search Menu</nav>
  <article>
    <h1>Temporary Webpage Fixture</h1>
    <p>This article body is readable enough for temporary Website Cinema narration.</p>
    <p>The closing paragraph gives the extraction path a second stable narration block.</p>
  </article>
</body>
</html>`))
	}))
	defer server.Close()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             1,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			SourceURLAllowPrivate:  true,
		},
	)

	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind: pipeline.PreparedSourceKindURL,
		URL:  server.URL + "/article",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	if temporary.ProjectID != "" || temporary.SourceOwner != pipeline.SourceOwnerTemporary {
		t.Fatalf("temporary ownership = project %q owner %q, want temporary boundary", temporary.ProjectID, temporary.SourceOwner)
	}
	if strings.Contains(temporary.Text, "<article") ||
		strings.Contains(temporary.Text, "Subscribe Search Menu") ||
		!strings.Contains(temporary.Text, "This article body is readable enough") {
		t.Fatalf("temporary text = %q, want readable article text without page chrome", temporary.Text)
	}
	quality, ok := temporary.Metadata["websiteExtractionQuality"].(sourceprep.HTMLExtractionQuality)
	if !ok {
		t.Fatalf("website extraction quality metadata missing: %#v", temporary.Metadata)
	}
	if quality.ExtractionConfidence == "" || quality.SkippedBlockCount == 0 {
		t.Fatalf("quality = %#v, want confidence and skipped clutter", quality)
	}
	websiteMetadata, ok := temporary.Metadata["websiteMetadata"].(map[string]string)
	if !ok {
		t.Fatalf("website metadata missing: %#v", temporary.Metadata)
	}
	if websiteMetadata["canonicalUrl"] != "https://example.com/articles/temporary-webpage-fixture" ||
		websiteMetadata["author"] != "Fixture Author" ||
		websiteMetadata["siteName"] != "Fixture Site" ||
		websiteMetadata["language"] != "en" {
		t.Fatalf("website metadata = %#v", websiteMetadata)
	}
	provenance, ok := temporary.Metadata["urlProvenance"].(map[string]string)
	if !ok || provenance["requestedUrl"] == "" || provenance["fetchedUrl"] == "" {
		t.Fatalf("url provenance = %#v, want requested and fetched URL", temporary.Metadata["urlProvenance"])
	}
	webpage, ok := temporary.Metadata["webpage"].(map[string]any)
	if !ok ||
		webpage["canonicalUrl"] != "https://example.com/articles/temporary-webpage-fixture" ||
		webpage["domain"] != "example.com" ||
		webpage["title"] != "Temporary Webpage Fixture" ||
		webpage["language"] != "en" ||
		webpage["extractionConfidence"] == "" ||
		webpage["skippedContent"] == nil ||
		webpage["wordCount"] == nil {
		t.Fatalf("webpage metadata = %#v, want canonical url, domain, title, language, word count, skipped content, and confidence", webpage)
	}

	project, err := service.CreateProject("Webpage project")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	promoted, err := service.PromoteTemporarySource(context.Background(), temporary.ID, pipeline.TemporarySourcePromotionRequest{
		ProjectID:  project.ID,
		SourceType: "webpage",
		Language:   "en-US",
	})
	if err != nil {
		t.Fatalf("PromoteTemporarySource returned error: %v", err)
	}
	if promoted.ProjectID != project.ID || promoted.TemporarySourceID != "" {
		t.Fatalf("promoted source = %#v, want project copy with safe metadata provenance", promoted)
	}
	if promoted.Metadata["websiteMetadata"] == nil || promoted.Metadata["urlProvenance"] == nil {
		t.Fatalf("promoted metadata = %#v, want webpage provenance preserved", promoted.Metadata)
	}
	manifest, ok := promoted.Metadata["promotion"].(pipeline.TemporarySourcePromotionManifest)
	if !ok || manifest.TemporarySourceID != temporary.ID || manifest.SourceType != "webpage" || manifest.Language != "en-US" {
		t.Fatalf("promotion manifest = %#v, want safe webpage promotion provenance", promoted.Metadata["promotion"])
	}
	if promoted.Metadata["sourceType"] != "webpage" || promoted.Metadata["language"] != "en-US" {
		t.Fatalf("promoted metadata = %#v, want promotion confirmation facts", promoted.Metadata)
	}

	fallback, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		HTMLContainerSelector: "__visible_text_only",
		Kind:                  pipeline.PreparedSourceKindURL,
		URL:                   server.URL + "/article",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource fallback returned error: %v", err)
	}
	fallbackQuality, ok := fallback.Metadata["websiteExtractionQuality"].(sourceprep.HTMLExtractionQuality)
	if !ok || fallbackQuality.ChosenContainer != "visible text" || !fallbackQuality.ArticleUncertain {
		t.Fatalf("fallback quality = %#v, want visible text degraded extraction", fallback.Metadata["websiteExtractionQuality"])
	}
}

func TestTemporarySourceExpiryRemovesArtifacts(t *testing.T) {
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             1,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			TemporarySourceTTL:     time.Millisecond,
		},
	)
	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Text:       "This temporary source should expire.",
		SourceName: "expiring.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	artifactPath := filepath.Join(service.Options().TemporaryArtifactDir, temporary.ID, "source.txt")
	if _, err := os.Stat(artifactPath); err != nil {
		t.Fatalf("artifact should exist before expiry: %v", err)
	}
	removed, err := service.CleanupExpiredTemporarySources(time.Now().UTC().Add(time.Second))
	if err != nil {
		t.Fatalf("CleanupExpiredTemporarySources returned error: %v", err)
	}
	if len(removed) != 1 || removed[0] != temporary.ID {
		t.Fatalf("removed = %#v, want temporary id", removed)
	}
	if _, err := os.Stat(artifactPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("artifact stat after expiry = %v, want removed", err)
	}
}

func TestTemporarySourceGetRefreshesExpiry(t *testing.T) {
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             1,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
			TemporarySourceTTL:     time.Hour,
		},
	)
	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Text:       "This temporary source should stay alive while Theatre is active.",
		SourceName: "active.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}
	refreshed, err := service.GetTemporarySource(temporary.ID)
	if err != nil {
		t.Fatalf("GetTemporarySource returned error: %v", err)
	}
	if !refreshed.LastAccessedAt.After(temporary.LastAccessedAt) {
		t.Fatalf("LastAccessedAt = %s, want after %s", refreshed.LastAccessedAt, temporary.LastAccessedAt)
	}
	if !refreshed.ExpiresAt.After(temporary.ExpiresAt) {
		t.Fatalf("ExpiresAt = %s, want after %s", refreshed.ExpiresAt, temporary.ExpiresAt)
	}
	removed, err := service.CleanupExpiredTemporarySources(temporary.ExpiresAt.Add(time.Millisecond))
	if err != nil {
		t.Fatalf("CleanupExpiredTemporarySources returned error: %v", err)
	}
	if len(removed) != 0 {
		t.Fatalf("removed = %#v, want active temporary source preserved", removed)
	}
}

func TestTemporarySourceCreationAcceptsLocalReadableDocument(t *testing.T) {
	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	localPath := filepath.Join(t.TempDir(), "local.md")
	if err := os.WriteFile(localPath, []byte("Local readable temporary document."), 0o644); err != nil {
		t.Fatalf("write local document: %v", err)
	}

	temporary, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		LocalPath: localPath,
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource(localPath) returned error: %v", err)
	}
	if temporary.Kind != string(pipeline.PreparedSourceKindFile) || temporary.SourceName != "local.md" {
		t.Fatalf("temporary = %#v, want file-kind local document", temporary)
	}
}
