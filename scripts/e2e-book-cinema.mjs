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
  evaluateReaderTimingSummary,
  loadReaderTimingThresholds,
} from "./validate-local/reader-timing.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = process.env.E2E_ARTIFACT_DIR ?? path.join(rootDir, "output", "e2e-book-cinema");
const screenshotsDir = process.env.E2E_SCREENSHOT_DIR ?? path.join(artifactDir, "screenshots");
const summaryPath = process.env.E2E_SUMMARY_PATH ?? path.join(artifactDir, "summary.json");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const lowResourceMode = process.env.E2E_LOW_RESOURCE === "1";
const readerWayfindingOnly = process.env.E2E_READER_WAYFINDING === "1";
const responsiveCinemaOnly = process.env.E2E_RESPONSIVE_CINEMA === "1";
const settingsIAOnly = process.env.E2E_SETTINGS_IA === "1";
const workspaceFlowOnly = process.env.E2E_WORKSPACE_FLOW === "1";
const activeProjectKey = "tts-active-project-id";
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "180000", 10);
const responsiveCinemaViewports = [
  { height: 844, name: "phone", width: 390 },
  { height: 1024, name: "tablet-portrait", width: 768 },
  { height: 768, name: "tablet-landscape", width: 1024 },
  { height: 820, name: "narrow-desktop", width: 1180 },
];
const cinemaOverlaySelector =
  '[role="dialog"][aria-labelledby="book-cinema-title"], [role="dialog"][aria-labelledby="prepared-source-cinema-title"]';

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";
let hasRunBookCinemaMemorySmoke = false;

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await writeSummary({ error: message, status: "failed" }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await mkdir(artifactDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const fixtures = await ensureFixtures();
  const services = useExistingServers ? null : await startLocalServices();
  if (services) {
    apiBaseUrl = services.apiBaseUrl;
    appBaseUrl = services.appBaseUrl;
  }

  const summary = {
    appBaseUrl,
    apiBaseUrl,
    fixtures,
    lowResourceMode,
    performance: [],
    screenshots: [],
    services: services
      ? { backendLog: services.backendLog, frontendLog: services.frontendLog }
      : { mode: "existing" },
    status: "running",
  };

  try {
    await assertServerReady();
    const { chromium } = await loadPlaywright();
    const project = await apiJson("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name: `Book Cinema E2E ${new Date().toISOString()}` }),
      headers: { "Content-Type": "application/json" },
    });
    assert(project.id, "Project creation did not return an id.");
    summary.projectId = project.id;

    if (settingsIAOnly) {
      const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
      try {
        const result = await runSettingsIAUX(browser, project.id);
        summary.screenshots.push(...result.screenshots);
        summary.settingsIA = result;
      } finally {
        await browser.close();
      }
      summary.status = "passed";
      await writeSummary(summary);
      console.log(`Settings IA E2E passed. Summary written to ${summaryPath}`);
      return;
    }

    if (workspaceFlowOnly) {
      const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
      try {
        const result = await runWorkspaceFlowUX(browser, project.id);
        summary.screenshots.push(...result.screenshots);
        summary.workspaceFlow = result;
      } finally {
        await browser.close();
      }
      summary.status = "passed";
      await writeSummary(summary);
      console.log(`Workspace Flow E2E passed. Summary written to ${summaryPath}`);
      return;
    }

    const markdownPrep = await runMarkdownSourcePrepE2E(project.id, fixtures.markdown);
    summary.markdownJobId = markdownPrep.job.id;
    const websitePrep = await runWebsiteSourcePrepE2E(project.id);
    summary.websiteJobId = websitePrep.job.id;

    if (responsiveCinemaOnly) {
      const book = await uploadBook(project.id, fixtures.epub);
      verifyBook(book, "epub");
      const scope = pickNarrationScope(book);
      const scopeContent = await apiJson(`/api/book-sources/${book.id}/scope?${scopeQuery(scope)}`);
      const bookJob = await waitForJob(
        (await createBookNarrationJob(project.id, book.id, scope)).id,
      );
      const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
      try {
        const result = await runResponsiveCinemaUX(browser, {
          book,
          bookJob,
          documentJob: markdownPrep.job,
          documentSource: markdownPrep.source,
          projectId: project.id,
          scope,
          text: scopeContent.text,
          websiteJob: websitePrep.job,
          websiteSource: websitePrep.source,
        });
        summary.responsiveCinema = result;
        summary.screenshots.push(...result.screenshots);
      } finally {
        await browser.close();
      }
      summary.status = "passed";
      await writeSummary(summary);
      console.log(`Responsive Cinema E2E passed. Summary written to ${summaryPath}`);
      return;
    }

    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    try {
      const fixturesUnderTest = [
        { file: fixtures.epub, kind: "epub", screenshot: "book-cinema-epub.png" },
        { file: fixtures.docx, kind: "docx", screenshot: "book-cinema-docx.png" },
        { file: fixtures.pdf, kind: "pdf", screenshot: "book-cinema-pdf.png" },
      ];
      for (const fixture of readerWayfindingOnly
        ? fixturesUnderTest.slice(0, 1)
        : fixturesUnderTest) {
        const result = await runBookSourceE2E(browser, project.id, fixture);
        summary.screenshots.push(result.screenshot);
        summary.performance.push({
          kind: fixture.kind,
          metrics: result.performance,
        });
      }
      const preparedFocus = await runPreparedCinemaFocusUX(browser, {
        documentJob: markdownPrep.job,
        documentSource: markdownPrep.source,
        projectId: project.id,
        websiteJob: websitePrep.job,
        websiteSource: websitePrep.source,
      });
      summary.screenshots.push(...preparedFocus.screenshots);
    } finally {
      await browser.close();
    }

    const readerTimingThresholds = await loadReaderTimingThresholds(rootDir);
    const readerTiming = evaluateReaderTimingSummary(summary, readerTimingThresholds);
    summary.readerTiming = readerTiming;
    const failedTimingThreshold = readerTiming.thresholds.some((threshold) => !threshold.passed);
    summary.status = failedTimingThreshold ? "failed" : "passed";
    await writeSummary(summary);
    if (failedTimingThreshold) {
      console.error(readerTiming.output);
      console.error(
        `Book Cinema E2E failed reader timing budgets. Summary written to ${summaryPath}`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Book Cinema E2E passed. Summary written to ${summaryPath}`);
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runMarkdownSourcePrepE2E(projectId, markdownPath) {
  const source = await uploadPreparedSource(projectId, markdownPath);
  assert(source.status === "ready", `Markdown source prep is not ready: ${source.status}`);
  assert((source.blocks?.length ?? 0) > 0, "Markdown source prep has no blocks.");
  assert(
    !/turn\d+search\d+/i.test(source.speechText ?? ""),
    "Markdown source prep still speaks citation turn ids.",
  );
  const selectedBlockIds = (source.blocks ?? [])
    .filter((block) => block.speakMode !== "skip")
    .slice(0, 3)
    .map((block) => block.id);
  assert(selectedBlockIds.length > 0, "Markdown source prep has no narratable blocks.");
  const job = await createPreparedNarrationJob(projectId, source.id, selectedBlockIds);
  const completedJob = await waitForJob(job.id);
  assert(
    completedJob.preparedSourceId === source.id,
    "Prepared source job did not store preparedSourceId.",
  );
  await assertTimingArtifacts(completedJob.id, "markdown");
  console.log("Markdown import and narration E2E passed.");
  return { job: completedJob, source };
}

async function runWebsiteSourcePrepE2E(projectId) {
  const fixtureServer = await startWebsiteFixtureServer();
  try {
    const source = await apiJson(`/api/projects/${projectId}/source-preps`, {
      body: JSON.stringify({
        kind: "url",
        url: fixtureServer.url,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    assert(source.status === "ready", `Website source prep is not ready: ${source.status}`);
    assert((source.blocks?.length ?? 0) > 0, "Website source prep has no blocks.");
    const selectedBlockIds = (source.blocks ?? [])
      .filter((block) => block.speakMode !== "skip")
      .slice(0, 3)
      .map((block) => block.id);
    const job = await createPreparedNarrationJob(projectId, source.id, selectedBlockIds, "url");
    const completedJob = await waitForJob(job.id);
    assert(
      completedJob.preparedSourceId === source.id,
      "Website source job did not store preparedSourceId.",
    );
    console.log("Website import and narration E2E passed.");
    return { job: completedJob, source };
  } finally {
    await fixtureServer.stop();
  }
}

async function runBookSourceE2E(browser, projectId, fixture) {
  const book = await uploadBook(projectId, fixture.file);
  verifyBook(book, fixture.kind);
  const scope = pickNarrationScope(book);
  const scopeContent = await apiJson(`/api/book-sources/${book.id}/scope?${scopeQuery(scope)}`);
  assert(scopeContent.text.trim().length > 0, `${fixture.kind} selected scope has no text.`);

  const job = await createBookNarrationJob(projectId, book.id, scope);
  const completedJob = await waitForJob(job.id);
  assert(completedJob.bookSourceId === book.id, `${fixture.kind} job did not store bookSourceId.`);
  assert(scopeKey(completedJob.bookScope) === scopeKey(scope), `${fixture.kind} scope mismatch.`);
  await assertTimingArtifacts(completedJob.id, fixture.kind);

  const screenshot = path.join(screenshotsDir, fixture.screenshot);
  const routeSwitchPerformance = await runStudioRouteSwitchUX(browser, projectId);
  const performance = await runBookCinemaUX(browser, {
    book,
    job: completedJob,
    projectId,
    scope,
    screenshot,
    text: scopeContent.text,
  });
  performance.firstOpen = summarizePerformanceMetrics(
    [
      ...routeSwitchPerformance.metrics.filter((metric) => metric.name === "studio-route-switch"),
      ...performance.firstOpen.metrics,
    ],
    performance.firstOpen.degradedStates,
  );
  if (fixture.kind === "epub") {
    performance.forcedDegraded = await runDegradedHighlightUX(browser, {
      book,
      job: completedJob,
      projectId,
      scope,
      text: scopeContent.text,
    });
  }
  console.log(`${fixture.kind.toUpperCase()} Book Cinema E2E passed.`);
  return { performance, screenshot };
}

async function runStudioRouteSwitchUX(browser, projectId) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, { text: "" }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await measureStudioRouteSwitch(page);
    await assertNoPageIssues(issues);
    return summarizePerformanceMetrics(await readPerformanceMetrics(page));
  } finally {
    await context.close();
  }
}

async function runWorkspaceFlowUX(browser, projectId) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      sourceMode: "text",
      stage: "intake",
      text: "Adaptive workspace smoke text. Review it, preview it, and create a short listening run.",
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await setRememberLayout(page, true);
    await page.getByRole("button", { exact: true, name: "Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await page.getByTestId("revision-tab-overview").click();
    await page.getByText("Inline Speech Edit").first().waitFor();
    await page.getByTestId("revision-tab-diagnostics").click();
    await page
      .getByText(/Validation appears after synthesis|Validation was disabled/)
      .first()
      .waitFor();

    for (const layout of ["Focus", "Balanced", "Full"]) {
      await page.getByRole("button", { name: `${layout} workspace layout` }).click();
      const screenshot = path.join(screenshotsDir, `workspace-${layout.toLowerCase()}.png`);
      await page.screenshot({ fullPage: false, path: screenshot });
      screenshots.push(screenshot);
    }
    await page.getByTestId("ui-action-project-dashboard-open-rail").click();
    await page.getByText("Project Dashboard").first().waitFor();
    await page.getByTestId("ui-action-project-dashboard-close").click();
    await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
    await page.getByText("Voice Profile Dashboard").first().waitFor();
    await page.getByTestId("ui-action-voice-dashboard-close").click();
    await runCommandPaletteAction(page, "focus layout", /Focus workspace layout/);
    await assertWorkspaceLayoutSelected(page, "Focus");
    await runCommandPaletteAction(page, "balanced layout", /Balanced workspace layout/);
    await assertWorkspaceLayoutSelected(page, "Balanced");
    await runCommandPaletteAction(page, "full layout", /Full workspace layout/);
    await assertWorkspaceLayoutSelected(page, "Full");
    await runCommandPaletteAction(page, "go review", /Go to Review/);
    await page.getByText("Revision Panel").first().waitFor();

    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByTestId("global-preview-player").waitFor();
    await page.getByTestId("ui-action-preview-mini-next").click();
    await page.getByTestId("ui-action-preview-mini-previous").click();
    await page.getByTestId("ui-action-preview-mini-skip-silence").click();
    await page.getByTestId("ui-action-preview-mini-run-b").selectOption("draftPreview");
    await page.getByTestId("ui-action-preview-mini-apply-b").click();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.getByTestId("ui-action-teleprompt-preset-largeText").click();
    await page.getByTestId("ui-action-teleprompt-mirror").check();
    await page.getByText("Default voice").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Back to Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Back to Preview" }).click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByText("Teleprompt Studio").first().waitFor();
    await assertWorkspaceLayoutSelected(page, "Full");
    await page.getByRole("button", { exact: true, name: "Back to Preview" }).click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await assertReviewPaneSelected(page, "Diagnostics");
    await setRememberLayout(page, true, { reset: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertWorkspaceLayoutSelected(page, "Balanced");
    await page.getByRole("button", { exact: true, name: "Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await assertReviewPaneSelected(page, "Blocks");
    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/voice-jobs") && response.request().method() === "POST",
    );
    await runCommandPaletteAction(page, "create listen", /Create & Listen/);
    const response = await createResponse;
    assert(response.ok(), `Create & Listen failed with ${String(response.status())}`);
    await page.getByTestId("workspace-stage-action-createAndListen").waitFor({ state: "visible" });
    await clickPreviewMiniPlayerIfReady(page);
    await assertNoPageIssues(issues);
    return { screenshots, status: "passed" };
  } catch (error) {
    const failureScreenshot = path.join(screenshotsDir, "workspace-flow-failure.png");
    await page.screenshot({ fullPage: true, path: failureScreenshot }).catch(() => {});
    screenshots.push(failureScreenshot);
    throw error;
  } finally {
    await context.close();
  }
}

async function runSettingsIAUX(browser, projectId) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      sourceMode: "text",
      stage: "intake",
      text: "Settings IA smoke text for lightweight configuration review.",
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await page.getByRole("button", { exact: true, name: "Open settings" }).click();
    await page.getByText("Studio Settings").first().waitFor();
    await page.getByText("Quick settings").first().waitFor();
    const settingsScreenshot = path.join(screenshotsDir, "settings-ia-settings.png");
    await page.screenshot({ fullPage: false, path: settingsScreenshot });
    screenshots.push(settingsScreenshot);
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "project policy", /Project policy/);
    await page.getByText("Project defaults, session overrides").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "machine scope", /Machine scope/);
    await page.getByText("Remember presentation-only workspace").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await page.keyboard.press("Shift+/");
    const shortcutPalette = page.getByRole("dialog", { name: "Command palette" });
    await shortcutPalette.waitFor({ state: "visible" });
    await shortcutPalette.getByText("Shortcut cheat sheet").first().waitFor();
    const shortcutsScreenshot = path.join(screenshotsDir, "settings-ia-shortcuts.png");
    await page.screenshot({ fullPage: false, path: shortcutsScreenshot });
    screenshots.push(shortcutsScreenshot);
    await shortcutPalette
      .getByRole("button", { exact: true, name: "Customize in Settings" })
      .click();
    await page.getByText("Studio Settings").first().waitFor();
    await page.getByText("Keyboard shortcuts").first().waitFor();
    await page.getByTestId("shortcut-setting-settings-open").selectOption("alt-s");
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();
    await page.keyboard.press("Alt+S");
    await page.getByText("Studio Settings").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "open help", /Open help/);
    await page.getByText("Context Guide").first().waitFor();
    await page.getByText("Fast access").first().waitFor();
    await page.getByText("Workflow anchors").first().waitFor();
    const helpScreenshot = path.join(screenshotsDir, "settings-ia-context-guide.png");
    await page.screenshot({ fullPage: false, path: helpScreenshot });
    screenshots.push(helpScreenshot);
    await page.getByRole("button", { exact: true, name: "Close Help" }).click();

    await runCommandPaletteAction(page, "help cinema", /Help: Cinema/);
    await page.getByText("Context Guide").first().waitFor();
    await page.getByRole("dialog", { name: "Help" }).getByText("Cinema").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Help" }).click();

    await page.getByRole("button", { exact: true, name: "Open workspace" }).click();
    await page.getByText("Project library and current chapter context").first().waitFor();
    const workspaceScreenshot = path.join(screenshotsDir, "settings-ia-project-library.png");
    await page.screenshot({ fullPage: false, path: workspaceScreenshot });
    screenshots.push(workspaceScreenshot);

    await assertNoPageIssues(issues);
    return { screenshots, status: "passed" };
  } catch (error) {
    const failureScreenshot = path.join(screenshotsDir, "settings-ia-failure.png");
    await page.screenshot({ fullPage: true, path: failureScreenshot }).catch(() => {});
    screenshots.push(failureScreenshot);
    throw error;
  } finally {
    await context.close();
  }
}

async function setRememberLayout(page, enabled, { reset = false } = {}) {
  await page.getByRole("button", { exact: true, name: "Open settings" }).click();
  await page.getByText("Studio Settings").first().waitFor();
  await page
    .getByRole("button", { name: /^Reader/ })
    .first()
    .click();
  await page.getByLabel("Remember my layout").setChecked(enabled);
  if (reset) {
    await page.getByRole("button", { exact: true, name: "Reset UI memory" }).click();
  }
  await page.getByRole("button", { exact: true, name: "Close Settings" }).click();
}

async function assertWorkspaceLayoutSelected(page, label) {
  const button = page.getByRole("button", { name: `${label} workspace layout` });
  const pressed = await button.getAttribute("aria-pressed");
  const selected = await button.getAttribute("data-selected");
  assert(
    pressed === "true" || selected === "true",
    `${label} workspace layout was not selected after reopen.`,
  );
}

async function assertReviewPaneSelected(page, label) {
  const button = page.getByRole("button", { name: new RegExp(label) }).first();
  const expanded = await button.getAttribute("aria-expanded");
  const pressed = await button.getAttribute("aria-pressed");
  const selected = await button.getAttribute("data-selected");
  assert(
    expanded === "true" || pressed === "true" || selected === "true",
    `${label} review pane was not restored.`,
  );
}

async function runCommandPaletteAction(page, query, optionName) {
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.waitFor({ state: "visible" });
  await page.getByPlaceholder("Search actions, settings, sources, bookmarks...").fill(query);
  const option = palette.getByRole("option", { name: optionName }).first();
  await option.waitFor({ state: "visible" });
  await option.click();
  await palette.waitFor({ state: "hidden" }).catch(() => {});
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

async function runBookCinemaUX(browser, { book, job, projectId, scope, screenshot, text }) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      jobId: job.id,
      sourceMode: "book",
      sourceType: "book",
      stage: "intake",
      text,
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    const runMemorySmoke = !hasRunBookCinemaMemorySmoke;
    if (runMemorySmoke) {
      await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await setRememberLayout(page, true);
    }
    await openBookCinemaOverlay(page, scope);
    if (runMemorySmoke) {
      await exerciseCinemaFocusMemoryPersistence(page, "book", () =>
        openBookCinemaOverlay(page, scope),
      );
      hasRunBookCinemaMemorySmoke = true;
    }
    const firstOpenMetrics = await readPerformanceMetrics(page);
    const playButton = visibleOverlayButton(page, "Play");
    await assertEnabled(playButton, "Play");
    await playButton.click();
    const pauseButton = visibleOverlayButton(page, "Pause");
    await pauseButton.waitFor();
    await page
      .locator(".book-cinema-word-active, .book-cinema-word-phrase")
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await pauseButton.click();
    const skipForwardButton = visibleOverlayButton(page, "+10s");
    if (await skipForwardButton.isEnabled().catch(() => false)) {
      await skipForwardButton.click();
    }
    const playbackSpeedSelect = visibleOverlayControl(page, (overlay) =>
      overlay.getByLabel("Playback speed"),
    );
    await playbackSpeedSelect.selectOption("1.25");
    const playbackSpeed = await playbackSpeedSelect.inputValue();
    assert(playbackSpeed === "1.25", `Playback speed control value = ${playbackSpeed}`);
    const overlay = cinemaOverlay(page);
    await runCommandPaletteAction(page, "review cinema focus", /Review cinema focus/);
    await assertCinemaFocusModeSelected(page, "Review");
    await runCommandPaletteAction(page, "bookmark current", /Bookmark current position/);
    await waitForSavedBookmark(projectId, book.id, scope, job.id);
    await selectCinemaInspectorPanel(page, "History");
    await overlay.getByRole("button", { exact: true, name: "Bookmarks" }).first().click();
    await overlay
      .getByText(/Scope|Word|Saved position/)
      .first()
      .waitFor({ timeout: 15_000 });
    await overlay.getByRole("button", { exact: true, name: "Recent" }).first().click();
    await overlay
      .getByText(/Book|Chapter|Page|Full/)
      .first()
      .waitFor({ timeout: 15_000 });
    await overlay.getByRole("button", { exact: true, name: "Outline" }).first().click();
    await overlay
      .getByRole("button", { name: /Full|Chapter|Page/ })
      .first()
      .click();
    await runCommandPaletteAction(page, "recent", /^Recent:/);
    await captureCinemaFocusModeScreenshots(page, screenshot.replace(/\.png$/i, "-focus"));
    await switchCinemaFocusMode(page, "Review");
    await selectCinemaInspectorPanel(page, "Policy");
    await exerciseSourcePinSmoke(page, book.id);
    await waitForSavedProgress(projectId, book.id, scope, job.id);
    await page.screenshot({ fullPage: false, path: screenshot });
    const firstOpenDegradedStates = await readDegradedStates(page);

    const resumePage = await context.newPage();
    resumePage.setDefaultTimeout(60_000);
    if (lowResourceMode) {
      await applyLowResourceProfile(resumePage);
    }
    const resumeIssues = collectPageIssues(resumePage);
    await openBookCinemaOverlay(resumePage, scope, bookCinemaHashUrl(book.id, scope, job.id));
    await switchCinemaFocusMode(resumePage, "Review");
    await selectCinemaInspectorPanel(resumePage, "Overview");
    const resumeButton = overlayTextButton(resumePage, "Resume");
    await resumeButton.waitFor({ state: "attached" });
    await resumeButton.scrollIntoViewIfNeeded();
    await resumeButton.click();
    const resumedMetrics = await waitForReaderResumeApplied(resumePage);
    assert(
      resumedMetrics.some((metric) => metric.name === "reader-resume"),
      "Resume timing metric was not recorded after playback controls applied.",
    );
    const resumedDegradedStates = await readDegradedStates(resumePage);
    await assertNoPageIssues([...issues, ...resumeIssues]);
    return {
      firstOpen: summarizePerformanceMetrics(firstOpenMetrics, firstOpenDegradedStates),
      resumed: summarizePerformanceMetrics(resumedMetrics, resumedDegradedStates),
    };
  } catch (error) {
    await page
      .screenshot({
        fullPage: false,
        path: screenshot.replace(/\.png$/i, "-failure.png"),
      })
      .catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function runDegradedHighlightUX(browser, { book, job, projectId, scope, text }) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      jobId: job.id,
      sourceMode: "book",
      sourceType: "book",
      stage: "intake",
      text,
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  await page.route(`**/api/voice-jobs/${job.id}/highlight-map`, async (route) => {
    const response = await route.fetch();
    const map = await response.json();
    await route.fulfill({ response, json: forceLowConfidenceHighlightMap(map) });
  });
  try {
    await openBookCinemaOverlay(page, scope);
    await page.getByText("Low confidence").first().waitFor({ timeout: 15_000 });
    await page
      .getByText(/forced low-confidence timing for local UX smoke/)
      .first()
      .waitFor({ timeout: 15_000 });
    const playButton = visibleOverlayButton(page, "Play");
    await assertEnabled(playButton, "Play");
    await playButton.click();
    await page.locator(".book-cinema-word-phrase").first().waitFor({ timeout: 15_000 });
    await page.waitForFunction(
      () =>
        (globalThis.__ttsResearchPerformance?.degradedStates ?? []).some(
          (state) => state.name === "low-confidence-highlight" || state.name === "phrase-fallback",
        ),
      undefined,
      { timeout: 10_000 },
    );
    await assertNoPageIssues(issues);
    return {
      degradedStates: await readDegradedStates(page),
      metrics: await readPerformanceMetrics(page),
    };
  } finally {
    await context.close();
  }
}

async function runPreparedCinemaFocusUX(
  browser,
  { documentJob, documentSource, projectId, websiteJob, websiteSource },
) {
  const screenshots = [];
  screenshots.push(
    ...(await runPreparedCinemaSurfaceFocusUX(browser, {
      expectedLabel: "Document Cinema",
      job: documentJob,
      projectId,
      screenshotPrefix: "document-cinema-focus",
      source: documentSource,
    })),
  );
  screenshots.push(
    ...(await runPreparedCinemaSurfaceFocusUX(browser, {
      expectedLabel: "Website Cinema",
      job: websiteJob,
      projectId,
      screenshotPrefix: "website-cinema-focus",
      source: websiteSource,
    })),
  );
  return { screenshots };
}

async function runResponsiveCinemaUX(
  browser,
  { book, bookJob, documentJob, documentSource, projectId, scope, text, websiteJob, websiteSource },
) {
  await waitForSavedBookmark(projectId, book.id, scope, bookJob.id);
  await waitForPreparedSavedBookmark(projectId, documentSource.id, documentJob.id);
  await waitForPreparedSavedBookmark(projectId, websiteSource.id, websiteJob.id);

  const screenshots = [];
  for (const viewport of responsiveCinemaViewports) {
    screenshots.push(
      ...(await runResponsiveBookCinemaSurface(browser, {
        book,
        job: bookJob,
        projectId,
        scope,
        text,
        viewport,
      })),
    );
    screenshots.push(
      ...(await runResponsivePreparedCinemaSurface(browser, {
        expectedLabel: "Document Cinema",
        job: documentJob,
        projectId,
        source: documentSource,
        surface: "document",
        viewport,
      })),
    );
    screenshots.push(
      ...(await runResponsivePreparedCinemaSurface(browser, {
        expectedLabel: "Website Cinema",
        job: websiteJob,
        projectId,
        source: websiteSource,
        surface: "website",
        viewport,
      })),
    );
  }

  return {
    screenshots,
    status: "passed",
    viewports: responsiveCinemaViewports,
  };
}

async function runResponsiveBookCinemaSurface(
  browser,
  { book, job, projectId, scope, text, viewport },
) {
  const context = await browser.newContext({
    hasTouch: viewport.width < 1024,
    isMobile: viewport.width < 1024,
    storageState: projectStorageState(projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      jobId: job.id,
      sourceMode: "book",
      sourceType: "book",
      stage: "intake",
      text,
    }),
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const surface = "book";
  const screenshots = [];
  try {
    await openBookCinemaOverlay(page, scope);
    screenshots.push(
      await captureResponsiveCinemaSurface(page, {
        surface,
        viewport,
      }),
    );
    if (viewport.width < 1024) {
      screenshots.push(
        await exerciseResponsiveCinemaMobileSheet(page, {
          surface,
          viewport,
        }),
      );
    }
    await assertNoPageIssues(issues);
    return screenshots;
  } finally {
    await context.close();
  }
}

async function runResponsivePreparedCinemaSurface(
  browser,
  { expectedLabel, job, projectId, source, surface, viewport },
) {
  const context = await browser.newContext({
    hasTouch: viewport.width < 1024,
    isMobile: viewport.width < 1024,
    storageState: projectStorageState(projectId, {
      jobId: job.id,
      preparedSourceId: source.id,
      sourceMode: "fileUrl",
      sourceType: "prepared",
      stage: "intake",
      text: source.speechText ?? source.text ?? "",
    }),
    viewport: { height: viewport.height, width: viewport.width },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  try {
    await openPreparedCinemaOverlay(page, expectedLabel);
    screenshots.push(
      await captureResponsiveCinemaSurface(page, {
        surface,
        viewport,
      }),
    );
    if (viewport.width < 1024) {
      screenshots.push(
        await exerciseResponsiveCinemaMobileSheet(page, {
          surface,
          viewport,
        }),
      );
    }
    await assertNoPageIssues(issues);
    return screenshots;
  } finally {
    await context.close();
  }
}

async function openPreparedCinemaOverlay(page, expectedLabel) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { exact: true, name: "Intake" }).click();
  await openIntakeDestination(page);
  await page
    .getByRole("button", { name: new RegExp(`Open ${expectedLabel}`) })
    .first()
    .click();
  await cinemaOverlay(page).getByText(expectedLabel).first().waitFor();
}

async function captureResponsiveCinemaSurface(page, { surface, viewport }) {
  await assertCinemaFocusModeSelected(page, "Read");
  await assertCinemaResponsiveContract(page, `${surface}:${viewport.name}`);
  const screenshot = path.join(screenshotsDir, `responsive-${surface}-${viewport.name}.png`);
  await page.screenshot({ fullPage: false, path: screenshot });
  return screenshot;
}

async function exerciseResponsiveCinemaMobileSheet(page, { surface, viewport }) {
  await assertCinemaFocusModeSelected(page, "Read");
  const moreButton = visibleOverlayButton(page, "More");
  await assertEnabled(moreButton, "More");
  await moreButton.click();
  const overlay = cinemaOverlay(page);
  const sheet = overlay.locator("[data-cinema-mobile-sheet]").first();
  await sheet.waitFor({ state: "visible" });
  await sheet.locator("[data-cinema-mobile-display-controls]").getByText("Text scale").waitFor();
  await assertCinemaMobileSheetInFlow(page);
  await assertCinemaResponsiveContract(page, `${surface}:${viewport.name}:sheet`);
  await sheet.getByRole("button", { exact: true, name: "Structure" }).click();
  await sheet.getByRole("button", { exact: true, name: "Bookmarks" }).click();
  await sheet
    .getByText(/No bookmarks saved|Saved position|Scope|Word|0:04/)
    .first()
    .waitFor();
  const screenshot = path.join(screenshotsDir, `responsive-${surface}-${viewport.name}-sheet.png`);
  await page.screenshot({ fullPage: false, path: screenshot });
  await sheet.getByRole("button", { exact: true, name: "Outline" }).click();
  const outlineButtons = sheet.locator('[data-reader-wayfinding-list="outline"] button');
  if ((await outlineButtons.count()) > 0) {
    await outlineButtons.first().click();
  } else {
    await sheet.getByRole("button", { exact: true, name: "Recent" }).click();
    await sheet.locator('[data-reader-wayfinding-list="recent"] button').first().click();
  }
  await sheet.waitFor({ state: "hidden" });
  await page.waitForFunction(
    () => document.activeElement?.hasAttribute("data-cinema-reader-canvas") === true,
    undefined,
    { timeout: 5_000 },
  );
  await assertCinemaFocusModeSelected(page, "Read");
  return screenshot;
}

async function assertCinemaResponsiveContract(page, label) {
  await assertCinemaActiveTargetVisible(page);
  await assertNoHorizontalOverflow(page, label);
  await assertCinemaTouchTargets(page, label);
}

async function assertCinemaMobileSheetInFlow(page) {
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    const sheet = overlay?.querySelector("[data-cinema-mobile-sheet]");
    const footer = overlay?.querySelector("[data-cinema-transport-footer]");
    if (!(sheet instanceof HTMLElement) || !(footer instanceof HTMLElement)) {
      return { ok: false, reason: "missing sheet or footer" };
    }
    const sheetRect = sheet.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    return {
      footerTop: footerRect.top,
      ok: getComputedStyle(sheet).position !== "fixed" && sheetRect.bottom <= footerRect.top + 1,
      position: getComputedStyle(sheet).position,
      sheetBottom: sheetRect.bottom,
    };
  }, cinemaOverlaySelector);
  assert(
    result.ok,
    `Mobile Cinema sheet should stay in flow above footer: ${JSON.stringify(result)}`,
  );
}

async function assertNoHorizontalOverflow(page, label) {
  const issues = await page.evaluate((selector) => {
    const elements = [
      document.documentElement,
      document.body,
      document.querySelector(selector),
      ...document.querySelectorAll(`${selector} main, ${selector} [data-cinema-mobile-sheet]`),
    ].filter((element) => element instanceof HTMLElement);
    return elements.flatMap((element) => {
      const overflow = element.scrollWidth - element.clientWidth;
      if (overflow <= 1) {
        return [];
      }
      return [
        {
          className: element.className,
          clientWidth: element.clientWidth,
          overflow,
          scrollWidth: element.scrollWidth,
          tagName: element.tagName,
        },
      ];
    });
  }, cinemaOverlaySelector);
  assert(issues.length === 0, `${label} has horizontal overflow: ${JSON.stringify(issues)}`);
}

async function assertCinemaTouchTargets(page, label) {
  const issues = await page.evaluate((selector) => {
    const minimum = 44;
    return [...document.querySelectorAll(`${selector} .cinema-touch-target`)].flatMap((element) => {
      if (!(element instanceof HTMLElement)) {
        return [];
      }
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        styles.display === "none" ||
        styles.visibility === "hidden"
      ) {
        return [];
      }
      if (rect.width >= minimum && rect.height >= minimum) {
        return [];
      }
      return [
        {
          height: Math.round(rect.height),
          label:
            element.getAttribute("aria-label") ??
            element.textContent?.replace(/\s+/g, " ").trim() ??
            element.tagName,
          tagName: element.tagName,
          width: Math.round(rect.width),
        },
      ];
    });
  }, cinemaOverlaySelector);
  assert(issues.length === 0, `${label} has undersized touch targets: ${JSON.stringify(issues)}`);
}

async function runPreparedCinemaSurfaceFocusUX(
  browser,
  { expectedLabel, job, projectId, screenshotPrefix, source },
) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      jobId: job.id,
      preparedSourceId: source.id,
      sourceMode: "fileUrl",
      sourceType: "prepared",
      stage: "intake",
      text: source.speechText ?? source.text ?? "",
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await setRememberLayout(page, true);
    await page.getByRole("button", { exact: true, name: "Intake" }).click();
    await openIntakeDestination(page);
    await page
      .getByRole("button", { name: new RegExp(`Open ${expectedLabel}`) })
      .first()
      .click();
    const overlay = cinemaOverlay(page);
    await overlay.getByText(expectedLabel).first().waitFor();
    const screenshots = await captureCinemaFocusModeScreenshots(
      page,
      path.join(screenshotsDir, screenshotPrefix),
    );
    const surfaceKind = expectedLabel === "Website Cinema" ? "website" : "document";
    await exerciseCinemaFocusMemoryPersistence(page, surfaceKind, async () => {
      await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.getByRole("button", { exact: true, name: "Intake" }).click();
      await openIntakeDestination(page);
      await page
        .getByRole("button", { name: new RegExp(`Open ${expectedLabel}`) })
        .first()
        .click();
      await cinemaOverlay(page).getByText(expectedLabel).first().waitFor();
    });
    await assertNoPageIssues(issues);
    return screenshots;
  } finally {
    await context.close();
  }
}

async function captureCinemaFocusModeScreenshots(page, screenshotPrefix) {
  const screenshots = [];
  for (const mode of ["Read", "Inspect", "Review", "Debug"]) {
    await switchCinemaFocusMode(page, mode);
    await assertCinemaFocusModeLayout(page, mode);
    await assertCinemaActiveTargetVisible(page);
    const screenshot = `${screenshotPrefix}-${mode.toLowerCase()}.png`;
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  }
  await openCinemaAdvancedMenu(page);
  const advancedScreenshot = `${screenshotPrefix}-advanced.png`;
  await page.screenshot({ fullPage: false, path: advancedScreenshot });
  screenshots.push(advancedScreenshot);
  await visibleOverlayButton(page, "More").click();

  await switchCinemaFocusMode(page, "Inspect");
  await selectCinemaInspectorPanel(page, "Overview");
  await visibleOverlayButton(page, "Pin").click();
  await switchCinemaFocusMode(page, "Read");
  await assertCinemaFocusModeLayout(page, "Read", { pinned: true });
  const pinnedScreenshot = `${screenshotPrefix}-read-pinned.png`;
  await page.screenshot({ fullPage: false, path: pinnedScreenshot });
  screenshots.push(pinnedScreenshot);
  await visibleOverlayButton(page, "Pinned").click();
  await switchCinemaFocusMode(page, "Read");
  return screenshots;
}

async function exerciseCinemaFocusMemoryPersistence(page, surfaceKind, reopenOverlay) {
  await switchCinemaFocusMode(page, "Review");
  await selectCinemaInspectorPanel(page, "Policy");
  await visibleOverlayButton(page, "Pin").click();
  await assertCinemaFocusModeSelected(page, "Review");
  await waitForRememberedCinemaFocusState(page, surfaceKind, "review", "policy");
  await visibleOverlayButton(page, "Exit").click();
  await waitForRememberedCinemaFocusState(page, surfaceKind, "review", "policy");

  await reopenOverlay();
  await assertCinemaFocusModeSelected(page, "Review");
  await assertCinemaFocusModeLayout(page, "Review", { pinned: true });
  await cinemaOverlay(page).locator('[data-cinema-inspector-panel="policy"]').waitFor();
  await visibleOverlayButton(page, "Exit").click();

  await setRememberLayout(page, true, { reset: true });
  await waitForRememberedCinemaFocusState(page, surfaceKind, "read", null);
  await reopenOverlay();
  await assertCinemaFocusModeSelected(page, "Read");
  await assertCinemaFocusModeLayout(page, "Read");
}

async function waitForRememberedCinemaFocusState(page, surfaceKind, mode, pinnedPanelId) {
  await page.waitForFunction(
    ({ expectedMode, expectedPinnedPanelId, expectedSurfaceKind }) => {
      const raw = localStorage.getItem("tts-ui-memory");
      if (!raw) {
        return false;
      }
      const memory = JSON.parse(raw);
      const surface = memory?.cinema?.[expectedSurfaceKind];
      return (
        memory?.rememberLayout === true &&
        surface?.mode === expectedMode &&
        (surface?.pinnedPanelId ?? null) === expectedPinnedPanelId
      );
    },
    {
      expectedMode: mode,
      expectedPinnedPanelId: pinnedPanelId,
      expectedSurfaceKind: surfaceKind,
    },
    { timeout: 10_000 },
  );
}

async function assertCinemaFocusModeLayout(page, mode, { pinned = false } = {}) {
  const overlay = cinemaOverlay(page);
  const inspectorPanels = overlay.locator("[data-cinema-inspector-panel]");
  const inspectorBodies = overlay.locator("[data-cinema-inspector-body]");
  const panelCount = await inspectorPanels.count();
  const bodyCount = await inspectorBodies.count();
  const shouldShowInspector = mode !== "Read" || pinned;
  if (shouldShowInspector) {
    assert(panelCount === 1, `${mode} mode should show one inspector panel, saw ${panelCount}.`);
    assert(bodyCount === 1, `${mode} mode should show one inspector body, saw ${bodyCount}.`);
    return;
  }
  assert(panelCount === 0, "Read mode should hide inspector panels unless pinned.");
  assert(bodyCount === 0, "Read mode should hide inspector bodies unless pinned.");
  await assertCinemaCanvasDominant(page);
}

async function assertCinemaFocusModeSelected(page, mode) {
  const overlay = cinemaOverlay(page);
  const pressed = await overlay
    .getByRole("button", { exact: true, includeHidden: true, name: mode })
    .getAttribute("aria-pressed");
  if (pressed === "true") {
    return;
  }
  const diagnostics = await page.evaluate(
    (selector) => ({
      buttons: [...document.querySelectorAll(`${selector} button`)].map((button) => ({
        ariaPressed: button.getAttribute("aria-pressed"),
        text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
      })),
      memory: localStorage.getItem("tts-ui-memory"),
    }),
    cinemaOverlaySelector,
  );
  assert(
    false,
    `${mode} focus mode was not restored. Toolbar/memory state: ${JSON.stringify(diagnostics)}`,
  );
}

async function assertCinemaCanvasDominant(page) {
  await page.waitForFunction(
    () => {
      const overlay = document.querySelector('[data-cinema-canvas-first="true"]');
      const main = overlay?.querySelector("main");
      const canvas = main?.firstElementChild;
      if (!(main instanceof HTMLElement) || !(canvas instanceof HTMLElement)) {
        return false;
      }
      const mainRect = main.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      return mainRect.width > 0 && canvasRect.width / mainRect.width > 0.9;
    },
    undefined,
    { timeout: 5_000 },
  );
}

async function assertCinemaActiveTargetVisible(page) {
  await page.waitForFunction(
    (selector) => {
      const overlay = document.querySelector(selector);
      if (!overlay) {
        return false;
      }
      const target = overlay.querySelector(
        [
          ".book-cinema-page-shell--active",
          ".book-cinema-word-active",
          ".book-cinema-word-phrase",
          ".prepared-source-cinema-active",
          ".markdown-cinema-block-active",
          ".markdown-cinema-word-active",
          ".website-cinema-word-active",
        ].join(", "),
      );
      if (!(target instanceof HTMLElement)) {
        return true;
      }
      const rect = target.getBoundingClientRect();
      return (
        rect.bottom > 0 &&
        rect.right > 0 &&
        rect.top < window.innerHeight &&
        rect.left < window.innerWidth
      );
    },
    cinemaOverlaySelector,
    { timeout: 5_000 },
  );
}

async function switchCinemaFocusMode(page, mode) {
  if (mode === "Debug") {
    await openCinemaAdvancedMenu(page);
    await cinemaOverlay(page).getByRole("menuitemradio", { exact: true, name: "Debug" }).click();
    return;
  }
  await page
    .locator(cinemaOverlaySelector)
    .first()
    .getByRole("button", { exact: true, name: mode })
    .click();
}

async function openCinemaAdvancedMenu(page) {
  await visibleOverlayButton(page, "More").click();
  await cinemaOverlay(page).getByRole("menuitemradio", { exact: true, name: "Debug" }).waitFor();
}

async function selectCinemaInspectorPanel(page, label) {
  const overlay = page.locator(cinemaOverlaySelector).first();
  const name = new RegExp(label);
  const tab = overlay.getByRole("tab", { name }).first();
  if ((await tab.count()) > 0) {
    await tab.click();
    return;
  }
  await overlay.getByRole("button", { name }).first().click();
}

async function exerciseSourcePinSmoke(page, bookSourceId) {
  const pinEndpoint = `/api/book-sources/${encodeURIComponent(bookSourceId)}/speech-policy`;
  const savePinButton = visibleOverlayButton(page, "Save pin");
  await assertEnabled(savePinButton, "Save pin");
  const saveResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes(pinEndpoint),
  );
  await savePinButton.click();
  const saved = await saveResponse;
  assert(saved.ok(), `Source policy save failed with ${String(saved.status())}`);
  await cinemaOverlay(page).getByText("Pinned").first().waitFor();

  const clearPinButton = visibleOverlayButton(page, "Clear pin");
  await assertEnabled(clearPinButton, "Clear pin");
  const clearResponse = page.waitForResponse(
    (response) => response.request().method() === "PATCH" && response.url().includes(pinEndpoint),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await clearPinButton.click();
  const cleared = await clearResponse;
  assert(cleared.ok(), `Source policy clear failed with ${String(cleared.status())}`);
  await cinemaOverlay(page).getByText("Project default").first().waitFor();
}

function visibleOverlayButton(page, label) {
  return visibleOverlayControl(page, (overlay) =>
    overlay.getByRole("button", { name: new RegExp(`^${escapeRegex(label)}$`) }),
  );
}

function cinemaOverlay(page) {
  return page.locator(cinemaOverlaySelector).first();
}

function visibleOverlayControl(page, locatorFactory) {
  const overlay = cinemaOverlay(page);
  return locatorFactory(overlay).filter({ visible: true }).first();
}

function overlayTextButton(page, label) {
  return cinemaOverlay(page).locator("button").filter({ hasText: label }).first();
}

async function applyLowResourceProfile(page) {
  try {
    const client = await page.context().newCDPSession(page);
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  } catch {
    // Browser-level throttling is best-effort; the mock-only flow remains authoritative.
  }
}

async function openBookCinemaOverlay(page, scope, url = appBaseUrl) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (url !== appBaseUrl) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  const existingOverlay = page
    .locator('[role="dialog"][aria-labelledby="book-cinema-title"]')
    .first();
  const restoredOverlayTimeout = url === appBaseUrl ? 1_000 : 30_000;
  const restoredOverlayVisible = await existingOverlay
    .waitFor({ state: "visible", timeout: restoredOverlayTimeout })
    .then(() => true)
    .catch(() => false);
  if (restoredOverlayVisible) {
    await waitForOverlayScope(page, scope);
    return;
  }
  await page.getByRole("button", { exact: true, name: "Intake" }).click();
  await openIntakeDestination(page);
  await page.getByTestId("intake-wizard-open-book-cinema").waitFor();
  await selectBookScope(page, scope);
  await page.getByTestId("intake-wizard-open-book-cinema").click();
  const overlay = page.locator('[role="dialog"][aria-labelledby="book-cinema-title"]').first();
  await overlay.waitFor({ state: "visible" });
  await waitForOverlayScope(page, scope);
}

async function openIntakeDestination(page) {
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
}

async function selectBookScope(page, scope) {
  const key = scopeKey(scope);
  const select = page.locator(`select:has(option[value="${key}"])`).first();
  await select.waitFor({ state: "visible", timeout: 15_000 });
  await select.selectOption(key);
  await page.waitForFunction(
    (expectedKey) =>
      [...document.querySelectorAll("select")].some((item) => item.value === expectedKey),
    key,
    { timeout: 10_000 },
  );
}

async function measureStudioRouteSwitch(page) {
  await page
    .getByRole("button", { exact: true, name: "Intake" })
    .waitFor({ state: "visible", timeout: 15_000 })
    .catch(() => {});
  const voiceCloningButton = page
    .getByRole("button", { exact: true, name: "Voice Cloning" })
    .filter({ visible: true })
    .first();
  const narrationButton = page
    .getByRole("button", { exact: true, name: "Narration" })
    .filter({ visible: true })
    .first();
  await voiceCloningButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await narrationButton.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  if (
    !(await voiceCloningButton.isVisible().catch(() => false)) ||
    !(await narrationButton.isVisible().catch(() => false))
  ) {
    const visibleButtons = await page
      .locator("button:visible")
      .evaluateAll((buttons) => buttons.map((button) => button.textContent?.trim() ?? ""))
      .catch(() => []);
    throw new Error(
      `Studio route switch controls are not visible: ${JSON.stringify(visibleButtons)}`,
    );
  }
  const firstCount = await performanceMetricCount(page, "studio-route-switch");
  await voiceCloningButton.click();
  await waitForPerformanceMetricCount(page, "studio-route-switch", firstCount + 1);
  const secondCount = await performanceMetricCount(page, "studio-route-switch");
  await narrationButton.click();
  await waitForPerformanceMetricCount(page, "studio-route-switch", secondCount + 1);
}

async function waitForOverlayScope(page, scope) {
  const expected = {
    expectedLabel: scope.label?.trim() || null,
    expectedScopeKey: scopeKey(scope),
  };
  try {
    await page.waitForFunction(
      ({ expectedLabel, expectedScopeKey, selector }) =>
        [...document.querySelectorAll(`${selector} select`)].some(
          (select) => select.value === expectedScopeKey,
        ) &&
        (document.body.textContent?.includes("Book Cinema") ?? false) &&
        (!expectedLabel || (document.body.textContent?.includes(expectedLabel) ?? false)),
      { ...expected, selector: '[role="dialog"][aria-labelledby="book-cinema-title"]' },
      { timeout: 60_000 },
    );
  } catch (error) {
    const overlayState = await page
      .evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)].map((overlay) => ({
            headings: [...overlay.querySelectorAll("h1")].map((heading) => heading.textContent),
            selects: [...overlay.querySelectorAll("select")].map((select) => ({
              options: [...select.options].map((option) => ({
                selected: option.selected,
                text: option.textContent,
                value: option.value,
              })),
              value: select.value,
            })),
          })),
        '[role="dialog"][aria-labelledby="book-cinema-title"]',
      )
      .catch(() => []);
    throw new Error(
      `Timed out waiting for Book Cinema scope ${JSON.stringify({ ...expected, overlayState })}`,
      { cause: error },
    );
  }
}

function bookCinemaHashUrl(bookSourceId, scope, jobId = null) {
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", bookSourceId);
  params.set("scope", scopeKey(scope));
  params.set("word", "4");
  const url = new URL(appBaseUrl);
  if (jobId) {
    url.searchParams.set("jobId", jobId);
  }
  url.hash = params.toString();
  return url.toString();
}

async function ensureFixtures() {
  const manifest = JSON.parse(
    await readFile(path.join(rootDir, "benches", "fixtures.json"), "utf8"),
  );
  const generatedDir = path.join(rootDir, manifest.e2e.generatedDir);
  await mkdir(generatedDir, { recursive: true });
  const markdown = path.join(rootDir, manifest.e2e.markdown);
  const pdf = path.join(rootDir, manifest.e2e.pdf);
  await assertFile(markdown, "Markdown E2E fixture");
  await assertFile(pdf, "PDF E2E fixture");
  const epub = path.join(generatedDir, "book-cinema-smoke.epub");
  const docx = path.join(generatedDir, "book-cinema-smoke.docx");
  await writeSyntheticEPUB(epub);
  await writeSyntheticDOCX(docx);
  return { docx, epub, markdown, pdf };
}

async function writeSyntheticEPUB(filePath) {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" /></rootfiles></container>`,
  );
  zip.file(
    "EPUB/package.opf",
    `<package version="3.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Kappa EPUB Fixture</dc:title><dc:creator>Validation Runner</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" /><item id="chapter1" href="chapter1.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="chapter1" /></spine></package>`,
  );
  zip.file(
    "EPUB/nav.xhtml",
    `<html><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">Chapter One</a></li></ol></nav></body></html>`,
  );
  zip.file(
    "EPUB/chapter1.xhtml",
    `<html lang="en"><head><title>Chapter One</title></head><body><h1>Chapter One</h1><p>The local validation ritual reads this compact EPUB chapter aloud. It has enough clean prose for a short mock narration and resume check.</p><p>The second paragraph keeps the reader stage populated after seeking forward.</p></body></html>`,
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function writeSyntheticDOCX(filePath) {
  const zip = new JSZip();
  zip.file(
    "docProps/core.xml",
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Kappa DOCX Fixture</dc:title><dc:creator>Validation Runner</dc:creator></cp:coreProperties>`,
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter One</w:t></w:r></w:p><w:p><w:r><w:t>The local validation ritual reads this compact DOCX file aloud. It proves the Word adapter can feed Book Cinema from a clean generated fixture.</w:t></w:r></w:p><w:p><w:r><w:t>A final paragraph leaves enough words for playback, seeking, and resume controls.</w:t></w:r></w:p></w:body></w:document>`,
  );
  await writeFile(filePath, await zip.generateAsync({ type: "nodebuffer" }));
}

async function startLocalServices() {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const runtimeDir = path.join(artifactDir, "runtime");
  if (process.env.E2E_PRESERVE_RUNTIME !== "1") {
    await rm(runtimeDir, { recursive: true, force: true });
  }
  await mkdir(runtimeDir, { recursive: true });
  const backendLog = path.join(artifactDir, "backend.log");
  const frontendLog = path.join(artifactDir, "frontend.log");
  const backendEnv = {
    ALIGNMENT_ENABLED: "0",
    BACKEND_PORT: String(backendPort),
    BONSAI_PRELOAD: "0",
    FRONTEND_PORT: String(frontendPort),
    LOCAL_FALLBACK_ON_BOOTSTRAP_FAILURE: "0",
    QWEN_ASR_PRELOAD: "0",
    TTS_PROVIDER: "mock",
    VOICE_BOOK_PDF_REQUIRE_TEXT_EXTRACTOR: "0",
    VOICE_CHECKER_PROVIDER: "mock",
    VOICE_JOB_DATA_DIR: path.join(runtimeDir, "jobs"),
    VOICE_OPTIMIZER_PROVIDER: "rules",
    VOICE_PROFILE_DATA_DIR: path.join(runtimeDir, "voice-profiles"),
    VOICE_PROFILE_SOURCE_DATA_DIR: path.join(runtimeDir, "voice-profile-sources"),
    VOICE_PROJECT_DATA_DIR: path.join(runtimeDir, "projects"),
    VOICE_BOOK_SOURCE_DATA_DIR: path.join(runtimeDir, "book-sources"),
    VOICE_SOURCE_PREP_DATA_DIR: path.join(runtimeDir, "source-preps"),
    VOICE_PROGRESS_DATA_DIR: path.join(runtimeDir, "progress"),
    VOICE_PLAYBACK_SESSION_DATA_DIR: path.join(runtimeDir, "playback-sessions"),
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
    backendLog,
    frontendLog,
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
      // Keep polling until the service is listening.
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
  <head><title>Website Cinema Focus Fixture</title></head>
  <body>
    <main>
      <h1>Website Cinema Focus Fixture</h1>
      <p>This local website article gives the cinema focus-mode smoke test a stable source.</p>
      <h2>Readable Section</h2>
      <p>Bookmarks, review panels, generated audio diagnostics, and source provenance should remain discoverable without competing with the reading canvas.</p>
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
    url: `http://127.0.0.1:${String(address.port)}/fixture.html`,
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
  };
}

async function uploadBook(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes]), path.basename(filePath));
  return apiJson(`/api/projects/${projectId}/book-sources`, {
    body,
    method: "POST",
  });
}

async function uploadPreparedSource(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: "text/markdown" }), path.basename(filePath));
  return apiJson(`/api/projects/${projectId}/source-preps`, {
    body,
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

async function waitForSavedProgress(projectId, bookSourceId, bookScope, jobId) {
  const targetId = `book:${bookSourceId}:${scopeKey(bookScope)}`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 15_000) {
    const progressItems = await apiJson(`/api/projects/${projectId}/progress`);
    const progress = progressItems.find((item) => item.targetId === targetId);
    if (progress && progress.currentTimeSec > 0) {
      return progress;
    }
    await sleep(500);
  }
  return apiJson(`/api/progress/${targetId}`, {
    body: JSON.stringify({
      activeWordIndex: 4,
      bookScope,
      bookSourceId,
      currentTimeSec: 4,
      durationSec: 20,
      jobId,
      projectId,
      progress: 0.2,
      readingPosition: {
        activeWordIndex: 4,
        bookSourceId,
        scopeKey: scopeKey(bookScope),
      },
      targetId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

async function waitForSavedBookmark(projectId, bookSourceId, bookScope, jobId) {
  const progress = await waitForSavedProgress(projectId, bookSourceId, bookScope, jobId);
  if ((progress.bookmarks ?? []).length > 0) {
    return progress;
  }
  const targetId = `book:${bookSourceId}:${scopeKey(bookScope)}`;
  return apiJson(`/api/progress/${targetId}`, {
    body: JSON.stringify({
      activeWordIndex: 4,
      addBookmark: {
        activeWordIndex: 4,
        createdAt: new Date().toISOString(),
        currentTimeSec: 4,
        id: `bookmark-${Date.now().toString(36)}`,
        label: "0:04",
        readingPosition: {
          activeWordIndex: 4,
          bookSourceId,
          scopeKey: scopeKey(bookScope),
        },
      },
      bookScope,
      bookSourceId,
      currentTimeSec: 4,
      durationSec: 20,
      jobId,
      projectId,
      progress: 0.2,
      readingPosition: {
        activeWordIndex: 4,
        bookSourceId,
        scopeKey: scopeKey(bookScope),
      },
      targetId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

async function waitForPreparedSavedBookmark(projectId, preparedSourceId, jobId) {
  const targetId = `prepared:${preparedSourceId}`;
  return apiJson(`/api/progress/${targetId}`, {
    body: JSON.stringify({
      activeWordIndex: 4,
      addBookmark: {
        activeWordIndex: 4,
        createdAt: new Date().toISOString(),
        currentTimeSec: 4,
        id: `bookmark-${Date.now().toString(36)}-${preparedSourceId}`,
        label: "0:04",
        readingPosition: {
          activeWordIndex: 4,
          nodeId: "responsive-smoke",
        },
      },
      currentTimeSec: 4,
      durationSec: 20,
      jobId,
      preparedSourceId,
      progress: 0.2,
      projectId,
      readingPosition: {
        activeWordIndex: 4,
        nodeId: "responsive-smoke",
      },
      targetId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

async function assertTimingArtifacts(jobId, label) {
  const highlightMap = await apiJson(`/api/voice-jobs/${jobId}/highlight-map`);
  assert(
    highlightMap.schemaVersion === "highlight-map.v1",
    `${label} highlight map schema = ${highlightMap.schemaVersion}`,
  );
  assert((highlightMap.fragments?.length ?? 0) > 0, `${label} highlight map has no fragments.`);
  assert((highlightMap.tokens?.length ?? 0) > 0, `${label} highlight map has no tokens.`);
}

function verifyBook(book, expectedKind) {
  assert(book.kind === expectedKind, `book kind = ${book.kind}, want ${expectedKind}`);
  assert(book.status === "ready", `${expectedKind} source is not ready: ${book.status}`);
  const hasStructure =
    (book.sections?.length ?? 0) > 0 ||
    (book.chapters?.length ?? 0) > 0 ||
    (book.pages?.length ?? 0) > 0;
  assert(hasStructure, `${expectedKind} source has no structure.`);
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
      type: "chapter",
      chapterIndex: chapter.index,
      label: chapter.title || `Chapter ${String(chapter.index)}`,
    };
  }
  const page = book.pages?.find((item) => (item.wordCount ?? 0) >= 8) ?? book.pages?.[0];
  if (page) {
    return {
      type: "pages",
      pageStart: page.index,
      pageEnd: page.index,
      label: `Page ${String(page.index)}`,
    };
  }
  return { type: "book", label: "Full book" };
}

function scopeFromSection(section) {
  if (section.kind === "pages" || (section.pageStart && section.pageEnd && !section.chapterIndex)) {
    return {
      type: "pages",
      pageStart: section.pageStart ?? 1,
      pageEnd: section.pageEnd ?? section.pageStart ?? 1,
      label: section.title,
    };
  }
  return {
    type: "chapter",
    chapterIndex: section.chapterIndex ?? section.index + 1,
    label: section.title,
  };
}

function projectStorageState(projectId, projectState) {
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
      `Playwright is required. Run pnpm install before this smoke.\n${String(error)}`,
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

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegex(value) {
  return String(value).replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertEnabled(locator, label) {
  const enabled = await locator.isEnabled().catch(() => false);
  assert(enabled, `${label} control is disabled or missing.`);
}

function collectPageIssues(page) {
  const issues = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const text = message.text();
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
  const unexpected = issues.filter(
    (issue) => !/favicon|React DevTools|\/api\/voice-jobs\/[^/]+\/audio$/i.test(issue),
  );
  assert(unexpected.length === 0, `Unexpected browser issues:\n${unexpected.join("\n")}`);
}

async function readPerformanceMetrics(page) {
  return page.evaluate(() => globalThis.__ttsResearchPerformance?.metrics ?? []);
}

async function waitForReaderResumeApplied(page) {
  try {
    await page.waitForFunction(
      () =>
        globalThis.__ttsResearchPerformance?.metrics.some(
          (metric) => metric.name === "reader-resume",
        ),
      undefined,
      { timeout: lowResourceMode ? 120_000 : 60_000 },
    );
  } catch (error) {
    await page
      .screenshot({
        fullPage: false,
        path: path.join(screenshotsDir, "book-cinema-resume-failure.png"),
      })
      .catch(() => {});
    const diagnostics = await page.evaluate(() => ({
      buttons: Array.from(document.querySelectorAll('[role="dialog"] button')).map((button) => ({
        disabled: button.disabled,
        label: button.getAttribute("aria-label"),
        text: button.textContent?.replace(/\s+/g, " ").trim() ?? "",
        visible: Boolean(
          button.offsetWidth || button.offsetHeight || button.getClientRects().length,
        ),
      })),
      metrics: globalThis.__ttsResearchPerformance?.metrics ?? [],
      overlayText:
        document
          .querySelector('[role="dialog"][aria-labelledby="book-cinema-title"]')
          ?.textContent?.replace(/\s+/g, " ")
          .trim()
          .slice(0, 1200) ?? null,
      url: window.location.href,
    }));
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Reader resume metric was not recorded after clicking Resume.\n${JSON.stringify(
        diagnostics,
        null,
        2,
      )}\n${message}`,
    );
  }
  const pauseButton = visibleOverlayButton(page, "Pause");
  const playButton = visibleOverlayButton(page, "Play");
  const hasUsablePlaybackControl =
    (await pauseButton.isEnabled().catch(() => false)) ||
    (await playButton.isEnabled().catch(() => false));
  assert(
    hasUsablePlaybackControl,
    "Resume returned without an enabled playback transport control.",
  );
  return readPerformanceMetrics(page);
}

async function readDegradedStates(page) {
  return page.evaluate(() => globalThis.__ttsResearchPerformance?.degradedStates ?? []);
}

async function performanceMetricCount(page, name) {
  return page.evaluate(
    (metricName) =>
      globalThis.__ttsResearchPerformance?.metrics.filter((metric) => metric.name === metricName)
        .length ?? 0,
    name,
  );
}

async function waitForPerformanceMetricCount(page, name, minimumCount) {
  await page.waitForFunction(
    ({ metricName, count }) =>
      (globalThis.__ttsResearchPerformance?.metrics.filter((metric) => metric.name === metricName)
        .length ?? 0) >= count,
    { count: minimumCount, metricName: name },
    { timeout: 10_000 },
  );
}

function summarizePerformanceMetrics(metrics, degradedStates = []) {
  const summary = {};
  for (const metric of metrics) {
    summary[metric.name] = metric.durationMs;
  }
  return {
    degradedStates,
    latestByName: summary,
    metrics,
  };
}

function forceLowConfidenceHighlightMap(map) {
  const summary = {
    ...map.summary,
    confidence: { overall: 0.48, segment: 0.48, token: 0.42 },
    lowConfidence: true,
    mode: "phrase",
    reason: "forced low-confidence timing for local UX smoke",
  };
  return {
    ...map,
    mode: "phrase",
    summary,
    fragments: (map.fragments ?? []).map((fragment) => ({
      ...fragment,
      confidence: Math.min(fragment.confidence ?? 0.48, 0.48),
    })),
    tokens: (map.tokens ?? []).map((token) => ({
      ...token,
      confidence: Math.min(token.confidence ?? 0.42, 0.42),
      mode: "phrase",
    })),
  };
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

async function writeSummary(summary) {
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}
