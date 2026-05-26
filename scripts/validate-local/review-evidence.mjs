#!/usr/bin/env node

import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createRunContext,
  finalizeRun,
  formatDuration,
  runCallbackStep,
  runCommandStep,
} from "./reporting.mjs";

const execFile = promisify(execFileCallback);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const REQUIRED_REVIEW_SURFACES = [
  "Workspace",
  "Intake",
  "Review",
  "Preview",
  "Teleprompt",
  "Book Cinema",
  "Document Cinema",
  "Website Cinema",
  "Settings",
  "Command Palette",
  "Project Dashboard",
  "Voice Dashboard",
  "UI Memory",
];

const surfaceAliases = {
  "Book Cinema": ["BookCinema"],
  "Command Palette": ["Command Palette"],
  "Document Cinema": ["DocumentCinema"],
  Intake: ["Intake"],
  Preview: ["Preview", "Preview mini-player"],
  "Project Dashboard": ["Project Dashboard"],
  Review: ["Review"],
  Settings: ["Settings"],
  Teleprompt: ["Teleprompt"],
  "UI Memory": ["UI Memory"],
  "Voice Dashboard": ["Voice Dashboard"],
  Website: ["WebsiteCinema"],
  "Website Cinema": ["WebsiteCinema"],
  Workspace: ["Workspace"],
};

export async function runReviewEvidence({
  outputDir = path.join(rootDir, "output", "review", "latest"),
  root = rootDir,
} = {}) {
  const context = await createRunContext({ kind: "review-local", outputDir, rootDir: root });
  const gitInfo = await readGitInfo(root);
  const reviewSteps = buildReviewSteps(context);

  for (const step of reviewSteps) {
    await runCommandStep(context, step);
  }

  await runCallbackStep(
    context,
    {
      command: "generate review manifest",
      id: "review-evidence-bundle",
      title: "Review Evidence Bundle",
    },
    async ({ log }) => {
      const bundle = await writeReviewBundle({ context, gitInfo, reviewSteps });
      log(`Review manifest: ${bundle.reviewFiles.reviewManifest}`);
      log(`Reviewer summary: ${bundle.reviewFiles.reviewerSummary}`);
      log(`Missing required artifacts: ${String(bundle.passFailSummary.artifacts.missing)}`);
      return {
        artifacts: bundle.reviewFiles,
        metrics: {
          commandFailures: bundle.passFailSummary.commands.failed,
          missingRequiredArtifacts: bundle.passFailSummary.artifacts.missing,
          requiredArtifacts: bundle.passFailSummary.artifacts.total,
          surfacesCovered: bundle.surfaceCoverage.filter((item) => item.status === "covered")
            .length,
          waivers: bundle.waivers.length,
        },
        thresholds: [
          {
            actual: bundle.passFailSummary.artifacts.missing,
            expected: 0,
            metric: "requiredReviewArtifactsMissing",
            operator: "===",
            passed: bundle.passFailSummary.artifacts.missing === 0,
            threshold: "allRequiredReviewArtifactsPresent",
          },
          {
            actual: bundle.passFailSummary.surfaces.missing.length,
            expected: 0,
            metric: "requiredReviewSurfacesMissing",
            operator: "===",
            passed: bundle.passFailSummary.surfaces.missing.length === 0,
            threshold: "allRequiredReviewSurfacesCovered",
          },
        ],
      };
    },
  );

  const summary = await finalizeRun(context);
  console.log(
    `review:local ${summary.status}; manifest: ${path.join(outputDir, "review-manifest.json")}`,
  );
  return summary;
}

