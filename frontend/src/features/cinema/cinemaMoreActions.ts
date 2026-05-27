import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";
import {
  CINEMA_ADVANCED_MODE_ACTIONS,
  activeCinemaAdvancedModeAction,
  type CinemaAdvancedModeAction,
  type CinemaAdvancedModeId,
} from "./cinemaAdvancedMode";
import type { CinemaFocusMode } from "./model";

export const CINEMA_MORE_MENU_ID = "cinema-more-menu";

export const CINEMA_MORE_SECTION_IDS = [
  "display",
  "theatre",
  "advanced",
  "diagnostics",
  "help-shortcuts",
] as const;

export type CinemaMoreSectionId = (typeof CINEMA_MORE_SECTION_IDS)[number];

export type CinemaMoreDisplayActionId = "reader-settings";

export type CinemaMoreTheatreActionId = "theatre-mode";

export type CinemaMoreNavigationActionId = "command-palette" | "keyboard-shortcuts" | "help-guide";

export type CinemaMoreActionId =
  | CinemaAdvancedModeId
  | CinemaMoreDisplayActionId
  | CinemaMoreTheatreActionId
  | CinemaMoreNavigationActionId;

export type CinemaMoreActionKind =
  | "advanced"
  | "diagnostics"
  | "display"
  | "help-shortcuts"
  | "theatre";

export type CinemaMoreActionOwner =
  | "cinema-advanced"
  | "cinema-diagnostics"
  | "cinema-display"
  | "cinema-help"
  | "cinema-theatre";

interface CinemaMoreActionBase {
  readonly commandId?: string;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly id: CinemaMoreActionId;
  readonly keywords: readonly string[];
  readonly kind: CinemaMoreActionKind;
  readonly label: string;
  readonly owner: CinemaMoreActionOwner;
  readonly reason: string;
  readonly sectionId: CinemaMoreSectionId;
  readonly shortcutHint?: string;
  readonly testId: `ui-action-cinema-more-${string}` | `ui-action-cinema-advanced-${string}`;
}

export interface CinemaMoreDisplayAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreDisplayActionId;
  readonly kind: "display";
  readonly owner: "cinema-display";
  readonly sectionId: "display";
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
  | CinemaMoreAdvancedAction
  | CinemaMoreDiagnosticsAction
  | CinemaMoreDisplayAction
  | CinemaMoreNavigationAction
  | CinemaMoreTheatreAction;

export type CinemaMoreOperatorAction = CinemaMoreAdvancedAction | CinemaMoreDiagnosticsAction;

export interface CinemaMoreSection {
  readonly detail: string;
  readonly id: CinemaMoreSectionId;
  readonly label: string;
}

export const CINEMA_MORE_SECTIONS: readonly CinemaMoreSection[] = [
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

const CINEMA_MORE_DISPLAY_ACTIONS: readonly CinemaMoreDisplayAction[] = [
  {
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
    shortcutHint: "Shift+F1",
    testId: "ui-action-cinema-more-help-guide",
  },
] as const;

export const CINEMA_MORE_ACTIONS: readonly CinemaMoreAction[] = [
  ...CINEMA_MORE_DISPLAY_ACTIONS,
  ...CINEMA_MORE_THEATRE_ACTIONS,
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
  BookCinema: { max: 10, min: 8 },
  DocumentCinema: { max: 10, min: 8 },
  WebsiteCinema: { max: 10, min: 8 },
  "Mobile/narrow More sheet": { max: 6, min: 3 },
};

export function cinemaMoreActionsBySection(
  actions: readonly CinemaMoreAction[],
): Record<CinemaMoreSectionId, CinemaMoreAction[]> {
  const groups: Record<CinemaMoreSectionId, CinemaMoreAction[]> = {
    advanced: [],
    diagnostics: [],
    display: [],
    "help-shortcuts": [],
    theatre: [],
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
