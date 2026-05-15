package pipeline

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/audio"
)

const (
	normalizedProfileSourceFilename = "source.wav"
	cleanedProfileSourceFilename    = "source.cleaned.wav"
	sourceMetadataFilename          = "analysis.json"
	profileReferenceVersion         = "v1"
	minCandidateSpanDurationMS      = 1000
	dynamicShortReferenceMinMS      = 8000
	previewDurationMS               = 6000
	referenceCrossfadeMS            = 30
	denoiseFastPathNoiseRisk        = 0.045
)

type VoiceProfileSourceAnalyzer interface {
	AnalyzeVoiceProfileSource(context.Context, VoiceProfileSourceAnalysisRequest) (VoiceProfileSourceAnalysisResult, error)
}

type VoiceProfileSourceAnalysisRequest struct {
	SourceID        string
	NormalizedPath  string
	Model           string
	Token           string
	StrategyVersion string
}

type DetectedSpeakerSpan struct {
	SpeakerID  string  `json:"speakerId"`
	StartMS    int     `json:"startMs"`
	EndMS      int     `json:"endMs"`
	Confidence float64 `json:"confidence"`
}

type VoiceProfileSourceAnalysisResult struct {
	ModelVersion string                `json:"modelVersion"`
	Spans        []DetectedSpeakerSpan `json:"spans"`
}

type VoiceProfileSourceDiagnostics struct {
	Mode                string `json:"mode"`
	Model               string `json:"model"`
	ModelPath           string `json:"modelPath,omitempty"`
	LocalModelDir       string `json:"localModelDir,omitempty"`
	PythonPath          string `json:"pythonPath"`
	TokenConfigured     bool   `json:"tokenConfigured"`
	LocalModelAvailable bool   `json:"localModelAvailable"`
	FFmpegAvailable     bool   `json:"ffmpegAvailable"`
	SetupMessage        string `json:"setupMessage"`
}

type storedVoiceProfileSource struct {
	VoiceProfileSource
}

type pythonProfileSourceAnalyzer struct {
	pythonPath    string
	scriptPath    string
	model         string
	modelPath     string
	localModelDir string
	token         string
	strategy      string
}

func newPythonProfileSourceAnalyzer(options Options) VoiceProfileSourceAnalyzer {
	return pythonProfileSourceAnalyzer{
		pythonPath:    strings.TrimSpace(options.VoiceProfileAnalysisPythonPath),
		scriptPath:    strings.TrimSpace(options.VoiceProfileAnalysisScriptPath),
		model:         strings.TrimSpace(options.VoiceProfileDiarizationModel),
		modelPath:     strings.TrimSpace(options.VoiceProfileDiarizationModelPath),
		localModelDir: strings.TrimSpace(options.VoiceProfileDiarizationLocalModelDir),
		token:         strings.TrimSpace(options.VoiceProfileDiarizationToken),
		strategy:      strings.TrimSpace(options.VoiceProfileAnalysisStrategyVersion),
	}
}

func (analyzer pythonProfileSourceAnalyzer) AnalyzeVoiceProfileSource(
	ctx context.Context,
	request VoiceProfileSourceAnalysisRequest,
) (VoiceProfileSourceAnalysisResult, error) {
	model := strings.TrimSpace(request.Model)
	if model == "" {
		model = analyzer.model
	}
	if model == "" {
		model = defaultVoiceProfileDiarizationModel
	}

	model, isLocalModel := resolveLocalDiarizationModelPath(
		model,
		analyzer.modelPath,
		analyzer.localModelDir,
	)
	token := strings.TrimSpace(request.Token)
	if token == "" {
		token = analyzer.token
	}
	if token == "" && !isLocalModel {
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf(
			"%w: configure PYANNOTE_AUTH_TOKEN/HF_TOKEN once or set VOICE_PROFILE_DIARIZATION_MODEL_PATH to a local pyannote Community-1 checkout",
			ErrProfileAnalysisUnavailable,
		)
	}

	pythonPath := strings.TrimSpace(analyzer.pythonPath)
	if pythonPath == "" {
		pythonPath = defaultVoiceProfileAnalysisPythonPath
	}
	scriptPath := strings.TrimSpace(analyzer.scriptPath)
	if scriptPath == "" {
		scriptPath = defaultVoiceProfileAnalysisScriptPath
	}
	strategy := strings.TrimSpace(request.StrategyVersion)
	if strategy == "" {
		strategy = analyzer.strategy
	}
	if strategy == "" {
		strategy = defaultVoiceProfileAnalysisStrategyVersion
	}

	command := exec.CommandContext(
		ctx,
		pythonPath,
		scriptPath,
		"--audio",
		request.NormalizedPath,
		"--model",
		model,
		"--strategy-version",
		strategy,
	)
	command.Env = append(os.Environ(), "PYANNOTE_METRICS_ENABLED=0", "PYANNOTE_AUTH_TOKEN="+token)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	err := command.Run()
	if err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = strings.TrimSpace(stdout.String())
		}
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf(
			"profile analysis script failed: %w: %s",
			err,
			detail,
		)
	}

	var result VoiceProfileSourceAnalysisResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf("parse profile analysis output: %w", err)
	}
	if strings.TrimSpace(result.ModelVersion) == "" {
		result.ModelVersion = model
	}
	return result, nil
}

func (service *Service) GetVoiceProfileSourceDiagnostics() VoiceProfileSourceDiagnostics {
	model := strings.TrimSpace(service.options.VoiceProfileDiarizationModel)
	if model == "" {
		model = defaultVoiceProfileDiarizationModel
	}
	modelPath, isLocalModel := resolveLocalDiarizationModelPath(
		model,
		service.options.VoiceProfileDiarizationModelPath,
		service.options.VoiceProfileDiarizationLocalModelDir,
	)
	_, ffmpegErr := exec.LookPath("ffmpeg")
	tokenConfigured := strings.TrimSpace(service.options.VoiceProfileDiarizationToken) != ""
	mode := "unconfigured"
	setupMessage := "Install pyannote.audio and configure PYANNOTE_AUTH_TOKEN/HF_TOKEN, or set VOICE_PROFILE_DIARIZATION_MODEL_PATH to a local Community-1 checkout."
	if isLocalModel {
		mode = "local"
		setupMessage = "Using a local pyannote model path. Diarization runs locally without contacting Hugging Face."
	} else if tokenConfigured {
		mode = "local-download"
		setupMessage = "Using Hugging Face access for local pyannote execution. Cache or clone the model to run fully offline."
	}

	return VoiceProfileSourceDiagnostics{
		Mode:                mode,
		Model:               model,
		ModelPath:           modelPath,
		LocalModelDir:       strings.TrimSpace(service.options.VoiceProfileDiarizationLocalModelDir),
		PythonPath:          strings.TrimSpace(service.options.VoiceProfileAnalysisPythonPath),
		TokenConfigured:     tokenConfigured,
		LocalModelAvailable: isLocalModel,
		FFmpegAvailable:     ffmpegErr == nil,
		SetupMessage:        setupMessage,
	}
}

func resolveLocalDiarizationModelPath(model string, modelPath string, localModelDir string) (string, bool) {
	if existing := existingPath(modelPath); existing != "" {
		return existing, true
	}
	if existing := existingPath(model); existing != "" {
		return existing, true
	}
	localDir := strings.TrimSpace(localModelDir)
	if localDir == "" {
		return model, false
	}
	candidates := []string{
		filepath.Join(localDir, sanitizeModelPathPart(model)),
		filepath.Join(localDir, filepath.Base(model)),
	}
	for _, candidate := range candidates {
		if existing := existingPath(candidate); existing != "" {
			return existing, true
		}
	}
	return model, false
}

