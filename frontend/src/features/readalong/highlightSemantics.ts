import type { ReadAlongRuntimeSnapshot } from "./readAlongState";
import { READ_ALONG_TRUSTED_CONFIDENCE } from "./driftDetection";
import type {
  ReadAlongHighlightGranularity,
  ReadAlongHighlightStyle,
  ReadAlongPreferences,
} from "./readAlongPreferences";
import { normalizeReadAlongPreferences } from "./readAlongPreferences";

export type ReadAlongWordRole =
  | "idle"
  | "spoken"
  | "recent"
  | "active"
  | "activePhrase"
  | "upcoming"
  | "skipped"
  | "transformed";

export type ReadAlongCueRole = "previous" | "current" | "next" | "skipped" | "unavailable";

export type ReadAlongTimingState =
  | "trusted"
  | "estimated"
  | "lowConfidence"
  | "resyncing"
  | "degraded"
  | "stale";

export const READ_ALONG_HIGHLIGHT_PRESET_IDS = [
  "calm",
  "rehearsal",
  "theatre",
  "highContrast",
] as const;

export type ReadAlongHighlightPresetId = (typeof READ_ALONG_HIGHLIGHT_PRESET_IDS)[number];

export interface ReadAlongHighlightPreset {
  description: string;
  highlightGranularity: ReadAlongHighlightGranularity;
  highlightStyle: ReadAlongHighlightStyle;
  id: ReadAlongHighlightPresetId;
  label: string;
  preferences: Pick<
    ReadAlongPreferences,
    | "degradedSyncDisplay"
    | "highlightGranularity"
    | "highlightStyle"
    | "scrollFollow"
    | "segmentBoundary"
    | "syncStrictness"
  >;
}

export interface ReadAlongWordRoleInput {
  active: boolean;
  activeWordIndex?: number | null;
  cueRole?: ReadAlongCueRole;
  phrase: boolean;
  recentWindow?: number;
  upcomingWindow?: number;
  wordIndex: number;
}

export interface ReadAlongTimingStateInput {
  confidence?: number | null;
  runtime?: Pick<ReadAlongRuntimeSnapshot, "confidence" | "state" | "timingSource"> | null;
  timingLevel?: string | null;
  timingSource?: string | null;
}

export const READ_ALONG_HIGHLIGHT_PRESETS: Record<
  ReadAlongHighlightPresetId,
  ReadAlongHighlightPreset
> = {
  calm: {
    description: "Phrase-first reading with gentle motion and low visual noise.",
    highlightGranularity: "phrase",
    highlightStyle: "background",
    id: "calm",
    label: "Calm",
    preferences: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "phrase",
      highlightStyle: "background",
      scrollFollow: "gentle",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: true,
        flashSegment: false,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "phraseFallback",
    },
  },
  rehearsal: {
    description: "Word-first rehearsal with a strong current word and visible lead words.",
    highlightGranularity: "word",
    highlightStyle: "background",
    id: "rehearsal",
    label: "Rehearsal",
    preferences: {
      degradedSyncDisplay: "debugOnly",
      highlightGranularity: "word",
      highlightStyle: "background",
      scrollFollow: "centerCurrentLine",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: true,
        flashSegment: true,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "exactWordWhenAvailable",
    },
  },
  theatre: {
    description: "Large-session cue tracking with current and next cue separation.",
    highlightGranularity: "word",
    highlightStyle: "outline",
    id: "theatre",
    label: "Theatre",
    preferences: {
      degradedSyncDisplay: "debugOnly",
      highlightGranularity: "word",
      highlightStyle: "outline",
      scrollFollow: "telepromptContinuous",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: true,
        flashSegment: false,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "phraseFallback",
    },
  },
  highContrast: {
    description: "High-contrast shape highlight with honest phrase/block fallback.",
    highlightGranularity: "auto",
    highlightStyle: "highContrastShape",
    id: "highContrast",
    label: "High contrast",
    preferences: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "auto",
      highlightStyle: "highContrastShape",
      scrollFollow: "pageBoundaryOnly",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: false,
        flashSegment: false,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "phraseFallback",
    },
  },
};

export function readAlongHighlightPreset(id: ReadAlongHighlightPresetId): ReadAlongHighlightPreset {
  return READ_ALONG_HIGHLIGHT_PRESETS[id];
}

export function applyReadAlongHighlightPreset(
  id: ReadAlongHighlightPresetId,
  current: ReadAlongPreferences,
): ReadAlongPreferences {
  const preset = readAlongHighlightPreset(id);
  return normalizeReadAlongPreferences({
    ...current,
    ...preset.preferences,
    globalHighlightOffsetMs: current.globalHighlightOffsetMs,
    providerOffsetsMs: current.providerOffsetsMs,
    scope: current.scope,
    segmentBoundary: {
      ...current.segmentBoundary,
      ...preset.preferences.segmentBoundary,
    },
  });
}

