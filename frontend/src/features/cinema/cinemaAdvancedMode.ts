import type { ContextPanelTabId } from "../context-panel/contextPanelTabs";
import type { CinemaFocusMode } from "./model";

export const CINEMA_ADVANCED_MODE_IDS = [
  "diagnostics",
  "timing-map",
  "alignment-repair",
  "policy-internals",
  "source-internals",
] as const;

export type CinemaAdvancedModeId = (typeof CINEMA_ADVANCED_MODE_IDS)[number];

export interface CinemaAdvancedModeAction {
  readonly commandId: `cinema:advanced:${CinemaAdvancedModeId}`;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly id: CinemaAdvancedModeId;
  readonly keywords: readonly string[];
  readonly label: string;
  readonly mode: CinemaFocusMode;
  readonly owner: "cinema-advanced";
  readonly panelId: ContextPanelTabId;
  readonly reason: string;
  readonly testId: `ui-action-cinema-advanced-${string}`;
}

export const CINEMA_ADVANCED_MODE_ACTIONS: readonly CinemaAdvancedModeAction[] = [
  {
    commandId: "cinema:advanced:diagnostics",
    detail: "Open operator diagnostics for generated audio, skipped content, and reader sync.",
    id: "diagnostics",
    keywords: ["advanced", "debug", "diagnostics", "health", "operator"],
    label: "Diagnostics",
    mode: "debug",
    owner: "cinema-advanced",
    panelId: "diagnostics",
    reason: "Operator diagnostics are hidden from Read mode until explicitly selected.",
    testId: "ui-action-cinema-advanced-diagnostics",
  },
  {
    commandId: "cinema:advanced:timing-map",
    detail: "Inspect read-along timing, alignment confidence, and drift reports.",
    id: "timing-map",
    keywords: ["advanced", "debug", "timing", "alignment", "drift"],
    label: "Timing map",
    mode: "debug",
    owner: "cinema-advanced",
    panelId: "diagnostics",
    reason: "Timing internals are operator diagnostics and stay out of normal reading.",
    testId: "ui-action-cinema-advanced-timing-map",
  },
  {
    commandId: "cinema:advanced:alignment-repair",
    detail: "Open manual alignment diagnostics and project-local repair tools.",
    id: "alignment-repair",
    keywords: ["advanced", "debug", "alignment", "repair", "drift", "manual"],
    label: "Alignment repair",
    mode: "debug",
    owner: "cinema-advanced",
    panelId: "diagnostics",
    reason: "Manual repairs are debug-only and versioned against generated audio and speech plan.",
    testId: "ui-action-cinema-advanced-alignment-repair",
  },
  {
    commandId: "cinema:advanced:policy-internals",
    detail: "Open source policy notes, pins, and generated-audio policy context.",
    id: "policy-internals",
    keywords: ["advanced", "policy", "internals", "pins", "speech"],
    label: "Policy internals",
    mode: "inspect",
    owner: "cinema-advanced",
    panelId: "policy",
    reason: "Policy internals are discoverable from More without becoming the default reader mode.",
    testId: "ui-action-cinema-advanced-policy-internals",
  },
  {
    commandId: "cinema:advanced:source-internals",
    detail: "Open source provenance, extraction state, and current passage structure.",
    id: "source-internals",
    keywords: ["advanced", "source", "internals", "provenance", "structure"],
    label: "Source internals",
    mode: "inspect",
    owner: "cinema-advanced",
    panelId: "overview",
    reason: "Source internals are inspectable on demand while Read mode stays canvas-first.",
    testId: "ui-action-cinema-advanced-source-internals",
  },
] as const;

export function cinemaAdvancedModeAction(id: CinemaAdvancedModeId): CinemaAdvancedModeAction {
  return (
    CINEMA_ADVANCED_MODE_ACTIONS.find((action) => action.id === id) ??
    CINEMA_ADVANCED_MODE_ACTIONS[0]
  );
}

export function activeCinemaAdvancedModeAction({
  mode,
}: Readonly<{
  activePanelId?: ContextPanelTabId | null;
  mode: CinemaFocusMode;
}>): CinemaAdvancedModeAction | null {
  if (mode === "debug") {
    return cinemaAdvancedModeAction("diagnostics");
  }
  return null;
}
