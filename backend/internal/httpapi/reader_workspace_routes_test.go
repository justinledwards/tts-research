package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/httpapi"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
)

func TestReaderWorkspaceSnapshotRoutesRequireCASAndReturnCurrentOnStale(t *testing.T) {
	service := newService(t)
	project, err := service.CreateProject("Workspace")
	if err != nil {
		t.Fatal(err)
	}
	app := httpapi.NewRouter(service)
	url := "/api/projects/" + project.ID + "/reader-workspace"

	getRequest, _ := http.NewRequest(http.MethodGet, url, nil)
	getResponse, err := app.Test(getRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer getResponse.Body.Close()
	etag := getResponse.Header.Get("ETag")
	if getResponse.StatusCode != http.StatusOK || etag == "" || getResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("GET status/headers = %d %#v", getResponse.StatusCode, getResponse.Header)
	}
	var initial pipeline.ReaderWorkspaceSnapshot
	if err := json.NewDecoder(getResponse.Body).Decode(&initial); err != nil {
		t.Fatal(err)
	}

	body, _ := json.Marshal(initial)
	missingRequest, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	missingRequest.Header.Set("Content-Type", "application/json")
	missingResponse, err := app.Test(missingRequest)
	if err != nil {
		t.Fatal(err)
	}
	missingResponse.Body.Close()
	if missingResponse.StatusCode != http.StatusPreconditionRequired {
		t.Fatalf("missing precondition status = %d, want 428", missingResponse.StatusCode)
	}

	putRequest, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	putRequest.Header.Set("Content-Type", "application/json")
	putRequest.Header.Set("If-Match", etag)
	putResponse, err := app.Test(putRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer putResponse.Body.Close()
	updatedETag := putResponse.Header.Get("ETag")
	if putResponse.StatusCode != http.StatusOK || updatedETag == "" || updatedETag == etag {
		payload, _ := io.ReadAll(putResponse.Body)
		t.Fatalf("PUT status/etag = %d %q, body=%s", putResponse.StatusCode, updatedETag, payload)
	}

	staleRequest, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(body))
	staleRequest.Header.Set("Content-Type", "application/json")
	staleRequest.Header.Set("If-Match", etag)
	staleResponse, err := app.Test(staleRequest)
	if err != nil {
		t.Fatal(err)
	}
	defer staleResponse.Body.Close()
	var conflict struct {
		Current    pipeline.ReaderWorkspaceSnapshot `json:"current"`
		RetryToken string                           `json:"retryToken"`
	}
	if err := json.NewDecoder(staleResponse.Body).Decode(&conflict); err != nil {
		t.Fatal(err)
	}
	if staleResponse.StatusCode != http.StatusPreconditionFailed || conflict.Current.ProjectRevision != 1 || conflict.RetryToken != updatedETag || staleResponse.Header.Get("ETag") != updatedETag {
		t.Fatalf("stale response status/header/body = %d %q %#v", staleResponse.StatusCode, staleResponse.Header.Get("ETag"), conflict)
	}
}

