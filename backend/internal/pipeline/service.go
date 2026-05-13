package pipeline

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/audio"
)

var (
	ErrEmptyText     = errors.New("text is required")
	ErrJobNotFound   = errors.New("voice job not found")
	ErrAudioNotReady = errors.New("voice job audio is not ready")
	ErrRetryExhaust  = errors.New("voice checker did not confirm complete audio before retry limit")
)

type VoiceOptimizer interface {
	Optimize(context.Context, string) (string, error)
}

type StreamingVoiceOptimizer interface {
	OptimizeStream(context.Context, string, func(string)) (string, error)
}

type namedVoiceOptimizer interface {
	ProviderName() string
}

type TTSAgent interface {
	Synthesize(context.Context, string) (agents.TTSResult, error)
}

type VoiceChecker interface {
	Check(context.Context, string, []byte) (agents.VoiceCheckResult, error)
}

type Options struct {
	MaxRetries      int
	SegmentMaxRunes int
	JobDataDir      string
}

const (
	defaultSegmentMaxRunes = 220
	defaultJobDataDir      = "./data/jobs"
)

type Service struct {
	optimizer VoiceOptimizer
	tts       TTSAgent
	checker   VoiceChecker
	options   Options
	mu        sync.RWMutex
	jobs      map[string]storedJob
}

func NewService(optimizer VoiceOptimizer, tts TTSAgent, checker VoiceChecker, options Options) *Service {
	if options.MaxRetries <= 0 {
		options.MaxRetries = 3
	}
	if options.SegmentMaxRunes <= 0 {
		options.SegmentMaxRunes = defaultSegmentMaxRunes
	}
	if strings.TrimSpace(options.JobDataDir) == "" {
		options.JobDataDir = defaultJobDataDir
	}

	return &Service{
		optimizer: optimizer,
		tts:       tts,
		checker:   checker,
		options:   options,
		jobs:      map[string]storedJob{},
	}
}

func (service *Service) CreateJob(_ context.Context, text string) (VoiceJob, error) {
	inputText := strings.TrimSpace(text)
	if inputText == "" {
		return VoiceJob{}, ErrEmptyText
	}

	now := time.Now().UTC()
	job := storedJob{
		VoiceJob: VoiceJob{
			ID:        newID(),
			Status:    JobStatusQueued,
			Stages:    initialStages(),
			InputText: inputText,
			Retries: RetryMetadata{
				MaxRetries: service.options.MaxRetries,
				Attempts:   0,
			},
			Progress: JobProgress{
				Message: "Queued",
				Detail:  "Waiting to start voice optimization.",
			},
			CreatedAt: now,
			UpdatedAt: now,
		},
	}
	service.save(job)

	go service.runJob(context.Background(), job.ID)

	return job.VoiceJob, nil
}

func (service *Service) GetJob(id string) (VoiceJob, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	job, ok := service.jobs[id]
	if !ok {
		return VoiceJob{}, ErrJobNotFound
	}

	return job.VoiceJob, nil
}

func (service *Service) GetAudio(id string) ([]byte, string, error) {
	service.mu.RLock()
	job, ok := service.jobs[id]
	service.mu.RUnlock()
	if !ok {
		return nil, "", ErrJobNotFound
	}

	contentType := job.ContentType
	if contentType == "" {
		contentType = "audio/wav"
	}
	if len(job.audio) > 0 {
		return job.audio, contentType, nil
	}
	if job.AudioPath != "" {
		audioBytes, err := os.ReadFile(job.AudioPath)
		if err != nil {
			return nil, "", fmt.Errorf("read saved audio: %w", err)
		}

		return audioBytes, contentType, nil
	}

	return nil, "", ErrAudioNotReady
}

