#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { startLocalServices } from "../e2e-browser-qa-helpers.mjs";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./benchmarks.mjs";
import { runFrontendBundleBenchmark } from "./frontend-performance.mjs";
import { evaluateReaderTimingSummary } from "./reader-timing.mjs";
import { createRunContext, finalizeRun, runCallbackStep, runCommandStep } from "./reporting.mjs";

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

const fastCommandBatchA = [
  {
    id: "format-check",
    title: "Format Check",
    command: "pnpm",
    args: ["format:check"],
  },
  {
    id: "lint",
    title: "Lint",
    command: "pnpm",
    args: ["lint"],
  },
];

const fastCommandBatchB = [
  {
    id: "typecheck",
    title: "Typecheck",
    command: "pnpm",
    args: ["typecheck"],
  },
  {
    id: "package-tests",
    title: "Package Tests",
    command: "pnpm",
    args: ["package:test:core"],
  },
  {
    id: "script-tests",
    title: "Script Tests",
    command: "pnpm",
    args: ["test:scripts"],
  },
  {
    id: "backend-tests",
    title: "Backend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/backend", "test"],
  },
  {
    id: "adapter-tests",
    title: "Adapter Tests",
    command: "pnpm",
    args: ["test:adapters"],
  },
  {
    id: "frontend-tests",
    title: "Frontend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/frontend", "test"],
  },
  {
    id: "content-ir-validation",
    title: "Content IR Validation",
    command: "pnpm",
    args: ["validate:ir"],
  },
];

const packageBuildStep = {
  id: "package-build",
  title: "Package Build",
  command: "pnpm",
  args: ["package:build"],
};

const releaseCommandSteps = [
  {
    id: "package-smoke",
    title: "Package Smoke",
    command: "pnpm",
    args: ["package:smoke"],
  },
  {
    id: "cli-parity",
    title: "CLI Parity",
    command: "pnpm",
    args: ["cli:parity"],
  },
];

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
    window: runtimeRegressionWindow,
  });
}

const summary = await finalizeRun(context);
await persistValidationRuntimeHistory(summary, runtimeHistoryPath);
console.log(`validate:local:${lane} ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;

function parseLane(args, configuredLane) {
  const value =
    args.find((arg) => arg.startsWith("--lane="))?.slice("--lane=".length) ??
    (args.includes("--e2e") ? "e2e" : null) ??
    (args.includes("--release") || args.includes("--full") ? "release" : null) ??
    configuredLane ??
    "fast";
  if (!["fast", "e2e", "release"].includes(value)) {
    throw new Error(`Unknown validation lane "${value}". Use fast, e2e, or release.`);
  }
  return value;
}

function resolveParallelism(args, configuredValue, fallback) {
  const argsAsValues = new Set(args);
  const explicit = args.find((arg) => arg.startsWith("--parallelism="));
  const cliValue = explicit
    ? explicit.slice("--parallelism=".length)
    : argsAsValues.has("--parallelism")
      ? args[args.indexOf("--parallelism") + 1]
      : null;
  const parsed = parsePositiveInteger(cliValue ?? configuredValue);
  if (parsed !== null) {
    return parsed;
  }
  return Math.max(1, fallback);
}

async function runRuntimeRegressionGuard(context, { currentDurationMs, window } = {}) {
  const history = await readValidationRuntimeHistory(runtimeHistoryPath);
  const durations = history
    .map((entry) => Number(entry.durationMs))
    .filter((value) => Number.isFinite(value));
  if (durations.length < 1 || !Number.isFinite(currentDurationMs)) {
    return;
  }
  const limit = Math.max(1, Number.isInteger(window) ? window : 12);
  const sample = durations.slice(-1 * limit);
  const medianDurationMs = calculateMedian(sample);
  if (!Number.isFinite(medianDurationMs) || medianDurationMs <= 0) {
    return;
  }
  const regressionThreshold = medianDurationMs * 1.25;

  await runCallbackStep(
    context,
    {
      id: "runtime-regression-guard",
      title: "Runtime Regression Guard",
      command: "runtime regression guard",
    },
    () => {
      const pass = currentDurationMs <= regressionThreshold;
      if (!pass) {
        throw new Error(
          `Total validation runtime ${String(currentDurationMs)}ms exceeds 1.25x median baseline ${String(
            medianDurationMs,
          )}ms.`,
        );
      }
      return {
        metrics: {
          totalDurationMs: currentDurationMs,
          medianBaselineMs: medianDurationMs,
          thresholdMs: regressionThreshold,
        },
        thresholds: [
          {
            actual: currentDurationMs,
            expected: regressionThreshold,
            metric: "totalDurationMs",
            operator: "<=",
            passed: true,
            threshold: "maxTotalDurationMs",
          },
        ],
      };
    },
  );
}

async function persistValidationRuntimeHistory(summary, historyPath) {
  const history = await readValidationRuntimeHistory(historyPath);
  const maxEntries = 100;
  history.push({
    startedAt: summary.startedAt,
    durationMs: summary.durationMs,
    kind: summary.kind,
    status: summary.status,
  });
  if (history.length > maxEntries) {
    history.splice(0, history.length - maxEntries);
  }
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`);
}

