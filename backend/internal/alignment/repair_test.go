package alignment

import (
	"context"
	"testing"
	"time"
)

func TestApplyAlignmentRepairMapAdjustsBoundaryWithoutMutatingOriginal(t *testing.T) {
	timing := simpleTiming(t)
	repairMap := validRepairMap([]AlignmentRepairOperation{{
		Boundary:      "end",
		DeltaMS:       100,
		FragmentIndex: 0,
		Kind:          RepairAdjustFragmentBoundary,
		Reason:        "Word ended late in the audio.",
	}})

	repaired, report := ApplyAlignmentRepairMap(timing, repairMap, repairContext())
	if report.Applied != 1 || report.Stale {
		t.Fatalf("repair report = %+v, want one applied fresh repair", report)
	}
	if repaired.Fragments.Fragments[0].EndMS != 600 {
		t.Fatalf("repaired end = %d, want 600", repaired.Fragments.Fragments[0].EndMS)
	}
	if timing.Fragments.Fragments[0].EndMS != 500 {
		t.Fatalf("original timing mutated: end = %d", timing.Fragments.Fragments[0].EndMS)
	}
}

func TestApplyAlignmentRepairMapRejectsStaleRepairs(t *testing.T) {
	timing := simpleTiming(t)
	repairMap := validRepairMap([]AlignmentRepairOperation{{
		Kind:   RepairForcePhraseFallback,
		Reason: "Hard abbreviation case.",
	}})
	repairMap.GeneratedAudioID = "audio-old"

	repaired, report := ApplyAlignmentRepairMap(timing, repairMap, repairContext())
	if !report.Stale || report.Skipped != 1 {
		t.Fatalf("repair report = %+v, want stale skipped repair", report)
	}
	if repaired.Tokens.Confidence.Token != timing.Tokens.Confidence.Token {
		t.Fatalf("stale repair changed token confidence")
	}
}

func TestApplyAlignmentRepairMapCarriesRegenerateSegmentAction(t *testing.T) {
	timing := simpleTiming(t)
	repairMap := validRepairMap([]AlignmentRepairOperation{{
		FragmentIndex: 0,
		Kind:          RepairRegenerateSegment,
		Reason:        "Human QA marked highlight drift at 00:31.25.",
	}})

	_, report := ApplyAlignmentRepairMap(timing, repairMap, repairContext())
	if report.Applied != 1 || report.Skipped != 0 {
		t.Fatalf("repair report = %+v, want regenerate action recorded as applied warning", report)
	}
	if len(report.Warnings) == 0 {
		t.Fatalf("expected regenerate action warning")
	}
}

func TestAlignmentServiceAppliesRepairsBeforeQualityReport(t *testing.T) {
	service := NewAlignmentService(AlignmentServiceOptions{Mode: AlignmentModeProviderPlusValidation})
	result, err := service.Generate(context.Background(), AlignmentServiceRequest{
		DurationMS:    1000,
		Final:         true,
		GeneratedAt:   time.Unix(0, 0).UTC(),
		JobID:         "audio-1",
		RepairContext: repairContext(),
		Repairs: validRepairMap([]AlignmentRepairOperation{{
			Kind:   RepairForcePhraseFallback,
			Reason: "OCR noise makes word timing misleading.",
		}}),
		Segments: []SegmentInput{{
			DurationMS: 1000,
			Index:      1,
			Text:       "hello world",
		}},
		NativeEvents: []NativeTimingEvent{
			{Confidence: 0.92, EndMS: 450, StartMS: 0, Text: "hello"},
			{Confidence: 0.9, EndMS: 1000, StartMS: 450, Text: "world"},
		},
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if result.Quality.WordTimingReliable {
		t.Fatalf("repair should force phrase-level timing: %+v", result.Quality)
	}
	if result.Quality.PrimaryLevel != AlignmentLevelPhrase {
		t.Fatalf("primary level = %q, want phrase", result.Quality.PrimaryLevel)
	}
}

func simpleTiming(t *testing.T) NormalizedTiming {
	t.Helper()
	timing, err := NormalizeTiming(NormalizeRequest{
		DurationMS:  1000,
		GeneratedAt: time.Unix(0, 0).UTC(),
		JobID:       "audio-1",
		Segments: []SegmentInput{{
			DurationMS: 500,
			Index:      1,
			Text:       "hello",
		}, {
			DurationMS: 500,
			Index:      2,
			Text:       "world",
		}},
	})
	if err != nil {
		t.Fatalf("NormalizeTiming() error = %v", err)
	}
	return timing
}

func validRepairMap(operations []AlignmentRepairOperation) *AlignmentRepairMap {
	return &AlignmentRepairMap{
		ContentFingerprint: "source-v1-policy-v1-run-v1",
		GeneratedAudioID:   "audio-1",
		Operations:         operations,
		ProjectID:          "project-1",
		SchemaVersion:      AlignmentRepairSchemaVersion,
		SourceID:           "source-1",
		SpeechPlanID:       "speech-plan-1",
	}
}

func repairContext() AlignmentRepairContext {
	return AlignmentRepairContext{
		ContentFingerprint: "source-v1-policy-v1-run-v1",
		GeneratedAudioID:   "audio-1",
		ProjectID:          "project-1",
		SourceID:           "source-1",
		SpeechPlanID:       "speech-plan-1",
	}
}
