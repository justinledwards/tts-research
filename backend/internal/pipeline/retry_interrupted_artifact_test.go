package pipeline

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/audio"
)

func TestRetryArtifactSemanticsMarkOnlyAffectedSegmentRetryable(t *testing.T) {
	for _, testCase := range []struct {
		name           string
		job            VoiceJob
		wantState      AudioArtifactState
		wantCode       string
		wantUnaffected AudioArtifactState
	}{
		{
			name:           "cancellation interrupts active segment and preserves checked compatible prefix",
			job:            retryArtifactJobFixture(JobStatusCancelled, JobTerminalReasonUserCancelled, JobFailureKindCancellation, true, "running"),
			wantState:      AudioArtifactStateInterruptedRetriable,
			wantCode:       "interrupted",
			wantUnaffected: AudioArtifactStateChecked,
		},
		{
			name:           "provider failure marks failed segment retryable and preserves checked compatible prefix",
			job:            retryArtifactJobFixture(JobStatusFailed, JobTerminalReasonProviderFailed, JobFailureKindEngine, true, "failed"),
			wantState:      AudioArtifactStateRetryable,
			wantCode:       string(JobTerminalReasonProviderFailed),
			wantUnaffected: AudioArtifactStateChecked,
		},
		{
			name:           "checking failure marks failed segment retryable instead of checked",
			job:            retryArtifactJobFixture(JobStatusFailed, JobTerminalReasonValidationFailed, JobFailureKindBackend, true, "failed"),
			wantState:      AudioArtifactStateRetryable,
			wantCode:       string(JobTerminalReasonValidationFailed),
			wantUnaffected: AudioArtifactStateChecked,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			job := normalizePartialAudioManifest(testCase.job)
			if got := job.Segments[0].ArtifactState; got != testCase.wantUnaffected {
				t.Fatalf("unaffected segment state = %q, want %q", got, testCase.wantUnaffected)
			}
			if got := job.Segments[1].ArtifactState; got != testCase.wantState {
				t.Fatalf("affected segment state = %q, want %q", got, testCase.wantState)
			}
			if !job.Segments[1].Replaceable || job.Segments[1].Retry == nil || !job.Segments[1].Retry.Retryable || job.Segments[1].Retry.Scope != AudioArtifactRetryScopeSegment {
				t.Fatalf("affected segment retry metadata = %#v, replaceable=%t; want segment-scoped retryable", job.Segments[1].Retry, job.Segments[1].Replaceable)
			}
			if job.Segments[1].FailureCode != testCase.wantCode {
				t.Fatalf("affected failure code = %q, want %q", job.Segments[1].FailureCode, testCase.wantCode)
			}
			if job.Segments[0].Retry != nil || job.Segments[0].FailureCode != "" || job.Segments[0].Replaceable {
				t.Fatalf("unaffected checked segment carried retry/failure/replaceable metadata: %#v", job.Segments[0])
			}
			if job.PartialAudioManifest == nil || job.PartialAudioManifest.ArtifactState != testCase.wantState || job.PartialAudioManifest.Retry == nil {
				t.Fatalf("manifest retry state = %#v, want affected state surfaced", job.PartialAudioManifest)
			}
		})
	}
}

