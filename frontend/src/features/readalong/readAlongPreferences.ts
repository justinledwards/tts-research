import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import type { ReadAlongRuntimeSnapshot, ReadAlongVisualMode } from "./readAlongState";

export const READ_ALONG_PREFERENCES_SCOPE_STORAGE_KEY = "tts-readalong-preferences-scope-v1";
export const READ_ALONG_MACHINE_PREFERENCES_STORAGE_KEY = "tts-readalong-preferences-machine-v1";

export const READ_ALONG_PREFERENCE_SCOPES = ["session", "project", "machine"] as const;
export const READ_ALONG_HIGHLIGHT_GRANULARITIES = [
  "word",
  "phrase",
  "sentence",
  "block",
  "auto",
] as const;
export const READ_ALONG_HIGHLIGHT_STYLES = [
  "underline",
  "background",
  "outline",
  "leftBar",
  "highContrastShape",
] as const;
export const READ_ALONG_HIGHLIGHT_MOTIONS = ["static", "smoothCursor"] as const;
export const READ_ALONG_SCROLL_FOLLOW_POLICIES = [
  "off",
  "pageBoundaryOnly",
  "gentle",
  "centerCurrentLine",
  "telepromptContinuous",
] as const;
export const READ_ALONG_SYNC_STRICTNESS_OPTIONS = [
  "exactWordWhenAvailable",
  "phraseFallback",
  "blockFallback",
] as const;
export const READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS = [
  "always",
  "debugOnly",
  "neverClaimWordSync",
] as const;

export type ReadAlongPreferenceScope = (typeof READ_ALONG_PREFERENCE_SCOPES)[number];
export type ReadAlongHighlightGranularity = (typeof READ_ALONG_HIGHLIGHT_GRANULARITIES)[number];
export type ReadAlongHighlightMotion = (typeof READ_ALONG_HIGHLIGHT_MOTIONS)[number];
export type ReadAlongHighlightStyle = (typeof READ_ALONG_HIGHLIGHT_STYLES)[number];
export type ReadAlongScrollFollow = (typeof READ_ALONG_SCROLL_FOLLOW_POLICIES)[number];
export type ReadAlongSyncStrictness = (typeof READ_ALONG_SYNC_STRICTNESS_OPTIONS)[number];
export type ReadAlongDegradedSyncDisplay =
  (typeof READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS)[number];

export interface ReadAlongSegmentBoundaryPreferences {
  autoAdvance: boolean;
  fadePreviousPhrase: boolean;
  flashSegment: boolean;
  pauseAtSegmentBoundary: boolean;
}

export interface ReadAlongPreferences {
  degradedSyncDisplay: ReadAlongDegradedSyncDisplay;
  globalHighlightOffsetMs: number;
  highlightGranularity: ReadAlongHighlightGranularity;
  highlightMotion: ReadAlongHighlightMotion;
  highlightStyle: ReadAlongHighlightStyle;
  providerOffsetsMs: Record<string, number>;
  scope: ReadAlongPreferenceScope;
  scrollFollow: ReadAlongScrollFollow;
  segmentBoundary: ReadAlongSegmentBoundaryPreferences;
  syncStrictness: ReadAlongSyncStrictness;
}

export const DEFAULT_READ_ALONG_PREFERENCES: ReadAlongPreferences = {
  degradedSyncDisplay: "neverClaimWordSync",
  globalHighlightOffsetMs: 0,
  highlightGranularity: "auto",
  highlightMotion: "static",
  highlightStyle: "background",
  providerOffsetsMs: {},
  scope: "session",
  scrollFollow: "gentle",
  segmentBoundary: {
    autoAdvance: true,
    fadePreviousPhrase: true,
    flashSegment: false,
    pauseAtSegmentBoundary: false,
  },
  syncStrictness: "phraseFallback",
};

