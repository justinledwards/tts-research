#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_COMPLEXITY_OUTPUT_DIR ?? path.join(rootDir, "output", "ui-complexity", "latest");
const sourceAuditDir = path.join(outputDir, "source-action-audit");

const budgets = {
  commandPalette: budget("standard", 12, 4, 4, 0, 3, 2, 1, 40, 16, 4, [
    "Command palette is secondary navigation, not a hidden required-task dump.",
  ]),
  debugAdvanced: budget("advanced", 48, 16, 18, 4, 12, 8, 8, 90, 80, 18, [
    "Advanced/debug surfaces may exceed normal density when explicitly operator-facing.",
  ]),
  readMode: budget("calm", 25, 10, 4, 0, 6, 6, 2, 40, 40, 10, [
    "Read mode stays canvas-first with diagnostics hidden by default.",
  ]),
  readModeMoreMenu: budget("calm", 25, 10, 4, 0, 6, 8, 2, 40, 40, 10, [
    "Cinema More may expose display, advanced, and navigation entry points on demand.",
  ]),
  websiteReadCalm: budget(
    "calm",
    16,
    6,
    2,
    0,
    3,
    4,
    1,
    36,
    10,
    6,
    [
      "Website Cinema Read mode keeps one source summary, one mode group, and one playback group visible.",
      "Source, policy, provenance, and display details stay available through Inspect or popovers.",
    ],
    {
      maxExpandedPolicySourceDetails: 0,
      maxFooterRows: 3,
      maxHeaderLines: 3,
      maxInlineDisplaySettings: 0,
      maxModeControlGroups: 1,
      maxPanelCount: 0,
      maxPrimaryPlaybackGroups: 1,
      maxSourceIdentitySummaries: 1,
      maxVisibleBadges: 2,
    },
  ),
  reviewWorkspace: budget("dense", 68, 26, 14, 2, 12, 10, 8, 45, 72, 16, [
    "Review may expose batch actions, but one review action group remains primary.",
  ]),
  settingsQuick: budget("standard", 40, 12, 6, 4, 10, 6, 4, 90, 80, 16, [
    "Quick settings should expose common settings; expert groups own deeper controls.",
  ]),
  teleprompt: budget("standard", 46, 16, 8, 0, 8, 8, 4, 45, 48, 12, [
    "Teleprompt keeps presenter controls primary; workflow actions stay secondary.",
  ]),
  workspace: budget("dense", 68, 26, 14, 2, 12, 10, 8, 50, 72, 18, [
    "Workspace can coordinate surfaces, but hidden rails must not become required paths.",
  ]),
};

const scenarioBudgetKeys = {
  "book-docx-audio-ready": "readMode",
  "book-epub-audio-ready": "readMode",
  "book-more-menu": "readModeMoreMenu",
  "book-pdf-pre-audio": "workspace",
  "command-palette": "commandPalette",
  "document-cinema": "readMode",
  "mobile-more-sheet": "readMode",
  "pinned-inspector": "debugAdvanced",
  "preview-mini-player": "workspace",
  "project-dashboard": "workspace",
  "settings-open": "settingsQuick",
  "settings-speech-policy": "settingsQuick",
  "settings-ui-memory": "settingsQuick",
  "voice-dashboard": "commandPalette",
  "website-cinema": "websiteReadCalm",
  "website-cinema-calm-read": "websiteReadCalm",
  "workspace-intake": "workspace",
  "workspace-preview": "workspace",
  "workspace-review": "reviewWorkspace",
  "workspace-teleprompt": "teleprompt",
};

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
      failures: failures.length,
      maxVisibleActions: Math.max(...scenarios.map((scenario) => scenario.metrics.visibleActions)),
      scenarios: scenarios.length,
      surfaces: new Set(scenarios.map((scenario) => scenario.surface)).size,
    },
    websiteReadModeCalmness: websiteReadModeCalmnessSummary(scenarios),
    scenarios,
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

