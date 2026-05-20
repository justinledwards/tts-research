import { useEffect, useMemo, useRef, useState } from "react";
import type { UiMemoryCinemaState } from "../preferences/model";
import {
  buildCinemaLayoutState,
  normalizeCinemaFocusMode,
  normalizeCinemaInspectorPanelId,
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

export interface CinemaFocusControllerOptions {
  initialState?: UiMemoryCinemaState;
  onStateChange?: (state: UiMemoryCinemaState) => void;
  resetSignal?: number;
}

export function useCinemaFocusController(
  panels: readonly CinemaPanelDefinition[],
  options: CinemaFocusControllerOptions = {},
): CinemaFocusController {
  const { initialState, onStateChange, resetSignal } = options;
  const lastResetSignalRef = useRef(resetSignal);
  const [mode, setModeState] = useState<CinemaFocusMode>(() =>
    normalizeCinemaFocusMode(initialState?.mode),
  );
  const [activePanelId, setActivePanelId] = useState<CinemaInspectorPanelId | null>(() =>
    normalizeCinemaInspectorPanelId(initialState?.activePanelId),
  );
  const [pinnedPanelId, setPinnedPanelId] = useState<CinemaInspectorPanelId | null>(() =>
    normalizeCinemaInspectorPanelId(initialState?.pinnedPanelId),
  );
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

  useEffect(() => {
    if (resetSignal === lastResetSignalRef.current) {
      return;
    }
    lastResetSignalRef.current = resetSignal;
    if (resetSignal === undefined) {
      return;
    }
    setModeState("read");
    setActivePanelId(null);
    setPinnedPanelId(null);
  }, [resetSignal]);

  useEffect(() => {
    onStateChange?.({
      activePanelId: layoutState.activePanelId,
      mode,
      pinnedPanelId: layoutState.pinnedPanelId,
    });
  }, [layoutState.activePanelId, layoutState.pinnedPanelId, mode, onStateChange]);

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
