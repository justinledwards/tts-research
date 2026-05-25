import type { UiActionSurface } from "./actionScopes";

export type SurfaceComplexityTier = "calm" | "standard" | "dense" | "advanced";

export interface SurfaceComplexityMetrics {
  readonly activeModesTabs: number;
  readonly averageAccessibleLabelLength: number;
  readonly chipsBadges: number;
  readonly destructiveActions: number;
  readonly disabledActions: number;
  readonly duplicatedVisibleLabels: number;
  readonly panelsOpenByDefault: number;
  readonly primaryActions: number;
  readonly reachableDrawersSheets: number;
  readonly visibleActions: number;
}

export interface SurfaceComplexityBudget {
  readonly allowAdvancedOverflow?: boolean;
  readonly maxActiveModesTabs: number;
  readonly maxAverageAccessibleLabelLength: number;
  readonly maxChipsBadges: number;
  readonly maxDestructiveActions: number;
  readonly maxDisabledActions: number;
  readonly maxDuplicatedVisibleLabels: number;
  readonly maxPanelsOpenByDefault: number;
  readonly maxPrimaryActions: number;
  readonly maxReachableDrawersSheets: number;
  readonly maxVisibleActions: number;
  readonly notes: readonly string[];
  readonly tier: SurfaceComplexityTier;
}

export interface SurfaceComplexityResult {
  readonly actual: number;
  readonly budget: number;
  readonly metric: keyof SurfaceComplexityMetrics;
  readonly passed: boolean;
}

export const SURFACE_COMPLEXITY_BUDGETS = {
  commandPalette: {
    maxActiveModesTabs: 4,
    maxAverageAccessibleLabelLength: 40,
    maxChipsBadges: 16,
    maxDestructiveActions: 0,
    maxDisabledActions: 4,
    maxDuplicatedVisibleLabels: 1,
    maxPanelsOpenByDefault: 3,
    maxPrimaryActions: 4,
    maxReachableDrawersSheets: 2,
    maxVisibleActions: 12,
    notes: ["Command palette is secondary navigation, not a hidden required-task dump."],
    tier: "standard",
  },
  debugAdvanced: {
    allowAdvancedOverflow: true,
    maxActiveModesTabs: 18,
    maxAverageAccessibleLabelLength: 90,
    maxChipsBadges: 80,
    maxDestructiveActions: 4,
    maxDisabledActions: 18,
    maxDuplicatedVisibleLabels: 8,
    maxPanelsOpenByDefault: 12,
    maxPrimaryActions: 16,
    maxReachableDrawersSheets: 8,
    maxVisibleActions: 48,
    notes: ["Advanced/debug surfaces may exceed normal density when explicitly operator-facing."],
    tier: "advanced",
  },
  readMode: {
    maxActiveModesTabs: 10,
    maxAverageAccessibleLabelLength: 40,
    maxChipsBadges: 40,
    maxDestructiveActions: 0,
    maxDisabledActions: 4,
    maxDuplicatedVisibleLabels: 2,
    maxPanelsOpenByDefault: 6,
    maxPrimaryActions: 10,
    maxReachableDrawersSheets: 6,
    maxVisibleActions: 25,
    notes: ["Read mode stays canvas-first with diagnostics hidden by default."],
    tier: "calm",
  },
  reviewWorkspace: {
    maxActiveModesTabs: 16,
    maxAverageAccessibleLabelLength: 45,
    maxChipsBadges: 72,
    maxDestructiveActions: 2,
    maxDisabledActions: 14,
    maxDuplicatedVisibleLabels: 8,
    maxPanelsOpenByDefault: 12,
    maxPrimaryActions: 26,
    maxReachableDrawersSheets: 10,
    maxVisibleActions: 68,
    notes: ["Review may expose batch actions, but one review action group remains primary."],
    tier: "dense",
  },
  settingsQuick: {
    maxActiveModesTabs: 16,
    maxAverageAccessibleLabelLength: 90,
    maxChipsBadges: 80,
    maxDestructiveActions: 4,
    maxDisabledActions: 6,
    maxDuplicatedVisibleLabels: 4,
    maxPanelsOpenByDefault: 10,
    maxPrimaryActions: 12,
    maxReachableDrawersSheets: 6,
    maxVisibleActions: 40,
    notes: ["Quick settings should expose common settings; expert groups own deeper controls."],
    tier: "standard",
  },
  teleprompt: {
    maxActiveModesTabs: 12,
    maxAverageAccessibleLabelLength: 45,
    maxChipsBadges: 48,
    maxDestructiveActions: 0,
    maxDisabledActions: 8,
    maxDuplicatedVisibleLabels: 4,
    maxPanelsOpenByDefault: 8,
    maxPrimaryActions: 16,
    maxReachableDrawersSheets: 8,
    maxVisibleActions: 46,
    notes: ["Teleprompt keeps presenter controls primary; workflow actions stay secondary."],
    tier: "standard",
  },
  workspace: {
    maxActiveModesTabs: 18,
    maxAverageAccessibleLabelLength: 50,
    maxChipsBadges: 72,
    maxDestructiveActions: 2,
    maxDisabledActions: 14,
    maxDuplicatedVisibleLabels: 8,
    maxPanelsOpenByDefault: 12,
    maxPrimaryActions: 26,
    maxReachableDrawersSheets: 10,
    maxVisibleActions: 68,
    notes: ["Workspace can coordinate surfaces, but hidden rails must not become required paths."],
    tier: "dense",
  },
} as const satisfies Record<string, SurfaceComplexityBudget>;

