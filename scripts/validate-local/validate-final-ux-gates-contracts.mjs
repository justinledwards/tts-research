import path from "node:path";

export const PASSING_GATE_STATUSES = new Set(["passed", "passed-with-findings"]);
export const UI_ACTION_AUDIT_SEVERITIES = ["blocking", "needs-review", "waived", "informational"];
export const UI_ACTION_AUDIT_THRESHOLDS = {
  duplicateGroups: 0,
  missingStableTestIds: 0,
};
export const CINEMA_MORE_REQUIRED_SECTIONS = [
  "display",
  "theatre",
  "advanced",
  "diagnostics",
  "help-shortcuts",
];
export const CINEMA_MORE_SURFACE_SCENARIOS = new Map([
  ["BookCinema", "book-more-menu"],
  ["DocumentCinema", "document-more-menu"],
  ["WebsiteCinema", "website-more-menu"],
]);
export const CINEMA_MORE_ACTION_BUDGETS = new Map([
  ["BookCinema", { max: 10, min: 8 }],
  ["DocumentCinema", { max: 10, min: 8 }],
  ["WebsiteCinema", { max: 10, min: 8 }],
]);
export const CINEMA_MORE_PRIMARY_LABELS = new Set([
  "Bookmark",
  "Debug",
  "Display",
  "Inspect",
  "Open reader display settings",
  "Pause",
  "Play",
  "Playback speed",
  "Read",
  "Restart",
  "Review",
  "+10s",
  "-10s",
]);

export function finalUxArtifactPaths(artifactsDir) {
  return {
    accessibilityResults: path.join(
      artifactsDir,
      "accessibility-audit",
      "accessibility-results.json",
    ),
    actionInventory: path.join(artifactsDir, "ui-actions", "action-inventory.json"),
    actionResults: path.join(artifactsDir, "ui-actions", "action-results.json"),
    uiActionSummary: path.join(artifactsDir, "ui-actions", "summary.json"),
    commandPaletteReport: path.join(artifactsDir, "command-palette", "command-palette-report.md"),
    commandPaletteResults: path.join(
      artifactsDir,
      "command-palette",
      "command-palette-results.json",
    ),
    contextPanelResults: path.join(artifactsDir, "context-panel", "context-panel-results.json"),
    readalongSyncMetrics: path.join(artifactsDir, "readalong-sync", "sync-metrics.json"),
    readalongSyncSummary: path.join(artifactsDir, "readalong-sync", "sync-summary.md"),
    readalongSyncTimeline: path.join(artifactsDir, "readalong-sync", "drift-timeline.json"),
    responsiveResults: path.join(artifactsDir, "responsive-snapshots", "responsive-results.json"),
    surfaceComplexityBudget: path.join(artifactsDir, "surface-complexity", "budget.json"),
    telepromptMemoryReport: path.join(
      artifactsDir,
      "teleprompt-memory",
      "teleprompt-memory-report.md",
    ),
    telepromptMemoryResults: path.join(
      artifactsDir,
      "teleprompt-memory",
      "teleprompt-memory-results.json",
    ),
  };
}

export function finalUiActionArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "ui-actions");
  return {
    actionInventory: path.join(dir, "action-inventory.json"),
    actionResults: path.join(dir, "action-results.json"),
    deadControls: path.join(dir, "dead-controls.md"),
    duplicates: path.join(dir, "duplicates.md"),
    overlayCollisions: path.join(dir, "overlay-collisions.json"),
    reviewerSummary: path.join(dir, "reviewer-summary.md"),
    screenshots: path.join(dir, "screenshots"),
    summary: path.join(dir, "summary.json"),
  };
}

export function finalTelepromptArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "teleprompt-memory");
  return {
    screenshots: path.join(dir, "screenshots"),
    telepromptMemoryReport: path.join(dir, "teleprompt-memory-report.md"),
    telepromptMemoryResults: path.join(dir, "teleprompt-memory-results.json"),
  };
}

export function finalReadAlongSyncArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "readalong-sync");
  return {
    screenshots: path.join(dir, "screenshots"),
    syncMetrics: path.join(dir, "sync-metrics.json"),
    syncSummary: path.join(dir, "sync-summary.md"),
    syncTimeline: path.join(dir, "drift-timeline.json"),
  };
}

export function finalAccessibilityArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "accessibility-audit");
  return {
    accessibilityFindings: path.join(dir, "a11y-findings.json"),
    accessibilityReport: path.join(dir, "accessibility-report.md"),
    accessibilityResults: path.join(dir, "accessibility-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

export function finalResponsiveArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "responsive-snapshots");
  return {
    responsiveResults: path.join(dir, "responsive-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

export function finalCommandPaletteArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "command-palette");
  return {
    commandPaletteReport: path.join(dir, "command-palette-report.md"),
    commandPaletteResults: path.join(dir, "command-palette-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

export function finalContextPanelArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "context-panel");
  return {
    contextPanelReport: path.join(dir, "context-panel-report.md"),
    contextPanelResults: path.join(dir, "context-panel-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

export function finalSurfaceComplexityArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "surface-complexity");
  return {
    budgetJson: path.join(dir, "budget.json"),
    budgetReport: path.join(dir, "budget.md"),
  };
}
