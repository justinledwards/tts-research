import { describe, expect, it } from "vitest";
import { ApiRequestError, backendAssetUrl, deleteProject, isApiNotFoundError } from "./api";

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
});
