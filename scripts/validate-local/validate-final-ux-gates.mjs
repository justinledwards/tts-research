#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createRunContext, finalizeRun, runCallbackStep, runCommandStep } from "./reporting.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const isMain = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

export const finalUxGateOutputDir =
  process.env.FINAL_UX_GATES_OUTPUT_DIR ?? path.join(rootDir, "output", "final-ux-gates", "latest");

export async function runFinalUxGates({ outputDir = finalUxGateOutputDir, root = rootDir } = {}) {
  const context = await createRunContext({ kind: "validate-ux-final", outputDir, rootDir: root });
  const commandSteps = buildFinalUxCommandSteps(context);

  for (const step of commandSteps) {
    await runCommandStep(context, step);
  }

  await runCallbackStep(
    context,
    {
      command: "evaluate final UX gates",
      id: "final-ux-gate-report",
      title: "Final UX Gate Report",
    },
    async ({ log }) => {
      const result = await writeFinalUxGateArtifacts({
        commandSteps: context.summary.steps.filter((step) => step.type === "command"),
        context,
      });
      log(`Final UX results: ${result.files.results}`);
      log(`Final UX summary: ${result.files.summary}`);
      return {
        artifacts: {
          finalUxResults: result.files.results,
          finalUxSummary: result.files.summary,
        },
        metrics: {
          failedGates: result.summary.failed,
          passedGates: result.summary.passed,
          totalGates: result.summary.total,
          waivers: result.waivers.length,
        },
        thresholds: result.gates.map((gate) => ({
          actual: gate.status,
          expected: "passed",
          metric: gate.id,
          operator: "===",
          passed: gate.status === "passed",
          threshold: gate.title,
        })),
      };
    },
  );

  const summary = await finalizeRun(context);
  console.log(
    `validate:ux-final ${summary.status}; report: ${path.join(outputDir, "final-ux-summary.md")}`,
  );
  return summary;
}

export function buildFinalUxCommandSteps(context) {
  const artifactsDir = context.artifactsDir;
  return [
    {
      args: ["e2e:ui-actions"],
      artifacts: finalUiActionArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        UI_ACTION_AUDIT_OUTPUT_DIR: path.join(artifactsDir, "ui-actions"),
        UI_ACTION_AUDIT_SUMMARY_PATH: path.join(artifactsDir, "ui-actions", "summary.json"),
      },
      id: "ui-actions",
      title: "UI Action Audit",
    },
    {
      args: ["e2e:teleprompt-memory"],
      artifacts: finalTelepromptArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_TELEPROMPT_MEMORY_OUTPUT_DIR: path.join(artifactsDir, "teleprompt-memory"),
      },
      id: "teleprompt-memory",
      title: "Teleprompt Theatre and Memory",
    },
    {
      args: ["e2e:readalong-sync"],
      artifacts: finalReadAlongSyncArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_READALONG_SYNC_OUTPUT_DIR: path.join(artifactsDir, "readalong-sync"),
      },
      id: "readalong-sync",
      title: "Read-along Sync",
    },
    {
      args: ["e2e:accessibility-audit"],
      artifacts: finalAccessibilityArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_ACCESSIBILITY_FINDINGS_PATH: path.join(
          artifactsDir,
          "accessibility-audit",
          "a11y-findings.json",
        ),
        E2E_ACCESSIBILITY_OUTPUT_DIR: path.join(artifactsDir, "accessibility-audit"),
      },
      id: "accessibility-audit",
      title: "Accessibility Audit",
    },
    {
      args: ["e2e:responsive-snapshots"],
      artifacts: finalResponsiveArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_RESPONSIVE_OUTPUT_DIR: path.join(artifactsDir, "responsive-snapshots"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(artifactsDir, "responsive-snapshots"),
      },
      id: "responsive-snapshots",
      title: "Responsive Snapshots",
    },
    {
      args: ["e2e:command-palette"],
      artifacts: finalCommandPaletteArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_COMMAND_PALETTE_OUTPUT_DIR: path.join(artifactsDir, "command-palette"),
      },
      id: "command-palette",
      title: "Command Palette",
    },
    {
      args: ["e2e:context-panel"],
      artifacts: finalContextPanelArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        E2E_CONTEXT_PANEL_OUTPUT_DIR: path.join(artifactsDir, "context-panel"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: path.join(artifactsDir, "context-panel"),
      },
      id: "context-panel",
      title: "Context Panel",
    },
    {
      args: ["e2e:surface-complexity"],
      artifacts: finalSurfaceComplexityArtifacts(artifactsDir),
      command: "pnpm",
      env: {
        UI_COMPLEXITY_OUTPUT_DIR: path.join(artifactsDir, "surface-complexity"),
      },
      id: "surface-complexity",
      title: "Surface Complexity",
    },
  ];
}

