import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";

export function createBookCinemaCommandHelpers({
  artifactDir,
  rootDir,
  getApiBaseUrl,
  getJobTimeoutMs,
}) {
  const createTimeout = {
    serviceWaitMs: 120_000,
    pollIntervalMs: 500,
    saveProgressPollMs: 500,
    savedProgressTimeoutMs: 15_000,
    jobPollMs: 500,
  };

  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  const scopeKey = (scope) => {
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
  };

  const sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  async function apiJson(pathname, init = {}) {
    const response = await fetch(`${getApiBaseUrl()}${pathname}`, init);
    if (!response.ok) {
      throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
    }
    return response.json();
  }

  async function assertServerReady() {
    await apiJson("/api/projects");
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
    while (Date.now() - started < createTimeout.serviceWaitMs) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status < 500) {
          return;
        }
      } catch {
        // Keep polling until the service is listening.
      }
      await sleep(createTimeout.pollIntervalMs);
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
    <header><nav>Home Features Search Instagram Subscribe</nav></header>
    <main>
      <article class="article-body">
        <h1>Website Cinema Focus Fixture</h1>
        <p>This local website article gives the cinema focus-mode smoke test a stable source.</p>
        <h2>Readable Section</h2>
        <p>Bookmarks, review panels, generated audio diagnostics, and source provenance should remain discoverable without competing with the reading canvas.</p>
        <aside class="newsletter">Navigation, adverts, and boilerplate should be easy to inspect but quiet in read mode.</aside>
        <p>The final article paragraph confirms Website Cinema starts with article body text.</p>
      </article>
    </main>
    <footer>Facebook Instagram Privacy Terms</footer>
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

  function assertWebsiteExtractionQuality(source) {
    const quality = source.metadata?.websiteExtractionQuality;
    assert(quality, "Website source prep did not include extraction quality metadata.");
    assert(quality.skippedBlockCount > 0, "Website fixture did not report skipped chrome blocks.");
    assert(
      quality.extractionConfidence === "high" ||
        quality.extractionConfidence === "medium" ||
        quality.extractionConfidence === "low",
      "Website extraction confidence is missing.",
    );
    const openingBlockText =
      source.blocks?.find((block) => block.speakMode !== "skip")?.spokenText ?? "";
    assert(
      !/home features search|instagram subscribe/i.test(openingBlockText),
      `Website Cinema opening block contains page chrome: ${openingBlockText}`,
    );
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
    while (Date.now() - startedAt < getJobTimeoutMs()) {
      const job = await apiJson(`/api/voice-jobs/${jobId}`);
      if (job.status === "completed") {
        return job;
      }
      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(`Job ${jobId} ended as ${job.status}: ${job.error ?? "no error"}`);
      }
      await sleep(createTimeout.jobPollMs);
    }
    throw new Error(`Timed out waiting for job ${jobId}`);
  }

  async function waitForSavedProgress(projectId, bookSourceId, bookScope, jobId) {
    const targetId = `book:${bookSourceId}:${scopeKey(bookScope)}`;
    const startedAt = Date.now();
    while (Date.now() - startedAt < createTimeout.savedProgressTimeoutMs) {
      const progressItems = await apiJson(`/api/projects/${projectId}/progress`);
      const progress = progressItems.find((item) => item.targetId === targetId);
      if (progress && progress.currentTimeSec > 0) {
        return progress;
      }
      await sleep(createTimeout.saveProgressPollMs);
    }
    return apiJson(`/api/progress/${targetId}`, {
      body: JSON.stringify({
        activeWordIndex: 4,
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
    const highlightMapV2 = await apiJson(`/api/voice-jobs/${jobId}/highlight-map-v2`);
    const alignmentQuality = await apiJson(`/api/voice-jobs/${jobId}/timing/alignment`);
    assert(
      highlightMap.schemaVersion === "highlight-map.v1",
      `${label} highlight map schema = ${highlightMap.schemaVersion}`,
    );
    assert(
      highlightMapV2.schemaVersion === "highlight-map.v2",
      `${label} highlight map v2 schema = ${highlightMapV2.schemaVersion}`,
    );
    assert(
      alignmentQuality.schemaVersion === "alignment-quality.v1",
      `${label} alignment quality schema = ${alignmentQuality.schemaVersion}`,
    );
    assert((highlightMap.fragments?.length ?? 0) > 0, `${label} highlight map has no fragments.`);
    assert((highlightMap.tokens?.length ?? 0) > 0, `${label} highlight map has no tokens.`);
    assert((highlightMapV2.entries?.length ?? 0) > 0, `${label} highlight map v2 has no entries.`);
    assert(
      typeof alignmentQuality.wordTimingReliable === "boolean",
      `${label} alignment quality is missing word timing reliability.`,
    );
  }

  return {
    apiJson,
    assertServerReady,
    assertTimingArtifacts,
    assertWebsiteExtractionQuality,
    createBookNarrationJob,
    createPreparedNarrationJob,
    startLocalServices,
    startWebsiteFixtureServer,
    stopProcess,
    uploadBook,
    uploadPreparedSource,
    waitForJob,
    waitForPreparedSavedBookmark,
    waitForSavedBookmark,
    waitForSavedProgress,
  };
}
