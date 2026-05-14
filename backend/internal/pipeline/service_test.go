package pipeline_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/audio"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestCreateJobCompletesWithMockAgents(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "CPU usage is 90% + memory = 4GB"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	if job.Status != pipeline.JobStatusQueued {
		t.Fatalf("initial status = %q, want %q", job.Status, pipeline.JobStatusQueued)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.OptimizedText == "" {
		t.Fatal("optimized text should not be empty")
	}

	audio, contentType, err := service.GetAudio(job.ID)
	if err != nil {
		t.Fatalf("GetAudio returned error: %v", err)
	}

	if contentType != "audio/wav" {
		t.Fatalf("content type = %q, want audio/wav", contentType)
	}

	if len(audio) <= 44 {
		t.Fatalf("audio length = %d, want WAV data", len(audio))
	}

	if completed.AudioPath == "" {
		t.Fatal("completed job should include saved audio path")
	}
	if _, err := os.Stat(completed.AudioPath); err != nil {
		t.Fatalf("saved audio should exist: %v", err)
	}
	metadataPath := filepath.Join(filepath.Dir(completed.AudioPath), "metadata.json")
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("saved metadata should exist: %v", err)
	}
}

func TestCreateJobRetriesCleanCutoff(t *testing.T) {
	t.Parallel()

	checker := &cutoffChecker{}
	service := newMockService(t, checker)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", completed.Retries.Attempts)
	}
	if !completed.VoiceCheck.Complete {
		t.Fatal("voice check should be complete")
	}
	if checker.calls != 2 {
		t.Fatalf("checker calls = %d, want 2", checker.calls)
	}
}

func TestCreateJobRetriesRejectedSegmentFromStart(t *testing.T) {
	t.Parallel()

	checker := &retryRejectedChecker{}
	service := newMockService(t, checker)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", completed.Retries.Attempts)
	}
	if !completed.VoiceCheck.Complete {
		t.Fatal("voice check should be complete")
	}
	if checker.calls != 2 {
		t.Fatalf("checker calls = %d, want 2", checker.calls)
	}
}

func TestCreateJobMarksCheckerFailedWhenRetryLimitExhausts(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		&alwaysRejectChecker{},
		pipeline.Options{MaxRetries: 2, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	failed := waitForFailedJob(t, service, job.ID)
	if failed.Stages.Checker != pipeline.StageStatusFailed {
		t.Fatalf("checker stage = %q, want %q", failed.Stages.Checker, pipeline.StageStatusFailed)
	}
	if failed.Stages.Synthesis != pipeline.StageStatusDone {
		t.Fatalf("synthesis stage = %q, want %q", failed.Stages.Synthesis, pipeline.StageStatusDone)
	}
	if failed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", failed.Retries.Attempts)
	}
}

func TestCreateJobExposesStreamingOptimizationPreview(t *testing.T) {
	t.Parallel()

	optimizer := &slowStreamingOptimizer{
		firstDelta: make(chan struct{}),
		release:    make(chan struct{}),
	}
	released := false
	defer func() {
		if !released {
			close(optimizer.release)
		}
	}()

	service := pipeline.NewService(
		optimizer,
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "source text"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	select {
	case <-optimizer.firstDelta:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first streamed optimizer delta")
	}

	current, err := service.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	if current.OptimizedText != "streamed" {
		t.Fatalf("optimized preview = %q, want streamed partial text", current.OptimizedText)
	}

	close(optimizer.release)
	released = true
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestCreateJobRejectsEmptyText(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	_, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "   "})
	if err == nil {
		t.Fatal("CreateJob should reject empty text")
	}
}

func TestCreateJobUsesSelectedNativeVoice(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:    "voice selection should flow into synthesis",
		VoiceID: "kokoro:bm_lewis",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.VoiceID != "kokoro:bm_lewis" {
		t.Fatalf("VoiceID = %q, want kokoro:bm_lewis", completed.VoiceID)
	}
	if completed.Voice != "bm_lewis" {
		t.Fatalf("Voice = %q, want bm_lewis", completed.Voice)
	}
}

func TestCreateJobRejectsUnknownVoice(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	_, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:    "unknown voice",
		VoiceID: "missing",
	})
	if err == nil {
		t.Fatal("CreateJob should reject unknown voice")
	}
}

func TestCreateCloneVoiceConvertsUploadedClip(t *testing.T) {
	tempDir := t.TempDir()
	referenceWAV, err := audio.SilentWAV(1000)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	referencePath := filepath.Join(tempDir, "reference.wav")
	if err := os.WriteFile(referencePath, referenceWAV, 0o600); err != nil {
		t.Fatalf("write reference WAV: %v", err)
	}

	ffmpegPath := filepath.Join(tempDir, "ffmpeg")
	ffmpegScript := "#!/usr/bin/env bash\nset -euo pipefail\nout=\"${@: -1}\"\ncp \"$TEST_REFERENCE_WAV\" \"$out\"\n"
	if err := os.WriteFile(ffmpegPath, []byte(ffmpegScript), 0o700); err != nil {
		t.Fatalf("write fake ffmpeg: %v", err)
	}
	t.Setenv("TEST_REFERENCE_WAV", referencePath)

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: filepath.Join(tempDir, "jobs"), VoiceDataDir: filepath.Join(tempDir, "voices"), FFMPEGPath: ffmpegPath},
	)

	voice, err := service.CreateCloneVoice(context.Background(), pipeline.VoiceUpload{
		Name:     "Test Clone",
		Filename: "sample.mov",
		Reader:   strings.NewReader("uploaded media"),
	})
	if err != nil {
		t.Fatalf("CreateCloneVoice returned error: %v", err)
	}
	if voice.Kind != pipeline.VoiceKindClone {
		t.Fatalf("Kind = %q, want %q", voice.Kind, pipeline.VoiceKindClone)
	}
	if voice.ReferenceAudioPath != "" {
		t.Fatalf("ReferenceAudioPath should be hidden from API response, got %q", voice.ReferenceAudioPath)
	}

	resolved, err := service.ResolveVoice(voice.ID)
	if err != nil {
		t.Fatalf("ResolveVoice returned error: %v", err)
	}
	if resolved.ReferenceAudioPath == "" {
		t.Fatal("resolved clone voice should include reference audio path")
	}
	if _, err := os.Stat(resolved.ReferenceAudioPath); err != nil {
		t.Fatalf("converted reference audio should exist: %v", err)
	}
}

