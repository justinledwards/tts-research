import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";
import {
  activeCinemaAdvancedModeAction,
  CINEMA_ADVANCED_MODE_ACTIONS,
  type CinemaAdvancedModeAction,
  type CinemaAdvancedModeId,
} from "./cinemaAdvancedMode";
import type { CinemaFocusMode } from "./model";

export const CINEMA_MORE_MENU_ID = "cinema-more-menu";

export const CINEMA_MORE_SECTION_IDS = [
  "source",
  "audio",
  "display",
  "theatre",
  "workflow",
  "temporary",
  "advanced",
  "diagnostics",
  "help-shortcuts",
] as const;

export type CinemaMoreSectionId = (typeof CINEMA_MORE_SECTION_IDS)[number];

export type CinemaMoreDisplayActionId = "reader-settings";
export type CinemaMoreSourceActionId = "open-inspector" | "source-details";
export type CinemaMoreAudioActionId = "create-audio" | "retry-audio";
export type CinemaMoreWorkflowActionId = "return-review" | "return-preview";
export type CinemaMoreTemporaryActionId = "keep-temporary-source" | "discard-temporary-source";

export type CinemaMoreTheatreActionId = "theatre-mode";

export type CinemaMoreNavigationActionId = "command-palette" | "keyboard-shortcuts" | "help-guide";

export type CinemaMoreActionId =
  | CinemaMoreAudioActionId
  | CinemaAdvancedModeId
  | CinemaMoreDisplayActionId
  | CinemaMoreTheatreActionId
  | CinemaMoreNavigationActionId
  | CinemaMoreSourceActionId
  | CinemaMoreTemporaryActionId
  | CinemaMoreWorkflowActionId;

export type CinemaMoreActionKind =
  | "advanced"
  | "audio"
  | "diagnostics"
  | "display"
  | "help-shortcuts"
  | "source"
  | "temporary"
  | "workflow"
  | "theatre";

export type CinemaMoreActionOwner =
  | "cinema-advanced"
  | "cinema-audio"
  | "cinema-diagnostics"
  | "cinema-display"
  | "cinema-help"
  | "cinema-source"
  | "cinema-temporary-source"
  | "cinema-theatre"
  | "cinema-workflow";

interface CinemaMoreActionBase {
  readonly commandId: string;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly id: CinemaMoreActionId;
  readonly keywords: readonly string[];
  readonly kind: CinemaMoreActionKind;
  readonly label: string;
  readonly owner: CinemaMoreActionOwner;
  readonly reason: string;
  readonly sectionId: CinemaMoreSectionId;
  readonly shortcutCommandId?: string;
  readonly shortcutHint?: string;
  readonly testId: `ui-action-cinema-more-${string}` | `ui-action-cinema-advanced-${string}`;
}

export interface CinemaMoreDisplayAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreDisplayActionId;
  readonly kind: "display";
  readonly owner: "cinema-display";
  readonly sectionId: "display";
}

export interface CinemaMoreSourceAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreSourceActionId;
  readonly kind: "source";
  readonly owner: "cinema-source";
  readonly sectionId: "source";
}

export interface CinemaMoreAudioAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreAudioActionId;
  readonly kind: "audio";
  readonly owner: "cinema-audio";
  readonly sectionId: "audio";
}

export interface CinemaMoreWorkflowAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreWorkflowActionId;
  readonly kind: "workflow";
  readonly owner: "cinema-workflow";
  readonly sectionId: "workflow";
}

export interface CinemaMoreTemporaryAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreTemporaryActionId;
  readonly kind: "temporary";
  readonly owner: "cinema-temporary-source";
  readonly sectionId: "temporary";
}

export interface CinemaMoreTheatreAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreTheatreActionId;
  readonly kind: "theatre";
  readonly owner: "cinema-theatre";
  readonly sectionId: "theatre";
}

interface CinemaMoreOperatorActionBase extends CinemaMoreActionBase {
  readonly advancedAction: CinemaAdvancedModeAction;
  readonly commandId: `cinema:advanced:${CinemaAdvancedModeId}`;
  readonly id: CinemaAdvancedModeId;
  readonly mode: CinemaFocusMode;
  readonly panelId: ContextPanelTabId;
  readonly testId: `ui-action-cinema-advanced-${string}`;
}

export interface CinemaMoreAdvancedAction extends CinemaMoreOperatorActionBase {
  readonly kind: "advanced";
  readonly owner: "cinema-advanced";
  readonly sectionId: "advanced";
}

export interface CinemaMoreDiagnosticsAction extends CinemaMoreOperatorActionBase {
  readonly kind: "diagnostics";
  readonly owner: "cinema-diagnostics";
  readonly sectionId: "diagnostics";
}

