package pipeline_test

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/justinedwards/tts-research/backend/internal/agents"
	"github.com/justinedwards/tts-research/backend/internal/audio"
	"github.com/justinedwards/tts-research/backend/internal/contentir"
	"github.com/justinedwards/tts-research/backend/internal/pipeline"
	"github.com/justinedwards/tts-research/backend/internal/policy"
)

func TestCreateJobCompletesWithMockAgents(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "CPU usage is 90% + memory = 4GB"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	if job.Status != pipeline.JobStatusQueued {
		t.Fatalf("initial status = %q, want %q", job.Status, pipeline.JobStatusQueued)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.OptimizedText == "" {
		t.Fatal("optimized text should not be empty")
	}

	audio, contentType, err := service.GetAudio(job.ID)
	if err != nil {
		t.Fatalf("GetAudio returned error: %v", err)
	}

	if contentType != "audio/wav" {
		t.Fatalf("content type = %q, want audio/wav", contentType)
	}

	if len(audio) <= 44 {
		t.Fatalf("audio length = %d, want WAV data", len(audio))
	}

	if completed.AudioPath == "" {
		t.Fatal("completed job should include saved audio path")
	}
	if _, err := os.Stat(completed.AudioPath); err != nil {
		t.Fatalf("saved audio should exist: %v", err)
	}
	metadataPath := filepath.Join(filepath.Dir(completed.AudioPath), "metadata.json")
	if _, err := os.Stat(metadataPath); err != nil {
		t.Fatalf("saved metadata should exist: %v", err)
	}
	plan, err := service.GetJobSpeechPlan(job.ID)
	if err != nil {
		t.Fatalf("GetJobSpeechPlan returned error: %v", err)
	}
	if plan.SchemaVersion != "speech-plan.v1" || plan.JobID != job.ID || len(plan.Segments) == 0 {
		t.Fatalf("job speech plan = %#v, want persisted speech-plan segments", plan)
	}
}

func TestRenderSpeechTextAppliesLexiconAndNormalisation(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	if _, err := service.UpsertProjectLexiconEntry("default", pipeline.LexiconUpsertRequest{
		Term:        "Nguyen",
		Replacement: "Win",
		Protected:   true,
	}); err != nil {
		t.Fatalf("UpsertProjectLexiconEntry returned error: %v", err)
	}

	rendered := service.RenderSpeechText("CPU Nguyen paid £12.50 on 2026-05-17.", pipeline.SpeechRenderOptions{
		ProjectID: "default",
		Locale:    "en-GB",
	})

	for _, expected := range []string{
		"C P U Win",
		"twelve pounds fifty pence",
		"seventeenth May twenty twenty six",
	} {
		if !strings.Contains(rendered.PlainText, expected) {
			t.Fatalf("plain text = %q, want %q", rendered.PlainText, expected)
		}
	}
	if len(rendered.Pronunciations) != 1 || !rendered.Pronunciations[0].Protected {
		t.Fatalf("pronunciations = %#v, want protected lexicon decision", rendered.Pronunciations)
	}
	if rendered.SSML == "" || !strings.Contains(rendered.SSML, "<speak") {
		t.Fatalf("ssml = %q, want SSML output", rendered.SSML)
	}
}

func TestRenderSpeechTextDetectsStandaloneMathFallback(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	rendered := service.RenderSpeechText("$$\n\\frac{x+1}{y} + \\sqrt{y}\n$$", pipeline.SpeechRenderOptions{
		Kind: pipeline.NarrationBlockKindBody,
	})

	if rendered.MathPreview == nil {
		t.Fatalf("MathPreview was nil for standalone display math")
	}
	if !strings.Contains(rendered.PlainText, "fraction") || !strings.Contains(rendered.PlainText, "square root") {
		t.Fatalf("plain text = %q, want semantic math speech", rendered.PlainText)
	}
}

func TestCreateJobRoutesPlainAndSSMLEnginePaths(t *testing.T) {
	ssmlAgent := &recordingTTSAgent{}
	ssmlService := newRecordingTTSService(t, "ssml-engine", ssmlAgent, true)
	ssmlJob, err := ssmlService.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:        "Alice & Bob",
		TTSEngine:   "ssml-engine",
		TTSLanguage: "en",
	})
	if err != nil {
		t.Fatalf("CreateJob ssml returned error: %v", err)
	}
	waitForJob(t, ssmlService, ssmlJob.ID, pipeline.JobStatusCompleted)
	if len(ssmlAgent.ssmlCalls()) == 0 {
		t.Fatalf("expected SSML engine path, plain calls = %#v", ssmlAgent.plainCalls())
	}
	if !strings.Contains(ssmlAgent.ssmlCalls()[0], "<speak") ||
		!strings.Contains(ssmlAgent.ssmlCalls()[0], "Alice and Bob") {
		t.Fatalf("ssml calls = %#v, want rendered SSML", ssmlAgent.ssmlCalls())
	}

	plainAgent := &recordingTTSAgent{}
	plainService := newRecordingTTSService(t, "plain-engine", plainAgent, false)
	plainJob, err := plainService.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:        "Alice & Bob",
		TTSEngine:   "plain-engine",
		TTSLanguage: "en",
	})
	if err != nil {
		t.Fatalf("CreateJob plain returned error: %v", err)
	}
	waitForJob(t, plainService, plainJob.ID, pipeline.JobStatusCompleted)
	if len(plainAgent.ssmlCalls()) != 0 {
		t.Fatalf("plain engine should not receive SSML: %#v", plainAgent.ssmlCalls())
	}
	if len(plainAgent.plainCalls()) == 0 || !strings.Contains(plainAgent.plainCalls()[0], "Alice and Bob") {
		t.Fatalf("plain calls = %#v, want rendered plain text", plainAgent.plainCalls())
	}
}

func TestPreparedSourceSkipsResearchCitationsAndKeepsHeadings(t *testing.T) {
	t.Parallel()

	service := newBookSourceServiceWithOptions(t, pipeline.Options{StudioSegmentMaxRunes: 80})
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "deep-research-report.md",
		Text: strings.Join([]string{
			"# Corporate Moats in the Age of AI-Native Businesses",
			"",
			"## Executive summary",
			"",
			"The corporate moat remains useful. citeturn40search10turn37view0",
			"",
			"citeturn5search0turn5search2",
			"",
			"| Moat type | Working definition |",
			"|---|---|",
			"| Network effects | More users create more value. |",
			"",
			"```mermaid",
			"flowchart LR",
			"```",
		}, "\n"),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if source.Summary.HeadingCount != 2 {
		t.Fatalf("heading count = %d, want 2", source.Summary.HeadingCount)
	}
	if source.Summary.CitationSkipCount == 0 {
		t.Fatal("expected inline and citation-only citations to be skipped")
	}
	if source.Summary.CitationSkipCount < 2 {
		t.Fatalf("citation skip count = %d, want inline plus citation-only skips", source.Summary.CitationSkipCount)
	}
	if strings.Contains(source.SpeechText, "turn40search10") || strings.Contains(source.SpeechText, "cite") {
		t.Fatalf("speech text still contains citation markup: %q", source.SpeechText)
	}
	if !strings.Contains(source.SpeechText, "Corporate Moats") || !strings.Contains(source.SpeechText, "Executive summary") {
		t.Fatalf("speech text lost headings: %q", source.SpeechText)
	}
	if !strings.Contains(source.SpeechText, "The corporate moat remains useful.") {
		t.Fatalf("speech text lost body paragraph with inline citation: %q", source.SpeechText)
	}
	bodyBlock := findPreparedBlockContaining(source.Blocks, "The corporate moat remains useful.")
	if bodyBlock == nil {
		t.Fatalf("body block with inline citation was not preserved: %#v", source.Blocks)
	}
	if bodyBlock.SpeakMode != pipeline.NarrationSpeakModeSpeak || bodyBlock.SpeechPolicy.Element != "prose" {
		t.Fatalf("body block policy = %#v, want spoken prose", bodyBlock.SpeechPolicy)
	}
	if source.PreprocessorID != "markdown-ast" ||
		source.PreprocessorVersion != "markdown-adapter-v2" ||
		source.RenderMode != "markdown" ||
		source.SourceFormat != "markdown" ||
		source.MarkdownParseMode != "strict" {
		t.Fatalf(
			"source preprocessor metadata = %q/%q/%q/%q/%q",
			source.PreprocessorID,
			source.PreprocessorVersion,
			source.RenderMode,
			source.SourceFormat,
			source.MarkdownParseMode,
		)
	}
	if source.Blocks[0].Emphasis != "heading" || source.Blocks[0].PauseAfterMS == 0 {
		t.Fatalf("heading block should carry emphasis/pause metadata: %#v", source.Blocks[0])
	}
	if source.Summary.SentenceSegmentCount < 3 {
		t.Fatalf("sentence segment count = %d, want at least 3", source.Summary.SentenceSegmentCount)
	}
}

func TestPreparedSourceMarkdownStrictDefaultPreservesMetadataAndEmbeddedNodes(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "adapter.md",
		Text: strings.Join([]string{
			"---",
			"title: Adapter Demo",
			"---",
			"",
			"# Adapter Demo",
			"",
			"Interactive widget: <Widget mode=\"demo\" />.",
			"",
			"```{warning}",
			"Keep this callout audible.",
			"```",
		}, "\n"),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if source.MarkdownParseMode != "strict" || source.PreprocessorID != "markdown-ast" {
		t.Fatalf("markdown mode/preprocessor = %q/%q, want strict markdown-ast", source.MarkdownParseMode, source.PreprocessorID)
	}
	if source.Metadata == nil || source.Metadata["frontmatter"] == nil {
		t.Fatalf("source metadata = %#v, want frontmatter metadata", source.Metadata)
	}
	if findPreparedBlockByKind(source.Blocks, pipeline.NarrationBlockKindFrontmatter) == nil {
		t.Fatalf("blocks = %#v, want frontmatter block", source.Blocks)
	}
	if findPreparedBlockByKind(source.Blocks, pipeline.NarrationBlockKindEmbedded) == nil {
		t.Fatalf("blocks = %#v, want explicit embedded block", source.Blocks)
	}
	admonition := findPreparedBlockByKind(source.Blocks, pipeline.NarrationBlockKindAdmonition)
	if admonition == nil || !strings.Contains(admonition.SpokenText, "Keep this callout audible.") {
		t.Fatalf("admonition = %#v, want spoken MyST callout", admonition)
	}
	if strings.Contains(source.SpeechText, "title: Adapter Demo") || strings.Contains(source.SpeechText, "<Widget") {
		t.Fatalf("speech text leaked metadata or embedded markup: %q", source.SpeechText)
	}
}

func TestPreparedSourceMarkdownLegacyMode(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:              pipeline.PreparedSourceKindFile,
		MarkdownParseMode: "legacy",
		SourceName:        "legacy.md",
		Text:              "# Legacy\n\nA compatibility paragraph.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if source.MarkdownParseMode != "legacy" || source.PreprocessorID != "markdown-legacy" {
		t.Fatalf("markdown mode/preprocessor = %q/%q, want legacy markdown-legacy", source.MarkdownParseMode, source.PreprocessorID)
	}
	if !strings.Contains(source.SpeechText, "A compatibility paragraph.") {
		t.Fatalf("speech text = %q, want legacy paragraph", source.SpeechText)
	}
}

func TestEnterpriseProfileSpeaksDemoBodyParagraphsWithInlineCitations(t *testing.T) {
	t.Parallel()

	markdown, err := os.ReadFile(filepath.Join("..", "..", "..", "demo", "deep-research-report.md"))
	if err != nil {
		t.Fatalf("ReadFile demo/deep-research-report.md returned error: %v", err)
	}
	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "deep-research-report.md",
		Text:       string(markdown),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}

	bodyWithCitationWarnings := 0
	for _, block := range source.Blocks {
		if block.Kind != "body" || !containsString(block.Warnings, "citation_removed") {
			continue
		}
		bodyWithCitationWarnings++
		if block.SpeakMode == pipeline.NarrationSpeakModeSkip {
			t.Fatalf("body block %s was skipped by Enterprise after citation removal: policy=%#v text=%q", block.ID, block.SpeechPolicy, block.Text)
		}
		if block.SpeechPolicy.Element != "prose" || strings.Contains(block.SpeechPolicy.Explanation, "footnote") {
			t.Fatalf("body block %s policy = %#v, want prose explanation", block.ID, block.SpeechPolicy)
		}
	}
	if bodyWithCitationWarnings == 0 {
		t.Fatal("expected demo markdown to contain body blocks with removed inline citations")
	}
	if source.Summary.SpokenBlockCount <= source.Summary.SkippedBlockCount {
		t.Fatalf("summary = %#v, want Enterprise to speak prose body blocks", source.Summary)
	}
}

func TestPreparedSourcePolicyPreviewAndOverrides(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "policy.md",
		Text: strings.Join([]string{
			"# Policy",
			"",
			"| Metric | Value |",
			"|---|---|",
			"| Latency | 12ms |",
			"",
			"```go",
			"fmt.Println(\"hello\")",
			"```",
			"",
			"$$x^2 + y = 4$$",
			"",
			"[^1]: Supporting note.",
			"",
			"![Architecture diagram](diagram.png)",
			"",
			"Figure: request flow overview",
		}, "\n"),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if source.SpeechPolicyProfile != "Enterprise" {
		t.Fatalf("source profile = %q, want Enterprise", source.SpeechPolicyProfile)
	}
	if strings.Contains(source.SpeechText, "fmt.Println") || strings.Contains(source.SpeechText, "Supporting note") {
		t.Fatalf("enterprise speech should skip code and notes: %q", source.SpeechText)
	}

	accessibility, err := service.PreviewPreparedSourceSpeechPolicy(source.ID, pipeline.SpeechPolicyPreviewRequest{Profile: "Accessibility"})
	if err != nil {
		t.Fatalf("PreviewPreparedSourceSpeechPolicy returned error: %v", err)
	}
	if !strings.Contains(accessibility.SpeechText, "fmt.Println") || !strings.Contains(accessibility.SpeechText, "Metric: Latency") {
		t.Fatalf("accessibility preview did not include row-linear table and code: %q", accessibility.SpeechText)
	}
	if accessibility.Blocks[2].SpeechPolicy.Explanation == "" {
		t.Fatalf("expected explanation on code block: %#v", accessibility.Blocks[2].SpeechPolicy)
	}

	override, err := service.PreviewPreparedSourceSpeechPolicy(source.ID, pipeline.SpeechPolicyPreviewRequest{
		Profile:   "Enterprise",
		Overrides: policy.Overrides{CodeMode: policy.CodeModeLiteral, FootnoteMode: policy.FootnoteModeInline},
	})
	if err != nil {
		t.Fatalf("PreviewPreparedSourceSpeechPolicy override returned error: %v", err)
	}
	if !strings.Contains(override.SpeechText, "fmt.Println") || !strings.Contains(override.SpeechText, "Supporting note") {
		t.Fatalf("override preview did not include literal code and inline note: %q", override.SpeechText)
	}
	if !strings.Contains(override.Blocks[2].SpeechPolicy.Explanation, "session override") {
		t.Fatalf("override explanation = %q, want session override", override.Blocks[2].SpeechPolicy.Explanation)
	}

	if _, err := service.UpdateProjectSpeechPolicy("default", "Accessibility"); err != nil {
		t.Fatalf("UpdateProjectSpeechPolicy returned error: %v", err)
	}
	reloaded, err := service.GetPreparedSource(source.ID)
	if err != nil {
		t.Fatalf("GetPreparedSource returned error: %v", err)
	}
	if reloaded.SpeechPolicyProfile != "Accessibility" || !strings.Contains(reloaded.SpeechText, "fmt.Println") {
		t.Fatalf("reloaded source did not use stored project profile: profile=%q text=%q", reloaded.SpeechPolicyProfile, reloaded.SpeechText)
	}
}