func existingPath(path string) string {
	clean := strings.TrimSpace(path)
	if clean == "" {
		return ""
	}
	info, err := os.Stat(clean)
	if err != nil || !info.IsDir() {
		return ""
	}
	abs, err := filepath.Abs(clean)
	if err != nil {
		return clean
	}
	return abs
}

func sanitizeModelPathPart(model string) string {
	clean := strings.Trim(strings.TrimSpace(model), "/")
	if clean == "" {
		return "model"
	}
	replacer := strings.NewReplacer("/", "__", "\\", "__", ":", "_")
	return replacer.Replace(clean)
}

func (service *Service) CreateVoiceProfileSource(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
) (VoiceProfileSource, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if service.options.MaxProfileBytes > 0 && sourceBytes > service.options.MaxProfileBytes {
		return VoiceProfileSource{}, fmt.Errorf("%w", ErrProfileTooLarge)
	}

	audioInfo, err := inspectAudioFile(sourcePath)
	if err != nil {
		return VoiceProfileSource{}, fmt.Errorf("validate uploaded profile source: %w", err)
	}
	if !audioInfo.hasAudio {
		return VoiceProfileSource{}, ErrProfileMissingAudio
	}

	fileInfo, err := os.Stat(sourcePath)
	if err != nil {
		return VoiceProfileSource{}, err
	}
	if sourceBytes <= 0 {
		sourceBytes = fileInfo.Size()
	}

	sourceID := newID()
	now := time.Now().UTC()
	outputDir, err := filepath.Abs(filepath.Join(service.options.VoiceProfileSourceDir, sourceID))
	if err != nil {
		return VoiceProfileSource{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return VoiceProfileSource{}, err
	}

	originalPath := filepath.Join(outputDir, "upload"+filepath.Ext(sourceFileName))
	if err := copyFile(sourcePath, originalPath); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfileSource{}, fmt.Errorf("store uploaded profile source: %w", err)
	}

	source := storedVoiceProfileSource{
		VoiceProfileSource: VoiceProfileSource{
			ID:               sourceID,
			Status:           VoiceProfileSourceStatusQueued,
			SourceFile:       sourceFileName,
			SourceBytes:      sourceBytes,
			SourceDurationMS: audioInfo.durationMS,
			AudioFormat:      "audio/wav",
			ProgressMessage:  "Queued for source analysis",
			ProgressDetail:   "Waiting to normalize uploaded media.",
			Stages:           initialVoiceProfileSourceStages(),
			Candidates:       []VoiceProfileCandidate{},
			StrategyVersion:  service.options.VoiceProfileAnalysisStrategyVersion,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
	}
	service.updateVoiceProfileSource(source)
	_ = service.writeVoiceProfileSourceMetadata(source.VoiceProfileSource)

	go service.runVoiceProfileSourceAnalysis(context.Background(), sourceID, originalPath, audioInfo.streamIndex)

	return source.VoiceProfileSource, nil
}

func (service *Service) GetVoiceProfileSource(id string) (VoiceProfileSource, error) {
	service.mu.RLock()
	source, ok := service.sources[id]
	service.mu.RUnlock()
	if !ok {
		return VoiceProfileSource{}, ErrProfileSourceNotFound
	}
	return source.VoiceProfileSource, nil
}

func (service *Service) GetVoiceProfileCandidatePreview(
	sourceID string,
	candidateID string,
	kind string,
) ([]byte, string, error) {
	source, candidate, err := service.getVoiceProfileSourceCandidate(sourceID, candidateID)
	if err != nil {
		return nil, "", err
	}
	previewPath := candidatePreviewPath(candidate, kind)
	if source.ID == "" || strings.TrimSpace(previewPath) == "" {
		return nil, "", ErrAudioNotReady
	}

	audioBytes, err := os.ReadFile(previewPath)
	if err != nil {
		return nil, "", fmt.Errorf("read profile candidate preview: %w", err)
	}
	return audioBytes, "audio/wav", nil
}

func (service *Service) CreateVoiceProfileFromCandidate(
	ctx context.Context,
	sourceID string,
	candidateID string,
	name string,
	language string,
) (VoiceProfile, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	source, candidate, err := service.getVoiceProfileSourceCandidate(sourceID, candidateID)
	if err != nil {
		return VoiceProfile{}, err
	}
	if candidate.Status != "ready" || strings.TrimSpace(candidate.ReferencePath) == "" {
		return VoiceProfile{}, fmt.Errorf("voice profile candidate is not ready: %s", candidateID)
	}

	cleanName := strings.TrimSpace(name)
	if cleanName == "" {
		cleanName = candidate.SuggestedName
	}
	if cleanName == "" {
		cleanName = "Custom voice"
	}
	cleanLanguage := strings.TrimSpace(language)
	if cleanLanguage == "" {
		cleanLanguage = "en"
	}

	select {
	case <-ctx.Done():
		return VoiceProfile{}, ctx.Err()
	default:
	}

	profileID := newID()
	outputDir, err := filepath.Abs(filepath.Join(service.options.VoiceProfileDir, profileID))
	if err != nil {
		return VoiceProfile{}, err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return VoiceProfile{}, err
	}

	referencePath := filepath.Join(outputDir, "reference.wav")
	if err := copyFile(candidate.ReferencePath, referencePath); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, fmt.Errorf("copy selected profile reference: %w", err)
	}
	referenceDurationMS, err := audioDurationMilliseconds(referencePath)
	if err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, fmt.Errorf("inspect selected profile reference: %w", err)
	}
	if referenceDurationMS <= 0 {
		referenceDurationMS = candidate.ReferenceDurationMS
	}

	now := time.Now().UTC()
	qualityMetrics := candidate.QualityMetrics
	profile := storedVoiceProfile{
		VoiceProfile: VoiceProfile{
			ID:                      profileID,
			Name:                    cleanName,
			Language:                cleanLanguage,
			SourceFile:              source.SourceFile,
			SourceBytes:             source.SourceBytes,
			SourceID:                source.ID,
			SpeakerID:               candidate.SpeakerID,
			SpeakerName:             cleanName,
			SourceDurationMS:        source.SourceDurationMS,
			ReferenceAudio:          filepath.Base(referencePath),
			ReferencePath:           referencePath,
			ReferenceDurationMS:     referenceDurationMS,
			ReferenceTrimmed:        source.SourceDurationMS > referenceDurationMS+500 || len(candidate.Spans) > 1,
			ReferenceSampleStrategy: candidate.ReferenceSampleStrategy,
			ReferenceVersion:        candidate.ReferenceVersion,
			ReferenceScore:          candidate.Score,
			ReferenceSpans:          candidate.Spans,
			QualityMetrics:          &qualityMetrics,
			Denoise:                 candidate.Denoise,
			AudioFormat:             "audio/wav",
			Status:                  VoiceProfileStatusReady,
			DurationMS:              referenceDurationMS,
			CreatedAt:               now,
			UpdatedAt:               now,
			ReferenceSamples:        candidate.ReferenceAudio,
		},
	}
	likeness := service.measureVoiceProfileLikeness(ctx, profile.VoiceProfile, outputDir)
	profile.Likeness = &likeness

	metadataPath := filepath.Join(outputDir, "profile.json")
	if err := writeJSON(metadataPath, profile.VoiceProfile); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, err
	}

	service.updateVoiceProfile(profile)
	return profile.VoiceProfile, nil
}

