import type { WorkspaceRailMode } from "../workspace/model";
import { compactHitTargetClassName, minInteractiveSize } from "../../design";

export function railColumnWidth(mode: WorkspaceRailMode, side: "left" | "right"): string {
  if (mode === "collapsed") {
    return "0px";
  }
  if (mode === "compact") {
    if (side === "right") {
      return "clamp(280px, 20vw, 340px)";
    }
    return "140px";
  }
  if (side === "left") {
    return "clamp(256px, 18vw, 360px)";
  }
  return "clamp(340px, 24vw, 460px)";
}

export function RailMiniStack({
  actionLabel,
  actionSurface,
  actionTestId,
  items,
  onAction,
}: Readonly<{
  actionLabel?: string;
  actionSurface?: string;
  actionTestId?: string;
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
          className={`${compactHitTargetClassName} min-h-8 rounded-md border border-[var(--vs-selected-border)] px-2 text-[0.68rem] font-semibold text-[var(--vs-selected-text)] transition hover:bg-[var(--vs-selected)]`}
          data-hit-target-min={minInteractiveSize}
          data-testid={actionTestId}
          data-ui-action-surface={actionSurface}
          onClick={onAction}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
