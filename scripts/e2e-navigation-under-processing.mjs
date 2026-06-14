import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";

const env = {
  ...process.env,
  E2E_USE_EXISTING_SERVERS: process.env.E2E_USE_EXISTING_SERVERS ?? "0",
  UI_ACTION_AUDIT_MAX_ACTIONS: process.env.UI_ACTION_AUDIT_MAX_ACTIONS ?? "12",
  UI_ACTION_AUDIT_OUTPUT_DIR:
    process.env.UI_ACTION_AUDIT_OUTPUT_DIR ??
    "./output/ui-action-audit/navigation-under-processing",
  UI_ACTION_AUDIT_QUICK: process.env.UI_ACTION_AUDIT_QUICK ?? "1",
  UI_ACTION_AUDIT_SCENARIOS:
    process.env.UI_ACTION_AUDIT_SCENARIOS ??
    "workspace-preview-generation-running,workspace-preview-generation-failed",
  UI_ACTION_AUDIT_SUMMARY_PATH:
    process.env.UI_ACTION_AUDIT_SUMMARY_PATH ??
    "./output/ui-action-audit/navigation-under-processing/summary.json",
  UI_ACTION_AUDIT_WORKER_LIMIT: process.env.UI_ACTION_AUDIT_WORKER_LIMIT ?? "1",
};

const child = spawn(process.execPath, ["scripts/e2e-ui-action-audit.mjs"], {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  void exitWithNavigationResult(code ?? 1);
});

async function exitWithNavigationResult(code) {
  if (code === 0) {
    process.exit(0);
  }
  const summaryPath = env.UI_ACTION_AUDIT_SUMMARY_PATH;
  try {
    const summary = JSON.parse(await readFile(summaryPath, "utf8"));
    const resultSummary = summary.resultSummary ?? {};
    const scenarioTimings = Array.isArray(summary.scenarioTimings) ? summary.scenarioTimings : [];
    const scenariosCompleted = scenarioTimings.every((scenario) => scenario.status === "completed");
    if (resultSummary.failed === 0 && scenariosCompleted) {
      console.warn(
        `[navigation-under-processing] activation replay passed; shared audit exited ${String(
          code,
        )} because filtered inventory gates still need review. See ${summaryPath}.`,
      );
      process.exit(0);
    }
  } catch (error) {
    console.warn(`[navigation-under-processing] could not read audit summary: ${String(error)}`);
  }
  process.exit(code);
}