func (service *Service) runJob(ctx context.Context, id string) {
	job, err := service.snapshot(id)
	if err != nil {
		return
	}

	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusOptimizing
		job.Stages.Optimization = StageStatusRunning
		job.Optimizer = optimizerName(service.optimizer)
		setProgress(job, string(JobStatusOptimizing), "Optimizing source text", fmt.Sprintf("%d characters queued.", len([]rune(job.InputText))), 0, 0)
	})

	optimizedText, err := service.optimizeText(ctx, id, job.InputText)
	if err != nil {
		service.failJobByID(id, fmt.Errorf("optimize text: %w", err))
		return
	}

	service.updateJob(id, func(job *storedJob) {
		job.OptimizedText = optimizedText
		job.Stages.Optimization = StageStatusDone
		job.Status = JobStatusSynthesizing
		job.Stages.Synthesis = StageStatusRunning
		setProgress(job, string(JobStatusSynthesizing), "Preparing synthesis segments", fmt.Sprintf("%d optimized characters ready.", len([]rune(optimizedText))), 0, 0)
	})

	result, check, err := service.synthesizeUntilComplete(ctx, id, optimizedText)
	if err != nil {
		service.updateJob(id, func(job *storedJob) {
			job.ContentType = result.ContentType
			job.DurationMS = result.DurationMS
			job.Provider = result.Provider
			job.Voice = result.Voice
			job.audio = result.Audio
			job.VoiceCheck = toVoiceCheck(check)
		})
		service.failJobByID(id, err)
		return
	}

	service.updateJob(id, func(job *storedJob) {
		setProgress(job, string(JobStatusChecking), "Saving final audio", "Writing completed WAV output to local job storage.", job.Retries.TotalSegments, job.Retries.TotalSegments)
	})

	audioPath, err := service.writeJobAudio(id, result.Audio)
	if err != nil {
		service.failJobByID(id, fmt.Errorf("save completed audio: %w", err))
		return
	}

	now := time.Now().UTC()
	var metadataErr error
	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusCompleted
		job.Stages.Synthesis = StageStatusDone
		job.Stages.Checker = StageStatusDone
		job.AudioURL = fmt.Sprintf("/api/voice-jobs/%s/audio", job.ID)
		job.AudioPath = audioPath
		job.ContentType = result.ContentType
		job.DurationMS = result.DurationMS
		job.Provider = result.Provider
		job.Voice = result.Voice
		job.VoiceCheck = toVoiceCheck(check)
		job.audio = result.Audio
		job.CompletedAt = &now
		setProgress(job, string(JobStatusCompleted), "Audio checked and ready", "All generated segments passed voice checking.", job.Retries.TotalSegments, job.Retries.TotalSegments)
		metadataErr = service.writeJobMetadata(job.VoiceJob)
	})
	if metadataErr != nil {
		service.failJobByID(id, fmt.Errorf("save job metadata: %w", metadataErr))
	}
}

func (service *Service) optimizeText(ctx context.Context, id string, inputText string) (string, error) {
	streamingOptimizer, ok := service.optimizer.(StreamingVoiceOptimizer)
	if !ok {
		return service.optimizer.Optimize(ctx, inputText)
	}

	var streamed strings.Builder
	optimizedText, err := streamingOptimizer.OptimizeStream(ctx, inputText, func(delta string) {
		if delta == "" {
			return
		}

		streamed.WriteString(delta)
		preview := stripStreamingPreview(streamed.String())
		service.updateJob(id, func(job *storedJob) {
			job.OptimizedText = preview
			setProgress(
				job,
				string(JobStatusOptimizing),
				"Streaming optimized text",
				fmt.Sprintf("%d optimized characters received so far.", len([]rune(preview))),
				0,
				0,
			)
		})
	})
	if err != nil {
		return "", err
	}

	return strings.TrimSpace(optimizedText), nil
}

