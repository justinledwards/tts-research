import {
  readAlongWordRoleForIndex,
  splitHighlightText,
  type HighlightRendererToken,
  type HighlightRendererTokenTransformation,
  type ReadAlongCueRole,
  type ReadAlongHighlightStyle,
  type ReadAlongHighlightVisualMode,
  type ReadAlongTimingState,
  type ReadAlongWordRole,
} from "../readalong";
import {
  READING_SURFACE_METRICS,
  type ReadingSurfaceKind,
  type ReadingSurfaceMetrics,
} from "./model";

export const READING_FOLLOW_ALONG_MODES = [
  "reading-only",
  "audio-follow",
  "manual-rehearsal",
] as const;

export const READING_FOLLOW_ALONG_DISPLAY_PRESET_IDS = [
  "standard",
  "largeText",
  "highContrast",
  "dyslexicFriendly",
] as const;

export type ReadingFollowAlongMode = (typeof READING_FOLLOW_ALONG_MODES)[number];
export type ReadingFollowAlongDisplayPresetId =
  (typeof READING_FOLLOW_ALONG_DISPLAY_PRESET_IDS)[number];

export interface ReadingFollowAlongLineLengthRule {
  readonly maxCh: number;
  readonly targetMaxCh: number;
  readonly targetMinCh: number;
}

export interface ReadingFollowAlongDisplayPreset {
  readonly activeIntensity: "calm" | "strong" | "theatre";
  readonly description: string;
  readonly highlightStyle: ReadAlongHighlightStyle;
  readonly id: ReadingFollowAlongDisplayPresetId;
  readonly label: string;
  readonly lineSpacing: "compact" | "comfortable" | "spacious";
  readonly measure: "narrow" | "comfortable" | "wide";
  readonly wordSpacing: string;
}

export interface ReadingFollowAlongToken extends HighlightRendererToken {
  readonly sourceWordIndex?: number;
  readonly spokenTokenId?: string;
  readonly timingConfidence?: number;
  readonly transformation?: HighlightRendererTokenTransformation;
}

export interface ReadingFollowAlongCueInput {
  readonly cueText?: string | null;
  readonly sourceText?: string | null;
  readonly spokenText?: string | null;
  readonly tokens?: readonly ReadingFollowAlongToken[] | null;
}

export interface ReadingFollowAlongCue {
  readonly cueText: string;
  readonly displayTextSource: "cueText" | "spokenText" | "sourceText" | "empty";
  readonly sourceText: string;
  readonly spokenText: string;
  readonly tokens: readonly ReadingFollowAlongToken[];
}

export interface BuildReadingFollowAlongTokensOptions {
  readonly nodeId?: string;
  readonly sourceId?: string;
  readonly sourceWordIdByWordIndex?: ReadonlyMap<number, string>;
  readonly sourceWordIndexByWordIndex?: ReadonlyMap<number, number>;
  readonly spokenTokenIdByWordIndex?: ReadonlyMap<number, string>;
  readonly timingConfidenceByWordIndex?: ReadonlyMap<number, number>;
  readonly transformationByWordIndex?: ReadonlyMap<number, HighlightRendererTokenTransformation>;
}

export interface ReadingFollowAlongVisualModeInput {
  readonly activeWordIndex?: number | null;
  readonly exactWordTiming?: boolean;
  readonly mode: ReadingFollowAlongMode;
  readonly phraseWordEnd?: number | null;
  readonly phraseWordStart?: number | null;
  readonly requestedVisualMode?: ReadAlongHighlightVisualMode | null;
  readonly timingState: ReadAlongTimingState;
}

export interface ReadingFollowAlongPhraseRangeInput {
  readonly activeWordIndex?: number | null;
  readonly phraseWordEnd?: number | null;
  readonly phraseWordStart?: number | null;
  readonly visualMode: ReadAlongHighlightVisualMode;
  readonly wordIndexes: readonly number[];
}

export interface ReadingFollowAlongWordRoleInput {
  readonly active: boolean;
  readonly activeWordIndex?: number | null;
  readonly cueRole: ReadAlongCueRole;
  readonly phrase: boolean;
  readonly recentWindow?: number;
  readonly token: ReadingFollowAlongToken;
  readonly upcomingWindow?: number;
}

export const READING_FOLLOW_ALONG_TYPOGRAPHY_SCALE: Record<
  ReadingSurfaceKind,
  ReadingSurfaceMetrics
> = READING_SURFACE_METRICS;

export const READING_FOLLOW_ALONG_LINE_LENGTH_RULES: Record<
  ReadingSurfaceKind,
  ReadingFollowAlongLineLengthRule
