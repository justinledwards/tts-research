package speechplan

import (
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func TestBuildFromContentIROrdersSpeakableSegmentsAndTargets(t *testing.T) {
	t.Parallel()

	document := contentir.NewDocument(
		"source-1",
		"preparedSource",
		"source-1",
		"default",
		"notes.md",
		"test-adapter",
		time.Unix(0, 0).UTC(),
		[]contentir.Node{
			node("n1", "Hello world.", policy.ModeSpeak),
			node("n2", "", policy.ModeSkip),
			node("n3", "Dr Nguyen arrived.", policy.ModeSpeak),
			node("n4", "turn40search10", policy.ModeOnDemand),
		},
	)
	document.Nodes[2].Metadata = contentir.Metadata{
		"speechRender": map[string]any{
			"ssml": "<speak>Doctor Nguyen arrived.</speak>",
			"pronunciations": []any{map[string]any{
				"term":         "Dr",
				"spoken":       "Doctor",
				"entryId":      "lex-dr",
				"startOffset":  0,
				"endOffset":    2,
				"originalText": "Dr",
			}},
		},
	}

	plan, err := BuildFromContentIR(document, BuildOptions{
		ID:          "plan-1",
		GeneratedAt: time.Unix(10, 0).UTC(),
		PolicyTrace: []PolicyTraceStep{
			{Scope: "marketProfileDefault", Profile: "Enterprise"},
			{Scope: "sessionOverride", Profile: "Enterprise", Overrides: policy.Overrides{Mode: policy.ModeSpeak}},
		},
	})
	if err != nil {
		t.Fatalf("BuildFromContentIR returned error: %v", err)
	}
	if plan.SchemaVersion != SchemaVersion || len(plan.Segments) != 2 {
		t.Fatalf("plan = %#v, want two speakable segments and no on-demand citation token", plan)
	}
	if plan.Segments[0].SegmentID != "seg-0001" || plan.Segments[1].NodeID != "n3" {
		t.Fatalf("segments are not stable and ordered: %#v", plan.Segments)
	}
	if got := plan.Segments[1].LexiconEntryIDs; len(got) != 1 || got[0] != "lex-dr" {
		t.Fatalf("lexicon refs = %#v, want lex-dr", got)
	}
	if !strings.Contains(plan.Segments[1].SerializerTargets.SSML, "Doctor Nguyen") {
		t.Fatalf("ssml target = %q", plan.Segments[1].SerializerTargets.SSML)
	}
	if plan.Segments[1].LocatorEnvelope.SchemaVersion != contentir.LocatorEnvelopeVersion {
		t.Fatalf("locator envelope = %#v", plan.Segments[1].LocatorEnvelope)
	}
}

func TestBuildFromContentIRKeepsCitationFixturesSpeechSafe(t *testing.T) {
	t.Parallel()

	document := contentir.NewDocument(
		"citation-fixtures",
		"preparedSource",
		"citation-fixtures",
		"default",
		"citations.md",
		"test-adapter",
		time.Unix(0, 0).UTC(),
		[]contentir.Node{
			node("body-inline", "Claim remains after inline citation cleanup.", policy.ModeSpeak),
			citationFixtureNode("raw-chatgpt-token", "artifact_token", "[cite][turn40search10]", "", policy.ModeOnDemand),
			citationFixtureNode("malformed-citation", "citation", "[citation: needed]", "", policy.ModeOnDemand),
			citationFixtureNode("footnote-marker", "footnote", "[^study-note]", "", policy.ModeOnDemand),
			citationFixtureNode("reference-marker", "reference", "[Research 2024]", "", policy.ModeOnDemand),
			citationFixtureNode("citation-only-paragraph", "citation", "citeturn40search11", "", policy.ModeOnDemand),
			citationFixtureNode("spoken-citation", "citation", "[cite][turn40search12]", "Citation marker.", policy.ModeSpeak),
		},
	)

	plan, err := BuildFromContentIR(document, BuildOptions{
		ID:          "citation-plan",
		GeneratedAt: time.Unix(20, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("BuildFromContentIR returned error: %v", err)
	}
	if len(plan.Segments) != 2 {
		t.Fatalf("segments = %#v, want body plus safe spoken citation fixture", plan.Segments)
	}

	joined := plan.Segments[0].Text + " " + plan.Segments[1].Text
	for _, forbidden := range []string{
		"[cite]",
		"turn40search",
		"cite",
		"[citation:",
		"[^study-note]",
		"[Research 2024]",
		"CITE",
	} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("speech plan leaked raw citation fixture %q in %q", forbidden, joined)
		}
	}
	if plan.Segments[1].Text != "Citation marker." {
		t.Fatalf("spoken citation segment = %q, want safe citation label", plan.Segments[1].Text)
	}
}

func TestBuildFromContentIRKeepsSkippedBlocksOutOfCueSequence(t *testing.T) {
	t.Parallel()

	document := contentir.NewDocument(
		"markdown-skipped-blocks",
		"preparedSource",
		"markdown-skipped-blocks",
		"default",
		"skipped-blocks.md",
		"test-adapter",
		time.Unix(0, 0).UTC(),
		[]contentir.Node{
			node("skip-before", "```go\nfmt.Println(\"skip\")\n```", policy.ModeSkip),
			node("intro", "Opening paragraph remains first spoken target.", policy.ModeSpeak),
			node("skip-between", "| Silent | Table |", policy.ModeSkip),
			node("summary", "Table summary.", policy.ModeSummarise),
			citationFixtureNode("reference-before-bookmark", "reference", "[23](https://example.com/reference)", "", policy.ModeOnDemand),
			node("bookmark-target", "Bookmark target paragraph follows references exactly.", policy.ModeSpeak),
			node("skip-end", "```mermaid\nflowchart LR\nA --> B\n```", policy.ModeSkip),
		},
	)

	plan, err := BuildFromContentIR(document, BuildOptions{
		ID:          "skipped-block-plan",
		GeneratedAt: time.Unix(30, 0).UTC(),
	})
	if err != nil {
		t.Fatalf("BuildFromContentIR returned error: %v", err)
	}
	gotNodeIDs := make([]string, 0, len(plan.Segments))
	for _, segment := range plan.Segments {
		gotNodeIDs = append(gotNodeIDs, segment.NodeID)
	}
	wantNodeIDs := []string{"intro", "summary", "bookmark-target"}
	if strings.Join(gotNodeIDs, ",") != strings.Join(wantNodeIDs, ",") {
		t.Fatalf("segments node IDs = %#v, want %#v", gotNodeIDs, wantNodeIDs)
	}
	if plan.Segments[1].Text != "Table summary." {
		t.Fatalf("summary segment text = %q, want stable generated summary", plan.Segments[1].Text)
	}
}

func node(id string, text string, mode policy.Mode) contentir.Node {
	return contentir.Node{
		NodeID:         id,
		ParentID:       "",
		OrderKey:       "00000001",
		Kind:           "body",
		Role:           "body",
		DisplayText:    text,
		NormalisedText: text,
		SpeechText:     text,
		Lang:           "en",
		Script:         "Latn",
		Dir:            "ltr",
		Provenance:     contentir.NewProvenance("markdown", "source-1", contentir.NewMarkdownLocator("notes.md", 1, 1, 1, 1, "/children/0"), 0, len(text)),
		UI:             contentir.DefaultUIHints("linear"),
		Speech: contentir.SpeechMetadata{
			PolicyHint: contentir.NewSpeechPolicyHint(string(mode), "", 0, 0),
			SpeechPolicy: policy.SpeechPolicy{
				Profile:     "Enterprise",
				Element:     "prose",
				ElementMode: "speak",
				Mode:        string(mode),
				Explanation: "test",
			},
		},
		Warnings:       []string{},
		Confidence:     1,
		Rights:         contentir.UnknownRights(),
		AdapterVersion: "test-adapter",
	}
}

func citationFixtureNode(id string, kind string, displayText string, speechText string, mode policy.Mode) contentir.Node {
	item := node(id, displayText, mode)
	item.Kind = kind
	item.Role = kind
	item.SpeechText = speechText
	item.Speech.PolicyHint = contentir.NewSpeechPolicyHint(string(mode), "", 0, 0)
	item.Speech.SpeechPolicy = policy.SpeechPolicy{
		Profile:     "Enterprise",
		Element:     kind,
		ElementMode: string(mode),
		Mode:        string(mode),
		Explanation: "citation fixture policy",
	}
	item.Warnings = []string{"citation_removed"}
	return item
}
