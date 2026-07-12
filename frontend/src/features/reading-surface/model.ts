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
export const READER_TRANSPORT_STATES = [
  "pre-audio",
  "generating",
  "unchecked",
  "checked",
  "stale-replaced",
  "failed-retryable",
  "degraded",
] as const;

export type ReadingSurfaceKind = (typeof READING_SURFACE_KINDS)[number];
export type ReadingTypographyPresetId = (typeof READING_TYPOGRAPHY_PRESET_IDS)[number];
export type ReaderShellState = (typeof READER_SHELL_STATES)[number];
export type ReaderTransportState = (typeof READER_TRANSPORT_STATES)[number];

export type ReaderShellTone = "danger" | "info" | "neutral" | "success" | "warning";

export interface ReaderShellStateDescriptor {
  readonly label: string;
  readonly modeLabel: string;
  readonly state: ReaderShellState;
  readonly tone: ReaderShellTone;
}

export interface ReaderTransportStateDescriptor {
  readonly canClaimCheckedAudio: boolean;
  readonly canClaimCurrentAudio: boolean;
  readonly canClaimExactReadAlong: boolean;
  readonly canStartPlayback: boolean;
  readonly disabledReason: string | null;
  readonly label: string;
  readonly recoveryReason: string | null;
  readonly retryAllowed: boolean | null;
  readonly state: ReaderTransportState;
  readonly tone: ReaderShellTone;
}

export interface ReaderTransportStateDescriptorOptions {
  readonly retryAllowed?: boolean | null;
}

export interface ReaderTransportStateInput extends ReaderShellStateInput {
  readonly readAlongExactSync?: boolean | null;
  readonly readerShellState?: ReaderShellState | null;
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

export const READER_TRANSPORT_STATE_DESCRIPTORS: Record<
  ReaderTransportState,
  ReaderTransportStateDescriptor
> = {
  checked: readerTransportDescriptor({
    canClaimCheckedAudio: true,
    canClaimCurrentAudio: true,
    canClaimExactReadAlong: false,
    canStartPlayback: true,
    disabledReason: null,
    label: "Checked audio",
    recoveryReason: null,
    state: "checked",
    tone: "success",
  }),
  degraded: readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: false,
    canClaimExactReadAlong: false,
    canStartPlayback: false,
    disabledReason: "No playable current audio evidence is available for degraded playback.",
    label: "Degraded playback",
    recoveryReason:
      "Provide current audio before playback; exact read-along sync remains degraded.",
    state: "degraded",
    tone: "warning",
  }),
  "failed-retryable": readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: false,
    canClaimExactReadAlong: false,
    canStartPlayback: false,
    disabledReason: "Generation did not complete or was interrupted.",
    label: "Failed or retryable",
    recoveryReason: "Retry or resolve generation before playback.",
    state: "failed-retryable",
    tone: "danger",
  }),
  generating: readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: false,
    canClaimExactReadAlong: false,
    canStartPlayback: false,
    disabledReason: "Audio generation is still in progress.",
    label: "Generating",
    recoveryReason: "Wait for generation to finish before starting playback.",
    state: "generating",
    tone: "info",
  }),
  "pre-audio": readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: false,
    canClaimExactReadAlong: false,
    canStartPlayback: false,
    disabledReason: "No generated audio is ready yet.",
    label: "Pre-audio",
    recoveryReason: "Generate audio before starting playback.",
    state: "pre-audio",
    tone: "neutral",
  }),
  "stale-replaced": readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: false,
    canClaimExactReadAlong: false,
    canStartPlayback: false,
    disabledReason: "Audio is stale, superseded, or replaced.",
    label: "Stale or replaced",
    recoveryReason: "Regenerate current audio before playback.",
    state: "stale-replaced",
    tone: "warning",
  }),
  unchecked: readerTransportDescriptor({
    canClaimCheckedAudio: false,
    canClaimCurrentAudio: true,
    canClaimExactReadAlong: false,
    canStartPlayback: true,
    disabledReason: null,
    label: "Unchecked audio",
    recoveryReason: "Audio can play, but checked artifact evidence is absent.",
    state: "unchecked",
    tone: "warning",
  }),
};

