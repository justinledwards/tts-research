import { describe, expect, it } from "vitest";
import {
  evaluateSurfaceComplexity,
  SURFACE_COMPLEXITY_BUDGETS,
  surfaceComplexityBudgetFor,
  type SurfaceComplexityMetrics,
} from "./surfaceComplexity";

describe("surface complexity budgets", () => {
  it("uses a stricter calm budget for Website Cinema read mode", () => {
    const budget = surfaceComplexityBudgetFor("website-cinema", "WebsiteCinema");

    expect(budget).toBe(SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm);
    expect(budget.maxVisibleActions).toBeLessThan(
      SURFACE_COMPLEXITY_BUDGETS.readMode.maxVisibleActions,
    );
    expect(budget.maxPanelCount).toBe(0);
    expect(budget.maxInlineDisplaySettings).toBe(0);
  });

  it("flags expanded Website Cinema details in calm read mode", () => {
    const metrics: SurfaceComplexityMetrics = {
      activeModesTabs: 1,
      averageAccessibleLabelLength: 18,
      chipsBadges: 1,
      destructiveActions: 0,
      disabledActions: 0,
      duplicatedVisibleLabels: 0,
      expandedPolicySourceDetails: 1,
      footerRows: 1,
      headerLines: 3,
      inlineDisplaySettings: 0,
      modeControlGroups: 1,
      panelsOpenByDefault: 1,
      panelCount: 0,
      primaryActions: 2,
      primaryPlaybackGroups: 1,
      reachableDrawersSheets: 2,
      sourceIdentitySummaries: 1,
      visibleActions: 12,
      visibleBadges: 1,
    };

    const failure = evaluateSurfaceComplexity(
      metrics,
      SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm,
    ).find((result) => result.metric === "expandedPolicySourceDetails");

    expect(failure).toMatchObject({ actual: 1, budget: 0, passed: false });
  });
});
