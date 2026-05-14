package pipeline_test

import (
	"context"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strings"
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

func TestCreateJobCanSkipTextPreprocessing(t *testing.T) {
	t.Parallel()

	optimizer := &countingOptimizer{output: "this should not be used"}
	service := pipeline.NewService(
		optimizer,
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir()},
	)

	input := "Keep this text exactly as written."
	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text: input,
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			TextPreprocess: boolPtr(false),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if optimizer.calls != 0 {
		t.Fatalf("optimizer calls = %d, want 0", optimizer.calls)
	}
	if completed.OptimizedText != input {
		t.Fatalf("optimized text = %q, want %q", completed.OptimizedText, input)
	}
	if completed.Optimizer != "disabled" {
		t.Fatalf("optimizer = %q, want disabled", completed.Optimizer)
	}
}

func TestCreateJobCanSkipASRCheckAndRetry(t *testing.T) {
	t.Parallel()

	checker := &countingRejectChecker{}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text: "first sentence. second sentence.",
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			ASRCheck:      boolPtr(false),
			AutoRetry:     boolPtr(false),
			QualityReport: boolPtr(true),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if checker.calls != 0 {
		t.Fatalf("checker calls = %d, want 0", checker.calls)
	}
	if completed.Retries.MaxRetries != 1 {
		t.Fatalf("max retries = %d, want 1", completed.Retries.MaxRetries)
	}
	if completed.VoiceCheck.Provider != "disabled" {
		t.Fatalf("checker provider = %q, want disabled", completed.VoiceCheck.Provider)
	}
	if completed.QualityReport == nil {
		t.Fatal("quality report should be present")
	}
	if completed.QualityReport.ReferenceProfile {
		t.Fatal("quality report should not mark a default voice job as reference-profile")
	}
}

func TestCreateJobCanIgnoreSelectedVoiceProfile(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:      3,
			JobDataDir:      t.TempDir(),
			VoiceProfileDir: t.TempDir(),
		},
	)
	wav, err := audio.SilentWAV(1500)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}
	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Reference",
		"en",
		sourcePath,
		"reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:           "Use the default voice even though a profile is selected.",
		VoiceProfileID: profile.ID,
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			VoiceClone: boolPtr(false),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.VoiceProfileID != "" {
		t.Fatalf("voice profile id = %q, want empty when voiceClone=false", completed.VoiceProfileID)
	}
	if completed.Provider != "mock" {
		t.Fatalf("provider = %q, want mock", completed.Provider)
	}
}

func TestCreateJobPublishesPartialAudioWhileSynthesizing(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 10, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first short sentence. second short sentence. third short sentence"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	waitForAudioSegments(t, service, job.ID, 1)

	processingJob, err := service.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}

	if processingJob.AudioReadySegments < 1 {
		t.Fatalf("partial audio should be available after at least one segment, got %d", processingJob.AudioReadySegments)
	}

	partialAudio, partialType, err := service.GetPartialAudio(job.ID)
	if err != nil {
		t.Fatalf("GetPartialAudio returned error: %v", err)
	}

	if partialType != "audio/wav" {
		t.Fatalf("partial content type = %q, want audio/wav", partialType)
	}
	if len(partialAudio) <= 44 {
		t.Fatalf("partial audio length = %d, want WAV data", len(partialAudio))
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.AudioPath == "" {
		t.Fatal("completed job should include final audio path")
	}
}

