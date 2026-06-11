package httpapi_test

import (
	"bytes"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"testing"

	httpapi "github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestTemporarySourceRoutesCreateGenerateArtifactsAndPromote(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	createRequest, err := http.NewRequest(
		http.MethodPost,
		"/api/temporary-sources",
		bytes.NewBufferString(`{"kind":"text","text":"Temporary route source.","sourceName":"route.md"}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(create) returned error: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse, err := app.Test(createRequest)
	if err != nil {
		t.Fatalf("app.Test(create) returned error: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("create status = %d, want %d, body = %s", createResponse.StatusCode, http.StatusCreated, payload)
	}
	var temporary pipeline.TemporarySourceSession
	if err := json.NewDecoder(createResponse.Body).Decode(&temporary); err != nil {
		t.Fatalf("decode temporary source: %v", err)
	}
	if temporary.ProjectID != "" {
		t.Fatalf("temporary project id = %q, want empty", temporary.ProjectID)
	}

	jobRequest, err := http.NewRequest(
		http.MethodPost,
		"/api/temporary-sources/"+temporary.ID+"/voice-jobs",
		bytes.NewBufferString(`{}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(job) returned error: %v", err)
	}
	jobRequest.Header.Set("Content-Type", "application/json")
	jobResponse, err := app.Test(jobRequest)
	if err != nil {
		t.Fatalf("app.Test(job) returned error: %v", err)
	}
	defer jobResponse.Body.Close()
	if jobResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(jobResponse.Body)
		t.Fatalf("job status = %d, want %d, body = %s", jobResponse.StatusCode, http.StatusCreated, payload)
	}
	var job pipeline.VoiceJob
	if err := json.NewDecoder(jobResponse.Body).Decode(&job); err != nil {
		t.Fatalf("decode job: %v", err)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)

	artifactsRequest, err := http.NewRequest(http.MethodGet, "/api/temporary-sources/"+temporary.ID+"/artifacts", nil)
	if err != nil {
		t.Fatalf("NewRequest(artifacts) returned error: %v", err)
	}
	artifactsResponse, err := app.Test(artifactsRequest)
	if err != nil {
		t.Fatalf("app.Test(artifacts) returned error: %v", err)
	}
	defer artifactsResponse.Body.Close()
	if artifactsResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(artifactsResponse.Body)
		t.Fatalf("artifacts status = %d, want %d, body = %s", artifactsResponse.StatusCode, http.StatusOK, payload)
	}
	var artifacts []pipeline.SourceArtifactRef
	if err := json.NewDecoder(artifactsResponse.Body).Decode(&artifacts); err != nil {
		t.Fatalf("decode artifacts: %v", err)
	}
	if len(artifacts) < 2 {
		t.Fatalf("artifacts = %#v, want extraction and generated audio", artifacts)
	}

	promoteRequest, err := http.NewRequest(
		http.MethodPost,
		"/api/temporary-sources/"+temporary.ID+"/promote",
		bytes.NewBufferString(`{"projectId":"default"}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(promote) returned error: %v", err)
	}
	promoteRequest.Header.Set("Content-Type", "application/json")
	promoteResponse, err := app.Test(promoteRequest)
	if err != nil {
		t.Fatalf("app.Test(promote) returned error: %v", err)
	}
	defer promoteResponse.Body.Close()
	if promoteResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(promoteResponse.Body)
		t.Fatalf("promote status = %d, want %d, body = %s", promoteResponse.StatusCode, http.StatusCreated, payload)
	}
	var promoted pipeline.PreparedSource
	if err := json.NewDecoder(promoteResponse.Body).Decode(&promoted); err != nil {
		t.Fatalf("decode promoted source: %v", err)
	}
	if promoted.ProjectID != "default" || promoted.TemporarySourceID != temporary.ID {
		t.Fatalf("promoted = %#v, want default project copy linked to temporary id", promoted)
	}
}

func TestTemporarySourceRouteAcceptsMultipartFile(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "upload.md")
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write([]byte("Uploaded temporary narration text.")); err != nil {
		t.Fatalf("write multipart file returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close multipart writer returned error: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, "/api/temporary-sources", &body)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}
	request.Header.Set("Content-Type", writer.FormDataContentType())
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want %d, body = %s", response.StatusCode, http.StatusCreated, payload)
	}
	var temporary pipeline.TemporarySourceSession
	if err := json.NewDecoder(response.Body).Decode(&temporary); err != nil {
		t.Fatalf("decode temporary source: %v", err)
	}
	if temporary.Kind != string(pipeline.PreparedSourceKindFile) || temporary.SourceName != "upload.md" {
		t.Fatalf("temporary = %#v, want file-backed upload", temporary)
	}
}
