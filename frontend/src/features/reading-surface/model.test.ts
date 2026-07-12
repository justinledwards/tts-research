import { describe, expect, it } from "vitest";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import {
  READER_SHELL_STATES,
  READER_TRANSPORT_STATES,
  applyReaderTypographyPreset,
  deriveReaderShellState,
  deriveReaderTransportStateDescriptor,
  readerShellStateDescriptor,
  readerTransportStateDescriptor,
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
    expect(deriveReaderShellState({ sourceReadinessState: "stale" })).toBe("stale");
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

  it("derives Reader transport categories from shell and artifact evidence", () => {
    expect(
      deriveReaderTransportStateDescriptor({ generatedAudioLifecycle: "missing" }),
    ).toMatchObject({
      canStartPlayback: false,
      state: "pre-audio",
    });
    expect(
      deriveReaderTransportStateDescriptor({ sourceReadinessState: "prepared" }),
    ).toMatchObject({
      canStartPlayback: false,
      state: "pre-audio",
    });

    for (const jobStatus of ["queued", "checking", "retrying"] as const) {
      expect(deriveReaderTransportStateDescriptor({ jobStatus })).toMatchObject({
        canStartPlayback: false,
        state: "generating",
      });
    }
    expect(
      deriveReaderTransportStateDescriptor({ generatedAudioLifecycle: "generating" }).state,
    ).toBe("generating");

    expect(
      deriveReaderTransportStateDescriptor({ generatedAudioLifecycle: "ready" }),
    ).toMatchObject({
      canClaimCheckedAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "unchecked",
    });
    expect(deriveReaderTransportStateDescriptor({ audioArtifactState: "checked" })).toMatchObject({
      canClaimCheckedAudio: true,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "checked",
    });
  });

  it("claims exact read-along only with checked current audio and explicit exact sync evidence", () => {
    expect(deriveReaderTransportStateDescriptor({ audioArtifactState: "checked" })).toMatchObject({
      canClaimCheckedAudio: true,
      canClaimCurrentAudio: true,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "checked",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readAlongExactSync: false,
      }),
    ).toMatchObject({
      canClaimCheckedAudio: true,
      canClaimCurrentAudio: true,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "checked",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readAlongExactSync: true,
      }),
    ).toMatchObject({
      canClaimCheckedAudio: true,
      canClaimCurrentAudio: true,
      canClaimExactReadAlong: true,
      canStartPlayback: true,
      state: "checked",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readAlongExactSync: true,
        readAlongTimingState: "degraded",
      }),
    ).toMatchObject({
      canClaimExactReadAlong: false,
      state: "degraded",
    });
  });

  it("does not let degraded evidence alone claim playable current audio", () => {
    for (const input of [
      { generatedAudioLifecycle: "degraded" },
      { readAlongRuntimeState: "degraded" },
      { readAlongTimingState: "degraded" },
      { readalongManifestState: "degraded" },
      { readingUnitManifestState: "degraded" },
    ] as const) {
      expect(deriveReaderTransportStateDescriptor(input)).toMatchObject({
        canClaimCurrentAudio: false,
        canStartPlayback: false,
        state: "degraded",
      });
    }
    expect(readerTransportStateDescriptor("degraded")).toMatchObject({
      canClaimCurrentAudio: false,
      canStartPlayback: false,
    });
  });

  it("allows degraded playback only with explicit playable current audio evidence", () => {
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "unchecked",
        readAlongRuntimeState: "degraded",
        readAlongTimingState: "degraded",
      }),
    ).toMatchObject({
      canClaimCheckedAudio: false,
      canClaimCurrentAudio: true,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "degraded",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        generatedAudioLifecycle: "ready",
        readAlongTimingState: "degraded",
      }),
    ).toMatchObject({
      canClaimCurrentAudio: true,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "degraded",
    });
  });

  it("pins Reader transport precedence without overclaiming readiness", () => {
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readalongManifestState: "superseded",
      }),
    ).toMatchObject({
      canClaimCurrentAudio: false,
      canStartPlayback: false,
      state: "stale-replaced",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        generatedAudioLifecycle: "stale",
      }).state,
    ).toBe("stale-replaced");
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readAlongRuntimeState: "degraded",
      }),
    ).toMatchObject({
      canClaimCheckedAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: true,
      state: "degraded",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "retryable",
        generatedAudioLifecycle: "failed",
        readAlongRuntimeState: "stale-audio",
      }),
    ).toMatchObject({
      retryAllowed: true,
      state: "failed-retryable",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        generatedAudioLifecycle: "failed",
        jobRetriable: false,
        jobStatus: "failed",
      }),
    ).toMatchObject({
      canStartPlayback: false,
      retryAllowed: false,
      state: "failed-retryable",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        generatedAudioLifecycle: "unknown-ready-ish",
      }).state,
    ).toBe("checked");
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "unknown-checked-ish",
        generatedAudioLifecycle: "unknown-ready-ish",
      }),
    ).toMatchObject({
      canStartPlayback: false,
      state: "pre-audio",
    });
  });

  it("maps non-retryable failed jobs to failed transport without hiding them behind checked audio", () => {
    expect(
      deriveReaderTransportStateDescriptor({ jobRetriable: false, jobStatus: "failed" }),
    ).toMatchObject({
      canStartPlayback: false,
      retryAllowed: false,
      state: "failed-retryable",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        jobStatus: "failed",
        jobTerminalReason: "configuration-failed",
      }),
    ).toMatchObject({
      canStartPlayback: false,
      retryAllowed: false,
      state: "failed-retryable",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        jobRetriable: false,
        jobStatus: "failed",
        readAlongExactSync: true,
      }),
    ).toMatchObject({
      canClaimCheckedAudio: false,
      canClaimCurrentAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: false,
      retryAllowed: false,
      state: "failed-retryable",
    });
  });

  it("does not let readerShellState weaken stronger raw transport evidence", () => {
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "replaced",
        readerShellState: "checked",
        readAlongExactSync: true,
      }),
    ).toMatchObject({
      canClaimCurrentAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: false,
      state: "stale-replaced",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        readerShellState: "checked",
        readAlongExactSync: true,
        sourceReadinessState: "stale",
      }),
    ).toMatchObject({
      canClaimCurrentAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: false,
      state: "stale-replaced",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "checked",
        readAlongExactSync: true,
        sourceReadinessState: "stale",
      }),
    ).toMatchObject({
      canClaimCurrentAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: false,
      state: "stale-replaced",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        generatedAudioLifecycle: "failed",
        readerShellState: "checked",
      }),
    ).toMatchObject({
      canStartPlayback: false,
      state: "failed-retryable",
    });
    expect(
      deriveReaderTransportStateDescriptor({
        audioArtifactState: "replaced",
        generatedAudioLifecycle: "ready",
        readerShellState: "degraded",
      }),
    ).toMatchObject({
      canClaimCurrentAudio: false,
      canClaimExactReadAlong: false,
      canStartPlayback: false,
      state: "stale-replaced",
    });
  });

  it("keeps Reader transport labels, reasons, and descriptors explicit", () => {
    expect(
      READER_TRANSPORT_STATES.map((state) => readerTransportStateDescriptor(state).label),
    ).toEqual([
      "Pre-audio",
      "Generating",
      "Unchecked audio",
      "Checked audio",
      "Stale or replaced",
      "Failed or retryable",
      "Degraded playback",
    ]);
    expect(readerTransportStateDescriptor("generating")).toMatchObject({
      disabledReason: "Audio generation is still in progress.",
      recoveryReason: "Wait for generation to finish before starting playback.",
    });
    expect(
      readerTransportStateDescriptor("failed-retryable", { retryAllowed: true }),
    ).toMatchObject({
      recoveryReason: "Retry generation before playback.",
      retryAllowed: true,
    });
    expect(
      readerTransportStateDescriptor("failed-retryable", { retryAllowed: false }),
    ).toMatchObject({
      recoveryReason: "Resolve the failed audio state before playback.",
      retryAllowed: false,
    });
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
