import type {
  CinemaFocusMode,
  CinemaInspectorPanelId,
  CinemaPanelDefinition,
  CinemaSurfaceKind,
} from "../cinema/model";
import { normalizeReviewPane, type ReviewPane } from "../review/model";
import {
  DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
  normalizeTelepromptTheatreSettings,
  type TelepromptTheatreSettings,
} from "../teleprompt/telepromptTheatreSettings";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  defaultWorkspaceLayoutMode,
  normalizeWorkspaceCustomLayout,
  normalizeWorkspaceLayoutMode,
  WORKSPACE_LAYOUT_STORAGE_KEY,
  workspaceCustomLayoutEqual,
  type WorkspaceCustomLayout,
  type WorkspaceLayoutMode,
  type WorkspaceStage,
} from "../workspace/model";
import {
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
  normalizeWorkspaceDisclosurePins,
  workspaceDisclosurePinsEqual,
  type WorkspaceDisclosurePanelId,
  type WorkspaceDisclosurePins,
} from "../workspace/disclosure";
import {
  cleanProjectId,
  clearDisabledUiMemory,
  defaultCinemaMemoryState,
  normalizeCinemaMemoryMap,
  normalizeCinemaMemoryState,
  normalizeLegacyWorkspaceLayoutMode,
  normalizeTelepromptReturnStage,
  normalizeUiMemoryPreferences,
  normalizeWorkspaceMemory,
  safeStorageGet,
  safeStorageRemove,
  safeStorageSet,
  uiMemoryPreferenceValues,
} from "./modelHelpers";

export const UI_MEMORY_STORAGE_KEY = "tts-ui-memory";
export const UI_MEMORY_VERSION = 1;

type TelepromptReturnStage = Extract<WorkspaceStage, "review" | "preview">;
export type UiMemoryPreferenceId =
  | "rememberLastProject"
  | "rememberLayout"
  | "rememberPanelPins"
  | "rememberReaderPreferences"
  | "rememberTelepromptTheatreSettings"
  | "rememberTelepromptReturnTarget"
  | "rememberTheme"
  | "showTutorialLauncher";

export const UI_MEMORY_PREFERENCE_IDS: readonly UiMemoryPreferenceId[] = [
  "rememberLayout",
  "rememberTheme",
  "rememberLastProject",
  "rememberReaderPreferences",
  "rememberTelepromptReturnTarget",
  "rememberTelepromptTheatreSettings",
  "rememberPanelPins",
  "showTutorialLauncher",
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
  rememberTelepromptTheatreSettings: boolean;
  rememberTelepromptReturnTarget: boolean;
  rememberTheme: boolean;
  showTutorialLauncher: boolean;
  version: typeof UI_MEMORY_VERSION;
  workspace: {
    customLayout: WorkspaceCustomLayout;
    disclosurePins: WorkspaceDisclosurePins;
    layoutMode: WorkspaceLayoutMode | null;
    projectCustomLayouts: Record<string, WorkspaceCustomLayout>;
    projectDisclosurePins: Record<string, WorkspaceDisclosurePins>;
    projectLayoutModes: Record<string, WorkspaceLayoutMode>;
    reviewPanes: Record<string, ReviewPane>;
    telepromptTheatreSettings: TelepromptTheatreSettings | null;
    telepromptReturnStages: Record<string, TelepromptReturnStage>;
  };
}

export const DEFAULT_UI_MEMORY_PREFERENCES: UiMemoryPreferenceValues = {
  rememberLastProject: true,
  rememberLayout: false,
  rememberPanelPins: false,
  rememberReaderPreferences: true,
  rememberTelepromptTheatreSettings: true,
  rememberTelepromptReturnTarget: true,
  rememberTheme: true,
  showTutorialLauncher: true,
};

