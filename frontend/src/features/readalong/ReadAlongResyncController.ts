import type { HighlightCue } from "../../highlightMap";
import type { HighlightMap } from "../../types";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import {
  READ_ALONG_PHRASE_DRIFT_TARGET_MS,
  READ_ALONG_WORD_DRIFT_TARGET_MS,
  detectReadAlongDrift,
  highlightTimingSourceLabel,
  isTrustedWordTiming,
  timingRangeForCue,
} from "./driftDetection";
import { legacyHighlightMapFromTimingArtifact, type TimingArtifact } from "./highlightMapV2";
import type { ReadAlongRuntimeSnapshot, ReadAlongRuntimeState } from "./readAlongState";

export interface ReadAlongResyncInput {
  activeCue?: HighlightCue | null;
  audioTimeSec: number;
  generatedAudioState?: GeneratedAudioLifecycleState;
  highlightMap?: HighlightMap | null;
  isPaused?: boolean;
  isPlaying?: boolean;
  isSeeking?: boolean;
  timingArtifact?: TimingArtifact | null;
}

export interface ReadAlongResyncOptions {
  phraseDriftTargetMs?: number;
  wordDriftTargetMs?: number;
}

export class ReadAlongResyncController {
  private readonly phraseDriftTargetMs: number;
  private resyncCount = 0;
  private readonly wordDriftTargetMs: number;

  constructor(options: ReadAlongResyncOptions = {}) {
    this.phraseDriftTargetMs = options.phraseDriftTargetMs ?? READ_ALONG_PHRASE_DRIFT_TARGET_MS;
    this.wordDriftTargetMs = options.wordDriftTargetMs ?? READ_ALONG_WORD_DRIFT_TARGET_MS;
  }

  reset() {
    this.resyncCount = 0;
  }

  resolve(input: ReadAlongResyncInput): ReadAlongRuntimeSnapshot {
    const snapshot = resolveReadAlongRuntimeSnapshot({
      ...input,
      phraseDriftTargetMs: this.phraseDriftTargetMs,
      resyncCount: this.resyncCount,
      wordDriftTargetMs: this.wordDriftTargetMs,
    });
    if (snapshot.state === "resyncing") {
      this.resyncCount += 1;
      return { ...snapshot, resyncCount: this.resyncCount };
    }
    return snapshot;
  }
}

