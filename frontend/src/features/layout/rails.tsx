import type { WorkspaceRailMode } from "../workspace/model";
import { compactHitTargetClassName, cx, minInteractiveSize } from "../../design";

export interface RailMiniStackItem {
  readonly actionSurface?: string;
  readonly ariaLabel?: string;
  readonly detail: string;
  readonly label: string;
  readonly onClick?: () => void;
  readonly testId?: string;
  readonly tone?: "default" | "ready" | "warning";
  readonly value: string;
}

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
  items: RailMiniStackItem[];
  onAction?: () => void;
}>) {
  return (
    <div className="grid min-w-0 gap-2 p-2">
      {items.map((item) => (
        <RailMiniStackCard item={item} key={item.label} />
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

function RailMiniStackCard({ item }: Readonly<{ item: RailMiniStackItem }>) {
  const className = cx(
    "min-w-0 rounded-md border p-2 text-left vs-border vs-surface",
    item.onClick &&
      `${compactHitTargetClassName} transition hover:border-[var(--vs-selected-border)] hover:bg-[var(--vs-selected)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--vs-focus)]`,
    item.tone === "ready" && "border-[var(--vs-success-border)] bg-[var(--vs-success-soft)]",
    item.tone === "warning" && "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)]",
  );
  const content = (
    <>
      <p className="truncate text-[0.58rem] font-semibold uppercase tracking-[0.12em] vs-muted">
        {item.label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold" title={item.value}>
        {item.value}
      </p>
      <p className="mt-0.5 truncate text-[0.65rem] vs-muted" title={item.detail}>
        {item.detail}
      </p>
    </>
  );
  if (!item.onClick) {
    return <div className={className}>{content}</div>;
  }
  return (
    <button
      aria-label={item.ariaLabel ?? `${item.label}: ${item.value}`}
      className={className}
      data-hit-target-min={minInteractiveSize}
      data-testid={item.testId}
      data-ui-action-surface={item.actionSurface}
      onClick={item.onClick}
      title={`${item.label}: ${item.value}. ${item.detail}`}
      type="button"
    >
      {content}
    </button>
  );
}