export function defaultUiMemoryState(
  preferences: Partial<UiMemoryPreferenceValues> | boolean = {},
): UiMemoryState {
  const normalizedPreferences =
    typeof preferences === "boolean"
      ? { ...DEFAULT_UI_MEMORY_PREFERENCES, rememberLayout: preferences }
      : normalizeUiMemoryPreferences(preferences, DEFAULT_UI_MEMORY_PREFERENCES);
  return {
    cinema: {
      book: defaultCinemaMemoryState(),
      document: defaultCinemaMemoryState(),
      website: defaultCinemaMemoryState(),
    },
    ...normalizedPreferences,
    version: UI_MEMORY_VERSION,
    workspace: {
      customLayout: DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
      disclosurePins: DEFAULT_WORKSPACE_DISCLOSURE_PINS,
      layoutMode: null,
      projectCustomLayouts: {},
      projectDisclosurePins: {},
      projectLayoutModes: {},
      reviewPanes: {},
      telepromptTheatreSettings: null,
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
      customLayout: DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
      disclosurePins: DEFAULT_WORKSPACE_DISCLOSURE_PINS,
      layoutMode: null,
      projectCustomLayouts: {},
      projectDisclosurePins: {},
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

export function resolveWorkspaceCustomLayout(
  memory: UiMemoryState,
  projectId: string,
): WorkspaceCustomLayout {
  if (!memory.rememberLayout) {
    return DEFAULT_WORKSPACE_CUSTOM_LAYOUT;
  }
  const cleanId = cleanProjectId(projectId);
  if (Object.hasOwn(memory.workspace.projectCustomLayouts, cleanId)) {
    return normalizeWorkspaceCustomLayout(memory.workspace.projectCustomLayouts[cleanId]);
  }
  return normalizeWorkspaceCustomLayout(memory.workspace.customLayout);
}

export function resolveWorkspaceDisclosurePins(
  memory: UiMemoryState,
  projectId: string,
): WorkspaceDisclosurePins {
  if (!memory.rememberPanelPins) {
    return DEFAULT_WORKSPACE_DISCLOSURE_PINS;
  }
  const cleanId = cleanProjectId(projectId);
  if (Object.hasOwn(memory.workspace.projectDisclosurePins, cleanId)) {
    return normalizeWorkspaceDisclosurePins(memory.workspace.projectDisclosurePins[cleanId]);
  }
  return normalizeWorkspaceDisclosurePins(memory.workspace.disclosurePins);
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

export function rememberWorkspaceCustomLayout(
  memory: UiMemoryState,
  projectId: string,
  customLayout: WorkspaceCustomLayout,
): UiMemoryState {
  if (!memory.rememberLayout) {
    return memory;
  }
  const normalizedLayout = normalizeWorkspaceCustomLayout(customLayout);
  const cleanId = cleanProjectId(projectId);
  const currentProjectLayout = normalizeWorkspaceCustomLayout(
    memory.workspace.projectCustomLayouts[cleanId],
  );
  if (
    workspaceCustomLayoutEqual(memory.workspace.customLayout, normalizedLayout) &&
    workspaceCustomLayoutEqual(currentProjectLayout, normalizedLayout)
  ) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      customLayout: normalizedLayout,
      projectCustomLayouts: {
        ...memory.workspace.projectCustomLayouts,
        [cleanId]: normalizedLayout,
      },
    },
  };
}

export function rememberWorkspaceDisclosurePin(
  memory: UiMemoryState,
  projectId: string,
  panelId: WorkspaceDisclosurePanelId,
  pinned: boolean,
): UiMemoryState {
  if (!memory.rememberPanelPins) {
    return memory;
  }
  const cleanId = cleanProjectId(projectId);
  const currentPins = resolveWorkspaceDisclosurePins(memory, projectId);
  const nextPins = normalizeWorkspaceDisclosurePins({
    ...currentPins,
    [panelId]: pinned,
  });
  if (
    workspaceDisclosurePinsEqual(memory.workspace.disclosurePins, nextPins) &&
    workspaceDisclosurePinsEqual(
      normalizeWorkspaceDisclosurePins(memory.workspace.projectDisclosurePins[cleanId]),
      nextPins,
    )
  ) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      disclosurePins: nextPins,
      projectDisclosurePins: {
        ...memory.workspace.projectDisclosurePins,
        [cleanId]: nextPins,
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

export function resolveTelepromptTheatreSettings(memory: UiMemoryState): TelepromptTheatreSettings {
  if (!memory.rememberTelepromptTheatreSettings) {
    return DEFAULT_TELEPROMPT_THEATRE_SETTINGS;
  }
  return normalizeTelepromptTheatreSettings(memory.workspace.telepromptTheatreSettings);
}

export function rememberTelepromptTheatreSettings(
  memory: UiMemoryState,
  settings: TelepromptTheatreSettings,
): UiMemoryState {
  if (!memory.rememberTelepromptTheatreSettings) {
    return memory;
  }
  const normalizedSettings = normalizeTelepromptTheatreSettings(settings);
  const currentSettings = normalizeTelepromptTheatreSettings(
    memory.workspace.telepromptTheatreSettings,
  );
  if (telepromptTheatreSettingsEqual(currentSettings, normalizedSettings)) {
    return memory;
  }
  return {
    ...memory,
    workspace: {
      ...memory.workspace,
      telepromptTheatreSettings: normalizedSettings,
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
  const blank = defaultUiMemoryState(
    normalizeUiMemoryPreferences(candidate, DEFAULT_UI_MEMORY_PREFERENCES),
  );
  return clearDisabledUiMemory({
    ...blank,
    cinema: normalizeCinemaMemoryMap(candidate.cinema),
    version: UI_MEMORY_VERSION,
    workspace: normalizeWorkspaceMemory(candidate.workspace, defaultUiMemoryState().workspace),
  });
}

export function persistableUiMemoryState(memory: UiMemoryState): UiMemoryState {
  return clearDisabledUiMemory(normalizeUiMemoryState(memory));
}

function telepromptTheatreSettingsEqual(
  left: TelepromptTheatreSettings,
  right: TelepromptTheatreSettings,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
