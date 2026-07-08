package pipeline

import (
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/highlightmap"
)

func TestSyncFidelityExactWordRequiresAllEvidence(t *testing.T) {
	decision := deriveSyncFidelityDecision(syncFidelityFixture(false))
	if decision.Fidelity != SyncFidelityExactWord || !decision.ExactAllowed {
		t.Fatalf("decision = %#v, want exact word allowed", decision)
	}
	if !decision.Evidence.SourceRevisionCurrent || !decision.Evidence.MappingValid || !decision.Evidence.TimingConfidence || decision.Evidence.LowResourceMode || !decision.Evidence.ArtifactCompatible {
		t.Fatalf("evidence = %#v, want all exact gates true except low-resource", decision.Evidence)
	}
}

func TestSyncFidelityLowResourceDowngradesExactEvidenceToBlock(t *testing.T) {
	input := syncFidelityFixture(true)
	decision := deriveSyncFidelityDecision(input)
	if decision.Fidelity != SyncFidelityBlock || decision.ExactAllowed {
		t.Fatalf("decision = %#v, want block fallback without exact", decision)
	}
	if !decision.Evidence.LowResourceMode || !strings.Contains(decision.FallbackReason, "low-resource") {
		t.Fatalf("decision = %#v, want low-resource fallback evidence/reason", decision)
	}
}

func TestSyncFidelityUncheckedASRDisabledAudioDeniesExact(t *testing.T) {
	input := syncFidelityFixture(false)
	input.Job.PipelineOptions.ASRCheck = false
	input.Job.VoiceCheck.Provider = "disabled"
	input.Job.Segments[0].ArtifactState = AudioArtifactStateUnchecked
	input.Job.PartialAudioManifest.ArtifactState = AudioArtifactStateUnchecked
	input.Job.PartialAudioManifest.Segments[0].ArtifactState = AudioArtifactStateUnchecked
	decision := deriveSyncFidelityDecision(input)
	if decision.ExactAllowed || decision.Evidence.ArtifactCompatible {
		t.Fatalf("decision = %#v, want unchecked/ASR-disabled audio to deny exact", decision)
	}
	if decision.Fidelity == SyncFidelityExactWord {
		t.Fatalf("fidelity = %q, want non-exact", decision.Fidelity)
	}
}

func TestSyncFidelityRetryableArtifactDeniesExact(t *testing.T) {
	input := syncFidelityFixture(false)
	input.Job.Status = JobStatusFailed
	input.Job.Segments[0].ArtifactState = AudioArtifactStateRetryable
	input.Job.Segments[0].Retry = &AudioArtifactRetryMetadata{Retryable: true, Scope: AudioArtifactRetryScopeSegment, Reason: "checker failed"}
	input.Job.PartialAudioManifest.ArtifactState = AudioArtifactStateRetryable
	input.Job.PartialAudioManifest.Retry = input.Job.Segments[0].Retry
	decision := deriveSyncFidelityDecision(input)
	if decision.ExactAllowed || decision.Evidence.ArtifactCompatible {
		t.Fatalf("decision = %#v, want retryable artifact to deny exact", decision)
	}
}

func TestSyncFidelityMissingWordMappingFallsBackToPhrase(t *testing.T) {
	input := syncFidelityFixture(false)
	for index := range input.Highlight.Entries {
		if input.Highlight.Entries[index].Level == "word" {
			input.Highlight.Entries[index].SourceWordIndex = nil
			input.Highlight.Entries[index].SourceWordID = ""
		}
	}
	decision := deriveSyncFidelityDecision(input)
	if decision.ExactAllowed || decision.Evidence.MappingValid {
		t.Fatalf("decision = %#v, want missing word mapping to deny exact", decision)
	}
	if decision.Fidelity != SyncFidelityPhrase {
		t.Fatalf("fidelity = %q, want phrase fallback when phrase mapping/timing remain available", decision.Fidelity)
	}
}

