#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { createBookCinemaCommandHelpers } from "./e2e-book-cinema-commands.mjs";
import { instrumentScreenshotState, writeScreenshotStateArtifacts } from "./screenshot-state.mjs";
import {
  buildReaderResumeArtifact,
  evaluateReaderTimingSummary,
  formatBudgetFailuresMarkdown,
  formatInteractionBudgetMarkdown,
  formatLowResourceWaiverBurndownMarkdown,
  loadReaderTimingThresholds,
} from "./validate-local/reader-timing.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = process.env.E2E_ARTIFACT_DIR ?? path.join(rootDir, "output", "e2e-book-cinema");
const screenshotsDir = process.env.E2E_SCREENSHOT_DIR ?? path.join(artifactDir, "screenshots");
const summaryPath = process.env.E2E_SUMMARY_PATH ?? path.join(artifactDir, "summary.json");
const screenshotStateDir =
  process.env.E2E_SCREENSHOT_STATE_OUTPUT_DIR ??
  path.join(rootDir, "output", "screenshots", "latest");
const performanceArtifactDir =
  process.env.E2E_PERFORMANCE_ARTIFACT_DIR ?? path.join(rootDir, "output", "performance", "latest");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";
const lowResourceMode = process.env.E2E_LOW_RESOURCE === "1";
const readerTimingWarnOnly = process.env.E2E_READER_TIMING_WARN_ONLY === "1";
const readerWayfindingOnly = process.env.E2E_READER_WAYFINDING === "1";
const responsiveCinemaOnly = process.env.E2E_RESPONSIVE_CINEMA === "1";
const settingsIAOnly = process.env.E2E_SETTINGS_IA === "1";
const workspaceFlowOnly = process.env.E2E_WORKSPACE_FLOW === "1";
const activeProjectKey = "tts-active-project-id";
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "180000", 10);
const responsiveCinemaViewports = [
  { height: 844, name: "phone-390", width: 390 },
  { height: 820, name: "constrained-1100", width: 1100 },
  { height: 980, name: "desktop-1440", width: 1440 },
  { height: 1080, name: "wide-1920", width: 1920 },
];
const cinemaOverlaySelector =
  '[role="dialog"][aria-labelledby="book-cinema-title"], [role="dialog"][aria-labelledby="prepared-source-cinema-title"]';

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";
let hasRunBookCinemaMemorySmoke = false;
let hasRunLowResourceInteractionBudgetSmoke = false;
let commandPaletteInvocationCount = 0;
const screenshotStateRecords = [];

const {
  apiJson,
  assertServerReady,
  assertTimingArtifacts,
  assertWebsiteExtractionQuality,
  createBookNarrationJob,
  createPreparedNarrationJob,
  startLocalServices,
  startWebsiteFixtureServer,
  uploadBook,
  uploadPreparedSource,
  waitForJob,
  waitForPreparedSavedBookmark,
  waitForSavedBookmark,
  waitForSavedProgress,
} = createBookCinemaCommandHelpers({
  artifactDir,
  getApiBaseUrl: () => apiBaseUrl,
  getJobTimeoutMs: () => jobTimeoutMs,
  rootDir,
});

