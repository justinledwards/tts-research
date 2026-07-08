import {
  normalizeReaderAccessibilitySettings,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";

export const READING_SURFACE_KINDS = ["source", "spoken", "cue", "theatre"] as const;
export const READING_TYPOGRAPHY_PRESET_IDS = ["editor", "teleprompt", "theatre"] as const;
export const READER_SHELL_STATES = [
  "source-only",
  "generating",
  "unchecked",
  "checked",
  "degraded",
  "stale",
  "failed",
  "retryable",
  "superseded",
] as const;

export type ReadingSurfaceKind = (typeof READING_SURFACE_KINDS)[number];
export type ReadingTypographyPresetId = (typeof READING_TYPOGRAPHY_PRESET_IDS)[number];
export type ReaderShellState = (typeof READER_SHELL_STATES)[number];

export type ReaderShellTone = "danger" | "info" | "neutral" | "success" | "warning";

export interface ReaderShellStateDescriptor {
  readonly label: string;
  readonly modeLabel: string;
  readonly state: ReaderShellState;
  readonly tone: ReaderShellTone;
}

export interface ReaderShellStateInput {
  readonly audioArtifactState?: string | null;
  readonly durableProgressState?: string | null;
  readonly generatedAudioLifecycle?: string | null;
  readonly jobRetriable?: boolean | null;
  readonly jobStatus?: string | null;
  readonly jobTerminalReason?: string | null;
  readonly readAlongRuntimeState?: string | null;
  readonly readAlongTimingState?: string | null;
  readonly readalongManifestState?: string | null;
  readonly readingUnitManifestState?: string | null;
  readonly sourceReadinessState?: string | null;
}

export interface ReadingSurfaceMetrics {
  readonly fontSizePx: number;
  readonly lineHeightRatio: number;
  readonly measureCh: number;
}

export interface ReadingSurfaceMetricInput {
  readonly frameWidthPx: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly measurePx: number;
  readonly visibleActionCount?: number;
  readonly visibleBorderCount?: number;
}

export interface ReadingSurfaceMetricResult {
  readonly approximateCharactersPerLine: number;
  readonly lineHeightRatio: number;
  readonly measurePx: number;
  readonly visualChromeCount: number;
}

export const READING_SURFACE_METRICS: Record<ReadingSurfaceKind, ReadingSurfaceMetrics> = {
  cue: {
    fontSizePx: 40,
    lineHeightRatio: 1.24,
    measureCh: 42,
  },
  source: {
    fontSizePx: 15,
    lineHeightRatio: 1.55,
    measureCh: 82,
  },
  spoken: {
    fontSizePx: 20,
    lineHeightRatio: 1.66,
    measureCh: 66,
  },
  theatre: {
    fontSizePx: 56,
    lineHeightRatio: 1.16,
    measureCh: 24,
  },
};

export const READING_TYPOGRAPHY_PRESET_LABELS: Record<ReadingTypographyPresetId, string> = {
  editor: "Editor",
  teleprompt: "Teleprompt",
  theatre: "Theatre",
};

export const READING_SURFACE_LABELS: Record<ReadingSurfaceKind, string> = {
  cue: "Cue",
  source: "Source",
  spoken: "Spoken",
  theatre: "Theatre",
};

export const READER_SHELL_STATE_DESCRIPTORS: Record<ReaderShellState, ReaderShellStateDescriptor> =
  {
    checked: readerShellDescriptor("checked", "Checked audio", "Checked", "success"),
    degraded: readerShellDescriptor("degraded", "Degraded", "Degraded", "warning"),
    failed: readerShellDescriptor("failed", "Failed", "Failed", "danger"),
    generating: readerShellDescriptor("generating", "Generating", "Generating", "info"),
    retryable: readerShellDescriptor("retryable", "Retryable", "Retry", "warning"),
    "source-only": readerShellDescriptor("source-only", "Source only", "Source", "neutral"),
    stale: readerShellDescriptor("stale", "Stale", "Stale", "warning"),
    superseded: readerShellDescriptor("superseded", "Superseded", "Superseded", "neutral"),
    unchecked: readerShellDescriptor("unchecked", "Unchecked audio", "Unchecked", "warning"),
  };

export function readerShellStateDescriptor(state: ReaderShellState): ReaderShellStateDescriptor {
  return READER_SHELL_STATE_DESCRIPTORS[state];
}

export function deriveReaderShellState(input: ReaderShellStateInput = {}): ReaderShellState {
  const manifestStates = new Set(
    [input.readalongManifestState, input.readingUnitManifestState].map((state) =>
      normalizeStateToken(state),
    ),
  );
  const audioArtifactState = normalizeStateToken(input.audioArtifactState);
  const durableProgressState = normalizeStateToken(input.durableProgressState);
  const generatedAudioLifecycle = normalizeStateToken(input.generatedAudioLifecycle);
  const jobStatus = normalizeStateToken(input.jobStatus);
  const jobTerminalReason = normalizeStateToken(input.jobTerminalReason);
  const readAlongRuntimeState = normalizeStateToken(input.readAlongRuntimeState);
  const readAlongTimingState = normalizeStateToken(input.readAlongTimingState);
  const sourceReadinessState = normalizeStateToken(input.sourceReadinessState);

  if (
    manifestStates.has("superseded") ||
    audioArtifactState === "replaced" ||
    durableProgressState === "superseded"
  ) {
    return "superseded";
  }
  if (
    manifestStates.has("interrupted-retriable") ||
    audioArtifactState === "interrupted-retriable" ||
    audioArtifactState === "retryable" ||
    durableProgressState === "interrupted-retriable" ||
    (jobStatus === "failed" &&
      input.jobRetriable !== false &&
      jobTerminalReason !== "configuration-failed")
  ) {
    return "retryable";
  }
  if (
    manifestStates.has("failed") ||
    audioArtifactState === "failed" ||
    durableProgressState === "failed" ||
    generatedAudioLifecycle === "failed" ||
    sourceReadinessState === "failed"
  ) {
    return "failed";
  }
  if (
    manifestStates.has("stale") ||
    audioArtifactState === "stale" ||
    durableProgressState === "stale" ||
    generatedAudioLifecycle === "stale" ||
    readAlongRuntimeState === "stale-audio" ||
    readAlongTimingState === "stale"
  ) {
    return "stale";
  }
  if (
    manifestStates.has("degraded") ||
    generatedAudioLifecycle === "degraded" ||
    readAlongRuntimeState === "degraded" ||
    readAlongTimingState === "degraded"
  ) {
    return "degraded";
  }
  if (
    audioArtifactState === "generating" ||
    generatedAudioLifecycle === "generating" ||
    generatedAudioLifecycle === "queued" ||
    jobStatus === "queued" ||
    jobStatus === "optimizing" ||
    jobStatus === "synthesizing" ||
    jobStatus === "checking" ||
    jobStatus === "retrying"
  ) {
    return "generating";
  }
  if (audioArtifactState === "checked") {
    return "checked";
  }
  if (audioArtifactState === "unchecked" || generatedAudioLifecycle === "ready") {
    return "unchecked";
  }
  return "source-only";
}

export function normalizeReadingTypographyPresetId(value: unknown): ReadingTypographyPresetId {
  return value === "editor" || value === "teleprompt" || value === "theatre" ? value : "editor";
}

export function applyReaderTypographyPreset(
  presetId: ReadingTypographyPresetId,
  current: ReaderAccessibilitySettings,
): ReaderAccessibilitySettings {
  const settings = normalizeReaderAccessibilitySettings(current);
  if (presetId === "theatre") {
    return {
      ...settings,
      highContrast: true,
      lineSpacing: "compact",
      measure: "narrow",
      textScale: "giant",
    };
  }
  if (presetId === "teleprompt") {
    return {
      ...settings,
      lineSpacing: "comfortable",
      measure: "narrow",
      textScale: "large",
    };
  }
  return {
    ...settings,
    lineSpacing: "compact",
    measure: "wide",
    textScale: "comfortable",
  };
}

export function readerTypographyPresetForSettings(
  value: ReaderAccessibilitySettings,
): ReadingTypographyPresetId {
  const settings = normalizeReaderAccessibilitySettings(value);
  if (
    settings.highContrast &&
    settings.lineSpacing === "compact" &&
    settings.measure === "narrow" &&
    settings.textScale === "giant"
  ) {
    return "theatre";
  }
  if (
    settings.lineSpacing === "comfortable" &&
    settings.measure === "narrow" &&
    settings.textScale === "large"
  ) {
    return "teleprompt";
  }
  if (
    settings.lineSpacing === "compact" &&
    settings.measure === "wide" &&
    settings.textScale === "comfortable"
  ) {
    return "editor";
  }
  return "editor";
}

export function readingSurfaceDataAttributes({
  active = false,
  kind,
  presetId,
  shellState,
}: Readonly<{
  active?: boolean;
  kind: ReadingSurfaceKind;
  presetId?: ReadingTypographyPresetId;
  shellState?: ReaderShellState | ReaderShellStateInput;
}>): Record<string, string> {
  const metrics = READING_SURFACE_METRICS[kind];
  const readerShellState = shellState ? normalizeReaderShellState(shellState) : null;
  const readerShellDescriptor = readerShellState
    ? readerShellStateDescriptor(readerShellState)
    : null;
  return {
    "data-reading-active-emphasis": active ? "dominant" : "normal",
    "data-reading-line-height": metrics.lineHeightRatio.toString(),
    "data-reading-measure-ch": metrics.measureCh.toString(),
    "data-reading-surface": kind,
    "data-reading-typography-preset": presetId ?? presetForReadingSurface(kind),
    ...(readerShellDescriptor
      ? {
          "data-reader-shell-mode-label": readerShellDescriptor.modeLabel,
          "data-reader-shell-state": readerShellDescriptor.state,
        }
      : {}),
  };
}

export function readingSurfaceClassName(kind: ReadingSurfaceKind): string {
  return `reading-surface reading-surface--${kind}`;
}

export function readingSurfaceMetricsFromElement(
  input: ReadingSurfaceMetricInput,
): ReadingSurfaceMetricResult {
  const fontSizePx = positiveNumber(input.fontSizePx, 16);
  const measurePx = Math.min(
    positiveNumber(input.measurePx, input.frameWidthPx),
    positiveNumber(input.frameWidthPx, input.measurePx),
  );
  return {
    approximateCharactersPerLine: Math.round(measurePx / (fontSizePx * 0.5)),
    lineHeightRatio: Number(
      (positiveNumber(input.lineHeightPx, fontSizePx * 1.5) / fontSizePx).toFixed(2),
    ),
    measurePx: Math.round(measurePx),
    visualChromeCount:
      Math.max(0, input.visibleActionCount ?? 0) + Math.max(0, input.visibleBorderCount ?? 0),
  };
}

function presetForReadingSurface(kind: ReadingSurfaceKind): ReadingTypographyPresetId {
  if (kind === "cue") {
    return "teleprompt";
  }
  if (kind === "theatre") {
    return "theatre";
  }
  return "editor";
}

function readerShellDescriptor(
  state: ReaderShellState,
  label: string,
  modeLabel: string,
  tone: ReaderShellTone,
): ReaderShellStateDescriptor {
  return { label, modeLabel, state, tone };
}

function normalizeReaderShellState(
  input: ReaderShellState | ReaderShellStateInput,
): ReaderShellState {
  return typeof input === "string" ? input : deriveReaderShellState(input);
}

function normalizeStateToken(value: string | null | undefined): string {
  return (value ?? "").trim().replaceAll("_", "-").toLowerCase();
}

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
