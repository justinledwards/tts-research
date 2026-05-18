#!/usr/bin/env node

import { spawn } from "node:child_process";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig } from "./benchmarks.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const diagramVendorPattern =
  /(architectureDiagram|blockDiagram|c4Diagram|classDiagram|cose|cytoscape|dagre|diagram-|erDiagram|flowDiagram|ganttDiagram|gitGraph|graph-|ishikawa|journeyDiagram|kanban|katex|mermaid|mindmap|quadrantDiagram|requirementDiagram|sankeyDiagram|sequenceDiagram|stateDiagram|timeline|vennDiagram|wardley|xychartDiagram)/i;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { thresholds } = await loadBenchmarkConfig(rootDir);
  const result = await runFrontendBundleBenchmark({ rootDir, thresholds });
  console.log(result.output);
  const failed = result.thresholds.some((threshold) => threshold.passed === false);
  process.exitCode = failed ? 1 : 0;
}

export async function runFrontendBundleBenchmark({ rootDir, thresholds, log = console.log }) {
  await runFrontendBuild(rootDir, log);
  const metrics = await analyzeFrontendBundle(path.join(rootDir, "frontend", "dist"));
  const comparisons = compareFrontendBundleBudgets(metrics, thresholds?.frontendBundle ?? {});
  return {
    id: "frontend-bundle",
    metrics,
    thresholds: comparisons,
    output: formatFrontendBundleReport(metrics, comparisons),
  };
}

export async function runFrontendBuild(rootDir, log = console.log) {
  log("Building frontend production bundle with Vite manifest...");
  await runCommand(
    "pnpm",
    ["--filter", "@tts-research/frontend", "exec", "vite", "build", "--manifest"],
    {
      cwd: rootDir,
      log,
    },
  );
}

