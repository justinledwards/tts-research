package pipeline

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"time"
)

const audioArtifactCompatibilityKeyPrefix = "qqp431-segment-audio"

func normalizeJobSegmentAudioArtifacts(job VoiceJob) VoiceJob {
	readySegments := max(0, min(job.AudioReadySegments, len(job.Segments)))
	checked := jobHasCheckedAudioArtifactEvidence(job)
	for index := range job.Segments {
		segmentIndex := index + 1
		segment := &job.Segments[index]
		if segment.Index <= 0 {
			segment.Index = segmentIndex
		}
		if strings.TrimSpace(segment.ArtifactID) == "" {
			segment.ArtifactID = segmentAudioArtifactID(job.ID, segmentIndex)
		}
		if strings.TrimSpace(segment.ArtifactCompatibilityKey) == "" {
			segment.ArtifactCompatibilityKey = segmentAudioArtifactCompatibilityKey(job, segmentIndex, segment.Text)
		}
		if segment.ReusedFromJobID != "" && segment.Reuse == nil {
			segment.Reuse = compatibleAudioReuseMetadata(
				segment.ReusedFromJobID,
				segmentIndex,
				segment.ArtifactCompatibilityKey,
				AudioArtifactStateUnchecked,
			)
		}

		state := deriveSegmentAudioArtifactState(job, *segment, segmentIndex, readySegments, checked)
		segment.ArtifactState = state
		segment.Replaceable = audioArtifactStateIsReplaceable(state)
		if state == AudioArtifactStateChecked {
			if segment.CheckedAt == nil {
				segment.CheckedAt = audioArtifactCheckedAt(job)
			}
		} else if state != AudioArtifactStateReplaced {
			segment.CheckedAt = nil
		}
		if audioArtifactStateIsFailureLike(state) {
			segment.FailureMessage = firstNonEmpty(segment.Reason, job.Error, string(state))
			segment.FailureCode = audioArtifactFailureCode(job, state)
			segment.Retry = audioArtifactRetryMetadata(job, *segment, state)
		} else {
			segment.FailureCode = ""
			segment.FailureMessage = ""
			segment.Retry = nil
		}
		if segment.Replacement != nil {
			segment.Replacement.NewState = state
		}
	}
	return job
}

func deriveSegmentAudioArtifactState(job VoiceJob, segment JobSegment, index int, readySegments int, checked bool) AudioArtifactState {
	existing := segment.ArtifactState
	if existing == AudioArtifactStateStale || existing == AudioArtifactStateReplaced {
		return existing
	}
	affected := segmentAudioArtifactAffectedByTerminal(job, segment, index, readySegments)
	if !affected && existing == AudioArtifactStateChecked && index <= readySegments {
		return AudioArtifactStateChecked
	}
	status := strings.TrimSpace(segment.Status)
	if status == "failed" {
		if job.Retriable {
			return AudioArtifactStateRetryable
		}
		return AudioArtifactStateFailed
	}
	if job.Status == JobStatusCancelled && affected {
		return AudioArtifactStateInterruptedRetriable
	}
	if status == "retrying" {
		return AudioArtifactStateRetryable
	}
	if index <= readySegments {
		if checked {
			return AudioArtifactStateChecked
		}
		return AudioArtifactStateUnchecked
	}
	return AudioArtifactStateGenerating
}

func segmentAudioArtifactAffectedByTerminal(job VoiceJob, segment JobSegment, index int, readySegments int) bool {
	status := strings.TrimSpace(segment.Status)
	statusAffected := segmentStatusIndicatesAffectedAudioArtifact(status)
	if index == job.Retries.CurrentSegment && job.Retries.CurrentSegment > 0 {
		return index > readySegments || statusAffected
	}
	if statusAffected {
		return true
	}
	if job.Status == JobStatusCancelled && index > readySegments && index == max(1, job.Retries.CurrentSegment) {
		return true
	}
	return false
}

func segmentStatusIndicatesAffectedAudioArtifact(status string) bool {
	switch status {
	case "running", "checking", "retrying", "failed", "interrupted":
		return true
	default:
		return false
	}
}

func jobHasCheckedAudioArtifactEvidence(job VoiceJob) bool {
	if job.Status != JobStatusCompleted {
		return false
	}
	if !job.PipelineOptions.ASRCheck {
		return false
	}
	if job.Stages.Checker != StageStatusDone {
		return false
	}
	if !job.VoiceCheck.Complete {
		return false
	}
	if job.QualityReport == nil || !job.QualityReport.Enabled {
		return false
	}
	if job.QualityReport.UnverifiedSegmentCount > 0 {
		return false
	}
	if jobHasSegmentReviewWarnings(job) {
		return false
	}
	return true
}

func jobHasSegmentReviewWarnings(job VoiceJob) bool {
	for _, segment := range job.Segments {
		if len(segment.Warnings) > 0 {
			return true
		}
	}
	return false
}

func audioArtifactStateIsReplaceable(state AudioArtifactState) bool {
	switch state {
	case AudioArtifactStateUnchecked, AudioArtifactStateStale, AudioArtifactStateFailed, AudioArtifactStateRetryable, AudioArtifactStateInterruptedRetriable:
		return true
	default:
		return false
	}
}

