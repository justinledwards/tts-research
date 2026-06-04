import { HELP_ANCHORS, type HelpAnchorId } from "../help/model";
import {
  CINEMA_ADVANCED_MODE_ACTIONS,
  type CinemaAdvancedModeId,
} from "../cinema/cinemaAdvancedMode";
import { CINEMA_FOCUS_MODES, cinemaFocusModeMeta, type CinemaFocusMode } from "../cinema/model";
import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";
import {
  SETTINGS_FIELD_META,
  SETTINGS_GROUPS,
  SETTINGS_LAYERS,
  SETTINGS_SCOPE_META,
  scopedSettingDefinition,
  settingsLayerForGroup,
  type SettingsGroupId,
  type SettingsCommandTarget,
  type SettingsScope,
} from "../settings/model";
import {
  WORKSPACE_LAYOUT_MODES,
  WORKSPACE_STAGES,
  workspaceLayoutModeMeta,
  workspaceStageMeta,
  type WorkspaceLayoutMode,
  type WorkspaceStage,
} from "../workspace/model";
import type { CommandCategory, CommandMetadata } from "./model";

export type { SettingsCommandTarget } from "../settings/model";

export type WorkspaceCommandTarget =
  | { kind: "stage"; stage: WorkspaceStage }
  | { kind: "layout"; layoutMode: WorkspaceLayoutMode };

export interface CinemaFocusCommandTarget {
  mode: CinemaFocusMode;
}

export interface CinemaAdvancedCommandTarget {
  actionId: CinemaAdvancedModeId;
  mode: CinemaFocusMode;
  panelId: ContextPanelTabId;
}

export interface HelpCommandTarget {
  anchorId: HelpAnchorId;
}

export function buildSettingsCommandMetadata(): CommandMetadata<SettingsCommandTarget>[] {
  const layerCommands = SETTINGS_LAYERS.map((layer) => ({
    category: "Settings" as const,
    detail: layer.summary,
    id: `settings:layer:${layer.id}`,
    keywords: ["settings", "configuration", layer.detail],
    owner: "settings",
    section: "Settings" as const,
    target: { groupId: defaultSettingsGroupForLayer(layer.id), layerId: layer.id },
    title: `Open ${layer.label} settings`,
  }));
  const groupCommands = SETTINGS_GROUPS.map((group) => ({
    category: "Settings" as const,
    detail: group.summary,
    id: `settings:group:${group.id}`,
    keywords: ["settings", group.layer, group.detail],
    owner: "settings",
    section: "Settings" as const,
    target: { groupId: group.id, layerId: group.layer },
    title: `Open ${group.label} settings`,
  }));
  const fieldCommands = SETTINGS_FIELD_META.map((field) => ({
    category: "Settings" as const,
    detail: fieldCommandDetail(field.id, field.scope, field.description),
    id: `settings:field:${field.id}`,
    keywords: [
      "settings",
      "configuration",
      field.layer,
      field.scope,
      SETTINGS_SCOPE_META[field.scope].description,
      scopedSettingDefinition(field.id)?.resetTarget ?? "",
      scopedSettingDefinition(field.id)?.sourceOfTruth ?? "",
    ],
    owner: "settings",
    section: "Settings" as const,
    target: { fieldId: field.id, groupId: field.group, layerId: field.layer, scope: field.scope },
    title: field.label,
  }));
  const scopeCommands = (Object.keys(SETTINGS_SCOPE_META) as SettingsScope[]).map((scope) => ({
    category: "Settings" as const,
    detail: SETTINGS_SCOPE_META[scope].appliesTo,
    id: `settings:scope:${scope}`,
    keywords: ["scope", "settings", SETTINGS_SCOPE_META[scope].description],
    owner: "settings",
    section: "Settings" as const,
    target: {
      groupId: defaultSettingsGroupForScope(scope),
      layerId: settingsLayerForGroup(defaultSettingsGroupForScope(scope)),
      scope,
    },
    title: `${SETTINGS_SCOPE_META[scope].label} scope`,
  }));
  return [...layerCommands, ...groupCommands, ...fieldCommands, ...scopeCommands];
}

function fieldCommandDetail(fieldId: string, scope: SettingsScope, description: string): string {
  const definition = scopedSettingDefinition(fieldId);
  const source = definition ? ` · ${definition.sourceOfTruth}` : "";
  return `${SETTINGS_SCOPE_META[scope].label} scope${source} · ${description}`;
}

