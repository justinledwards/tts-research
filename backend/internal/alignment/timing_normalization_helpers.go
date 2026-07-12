package alignment

import (
	"math"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

var tokenPattern = regexp.MustCompile(`\S+`)

func normalizeRawTiming(request NormalizeRequest) NormalizedTiming {
	raw := *request.Raw
	source := raw.Source
	if source == "" {
		source = TimingSourceHeuristic
	}
	durationMS := firstPositive(raw.DurationMS, request.DurationMS, sumInputDuration(request.Segments))
	fragments := cloneFragments(raw.Fragments, source)
	tokens := cloneTokens(raw.Tokens, source)
	if len(fragments) == 0 {
		fragments = fragmentsFromTokens(tokens, request.Segments, source)
	}
	if len(tokens) == 0 {
		tokens = tokensFromFragments(fragments, source)
	}
	fragments, tokens, drift := CorrectDrift(fragments, tokens, durationMS)
	confidence := summarizeConfidence(fragments, tokens, raw.Confidence, source)
	status := statusForTiming(len(request.Segments), fragments)
	return artifacts(request.JobID, source, status, durationMS, request.GeneratedAt, confidence, drift, fragments, tokens, raw.Warnings)
}

func buildHeuristicTiming(request NormalizeRequest) NormalizedTiming {
	source := TimingSourceHeuristic
	fragments := make([]FragmentTiming, 0, len(request.Segments))
	tokens := make([]TokenTiming, 0)
	cursor := 0
	for index, segment := range request.Segments {
		segmentIndex := segment.Index
		if segmentIndex <= 0 {
			segmentIndex = index + 1
		}
		startMS := cursor
		if segment.StartMS > 0 {
			startMS = segment.StartMS
		}
		durationMS := segment.DurationMS
		if durationMS <= 0 {
			durationMS = estimateDurationMS(segment.Text)
		}
		endMS := startMS + durationMS
		confidence := segment.Confidence
		if confidence <= 0 {
			confidence = 0.74
		}
		fragmentIndex := len(fragments)
		tokenStart := len(tokens)
		segmentTokens := tokenize(segment.Text)
		weights := tokenWeights(segmentTokens)
		weightTotal := 0
		for _, weight := range weights {
			weightTotal += weight
		}
		consumed := 0
		for tokenIndex, token := range segmentTokens {
			tokenStartMS := startMS
			tokenEndMS := endMS
			if weightTotal > 0 {
				tokenStartMS = startMS + int(math.Round(float64(consumed)/float64(weightTotal)*float64(durationMS)))
				consumed += weights[tokenIndex]
				tokenEndMS = startMS + int(math.Round(float64(consumed)/float64(weightTotal)*float64(durationMS)))
			}
			if tokenEndMS <= tokenStartMS {
				tokenEndMS = tokenStartMS + 1
			}
			tokens = append(tokens, TokenTiming{
				Index:         len(tokens),
				FragmentIndex: fragmentIndex,
				SegmentIndex:  segmentIndex,
				Text:          token,
				StartMS:       tokenStartMS,
				EndMS:         tokenEndMS,
				Confidence:    math.Min(confidence, 0.68),
				Source:        source,
			})
		}
		tokenEnd := len(tokens) - 1
		if tokenEnd < tokenStart {
			tokenEnd = 0
		}
		fragments = append(fragments, FragmentTiming{
			Index:        fragmentIndex,
			SegmentIndex: segmentIndex,
			Text:         strings.TrimSpace(segment.Text),
			StartMS:      startMS,
			EndMS:        endMS,
			Confidence:   confidence,
			Source:       source,
			TokenStart:   tokenStart,
			TokenEnd:     tokenEnd,
		})
		cursor = endMS
	}
	durationMS := firstPositive(request.DurationMS, cursor)
	fragments, tokens, drift := CorrectDrift(fragments, tokens, durationMS)
	confidence := summarizeConfidence(fragments, tokens, 0, source)
	return artifacts(request.JobID, source, statusForTiming(len(request.Segments), fragments), durationMS, request.GeneratedAt, confidence, drift, fragments, tokens, nil)
}

func artifacts(
	jobID string,
	source TimingSource,
	status string,
	durationMS int,
	generatedAt time.Time,
	confidence TimingConfidence,
	drift DriftStats,
	fragments []FragmentTiming,
	tokens []TokenTiming,
	warnings []string,
) NormalizedTiming {
	return NormalizedTiming{
		Fragments: FragmentTimingArtifact{
			SchemaVersion: SchemaVersion,
			JobID:         jobID,
			Source:        source,
			Status:        status,
			DurationMS:    durationMS,
			GeneratedAt:   generatedAt.UTC(),
			Confidence:    confidence,
			Drift:         drift,
			Fragments:     fragments,
			Warnings:      uniqueWarnings(warnings),
		},
		Tokens: TokenTimingArtifact{
			SchemaVersion: SchemaVersion,
			JobID:         jobID,
			Source:        source,
			Status:        status,
			DurationMS:    durationMS,
			GeneratedAt:   generatedAt.UTC(),
			Confidence:    confidence,
			Drift:         drift,
			Tokens:        tokens,
			Warnings:      uniqueWarnings(warnings),
		},
	}
}

func summarizeConfidence(fragments []FragmentTiming, tokens []TokenTiming, rawConfidence float64, source TimingSource) TimingConfidence {
	segmentConfidence := averageFragmentConfidence(fragments)
	tokenConfidence := averageTokenConfidence(tokens)
	if rawConfidence > 0 {
		segmentConfidence = (segmentConfidence + rawConfidence) / 2
		tokenConfidence = (tokenConfidence + rawConfidence) / 2
	}
	overall := (segmentConfidence + tokenConfidence) / 2
	reason := "normalized timing"
	if source == TimingSourceHeuristic {
		reason = "deterministic text-duration estimate"
	}
	return TimingConfidence{
		Overall: roundConfidence(overall),
		Segment: roundConfidence(segmentConfidence),
		Token:   roundConfidence(tokenConfidence),
		Reason:  reason,
	}
}

func averageFragmentConfidence(fragments []FragmentTiming) float64 {
	if len(fragments) == 0 {
		return 0
	}
	total := 0.0
	for _, fragment := range fragments {
		total += clampConfidence(fragment.Confidence)
	}
	return total / float64(len(fragments))
}

func averageTokenConfidence(tokens []TokenTiming) float64 {
	if len(tokens) == 0 {
		return 0
	}
	total := 0.0
	for _, token := range tokens {
		total += clampConfidence(token.Confidence)
	}
	return total / float64(len(tokens))
}

func cloneFragments(input []FragmentTiming, source TimingSource) []FragmentTiming {
	output := make([]FragmentTiming, 0, len(input))
	for index, fragment := range input {
		if fragment.EndMS <= fragment.StartMS {
			continue
		}
		if fragment.Index < 0 {
			fragment.Index = index
		}
		if fragment.Source == "" {
			fragment.Source = source
		}
		fragment.Confidence = defaultConfidence(fragment.Confidence, source)
		output = append(output, fragment)
	}
	return output
}

func cloneTokens(input []TokenTiming, source TimingSource) []TokenTiming {
	output := make([]TokenTiming, 0, len(input))
	for index, token := range input {
		if token.EndMS <= token.StartMS || strings.TrimSpace(token.Text) == "" {
			continue
		}
		if token.Index < 0 {
			token.Index = index
		}
		if token.Source == "" {
			token.Source = source
		}
		token.Confidence = defaultConfidence(token.Confidence, source)
		output = append(output, token)
	}
	return output
}

func fragmentsFromTokens(tokens []TokenTiming, segments []SegmentInput, source TimingSource) []FragmentTiming {
	if len(tokens) == 0 {
		return nil
	}
	bySegment := make(map[int][]TokenTiming)
	for _, token := range tokens {
		bySegment[token.SegmentIndex] = append(bySegment[token.SegmentIndex], token)
	}
	fragments := make([]FragmentTiming, 0, len(bySegment))
	for index, segment := range segments {
		segmentIndex := segment.Index
		if segmentIndex <= 0 {
			segmentIndex = index + 1
		}
		segmentTokens := bySegment[segmentIndex]
		if len(segmentTokens) == 0 {
			continue
		}
		startMS := segmentTokens[0].StartMS
		endMS := segmentTokens[len(segmentTokens)-1].EndMS
		fragments = append(fragments, FragmentTiming{
			Index:        len(fragments),
			SegmentIndex: segmentIndex,
			Text:         strings.TrimSpace(segment.Text),
			StartMS:      startMS,
			EndMS:        endMS,
			Confidence:   averageTokenConfidence(segmentTokens),
			Source:       source,
			TokenStart:   segmentTokens[0].Index,
			TokenEnd:     segmentTokens[len(segmentTokens)-1].Index,
		})
	}
	return fragments
}

func tokensFromFragments(fragments []FragmentTiming, source TimingSource) []TokenTiming {
	tokens := make([]TokenTiming, 0)
	for _, fragment := range fragments {
		words := tokenize(fragment.Text)
		if len(words) == 0 {
			continue
		}
		durationMS := max(1, fragment.EndMS-fragment.StartMS)
		weights := tokenWeights(words)
		total := 0
		for _, weight := range weights {
			total += weight
		}
		consumed := 0
		for wordIndex, word := range words {
			startMS := fragment.StartMS
			endMS := fragment.EndMS
			if total > 0 {
				startMS = fragment.StartMS + int(math.Round(float64(consumed)/float64(total)*float64(durationMS)))
				consumed += weights[wordIndex]
				endMS = fragment.StartMS + int(math.Round(float64(consumed)/float64(total)*float64(durationMS)))
			}
			tokens = append(tokens, TokenTiming{
				Index:         len(tokens),
				FragmentIndex: fragment.Index,
				SegmentIndex:  fragment.SegmentIndex,
				Text:          word,
				StartMS:       startMS,
				EndMS:         max(startMS+1, endMS),
				Confidence:    math.Min(fragment.Confidence, defaultConfidence(0, source)),
				Source:        source,
			})
		}
	}
	return tokens
}

func statusForTiming(expectedSegments int, fragments []FragmentTiming) string {
	if expectedSegments > 0 && len(fragments) < expectedSegments {
		return "partial"
	}
	return "complete"
}

func sumInputDuration(segments []SegmentInput) int {
	total := 0
	for _, segment := range segments {
		if segment.DurationMS > 0 {
			total += segment.DurationMS
		}
	}
	return total
}

func estimateDurationMS(text string) int {
	return max(900, len(tokenize(text))*320)
}

func tokenize(text string) []string {
	matches := tokenPattern.FindAllString(strings.TrimSpace(text), -1)
	if len(matches) == 0 {
		return nil
	}
	return matches
}

func tokenWeights(tokens []string) []int {
	weights := make([]int, len(tokens))
	for index, token := range tokens {
		cleanRunes := 0
		for _, value := range token {
			if (value >= '0' && value <= '9') || (value >= 'A' && value <= 'Z') || (value >= 'a' && value <= 'z') || value > utf8.RuneSelf {
				cleanRunes++
			}
		}
		weights[index] = max(2, cleanRunes)
	}
	return weights
}

func defaultConfidence(value float64, source TimingSource) float64 {
	if value > 0 {
		return clampConfidence(value)
	}
	switch source {
	case TimingSourceNative:
		return 0.9
	case TimingSourceMFA:
		return 0.86
	case TimingSourceGentle:
		return 0.8
	case TimingSourceAeneas:
		return 0.76
	default:
		return 0.68
	}
}

func clampConfidence(value float64) float64 {
	if !isFinite(value) {
		return 0
	}
	return math.Min(1, math.Max(0, value))
}

func roundConfidence(value float64) float64 {
	return math.Round(clampConfidence(value)*1000) / 1000
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func uniqueWarnings(input []string) []string {
	seen := make(map[string]bool)
	output := make([]string, 0, len(input))
	for _, warning := range input {
		clean := strings.TrimSpace(warning)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		output = append(output, clean)
	}
	return output
}
