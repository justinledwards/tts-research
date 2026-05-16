package speechmath

import (
	"strings"
	"testing"
)

func TestPreviewFallbackVerbalisesMath(t *testing.T) {
	t.Parallel()

	preview := Preview(`\frac{x+1}{y} + \sqrt{y}`)
	for _, expected := range []string{"fraction", "over", "square root"} {
		if !strings.Contains(preview.Speech, expected) {
			t.Fatalf("speech = %q, want %q", preview.Speech, expected)
		}
	}
	if preview.Source != "deterministic-fallback" || !preview.ToolOptional {
		t.Fatalf("preview = %#v, want deterministic fallback metadata", preview)
	}
}

func TestIngestMathML(t *testing.T) {
	t.Parallel()

	normalized := Ingest(`<math><mi>x</mi><mo>=</mo><mn>2</mn></math>`)
	if normalized != "x = 2" {
		t.Fatalf("normalized = %q, want stripped MathML text", normalized)
	}
}
