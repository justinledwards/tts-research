package httpapi_test

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"testing"
	"time"

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

func TestTTSEnginesEndpoint(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	request, err := http.NewRequest(http.MethodGet, "/api/tts-engines", nil)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	var engines []pipeline.TTSEngineDiagnostics
	if err := json.NewDecoder(response.Body).Decode(&engines); err != nil {
		t.Fatalf("decode engines: %v", err)
	}
	if len(engines) == 0 || engines[0].ID != pipeline.TTSEngineAuto {
		t.Fatalf("engines = %#v, want auto diagnostics first", engines)
	}
}

func TestCreateJobEndpoint(t *testing.T) {
	t.Parallel()

	service := newService(t)
	app := httpapi.NewRouter(service)
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

	var job pipeline.VoiceJob
	if err := json.NewDecoder(response.Body).Decode(&job); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestProjectEndpointsCreateRenameAndListJobs(t *testing.T) {
	t.Parallel()

	service := newService(t)
	app := httpapi.NewRouter(service)

	createBody := bytes.NewBufferString(`{"name":"Demo project"}`)
	createRequest, err := http.NewRequest(http.MethodPost, "/api/projects", createBody)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")

	createResponse, err := app.Test(createRequest)
	if err != nil {
		t.Fatalf("app.Test(create project) returned error: %v", err)
	}
	defer createResponse.Body.Close()
	if createResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("create status = %d, want %d, body = %s", createResponse.StatusCode, http.StatusCreated, payload)
	}

	var project pipeline.VoiceProject
	if err := json.NewDecoder(createResponse.Body).Decode(&project); err != nil {
		t.Fatalf("decode project: %v", err)
	}

	renameBody := bytes.NewBufferString(`{"name":"Renamed demo project"}`)
	renameRequest, err := http.NewRequest(http.MethodPatch, "/api/projects/"+project.ID, renameBody)
	if err != nil {
		t.Fatalf("NewRequest(rename) returned error: %v", err)
	}
	renameRequest.Header.Set("Content-Type", "application/json")

	renameResponse, err := app.Test(renameRequest)
	if err != nil {
		t.Fatalf("app.Test(rename project) returned error: %v", err)
	}
	defer renameResponse.Body.Close()
	if renameResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(renameResponse.Body)
		t.Fatalf("rename status = %d, want %d, body = %s", renameResponse.StatusCode, http.StatusOK, payload)
	}

	var renamed pipeline.VoiceProject
	if err := json.NewDecoder(renameResponse.Body).Decode(&renamed); err != nil {
		t.Fatalf("decode renamed project: %v", err)
	}
	if renamed.Name != "Renamed demo project" {
		t.Fatalf("renamed project name = %q", renamed.Name)
	}
	if _, err := service.GetProject(project.ID); err != nil {
		t.Fatalf("service should still contain project %q: %v", project.ID, err)
	}

	jobBody := bytes.NewBufferString(`{"projectId":"` + project.ID + `","text":"A project-specific job."}`)
	jobRequest, err := http.NewRequest(http.MethodPost, "/api/voice-jobs", jobBody)
	if err != nil {
		t.Fatalf("NewRequest(job) returned error: %v", err)
	}
	jobRequest.Header.Set("Content-Type", "application/json")
	jobResponse, err := app.Test(jobRequest)
	if err != nil {
		t.Fatalf("app.Test(create job) returned error: %v", err)
	}
	defer jobResponse.Body.Close()
	if jobResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(jobResponse.Body)
		t.Fatalf("job status = %d, want %d, project = %q, body = %s", jobResponse.StatusCode, http.StatusCreated, project.ID, payload)
	}
	var job pipeline.VoiceJob
	if err := json.NewDecoder(jobResponse.Body).Decode(&job); err != nil {
		t.Fatalf("decode job: %v", err)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)

	listRequest, err := http.NewRequest(http.MethodGet, "/api/projects/"+project.ID+"/jobs", nil)
	if err != nil {
		t.Fatalf("NewRequest(list jobs) returned error: %v", err)
	}
	listResponse, err := app.Test(listRequest)
	if err != nil {
		t.Fatalf("app.Test(list jobs) returned error: %v", err)
	}
	defer listResponse.Body.Close()
	if listResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(listResponse.Body)
		t.Fatalf("list jobs status = %d, want %d, body = %s", listResponse.StatusCode, http.StatusOK, payload)
	}
	var jobs []pipeline.VoiceJob
	if err := json.NewDecoder(listResponse.Body).Decode(&jobs); err != nil {
		t.Fatalf("decode jobs: %v", err)
	}
	if len(jobs) != 1 || jobs[0].ID != job.ID || jobs[0].ProjectID != project.ID {
		t.Fatalf("jobs = %#v, want one project job", jobs)
	}

	storageRequest, err := http.NewRequest(http.MethodGet, "/api/projects/"+project.ID+"/storage", nil)
	if err != nil {
		t.Fatalf("NewRequest(storage) returned error: %v", err)
	}
	storageResponse, err := app.Test(storageRequest)
	if err != nil {
		t.Fatalf("app.Test(storage) returned error: %v", err)
	}
	defer storageResponse.Body.Close()
	if storageResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(storageResponse.Body)
		t.Fatalf("storage status = %d, want %d, body = %s", storageResponse.StatusCode, http.StatusOK, payload)
	}
	var storage pipeline.ProjectStorageSummary
	if err := json.NewDecoder(storageResponse.Body).Decode(&storage); err != nil {
		t.Fatalf("decode storage: %v", err)
	}
	if storage.ProjectID != project.ID || len(storage.Downloads) == 0 {
		t.Fatalf("storage = %#v, want downloads for project", storage)
	}

	deleteDefaultRequest, err := http.NewRequest(http.MethodDelete, "/api/projects/default", nil)
	if err != nil {
		t.Fatalf("NewRequest(delete default) returned error: %v", err)
	}
	deleteDefaultResponse, err := app.Test(deleteDefaultRequest)
	if err != nil {
		t.Fatalf("app.Test(delete default) returned error: %v", err)
	}
	defer deleteDefaultResponse.Body.Close()
	if deleteDefaultResponse.StatusCode != http.StatusConflict {
		t.Fatalf("delete default status = %d, want %d", deleteDefaultResponse.StatusCode, http.StatusConflict)
	}

	deleteRequest, err := http.NewRequest(http.MethodDelete, "/api/projects/"+project.ID, nil)
	if err != nil {
		t.Fatalf("NewRequest(delete) returned error: %v", err)
	}
	deleteResponse, err := app.Test(deleteRequest)
	if err != nil {
		t.Fatalf("app.Test(delete) returned error: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusNoContent {
		payload, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("delete status = %d, want %d, body = %s", deleteResponse.StatusCode, http.StatusNoContent, payload)
	}
	if _, err := service.GetProject(project.ID); !errors.Is(err, pipeline.ErrProjectNotFound) {
		t.Fatalf("GetProject deleted error = %v, want not found", err)
	}
}

func newService(t *testing.T) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)
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