func TestPreparedSourceJobStoresAppliedSpeechPolicyMetadata(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "policy-job.md",
		Text: strings.Join([]string{
			"# Policy job",
			"",
			"```go",
			"fmt.Println(\"hello\")",
			"```",
		}, "\n"),
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	job, err := service.CreatePreparedSourceJob(context.Background(), source.ID, pipeline.CreateJobRequest{
		SpeechPolicyProfile:   "Enterprise",
		SpeechPolicyOverrides: policy.Overrides{CodeMode: policy.CodeModeLiteral},
	})
	if err != nil {
		t.Fatalf("CreatePreparedSourceJob returned error: %v", err)
	}
	if job.SpeechPolicyProfile != "Enterprise" || job.SpeechPolicyOverrides.CodeMode != policy.CodeModeLiteral {
		t.Fatalf("job policy metadata = profile %q overrides %#v, want Enterprise literal code", job.SpeechPolicyProfile, job.SpeechPolicyOverrides)
	}
	if !strings.Contains(job.InputText, "fmt.Println") {
		t.Fatalf("job input text = %q, want literal code from applied override", job.InputText)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestPreparedSourceJobAllowsLongSentenceWithWarning(t *testing.T) {
	t.Parallel()

	service := newBookSourceServiceWithOptions(t, pipeline.Options{SourcePrepSentenceMaxRunes: 24})
	longSentence := strings.Repeat("word ", 20) + "end."
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindText,
		SourceName: "long sentence",
		Text:       longSentence,
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if len(source.Blocks) == 0 || len(source.Blocks[0].Segments) != 1 {
		t.Fatalf("long sentence should remain one segment, got %#v", source.Blocks)
	}
	if !strings.Contains(strings.Join(source.Blocks[0].Warnings, ","), "sentence_too_long") {
		t.Fatalf("block warnings = %#v, want sentence_too_long", source.Blocks[0].Warnings)
	}
	job, err := service.CreatePreparedSourceJob(context.Background(), source.ID, pipeline.CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreatePreparedSourceJob returned error: %v", err)
	}
	if !strings.Contains(strings.Join(job.SegmentationWarnings, ","), "sentence_too_long") {
		t.Fatalf("job segmentation warnings = %#v, want sentence_too_long", job.SegmentationWarnings)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestPreparedSourceAllowsLongAnalyticalSentencesByDefault(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	text := "Gartner reports that organisations with successful AI initiatives invest up to four times more in data quality, governance, AI-ready people, and change management than poor performers, and that organisations with the highest maturity of AI-ready data and analytics capabilities achieve up to 65% greater business outcomes."
	source, err := service.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "deep-research-report.md",
		Text:       text,
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	if strings.Contains(strings.Join(source.Blocks[0].Warnings, ","), "sentence_too_long") {
		t.Fatalf("block warnings = %#v, want long analytical sentence accepted", source.Blocks[0].Warnings)
	}
	job, err := service.CreatePreparedSourceJob(context.Background(), source.ID, pipeline.CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreatePreparedSourceJob returned error: %v", err)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestPreparedSourceURLIngestHonorsPrivateNetworkDefault(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.Header.Get("User-Agent") == "" || !strings.Contains(request.Header.Get("User-Agent"), "Mozilla/5.0") {
			t.Errorf("User-Agent = %q, want browser-like readable source header", request.Header.Get("User-Agent"))
		}
		if !strings.Contains(request.Header.Get("Accept"), "text/html") {
			t.Errorf("Accept = %q, want readable document types", request.Header.Get("Accept"))
		}
		writer.Header().Set("Content-Type", "text/markdown")
		_, _ = writer.Write([]byte("# URL Source\n\nThis came from a readable local test URL."))
	}))
	defer server.Close()

	blockedService := newBookSourceService(t)
	_, blockedErr := blockedService.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind: pipeline.PreparedSourceKindURL,
		URL:  server.URL,
	})
	if blockedErr == nil || !strings.Contains(blockedErr.Error(), "private or local") {
		t.Fatalf("blocked URL error = %v, want private-network rejection", blockedErr)
	}

	allowedService := newBookSourceServiceWithOptions(t, pipeline.Options{SourceURLAllowPrivate: true})
	source, err := allowedService.CreatePreparedSource(context.Background(), "default", pipeline.CreatePreparedSourceRequest{
		Kind: pipeline.PreparedSourceKindURL,
		URL:  server.URL,
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource(URL) returned error: %v", err)
	}
	if source.Kind != pipeline.PreparedSourceKindURL || !strings.Contains(source.SpeechText, "U R L Source") {
		t.Fatalf("source = %#v, want prepared URL source", source)
	}
}

func TestPlaybackProgressSessionLifecycle(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	session, err := service.StartPlaybackSession(pipeline.PlaybackProgressUpdate{
		TargetID:       "book:demo:chapter:1",
		ProjectID:      "default",
		BookSourceID:   "demo",
		CurrentTimeSec: 12.5,
		DurationSec:    100,
	})
	if err != nil {
		t.Fatalf("StartPlaybackSession returned error: %v", err)
	}
	if session.Status != pipeline.PlaybackSessionStatusOpen {
		t.Fatalf("session status = %q, want open", session.Status)
	}
	if _, err := service.SyncPlaybackSession(session.ID, pipeline.PlaybackProgressUpdate{
		CurrentTimeSec: 50,
		DurationSec:    100,
	}); err != nil {
		t.Fatalf("SyncPlaybackSession returned error: %v", err)
	}
	closed, err := service.ClosePlaybackSession(session.ID, pipeline.PlaybackProgressUpdate{
		CurrentTimeSec: 100,
		DurationSec:    100,
		Finished:       true,
	})
	if err != nil {
		t.Fatalf("ClosePlaybackSession returned error: %v", err)
	}
	if closed.Status != pipeline.PlaybackSessionStatusClosed {
		t.Fatalf("closed status = %q, want closed", closed.Status)
	}
	progress, err := service.ListProjectProgress("default")
	if err != nil {
		t.Fatalf("ListProjectProgress returned error: %v", err)
	}
	if len(progress) != 1 || !progress[0].Finished || progress[0].Progress != 1 {
		t.Fatalf("progress = %#v, want one finished item", progress)
	}
}

func TestCreateJobOutlivesRequestContextCancellation(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	ctx, cancel := context.WithCancel(context.Background())
	job, err := service.CreateJob(ctx, pipeline.CreateJobRequest{Text: "This job should outlive its HTTP request."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	cancel()

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.Error == "cancelled by request" {
		t.Fatal("request context cancellation should not mark the background job as user-cancelled")
	}
}

func TestCancelJobMarksExplicitUserCancellation(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: strings.Repeat("cancel me. ", 200)})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	if err := service.CancelJob(job.ID); err != nil {
		t.Fatalf("CancelJob returned error: %v", err)
	}
	cancelled := waitForJob(t, service, job.ID, pipeline.JobStatusCancelled)
	if cancelled.Error != "cancelled by request" {
		t.Fatalf("cancelled job error = %q, want explicit request reason", cancelled.Error)
	}
}

func TestCreateJobCanSelectProviderVoice(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:        "Read this with a selected voice.",
		TTSVoice:    "bf_emma",
		TTSLanguage: "b",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.TTSVoice != "bf_emma" {
		t.Fatalf("job TTSVoice = %q, want bf_emma", completed.TTSVoice)
	}
	if completed.TTSLanguage != "b" {
		t.Fatalf("job TTSLanguage = %q, want b", completed.TTSLanguage)
	}
	if completed.Voice != "bf_emma" {
		t.Fatalf("completed voice = %q, want selected provider voice", completed.Voice)
	}
}

func TestCreateJobCanSelectNativeVoiceID(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:    "Read this with the upstream voice id surface.",
		VoiceID: "kokoro:bm_lewis",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.VoiceID != "kokoro:bm_lewis" {
		t.Fatalf("job VoiceID = %q, want kokoro:bm_lewis", completed.VoiceID)
	}
	if completed.TTSVoice != "bm_lewis" {
		t.Fatalf("job TTSVoice = %q, want bm_lewis", completed.TTSVoice)
	}
	if completed.TTSLanguage != "b" {
		t.Fatalf("job TTSLanguage = %q, want b", completed.TTSLanguage)
	}
	if completed.Voice != "bm_lewis" {
		t.Fatalf("completed voice = %q, want selected native voice", completed.Voice)
	}
}

func TestCreateJobCanSelectCloneVoiceID(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:     3,
			JobDataDir:     t.TempDir(),
			ProjectDataDir: t.TempDir(),
			VoiceDataDir:   t.TempDir(),
		},
	)
	referenceWAV, err := audio.SilentWAV(1000)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	voice, err := service.CreateCloneVoice(context.Background(), pipeline.VoiceUpload{
		Name:     "Uploaded clone",
		Filename: "reference.wav",
		Reader:   bytes.NewReader(referenceWAV),
	})
	if err != nil {
		t.Fatalf("CreateCloneVoice returned error: %v", err)
	}

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:    "Read this with the uploaded clone voice.",
		VoiceID: voice.ID,
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.VoiceID != voice.ID {
		t.Fatalf("job VoiceID = %q, want %q", completed.VoiceID, voice.ID)
	}
	if completed.Provider != "mock-reference" {
		t.Fatalf("provider = %q, want mock-reference", completed.Provider)
	}
	if completed.QualityReport == nil || !completed.QualityReport.ReferenceProfile {
		t.Fatalf("quality report = %#v, want reference synthesis marked", completed.QualityReport)
	}
}

func TestCreateJobCanSelectRegisteredTTSEngine(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:     3,
			JobDataDir:     t.TempDir(),
			ProjectDataDir: t.TempDir(),
			TTSEngines: []pipeline.TTSEngineRegistration{
				{
					ID:    pipeline.TTSEngineSupertonic,
					Agent: agents.NewMockTTSAgent(),
					Diagnostics: pipeline.TTSEngineDiagnostics{
						ID:              pipeline.TTSEngineSupertonic,
						Label:           "Supertonic 3",
						Status:          "ready",
						SupportsVoice:   true,
						SupportsSwedish: true,
					},
				},
			},
		},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:        "Det var en kylig kväll i Stockholm.",
		TTSEngine:   pipeline.TTSEngineSupertonic,
		TTSVoice:    "F1",
		TTSLanguage: "sv",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.TTSEngine != pipeline.TTSEngineSupertonic {
		t.Fatalf("tts engine = %q, want %q", completed.TTSEngine, pipeline.TTSEngineSupertonic)
	}
	if completed.TTSLanguage != "sv" {
		t.Fatalf("tts language = %q, want sv", completed.TTSLanguage)
	}
	if completed.Voice != "F1" {
		t.Fatalf("voice = %q, want F1", completed.Voice)
	}
}

func TestCreateJobRejectsUnavailableTTSEngine(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	_, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:      "Try an unavailable engine.",
		TTSEngine: "scenema-audio",
	})
	if err == nil {
		t.Fatal("CreateJob returned nil error, want unavailable engine error")
	}
	if !strings.Contains(err.Error(), "tts engine") {
		t.Fatalf("error = %q, want tts engine message", err.Error())
	}
}

func TestListTTSEnginesIncludesAutoAndDiagnostics(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:     3,
			JobDataDir:     t.TempDir(),
			ProjectDataDir: t.TempDir(),
			TTSEngines: []pipeline.TTSEngineRegistration{
				{
					ID: pipeline.TTSEngineSupertonic,
					Diagnostics: pipeline.TTSEngineDiagnostics{
						ID:              pipeline.TTSEngineSupertonic,
						Label:           "Supertonic 3",
						Status:          "unavailable",
						SupportsSwedish: true,
					},
				},
			},
		},
	)

	engines := service.ListTTSEngines()
	if len(engines) < 2 {
		t.Fatalf("engines = %#v, want auto and at least one concrete engine", engines)
	}
	if engines[0].ID != pipeline.TTSEngineAuto {
		t.Fatalf("first engine = %q, want auto", engines[0].ID)
	}
	var foundSupertonic bool
	for _, engine := range engines {
		if engine.ID == pipeline.TTSEngineSupertonic {
			foundSupertonic = true
			if !engine.SupportsSwedish {
				t.Fatal("Supertonic diagnostics should mark Swedish support")
			}
		}
	}
	if !foundSupertonic {
		t.Fatalf("engines = %#v, want Supertonic diagnostics", engines)
	}
}

func TestCreateJobCanSkipTextPreprocessing(t *testing.T) {
	t.Parallel()

	optimizer := &countingOptimizer{output: "this should not be used"}
	service := pipeline.NewService(
		optimizer,
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	input := "Keep this text exactly as written."
	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text: input,
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			TextPreprocess: boolPtr(false),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if optimizer.calls != 0 {
		t.Fatalf("optimizer calls = %d, want 0", optimizer.calls)
	}
	if completed.OptimizedText != input {
		t.Fatalf("optimized text = %q, want %q", completed.OptimizedText, input)
	}
	if completed.Optimizer != "disabled" {
		t.Fatalf("optimizer = %q, want disabled", completed.Optimizer)
	}
}

func TestProjectsCreateRenameAndGroupJobs(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:     3,
			JobDataDir:     t.TempDir(),
			ProjectDataDir: t.TempDir(),
		},
	)

	defaultProjects := service.ListProjects()
	if len(defaultProjects) == 0 || defaultProjects[0].ID != "default" {
		t.Fatalf("default project should be first, got %#v", defaultProjects)
	}

	project, err := service.CreateProject("Long demo project")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	renamed, err := service.UpdateProject(project.ID, "Ozzy demo profile validation")
	if err != nil {
		t.Fatalf("UpdateProject returned error: %v", err)
	}
	if renamed.Name != "Ozzy demo profile validation" {
		t.Fatalf("project name = %q, want renamed value", renamed.Name)
	}

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		ProjectID: project.ID,
		Text:      "Project-specific job text.",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.ProjectID != project.ID {
		t.Fatalf("job project id = %q, want %q", completed.ProjectID, project.ID)
	}

	projectJobs, err := service.ListProjectJobs(project.ID)
	if err != nil {
		t.Fatalf("ListProjectJobs returned error: %v", err)
	}
	if len(projectJobs) != 1 || projectJobs[0].ID != job.ID {
		t.Fatalf("project jobs = %#v, want created job only", projectJobs)
	}

	defaultJob, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text: "Legacy clients should land in the default project.",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	completedDefault := waitForJob(t, service, defaultJob.ID, pipeline.JobStatusCompleted)
	if completedDefault.ProjectID != "default" {
		t.Fatalf("default job project id = %q, want default", completedDefault.ProjectID)
	}
	defaultJobs, err := service.ListProjectJobs("")
	if err != nil {
		t.Fatalf("ListProjectJobs(default) returned error: %v", err)
	}
	if len(defaultJobs) != 1 || defaultJobs[0].ID != defaultJob.ID {
		t.Fatalf("default project jobs = %#v, want legacy/default job", defaultJobs)
	}
}

func TestProjectCustomSpeechPolicyProfilesPersistAndSelect(t *testing.T) {
	t.Parallel()

	options := pipeline.Options{
		MaxRetries:         3,
		JobDataDir:         t.TempDir(),
		ProjectDataDir:     t.TempDir(),
		BookSourceDir:      t.TempDir(),
		SourcePrepDir:      t.TempDir(),
		ProgressDataDir:    t.TempDir(),
		PlaybackSessionDir: t.TempDir(),
	}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	project, err := service.CreateProject("Policy lab")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	created, err := service.CreateCustomSpeechPolicyProfile(project.ID, pipeline.UpsertSpeechPolicyProfileRequest{
		Name:        "Reader QA",
		BaseProfile: "Enterprise",
		Settings: policy.Settings{
			Mode:         policy.ModeSpeak,
			TableMode:    policy.TableModeRowLinear,
			CodeMode:     policy.CodeModeLiteral,
			MathMode:     policy.MathModeSemantic,
			FootnoteMode: policy.FootnoteModeInline,
			ImageMode:    policy.ImageModeDescribeShort,
		},
	})
	if err != nil {
		t.Fatalf("CreateCustomSpeechPolicyProfile returned error: %v", err)
	}
	customID := created.Profile
	if customID == "" || len(created.CustomProfiles) != 1 || created.CustomProfiles[0].Name != "Reader QA" {
		t.Fatalf("created custom policy = %#v, want selected custom profile", created)
	}
	if created.Settings.CodeMode != policy.CodeModeLiteral {
		t.Fatalf("created settings = %#v, want literal code mode", created.Settings)
	}

	reloaded := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	reloadedPolicy, err := reloaded.GetProjectSpeechPolicy(project.ID)
	if err != nil {
		t.Fatalf("GetProjectSpeechPolicy(reloaded) returned error: %v", err)
	}
	if reloadedPolicy.Profile != customID || len(reloadedPolicy.CustomProfiles) != 1 {
		t.Fatalf("reloaded policy = %#v, want selected custom profile", reloadedPolicy)
	}

	updated, err := reloaded.UpdateCustomSpeechPolicyProfile(project.ID, customID, pipeline.UpsertSpeechPolicyProfileRequest{
		Name:        "Reader QA edited",
		BaseProfile: "Education",
		Settings: policy.Settings{
			Mode:         policy.ModeSpeak,
			TableMode:    policy.TableModeSummary,
			CodeMode:     policy.CodeModeSummary,
			MathMode:     policy.MathModeSemantic,
			FootnoteMode: policy.FootnoteModeEndnote,
			ImageMode:    policy.ImageModeAltFirst,
		},
	})
	if err != nil {
		t.Fatalf("UpdateCustomSpeechPolicyProfile returned error: %v", err)
	}
	if updated.CustomProfiles[0].Name != "Reader QA edited" || updated.Settings.CodeMode != policy.CodeModeSummary {
		t.Fatalf("updated policy = %#v, want edited custom settings", updated)
	}

	deleted, err := reloaded.DeleteCustomSpeechPolicyProfile(project.ID, customID)
	if err != nil {
		t.Fatalf("DeleteCustomSpeechPolicyProfile returned error: %v", err)
	}
	if deleted.Profile != "Enterprise" || len(deleted.CustomProfiles) != 0 {
		t.Fatalf("deleted policy = %#v, want Enterprise fallback without custom profiles", deleted)
	}
}

