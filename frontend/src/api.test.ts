import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  audioSource,
  backendAssetUrl,
  buildVoiceProfileArtifact,
  clearHuggingFaceToken,
  confirmTemporarySourceReadiness,
  createCustomSpeechPolicyProfile,
  createPreparedSource,
  createTemporarySource,
  createTemporarySourceJob,
  createVoicePreview,
  deleteProject,
  deleteVoiceJob,
  getAdapterCapabilities,
  getAdapterDiagnostics,
  getBookSource,
  getContentIR,
  getContentIRSpeechPlan,
  getJobSpeechPlan,
  getProjectLexicon,
  getReaderWorkspace,
  getTemporaryStorageUsageSummary,
  getVoiceProfileCredentials,
  isApiNotFoundError,
  listTemporarySourceJobs,
  listTemporarySources,
  previewContentIRSpeechPolicy,
  previewMathSpeech,
  previewPreparedSourceSpeechPolicy,
  putReaderWorkspace,
  ReaderWorkspacePreconditionError,
  reopenTemporarySource,
  saveHuggingFaceToken,
  subscribeToVoiceJob,
  updateBookSourceSpeechPolicy,
  updatePreparedSourceSpeechPolicy,
  upsertProjectLexiconEntry,
} from "./api";

describe("API errors", () => {
  it("GETs one encoded book source without listing the project", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    const exact = { id: "book/one", projectId: "project-1", sourceName: "Book One" };
    globalThis.fetch = (input) => {
      requests.push(fetchInputUrl(input));
      return Promise.resolve(Response.json(exact));
    };
    try {
      await expect(getBookSource("book/one")).resolves.toEqual(exact);
      expect(requests).toEqual(["/api/book-sources/book%2Fone"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("identifies structured 404 errors for stale local source state", () => {
    expect(isApiNotFoundError(new ApiRequestError(404, "not found"))).toBe(true);
    expect(isApiNotFoundError(new ApiRequestError(500, "server error"))).toBe(false);
  });

  it("GETs a reader workspace with its exact ETag", async () => {
    const originalFetch = globalThis.fetch;
    const exact = readerWorkspaceResponse();
    globalThis.fetch = (input) => {
      expect(fetchInputUrl(input)).toBe("/api/projects/project%2Fone/reader-workspace");
      return Promise.resolve(Response.json(exact, { headers: { ETag: '"revision-7"' } }));
    };
    try {
      await expect(getReaderWorkspace("project/one")).resolves.toEqual({
        snapshot: exact,
        etag: '"revision-7"',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("PUTs a reader workspace with If-Match and exposes 412 server-current state", async () => {
    const originalFetch = globalThis.fetch;
    const current = readerWorkspaceResponse({ projectRevision: 8, playbackCursorMs: 9000 });
    const requests: RequestInit[] = [];
    globalThis.fetch = (_input, init) => {
      requests.push(init ?? {});
      return Promise.resolve(
        Response.json(
          { current, error: "stale", retryToken: '"revision-8"' },
          { headers: { ETag: '"revision-8"' }, status: 412 },
        ),
      );
    };
    try {
      const error = await putReaderWorkspace(
        "project-1",
        readerWorkspaceResponse(),
        '"revision-7"',
      ).catch((error_: unknown) => error_);
      expect(requests[0]?.method).toBe("PUT");
      expect(requests[0]?.headers).toEqual({
        "Content-Type": "application/json",
        "If-Match": '"revision-7"',
      });
      expect(error).toBeInstanceOf(ReaderWorkspacePreconditionError);
      expect(error).toMatchObject({ current, etag: '"revision-8"', status: 412 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fails closed when a 412 omits both ETag and a non-empty retry token", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        Response.json(
          { current: readerWorkspaceResponse(), error: "stale", retryToken: "  " },
          { status: 412 },
        ),
      );
    try {
      const error = await putReaderWorkspace(
        "project-1",
        readerWorkspaceResponse(),
        '"revision-7"',
      ).catch((error_: unknown) => error_);
      expect(error).toBeInstanceOf(ApiRequestError);
      expect(error).not.toBeInstanceOf(ReaderWorkspacePreconditionError);
      expect(error).toMatchObject({ status: 412 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds backend asset URLs for download links", () => {
    expect(backendAssetUrl("/api/voice-jobs/job/audio")).toBe("/api/voice-jobs/job/audio");
    expect(backendAssetUrl("api/voice-jobs/job/audio")).toBe("/api/voice-jobs/job/audio");
    expect(backendAssetUrl("https://example.com/audio.wav")).toBe("https://example.com/audio.wav");
  });

  it("falls back to partial audio when completed final audio URL is missing", () => {
    expect(
      audioSource({
        audioPartialUrl: "/api/voice-jobs/job-1/audio/partial",
        audioUrl: "",
        status: "completed",
      } as Parameters<typeof audioSource>[0]),
    ).toBe("/api/voice-jobs/job-1/audio/partial");
  });

  it("explains stale backend project-delete routes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("Method Not Allowed", {
          headers: { Allow: "PATCH" },
          status: 405,
        }),
      );

    try {
      await expect(deleteProject("project-1")).rejects.toThrow(
        /Restart the backend with mise start -- pnpm start:local/,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("deletes generated narration jobs by id", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      requests.push({ url: fetchInputUrl(input), init });
      return Promise.resolve(new Response(null, { status: 204 }));
    };

    try {
      await deleteVoiceJob("job-1");

      expect(requests).toHaveLength(1);
      expect(requests[0]?.url).toBe("/api/voice-jobs/job-1");
      expect(requests[0]?.init?.method).toBe("DELETE");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates voice previews with raw audio metadata", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (_input, init) => {
      const url = fetchInputUrl(_input);
      requests.push({ url, init });
      return Promise.resolve(
        new Response(new Uint8Array([82, 73, 70, 70]), {
          headers: {
            "Content-Type": "audio/wav",
            "X-Voice-Preview-Duration-Ms": "1200",
            "X-Voice-Preview-Provider": "mock",
            "X-Voice-Preview-Voice": "af_heart",
          },
          status: 200,
        }),
      );
    };

    try {
      const preview = await createVoicePreview({
        projectId: "project-1",
        text: "Audition this selected block.",
        ttsEngine: "auto",
      });

      expect(requests[0]?.url).toBe("/api/voice-previews");
      expect(requests[0]?.init?.method).toBe("POST");
      const requestBody = requests[0]?.init?.body;
      expect(typeof requestBody).toBe("string");
      expect(JSON.parse(requestBody as string)).toMatchObject({
        projectId: "project-1",
        text: "Audition this selected block.",
        ttsEngine: "auto",
      });
      expect(preview.contentType).toBe("audio/wav");
      expect(preview.durationMs).toBe(1200);
      expect(preview.provider).toBe("mock");
      expect(preview.voice).toBe("af_heart");
      expect(preview.audio.size).toBe(4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates temporary sources from URL JSON without a project id", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      requests.push({ url: fetchInputUrl(input), init });
      return Promise.resolve(
        Response.json({
          scope: "temporary",
          sourceOwner: "temporary",
          temporarySourceId: "temp-1",
          source: {
            id: "temp-1",
            scope: "temporary",
            temporarySourceId: "temp-1",
            sourceOwner: "temporary",
            status: "reviewable",
            promotionStatus: "notPromoted",
            kind: "url",
            sourceName: "https://example.com/story",
            wordCount: 10,
            artifacts: [],
            createdAt: "2026-06-11T17:00:00Z",
            lastAccessedAt: "2026-06-11T17:00:00Z",
            expiresAt: "2026-06-12T17:00:00Z",
            updatedAt: "2026-06-11T17:00:00Z",
          },
        }),
      );
    };

    try {
      const source = await createTemporarySource({
        kind: "url",
        markdownParseMode: "strict",
        sourceName: "https://example.com/story",
        url: "https://example.com/story",
      });

      expect(source).toMatchObject({
        id: "temp-1",
        scope: "temporary",
        sourceOwner: "temporary",
        temporarySourceId: "temp-1",
      });
      expect(requests[0]?.url).toBe("/api/temporary-sources");
      expect(requests[0]?.init?.method).toBe("POST");
      expect(requests[0]?.init?.headers).toEqual({ "Content-Type": "application/json" });
      const body = requests[0]?.init?.body;
      expect(typeof body).toBe("string");
      expect(JSON.parse(body as string)).toMatchObject({
        kind: "url",
        markdownParseMode: "strict",
        url: "https://example.com/story",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates temporary source jobs through the temporary route", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      requests.push({ url: fetchInputUrl(input), init });
      return Promise.resolve(Response.json({ id: "job-temp", status: "queued", progress: {} }));
    };

    try {
      await createTemporarySourceJob("temp-1", {
        text: "Read this now.",
        temporarySourceId: "temp-1",
        ttsEngine: "auto",
      });

      expect(requests[0]?.url).toBe("/api/temporary-sources/temp-1/voice-jobs");
      expect(requests[0]?.init?.method).toBe("POST");
      const body = requests[0]?.init?.body;
      expect(typeof body).toBe("string");
      expect(JSON.parse(body as string)).toMatchObject({
        temporarySourceId: "temp-1",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("lists recent temporary sources, reopens by id, lists jobs, and preserves storage byte maps", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      const url = fetchInputUrl(input);
      requests.push({ url, init });
      if (url === "/api/temporary-sources") {
        return Promise.resolve(
          Response.json([
            {
              scope: "temporary",
              sourceOwner: "temporary",
              temporarySourceId: "temp-1",
              source: temporarySourceResponse({ id: "temp-1" }),
            },
          ]),
        );
      }
      if (url === "/api/temporary-sources/temp-1/reopen") {
        return Promise.resolve(
          Response.json({
            scope: "temporary",
            sourceOwner: "temporary",
            temporarySourceId: "temp-1",
            source: temporarySourceResponse({ id: "temp-1", status: "previewable" }),
          }),
        );
      }
      if (url === "/api/temporary-sources/jobs") {
        return Promise.resolve(Response.json([{ id: "job-temp", status: "failed" }]));
      }
      return Promise.resolve(
        Response.json({
          artifactBytes: 32,
          artifactTypeBytes: { generatedAudio: 16, source: 8 },
          audioBytes: 16,
          expiredCount: 0,
          generatingCount: 1,
          progressBytes: 4,
          sessions: [
            {
              artifactTypeBytes: { generatedAudio: 16, source: 8 },
              bytes: 28,
              expiresAt: "2026-06-13T10:00:00Z",
              lastAccessedAt: "2026-06-12T11:00:00Z",
              status: "audio_ready",
              temporarySourceId: "temp-1",
            },
          ],
          sourceBytes: 8,
          temporaryCount: 1,
          totalBytes: 60,
          updatedAt: "2026-06-12T11:00:00Z",
        }),
      );
    };

    try {
      const sources = await listTemporarySources();
      const reopened = await reopenTemporarySource("temp-1");
      const jobs = await listTemporarySourceJobs();
      const storage = await getTemporaryStorageUsageSummary();

      expect(sources[0]).toMatchObject({ id: "temp-1", sourceOwner: "temporary" });
      expect(reopened.status).toBe("previewable");
      expect(jobs[0]?.id).toBe("job-temp");
      expect(storage.artifactTypeBytes?.generatedAudio).toBe(16);
      expect(storage.sessions[0]?.artifactTypeBytes?.source).toBe(8);
      expect(requests.map((request) => request.url)).toEqual([
        "/api/temporary-sources",
        "/api/temporary-sources/temp-1/reopen",
        "/api/temporary-sources/jobs",
        "/api/temporary-sources/storage/summary",
      ]);
      expect(requests[1]?.init?.method).toBe("POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("confirms temporary source readiness through the temporary route", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      requests.push({ url: fetchInputUrl(input), init });
      return Promise.resolve(
        Response.json({
          id: "temp-1",
          scope: "temporary",
          temporarySourceId: "temp-1",
          sourceOwner: "temporary",
          status: "previewable",
          promotionStatus: "notPromoted",
          kind: "text",
          sourceName: "Pasted note",
          wordCount: 10,
          artifacts: [],
          createdAt: "2026-06-11T17:00:00Z",
          lastAccessedAt: "2026-06-11T17:00:00Z",
          expiresAt: "2026-06-12T17:00:00Z",
          updatedAt: "2026-06-11T17:00:00Z",
        }),
      );
    };

    try {
      await confirmTemporarySourceReadiness("temp-1", {
        language: "en-US",
        sourceType: "document",
        title: "Pasted note",
      });

      expect(requests[0]?.url).toBe("/api/temporary-sources/temp-1/readiness/confirm");
      expect(requests[0]?.init?.method).toBe("PATCH");
      const body = requests[0]?.init?.body;
      expect(typeof body).toBe("string");
      expect(JSON.parse(body as string)).toMatchObject({
        language: "en-US",
        sourceType: "document",
        title: "Pasted note",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves structured 404s from voice preview failures", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(Response.json({ error: "project not found" }, { status: 404 }));

    try {
      await expect(
        createVoicePreview({
          projectId: "missing-project",
          text: "Audition this selected block.",
          ttsEngine: "auto",
        }),
      ).rejects.toMatchObject({
        message: "project not found",
        name: "ApiRequestError",
        status: 404,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("preserves text bodies from stale voice preview routes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () =>
      Promise.resolve(new Response("Cannot POST /api/voice-previews", { status: 404 }));

    try {
      await expect(
        createVoicePreview({
          projectId: "project-1",
          text: "Audition this selected block.",
          ttsEngine: "auto",
        }),
      ).rejects.toMatchObject({
        message: "Cannot POST /api/voice-previews",
        name: "ApiRequestError",
        status: 404,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("manages voice profile credential status without exposing the token", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (_input, init) => {
      const url = fetchInputUrl(_input);
      requests.push({ url, init });
      if (init?.method === "PUT") {
        return Promise.resolve(
          Response.json({
            huggingFaceTokenConfigured: true,
            huggingFaceTokenSource: "local",
          }),
        );
      }
      if (init?.method === "DELETE") {
        return Promise.resolve(
          Response.json({
            huggingFaceTokenConfigured: true,
            huggingFaceTokenSource: "env",
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          huggingFaceTokenConfigured: false,
          huggingFaceTokenSource: "none",
        }),
      );
    };

    try {
      await expect(getVoiceProfileCredentials()).resolves.toEqual({
        huggingFaceTokenConfigured: false,
        huggingFaceTokenSource: "none",
      });
      await expect(saveHuggingFaceToken("hf_secret")).resolves.toEqual({
        huggingFaceTokenConfigured: true,
        huggingFaceTokenSource: "local",
      });
      await expect(clearHuggingFaceToken()).resolves.toEqual({
        huggingFaceTokenConfigured: true,
        huggingFaceTokenSource: "env",
      });
      expect(requests.map((request) => request.url)).toEqual([
        "/api/voice-profile-credentials",
        "/api/voice-profile-credentials/hugging-face-token",
        "/api/voice-profile-credentials/hugging-face-token",
      ]);
      expect(requests[1]?.init?.method).toBe("PUT");
      expect(requests[2]?.init?.method).toBe("DELETE");
      expect(typeof requests[1]?.init?.body === "string" ? requests[1].init.body : "").toContain(
        '"token":"hf_secret"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("builds voice profile artifacts with optional timeout override payload", async () => {
    const originalFetch = globalThis.fetch;
    const requestInits: RequestInit[] = [];
    globalThis.fetch = (_input, init) => {
      requestInits.push(init ?? {});
      return Promise.resolve(Response.json({ id: "artifact-profile" }));
    };

    try {
      await buildVoiceProfileArtifact("profile-id", "kokoro-embed");
      expect(requestInits[0]?.method).toBe("POST");
      expect(requestInits[0]?.headers).toBeUndefined();
      expect(requestInits[0]?.body).toBeUndefined();

      await buildVoiceProfileArtifact("profile-id", "kokoro-embed", 60);
      expect(requestInits[1]?.method).toBe("POST");
      expect(requestInits[1]?.headers).toEqual({ "Content-Type": "application/json" });
      expect(typeof requestInits[1]?.body === "string" ? requestInits[1].body : "").toBe(
        JSON.stringify({ timeoutSeconds: 60 }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to polling when a voice job progress stream disconnects", async () => {
    const originalEventSource = globalThis.EventSource as typeof EventSource | undefined;
    const originalFetch = globalThis.fetch;
    const sources: MockEventSource[] = [];
    class MockEventSource {
      static readonly CLOSED = 2;
      readonly listeners = new Map<string, ((event: Event) => void)[]>();
      readyState = 1;
      readonly url: string;

      constructor(url: string) {
        this.url = url;
        sources.push(this);
      }

      addEventListener(type: string, listener: (event: Event) => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
      }

      close() {
        this.readyState = MockEventSource.CLOSED;
      }

      emit(type: string) {
        for (const listener of this.listeners.get(type) ?? []) {
          listener(new Event(type));
        }
      }
    }
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
    const fetchUrls: string[] = [];
    globalThis.fetch = (input) => {
      fetchUrls.push(fetchInputUrl(input));
      return Promise.resolve(
        Response.json({
          id: "job-1",
          status: "completed",
        }),
      );
    };
    const jobs: unknown[] = [];
    const errors: string[] = [];

    try {
      const unsubscribe = subscribeToVoiceJob(
        "job-1",
        (job) => jobs.push(job),
        (error) => errors.push(error.message),
      );
      expect(sources[0]?.url).toBe("/api/voice-jobs/job-1/events");
      sources[0]?.emit("error");
      await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      unsubscribe();

      expect(errors).toContain("Voice job progress stream disconnected");
      expect(jobs).toMatchObject([{ id: "job-1", status: "completed" }]);
      expect(fetchUrls).toEqual(["/api/voice-jobs/job-1"]);
    } finally {
      if (originalEventSource) {
        globalThis.EventSource = originalEventSource;
      } else {
        Reflect.deleteProperty(globalThis, "EventSource");
      }
      globalThis.fetch = originalFetch;
    }
  });

  it("previews prepared-source speech policy with JSON instead of upload", async () => {
    const originalFetch = globalThis.fetch;
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      return Promise.resolve(
        Response.json({
          id: "source-1",
          projectId: "default",
          status: "ready",
          kind: "file",
          sourceName: "demo.md",
          speechPolicyProfile: "Accessibility",
          wordCount: 1,
          blockCount: 1,
          segmentCount: 1,
          summary: {
            citationSkipCount: 0,
            headingCount: 0,
            sentenceSegmentCount: 1,
            skippedBlockCount: 0,
            spokenBlockCount: 1,
          },
          createdAt: "2026-05-16T12:00:00Z",
          updatedAt: "2026-05-16T12:00:00Z",
        }),
      );
    };

    try {
      const source = await previewPreparedSourceSpeechPolicy("source-1", {
        locale: "sv-SE",
        profile: "Accessibility",
        overrides: { codeMode: "literal" },
        ttsEngine: "supertonic-3",
        voiceProfileId: "profile-1",
      });
      expect(source.speechPolicyProfile).toBe("Accessibility");
      expect(requestInit?.method).toBe("POST");
      expect(requestInit?.headers).toEqual({ "Content-Type": "application/json" });
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"codeMode":"literal"',
      );
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"voiceProfileId":"profile-1"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends strict markdown parse mode with JSON source prep requests", async () => {
    const originalFetch = globalThis.fetch;
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      return Promise.resolve(
        Response.json(preparedSourceResponse({ markdownParseMode: "strict" })),
      );
    };

    try {
      const source = await createPreparedSource("default", {
        kind: "url",
        markdownParseMode: "strict",
        sourceName: "https://example.com/demo.md",
        url: "https://example.com/demo.md",
      });
      expect(source.markdownParseMode).toBe("strict");
      expect(requestInit?.method).toBe("POST");
      expect(requestInit?.headers).toEqual({ "Content-Type": "application/json" });
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"markdownParseMode":"strict"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("sends markdown parse mode with multipart source prep uploads", async () => {
    const originalFetch = globalThis.fetch;
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (_input, init) => {
      requestInit = init;
      return Promise.resolve(
        Response.json(preparedSourceResponse({ markdownParseMode: "legacy" })),
      );
    };

    try {
      const source = await createPreparedSource(
        "default",
        new File(["# Demo"], "demo.md", { type: "text/markdown" }),
        { markdownParseMode: "legacy" },
      );
      expect(source.markdownParseMode).toBe("legacy");
      expect(requestInit?.body).toBeInstanceOf(FormData);
      const formData = requestInit?.body as FormData;
      expect(formData.get("markdownParseMode")).toBe("legacy");
      expect(formData.get("file")).toBeInstanceOf(File);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches adapter capability and diagnostic endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      requests.push(url);
      if (url.endsWith("/api/adapters/capabilities")) {
        return Promise.resolve(
          Response.json([
            {
              adapterId: "html",
              extensions: [".html"],
              mimeTypes: ["text/html"],
              sourceKinds: ["url"],
              features: { semanticBlocks: true },
            },
          ]),
        );
      }
      return Promise.resolve(
        Response.json({
          html: {
            adapterId: "html",
            available: true,
            status: "available",
            cliPath: "/repo/adapters/html/cli.js",
            warnings: [],
          },
        }),
      );
    };

    try {
      const capabilities = await getAdapterCapabilities();
      const diagnostics = await getAdapterDiagnostics();
      expect(capabilities[0]?.adapterId).toBe("html");
      expect(diagnostics.html.available).toBe(true);
      expect(requests).toEqual(["/api/adapters/capabilities", "/api/adapters/diagnostics"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("previews Content IR speech policy with the current session overrides", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (input, init) => {
      requestUrl = fetchInputUrl(input);
      requestInit = init;
      return Promise.resolve(
        Response.json({
          id: "source-1",
          title: "Demo",
          source: { id: "source-1", type: "preparedSource" },
          nodes: [],
        }),
      );
    };

    try {
      const document = await previewContentIRSpeechPolicy("source-1", {
        locale: "en-GB",
        profile: "Enterprise",
        overrides: { tableMode: "rowLinear" },
        ttsEngine: "mock",
        voiceProfileId: "profile-1",
      });
      expect(document.id).toBe("source-1");
      expect(requestUrl).toBe("/api/content-ir/source-1/speech-policy/preview");
      expect(requestInit?.method).toBe("POST");
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"tableMode":"rowLinear"',
      );
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"locale":"en-GB"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("updates durable source speech policy pins through PATCH endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      const url = fetchInputUrl(input);
      requests.push({ url, init });
      if (url.includes("/book-sources/")) {
        return Promise.resolve(
          Response.json({
            id: "book-1",
            projectId: "default",
            status: "ready",
            kind: "epub",
            sourceFile: "fixture.epub",
            sourceBytes: 10,
            sourceSpeechPolicyProfile: "Accessibility",
            sourceSpeechPolicyOverrides: { quoteMode: "summarise" },
            wordCount: 1,
            pageCount: 0,
            chapterCount: 1,
            createdAt: "2026-05-16T12:00:00Z",
            updatedAt: "2026-05-16T12:00:00Z",
          }),
        );
      }
      return Promise.resolve(
        Response.json(
          preparedSourceResponse({
            sourceSpeechPolicyProfile: "Enterprise",
            sourceSpeechPolicyOverrides: { codeMode: "literal" },
          }),
        ),
      );
    };

    try {
      const prepared = await updatePreparedSourceSpeechPolicy("source-1", {
        profile: "Enterprise",
        overrides: { codeMode: "literal" },
      });
      const book = await updateBookSourceSpeechPolicy("book-1", {
        clear: true,
      });
      expect(prepared.sourceSpeechPolicyProfile).toBe("Enterprise");
      expect(book.sourceSpeechPolicyOverrides?.quoteMode).toBe("summarise");
      expect(requests.map((request) => request.url)).toEqual([
        "/api/source-preps/source-1/speech-policy",
        "/api/book-sources/book-1/speech-policy",
      ]);
      expect(requests[0]?.init?.method).toBe("PATCH");
      expect(requests[1]?.init?.method).toBe("PATCH");
      expect(typeof requests[0]?.init?.body === "string" ? requests[0].init.body : "").toContain(
        '"codeMode":"literal"',
      );
      expect(typeof requests[1]?.init?.body === "string" ? requests[1].init.body : "").toContain(
        '"clear":true',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("fetches public Content IR v1 and speech plans", async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    globalThis.fetch = (input) => {
      const url = fetchInputUrl(input);
      requests.push(url);
      if (url.includes("/speech-plan")) {
        return Promise.resolve(
          Response.json({
            schemaVersion: "speech-plan.v1",
            id: "source-1",
            sourceId: "source-1",
            projectId: "default",
            generatedAt: new Date(0).toISOString(),
            segments: [],
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          schemaVersion: "content-ir.v1",
          id: "source-1",
          sourceType: "preparedSource",
          sourceId: "source-1",
          projectId: "default",
          sourceName: "demo.md",
          adapterVersion: "test",
          generatedAt: new Date(0).toISOString(),
          nodes: [],
        }),
      );
    };

    try {
      const document = await getContentIR("source-1", "content-ir.v1");
      const sourcePlan = await getContentIRSpeechPlan("source-1");
      const jobPlan = await getJobSpeechPlan("job-1");
      expect(document.schemaVersion).toBe("content-ir.v1");
      expect(sourcePlan.schemaVersion).toBe("speech-plan.v1");
      expect(jobPlan.schemaVersion).toBe("speech-plan.v1");
      expect(requests).toEqual([
        "/api/content-ir/source-1?schemaVersion=content-ir.v1",
        "/api/content-ir/source-1/speech-plan",
        "/api/voice-jobs/job-1/speech-plan",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates project custom speech policy profiles through JSON endpoints", async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = "";
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (input, init) => {
      requestUrl = fetchInputUrl(input);
      requestInit = init;
      return Promise.resolve(
        Response.json({
          projectId: "project-1",
          profile: "custom-1",
          settings: {
            mode: "speak",
            tableMode: "summary",
            tableHeaderMode: "column",
            codeMode: "literal",
            mathMode: "skip",
            footnoteMode: "inline",
            imageMode: "altFirst",
            captionMode: "speak",
            citationMode: "inline",
            listMarkerMode: "announce",
            admonitionMode: "speak",
            quoteMode: "speak",
          },
          customProfiles: [
            {
              id: "custom-1",
              name: "Reader",
              baseProfile: "Enterprise",
              settings: {
                mode: "speak",
                tableMode: "summary",
                tableHeaderMode: "column",
                codeMode: "literal",
                mathMode: "skip",
                footnoteMode: "inline",
                imageMode: "altFirst",
                captionMode: "speak",
                citationMode: "inline",
                listMarkerMode: "announce",
                admonitionMode: "speak",
                quoteMode: "speak",
              },
              createdAt: "2026-05-16T12:00:00Z",
              updatedAt: "2026-05-16T12:00:00Z",
            },
          ],
        }),
      );
    };

    try {
      const policy = await createCustomSpeechPolicyProfile("project-1", {
        name: "Reader",
        baseProfile: "Enterprise",
        settings: {
          mode: "speak",
          tableMode: "summary",
          tableHeaderMode: "column",
          codeMode: "literal",
          mathMode: "skip",
          footnoteMode: "inline",
          imageMode: "altFirst",
          captionMode: "speak",
          citationMode: "inline",
          listMarkerMode: "announce",
          admonitionMode: "speak",
          quoteMode: "speak",
        },
      });
      expect(policy.profile).toBe("custom-1");
      expect(policy.customProfiles?.[0]?.name).toBe("Reader");
      expect(requestUrl).toBe("/api/projects/project-1/speech-policy/profiles");
      expect(requestInit?.method).toBe("POST");
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"name":"Reader"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses lexicon and maths preview endpoints", async () => {
    const originalFetch = globalThis.fetch;
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (input, init) => {
      const url = fetchInputUrl(input);
      requests.push({ url, init });
      if (url.endsWith("/api/math/preview")) {
        return Promise.resolve(
          Response.json({
            input: "x=1",
            normalized: "x=1",
            speech: "x equals one",
            source: "deterministic-fallback",
            toolOptional: true,
          }),
        );
      }
      return Promise.resolve(
        Response.json({
          version: "lexicon.v1",
          scope: "project",
          ownerId: "project-1",
          entries: [],
          updatedAt: "2026-05-16T12:00:00Z",
        }),
      );
    };

    try {
      const math = await previewMathSpeech("x=1");
      const lexicon = await getProjectLexicon("project-1");
      await upsertProjectLexiconEntry("project-1", {
        protected: true,
        replacement: "Win",
        term: "Nguyen",
      });
      expect(math.speech).toBe("x equals one");
      expect(lexicon.scope).toBe("project");
      expect(requests.map((request) => request.url)).toEqual([
        "/api/math/preview",
        "/api/projects/project-1/lexicon",
        "/api/projects/project-1/lexicon",
      ]);
      expect(requests[2]?.init?.method).toBe("POST");
      expect(typeof requests[2]?.init?.body === "string" ? requests[2].init.body : "").toContain(
        '"replacement":"Win"',
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

function readerWorkspaceResponse(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: "reader_workspace_snapshot.v1" as const,
    projectId: "project-1",
    projectRevision: 7,
    readMode: "paused" as const,
    sourceId: "source-exact",
    sourceRevisionId: "revision-exact",
    sourceContentHash: "hash-exact",
    runId: "run-exact",
    runCompatibilityKey: "compat-exact",
    mediaManifestVersion: 3,
    timingRevision: 2,
    syncFidelity: "exact_word" as const,
    readerLocator: null,
    playbackCursorMs: 4200,
    playbackRate: 1.25,
    followPreference: true,
    updatedAt: "2026-07-11T10:00:00Z",
    ...overrides,
  };
}

function fetchInputUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

function preparedSourceResponse(
  overrides: Partial<Awaited<ReturnType<typeof createPreparedSource>>>,
) {
  return {
    id: "source-1",
    projectId: "default",
    status: "ready",
    kind: "file",
    sourceName: "demo.md",
    speechPolicyProfile: "Enterprise",
    wordCount: 1,
    blockCount: 1,
    segmentCount: 1,
    summary: {
      citationSkipCount: 0,
      headingCount: 0,
      sentenceSegmentCount: 1,
      skippedBlockCount: 0,
      spokenBlockCount: 1,
    },
    createdAt: "2026-05-16T12:00:00Z",
    updatedAt: "2026-05-16T12:00:00Z",
    ...overrides,
  };
}

function temporarySourceResponse(overrides: Record<string, unknown> = {}) {
  const id = typeof overrides.id === "string" ? overrides.id : "temp-1";
  return {
    artifacts: [],
    createdAt: "2026-06-12T10:00:00Z",
    expiresAt: "2026-06-13T10:00:00Z",
    id,
    kind: "text",
    lastAccessedAt: "2026-06-12T11:00:00Z",
    promotionStatus: "notPromoted",
    scope: "temporary",
    sourceName: "Temporary briefing",
    sourceOwner: "temporary",
    status: "reviewable",
    temporarySourceId: id,
    updatedAt: "2026-06-12T11:00:00Z",
    wordCount: 3,
    ...overrides,
  };
}