export function readAlongHighlightPresetMatches(
  id: ReadAlongHighlightPresetId,
  preferences: ReadAlongPreferences,
): boolean {
  const preset = readAlongHighlightPreset(id).preferences;
  const normalized = normalizeReadAlongPreferences(preferences);
  return (
    normalized.degradedSyncDisplay === preset.degradedSyncDisplay &&
    normalized.highlightGranularity === preset.highlightGranularity &&
    normalized.highlightStyle === preset.highlightStyle &&
    normalized.scrollFollow === preset.scrollFollow &&
    normalized.syncStrictness === preset.syncStrictness &&
    normalized.segmentBoundary.autoAdvance === preset.segmentBoundary.autoAdvance &&
    normalized.segmentBoundary.fadePreviousPhrase === preset.segmentBoundary.fadePreviousPhrase &&
    normalized.segmentBoundary.flashSegment === preset.segmentBoundary.flashSegment &&
    normalized.segmentBoundary.pauseAtSegmentBoundary ===
      preset.segmentBoundary.pauseAtSegmentBoundary
  );
}

export function readAlongWordRoleForIndex({
  active,
  activeWordIndex,
  cueRole = "current",
  phrase,
  recentWindow = 2,
  upcomingWindow = 2,
  wordIndex,
}: ReadAlongWordRoleInput): ReadAlongWordRole {
  if (cueRole === "skipped" || cueRole === "unavailable") {
    return cueRole === "skipped" ? "skipped" : "idle";
  }
  if (active) {
    return "active";
  }
  if (phrase) {
    return "activePhrase";
  }
  if (cueRole === "previous") {
    return "spoken";
  }
  if (cueRole === "next") {
    return "upcoming";
  }
  if (typeof activeWordIndex !== "number" || activeWordIndex < 0) {
    return "idle";
  }
  if (wordIndex < activeWordIndex) {
    return activeWordIndex - wordIndex <= recentWindow ? "recent" : "spoken";
  }
  if (wordIndex > activeWordIndex && wordIndex - activeWordIndex <= upcomingWindow) {
    return "upcoming";
  }
  return "idle";
}

export function readAlongTimingStateFromRuntime({
  confidence,
  runtime,
  timingLevel,
  timingSource,
}: ReadAlongTimingStateInput): ReadAlongTimingState {
  const runtimeState = runtime?.state;
  if (runtimeState === "stale-audio") {
    return "stale";
  }
  if (runtimeState === "degraded") {
    return "degraded";
  }
  if (runtimeState === "resyncing" || runtimeState === "seeking") {
    return "resyncing";
  }
  const source = (timingSource ?? runtime?.timingSource ?? "").toLowerCase();
  const level = (timingLevel ?? "").toLowerCase();
  if (
    source.includes("estimate") ||
    source.includes("heuristic") ||
    source === "none" ||
    level === "estimate"
  ) {
    return "estimated";
  }
  const resolvedConfidence = confidence ?? runtime?.confidence ?? null;
  if (resolvedConfidence !== null && resolvedConfidence < READ_ALONG_TRUSTED_CONFIDENCE) {
    return "lowConfidence";
  }
  return "trusted";
}

export function readAlongShouldShowTimingUncertainty(
  timingState: ReadAlongTimingState | null | undefined,
): boolean {
  return timingState !== null && timingState !== undefined && timingState !== "trusted";
}

export function readAlongSemanticCueClassName(
  cueRole: ReadAlongCueRole | null | undefined,
  timingState?: ReadAlongTimingState | null,
): string {
  return [
    cueRole ? `readalong-cue-role--${cueRole}` : "",
    timingState ? `readalong-timing-state--${timingState}` : "",
    readAlongShouldShowTimingUncertainty(timingState) ? "readalong-cue--uncertain" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function readAlongSemanticWordClassName(role: ReadAlongWordRole): string {
  return `readalong-word-role--${role}`;
}

export function readAlongSemanticDataAttributes({
  cueRole,
  timingState,
}: Readonly<{
  cueRole?: ReadAlongCueRole | null;
  timingState?: ReadAlongTimingState | null;
}>): Record<string, string | undefined> {
  return {
    "data-readalong-cue-role": cueRole ?? undefined,
    "data-readalong-timing-state": timingState ?? undefined,
    "data-readalong-uncertainty": readAlongShouldShowTimingUncertainty(timingState)
      ? "visible"
      : undefined,
  };
}