func TestRestartAndCancelDoNotMarkReadyPrefixInterruptedWhenCurrentSegmentIsStale(t *testing.T) {
	for _, testCase := range []struct {
		name string
		act  func(VoiceJob) VoiceJob
	}{
		{
			name: "backend restart",
			act: func(job VoiceJob) VoiceJob {
				interrupted, changed := markInterruptedRuntimeJob(job, time.Date(2026, 5, 17, 3, 0, 0, 0, time.UTC))
				if !changed {
					t.Fatalf("markInterruptedRuntimeJob changed = false, want true")
				}
				return interrupted
			},
		},
		{
			name: "user cancellation",
			act: func(job VoiceJob) VoiceJob {
				job.Status = JobStatusCancelled
				job.TerminalReason = JobTerminalReasonUserCancelled
				job.FailureKind = JobFailureKindCancellation
				job.Retriable = true
				job.Retries.CurrentSegment = retryAffectedSegmentIndex(job)
				return job
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			job := retryArtifactJobFixture(JobStatusSynthesizing, "", "", false, "pending")
			job.ID = "job-stale-current-" + strings.ReplaceAll(testCase.name, " ", "-")
			job.AudioReadySegments = 1
			job.Retries.CurrentSegment = 1
			job.Retries.TotalSegments = 3
			job.Segments[0].Status = "ready"
			job.Segments[0].ArtifactState = AudioArtifactStateChecked
			job.Segments[1].Status = "pending"
			job.Segments[1].ArtifactState = ""
			job.Segments[1].Reason = ""

			got := normalizePartialAudioManifest(testCase.act(job))
			if got.Retries.CurrentSegment != 2 {
				t.Fatalf("current segment = %d, want first not-ready segment 2", got.Retries.CurrentSegment)
			}
			if got.Segments[0].ArtifactState != AudioArtifactStateUnchecked && got.Segments[0].ArtifactState != AudioArtifactStateChecked {
				t.Fatalf("ready prefix state = %q, want reusable non-failure state", got.Segments[0].ArtifactState)
			}
			if got.Segments[0].Retry != nil || got.Segments[0].Replaceable || got.Segments[0].FailureCode != "" {
				t.Fatalf("ready prefix marked retry/failure: %#v", got.Segments[0])
			}
			if got.Segments[1].ArtifactState != AudioArtifactStateInterruptedRetriable || got.Segments[1].Retry == nil || !got.Segments[1].Retry.Retryable {
				t.Fatalf("affected pending segment = %#v, want interrupted retryable", got.Segments[1])
			}
		})
	}
}

func TestReloadJobsMarksActiveWorkInterruptedRetriable(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	job := retryArtifactJobFixture(JobStatusChecking, "", "", false, "checking")
	job.ID = "job-interrupted-reload"
	job.Phase = JobPipelinePhaseCheck
	job.Stages.Synthesis = StageStatusDone
	job.Stages.Checker = StageStatusRunning
	if err := service.writeJobMetadata(job); err != nil {
		t.Fatalf("writeJobMetadata active job returned error: %v", err)
	}

	reloaded := NewService(nil, nil, nil, options)
	got, err := reloaded.GetJob("job-interrupted-reload")
	if err != nil {
		t.Fatalf("GetJob reloaded interrupted returned error: %v", err)
	}
	if got.Status != JobStatusCancelled || !got.Retriable || got.TerminalReason != JobTerminalReasonSystemCancelled || got.FailedPhase != JobPipelinePhaseCheck {
		t.Fatalf("reloaded job = status %q retriable %t terminal %q failedPhase %q, want interrupted retriable cancellation", got.Status, got.Retriable, got.TerminalReason, got.FailedPhase)
	}
	if got.Segments[0].ArtifactState != AudioArtifactStateChecked {
		t.Fatalf("checked prefix state after reload = %q, want checked", got.Segments[0].ArtifactState)
	}
	if got.Segments[1].ArtifactState != AudioArtifactStateInterruptedRetriable || got.Segments[1].Retry == nil || !got.Segments[1].Retry.Retryable {
		t.Fatalf("active segment after reload = %#v, want interrupted retryable", got.Segments[1])
	}
	var disk VoiceJob
	readSourceLifecycleJSON(t, filepath.Join(options.JobDataDir, "job-interrupted-reload", "metadata.json"), &disk)
	if disk.Segments[1].ArtifactState != AudioArtifactStateInterruptedRetriable {
		t.Fatalf("disk active segment state = %q, want interrupted_retriable", disk.Segments[1].ArtifactState)
	}
}

func TestReloadJobsSurfacesInterruptedMetadataPersistenceFailure(t *testing.T) {
	options := sourceLifecycleTestOptions(t)
	service := NewService(nil, nil, nil, options)
	job := retryArtifactJobFixture(JobStatusChecking, "", "", false, "checking")
	job.ID = "job-interrupted-persist-fail"
	job.Phase = JobPipelinePhaseCheck
	if err := service.writeJobMetadata(job); err != nil {
		t.Fatalf("writeJobMetadata active job returned error: %v", err)
	}
	options.interruptedJobMetadataWriter = func(_ *Service, _ VoiceJob) error {
		return os.ErrPermission
	}

	reloaded := NewService(nil, nil, nil, options)
	got, err := reloaded.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob reloaded interrupted returned error: %v", err)
	}
	if got.Status != JobStatusCancelled || !got.Retriable {
		t.Fatalf("reloaded job = status %q retriable %t, want in-memory interrupted retryable", got.Status, got.Retriable)
	}
	if !strings.Contains(got.Error, "failed to persist interrupted job metadata") || !strings.Contains(got.Progress.Detail, "Persisting interrupted job metadata failed") {
		t.Fatalf("reloaded job error/detail = %q / %q, want visible persistence failure", got.Error, got.Progress.Detail)
	}

	var disk VoiceJob
	readSourceLifecycleJSON(t, filepath.Join(options.JobDataDir, job.ID, "metadata.json"), &disk)
	if disk.Status != JobStatusChecking {
		t.Fatalf("disk job status = %q, want original active metadata when interrupted write failed", disk.Status)
	}
}

