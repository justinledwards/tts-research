import { describe, expect, it } from "vitest";
import {
  evaluateSurfaceComplexity,
  SURFACE_COMPLEXITY_BUDGETS,
  surfaceComplexityBudgetFor,
  type SurfaceComplexityMetrics,
} from "./surfaceComplexity";
import {
  auditTemporaryActionPlacements,
  TEMPORARY_ACTION_IDS,
  TEMPORARY_ACTION_INVENTORY,
  TEMPORARY_ACTION_OWNERSHIP,
  temporaryActionOwnershipFor,
  temporaryComplexityBudgetForState,
  temporaryDisabledReasonFor,
  temporaryDuplicateLabelCounts,
  type TemporaryActionPlacement,
} from "./temporarySurfaceBudget";

describe("temporary surface complexity budget", () => {
  it("keeps the temporary action inventory explicit", () => {
    expect(TEMPORARY_ACTION_INVENTORY.map((item) => item.id)).toEqual(TEMPORARY_ACTION_IDS);
    expect(TEMPORARY_ACTION_INVENTORY.map((item) => item.label)).toEqual([
      "Quick Listen",
      "Create temporary source",
      "Keep in project",
      "Discard temporary source",
      "Extend expiry",
      "Re-extract",
      "Create audio",
      "Retry generation",
      "Open Theatre/Cinema",
      "Clear expired temporary sources",
      "Temporary Settings",
      "Temporary Diagnostics",
    ]);
  });

  it("assigns each temporary action to predictable owner surfaces", () => {
    expect(temporaryActionOwnershipFor("quick-listen")).toMatchObject({
      allowedSurfaces: ["shell", "empty-workspace", "command-palette"],
      primarySurfaces: ["shell"],
    });
    expect(temporaryActionOwnershipFor("keep-in-project")).toMatchObject({
      allowedSurfaces: [
        "temporary-source-header",
        "inspector",
        "command-center-shelf",
        "cinema-more",
      ],
    });
    expect(temporaryActionOwnershipFor("clear-expired")).toMatchObject({
      allowedSurfaces: ["command-center-shelf", "settings"],
      forbiddenSurfaces: ["workbench"],
    });
    expect(
      TEMPORARY_ACTION_OWNERSHIP.find((item) => item.actionId === "temporary-diagnostics")
        ?.primarySurfaces,
    ).toEqual([]);
  });

  it("normalizes duplicate labels and flags duplicate primary temporary controls", () => {
    const placements = [
      placement("keep-in-project", "Keep in Project", "temporary-source-header", "primary"),
      placement("keep-in-project", "Keep in project", "inspector", "primary"),
    ];

    expect(temporaryDuplicateLabelCounts(placements)).toMatchObject({
      "keep in project": 2,
    });
    expect(auditTemporaryActionPlacements(placements)).toContainEqual(
      expect.objectContaining({
        code: "duplicate-primary-label",
        label: "keep in project",
      }),
    );
  });

  it("allows intentional secondary duplication across the shelf and Cinema More", () => {
    const issues = auditTemporaryActionPlacements([
      placement("discard", "Discard temporary source", "temporary-source-header", "primary"),
      placement("discard", "Discard temporary source", "command-center-shelf", "secondary", {
        duplicateReason: "Management shelf repeats the active temporary session action.",
      }),
      placement("discard", "Discard temporary source", "cinema-more", "secondary", {
        duplicateReason: "Cinema More keeps the action available on narrow screens.",
      }),
    ]);

    expect(issues).toEqual([]);
  });

  it("flags forbidden surfaces, palette-only paths, and disabled actions without reasons", () => {
    const issues = auditTemporaryActionPlacements([
      placement("clear-expired", "Clear expired temporary sources", "workbench", "secondary"),
      placement("keep-in-project", "Keep in project", "command-palette", "secondary"),
      placement("discard", "Discard temporary source", "temporary-source-header", "secondary", {
        disabled: true,
      }),
    ]);

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "forbidden-surface",
        "command-palette-only",
        "disabled-without-reason",
      ]),
    );
  });

  it("publishes disabled-action copy for recoverable temporary states", () => {
    expect(temporaryDisabledReasonFor("keep-in-project")).toContain("work exists to make durable");
    expect(temporaryDisabledReasonFor("retry-audio")).toContain("generation fails");
    expect(temporaryDisabledReasonFor("clear-expired")).toBe(
      "No expired temporary sources are ready to clear.",
    );
  });

  it("updates complexity thresholds for temporary source states", () => {
    expect(temporaryComplexityBudgetForState("read-calm")).toMatchObject({
      allowDiagnosticsByDefault: false,
      maxPrimaryTemporaryActions: 0,
      maxTemporaryPromotionPrimaryActions: 0,
    });
    expect(temporaryComplexityBudgetForState("diagnostics-advanced")).toMatchObject({
      allowDiagnosticsByDefault: true,
    });

    const budget = surfaceComplexityBudgetFor("website-cinema-temporary-read", "WebsiteCinema");
    expect(budget).toBe(SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm);
    expect(budget.maxTemporaryDiagnosticsDefaultVisible).toBe(0);
  });

  it("fails calm temporary read mode when diagnostics or primary promotion controls appear", () => {
    const metrics: SurfaceComplexityMetrics = {
      activeModesTabs: 1,
      averageAccessibleLabelLength: 18,
      chipsBadges: 1,
      destructiveActions: 0,
      disabledActions: 0,
      duplicatedVisibleLabels: 0,
      panelsOpenByDefault: 0,
      primaryActions: 2,
      reachableDrawersSheets: 2,
      temporaryActions: 3,
      temporaryDiagnosticsDefaultVisible: 1,
      temporaryPrimaryActions: 1,
      temporaryPromotionPrimaryActions: 1,
      visibleActions: 12,
    };

    const failures = evaluateSurfaceComplexity(
      metrics,
      SURFACE_COMPLEXITY_BUDGETS.websiteReadCalm,
    ).filter((result) => !result.passed);

    expect(failures.map((failure) => failure.metric)).toEqual(
      expect.arrayContaining([
        "temporaryActions",
        "temporaryDiagnosticsDefaultVisible",
        "temporaryPrimaryActions",
        "temporaryPromotionPrimaryActions",
      ]),
    );
  });
});

function placement(
  actionId: TemporaryActionPlacement["actionId"],
  label: string,
  surfaceId: TemporaryActionPlacement["surfaceId"],
  priority: TemporaryActionPlacement["priority"],
  overrides: Partial<TemporaryActionPlacement> = {},
): TemporaryActionPlacement {
  return {
    actionId,
    label,
    priority,
    surfaceId,
    visible: true,
    ...overrides,
  };
}
