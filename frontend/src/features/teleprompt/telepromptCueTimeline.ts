import { pickTeleprompterWordIndex, splitTeleprompterTokens } from "../../teleprompter";
import type { HighlightMap, HighlightToken, VoiceJob } from "../../types";
import type {
  HighlightMapV2,
  HighlightMapV2Entry,
  HighlightMapV2TimingLevel,
  HighlightMapV2TimingSource,
  ReadAlongTimingLookupOptions,
} from "../readalong";
import { resolveReadAlongTimingItem, sourceWordIdFor } from "../readalong";
import type { RevisionBlock } from "../revision";
import {
  applyEstimateRange,
  clamp,
  compareV2EntryTime,
  cueTextScore,
  fallbackAt,
  normalizeCueText,
  previousEndMsFromDrafts,
  resolvedEndMs,
  resolvedStartMs,
  safeConfidence,
  safeDurationMs,
  sortedCopy,
  v2EntryKey,
  v2EntryText,
} from "./utils/telepromptCueTimelineHelpers";
import { telepromptBlockIsCueProgressionCandidate } from "./telepromptToolbar";

export type TelepromptCueSyncMode =
  | "manual"
  | "audio-follow"
  | "recording-rehearsal"
  | "review-playback";

export type TelepromptCueTimelineSource =
  | "highlight-map-v2"
  | "legacy-highlight-map"
  | "job-segments"
  | "estimated";

export interface TelepromptCueWordTiming {
  readonly audioEndMs: number;
  readonly audioStartMs: number;
  readonly confidence: number;
  readonly sourceWordId?: string;
  readonly sourceWordIndex?: number;
  readonly spokenTokenId?: string;
  readonly text: string;
  readonly wordIndex: number;
}

export interface TelepromptCueTimelineEntry {
  readonly audioEndMs: number;
  readonly audioStartMs: number;
  readonly confidence: number;
  readonly cueId: string;
  readonly cueProgress: number;
  readonly currentSourceWordId?: string | null;
  readonly currentWordIndex: number;
  readonly nextCueId: string | null;
  readonly normalizedText: string;
  readonly previousCueId: string | null;
  readonly sourceBlockId: string;
  readonly spokenText: string;
  readonly text: string;
  readonly timingLevel: HighlightMapV2TimingLevel | "fragment" | "segment" | "estimate";
  readonly timingSource: HighlightMapV2TimingSource | "legacy" | "job-segment" | "estimate";
  readonly wordTimings: readonly TelepromptCueWordTiming[];
}

export interface TelepromptCueTimeline {
  readonly cueCount: number;
  readonly cues: readonly TelepromptCueTimelineEntry[];
  readonly durationMs: number;
  readonly source: TelepromptCueTimelineSource;
  readonly status: string;
}

export interface TelepromptCueSyncState {
  readonly activeCue: TelepromptCueTimelineEntry | null;
  readonly detail: string;
  readonly mode: TelepromptCueSyncMode;
  readonly nextCue: TelepromptCueTimelineEntry | null;
  readonly previousCue: TelepromptCueTimelineEntry | null;
  readonly shouldFollowAudio: boolean;
  readonly shouldUpdateActiveBlock: boolean;
  readonly source: TelepromptCueTimelineSource;
  readonly statusLabel: string;
}

export interface BuildTelepromptCueTimelineInput {
  readonly blocks: readonly RevisionBlock[];
  readonly highlightMap?: HighlightMap | null;
  readonly highlightMapV2?: HighlightMapV2 | null;
  readonly job?: VoiceJob | null;
}

export interface ResolveTelepromptCueSyncInput {
  readonly activeBlockId: string | null;
  readonly mode: TelepromptCueSyncMode;
  readonly playbackAvailable: boolean;
  readonly playbackCursorSec: number;
  readonly playbackPlaying: boolean;
  readonly timingLookup?: ReadAlongTimingLookupOptions;
  readonly timeline: TelepromptCueTimeline;
}

