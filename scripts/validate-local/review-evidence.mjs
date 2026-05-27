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
const DIRTY_TREE_WAIVER_ENV = "REVIEW_ALLOW_DIRTY";
const TRIAGE_SEVERITIES = ["blocking", "needs-review", "waived", "informational"];
const TRIAGE_SEVERITY_RANK = Object.fromEntries(
  TRIAGE_SEVERITIES.map((severity, index) => [severity, index]),
);

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
  const dirtyTree = buildDirtyTreeReviewState({
    allowDirty: isDirtyTreeWaiverEnabled(process.env),
    gitInfo,
  });
  const reviewSteps = buildReviewSteps(context);

  if (dirtyTree.gateStatus === "failed") {
    await runCallbackStep(
      context,
      {
        command: "verify clean working tree",
        id: "dirty-tree-review-gate",
        title: "Dirty Tree Review Gate",
      },
      async ({ log }) => {
        const bundle = await writeReviewBundle({ context, dirtyTree, gitInfo, reviewSteps });
        log("Working tree was dirty at review start.");
        log(`${DIRTY_TREE_WAIVER_ENV}=1 was not set, so review commands were not executed.`);
        log(`Review manifest: ${bundle.reviewFiles.reviewManifest}`);
        log(`Reviewer summary: ${bundle.reviewFiles.reviewerSummary}`);
        log(`Triage dashboard: ${bundle.reviewFiles.triage}`);
        return {
          artifacts: bundle.reviewFiles,
          metrics: {
            dirtyTreeFiles: gitInfo.status.length,
            untrackedFiles: gitInfo.untrackedFiles.length,
          },
          thresholds: reviewBundleThresholds(bundle),
        };
      },
    );

    const summary = await finalizeRun(context);
    console.log(
      `review:local ${summary.status}; manifest: ${path.join(outputDir, "review-manifest.json")}`,
    );
    return summary;
  }

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
      const bundle = await writeReviewBundle({ context, dirtyTree, gitInfo, reviewSteps });
      log(`Review manifest: ${bundle.reviewFiles.reviewManifest}`);
      log(`Reviewer summary: ${bundle.reviewFiles.reviewerSummary}`);
      log(`Triage dashboard: ${bundle.reviewFiles.triage}`);
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
        thresholds: reviewBundleThresholds(bundle),
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
    {
      args: ["e2e:golden-minute"],
      artifacts: goldenMinuteArtifacts(context, "golden-minute-e2e"),
      command: "pnpm",
      env: {
        E2E_GOLDEN_MINUTE_OUTPUT_DIR: artifactDir(context, "golden-minute-e2e"),
      },
      id: "golden-minute-e2e",
      title: "Golden Minute E2E",
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
    artifacts.lowResourceBudgetFailures = path.join(performanceDir, "budget-failures.md");
    artifacts.lowResourceDegradedStates = path.join(performanceDir, "degraded-states.md");
    artifacts.lowResourceFixtureCoverage = path.join(performanceDir, "fixture-coverage.json");
    artifacts.lowResourceInteractionBudget = path.join(performanceDir, "interaction-budget.md");
    artifacts.lowResourceReaderResume = path.join(performanceDir, "reader-resume.json");
    artifacts.lowResourceTiming = path.join(performanceDir, "timing.json");
    artifacts.lowResourceWaiverBurndown = path.join(performanceDir, "waiver-burndown.md");
    artifacts.lowResourceWaiverBurndownJson = path.join(performanceDir, "waiver-burndown.json");
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
    summary: path.join(dir, "summary.json"),
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

function goldenMinuteArtifacts(context, id) {
  const dir = artifactDir(context, id);
  return {
    artifactCompatibilityReport: path.join(dir, "artifact-compatibility-report.md"),
    artifactCompatibilityResults: path.join(dir, "artifact-compatibility-report.json"),
    audioCurrentTimeTimeline: path.join(dir, "audio-current-time-timeline.json"),
    driftTimeline: path.join(dir, "drift-timeline.json"),
    goldenMinuteReport: path.join(dir, "golden-minute-report.md"),
    goldenMinuteResults: path.join(dir, "golden-minute-results.json"),
    goldenMinuteSync: path.join(dir, "golden-minute-sync.json"),
    segmentBoundaryReport: path.join(dir, "segment-boundary-report.md"),
    segmentBoundaryResults: path.join(dir, "segment-boundary-report.json"),
    speechFluencyReport: path.join(dir, "speech-fluency-report.md"),
    speechFluencyResults: path.join(dir, "speech-fluency-report.json"),
    screenshots: path.join(dir, "screenshots"),
    visualHighlightTimeline: path.join(dir, "visual-highlight-timeline.json"),
    visualTimeline: path.join(dir, "visual-timeline.md"),
    visualTimelineResults: path.join(dir, "visual-timeline.json"),
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

async function writeReviewBundle({ context, dirtyTree, gitInfo, reviewSteps }) {
  const commandSteps = context.summary.steps.filter((step) => step.type === "command");
  const artifactRecords = await inspectStepArtifacts(commandSteps, context.outputDir);
  const qaDocuments = await readQaDocuments(artifactRecords);
  const surfaceCoverage = summarizeSurfaceCoverage(qaDocuments.actionInventory);
  const waivers = extractLowResourceWaivers(qaDocuments.lowResourceSummary);
  const passFailSummary = buildPassFailSummary({
    artifactRecords,
    commandSteps,
    dirtyTree,
    qaDocuments,
    surfaceCoverage,
  });
  const reviewFiles = {
    commands: path.join(context.outputDir, "commands.txt"),
    head: path.join(context.outputDir, "head.txt"),
    reviewManifest: path.join(context.outputDir, "review-manifest.json"),
    reviewerSummary: path.join(context.outputDir, "reviewer-summary.md"),
    triage: path.join(context.outputDir, "triage.md"),
  };
  const manifest = {
    artifactRecords,
    branch: gitInfo.branch,
    commandRunList: commandSteps.map(commandRunEntry),
    dirtyTree,
    expectedCommands: reviewSteps.map((step) => [step.command, ...(step.args ?? [])].join(" ")),
    generatedAt: new Date().toISOString(),
    gitStatusSnapshot: gitInfo.statusSnapshot,
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
      diffStat: gitInfo.diffStat,
      status: gitInfo.status,
      untrackedFiles: gitInfo.untrackedFiles,
    },
  };
  manifest.triage = buildReviewTriage(manifest, qaDocuments);

  await writeFile(reviewFiles.head, renderHeadText(manifest));
  await writeFile(reviewFiles.commands, renderCommandsText(manifest));
  await writeFile(reviewFiles.reviewerSummary, renderReviewerSummary(manifest));
  await writeFile(
    reviewFiles.triage,
    renderTriageDashboard(manifest, qaDocuments, manifest.triage),
  );
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
      reviewDate: threshold.waiver.reviewDate,
      target: threshold.waiver.target,
      targetMs: threshold.waiver.targetMs,
      trackingIssue: threshold.waiver.trackingIssue,
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
    accessibilityFindings: await readJsonIfPresent(
      byStepAndKey.get("accessibility-audit-e2e:accessibilityFindings"),
    ),
    accessibilityResults: await readJsonIfPresent(
      byStepAndKey.get("accessibility-audit-e2e:accessibilityResults"),
    ),
    actionInventory: await readJsonIfPresent(byStepAndKey.get("ui-actions-e2e:actionInventory")),
    actionResults: await readJsonIfPresent(byStepAndKey.get("ui-actions-e2e:actionResults")),
    actionSummary: await readJsonIfPresent(byStepAndKey.get("ui-actions-e2e:summary")),
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
    lowResourceWaiverBurndown: await readJsonIfPresent(
      byStepAndKey.get("book-cinema-low-resource-e2e:lowResourceWaiverBurndownJson"),
    ),
    readAlongFidelity: await readJsonIfPresent(
      byStepAndKey.get("read-along-fidelity-e2e:readAlongResults"),
    ),
    readAlongSync: await readJsonIfPresent(byStepAndKey.get("readalong-sync-e2e:syncMetrics")),
    goldenMinute: await readJsonIfPresent(
      byStepAndKey.get("golden-minute-e2e:goldenMinuteResults"),
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
  dirtyTree = { dirty: false, gateStatus: "passed", waived: false },
  qaDocuments,
  surfaceCoverage,
}) {
  const failedCommands = commandSteps.filter((step) => step.status !== "passed");
  const missingArtifacts = artifactRecords.filter((record) => !record.ok);
  const missingSurfaces = surfaceCoverage.filter((item) => item.status !== "covered");
  const dirtyTreeFailed = dirtyTree.gateStatus === "failed";
  const qa = {
    accessibility: statusSummary(qaDocuments.accessibilityResults),
    actionAudit: statusSummary(qaDocuments.actionSummary ?? qaDocuments.actionResults),
    bookCinema: statusSummary(qaDocuments.bookCinema),
    commandPalette: statusSummary(qaDocuments.commandPalette),
    contextPanel: statusSummary(qaDocuments.contextPanel),
    lowResourceTiming: statusSummary(
      qaDocuments.lowResourceSummary ?? qaDocuments.lowResourceTiming,
    ),
    goldenMinute: statusSummary(qaDocuments.goldenMinute),
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
    !dirtyTreeFailed &&
    failedCommands.length === 0 &&
    missingArtifacts.length === 0 &&
    missingSurfaces.length === 0
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
    dirtyTree: {
      dirty: dirtyTree.dirty,
      status: dirtyTree.gateStatus,
      waived: dirtyTree.waived,
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
  const diffStat = manifest.workingTree.diffStat ?? [];
  const untrackedFiles = manifest.workingTree.untrackedFiles ?? [];
  if (diffStat.length > 0) {
    lines.push("", "workingTreeDiffStat:");
    for (const item of diffStat) {
      lines.push(item);
    }
  }
  if (untrackedFiles.length > 0) {
    lines.push("", "untrackedFiles:");
    for (const item of untrackedFiles) {
      lines.push(item);
    }
  }
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
  ];

  lines.push(...dirtyTreeSummarySection(manifest));

  lines.push(
    "",
    "## Commands",
    "",
    "| Command | Status | Duration | Log |",
    "| --- | --- | ---: | --- |",
  );

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
  lines.push(...artifactSection("Golden Minute", manifest, ["golden-minute-e2e"]));
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
      const target = waiver.target ? ` Target: ${waiver.target}` : "";
      const reviewDate = waiver.reviewDate ? ` Review: ${waiver.reviewDate}.` : "";
      const trackingIssue = waiver.trackingIssue ? ` Tracking: ${waiver.trackingIssue}.` : "";
      lines.push(
        `- ${waiver.id}: ${waiver.reason} Owner: ${waiver.owner}.${target}${reviewDate}${trackingIssue}`,
      );
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

export function buildReviewTriage(manifest, qaDocuments = {}) {
  const findings = sortTriageFindings(collectTriageFindings(manifest, qaDocuments));
  const severityCounts = Object.fromEntries(
    TRIAGE_SEVERITIES.map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ]),
  );
  const unresolvedWaivers = collectUnresolvedWaivers(manifest, qaDocuments);
  const mergeReadiness = determineMergeReadiness({
    findings,
    manifest,
    unresolvedWaivers,
  });
  const actionableFindings = findings.filter((finding) => finding.severity !== "informational");
  return {
    artifactIndex: buildTriageArtifactIndex(manifest),
    findings,
    mergeReadiness,
    severityCounts,
    signalSummary: buildTriageSignalSummary(manifest, qaDocuments),
    topNextIssues: (actionableFindings.length > 0 ? actionableFindings : findings).slice(0, 10),
    unresolvedWaivers,
  };
}

export function renderTriageDashboard(
  manifest,
  qaDocuments = {},
  triage = buildReviewTriage(manifest, qaDocuments),
) {
  const lines = [
    "# Review Triage Dashboard",
    "",
    `Generated: ${manifest.generatedAt}`,
    `Branch: \`${manifest.branch}\``,
    `Head: \`${manifest.head}\``,
    "",
    "## Merge Readiness",
    "",
    `Decision: **${triage.mergeReadiness.status.toUpperCase()}**`,
    `Final review status: **${String(manifest.status).toUpperCase()}**`,
  ];
  for (const reason of triage.mergeReadiness.reasons) {
    lines.push(`- ${escapeMarkdown(reason)}`);
  }

  lines.push("", "## Severity Summary", "", "| Severity | Count |", "| --- | ---: |");
  for (const severity of TRIAGE_SEVERITIES) {
    lines.push(`| ${severity} | ${String(triage.severityCounts[severity] ?? 0)} |`);
  }

  lines.push(
    "",
    "## Signal Summary",
    "",
    "| Signal | Status | Detail | Evidence |",
    "| --- | --- | --- | --- |",
  );
  for (const signal of triage.signalSummary) {
    lines.push(
      `| ${escapeMarkdown(signal.label)} | ${escapeMarkdown(signal.status)} | ${escapeMarkdown(
        signal.detail,
      )} | ${signal.evidence} |`,
    );
  }

  lines.push(
    "",
    "## Severity-Sorted Findings",
    "",
    "| Severity | Area | Finding | Owner | Evidence |",
    "| --- | --- | --- | --- | --- |",
  );
  if (triage.findings.length === 0) {
    lines.push("| informational | Review | No unresolved triage findings. | - | - |");
  } else {
    for (const finding of triage.findings) {
      lines.push(
        `| ${finding.severity} | ${escapeMarkdown(finding.area)} | ${escapeMarkdown(
          finding.message,
        )} | ${escapeMarkdown(finding.owner ?? "-")} | ${finding.evidence} |`,
      );
    }
  }

  lines.push(
    "",
    "## Unresolved Waivers",
    "",
    "| Source | Waiver | Owner | Review Date | Reason | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
  );
  if (triage.unresolvedWaivers.length === 0) {
    lines.push("| - | No unresolved waivers. | - | - | - | - |");
  } else {
    for (const waiver of triage.unresolvedWaivers) {
      lines.push(
        `| ${escapeMarkdown(waiver.source)} | ${escapeMarkdown(waiver.id)} | ${escapeMarkdown(
          waiver.owner ?? "-",
        )} | ${escapeMarkdown(waiver.reviewDate ?? "-")} | ${escapeMarkdown(
          waiver.reason ?? waiver.target ?? "-",
        )} | ${waiver.evidence} |`,
      );
    }
  }

  lines.push(
    "",
    "## Top 10 Next Issues",
    "",
    "| Rank | Severity | Area | Issue | Owner |",
    "| ---: | --- | --- | --- | --- |",
  );
  if (triage.topNextIssues.length === 0) {
    lines.push("| 1 | informational | Review | No next issues detected. | - |");
  } else {
    triage.topNextIssues.forEach((finding, index) => {
      lines.push(
        `| ${String(index + 1)} | ${finding.severity} | ${escapeMarkdown(
          finding.area,
        )} | ${escapeMarkdown(finding.message)} | ${escapeMarkdown(finding.owner ?? "-")} |`,
      );
    });
  }

  lines.push(
    "",
    "## Artifact Index",
    "",
    "| Area | Artifact | Status | Link |",
    "| --- | --- | --- | --- |",
  );
  for (const artifact of triage.artifactIndex) {
    lines.push(
      `| ${escapeMarkdown(artifact.area)} | ${escapeMarkdown(
        artifact.label,
      )} | ${escapeMarkdown(artifact.status)} | ${artifact.link} |`,
    );
  }

  lines.push(
    "",
    "## Human QA",
    "",
    `- Golden-minute human review script: ${manualQaLink(manifest)}`,
    "- Manual findings should include artifact IDs, timestamps, screenshots, and the marked highlight drift state when available.",
    "",
  );

  return lines.join("\n");
}

function buildTriageSignalSummary(manifest, qaDocuments) {
  const actionSummary = qaDocuments.actionSummary ?? {};
  const actionInventory = qaDocuments.actionInventory ?? {};
  const finalUx = qaDocuments.finalUxGates ?? {};
  const lowResource = qaDocuments.lowResourceWaiverBurndown ?? {};
  const lowResourceSummary = qaDocuments.lowResourceSummary ?? {};
  const accessibility = qaDocuments.accessibilityFindings ?? qaDocuments.accessibilityResults ?? {};
  const readAlongSync = qaDocuments.readAlongSync ?? {};
  const readAlongFidelity = qaDocuments.readAlongFidelity ?? {};
  const goldenMinute = qaDocuments.goldenMinute ?? {};
  const teleprompt = qaDocuments.telepromptMemory ?? {};
  const duplicateClassification =
    actionSummary.reviewGate?.duplicateClassification ??
    actionSummary.summaries?.duplicateClassification ??
    {};
  const stableCoverage = actionInventory.summary ?? actionSummary.summaries?.inventory ?? {};
  const lowResourceFailures = lowResourceSummary.readerTiming?.failures ?? {};
  const lowResourceWaiverCount =
    Number(lowResource.activeWaivers ?? lowResourceFailures.waived ?? 0) || 0;
  const readAlongMetrics = readAlongSync.metrics ?? readAlongFidelity.metrics ?? {};
  const a11ySummary = accessibility.summary ?? {};
  const finalSummary = finalUx.summary ?? {};
  const actionResultSummary = actionSummary.resultSummary ?? {};
  const hasDuplicateData = Object.keys(duplicateClassification).length > 0;
  const hasStableCoverageData = Object.keys(stableCoverage).length > 0;
  const hasLowResourceData =
    Object.keys(lowResource).length > 0 || Object.keys(lowResourceFailures).length > 0;
  const hasAccessibilityData = Object.keys(a11ySummary).length > 0;

  return [
    {
      detail: manifest.workingTree.dirty
        ? `${String(manifest.workingTree.status?.length ?? 0)} status entrie(s); ${String(
            manifest.workingTree.untrackedFiles?.length ?? 0,
          )} untracked`
        : "clean at review start",
      evidence: reviewFileLink(manifest, "head"),
      label: "Clean/dirty tree status",
      status: manifest.dirtyTree?.gateStatus ?? "unknown",
    },
    {
      detail: `commands ${String(manifest.passFailSummary.commands.passed)}/${String(
        manifest.passFailSummary.commands.total,
      )}; final UX ${finalUx.status ?? "missing"} (${String(
        finalSummary.unresolvedFindings ?? 0,
      )} unresolved, ${String(finalSummary.waivedFindings ?? 0)} waived)`,
      evidence: artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
      label: "Final status",
      status: manifest.status,
    },
    {
      detail: `${String(actionResultSummary.failed ?? 0)} failed, ${String(
        actionResultSummary.skipped ?? 0,
      )} skipped, review gate ${actionSummary.reviewGate?.status ?? actionSummary.status ?? "missing"}`,
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "summary"),
      label: "Action audit findings",
      status: actionSummary.status ?? "missing",
    },
    {
      detail: `${String(duplicateClassification.total ?? 0)} total; ${String(
        duplicateClassification.overexposed ?? 0,
      )} overexposed; ${String(
        duplicateClassification.needsConsolidation ?? 0,
      )} needs consolidation; ${String(duplicateClassification.unclassified ?? 0)} unclassified`,
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "duplicates"),
      label: "Duplicate count",
      status: hasDuplicateData
        ? duplicateClassification.unclassified > 0
          ? "needs review"
          : "classified"
        : "missing",
    },
    {
      detail: `${String(stableCoverage.missingStableTestIds ?? 0)} missing; ${String(
        stableCoverage.explicitStableTestIds ?? 0,
      )} explicit; ${String(stableCoverage.generatedStableActionIds ?? 0)} generated stable; ${String(
        stableCoverage.generatedUnstableActionIds ?? 0,
      )} unstable generated`,
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "actionInventory"),
      label: "Stable test ID coverage",
      status: hasStableCoverageData
        ? Number(stableCoverage.missingStableTestIds ?? 0) === 0
          ? "covered"
          : "missing IDs"
        : "missing",
    },
    {
      detail: `${String(lowResource.blocking ?? lowResourceFailures.blocking ?? 0)} blocking; ${String(
        lowResourceWaiverCount,
      )} active/waived; ${String(lowResource.closedUnderBudget ?? 0)} closed under budget`,
      evidence: artifactEvidence(
        manifest,
        "book-cinema-low-resource-e2e",
        "lowResourceWaiverBurndownJson",
      ),
      label: "Low-resource blocking/waived metrics",
      status: hasLowResourceData
        ? Number(lowResource.blocking ?? lowResourceFailures.blocking ?? 0) > 0
          ? "blocking"
          : lowResourceWaiverCount > 0
            ? "waived"
            : "clear"
        : "missing",
    },
    {
      detail: `${String(a11ySummary.failures ?? 0)} failures; ${String(
        a11ySummary.warnings ?? 0,
      )} warnings`,
      evidence: artifactEvidence(manifest, "accessibility-audit-e2e", "accessibilityFindings"),
      label: "Accessibility warnings",
      status: hasAccessibilityData
        ? Number(a11ySummary.failures ?? 0) > 0
          ? "failed"
          : "passed"
        : "missing",
    },
    {
      detail: `median ${formatMs(readAlongMetrics.medianWordDriftMs)}; p95 ${formatMs(
        readAlongMetrics.p95WordDriftMs,
      )}; degraded ${formatPercent(readAlongMetrics.degradedTimePercentage)}; wrong nodes ${String(
        readAlongMetrics.wrongNodeCount ?? 0,
      )}`,
      evidence: artifactEvidence(manifest, "readalong-sync-e2e", "syncMetrics"),
      label: "Read-along metrics",
      status: readAlongSync.status ?? readAlongFidelity.status ?? "missing",
    },
    {
      detail: `drift median ${formatMs(goldenMinute.summary?.driftMedianMs)}; p95 ${formatMs(
        goldenMinute.summary?.driftP95Ms,
      )}; fluency ${goldenMinute.summary?.speechFluencyStatus ?? "missing"}; screenshots ${String(
        goldenMinute.summary?.screenshots ?? 0,
      )}`,
      evidence: artifactEvidence(manifest, "golden-minute-e2e", "goldenMinuteResults"),
      label: "Golden-minute metrics",
      status: goldenMinute.status ?? "missing",
    },
    {
      detail: `${String(teleprompt.summary?.checks ?? 0)} checks; ${String(
        teleprompt.summary?.failures ?? 0,
      )} failures; ${String(teleprompt.summary?.screenshots ?? 0)} screenshots`,
      evidence: artifactEvidence(manifest, "teleprompt-memory-e2e", "telepromptMemoryResults"),
      label: "Teleprompt Theatre status",
      status: teleprompt.status ?? "missing",
    },
  ];
}