> = {
  cue: {
    maxCh: 42,
    targetMaxCh: 42,
    targetMinCh: 36,
  },
  source: {
    maxCh: 82,
    targetMaxCh: 82,
    targetMinCh: 72,
  },
  spoken: {
    maxCh: 66,
    targetMaxCh: 66,
    targetMinCh: 58,
  },
  theatre: {
    maxCh: 24,
    targetMaxCh: 24,
    targetMinCh: 18,
  },
};

export const READING_FOLLOW_ALONG_DISPLAY_PRESETS: Record<
  ReadingFollowAlongDisplayPresetId,
  ReadingFollowAlongDisplayPreset
> = {
  dyslexicFriendly: {
    activeIntensity: "calm",
    description: "Wider spacing, generous line height, and low-noise phrase emphasis.",
    highlightStyle: "background",
    id: "dyslexicFriendly",
    label: "Dyslexic friendly",
    lineSpacing: "spacious",
    measure: "narrow",
    wordSpacing: "0.18em",
  },
  highContrast: {
    activeIntensity: "strong",
    description: "High-contrast shape cues with non-color-only active state.",
    highlightStyle: "highContrastShape",
    id: "highContrast",
    label: "High contrast",
    lineSpacing: "comfortable",
    measure: "narrow",
    wordSpacing: "0.08em",
  },
  largeText: {
    activeIntensity: "strong",
    description: "Larger type, narrower measure, and stronger current-word emphasis.",
    highlightStyle: "background",
    id: "largeText",
    label: "Large text",
    lineSpacing: "comfortable",
    measure: "narrow",
    wordSpacing: "0.08em",
  },
  standard: {
    activeIntensity: "calm",
    description: "Balanced spacing with phrase fallback when exact timing is unavailable.",
    highlightStyle: "background",
    id: "standard",
    label: "Standard",
    lineSpacing: "comfortable",
    measure: "comfortable",
    wordSpacing: "normal",
  },
};

export function normalizeReadingFollowAlongPresetId(
  value: unknown,
): ReadingFollowAlongDisplayPresetId {
  return READING_FOLLOW_ALONG_DISPLAY_PRESET_IDS.includes(
    value as ReadingFollowAlongDisplayPresetId,
  )
    ? (value as ReadingFollowAlongDisplayPresetId)
    : "standard";
}

export function readingFollowAlongDisplayPreset(value: unknown): ReadingFollowAlongDisplayPreset {
  return READING_FOLLOW_ALONG_DISPLAY_PRESETS[normalizeReadingFollowAlongPresetId(value)];
}

export function buildReadingFollowAlongTokensFromText(
  value: string,
  options: BuildReadingFollowAlongTokensOptions = {},
): ReadingFollowAlongToken[] {
  return splitHighlightText(value, {
    nodeId: options.nodeId,
    sourceId: options.sourceId,
  }).map((token) => ({
    ...token,
    sourceWordId: options.sourceWordIdByWordIndex?.get(token.wordIndex) ?? token.sourceWordId,
    sourceWordIndex: options.sourceWordIndexByWordIndex?.get(token.wordIndex),
    spokenTokenId: options.spokenTokenIdByWordIndex?.get(token.wordIndex),
    timingConfidence: options.timingConfidenceByWordIndex?.get(token.wordIndex),
    transformation: options.transformationByWordIndex?.get(token.wordIndex) ?? "normal",
  }));
}

export function normalizeReadingFollowAlongCue(
  input: ReadingFollowAlongCueInput | string | null | undefined,
): ReadingFollowAlongCue {
  const cueInput = typeof input === "string" ? { cueText: input } : (input ?? {});
  const sourceText = cueInput.sourceText?.trim() ?? "";
  const spokenText = cueInput.spokenText?.trim() ?? "";
  const cueText = cueInput.cueText?.trim() ?? "";
  const displayTextSource = readingFollowAlongDisplayTextSource({
    cueText,
    sourceText,
    spokenText,
  });
  const displayText = readingFollowAlongDisplayText({
    cueText,
    displayTextSource,
    sourceText,
    spokenText,
  });
  return {
    cueText: displayText,
    displayTextSource,
    sourceText,
    spokenText,
    tokens:
      cueInput.tokens && cueInput.tokens.length > 0
        ? cueInput.tokens
        : buildReadingFollowAlongTokensFromText(displayText),
  };
}

export function readingFollowAlongCanClaimExactWord({
  exactWordTiming,
  timingState,
}: Readonly<{
  exactWordTiming?: boolean;
  timingState: ReadAlongTimingState;
}>): boolean {
  return timingState === "trusted" && exactWordTiming !== false;
}

