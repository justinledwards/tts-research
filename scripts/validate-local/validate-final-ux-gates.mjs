#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  finalAccessibilityArtifacts,
  finalCommandPaletteArtifacts,
  finalContextPanelArtifacts,
  finalReadAlongSyncArtifacts,
  finalResponsiveArtifacts,
  finalSurfaceComplexityArtifacts,
  finalTelepromptArtifacts,
  finalUiActionArtifacts,
  finalUxArtifactPaths,
  finalUxGateThresholds,
  evaluateFinalUxGates,
  readFinalUxDocuments,
  renderFinalUxSummary,
} from "./validate-final-ux-gates-helpers.mjs";
import {
  buildCommandMoreCrossAudit,
  renderCommandMoreCrossAuditMarkdown,
} from "../command-more-cross-audit.mjs";
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
          passedWithFindingsGates: result.summary.passedWithFindings,
          passedGates: result.summary.passed,
          totalGates: result.summary.total,
          unresolvedFindings: result.summary.unresolvedFindings,
          waivedFindings: result.summary.waivedFindings,
          waivers: result.waivers.length,
        },
        thresholds: finalUxGateThresholds(result.gates),
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
  const commandMoreCrossAudit = buildCommandMoreCrossAudit({
    actionInventory: documents.actionInventory,
    commandPaletteResults: documents.commandPaletteResults,
  });
  const files = {
    commandMoreMatrix: path.join(context.outputDir, "command-more-matrix.md"),
    commandMoreMatrixJson: path.join(context.outputDir, "command-more-matrix.json"),
    results: path.join(context.outputDir, "final-ux-results.json"),
    summary: path.join(context.outputDir, "final-ux-summary.md"),
  };
  const withFiles = {
    ...result,
    commandMoreCrossAudit,
    files,
    reports: {
      validateLocalHtml: path.join(context.outputDir, "report.html"),
      validateLocalMarkdown: path.join(context.outputDir, "report.md"),
      validateLocalSummary: path.join(context.outputDir, "summary.json"),
    },
  };
  await writeFile(
    files.commandMoreMatrixJson,
    `${JSON.stringify(commandMoreCrossAudit, null, 2)}\n`,
  );
  await writeFile(
    files.commandMoreMatrix,
    renderCommandMoreCrossAuditMarkdown(commandMoreCrossAudit),
  );
  await writeFile(files.results, `${JSON.stringify(withFiles, null, 2)}\n`);
  await writeFile(files.summary, renderFinalUxSummary(withFiles));
  return withFiles;
}

export {
  evaluateFinalUxGates,
  renderFinalUxSummary,
  finalUxArtifactPaths,
  finalUxGateThresholds,
  readFinalUxDocuments,
  finalUiActionArtifacts,
  finalTelepromptArtifacts,
  finalReadAlongSyncArtifacts,
  finalAccessibilityArtifacts,
  finalResponsiveArtifacts,
  finalCommandPaletteArtifacts,
  finalContextPanelArtifacts,
  finalSurfaceComplexityArtifacts,
};

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