func (service *Service) measureVoiceProfileLikeness(
	ctx context.Context,
	profile VoiceProfile,
	outputDir string,
) VoiceProfileLikeness {
	calibrationText := strings.TrimSpace(service.options.VoiceProfileLikenessCalibrationText)
	if calibrationText == "" {
		calibrationText = defaultVoiceProfileLikenessCalibrationText
	}
	withReference, ok := service.tts.(TTSWithReference)
	if !ok {
		return pendingVoiceProfileLikeness(
			"Current TTS provider does not support reference synthesis for calibration.",
			calibrationText,
		)
	}
	if service.options.VoiceProfileLikenessScorer == nil {
		return pendingVoiceProfileLikeness("No local speaker-embedding scorer is configured.", calibrationText)
	}
	likenessCtx, cancel := context.WithTimeout(
		ctx,
		time.Duration(service.options.VoiceProfileLikenessTimeoutSeconds)*time.Second,
	)
	defer cancel()

	result, err := withReference.SynthesizeWithReference(
		likenessCtx,
		calibrationText,
		profile.ReferencePath,
		profile.Language,
	)
	if err != nil {
		return failedVoiceProfileLikeness(
			fmt.Sprintf("Calibration synthesis failed: %s", err.Error()),
			calibrationText,
		)
	}
	calibrationPath := filepath.Join(outputDir, "likeness-calibration.wav")
	if err := os.WriteFile(calibrationPath, result.Audio, 0o644); err != nil {
		return failedVoiceProfileLikeness(
			fmt.Sprintf("Write calibration audio failed: %s", err.Error()),
			calibrationText,
		)
	}

	score, err := service.options.VoiceProfileLikenessScorer.ScoreVoiceProfileLikeness(
		likenessCtx,
		VoiceProfileLikenessRequest{
			ReferencePath: profile.ReferencePath,
			GeneratedPath: calibrationPath,
			Model:         service.options.VoiceProfileEmbeddingModel,
			Token:         service.options.VoiceProfileDiarizationToken,
		},
	)
	if err != nil {
		return failedVoiceProfileLikeness(
			fmt.Sprintf("Speaker likeness scoring failed: %s", err.Error()),
			calibrationText,
		)
	}
	return readyVoiceProfileLikeness(score, calibrationText)
}

func (service *Service) runVoiceProfileSourceAnalysis(
	ctx context.Context,
	sourceID string,
	originalPath string,
	audioStreamIndex int,
) {
	outputDir := filepath.Dir(originalPath)
	normalizedPath := filepath.Join(outputDir, normalizedProfileSourceFilename)
	cleanedPath := filepath.Join(outputDir, cleanedProfileSourceFilename)

	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusNormalizing
		source.ProgressMessage = "Normalizing uploaded source"
		source.ProgressDetail = "Converting source media into analysis-ready PCM WAV."
		updateVoiceProfileSourceStage(source, "normalize", "running", "Preparing source audio.")
	})

	sourceDurationMS, err := normalizeProfileSourceAudio(ctx, originalPath, normalizedPath, audioStreamIndex)
	if err != nil {
		service.failVoiceProfileSource(sourceID, fmt.Errorf("normalize source audio: %w", err))
		return
	}

	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusNormalizing
		if sourceDurationMS > 0 {
			source.SourceDurationMS = sourceDurationMS
		}
		source.NormalizedAudio = normalizedProfileSourceFilename
		source.NormalizedPath = normalizedPath
		source.AudioFormat = "audio/wav"
		source.ProgressMessage = "Cleaning source audio"
		source.ProgressDetail = "Removing steady background noise before speaker analysis."
		updateVoiceProfileSourceStage(source, "normalize", "done", "Source audio is normalized.")
		updateVoiceProfileSourceStage(source, "denoise", "running", "Cleaning background noise.")
	})

	denoiseMetadata, err := denoiseProfileSourceAudio(
		ctx,
		normalizedPath,
		cleanedPath,
		service.options.VoiceProfileDenoiseProvider,
		service.options.VoiceProfileDenoiseStrength,
	)
	if err != nil {
		service.failVoiceProfileSource(sourceID, fmt.Errorf("denoise source audio: %w", err))
		return
	}

	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusAnalyzing
		if sourceDurationMS > 0 {
			source.SourceDurationMS = sourceDurationMS
		}
		source.NormalizedAudio = normalizedProfileSourceFilename
		source.NormalizedPath = normalizedPath
		source.CleanedAudio = cleanedProfileSourceFilename
		source.CleanedPath = cleanedPath
		source.Denoise = &denoiseMetadata
		source.AudioFormat = "audio/wav"
		source.ProgressMessage = "Detecting speakers"
		source.ProgressDetail = "Running local pyannote diarization over the cleaned source."
		updateVoiceProfileSourceStage(source, "denoise", "done", denoiseMetadata.Reason)
		updateVoiceProfileSourceStage(source, "analyze", "running", "Detecting speaker turns.")
	})

	result, err := service.options.VoiceProfileSourceAnalyzer.AnalyzeVoiceProfileSource(
		ctx,
		VoiceProfileSourceAnalysisRequest{
			SourceID:        sourceID,
			NormalizedPath:  cleanedPath,
			Model:           service.options.VoiceProfileDiarizationModel,
			Token:           service.options.VoiceProfileDiarizationToken,
			StrategyVersion: service.options.VoiceProfileAnalysisStrategyVersion,
		},
	)
	if err != nil {
		service.failVoiceProfileSource(sourceID, err)
		return
	}

	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusScoring
		source.ProgressMessage = "Scoring voice candidates"
		source.ProgressDetail = "Selecting clean, single-speaker material for clone references."
		source.ModelVersion = result.ModelVersion
		updateVoiceProfileSourceStage(source, "analyze", "done", "Speaker turns detected.")
		updateVoiceProfileSourceStage(source, "score", "running", "Building candidate references.")
	})

	candidates, err := buildVoiceProfileCandidates(
		normalizedPath,
		cleanedPath,
		outputDir,
		sourceID,
		result,
		service.options,
		denoiseMetadata,
	)
	if err != nil {
		service.failVoiceProfileSource(sourceID, fmt.Errorf("build voice candidates: %w", err))
		return
	}
	readyCount := 0
	for _, candidate := range candidates {
		if candidate.Status == "ready" {
			readyCount += 1
		}
	}
	if readyCount == 0 {
		service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
			source.Candidates = candidates
		})
		service.failVoiceProfileSource(sourceID, errors.New("no usable speaker candidates found"))
		return
	}

	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusReady
		source.ProgressMessage = "Voice candidates ready"
		source.ProgressDetail = fmt.Sprintf("%d speaker candidates are ready for review.", readyCount)
		source.Candidates = candidates
		updateVoiceProfileSourceStage(source, "score", "done", "Candidate references built.")
		source.UpdatedAt = time.Now().UTC()
	})
}

