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

func TestBuildFirstNarratablePrefixIncludesAvailablePrefixBeforeCompletion(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(
		node("unit-1", "First narratable unit.", policy.ModeSpeak),
		node("unit-2", "Second narratable unit.", policy.ModeSpeak),
		node("unit-3", "Later island is not contiguous yet.", policy.ModeSpeak),
	)
	plan, err := BuildFirstNarratablePrefixFromContentIR(document, manifestOptions([]ManifestBoundUnit{
		manifestUnit("unit-1", "narratable"),
		manifestUnit("unit-2", "narratable"),
		manifestUnit("unit-3", "pending_extraction"),
	}))
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
	}
	if got := segmentNodeIDs(plan); strings.Join(got, ",") != "unit-1,unit-2" {
		t.Fatalf("segments = %#v, want earliest two-unit narratable prefix only", got)
	}
	bindings := planSegmentBindings(t, plan)
	if len(bindings) != 2 {
		t.Fatalf("segment bindings = %#v, want one binding per segment", bindings)
	}
	first := bindings[0]
	for key, want := range map[string]string{
		"sourceId":              "source-1",
		"sourceRevisionId":      "source-1-rev",
		"extractionRevisionId":  "source-1-ext",
		"readingUnitManifestId": "rum-source-1",
		"readalongManifestId":   "ram-source-1",
		"readingUnitId":         "unit-1",
		"unitId":                "unit-1",
		"nodeId":                "unit-1",
	} {
		if got, _ := first[key].(string); got != want {
			t.Fatalf("binding[%q] = %#v, want %q in %#v", key, first[key], want, first)
		}
	}
	if got, _ := first["speechTextHash"].(string); !strings.HasPrefix(got, "sha256:") {
		t.Fatalf("speechTextHash = %#v, want deterministic sha256-prefixed hash", first["speechTextHash"])
	}
	if got, _ := first["voiceEnginePolicyHash"].(string); !strings.HasPrefix(got, "sha256:") {
		t.Fatalf("voiceEnginePolicyHash = %#v, want deterministic sha256-prefixed hash", first["voiceEnginePolicyHash"])
	}
	if got, _ := first["synthesisInputHash"].(string); !strings.HasPrefix(got, "sha256:") {
		t.Fatalf("synthesisInputHash = %#v, want deterministic sha256-prefixed hash", first["synthesisInputHash"])
	}
}

func TestBuildFirstNarratablePrefixStopsAtGapAndExcludesLaterIsland(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(
		node("unit-1", "Contiguous prefix.", policy.ModeSpeak),
		node("unit-2", "Blocked unit text is not ready.", policy.ModeSpeak),
		node("unit-3", "Later narratable island must wait.", policy.ModeSpeak),
	)
	plan, err := BuildFirstNarratablePrefixFromContentIR(document, manifestOptions([]ManifestBoundUnit{
		manifestUnit("unit-1", "narratable"),
		manifestUnit("unit-2", "blocked"),
		manifestUnit("unit-3", "narratable"),
	}))
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
	}
	if got := segmentNodeIDs(plan); strings.Join(got, ",") != "unit-1" {
		t.Fatalf("segments = %#v, want stop at blocked gap before later island", got)
	}
}

func TestBuildFirstNarratablePrefixKeepsSkippedUnitsOutOfSegments(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(
		node("unit-1", "Spoken prefix.", policy.ModeSpeak),
		node("unit-2", "Skipped code block.", policy.ModeSkip),
		node("unit-3", "Narratable after skipped unit.", policy.ModeSpeak),
	)
	plan, err := BuildFirstNarratablePrefixFromContentIR(document, manifestOptions([]ManifestBoundUnit{
		manifestUnit("unit-1", "narratable"),
		manifestUnit("unit-2", "narratable"),
		manifestUnit("unit-3", "narratable"),
	}))
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
	}
	if got := segmentNodeIDs(plan); strings.Join(got, ",") != "unit-1" {
		t.Fatalf("segments = %#v, want skipped unit to be a non-segment gap", got)
	}
}