function collectTriageFindings(manifest, qaDocuments) {
  const findings = [];
  const addFinding = (finding) => findings.push(normalizeTriageFinding(finding));
  const dirtyGateFailed = manifest.dirtyTree?.gateStatus === "failed";
  const finalUx = qaDocuments.finalUxGates ?? {};
  const actionSummary = qaDocuments.actionSummary ?? {};
  const actionInventory = qaDocuments.actionInventory ?? {};
  const accessibility = qaDocuments.accessibilityFindings ?? qaDocuments.accessibilityResults ?? {};
  const lowResource = qaDocuments.lowResourceWaiverBurndown ?? {};
  const lowResourceSummary = qaDocuments.lowResourceSummary ?? {};
  const readAlongSync = qaDocuments.readAlongSync ?? {};
  const goldenMinute = qaDocuments.goldenMinute ?? {};
  const teleprompt = qaDocuments.telepromptMemory ?? {};

  if (manifest.dirtyTree?.gateStatus === "failed") {
    addFinding({
      area: "Working tree",
      evidence: reviewFileLink(manifest, "head"),
      message: "Working tree was dirty and REVIEW_ALLOW_DIRTY=1 was not set.",
      owner: "PR author",
      severity: "blocking",
    });
  } else if (manifest.dirtyTree?.gateStatus === "waived") {
    addFinding({
      area: "Working tree",
      evidence: reviewFileLink(manifest, "head"),
      message: "Dirty tree review evidence was explicitly waived.",
      owner: "PR author",
      severity: "waived",
    });
  }

  if (Number(manifest.passFailSummary.commands.failed ?? 0) > 0) {
    addFinding({
      area: "Commands",
      evidence: reviewFileLink(manifest, "commands"),
      message: `${String(manifest.passFailSummary.commands.failed)} review command(s) failed.`,
      owner: "PR author",
      severity: "blocking",
    });
  }

  if (Number(manifest.passFailSummary.artifacts.missing ?? 0) > 0) {
    addFinding({
      area: "Artifacts",
      evidence: reviewFileLink(manifest, "reviewManifest"),
      message: `${String(manifest.passFailSummary.artifacts.missing)} required artifact(s) missing.`,
      owner: "Validation owner",
      severity: "blocking",
    });
  }

  const missingSurfaces = manifest.passFailSummary.surfaces.missing ?? [];
  if (!dirtyGateFailed && missingSurfaces.length > 0) {
    addFinding({
      area: "Surface coverage",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "actionInventory"),
      message: `Missing required surfaces: ${missingSurfaces.join(", ")}.`,
      owner: "UX QA owner",
      severity: "blocking",
    });
  }

  if (finalUx.status === "failed") {
    addFinding({
      area: "Final UX Gates",
      evidence: artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
      message: "Final UX gates failed.",
      owner: "UX QA owner",
      severity: "blocking",
    });
  }
  for (const finding of finalUx.unresolvedFindings ?? []) {
    addFinding({
      area: "Final UX Gates",
      evidence: artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
      message: finding.message ?? finding.category ?? "Unresolved final UX finding.",
      owner: finding.owner,
      severity: finding.severity ?? "needs-review",
    });
  }
  for (const finding of finalUx.waivedFindings ?? []) {
    addFinding({
      area: "Final UX Gates",
      evidence: artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
      message: finding.message ?? finding.category ?? "Waived final UX finding.",
      owner: finding.owner,
      severity: "waived",
    });
  }
  if (
    (finalUx.status === "passed-with-findings" || finalUx.status === "not-review-complete") &&
    (finalUx.unresolvedFindings ?? []).length === 0
  ) {
    addFinding({
      area: "Final UX Gates",
      evidence: artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
      message: `Final UX status is ${finalUx.status}.`,
      owner: "UX QA owner",
      severity: "needs-review",
    });
  }

  addActionAuditFindings({ actionInventory, actionSummary, addFinding, manifest });
  addLowResourceFindings({ addFinding, lowResource, lowResourceSummary, manifest });
  addAccessibilityFindings({ accessibility, addFinding, manifest });
  addReadAlongFindings({ addFinding, manifest, readAlongSync });
  addGoldenMinuteFindings({ addFinding, goldenMinute, manifest });
  addTelepromptFindings({ addFinding, manifest, teleprompt });

  addFinding({
    area: "Human QA",
    evidence: manualQaLink(manifest),
    message: "Human golden-minute QA script is available for attaching manual findings.",
    owner: "Reviewer",
    severity: "informational",
  });

  return findings;
}