func TestReaderWorkspacePUTRejectsInvalidPlaybackAndJSONWithoutMutation(t *testing.T) {
	projectDataDir := t.TempDir()
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:             3,
			JobDataDir:             t.TempDir(),
			ProjectDataDir:         projectDataDir,
			BookSourceDir:          t.TempDir(),
			SourcePrepDir:          t.TempDir(),
			ProgressDataDir:        t.TempDir(),
			PlaybackSessionDir:     t.TempDir(),
			TemporarySourceDataDir: t.TempDir(),
			TemporaryArtifactDir:   t.TempDir(),
			TemporaryAudioDir:      t.TempDir(),
			TemporaryProgressDir:   t.TempDir(),
		},
	)
	project, err := service.CreateProject("Strict workspace")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.CreatePreparedSource(context.Background(), project.ID, pipeline.CreatePreparedSourceRequest{Text: "Readable source"}); err != nil {
		t.Fatal(err)
	}
	app := httpapi.NewRouter(service)
	url := "/api/projects/" + project.ID + "/reader-workspace"

	getRequest, _ := http.NewRequest(http.MethodGet, url, nil)
	getResponse, err := app.Test(getRequest)
	if err != nil {
		t.Fatal(err)
	}
	var initial pipeline.ReaderWorkspaceSnapshot
	if err := json.NewDecoder(getResponse.Body).Decode(&initial); err != nil {
		t.Fatal(err)
	}
	initialETag := getResponse.Header.Get("ETag")
	getResponse.Body.Close()
	initialBody, err := json.Marshal(initial)
	if err != nil {
		t.Fatal(err)
	}
	putRequest, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(initialBody))
	putRequest.Header.Set("Content-Type", "application/json")
	putRequest.Header.Set("If-Match", initialETag)
	putResponse, err := app.Test(putRequest)
	if err != nil {
		t.Fatal(err)
	}
	var saved pipeline.ReaderWorkspaceSnapshot
	if err := json.NewDecoder(putResponse.Body).Decode(&saved); err != nil {
		t.Fatal(err)
	}
	savedETag := putResponse.Header.Get("ETag")
	putResponse.Body.Close()
	if putResponse.StatusCode != http.StatusOK || savedETag == "" {
		t.Fatalf("setup PUT status/etag = %d/%q", putResponse.StatusCode, savedETag)
	}
	savedBody, err := json.Marshal(saved)
	if err != nil {
		t.Fatal(err)
	}
	workspacePath := filepath.Join(projectDataDir, project.ID, "reader-workspace.json")
	savedFile, err := os.ReadFile(workspacePath)
	if err != nil {
		t.Fatal(err)
	}

	jsonWithField := func(field string, value any) []byte {
		t.Helper()
		var object map[string]any
		if err := json.Unmarshal(savedBody, &object); err != nil {
			t.Fatal(err)
		}
		object[field] = value
		body, err := json.Marshal(object)
		if err != nil {
			t.Fatal(err)
		}
		return body
	}
	tests := []struct {
		name string
		body []byte
	}{
		{name: "negative cursor", body: jsonWithField("playbackCursorMs", int64(-1))},
		{name: "cursor above JSON integer maximum", body: jsonWithField("playbackCursorMs", int64(1<<53))},
		{name: "negative rate", body: jsonWithField("playbackRate", -1.0)},
		{name: "zero rate", body: jsonWithField("playbackRate", 0.0)},
		{name: "rate above maximum", body: jsonWithField("playbackRate", 4.000000000000001)},
		{name: "non-finite decoded rate", body: bytes.Replace(savedBody, []byte(`"playbackRate":1`), []byte(`"playbackRate":1e400`), 1)},
		{name: "unknown field", body: jsonWithField("unexpected", true)},
		{name: "trailing JSON", body: append(append([]byte(nil), savedBody...), []byte(` {}`)...)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, _ := http.NewRequest(http.MethodPut, url, bytes.NewReader(test.body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("If-Match", savedETag)
			response, err := app.Test(request)
			if err != nil {
				t.Fatal(err)
			}
			responseBody, _ := io.ReadAll(response.Body)
			response.Body.Close()
			if response.StatusCode != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400; body=%s", response.StatusCode, responseBody)
			}

			currentRequest, _ := http.NewRequest(http.MethodGet, url, nil)
			currentResponse, err := app.Test(currentRequest)
			if err != nil {
				t.Fatal(err)
			}
			var current pipeline.ReaderWorkspaceSnapshot
			if err := json.NewDecoder(currentResponse.Body).Decode(&current); err != nil {
				t.Fatal(err)
			}
			currentResponse.Body.Close()
			currentBody, err := json.Marshal(current)
			if err != nil {
				t.Fatal(err)
			}
			if currentResponse.Header.Get("ETag") != savedETag || !bytes.Equal(currentBody, savedBody) {
				t.Fatalf("rejected PUT changed current state: etag %q -> %q, snapshot %s -> %s", savedETag, currentResponse.Header.Get("ETag"), savedBody, currentBody)
			}
			currentFile, err := os.ReadFile(workspacePath)
			if err != nil {
				t.Fatal(err)
			}
			if !bytes.Equal(currentFile, savedFile) {
				t.Fatalf("rejected PUT changed durable bytes:\nwant %s\ngot  %s", savedFile, currentFile)
			}
		})
	}
}

func TestReaderWorkspaceCORSAllowsRevisionHeadersAndExposesETag(t *testing.T) {
	app := httpapi.NewRouter(newService(t))
	request, _ := http.NewRequest(http.MethodOptions, "/api/projects/default/reader-workspace", nil)
	request.Header.Set("Origin", "http://localhost:5173")
	request.Header.Set("Access-Control-Request-Method", "PUT")
	request.Header.Set("Access-Control-Request-Headers", "if-match,if-none-match,content-type")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d", response.StatusCode)
	}
	allowed := response.Header.Get("Access-Control-Allow-Headers")
	exposed := response.Header.Get("Access-Control-Expose-Headers")
	if allowed == "" || exposed != "ETag" {
		t.Fatalf("CORS allow/expose = %q / %q", allowed, exposed)
	}
}