export function buildReviewSteps(context) {
  return [
    {
      args: ["check"],
      command: "pnpm",
      id: "check",
      title: "Project Check",
    },
    {
      args: ["e2e:ui-actions"],
      artifacts: uiActionArtifacts(context, "ui-actions-e2e"),
      command: "pnpm",
      env: {
        UI_ACTION_AUDIT_OUTPUT_DIR: artifactDir(context, "ui-actions-e2e"),
      },
      id: "ui-actions-e2e",
      title: "UI Action Audit E2E",
    },
    {
      args: ["e2e:surface-complexity"],
      artifacts: surfaceComplexityArtifacts(context, "surface-complexity-budget-e2e"),
      command: "pnpm",
      env: {
        UI_COMPLEXITY_OUTPUT_DIR: artifactDir(context, "surface-complexity-budget-e2e"),
      },
      id: "surface-complexity-budget-e2e",
      title: "Surface Complexity Budget",
    },
    bookCinemaStep(context, {
      id: "workspace-flow-e2e",
      script: "e2e:workspace-flow",
      title: "Workspace Flow E2E",
    }),
    bookCinemaStep(context, {
      id: "settings-ia-e2e",
      script: "e2e:settings-ia",
      title: "Settings IA E2E",
    }),
    bookCinemaStep(context, {
      id: "reader-wayfinding-e2e",
      script: "e2e:reader-wayfinding",
      title: "Reader Wayfinding E2E",
    }),
    bookCinemaStep(context, {
      id: "book-cinema-e2e",
      script: "e2e:book-cinema",
      title: "Book Cinema E2E",
    }),
    {
      args: ["e2e:read-along-fidelity"],
      artifacts: readAlongFidelityArtifacts(context, "read-along-fidelity-e2e"),
      command: "pnpm",
      env: {
        E2E_READ_ALONG_OUTPUT_DIR: artifactDir(context, "read-along-fidelity-e2e"),
      },
      id: "read-along-fidelity-e2e",
      title: "Read-along Fidelity E2E",
    },
    {
      args: ["e2e:readalong-sync"],
      artifacts: readAlongSyncArtifacts(context, "readalong-sync-e2e"),
      command: "pnpm",
      env: {
        E2E_READALONG_SYNC_OUTPUT_DIR: artifactDir(context, "readalong-sync-e2e"),
      },
      id: "readalong-sync-e2e",
      title: "Read-along Sync E2E",
    },
    bookCinemaStep(context, {
      id: "book-cinema-responsive-e2e",
      script: "e2e:book-cinema:responsive",
      title: "Book Cinema Responsive E2E",
    }),
    bookCinemaStep(context, {
      id: "book-cinema-low-resource-e2e",
      includePerformanceArtifacts: true,
      script: "e2e:book-cinema:low-resource",
      title: "Book Cinema Low-resource E2E",
    }),
    {
      args: ["e2e:accessibility-audit"],
      artifacts: accessibilityArtifacts(context, "accessibility-audit-e2e"),
      command: "pnpm",
      env: {
        E2E_ACCESSIBILITY_FINDINGS_PATH: path.join(
          artifactDir(context, "accessibility-audit-e2e"),
          "a11y-findings.json",
        ),
        E2E_ACCESSIBILITY_OUTPUT_DIR: artifactDir(context, "accessibility-audit-e2e"),
      },
      id: "accessibility-audit-e2e",
      title: "Accessibility Audit E2E",
    },
    {
      args: ["e2e:responsive-snapshots"],
      artifacts: responsiveSnapshotArtifacts(context, "responsive-snapshots-e2e"),
      command: "pnpm",
      env: {
        E2E_RESPONSIVE_OUTPUT_DIR: artifactDir(context, "responsive-snapshots-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: artifactDir(context, "responsive-snapshots-e2e"),
      },
      id: "responsive-snapshots-e2e",
      title: "Responsive Snapshot E2E",
    },
    {
      args: ["e2e:command-palette"],
      artifacts: commandPaletteArtifacts(context, "command-palette-e2e"),
      command: "pnpm",
      env: {
        E2E_COMMAND_PALETTE_OUTPUT_DIR: artifactDir(context, "command-palette-e2e"),
      },
      id: "command-palette-e2e",
      title: "Command Palette E2E",
    },
    {
      args: ["e2e:teleprompt-memory"],
      artifacts: telepromptMemoryArtifacts(context, "teleprompt-memory-e2e"),
      command: "pnpm",
      env: {
        E2E_TELEPROMPT_MEMORY_OUTPUT_DIR: artifactDir(context, "teleprompt-memory-e2e"),
      },
      id: "teleprompt-memory-e2e",
      title: "Teleprompt Memory E2E",
    },
    {
      args: ["e2e:context-panel"],
      artifacts: contextPanelArtifacts(context, "context-panel-e2e"),
      command: "pnpm",
      env: {
        E2E_CONTEXT_PANEL_OUTPUT_DIR: artifactDir(context, "context-panel-e2e"),
        E2E_SCREENSHOT_STATE_OUTPUT_DIR: artifactDir(context, "context-panel-e2e"),
      },
      id: "context-panel-e2e",
      title: "Context Panel E2E",
    },
    {
      args: ["validate:ux-final"],
      artifacts: finalUxGateArtifacts(context, "final-ux-gates"),
      command: "pnpm",
      env: {
        FINAL_UX_GATES_OUTPUT_DIR: artifactDir(context, "final-ux-gates"),
      },
      id: "final-ux-gates",
      title: "Final UX Gates",
    },
    {
      args: ["validate:local"],
      artifacts: {
        htmlReport: path.join(artifactDir(context, "validate-local"), "report.html"),
        markdownReport: path.join(artifactDir(context, "validate-local"), "report.md"),
        summary: path.join(artifactDir(context, "validate-local"), "summary.json"),
      },
      command: "pnpm",
      env: {
        VALIDATE_LOCAL_OUTPUT_DIR: artifactDir(context, "validate-local"),
      },
      id: "validate-local",
      title: "Validate Local",
    },
  ];
}

function bookCinemaStep(context, { id, includePerformanceArtifacts = false, script, title }) {
  const stepArtifactDir = artifactDir(context, id);
  const artifacts = {
    e2eSummary: path.join(stepArtifactDir, "summary.json"),
    screenshots: path.join(stepArtifactDir, "screenshots"),
    screenshotStateManifest: path.join(stepArtifactDir, "manifest.json"),
    screenshotStateMismatches: path.join(stepArtifactDir, "state-mismatches.md"),
  };
  const env = {
    E2E_ARTIFACT_DIR: stepArtifactDir,
    E2E_SCREENSHOT_DIR: path.join(stepArtifactDir, "screenshots"),
    E2E_SCREENSHOT_STATE_OUTPUT_DIR: stepArtifactDir,
    E2E_SUMMARY_PATH: path.join(stepArtifactDir, "summary.json"),
  };
  if (includePerformanceArtifacts) {
    const performanceDir = path.join(stepArtifactDir, "performance");
    env.E2E_PERFORMANCE_ARTIFACT_DIR = performanceDir;
    env.E2E_READER_TIMING_WARN_ONLY = "1";
    artifacts.lowResourceBudgetFailures = path.join(performanceDir, "budget-failures.md");
    artifacts.lowResourceDegradedStates = path.join(performanceDir, "degraded-states.md");
    artifacts.lowResourceFixtureCoverage = path.join(performanceDir, "fixture-coverage.json");
    artifacts.lowResourceInteractionBudget = path.join(performanceDir, "interaction-budget.md");
    artifacts.lowResourceReaderResume = path.join(performanceDir, "reader-resume.json");
    artifacts.lowResourceTiming = path.join(performanceDir, "timing.json");
  }
  return {
    args: [script],
    artifacts,
    command: "pnpm",
    env,
    id,
    title,
  };
}

function uiActionArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    actionInventory: path.join(dir, "action-inventory.json"),
    actionResults: path.join(dir, "action-results.json"),
    deadControls: path.join(dir, "dead-controls.md"),
    duplicates: path.join(dir, "duplicates.md"),
    reviewerSummary: path.join(dir, "reviewer-summary.md"),
    screenshots: path.join(dir, "screenshots"),
    websiteExtractionQuality: path.join(dir, "website-extraction-quality.json"),
  };
}

function surfaceComplexityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    budgetJson: path.join(dir, "budget.json"),
    budgetReport: path.join(dir, "budget.md"),
  };
}

function accessibilityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    accessibilityFindings: path.join(dir, "a11y-findings.json"),
    accessibilityReport: path.join(dir, "accessibility-report.md"),
    accessibilityResults: path.join(dir, "accessibility-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function responsiveSnapshotArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    responsiveResults: path.join(dir, "responsive-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function commandPaletteArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    commandPaletteReport: path.join(dir, "command-palette-report.md"),
    commandPaletteResults: path.join(dir, "command-palette-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function readAlongFidelityArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    readAlongReport: path.join(dir, "read-along-fidelity-report.md"),
    readAlongResults: path.join(dir, "read-along-fidelity-results.json"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function readAlongSyncArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    screenshots: path.join(dir, "screenshots"),
    syncMetrics: path.join(dir, "sync-metrics.json"),
    syncSummary: path.join(dir, "sync-summary.md"),
    syncTimeline: path.join(dir, "drift-timeline.json"),
  };
}

function telepromptMemoryArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    screenshots: path.join(dir, "screenshots"),
    telepromptMemoryReport: path.join(dir, "teleprompt-memory-report.md"),
    telepromptMemoryResults: path.join(dir, "teleprompt-memory-results.json"),
  };
}

function contextPanelArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    contextPanelReport: path.join(dir, "context-panel-report.md"),
    contextPanelResults: path.join(dir, "context-panel-results.json"),
    screenshotStateManifest: path.join(dir, "manifest.json"),
    screenshotStateMismatches: path.join(dir, "state-mismatches.md"),
    screenshots: path.join(dir, "screenshots"),
  };
}

function finalUxGateArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    finalUxResults: path.join(dir, "final-ux-results.json"),
    finalUxSummary: path.join(dir, "final-ux-summary.md"),
  };
}

function artifactDir(context, id) {
  return path.join(context.artifactsDir, id);
}

async function writeReviewBundle({ context, gitInfo, reviewSteps }) {
  const commandSteps = context.summary.steps.filter((step) => step.type === "command");
  const artifactRecords = await inspectStepArtifacts(commandSteps, context.outputDir);
  const qaDocuments = await readQaDocuments(artifactRecords);
  const surfaceCoverage = summarizeSurfaceCoverage(qaDocuments.actionInventory);
  const waivers = extractLowResourceWaivers(qaDocuments.lowResourceSummary);
  const passFailSummary = buildPassFailSummary({
    artifactRecords,
    commandSteps,
    qaDocuments,
    surfaceCoverage,
  });
  const reviewFiles = {
    commands: path.join(context.outputDir, "commands.txt"),
    head: path.join(context.outputDir, "head.txt"),
    reviewManifest: path.join(context.outputDir, "review-manifest.json"),
    reviewerSummary: path.join(context.outputDir, "reviewer-summary.md"),
  };
  const manifest = {
    artifactRecords,
    branch: gitInfo.branch,
    commandRunList: commandSteps.map(commandRunEntry),
    expectedCommands: reviewSteps.map((step) => [step.command, ...(step.args ?? [])].join(" ")),
    generatedAt: new Date().toISOString(),
    head: gitInfo.head,
    hostedCiRequired: false,
    outputDir: context.outputDir,
    passFailSummary,
    reports: {
      html: path.join(context.outputDir, "report.html"),
      markdown: path.join(context.outputDir, "report.md"),
      summary: path.join(context.outputDir, "summary.json"),
    },
    reviewFiles,
    rootDir: context.rootDir,
    schemaVersion: "review-evidence.v1",
    status: passFailSummary.status,
    surfaceCoverage,
    waivers,
    workingTree: {
      dirty: gitInfo.dirty,
      status: gitInfo.status,
    },
  };

  await writeFile(reviewFiles.head, renderHeadText(manifest));
  await writeFile(reviewFiles.commands, renderCommandsText(manifest));
  await writeFile(reviewFiles.reviewerSummary, renderReviewerSummary(manifest));
  await writeFile(reviewFiles.reviewManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function extractLowResourceWaivers(summary) {
  return (summary?.readerTiming?.thresholds ?? [])
    .filter((threshold) => threshold?.waiver)
    .map((threshold) => ({
      actual: threshold.actual,
      budget: threshold.expected,
      classification: threshold.classification,
      id: threshold.waiver.id,
      metric: threshold.metric,
      owner: threshold.waiver.owner,
      reason: threshold.waiver.reason,
    }));
}

async function inspectStepArtifacts(steps, outputDir) {
  const records = [];
  for (const step of steps) {
    for (const [key, artifactPath] of Object.entries(step.artifacts ?? {})) {
      records.push(await inspectArtifact({ artifactPath, key, outputDir, step }));
    }
  }
  return records;
}

async function inspectArtifact({ artifactPath, key, outputDir, step }) {
  const base = {
    absolutePath: artifactPath,
    exists: false,
    fileCount: 0,
    key,
    ok: false,
    relativePath: path.relative(outputDir, artifactPath),
    stepId: step.id,
    stepTitle: step.title,
    type: "missing",
  };
  try {
    const stats = await stat(artifactPath);
    if (stats.isDirectory()) {
      const fileCount = await countFiles(artifactPath);
      return {
        ...base,
        exists: true,
        fileCount,
        ok: fileCount > 0,
        type: "directory",
      };
    }
    return {
      ...base,
      exists: true,
      fileCount: 1,
      ok: stats.size > 0,
      sizeBytes: stats.size,
      type: "file",
    };
  } catch {
    return base;
  }
}

async function countFiles(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await countFiles(entryPath);
    } else if (entry.isFile()) {
      total += 1;
    }
  }
  return total;
}

