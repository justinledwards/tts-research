package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
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

type CreateVoiceProfileSourceOptions struct {
	Provenance *VoiceProfileProvenance
}

func NormalizeVoiceProfileProvenance(
	provenance *VoiceProfileProvenance,
) (*VoiceProfileProvenance, error) {
	if provenance == nil {
		return nil, nil
	}
	normalized := &VoiceProfileProvenance{
		SourceType:           strings.TrimSpace(provenance.SourceType),
		RightsBasis:          strings.TrimSpace(provenance.RightsBasis),
		ConsentStatus:        strings.TrimSpace(provenance.ConsentStatus),
		AllowedUse:           strings.TrimSpace(provenance.AllowedUse),
		RetentionPolicy:      strings.TrimSpace(provenance.RetentionPolicy),
		SpeakerName:          strings.TrimSpace(provenance.SpeakerName),
		SourceOwner:          strings.TrimSpace(provenance.SourceOwner),
		SourceURI:            strings.TrimSpace(provenance.SourceURI),
		ConsentDocumentLabel: strings.TrimSpace(provenance.ConsentDocumentLabel),
		Notes:                strings.TrimSpace(provenance.Notes),
		CollectedAt:          strings.TrimSpace(provenance.CollectedAt),
	}
	missing := []string{}
	if normalized.SourceType == "" {
		missing = append(missing, "sourceType")
	}
	if normalized.RightsBasis == "" {
		missing = append(missing, "rightsBasis")
	}
	if normalized.ConsentStatus == "" {
		missing = append(missing, "consentStatus")
	}
	if normalized.AllowedUse == "" {
		missing = append(missing, "allowedUse")
	}
	if normalized.RetentionPolicy == "" {
		missing = append(missing, "retentionPolicy")
	}
	if len(missing) > 0 {
		return nil, fmt.Errorf("voice profile provenance missing required field(s): %s", strings.Join(missing, ", "))
	}
	if normalized.Notes == "" && voiceProfileProvenanceNeedsNotes(normalized) {
		return nil, errors.New("voice profile provenance notes are required for other, unknown, or pending selections")
	}
	return normalized, nil
}

func voiceProfileProvenanceNeedsNotes(provenance *VoiceProfileProvenance) bool {
	return provenanceSelectionNeedsNotes(provenance.SourceType) ||
		provenanceSelectionNeedsNotes(provenance.RightsBasis) ||
		provenanceSelectionNeedsNotes(provenance.ConsentStatus) ||
		provenanceSelectionNeedsNotes(provenance.AllowedUse) ||
		provenanceSelectionNeedsNotes(provenance.RetentionPolicy)
}

func provenanceSelectionNeedsNotes(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "other", "unknown", "pending":
		return true
	default:
		return false
	}
}

func cloneVoiceProfileProvenance(provenance *VoiceProfileProvenance) *VoiceProfileProvenance {
	if provenance == nil {
		return nil
	}
	cloned := *provenance
	return &cloned
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
	return service.CreateVoiceProfileSourceWithOptions(
		ctx,
		sourcePath,
		sourceFileName,
		sourceBytes,
		CreateVoiceProfileSourceOptions{},
	)
}

func (service *Service) CreateVoiceProfileSourceWithOptions(
	ctx context.Context,
	sourcePath string,
	sourceFileName string,
	sourceBytes int64,
	options CreateVoiceProfileSourceOptions,
) (VoiceProfileSource, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	provenance, err := NormalizeVoiceProfileProvenance(options.Provenance)
	if err != nil {
		return VoiceProfileSource{}, err
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
			Provenance:       provenance,
			StrategyVersion:  service.options.VoiceProfileAnalysisStrategyVersion,
			CreatedAt:        now,
			UpdatedAt:        now,
		},
	}
	service.updateVoiceProfileSource(source)
	_ = service.writeVoiceProfileSourceMetadata(source.VoiceProfileSource)

	analysisCtx, cancel := context.WithCancel(context.Background())
	service.registerVoiceProfileSourceCancel(sourceID, cancel)
	go service.runVoiceProfileSourceAnalysis(analysisCtx, sourceID, originalPath, audioInfo.streamIndex)

	return source.VoiceProfileSource, nil
}

