package agents

import (
	"context"
	"regexp"
	"strings"
)

const VoiceOptimizationPrompt = `You are a voice optimization agent. You take inputs from research agents and output high quality and accurate text for a Text to Speech agent.
Your job is to replace tricky characters, measurements, formulas, or codeblocks, and rewrite text to flow in a more natural way when spoken out loud.
There are many tricky words, acronyms, onomatopoeic sounds, or regional variants that can just be avoided by writing in a better way so the TTS is less jarring.`

type VoiceOptimizationAgent struct{}

func NewVoiceOptimizationAgent() *VoiceOptimizationAgent {
	return &VoiceOptimizationAgent{}
}

func (agent *VoiceOptimizationAgent) Optimize(_ context.Context, input string) (string, error) {
	normalized := strings.TrimSpace(input)
	normalized = strings.ReplaceAll(normalized, "\r\n", "\n")
	normalized = codeFencePattern.ReplaceAllString(normalized, " code sample omitted for spoken playback ")
	normalized = strings.ReplaceAll(normalized, "&", " and ")
	normalized = strings.ReplaceAll(normalized, "%", " percent")
	normalized = strings.ReplaceAll(normalized, "°", " degrees ")
	normalized = strings.ReplaceAll(normalized, "=", " equals ")
	normalized = strings.ReplaceAll(normalized, "+", " plus ")
	normalized = whitespacePattern.ReplaceAllString(normalized, " ")

	return strings.TrimSpace(normalized), nil
}

func (agent *VoiceOptimizationAgent) ProviderName() string {
	return "rules"
}

var (
	codeFencePattern  = regexp.MustCompile("(?s)```.*?```")
	whitespacePattern = regexp.MustCompile(`\s+`)
)
