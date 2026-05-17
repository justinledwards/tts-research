package httpapi_test

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
	"github.com/justinedwards/tts-research/backend/internal/speechplan"
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

func TestResearchModuleClonePreflightAllowsLocalDevOrigins(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	request, err := http.NewRequest(http.MethodOptions, "/api/research-modules/supertonic-embed/clone", nil)
	if err != nil {
		t.Fatalf("NewRequest returned error: %v", err)
	}
	request.Header.Set(fiber.HeaderOrigin, "http://192.168.1.42:5173")
	request.Header.Set(fiber.HeaderAccessControlRequestMethod, http.MethodPost)
	request.Header.Set(fiber.HeaderAccessControlRequestHeaders, "Content-Type")

	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test returned error: %v", err)
	}
	defer response.Body.Close()

	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNoContent)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowOrigin); got != "http://192.168.1.42:5173" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want local dev origin", got)
	}
	if got := response.Header.Get(fiber.HeaderAccessControlAllowMethods); !strings.Contains(got, http.MethodPost) {
		t.Fatalf("Access-Control-Allow-Methods = %q, want POST", got)
	}
}

func TestVoiceProfileCredentialsEndpointSavesStatusWithoutReturningToken(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:                         3,
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileCredentialsPath:        filepath.Join(t.TempDir(), "credentials", "huggingface.json"),
			VoiceProfileDiarizationToken:       "env-token",
			VoiceProfileDenoiseProvider:        "none",
			VoiceProfileLikenessTimeoutSeconds: 1,
		},
	)
	app := httpapi.NewRouter(service)

	preflight, err := http.NewRequest(http.MethodOptions, "/api/voice-profile-credentials/hugging-face-token", nil)
	if err != nil {
		t.Fatalf("NewRequest(preflight) returned error: %v", err)
	}
	preflight.Header.Set(fiber.HeaderOrigin, "http://localhost:5173")
	preflight.Header.Set(fiber.HeaderAccessControlRequestMethod, http.MethodPut)
	preflight.Header.Set(fiber.HeaderAccessControlRequestHeaders, "Content-Type")
	preflightResponse, err := app.Test(preflight)
	if err != nil {
		t.Fatalf("app.Test(preflight) returned error: %v", err)
	}
	defer preflightResponse.Body.Close()
	if preflightResponse.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d, want %d", preflightResponse.StatusCode, http.StatusNoContent)
	}
	if got := preflightResponse.Header.Get(fiber.HeaderAccessControlAllowMethods); !strings.Contains(got, http.MethodPut) {
		t.Fatalf("Access-Control-Allow-Methods = %q, want PUT", got)
	}

	status := getCredentialStatus(t, app)
	if !status.HuggingFaceTokenConfigured || status.HuggingFaceTokenSource != "env" {
		t.Fatalf("status = %+v, want env fallback", status)
	}

	putRequest, err := http.NewRequest(
		http.MethodPut,
		"/api/voice-profile-credentials/hugging-face-token",
		bytes.NewBufferString(`{"token":"  local-secret  "}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(put) returned error: %v", err)
	}
	putRequest.Header.Set("Content-Type", "application/json")
	putResponse, err := app.Test(putRequest)
	if err != nil {
		t.Fatalf("app.Test(put) returned error: %v", err)
	}
	defer putResponse.Body.Close()
	bodyBytes, _ := io.ReadAll(putResponse.Body)
	if putResponse.StatusCode != http.StatusOK {
		t.Fatalf("put status = %d, want %d, body = %s", putResponse.StatusCode, http.StatusOK, bodyBytes)
	}
	if strings.Contains(string(bodyBytes), "local-secret") {
		t.Fatalf("credential response leaked token: %s", bodyBytes)
	}
	var putStatus pipeline.VoiceProfileCredentialStatus
	if err := json.Unmarshal(bodyBytes, &putStatus); err != nil {
		t.Fatalf("decode put status: %v", err)
	}
	if !putStatus.HuggingFaceTokenConfigured || putStatus.HuggingFaceTokenSource != "local" {
		t.Fatalf("put status = %+v, want local token", putStatus)
	}

	deleteRequest, err := http.NewRequest(http.MethodDelete, "/api/voice-profile-credentials/hugging-face-token", nil)
	if err != nil {
		t.Fatalf("NewRequest(delete) returned error: %v", err)
	}
	deleteResponse, err := app.Test(deleteRequest)
	if err != nil {
		t.Fatalf("app.Test(delete) returned error: %v", err)
	}
	defer deleteResponse.Body.Close()
	if deleteResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(deleteResponse.Body)
		t.Fatalf("delete status = %d, want %d, body = %s", deleteResponse.StatusCode, http.StatusOK, payload)
	}
	status = getCredentialStatus(t, app)
	if !status.HuggingFaceTokenConfigured || status.HuggingFaceTokenSource != "env" {
		t.Fatalf("status = %+v, want env fallback after delete", status)
	}
}

func TestAdapterCapabilityEndpoints(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	capabilityRequest, err := http.NewRequest(http.MethodGet, "/api/adapters/capabilities", nil)
	if err != nil {
		t.Fatalf("NewRequest(capabilities) returned error: %v", err)
	}
	capabilityResponse, err := app.Test(capabilityRequest, fiber.TestConfig{Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("app.Test(capabilities) returned error: %v", err)
	}
	defer capabilityResponse.Body.Close()
	if capabilityResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(capabilityResponse.Body)
		t.Fatalf("capabilities status = %d, want %d, body = %s", capabilityResponse.StatusCode, http.StatusOK, payload)
	}
	var capabilities []pipeline.AdapterCapability
	if err := json.NewDecoder(capabilityResponse.Body).Decode(&capabilities); err != nil {
		t.Fatalf("decode capabilities: %v", err)
	}
	if !hasAdapterCapability(capabilities, "epub") || !hasAdapterCapability(capabilities, "docx") || !hasAdapterCapability(capabilities, "html") {
		t.Fatalf("capabilities = %#v, want EPUB/DOCX/HTML", capabilities)
	}

	diagnosticsRequest, err := http.NewRequest(http.MethodGet, "/api/adapters/diagnostics", nil)
	if err != nil {
		t.Fatalf("NewRequest(diagnostics) returned error: %v", err)
	}
	diagnosticsResponse, err := app.Test(diagnosticsRequest, fiber.TestConfig{Timeout: 5 * time.Second})
	if err != nil {
		t.Fatalf("app.Test(diagnostics) returned error: %v", err)
	}
	defer diagnosticsResponse.Body.Close()
	if diagnosticsResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(diagnosticsResponse.Body)
		t.Fatalf("diagnostics status = %d, want %d, body = %s", diagnosticsResponse.StatusCode, http.StatusOK, payload)
	}
	var diagnostics map[string]pipeline.AdapterDiagnostics
	if err := json.NewDecoder(diagnosticsResponse.Body).Decode(&diagnostics); err != nil {
		t.Fatalf("decode diagnostics: %v", err)
	}
	if !diagnostics["epub"].Available || !diagnostics["docx"].Available || !diagnostics["html"].Available {
		t.Fatalf("diagnostics = %#v, want adapters available", diagnostics)
	}
}

func TestListVoicesEndpoint(t *testing.T) {
	t.Parallel()

	app := httpapi.NewRouter(newService(t))
	request, err := http.NewRequest(http.MethodGet, "/api/voices", nil)
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

	var voices []pipeline.Voice
	if err := json.NewDecoder(response.Body).Decode(&voices); err != nil {
		t.Fatalf("decode voices: %v", err)
	}
	if len(voices) == 0 || voices[0].Kind != pipeline.VoiceKindNative {
		t.Fatalf("voices = %#v, want native voices", voices)
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

func TestContentIREndpoint(t *testing.T) {
	t.Parallel()

	service, sourcePrepDir, _ := newServiceWithContentIRDirs(t)
	app := httpapi.NewRouter(service)
	source, err := service.CreatePreparedSource(t.Context(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "endpoint.md",
		Text:       "# Endpoint\n\nContent IR response.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}

	preparedDocument := getContentIRDocument(t, app, source.ID, http.StatusOK)
	if preparedDocument.SourceType != "preparedSource" || len(preparedDocument.Nodes) == 0 {
		t.Fatalf("prepared document = %#v, want prepared source nodes", preparedDocument)
	}

	epubPath := writeRouterTestEPUB(t)
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(t.Context(), "default", epubPath, "endpoint.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	bookDocument := getContentIRDocument(t, app, book.ID, http.StatusOK)
	if bookDocument.SourceType != "bookSource" || bookDocument.Nodes[0].Provenance.Locator.HTML == nil {
		t.Fatalf("book document = %#v, want EPUB locator", bookDocument)
	}
	request, err := http.NewRequest(http.MethodGet, "/api/content-ir/"+book.ID+"?schemaVersion=content-ir.v1_1", nil)
	if err != nil {
		t.Fatalf("NewRequest(content-ir v1_1) returned error: %v", err)
	}
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test(content-ir v1_1) returned error: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("content-ir v1_1 status = %d, body = %s", response.StatusCode, payload)
	}
	var upgraded contentir.Document
	if err := json.NewDecoder(response.Body).Decode(&upgraded); err != nil {
		t.Fatalf("decode v1_1 content IR: %v", err)
	}
	if upgraded.SchemaVersion != contentir.SchemaVersionV11 || upgraded.Nodes[0].Provenance.Locator.EPUB == nil {
		t.Fatalf("v1_1 document = %#v, want EPUB payload", upgraded)
	}
	invalidSchemaRequest, err := http.NewRequest(
		http.MethodGet,
		"/api/content-ir/"+book.ID+"?schemaVersion=content-ir.v99",
		nil,
	)
	if err != nil {
		t.Fatalf("NewRequest(content-ir invalid schema) returned error: %v", err)
	}
	invalidSchemaResponse, err := app.Test(invalidSchemaRequest)
	if err != nil {
		t.Fatalf("app.Test(content-ir invalid schema) returned error: %v", err)
	}
	defer invalidSchemaResponse.Body.Close()
	if invalidSchemaResponse.StatusCode != http.StatusBadRequest {
		payload, _ := io.ReadAll(invalidSchemaResponse.Body)
		t.Fatalf(
			"content-ir invalid schema status = %d, want %d, body = %s",
			invalidSchemaResponse.StatusCode,
			http.StatusBadRequest,
			payload,
		)
	}

	planRequest, err := http.NewRequest(http.MethodGet, "/api/content-ir/"+source.ID+"/speech-plan", nil)
	if err != nil {
		t.Fatalf("NewRequest(speech-plan) returned error: %v", err)
	}
	planResponse, err := app.Test(planRequest)
	if err != nil {
		t.Fatalf("app.Test(speech-plan) returned error: %v", err)
	}
	defer planResponse.Body.Close()
	if planResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(planResponse.Body)
		t.Fatalf("speech-plan status = %d, body = %s", planResponse.StatusCode, payload)
	}
	var plan speechplan.Document
	if err := json.NewDecoder(planResponse.Body).Decode(&plan); err != nil {
		t.Fatalf("decode speech plan: %v", err)
	}
	if plan.SchemaVersion != speechplan.SchemaVersion || len(plan.Segments) == 0 {
		t.Fatalf("speech plan = %#v, want segments", plan)
	}

	getContentIRDocument(t, app, "missing", http.StatusNotFound)

	invalidPath := filepath.Join(sourcePrepDir, source.ID, "content-ir.json")
	if err := os.WriteFile(invalidPath, []byte(`{"schemaVersion":"content-ir.v99"}`), 0o644); err != nil {
		t.Fatalf("WriteFile invalid IR returned error: %v", err)
	}
	getContentIRDocument(t, app, source.ID, http.StatusInternalServerError)
}

func TestPreparedSourceMultipartMarkdownParseMode(t *testing.T) {
	t.Parallel()

	service, _, _ := newServiceWithContentIRDirs(t)
	app := httpapi.NewRouter(service)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("markdownParseMode", "legacy"); err != nil {
		t.Fatalf("WriteField returned error: %v", err)
	}
	part, err := writer.CreateFormFile("file", "legacy.md")
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write([]byte("# Legacy\n\nA multipart import.")); err != nil {
		t.Fatalf("Write file returned error: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("Close writer returned error: %v", err)
	}
	request, err := http.NewRequest(http.MethodPost, "/api/projects/default/source-preps", &body)
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
	var source pipeline.PreparedSource
	if err := json.NewDecoder(response.Body).Decode(&source); err != nil {
		t.Fatalf("Decode returned error: %v", err)
	}
	if source.MarkdownParseMode != "legacy" || source.PreprocessorID != "markdown-legacy" {
		t.Fatalf("source parse mode/preprocessor = %q/%q, want legacy markdown-legacy", source.MarkdownParseMode, source.PreprocessorID)
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