func normalizeProfileSourceAudio(
	ctx context.Context,
	inputPath string,
	outputPath string,
	audioStreamIndex int,
) (int, error) {
	copied, durationMS, err := tryCopyNormalizedPCM16WAV(inputPath, outputPath)
	if err != nil {
		return 0, err
	}
	if copied {
		return durationMS, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return 0, fmt.Errorf("ffmpeg is required to normalize this media source: %w", err)
	}

	baseArgs := []string{
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-y",
		"-i",
		inputPath,
		"-vn",
		"-acodec",
		"pcm_s16le",
		"-ac",
		"1",
		"-ar",
		"24000",
		"-f",
		"wav",
	}
	attempts := make([]string, 0, 2)
	if audioStreamIndex >= 0 {
		attempts = append(attempts, fmt.Sprintf("0:%d", audioStreamIndex))
	}
	attempts = append(attempts, "")

	var lastErr error
	for _, audioMap := range attempts {
		commandArgs := make([]string, 0, len(baseArgs)+3)
		commandArgs = append(commandArgs, baseArgs...)
		if audioMap != "" {
			commandArgs = append(commandArgs, "-map", audioMap)
		}
		commandArgs = append(commandArgs, outputPath)

		output, err := exec.CommandContext(ctx, "ffmpeg", commandArgs...).CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("ffmpeg normalization failed with map %q: %w: %s", audioMap, err, strings.TrimSpace(string(output)))
			_ = os.Remove(outputPath)
			continue
		}
		stat, statErr := os.Stat(outputPath)
		if statErr == nil && stat.Size() > 0 {
			return audioDurationMilliseconds(outputPath)
		}
		if statErr == nil {
			lastErr = fmt.Errorf("ffmpeg normalization produced empty output with map %q", audioMap)
			_ = os.Remove(outputPath)
			continue
		}
		lastErr = fmt.Errorf("ffmpeg normalization output not available with map %q: %w", audioMap, statErr)
	}
	if lastErr == nil {
		lastErr = errors.New("ffmpeg normalization completed without output")
	}
	return 0, lastErr
}

func tryCopyNormalizedPCM16WAV(inputPath string, outputPath string) (bool, int, error) {
	header := make([]byte, 12)
	source, err := os.Open(inputPath)
	if err != nil {
		return false, 0, err
	}
	readCount, readErr := io.ReadFull(source, header)
	_ = source.Close()
	if readErr != nil || readCount < len(header) {
		return false, 0, nil
	}
	if string(header[0:4]) != "RIFF" || string(header[8:12]) != "WAVE" {
		return false, 0, nil
	}

	raw, err := os.ReadFile(inputPath)
	if err != nil {
		return false, 0, err
	}
	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return false, 0, nil
	}
	if spec.SampleRate != 24000 || spec.ChannelCount != 1 || spec.BitsPerSample != 16 {
		return false, 0, nil
	}

	return true, audio.DurationMSForWAVData(len(data), spec), copyFile(inputPath, outputPath)
}

func denoiseProfileSourceAudio(
	ctx context.Context,
	rawPath string,
	cleanPath string,
	provider string,
	strength string,
) (VoiceProfileDenoiseMetadata, error) {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		provider = defaultVoiceProfileDenoiseProvider
	}
	strength = strings.ToLower(strings.TrimSpace(strength))
	if strength == "" {
		strength = defaultVoiceProfileDenoiseStrength
	}

	before := pcmNoiseSummaryForPath(rawPath)
	metadata := VoiceProfileDenoiseMetadata{
		Provider:        provider,
		Strength:        strength,
		RawAudio:        normalizedProfileSourceFilename,
		CleanAudio:      cleanedProfileSourceFilename,
		RawPath:         rawPath,
		CleanPath:       cleanPath,
		NoiseRiskBefore: before.noiseRisk,
		SNRBeforeDB:     approximateSNRDB(before.noiseRisk),
	}

	if provider == "none" {
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Denoise disabled; using normalized audio for analysis."
		return metadata, nil
	}
	if provider == "ffmpeg" && strength != "strong" && before.noiseRisk <= denoiseFastPathNoiseRisk {
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Applied = false
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Source already measures clean; skipped denoise to preserve speech detail."
		return metadata, nil
	}
	if provider != "ffmpeg" {
		metadata.Warnings = append(metadata.Warnings, fmt.Sprintf("Unknown denoise provider %q; using normalized audio.", provider))
		if err := copyFile(rawPath, cleanPath); err != nil {
			return metadata, err
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Provider = "none"
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "Denoise provider was not recognized."
		return metadata, nil
	}

	if _, err := exec.LookPath("ffmpeg"); err != nil {
		metadata.Warnings = append(metadata.Warnings, "ffmpeg was not available, so denoise fell back to normalized audio.")
		if copyErr := copyFile(rawPath, cleanPath); copyErr != nil {
			return metadata, copyErr
		}
		after := pcmNoiseSummaryForPath(cleanPath)
		metadata.Applied = false
		metadata.NoiseRiskAfter = after.noiseRisk
		metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
		metadata.Reason = "ffmpeg denoise unavailable; using normalized audio."
		return metadata, nil
	}

	var lastErr error
	for _, filter := range denoiseFilterCandidates(strength) {
		args := []string{
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-i",
			rawPath,
			"-af",
			filter,
			"-acodec",
			"pcm_s16le",
			"-ac",
			"1",
			"-ar",
			"24000",
			"-f",
			"wav",
			cleanPath,
		}
		output, err := exec.CommandContext(ctx, "ffmpeg", args...).CombinedOutput()
		if err != nil {
			lastErr = fmt.Errorf("ffmpeg denoise failed: %w: %s", err, strings.TrimSpace(string(output)))
			_ = os.Remove(cleanPath)
			continue
		}
		if stat, statErr := os.Stat(cleanPath); statErr == nil && stat.Size() > 0 {
			after := pcmNoiseSummaryForPath(cleanPath)
			metadata.Applied = true
			metadata.NoiseRiskAfter = after.noiseRisk
			metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
			metadata.Reason = "Applied conservative local ffmpeg denoise before speaker analysis."
			return metadata, nil
		}
		lastErr = errors.New("ffmpeg denoise produced empty output")
		_ = os.Remove(cleanPath)
	}

	metadata.Warnings = append(metadata.Warnings, "ffmpeg denoise failed, so analysis used normalized audio.")
	if lastErr != nil {
		metadata.Warnings = append(metadata.Warnings, lastErr.Error())
	}
	if err := copyFile(rawPath, cleanPath); err != nil {
		return metadata, err
	}
	after := pcmNoiseSummaryForPath(cleanPath)
	metadata.Applied = false
	metadata.NoiseRiskAfter = after.noiseRisk
	metadata.SNRAfterDB = approximateSNRDB(after.noiseRisk)
	metadata.Reason = "Denoise fallback used normalized audio."
	return metadata, nil
}

func denoiseFilterCandidates(strength string) []string {
	switch strength {
	case "gentle":
		return []string{
			"highpass=f=65,lowpass=f=9500,afftdn=nf=-30,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=65,lowpass=f=9500,loudnorm=I=-18:TP=-2:LRA=11",
		}
	case "strong":
		return []string{
			"highpass=f=90,lowpass=f=8000,afftdn=nf=-20,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=90,lowpass=f=8000,loudnorm=I=-18:TP=-2:LRA=11",
		}
	default:
		return []string{
			"highpass=f=70,lowpass=f=9000,afftdn=nf=-25,loudnorm=I=-18:TP=-2:LRA=11",
			"highpass=f=70,lowpass=f=9000,loudnorm=I=-18:TP=-2:LRA=11",
		}
	}
}

type pcmNoiseSummary struct {
	noiseRisk float64
}

func pcmNoiseSummaryForPath(path string) pcmNoiseSummary {
	raw, err := os.ReadFile(path)
	if err != nil {
		return pcmNoiseSummary{noiseRisk: 1}
	}
	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return pcmNoiseSummary{noiseRisk: 1}
	}
	durationMS := audio.DurationMSForWAVData(len(data), spec)
	rms, silenceRatio, _ := pcmStatsForSpan(data, spec, 0, durationMS)
	return pcmNoiseSummary{noiseRisk: estimateNoiseRisk(rms, silenceRatio)}
}

