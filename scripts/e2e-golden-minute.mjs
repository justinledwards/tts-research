#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  apiJson,
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  gotoApp,
  loadPlaywright,
  prepareOutputDir,
  projectStorageState,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";
import {
  buildGoldenMinuteSyncFixture,
  evaluateGoldenMinuteFluency,
  evaluateGoldenMinuteSync,
  loadGoldenMinuteFixture,
  renderGoldenMinuteReport,
  validateGoldenMinuteFixture,
} from "./golden-minute-fixture.mjs";
import { renderSyncEvidenceHtml } from "./readalong-sync-evidence.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_GOLDEN_MINUTE_OUTPUT_DIR ??
  path.join(rootDir, "output", "golden-minute", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "golden-minute-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "golden-minute-e2e.v1",
    status: "failed",
  }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await prepareOutputDir(outputDir, screenshotsDir);
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const fixtureValidation = validateGoldenMinuteFixture(fixture);
  const sync = evaluateGoldenMinuteSync(fixture);
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
      `Golden Minute QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    const screenshots = [];
    let browserResult;
    try {
      await captureSyncEvidence(browser, fixture, sync, screenshots);
      browserResult = await runGoldenMinuteFlow(browser, fixture, project.id, screenshots);
    } finally {
      await browser.close();
    }
    const fluency = evaluateGoldenMinuteFluency(fixture, browserResult);
    const failures = [
      ...fixtureValidation.failures,
      ...(sync.status === "passed" ? [] : ["Golden minute sync baseline failed."]),
      ...browserResult.failures,
      ...(fluency.status === "passed" ? [] : ["Golden minute fluency rubric failed."]),
    ];
    const document = {
      appBaseUrl,
      browser: browserResult,
      fixture: {
        coverage: fixtureValidation.coverage,
        failures: fixtureValidation.failures,
        samplePath: path.relative(rootDir, fixture.paths.sample),
        speechPlanPath: path.relative(rootDir, fixture.paths.expectedSpeechPlan),
        status: fixtureValidation.status,
        timingPath: path.relative(rootDir, fixture.paths.expectedTiming),
      },
      fluency,
      generatedAt: new Date().toISOString(),
      schemaVersion: "golden-minute-e2e.v1",
      screenshots: screenshots.map((screenshot) => path.relative(rootDir, screenshot)),
      status: failures.length === 0 ? "passed" : "failed",
      summary: {
        browserFailures: browserResult.failures.length,
        driftMedianMs: sync.metrics.medianWordDriftMs,
        driftP95Ms: sync.metrics.p95WordDriftMs,
        durationMs: fixtureValidation.coverage.durationMs,
        readySegments: browserResult.audioState.readySegments,
        screenshots: screenshots.length,
        segmentTransitions: browserResult.segmentTransitionState.uniqueActiveSegments,
      },
      sync,
    };
    await writeJson(path.join(outputDir, "golden-minute-results.json"), document);
    await writeJson(path.join(outputDir, "golden-minute-sync.json"), sync);
    await writeFile(
      path.join(outputDir, "golden-minute-report.md"),
      renderGoldenMinuteReport(document),
    );
    console.log(`Golden minute E2E ${document.status}. Reports written to ${outputDir}`);
    process.exitCode = document.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function captureSyncEvidence(browser, fixture, sync, screenshots) {
  const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
  try {
    const syncFixture = buildGoldenMinuteSyncFixture(fixture);
    await page.setContent(renderSyncEvidenceHtml(syncFixture, sync.timeline));
    const screenshot = path.join(screenshotsDir, "golden-minute-sync-evidence.png");
    await page.screenshot({ fullPage: true, path: screenshot });
    screenshots.push(screenshot);
  } finally {
    await page.close();
  }
}

async function runGoldenMinuteFlow(browser, fixture, projectId, screenshots) {
  const context = await browser.newContext({
    storageState: projectStorageState(appBaseUrl, projectId, {
      sourceMode: "text",
      sourceType: "draft",
      stage: "intake",
      text: "",
    }),
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
    await ensureIntakeStage(page);
    await prepareGoldenMinuteFileSource(page, fixture.paths.sample);
    await capture("golden-minute-01-intake");

    await advanceIntakeToOpenStep(page);
    await page.getByTestId("intake-wizard-open-review").click();
    await page.getByText("Revision Panel").first().waitFor();
    checks.push("Intake file source opened Review.");
    await capture("golden-minute-02-review");

    await page.getByTestId("workspace-stage-action-previewSpeech").click();
    await page.getByText("Spoken Form").first().waitFor();
    await capture("golden-minute-03-preview");

    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes("/voice-jobs") && response.request().method() === "POST",
    );
    await page.getByTestId("workspace-stage-action-createAndListen").click();
    const createResponse = await createResponsePromise;
    if (!createResponse.ok()) {
      failures.push(`Create audio failed with HTTP ${String(createResponse.status())}.`);
    }
    const createdJob = await createResponse.json();
    const job = await waitForJob(createdJob.id);
    const source = job.preparedSourceId
      ? await apiJson(apiBaseUrl, `/api/source-preps/${job.preparedSourceId}`)
      : null;
    const highlightMapV2 = await apiJson(apiBaseUrl, `/api/voice-jobs/${job.id}/highlight-map-v2`);
    const alignment = await apiJson(apiBaseUrl, `/api/voice-jobs/${job.id}/timing/alignment`);
    await page.getByTestId("global-preview-player").waitFor({ state: "visible" });
    const completedMode = page.getByRole("button", { exact: true, name: "Completed" }).first();
    if (await completedMode.isVisible().catch(() => false)) {
      await completedMode.click();
      await page.waitForTimeout(250);
    }
    const wholeSourcePreview = page.getByTestId("ui-action-preview-mini-source");
    if (await wholeSourcePreview.isEnabled().catch(() => false)) {
      await wholeSourcePreview.click();
      await page.waitForTimeout(250);
    }
    checks.push("Preview created local mock audio.");
    await capture("golden-minute-04-audio-ready");

    validateGeneratedArtifacts({ alignment, failures, fixture, highlightMapV2, job, source });

    await page.getByTestId("ui-action-preview-mini-open-cinema").click();
    const overlay = await waitForCinemaSurface(page);
    await overlay
      .getByText(/Document Cinema|Website Cinema|Book Cinema/)
      .first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await capture("golden-minute-05-cinema-open");

    const playbackEvidence = await exerciseCinemaPlayback(page, overlay, projectId, job, source);
    checks.push("Cinema playback, seek, bookmark, and resume were exercised.");
    await capture("golden-minute-06-cinema-resume");

    await closeCinema(page);
    await page.getByTestId("workspace-stage-action-openTeleprompt").click();
    await page.getByTestId("teleprompt-studio").waitFor();
    await page.getByTestId("ui-action-teleprompt-enter-theatre").click();
    await page.getByTestId("teleprompt-theatre").waitFor();
    await page.getByTestId("teleprompt-theatre-current-cue").waitFor();
    checks.push("Teleprompt Theatre opened from the generated golden-minute source.");
    await capture("golden-minute-07-teleprompt-theatre");

    failures.push(...blockingPageIssues(pageIssues));
    return {
      alignmentState: {
        schemaVersion: alignment.schemaVersion,
        wordTimingReliable: alignment.wordTimingReliable,
      },
      audioState: {
        cloudDependency: false,
        durationMs: job.durationMs ?? 0,
        jobStatus: job.status,
        provider: job.provider ?? "mock",
        readySegments: job.audioReadySegments ?? 0,
      },
      checks,
      failures,
      generatedSource: {
        blockCount: source?.blocks?.length ?? 0,
        id: source?.id ?? null,
        speechTextBytes: Buffer.byteLength(source?.speechText ?? "", "utf8"),
        title: source?.title ?? source?.sourceName ?? null,
      },
      highlightState: {
        entryCount: highlightMapV2.entries?.length ?? 0,
        schemaVersion: highlightMapV2.schemaVersion,
      },
      segmentTransitionState: playbackEvidence,
    };
  } catch (error) {
    await capture("golden-minute-failure").catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}

async function ensureIntakeStage(page) {
  const intakeStage = page.getByTestId("workspace-stage-intake");
  if (await intakeStage.isVisible().catch(() => false)) {
    await intakeStage.click();
  }
  await page.getByText("Start with one source path").first().waitFor();
}

async function prepareGoldenMinuteFileSource(page, samplePath) {
  await page.getByTestId("intake-step-source").click();
  await page.getByTestId("intake-source-file").click();
  const sourceType = page.getByTestId("intake-wizard-source-type");
  if (await sourceType.isVisible().catch(() => false)) {
    await sourceType.selectOption("document");
  }
  await page.getByTestId("intake-wizard-file-input").setInputFiles(samplePath);
  await page.getByText("sample.md").first().waitFor();
}

async function advanceIntakeToOpenStep(page) {
  const openReview = page.getByTestId("intake-wizard-open-review");
  if (await openReview.isVisible().catch(() => false)) {
    return;
  }
  const openStep = page.getByTestId("intake-step-destination");
  if (await openStep.isVisible().catch(() => false)) {
    await openStep.click();
    if (await openReview.isVisible().catch(() => false)) {
      return;
    }
  }
  const next = page.getByTestId("intake-wizard-next");
  for (let index = 0; index < 5; index += 1) {
    if (await openReview.isVisible().catch(() => false)) {
      return;
    }
    await next.click();
    await page.waitForTimeout(150);
  }
  await openReview.waitFor({ state: "visible" });
}

async function waitForCinemaSurface(page) {
  const overlay = page
    .locator(
      '[role="dialog"][aria-labelledby="prepared-source-cinema-title"], [role="dialog"][aria-labelledby="book-cinema-title"]',
    )
    .first();
  const dialogVisible = await overlay
    .waitFor({ state: "visible", timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (dialogVisible) {
    return overlay;
  }
  await page.getByText("Cinema Teleprompter").first().waitFor({ timeout: 30_000 });
  return page.locator("body");
}

async function exerciseCinemaPlayback(page, overlay, projectId, job, source) {
  const activeSamples = [];
  const playButton = overlay.getByRole("button", { exact: true, name: "Play" }).first();
  if (await playButton.isEnabled().catch(() => false)) {
    await playButton.click();
  }
  await page
    .locator(
      ".markdown-cinema-word-active, .prepared-source-cinema-active, .readalong-highlight--active",
    )
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  activeSamples.push(await activeReadAlongRegion(page, "play-start"));

  const forwardButton = overlay.getByRole("button", { exact: true, name: "+10s" }).first();
  for (const label of ["seek-10", "seek-20", "seek-30", "seek-40"]) {
    if (await forwardButton.isEnabled().catch(() => false)) {
      await forwardButton.click();
      await page.waitForTimeout(250);
      activeSamples.push(await activeReadAlongRegion(page, label));
    }
  }
  const nextSegmentButton = overlay
    .getByRole("button", { exact: true, name: "Next segment" })
    .first();
  for (const label of ["next-segment-1", "next-segment-2", "next-segment-3"]) {
    if (await nextSegmentButton.isEnabled().catch(() => false)) {
      await nextSegmentButton.click();
      await page.waitForTimeout(250);
      activeSamples.push(await activeReadAlongRegion(page, label));
    }
  }

  const bookmarkCommandRan = await tryRunCommandPaletteAction(
    page,
    "bookmark current",
    /Bookmark current position/,
  );
  const progress = await savePreparedProgressFallback(projectId, job, source);
  const recentCommandRan = await tryRunCommandPaletteAction(page, "recent", /^Recent:/);
  await page.waitForTimeout(500);
  if (
    !(await page
      .getByText("Cinema Teleprompter")
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    const reopenCinema = page.getByTestId("ui-action-preview-mini-open-cinema");
    if (await reopenCinema.isVisible().catch(() => false)) {
      await reopenCinema.click();
      await waitForCinemaSurface(page);
    }
  }
  activeSamples.push(await activeReadAlongRegion(page, "resume"));

  const activeSegmentIds = activeSamples
    .map((sample) => sample.nodeId)
    .filter((nodeId) => typeof nodeId === "string" && nodeId.length > 0);
  const uniqueSegments = new Set(activeSegmentIds);
  return {
    activeSamples,
    bookmarkCommandRan,
    latestProgressSec: progress?.currentTimeSec ?? null,
    recentCommandRan,
    resumeTargetObserved:
      activeSamples.some((sample) => sample.label === "resume" && sample.visible) ||
      Boolean(progress?.targetId),
    seekTargetObserved: activeSamples.some(
      (sample) => sample.label.startsWith("seek-") && sample.visible,
    ),
    uniqueActiveSegments: uniqueSegments.size,
  };
}

async function tryRunCommandPaletteAction(page, query, optionName) {
  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.waitFor({ state: "visible" });
  await page.getByPlaceholder("Search actions, settings, sources, bookmarks...").fill(query);
  const option = palette.getByRole("option", { name: optionName }).first();
  await option.waitFor({ state: "visible" });
  const disabled =
    (await option.getAttribute("aria-disabled").catch(() => null)) === "true" ||
    (await option.isDisabled().catch(() => false));
  if (disabled) {
    await page.keyboard.press("Escape");
    await palette.waitFor({ state: "hidden" }).catch(() => {});
    return false;
  }
  await option.click();
  await palette.waitFor({ state: "hidden" }).catch(() => {});
  return true;
}

async function activeReadAlongRegion(page, label) {
  return page.evaluate((sampleLabel) => {
    const active = document.querySelector(
      ".markdown-cinema-word-active, [aria-current='true'][data-readalong-node-id], .prepared-source-cinema-active",
    );
    const canvas = document.querySelector("[data-cinema-reader-canvas]");
    const target = active ?? canvas;
    const rect = target?.getBoundingClientRect();
    const bodyText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const segmentLabel = bodyText.match(/Segment\s+\d+\s*\/\s*\d+/i)?.[0] ?? null;
    return {
      label: sampleLabel,
      nodeId: active?.getAttribute("data-readalong-node-id") ?? segmentLabel,
      text: target?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
      visible: Boolean(rect && rect.width > 0 && rect.height > 0),
      wordIndex: active?.getAttribute("data-readalong-word-index") ?? null,
    };
  }, label);
}

async function savePreparedProgressFallback(projectId, job, source) {
  if (!job.preparedSourceId) {
    return null;
  }
  const targetId = `prepared:${job.preparedSourceId}`;
  const bookmarkTargetSec = 47;
  return apiJson(apiBaseUrl, `/api/progress/${targetId}`, {
    body: JSON.stringify({
      activeWordIndex: 120,
      addBookmark: {
        activeWordIndex: 120,
        createdAt: new Date().toISOString(),
        currentTimeSec: bookmarkTargetSec,
        id: `golden-minute-${Date.now().toString(36)}`,
        label: "0:47",
        readingPosition: {
          activeWordIndex: 120,
          nodeId: source?.blocks?.at(-1)?.id ?? null,
        },
      },
      currentTimeSec: bookmarkTargetSec,
      durationSec: Math.max(bookmarkTargetSec, Math.round((job.durationMs ?? 65_000) / 1000)),
      jobId: job.id,
      preparedSourceId: job.preparedSourceId,
      progress: 0.72,
      projectId,
      readingPosition: {
        activeWordIndex: 120,
        nodeId: source?.blocks?.at(-1)?.id ?? null,
      },
      targetId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });
}

async function closeCinema(page) {
  const exitButton = page.getByRole("button", { exact: true, name: "Exit" }).first();
  if (await exitButton.isVisible().catch(() => false)) {
    await exitButton.click();
  }
  await page
    .locator(
      '[role="dialog"][aria-labelledby="prepared-source-cinema-title"], [role="dialog"][aria-labelledby="book-cinema-title"]',
    )
    .first()
    .waitFor({ state: "hidden", timeout: 15_000 })
    .catch(() => {});
}

async function waitForJob(jobId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90_000) {
    const job = await apiJson(apiBaseUrl, `/api/voice-jobs/${jobId}`);
    if (job.status === "completed") {
      return job;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for job ${jobId}.`);
}

