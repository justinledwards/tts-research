package agents_test

import (
	"context"
	"strings"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

func TestVoiceOptimizationAgentNormalizesMarkdownForSpeech(t *testing.T) {
	t.Parallel()

	agent := agents.NewVoiceOptimizationAgent()
	optimized, err := agent.Optimize(context.Background(), strings.Join([]string{
		"# Chapter One",
		"",
		"Read **this** [reference](https://example.com) aloud & clearly.",
		"- first point",
		"1. second point",
		"> quoted aside",
		"```go",
		"fmt.Println(\"syntax\")",
		"```",
		"| name | value |",
		"| --- | --- |",
		"| speed | 90% |",
	}, "\n"))
	if err != nil {
		t.Fatalf("Optimize returned error: %v", err)
	}

	for _, forbidden := range []string{"#", "**", "[", "](", "https://", "```", "| --- |"} {
		if strings.Contains(optimized, forbidden) {
			t.Fatalf("optimized text still contains markdown syntax %q: %q", forbidden, optimized)
		}
	}
	for _, expected := range []string{
		"Chapter One",
		"Read this reference aloud and clearly",
		"first point",
		"second point",
		"quoted aside",
		"code sample omitted for spoken playback",
		"speed, 90 percent",
	} {
		if !strings.Contains(optimized, expected) {
			t.Fatalf("optimized text = %q, want substring %q", optimized, expected)
		}
	}
}
