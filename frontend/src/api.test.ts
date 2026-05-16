import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  backendAssetUrl,
  createCustomSpeechPolicyProfile,
  createPreparedSource,
  deleteProject,
  previewContentIRSpeechPolicy,
  isApiNotFoundError,
  previewPreparedSourceSpeechPolicy,
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
        profile: "Accessibility",
        overrides: { codeMode: "literal" },
      });
      expect(source.speechPolicyProfile).toBe("Accessibility");
      expect(requestInit?.method).toBe("POST");
      expect(requestInit?.headers).toEqual({ "Content-Type": "application/json" });
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"codeMode":"literal"',
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
        profile: "Enterprise",
        overrides: { tableMode: "rowLinear" },
      });
      expect(document.id).toBe("source-1");
      expect(requestUrl).toBe("/api/content-ir/source-1/speech-policy/preview");
      expect(requestInit?.method).toBe("POST");
      expect(typeof requestInit?.body === "string" ? requestInit.body : "").toContain(
        '"tableMode":"rowLinear"',
      );
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
