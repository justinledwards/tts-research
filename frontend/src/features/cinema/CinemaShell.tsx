import type { ReactNode, Ref } from "react";

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
  themeName: string;
}>) {
  const hasInspector = Boolean(inspector);

  return (
    <div
      aria-labelledby={ariaLabelledBy}
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col bg-[var(--vs-bg)] pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-[var(--vs-text)]"
      {...readerAttributes}
      data-cinema-canvas-first={canvasFirst ? "true" : "false"}
      data-cinema-focus-mode={focusMode}
      data-cinema-renderer-lifecycle={rendererLifecycle ?? "ready"}
      data-cinema-surface={surfaceKind}
      data-theme={themeName}
      ref={rootRef}
      role="dialog"
      tabIndex={-1}
    >
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>
      {header}
      <main
        className={`grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 lg:gap-5 lg:px-4 ${
          hasInspector ? "lg:grid-cols-[minmax(0,1fr)_362px]" : "lg:grid-cols-1"
        }`}
      >
        {canvas}
        {inspector}
      </main>
      {mobileSheet}
      {footer}
    </div>
  );
}