async function readQaDocuments(artifactRecords) {
  const byStepAndKey = new Map(
    artifactRecords.map((record) => [`${record.stepId}:${record.key}`, record.absolutePath]),
  );
  return {
    accessibilityResults: await readJsonIfPresent(
      byStepAndKey.get("accessibility-audit-e2e:accessibilityResults"),
    ),
    actionInventory: await readJsonIfPresent(byStepAndKey.get("ui-actions-e2e:actionInventory")),
    actionResults: await readJsonIfPresent(byStepAndKey.get("ui-actions-e2e:actionResults")),
    surfaceComplexity: await readJsonIfPresent(
      byStepAndKey.get("surface-complexity-budget-e2e:budgetJson"),
    ),
    websiteExtractionQuality: await readJsonIfPresent(
      byStepAndKey.get("ui-actions-e2e:websiteExtractionQuality"),
    ),
    bookCinema: await readJsonIfPresent(byStepAndKey.get("book-cinema-e2e:e2eSummary")),
    commandPalette: await readJsonIfPresent(
      byStepAndKey.get("command-palette-e2e:commandPaletteResults"),
    ),
    contextPanel: await readJsonIfPresent(
      byStepAndKey.get("context-panel-e2e:contextPanelResults"),
    ),
    lowResourceTiming: await readJsonIfPresent(
      byStepAndKey.get("book-cinema-low-resource-e2e:lowResourceTiming"),
    ),
    lowResourceSummary: await readJsonIfPresent(
      byStepAndKey.get("book-cinema-low-resource-e2e:e2eSummary"),
    ),
    readAlongFidelity: await readJsonIfPresent(
      byStepAndKey.get("read-along-fidelity-e2e:readAlongResults"),
    ),
    responsiveCinema: await readJsonIfPresent(
      byStepAndKey.get("book-cinema-responsive-e2e:e2eSummary"),
    ),
    responsiveSnapshots: await readJsonIfPresent(
      byStepAndKey.get("responsive-snapshots-e2e:responsiveResults"),
    ),
    telepromptMemory: await readJsonIfPresent(
      byStepAndKey.get("teleprompt-memory-e2e:telepromptMemoryResults"),
    ),
    finalUxGates: await readJsonIfPresent(byStepAndKey.get("final-ux-gates:finalUxResults")),
    validateLocal: await readJsonIfPresent(byStepAndKey.get("validate-local:summary")),
  };
}

