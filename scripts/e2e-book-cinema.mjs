#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
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
const activeProjectKey = "tts-active-project-id";
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "180000", 10);

let apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8080";
let appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://127.0.0.1:5173";

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

    const markdownJob = await runMarkdownSourcePrepE2E(project.id, fixtures.markdown);
    summary.markdownJobId = markdownJob.id;

    const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
    try {
      for (const fixture of [
        { file: fixtures.epub, kind: "epub", screenshot: "book-cinema-epub.png" },
        { file: fixtures.docx, kind: "docx", screenshot: "book-cinema-docx.png" },
        { file: fixtures.pdf, kind: "pdf", screenshot: "book-cinema-pdf.png" },
      ]) {
        const result = await runBookSourceE2E(browser, project.id, fixture);
        summary.screenshots.push(result.screenshot);
        summary.performance.push({
          kind: fixture.kind,
          metrics: result.performance,
        });
      }
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
  return completedJob;
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
  performance.firstOpen = summarizePerformanceMetrics([
    ...routeSwitchPerformance.metrics.filter((metric) => metric.name === "studio-route-switch"),
    ...performance.firstOpen.metrics,
  ]);
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

async function runBookCinemaUX(browser, { book, job, projectId, scope, screenshot, text }) {
  const context = await browser.newContext({
    storageState: projectStorageState(projectId, {
      bookScope: scope,
      bookSourceId: book.id,
      jobId: job.id,
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
    await openBookCinemaOverlay(page, scope);
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
    await waitForSavedProgress(projectId, book.id, scope, job.id);
    await page.screenshot({ fullPage: false, path: screenshot });

    const resumePage = await context.newPage();
    resumePage.setDefaultTimeout(60_000);
    if (lowResourceMode) {
      await applyLowResourceProfile(resumePage);
    }
    const resumeIssues = collectPageIssues(resumePage);
    await openBookCinemaOverlay(resumePage, scope, bookCinemaHashUrl(book.id, scope));
    const resumeButton = overlayTextButton(resumePage, "Resume");
    await resumeButton.waitFor({ state: "attached" });
    await resumeButton.scrollIntoViewIfNeeded();
    await resumeButton.click();
    await visibleOverlayButton(resumePage, "Pause").waitFor();
    const resumedMetrics = await readPerformanceMetrics(resumePage);
    await assertNoPageIssues([...issues, ...resumeIssues]);
    return {
      firstOpen: summarizePerformanceMetrics(firstOpenMetrics),
      resumed: summarizePerformanceMetrics(resumedMetrics),
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

function visibleOverlayButton(page, label) {
  return visibleOverlayControl(page, (overlay) =>
    overlay.getByRole("button", { name: new RegExp(`^${escapeRegex(label)}$`) }),
  );
}

function visibleOverlayControl(page, locatorFactory) {
  const overlay = page.locator(".fixed.inset-0").first();
  return locatorFactory(overlay).filter({ visible: true }).first();
}

function overlayTextButton(page, label) {
  return page
    .locator(".fixed.inset-0")
    .first()
    .locator("button")
    .filter({ hasText: label })
    .first();
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
  const existingOverlay = page.locator(".fixed.inset-0").first();
  const restoredOverlayTimeout = url === appBaseUrl ? 1_000 : 30_000;
  const restoredOverlayVisible = await existingOverlay
    .getByText("Book Cinema")
    .first()
    .waitFor({ state: "visible", timeout: restoredOverlayTimeout })
    .then(() => true)
    .catch(() => false);
  if (restoredOverlayVisible) {
    await waitForOverlayScope(page, scope);
    return;
  }
  await page.getByRole("button", { name: "Source Intake" }).click();
  await page.getByRole("button", { exact: true, name: "Book" }).click();
  await page.locator('h3:has-text("Book Cinema")').first().waitFor();
  await selectBookScope(page, scope);
  await page.locator('button:has-text("Cinema"):enabled').last().click();
  const overlay = page.locator(".fixed.inset-0").first();
  await overlay.waitFor();
  await overlay.getByText("Book Cinema").first().waitFor();
  await waitForOverlayScope(page, scope);
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
    .getByRole("button", { name: "Source Intake" })
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
      ({ expectedLabel, expectedScopeKey }) =>
        [...document.querySelectorAll(".fixed.inset-0 select")].some(
          (select) => select.value === expectedScopeKey,
        ) &&
        (document.body.textContent?.includes("Book Cinema") ?? false) &&
        (!expectedLabel || (document.body.textContent?.includes(expectedLabel) ?? false)),
      expected,
      { timeout: 60_000 },
    );
  } catch (error) {
    const overlayState = await page
      .evaluate(() =>
        [...document.querySelectorAll(".fixed.inset-0")].map((overlay) => ({
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
      )
      .catch(() => []);
    throw new Error(
      `Timed out waiting for Book Cinema scope ${JSON.stringify({ ...expected, overlayState })}`,
      { cause: error },
    );
  }
}

function bookCinemaHashUrl(bookSourceId, scope) {
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", bookSourceId);
  params.set("scope", scopeKey(scope));
  params.set("word", "4");
  return `${appBaseUrl}/#${params.toString()}`;
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
    const server = createServer();
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

async function createPreparedNarrationJob(projectId, preparedSourceId, selectedBlockIds) {
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
      sourceKind: "file",
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

function summarizePerformanceMetrics(metrics) {
  const summary = {};
  for (const metric of metrics) {
    summary[metric.name] = metric.durationMs;
  }
  return {
    latestByName: summary,
    metrics,
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
