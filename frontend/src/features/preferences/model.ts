import {
  WORKSPACE_LAYOUT_MODES,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  defaultWorkspaceLayoutMode,
  normalizeWorkspaceLayoutMode,
  normalizeWorkspaceStage,
  type WorkspaceLayoutMode,
  type WorkspaceStage,
} from "../workspace/model";
import { normalizeReviewPane, type ReviewPane } from "../review/model";
import {
  normalizeCinemaFocusMode,
  normalizeCinemaInspectorPanelId,
  type CinemaFocusMode,
  type CinemaInspectorPanelId,
  type CinemaPanelDefinition,
  type CinemaSurfaceKind,
} from "../cinema/model";

export const UI_MEMORY_STORAGE_KEY = "tts-ui-memory";
export const UI_MEMORY_VERSION = 1;

type TelepromptReturnStage = Extract<WorkspaceStage, "review" | "preview">;
export type UiMemoryPreferenceId =
  | "rememberLastProject"
  | "rememberLayout"
  | "rememberPanelPins"
  | "rememberReaderPreferences"
  | "rememberTelepromptReturnTarget"
  | "rememberTheme";

export const UI_MEMORY_PREFERENCE_IDS: readonly UiMemoryPreferenceId[] = [
  "rememberLayout",
  "rememberTheme",
  "rememberLastProject",
  "rememberReaderPreferences",
  "rememberTelepromptReturnTarget",
  "rememberPanelPins",
];

type UiMemoryPreferenceValues = Pick<UiMemoryState, UiMemoryPreferenceId>;

export interface UiMemoryCinemaState {
  activePanelId: CinemaInspectorPanelId | null;
  mode: CinemaFocusMode;
  pinnedPanelId: CinemaInspectorPanelId | null;
}

export interface UiMemoryState {
  cinema: Record<CinemaSurfaceKind, UiMemoryCinemaState>;
  rememberLastProject: boolean;
  rememberLayout: boolean;
  rememberPanelPins: boolean;
  rememberReaderPreferences: boolean;
  rememberTelepromptReturnTarget: boolean;
  rememberTheme: boolean;
  version: typeof UI_MEMORY_VERSION;
  workspace: {
    layoutMode: WorkspaceLayoutMode | null;
    projectLayoutModes: Record<string, WorkspaceLayoutMode>;
    reviewPanes: Record<string, ReviewPane>;
    telepromptReturnStages: Record<string, TelepromptReturnStage>;
  };
}

const CINEMA_SURFACES: readonly CinemaSurfaceKind[] = ["book", "document", "website"];

export const DEFAULT_UI_MEMORY_PREFERENCES: UiMemoryPreferenceValues = {
  rememberLastProject: true,
  rememberLayout: false,
  rememberPanelPins: false,
  rememberReaderPreferences: true,
  rememberTelepromptReturnTarget: true,
  rememberTheme: true,
};

export function defaultUiMemoryState(
  preferences: Partial<UiMemoryPreferenceValues> | boolean = {},
): UiMemoryState {
  const normalizedPreferences =
    typeof preferences === "boolean"
      ? { ...DEFAULT_UI_MEMORY_PREFERENCES, rememberLayout: preferences }
      : normalizeUiMemoryPreferences(preferences);
  return {
    cinema: {
      book: defaultCinemaMemoryState(),
      document: defaultCinemaMemoryState(),
      website: defaultCinemaMemoryState(),
    },
    ...normalizedPreferences,
    version: UI_MEMORY_VERSION,
    workspace: {
      layoutMode: null,
      projectLayoutModes: {},
      reviewPanes: {},
      telepromptReturnStages: {},
    },
  };
}

export function loadUiMemory(): UiMemoryState {
  const stored = safeStorageGet(UI_MEMORY_STORAGE_KEY);
  const legacyLayoutMode = normalizeLegacyWorkspaceLayoutMode(
    safeStorageGet(WORKSPACE_LAYOUT_STORAGE_KEY),
  );
  if (legacyLayoutMode) {
    safeStorageRemove(WORKSPACE_LAYOUT_STORAGE_KEY);
  }
  if (!stored) {
    const blank = defaultUiMemoryState();
    return legacyLayoutMode
      ? {
          ...blank,
          workspace: {
            ...blank.workspace,
            layoutMode: legacyLayoutMode,
          },
        }
      : blank;
  }

  try {
    const normalized = normalizeUiMemoryState(JSON.parse(stored) as unknown);
    if (legacyLayoutMode && !normalized.workspace.layoutMode) {
      return {
        ...normalized,
        workspace: {
          ...normalized.workspace,
          layoutMode: legacyLayoutMode,
        },
      };
    }
    return normalized;
  } catch {
    return defaultUiMemoryState();
  }
}

export function saveUiMemory(memory: UiMemoryState): void {
  safeStorageSet(UI_MEMORY_STORAGE_KEY, JSON.stringify(persistableUiMemoryState(memory)));
}