func TestBuildFirstNarratablePrefixRejectsEmptyManifestIdentityIDs(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("unit-1", "Identity-bound speech.", policy.ModeSpeak))
	tests := []struct {
		name    string
		mutate  func(*contentir.Document, *ManifestBoundBuildOptions)
		wantErr string
	}{
		{
			name: "source revision",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.SourceRevisionID = "  "
			},
			wantErr: "requires non-empty sourceRevisionId",
		},
		{
			name: "extraction revision",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.ExtractionRevisionID = ""
			},
			wantErr: "requires non-empty extractionRevisionId",
		},
		{
			name: "reading unit manifest",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.ReadingUnitManifestID = "	"
			},
			wantErr: "requires non-empty readingUnitManifestId",
		},
		{
			name: "readalong manifest",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.ReadalongManifestID = ""
			},
			wantErr: "requires non-empty readalongManifestId",
		},
		{
			name: "final source id",
			mutate: func(document *contentir.Document, options *ManifestBoundBuildOptions) {
				document.SourceID = "  "
				options.SourceID = ""
			},
			wantErr: "requires non-empty sourceId",
		},
		{
			name: "source id mismatch",
			mutate: func(document *contentir.Document, options *ManifestBoundBuildOptions) {
				document.SourceID = "source-from-ir"
				options.SourceID = "source-from-options"
			},
			wantErr: "sourceId mismatch",
		},
		{
			name: "manifest unit id",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.Units[0].UnitID = "  "
			},
			wantErr: "requires non-empty unitId",
		},
		{
			name: "manifest order key",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.Units[0].OrderKey = ""
			},
			wantErr: "requires non-empty orderKey",
		},
		{
			name: "manifest fingerprint",
			mutate: func(_ *contentir.Document, options *ManifestBoundBuildOptions) {
				options.Units[0].Fingerprint = "	"
			},
			wantErr: "requires non-empty fingerprint",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			document := document
			options := manifestOptions([]ManifestBoundUnit{manifestUnit("unit-1", "narratable")})
			test.mutate(&document, &options)
			assertManifestBuildErrorContains(t, document, options, test.wantErr)
		})
	}
}

func TestBuildFirstNarratablePrefixRejectsStaleManifestNodeID(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("unit-1", "Resolved by unit ID but stale node ID must fail.", policy.ModeSpeak))
	unit := manifestUnit("unit-1", "narratable")
	unit.NodeID = "stale-node"
	assertManifestBuildErrorContains(t, document, manifestOptions([]ManifestBoundUnit{unit}), "stale nodeId \"stale-node\" for unitId \"unit-1\"")
}

func TestBuildFirstNarratablePrefixTreatsReadalongMembershipAsUnitIDsOnly(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("node-1", "Node ID alone is not readalong membership.", policy.ModeSpeak))
	unit := manifestUnit("unit-1", "narratable")
	unit.NodeID = "node-1"
	options := manifestOptions([]ManifestBoundUnit{unit})
	options.ReadalongUnitIDs = []string{"node-1"}

	plan, err := BuildFirstNarratablePrefixFromContentIR(document, options)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
	}
	if len(plan.Segments) != 0 {
		t.Fatalf("segments = %#v, want empty prefix when readalong unitIds exclude unitId", plan.Segments)
	}
}

func TestBuildFirstNarratablePrefixRejectsNarratableUnitMissingContentIRNode(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("other-unit", "Different node.", policy.ModeSpeak))
	unit := manifestUnit("unit-1", "narratable")
	unit.NodeID = ""
	assertManifestBuildErrorContains(t, document, manifestOptions([]ManifestBoundUnit{unit}), "missing content IR node for unitId \"unit-1\"")
}

func TestBuildFirstNarratablePrefixRejectsDuplicateContentIRNodeIDs(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(
		node("unit-1", "First copy.", policy.ModeSpeak),
		node("unit-1", "Second copy must not overwrite identity.", policy.ModeSpeak),
	)
	assertManifestBuildErrorContains(t, document, manifestOptions([]ManifestBoundUnit{manifestUnit("unit-1", "narratable")}), "duplicate content IR nodeId \"unit-1\"")
}

func TestBuildFirstNarratablePrefixRejectsDuplicateManifestUnitIDs(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("unit-1", "Ambiguous manifest unit.", policy.ModeSpeak))
	assertManifestBuildErrorContains(t, document, manifestOptions([]ManifestBoundUnit{
		manifestUnit("unit-1", "narratable"),
		manifestUnit("unit-1", "narratable"),
	}), "duplicate manifest unitId \"unit-1\"")
}