export interface CinemaMoreNavigationAction extends CinemaMoreActionBase {
  readonly commandId: "command.palette" | "shortcuts:open" | "help:open";
  readonly id: CinemaMoreNavigationActionId;
  readonly kind: "help-shortcuts";
  readonly owner: "cinema-help";
  readonly sectionId: "help-shortcuts";
}

export type CinemaMoreAction =
  | CinemaMoreAudioAction
  | CinemaMoreAdvancedAction
  | CinemaMoreDiagnosticsAction
  | CinemaMoreDisplayAction
  | CinemaMoreNavigationAction
  | CinemaMoreSourceAction
  | CinemaMoreTemporaryAction
  | CinemaMoreWorkflowAction
  | CinemaMoreTheatreAction;

export type CinemaMoreOperatorAction = CinemaMoreAdvancedAction | CinemaMoreDiagnosticsAction;

export interface CinemaMoreSection {
  readonly detail: string;
  readonly id: CinemaMoreSectionId;
  readonly label: string;
}

export const CINEMA_MORE_SECTIONS: readonly CinemaMoreSection[] = [
  {
    detail: "Inspector, source summary, and provenance actions.",
    id: "source",
    label: "Source",
  },
  {
    detail: "Generated audio creation and recovery.",
    id: "audio",
    label: "Audio",
  },
  {
    detail: "Reader display and canvas controls.",
    id: "display",
    label: "Display",
  },
  {
    detail: "Reader-first theatre and fullscreen controls.",
    id: "theatre",
    label: "Theatre",
  },
  {
    detail: "Return to Review or Preview without crowding Read mode.",
    id: "workflow",
    label: "Workflow",
  },
  {
    detail: "Session-only temporary source actions.",
    id: "temporary",
    label: "Temporary source",
  },
  {
    detail: "Source, policy, and extraction internals.",
    id: "advanced",
    label: "Advanced",
  },
  {
    detail: "Timing, sync, and repair diagnostics.",
    id: "diagnostics",
    label: "Diagnostics",
  },
  {
    detail: "Shared command, shortcut, and workflow help.",
    id: "help-shortcuts",
    label: "Help/Shortcuts",
  },
] as const;

const CINEMA_MORE_SOURCE_ACTIONS: readonly CinemaMoreSourceAction[] = [
  {
    commandId: "cinema:source:inspector",
    detail: "Open the Cinema Inspector for source, policy, and extraction context.",
    id: "open-inspector",
    keywords: ["inspector", "source", "context", "details"],
    kind: "source",
    label: "Open Inspector",
    owner: "cinema-source",
    reason: "Inspector access stays available from More on narrow surfaces.",
    sectionId: "source",
    testId: "ui-action-cinema-more-open-inspector",
  },
  {
    commandId: "cinema:source:details",
    detail: "Show source details and provenance for this Cinema source.",
    id: "source-details",
    keywords: ["source", "details", "provenance", "metadata"],
    kind: "source",
    label: "Source details",
    owner: "cinema-source",
    reason: "Source details are discoverable without adding another Read-mode control.",
    sectionId: "source",
    testId: "ui-action-cinema-more-source-details",
  },
] as const;

const CINEMA_MORE_AUDIO_ACTIONS: readonly CinemaMoreAudioAction[] = [
  {
    commandId: "cinema:audio:create",
    detail: "Create generated audio for the active Cinema source.",
    id: "create-audio",
    keywords: ["audio", "create", "generate", "temporary"],
    kind: "audio",
    label: "Create audio",
    owner: "cinema-audio",
    reason: "Audio generation is available from More when the current source can be narrated.",
    sectionId: "audio",
    testId: "ui-action-cinema-more-create-audio",
  },
  {
    commandId: "cinema:audio:retry",
    detail: "Retry generated audio for the active Cinema source.",
    id: "retry-audio",
    keywords: ["audio", "retry", "recover", "generation"],
    kind: "audio",
    label: "Retry audio",
    owner: "cinema-audio",
    reason:
      "Retry stays contextual to audio recovery instead of becoming a permanent header action.",
    sectionId: "audio",
    testId: "ui-action-cinema-more-retry-audio",
  },
] as const;

