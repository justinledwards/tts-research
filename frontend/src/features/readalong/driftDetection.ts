import type { HighlightCue } from "../../highlightMap";
import { resolveHighlightCue } from "../../highlightMap";
import type { HighlightFragment, HighlightMap, HighlightToken } from "../../types";

export const READ_ALONG_WORD_DRIFT_TARGET_MS = 150;
export const READ_ALONG_PHRASE_DRIFT_TARGET_MS = 350;
export const READ_ALONG_TRUSTED_CONFIDENCE = 0.75;

export interface TimingRange {
  confidence: number;
  endMs: number;
  source: "fragment" | "token";
  startMs: number;
}

export interface ReadAlongDriftInput {
  activeCue?: HighlightCue | null;
  audioTimeSec: number;
  highlightMap?: HighlightMap | null;
}

export interface ReadAlongDriftReport {
  activeRange: TimingRange | null;
  audioTimeMs: number;
  driftMs: number | null;
  expectedCue: HighlightCue | null;
  expectedRange: TimingRange | null;
  phraseDriftMs: number | null;
  wordDriftMs: number | null;
}

export function detectReadAlongDrift({
  activeCue,
  audioTimeSec,
  highlightMap,
}: ReadAlongDriftInput): ReadAlongDriftReport {
  const audioTimeMs = Math.max(0, Math.round(audioTimeSec * 1000));
  const expectedCue = resolveHighlightCue(highlightMap, audioTimeSec);
  const activeRange = timingRangeForCue(activeCue ?? expectedCue, "token");
  const expectedRange = timingRangeForCue(expectedCue, "token");
  const activePhraseRange = timingRangeForCue(activeCue ?? expectedCue, "fragment");
  const expectedPhraseRange = timingRangeForCue(expectedCue, "fragment");
  const wordDriftMs = driftFromRange(audioTimeMs, activeRange ?? expectedRange);
  const phraseDriftMs = driftFromRange(audioTimeMs, activePhraseRange ?? expectedPhraseRange);
  return {
    activeRange,
    audioTimeMs,
    driftMs: wordDriftMs ?? phraseDriftMs,
    expectedCue,
    expectedRange,
    phraseDriftMs,
    wordDriftMs,
  };
}

export function timingRangeForCue(
  cue: HighlightCue | null | undefined,
  preferred: "fragment" | "token" = "token",
): TimingRange | null {
  if (!cue) {
    return null;
  }
  if (preferred === "token" && cue.token) {
    return timingRangeForToken(cue.token);
  }
  if (cue.fragment) {
    return timingRangeForFragment(cue.fragment);
  }
  if (cue.token) {
    return timingRangeForToken(cue.token);
  }
  return null;
}

export function driftFromRange(
  audioTimeMs: number,
  range: TimingRange | null | undefined,
): number | null {
  if (!range) {
    return null;
  }
  if (audioTimeMs >= range.startMs && audioTimeMs <= range.endMs) {
    return 0;
  }
  if (audioTimeMs < range.startMs) {
    return range.startMs - audioTimeMs;
  }
  return audioTimeMs - range.endMs;
}

export function highlightTimingSourceLabel(map: HighlightMap | null | undefined): string {
  if (!map) {
    return "none";
  }
  const reason = map.summary.reason?.trim();
  return reason ? `${map.summary.source} (${reason})` : map.summary.source;
}

export function isTrustedWordTiming(map: HighlightMap | null | undefined): boolean {
  if (map?.mode !== "word" || map.summary.mode !== "word") {
    return false;
  }
  return map.summary.confidence.token >= READ_ALONG_TRUSTED_CONFIDENCE;
}

function timingRangeForToken(token: HighlightToken): TimingRange {
  return {
    confidence: token.confidence,
    endMs: token.endMs,
    source: "token",
    startMs: token.startMs,
  };
}

function timingRangeForFragment(fragment: HighlightFragment): TimingRange {
  return {
    confidence: fragment.confidence,
    endMs: fragment.endMs,
    source: "fragment",
    startMs: fragment.startMs,
  };
}
