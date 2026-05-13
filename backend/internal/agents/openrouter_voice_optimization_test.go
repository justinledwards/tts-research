package agents_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

func TestOpenRouterVoiceOptimizationAgentUsesChatCompletions(t *testing.T) {
	t.Parallel()

	var requestModel string
	var authorization string
	var referer string

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/chat/completions" {
			t.Fatalf("path = %q, want /chat/completions", request.URL.Path)
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

		response.Header().Set("Content-Type", "application/json")
		_, _ = response.Write([]byte(`{"choices":[{"message":{"content":"CPU usage is ninety percent."}}]}`))
	}))
	defer server.Close()

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{
		APIKey:      "test-key",
		BaseURL:     server.URL,
		Model:       "openrouter/free",
		HTTPReferer: "http://localhost:5173",
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

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/chat/completions" {
			t.Fatalf("path = %q, want /chat/completions", request.URL.Path)
		}

		var payload struct {
			Stream bool `json:"stream"`
		}
		if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		requestStream = payload.Stream

		response.Header().Set("Content-Type", "text/event-stream")
		flusher, ok := response.(http.Flusher)
		if !ok {
			t.Fatal("test response writer should support flushing")
		}

		for _, content := range []string{"CPU usage ", "is ninety percent."} {
			_, _ = fmt.Fprintf(response, "data: {\"choices\":[{\"delta\":{\"content\":%q}}]}\n\n", content)
			flusher.Flush()
		}
		_, _ = response.Write([]byte("data: [DONE]\n\n"))
	}))
	defer server.Close()

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{
		APIKey:      "test-key",
		BaseURL:     server.URL,
		Model:       "openrouter/free",
		HTTPReferer: "http://localhost:5173",
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

func TestOpenRouterVoiceOptimizationAgentFallsBackWithoutKey(t *testing.T) {
	t.Parallel()

	agent := agents.NewOpenRouterVoiceOptimizationAgent(agents.OpenRouterVoiceOptimizationConfig{})

	optimized, err := agent.Optimize(context.Background(), "CPU usage is 90% + memory = 4GB.")
	if err != nil {
		t.Fatalf("Optimize returned error: %v", err)
	}

	if optimized != "CPU usage is 90 percent plus memory equals 4GB." {
		t.Fatalf("optimized = %q", optimized)
	}
}