interface MutableCueDraft {
  audioEndMs: number;
  audioStartMs: number;
  confidence: number;
  cueId: string;
  normalizedText: string;
  sourceBlockId: string;
  spokenText: string;
  text: string;
  timingLevel: TelepromptCueTimelineEntry["timingLevel"];
  timingSource: TelepromptCueTimelineEntry["timingSource"];
  wordTimings: TelepromptCueWordTiming[];
}

const CUE_TEXT_MATCH_FLOOR = 0.35;
const RANGE_EPSILON_MS = 25;

export function buildTelepromptCueTimeline({
  blocks,
  highlightMap,
  highlightMapV2,
  job,
}: BuildTelepromptCueTimelineInput): TelepromptCueTimeline {
  const cueBlocks = blocks.filter((block) => telepromptBlockIsCueProgressionCandidate(block));
  if (cueBlocks.length === 0) {
    return emptyTelepromptCueTimeline("estimated");
  }

  if (highlightMapV2?.entries.length) {
    return timelineFromHighlightMapV2(cueBlocks, highlightMapV2);
  }

  if (highlightMap?.fragments.length) {
    return timelineFromLegacyHighlightMap(cueBlocks, highlightMap);
  }

  if (job?.segments?.length) {
    return timelineFromJobSegments(cueBlocks, job);
  }

  return timelineFromEstimates(cueBlocks);
}

export function resolveTelepromptCueSync({
  activeBlockId,
  mode,
  playbackAvailable,
  playbackCursorSec,
  playbackPlaying,
  timingLookup = {},
  timeline,
}: ResolveTelepromptCueSyncInput): TelepromptCueSyncState {
  const shouldFollowAudio =
    playbackAvailable && (mode === "audio-follow" || mode === "review-playback");
  const cursorMs = Math.max(0, playbackCursorSec * 1000);
  const selectedCue = cueForBlockId(timeline, activeBlockId) ?? firstCue(timeline);
  const timelineCue = shouldFollowAudio
    ? (cueForAudioTime(timeline, cursorMs, timingLookup) ?? selectedCue)
    : selectedCue;
  const activeCue = timelineCue
    ? cueWithRuntimePosition(timelineCue, cursorMs, timingLookup)
    : null;
  const previousCue = activeCue ? cueForBlockId(timeline, activeCue.previousCueId) : null;
  const nextCue = activeCue ? cueForBlockId(timeline, activeCue.nextCueId) : null;

  return {
    activeCue,
    detail: cueSyncDetail({
      activeCue,
      mode,
      playbackAvailable,
      playbackPlaying,
      shouldFollowAudio,
      source: timeline.source,
    }),
    mode,
    nextCue,
    previousCue,
    shouldFollowAudio,
    shouldUpdateActiveBlock: Boolean(
      shouldFollowAudio && activeCue && activeCue.sourceBlockId !== activeBlockId,
    ),
    source: timeline.source,
    statusLabel: cueSyncStatusLabel(mode, shouldFollowAudio, playbackPlaying),
  };
}

export function telepromptCueSeekSeconds(cue: TelepromptCueTimelineEntry | null): number | null {
  if (!cue) {
    return null;
  }
  return Math.max(0, cue.audioStartMs / 1000);
}

function timelineFromHighlightMapV2(
  blocks: readonly RevisionBlock[],
  map: HighlightMapV2,
): TelepromptCueTimeline {
  const anchorEntries = anchorEntriesFromHighlightMapV2(map);
  const usedEntryIds = new Set<string>();
  const cues = blocks.map((block, index) => {
    const matchedEntry = bestUnusedV2EntryForBlock(block, index, anchorEntries, usedEntryIds);
    const draft = cueDraftFromBlock(block);
    if (matchedEntry) {
      usedEntryIds.add(v2EntryKey(matchedEntry));
      draft.audioStartMs = resolvedStartMs(matchedEntry);
      draft.audioEndMs = Math.max(resolvedEndMs(matchedEntry), draft.audioStartMs + 1);
      draft.confidence = safeConfidence(matchedEntry.confidence, draft.confidence);
      draft.timingLevel = matchedEntry.level;
      draft.timingSource = matchedEntry.timingSource;
      draft.spokenText = block.spokenText || matchedEntry.spokenText || matchedEntry.textQuote;
      draft.normalizedText = normalizeCueText(draft.spokenText || matchedEntry.normalizedText);
    } else {
      applyEstimateRange(draft, previousEndMsFromDrafts(index, blocks));
    }
    draft.wordTimings = wordTimingsForV2Cue(map.entries, draft);
    return draft;
  });
  return buildTimeline("highlight-map-v2", cues, map.summary.status);
}

