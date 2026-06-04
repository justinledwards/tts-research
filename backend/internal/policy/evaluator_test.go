package policy

import (
	"reflect"
	"testing"
	"testing/quick"
)

func TestProfileSnapshotsAcrossSharedCorpus(t *testing.T) {
	t.Parallel()

	corpus := []Element{
		{Kind: "body", Text: "A useful paragraph."},
		{Kind: "table", Text: "| Metric | Value |\n|---|---|\n| Latency | 12ms |"},
		{Kind: "code", Language: "go", Text: `fmt.Println("hello")`},
		{Kind: "math", Text: "$$x^2 + y = 4$$"},
		{Kind: "citation", Text: "[^1]: Research note."},
		{Kind: "image", Text: "![Architecture diagram](diagram.png)"},
		{Kind: "caption", Text: "Figure: request flow overview"},
		{Kind: "list", Text: "First item"},
		{Kind: "admonition", Text: "Warning: rotate credentials."},
		{Kind: "quote", Text: "Quoted material."},
	}
	type item struct {
		Element     string
		ElementMode string
		Mode        string
		SpeechText  string
	}

	actual := map[string][]item{}
	for _, profile := range Profiles() {
		evaluator := NewEvaluator(profile.Name, Overrides{})
		items := make([]item, 0, len(corpus))
		for _, element := range corpus {
			decision := evaluator.Evaluate(element)
			items = append(items, item{
				Element:     decision.Policy.Element,
				ElementMode: decision.Policy.ElementMode,
				Mode:        decision.Policy.Mode,
				SpeechText:  decision.SpeechText,
			})
		}
		actual[string(profile.Name)] = items
	}

	expected := map[string][]item{
		"Accessibility": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "rowLinear", "speak", "Table. Row 1. Metric: Latency; Value: 12ms."},
			{"code", "syntaxAware", "literal", "A go code block with 1 line appears here. fmt.Println(\"hello\")"},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"citation", "inline", "speak", "Research note."},
			{"image", "describeLong", "describeLong", "Image description: Architecture diagram."},
			{"caption", "speak", "speak", "Figure: request flow overview"},
			{"list", "announce", "speak", "List item: First item"},
			{"admonition", "speak", "speak", "Warning: rotate credentials."},
			{"quote", "speak", "speak", "Quoted material."},
		},
		"Education": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "summary", "summarise", "A go code block with 1 line appears here."},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"citation", "inline", "speak", "Research note."},
			{"image", "describeShort", "describeShort", "Image: Architecture diagram."},
			{"caption", "speak", "speak", "Figure: request flow overview"},
			{"list", "announce", "speak", "List item: First item"},
			{"admonition", "speak", "speak", "Warning: rotate credentials."},
			{"quote", "speak", "speak", "Quoted material."},
		},
		"Enterprise": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "skip", "skip", ""},
			{"math", "skip", "skip", ""},
			{"citation", "onDemand", "onDemand", ""},
			{"image", "altFirst", "describeShort", "Image: Architecture diagram."},
			{"caption", "speak", "speak", "Figure: request flow overview"},
			{"list", "omit", "speak", "First item"},
			{"admonition", "speak", "speak", "Warning: rotate credentials."},
			{"quote", "speak", "speak", "Quoted material."},
		},
		"LanguageLearning": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "literal", "literal", "fmt.Println(\"hello\")"},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"citation", "onDemand", "onDemand", ""},
			{"image", "describeShort", "describeShort", "Image: Architecture diagram."},
			{"caption", "speak", "speak", "Figure: request flow overview"},
			{"list", "announce", "speak", "List item: First item"},
			{"admonition", "speak", "speak", "Warning: rotate credentials."},
			{"quote", "speak", "speak", "Quoted material."},
		},
		"TechnicalDocs": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "rowLinear", "speak", "Table. Row 1. Metric: Latency; Value: 12ms."},
			{"code", "syntaxAware", "literal", "A go code block with 1 line appears here. fmt.Println(\"hello\")"},
			{"math", "literalsafe", "literal", "Math expression: x^2 + y = 4."},
			{"citation", "endnote", "onDemand", ""},
			{"image", "altFirst", "describeShort", "Image: Architecture diagram."},
			{"caption", "speak", "speak", "Figure: request flow overview"},
			{"list", "announce", "speak", "List item: First item"},
			{"admonition", "speak", "speak", "Warning: rotate credentials."},
			{"quote", "speak", "speak", "Quoted material."},
		},
	}

	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("profile snapshot mismatch\nactual: %#v\nexpected: %#v", actual, expected)
	}
}

