package alignment

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

var ErrAlignerUnavailable = errors.New("aligner unavailable")

type AlignRequest struct {
	JobID      string         `json:"jobId,omitempty"`
	AudioPath  string         `json:"audioPath"`
	DurationMS int            `json:"durationMs,omitempty"`
	Language   string         `json:"language,omitempty"`
	Segments   []SegmentInput `json:"segments"`
	WorkDir    string         `json:"workDir,omitempty"`
}

type AlignerOptions struct {
	Enabled          bool
	Preferred        []TimingSource
	MFABin           string
	MFADictionary    string
	MFAAcousticModel string
	AeneasPython     string
	GentleURL        string
	Timeout          time.Duration
}

func Align(ctx context.Context, request AlignRequest, options AlignerOptions) (NormalizedTiming, error) {
	if !options.Enabled {
		return NormalizedTiming{}, ErrAlignerUnavailable
	}
	if options.Timeout <= 0 {
		options.Timeout = 2 * time.Minute
	}
	if len(options.Preferred) == 0 {
		options.Preferred = []TimingSource{TimingSourceMFA, TimingSourceAeneas, TimingSourceGentle}
	}
	var warnings []string
	for _, source := range options.Preferred {
		var (
			normalized NormalizedTiming
			err        error
		)
		switch source {
		case TimingSourceMFA:
			normalized, err = alignWithMFA(ctx, request, options)
		case TimingSourceAeneas:
			normalized, err = alignWithAeneas(ctx, request, options)
		case TimingSourceGentle:
			normalized, err = alignWithGentle(ctx, request, options)
		default:
			err = ErrAlignerUnavailable
		}
		if err == nil {
			return normalized, nil
		}
		warnings = append(warnings, fmt.Sprintf("%s: %s", source, err.Error()))
	}
	return NormalizedTiming{}, fmt.Errorf("%w: %s", ErrAlignerUnavailable, strings.Join(warnings, "; "))
}

