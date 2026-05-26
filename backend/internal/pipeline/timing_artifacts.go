package pipeline

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
	"github.com/justinedwards/tts-research/backend/internal/highlightmap"
)

func (service *Service) refreshTimingArtifacts(ctx context.Context, id string, final bool) (*TimingArtifacts, error) {
	job, err := service.storedJobSnapshot(id)
	if err != nil {
		return nil, err
	}
	segments := timingSegmentsForJob(job, final)
	if len(segments) == 0 {
		return nil, alignment.ErrNoTimingInput
	}
	durationMS := job.DurationMS
	if durationMS <= 0 {
		durationMS = sumTimingSegmentDurations(segments)
	}

	alignmentResult, err := service.normalizeJobTiming(ctx, job, segments, durationMS, final)
	if err != nil {
		return nil, err
	}
	normalized := alignmentResult.Timing
	warnings := alignmentResult.Warnings
	scopeContent, _ := service.timingScopeContent(job.VoiceJob)
	scopeKey := scopeKeyForJob(job.VoiceJob)
	highlight := highlightmap.Build(highlightmap.BuildRequest{
		JobID:        job.ID,
		BookSourceID: job.BookSourceID,
		ScopeKey:     scopeKey,
		Text:         scopeContent.Text,
		WordSpans:    highlightWordSpans(scopeContent.WordSpans),
		Fragments:    normalized.Fragments,
		Tokens:       normalized.Tokens,
		GeneratedAt:  time.Now().UTC(),
	})
	highlight.Warnings = uniqueStrings(append(highlight.Warnings, warnings...))
	highlight.Summary.Warnings = highlight.Warnings
	highlight.Summary.LowConfidence = highlight.Summary.LowConfidence || len(warnings) > 0 && highlight.Mode == highlightmap.ModePhrase
	highlightV2 := highlightmap.BuildV2(highlightmap.BuildV2Request{
		JobID:        job.ID,
		BookSourceID: job.BookSourceID,
		ScopeKey:     scopeKey,
		SpeechPlanID: job.ID,
		Text:         scopeContent.Text,
		WordSpans:    highlightWordSpans(scopeContent.WordSpans),
		Fragments:    normalized.Fragments,
		Tokens:       normalized.Tokens,
		GeneratedAt:  time.Now().UTC(),
		Quality:      alignmentResult.Quality,
		Warnings:     warnings,
	})
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return nil, err
	}
	if err := highlightmap.PersistArtifacts(jobDir, highlight, normalized.Fragments, normalized.Tokens); err != nil {
		return nil, err
	}
	if err := highlightmap.PersistHighlightMapV2(jobDir, highlightV2); err != nil {
		return nil, err
	}
	if err := highlightmap.PersistAlignmentQuality(jobDir, alignmentResult.Quality); err != nil {
		return nil, err
	}

	artifacts := TimingArtifacts{
		Status:              highlight.Status,
		Summary:             highlight.Summary,
		HighlightMapURL:     fmt.Sprintf("/api/voice-jobs/%s/highlight-map", id),
		HighlightMapV2URL:   fmt.Sprintf("/api/voice-jobs/%s/highlight-map-v2", id),
		FragmentTimingURL:   fmt.Sprintf("/api/voice-jobs/%s/timing/fragments", id),
		TokenTimingURL:      fmt.Sprintf("/api/voice-jobs/%s/timing/tokens", id),
		AlignmentQualityURL: fmt.Sprintf("/api/voice-jobs/%s/timing/alignment", id),
		AlignmentQuality:    &alignmentResult.Quality,
	}
	var updatedJob VoiceJob
	service.updateJob(id, func(job *storedJob) {
		job.Timing = &artifacts
		updatedJob = job.VoiceJob
	})
	if updatedJob.AudioPath != "" {
		if err := service.writeJobMetadata(updatedJob); err != nil {
			return &artifacts, err
		}
	}
	return &artifacts, nil
}