function addActionAuditFindings({ actionInventory, actionSummary, addFinding, manifest }) {
  const resultSummary = actionSummary.resultSummary ?? {};
  const reviewGate = actionSummary.reviewGate ?? {};
  const duplicateClassification =
    reviewGate.duplicateClassification ?? actionSummary.summaries?.duplicateClassification ?? {};
  const inventorySummary = actionInventory.summary ?? actionSummary.summaries?.inventory ?? {};
  const evidence = artifactEvidence(manifest, "ui-actions-e2e", "summary");

  if (Number(resultSummary.failed ?? 0) > 0) {
    addFinding({
      area: "Action audit",
      evidence,
      message: `${String(resultSummary.failed)} UI action activation(s) failed.`,
      owner: "UX QA owner",
      severity: "blocking",
    });
  }
  if (
    reviewGate.status === "not-review-complete" ||
    actionSummary.status === "completed-with-findings"
  ) {
    const summary = reviewGate.summary ?? {};
    addFinding({
      area: "Action audit",
      evidence,
      message: `UI action audit is not review-complete (${String(
        summary["needs-review"] ?? summary.needsReview ?? 0,
      )} needs-review, ${String(summary.waived ?? 0)} waived).`,
      owner: "UX QA owner",
      severity: "needs-review",
    });
  }
  if (Number(duplicateClassification.unclassified ?? 0) > 0) {
    addFinding({
      area: "Duplicates",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "duplicates"),
      message: `${String(duplicateClassification.unclassified)} duplicate action group(s) are unclassified.`,
      owner: "UX action inventory owner",
      severity: "blocking",
    });
  }
  if (Number(duplicateClassification.overexposed ?? 0) > 0) {
    addFinding({
      area: "Duplicates",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "duplicates"),
      message: `${String(duplicateClassification.overexposed)} duplicate action group(s) are overexposed.`,
      owner: "UX action inventory owner",
      severity: "needs-review",
    });
  }
  if (Number(duplicateClassification.needsConsolidation ?? 0) > 0) {
    addFinding({
      area: "Duplicates",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "duplicates"),
      message: `${String(
        duplicateClassification.needsConsolidation,
      )} duplicate action group(s) need IA consolidation.`,
      owner: "UX action inventory owner",
      severity: "needs-review",
    });
  }
  if (Number(duplicateClassification.waived ?? 0) > 0) {
    addFinding({
      area: "Duplicates",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "duplicates"),
      message: `${String(duplicateClassification.waived)} duplicate action group(s) are waived/classified.`,
      owner: "UX action inventory owner",
      severity: "waived",
    });
  }
  if (Number(inventorySummary.missingStableTestIds ?? 0) > 0) {
    addFinding({
      area: "Stable test IDs",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "actionInventory"),
      message: `${String(inventorySummary.missingStableTestIds)} visible action(s) lack stable test IDs.`,
      owner: "UI platform owner",
      severity: "needs-review",
    });
  }
  if (Number(inventorySummary.generatedUnstableActionIds ?? 0) > 0) {
    addFinding({
      area: "Stable test IDs",
      evidence: artifactEvidence(manifest, "ui-actions-e2e", "actionInventory"),
      message: `${String(inventorySummary.generatedUnstableActionIds)} action ID(s) are unstable generated IDs.`,
      owner: "UI platform owner",
      severity: "blocking",
    });
  }
}