export async function analyzeFrontendBundle(distDir) {
  const manifestPath = path.join(distDir, ".vite", "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const chunks = Object.values(manifest);
  const entryChunks = chunks.filter((chunk) => chunk.isEntry);
  if (entryChunks.length === 0) {
    throw new Error(`No Vite entry chunks found in ${manifestPath}`);
  }

  const initialFiles = new Set();
  for (const entry of entryChunks) {
    collectInitialFiles(manifest, entry, initialFiles);
  }

  const allFiles = new Set();
  for (const chunk of chunks) {
    addChunkFiles(chunk, allFiles);
  }

  const initial = await summarizeFiles(distDir, [...initialFiles].sort());
  const asyncFiles = [...allFiles].filter((file) => !initialFiles.has(file)).sort();
  const asyncChunks = await summarizeFiles(distDir, asyncFiles);
  const asyncAppChunks = asyncChunks.filter(
    (chunk) => chunk.file.endsWith(".js") && !isVendorChunk(chunk),
  );
  const largestAsyncAppChunk =
    asyncAppChunks.toSorted((left, right) => right.gzipBytes - left.gzipBytes)[0] ?? null;
  const diagramVendorInitialFiles = initial
    .filter((file) => file.file.endsWith(".js") && diagramVendorPattern.test(file.file))
    .map((file) => file.file);

  return {
    schemaVersion: "tts-research.frontend-performance.v1",
    distDir,
    entryFiles: entryChunks.map((chunk) => chunk.file),
    initialFiles: initial,
    asyncChunks,
    initialJsRawBytes: sumBytes(initial, ".js", "rawBytes"),
    initialJsGzipBytes: sumBytes(initial, ".js", "gzipBytes"),
    initialCssRawBytes: sumBytes(initial, ".css", "rawBytes"),
    initialCssGzipBytes: sumBytes(initial, ".css", "gzipBytes"),
    largestAsyncAppChunk,
    largestAsyncAppChunkGzipBytes: largestAsyncAppChunk?.gzipBytes ?? 0,
    diagramVendorInitialFiles,
    diagramVendorLazy: diagramVendorInitialFiles.length === 0,
  };
}

export function compareFrontendBundleBudgets(metrics, thresholds) {
  const comparisons = [];
  addNumberComparison(
    comparisons,
    thresholds,
    "maxInitialJsRawBytes",
    "initialJsRawBytes",
    "<=",
    metrics,
  );
  addNumberComparison(
    comparisons,
    thresholds,
    "maxInitialJsGzipBytes",
    "initialJsGzipBytes",
    "<=",
    metrics,
  );
  addNumberComparison(
    comparisons,
    thresholds,
    "maxInitialCssGzipBytes",
    "initialCssGzipBytes",
    "<=",
    metrics,
  );
  addNumberComparison(
    comparisons,
    thresholds,
    "maxLargestAsyncAppChunkGzipBytes",
    "largestAsyncAppChunkGzipBytes",
    "<=",
    metrics,
  );
  if (thresholds.requireDiagramVendorLazy !== undefined) {
    comparisons.push({
      actual: metrics.diagramVendorLazy,
      expected: thresholds.requireDiagramVendorLazy,
      metric: "diagramVendorLazy",
      operator: "===",
      passed: metrics.diagramVendorLazy === thresholds.requireDiagramVendorLazy,
      threshold: "requireDiagramVendorLazy",
    });
  }
  return comparisons;
}

export function formatFrontendBundleReport(metrics, comparisons = []) {
  const lines = [
    "Frontend bundle performance",
    `- Initial JS: ${formatBytes(metrics.initialJsRawBytes)} raw / ${formatBytes(
      metrics.initialJsGzipBytes,
    )} gzip`,
    `- Initial CSS: ${formatBytes(metrics.initialCssRawBytes)} raw / ${formatBytes(
      metrics.initialCssGzipBytes,
    )} gzip`,
    `- Largest async app chunk: ${
      metrics.largestAsyncAppChunk
        ? `${metrics.largestAsyncAppChunk.file} (${formatBytes(
            metrics.largestAsyncAppChunk.gzipBytes,
          )} gzip)`
        : "none"
    }`,
    `- Diagram/Mermaid vendor lazy: ${metrics.diagramVendorLazy ? "yes" : "no"}`,
  ];
  if (metrics.diagramVendorInitialFiles.length > 0) {
    lines.push(`- Initial diagram vendor files: ${metrics.diagramVendorInitialFiles.join(", ")}`);
  }
  if (comparisons.length > 0) {
    lines.push("Thresholds:");
    for (const comparison of comparisons) {
      lines.push(
        `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatValue(
          comparison.actual,
        )} ${comparison.operator} ${formatValue(comparison.expected)}`,
      );
    }
  }
  return lines.join("\n");
}

function collectInitialFiles(manifest, chunk, files, visited = new Set()) {
  if (!chunk || visited.has(chunk.file)) {
    return;
  }
  visited.add(chunk.file);
  addChunkFiles(chunk, files);
  for (const importKey of chunk.imports ?? []) {
    collectInitialFiles(manifest, manifest[importKey], files, visited);
  }
}

function addChunkFiles(chunk, files) {
  if (chunk.file) {
    files.add(chunk.file);
  }
  for (const css of chunk.css ?? []) {
    files.add(css);
  }
}

async function summarizeFiles(distDir, files) {
  const summaries = [];
  for (const file of files) {
    const filePath = path.join(distDir, file);
    const bytes = await readFile(filePath);
    summaries.push({
      file,
      gzipBytes: gzipSync(bytes).byteLength,
      rawBytes: bytes.byteLength,
    });
  }
  return summaries;
}

function isVendorChunk(chunk) {
  return (
    diagramVendorPattern.test(chunk.file) ||
    /^assets\/(chunk-|katex-|mermaid\.core-|cytoscape\.esm-|wardley-)/i.test(chunk.file)
  );
}

function sumBytes(files, extension, key) {
  return files
    .filter((file) => file.file.endsWith(extension))
    .reduce((total, file) => total + file[key], 0);
}

function addNumberComparison(comparisons, thresholds, thresholdKey, metricKey, operator, metrics) {
  if (thresholds[thresholdKey] === undefined) {
    return;
  }
  const actual = metrics[metricKey];
  const expected = thresholds[thresholdKey];
  comparisons.push({
    actual,
    expected,
    metric: metricKey,
    operator,
    passed: operator === "<=" ? actual <= expected : actual >= expected,
    threshold: thresholdKey,
  });
}

async function runCommand(command, args, { cwd, log }) {
  await mkdir(path.join(cwd, "output"), { recursive: true });
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR ?? "0" },
    shell: false,
  });
  child.stdout.on("data", (chunk) => {
    log(String(chunk).trimEnd());
  });
  child.stderr.on("data", (chunk) => {
    log(String(chunk).trimEnd());
  });
  const exitCode = await new Promise((resolve) => {
    child.once("error", (error) => {
      log(`Process error: ${error.message}`);
      resolve(1);
    });
    child.once("close", resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${String(exitCode)}`);
  }
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatValue(value) {
  if (typeof value === "number") {
    return formatBytes(value);
  }
  return String(value);
}

export async function writeFrontendPerformanceSummary(filePath, result) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await stat(path.dirname(filePath));
  await writeFile(filePath, `${JSON.stringify(result, null, 2)}\n`);
}
