package main

import (
	"log/slog"
	"os"
	"strings"

	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

const maxSafeWorkerCount = 2

func pipelineServiceFromEnv(
	logger *slog.Logger,
	optimizer pipeline.VoiceOptimizer,
	ttsAgent pipeline.TTSAgent,
	checker pipeline.VoiceChecker,
) (*pipeline.Service, error) {
	segmentMaxRunes, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES", 300)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	segmentWorkers, err := envIntWithDefault("VOICE_SEGMENT_WORKERS", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	referenceWorkerCount, err := envIntWithDefault("KOKOCLONE_WORKER_COUNT", 2)
	if err != nil {
		logger.Error("invalid tts configuration", "error", err)
		return nil, err
	}
	studioSegmentWorkers, err := envIntWithDefault("VOICE_SEGMENT_WORKERS_STUDIO", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	studioSegmentMaxRunes, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES_STUDIO", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	studioSegmentWorkersAdaptive, err := envIntWithDefault("VOICE_SEGMENT_WORKERS_STUDIO_ADAPTIVE", 2)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	studioSegmentMaxRunesAdaptive, err := envIntWithDefault("VOICE_SEGMENT_MAX_RUNES_STUDIO_ADAPTIVE", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	sourcePrepSentenceMaxRunes, err := envIntWithDefault("VOICE_SOURCE_PREP_SENTENCE_MAX_RUNES", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	maxProfileBytes, err := envInt64WithDefault("VOICE_PROFILE_MAX_BYTES", 0)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	voiceProfileReferenceMaxSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_MAX_SECONDS", 60)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	voiceProfileReferenceMinSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_MIN_SECONDS", 20)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	voiceProfileReferenceTargetSeconds, err := envIntWithDefault("VOICE_PROFILE_REFERENCE_TARGET_SECONDS", 45)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	voiceProfileLikenessTimeoutSeconds, err := envIntWithDefault("VOICE_PROFILE_LIKENESS_TIMEOUT_SECONDS", 120)
	if err != nil {
		logger.Error("invalid pipeline configuration", "error", err)
		return nil, err
	}
	voiceProfileDiarizationToken := strings.TrimSpace(os.Getenv("PYANNOTE_AUTH_TOKEN"))
	if voiceProfileDiarizationToken == "" {
		voiceProfileDiarizationToken = strings.TrimSpace(os.Getenv("HF_TOKEN"))
	}
	bookPDFRequireTextExtractor, err := envBoolWithDefault("VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR", false)
	if err != nil {
		logger.Error("invalid book source configuration", "error", err)
		return nil, err
	}
	sourceURLAllowPrivate, err := envBoolWithDefault("VOICE_SOURCE_URL_ALLOW_PRIVATE", false)
	if err != nil {
		logger.Error("invalid source URL configuration", "error", err)
		return nil, err
	}
	alignmentEnabled, err := envBoolWithDefault("ALIGNMENT_ENABLED", false)
	if err != nil {
		logger.Error("invalid alignment configuration", "error", err)
		return nil, err
	}
	alignmentTimeoutSeconds, err := envIntWithDefault("ALIGNMENT_TIMEOUT_SECONDS", 120)
	if err != nil {
		logger.Error("invalid alignment configuration", "error", err)
		return nil, err
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
			VoiceProfileCredentialsPath:          envWithDefault("VOICE_PROFILE_CREDENTIALS_PATH", "./data/local-credentials/huggingface.json"),
			VoiceProfileAnalysisPythonPath:       envWithDefault("VOICE_PROFILE_ANALYSIS_PYTHON_PATH", "python3"),
			VoiceProfileAnalysisScriptPath:       envWithDefault("VOICE_PROFILE_ANALYSIS_SCRIPT_PATH", "./scripts/profile_analyze.py"),
			VoiceProfileAnalysisStrategyVersion:  envWithDefault("VOICE_PROFILE_ANALYSIS_STRATEGY_VERSION", "speaker-aware-v1"),
			VoiceProfileDenoiseProvider:          envWithDefault("VOICE_PROFILE_DENOISE_PROVIDER", "ffmpeg"),
			VoiceProfileDenoiseStrength:          envWithDefault("VOICE_PROFILE_DENOISE_STRENGTH", "balanced"),
			VoiceProfileEmbeddingModel:           envWithDefault("VOICE_PROFILE_EMBEDDING_MODEL", "pyannote/embedding"),
			VoiceProfileEmbeddingScriptPath:      envWithDefault("VOICE_PROFILE_EMBEDDING_SCRIPT_PATH", "./scripts/profile_likeness.py"),
			VoiceProfileLikenessCalibrationText:  envWithDefault("VOICE_PROFILE_LIKENESS_CALIBRATION_TEXT", "This is a short voice clone calibration sample for measuring speaker likeness."),
			VoiceProfileLikenessTimeoutSeconds:   voiceProfileLikenessTimeoutSeconds,
			VoiceProfileArtifactPythonPath:       envWithDefault("VOICE_PROFILE_ARTIFACT_PYTHON_PATH", "./.venv-voice-embed/bin/python"),
			VoiceProfileArtifactScriptPath:       envWithDefault("VOICE_PROFILE_ARTIFACT_SCRIPT_PATH", "./scripts/profile_embed_artifact.py"),
			VoiceProfileArtifactTimeoutSeconds:   envIntWithFallback("VOICE_PROFILE_ARTIFACT_TIMEOUT_SECONDS", 3600),
			VoiceProfileArtifactSteps:            envIntWithFallback("VOICE_PROFILE_ARTIFACT_STEPS", 0),
			ResearchModules:                      researchModuleConfigsFromEnv(),
			ResearchModulePromptDisabled:         envBoolWithFallback("RESEARCH_MODULE_PROMPT_DISABLED", false),
			ResearchModuleCloneTimeoutSeconds:    envIntWithFallback("RESEARCH_MODULE_CLONE_TIMEOUT_SECONDS", 180),
			Alignment: pipeline.AlignmentOptions{
				Enabled:                  alignmentEnabled,
				Mode:                     alignmentModeFromEnv(alignmentEnabled),
				Preferred:                alignmentPreferredFromEnv(),
				MFABin:                   envWithDefault("ALIGNMENT_MFA_BIN", "mfa"),
				MFADictionary:            strings.TrimSpace(os.Getenv("ALIGNMENT_MFA_DICTIONARY")),
				MFAAcousticModel:         strings.TrimSpace(os.Getenv("ALIGNMENT_MFA_ACOUSTIC_MODEL")),
				AeneasPython:             envWithDefault("ALIGNMENT_AENEAS_PYTHON", "python3"),
				GentleURL:                strings.TrimSpace(os.Getenv("ALIGNMENT_GENTLE_URL")),
				TimeoutSeconds:           alignmentTimeoutSeconds,
				RequiredForWordHighlight: envBoolWithFallback("ALIGNMENT_REQUIRED_FOR_WORD_HIGHLIGHT", false),
			},
			DefaultTTSEngine: defaultTTSEngineFromEnv(),
			TTSEngines:       ttsEngineRegistrationsFromEnv(ttsAgent),
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

	return service, nil
}
