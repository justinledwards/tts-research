#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { startLocalServices } from "../e2e-browser-qa-helpers.mjs";
import {
  evaluateReadAlongSyncFixtures,
  loadReadAlongSyncFixtures,
} from "../readalong-sync-evidence.mjs";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./benchmarks.mjs";
import { runFrontendBundleBenchmark } from "./frontend-performance.mjs";
import { createRunContext, finalizeRun, runCallbackStep, runCommandStep } from "./reporting.mjs";
import {
  attachAccessibilityGateSummary,
  attachAccessibilitySummary,
  attachCommandPaletteSummary,
  attachContextPanelSummary,
  attachResponsiveCinemaSummary,
  attachResponsiveSnapshotsSummary,
  attachReaderTimingBudgets,
  attachSurfaceComplexitySummary,
  attachTelepromptMemorySummary,
  attachUiActionInventorySummary,
  getAvailableWorkers,
  parseBoolean,
  parseLane,
  parsePositiveInteger,
  persistValidationRuntimeHistory,
  resolveParallelism,
  runCommandBatch,
  runRuntimeRegressionGuard,
} from "./validate-local-helpers.mjs";
import {
  fastCommandBatchA,
  fastCommandBatchB,
  packageBuildStep,
  releaseCommandSteps,
} from "./validate-local-workflow.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const lane = parseLane(args, process.env.VALIDATE_LOCAL_LANE);
const runFastLane = lane === "fast" || lane === "release";
const runE2ELane = lane === "e2e" || lane === "release";
const runReleaseLane = lane === "release";
const runQuickLane = parseBoolean(args, "quick", process.env.VALIDATE_LOCAL_QUICK);
const packageBuildInParallel = process.env.VALIDATE_LOCAL_SKIP_PACKAGE_BUILD !== "1";
const enforceRuntimeRegressionGuard = parseBoolean(
  args,
  "guard-regressions",
  process.env.VALIDATE_LOCAL_GUARD_REGRESSIONS,
);
const runtimeRegressionWindow =
  parsePositiveInteger(process.env.VALIDATE_LOCAL_REGRESSION_WINDOW) ?? 12;
const runtimeHistoryPath = path.join(rootDir, "output", "validate-local", "summary-history.json");
const fastCommandConcurrency = resolveParallelism(
  args,
  process.env.VALIDATE_LOCAL_PARALLELISM,
  runQuickLane ? 2 : Math.max(2, Math.min(6, getAvailableWorkers())),
);

const context = await createRunContext({ kind: `validate-local:${lane}`, rootDir });
const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);

if (runFastLane) {
  await runCommandBatch(context, fastCommandBatchA, {
    concurrency: Math.min(2, fastCommandConcurrency),
  });

  if (packageBuildInParallel) {
    await runCommandStep(context, packageBuildStep);
  }

  await runCommandBatch(context, fastCommandBatchB, {
    concurrency: fastCommandConcurrency,
  });

  await runCallbackStep(
    context,
    {
      id: "readalong-sync-benchmark",
      title: "Read-along Sync Benchmark",
      command: "read-along sync benchmark",
    },
    async () => {
      const fixtureSet = await loadReadAlongSyncFixtures(rootDir, manifest.readAlongSync);
      const result = evaluateReadAlongSyncFixtures({
        fixtures: fixtureSet.fixtures,
        thresholds: thresholds.readAlongSync,
      });
      return {
        metrics: result.metrics,
        output: `Read-along sync benchmark ${result.status}`,
        thresholds: result.comparisons,
      };
    },
  );
}

for (const step of runReleaseLane ? releaseCommandSteps : []) {
  await runCommandStep(context, step);
}

if (runReleaseLane) {
  await runCallbackStep(
    context,
    {
      id: "frontend-bundle-performance",
      title: "Frontend Bundle Performance",
      command: "pnpm bundle:local",
    },
    ({ log }) => runFrontendBundleBenchmark({ rootDir, thresholds, log }),
  );

  await runCallbackStep(
    context,
    {
      id: "alignment-benchmark",
      title: "Alignment Benchmark",
      command: "alignment benchmark",
    },
    () => runAlignmentBenchmark({ rootDir, manifest, thresholds }),
  );
}

let sharedE2EServices = null;
let sharedE2EEnv = {};