function addLowResourceFindings({ addFinding, lowResource, lowResourceSummary, manifest }) {
  const evidence = artifactEvidence(
    manifest,
    "book-cinema-low-resource-e2e",
    "lowResourceWaiverBurndownJson",
  );
  const blocking = Number(
    lowResource.blocking ?? lowResourceSummary.readerTiming?.failures?.blocking ?? 0,
  );
  if (blocking > 0) {
    addFinding({
      area: "Low-resource",
      evidence,
      message: `${String(blocking)} low-resource metric(s) are blocking.`,
      owner: "Performance owner",
      severity: "blocking",
    });
  }
  for (const item of lowResource.items ?? []) {
    if (item.status === "waived-over-budget") {
      addFinding({
        area: "Low-resource",
        evidence,
        message: `${item.metric} is waived over budget (${formatMs(item.actualMaxMs)} > ${formatMs(
          item.budgetMs,
        )}; p95 ${formatMs(item.p95Ms)}, p99 ${formatMs(item.p99Ms)}).`,
        owner: item.owner,
        severity: "waived",
      });
    } else if (item.status === "blocking" || item.classification === "blocking") {
      addFinding({
        area: "Low-resource",
        evidence,
        message: `${item.metric} is blocking (${formatMs(item.actualMaxMs)} > ${formatMs(
          item.budgetMs,
        )}).`,
        owner: item.owner,
        severity: "blocking",
      });
    }
  }
}

