package agents

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type OpenRouterVoiceOptimizationConfig struct {
	APIKey         string
	BaseURL        string
	Model          string
	HTTPReferer    string
	Title          string
	TimeoutSeconds int
	Fallback       *VoiceOptimizationAgent
	Client         *http.Client
}

type OpenRouterVoiceOptimizationAgent struct {
	config OpenRouterVoiceOptimizationConfig
	client *http.Client
}

type openRouterChatRequest struct {
	Model       string                  `json:"model"`
	Messages    []openRouterChatMessage `json:"messages"`
	Temperature float64                 `json:"temperature"`
	MaxTokens   int                     `json:"max_tokens"`
	Stream      bool                    `json:"stream,omitempty"`
}

type openRouterChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openRouterChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type openRouterStreamEvent struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func NewOpenRouterVoiceOptimizationAgent(config OpenRouterVoiceOptimizationConfig) *OpenRouterVoiceOptimizationAgent {
	if config.BaseURL == "" {
		config.BaseURL = "https://openrouter.ai/api/v1"
	}
	if config.Model == "" {
		config.Model = "openrouter/free"
	}
	if config.HTTPReferer == "" {
		config.HTTPReferer = "http://localhost:5173"
	}
	if config.Title == "" {
		config.Title = "TTS Research"
	}
	if config.TimeoutSeconds <= 0 {
		config.TimeoutSeconds = 60
	}
	if config.Fallback == nil {
		config.Fallback = NewVoiceOptimizationAgent()
	}

	client := config.Client
	if client == nil {
		client = &http.Client{Timeout: time.Duration(config.TimeoutSeconds) * time.Second}
	}

	return &OpenRouterVoiceOptimizationAgent{
		config: config,
		client: client,
	}
}