func TestGetAudioSegmentReturnsOnlyWhenReady(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first short sentence. second short sentence. third short sentence"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	_, _, err = service.GetAudioSegment(job.ID, 100)
	if !errors.Is(err, pipeline.ErrAudioNotReady) {
		t.Fatalf("expected future segment to be unavailable before synthesis, got: %v", err)
	}

	waitForAudioSegments(t, service, job.ID, 1)

	segmentAudio, segmentType, err := service.GetAudioSegment(job.ID, 1)
	if err != nil {
		t.Fatalf("GetAudioSegment returned error: %v", err)
	}
	if segmentType != "audio/wav" {
		t.Fatalf("segment content type = %q, want audio/wav", segmentType)
	}
	if len(segmentAudio) <= 44 {
		t.Fatalf("segment audio length = %d, want WAV data", len(segmentAudio))
	}

	_, _, err = service.GetAudioSegment(job.ID, 101)
	if !errors.Is(err, pipeline.ErrAudioNotReady) {
		t.Fatalf("expected segment beyond completion to be unavailable yet, got: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.AudioReadySegments != completed.Retries.TotalSegments {
		t.Fatalf("all segments should be ready after completion, got %d of %d", completed.AudioReadySegments, completed.Retries.TotalSegments)
	}

	for segmentIndex := 1; segmentIndex <= completed.Retries.TotalSegments; segmentIndex += 1 {
		_, _, err := service.GetAudioSegment(job.ID, segmentIndex)
		if err != nil {
			t.Fatalf("segment %d should still be available after completion: %v", segmentIndex, err)
		}
	}
}

func TestCreateVoiceProfileTrimsLongPCM16WAVReference(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                      t.TempDir(),
			VoiceProfileDir:                 t.TempDir(),
			VoiceProfileReferenceMaxSeconds: 1,
		},
	)
	wav, err := audio.SilentWAV(2500)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "long-reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}

	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Samantha",
		"en",
		sourcePath,
		"long-reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	if profile.SourceDurationMS < 2400 {
		t.Fatalf("source duration = %d, want original long source duration", profile.SourceDurationMS)
	}
	if profile.ReferenceDurationMS > 1100 {
		t.Fatalf("reference duration = %d, want bounded reference", profile.ReferenceDurationMS)
	}
	if !profile.ReferenceTrimmed {
		t.Fatal("reference should be marked as trimmed")
	}
	if profile.ReferenceSampleStrategy != "pcm16-wav-first-1s" {
		t.Fatalf("strategy = %q, want pcm16-wav-first-1s", profile.ReferenceSampleStrategy)
	}
}

func TestCreateVoiceProfileKeepsShortPCM16WAVReference(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                      t.TempDir(),
			VoiceProfileDir:                 t.TempDir(),
			VoiceProfileReferenceMaxSeconds: 5,
		},
	)
	wav, err := audio.SilentWAV(1200)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "short-reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}

	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"short-reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	if profile.ReferenceTrimmed {
		t.Fatal("short reference should not be marked as trimmed")
	}
	if profile.ReferenceSampleStrategy != "pcm16-wav-full" {
		t.Fatalf("strategy = %q, want pcm16-wav-full", profile.ReferenceSampleStrategy)
	}
	if profile.SourceDurationMS != profile.ReferenceDurationMS {
		t.Fatalf("source duration = %d, reference duration = %d, want equal", profile.SourceDurationMS, profile.ReferenceDurationMS)
	}
}

func TestCreateVoiceProfileSourceBuildsCandidateReference(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 70_000, 9000)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 30_000, Confidence: 0.92},
					{SpeakerID: "SPEAKER_00", StartMS: 35_000, EndMS: 70_000, Confidence: 0.9},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"interview.wav",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if ready.SourceDurationMS < 69_000 {
		t.Fatalf("source duration = %d, want original normalized duration", ready.SourceDurationMS)
	}
	if len(ready.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(ready.Candidates))
	}

	candidate := ready.Candidates[0]
	if candidate.Status != "ready" {
		t.Fatalf("candidate status = %q, want ready: %s", candidate.Status, candidate.Reason)
	}
	if candidate.ReferenceDurationMS < 20_000 || candidate.ReferenceDurationMS > 60_000 {
		t.Fatalf("reference duration = %d, want bounded 20-60s", candidate.ReferenceDurationMS)
	}
	if candidate.ReferenceDurationMS > 46_000 {
		t.Fatalf("reference duration = %d, want close to 45s target", candidate.ReferenceDurationMS)
	}
	if len(candidate.Spans) < 2 {
		t.Fatalf("selected span count = %d, want non-contiguous best material", len(candidate.Spans))
	}
	if candidate.PreviewAudio == "" {
		t.Fatal("candidate should expose a preview endpoint")
	}
	if _, err := os.Stat(candidate.ReferencePath); err != nil {
		t.Fatalf("candidate reference should exist: %v", err)
	}
}

func TestCreateVoiceProfileSourceFailsClearlyWithoutDiarizationConfig(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 25_000, 8000)
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                         t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileAnalysisPythonPath:     "python3",
			VoiceProfileAnalysisScriptPath:     "./scripts/profile_analyze.py",
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"single-speaker.wav",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	failed := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusFailed)
	if !strings.Contains(failed.Error, "PYANNOTE_AUTH_TOKEN") {
		t.Fatalf("error = %q, want clear pyannote token setup message", failed.Error)
	}
}

