import { useMemo, useState } from "react";
import {
  buildCinemaLayoutState,
  type CinemaFocusMode,
  type CinemaInspectorPanelId,
  type CinemaLayoutState,
  type CinemaPanelDefinition,
} from "./model";

export interface CinemaFocusController {
  activePanelId: CinemaInspectorPanelId | null;
  layoutState: CinemaLayoutState;
  mode: CinemaFocusMode;
  pinnedPanelId: CinemaInspectorPanelId | null;
  setActivePanelId: (panelId: CinemaInspectorPanelId) => void;
  setMode: (mode: CinemaFocusMode) => void;
  setPinnedPanelId: (panelId: CinemaInspectorPanelId | null) => void;
}

export function useCinemaFocusController(
  panels: readonly CinemaPanelDefinition[],
): CinemaFocusController {
  const [mode, setModeState] = useState<CinemaFocusMode>("read");
  const [activePanelId, setActivePanelId] = useState<CinemaInspectorPanelId | null>(null);
  const [pinnedPanelId, setPinnedPanelId] = useState<CinemaInspectorPanelId | null>(null);
  const layoutState = useMemo(
    () => buildCinemaLayoutState({ activePanelId, mode, panels, pinnedPanelId }),
    [activePanelId, mode, panels, pinnedPanelId],
  );

  const setMode = (nextMode: CinemaFocusMode) => {
    const nextState = buildCinemaLayoutState({
      activePanelId,
      mode: nextMode,
      panels,
      pinnedPanelId,
    });
    setModeState(nextMode);
    setActivePanelId(nextState.activePanelId);
  };

  return {
    activePanelId: layoutState.activePanelId,
    layoutState,
    mode,
    pinnedPanelId: layoutState.pinnedPanelId,
    setActivePanelId,
    setMode,
    setPinnedPanelId,
  };
}
