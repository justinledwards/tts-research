package alignment

import (
	"errors"
	"time"
)

const SchemaVersion = "timing.v1"

type TimingSource string

const (
	TimingSourceNative    TimingSource = "native"
	TimingSourceMFA       TimingSource = "mfa"
	TimingSourceAeneas    TimingSource = "aeneas"
	TimingSourceGentle    TimingSource = "gentle"
	TimingSourceHeuristic TimingSource = "heuristic"
)

type TimingConfidence struct {
	Overall float64 `json:"overall"`
	Segment float64 `json:"segment"`
	Token   float64 `json:"token"`
	Reason  string  `json:"reason,omitempty"`
}

type DriftStats struct {
	MeanAbsoluteMS int     `json:"meanAbsoluteMs"`
	MaxAbsoluteMS  int     `json:"maxAbsoluteMs"`
	MaxRatio       float64 `json:"maxRatio"`
	Corrected      bool    `json:"corrected"`
	LowConfidence  bool    `json:"lowConfidence"`
	Reason         string  `json:"reason,omitempty"`
}

type SegmentInput struct {
	Index      int     `json:"index"`
	Text       string  `json:"text"`
	StartMS    int     `json:"startMs,omitempty"`
	DurationMS int     `json:"durationMs,omitempty"`
	Confidence float64 `json:"confidence,omitempty"`
}

type RawTiming struct {
	Source     TimingSource     `json:"source"`
	DurationMS int              `json:"durationMs,omitempty"`
	Fragments  []FragmentTiming `json:"fragments,omitempty"`
	Tokens     []TokenTiming    `json:"tokens,omitempty"`
	Confidence float64          `json:"confidence,omitempty"`
	Warnings   []string         `json:"warnings,omitempty"`
}

type NormalizeRequest struct {
	JobID        string              `json:"jobId,omitempty"`
	DurationMS   int                 `json:"durationMs,omitempty"`
	GeneratedAt  time.Time           `json:"generatedAt,omitempty"`
	Segments     []SegmentInput      `json:"segments,omitempty"`
	NativeEvents []NativeTimingEvent `json:"nativeEvents,omitempty"`
	Raw          *RawTiming          `json:"raw,omitempty"`
}

type NormalizedTiming struct {
	Fragments FragmentTimingArtifact `json:"fragmentTiming"`
	Tokens    TokenTimingArtifact    `json:"tokenTiming"`
}

type FragmentTimingArtifact struct {
	SchemaVersion string           `json:"schemaVersion"`
	JobID         string           `json:"jobId,omitempty"`
	Source        TimingSource     `json:"source"`
	Status        string           `json:"status"`
	DurationMS    int              `json:"durationMs"`
	GeneratedAt   time.Time        `json:"generatedAt"`
	Confidence    TimingConfidence `json:"confidence"`
	Drift         DriftStats       `json:"drift"`
	Fragments     []FragmentTiming `json:"fragments"`
	Warnings      []string         `json:"warnings,omitempty"`
}

type TokenTimingArtifact struct {
	SchemaVersion string           `json:"schemaVersion"`
	JobID         string           `json:"jobId,omitempty"`
	Source        TimingSource     `json:"source"`
	Status        string           `json:"status"`
	DurationMS    int              `json:"durationMs"`
	GeneratedAt   time.Time        `json:"generatedAt"`
	Confidence    TimingConfidence `json:"confidence"`
	Drift         DriftStats       `json:"drift"`
	Tokens        []TokenTiming    `json:"tokens"`
	Warnings      []string         `json:"warnings,omitempty"`
}

type FragmentTiming struct {
	Index        int          `json:"index"`
	SegmentIndex int          `json:"segmentIndex"`
	Text         string       `json:"text"`
	StartMS      int          `json:"startMs"`
	EndMS        int          `json:"endMs"`
	Confidence   float64      `json:"confidence"`
	Source       TimingSource `json:"source"`
	TokenStart   int          `json:"tokenStart,omitempty"`
	TokenEnd     int          `json:"tokenEnd,omitempty"`
}

type TokenTiming struct {
	Index         int          `json:"index"`
	FragmentIndex int          `json:"fragmentIndex"`
	SegmentIndex  int          `json:"segmentIndex"`
	Text          string       `json:"text"`
	StartMS       int          `json:"startMs"`
	EndMS         int          `json:"endMs"`
	Confidence    float64      `json:"confidence"`
	Source        TimingSource `json:"source"`
}

var ErrNoTimingInput = errors.New("no timing input")

func NormalizeTiming(request NormalizeRequest) (NormalizedTiming, error) {
	if request.GeneratedAt.IsZero() {
		request.GeneratedAt = time.Now().UTC()
	}
	if request.Raw != nil && (len(request.Raw.Fragments) > 0 || len(request.Raw.Tokens) > 0) {
		return normalizeRawTiming(request), nil
	}
	if len(request.NativeEvents) > 0 {
		if normalized, ok := NormalizeNativeEvents(request); ok {
			return normalized, nil
		}
	}
	if len(request.Segments) == 0 {
		return NormalizedTiming{}, ErrNoTimingInput
	}
	return buildHeuristicTiming(request), nil
}
