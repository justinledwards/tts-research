import { ContextPanel, type ContextPanelSurface } from "../context-panel";
import {
  buildCinemaLayoutState,
  type CinemaInspectorPanelId,
  type CinemaLayoutInput,
  type CinemaSurfaceKind,
} from "./model";

export function CinemaInspectorDock({
  activePanelId,
  className = "",
  mode,
  panels,
  pinnedPanelId,
  surface,
  onActivePanelChange,
  onPinnedPanelChange,
}: Readonly<
  CinemaLayoutInput & {
    className?: string;
    surface: CinemaSurfaceKind;
    onActivePanelChange: (panelId: CinemaInspectorPanelId) => void;
    onPinnedPanelChange: (panelId: CinemaInspectorPanelId | null) => void;
  }
>) {
  const state = buildCinemaLayoutState({ activePanelId, mode, panels, pinnedPanelId });
  if (!state.railVisible || !state.activePanel) {
    return null;
  }
  const pinned = state.pinnedPanelId === state.activePanel.id;
  const contextSurface = cinemaContextPanelSurface(surface);

  return (
    <aside
      className={`hidden min-h-0 min-w-0 overflow-y-auto pl-1 lg:block ${className}`}
      data-cinema-inspector-mode={mode}
    >
      <div data-cinema-inspector-body="" data-cinema-inspector-panel={state.activePanel.id}>
        <ContextPanel
          activeTabId={state.activePanel.id}
          label={`${surface} context panel`}
          pinned={pinned}
          surface={contextSurface}
          tabs={state.availablePanels}
          onPinnedChange={() => {
            onPinnedPanelChange(pinned ? null : (state.activePanel?.id ?? null));
          }}
          onTabChange={onActivePanelChange}
        />
      </div>
    </aside>
  );
}

function cinemaContextPanelSurface(surface: CinemaSurfaceKind): ContextPanelSurface {
  if (surface === "book") {
    return "BookCinema";
  }
  if (surface === "document") {
    return "DocumentCinema";
  }
  return "WebsiteCinema";
}
