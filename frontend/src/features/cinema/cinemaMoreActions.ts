import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";
import {
  CINEMA_ADVANCED_MODE_ACTIONS,
  activeCinemaAdvancedModeAction,
  type CinemaAdvancedModeAction,
  type CinemaAdvancedModeId,
} from "./cinemaAdvancedMode";
import type { CinemaFocusMode } from "./model";

export const CINEMA_MORE_MENU_ID = "cinema-more-menu";

export const CINEMA_MORE_SECTION_IDS = ["display", "advanced", "navigation"] as const;

export type CinemaMoreSectionId = (typeof CINEMA_MORE_SECTION_IDS)[number];

export type CinemaMoreDisplayActionId = "reader-settings" | "compact-transport" | "theatre-mode";

export type CinemaMoreNavigationActionId = "command-palette" | "keyboard-shortcuts" | "help-guide";

export type CinemaMoreActionId =
  | CinemaAdvancedModeId
  | CinemaMoreDisplayActionId
  | CinemaMoreNavigationActionId;

export type CinemaMoreActionKind = "advanced" | "display" | "navigation";

export type CinemaMoreActionOwner = "cinema-advanced" | "cinema-display" | "cinema-navigation";

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
  readonly testId: `ui-action-cinema-more-${string}` | `ui-action-cinema-advanced-${string}`;
}

export interface CinemaMoreDisplayAction extends CinemaMoreActionBase {
  readonly id: CinemaMoreDisplayActionId;
  readonly kind: "display";
  readonly owner: "cinema-display";
  readonly sectionId: "display";
}

export interface CinemaMoreAdvancedAction extends CinemaMoreActionBase {
  readonly advancedAction: CinemaAdvancedModeAction;
  readonly commandId: `cinema:advanced:${CinemaAdvancedModeId}`;
  readonly id: CinemaAdvancedModeId;
  readonly kind: "advanced";
  readonly mode: CinemaFocusMode;
  readonly owner: "cinema-advanced";
  readonly panelId: ContextPanelTabId;
  readonly sectionId: "advanced";
  readonly testId: `ui-action-cinema-advanced-${string}`;
}

export interface CinemaMoreNavigationAction extends CinemaMoreActionBase {
  readonly commandId: "command.palette" | "shortcuts:open" | "help:open";
  readonly id: CinemaMoreNavigationActionId;
  readonly kind: "navigation";
  readonly owner: "cinema-navigation";
  readonly sectionId: "navigation";
}

export type CinemaMoreAction =
  | CinemaMoreAdvancedAction
  | CinemaMoreDisplayAction
  | CinemaMoreNavigationAction;

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
    detail: "Operator diagnostics and source internals.",
    id: "advanced",
    label: "Advanced",
  },
  {
    detail: "Shared navigation and help commands.",
    id: "navigation",
    label: "Navigation",
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
  {
    detail: "Return to the canvas-first reader with the compact transport visible.",
    id: "compact-transport",
    keywords: ["display", "compact", "transport", "read", "canvas"],
    kind: "display",
    label: "Compact transport",
    owner: "cinema-display",
    reason: "Compact transport hides inspector chrome and keeps playback controls reachable.",
    sectionId: "display",
    testId: "ui-action-cinema-more-compact-transport",
  },
  {
    detail: "Use native fullscreen when available, with a reader-first theatre fallback.",
    id: "theatre-mode",
    keywords: ["display", "theatre", "cinematic", "fullscreen", "reader"],
    kind: "display",
    label: "Theatre/Cinematic mode",
    owner: "cinema-display",
    reason: "Theatre mode is an explicit display action, not a persistent More mode.",
    sectionId: "display",
    testId: "ui-action-cinema-more-theatre-mode",
  },
] as const;

const CINEMA_MORE_NAVIGATION_ACTIONS: readonly CinemaMoreNavigationAction[] = [
  {
    commandId: "command.palette",
    detail: "Open the shared command palette for Cinema and workspace commands.",
    id: "command-palette",
    keywords: ["navigation", "command", "palette", "actions"],
    kind: "navigation",
    label: "Command palette",
    owner: "cinema-navigation",
    reason: "Command palette entries use the same owners as visible Cinema controls.",
    sectionId: "navigation",
    testId: "ui-action-cinema-more-command-palette",
  },
  {
    commandId: "shortcuts:open",
    detail: "Show keyboard shortcuts and customization entry points.",
    id: "keyboard-shortcuts",
    keywords: ["navigation", "keyboard", "shortcuts", "help"],
    kind: "navigation",
    label: "Keyboard shortcuts",
    owner: "cinema-navigation",
    reason: "Shortcut help is reachable from More without adding another header button.",
    sectionId: "navigation",
    testId: "ui-action-cinema-more-keyboard-shortcuts",
  },
  {
    commandId: "help:open",
    detail: "Open the local Cinema workflow guide and support context.",
    id: "help-guide",
    keywords: ["navigation", "help", "guide", "workflow"],
    kind: "navigation",
    label: "Help/guide",
    owner: "cinema-navigation",
    reason: "Help is available on demand from the same local command surface.",
    sectionId: "navigation",
    testId: "ui-action-cinema-more-help-guide",
  },
] as const;

export const CINEMA_MORE_ACTIONS: readonly CinemaMoreAction[] = [
  ...CINEMA_MORE_DISPLAY_ACTIONS,
  ...CINEMA_ADVANCED_MODE_ACTIONS.map(
    (action): CinemaMoreAdvancedAction => ({
      advancedAction: action,
      commandId: action.commandId,
      detail: action.detail,
      disabledReason: action.disabledReason,
      id: action.id,
      keywords: action.keywords,
      kind: "advanced",
      label: action.label,
      mode: action.mode,
      owner: action.owner,
      panelId: action.panelId,
      reason: action.reason,
      sectionId: "advanced",
      testId: action.testId,
    }),
  ),
  ...CINEMA_MORE_NAVIGATION_ACTIONS,
] as const;

export function cinemaMoreActionsBySection(
  actions: readonly CinemaMoreAction[],
): Record<CinemaMoreSectionId, CinemaMoreAction[]> {
  const groups: Record<CinemaMoreSectionId, CinemaMoreAction[]> = {
    advanced: [],
    display: [],
    navigation: [],
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
}>): CinemaMoreAdvancedAction | null {
  const activeAdvanced = activeCinemaAdvancedModeAction({ activePanelId, mode });
  if (!activeAdvanced) {
    return null;
  }
  return (
    CINEMA_MORE_ACTIONS.find(
      (action): action is CinemaMoreAdvancedAction =>
        action.kind === "advanced" && action.id === activeAdvanced.id,
    ) ?? null
  );
}

export function cinemaMoreAction(id: CinemaMoreActionId): CinemaMoreAction {
  return CINEMA_MORE_ACTIONS.find((action) => action.id === id) ?? CINEMA_MORE_ACTIONS[0];
}