func TestBuildFirstNarratablePrefixSegmentBindingsSurviveJSONRoundTrip(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(node("unit-1", "Round-tripped binding metadata.", policy.ModeSpeak))
	plan, err := BuildFirstNarratablePrefixFromContentIR(document, manifestOptions([]ManifestBoundUnit{manifestUnit("unit-1", "narratable")}))
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
	}
	encoded, err := Encode(plan)
	if err != nil {
		t.Fatalf("Encode returned error: %v", err)
	}
	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatalf("Decode returned error: %v", err)
	}

	bindings := planSegmentBindings(t, decoded)
	if len(bindings) != 1 {
		t.Fatalf("decoded segment bindings = %#v, want one binding", bindings)
	}
	first := bindings[0]
	for key, want := range map[string]string{
		"segmentId":             "seg-0001",
		"sourceRevisionId":      "source-1-rev",
		"extractionRevisionId":  "source-1-ext",
		"readingUnitManifestId": "rum-source-1",
		"readalongManifestId":   "ram-source-1",
		"unitId":                "unit-1",
		"nodeId":                "unit-1",
	} {
		if got, _ := first[key].(string); got != want {
			t.Fatalf("decoded binding[%q] = %#v, want %q in %#v", key, first[key], want, first)
		}
	}
}

func TestBuildFirstNarratablePrefixUnknownOrCaseVariedReadinessStopsPrefix(t *testing.T) {
	t.Parallel()

	document := manifestSpeechDocument(
		node("unit-1", "First unit.", policy.ModeSpeak),
		node("unit-2", "Second unit.", policy.ModeSpeak),
		node("unit-3", "Third unit.", policy.ModeSpeak),
	)
	tests := []struct {
		name      string
		readiness []string
		wantIDs   string
	}{
		{
			name:      "case-varied first unit stops prefix",
			readiness: []string{"Narratable", "narratable", "narratable"},
			wantIDs:   "",
		},
		{
			name:      "unknown second unit stops before later island",
			readiness: []string{"narratable", "ready", "narratable"},
			wantIDs:   "unit-1",
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			units := []ManifestBoundUnit{
				manifestUnit("unit-1", test.readiness[0]),
				manifestUnit("unit-2", test.readiness[1]),
				manifestUnit("unit-3", test.readiness[2]),
			}
			plan, err := BuildFirstNarratablePrefixFromContentIR(document, manifestOptions(units))
			if err != nil {
				t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned error: %v", err)
			}
			if got := strings.Join(segmentNodeIDs(plan), ","); got != test.wantIDs {
				t.Fatalf("segments = %q, want %q", got, test.wantIDs)
			}
		})
	}
}

func TestManifestSegmentReuseKeyChangesWithSynthesisInputs(t *testing.T) {
	t.Parallel()

	baseDocument := manifestSpeechDocument(node("unit-1", "Reusable speech text.", policy.ModeSpeak))
	baseOptions := manifestOptions([]ManifestBoundUnit{manifestUnit("unit-1", "narratable")})
	basePlan, err := BuildFirstNarratablePrefixFromContentIR(baseDocument, baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(base) returned error: %v", err)
	}
	baseBinding := planSegmentBindings(t, basePlan)[0]

	textDocument := manifestSpeechDocument(node("unit-1", "Reusable speech text changed.", policy.ModeSpeak))
	textPlan, err := BuildFirstNarratablePrefixFromContentIR(textDocument, baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(text) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, textPlan)[0], "speechTextHash", "synthesisInputHash", "reuseKey")

	policyDocument := manifestSpeechDocument(node("unit-1", "Reusable speech text.", policy.ModeSummarise))
	policyPlan, err := BuildFirstNarratablePrefixFromContentIR(policyDocument, baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(policy) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, policyPlan)[0], "voiceEnginePolicyHash", "synthesisInputHash", "reuseKey")

	voiceOptions := baseOptions
	voiceOptions.VoiceID = "voice-b"
	voicePlan, err := BuildFirstNarratablePrefixFromContentIR(baseDocument, voiceOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(voice) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, voicePlan)[0], "voiceEnginePolicyHash", "synthesisInputHash", "reuseKey")

	engineOptions := baseOptions
	engineOptions.EngineID = "engine-b"
	enginePlan, err := BuildFirstNarratablePrefixFromContentIR(baseDocument, engineOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(engine) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, enginePlan)[0], "voiceEnginePolicyHash", "synthesisInputHash", "reuseKey")

	languageNode := node("unit-1", "Reusable speech text.", policy.ModeSpeak)
	languageNode.Lang = "fr"
	languagePlan, err := BuildFirstNarratablePrefixFromContentIR(manifestSpeechDocument(languageNode), baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(language) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, languagePlan)[0], "synthesisInputHash", "reuseKey")

	ssmlNode := node("unit-1", "Reusable speech text.", policy.ModeSpeak)
	ssmlNode.Metadata = contentir.Metadata{"speechRender": map[string]any{"ssml": "<speak><emphasis>Reusable speech text.</emphasis></speak>"}}
	ssmlPlan, err := BuildFirstNarratablePrefixFromContentIR(manifestSpeechDocument(ssmlNode), baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(ssml) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, ssmlPlan)[0], "synthesisInputHash", "reuseKey")

	pronunciationNode := node("unit-1", "Reusable speech text.", policy.ModeSpeak)
	pronunciationNode.PronunciationRefs = []contentir.PronunciationRef{{
		Term:         "Reusable",
		Spoken:       "Reusable",
		EntryID:      "lex-reusable",
		StartOffset:  0,
		EndOffset:    8,
		OriginalText: "Reusable",
	}}
	pronunciationNode.LexiconEntryIDs = []string{"lex-reusable"}
	pronunciationPlan, err := BuildFirstNarratablePrefixFromContentIR(manifestSpeechDocument(pronunciationNode), baseOptions)
	if err != nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR(pronunciation) returned error: %v", err)
	}
	assertBindingChanged(t, baseBinding, planSegmentBindings(t, pronunciationPlan)[0], "synthesisInputHash", "reuseKey")
}

