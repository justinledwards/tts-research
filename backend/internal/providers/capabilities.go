package providers

import "strings"

type CapabilitySet struct {
	TTS              bool `json:"tts"`
	MockTTS          bool `json:"mockTts"`
	Streaming        bool `json:"streaming"`
	WordTiming       bool `json:"wordTiming"`
	PhraseTiming     bool `json:"phraseTiming"`
	SSML             bool `json:"ssml"`
	SSMLMarks        bool `json:"ssmlMarks"`
	PhonemeOverrides bool `json:"phonemeOverrides"`
	VoiceCloning     bool `json:"voiceCloning"`
	VoicePreview     bool `json:"voicePreview"`
	CancelJob        bool `json:"cancelJob"`
	RetryJob         bool `json:"retryJob"`
	Alignment        bool `json:"alignment"`
	ABComparison     bool `json:"abComparison"`
	LocalOnly        bool `json:"localOnly"`
}

type DiagnosticInput struct {
	ID                string
	Label             string
	Status            string
	Local             bool
	SupportsVoice     bool
	SupportsReference bool
	SupportsArtifacts bool
	SupportsSSML      bool
	Metadata          map[string]string
}

func CapabilitiesForDiagnostics(input DiagnosticInput) CapabilitySet {
	id := strings.ToLower(strings.TrimSpace(input.ID))
	status := strings.ToLower(strings.TrimSpace(input.Status))
	metadata := normalizeMetadata(input.Metadata)
	if isMockRuntime(id, input.Label, metadata) {
		return MockCapabilities()
	}

	ready := status == "" || status == "ready"
	capabilities := CapabilitySet{
		TTS:              ready,
		LocalOnly:        input.Local,
		SSML:             ready && input.SupportsSSML,
		SSMLMarks:        ready && input.SupportsSSML && boolMetadata(metadata, "ssmlmarks"),
		PhonemeOverrides: ready && boolMetadata(metadata, "phonemeoverrides"),
		VoiceCloning: ready &&
			(input.SupportsReference || input.SupportsArtifacts || strings.Contains(id, "clone") || strings.Contains(id, "embed")),
		VoicePreview: ready && (input.SupportsVoice || input.SupportsReference || input.SupportsArtifacts),
		CancelJob:    ready,
		RetryJob:     ready,
		Streaming:    ready && boolMetadata(metadata, "streaming"),
		WordTiming:   ready && boolMetadata(metadata, "wordtiming"),
		PhraseTiming: ready && boolMetadata(metadata, "phrasetiming"),
		Alignment:    ready && boolMetadata(metadata, "alignment"),
	}
	capabilities.ABComparison = capabilities.TTS && capabilities.VoicePreview
	return capabilities
}

func MockCapabilities() CapabilitySet {
	return CapabilitySet{
		TTS:              true,
		MockTTS:          true,
		Streaming:        true,
		WordTiming:       true,
		PhraseTiming:     true,
		SSML:             true,
		SSMLMarks:        true,
		PhonemeOverrides: true,
		VoiceCloning:     true,
		VoicePreview:     true,
		CancelJob:        true,
		RetryJob:         true,
		Alignment:        true,
		ABComparison:     true,
		LocalOnly:        true,
	}
}

func normalizeMetadata(metadata map[string]string) map[string]string {
	if len(metadata) == 0 {
		return nil
	}
	normalized := make(map[string]string, len(metadata))
	for key, value := range metadata {
		normalized[strings.ToLower(strings.ReplaceAll(strings.TrimSpace(key), "_", ""))] =
			strings.ToLower(strings.TrimSpace(value))
	}
	return normalized
}

func isMockRuntime(id string, label string, metadata map[string]string) bool {
	if metadata["runtimeprovider"] == "mock" || metadata["provider"] == "mock" {
		return true
	}
	if id == "mock" {
		return true
	}
	return strings.Contains(strings.ToLower(label), "mock")
}

func boolMetadata(metadata map[string]string, key string) bool {
	switch metadata[key] {
	case "1", "true", "yes", "supported", "available", "enabled":
		return true
	default:
		return false
	}
}
