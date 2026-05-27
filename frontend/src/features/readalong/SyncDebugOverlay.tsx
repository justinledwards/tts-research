import { useMemo, useState } from "react";
import { Button } from "../../design";
import {
  addAlignmentRepairCandidate,
  addAlignmentRepairOperationFromCandidate,
  alignmentRepairMapStaleness,
  createAlignmentRepairCandidateFromSyncSnapshot,
  createAlignmentRepairMap,
  type AlignmentRepairCandidate,
  type AlignmentRepairCandidateAction,
  type AlignmentRepairContext,
  type AlignmentRepairMap,
} from "./alignmentRepairModel";
import {
  makeSyncDebugManualMarker,
  serializeSyncDebugSnapshot,
  syncDebugSnapshotRows,
  withSyncDebugManualMarker,
  type SyncDebugManualMarker,
  type SyncDebugSnapshot,
} from "./syncDebugSnapshot";

export interface SyncDebugOverlayProps {
  onRepairMapChange?: (map: AlignmentRepairMap | null) => void;
  repairContext?: AlignmentRepairContext;
  repairMap?: AlignmentRepairMap | null;
  snapshot: SyncDebugSnapshot;
}

export function SyncDebugOverlay({
  onRepairMapChange,
  repairContext,
  repairMap,
  snapshot,
}: Readonly<SyncDebugOverlayProps>) {
  const [marker, setMarker] = useState<SyncDebugManualMarker | null>(
    snapshot.manualQaMarker ?? null,
  );
  const [candidate, setCandidate] = useState<AlignmentRepairCandidate | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const markedSnapshot = useMemo(
    () => withSyncDebugManualMarker(snapshot, marker),
    [marker, snapshot],
  );
  const rows = syncDebugSnapshotRows(markedSnapshot);
  const repairStaleness = useMemo(
    () =>
      repairContext ? alignmentRepairMapStaleness(repairMap, repairContext) : { stale: false },
    [repairContext, repairMap],
  );
  const canStoreRepair = Boolean(repairContext && onRepairMapChange);
  const persistedCandidate =
    repairMap && !repairStaleness.stale ? (repairMap.candidates.at(-1) ?? null) : null;
  const activeCandidate = candidate ?? persistedCandidate;

  const handleCopy = async () => {
    const payload = serializeSyncDebugSnapshot(markedSnapshot);
    try {
      await navigator.clipboard.writeText(payload);
      setStatus("Sync debug snapshot copied.");
      return;
    } catch {
      // Fall through to the downloadable export path.
    }
    downloadSnapshot(markedSnapshot);
    setStatus("Clipboard unavailable; snapshot exported.");
  };

  const handleMarkDrift = () => {
    const nextMarker = makeSyncDebugManualMarker(markedSnapshot);
    const nextSnapshot = withSyncDebugManualMarker(snapshot, nextMarker);
    setMarker(nextMarker);
    const nextCandidate = saveRepairCandidate(nextSnapshot);
    setStatus(
      nextCandidate
        ? "Highlight drift marker added and repair candidate saved locally."
        : "Highlight drift marker added to the sync snapshot.",
    );
  };

  const handleExport = () => {
    downloadSnapshot(markedSnapshot);
    setStatus("Sync debug snapshot exported.");
  };

  const handleRepairAction = (action: AlignmentRepairCandidateAction) => {
    if (!activeCandidate || !repairContext || !onRepairMapChange) {
      setStatus("Mark drift here before saving a repair action.");
      return;
    }
    const currentMap =
      repairMap && !repairStaleness.stale ? repairMap : createAlignmentRepairMap(repairContext);
    const mapWithCandidate = currentMap.candidates.some((item) => item.id === activeCandidate.id)
      ? currentMap
      : addAlignmentRepairCandidate(currentMap, activeCandidate);
    const nextMap = addAlignmentRepairOperationFromCandidate(
      mapWithCandidate,
      activeCandidate.id,
      action,
    );
    onRepairMapChange(nextMap);
    setStatus(`${repairActionLabel(action)} saved as a local repair action.`);
  };

  function saveRepairCandidate(
    snapshotWithMarker: SyncDebugSnapshot,
  ): AlignmentRepairCandidate | null {
    if (!repairContext || !onRepairMapChange) {
      return null;
    }
    const currentMap =
      repairMap && !repairStaleness.stale ? repairMap : createAlignmentRepairMap(repairContext);
    const nextCandidate = createAlignmentRepairCandidateFromSyncSnapshot(snapshotWithMarker);
    onRepairMapChange(addAlignmentRepairCandidate(currentMap, nextCandidate));
    setCandidate(nextCandidate);
    return nextCandidate;
  }

  return (
    <div
      className="mt-4 rounded-md border border-dashed p-3 vs-border"
      data-testid="readalong-sync-debug-overlay"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="vs-muted font-semibold uppercase tracking-[0.2em]">Sync debug overlay</p>
          <p className="mt-1 text-[11px] leading-5 vs-muted">
            {markedSnapshot.surface} · {markedSnapshot.runtimeState}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="ui-action-readalong-copy-sync-debug-snapshot"
            data-ui-action-advanced="true"
            data-ui-action-owner="readalong-debug"
            data-ui-action-scope="operator"
            onClick={() => {
              void handleCopy();
            }}
            size="sm"
            variant="secondary"
          >
            Copy sync debug snapshot
          </Button>
          <Button
            data-testid="ui-action-readalong-mark-highlight-wrong"
            data-ui-action-advanced="true"
            data-ui-action-owner="readalong-debug"
            data-ui-action-scope="operator"
            onClick={handleMarkDrift}
            size="sm"
            variant="soft"
          >
            Mark drift here
          </Button>
          <Button
            data-testid="ui-action-readalong-export-sync-debug-snapshot"
            data-ui-action-advanced="true"
            data-ui-action-owner="readalong-debug"
            data-ui-action-scope="operator"
            onClick={handleExport}
            size="sm"
            variant="secondary"
          >
            Export sync debug snapshot
          </Button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((row) => (
          <div className="contents" key={`${row.label}:${row.value}`}>
            <dt className="vs-muted">{row.label}</dt>
            <dd className="truncate text-right" title={row.value}>
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {markedSnapshot.manualQaMarker ? (
        <div className="mt-3 grid gap-2 rounded-md border px-3 py-2 text-[11px] leading-5 vs-border">
          <p>
            QA marker at {markedSnapshot.currentAudioTimestamp}:{" "}
            {markedSnapshot.manualQaMarker.reason}
          </p>
          <p className="vs-muted">
            Expected {formatCandidateWord(markedSnapshot.manualQaMarker.expectedVisibleWord)} ·
            highlighted {formatCandidateWord(markedSnapshot.manualQaMarker.actualHighlightedWord)}.
          </p>
        </div>
      ) : null}
      {activeCandidate ? (
        <div
          className="mt-3 grid gap-2 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-[11px] leading-5 vs-border"
          data-testid="readalong-repair-candidate"
        >
          <p className="font-semibold">Repair candidate</p>
          <p className="vs-muted">
            {activeCandidate.sourceLocator.value} · {activeCandidate.audioTimestamp} ·{" "}
            {activeCandidate.timingSource} · confidence {formatPercent(activeCandidate.confidence)}
          </p>
          <div className="flex flex-wrap gap-2">
            {activeCandidate.recommendedActions.map((action) => (
              <Button
                data-testid={`ui-action-readalong-repair-${action}`}
                data-ui-action-advanced="true"
                data-ui-action-owner="readalong-debug"
                data-ui-action-scope="operator"
                disabled={!canStoreRepair}
                key={action}
                onClick={() => {
                  handleRepairAction(action);
                }}
                size="sm"
                variant="secondary"
              >
                {repairActionLabel(action)}
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] leading-5 vs-muted" aria-live="polite">
        {status ?? "Snapshot export includes JSON state; pair it with the current screenshot."}
      </p>
    </div>
  );
}

function repairActionLabel(action: AlignmentRepairCandidateAction): string {
  switch (action) {
    case "adjust-offset": {
      return "Adjust offset";
    }
    case "split-segment": {
      return "Split segment";
    }
    case "merge-segment": {
      return "Merge segment";
    }
    case "phrase-fallback": {
      return "Phrase fallback";
    }
    case "regenerate-segment": {
      return "Regenerate segment";
    }
  }
}

function formatCandidateWord(value: string | null): string {
  return value ? `"${value}"` : "unknown";
}

function formatPercent(value: number | null): string {
  return value === null ? "-" : `${Math.round(value * 100).toLocaleString()}%`;
}

function downloadSnapshot(snapshot: SyncDebugSnapshot): void {
  if (typeof document === "undefined") {
    return;
  }
  const blob = new Blob([serializeSyncDebugSnapshot(snapshot)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = snapshot.exportHints.jsonFileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}
