package httpapi_test

import (
	"archive/zip"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/audio"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func newService(t *testing.T) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)
}

func newServiceWithContentIRDirs(t *testing.T) (*pipeline.Service, string, string) {
	t.Helper()
	sourcePrepDir := t.TempDir()
	bookSourceDir := t.TempDir()
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:         3,
			JobDataDir:         t.TempDir(),
			ProjectDataDir:     t.TempDir(),
			BookSourceDir:      bookSourceDir,
			SourcePrepDir:      sourcePrepDir,
			ProgressDataDir:    t.TempDir(),
			PlaybackSessionDir: t.TempDir(),
		},
	)
	return service, sourcePrepDir, bookSourceDir
}

func newTimedOutVoiceProfileArtifactService(
	t *testing.T,
	defaultTimeoutSeconds int,
) (*pipeline.Service, pipeline.VoiceProfile) {
	t.Helper()

	upstreamDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(upstreamDir, "optimize_style.py"), []byte("# test\n"), 0o644); err != nil {
		t.Fatalf("write fake optimizer: %v", err)
	}
	artifactScript := filepath.Join(t.TempDir(), "profile_embed_artifact.py")
	if err := os.WriteFile(
		artifactScript,
		[]byte("import time\nwhile True:\n    time.sleep(1)\n"),
		0o755,
	); err != nil {
		t.Fatalf("write artifact script: %v", err)
	}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:                         3,
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileDenoiseProvider:        "none",
			VoiceProfileArtifactTimeoutSeconds: defaultTimeoutSeconds,
			VoiceProfileArtifactPythonPath:     "python3",
			VoiceProfileArtifactScriptPath:     artifactScript,
			ResearchModules: []pipeline.ResearchModuleConfig{
				{
					ID:        pipeline.ResearchModuleKokoroEmbed,
					Label:     "Kokoro Embed",
					RepoURL:   "https://example.invalid/kokoro.embed.git",
					Ref:       "main",
					LocalPath: upstreamDir,
					EngineID:  pipeline.TTSEngineKokoroEmbed,
				},
			},
		},
	)
	t.Setenv("VOICE_EMBED_FAKE_ARTIFACT", "1")
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfile(context.Background(), "Test", "en", sourcePath, "source.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}
	return service, profile
}

func getContentIRDocument(
	t *testing.T,
	app *fiber.App,
	id string,
	status int,
) contentir.Document {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "/api/content-ir/"+id, nil)
	if err != nil {
		t.Fatalf("NewRequest(content-ir) returned error: %v", err)
	}
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test(content-ir) returned error: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != status {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("content-ir status = %d, want %d, body = %s", response.StatusCode, status, payload)
	}
	if status != http.StatusOK {
		return contentir.Document{}
	}
	var document contentir.Document
	if err := json.NewDecoder(response.Body).Decode(&document); err != nil {
		t.Fatalf("decode content IR: %v", err)
	}
	return document
}

func getCredentialStatus(t *testing.T, app *fiber.App) pipeline.VoiceProfileCredentialStatus {
	t.Helper()
	request, err := http.NewRequest(http.MethodGet, "/api/voice-profile-credentials", nil)
	if err != nil {
		t.Fatalf("NewRequest(credentials) returned error: %v", err)
	}
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test(credentials) returned error: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("credentials status = %d, want %d, body = %s", response.StatusCode, http.StatusOK, payload)
	}
	var status pipeline.VoiceProfileCredentialStatus
	if err := json.NewDecoder(response.Body).Decode(&status); err != nil {
		t.Fatalf("decode credentials: %v", err)
	}
	return status
}