function addAccessibilityFindings({ accessibility, addFinding, manifest }) {
  const summary = accessibility.summary ?? {};
  if (Number(summary.failures ?? 0) > 0) {
    addFinding({
      area: "Accessibility",
      evidence: artifactEvidence(manifest, "accessibility-audit-e2e", "accessibilityFindings"),
      message: `${String(summary.failures)} accessibility failure(s) were reported.`,
      owner: "Accessibility owner",
      severity: "blocking",
    });
  }
  if (Number(summary.warnings ?? 0) > 0) {
    addFinding({
      area: "Accessibility",
      evidence: artifactEvidence(manifest, "accessibility-audit-e2e", "accessibilityFindings"),
      message: `${String(summary.warnings)} accessibility warning(s) remain for review.`,
      owner: "Accessibility owner",
      severity: "informational",
    });
  }
}

function addReadAlongFindings({ addFinding, manifest, readAlongSync }) {
  const metrics = readAlongSync.metrics ?? {};
  const wrongOrStale =
    Number(metrics.wrongNodeCount ?? 0) +
    Number(metrics.wrongWordCount ?? 0) +
    Number(metrics.staleHighlightCount ?? 0);
  if (readAlongSync.status && readAlongSync.status !== "passed") {
    addFinding({
      area: "Read-along",
      evidence: artifactEvidence(manifest, "readalong-sync-e2e", "syncMetrics"),
      message: `Read-along sync status is ${readAlongSync.status}.`,
      owner: "Read-along owner",
      severity: "blocking",
    });
  }
  if (wrongOrStale > 0) {
    addFinding({
      area: "Read-along",
      evidence: artifactEvidence(manifest, "readalong-sync-e2e", "syncMetrics"),
      message: `${String(wrongOrStale)} wrong/stale highlight event(s) were reported.`,
      owner: "Read-along owner",
      severity: "blocking",
    });
  }
  if (Number(metrics.degradedTimePercentage ?? 0) > 0) {
    addFinding({
      area: "Read-along",
      evidence: artifactEvidence(manifest, "readalong-sync-e2e", "syncMetrics"),
      message: `Degraded sync covered ${formatPercent(metrics.degradedTimePercentage)} of playback.`,
      owner: "Alignment owner",
      severity: "waived",
    });
  }
}

