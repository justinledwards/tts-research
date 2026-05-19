package normalise

import (
	"strings"
	"testing"
)

func TestNormalizeNumbersDatesCurrencyAndAcronyms(t *testing.T) {
	t.Parallel()

	normalized, decisions := NormalizeNumbersDatesCurrency(
		"AI paid £12.50 on 2026-05-17 with 90% confidence.",
		"en-GB",
	)
	normalized, acronymDecisions := NormalizeAcronyms(normalized)
	decisions = append(decisions, acronymDecisions...)

	for _, expected := range []string{
		"twelve pounds fifty pence",
		"seventeenth May twenty twenty six",
		"ninety percent",
		"A I",
	} {
		if !strings.Contains(normalized, expected) {
			t.Fatalf("normalized = %q, want substring %q", normalized, expected)
		}
	}
	if len(decisions) < 4 {
		t.Fatalf("decisions = %#v, want currency, date, percent and acronym decisions", decisions)
	}
}

func TestDetectLanguageSpansMixedParagraph(t *testing.T) {
	t.Parallel()

	spans := DetectLanguageSpans("Hello världen. Привет мир.", "en")
	if len(spans) < 2 {
		t.Fatalf("spans = %#v, want mixed-language spans", spans)
	}
	if DominantLanguage(spans, "en") == "" {
		t.Fatalf("dominant language was empty for spans %#v", spans)
	}
}

func TestSwedishNumberLocale(t *testing.T) {
	t.Parallel()

	normalized, _ := NormalizeNumbersDatesCurrency("Det kostar 21 kr.", "sv-SE")
	if !strings.Contains(normalized, "tjugoett") {
		t.Fatalf("normalized = %q, want Swedish number word", normalized)
	}
}
