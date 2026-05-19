package alignment

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestNormalizeTimingUsesTrustworthyNativeEvents(t *testing.T) {
	timing, err := NormalizeTiming(NormalizeRequest{
		JobID:      "job-1",
		DurationMS: 1000,
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
		t.Fatalf("NormalizeTiming() error = %v", err)
	}
	if timing.Tokens.Source != TimingSourceNative {
		t.Fatalf("source = %q, want native", timing.Tokens.Source)
	}
	if len(timing.Tokens.Tokens) != 2 {
		t.Fatalf("token count = %d, want 2", len(timing.Tokens.Tokens))
	}
}

func TestNormalizeTimingFallsBackWhenNativeEventsAreNotMonotonic(t *testing.T) {
	timing, err := NormalizeTiming(NormalizeRequest{
		JobID:      "job-1",
		DurationMS: 1000,
		Segments: []SegmentInput{{
			Index:      1,
			Text:       "hello world",
			DurationMS: 1000,
		}},
		NativeEvents: []NativeTimingEvent{
			{Text: "hello", StartMS: 200, EndMS: 500, Confidence: 0.92},
			{Text: "world", StartMS: 100, EndMS: 900, Confidence: 0.9},
		},
	})
	if err != nil {
		t.Fatalf("NormalizeTiming() error = %v", err)
	}
	if timing.Tokens.Source != TimingSourceHeuristic {
		t.Fatalf("source = %q, want heuristic", timing.Tokens.Source)
	}
}

func TestCorrectDriftMarksLowConfidence(t *testing.T) {
	fragments, tokens, drift := CorrectDrift(
		[]FragmentTiming{{
			Index:        0,
			SegmentIndex: 1,
			Text:         "hello",
			StartMS:      0,
			EndMS:        1000,
			Confidence:   0.9,
		}},
		[]TokenTiming{{
			Index:        0,
			SegmentIndex: 1,
			Text:         "hello",
			StartMS:      0,
			EndMS:        1000,
			Confidence:   0.9,
		}},
		1500,
	)
	if !drift.Corrected || !drift.LowConfidence {
		t.Fatalf("drift = %+v, want corrected low-confidence drift", drift)
	}
	if fragments[0].EndMS != 1500 || tokens[0].EndMS != 1500 {
		t.Fatalf("timing was not scaled to duration: fragments=%+v tokens=%+v", fragments, tokens)
	}
}

func TestEngineSpecificTimingStructsStayInsideAlignmentPackage(t *testing.T) {
	internalDir := filepath.Clean(filepath.Join(".."))
	pattern := regexp.MustCompile(`(?i)^type\s+\w*(mfa|aeneas|gentle)\w*timing\w*\s+struct`)
	err := filepath.WalkDir(internalDir, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if entry.Name() == "alignment" {
				return filepath.SkipDir
			}
			return nil
		}
		if filepath.Ext(path) != ".go" || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for lineNumber, line := range strings.Split(string(data), "\n") {
			if pattern.MatchString(strings.TrimSpace(line)) {
				t.Fatalf("engine-specific timing struct outside alignment: %s:%d", path, lineNumber+1)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
