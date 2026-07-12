package alignment

import "strings"

type AlignmentMode string

const (
	AlignmentModeOff                    AlignmentMode = "off"
	AlignmentModeProviderOnly           AlignmentMode = "provider-only"
	AlignmentModeProviderPlusValidation AlignmentMode = "provider-plus-validation"
	AlignmentModeLocalForcedAlignment   AlignmentMode = "local-forced-alignment"
	AlignmentModeLocalForcedRequired    AlignmentMode = "local-forced-alignment-required"
	AlignmentModeHeuristicFallback      AlignmentMode = "heuristic-fallback"
)

type AlignmentQuality string

const (
	AlignmentQualityExact       AlignmentQuality = "exact"
	AlignmentQualityGood        AlignmentQuality = "good"
	AlignmentQualityPhraseOnly  AlignmentQuality = "phrase-only"
	AlignmentQualityDegraded    AlignmentQuality = "degraded"
	AlignmentQualityUnavailable AlignmentQuality = "unavailable"
)

type AlignmentPrimaryLevel string

const (
	AlignmentLevelWord     AlignmentPrimaryLevel = "word"
	AlignmentLevelPhrase   AlignmentPrimaryLevel = "phrase"
	AlignmentLevelSentence AlignmentPrimaryLevel = "sentence"
	AlignmentLevelBlock    AlignmentPrimaryLevel = "block"
)

type AlignmentStageReport struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Detail string `json:"detail,omitempty"`
}

type AlignmentQualityReport struct {
	SchemaVersion            string                 `json:"schemaVersion"`
	Mode                     AlignmentMode          `json:"mode"`
	Quality                  AlignmentQuality       `json:"quality"`
	PrimaryLevel             AlignmentPrimaryLevel  `json:"primaryLevel"`
	TimingSource             TimingSource           `json:"timingSource"`
	TimingSourceV2           string                 `json:"timingSourceV2"`
	WordTimingReliable       bool                   `json:"wordTimingReliable"`
	ProviderTimingAvailable  bool                   `json:"providerTimingAvailable"`
	ForcedAlignmentAvailable bool                   `json:"forcedAlignmentAvailable"`
	UsedProviderTiming       bool                   `json:"usedProviderTiming"`
	UsedForcedAlignment      bool                   `json:"usedForcedAlignment"`
	FallbackReason           string                 `json:"fallbackReason,omitempty"`
	Confidence               TimingConfidence       `json:"confidence"`
	Drift                    DriftStats             `json:"drift"`
	FragmentCount            int                    `json:"fragmentCount"`
	TokenCount               int                    `json:"tokenCount"`
	DurationMS               int                    `json:"durationMs"`
	AlignmentWarnings        []string               `json:"alignmentWarnings,omitempty"`
	Stages                   []AlignmentStageReport `json:"stages,omitempty"`
}

func AlignmentReportForTiming(
	timing NormalizedTiming,
	mode AlignmentMode,
	warnings []string,
	stages []AlignmentStageReport,
) AlignmentQualityReport {
	source := firstSource(timing.Fragments.Source, timing.Tokens.Source)
	report := AlignmentQualityReport{
		SchemaVersion:            "alignment-quality.v1",
		Mode:                     normalizeAlignmentMode(mode, false),
		TimingSource:             source,
		TimingSourceV2:           HighlightMapV2TimingSource(source, timing.Tokens.Source),
		Confidence:               timing.Fragments.Confidence,
		Drift:                    timing.Fragments.Drift,
		FragmentCount:            len(timing.Fragments.Fragments),
		TokenCount:               len(timing.Tokens.Tokens),
		DurationMS:               firstPositive(timing.Fragments.DurationMS, timing.Tokens.DurationMS),
		AlignmentWarnings:        uniqueWarnings(append(warnings, timing.Fragments.Warnings...)),
		Stages:                   append([]AlignmentStageReport(nil), stages...),
		ProviderTimingAvailable:  source == TimingSourceNative,
		ForcedAlignmentAvailable: isForcedAlignmentSource(source),
		UsedProviderTiming:       source == TimingSourceNative,
		UsedForcedAlignment:      isForcedAlignmentSource(source),
	}
	report.WordTimingReliable = wordTimingReliable(timing, source)
	report.PrimaryLevel = primaryAlignmentLevel(timing, report.WordTimingReliable)
	report.Quality = alignmentQualityForTiming(timing, source, report.WordTimingReliable, report.AlignmentWarnings)
	report.FallbackReason = fallbackReasonForTiming(report)
	return report
}

