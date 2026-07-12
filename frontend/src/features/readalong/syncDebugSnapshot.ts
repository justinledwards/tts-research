import type { HighlightCue } from "../../highlightMap";
import type { ReadingPosition } from "../../types";
import type { ReadAlongRuntimeSnapshot } from "./readAlongState";

export const SYNC_DEBUG_SNAPSHOT_SCHEMA_VERSION = "sync-debug-snapshot.v1";

export interface SyncDebugSourceLocator {
  activeWordIndex?: number | null;
  blockId?: string | null;
  bookmarkTarget?: string | null;
  kind: "book" | "fixture" | "prepared-source" | "unknown";
  pageIndex?: number | null;
  projectId?: string | null;
  scopeKey?: string | null;
  sourceId?: string | null;
  sourceTitle?: string | null;
  textQuote?: string | null;
  value: string;
}

export interface SyncDebugManualMarker {
  actualHighlightedWord: string | null;
  markedAt: string;
  reason: string;
  sourceLocator: SyncDebugSourceLocator;
  audioTimeSec: number;
  confidence: number | null;
  expectedVisibleWord: string | null;
  timingSource: string;
}

export interface SyncDebugEntity {
  id: string | null;
  index: number | null;
  label: string;
  text: string | null;
}

export interface SyncDebugCueSnapshot {
  activeWordIndex: number | null;
  fragmentIndex: number | null;
  nodeId: string | null;
  phraseWordEnd: number | null;
  phraseWordStart: number | null;
  readingPosition: ReadingPosition | null;
  segmentIndex: number | null;
  text: string | null;
  timingMs: {
    end: number | null;
    start: number | null;
  };
  tokenIndex: number | null;
}

export interface SyncDebugSnapshot {
  activePhrase: SyncDebugEntity;
  activeSegment: SyncDebugEntity;
  activeWord: SyncDebugEntity;
  activeCue: SyncDebugCueSnapshot | null;
  capturedAt: string;
  confidence: number | null;
  currentAudioTimeSec: number;
  currentAudioTimestamp: string;
  currentSourceLocator: SyncDebugSourceLocator;
  degradedModeReason: string | null;
  driftMs: number | null;
  expectedCue: SyncDebugCueSnapshot | null;
  exportHints: {
    jsonFileName: "sync-debug-snapshot.json";
    screenshotRecommended: boolean;
  };
  highlightMode: string;
  manualQaMarker: SyncDebugManualMarker | null;
  resyncCount: number;
  runtimeState: string;
  schemaVersion: typeof SYNC_DEBUG_SNAPSHOT_SCHEMA_VERSION;
  surface: string;
  timingSource: string;
}

export interface BuildSyncDebugSnapshotInput {
  activePhraseText?: string | null;
  activeSegmentId?: string | null;
  activeSegmentIndex?: number | null;
  activeSegmentLabel?: string | null;
  activeWordText?: string | null;
  capturedAt?: string;
  currentSourceLocator: SyncDebugSourceLocator;
  degradedModeReason?: string | null;
  highlightMode?: string | null;
  manualQaMarker?: SyncDebugManualMarker | null;
  runtime?: ReadAlongRuntimeSnapshot | null;
  surface: string;
}

export interface SyncDebugSnapshotRow {
  label: string;
  value: string;
}

export function buildReadAlongSyncDebugSnapshot({
  activePhraseText,
  activeSegmentId,
  activeSegmentIndex,
  activeSegmentLabel,
  activeWordText,
  capturedAt = new Date().toISOString(),
  currentSourceLocator,
  degradedModeReason,
  highlightMode,
  manualQaMarker = null,
  runtime,
  surface,
}: BuildSyncDebugSnapshotInput): SyncDebugSnapshot {
  const activeCue = runtime?.activeCue ?? null;
  const expectedCue = runtime?.expectedCue ?? null;
  const segmentIndex =
    activeSegmentIndex ?? cueSegmentIndex(activeCue) ?? cueSegmentIndex(expectedCue) ?? null;
  const segmentLabel =
    activeSegmentLabel ??
    (segmentIndex === null ? "No active segment" : `Segment ${String(segmentIndex + 1)}`);
  const phraseText =
    activePhraseText ?? activeCue?.fragment?.text ?? expectedCue?.fragment?.text ?? null;
  const wordText = activeWordText ?? activeCue?.token?.text ?? expectedCue?.token?.text ?? null;
  const audioTimeSec = Math.max(0, runtime?.audioTimeSec ?? 0);
  const mode = highlightMode ?? runtime?.mode ?? "none";
  const syncReason = runtime?.reason ?? null;

  return {
    activeCue: compactCueSnapshot(activeCue),
    activePhrase: {
      id: activeCue?.fragmentIndex === undefined ? null : String(activeCue.fragmentIndex),
      index: activeCue?.fragmentIndex ?? null,
      label:
        activeCue?.fragmentIndex === undefined
          ? "No active phrase"
          : `Phrase ${String(activeCue.fragmentIndex + 1)}`,
      text: phraseText,
    },
    activeSegment: {
      id: activeSegmentId ?? (segmentIndex === null ? null : String(segmentIndex)),
      index: segmentIndex,
      label: segmentLabel,
      text: null,
    },
    activeWord: {
      id: activeCue?.tokenIndex === undefined ? null : String(activeCue.tokenIndex),
      index: activeCue?.activeWordIndex ?? currentSourceLocator.activeWordIndex ?? null,
      label:
        activeCue?.activeWordIndex === undefined
          ? "No active word"
          : `Word ${String(activeCue.activeWordIndex)}`,
      text: wordText,
    },
    capturedAt,
    confidence: runtime?.confidence ?? null,
    currentAudioTimeSec: audioTimeSec,
    currentAudioTimestamp: formatAudioTimestamp(audioTimeSec),
    currentSourceLocator,
    degradedModeReason: degradedModeReason ?? (isDegradedRuntime(runtime) ? syncReason : null),
    driftMs: runtime?.driftMs ?? null,
    expectedCue: compactCueSnapshot(expectedCue),
    exportHints: {
      jsonFileName: "sync-debug-snapshot.json",
      screenshotRecommended: true,
    },
    highlightMode: mode,
    manualQaMarker,
    resyncCount: runtime?.resyncCount ?? 0,
    runtimeState: runtime?.state ?? "missing",
    schemaVersion: SYNC_DEBUG_SNAPSHOT_SCHEMA_VERSION,
    surface,
    timingSource: runtime?.timingSource ?? "Unavailable",
  };
}

