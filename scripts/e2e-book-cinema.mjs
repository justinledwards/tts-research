#!/usr/bin/env node

import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? "http://localhost:8080";
const appBaseUrl = process.env.E2E_APP_BASE_URL ?? "http://localhost:5173";
const screenshotsDir = process.env.E2E_SCREENSHOT_DIR ?? path.join(rootDir, "output", "playwright");
const projectName = `Book Cinema E2E ${new Date().toISOString()}`;
const activeProjectKey = "tts-active-project-id";
const deepResearchReportFixture = path.join(rootDir, "demo", "deep-research-report.md");
const jobTimeoutMs = Number.parseInt(process.env.E2E_JOB_TIMEOUT_MS ?? "300000", 10);

const fixtures = [
  {
    kind: "epub",
    file: path.join(rootDir, "demo", "pg84-images-3.epub"),
    screenshot: "tts-research-book-cinema-epub.png",
    scopeFor(book) {
      const chapter =
        book.chapters?.find((item) => wordCount(item.text ?? "") >= 40) ?? book.chapters?.[0];
      assert(chapter, "EPUB import did not expose chapters.");
      return {
        type: "chapter",
        chapterIndex: chapter.index,
        label: chapter.title || `Chapter ${String(chapter.index)}`,
      };
    },
    verify(book) {
      assert(book.status === "ready", `EPUB source is not ready: ${book.status}`);
      assert((book.chapters?.length ?? 0) > 0, "EPUB source has no chapters.");
      assert((book.wordSpans?.length ?? 0) > 0, "EPUB source has no word spans.");
    },
  },
  {
    kind: "epub",
    file: path.join(rootDir, "demo", "_OceanofPDF.com_Project_Hail_Mary_-_y_Weir.epub"),
    skipNarration: true,
    screenshot: "tts-research-book-cinema-hail-mary-epub.png",
    scopeFor(book) {
      const section =
        book.sections?.find((item) => item.title === "Chapter 1" && item.isNarratable) ??
        book.sections?.find((item) => item.isNarratable);
      assert(section, "Project Hail Mary EPUB did not expose narratable sections.");
      return scopeFromSection(section);
    },
    verify(book) {
      assert(book.status === "ready", `Project Hail Mary EPUB is not ready: ${book.status}`);
      assert(
        book.chapterCount >= 30,
        `Project Hail Mary EPUB chapter count = ${book.chapterCount}`,
      );
      assert((book.sections?.length ?? 0) >= 30, "Project Hail Mary EPUB has no structure.");
    },
  },
  {
    kind: "pdf",
    file: path.join(rootDir, "demo", "_OceanofPDF.com_Project_Hail_Mary_-_y_Weir.pdf"),
    screenshot: "tts-research-book-cinema-pdf.png",
    scopeFor(book) {
      return pickPDFNarrationScope(book, "Project Hail Mary PDF import did not expose pages.");
    },
    verify(book) {
      assert(book.status === "ready", `Project Hail Mary PDF is not ready: ${book.status}`);
      assert(book.pageCount >= 468, `Project Hail Mary PDF page count = ${book.pageCount}`);
      assert((book.sections?.length ?? 0) > 0, "Project Hail Mary PDF has no page sections.");
    },
  },
];

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exitCode = 1;
});