export const SURFACE_COMPLEXITY_SCENARIO_BUDGETS = {
  "book-docx-audio-ready": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "book-epub-audio-ready": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "book-pdf-pre-audio": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "command-palette": SURFACE_COMPLEXITY_BUDGETS.commandPalette,
  "document-cinema": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "mobile-more-sheet": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "pinned-inspector": SURFACE_COMPLEXITY_BUDGETS.debugAdvanced,
  "preview-mini-player": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "project-dashboard": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "settings-open": SURFACE_COMPLEXITY_BUDGETS.settingsQuick,
  "settings-speech-policy": SURFACE_COMPLEXITY_BUDGETS.settingsQuick,
  "settings-ui-memory": SURFACE_COMPLEXITY_BUDGETS.settingsQuick,
  "voice-dashboard": SURFACE_COMPLEXITY_BUDGETS.commandPalette,
  "website-cinema": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "workspace-intake": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "workspace-preview": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "workspace-review": SURFACE_COMPLEXITY_BUDGETS.reviewWorkspace,
  "workspace-teleprompt": SURFACE_COMPLEXITY_BUDGETS.teleprompt,
} as const satisfies Record<string, SurfaceComplexityBudget>;

export function surfaceComplexityBudgetFor(
  scenarioId: string,
  surface: UiActionSurface,
): SurfaceComplexityBudget {
  if (Object.hasOwn(SURFACE_COMPLEXITY_SCENARIO_BUDGETS, scenarioId)) {
    return SURFACE_COMPLEXITY_SCENARIO_BUDGETS[
      scenarioId as keyof typeof SURFACE_COMPLEXITY_SCENARIO_BUDGETS
    ];
  }
  return budgetForSurface(surface);
}

export function evaluateSurfaceComplexity(
  metrics: SurfaceComplexityMetrics,
  budget: SurfaceComplexityBudget,
): SurfaceComplexityResult[] {
  return [
    result("visibleActions", metrics.visibleActions, budget.maxVisibleActions),
    result("primaryActions", metrics.primaryActions, budget.maxPrimaryActions),
    result("disabledActions", metrics.disabledActions, budget.maxDisabledActions),
    result("destructiveActions", metrics.destructiveActions, budget.maxDestructiveActions),
    result("panelsOpenByDefault", metrics.panelsOpenByDefault, budget.maxPanelsOpenByDefault),
    result(
      "reachableDrawersSheets",
      metrics.reachableDrawersSheets,
      budget.maxReachableDrawersSheets,
    ),
    result(
      "duplicatedVisibleLabels",
      metrics.duplicatedVisibleLabels,
      budget.maxDuplicatedVisibleLabels,
    ),
    result(
      "averageAccessibleLabelLength",
      metrics.averageAccessibleLabelLength,
      budget.maxAverageAccessibleLabelLength,
    ),
    result("chipsBadges", metrics.chipsBadges, budget.maxChipsBadges),
    result("activeModesTabs", metrics.activeModesTabs, budget.maxActiveModesTabs),
  ];
}

function budgetForSurface(surface: UiActionSurface): SurfaceComplexityBudget {
  if (surface === "Settings" || surface === "UI Memory" || surface === "Speech Policy") {
    return SURFACE_COMPLEXITY_BUDGETS.settingsQuick;
  }
  if (surface === "Command Palette" || surface === "Voice Dashboard") {
    return SURFACE_COMPLEXITY_BUDGETS.commandPalette;
  }
  if (surface === "Teleprompt") {
    return SURFACE_COMPLEXITY_BUDGETS.teleprompt;
  }
  if (surface === "Review") {
    return SURFACE_COMPLEXITY_BUDGETS.reviewWorkspace;
  }
  if (surface === "BookCinema" || surface === "DocumentCinema" || surface === "WebsiteCinema") {
    return SURFACE_COMPLEXITY_BUDGETS.readMode;
  }
  return SURFACE_COMPLEXITY_BUDGETS.workspace;
}

function result(
  metric: keyof SurfaceComplexityMetrics,
  actual: number,
  budget: number,
): SurfaceComplexityResult {
  return {
    actual,
    budget,
    metric,
    passed: actual <= budget,
  };
}