func alignWithMFA(ctx context.Context, request AlignRequest, options AlignerOptions) (NormalizedTiming, error) {
	bin := strings.TrimSpace(options.MFABin)
	if bin == "" {
		bin = "mfa"
	}
	commandParts := strings.Fields(bin)
	if len(commandParts) == 0 {
		commandParts = []string{"mfa"}
	}
	executable := commandParts[0]
	if _, err := exec.LookPath(executable); err != nil && !strings.Contains(executable, "/") {
		return NormalizedTiming{}, fmt.Errorf("%w: mfa binary not found", ErrAlignerUnavailable)
	}
	if request.AudioPath == "" || strings.TrimSpace(options.MFADictionary) == "" || strings.TrimSpace(options.MFAAcousticModel) == "" {
		return NormalizedTiming{}, fmt.Errorf("%w: MFA requires audio, dictionary, and acoustic model", ErrAlignerUnavailable)
	}
	workDir, cleanup, err := alignmentWorkDir(request.WorkDir, "mfa-*")
	if err != nil {
		return NormalizedTiming{}, err
	}
	defer cleanup()
	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.json")
	if err := os.WriteFile(textPath, []byte(joinSegments(request.Segments)), 0o600); err != nil {
		return NormalizedTiming{}, err
	}
	commandCtx, cancel := context.WithTimeout(ctx, options.Timeout)
	defer cancel()
	args := append(commandParts[1:],
		"align_one",
		"--output_format",
		"json",
		request.AudioPath,
		textPath,
		options.MFADictionary,
		options.MFAAcousticModel,
		outputPath,
	)
	command := exec.CommandContext(commandCtx, executable, args...)
	output, err := command.CombinedOutput()
	if err != nil {
		return NormalizedTiming{}, fmt.Errorf("mfa align_one failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	data, err := os.ReadFile(outputPath)
	if err != nil {
		return NormalizedTiming{}, err
	}
	raw, err := rawTimingFromGenericJSON(data, TimingSourceMFA, request)
	if err != nil {
		return NormalizedTiming{}, err
	}
	return NormalizeTiming(NormalizeRequest{
		JobID:      request.JobID,
		DurationMS: request.DurationMS,
		Segments:   request.Segments,
		Raw:        &raw,
	})
}

func rawTimingFromGenericJSON(data []byte, source TimingSource, request AlignRequest) (RawTiming, error) {
	var payload any
	if err := json.Unmarshal(data, &payload); err != nil {
		return RawTiming{}, err
	}
	tokens := make([]TokenTiming, 0)
	collectGenericTimingTokens(payload, source, &tokens)
	if len(tokens) == 0 {
		return RawTiming{}, fmt.Errorf("%w: %s produced no word intervals", ErrAlignerUnavailable, source)
	}
	for index := range tokens {
		tokens[index].Index = index
		if tokens[index].SegmentIndex <= 0 {
			tokens[index].SegmentIndex = segmentIndexForToken(tokens[index], request.Segments)
		}
	}
	return RawTiming{Source: source, DurationMS: request.DurationMS, Tokens: tokens}, nil
}

func collectGenericTimingTokens(value any, source TimingSource, tokens *[]TokenTiming) {
	switch typed := value.(type) {
	case []any:
		for _, item := range typed {
			collectGenericTimingTokens(item, source, tokens)
		}
	case map[string]any:
		text := firstString(typed, "word", "text", "label", "case")
		start, startOK := firstSeconds(typed, "start", "begin", "start_seconds")
		end, endOK := firstSeconds(typed, "end", "endTime", "end_seconds")
		if text != "" && startOK && endOK && end > start {
			*tokens = append(*tokens, TokenTiming{
				Index:      len(*tokens),
				Text:       text,
				StartMS:    int(start * 1000),
				EndMS:      int(end * 1000),
				Confidence: defaultConfidence(firstFloat(typed, "confidence", "score"), source),
				Source:     source,
			})
			return
		}
		for _, item := range typed {
			collectGenericTimingTokens(item, source, tokens)
		}
	}
}

func segmentIndexForToken(token TokenTiming, segments []SegmentInput) int {
	for _, segment := range segments {
		if strings.Contains(strings.ToLower(segment.Text), strings.ToLower(token.Text)) && segment.Index > 0 {
			return segment.Index
		}
	}
	return 1
}

func firstString(values map[string]any, keys ...string) string {
	for _, key := range keys {
		if value, ok := values[key].(string); ok {
			if clean := strings.TrimSpace(value); clean != "" && !strings.EqualFold(clean, "not-found-in-audio") {
				return clean
			}
		}
	}
	return ""
}

func firstSeconds(values map[string]any, keys ...string) (float64, bool) {
	for _, key := range keys {
		switch value := values[key].(type) {
		case float64:
			return value, true
		case int:
			return float64(value), true
		case json.Number:
			floatValue, err := value.Float64()
			return floatValue, err == nil
		}
	}
	return 0, false
}

func firstFloat(values map[string]any, keys ...string) float64 {
	for _, key := range keys {
		if value, ok := values[key].(float64); ok {
			return value
		}
	}
	return 0
}

func alignmentWorkDir(base string, pattern string) (string, func(), error) {
	if strings.TrimSpace(base) != "" {
		if err := os.MkdirAll(base, 0o755); err != nil {
			return "", func() {}, err
		}
		dir, err := os.MkdirTemp(base, pattern)
		return dir, func() { _ = os.RemoveAll(dir) }, err
	}
	dir, err := os.MkdirTemp("", pattern)
	return dir, func() { _ = os.RemoveAll(dir) }, err
}

func joinSegments(segments []SegmentInput) string {
	parts := make([]string, 0, len(segments))
	for _, segment := range segments {
		if text := strings.TrimSpace(segment.Text); text != "" {
			parts = append(parts, text)
		}
	}
	return strings.Join(parts, "\n")
}