func writeRouterTestEPUB(t *testing.T) string {
	t.Helper()
	outputPath := filepath.Join(t.TempDir(), "endpoint.epub")
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/package.opf"/></rootfiles></container>`,
		"OPS/package.opf":        `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Endpoint Book</dc:title></metadata><manifest><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`,
		"OPS/chapter.xhtml":      `<html><body><h1>Endpoint</h1><p>Book content IR endpoint.</p></body></html>`,
	}
	for path, body := range files {
		writer, createErr := zipWriter.Create(path)
		if createErr != nil {
			t.Fatalf("Create zip file returned error: %v", createErr)
		}
		if _, writeErr := writer.Write([]byte(body)); writeErr != nil {
			t.Fatalf("Write zip file returned error: %v", writeErr)
		}
	}
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("Close zip writer returned error: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close EPUB returned error: %v", err)
	}
	return outputPath
}

func hasAdapterCapability(capabilities []pipeline.AdapterCapability, adapterID string) bool {
	for _, capability := range capabilities {
		if capability.AdapterID == adapterID {
			return true
		}
	}
	return false
}

type routerProfileSourceAnalyzer struct {
	result pipeline.VoiceProfileSourceAnalysisResult
	err    error
}

func (analyzer routerProfileSourceAnalyzer) AnalyzeVoiceProfileSource(
	_ context.Context,
	_ pipeline.VoiceProfileSourceAnalysisRequest,
) (pipeline.VoiceProfileSourceAnalysisResult, error) {
	if analyzer.err != nil {
		return pipeline.VoiceProfileSourceAnalysisResult{}, analyzer.err
	}
	return analyzer.result, nil
}

type routerTranscriptChecker struct {
	transcript string
	provider   string
}

func (checker routerTranscriptChecker) Check(
	_ context.Context,
	expectedText string,
	_ []byte,
) (agents.VoiceCheckResult, error) {
	transcript := checker.transcript
	if transcript == "" {
		transcript = expectedText
	}
	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  transcript,
		NeedsResume: false,
		Reason:      "router transcript",
		Provider:    checker.provider,
		Similarity:  0.9,
	}, nil
}

func waitForRouterProfileSource(
	t *testing.T,
	service *pipeline.Service,
	id string,
	status pipeline.VoiceProfileSourceStatus,
) pipeline.VoiceProfileSource {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		source, err := service.GetVoiceProfileSource(id)
		if err != nil {
			t.Fatalf("GetVoiceProfileSource returned error: %v", err)
		}
		if source.Status == status {
			return source
		}
		if source.Status == pipeline.VoiceProfileSourceStatusFailed && status != source.Status {
			t.Fatalf("source failed unexpectedly: %s", source.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}
	source, err := service.GetVoiceProfileSource(id)
	if err != nil {
		t.Fatalf("GetVoiceProfileSource returned error: %v", err)
	}
	t.Fatalf("timed out waiting for source status %q, got %q (%s)", status, source.Status, source.Error)
	return pipeline.VoiceProfileSource{}
}

func waitForJob(t *testing.T, service *pipeline.Service, id string, status pipeline.JobStatus) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.Status == status {
			return
		}
		if job.Status == pipeline.JobStatusFailed {
			t.Fatalf("job failed: %s", job.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, _ := service.GetJob(id)
	t.Fatalf("job status = %q, want %q", job.Status, status)
}

func writeToneWAV(t *testing.T, durationMS int, amplitude int16) string {
	t.Helper()

	spec := audio.WAVSpec{SampleRate: 24000, ChannelCount: 1, BitsPerSample: 16}
	sampleCount := spec.SampleRate * durationMS / 1000
	data := make([]byte, sampleCount*2)
	for sampleIndex := 0; sampleIndex < sampleCount; sampleIndex += 1 {
		value := amplitude
		if sampleIndex%48 >= 24 {
			value = -amplitude
		}
		binary.LittleEndian.PutUint16(data[sampleIndex*2:sampleIndex*2+2], uint16(value))
	}
	path := filepath.Join(t.TempDir(), "source.wav")
	if err := os.WriteFile(path, audio.BuildPCM16WAV(data, spec), 0o644); err != nil {
		t.Fatalf("write tone wav: %v", err)
	}
	return path
}