func TestArtifactCitationTokensUseSafeSpeech(t *testing.T) {
	t.Parallel()

	enterprise := NewEvaluator(ProfileEnterprise, Overrides{}).Evaluate(Element{Kind: "artifact_token", Text: "[cite][turn40search10]"})
	if enterprise.Policy.Mode != string(ModeOnDemand) || enterprise.SpeechText != "" {
		t.Fatalf("enterprise artifact decision = %#v, speech %q; want on-demand without speech", enterprise.Policy, enterprise.SpeechText)
	}

	accessibility := NewEvaluator(ProfileAccessibility, Overrides{}).Evaluate(Element{Kind: "artifact_token", Text: "[cite][turn40search10]"})
	if accessibility.Policy.Mode != string(ModeSpeak) || accessibility.SpeechText == "[cite][turn40search10]" || accessibility.SpeechText == "" {
		t.Fatalf("accessibility artifact speech = %q, want safe non-empty label", accessibility.SpeechText)
	}

	literal := NewEvaluator(ProfileLanguageLearning, Overrides{Mode: ModeLiteral}).Evaluate(Element{Kind: "artifact_token", Text: "[cite][turn40search10]"})
	if literal.Policy.Mode != string(ModeLiteral) || literal.SpeechText != "[cite][turn40search10]" {
		t.Fatalf("literal artifact speech = %#v, want exact literal token only under explicit literal mode", literal)
	}
}

func TestOverridePrecedenceIsDeterministic(t *testing.T) {
	t.Parallel()

	property := func(profileIndex uint8, codeIndex uint8, tableIndex uint8) bool {
		profiles := Profiles()
		codeModes := []CodeMode{"", CodeModeSkip, CodeModeSummary, CodeModeSyntaxAware, CodeModeLiteral}
		tableModes := []TableMode{"", TableModeSkip, TableModeSummary, TableModeRowLinear, TableModeInteractive}
		profile := profiles[int(profileIndex)%len(profiles)].Name
		overrides := Overrides{
			CodeMode:  codeModes[int(codeIndex)%len(codeModes)],
			TableMode: tableModes[int(tableIndex)%len(tableModes)],
		}
		left := NewEvaluator(profile, overrides)
		right := NewEvaluator(profile, overrides)
		return reflect.DeepEqual(left.Settings(), right.Settings()) &&
			reflect.DeepEqual(left.Evaluate(Element{Kind: "code", Text: "x := 1"}), right.Evaluate(Element{Kind: "code", Text: "x := 1"})) &&
			reflect.DeepEqual(left.Evaluate(Element{Kind: "table", Text: "| A | B |\n| 1 | 2 |"}), right.Evaluate(Element{Kind: "table", Text: "| A | B |\n| 1 | 2 |"}))
	}
	if err := quick.Check(property, &quick.Config{MaxCount: 200}); err != nil {
		t.Fatal(err)
	}

	decision := NewEvaluator(ProfileEnterprise, Overrides{CodeMode: CodeModeLiteral}).Evaluate(Element{Kind: "code", Text: "x := 1"})
	if decision.Policy.ElementMode != string(CodeModeLiteral) || decision.Policy.Mode != string(ModeLiteral) {
		t.Fatalf("override decision = %#v, want literal code override to win", decision.Policy)
	}
}