func TestReusableAudioPrefixReusesOnlyCompatibleCheckedArtifacts(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	source := retryArtifactJobFixture(JobStatusCompleted, "", "", false, "failed")
	source.ID = "job-reuse-source"
	source.AudioReadySegments = 2
	source.Retries.TotalSegments = 2
	source.Segments = source.Segments[:2]
	source.Stages.Checker = StageStatusDone
	source.VoiceCheck.Complete = true
	source.QualityReport = &JobQualityReport{Enabled: true, SegmentCount: 2}
	source.Segments[0].Status = "ready"
	source.Segments[0].ArtifactState = AudioArtifactStateChecked
	source.Segments[0].ArtifactCompatibilityKey = segmentAudioArtifactCompatibilityKey(source, 1, source.Segments[0].Text)
	source.Segments[1].Status = "failed"
	source.Segments[1].ArtifactState = AudioArtifactStateRetryable
	source.Segments[1].ArtifactCompatibilityKey = segmentAudioArtifactCompatibilityKey(source, 2, source.Segments[1].Text)
	service.save(storedJob{VoiceJob: source})
	writeTestSegmentAudio(t, service, source.ID, 1)
	writeTestSegmentAudio(t, service, source.ID, 2)

	reused := service.reusableAudioPrefix(source.ID, []string{source.Segments[0].Text, source.Segments[1].Text})
	if len(reused) != 1 || reused[0].index != 1 || reused[0].sourceArtifactID == "" {
		t.Fatalf("reused prefix = %#v, want only first checked compatible artifact", reused)
	}

	source.Segments[0].ArtifactState = AudioArtifactStateStale
	service.save(storedJob{VoiceJob: source})
	if reused := service.reusableAudioPrefix(source.ID, []string{source.Segments[0].Text, source.Segments[1].Text}); len(reused) != 0 {
		t.Fatalf("stale source segment reused = %#v, want no reuse", reused)
	}
}

func TestResumeResolverFailsClosedForWrongRetryEvidenceAndNonCurrentArtifacts(t *testing.T) {
	service := newSourceLifecycleTestService(t)
	persistProgressFixtureManifests(t, service, "sr-md-002", "rum-md-002", "ram-md-002", "audio-md-checked", ManifestSnapshotStateCurrent)
	progress := testDurableProgress("progress-retry-evidence", "ram-md-002", "sr-md-002", "audio-md-checked", DurableProgressStateCurrent)
	if _, err := service.PersistDurableProgress(progress); err != nil {
		t.Fatalf("PersistDurableProgress returned error: %v", err)
	}

	for _, testCase := range []struct {
		name   string
		mutate func(*ResumeAudioArtifactEvidence)
	}{
		{name: "missing unit", mutate: func(artifact *ResumeAudioArtifactEvidence) { artifact.UnitID = "" }},
		{name: "missing segment for segment retry", mutate: func(artifact *ResumeAudioArtifactEvidence) { artifact.SegmentID = "" }},
		{name: "wrong unit", mutate: func(artifact *ResumeAudioArtifactEvidence) { artifact.UnitID = "unit-other" }},
		{name: "wrong segment", mutate: func(artifact *ResumeAudioArtifactEvidence) { artifact.SegmentID = "seg-other" }},
	} {
		t.Run(testCase.name+" retry evidence fails closed", func(t *testing.T) {
			artifact := checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateRetryable, &AudioArtifactRetryMetadata{Retryable: true, Scope: AudioArtifactRetryScopeSegment})
			testCase.mutate(&artifact)
			resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{ProgressID: progress.ProgressID, AudioArtifacts: []ResumeAudioArtifactEvidence{artifact}})
			if err != nil {
				t.Fatalf("ResolveResumeProgress returned error: %v", err)
			}
			if resolution.Decision != ResumeDecisionBlockedFailed || resolution.RetryArtifactID != "" {
				t.Fatalf("%s retry evidence resolution = %#v, want blocked without retry", testCase.name, resolution)
			}
		})
	}

	missingUnitChecked := checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateChecked, nil)
	missingUnitChecked.UnitID = ""
	resolution, err := service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:            progress.ProgressID,
		AudioArtifacts:        []ResumeAudioArtifactEvidence{missingUnitChecked},
		SyncFidelityDecisions: []SyncFidelityDecision{exactSyncDecision("sync-missing-unit", "audio-md-checked", "ram-md-002", "sr-md-002")},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress missing-unit checked returned error: %v", err)
	}
	if resolution.Decision == ResumeDecisionAutoResumeCurrent || resolution.Decision == ResumeDecisionOfferRetry {
		t.Fatalf("missing-unit checked artifact resolution = %#v, want no current or retry over-promotion", resolution)
	}

	stale := checkedAudioEvidence("audio-md-checked", "ram-md-002", "sr-md-002", AudioArtifactStateStale, nil)
	resolution, err = service.ResolveResumeProgress(ResumeResolutionRequest{
		ProgressID:            progress.ProgressID,
		AudioArtifacts:        []ResumeAudioArtifactEvidence{stale},
		SyncFidelityDecisions: []SyncFidelityDecision{exactSyncDecision("sync-stale-artifact", "audio-md-checked", "ram-md-002", "sr-md-002")},
	})
	if err != nil {
		t.Fatalf("ResolveResumeProgress stale artifact returned error: %v", err)
	}
	if resolution.Decision != ResumeDecisionResumeSourceOnly {
		t.Fatalf("stale artifact exact-sync resolution = %#v, want source-only not exact/current", resolution)
	}
}

