package alignment

import (
	"context"
	"testing"
	"time"
)

func TestAlignmentServiceUsesTrustedProviderWordTiming(t *testing.T) {
	service := NewAlignmentService(AlignmentServiceOptions{Mode: AlignmentModeProviderPlusValidation})
	result, err := service.Generate(context.Background(), AlignmentServiceRequest{
		JobID:       "job-1",
		DurationMS:  1000,
		GeneratedAt: time.Unix(0, 0).UTC(),
		Final:       true,
		Segments: []SegmentInput{{
			Index:      1,
			Text:       "hello world",
			DurationMS: 1000,
		}},
		NativeEvents: []NativeTimingEvent{
			{Text: "hello", StartMS: 0, EndMS: 450, Confidence: 0.92},
			{Text: "world", StartMS: 450, EndMS: 1000, Confidence: 0.9},
		},
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if result.Timing.Tokens.Source != TimingSourceNative || !result.Quality.WordTimingReliable {
		t.Fatalf("provider word timing was not selected as reliable: %+v", result.Quality)
	}
	if result.Quality.Quality != AlignmentQualityExact {
		t.Fatalf("quality = %q, want exact", result.Quality.Quality)
	}
}

func TestAlignmentServiceFallsBackToPhraseHeuristicWithoutProviderOrForcedAlignment(t *testing.T) {
	service := NewAlignmentService(AlignmentServiceOptions{Mode: AlignmentModeProviderPlusValidation})
	result, err := service.Generate(context.Background(), AlignmentServiceRequest{
		JobID:       "job-1",
		DurationMS:  1000,
		GeneratedAt: time.Unix(0, 0).UTC(),
		Final:       true,
		Segments: []SegmentInput{{
			Index:      1,
			Text:       "hello world",
			DurationMS: 1000,
		}},
	})
	if err != nil {
		t.Fatalf("Generate() error = %v", err)
	}
	if result.Quality.WordTimingReliable {
		t.Fatalf("heuristic fallback must not claim reliable word timing: %+v", result.Quality)
	}
	if result.Quality.PrimaryLevel != AlignmentLevelPhrase || result.Quality.Quality != AlignmentQualityDegraded {
		t.Fatalf("quality = %+v, want degraded phrase-level fallback", result.Quality)
	}
}

func TestAlignmentServiceRequiredForcedAlignmentFailsClosed(t *testing.T) {
	service := NewAlignmentService(AlignmentServiceOptions{
		Mode: AlignmentModeLocalForcedRequired,
		Aligner: AlignerOptions{
			Enabled: true,
			MFABin:  "__missing_mfa_binary__",
		},
	})
	_, err := service.Generate(context.Background(), AlignmentServiceRequest{
		JobID:      "job-1",
		AudioPath:  "audio.wav",
		DurationMS: 1000,
		Final:      true,
		Segments: []SegmentInput{{
			Index:      1,
			Text:       "hello world",
			DurationMS: 1000,
		}},
	})
	if err == nil {
		t.Fatal("Generate() error = nil, want required forced-alignment failure")
	}
}
