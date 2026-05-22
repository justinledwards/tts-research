#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import {
  buildActionInventory,
  exerciseAction,
  summarizeDuplicates,
} from "./e2e-ui-action-matrix.mjs";
import { renderDeadControlsReport, renderDuplicatesReport } from "./e2e-ui-dead-controls.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.UI_ACTION_AUDIT_OUTPUT_DIR ??
  path.join(rootDir, "output", "ui-action-audit", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "180000", 10);
const activeProjectKey = "tts-active-project-id";
const maxActions = Number.parseInt(process.env.UI_ACTION_AUDIT_MAX_ACTIONS ?? "0", 10);
const actionTimeoutMs = Number.parseInt(
  process.env.UI_ACTION_AUDIT_ACTION_TIMEOUT_MS ?? "8000",
  10,
);
const failOnFindings = process.env.UI_ACTION_AUDIT_FAIL_ON_FINDINGS === "1";
const inventoryOnly = process.env.UI_ACTION_AUDIT_INVENTORY_ONLY === "1";
const scenarioFilter = parseScenarioFilter(process.env.UI_ACTION_AUDIT_SCENARIOS);

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeFile(
    path.join(outputDir, "action-results.json"),
    `${JSON.stringify(
      {
        error: message,
        generatedAt: new Date().toISOString(),
        schemaVersion: "ui-action-results.v1",
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
  await mkdir(screenshotsDir, { recursive: true });
  const fixtures = await ensureFixtures();
  const services = useExistingServers ? null : await startLocalServices();
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }

  try {
    await assertServerReady();
    const { chromium } = await loadPlaywright();
    const seed = await seedAuditData(fixtures);
    const scenarios = filterScenarios(createScenarios(seed), scenarioFilter);
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const actions = [];
    const results = [];
    const screenshots = [];

    try {
      if (!inventoryOnly && shouldRunTraversal(scenarioFilter)) {
        const traversal = await runWorkspaceStageTraversal(browser, seed);
        results.push(traversal.result);
        screenshots.push(...traversal.screenshots);
      }

      for (const scenario of scenarios) {
        console.log(`[ui-actions] inventory ${scenario.id}`);
        const scenarioInventory = await inventoryScenario(browser, scenario);
        actions.push(...scenarioInventory.actions);
        screenshots.push(scenarioInventory.screenshot);
        if (inventoryOnly) {
          continue;
        }
        const runnableActions =
          maxActions > 0
            ? scenarioInventory.actions.slice(0, maxActions)
            : scenarioInventory.actions;
        for (const [index, action] of runnableActions.entries()) {
          const activationModes =
            action.disabled || action.destructive ? ["keyboard"] : ["pointer", "keyboard"];
          for (const activationMode of activationModes) {
            console.log(
              `[ui-actions] replay ${scenario.id} ${String(index + 1)}/${String(
                runnableActions.length,
              )} ${activationMode}: ${action.label}`,
            );
            results.push(await exerciseScenarioAction(browser, scenario, action, activationMode));
          }
        }
      }
    } finally {
      await browser.close();
    }

    const generatedAt = new Date().toISOString();
    const duplicates = summarizeDuplicates(actions);
    const inventoryDocument = {
      actions,
      appBaseUrl,
      apiBaseUrl,
      duplicates,
      generatedAt,
      schemaVersion: "ui-action-inventory.v1",
      scenarios: scenarios.map((scenario) => ({
        description: scenario.description,
        id: scenario.id,
        label: scenario.label,
        surface: scenario.surface,
      })),
      screenshots,
      summary: summarizeInventory(actions),
    };
    const resultsDocument = {
      generatedAt,
      results,
      schemaVersion: "ui-action-results.v1",
      status: inventoryOnly
        ? "inventory-only"
        : summarizeResults(results).failed === 0
          ? "passed"
          : "completed-with-findings",
      summary: summarizeResults(results),
    };

    await writeFile(
      path.join(outputDir, "action-inventory.json"),
      `${JSON.stringify(inventoryDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "action-results.json"),
      `${JSON.stringify(resultsDocument, null, 2)}\n`,
    );
    await writeFile(
      path.join(outputDir, "dead-controls.md"),
      renderDeadControlsReport({ actions, generatedAt, results }),
    );
    await writeFile(
      path.join(outputDir, "duplicates.md"),
      renderDuplicatesReport({ duplicates, generatedAt }),
    );
    await writeFile(
      path.join(outputDir, "reviewer-summary.md"),
      renderReviewerSummary({
        actions,
        duplicates,
        generatedAt,
        inventoryOnly,
        outputDir,
        results,
        scenarios,
        screenshots,
      }),
    );

    console.log(`UI action audit ${resultsDocument.status}. Reports written to ${outputDir}`);
    const gateFindings = summarizeGateFindings({ actions, duplicates, results, scenarios });
    if (failOnFindings && gateFindings.total > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

function parseScenarioFilter(value) {
  const ids = (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

function filterScenarios(scenarios, filter) {
  if (!filter) {
    return scenarios;
  }
  const filtered = scenarios.filter((scenario) => filter.has(scenario.id));
  if (filtered.length === 0 && !filter.has("workspace-stage-traversal")) {
    throw new Error(`No UI action audit scenarios matched: ${[...filter].join(", ")}`);
  }
  return filtered;
}

function shouldRunTraversal(filter) {
  return !filter || filter.has("workspace-stage-traversal");
}

async function inventoryScenario(browser, scenario) {
  const context = await browser.newContext({
    storageState: scenario.storageState,
    viewport: scenario.viewport ?? { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await scenario.open(page);
    await assertNoPageIssues(issues);
    const actions = await buildActionInventory(page, scenario);
    const screenshot = path.join(screenshotsDir, `${scenario.id}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    return { actions, screenshot };
  } catch (error) {
    const screenshot = path.join(screenshotsDir, `${scenario.id}-inventory-failure.png`);
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function exerciseScenarioAction(browser, scenario, action, activationMode) {
  const context = await browser.newContext({
    storageState: scenario.storageState,
    viewport: scenario.viewport ?? { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await scenario.open(page);
    page.setDefaultTimeout(actionTimeoutMs);
    const result = await exerciseAction(page, action, { activationMode });
    result.browserIssues = await pageIssuesForReport(issues);
    if (result.browserIssues.length > 0 && result.passed) {
      return {
        ...result,
        outcome: "browser issue after activation",
        passed: false,
        reason: result.browserIssues.join("; "),
        status: "failed",
      };
    }
    return result;
  } catch (error) {
    const screenshot = path.join(
      screenshotsDir,
      `${scenario.id}-${action.actionId}-failure.png`.replaceAll(/[^a-zA-Z0-9._/-]/g, "-"),
    );
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    return {
      accessibleName: action.accessibleName,
      actionClass: action.actionClass,
      actionId: action.actionId,
      activationMode,
      destructive: action.destructive,
      error: error instanceof Error ? error.message : String(error),
      expectedTransition: action.expectedTransition,
      label: action.label,
      outcome: "scenario replay failed",
      passed: false,
      scenarioId: scenario.id,
      screenshot,
      status: "failed",
      surface: action.surface,
      visibleLabel: action.visibleLabel,
    };
  } finally {
    await context.close();
  }
}

async function seedAuditData(fixtures) {
  const project = await apiJson("/api/projects", {
    body: JSON.stringify({ name: `UI Action Audit ${new Date().toISOString()}` }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert(project.id, "Project creation did not return an id.");

  const pdfBook = await uploadBook(project.id, fixtures.pdf);
  const pdfScope = pickNarrationScope(pdfBook);
  const pdfText = await scopeText(pdfBook.id, pdfScope);

  const docxBook = await uploadBook(project.id, fixtures.docx);
  const docxScope = pickNarrationScope(docxBook);
  const docxText = await scopeText(docxBook.id, docxScope);
  const docxJob = await waitForJob(
    (await createBookNarrationJob(project.id, docxBook.id, docxScope)).id,
  );

  const epubBook = await uploadBook(project.id, fixtures.epub);
  const epubScope = pickNarrationScope(epubBook);
  const epubText = await scopeText(epubBook.id, epubScope);
  const epubJob = await waitForJob(
    (await createBookNarrationJob(project.id, epubBook.id, epubScope)).id,
  );

  const markdownSource = await uploadPreparedSource(project.id, fixtures.markdown);
  const markdownBlockIds = selectedPreparedBlockIds(markdownSource);
  const markdownJob = await waitForJob(
    (await createPreparedNarrationJob(project.id, markdownSource.id, markdownBlockIds)).id,
  );

  const websiteFixture = await startWebsiteFixtureServer();
  let websiteSource;
  let websiteJob;
  try {
    websiteSource = await apiJson(`/api/projects/${project.id}/source-preps`, {
      body: JSON.stringify({ kind: "url", url: websiteFixture.url }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    websiteJob = await waitForJob(
      (
        await createPreparedNarrationJob(
          project.id,
          websiteSource.id,
          selectedPreparedBlockIds(websiteSource),
          "url",
        )
      ).id,
    );
  } finally {
    await websiteFixture.stop();
  }

  return {
    docx: { book: docxBook, job: docxJob, scope: docxScope, text: docxText },
    epub: { book: epubBook, job: epubJob, scope: epubScope, text: epubText },
    markdown: { job: markdownJob, source: markdownSource },
    pdf: { book: pdfBook, scope: pdfScope, text: pdfText },
    projectId: project.id,
    website: { job: websiteJob, source: websiteSource },
  };
}

function createScenarios(seed) {
  const workspaceText = workspaceAuditText();
  return [
    {
      description: "PDF Book source before a narration job exists.",
      id: "book-pdf-pre-audio",
      label: "PDF book source, pre-audio",
      open: (page) => openBookPanel(page, seed.pdf.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.pdf.scope,
        bookSourceId: seed.pdf.book.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.pdf.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "DOCX Book Cinema with generated audio ready.",
      id: "book-docx-audio-ready",
      label: "DOCX book source, audio ready",
      open: (page) => openBookCinemaOverlay(page, seed.docx.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.docx.scope,
        bookSourceId: seed.docx.book.id,
        jobId: seed.docx.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.docx.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "EPUB Book Cinema with generated audio ready.",
      id: "book-epub-audio-ready",
      label: "EPUB book source, audio ready",
      open: (page) => openBookCinemaOverlay(page, seed.epub.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.epub.scope,
        bookSourceId: seed.epub.book.id,
        jobId: seed.epub.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.epub.text,
      }),
      surface: "BookCinema",
    },
    {
      description: "Document Cinema for a Markdown source with citations.",
      id: "document-cinema",
      label: "Markdown document source with citations",
      open: (page) => openPreparedCinemaOverlay(page, "Document Cinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.markdown.job.id,
        preparedSourceId: seed.markdown.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.markdown.source.speechText ?? seed.markdown.source.text ?? "",
      }),
      surface: "DocumentCinema",
    },
    {
      description: "Website Cinema for a local website fixture.",
      id: "website-cinema",
      label: "Website source",
      open: (page) => openPreparedCinemaOverlay(page, "Website Cinema"),
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.website.job.id,
        preparedSourceId: seed.website.source.id,
        sourceMode: "fileUrl",
        sourceType: "prepared",
        stage: "intake",
        text: seed.website.source.speechText ?? seed.website.source.text ?? "",
      }),
      surface: "WebsiteCinema",
    },
    {
      description: "Book Cinema read mode with inspector pinned open.",
      id: "pinned-inspector",
      label: "Pinned inspector",
      open: (page) => openPinnedInspector(page, seed.epub.scope),
      storageState: projectStorageState(
        seed.projectId,
        {
          bookScope: seed.epub.scope,
          bookSourceId: seed.epub.book.id,
          jobId: seed.epub.job.id,
          sourceMode: "book",
          stage: "intake",
          text: seed.epub.text,
        },
        {
          "tts-ui-memory": JSON.stringify({
            cinema: { book: { mode: "inspect", pinnedPanelId: "source" } },
            rememberLayout: true,
            rememberPanelPins: true,
          }),
        },
      ),
      surface: "BookCinema",
    },
    {
      description: "Settings drawer opened from the workspace.",
      id: "settings-open",
      label: "Settings open",
      open: openSettings,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Settings",
    },
    {
      description: "Settings drawer opened to UI memory controls.",
      id: "settings-ui-memory",
      label: "Settings UI memory",
      open: openSettingsUiMemory,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "UI Memory",
    },
    {
      description: "Settings drawer opened to the source and speech-policy controls.",
      id: "settings-speech-policy",
      label: "Settings speech policy",
      open: (page) => openSettingsGroup(page, "Sources"),
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Speech Policy",
    },
    {
      description: "Command palette opened from the product bar.",
      id: "command-palette",
      label: "Command palette",
      open: openCommandPalette,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "intake",
        text: workspaceText,
      }),
      surface: "Command Palette",
    },
    {
      description: "Project dashboard opened from the workspace rail.",
      id: "project-dashboard",
      label: "Project dashboard",
      open: openProjectDashboard,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Project Dashboard",
    },
    {
      description: "Voice dashboard opened from the workspace rail.",
      id: "voice-dashboard",
      label: "Voice dashboard",
      open: openVoiceDashboard,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Voice Dashboard",
    },
    {
      description: "Preview mini-player controls after audio creation.",
      id: "preview-mini-player",
      label: "Preview mini-player",
      open: openPreviewMiniPlayer,
      storageState: projectStorageState(seed.projectId, {
        jobId: seed.epub.job.id,
        sourceMode: "text",
        stage: "preview",
        text: workspaceText,
      }),
      surface: "Preview mini-player",
    },
    {
      description: "Mobile/narrow Book Cinema More bottom sheet.",
      id: "mobile-more-sheet",
      label: "Mobile More sheet",
      open: (page) => openMobileMoreSheet(page, seed.epub.scope),
      storageState: projectStorageState(seed.projectId, {
        bookScope: seed.epub.scope,
        bookSourceId: seed.epub.book.id,
        jobId: seed.epub.job.id,
        sourceMode: "book",
        stage: "intake",
        text: seed.epub.text,
      }),
      surface: "Mobile/narrow More sheet",
      viewport: { height: 844, width: 390 },
    },
    workspaceScenario(seed.projectId, "workspace-intake", "Intake", "Intake", workspaceText),
    workspaceScenario(seed.projectId, "workspace-review", "Review", "Review", workspaceText),
    workspaceScenario(seed.projectId, "workspace-preview", "Preview", "Preview", workspaceText),
    {
      description: "Teleprompt stage reached from workspace review.",
      id: "workspace-teleprompt",
      label: "Workspace Teleprompt",
      open: openTeleprompt,
      storageState: projectStorageState(seed.projectId, {
        sourceMode: "text",
        stage: "review",
        text: workspaceText,
      }),
      surface: "Teleprompt",
    },
  ];
}

async function runWorkspaceStageTraversal(browser, seed) {
  console.log("[ui-actions] traversal workspace-stage-parity");
  const context = await browser.newContext({
    storageState: projectStorageState(seed.projectId, {
      bookScope: seed.pdf.scope,
      bookSourceId: seed.pdf.book.id,
      sourceMode: "book",
      stage: "intake",
      text: seed.pdf.text,
    }),
    viewport: { height: 980, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };
  try {
    await gotoApp(page);
    await capture("workspace-stage-00-intake-before");
    await page.getByRole("button", { exact: true, name: "Intake" }).click();
    await page.getByText("Guided Intake").first().waitFor();
    await capture("workspace-stage-01-intake-after");
    await openIntakeDestination(page);
    await page.getByTestId("intake-wizard-open-book-cinema").waitFor();
    await selectBookScope(page, seed.pdf.scope);
    await capture("workspace-stage-02-source-selected");
    await page.getByRole("button", { exact: true, name: "Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await page.getByRole("button", { name: "Full workspace layout" }).click();
    await page.getByTestId("ui-action-project-dashboard-open-rail").click();
    await page.getByText("Project Dashboard").first().waitFor();
    await capture("workspace-stage-03-project-dashboard");
    await page.getByTestId("ui-action-project-dashboard-close").click();
    await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
    await page.getByText("Voice Profile Dashboard").first().waitFor();
    await capture("workspace-stage-03-voice-dashboard");
    await page.getByTestId("ui-action-voice-dashboard-close").click();
    await page.getByTestId("revision-tab-blocks").click();
    await page.getByTestId("revision-select-visible").check();
    await page.getByTestId("ui-action-revision-batch-approve").click();
    await page
      .getByTestId("revision-status-message")
      .getByText(/approved/i)
      .waitFor();
    await page.getByTestId("revision-tab-overview").click();
    await capture("workspace-stage-03-review-after");
    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByText("Policy Notes").first().waitFor();
    await page.getByText("Default voice").first().waitFor();
    await page.getByTestId("global-preview-player").waitFor();
    await page.getByTestId("ui-action-preview-mini-next").click();
    await page.getByTestId("ui-action-preview-mini-previous").click();
    await page.getByTestId("ui-action-preview-mini-skip-silence").click();
    await page.getByTestId("ui-action-preview-mini-run-b").selectOption("draftPreview");
    await page.getByTestId("ui-action-preview-mini-apply-b").click();
    await capture("workspace-stage-04-preview-after");
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page
      .getByText(/Current block|Cue 1/i)
      .first()
      .waitFor();
    await page.getByTestId("ui-action-teleprompt-preset-largeText").click();
    await page.getByTestId("ui-action-teleprompt-mirror").check();
    await page.getByTestId("ui-action-teleprompt-preset-highContrast").click();
    await page.getByText("Default voice").first().waitFor();
    await capture("workspace-stage-05-teleprompt-after");
    await page.getByRole("button", { exact: true, name: "Back to Preview" }).click();
    await page.getByText("Spoken Form").first().waitFor();
    await capture("workspace-stage-06-back-preview-after");

    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/voice-jobs") && response.request().method() === "POST",
    );
    await page.getByTestId("workspace-stage-action-createAndListen").click();
    const response = await createResponse;
    assert(response.ok(), `Create & Listen failed with ${String(response.status())}`);
    const createdJob = await response.json();
    if (createdJob?.id) {
      await waitForJob(createdJob.id);
    }
    await clickPreviewMiniPlayerIfReady(page);
    await capture("workspace-stage-07-create-listen-after");
    await page.getByTestId("workspace-stage-action-openCinema").click();
    await cinemaOverlay(page).waitFor({ state: "visible" });
    await cinemaOverlay(page)
      .getByText(/Book Cinema|Document Cinema|Cinema/i)
      .first()
      .waitFor();

    const screenshot = path.join(screenshotsDir, "workspace-stage-traversal.png");
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
    await assertNoPageIssues(issues);
    return {
      result: {
        accessibleName: "Full stage traversal",
        actionClass: "navigation",
        actionId: "workspace-stage-traversal",
        activationMode: "scripted",
        destructive: false,
        expectedTransition: "full stage traversal",
        label: "Intake → Review → Preview → Teleprompt → Preview → Create & Listen → Cinema",
        outcome: "stage context preserved through full traversal",
        passed: true,
        scenarioId: "workspace-stage-traversal",
        status: "passed",
        surface: "Workspace",
        visibleLabel: "Full stage traversal",
      },
      screenshots,
    };
  } catch (error) {
    const screenshot = path.join(screenshotsDir, "workspace-stage-traversal-failure.png");
    await page.screenshot({ fullPage: true, path: screenshot }).catch(() => {});
    screenshots.push(screenshot);
    throw error;
  } finally {
    await context.close();
  }
}

function workspaceScenario(projectId, id, label, surface, text) {
  return {
    description: `Workspace ${label} stage controls.`,
    id,
    label: `Workspace ${label}`,
    open: (page) => openWorkspaceStage(page, label),
    storageState: projectStorageState(projectId, {
      sourceMode: "text",
      stage: label.toLowerCase(),
      text,
    }),
    surface,
  };
}

async function openWorkspaceStage(page, label) {
  await gotoApp(page);
  const button =
    label === "Preview"
      ? page.getByTestId("workspace-stage-action-previewSpeech")
      : page.getByRole("button", { exact: true, name: label }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
  }
  if (label === "Intake") {
    await page
      .getByText(/Voice Studio|Guided Intake|Narrate a book|Read a document/i)
      .first()
      .waitFor();
  } else if (label === "Review") {
    await page
      .getByText(/Revision Panel|Source Review|Block Review/i)
      .first()
      .waitFor();
  } else {
    await page
      .getByText(/Spoken Form|Create & Listen/i)
      .first()
      .waitFor();
  }
}

async function clickPreviewMiniPlayerIfReady(page) {
  const player = page.getByTestId("global-preview-player");
  await player.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  const segment = page.getByTestId("ui-action-preview-mini-segment");
  if (await segment.isEnabled().catch(() => false)) {
    await segment.click();
  }
  const speed = page.getByTestId("ui-action-preview-mini-speed");
  if (await speed.isEnabled().catch(() => false)) {
    await speed.selectOption("1.25");
  }
  const source = page.getByTestId("ui-action-preview-mini-source");
  if (await source.isEnabled().catch(() => false)) {
    await source.click();
  }
}

async function openSettings(page) {
  await gotoApp(page);
  await page.getByRole("button", { exact: true, name: "Open settings" }).click();
  await page.getByText("Studio Settings").first().waitFor();
}

async function openSettingsGroup(page, groupLabel) {
  await openSettings(page);
  await page.getByRole("button", { name: new RegExp(`^${groupLabel}`) }).click();
  await page.getByText("Speech policy wizard").first().waitFor();
}

async function openSettingsUiMemory(page) {
  await openSettings(page);
  await page
    .getByRole("button", { name: /^Reader/ })
    .first()
    .click();
  await page.getByTestId("ui-memory-preferences").waitFor();
}

async function openCommandPalette(page) {
  await gotoApp(page);
  await page.getByTestId("ui-action-command-palette-open").first().click();
  await page.getByRole("dialog", { name: "Command palette" }).waitFor();
}

async function openProjectDashboard(page) {
  await openWorkspaceStage(page, "Review");
  await page.getByRole("button", { name: "Full workspace layout" }).click();
  await page.getByTestId("ui-action-project-dashboard-open-rail").click();
  await page.getByText("Project Dashboard").first().waitFor();
}

async function openVoiceDashboard(page) {
  await openWorkspaceStage(page, "Review");
  await page.getByRole("button", { name: "Full workspace layout" }).click();
  await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
  await page.getByText("Voice Profile Dashboard").first().waitFor();
}

async function openPreviewMiniPlayer(page) {
  await openWorkspaceStage(page, "Preview");
  await clickPreviewMiniPlayerIfReady(page);
  await page.getByTestId("global-preview-player").waitFor({ state: "visible" });
}

async function openMobileMoreSheet(page, scope) {
  await openBookCinemaOverlay(page, scope);
  const overlay = cinemaOverlay(page);
  await overlay.getByRole("button", { exact: true, name: "More" }).first().click();
  await page
    .locator("[data-cinema-mobile-sheet], [role='dialog']")
    .filter({ hasText: /Focus|Settings|Source|More/i })
    .first()
    .waitFor();
}

async function openTeleprompt(page) {
  await openWorkspaceStage(page, "Preview");
  await page.getByTestId("workspace-stage-action-openTeleprompt").click();
  await page.getByText("Teleprompt Studio").first().waitFor();
}

async function openBookPanel(page, scope) {
  await gotoApp(page);
  await page.getByRole("button", { exact: true, name: "Intake" }).click();
  await openIntakeDestination(page);
  await page.getByTestId("intake-wizard-open-book-cinema").waitFor();
  await selectBookScope(page, scope);
}

async function openBookCinemaOverlay(page, scope) {
  await openBookPanel(page, scope);
  await page.getByTestId("intake-wizard-open-book-cinema").click();
  await cinemaOverlay(page).waitFor({ state: "visible" });
}

async function openPinnedInspector(page, scope) {
  await openBookCinemaOverlay(page, scope);
  const overlay = cinemaOverlay(page);
  await overlay.getByRole("button", { exact: true, name: "Inspect" }).click();
  await clickContextPanelTab(overlay, /Overview|Source/);
  const pin = overlay.getByRole("button", { exact: true, name: "Pin" }).first();
  if (await pin.isVisible().catch(() => false)) {
    await pin.click();
  }
  await overlay.getByRole("button", { exact: true, name: "Read" }).click();
}

async function clickContextPanelTab(overlay, name) {
  const tab = overlay.getByRole("tab", { name }).first();
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await overlay.getByRole("button", { name }).first().click();
}

async function openPreparedCinemaOverlay(page, expectedLabel) {
  await gotoApp(page);
  await page.getByRole("button", { exact: true, name: "Intake" }).click();
  await openIntakeDestination(page);
  await page
    .getByRole("button", { name: new RegExp(`Open ${escapeRegex(expectedLabel)}`) })
    .first()
    .click();
  await cinemaOverlay(page).getByText(expectedLabel).first().waitFor();
}

async function openIntakeDestination(page) {
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
}

async function gotoApp(page) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
}

function cinemaOverlay(page) {
  return page
    .locator(
      '[role="dialog"][aria-labelledby="book-cinema-title"], [role="dialog"][aria-labelledby="prepared-source-cinema-title"]',
    )
    .first();
}

async function selectBookScope(page, scope) {
  const key = scopeKey(scope);
  const select = page.locator(`select:has(option[value="${key}"])`).first();
  await select.waitFor({ state: "visible", timeout: 15_000 });
  await select.selectOption(key);
}

async function ensureFixtures() {
  const manifest = JSON.parse(
    await readFile(path.join(rootDir, "benches", "fixtures.json"), "utf8"),
  );
  const generatedDir = path.join(rootDir, manifest.e2e.generatedDir);
  await mkdir(generatedDir, { recursive: true });
  const markdown = path.join(rootDir, manifest.e2e.markdown);
  const pdf = path.join(rootDir, manifest.e2e.pdf);
  await assertFile(markdown, "Markdown UI action audit fixture");
  await assertFile(pdf, "PDF UI action audit fixture");
  const epub = path.join(generatedDir, "ui-action-audit.epub");
  const docx = path.join(generatedDir, "ui-action-audit.docx");
  await writeSyntheticEPUB(epub);
  await writeSyntheticDOCX(docx);
  return { docx, epub, markdown, pdf };
}

async function writeSyntheticEPUB(filePath) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" /></rootfiles></container>',
  );
  zip.file(
    "EPUB/package.opf",
    '<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Iota EPUB Fixture</dc:title><dc:creator>UI Action Audit</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" /><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="chapter1" /></spine></package>',
  );
  zip.file(
    "EPUB/nav.xhtml",
    '<html><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter One</a></li></ol></nav></body></html>',
  );
  zip.file(
    "EPUB/chapter1.xhtml",
    '<html lang="en"><head><title>Chapter One</title></head><body><h1>Chapter One</h1><p>The UI action audit reads this compact EPUB chapter aloud. It has enough clean prose for transport controls, bookmark controls, and inspector panels.</p><p>The second paragraph keeps the reader stage populated after seeking forward and returning to review.</p></body></html>',
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeSyntheticDOCX(filePath) {
  const zip = new JSZip();
  zip.file(
    "docProps/core.xml",
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Iota DOCX Fixture</dc:title><dc:creator>UI Action Audit</dc:creator></cp:coreProperties>',
  );
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>The UI action audit reads this compact DOCX file aloud. It proves the Word adapter can feed Book Cinema from a generated fixture.</w:t></w:r></w:p><w:p><w:r><w:t>A final paragraph leaves enough words for playback, seeking, and resume controls.</w:t></w:r></w:p></w:body></w:document>',
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function startLocalServices() {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const runtimeDir = path.join(outputDir, "runtime");
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(runtimeDir, { recursive: true });
  const backendLog = path.join(outputDir, "backend.log");
  const frontendLog = path.join(outputDir, "frontend.log");
  const backendEnv = {
    ALIGNMENT_ENABLED: "0",
    BACKEND_PORT: String(backendPort),
    BONSAI_PRELOAD: "0",
    FRONTEND_PORT: String(frontendPort),
    LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE: "0",
    QWEN_ASR_PRELOAD: "0",
    TTS_PROVIDER: "mock",
    VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR: "0",
    VOICE_BOOK_SOURCE_DATA_DIR: path.join(runtimeDir, "book-sources"),
    VOICE_CHECKER_PROVIDER: "mock",
    VOICE_JOB_DATA_DIR: path.join(runtimeDir, "jobs"),
    VOICE_OPTIMIZER_PROVIDER: "rules",
    VOICE_PLAYBACK_SESSION_DATA_DIR: path.join(runtimeDir, "playback-sessions"),
    VOICE_PROFILE_DATA_DIR: path.join(runtimeDir, "voice-profiles"),
    VOICE_PROFILE_SOURCE_DATA_DIR: path.join(runtimeDir, "voice-profile-sources"),
    VOICE_PROGRESS_DATA_DIR: path.join(runtimeDir, "progress"),
    VOICE_PROJECT_DATA_DIR: path.join(runtimeDir, "projects"),
    VOICE_SOURCE_PREP_DATA_DIR: path.join(runtimeDir, "source-preps"),
    VOICE_SOURCE_URL_ALLOW_PRIVATE: "1",
  };
  const frontendEnv = {
    BACKEND_PORT: String(backendPort),
    FRONTEND_PORT: String(frontendPort),
    VITE_API_BASE_URL: `http://127.0.0.1:${String(backendPort)}`,
  };

  const backend = spawnLogged("go", ["run", "./cmd/api"], {
    cwd: path.join(rootDir, "backend"),
    env: backendEnv,
    logPath: backendLog,
  });
  const frontend = spawnLogged(
    "pnpm",
    ["exec", "vite", "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
    {
      cwd: path.join(rootDir, "frontend"),
      env: frontendEnv,
      logPath: frontendLog,
    },
  );

  const service = {
    apiBaseUrl: `http://127.0.0.1:${String(backendPort)}`,
    appBaseUrl: `http://127.0.0.1:${String(frontendPort)}`,
    stop: async () => {
      await Promise.allSettled([stopProcess(frontend), stopProcess(backend)]);
    },
  };
  try {
    await waitForHTTP(`${service.apiBaseUrl}/api/projects`, "backend");
    await waitForHTTP(service.appBaseUrl, "frontend");
  } catch (error) {
    await service.stop();
    throw error;
  }
  return service;
}

function spawnLogged(command, args, { cwd, env, logPath }) {
  const stream = createWriteStream(logPath, { flags: "a" });
  stream.write(`$ ${command} ${args.join(" ")}\n\n`);
  const child = spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => stream.write(chunk));
  child.stderr.on("data", (chunk) => stream.write(chunk));
  child.once("close", (code) => {
    stream.write(`\n[process exited ${String(code)}]\n`);
    stream.end();
  });
  return child;
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    child.kill("SIGTERM");
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }
  await Promise.race([onceClose(child), sleep(5000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function onceClose(child) {
  return new Promise((resolve) => {
    child.once("close", resolve);
  });
}

async function waitForHTTP(url, label) {
  const started = Date.now();
  while (Date.now() - started < 120_000) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Keep polling until the local service is listening.
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${label}: ${url}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") {
          resolve(address.port);
        } else {
          reject(new Error("Unable to allocate a local port."));
        }
      });
    });
  });
}

async function startWebsiteFixtureServer() {
  const html = `<!doctype html>
<html lang="en">
  <head><title>Website Cinema UI Action Fixture</title></head>
  <body>
    <main>
      <h1>Website Cinema UI Action Fixture</h1>
      <p>This local website article gives the action audit a stable source.</p>
      <h2>Readable Section</h2>
      <p>Bookmarks, review panels, generated audio diagnostics, and source provenance should remain discoverable.</p>
      <aside>Navigation, adverts, and boilerplate should be easy to inspect but quiet in read mode.</aside>
    </main>
  </body>
</html>`;
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Unable to start website fixture server.");
  return {
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
    url: `http://127.0.0.1:${String(address.port)}/fixture.html`,
  };
}

async function uploadBook(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes]), path.basename(filePath));
  const book = await apiJson(`/api/projects/${projectId}/book-sources`, {
    body,
    method: "POST",
  });
  assert(book.status === "ready", `${path.basename(filePath)} source is not ready: ${book.status}`);
  return book;
}