function normalizeSnapshots(inventory) {
  if (Array.isArray(inventory.surfaceComplexity) && inventory.surfaceComplexity.length > 0) {
    return inventory.surfaceComplexity;
  }
  const scenarios = new Map((inventory.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  const groups = new Map();
  for (const action of inventory.actions ?? []) {
    const group = groups.get(action.scenarioId) ?? [];
    group.push(action);
    groups.set(action.scenarioId, group);
  }
  return [...groups.entries()].map(([scenarioId, actions]) => {
    const scenario = scenarios.get(scenarioId) ?? {};
    return {
      description: scenario.description ?? "",
      id: scenarioId,
      label: scenario.label ?? scenarioId,
      metrics: metricsFromActions(actions),
      surface: scenario.surface ?? actions[0]?.surface ?? "Workspace",
    };
  });
}

function metricsFromActions(actions) {
  const labels = new Map();
  let labelLength = 0;
  let reachableDrawersSheets = 0;
  for (const action of actions) {
    const label = action.visibleLabel || action.label || "";
    if (label) {
      labels.set(label, (labels.get(label) ?? 0) + 1);
    }
    labelLength += String(action.accessibleName || action.label || "").length;
    if (
      action.ariaHasPopup ||
      action.ariaControls ||
      /\b(more|settings|drawer|sheet|palette|help|guide|shortcuts|open)\b/i.test(action.label)
    ) {
      reachableDrawersSheets += 1;
    }
  }
  return {
    activeModesTabs: 0,
    averageAccessibleLabelLength: actions.length > 0 ? Math.round(labelLength / actions.length) : 0,
    chipsBadges: 0,
    destructiveActions: actions.filter((action) => action.destructive).length,
    disabledActions: actions.filter((action) => action.disabled).length,
    duplicatedVisibleLabels: [...labels.values()].filter((count) => count > 1).length,
    expandedPolicySourceDetails: 0,
    footerRows: 0,
    headerLines: 0,
    inlineDisplaySettings: 0,
    modeControlGroups: 0,
    panelsOpenByDefault: 0,
    panelCount: 0,
    primaryPlaybackGroups: 0,
    primaryActions: actions.filter(
      (action) =>
        action.playbackPrimary ||
        action.actionClass === "generation" ||
        action.actionClass === "preview",
    ).length,
    reachableDrawersSheets,
    sourceIdentitySummaries: 0,
    visibleBadges: 0,
    visibleActions: actions.length,
  };
}

function evaluate(metrics, activeBudget) {
  return [
    threshold("visibleActions", metrics.visibleActions, activeBudget.maxVisibleActions),
    threshold("primaryActions", metrics.primaryActions, activeBudget.maxPrimaryActions),
    threshold("disabledActions", metrics.disabledActions, activeBudget.maxDisabledActions),
    threshold("destructiveActions", metrics.destructiveActions, activeBudget.maxDestructiveActions),
    threshold(
      "panelsOpenByDefault",
      metrics.panelsOpenByDefault,
      activeBudget.maxPanelsOpenByDefault,
    ),
    threshold(
      "reachableDrawersSheets",
      metrics.reachableDrawersSheets,
      activeBudget.maxReachableDrawersSheets,
    ),
    threshold(
      "duplicatedVisibleLabels",
      metrics.duplicatedVisibleLabels,
      activeBudget.maxDuplicatedVisibleLabels,
    ),
    threshold(
      "averageAccessibleLabelLength",
      metrics.averageAccessibleLabelLength,
      activeBudget.maxAverageAccessibleLabelLength,
    ),
    threshold("chipsBadges", metrics.chipsBadges, activeBudget.maxChipsBadges),
    threshold("activeModesTabs", metrics.activeModesTabs, activeBudget.maxActiveModesTabs),
    ...optionalThresholds(metrics, activeBudget),
  ];
}

function budget(
  tier,
  visible,
  primary,
  disabled,
  destructive,
  panels,
  drawers,
  duplicates,
  labelLength,
  chips,
  activeModes,
  notes,
  extras = {},
) {
  return {
    ...extras,
    maxActiveModesTabs: activeModes,
    maxAverageAccessibleLabelLength: labelLength,
    maxChipsBadges: chips,
    maxDestructiveActions: destructive,
    maxDisabledActions: disabled,
    maxDuplicatedVisibleLabels: duplicates,
    maxPanelsOpenByDefault: panels,
    maxPrimaryActions: primary,
    maxReachableDrawersSheets: drawers,
    maxVisibleActions: visible,
    notes,
    tier,
  };
}

function optionalThresholds(metrics, activeBudget) {
  return [
    optionalThreshold("visibleBadges", metrics.visibleBadges, activeBudget.maxVisibleBadges),
    optionalThreshold("headerLines", metrics.headerLines, activeBudget.maxHeaderLines),
    optionalThreshold("footerRows", metrics.footerRows, activeBudget.maxFooterRows),
    optionalThreshold("panelCount", metrics.panelCount, activeBudget.maxPanelCount),
    optionalThreshold(
      "primaryPlaybackGroups",
      metrics.primaryPlaybackGroups,
      activeBudget.maxPrimaryPlaybackGroups,
    ),
    optionalThreshold(
      "sourceIdentitySummaries",
      metrics.sourceIdentitySummaries,
      activeBudget.maxSourceIdentitySummaries,
    ),
    optionalThreshold(
      "modeControlGroups",
      metrics.modeControlGroups,
      activeBudget.maxModeControlGroups,
    ),
    optionalThreshold(
      "inlineDisplaySettings",
      metrics.inlineDisplaySettings,
      activeBudget.maxInlineDisplaySettings,
    ),
    optionalThreshold(
      "expandedPolicySourceDetails",
      metrics.expandedPolicySourceDetails,
      activeBudget.maxExpandedPolicySourceDetails,
    ),
  ].filter(Boolean);
}

function optionalThreshold(metric, actual, budgetValue) {
  if (typeof budgetValue !== "number") {
    return null;
  }
  return threshold(metric, actual ?? 0, budgetValue);
}

function websiteReadModeCalmnessSummary(scenarios) {
  const websiteScenarios = scenarios.filter((scenario) => scenario.budgetKey === "websiteReadCalm");
  if (websiteScenarios.length === 0) {
    return null;
  }
  return websiteScenarios.map((scenario) => ({
    after: pickWebsiteReadModeMetrics(scenario.metrics),
    beforeBudget: pickWebsiteReadModeBudget(budgets.readMode),
    scenarioId: scenario.id,
    status: scenario.status,
    websiteCalmBudget: pickWebsiteReadModeBudget(scenario.budget),
  }));
}

function pickWebsiteReadModeMetrics(metrics) {
  return {
    expandedPolicySourceDetails: metrics.expandedPolicySourceDetails ?? 0,
    footerRows: metrics.footerRows ?? 0,
    headerLines: metrics.headerLines ?? 0,
    inlineDisplaySettings: metrics.inlineDisplaySettings ?? 0,
    modeControlGroups: metrics.modeControlGroups ?? 0,
    panelCount: metrics.panelCount ?? 0,
    primaryPlaybackGroups: metrics.primaryPlaybackGroups ?? 0,
    sourceIdentitySummaries: metrics.sourceIdentitySummaries ?? 0,
    visibleActions: metrics.visibleActions,
    visibleBadges: metrics.visibleBadges ?? 0,
  };
}

function pickWebsiteReadModeBudget(activeBudget) {
  return {
    expandedPolicySourceDetails: activeBudget.maxExpandedPolicySourceDetails ?? null,
    footerRows: activeBudget.maxFooterRows ?? null,
    headerLines: activeBudget.maxHeaderLines ?? null,
    inlineDisplaySettings: activeBudget.maxInlineDisplaySettings ?? null,
    modeControlGroups: activeBudget.maxModeControlGroups ?? null,
    panelCount: activeBudget.maxPanelCount ?? null,
    primaryPlaybackGroups: activeBudget.maxPrimaryPlaybackGroups ?? null,
    sourceIdentitySummaries: activeBudget.maxSourceIdentitySummaries ?? null,
    visibleActions: activeBudget.maxVisibleActions,
    visibleBadges: activeBudget.maxVisibleBadges ?? null,
  };
}

function threshold(metric, actual, budgetValue) {
  return {
    actual,
    budget: budgetValue,
    metric,
    operator: "<=",
    passed: actual <= budgetValue,
  };
}

function budgetKeyForSurface(surface) {
  if (surface === "Settings" || surface === "UI Memory" || surface === "Speech Policy") {
    return "settingsQuick";
  }
  if (surface === "Command Palette" || surface === "Voice Dashboard") {
    return "commandPalette";
  }
  if (surface === "Teleprompt") {
    return "teleprompt";
  }
  if (surface === "Review") {
    return "reviewWorkspace";
  }
  if (surface === "WebsiteCinema") {
    return "websiteReadCalm";
  }
  if (surface === "BookCinema" || surface === "DocumentCinema") {
    return "readMode";
  }
  return "workspace";
}

function renderMarkdown(document) {
  const lines = [
    "# Surface Complexity Budget",
    "",
    `Status: **${document.status.toUpperCase()}**`,
    `Generated: ${document.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Scenarios: ${String(document.summary.scenarios)}`,
    `- Surfaces: ${String(document.summary.surfaces)}`,
    `- Failures: ${String(document.summary.failures)}`,
    `- Max visible actions: ${String(document.summary.maxVisibleActions)}`,
    "",
    "## Scenarios",
    "",
    "| Scenario | Surface | Tier | Visible | Primary | Disabled | Duplicates | Chips | Active Modes | Status |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const scenario of document.scenarios) {
    lines.push(
      `| ${escapeMarkdown(scenario.label)} | ${escapeMarkdown(scenario.surface)} | ${
        scenario.budget.tier
      } | ${String(scenario.metrics.visibleActions)}/${String(
        scenario.budget.maxVisibleActions,
      )} | ${String(scenario.metrics.primaryActions)}/${String(
        scenario.budget.maxPrimaryActions,
      )} | ${String(scenario.metrics.disabledActions)}/${String(
        scenario.budget.maxDisabledActions,
      )} | ${String(scenario.metrics.duplicatedVisibleLabels)}/${String(
        scenario.budget.maxDuplicatedVisibleLabels,
      )} | ${String(scenario.metrics.chipsBadges)}/${String(
        scenario.budget.maxChipsBadges,
      )} | ${String(scenario.metrics.activeModesTabs)}/${String(
        scenario.budget.maxActiveModesTabs,
      )} | ${scenario.status.toUpperCase()} |`,
    );
  }
  lines.push("", "## Budget Notes", "");
  if (document.websiteReadModeCalmness?.length) {
    lines.push("## Website Cinema Read-Mode Calmness", "");
    for (const item of document.websiteReadModeCalmness) {
      lines.push(`### ${item.scenarioId}`, "");
      lines.push("| Metric | Before general read budget | Calm budget | Actual |");
      lines.push("| --- | ---: | ---: | ---: |");
      for (const metric of Object.keys(item.after)) {
        lines.push(
          `| ${metric} | ${formatBudgetCell(item.beforeBudget[metric])} | ${formatBudgetCell(
            item.websiteCalmBudget[metric],
          )} | ${String(item.after[metric])} |`,
        );
      }
      lines.push("");
    }
  }
  for (const [key, activeBudget] of Object.entries(budgets)) {
    lines.push(`### ${key}`, "");
    for (const note of activeBudget.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }
  if (document.failures.length > 0) {
    lines.push("## Failures", "");
    for (const failure of document.failures) {
      lines.push(
        `- ${failure.scenarioId} (${failure.surface}) ${failure.metric}: ${String(
          failure.actual,
        )} > ${String(failure.budget)}`,
      );
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function escapeMarkdown(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}

function formatBudgetCell(value) {
  return typeof value === "number" ? String(value) : "n/a";
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