func audioArtifactStateAllowsCompatibleReuse(state AudioArtifactState) bool {
	switch state {
	case AudioArtifactStateChecked, AudioArtifactStateUnchecked:
		return true
	default:
		return false
	}
}

func audioArtifactCheckedAt(job VoiceJob) *time.Time {
	if job.CompletedAt != nil {
		checkedAt := job.CompletedAt.UTC()
		return &checkedAt
	}
	if !job.UpdatedAt.IsZero() {
		checkedAt := job.UpdatedAt.UTC()
		return &checkedAt
	}
	checkedAt := time.Now().UTC()
	return &checkedAt
}

func audioArtifactFailureCode(job VoiceJob, state AudioArtifactState) string {
	if state == AudioArtifactStateInterruptedRetriable {
		return "interrupted"
	}
	if job.TerminalReason != "" {
		return string(job.TerminalReason)
	}
	if job.FailureKind != "" {
		return string(job.FailureKind)
	}
	return string(state)
}

func audioArtifactStateIsFailureLike(state AudioArtifactState) bool {
	switch state {
	case AudioArtifactStateFailed, AudioArtifactStateRetryable, AudioArtifactStateInterruptedRetriable:
		return true
	default:
		return false
	}
}

func audioArtifactRetryMetadata(job VoiceJob, segment JobSegment, state AudioArtifactState) *AudioArtifactRetryMetadata {
	return &AudioArtifactRetryMetadata{
		Retryable: state == AudioArtifactStateRetryable || state == AudioArtifactStateInterruptedRetriable || job.Retriable,
		Scope:     AudioArtifactRetryScopeSegment,
		Reason:    firstNonEmpty(segment.FailureMessage, segment.Reason, job.Error, string(state)),
		Attempt:   segment.Attempts,
	}
}

func segmentAudioArtifactID(jobID string, index int) string {
	cleanJobID := strings.TrimSpace(jobID)
	if cleanJobID == "" {
		cleanJobID = "job"
	}
	return fmt.Sprintf("%s:segment:%06d", cleanJobID, index)
}

func segmentAudioArtifactCompatibilityKey(job VoiceJob, index int, text string) string {
	parts := []string{
		audioArtifactCompatibilityKeyPrefix,
		firstNonEmpty(job.PreparedSourceID, job.BookSourceID, job.TemporarySourceID, job.ProjectID),
		job.PreparedSourceID,
		job.BookSourceID,
		job.TemporarySourceID,
		job.SourceKind,
		job.SpeechPolicyProfile,
		fmt.Sprintf("speech-render:%t", job.SpeechRenderApplied),
		job.Locale,
		job.TTSEngine,
		job.TTSVoice,
		job.TTSLanguage,
		job.VoiceID,
		job.VoiceProfileID,
		job.VoiceProfileLanguage,
		string(job.RunMode),
		string(job.PerformanceMode),
		fmt.Sprintf("asr:%t", job.PipelineOptions.ASRCheck),
		fmt.Sprintf("voice-clone:%t", job.PipelineOptions.VoiceClone),
		fmt.Sprintf("segment:%06d", index),
		strings.TrimSpace(text),
	}
	engineOptionKeys := make([]string, 0, len(job.EngineOptions))
	for key := range job.EngineOptions {
		engineOptionKeys = append(engineOptionKeys, key)
	}
	sort.Strings(engineOptionKeys)
	for _, key := range engineOptionKeys {
		parts = append(parts, "engineOption:"+key+"="+job.EngineOptions[key])
	}
	parts = append(parts, "speechPolicyOverrides:"+fmt.Sprintf("%#v", job.SpeechPolicyOverrides))
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return audioArtifactCompatibilityKeyPrefix + ":" + hex.EncodeToString(digest[:])
}

func compatibleAudioReuseMetadata(fromJobID string, segmentIndex int, compatibilityKey string, stateOnReuse AudioArtifactState) *AudioArtifactReuseMetadata {
	return &AudioArtifactReuseMetadata{
		Reused:                true,
		FromJobID:             fromJobID,
		FromSegmentIndex:      segmentIndex,
		FromArtifactID:        segmentAudioArtifactID(fromJobID, segmentIndex),
		FromCompatibilityKey:  compatibilityKey,
		CompatibilityKey:      compatibilityKey,
		CompatibilityDecision: "compatible",
		ReuseAllowed:          true,
		StateOnReuse:          stateOnReuse,
		Reason:                "compatible segment audio reused from retry source job",
	}
}

func retryReplacementMetadata(fromJobID string, segmentIndex int) *AudioArtifactReplacementMetadata {
	return &AudioArtifactReplacementMetadata{
		ReplacementOfJobID:        fromJobID,
		ReplacementOfSegmentIndex: segmentIndex,
		ReplacementOfArtifactID:   segmentAudioArtifactID(fromJobID, segmentIndex),
		PreviousState:             AudioArtifactStateRetryable,
		Reason:                    "retry generated replacement segment audio",
	}
}
