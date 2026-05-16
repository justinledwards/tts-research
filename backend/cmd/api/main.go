package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

const maxSafeWorkerCount = 2

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

	segmentMaxRunes, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES", 300)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	segmentWorkers, err := envIntWithDefault("VOICE_SEGMENT_WORKERS", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	referenceWorkerCount, err := envIntWithDefault("KOKOCLONE_WORKER_COUNT", 2)
	if err != nil {
		logger.Error("invalid tts configuration", "error", err)
		os.Exit(1)
	}
	studioSegmentWorkers, err := envIntWithDefault("VOICE_SEGMENT_WORKERS_STUDIO", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	studioSegmentMaxRunes, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES_STUDIO", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	studioSegmentWorkersAdaptive, err := envIntWithDefault("VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	studioSegmentMaxRunesAdaptive, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES_STUDIO_ADAPTIVE", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	sourcePrepSentenceMaxRunes, err := envIntWithDefault("VOICE_SOURCE_PREP_SENTENCE_MAX_RUNES", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	maxProfileBytes, err := envInt64WithDefault("VOICE_PROFILE_MAX_BYTES", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	voiceProfileReferenceMaxSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_MAX_SECONDS", 60)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	voiceProfileReferenceMinSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_MIN_SECONDS", 20)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	voiceProfileReferenceTargetSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_TARGET_SECONDS", 45)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	voiceProfileLikenessTimeoutSeconds, err := envIntWithDefault("VOICE_PROFILE_LIKENESS_TIMEOUT_SECONDS", 120)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	voiceProfileDiarizationToken := strings.TrimSpace(os.Getenv("PYANNOTE_AUTH_TOKEN"))
	if voiceProfileDiarizationToken == "" {
		voiceProfileDiarizationToken = strings.TrimSpace(os.Getenv("HF_TOKEN"))
	}
	bookPDFRequireTextExtractor, err := envBoolWithDefault("VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR", false)
	if err != nil {
		logger.Error("invalid book source configuration", "error", err)
		os.Exit(1)
	}
	sourceURLAllowPrivate, err := envBoolWithDefault("VOICE_SOURCE_URL_ALLOW_PRIVATE", false)
	if err != nil {
		logger.Error("invalid source URL configuration", "error", err)
		os.Exit(1)
	}
	segmentWorkers = clampWorkerCount("VOICE_SEGMENT_WORKERS", segmentWorkers, maxSafeWorkerCount, logger)
	studioSegmentWorkers = clampWorkerCount("VOICE_SEGMENT_WORKERS_STUDIO", studioSegmentWorkers, maxSafeWorkerCount, logger)
	studioSegmentWorkersAdaptive = clampWorkerCount(
		"VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE",
		studioSegmentWorkersAdaptive,
		maxSafeWorkerCount,
		logger,
	)
	referenceWorkerCount = clampWorkerCount("KOKOCLONE_WORKER_COUNT", referenceWorkerCount, maxSafeWorkerCount, logger)

	logger.Info(
		"pipeline configuration",
		"requestedSegmentWorkers",
		segmentWorkers,
		"requestedSegmentMaxRunes",
		segmentMaxRunes,
		"requestedStudioSegmentWorkers",
		studioSegmentWorkers,
		"requestedStudioSegmentMaxRunes",
		studioSegmentMaxRunes,
		"requestedStudioAdaptiveSegmentWorkers",
		studioSegmentWorkersAdaptive,
		"requestedStudioAdaptiveSegmentMaxRunes",
		studioSegmentMaxRunesAdaptive,
		"requestedSourcePrepSentenceMaxRunes",
		sourcePrepSentenceMaxRunes,
		"requestedReferenceWorkerCount",
		referenceWorkerCount,
		"voiceProfileReferenceMinSeconds",
		voiceProfileReferenceMinSeconds,
		"voiceProfileReferenceTargetSeconds",
		voiceProfileReferenceTargetSeconds,
		"voiceProfileReferenceMaxSeconds",
		voiceProfileReferenceMaxSeconds,
		"voiceProfileDiarizationModel",
		envWithDefault("VOICE_PROFILE_DIARIZATION_MODEL", "pyannote/speaker-diarization-community-1"),
		"voiceProfileDiarizationModelPath",
		strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_MODEL_PATH")),
		"voiceProfileDiarizationLocalModelDir",
		strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_LOCAL_MODEL_DIR")),
		"voiceProfileDiarizationConfigured",
		voiceProfileDiarizationToken != "" ||
			strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_MODEL_PATH")) != "" ||
			strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_LOCAL_MODEL_DIR")) != "",
		"voiceProfileDenoiseProvider",
		envWithDefault("VOICE_PROFILE_DENOISE_PROVIDER", "ffmpeg"),
		"voiceProfileDenoiseStrength",
		envWithDefault("VOICE_PROFILE_DENOISE_STRENGTH", "balanced"),
		"bookPdfPythonPath",
		envWithDefault("VOICE_BOOK_PDF_PYTHON_PATH", "./.venv/bin/python"),
		"bookPdfExtractorScript",
		envWithDefault("VOICE_BOOK_PDF_EXTRACTOR_SCRIPT_PATH", "./adapters/pdf/cli.py"),
		"bookPdfRequireTextExtractor",
		bookPDFRequireTextExtractor,
		"studioInheritsFromDefault",
		studioSegmentWorkers == 0 && studioSegmentMaxRunes == 0,
	)

	service := pipeline.NewService(
		optimizer,
		ttsAgent,
		checker,
		pipeline.Options{
			MaxRetries:                           3,
			SegmentMaxRunes:                      segmentMaxRunes,
			SegmentWorkers:                       segmentWorkers,
			StudioSegmentMaxRunes:                studioSegmentMaxRunes,
			StudioSegmentWorkers:                 studioSegmentWorkers,
			StudioSegmentWorkersAdaptive:         studioSegmentWorkersAdaptive,
			StudioSegmentMaxRunesAdaptive:        studioSegmentMaxRunesAdaptive,
			SourcePrepSentenceMaxRunes:           sourcePrepSentenceMaxRunes,
			ReferenceWorkerCount:                 referenceWorkerCount,
			JobDataDir:                           envWithDefault("VOICE_JOB_DATA_DIR", "./data/jobs"),
			ProjectDataDir:                       envWithDefault("VOICE_PROJECT_DATA_DIR", "./data/projects"),
			BookSourceDir:                        envWithDefault("VOICE_BOOK_SOURCE_DATA_DIR", "./data/book-sources"),
			SourcePrepDir:                        envWithDefault("VOICE_SOURCE_PREP_DATA_DIR", "./data/source-preps"),
			ProgressDataDir:                      envWithDefault("VOICE_PROGRESS_DATA_DIR", "./data/progress"),
			PlaybackSessionDir:                   envWithDefault("VOICE_PLAYBACK_SESSION_DATA_DIR", "./data/playback-sessions"),
			VoiceDataDir:                         envWithDefault("VOICE_DATA_DIR", "./data/voices"),
			FFMPEGPath:                           envWithDefault("FFMPEG_PATH", "ffmpeg"),
			SourceURLAllowPrivate:                sourceURLAllowPrivate,
			BookPDFPythonPath:                    envWithDefault("VOICE_BOOK_PDF_PYTHON_PATH", "./.venv/bin/python"),
			BookPDFExtractorScriptPath:           envWithDefault("VOICE_BOOK_PDF_EXTRACTOR_SCRIPT_PATH", "./adapters/pdf/cli.py"),
			BookPDFRequireTextExtractor:          bookPDFRequireTextExtractor,
			VoiceProfileDir:                      envWithDefault("VOICE_PROFILE_DATA_DIR", "./data/voice-profiles"),
			VoiceProfileSourceDir:                envWithDefault("VOICE_PROFILE_SOURCE_DATA_DIR", "./data/voice-profile-sources"),
			MaxProfileBytes:                      maxProfileBytes,
			VoiceProfileReferenceMinSeconds:      voiceProfileReferenceMinSeconds,
			VoiceProfileReferenceTargetSeconds:   voiceProfileReferenceTargetSeconds,
			VoiceProfileReferenceMaxSeconds:      voiceProfileReferenceMaxSeconds,
			VoiceProfileDiarizationModel:         envWithDefault("VOICE_PROFILE_DIARIZATION_MODEL", "pyannote/speaker-diarization-community-1"),
			VoiceProfileDiarizationModelPath:     strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_MODEL_PATH")),
			VoiceProfileDiarizationLocalModelDir: strings.TrimSpace(os.Getenv("VOICE_PROFILE_DIARIZATION_LOCAL_MODEL_DIR")),
			VoiceProfileDiarizationToken:         voiceProfileDiarizationToken,
			VoiceProfileAnalysisPythonPath:       envWithDefault("VOICE_PROFILE_ANALYSIS_PYTHON_PATH", "python3"),
			VoiceProfileAnalysisScriptPath:       envWithDefault("VOICE_PROFILE_ANALYSIS_SCRIPT_PATH", "./scripts/profile_analyze.py"),
			VoiceProfileAnalysisStrategyVersion:  envWithDefault("VOICE_PROFILE_ANALYSIS_STRATEGY_VERSION", "speaker-aware-v1"),
			VoiceProfileDenoiseProvider:          envWithDefault("VOICE_PROFILE_DENOISE_PROVIDER", "ffmpeg"),
			VoiceProfileDenoiseStrength:          envWithDefault("VOICE_PROFILE_DENOISE_STRENGTH", "balanced"),
			VoiceProfileEmbeddingModel:           envWithDefault("VOICE_PROFILE_EMBEDDING_MODEL", "pyannote/embedding"),
			VoiceProfileEmbeddingScriptPath:      envWithDefault("VOICE_PROFILE_EMBEDDING_SCRIPT_PATH", "./scripts/profile_likeness.py"),
			VoiceProfileLikenessCalibrationText:  envWithDefault("VOICE_PROFILE_LIKENESS_CALIBRATION_TEXT", "This is a short voice clone calibration sample for measuring speaker likeness."),
			VoiceProfileLikenessTimeoutSeconds:   voiceProfileLikenessTimeoutSeconds,
			DefaultTTSEngine:                     envWithDefault("TTS_DEFAULT_ENGINE", envWithDefault("TTS_PROVIDER", "mock")),
			TTSEngines:                           ttsEngineRegistrationsFromEnv(ttsAgent),
		},
	)
	serviceOptions := service.Options()

	logger.Info(
		"pipeline configuration (resolved)",
		"segmentWorkers",
		serviceOptions.SegmentWorkers,
		"segmentMaxRunes",
		serviceOptions.SegmentMaxRunes,
		"studioSegmentWorkers",
		serviceOptions.StudioSegmentWorkers,
		"studioSegmentMaxRunes",
		serviceOptions.StudioSegmentMaxRunes,
		"studioAdaptiveSegmentWorkers",
		serviceOptions.StudioSegmentWorkersAdaptive,
		"studioAdaptiveSegmentMaxRunes",
		serviceOptions.StudioSegmentMaxRunesAdaptive,
		"sourcePrepSentenceMaxRunes",
		serviceOptions.SourcePrepSentenceMaxRunes,
		"resolvedReferenceWorkerCount",
		referenceWorkerCount,
		"voiceProfileReferenceMinSeconds",
		serviceOptions.VoiceProfileReferenceMinSeconds,
		"voiceProfileReferenceTargetSeconds",
		serviceOptions.VoiceProfileReferenceTargetSeconds,
		"voiceProfileReferenceMaxSeconds",
		serviceOptions.VoiceProfileReferenceMaxSeconds,
	)

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

		return agents.NewKokoroTTSAgent(agents.KokoroConfig{
			PythonPath:          envWithDefault("KOKORO_PYTHON_PATH", "./.venv/bin/python"),
			ReferencePythonPath: referencePythonPath,
			ScriptPath:          envWithDefault("KOKORO_SCRIPT_PATH", "./scripts/kokoro_synth.py"),
			ReferenceScriptPath: envWithDefault(
				"KOKORO_REFERENCE_SCRIPT_PATH",
				"",
			),
			ReferenceModulePath:                firstEnv("KOKORO_REFERENCE_MODULE_PATH", "KOKOCLONE_MODULE_PATH", ""),
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
		return agents.NewMockTTSAgent(), nil
	default:
		return nil, fmt.Errorf("unsupported TTS_PROVIDER %q", provider)
	}
}

func ttsEngineRegistrationsFromEnv(defaultAgent pipeline.TTSAgent) []pipeline.TTSEngineRegistration {
	provider := strings.ToLower(envWithDefault("TTS_PROVIDER", "mock"))
	registrations := make([]pipeline.TTSEngineRegistration, 0, 6)
	switch provider {
	case "kokoro":
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
				Setup:         "Fast local long-form voicepack synthesis.",
			},
		})
	case "mock":
		registrations = append(registrations, pipeline.TTSEngineRegistration{
			ID:    "mock",
			Agent: defaultAgent,
			Diagnostics: pipeline.TTSEngineDiagnostics{
				ID:           "mock",
				Label:        "Mock TTS",
				Status:       "ready",
				Local:        true,
				SupportsSSML: false,
				Setup:        "Silent WAV generator for tests and offline UI development.",
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
			ID:              pipeline.TTSEngineSupertonic,
			Label:           "Supertonic 3",
			Status:          status,
			Local:           true,
			SupportsVoice:   true,
			SupportsSwedish: true,
			SupportsSSML:    false,
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
