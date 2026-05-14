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
	ErrVoiceNotFound = errors.New("voice not found")
	ErrInvalidVoice  = errors.New("voice upload is invalid")
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
	Synthesize(context.Context, agents.SynthesisRequest) (agents.TTSResult, error)
}

type VoiceChecker interface {
	Check(context.Context, string, []byte) (agents.VoiceCheckResult, error)
}

type Options struct {
	MaxRetries      int
	SegmentMaxRunes int
	TTSWorkerCount  int
	JobDataDir      string
	VoiceDataDir    string
	FFMPEGPath      string
}

const (
	defaultSegmentMaxRunes = 220
	defaultTTSWorkerCount  = 2
	defaultJobDataDir      = "./data/jobs"
	defaultVoiceDataDir    = "./data/voices"
	defaultFFMPEGPath      = "ffmpeg"
)

type Service struct {
	optimizer VoiceOptimizer
	tts       TTSAgent
	checker   VoiceChecker
	options   Options
	mu        sync.RWMutex
	jobs      map[string]storedJob
	voices    map[string]Voice
}

func NewService(optimizer VoiceOptimizer, tts TTSAgent, checker VoiceChecker, options Options) *Service {
	if options.MaxRetries <= 0 {
		options.MaxRetries = 3
	}
	if options.SegmentMaxRunes <= 0 {
		options.SegmentMaxRunes = defaultSegmentMaxRunes
	}
	if options.TTSWorkerCount <= 0 {
		options.TTSWorkerCount = defaultTTSWorkerCount
	}
	if strings.TrimSpace(options.JobDataDir) == "" {
		options.JobDataDir = defaultJobDataDir
	}
	if strings.TrimSpace(options.VoiceDataDir) == "" {
		options.VoiceDataDir = defaultVoiceDataDir
	}
	if strings.TrimSpace(options.FFMPEGPath) == "" {
		options.FFMPEGPath = defaultFFMPEGPath
	}

	service := &Service{
		optimizer: optimizer,
		tts:       tts,
		checker:   checker,
		options:   options,
		jobs:      map[string]storedJob{},
		voices:    map[string]Voice{},
	}
	service.loadCloneVoices()

	return service
}