func approximateSNRDB(noiseRisk float64) float64 {
	return math.Round((6+30*(1-clamp01(noiseRisk)))*10) / 10
}

type candidateSpanScore struct {
	span         DetectedSpeakerSpan
	durationMS   int
	score        float64
	rms          float64
	silenceRatio float64
	clippingRisk float64
	noiseRisk    float64
}

func buildVoiceProfileCandidates(
	rawPath string,
	cleanPath string,
	outputDir string,
	sourceID string,
	result VoiceProfileSourceAnalysisResult,
	options Options,
	denoiseMetadata VoiceProfileDenoiseMetadata,
) ([]VoiceProfileCandidate, error) {
	rawBytes, err := os.ReadFile(rawPath)
	if err != nil {
		return nil, err
	}
	rawSpec, rawData, err := audio.ParsePCM16WAV(rawBytes)
	if err != nil {
		return nil, err
	}
	cleanBytes, err := os.ReadFile(cleanPath)
	if err != nil {
		return nil, err
	}
	spec, data, err := audio.ParsePCM16WAV(cleanBytes)
	if err != nil {
		return nil, err
	}
	sourceDurationMS := audio.DurationMSForWAVData(len(data), spec)
	if sourceDurationMS <= 0 {
		sourceDurationMS = audio.DurationMSForWAVData(len(rawData), rawSpec)
	}

	spansBySpeaker := map[string][]DetectedSpeakerSpan{}
	for _, span := range result.Spans {
		speakerID := strings.TrimSpace(span.SpeakerID)
		if speakerID == "" {
			continue
		}
		if span.EndMS <= span.StartMS {
			continue
		}
		spansBySpeaker[speakerID] = append(spansBySpeaker[speakerID], span)
	}
	speakerIDs := make([]string, 0, len(spansBySpeaker))
	for speakerID := range spansBySpeaker {
		speakerIDs = append(speakerIDs, speakerID)
	}
	sort.Strings(speakerIDs)

	now := time.Now().UTC()
	candidates := make([]VoiceProfileCandidate, 0, len(speakerIDs))
	for index, speakerID := range speakerIDs {
		scoredSpans := scoreSpeakerSpans(spansBySpeaker[speakerID], result.Spans, spec, data)
		totalSpeechMS := 0
		for _, scored := range scoredSpans {
			totalSpeechMS += scored.durationMS
		}
		candidateID := sanitizeCandidateID(speakerID, index)
		candidateDir := filepath.Join(outputDir, "candidates", candidateID)
		candidate := VoiceProfileCandidate{
			ID:                      candidateID,
			SpeakerID:               speakerID,
			SuggestedName:           fmt.Sprintf("Voice %d", index+1),
			Status:                  "rejected",
			Suitability:             "rejected",
			Reason:                  "not enough clean single-speaker speech",
			ReferenceVersion:        profileReferenceVersion,
			ReferenceSampleStrategy: "speaker-aware-best-spans",
			StrategyVersion:         options.VoiceProfileAnalysisStrategyVersion,
			ModelVersion:            result.ModelVersion,
			TotalSpeechDurationMS:   totalSpeechMS,
			Denoise:                 cloneDenoiseMetadata(denoiseMetadata),
			CreatedAt:               now,
			UpdatedAt:               now,
		}

		maxReferenceMS := max(1000, options.VoiceProfileReferenceMaxSeconds*1000)
		preferredMinReferenceMS := min(options.VoiceProfileReferenceMinSeconds*1000, maxReferenceMS)
		targetReferenceMS := clampInt(
			options.VoiceProfileReferenceTargetSeconds*1000,
			preferredMinReferenceMS,
			maxReferenceMS,
		)
		selected, metrics := selectCandidateSpans(
			scoredSpans,
			sourceDurationMS,
			preferredMinReferenceMS,
			targetReferenceMS,
			maxReferenceMS,
		)
		candidate.Spans = selected
		candidate.QualityMetrics = metrics
		candidate.QualityMetrics.NoiseRiskBefore = denoiseMetadata.NoiseRiskBefore
		candidate.QualityMetrics.NoiseRiskAfter = denoiseMetadata.NoiseRiskAfter
		candidate.Score = scoreVoiceProfileCandidate(metrics, preferredMinReferenceMS, targetReferenceMS)
		candidate.ReferenceDurationMS = metrics.UsableDurationMS
		candidate.ReferenceSpanCount = len(selected)
		shortReferenceMinMS := shortReferenceMinimumMS(sourceDurationMS, preferredMinReferenceMS)
		meetsPreferredDuration := metrics.UsableDurationMS >= preferredMinReferenceMS
		meetsShortDuration := metrics.UsableDurationMS >= shortReferenceMinMS
		if !meetsPreferredDuration &&
			(!meetsShortDuration ||
				!isStrongShortReference(metrics, sourceDurationMS, preferredMinReferenceMS)) {
			candidate.Reason = fmt.Sprintf(
				"needs at least %ds of clean speech or a high-quality short reference; found %s",
				preferredMinReferenceMS/1000,
				formatDurationMS(metrics.UsableDurationMS),
			)
			candidates = append(candidates, candidate)
			continue
		}

		if err := os.MkdirAll(candidateDir, 0o755); err != nil {
			return nil, err
		}
		referencePCM := buildReferencePCM(data, spec, selected)
		if len(referencePCM) == 0 {
			candidate.Reason = "selected spans produced empty reference audio"
			candidates = append(candidates, candidate)
			continue
		}
		referenceAudio := fmt.Sprintf("reference-%s.wav", profileReferenceVersion)
		referencePath := filepath.Join(candidateDir, referenceAudio)
		referenceBytes := audio.BuildPCM16WAV(referencePCM, spec)
		if err := os.WriteFile(referencePath, referenceBytes, 0o644); err != nil {
			return nil, err
		}

		previewPath := filepath.Join(candidateDir, "preview.wav")
		previewPCM := trimPCMToDuration(referencePCM, spec, previewDurationMS)
		if err := os.WriteFile(previewPath, audio.BuildPCM16WAV(previewPCM, spec), 0o644); err != nil {
			return nil, err
		}
		rawPreviewPath := filepath.Join(candidateDir, "preview.raw.wav")
		rawReferencePCM := buildReferencePCM(rawData, rawSpec, selected)
		rawPreviewPCM := trimPCMToDuration(rawReferencePCM, rawSpec, previewDurationMS)
		if len(rawPreviewPCM) > 0 {
			if err := os.WriteFile(rawPreviewPath, audio.BuildPCM16WAV(rawPreviewPCM, rawSpec), 0o644); err != nil {
				return nil, err
			}
		}

		candidate.Status = "ready"
		candidate.Suitability = "recommended"
		candidate.Reason = "clean single-speaker reference is ready"
		if len(selected) > 1 {
			candidate.Warnings = append(
				candidate.Warnings,
				fmt.Sprintf("Stitched %d clean same-speaker spans with short crossfades.", len(selected)),
			)
		}
		if candidate.Denoise != nil {
			candidate.Warnings = append(candidate.Warnings, candidate.Denoise.Warnings...)
		}
		if !meetsPreferredDuration {
			candidate.Suitability = "short_reference"
			candidate.Reason = "high-quality short reference is ready"
			candidate.Warnings = append(
				candidate.Warnings,
				fmt.Sprintf(
					"Short reference: %s is below the preferred %ds minimum.",
					formatDurationMS(candidate.ReferenceDurationMS),
					preferredMinReferenceMS/1000,
				),
			)
		}
		candidate.ReferenceAudio = referenceAudio
		candidate.ReferencePath = referencePath
		candidate.PreviewAudio = fmt.Sprintf(
			"/api/voice-profile-sources/%s/candidates/%s/preview.wav",
			sourceID,
			candidateID,
		)
		candidate.PreviewPath = previewPath
		candidate.CleanPreviewAudio = fmt.Sprintf(
			"/api/voice-profile-sources/%s/candidates/%s/preview.wav?kind=clean",
			sourceID,
			candidateID,
		)
		candidate.CleanPreviewPath = previewPath
		if len(rawPreviewPCM) > 0 {
			candidate.RawPreviewAudio = fmt.Sprintf(
				"/api/voice-profile-sources/%s/candidates/%s/preview.wav?kind=raw",
				sourceID,
				candidateID,
			)
			candidate.RawPreviewPath = rawPreviewPath
		}
		candidate.ReferenceDurationMS = audio.DurationMSForWAVData(len(referencePCM), spec)
		candidate.QualityMetrics.UsableDurationMS = candidate.ReferenceDurationMS
		candidates = append(candidates, candidate)
	}

	rankVoiceProfileCandidates(candidates)
	return candidates, nil
}

