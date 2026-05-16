package agents_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

func TestOpenRouterVoiceOptimizationAgentUsesChatCompletions(t *testing.T) {
	t.Parallel()

	var requestModel string
	var authorization string
	var referer string

	client := testHTTPClient(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/api/v1/chat/completions" {
			t.Fatalf("path = %q, want /api/v1/chat/completions", request.URL.Path)
		}

		authorization = request.Header.Get("Authorization")
		referer = request.Header.Get("HTTP-Referer")

		var payload struct {
			Model    string `json:"model"`
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		requestModel = payload.Model

		return jsonResponse(`{"choices":[{"message":{"content":"CPU usage is ninety percent."}}]}`), nil
	})

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{
		APIKey:      "test-key",
		BaseURL:     "https://openrouter.test/api/v1",
		Model:       "openrouter/free",
		HTTPReferer: "http://localhost:5173",
		Client:      client,
	})

	optimized, err := agent.Optimize(context.Background(), "CPU usage is 90%.")
	if err != nil {
		t.Fatalf("Optimize returned error: %v", err)
	}

	if optimized != "CPU usage is ninety percent." {
		t.Fatalf("optimized = %q", optimized)
	}
	if requestModel != "openrouter/free" {
		t.Fatalf("model = %q, want openrouter/free", requestModel)
	}
	if authorization != "Bearer test-key" {
		t.Fatalf("authorization header not set")
	}
	if referer != "http://localhost:5173" {
		t.Fatalf("referer = %q", referer)
	}
}

func TestOpenRouterVoiceOptimizationAgentStreamsChatCompletions(t *testing.T) {
	t.Parallel()

	var requestStream bool

	client := testHTTPClient(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path != "/api/v1/chat/completions" {
			t.Fatalf("path = %q, want /api/v1/chat/completions", request.URL.Path)
		}

		var payload struct {
			Stream bool `json:"stream"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		requestStream = payload.Stream

		var body string
		for _, content := range []string{"CPU usage ", "is ninety percent."} {
			body += fmt.Sprintf("data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", content)
		}
		body += "data: [DONE]\n\n"
		return streamResponse(body), nil
	})

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{
		APIKey:      "test-key",
		BaseURL:     "https://openrouter.test/api/v1",
		Model:       "openrouter/free",
		HTTPReferer: "http://localhost:5173",
		Client:      client,
	})

	var streamed string
	optimized, err := agent.OptimizeStream(context.Background(), "CPU usage is 90%.", func(delta string) {
		streamed += delta
	})
	if err != nil {
		t.Fatalf("OptimizeStream returned error: %v", err)
	}

	if !requestStream {
		t.Fatal("stream flag should be true")
	}
	if optimized != "CPU usage is ninety percent." {
		t.Fatalf("optimized = %q", optimized)
	}
	if streamed != optimized {
		t.Fatalf("streamed = %q, want %q", streamed, optimized)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (roundTrip roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

func testHTTPClient(roundTrip roundTripFunc) *http.Client {
	return &http.Client{Transport: roundTrip}
}

func jsonResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"application/json"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func streamResponse(body string) *http.Response {
	return &http.Response{
		StatusCode: http.StatusOK,
		Header:     http.Header{"Content-Type": []string{"text/event-stream"}},
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestOpenRouterVoiceOptimizationAgentFallsBackWithoutKey(t *testing.T) {
	t.Parallel()

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{})

	optimized, err := agent.Optimize(context.Background(), "CPU usage is 90% + memory = 4GB.")
	if err != nil {
		t.Fatalf("Optimize returned error: %v", err)
	}

	if optimized != "CPU usage is 90% + memory = 4GB." {
		t.Fatalf("optimized = %q", optimized)
	}
}
