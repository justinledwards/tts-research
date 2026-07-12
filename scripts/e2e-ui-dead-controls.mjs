#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  classifyDuplicateGroup,
  summarizeDuplicateClassifications,
} from "./ui-action-duplicate-waivers.mjs";

const ansiEscapePattern = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, "g");

export function renderDeadControlsReport({ actions, generatedAt, results }) {
  const missingTestIds = actions.filter((action) => !hasStableActionId(action));
  const stableIdCoverage = stableIdCoverageSummary(actions);
  const missingLabels = actions.filter((action) =>
    action.metadataIssues.includes("missing-human-label"),
  );
  const missingAccessibleNames = actions.filter((action) =>
    action.metadataIssues.includes("missing-accessible-name"),
  );
  const disabledWithoutReason = actions.filter((action) =>
    action.metadataIssues.includes("disabled-without-explicit-reason"),
  );
  const capabilityGatedDisabled = actions.filter(
    (action) => action.disabled && action.capabilityGated,
  );
  const missingOwners = actions.filter((action) => action.metadataIssues.includes("missing-owner"));
  const missingSurfaces = actions.filter((action) =>
    action.metadataIssues.includes("missing-surface"),
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
    `- Missing stable action IDs: ${String(missingTestIds.length)}`,
    `- Explicit data-testid IDs: ${String(stableIdCoverage.explicitTestId)}`,
    `- Explicit equivalent action IDs: ${String(stableIdCoverage.explicitActionId)}`,
    `- Stable generated action IDs: ${String(stableIdCoverage.generatedStable)}`,
    `- Unstable generated action IDs: ${String(stableIdCoverage.generatedUnstable)}`,
    `- Missing human label: ${String(missingLabels.length)}`,
    `- Missing accessible name: ${String(missingAccessibleNames.length)}`,
    `- Missing owner: ${String(missingOwners.length)}`,
    `- Missing surface: ${String(missingSurfaces.length)}`,
    `- Capability-gated disabled controls: ${String(capabilityGatedDisabled.length)}`,
    `- Disabled without explicit reason: ${String(disabledWithoutReason.length)}`,
    `- Destructive without confirmation affordance: ${String(destructiveWithoutConfirmation.length)}`,
    "",
    "## Capability-gated controls",
    "",
    ...table(
      capabilityGatedDisabled,
      ["Surface", "Scenario", "Label", "Capability", "Reason"],
      (action) => [
        action.surface,
        action.scenarioId,
        action.label,
        action.capabilityGate ?? "",
        action.disabledReason ?? action.capabilityReason ?? "",
      ],
    ),
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
      [
        ...new Set([
          ...missingTestIds,
          ...missingLabels,
          ...missingAccessibleNames,
          ...missingOwners,
          ...missingSurfaces,
          ...disabledWithoutReason,
        ]),
      ],
      ["Surface", "Owner", "Scenario", "Visible label", "Accessible name", "Issues"],
      (action) => [
        action.surface,
        action.owner,
        action.scenarioId,
        action.visibleLabel ?? action.label,
        action.accessibleName ?? action.label,
        action.metadataIssues.join(", "),
      ],
    ),
    "",
    "## Stable ID Coverage By Surface",
    "",
    ...table(
      stableIdCoverage.bySurface,
      ["Surface", "Explicit test IDs", "Equivalent IDs", "Stable generated", "Unstable"],
      (entry) => [
        entry.surface,
        entry.explicitTestId,
        entry.explicitActionId,
        entry.generatedStable,
        entry.generatedUnstable,
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

function hasStableActionId(action) {
  return action.hasStableActionId ?? action.hasStableTestId;
}

function stableIdCoverageSummary(actions) {
  const bySurface = [...new Set(actions.map((action) => action.surface))].map((surface) => {
    const surfaceActions = actions.filter((action) => action.surface === surface);
    return {
      explicitActionId: surfaceActions.filter(
        (action) => action.stableIdKind === "explicit-action-id",
      ).length,
      explicitTestId: surfaceActions.filter((action) => action.stableIdKind === "explicit-testid")
        .length,
      generatedStable: surfaceActions.filter((action) => action.stableIdKind === "generated-stable")
        .length,
      generatedUnstable: surfaceActions.filter(
        (action) => action.stableIdKind === "generated-unstable",
      ).length,
      surface,
    };
  });
  return {
    bySurface,
    explicitActionId: bySurface.reduce((total, entry) => total + entry.explicitActionId, 0),
    explicitTestId: bySurface.reduce((total, entry) => total + entry.explicitTestId, 0),
    generatedStable: bySurface.reduce((total, entry) => total + entry.generatedStable, 0),
    generatedUnstable: bySurface.reduce((total, entry) => total + entry.generatedUnstable, 0),
  };
}

export function renderDuplicatesReport({ duplicates, generatedAt }) {
  const classificationSummary = summarizeDuplicateClassifications(duplicates);
  const lines = [
    "# UI action duplicate-control report",
    "",
    `Generated: ${generatedAt}`,
    "",
    duplicates.length === 0
      ? "No duplicate visible action groups were found."
      : `${String(duplicates.length)} duplicate action group(s) were found.`,
    "",
    "## Classification Summary",
    "",
    ...table(
      Object.entries(classificationSummary.byCategory).map(([category, count]) => ({
        category,
        count,
      })),
      ["Category", "Groups"],
      (entry) => [entry.category, entry.count],
    ),
    "",
    "## Burn-down List",
    "",
    ...table(
      classificationSummary.burnDownIssues,
      ["Issue", "Owner", "Groups", "Review date", "Reason"],
      (issue) => [issue.issue, issue.owner, issue.count, issue.reviewDate, issue.reason],
    ),
    "",
  ];
  for (const duplicate of duplicates) {
    const classification = duplicate.classification ?? classifyDuplicateGroup(duplicate);
    lines.push(`## ${duplicate.surface}: ${duplicate.label}`);
    lines.push("");
    lines.push(`- Action class: ${duplicate.actionClass}`);
    lines.push(`- Finding type: ${duplicate.kind ?? "same-label-same-surface"}`);
    if (classification) {
      lines.push(`- Classification: ${classification.category}`);
      lines.push(`- Owner: ${classification.owner}`);
      lines.push(`- Review date: ${classification.reviewDate}`);
      lines.push(`- Reason: ${classification.reason}`);
      lines.push(`- Accepted surfaces: ${(classification.acceptedSurfaces ?? []).join(", ")}`);
      if (classification.burnDownIssue) {
        lines.push(`- Burn-down issue: ${classification.burnDownIssue}`);
      }
    }
    lines.push(`- Count: ${String(duplicate.count)}`);
    lines.push(`- Surfaces: ${(duplicate.surfaces ?? [duplicate.surface]).join(", ")}`);
    lines.push(`- Scenarios: ${duplicate.scenarios.join(", ")}`);
    if (duplicate.behaviorKeys?.length > 1) {
      lines.push(`- Behaviour keys: ${duplicate.behaviorKeys.join("; ")}`);
    }
    if (duplicate.playbackOwners?.length > 0) {
      lines.push(`- Playback owners: ${duplicate.playbackOwners.join(", ")}`);
    }
    if (duplicate.playbackActions?.length > 0) {
      lines.push(`- Playback actions: ${duplicate.playbackActions.join(", ")}`);
    }
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
