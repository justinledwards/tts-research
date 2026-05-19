package highlightmap

import (
	"path/filepath"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
)

func TestBuildUsesWordModeWhenConfidencePolicyPasses(t *testing.T) {
	highlight := Build(fixtureRequest(alignment.TimingConfidence{
		Overall: 0.8,
		Segment: 0.8,
		Token:   0.7,
	}, alignment.DriftStats{}))
	if highlight.Mode != ModeWord {
		t.Fatalf("mode = %q, want word", highlight.Mode)
	}
	if got := highlight.Tokens[1].ReadingPosition.ActiveWordIndex; got != 11 {
		t.Fatalf("active word index = %d, want 11", got)
	}
}

func TestBuildFallsBackToPhraseWhenConfidenceIsLow(t *testing.T) {
	highlight := Build(fixtureRequest(alignment.TimingConfidence{
		Overall: 0.6,
		Segment: 0.8,
		Token:   0.5,
	}, alignment.DriftStats{}))
	if highlight.Mode != ModePhrase {
		t.Fatalf("mode = %q, want phrase", highlight.Mode)
	}
	if !highlight.Summary.LowConfidence {
		t.Fatalf("summary should mark low confidence")
	}
}

func TestPersistArtifactsRoundTrip(t *testing.T) {
	request := fixtureRequest(alignment.TimingConfidence{
		Overall: 0.8,
		Segment: 0.8,
		Token:   0.7,
	}, alignment.DriftStats{})
	highlight := Build(request)
	dir := t.TempDir()
	if err := PersistArtifacts(dir, highlight, request.Fragments, request.Tokens); err != nil {
		t.Fatalf("PersistArtifacts() error = %v", err)
	}
	reloaded, err := ReadHighlightMap(filepath.Clean(dir))
	if err != nil {
		t.Fatalf("ReadHighlightMap() error = %v", err)
	}
	if reloaded.SchemaVersion != SchemaVersion || len(reloaded.Tokens) != 2 {
		t.Fatalf("unexpected reloaded map: %+v", reloaded)
	}
}

func fixtureRequest(confidence alignment.TimingConfidence, drift alignment.DriftStats) BuildRequest {
	generatedAt := time.Unix(0, 0).UTC()
	fragments := []alignment.FragmentTiming{{
		Index:        0,
		SegmentIndex: 1,
		Text:         "hello world",
		StartMS:      0,
		EndMS:        1000,
		Confidence:   confidence.Segment,
		TokenStart:   0,
		TokenEnd:     1,
	}}
	tokens := []alignment.TokenTiming{
		{Index: 0, FragmentIndex: 0, SegmentIndex: 1, Text: "hello", StartMS: 0, EndMS: 500, Confidence: confidence.Token},
		{Index: 1, FragmentIndex: 0, SegmentIndex: 1, Text: "world", StartMS: 500, EndMS: 1000, Confidence: confidence.Token},
	}
	return BuildRequest{
		JobID:        "job-1",
		BookSourceID: "book-1",
		ScopeKey:     "chapter:1",
		GeneratedAt:  generatedAt,
		WordSpans: []WordSpan{
			{Index: 10, Text: "hello"},
			{Index: 11, Text: "world"},
		},
		Fragments: alignment.FragmentTimingArtifact{
			SchemaVersion: alignment.SchemaVersion,
			JobID:         "job-1",
			Source:        alignment.TimingSourceHeuristic,
			Status:        "complete",
			DurationMS:    1000,
			GeneratedAt:   generatedAt,
			Confidence:    confidence,
			Drift:         drift,
			Fragments:     fragments,
		},
		Tokens: alignment.TokenTimingArtifact{
			SchemaVersion: alignment.SchemaVersion,
			JobID:         "job-1",
			Source:        alignment.TimingSourceHeuristic,
			Status:        "complete",
			DurationMS:    1000,
			GeneratedAt:   generatedAt,
			Confidence:    confidence,
			Drift:         drift,
			Tokens:        tokens,
		},
	}
}
