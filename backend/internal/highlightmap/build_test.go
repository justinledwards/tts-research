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

func TestBuildV2SuppressesWordEntriesForHeuristicFallback(t *testing.T) {
	request := fixtureRequest(alignment.TimingConfidence{
		Overall: 0.6,
		Segment: 0.7,
		Token:   0.55,
	}, alignment.DriftStats{})
	report := alignment.AlignmentReportForTiming(
		alignment.NormalizedTiming{Fragments: request.Fragments, Tokens: request.Tokens},
		alignment.AlignmentModeHeuristicFallback,
		[]string{"heuristic fallback"},
		nil,
	)
	highlight := BuildV2(BuildV2Request{
		JobID:        request.JobID,
		BookSourceID: request.BookSourceID,
		ScopeKey:     request.ScopeKey,
		SpeechPlanID: request.JobID,
		WordSpans:    request.WordSpans,
		Fragments:    request.Fragments,
		Tokens:       request.Tokens,
		GeneratedAt:  request.GeneratedAt,
		Quality:      report,
	})
	if highlight.SchemaVersion != SchemaVersionV2 {
		t.Fatalf("schemaVersion = %q, want %q", highlight.SchemaVersion, SchemaVersionV2)
	}
	if highlight.Summary.WordCount != 0 || highlight.Summary.PrimaryLevel != "phrase" {
		t.Fatalf("v2 summary = %+v, want phrase-only heuristic output", highlight.Summary)
	}
	if highlight.Summary.FallbackMode != "block-only" && highlight.Summary.FallbackMode != "word-to-phrase" {
		t.Fatalf("fallback mode = %q, want explicit degraded fallback", highlight.Summary.FallbackMode)
	}
}

func TestBuildV2CarriesSourceWordReadingPositions(t *testing.T) {
	request := fixtureRequest(alignment.TimingConfidence{
		Overall: 0.95,
		Segment: 0.95,
		Token:   0.95,
	}, alignment.DriftStats{})
	request.Fragments.Source = alignment.TimingSourceNative
	request.Tokens.Source = alignment.TimingSourceNative
	report := alignment.AlignmentReportForTiming(
		alignment.NormalizedTiming{Fragments: request.Fragments, Tokens: request.Tokens},
		alignment.AlignmentModeProviderOnly,
		nil,
		nil,
	)
	highlight := BuildV2(BuildV2Request{
		JobID:        request.JobID,
		BookSourceID: request.BookSourceID,
		ScopeKey:     request.ScopeKey,
		SpeechPlanID: request.JobID,
		WordSpans:    request.WordSpans,
		Fragments:    request.Fragments,
		Tokens:       request.Tokens,
		GeneratedAt:  request.GeneratedAt,
		Quality:      report,
	})
	if highlight.Summary.WordCount != 2 {
		t.Fatalf("word count = %d, want 2", highlight.Summary.WordCount)
	}
	var world HighlightMapV2Entry
	for _, entry := range highlight.Entries {
		if entry.Level == "word" && entry.SpokenText == "world" {
			world = entry
			break
		}
	}
	if world.ReadingPosition.ActiveWordIndex != 11 {
		t.Fatalf("world active word index = %d, want 11", world.ReadingPosition.ActiveWordIndex)
	}
	if world.ReadingPosition.TextQuote != "world" {
		t.Fatalf("world text quote = %q, want world", world.ReadingPosition.TextQuote)
	}
	if world.SourceWordIndex == nil || *world.SourceWordIndex != 11 {
		t.Fatalf("world source word index = %#v, want 11", world.SourceWordIndex)
	}
	if world.SourceWordID != "book-1:chapter:1:word:11" {
		t.Fatalf("world source word id = %q, want canonical source identity", world.SourceWordID)
	}
	if world.SpokenTokenID != "job-1:token:1" {
		t.Fatalf("world spoken token id = %q, want speech token identity", world.SpokenTokenID)
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