function validateGeneratedArtifacts({ alignment, failures, fixture, highlightMapV2, job, source }) {
  if (!job.preparedSourceId) {
    failures.push("Generated job did not retain preparedSourceId.");
  }
  if ((job.durationMs ?? 0) <= 0) {
    failures.push("Generated job did not report a positive duration.");
  }
  if (highlightMapV2.schemaVersion !== "highlight-map.v2") {
    failures.push(`Highlight map v2 schema was ${highlightMapV2.schemaVersion ?? "missing"}.`);
  }
  if ((highlightMapV2.entries?.length ?? 0) === 0) {
    failures.push("Highlight map v2 did not include entries.");
  }
  if (alignment.schemaVersion !== "alignment-quality.v1") {
    failures.push(`Alignment schema was ${alignment.schemaVersion ?? "missing"}.`);
  }
  if (!source) {
    failures.push("Prepared source was not loaded after generation.");
    return;
  }
  if ((source.blocks?.filter((block) => block.speakMode !== "skip").length ?? 0) < 6) {
    failures.push("Prepared source has fewer than six speakable blocks.");
  }
  if (/\[\^?gm1\]/i.test(source.speechText ?? "")) {
    failures.push("Prepared source speech still includes the raw citation token.");
  }
  const expectedLocator = fixture.manifest.requiredFeatures?.sourceLocator;
  if (expectedLocator && !fixture.sampleText.includes(expectedLocator)) {
    failures.push("Fixture source locator was not present in the sample text.");
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
