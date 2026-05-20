import type { ReactNode } from "react";

export const CINEMA_FOCUS_MODES = ["read", "inspect", "review", "debug"] as const;

export type CinemaFocusMode = (typeof CINEMA_FOCUS_MODES)[number];
export type CinemaSurfaceKind = "book" | "document" | "website";
export type CinemaInspectorPanelId =
  | "current"
  | "wayfinding"
  | "provenance"
  | "policy"
  | "health"
  | "notes"
  | "queue"
  | "debug";

export interface CinemaPanelDefinition {
  children: ReactNode;
  detail: string;
  id: CinemaInspectorPanelId;
  modeAffinity: CinemaFocusMode | readonly CinemaFocusMode[];
  title: string;
}

export interface CinemaLayoutInput {
  activePanelId?: CinemaInspectorPanelId | null;
  mode: CinemaFocusMode;
  panels: readonly CinemaPanelDefinition[];
  pinnedPanelId?: CinemaInspectorPanelId | null;
}

export interface CinemaLayoutState {
  activePanel: CinemaPanelDefinition | null;
  activePanelId: CinemaInspectorPanelId | null;
  availablePanels: CinemaPanelDefinition[];
  canvasFirst: boolean;
  mode: CinemaFocusMode;
  pinnedPanel: CinemaPanelDefinition | null;
  pinnedPanelId: CinemaInspectorPanelId | null;
  railVisible: boolean;
}

export function normalizeCinemaFocusMode(value: unknown): CinemaFocusMode {
  return CINEMA_FOCUS_MODES.includes(value as CinemaFocusMode)
    ? (value as CinemaFocusMode)
    : "read";
}

export function buildCinemaLayoutState({
  activePanelId,
  mode,
  panels,
  pinnedPanelId,
}: CinemaLayoutInput): CinemaLayoutState {
  const normalizedMode = normalizeCinemaFocusMode(mode);
  const pinnedPanel = findPanel(panels, pinnedPanelId);
  const modePanels = panels.filter((panel) => panelMatchesMode(panel, normalizedMode));
  const availablePanels = includePanel(modePanels, pinnedPanel);

  if (normalizedMode === "read" && !pinnedPanel) {
    return {
      activePanel: null,
      activePanelId: null,
      availablePanels,
      canvasFirst: true,
      mode: normalizedMode,
      pinnedPanel,
      pinnedPanelId: null,
      railVisible: false,
    };
  }

  const requestedActivePanel = findPanel(availablePanels, activePanelId);
  const fallbackPanel = availablePanels.length > 0 ? availablePanels[0] : null;
  const activePanel = pinnedPanel ?? requestedActivePanel ?? fallbackPanel;

  return {
    activePanel,
    activePanelId: activePanel ? activePanel.id : null,
    availablePanels,
    canvasFirst: normalizedMode === "read",
    mode: normalizedMode,
    pinnedPanel,
    pinnedPanelId: pinnedPanel ? pinnedPanel.id : null,
    railVisible: Boolean(activePanel),
  };
}

export function defaultCinemaPanelForMode(
  panels: readonly CinemaPanelDefinition[],
  mode: CinemaFocusMode,
): CinemaInspectorPanelId | null {
  const modePanel = panels.find((panel) => panelMatchesMode(panel, mode));
  if (modePanel) {
    return modePanel.id;
  }
  return panels.length > 0 ? panels[0].id : null;
}

export function cinemaFocusModeLabel(mode: CinemaFocusMode): string {
  if (mode === "inspect") {
    return "Inspect";
  }
  if (mode === "review") {
    return "Review";
  }
  if (mode === "debug") {
    return "Debug";
  }
  return "Read";
}

function findPanel(
  panels: readonly CinemaPanelDefinition[],
  id: CinemaInspectorPanelId | null | undefined,
): CinemaPanelDefinition | null {
  return id ? (panels.find((panel) => panel.id === id) ?? null) : null;
}

function panelMatchesMode(panel: CinemaPanelDefinition, mode: CinemaFocusMode): boolean {
  const affinity = Array.isArray(panel.modeAffinity) ? panel.modeAffinity : [panel.modeAffinity];
  return affinity.includes(mode);
}

function includePanel(
  panels: CinemaPanelDefinition[],
  panel: CinemaPanelDefinition | null,
): CinemaPanelDefinition[] {
  if (!panel || panels.some((item) => item.id === panel.id)) {
    return panels;
  }
  return [panel, ...panels];
}
