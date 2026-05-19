package alignment

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type aeneasSyncMap struct {
	Fragments []aeneasFragment `json:"fragments"`
}

type aeneasFragment struct {
	ID     string   `json:"id"`
	Begin  string   `json:"begin"`
	End    string   `json:"end"`
	Lines  []string `json:"lines"`
	Words  []string `json:"words"`
	Word   string   `json:"word"`
	Text   string   `json:"text"`
	Weight float64  `json:"confidence"`
}

func alignWithAeneas(ctx context.Context, request AlignRequest, options AlignerOptions) (NormalizedTiming, error) {
	python := strings.TrimSpace(options.AeneasPython)
	if python == "" {
		python = "python3"
	}
	if _, err := exec.LookPath(python); err != nil && !strings.Contains(python, "/") {
		return NormalizedTiming{}, fmt.Errorf("%w: aeneas python not found", ErrAlignerUnavailable)
	}
	if request.AudioPath == "" {
		return NormalizedTiming{}, fmt.Errorf("%w: aeneas requires audio", ErrAlignerUnavailable)
	}

	workDir, cleanup, err := alignmentWorkDir(request.WorkDir, "aeneas-*")
	if err != nil {
		return NormalizedTiming{}, err
	}
	defer cleanup()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "syncmap.json")
	if err := os.WriteFile(textPath, []byte(joinSegments(request.Segments)), 0o600); err != nil {
		return NormalizedTiming{}, err
	}

	language := strings.TrimSpace(request.Language)
	if language == "" {
		language = "eng"
	}
	taskConfig := fmt.Sprintf("task_language=%s|is_text_type=plain|os_task_file_format=json", language)
	commandCtx, cancel := context.WithTimeout(ctx, options.Timeout)
	defer cancel()
	command := exec.CommandContext(
		commandCtx,
		python,
		"-m",
		"aeneas.tools.execute_task",
		request.AudioPath,
		textPath,
		taskConfig,
		outputPath,
	)
	output, err := command.CombinedOutput()
	if err != nil {
		return NormalizedTiming{}, fmt.Errorf("aeneas execute_task failed: %w: %s", err, strings.TrimSpace(string(output)))
	}

	data, err := os.ReadFile(outputPath)
	if err != nil {
		return NormalizedTiming{}, err
	}
	var syncMap aeneasSyncMap
	if err := json.Unmarshal(data, &syncMap); err != nil {
		return NormalizedTiming{}, err
	}
	fragments := make([]FragmentTiming, 0, len(syncMap.Fragments))
	tokens := make([]TokenTiming, 0)
	for _, fragment := range syncMap.Fragments {
		startSeconds, startOK := secondsString(fragment.Begin)
		endSeconds, endOK := secondsString(fragment.End)
		text := aeneasFragmentText(fragment)
		if !startOK || !endOK || endSeconds <= startSeconds || strings.TrimSpace(text) == "" {
			continue
		}
		segmentIndex := segmentIndexForText(text, request.Segments)
		fragmentIndex := len(fragments)
		tokenStart := len(tokens)
		words := tokenize(text)
		durationMS := int((endSeconds - startSeconds) * 1000)
		rawTokens := tokensFromFragments([]FragmentTiming{{
			Index:        fragmentIndex,
			SegmentIndex: segmentIndex,
			Text:         text,
			StartMS:      int(startSeconds * 1000),
			EndMS:        int(endSeconds * 1000),
			Confidence:   defaultConfidence(fragment.Weight, TimingSourceAeneas),
			Source:       TimingSourceAeneas,
		}}, TimingSourceAeneas)
		for _, token := range rawTokens {
			token.Index = len(tokens)
			token.FragmentIndex = fragmentIndex
			tokens = append(tokens, token)
		}
		tokenEnd := len(tokens) - 1
		if len(words) == 0 || durationMS <= 0 {
			tokenEnd = tokenStart
		}
		fragments = append(fragments, FragmentTiming{
			Index:        fragmentIndex,
			SegmentIndex: segmentIndex,
			Text:         text,
			StartMS:      int(startSeconds * 1000),
			EndMS:        int(endSeconds * 1000),
			Confidence:   defaultConfidence(fragment.Weight, TimingSourceAeneas),
			Source:       TimingSourceAeneas,
			TokenStart:   tokenStart,
			TokenEnd:     tokenEnd,
		})
	}
	if len(fragments) == 0 {
		return NormalizedTiming{}, fmt.Errorf("%w: aeneas produced no timing fragments", ErrAlignerUnavailable)
	}
	raw := RawTiming{
		Source:     TimingSourceAeneas,
		DurationMS: request.DurationMS,
		Fragments:  fragments,
		Tokens:     tokens,
	}
	return NormalizeTiming(NormalizeRequest{
		JobID:      request.JobID,
		DurationMS: request.DurationMS,
		Segments:   request.Segments,
		Raw:        &raw,
	})
}

func aeneasFragmentText(fragment aeneasFragment) string {
	if len(fragment.Lines) > 0 {
		return strings.TrimSpace(strings.Join(fragment.Lines, " "))
	}
	if len(fragment.Words) > 0 {
		return strings.TrimSpace(strings.Join(fragment.Words, " "))
	}
	if strings.TrimSpace(fragment.Word) != "" {
		return strings.TrimSpace(fragment.Word)
	}
	return strings.TrimSpace(fragment.Text)
}

func secondsString(value string) (float64, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0, false
	}
	var seconds float64
	if _, err := fmt.Sscanf(value, "%f", &seconds); err != nil {
		return 0, false
	}
	return seconds, true
}

func segmentIndexForText(text string, segments []SegmentInput) int {
	clean := strings.ToLower(strings.TrimSpace(text))
	for _, segment := range segments {
		if clean != "" && strings.Contains(strings.ToLower(segment.Text), clean) && segment.Index > 0 {
			return segment.Index
		}
	}
	return 1
}
