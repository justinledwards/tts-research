package agents_test

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
)

func TestBonsaiVoiceOptimizationAgentStreamsWorkerDeltas(t *testing.T) {
	t.Parallel()

	scriptPath := writeFakeBonsaiWorker(t, []string{
		`echo '{"id":"1","type":"delta","text":"CPU usage "}'`,
		`echo '{"id":"1","type":"delta","text":"is ninety percent."}'`,
		`echo '{"id":"1","type":"final","text":"CPU usage is ninety percent."}'`,
	})
	agent := agents.NewBonsaiVoiceOptimizationAgent(agents.BonsaiVoiceOptimizationConfig{
		PythonPath:     scriptPath,
		ScriptPath:     "unused",
		TimeoutSeconds: 3,
	})

	var streamed strings.Builder
	optimized, err := agent.OptimizeStream(context.Background(), "CPU usage is 90%.", func(delta string) {
		streamed.WriteString(delta)
	})
	if err != nil {
		t.Fatalf("OptimizeStream returned error: %v", err)
	}

	if optimized != "CPU usage is ninety percent." {
		t.Fatalf("optimized = %q", optimized)
	}
	if streamed.String() != optimized {
		t.Fatalf("streamed = %q, want %q", streamed.String(), optimized)
	}
	if provider := agent.ProviderName(); provider != "bonsai" {
		t.Fatalf("provider = %q, want bonsai", provider)
	}
}

func TestBonsaiVoiceOptimizationAgentReturnsWorkerErrors(t *testing.T) {
	t.Parallel()

	scriptPath := writeFakeBonsaiWorker(t, []string{
		`echo '{"id":"1","type":"error","error":"model failed"}'`,
	})
	agent := agents.NewBonsaiVoiceOptimizationAgent(agents.BonsaiVoiceOptimizationConfig{
		PythonPath:     scriptPath,
		ScriptPath:     "unused",
		TimeoutSeconds: 3,
	})

	_, err := agent.Optimize(context.Background(), "source")
	if err == nil {
		t.Fatal("Optimize should return worker error")
	}
	if !strings.Contains(err.Error(), "model failed") {
		t.Fatalf("error = %q, want model failed", err)
	}
}

func writeFakeBonsaiWorker(t *testing.T, responses []string) string {
	t.Helper()

	scriptPath := filepath.Join(t.TempDir(), "fake-bonsai-worker.sh")
	content := "#!/usr/bin/env bash\nset -euo pipefail\necho '{\"type\":\"ready\",\"provider\":\"bonsai\",\"model\":\"fake\"}'\nwhile IFS= read -r _line; do\n"
	for _, response := range responses {
		content += "  " + response + "\n"
	}
	content += "done\n"

	if err := os.WriteFile(scriptPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write fake worker: %v", err)
	}

	return scriptPath
}
