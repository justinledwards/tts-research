package pipeline

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

const voiceProfileLikenessStatusPending = "pending"
const voiceProfileLikenessStatusReady = "ready"
const voiceProfileLikenessStatusFailed = "failed"

type pythonProfileLikenessScorer struct {
	pythonPath string
	scriptPath string
	model      string
	token      string
}

type profileLikenessScriptResult struct {
	Score             float64 `json:"score"`
	SpeakerSimilarity float64 `json:"speakerSimilarity"`
	EmbeddingModel    string  `json:"embeddingModel"`
	Reason            string  `json:"reason"`
}

func newPythonProfileLikenessScorer(options Options) VoiceProfileLikenessScorer {
	return pythonProfileLikenessScorer{
		pythonPath: strings.TrimSpace(options.VoiceProfileAnalysisPythonPath),
		scriptPath: strings.TrimSpace(options.VoiceProfileEmbeddingScriptPath),
		model:      strings.TrimSpace(options.VoiceProfileEmbeddingModel),
		token:      strings.TrimSpace(options.VoiceProfileDiarizationToken),
	}
}

func (scorer pythonProfileLikenessScorer) ScoreVoiceProfileLikeness(
	ctx context.Context,
	request VoiceProfileLikenessRequest,
) (VoiceProfileLikenessResult, error) {
	pythonPath := strings.TrimSpace(scorer.pythonPath)
	if pythonPath == "" {
		pythonPath = defaultVoiceProfileAnalysisPythonPath
	}
	scriptPath := strings.TrimSpace(scorer.scriptPath)
	if scriptPath == "" {
		scriptPath = defaultVoiceProfileEmbeddingScriptPath
	}
	model := strings.TrimSpace(request.Model)
	if model == "" {
		model = scorer.model
	}
	if model == "" {
		model = defaultVoiceProfileEmbeddingModel
	}
	token := strings.TrimSpace(request.Token)
	if token == "" {
		token = scorer.token
	}

	command := exec.CommandContext(
		ctx,
		pythonPath,
		scriptPath,
		"--reference",
		request.ReferencePath,
		"--generated",
		request.GeneratedPath,
		"--model",
		model,
	)
	command.Env = append(os.Environ(), "PYANNOTE_METRICS_ENABLED=0", "PYANNOTE_AUTH_TOKEN="+token)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr
	if err := command.Run(); err != nil {
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = strings.TrimSpace(stdout.String())
		}
		return VoiceProfileLikenessResult{}, fmt.Errorf("profile likeness script failed: %w: %s", err, detail)
	}

	var scriptResult profileLikenessScriptResult
	if err := json.Unmarshal(stdout.Bytes(), &scriptResult); err != nil {
		return VoiceProfileLikenessResult{}, fmt.Errorf("parse profile likeness output: %w", err)
	}
	if scriptResult.EmbeddingModel == "" {
		scriptResult.EmbeddingModel = model
	}
	return VoiceProfileLikenessResult{
		Score:             clamp01(scriptResult.Score),
		SpeakerSimilarity: clamp01(scriptResult.SpeakerSimilarity),
		EmbeddingModel:    scriptResult.EmbeddingModel,
		Reason:            scriptResult.Reason,
	}, nil
}

func pendingVoiceProfileLikeness(reason string, calibrationText string) VoiceProfileLikeness {
	return VoiceProfileLikeness{
		Status:          voiceProfileLikenessStatusPending,
		CalibrationText: calibrationText,
		Reason:          reason,
	}
}

func failedVoiceProfileLikeness(reason string, calibrationText string) VoiceProfileLikeness {
	return VoiceProfileLikeness{
		Status:          voiceProfileLikenessStatusFailed,
		CalibrationText: calibrationText,
		Reason:          reason,
	}
}

func readyVoiceProfileLikeness(result VoiceProfileLikenessResult, calibrationText string) VoiceProfileLikeness {
	now := time.Now().UTC()
	score := result.Score
	if score <= 0 {
		score = result.SpeakerSimilarity
	}
	return VoiceProfileLikeness{
		Status:            voiceProfileLikenessStatusReady,
		Score:             clamp01(score),
		SpeakerSimilarity: clamp01(result.SpeakerSimilarity),
		EmbeddingModel:    result.EmbeddingModel,
		CalibrationText:   calibrationText,
		MeasuredAt:        &now,
		Reason:            result.Reason,
	}
}