func HighlightMapV2TimingSource(fragmentSource TimingSource, tokenSource TimingSource) string {
	source := firstSource(tokenSource, fragmentSource)
	switch source {
	case TimingSourceNative:
		return "provider-word"
	case TimingSourceMFA, TimingSourceGentle:
		return "forced-alignment"
	case TimingSourceAeneas:
		return "forced-alignment"
	case TimingSourceHeuristic:
		return "heuristic"
	default:
		return "heuristic"
	}
}

func normalizeAlignmentMode(mode AlignmentMode, alignmentEnabled bool) AlignmentMode {
	switch mode {
	case AlignmentModeOff,
		AlignmentModeProviderOnly,
		AlignmentModeProviderPlusValidation,
		AlignmentModeLocalForcedAlignment,
		AlignmentModeLocalForcedRequired,
		AlignmentModeHeuristicFallback:
		return mode
	default:
		if alignmentEnabled {
			return AlignmentModeProviderPlusValidation
		}
		return AlignmentModeProviderOnly
	}
}

func wordTimingReliable(timing NormalizedTiming, source TimingSource) bool {
	if len(timing.Tokens.Tokens) == 0 {
		return false
	}
	if timing.Tokens.Confidence.Token < 0.75 || timing.Fragments.Drift.LowConfidence {
		return false
	}
	switch source {
	case TimingSourceNative, TimingSourceMFA, TimingSourceGentle:
		return true
	default:
		return false
	}
}

func primaryAlignmentLevel(timing NormalizedTiming, reliableWordTiming bool) AlignmentPrimaryLevel {
	if reliableWordTiming {
		return AlignmentLevelWord
	}
	if len(timing.Fragments.Fragments) > 0 {
		return AlignmentLevelPhrase
	}
	return AlignmentLevelBlock
}

func alignmentQualityForTiming(
	timing NormalizedTiming,
	source TimingSource,
	reliableWordTiming bool,
	warnings []string,
) AlignmentQuality {
	if len(timing.Fragments.Fragments) == 0 && len(timing.Tokens.Tokens) == 0 {
		return AlignmentQualityUnavailable
	}
	if source == TimingSourceHeuristic {
		return AlignmentQualityDegraded
	}
	if !reliableWordTiming {
		return AlignmentQualityPhraseOnly
	}
	if timing.Fragments.Drift.LowConfidence || len(warnings) > 0 {
		return AlignmentQualityGood
	}
	if source == TimingSourceNative || source == TimingSourceMFA {
		return AlignmentQualityExact
	}
	return AlignmentQualityGood
}

func fallbackReasonForTiming(report AlignmentQualityReport) string {
	if report.FallbackReason != "" {
		return report.FallbackReason
	}
	if len(report.AlignmentWarnings) > 0 {
		return strings.Join(report.AlignmentWarnings, "; ")
	}
	switch report.Quality {
	case AlignmentQualityPhraseOnly:
		return "Word-level timing is unavailable or below confidence threshold; using phrase-level alignment."
	case AlignmentQualityDegraded:
		return "Provider and local forced alignment were unavailable; using degraded heuristic timing."
	case AlignmentQualityUnavailable:
		return "No usable timing source was available."
	default:
		return ""
	}
}

func isForcedAlignmentSource(source TimingSource) bool {
	switch source {
	case TimingSourceMFA, TimingSourceAeneas, TimingSourceGentle:
		return true
	default:
		return false
	}
}

func firstSource(values ...TimingSource) TimingSource {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return TimingSourceHeuristic
}
