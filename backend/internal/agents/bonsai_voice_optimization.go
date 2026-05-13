package agents

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type BonsaiVoiceOptimizationConfig struct {
	PythonPath     string
	ScriptPath     string
	Model          string
	TimeoutSeconds int
	MaxTokens      int
	ChunkRunes     int
	Temperature    float64
	TopP           float64
	TopK           int
}

type BonsaiVoiceOptimizationAgent struct {
	config BonsaiVoiceOptimizationConfig
	mu     sync.Mutex
	worker *bonsaiVoiceOptimizationWorker
	nextID uint64
}

type bonsaiVoiceOptimizationWorker struct {
	command *exec.Cmd
	stdin   io.WriteCloser
	stdout  *bufio.Reader
}

type bonsaiVoiceOptimizationMessage struct {
	ID       string `json:"id,omitempty"`
	Type     string `json:"type"`
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
	Text     string `json:"text,omitempty"`
	Error    string `json:"error,omitempty"`
}

func NewBonsaiVoiceOptimizationAgent(config BonsaiVoiceOptimizationConfig) *BonsaiVoiceOptimizationAgent {
	if config.PythonPath == "" {
		config.PythonPath = "./.venv-bonsai/bin/python"
	}
	if config.ScriptPath == "" {
		config.ScriptPath = "./scripts/bonsai_optimize.py"
	}
	if config.Model == "" {
		config.Model = "prism-ml/Bonsai-8B-mlx-1bit"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 600
	}
	if config.ChunkRunes <= 0 {
		config.ChunkRunes = 1600
	}
	if config.Temperature <= 0 {
		config.Temperature = 0.1
	}
	if config.TopP <= 0 {
		config.TopP = 0.9
	}
	if config.TopK <= 0 {
		config.TopK = 20
	}

	return &BonsaiVoiceOptimizationAgent{config: config}
}

func (agent *BonsaiVoiceOptimizationAgent) Optimize(ctx context.Context, input string) (string, error) {
	return agent.OptimizeStream(ctx, input, nil)
}

func (agent *BonsaiVoiceOptimizationAgent) OptimizeStream(ctx context.Context, input string, onDelta func(string)) (string, error) {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	worker, err := agent.ensureWorker(ctx)
	if err != nil {
		return "", err
	}

	agent.nextID++
	requestID := strconv.FormatUint(agent.nextID, 10)
	request := map[string]any{
		"id":        requestID,
		"text":      input,
		"maxTokens": maxBonsaiOptimizationTokens(input, config.MaxTokens),
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return "", fmt.Errorf("marshal Bonsai optimizer request: %w", err)
	}
	if _, err := worker.stdin.Write(append(payload, '\n')); err != nil {
		agent.stopWorker()
		return "", fmt.Errorf("write Bonsai optimizer request: %w", err)
	}

	var streamed strings.Builder
	for {
		line, err := readLineWithContext(ctx, worker.stdout)
		if err != nil {
			agent.stopWorker()
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return "", fmt.Errorf("Bonsai optimizer timed out after %d seconds", config.TimeoutSeconds)
			}

			return "", fmt.Errorf("read Bonsai optimizer response: %w", err)
		}

		var message bonsaiVoiceOptimizationMessage
		if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &message); err != nil {
			agent.stopWorker()
			return "", fmt.Errorf("parse Bonsai optimizer response: %w", err)
		}
		if message.ID != "" && message.ID != requestID {
			agent.stopWorker()
			return "", fmt.Errorf("Bonsai optimizer response id %q did not match request id %q", message.ID, requestID)
		}

		switch message.Type {
		case "delta":
			if message.Text == "" {
				continue
			}
			streamed.WriteString(message.Text)
			if onDelta != nil {
				onDelta(message.Text)
			}
		case "final":
			optimized := stripMarkdownFence(message.Text)
			if optimized == "" {
				optimized = stripMarkdownFence(streamed.String())
			}
			if optimized == "" {
				return "", errors.New("Bonsai optimizer response was empty")
			}

			return optimized, nil
		case "error":
			agent.stopWorker()
			if message.Error == "" {
				return "", errors.New("Bonsai optimizer failed")
			}

			return "", fmt.Errorf("Bonsai optimizer failed: %s", message.Error)
		default:
			agent.stopWorker()
			return "", fmt.Errorf("Bonsai optimizer returned unexpected message type %q", message.Type)
		}
	}
}

func (agent *BonsaiVoiceOptimizationAgent) ProviderName() string {
	return "bonsai"
}

func (agent *BonsaiVoiceOptimizationAgent) Warm(ctx context.Context) error {
	config := agent.config
	ctx, cancel := context.WithTimeout(ctx, time.Duration(config.TimeoutSeconds)*time.Second)
	defer cancel()

	agent.mu.Lock()
	defer agent.mu.Unlock()

	_, err := agent.ensureWorker(ctx)
	return err
}

func (agent *BonsaiVoiceOptimizationAgent) ensureWorker(ctx context.Context) (*bonsaiVoiceOptimizationWorker, error) {
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
		"--max-tokens",
		strconv.Itoa(maxBonsaiOptimizationTokens("", config.MaxTokens)),
		"--chunk-runes",
		strconv.Itoa(config.ChunkRunes),
		"--temperature",
		strconv.FormatFloat(config.Temperature, 'f', -1, 64),
		"--top-p",
		strconv.FormatFloat(config.TopP, 'f', -1, 64),
		"--top-k",
		strconv.Itoa(config.TopK),
	)
	command.Stderr = os.Stderr

	stdin, err := command.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create Bonsai optimizer stdin: %w", err)
	}
	stdoutPipe, err := command.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("create Bonsai optimizer stdout: %w", err)
	}
	stdout := bufio.NewReader(stdoutPipe)

	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start Bonsai optimizer worker: %w", err)
	}

	worker := &bonsaiVoiceOptimizationWorker{
		command: command,
		stdin:   stdin,
		stdout:  stdout,
	}
	agent.worker = worker

	line, err := readLineWithContext(ctx, stdout)
	if err != nil {
		agent.stopWorker()
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return nil, fmt.Errorf("Bonsai optimizer worker did not load within %d seconds", config.TimeoutSeconds)
		}

		return nil, fmt.Errorf("read Bonsai optimizer worker readiness: %w", err)
	}

	var message bonsaiVoiceOptimizationMessage
	if err := json.Unmarshal([]byte(strings.TrimSpace(line)), &message); err != nil {
		agent.stopWorker()
		return nil, fmt.Errorf("parse Bonsai optimizer worker readiness: %w", err)
	}
	if message.Type != "ready" {
		agent.stopWorker()
		return nil, fmt.Errorf("Bonsai optimizer worker returned unexpected readiness message: %s", strings.TrimSpace(line))
	}

	return worker, nil
}

func (agent *BonsaiVoiceOptimizationAgent) stopWorker() {
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

func maxBonsaiOptimizationTokens(input string, configured int) int {
	if configured > 0 {
		return configured
	}

	return maxOpenRouterOptimizationTokens(input)
}
