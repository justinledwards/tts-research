import { forwardRef, type ReactNode } from "react";
import { cx } from "../tokens";
import { Button } from "./Button";

export interface DrawerProps {
  children: ReactNode;
  className?: string;
  label: string;
  metadata?: { label: string; value: string }[];
  modal?: boolean;
  onClose: () => void;
  overlayOwner?: string;
  overlayZone?: string;
  scopeTitle?: string;
  title: string;
}

export const Drawer = forwardRef<HTMLElement, DrawerProps>(function Drawer(
  {
    children,
    className,
    label,
    metadata = [],
    modal = true,
    onClose,
    overlayOwner,
    overlayZone,
    scopeTitle,
    title,
  },
  ref,
) {
  const isSettingsDrawer = label === "Settings";
  const closeTestId = isSettingsDrawer
    ? "ui-action-settings-return-workspace"
    : `ui-action-${label.toLowerCase().replaceAll(/\s+/g, "-")}-close`;
  return (
    <div
      className={cx(
        "fixed inset-0 z-[60] overflow-hidden",
        modal ? "bg-[var(--vs-surface-overlay)]" : "pointer-events-none bg-transparent",
      )}
      data-overlay-owner={overlayOwner}
      data-overlay-zone={overlayZone}
      role="presentation"
    >
      <aside
        aria-label={label}
        aria-modal={modal ? true : undefined}
        className={cx(
          "pointer-events-auto vs-app vs-workbench ml-auto flex h-full w-full max-w-[860px] flex-col border-l border-[var(--vs-border-subtle)] shadow-2xl md:w-[820px]",
          className,
        )}
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-3 border-b px-5 py-4 vs-work-surface">
          <DrawerTitleSummary
            label={label}
            metadata={metadata}
            scopeTitle={scopeTitle}
            title={title}
          />
          <Button
            aria-label={`Close ${label}`}
            data-testid={closeTestId}
            data-ui-action-owner={isSettingsDrawer ? "settings" : undefined}
            data-ui-action-surface={isSettingsDrawer ? "Settings" : undefined}
            onClick={onClose}
            size="sm"
            variant="ghost"
          >
            {isSettingsDrawer ? "Return to Workspace" : "Close"}
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">{children}</div>
      </aside>
    </div>
  );
});

function DrawerTitleSummary({
  label,
  metadata,
  scopeTitle,
  title,
}: Readonly<{
  label: string;
  metadata: { label: string; value: string }[];
  scopeTitle?: string;
  title: string;
}>) {
  return (
    <div className="min-w-0">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">{label}</p>
      <h2 className="mt-1 truncate text-sm font-semibold text-[var(--vs-text)]" title={title}>
        {title}
      </h2>
      {scopeTitle || metadata.length > 0 ? (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs vs-muted">
          {scopeTitle ? (
            <span className="inline-flex min-w-0 max-w-full items-center gap-1 truncate">
              <span className="shrink-0 font-semibold">Scope</span>
              {scopeTitle}
            </span>
          ) : null}
          {metadata.map((item) => (
            <span
              className="inline-flex min-w-0 max-w-full items-center gap-1 before:text-[var(--vs-muted)] before:content-['·']"
              key={`${item.label}-${item.value}`}
              title={`${item.label}: ${item.value}`}
            >
              <span className="shrink-0 font-semibold">{item.label}</span>
              <span className="min-w-0 truncate">{item.value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