export function readingFollowAlongVisualMode({
  activeWordIndex,
  exactWordTiming,
  mode,
  phraseWordEnd,
  phraseWordStart,
  requestedVisualMode,
  timingState,
}: ReadingFollowAlongVisualModeInput): ReadAlongHighlightVisualMode {
  if (timingState === "stale") {
    return "none";
  }
  if (timingState === "degraded") {
    return "degraded";
  }
  const canClaimExactWord = readingFollowAlongCanClaimExactWord({
    exactWordTiming,
    timingState,
  });
  if (requestedVisualMode && requestedVisualMode !== "word") {
    return requestedVisualMode;
  }
  if (requestedVisualMode === "word" && canClaimExactWord) {
    return "word";
  }
  if (mode === "audio-follow" && canClaimExactWord) {
    return "word";
  }
  if (
    typeof activeWordIndex === "number" ||
    typeof phraseWordStart === "number" ||
    typeof phraseWordEnd === "number"
  ) {
    return "phrase";
  }
  return mode === "reading-only" ? "block" : "phrase";
}

export function readingFollowAlongPhraseRange({
  activeWordIndex,
  phraseWordEnd,
  phraseWordStart,
  visualMode,
  wordIndexes,
}: ReadingFollowAlongPhraseRangeInput): {
  readonly phraseWordEnd?: number;
  readonly phraseWordStart?: number;
} {
  if (visualMode !== "phrase" && visualMode !== "sentence") {
    return {};
  }
  if (typeof phraseWordStart === "number" && typeof phraseWordEnd === "number") {
    return {
      phraseWordEnd,
      phraseWordStart,
    };
  }
  if (typeof activeWordIndex !== "number" || activeWordIndex < 0 || wordIndexes.length === 0) {
    return {};
  }
  const minWordIndex = Math.min(...wordIndexes);
  const maxWordIndex = Math.max(...wordIndexes);
  return {
    phraseWordEnd: Math.min(maxWordIndex, activeWordIndex + 2),
    phraseWordStart: Math.max(minWordIndex, activeWordIndex - 1),
  };
}

export function readingFollowAlongWordRole({
  active,
  activeWordIndex,
  cueRole,
  phrase,
  recentWindow = 2,
  token,
  upcomingWindow = 2,
}: ReadingFollowAlongWordRoleInput): ReadAlongWordRole {
  if (cueRole === "skipped" || token.transformation === "skipped") {
    return "skipped";
  }
  if (active) {
    return "active";
  }
  if (phrase) {
    return "activePhrase";
  }
  if (token.transformation && token.transformation !== "normal") {
    return "transformed";
  }
  return readAlongWordRoleForIndex({
    active,
    activeWordIndex,
    cueRole,
    phrase,
    recentWindow,
    upcomingWindow,
    wordIndex: token.wordIndex,
  });
}

export function readingFollowAlongDataAttributes({
  canClaimExactWord,
  displayTextSource,
  mode,
  presetId,
  timingState,
  visualMode,
}: Readonly<{
  canClaimExactWord: boolean;
  displayTextSource: ReadingFollowAlongCue["displayTextSource"];
  mode: ReadingFollowAlongMode;
  presetId?: ReadingFollowAlongDisplayPresetId;
  timingState: ReadAlongTimingState;
  visualMode: ReadAlongHighlightVisualMode;
}>): Record<string, string> {
  return {
    "data-reading-followalong-exact-word": canClaimExactWord ? "true" : "false",
    "data-reading-followalong-mode": mode,
    "data-reading-followalong-preset": presetId ?? "standard",
    "data-reading-followalong-renderer": "",
    "data-reading-followalong-text-source": displayTextSource,
    "data-reading-followalong-timing-state": timingState,
    "data-reading-followalong-visual-mode": visualMode,
  };
}

function readingFollowAlongDisplayTextSource({
  cueText,
  sourceText,
  spokenText,
}: Readonly<{
  cueText: string;
  sourceText: string;
  spokenText: string;
}>): ReadingFollowAlongCue["displayTextSource"] {
  if (cueText) {
    return "cueText";
  }
  if (spokenText) {
    return "spokenText";
  }
  if (sourceText) {
    return "sourceText";
  }
  return "empty";
}

function readingFollowAlongDisplayText({
  cueText,
  displayTextSource,
  sourceText,
  spokenText,
}: Readonly<{
  cueText: string;
  displayTextSource: ReadingFollowAlongCue["displayTextSource"];
  sourceText: string;
  spokenText: string;
}>): string {
  switch (displayTextSource) {
    case "cueText": {
      return cueText;
    }
    case "spokenText": {
      return spokenText;
    }
    case "sourceText": {
      return sourceText;
    }
    case "empty": {
      return "";
    }
  }
}