export function buildWorkspaceCommandMetadata(): CommandMetadata<WorkspaceCommandTarget>[] {
  const stageCommands = WORKSPACE_STAGES.map((stage) => {
    const meta = workspaceStageMeta(stage);
    return {
      category: workspaceStageCommandCategory(stage),
      detail: meta.description,
      id: `workspace:stage:${stage}`,
      keywords: ["stage", "workspace", ...meta.keywords],
      owner: "workspace",
      section: "Workspace" as const,
      target: { kind: "stage" as const, stage },
      title: `Go to ${meta.label}`,
    };
  });
  const layoutCommands = WORKSPACE_LAYOUT_MODES.map((layoutMode) => {
    const meta = workspaceLayoutModeMeta(layoutMode);
    return {
      category: "Navigation" as const,
      detail: meta.description,
      id: `workspace:layout:${layoutMode}`,
      keywords: ["layout", "workspace", ...meta.keywords],
      owner: "workspace",
      section: "Workspace" as const,
      target: { kind: "layout" as const, layoutMode },
      title: `${meta.label} workspace layout`,
    };
  });
  return [...stageCommands, ...layoutCommands];
}

export function buildCinemaFocusCommandMetadata(): CommandMetadata<CinemaFocusCommandTarget>[] {
  return CINEMA_FOCUS_MODES.map((mode) => {
    const meta = cinemaFocusModeMeta(mode);
    const advanced = mode === "debug";
    return {
      category: cinemaFocusCommandCategory(mode),
      detail: advanced ? `Advanced diagnostics. ${meta.description}` : meta.description,
      id: `cinema:focus:${mode}`,
      keywords: [
        "cinema",
        "focus",
        ...(advanced ? ["advanced", "operator"] : []),
        ...meta.keywords,
      ],
      owner: "cinema",
      section: "Cinema" as const,
      target: { mode },
      title: advanced ? "Advanced: Debug cinema focus" : `${meta.label} cinema focus`,
    };
  });
}

export function buildCinemaAdvancedCommandMetadata(): CommandMetadata<CinemaAdvancedCommandTarget>[] {
  return CINEMA_ADVANCED_MODE_ACTIONS.map((action) => ({
    category: "Diagnostics" as const,
    detail: `${action.detail} ${action.reason}`,
    id: action.commandId,
    keywords: ["cinema", "more", ...action.keywords],
    owner: cinemaAdvancedCommandOwner(action.id),
    section: "Cinema" as const,
    target: {
      actionId: action.id,
      mode: action.mode,
      panelId: action.panelId,
    },
    title: `Advanced: ${action.label}`,
  }));
}

export function buildHelpCommandMetadata(): CommandMetadata<HelpCommandTarget>[] {
  return HELP_ANCHORS.map((anchor) => ({
    category: "Diagnostics" as const,
    detail: anchor.detail,
    id: `help:${anchor.id}`,
    keywords: ["help", "guide", "workflow"],
    owner: "help",
    section: "Help" as const,
    target: { anchorId: anchor.id },
    title: `Help: ${anchor.label}`,
  }));
}

function cinemaAdvancedCommandOwner(actionId: CinemaAdvancedModeId): string {
  if (actionId === "diagnostics" || actionId === "timing-map" || actionId === "alignment-repair") {
    return "cinema-diagnostics";
  }
  return "cinema-advanced";
}

function workspaceStageCommandCategory(stage: WorkspaceStage): CommandCategory {
  if (stage === "intake") {
    return "Source";
  }
  if (stage === "review") {
    return "Review";
  }
  if (stage === "teleprompt") {
    return "Teleprompt";
  }
  return "Playback";
}

function cinemaFocusCommandCategory(mode: CinemaFocusMode): CommandCategory {
  if (mode === "review") {
    return "Review";
  }
  if (mode === "debug" || mode === "inspect") {
    return "Diagnostics";
  }
  return "Navigation";
}

function defaultSettingsGroupForScope(scope: SettingsScope): SettingsGroupId {
  if (scope === "machine") {
    return "reader";
  }
  if (scope === "project" || scope === "source") {
    return "sources";
  }
  return "run";
}

function defaultSettingsGroupForLayer(layer: "quick" | "advanced" | "expert"): SettingsGroupId {
  if (layer === "expert") {
    return "runtime";
  }
  return "run";
}
