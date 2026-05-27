import type { UiActionSurface } from "./actionScopes";

export type SurfaceComplexityTier = "calm" | "standard" | "dense" | "advanced";

export interface SurfaceComplexityMetrics {
  readonly activeModesTabs: number;
  readonly averageAccessibleLabelLength: number;
  readonly chipsBadges: number;
  readonly destructiveActions: number;
  readonly disabledActions: number;
  readonly duplicatedVisibleLabels: number;
  readonly expandedPolicySourceDetails?: number;
  readonly footerRows?: number;
  readonly headerLines?: number;
  readonly inlineDisplaySettings?: number;
  readonly modeControlGroups?: number;
  readonly panelsOpenByDefault: number;
  readonly panelCount?: number;
  readonly primaryPlaybackGroups?: number;
  readonly primaryActions: number;
  readonly reachableDrawersSheets: number;
  readonly sourceIdentitySummaries?: number;
  readonly visibleBadges?: number;
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
  readonly maxExpandedPolicySourceDetails?: number;
  readonly maxFooterRows?: number;
  readonly maxHeaderLines?: number;
  readonly maxInlineDisplaySettings?: number;
  readonly maxModeControlGroups?: number;
  readonly maxPanelsOpenByDefault: number;
  readonly maxPanelCount?: number;
  readonly maxPrimaryPlaybackGroups?: number;
  readonly maxPrimaryActions: number;
  readonly maxReachableDrawersSheets: number;
  readonly maxSourceIdentitySummaries?: number;
  readonly maxVisibleBadges?: number;
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
  commandSearch: {
    maxActiveModesTabs: 4,
    maxAverageAccessibleLabelLength: 80,
    maxChipsBadges: 16,
    maxDestructiveActions: 0,
    maxDisabledActions: 4,
    maxDuplicatedVisibleLabels: 1,
    maxPanelsOpenByDefault: 3,
    maxPrimaryActions: 4,
    maxReachableDrawersSheets: 14,
    maxVisibleActions: 24,
    notes: [
      "Command search may show filters, search input, and a bounded result list.",
      "WP65 cross-audit prevents required tasks from existing only in command search.",
    ],
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
  readModeMoreMenu: {
    maxActiveModesTabs: 10,
    maxAverageAccessibleLabelLength: 40,
    maxChipsBadges: 40,
    maxDestructiveActions: 0,
    maxDisabledActions: 4,
    maxDuplicatedVisibleLabels: 2,
    maxPanelsOpenByDefault: 6,
    maxPrimaryActions: 10,
    maxReachableDrawersSheets: 8,
    maxVisibleActions: 25,
    notes: ["Cinema More may expose display, advanced, and navigation entry points on demand."],
    tier: "calm",
  },
  websiteReadCalm: {
    maxActiveModesTabs: 6,
    maxAverageAccessibleLabelLength: 36,
    maxChipsBadges: 10,
    maxDestructiveActions: 0,
    maxDisabledActions: 2,
    maxDuplicatedVisibleLabels: 1,
    maxExpandedPolicySourceDetails: 0,
    maxFooterRows: 3,
    maxHeaderLines: 3,
    maxInlineDisplaySettings: 0,
    maxModeControlGroups: 1,
    maxPanelsOpenByDefault: 3,
    maxPanelCount: 0,
    maxPrimaryActions: 6,
    maxPrimaryPlaybackGroups: 1,
    maxReachableDrawersSheets: 4,
    maxSourceIdentitySummaries: 1,
    maxVisibleActions: 16,
    maxVisibleBadges: 2,
    notes: [
      "Website Cinema Read mode keeps one source summary, one mode group, and one playback group visible.",
      "Source, policy, provenance, and display details stay available through Inspect or popovers.",
    ],
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
  settingsDeep: {
    maxActiveModesTabs: 16,
    maxAverageAccessibleLabelLength: 90,
    maxChipsBadges: 80,
    maxDestructiveActions: 4,
    maxDisabledActions: 8,
    maxDuplicatedVisibleLabels: 4,
    maxPanelsOpenByDefault: 12,
    maxPrimaryActions: 20,
    maxReachableDrawersSheets: 8,
    maxVisibleActions: 56,
    notes: [
      "Dedicated settings panes may expose persisted preference controls when grouped by scope and reset/export affordances remain explicit.",
    ],
    tier: "dense",
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
  "book-more-menu": SURFACE_COMPLEXITY_BUDGETS.readModeMoreMenu,
  "book-pdf-pre-audio": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "command-palette": SURFACE_COMPLEXITY_BUDGETS.commandSearch,
  "document-cinema": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "mobile-more-sheet": SURFACE_COMPLEXITY_BUDGETS.readMode,
  "pinned-inspector": SURFACE_COMPLEXITY_BUDGETS.debugAdvanced,
  "preview-mini-player": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "project-dashboard": SURFACE_COMPLEXITY_BUDGETS.workspace,
  "settings-open": SURFACE_COMPLEXITY_BUDGETS.settingsQuick,
  "settings-speech-policy": SURFACE_COMPLEXITY_BUDGETS.settingsQuick,
  "settings-ui-memory": SURFACE_COMPLEXITY_BUDGETS.settingsDeep,
  "voice-dashboard": SURFACE_COMPLEXITY_BUDGETS.commandPalette,
  "website-cinema": SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm,
  "website-cinema-calm-read": SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm,
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
  const results = [
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
  appendOptionalResult(results, "visibleBadges", metrics.visibleBadges, budget.maxVisibleBadges);
  appendOptionalResult(results, "headerLines", metrics.headerLines, budget.maxHeaderLines);
  appendOptionalResult(results, "footerRows", metrics.footerRows, budget.maxFooterRows);
  appendOptionalResult(results, "panelCount", metrics.panelCount, budget.maxPanelCount);
  appendOptionalResult(
    results,
    "primaryPlaybackGroups",
    metrics.primaryPlaybackGroups,
    budget.maxPrimaryPlaybackGroups,
  );
  appendOptionalResult(
    results,
    "sourceIdentitySummaries",
    metrics.sourceIdentitySummaries,
    budget.maxSourceIdentitySummaries,
  );
  appendOptionalResult(
    results,
    "modeControlGroups",
    metrics.modeControlGroups,
    budget.maxModeControlGroups,
  );
  appendOptionalResult(
    results,
    "inlineDisplaySettings",
    metrics.inlineDisplaySettings,
    budget.maxInlineDisplaySettings,
  );
  appendOptionalResult(
    results,
    "expandedPolicySourceDetails",
    metrics.expandedPolicySourceDetails,
    budget.maxExpandedPolicySourceDetails,
  );
  return results;
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
  if (surface === "WebsiteCinema") {
    return SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm;
  }
  if (surface === "BookCinema" || surface === "DocumentCinema") {
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

function appendOptionalResult(
  results: SurfaceComplexityResult[],
  metric: keyof SurfaceComplexityMetrics,
  actual: number | undefined,
  budget: number | undefined,
): void {
  if (typeof budget === "number") {
    results.push(result(metric, actual ?? 0, budget));
  }
}
