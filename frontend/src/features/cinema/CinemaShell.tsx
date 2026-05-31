import type { CSSProperties, ReactNode, Ref } from "react";
import { cinemaCanvasBudgetDataAttributes, cinemaCanvasBudgetFor } from "./canvasBudget";

export function CinemaShell({
  ariaLabelledBy,
  canvas,
  canvasFirst,
  footer,
  focusMode,
  header,
  inspector,
  liveAnnouncement,
  mobileSheet,
  readerAttributes,
  rootRef,
  rendererLifecycle,
  surfaceKind,
  theatreActive = false,
  themeName,
}: Readonly<{
  ariaLabelledBy: string;
  canvas: ReactNode;
  canvasFirst: boolean;
  footer: ReactNode;
  focusMode: string;
  header: ReactNode;
  inspector?: ReactNode;
  liveAnnouncement: string;
  mobileSheet?: ReactNode;
  readerAttributes: Record<string, string>;
  rootRef: Ref<HTMLDivElement>;
  rendererLifecycle?: string;
  surfaceKind: string;
  theatreActive?: boolean;
  themeName: string;
}>) {
  const hasInspector = Boolean(inspector);
  const canvasBudget = cinemaCanvasBudgetFor({ canvasFirst, focusMode, hasInspector });
  const canvasBudgetStyle = {
    "--cinema-footer-desktop-max-height": `${canvasBudget.desktopFooterMaxHeightPx.toString()}px`,
    "--cinema-footer-max-height": `${canvasBudget.footerMaxHeightPx.toString()}px`,
  } as CSSProperties;
  const inspectorGridClassName = hasInspector
    ? "lg:grid-cols-[minmax(0,1fr)_362px]"
    : "lg:grid-cols-1";
  const mainClassName = theatreActive
    ? "grid min-h-0 flex-1 gap-0 overflow-hidden px-0 py-0 lg:grid-cols-1"
    : `grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 lg:gap-5 lg:px-4 ${inspectorGridClassName}`;

  return (
    <div
      aria-labelledby={ariaLabelledBy}
      aria-modal="true"
      className={`vs-app fixed inset-0 z-50 flex flex-col pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${
        theatreActive
          ? "bg-[var(--vs-theatre-bg)] text-[var(--vs-theatre-text)]"
          : "bg-[var(--vs-bg)] text-[var(--vs-text)]"
      }`}
      {...readerAttributes}
      {...cinemaCanvasBudgetDataAttributes(canvasBudget)}
      data-cinema-canvas-first={canvasFirst ? "true" : "false"}
      data-cinema-focus-mode={focusMode}
      data-cinema-renderer-lifecycle={rendererLifecycle ?? "ready"}
      data-cinema-surface={surfaceKind}
      data-cinema-theatre-mode={theatreActive ? "true" : "false"}
      data-theme={themeName}
      ref={rootRef}
      role="dialog"
      style={canvasBudgetStyle}
      tabIndex={-1}
    >
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>
      {header}
      <main className={mainClassName}>
        {canvas}
        {inspector}
      </main>
      {mobileSheet}
      {footer}
    </div>
  );
}
