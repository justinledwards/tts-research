package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	optimizer, err := optimizerFromEnv()
	if err != nil {
		logger.Error("invalid optimizer configuration", "error", err)
		os.Exit(1)
	}
	preloadOptimizer, err := envBoolWithDefault("BONSAI_PRELOAD", true)
	if err != nil {
		logger.Error("invalid optimizer configuration", "error", err)
		os.Exit(1)
	}
	if warmable, ok := optimizer.(interface{ Warm(context.Context) error }); ok && preloadOptimizer {
		go func() {
			logger.Info("warming voice optimizer")
			if err := warmable.Warm(context.Background()); err != nil {
				logger.Warn("voice optimizer warmup failed", "error", err)
			}
		}()
	}

	ttsAgent, err := ttsAgentFromEnv()
	if err != nil {
		logger.Error("invalid tts configuration", "error", err)
		os.Exit(1)
	}

	checker, err := checkerFromEnv()
	if err != nil {
		logger.Error("invalid checker configuration", "error", err)
		os.Exit(1)
	}
	preloadChecker, err := envBoolWithDefault("QWEN_ASR_PRELOAD", true)
	if err != nil {
		logger.Error("invalid checker configuration", "error", err)
		os.Exit(1)
	}
	if warmable, ok := checker.(interface{ Warm(context.Context) error }); ok && preloadChecker {
		go func() {
			logger.Info("warming voice checker")
			if err := warmable.Warm(context.Background()); err != nil {
				logger.Warn("voice checker warmup failed", "error", err)
			}
		}()
	}

	service, err := pipelineServiceFromEnv(logger, optimizer, ttsAgent, checker)
	if err != nil {
		os.Exit(1)
	}

	app := httpapi.NewRouter(service)
	port := envWithDefault("BACKEND_PORT", "8080")

	logger.Info("starting api", "port", port)
	if err := app.Listen(fmt.Sprintf(":%s", port)); err != nil {
		logger.Error("api stopped", "error", err)
		os.Exit(1)
	}
}

func optimizerFromEnv() (pipeline.VoiceOptimizer, error) {
	provider := strings.ToLower(envWithDefault("VOICE_OPTIMIZER_PROVIDER", "rules"))
	apiKey := os.Getenv("OPENROUTER_API_KEY")
	rules := agents.NewVoiceOptimizationAgent()

	switch provider {
	case "auto", "bonsai":
		return agents.NewBonsaiVoiceOptimizationAgent(bonsaiOptimizerConfig()), nil
	case "openrouter":
		if strings.TrimSpace(apiKey) == "" {
			return nil, fmt.Errorf("OPENROUTER_API_KEY is required when VOICE_OPTIMIZER_PROVIDER=openrouter")
		}

		return agents.NewOpenRouterVoiceOptimizationAgent(openRouterOptimizerConfig(apiKey, rules)), nil
	case "rules":
		return rules, nil
	default:
		return nil, fmt.Errorf("unsupported VOICE_OPTIMIZER_PROVIDER %q", provider)
	}
}

func bonsaiOptimizerConfig() agents.BonsaiVoiceOptimizationConfig {
	timeout, err := envIntWithDefault("BONSAI_TIMEOUT_SECONDS", 600)
	if err != nil {
		timeout = 600
	}
	maxTokens, err := envIntWithDefault("BONSAI_MAX_TOKENS", 0)
	if err != nil {
		maxTokens = 0
	}
	chunkRunes, err := envIntWithDefault("BONSAI_CHUNK_RUNES", 1600)
	if err != nil {
		chunkRunes = 1600
	}
	temperature, err := envFloatWithDefault("BONSAI_TEMPERATURE", 0.1)
	if err != nil {
		temperature = 0.1
	}
	topP, err := envFloatWithDefault("BONSAI_TOP_P", 0.9)
	if err != nil {
		topP = 0.9
	}
	topK, err := envIntWithDefault("BONSAI_TOP_K", 20)
	if err != nil {
		topK = 20
	}

	return agents.BonsaiVoiceOptimizationConfig{
		PythonPath:     envWithDefault("BONSAI_PYTHON_PATH", "./.venv-bonsai/bin/python"),
		ScriptPath:     envWithDefault("BONSAI_SCRIPT_PATH", "./scripts/bonsai_optimize.py"),
		Model:          envWithDefault("BONSAI_MODEL", "prism-ml/Bonsai-8B-mlx-1bit"),
		TimeoutSeconds: timeout,
		MaxTokens:      maxTokens,
		ChunkRunes:     chunkRunes,
		Temperature:    temperature,
		TopP:           topP,
		TopK:           topK,
	}
}

