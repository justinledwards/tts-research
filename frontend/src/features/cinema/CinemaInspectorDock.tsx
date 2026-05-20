import {
  buildCinemaLayoutState,
  type CinemaInspectorPanelId,
  type CinemaLayoutInput,
} from "./model";

export function CinemaInspectorDock({
  activePanelId,
  className = "",
  mode,
  panels,
  pinnedPanelId,
  onActivePanelChange,
  onPinnedPanelChange,
}: Readonly<
  CinemaLayoutInput & {
    className?: string;
    onActivePanelChange: (panelId: CinemaInspectorPanelId) => void;
    onPinnedPanelChange: (panelId: CinemaInspectorPanelId | null) => void;
  }
>) {
  const state = buildCinemaLayoutState({ activePanelId, mode, panels, pinnedPanelId });
  if (!state.railVisible || !state.activePanel) {
    return null;
  }
  const pinned = state.pinnedPanelId === state.activePanel.id;

  return (
    <aside
      className={`hidden min-h-0 min-w-0 overflow-y-auto pl-1 lg:block ${className}`}
      data-cinema-inspector-mode={mode}
    >
      <div className="grid gap-3">
        <section className="min-w-0 overflow-hidden rounded-md border bg-[var(--vs-raised)] shadow-sm vs-border">
          <div className="border-b p-3 vs-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                  Inspector
                </p>
                <h3 className="mt-1 truncate text-sm font-semibold">{state.activePanel.title}</h3>
                <p className="mt-1 truncate text-xs vs-muted">{state.activePanel.detail}</p>
              </div>
              <button
                aria-pressed={pinned}
                className={`h-8 shrink-0 rounded-md border px-2 text-xs font-semibold transition vs-border ${
                  pinned
                    ? "bg-orange-500/10 text-orange-600"
                    : "vs-muted hover:bg-[var(--vs-surface)] hover:text-[var(--vs-text)]"
                }`}
                onClick={() => {
                  onPinnedPanelChange(pinned ? null : (state.activePanel?.id ?? null));
                }}
                type="button"
              >
                {pinned ? "Pinned" : "Pin"}
              </button>
            </div>
            {state.availablePanels.length > 1 ? (
              <div className="mt-3 grid gap-1.5">
                {state.availablePanels.map((panel) => (
                  <button
                    aria-current={panel.id === state.activePanelId ? "true" : undefined}
                    className={`min-w-0 rounded-md border px-3 py-2 text-left transition vs-border ${
                      panel.id === state.activePanelId
                        ? "border-orange-400 bg-orange-500/10 text-orange-600"
                        : "hover:bg-[var(--vs-surface)]"
                    }`}
                    key={panel.id}
                    onClick={() => {
                      onActivePanelChange(panel.id);
                    }}
                    type="button"
                  >
                    <span className="block truncate text-sm font-semibold">{panel.title}</span>
                    <span className="mt-1 block truncate text-xs vs-muted">{panel.detail}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="p-3">{state.activePanel.children}</div>
        </section>
      </div>
    </aside>
  );
}