export const READ_ALONG_PREFERENCE_LABELS = {
  degradedSyncDisplay: {
    always: "Always show",
    debugOnly: "Show only in Debug",
    neverClaimWordSync: "Never claim word sync when degraded",
  } satisfies Record<ReadAlongDegradedSyncDisplay, string>,
  granularity: {
    auto: "Auto by confidence",
    block: "Paragraph/block",
    phrase: "Phrase",
    sentence: "Sentence",
    word: "Word",
  } satisfies Record<ReadAlongHighlightGranularity, string>,
  scope: {
    machine: "Machine",
    project: "Project",
    session: "Session",
  } satisfies Record<ReadAlongPreferenceScope, string>,
  motion: {
    smoothCursor: "Smooth cursor",
    static: "Static",
  } satisfies Record<ReadAlongHighlightMotion, string>,
  scrollFollow: {
    centerCurrentLine: "Center current line",
    gentle: "Gentle",
    off: "Off",
    pageBoundaryOnly: "Page boundary only",
    telepromptContinuous: "Teleprompt continuous",
  } satisfies Record<ReadAlongScrollFollow, string>,
  style: {
    background: "Background",
    highContrastShape: "High-contrast shape",
    leftBar: "Left bar",
    outline: "Outline",
    underline: "Underline",
  } satisfies Record<ReadAlongHighlightStyle, string>,
  syncStrictness: {
    blockFallback: "Block fallback",
    exactWordWhenAvailable: "Exact word when available",
    phraseFallback: "Phrase fallback",
  } satisfies Record<ReadAlongSyncStrictness, string>,
};

export const GOLDEN_MINUTE_HIGHLIGHT_PREVIEW_TEXT =
  'Dr. Mira Chen unlocked the studio at 7:05, placed a brass bookmark on paragraph three, and said, "Start with the listener, then chase the waveform."';

const TRUSTED_WORD_CONFIDENCE = 0.82;

export function normalizeReadAlongPreferences(value: unknown): ReadAlongPreferences {
  if (!value || typeof value !== "object") {
    return {
      ...DEFAULT_READ_ALONG_PREFERENCES,
      segmentBoundary: { ...DEFAULT_READ_ALONG_PREFERENCES.segmentBoundary },
    };
  }
  const candidate = value as Partial<ReadAlongPreferences>;
  return {
    degradedSyncDisplay: normalizeOption(
      candidate.degradedSyncDisplay,
      READ_ALONG_DEGRADED_SYNC_DISPLAY_OPTIONS,
      DEFAULT_READ_ALONG_PREFERENCES.degradedSyncDisplay,
    ),
    globalHighlightOffsetMs: normalizeOffset(candidate.globalHighlightOffsetMs),
    highlightGranularity: normalizeOption(
      candidate.highlightGranularity,
      READ_ALONG_HIGHLIGHT_GRANULARITIES,
      DEFAULT_READ_ALONG_PREFERENCES.highlightGranularity,
    ),
    highlightMotion: normalizeOption(
      candidate.highlightMotion,
      READ_ALONG_HIGHLIGHT_MOTIONS,
      DEFAULT_READ_ALONG_PREFERENCES.highlightMotion,
    ),
    highlightStyle: normalizeOption(
      candidate.highlightStyle,
      READ_ALONG_HIGHLIGHT_STYLES,
      DEFAULT_READ_ALONG_PREFERENCES.highlightStyle,
    ),
    providerOffsetsMs: normalizeProviderOffsets(candidate.providerOffsetsMs),
    scope: normalizeOption(
      candidate.scope,
      READ_ALONG_PREFERENCE_SCOPES,
      DEFAULT_READ_ALONG_PREFERENCES.scope,
    ),
    scrollFollow: normalizeOption(
      candidate.scrollFollow,
      READ_ALONG_SCROLL_FOLLOW_POLICIES,
      DEFAULT_READ_ALONG_PREFERENCES.scrollFollow,
    ),
    segmentBoundary: normalizeSegmentBoundaryPreferences(candidate.segmentBoundary),
    syncStrictness: normalizeOption(
      candidate.syncStrictness,
      READ_ALONG_SYNC_STRICTNESS_OPTIONS,
      DEFAULT_READ_ALONG_PREFERENCES.syncStrictness,
    ),
  };
}

export function effectiveReadAlongPreferences(
  preferences: ReadAlongPreferences,
  accessibilitySettings: Pick<ReaderAccessibilitySettings, "highContrast" | "reducedMotion">,
): ReadAlongPreferences {
  const normalized = normalizeReadAlongPreferences(preferences);
  return {
    ...normalized,
    highlightMotion:
      accessibilitySettings.reducedMotion || accessibilitySettings.highContrast
        ? "static"
        : normalized.highlightMotion,
    highlightStyle: accessibilitySettings.highContrast
      ? "highContrastShape"
      : normalized.highlightStyle,
    scrollFollow: accessibilitySettings.reducedMotion
      ? reducedMotionScrollFollow(normalized.scrollFollow)
      : normalized.scrollFollow,
    segmentBoundary: {
      ...normalized.segmentBoundary,
      fadePreviousPhrase: accessibilitySettings.reducedMotion
        ? false
        : normalized.segmentBoundary.fadePreviousPhrase,
      flashSegment: accessibilitySettings.reducedMotion
        ? false
        : normalized.segmentBoundary.flashSegment,
    },
  };
}

