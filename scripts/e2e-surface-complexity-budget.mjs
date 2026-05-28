#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  budgetKeyForSurface,
  budgets,
  evaluate,
  normalizeSnapshots,
  renderMarkdown,
  scenarioBudgetKeys,
  websiteReadModeCalmnessSummary,
} from "./e2e-surface-complexity-budget-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_COMPLEXITY_OUTPUT_DIR ?? path.join(rootDir, "output", "ui-complexity", "latest");
const sourceAuditDir = path.join(outputDir, "source-action-audit");

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeFile(
    path.join(outputDir, "budget.json"),
    `${JSON.stringify(
      {
        error: message,
        generatedAt: new Date().toISOString(),
        schemaVersion: "ui-complexity-budget.v1",
        status: "failed",
      },
      null,
      2,
    )}\n`,
  ).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(outputDir, { recursive: true });
  const inventory = await runInventory();
  const duplicateClassification = inventory.duplicateClassification ?? null;
  const snapshots = normalizeSnapshots(inventory);
  const scenarios = snapshots.map((snapshot) => {
    const budgetKey = scenarioBudgetKeys[snapshot.id] ?? budgetKeyForSurface(snapshot.surface);
    const activeBudget = budgets[budgetKey];
    const thresholds = evaluate(snapshot.metrics, activeBudget);
    return {
      ...snapshot,
      budget: activeBudget,
      budgetKey,
      status: thresholds.every((threshold) => threshold.passed) ? "passed" : "failed",
      thresholds,
    };
  });
  const failures = scenarios.flatMap((scenario) =>
    scenario.thresholds
      .filter((threshold) => !threshold.passed)
      .map((threshold) => ({
        actual: threshold.actual,
        budget: threshold.budget,
        metric: threshold.metric,
        scenarioId: scenario.id,
        surface: scenario.surface,
      })),
  );
  const document = {
    generatedAt: new Date().toISOString(),
    schemaVersion: "ui-complexity-budget.v1",
    sourceActionInventory: path.join(sourceAuditDir, "action-inventory.json"),
    status: failures.length === 0 ? "passed" : "failed",
    summary: {
      advancedScenarios: scenarios.filter((scenario) => scenario.budget.tier === "advanced").length,
      duplicateClassification: duplicateClassification
        ? {
            byCategory: duplicateClassification.byCategory,
            unclassified: duplicateClassification.unclassified,
          }
        : null,
      failures: failures.length,
      maxVisibleActions: Math.max(...scenarios.map((scenario) => scenario.metrics.visibleActions)),
      scenarios: scenarios.length,
      surfaces: new Set(scenarios.map((scenario) => scenario.surface)).size,
    },
    websiteReadModeCalmness: websiteReadModeCalmnessSummary(scenarios),
    scenarios,
    duplicateClassification,
    failures,
  };
  await writeFile(path.join(outputDir, "budget.json"), `${JSON.stringify(document, null, 2)}\n`);
  await writeFile(path.join(outputDir, "budget.md"), renderMarkdown(document));
  console.log(`Surface complexity budget ${document.status}. Reports written to ${outputDir}`);
  process.exitCode = document.status === "passed" ? 0 : 1;
}

async function runInventory() {
  await runCommand(process.execPath, [path.join(rootDir, "scripts", "e2e-ui-action-audit.mjs")], {
    ...process.env,
    UI_ACTION_AUDIT_INVENTORY_ONLY: "1",
    UI_ACTION_AUDIT_OUTPUT_DIR: sourceAuditDir,
  });
  return JSON.parse(await readFile(path.join(sourceAuditDir, "action-inventory.json"), "utf8"));
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(" ")} exited with ${String(code)}`));
        return;
      }
      resolve();
    });
  });
}
