#!/usr/bin/env node

import path from "node:path";

export function buildReviewSteps(context) {
  return [
    {
      args: ["check"],
      command: "pnpm",
      id: "check",
      title: "Project Check",
    },
    {
      args: ["e2e:ui-actions"],
      artifacts: uiActionArtifacts(context, "ui-actions-e2e"),
      command: "pnpm",
      env: {
        UI_ACTION_AUDIT_OUTPUT_DIR: artifactDir(context, "ui-actions-e2e"),
      },
      id: "ui-actions-e2e",
      title: "UI Action Audit E2E",
    },
    {
      args: ["e2e:surface-complexity"],
      artifacts: surfaceComplexityArtifacts(context, "surface-complexity-budget-e2e"),
      command: "pnpm",
      env: {
        UI_COMPLEXITY_OUTPUT_DIR: artifactDir(context, "surface-complexity-budget-e2e"),
      },
      id: "surface-complexity-budget-e2e",
      title: "Surface Complexity Budget",
    },
    bookCinemaStep(context, {
      id: "workspace-flow-e2e",
      script: "e2e:workspace-flow",
      title: "Workspace Flow E2E",
    }),
    bookCinemaStep(context, {
      id: "settings-ia-e2e",
      script: "e2e:settings-ia",
      title: "Settings IA E2E",
    }),
    bookCinemaStep(context, {
      id: "reader-wayfinding-e2e",
      script: "e2e:reader-wayfinding",
      title: "Reader Wayfinding E2E",
    }),
    bookCinemaStep(context, {
      id: "book-cinema-e2e",
      script: "e2e:book-cinema",
      title: "Book Cinema E2E",
    }),
    {
      args: ["e2e:read-along-fidelity"],
      artifacts: readAlongFidelityArtifacts(context, "read-along-fidelity-e2e"),
      command: "pnpm",
      env: {
        E2E_READ_ALONG_OUTPUT_DIR: artifactDir(context, "read-along-fidelity-e2e"),
      },
      id: "read-along-fidelity-e2e",
      title: "Read-along Fidelity E2E",
    },
    {
      args: ["e2e:readalong-sync"],
      artifacts: readAlongSyncArtifacts(context, "readalong-sync-e2e"),
      command: "pnpm",
      env: {
        E2E_READALONG_SYNC_OUTPUT_DIR: artifactDir(context, "readalong-sync-e2e"),
      },
      id: "readalong-sync-e2e",
      title: "Read-along Sync E2E",
    },
    {
      args: ["e2e:golden-minute"],
      artifacts: goldenMinuteArtifacts(context, "golden-minute-e2e"),
      command: "pnpm",
      env: {
        E2E_GOLDEN_MINUTE_OUTPUT_DIR: artifactDir(context, "golden-minute-e2e"),
      },
      id: "golden-minute-e2e",
      title: "Golden Minute E2E",
    },
    bookCinemaStep(context, {
      id: "book-cinema-responsive-e2e",
      script: "e2e:book-cinema:responsive",
      title: "Book Cinema Responsive E2E",
    }),
    bookCinemaStep(context, {
      id: "book-cinema-low-resource-e2e",
      includePerformanceArtifacts: true,
      script: "e2e:book-cinema:low-resource",
      title: "Book Cinema Low-resource E2E",
    }),
    {
      args: ["e2e:accessibility-audit"],
      artifacts: accessibilityArtifacts(context, "accessibility-audit-e2e"),
      command: "pnpm",
      env: {
        E2E_ACCESSIBILITY_FINDINGS_PATH: path.join(
          artifactDir(context, "accessibility-audit-e2e"),
          "a11y-findings.json",
        ),
        E2E_ACCESSIBILITY_OUTPUT_DIR: artifactDir(context, "accessibility-audit-e2e"),
      },
      id: "accessibility-audit-e2e",
      title: "Accessibility Audit E2E",
    },
    {
      args: ["e2e:responsive-snapshots"],
      artifacts: responsiveSnapshotArtifacts(context, "responsive-snapshots-e2e"),
      command: "pnpm",
      env: {
        E2E_RESPONSIVE_OUTPUT_DIR: artifactDir(context, "responsive-snapshots-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: artifactDir(context, "responsive-snapshots-e2e"),
      },
      id: "responsive-snapshots-e2e",
      title: "Responsive Snapshot E2E",
    },
    {
      args: ["e2e:command-palette"],
      artifacts: commandPaletteArtifacts(context, "command-palette-e2e"),
      command: "pnpm",
      env: {
        E2E_COMMAND_PALETTE_OUTPUT_DIR: artifactDir(context, "command-palette-e2e"),
      },
      id: "command-palette-e2e",
      title: "Command Palette E2E",
    },
    {
      args: ["e2e:teleprompt-memory"],
      artifacts: telepromptMemoryArtifacts(context, "teleprompt-memory-e2e"),
      command: "pnpm",
      env: {
        E2E_TELEPROMPT_MEMORY_OUTPUT_DIR: artifactDir(context, "teleprompt-memory-e2e"),
      },
      id: "teleprompt-memory-e2e",
      title: "Teleprompt Memory E2E",
    },
    {
      args: ["e2e:context-panel"],
      artifacts: contextPanelArtifacts(context, "context-panel-e2e"),
      command: "pnpm",
      env: {
        E2E_CONTEXT_PANEL_OUTPUT_DIR: artifactDir(context, "context-panel-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: artifactDir(context, "context-panel-e2e"),
      },
      id: "context-panel-e2e",
      title: "Context Panel E2E",
    },
    {
      args: ["validate:ux-final"],
      artifacts: finalUxGateArtifacts(context, "final-ux-gates"),
      command: "pnpm",
      env: {
        FINAL_UX_GATES_OUTPUT_DIR: artifactDir(context, "final-ux-gates"),
      },
      id: "final-ux-gates",
      title: "Final UX Gates",
    },
    {
      args: ["validate:local"],
      artifacts: {
        htmlReport: path.join(artifactDir(context, "validate-local"), "report.html"),
        markdownReport: path.join(artifactDir(context, "validate-local"), "report.md"),
        summary: path.join(artifactDir(context, "validate-local"), "summary.json"),
      },
      command: "pnpm",
      env: {
        VALIDATE_LOCAL_OUTPUT_DIR: artifactDir(context, "validate-local"),
      },
      id: "validate-local",
      title: "Validate Local",
    },
  ];
}

function bookCinemaStep(context, { id, includePerformanceArtifacts = false, script, title }) {
  const stepArtifactDir = artifactDir(context, id);
  const artifacts = {
    e2eSummary: path.join(stepArtifactDir, "summary.json"),
    screenshots: path.join(stepArtifactDir, "screenshots"),
    screenshotStateManifest: path.join(stepArtifactDir, "manifest.json"),
    screenshotStateMismatches: path.join(stepArtifactDir, "state-mismatches.md"),
  };
  const env = {
    E2E_ARTIFACT_DIR: stepArtifactDir,
    E2E_SCREENSHOT_DIR: path.join(stepArtifactDir, "screenshots"),
    E2E_SCREENSHOT_STATE_OUTPUT_DIR: stepArtifactDir,
    E2E_SUMMARY_PATH: path.join(stepArtifactDir, "summary.json"),
  };
  if (includePerformanceArtifacts) {
    const performanceDir = path.join(stepArtifactDir, "performance");
    env.E2E_PERFORMANCE_ARTIFACT_DIR = performanceDir;
    artifacts.lowResourceBudgetFailures = path.join(performanceDir, "budget-failures.md");
    artifacts.lowResourceDegradedStates = path.join(performanceDir, "degraded-states.md");
    artifacts.lowResourceFixtureCoverage = path.join(performanceDir, "fixture-coverage.json");
    artifacts.lowResourceInteractionBudget = path.join(performanceDir, "interaction-budget.md");
    artifacts.lowResourceReaderResume = path.join(performanceDir, "reader-resume.json");
    artifacts.lowResourceTiming = path.join(performanceDir, "timing.json");
    artifacts.lowResourceWaiverBurndown = path.join(performanceDir, "waiver-burndown.md");
    artifacts.lowResourceWaiverBurndownJson = path.join(performanceDir, "waiver-burndown.json");
  }
  return {
    args: [script],
    artifacts,
    command: "pnpm",
    env,
    id,
    title,
  };
}

function uiActionArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    actionInventory: path.join(dir, "action-inventory.json"),
    actionResults: path.join(dir, "action-results.json"),
    deadControls: path.join(dir, "dead-controls.md"),
    duplicates: path.join(dir, "duplicates.md"),
    reviewerSummary: path.join(dir, "reviewer-summary.md"),
    screenshots: path.join(dir, "screenshots"),
    summary: path.join(dir, "summary.json"),
    websiteExtractionQuality: path.join(dir, "website-extraction-quality.json"),
  };
}

function surfaceComplexityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    budgetJson: path.join(dir, "budget.json"),
    budgetReport: path.join(dir, "budget.md"),
  };
}

function accessibilityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    accessibilityFindings: path.join(dir, "a11y-findings.json"),
    accessibilityReport: path.join(dir, "accessibility-report.md"),
    accessibilityResults: path.join(dir, "accessibility-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function responsiveSnapshotArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    responsiveResults: path.join(dir, "responsive-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function commandPaletteArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    commandPaletteReport: path.join(dir, "command-palette-report.md"),
    commandPaletteResults: path.join(dir, "command-palette-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function readAlongFidelityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    readAlongReport: path.join(dir, "read-along-fidelity-report.md"),
    readAlongResults: path.join(dir, "read-along-fidelity-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function readAlongSyncArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    screenshots: path.join(dir, "screenshots"),
    syncMetrics: path.join(dir, "sync-metrics.json"),
    syncSummary: path.join(dir, "sync-summary.md"),
    syncTimeline: path.join(dir, "drift-timeline.json"),
  };
}

function goldenMinuteArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    artifactCompatibilityReport: path.join(dir, "artifact-compatibility-report.md"),
    artifactCompatibilityResults: path.join(dir, "artifact-compatibility-report.json"),
    audioCurrentTimeTimeline: path.join(dir, "audio-current-time-timeline.json"),
    driftTimeline: path.join(dir, "drift-timeline.json"),
    goldenMinuteReport: path.join(dir, "golden-minute-report.md"),
    goldenMinuteResults: path.join(dir, "golden-minute-results.json"),
    goldenMinuteSync: path.join(dir, "golden-minute-sync.json"),
    segmentBoundaryReport: path.join(dir, "segment-boundary-report.md"),
    segmentBoundaryResults: path.join(dir, "segment-boundary-report.json"),
    speechFluencyReport: path.join(dir, "speech-fluency-report.md"),
    speechFluencyResults: path.join(dir, "speech-fluency-report.json"),
    screenshots: path.join(dir, "screenshots"),
    visualHighlightTimeline: path.join(dir, "visual-highlight-timeline.json"),
    visualTimeline: path.join(dir, "visual-timeline.md"),
    visualTimelineResults: path.join(dir, "visual-timeline.json"),
  };
}

function telepromptMemoryArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    screenshots: path.join(dir, "screenshots"),
    telepromptMemoryReport: path.join(dir, "teleprompt-memory-report.md"),
    telepromptMemoryResults: path.join(dir, "teleprompt-memory-results.json"),
  };
}

function contextPanelArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    contextPanelReport: path.join(dir, "context-panel-report.md"),
    contextPanelResults: path.join(dir, "context-panel-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalUxGateArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    finalUxResults: path.join(dir, "final-ux-results.json"),
    finalUxSummary: path.join(dir, "final-ux-summary.md"),
  };
}

function artifactDir(context, id) {
  return path.join(context.artifactsDir, id);
}
