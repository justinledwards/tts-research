package alignment

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"time"
)

type AlignmentServiceOptions struct {
	Mode                           AlignmentMode
	Aligner                        AlignerOptions
	WorkDir                        string
	AlignmentRequiredForWordTiming bool
}

type AlignmentServiceRequest struct {
	JobID        string
	AudioPath    string
	DurationMS   int
	GeneratedAt  time.Time
	Language     string
	Segments     []SegmentInput
	NativeEvents []NativeTimingEvent
	Final        bool
}

type AlignmentServiceResult struct {
	Timing   NormalizedTiming
	Quality  AlignmentQualityReport
	Warnings []string
}

type AlignmentService struct {
	options AlignmentServiceOptions
}

func NewAlignmentService(options AlignmentServiceOptions) AlignmentService {
	options.Mode = normalizeAlignmentMode(options.Mode, options.Aligner.Enabled)
	return AlignmentService{options: options}
}

func (service AlignmentService) Generate(
	ctx context.Context,
	request AlignmentServiceRequest,
) (AlignmentServiceResult, error) {
	if service.options.Mode == AlignmentModeOff {
		return AlignmentServiceResult{}, ErrNoTimingInput
	}
	if request.GeneratedAt.IsZero() {
		request.GeneratedAt = time.Now().UTC()
	}

	stages := make([]AlignmentStageReport, 0, 4)
	warnings := make([]string, 0)
	providerTiming, providerOK := NormalizeProviderTiming(NormalizeRequest{
		JobID:        request.JobID,
		DurationMS:   request.DurationMS,
		GeneratedAt:  request.GeneratedAt,
		Segments:     request.Segments,
		NativeEvents: request.NativeEvents,
	})
	stages = append(stages, ProviderTimingStage(providerOK, providerTimingDetail(providerOK)))

	switch service.options.Mode {
	case AlignmentModeProviderOnly:
		if providerOK {
			return service.result(providerTiming, stages, warnings), nil
		}
		return service.heuristic(request, stages, "provider timing unavailable")
	case AlignmentModeHeuristicFallback:
		return service.heuristic(request, stages, "alignment mode requested heuristic fallback")
	}

	forcedTiming, forcedOK, forcedErr := service.tryForcedAlignment(ctx, request)
	if forcedOK {
		stages = append(stages, ForcedAlignmentStage(true, "local forced alignment completed"))
		if !providerOK || shouldUseForcedTiming(providerTiming, forcedTiming, service.options.AlignmentRequiredForWordTiming) {
			return service.result(forcedTiming, stages, warnings), nil
		}
		stages[len(stages)-1].Status = "validation"
		stages[len(stages)-1].Detail = "local forced alignment was available; provider word timing remained the selected source"
		return service.result(providerTiming, stages, warnings), nil
	}
	if forcedErr != nil && !errors.Is(forcedErr, ErrAlignerUnavailable) {
		warnings = append(warnings, "forced alignment failed: "+forcedErr.Error())
	}
	if forcedErr != nil {
		stages = append(stages, ForcedAlignmentStage(false, forcedErr.Error()))
	} else {
		stages = append(stages, ForcedAlignmentStage(false, "not eligible for local forced alignment"))
	}

	if service.options.Mode == AlignmentModeLocalForcedRequired {
		return AlignmentServiceResult{}, fmt.Errorf("%w: local forced alignment is required", ErrAlignerUnavailable)
	}
	if providerOK {
		return service.result(providerTiming, stages, warnings), nil
	}
	return service.heuristic(request, stages, "provider timing and local forced alignment unavailable")
}

func (service AlignmentService) tryForcedAlignment(
	ctx context.Context,
	request AlignmentServiceRequest,
) (NormalizedTiming, bool, error) {
	if !request.Final || request.AudioPath == "" || !service.options.Aligner.Enabled {
		return NormalizedTiming{}, false, ErrAlignerUnavailable
	}
	alignRequest := AlignRequest{
		JobID:      request.JobID,
		AudioPath:  request.AudioPath,
		DurationMS: request.DurationMS,
		Language:   request.Language,
		Segments:   request.Segments,
		WorkDir:    service.options.WorkDir,
	}
	if alignRequest.WorkDir == "" {
		alignRequest.WorkDir = filepath.Join(".", ".alignment-work")
	}
	timing, err := RunForcedAlignment(ctx, alignRequest, service.options.Aligner)
	if err != nil {
		return NormalizedTiming{}, false, err
	}
	return timing, true, nil
}

func (service AlignmentService) heuristic(
	request AlignmentServiceRequest,
	stages []AlignmentStageReport,
	reason string,
) (AlignmentServiceResult, error) {
	timing, err := BuildHeuristicFallbackTiming(NormalizeRequest{
		JobID:       request.JobID,
		DurationMS:  request.DurationMS,
		GeneratedAt: request.GeneratedAt,
		Segments:    request.Segments,
	}, reason)
	if err != nil {
		return AlignmentServiceResult{}, err
	}
	stages = append(stages, HeuristicFallbackStage(reason))
	return service.result(timing, stages, []string{reason}), nil
}

func (service AlignmentService) result(
	timing NormalizedTiming,
	stages []AlignmentStageReport,
	warnings []string,
) AlignmentServiceResult {
	report := AlignmentReportForTiming(timing, service.options.Mode, warnings, stages)
	return AlignmentServiceResult{
		Timing:   timing,
		Quality:  report,
		Warnings: uniqueWarnings(append(warnings, report.AlignmentWarnings...)),
	}
}

func providerTimingDetail(ok bool) string {
	if ok {
		return "provider timing was monotonic and inside generated audio duration"
	}
	return "provider word or mark timing was unavailable or failed trust checks"
}

func shouldUseForcedTiming(provider NormalizedTiming, forced NormalizedTiming, requireWordTiming bool) bool {
	providerReport := AlignmentReportForTiming(provider, AlignmentModeProviderOnly, nil, nil)
	if providerReport.WordTimingReliable && !requireWordTiming {
		return false
	}
	forcedReport := AlignmentReportForTiming(forced, AlignmentModeLocalForcedAlignment, nil, nil)
	if forcedReport.WordTimingReliable && !providerReport.WordTimingReliable {
		return true
	}
	return forcedReport.Quality == AlignmentQualityExact && providerReport.Quality != AlignmentQualityExact
}