function timelineFromLegacyHighlightMap(
  blocks: readonly RevisionBlock[],
  map: HighlightMap,
): TelepromptCueTimeline {
  const fragments = sortedCopy(map.fragments, (left, right) => left.startMs - right.startMs);
  const usedFragmentIndexes = new Set<number>();
  const cues = blocks.map((block, index) => {
    const matchedFragment =
      bestLegacyFragmentForBlock(block, fragments, usedFragmentIndexes) ??
      fallbackAt(fragments, index);
    const draft = cueDraftFromBlock(block);
    if (matchedFragment) {
      usedFragmentIndexes.add(matchedFragment.index);
      draft.audioStartMs = Math.max(0, matchedFragment.startMs);
      draft.audioEndMs = Math.max(matchedFragment.endMs, draft.audioStartMs + 1);
      draft.confidence = safeConfidence(matchedFragment.confidence, draft.confidence);
      draft.timingLevel = "fragment";
      draft.timingSource = "legacy";
      draft.wordTimings = wordTimingsForLegacyCue(map.tokens, draft);
    } else {
      applyEstimateRange(draft, previousEndMsFromDrafts(index, blocks));
    }
    return draft;
  });
  return buildTimeline("legacy-highlight-map", cues, map.status);
}

function timelineFromJobSegments(
  blocks: readonly RevisionBlock[],
  job: VoiceJob,
): TelepromptCueTimeline {
  let cursorMs = 0;
  const cues = blocks.map((block, index) => {
    const segment = job.segments?.[index];
    const durationMs = safeDurationMs(
      job.audioSegmentDurationsMs?.[index] ?? segment?.durationMs ?? block.estimatedDurationMs,
      block.spokenText,
    );
    const draft = cueDraftFromBlock(block);
    draft.audioStartMs = cursorMs;
    draft.audioEndMs = cursorMs + durationMs;
    draft.timingLevel = "segment";
    draft.timingSource = "job-segment";
    cursorMs += durationMs;
    return draft;
  });
  return buildTimeline("job-segments", cues, job.status);
}

function timelineFromEstimates(blocks: readonly RevisionBlock[]): TelepromptCueTimeline {
  let cursorMs = 0;
  const cues = blocks.map((block) => {
    const durationMs = safeDurationMs(block.estimatedDurationMs, block.spokenText);
    const draft = cueDraftFromBlock(block);
    draft.audioStartMs = cursorMs;
    draft.audioEndMs = cursorMs + durationMs;
    cursorMs += durationMs;
    return draft;
  });
  return buildTimeline("estimated", cues, "estimated");
}

function buildTimeline(
  source: TelepromptCueTimelineSource,
  drafts: readonly MutableCueDraft[],
  status: string,
): TelepromptCueTimeline {
  const cues = drafts.map<TelepromptCueTimelineEntry>((draft, index) => ({
    ...draft,
    cueProgress: 0,
    currentWordIndex: -1,
    nextCueId: drafts[index + 1]?.sourceBlockId ?? null,
    previousCueId: drafts[index - 1]?.sourceBlockId ?? null,
    wordTimings: draft.wordTimings,
  }));
  const durationMs = Math.max(0, cues.at(-1)?.audioEndMs ?? 0);
  return {
    cueCount: cues.length,
    cues,
    durationMs,
    source,
    status,
  };
}