func TestProjectDeleteAndStorageSummary(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	project, err := service.CreateProject("Delete me")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	source, err := service.CreatePreparedSource(context.Background(), project.ID, pipeline.CreatePreparedSourceRequest{
		Kind:       pipeline.PreparedSourceKindFile,
		SourceName: "notes.md",
		Text:       "# Notes\n\nThis is narration-ready source text.",
	})
	if err != nil {
		t.Fatalf("CreatePreparedSource returned error: %v", err)
	}
	job, err := service.CreatePreparedSourceJob(context.Background(), source.ID, pipeline.CreateJobRequest{})
	if err != nil {
		t.Fatalf("CreatePreparedSourceJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.AudioPath == "" {
		t.Fatal("completed job should have audio path")
	}
	if _, err := service.UpdatePlaybackProgress("prepared:"+source.ID, pipeline.PlaybackProgressUpdate{
		ProjectID:        project.ID,
		PreparedSourceID: source.ID,
		JobID:            completed.ID,
		CurrentTimeSec:   1,
		Progress:         0.5,
	}); err != nil {
		t.Fatalf("UpdatePlaybackProgress returned error: %v", err)
	}

	storage, err := service.GetProjectStorageSummary(project.ID)
	if err != nil {
		t.Fatalf("GetProjectStorageSummary returned error: %v", err)
	}
	if storage.JobCount != 1 || storage.PreparedSourceCount != 1 || storage.GeneratedAudioBytes == 0 {
		t.Fatalf("storage summary = %#v, want project job/source/audio totals", storage)
	}
	if len(storage.Downloads) == 0 || storage.Downloads[0].URL == "" {
		t.Fatalf("storage downloads = %#v, want audio download", storage.Downloads)
	}

	if err := service.DeleteProject("default"); !errors.Is(err, pipeline.ErrProjectProtected) {
		t.Fatalf("DeleteProject(default) error = %v, want protected", err)
	}
	if err := service.DeleteProject(project.ID); err != nil {
		t.Fatalf("DeleteProject returned error: %v", err)
	}
	if _, err := service.GetProject(project.ID); !errors.Is(err, pipeline.ErrProjectNotFound) {
		t.Fatalf("GetProject deleted error = %v, want not found", err)
	}
	if _, err := service.GetPreparedSource(source.ID); !errors.Is(err, pipeline.ErrPreparedSourceNotFound) {
		t.Fatalf("GetPreparedSource deleted error = %v, want not found", err)
	}
}

func TestCreateJobCanSkipASRCheckAndRetry(t *testing.T) {
	t.Parallel()

	checker := &countingRejectChecker{}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text: "first sentence. second sentence.",
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			ASRCheck:      boolPtr(false),
			AutoRetry:     boolPtr(false),
			QualityReport: boolPtr(true),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if checker.calls != 0 {
		t.Fatalf("checker calls = %d, want 0", checker.calls)
	}
	if completed.Retries.MaxRetries != 1 {
		t.Fatalf("max retries = %d, want 1", completed.Retries.MaxRetries)
	}
	if completed.VoiceCheck.Provider != "disabled" {
		t.Fatalf("checker provider = %q, want disabled", completed.VoiceCheck.Provider)
	}
	if completed.QualityReport == nil {
		t.Fatal("quality report should be present")
	}
	if completed.QualityReport.ReferenceProfile {
		t.Fatal("quality report should not mark a default voice job as reference-profile")
	}
}

func TestProjectBundleSummaryExportAndPreview(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	project, err := service.CreateProject("Bundle QA")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	customPolicy, err := service.CreateCustomSpeechPolicyProfile(project.ID, pipeline.UpsertSpeechPolicyProfileRequest{
		Name:        "Bundle profile",
		BaseProfile: "Enterprise",
		Settings: policy.Settings{
			Mode:         policy.ModeSpeak,
			TableMode:    policy.TableModeSummary,
			CodeMode:     policy.CodeModeLiteral,
			MathMode:     policy.MathModeSkip,
			FootnoteMode: policy.FootnoteModeInline,
			ImageMode:    policy.ImageModeAltFirst,
		},
	})
	if err != nil {
		t.Fatalf("CreateCustomSpeechPolicyProfile returned error: %v", err)
	}
	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		ProjectID: project.ID,
		Text:      "Export this project as a portable bundle.",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	epubPath := writeTestEPUB(t, "bundle.epub")
	epubInfo, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat EPUB returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), project.ID, epubPath, "bundle.epub", epubInfo.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}

	summary, err := service.GetProjectBundleSummary(project.ID)
	if err != nil {
		t.Fatalf("GetProjectBundleSummary returned error: %v", err)
	}
	if summary.ProjectID != project.ID || summary.ChapterCount != 1 || summary.GeneratedAudio != 1 {
		t.Fatalf("summary = %#v, want project, one chapter, generated audio", summary)
	}
	if summary.EstimatedBytes <= 0 {
		t.Fatalf("estimated bundle bytes = %d, want positive", summary.EstimatedBytes)
	}

	bundle, filename, err := service.ExportProjectBundle(project.ID)
	if err != nil {
		t.Fatalf("ExportProjectBundle returned error: %v", err)
	}
	if !strings.HasSuffix(filename, ".voice-studio.zip") {
		t.Fatalf("filename = %q, want voice studio bundle extension", filename)
	}
	bundlePath := filepath.Join(t.TempDir(), filename)
	if err := os.WriteFile(bundlePath, bundle, 0o644); err != nil {
		t.Fatalf("write bundle: %v", err)
	}
	preview, err := service.PreviewProjectBundle(bundlePath)
	if err != nil {
		t.Fatalf("PreviewProjectBundle returned error: %v", err)
	}
	if !preview.Valid || preview.ProjectName != project.Name || preview.ChapterCount != 1 {
		t.Fatalf("preview = %#v, want valid project preview", preview)
	}
	if preview.Manifest == nil || len(preview.Manifest.Jobs) != 1 || preview.Manifest.Jobs[0].ID != completed.ID {
		t.Fatalf("preview manifest = %#v, want exported completed job", preview.Manifest)
	}
	if preview.Manifest.Project.SpeechPolicyProfile != customPolicy.Profile ||
		len(preview.Manifest.Project.SpeechPolicyProfiles) != 1 ||
		preview.Manifest.Project.SpeechPolicyProfiles[0].Name != "Bundle profile" {
		t.Fatalf("preview project policy = %#v, want exported custom speech policy", preview.Manifest.Project)
	}
	if len(preview.Manifest.Books) != 1 || preview.Manifest.Books[0].ID != book.ID {
		t.Fatalf("preview books = %#v, want exported book metadata", preview.Manifest.Books)
	}
}

func TestProjectBundleImportCopyAndReplace(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())
	project, err := service.CreateProject("Portable Book")
	if err != nil {
		t.Fatalf("CreateProject returned error: %v", err)
	}
	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		ProjectID: project.ID,
		Text:      "A portable chapter.",
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	epubPath := writeTestEPUB(t, "portable.epub")
	epubInfo, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat EPUB returned error: %v", err)
	}
	if _, err := service.CreateBookSource(context.Background(), project.ID, epubPath, "portable.epub", epubInfo.Size()); err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	bundle, filename, err := service.ExportProjectBundle(project.ID)
	if err != nil {
		t.Fatalf("ExportProjectBundle returned error: %v", err)
	}
	bundlePath := filepath.Join(t.TempDir(), filename)
	if err := os.WriteFile(bundlePath, bundle, 0o644); err != nil {
		t.Fatalf("write bundle: %v", err)
	}

	copied, err := service.ImportProjectBundle(
		bundlePath,
		pipeline.ProjectBundleImportRequest{Mode: pipeline.BundleImportModeCopy},
	)
	if err != nil {
		t.Fatalf("ImportProjectBundle(copy) returned error: %v", err)
	}
	if copied.Project.ID == project.ID {
		t.Fatal("copy import should create a new project id")
	}
	if !strings.Contains(copied.Project.Name, "Imported") {
		t.Fatalf("copy project name = %q, want imported copy name", copied.Project.Name)
	}
	if len(copied.Jobs) != 1 || copied.Jobs[0].ID == completed.ID {
		t.Fatalf("copied jobs = %#v, want one new job id", copied.Jobs)
	}
	copiedBooks, err := service.ListProjectBookSources(copied.Project.ID)
	if err != nil {
		t.Fatalf("ListProjectBookSources(copied) returned error: %v", err)
	}
	if len(copiedBooks) != 1 || copiedBooks[0].ProjectID != copied.Project.ID {
		t.Fatalf("copied books = %#v, want one imported book source", copiedBooks)
	}
	originalJobs, err := service.ListProjectJobs(project.ID)
	if err != nil {
		t.Fatalf("ListProjectJobs(original) returned error: %v", err)
	}
	if len(originalJobs) != 1 || originalJobs[0].ID != completed.ID {
		t.Fatalf("original jobs = %#v, want original untouched", originalJobs)
	}

	target, err := service.CreateProject("Replace Target")
	if err != nil {
		t.Fatalf("CreateProject(target) returned error: %v", err)
	}
	oldJob, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		ProjectID: target.ID,
		Text:      "This job should be replaced.",
	})
	if err != nil {
		t.Fatalf("CreateJob(old) returned error: %v", err)
	}
	waitForJob(t, service, oldJob.ID, pipeline.JobStatusCompleted)
	replaced, err := service.ImportProjectBundle(
		bundlePath,
		pipeline.ProjectBundleImportRequest{
			Mode:      pipeline.BundleImportModeReplace,
			ProjectID: target.ID,
		},
	)
	if err != nil {
		t.Fatalf("ImportProjectBundle(replace) returned error: %v", err)
	}
	if replaced.Project.ID != target.ID {
		t.Fatalf("replace project id = %q, want %q", replaced.Project.ID, target.ID)
	}
	targetJobs, err := service.ListProjectJobs(target.ID)
	if err != nil {
		t.Fatalf("ListProjectJobs(replaced) returned error: %v", err)
	}
	if len(targetJobs) != 1 || targetJobs[0].ID == oldJob.ID {
		t.Fatalf("replaced project jobs = %#v, want old job removed and bundle job imported", targetJobs)
	}
}

func TestCreateBookSourceImportsEPUBWordSpans(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	epubPath := writeTestEPUB(t, "book.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}

	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "book.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	if book.Status != pipeline.BookSourceStatusReady {
		t.Fatalf("book status = %q, want ready: %s", book.Status, book.Error)
	}
	if book.Kind != pipeline.BookSourceKindEPUB {
		t.Fatalf("book kind = %q, want epub", book.Kind)
	}
	if book.Title != "Northern Lights" {
		t.Fatalf("book title = %q", book.Title)
	}
	if book.Author != "Ada Reader" {
		t.Fatalf("book author = %q", book.Author)
	}
	if book.ChapterCount != 2 {
		t.Fatalf("chapter count = %d, want 2", book.ChapterCount)
	}
	if book.WordCount == 0 || len(book.WordSpans) == 0 {
		t.Fatal("book should include word spans for the text layer")
	}
	if !strings.Contains(book.Text, "Stockholm") || !strings.Contains(book.Text, "second chapter") {
		t.Fatalf("book text did not include expected chapter content: %q", book.Text)
	}
	if strings.Contains(book.Text, "Opening\nOpening") {
		t.Fatalf("book text should not include hidden HTML title metadata: %q", book.Text)
	}

	books, err := service.ListProjectBookSources("default")
	if err != nil {
		t.Fatalf("ListProjectBookSources returned error: %v", err)
	}
	if len(books) != 1 || books[0].ID != book.ID {
		t.Fatalf("project books = %#v, want imported book", books)
	}
}