func retryArtifactJobFixture(status JobStatus, terminal JobTerminalReason, kind JobFailureKind, retriable bool, affectedStatus string) VoiceJob {
	now := time.Date(2026, 5, 17, 2, 0, 0, 0, time.UTC)
	job := VoiceJob{
		ID:                  "job-retry-artifact",
		ProjectID:           defaultProjectID,
		PreparedSourceID:    "prepared-md",
		Status:              status,
		Phase:               JobPipelinePhaseCheck,
		Stages:              PipelineStages{Optimization: StageStatusDone, Synthesis: StageStatusRunning, Checker: StageStatusRunning},
		PipelineOptions:     PipelineOptions{ASRCheck: true, AutoRetry: true, QualityReport: true},
		RunMode:             RunModeCheckedMaster,
		PerformanceMode:     PerformanceModeBalanced,
		SpeechPolicyProfile: "default",
		AudioPartialURL:     "/api/voice-jobs/job-retry-artifact/audio/partial",
		AudioReadySegments:  1,
		Retries:             RetryMetadata{CurrentSegment: 2, TotalSegments: 3, MaxRetries: 2, SegmentAttempts: 1},
		TerminalReason:      terminal,
		FailureKind:         kind,
		Retriable:           retriable,
		Error:               "segment failed",
		CreatedAt:           now,
		UpdatedAt:           now,
		Segments: []JobSegment{
			{Index: 1, Text: "Reusable checked segment.", Status: "ready", AudioURL: "/segment/1", ArtifactID: "job-retry-artifact:segment:000001", ArtifactState: AudioArtifactStateChecked, CheckedAt: &now},
			{Index: 2, Text: "Affected retry segment.", Status: affectedStatus, ArtifactID: "job-retry-artifact:segment:000002", Reason: "affected failure"},
			{Index: 3, Text: "Future segment.", Status: "pending", ArtifactID: "job-retry-artifact:segment:000003"},
		},
	}
	for index := range job.Segments {
		job.Segments[index].ArtifactCompatibilityKey = segmentAudioArtifactCompatibilityKey(job, index+1, job.Segments[index].Text)
	}
	return job
}

func writeTestSegmentAudio(t *testing.T, service *Service, jobID string, index int) {
	t.Helper()
	bytes, err := audio.SpeechLikeWAV(120)
	if err != nil {
		t.Fatalf("SpeechLikeWAV returned error: %v", err)
	}
	if _, err := service.writeJobSegmentAudio(jobID, index, bytes); err != nil {
		t.Fatalf("writeJobSegmentAudio(%d) returned error: %v", index, err)
	}
	if _, err := os.Stat(filepath.Join(service.options.JobDataDir, jobID, jobSegmentAudioFilename(index))); err != nil {
		t.Fatalf("segment audio stat returned error: %v", err)
	}
}
