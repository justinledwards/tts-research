import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

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

export function extractLowResourceWaivers(summary) {
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

export async function inspectStepArtifacts(steps, outputDir) {
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

export async function readQaDocuments(artifactRecords) {
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

export function commandRunEntry(step) {
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

export function renderHeadText(manifest) {
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

export function renderCommandsText(manifest) {
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