async function readValidationRuntimeHistory(historyPath) {
  if (!historyPath) {
    return [];
  }
  try {
    const raw = await readFile(historyPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function calculateMedian(values) {
  if (values.length === 0) {
    return NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseBoolean(args, name, value = null) {
  const longFlag = `--${name}`;
  const negated = `--no-${name}`;
  const valueWithEquals = args.find((arg) => arg.startsWith(`${longFlag}=`));
  if (args.includes(longFlag)) {
    return true;
  }
  if (args.includes(negated)) {
    return false;
  }
  if (valueWithEquals) {
    return parseBooleanValue(valueWithEquals.slice(longFlag.length + 1));
  }
  if (value === null || value === undefined || value === "") {
    return false;
  }
  return parseBooleanValue(String(value));
}

function parseBooleanValue(value) {
  const normalized = String(value).toLowerCase();
  return ["1", "true", "yes", "on", "y"].includes(normalized);
}

function parsePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getAvailableWorkers() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }
  if (typeof os.cpus === "function") {
    return os.cpus().length || 2;
  }
  return 2;
}

async function runCommandBatch(context, steps, { concurrency = 4 } = {}) {
  const limit = Math.max(1, parsePositiveInteger(concurrency) ?? 4);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, steps.length) }, async () => {
    while (next < steps.length) {
      const current = next++;
      await runCommandStep(context, steps[current]);
    }
  });
  await Promise.allSettled(workers);
}

async function attachReaderTimingBudgets(step, thresholds) {
  const summaryPath = step.artifacts?.e2eSummary;
  if (!summaryPath) {
    return;
  }
  try {
    const e2eSummary = JSON.parse(await readFile(summaryPath, "utf8"));
    const readerTiming = evaluateReaderTimingSummary(e2eSummary, thresholds?.readerTiming ?? {});
    step.metrics = readerTiming.metrics;
    step.thresholds = readerTiming.thresholds;
    const blockingThreshold = readerTiming.thresholds.some((threshold) => threshold.blocking);
    if (blockingThreshold) {
      step.status = "failed";
      step.exitCode = 1;
      step.error = step.error
        ? `${step.error} One or more reader timing thresholds failed.`
        : "One or more blocking reader timing thresholds failed.";
    }
  } catch (error) {
    if (step.status === "passed") {
      step.status = "failed";
      step.exitCode = 1;
      step.error =
        error instanceof Error
          ? `Unable to read Book Cinema timing summary: ${error.message}`
          : String(error);
    }
  }
}

async function attachResponsiveCinemaSummary(step) {
  await attachJsonMetrics(step, "e2eSummary", (summary) => {
    const bottomSheet = summary.responsiveCinema?.bottomSheetReachability ?? {};
    const metrics = {
      bottomSheetReachability: Boolean(bottomSheet.passed),
      bottomSheetScreenshots: bottomSheet.screenshots?.length ?? 0,
      responsiveViewports: summary.responsiveCinema?.viewports?.length ?? 0,
    };
    return {
      metrics,
      thresholds: [
        {
          actual: metrics.bottomSheetReachability,
          expected: true,
          metric: "bottomSheetReachability",
          operator: "===",
          passed: metrics.bottomSheetReachability === true,
          threshold: "requireMobileBottomSheetReachable",
        },
      ],
    };
  });
}

function requiredChecksCount() {
  return 20;
}

async function attachAccessibilitySummary(step) {
  await attachJsonMetrics(step, "accessibilityResults", (document) => ({
    metrics: {
      accessibilityAudit: document.summary,
      scanner: document.scanner,
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "accessibilityFailures",
        operator: "<=",
        passed: (document.summary?.failures ?? 0) <= 0,
        threshold: "maxAccessibilityFailures",
      },
    ],
  }));
}

async function attachResponsiveSnapshotsSummary(step) {
  await attachJsonMetrics(step, "responsiveResults", (document) => ({
    metrics: {
      responsiveSnapshots: document.summary,
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "responsiveSnapshotFailures",
        operator: "<=",
        passed: (document.summary?.failures ?? 0) <= 0,
        threshold: "maxResponsiveSnapshotFailures",
      },
    ],
  }));
}

