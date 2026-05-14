package pipeline

import (
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
	sourceMetadataFilename          = "analysis.json"
	profileReferenceVersion         = "v1"
	minCandidateSpanDurationMS      = 1000
	previewDurationMS               = 6000
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

type storedVoiceProfileSource struct {
	VoiceProfileSource
}

type pythonProfileSourceAnalyzer struct {
	pythonPath string
	scriptPath string
	model      string
	token      string
	strategy   string
}

func newPythonProfileSourceAnalyzer(options Options) VoiceProfileSourceAnalyzer {
	return pythonProfileSourceAnalyzer{
		pythonPath: strings.TrimSpace(options.VoiceProfileAnalysisPythonPath),
		scriptPath: strings.TrimSpace(options.VoiceProfileAnalysisScriptPath),
		model:      strings.TrimSpace(options.VoiceProfileDiarizationModel),
		token:      strings.TrimSpace(options.VoiceProfileDiarizationToken),
		strategy:   strings.TrimSpace(options.VoiceProfileAnalysisStrategyVersion),
	}
}

func (analyzer pythonProfileSourceAnalyzer) AnalyzeVoiceProfileSource(
	ctx context.Context,
	request VoiceProfileSourceAnalysisRequest,
) (VoiceProfileSourceAnalysisResult, error) {
	token := strings.TrimSpace(request.Token)
	if token == "" {
		token = analyzer.token
	}
	if token == "" {
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf(
			"%w: PYANNOTE_AUTH_TOKEN or HF_TOKEN is required for speaker-aware profile analysis",
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
	model := strings.TrimSpace(request.Model)
	if model == "" {
		model = analyzer.model
	}
	if model == "" {
		model = defaultVoiceProfileDiarizationModel
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
		"--token",
		token,
		"--strategy-version",
		strategy,
	)
	command.Env = append(os.Environ(), "PYANNOTE_METRICS_ENABLED=0")
	output, err := command.CombinedOutput()
	if err != nil {
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf(
			"profile analysis script failed: %w: %s",
			err,
			strings.TrimSpace(string(output)),
		)
	}

	var result VoiceProfileSourceAnalysisResult
	if err := json.Unmarshal(output, &result); err != nil {
		return VoiceProfileSourceAnalysisResult{}, fmt.Errorf("parse profile analysis output: %w", err)
	}
	if strings.TrimSpace(result.ModelVersion) == "" {
		result.ModelVersion = model
	}
	return result, nil
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
	if sourceBytes > service.options.MaxProfileBytes {
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
) ([]byte, string, error) {
	source, candidate, err := service.getVoiceProfileSourceCandidate(sourceID, candidateID)
	if err != nil {
		return nil, "", err
	}
	if source.ID == "" || strings.TrimSpace(candidate.PreviewPath) == "" {
		return nil, "", ErrAudioNotReady
	}

	audioBytes, err := os.ReadFile(candidate.PreviewPath)
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
			AudioFormat:             "audio/wav",
			Status:                  VoiceProfileStatusReady,
			DurationMS:              referenceDurationMS,
			CreatedAt:               now,
			UpdatedAt:               now,
			ReferenceSamples:        candidate.ReferenceAudio,
		},
	}

	metadataPath := filepath.Join(outputDir, "profile.json")
	if err := writeJSON(metadataPath, profile.VoiceProfile); err != nil {
		_ = os.RemoveAll(outputDir)
		return VoiceProfile{}, err
	}

	service.updateVoiceProfile(profile)
	return profile.VoiceProfile, nil
}

func (service *Service) runVoiceProfileSourceAnalysis(
	ctx context.Context,
	sourceID string,
	originalPath string,
	audioStreamIndex int,
) {
	outputDir := filepath.Dir(originalPath)
	normalizedPath := filepath.Join(outputDir, normalizedProfileSourceFilename)

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
		source.Status = VoiceProfileSourceStatusAnalyzing
		if sourceDurationMS > 0 {
			source.SourceDurationMS = sourceDurationMS
		}
		source.NormalizedAudio = normalizedProfileSourceFilename
		source.NormalizedPath = normalizedPath
		source.AudioFormat = "audio/wav"
		source.ProgressMessage = "Detecting speakers"
		source.ProgressDetail = "Running local pyannote diarization over the normalized source."
		updateVoiceProfileSourceStage(source, "normalize", "done", "Source audio is normalized.")
		updateVoiceProfileSourceStage(source, "analyze", "running", "Detecting speaker turns.")
	})

	result, err := service.options.VoiceProfileSourceAnalyzer.AnalyzeVoiceProfileSource(
		ctx,
		VoiceProfileSourceAnalysisRequest{
			SourceID:        sourceID,
			NormalizedPath:  normalizedPath,
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
		outputDir,
		sourceID,
		result,
		service.options,
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
	normalizedPath string,
	outputDir string,
	sourceID string,
	result VoiceProfileSourceAnalysisResult,
	options Options,
) ([]VoiceProfileCandidate, error) {
	raw, err := os.ReadFile(normalizedPath)
	if err != nil {
		return nil, err
	}
	spec, data, err := audio.ParsePCM16WAV(raw)
	if err != nil {
		return nil, err
	}
	sourceDurationMS := audio.DurationMSForWAVData(len(data), spec)

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
			Reason:                  "not enough clean single-speaker speech",
			ReferenceVersion:        profileReferenceVersion,
			ReferenceSampleStrategy: "speaker-aware-best-spans",
			StrategyVersion:         options.VoiceProfileAnalysisStrategyVersion,
			ModelVersion:            result.ModelVersion,
			TotalSpeechDurationMS:   totalSpeechMS,
			CreatedAt:               now,
			UpdatedAt:               now,
		}

		maxReferenceMS := max(1000, options.VoiceProfileReferenceMaxSeconds*1000)
		minReferenceMS := min(options.VoiceProfileReferenceMinSeconds*1000, maxReferenceMS)
		targetReferenceMS := clampInt(
			options.VoiceProfileReferenceTargetSeconds*1000,
			minReferenceMS,
			maxReferenceMS,
		)
		selected, metrics := selectCandidateSpans(
			scoredSpans,
			sourceDurationMS,
			minReferenceMS,
			targetReferenceMS,
			maxReferenceMS,
		)
		candidate.Spans = selected
		candidate.QualityMetrics = metrics
		candidate.Score = metrics.CleanSpeech * metrics.SingleSpeakerConfidence
		candidate.ReferenceDurationMS = metrics.UsableDurationMS
		if metrics.UsableDurationMS < minReferenceMS {
			candidate.Reason = fmt.Sprintf(
				"needs at least %ds of clean speech; found %s",
				minReferenceMS/1000,
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

		candidate.Status = "ready"
		candidate.Reason = "clean single-speaker reference is ready"
		candidate.ReferenceAudio = referenceAudio
		candidate.ReferencePath = referencePath
		candidate.PreviewAudio = fmt.Sprintf(
			"/api/voice-profile-sources/%s/candidates/%s/preview.wav",
			sourceID,
			candidateID,
		)
		candidate.PreviewPath = previewPath
		candidate.ReferenceDurationMS = audio.DurationMSForWAVData(len(referencePCM), spec)
		candidate.QualityMetrics.UsableDurationMS = candidate.ReferenceDurationMS
		candidates = append(candidates, candidate)
	}

	return candidates, nil
}

func scoreSpeakerSpans(
	speakerSpans []DetectedSpeakerSpan,
	allSpans []DetectedSpeakerSpan,
	spec audio.WAVSpec,
	data []byte,
) []candidateSpanScore {
	scored := make([]candidateSpanScore, 0, len(speakerSpans))
	for _, span := range speakerSpans {
		durationMS := span.EndMS - span.StartMS
		if durationMS < minCandidateSpanDurationMS {
			continue
		}
		if spanOverlapsOtherSpeaker(span, allSpans) {
			continue
		}
		rms, silenceRatio, clippingRisk := pcmStatsForSpan(data, spec, span.StartMS, span.EndMS)
		noiseRisk := estimateNoiseRisk(rms, silenceRatio)
		confidence := clamp01(span.Confidence)
		if confidence == 0 {
			confidence = 0.75
		}
		cleanSpeech := confidence * (1 - clippingRisk) * (1 - noiseRisk) * (1 - silenceRatio*0.85)
		if rms < 0.01 || silenceRatio > 0.8 || clippingRisk > 0.4 {
			continue
		}
		scored = append(scored, candidateSpanScore{
			span:         span,
			durationMS:   durationMS,
			score:        clamp01(cleanSpeech),
			rms:          rms,
			silenceRatio: silenceRatio,
			clippingRisk: clippingRisk,
			noiseRisk:    noiseRisk,
		})
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
	usableDurationMS := 0
	totalScore := 0.0
	totalConfidence := 0.0
	totalSilenceRatio := 0.0
	totalClippingRisk := 0.0
	totalNoiseRisk := 0.0

	for _, scored := range scoredSpans {
		if usableDurationMS >= targetDurationMS {
			break
		}
		remaining := maxDurationMS - usableDurationMS
		if remaining <= 0 {
			break
		}
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
	if usableDurationMS < minDurationMS {
		metrics.CleanSpeech = clamp01(metrics.CleanSpeech * 0.5)
	}
	return selected, metrics
}

func buildReferencePCM(
	data []byte,
	spec audio.WAVSpec,
	spans []VoiceProfileReferenceSpan,
) []byte {
	pcm := make([]byte, 0)
	for _, span := range spans {
		pcm = append(pcm, pcmSlice(data, spec, span.StartMS, span.EndMS)...)
	}
	return pcm
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

func spanOverlapsOtherSpeaker(span DetectedSpeakerSpan, allSpans []DetectedSpeakerSpan) bool {
	for _, other := range allSpans {
		if other.SpeakerID == span.SpeakerID {
			continue
		}
		overlapStart := max(span.StartMS, other.StartMS)
		overlapEnd := min(span.EndMS, other.EndMS)
		if overlapEnd-overlapStart >= 250 {
			return true
		}
	}
	return false
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
		{Name: "analyze", Status: "waiting", Detail: "Waiting for normalized audio."},
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

func formatDurationMS(durationMS int) string {
	if durationMS <= 0 {
		return "0s"
	}
	if durationMS < 1000 {
		return fmt.Sprintf("%dms", durationMS)
	}
	return fmt.Sprintf("%.1fs", float64(durationMS)/1000)
}
