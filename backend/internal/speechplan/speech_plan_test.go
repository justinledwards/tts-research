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