const lowResourceFixtureRequirements = [
  { id: "short-source", label: "one short source" },
  { id: "long-source", label: "one long source" },
  { id: "generated-audio-source", label: "one generated-audio source" },
  { id: "no-audio-source", label: "one no-audio source" },
  { id: "pinned-inspector-source", label: "one pinned-inspector source" },
  { id: "website-cinema-article-source", label: "one Website Cinema article source" },
];

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
    fixtureCoverage: createLowResourceFixtureCoverage(),
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
      const screenshotState = await attachScreenshotStateSummary(summary);
      if (screenshotState.summary.mismatches > 0) {
        summary.status = "failed";
      }
      await writeSummary(summary);
      console.log(`Settings IA E2E ${summary.status}. Summary written to ${summaryPath}`);
      process.exitCode = summary.status === "passed" ? 0 : 1;
      return;
    }

    if (workspaceFlowOnly) {
      const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
      try {
        const demoResult = await runFirstRunDemoUX(browser, project.id);
        summary.screenshots.push(...demoResult.screenshots);
        summary.firstRunDemo = demoResult;
        const result = await runWorkspaceFlowUX(browser, project.id);
        summary.screenshots.push(...result.screenshots);
        summary.workspaceFlow = result;
      } finally {
        await browser.close();
      }
      summary.status = "passed";
      const screenshotState = await attachScreenshotStateSummary(summary);
      if (screenshotState.summary.mismatches > 0) {
        summary.status = "failed";
      }
      await writeSummary(summary);
      console.log(`Workspace Flow E2E ${summary.status}. Summary written to ${summaryPath}`);
      process.exitCode = summary.status === "passed" ? 0 : 1;
      return;
    }

    const markdownPrep = await runMarkdownSourcePrepE2E(project.id, fixtures.markdown);
    summary.markdownJobId = markdownPrep.job.id;
    const websitePrep = await runWebsiteSourcePrepE2E(project.id);
    summary.websiteJobId = websitePrep.job.id;
    summary.websiteExtractionQuality =
      websitePrep.source.metadata?.websiteExtractionQuality ?? null;

    if (responsiveCinemaOnly) {
      const book = await uploadBook(project.id, fixtures.epub);
      verifyBook(book, "epub");
      const scope = { label: "Full book", type: "book" };
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
      const screenshotState = await attachScreenshotStateSummary(summary);
      if (screenshotState.summary.mismatches > 0) {
        summary.status = "failed";
      }
      await writeSummary(summary);
      console.log(`Responsive Cinema E2E ${summary.status}. Summary written to ${summaryPath}`);
      process.exitCode = summary.status === "passed" ? 0 : 1;
      return;
    }

    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    try {
      const fixturesUnderTest = bookFixturesUnderTest(fixtures);
      for (const fixture of readerWayfindingOnly
        ? fixturesUnderTest.slice(0, 1)
        : fixturesUnderTest) {
        const result = await runBookSourceE2E(browser, project.id, fixture);
        summary.screenshots.push(result.screenshot);
        summary.performance.push({
          kind: fixture.kind,
          metrics: result.performance,
        });
        markFixtureCoverage(summary, fixture.coverage, {
          evidence: path.relative(rootDir, result.screenshot),
          fixture: fixture.kind,
        });
      }
      if (lowResourceMode && !readerWayfindingOnly) {
        const noAudioResult = await runNoAudioBookCinemaUX(browser, project.id, {
          file: fixtures.epub,
          kind: "epub-no-audio",
          expectedKind: "epub",
          screenshot: "book-cinema-no-audio.png",
        });
        summary.screenshots.push(noAudioResult.screenshot);
        summary.performance.push({
          kind: "epub-no-audio",
          metrics: noAudioResult.performance,
        });
        markFixtureCoverage(summary, ["no-audio-source"], {
          evidence: path.relative(rootDir, noAudioResult.screenshot),
          fixture: "epub-no-audio",
        });
      }
      const preparedFocus = await runPreparedCinemaFocusUX(browser, {
        documentJob: markdownPrep.job,
        documentSource: markdownPrep.source,
        projectId: project.id,
        websiteJob: websitePrep.job,
        websiteSource: websitePrep.source,
      });
      summary.preparedFocus = preparedFocus;
      summary.screenshots.push(...preparedFocus.screenshots);
      summary.performance.push(...preparedFocus.performance);
      markFixtureCoverage(summary, ["website-cinema-article-source"], {
        evidence: "Website Cinema focus smoke",
        fixture: "website-cinema",
      });
    } finally {
      await browser.close();
    }

    assertLowResourceFixtureCoverage(summary);

    const readerTimingThresholds = await loadReaderTimingThresholds(rootDir);
    const readerTiming = evaluateReaderTimingSummary(summary, readerTimingThresholds);
    summary.readerTiming = readerTiming;
    const failedTimingThreshold = readerTiming.thresholds.some((threshold) => !threshold.passed);
    const blockingTimingThreshold = readerTiming.thresholds.some((threshold) => threshold.blocking);
    const screenshotState = await attachScreenshotStateSummary(summary);
    const screenshotStateFailed = screenshotState.summary.mismatches > 0;
    summary.status = blockingTimingThreshold
      ? "failed"
      : screenshotStateFailed
        ? "failed"
        : failedTimingThreshold
          ? "passed-with-waivers"
          : "passed";
    await writeSummary(summary);
    await writePerformanceArtifacts(summary);
    if (screenshotStateFailed) {
      console.error(
        `Book Cinema E2E failed screenshot state assertions. See ${path.join(
          screenshotStateDir,
          "state-mismatches.md",
        )}`,
      );
      process.exitCode = 1;
      return;
    }
    if (failedTimingThreshold) {
      console.error(readerTiming.output);
      if (!blockingTimingThreshold) {
        console.error(
          `Book Cinema E2E recorded non-blocking timing waivers. Summary written to ${summaryPath}`,
        );
        return;
      }
      console.error(
        `Book Cinema E2E failed reader timing budgets. Summary written to ${summaryPath}`,
      );
      if (readerTimingWarnOnly) {
        console.error("Reader timing failures recorded without failing this review evidence run.");
        return;
      }
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
    assertWebsiteExtractionQuality(source);
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

function bookFixturesUnderTest(fixtures) {
  if (lowResourceMode) {
    return [
      {
        coverage: ["short-source", "generated-audio-source", "pinned-inspector-source"],
        expectedKind: "epub",
        file: fixtures.epub,
        kind: "epub-short",
        screenshot: "book-cinema-epub-short.png",
      },
      {
        coverage: ["long-source", "generated-audio-source"],
        expectedKind: "epub",
        file: fixtures.longEpub,
        kind: "epub-long",
        screenshot: "book-cinema-epub-long.png",
      },
      {
        coverage: ["generated-audio-source"],
        file: fixtures.pdf,
        kind: "pdf",
        screenshot: "book-cinema-pdf.png",
      },
    ];
  }
  return [
    { file: fixtures.epub, kind: "epub", screenshot: "book-cinema-epub.png" },
    { file: fixtures.docx, kind: "docx", screenshot: "book-cinema-docx.png" },
    { file: fixtures.pdf, kind: "pdf", screenshot: "book-cinema-pdf.png" },
  ];
}

async function runBookSourceE2E(browser, projectId, fixture) {
  const book = await uploadBook(projectId, fixture.file);
  const expectedKind = fixture.expectedKind ?? fixture.kind;
  verifyBook(book, expectedKind);
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
  if (expectedKind === "epub" && !lowResourceMode) {
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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

async function runFirstRunDemoUX(browser, projectId) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      sourceMode: "text",
      stage: "intake",
      text: "",
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshots = [];
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await exerciseFirstRunDemoPath(page, screenshots);
    await assertNoPageIssues(issues);
    return { screenshots, status: "passed" };
  } catch (error) {
    const failureScreenshot = path.join(screenshotsDir, "first-run-demo-failure.png");
    await page.screenshot({ fullPage: true, path: failureScreenshot }).catch(() => {});
    screenshots.push(failureScreenshot);
    throw error;
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
    await selectWorkspaceStage(page, "review");
    await page.getByText("Revision Panel").first().waitFor();
    await page.getByTestId("revision-tab-overview").click();
    await page.getByText("Inline Speech Edit").first().waitFor();
    await page.getByTestId("revision-tab-diagnostics").click();
    await page
      .getByText(/Validation appears after synthesis|Validation was disabled/)
      .first()
      .waitFor();

    for (const layout of ["Focus", "Balanced", "Full"]) {
      await selectWorkspaceLayout(page, layout);
      const screenshot = path.join(screenshotsDir, `workspace-${layout.toLowerCase()}.png`);
      await page.screenshot({ fullPage: false, path: screenshot });
      screenshots.push(screenshot);
    }
    await page.getByTestId("ui-action-project-dashboard-open-rail").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor();
    await page.getByText("Source and voice assets outside the narration stage").first().waitFor();
    await page.getByTestId("ui-action-command-center-return").click();
    await page.getByTestId("ui-action-voice-dashboard-open-rail").click();
    await page.getByRole("dialog", { name: "Command Center" }).waitFor();
    await page.getByText("Source and voice assets outside the narration stage").first().waitFor();
    await page.getByTestId("ui-action-command-center-return").click();
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
    await page.getByText("Generated audio playback").first().waitFor();
    await page.getByTestId("preview-generated-audio-empty-state").waitFor();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await clickTelepromptDisplayPreset(page, "ui-action-teleprompt-preset-largeText");
    await page.getByTestId("ui-action-teleprompt-mirror").check();
    await page.waitForFunction(() =>
      /Default voice|Default mock narrator|Default Kokoro|Heart \(af_heart\)/i.test(
        document.body.innerText ?? "",
      ),
    );
    await page.getByTestId("ui-action-teleprompt-cue-drawer").click();
    await page.getByRole("button", { exact: true, name: "Back to Review" }).click();
    await page.getByText("Revision Panel").first().waitFor();
    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.getByTestId("ui-action-teleprompt-cue-drawer").click();
    await page.getByRole("button", { exact: true, name: "Back to Preview" }).click();
    await page.getByText("Spoken Form").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
    await page.getByText("Teleprompt Studio").first().waitFor();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByText("Teleprompt Studio").first().waitFor();
    await assertWorkspaceLayoutSelected(page, "Full");
    await page.getByTestId("ui-action-teleprompt-cue-drawer").click();
    await page.getByRole("button", { exact: true, name: "Back to Preview" }).click();
    await page.getByText("Spoken Form").first().waitFor();
    await selectWorkspaceStage(page, "review");
    await page.getByText("Revision Panel").first().waitFor();
    await assertReviewPaneSelected(page, "Diagnostics");
    await setRememberLayout(page, true, { reset: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await assertWorkspaceLayoutSelected(page, "Balanced");
    await selectWorkspaceStage(page, "review");
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

async function clickTelepromptDisplayPreset(page, testId) {
  const presetMenu = page.locator("[data-teleprompt-preset-menu='display']").first();
  await presetMenu.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
    }
  });
  const preset = page.getByTestId(testId);
  await preset.scrollIntoViewIfNeeded();
  await preset.click();
}

async function exerciseFirstRunDemoPath(page, screenshots) {
  await page.getByTestId("ui-action-demo-open").click();
  await page.getByText("Mock provider").first().waitFor();
  await page.getByText("Unsaved demo").first().waitFor();
  await page.getByText("Local fixtures").first().waitFor();
  await page.getByTestId("ui-action-demo-project-short-education-reading").click();
  await page.getByText("Short Education Reading").first().waitFor();
  await page.getByText("Revision Panel").first().waitFor();
  await page.getByTestId("ui-action-demo-tour-preview").click();
  await page.getByText("Spoken Form").first().waitFor();
  await page.getByTestId("ui-action-demo-tour-teleprompt").click();
  await page.getByText("Teleprompt Studio").first().waitFor();
  await page.getByTestId("ui-action-demo-tour-review").click();
  await page.getByText("Revision Panel").first().waitFor();
  await page.getByTestId("ui-action-demo-collapse").click();
  const screenshot = path.join(screenshotsDir, "workspace-first-run-demo.png");
  await page.screenshot({ fullPage: false, path: screenshot });
  screenshots.push(screenshot);
}

async function selectWorkspaceStage(page, stage) {
  const button = page.getByTestId(`workspace-stage-${stage}`);
  await button.waitFor({ state: "visible" });
  const selected =
    (await button.getAttribute("data-selected")) === "true" ||
    (await button.getAttribute("aria-pressed")) === "true";
  if (selected) {
    return;
  }
  await button.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
  });
  await button.click();
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
    await page.getByTestId("ergonomic-preset-preview").waitFor();
    await page.getByText("Before / after summary").first().waitFor();
    await page.getByText("Settings audit").first().waitFor();
    await page.getByTestId("ui-action-ergonomic-preset-accessibilityFirst").click();
    await page.getByText("Existing source pins").first().waitFor();
    await page.getByText("Unchanged by preset").first().waitFor();
    const policyBeforePresetDefaults = await page
      .getByTestId("settings-quick-basic-policy")
      .inputValue();
    await page.getByTestId("ui-action-ergonomic-preset-apply").click();
    const policyAfterPresetDefaults = await page
      .getByTestId("settings-quick-basic-policy")
      .inputValue();
    if (policyAfterPresetDefaults !== policyBeforePresetDefaults) {
      throw new Error("Applying preset defaults changed project speech policy without confirm.");
    }
    let policyDialogMessage = "";
    page.once("dialog", async (dialog) => {
      policyDialogMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByTestId("ui-action-ergonomic-preset-apply-policy").click();
    if (!/Source-level pins and overrides stay unchanged/.test(policyDialogMessage)) {
      throw new Error(`Unexpected preset policy confirmation: ${policyDialogMessage}`);
    }
    await page.waitForFunction(() => {
      const select = document.querySelector("[data-testid='settings-quick-basic-policy']");
      return select instanceof HTMLSelectElement && select.value === "Accessibility";
    });
    const settingsScreenshot = path.join(screenshotsDir, "settings-ia-settings.png");
    await page.screenshot({ fullPage: false, path: settingsScreenshot });
    screenshots.push(settingsScreenshot);
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "project policy", /Project policy/);
    await page.getByText("Project defaults, session overrides").first().waitFor();
    await page.getByTestId("speech-policy-golden-minute-preview").waitFor();
    await page.getByText("Visual spoken-text preview").first().waitFor();
    await page.getByText("citation [^gm1]").first().waitFor();
    await page.getByTestId("speech-policy-ab-accessibility-technical").click();
    await page.getByText("Accessibility vs Technical Docs").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "machine scope", /Machine scope/);
    await page.getByTestId("ui-memory-preferences").waitFor();
    await page.getByText("Remember Teleprompt return target").first().waitFor();
    await page.getByText("Remember Teleprompt Theatre settings").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

    await runCommandPaletteAction(page, "teleprompt theatre settings", /^Teleprompt Theatre\b/);
    await page.getByTestId("teleprompt-theatre-settings-preview").waitFor();
    await page.getByTestId("ui-action-teleprompt-theatre-config-preset-lowVision").click();
    await page.getByText("Low vision").first().waitFor();
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
    const helpScreenshot = path.join(screenshotsDir, "workspace-context-guide.png");
    await page.screenshot({ fullPage: false, path: helpScreenshot });
    screenshots.push(helpScreenshot);
    await page.getByRole("button", { exact: true, name: "Close Help" }).click();

    await runCommandPaletteAction(page, "help cinema", /Help: Cinema/);
    await page.getByText("Context Guide").first().waitFor();
    await page.getByRole("dialog", { name: "Help" }).getByText("Cinema").first().waitFor();
    await page.getByRole("button", { exact: true, name: "Close Help" }).click();

    await page.getByTestId("ui-action-workspace-open-menu").click();
    await page.getByText("Project library and current chapter context").first().waitFor();
    const workspaceScreenshot = path.join(screenshotsDir, "workspace-project-library.png");
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

async function runLowResourceInteractionBudgetSmoke(page) {
  await measureFrontendInteraction(
    page,
    "source-switch",
    async () => {
      await selectCinemaInspectorPanel(page, "History");
      await cinemaOverlay(page)
        .getByRole("button", { exact: true, name: "Outline" })
        .first()
        .click();
      await cinemaOverlay(page)
        .getByRole("button", { name: /Full|Chapter|Page/ })
        .first()
        .click();
    },
    {
      breakdown: "inspector-layout-switch",
      runPhase: "first-run",
      surface: "book-cinema",
    },
  );

  await visibleOverlayButton(page, "Exit").click();
  await page.getByRole("button", { exact: true, name: "Review" }).waitFor();

  await measureFrontendInteraction(
    page,
    "settings-open",
    async () => {
      await page.getByRole("button", { exact: true, name: "Open settings" }).click();
      await page.getByText("Studio Settings").first().waitFor();
    },
    {
      breakdown: "settings-hydration",
      runPhase: "first-run",
      surface: "workspace",
    },
  );
  await page.getByRole("button", { exact: true, name: "Close Settings" }).click();

  await measureFrontendInteraction(
    page,
    "preview-generation-handoff",
    async () => {
      await page.getByTestId("workspace-stage-action-previewSpeech").click();
      await page.getByText("Spoken Form").first().waitFor();
      await page.getByTestId("global-preview-player").waitFor({ state: "visible" });
    },
    { surface: "workspace-preview" },
  );

  await measureFrontendInteraction(
    page,
    "preview-cinema-open",
    async () => {
      await page.getByTestId("ui-action-preview-mini-open-cinema").click();
      await cinemaOverlay(page).getByText("Book Cinema").first().waitFor();
    },
    { surface: "preview" },
  );
  await visibleOverlayButton(page, "Exit").click();
  await page.getByTestId("global-preview-player").waitFor({ state: "visible" });

  await measureFrontendInteraction(
    page,
    "teleprompt-cue-switch",
    async () => {
      await page.getByRole("button", { exact: true, name: "Open Teleprompt" }).click();
      await page.getByText("Teleprompt Studio").first().waitFor();
      await page.getByTestId("ui-action-teleprompt-local-next-cue").click();
    },
    {
      breakdown: "teleprompt-panel-boot",
      runPhase: "first-run",
      surface: "teleprompt",
    },
  );
}

async function setRememberLayout(page, enabled, { panelPins = false, reset = false } = {}) {
  await page.getByRole("button", { exact: true, name: "Open settings" }).click();
  await page.getByText("Studio Settings").first().waitFor();
  await page
    .getByRole("button", { name: /^Reader/ })
    .first()
    .click();
  await page.getByLabel("Remember layout").setChecked(enabled);
  if (panelPins) {
    await page.getByLabel("Remember panel pins").setChecked(enabled);
  }
  if (reset) {
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", {
        exact: true,
        name: panelPins ? "Reset all UI memory" : "Reset workspace layout",
      })
      .click();
  }
  await page.getByRole("button", { exact: true, name: "Close Settings" }).click();
}