export async function writeFinalUxGateArtifacts({ commandSteps, context }) {
  const artifactPaths = finalUxArtifactPaths(context.artifactsDir);
  const documents = await readFinalUxDocuments(artifactPaths);
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps,
    documents,
    generatedAt: new Date().toISOString(),
    outputDir: context.outputDir,
    rootDir: context.rootDir,
  });
  const files = {
    results: path.join(context.outputDir, "final-ux-results.json"),
    summary: path.join(context.outputDir, "final-ux-summary.md"),
  };
  const withFiles = {
    ...result,
    files,
    reports: {
      validateLocalHtml: path.join(context.outputDir, "report.html"),
      validateLocalMarkdown: path.join(context.outputDir, "report.md"),
      validateLocalSummary: path.join(context.outputDir, "summary.json"),
    },
  };
  await writeFile(files.results, `${JSON.stringify(withFiles, null, 2)}\n`);
  await writeFile(files.summary, renderFinalUxSummary(withFiles));
  return withFiles;
}

export function evaluateFinalUxGates({
  artifactPaths,
  commandSteps = [],
  documents,
  generatedAt = new Date().toISOString(),
  outputDir = ".",
  rootDir = ".",
}) {
  const commandFailures = commandSteps.filter((step) => step.status !== "passed");
  const gates = [
    evaluateMoreMenuGate(documents),
    evaluateTelepromptEntryGate(documents),
    evaluateFullscreenFallbackGate(documents),
    evaluateTelepromptReturnMemoryGate(documents),
    evaluateReadAlongBudgetGate(documents),
    evaluateWrongNodeGate(documents),
    evaluateStaleHighlightGate(documents),
    evaluateAccessibilityReadAlongGate(documents),
    evaluateActionOwnerGate(documents),
    evaluateDisabledReasonGate(documents),
  ].map((gate) => ({
    ...gate,
    artifactPaths: gate.artifactKeys.map((key) => relativePath(outputDir, artifactPaths[key])),
  }));
  const waivers = collectFinalUxWaivers(documents);
  const failedGates = gates.filter((gate) => gate.status !== "passed");
  const summary = {
    commandsFailed: commandFailures.length,
    failed: failedGates.length,
    passed: gates.length - failedGates.length,
    total: gates.length,
    waivers: waivers.length,
  };
  return {
    artifactPaths: Object.fromEntries(
      Object.entries(artifactPaths).map(([key, filePath]) => [
        key,
        relativePath(outputDir, filePath),
      ]),
    ),
    commandRunList: commandSteps.map((step) => commandRunEntry(step, outputDir)),
    commands: {
      failed: commandFailures.map((step) => step.id),
      total: commandSteps.length,
    },
    gates,
    generatedAt,
    outputDir,
    rootDir,
    schemaVersion: "final-ux-gates.v1",
    status: commandFailures.length === 0 && failedGates.length === 0 ? "passed" : "failed",
    summary,
    waivers,
  };
}