export function resetUiMemory(
  memory: UiMemoryState = loadUiMemory(),
  options: { preservePreferences?: boolean } = {},
): UiMemoryState {
  if (options.preservePreferences === false) {
    return defaultUiMemoryState();
  }
  return defaultUiMemoryState(uiMemoryPreferenceValues(memory));
}

export function resetWorkspaceUiMemory(memory: UiMemoryState): UiMemoryState {
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      layoutMode: null,
      projectLayoutModes: {},
      reviewPanes: {},
    },
  };
}

export function updateUiMemoryPreference(
  memory: UiMemoryState,
  preferenceId: UiMemoryPreferenceId,
  enabled: boolean,
): UiMemoryState {
  return clearDisabledUiMemory({
    ...memory,
    [preferenceId]: enabled,
  });
}

export function resolveWorkspaceLayoutMode(
  memory: UiMemoryState,
  projectId: string,
): WorkspaceLayoutMode {
  if (!memory.rememberLayout) {
    return defaultWorkspaceLayoutMode();
  }
  const cleanId = cleanProjectId(projectId);
  if (Object.hasOwn(memory.workspace.projectLayoutModes, cleanId)) {
    return normalizeWorkspaceLayoutMode(memory.workspace.projectLayoutModes[cleanId]);
  }
  return normalizeWorkspaceLayoutMode(memory.workspace.layoutMode);
}

export function rememberWorkspaceLayoutMode(
  memory: UiMemoryState,
  projectId: string,
  layoutMode: WorkspaceLayoutMode,
): UiMemoryState {
  if (!memory.rememberLayout) {
    return memory;
  }
  const normalizedLayoutMode = normalizeWorkspaceLayoutMode(layoutMode);
  if (
    memory.workspace.layoutMode === normalizedLayoutMode &&
    memory.workspace.projectLayoutModes[cleanProjectId(projectId)] === normalizedLayoutMode
  ) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      layoutMode: normalizedLayoutMode,
      projectLayoutModes: {
        ...memory.workspace.projectLayoutModes,
        [cleanProjectId(projectId)]: normalizedLayoutMode,
      },
    },
  };
}

export function resolveReviewPane(memory: UiMemoryState, projectId: string): ReviewPane {
  if (!memory.rememberLayout) {
    return "blocks";
  }
  return normalizeReviewPane(memory.workspace.reviewPanes[cleanProjectId(projectId)]);
}

export function rememberReviewPane(
  memory: UiMemoryState,
  projectId: string,
  pane: ReviewPane,
): UiMemoryState {
  if (!memory.rememberLayout) {
    return memory;
  }
  const normalizedPane = normalizeReviewPane(pane);
  if (memory.workspace.reviewPanes[cleanProjectId(projectId)] === normalizedPane) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      reviewPanes: {
        ...memory.workspace.reviewPanes,
        [cleanProjectId(projectId)]: normalizedPane,
      },
    },
  };
}

export function resolveTelepromptReturnStage(
  memory: UiMemoryState,
  projectId: string,
): TelepromptReturnStage {
  if (!memory.rememberTelepromptReturnTarget) {
    return "review";
  }
  return normalizeTelepromptReturnStage(
    memory.workspace.telepromptReturnStages[cleanProjectId(projectId)],
  );
}

export function rememberTelepromptReturnStage(
  memory: UiMemoryState,
  projectId: string,
  stage: WorkspaceStage,
): UiMemoryState {
  if (!memory.rememberTelepromptReturnTarget) {
    return memory;
  }
  const normalizedStage = normalizeTelepromptReturnStage(stage);
  if (memory.workspace.telepromptReturnStages[cleanProjectId(projectId)] === normalizedStage) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      telepromptReturnStages: {
        ...memory.workspace.telepromptReturnStages,
        [cleanProjectId(projectId)]: normalizedStage,
      },
    },
  };
}

export function resolveCinemaFocusState(
  memory: UiMemoryState,
  surfaceKind: CinemaSurfaceKind,
  panels: readonly CinemaPanelDefinition[] = [],
): UiMemoryCinemaState {
  if (!memory.rememberPanelPins) {
    return defaultCinemaMemoryState();
  }
  return normalizeCinemaMemoryState(memory.cinema[surfaceKind], panels);
}

export function rememberCinemaFocusState(
  memory: UiMemoryState,
  surfaceKind: CinemaSurfaceKind,
  state: UiMemoryCinemaState,
): UiMemoryState {
  if (!memory.rememberPanelPins) {
    return memory;
  }
  const normalizedState = normalizeCinemaMemoryState(state);
  const currentState = memory.cinema[surfaceKind];
  if (
    currentState.activePanelId === normalizedState.activePanelId &&
    currentState.mode === normalizedState.mode &&
    currentState.pinnedPanelId === normalizedState.pinnedPanelId
  ) {
    return memory;
  }
  return {
    ...memory,
    cinema: {
      ...memory.cinema,
      [surfaceKind]: normalizedState,
    },
  };
}