func (service *Service) normalizeJobTiming(
	ctx context.Context,
	job storedJob,
	segments []alignment.SegmentInput,
	durationMS int,
	final bool,
) (alignment.AlignmentServiceResult, error) {
	nativeEvents := nativeEventsForSegments(job.nativeTimingEvents, len(segments))
	alignmentService := alignment.NewAlignmentService(alignment.AlignmentServiceOptions{
		Mode: service.options.Alignment.Mode,
		Aligner: alignment.AlignerOptions{
			Enabled:          service.options.Alignment.Enabled,
			Preferred:        service.options.Alignment.Preferred,
			MFABin:           service.options.Alignment.MFABin,
			MFADictionary:    service.options.Alignment.MFADictionary,
			MFAAcousticModel: service.options.Alignment.MFAAcousticModel,
			AeneasPython:     service.options.Alignment.AeneasPython,
			GentleURL:        service.options.Alignment.GentleURL,
			Timeout:          time.Duration(service.options.Alignment.TimeoutSeconds) * time.Second,
		},
		WorkDir:                        filepath.Join(service.options.JobDataDir, ".alignment-work"),
		AlignmentRequiredForWordTiming: service.options.Alignment.RequiredForWordHighlight,
	})
	return alignmentService.Generate(ctx, alignment.AlignmentServiceRequest{
		JobID:        job.ID,
		AudioPath:    job.AudioPath,
		DurationMS:   durationMS,
		GeneratedAt:  time.Now().UTC(),
		Language:     firstNonEmpty(job.TTSLanguage, job.Locale, job.VoiceProfileLanguage),
		Segments:     segments,
		NativeEvents: nativeEvents,
		Final:        final,
	})
}

func (service *Service) GetJobWithTiming(id string, includeTiming bool) (VoiceJob, error) {
	job, err := service.GetJob(id)
	if err != nil || !includeTiming || job.Timing == nil {
		return job, err
	}
	if fragments, readErr := service.GetFragmentTiming(id); readErr == nil {
		job.Timing.FragmentTiming = &fragments
	}
	if tokens, readErr := service.GetTokenTiming(id); readErr == nil {
		job.Timing.TokenTiming = &tokens
	}
	if quality, readErr := service.GetAlignmentQuality(id); readErr == nil {
		job.Timing.AlignmentQuality = &quality
	}
	return job, nil
}

func (service *Service) GetHighlightMap(id string) (highlightmap.HighlightMap, error) {
	if _, err := service.GetJob(id); err != nil {
		return highlightmap.HighlightMap{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return highlightmap.HighlightMap{}, err
	}
	payload, err := highlightmap.ReadHighlightMap(jobDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return highlightmap.HighlightMap{}, ErrAudioNotReady
		}
		return highlightmap.HighlightMap{}, err
	}
	return payload, nil
}

func (service *Service) GetHighlightMapV2(id string) (highlightmap.HighlightMapV2, error) {
	if _, err := service.GetJob(id); err != nil {
		return highlightmap.HighlightMapV2{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return highlightmap.HighlightMapV2{}, err
	}
	payload, err := highlightmap.ReadHighlightMapV2(jobDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return highlightmap.HighlightMapV2{}, ErrAudioNotReady
		}
		return highlightmap.HighlightMapV2{}, err
	}
	return payload, nil
}

func (service *Service) GetAlignmentQuality(id string) (alignment.AlignmentQualityReport, error) {
	if _, err := service.GetJob(id); err != nil {
		return alignment.AlignmentQualityReport{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return alignment.AlignmentQualityReport{}, err
	}
	var payload alignment.AlignmentQualityReport
	if err := highlightmap.ReadAlignmentQuality(jobDir, &payload); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return alignment.AlignmentQualityReport{}, ErrAudioNotReady
		}
		return alignment.AlignmentQualityReport{}, err
	}
	return payload, nil
}

func (service *Service) GetFragmentTiming(id string) (alignment.FragmentTimingArtifact, error) {
	if _, err := service.GetJob(id); err != nil {
		return alignment.FragmentTimingArtifact{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return alignment.FragmentTimingArtifact{}, err
	}
	payload, err := highlightmap.ReadFragmentTiming(jobDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return alignment.FragmentTimingArtifact{}, ErrAudioNotReady
		}
		return alignment.FragmentTimingArtifact{}, err
	}
	return payload, nil
}

func (service *Service) GetTokenTiming(id string) (alignment.TokenTimingArtifact, error) {
	if _, err := service.GetJob(id); err != nil {
		return alignment.TokenTimingArtifact{}, err
	}
	jobDir, err := service.jobArtifactDir(id)
	if err != nil {
		return alignment.TokenTimingArtifact{}, err
	}
	payload, err := highlightmap.ReadTokenTiming(jobDir)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return alignment.TokenTimingArtifact{}, ErrAudioNotReady
		}
		return alignment.TokenTimingArtifact{}, err
	}
	return payload, nil
}

func (service *Service) storedJobSnapshot(id string) (storedJob, error) {
	job, err := service.resolveStoredJob(id)
	if err != nil {
		return storedJob{}, err
	}
	job.audio = nil
	job.audioPartialPCM = nil
	job.audioSegments = nil
	job.nativeTimingEvents = append([]alignment.NativeTimingEvent(nil), job.nativeTimingEvents...)
	return job, nil
}

