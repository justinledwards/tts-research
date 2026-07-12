package pipeline

import (
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/highlightmap"
)

const syncFidelityDecisionSchemaVersion = "sync-fidelity-decision.v1"

const minExactSyncConfidence = 0.75

type syncFidelityDecisionInput struct {
	Job         VoiceJob
	Highlight   highlightmap.HighlightMapV2
	Quality     alignment.AlignmentQualityReport
	GeneratedAt time.Time
	Final       bool
	LowResource bool
}

func deriveSyncFidelityDecision(input syncFidelityDecisionInput) SyncFidelityDecision {
	generatedAt := input.GeneratedAt
	if generatedAt.IsZero() {
		generatedAt = time.Now().UTC()
	}
	job := input.Job
	sourceID, sourceRevisionID, sourceCurrent := syncSourceRevisionContext(job, input.Highlight)
	mappingValid := exactWordMappingValid(input.Highlight, sourceID)
	phraseMapping := phraseMappingAvailable(input.Highlight, sourceID)
	wordTimingReliable := exactTimingConfidenceReliable(input.Quality)
	phraseTiming := phraseTimingAvailable(input.Highlight, input.Quality)
	blockTiming := blockTimingAvailable(input.Highlight, input.Quality)
	playableAudio := jobHasPlayableSyncAudio(job)
	artifactCompatible := jobHasSyncCompatibleCheckedAudioArtifact(job, input.Final)
	confidence := syncConfidence(input.Highlight, input.Quality)
	driftBudget := input.Highlight.Summary.DriftBudgetMS
	if driftBudget <= 0 && input.Quality.PrimaryLevel != "" {
		driftBudget = syncDriftBudgetForLevel(string(input.Quality.PrimaryLevel))
	}

	decision := SyncFidelityDecision{
		SchemaVersion:       syncFidelityDecisionSchemaVersion,
		DecisionID:          fmt.Sprintf("%s:sync-fidelity", firstNonEmpty(job.ID, "job")),
		SourceID:            sourceID,
		SourceRevisionID:    sourceRevisionID,
		ReadalongManifestID: firstNonEmpty(job.ProgressTargetID, fmt.Sprintf("%s:readalong", firstNonEmpty(job.ID, "job"))),
		AudioArtifactID:     syncAudioArtifactID(job),
		HighlightMapID:      syncHighlightMapID(job, input.Highlight),
		GeneratedAt:         generatedAt.UTC(),
		Evidence: SyncFidelityEvidence{
			SourceRevisionCurrent: sourceCurrent,
			MappingValid:          mappingValid,
			TimingConfidence:      wordTimingReliable,
			LowResourceMode:       input.LowResource,
			ArtifactCompatible:    artifactCompatible,
			Confidence:            confidence,
		},
	}
	if driftBudget > 0 {
		decision.Evidence.DriftBudgetMS = driftBudget
	}

	allExactGates := sourceCurrent && mappingValid && wordTimingReliable && !input.LowResource && artifactCompatible
	if allExactGates {
		decision.Fidelity = SyncFidelityExactWord
		decision.ExactAllowed = true
		return decision
	}

	decision.ExactAllowed = false
	decision.Fidelity, decision.FallbackReason = syncFallbackFidelity(syncFallbackInput{
		lowResource:        input.LowResource,
		playableAudio:      playableAudio,
		sourceCurrent:      sourceCurrent,
		mappingValid:       mappingValid,
		phraseMapping:      phraseMapping,
		wordTimingReliable: wordTimingReliable,
		phraseTiming:       phraseTiming,
		blockTiming:        blockTiming,
		artifactCompatible: artifactCompatible,
		quality:            input.Quality,
	})
	return decision
}

type syncFallbackInput struct {
	lowResource        bool
	playableAudio      bool
	sourceCurrent      bool
	mappingValid       bool
	phraseMapping      bool
	wordTimingReliable bool
	phraseTiming       bool
	blockTiming        bool
	artifactCompatible bool
	quality            alignment.AlignmentQualityReport
}

func syncFallbackFidelity(input syncFallbackInput) (SyncFidelity, string) {
	if input.lowResource && input.playableAudio && input.sourceCurrent && (input.mappingValid || input.phraseMapping || input.blockTiming) {
		return SyncFidelityBlock, "low-resource mode downgraded exact word sync to block highlighting"
	}
	if !input.playableAudio {
		if input.sourceCurrent {
			return SyncFidelitySourceOnly, "no playable audio is available; source-only reading remains available"
		}
		return SyncFidelityNone, "no playable audio or source mapping is available"
	}
	if alignmentIsDegradedOrHeuristic(input.quality) {
		if input.sourceCurrent && (input.mappingValid || input.phraseMapping || input.blockTiming) {
			return SyncFidelityBlock, "timing is degraded or heuristic; using block-level sync"
		}
		return SyncFidelityAudioOnly, "playable audio is available but source mapping is not trustworthy"
	}
	if input.phraseTiming && input.sourceCurrent && input.phraseMapping {
		return SyncFidelityPhrase, firstNonEmpty(input.quality.FallbackReason, exactGateFallbackReason(input))
	}
	if input.blockTiming && input.sourceCurrent && (input.mappingValid || input.phraseMapping) {
		return SyncFidelityBlock, firstNonEmpty(input.quality.FallbackReason, exactGateFallbackReason(input))
	}
	return SyncFidelityAudioOnly, "playable audio is available but trustworthy source/highlight mapping is not available"
}

