#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { evaluateReaderTimingSummary } from "./reader-timing.mjs";
import { runCallbackStep, runCommandStep } from "./reporting.mjs";

export function parseLane(args, configuredLane) {
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

export function resolveParallelism(args, configuredValue, fallback) {
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

export function parseBoolean(args, name, value = null) {
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

export function parsePositiveInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function getAvailableWorkers() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }
  if (typeof os.cpus === "function") {
    return os.cpus().length || 2;
  }
  return 2;
}

export async function runRuntimeRegressionGuard(
  context,
  { currentDurationMs, window, historyPath } = {},
) {
  const history = await readValidationRuntimeHistory(historyPath);
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

export async function persistValidationRuntimeHistory(summary, historyPath) {
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

export async function runCommandBatch(
  context,
  steps,
  { concurrency = 4, runCommandRunner = runCommandStep } = {},
) {
  const limit = Math.max(1, parsePositiveInteger(concurrency) ?? 4);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, steps.length) }, async () => {
    while (next < steps.length) {
      const current = next++;
      await runCommandRunner(context, steps[current]);
    }
  });
  await Promise.allSettled(workers);
}

export async function attachReaderTimingBudgets(step, thresholds) {
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

export async function attachResponsiveCinemaSummary(step) {
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

export function requiredChecksCount() {
  return 20;
}

export async function attachAccessibilitySummary(step) {
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

export async function attachResponsiveSnapshotsSummary(step) {
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

export async function attachAccessibilityGateSummary(step) {
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

export async function attachUiActionInventorySummary(step) {
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

export async function attachSurfaceComplexitySummary(step) {
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

export async function attachCommandPaletteSummary(step) {
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

export async function attachTelepromptMemorySummary(step) {
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

export async function attachContextPanelSummary(step) {
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

export async function attachJsonMetrics(step, artifactKey, summarize) {
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