func TestSyncFidelityDivergedSourceWordTextDeniesExact(t *testing.T) {
	input := syncFidelityFixture(false)
	for index := range input.Highlight.Entries {
		if input.Highlight.Entries[index].Level == "word" && input.Highlight.Entries[index].TextQuote == "hello" {
			input.Highlight.Entries[index].SpokenText = "goodbye"
			input.Highlight.Entries[index].Traceability = &highlightmap.HighlightMapV2Traceability{
				SourceTextMatch: "hello",
				SpokenTextMatch: "goodbye",
			}
		}
	}
	decision := deriveSyncFidelityDecision(input)
	if decision.ExactAllowed || decision.Evidence.MappingValid {
		t.Fatalf("decision = %#v, want divergent source/spoken word text to deny exact mapping", decision)
	}
	if decision.Fidelity != SyncFidelityPhrase {
		t.Fatalf("fidelity = %q, want phrase fallback when only exact word equivalence fails", decision.Fidelity)
	}
}

func TestSyncFidelityHeuristicTimingFallsBackToBlock(t *testing.T) {
	input := syncFidelityFixture(false)
	input.Quality.Quality = alignment.AlignmentQualityDegraded
	input.Quality.PrimaryLevel = alignment.AlignmentLevelPhrase
	input.Quality.TimingSource = alignment.TimingSourceHeuristic
	input.Quality.TimingSourceV2 = "heuristic"
	input.Quality.WordTimingReliable = false
	input.Quality.FallbackReason = "provider timing and local forced alignment unavailable"
	decision := deriveSyncFidelityDecision(input)
	if decision.ExactAllowed || decision.Evidence.TimingConfidence {
		t.Fatalf("decision = %#v, want heuristic timing to deny exact", decision)
	}
	if decision.Fidelity != SyncFidelityBlock {
		t.Fatalf("fidelity = %q, want block fallback for heuristic timing", decision.Fidelity)
	}
}

func TestSyncFidelityPlayableAudioWithoutSourceMappingIsAudioOnly(t *testing.T) {
	input := syncFidelityFixture(false)
	input.Job.BookSourceID = ""
	input.Highlight.SourceID = ""
	for index := range input.Highlight.Entries {
		input.Highlight.Entries[index].SourceID = ""
		input.Highlight.Entries[index].SourceWordID = ""
		input.Highlight.Entries[index].SourceWordIndex = nil
	}
	decision := deriveSyncFidelityDecision(input)
	if decision.Fidelity != SyncFidelityAudioOnly || decision.ExactAllowed {
		t.Fatalf("decision = %#v, want audio-only without source mapping", decision)
	}
	if decision.Evidence.SourceRevisionCurrent || decision.Evidence.MappingValid {
		t.Fatalf("evidence = %#v, want source/mapping gates closed", decision.Evidence)
	}
}

