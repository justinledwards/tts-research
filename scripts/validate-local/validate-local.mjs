#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./benchmarks.mjs";
import { runFrontendBundleBenchmark } from "./frontend-performance.mjs";
import { evaluateReaderTimingSummary } from "./reader-timing.mjs";
import { createRunContext, finalizeRun, runCallbackStep, runCommandStep } from "./reporting.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const context = await createRunContext({ kind: "validate-local", rootDir });
const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);

const commandSteps = [
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
  {
    id: "typecheck",
    title: "Typecheck",
    command: "pnpm",
    args: ["typecheck"],
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

for (const step of commandSteps) {
  await runCommandStep(context, step);
}

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

const bookCinemaStep = await runCommandStep(context, {
  id: "book-cinema-e2e",
  title: "Book Cinema E2E Smoke",
  command: "pnpm",
  args: ["e2e:book-cinema"],
  env: {
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-e2e"),
    E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
    screenshots: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
  },
});
await attachReaderTimingBudgets(bookCinemaStep, thresholds);

const responsiveCinemaStep = await runCommandStep(context, {
  id: "book-cinema-responsive-e2e",
  title: "Book Cinema Responsive E2E Smoke",
  command: "pnpm",
  args: ["e2e:book-cinema:responsive"],
  env: {
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-responsive-e2e"),
    E2E_SCREENSHOT_DIR: path.join(
      context.artifactsDir,
      "book-cinema-responsive-e2e",
      "screenshots",
    ),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "summary.json"),
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
    E2E_RESPONSIVE_OUTPUT_DIR: path.join(context.artifactsDir, "responsive-snapshots-e2e"),
  },
  artifacts: {
    responsiveResults: path.join(
      context.artifactsDir,
      "responsive-snapshots-e2e",
      "responsive-results.json",
    ),
    screenshots: path.join(context.artifactsDir, "responsive-snapshots-e2e", "screenshots"),
  },
});
await attachResponsiveSnapshotsSummary(responsiveSnapshotsStep);

const uiActionInventoryStep = await runCommandStep(context, {
  id: "ui-action-inventory-e2e",
  title: "UI Action Inventory E2E",
  command: "pnpm",
  args: ["e2e:ui-action-inventory"],
  env: {
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
    deadControls: path.join(context.artifactsDir, "ui-action-inventory-e2e", "dead-controls.md"),
    duplicates: path.join(context.artifactsDir, "ui-action-inventory-e2e", "duplicates.md"),
    screenshots: path.join(context.artifactsDir, "ui-action-inventory-e2e", "screenshots"),
  },
});
await attachUiActionInventorySummary(uiActionInventoryStep);

const commandPaletteStep = await runCommandStep(context, {
  id: "command-palette-e2e",
  title: "Command Palette E2E",
  command: "pnpm",
  args: ["e2e:command-palette"],
  env: {
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
    E2E_CONTEXT_PANEL_OUTPUT_DIR: path.join(context.artifactsDir, "context-panel-e2e"),
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
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e"),
    E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
    screenshots: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
  },
});

const summary = await finalizeRun(context);
console.log(`validate:local ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;

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
    const failedThreshold = readerTiming.thresholds.some((threshold) => !threshold.passed);
    if (failedThreshold) {
      step.status = "failed";
      step.exitCode = 1;
      step.error = step.error
        ? `${step.error} One or more reader timing thresholds failed.`
        : "One or more reader timing thresholds failed.";
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