func openRouterOptimizerConfig(apiKey string, fallback *agents.VoiceOptimizationAgent) agents.OpenRouterVoiceOptimizationConfig {
	timeout, err := envIntWithDefault("OPENROUTER_TIMEOUT_SECONDS", 180)
	if err != nil {
		timeout = 180
	}

	return agents.OpenRouterVoiceOptimizationConfig{
		APIKey:         apiKey,
		BaseURL:        envWithDefault("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
		Model:          envWithDefault("OPENROUTER_MODEL", "openrouter/free"),
		HTTPReferer:    envWithDefault("OPENROUTER_HTTP_REFERER", "http://localhost:5173"),
		Title:          envWithDefault("OPENROUTER_APP_TITLE", "TTS Research"),
		TimeoutSeconds: timeout,
		Fallback:       fallback,
	}
}

func ttsAgentFromEnv() (pipeline.TTSAgent, error) {
	provider := strings.ToLower(envWithDefault("TTS_PROVIDER", "mock"))

	switch provider {
	case "kokoro":
		speed, err := envFloatWithDefault("KOKORO_SPEED", 1)
		if err != nil {
			return nil, err
		}

		timeout, err := envIntWithDefault("KOKORO_TIMEOUT_SECONDS", 180)
		if err != nil {
			return nil, err
		}
		referenceTimeout, err := envIntWithDefault("KOKORO_REFERENCE_TIMEOUT_SECONDS", timeout)
		if err != nil {
			return nil, err
		}
		referenceWorkerReadyTimeout, err := envIntWithDefault("KOKORO_REFERENCE_WORKER_READY_TIMEOUT_SECONDS", timeout)
		if err != nil {
			return nil, err
		}
		referencePythonPath := os.Getenv("KOKOCLONE_PYTHON_PATH")
		if strings.TrimSpace(referencePythonPath) == "" {
			referencePythonPath = os.Getenv("KOKORO_PYTHON_PATH")
		}
		if strings.TrimSpace(referencePythonPath) == "" {
			referencePythonPath = "./.venv-kokoclone/bin/python"
		}
		referenceWorkerCount, err := envIntWithDefault("KOKOCLONE_WORKER_COUNT", 2)
		if err != nil {
			return nil, err
		}
		embedPythonPath := firstTrimmedEnvValue(
			"KOKORO_EMBED_PYTHON_PATH",
			"KOKORO_PYTHON_PATH",
			"VOICE_PROFILE_ARTIFACT_PYTHON_PATH",
		)
		if strings.TrimSpace(embedPythonPath) == "" {
			embedPythonPath = strings.TrimSpace(envWithDefault("KOKORO_PYTHON_PATH", "./.venv/bin/python"))
		}
		if strings.TrimSpace(embedPythonPath) == "" {
			embedPythonPath = strings.TrimSpace(referencePythonPath)
		}
		if err := ensurePythonCanImportModule(embedPythonPath, "kokoro"); err != nil {
			return nil, fmt.Errorf(
				"kokoro embed synthesis runtime misconfiguration: resolved interpreter %q cannot import kokoro (checked at startup). Configure KOKORO_EMBED_PYTHON_PATH (preferred) or KOKORO_PYTHON_PATH to a Python environment with kokoro installed: %w",
				embedPythonPath,
				err,
			)
		}

		return agents.NewKokoroTTSAgent(agents.KokoroConfig{
			PythonPath:          envWithDefault("KOKORO_PYTHON_PATH", "./.venv/bin/python"),
			ReferencePythonPath: referencePythonPath,
			EmbedPythonPath:     embedPythonPath,
			ScriptPath:          envWithDefault("KOKORO_SCRIPT_PATH", "./scripts/kokoro_synth.py"),
			ReferenceScriptPath: envWithDefault(
				"KOKORO_REFERENCE_SCRIPT_PATH",
				"",
			),
			EmbedScriptPath:                    envWithDefault("KOKORO_EMBED_SCRIPT_PATH", "./scripts/kokoro_embed_synth.py"),
			ReferenceModulePath:                firstEnv("KOKORO_REFERENCE_MODULE_PATH", "KOKOCLONE_MODULE_PATH", ""),
			EmbedModulePath:                    envWithDefault("KOKORO_EMBED_MODULE_PATH", filepath.Join(researchModuleBaseDirFromEnv(), "kokoro.embed")),
			DataDir:                            envWithDefault("KOKORO_DATA_DIR", "./data/kokoro"),
			LangCode:                           envWithDefault("KOKORO_LANG_CODE", "a"),
			Voice:                              envWithDefault("KOKORO_VOICE", "af_heart"),
			Speed:                              speed,
			Device:                             envWithDefault("KOKORO_DEVICE", "auto"),
			TimeoutSeconds:                     timeout,
			ReferenceTimeoutSeconds:            referenceTimeout,
			ReferenceWorkerReadyTimeoutSeconds: referenceWorkerReadyTimeout,
			ReferenceWorkerCount:               referenceWorkerCount,
		}), nil
	case "mock":
		return newDevMockTTSAgent(), nil
	default:
		return nil, fmt.Errorf("unsupported TTS_PROVIDER %q", provider)
	}
}

type devMockTTSAgent struct {
	*agents.MockTTSAgent
}

func newDevMockTTSAgent() *devMockTTSAgent {
	return &devMockTTSAgent{MockTTSAgent: agents.NewMockTTSAgent()}
}

func (agent *devMockTTSAgent) SynthesizeWithReference(ctx context.Context, text string, referencePath string, language string) (agents.TTSResult, error) {
	result, err := agent.SynthesizeWithVoice(ctx, text, "reference:"+filepath.Base(referencePath), language)
	if err != nil {
		return agents.TTSResult{}, err
	}
	result.Provider = "mock-reference"
	return result, nil
}

func ttsEngineRegistrationsFromEnv(defaultAgent pipeline.TTSAgent) []pipeline.TTSEngineRegistration {
	provider := strings.ToLower(envWithDefault("TTS_PROVIDER", "mock"))
	registrations := make([]pipeline.TTSEngineRegistration, 0, 6)
	switch provider {
	case "kokoro", "mock":
		setup := "Fast local long-form voicepack synthesis."
		if provider == "mock" {
			setup = "Kokoro-facing silent runtime for UI development. Start with TTS_PROVIDER=kokoro for real local audio."
		}
		registrations = append(registrations, pipeline.TTSEngineRegistration{
			ID:    pipeline.TTSEngineKokoro,
			Agent: defaultAgent,
			Diagnostics: pipeline.TTSEngineDiagnostics{
				ID:            pipeline.TTSEngineKokoro,
				Label:         "Kokoro",
				Status:        "ready",
				Local:         true,
				SupportsVoice: true,
				SupportsSSML:  false,
				Languages:     []string{"en", "ja", "zh", "es", "fr", "hi", "it", "pt"},
				ModelCache:    envWithDefault("KOKORO_DATA_DIR", "./data/kokoro"),
				Setup:         setup,
				Metadata: map[string]string{
					"runtimeProvider": provider,
				},
			},
		})
	}
	if _, ok := defaultAgent.(pipeline.TTSWithReference); ok {
		registrations = append(registrations, pipeline.TTSEngineRegistration{
			ID:    pipeline.TTSEngineKokoroClone,
			Agent: defaultAgent,
			Diagnostics: pipeline.TTSEngineDiagnostics{
				ID:                pipeline.TTSEngineKokoroClone,
				Label:             "Kokoro Clone",
				Status:            "ready",
				Local:             true,
				SupportsVoice:     true,
				SupportsReference: true,
				SupportsSSML:      false,
				Languages:         []string{"en"},
				ModelCache:        envWithDefault("KOKORO_DATA_DIR", "./data/kokoro"),
				Setup:             "Uses selected Voice Profile reference audio through the KokoClone worker.",
			},
		})
	}
	if _, ok := defaultAgent.(pipeline.TTSWithProfileArtifact); ok {
		registrations = append(registrations, pipeline.TTSEngineRegistration{
			ID:    pipeline.TTSEngineKokoroEmbed,
			Agent: defaultAgent,
			Diagnostics: pipeline.TTSEngineDiagnostics{
				ID:                pipeline.TTSEngineKokoroEmbed,
				Label:             "Kokoro Embed",
				Status:            "ready",
				Local:             true,
				SupportsVoice:     true,
				SupportsArtifacts: true,
				SupportsSSML:      false,
				Languages:         []string{"en"},
				ModelCache:        envWithDefault("KOKORO_DATA_DIR", "./data/kokoro"),
				Setup:             "Build a Kokoro Embed artifact on a Voice Profile, then render Kokoro with the optimized style vector.",
				Metadata: map[string]string{
					"module": pipeline.ResearchModuleKokoroEmbed,
				},
			},
		})
	}
	registrations = append(registrations, supertonicRegistrationFromEnv())
	registrations = append(registrations, experimentalEngineRegistration(
		"dramabox",
		"DramaBox Experimental",
		"~24 GB peak VRAM",
		"Set DRAMABOX_BASE_URL to a warm DramaBox server. Local startup is disabled on small GPUs.",
	))
	registrations = append(registrations, experimentalEngineRegistration(
		"scenema-audio",
		"Scenema Audio Experimental",
		"16 GB+ VRAM plus large model cache",
		"Set SCENEMA_AUDIO_BASE_URL to a running Scenema Audio HTTP service.",
	))
	return registrations
}

func defaultTTSEngineFromEnv() string {
	if value := strings.TrimSpace(os.Getenv("TTS_DEFAULT_ENGINE")); value != "" {
		return value
	}
	provider := strings.ToLower(envWithDefault("TTS_PROVIDER", "mock"))
	if provider == "mock" {
		return pipeline.TTSEngineKokoro
	}
	return provider
}

func supertonicRegistrationFromEnv() pipeline.TTSEngineRegistration {
	pythonPath := envWithDefault("SUPERTONIC_PYTHON", "./.venv-supertonic/bin/python")
	scriptPath := envWithDefault("SUPERTONIC_SCRIPT_PATH", "./scripts/supertonic_synth.py")
	modelDir := strings.TrimSpace(os.Getenv("SUPERTONIC_MODEL_DIR"))
	autoDownload, err := envBoolWithDefault("SUPERTONIC_AUTO_DOWNLOAD", false)
	if err != nil {
		autoDownload = false
	}
	timeout, err := envIntWithDefault("SUPERTONIC_TIMEOUT_SECONDS", 180)
	if err != nil {
		timeout = 180
	}

	status := "unavailable"
	reason := "Supertonic runtime is not installed."
	if executableAvailable(pythonPath) && fileAvailable(scriptPath) {
		status = "ready"
		reason = "Ready for local ONNX synthesis."
	}
	var agent pipeline.TTSAgent
	if status == "ready" {
		agent = agents.NewSupertonicTTSAgent(agents.SupertonicConfig{
			PythonPath:     pythonPath,
			ScriptPath:     scriptPath,
			ModelDir:       modelDir,
			DefaultVoice:   envWithDefault("SUPERTONIC_DEFAULT_VOICE", "M1"),
			DefaultLang:    envWithDefault("SUPERTONIC_DEFAULT_LANG", "sv"),
			AutoDownload:   autoDownload,
			TimeoutSeconds: timeout,
		})
	}

	return pipeline.TTSEngineRegistration{
		ID:    pipeline.TTSEngineSupertonic,
		Agent: agent,
		Diagnostics: pipeline.TTSEngineDiagnostics{
			ID:                pipeline.TTSEngineSupertonic,
			Label:             "Supertonic 3",
			Status:            status,
			Local:             true,
			SupportsVoice:     true,
			SupportsArtifacts: true,
			SupportsSwedish:   true,
			SupportsSSML:      false,
			Languages: []string{
				"ar", "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el",
				"hi", "hu", "id", "it", "ja", "ko", "lv", "lt", "pl", "pt", "ro", "ru",
				"sk", "sl", "es", "sv", "tr", "uk", "vi", "na",
			},
			Voices:        supertonicVoices(),
			EstimatedVRAM: "CPU/ONNX; no GPU required",
			ModelCache:    modelDir,
			Reason:        reason,
			Setup:         "Create .venv-supertonic, install `supertonic`, and set SUPERTONIC_AUTO_DOWNLOAD=true for first model fetch.",
			Metadata: map[string]string{
				"python":       pythonPath,
				"script":       scriptPath,
				"autoDownload": strconv.FormatBool(autoDownload),
				"languages":    "31+na",
			},
		},
	}
}

func experimentalEngineRegistration(id string, label string, estimatedVRAM string, setup string) pipeline.TTSEngineRegistration {
	baseURLEnv := strings.ToUpper(strings.ReplaceAll(id, "-", "_")) + "_BASE_URL"
	baseURL := strings.TrimSpace(os.Getenv(baseURLEnv))
	status := "unavailable"
	reason := "No warm server endpoint configured."
	if baseURL != "" {
		status = "configured"
		reason = "Endpoint configured; adapter implementation is diagnostics-gated."
	}
	return pipeline.TTSEngineRegistration{
		ID: id,
		Diagnostics: pipeline.TTSEngineDiagnostics{
			ID:              id,
			Label:           label,
			Status:          status,
			Local:           false,
			Experimental:    true,
			SupportsVoice:   true,
			SupportsSSML:    false,
			EstimatedVRAM:   estimatedVRAM,
			ModelCache:      baseURL,
			Reason:          reason,
			Setup:           setup,
			SupportsSwedish: false,
		},
	}
}

func supertonicVoices() []pipeline.TTSEngineVoice {
	return []pipeline.TTSEngineVoice{
		{ID: "M1", Name: "M1", Gender: "male", Description: "General male voice style"},
		{ID: "M2", Name: "M2", Gender: "male", Description: "General male voice style"},
		{ID: "M3", Name: "M3", Gender: "male", Description: "General male voice style"},
		{ID: "M4", Name: "M4", Gender: "male", Description: "General male voice style"},
		{ID: "M5", Name: "M5", Gender: "male", Description: "General male voice style"},
		{ID: "F1", Name: "F1", Gender: "female", Description: "General female voice style"},
		{ID: "F2", Name: "F2", Gender: "female", Description: "General female voice style"},
		{ID: "F3", Name: "F3", Gender: "female", Description: "General female voice style"},
		{ID: "F4", Name: "F4", Gender: "female", Description: "General female voice style"},
		{ID: "F5", Name: "F5", Gender: "female", Description: "General female voice style"},
	}
}

func researchModuleConfigsFromEnv() []pipeline.ResearchModuleConfig {
	baseDir := researchModuleBaseDirFromEnv()
	return []pipeline.ResearchModuleConfig{
		{
			ID:        pipeline.ResearchModuleSupertonicEmbed,
			Label:     "Supertonic Embed",
			RepoURL:   envWithDefault("SUPERTONIC_EMBED_REPO_URL", "https://github.com/kdrkdrkdr/supertonic.embed.git"),
			Ref:       envWithDefault("SUPERTONIC_EMBED_REF", "main"),
			LocalPath: envWithDefault("SUPERTONIC_EMBED_LOCAL_PATH", filepath.Join(baseDir, "supertonic.embed")),
			EngineID:  pipeline.TTSEngineSupertonic,
			Setup:     "Optional CUDA/PyTorch research module for Supertonic voice-style artifact extraction. Clone is user-triggered and kept outside the repo in .upstreams.",
		},
		{
			ID:        pipeline.ResearchModuleKokoroEmbed,
			Label:     "Kokoro Embed",
			RepoURL:   envWithDefault("KOKORO_EMBED_REPO_URL", "https://github.com/kdrkdrkdr/kokoro.embed.git"),
			Ref:       envWithDefault("KOKORO_EMBED_REF", "main"),
			LocalPath: envWithDefault("KOKORO_EMBED_LOCAL_PATH", filepath.Join(baseDir, "kokoro.embed")),
			EngineID:  pipeline.TTSEngineKokoroEmbed,
			Setup:     "Optional CUDA/PyTorch research module for Kokoro style-vector artifact extraction. Clone is user-triggered and kept outside the repo in .upstreams.",
		},
	}
}

func researchModuleBaseDirFromEnv() string {
	return envWithDefault("RESEARCH_MODULE_BASE_DIR", "../.upstreams")
}

func executableAvailable(path string) bool {
	if strings.Contains(path, "/") {
		info, err := os.Stat(path)
		return err == nil && !info.IsDir()
	}
	_, err := exec.LookPath(path)
	return err == nil
}

func fileAvailable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value, ok := os.LookupEnv(name); ok {
			return value
		}
	}

	return ""
}