func (service *Service) synthesizeUntilComplete(ctx context.Context, id string, optimizedText string) (agents.TTSResult, agents.VoiceCheckResult, error) {
	var mergedResult agents.TTSResult
	var lastCheck agents.VoiceCheckResult
	segments := splitTextSegments(optimizedText, service.options.SegmentMaxRunes)
	audioSegments := make([][]byte, 0, len(segments))
	transcripts := make([]string, 0, len(segments))
	similarities := make([]float64, 0, len(segments))
	totalDurationMS := 0
	totalAttempts := 0

	service.updateJob(id, func(job *storedJob) {
		job.Retries.TotalSegments = len(segments)
		setProgress(job, string(JobStatusSynthesizing), "Starting segmented synthesis", fmt.Sprintf("%d segments will be synthesized and checked.", len(segments)), 0, len(segments))
	})

	for segmentIndex, expectedSegment := range segments {
		segmentNumber := segmentIndex + 1
		resumeText := expectedSegment
		committedSegmentChunks := make([][]byte, 0, service.options.MaxRetries)
		committedSegmentDurationMS := 0

		for attempt := 1; attempt <= service.options.MaxRetries; attempt++ {
			totalAttempts++
			service.updateJob(id, func(job *storedJob) {
				job.Status = JobStatusSynthesizing
				if attempt > 1 {
					job.Status = JobStatusRetrying
				}
				job.Stages.Synthesis = StageStatusRunning
				job.Stages.Checker = StageStatusWaiting
				job.Retries.Attempts = totalAttempts
				job.Retries.SegmentAttempts = attempt
				job.Retries.CurrentSegment = segmentNumber
				job.Retries.TotalSegments = len(segments)
				setProgress(
					job,
					string(job.Status),
					fmt.Sprintf("Synthesizing segment %d of %d", segmentNumber, len(segments)),
					fmt.Sprintf("Attempt %d of %d for this segment; %d characters in this pass.", attempt, service.options.MaxRetries, len([]rune(resumeText))),
					segmentNumber,
					len(segments),
				)
			})

			result, err := service.tts.Synthesize(ctx, resumeText)
			if err != nil {
				return mergedResult, lastCheck, fmt.Errorf("synthesize text: %w", err)
			}

			candidateSegmentChunks := appendCopy(committedSegmentChunks, result.Audio)
			candidateAudioSegments := appendCopy(audioSegments, candidateSegmentChunks...)
			candidateDurationMS := totalDurationMS + committedSegmentDurationMS + result.DurationMS
			mergedAudio, _, err := audio.ConcatWAV(candidateAudioSegments)
			if err != nil {
				return mergedResult, lastCheck, fmt.Errorf("merge synthesized audio: %w", err)
			}
			segmentAudio, _, err := audio.ConcatWAV(candidateSegmentChunks)
			if err != nil {
				return mergedResult, lastCheck, fmt.Errorf("merge segment audio: %w", err)
			}
			mergedResult = agents.TTSResult{
				Audio:       mergedAudio,
				ContentType: result.ContentType,
				DurationMS:  candidateDurationMS,
				Provider:    result.Provider,
				Voice:       result.Voice,
			}

			service.updateJob(id, func(job *storedJob) {
				job.Stages.Synthesis = StageStatusDone
				job.Status = JobStatusChecking
				job.Stages.Checker = StageStatusRunning
				job.ContentType = mergedResult.ContentType
				job.DurationMS = mergedResult.DurationMS
				job.Provider = mergedResult.Provider
				job.Voice = mergedResult.Voice
				setProgress(
					job,
					string(JobStatusChecking),
					fmt.Sprintf("Checking segment %d of %d", segmentNumber, len(segments)),
					fmt.Sprintf("Qwen ASR is checking %s of generated audio. Longer segments can take several minutes on CPU.", formatMilliseconds(result.DurationMS)),
					segmentNumber,
					len(segments),
				)
			})

			check, err := service.checker.Check(ctx, expectedSegment, segmentAudio)
			if err != nil {
				return mergedResult, lastCheck, fmt.Errorf("check audio: %w", err)
			}
			lastCheck = check

			service.updateJob(id, func(job *storedJob) {
				job.VoiceCheck = toVoiceCheck(check)
				setProgress(
					job,
					string(JobStatusChecking),
					fmt.Sprintf("Checked segment %d of %d", segmentNumber, len(segments)),
					check.Reason,
					segmentNumber,
					len(segments),
				)
			})

			if check.Complete {
				audioSegments = candidateAudioSegments
				totalDurationMS = candidateDurationMS
				transcripts = append(transcripts, check.Transcript)
				similarities = append(similarities, check.Similarity)
				break
			}

			if check.NeedsResume && strings.TrimSpace(check.ResumeText) != "" && attempt < service.options.MaxRetries {
				committedSegmentChunks = candidateSegmentChunks
				committedSegmentDurationMS += result.DurationMS
				resumeText = check.ResumeText
				service.updateJob(id, func(job *storedJob) {
					job.Status = JobStatusRetrying
					job.Stages.Synthesis = StageStatusRunning
					job.Stages.Checker = StageStatusWaiting
					setProgress(
						job,
						string(JobStatusRetrying),
						fmt.Sprintf("Resuming segment %d of %d", segmentNumber, len(segments)),
						"Checker found a clean cutoff; the next attempt will synthesize the remaining text.",
						segmentNumber,
						len(segments),
					)
				})
				continue
			}

			if attempt < service.options.MaxRetries {
				service.updateJob(id, func(job *storedJob) {
					job.Status = JobStatusRetrying
					job.Stages.Synthesis = StageStatusRunning
					job.Stages.Checker = StageStatusWaiting
					setProgress(
						job,
						string(JobStatusRetrying),
						fmt.Sprintf("Regenerating segment %d of %d", segmentNumber, len(segments)),
						fmt.Sprintf("Checker did not accept attempt %d; regenerating this same segment.", attempt),
						segmentNumber,
						len(segments),
					)
				})
			}
		}

		if !lastCheck.Complete {
			service.updateJob(id, func(job *storedJob) {
				job.Stages.Synthesis = StageStatusDone
				job.Stages.Checker = StageStatusFailed
				setProgress(
					job,
					string(JobStatusFailed),
					fmt.Sprintf("Voice checker retry limit reached on segment %d of %d", segmentNumber, len(segments)),
					lastCheck.Reason,
					segmentNumber,
					len(segments),
				)
			})
			return mergedResult, lastCheck, ErrRetryExhaust
		}

		service.updateJob(id, func(job *storedJob) {
			job.Status = JobStatusSynthesizing
			job.Stages.Synthesis = StageStatusRunning
			job.Stages.Checker = StageStatusWaiting
			setProgress(
				job,
				string(JobStatusSynthesizing),
				fmt.Sprintf("Segment %d of %d passed", segmentNumber, len(segments)),
				"Moving to the next synthesis segment.",
				segmentNumber,
				len(segments),
			)
		})
	}

	return mergedResult, aggregateVoiceCheck(transcripts, similarities, lastCheck.Provider), nil
}

