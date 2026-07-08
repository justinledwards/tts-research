package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	httpapi "github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

type temporarySourceErrorPayload struct {
	Code            pipeline.TemporarySourceFailureCode `json:"code"`
	Error           string                              `json:"error"`
	TemporarySource bool                                `json:"temporarySource"`
}

func TestTemporarySourceRoutesCreateGenerateArtifactsAndPromote(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	preparedBefore, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(before) returned error: %v", err)
	}
	booksBefore, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(before) returned error: %v", err)
	}

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
	var envelope pipeline.TemporarySourceEnvelope
	if err := json.NewDecoder(createResponse.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode temporary source: %v", err)
	}
	if envelope.SourceOwner != pipeline.SourceOwnerTemporary ||
		envelope.Scope != pipeline.SourceArtifactScopeTemporary ||
		envelope.TemporarySourceID == "" {
		t.Fatalf("envelope = %#v, want temporary source envelope", envelope)
	}
	temporary := envelope.Source
	if temporary.ProjectID != "" {
		t.Fatalf("temporary project id = %q, want empty", temporary.ProjectID)
	}
	if temporary.SourceOwner != pipeline.SourceOwnerTemporary ||
		temporary.Scope != pipeline.SourceArtifactScopeTemporary ||
		temporary.TemporarySourceID != temporary.ID {
		t.Fatalf("temporary = %#v, want source owner and temporary id metadata", temporary)
	}
	preparedAfter, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(after) returned error: %v", err)
	}
	booksAfter, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(after) returned error: %v", err)
	}
	if len(preparedAfter) != len(preparedBefore) || len(booksAfter) != len(booksBefore) {
		t.Fatalf("temporary creation mutated project sources: prepared %d->%d books %d->%d", len(preparedBefore), len(preparedAfter), len(booksBefore), len(booksAfter))
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
	if promoted.ProjectID != "default" || promoted.TemporarySourceID != "" {
		t.Fatalf("promoted = %#v, want default project copy without temporary id field", promoted)
	}
	promotion, ok := promoted.Metadata["promotion"].(map[string]any)
	if !ok || promotion["temporarySourceId"] != temporary.ID {
		t.Fatalf("promotion metadata = %#v, want safe temporary provenance", promoted.Metadata["promotion"])
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
	var envelope pipeline.TemporarySourceEnvelope
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode temporary source: %v", err)
	}
	temporary := envelope.Source
	if temporary.Kind != string(pipeline.PreparedSourceKindFile) || temporary.SourceName != "upload.md" {
		t.Fatalf("temporary = %#v, want file-backed upload", temporary)
	}
	if temporary.SourceReadiness == nil ||
		temporary.SourceReadiness.Confidence != "high" ||
		temporary.SourceReadiness.State != pipeline.SourceReadinessStateNeedsMetadata {
		t.Fatalf("readiness = %#v, want high-confidence supported file needing metadata", temporary.SourceReadiness)
	}
	supportedFile, ok := temporary.Metadata["supportedFile"].(map[string]any)
	if !ok || supportedFile["extractionConfidence"] != "high" || supportedFile["filename"] != "upload.md" {
		t.Fatalf("supported file metadata = %#v, want extraction confidence and filename", temporary.Metadata["supportedFile"])
	}
}

