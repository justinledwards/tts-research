import {
  type ContextPanelTabDefinition,
  contextPanelDefaultTabForFocusMode,
} from "../context-panel/contextPanelModel";
import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";

export {
  NARROW_VIEWPORT_QUERY as CINEMA_NARROW_VIEWPORT_QUERY,
  RESPONSIVE_QA_VIEWPORTS as CINEMA_RESPONSIVE_QA_VIEWPORTS,
  TOUCH_TARGET_MIN_PX as CINEMA_TOUCH_TARGET_MIN_PX,
} from "../layout/responsive";

export const CINEMA_FOCUS_MODES = ["read", "inspect", "review", "debug"] as const;
export const CINEMA_PRIMARY_FOCUS_MODES = ["read", "inspect", "review"] as const;
export const CINEMA_ADVANCED_FOCUS_MODES = ["debug"] as const;
export const CINEMA_INSPECTOR_PANEL_IDS = [
  "overview",
  "review",
  "diagnostics",
  "policy",
  "history",
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
export const CINEMA_RENDERER_LIFECYCLE_STATES = [
  "notStarted",
  "loading",
  "ready",
  "degraded",
  "failed",
] as const;

export type CinemaFocusMode = (typeof CINEMA_FOCUS_MODES)[number];
export type CinemaSurfaceKind = "book" | "document" | "website";
export type CinemaInspectorPanelId = ContextPanelTabId;
export type CinemaPlaybackState = (typeof CINEMA_PLAYBACK_STATES)[number];
export type CinemaRendererLifecycleState = (typeof CINEMA_RENDERER_LIFECYCLE_STATES)[number];

export interface CinemaReadinessDisplay {
  audioLabel: string;
  detail: string;
  label: string;
  readerLabel: string;
  rendererLifecycle: CinemaRendererLifecycleState;
  tone: "danger" | "info" | "neutral" | "success" | "warning";
}

export interface CinemaPlaybackStateInput {
  degraded?: boolean;
  hasAudio?: boolean;
  isGenerating?: boolean;
  isPlayable?: boolean;
  isPlaying?: boolean;
  progressRatio?: number | null;
  status?: string | null;
}

export interface CinemaPanelDefinition extends ContextPanelTabDefinition {
  modeAffinity: CinemaFocusMode | readonly CinemaFocusMode[];
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

export function normalizeCinemaRendererLifecycleState(
  value: unknown,
): CinemaRendererLifecycleState {
  return CINEMA_RENDERER_LIFECYCLE_STATES.includes(value as CinemaRendererLifecycleState)
    ? (value as CinemaRendererLifecycleState)
    : "notStarted";
}

export function cinemaRendererLifecycleLabel(state: CinemaRendererLifecycleState): string {
  switch (state) {
    case "notStarted": {
      return "Renderer pending";
    }
    case "loading": {
      return "Preparing reader";
    }
    case "ready": {
      return "Reader ready";
    }
    case "degraded": {
      return "Reader delayed";
    }
    case "failed": {
      return "Renderer failed";
    }
  }
}

export function cinemaRendererLifecycleDetail(state: CinemaRendererLifecycleState): string {
  switch (state) {
    case "notStarted": {
      return "The reader canvas has not started rendering this source yet.";
    }
    case "loading": {
      return "Preparing this view locally.";
    }
    case "ready": {
      return "The reader canvas is ready for reading and read-along.";
    }
    case "degraded": {
      return "Taking longer than expected. The reader remains in a bounded loading state.";
    }
    case "failed": {
      return "Renderer failed. Retry the reader view before trusting playback or highlights.";
    }
  }
}

export function isCinemaRendererReady(state: CinemaRendererLifecycleState): boolean {
  return state === "ready";
}

export function deriveCinemaReadinessDisplay({
  isPlaybackActive,
  playbackState,
  rendererLifecycle,
}: Readonly<{
  isPlaybackActive?: boolean;
  playbackState: CinemaPlaybackState;
  rendererLifecycle: CinemaRendererLifecycleState;
}>): CinemaReadinessDisplay {
  if (rendererLifecycle !== "ready") {
    const label = cinemaRendererLifecycleLabel(rendererLifecycle);
    let tone: CinemaReadinessDisplay["tone"] = "info";
    if (rendererLifecycle === "failed") {
      tone = "danger";
    } else if (rendererLifecycle === "degraded") {
      tone = "warning";
    }
    return {
      audioLabel: rendererLifecycle === "failed" ? "Audio held" : "Waiting for reader",
      detail: cinemaRendererLifecycleDetail(rendererLifecycle),
      label,
      readerLabel: label,
      rendererLifecycle,
      tone,
    };
  }

  if (isPlaybackActive || playbackState === "playing") {
    return readinessDisplay(
      "Playing",
      "Audio is playing against the ready reader canvas.",
      "Playing",
    );
  }
  if (playbackState === "generating") {
    return readinessDisplay(
      "Generating",
      "Generated audio is being created while the reader remains available.",
      "Generating audio",
    );
  }
  if (playbackState === "degraded") {
    return {
      audioLabel: "Degraded audio",
      detail: "Generated audio needs attention, but the reader canvas is ready.",
      label: "Degraded",
      readerLabel: "Reader ready",
      rendererLifecycle,
      tone: "warning",
    };
  }
  if (playbackState === "preAudio") {
    return readinessDisplay(
      "Source ready",
      "The source is readable. Create audio when you want synchronized playback.",
      "No generated audio",
    );
  }
  return readinessDisplay(
    "Audio ready",
    "The reader canvas and generated audio are ready.",
    "Audio ready",
  );
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
  const fallbackPanel = selectDefaultPanelForMode(availablePanels, normalizedMode);
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
  return (
    selectDefaultPanelForMode(
      panels.filter((panel) => panelMatchesMode(panel, mode)),
      mode,
    )?.id ?? null
  );
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

function selectDefaultPanelForMode(
  panels: readonly CinemaPanelDefinition[],
  mode: CinemaFocusMode,
): CinemaPanelDefinition | null {
  const preferredTabId = contextPanelDefaultTabForFocusMode(mode);
  if (preferredTabId) {
    const preferred = panels.find((panel) => panel.id === preferredTabId);
    if (preferred) {
      return preferred;
    }
  }
  return panels[0] ?? null;
}

function normalizePlaybackProgressRatio(value: number | null | undefined): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function readinessDisplay(
  label: string,
  detail: string,
  audioLabel: string,
): CinemaReadinessDisplay {
  return {
    audioLabel,
    detail,
    label,
    readerLabel: "Reader ready",
    rendererLifecycle: "ready",
    tone: "success",
  };
}