func (service *Service) writeJobAudio(id string, audioBytes []byte) (string, error) {
	if len(audioBytes) == 0 {
		return "", ErrAudioNotReady
	}

	outputDir, err := filepath.Abs(filepath.Join(service.options.JobDataDir, id))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return "", err
	}

	audioPath := filepath.Join(outputDir, "audio.wav")
	if err := os.WriteFile(audioPath, audioBytes, 0o644); err != nil {
		return "", err
	}

	return audioPath, nil
}

func (service *Service) writeJobMetadata(job VoiceJob) error {
	if job.AudioPath == "" {
		return nil
	}

	metadataPath := filepath.Join(filepath.Dir(job.AudioPath), "metadata.json")
	payload, err := json.MarshalIndent(job, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(metadataPath, append(payload, '\n'), 0o644)
}

func aggregateVoiceCheck(transcripts []string, similarities []float64, provider string) agents.VoiceCheckResult {
	if len(transcripts) == 0 {
		return agents.VoiceCheckResult{
			Complete: false,
			Reason:   "checker did not produce any segment transcripts",
			Provider: provider,
		}
	}

	totalSimilarity := 0.0
	for _, similarity := range similarities {
		totalSimilarity += similarity
	}
	averageSimilarity := 0.0
	if len(similarities) > 0 {
		averageSimilarity = totalSimilarity / float64(len(similarities))
	}
	if provider == "" {
		provider = "unknown"
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  strings.Join(transcripts, "\n\n"),
		NeedsResume: false,
		Reason:      "all generated segments passed voice checking",
		Provider:    provider,
		Similarity:  averageSimilarity,
	}
}

func appendCopy(chunks [][]byte, more ...[]byte) [][]byte {
	copied := make([][]byte, 0, len(chunks)+len(more))
	copied = append(copied, chunks...)
	copied = append(copied, more...)

	return copied
}

func stripStreamingPreview(value string) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}

	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimPrefix(trimmed, "text")
	trimmed = strings.TrimPrefix(trimmed, "markdown")
	return strings.TrimSpace(strings.TrimSuffix(trimmed, "```"))
}

func splitTextSegments(text string, maxRunes int) []string {
	cleanText := strings.TrimSpace(text)
	if cleanText == "" {
		return nil
	}
	if maxRunes <= 0 {
		maxRunes = defaultSegmentMaxRunes
	}

	pieces := splitSentencePieces(cleanText)
	segments := make([]string, 0, len(pieces))
	current := ""
	for _, piece := range pieces {
		for _, part := range splitLongPiece(piece, maxRunes) {
			if current == "" {
				current = part
				continue
			}

			if runeLen(current)+1+runeLen(part) <= maxRunes {
				current = current + " " + part
				continue
			}

			segments = append(segments, current)
			current = part
		}
	}
	if current != "" {
		segments = append(segments, current)
	}

	if len(segments) == 0 {
		return []string{cleanText}
	}

	return segments
}