function evaluateMoreMenuGate(documents) {
  const requiredSurfaces = ["BookCinema", "DocumentCinema", "WebsiteCinema"];
  const results = documents.actionResults?.results ?? [];
  const actions = documents.actionInventory?.actions ?? [];
  const failures = [];
  const evidence = [];
  const moreActions = actions.filter(isCinemaMoreMenuAction);

  for (const surface of requiredSurfaces) {
    const surfaceInventory = moreActions.filter((action) => action.surface === surface);
    if (surfaceInventory.length === 0) {
      failures.push(`${surface} did not expose the Cinema More menu in the action inventory.`);
      continue;
    }
    if (surfaceInventory.some((action) => action.disabled)) {
      failures.push(`${surface} Cinema More menu was disabled.`);
    }
    if (surfaceInventory.some((action) => !action.owner)) {
      failures.push(`${surface} Cinema More menu did not declare an action owner.`);
    }
    for (const mode of ["pointer", "keyboard"]) {
      const matchingResults = results.filter(
        (result) =>
          result.surface === surface &&
          result.actionId === "ui-action-cinema-more-menu" &&
          result.activationMode === mode,
      );
      const passed = matchingResults.some(
        (result) =>
          result.passed && (result.stateDelta?.menuChanged || /menu/i.test(result.outcome ?? "")),
      );
      if (!passed) {
        failures.push(`${surface} Cinema More menu did not open by ${mode}.`);
      }
    }
    evidence.push(`${surface}: pointer and keyboard menu-open evidence recorded.`);
  }

  const menuItemCount = actions.filter(
    (action) =>
      action.scenarioId === "book-more-menu" && /^ui-action-cinema-more-/.test(action.actionId),
  ).length;
  if (menuItemCount < 6) {
    failures.push(`Cinema More menu only exposed ${String(menuItemCount)} menu entries.`);
  } else {
    evidence.push(`Cinema More menu entries observed: ${String(menuItemCount)}.`);
  }

  return gate({
    artifactKeys: ["actionInventory", "actionResults"],
    evidence,
    failures,
    id: "more-menu-functional",
    title: "More menu is functional on every Cinema surface",
  });
}

function evaluateTelepromptEntryGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const required = [
    {
      label: "Preview to Theatre",
      pattern: /Teleprompt Theatre opens .*from Preview|Teleprompt Theatre opens with presenter/i,
    },
    {
      label: "Review to Theatre",
      pattern: /Teleprompt Theatre opens .*from Review/i,
    },
  ];
  const evidence = [];
  for (const item of required) {
    if (checks.some((check) => item.pattern.test(check))) {
      evidence.push(item.label);
    } else {
      failures.push(`${item.label} was not verified by Teleprompt memory E2E.`);
    }
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults", "telepromptMemoryReport"],
    evidence,
    failures,
    id: "teleprompt-theatre-entrypoints",
    title: "Teleprompt Theatre opens from Review and Preview",
  });
}

function evaluateFullscreenFallbackGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const responsiveSummary = documents.responsiveResults?.summary ?? {};
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const evidence = [];
  if (
    checks.some((check) =>
      /Native fullscreen action is reachable|Native fullscreen fallback explains/i.test(check),
    )
  ) {
    evidence.push("Native fullscreen reachable or fallback reason exposed.");
  } else {
    failures.push("Native fullscreen availability/fallback was not verified.");
  }
  if (
    documents.responsiveResults?.status === "passed" &&
    Number(responsiveSummary.telepromptTheatreFailures ?? 0) === 0 &&
    Number(responsiveSummary.viewports ?? 0) >= 3
  ) {
    evidence.push(
      `Theatre fallback passed ${String(responsiveSummary.viewports)} responsive viewports.`,
    );
  } else {
    failures.push("Teleprompt Theatre fallback did not pass responsive viewport validation.");
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults", "responsiveResults"],
    evidence,
    failures,
    id: "teleprompt-fullscreen-fallback",
    title: "Native fullscreen and Theatre fallback are verified",
  });
}

function evaluateTelepromptReturnMemoryGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const requiredPatterns = [
    /^Escape exits Theatre while preserving inline Teleprompt state\.$/i,
    /^Preview return target persisted\.$/i,
    /^Review return target persisted\.$/i,
  ];
  const evidence = [];
  for (const pattern of requiredPatterns) {
    const check = checks.find((candidate) => pattern.test(candidate));
    if (check) {
      evidence.push(check);
    } else {
      failures.push(`Missing Teleprompt memory check: ${pattern.source}`);
    }
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults"],
    evidence,
    failures,
    id: "teleprompt-return-memory",
    title: "Teleprompt return memory survives theatre/fullscreen exit",
  });
}

function evaluateReadAlongBudgetGate(documents) {
  const sync = documents.readalongSync;
  const failedComparisons = (sync?.comparisons ?? []).filter((comparison) => !comparison.passed);
  const failures = [
    ...(sync?.status === "passed"
      ? []
      : [`Read-along sync status was ${sync?.status ?? "missing"}.`]),
    ...failedComparisons.map(
      (comparison) =>
        `${comparison.metric}: ${String(comparison.actual)} ${comparison.operator} ${String(
          comparison.expected,
        )}`,
    ),
  ];
  return gate({
    artifactKeys: ["readalongSyncMetrics", "readalongSyncSummary", "readalongSyncTimeline"],
    evidence: [
      `Median word drift ${String(sync?.metrics?.medianWordDriftMs ?? "missing")} ms.`,
      `P95 word drift ${String(sync?.metrics?.p95WordDriftMs ?? "missing")} ms.`,
      `Max phrase drift ${String(sync?.metrics?.maxPhraseDriftMs ?? "missing")} ms.`,
    ],
    failures,
    id: "readalong-sync-budget",
    title: "Read-along sync passes word and phrase budgets",
  });
}

function evaluateWrongNodeGate(documents) {
  const metrics = documents.readalongSync?.metrics ?? {};
  const browser = documents.readalongSync?.browser ?? {};
  const failures = [];
  if (Number(metrics.wrongNodeCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Wrong-node highlight count was ${String(metrics.wrongNodeCount)}.`);
  }
  if (Number(metrics.wrongWordCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Wrong-word highlight count was ${String(metrics.wrongWordCount)}.`);
  }
  if (Number(browser.failureCount ?? 0) !== 0) {
    failures.push(`Read-along browser evidence had ${String(browser.failureCount)} failures.`);
  }
  return gate({
    artifactKeys: ["readalongSyncMetrics"],
    evidence: [
      `Wrong-node count ${String(metrics.wrongNodeCount ?? "missing")}.`,
      `Wrong-word count ${String(metrics.wrongWordCount ?? "missing")}.`,
      `Browser failures ${String(browser.failureCount ?? 0)}.`,
    ],
    failures,
    id: "readalong-zero-wrong-node",
    title: "Wrong-node highlight is zero",
  });
}