function addGoldenMinuteFindings({ addFinding, goldenMinute, manifest }) {
  if (goldenMinute.status && goldenMinute.status !== "passed") {
    addFinding({
      area: "Golden-minute",
      evidence: artifactEvidence(manifest, "golden-minute-e2e", "goldenMinuteResults"),
      message: `Golden-minute status is ${goldenMinute.status}.`,
      owner: "Read-along owner",
      severity: "blocking",
    });
  }
  if (Number(goldenMinute.summary?.browserFailures ?? 0) > 0) {
    addFinding({
      area: "Golden-minute",
      evidence: artifactEvidence(manifest, "golden-minute-e2e", "goldenMinuteResults"),
      message: `${String(goldenMinute.summary.browserFailures)} golden-minute browser failure(s).`,
      owner: "Read-along owner",
      severity: "blocking",
    });
  }
}

function addTelepromptFindings({ addFinding, manifest, teleprompt }) {
  if (teleprompt.status && teleprompt.status !== "passed") {
    addFinding({
      area: "Teleprompt Theatre",
      evidence: artifactEvidence(manifest, "teleprompt-memory-e2e", "telepromptMemoryResults"),
      message: `Teleprompt Theatre status is ${teleprompt.status}.`,
      owner: "Teleprompt owner",
      severity: "blocking",
    });
  }
  if (Number(teleprompt.summary?.failures ?? 0) > 0) {
    addFinding({
      area: "Teleprompt Theatre",
      evidence: artifactEvidence(manifest, "teleprompt-memory-e2e", "telepromptMemoryResults"),
      message: `${String(teleprompt.summary.failures)} Teleprompt Theatre failure(s).`,
      owner: "Teleprompt owner",
      severity: "blocking",
    });
  }
}

