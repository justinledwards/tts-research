import { Button, Panel, StatusChip } from "../../design";
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
        <Panel className="overflow-hidden" data-cinema-inspector-panel={state.activePanel.id}>
          <div className="border-b p-3 vs-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
                  Inspector
                </p>
                <h3 className="mt-1 truncate text-sm font-semibold">{state.activePanel.title}</h3>
                <p className="mt-1 truncate text-xs vs-muted">{state.activePanel.detail}</p>
              </div>
              <Button
                aria-pressed={pinned}
                className="shrink-0"
                onClick={() => {
                  onPinnedPanelChange(pinned ? null : (state.activePanel?.id ?? null));
                }}
                selected={pinned}
                size="sm"
                variant={pinned ? "pinned" : "ghost"}
              >
                {pinned ? "Pinned" : "Pin"}
              </Button>
            </div>
            {state.availablePanels.length > 1 ? (
              <div className="mt-3 grid gap-1.5">
                {state.availablePanels.map((panel) => {
                  const panelPinned = panel.id === state.pinnedPanelId;
                  const panelActive = panel.id === state.activePanelId && !panelPinned;
                  return (
                    <Button
                      align="start"
                      aria-current={panelActive ? "true" : undefined}
                      className="min-w-0 flex-col gap-1 px-3 py-2"
                      key={panel.id}
                      onClick={() => {
                        onActivePanelChange(panel.id);
                      }}
                      selected={panelActive}
                      variant={panelPinned ? "pinned" : "secondary"}
                    >
                      <span className="flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-semibold">
                          {panel.title}
                        </span>
                        {panelPinned ? (
                          <StatusChip className="py-0.5 text-[0.65rem]" tone="pinned">
                            Pinned
                          </StatusChip>
                        ) : null}
                      </span>
                      <span className="mt-1 block truncate text-xs vs-muted">{panel.detail}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
          <div className="p-3" data-cinema-inspector-body="">
            {state.activePanel.children}
          </div>
        </Panel>
      </div>
    </aside>
  );
}
