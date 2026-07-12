package pipeline

import (
	"path/filepath"
	"strings"
)

const (
	ResearchModuleSupertonicEmbed = "supertonic-embed"
	ResearchModuleKokoroEmbed     = "kokoro-embed"

	voiceEmbedRuntimeSetupCommand = "VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed"
	missingKokoroPythonPathHint   = "No valid Python executable found for embed artifacts. Set VoiceProfileArtifactPythonPath to an existing Python binary (for example the project .venv-voice-embed/bin/python), then retry"
	missingSupertonicAssetsHint   = "Run `VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed` to sync onnx/* and voice_styles/* from backend/model-cache/supertonic into the module's upstream directory, or rerun the upstream supertonic setup steps."
	missingKokoroSpacyModelHint   = "Install en_core_web_sm in the voice-embed runtime and retry. Example: `VOICE_EMBED_INSTALL_DEPS=1 mise setup:voice-embed`."
)

var supertonicEmbedRequiredFiles = []string{
	filepath.Join("onnx", "duration_predictor.onnx"),
	filepath.Join("onnx", "text_encoder.onnx"),
	filepath.Join("onnx", "vector_estimator.onnx"),
	filepath.Join("onnx", "vocoder.onnx"),
	filepath.Join("onnx", "tts.json"),
	filepath.Join("onnx", "unicode_indexer.json"),
	filepath.Join("voice_styles", "M1.json"),
}

type ResearchModuleConfig struct {
	ID        string
	Label     string
	RepoURL   string
	Ref       string
	LocalPath string
	EngineID  string
	Setup     string
}

func defaultResearchModuleConfigs() []ResearchModuleConfig {
	return normalizeResearchModuleConfigs([]ResearchModuleConfig{
		{
			ID:        ResearchModuleSupertonicEmbed,
			Label:     "Supertonic Embed",
			RepoURL:   "https://github.com/kdrkdrkdr/supertonic.embed.git",
			Ref:       "main",
			LocalPath: "../.upstreams/supertonic.embed",
			EngineID:  TTSEngineSupertonic,
			Setup:     "Optional CUDA/PyTorch module for building Supertonic style JSON artifacts from a reference WAV.",
		},
		{
			ID:        ResearchModuleKokoroEmbed,
			Label:     "Kokoro Embed",
			RepoURL:   "https://github.com/kdrkdrkdr/kokoro.embed.git",
			Ref:       "main",
			LocalPath: "../.upstreams/kokoro.embed",
			EngineID:  TTSEngineKokoroEmbed,
			Setup:     "Optional CUDA/PyTorch module for building Kokoro style-vector artifacts from a reference WAV.",
		},
	})
}

func normalizeResearchModuleConfigs(configs []ResearchModuleConfig) []ResearchModuleConfig {
	normalized := make([]ResearchModuleConfig, 0, len(configs))
	for _, config := range configs {
		config.ID = normalizeResearchModuleID(config.ID)
		if config.ID == "" {
			continue
		}
		if strings.TrimSpace(config.Ref) == "" {
			config.Ref = "main"
		}
		if strings.TrimSpace(config.Label) == "" {
			config.Label = config.ID
		}
		if strings.TrimSpace(config.LocalPath) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.LocalPath = "../.upstreams/supertonic.embed"
			case ResearchModuleKokoroEmbed:
				config.LocalPath = "../.upstreams/kokoro.embed"
			}
		}
		if strings.TrimSpace(config.RepoURL) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.RepoURL = "https://github.com/kdrkdrkdr/supertonic.embed.git"
			case ResearchModuleKokoroEmbed:
				config.RepoURL = "https://github.com/kdrkdrkdr/kokoro.embed.git"
			}
		}
		if strings.TrimSpace(config.EngineID) == "" {
			switch config.ID {
			case ResearchModuleSupertonicEmbed:
				config.EngineID = TTSEngineSupertonic
			case ResearchModuleKokoroEmbed:
				config.EngineID = TTSEngineKokoroEmbed
			}
		}
		normalized = append(normalized, config)
	}
	return normalized
}

func normalizeResearchModuleID(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	switch clean {
	case "supertonic.embed", "supertonic_embed":
		return ResearchModuleSupertonicEmbed
	case "kokoro.embed", "kokoro_embed":
		return ResearchModuleKokoroEmbed
	default:
		return clean
	}
}

