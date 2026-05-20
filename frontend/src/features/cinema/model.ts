import type { ReactNode } from "react";
export {
  NARROW_VIEWPORT_QUERY as CINEMA_NARROW_VIEWPORT_QUERY,
  RESPONSIVE_QA_VIEWPORTS as CINEMA_RESPONSIVE_QA_VIEWPORTS,
  TOUCH_TARGET_MIN_PX as CINEMA_TOUCH_TARGET_MIN_PX,
} from "../layout/responsive";

export const CINEMA_FOCUS_MODES = ["read", "inspect", "review", "debug"] as const;
export const CINEMA_PRIMARY_FOCUS_MODES = ["read", "inspect", "review"] as const;
export const CINEMA_ADVANCED_FOCUS_MODES = ["debug"] as const;
export const CINEMA_INSPECTOR_PANEL_IDS = [
  "current",
  "wayfinding",
  "provenance",
  "policy",
  "policy-notes",
  "health",
  "notes",
  "queue",
  "debug",
] as const;
export const CINEMA_PLAYBACK_STATES = [
  "preAudio",
  "generating",
  "playable",
  "playing",
  "paused",
  "completed",
  "degraded",
] as const;

export type CinemaFocusMode = (typeof CINEMA_FOCUS_MODES)[number];
export type CinemaSurfaceKind = "book" | "document" | "website";
export type CinemaInspectorPanelId = (typeof CINEMA_INSPECTOR_PANEL_IDS)[number];
export type CinemaPlaybackState = (typeof CINEMA_PLAYBACK_STATES)[number];

export interface CinemaPlaybackStateInput {
  degraded?: boolean;
  hasAudio?: boolean;
  isGenerating?: boolean;
  isPlayable?: boolean;
  isPlaying?: boolean;
  progressRatio?: number | null;
  status?: string | null;
}

export interface CinemaPanelDefinition {
  children: ReactNode;
  detail: string;
  id: CinemaInspectorPanelId;
  modeAffinity: CinemaFocusMode | readonly CinemaFocusMode[];
  title: string;
}

export interface CinemaFocusModeMeta {
  description: string;
  id: CinemaFocusMode;
  keywords: string[];
  label: string;
}

export const CINEMA_FOCUS_MODE_META: Record<CinemaFocusMode, CinemaFocusModeMeta> = {
  debug: {
    description: "Show generated-audio, skipped-content, and timing diagnostics.",
    id: "debug",
    keywords: ["diagnostics", "timing", "debug"],
    label: "Debug",
  },
  inspect: {
    description: "Inspect source, structure, policy scope, and current passage.",
    id: "inspect",
    keywords: ["source", "structure", "policy", "passage"],
    label: "Inspect",
  },
  read: {
    description: "Keep the reading canvas dominant and hide inspector panels unless pinned.",
    id: "read",
    keywords: ["reader", "canvas", "clean"],
    label: "Read",
  },
  review: {
    description: "Expose wayfinding, notes, queue, and review-focused panels.",
    id: "review",
    keywords: ["wayfinding", "bookmarks", "recent", "review"],
    label: "Review",
  },
};

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

export function normalizeCinemaInspectorPanelId(value: unknown): CinemaInspectorPanelId | null {
  return CINEMA_INSPECTOR_PANEL_IDS.includes(value as CinemaInspectorPanelId)
    ? (value as CinemaInspectorPanelId)
    : null;
}

export function deriveCinemaPlaybackState(input: CinemaPlaybackStateInput): CinemaPlaybackState {
  const status = input.status?.toLowerCase() ?? null;
  if (input.degraded || status === "failed" || status === "cancelled") {
    return "degraded";
  }
  if (
    input.isGenerating ||
    status === "queued" ||
    status === "optimizing" ||
    status === "synthesizing" ||
    status === "checking" ||
    status === "retrying"
  ) {
    return "generating";
  }
  if (!input.hasAudio && !input.isPlayable) {
    return "preAudio";
  }
  if (!input.isPlayable) {
    return "degraded";
  }
  if (input.isPlaying) {
    return "playing";
  }
  const progressRatio = normalizePlaybackProgressRatio(input.progressRatio);
  if (progressRatio >= 0.995) {
    return "completed";
  }
  if (progressRatio > 0) {
    return "paused";
  }
  return "playable";
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
  return CINEMA_FOCUS_MODE_META[mode].label;
}

export function cinemaFocusModeMeta(mode: CinemaFocusMode): CinemaFocusModeMeta {
  return CINEMA_FOCUS_MODE_META[mode];
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

function normalizePlaybackProgressRatio(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}
