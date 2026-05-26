import { useMemo, useState } from "react";
import { Button } from "../../design";
import {
  makeSyncDebugManualMarker,
  serializeSyncDebugSnapshot,
  syncDebugSnapshotRows,
  withSyncDebugManualMarker,
  type SyncDebugManualMarker,
  type SyncDebugSnapshot,
} from "./syncDebugSnapshot";

export interface SyncDebugOverlayProps {
  snapshot: SyncDebugSnapshot;
}

export function SyncDebugOverlay({ snapshot }: Readonly<SyncDebugOverlayProps>) {
  const [marker, setMarker] = useState<SyncDebugManualMarker | null>(
    snapshot.manualQaMarker ?? null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const markedSnapshot = useMemo(
    () => withSyncDebugManualMarker(snapshot, marker),
    [marker, snapshot],
  );
  const rows = syncDebugSnapshotRows(markedSnapshot);

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

  const handleMarkWrong = () => {
    const nextMarker = makeSyncDebugManualMarker(markedSnapshot);
    setMarker(nextMarker);
    setStatus("Highlight drift marker added.");
  };

  const handleExport = () => {
    downloadSnapshot(markedSnapshot);
    setStatus("Sync debug snapshot exported.");
  };

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
            onClick={handleMarkWrong}
            size="sm"
            variant="soft"
          >
            Mark highlight wrong here
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
        <p className="mt-3 rounded-md border px-3 py-2 text-[11px] leading-5 vs-border">
          QA marker at {markedSnapshot.currentAudioTimestamp}:{" "}
          {markedSnapshot.manualQaMarker.reason}
        </p>
      ) : null}
      <p className="mt-2 text-[11px] leading-5 vs-muted" aria-live="polite">
        {status ?? "Snapshot export includes JSON state; pair it with the current screenshot."}
      </p>
    </div>
  );
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