export function readAlongVisualModeFromPreferences(
  snapshot:
    | (Pick<ReadAlongRuntimeSnapshot, "mode" | "state"> & {
        confidence?: ReadAlongRuntimeSnapshot["confidence"];
      })
    | null
    | undefined,
  preferences: ReadAlongPreferences | null | undefined,
): ReadAlongVisualMode {
  if (!snapshot) {
    return "block";
  }
  if (snapshot.state === "stale-audio" || snapshot.mode === "none") {
    return "none";
  }
  const normalized = normalizeReadAlongPreferences(preferences);
  if (snapshot.state === "degraded") {
    return normalized.degradedSyncDisplay === "always" ? "degraded" : fallbackMode(normalized);
  }
  const requestedMode =
    normalized.highlightGranularity === "auto"
      ? normalizeRuntimeMode(snapshot.mode)
      : granularityToMode(normalized.highlightGranularity);
  if (requestedMode !== "word") {
    return requestedMode;
  }
  if (wordTimingTrusted(snapshot)) {
    return "word";
  }
  return fallbackMode(normalized);
}

export function readAlongCalibrationOffsetMs(
  preferences: ReadAlongPreferences,
  providerId: string | null | undefined,
): number {
  const normalized = normalizeReadAlongPreferences(preferences);
  const providerOffset = providerId ? (normalized.providerOffsetsMs[providerId] ?? 0) : 0;
  return normalized.globalHighlightOffsetMs + providerOffset;
}

export function readAlongPreferenceDataAttributes(
  preferences: ReadAlongPreferences,
): Record<string, string> {
  const normalized = normalizeReadAlongPreferences(preferences);
  return {
    "data-readalong-degraded-display": normalized.degradedSyncDisplay,
    "data-readalong-highlight-granularity": normalized.highlightGranularity,
    "data-readalong-highlight-motion": normalized.highlightMotion,
    "data-readalong-highlight-style": normalized.highlightStyle,
    "data-readalong-scroll-follow": normalized.scrollFollow,
    "data-readalong-segment-auto-advance": String(normalized.segmentBoundary.autoAdvance),
    "data-readalong-segment-fade-previous": String(normalized.segmentBoundary.fadePreviousPhrase),
    "data-readalong-segment-flash": String(normalized.segmentBoundary.flashSegment),
    "data-readalong-segment-pause": String(normalized.segmentBoundary.pauseAtSegmentBoundary),
    "data-readalong-sync-strictness": normalized.syncStrictness,
  };
}

export function readAlongProjectPreferencesStorageKey(projectId: string): string {
  return `tts-readalong-preferences-project-v1:${encodeURIComponent(cleanProjectId(projectId))}`;
}

export function loadReadAlongPreferences(
  projectId: string,
  rememberReaderPreferences: boolean,
): ReadAlongPreferences {
  if (!rememberReaderPreferences) {
    return normalizeReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES);
  }
  const preferredScope = normalizeOption(
    safeStorageGet(READ_ALONG_PREFERENCES_SCOPE_STORAGE_KEY),
    READ_ALONG_PREFERENCE_SCOPES,
    DEFAULT_READ_ALONG_PREFERENCES.scope,
  );
  if (preferredScope === "machine") {
    return {
      ...loadStoredPreferences(READ_ALONG_MACHINE_PREFERENCES_STORAGE_KEY),
      scope: "machine",
    };
  }
  if (preferredScope === "project") {
    return {
      ...loadStoredPreferences(readAlongProjectPreferencesStorageKey(projectId)),
      scope: "project",
    };
  }
  return { ...normalizeReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES), scope: "session" };
}