function evaluateStaleHighlightGate(documents) {
  const metrics = documents.readalongSync?.metrics ?? {};
  const staleRows = (documents.readalongSync?.timeline ?? []).filter(
    (row) => row.runtimeState === "stale-audio" || row.fixtureId === "stale-audio",
  );
  const failures = [];
  if (Number(metrics.staleHighlightCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Stale highlight count was ${String(metrics.staleHighlightCount)}.`);
  }
  const badRows = staleRows.filter(
    (row) => row.highlightedNodeId || row.highlightedWordIndex !== null || row.failures?.length,
  );
  if (badRows.length > 0) {
    failures.push(
      `Stale-audio evidence still rendered ${String(badRows.length)} active highlights.`,
    );
  }
  return gate({
    artifactKeys: ["readalongSyncMetrics", "readalongSyncTimeline"],
    evidence: [
      `Stale highlight count ${String(metrics.staleHighlightCount ?? "missing")}.`,
      `Stale rows inspected ${String(staleRows.length)}.`,
    ],
    failures,
    id: "stale-audio-no-highlight",
    title: "Stale audio cannot drive highlight",
  });
}

function evaluateAccessibilityReadAlongGate(documents) {
  const highContrastScenario = (documents.accessibilityResults?.results ?? []).find((result) =>
    /high-contrast|reduced-motion/i.test(result.id ?? result.label ?? ""),
  );
  const sync = documents.readalongSync;
  const failures = [];
  if (!highContrastScenario) {
    failures.push("Accessibility audit did not include a high-contrast reduced-motion scenario.");
  } else if (
    Number(highContrastScenario.scan?.failCount ?? 0) !== 0 ||
    (highContrastScenario.browserIssues ?? []).length !== 0
  ) {
    failures.push("High-contrast reduced-motion accessibility scenario had failures.");
  }
  if (sync?.status !== "passed") {
    failures.push("Read-along sync did not pass alongside accessibility evidence.");
  }
  return gate({
    artifactKeys: ["accessibilityResults", "readalongSyncMetrics"],
    evidence: [
      `Accessibility status ${documents.accessibilityResults?.status ?? "missing"}.`,
      `High-contrast/reduced-motion scenario ${highContrastScenario ? "recorded" : "missing"}.`,
      `Read-along sync status ${sync?.status ?? "missing"}.`,
    ],
    failures,
    id: "readalong-accessibility-modes",
    title: "Reduced motion and high contrast work during read-along",
  });
}

function evaluateActionOwnerGate(documents) {
  const actions = documents.actionInventory?.actions ?? [];
  const commandPalette = documents.commandPaletteResults;
  const ownershipIssues = actions.filter((action) =>
    (action.metadataIssues ?? []).some((issue) =>
      [
        "missing-owner",
        "playback-action-without-owner",
        "duplicate-playback-action-owner",
        "multiple-primary-playback-owners",
      ].includes(issue),
    ),
  );
  const failures = ownershipIssues.map(
    (action) => `${action.scenarioId}:${action.label} has ${action.metadataIssues.join(", ")}`,
  );
  if (commandPalette?.status !== "passed") {
    failures.push(`Command palette status was ${commandPalette?.status ?? "missing"}.`);
  }
  const advancedCommands = commandPalette?.result?.commandsObserved?.filter((command) =>
    /Advanced|Diagnostics|Timing map|Alignment repair/i.test(command.title),
  );
  if (!advancedCommands?.length) {
    failures.push("Command palette did not expose advanced/debug owner commands.");
  }
  return gate({
    artifactKeys: ["actionInventory", "commandPaletteResults"],
    evidence: [
      `Action ownership issues ${String(ownershipIssues.length)}.`,
      `Command palette commands observed ${String(commandPalette?.summary?.commandsObserved ?? "missing")}.`,
      `Advanced/debug commands observed ${String(advancedCommands?.length ?? 0)}.`,
    ],
    failures,
    id: "command-visible-owner-parity",
    title: "Command palette and visible controls share action owners",
  });
}

function evaluateDisabledReasonGate(documents) {
  const actions = documents.actionInventory?.actions ?? [];
  const disabledActionsWithoutReason = actions.filter(
    (action) =>
      action.disabled && !explicitReason(action.disabledReason ?? action.capabilityReason),
  );
  const disabledCommandsWithoutReason = (
    documents.commandPaletteResults?.result?.disabledCommands ?? []
  ).filter((command) => !explicitReason(command.reason));
  const accessibilityFailures = documents.accessibilityResults?.summary?.failures ?? 0;
  const failures = [
    ...disabledActionsWithoutReason.map(
      (action) => `${action.scenarioId}:${action.label} disabled without visible reason`,
    ),
    ...disabledCommandsWithoutReason.map(
      (command) => `${command.id || command.title} command disabled without visible reason`,
    ),
  ];
  if (Number(accessibilityFailures) > 0) {
    failures.push(`Accessibility audit had ${String(accessibilityFailures)} failures.`);
  }
  return gate({
    artifactKeys: ["actionInventory", "commandPaletteResults", "accessibilityResults"],
    evidence: [
      `Disabled visible controls ${String(actions.filter((action) => action.disabled).length)}.`,
      `Disabled commands ${String(documents.commandPaletteResults?.summary?.disabledCommands ?? "missing")}.`,
      `Accessibility disabled-reason failures included in total ${String(accessibilityFailures)}.`,
    ],
    failures,
    id: "disabled-controls-explain-why",
    title: "All disabled controls explain why",
  });
}

function gate({ artifactKeys, evidence = [], failures = [], id, title }) {
  return {
    artifactKeys,
    evidence,
    failures,
    id,
    status: failures.length === 0 ? "passed" : "failed",
    title,
  };
}

function isCinemaMoreMenuAction(action) {
  return (
    action.actionId === "ui-action-cinema-more-menu" ||
    /Open Cinema More menu/i.test(action.label ?? "")
  );
}

function collectFinalUxWaivers(documents) {
  return (documents.readalongSync?.waivers ?? []).map((waiver) => ({
    fixtureId: waiver.fixtureId,
    owner: waiver.owner,
    reason: waiver.reason,
    source: "readalong-sync",
  }));
}

function explicitReason(value) {
  return String(value ?? "").trim().length > 0;
}

export function renderFinalUxSummary(result) {
  const lines = [
    "# Final UX Gates",
    "",
    `Status: **${result.status.toUpperCase()}**`,
    `Generated: ${result.generatedAt}`,
    "",
    "## Summary",
    "",
    `- Gates: ${String(result.summary.passed)}/${String(result.summary.total)} passed`,
    `- Command failures: ${String(result.summary.commandsFailed)}`,
    `- Waivers: ${String(result.summary.waivers)}`,
    "",
    "## Gate Results",
    "",
    "| Gate | Status | Evidence | Artifacts |",
    "| --- | --- | --- | --- |",
  ];
  for (const gateResult of result.gates) {
    lines.push(
      `| ${escapeMarkdown(gateResult.title)} | ${gateResult.status.toUpperCase()} | ${escapeMarkdown(
        gateResult.evidence.join("; ") || "-",
      )} | ${gateResult.artifactPaths.map((item) => `[${escapeMarkdown(item)}](${encodeURI(item)})`).join("<br>")} |`,
    );
  }
  const failedGates = result.gates.filter((gateResult) => gateResult.status !== "passed");
  if (failedGates.length > 0) {
    lines.push("", "## Failures", "");
    for (const gateResult of failedGates) {
      lines.push(`### ${gateResult.title}`, "");
      for (const failure of gateResult.failures) {
        lines.push(`- ${failure}`);
      }
      lines.push("");
    }
  }
  lines.push("", "## Commands", "", "| Command | Status | Log |");
  lines.push("| --- | --- | --- |");
  for (const command of result.commandRunList) {
    lines.push(
      `| ${escapeMarkdown(command.title)} | ${command.status.toUpperCase()} | [log](${encodeURI(
        command.logPath,
      )}) |`,
    );
  }
  lines.push("", "## Waivers", "");
  if (result.waivers.length === 0) {
    lines.push("No waivers declared.");
  } else {
    for (const waiver of result.waivers) {
      lines.push(`- ${waiver.fixtureId}: ${waiver.reason} (owner: ${waiver.owner})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function commandRunEntry(step, outputDir) {
  return {
    durationMs: step.durationMs,
    exitCode: step.exitCode,
    id: step.id,
    logPath: step.logPath ? path.relative(outputDir, step.logPath) : "",
    status: step.status,
    title: step.title,
  };
}

async function readFinalUxDocuments(paths) {
  return {
    accessibilityResults: await readJsonIfPresent(paths.accessibilityResults),
    actionInventory: await readJsonIfPresent(paths.actionInventory),
    actionResults: await readJsonIfPresent(paths.actionResults),
    commandPaletteResults: await readJsonIfPresent(paths.commandPaletteResults),
    contextPanelResults: await readJsonIfPresent(paths.contextPanelResults),
    readalongSync: await readJsonIfPresent(paths.readalongSyncMetrics),
    responsiveResults: await readJsonIfPresent(paths.responsiveResults),
    surfaceComplexity: await readJsonIfPresent(paths.surfaceComplexityBudget),
    telepromptMemory: await readJsonIfPresent(paths.telepromptMemoryResults),
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function finalUxArtifactPaths(artifactsDir) {
  return {
    accessibilityResults: path.join(
      artifactsDir,
      "accessibility-audit",
      "accessibility-results.json",
    ),
    actionInventory: path.join(artifactsDir, "ui-actions", "action-inventory.json"),
    actionResults: path.join(artifactsDir, "ui-actions", "action-results.json"),
    commandPaletteReport: path.join(artifactsDir, "command-palette", "command-palette-report.md"),
    commandPaletteResults: path.join(
      artifactsDir,
      "command-palette",
      "command-palette-results.json",
    ),
    contextPanelResults: path.join(artifactsDir, "context-panel", "context-panel-results.json"),
    readalongSyncMetrics: path.join(artifactsDir, "readalong-sync", "sync-metrics.json"),
    readalongSyncSummary: path.join(artifactsDir, "readalong-sync", "sync-summary.md"),
    readalongSyncTimeline: path.join(artifactsDir, "readalong-sync", "drift-timeline.json"),
    responsiveResults: path.join(artifactsDir, "responsive-snapshots", "responsive-results.json"),
    surfaceComplexityBudget: path.join(artifactsDir, "surface-complexity", "budget.json"),
    telepromptMemoryReport: path.join(
      artifactsDir,
      "teleprompt-memory",
      "teleprompt-memory-report.md",
    ),
    telepromptMemoryResults: path.join(
      artifactsDir,
      "teleprompt-memory",
      "teleprompt-memory-results.json",
    ),
  };
}

function finalUiActionArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "ui-actions");
  return {
    actionInventory: path.join(dir, "action-inventory.json"),
    actionResults: path.join(dir, "action-results.json"),
    deadControls: path.join(dir, "dead-controls.md"),
    duplicates: path.join(dir, "duplicates.md"),
    overlayCollisions: path.join(dir, "overlay-collisions.json"),
    reviewerSummary: path.join(dir, "reviewer-summary.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalTelepromptArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "teleprompt-memory");
  return {
    screenshots: path.join(dir, "screenshots"),
    telepromptMemoryReport: path.join(dir, "teleprompt-memory-report.md"),
    telepromptMemoryResults: path.join(dir, "teleprompt-memory-results.json"),
  };
}

function finalReadAlongSyncArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "readalong-sync");
  return {
    screenshots: path.join(dir, "screenshots"),
    syncMetrics: path.join(dir, "sync-metrics.json"),
    syncSummary: path.join(dir, "sync-summary.md"),
    syncTimeline: path.join(dir, "drift-timeline.json"),
  };
}

function finalAccessibilityArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "accessibility-audit");
  return {
    accessibilityFindings: path.join(dir, "a11y-findings.json"),
    accessibilityReport: path.join(dir, "accessibility-report.md"),
    accessibilityResults: path.join(dir, "accessibility-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalResponsiveArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "responsive-snapshots");
  return {
    responsiveResults: path.join(dir, "responsive-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalCommandPaletteArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "command-palette");
  return {
    commandPaletteReport: path.join(dir, "command-palette-report.md"),
    commandPaletteResults: path.join(dir, "command-palette-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalContextPanelArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "context-panel");
  return {
    contextPanelReport: path.join(dir, "context-panel-report.md"),
    contextPanelResults: path.join(dir, "context-panel-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalSurfaceComplexityArtifacts(artifactsDir) {
  const dir = path.join(artifactsDir, "surface-complexity");
  return {
    budgetJson: path.join(dir, "budget.json"),
    budgetReport: path.join(dir, "budget.md"),
  };
}

function relativePath(fromDir, filePath) {
  return path.relative(fromDir, filePath);
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

if (isMain) {
  runFinalUxGates()
    .then((summary) => {
      process.exitCode = summary.status === "passed" ? 0 : 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
}
