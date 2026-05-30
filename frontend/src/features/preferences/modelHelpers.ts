import {
  type CinemaPanelDefinition,
  type CinemaSurfaceKind,
  normalizeCinemaFocusMode,
  normalizeCinemaInspectorPanelId,
} from "../cinema/model";
import type { ReviewPane } from "../review/model";
import { normalizeTelepromptTheatreSettings } from "../teleprompt/telepromptTheatreSettings";
import { normalizeReviewPane } from "../review/model";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  normalizeWorkspaceCustomLayout,
  normalizeWorkspaceLayoutMode,
  normalizeWorkspaceStage,
  WORKSPACE_LAYOUT_MODES,
  type WorkspaceCustomLayout,
  type WorkspaceLayoutMode,
} from "../workspace/model";
import type { UiMemoryCinemaState, UiMemoryState } from "./model";

export const CINEMA_SURFACES: readonly CinemaSurfaceKind[] = ["book", "document", "website"];

export interface UiMemoryPreferenceValues {
  rememberLastProject: boolean;
  rememberLayout: boolean;
  rememberPanelPins: boolean;
  rememberReaderPreferences: boolean;
  rememberTelepromptTheatreSettings: boolean;
  rememberTelepromptReturnTarget: boolean;
  rememberTheme: boolean;
}

export function cleanProjectId(projectId: string): string {
  const clean = projectId.trim();
  return clean.length > 0 ? clean : "default";
}

export function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeUiMemoryPreferences(
  value: unknown,
  fallback: UiMemoryPreferenceValues,
): UiMemoryPreferenceValues {
  const candidate = value && typeof value === "object" ? (value as Partial<UiMemoryState>) : {};
  return {
    rememberLastProject: normalizeBooleanPreference(
      candidate.rememberLastProject,
      fallback.rememberLastProject,
    ),
    rememberLayout: normalizeBooleanPreference(candidate.rememberLayout, fallback.rememberLayout),
    rememberPanelPins: normalizeBooleanPreference(
      candidate.rememberPanelPins,
      fallback.rememberPanelPins,
    ),
    rememberReaderPreferences: normalizeBooleanPreference(
      candidate.rememberReaderPreferences,
      fallback.rememberReaderPreferences,
    ),
    rememberTelepromptTheatreSettings: normalizeBooleanPreference(
      candidate.rememberTelepromptTheatreSettings,
      fallback.rememberTelepromptTheatreSettings,
    ),
    rememberTelepromptReturnTarget: normalizeBooleanPreference(
      candidate.rememberTelepromptReturnTarget,
      fallback.rememberTelepromptReturnTarget,
    ),
    rememberTheme: normalizeBooleanPreference(candidate.rememberTheme, fallback.rememberTheme),
  };
}

export function uiMemoryPreferenceValues(memory: UiMemoryState): UiMemoryPreferenceValues {
  return {
    rememberLastProject: memory.rememberLastProject,
    rememberLayout: memory.rememberLayout,
    rememberPanelPins: memory.rememberPanelPins,
    rememberReaderPreferences: memory.rememberReaderPreferences,
    rememberTelepromptTheatreSettings: memory.rememberTelepromptTheatreSettings,
    rememberTelepromptReturnTarget: memory.rememberTelepromptReturnTarget,
    rememberTheme: memory.rememberTheme,
  };
}

export function normalizeWorkspaceLayoutMap(value: unknown): Record<string, WorkspaceLayoutMode> {
  return normalizeRecord(value, (item) => normalizeWorkspaceLayoutMode(item));
}

export function normalizeWorkspaceCustomLayoutMap(
  value: unknown,
): Record<string, WorkspaceCustomLayout> {
  return normalizeRecord(value, (item) => normalizeWorkspaceCustomLayout(item));
}

export function normalizeReviewPaneMap(value: unknown): Record<string, ReviewPane> {
  return normalizeRecord(value, (item) => normalizeReviewPane(item));
}

export function normalizeTelepromptReturnStageMap(
  value: unknown,
): Record<string, "review" | "preview"> {
  return normalizeRecord(value, (item) => normalizeTelepromptReturnStage(item));
}

