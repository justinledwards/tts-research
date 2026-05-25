#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const clean = args.has("--clean");
const jsonOnly = args.has("--json");
const olderThanDays = parseNumberArg("--older-than-days", 14);
const outputDir =
  process.env.LOCAL_BLOAT_OUTPUT_DIR ?? path.join(rootDir, "output", "local-bloat", "latest");

const safeGeneratedTargets = [
  {
    id: "output",
    label: "Local QA artifacts",
    path: "output",
    cleanup: "remove-tree",
  },
  {
    id: "backend-output",
    label: "Backend local output",
    path: "backend/output",
    cleanup: "remove-tree",
  },
  {
    id: "backend-old-jobs",
    label: "Old generated job audio",
    path: "backend/data/jobs",
    cleanup: "remove-old-children",
  },
];

const heavyLocalTargets = [
  { id: "backend-venv", label: "Backend Python runtime", path: "backend/.venv" },
  { id: "backend-provider-venvs", label: "Provider Python runtimes", path: "backend/.venv-*" },
  { id: "kokoclone-venv", label: "KokoClone Python runtime", path: ".venv-kokoclone" },
  { id: "upstreams", label: "Ignored upstream clones", path: ".upstreams" },
  { id: "backend-model-cache", label: "Backend provider model cache", path: "backend/model-cache" },
  { id: "backend-data", label: "Backend generated app data", path: "backend/data" },
  { id: "root-node-modules", label: "Root Node dependencies", path: "node_modules" },
  {
    id: "frontend-node-modules",
    label: "Frontend Node dependencies",
    path: "frontend/node_modules",
  },
  { id: "root-model", label: "Root model files", path: "model" },
  { id: "backend-model", label: "Backend model files", path: "backend/model" },
  { id: "demo-media", label: "Demo media", path: "demo" },
];

const before = {
  heavyLocal: await collectSizes(heavyLocalTargets),
  safeGenerated: await collectSizes(safeGeneratedTargets),
};
const cleanup = clean ? await cleanSafeGeneratedTargets() : [];
const after = {
  safeGenerated: await collectSizes(safeGeneratedTargets),
};

const report = {
  generatedAt: new Date().toISOString(),
  mode: clean ? "clean" : "report",
  olderThanDays,
  outputDir,
  rootDir,
  schemaVersion: "local-bloat-report.v1",
  before,
  after,
  cleanup,
  notes: [
    "Cleanup only targets generated QA output and old generated job audio.",
    "Provider runtimes, model caches, upstream clones, demo media, and dependencies are reported but never removed by this script.",
  ],
};

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "bloat-report.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outputDir, "bloat-report.md"), renderMarkdown(report));

if (jsonOnly) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(renderMarkdown(report));
}

