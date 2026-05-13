package agents

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/audio"
)

type TTSResult struct {
	Audio       []byte
	ContentType string
	DurationMS  int
	Provider    string
	Voice       string
}

type MockTTSAgent struct{}

func NewMockTTSAgent() *MockTTSAgent {
	return &MockTTSAgent{}
}

func (agent *MockTTSAgent) Synthesize(_ context.Context, text string) (TTSResult, error) {
	durationMS := audio.DurationForText(text)
	wav, err := audio.SilentWAV(durationMS)
	if err != nil {
		return TTSResult{}, err
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  durationMS,
		Provider:    "mock",
		Voice:       "silent",
	}, nil
}

type KokoroConfig struct {
	PythonPath     string
	ScriptPath     string
	DataDir        string
	LangCode       string
	Voice          string
	Speed          float64
	Device         string
	TimeoutSeconds int
}

type KokoroTTSAgent struct {
	config KokoroConfig
}

type kokoroMetadata struct {
	Provider    string  `json:"provider"`
	RepoID      string  `json:"repoId"`
	Voice       string  `json:"voice"`
	LangCode    string  `json:"langCode"`
	Speed       float64 `json:"speed"`
	SampleRate  int     `json:"sampleRate"`
	SampleCount int     `json:"sampleCount"`
	DurationMS  int     `json:"durationMs"`
}

func NewKokoroTTSAgent(config KokoroConfig) *KokoroTTSAgent {
	if config.PythonPath == "" {
		config.PythonPath = "./.venv/bin/python"
	}
	if config.ScriptPath == "" {
		config.ScriptPath = "./scripts/kokoro_synth.py"
	}
	if config.DataDir == "" {
		config.DataDir = "./data/kokoro"
	}
	if config.LangCode == "" {
		config.LangCode = "a"
	}
	if config.Voice == "" {
		config.Voice = "af_heart"
	}
	if config.Speed <= 0 {
		config.Speed = 1
	}
	if config.Device == "" {
		config.Device = "cpu"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 180
	}

	return &KokoroTTSAgent{config: config}
}

func (agent *KokoroTTSAgent) Synthesize(ctx context.Context, text string) (TTSResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	if err := os.MkdirAll(config.DataDir, 0o755); err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(config.DataDir, "synth-*")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create kokoro work dir: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.wav")
	if err := os.WriteFile(textPath, []byte(text), 0o600); err != nil {
		return TTSResult{}, fmt.Errorf("write kokoro input: %w", err)
	}

	command := exec.CommandContext(
		ctx,
		config.PythonPath,
		config.ScriptPath,
		"--text-file",
		textPath,
		"--output",
		outputPath,
		"--lang-code",
		config.LangCode,
		"--voice",
		config.Voice,
		"--speed",
		fmt.Sprintf("%g", config.Speed),
		"--device",
		config.Device,
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf("kokoro synthesis timed out after %d seconds", config.TimeoutSeconds)
		}

		return TTSResult{}, fmt.Errorf("kokoro synthesis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, err := parseKokoroMetadata(stdout.String())
	if err != nil {
		return TTSResult{}, err
	}

	wav, err := os.ReadFile(outputPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read kokoro output: %w", err)
	}

	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    metadata.Provider,
		Voice:       metadata.Voice,
	}, nil
}

func parseKokoroMetadata(stdout string) (kokoroMetadata, error) {
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			continue
		}

		var metadata kokoroMetadata
		if err := json.Unmarshal([]byte(line), &metadata); err != nil {
			return kokoroMetadata{}, fmt.Errorf("parse kokoro metadata: %w", err)
		}

		if metadata.DurationMS <= 0 {
			return kokoroMetadata{}, errors.New("kokoro metadata did not include a positive duration")
		}

		return metadata, nil
	}

	return kokoroMetadata{}, errors.New("kokoro did not return metadata")
}
