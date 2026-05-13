package pipeline_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestCreateJobCompletesWithMockAgents(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), "CPU usage is 90% + memory = 4GB")
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

	job, err := service.CreateJob(context.Background(), "first sentence. second sentence.")
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

	job, err := service.CreateJob(context.Background(), "first sentence. second sentence.")
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

	job, err := service.CreateJob(context.Background(), "source text")
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

	_, err := service.CreateJob(context.Background(), "   ")
	if err == nil {
		t.Fatal("CreateJob should reject empty text")
	}
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