func TestCreateVoiceProfileSourceReturnsMultipleSpeakers(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 60_000, 9500)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 25_000, Confidence: 0.88},
					{SpeakerID: "SPEAKER_01", StartMS: 30_000, EndMS: 56_000, Confidence: 0.91},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "panel.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if len(ready.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2 speakers", len(ready.Candidates))
	}
	for _, candidate := range ready.Candidates {
		if candidate.Status != "ready" {
			t.Fatalf("candidate %s status = %q, want ready", candidate.ID, candidate.Status)
		}
	}
}

func TestCreateVoiceProfileSourceRejectsSilentMaterial(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 25_000, 0)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 25_000, Confidence: 0.9},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "silent.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	failed := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusFailed)
	if !strings.Contains(failed.Error, "no usable speaker candidates") {
		t.Fatalf("error = %q, want no usable candidates", failed.Error)
	}
}

func TestCreateVoiceProfileFromCandidateCopiesCompatibleReference(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 30_000, 10_000)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 30_000, Confidence: 0.94},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "narrator.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	candidate := ready.Candidates[0]

	profile, err := service.CreateVoiceProfileFromCandidate(
		context.Background(),
		ready.ID,
		candidate.ID,
		"Narrator",
		"en",
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileFromCandidate returned error: %v", err)
	}

	if profile.SourceID != ready.ID {
		t.Fatalf("profile sourceId = %q, want %q", profile.SourceID, ready.ID)
	}
	if profile.SpeakerID != "SPEAKER_00" {
		t.Fatalf("profile speakerId = %q, want SPEAKER_00", profile.SpeakerID)
	}
	if profile.ReferencePath == "" {
		t.Fatal("profile should keep a reference path")
	}
	if _, err := os.Stat(profile.ReferencePath); err != nil {
		t.Fatalf("profile reference should exist: %v", err)
	}
	if profile.ReferenceDurationMS < 20_000 || profile.ReferenceDurationMS > 60_000 {
		t.Fatalf("profile reference duration = %d, want bounded candidate reference", profile.ReferenceDurationMS)
	}
	if profile.QualityMetrics == nil || profile.QualityMetrics.CleanSpeech <= 0 {
		t.Fatalf("profile quality metrics should be copied, got %#v", profile.QualityMetrics)
	}
}

func TestCreateJobPublishesSegmentTelemetry(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(
		context.Background(),
		pipeline.CreateJobRequest{Text: "first short sentence. second short sentence."},
	)
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if len(completed.Segments) == 0 {
		t.Fatal("completed job should expose segments")
	}
	for _, segment := range completed.Segments {
		if segment.Status != "ready" {
			t.Fatalf("segment %d status = %q, want ready", segment.Index, segment.Status)
		}
		if segment.Attempts <= 0 {
			t.Fatalf("segment %d attempts = %d, want positive", segment.Index, segment.Attempts)
		}
		if segment.DurationMS <= 0 {
			t.Fatalf("segment %d duration = %d, want positive", segment.Index, segment.DurationMS)
		}
		if segment.LatencyMS < 0 {
			t.Fatalf("segment %d latency = %d, want non-negative", segment.Index, segment.LatencyMS)
		}
		if segment.Similarity <= 0 {
			t.Fatalf("segment %d similarity = %f, want positive", segment.Index, segment.Similarity)
		}
	}
}

func TestNewServiceStudioDefaultsAutoTuneThroughput(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:       320,
			SegmentWorkers:        2,
			StudioSegmentWorkers:  0,
			StudioSegmentMaxRunes: 0,
			JobDataDir:            t.TempDir(),
		},
	)

	options := service.Options()
	if options.SegmentWorkers != 2 {
		t.Fatalf("segmentWorkers = %d, want %d", options.SegmentWorkers, 2)
	}
	if options.StudioSegmentWorkers != 4 {
		t.Fatalf("studio segmentWorkers = %d, want %d", options.StudioSegmentWorkers, 4)
	}
	if options.StudioSegmentMaxRunes != 220 {
		t.Fatalf("studio segment max runes = %d, want %d", options.StudioSegmentMaxRunes, 220)
	}
	if options.StudioSegmentWorkersAdaptive != 6 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 6)
	}
	if options.StudioSegmentMaxRunesAdaptive != 180 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 180)
	}
}