async function attachAccessibilityGateSummary(step) {
  await attachJsonMetrics(step, "accessibilityGateFindings", (document) => ({
    metrics: {
      a11yFindings: document.summary,
      gateChecks: document.gate?.requiredChecks?.length ?? 0,
      gateWaivers: document.gate?.knownWaivers?.length ?? 0,
    },
    thresholds: [
      {
        actual: document.summary?.missingPrimaryLandmarks ?? 0,
        expected: 0,
        metric: "accessibilityGateMissingPrimaryLandmarks",
        operator: "===",
        passed: (document.summary?.missingPrimaryLandmarks ?? 0) === 0,
        threshold: "maxMissingPrimaryLandmarks",
      },
      {
        actual: document.gate?.requiredChecks?.length ?? 0,
        expected: requiredChecksCount(),
        metric: "accessibilityGateRequiredChecks",
        operator: ">=",
        passed: (document.gate?.requiredChecks?.length ?? 0) >= requiredChecksCount(),
        threshold: "minRequiredChecks",
      },
    ],
  }));
}

async function attachUiActionInventorySummary(step) {
  await attachJsonMetrics(step, "actionInventory", (inventory) => {
    const actions = inventory.actions ?? [];
    const disabledWithoutReason = actions.filter(
      (action) => action.disabled && !action.disabledReason,
    ).length;
    const duplicateGroups = Array.isArray(inventory.duplicates)
      ? inventory.duplicates.length
      : Object.keys(inventory.duplicates ?? {}).length;
    const metrics = {
      actionCoverage: inventory.summary,
      deadControlsReport: "dead-controls.md",
      disabledWithoutReason,
      duplicateControlsReport: "duplicates.md",
      duplicateGroups,
    };
    return {
      metrics,
      thresholds: [
        {
          actual: disabledWithoutReason,
          expected: 0,
          metric: "disabledWithoutReason",
          operator: "<=",
          passed: disabledWithoutReason <= 0,
          threshold: "maxDisabledWithoutReason",
        },
      ],
    };
  });
}

async function attachSurfaceComplexitySummary(step) {
  await attachJsonMetrics(step, "budgetJson", (document) => ({
    metrics: {
      surfaceComplexity: document.summary,
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "surfaceComplexityBudgetFailures",
        operator: "===",
        passed: (document.summary?.failures ?? 0) === 0,
        threshold: "maxSurfaceComplexityBudgetFailures",
      },
    ],
  }));
}

async function attachCommandPaletteSummary(step) {
  await attachJsonMetrics(step, "commandPaletteResults", (document) => ({
    metrics: {
      commandPaletteCoverage: document.summary,
      categoriesCovered: document.result?.categoriesCovered ?? [],
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "commandPaletteFailures",
        operator: "<=",
        passed: (document.summary?.failures ?? 0) <= 0,
        threshold: "maxCommandPaletteFailures",
      },
    ],
  }));
}

async function attachTelepromptMemorySummary(step) {
  await attachJsonMetrics(step, "telepromptMemoryResults", (document) => ({
    metrics: {
      telepromptMemory: document.summary,
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "telepromptMemoryFailures",
        operator: "<=",
        passed: (document.summary?.failures ?? 0) <= 0,
        threshold: "maxTelepromptMemoryFailures",
      },
    ],
  }));
}

async function attachContextPanelSummary(step) {
  await attachJsonMetrics(step, "contextPanelResults", (document) => ({
    metrics: {
      contextPanelDuplication: document.summary,
    },
    thresholds: [
      {
        actual: document.summary?.failures ?? 0,
        expected: 0,
        metric: "contextPanelFailures",
        operator: "<=",
        passed: (document.summary?.failures ?? 0) <= 0,
        threshold: "maxContextPanelFailures",
      },
    ],
  }));
}

async function attachJsonMetrics(step, artifactKey, summarize) {
  const filePath = step.artifacts?.[artifactKey];
  if (!filePath) {
    return;
  }
  try {
    const document = JSON.parse(await readFile(filePath, "utf8"));
    const summary = summarize(document);
    step.metrics = { ...(step.metrics ?? {}), ...(summary.metrics ?? {}) };
    step.thresholds = [...(step.thresholds ?? []), ...(summary.thresholds ?? [])];
    const failedThreshold = step.thresholds.some((threshold) => threshold.passed === false);
    if (failedThreshold && step.status === "passed") {
      step.status = "failed";
      step.exitCode = 1;
      step.error = "One or more QA report thresholds failed.";
    }
  } catch (error) {
    if (step.status === "passed") {
      step.status = "failed";
      step.exitCode = 1;
      step.error = error instanceof Error ? error.message : String(error);
    }
  }
}