func TestBookSourceSummaryAndScopeContent(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	epubPath := writeStructuredTestEPUB(t, "structured.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "structured.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}

	summaries, err := service.ListProjectBookSourcesSummary("default")
	if err != nil {
		t.Fatalf("ListProjectBookSourcesSummary returned error: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("summary count = %d, want 1", len(summaries))
	}
	summary := summaries[0]
	if summary.Text != "" || len(summary.WordSpans) != 0 {
		t.Fatalf("summary should omit full text and spans: text=%q spans=%d", summary.Text, len(summary.WordSpans))
	}
	if len(summary.Chapters) < 3 || summary.Chapters[0].Text != "" {
		t.Fatalf("summary should keep structure without chapter text: %#v", summary.Chapters)
	}
	if summary.DefaultSectionID == "" || len(summary.Sections) == 0 {
		t.Fatalf("summary should include section metadata: %#v", summary)
	}

	content, err := service.GetBookSourceScope(book.ID, &pipeline.BookScope{
		Type:         pipeline.BookScopeTypeChapter,
		ChapterIndex: 2,
	})
	if err != nil {
		t.Fatalf("GetBookSourceScope returned error: %v", err)
	}
	if !strings.Contains(content.Text, "The first real chapter") || strings.Contains(content.Text, "Copyright") {
		t.Fatalf("scoped text = %q, want only selected narratable chapter", content.Text)
	}
	if content.Section == nil || content.Section.Role != "body" || !content.Section.IsNarratable {
		t.Fatalf("scope section = %#v, want narratable body section", content.Section)
	}
	if len(content.WordSpans) == 0 || content.WordCount != len(content.WordSpans) {
		t.Fatalf("scope spans = %d wordCount = %d", len(content.WordSpans), content.WordCount)
	}
}

func TestStructuredEPUBUsesNavLabelsAndNarratableDefault(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	epubPath := writeStructuredTestEPUB(t, "nav-labels.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "nav-labels.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	if book.ChapterCount != 2 {
		t.Fatalf("chapter count = %d, want only 2 narratable body chapters", book.ChapterCount)
	}
	if book.DefaultSectionID == "" {
		t.Fatal("book should select a default narratable body section")
	}
	if len(book.Chapters) != 4 {
		t.Fatalf("chapter entries = %d, want visible front/body/back sections", len(book.Chapters))
	}
	if book.Chapters[1].Title != "Chapter 1: A Clean Start" {
		t.Fatalf("chapter label = %q, want nav label", book.Chapters[1].Title)
	}
	if book.Chapters[0].Role != "frontmatter" || book.Chapters[0].IsNarratable {
		t.Fatalf("frontmatter chapter = %#v, want visible but non-narratable", book.Chapters[0])
	}
	if book.Chapters[3].Role != "backmatter" || book.Chapters[3].IsNarratable {
		t.Fatalf("backmatter chapter = %#v, want visible but non-narratable", book.Chapters[3])
	}
}

func TestCreateBookSourceImportsDOCXStructure(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	docxPath := writeTestDOCX(t, "structured.docx")
	info, err := os.Stat(docxPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", docxPath, "structured.docx", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	if book.Kind != pipeline.BookSourceKindDOCX || book.Status != pipeline.BookSourceStatusReady {
		t.Fatalf("book kind/status = %q/%q error=%s", book.Kind, book.Status, book.Error)
	}
	if book.Title != "DOCX Integration Fixture" || book.Author != "Adapter Writer" {
		t.Fatalf("metadata = %q/%q, want DOCX title and author", book.Title, book.Author)
	}
	for _, expected := range []string{"Chapter One", "Cell A | Cell B", "Footnote detail.", "Diagram alt text"} {
		if !strings.Contains(book.Text, expected) {
			t.Fatalf("book text missing %q: %q", expected, book.Text)
		}
	}
	if len(book.Sections) == 0 || book.DefaultSectionID == "" || len(book.WordSpans) == 0 {
		t.Fatalf("book structure = sections:%d default:%q spans:%d", len(book.Sections), book.DefaultSectionID, len(book.WordSpans))
	}
	document, err := service.GetContentIR(book.ID)
	if err != nil {
		t.Fatalf("GetContentIR returned error: %v", err)
	}
	if document.Nodes[0].Provenance.Locator.Type != "docx" || document.Nodes[0].Provenance.Locator.DOCX == nil {
		t.Fatalf("first locator = %#v, want DOCX locator", document.Nodes[0].Provenance.Locator)
	}
}

func TestCreateBookSourceImportsHTMLStructure(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	htmlPath := writeTestHTML(t, "article.html")
	info, err := os.Stat(htmlPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", htmlPath, "article.html", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	if book.Kind != pipeline.BookSourceKindHTML || book.Status != pipeline.BookSourceStatusReady {
		t.Fatalf("book kind/status = %q/%q error=%s", book.Kind, book.Status, book.Error)
	}
	if book.Title != "Synthetic Article" {
		t.Fatalf("book title = %q, want HTML title", book.Title)
	}
	for _, expected := range []string{"Synthetic Article", "Article lead paragraph", "Useful figure caption", "A newsroom desk"} {
		if !strings.Contains(book.Text, expected) {
			t.Fatalf("book text missing %q: %q", expected, book.Text)
		}
	}
	if len(book.Sections) == 0 || book.DefaultSectionID == "" || len(book.WordSpans) == 0 {
		t.Fatalf("book structure = sections:%d default:%q spans:%d", len(book.Sections), book.DefaultSectionID, len(book.WordSpans))
	}
	document, err := service.GetContentIR(book.ID)
	if err != nil {
		t.Fatalf("GetContentIR returned error: %v", err)
	}
	if document.Nodes[0].Provenance.Locator.Type != "html" || document.Nodes[0].Provenance.Locator.HTML == nil {
		t.Fatalf("first locator = %#v, want HTML locator", document.Nodes[0].Provenance.Locator)
	}
}

func TestCreateBookSourceFromURLUsesHTMLContentType(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = writer.Write([]byte(testHTMLFixture()))
	}))
	defer server.Close()

	service := newBookSourceServiceWithOptions(t, pipeline.Options{SourceURLAllowPrivate: true})
	book, err := service.CreateBookSourceFromURL(context.Background(), "default", server.URL+"/article")
	if err != nil {
		t.Fatalf("CreateBookSourceFromURL returned error: %v", err)
	}
	if book.Kind != pipeline.BookSourceKindHTML || !strings.HasSuffix(book.SourceFile, ".html") {
		t.Fatalf("book kind/source file = %q/%q, want HTML from content type", book.Kind, book.SourceFile)
	}
}

func TestProjectHailMaryEPUBDemoStructureIfAvailable(t *testing.T) {
	t.Parallel()

	epubPath := filepath.Join("..", "demo", "_OceanofPDF.com_Project_Hail_Mary_-_y_Weir.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Skipf("Project Hail Mary demo fixture unavailable: %v", err)
	}
	service := newBookSourceService(t)
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, filepath.Base(epubPath), info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource(Project Hail Mary) returned error: %v", err)
	}
	if book.ChapterCount < 30 {
		t.Fatalf("Project Hail Mary body chapter count = %d, want at least 30", book.ChapterCount)
	}
	defaultSection := findTestSection(book.Sections, book.DefaultSectionID)
	if defaultSection == nil || defaultSection.Title != "Chapter 1" || defaultSection.Role != "body" {
		t.Fatalf("default section = %#v, want Chapter 1 body", defaultSection)
	}
	if strings.Contains(book.Text, "OceanofPDF.com") {
		t.Fatal("book text should not include OceanofPDF watermark")
	}
}

func TestCreateBookNarrationJobUsesBookText(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	epubPath := writeTestEPUB(t, "narration.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "narration.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}

	job, err := service.CreateBookNarrationJob(
		context.Background(),
		book.ID,
		pipeline.CreateJobRequest{
			RunMode: pipeline.RunModeDraftPreview,
			PipelineOptions: pipeline.CreateJobPipelineOptions{
				ASRCheck:  boolPtr(false),
				AutoRetry: boolPtr(false),
			},
		},
	)
	if err != nil {
		t.Fatalf("CreateBookNarrationJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.ProjectID != book.ProjectID {
		t.Fatalf("job project = %q, want %q", completed.ProjectID, book.ProjectID)
	}
	if completed.InputText != book.Text {
		t.Fatalf("job input text = %q, want book text %q", completed.InputText, book.Text)
	}
}

func TestCreateBookNarrationJobUsesChapterScope(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	epubPath := writeTestEPUB(t, "chapter-scope.epub")
	info, err := os.Stat(epubPath)
	if err != nil {
		t.Fatalf("Stat returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", epubPath, "chapter-scope.epub", info.Size())
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}

	job, err := service.CreateBookNarrationJob(
		context.Background(),
		book.ID,
		pipeline.CreateJobRequest{
			BookScope: &pipeline.BookScope{
				Type:         pipeline.BookScopeTypeChapter,
				ChapterIndex: 2,
			},
			RunMode: pipeline.RunModeDraftPreview,
			PipelineOptions: pipeline.CreateJobPipelineOptions{
				ASRCheck:  boolPtr(false),
				AutoRetry: boolPtr(false),
			},
		},
	)
	if err != nil {
		t.Fatalf("CreateBookNarrationJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.BookSourceID != book.ID {
		t.Fatalf("job book source = %q, want %q", completed.BookSourceID, book.ID)
	}
	if completed.BookScope == nil || completed.BookScope.Type != pipeline.BookScopeTypeChapter || completed.BookScope.ChapterIndex != 2 {
		t.Fatalf("job book scope = %#v, want chapter 2", completed.BookScope)
	}
	if !strings.Contains(completed.InputText, "The second chapter") || strings.Contains(completed.InputText, "Det var en kylig") {
		t.Fatalf("job input text = %q, want only chapter 2 text", completed.InputText)
	}
}

func TestCreateBookNarrationJobUsesPDFPageScopeWithPythonFallback(t *testing.T) {
	t.Parallel()

	service := newBookSourceServiceWithPDFScript(t, writeTestPDFExtractorScript(t))
	pdfPath := filepath.Join(t.TempDir(), "sample.pdf")
	if err := os.WriteFile(pdfPath, []byte("%PDF-1.4\n% fake text-layer fixture"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	book, err := service.CreateBookSource(context.Background(), "default", pdfPath, "sample.pdf", 32)
	if err != nil {
		t.Fatalf("CreateBookSource returned error: %v", err)
	}
	if book.PageCount != 3 {
		t.Fatalf("book page count = %d, want 3", book.PageCount)
	}
	if len(book.Sections) == 0 || book.DefaultSectionID == "" {
		t.Fatalf("PDF book sections = %#v default=%q, want page sections", book.Sections, book.DefaultSectionID)
	}
	content, err := service.GetBookSourceScope(book.ID, &pipeline.BookScope{
		Type:      pipeline.BookScopeTypePages,
		PageStart: 2,
		PageEnd:   3,
	})
	if err != nil {
		t.Fatalf("GetBookSourceScope returned error: %v", err)
	}
	if len(content.WordSpans) == 0 || content.WordCount != len(content.WordSpans) {
		t.Fatalf("PDF scoped spans = %d wordCount = %d, want spans for selected pages", len(content.WordSpans), content.WordCount)
	}

	job, err := service.CreateBookNarrationJob(
		context.Background(),
		book.ID,
		pipeline.CreateJobRequest{
			BookScope: &pipeline.BookScope{
				Type:      pipeline.BookScopeTypePages,
				PageStart: 2,
				PageEnd:   3,
			},
			RunMode: pipeline.RunModeDraftPreview,
			PipelineOptions: pipeline.CreateJobPipelineOptions{
				ASRCheck:  boolPtr(false),
				AutoRetry: boolPtr(false),
			},
		},
	)
	if err != nil {
		t.Fatalf("CreateBookNarrationJob returned error: %v", err)
	}
	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.BookScope == nil || completed.BookScope.Type != pipeline.BookScopeTypePages || completed.BookScope.PageStart != 2 || completed.BookScope.PageEnd != 3 {
		t.Fatalf("job book scope = %#v, want pages 2-3", completed.BookScope)
	}
	if strings.Contains(completed.InputText, "first page") ||
		!strings.Contains(completed.InputText, "second page") ||
		!strings.Contains(completed.InputText, "third page") {
		t.Fatalf("job input text = %q, want only pages 2-3", completed.InputText)
	}
}

func TestCreateBookSourceImportsImageBatchWithOCRDiagnostics(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	dir := t.TempDir()
	firstPath := filepath.Join(dir, "page-001.png")
	secondPath := filepath.Join(dir, "page-002.png")
	if err := os.WriteFile(firstPath, []byte("TTS_RESEARCH_IMAGE_TEXT: first image batch page"), 0o644); err != nil {
		t.Fatalf("WriteFile first image returned error: %v", err)
	}
	if err := os.WriteFile(secondPath, []byte("TTS_RESEARCH_IMAGE_TEXT: second image batch page"), 0o644); err != nil {
		t.Fatalf("WriteFile second image returned error: %v", err)
	}
	book, err := service.CreateBookSourceWithOptions(context.Background(), "default", []pipeline.BookSourceUpload{
		{Path: firstPath, Filename: "page-001.png", Bytes: 42},
		{Path: secondPath, Filename: "page-002.png", Bytes: 43},
	}, pipeline.BookSourceImportOptions{})
	if err != nil {
		t.Fatalf("CreateBookSourceWithOptions returned error: %v", err)
	}
	if book.Kind != pipeline.BookSourceKindImage || book.PageCount != 2 {
		t.Fatalf("book kind/page count = %s/%d, want image/2", book.Kind, book.PageCount)
	}
	if book.Ingestion == nil || book.Ingestion.SupportTier != "D" {
		t.Fatalf("ingestion = %#v, want tier D", book.Ingestion)
	}
	if !strings.Contains(book.Text, "first image batch page") || !strings.Contains(book.Text, "second image batch page") {
		t.Fatalf("book text = %q, want ordered OCR text", book.Text)
	}
	document, err := service.GetContentIR(book.ID)
	if err != nil {
		t.Fatalf("GetContentIR returned error: %v", err)
	}
	if len(document.Nodes) != 2 || document.Nodes[0].Provenance.Locator.OCR == nil {
		t.Fatalf("content IR OCR nodes = %#v, want OCR provenance", document.Nodes)
	}
}

func TestCreateBookSourceUsesScholarlyImportProfile(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	pdfPath := filepath.Join(t.TempDir(), "scholarly.pdf")
	fixture := `%PDF-1.4
TTS_RESEARCH_PDF_FIXTURE: {
  "title": "Scholarly Import",
  "pages": [{"index": 1, "text": "Fallback page text."}],
  "scholarly": {
    "title": "Scholarly Import",
    "pages": [{
      "index": 1,
      "blocks": [
        {"kind": "body", "text": "Scholarly prose survives for playback.", "confidence": 0.88},
        {"kind": "bibliography", "text": "Bibliography entry should not become prose playback.", "confidence": 0.78}
      ]
    }]
  }
}
%%EOF`
	if err := os.WriteFile(pdfPath, []byte(fixture), 0o644); err != nil {
		t.Fatalf("WriteFile scholarly fixture returned error: %v", err)
	}
	book, err := service.CreateBookSourceWithOptions(context.Background(), "default", []pipeline.BookSourceUpload{{
		Path:     pdfPath,
		Filename: "scholarly.pdf",
		Bytes:    int64(len(fixture)),
	}}, pipeline.BookSourceImportOptions{
		ImportProfile: pipeline.BookImportProfileScholarly,
		PDFTableMode:  pipeline.PDFTableModeStructured,
	})
	if err != nil {
		t.Fatalf("CreateBookSourceWithOptions returned error: %v", err)
	}
	if book.Ingestion == nil || book.Ingestion.SupportTier != "E" || book.Ingestion.ImportProfile != "scholarly" {
		t.Fatalf("ingestion = %#v, want scholarly tier E", book.Ingestion)
	}
	if !strings.Contains(book.Text, "Scholarly prose survives") || strings.Contains(book.Text, "Bibliography entry") {
		t.Fatalf("book text = %q, want bibliography kept out of playback prose", book.Text)
	}
}

func TestBookCinemaDiagnosticsReportsPythonFallback(t *testing.T) {
	t.Parallel()

	service := newBookSourceServiceWithPDFScript(t, writeTestPDFExtractorScript(t))
	diagnostics := service.BookCinemaDiagnostics()
	if !diagnostics.PDFExtractorAvailable {
		t.Fatalf("expected a PDF extractor to be available: %#v", diagnostics)
	}
	if !diagnostics.PythonFallbackAvailable {
		t.Fatalf("expected python fallback to be available: %#v", diagnostics)
	}
	if !diagnostics.Adapters["epub"].Available || !diagnostics.Adapters["docx"].Available || !diagnostics.Adapters["html"].Available {
		t.Fatalf("adapter diagnostics = %#v, want EPUB/DOCX/HTML available", diagnostics.Adapters)
	}
}

func TestPlaybackProgressPersistsReadingPosition(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	position := &pipeline.ReadingPosition{
		BookSourceID:    "book-1",
		ScopeKey:        "chapter:2",
		ActiveWordIndex: 17,
		NodeID:          "node-17",
		Locator: &contentir.Locator{
			Type: "html",
			HTML: &contentir.HTMLLocator{
				Href:      "chapter.html",
				Fragment:  "node-17",
				TextQuote: "exact words",
			},
		},
		TextQuote: "exact words",
	}
	progress, err := service.UpdatePlaybackProgress("book:book-1:chapter:2", pipeline.PlaybackProgressUpdate{
		ProjectID:       "default",
		BookSourceID:    "book-1",
		ActiveWordIndex: 17,
		ReadingPosition: position,
		CurrentTimeSec:  3,
		Progress:        0.25,
	})
	if err != nil {
		t.Fatalf("UpdatePlaybackProgress returned error: %v", err)
	}
	if progress.ReadingPosition == nil || progress.ReadingPosition.NodeID != "node-17" {
		t.Fatalf("progress reading position = %#v", progress.ReadingPosition)
	}
	progress.ReadingPosition.NodeID = "mutated"

	items, err := service.ListProjectProgress("default")
	if err != nil {
		t.Fatalf("ListProjectProgress returned error: %v", err)
	}
	if len(items) != 1 || items[0].ReadingPosition == nil || items[0].ReadingPosition.NodeID != "node-17" {
		t.Fatalf("listed progress = %#v", items)
	}
}

func TestCreateBookSourceRejectsUnsupportedTypes(t *testing.T) {
	t.Parallel()

	service := newBookSourceService(t)
	sourcePath := filepath.Join(t.TempDir(), "notes.txt")
	if err := os.WriteFile(sourcePath, []byte("not a book container"), 0o644); err != nil {
		t.Fatalf("WriteFile returned error: %v", err)
	}
	if _, err := service.CreateBookSource(context.Background(), "default", sourcePath, "notes.txt", 20); err == nil {
		t.Fatal("CreateBookSource should reject unsupported book source types")
	}
}

func TestCreateJobCanIgnoreSelectedVoiceProfile(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:      3,
			JobDataDir:      t.TempDir(),
			ProjectDataDir:  t.TempDir(),
			VoiceProfileDir: t.TempDir(),
		},
	)
	wav, err := audio.SilentWAV(1500)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}
	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Reference",
		"en",
		sourcePath,
		"reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:           "Use the default voice even though a profile is selected.",
		VoiceProfileID: profile.ID,
		PipelineOptions: pipeline.CreateJobPipelineOptions{
			VoiceClone: boolPtr(false),
		},
	})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.VoiceProfileID != "" {
		t.Fatalf("voice profile id = %q, want empty when voiceClone=false", completed.VoiceProfileID)
	}
	if completed.Provider != "mock" {
		t.Fatalf("provider = %q, want mock", completed.Provider)
	}
}