function emptyTelepromptCueTimeline(source: TelepromptCueTimelineSource): TelepromptCueTimeline {
  return {
    cueCount: 0,
    cues: [],
    durationMs: 0,
    source,
    status: "empty",
  };
}

function cueDraftFromBlock(block: RevisionBlock): MutableCueDraft {
  const spokenText = block.spokenText || block.text;
  return {
    audioEndMs: 0,
    audioStartMs: 0,
    confidence: safeConfidence(block.confidence, 0.75),
    cueId: `cue-${block.id}`,
    normalizedText: normalizeCueText(spokenText),
    sourceBlockId: block.id,
    spokenText,
    text: block.text,
    timingLevel: "estimate",
    timingSource: "estimate",
    wordTimings: [],
  };
}

function anchorEntriesFromHighlightMapV2(map: HighlightMapV2): HighlightMapV2Entry[] {
  const nonWordEntries = sortedCopy(
    map.entries.filter((entry) => entry.level !== "word"),
    compareV2EntryTime,
  );
  if (nonWordEntries.length > 0) {
    return nonWordEntries;
  }

  const byFragment = new Map<number, HighlightMapV2Entry>();
  for (const entry of sortedCopy(map.entries, compareV2EntryTime)) {
    const key = entry.fragmentIndex ?? entry.sentenceIndex ?? 0;
    if (!byFragment.has(key)) {
      byFragment.set(key, entry);
    }
  }
  return [...byFragment.values()];
}

function bestUnusedV2EntryForBlock(
  block: RevisionBlock,
  fallbackIndex: number,
  entries: readonly HighlightMapV2Entry[],
  usedEntryIds: ReadonlySet<string>,
): HighlightMapV2Entry | null {
  const blockText = normalizeCueText(block.spokenText || block.text);
  let best: { entry: HighlightMapV2Entry; score: number } | null = null;
  for (const entry of entries) {
    if (usedEntryIds.has(v2EntryKey(entry))) {
      continue;
    }
    const score = cueTextScore(blockText, normalizeCueText(v2EntryText(entry)));
    if (!best || score > best.score) {
      best = { entry, score };
    }
  }
  if (best && best.score >= CUE_TEXT_MATCH_FLOOR) {
    return best.entry;
  }
  return (
    entries.find((entry) => !usedEntryIds.has(v2EntryKey(entry))) ??
    fallbackAt(entries, fallbackIndex)
  );
}

function bestLegacyFragmentForBlock(
  block: RevisionBlock,
  fragments: readonly HighlightMap["fragments"][number][],
  usedFragmentIndexes: ReadonlySet<number>,
): HighlightMap["fragments"][number] | null {
  const blockText = normalizeCueText(block.spokenText || block.text);
  let best: { fragment: HighlightMap["fragments"][number]; score: number } | null = null;
  for (const fragment of fragments) {
    if (usedFragmentIndexes.has(fragment.index)) {
      continue;
    }
    const score = cueTextScore(blockText, normalizeCueText(fragment.text));
    if (!best || score > best.score) {
      best = { fragment, score };
    }
  }
  return best && best.score >= CUE_TEXT_MATCH_FLOOR ? best.fragment : null;
}

function wordTimingsForV2Cue(
  entries: readonly HighlightMapV2Entry[],
  cue: MutableCueDraft,
): TelepromptCueWordTiming[] {
  const cueWords = splitTeleprompterTokens(cue.spokenText).filter(
    (token): token is { kind: "word"; text: string; wordIndex: number } =>
      token.kind === "word" && token.wordIndex !== null,
  );
  let nextCueWordSearchIndex = 0;
  return sortedCopy(
    entries.filter((entry) => entry.level === "word" && entryInCueRange(entry, cue)),
    compareV2EntryTime,
  ).map((entry, index) => {
    const mappedWordIndex =
      cueWordIndexForV2Entry(entry, cueWords, nextCueWordSearchIndex) ?? index;
    nextCueWordSearchIndex = Math.max(nextCueWordSearchIndex, mappedWordIndex + 1);
    return {
      audioEndMs: resolvedEndMs(entry),
      audioStartMs: resolvedStartMs(entry),
      confidence: safeConfidence(entry.confidence, cue.confidence),
      sourceWordId: sourceWordIdForV2Entry(entry),
      sourceWordIndex: entry.sourceWordIndex,
      spokenTokenId: entry.spokenTokenId,
      text: v2EntryText(entry),
      wordIndex: mappedWordIndex,
    };
  });
}

