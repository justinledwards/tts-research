export const READER_ACCESSIBILITY_STORAGE_KEY = "tts-reader-accessibility-v1";

export const READER_TEXT_SCALE_OPTIONS = ["compact", "comfortable", "large", "giant"] as const;
export const READER_LINE_SPACING_OPTIONS = ["compact", "comfortable", "spacious"] as const;
export const READER_MEASURE_OPTIONS = ["narrow", "comfortable", "wide"] as const;

export type ReaderTextScale = (typeof READER_TEXT_SCALE_OPTIONS)[number];
export type ReaderLineSpacing = (typeof READER_LINE_SPACING_OPTIONS)[number];
export type ReaderMeasure = (typeof READER_MEASURE_OPTIONS)[number];

export type ReaderKeyboardCommand =
  | "bookmark"
  | "close"
  | "restart"
  | "seekBackward"
  | "seekForward"
  | "speedDown"
  | "speedUp"
  | "togglePlayback";

export interface ReaderAccessibilitySettings {
  highContrast: boolean;
  lineSpacing: ReaderLineSpacing;
  measure: ReaderMeasure;
  reducedMotion: boolean;
  textScale: ReaderTextScale;
}

export interface ReaderLiveAnnouncementInput {
  activeWordIndex?: number;
  fragmentIndex?: number;
  scopeLabel?: string | null;
  surfaceTitle: string;
}

export const READER_PLAYBACK_RATES = [0.8, 1, 1.25, 1.5] as const;

export const DEFAULT_READER_ACCESSIBILITY_SETTINGS: ReaderAccessibilitySettings = {
  highContrast: false,
  lineSpacing: "comfortable",
  measure: "comfortable",
  reducedMotion: false,
  textScale: "large",
};

export const READER_TEXT_SCALE_LABELS: Record<ReaderTextScale, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  giant: "Giant",
  large: "Large",
};

export const READER_LINE_SPACING_LABELS: Record<ReaderLineSpacing, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};

export const READER_MEASURE_LABELS: Record<ReaderMeasure, string> = {
  comfortable: "Comfortable",
  narrow: "Narrow",
  wide: "Wide",
};

export const READER_TEXT_SCALE_FONT_PX: Record<ReaderTextScale, number> = {
  compact: 18,
  comfortable: 20,
  giant: 30,
  large: 24,
};

export const READER_TEXT_SCALE_CLASS: Record<ReaderTextScale, string> = {
  compact: "text-base sm:text-[17px]",
  comfortable: "text-lg",
  giant: "text-2xl sm:text-3xl",
  large: "text-[21px]",
};

export const READER_LINE_SPACING_CLASS: Record<ReaderLineSpacing, string> = {
  compact: "leading-7",
  comfortable: "leading-9",
  spacious: "leading-[2.05]",
};

export const READER_LINE_HEIGHT_RATIO: Record<ReaderLineSpacing, number> = {
  compact: 1.52,
  comfortable: 1.76,
  spacious: 2.04,
};

export const READER_MEASURE_CLASS: Record<ReaderMeasure, string> = {
  comfortable: "max-w-[780px]",
  narrow: "max-w-[660px]",
  wide: "max-w-[940px]",
};

export const READER_MEASURE_PX: Record<ReaderMeasure, number> = {
  comfortable: 780,
  narrow: 660,
  wide: 940,
};

export function normalizeReaderAccessibilitySettings(value: unknown): ReaderAccessibilitySettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_READER_ACCESSIBILITY_SETTINGS };
  }
  const candidate = value as Partial<ReaderAccessibilitySettings>;
  return {
    highContrast: candidate.highContrast === true,
    lineSpacing: normalizeReaderOption(
      candidate.lineSpacing,
      READER_LINE_SPACING_OPTIONS,
      DEFAULT_READER_ACCESSIBILITY_SETTINGS.lineSpacing,
    ),
    measure: normalizeReaderOption(
      candidate.measure,
      READER_MEASURE_OPTIONS,
      DEFAULT_READER_ACCESSIBILITY_SETTINGS.measure,
    ),
    reducedMotion: candidate.reducedMotion === true,
    textScale: normalizeReaderOption(
      candidate.textScale,
      READER_TEXT_SCALE_OPTIONS,
      DEFAULT_READER_ACCESSIBILITY_SETTINGS.textScale,
    ),
  };
}

export function readerKeyboardCommandForKey(key: string): ReaderKeyboardCommand | null {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  if (normalized === " " || normalized === "k") {
    return "togglePlayback";
  }
  if (normalized === "ArrowLeft" || normalized === "j") {
    return "seekBackward";
  }
  if (normalized === "ArrowRight" || normalized === "l") {
    return "seekForward";
  }
  if (normalized === "Home") {
    return "restart";
  }
  if (normalized === "[") {
    return "speedDown";
  }
  if (normalized === "]") {
    return "speedUp";
  }
  if (normalized === "b") {
    return "bookmark";
  }
  if (normalized === "Escape") {
    return "close";
  }
  return null;
}

export function shouldIgnoreReaderKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "button" ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    Boolean(target.closest("[data-reader-ignore-shortcuts], [data-book-cinema-ignore-shortcuts]"))
  );
}

export function nextReaderPlaybackRate(currentRate: number, direction: -1 | 1): number {
  const currentIndex = READER_PLAYBACK_RATES.findIndex(
    (rate) => Math.abs(rate - currentRate) < 0.01,
  );
  let fallbackIndex = 0;
  for (const [index, rate] of READER_PLAYBACK_RATES.entries()) {
    if (
      Math.abs(rate - currentRate) < Math.abs(READER_PLAYBACK_RATES[fallbackIndex] - currentRate)
    ) {
      fallbackIndex = index;
    }
  }
  const nextIndex = clampNumber(
    (currentIndex === -1 ? fallbackIndex : currentIndex) + direction,
    0,
    READER_PLAYBACK_RATES.length - 1,
  );
  return READER_PLAYBACK_RATES[nextIndex] ?? 1;
}

export function readerLiveAnnouncement(input: ReaderLiveAnnouncementInput): string {
  const parts = [input.surfaceTitle.trim(), input.scopeLabel?.trim()].filter(Boolean);
  if (input.fragmentIndex !== undefined) {
    parts.push(`Fragment ${String(input.fragmentIndex + 1)}`);
  } else if (input.activeWordIndex !== undefined && input.activeWordIndex >= 0) {
    parts.push(`Word ${String(input.activeWordIndex + 1)}`);
  }
  return parts.join(". ");
}

export function readerScrollBehavior(settings: ReaderAccessibilitySettings): ScrollBehavior {
  return settings.reducedMotion ? "auto" : "smooth";
}

export function readerDataAttributes(settings: ReaderAccessibilitySettings) {
  const normalized = normalizeReaderAccessibilitySettings(settings);
  return {
    "data-reader-highlight": normalized.highContrast ? "high-contrast" : "standard",
    "data-reader-line-spacing": normalized.lineSpacing,
    "data-reader-measure": normalized.measure,
    "data-reader-motion": normalized.reducedMotion ? "reduced" : "standard",
    "data-reader-text-scale": normalized.textScale,
  };
}

function normalizeReaderOption<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