export function syncDebugSnapshotRows(snapshot: SyncDebugSnapshot): SyncDebugSnapshotRow[] {
  return [
    { label: "Audio time", value: snapshot.currentAudioTimestamp },
    { label: "Active segment", value: snapshot.activeSegment.label },
    { label: "Active phrase", value: entityTextOrLabel(snapshot.activePhrase) },
    { label: "Active word", value: entityTextOrLabel(snapshot.activeWord) },
    { label: "Timing source", value: snapshot.timingSource },
    { label: "Confidence", value: formatPercent(snapshot.confidence) },
    { label: "Drift", value: formatMs(snapshot.driftMs) },
    { label: "Resync count", value: snapshot.resyncCount.toLocaleString() },
    { label: "Highlight mode", value: snapshot.highlightMode },
    { label: "Degraded reason", value: snapshot.degradedModeReason ?? "-" },
    { label: "Source locator", value: snapshot.currentSourceLocator.value },
  ];
}

export function serializeSyncDebugSnapshot(snapshot: SyncDebugSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export function withSyncDebugManualMarker(
  snapshot: SyncDebugSnapshot,
  marker: SyncDebugManualMarker | null,
): SyncDebugSnapshot {
  return {
    ...snapshot,
    manualQaMarker: marker,
  };
}

export function makeSyncDebugManualMarker(
  snapshot: SyncDebugSnapshot,
  reason = "Tester marked the current highlight as wrong.",
  markedAt = new Date().toISOString(),
): SyncDebugManualMarker {
  return {
    actualHighlightedWord: snapshot.activeWord.text ?? snapshot.activeCue?.text ?? null,
    audioTimeSec: snapshot.currentAudioTimeSec,
    confidence: snapshot.confidence,
    expectedVisibleWord:
      snapshot.currentSourceLocator.textQuote ??
      snapshot.expectedCue?.text ??
      snapshot.activeWord.text ??
      null,
    markedAt,
    reason,
    sourceLocator: snapshot.currentSourceLocator,
    timingSource: snapshot.timingSource,
  };
}

function compactCueSnapshot(cue: HighlightCue | null): SyncDebugCueSnapshot | null {
  if (!cue) {
    return null;
  }
  const timing = cue.token ?? cue.fragment ?? null;
  return {
    activeWordIndex: cue.activeWordIndex,
    fragmentIndex: cue.fragmentIndex ?? null,
    nodeId: cue.readingPosition?.nodeId ?? cue.fragment?.readingPosition?.nodeId ?? null,
    phraseWordEnd: cue.phraseWordEnd ?? null,
    phraseWordStart: cue.phraseWordStart ?? null,
    readingPosition: cue.readingPosition ?? cue.fragment?.readingPosition ?? null,
    segmentIndex: cueSegmentIndex(cue),
    text: cue.token?.text ?? cue.fragment?.text ?? null,
    timingMs: {
      end: timing?.endMs ?? null,
      start: timing?.startMs ?? null,
    },
    tokenIndex: cue.tokenIndex ?? null,
  };
}

function cueSegmentIndex(cue: HighlightCue | null): number | null {
  return cue?.token?.segmentIndex ?? cue?.fragment?.segmentIndex ?? null;
}

function entityTextOrLabel(entity: SyncDebugEntity): string {
  return entity.text ? `${entity.label}: ${entity.text}` : entity.label;
}

function isDegradedRuntime(runtime: ReadAlongRuntimeSnapshot | null | undefined): boolean {
  return (
    runtime?.state === "degraded" ||
    runtime?.state === "stale-audio" ||
    runtime?.mode === "block" ||
    runtime?.mode === "degraded" ||
    runtime?.mode === "none"
  );
}

function formatAudioTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function formatMs(value: number | null): string {
  return value === null ? "-" : `${Math.round(value).toLocaleString()}ms`;
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100).toLocaleString()}%`;
}