const CINEMA_MORE_WORKFLOW_ACTIONS: readonly CinemaMoreWorkflowAction[] = [
  {
    commandId: "cinema:workflow:return-review",
    detail: "Return to Review for the active source.",
    id: "return-review",
    keywords: ["review", "return", "workflow"],
    kind: "workflow",
    label: "Return to Review",
    owner: "cinema-workflow",
    reason: "Review return is a contextual workflow action for mobile Cinema.",
    sectionId: "workflow",
    testId: "ui-action-cinema-more-return-review",
  },
  {
    commandId: "cinema:workflow:return-preview",
    detail: "Return to Preview for the active source.",
    id: "return-preview",
    keywords: ["preview", "return", "workflow"],
    kind: "workflow",
    label: "Return to Preview",
    owner: "cinema-workflow",
    reason: "Preview return is a contextual workflow action for mobile Cinema.",
    sectionId: "workflow",
    testId: "ui-action-cinema-more-return-preview",
  },
] as const;

const CINEMA_MORE_TEMPORARY_ACTIONS: readonly CinemaMoreTemporaryAction[] = [
  {
    commandId: "cinema:temporary:keep",
    detail: "Keep this temporary source in the project.",
    id: "keep-temporary-source",
    keywords: ["temporary", "keep", "project", "promote"],
    kind: "temporary",
    label: "Keep in project",
    owner: "cinema-temporary-source",
    reason: "Keeping a temporary source must be an explicit user action.",
    sectionId: "temporary",
    testId: "ui-action-cinema-more-keep-temporary-source",
  },
  {
    commandId: "cinema:temporary:discard",
    detail: "Discard only this temporary source and its session-scoped artifacts.",
    id: "discard-temporary-source",
    keywords: ["temporary", "discard", "cleanup"],
    kind: "temporary",
    label: "Discard temporary source",
    owner: "cinema-temporary-source",
    reason: "Discard uses temporary cleanup and does not delete project sources.",
    sectionId: "temporary",
    testId: "ui-action-cinema-more-discard-temporary-source",
  },
] as const;

const CINEMA_MORE_DISPLAY_ACTIONS: readonly CinemaMoreDisplayAction[] = [
  {
    commandId: "settings:field:readerPreferences",
    detail: "Open reader typography, accessibility, and theme settings.",
    id: "reader-settings",
    keywords: ["display", "reader", "settings", "typography", "accessibility"],
    kind: "display",
    label: "Reader settings",
    owner: "cinema-display",
    reason: "Reader settings stay behind More so Read mode remains calm until requested.",
    sectionId: "display",
    testId: "ui-action-cinema-more-reader-settings",
  },
] as const;

const CINEMA_MORE_THEATRE_ACTIONS: readonly CinemaMoreTheatreAction[] = [
  {
    commandId: "cinema:theatre:open",
    detail: "Enter the reader-first theatre layout for the active Cinema surface.",
    id: "theatre-mode",
    keywords: ["theatre", "cinematic", "fullscreen", "reader", "immersive"],
    kind: "theatre",
    label: "Cinema Theatre",
    owner: "cinema-theatre",
    reason: "Theatre is separated from normal Read mode so immersive listening is deliberate.",
    sectionId: "theatre",
    shortcutHint: "Esc exits",
    testId: "ui-action-cinema-more-theatre-mode",
  },
] as const;

const CINEMA_MORE_NAVIGATION_ACTIONS: readonly CinemaMoreNavigationAction[] = [
  {
    commandId: "command.palette",
    detail: "Open the shared command palette for Cinema and workspace commands.",
    id: "command-palette",
    keywords: ["help", "shortcut", "command", "palette", "actions"],
    kind: "help-shortcuts",
    label: "Command palette",
    owner: "cinema-help",
    reason: "Command palette entries use the same owners as visible Cinema controls.",
    sectionId: "help-shortcuts",
    shortcutCommandId: "command.palette",
    shortcutHint: "Ctrl+K / Cmd+K",
    testId: "ui-action-cinema-more-command-palette",
  },
  {
    commandId: "shortcuts:open",
    detail: "Show keyboard shortcuts and customization entry points.",
    id: "keyboard-shortcuts",
    keywords: ["help", "keyboard", "shortcuts"],
    kind: "help-shortcuts",
    label: "Keyboard shortcuts",
    owner: "cinema-help",
    reason: "Shortcut help is reachable from More without adding another header button.",
    sectionId: "help-shortcuts",
    shortcutCommandId: "shortcut.cheatsheet",
    shortcutHint: "? / F1",
    testId: "ui-action-cinema-more-keyboard-shortcuts",
  },
  {
    commandId: "help:open",
    detail: "Open the local Cinema workflow guide and support context.",
    id: "help-guide",
    keywords: ["help", "guide", "workflow"],
    kind: "help-shortcuts",
    label: "Help/guide",
    owner: "cinema-help",
    reason: "Help is available on demand from the same local command surface.",
    sectionId: "help-shortcuts",
    shortcutCommandId: "help.open",
    shortcutHint: "Shift+F1",
    testId: "ui-action-cinema-more-help-guide",
  },
] as const;