func exactGateFallbackReason(input syncFallbackInput) string {
	reasons := make([]string, 0, 4)
	if !input.sourceCurrent {
		reasons = append(reasons, "source revision context is missing or ambiguous")
	}
	if !input.mappingValid {
		reasons = append(reasons, "word highlight mapping is missing source word identity")
	}
	if !input.wordTimingReliable {
		reasons = append(reasons, "word timing confidence is not reliable enough for exact sync")
	}
	if !input.artifactCompatible {
		reasons = append(reasons, "audio artifact is not checked and compatible for exact sync")
	}
	if len(reasons) == 0 {
		return "exact word sync gates did not all pass"
	}
	return strings.Join(reasons, "; ")
}

func syncSourceRevisionContext(job VoiceJob, highlight highlightmap.HighlightMapV2) (string, string, bool) {
	sourceIDs := make([]string, 0, 3)
	if clean := strings.TrimSpace(job.BookSourceID); clean != "" {
		sourceIDs = append(sourceIDs, clean)
	}
	if clean := strings.TrimSpace(job.PreparedSourceID); clean != "" {
		sourceIDs = append(sourceIDs, clean)
	}
	if clean := strings.TrimSpace(job.TemporarySourceID); clean != "" {
		sourceIDs = append(sourceIDs, clean)
	}
	if len(sourceIDs) != 1 {
		return firstNonEmpty(highlight.SourceID, job.BookSourceID, job.PreparedSourceID, job.TemporarySourceID), "", false
	}
	sourceID := sourceIDs[0]
	if strings.TrimSpace(highlight.SourceID) != "" && strings.TrimSpace(highlight.SourceID) != sourceID {
		return sourceID, syncRuntimeSourceRevisionID(job, sourceID), false
	}
	return sourceID, syncRuntimeSourceRevisionID(job, sourceID), true
}

func syncRuntimeSourceRevisionID(job VoiceJob, sourceID string) string {
	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" {
		return ""
	}
	if strings.TrimSpace(job.BookSourceID) == sourceID {
		return bookSourceRevisionID(sourceID)
	}
	return sourceID + "-rev"
}

func exactWordMappingValid(highlight highlightmap.HighlightMapV2, sourceID string) bool {
	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" || len(highlight.Entries) == 0 {
		return false
	}
	wordCount := 0
	for _, entry := range highlight.Entries {
		if entry.Level != "word" {
			continue
		}
		wordCount++
		if strings.TrimSpace(entry.SourceID) != sourceID {
			return false
		}
		if entry.SourceWordIndex == nil || strings.TrimSpace(entry.SourceWordID) == "" {
			return false
		}
		if strings.TrimSpace(entry.NodeID) == "" || strings.TrimSpace(entry.SpeechPlanID) == "" {
			return false
		}
		if entry.TokenIndex == nil {
			return false
		}
		if !syncWordTextMappingMatches(entry) {
			return false
		}
	}
	return wordCount > 0
}

func syncWordTextMappingMatches(entry highlightmap.HighlightMapV2Entry) bool {
	sourceText := strings.TrimSpace(entry.TextQuote)
	spokenText := strings.TrimSpace(entry.SpokenText)
	if entry.Traceability != nil {
		sourceText = firstNonEmpty(entry.Traceability.SourceTextMatch, entry.Traceability.NormalizedTextMatch, sourceText)
		spokenText = firstNonEmpty(entry.Traceability.SpokenTextMatch, spokenText)
	}
	return normalizeSyncWordText(sourceText) != "" && normalizeSyncWordText(sourceText) == normalizeSyncWordText(spokenText)
}

func normalizeSyncWordText(text string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(text)) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func phraseMappingAvailable(highlight highlightmap.HighlightMapV2, sourceID string) bool {
	sourceID = strings.TrimSpace(sourceID)
	if sourceID == "" {
		return false
	}
	for _, entry := range highlight.Entries {
		if entry.Level != "phrase" {
			continue
		}
		if strings.TrimSpace(entry.SourceID) == sourceID && strings.TrimSpace(entry.NodeID) != "" {
			return true
		}
	}
	return false
}