async function assertWorkspaceLayoutSelected(page, label) {
  const menu = await openWorkspaceLayoutMenu(page);
  const button = menu.getByRole("button", { exact: true, name: `${label} workspace layout` });
  const pressed = await button.getAttribute("aria-pressed");
  const selected = await button.getAttribute("data-selected");
  await closeWorkspaceLayoutMenu(page);
  assert(
    pressed === "true" || selected === "true",
    `${label} workspace layout was not selected after reopen.`,
  );
}

async function selectWorkspaceLayout(page, label) {
  const menu = await openWorkspaceLayoutMenu(page);
  await menu.getByRole("button", { exact: true, name: `${label} workspace layout` }).click();
  await closeWorkspaceLayoutMenu(page);
}

async function openWorkspaceLayoutMenu(page) {
  const menus = page.getByTestId("ui-action-workspace-layout-menu");
  const count = await menus.count();
  for (let index = 0; index < count; index += 1) {
    const summary = menus.nth(index).locator("summary");
    if (await summary.isVisible()) {
      await summary.click();
      return menus.nth(index);
    }
  }
  throw new Error("Visible workspace layout menu was not found.");
}

async function closeWorkspaceLayoutMenu(page) {
  await page.evaluate(() => {
    document
      .querySelectorAll('[data-testid="ui-action-workspace-layout-menu"][open]')
      .forEach((element) => {
        element.removeAttribute("open");
      });
  });
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
  const invocation = commandPaletteInvocationCount;
  const runPhase = invocation === 0 ? "first-run" : "warm-run";
  await measureFrontendInteraction(
    page,
    "command-palette-open-search",
    async () => {
      const palette = page.getByRole("dialog", { name: "Command palette" });
      await page.keyboard.press("Control+K");
      if (!(await palette.isVisible({ timeout: 1_000 }).catch(() => false))) {
        await page.evaluate(() => {
          const triggers = [
            ...document.querySelectorAll("[data-testid='ui-action-command-palette-open']"),
          ].filter((trigger) => trigger instanceof HTMLElement);
          const visibleTrigger = triggers.find((trigger) => trigger.getClientRects().length > 0);
          (visibleTrigger ?? triggers[0])?.click();
        });
      }
      await palette.waitFor({ state: "visible" });
      await page.getByPlaceholder("Search actions, settings, sources, bookmarks...").fill(query);
      const option = palette.getByRole("option", { name: optionName }).first();
      await option.waitFor({ state: "visible" });
      await option.click();
      await palette.waitFor({ state: "hidden" }).catch(() => {});
    },
    {
      breakdown: invocation === 0 ? "command-indexing-first-run" : "warm-search-latency",
      query,
      runPhase,
    },
  );
  commandPaletteInvocationCount += 1;
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
      await setRememberLayout(page, true, { panelPins: true });
    }
    await openBookCinemaOverlay(page, scope);
    if (runMemorySmoke) {
      await exerciseCinemaFocusMemoryPersistence(page, "book", () =>
        openBookCinemaOverlay(page, scope),
      );
      hasRunBookCinemaMemorySmoke = true;
    }
    await waitForPerformanceMetricCount(page, "waveform-progress-render", 1);
    const playButton = visibleOverlayButton(page, "Play");
    await assertEnabled(playButton, "Play");
    let pauseButton;
    await measureFrontendInteraction(
      page,
      "transport-interaction-latency",
      async () => {
        await playButton.click();
        pauseButton = visibleOverlayButton(page, "Pause");
        await pauseButton.waitFor();
      },
      {
        action: "play",
        breakdown: "audio-context-resume",
        runPhase: "first-run",
      },
    );
    await page
      .locator(".book-cinema-word-active, .book-cinema-word-phrase")
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await pauseButton.click();
    await assertBookCinemaHighlightSync(page, {
      jobId: job.id,
      scopedSpans: bookWordSpansForScopeE2E(book, scope),
    });
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
    await exerciseSourcePinSmoke(page);
    await waitForSavedProgress(projectId, book.id, scope, job.id);
    await page.screenshot({ fullPage: false, path: screenshot });
    const firstOpenDegradedStates = await readDegradedStates(page);
    if (!hasRunLowResourceInteractionBudgetSmoke) {
      await runLowResourceInteractionBudgetSmoke(page);
      hasRunLowResourceInteractionBudgetSmoke = true;
    }
    const firstOpenMetrics = await readPerformanceMetrics(page);

    const resumePage = await context.newPage();
    instrumentScreenshotState(resumePage, { records: screenshotStateRecords, rootDir });
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

