import { join, relative } from "node:path";
import path from "node:path";

import {
  blockingPageIssues,
  collectPageIssues,
  gotoApp,
  projectStorageState,
} from "./e2e-browser-qa-helpers.mjs";
import { buildGoldenMinuteSyncFixture, renderSyncEvidenceHtml } from "./golden-minute-fixture.mjs";

export function readPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function slugArtifactName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

export async function captureSyncEvidence(browser, fixture, sync, screenshots, options) {
  const { screenshotsDir } = options;
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

export async function runGoldenMinuteFlow(browser, fixture, projectId, screenshots, options = {}) {
  const {
    apiBaseUrl,
    appBaseUrl,
    rootDir,
    outputDir,
    screenshotsDir,
    visualTimelineScreenshotsDir,
    videosDir,
    sampleCount,
    sampleIntervalMs,
    traceCaptureEnabled,
  } = options;
  const traceArtifacts = {
    enabled: Boolean(traceCaptureEnabled),
    sampleCount: sampleCount ?? 0,
    sampleIntervalMs: sampleIntervalMs ?? 0,
    sampledScreenshotDir: traceCaptureEnabled
      ? relative(rootDir, visualTimelineScreenshotsDir)
      : null,
    tracePath: traceCaptureEnabled
      ? relative(rootDir, path.join(outputDir, "golden-minute-trace.zip"))
      : null,
    videoPath: null,
  };
  const context = await browser.newContext({
    recordVideo: traceCaptureEnabled
      ? {
          dir: videosDir,
          size: { height: 960, width: 1440 },
        }
      : undefined,
    storageState: projectStorageState(appBaseUrl, projectId, {
      sourceMode: "text",
      sourceType: "draft",
      stage: "intake",
      text: "",
    }),
    viewport: { height: 960, width: 1440 },
  });
  let page;
  let result;
  if (traceCaptureEnabled) {
    await context.tracing.start({
      screenshots: true,
      snapshots: true,
      sources: true,
    });
  }
  page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const pageIssues = collectPageIssues(page);
  const checks = [];
  const failures = [];
  const capture = async (name) => {
    const screenshot = join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };
  const sampleHelpers = {
    rootDir,
    traceCaptureEnabled,
    visualTimelineScreenshotsDir,
    sampleCount,
    sampleIntervalMs: sampleIntervalMs / 1000,
    apiBaseUrl,
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
    const job = await waitForJob(createdJob.id, apiBaseUrl);
    const source = job.preparedSourceId
      ? await apiJson(apiBaseUrl, `/api/source-preps/${job.preparedSourceId}`)
      : null;
    const audioBuffer = await apiArrayBuffer(
      apiBaseUrl,
      job.audioUrl || `/api/voice-jobs/${job.id}/audio`,
    );
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

    const playbackEvidence = await exerciseCinemaPlayback(
      page,
      overlay,
      projectId,
      job,
      source,
      sampleHelpers,
    );
    checks.push("Cinema playback, seek, bookmark, and resume were exercised.");
    await capture("golden-minute-06-cinema-resume");

    await closeCinema(page);
    await page.getByTestId("workspace-stage-action-openTeleprompt").click();
    await page.getByTestId("teleprompt-studio").waitFor();
    await page.getByTestId("ui-action-teleprompt-enter-theatre").click();
    await page.getByTestId("teleprompt-theatre").waitFor();
    await page.getByTestId("teleprompt-theatre-current-cue").waitFor();
    checks.push("Teleprompt Theatre opened from the generated golden-minute source.");
    await capture("golden-minute-07-theatre");

    failures.push(...blockingPageIssues(pageIssues));
    result = {
      alignmentState: {
        schemaVersion: alignment.schemaVersion,
        wordTimingReliable: alignment.wordTimingReliable,
      },
      artifactIdentity: goldenMinuteRuntimeArtifactIdentity({
        alignment,
        highlightMapV2,
        job,
        source,
      }),
      audioState: {
        audioBuffer,
        cloudDependency: false,
        durationMs: job.durationMs ?? 0,
        job,
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
      traceArtifacts,
    };
  } catch (error) {
    await capture("golden-minute-failure").catch(() => {});
    throw error;
  } finally {
    if (traceCaptureEnabled) {
      await context.tracing
        .stop({ path: path.join(outputDir, "golden-minute-trace.zip") })
        .catch(() => {});
    }
    const video = page?.video?.();
    await context.close();
    if (video) {
      const videoPath = await video.path().catch(() => null);
      if (videoPath) {
        traceArtifacts.videoPath = relative(rootDir, videoPath);
      }
    }
  }
  return result;
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
  await page.getByTestId("intake-wizard-file-input").setInputFiles(samplePath);
  if (await sourceType.isVisible().catch(() => false)) {
    await sourceType.selectOption("document");
  }
  await page.getByText("sample.md").first().waitFor();
}

async function advanceIntakeToOpenStep(page) {
  const openReview = page.getByTestId("intake-wizard-open-review");
  if (await openReview.isVisible().catch(() => false)) {
    return;
  }
  const openStep = page.getByTestId("intake-wizard-destination");
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

async function exerciseCinemaPlayback(page, overlay, projectId, job, source, sampleHelpers) {
  const {
    apiBaseUrl,
    rootDir,
    sampleCount,
    sampleIntervalMs = 0,
    traceCaptureEnabled,
    visualTimelineScreenshotsDir,
  } = sampleHelpers;
  const activeSamples = [];
  const startedAt = Date.now();
  const collectSample = async (label, options = {}) => {
    const sample = await activeReadAlongRegion(page, label, {
      elapsedMs: Date.now() - startedAt,
    });
    if (traceCaptureEnabled && options.screenshot !== false) {
      const screenshot = join(
        visualTimelineScreenshotsDir,
        `${String(activeSamples.length + 1).padStart(2, "0")}-${slugArtifactName(label)}.png`,
      );
      await page.screenshot({ fullPage: false, path: screenshot });
      sample.screenshot = relative(rootDir, screenshot);
    }
    activeSamples.push(sample);
    return sample;
  };
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
  await collectSample("play-start");
  if (traceCaptureEnabled) {
    for (let index = 0; index < sampleCount; index += 1) {
      await page.waitForTimeout(Math.round(sampleIntervalMs));
      await collectSample(`sample-${String(index + 1)}-${String(sampleIntervalMs / 1000)}s`);
    }
  }

  const forwardButton = overlay.getByRole("button", { exact: true, name: "+10s" }).first();
  for (const label of ["seek-10", "seek-20", "seek-30", "seek-40"]) {
    if (await forwardButton.isEnabled().catch(() => false)) {
      await forwardButton.click();
      await page.waitForTimeout(250);
      await collectSample(label);
    }
  }
  const speedChangeObserved = await tryChangePlaybackSpeed(page, "1.25");
  await page.waitForTimeout(250);
  await collectSample(speedChangeObserved ? "speed-change-1.25x" : "speed-change-unavailable");
  const nextSegmentButton = overlay
    .getByRole("button", { exact: true, name: "Next segment" })
    .first();
  for (const label of ["next-segment-1", "next-segment-2", "next-segment-3"]) {
    if (await nextSegmentButton.isEnabled().catch(() => false)) {
      await nextSegmentButton.click();
      await page.waitForTimeout(250);
      await collectSample(label);
    }
  }

  const bookmarkCommandRan = await tryRunCommandPaletteAction(
    page,
    "bookmark current",
    /Bookmark current position/,
  );
  const progress = await savePreparedProgressFallback(projectId, job, source, apiBaseUrl);
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
  await collectSample("resume");

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
    speedChangeObserved,
    uniqueActiveSegments: uniqueSegments.size,
  };
}

async function tryChangePlaybackSpeed(page, value) {
  const speed = page
    .locator('select[data-testid="ui-action-cinema-playback-speed"]:visible')
    .first();
  if (!(await speed.isVisible().catch(() => false))) {
    return false;
  }
  if (!(await speed.isEnabled().catch(() => false))) {
    return false;
  }
  await speed.selectOption(value).catch(() => null);
  return (await speed.inputValue().catch(() => "")) === value;
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

async function activeReadAlongRegion(page, label, options = {}) {
  return page.evaluate(
    ({ elapsedMs, sampleLabel }) => {
      const active = document.querySelector(
        ".markdown-cinema-word-active, [aria-current='true'][data-readalong-node-id], .prepared-source-cinema-active",
      );
      const phrase = document.querySelector(
        ".readalong-highlight--phrase, [data-readalong-visual-mode='phrase']",
      );
      const audio = document.querySelector("audio");
      const canvas = document.querySelector("[data-cinema-reader-canvas]");
      const target = active ?? canvas;
      const rect = target?.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const bodyText = document.body.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const segmentLabel = bodyText.match(/Segment\s+\d+\s*\/\s*\d+/i)?.[0] ?? null;
      const visible = Boolean(
        rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= viewportHeight &&
          rect.left <= viewportWidth,
      );
      return {
        audioPaused: audio ? audio.paused : null,
        audioTimeSec: audio ? audio.currentTime : null,
        elapsedMs,
        highlightMode:
          active?.getAttribute("data-readalong-visual-mode") ??
          phrase?.getAttribute("data-readalong-visual-mode") ??
          (active ? "word" : "none"),
        label: sampleLabel,
        nodeId: active?.getAttribute("data-readalong-node-id") ?? segmentLabel,
        phraseText: phrase?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) ?? null,
        playbackRate: audio ? audio.playbackRate : null,
        rect: rect
          ? {
              bottom: Math.round(rect.bottom),
              height: Math.round(rect.height),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              top: Math.round(rect.top),
              width: Math.round(rect.width),
            }
          : null,
        scroll: {
          documentHeight: document.documentElement.scrollHeight,
          viewportHeight,
          x: Math.round(window.scrollX),
          y: Math.round(window.scrollY),
        },
        text: target?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? "",
        visible,
        wordIndex: active?.getAttribute("data-readalong-word-index") ?? null,
      };
    },
    { elapsedMs: options.elapsedMs ?? null, sampleLabel: label },
  );
}

async function savePreparedProgressFallback(projectId, job, source, apiBaseUrl) {
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

async function waitForJob(jobId, apiBaseUrl) {
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

async function apiArrayBuffer(apiBaseUrl, pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.arrayBuffer();
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

function goldenMinuteRuntimeArtifactIdentity({ alignment, highlightMapV2, job, source }) {
  const sourceRevisionId = source
    ? `prepared-source:${source.id}:${source.updatedAt ?? source.createdAt ?? "unknown"}`
    : `prepared-source:missing:${job.updatedAt ?? job.createdAt ?? "unknown"}`;
  const generatedAudioId = highlightMapV2.generatedAudioId ?? job.id;
  const speechPlanId = highlightMapV2.speechPlanId ?? job.id;
  return {
    alignmentMapId:
      alignment?.schemaVersion && job.id ? `${job.id}:alignment:${alignment.schemaVersion}` : null,
    generatedAudioId,
    highlightMapId: `${generatedAudioId}:highlight-map-v2:${highlightMapV2.generatedAt ?? "latest"}`,
    policyProfileId: job.speechPolicyProfile || "default",
    sourceRevisionId,
    speechPlanId,
    voiceProfileId: job.voiceProfileId || job.voiceId || job.ttsVoice || job.voice || "default",
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function apiJson(baseUrl, pathname, init = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.json();
}
