import {
  normalizeReaderAccessibilitySettings,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";

export const READING_SURFACE_KINDS = ["source", "spoken", "cue", "theatre"] as const;
export const READING_TYPOGRAPHY_PRESET_IDS = ["editor", "teleprompt", "theatre"] as const;

export type ReadingSurfaceKind = (typeof READING_SURFACE_KINDS)[number];
export type ReadingTypographyPresetId = (typeof READING_TYPOGRAPHY_PRESET_IDS)[number];

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
}: Readonly<{
  active?: boolean;
  kind: ReadingSurfaceKind;
  presetId?: ReadingTypographyPresetId;
}>): Record<string, string> {
  const metrics = READING_SURFACE_METRICS[kind];
  return {
    "data-reading-active-emphasis": active ? "dominant" : "normal",
    "data-reading-line-height": metrics.lineHeightRatio.toString(),
    "data-reading-measure-ch": metrics.measureCh.toString(),
    "data-reading-surface": kind,
    "data-reading-typography-preset": presetId ?? presetForReadingSurface(kind),
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

function positiveNumber(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
