#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), "voice-studio-cli-parity-"));
const contentIR = JSON.parse(
  await readFile(path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"), "utf8"),
);
const apiSpeechPlan = JSON.parse(
  await readFile(path.join(repoRoot, "fixtures/contracts/markdown.speech-plan.v1.json"), "utf8"),
);
const highlightMap = JSON.parse(
  await readFile(path.join(repoRoot, "fixtures/contracts/markdown.highlight-map.v1.json"), "utf8"),
);
const fragments = JSON.parse(
  await readFile(
    path.join(repoRoot, "fixtures/contracts/markdown.fragment-timing.v1.json"),
    "utf8",
  ),
);
const tokens = JSON.parse(
  await readFile(path.join(repoRoot, "fixtures/contracts/markdown.token-timing.v1.json"), "utf8"),
);

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "POST" && url.pathname === "/api/projects/default/source-preps") {
    await readBody(request);
    json(response, 201, { id: contentIR.id, status: "ready", sourceName: contentIR.sourceName });
    return;
  }
  if (request.method === "GET" && url.pathname === `/api/content-ir/${contentIR.id}`) {
    json(response, 200, contentIR);
    return;
  }
  if (request.method === "GET" && url.pathname === `/api/content-ir/${contentIR.id}/speech-plan`) {
    json(response, 200, apiSpeechPlan);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/voice-jobs/contract-job/highlight-map") {
    json(response, 200, highlightMap);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/api/voice-jobs/contract-job/timing/fragments"
  ) {
    json(response, 200, fragments);
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/voice-jobs/contract-job/timing/tokens") {
    json(response, 200, tokens);
    return;
  }
  json(response, 404, { error: `not found: ${request.method} ${url.pathname}` });
});

try {
  await listen(server);
  const address = server.address();
  const apiUrl = `http://127.0.0.1:${address.port.toString()}`;
  const importResult = await cliJson([
    "import",
    "--api-url",
    apiUrl,
    "--project",
    "default",
    "--file",
    path.join(repoRoot, "fixtures/markdown/plain.md"),
    "--kind",
    "prepared",
    "--json",
  ]);
  assertEqual(importResult.id, contentIR.id, "CLI import should return API source id");
  const fetchedIR = await fetchJson(`${apiUrl}/api/content-ir/${contentIR.id}`);
  assertEqual(fetchedIR.schemaVersion, contentIR.schemaVersion, "API Content IR schema parity");
  assertEqual(
    normalizeContentIR(fetchedIR).nodes.length,
    normalizeContentIR(contentIR).nodes.length,
    "API Content IR node parity",
  );

  const builtPlanPath = path.join(tempDir, "built-speech-plan.json");
  await cliJson([
    "speech-plan",
    "build",
    path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
    "--out",
    builtPlanPath,
    "--generated-at",
    apiSpeechPlan.generatedAt,
    "--json",
  ]);
  const builtPlan = JSON.parse(await readFile(builtPlanPath, "utf8"));
  assertEqual(
    stableSpeechPlanShape(builtPlan),
    stableSpeechPlanShape(apiSpeechPlan),
    "offline speech-plan build should match stable API fields",
  );

  const timingSummary = await cliJson([
    "timing",
    "inspect",
    "--api-url",
    apiUrl,
    "--job",
    "contract-job",
    "--json",
  ]);
  assertEqual(
    timingSummary.fragmentCount,
    highlightMap.fragments.length,
    "fragment summary parity",
  );
  assertEqual(timingSummary.tokenCount, highlightMap.tokens.length, "token summary parity");
  assertEqual(timingSummary.status, highlightMap.status, "timing status parity");
  console.log("CLI parity tests passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(tempDir, { force: true, recursive: true });
}

function listen(instance) {
  return new Promise((resolve) => {
    instance.listen(0, "127.0.0.1", resolve);
  });
}

function json(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(`${JSON.stringify(payload)}\n`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    request.on("data", () => {});
    request.on("end", resolve);
    request.on("error", reject);
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status.toString()} ${await response.text()}`);
  }
  return response.json();
}

function cliJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [path.join(repoRoot, "packages/cli/dist/cli.js"), ...args], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || `CLI exited ${code}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`CLI did not return JSON: ${stdout}\n${String(error)}`));
      }
    });
  });
}

function normalizeContentIR(document) {
  return {
    schemaVersion: document.schemaVersion,
    nodes: document.nodes.map((node) => ({
      kind: node.kind,
      locatorType: node.provenance?.locator?.type,
      speechText: node.speechText,
    })),
  };
}

function stableSpeechPlanShape(plan) {
  return {
    schemaVersion: plan.schemaVersion,
    segments: plan.segments.map((segment) => ({
      index: segment.index,
      lang: segment.lang,
      nodeId: segment.nodeId,
      text: segment.text,
    })),
  };
}

function assertEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
