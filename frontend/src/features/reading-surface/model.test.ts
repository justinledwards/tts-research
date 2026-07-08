import { describe, expect, it } from "vitest";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import {
  READER_SHELL_STATES,
  applyReaderTypographyPreset,
  deriveReaderShellState,
  readerShellStateDescriptor,
  normalizeReadingTypographyPresetId,
  readerTypographyPresetForSettings,
  readingSurfaceDataAttributes,
  readingSurfaceMetricsFromElement,
} from "./model";

describe("reading surface model", () => {
  it("maps typography presets onto existing reader settings", () => {
    expect(
      applyReaderTypographyPreset("editor", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      lineSpacing: "compact",
      measure: "wide",
      textScale: "comfortable",
    });
    expect(
      applyReaderTypographyPreset("teleprompt", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      lineSpacing: "comfortable",
      measure: "narrow",
      textScale: "large",
    });
    expect(
      applyReaderTypographyPreset("theatre", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      highContrast: true,
      lineSpacing: "compact",
      measure: "narrow",
      textScale: "giant",
    });
  });

  it("normalizes unknown preset ids without requiring storage migration", () => {
    expect(normalizeReadingTypographyPresetId("teleprompt")).toBe("teleprompt");
    expect(normalizeReadingTypographyPresetId("unknown")).toBe("editor");
    expect(normalizeReadingTypographyPresetId(null)).toBe("editor");
  });

  it("recognizes stored settings that match typography presets", () => {
    expect(
      readerTypographyPresetForSettings(
        applyReaderTypographyPreset("teleprompt", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
      ),
    ).toBe("teleprompt");
    expect(
      readerTypographyPresetForSettings(
        applyReaderTypographyPreset("theatre", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
      ),
    ).toBe("theatre");
  });

  it("publishes line length, line height, and active emphasis data attributes", () => {
    expect(readingSurfaceDataAttributes({ active: true, kind: "theatre" })).toMatchObject({
      "data-reading-active-emphasis": "dominant",
      "data-reading-measure-ch": "24",
      "data-reading-surface": "theatre",
      "data-reading-typography-preset": "theatre",
    });
  });

  it("derives the Reader shell state vocabulary from existing source and artifact state", () => {
    expect(deriveReaderShellState({ generatedAudioLifecycle: "missing" })).toBe("source-only");
    expect(deriveReaderShellState({ generatedAudioLifecycle: "generating" })).toBe("generating");
    expect(deriveReaderShellState({ audioArtifactState: "unchecked" })).toBe("unchecked");
    expect(deriveReaderShellState({ audioArtifactState: "checked" })).toBe("checked");
    expect(deriveReaderShellState({ generatedAudioLifecycle: "ready" })).toBe("unchecked");
    expect(deriveReaderShellState({ readalongManifestState: "degraded" })).toBe("degraded");
    expect(deriveReaderShellState({ generatedAudioLifecycle: "stale" })).toBe("stale");
    expect(deriveReaderShellState({ readalongManifestState: "failed" })).toBe("failed");
    expect(deriveReaderShellState({ audioArtifactState: "retryable" })).toBe("retryable");
    expect(deriveReaderShellState({ readalongManifestState: "superseded" })).toBe("superseded");
  });

  it("does not promote ready generated audio to checked without checked artifact evidence", () => {
    expect(deriveReaderShellState({ generatedAudioLifecycle: "ready" })).toBe("unchecked");
    expect(
      deriveReaderShellState({
        audioArtifactState: "unchecked",
        generatedAudioLifecycle: "ready",
      }),
    ).toBe("unchecked");
    expect(
      deriveReaderShellState({
        audioArtifactState: "checked",
        generatedAudioLifecycle: "ready",
      }),
    ).toBe("checked");
  });

  it("derives shell states from durable progress without treating current progress as audio-ready", () => {
    expect(deriveReaderShellState({ durableProgressState: "interrupted_retriable" })).toBe(
      "retryable",
    );
    expect(deriveReaderShellState({ durableProgressState: "interrupted-retriable" })).toBe(
      "retryable",
    );
    expect(deriveReaderShellState({ durableProgressState: "failed" })).toBe("failed");
    expect(deriveReaderShellState({ durableProgressState: "stale" })).toBe("stale");
    expect(deriveReaderShellState({ durableProgressState: "superseded" })).toBe("superseded");

    expect(deriveReaderShellState({ durableProgressState: "current" })).toBe("source-only");
    expect(deriveReaderShellState({ durableProgressState: "remapped" })).toBe("source-only");
    expect(
      deriveReaderShellState({ durableProgressState: "current", audioArtifactState: "checked" }),
    ).toBe("checked");
  });

  it("pins mixed shell-state precedence and unknown-token fallback", () => {
    expect(
      deriveReaderShellState({
        audioArtifactState: "retryable",
        generatedAudioLifecycle: "failed",
        readalongManifestState: "superseded",
      }),
    ).toBe("superseded");
    expect(
      deriveReaderShellState({
        audioArtifactState: "retryable",
        generatedAudioLifecycle: "failed",
        readAlongRuntimeState: "stale-audio",
      }),
    ).toBe("retryable");
    expect(
      deriveReaderShellState({
        generatedAudioLifecycle: "failed",
        readAlongRuntimeState: "stale-audio",
      }),
    ).toBe("failed");
    expect(
      deriveReaderShellState({
        readAlongRuntimeState: "stale-audio",
        readAlongTimingState: "degraded",
      }),
    ).toBe("stale");
    expect(
      deriveReaderShellState({
        audioArtifactState: "not-a-real-state",
        generatedAudioLifecycle: "also-unknown",
        readalongManifestState: "unknown",
      }),
    ).toBe("source-only");
  });

  it("keeps Reader shell labels and mode labels explicit and deterministic", () => {
    expect(READER_SHELL_STATES.map((state) => readerShellStateDescriptor(state).label)).toEqual([
      "Source only",
      "Generating",
      "Unchecked audio",
      "Checked audio",
      "Degraded",
      "Stale",
      "Failed",
      "Retryable",
      "Superseded",
    ]);
    expect(
      readingSurfaceDataAttributes({ kind: "spoken", shellState: "checked" as const }),
    ).toMatchObject({
      "data-reader-shell-mode-label": "Checked",
      "data-reader-shell-state": "checked",
    });
  });

  it("derives comparable reader metrics from measured elements", () => {
    expect(
      readingSurfaceMetricsFromElement({
        fontSizePx: 20,
        frameWidthPx: 1200,
        lineHeightPx: 33,
        measurePx: 660,
        visibleActionCount: 4,
        visibleBorderCount: 2,
      }),
    ).toEqual({
      approximateCharactersPerLine: 66,
      lineHeightRatio: 1.65,
      measurePx: 660,
      visualChromeCount: 6,
    });
  });
});
