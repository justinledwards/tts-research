package providers

import "testing"

func TestCapabilitiesForMockRuntimeKeepsDemoFullyUseful(t *testing.T) {
	capabilities := CapabilitiesForDiagnostics(DiagnosticInput{
		ID:            "kokoro",
		Label:         "Kokoro",
		Local:         true,
		Status:        "ready",
		SupportsVoice: true,
		SupportsSSML:  false,
		Metadata:      map[string]string{"runtimeProvider": "mock"},
	})

	if !capabilities.MockTTS || !capabilities.WordTiming || !capabilities.ABComparison || !capabilities.VoiceCloning {
		t.Fatalf("mock runtime should expose full review capabilities, got %+v", capabilities)
	}
}

func TestCapabilitiesForLocalVoicepackRuntime(t *testing.T) {
	capabilities := CapabilitiesForDiagnostics(DiagnosticInput{
		ID:            "kokoro",
		Label:         "Kokoro",
		Local:         true,
		Status:        "ready",
		SupportsVoice: true,
		SupportsSSML:  false,
		Metadata:      map[string]string{"runtimeProvider": "kokoro"},
	})

	if !capabilities.TTS || !capabilities.VoicePreview || !capabilities.CancelJob || !capabilities.RetryJob {
		t.Fatalf("ready Kokoro should support basic generated-audio operations, got %+v", capabilities)
	}
	if capabilities.MockTTS || capabilities.VoiceCloning || capabilities.SSMLMarks {
		t.Fatalf("voicepack Kokoro should not claim mock, clone, or SSML-mark support, got %+v", capabilities)
	}
}

func TestCapabilitiesForCloneRuntime(t *testing.T) {
	capabilities := CapabilitiesForDiagnostics(DiagnosticInput{
		ID:                "kokoro-clone",
		Label:             "Kokoro Clone",
		Local:             true,
		Status:            "ready",
		SupportsVoice:     true,
		SupportsReference: true,
	})

	if !capabilities.VoiceCloning {
		t.Fatalf("reference-capable runtime should expose voice cloning, got %+v", capabilities)
	}
}

func TestCapabilitiesForUnavailableRuntime(t *testing.T) {
	capabilities := CapabilitiesForDiagnostics(DiagnosticInput{
		ID:            "supertonic-3",
		Label:         "Supertonic 3",
		Local:         true,
		Status:        "unavailable",
		SupportsVoice: true,
		SupportsSSML:  true,
	})

	if capabilities.TTS || capabilities.VoicePreview || capabilities.SSML {
		t.Fatalf("unavailable runtime should not advertise usable controls, got %+v", capabilities)
	}
	if !capabilities.LocalOnly {
		t.Fatalf("local-only should still describe runtime placement, got %+v", capabilities)
	}
}
