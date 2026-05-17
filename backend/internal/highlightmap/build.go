package highlightmap

import (
	"math"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/alignment"
)

const SchemaVersion = "highlight-map.v1"

const (
	ModeWord   = "word"
	ModePhrase = "phrase"
)

type ConfidencePolicy struct {
	MinSegmentConfidence float64 `json:"minSegmentConfidence"`
	MinTokenConfidence   float64 `json:"minTokenConfidence"`
	MaxDriftMS           int     `json:"maxDriftMs"`
	MaxDriftRatio        float64 `json:"maxDriftRatio"`
}

type BuildRequest struct {
	JobID        string                           `json:"jobId,omitempty"`
	BookSourceID string                           `json:"bookSourceId,omitempty"`
	ScopeKey     string                           `json:"scopeKey,omitempty"`
	Text         string                           `json:"text,omitempty"`
	WordSpans    []WordSpan                       `json:"wordSpans,omitempty"`
	Fragments    alignment.FragmentTimingArtifact `json:"fragmentTiming"`
	Tokens       alignment.TokenTimingArtifact    `json:"tokenTiming"`
	GeneratedAt  time.Time                        `json:"generatedAt,omitempty"`
	Policy       ConfidencePolicy                 `json:"policy,omitempty"`
}

type HighlightMap struct {
	SchemaVersion string                 `json:"schemaVersion"`
	JobID         string                 `json:"jobId,omitempty"`
	BookSourceID  string                 `json:"bookSourceId,omitempty"`
	ScopeKey      string                 `json:"scopeKey,omitempty"`
	Status        string                 `json:"status"`
	Source        alignment.TimingSource `json:"source"`
	Mode          string                 `json:"mode"`
	DurationMS    int                    `json:"durationMs"`
	GeneratedAt   time.Time              `json:"generatedAt"`
	Policy        ConfidencePolicy       `json:"policy"`
	Summary       Summary                `json:"summary"`
	Fragments     []HighlightFragment    `json:"fragments"`
	Tokens        []HighlightToken       `json:"tokens"`
	Warnings      []string               `json:"warnings,omitempty"`
}

type Summary struct {
	Status        string                     `json:"status"`
	Source        alignment.TimingSource     `json:"source"`
	Mode          string                     `json:"mode"`
	DurationMS    int                        `json:"durationMs"`
	FragmentCount int                        `json:"fragmentCount"`
	TokenCount    int                        `json:"tokenCount"`
	Confidence    alignment.TimingConfidence `json:"confidence"`
	Drift         alignment.DriftStats       `json:"drift"`
	LowConfidence bool                       `json:"lowConfidence"`
	Reason        string                     `json:"reason,omitempty"`
	Warnings      []string                   `json:"warnings,omitempty"`
}

type HighlightFragment struct {
	Index           int             `json:"index"`
	SegmentIndex    int             `json:"segmentIndex"`
	Text            string          `json:"text"`
	StartMS         int             `json:"startMs"`
	EndMS           int             `json:"endMs"`
	Confidence      float64         `json:"confidence"`
	TokenStart      int             `json:"tokenStart,omitempty"`
	TokenEnd        int             `json:"tokenEnd,omitempty"`
	ReadingPosition ReadingPosition `json:"readingPosition,omitempty"`
}

type HighlightToken struct {
	Index           int             `json:"index"`
	FragmentIndex   int             `json:"fragmentIndex"`
	SegmentIndex    int             `json:"segmentIndex"`
	Text            string          `json:"text"`
	StartMS         int             `json:"startMs"`
	EndMS           int             `json:"endMs"`
	Confidence      float64         `json:"confidence"`
	Mode            string          `json:"mode"`
	ReadingPosition ReadingPosition `json:"readingPosition,omitempty"`
}

func DefaultConfidencePolicy() ConfidencePolicy {
	return ConfidencePolicy{
		MinSegmentConfidence: 0.72,
		MinTokenConfidence:   0.65,
		MaxDriftMS:           250,
		MaxDriftRatio:        0.08,
	}
}