func syncFidelityFixture(lowResource bool) syncFidelityDecisionInput {
	generatedAt := time.Date(2026, 5, 17, 1, 13, 32, 0, time.UTC)
	word0 := 0
	word1 := 1
	fragment0 := 0
	return syncFidelityDecisionInput{
		Job: VoiceJob{
			ID:                 "job-sync-1",
			ProjectID:          "default",
			BookSourceID:       "source-sync-1",
			ProgressTargetID:   "readalong-sync-1",
			Status:             JobStatusCompleted,
			AudioURL:           "/api/voice-jobs/job-sync-1/audio",
			AudioPath:          "/tmp/job-sync-1/audio.wav",
			AudioReadySegments: 1,
			Segments: []JobSegment{{
				Index:         1,
				Text:          "hello world",
				Status:        "ready",
				AudioURL:      "/api/voice-jobs/job-sync-1/audio/segment/1",
				ArtifactID:    "job-sync-1:segment:000001",
				ArtifactState: AudioArtifactStateChecked,
			}},
			PipelineOptions: PipelineOptions{ASRCheck: true, QualityReport: true},
			VoiceCheck:      VoiceCheck{Complete: true, Provider: "mock", Similarity: 0.99},
			QualityReport:   &JobQualityReport{Enabled: true, AverageSimilarity: 0.99, SegmentCount: 1},
			PartialAudioManifest: &PartialAudioManifest{
				Status:         "ready",
				AudioURL:       "/api/voice-jobs/job-sync-1/audio/partial",
				ReadySegments:  1,
				TotalSegments:  1,
				CompleteEnough: true,
				ArtifactState:  AudioArtifactStateChecked,
				Segments: []PartialAudioSegmentManifest{{
					Index:         1,
					Status:        "ready",
					AudioURL:      "/api/voice-jobs/job-sync-1/audio/segment/1",
					ArtifactID:    "job-sync-1:segment:000001",
					ArtifactState: AudioArtifactStateChecked,
				}},
			},
		},
		Highlight: highlightmap.HighlightMapV2{
			SchemaVersion:    highlightmap.SchemaVersionV2,
			SourceID:         "source-sync-1",
			ScopeKey:         "book",
			GeneratedAudioID: "job-sync-1",
			SpeechPlanID:     "job-sync-1",
			GeneratedAt:      generatedAt,
			DurationMS:       1000,
			TimingLevels:     []string{"phrase", "word"},
			Summary: highlightmap.HighlightMapV2Summary{
				Status:        "complete",
				PrimaryLevel:  "word",
				EntryCount:    3,
				WordCount:     2,
				PhraseCount:   1,
				TimingSources: []string{"provider-word"},
				Confidence:    0.96,
				DriftBudgetMS: 150,
				FallbackMode:  "none",
			},
			Entries: []highlightmap.HighlightMapV2Entry{
				{
					EntryID:          "phrase:0000",
					Level:            "phrase",
					SourceID:         "source-sync-1",
					ScopeKey:         "book",
					GeneratedAudioID: "job-sync-1",
					SpeechPlanID:     "job-sync-1",
					NodeID:           "book:phrase:0000",
					TextQuote:        "hello world",
					AudioStartMS:     0,
					AudioEndMS:       1000,
					Confidence:       0.96,
				},
				{
					EntryID:          "word:0001",
					Level:            "word",
					SourceID:         "source-sync-1",
					ScopeKey:         "book",
					GeneratedAudioID: "job-sync-1",
					SpeechPlanID:     "job-sync-1",
					NodeID:           "book:word:0001",
					SourceWordID:     "source-sync-1:book:word:0",
					SourceWordIndex:  &word0,
					TextQuote:        "hello",
					SpokenText:       "hello",
					TokenIndex:       &word0,
					FragmentIndex:    &fragment0,
					AudioStartMS:     0,
					AudioEndMS:       500,
					TimingSource:     "provider-word",
					Confidence:       0.96,
					Traceability: &highlightmap.HighlightMapV2Traceability{
						SourceTextMatch: "hello",
						SpokenTextMatch: "hello",
					},
				},
				{
					EntryID:          "word:0002",
					Level:            "word",
					SourceID:         "source-sync-1",
					ScopeKey:         "book",
					GeneratedAudioID: "job-sync-1",
					SpeechPlanID:     "job-sync-1",
					NodeID:           "book:word:0002",
					SourceWordID:     "source-sync-1:book:word:1",
					SourceWordIndex:  &word1,
					TextQuote:        "world",
					SpokenText:       "world",
					TokenIndex:       &word1,
					FragmentIndex:    &fragment0,
					AudioStartMS:     500,
					AudioEndMS:       1000,
					TimingSource:     "provider-word",
					Confidence:       0.96,
					Traceability: &highlightmap.HighlightMapV2Traceability{
						SourceTextMatch: "world",
						SpokenTextMatch: "world",
					},
				},
			},
		},
		Quality: alignment.AlignmentQualityReport{
			SchemaVersion:      "alignment-quality.v1",
			Mode:               alignment.AlignmentModeProviderOnly,
			Quality:            alignment.AlignmentQualityExact,
			PrimaryLevel:       alignment.AlignmentLevelWord,
			TimingSource:       alignment.TimingSourceNative,
			TimingSourceV2:     "provider-word",
			WordTimingReliable: true,
			Confidence: alignment.TimingConfidence{
				Overall: 0.96,
				Segment: 0.96,
				Token:   0.96,
			},
			FragmentCount: 1,
			TokenCount:    2,
			DurationMS:    1000,
		},
		GeneratedAt: generatedAt,
		Final:       true,
		LowResource: lowResource,
	}
}
