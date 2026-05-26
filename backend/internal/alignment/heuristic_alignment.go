package alignment

import "math"

func BuildHeuristicFallbackTiming(request NormalizeRequest, reason string) (NormalizedTiming, error) {
	timing, err := NormalizeTiming(NormalizeRequest{
		JobID:       request.JobID,
		DurationMS:  request.DurationMS,
		GeneratedAt: request.GeneratedAt,
		Segments:    request.Segments,
	})
	if err != nil {
		return timing, err
	}
	if reason == "" {
		reason = "degraded heuristic timing fallback"
	}
	for index := range timing.Tokens.Tokens {
		timing.Tokens.Tokens[index].Confidence = math.Min(timing.Tokens.Tokens[index].Confidence, 0.55)
		timing.Tokens.Tokens[index].Source = TimingSourceHeuristic
	}
	for index := range timing.Fragments.Fragments {
		timing.Fragments.Fragments[index].Confidence = math.Min(timing.Fragments.Fragments[index].Confidence, 0.7)
		timing.Fragments.Fragments[index].Source = TimingSourceHeuristic
	}
	confidence := summarizeConfidence(timing.Fragments.Fragments, timing.Tokens.Tokens, 0, TimingSourceHeuristic)
	confidence.Reason = "phrase-level estimate; word timing is not trusted"
	timing.Fragments.Source = TimingSourceHeuristic
	timing.Tokens.Source = TimingSourceHeuristic
	timing.Fragments.Confidence = confidence
	timing.Tokens.Confidence = confidence
	timing.Fragments.Warnings = uniqueWarnings(append(timing.Fragments.Warnings, reason))
	timing.Tokens.Warnings = uniqueWarnings(append(timing.Tokens.Warnings, reason))
	return timing, nil
}

func HeuristicFallbackStage(detail string) AlignmentStageReport {
	return AlignmentStageReport{ID: "heuristic-fallback", Status: "selected", Detail: detail}
}
