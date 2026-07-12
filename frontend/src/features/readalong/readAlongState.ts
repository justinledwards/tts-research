import type { HighlightCue } from "../../highlightMap";

export type ReadAlongRuntimeState =
  | "synced-word"
  | "synced-phrase"
  | "resyncing"
  | "degraded"
  | "paused"
  | "seeking"
  | "stale-audio";

export type ReadAlongVisualMode = "word" | "phrase" | "sentence" | "block" | "degraded" | "none";

export interface ReadAlongRuntimeSnapshot {
  activeCue: HighlightCue | null;
  activeTokenIndex: number | null;
  audioTimeSec: number;
  confidence: number | null;
  driftMs: number | null;
  expectedCue: HighlightCue | null;
  expectedTokenIndex: number | null;
  mode: ReadAlongVisualMode;
  reason: string;
  resyncCount: number;
  state: ReadAlongRuntimeState;
  timingSource: string;
}

export interface ReadAlongRuntimeDebugRow {
  label: string;
  value: string;
}

export function readAlongRuntimeStateLabel(snapshot: ReadAlongRuntimeSnapshot): string {
  switch (snapshot.state) {
    case "synced-word": {
      return "Synced word";
    }
    case "synced-phrase": {
      return "Synced phrase";
    }
    case "resyncing": {
      return "Resyncing";
    }
    case "degraded": {
      return "Degraded sync";
    }
    case "paused": {
      return "Paused";
    }
    case "seeking": {
      return "Seeking";
    }
    case "stale-audio": {
      return "Stale audio";
    }
  }
}

export function readAlongRuntimeDebugRows(
  snapshot: ReadAlongRuntimeSnapshot | null | undefined,
): ReadAlongRuntimeDebugRow[] {
  if (!snapshot) {
    return [{ label: "Runtime sync", value: "No runtime sync snapshot" }];
  }
  return [
    { label: "Audio time", value: `${snapshot.audioTimeSec.toFixed(2)}s` },
    { label: "Active token", value: formatNullableNumber(snapshot.activeTokenIndex) },
    { label: "Expected token", value: formatNullableNumber(snapshot.expectedTokenIndex) },
    { label: "Drift", value: formatNullableMs(snapshot.driftMs) },
    { label: "Timing source", value: snapshot.timingSource },
    { label: "Confidence", value: formatNullablePercent(snapshot.confidence) },
    { label: "Resync count", value: snapshot.resyncCount.toLocaleString() },
  ];
}

export function readAlongRuntimeStatusClassName(snapshot: ReadAlongRuntimeSnapshot): string {
  if (snapshot.state === "synced-word" || snapshot.state === "synced-phrase") {
    return "text-[var(--vs-status-success)]";
  }
  if (snapshot.state === "stale-audio" || snapshot.state === "degraded") {
    return "text-[var(--vs-action-primary)]";
  }
  return "text-[var(--vs-status-warning)]";
}

function formatNullableNumber(value: number | null): string {
  return value === null ? "-" : value.toLocaleString();
}

function formatNullableMs(value: number | null): string {
  return value === null ? "-" : `${Math.round(value).toLocaleString()}ms`;
}

function formatNullablePercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100).toLocaleString()}%`;
}