export function readerTransportStateDescriptor(
  state: ReaderTransportState,
  options: ReaderTransportStateDescriptorOptions = {},
): ReaderTransportStateDescriptor {
  const descriptor = READER_TRANSPORT_STATE_DESCRIPTORS[state];
  if (state !== "failed-retryable" || options.retryAllowed === undefined) {
    return descriptor;
  }
  const retryAllowed = options.retryAllowed;
  let recoveryReason = descriptor.recoveryReason;
  if (retryAllowed === true) {
    recoveryReason = "Retry generation before playback.";
  } else if (retryAllowed === false) {
    recoveryReason = "Resolve the failed audio state before playback.";
  }
  return {
    ...descriptor,
    recoveryReason,
    retryAllowed,
  };
}

export function deriveReaderTransportState(
  input: ReaderTransportStateInput = {},
): ReaderTransportState {
  const rawShellState = deriveReaderShellState(input);
  const shellState = isBlockingRawReaderShellState(rawShellState)
    ? rawShellState
    : (input.readerShellState ?? rawShellState);
  switch (shellState) {
    case "generating": {
      return "generating";
    }
    case "unchecked": {
      return "unchecked";
    }
    case "checked": {
      return "checked";
    }
    case "degraded": {
      return "degraded";
    }
    case "stale":
    case "superseded": {
      return "stale-replaced";
    }
    case "failed":
    case "retryable": {
      return "failed-retryable";
    }
    case "source-only": {
      return "pre-audio";
    }
  }
}

export function deriveReaderTransportStateDescriptor(
  input: ReaderTransportStateInput = {},
): ReaderTransportStateDescriptor {
  const state = deriveReaderTransportState(input);
  const descriptor = readerTransportStateDescriptor(state, {
    retryAllowed: state === "failed-retryable" ? deriveTransportRetryAllowed(input) : null,
  });
  if (state === "checked" && input.readAlongExactSync === true) {
    return {
      ...descriptor,
      canClaimExactReadAlong: true,
    };
  }
  if (state !== "degraded" || !hasPlayableCurrentAudioEvidence(input)) {
    return descriptor;
  }
  return {
    ...descriptor,
    canClaimCurrentAudio: true,
    canStartPlayback: true,
    disabledReason: null,
    recoveryReason: "Playback may be available, but exact read-along sync is degraded.",
  };
}

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
    jobStatus === "failed" ||
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
    readAlongTimingState === "stale" ||
    sourceReadinessState === "stale"
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

function readerTransportDescriptor(
  descriptor: Omit<ReaderTransportStateDescriptor, "retryAllowed"> &
    Pick<Partial<ReaderTransportStateDescriptor>, "retryAllowed">,
): ReaderTransportStateDescriptor {
  return { retryAllowed: null, ...descriptor };
}

function deriveTransportRetryAllowed(input: ReaderTransportStateInput): boolean | null {
  const manifestStates = new Set(
    [input.readalongManifestState, input.readingUnitManifestState].map((state) =>
      normalizeStateToken(state),
    ),
  );
  const audioArtifactState = normalizeStateToken(input.audioArtifactState);
  const durableProgressState = normalizeStateToken(input.durableProgressState);
  const jobStatus = normalizeStateToken(input.jobStatus);
  const jobTerminalReason = normalizeStateToken(input.jobTerminalReason);

  if (
    jobStatus === "failed" &&
    (input.jobRetriable === false || jobTerminalReason === "configuration-failed")
  ) {
    return false;
  }

  if (input.readerShellState === "retryable") {
    return true;
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
    return true;
  }
  if (input.jobRetriable === false || jobTerminalReason === "configuration-failed") {
    return false;
  }
  return null;
}

function isBlockingRawReaderShellState(state: ReaderShellState): boolean {
  return (
    state === "degraded" ||
    state === "failed" ||
    state === "retryable" ||
    state === "stale" ||
    state === "superseded"
  );
}

function hasPlayableCurrentAudioEvidence(input: ReaderTransportStateInput): boolean {
  const audioArtifactState = normalizeStateToken(input.audioArtifactState);
  const generatedAudioLifecycle = normalizeStateToken(input.generatedAudioLifecycle);

  return (
    audioArtifactState === "checked" ||
    audioArtifactState === "unchecked" ||
    generatedAudioLifecycle === "ready"
  );
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