async function uploadPreparedSource(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: "text/markdown" }), path.basename(filePath));
  const source = await apiJson(`/api/projects/${projectId}/source-preps`, {
    body,
    method: "POST",
  });
  assert(source.status === "ready", `Prepared source is not ready: ${source.status}`);
  return source;
}

async function createBookNarrationJob(projectId, bookSourceId, bookScope) {
  return apiJson(`/api/book-sources/${bookSourceId}/voice-jobs`, {
    body: JSON.stringify({
      bookScope,
      bookSourceId,
      performanceMode: "throughput",
      pipelineOptions: {
        arrivalPlayback: true,
        asrCheck: false,
        autoRetry: false,
        qualityReport: false,
        textPreprocess: false,
        voiceClone: false,
      },
      projectId,
      runMode: "draftPreview",
      text: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function createPreparedNarrationJob(
  projectId,
  preparedSourceId,
  selectedBlockIds,
  sourceKind = "file",
) {
  return apiJson(`/api/source-preps/${preparedSourceId}/voice-jobs`, {
    body: JSON.stringify({
      performanceMode: "throughput",
      pipelineOptions: {
        arrivalPlayback: true,
        asrCheck: false,
        autoRetry: false,
        qualityReport: false,
        textPreprocess: false,
        voiceClone: false,
      },
      preparedSourceId,
      progressTargetId: `prepared:${preparedSourceId}`,
      projectId,
      runMode: "draftPreview",
      selectedBlockIds,
      sourceKind,
      text: "",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < jobTimeoutMs) {
    const job = await apiJson(`/api/voice-jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for job ${jobId}`);
}

async function scopeText(bookSourceId, scope) {
  const content = await apiJson(`/api/book-sources/${bookSourceId}/scope?${scopeQuery(scope)}`);
  assert(content.text?.trim(), "Selected book scope has no text.");
  return content.text;
}

function selectedPreparedBlockIds(source) {
  const ids = (source.blocks ?? [])
    .filter((block) => block.speakMode !== "skip")
    .slice(0, 3)
    .map((block) => block.id);
  assert(ids.length > 0, "Prepared source has no narratable blocks.");
  return ids;
}

function pickNarrationScope(book) {
  const section =
    book.sections?.find((item) => item.isNarratable && (item.wordCount ?? 0) >= 8) ??
    book.sections?.find((item) => item.isNarratable);
  if (section) {
    return scopeFromSection(section);
  }
  const chapter =
    book.chapters?.find((item) => (item.wordCount ?? wordCount(item.text ?? "")) >= 8) ??
    book.chapters?.[0];
  if (chapter) {
    return {
      chapterIndex: chapter.index,
      label: chapter.title || `Chapter ${String(chapter.index)}`,
      type: "chapter",
    };
  }
  const page = book.pages?.find((item) => (item.wordCount ?? 0) >= 8) ?? book.pages?.[0];
  if (page) {
    return {
      label: `Page ${String(page.index)}`,
      pageEnd: page.index,
      pageStart: page.index,
      type: "pages",
    };
  }
  return { label: "Full book", type: "book" };
}

function scopeFromSection(section) {
  if (section.kind === "pages" || (section.pageStart && section.pageEnd && !section.chapterIndex)) {
    return {
      label: section.title,
      pageEnd: section.pageEnd ?? section.pageStart ?? 1,
      pageStart: section.pageStart ?? 1,
      type: "pages",
    };
  }
  return {
    chapterIndex: section.chapterIndex ?? section.index + 1,
    label: section.title,
    type: "chapter",
  };
}

function projectStorageState(projectId, projectState, extraLocalStorage = {}) {
  return {
    cookies: [],
    origins: [
      {
        localStorage: [
          { name: activeProjectKey, value: projectId },
          {
            name: `tts-project-state:${projectId}`,
            value: JSON.stringify({ ...projectState, updatedAt: new Date().toISOString() }),
          },
          ...Object.entries(extraLocalStorage).map(([name, value]) => ({ name, value })),
        ],
        origin: new URL(appBaseUrl).origin,
      },
    ],
  };
}

async function apiJson(pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.json();
}

async function assertServerReady() {
  await apiJson("/api/projects");
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is required. Run pnpm install before this audit.\n${String(error)}`,
    );
  }
}

async function assertFile(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function scopeQuery(scope) {
  const query = new URLSearchParams();
  query.set("type", scope.type);
  if (scope.chapterIndex !== undefined) {
    query.set("chapterIndex", String(scope.chapterIndex));
  }
  if (scope.pageStart !== undefined) {
    query.set("pageStart", String(scope.pageStart));
  }
  if (scope.pageEnd !== undefined) {
    query.set("pageEnd", String(scope.pageEnd));
  }
  if (scope.label) {
    query.set("label", scope.label);
  }
  return query.toString();
}

function scopeKey(scope) {
  if (!scope) {
    return "book";
  }
  if (scope.type === "chapter") {
    return `chapter:${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    return `pages:${String(scope.pageStart ?? 1)}-${String(scope.pageEnd ?? scope.pageStart ?? 1)}`;
  }
  return "book";
}

function collectPageIssues(page) {
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const location = message.location();
      const locationSuffix =
        location.url && location.lineNumber > 0
          ? ` (${location.url}:${String(location.lineNumber)}:${String(location.columnNumber)})`
          : "";
      const text = `${message.text()}${locationSuffix}`;
      if (/^Failed to load resource:/i.test(text)) {
        return;
      }
      issues.push(`${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    issues.push(`pageerror: ${error.message}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      issues.push(`response ${String(response.status())}: ${response.url()}`);
    }
  });
  return issues;
}

async function assertNoPageIssues(issues) {
  const unexpected = await pageIssuesForReport(issues);
  assert(unexpected.length === 0, `Unexpected browser issues:\n${unexpected.join("\n")}`);
}

async function pageIssuesForReport(issues) {
  return issues.filter(
    (issue) => !/favicon|React DevTools|\/api\/voice-jobs\/[^/]+\/audio$/i.test(issue),
  );
}

function summarizeInventory(actions) {
  return {
    destructive: actions.filter((action) => action.destructive).length,
    disabled: actions.filter((action) => action.disabled).length,
    missingStableTestIds: actions.filter((action) => !action.hasStableTestId).length,
    surfaces: Object.fromEntries(
      [...new Set(actions.map((action) => action.surface))].map((surface) => [
        surface,
        actions.filter((action) => action.surface === surface).length,
      ]),
    ),
    total: actions.length,
  };
}

function summarizeResults(results) {
  return {
    failed: results.filter((result) => result.passed === false).length,
    passed: results.filter((result) => result.passed === true).length,
    skipped: results.filter((result) => result.status === "skipped").length,
    total: results.length,
  };
}

function summarizeGateFindings({ actions, duplicates, results, scenarios }) {
  const requiredSurfaces = [
    "Workspace Intake",
    "Review",
    "Preview",
    "Teleprompt",
    "Book Cinema",
    "Document Cinema",
    "Website Cinema",
    "Settings",
    "UI Memory",
    "Speech Policy",
    "Preview mini-player",
    "Project dashboard",
    "Voice dashboard",
    "Command palette",
    "Mobile/narrow More sheet",
  ];
  const normalizedSurfaces = new Set(
    [
      ...actions.map((action) => normalizeSurface(action.surface)),
      ...scenarios.map((scenario) => normalizeSurface(scenario.surface)),
      ...scenarios.map((scenario) => normalizeSurface(scenario.label)),
    ].filter(Boolean),
  );
  const missingSurfaces = requiredSurfaces.filter(
    (surface) => !normalizedSurfaces.has(normalizeSurface(surface)),
  );
  const metadataFindings = actions.filter((action) => action.metadataIssues.length > 0);
  const failedResults = results.filter((result) => result.passed === false);
  const safeActions = actions.filter((action) => !action.disabled && !action.destructive);
  const resultKey = (result) => `${result.scenarioId}|${result.actionId}|${result.activationMode}`;
  const resultKeys = new Set(results.map(resultKey));
  const missingSafeActivations = safeActions.flatMap((action) =>
    ["pointer", "keyboard"]
      .filter((mode) => !resultKeys.has(`${action.scenarioId}|${action.actionId}|${mode}`))
      .map((mode) => ({ action, mode })),
  );
  const destructiveMissingConfirmation = actions.filter(
    (action) => action.destructive && !action.hasConfirmationAffordance,
  );
  const disabledWithoutReason = actions.filter(
    (action) => action.disabled && !action.disabledReason,
  );
  return {
    disabledWithoutReason,
    duplicates,
    failedResults,
    metadataFindings,
    missingSafeActivations,
    missingSurfaces,
    destructiveMissingConfirmation,
    total:
      failedResults.length +
      metadataFindings.length +
      missingSafeActivations.length +
      missingSurfaces.length +
      destructiveMissingConfirmation.length +
      disabledWithoutReason.length,
  };
}

function renderReviewerSummary({
  actions,
  duplicates,
  generatedAt,
  inventoryOnly,
  outputDir,
  results,
  scenarios,
  screenshots,
}) {
  const resultSummary = summarizeResults(results);
  const inventorySummary = summarizeInventory(actions);
  const findings = summarizeGateFindings({ actions, duplicates, results, scenarios });
  const status =
    !inventoryOnly && findings.total === 0
      ? "Review-complete: exhaustive UI action audit passed."
      : "Not review-complete: UI action audit has findings or did not run activation replay.";
  const lines = [
    "# UI action audit reviewer summary",
    "",
    `Generated: ${generatedAt}`,
    `Output directory: ${outputDir}`,
    "",
    `## Status`,
    "",
    status,
    "",
    "## Artifact checklist",
    "",
    "- action-inventory.json: present",
    "- action-results.json: present",
    "- dead-controls.md: present",
    "- duplicates.md: present",
    "- reviewer-summary.md: present",
    `- screenshots/: ${String(screenshots.length)} captured`,
    "",
    "## Coverage",
    "",
    `- Scenarios: ${String(scenarios.length)}`,
    `- Visible actions inventoried: ${String(inventorySummary.total)}`,
    `- Safe pointer/keyboard activation results: ${String(resultSummary.total)}`,
    `- Passed: ${String(resultSummary.passed)}`,
    `- Skipped destructive focus checks: ${String(resultSummary.skipped)}`,
    `- Failed/no-op/browser findings: ${String(resultSummary.failed)}`,
    `- Disabled controls: ${String(inventorySummary.disabled)}`,
    `- Destructive controls: ${String(inventorySummary.destructive)}`,
    "",
    "## Gate findings",
    "",
    `- Missing required surfaces: ${formatFindingCount(findings.missingSurfaces.length)}`,
    `- Missing safe pointer/keyboard activations: ${formatFindingCount(
      findings.missingSafeActivations.length,
    )}`,
    `- Failed/no-op activations: ${formatFindingCount(findings.failedResults.length)}`,
    `- Metadata findings: ${formatFindingCount(findings.metadataFindings.length)}`,
    `- Disabled without reason: ${formatFindingCount(findings.disabledWithoutReason.length)}`,
    `- Destructive without confirmation: ${formatFindingCount(
      findings.destructiveMissingConfirmation.length,
    )}`,
    `- Duplicate groups requiring review: ${formatFindingCount(duplicates.length)}`,
    "",
    "## Surface counts",
    "",
    ...Object.entries(inventorySummary.surfaces)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([surface, count]) => `- ${surface}: ${String(count)}`),
    "",
  ];
  if (findings.missingSurfaces.length > 0) {
    lines.push(
      "## Missing surfaces",
      "",
      ...findings.missingSurfaces.map((surface) => `- ${surface}`),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

function formatFindingCount(count) {
  return count === 0 ? "0" : `${String(count)} (see reports before leaving draft)`;
}

function normalizeSurface(value) {
  return String(value ?? "")
    .replaceAll(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll(/[\s/-]+/g, " ")
    .trim()
    .toLowerCase();
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function workspaceAuditText() {
  return "Adaptive workspace action-audit text. Review it, preview it, and open teleprompt controls.";
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