func splitSentencePieces(text string) []string {
	runes := []rune(text)
	pieces := make([]string, 0)
	var builder strings.Builder

	for index, value := range runes {
		builder.WriteRune(value)
		nextIsBoundary := index == len(runes)-1 || isBoundaryWhitespace(runes[index+1])
		if value == '\n' || ((value == '.' || value == '?' || value == '!') && nextIsBoundary) {
			if piece := strings.TrimSpace(builder.String()); piece != "" {
				pieces = append(pieces, piece)
			}
			builder.Reset()
		}
	}

	if piece := strings.TrimSpace(builder.String()); piece != "" {
		pieces = append(pieces, piece)
	}

	return pieces
}

func splitLongPiece(piece string, maxRunes int) []string {
	if runeLen(piece) <= maxRunes {
		return []string{piece}
	}

	words := strings.Fields(piece)
	parts := make([]string, 0, len(words))
	current := ""
	for _, word := range words {
		if current == "" {
			current = word
			continue
		}

		if runeLen(current)+1+runeLen(word) <= maxRunes {
			current = current + " " + word
			continue
		}

		parts = append(parts, current)
		current = word
	}
	if current != "" {
		parts = append(parts, current)
	}

	return parts
}

func isBoundaryWhitespace(value rune) bool {
	return value == ' ' || value == '\n' || value == '\t' || value == '\r'
}

func runeLen(value string) int {
	return len([]rune(value))
}

func formatMilliseconds(milliseconds int) string {
	if milliseconds <= 0 {
		return "unknown duration"
	}

	duration := time.Duration(milliseconds) * time.Millisecond
	minutes := int(duration.Minutes())
	seconds := int(duration.Seconds()) % 60
	if minutes > 0 {
		return fmt.Sprintf("%dm %02ds", minutes, seconds)
	}

	return fmt.Sprintf("%.1fs", float64(milliseconds)/1000)
}

func (service *Service) snapshot(id string) (VoiceJob, error) {
	service.mu.RLock()
	defer service.mu.RUnlock()

	job, ok := service.jobs[id]
	if !ok {
		return VoiceJob{}, ErrJobNotFound
	}

	return job.VoiceJob, nil
}

func (service *Service) failJobByID(id string, err error) {
	service.updateJob(id, func(job *storedJob) {
		job.Status = JobStatusFailed
		job.Error = err.Error()
		if job.Stages.Optimization == StageStatusRunning {
			job.Stages.Optimization = StageStatusFailed
		}
		if job.Stages.Synthesis == StageStatusRunning {
			job.Stages.Synthesis = StageStatusFailed
		}
		if job.Stages.Checker == StageStatusRunning {
			job.Stages.Checker = StageStatusFailed
		}
		now := time.Now().UTC()
		job.CompletedAt = &now
		setProgress(job, string(JobStatusFailed), "Job failed", err.Error(), job.Retries.CurrentSegment, job.Retries.TotalSegments)
	})
}

func (service *Service) save(job storedJob) {
	service.mu.Lock()
	defer service.mu.Unlock()

	service.jobs[job.ID] = job
}

func (service *Service) updateJob(id string, mutate func(*storedJob)) {
	service.mu.Lock()
	defer service.mu.Unlock()

	job, ok := service.jobs[id]
	if !ok {
		return
	}

	mutate(&job)
	job.UpdatedAt = time.Now().UTC()
	service.jobs[id] = job
}

func toVoiceCheck(check agents.VoiceCheckResult) VoiceCheck {
	return VoiceCheck{
		Complete:    check.Complete,
		Transcript:  check.Transcript,
		ResumeText:  check.ResumeText,
		NeedsResume: check.NeedsResume,
		Reason:      check.Reason,
		Provider:    check.Provider,
		Similarity:  check.Similarity,
	}
}

func optimizerName(optimizer VoiceOptimizer) string {
	named, ok := optimizer.(namedVoiceOptimizer)
	if !ok {
		return "unknown"
	}

	return named.ProviderName()
}

func initialStages() PipelineStages {
	return PipelineStages{
		Optimization: StageStatusWaiting,
		Synthesis:    StageStatusWaiting,
		Checker:      StageStatusWaiting,
	}
}

func setProgress(job *storedJob, activeStage string, message string, detail string, currentSegment int, totalSegments int) {
	startedAt := time.Now().UTC()
	job.Progress = JobProgress{
		Message:        message,
		Detail:         detail,
		ActiveStage:    activeStage,
		CurrentSegment: currentSegment,
		TotalSegments:  totalSegments,
		StartedAt:      &startedAt,
	}
}

func newID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}

	return hex.EncodeToString(bytes)
}
