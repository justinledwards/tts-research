package ssml

import (
	"strings"
	"testing"
)

func TestSerializeEscapesTextAndAppliesSubstitution(t *testing.T) {
	t.Parallel()

	output := Serialize(Document{
		Text: "Ada & SSML",
		Lang: "en",
		Substitutions: []Substitution{{
			StartOffset: 6,
			EndOffset:   10,
			Alias:       "S S M L",
		}},
	})
	for _, expected := range []string{
		`<speak version="1.1" xml:lang="en">`,
		`Ada &amp; `,
		`<sub alias="S S M L">SSML</sub>`,
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("output = %q, want substring %q", output, expected)
		}
	}
}