func TestTemporarySourceRouteQuickListenURLCapturesAndNarratesWithoutProject(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = response.Write([]byte(`<!doctype html>
<html lang="en">
<head><title>Quick Listen URL Fixture</title></head>
<body>
  <article>
    <h1>Quick Listen URL Fixture</h1>
    <p>This pasted URL becomes temporary source work without a durable project source.</p>
    <p>The second paragraph is narratable so the temporary audio job can be anchored.</p>
  </article>
</body>
</html>`))
	}))
	defer server.Close()

	service := newTemporaryURLRouteService(t)
	app := httpapi.NewRouter(service)
	preparedBefore, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(before) returned error: %v", err)
	}
	booksBefore, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(before) returned error: %v", err)
	}

	createRequest, err := http.NewRequest(
		http.MethodPost,
		"/api/temporary-sources",
		bytes.NewBufferString(`{"kind":"url","url":"`+server.URL+`/article","sourceName":"`+server.URL+`/article"}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(create URL) returned error: %v", err)
	}
	createRequest.Header.Set("Content-Type", "application/json")
	createResponse, err := app.Test(createRequest)
	if err != nil {
		t.Fatalf("app.Test(create URL) returned error: %v", err)
	}
	defer createResponse.Body.Close()
	createBody, err := io.ReadAll(createResponse.Body)
	if err != nil {
		t.Fatalf("read create URL body: %v", err)
	}
	if createResponse.StatusCode != http.StatusCreated {
		t.Fatalf("create URL status = %d, want %d, body = %s", createResponse.StatusCode, http.StatusCreated, createBody)
	}
	if strings.Contains(string(createBody), "\"projectId\"") || strings.Contains(string(createBody), "\"promotedProjectId\"") || strings.Contains(string(createBody), "\"promotedSourceId\"") {
		t.Fatalf("create URL body = %s, want no durable project or promoted-source fields", createBody)
	}
	var envelope pipeline.TemporarySourceEnvelope
	if err := json.Unmarshal(createBody, &envelope); err != nil {
		t.Fatalf("decode temporary URL source: %v", err)
	}
	temporary := envelope.Source
	if envelope.ProjectID != "" || temporary.ProjectID != "" || temporary.SourceOwner != pipeline.SourceOwnerTemporary || temporary.Scope != pipeline.SourceArtifactScopeTemporary {
		t.Fatalf("temporary URL envelope/source = %#v/%#v, want temporary boundary without project", envelope, temporary)
	}
	if temporary.Kind != string(pipeline.PreparedSourceKindURL) || temporary.TemporarySourceID != temporary.ID || temporary.SourceURL == "" {
		t.Fatalf("temporary URL source = %#v, want URL temporary source identity", temporary)
	}
	if strings.Contains(temporary.Text, "<article") || !strings.Contains(temporary.Text, "temporary source work") {
		t.Fatalf("temporary URL text = %q, want readable extracted text", temporary.Text)
	}

	snapshot, err := service.GetSourceManifestSnapshot(temporary.ID, "")
	if err != nil {
		t.Fatalf("GetSourceManifestSnapshot(temporary URL) returned error: %v", err)
	}
	if snapshot.SourceEnvelope == nil || snapshot.SourceRevision == nil {
		t.Fatalf("snapshot = %#v, want source envelope and revision", snapshot)
	}
	if snapshot.SourceEnvelope.SourceKind != pipeline.SourceEnvelopeKindQuickListenTemporary ||
		snapshot.SourceEnvelope.Lifecycle != pipeline.SourceEnvelopeLifecycleTemporary ||
		snapshot.SourceEnvelope.ProjectID != "" ||
		snapshot.SourceEnvelope.ExpiresAt == nil ||
		snapshot.SourceEnvelope.Origin.Method != pipeline.SourceOriginMethodURL {
		t.Fatalf("source envelope = %#v, want temporary URL lifecycle without project", snapshot.SourceEnvelope)
	}

	jobRequest, err := http.NewRequest(
		http.MethodPost,
		"/api/temporary-sources/"+temporary.ID+"/voice-jobs",
		bytes.NewBufferString(`{}`),
	)
	if err != nil {
		t.Fatalf("NewRequest(temporary URL job) returned error: %v", err)
	}
	jobRequest.Header.Set("Content-Type", "application/json")
	jobResponse, err := app.Test(jobRequest)
	if err != nil {
		t.Fatalf("app.Test(temporary URL job) returned error: %v", err)
	}
	defer jobResponse.Body.Close()
	if jobResponse.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(jobResponse.Body)
		t.Fatalf("temporary URL job status = %d, want %d, body = %s", jobResponse.StatusCode, http.StatusCreated, payload)
	}
	var job pipeline.VoiceJob
	if err := json.NewDecoder(jobResponse.Body).Decode(&job); err != nil {
		t.Fatalf("decode temporary URL job: %v", err)
	}
	if job.ProjectID != "" || job.TemporarySourceID != temporary.ID || job.PreparedSourceID != "" || job.ProgressTargetID != "temporary-source:"+temporary.ID {
		t.Fatalf("temporary URL job = %#v, want temporary narration anchor without project", job)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)

	preparedAfter, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(after) returned error: %v", err)
	}
	booksAfter, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(after) returned error: %v", err)
	}
	if len(preparedAfter) != len(preparedBefore) || len(booksAfter) != len(booksBefore) {
		t.Fatalf("temporary URL quick listen mutated project sources: prepared %d->%d books %d->%d", len(preparedBefore), len(preparedAfter), len(booksBefore), len(booksAfter))
	}
}

func TestTemporarySourceRouteClearDeletesTemporarySourcesOnly(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	preparedBefore, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(before) returned error: %v", err)
	}
	booksBefore, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(before) returned error: %v", err)
	}
	source, err := service.CreateTemporarySource(context.Background(), pipeline.CreateTemporarySourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		Text:       "Temporary source that should not become project history.",
		SourceName: "clear-me.md",
	})
	if err != nil {
		t.Fatalf("CreateTemporarySource returned error: %v", err)
	}

	request, err := http.NewRequest(http.MethodPost, "/api/temporary-sources/clear", nil)
	if err != nil {
		t.Fatalf("NewRequest(clear) returned error: %v", err)
	}
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("app.Test(clear) returned error: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("clear status = %d, want %d, body = %s", response.StatusCode, http.StatusOK, payload)
	}
	var result pipeline.TemporarySourceCleanupResult
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatalf("decode clear result: %v", err)
	}
	if result.Status != pipeline.TemporarySourceStateDiscarded ||
		result.Action != pipeline.TemporarySourceCleanupDiscardNow {
		t.Fatalf("clear result = %#v, want discarded cleanup result", result)
	}
	if _, err := service.GetTemporarySource(source.ID); err == nil {
		t.Fatalf("GetTemporarySource(%q) succeeded after clear", source.ID)
	}
	preparedAfter, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(after) returned error: %v", err)
	}
	booksAfter, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(after) returned error: %v", err)
	}
	if len(preparedAfter) != len(preparedBefore) || len(booksAfter) != len(booksBefore) {
		t.Fatalf("clear temporary sources mutated project sources: prepared %d->%d books %d->%d", len(preparedBefore), len(preparedAfter), len(booksBefore), len(booksAfter))
	}
}

func TestTemporarySourceRouteRejectsUnsupportedMultipartFileWithoutProjectArtifacts(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	preparedBefore, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(before) returned error: %v", err)
	}
	booksBefore, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(before) returned error: %v", err)
	}

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "upload.pdf")
	if err != nil {
		t.Fatalf("CreateFormFile returned error: %v", err)
	}
	if _, err := part.Write([]byte("%PDF unsupported temporary source")); err != nil {
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
	if response.StatusCode != http.StatusBadRequest {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("status = %d, want %d, body = %s", response.StatusCode, http.StatusBadRequest, payload)
	}
	payload, _ := io.ReadAll(response.Body)
	var errorPayload temporarySourceErrorPayload
	if err := json.Unmarshal(payload, &errorPayload); err != nil {
		t.Fatalf("decode error payload %s: %v", payload, err)
	}
	if errorPayload.Code != pipeline.TemporarySourceFailureUnsupportedFile ||
		errorPayload.Error != "Temporary source failed. Choose a supported file and try Quick Listen again." ||
		!errorPayload.TemporarySource {
		t.Fatalf("payload = %#v, want typed unsupported file error", errorPayload)
	}

	preparedAfter, err := service.ListProjectPreparedSources("default")
	if err != nil {
		t.Fatalf("ListProjectPreparedSources(after) returned error: %v", err)
	}
	booksAfter, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources(after) returned error: %v", err)
	}
	if len(preparedAfter) != len(preparedBefore) || len(booksAfter) != len(booksBefore) {
		t.Fatalf("unsupported temporary file mutated project sources: prepared %d->%d books %d->%d", len(preparedBefore), len(preparedAfter), len(booksBefore), len(booksAfter))
	}
	if summary := service.TemporaryStorageUsageSummary(time.Now().UTC()); summary.TemporaryCount != 0 {
		t.Fatalf("temporary storage summary = %#v, want no temporary artifacts", summary)
	}
}

func TestTemporarySourceRouteReturnsTypedTemporaryFailureCopy(t *testing.T) {
	service := newService(t)
	app := httpapi.NewRouter(service)

	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		statusCode int
		code       pipeline.TemporarySourceFailureCode
		message    string
	}{
		{
			name:       "metadata required",
			method:     http.MethodPost,
			path:       "/api/temporary-sources",
			body:       `{bad json`,
			statusCode: http.StatusBadRequest,
			code:       pipeline.TemporarySourceFailureMetadataRequired,
			message:    "This temporary source is not ready for review or audio.",
		},
		{
			name:       "expired missing temporary source",
			method:     http.MethodPost,
			path:       "/api/temporary-sources/missing-temp/reopen",
			statusCode: http.StatusNotFound,
			code:       pipeline.TemporarySourceFailureExpired,
			message:    "Temporary source expired after inactivity. Extend expiry before reopening it.",
		},
		{
			name:       "promotion failure leaves project unchanged",
			method:     http.MethodPost,
			path:       "/api/temporary-sources/missing-temp/promote",
			body:       `{"projectId":"missing-project"}`,
			statusCode: http.StatusNotFound,
			code:       pipeline.TemporarySourceFailurePromotionFailed,
			message:    "Unable to keep temporary source in the project. No project history was changed.",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, err := http.NewRequest(test.method, test.path, bytes.NewBufferString(test.body))
			if err != nil {
				t.Fatalf("NewRequest returned error: %v", err)
			}
			request.Header.Set("Content-Type", "application/json")
			response, err := app.Test(request)
			if err != nil {
				t.Fatalf("app.Test returned error: %v", err)
			}
			defer response.Body.Close()
			if response.StatusCode != test.statusCode {
				payload, _ := io.ReadAll(response.Body)
				t.Fatalf("status = %d, want %d, body = %s", response.StatusCode, test.statusCode, payload)
			}
			var payload temporarySourceErrorPayload
			if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Code != test.code || payload.Error != test.message || !payload.TemporarySource {
				t.Fatalf("payload = %#v, want code %q and message %q", payload, test.code, test.message)
			}
		})
	}
}

func TestTemporarySourceRoutesFailClosedWhenFeatureDisabled(t *testing.T) {
	disabled := false
	service := newServiceWithTemporarySourcesEnabled(t, &disabled)
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
	if createResponse.StatusCode != http.StatusNotFound {
		payload, _ := io.ReadAll(createResponse.Body)
		t.Fatalf("temporary create status = %d, want %d, body = %s", createResponse.StatusCode, http.StatusNotFound, payload)
	}

	projectRequest, err := http.NewRequest(http.MethodGet, "/api/projects", nil)
	if err != nil {
		t.Fatalf("NewRequest(projects) returned error: %v", err)
	}
	projectResponse, err := app.Test(projectRequest)
	if err != nil {
		t.Fatalf("app.Test(projects) returned error: %v", err)
	}
	defer projectResponse.Body.Close()
	if projectResponse.StatusCode != http.StatusOK {
		payload, _ := io.ReadAll(projectResponse.Body)
		t.Fatalf("project route status = %d, want %d, body = %s", projectResponse.StatusCode, http.StatusOK, payload)
	}
}

func newTemporaryURLRouteService(t *testing.T) *pipeline.Service {
	t.Helper()
	enabled := true
	baseDir := t.TempDir()
	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:              3,
			JobDataDir:              filepath.Join(baseDir, "jobs"),
			ProjectDataDir:          filepath.Join(baseDir, "projects"),
			BookSourceDir:           filepath.Join(baseDir, "book-sources"),
			SourcePrepDir:           filepath.Join(baseDir, "source-preps"),
			SourceLifecycleDataDir:  filepath.Join(baseDir, "source-lifecycle"),
			ProgressDataDir:         filepath.Join(baseDir, "progress"),
			PlaybackSessionDir:      filepath.Join(baseDir, "playback-sessions"),
			TemporarySourceDataDir:  filepath.Join(baseDir, "temporary-sources"),
			TemporaryArtifactDir:    filepath.Join(baseDir, "temporary-artifacts"),
			TemporaryAudioDir:       filepath.Join(baseDir, "temporary-audio"),
			TemporaryProgressDir:    filepath.Join(baseDir, "temporary-progress"),
			TemporarySourcesEnabled: &enabled,
			SourceURLAllowPrivate:   true,
		},
	)
}