async function assertBookCinemaHighlightSync(page, { jobId, scopedSpans }) {
  const overlay = cinemaOverlay(page);
  const observed = await overlay
    .locator("[data-cinema-reader-canvas]")
    .first()
    .evaluate((node) => {
      const active = node.querySelector(
        '[aria-current="true"][data-readalong-word-index], .book-cinema-word-active[data-readalong-word-index]',
      );
      return {
        activeDomText: active?.textContent?.trim() ?? "",
        activeDomWordIndex: Number(active?.getAttribute("data-readalong-word-index") ?? "-1"),
        activeWordIndex: Number(node.getAttribute("data-cinema-sync-active-word-index") ?? "-1"),
        activeWordText: node.getAttribute("data-cinema-sync-active-word-text") ?? "",
        cursorSec: Number(node.getAttribute("data-cinema-sync-playback-cursor-sec") ?? "NaN"),
        jobId: node.getAttribute("data-cinema-sync-job-id") ?? "",
        runtimeState: node.getAttribute("data-cinema-sync-runtime-state") ?? "",
        timingSource: node.getAttribute("data-cinema-sync-timing-source") ?? "",
      };
    });
  assert(observed.jobId === jobId, `Sync lint observed job ${observed.jobId}, want ${jobId}.`);
  assert(
    Number.isFinite(observed.cursorSec) && observed.cursorSec > 0,
    `Sync lint cursor was not advanced: ${String(observed.cursorSec)}`,
  );
  assert(
    observed.timingSource === "highlight-map-v2",
    `Sync lint timing source = ${observed.timingSource}, want highlight-map-v2.`,
  );
  const map = await apiJson(`/api/voice-jobs/${jobId}/highlight-map-v2`);
  const expected = expectedHighlightWordAtCursor(map, observed.cursorSec, scopedSpans);
  assert(expected, `No highlight-map-v2 word entry at ${observed.cursorSec.toFixed(3)}s.`);
  assert(
    observed.activeWordIndex === expected.sourceWordIndex,
    `Sync lint active word index ${String(observed.activeWordIndex)} != expected ${String(
      expected.sourceWordIndex,
    )} at ${observed.cursorSec.toFixed(3)}s.`,
  );
  assert(
    normalizeSyncWord(observed.activeWordText) === normalizeSyncWord(expected.rawText),
    `Sync lint active word "${observed.activeWordText}" != expected "${expected.rawText}".`,
  );
  const expectedDom = await readBookCinemaExpectedWordDom(page, expected.sourceWordIndex);
  if (observed.activeDomWordIndex >= 0) {
    assert(
      observed.activeDomWordIndex === expected.sourceWordIndex,
      `Sync lint active DOM word index ${String(observed.activeDomWordIndex)} != expected ${String(
        expected.sourceWordIndex,
      )}.`,
    );
    assert(
      normalizeSyncWord(observed.activeDomText).includes(normalizeSyncWord(expected.rawText)),
      `Sync lint DOM word "${observed.activeDomText}" did not include expected "${expected.rawText}".`,
    );
  } else {
    assert(
      expectedDom.phraseHighlighted,
      `Sync lint expected word ${String(expected.sourceWordIndex)} is not inside the active phrase: ${JSON.stringify(
        expectedDom,
      )}.`,
    );
  }
}

async function readBookCinemaExpectedWordDom(page, sourceWordIndex) {
  const overlay = cinemaOverlay(page);
  return overlay
    .locator(`[data-readalong-word-index="${String(sourceWordIndex)}"]`)
    .first()
    .evaluate((node) => ({
      className: node.getAttribute("class") ?? "",
      exists: true,
      phraseHighlighted: node.classList.contains("book-cinema-word-phrase"),
      text: node.textContent?.trim() ?? "",
    }))
    .catch(() => ({
      className: "",
      exists: false,
      phraseHighlighted: false,
      text: "",
    }));
}

function expectedHighlightWordAtCursor(map, cursorSec, scopedSpans = []) {
  const cursorMs = cursorSec * 1000;
  const wordEntries = [...(map.entries ?? [])]
    .filter((entry) => entry.level === "word" && Number.isFinite(entry.sourceWordIndex))
    .sort((left, right) => left.audioStartMs - right.audioStartMs);
  if (wordEntries.length === 0) {
    return expectedPhraseFallbackWordAtCursor(map, cursorMs, scopedSpans);
  }
  const direct = wordEntries.find(
    (entry) => cursorMs >= entry.audioStartMs && cursorMs <= entry.audioEndMs,
  );
  if (direct) {
    return direct;
  }
  for (let index = wordEntries.length - 1; index >= 0; index -= 1) {
    if (cursorMs >= wordEntries[index].audioStartMs) {
      return wordEntries[index];
    }
  }
  return wordEntries.find((entry) => cursorMs <= entry.audioEndMs) ?? null;
}

function expectedPhraseFallbackWordAtCursor(map, cursorMs, scopedSpans) {
  const anchorEntries = [...(map.entries ?? [])]
    .filter((entry) => entry.level !== "word")
    .sort((left, right) => entryStartMs(left) - entryStartMs(right));
  if (anchorEntries.length === 0 || scopedSpans.length === 0) {
    return null;
  }
  const anchor =
    anchorEntries.find(
      (entry) => cursorMs >= entryStartMs(entry) && cursorMs <= entryEndMs(entry),
    ) ??
    anchorEntries.find((entry) => cursorMs <= entryEndMs(entry)) ??
    anchorEntries.at(-1);
  if (!anchor) {
    return null;
  }
  const startWordIndex = anchor.readingPosition?.activeWordIndex ?? anchor.sourceWordIndex;
  const startOffset = scopedSpans.findIndex((span) => span.index === startWordIndex);
  if (startOffset < 0) {
    return null;
  }
  const remainingSpans = scopedSpans.slice(startOffset);
  const spokenWords = tokenizeSyncWords(
    anchor.spokenText || anchor.normalizedText || anchor.rawText,
  );
  const phraseWordCount = Math.max(
    1,
    Math.min(remainingSpans.length, spokenWords.length || remainingSpans.length),
  );
  const durationMs = Math.max(1, entryEndMs(anchor) - entryStartMs(anchor));
  const progress = Math.max(0, Math.min(1, (cursorMs - entryStartMs(anchor)) / durationMs));
  const offset = Math.min(phraseWordCount - 1, Math.floor(progress * phraseWordCount));
  const span = remainingSpans[offset];
  return {
    rawText: span?.text ?? spokenWords[offset] ?? anchor.rawText,
    sourceWordIndex: span?.index ?? startWordIndex + offset,
  };
}

function entryStartMs(entry) {
  return Math.max(0, entry.alignedStartMs ?? entry.providerTimingStartMs ?? entry.audioStartMs);
}