func exactTimingConfidenceReliable(report alignment.AlignmentQualityReport) bool {
	if !report.WordTimingReliable || report.PrimaryLevel != alignment.AlignmentLevelWord {
		return false
	}
	switch report.Quality {
	case alignment.AlignmentQualityExact, alignment.AlignmentQualityGood:
	default:
		return false
	}
	if report.Confidence.Overall < minExactSyncConfidence || report.Confidence.Token < minExactSyncConfidence {
		return false
	}
	return true
}

func phraseTimingAvailable(highlight highlightmap.HighlightMapV2, report alignment.AlignmentQualityReport) bool {
	if highlight.Summary.PhraseCount > 0 || report.FragmentCount > 0 {
		return report.Quality != alignment.AlignmentQualityUnavailable
	}
	return false
}

func blockTimingAvailable(highlight highlightmap.HighlightMapV2, report alignment.AlignmentQualityReport) bool {
	if len(highlight.Entries) > 0 || report.FragmentCount > 0 || report.TokenCount > 0 {
		return true
	}
	return false
}

func alignmentIsDegradedOrHeuristic(report alignment.AlignmentQualityReport) bool {
	if report.Quality == alignment.AlignmentQualityDegraded || report.Quality == alignment.AlignmentQualityUnavailable {
		return true
	}
	return report.TimingSource == alignment.TimingSourceHeuristic || report.TimingSourceV2 == "heuristic"
}

func jobHasPlayableSyncAudio(job VoiceJob) bool {
	if strings.TrimSpace(job.AudioPath) != "" || strings.TrimSpace(job.AudioURL) != "" || strings.TrimSpace(job.AudioPartialURL) != "" {
		return true
	}
	if job.AudioReadySegments > 0 {
		return true
	}
	return job.PartialAudioManifest != nil && job.PartialAudioManifest.ReadySegments > 0
}

func jobHasSyncCompatibleCheckedAudioArtifact(job VoiceJob, final bool) bool {
	if !jobHasPlayableSyncAudio(job) {
		return false
	}
	if syncHasHardArtifactIncompatibility(job) {
		return false
	}
	if job.PartialAudioManifest != nil && job.PartialAudioManifest.ArtifactState == AudioArtifactStateChecked {
		return true
	}
	ready := max(0, min(job.AudioReadySegments, len(job.Segments)))
	if ready > 0 {
		allReadyChecked := true
		for index := 0; index < ready; index++ {
			if job.Segments[index].ArtifactState != AudioArtifactStateChecked {
				allReadyChecked = false
				break
			}
		}
		if allReadyChecked && ready == len(job.Segments) {
			return true
		}
	}
	if !final && job.Status != JobStatusCompleted {
		return false
	}
	if strings.TrimSpace(job.AudioPath) == "" || len(job.Segments) == 0 || job.AudioReadySegments < len(job.Segments) {
		return false
	}
	return jobHasCheckerEvidenceForSync(job)
}

func syncHasHardArtifactIncompatibility(job VoiceJob) bool {
	if job.PartialAudioManifest != nil {
		switch job.PartialAudioManifest.ArtifactState {
		case AudioArtifactStateStale, AudioArtifactStateReplaced, AudioArtifactStateFailed, AudioArtifactStateRetryable, AudioArtifactStateInterruptedRetriable:
			return true
		}
	}
	for _, segment := range job.Segments {
		switch segment.ArtifactState {
		case AudioArtifactStateStale, AudioArtifactStateReplaced, AudioArtifactStateFailed, AudioArtifactStateRetryable, AudioArtifactStateInterruptedRetriable:
			return true
		}
	}
	return false
}

func jobHasCheckerEvidenceForSync(job VoiceJob) bool {
	if !job.PipelineOptions.ASRCheck {
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

func syncAudioArtifactID(job VoiceJob) string {
	if job.PartialAudioManifest != nil && len(job.PartialAudioManifest.Segments) == 1 {
		return firstNonEmpty(job.PartialAudioManifest.Segments[0].ArtifactID, fmt.Sprintf("%s:audio", firstNonEmpty(job.ID, "job")))
	}
	return fmt.Sprintf("%s:audio", firstNonEmpty(job.ID, "job"))
}

func syncHighlightMapID(job VoiceJob, highlight highlightmap.HighlightMapV2) string {
	if strings.TrimSpace(highlight.GeneratedAudioID) != "" {
		return fmt.Sprintf("%s:highlight-map-v2", highlight.GeneratedAudioID)
	}
	return fmt.Sprintf("%s:highlight-map-v2", firstNonEmpty(job.ID, "job"))
}

func syncConfidence(highlight highlightmap.HighlightMapV2, report alignment.AlignmentQualityReport) float64 {
	confidence := report.Confidence.Overall
	if confidence <= 0 {
		confidence = highlight.Summary.Confidence
	}
	if confidence < 0 {
		return 0
	}
	if confidence > 1 {
		return 1
	}
	return confidence
}

func syncDriftBudgetForLevel(level string) int {
	switch level {
	case "word":
		return 150
	case "phrase", "sentence":
		return 350
	default:
		return 700
	}
}