func TestNewServiceStudioDefaultsAllowExplicitOverride(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:       320,
			SegmentWorkers:        2,
			StudioSegmentWorkers:  2,
			StudioSegmentMaxRunes: 300,
			JobDataDir:            t.TempDir(),
		},
	)

	options := service.Options()
	if options.StudioSegmentWorkers != 2 {
		t.Fatalf("studio segmentWorkers = %d, want %d", options.StudioSegmentWorkers, 2)
	}
	if options.StudioSegmentMaxRunes != 300 {
		t.Fatalf("studio segment max runes = %d, want %d", options.StudioSegmentMaxRunes, 300)
	}
	if options.StudioSegmentWorkersAdaptive != 4 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 4)
	}
	if options.StudioSegmentMaxRunesAdaptive != 180 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 180)
	}
}

func TestNewServiceAdaptiveStudioOverrides(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:               320,
			SegmentWorkers:                2,
			StudioSegmentWorkers:          2,
			StudioSegmentMaxRunes:         300,
			StudioSegmentWorkersAdaptive:  5,
			StudioSegmentMaxRunesAdaptive: 140,
			JobDataDir:                    t.TempDir(),
		},
	)

	options := service.Options()
	if options.StudioSegmentWorkersAdaptive != 5 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 5)
	}
	if options.StudioSegmentMaxRunesAdaptive != 140 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 140)
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

type slowStreamingOptimizer struct {
	firstDelta chan struct{}
	release    chan struct{}
}

type mockProfileSourceAnalyzer struct {
	result pipeline.VoiceProfileSourceAnalysisResult
	err    error
}

func (analyzer mockProfileSourceAnalyzer) AnalyzeVoiceProfileSource(
	_ context.Context,
	_ pipeline.VoiceProfileSourceAnalysisRequest,
) (pipeline.VoiceProfileSourceAnalysisResult, error) {
	if analyzer.err != nil {
		return pipeline.VoiceProfileSourceAnalysisResult{}, analyzer.err
	}
	return analyzer.result, nil
}

func newProfileSourceService(
	t *testing.T,
	analyzer pipeline.VoiceProfileSourceAnalyzer,
) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:                         3,
			JobDataDir:                         t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileSourceAnalyzer:         analyzer,
		},
	)
}

func writeToneWAV(t *testing.T, durationMS int, amplitude int16) string {
	t.Helper()

	spec := audio.WAVSpec{SampleRate: 24000, ChannelCount: 1, BitsPerSample: 16}
	sampleCount := spec.SampleRate * durationMS / 1000
	data := make([]byte, sampleCount*2)
	for sampleIndex := 0; sampleIndex < sampleCount; sampleIndex += 1 {
		value := amplitude
		if sampleIndex%48 >= 24 {
			value = -amplitude
		}
		binary.LittleEndian.PutUint16(data[sampleIndex*2:sampleIndex*2+2], uint16(value))
	}

	path := filepath.Join(t.TempDir(), "source.wav")
	if err := os.WriteFile(path, audio.BuildPCM16WAV(data, spec), 0o644); err != nil {
		t.Fatalf("write tone wav: %v", err)
	}
	return path
}

func waitForProfileSource(
	t *testing.T,
	service *pipeline.Service,
	id string,
	status pipeline.VoiceProfileSourceStatus,
) pipeline.VoiceProfileSource {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		source, err := service.GetVoiceProfileSource(id)
		if err != nil {
			t.Fatalf("GetVoiceProfileSource returned error: %v", err)
		}
		if source.Status == status {
			return source
		}
		if source.Status == pipeline.VoiceProfileSourceStatusFailed && status != source.Status {
			t.Fatalf("source failed unexpectedly: %s", source.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	source, err := service.GetVoiceProfileSource(id)
	if err != nil {
		t.Fatalf("GetVoiceProfileSource returned error: %v", err)
	}
	t.Fatalf("timed out waiting for source status %q, got %q (%s)", status, source.Status, source.Error)
	return pipeline.VoiceProfileSource{}
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

type countingOptimizer struct {
	calls  int
	output string
}

func (optimizer *countingOptimizer) Optimize(_ context.Context, _ string) (string, error) {
	optimizer.calls++
	return optimizer.output, nil
}

func (optimizer *countingOptimizer) ProviderName() string {
	return "counting"
}

type countingRejectChecker struct {
	calls int
}

func (checker *countingRejectChecker) Check(_ context.Context, _ string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	return agents.VoiceCheckResult{
		Complete:    false,
		Transcript:  "rejected",
		NeedsResume: false,
		Reason:      "test rejected",
		Provider:    "test",
		Similarity:  0.1,
	}, nil
}

func boolPtr(value bool) *bool {
	return &value
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