export function resolveReadAlongRuntimeSnapshot({
  activeCue,
  audioTimeSec,
  generatedAudioState = "missing",
  highlightMap,
  isPaused = false,
  isPlaying = false,
  isSeeking = false,
  phraseDriftTargetMs = READ_ALONG_PHRASE_DRIFT_TARGET_MS,
  resyncCount = 0,
  timingArtifact,
  wordDriftTargetMs = READ_ALONG_WORD_DRIFT_TARGET_MS,
}: ReadAlongResyncInput &
  Readonly<{
    phraseDriftTargetMs?: number;
    resyncCount?: number;
    wordDriftTargetMs?: number;
  }>): ReadAlongRuntimeSnapshot {
  const effectiveHighlightMap =
    highlightMap ?? legacyHighlightMapFromTimingArtifact(timingArtifact);
  const timingSource = highlightTimingSourceLabel(effectiveHighlightMap);
  const drift = detectReadAlongDrift({
    activeCue,
    audioTimeSec,
    highlightMap: effectiveHighlightMap,
  });
  const expectedCue = drift.expectedCue;

  if (generatedAudioState === "stale") {
    return buildSnapshot({
      activeCue: null,
      audioTimeSec,
      driftMs: null,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: "none",
      reason: "Generated audio is stale, so word highlight is stopped until audio is rebuilt.",
      resyncCount,
      state: "stale-audio",
      timingSource,
    });
  }

  if (!effectiveHighlightMap || !expectedCue) {
    return buildSnapshot({
      activeCue: null,
      audioTimeSec,
      driftMs: null,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: "block",
      reason: "No timing map is available; reader can only show block or phrase-level position.",
      resyncCount,
      state: isPaused || !isPlaying ? "paused" : "degraded",
      timingSource,
    });
  }

  if (isSeeking) {
    return buildSnapshot({
      activeCue: expectedCue,
      audioTimeSec,
      driftMs: 0,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: expectedCue.mode,
      reason: "User is seeking; active fragment is recomputed from the audio clock.",
      resyncCount,
      state: "seeking",
      timingSource,
    });
  }

  if (isPaused || !isPlaying) {
    return buildSnapshot({
      activeCue: expectedCue,
      audioTimeSec,
      driftMs: drift.driftMs,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: expectedCue.mode,
      reason: "Playback is paused; highlight is held at the current audio clock.",
      resyncCount,
      state: "paused",
      timingSource,
    });
  }

  const trustedWord = isTrustedWordTiming(effectiveHighlightMap) && expectedCue.mode === "word";
  const wordDriftMs = drift.wordDriftMs ?? 0;
  const phraseDriftMs = drift.phraseDriftMs ?? wordDriftMs;

  if (trustedWord && wordDriftMs <= wordDriftTargetMs) {
    return buildSnapshot({
      activeCue: expectedCue,
      audioTimeSec,
      driftMs: wordDriftMs,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: "word",
      reason: "Trusted word timing is within the runtime drift budget.",
      resyncCount,
      state: "synced-word",
      timingSource,
    });
  }

  if (phraseDriftMs <= phraseDriftTargetMs) {
    const snappedCue = snapCueToPhrase(expectedCue);
    return buildSnapshot({
      activeCue: snappedCue,
      audioTimeSec,
      driftMs: phraseDriftMs,
      expectedCue,
      highlightMap: effectiveHighlightMap,
      mode: "phrase",
      reason: trustedWord
        ? "Word drift exceeded budget; snapped to the nearest phrase boundary."
        : "Word timing is unavailable or untrusted; phrase-level sync is active.",
      resyncCount,
      state: trustedWord ? "resyncing" : "synced-phrase",
      timingSource,
    });
  }

  return buildSnapshot({
    activeCue: snapCueToPhrase(expectedCue),
    audioTimeSec,
    driftMs: phraseDriftMs,
    expectedCue,
    highlightMap: effectiveHighlightMap,
    mode: "block",
    reason:
      "Phrase drift exceeded budget; highlight is degraded rather than pretending exact sync.",
    resyncCount,
    state: "degraded",
    timingSource,
  });
}

function buildSnapshot({
  activeCue,
  audioTimeSec,
  driftMs,
  expectedCue,
  highlightMap,
  mode,
  reason,
  resyncCount,
  state,
  timingSource,
}: Readonly<{
  activeCue: HighlightCue | null;
  audioTimeSec: number;
  driftMs: number | null;
  expectedCue: HighlightCue | null;
  highlightMap?: HighlightMap | null;
  mode: ReadAlongRuntimeSnapshot["mode"];
  reason: string;
  resyncCount: number;
  state: ReadAlongRuntimeState;
  timingSource: string;
}>): ReadAlongRuntimeSnapshot {
  const range = timingRangeForCue(
    activeCue,
    mode === "phrase" || mode === "block" ? "fragment" : "token",
  );
  return {
    activeCue,
    activeTokenIndex: activeCue?.tokenIndex ?? null,
    audioTimeSec: Math.max(0, audioTimeSec),
    confidence: range?.confidence ?? highlightMap?.summary.confidence.overall ?? null,
    driftMs,
    expectedCue,
    expectedTokenIndex: expectedCue?.tokenIndex ?? null,
    mode,
    reason,
    resyncCount,
    state,
    timingSource,
  };
}

function snapCueToPhrase(cue: HighlightCue): HighlightCue {
  return {
    ...cue,
    activeWordIndex: cue.phraseWordStart ?? cue.activeWordIndex,
    mode: "phrase",
    token: undefined,
    tokenIndex: undefined,
  };
}
