import { describe, expect, it } from "vitest";
import {
  DEFAULT_READ_ALONG_PREFERENCES,
  effectiveReadAlongPreferences,
  normalizeReadAlongPreferences,
  readAlongCalibrationOffsetMs,
  readAlongPreferenceDataAttributes,
  readAlongVisualModeFromPreferences,
} from "./readAlongPreferences";

describe("read-along preferences", () => {
  it("normalizes unknown preference values and clamps calibration offsets", () => {
    const preferences = normalizeReadAlongPreferences({
      globalHighlightOffsetMs: 2600,
      highlightGranularity: "nonsense",
      providerOffsetsMs: {
        kokoro: -2600,
      },
      scope: "project",
    });

    expect(preferences.highlightGranularity).toBe(
      DEFAULT_READ_ALONG_PREFERENCES.highlightGranularity,
    );
    expect(preferences.scope).toBe("project");
    expect(preferences.globalHighlightOffsetMs).toBe(2000);
    expect(preferences.providerOffsetsMs.kokoro).toBe(-2000);
  });

  it("falls back from word highlights when confidence is too low", () => {
    const snapshot = {
      confidence: 0.42,
      mode: "word" as const,
      state: "synced-word" as const,
    };

    expect(
      readAlongVisualModeFromPreferences(snapshot, {
        ...DEFAULT_READ_ALONG_PREFERENCES,
        highlightGranularity: "word",
        syncStrictness: "phraseFallback",
      }),
    ).toBe("phrase");
    expect(
      readAlongVisualModeFromPreferences(snapshot, {
        ...DEFAULT_READ_ALONG_PREFERENCES,
        highlightGranularity: "word",
        syncStrictness: "blockFallback",
      }),
    ).toBe("block");
  });

  it("lets high contrast and reduced motion make highlight behavior safer", () => {
    const preferences = effectiveReadAlongPreferences(
      {
        ...DEFAULT_READ_ALONG_PREFERENCES,
        highlightStyle: "leftBar",
        scrollFollow: "telepromptContinuous",
        segmentBoundary: {
          autoAdvance: true,
          fadePreviousPhrase: true,
          flashSegment: true,
          pauseAtSegmentBoundary: false,
        },
      },
      { highContrast: true, reducedMotion: true },
    );

    expect(preferences.highlightStyle).toBe("highContrastShape");
    expect(preferences.scrollFollow).toBe("gentle");
    expect(preferences.segmentBoundary.flashSegment).toBe(false);
    expect(preferences.segmentBoundary.fadePreviousPhrase).toBe(false);
  });

  it("reports calibration and data attributes for reader surfaces", () => {
    const preferences = normalizeReadAlongPreferences({
      globalHighlightOffsetMs: 75,
      highlightStyle: "outline",
      providerOffsetsMs: {
        mock: -25,
      },
      scrollFollow: "centerCurrentLine",
    });

    expect(readAlongCalibrationOffsetMs(preferences, "mock")).toBe(50);
    expect(readAlongPreferenceDataAttributes(preferences)).toMatchObject({
      "data-readalong-highlight-style": "outline",
      "data-readalong-scroll-follow": "centerCurrentLine",
    });
  });
});
