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
	"strconv"
	"strings"
	"time"
)

type SupertonicConfig struct {
	PythonPath     string
	ScriptPath     string
	ModelDir       string
	DefaultVoice   string
	DefaultLang    string
	StyleFile      string
	AutoDownload   bool
	TimeoutSeconds int
}

type SupertonicTTSAgent struct {
	config SupertonicConfig
}

type supertonicMetadata struct {
	Provider       string  `json:"provider"`
	Voice          string  `json:"voice"`
	Language       string  `json:"language"`
	DurationMS     int     `json:"durationMs"`
	ModelDir       string  `json:"modelDir,omitempty"`
	ExpressionTags bool    `json:"expressionTags"`
	SampleRate     int     `json:"sampleRate,omitempty"`
	SampleCount    int     `json:"sampleCount,omitempty"`
	Duration       float64 `json:"duration,omitempty"`
}

func NewSupertonicTTSAgent(config SupertonicConfig) *SupertonicTTSAgent {
	if strings.TrimSpace(config.PythonPath) == "" {
		config.PythonPath = "./.venv-supertonic/bin/python"
	}
	if strings.TrimSpace(config.ScriptPath) == "" {
		config.ScriptPath = "./scripts/supertonic_synth.py"
	}
	if strings.TrimSpace(config.DefaultVoice) == "" {
		config.DefaultVoice = "M1"
	}
	if strings.TrimSpace(config.DefaultLang) == "" {
		config.DefaultLang = "en"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 180
	}
	return &SupertonicTTSAgent{config: config}
}

func (agent *SupertonicTTSAgent) Synthesize(ctx context.Context, text string) (TTSResult, error) {
	return agent.SynthesizeWithVoice(ctx, text, agent.config.DefaultVoice, agent.config.DefaultLang)
}

func (agent *SupertonicTTSAgent) SynthesizeWithVoice(ctx context.Context, text string, voice string, lang string) (TTSResult, error) {
	config := agent.config
	if strings.TrimSpace(voice) != "" {
		config.DefaultVoice = strings.TrimSpace(voice)
	}
	if strings.TrimSpace(lang) != "" {
		config.DefaultLang = strings.TrimSpace(lang)
	}
	return agent.synthesizeWithConfig(ctx, text, config)
}

func (agent *SupertonicTTSAgent) SynthesizeWithProfileArtifact(
	ctx context.Context,
	text string,
	artifact VoiceProfileArtifact,
	lang string,
) (TTSResult, error) {
	config := agent.config
	config.StyleFile = strings.TrimSpace(artifact.Path)
	if strings.TrimSpace(config.StyleFile) == "" {
		return TTSResult{}, errors.New("supertonic embed artifact path is required")
	}
	if cleanLang := strings.TrimSpace(lang); cleanLang != "" {
		config.DefaultLang = cleanLang
	}
	if cleanFile := strings.TrimSpace(artifact.File); cleanFile != "" {
		config.DefaultVoice = strings.TrimSuffix(cleanFile, filepath.Ext(cleanFile))
	} else if cleanModule := strings.TrimSpace(artifact.ModuleID); cleanModule != "" {
		config.DefaultVoice = cleanModule
	}
	return agent.synthesizeWithConfig(ctx, text, config)
}

func (agent *SupertonicTTSAgent) synthesizeWithConfig(ctx context.Context, text string, config SupertonicConfig) (TTSResult, error) {
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	workDir, err := os.MkdirTemp("", "supertonic-synth-*")
	if err != nil {
		return TTSResult{}, fmt.Errorf("create supertonic work dir: %w", err)
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	textPath := filepath.Join(workDir, "input.txt")
	outputPath := filepath.Join(workDir, "output.wav")
	if err := os.WriteFile(textPath, []byte(text), 0o600); err != nil {
		return TTSResult{}, fmt.Errorf("write supertonic input: %w", err)
	}

	args := []string{
		config.ScriptPath,
		"--text-file", textPath,
		"--output", outputPath,
		"--voice-style", config.DefaultVoice,
		"--lang", config.DefaultLang,
		"--auto-download", strconv.FormatBool(config.AutoDownload),
	}
	if strings.TrimSpace(config.ModelDir) != "" {
		args = append(args, "--model-dir", config.ModelDir)
	}
	if strings.TrimSpace(config.StyleFile) != "" {
		args = append(args, "--voice-style-file", config.StyleFile)
	}

	command := exec.CommandContext(ctx, config.PythonPath, args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return TTSResult{}, fmt.Errorf("supertonic synthesis timed out after %d seconds", config.TimeoutSeconds)
		}
		return TTSResult{}, fmt.Errorf("supertonic synthesis failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, err := parseSupertonicMetadata(stdout.String())
	if err != nil {
		return TTSResult{}, err
	}
	wav, err := os.ReadFile(outputPath)
	if err != nil {
		return TTSResult{}, fmt.Errorf("read supertonic output: %w", err)
	}
	if metadata.DurationMS <= 0 && metadata.Duration > 0 {
		metadata.DurationMS = int(metadata.Duration * 1000)
	}
	if metadata.DurationMS <= 0 {
		return TTSResult{}, errors.New("supertonic output did not include a positive duration")
	}
	return TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  metadata.DurationMS,
		Provider:    "supertonic-3",
		Voice:       metadata.Voice,
	}, nil
}

func parseSupertonicMetadata(stdout string) (supertonicMetadata, error) {
	for _, line := range strings.Split(stdout, "\n") {
		clean := strings.TrimSpace(line)
		if clean == "" || !strings.HasPrefix(clean, "{") {
			continue
		}
		var metadata supertonicMetadata
		if err := json.Unmarshal([]byte(clean), &metadata); err != nil {
			continue
		}
		if metadata.Provider == "supertonic-3" {
			return metadata, nil
		}
	}
	return supertonicMetadata{}, errors.New("supertonic did not return metadata")
}