func TestLayeredEvaluatorReportsSourceAndSessionPrecedence(t *testing.T) {
	t.Parallel()

	settings := ProfileByName(ProfileEnterprise).Settings
	sourceOnly := NewLayeredEvaluatorForSettings(
		"enterprise-source",
		"Enterprise source",
		settings,
		Overrides{CodeMode: CodeModeLiteral},
		Overrides{},
		"source override",
	).Evaluate(Element{Kind: "code", Text: "fmt.Println(\"hello\")"})
	if sourceOnly.Policy.Mode != string(ModeLiteral) {
		t.Fatalf("source-only code mode = %q, want literal", sourceOnly.Policy.Mode)
	}
	if sourceOnly.Policy.Explanation != "This code block is read literally because a source override sets code to literal." {
		t.Fatalf("source-only explanation = %q", sourceOnly.Policy.Explanation)
	}

	sessionWins := NewLayeredEvaluatorForSettings(
		"enterprise-source",
		"Enterprise source",
		settings,
		Overrides{CodeMode: CodeModeLiteral},
		Overrides{CodeMode: CodeModeSkip},
		"source override",
	).Evaluate(Element{Kind: "code", Text: "fmt.Println(\"hello\")"})
	if sessionWins.Policy.Mode != string(ModeSkip) {
		t.Fatalf("session code mode = %q, want skip", sessionWins.Policy.Mode)
	}
	if sessionWins.Policy.Explanation != "This code block is skipped because a session override sets code to skip." {
		t.Fatalf("session explanation = %q", sessionWins.Policy.Explanation)
	}
}

func TestLayeredEvaluatorAppliesScopedSettingsPrecedence(t *testing.T) {
	t.Parallel()

	evaluator := NewLayeredEvaluatorForSettings(
		"project-enterprise",
		"Project Enterprise",
		ProfileByName(ProfileEnterprise).Settings,
		Overrides{
			CodeMode:  CodeModeLiteral,
			TableMode: TableModeRowLinear,
		},
		Overrides{CodeMode: CodeModeSkip},
		"profile",
	)
	settings := evaluator.Settings()
	if settings.FootnoteMode != FootnoteModeOnDemand {
		t.Fatalf("footnote mode = %q, want project default onDemand", settings.FootnoteMode)
	}
	if settings.TableMode != TableModeRowLinear {
		t.Fatalf("table mode = %q, want source override rowLinear", settings.TableMode)
	}
	if settings.CodeMode != CodeModeSkip {
		t.Fatalf("code mode = %q, want session override skip", settings.CodeMode)
	}

	table := evaluator.Evaluate(Element{Kind: "table", Text: "| Metric | Value |\n|---|---|\n| Latency | 12ms |"})
	if table.Policy.Mode != string(ModeSpeak) ||
		table.Policy.Explanation != "This table is spoken because a source override sets table to rowLinear." {
		t.Fatalf("table decision = %#v, want source override row-linear speech", table.Policy)
	}
	code := evaluator.Evaluate(Element{Kind: "code", Text: "fmt.Println(\"hello\")"})
	if code.Policy.Mode != string(ModeSkip) ||
		code.Policy.Explanation != "This code block is skipped because a session override sets code to skip." {
		t.Fatalf("code decision = %#v, want session override skip", code.Policy)
	}
}

func TestDefinitionExposesSharedPolicyFields(t *testing.T) {
	t.Parallel()

	definition := PublicDefinition()
	keys := make([]string, 0, len(definition.Fields))
	for _, field := range definition.Fields {
		keys = append(keys, field.Key)
		if len(field.Options) == 0 {
			t.Fatalf("field %q has no options", field.Key)
		}
	}
	expectedKeys := []string{
		"tableMode",
		"tableHeaderMode",
		"codeMode",
		"mathMode",
		"footnoteMode",
		"imageMode",
		"captionMode",
		"citationMode",
		"listMarkerMode",
		"admonitionMode",
		"quoteMode",
	}
	if !reflect.DeepEqual(keys, expectedKeys) {
		t.Fatalf("definition keys = %#v, want %#v", keys, expectedKeys)
	}
	if len(definition.Profiles) != len(Profiles()) {
		t.Fatalf("definition profiles = %d, want %d", len(definition.Profiles), len(Profiles()))
	}
}