export function normalizeWorkspaceMemory(
  value: unknown,
  fallbackWorkspace: UiMemoryState["workspace"],
): UiMemoryState["workspace"] {
  if (!value || typeof value !== "object") {
    return fallbackWorkspace;
  }
  const candidate = value as Partial<UiMemoryState["workspace"]>;
  return {
    customLayout: normalizeWorkspaceCustomLayout(candidate.customLayout),
    layoutMode:
      candidate.layoutMode === null || candidate.layoutMode === undefined
        ? null
        : normalizeWorkspaceLayoutMode(candidate.layoutMode),
    projectCustomLayouts: normalizeWorkspaceCustomLayoutMap(candidate.projectCustomLayouts),
    projectLayoutModes: normalizeWorkspaceLayoutMap(candidate.projectLayoutModes),
    reviewPanes: normalizeReviewPaneMap(candidate.reviewPanes),
    telepromptTheatreSettings:
      candidate.telepromptTheatreSettings === null ||
      candidate.telepromptTheatreSettings === undefined
        ? null
        : normalizeTelepromptTheatreSettings(candidate.telepromptTheatreSettings),
    telepromptReturnStages: normalizeTelepromptReturnStageMap(candidate.telepromptReturnStages),
  };
}

export function clearDisabledUiMemory(memory: UiMemoryState): UiMemoryState {
  const workspace = {
    ...memory.workspace,
    customLayout: memory.rememberLayout
      ? normalizeWorkspaceCustomLayout(memory.workspace.customLayout)
      : DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
    layoutMode: memory.rememberLayout ? memory.workspace.layoutMode : null,
    projectCustomLayouts: memory.rememberLayout ? memory.workspace.projectCustomLayouts : {},
    projectLayoutModes: memory.rememberLayout ? memory.workspace.projectLayoutModes : {},
    reviewPanes: memory.rememberLayout ? memory.workspace.reviewPanes : {},
    telepromptTheatreSettings: memory.rememberTelepromptTheatreSettings
      ? memory.workspace.telepromptTheatreSettings
      : null,
    telepromptReturnStages: memory.rememberTelepromptReturnTarget
      ? memory.workspace.telepromptReturnStages
      : {},
  };
  return {
    ...memory,
    cinema: memory.rememberPanelPins ? memory.cinema : normalizeCinemaMemoryMap(null),
    workspace,
  };
}

export function defaultCinemaMemoryState(): UiMemoryCinemaState {
  return {
    activePanelId: null,
    mode: "read",
    pinnedPanelId: null,
  };
}

export function normalizeCinemaMemoryMap(
  value: unknown,
): Record<CinemaSurfaceKind, UiMemoryCinemaState> {
  const candidate =
    value && typeof value === "object" ? (value as Partial<UiMemoryState["cinema"]>) : {};
  const memory: Record<CinemaSurfaceKind, UiMemoryCinemaState> = {
    book: defaultCinemaMemoryState(),
    document: defaultCinemaMemoryState(),
    website: defaultCinemaMemoryState(),
  };
  for (const surfaceKind of CINEMA_SURFACES) {
    memory[surfaceKind] = normalizeCinemaMemoryState(candidate[surfaceKind]);
  }
  return memory;
}

export function normalizeRecord<T>(
  value: unknown,
  normalizeItem: (item: unknown) => T,
): Record<string, T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, T> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    result[cleanProjectId(key)] = normalizeItem(item);
  }
  return result;
}

export function normalizeCinemaMemoryState(
  value: unknown,
  panels: readonly CinemaPanelDefinition[] = [],
): UiMemoryCinemaState {
  if (!value || typeof value !== "object") {
    return defaultCinemaMemoryState();
  }
  const candidate = value as Partial<UiMemoryCinemaState>;
  const availablePanelIds = new Set(panels.map((panel) => panel.id));
  const hasPanelList = panels.length > 0;
  const activePanelId = normalizeCinemaInspectorPanelId(candidate.activePanelId);
  const pinnedPanelId = normalizeCinemaInspectorPanelId(candidate.pinnedPanelId);
  return {
    activePanelId:
      activePanelId && (!hasPanelList || availablePanelIds.has(activePanelId))
        ? activePanelId
        : null,
    mode: normalizeCinemaFocusMode(candidate.mode),
    pinnedPanelId:
      pinnedPanelId && (!hasPanelList || availablePanelIds.has(pinnedPanelId))
        ? pinnedPanelId
        : null,
  };
}

export function normalizeTelepromptReturnStage(value: unknown): "review" | "preview" {
  const stage = normalizeWorkspaceStage(value);
  return stage === "preview" ? "preview" : "review";
}

export function normalizeLegacyWorkspaceLayoutMode(value: unknown): WorkspaceLayoutMode | null {
  return WORKSPACE_LAYOUT_MODES.includes(value as WorkspaceLayoutMode)
    ? (value as WorkspaceLayoutMode)
    : null;
}

export function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // UI memory is best-effort local presentation state.
  }
}

export function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // UI memory is best-effort local presentation state.
  }
}