export const CINEMA_MORE_ACTIONS: readonly CinemaMoreAction[] = [
  ...CINEMA_MORE_SOURCE_ACTIONS,
  ...CINEMA_MORE_AUDIO_ACTIONS,
  ...CINEMA_MORE_DISPLAY_ACTIONS,
  ...CINEMA_MORE_THEATRE_ACTIONS,
  ...CINEMA_MORE_WORKFLOW_ACTIONS,
  ...CINEMA_MORE_TEMPORARY_ACTIONS,
  ...CINEMA_ADVANCED_MODE_ACTIONS.map((action): CinemaMoreOperatorAction => {
    const baseAction = {
      advancedAction: action,
      commandId: action.commandId,
      detail: action.detail,
      disabledReason: action.disabledReason,
      id: action.id,
      keywords: action.keywords,
      label: action.label,
      mode: action.mode,
      panelId: action.panelId,
      reason: action.reason,
      testId: action.testId,
    };
    if (
      action.id === "diagnostics" ||
      action.id === "timing-map" ||
      action.id === "alignment-repair"
    ) {
      return {
        ...baseAction,
        kind: "diagnostics",
        owner: "cinema-diagnostics",
        sectionId: "diagnostics",
      };
    }
    return {
      ...baseAction,
      kind: "advanced",
      owner: "cinema-advanced",
      sectionId: "advanced",
    };
  }),
  ...CINEMA_MORE_NAVIGATION_ACTIONS,
] as const;

export const CINEMA_MORE_REQUIRED_SECTION_IDS: readonly CinemaMoreSectionId[] =
  CINEMA_MORE_SECTION_IDS;

export interface CinemaMoreActionBudget {
  readonly max: number;
  readonly min: number;
}

export const CINEMA_MORE_ACTION_BUDGETS: Readonly<Record<string, CinemaMoreActionBudget>> = {
  BookCinema: { max: 14, min: 8 },
  DocumentCinema: { max: 14, min: 8 },
  WebsiteCinema: { max: 14, min: 8 },
  "Mobile/narrow More sheet": { max: 6, min: 3 },
};

export interface CinemaMoreContextInput {
  readonly audioAction?: "create" | "retry" | "none";
  readonly includeDiagnostics?: boolean;
  readonly includeTemporaryActions?: boolean;
}

export function cinemaMoreActionsForContext({
  audioAction = "none",
  includeDiagnostics = false,
  includeTemporaryActions = false,
}: CinemaMoreContextInput): readonly CinemaMoreAction[] {
  return CINEMA_MORE_ACTIONS.filter((action) => {
    if (action.id === "create-audio") {
      return audioAction === "create";
    }
    if (action.id === "retry-audio") {
      return audioAction === "retry";
    }
    if (action.kind === "temporary") {
      return includeTemporaryActions;
    }
    if (action.kind === "diagnostics") {
      return includeDiagnostics;
    }
    if (action.id === "help-guide") {
      return includeDiagnostics;
    }
    return true;
  });
}

export function cinemaMoreActionsBySection(
  actions: readonly CinemaMoreAction[],
): Record<CinemaMoreSectionId, CinemaMoreAction[]> {
  const groups: Record<CinemaMoreSectionId, CinemaMoreAction[]> = {
    advanced: [],
    audio: [],
    diagnostics: [],
    display: [],
    "help-shortcuts": [],
    source: [],
    temporary: [],
    theatre: [],
    workflow: [],
  };
  for (const action of actions) {
    groups[action.sectionId].push(action);
  }
  return groups;
}

export function activeCinemaMoreAction({
  activePanelId,
  mode,
}: Readonly<{
  activePanelId?: ContextPanelTabId | null;
  mode: CinemaFocusMode;
}>): CinemaMoreOperatorAction | null {
  const activeAdvanced = activeCinemaAdvancedModeAction({ activePanelId, mode });
  if (!activeAdvanced) {
    return null;
  }
  return (
    CINEMA_MORE_ACTIONS.find(
      (action): action is CinemaMoreOperatorAction =>
        isCinemaMoreOperatorAction(action) && action.id === activeAdvanced.id,
    ) ?? null
  );
}

export function cinemaMoreAction(id: CinemaMoreActionId): CinemaMoreAction {
  return CINEMA_MORE_ACTIONS.find((action) => action.id === id) ?? CINEMA_MORE_ACTIONS[0];
}

export function isCinemaMoreOperatorAction(
  action: CinemaMoreAction,
): action is CinemaMoreOperatorAction {
  return action.kind === "advanced" || action.kind === "diagnostics";
}
