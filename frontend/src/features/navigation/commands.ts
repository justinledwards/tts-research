import { HELP_ANCHORS, type HelpAnchorId } from "../help/model";
import { CINEMA_FOCUS_MODES, cinemaFocusModeMeta, type CinemaFocusMode } from "../cinema/model";
import {
  SETTINGS_FIELD_META,
  SETTINGS_GROUPS,
  SETTINGS_SCOPE_META,
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
import type { CommandMetadata } from "./model";

export type { SettingsCommandTarget } from "../settings/model";

export type WorkspaceCommandTarget =
  | { kind: "stage"; stage: WorkspaceStage }
  | { kind: "layout"; layoutMode: WorkspaceLayoutMode };

export interface CinemaFocusCommandTarget {
  mode: CinemaFocusMode;
}

export interface HelpCommandTarget {
  anchorId: HelpAnchorId;
}

export function buildSettingsCommandMetadata(): CommandMetadata<SettingsCommandTarget>[] {
  const groupCommands = SETTINGS_GROUPS.map((group) => ({
    detail: group.summary,
    id: `settings:group:${group.id}`,
    keywords: ["settings", group.detail],
    section: "Settings" as const,
    target: { groupId: group.id },
    title: `Open ${group.label} settings`,
  }));
  const fieldCommands = SETTINGS_FIELD_META.map((field) => ({
    detail: `${SETTINGS_SCOPE_META[field.scope].label} scope · ${field.description}`,
    id: `settings:field:${field.id}`,
    keywords: ["settings", field.scope, SETTINGS_SCOPE_META[field.scope].description],
    section: "Settings" as const,
    target: { fieldId: field.id, groupId: field.group, scope: field.scope },
    title: field.label,
  }));
  const scopeCommands = (Object.keys(SETTINGS_SCOPE_META) as SettingsScope[]).map((scope) => ({
    detail: SETTINGS_SCOPE_META[scope].appliesTo,
    id: `settings:scope:${scope}`,
    keywords: ["scope", "settings", SETTINGS_SCOPE_META[scope].description],
    section: "Settings" as const,
    target: { groupId: defaultSettingsGroupForScope(scope), scope },
    title: `${SETTINGS_SCOPE_META[scope].label} scope`,
  }));
  return [...groupCommands, ...fieldCommands, ...scopeCommands];
}

export function buildWorkspaceCommandMetadata(): CommandMetadata<WorkspaceCommandTarget>[] {
  const stageCommands = WORKSPACE_STAGES.map((stage) => {
    const meta = workspaceStageMeta(stage);
    return {
      detail: meta.description,
      id: `workspace:stage:${stage}`,
      keywords: ["stage", "workspace", ...meta.keywords],
      section: "Workspace" as const,
      target: { kind: "stage" as const, stage },
      title: `Go to ${meta.label}`,
    };
  });
  const layoutCommands = WORKSPACE_LAYOUT_MODES.map((layoutMode) => {
    const meta = workspaceLayoutModeMeta(layoutMode);
    return {
      detail: meta.description,
      id: `workspace:layout:${layoutMode}`,
      keywords: ["layout", "workspace", ...meta.keywords],
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
    return {
      detail: meta.description,
      id: `cinema:focus:${mode}`,
      keywords: ["cinema", "focus", ...meta.keywords],
      section: "Cinema" as const,
      target: { mode },
      title: `${meta.label} cinema focus`,
    };
  });
}

export function buildHelpCommandMetadata(): CommandMetadata<HelpCommandTarget>[] {
  return HELP_ANCHORS.map((anchor) => ({
    detail: anchor.detail,
    id: `help:${anchor.id}`,
    keywords: ["help", "guide", "workflow"],
    section: "Help" as const,
    target: { anchorId: anchor.id },
    title: `Help: ${anchor.label}`,
  }));
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
