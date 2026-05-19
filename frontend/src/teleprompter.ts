import type { VoiceJob } from "./types";

export interface TeleprompterToken {
  text: string;
  kind: "word" | "space";
  wordIndex: number | null;
}

export type TeleprompterEffectStyle = "classic" | "spark";

export interface TeleprompterHighlightSettings {
  leadMs: number;
  spokenFadeMs: number;
  upcomingWindowMs: number;
  activeIntensity: number;
  upcomingIntensity: number;
  spokenIntensity: number;
  effectStyle: TeleprompterEffectStyle;
}

export type TeleprompterWordState = "active" | "idle" | "spoken" | "upcoming";

export interface TeleprompterWordCue {
  wordIndex: number;
  startMs: number;
  endMs: number;
  state: TeleprompterWordState;
  intensity: number;
  progress: number;
}

export interface TeleprompterCue {
  activeWordIndex: number;
  currentText: string;
  documentActiveWordIndex: number;
  nextText: string | null;
  previousText: string | null;
  segmentCount: number;
  segmentIndex: number;
  segmentProgress: number;
  tokens: TeleprompterToken[];
  wordCues: TeleprompterWordCue[];
  wordCount: number;
}

const WORD_OR_SPACE_PATTERN = /\s+|\S+/g;

export const TELEPROMPTER_SETTINGS_STORAGE_KEY = "tts-teleprompter-settings";

