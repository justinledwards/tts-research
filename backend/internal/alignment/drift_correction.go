package alignment

import "math"

const (
	lowConfidenceDriftMS    = 250
	lowConfidenceDriftRatio = 0.08
)

func CorrectDrift(
	fragments []FragmentTiming,
	tokens []TokenTiming,
	durationMS int,
) ([]FragmentTiming, []TokenTiming, DriftStats) {
	if durationMS <= 0 || (len(fragments) == 0 && len(tokens) == 0) {
		return fragments, tokens, DriftStats{}
	}
	measuredEnd := measuredTimingEnd(fragments, tokens)
	if measuredEnd <= 0 {
		return fragments, tokens, DriftStats{}
	}
	delta := durationMS - measuredEnd
	maxAbs := absInt(delta)
	maxRatio := math.Abs(float64(delta)) / float64(max(1, durationMS))
	corrected := false
	if maxAbs > 20 {
		scale := float64(durationMS) / float64(measuredEnd)
		fragments = scaleFragments(fragments, scale)
		tokens = scaleTokens(tokens, scale)
		corrected = true
	}
	stats := DriftStats{
		MeanAbsoluteMS: maxAbs,
		MaxAbsoluteMS:  maxAbs,
		MaxRatio:       math.Round(maxRatio*1000) / 1000,
		Corrected:      corrected,
		LowConfidence:  maxAbs > lowConfidenceDriftMS || maxRatio > lowConfidenceDriftRatio,
	}
	if stats.LowConfidence {
		stats.Reason = "timing drift exceeds word-highlight threshold"
	} else if corrected {
		stats.Reason = "timing scaled to generated audio duration"
	}
	return fragments, tokens, stats
}

func measuredTimingEnd(fragments []FragmentTiming, tokens []TokenTiming) int {
	endMS := 0
	for _, fragment := range fragments {
		if fragment.EndMS > endMS {
			endMS = fragment.EndMS
		}
	}
	for _, token := range tokens {
		if token.EndMS > endMS {
			endMS = token.EndMS
		}
	}
	return endMS
}

func scaleFragments(fragments []FragmentTiming, scale float64) []FragmentTiming {
	output := make([]FragmentTiming, len(fragments))
	for index, fragment := range fragments {
		fragment.StartMS = int(math.Round(float64(fragment.StartMS) * scale))
		fragment.EndMS = max(fragment.StartMS+1, int(math.Round(float64(fragment.EndMS)*scale)))
		output[index] = fragment
	}
	return output
}

func scaleTokens(tokens []TokenTiming, scale float64) []TokenTiming {
	output := make([]TokenTiming, len(tokens))
	for index, token := range tokens {
		token.StartMS = int(math.Round(float64(token.StartMS) * scale))
		token.EndMS = max(token.StartMS+1, int(math.Round(float64(token.EndMS)*scale)))
		output[index] = token
	}
	return output
}

func absInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