func TestCreateJobPublishesPartialAudioWhileSynthesizing(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 10, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first short sentence. second short sentence. third short sentence"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	waitForAudioSegments(t, service, job.ID, 1)

	processingJob, err := service.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}

	if processingJob.AudioReadySegments < 1 {
		t.Fatalf("partial audio should be available after at least one segment, got %d", processingJob.AudioReadySegments)
	}

	partialAudio, partialType, err := service.GetPartialAudio(job.ID)
	if err != nil {
		t.Fatalf("GetPartialAudio returned error: %v", err)
	}

	if partialType != "audio/wav" {
		t.Fatalf("partial content type = %q, want audio/wav", partialType)
	}
	if len(partialAudio) <= 44 {
		t.Fatalf("partial audio length = %d, want WAV data", len(partialAudio))
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.AudioPath == "" {
		t.Fatal("completed job should include final audio path")
	}
}

func TestGetAudioSegmentReturnsOnlyWhenReady(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first short sentence. second short sentence. third short sentence"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	_, _, err = service.GetAudioSegment(job.ID, 100)
	if !errors.Is(err, pipeline.ErrAudioNotReady) {
		t.Fatalf("expected future segment to be unavailable before synthesis, got: %v", err)
	}

	waitForAudioSegments(t, service, job.ID, 1)

	segmentAudio, segmentType, err := service.GetAudioSegment(job.ID, 1)
	if err != nil {
		t.Fatalf("GetAudioSegment returned error: %v", err)
	}
	if segmentType != "audio/wav" {
		t.Fatalf("segment content type = %q, want audio/wav", segmentType)
	}
	if len(segmentAudio) <= 44 {
		t.Fatalf("segment audio length = %d, want WAV data", len(segmentAudio))
	}

	_, _, err = service.GetAudioSegment(job.ID, 101)
	if !errors.Is(err, pipeline.ErrAudioNotReady) {
		t.Fatalf("expected segment beyond completion to be unavailable yet, got: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.AudioReadySegments != completed.Retries.TotalSegments {
		t.Fatalf("all segments should be ready after completion, got %d of %d", completed.AudioReadySegments, completed.Retries.TotalSegments)
	}

	for segmentIndex := 1; segmentIndex <= completed.Retries.TotalSegments; segmentIndex += 1 {
		_, _, err := service.GetAudioSegment(job.ID, segmentIndex)
		if err != nil {
			t.Fatalf("segment %d should still be available after completion: %v", segmentIndex, err)
		}
	}
}

func TestCreateVoiceProfileTrimsLongPCM16WAVReference(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                      t.TempDir(),
			ProjectDataDir:                  t.TempDir(),
			VoiceProfileDir:                 t.TempDir(),
			VoiceProfileReferenceMaxSeconds: 1,
		},
	)
	wav, err := audio.SilentWAV(2500)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "long-reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}

	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Samantha",
		"en",
		sourcePath,
		"long-reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	if profile.SourceDurationMS < 2400 {
		t.Fatalf("source duration = %d, want original long source duration", profile.SourceDurationMS)
	}
	if profile.ReferenceDurationMS > 1100 {
		t.Fatalf("reference duration = %d, want bounded reference", profile.ReferenceDurationMS)
	}
	if !profile.ReferenceTrimmed {
		t.Fatal("reference should be marked as trimmed")
	}
	if profile.ReferenceSampleStrategy != "pcm16-wav-first-1s" {
		t.Fatalf("strategy = %q, want pcm16-wav-first-1s", profile.ReferenceSampleStrategy)
	}
}

func TestCreateVoiceProfileKeepsShortPCM16WAVReference(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                      t.TempDir(),
			ProjectDataDir:                  t.TempDir(),
			VoiceProfileDir:                 t.TempDir(),
			VoiceProfileReferenceMaxSeconds: 5,
		},
	)
	wav, err := audio.SilentWAV(1200)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "short-reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}

	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"short-reference.wav",
		int64(len(wav)),
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	if profile.ReferenceTrimmed {
		t.Fatal("short reference should not be marked as trimmed")
	}
	if profile.ReferenceSampleStrategy != "pcm16-wav-full" {
		t.Fatalf("strategy = %q, want pcm16-wav-full", profile.ReferenceSampleStrategy)
	}
	if profile.SourceDurationMS != profile.ReferenceDurationMS {
		t.Fatalf("source duration = %d, reference duration = %d, want equal", profile.SourceDurationMS, profile.ReferenceDurationMS)
	}
}

func TestVoiceProfileMaxBytesZeroMeansUnlimited(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                      t.TempDir(),
			ProjectDataDir:                  t.TempDir(),
			VoiceProfileDir:                 t.TempDir(),
			VoiceProfileReferenceMaxSeconds: 5,
			MaxProfileBytes:                 0,
		},
	)
	wav, err := audio.SilentWAV(1200)
	if err != nil {
		t.Fatalf("SilentWAV returned error: %v", err)
	}
	sourcePath := filepath.Join(t.TempDir(), "unlimited-reference.wav")
	if err := os.WriteFile(sourcePath, wav, 0o644); err != nil {
		t.Fatalf("write source wav: %v", err)
	}

	profile, err := service.CreateVoiceProfile(
		context.Background(),
		"Unlimited",
		"en",
		sourcePath,
		"unlimited-reference.wav",
		1<<34,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}
	if profile.SourceBytes != 1<<34 {
		t.Fatalf("source bytes = %d, want supplied large source size", profile.SourceBytes)
	}
}

func TestVoiceProfilePositiveMaxBytesStillRejectsOversize(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:      t.TempDir(),
			ProjectDataDir:  t.TempDir(),
			VoiceProfileDir: t.TempDir(),
			MaxProfileBytes: 4,
		},
	)

	_, err := service.CreateVoiceProfile(
		context.Background(),
		"Too Large",
		"en",
		filepath.Join(t.TempDir(), "missing.wav"),
		"missing.wav",
		5,
	)
	if !errors.Is(err, pipeline.ErrProfileTooLarge) {
		t.Fatalf("error = %v, want ErrProfileTooLarge", err)
	}
}

func TestCreateVoiceProfileSourceBuildsCandidateReference(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 70_000, 9000)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 30_000, Confidence: 0.92},
					{SpeakerID: "SPEAKER_00", StartMS: 35_000, EndMS: 70_000, Confidence: 0.9},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"interview.wav",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if ready.SourceDurationMS < 69_000 {
		t.Fatalf("source duration = %d, want original normalized duration", ready.SourceDurationMS)
	}
	if len(ready.Candidates) != 1 {
		t.Fatalf("candidate count = %d, want 1", len(ready.Candidates))
	}

	candidate := ready.Candidates[0]
	if candidate.Status != "ready" {
		t.Fatalf("candidate status = %q, want ready: %s", candidate.Status, candidate.Reason)
	}
	if candidate.ReferenceDurationMS < 20_000 || candidate.ReferenceDurationMS > 60_000 {
		t.Fatalf("reference duration = %d, want bounded 20-60s", candidate.ReferenceDurationMS)
	}
	if candidate.ReferenceDurationMS > 46_000 {
		t.Fatalf("reference duration = %d, want close to 45s target", candidate.ReferenceDurationMS)
	}
	if candidate.Score < 0.70 {
		t.Fatalf("candidate score = %f, want measurable high-quality score", candidate.Score)
	}
	if len(candidate.Spans) < 2 {
		t.Fatalf("selected span count = %d, want non-contiguous best material", len(candidate.Spans))
	}
	if candidate.PreviewAudio == "" {
		t.Fatal("candidate should expose a preview endpoint")
	}
	if ready.NormalizedPath == "" || ready.CleanedPath == "" || ready.NormalizedPath == ready.CleanedPath {
		t.Fatalf("source should preserve raw and cleaned paths, normalized=%q cleaned=%q", ready.NormalizedPath, ready.CleanedPath)
	}
	if ready.Denoise == nil || ready.Denoise.Provider != "none" {
		t.Fatalf("denoise metadata = %#v, want disabled local metadata", ready.Denoise)
	}
	rawPreview, rawContentType, err := service.GetVoiceProfileCandidatePreview(
		ready.ID,
		candidate.ID,
		"raw",
	)
	if err != nil {
		t.Fatalf("raw preview returned error: %v", err)
	}
	if rawContentType != "audio/wav" {
		t.Fatalf("raw preview content type = %q, want audio/wav", rawContentType)
	}
	if _, _, err := audio.ParsePCM16WAV(rawPreview); err != nil {
		t.Fatalf("raw preview should be valid WAV: %v", err)
	}
	cleanPreview, cleanContentType, err := service.GetVoiceProfileCandidatePreview(
		ready.ID,
		candidate.ID,
		"clean",
	)
	if err != nil {
		t.Fatalf("clean preview returned error: %v", err)
	}
	if cleanContentType != "audio/wav" {
		t.Fatalf("clean preview content type = %q, want audio/wav", cleanContentType)
	}
	if _, _, err := audio.ParsePCM16WAV(cleanPreview); err != nil {
		t.Fatalf("clean preview should be valid WAV: %v", err)
	}
	if _, err := os.Stat(candidate.ReferencePath); err != nil {
		t.Fatalf("candidate reference should exist: %v", err)
	}
}

func TestVoiceProfileSourceMaxBytesZeroMeansUnlimited(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 10_000, 9000)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 10_000, Confidence: 0.95},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"large-container.wav",
		1<<34,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	if source.SourceBytes != 1<<34 {
		t.Fatalf("source bytes = %d, want supplied large source size", source.SourceBytes)
	}
	_ = waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
}

func TestVoiceProfileSourcePositiveMaxBytesStillRejectsOversize(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:            t.TempDir(),
			ProjectDataDir:        t.TempDir(),
			VoiceProfileSourceDir: t.TempDir(),
			MaxProfileBytes:       4,
			VoiceProfileSourceAnalyzer: mockProfileSourceAnalyzer{
				result: pipeline.VoiceProfileSourceAnalysisResult{},
			},
		},
	)

	_, err := service.CreateVoiceProfileSource(
		context.Background(),
		filepath.Join(t.TempDir(), "missing.wav"),
		"missing.wav",
		5,
	)
	if !errors.Is(err, pipeline.ErrProfileTooLarge) {
		t.Fatalf("error = %v, want ErrProfileTooLarge", err)
	}
}

func TestCreateVoiceProfileSourceSkipsDenoiseForAlreadyCleanAudio(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 25_000, 9000)
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:                         3,
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileSourceAnalyzer: mockProfileSourceAnalyzer{
				result: pipeline.VoiceProfileSourceAnalysisResult{
					ModelVersion: "mock-diarizer",
					Spans: []pipeline.DetectedSpeakerSpan{
						{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 25_000, Confidence: 0.94},
					},
				},
			},
			VoiceProfileDenoiseProvider: "ffmpeg",
			VoiceProfileDenoiseStrength: "balanced",
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "clean.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if ready.Denoise == nil {
		t.Fatal("expected denoise metadata")
	}
	if ready.Denoise.Applied {
		t.Fatalf("denoise applied = true, want fast-path skip for clean audio: %#v", ready.Denoise)
	}
	if !strings.Contains(ready.Denoise.Reason, "skipped denoise") {
		t.Fatalf("denoise reason = %q, want skip explanation", ready.Denoise.Reason)
	}
}

func TestVoiceProfileSourceDiagnosticsUsesLocalModelPathWithoutToken(t *testing.T) {
	t.Parallel()

	localModelPath := t.TempDir()
	fakePython := filepath.Join(t.TempDir(), "fake-python")
	if err := os.WriteFile(
		fakePython,
		[]byte("#!/bin/sh\nprintf '%s\\n' '{\"modelVersion\":\"local-mock\",\"spans\":[{\"speakerId\":\"SPEAKER_00\",\"startMs\":0,\"endMs\":25000,\"confidence\":0.96}]}'\n"),
		0o755,
	); err != nil {
		t.Fatalf("write fake analyzer: %v", err)
	}

	sourcePath := writeToneWAV(t, 25_000, 9000)
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileDiarizationModelPath:   localModelPath,
			VoiceProfileAnalysisPythonPath:     fakePython,
			VoiceProfileAnalysisScriptPath:     "ignored.py",
			VoiceProfileDenoiseProvider:        "none",
		},
	)

	diagnostics := service.GetVoiceProfileSourceDiagnostics()
	if diagnostics.Mode != "local" {
		t.Fatalf("diagnostics mode = %q, want local", diagnostics.Mode)
	}
	if diagnostics.TokenConfigured {
		t.Fatal("token should not be required when local model path exists")
	}
	if !diagnostics.LocalModelAvailable {
		t.Fatal("local model path should be reported as available")
	}

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"local-speaker.wav",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if len(ready.Candidates) != 1 || ready.Candidates[0].Status != "ready" {
		t.Fatalf("ready candidates = %#v, want one local-analysis candidate", ready.Candidates)
	}
}

func TestCreateVoiceProfileSourceFailsClearlyWithoutDiarizationConfig(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 25_000, 8000)
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileAnalysisPythonPath:     "python3",
			VoiceProfileAnalysisScriptPath:     "./scripts/profile_analyze.py",
			VoiceProfileDenoiseProvider:        "none",
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"single-speaker.wav",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	sourceJSON, err := json.Marshal(source)
	if err != nil {
		t.Fatalf("marshal source: %v", err)
	}
	if !strings.Contains(string(sourceJSON), `"candidates":[]`) {
		t.Fatalf("queued source candidates JSON = %s, want empty array", string(sourceJSON))
	}

	failed := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusFailed)
	if !strings.Contains(failed.Error, "PYANNOTE_AUTH_TOKEN") {
		t.Fatalf("error = %q, want clear pyannote token setup message", failed.Error)
	}
}

func TestCreateVoiceProfileSourceRanksShortHighQualityCandidateAndRejectsWeakVoice(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 17_000, 9500)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 12_000, Confidence: 0.98},
					{SpeakerID: "SPEAKER_01", StartMS: 13_000, EndMS: 17_000, Confidence: 0.62},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "Ozzy_Osbourne.mp4", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if len(ready.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want two detected speakers", len(ready.Candidates))
	}
	best := ready.Candidates[0]
	if best.SpeakerID != "SPEAKER_00" || best.Status != "ready" {
		t.Fatalf("best candidate = %#v, want SPEAKER_00 ready", best)
	}
	if !best.Recommended {
		t.Fatal("best viable short reference should be recommended")
	}
	if best.Suitability != "short_reference" {
		t.Fatalf("best suitability = %q, want short_reference", best.Suitability)
	}
	if best.ReferenceDurationMS < 8_000 || best.ReferenceDurationMS >= 20_000 {
		t.Fatalf("reference duration = %d, want dynamic 8-20s short reference", best.ReferenceDurationMS)
	}
	if len(best.Warnings) == 0 {
		t.Fatal("short reference candidate should include a warning")
	}
	weak := ready.Candidates[1]
	if weak.SpeakerID != "SPEAKER_01" || weak.Status != "rejected" {
		t.Fatalf("weak candidate = %#v, want SPEAKER_01 rejected", weak)
	}
}

func TestCreateVoiceProfileSourceStitchesCleanMaterialAroundOverlap(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 10_000, 9500)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 10_000, Confidence: 0.96},
					{SpeakerID: "SPEAKER_01", StartMS: 2_000, EndMS: 3_000, Confidence: 0.78},
					{SpeakerID: "SPEAKER_01", StartMS: 7_000, EndMS: 8_000, Confidence: 0.78},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "overlap.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	best := ready.Candidates[0]
	if best.SpeakerID != "SPEAKER_00" || best.Status != "ready" {
		t.Fatalf("best candidate = %#v, want clean parts of SPEAKER_00 ready", best)
	}
	if len(best.Spans) != 3 {
		t.Fatalf("selected span count = %d, want three non-overlap spans", len(best.Spans))
	}
	if best.ReferenceDurationMS < 7_500 || best.ReferenceDurationMS > 8_500 {
		t.Fatalf("reference duration = %d, want overlap removed from 10s source", best.ReferenceDurationMS)
	}
	if !strings.Contains(strings.Join(best.Warnings, " "), "Stitched 3 clean same-speaker spans") {
		t.Fatalf("warnings = %#v, want stitched-span explanation", best.Warnings)
	}
	weak := ready.Candidates[1]
	if weak.SpeakerID != "SPEAKER_01" || weak.Status != "rejected" {
		t.Fatalf("weak candidate = %#v, want short overlapped speaker rejected", weak)
	}
}

