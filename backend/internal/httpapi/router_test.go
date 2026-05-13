package httpapi_test

import (
	"bytes"
	"io"
	"net/http"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestHealthEndpoint(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	request, err := http.NewRequest(http.MethodGet, "/api/health", nil)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
}

func TestCreateJobEndpoint(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	body := bytes.NewBufferString(`{"text":"Latency is 12ms and error rate is 0.01%"}`)
	request, err := http.NewRequest(http.MethodPost, "/api/voice-jobs", body)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want %d, body = %s", response.StatusCode, http.StatusCreated, payload)
	}
}

func newService(t *testing.T) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir()},
	)
}
