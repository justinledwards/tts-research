#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

export function renderDeadControlsReport({ actions, generatedAt, results }) {
  const missingTestIds = actions.filter((action) =>
    action.metadataIssues.includes("missing-stable-data-testid"),
  );
  const missingLabels = actions.filter((action) =>
    action.metadataIssues.includes("missing-human-label"),
  );
  const disabledWithoutReason = actions.filter((action) =>
    action.metadataIssues.includes("disabled-without-explicit-reason"),
  );
  const destructiveWithoutConfirmation = actions.filter((action) =>
    action.metadataIssues.includes("destructive-without-confirmation-affordance"),
  );
  const failedResults = results.filter((result) => result.passed === false);
  const noOps = failedResults.filter((result) => result.outcome === "no observable result");

  const lines = [
    "# UI action dead-control report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Summary",
    "",
    `- Total visible actions inventoried: ${String(actions.length)}`,
    `- Failed action activations: ${String(failedResults.length)}`,
    `- No-op activations: ${String(noOps.length)}`,
    `- Missing stable data-testid: ${String(missingTestIds.length)}`,
    `- Missing human label: ${String(missingLabels.length)}`,
    `- Disabled without explicit reason: ${String(disabledWithoutReason.length)}`,
    `- Destructive without confirmation affordance: ${String(destructiveWithoutConfirmation.length)}`,
    "",
    "## Failed or no-op controls",
    "",
    ...table(failedResults, ["Surface", "Scenario", "Label", "Outcome", "Reason"], (result) => [
      result.surface,
      result.scenarioId,
      result.label,
      result.outcome,
      result.reason ?? result.error ?? "",
    ]),
    "",
    "## Missing mandatory metadata",
    "",
    ...table(
      [...new Set([...missingTestIds, ...missingLabels, ...disabledWithoutReason])],
      ["Surface", "Scenario", "Label", "Issues"],
      (action) => [
        action.surface,
        action.scenarioId,
        action.label,
        action.metadataIssues.join(", "),
      ],
    ),
    "",
    "## Destructive controls",
    "",
    ...table(
      actions.filter((action) => action.destructive),
      ["Surface", "Scenario", "Label", "Confirmation"],
      (action) => [
        action.surface,
        action.scenarioId,
        action.label,
        action.hasConfirmationAffordance ? "present" : "missing",
      ],
    ),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export function renderDuplicatesReport({ duplicates, generatedAt }) {
  const lines = [
    "# UI action duplicate-control report",
    "",
    `Generated: ${generatedAt}`,
    "",
    duplicates.length === 0
      ? "No duplicate visible action groups were found."
      : `${String(duplicates.length)} duplicate action group(s) were found.`,
    "",
  ];
  for (const duplicate of duplicates) {
    lines.push(`## ${duplicate.surface}: ${duplicate.label}`);
    lines.push("");
    lines.push(`- Action class: ${duplicate.actionClass}`);
    lines.push(`- Count: ${String(duplicate.count)}`);
    lines.push(`- Scenarios: ${duplicate.scenarios.join(", ")}`);
    lines.push(`- Action IDs: ${duplicate.actionIds.join(", ")}`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function table(items, headers, rowBuilder) {
  if (items.length === 0) {
    return ["No findings."];
  }
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const item of items) {
    lines.push(`| ${rowBuilder(item).map(escapeCell).join(" | ")} |`);
  }
  return lines;
}

function escapeCell(value) {
  return stripAnsi(String(value ?? ""))
    .replaceAll("|", "\\|")
    .replaceAll("\n", " ")
    .trim();
}

function stripAnsi(value) {
  return value.replaceAll(ansiEscapePattern, "");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputDir =
    process.argv[2] ?? path.join(process.cwd(), "output", "ui-action-audit", "latest");
  const [inventoryRaw, resultsRaw] = await Promise.all([
    readFile(path.join(outputDir, "action-inventory.json"), "utf8"),
    readFile(path.join(outputDir, "action-results.json"), "utf8"),
  ]);
  const inventory = JSON.parse(inventoryRaw);
  const results = JSON.parse(resultsRaw);
  await writeFile(
    path.join(outputDir, "dead-controls.md"),
    renderDeadControlsReport({
      actions: inventory.actions,
      generatedAt: inventory.generatedAt,
      results: results.results,
    }),
  );
  await writeFile(
    path.join(outputDir, "duplicates.md"),
    renderDuplicatesReport({
      duplicates: inventory.duplicates ?? [],
      generatedAt: inventory.generatedAt,
    }),
  );
}
