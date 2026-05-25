#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  apiJson,
  blockingPageIssues,
  collectPageIssues,
  createQaProject,
  loadPlaywright,
  prepareOutputDir,
  projectStorageState,
  startLocalServices,
  writeJson,
} from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_READ_ALONG_OUTPUT_DIR ??
  path.join(rootDir, "output", "read-along-fidelity", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");
const useExistingServers = process.env.E2E_USE_EXISTING_SERVERS === "1";

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await writeJson(path.join(outputDir, "read-along-fidelity-results.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "read-along-fidelity-e2e.v1",
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
    const fixtureCoverage = await validateFixtureManifest();
    const project = await createQaProject(
      apiBaseUrl,
      `Read-along Fidelity QA ${new Date().toISOString()}`,
    );
    const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    let browserResult;
    try {
      browserResult = await runBrowserFidelitySmoke(browser, project.id);
    } finally {
      await browser.close();
    }
    const result = {
      appBaseUrl,
      browser: browserResult,
      fixtureCoverage,
      generatedAt: new Date().toISOString(),
      schemaVersion: "read-along-fidelity-e2e.v1",
      status: browserResult.failures.length === 0 ? "passed" : "failed",
      summary: {
        browserFailures: browserResult.failures.length,
        fixtureKinds: fixtureCoverage.requiredKindsCovered.length,
        screenshots: browserResult.screenshots.length,
        staticFixtures: fixtureCoverage.fixtures.length,
      },
    };
    await writeJson(path.join(outputDir, "read-along-fidelity-results.json"), result);
    await writeFile(path.join(outputDir, "read-along-fidelity-report.md"), renderReport(result));
    console.log(`Read-along fidelity E2E ${result.status}. Reports written to ${outputDir}`);
    process.exitCode = result.status === "passed" ? 0 : 1;
  } finally {
    if (services) {
      await services.stop();
    }
  }
}

async function runBrowserFidelitySmoke(browser, projectId) {
  const scope = { label: "Full book", type: "book" };
  const book = await uploadBook(
    projectId,
    path.join(rootDir, "fixtures", "read-along-fidelity", "markdown-citations.md"),
  );
  assert(book.id, "Book upload did not return an id.");
  assert((book.wordSpans?.length ?? 0) > 8, "Book fixture did not produce enough word spans.");
  const job = await createBookNarrationJob(projectId, book.id, scope);
  const completedJob = await waitForJob(job.id);
  const progress = await saveProgressWithBookmark(projectId, book.id, scope, completedJob.id);
  const context = await browser.newContext({
    storageState: projectStorageState(appBaseUrl, projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      jobId: completedJob.id,
      readingPosition: progress.readingPosition,
      sourceMode: "book",
      sourceType: "book",
      stage: "intake",
      text: "",
    }),
    viewport: { height: 960, width: 1440 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const issues = collectPageIssues(page);
  const failures = [];
  const screenshots = [];
  const capture = async (name) => {
    const screenshot = path.join(screenshotsDir, `${name}.png`);
    await page.screenshot({ fullPage: false, path: screenshot });
    screenshots.push(screenshot);
  };

  try {
    const overlay = await openBookCinemaOverlay(
      page,
      scope,
      bookCinemaHashUrl(book.id, scope, completedJob.id),
      issues,
    );
    const playButton = overlay.getByRole("button", { exact: true, name: "Play" }).first();
    if (await playButton.isVisible().catch(() => false)) {
      await playButton.click();
    }
    await page.locator("[data-cinema-reader-canvas]").first().waitFor();
    await capture("book-cinema-read-along-open");
    const activeRegion = await activeReaderRegion(page);
    if (!activeRegion.visible) {
      failures.push("Active word locator did not resolve to a visible reader region.");
    }
    if (activeRegion.wordIndex !== null && activeRegion.wordIndex !== 4) {
      failures.push(`Expected active word 4, saw ${String(activeRegion.wordIndex)}.`);
    }

    await overlay.getByTestId("ui-action-cinema-advanced-menu").click();
    await overlay.getByTestId("ui-action-cinema-advanced-diagnostics").click();
    await overlay.getByText("Read-along fidelity").first().waitFor();
    await overlay
      .getByText(/Read-along aligned|Read-along source/)
      .first()
      .waitFor();
    await capture("book-cinema-read-along-debug");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.locator('[role="dialog"][aria-labelledby="book-cinema-title"]').first().waitFor();
    await page.locator("[data-cinema-reader-canvas]").first().waitFor();
    const resumedRegion = await activeReaderRegion(page);
    if (
      !resumedRegion.visible ||
      (resumedRegion.wordIndex !== null && resumedRegion.wordIndex !== 4)
    ) {
      failures.push("Recent-position resume did not reattach to the same source/scope.");
    }
    await capture("book-cinema-read-along-resume");

    const savedProgressItems = await apiJson(apiBaseUrl, `/api/projects/${projectId}/progress`);
    const savedProgress =
      savedProgressItems.find((item) => item.targetId === progress.targetId) ?? progress;
    const bookmark = savedProgress.bookmarks?.[0];
    if (bookmark?.readingPosition?.bookSourceId !== book.id) {
      failures.push("Bookmark did not persist the active book source id.");
    }
    if (bookmark?.readingPosition?.scopeKey !== "book") {
      failures.push("Bookmark did not persist the active scope key.");
    }
    failures.push(...blockingPageIssues(issues));
    return {
      activeRegion,
      bookmarkCount: savedProgress.bookmarks?.length ?? 0,
      failures,
      progressTargetId: progress.targetId,
      resumedSourceId: savedProgress.bookSourceId,
      screenshots,
    };
  } finally {
    await context.close();
  }
}

async function openBookCinemaOverlay(page, scope, url = appBaseUrl, issues = []) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  if (url !== appBaseUrl) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
  }
  const overlay = page.locator('[role="dialog"][aria-labelledby="book-cinema-title"]').first();
  const restored = await overlay
    .waitFor({ state: "visible", timeout: url === appBaseUrl ? 1_000 : 30_000 })
    .then(() => true)
    .catch(() => false);
  if (restored) {
    return overlay;
  }

  const intakeButton = page.getByRole("button", { exact: true, name: "Intake" });
  const intakeVisible = await intakeButton
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  if (!intakeVisible) {
    const diagnostics = await page.evaluate(() => ({
      bodyText: document.body.textContent?.replace(/\s+/g, " ").trim().slice(0, 600) ?? "",
      buttons: [...document.querySelectorAll("button")]
        .map((button) => button.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter(Boolean)
        .slice(0, 30),
      title: document.title,
    }));
    throw new Error(
      `Unable to open Intake fallback: ${JSON.stringify({ ...diagnostics, issues })}`,
    );
  }
  await intakeButton.click();
  await page.getByText("Guided Intake").first().waitFor();
  await page.getByTestId("intake-step-destination").click();
  await selectBookScope(page, scope);
  await page.getByTestId("intake-wizard-open-book-cinema").click();
  await overlay.waitFor({ state: "visible" });
  return overlay;
}

async function selectBookScope(page, scope) {
  const key = scopeKey(scope);
  const select = page.locator(`select:has(option[value="${key}"])`).first();
  await select.waitFor({ state: "visible", timeout: 15_000 });
  await select.selectOption(key);
}

async function validateFixtureManifest() {
  const manifestPath = path.join(rootDir, "fixtures", "read-along-fidelity", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const baseDir = path.dirname(manifestPath);
  const fixtures = [];
  for (const fixture of manifest.fixtures ?? []) {
    const absolutePath = path.resolve(baseDir, fixture.path);
    const content = await readFile(absolutePath, "utf8");
    fixtures.push({
      bytes: Buffer.byteLength(content),
      id: fixture.id,
      kind: fixture.kind,
      path: path.relative(rootDir, absolutePath),
      present: content.length > 0,
    });
  }
  const requiredKinds = ["epub", "docx", "pdf", "markdown", "website"];
  const kinds = new Set(
    fixtures.filter((fixture) => fixture.present).map((fixture) => fixture.kind),
  );
  const missingKinds = requiredKinds.filter((kind) => !kinds.has(kind));
  assert(missingKinds.length === 0, `Missing read-along fixture kinds: ${missingKinds.join(", ")}`);
  return {
    fixtures,
    manifestPath: path.relative(rootDir, manifestPath),
    requiredKindsCovered: requiredKinds,
  };
}

async function uploadBook(projectId, filePath) {
  const bytes = await readFile(filePath);
  const body = new FormData();
  body.set("file", new Blob([bytes], { type: "text/markdown" }), path.basename(filePath));
  return apiJson(apiBaseUrl, `/api/projects/${projectId}/book-sources`, {
    body,
    method: "POST",
  });
}

async function createBookNarrationJob(projectId, bookSourceId, bookScope) {
  return apiJson(apiBaseUrl, `/api/book-sources/${bookSourceId}/voice-jobs`, {
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
  while (Date.now() - startedAt < 60_000) {
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

async function saveProgressWithBookmark(projectId, bookSourceId, bookScope, jobId) {
  const targetId = `book:${bookSourceId}:${scopeKey(bookScope)}`;
  return apiJson(apiBaseUrl, `/api/progress/${targetId}`, {
    body: JSON.stringify({
      activeWordIndex: 4,
      addBookmark: {
        activeWordIndex: 4,
        createdAt: new Date().toISOString(),
        currentTimeSec: 4,
        id: `read-along-bookmark-${Date.now().toString(36)}`,
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
      progress: 0.2,
      projectId,
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

function bookCinemaHashUrl(bookSourceId, scope, jobId) {
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", bookSourceId);
  params.set("scope", scopeKey(scope));
  params.set("word", "4");
  const url = new URL(appBaseUrl);
  url.searchParams.set("jobId", jobId);
  url.hash = params.toString();
  return url.toString();
}

async function activeReaderRegion(page) {
  return page.evaluate(() => {
    const active = document.querySelector(
      ".book-cinema-word-active, .book-cinema-word-phrase, .markdown-cinema-word-active",
    );
    if (!active) {
      const canvas = document.querySelector("[data-cinema-reader-canvas]");
      const rect = canvas?.getBoundingClientRect();
      return {
        text: canvas?.textContent?.trim().slice(0, 80) ?? "",
        visible: Boolean(rect && rect.width > 0 && rect.height > 0),
        wordIndex: null,
      };
    }
    const rect = active.getBoundingClientRect();
    const canvas = active.closest("[data-cinema-reader-canvas]");
    const canvasRect = canvas?.getBoundingClientRect();
    const visible =
      rect.width > 0 &&
      rect.height > 0 &&
      (!canvasRect ||
        (rect.bottom >= canvasRect.top &&
          rect.top <= canvasRect.bottom &&
          rect.right >= canvasRect.left &&
          rect.left <= canvasRect.right));
    const rawWordIndex =
      active instanceof HTMLElement ? active.getAttribute("data-book-word") : null;
    return {
      text: active.textContent?.trim() ?? "",
      visible,
      wordIndex: rawWordIndex ? Number(rawWordIndex) : null,
    };
  });
}

function renderReport(result) {
  const lines = [
    "# Read-along Fidelity Report",
    "",
    `Status: **${result.status.toUpperCase()}**`,
    "",
    "## Browser Checks",
    "",
    `- Screenshots: ${String(result.browser.screenshots.length)}`,
    `- Bookmark count: ${String(result.browser.bookmarkCount)}`,
    `- Active word visible: ${String(result.browser.activeRegion.visible)}`,
    `- Progress target: \`${result.browser.progressTargetId}\``,
    "",
    "## Fixture Coverage",
    "",
    ...result.fixtureCoverage.fixtures.map(
      (fixture) =>
        `- ${fixture.kind}: \`${fixture.path}\` (${fixture.bytes.toLocaleString()} bytes)`,
    ),
  ];
  if (result.browser.failures.length > 0) {
    lines.push("", "## Failures", "", ...result.browser.failures.map((failure) => `- ${failure}`));
  }
  lines.push("");
  return lines.join("\n");
}

function scopeKey(scope) {
  if (scope.type === "chapter") {
    return `chapter:${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    return `pages:${String(scope.pageStart ?? 1)}-${String(scope.pageEnd ?? scope.pageStart ?? 1)}`;
  }
  return "book";
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
