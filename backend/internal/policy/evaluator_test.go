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
			{"table", "rowLinear", "speak", "Table. Metric: Latency; Value: 12ms."},
			{"code", "syntaxAware", "literal", "A go code block with 1 line appears here. fmt.Println(\"hello\")"},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"footnote", "inline", "speak", "[^1]: Research note."},
			{"image", "describeLong", "describeLong", "Image description: Architecture diagram."},
			{"image", "describeLong", "describeLong", "Image or caption: Figure: request flow overview."},
		},
		"Education": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "summary", "summarise", "A go code block with 1 line appears here."},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"footnote", "inline", "speak", "[^1]: Research note."},
			{"image", "describeShort", "describeShort", "Image: Architecture diagram."},
			{"image", "describeShort", "describeShort", "Figure: request flow overview"},
		},
		"Enterprise": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "skip", "skip", ""},
			{"math", "skip", "skip", ""},
			{"footnote", "onDemand", "onDemand", ""},
			{"image", "altFirst", "describeShort", "Image: Architecture diagram."},
			{"image", "altFirst", "describeShort", "Figure: request flow overview"},
		},
		"LanguageLearning": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "summary", "summarise", "A table appears here with columns: Metric, Value."},
			{"code", "literal", "literal", "fmt.Println(\"hello\")"},
			{"math", "semantic", "speak", "Math expression: x to the power of 2  plus  y  equals  4."},
			{"footnote", "inline", "speak", "[^1]: Research note."},
			{"image", "describeShort", "describeShort", "Image: Architecture diagram."},
			{"image", "describeShort", "describeShort", "Figure: request flow overview"},
		},
		"TechnicalDocs": {
			{"prose", "speak", "speak", "A useful paragraph."},
			{"table", "rowLinear", "speak", "Table. Metric: Latency; Value: 12ms."},
			{"code", "syntaxAware", "literal", "A go code block with 1 line appears here. fmt.Println(\"hello\")"},
			{"math", "literalsafe", "literal", "Math expression: x^2 + y = 4."},
			{"footnote", "endnote", "onDemand", ""},
			{"image", "altFirst", "describeShort", "Image: Architecture diagram."},
			{"image", "altFirst", "describeShort", "Figure: request flow overview"},
		},
	}

	if !reflect.DeepEqual(actual, expected) {
		t.Fatalf("profile snapshot mismatch\nactual: %#v\nexpected: %#v", actual, expected)
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