func TestCreateVoiceProfileSourceAcceptsVeryShortSourceBestSpeaker(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 17_000, 9500)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 3_000, EndMS: 4_500, Confidence: 0.85},
					{SpeakerID: "SPEAKER_00", StartMS: 15_000, EndMS: 17_000, Confidence: 0.85},
					{SpeakerID: "SPEAKER_01", StartMS: 300, EndMS: 3_000, Confidence: 0.85},
					{SpeakerID: "SPEAKER_01", StartMS: 7_200, EndMS: 8_300, Confidence: 0.85},
					{SpeakerID: "SPEAKER_01", StartMS: 10_100, EndMS: 13_800, Confidence: 0.85},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(
		context.Background(),
		sourcePath,
		"Ozzy_Osbourne.mp4",
		0,
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if len(ready.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want two detected speakers", len(ready.Candidates))
	}
	best := ready.Candidates[0]
	if best.SpeakerID != "SPEAKER_01" || best.Status != "ready" {
		t.Fatalf("best candidate = %#v, want short SPEAKER_01 ready", best)
	}
	if !best.Recommended || best.Suitability != "short_reference" {
		t.Fatalf(
			"best recommendation = (%v, %q), want recommended short_reference",
			best.Recommended,
			best.Suitability,
		)
	}
	if best.ReferenceDurationMS < 6_000 || best.ReferenceDurationMS >= 20_000 {
		t.Fatalf("reference duration = %d, want dynamic short source reference", best.ReferenceDurationMS)
	}
	weak := ready.Candidates[1]
	if weak.SpeakerID != "SPEAKER_00" || weak.Status != "rejected" {
		t.Fatalf("weak candidate = %#v, want SPEAKER_00 rejected", weak)
	}
}

func TestCreateVoiceProfileSourceReturnsMultipleSpeakers(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 60_000, 9500)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 25_000, Confidence: 0.88},
					{SpeakerID: "SPEAKER_01", StartMS: 30_000, EndMS: 56_000, Confidence: 0.91},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "panel.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	if len(ready.Candidates) != 2 {
		t.Fatalf("candidate count = %d, want 2 speakers", len(ready.Candidates))
	}
	for _, candidate := range ready.Candidates {
		if candidate.Status != "ready" {
			t.Fatalf("candidate %s status = %q, want ready", candidate.ID, candidate.Status)
		}
	}
}

func TestCreateVoiceProfileSourceRejectsSilentMaterial(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 25_000, 0)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 25_000, Confidence: 0.9},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "silent.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}

	failed := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusFailed)
	if !strings.Contains(failed.Error, "no usable speaker candidates") {
		t.Fatalf("error = %q, want no usable candidates", failed.Error)
	}
}

func TestCreateVoiceProfileFromCandidateCopiesCompatibleReference(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 30_000, 10_000)
	service := newProfileSourceService(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 30_000, Confidence: 0.94},
				},
			},
		},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "narrator.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	candidate := ready.Candidates[0]

	profile, err := service.CreateVoiceProfileFromCandidate(
		context.Background(),
		ready.ID,
		candidate.ID,
		"Narrator",
		"en",
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileFromCandidate returned error: %v", err)
	}

	if profile.SourceID != ready.ID {
		t.Fatalf("profile sourceId = %q, want %q", profile.SourceID, ready.ID)
	}
	if profile.SpeakerID != "SPEAKER_00" {
		t.Fatalf("profile speakerId = %q, want SPEAKER_00", profile.SpeakerID)
	}
	if profile.ReferencePath == "" {
		t.Fatal("profile should keep a reference path")
	}
	if _, err := os.Stat(profile.ReferencePath); err != nil {
		t.Fatalf("profile reference should exist: %v", err)
	}
	if profile.ReferenceDurationMS < 20_000 || profile.ReferenceDurationMS > 60_000 {
		t.Fatalf("profile reference duration = %d, want bounded candidate reference", profile.ReferenceDurationMS)
	}
	if profile.QualityMetrics == nil || profile.QualityMetrics.CleanSpeech <= 0 {
		t.Fatalf("profile quality metrics should be copied, got %#v", profile.QualityMetrics)
	}
	if profile.Denoise == nil || profile.Denoise.Provider != "none" {
		t.Fatalf("profile denoise metadata = %#v, want copied candidate denoise metadata", profile.Denoise)
	}
	if profile.Likeness == nil || profile.Likeness.Status != "pending" {
		t.Fatalf("profile likeness = %#v, want pending when reference synthesis is unavailable", profile.Likeness)
	}
}

func TestCreateVoiceProfileFromCandidateStoresScoredLikeness(t *testing.T) {
	t.Parallel()

	sourcePath := writeToneWAV(t, 30_000, 10_000)
	service := newProfileSourceServiceWithTTS(
		t,
		mockProfileSourceAnalyzer{
			result: pipeline.VoiceProfileSourceAnalysisResult{
				ModelVersion: "mock-diarizer",
				Spans: []pipeline.DetectedSpeakerSpan{
					{SpeakerID: "SPEAKER_00", StartMS: 0, EndMS: 30_000, Confidence: 0.94},
				},
			},
		},
		mockReferenceTTS{},
		mockLikenessScorer{score: 0.87},
	)

	source, err := service.CreateVoiceProfileSource(context.Background(), sourcePath, "narrator.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfileSource returned error: %v", err)
	}
	ready := waitForProfileSource(t, service, source.ID, pipeline.VoiceProfileSourceStatusReady)
	profile, err := service.CreateVoiceProfileFromCandidate(
		context.Background(),
		ready.ID,
		ready.Candidates[0].ID,
		"Narrator",
		"en",
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileFromCandidate returned error: %v", err)
	}

	if profile.Likeness == nil || profile.Likeness.Status != "ready" {
		t.Fatalf("profile likeness = %#v, want ready", profile.Likeness)
	}
	if profile.Likeness.Score < 0.86 {
		t.Fatalf("profile likeness score = %f, want scorer value", profile.Likeness.Score)
	}
}

func TestCreateVoiceProfileWithOptionsDefaultsToKokoroCloneTarget(t *testing.T) {
	t.Parallel()

	service := newVoiceProfileTargetService(t, nil)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}
	target := profile.CloneTargets[pipeline.VoiceProfileTargetKokoroClone]
	if !target.Selected || target.Status != pipeline.VoiceProfileTargetStatusQueued {
		t.Fatalf("kokoro clone target = %+v, want selected queued", target)
	}

	ready := waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroClone, pipeline.VoiceProfileTargetStatusReady)
	validation := ready.CloneTargets[pipeline.VoiceProfileTargetKokoroClone].Validation
	if validation == nil || validation.Score <= 0 || validation.TranscriptSimilarity <= 0 {
		t.Fatalf("validation = %+v, want stored comparison scores", validation)
	}
}

func TestCreateVoiceProfileWithOptionsQueuesMultipleTargets(t *testing.T) {
	t.Parallel()

	missingRoot := filepath.Join(t.TempDir(), "missing-upstream")
	service := newVoiceProfileTargetService(t, []pipeline.ResearchModuleConfig{
		{
			ID:        pipeline.ResearchModuleKokoroEmbed,
			Label:     "Kokoro Embed",
			RepoURL:   "https://example.invalid/kokoro.embed.git",
			Ref:       "main",
			LocalPath: filepath.Join(missingRoot, "kokoro.embed"),
			EngineID:  pipeline.TTSEngineKokoroEmbed,
		},
		{
			ID:        pipeline.ResearchModuleSupertonicEmbed,
			Label:     "Supertonic Embed",
			RepoURL:   "https://example.invalid/supertonic.embed.git",
			Ref:       "main",
			LocalPath: filepath.Join(missingRoot, "supertonic.embed"),
			EngineID:  pipeline.TTSEngineSupertonic,
		},
	})
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{
			Targets: []string{
				pipeline.VoiceProfileTargetKokoroClone,
				pipeline.VoiceProfileTargetKokoroEmbed,
				pipeline.VoiceProfileTargetSupertonicEmbed,
			},
		},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}
	for _, targetID := range []string{
		pipeline.VoiceProfileTargetKokoroClone,
		pipeline.VoiceProfileTargetKokoroEmbed,
		pipeline.VoiceProfileTargetSupertonicEmbed,
	} {
		if target := profile.CloneTargets[targetID]; target.Status != pipeline.VoiceProfileTargetStatusQueued {
			t.Fatalf("target %s = %+v, want queued in immediate response", targetID, target)
		}
	}

	waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroClone, pipeline.VoiceProfileTargetStatusReady)
	waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroEmbed, pipeline.VoiceProfileTargetStatusFailed)
	waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetSupertonicEmbed, pipeline.VoiceProfileTargetStatusFailed)
}

func TestVoiceProfileTargetValidationPersistsAcrossReload(t *testing.T) {
	t.Parallel()

	options := voiceProfileTargetOptions(t, nil)
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{Targets: []string{pipeline.VoiceProfileTargetKokoroClone}},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}
	ready := waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroClone, pipeline.VoiceProfileTargetStatusReady)
	validation := ready.CloneTargets[pipeline.VoiceProfileTargetKokoroClone].Validation
	if validation == nil || validation.SpeakerSimilarity < 0.86 || validation.Provider == "" {
		t.Fatalf("validation = %+v, want speaker and transcript metadata", validation)
	}

	reloadedService := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	reloaded, err := reloadedService.GetVoiceProfile(profile.ID)
	if err != nil {
		t.Fatalf("GetVoiceProfile returned error after reload: %v", err)
	}
	reloadedValidation := reloaded.CloneTargets[pipeline.VoiceProfileTargetKokoroClone].Validation
	if reloadedValidation == nil || reloadedValidation.Score != validation.Score {
		t.Fatalf("reloaded validation = %+v, want persisted score %f", reloadedValidation, validation.Score)
	}
}

func TestVoiceProfileTargetStaysReadyWhenSpeakerValidationIsGated(t *testing.T) {
	t.Parallel()

	options := voiceProfileTargetOptions(t, nil)
	options.VoiceProfileLikenessScorer = mockLikenessScorer{err: errors.New("gated speaker embedding")}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{Targets: []string{pipeline.VoiceProfileTargetKokoroClone}},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}
	ready := waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroClone, pipeline.VoiceProfileTargetStatusReady)
	target := ready.CloneTargets[pipeline.VoiceProfileTargetKokoroClone]
	if target.Validation == nil || target.Validation.Status != pipeline.VoiceProfileTargetStatusFailed {
		t.Fatalf("validation = %+v, want failed validation metadata", target.Validation)
	}
	if !strings.Contains(target.Validation.Error, "gated speaker embedding") {
		t.Fatalf("validation error = %q, want gated scorer detail", target.Validation.Error)
	}

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:           "Render even when the optional likeness scorer is gated.",
		VoiceProfileID: profile.ID,
		TTSEngine:      pipeline.TTSEngineKokoro,
	})
	if err != nil {
		t.Fatalf("CreateJob should allow ready target with validation warning: %v", err)
	}
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestVoiceProfileTargetSkipsGatedSpeakerValidationWithoutToken(t *testing.T) {
	t.Parallel()

	options := voiceProfileTargetOptions(t, nil)
	options.VoiceProfileDiarizationToken = ""
	options.VoiceProfileLikenessScorer = mockLikenessScorer{err: errors.New("scorer should not be called")}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{Targets: []string{pipeline.VoiceProfileTargetKokoroClone}},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}
	ready := waitForVoiceProfileTarget(t, service, profile.ID, pipeline.VoiceProfileTargetKokoroClone, pipeline.VoiceProfileTargetStatusReady)
	validation := ready.CloneTargets[pipeline.VoiceProfileTargetKokoroClone].Validation
	if validation == nil || validation.Status != pipeline.VoiceProfileTargetStatusFailed {
		t.Fatalf("validation = %+v, want failed validation warning", validation)
	}
	if !strings.Contains(validation.Error, "needs access to pyannote/embedding") {
		t.Fatalf("validation error = %q, want gated setup warning", validation.Error)
	}
	if strings.Contains(validation.Error, "scorer should not be called") {
		t.Fatalf("validation error = %q, scorer should have been skipped", validation.Error)
	}
}

func TestCreateJobRequiresSelectedVoiceProfileTarget(t *testing.T) {
	t.Parallel()

	autoValidate := false
	service := newVoiceProfileTargetService(t, nil)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfileWithOptions(
		context.Background(),
		"Narrator",
		"en",
		sourcePath,
		"source.wav",
		0,
		pipeline.VoiceProfileCreationOptions{
			Targets:      []string{pipeline.VoiceProfileTargetKokoroEmbed},
			AutoValidate: &autoValidate,
		},
	)
	if err != nil {
		t.Fatalf("CreateVoiceProfileWithOptions returned error: %v", err)
	}

	_, err = service.CreateJob(context.Background(), pipeline.CreateJobRequest{
		Text:           "Render through a target that was not prepared.",
		VoiceProfileID: profile.ID,
		TTSEngine:      pipeline.TTSEngineKokoro,
	})
	if !errors.Is(err, pipeline.ErrProfileArtifactMissing) {
		t.Fatalf("CreateJob error = %v, want ErrProfileArtifactMissing", err)
	}
}

func TestResearchModuleDiagnosticsReportsInstalledUpstream(t *testing.T) {
	t.Parallel()

	upstreamDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(upstreamDir, "optimize_style.py"), []byte("# test\n"), 0o644); err != nil {
		t.Fatalf("write fake optimizer: %v", err)
	}
	fakePython := filepath.Join(t.TempDir(), "fake-python")
	if err := os.WriteFile(fakePython, []byte("#!/bin/sh\nexit 0\n"), 0o755); err != nil {
		t.Fatalf("write fake python: %v", err)
	}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:      t.TempDir(),
			ProjectDataDir:  t.TempDir(),
			VoiceProfileDir: t.TempDir(),
			ResearchModules: []pipeline.ResearchModuleConfig{
				{
					ID:        pipeline.ResearchModuleSupertonicEmbed,
					Label:     "Supertonic Embed",
					RepoURL:   "https://example.invalid/supertonic.embed.git",
					Ref:       "main",
					LocalPath: upstreamDir,
					EngineID:  pipeline.TTSEngineSupertonic,
				},
			},
			VoiceProfileArtifactPythonPath: fakePython,
		},
	)

	modules := service.ListResearchModules()
	if len(modules) != 1 {
		t.Fatalf("module count = %d, want 1", len(modules))
	}
	if !modules[0].Installed || modules[0].Status != "ready" {
		t.Fatalf("module diagnostics = %+v, want installed ready", modules[0])
	}
	if modules[0].CloneAllowed {
		t.Fatalf("cloneAllowed = true, want false for installed module")
	}
	if !filepath.IsAbs(modules[0].LocalPath) {
		t.Fatalf("local path = %q, want absolute path", modules[0].LocalPath)
	}
}

func TestResearchModuleDiagnosticsReportsMissingVoiceEmbedRuntimeDependencies(t *testing.T) {
	t.Parallel()

	upstreamDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(upstreamDir, "optimize_style.py"), []byte("# test\n"), 0o644); err != nil {
		t.Fatalf("write fake optimizer: %v", err)
	}
	fakePython := filepath.Join(t.TempDir(), "fake-python")
	if err := os.WriteFile(fakePython, []byte("#!/bin/sh\nprintf 'numpy\\n'\nexit 1\n"), 0o755); err != nil {
		t.Fatalf("write fake python: %v", err)
	}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			JobDataDir:      t.TempDir(),
			ProjectDataDir:  t.TempDir(),
			VoiceProfileDir: t.TempDir(),
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
			VoiceProfileArtifactPythonPath: fakePython,
		},
	)

	modules := service.ListResearchModules()
	if len(modules) != 1 {
		t.Fatalf("module count = %d, want 1", len(modules))
	}
	if !modules[0].Installed || modules[0].Status != "setup-needed" || modules[0].RuntimeReady {
		t.Fatalf("module diagnostics = %+v, want installed module with runtime setup needed", modules[0])
	}
	if len(modules[0].MissingDependencies) != 1 || modules[0].MissingDependencies[0] != "numpy" {
		t.Fatalf("missing dependencies = %#v, want numpy", modules[0].MissingDependencies)
	}
	if !strings.Contains(modules[0].SetupCommand, "mise setup:voice-embed") {
		t.Fatalf("setup command = %q, want voice embed setup command", modules[0].SetupCommand)
	}
}