func shortReferenceMinimumMS(sourceDurationMS int, preferredMinReferenceMS int) int {
	shortMinMS := min(dynamicShortReferenceMinMS, preferredMinReferenceMS)
	if sourceDurationMS > 0 && sourceDurationMS < preferredMinReferenceMS {
		shortMinMS = min(shortMinMS, max(6000, int(math.Round(float64(sourceDurationMS)*0.4))))
	}
	return shortMinMS
}

func isStrongShortReference(
	metrics VoiceProfileQualityMetrics,
	sourceDurationMS int,
	preferredMinReferenceMS int,
) bool {
	minCleanSpeech := 0.68
	maxNoiseRisk := 0.28
	maxSilenceRatio := 0.35
	minSourceCoverage := 0.0
	if sourceDurationMS > 0 && sourceDurationMS < preferredMinReferenceMS {
		minCleanSpeech = 0.40
		maxNoiseRisk = 0.35
		maxSilenceRatio = 0.50
		minSourceCoverage = 0.35
	}
	return metrics.CleanSpeech >= minCleanSpeech &&
		metrics.SingleSpeakerConfidence >= 0.75 &&
		metrics.ClippingRisk <= 0.18 &&
		metrics.NoiseRisk <= maxNoiseRisk &&
		metrics.SilenceRatio <= maxSilenceRatio &&
		metrics.SourceCoverage >= minSourceCoverage
}

func rankVoiceProfileCandidates(candidates []VoiceProfileCandidate) {
	sort.SliceStable(candidates, func(left int, right int) bool {
		leftReady := candidates[left].Status == "ready"
		rightReady := candidates[right].Status == "ready"
		if leftReady != rightReady {
			return leftReady
		}
		if candidates[left].Suitability != candidates[right].Suitability {
			if candidates[left].Suitability == "recommended" {
				return true
			}
			if candidates[right].Suitability == "recommended" {
				return false
			}
		}
		return candidates[left].Score > candidates[right].Score
	})
	recommendedSet := false
	for index := range candidates {
		candidates[index].Rank = index + 1
		candidates[index].Recommended = false
		if candidates[index].Status == "ready" && !recommendedSet {
			candidates[index].Recommended = true
			recommendedSet = true
		}
	}
}

func scoreVoiceProfileCandidate(
	metrics VoiceProfileQualityMetrics,
	preferredMinReferenceMS int,
	targetReferenceMS int,
) float64 {
	durationFit := 0.0
	if targetReferenceMS > 0 {
		durationFit = clamp01(float64(metrics.UsableDurationMS) / float64(targetReferenceMS))
	}
	if preferredMinReferenceMS > 0 && metrics.UsableDurationMS >= preferredMinReferenceMS {
		durationFit = max(durationFit, 0.92)
	}
	noiseQuality := 1 - clamp01(metrics.NoiseRisk)
	clippingQuality := 1 - clamp01(metrics.ClippingRisk)
	silenceQuality := 1 - clamp01(metrics.SilenceRatio)
	score := metrics.CleanSpeech*0.34 +
		metrics.SingleSpeakerConfidence*0.22 +
		durationFit*0.18 +
		noiseQuality*0.10 +
		clippingQuality*0.08 +
		silenceQuality*0.05 +
		metrics.SourceCoverage*0.03
	return math.Round(clamp01(score)*1000) / 1000
}

func scoreSpeakerSpans(
	speakerSpans []DetectedSpeakerSpan,
	allSpans []DetectedSpeakerSpan,
	spec audio.WAVSpec,
	data []byte,
) []candidateSpanScore {
	scored := make([]candidateSpanScore, 0, len(speakerSpans))
	for _, span := range speakerSpans {
		for _, cleanSpan := range splitSpanAroundOtherSpeakers(span, allSpans) {
			durationMS := cleanSpan.EndMS - cleanSpan.StartMS
			if durationMS < minCandidateSpanDurationMS {
				continue
			}
			rms, silenceRatio, clippingRisk := pcmStatsForSpan(data, spec, cleanSpan.StartMS, cleanSpan.EndMS)
			noiseRisk := estimateNoiseRisk(rms, silenceRatio)
			confidence := clamp01(cleanSpan.Confidence)
			if confidence == 0 {
				confidence = 0.75
			}
			cleanSpeech := confidence * (1 - clippingRisk) * (1 - noiseRisk) * (1 - silenceRatio*0.85)
			if rms < 0.01 || silenceRatio > 0.8 || clippingRisk > 0.4 {
				continue
			}
			scored = append(scored, candidateSpanScore{
				span:         cleanSpan,
				durationMS:   durationMS,
				score:        clamp01(cleanSpeech),
				rms:          rms,
				silenceRatio: silenceRatio,
				clippingRisk: clippingRisk,
				noiseRisk:    noiseRisk,
			})
		}
	}
	sort.SliceStable(scored, func(left int, right int) bool {
		return scored[left].score > scored[right].score
	})
	return scored
}

