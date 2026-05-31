import type { ReactNode } from "react";
import { Button, Panel } from "../../design";
import { overlayDataAttributes } from "../layout";

export interface CinemaMobilePanelSpec<TPanelId extends string = string> {
  children: ReactNode;
  icon?: ReactNode;
  id: TPanelId;
  label: string;
}

export function CinemaMobileSheet<TPanelId extends string>({
  activePanelId,
  displayControls,
  id,
  label,
  panels,
  onPanelChange,
}: Readonly<{
  activePanelId: TPanelId | null;
  displayControls?: ReactNode;
  id: string;
  label: string;
  panels: readonly CinemaMobilePanelSpec<TPanelId>[];
  onPanelChange: (panel: TPanelId | null) => void;
}>) {
  if (!activePanelId) {
    return null;
  }
  if (panels.length === 0) {
    return null;
  }
  const activePanel = panels.find((panel) => panel.id === activePanelId) ?? panels[0];

  return (
    <section
      aria-label={label}
      className="z-[55] max-h-[min(44vh,24rem)] overflow-y-auto rounded-t-2xl border-t bg-[var(--vs-raised)] px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl vs-border lg:hidden"
      data-cinema-mobile-sheet=""
      {...overlayDataAttributes("bottom-sheet", "mobile-bottom-sheet")}
      id={id}
    >
      <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-[var(--vs-border-strong)]" />
      <div
        className="mb-4 grid border-b text-sm font-semibold vs-border"
        style={{ gridTemplateColumns: `repeat(${panels.length.toString()}, minmax(0, 1fr))` }}
      >
        {panels.map((panel) => (
          <Button
            className="gap-2 rounded-none border-x-0 border-t-0 px-2 pb-3 shadow-none"
            key={panel.id}
            onClick={() => {
              onPanelChange(panel.id);
            }}
            selected={activePanel.id === panel.id}
            variant="ghost"
          >
            {panel.icon}
            {panel.label}
          </Button>
        ))}
      </div>
      {displayControls ? (
        <Panel
          aria-label="Display controls"
          className="mb-4 p-3"
          data-cinema-mobile-display-controls=""
          variant="surface"
        >
          {displayControls}
        </Panel>
      ) : null}
      {activePanel.children}
    </section>
  );
}

export function returnFocusToCinemaReaderCanvas(): void {
  const runtime = globalThis as unknown as {
    document?: Document;
    requestAnimationFrame?: typeof requestAnimationFrame;
  };
  const ownerDocument = runtime.document;
  const scheduleFrame = runtime.requestAnimationFrame;
  if (!ownerDocument || !scheduleFrame) {
    return;
  }
  scheduleFrame(() => {
    const target = ownerDocument.querySelector("[data-cinema-reader-canvas]");
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
    }
  });
}