async function main() {
  const { chromium } = await loadPlaywright();
  await ensureFixtures();
  await mkdir(screenshotsDir, { recursive: true });
  await assertServerReady();

  const diagnostics = await apiJson("/api/book-cinema/diagnostics");
  assert(
    diagnostics.pdfExtractorAvailable,
    `PDF extraction unavailable: ${diagnostics.pdfSetup ?? "no setup details"}`,
  );
  console.log(`PDF extractor: ${diagnostics.pdfExtractor}`);

  const project = await apiJson("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name: projectName }),
    headers: { "Content-Type": "application/json" },
  });
  assert(project.id, "Project creation did not return an id.");
  await runSourcePrepE2E(project.id);

  const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
  try {
    for (const fixture of fixtures) {
      const book = await uploadBook(project.id, fixture.file);
      fixture.verify(book);
      const scope = fixture.scopeFor(book);
      const scopeContent = await apiJson(`/api/book-sources/${book.id}/scope?${scopeQuery(scope)}`);
      const scopedText = scopeContent.text;
      assert(scopedText.trim().length > 0, `${fixture.kind} selected scope has no text.`);
      if (fixture.skipNarration) {
        console.log(`${fixture.kind.toUpperCase()} structure and scope E2E passed.`);
        continue;
      }

      const job = await createNarrationJob(project.id, book.id, scope);
      const completedJob = await waitForJob(job.id);
      assert(
        completedJob.bookSourceId === book.id,
        `${fixture.kind} job did not store bookSourceId.`,
      );
      assert(
        scopeKey(completedJob.bookScope) === scopeKey(scope),
        `${fixture.kind} job did not store bookScope.`,
      );
      assert(
        completedJob.error !== "cancelled by request",
        `${fixture.kind} job was incorrectly cancelled by request context.`,
      );
      await assertTimingArtifacts(completedJob.id, fixture.kind);

      const context = await browser.newContext({
        storageState: projectStorageState(project.id, {
          bookScope: scope,
          bookSourceId: book.id,
          jobId: completedJob.id,
          text: scopedText,
        }),
        viewport: { width: 1440, height: 980 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(60_000);
      try {
        await page.goto(appBaseUrl, { waitUntil: "networkidle" });
        await page.locator('section:has-text("Source Intake") button:has-text("Book")').click();
        await page.locator('h3:has-text("Book Cinema")').first().waitFor();
        await page
          .locator('section:has-text("Audio Player") button:has-text("Play"):enabled')
          .first()
          .waitFor();
        await page.getByTitle(bookDisplayName(book)).first().click();
        await page
          .locator('label:has-text("Chapter / scope") select')
          .first()
          .selectOption(scopeKey(scope));
        await page.locator('button:has-text("Cinema"):enabled').last().click();
        await page.getByRole("heading", { name: /Book Cinema/i }).waitFor();
        await page
          .locator("h3")
          .filter({ hasText: scope.label ?? "Full book" })
          .first()
          .waitFor();
        await page.locator('.fixed.inset-0 button:has-text("Play"):enabled').first().click();
        await page
          .locator(".book-cinema-word-active, .book-cinema-word-phrase")
          .first()
          .waitFor({ timeout: 20_000 });
        await page.getByLabel("Playback speed").selectOption("1.25");
        const playbackSpeed = await page.getByLabel("Playback speed").inputValue();
        assert(playbackSpeed === "1.25", `Playback speed control value = ${playbackSpeed}`);
        await page.locator('p:has-text("Timing")').first().waitFor({ timeout: 20_000 });
        await page.screenshot({
          fullPage: false,
          path: path.join(screenshotsDir, fixture.screenshot),
        });
        await page.getByRole("button", { name: "Exit" }).click();
      } finally {
        await context.close();
      }
      console.log(`${fixture.kind.toUpperCase()} Book Cinema E2E passed.`);
    }
  } finally {
    await browser.close();
  }
}

async function assertTimingArtifacts(jobId, label) {
  const highlightMap = await apiJson(`/api/voice-jobs/${jobId}/highlight-map`);
  assert(
    highlightMap.schemaVersion === "highlight-map.v1",
    `${label} highlight map schema = ${highlightMap.schemaVersion}`,
  );
  assert(
    ["word", "phrase"].includes(highlightMap.mode),
    `${label} highlight mode = ${highlightMap.mode}`,
  );
  assert((highlightMap.fragments?.length ?? 0) > 0, `${label} highlight map has no fragments.`);
  assert((highlightMap.tokens?.length ?? 0) > 0, `${label} highlight map has no tokens.`);

  const inlineJob = await apiJson(`/api/voice-jobs/${jobId}?includeTiming=1`);
  assert(inlineJob.timing?.highlightMapUrl, `${label} job did not expose highlightMapUrl.`);
  assert(
    inlineJob.timing?.fragmentTiming?.fragments?.length > 0,
    `${label} inline fragment timing is missing.`,
  );
  assert(
    inlineJob.timing?.tokenTiming?.tokens?.length > 0,
    `${label} inline token timing is missing.`,
  );
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
      `Playwright is required. Run: npx --yes --package=playwright node scripts/e2e-book-cinema.mjs\n${String(
        error,
      )}`,
    );
  }
}

async function ensureFixtures() {
  try {
    await stat(deepResearchReportFixture);
  } catch {
    throw new Error(`Missing source prep fixture: ${deepResearchReportFixture}`);
  }
  for (const fixture of fixtures) {
    try {
      await stat(fixture.file);
    } catch {
      throw new Error(`Missing demo fixture: ${fixture.file}`);
    }
  }
}

