package main

import (
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestMockProviderUsesKokoroFacingEngineDiagnostics(t *testing.T) {
	t.Setenv("TTS_PROVIDER", "mock")
	t.Setenv("TTS_DEFAULT_ENGINE", "")

	if got := defaultTTSEngineFromEnv(); got != pipeline.TTSEngineKokoro {
		t.Fatalf("defaultTTSEngineFromEnv() = %q, want %q", got, pipeline.TTSEngineKokoro)
	}
	if _, ok := pipeline.TTSAgent(newDevMockTTSAgent()).(pipeline.TTSWithReference); !ok {
		t.Fatalf("dev mock agent should support KokoClone reference synthesis")
	}

	registrations := ttsEngineRegistrationsFromEnv(agents.NewMockTTSAgent())
	var hasKokoro bool
	for _, registration := range registrations {
		if registration.ID == "mock" {
			t.Fatalf("mock provider leaked a user-facing mock engine registration")
		}
		if registration.ID == pipeline.TTSEngineKokoro {
			hasKokoro = true
			if registration.Diagnostics.Label != "Kokoro" {
				t.Fatalf("Kokoro label = %q, want Kokoro", registration.Diagnostics.Label)
			}
		}
	}
	if !hasKokoro {
		t.Fatalf("registrations = %#v, want Kokoro-facing diagnostics", registrations)
	}
}