func Build(request BuildRequest) HighlightMap {
	if request.GeneratedAt.IsZero() {
		request.GeneratedAt = time.Now().UTC()
	}
	policy := normalizePolicy(request.Policy)
	mode, lowConfidence, reason := resolveMode(request.Fragments.Confidence, request.Fragments.Drift, policy)
	fragments := buildFragments(request)
	tokens := buildTokens(request, mode)
	warnings := uniqueStrings(append(request.Fragments.Warnings, request.Tokens.Warnings...))
	summary := Summary{
		Status:        firstNonEmpty(request.Fragments.Status, request.Tokens.Status, "complete"),
		Source:        firstSource(request.Fragments.Source, request.Tokens.Source),
		Mode:          mode,
		DurationMS:    firstPositive(request.Fragments.DurationMS, request.Tokens.DurationMS),
		FragmentCount: len(fragments),
		TokenCount:    len(tokens),
		Confidence:    request.Fragments.Confidence,
		Drift:         request.Fragments.Drift,
		LowConfidence: lowConfidence,
		Reason:        reason,
		Warnings:      warnings,
	}
	return HighlightMap{
		SchemaVersion: SchemaVersion,
		JobID:         firstNonEmpty(request.JobID, request.Fragments.JobID, request.Tokens.JobID),
		BookSourceID:  strings.TrimSpace(request.BookSourceID),
		ScopeKey:      strings.TrimSpace(request.ScopeKey),
		Status:        summary.Status,
		Source:        summary.Source,
		Mode:          mode,
		DurationMS:    summary.DurationMS,
		GeneratedAt:   request.GeneratedAt.UTC(),
		Policy:        policy,
		Summary:       summary,
		Fragments:     fragments,
		Tokens:        tokens,
		Warnings:      warnings,
	}
}

func buildFragments(request BuildRequest) []HighlightFragment {
	output := make([]HighlightFragment, 0, len(request.Fragments.Fragments))
	for _, fragment := range request.Fragments.Fragments {
		position := readingPositionForTiming(
			request.BookSourceID,
			request.ScopeKey,
			fragment.Text,
			request.WordSpans,
			fragment.TokenStart,
		)
		output = append(output, HighlightFragment{
			Index:           fragment.Index,
			SegmentIndex:    fragment.SegmentIndex,
			Text:            fragment.Text,
			StartMS:         fragment.StartMS,
			EndMS:           fragment.EndMS,
			Confidence:      round(fragment.Confidence),
			TokenStart:      fragment.TokenStart,
			TokenEnd:        fragment.TokenEnd,
			ReadingPosition: position,
		})
	}
	return output
}

func buildTokens(request BuildRequest, mode string) []HighlightToken {
	output := make([]HighlightToken, 0, len(request.Tokens.Tokens))
	for _, token := range request.Tokens.Tokens {
		position := readingPositionForTiming(
			request.BookSourceID,
			request.ScopeKey,
			token.Text,
			request.WordSpans,
			token.Index,
		)
		output = append(output, HighlightToken{
			Index:           token.Index,
			FragmentIndex:   token.FragmentIndex,
			SegmentIndex:    token.SegmentIndex,
			Text:            token.Text,
			StartMS:         token.StartMS,
			EndMS:           token.EndMS,
			Confidence:      round(token.Confidence),
			Mode:            mode,
			ReadingPosition: position,
		})
	}
	return output
}

func resolveMode(confidence alignment.TimingConfidence, drift alignment.DriftStats, policy ConfidencePolicy) (string, bool, string) {
	if confidence.Segment < policy.MinSegmentConfidence {
		return ModePhrase, true, "segment confidence below word-highlight threshold"
	}
	if confidence.Token < policy.MinTokenConfidence {
		return ModePhrase, true, "token confidence below word-highlight threshold"
	}
	if drift.LowConfidence || drift.MaxAbsoluteMS > policy.MaxDriftMS || drift.MaxRatio > policy.MaxDriftRatio {
		reason := drift.Reason
		if reason == "" {
			reason = "drift exceeds word-highlight threshold"
		}
		return ModePhrase, true, reason
	}
	return ModeWord, false, "word-level timing is within confidence policy"
}

func normalizePolicy(policy ConfidencePolicy) ConfidencePolicy {
	defaults := DefaultConfidencePolicy()
	if policy.MinSegmentConfidence <= 0 {
		policy.MinSegmentConfidence = defaults.MinSegmentConfidence
	}
	if policy.MinTokenConfidence <= 0 {
		policy.MinTokenConfidence = defaults.MinTokenConfidence
	}
	if policy.MaxDriftMS <= 0 {
		policy.MaxDriftMS = defaults.MaxDriftMS
	}
	if policy.MaxDriftRatio <= 0 {
		policy.MaxDriftRatio = defaults.MaxDriftRatio
	}
	return policy
}

func firstSource(values ...alignment.TimingSource) alignment.TimingSource {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return alignment.TimingSourceHeuristic
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func firstPositive(values ...int) int {
	for _, value := range values {
		if value > 0 {
			return value
		}
	}
	return 0
}

func uniqueStrings(input []string) []string {
	seen := make(map[string]bool)
	output := make([]string, 0, len(input))
	for _, value := range input {
		clean := strings.TrimSpace(value)
		if clean == "" || seen[clean] {
			continue
		}
		seen[clean] = true
		output = append(output, clean)
	}
	return output
}

func round(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return math.Round(math.Max(0, math.Min(1, value))*1000) / 1000
}