func (agent *OpenRouterVoiceOptimizationAgent) Optimize(ctx context.Context, input string) (string, error) {
	if strings.TrimSpace(agent.config.APIKey) == "" {
		return agent.config.Fallback.Optimize(ctx, input)
	}

	requestBody, err := json.Marshal(openRouterChatRequest{
		Model:       agent.config.Model,
		Messages:    buildOpenRouterOptimizationMessages(input),
		Temperature: 0.1,
		MaxTokens:   maxOpenRouterOptimizationTokens(input),
	})
	if err != nil {
		return "", fmt.Errorf("marshal OpenRouter request: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(agent.config.BaseURL, "/")+"/chat/completions",
		bytes.NewReader(requestBody),
	)
	if err != nil {
		return "", fmt.Errorf("build OpenRouter request: %w", err)
	}

	request.Header.Set("Authorization", "Bearer "+agent.config.APIKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("HTTP-Referer", agent.config.HTTPReferer)
	request.Header.Set("X-Title", agent.config.Title)

	response, err := agent.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("call OpenRouter voice optimizer: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return "", fmt.Errorf("read OpenRouter response: %w", err)
	}

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("OpenRouter voice optimizer returned %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	var decoded openRouterChatResponse
	if err := json.Unmarshal(responseBody, &decoded); err != nil {
		return "", fmt.Errorf("parse OpenRouter response: %w", err)
	}
	if decoded.Error != nil && strings.TrimSpace(decoded.Error.Message) != "" {
		return "", errors.New(decoded.Error.Message)
	}
	if len(decoded.Choices) == 0 {
		return "", errors.New("OpenRouter response did not include choices")
	}

	optimized := stripMarkdownFence(decoded.Choices[0].Message.Content)
	if optimized == "" {
		return "", errors.New("OpenRouter response was empty")
	}

	return optimized, nil
}

func (agent *OpenRouterVoiceOptimizationAgent) OptimizeStream(ctx context.Context, input string, onDelta func(string)) (string, error) {
	if strings.TrimSpace(agent.config.APIKey) == "" {
		optimized, err := agent.config.Fallback.Optimize(ctx, input)
		if err == nil && onDelta != nil {
			onDelta(optimized)
		}
		return optimized, err
	}

	requestBody, err := json.Marshal(openRouterChatRequest{
		Model:       agent.config.Model,
		Messages:    buildOpenRouterOptimizationMessages(input),
		Temperature: 0.1,
		MaxTokens:   maxOpenRouterOptimizationTokens(input),
		Stream:      true,
	})
	if err != nil {
		return "", fmt.Errorf("marshal OpenRouter stream request: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(agent.config.BaseURL, "/")+"/chat/completions",
		bytes.NewReader(requestBody),
	)
	if err != nil {
		return "", fmt.Errorf("build OpenRouter stream request: %w", err)
	}

	request.Header.Set("Authorization", "Bearer "+agent.config.APIKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "text/event-stream")
	request.Header.Set("HTTP-Referer", agent.config.HTTPReferer)
	request.Header.Set("X-Title", agent.config.Title)

	response, err := agent.client.Do(request)
	if err != nil {
		return "", fmt.Errorf("call OpenRouter voice optimizer stream: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		if readErr != nil {
			return "", fmt.Errorf("read OpenRouter stream error response: %w", readErr)
		}

		return "", fmt.Errorf("OpenRouter voice optimizer stream returned %d: %s", response.StatusCode, strings.TrimSpace(string(responseBody)))
	}

	optimized, err := readOpenRouterStream(response.Body, onDelta)
	if err != nil {
		return "", err
	}
	optimized = stripMarkdownFence(optimized)
	if optimized == "" {
		return "", errors.New("OpenRouter stream response was empty")
	}

	return optimized, nil
}

func (agent *OpenRouterVoiceOptimizationAgent) ProviderName() string {
	if strings.TrimSpace(agent.config.APIKey) == "" {
		return agent.config.Fallback.ProviderName()
	}

	return "openrouter"
}

func buildOpenRouterOptimizationMessages(input string) []openRouterChatMessage {
	instructions := strings.Join([]string{
		"Rewrite the following text for accurate text-to-speech playback.",
		"Preserve all meaning, facts, numbers, names, ordering, and technical intent.",
		"Do not infer, approximate, soften, summarize, or add context around exact values.",
		"Expand symbols, measurements, formulas, abbreviations, and code blocks into natural spoken language.",
		"When a symbol is being used as an operator, speak the operator explicitly, such as plus or equals.",
		"Optimize only the text inside <text> tags.",
		"Return only the optimized spoken text. Do not include tags, wrappers, commentary, markdown fences, labels, or summaries.",
	}, "\n")

	return []openRouterChatMessage{
		{Role: "system", Content: VoiceOptimizationPrompt},
		{Role: "user", Content: instructions + "\n\n<text>\nCPU usage is 90% + memory = 4GB.\n</text>"},
		{Role: "assistant", Content: "CPU usage is ninety percent plus memory equals four gigabytes."},
		{Role: "user", Content: instructions + "\n\n<text>\np95 latency = 280ms & temp is 37°C.\n</text>"},
		{Role: "assistant", Content: "P ninety five latency equals two hundred eighty milliseconds and temperature is thirty seven degrees Celsius."},
		{Role: "user", Content: instructions + "\n\n<text>\n```go\nfmt.Println(\"hello\")\n```\n</text>"},
		{Role: "assistant", Content: "Go code sample: fmt dot Println, open parenthesis, quote hello quote, close parenthesis."},
		{Role: "user", Content: strings.Join([]string{
			instructions,
			"",
			"<text>",
			input,
			"</text>",
		}, "\n")},
	}
}

func stripMarkdownFence(value string) string {
	trimmed := strings.TrimSpace(value)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}

	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimPrefix(trimmed, "text")
	trimmed = strings.TrimPrefix(trimmed, "markdown")
	trimmed = strings.TrimSpace(trimmed)
	trimmed = strings.TrimSuffix(trimmed, "```")

	return strings.TrimSpace(trimmed)
}

func maxOpenRouterOptimizationTokens(input string) int {
	tokenBudget := len([]rune(input))/2 + 2048
	if tokenBudget < 4096 {
		return 4096
	}
	if tokenBudget > 16_000 {
		return 16_000
	}

	return tokenBudget
}

func readOpenRouterStream(reader io.Reader, onDelta func(string)) (string, error) {
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var eventData strings.Builder
	var optimized strings.Builder
	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "" {
			delta, done, err := parseOpenRouterStreamEvent(eventData.String())
			eventData.Reset()
			if err != nil {
				return "", err
			}
			if done {
				return optimized.String(), nil
			}
			if delta != "" {
				optimized.WriteString(delta)
				if onDelta != nil {
					onDelta(delta)
				}
			}
			continue
		}

		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "data:") {
			eventData.WriteString(strings.TrimSpace(strings.TrimPrefix(trimmed, "data:")))
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read OpenRouter stream: %w", err)
	}
	if eventData.Len() > 0 {
		delta, done, err := parseOpenRouterStreamEvent(eventData.String())
		if err != nil {
			return "", err
		}
		if !done && delta != "" {
			optimized.WriteString(delta)
			if onDelta != nil {
				onDelta(delta)
			}
		}
	}

	return optimized.String(), nil
}

func parseOpenRouterStreamEvent(payload string) (string, bool, error) {
	payload = strings.TrimSpace(payload)
	if payload == "" {
		return "", false, nil
	}
	if payload == "[DONE]" {
		return "", true, nil
	}

	var event openRouterStreamEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return "", false, nil
	}
	if event.Error != nil && strings.TrimSpace(event.Error.Message) != "" {
		return "", false, errors.New(event.Error.Message)
	}
	if len(event.Choices) == 0 {
		return "", false, nil
	}

	return event.Choices[0].Delta.Content, false, nil
}
