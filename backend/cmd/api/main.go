package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/agents"
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

	segmentMaxRunes, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES", 220)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}
	ttsWorkerCount, err := envIntWithDefault("TTS_WORKER_COUNT", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		os.Exit(1)
	}

	service := pipeline.NewService(
		optimizer,
		ttsAgent,
		checker,
		pipeline.Options{
			MaxRetries:      3,
			SegmentMaxRunes: segmentMaxRunes,
			TTSWorkerCount:  ttsWorkerCount,
			JobDataDir:      envWithDefault("VOICE_JOB_DATA_DIR", "./data/jobs"),
			VoiceDataDir:    envWithDefault("VOICE_DATA_DIR", "./data/voices"),
			FFMPEGPath:      envWithDefault("FFMPEG_PATH", "ffmpeg"),
		},
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
	provider := strings.ToLower(envWithDefault("VOICE_OPTIMIZER_PROVIDER", "bonsai"))
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
	provider := strings.ToLower(envWithDefault("TTS_PROVIDER", "kokoro"))

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

		kokoroAgent := agents.NewKokoroTTSAgent(agents.KokoroConfig{
			PythonPath:     envWithDefault("KOKORO_PYTHON_PATH", "./.venv/bin/python"),
			ScriptPath:     envWithDefault("KOKORO_SCRIPT_PATH", "./scripts/kokoro_synth.py"),
			DataDir:        envWithDefault("KOKORO_DATA_DIR", "./data/kokoro"),
			LangCode:       envWithDefault("KOKORO_LANG_CODE", "a"),
			Voice:          envWithDefault("KOKORO_VOICE", "af_heart"),
			Speed:          speed,
			Device:         envWithDefault("KOKORO_DEVICE", "cpu"),
			TimeoutSeconds: timeout,
		})

		kokocloneTimeout, err := envIntWithDefault("KOKOCLONE_TIMEOUT_SECONDS", 600)
		if err != nil {
			return nil, err
		}
		kokocloneAgent := agents.NewKokoCloneTTSAgent(agents.KokoCloneConfig{
			PythonPath:     envWithDefault("KOKOCLONE_PYTHON_PATH", envWithDefault("KOKORO_PYTHON_PATH", "./.venv/bin/python")),
			ScriptPath:     envWithDefault("KOKOCLONE_SCRIPT_PATH", "./scripts/kokoclone_synth.py"),
			DataDir:        envWithDefault("KOKOCLONE_DATA_DIR", "./data/kokoclone"),
			RepoDir:        envWithDefault("KOKOCLONE_REPO_DIR", "./data/kokoclone/repo"),
			RuntimeDir:     envWithDefault("KOKOCLONE_RUNTIME_DIR", "./data/kokoclone/runtime"),
			LangCode:       envWithDefault("KOKOCLONE_LANG_CODE", "en"),
			TimeoutSeconds: kokocloneTimeout,
		})

		return agents.NewSelectableTTSAgent(kokoroAgent, kokocloneAgent), nil
	case "mock":
		return agents.NewMockTTSAgent(), nil
	default:
		return nil, fmt.Errorf("unsupported TTS_PROVIDER %q", provider)
	}
}

func checkerFromEnv() (pipeline.VoiceChecker, error) {
	provider := strings.ToLower(envWithDefault("VOICE_CHECKER_PROVIDER", "qwen"))

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