async function readJsonIfPresent(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function summarizeSurfaceCoverage(actionInventory) {
  const surfaces = actionInventory?.summary?.surfaces ?? {};
  const actions = actionInventory?.actions ?? [];
  const scenarios = actionInventory?.scenarios ?? [];
  return REQUIRED_REVIEW_SURFACES.map((surface) => {
    const aliases = surfaceAliases[surface] ?? [surface];
    const directActionCount = aliases.reduce(
      (total, alias) => total + Number(surfaces[alias] ?? 0),
      0,
    );
    const scenarioIds = new Set(
      scenarios
        .filter((scenario) =>
          aliases.some(
            (alias) =>
              normalizeSurfaceName(scenario.surface) === normalizeSurfaceName(alias) ||
              normalizeSurfaceName(scenario.label) === normalizeSurfaceName(alias) ||
              normalizeSurfaceName(scenario.label) === normalizeSurfaceName(surface),
          ),
        )
        .map((scenario) => scenario.id),
    );
    const scenarioActionCount = actions.filter((action) =>
      scenarioIds.has(action.scenarioId),
    ).length;
    const actionCount = directActionCount > 0 ? directActionCount : scenarioActionCount;
    return {
      actionCount,
      aliases,
      status: actionCount > 0 ? "covered" : "missing",
      surface,
    };
  });
}

function normalizeSurfaceName(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "");
}

export function buildPassFailSummary({
  artifactRecords,
  commandSteps,
  qaDocuments,
  surfaceCoverage,
}) {
  const failedCommands = commandSteps.filter((step) => step.status !== "passed");
  const missingArtifacts = artifactRecords.filter((record) => !record.ok);
  const missingSurfaces = surfaceCoverage.filter((item) => item.status !== "covered");
  const qa = {
    accessibility: statusSummary(qaDocuments.accessibilityResults),
    actionAudit: statusSummary(qaDocuments.actionResults),
    bookCinema: statusSummary(qaDocuments.bookCinema),
    commandPalette: statusSummary(qaDocuments.commandPalette),
    contextPanel: statusSummary(qaDocuments.contextPanel),
    lowResourceTiming: statusSummary(
      qaDocuments.lowResourceSummary ?? qaDocuments.lowResourceTiming,
    ),
    readAlongFidelity: statusSummary(qaDocuments.readAlongFidelity),
    responsiveCinema: statusSummary(qaDocuments.responsiveCinema),
    responsiveSnapshots: statusSummary(qaDocuments.responsiveSnapshots),
    surfaceComplexity: statusSummary(qaDocuments.surfaceComplexity),
    telepromptMemory: statusSummary(qaDocuments.telepromptMemory),
    finalUxGates: statusSummary(qaDocuments.finalUxGates),
    validateLocal: statusSummary(qaDocuments.validateLocal),
    websiteExtractionQuality: statusSummary(qaDocuments.websiteExtractionQuality),
  };
  const status =
    failedCommands.length === 0 && missingArtifacts.length === 0 && missingSurfaces.length === 0
      ? "passed"
      : "failed";
  return {
    artifacts: {
      missing: missingArtifacts.length,
      missingPaths: missingArtifacts.map((record) => record.relativePath),
      present: artifactRecords.length - missingArtifacts.length,
      total: artifactRecords.length,
    },
    commands: {
      failed: failedCommands.length,
      passed: commandSteps.length - failedCommands.length,
      total: commandSteps.length,
    },
    qa,
    status,
    surfaces: {
      covered: surfaceCoverage.length - missingSurfaces.length,
      missing: missingSurfaces.map((item) => item.surface),
      total: surfaceCoverage.length,
    },
  };
}