func TestBuildVoiceProfileArtifactPersistsFakeOutput(t *testing.T) {
	t.Setenv("VOICE_EMBED_FAKE_ARTIFACT", "1")

	upstreamDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(upstreamDir, "optimize_style.py"), []byte("# test\n"), 0o644); err != nil {
		t.Fatalf("write fake optimizer: %v", err)
	}
	artifactScript, err := filepath.Abs("../../scripts/profile_embed_artifact.py")
	if err != nil {
		t.Fatalf("resolve artifact script: %v", err)
	}
	profileDir := t.TempDir()
	options := pipeline.Options{
		JobDataDir:                         t.TempDir(),
		ProjectDataDir:                     t.TempDir(),
		VoiceProfileDir:                    profileDir,
		VoiceProfileReferenceMinSeconds:    20,
		VoiceProfileReferenceTargetSeconds: 45,
		VoiceProfileReferenceMaxSeconds:    60,
		VoiceProfileDenoiseProvider:        "none",
		VoiceProfileLikenessScorer:         mockLikenessScorer{score: 0.8},
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
	}
	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	sourcePath := writeToneWAV(t, 25_000, 9000)
	profile, err := service.CreateVoiceProfile(context.Background(), "Narrator", "en", sourcePath, "source.wav", 0)
	if err != nil {
		t.Fatalf("CreateVoiceProfile returned error: %v", err)
	}

	built, err := service.BuildVoiceProfileArtifact(context.Background(), profile.ID, pipeline.ResearchModuleKokoroEmbed)
	if err != nil {
		t.Fatalf("BuildVoiceProfileArtifact returned error: %v", err)
	}
	artifact := built.CloneArtifacts[pipeline.ResearchModuleKokoroEmbed]
	if artifact.Status != pipeline.VoiceProfileCloneArtifactStatusReady {
		t.Fatalf("artifact status = %q, want ready", artifact.Status)
	}
	if artifact.EngineID != pipeline.TTSEngineKokoroEmbed {
		t.Fatalf("artifact engine = %q, want kokoro-embed", artifact.EngineID)
	}
	if _, err := os.Stat(artifact.Path); err != nil {
		t.Fatalf("artifact path missing: %v", err)
	}

	reloadedService := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
	reloaded, err := reloadedService.GetVoiceProfile(profile.ID)
	if err != nil {
		t.Fatalf("GetVoiceProfile returned error after reload: %v", err)
	}
	if reloaded.CloneArtifacts[pipeline.ResearchModuleKokoroEmbed].Status != pipeline.VoiceProfileCloneArtifactStatusReady {
		t.Fatalf("reloaded artifacts = %+v, want ready kokoro embed", reloaded.CloneArtifacts)
	}
}

func TestCreateJobPublishesSegmentTelemetry(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, SegmentMaxRunes: 18, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(
		context.Background(),
		pipeline.CreateJobRequest{Text: "first short sentence. second short sentence."},
	)
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if len(completed.Segments) == 0 {
		t.Fatal("completed job should expose segments")
	}
	for _, segment := range completed.Segments {
		if segment.Status != "ready" {
			t.Fatalf("segment %d status = %q, want ready", segment.Index, segment.Status)
		}
		if segment.Attempts <= 0 {
			t.Fatalf("segment %d attempts = %d, want positive", segment.Index, segment.Attempts)
		}
		if segment.DurationMS <= 0 {
			t.Fatalf("segment %d duration = %d, want positive", segment.Index, segment.DurationMS)
		}
		if segment.LatencyMS < 0 {
			t.Fatalf("segment %d latency = %d, want non-negative", segment.Index, segment.LatencyMS)
		}
		if segment.Similarity <= 0 {
			t.Fatalf("segment %d similarity = %f, want positive", segment.Index, segment.Similarity)
		}
	}
}

func TestNewServiceStudioDefaultsAutoTuneThroughput(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:       320,
			SegmentWorkers:        2,
			StudioSegmentWorkers:  0,
			StudioSegmentMaxRunes: 0,
			JobDataDir:            t.TempDir(),
			ProjectDataDir:        t.TempDir(),
		},
	)

	options := service.Options()
	if options.SegmentWorkers != 2 {
		t.Fatalf("segmentWorkers = %d, want %d", options.SegmentWorkers, 2)
	}
	if options.StudioSegmentWorkers != 4 {
		t.Fatalf("studio segmentWorkers = %d, want %d", options.StudioSegmentWorkers, 4)
	}
	if options.StudioSegmentMaxRunes != 220 {
		t.Fatalf("studio segment max runes = %d, want %d", options.StudioSegmentMaxRunes, 220)
	}
	if options.StudioSegmentWorkersAdaptive != 6 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 6)
	}
	if options.StudioSegmentMaxRunesAdaptive != 180 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 180)
	}
	if options.SourcePrepSentenceMaxRunes != 420 {
		t.Fatalf("source prep sentence max runes = %d, want %d", options.SourcePrepSentenceMaxRunes, 420)
	}
}

func TestNewServiceStudioDefaultsAllowExplicitOverride(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:       320,
			SegmentWorkers:        2,
			StudioSegmentWorkers:  2,
			StudioSegmentMaxRunes: 300,
			JobDataDir:            t.TempDir(),
			ProjectDataDir:        t.TempDir(),
		},
	)

	options := service.Options()
	if options.StudioSegmentWorkers != 2 {
		t.Fatalf("studio segmentWorkers = %d, want %d", options.StudioSegmentWorkers, 2)
	}
	if options.StudioSegmentMaxRunes != 300 {
		t.Fatalf("studio segment max runes = %d, want %d", options.StudioSegmentMaxRunes, 300)
	}
	if options.StudioSegmentWorkersAdaptive != 4 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 4)
	}
	if options.StudioSegmentMaxRunesAdaptive != 180 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 180)
	}
	if options.SourcePrepSentenceMaxRunes != 420 {
		t.Fatalf("source prep sentence max runes = %d, want %d", options.SourcePrepSentenceMaxRunes, 420)
	}
}

func TestNewServiceAdaptiveStudioOverrides(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			SegmentMaxRunes:               320,
			SegmentWorkers:                2,
			StudioSegmentWorkers:          2,
			StudioSegmentMaxRunes:         300,
			StudioSegmentWorkersAdaptive:  5,
			StudioSegmentMaxRunesAdaptive: 140,
			JobDataDir:                    t.TempDir(),
			ProjectDataDir:                t.TempDir(),
		},
	)

	options := service.Options()
	if options.StudioSegmentWorkersAdaptive != 5 {
		t.Fatalf("studio adaptive segmentWorkers = %d, want %d", options.StudioSegmentWorkersAdaptive, 5)
	}
	if options.StudioSegmentMaxRunesAdaptive != 140 {
		t.Fatalf("studio adaptive segment max runes = %d, want %d", options.StudioSegmentMaxRunesAdaptive, 140)
	}
}

func TestCreateJobRetriesCleanCutoff(t *testing.T) {
	t.Parallel()

	checker := &cutoffChecker{}
	service := newMockService(t, checker)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", completed.Retries.Attempts)
	}
	if !completed.VoiceCheck.Complete {
		t.Fatal("voice check should be complete")
	}
	if checker.calls != 2 {
		t.Fatalf("checker calls = %d, want 2", checker.calls)
	}
}

func TestCreateJobRetriesRejectedSegmentFromStart(t *testing.T) {
	t.Parallel()

	checker := &retryRejectedChecker{}
	service := newMockService(t, checker)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	completed := waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
	if completed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", completed.Retries.Attempts)
	}
	if !completed.VoiceCheck.Complete {
		t.Fatal("voice check should be complete")
	}
	if checker.calls != 2 {
		t.Fatalf("checker calls = %d, want 2", checker.calls)
	}
}

func TestCreateJobMarksCheckerFailedWhenRetryLimitExhausts(t *testing.T) {
	t.Parallel()

	service := pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		&alwaysRejectChecker{},
		pipeline.Options{MaxRetries: 2, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "first sentence. second sentence."})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	failed := waitForFailedJob(t, service, job.ID)
	if failed.Stages.Checker != pipeline.StageStatusFailed {
		t.Fatalf("checker stage = %q, want %q", failed.Stages.Checker, pipeline.StageStatusFailed)
	}
	if failed.Stages.Synthesis != pipeline.StageStatusDone {
		t.Fatalf("synthesis stage = %q, want %q", failed.Stages.Synthesis, pipeline.StageStatusDone)
	}
	if failed.Retries.Attempts != 2 {
		t.Fatalf("attempts = %d, want 2", failed.Retries.Attempts)
	}
}

func TestCreateJobExposesStreamingOptimizationPreview(t *testing.T) {
	t.Parallel()

	optimizer := &slowStreamingOptimizer{
		firstDelta: make(chan struct{}),
		release:    make(chan struct{}),
	}
	released := false
	defer func() {
		if !released {
			close(optimizer.release)
		}
	}()

	service := pipeline.NewService(
		optimizer,
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{MaxRetries: 3, JobDataDir: t.TempDir(), ProjectDataDir: t.TempDir()},
	)

	job, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "source text"})
	if err != nil {
		t.Fatalf("CreateJob returned error: %v", err)
	}

	select {
	case <-optimizer.firstDelta:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first streamed optimizer delta")
	}

	current, err := service.GetJob(job.ID)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	if current.OptimizedText != "streamed" {
		t.Fatalf("optimized preview = %q, want streamed partial text", current.OptimizedText)
	}

	close(optimizer.release)
	released = true
	waitForJob(t, service, job.ID, pipeline.JobStatusCompleted)
}

func TestCreateJobRejectsEmptyText(t *testing.T) {
	t.Parallel()

	service := newMockService(t, agents.NewMockVoiceCheckerAgent())

	_, err := service.CreateJob(context.Background(), pipeline.CreateJobRequest{Text: "   "})
	if err == nil {
		t.Fatal("CreateJob should reject empty text")
	}
}

type slowStreamingOptimizer struct {
	firstDelta chan struct{}
	release    chan struct{}
}

type mockProfileSourceAnalyzer struct {
	result pipeline.VoiceProfileSourceAnalysisResult
	err    error
}

func (analyzer mockProfileSourceAnalyzer) AnalyzeVoiceProfileSource(
	_ context.Context,
	_ pipeline.VoiceProfileSourceAnalysisRequest,
) (pipeline.VoiceProfileSourceAnalysisResult, error) {
	if analyzer.err != nil {
		return pipeline.VoiceProfileSourceAnalysisResult{}, analyzer.err
	}
	return analyzer.result, nil
}

type mockLikenessScorer struct {
	score float64
	err   error
}

func (scorer mockLikenessScorer) ScoreVoiceProfileLikeness(
	_ context.Context,
	_ pipeline.VoiceProfileLikenessRequest,
) (pipeline.VoiceProfileLikenessResult, error) {
	if scorer.err != nil {
		return pipeline.VoiceProfileLikenessResult{}, scorer.err
	}
	return pipeline.VoiceProfileLikenessResult{
		Score:             scorer.score,
		SpeakerSimilarity: scorer.score,
		EmbeddingModel:    "mock-embedding",
		Reason:            "mock speaker similarity",
	}, nil
}

type mockReferenceTTS struct{}

func (mockReferenceTTS) Synthesize(_ context.Context, text string) (agents.TTSResult, error) {
	wav, err := audio.SilentWAV(audio.DurationForText(text))
	if err != nil {
		return agents.TTSResult{}, err
	}
	return agents.TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  audio.DurationForText(text),
		Provider:    "mock",
		Voice:       "default",
	}, nil
}

func (mockReferenceTTS) SynthesizeWithReference(
	_ context.Context,
	text string,
	_ string,
	_ string,
) (agents.TTSResult, error) {
	wav, err := audio.SilentWAV(audio.DurationForText(text))
	if err != nil {
		return agents.TTSResult{}, err
	}
	return agents.TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  audio.DurationForText(text),
		Provider:    "mock-reference",
		Voice:       "clone",
	}, nil
}

type recordingTTSAgent struct {
	mu    sync.Mutex
	plain []string
	ssml  []string
}

func (agent *recordingTTSAgent) Synthesize(_ context.Context, text string) (agents.TTSResult, error) {
	agent.mu.Lock()
	agent.plain = append(agent.plain, text)
	agent.mu.Unlock()
	return silentTTSResult(text, "recording-plain")
}

func (agent *recordingTTSAgent) SynthesizeSSML(
	_ context.Context,
	ssmlText string,
	plainText string,
	_ string,
	_ string,
) (agents.TTSResult, error) {
	agent.mu.Lock()
	agent.ssml = append(agent.ssml, ssmlText)
	agent.mu.Unlock()
	return silentTTSResult(plainText, "recording-ssml")
}

func (agent *recordingTTSAgent) plainCalls() []string {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return append([]string(nil), agent.plain...)
}

func (agent *recordingTTSAgent) ssmlCalls() []string {
	agent.mu.Lock()
	defer agent.mu.Unlock()
	return append([]string(nil), agent.ssml...)
}

func silentTTSResult(text string, provider string) (agents.TTSResult, error) {
	wav, err := audio.SilentWAV(audio.DurationForText(text))
	if err != nil {
		return agents.TTSResult{}, err
	}
	return agents.TTSResult{
		Audio:       wav,
		ContentType: "audio/wav",
		DurationMS:  audio.DurationForText(text),
		Provider:    provider,
		Voice:       "default",
	}, nil
}

func newProfileSourceService(
	t *testing.T,
	analyzer pipeline.VoiceProfileSourceAnalyzer,
) *pipeline.Service {
	t.Helper()

	return newProfileSourceServiceWithTTS(
		t,
		analyzer,
		agents.NewMockTTSAgent(),
		nil,
	)
}

func newProfileSourceServiceWithTTS(
	t *testing.T,
	analyzer pipeline.VoiceProfileSourceAnalyzer,
	tts pipeline.TTSAgent,
	likenessScorer pipeline.VoiceProfileLikenessScorer,
) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		tts,
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:                         3,
			JobDataDir:                         t.TempDir(),
			ProjectDataDir:                     t.TempDir(),
			VoiceProfileDir:                    t.TempDir(),
			VoiceProfileSourceDir:              t.TempDir(),
			VoiceProfileReferenceMinSeconds:    20,
			VoiceProfileReferenceTargetSeconds: 45,
			VoiceProfileReferenceMaxSeconds:    60,
			VoiceProfileSourceAnalyzer:         analyzer,
			VoiceProfileDenoiseProvider:        "none",
			VoiceProfileDiarizationToken:       "test-token",
			VoiceProfileLikenessScorer:         likenessScorer,
		},
	)
}

func newVoiceProfileTargetService(
	t *testing.T,
	researchModules []pipeline.ResearchModuleConfig,
) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		mockReferenceTTS{},
		agents.NewMockVoiceCheckerAgent(),
		voiceProfileTargetOptions(t, researchModules),
	)
}

