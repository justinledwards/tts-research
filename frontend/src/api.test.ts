import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  backendAssetUrl,
  createCustomSpeechPolicyProfile,
  createPreparedSource,
  deleteProject,
  getProjectLexicon,
  getAdapterCapabilities,
  getAdapterDiagnostics,
  getContentIR,
  getContentIRSpeechPlan,
  getJobSpeechPlan,
  previewMathSpeech,
  previewContentIRSpeechPolicy,
  isApiNotFoundError,
  previewPreparedSourceSpeechPolicy,
  upsertProjectLexiconEntry,
} from "./api";

describe("API errors", () => {
  it("identifies structured 404 errors for stale local source state", () => {
    expect(isApiNotFoundError(new ApiRequestError(404, "not found"))).toBe(true);
    expect(isApiNotFoundError(new ApiRequestError(500, "server error"))).toBe(false);
  });

  it("builds backend asset URLs for download links", () => {
    expect(backendAssetUrl("/api/voice-jobs/job/audio")).toBe("/api/voice-jobs/job/audio");
    expect(backendAssetUrl("api/voice-jobs/job/audio")).toBe("/api/voice-jobs/job/audio");
    expect(backendAssetUrl("https://example.com/audio.wav")).toBe("https://example.com/audio.wav");
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

  it("fetches versioned Content IR and speech plans", async () => {
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
          schemaVersion: "content-ir.v1_1",
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
      const document = await getContentIR("source-1", "content-ir.v1_1");
      const sourcePlan = await getContentIRSpeechPlan("source-1");
      const jobPlan = await getJobSpeechPlan("job-1");
      expect(document.schemaVersion).toBe("content-ir.v1_1");
      expect(sourcePlan.schemaVersion).toBe("speech-plan.v1");
      expect(jobPlan.schemaVersion).toBe("speech-plan.v1");
      expect(requests).toEqual([
        "/api/content-ir/source-1?schemaVersion=content-ir.v1_1",
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
            codeMode: "literal",
            mathMode: "skip",
            footnoteMode: "inline",
            imageMode: "altFirst",
          },
          customProfiles: [
            {
              id: "custom-1",
              name: "Reader",
              baseProfile: "Enterprise",
              settings: {
                mode: "speak",
                tableMode: "summary",
                codeMode: "literal",
                mathMode: "skip",
                footnoteMode: "inline",
                imageMode: "altFirst",
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
          codeMode: "literal",
          mathMode: "skip",
          footnoteMode: "inline",
          imageMode: "altFirst",
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