if (runE2ELane) {
  const serviceStep = await runCallbackStep(
    context,
    {
      id: "shared-e2e-services",
      title: "Shared E2E Services",
      command: "start mock backend and Vite once",
    },
    async () => {
      const artifactDir = path.join(context.artifactsDir, "shared-e2e-services");
      sharedE2EServices = await startLocalServices({ artifactDir, rootDir });
      sharedE2EEnv = {
        E2E_API_BASE_URL: sharedE2EServices.apiBaseUrl,
        E2E_APP_BASE_URL: sharedE2EServices.appBaseUrl,
        E2E_USE_EXISTING_SERVERS: "1",
      };
      return {
        artifacts: {
          backendLog: sharedE2EServices.backendLog,
          frontendLog: sharedE2EServices.frontendLog,
        },
        metrics: {
          apiBaseUrl: sharedE2EServices.apiBaseUrl,
          appBaseUrl: sharedE2EServices.appBaseUrl,
          reuseMode: "single-service-pair",
        },
      };
    },
  );

  if (serviceStep.status === "passed") {
    const bookCinemaStep = await runCommandStep(context, {
      id: "book-cinema-e2e",
      title: "Book Cinema E2E Smoke",
      command: "pnpm",
      args: ["e2e:book-cinema"],
      env: {
        ...sharedE2EEnv,
        E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-e2e"),
        E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(context.artifactsDir, "book-cinema-e2e"),
        E2E_SUMMARY_PATH: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
      },
      artifacts: {
        e2eSummary: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
        screenshotStateManifest: path.join(
          context.artifactsDir,
          "book-cinema-e2e",
          "manifest.json",
        ),
        screenshotStateMismatches: path.join(
          context.artifactsDir,
          "book-cinema-e2e",
          "state-mismatches.md",
        ),
        screenshots: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
      },
    });
    await attachReaderTimingBudgets(bookCinemaStep, thresholds);

    await runCommandStep(context, {
      id: "read-along-fidelity-e2e",
      title: "Read-along Fidelity E2E",
      command: "pnpm",
      args: ["e2e:read-along-fidelity"],
      env: {
        ...sharedE2EEnv,
        E2E_READ_ALONG_OUTPUT_DIR: path.join(context.artifactsDir, "read-along-fidelity-e2e"),
      },
      artifacts: {
        readAlongReport: path.join(
          context.artifactsDir,
          "read-along-fidelity-e2e",
          "read-along-fidelity-report.md",
        ),
        readAlongResults: path.join(
          context.artifactsDir,
          "read-along-fidelity-e2e",
          "read-along-fidelity-results.json",
        ),
        screenshots: path.join(context.artifactsDir, "read-along-fidelity-e2e", "screenshots"),
      },
    });

    await runCommandStep(context, {
      id: "readalong-sync-e2e",
      title: "Read-along Sync E2E",
      command: "pnpm",
      args: ["e2e:readalong-sync"],
      env: {
        ...sharedE2EEnv,
        E2E_READALONG_SYNC_OUTPUT_DIR: path.join(context.artifactsDir, "readalong-sync-e2e"),
      },
      artifacts: {
        screenshots: path.join(context.artifactsDir, "readalong-sync-e2e", "screenshots"),
        syncMetrics: path.join(context.artifactsDir, "readalong-sync-e2e", "sync-metrics.json"),
        syncSummary: path.join(context.artifactsDir, "readalong-sync-e2e", "sync-summary.md"),
        syncTimeline: path.join(context.artifactsDir, "readalong-sync-e2e", "drift-timeline.json"),
      },
    });

    const responsiveCinemaStep = await runCommandStep(context, {
      id: "book-cinema-responsive-e2e",
      title: "Book Cinema Responsive E2E Smoke",
      command: "pnpm",
      args: ["e2e:book-cinema:responsive"],
      env: {
        ...sharedE2EEnv,
        E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-responsive-e2e"),
        E2E_SCREENSHOT_DIR: path.join(
          context.artifactsDir,
          "book-cinema-responsive-e2e",
          "screenshots",
        ),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(
          context.artifactsDir,
          "book-cinema-responsive-e2e",
        ),
        E2E_SUMMARY_PATH: path.join(
          context.artifactsDir,
          "book-cinema-responsive-e2e",
          "summary.json",
        ),
      },
      artifacts: {
        e2eSummary: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "summary.json"),
        screenshotStateManifest: path.join(
          context.artifactsDir,
          "book-cinema-responsive-e2e",
          "manifest.json",
        ),
        screenshotStateMismatches: path.join(
          context.artifactsDir,
          "book-cinema-responsive-e2e",
          "state-mismatches.md",
        ),
        screenshots: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "screenshots"),
      },
    });
    await attachResponsiveCinemaSummary(responsiveCinemaStep);

    const accessibilityStep = await runCommandStep(context, {
      id: "accessibility-audit-e2e",
      title: "Accessibility Audit E2E",
      command: "pnpm",
      args: ["e2e:accessibility-audit"],
      env: {
        ...sharedE2EEnv,
        E2E_ACCESSIBILITY_OUTPUT_DIR: path.join(context.artifactsDir, "accessibility-audit-e2e"),
      },
      artifacts: {
        accessibilityResults: path.join(
          context.artifactsDir,
          "accessibility-audit-e2e",
          "accessibility-results.json",
        ),
        screenshots: path.join(context.artifactsDir, "accessibility-audit-e2e", "screenshots"),
      },
    });
    await attachAccessibilitySummary(accessibilityStep);

    const responsiveSnapshotsStep = await runCommandStep(context, {
      id: "responsive-snapshots-e2e",
      title: "Responsive Snapshot E2E",
      command: "pnpm",
      args: ["e2e:responsive-snapshots"],
      env: {
        ...sharedE2EEnv,
        E2E_RESPONSIVE_OUTPUT_DIR: path.join(context.artifactsDir, "responsive-snapshots-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(
          context.artifactsDir,
          "responsive-snapshots-e2e",
        ),
      },
      artifacts: {
        responsiveResults: path.join(
          context.artifactsDir,
          "responsive-snapshots-e2e",
          "responsive-results.json",
        ),
        screenshotStateManifest: path.join(
          context.artifactsDir,
          "responsive-snapshots-e2e",
          "manifest.json",
        ),
        screenshotStateMismatches: path.join(
          context.artifactsDir,
          "responsive-snapshots-e2e",
          "state-mismatches.md",
        ),
        screenshots: path.join(context.artifactsDir, "responsive-snapshots-e2e", "screenshots"),
      },
    });
    await attachResponsiveSnapshotsSummary(responsiveSnapshotsStep);

    if (runReleaseLane) {
      const accessibilityGateArtifactsStep = await runCommandStep(context, {
        id: "accessibility-release-gate-artifacts",
        title: "Accessibility Release Gate Artifacts",
        command: "pnpm",
        args: ["build-accessibility-release-artifacts"],
        env: {
          ACCESSIBILITY_GATE_DIR: path.join(rootDir, "output", "accessibility", "latest"),
          ACCESSIBILITY_AUDIT_OUTPUT_DIR: path.join(
            context.artifactsDir,
            "accessibility-audit-e2e",
          ),
          E2E_ACCESSIBILITY_RESULTS_PATH: path.join(
            context.artifactsDir,
            "accessibility-audit-e2e",
            "accessibility-results.json",
          ),
          E2E_ACCESSIBILITY_FINDINGS_PATH: path.join(
            context.artifactsDir,
            "accessibility-audit-e2e",
            "a11y-findings.json",
          ),
          ACCESSIBILITY_RESPONSIVE_OUTPUT_DIR: path.join(
            context.artifactsDir,
            "responsive-snapshots-e2e",
          ),
          E2E_RESPONSIVE_RESULTS_PATH: path.join(
            context.artifactsDir,
            "responsive-snapshots-e2e",
            "responsive-results.json",
          ),
          E2E_RESPONSIVE_SCREENSHOTS_PATH: path.join(
            context.artifactsDir,
            "responsive-snapshots-e2e",
            "screenshots",
          ),
        },
        artifacts: {
          accessibilityGateFindings: path.join(
            rootDir,
            "output",
            "accessibility",
            "latest",
            "a11y-findings.json",
          ),
          manualQa: path.join(rootDir, "output", "accessibility", "latest", "manual-qa.md"),
          responsiveSnapshots: path.join(
            rootDir,
            "output",
            "accessibility",
            "latest",
            "responsive-snapshots",
          ),
        },
      });
      await attachAccessibilityGateSummary(accessibilityGateArtifactsStep);
    }

    const uiActionInventoryStep = await runCommandStep(context, {
      id: "ui-action-inventory-e2e",
      title: "UI Action Inventory E2E",
      command: "pnpm",
      args: ["e2e:ui-action-inventory"],
      env: {
        ...sharedE2EEnv,
        UI_ACTION_AUDIT_OUTPUT_DIR: path.join(context.artifactsDir, "ui-action-inventory-e2e"),
      },
      artifacts: {
        actionInventory: path.join(
          context.artifactsDir,
          "ui-action-inventory-e2e",
          "action-inventory.json",
        ),
        actionResults: path.join(
          context.artifactsDir,
          "ui-action-inventory-e2e",
          "action-results.json",
        ),
        deadControls: path.join(
          context.artifactsDir,
          "ui-action-inventory-e2e",
          "dead-controls.md",
        ),
        duplicates: path.join(context.artifactsDir, "ui-action-inventory-e2e", "duplicates.md"),
        screenshots: path.join(context.artifactsDir, "ui-action-inventory-e2e", "screenshots"),
      },
    });
    await attachUiActionInventorySummary(uiActionInventoryStep);

    const surfaceComplexityStep = await runCommandStep(context, {
      id: "surface-complexity-budget-e2e",
      title: "Surface Complexity Budget",
      command: "pnpm",
      args: ["e2e:surface-complexity"],
      env: {
        ...sharedE2EEnv,
        UI_COMPLEXITY_OUTPUT_DIR: path.join(context.artifactsDir, "surface-complexity-budget-e2e"),
      },
      artifacts: {
        budgetJson: path.join(context.artifactsDir, "surface-complexity-budget-e2e", "budget.json"),
        budgetReport: path.join(context.artifactsDir, "surface-complexity-budget-e2e", "budget.md"),
      },
    });
    await attachSurfaceComplexitySummary(surfaceComplexityStep);

    const commandPaletteStep = await runCommandStep(context, {
      id: "command-palette-e2e",
      title: "Command Palette E2E",
      command: "pnpm",
      args: ["e2e:command-palette"],
      env: {
        ...sharedE2EEnv,
        E2E_COMMAND_PALETTE_OUTPUT_DIR: path.join(context.artifactsDir, "command-palette-e2e"),
      },
      artifacts: {
        commandPaletteReport: path.join(
          context.artifactsDir,
          "command-palette-e2e",
          "command-palette-report.md",
        ),
        commandPaletteResults: path.join(
          context.artifactsDir,
          "command-palette-e2e",
          "command-palette-results.json",
        ),
        screenshots: path.join(context.artifactsDir, "command-palette-e2e", "screenshots"),
      },
    });
    await attachCommandPaletteSummary(commandPaletteStep);

    const telepromptMemoryStep = await runCommandStep(context, {
      id: "teleprompt-memory-e2e",
      title: "Teleprompt Memory E2E",
      command: "pnpm",
      args: ["e2e:teleprompt-memory"],
      env: {
        ...sharedE2EEnv,
        E2E_TELEPROMPT_MEMORY_OUTPUT_DIR: path.join(context.artifactsDir, "teleprompt-memory-e2e"),
      },
      artifacts: {
        screenshots: path.join(context.artifactsDir, "teleprompt-memory-e2e", "screenshots"),
        telepromptMemoryReport: path.join(
          context.artifactsDir,
          "teleprompt-memory-e2e",
          "teleprompt-memory-report.md",
        ),
        telepromptMemoryResults: path.join(
          context.artifactsDir,
          "teleprompt-memory-e2e",
          "teleprompt-memory-results.json",
        ),
      },
    });
    await attachTelepromptMemorySummary(telepromptMemoryStep);

    const contextPanelStep = await runCommandStep(context, {
      id: "context-panel-e2e",
      title: "Context Panel E2E",
      command: "pnpm",
      args: ["e2e:context-panel"],
      env: {
        ...sharedE2EEnv,
        E2E_CONTEXT_PANEL_OUTPUT_DIR: path.join(context.artifactsDir, "context-panel-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(context.artifactsDir, "context-panel-e2e"),
      },
      artifacts: {
        contextPanelReport: path.join(
          context.artifactsDir,
          "context-panel-e2e",
          "context-panel-report.md",
        ),
        contextPanelResults: path.join(
          context.artifactsDir,
          "context-panel-e2e",
          "context-panel-results.json",
        ),
        screenshotStateManifest: path.join(
          context.artifactsDir,
          "context-panel-e2e",
          "manifest.json",
        ),
        screenshotStateMismatches: path.join(
          context.artifactsDir,
          "context-panel-e2e",
          "state-mismatches.md",
        ),
        screenshots: path.join(context.artifactsDir, "context-panel-e2e", "screenshots"),
      },
    });
    await attachContextPanelSummary(contextPanelStep);

    await runCommandStep(context, {
      id: "workspace-flow-e2e",
      title: "Workspace Flow E2E Smoke",
      command: "pnpm",
      args: ["e2e:workspace-flow"],
      env: {
        ...sharedE2EEnv,
        E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e"),
        E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e"),
        E2E_SUMMARY_PATH: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
      },
      artifacts: {
        e2eSummary: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
        screenshotStateManifest: path.join(
          context.artifactsDir,
          "workspace-flow-e2e",
          "manifest.json",
        ),
        screenshotStateMismatches: path.join(
          context.artifactsDir,
          "workspace-flow-e2e",
          "state-mismatches.md",
        ),
        screenshots: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
      },
    });
  }
}

if (sharedE2EServices) {
  await sharedE2EServices.stop();
}

if (enforceRuntimeRegressionGuard) {
  const totalDurationMs = Date.now() - Date.parse(context.summary.startedAt);
  await runRuntimeRegressionGuard(context, {
    currentDurationMs: totalDurationMs,
    historyPath: runtimeHistoryPath,
    window: runtimeRegressionWindow,
  });
}

const summary = await finalizeRun(context);
await persistValidationRuntimeHistory(summary, runtimeHistoryPath);
console.log(`validate:local:${lane} ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;
