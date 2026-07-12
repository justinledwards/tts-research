package agents

import "testing"

func TestNarrationProviderTimeoutDefaults(t *testing.T) {
	t.Parallel()

	kokoro := NewKokoroTTSAgent(KokoroConfig{})
	if kokoro.config.TimeoutSeconds != 3600 {
		t.Fatalf("kokoro timeout = %d, want 3600", kokoro.config.TimeoutSeconds)
	}
	if kokoro.config.ReferenceTimeoutSeconds != 3600 {
		t.Fatalf("kokoro reference timeout = %d, want 3600", kokoro.config.ReferenceTimeoutSeconds)
	}
	if kokoro.config.ReferenceWorkerReadyTimeoutSeconds != 3600 {
		t.Fatalf(
			"kokoro reference worker timeout = %d, want 3600",
			kokoro.config.ReferenceWorkerReadyTimeoutSeconds,
		)
	}

	supertonic := NewSupertonicTTSAgent(SupertonicConfig{})
	if supertonic.config.TimeoutSeconds != 3600 {
		t.Fatalf("supertonic timeout = %d, want 3600", supertonic.config.TimeoutSeconds)
	}

	qwen := NewQwenASRVoiceCheckerAgent(QwenASRConfig{})
	if qwen.config.TimeoutSeconds != 3600 {
		t.Fatalf("qwen ASR timeout = %d, want 3600", qwen.config.TimeoutSeconds)
	}
}

func TestNarrationProviderTimeoutDefaultsRemainOverridable(t *testing.T) {
	t.Parallel()

	kokoro := NewKokoroTTSAgent(KokoroConfig{
		ReferenceTimeoutSeconds:            44,
		ReferenceWorkerReadyTimeoutSeconds: 45,
		TimeoutSeconds:                     43,
	})
	if kokoro.config.TimeoutSeconds != 43 ||
		kokoro.config.ReferenceTimeoutSeconds != 44 ||
		kokoro.config.ReferenceWorkerReadyTimeoutSeconds != 45 {
		t.Fatalf("kokoro configured timeouts were not preserved: %+v", kokoro.config)
	}

	supertonic := NewSupertonicTTSAgent(SupertonicConfig{TimeoutSeconds: 46})
	if supertonic.config.TimeoutSeconds != 46 {
		t.Fatalf("supertonic configured timeout = %d, want 46", supertonic.config.TimeoutSeconds)
	}

	qwen := NewQwenASRVoiceCheckerAgent(QwenASRConfig{TimeoutSeconds: 47})
	if qwen.config.TimeoutSeconds != 47 {
		t.Fatalf("qwen configured timeout = %d, want 47", qwen.config.TimeoutSeconds)
	}
}