func firstTrimmedEnvValue(names ...string) string {
	for _, name := range names {
		value, ok := os.LookupEnv(name)
		if !ok {
			continue
		}
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func ensurePythonCanImportModule(pythonPath, module string) error {
	pythonPath = strings.TrimSpace(pythonPath)
	if pythonPath == "" {
		return fmt.Errorf("python interpreter is not configured")
	}
	if !executableAvailable(pythonPath) {
		return fmt.Errorf("python executable not found at %q", pythonPath)
	}

	command := exec.Command(pythonPath, "-c", fmt.Sprintf("import importlib; importlib.import_module(%q)", module))
	output, err := command.CombinedOutput()
	if err != nil {
		if strings.TrimSpace(string(output)) == "" {
			return fmt.Errorf("python import check failed: %w", err)
		}
		return fmt.Errorf("python import check failed: %w (%s)", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func envInt64WithDefault(key string, fallback int64) (int64, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}

	return parsed, nil
}

func checkerFromEnv() (pipeline.VoiceChecker, error) {
	provider := strings.ToLower(envWithDefault("VOICE_CHECKER_PROVIDER", "mock"))

	switch provider {
	case "qwen", "qwen-asr":
		timeout, err := envIntWithDefault("QWEN_ASR_TIMEOUT_SECONDS", 240)
		if err != nil {
			return nil, err
		}
		threshold, err := envFloatWithDefault("QWEN_ASR_SIMILARITY_THRESHOLD", 0.82)
		if err != nil {
			return nil, err
		}
		maxNewTokens, err := envIntWithDefault("QWEN_ASR_MAX_NEW_TOKENS", 256)
		if err != nil {
			return nil, err
		}
		persistent, err := envBoolWithDefault("QWEN_ASR_PERSISTENT", true)
		if err != nil {
			return nil, err
		}

		return agents.NewQwenASRVoiceCheckerAgent(agents.QwenASRConfig{
			PythonPath:          envWithDefault("QWEN_ASR_PYTHON_PATH", "./.venv/bin/python"),
			ScriptPath:          envWithDefault("QWEN_ASR_SCRIPT_PATH", "./scripts/qwen_asr_check.py"),
			DataDir:             envWithDefault("QWEN_ASR_DATA_DIR", "./data/asr"),
			Model:               envWithDefault("QWEN_ASR_MODEL", "Qwen/Qwen3-ASR-1.7B"),
			Language:            envWithDefault("QWEN_ASR_LANGUAGE", "English"),
			Device:              envWithDefault("QWEN_ASR_DEVICE", "auto"),
			TimeoutSeconds:      timeout,
			MaxNewTokens:        maxNewTokens,
			SimilarityThreshold: threshold,
			Persistent:          persistent,
		}), nil
	case "mock":
		return agents.NewMockVoiceCheckerAgent(), nil
	default:
		return nil, fmt.Errorf("unsupported VOICE_CHECKER_PROVIDER %q", provider)
	}
}

func envWithDefault(key string, fallback string) string {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback
	}

	return value
}

func envFloatWithDefault(key string, fallback float64) (float64, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a float: %w", key, err)
	}

	return parsed, nil
}

func envIntWithDefault(key string, fallback int) (int, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", key, err)
	}

	return parsed, nil
}

func envIntWithFallback(key string, fallback int) int {
	value, err := envIntWithDefault(key, fallback)
	if err != nil {
		return fallback
	}
	return value
}

func alignmentPreferredFromEnv() []alignment.TimingSource {
	raw := strings.TrimSpace(os.Getenv("ALIGNMENT_PREFERRED"))
	if raw == "" {
		raw = "mfa,aeneas,gentle"
	}
	parts := strings.FieldsFunc(raw, func(value rune) bool {
		return value == ',' || value == ' ' || value == ';'
	})
	preferred := make([]alignment.TimingSource, 0, len(parts))
	for _, part := range parts {
		switch strings.ToLower(strings.TrimSpace(part)) {
		case "mfa", "montreal":
			preferred = append(preferred, alignment.TimingSourceMFA)
		case "aeneas":
			preferred = append(preferred, alignment.TimingSourceAeneas)
		case "gentle":
			preferred = append(preferred, alignment.TimingSourceGentle)
		case "native":
			preferred = append(preferred, alignment.TimingSourceNative)
		}
	}
	if len(preferred) == 0 {
		return []alignment.TimingSource{alignment.TimingSourceMFA, alignment.TimingSourceAeneas, alignment.TimingSourceGentle}
	}
	return preferred
}

func alignmentModeFromEnv(alignmentEnabled bool) alignment.AlignmentMode {
	raw := strings.ToLower(strings.TrimSpace(os.Getenv("ALIGNMENT_MODE")))
	switch raw {
	case "off":
		return alignment.AlignmentModeOff
	case "provider-only":
		return alignment.AlignmentModeProviderOnly
	case "provider-plus-validation":
		return alignment.AlignmentModeProviderPlusValidation
	case "local-forced-alignment":
		return alignment.AlignmentModeLocalForcedAlignment
	case "local-forced-alignment-required":
		return alignment.AlignmentModeLocalForcedRequired
	case "heuristic-fallback":
		return alignment.AlignmentModeHeuristicFallback
	default:
		if alignmentEnabled {
			return alignment.AlignmentModeProviderPlusValidation
		}
		return alignment.AlignmentModeProviderOnly
	}
}

func clampWorkerCount(name string, requested, max int, logger *slog.Logger) int {
	if requested > max {
		logger.Warn("capping worker count to safe ceiling", "variable", name, "requested", requested, "effective", max)
		return max
	}
	return requested
}

func envBoolWithDefault(key string, fallback bool) (bool, error) {
	value, ok := os.LookupEnv(key)
	if !ok || value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("%s must be a boolean: %w", key, err)
	}

	return parsed, nil
}

func envBoolWithFallback(key string, fallback bool) bool {
	value, err := envBoolWithDefault(key, fallback)
	if err != nil {
		return fallback
	}
	return value
}