func TestCreateJobPublishesPlayableAudioBeforeCompletion(t *testing.T) {
	t.Parallel()

	checker := newBlockingAfterFirstSegmentChecker()
	defer checker.unblock()
	service := pipeline.NewService(
		literalOptimizer{},
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 20, TTSWorkerCount: 2, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence. third sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	select {
	case <-checker.firstSegmentChecked:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first segment check")
	}

	waitForCondition(t, func() bool {
		current, err := service.GetJob(job.ID)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}

		return current.AudioURL != "" && current.Status != pipeline.JobStatusCompleted && current.Retries.CompletedSegments >= 1
	}, "partial playable audio")

	audioBytes, _, err := service.GetAudio(job.ID)
	if err != nil {
		t.Fatalf("GetAudio returned error for partial audio: %v", err)
	}
	if len(audioBytes) <= 44 {
		t.Fatalf("partial audio length = %d, want WAV data", len(audioBytes))
	}

	checker.unblock()
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

type literalOptimizer struct{}

func (optimizer literalOptimizer) Optimize(_ context.Context, text string) (string, error) {
	return text, nil
}

func (optimizer literalOptimizer) ProviderName() string {
	return "literal"
}

type slowStreamingOptimizer struct {
	firstDelta chan struct{}
	release    chan struct{}
}

func (optimizer *slowStreamingOptimizer) Optimize(_ context.Context, _ string) (string, error) {
	return "streamed final text", nil
}

func (optimizer *slowStreamingOptimizer) OptimizeStream(_ context.Context, _ string, onDelta func(string)) (string, error) {
	onDelta("streamed ")
	close(optimizer.firstDelta)
	<-optimizer.release
	onDelta("final text")

	return "streamed final text", nil
}

func (optimizer *slowStreamingOptimizer) ProviderName() string {
	return "test-stream"
}

type retryRejectedChecker struct {
	calls int
}

func (checker *retryRejectedChecker) Check(_ context.Context, optimizedText string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	if checker.calls == 1 {
		return agents.VoiceCheckResult{
			Complete:    false,
			Transcript:  "unrelated transcript",
			NeedsResume: false,
			Reason:      "test rejected attempt",
			Provider:    "test",
			Similarity:  0.1,
		}, nil
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "test complete",
		Provider:    "test",
		Similarity:  1,
	}, nil
}

type alwaysRejectChecker struct{}

func (checker *alwaysRejectChecker) Check(_ context.Context, _ string, _ []byte) (agents.VoiceCheckResult, error) {
	return agents.VoiceCheckResult{
		Complete:    false,
		Transcript:  "unrelated transcript",
		NeedsResume: false,
		Reason:      "test rejected attempt",
		Provider:    "test",
		Similarity:  0.1,
	}, nil
}

type cutoffChecker struct {
	calls int
}

func (checker *cutoffChecker) Check(_ context.Context, optimizedText string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	if checker.calls == 1 {
		return agents.VoiceCheckResult{
			Complete:    false,
			Transcript:  "first sentence.",
			ResumeText:  "second sentence.",
			NeedsResume: true,
			Reason:      "test cutoff",
			Provider:    "test",
			Similarity:  0.5,
		}, nil
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "test complete",
		Provider:    "test",
		Similarity:  1,
	}, nil
}

type blockingAfterFirstSegmentChecker struct {
	firstSegmentChecked chan struct{}
	release             chan struct{}
	once                sync.Once
	releaseOnce         sync.Once
}

func newBlockingAfterFirstSegmentChecker() *blockingAfterFirstSegmentChecker {
	return &blockingAfterFirstSegmentChecker{
		firstSegmentChecked: make(chan struct{}),
		release:             make(chan struct{}),
	}
}

func (checker *blockingAfterFirstSegmentChecker) Check(_ context.Context, optimizedText string, _ []byte) (agents.VoiceCheckResult, error) {
	if strings.Contains(optimizedText, "first sentence") {
		checker.once.Do(func() {
			close(checker.firstSegmentChecked)
		})
		return agents.VoiceCheckResult{
			Complete:    true,
			Transcript:  optimizedText,
			NeedsResume: false,
			Reason:      "test first segment complete",
			Provider:    "test",
			Similarity:  1,
		}, nil
	}

	<-checker.release
	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "test complete",
		Provider:    "test",
		Similarity:  1,
	}, nil
}

func (checker *blockingAfterFirstSegmentChecker) unblock() {
	checker.releaseOnce.Do(func() {
		close(checker.release)
	})
}

func newMockService(t *testing.T, checker pipeline.VoiceChecker) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir()},
	)
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
			return job
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

func waitForCondition(t *testing.T, condition func() bool, label string) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}

	t.Fatalf("timed out waiting for %s", label)
}