async function assertServerReady() {
  await apiJson("/api/projects");
}

async function runSourcePrepE2E(projectId) {
  const markdownSource = await uploadPreparedSource(projectId, deepResearchReportFixture);
  verifyPreparedResearchSource(markdownSource, "deep research Markdown fixture");
  const selectedBlockIds = selectPreparedNarrationBlocks(markdownSource);
  assert(selectedBlockIds.length > 0, "Prepared Markdown source has no narratable blocks.");
  const job = await createPreparedNarrationJob(projectId, markdownSource.id, selectedBlockIds);
  const completedJob = await waitForJob(job.id);
  assert(
    completedJob.preparedSourceId === markdownSource.id,
    "Prepared source job did not store preparedSourceId.",
  );
  assert(
    completedJob.error !== "cancelled by request",
    "Prepared source job was incorrectly cancelled by request context.",
  );

  const urlServer = await startLocalReadableServer();
  try {
    const response = await fetch(`${apiBaseUrl}/api/projects/${projectId}/source-preps`, {
      body: JSON.stringify({
        kind: "url",
        url: urlServer.url,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
    if (response.ok) {
      const urlSource = await response.json();
      verifyPreparedResearchSource(urlSource, "local readable URL fixture");
      console.log("Local readable URL source prep E2E passed.");
    } else {
      const body = await response.text();
      assert(
        /private|local|network|address/i.test(body),
        `Local URL source prep failed unexpectedly: ${body}`,
      );
      console.log("Local readable URL source prep was rejected by private-network protection.");
    }
  } finally {
    await urlServer.close();
  }
  console.log("Markdown source prep E2E passed.");
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

function verifyPreparedResearchSource(source, label) {
  assert(source.status === "ready", `${label} source prep is not ready.`);
  assert(source.summary?.headingCount > 0, `${label} has no heading blocks.`);
  assert(source.summary?.citationSkipCount > 0, `${label} did not skip citations.`);
  assert(
    source.blocks?.some((block) => block.kind === "heading" && block.speakMode === "speak"),
    `${label} did not preserve headings as speakable blocks.`,
  );
  assert(
    source.skippedItems?.some((item) => item.kind === "citation") ||
      source.blocks?.some((block) =>
        (block.warnings ?? []).some((warning) => /^citation_/.test(warning)),
      ),
    `${label} did not record skipped citation provenance.`,
  );
  assert(!/turn\d+search\d+/i.test(source.speechText ?? ""), `${label} still speaks turn ids.`);
  assert(!/```/.test(source.speechText ?? ""), `${label} still speaks fenced code syntax.`);
}

function selectPreparedNarrationBlocks(source) {
  return (source.blocks ?? [])
    .filter(
      (block) =>
        block.speakMode !== "skip" && !(block.warnings ?? []).includes("sentence_too_long"),
    )
    .slice(0, 3)
    .map((block) => block.id);
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

async function startLocalReadableServer() {
  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/markdown; charset=utf-8",
    });
    response.end(
      `# Local Source Prep\n\nThis paragraph should be spoken naturally. turn99search1 should not.\n\nturn99search1\n\n| raw | table |\n| --- | --- |\n| skip | this |\n`,
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Local URL test server did not expose a port.");
  return {
    url: `http://127.0.0.1:${String(address.port)}/source.md`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

async function createNarrationJob(projectId, bookSourceId, bookScope) {
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

async function apiJson(pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.json();
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

function pickPDFNarrationScope(book, failureMessage) {
  const section = book.sections?.find(
    (item) => item.isNarratable && item.wordCount >= 80 && (item.pageStart ?? 0) >= 7,
  );
  if (section) {
    return scopeFromSection(section);
  }
  const page = book.pages?.find((item) => item.wordCount >= 80 && item.index >= 7);
  assert(page, failureMessage);
  const pageEnd = Math.min(page.index + 1, book.pages.length);
  return {
    type: "pages",
    pageStart: page.index,
    pageEnd,
    label: pageEnd === page.index ? `Page ${page.index}` : `Pages ${page.index}-${pageEnd}`,
  };
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

function bookDisplayName(book) {
  const title = book.title?.trim();
  return title && title.length > 0 ? title : book.sourceFile;
}

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
