#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_ACTION_AUDIT_OUTPUT_DIR ??
  path.join(rootDir, "output", "ui-action-audit", "latest");
const summaryPath =
  process.env.UI_ACTION_AUDIT_SUMMARY_PATH ?? path.join(outputDir, "summary.json");
const historyPath =
  process.env.UI_ACTION_AUDIT_SUMMARY_HISTORY_PATH ??
  path.join(rootDir, "output", "ui-action-audit", "summary-history.json");
const parsedBaselineWindow = Number.parseInt(
  process.env.UI_ACTION_AUDIT_BASELINE_WINDOW ?? "10",
  10,
);
const parsedMaxHistoryEntries = Number.parseInt(
  process.env.UI_ACTION_AUDIT_MAX_HISTORY_ENTRIES ?? "40",
  10,
);
const baselineWindow =
  Number.isFinite(parsedBaselineWindow) && parsedBaselineWindow > 0 ? parsedBaselineWindow : 10;
const maxHistoryEntries =
  Number.isFinite(parsedMaxHistoryEntries) && parsedMaxHistoryEntries > 0
    ? parsedMaxHistoryEntries
    : 40;
const parsedRegressionFactor = Number.parseFloat(
  process.env.UI_ACTION_AUDIT_REGRESSION_FACTOR ?? "1.25",
);
const regressionFactor =
  Number.isFinite(parsedRegressionFactor) && parsedRegressionFactor > 1
    ? parsedRegressionFactor
    : 1.25;

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  const currentDurationMs = Number(
    summary.durationMs ??
      summary.phaseTimings?.totalMs ??
      summary.phaseTimings?.totalMs ??
      summary.totalMs ??
      summary.duration,
  );
  if (!Number.isFinite(currentDurationMs) || currentDurationMs <= 0) {
    throw new Error(`Unable to read valid run duration from ${summaryPath}.`);
  }

  const history = await readHistory(historyPath);
  const previous = history
    .map((entry) => Number(entry.durationMs))
    .filter((value) => Number.isFinite(value));
  const regressionCutoff = calculateRegressionCutoff(previous);
  const isRegression = regressionCutoff !== null && currentDurationMs > regressionCutoff;
  const runRecord = {
    durationMs: currentDurationMs,
    runAt: new Date().toISOString(),
    scenarioFilterCount: summary.profile?.scenarioCount,
    scenarioFilters: summary.scenarioFilter ?? [],
    status: summary.status,
    totalActions: summary.summaries?.inventory?.actionCount,
    url: summary.summaryPath,
  };
  history.push(runRecord);
  while (history.length > maxHistoryEntries) {
    history.shift();
  }
  await persistHistory(historyPath, history);

  console.log(`[ui-actions] runtime: ${String(currentDurationMs)}ms`);
  if (regressionCutoff !== null) {
    console.log(
      `[ui-actions] guard baseline: ${String(Math.round(regressionCutoff * 100) / 100)}ms (${String(
        regressionFactor,
      )}x, window=${String(baselineWindow)})`,
    );
  } else {
    console.log("[ui-actions] guard baseline: insufficient history");
  }

  if (isRegression) {
    throw new Error(
      `UI action audit runtime regression detected: ${String(currentDurationMs)}ms exceeds ${String(
        regressionFactor,
      )}x baseline ${String(Math.round(regressionCutoff * 10_000) / 10_000)}ms`,
    );
  }
  console.log("[ui-actions] guard: pass");
}

async function readHistory(historyFilePath) {
  try {
    const existing = await readFile(historyFilePath, "utf8");
    const parsed = JSON.parse(existing);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function calculateRegressionCutoff(previousDurations) {
  const valid = previousDurations
    .slice(-Math.max(1, baselineWindow))
    .filter((value) => value > 0 && Number.isFinite(value))
    .sort((left, right) => left - right);
  if (valid.length < 1) {
    return null;
  }
  const midpoint = Math.floor(valid.length / 2);
  const median =
    valid.length % 2 === 1 ? valid[midpoint] : (valid[midpoint - 1] + valid[midpoint]) / 2;
  return median * regressionFactor;
}

async function persistHistory(historyFilePath, history) {
  await mkdir(path.dirname(historyFilePath), { recursive: true });
  await writeFile(
    historyFilePath,
    `${JSON.stringify(
      history.map((entry) => ({ ...entry, scenarioFilterCount: entry.scenarioFilterCount ?? 0 })),
      null,
      2,
    )}\n`,
  );
}