func (service *Service) jobArtifactDir(id string) (string, error) {
	return filepath.Abs(filepath.Join(service.options.JobDataDir, id))
}

func (service *Service) timingScopeContent(job VoiceJob) (BookSourceScopeContent, error) {
	if strings.TrimSpace(job.BookSourceID) == "" {
		return BookSourceScopeContent{}, ErrBookSourceNotFound
	}
	return service.GetBookSourceScope(job.BookSourceID, job.BookScope)
}

func timingSegmentsForJob(job storedJob, final bool) []alignment.SegmentInput {
	readyCount := job.AudioReadySegments
	if final || readyCount <= 0 || readyCount > len(job.Segments) {
		readyCount = len(job.Segments)
	}
	segments := make([]alignment.SegmentInput, 0, readyCount)
	startMS := 0
	for index := 0; index < readyCount && index < len(job.Segments); index += 1 {
		segment := job.Segments[index]
		durationMS := 0
		if index < len(job.AudioSegmentDurationsMS) {
			durationMS = job.AudioSegmentDurationsMS[index]
		}
		if durationMS <= 0 {
			durationMS = segment.DurationMS
		}
		if durationMS <= 0 {
			durationMS = max(900, len(strings.Fields(segment.Text))*320)
		}
		segments = append(segments, alignment.SegmentInput{
			Index:      segment.Index,
			Text:       segment.Text,
			StartMS:    startMS,
			DurationMS: durationMS,
			Confidence: 0.74,
		})
		startMS += durationMS
	}
	return segments
}

func nativeEventsForSegments(events []alignment.NativeTimingEvent, readyCount int) []alignment.NativeTimingEvent {
	if readyCount <= 0 || len(events) == 0 {
		return nil
	}
	output := make([]alignment.NativeTimingEvent, 0, len(events))
	for _, event := range events {
		if event.SegmentIndex <= 0 || event.SegmentIndex <= readyCount {
			output = append(output, event)
		}
	}
	return output
}

func sumTimingSegmentDurations(segments []alignment.SegmentInput) int {
	total := 0
	for _, segment := range segments {
		total += segment.DurationMS
	}
	return total
}

func highlightWordSpans(spans []BookSourceWordSpan) []highlightmap.WordSpan {
	output := make([]highlightmap.WordSpan, 0, len(spans))
	for _, span := range spans {
		output = append(output, highlightmap.WordSpan{
			Index:       span.Index,
			Text:        span.Text,
			PageIndex:   span.PageIndex,
			Chapter:     span.Chapter,
			StartOffset: span.StartOffset,
			EndOffset:   span.EndOffset,
		})
	}
	return output
}

func scopeKeyForJob(job VoiceJob) string {
	if job.BookScope == nil {
		return ""
	}
	switch job.BookScope.Type {
	case BookScopeTypeChapter:
		return fmt.Sprintf("chapter:%d", max(1, job.BookScope.ChapterIndex))
	case BookScopeTypePages:
		start := max(1, job.BookScope.PageStart)
		end := job.BookScope.PageEnd
		if end <= 0 {
			end = start
		}
		return fmt.Sprintf("pages:%d-%d", start, end)
	default:
		return "book"
	}
}

func timingURLsForJob(id string, summary highlightmap.Summary) *TimingArtifacts {
	return &TimingArtifacts{
		Status:              summary.Status,
		Summary:             summary,
		HighlightMapURL:     fmt.Sprintf("/api/voice-jobs/%s/highlight-map", id),
		HighlightMapV2URL:   fmt.Sprintf("/api/voice-jobs/%s/highlight-map-v2", id),
		FragmentTimingURL:   fmt.Sprintf("/api/voice-jobs/%s/timing/fragments", id),
		TokenTimingURL:      fmt.Sprintf("/api/voice-jobs/%s/timing/tokens", id),
		AlignmentQualityURL: fmt.Sprintf("/api/voice-jobs/%s/timing/alignment", id),
	}
}

func (service *Service) hydrateTimingSummary(job VoiceJob) VoiceJob {
	if job.Timing != nil {
		return job
	}
	jobDir, err := service.jobArtifactDir(job.ID)
	if err != nil {
		return job
	}
	highlight, err := highlightmap.ReadHighlightMap(jobDir)
	if err != nil {
		return job
	}
	job.Timing = timingURLsForJob(job.ID, highlight.Summary)
	return job
}