func voiceProfileTargetOptions(
	t *testing.T,
	researchModules []pipeline.ResearchModuleConfig,
) pipeline.Options {
	t.Helper()

	return pipeline.Options{
		MaxRetries:                         3,
		JobDataDir:                         t.TempDir(),
		ProjectDataDir:                     t.TempDir(),
		VoiceProfileDir:                    t.TempDir(),
		VoiceProfileReferenceMinSeconds:    20,
		VoiceProfileReferenceTargetSeconds: 45,
		VoiceProfileReferenceMaxSeconds:    60,
		VoiceProfileDenoiseProvider:        "none",
		VoiceProfileDiarizationToken:       "test-token",
		VoiceProfileLikenessScorer:         mockLikenessScorer{score: 0.87},
		ResearchModules:                    researchModules,
	}
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

func waitForVoiceProfileTarget(
	t *testing.T,
	service *pipeline.Service,
	profileID string,
	targetID string,
	status pipeline.VoiceProfileTargetStatus,
) pipeline.VoiceProfile {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		profile, err := service.GetVoiceProfile(profileID)
		if err != nil {
			t.Fatalf("GetVoiceProfile returned error: %v", err)
		}
		target := profile.CloneTargets[targetID]
		if target.Status == status {
			return profile
		}
		if target.Status == pipeline.VoiceProfileTargetStatusFailed && status != target.Status {
			t.Fatalf("target %s failed unexpectedly: %s", targetID, target.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	profile, err := service.GetVoiceProfile(profileID)
	if err != nil {
		t.Fatalf("GetVoiceProfile returned error: %v", err)
	}
	t.Fatalf("timed out waiting for target %s status %q, got %+v", targetID, status, profile.CloneTargets[targetID])
	return pipeline.VoiceProfile{}
}

func waitForProfileSource(
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

func (optimizer *slowStreamingOptimizer) Optimize(_ context.Context, _ string) (string, error) {
	return "streamed final text", nil
}

func (optimizer *slowStreamingOptimizer) OptimizeStream(_ context.Context, _ string, onDelta func(string)) (string, error) {
	onDelta("streamed ")
	close(optimizer.firstDelta)
	<-optimizer.release
	onDelta("final text")

	return "streamed final text", nil
}

func (optimizer *slowStreamingOptimizer) ProviderName() string {
	return "test-stream"
}

type retryRejectedChecker struct {
	calls int
}

func (checker *retryRejectedChecker) Check(_ context.Context, optimizedText string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	if checker.calls == 1 {
		return agents.VoiceCheckResult{
			Complete:    false,
			Transcript:  "unrelated transcript",
			NeedsResume: false,
			Reason:      "test rejected attempt",
			Provider:    "test",
			Similarity:  0.1,
		}, nil
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "test complete",
		Provider:    "test",
		Similarity:  1,
	}, nil
}

type alwaysRejectChecker struct{}

func (checker *alwaysRejectChecker) Check(_ context.Context, _ string, _ []byte) (agents.VoiceCheckResult, error) {
	return agents.VoiceCheckResult{
		Complete:    false,
		Transcript:  "unrelated transcript",
		NeedsResume: false,
		Reason:      "test rejected attempt",
		Provider:    "test",
		Similarity:  0.1,
	}, nil
}

type cutoffChecker struct {
	calls int
}

func (checker *cutoffChecker) Check(_ context.Context, optimizedText string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	if checker.calls == 1 {
		return agents.VoiceCheckResult{
			Complete:    false,
			Transcript:  "first sentence.",
			ResumeText:  "second sentence.",
			NeedsResume: true,
			Reason:      "test cutoff",
			Provider:    "test",
			Similarity:  0.5,
		}, nil
	}

	return agents.VoiceCheckResult{
		Complete:    true,
		Transcript:  optimizedText,
		NeedsResume: false,
		Reason:      "test complete",
		Provider:    "test",
		Similarity:  1,
	}, nil
}

type countingOptimizer struct {
	calls  int
	output string
}

func (optimizer *countingOptimizer) Optimize(_ context.Context, _ string) (string, error) {
	optimizer.calls++
	return optimizer.output, nil
}

func (optimizer *countingOptimizer) ProviderName() string {
	return "counting"
}

type countingRejectChecker struct {
	calls int
}

func (checker *countingRejectChecker) Check(_ context.Context, _ string, _ []byte) (agents.VoiceCheckResult, error) {
	checker.calls++
	return agents.VoiceCheckResult{
		Complete:    false,
		Transcript:  "rejected",
		NeedsResume: false,
		Reason:      "test rejected",
		Provider:    "test",
		Similarity:  0.1,
	}, nil
}

func boolPtr(value bool) *bool {
	return &value
}

func findPreparedBlockContaining(blocks []pipeline.NarrationBlock, text string) *pipeline.NarrationBlock {
	for index := range blocks {
		if strings.Contains(blocks[index].Text, text) {
			return &blocks[index]
		}
	}
	return nil
}

func findPreparedBlockByKind(
	blocks []pipeline.NarrationBlock,
	kind pipeline.NarrationBlockKind,
) *pipeline.NarrationBlock {
	for index := range blocks {
		if blocks[index].Kind == kind {
			return &blocks[index]
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func newMockService(t *testing.T, checker pipeline.VoiceChecker) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		checker,
		pipeline.Options{
			MaxRetries:         3,
			JobDataDir:         t.TempDir(),
			ProjectDataDir:     t.TempDir(),
			BookSourceDir:      t.TempDir(),
			SourcePrepDir:      t.TempDir(),
			ProgressDataDir:    t.TempDir(),
			PlaybackSessionDir: t.TempDir(),
		},
	)
}

func newRecordingTTSService(
	t *testing.T,
	engineID string,
	agent pipeline.TTSAgent,
	supportsSSML bool,
) *pipeline.Service {
	t.Helper()

	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agent,
		agents.NewMockVoiceCheckerAgent(),
		pipeline.Options{
			MaxRetries:         3,
			JobDataDir:         t.TempDir(),
			ProjectDataDir:     t.TempDir(),
			BookSourceDir:      t.TempDir(),
			SourcePrepDir:      t.TempDir(),
			ProgressDataDir:    t.TempDir(),
			PlaybackSessionDir: t.TempDir(),
			DefaultTTSEngine:   engineID,
			TTSEngines: []pipeline.TTSEngineRegistration{{
				ID:    engineID,
				Agent: agent,
				Diagnostics: pipeline.TTSEngineDiagnostics{
					ID:           engineID,
					Label:        engineID,
					Status:       "ready",
					Local:        true,
					SupportsSSML: supportsSSML,
				},
			}},
		},
	)
}

func newBookSourceService(t *testing.T) *pipeline.Service {
	t.Helper()

	return newBookSourceServiceWithOptions(t, pipeline.Options{})
}

func newBookSourceServiceWithPDFScript(t *testing.T, scriptPath string) *pipeline.Service {
	t.Helper()

	return newBookSourceServiceWithOptions(t, pipeline.Options{
		BookPDFPythonPath:          "/bin/sh",
		BookPDFExtractorScriptPath: scriptPath,
	})
}

func newBookSourceServiceWithOptions(t *testing.T, options pipeline.Options) *pipeline.Service {
	t.Helper()
	if options.MaxRetries == 0 {
		options.MaxRetries = 3
	}
	if options.JobDataDir == "" {
		options.JobDataDir = t.TempDir()
	}
	if options.ProjectDataDir == "" {
		options.ProjectDataDir = t.TempDir()
	}
	if options.BookSourceDir == "" {
		options.BookSourceDir = t.TempDir()
	}
	if options.SourcePrepDir == "" {
		options.SourcePrepDir = t.TempDir()
	}
	if options.ProgressDataDir == "" {
		options.ProgressDataDir = t.TempDir()
	}
	if options.PlaybackSessionDir == "" {
		options.PlaybackSessionDir = t.TempDir()
	}
	return pipeline.NewService(
		agents.NewVoiceOptimizationAgent(),
		agents.NewMockTTSAgent(),
		agents.NewMockVoiceCheckerAgent(),
		options,
	)
}

func writeTestPDFExtractorScript(t *testing.T) string {
	t.Helper()
	scriptPath := filepath.Join(t.TempDir(), "pdf_extract_fixture.sh")
	body := `#!/bin/sh
if [ "${1:-}" = "--check" ]; then
  exit 0
fi
cat <<'JSON'
{"adapterVersion":"pdf-adapter-test","document":{"schemaVersion":"content-ir.v1","id":"fixture","sourceType":"bookSource","sourceId":"fixture","projectId":"default","sourceName":"fixture.pdf","adapterVersion":"pdf-adapter-test","generatedAt":"2026-05-16T12:00:00Z","metadata":{"title":"PDF Fixture","supportTier":"B","supportTierLabel":"Tier B: born-digital PDF","confidence":0.9,"extractorChain":[{"id":"detect","label":"Detect format and text-layer health","status":"done","confidence":1},{"id":"fixture","label":"Fixture extractor","status":"done","confidence":0.9}],"warnings":[]},"nodes":[{"nodeId":"page-0001","parentId":"","orderKey":"00000001","kind":"body","role":"body","displayText":"This is the first page.","normalisedText":"This is the first page.","speechText":"This is the first page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":0,"readingOrderIndex":0}},"offsets":{"start":0,"end":23},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"},{"nodeId":"page-0002","parentId":"","orderKey":"00000002","kind":"body","role":"body","displayText":"This is the second page.","normalisedText":"This is the second page.","speechText":"This is the second page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":1,"readingOrderIndex":0}},"offsets":{"start":25,"end":49},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"},{"nodeId":"page-0003","parentId":"","orderKey":"00000003","kind":"body","role":"body","displayText":"This is the third page.","normalisedText":"This is the third page.","speechText":"This is the third page.","lang":"und","script":"Latn","dir":"ltr","provenance":{"format":"pdf","sourceId":"fixture","locator":{"type":"pdf","pdf":{"pageIndex":2,"readingOrderIndex":0}},"offsets":{"start":51,"end":74},"extraction":{"extractor":"fixture","extractorVersion":"pdf-adapter-test","supportTier":"B","step":"Fixture extractor","confidence":0.9}},"ui":{"progressionHint":"linear","highlightUnitHint":"node"},"speech":{"policyHint":{"mode":"speak","emphasis":"","pauseBeforeMs":0,"pauseAfterMs":0},"speechPolicy":{"profile":"Enterprise","mode":"speak","explanation":"fixture"}},"warnings":[],"confidence":0.9,"rights":{"status":"unknown","notes":""},"adapterVersion":"pdf-adapter-test"}]},"metadata":{"title":"PDF Fixture","supportTier":"B","supportTierLabel":"Tier B: born-digital PDF","confidence":0.9,"warnings":[]},"title":"PDF Fixture","warnings":[]}
JSON
`
	if err := os.WriteFile(scriptPath, []byte(body), 0o755); err != nil {
		t.Fatalf("WriteFile script returned error: %v", err)
	}
	return scriptPath
}

func writeTestEPUB(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
		"OPS/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>Northern Lights</dc:title>
    <dc:creator>Ada Reader</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter-one"/>
    <itemref idref="chapter-two"/>
  </spine>
</package>`,
		"OPS/chapter-one.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Opening</title></head>
<body><h1>Opening</h1><p>Det var en kylig kväll i Stockholm.</p></body></html>`,
		"OPS/chapter-two.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Second Chapter</title></head>
<body><h1>Second Chapter</h1><p>The second chapter keeps the reader moving.</p></body></html>`,
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

func writeStructuredTestEPUB(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create EPUB returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"META-INF/container.xml": `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
		"EPUB/package.opf": `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <metadata>
    <dc:title>Structured Book</dc:title>
    <dc:creator>Reader Example</dc:creator>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="copyright" href="copyright.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-one" href="chapter-one.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter-two" href="chapter-two.xhtml" media-type="application/xhtml+xml"/>
    <item id="about" href="about.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="copyright"/>
    <itemref idref="chapter-one"/>
    <itemref idref="chapter-two"/>
    <itemref idref="about"/>
  </spine>
</package>`,
		"EPUB/nav.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><nav epub:type="toc">
<ol>
<li><a href="copyright.xhtml">Copyright</a></li>
<li><a href="chapter-one.xhtml">Chapter 1: A Clean Start</a></li>
<li><a href="chapter-two.xhtml">Chapter 2: A Wider Sky</a></li>
<li><a href="about.xhtml">About the Author</a></li>
</ol>
</nav></body></html>`,
		"EPUB/copyright.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Copyright</title></head>
<body><h1>Copyright</h1><p>Copyright page. Not for narration.</p></body></html>`,
		"EPUB/chapter-one.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Raw One</title></head>
<body><h1>Raw One</h1><p>The first real chapter starts with clean narration text for the reader.</p></body></html>`,
		"EPUB/chapter-two.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Raw Two</title></head>
<body><h1>Raw Two</h1><p>The second real chapter keeps the guided cinema moving forward.</p></body></html>`,
		"EPUB/about.xhtml": `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>About</title></head>
<body><h1>About the Author</h1><p>Back matter. Not for narration.</p></body></html>`,
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

func writeTestDOCX(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	file, err := os.Create(outputPath)
	if err != nil {
		t.Fatalf("Create DOCX returned error: %v", err)
	}
	zipWriter := zip.NewWriter(file)
	files := map[string]string{
		"docProps/core.xml": `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title>DOCX Integration Fixture</dc:title><dc:creator>Adapter Writer</dc:creator></cp:coreProperties>`,
		"word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>`,
		"word/footnotes.xml": `<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:footnote w:id="2"><w:p><w:r><w:t>Footnote detail.</w:t></w:r></w:p></w:footnote></w:footnotes>`,
		"word/endnotes.xml": `<w:endnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:endnote w:id="3"><w:p><w:r><w:t>Endnote detail.</w:t></w:r></w:p></w:endnote></w:endnotes>`,
		"word/comments.xml": `<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:comment w:id="4"><w:p><w:r><w:t>Comment detail.</w:t></w:r></w:p></w:comment></w:comments>`,
		"word/document.xml": `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p>
<w:p><w:r><w:t>Body paragraph with notes.</w:t></w:r><w:footnoteReference w:id="2"/><w:commentReference w:id="4"/></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="9"/></w:numPr></w:pPr><w:r><w:t>List item one.</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p><w:pPr><w:pStyle w:val="Caption"/></w:pPr><w:r><w:t>Figure 1. A caption.</w:t></w:r></w:p>
<w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="Diagram alt text"/><a:blip r:embed="rId5"/></wp:inline></w:drawing></w:r></w:p>
<w:p><w:r><w:t>Paragraph with endnote.</w:t></w:r><w:endnoteReference w:id="3"/></w:p>
</w:body></w:document>`,
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
		t.Fatalf("Close DOCX returned error: %v", err)
	}
	return outputPath
}

func writeTestHTML(t *testing.T, filename string) string {
	t.Helper()

	outputPath := filepath.Join(t.TempDir(), filename)
	if err := os.WriteFile(outputPath, []byte(testHTMLFixture()), 0o644); err != nil {
		t.Fatalf("Write HTML returned error: %v", err)
	}
	return outputPath
}

func testHTMLFixture() string {
	return `<!doctype html><html lang="en"><head><title>Synthetic Article</title></head><body><main><article>
<h1 id="synthetic-article">Synthetic Article</h1>
<p>Article lead paragraph with enough words for spans.</p>
<figure><img src="desk.jpg" alt="A newsroom desk"/><figcaption>Useful figure caption.</figcaption></figure>
<table><tr><th>Metric</th><td>Value</td></tr></table>
</article></main></body></html>`
}

func findTestSection(sections []pipeline.BookSourceSection, id string) *pipeline.BookSourceSection {
	for _, section := range sections {
		if section.ID == id {
			nextSection := section
			return &nextSection
		}
	}
	return nil
}

func waitForJob(t *testing.T, service *pipeline.Service, id string, status pipeline.JobStatus) pipeline.VoiceJob {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.Status == status {
			return job
		}
		if job.Status == pipeline.JobStatusFailed {
			t.Fatalf("job failed: %s", job.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, _ := service.GetJob(id)
	t.Fatalf("job status = %q, want %q", job.Status, status)
	return pipeline.VoiceJob{}
}

func waitForFailedJob(t *testing.T, service *pipeline.Service, id string) pipeline.VoiceJob {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.Status == pipeline.JobStatusFailed {
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, _ := service.GetJob(id)
	t.Fatalf("job status = %q, want %q", job.Status, pipeline.JobStatusFailed)
	return pipeline.VoiceJob{}
}

func waitForAudioSegments(t *testing.T, service *pipeline.Service, id string, minSegments int) {
	t.Helper()

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := service.GetJob(id)
		if err != nil {
			t.Fatalf("GetJob returned error: %v", err)
		}
		if job.AudioReadySegments >= minSegments {
			return
		}
		if job.Status == pipeline.JobStatusFailed {
			t.Fatalf("job failed: %s", job.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}

	job, err := service.GetJob(id)
	if err != nil {
		t.Fatalf("GetJob returned error: %v", err)
	}
	t.Fatalf("audio segments ready = %d, want >= %d", job.AudioReadySegments, minSegments)
}
