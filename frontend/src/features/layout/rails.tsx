import type { ReactNode } from "react";
import type { WorkspaceRailMode } from "../workspace/model";

export function railColumnWidth(mode: WorkspaceRailMode, side: "left" | "right"): string {
  if (mode === "collapsed") {
    return "52px";
  }
  if (mode === "compact") {
    return "140px";
  }
  if (side === "left") {
    return "clamp(256px, 18vw, 360px)";
  }
  return "clamp(252px, 19vw, 360px)";
}

export function RailModeToolbar({
  label,
  mode,
  onModeChange,
}: Readonly<{
  label: string;
  mode: WorkspaceRailMode;
  onModeChange: (mode: WorkspaceRailMode) => void;
}>) {
  const labelByMode: Record<WorkspaceRailMode, string> = {
    collapsed: "Hide",
    compact: "Slim",
    full: "Full",
  };
  const visibleLabel = label === "Voice Command" ? "Voice" : label;
  return (
    <div
      className={`sticky top-0 z-20 flex min-w-0 items-center justify-between gap-2 border-b backdrop-blur vs-border vs-raised ${
        mode === "compact" ? "px-1.5 py-1" : "px-2 py-1.5"
      }`}
    >
      <span
        className={`min-w-0 truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em] vs-muted ${
          mode === "compact" ? "sr-only" : ""
        }`}
        title={label}
      >
        {visibleLabel}
      </span>
      <div className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border p-0.5 vs-border vs-surface">
        {(["full", "compact", "collapsed"] as const).map((item) => (
          <button
            aria-label={`${label} ${item}`}
            className={`h-6 rounded px-1.5 text-[0.58rem] font-semibold capitalize transition ${
              mode === item
                ? "bg-orange-500 text-white"
                : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
            }`}
            key={item}
            onClick={() => {
              onModeChange(item);
            }}
            type="button"
          >
            {labelByMode[item]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RailMiniStack({
  actionLabel,
  items,
  onAction,
}: Readonly<{
  actionLabel?: string;
  items: { detail: string; label: string; value: string }[];
  onAction?: () => void;
}>) {
  return (
    <div className="grid min-w-0 gap-2 p-2">
      {items.map((item) => (
        <div className="min-w-0 rounded-md border p-2 vs-border vs-surface" key={item.label}>
          <p className="truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em] vs-muted">
            {item.label}
          </p>
          <p className="mt-1 truncate text-xs font-semibold" title={item.value}>
            {item.value}
          </p>
          <p className="mt-0.5 truncate text-[0.65rem] vs-muted" title={item.detail}>
            {item.detail}
          </p>
        </div>
      ))}
      {actionLabel && onAction ? (
        <button
          className="min-h-8 rounded-md border border-orange-300 px-2 text-[0.68rem] font-semibold text-orange-700 transition hover:bg-orange-50"
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function CollapsedRailButton({
  label,
  shortLabel,
  onExpand,
}: Readonly<{ label: string; shortLabel: ReactNode; onExpand: () => void }>) {
  return (
    <button
      aria-label={`Expand ${label}`}
      className="mx-auto mt-2 grid h-9 w-9 place-items-center rounded-md border text-xs font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
      onClick={onExpand}
      title={label}
      type="button"
    >
      {shortLabel}
    </button>
  );
}
