import { Button, StatusChip, type StatusChipTone } from "../../design";
import type { RevisionHistoryEntry } from "./revisionHistory";
import { REVISION_STATUS_LABELS, type RevisionStatus } from "./revisionFilters";

export function newestHistoryEntries(
  entries: readonly RevisionHistoryEntry[],
): RevisionHistoryEntry[] {
  const newestFirst: RevisionHistoryEntry[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    newestFirst.push(entries[index]);
  }
  return newestFirst;
}

export function historyEntryHasTextChange(entry: RevisionHistoryEntry): boolean {
  return entry.previousSpokenText !== entry.newSpokenText;
}

export function RevisionHistoryItem({
  entry,
  onRevertEntry,
}: Readonly<{
  entry: RevisionHistoryEntry;
  onRevertEntry: (entry: RevisionHistoryEntry) => void;
}>) {
  const hasTextChange = historyEntryHasTextChange(entry);
  return (
    <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold" title={entry.blockLabel}>
            {entry.userAction} · {entry.blockLabel}
          </p>
          <p className="mt-1 text-xs vs-muted">
            {formatHistoryTime(entry.timestamp)} · {entry.policyProfile} · {entry.voiceProfile} ·{" "}
            {entry.runConfiguration}
          </p>
        </div>
        {hasTextChange ? (
          <Button
            data-testid={`ui-action-revision-history-revert-${entry.id}`}
            onClick={() => {
              onRevertEntry(entry);
            }}
            size="sm"
            variant="secondary"
          >
            Revert
          </Button>
        ) : null}
      </div>
      {hasTextChange ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <RevisionHistoryText label="Previous" value={entry.previousSpokenText} />
          <RevisionHistoryText label="New" value={entry.newSpokenText} />
        </div>
      ) : null}
    </div>
  );
}

export function RevisionMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  );
}

export function RevisionFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 truncate font-semibold" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function RevisionStatusChip({ status }: Readonly<{ status: RevisionStatus }>) {
  return (
    <StatusChip tone={revisionStatusTone(status)}>{REVISION_STATUS_LABELS[status]}</StatusChip>
  );
}

export function DiagnosticList({
  emptyText,
  items,
  title,
}: Readonly<{
  emptyText: string;
  items: { detail: string; id: string; label: string }[];
  title: string;
}>) {
  return (
    <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <p className="font-semibold">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 grid gap-2">
          {items.map((item) => (
            <li
              className="rounded-md border bg-[var(--vs-raised)] p-3 text-sm vs-border"
              key={item.id}
            >
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 leading-6 vs-muted">{item.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm vs-muted">{emptyText}</p>
      )}
    </div>
  );
}

export function RevisionHistoryText({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5">
        {value}
      </p>
    </div>
  );
}

export function RevisionEmptyState({ detail }: Readonly<{ detail: string }>) {
  return (
    <div className="rounded-lg border border-dashed bg-[var(--vs-surface)] p-5 text-sm vs-border">
      <p className="font-semibold">Nothing to show</p>
      <p className="mt-2 vs-muted">{detail}</p>
    </div>
  );
}

export function revisionStatusTone(status: RevisionStatus): StatusChipTone {
  if (status === "approved") {
    return "success";
  }
  if (status === "needsReview") {
    return "warning";
  }
  if (status === "regenerating" || status === "retrying") {
    return "info";
  }
  return "neutral";
}

export function formatConfidence(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "waiting";
  }
  return `${Math.round(value * 100).toString()}%`;
}

export function formatDurationLabel(valueMs: number): string {
  if (!Number.isFinite(valueMs) || valueMs <= 0) {
    return "0s";
  }
  const totalSeconds = Math.round(valueMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes.toString()}m ${seconds.toString()}s` : `${seconds.toString()}s`;
}

export function formatHistoryTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }
  return date.toLocaleString(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  });
}