export const DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS: TeleprompterHighlightSettings = {
  leadMs: 180,
  spokenFadeMs: 900,
  upcomingWindowMs: 260,
  activeIntensity: 1,
  upcomingIntensity: 0.22,
  spokenIntensity: 0.14,
  effectStyle: "spark",
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function splitTeleprompterTokens(text: string): TeleprompterToken[] {
  const parts = text.match(WORD_OR_SPACE_PATTERN) ?? [];
  let wordIndex = 0;

  return parts.map((part) => {
    if (/^\s+$/.test(part)) {
      return { kind: "space", text: part, wordIndex: null };
    }

    const token = { kind: "word" as const, text: part, wordIndex };
    wordIndex += 1;
    return token;
  });
}

export function pickTeleprompterWordIndex(text: string, progress: number): number {
  const words = splitTeleprompterTokens(text).filter((token) => token.kind === "word");
  if (words.length === 0) {
    return -1;
  }

  const safeProgress = clamp(progress, 0, 1);
  if (safeProgress >= 1) {
    return words.length - 1;
  }

  const weights = words.map((word) => Math.max(2, word.text.replaceAll(/[^\dA-Za-z]/g, "").length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const targetWeight = safeProgress * totalWeight;
  let consumedWeight = 0;

  for (const [index, weight] of weights.entries()) {
    consumedWeight += weight;
    if (targetWeight < consumedWeight) {
      return index;
    }
  }

  return words.length - 1;
}

export function normalizeTeleprompterHighlightSettings(
  value: Partial<TeleprompterHighlightSettings> | null | undefined,
): TeleprompterHighlightSettings {
  const settings = value ?? {};
  return {
    leadMs: clamp(
      Math.round(settings.leadMs ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.leadMs),
      0,
      900,
    ),
    spokenFadeMs: clamp(
      Math.round(settings.spokenFadeMs ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.spokenFadeMs),
      120,
      4000,
    ),
    upcomingWindowMs: clamp(
      Math.round(
        settings.upcomingWindowMs ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.upcomingWindowMs,
      ),
      0,
      1200,
    ),
    activeIntensity: clamp(
      settings.activeIntensity ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.activeIntensity,
      0.3,
      1.4,
    ),
    upcomingIntensity: clamp(
      settings.upcomingIntensity ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.upcomingIntensity,
      0,
      0.7,
    ),
    spokenIntensity: clamp(
      settings.spokenIntensity ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.spokenIntensity,
      0,
      0.7,
    ),
    effectStyle: settings.effectStyle === "classic" ? "classic" : "spark",
  };
}

export function buildTeleprompterWordCues(
  text: string,
  cursorMs: number,
  durationMs: number,
  settings: TeleprompterHighlightSettings = DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
): TeleprompterWordCue[] {
  const normalizedSettings = normalizeTeleprompterHighlightSettings(settings);
  const tokens = splitTeleprompterTokens(text);
  const words = tokens.filter((token) => token.kind === "word");
  if (words.length === 0) {
    return [];
  }

  const safeDurationMs = Math.max(1, durationMs);
  const weights = words.map((word) => Math.max(2, word.text.replaceAll(/[^\dA-Za-z]/g, "").length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let consumedWeight = 0;
  const focusMs = clamp(cursorMs + normalizedSettings.leadMs, 0, safeDurationMs);

  return words.map((word, index) => {
    const startMs = (consumedWeight / totalWeight) * safeDurationMs;
    consumedWeight += weights[index] ?? 0;
    const endMs = (consumedWeight / totalWeight) * safeDurationMs;
    const cue = resolveTeleprompterWordCue(
      word.wordIndex ?? index,
      startMs,
      endMs,
      focusMs,
      normalizedSettings,
    );
    return cue;
  });
}

function resolveTeleprompterWordCue(
  wordIndex: number,
  startMs: number,
  endMs: number,
  focusMs: number,
  settings: TeleprompterHighlightSettings,
): TeleprompterWordCue {
  if (focusMs >= startMs && focusMs <= endMs) {
    return {
      wordIndex,
      startMs,
      endMs,
      state: "active",
      intensity: settings.activeIntensity,
      progress: endMs > startMs ? clamp((focusMs - startMs) / (endMs - startMs), 0, 1) : 1,
    };
  }

  if (focusMs < startMs && startMs - focusMs <= settings.upcomingWindowMs) {
    const progress =
      settings.upcomingWindowMs > 0 ? 1 - (startMs - focusMs) / settings.upcomingWindowMs : 1;
    return {
      wordIndex,
      startMs,
      endMs,
      state: "upcoming",
      intensity: settings.upcomingIntensity * clamp(progress, 0, 1),
      progress: clamp(progress, 0, 1),
    };
  }

  if (focusMs > endMs && focusMs - endMs <= settings.spokenFadeMs) {
    const progress = settings.spokenFadeMs > 0 ? 1 - (focusMs - endMs) / settings.spokenFadeMs : 0;
    return {
      wordIndex,
      startMs,
      endMs,
      state: "spoken",
      intensity: settings.spokenIntensity * clamp(progress, 0, 1),
      progress: clamp(progress, 0, 1),
    };
  }

  return { wordIndex, startMs, endMs, state: "idle", intensity: 0, progress: 0 };
}

function wordCount(text: string): number {
  return splitTeleprompterTokens(text).filter((token) => token.kind === "word").length;
}

function fallbackSegmentDurationMs(text: string): number {
  return Math.max(900, wordCount(text) * 320);
}

function getAverageKnownDurationMs(job: VoiceJob): number {
  const knownDurations = [
    ...(job.audioSegmentDurationsMs ?? []),
    ...(job.segments ?? []).map((segment) => segment.durationMs ?? 0),
  ].filter((value) => Number.isFinite(value) && value > 0);

  if (knownDurations.length === 0) {
    return 0;
  }

  return knownDurations.reduce((sum, value) => sum + value, 0) / knownDurations.length;
}

function getSegmentDurationMs(
  job: VoiceJob,
  index: number,
  averageKnownDurationMs: number,
): number {
  const audioDuration = job.audioSegmentDurationsMs?.[index] ?? 0;
  if (Number.isFinite(audioDuration) && audioDuration > 0) {
    return audioDuration;
  }

  const segmentDuration = job.segments?.[index]?.durationMs ?? 0;
  if (Number.isFinite(segmentDuration) && segmentDuration > 0) {
    return segmentDuration;
  }

  if (averageKnownDurationMs > 0) {
    return averageKnownDurationMs;
  }

  return fallbackSegmentDurationMs(job.segments?.[index]?.text ?? "");
}

export function buildTeleprompterCue(
  job: VoiceJob | null,
  playbackCursorSec: number,
  settings: TeleprompterHighlightSettings = DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
): TeleprompterCue | null {
  const segments = job?.segments ?? [];
  if (!job || segments.length === 0) {
    return null;
  }

  const averageKnownDurationMs = getAverageKnownDurationMs(job);
  const cursorMs = Math.max(0, playbackCursorSec * 1000);
  let segmentStartMs = 0;
  let activeSegmentIndex = segments.length - 1;
  let activeSegmentDurationMs = getSegmentDurationMs(
    job,
    activeSegmentIndex,
    averageKnownDurationMs,
  );

  for (let index = 0; index < segments.length; index += 1) {
    const segmentDurationMs = getSegmentDurationMs(job, index, averageKnownDurationMs);
    const segmentEndMs = segmentStartMs + segmentDurationMs;

    if (cursorMs < segmentEndMs || index === segments.length - 1) {
      activeSegmentIndex = index;
      activeSegmentDurationMs = segmentDurationMs;
      break;
    }

    segmentStartMs = segmentEndMs;
  }

  const currentText = segments[activeSegmentIndex]?.text ?? "";
  const rawProgress =
    activeSegmentDurationMs > 0 ? (cursorMs - segmentStartMs) / activeSegmentDurationMs : 0;
  const segmentProgress = clamp(rawProgress, 0, 1);
  const tokens = splitTeleprompterTokens(currentText);
  const segmentCursorMs = clamp(cursorMs - segmentStartMs, 0, activeSegmentDurationMs);
  const wordCues = buildTeleprompterWordCues(
    currentText,
    segmentCursorMs,
    activeSegmentDurationMs,
    settings,
  );
  const activeWordIndex =
    wordCues.find((wordCue) => wordCue.state === "active")?.wordIndex ??
    pickTeleprompterWordIndex(currentText, segmentProgress);
  const documentActiveWordIndex =
    segments
      .slice(0, activeSegmentIndex)
      .reduce((total, segment) => total + wordCount(segment.text), 0) + activeWordIndex;

  return {
    activeWordIndex,
    currentText,
    documentActiveWordIndex,
    nextText: segments[activeSegmentIndex + 1]?.text ?? null,
    previousText: segments[activeSegmentIndex - 1]?.text ?? null,
    segmentCount: segments.length,
    segmentIndex: activeSegmentIndex,
    segmentProgress,
    tokens,
    wordCues,
    wordCount: tokens.filter((token) => token.kind === "word").length,
  };
}