func (service *Service) CreateJob(_ context.Context, request CreateJobRequest) (VoiceJob, error) {
	text := request.Text
	inputText := strings.TrimSpace(text)
	if inputText == "" {
		return VoiceJob{}, ErrEmptyText
	}
	voice, err := service.ResolveVoice(request.VoiceID)
	if err != nil {
		return VoiceJob{}, err
	}

	now := time.Now().UTC()
	job := storedJob{
		VoiceJob: VoiceJob{
			ID:        newID(),
			Status:    JobStatusQueued,
			Stages:    initialStages(),
			InputText: inputText,
			VoiceID:   voice.ID,
			Voice:     voice.Name,
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

	voice, err := service.ResolveVoice(job.VoiceID)
	if err != nil {
		service.failJobByID(id, err)
		return
	}

	result, check, err := service.synthesizeUntilComplete(ctx, id, optimizedText, voice)
	if err != nil {
		service.updateJob(id, func(job *storedJob) {
			job.ContentType = result.ContentType
			job.DurationMS = result.DurationMS
			job.Provider = result.Provider
			job.VoiceID = voice.ID
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
		job.VoiceID = voice.ID
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

type segmentWork struct {
	index int
	text  string
}

type segmentResult struct {
	index       int
	audio       []byte
	contentType string
	durationMS  int
	provider    string
	voice       string
	check       agents.VoiceCheckResult
	err         error
}

func (service *Service) synthesizeUntilComplete(ctx context.Context, id string, optimizedText string, voice Voice) (agents.TTSResult, agents.VoiceCheckResult, error) {
	var mergedResult agents.TTSResult
	var lastCheck agents.VoiceCheckResult
	segments := splitTextSegments(optimizedText, service.options.SegmentMaxRunes)
	audioSegments := make([][]byte, 0, len(segments))
	transcripts := make([]string, 0, len(segments))
	similarities := make([]float64, 0, len(segments))
	totalDurationMS := 0
	totalAttempts := 0
	workerCount := minInt(service.options.TTSWorkerCount, len(segments))
	if workerCount <= 0 {
		workerCount = 1
	}
	var attemptMu sync.Mutex
	nextAttempt := func() int {
		attemptMu.Lock()
		defer attemptMu.Unlock()
		totalAttempts++

		return totalAttempts
	}

	service.updateJob(id, func(job *storedJob) {
		job.Retries.TotalSegments = len(segments)
		job.Retries.WorkerCount = workerCount
		setProgress(job, string(JobStatusSynthesizing), "Starting segmented synthesis", fmt.Sprintf("%d segments will be synthesized and checked with %d workers.", len(segments), workerCount), 0, len(segments))
	})

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	workCh := make(chan segmentWork)
	resultCh := make(chan segmentResult, len(segments))
	var workerWG sync.WaitGroup
	for workerIndex := 0; workerIndex < workerCount; workerIndex++ {
		workerWG.Add(1)
		go func() {
			defer workerWG.Done()
			for work := range workCh {
				resultCh <- service.synthesizeSegment(ctx, id, work.index, len(segments), work.text, voice, nextAttempt)
			}
		}()
	}
	go func() {
		defer close(workCh)
		for index, segment := range segments {
			select {
			case workCh <- segmentWork{index: index, text: segment}:
			case <-ctx.Done():
				return
			}
		}
	}()

	results := make([]segmentResult, len(segments))
	received := make([]bool, len(segments))
	nextCommitIndex := 0
	for completedResults := 0; completedResults < len(segments); completedResults++ {
		result := <-resultCh
		if result.err != nil {
			cancel()
			workerWG.Wait()
			if result.check.Provider != "" || result.check.Reason != "" {
				lastCheck = result.check
			}

			return mergedResult, lastCheck, result.err
		}

		results[result.index] = result
		received[result.index] = true
		for nextCommitIndex < len(segments) && received[nextCommitIndex] {
			ready := results[nextCommitIndex]
			audioSegments = append(audioSegments, ready.audio)
			totalDurationMS += ready.durationMS
			lastCheck = ready.check
			transcripts = append(transcripts, ready.check.Transcript)
			similarities = append(similarities, ready.check.Similarity)
			mergedAudio, _, err := audio.ConcatWAV(audioSegments)
			if err != nil {
				cancel()
				workerWG.Wait()
				return mergedResult, lastCheck, fmt.Errorf("merge playable audio: %w", err)
			}

			mergedResult = agents.TTSResult{
				Audio:       mergedAudio,
				ContentType: ready.contentType,
				DurationMS:  totalDurationMS,
				Provider:    ready.provider,
				Voice:       ready.voice,
			}
			nextCommitIndex++
			committedSegments := nextCommitIndex
			committedCheck := aggregateVoiceCheck(transcripts, similarities, lastCheck.Provider)
			service.updateJob(id, func(job *storedJob) {
				job.Status = JobStatusSynthesizing
				job.Stages.Synthesis = StageStatusRunning
				job.Stages.Checker = StageStatusRunning
				job.AudioURL = fmt.Sprintf("/api/voice-jobs/%s/audio", job.ID)
				job.ContentType = mergedResult.ContentType
				job.DurationMS = mergedResult.DurationMS
				job.Provider = mergedResult.Provider
				job.VoiceID = voice.ID
				job.Voice = mergedResult.Voice
				job.audio = mergedResult.Audio
				job.VoiceCheck = toVoiceCheck(committedCheck)
				job.Retries.CompletedSegments = committedSegments
				setProgress(
					job,
					string(JobStatusSynthesizing),
					fmt.Sprintf("Segment %d of %d ready", committedSegments, len(segments)),
					"Verified audio is playable while remaining segments continue.",
					committedSegments,
					len(segments),
				)
			})
		}
	}
	workerWG.Wait()

	return mergedResult, aggregateVoiceCheck(transcripts, similarities, lastCheck.Provider), nil
}

func (service *Service) synthesizeSegment(ctx context.Context, id string, segmentIndex int, totalSegments int, expectedSegment string, voice Voice, nextAttempt func() int) segmentResult {
	segmentNumber := segmentIndex + 1
	resumeText := expectedSegment
	committedSegmentChunks := make([][]byte, 0, service.options.MaxRetries)
	committedSegmentDurationMS := 0
	var lastCheck agents.VoiceCheckResult
	var segmentAudio []byte
	var contentType string
	var provider string
	var resultVoice string

	for attempt := 1; attempt <= service.options.MaxRetries; attempt++ {
		totalAttempt := nextAttempt()
		service.updateJob(id, func(job *storedJob) {
			job.Status = JobStatusSynthesizing
			if attempt > 1 {
				job.Status = JobStatusRetrying
			}
			job.Stages.Synthesis = StageStatusRunning
			job.Stages.Checker = StageStatusRunning
			job.Retries.Attempts = totalAttempt
			job.Retries.SegmentAttempts = attempt
			job.Retries.CurrentSegment = segmentNumber
			job.Retries.TotalSegments = totalSegments
			setProgress(
				job,
				string(job.Status),
				fmt.Sprintf("Synthesizing segment %d of %d", segmentNumber, totalSegments),
				fmt.Sprintf("Attempt %d of %d for this segment; %d characters in this pass.", attempt, service.options.MaxRetries, len([]rune(resumeText))),
				segmentNumber,
				totalSegments,
			)
		})

		result, err := service.tts.Synthesize(ctx, agents.SynthesisRequest{
			Text:               resumeText,
			Voice:              voiceSynthesisName(voice),
			LangCode:           voice.LangCode,
			ReferenceAudioPath: voice.ReferenceAudioPath,
		})
		if err != nil {
			return segmentResult{index: segmentIndex, check: lastCheck, err: fmt.Errorf("synthesize text: %w", err)}
		}

		candidateSegmentChunks := appendCopy(committedSegmentChunks, result.Audio)
		candidateDurationMS := committedSegmentDurationMS + result.DurationMS
		segmentAudio, _, err = audio.ConcatWAV(candidateSegmentChunks)
		if err != nil {
			return segmentResult{index: segmentIndex, check: lastCheck, err: fmt.Errorf("merge segment audio: %w", err)}
		}
		contentType = result.ContentType
		provider = result.Provider
		resultVoice = result.Voice

		service.updateJob(id, func(job *storedJob) {
			job.Status = JobStatusChecking
			job.Stages.Synthesis = StageStatusRunning
			job.Stages.Checker = StageStatusRunning
			job.ContentType = contentType
			job.Provider = provider
			job.VoiceID = voice.ID
			job.Voice = resultVoice
			setProgress(
				job,
				string(JobStatusChecking),
				fmt.Sprintf("Checking segment %d of %d", segmentNumber, totalSegments),
				fmt.Sprintf("Qwen ASR is checking %s of generated audio. Longer segments can take several minutes on CPU.", formatMilliseconds(result.DurationMS)),
				segmentNumber,
				totalSegments,
			)
		})

		check, err := service.checker.Check(ctx, expectedSegment, segmentAudio)
		if err != nil {
			return segmentResult{index: segmentIndex, check: lastCheck, err: fmt.Errorf("check audio: %w", err)}
		}
		lastCheck = check

		service.updateJob(id, func(job *storedJob) {
			job.VoiceCheck = toVoiceCheck(check)
			setProgress(
				job,
				string(JobStatusChecking),
				fmt.Sprintf("Checked segment %d of %d", segmentNumber, totalSegments),
				check.Reason,
				segmentNumber,
				totalSegments,
			)
		})

		if check.Complete {
			return segmentResult{
				index:       segmentIndex,
				audio:       segmentAudio,
				contentType: contentType,
				durationMS:  candidateDurationMS,
				provider:    provider,
				voice:       resultVoice,
				check:       check,
			}
		}

		if check.NeedsResume && strings.TrimSpace(check.ResumeText) != "" && attempt < service.options.MaxRetries {
			committedSegmentChunks = candidateSegmentChunks
			committedSegmentDurationMS = candidateDurationMS
			resumeText = check.ResumeText
			service.updateJob(id, func(job *storedJob) {
				job.Status = JobStatusRetrying
				job.Stages.Synthesis = StageStatusRunning
				job.Stages.Checker = StageStatusWaiting
				setProgress(
					job,
					string(JobStatusRetrying),
					fmt.Sprintf("Resuming segment %d of %d", segmentNumber, totalSegments),
					"Checker found a clean cutoff; the next attempt will synthesize the remaining text.",
					segmentNumber,
					totalSegments,
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
					fmt.Sprintf("Regenerating segment %d of %d", segmentNumber, totalSegments),
					fmt.Sprintf("Checker did not accept attempt %d; regenerating this same segment.", attempt),
					segmentNumber,
					totalSegments,
				)
			})
		}
	}

	service.updateJob(id, func(job *storedJob) {
		job.Stages.Synthesis = StageStatusDone
		job.Stages.Checker = StageStatusFailed
		setProgress(
			job,
			string(JobStatusFailed),
			fmt.Sprintf("Voice checker retry limit reached on segment %d of %d", segmentNumber, totalSegments),
			lastCheck.Reason,
			segmentNumber,
			totalSegments,
		)
	})

	return segmentResult{
		index:       segmentIndex,
		audio:       segmentAudio,
		contentType: contentType,
		durationMS:  committedSegmentDurationMS,
		provider:    provider,
		voice:       resultVoice,
		check:       lastCheck,
		err:         ErrRetryExhaust,
	}
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

func voiceSynthesisName(voice Voice) string {
	if voice.Kind == VoiceKindNative {
		return strings.TrimPrefix(voice.ID, "kokoro:")
	}
	if strings.TrimSpace(voice.Name) != "" {
		return voice.Name
	}

	return voice.ID
}

func minInt(left int, right int) int {
	if left < right {
		return left
	}

	return right
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
