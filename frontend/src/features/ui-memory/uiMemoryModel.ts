import type { UiMemoryPreferenceId } from "../preferences";

export type UiMemoryResetScope = "all" | "reader" | "workspace";

export interface UiMemoryPreferenceMeta {
  readonly detail: string;
  readonly id: UiMemoryPreferenceId;
  readonly label: string;
  readonly testId: string;
}

export const UI_MEMORY_PREFERENCE_META: readonly UiMemoryPreferenceMeta[] = [
  {
    detail:
      "Workspace density, Custom density, and the active Review detail tab can reopen as you left them.",
    id: "rememberLayout",
    label: "Remember layout",
    testId: "ui-action-ui-memory-remember-layout",
  },
  {
    detail: "Theme stays machine-local and is omitted from export when disabled.",
    id: "rememberTheme",
    label: "Remember theme",
    testId: "ui-action-ui-memory-remember-theme",
  },
  {
    detail: "The last selected project can be restored on this browser.",
    id: "rememberLastProject",
    label: "Remember last project",
    testId: "ui-action-ui-memory-remember-last-project",
  },
  {
    detail: "Reader typography, motion, and contrast preferences can persist locally.",
    id: "rememberReaderPreferences",
    label: "Remember reader preferences",
    testId: "ui-action-ui-memory-remember-reader-preferences",
  },
  {
    detail: "Teleprompt can restore its return target without exporting script text or audio.",
    id: "rememberTelepromptReturnTarget",
    label: "Remember Teleprompt return target",
    testId: "ui-action-ui-memory-remember-teleprompt-return-target",
  },
  {
    detail: "Teleprompt Theatre presets and presenter layout stay local to this browser.",
    id: "rememberTelepromptTheatreSettings",
    label: "Remember Teleprompt Theatre settings",
    testId: "ui-action-ui-memory-remember-teleprompt-theatre-settings",
  },
  {
    detail:
      "Pinned Cinema and advanced workspace panels remain session-only unless this is enabled.",
    id: "rememberPanelPins",
    label: "Remember panel pins",
    testId: "ui-action-ui-memory-remember-panel-pins",
  },
  {
    detail:
      "Show the Try the Studio launcher until the tutorial is hidden or completed; turn this back on to restore it.",
    id: "showTutorialLauncher",
    label: "Show Studio tutorial launcher",
    testId: "ui-action-ui-memory-show-tutorial-launcher",
  },
];

export const UI_MEMORY_RESET_LABELS: Record<UiMemoryResetScope, string> = {
  all: "Reset all UI memory",
  reader: "Reset reader preferences",
  workspace: "Reset workspace layout",
};

export const UI_MEMORY_RESET_CONFIRMATION: Record<UiMemoryResetScope, string> = {
  all: "Reset all UI memory on this machine? This clears remembered layout, theme, reader preferences, last project, Teleprompt return memory, Theatre settings, panel pins, and tutorial launcher visibility. It does not delete temporary source content.",
  reader:
    "Reset reader preferences on this machine? Typography, spacing, contrast, and motion preferences will return to defaults. Temporary source content is unchanged.",
  workspace:
    "Reset workspace layout memory on this machine? Workspace density, Custom density, advanced panel pins, and Review detail tabs will return to defaults. Temporary source content is unchanged.",
};