func (service *Service) CancelVoiceProfileSource(id string) (VoiceProfileSource, error) {
	cancel := service.takeVoiceProfileSourceCancel(id)
	if cancel != nil {
		cancel()
	}
	return service.cancelVoiceProfileSourceByID(id)
}

func (service *Service) GetVoiceProfileSource(id string) (VoiceProfileSource, error) {
	service.mu.RLock()
	source, ok := service.sources[id]
	service.mu.RUnlock()
	if !ok {
		return VoiceProfileSource{}, ErrProfileSourceNotFound
	}
	return normalizeVoiceProfileSourceTranscriptFields(source.VoiceProfileSource), nil
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
	autoValidate := false
	profile, err := service.CreateVoiceProfileFromCandidateWithOptions(
		ctx,
		sourceID,
		candidateID,
		name,
		language,
		VoiceProfileCreationOptions{AutoValidate: &autoValidate},
	)
	if err != nil {
		return VoiceProfile{}, err
	}
	return service.measureAndPersistVoiceProfileLikeness(ctx, profile.ID)
}

func (service *Service) CreateVoiceProfileFromCandidateWithOptions(
	ctx context.Context,
	sourceID string,
	candidateID string,
	name string,
	language string,
	options VoiceProfileCreationOptions,
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
	targetIDs := normalizeVoiceProfileTargetIDs(options.Targets)
	if len(targetIDs) == 0 {
		return VoiceProfile{}, ErrProfileArtifactUnsupported
	}
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
			Provenance:              cloneVoiceProfileProvenance(source.Provenance),
			AudioFormat:             "audio/wav",
			Status:                  VoiceProfileStatusReady,
			DurationMS:              referenceDurationMS,
			CloneTargets:            newVoiceProfileTargets(targetIDs, options.autoValidate(), now),
			CreatedAt:               now,
			UpdatedAt:               now,
			ReferenceSamples:        candidate.ReferenceAudio,
		},
	}
	likenessReason := "Target validation is queued."
	if !options.autoValidate() {
		likenessReason = "Target validation is not started."
	}
	likeness := pendingVoiceProfileLikeness(
		likenessReason,
		strings.TrimSpace(service.options.VoiceProfileLikenessCalibrationText),
	)
	profile.Likeness = &likeness

	if err := service.persistVoiceProfile(profile); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, err
	}

	result := profile.VoiceProfile
	if options.autoValidate() {
		service.startVoiceProfileTargetPreparation(profile.ID, targetIDs, true)
	}
	return result, nil
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
	defer service.clearVoiceProfileSourceCancel(sourceID)
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
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileSourceByID(sourceID)
			return
		}
		service.failVoiceProfileSource(sourceID, fmt.Errorf("normalize source audio: %w", err))
		return
	}
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileSourceByID(sourceID)
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

	sourceTranscript := service.transcriptForAudioPath(ctx, "", normalizedPath)
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileSourceByID(sourceID)
		return
	}
	service.updateVoiceProfileSourceByID(sourceID, func(source *storedVoiceProfileSource) {
		setVoiceProfileSourceTranscript(&source.VoiceProfileSource, sourceTranscript)
	})

	denoiseMetadata, err := denoiseProfileSourceAudio(
		ctx,
		normalizedPath,
		cleanedPath,
		service.options.VoiceProfileDenoiseProvider,
		service.options.VoiceProfileDenoiseStrength,
	)
	if err != nil {
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileSourceByID(sourceID)
			return
		}
		service.failVoiceProfileSource(sourceID, fmt.Errorf("denoise source audio: %w", err))
		return
	}
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileSourceByID(sourceID)
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
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileSourceByID(sourceID)
			return
		}
		service.failVoiceProfileSource(sourceID, err)
		return
	}
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileSourceByID(sourceID)
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
		if isContextCancellation(ctx, err) {
			_, _ = service.cancelVoiceProfileSourceByID(sourceID)
			return
		}
		service.failVoiceProfileSource(sourceID, fmt.Errorf("build voice candidates: %w", err))
		return
	}
	if isContextCancellation(ctx, nil) {
		_, _ = service.cancelVoiceProfileSourceByID(sourceID)
		return
	}
	for index := range candidates {
		if candidates[index].Status != "ready" || strings.TrimSpace(candidates[index].ReferencePath) == "" {
			continue
		}
		transcript := service.transcriptForAudioPath(ctx, "", candidates[index].ReferencePath)
		if isContextCancellation(ctx, nil) {
			_, _ = service.cancelVoiceProfileSourceByID(sourceID)
			return
		}
		setVoiceProfileCandidateTranscript(&candidates[index], transcript)
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
	source.VoiceProfileSource = normalizeVoiceProfileSourceTranscriptFields(source.VoiceProfileSource)
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
	source.VoiceProfileSource = normalizeVoiceProfileSourceTranscriptFields(source.VoiceProfileSource)
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

func (service *Service) cancelVoiceProfileSourceByID(id string) (VoiceProfileSource, error) {
	service.mu.Lock()
	source, ok := service.sources[id]
	if !ok {
		service.mu.Unlock()
		return VoiceProfileSource{}, ErrProfileSourceNotFound
	}
	if source.Status == VoiceProfileSourceStatusReady ||
		source.Status == VoiceProfileSourceStatusFailed ||
		source.Status == VoiceProfileSourceStatusCancelled {
		result := source.VoiceProfileSource
		service.mu.Unlock()
		return result, nil
	}
	source.Status = VoiceProfileSourceStatusCancelled
	source.Error = "cancelled by request"
	source.ProgressMessage = "Source analysis cancelled"
	source.ProgressDetail = "Processing was cancelled by user request."
	for index := range source.Stages {
		if source.Stages[index].Status == "running" {
			source.Stages[index].Status = "failed"
			source.Stages[index].Detail = "Cancelled by request."
		}
	}
	source.UpdatedAt = time.Now().UTC()
	service.sources[id] = source
	service.mu.Unlock()
	_ = service.writeVoiceProfileSourceMetadata(source.VoiceProfileSource)
	return source.VoiceProfileSource, nil
}

func (service *Service) registerVoiceProfileSourceCancel(id string, cancel context.CancelFunc) {
	service.mu.Lock()
	service.sourceCancels[id] = cancel
	service.mu.Unlock()
}

func (service *Service) takeVoiceProfileSourceCancel(id string) context.CancelFunc {
	service.mu.Lock()
	cancel := service.sourceCancels[id]
	delete(service.sourceCancels, id)
	service.mu.Unlock()
	return cancel
}

func (service *Service) clearVoiceProfileSourceCancel(id string) {
	service.mu.Lock()
	delete(service.sourceCancels, id)
	service.mu.Unlock()
}

func isContextCancellation(ctx context.Context, err error) bool {
	if ctx != nil && errors.Is(ctx.Err(), context.Canceled) {
		return true
	}
	return errors.Is(err, context.Canceled)
}

func (service *Service) writeVoiceProfileSourceMetadata(source VoiceProfileSource) error {
	if strings.TrimSpace(source.ID) == "" {
		return nil
	}
	source = normalizeVoiceProfileSourceTranscriptFields(source)
	outputDir, err := filepath.Abs(filepath.Join(service.options.VoiceProfileSourceDir, source.ID))
	if err != nil {
		return err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return err
	}
	return writeJSON(filepath.Join(outputDir, sourceMetadataFilename), source)
}

func (service *Service) reloadVoiceProfileSources() {
	baseDir, err := filepath.Abs(service.options.VoiceProfileSourceDir)
	if err != nil {
		return
	}
	sources := make(map[string]storedVoiceProfileSource)
	entries, err := os.ReadDir(baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			_ = os.MkdirAll(baseDir, 0o755)
		}
		return
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		metadataBytes, readErr := os.ReadFile(filepath.Join(baseDir, entry.Name(), sourceMetadataFilename))
		if readErr != nil {
			continue
		}
		var source VoiceProfileSource
		if err := json.Unmarshal(metadataBytes, &source); err != nil || source.ID == "" {
			continue
		}
		source = normalizeVoiceProfileSourceTranscriptFields(source)
		sources[source.ID] = storedVoiceProfileSource{VoiceProfileSource: source}
	}
	service.mu.Lock()
	service.sources = sources
	service.mu.Unlock()
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
