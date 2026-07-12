import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LazyPanelFallback,
  recordFrontendDegradedState,
  resolveTimingConfidenceDisplay,
  useInteractionTiming,
} from ".";
import type { HighlightMap } from "../../types";

function TimingProbe() {
  const timing = useInteractionTiming("reader-resume");
  timing.start({ targetId: "book-1" });
  timing.end({ usedLocator: true });
  return null;
}

describe("frontend performance helpers", () => {
  beforeEach(() => {
    globalThis.__ttsResearchPerformance = undefined;
  });

  it("records interaction timings through the shared hook", () => {
    renderToStaticMarkup(<TimingProbe />);

    expect(globalThis.__ttsResearchPerformance?.metrics).toHaveLength(1);
    expect(globalThis.__ttsResearchPerformance?.metrics[0]?.name).toBe("reader-resume");
    expect(globalThis.__ttsResearchPerformance?.metrics[0]?.detail).toEqual({
      targetId: "book-1",
      usedLocator: true,
    });
  });

  it("renders a stable lazy-panel fallback with a specific surface", () => {
    const markup = renderToStaticMarkup(
      <LazyPanelFallback label="Loading Book Cinema..." surface="book-cinema" />,
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-lazy-surface="book-cinema"');
    expect(markup).toContain("Loading Book Cinema...");
  });

  it("deduplicates degraded-state records by name, surface, and detail", () => {
    recordFrontendDegradedState("audio-not-ready", "book-cinema", { jobId: "job-1" });
    recordFrontendDegradedState("audio-not-ready", "book-cinema", { jobId: "job-1" });
    recordFrontendDegradedState("resume-position-fallback", "reader-resume", {
      targetSeconds: 12,
    });

    expect(globalThis.__ttsResearchPerformance?.degradedStates).toHaveLength(2);
    expect(globalThis.__ttsResearchPerformance?.degradedStates.map((item) => item.name)).toEqual([
      "audio-not-ready",
      "resume-position-fallback",
    ]);
  });

  it("explains low-confidence and phrase fallback timing", () => {
    const map = {
      mode: "phrase",
      summary: {
        confidence: { overall: 0.42 },
        lowConfidence: true,
        mode: "phrase",
        reason: "forced fallback",
      },
    } as HighlightMap;

    expect(resolveTimingConfidenceDisplay(map)).toMatchObject({
      detail: "forced fallback",
      isDegraded: true,
      label: "Low confidence",
      status: "low-confidence",
    });
  });
});
