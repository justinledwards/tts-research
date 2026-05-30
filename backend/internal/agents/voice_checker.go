package agents

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type VoiceCheckResult struct {
	Complete    bool    `json:"complete"`
	Transcript  string  `json:"transcript"`
	ResumeText  string  `json:"resumeText,omitempty"`
	NeedsResume bool    `json:"needsResume"`
	Reason      string  `json:"reason"`
	Provider    string  `json:"provider"`
	Similarity  float64 `json:"similarity"`
}

type MockVoiceCheckerAgent struct{}

func NewMockVoiceCheckerAgent() *MockVoiceCheckerAgent {
	return &MockVoiceCheckerAgent{}
}

func (agent *MockVoiceCheckerAgent) Check(_ context.Context, optimizedText string, _ []byte) (VoiceCheckResult, error) {
	return VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "mock checker assumes generated audio covers the optimized text",
		Provider:    "mock",
		Similarity:  1,
	}, nil
}

type QwenASRConfig struct {
	PythonPath          string
	ScriptPath          string
	DataDir             string
	Model               string
	Language            string
	Device              string
	TimeoutSeconds      int
	MaxNewTokens        int
	SimilarityThreshold float64
	Persistent          bool
}

type QwenASRVoiceCheckerAgent struct {
	config QwenASRConfig
	mu     sync.Mutex
	worker *qwenASRWorker
	nextID uint64
}

type qwenASRWorker struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
}

type qwenASRMetadata struct {
	ID         string `json:"id,omitempty"`
	Type       string `json:"type,omitempty"`
	Provider   string `json:"provider"`
	Model      string `json:"model"`
	Device     string `json:"device,omitempty"`
	Transcript string `json:"transcript"`
	Language   string `json:"language"`
	Error      string `json:"error,omitempty"`
}

func NewQwenASRVoiceCheckerAgent(config QwenASRConfig) *QwenASRVoiceCheckerAgent {
	if config.PythonPath == "" {
		config.PythonPath = "./.venv/bin/python"
	}
	if config.ScriptPath == "" {
		config.ScriptPath = "./scripts/qwen_asr_check.py"
	}
	if config.DataDir == "" {
		config.DataDir = "./data/asr"
	}
	if config.Model == "" {
		config.Model = "Qwen/Qwen3-ASR-1.7B"
	}
	if config.Language == "" {
		config.Language = "English"
	}
	if config.Device == "" {
		config.Device = "auto"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 3600
	}
	if config.MaxNewTokens <= 0 {
		config.MaxNewTokens = 256
	}
	if config.SimilarityThreshold <= 0 {
		config.SimilarityThreshold = 0.82
	}

	return &QwenASRVoiceCheckerAgent{config: config}
}

func (agent *QwenASRVoiceCheckerAgent) Check(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	if agent.config.Persistent {
		return agent.checkPersistent(ctx, optimizedText, wav)
	}

	return agent.checkOneShot(ctx, optimizedText, wav)
}

func (agent *QwenASRVoiceCheckerAgent) Warm(ctx context.Context) error {
	if !agent.config.Persistent {
		return nil
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(agent.config.TimeoutSeconds)*time.Second)
	defer cancel()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	_, err := agent.ensureWorker(ctx)
	return err
}

func (agent *QwenASRVoiceCheckerAgent) checkOneShot(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	workDir, audioPath, err := writeASRInput(config.DataDir, wav)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	command := exec.CommandContext(
		ctx,
		config.PythonPath,
		config.ScriptPath,
		"--audio",
		audioPath,
		"--model",
		config.Model,
		"--language",
		config.Language,
		"--device",
		config.Device,
		"--max-new-tokens",
		strconv.Itoa(config.MaxNewTokens),
	)

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	command.Stdout = &stdout
	command.Stderr = &stderr

	if err := command.Run(); err != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return VoiceCheckResult{}, fmt.Errorf("Qwen ASR timed out after %d seconds", config.TimeoutSeconds)
		}

		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR failed: %w: %s", err, strings.TrimSpace(stderr.String()))
	}

	metadata, err := parseQwenASRMetadata(stdout.String())
	if err != nil {
		return VoiceCheckResult{}, err
	}

	return compareVoiceTranscript(optimizedText, metadata.Transcript, metadata.Provider, config.SimilarityThreshold), nil
}