function parseNumberArg(name, fallback) {
  const value = process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

async function collectSizes(targets) {
  const rows = [];
  for (const target of targets) {
    const paths = await expandTargetPath(target.path);
    if (paths.length === 0) {
      rows.push({ ...target, bytes: 0, exists: false, paths: [] });
      continue;
    }
    const sizedPaths = [];
    let totalBytes = 0;
    for (const relativePath of paths) {
      const bytes = await diskUsageBytes(path.join(rootDir, relativePath));
      totalBytes += bytes;
      sizedPaths.push({ bytes, path: relativePath });
    }
    rows.push({ ...target, bytes: totalBytes, exists: true, paths: sizedPaths });
  }
  return rows;
}

async function expandTargetPath(pattern) {
  if (!pattern.includes("*")) {
    return (await exists(path.join(rootDir, pattern))) ? [pattern] : [];
  }
  const parent = path.dirname(pattern);
  const basename = path.basename(pattern);
  const expression = new RegExp(`^${basename.replaceAll(".", "\\.").replaceAll("*", ".*")}$`);
  const parentPath = path.join(rootDir, parent);
  if (!(await exists(parentPath))) {
    return [];
  }
  const entries = await readdir(parentPath, { withFileTypes: true });
  return entries
    .filter((entry) => expression.test(entry.name))
    .map((entry) => path.join(parent, entry.name))
    .sort();
}

async function diskUsageBytes(fullPath) {
  if (!(await exists(fullPath))) {
    return 0;
  }
  try {
    const { stdout } = await execFileAsync("du", ["-sk", fullPath], { cwd: rootDir });
    const kib = Number.parseInt(stdout.trim().split(/\s+/)[0] ?? "0", 10);
    return Number.isFinite(kib) ? kib * 1024 : 0;
  } catch {
    return 0;
  }
}

async function cleanSafeGeneratedTargets() {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const actions = [];
  for (const target of safeGeneratedTargets) {
    const fullPath = path.join(rootDir, target.path);
    assertInsideRepo(fullPath);
    if (!(await exists(fullPath))) {
      actions.push({ id: target.id, path: target.path, status: "skipped-missing" });
      continue;
    }
    if (target.cleanup === "remove-tree") {
      await rm(fullPath, { force: true, recursive: true });
      actions.push({ id: target.id, path: target.path, status: "removed" });
      continue;
    }
    if (target.cleanup === "remove-old-children") {
      const removed = await removeOldChildren(fullPath, cutoff);
      actions.push({
        id: target.id,
        olderThanDays,
        path: target.path,
        removed,
        status: "removed-old-children",
      });
    }
  }
  return actions;
}

async function removeOldChildren(directory, cutoff) {
  const entries = await readdir(directory, { withFileTypes: true });
  const removed = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    assertInsideRepo(fullPath);
    const info = await stat(fullPath);
    if (info.mtimeMs > cutoff) {
      continue;
    }
    await rm(fullPath, { force: true, recursive: true });
    removed.push(path.relative(rootDir, fullPath));
  }
  return removed;
}

async function exists(fullPath) {
  try {
    await stat(fullPath);
    return true;
  } catch {
    return false;
  }
}

function assertInsideRepo(fullPath) {
  const resolved = path.resolve(fullPath);
  if (resolved === rootDir || !resolved.startsWith(`${rootDir}${path.sep}`)) {
    throw new Error(`Refusing to clean outside the repository: ${fullPath}`);
  }
}

function renderMarkdown(document) {
  return [
    "# Local Bloat Report",
    "",
    `Generated: ${document.generatedAt}`,
    `Mode: ${document.mode}`,
    `Old job cleanup threshold: ${String(document.olderThanDays)} days`,
    "",
    "## Safe Generated Targets",
    "",
    renderTargetTable(document.before.safeGenerated, document.after.safeGenerated),
    "",
    "## Heavy Local Targets",
    "",
    renderTargetTable(document.before.heavyLocal),
    "",
    "## Cleanup Actions",
    "",
    renderCleanup(document.cleanup),
    "",
    "## Notes",
    "",
    ...document.notes.map((note) => `- ${note}`),
    "",
  ].join("\n");
}

function renderTargetTable(beforeRows, afterRows = null) {
  const afterById = new Map((afterRows ?? []).map((row) => [row.id, row]));
  const lines = afterRows
    ? ["| Target | Before | After | Paths |", "| --- | ---: | ---: | --- |"]
    : ["| Target | Size | Paths |", "| --- | ---: | --- |"];
  for (const row of beforeRows) {
    const paths = row.paths?.map((item) => item.path).join(", ") || row.path;
    if (afterRows) {
      lines.push(
        `| ${row.label} | ${formatBytes(row.bytes)} | ${formatBytes(
          afterById.get(row.id)?.bytes ?? 0,
        )} | ${paths} |`,
      );
    } else {
      lines.push(`| ${row.label} | ${formatBytes(row.bytes)} | ${paths} |`);
    }
  }
  return lines.join("\n");
}

function renderCleanup(actions) {
  if (actions.length === 0) {
    return "No cleanup was requested. Run `pnpm local:clean` to remove safe generated outputs.";
  }
  return actions
    .map((action) => {
      const removed = action.removed?.length ? ` (${String(action.removed.length)} children)` : "";
      return `- ${action.path}: ${action.status}${removed}`;
    })
    .join("\n");
}

function formatBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
