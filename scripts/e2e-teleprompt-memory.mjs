#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  gotoApp,
  loadPlaywright,
  prepareOutputDir,
  projectStorageState,
  startLocalServices,
  workspaceQaText,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_TELEPROMPT_MEMORY_OUTPUT_DIR ??
  path.join(rootDir, "output", "teleprompt-memory", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const telepromptMemoryKey = "tts-teleprompt-studio-memory";
const uiMemoryKey = "tts-ui-memory";

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "teleprompt-memory-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "teleprompt-memory-e2e.v1",
    status: "failed",
  }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await prepareOutputDir(outputDir, screenshotsDir);
  const services = useExistingServers
    ? null
    : await startLocalServices({ artifactDir: outputDir, rootDir });
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }

  try {
    const project = await createQaProject(
      apiBaseUrl,
      `Teleprompt Memory QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const screenshots = [];
    let result;
    try {
      result = await runTelepromptMemoryAudit(browser, project.id, screenshots);
    } finally {
      await browser.close();
    }
    const document = {
      appBaseUrl,
      generatedAt: new Date().toISOString(),
      result,
      schemaVersion: "teleprompt-memory-e2e.v1",
      status: result.passed ? "passed" : "failed",
      summary: {
        checks: result.checks.length,
        failures: result.failures.length,
        screenshots: screenshots.length,
      },
    };
    await writeJson(path.join(outputDir, "teleprompt-memory-results.json"), document);
    await writeFile(path.join(outputDir, "teleprompt-memory-report.md"), renderReport(document));
    console.log(`Teleprompt memory E2E ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runTelepromptMemoryAudit(browser, projectId, screenshots) {
  const enabledUiMemory = JSON.stringify({
    cinema: {
      book: { activePanelId: null, mode: "read", pinnedPanelId: null },
      document: { activePanelId: null, mode: "read", pinnedPanelId: null },
      website: { activePanelId: null, mode: "read", pinnedPanelId: null },
    },
    rememberLastProject: true,
    rememberLayout: true,
    rememberPanelPins: false,
    rememberReaderPreferences: true,
    rememberTelepromptReturnTarget: true,
    rememberTheme: true,
    version: 1,
    workspace: {
      layoutMode: "focus",
      projectLayoutModes: {},
      reviewPanes: {},
      telepromptReturnStages: {},
    },
  });
  const context = await browser.newContext({
    storageState: projectStorageState(
      appBaseUrl,
      projectId,
      {
        sourceMode: "text",
        stage: "preview",
        text: workspaceQaText(),
      },
      { [uiMemoryKey]: enabledUiMemory },
    ),
    viewport: { height: 960, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  const checks = [];
  const failures = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };

  try {
    await gotoApp(page, appBaseUrl);
    await openPreview(page);
    await page.getByTestId("workspace-stage-action-openTeleprompt").click();
    await page.getByTestId("teleprompt-studio").waitFor();
    await capture("teleprompt-from-preview");
    await page.getByText("Default voice").first().waitFor();
    await page
      .getByText(/Policy/i)
      .first()
      .waitFor();
    checks.push("Teleprompt shows voice and policy context.");

    const nextCue = page.getByTestId("ui-action-teleprompt-next-cue");
    if (await nextCue.isEnabled().catch(() => false)) {
      await nextCue.click();
      checks.push("Next cue can be selected before returning.");
    }
    await page.getByTestId("ui-action-teleprompt-preset-largeText").click();
    await page.getByTestId("ui-action-teleprompt-workflow-menu").click();
    await page.getByTestId("ui-action-teleprompt-back-preview").click();
    await page.getByText("Spoken Form").first().waitFor();
    checks.push("Back to Preview returns to the Preview surface.");
    await capture("teleprompt-back-preview");

    const storedPreviewMemory = await readTelepromptMemory(page, projectId);
    if (storedPreviewMemory?.returnTarget !== "preview") {
      failures.push(
        `Expected returnTarget preview after Back to Preview, got ${storedPreviewMemory?.returnTarget ?? "none"}.`,
      );
    } else {
      checks.push("Preview return target persisted.");
    }
    if (!storedPreviewMemory?.sourceKey) {
      failures.push("Teleprompt memory did not persist a source key.");
    }
    if (!storedPreviewMemory?.activeBlockId) {
      failures.push("Teleprompt memory did not persist an active block id.");
    }
    if (!storedPreviewMemory?.sourceLabel) {
      failures.push("Teleprompt memory did not persist source label context.");
    }
    if (!storedPreviewMemory?.selectedCueIndex) {
      failures.push("Teleprompt memory did not persist selected cue index.");
    }
    if (storedPreviewMemory?.voiceProfile !== "Default voice") {
      failures.push(
        `Expected voice profile Default voice, got ${storedPreviewMemory?.voiceProfile ?? "none"}.`,
      );
    }
    if (!storedPreviewMemory?.policyProfile) {
      failures.push("Teleprompt memory did not persist policy profile context.");
    }
    if (storedPreviewMemory?.originatingStage !== "preview") {
      failures.push(
        `Expected originating stage preview, got ${storedPreviewMemory?.originatingStage ?? "none"}.`,
      );
    }

    await page.getByTestId("workspace-stage-action-openTeleprompt").click();
    await page.getByTestId("teleprompt-studio").waitFor();
    await page.getByTestId("ui-action-teleprompt-workflow-menu").click();
    await page.getByTestId("ui-action-teleprompt-back-review").click();
    await page.getByText("Revision Panel").first().waitFor();
    await capture("teleprompt-back-review");
    const storedReviewMemory = await readTelepromptMemory(page, projectId);
    if (storedReviewMemory?.returnTarget !== "review") {
      failures.push(
        `Expected returnTarget review after Back to Review, got ${storedReviewMemory?.returnTarget ?? "none"}.`,
      );
    } else {
      checks.push("Review return target persisted.");
    }
    if (storedReviewMemory?.originatingStage !== "preview") {
      failures.push(
        `Expected review snapshot originating stage preview, got ${
          storedReviewMemory?.originatingStage ?? "none"
        }.`,
      );
    }

    await page.evaluate(
      ({ memoryKey, uiMemoryStorageKey }) => {
        const raw = localStorage.getItem(uiMemoryStorageKey);
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          uiMemoryStorageKey,
          JSON.stringify({ ...current, rememberTelepromptReturnTarget: false }),
        );
        localStorage.setItem(memoryKey, JSON.stringify({ stale: { returnTarget: "preview" } }));
      },
      { memoryKey: telepromptMemoryKey, uiMemoryStorageKey: uiMemoryKey },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(250);
    const clearedMemory = await page.evaluate(
      (memoryKey) => localStorage.getItem(memoryKey),
      telepromptMemoryKey,
    );
    if (clearedMemory !== null) {
      failures.push("Teleprompt return memory was not cleared when the preference was disabled.");
    } else {
      checks.push("Disabling return memory clears stored Teleprompt snapshots.");
    }

    const issues = blockingPageIssues(pageIssues);
    if (issues.length > 0) {
      failures.push(...issues);
    }
    return {
      checks,
      failures,
      passed: failures.length === 0,
      storedPreviewMemory,
      storedReviewMemory,
    };
  } finally {
    await context.close();
  }
}

async function openPreview(page) {
  const previewAction = page.getByTestId("workspace-stage-action-previewSpeech");
  if (await previewAction.isVisible().catch(() => false)) {
    await previewAction.click();
  } else {
    await page.getByRole("button", { exact: true, name: "Preview" }).click();
  }
  await page.getByText("Spoken Form").first().waitFor();
}

async function readTelepromptMemory(page, projectId) {
  return page.evaluate(
    ({ memoryKey, projectKey }) => {
      const raw = localStorage.getItem(memoryKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed[projectKey] ?? null;
    },
    {
      memoryKey: telepromptMemoryKey,
      projectKey: projectId.trim().replace(/\s+/g, "-").toLowerCase(),
    },
  );
}

function renderReport(document) {
  const lines = [
    "# Teleprompt Memory E2E",
    "",
    `Status: **${document.status.toUpperCase()}**`,
    `Generated: ${document.generatedAt}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of document.result.checks) {
    lines.push(`- ${check}`);
  }
  if (document.result.failures.length > 0) {
    lines.push("", "## Findings", "");
    for (const failure of document.result.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}