function entryEndMs(entry) {
  return Math.max(
    entryStartMs(entry) + 1,
    entry.alignedEndMs ?? entry.providerTimingEndMs ?? entry.audioEndMs,
  );
}

function tokenizeSyncWords(value) {
  return String(value ?? "").match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
}

function normalizeSyncWord(value) {
  return String(value ?? "")
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, "");
}

async function runNoAudioBookCinemaUX(browser, projectId, fixture) {
  const book = await uploadBook(projectId, fixture.file);
  verifyBook(book, fixture.expectedKind ?? fixture.kind);
  const scope = pickNarrationScope(book);
  const scopeContent = await apiJson(`/api/book-sources/${book.id}/scope?${scopeQuery(scope)}`);
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      sourceMode: "book",
      sourceType: "book",
      stage: "intake",
      text: scopeContent.text,
    }),
    viewport: lowResourceMode ? { width: 1180, height: 820 } : { width: 1440, height: 980 },
  });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const screenshot = path.join(screenshotsDir, fixture.screenshot);
  try {
    await openBookCinemaOverlay(page, scope, bookCinemaHashUrl(book.id, scope));
    await visibleOverlayButton(page, "Create audio").waitFor({ state: "visible" });
    await assertCinemaActiveTargetVisible(page);
    await page.screenshot({ fullPage: false, path: screenshot });
    await assertNoPageIssues(issues);
    return {
      performance: {
        firstOpen: summarizePerformanceMetrics(
          await readPerformanceMetrics(page),
          await readDegradedStates(page),
        ),
      },
      screenshot,
    };
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
  const performance = [];
  const documentResult = await runPreparedCinemaSurfaceFocusUX(browser, {
    expectedLabel: "Document Cinema",
    job: documentJob,
    projectId,
    screenshotPrefix: "document-cinema-focus",
    source: documentSource,
  });
  screenshots.push(...documentResult.screenshots);
  performance.push({
    kind: "document-cinema",
    metrics: documentResult.performance,
  });
  screenshots.push(
    ...(await capturePreparedCinemaLoadingScenario(browser, {
      expectedLabel: "Document Cinema",
      job: documentJob,
      projectId,
      screenshotPrefix: "document-cinema-focus",
      source: documentSource,
    })),
  );
  const websiteResult = await runPreparedCinemaSurfaceFocusUX(browser, {
    expectedLabel: "Website Cinema",
    job: websiteJob,
    projectId,
    screenshotPrefix: "website-cinema-focus",
    source: websiteSource,
  });
  screenshots.push(...websiteResult.screenshots);
  performance.push({
    kind: "website-cinema",
    metrics: websiteResult.performance,
  });
  return { performance, screenshots };
}