func manifestSpeechDocument(nodes ...contentir.Node) contentir.Document {
	return contentir.NewDocument(
		"source-1",
		"preparedSource",
		"source-1",
		"default",
		"manifest-source.md",
		"test-adapter",
		time.Unix(0, 0).UTC(),
		nodes,
	)
}

func manifestOptions(units []ManifestBoundUnit) ManifestBoundBuildOptions {
	return ManifestBoundBuildOptions{
		BuildOptions: BuildOptions{
			ID:          "manifest-plan",
			GeneratedAt: time.Unix(40, 0).UTC(),
		},
		SourceID:               "source-1",
		SourceRevisionID:       "source-1-rev",
		ExtractionRevisionID:   "source-1-ext",
		ReadingUnitManifestID:  "rum-source-1",
		ReadalongManifestID:    "ram-source-1",
		ReadalongUnitIDs:       manifestUnitIDs(units),
		Units:                  units,
		VoiceID:                "voice-a",
		EngineID:               "engine-a",
		SynthesisPolicyVersion: "policy-v1",
	}
}

func manifestUnit(id string, readiness string) ManifestBoundUnit {
	return ManifestBoundUnit{
		UnitID:      id,
		OrderKey:    id,
		NodeID:      id,
		Readiness:   readiness,
		ContentIRID: "source-1",
		Fingerprint: "fp-" + id,
	}
}

func manifestUnitIDs(units []ManifestBoundUnit) []string {
	ids := make([]string, 0, len(units))
	for _, unit := range units {
		ids = append(ids, unit.UnitID)
	}
	return ids
}

func segmentNodeIDs(plan Document) []string {
	ids := make([]string, 0, len(plan.Segments))
	for _, segment := range plan.Segments {
		ids = append(ids, segment.NodeID)
	}
	return ids
}

func planSegmentBindings(t *testing.T, plan Document) []map[string]any {
	t.Helper()
	raw := plan.Metadata["segmentBindings"]
	if bindings, ok := raw.([]map[string]any); ok {
		return bindings
	}
	decodedBindings, ok := raw.([]any)
	if !ok {
		t.Fatalf("segmentBindings = %#v, want []map[string]any or JSON-decoded []any", raw)
	}
	bindings := make([]map[string]any, 0, len(decodedBindings))
	for index, rawBinding := range decodedBindings {
		binding, ok := rawBinding.(map[string]any)
		if !ok {
			t.Fatalf("segmentBindings[%d] = %#v, want map[string]any", index, rawBinding)
		}
		bindings = append(bindings, binding)
	}
	return bindings
}

func assertManifestBuildErrorContains(t *testing.T, document contentir.Document, options ManifestBoundBuildOptions, wantErr string) {
	t.Helper()
	plan, err := BuildFirstNarratablePrefixFromContentIR(document, options)
	if err == nil {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR returned nil error and plan %#v, want error containing %q", plan, wantErr)
	}
	if !strings.Contains(err.Error(), wantErr) {
		t.Fatalf("BuildFirstNarratablePrefixFromContentIR error = %q, want substring %q", err.Error(), wantErr)
	}
}

func assertBindingChanged(t *testing.T, before map[string]any, after map[string]any, keys ...string) {
	t.Helper()
	for _, key := range keys {
		if before[key] == after[key] {
			t.Fatalf("binding[%s] did not change: before=%#v after=%#v", key, before, after)
		}
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