func (agent *QwenASRVoiceCheckerAgent) checkPersistent(ctx context.Context, optimizedText string, wav []byte) (VoiceCheckResult, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	workDir, audioPath, err := writeASRInput(config.DataDir, wav)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	defer func() {
		_ = os.RemoveAll(workDir)
	}()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	worker, err := agent.ensureWorker(ctx)
	if err != nil {
		return VoiceCheckResult{}, err
	}

	agent.nextID++
	requestID := strconv.FormatUint(agent.nextID, 10)
	request := map[string]string{
		"id":       requestID,
		"audio":    audioPath,
		"language": config.Language,
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return VoiceCheckResult{}, err
	}
	if _, err := worker.stdin.Write(append(payload, '\n')); err != nil {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("write Qwen ASR request: %w", err)
	}

	line, err := readLineWithContext(ctx, worker.stdout)
	if err != nil {
		agent.stopWorker()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return VoiceCheckResult{}, fmt.Errorf("Qwen ASR timed out after %d seconds", config.TimeoutSeconds)
		}

		return VoiceCheckResult{}, fmt.Errorf("read Qwen ASR response: %w", err)
	}

	var metadata qwenASRMetadata
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &metadata); err != nil {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("parse Qwen ASR response: %w", err)
	}
	if metadata.Error != "" {
		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR failed: %s", metadata.Error)
	}
	if metadata.ID != requestID {
		agent.stopWorker()
		return VoiceCheckResult{}, fmt.Errorf("Qwen ASR response id %q did not match request id %q", metadata.ID, requestID)
	}
	if strings.TrimSpace(metadata.Transcript) == "" {
		return VoiceCheckResult{}, errors.New("Qwen ASR transcript was empty")
	}
	if metadata.Provider == "" {
		metadata.Provider = "qwen-asr"
	}

	return compareVoiceTranscript(optimizedText, metadata.Transcript, metadata.Provider, config.SimilarityThreshold), nil
}

func (agent *QwenASRVoiceCheckerAgent) ensureWorker(ctx context.Context) (*qwenASRWorker, error) {
	if agent.worker != nil && agent.worker.command.Process != nil {
		return agent.worker, nil
	}

	config := agent.config
	command := exec.Command(
		config.PythonPath,
		config.ScriptPath,
		"--server",
		"--model",
		config.Model,
		"--language",
		config.Language,
		"--device",
		config.Device,
		"--max-new-tokens",
		strconv.Itoa(config.MaxNewTokens),
	)
	command.Stderr = os.Stderr

	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create Qwen ASR stdin: %w", err)
	}
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create Qwen ASR stdout: %w", err)
	}
	stdout := bufio.NewReader(stdoutPipe)

	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start Qwen ASR worker: %w", err)
	}

	worker := &qwenASRWorker{
		command: command,
		stdin:   stdin,
		stdout:  stdout,
	}
	agent.worker = worker

	line, err := readLineWithContext(ctx, stdout)
	if err != nil {
		agent.stopWorker()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("Qwen ASR worker did not load within %d seconds", config.TimeoutSeconds)
		}

		return nil, fmt.Errorf("read Qwen ASR worker readiness: %w", err)
	}

	var metadata qwenASRMetadata
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &metadata); err != nil {
		agent.stopWorker()
		return nil, fmt.Errorf("parse Qwen ASR worker readiness: %w", err)
	}
	if metadata.Type != "ready" {
		agent.stopWorker()
		return nil, fmt.Errorf("Qwen ASR worker returned unexpected readiness message: %s", strings.TrimSpace(line))
	}

	return worker, nil
}

func (agent *QwenASRVoiceCheckerAgent) stopWorker() {
	if agent.worker == nil {
		return
	}

	_ = agent.worker.stdin.Close()
	if agent.worker.command.Process != nil {
		_ = agent.worker.command.Process.Kill()
	}
	_ = agent.worker.command.Wait()
	agent.worker = nil
}

func writeASRInput(dataDir string, wav []byte) (string, string, error) {
	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", "", fmt.Errorf("create ASR data dir: %w", err)
	}

	workDir, err := os.MkdirTemp(dataDir, "check-*")
	if err != nil {
		return "", "", fmt.Errorf("create ASR work dir: %w", err)
	}

	audioPath := filepath.Join(workDir, "audio.wav")
	if err := os.WriteFile(audioPath, wav, 0o600); err != nil {
		_ = os.RemoveAll(workDir)
		return "", "", fmt.Errorf("write ASR input: %w", err)
	}

	return workDir, audioPath, nil
}

type lineResult struct {
	line string
	err  error
}

func readLineWithContext(ctx context.Context, reader *bufio.Reader) (string, error) {
	result := make(chan lineResult, 1)
	go func() {
		line, err := reader.ReadString('\n')
		result <- lineResult{line: line, err: err}
	}()

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case value := <-result:
		return value.line, value.err
	}
}

func parseQwenASRMetadata(stdout string) (qwenASRMetadata, error) {
	lines := strings.Split(strings.TrimSpace(stdout), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if line == "" {
			continue
		}

		var metadata qwenASRMetadata
		if err := json.Unmarshal([]byte(line), &metadata); err != nil {
			return qwenASRMetadata{}, fmt.Errorf("parse Qwen ASR metadata: %w", err)
		}
		if strings.TrimSpace(metadata.Transcript) == "" {
			return qwenASRMetadata{}, errors.New("Qwen ASR transcript was empty")
		}
		if metadata.Provider == "" {
			metadata.Provider = "qwen-asr"
		}

		return metadata, nil
	}

	return qwenASRMetadata{}, errors.New("Qwen ASR did not return metadata")
}