async function capturePreparedCinemaLoadingScenario(
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
  await context.addInitScript(() => {
    globalThis.__ttsCinemaRendererDelayMs = 5_000;
  });
  const page = await context.newPage();
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  page.setDefaultTimeout(60_000);
  try {
    await openPreparedCinemaOverlay(page, expectedLabel);
    await page.waitForFunction(
      (selector) => {
        const overlay = document.querySelector(selector);
        const lifecycle = overlay?.getAttribute("data-cinema-renderer-lifecycle");
        const text = overlay?.textContent?.replace(/\s+/g, " ") ?? "";
        return (
          (lifecycle === "loading" || lifecycle === "degraded") &&
          /Preparing this view locally|Taking longer than expected/i.test(text)
        );
      },
      cinemaOverlaySelector,
      { timeout: 5_000 },
    );
    const screenshot = path.join(screenshotsDir, `${screenshotPrefix}-loading.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    return [screenshot];
  } finally {
    await context.close();
  }
}

async function runResponsiveCinemaUX(
  browser,
  { book, bookJob, documentJob, documentSource, projectId, scope, text, websiteJob, websiteSource },
) {
  await waitForSavedBookmark(projectId, book.id, scope, bookJob.id);
  await waitForPreparedSavedBookmark(projectId, documentSource.id, documentJob.id);
  await waitForPreparedSavedBookmark(projectId, websiteSource.id, websiteJob.id);

  const screenshots = [];
  const evidenceRoutes = [];
  for (const viewport of responsiveCinemaViewports) {
    evidenceRoutes.push(
      `book:${viewport.name}:Book Cinema`,
      `document:${viewport.name}:Document Cinema`,
      `website:${viewport.name}:Website Cinema`,
    );
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

  const mobileSurfaceCount =
    responsiveCinemaViewports.filter((viewport) => viewport.width < 1024).length * 3;
  const bottomSheetScreenshots = screenshots.filter((screenshot) =>
    /responsive-(book|document|website)-[^/]+-sheet\.png$/.test(screenshot),
  );

  return {
    bottomSheetReachability: {
      expectedSurfaces: mobileSurfaceCount,
      passed: bottomSheetScreenshots.length >= mobileSurfaceCount,
      screenshots: bottomSheetScreenshots,
    },
    evidenceRoutes,
    failureSummaries: [],
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
    screenshots.push(
      await captureResponsiveCinemaTheatre(page, {
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
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
    screenshots.push(
      await captureResponsiveCinemaTheatre(page, {
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
  const intakeStage = page.getByTestId("workspace-stage-intake").first();
  if (await intakeStage.isVisible().catch(() => false)) {
    if (await intakeStage.isEnabled().catch(() => false)) {
      await intakeStage.click();
    }
  } else {
    await page
      .getByRole("button", { name: /Intake/ })
      .first()
      .click();
  }
  await openIntakeDestination(page);
  await page
    .getByRole("button", { name: new RegExp(`Open ${expectedLabel}`) })
    .first()
    .click();
  await cinemaOverlay(page).getByText(expectedLabel).first().waitFor();
}

async function captureResponsiveCinemaSurface(page, { surface, viewport }) {
  await assertCinemaFocusModeSelected(page, "Read");
  await assertCinemaReadyForScreenshot(page, `${surface}:${viewport.name}`);
  await assertCinemaResponsiveContract(page, `${surface}:${viewport.name}`);
  if (viewport.width >= 1024) {
    await assertCinemaMoreMenuFitsViewport(page, `${surface}:${viewport.name}`);
  }
  const screenshot = path.join(screenshotsDir, `responsive-${surface}-${viewport.name}.png`);
  await page.screenshot({ fullPage: false, path: screenshot });
  return screenshot;
}

async function captureResponsiveCinemaTheatre(page, { surface, viewport }) {
  if (viewport.width < 1024) {
    await enterResponsiveCinemaTheatreFromMobileSheet(page, surface);
  } else {
    const theatreButton = visibleOverlayControl(page, (overlay) =>
      overlay.getByRole("button", { name: /^(Theatre|Open Cinema Theatre)$/ }),
    );
    await assertEnabled(theatreButton, "Theatre");
    await theatreButton.click();
  }
  await cinemaOverlay(page).getByTestId("cinema-theatre-chrome").waitFor({ state: "visible" });
  await assertCinemaReadyForScreenshot(page, `${surface}:${viewport.name}:theatre`);
  const screenshot = path.join(
    screenshotsDir,
    `responsive-${surface}-${viewport.name}-theatre.png`,
  );
  await page.screenshot({ fullPage: false, path: screenshot });
  await assertCinemaTheatreContract(page, `${surface}:${viewport.name}:theatre`);
  await runCommandPaletteAction(page, "toggle theatre controls", /Toggle Theatre controls/);
  await page.getByTestId("cinema-theatre-transport").waitFor({ state: "visible" });
  await page.waitForFunction(
    (selector) =>
      document
        .querySelector(selector)
        ?.querySelector("[data-cinema-theatre-transport]")
        ?.getAttribute("data-cinema-theatre-controls") === "hidden",
    cinemaOverlaySelector,
    { timeout: 5_000 },
  );
  await runCommandPaletteAction(page, "exit theatre", /Exit Theatre/);
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.getAttribute("data-cinema-theatre-mode") === "false",
    cinemaOverlaySelector,
    { timeout: 5_000 },
  );
  await assertCinemaFocusModeSelected(page, "Read");
  return screenshot;
}

async function enterResponsiveCinemaTheatreFromMobileSheet(page, surface) {
  const moreButton = visibleOverlayButton(page, "More");
  await assertEnabled(moreButton, "More");
  await moreButton.click();
  const sheet = cinemaOverlay(page).locator("[data-cinema-mobile-sheet]").first();
  await sheet.waitFor({ state: "visible" });
  await sheet.getByRole("button", { exact: true, name: "Theatre" }).click();
  const theatreAction =
    surface === "book"
      ? sheet.getByTestId("ui-action-book-cinema-mobile-theatre")
      : sheet.getByTestId("ui-action-prepared-cinema-mobile-theatre");
  await theatreAction.waitFor({ state: "visible" });
  await theatreAction.click();
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
  if (surface === "book" || surface === "document" || surface === "website") {
    await sheet.getByRole("button", { exact: true, name: "Theatre" }).waitFor();
    await sheet.getByRole("button", { exact: true, name: "Theatre" }).click();
    const theatreActionTestId =
      surface === "book"
        ? "ui-action-book-cinema-mobile-theatre"
        : "ui-action-prepared-cinema-mobile-theatre";
    await sheet.getByTestId(theatreActionTestId).waitFor();
  }
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
  await assertCinemaCanvasBudget(page, label);
  await assertBookReaderPageFit(page, label);
  await assertBookReaderTextQuality(page, label);
  await assertNoFooterNavigationActions(page, label);
}

async function assertCinemaMoreMenuFitsViewport(page, label) {
  await cinemaAdvancedModeButton(page).click();
  const menu = cinemaOverlay(page).locator("[data-cinema-more-menu]").first();
  await menu.waitFor({ state: "visible" });
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    const menuElement = overlay?.querySelector("[data-cinema-more-menu]");
    if (!(menuElement instanceof HTMLElement)) {
      return { ok: false, reason: "missing Cinema More menu" };
    }
    const rect = menuElement.getBoundingClientRect();
    return {
      bottom: Math.round(rect.bottom),
      height: Math.round(rect.height),
      ok: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      top: Math.round(rect.top),
      viewportHeight: window.innerHeight,
    };
  }, cinemaOverlaySelector);
  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "hidden" }).catch(() => {});
  assert(result.ok, `${label} Cinema More menu is clipped: ${JSON.stringify(result)}`);
}

async function assertBookReaderPageFit(page, label) {
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    if (!(overlay instanceof HTMLElement)) {
      return { ok: false, reason: "missing overlay" };
    }
    const copies = [
      ...overlay.querySelectorAll(".book-cinema-page-copy, .book-cinema-follow-copy"),
    ].filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      const styles = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden";
    });
    const issues = copies.flatMap((element) => {
      if (!(element instanceof HTMLElement)) {
        return [];
      }
      const styles = getComputedStyle(element);
      const hiddenOverflow =
        styles.overflow === "hidden" ||
        styles.overflowY === "hidden" ||
        styles.overflowY === "clip";
      const overflowPixels = element.scrollHeight - element.clientHeight;
      if (!hiddenOverflow || overflowPixels <= 2) {
        return [];
      }
      return [
        {
          clientHeight: element.clientHeight,
          overflowPixels,
          overflowY: styles.overflowY,
          scrollHeight: element.scrollHeight,
          text: element.textContent?.replace(/\s+/g, " ").trim().slice(0, 100) ?? "",
        },
      ];
    });
    return {
      issues,
      ok: issues.length === 0,
      pagesChecked: copies.length,
      skipped: copies.length === 0,
    };
  }, cinemaOverlaySelector);
  assert(result.ok, `${label} has clipped reader text: ${JSON.stringify(result)}`);
}

async function assertBookReaderTextQuality(page, label) {
  const artifactPatterns = [
    "\\bearl y\\b",
    "\\bwor k\\b",
    "\\bc aching\\b",
    "\\bcoher ence\\b",
    "\\baMOESDIF\\b",
    "\\bsneed\\b",
    "\\bnretries\\b",
    "\\bgacknowledgements\\b",
    "\\biand\\b",
    "\\boReal\\b",
    "\\bconsensus t ext\\b",
    "\\bN agarajan\\b",
    "\\bh eterogeneous\\b",
    "\\bcl ient\\b",
    "\\bdirect ory\\b",
  ];
  const result = await page.evaluate(
    ({ patterns, selector }) => {
      const overlay = document.querySelector(selector);
      if (!(overlay instanceof HTMLElement)) {
        return { ok: false, reason: "missing overlay" };
      }
      const copies = [
        ...overlay.querySelectorAll(".book-cinema-page-copy, .book-cinema-follow-copy"),
      ].filter((element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden";
      });
      const text = copies
        .map((element) => element.textContent ?? "")
        .join(" ")
        .replace(/\s+/g, " ");
      const matches = patterns
        .map((pattern) => ({ pattern, regex: new RegExp(pattern, "i") }))
        .filter(({ regex }) => regex.test(text))
        .map(({ pattern }) => pattern);
      return {
        matches,
        ok: matches.length === 0,
        pagesChecked: copies.length,
        sample: text.trim().slice(0, 220),
        skipped: copies.length === 0,
      };
    },
    { patterns: artifactPatterns, selector: cinemaOverlaySelector },
  );
  assert(result.ok, `${label} has PDF split-word artifacts: ${JSON.stringify(result)}`);
}

async function assertNoFooterNavigationActions(page, label) {
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    if (!(overlay instanceof HTMLElement)) {
      return { ok: false, reason: "missing overlay" };
    }
    const footers = [...overlay.querySelectorAll("[data-cinema-transport-footer]")].filter(
      (element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const rect = element.getBoundingClientRect();
        const styles = getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && styles.visibility !== "hidden";
      },
    );
    const blocked = new Set(["more", "theatre"]);
    const actions = footers.flatMap((footer) =>
      [...footer.querySelectorAll("button")].flatMap((button) => {
        if (!(button instanceof HTMLButtonElement)) {
          return [];
        }
        const rect = button.getBoundingClientRect();
        const styles = getComputedStyle(button);
        if (rect.width <= 0 || rect.height <= 0 || styles.visibility === "hidden") {
          return [];
        }
        const labelText = (button.getAttribute("aria-label") || button.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        return blocked.has(labelText.toLowerCase()) ? [labelText] : [];
      }),
    );
    return {
      actions,
      footerCount: footers.length,
      ok: actions.length === 0,
    };
  }, cinemaOverlaySelector);
  assert(result.ok, `${label} exposes footer navigation actions: ${JSON.stringify(result)}`);
}

async function assertCinemaTheatreContract(page, label) {
  await assertCinemaActiveTargetVisible(page);
  await assertNoHorizontalOverflow(page, label);
  await assertCinemaTouchTargets(page, label);
  await assertCinemaCanvasBudget(page, label);
  await assertBookReaderPageFit(page, label);
  await assertBookReaderTextQuality(page, label);
  await assertNoFooterNavigationActions(page, label);
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    if (!(overlay instanceof HTMLElement)) {
      return { ok: false, reason: "missing overlay" };
    }
    const chrome = overlay.querySelector("[data-testid='cinema-theatre-chrome']");
    const transport = overlay.querySelector("[data-testid='cinema-theatre-transport']");
    const inspector = overlay.querySelector("[data-cinema-inspector-dock]");
    const main = overlay.querySelector("main");
    const canvas = main?.firstElementChild;
    if (
      !(chrome instanceof HTMLElement) ||
      !(transport instanceof HTMLElement) ||
      !(main instanceof HTMLElement) ||
      !(canvas instanceof HTMLElement)
    ) {
      return { ok: false, reason: "missing theatre chrome, transport, main, or canvas" };
    }
    const mainRect = main.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    return {
      canvasHeightRatio: canvasRect.height / window.innerHeight,
      canvasWidthRatio: canvasRect.width / Math.max(1, mainRect.width),
      hasInspector: inspector instanceof HTMLElement,
      mode: overlay.getAttribute("data-cinema-theatre-mode"),
      ok:
        overlay.getAttribute("data-cinema-theatre-mode") === "true" &&
        !(inspector instanceof HTMLElement) &&
        canvasRect.height / window.innerHeight >= 0.43 &&
        canvasRect.width / Math.max(1, mainRect.width) >= 0.9,
    };
  }, cinemaOverlaySelector);
  assert(result.ok, `${label} violates Cinema Theatre contract: ${JSON.stringify(result)}`);
}

async function assertCinemaCanvasBudget(page, label) {
  const result = await page.evaluate((selector) => {
    const overlay = document.querySelector(selector);
    const main = overlay?.querySelector("main");
    const canvas = main?.firstElementChild;
    const footer = overlay?.querySelector("[data-cinema-transport-footer]");
    if (
      !(overlay instanceof HTMLElement) ||
      !(main instanceof HTMLElement) ||
      !(canvas instanceof HTMLElement) ||
      !(footer instanceof HTMLElement)
    ) {
      return { ok: false, reason: "missing Cinema shell, canvas, or transport footer" };
    }

    const sheet = overlay.querySelector("[data-cinema-mobile-sheet]");
    if (sheet instanceof HTMLElement && sheet.getBoundingClientRect().height > 1) {
      return { ok: true, reason: "mobile-sheet-open", skipped: true };
    }

    const compactViewport = window.innerWidth < 1180;
    const footerMaxHeightPx = Number(
      overlay.getAttribute(
        compactViewport
          ? "data-cinema-footer-max-height-px"
          : "data-cinema-desktop-footer-max-height-px",
      ) ?? "0",
    );
    const footerMaxHeightRatio = Number(
      overlay.getAttribute(
        compactViewport
          ? "data-cinema-footer-max-height-ratio"
          : "data-cinema-desktop-footer-max-height-ratio",
      ) ?? "0",
    );
    const minCanvasHeightRatio = Number(
      overlay.getAttribute(
        compactViewport
          ? "data-cinema-compact-min-canvas-height-ratio"
          : "data-cinema-min-canvas-height-ratio",
      ) ?? "0",
    );
    const minCanvasWidthRatio = Number(
      overlay.getAttribute("data-cinema-min-canvas-width-ratio") ?? "0",
    );
    const mainRect = main.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const footerRect = footer.getBoundingClientRect();
    const footerHeightRatio = footerRect.height / window.innerHeight;
    const canvasHeightRatio = canvasRect.height / window.innerHeight;
    const canvasWidthRatio = canvasRect.width / mainRect.width;
    const footerOk =
      footerMaxHeightPx > 0 &&
      footerRect.height <= footerMaxHeightPx + 1 &&
      footerHeightRatio <= footerMaxHeightRatio + 0.01;
    const canvasOk =
      canvasHeightRatio >= minCanvasHeightRatio - 0.01 &&
      canvasWidthRatio >= minCanvasWidthRatio - 0.01;

    return {
      budget: overlay.getAttribute("data-cinema-canvas-budget"),
      canvasHeightRatio,
      canvasOk,
      canvasWidthRatio,
      compactViewport,
      footerHeightPx: footerRect.height,
      footerHeightRatio,
      footerMaxHeightPx,
      footerMaxHeightRatio,
      footerOk,
      minCanvasHeightRatio,
      minCanvasWidthRatio,
      ok: footerOk && canvasOk,
    };
  }, cinemaOverlaySelector);
  assert(result.ok, `${label} violates Cinema canvas budget: ${JSON.stringify(result)}`);
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
          widestDescendant: [...element.querySelectorAll("*")]
            .filter((descendant) => descendant instanceof HTMLElement)
            .map((descendant) => {
              const rect = descendant.getBoundingClientRect();
              const parentRect = element.getBoundingClientRect();
              return {
                className: descendant.className,
                overflowRight: Math.round(rect.right - parentRect.right),
                tagName: descendant.tagName,
                text: descendant.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? "",
                width: Math.round(rect.width),
              };
            })
            .filter((descendant) => descendant.overflowRight > 1)
            .sort((a, b) => b.overflowRight - a.overflowRight)
            .slice(0, 5),
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
  instrumentScreenshotState(page, { records: screenshotStateRecords, rootDir });
  if (lowResourceMode) {
    await applyLowResourceProfile(page);
  }
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  try {
    await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await setRememberLayout(page, true, { panelPins: true });
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
    return {
      performance: summarizePerformanceMetrics(
        await readPerformanceMetrics(page),
        await readDegradedStates(page),
      ),
      screenshots,
    };
  } finally {
    await context.close();
  }
}

async function captureCinemaFocusModeScreenshots(page, screenshotPrefix) {
  const screenshots = [];
  for (const mode of ["Read", "Inspect", "Review", "Debug"]) {
    await switchCinemaFocusMode(page, mode);
    await assertCinemaFocusModeLayout(page, mode);
    await assertCinemaReadyForScreenshot(page, mode);
    await assertCinemaActiveTargetVisible(page);
    const screenshot = `${screenshotPrefix}-${mode.toLowerCase()}.png`;
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
    await openCinemaAdvancedMenu(page);
    const moreScreenshot = `${screenshotPrefix}-${mode.toLowerCase()}-more-menu.png`;
    await page.screenshot({ fullPage: false, path: moreScreenshot });
    screenshots.push(moreScreenshot);
    await page.keyboard.press("Escape");
  }

  await switchCinemaFocusMode(page, "Inspect");
  await selectCinemaInspectorPanel(page, "Overview");
  await visibleOverlayButton(page, "Pin").click();
  await switchCinemaFocusMode(page, "Read");
  await assertCinemaFocusModeLayout(page, "Read", { pinned: true });
  await assertCinemaReadyForScreenshot(page, "Read pinned");
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
  await visibleOverlayButton(page, "Pinned").click();
  await switchCinemaFocusMode(page, "Read");
  await waitForRememberedCinemaFocusState(page, surfaceKind, "read", null);
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
      if (expectedMode === "read" && expectedPinnedPanelId === null) {
        return (
          memory?.rememberPanelPins !== true ||
          (surface?.mode === "read" && (surface?.pinnedPanelId ?? null) === null)
        );
      }
      return (
        memory?.rememberPanelPins === true &&
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
  const buttonName =
    mode === "Debug" ? /^(Advanced menu\. Active operator mode: Diagnostics|Diagnostics)$/ : mode;
  const pressed = await overlay
    .getByRole("button", { exact: true, includeHidden: true, name: buttonName })
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
  await assertCinemaCanvasBudget(page, "read canvas dominance");
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

async function assertCinemaReadyForScreenshot(page, label) {
  await page
    .waitForFunction(
      (selector) => {
        const overlay = document.querySelector(selector);
        if (!(overlay instanceof HTMLElement)) {
          return false;
        }
        const text = overlay.innerText?.replace(/\s+/g, " ") ?? "";
        const rendererLifecycle = overlay.getAttribute("data-cinema-renderer-lifecycle");
        return (
          rendererLifecycle === "ready" &&
          !/Loading source renderer|Loading selected chapter|Loading Book Cinema|Preparing this view locally|Taking longer than expected|Renderer failed, retry/i.test(
            text,
          )
        );
      },
      cinemaOverlaySelector,
      { timeout: 15_000 },
    )
    .catch((error) => {
      throw new Error(`Cinema ${label} did not reach a ready renderer state before screenshot.`, {
        cause: error,
      });
    });
}

async function switchCinemaFocusMode(page, mode) {
  if (mode === "Debug") {
    await openCinemaAdvancedMenu(page);
    await cinemaOverlay(page)
      .getByRole("menuitemradio", { exact: true, name: /Diagnostics/ })
      .click();
    return;
  }
  await page
    .locator(cinemaOverlaySelector)
    .first()
    .getByRole("button", { exact: true, name: mode })
    .click();
}

async function openCinemaAdvancedMenu(page) {
  await cinemaAdvancedModeButton(page).click();
  await cinemaOverlay(page)
    .getByRole("menuitemradio", { exact: true, name: /Diagnostics/ })
    .waitFor();
}

function cinemaAdvancedModeButton(page) {
  return visibleOverlayControl(page, (overlay) =>
    overlay.getByRole("button", {
      name: /^(Open Cinema More menu|Cinema More menu\. Active operator mode: Diagnostics|Diagnostics)$/,
    }),
  );
}

async function selectCinemaInspectorPanel(page, label) {
  const overlay = page.locator(cinemaOverlaySelector).first();
  const name = new RegExp(label);
  const tab = overlay.getByRole("tab", { name }).first();
  const existingMetricCount = await performanceMetricCount(page, "context-panel-tab-switch").catch(
    () => 0,
  );
  const runPhase = existingMetricCount === 0 ? "first-run" : "warm-run";
  await measureFrontendInteraction(
    page,
    "context-panel-tab-switch",
    async () => {
      if ((await tab.count()) > 0) {
        await tab.click();
        return;
      }
      await overlay.getByRole("button", { name }).first().click();
    },
    {
      breakdown: existingMetricCount === 0 ? "context-panel-boot" : "warm-tab-switch-variance",
      runPhase,
      tab: label,
    },
  );
}

async function exerciseSourcePinSmoke(page) {
  const savePinButton = visibleOverlayButton(page, "Save pin");
  await assertEnabled(savePinButton, "Save pin");
  await savePinButton.click();
  await cinemaOverlay(page).getByText("Pinned").first().waitFor({ timeout: 15_000 });

  const clearPinButton = visibleOverlayButton(page, "Clear pin");
  await assertEnabled(clearPinButton, "Clear pin");
  page.once("dialog", (dialog) => dialog.accept());
  await clearPinButton.click();
  await cinemaOverlay(page).getByText("Project default").first().waitFor({ timeout: 15_000 });
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
  const intakeStage = page.getByTestId("workspace-stage-intake").first();
  if (await intakeStage.isVisible().catch(() => false)) {
    if (await intakeStage.isEnabled().catch(() => false)) {
      await intakeStage.click();
    }
  } else {
    await page
      .getByRole("button", { name: /Intake/ })
      .first()
      .click();
  }
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
  const longEpub = path.join(generatedDir, "book-cinema-long-smoke.epub");
  const docx = path.join(generatedDir, "book-cinema-smoke.docx");
  await writeSyntheticEPUB(epub);
  await writeSyntheticEPUB(longEpub, { longForm: true });
  await writeSyntheticDOCX(docx);
  return { docx, epub, longEpub, markdown, pdf };
}

async function writeSyntheticEPUB(filePath, { longForm = false } = {}) {
  const title = longForm ? "Long Chapter" : "Chapter One";
  const paragraphs = longForm
    ? Array.from(
        { length: 18 },
        (_, index) =>
          `<p>Long-form validation paragraph ${String(
            index + 1,
          )} keeps the reader busy with steady prose, source switching, generated audio, and resume state. The paragraph is intentionally plain so local mock narration can exercise the reader canvas without external dependencies.</p>`,
      ).join("")
    : `<p>The local validation ritual reads this compact EPUB chapter aloud. It has enough clean prose for a short mock narration and resume check.</p><p>The second paragraph keeps the reader stage populated after seeking forward.</p>`;
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
    `<html><body><nav epub:type="toc"><ol><li><a href="chapter1.xhtml">${title}</a></li></ol></nav></body></html>`,
  );
  zip.file(
    "EPUB/chapter1.xhtml",
    `<html lang="en"><head><title>${title}</title></head><body><h1>${title}</h1>${paragraphs}</body></html>`,
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

function bookWordSpansForScopeE2E(book, scope) {
  const spans = book.wordSpans ?? [];
  if (scope.type === "chapter" && Number.isInteger(scope.chapterIndex)) {
    const chapterSpans = spans.filter(
      (span) => span.chapter === scope.chapterIndex || span.chapterIndex === scope.chapterIndex,
    );
    return chapterSpans.length > 0 ? chapterSpans : spans;
  }
  if (scope.type === "pages") {
    const pageStart = scope.pageStart ?? 1;
    const pageEnd = scope.pageEnd ?? pageStart;
    const pageSpans = spans.filter((span) => {
      const pageIndex = span.pageIndex ?? span.page ?? span.pageNumber;
      return Number.isInteger(pageIndex) && pageIndex >= pageStart && pageIndex <= pageEnd;
    });
    return pageSpans.length > 0 ? pageSpans : spans;
  }
  return spans;
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

async function measureFrontendInteraction(page, name, action, detail = {}) {
  const startedAt = await page.evaluate(() => performance.now());
  await action();
  const endedAt = await page.evaluate(() => performance.now());
  const durationMs = Math.max(0, endedAt - startedAt);
  await page.evaluate(
    ({ durationMs, endedAt, metricDetail, metricName, startedAt }) => {
      if (!globalThis.__ttsResearchPerformance) {
        globalThis.__ttsResearchPerformance = {
          degradedStates: [],
          metrics: [],
          spans: {},
        };
      }
      const store = globalThis.__ttsResearchPerformance;
      store.metrics.push({
        detail: metricDetail,
        durationMs: Math.round(durationMs * 10) / 10,
        endedAt: Math.round(endedAt * 10) / 10,
        name: metricName,
        startedAt: Math.round(startedAt * 10) / 10,
      });
    },
    { durationMs, endedAt, metricDetail: detail, metricName: name, startedAt },
  );
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
    { timeout: lowResourceMode ? 30_000 : 10_000 },
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

async function writeSummary(summary) {
  await mkdir(path.dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}

async function attachScreenshotStateSummary(summary) {
  const screenshotState = await writeScreenshotStateArtifacts({
    outputDir: screenshotStateDir,
    records: screenshotStateRecords,
    rootDir,
  });
  summary.screenshotState = {
    manifest: path.join(screenshotStateDir, "manifest.json"),
    mismatches: path.join(screenshotStateDir, "state-mismatches.md"),
    summary: screenshotState.summary,
  };
  return screenshotState;
}

function createLowResourceFixtureCoverage() {
  if (!lowResourceMode) {
    return [];
  }
  return lowResourceFixtureRequirements.map((requirement) => ({
    ...requirement,
    evidence: [],
    status: "missing",
  }));
}

function markFixtureCoverage(summary, coverageIds = [], evidence = {}) {
  if (!lowResourceMode || !Array.isArray(summary.fixtureCoverage)) {
    return;
  }
  for (const coverageId of coverageIds ?? []) {
    const item = summary.fixtureCoverage.find((entry) => entry.id === coverageId);
    if (!item) {
      continue;
    }
    item.status = "covered";
    item.evidence.push(evidence);
  }
}

function assertLowResourceFixtureCoverage(summary) {
  if (!lowResourceMode) {
    return;
  }
  const missing = (summary.fixtureCoverage ?? []).filter((item) => item.status !== "covered");
  assert(
    missing.length === 0,
    `Low-resource fixture coverage is missing: ${missing.map((item) => item.label).join(", ")}`,
  );
}

async function writePerformanceArtifacts(summary) {
  if (!summary?.readerTiming) {
    return;
  }
  await mkdir(performanceArtifactDir, { recursive: true });
  await writeFile(
    path.join(performanceArtifactDir, "timing.json"),
    `${JSON.stringify(
      {
        evidenceContract: summary.readerTiming.evidenceContract,
        metrics: summary.readerTiming.metrics,
        schemaVersion: "tts-research.performance-timing-artifact.v1",
        sourceScript: "scripts/e2e-book-cinema.mjs",
        thresholds: summary.readerTiming.thresholds,
        unit: "ms",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(performanceArtifactDir, "reader-resume.json"),
    `${JSON.stringify(
      buildReaderResumeArtifact(summary.readerTiming.metrics, summary.readerTiming.thresholds),
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(performanceArtifactDir, "interaction-budget.md"),
    formatInteractionBudgetMarkdown(summary.readerTiming.metrics, summary.readerTiming.thresholds),
  );
  await writeFile(
    path.join(performanceArtifactDir, "budget-failures.md"),
    formatBudgetFailuresMarkdown(summary.readerTiming.thresholds),
  );
  await writeFile(
    path.join(performanceArtifactDir, "waiver-burndown.json"),
    `${JSON.stringify(summary.readerTiming.waiverBurndown, null, 2)}\n`,
  );
  await writeFile(
    path.join(performanceArtifactDir, "waiver-burndown.md"),
    formatLowResourceWaiverBurndownMarkdown(summary.readerTiming.waiverBurndown),
  );
  await writeFile(
    path.join(performanceArtifactDir, "fixture-coverage.json"),
    `${JSON.stringify(summary.fixtureCoverage ?? [], null, 2)}\n`,
  );
  await writeFile(
    path.join(performanceArtifactDir, "degraded-states.md"),
    formatPerformanceDegradedStates(summary.readerTiming.metrics.degradedStates),
  );
}

function formatPerformanceDegradedStates(degradedStates) {
  const lines = ["# Low-Resource Degraded States", ""];
  if (!degradedStates?.total) {
    lines.push("No degraded states were recorded.", "");
    return lines.join("\n");
  }
  lines.push(`Recorded degraded states: ${String(degradedStates.total)}`, "");
  for (const item of degradedStates.items ?? []) {
    const detail = Object.entries(item.detail ?? {})
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(", ");
    lines.push(`- ${item.name} (${item.surface}, ${item.kind}): ${detail || "recorded"}`);
  }
  lines.push("");
  return lines.join("\n");
}