func selectCandidateSpans(
	scoredSpans []candidateSpanScore,
	sourceDurationMS int,
	minDurationMS int,
	targetDurationMS int,
	maxDurationMS int,
) ([]VoiceProfileReferenceSpan, VoiceProfileQualityMetrics) {
	selected := make([]VoiceProfileReferenceSpan, 0)
	available := append([]candidateSpanScore(nil), scoredSpans...)
	usableDurationMS := 0
	totalScore := 0.0
	totalConfidence := 0.0
	totalSilenceRatio := 0.0
	totalClippingRisk := 0.0
	totalNoiseRisk := 0.0

	for len(available) > 0 {
		if usableDurationMS >= targetDurationMS {
			break
		}
		remaining := maxDurationMS - usableDurationMS
		if remaining <= 0 {
			break
		}
		bestIndex := pickDiverseSpanIndex(available, selected, sourceDurationMS)
		if bestIndex < 0 {
			break
		}
		scored := available[bestIndex]
		available = append(available[:bestIndex], available[bestIndex+1:]...)

		durationMS := scored.durationMS
		if durationMS > remaining {
			durationMS = remaining
		}
		if usableDurationMS+durationMS > targetDurationMS && usableDurationMS >= minDurationMS {
			durationMS = targetDurationMS - usableDurationMS
		}
		if durationMS < minCandidateSpanDurationMS {
			continue
		}

		span := VoiceProfileReferenceSpan{
			StartMS:    scored.span.StartMS,
			EndMS:      scored.span.StartMS + durationMS,
			DurationMS: durationMS,
			Score:      scored.score,
		}
		selected = append(selected, span)
		usableDurationMS += durationMS
		totalScore += scored.score * float64(durationMS)
		confidence := clamp01(scored.span.Confidence)
		if confidence == 0 {
			confidence = 0.75
		}
		totalConfidence += confidence * float64(durationMS)
		totalSilenceRatio += scored.silenceRatio * float64(durationMS)
		totalClippingRisk += scored.clippingRisk * float64(durationMS)
		totalNoiseRisk += scored.noiseRisk * float64(durationMS)
	}

	sort.SliceStable(selected, func(left int, right int) bool {
		return selected[left].StartMS < selected[right].StartMS
	})

	metrics := VoiceProfileQualityMetrics{UsableDurationMS: usableDurationMS}
	if usableDurationMS > 0 {
		weight := float64(usableDurationMS)
		metrics.CleanSpeech = clamp01(totalScore / weight)
		metrics.SingleSpeakerConfidence = clamp01(totalConfidence / weight)
		metrics.SilenceRatio = clamp01(totalSilenceRatio / weight)
		metrics.ClippingRisk = clamp01(totalClippingRisk / weight)
		metrics.NoiseRisk = clamp01(totalNoiseRisk / weight)
	}
	if sourceDurationMS > 0 {
		metrics.SourceCoverage = clamp01(float64(usableDurationMS) / float64(sourceDurationMS))
	}
	return selected, metrics
}

func pickDiverseSpanIndex(
	available []candidateSpanScore,
	selected []VoiceProfileReferenceSpan,
	sourceDurationMS int,
) int {
	bestIndex := -1
	bestScore := -1.0
	for index, scored := range available {
		adjustedScore := scored.score
		if len(selected) > 0 && sourceDurationMS > 0 {
			adjustedScore += temporalDiversityBonus(scored.span, selected, sourceDurationMS)
		}
		if adjustedScore > bestScore {
			bestScore = adjustedScore
			bestIndex = index
		}
	}
	return bestIndex
}

func temporalDiversityBonus(
	span DetectedSpeakerSpan,
	selected []VoiceProfileReferenceSpan,
	sourceDurationMS int,
) float64 {
	center := span.StartMS + (span.EndMS-span.StartMS)/2
	nearestDistance := sourceDurationMS
	for _, selectedSpan := range selected {
		selectedCenter := selectedSpan.StartMS + (selectedSpan.EndMS-selectedSpan.StartMS)/2
		distance := absInt(center - selectedCenter)
		if distance < nearestDistance {
			nearestDistance = distance
		}
	}
	return clamp01(float64(nearestDistance)/float64(sourceDurationMS)) * 0.12
}

func buildReferencePCM(
	data []byte,
	spec audio.WAVSpec,
	spans []VoiceProfileReferenceSpan,
) []byte {
	pcm := make([]byte, 0, referencePCMCapacity(spec, spans))
	for _, span := range spans {
		next := pcmSlice(data, spec, span.StartMS, span.EndMS)
		if len(pcm) == 0 {
			pcm = append(pcm, next...)
			continue
		}
		pcm = appendPCMWithCrossfade(pcm, next, spec, referenceCrossfadeMS)
	}
	return pcm
}

func referencePCMCapacity(spec audio.WAVSpec, spans []VoiceProfileReferenceSpan) int {
	capacity := 0
	for _, span := range spans {
		capacity += bytesForDuration(spec, span.DurationMS)
	}
	return max(0, capacity)
}

func appendPCMWithCrossfade(base []byte, next []byte, spec audio.WAVSpec, crossfadeMS int) []byte {
	bytesPerFrame := spec.ChannelCount * spec.BitsPerSample / 8
	if bytesPerFrame <= 0 || spec.BitsPerSample != 16 || crossfadeMS <= 0 || len(base) == 0 || len(next) == 0 {
		output := make([]byte, 0, len(base)+len(next))
		output = append(output, base...)
		output = append(output, next...)
		return output
	}

	fadeBytes := bytesForDuration(spec, crossfadeMS)
	fadeBytes -= fadeBytes % bytesPerFrame
	if fadeBytes <= 0 || fadeBytes >= len(base) || fadeBytes >= len(next) {
		output := make([]byte, 0, len(base)+len(next))
		output = append(output, base...)
		output = append(output, next...)
		return output
	}

	output := make([]byte, len(base))
	copy(output, base)
	fadeFrames := fadeBytes / bytesPerFrame
	for frame := 0; frame < fadeFrames; frame += 1 {
		alpha := float64(frame+1) / float64(fadeFrames+1)
		for channel := 0; channel < spec.ChannelCount; channel += 1 {
			offset := frame*bytesPerFrame + channel*2
			baseOffset := len(output) - fadeBytes + offset
			nextOffset := offset
			baseSample := int16(binary.LittleEndian.Uint16(output[baseOffset : baseOffset+2]))
			nextSample := int16(binary.LittleEndian.Uint16(next[nextOffset : nextOffset+2]))
			mixed := int(math.Round(float64(baseSample)*(1-alpha) + float64(nextSample)*alpha))
			mixed = clampInt(mixed, -32768, 32767)
			binary.LittleEndian.PutUint16(output[baseOffset:baseOffset+2], uint16(int16(mixed)))
		}
	}
	output = append(output, next[fadeBytes:]...)
	return output
}

func trimPCMToDuration(data []byte, spec audio.WAVSpec, durationMS int) []byte {
	maxBytes := bytesForDuration(spec, durationMS)
	if maxBytes <= 0 || len(data) <= maxBytes {
		output := make([]byte, len(data))
		copy(output, data)
		return output
	}
	output := make([]byte, maxBytes)
	copy(output, data[:maxBytes])
	return output
}

func pcmSlice(data []byte, spec audio.WAVSpec, startMS int, endMS int) []byte {
	bytesPerFrame := spec.ChannelCount * spec.BitsPerSample / 8
	if bytesPerFrame <= 0 || spec.SampleRate <= 0 || endMS <= startMS {
		return nil
	}
	startFrame := int(math.Round(float64(startMS) * float64(spec.SampleRate) / 1000))
	endFrame := int(math.Round(float64(endMS) * float64(spec.SampleRate) / 1000))
	startByte := clampInt(startFrame*bytesPerFrame, 0, len(data))
	endByte := clampInt(endFrame*bytesPerFrame, 0, len(data))
	startByte -= startByte % bytesPerFrame
	endByte -= endByte % bytesPerFrame
	if endByte <= startByte {
		return nil
	}
	output := make([]byte, endByte-startByte)
	copy(output, data[startByte:endByte])
	return output
}

func bytesForDuration(spec audio.WAVSpec, durationMS int) int {
	bytesPerFrame := spec.ChannelCount * spec.BitsPerSample / 8
	if bytesPerFrame <= 0 || spec.SampleRate <= 0 || durationMS <= 0 {
		return 0
	}
	frames := int(math.Round(float64(durationMS) * float64(spec.SampleRate) / 1000))
	return frames * bytesPerFrame
}