function sourceWordIdForV2Entry(entry: HighlightMapV2Entry): string | undefined {
  if (entry.sourceWordId) {
    return entry.sourceWordId;
  }
  const sourceWordIndex = entry.sourceWordIndex;
  return typeof sourceWordIndex === "number" && Number.isInteger(sourceWordIndex)
    ? sourceWordIdFor(entry.sourceId, entry.scopeKey, sourceWordIndex)
    : undefined;
}

function cueWordIndexForV2Entry(
  entry: HighlightMapV2Entry,
  cueWords: readonly { text: string; wordIndex: number }[],
  startIndex: number,
): number | null {
  const entryText = normalizeCueText(v2EntryText(entry));
  if (!entryText) {
    return null;
  }
  const start = clamp(startIndex, 0, cueWords.length);
  for (let index = start; index < cueWords.length; index += 1) {
    if (normalizeCueText(cueWords[index]?.text ?? "") === entryText) {
      return cueWords[index]?.wordIndex ?? index;
    }
  }
  return null;
}

function wordTimingsForLegacyCue(
  tokens: readonly HighlightToken[],
  cue: MutableCueDraft,
): TelepromptCueWordTiming[] {
  return sortedCopy(
    tokens.filter(
      (token) =>
        token.startMs >= cue.audioStartMs - RANGE_EPSILON_MS &&
        token.endMs <= cue.audioEndMs + RANGE_EPSILON_MS,
    ),
    (left, right) => left.startMs - right.startMs,
  ).map((token, index) => ({
    audioEndMs: token.endMs,
    audioStartMs: token.startMs,
    confidence: safeConfidence(token.confidence, cue.confidence),
    text: token.text,
    wordIndex: index,
  }));
}

function entryInCueRange(entry: HighlightMapV2Entry, cue: MutableCueDraft): boolean {
  const startMs = resolvedStartMs(entry);
  const endMs = resolvedEndMs(entry);
  return (
    startMs >= cue.audioStartMs - RANGE_EPSILON_MS && endMs <= cue.audioEndMs + RANGE_EPSILON_MS
  );
}

function cueForAudioTime(
  timeline: TelepromptCueTimeline,
  cursorMs: number,
  timingLookup: ReadAlongTimingLookupOptions,
): TelepromptCueTimelineEntry | null {
  if (timeline.cues.length === 0) {
    return null;
  }
  const timingCues = timeline.cues.map((cue) => ({
    ...cue,
    endMs: cue.audioEndMs,
    startMs: cue.audioStartMs,
  }));
  return (
    resolveReadAlongTimingItem(timingCues, cursorMs, timingLookup)?.item ??
    fallbackCueForAudioTime(timeline, cursorMs)
  );
}

function cueForBlockId(
  timeline: TelepromptCueTimeline,
  blockId: string | null,
): TelepromptCueTimelineEntry | null {
  if (!blockId) {
    return null;
  }
  return timeline.cues.find((cue) => cue.sourceBlockId === blockId) ?? null;
}

function firstCue(timeline: TelepromptCueTimeline): TelepromptCueTimelineEntry | null {
  return fallbackAt(timeline.cues, 0);
}

function fallbackCueForAudioTime(
  timeline: TelepromptCueTimeline,
  cursorMs: number,
): TelepromptCueTimelineEntry | null {
  for (let index = timeline.cues.length - 1; index >= 0; index -= 1) {
    const cue = timeline.cues[index];
    if (cue.audioStartMs <= cursorMs) {
      return cue;
    }
  }
  return firstCue(timeline);
}