function collectUnresolvedWaivers(manifest, qaDocuments) {
  const waivers = [];
  const addWaiver = (waiver, source, evidence) => {
    if (!waiver) {
      return;
    }
    waivers.push({
      evidence,
      id: waiver.id ?? waiver.waiverId ?? waiver.metric ?? "unnamed-waiver",
      owner: waiver.owner,
      reason: waiver.reason,
      reviewDate: waiver.reviewDate,
      source,
      target: waiver.target,
    });
  };

  for (const waiver of manifest.waivers ?? []) {
    addWaiver(waiver, "review-manifest", reviewFileLink(manifest, "reviewManifest"));
  }
  for (const waiver of qaDocuments.finalUxGates?.waivers ?? []) {
    addWaiver(
      waiver,
      "final-ux-gates",
      artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
    );
  }
  for (const finding of qaDocuments.finalUxGates?.waivedFindings ?? []) {
    addWaiver(
      finding.waiver ?? {
        id: finding.id,
        owner: finding.owner,
        reason: finding.message,
      },
      "final-ux-gates",
      artifactEvidence(manifest, "final-ux-gates", "finalUxResults"),
    );
  }
  for (const item of qaDocuments.lowResourceWaiverBurndown?.items ?? []) {
    if (item.status === "waived-over-budget" || item.waiverId) {
      addWaiver(
        {
          id: item.waiverId ?? item.metric,
          owner: item.owner,
          reason: `${item.metric}: ${item.classification ?? item.status}`,
          reviewDate: item.reviewDate,
          target: item.target,
        },
        "low-resource",
        artifactEvidence(manifest, "book-cinema-low-resource-e2e", "lowResourceWaiverBurndownJson"),
      );
    }
  }

  const seen = new Set();
  return waivers.filter((waiver) => {
    const key = `${waiver.source}:${waiver.id}:${waiver.owner ?? ""}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function determineMergeReadiness({ findings, manifest, unresolvedWaivers }) {
  const blocking = findings.filter((finding) => finding.severity === "blocking");
  const needsReview = findings.filter((finding) => finding.severity === "needs-review");
  const waived =
    unresolvedWaivers.length > 0 ||
    findings.some((finding) => finding.severity === "waived") ||
    manifest.dirtyTree?.waived;
  if (blocking.length > 0) {
    return {
      reasons: blocking.slice(0, 4).map((finding) => finding.message),
      status: "blocked",
    };
  }
  if (needsReview.length > 0) {
    return {
      reasons: needsReview.slice(0, 4).map((finding) => finding.message),
      status: "not ready",
    };
  }
  if (waived) {
    return {
      reasons: ["No blocking findings remain, but explicit waivers are still active."],
      status: "ready with waivers",
    };
  }
  if (manifest.status !== "passed") {
    return {
      reasons: [`Review manifest status is ${manifest.status}.`],
      status: "not ready",
    };
  }
  return {
    reasons: ["No blocking, needs-review, or waived findings were detected."],
    status: "ready",
  };
}

function buildTriageArtifactIndex(manifest) {
  const fixedReviewFiles = [
    { area: "Review", key: "reviewManifest", label: "review-manifest.json" },
    { area: "Review", key: "reviewerSummary", label: "reviewer-summary.md" },
    { area: "Review", key: "commands", label: "commands.txt" },
    { area: "Review", key: "head", label: "head.txt" },
  ].map((entry) => ({
    area: entry.area,
    label: entry.label,
    link: reviewFileLink(manifest, entry.key),
    status: manifest.reviewFiles?.[entry.key] ? "present" : "missing",
  }));
  const artifactSpecs = [
    ["Final UX", "final-ux-gates", "finalUxResults", "final-ux-results.json"],
    ["UI actions", "ui-actions-e2e", "summary", "summary.json"],
    ["UI actions", "ui-actions-e2e", "actionInventory", "action-inventory.json"],
    ["UI actions", "ui-actions-e2e", "actionResults", "action-results.json"],
    ["UI actions", "ui-actions-e2e", "duplicates", "duplicates.md"],
    ["UI actions", "ui-actions-e2e", "screenshots", "screenshots"],
    [
      "Low-resource",
      "book-cinema-low-resource-e2e",
      "lowResourceWaiverBurndownJson",
      "waiver-burndown.json",
    ],
    ["Low-resource", "book-cinema-low-resource-e2e", "lowResourceTiming", "timing.json"],
    ["Low-resource", "book-cinema-low-resource-e2e", "screenshots", "screenshots"],
    ["Accessibility", "accessibility-audit-e2e", "accessibilityFindings", "a11y-findings.json"],
    [
      "Accessibility",
      "accessibility-audit-e2e",
      "accessibilityResults",
      "accessibility-results.json",
    ],
    ["Accessibility", "accessibility-audit-e2e", "screenshots", "screenshots"],
    ["Read-along", "readalong-sync-e2e", "syncMetrics", "sync-metrics.json"],
    ["Read-along", "readalong-sync-e2e", "syncTimeline", "drift-timeline.json"],
    ["Read-along", "readalong-sync-e2e", "screenshots", "screenshots"],
    ["Golden-minute", "golden-minute-e2e", "goldenMinuteResults", "golden-minute-results.json"],
    ["Golden-minute", "golden-minute-e2e", "speechFluencyResults", "speech-fluency-report.json"],
    ["Golden-minute", "golden-minute-e2e", "visualTimeline", "visual-timeline.md"],
    ["Golden-minute", "golden-minute-e2e", "visualTimelineResults", "visual-timeline.json"],
    [
      "Golden-minute",
      "golden-minute-e2e",
      "segmentBoundaryResults",
      "segment-boundary-report.json",
    ],
    [
      "Golden-minute",
      "golden-minute-e2e",
      "artifactCompatibilityResults",
      "artifact-compatibility-report.json",
    ],
    ["Golden-minute", "golden-minute-e2e", "screenshots", "screenshots"],
    [
      "Teleprompt Theatre",
      "teleprompt-memory-e2e",
      "telepromptMemoryResults",
      "teleprompt-memory-results.json",
    ],
    ["Teleprompt Theatre", "teleprompt-memory-e2e", "screenshots", "screenshots"],
  ];
  return [
    ...fixedReviewFiles,
    ...artifactSpecs.map(([area, stepId, key, label]) => {
      const record = findArtifactRecord(manifest, stepId, key);
      return {
        area,
        label,
        link: record ? artifactLink(record) : "-",
        status: record?.ok ? "present" : "missing",
      };
    }),
  ];
}

function normalizeTriageFinding(finding) {
  return {
    area: finding.area ?? "Review",
    evidence: finding.evidence ?? "-",
    message: finding.message ?? "Unspecified finding.",
    owner: finding.owner ?? "-",
    severity: normalizeSeverity(finding.severity),
  };
}

function normalizeSeverity(severity) {
  return TRIAGE_SEVERITY_RANK[String(severity)] === undefined ? "needs-review" : String(severity);
}

function sortTriageFindings(findings) {
  return [...findings].sort((left, right) => {
    const severityDelta =
      TRIAGE_SEVERITY_RANK[left.severity] - TRIAGE_SEVERITY_RANK[right.severity];
    if (severityDelta !== 0) {
      return severityDelta;
    }
    const areaDelta = left.area.localeCompare(right.area);
    if (areaDelta !== 0) {
      return areaDelta;
    }
    return left.message.localeCompare(right.message);
  });
}

function findArtifactRecord(manifest, stepId, key) {
  return (manifest.artifactRecords ?? []).find(
    (record) => record.stepId === stepId && record.key === key,
  );
}

function artifactEvidence(manifest, stepId, key) {
  const record = findArtifactRecord(manifest, stepId, key);
  return record ? artifactLink(record) : "-";
}

function reviewFileLink(manifest, key) {
  const filePath = manifest.reviewFiles?.[key];
  if (!filePath) {
    return "-";
  }
  const relativePath = path.relative(manifest.outputDir, filePath);
  return `[${escapeMarkdown(relativePath)}](${encodeURI(relativePath)})`;
}

function manualQaLink(manifest) {
  const relativePath = path.relative(
    manifest.outputDir,
    path.join(manifest.rootDir ?? rootDir, "docs", "qa", "golden-minute-human-review.md"),
  );
  return `[${escapeMarkdown(relativePath)}](${encodeURI(relativePath)})`;
}

function formatMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return `${number.toFixed(number >= 100 ? 0 : 1)} ms`;
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "-";
  }
  return `${number.toFixed(1)}%`;
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

function dirtyTreeSummarySection(manifest) {
  if (manifest.dirtyTree?.gateStatus === "passed") {
    return [];
  }
  const statusLines = manifest.workingTree.status ?? [];
  const untrackedFiles = manifest.workingTree.untrackedFiles ?? [];
  const diffStat = manifest.workingTree.diffStat ?? [];
  const lines = [
    "",
    manifest.dirtyTree?.waived
      ? '## <span style="color: #b91c1c">Dirty Tree Waiver</span>'
      : '## <span style="color: #b91c1c">Dirty Tree Gate Failed</span>',
    "",
  ];

  if (manifest.dirtyTree?.waived) {
    lines.push(
      `<p style="border-left: 4px solid #dc2626; color: #991b1b; padding-left: 12px;"><strong>${manifest.dirtyTree.environmentVariable}=1</strong> was set, so this review evidence is explicitly waived despite a dirty tree at start.</p>`,
    );
  } else {
    lines.push(
      `<p style="border-left: 4px solid #dc2626; color: #991b1b; padding-left: 12px;">The working tree was dirty at start and <strong>${DIRTY_TREE_WAIVER_ENV}=1</strong> was not set, so review commands were not executed.</p>`,
    );
  }

  lines.push("", `Commit hash: \`${manifest.gitStatusSnapshot?.commitHash ?? manifest.head}\``);
  if (diffStat.length > 0) {
    lines.push("", "Diff stat:", "", "```text", ...diffStat, "```");
  }
  if (untrackedFiles.length > 0) {
    lines.push("", "Untracked files:");
    for (const filePath of untrackedFiles) {
      lines.push(`- ${escapeMarkdown(filePath)}`);
    }
  }
  if (statusLines.length > 0) {
    lines.push("", "Git status:");
    for (const item of statusLines) {
      lines.push(`- \`${escapeMarkdown(item)}\``);
    }
  }

  return lines;
}

async function readGitInfo(cwd) {
  const [branch, head, status, diffStat, untracked] = await Promise.all([
    execGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd),
    execGit(["rev-parse", "HEAD"], cwd),
    execGit(["status", "--short"], cwd),
    execGit(["diff", "--stat", "HEAD", "--"], cwd),
    execGit(["ls-files", "--others", "--exclude-standard"], cwd),
  ]);
  const statusLines = status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const diffStatLines = diffStat
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const untrackedFiles = untracked
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  const cleanBranch = branch.trim();
  const cleanHead = head.trim();
  return {
    branch: cleanBranch,
    diffStat: diffStatLines,
    dirty: statusLines.length > 0,
    head: cleanHead,
    status: statusLines,
    statusSnapshot: {
      branch: cleanBranch,
      commitHash: cleanHead,
      diffStat: diffStatLines,
      dirty: statusLines.length > 0,
      statusShort: statusLines,
      untrackedFiles,
    },
    untrackedFiles,
  };
}

export function isDirtyTreeWaiverEnabled(env = process.env) {
  return env[DIRTY_TREE_WAIVER_ENV] === "1";
}

export function buildDirtyTreeReviewState({ allowDirty, gitInfo }) {
  const dirty = Boolean(gitInfo.dirty);
  const waived = dirty && allowDirty;
  return {
    allowDirty,
    dirty,
    environmentVariable: DIRTY_TREE_WAIVER_ENV,
    gateStatus: dirty ? (waived ? "waived" : "failed") : "passed",
    waived,
  };
}

function reviewBundleThresholds(bundle) {
  const dirtyTreeThreshold = {
    actual: bundle.dirtyTree.gateStatus,
    expected: "passed-or-waived",
    metric: "dirtyTreeGate",
    operator: "in",
    passed: bundle.dirtyTree.gateStatus !== "failed",
    threshold: "cleanWorkingTreeOrExplicitDirtyWaiver",
  };
  if (bundle.dirtyTree.gateStatus === "failed") {
    return [dirtyTreeThreshold];
  }
  return [
    dirtyTreeThreshold,
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
  ];
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