export function normalizeUiMemoryState(value: unknown): UiMemoryState {
  if (!value || typeof value !== "object") {
    return defaultUiMemoryState();
  }
  const candidate = value as Partial<UiMemoryState>;
  const blank = defaultUiMemoryState(normalizeUiMemoryPreferences(candidate));
  return clearDisabledUiMemory({
    ...blank,
    cinema: normalizeCinemaMemoryMap(candidate.cinema),
    version: UI_MEMORY_VERSION,
    workspace: normalizeWorkspaceMemory(candidate.workspace),
  });
}

export function persistableUiMemoryState(memory: UiMemoryState): UiMemoryState {
  return clearDisabledUiMemory(normalizeUiMemoryState(memory));
}

function normalizeUiMemoryPreferences(value: unknown): UiMemoryPreferenceValues {
  const candidate = value && typeof value === "object" ? (value as Partial<UiMemoryState>) : {};
  return {
    rememberLastProject: normalizeBooleanPreference(
      candidate.rememberLastProject,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberLastProject,
    ),
    rememberLayout: normalizeBooleanPreference(
      candidate.rememberLayout,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberLayout,
    ),
    rememberPanelPins: normalizeBooleanPreference(
      candidate.rememberPanelPins,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberPanelPins,
    ),
    rememberReaderPreferences: normalizeBooleanPreference(
      candidate.rememberReaderPreferences,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberReaderPreferences,
    ),
    rememberTelepromptReturnTarget: normalizeBooleanPreference(
      candidate.rememberTelepromptReturnTarget,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberTelepromptReturnTarget,
    ),
    rememberTheme: normalizeBooleanPreference(
      candidate.rememberTheme,
      DEFAULT_UI_MEMORY_PREFERENCES.rememberTheme,
    ),
  };
}

function normalizeBooleanPreference(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function uiMemoryPreferenceValues(memory: UiMemoryState): UiMemoryPreferenceValues {
  return {
    rememberLastProject: memory.rememberLastProject,
    rememberLayout: memory.rememberLayout,
    rememberPanelPins: memory.rememberPanelPins,
    rememberReaderPreferences: memory.rememberReaderPreferences,
    rememberTelepromptReturnTarget: memory.rememberTelepromptReturnTarget,
    rememberTheme: memory.rememberTheme,
  };
}

function clearDisabledUiMemory(memory: UiMemoryState): UiMemoryState {
  const workspace = {
    ...memory.workspace,
    layoutMode: memory.rememberLayout ? memory.workspace.layoutMode : null,
    projectLayoutModes: memory.rememberLayout ? memory.workspace.projectLayoutModes : {},
    reviewPanes: memory.rememberLayout ? memory.workspace.reviewPanes : {},
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

function normalizeWorkspaceMemory(value: unknown): UiMemoryState["workspace"] {
  if (!value || typeof value !== "object") {
    return defaultUiMemoryState().workspace;
  }
  const candidate = value as Partial<UiMemoryState["workspace"]>;
  return {
    layoutMode:
      candidate.layoutMode === null || candidate.layoutMode === undefined
        ? null
        : normalizeWorkspaceLayoutMode(candidate.layoutMode),
    projectLayoutModes: normalizeWorkspaceLayoutMap(candidate.projectLayoutModes),
    reviewPanes: normalizeReviewPaneMap(candidate.reviewPanes),
    telepromptReturnStages: normalizeTelepromptReturnStageMap(candidate.telepromptReturnStages),
  };
}

function normalizeCinemaMemoryMap(value: unknown): Record<CinemaSurfaceKind, UiMemoryCinemaState> {
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

function normalizeWorkspaceLayoutMap(value: unknown): Record<string, WorkspaceLayoutMode> {
  return normalizeRecord(value, (item) => normalizeWorkspaceLayoutMode(item));
}

function normalizeReviewPaneMap(value: unknown): Record<string, ReviewPane> {
  return normalizeRecord(value, (item) => normalizeReviewPane(item));
}

function normalizeTelepromptReturnStageMap(value: unknown): Record<string, TelepromptReturnStage> {
  return normalizeRecord(value, (item) => normalizeTelepromptReturnStage(item));
}

function normalizeRecord<T>(
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

function defaultCinemaMemoryState(): UiMemoryCinemaState {
  return {
    activePanelId: null,
    mode: "read",
    pinnedPanelId: null,
  };
}

function normalizeCinemaMemoryState(
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

function normalizeTelepromptReturnStage(value: unknown): TelepromptReturnStage {
  const stage = normalizeWorkspaceStage(value);
  return stage === "preview" ? "preview" : "review";
}

function normalizeLegacyWorkspaceLayoutMode(value: unknown): WorkspaceLayoutMode | null {
  return WORKSPACE_LAYOUT_MODES.includes(value as WorkspaceLayoutMode)
    ? (value as WorkspaceLayoutMode)
    : null;
}

function cleanProjectId(projectId: string): string {
  const clean = projectId.trim();
  return clean.length > 0 ? clean : "default";
}

function safeStorageGet(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
    }
  } catch {
    // UI memory is best-effort local presentation state.
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(key);
    }
  } catch {
    // UI memory is best-effort local presentation state.
  }
}
