import type { WorkspaceRailMode } from "../workspace/model";
import { compactHitTargetClassName, minInteractiveSize } from "../../design";
import {
  compactRailControlMeta,
  railModeControlMeta,
  type CompactRailControlId,
} from "./railControls";

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
      <div
        className="grid shrink-0 grid-cols-3 gap-0.5 rounded-md border p-0.5 vs-border vs-surface"
        data-rail-mode-toolbar={label}
        data-segmented-control="rail-mode"
      >
        {(["full", "compact", "collapsed"] as const).map((item) => {
          const meta = railModeControlMeta(item);
          return (
            <button
              aria-label={meta.ariaLabel(label)}
              aria-pressed={mode === item}
              className={`${compactHitTargetClassName} h-7 min-w-10 rounded px-1.5 text-[0.58rem] font-semibold transition ${
                mode === item
                  ? "bg-orange-500 text-white"
                  : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
              }`}
              data-command-id={meta.commandId}
              data-hit-target-min={minInteractiveSize}
              data-rail-mode-option={item}
              data-segmented-option={item}
              data-testid={`ui-action-rail-${railLabelId(label)}-${item}`}
              key={item}
              onClick={() => {
                onModeChange(item);
              }}
              title={meta.tooltip(label)}
              type="button"
            >
              {meta.visibleLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
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
          className={`${compactHitTargetClassName} min-h-8 rounded-md border border-orange-300 px-2 text-[0.68rem] font-semibold text-orange-700 transition hover:bg-orange-50`}
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

export function CompactRailToggle({
  controlId,
  onExpand,
}: Readonly<{ controlId: CompactRailControlId; onExpand: () => void }>) {
  const meta = compactRailControlMeta(controlId);
  return (
    <button
      aria-label={meta.ariaLabel}
      className="compact-rail-toggle mx-auto mt-2 grid min-h-14 w-11 place-items-center rounded-md border px-1 py-1.5 text-[0.58rem] font-semibold leading-none transition hover:bg-[var(--vs-surface)] vs-border"
      data-collapsed-state={meta.collapsedState}
      data-command-id={meta.commandId}
      data-compact-control="rail-toggle"
      data-compact-control-id={meta.id}
      data-expanded-state={meta.expandedState}
      data-testid={`ui-action-compact-rail-${meta.id}-expand`}
      onClick={onExpand}
      title={meta.tooltip}
      type="button"
    >
      <span aria-hidden="true" className="compact-rail-toggle-icon" />
      <span className="compact-rail-toggle-label">{meta.visibleLabel}</span>
    </button>
  );
}

function railLabelId(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}