function cueWithRuntimePosition(
  cue: TelepromptCueTimelineEntry,
  cursorMs: number,
  timingLookup: ReadAlongTimingLookupOptions,
): TelepromptCueTimelineEntry {
  const durationMs = Math.max(1, cue.audioEndMs - cue.audioStartMs);
  const cueCursorMs = clamp(cursorMs - cue.audioStartMs, 0, durationMs);
  const cueProgress = clamp(cueCursorMs / durationMs, 0, 1);
  return {
    ...cue,
    cueProgress,
    currentSourceWordId: sourceWordIdForCue(cue, cursorMs, timingLookup),
    currentWordIndex: wordIndexForCue(cue, cursorMs, cueProgress, timingLookup),
  };
}

function wordIndexForCue(
  cue: TelepromptCueTimelineEntry,
  cursorMs: number,
  cueProgress: number,
  timingLookup: ReadAlongTimingLookupOptions,
): number {
  const activeTiming = wordTimingAtCursor(cue, cursorMs, timingLookup);
  if (activeTiming) {
    return activeTiming.wordIndex;
  }
  return pickTeleprompterWordIndex(cue.spokenText, cueProgress);
}

function sourceWordIdForCue(
  cue: TelepromptCueTimelineEntry,
  cursorMs: number,
  timingLookup: ReadAlongTimingLookupOptions,
): string | null {
  return wordTimingAtCursor(cue, cursorMs, timingLookup)?.sourceWordId ?? null;
}

function wordTimingAtCursor(
  cue: TelepromptCueTimelineEntry,
  cursorMs: number,
  timingLookup: ReadAlongTimingLookupOptions,
): TelepromptCueWordTiming | null {
  const timingWords = cue.wordTimings.map((word) => ({
    ...word,
    endMs: word.audioEndMs,
    startMs: word.audioStartMs,
  }));
  return resolveReadAlongTimingItem(timingWords, cursorMs, timingLookup)?.item ?? null;
}

function cueSyncStatusLabel(
  mode: TelepromptCueSyncMode,
  shouldFollowAudio: boolean,
  playbackPlaying: boolean,
): string {
  if (mode === "manual") {
    return "Manual cue mode";
  }
  if (mode === "recording-rehearsal") {
    return "Recording rehearsal mode";
  }
  if (mode === "review-playback") {
    return shouldFollowAudio ? "Review playback sync" : "Review playback waiting for audio";
  }
  if (!shouldFollowAudio) {
    return "Audio-follow waiting for generated audio";
  }
  return playbackPlaying ? "Audio-follow cue sync active" : "Audio-follow cue sync ready";
}

function cueSyncDetail({
  activeCue,
  mode,
  playbackAvailable,
  playbackPlaying,
  shouldFollowAudio,
  source,
}: Readonly<{
  activeCue: TelepromptCueTimelineEntry | null;
  mode: TelepromptCueSyncMode;
  playbackAvailable: boolean;
  playbackPlaying: boolean;
  shouldFollowAudio: boolean;
  source: TelepromptCueTimelineSource;
}>): string {
  if (!activeCue) {
    return "No cue is selected.";
  }
  if (shouldFollowAudio) {
    const progress = Math.round(activeCue.cueProgress * 100);
    const state = playbackPlaying ? "following playback" : "ready to follow playback";
    return `Cue ${activeCue.sourceBlockId} is ${state} at ${progress.toString()}% from ${timelineSourceLabel(source)}.`;
  }
  if (!playbackAvailable && mode !== "manual" && mode !== "recording-rehearsal") {
    return "Generated audio is required before this cue mode can follow the timeline.";
  }
  return `Cue ${activeCue.sourceBlockId} is selected manually from ${timelineSourceLabel(source)}.`;
}

export function timelineSourceLabel(source: TelepromptCueTimelineSource): string {
  switch (source) {
    case "highlight-map-v2": {
      return "HighlightMap v2";
    }
    case "legacy-highlight-map": {
      return "legacy highlight map";
    }
    case "job-segments": {
      return "generated audio segments";
    }
    case "estimated": {
      return "estimated cue timing";
    }
  }
}