export function saveReadAlongPreferences(
  preferences: ReadAlongPreferences,
  projectId: string,
  rememberReaderPreferences: boolean,
): void {
  if (!rememberReaderPreferences) {
    clearStoredReadAlongPreferences(projectId);
    return;
  }
  const normalized = normalizeReadAlongPreferences(preferences);
  safeStorageSet(READ_ALONG_PREFERENCES_SCOPE_STORAGE_KEY, normalized.scope);
  if (normalized.scope === "machine") {
    safeStorageSet(READ_ALONG_MACHINE_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  } else if (normalized.scope === "project") {
    safeStorageSet(readAlongProjectPreferencesStorageKey(projectId), JSON.stringify(normalized));
  }
}

export function clearStoredReadAlongPreferences(projectId?: string): void {
  safeStorageRemove(READ_ALONG_PREFERENCES_SCOPE_STORAGE_KEY);
  safeStorageRemove(READ_ALONG_MACHINE_PREFERENCES_STORAGE_KEY);
  if (projectId) {
    safeStorageRemove(readAlongProjectPreferencesStorageKey(projectId));
  }
}

function loadStoredPreferences(key: string): ReadAlongPreferences {
  const stored = safeStorageGet(key);
  if (!stored) {
    return normalizeReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES);
  }
  try {
    return normalizeReadAlongPreferences(JSON.parse(stored) as unknown);
  } catch {
    return normalizeReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES);
  }
}

function normalizeSegmentBoundaryPreferences(value: unknown): ReadAlongSegmentBoundaryPreferences {
  const candidate =
    value && typeof value === "object"
      ? (value as Partial<ReadAlongSegmentBoundaryPreferences>)
      : {};
  return {
    autoAdvance:
      typeof candidate.autoAdvance === "boolean"
        ? candidate.autoAdvance
        : DEFAULT_READ_ALONG_PREFERENCES.segmentBoundary.autoAdvance,
    fadePreviousPhrase:
      typeof candidate.fadePreviousPhrase === "boolean"
        ? candidate.fadePreviousPhrase
        : DEFAULT_READ_ALONG_PREFERENCES.segmentBoundary.fadePreviousPhrase,
    flashSegment:
      typeof candidate.flashSegment === "boolean"
        ? candidate.flashSegment
        : DEFAULT_READ_ALONG_PREFERENCES.segmentBoundary.flashSegment,
    pauseAtSegmentBoundary:
      typeof candidate.pauseAtSegmentBoundary === "boolean"
        ? candidate.pauseAtSegmentBoundary
        : DEFAULT_READ_ALONG_PREFERENCES.segmentBoundary.pauseAtSegmentBoundary,
  };
}

function normalizeProviderOffsets(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const offsets: Record<string, number> = {};
  for (const [key, offset] of Object.entries(value as Record<string, unknown>)) {
    const cleanKey = key.trim();
    if (cleanKey) {
      offsets[cleanKey] = normalizeOffset(offset);
    }
  }
  return offsets;
}

function normalizeOffset(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.min(2000, Math.max(-2000, value)));
}

function normalizeOption<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return typeof value === "string" && options.includes(value) ? value : fallback;
}

function reducedMotionScrollFollow(scrollFollow: ReadAlongScrollFollow): ReadAlongScrollFollow {
  if (scrollFollow === "telepromptContinuous" || scrollFollow === "centerCurrentLine") {
    return "gentle";
  }
  return scrollFollow;
}

function normalizeRuntimeMode(mode: ReadAlongVisualMode): ReadAlongVisualMode {
  return mode === "none" || mode === "degraded" ? "block" : mode;
}

function granularityToMode(granularity: ReadAlongHighlightGranularity): ReadAlongVisualMode {
  return granularity === "auto" || granularity === "block" ? "block" : granularity;
}

function fallbackMode(preferences: ReadAlongPreferences): ReadAlongVisualMode {
  if (preferences.syncStrictness === "blockFallback") {
    return "block";
  }
  return "phrase";
}

function wordTimingTrusted(
  snapshot: Pick<ReadAlongRuntimeSnapshot, "mode" | "state"> & {
    confidence?: ReadAlongRuntimeSnapshot["confidence"];
  },
): boolean {
  if (snapshot.state !== "synced-word" && snapshot.mode !== "word") {
    return false;
  }
  return (
    snapshot.confidence === null ||
    snapshot.confidence === undefined ||
    snapshot.confidence >= TRUSTED_WORD_CONFIDENCE
  );
}

function cleanProjectId(projectId: string): string {
  const clean = projectId.trim();
  return clean.length > 0 ? clean : "default";
}

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // Read-along preferences are best-effort local presentation state.
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // Read-along preferences are best-effort local presentation state.
  }
}