func TestPublicElementExplanationsAreDeterministic(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name       string
		element    Element
		overrides  Overrides
		wantMode   Mode
		wantPhrase string
	}{
		{
			name:       "caption on demand",
			element:    Element{Kind: "caption", Text: "Figure caption"},
			overrides:  Overrides{CaptionMode: CaptionModeOnDemand},
			wantMode:   ModeOnDemand,
			wantPhrase: "This caption is available on demand because a session override sets caption to onDemand.",
		},
		{
			name:       "citation skip",
			element:    Element{Kind: "citation", Text: "[1]"},
			overrides:  Overrides{CitationMode: CitationModeSkip},
			wantMode:   ModeSkip,
			wantPhrase: "This citation is skipped because a session override sets citation to skip.",
		},
		{
			name:       "admonition summarize",
			element:    Element{Kind: "admonition", Text: "Warning body"},
			overrides:  Overrides{AdmonitionMode: AdmonitionModeSummarise},
			wantMode:   ModeSummarise,
			wantPhrase: "This admonition is summarised because a session override sets admonition to summarise.",
		},
		{
			name:       "quote summarize",
			element:    Element{Kind: "quote", Text: "Quoted body"},
			overrides:  Overrides{QuoteMode: QuoteModeSummarise},
			wantMode:   ModeSummarise,
			wantPhrase: "This quote is summarised because a session override sets quote to summarise.",
		},
		{
			name:       "list markers",
			element:    Element{Kind: "list", Text: "First"},
			overrides:  Overrides{ListMarkerMode: ListMarkerModeAnnounce},
			wantMode:   ModeSpeak,
			wantPhrase: "This list item is spoken because a session override sets list to announce.",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			decision := NewEvaluator(ProfileEnterprise, tc.overrides).Evaluate(tc.element)
			if decision.Policy.Mode != string(tc.wantMode) {
				t.Fatalf("mode = %q, want %q", decision.Policy.Mode, tc.wantMode)
			}
			if decision.Policy.Explanation != tc.wantPhrase {
				t.Fatalf("explanation = %q, want %q", decision.Policy.Explanation, tc.wantPhrase)
			}
		})
	}
}

func TestTableHeaderTraversalModes(t *testing.T) {
	t.Parallel()

	text := "| Metric | Value |\n|---|---|\n| Latency | 12ms |"
	withoutHeaders := NewEvaluator(ProfileAccessibility, Overrides{
		TableHeaderMode: TableHeaderModeNone,
	}).Evaluate(Element{Kind: "table", Text: text})
	if withoutHeaders.SpeechText != "Table. Latency; 12ms." {
		t.Fatalf("without headers = %q", withoutHeaders.SpeechText)
	}

	rowAndColumn := NewEvaluator(ProfileAccessibility, Overrides{
		TableHeaderMode: TableHeaderModeRowAndColumn,
	}).Evaluate(Element{Kind: "table", Text: text})
	if rowAndColumn.SpeechText != "Table. Row 1. Metric: Latency; Value: 12ms." {
		t.Fatalf("row and column headers = %q", rowAndColumn.SpeechText)
	}
	if rowAndColumn.Policy.Explanation == "" {
		t.Fatal("expected table traversal explanation")
	}
}

func TestCitationRemovedWarningDoesNotClassifyProseAsFootnote(t *testing.T) {
	t.Parallel()

	decision := NewEvaluator(ProfileEnterprise, Overrides{}).Evaluate(Element{
		Kind:     "body",
		Text:     "This body paragraph should still be read after inline citations are removed.",
		Warnings: []string{"citation_removed"},
	})

	if decision.Policy.Element != "prose" {
		t.Fatalf("element = %q, want prose", decision.Policy.Element)
	}
	if decision.Policy.Mode != string(ModeSpeak) || decision.SpeechText == "" {
		t.Fatalf("decision = %#v, want spoken prose", decision)
	}
	if decision.Policy.ElementMode == string(FootnoteModeOnDemand) {
		t.Fatalf("element mode = %q, citation warning should not apply footnote mode", decision.Policy.ElementMode)
	}
}