func pcmStatsForSpan(
	data []byte,
	spec audio.WAVSpec,
	startMS int,
	endMS int,
) (float64, float64, float64) {
	slice := pcmSlice(data, spec, startMS, endMS)
	if len(slice) < 2 {
		return 0, 1, 0
	}
	sampleCount := len(slice) / 2
	rmsTotal := 0.0
	silentCount := 0
	clippedCount := 0
	for index := 0; index+1 < len(slice); index += 2 {
		sample := int16(binary.LittleEndian.Uint16(slice[index : index+2]))
		normalized := math.Abs(float64(sample) / 32768)
		rmsTotal += normalized * normalized
		if normalized < 0.015 {
			silentCount += 1
		}
		if normalized > 0.98 {
			clippedCount += 1
		}
	}
	rms := math.Sqrt(rmsTotal / float64(sampleCount))
	silenceRatio := float64(silentCount) / float64(sampleCount)
	clippingRisk := math.Min(1, float64(clippedCount)/float64(sampleCount)*80)
	return rms, clamp01(silenceRatio), clamp01(clippingRisk)
}

func estimateNoiseRisk(rms float64, silenceRatio float64) float64 {
	if rms <= 0 {
		return 1
	}
	lowLevelRisk := 0.0
	if rms < 0.07 {
		lowLevelRisk = (0.07 - rms) / 0.07
	}
	return clamp01(lowLevelRisk*0.8 + silenceRatio*0.25)
}

type spanInterval struct {
	startMS int
	endMS   int
}

func splitSpanAroundOtherSpeakers(
	span DetectedSpeakerSpan,
	allSpans []DetectedSpeakerSpan,
) []DetectedSpeakerSpan {
	intervals := []spanInterval{{startMS: span.StartMS, endMS: span.EndMS}}
	for _, other := range allSpans {
		if other.SpeakerID == span.SpeakerID {
			continue
		}
		overlapStart := max(span.StartMS, other.StartMS)
		overlapEnd := min(span.EndMS, other.EndMS)
		if overlapEnd-overlapStart < 250 {
			continue
		}

		next := make([]spanInterval, 0, len(intervals)+1)
		for _, interval := range intervals {
			if overlapEnd <= interval.startMS || overlapStart >= interval.endMS {
				next = append(next, interval)
				continue
			}
			if overlapStart-interval.startMS >= minCandidateSpanDurationMS {
				next = append(next, spanInterval{startMS: interval.startMS, endMS: overlapStart})
			}
			if interval.endMS-overlapEnd >= minCandidateSpanDurationMS {
				next = append(next, spanInterval{startMS: overlapEnd, endMS: interval.endMS})
			}
		}
		intervals = next
		if len(intervals) == 0 {
			return nil
		}
	}

	spans := make([]DetectedSpeakerSpan, 0, len(intervals))
	for _, interval := range intervals {
		if interval.endMS-interval.startMS < minCandidateSpanDurationMS {
			continue
		}
		cleanSpan := span
		cleanSpan.StartMS = interval.startMS
		cleanSpan.EndMS = interval.endMS
		spans = append(spans, cleanSpan)
	}
	return spans
}

func (service *Service) getVoiceProfileSourceCandidate(
	sourceID string,
	candidateID string,
) (VoiceProfileSource, VoiceProfileCandidate, error) {
	source, err := service.GetVoiceProfileSource(sourceID)
	if err != nil {
		return VoiceProfileSource{}, VoiceProfileCandidate{}, err
	}
	for _, candidate := range source.Candidates {
		if candidate.ID == candidateID {
			return source, candidate, nil
		}
	}
	return VoiceProfileSource{}, VoiceProfileCandidate{}, ErrProfileCandidateNotFound
}

func candidatePreviewPath(candidate VoiceProfileCandidate, kind string) string {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "raw":
		if strings.TrimSpace(candidate.RawPreviewPath) != "" {
			return candidate.RawPreviewPath
		}
	case "clean", "":
		if strings.TrimSpace(candidate.CleanPreviewPath) != "" {
			return candidate.CleanPreviewPath
		}
	}
	return candidate.PreviewPath
}

func cloneDenoiseMetadata(metadata VoiceProfileDenoiseMetadata) *VoiceProfileDenoiseMetadata {
	warnings := append([]string(nil), metadata.Warnings...)
	copy := metadata
	copy.Warnings = warnings
	return &copy
}

func (service *Service) updateVoiceProfileSource(source storedVoiceProfileSource) {
	service.mu.Lock()
	source.UpdatedAt = time.Now().UTC()
	service.sources[source.ID] = source
	service.mu.Unlock()
}

func (service *Service) updateVoiceProfileSourceByID(
	id string,
	update func(*storedVoiceProfileSource),
) {
	service.mu.Lock()
	source, ok := service.sources[id]
	if !ok {
		service.mu.Unlock()
		return
	}
	update(&source)
	source.UpdatedAt = time.Now().UTC()
	service.sources[id] = source
	service.mu.Unlock()
	_ = service.writeVoiceProfileSourceMetadata(source.VoiceProfileSource)
}

func (service *Service) failVoiceProfileSource(id string, err error) {
	service.updateVoiceProfileSourceByID(id, func(source *storedVoiceProfileSource) {
		source.Status = VoiceProfileSourceStatusFailed
		source.Error = err.Error()
		source.ProgressMessage = "Source analysis failed"
		source.ProgressDetail = err.Error()
		for index := range source.Stages {
			if source.Stages[index].Status == "running" {
				source.Stages[index].Status = "failed"
				source.Stages[index].Detail = err.Error()
			}
		}
	})
}

func (service *Service) writeVoiceProfileSourceMetadata(source VoiceProfileSource) error {
	if strings.TrimSpace(source.ID) == "" {
		return nil
	}
	outputDir, err := filepath.Abs(filepath.Join(service.options.VoiceProfileSourceDir, source.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, sourceMetadataFilename), source)
}

func initialVoiceProfileSourceStages() []VoiceProfileSourceStage {
	return []VoiceProfileSourceStage{
		{Name: "normalize", Status: "waiting", Detail: "Waiting for upload."},
		{Name: "denoise", Status: "waiting", Detail: "Waiting for normalized audio."},
		{Name: "analyze", Status: "waiting", Detail: "Waiting for cleaned audio."},
		{Name: "score", Status: "waiting", Detail: "Waiting for speaker turns."},
	}
}

func updateVoiceProfileSourceStage(
	source *storedVoiceProfileSource,
	name string,
	status string,
	detail string,
) {
	for index := range source.Stages {
		if source.Stages[index].Name == name {
			source.Stages[index].Status = status
			source.Stages[index].Detail = detail
			return
		}
	}
	source.Stages = append(source.Stages, VoiceProfileSourceStage{Name: name, Status: status, Detail: detail})
}

func sanitizeCandidateID(speakerID string, index int) string {
	lower := strings.ToLower(strings.TrimSpace(speakerID))
	var builder strings.Builder
	for _, char := range lower {
		switch {
		case char >= 'a' && char <= 'z':
			builder.WriteRune(char)
		case char >= '0' && char <= '9':
			builder.WriteRune(char)
		case char == '-' || char == '_':
			builder.WriteRune('-')
		}
	}
	value := strings.Trim(builder.String(), "-")
	if value == "" {
		value = "speaker-" + strconv.Itoa(index+1)
	}
	if !strings.HasPrefix(value, "speaker") {
		value = "speaker-" + value
	}
	return value
}

func clamp01(value float64) float64 {
	if !NumberIsFinite(value) {
		return 0
	}
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

func NumberIsFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func clampInt(value int, minValue int, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}

func formatDurationMS(durationMS int) string {
	if durationMS <= 0 {
		return "0s"
	}
	if durationMS < 1000 {
		return fmt.Sprintf("%dms", durationMS)
	}
	return fmt.Sprintf("%.1fs", float64(durationMS)/1000)
}
