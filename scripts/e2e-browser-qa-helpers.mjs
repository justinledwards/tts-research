import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import process from "node:process";

export async function prepareOutputDir(outputDir, screenshotsDir) {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
}

export async function startLocalServices({ artifactDir, rootDir }) {
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const runtimeDir = path.join(artifactDir, "runtime");
  if (process.env.E2E_PRESERVE_RUNTIME !== "1") {
    await rm(runtimeDir, { force: true, recursive: true });
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
    backendLog,
    frontendLog,
    stop: async () => {
      await Promise.allSettled([stopProcess(frontend), stopProcess(backend)]);
    },
  };
  try {
    await waitForHTTP(`${service.apiBaseUrl}/api/projects`, "backend");
    await waitForHTTP(service.appBaseUrl, "frontend");
    return service;
  } catch (error) {
    await service.stop();
    throw error;
  }
}

export async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    throw new Error(
      `Playwright is required. Run pnpm install before this audit.\n${String(error)}`,
    );
  }
}

export function collectPageIssues(page) {
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

export function blockingPageIssues(issues) {
  return issues.filter(
    (issue) => !/favicon|React DevTools|\/api\/voice-jobs\/[^/]+\/audio$/i.test(issue),
  );
}

export async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export async function assertFile(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

export async function apiJson(apiBaseUrl, pathname, init = {}) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, init);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname} failed: ${await response.text()}`);
  }
  return response.json();
}

export async function createQaProject(apiBaseUrl, name) {
  const project = await apiJson(apiBaseUrl, "/api/projects", {
    body: JSON.stringify({ name }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!project?.id) {
    throw new Error("Project creation did not return an id.");
  }
  return project;
}

export function projectStorageState(appBaseUrl, projectId, projectState, extraLocalStorage = {}) {
  return {
    cookies: [],
    origins: [
      {
        localStorage: [
          { name: "tts-active-project-id", value: projectId },
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

export async function gotoApp(page, appBaseUrl) {
  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForSelector("body");
}

export function workspaceQaText() {
  return [
    "Local QA expansion text for Voice Studio.",
    "Review this paragraph, preview the spoken form, and return through Teleprompt without losing source context.",
    "The final sentence gives block navigation enough material for browser regression checks.",
  ].join(" ");
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

function freePort() {
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