function statusSummary(document) {
  if (!document) {
    return { status: "missing" };
  }
  return {
    status: document.status ?? "recorded",
    summary: document.summary ?? document.quality ?? document.readerTiming?.metrics ?? null,
  };
}

function commandRunEntry(step) {
  return {
    command: step.command,
    commandText: step.command,
    cwd: step.cwd,
    durationMs: step.durationMs,
    exitCode: step.exitCode,
    id: step.id,
    logPath: step.logPath,
    status: step.status,
    title: step.title,
  };
}

function renderHeadText(manifest) {
  const lines = [
    `branch: ${manifest.branch}`,
    `head: ${manifest.head}`,
    `generatedAt: ${manifest.generatedAt}`,
    `workingTreeDirtyAtStart: ${String(manifest.workingTree.dirty)}`,
  ];
  if (manifest.workingTree.status.length > 0) {
    lines.push("", "workingTreeStatus:");
    for (const item of manifest.workingTree.status) {
      lines.push(item);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderCommandsText(manifest) {
  const lines = [
    "Latest-head local review commands",
    `Branch: ${manifest.branch}`,
    `Head: ${manifest.head}`,
    "",
  ];
  for (const [index, step] of manifest.commandRunList.entries()) {
    lines.push(
      `${String(index + 1)}. [${step.status.toUpperCase()}] ${step.title} - ${step.commandText}`,
    );
    lines.push(`   log: ${path.relative(manifest.outputDir, step.logPath)}`);
  }
  return `${lines.join("\n")}\n`;
}

export function renderReviewerSummary(manifest) {
  const lines = [
    "# Latest-head Review Evidence",
    "",
    `Status: **${manifest.status.toUpperCase()}**`,
    `Branch: \`${manifest.branch}\``,
    `Head: \`${manifest.head}\``,
    `Generated: ${manifest.generatedAt}`,
    `Working tree dirty at start: ${manifest.workingTree.dirty ? "yes" : "no"}`,
    "Hosted CI required: no",
    "",
    "## Pass/Fail Summary",
    "",
    `- Commands: ${String(manifest.passFailSummary.commands.passed)}/${String(
      manifest.passFailSummary.commands.total,
    )} passed`,
    `- Required artifacts: ${String(manifest.passFailSummary.artifacts.present)}/${String(
      manifest.passFailSummary.artifacts.total,
    )} present`,
    `- Surfaces: ${String(manifest.passFailSummary.surfaces.covered)}/${String(
      manifest.passFailSummary.surfaces.total,
    )} covered by the action inventory`,
    "",
    "## Commands",
    "",
    "| Command | Status | Duration | Log |",
    "| --- | --- | ---: | --- |",
  ];

  for (const step of manifest.commandRunList) {
    const log = path.relative(manifest.outputDir, step.logPath);
    lines.push(
      `| ${escapeMarkdown(step.title)} | ${step.status.toUpperCase()} | ${formatDuration(
        step.durationMs,
      )} | [log](${encodeURI(log)}) |`,
    );
  }

  lines.push("", "## Surface Coverage", "", "| Surface | Status | Actions | Evidence |");
  lines.push("| --- | --- | ---: | --- |");
  for (const item of manifest.surfaceCoverage) {
    lines.push(
      `| ${escapeMarkdown(item.surface)} | ${item.status.toUpperCase()} | ${String(
        item.actionCount,
      )} | UI action inventory |`,
    );
  }

  lines.push("", "## QA Statuses", "", "| Check | Status | Summary |");
  lines.push("| --- | --- | --- |");
  for (const [name, result] of Object.entries(manifest.passFailSummary.qa ?? {})) {
    lines.push(
      `| ${escapeMarkdown(formatQaName(name))} | ${escapeMarkdown(
        result.status,
      ).toUpperCase()} | ${escapeMarkdown(formatQaSummary(result.summary))} |`,
    );
  }

  lines.push("", "## Required Artifacts", "");
  lines.push(...artifactSection("Action Audit", manifest, ["ui-actions-e2e"]));
  lines.push(...artifactSection("Surface Complexity", manifest, ["surface-complexity-budget-e2e"]));
  lines.push(
    ...artifactSection("Responsive Screenshots", manifest, [
      "book-cinema-responsive-e2e",
      "responsive-snapshots-e2e",
    ]),
  );
  lines.push(...artifactSection("Accessibility", manifest, ["accessibility-audit-e2e"]));
  lines.push(...artifactSection("Low-resource Timing", manifest, ["book-cinema-low-resource-e2e"]));
  lines.push(
    ...artifactSection("Command Palette, Teleprompt, and Context Panel", manifest, [
      "command-palette-e2e",
      "teleprompt-memory-e2e",
      "context-panel-e2e",
    ]),
  );
  lines.push(...artifactSection("Final UX Gates", manifest, ["final-ux-gates"]));
  lines.push(
    ...artifactSection("Workspace, Settings, Reader, and Book Cinema", manifest, [
      "workspace-flow-e2e",
      "settings-ia-e2e",
      "reader-wayfinding-e2e",
      "book-cinema-e2e",
      "validate-local",
    ]),
  );

  lines.push("", "## Waivers", "");
  if (manifest.waivers.length === 0) {
    lines.push("No waivers declared.");
  } else {
    for (const waiver of manifest.waivers) {
      lines.push(`- ${waiver.id}: ${waiver.reason}`);
    }
  }

  if (manifest.passFailSummary.artifacts.missingPaths.length > 0) {
    lines.push("", "## Missing Required Artifacts", "");
    for (const missingPath of manifest.passFailSummary.artifacts.missingPaths) {
      lines.push(`- ${missingPath}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

function artifactSection(title, manifest, stepIds) {
  const records = manifest.artifactRecords.filter((record) => stepIds.includes(record.stepId));
  const lines = [`### ${title}`, ""];
  if (records.length === 0) {
    lines.push("No artifacts recorded.", "");
    return lines;
  }
  lines.push("| Step | Artifact | Status | Path |");
  lines.push("| --- | --- | --- | --- |");
  for (const record of records) {
    const status = record.ok ? "PRESENT" : "MISSING";
    lines.push(
      `| ${escapeMarkdown(record.stepTitle)} | ${escapeMarkdown(record.key)} | ${status} | ${artifactLink(
        record,
      )} |`,
    );
  }
  lines.push("");
  return lines;
}

function formatQaName(value) {
  return String(value)
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (match) => match.toUpperCase());
}

function formatQaSummary(summary) {
  if (!summary) {
    return "-";
  }
  const entries = Object.entries(summary)
    .filter(([, value]) => typeof value !== "object" || value === null)
    .slice(0, 5);
  if (entries.length === 0) {
    return "recorded";
  }
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function artifactLink(record) {
  if (!record.ok) {
    return escapeMarkdown(record.relativePath);
  }
  return `[${escapeMarkdown(record.relativePath)}](${encodeURI(record.relativePath)})`;
}

async function readGitInfo(cwd) {
  const [branch, head, status] = await Promise.all([
    execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    execGit(["rev-parse", "HEAD"], cwd),
    execGit(["status", "--short"], cwd),
  ]);
  const statusLines = status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return {
    branch: branch.trim(),
    dirty: statusLines.length > 0,
    head: head.trim(),
    status: statusLines,
  };
}

async function execGit(args, cwd) {
  const { stdout } = await execFile("git", args, { cwd });
  return stdout;
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function isDirectInvocation() {
  return process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

if (isDirectInvocation()) {
  runReviewEvidence()
    .then((summary) => {
      process.exitCode = summary.status === "passed" ? 0 : 1;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : String(error));
      process.exitCode = 1;
    });
}
