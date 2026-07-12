#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import YAML from "yaml";

const REVIEW_PATHS = new Set([
  "_review/file-list.txt",
  "_review/git-diff.patch",
  "_review/git-status.txt",
]);
const SOURCE_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];
const RESOLUTION_EXTENSIONS = [...SOURCE_EXTENSIONS, ".json", ".css", ".scss"];
const FIXTURE_REFERENCES = [
  {
    path: "demo/deep-research-report.md",
    referencedBy: (text) => text.includes('"demo", "deep-research-report.md"'),
  },
  {
    path: "fixtures/golden-minute/manifest.json",
    referencedBy: (text) =>
      /fixtures["']?\s*,\s*["']golden-minute/.test(text) && /["']manifest\.json["']/.test(text),
  },
  {
    path: "fixtures/contracts/readalong-current.readalong-manifest.v1.json",
    referencedBy: (text) =>
      text.includes("fixtures/contracts") &&
      text.includes("readalong-current.readalong-manifest.v1.json"),
  },
  {
    path: "fixtures/sync/manifest.json",
    referencedBy: (text) => text.includes("fixtures/sync/manifest.json"),
  },
];
const ZIP_DATE = new Date("1980-01-01T00:00:00.000Z");

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeRepositoryPath(value, label = "repository path") {
  invariant(typeof value === "string" && value.length > 0, `${label} must be non-empty`);
  invariant(!value.includes("\\"), `${label} uses an unsafe backslash: ${value}`);
  invariant(!path.posix.isAbsolute(value), `${label} must be relative: ${value}`);
  invariant(
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint < 32 || codePoint === 127;
    }),
    `${label} contains control characters`,
  );
  const parts = value.split("/");
  invariant(
    parts.every((part) => part !== "" && part !== "." && part !== ".."),
    `${label} is unsafe: ${value}`,
  );
  invariant(path.posix.normalize(value) === value, `${label} is not normalized: ${value}`);
  return value;
}

function decodeNulList(bytes, label) {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (decoded.length === 0) return [];
  invariant(decoded.endsWith("\0"), `${label} was not a complete NUL-delimited Git result`);
  return decoded.slice(0, -1).split("\0");
}

async function runToFile(command, args, { cwd, outputPath, allowFailure = false }) {
  const output = await open(outputPath, "w");
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd,
        stdio: ["ignore", output.fd, "pipe"],
      });
      const stderr = [];
      child.stderr.on("data", (chunk) => stderr.push(chunk));
      child.on("error", reject);
      child.on("close", (code, signal) =>
        resolve({ code, signal, stderr: Buffer.concat(stderr).toString("utf8") }),
      );
    });
    if (!allowFailure && result.code !== 0) {
      throw new Error(
        `${command} ${args.join(" ")} failed (${result.code ?? result.signal}): ${result.stderr.trim()}`,
      );
    }
    return result;
  } finally {
    await output.close();
  }
}

async function captureGit(root, scratch, name, args, options = {}) {
  const outputPath = path.join(scratch, name);
  const result = await runToFile("git", args, { cwd: root, outputPath, ...options });
  return { ...result, bytes: await readFile(outputPath), outputPath };
}

function assertUniqueSafePaths(paths) {
  const exact = new Set();
  const folded = new Map();
  for (const candidate of paths) {
    const relativePath = normalizeRepositoryPath(candidate);
    invariant(!exact.has(relativePath), `duplicate repository entry: ${relativePath}`);
    exact.add(relativePath);
    const key = relativePath.toLowerCase();
    invariant(
      !folded.has(key),
      `case-colliding repository entries: ${folded.get(key)} and ${relativePath}`,
    );
    folded.set(key, relativePath);
    invariant(
      !REVIEW_PATHS.has(relativePath),
      `source collides with reserved review path: ${relativePath}`,
    );
  }
}

function parsePorcelainPaths(bytes) {
  const records = decodeNulList(bytes, "git status");
  const dirty = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    invariant(record.length >= 4 && record[2] === " ", "malformed git status record");
    const status = record.slice(0, 2);
    const relativePath = normalizeRepositoryPath(record.slice(3), "git status path");
    if (status[0] === "R" || status[0] === "C" || status[1] === "R" || status[1] === "C") {
      index += 1;
      invariant(index < records.length, "truncated rename/copy git status record");
      normalizeRepositoryPath(records[index], "git status original path");
    }
    if (status !== "??" && status !== "!!") dirty.push(relativePath);
  }
  return [...new Set(dirty)].sort();
}

function equalLists(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

async function readPostimage(root, trackedPaths, allPaths) {
  const tracked = new Set(trackedPaths);
  const files = new Map();
  for (const relativePath of allPaths) {
    const absolutePath = path.join(root, relativePath);
    let stats;
    try {
      stats = await lstat(absolutePath);
    } catch {
      throw new Error(
        tracked.has(relativePath)
          ? `tracked index path is absent from the worktree: ${relativePath}`
          : `untracked source disappeared during packaging: ${relativePath}`,
      );
    }
    if (stats.isSymbolicLink()) {
      files.set(relativePath, {
        bytes: Buffer.from(await readlink(absolutePath)),
        mode: 0o120777,
        symlink: true,
      });
    } else {
      invariant(stats.isFile(), `unsupported tracked or source entry type: ${relativePath}`);
      files.set(relativePath, {
        bytes: await readFile(absolutePath),
        mode: stats.mode & 0o777,
        symlink: false,
      });
    }
  }
  return files;
}

function textEntry(files, relativePath) {
  const entry = files.get(relativePath);
  if (!entry || entry.symlink) return null;
  return entry.bytes.toString("utf8");
}

async function requireIncludedPath(root, files, relativePath, reason) {
  normalizeRepositoryPath(relativePath, reason);
  if (files.has(relativePath)) return;
  const exists = await lstat(path.join(root, relativePath)).then(
    (stats) => stats.isFile() || stats.isSymbolicLink(),
    () => false,
  );
  throw new Error(
    `${reason} ${exists ? "was excluded from the archive" : "is missing"}: ${relativePath}`,
  );
}

function workspacePatternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("**", "@@");
  return new RegExp(`^${escaped.replaceAll("*", "[^/]*").replaceAll("@@", ".*")}$`);
}

async function validateWorkspaceClosure(root, files) {
  const workspaceText = textEntry(files, "pnpm-workspace.yaml");
  const lockText = textEntry(files, "pnpm-lock.yaml");
  const importerDirectories = new Set();
  if (workspaceText !== null) {
    const workspace = YAML.parse(workspaceText);
    invariant(Array.isArray(workspace?.packages), "pnpm-workspace.yaml packages must be an array");
    for (const pattern of workspace.packages) {
      invariant(typeof pattern === "string", "pnpm workspace pattern must be a string");
      if (!pattern.includes("*")) importerDirectories.add(pattern.replace(/\/$/, ""));
      const matcher = workspacePatternRegex(pattern.replace(/\/$/, ""));
      for (const relativePath of files.keys()) {
        if (!relativePath.endsWith("/package.json")) continue;
        const directory = path.posix.dirname(relativePath);
        if (matcher.test(directory)) importerDirectories.add(directory);
      }
    }
  }
  if (lockText !== null) {
    const lockfile = YAML.parse(lockText);
    invariant(
      lockfile?.importers && typeof lockfile.importers === "object",
      "pnpm-lock.yaml importers must be an object",
    );
    for (const importer of Object.keys(lockfile.importers)) {
      if (importer !== ".") importerDirectories.add(importer.replace(/\/$/, ""));
    }
  }
  for (const importer of [...importerDirectories].sort()) {
    await requireIncludedPath(root, files, `${importer}/package.json`, "pnpm workspace importer");
  }
}

function localSpecifiers(relativePath, source) {
  const values = [];
  const patterns = [
    /^\s*(?:import|export)\s+(?:[^"'`]*?\s+from\s*)?["'`]([^"'`]+)["'`]/gm,
    /^\s*(?:import|require)\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/gm,
  ];
  if (/\.(?:css|scss)$/.test(relativePath)) patterns.push(/@import\s+["']([^"']+)["']/g);
  if (/\.html?$/.test(relativePath)) patterns.push(/<script\b[^>]*\bsrc=["']([^"']+)["']/g);
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern))
      if (match[1].startsWith(".")) values.push(match[1]);
  }
  return values;
}

function importCandidates(importer, specifier) {
  const cleanSpecifier = specifier.split(/[?#]/, 1)[0];
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), cleanSpecifier));
  const candidates = [base];
  if (!path.posix.extname(base)) {
    candidates.push(...RESOLUTION_EXTENSIONS.map((extension) => `${base}${extension}`));
    candidates.push(...RESOLUTION_EXTENSIONS.map((extension) => `${base}/index${extension}`));
  } else if (base.endsWith(".js")) {
    candidates.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  }
  return [...new Set(candidates)].filter((candidate) => !candidate.startsWith("../"));
}

async function validateLocalImportClosure(root, files) {
  for (const [relativePath, entry] of files) {
    if (
      entry.symlink ||
      ![...SOURCE_EXTENSIONS, ".css", ".scss", ".html"].includes(path.extname(relativePath))
    ) {
      continue;
    }
    const source = entry.bytes.toString("utf8");
    for (const specifier of localSpecifiers(relativePath, source)) {
      const candidates = importCandidates(relativePath, specifier);
      if (candidates.some((candidate) => /(^|\/)dist\//.test(candidate))) continue;
      if (candidates.some((candidate) => files.has(candidate))) continue;
      const existing = [];
      for (const candidate of candidates) {
        if (
          await lstat(path.join(root, candidate)).then(
            () => true,
            () => false,
          )
        )
          existing.push(candidate);
      }
      const target = existing[0] ?? candidates[0];
      throw new Error(
        `local import from ${relativePath} ${existing.length ? "references excluded source" : "is unresolved"}: ${target}`,
      );
    }
  }
}

async function validateManifestClosure(root, files) {
  const manifestText = textEntry(files, "docs/flows/manifest.json");
  if (manifestText === null) return;
  const manifest = JSON.parse(manifestText);
  for (const flow of manifest.flows ?? []) {
    for (const evidence of flow.testEvidence ?? []) {
      await requireIncludedPath(root, files, evidence.path, `flow ${flow.id} evidence`);
    }
  }
  for (const required of manifest.requiredStateSymbols ?? []) {
    const separator = required.symbol?.lastIndexOf("#") ?? -1;
    invariant(separator > 0, `invalid required state symbol: ${required.symbol}`);
    await requireIncludedPath(
      root,
      files,
      required.symbol.slice(0, separator),
      "required state-symbol source",
    );
  }
}

async function validateFixtureClosure(root, files) {
  const repositoryText = [...files.entries()]
    .filter(
      ([relativePath, entry]) =>
        !entry.symlink && /\.(?:go|js|mjs|cjs|ts|tsx|json|yaml|yml|toml)$/.test(relativePath),
    )
    .map(([, entry]) => entry.bytes.toString("utf8"))
    .join("\n");
  for (const fixture of FIXTURE_REFERENCES) {
    if (fixture.referencedBy(repositoryText)) {
      await requireIncludedPath(
        root,
        files,
        fixture.path,
        "checked-in repository fixture reference",
      );
    }
  }
  const directReferences = new Set(repositoryText.match(/fixtures\/[A-Za-z0-9_./-]+/g) ?? []);
  for (const reference of directReferences) {
    const normalized = reference.replace(/[.,;:)]+$/, "");
    if (!path.posix.extname(normalized)) continue;
    await requireIncludedPath(root, files, normalized, "checked-in repository fixture reference");
  }
}

export async function validateSourceClosure(root, files) {
  await validateWorkspaceClosure(root, files);
  await validateManifestClosure(root, files);
  await validateFixtureClosure(root, files);
  await validateLocalImportClosure(root, files);
}

async function verifyReverseApply(root, files, patchPath, patchBytes, scratch) {
  if (patchBytes.length === 0) return;
  const postimage = path.join(scratch, "postimage");
  await mkdir(postimage, { recursive: true });
  for (const [relativePath, entry] of files) {
    const destination = path.join(postimage, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    if (entry.symlink) await symlink(entry.bytes.toString("utf8"), destination);
    else await writeFile(destination, entry.bytes, { mode: entry.mode });
  }
  const checkOutput = path.join(scratch, "reverse-apply-check.out");
  await runToFile("git", ["apply", "--reverse", "--check", "--whitespace=error-all", patchPath], {
    cwd: postimage,
    outputPath: checkOutput,
  }).catch((error) => {
    throw new Error(
      `provenance patch does not reverse-apply to archived postimage: ${error.message}`,
    );
  });
  invariant(path.resolve(root) !== path.resolve(postimage), "reverse-apply check must be isolated");
}

function archivePath(prefix, relativePath) {
  return `${prefix}/${relativePath}`;
}

export async function buildReviewArchive({
  root = process.cwd(),
  output,
  prefix = "tts-research-chatgpt-review",
} = {}) {
  root = path.resolve(root);
  prefix = normalizeRepositoryPath(prefix.replace(/^\/+|\/+$/g, ""), "archive prefix");
  const scratch = await mkdtemp(path.join(os.tmpdir(), "tts-review-archive-"));
  try {
    const [sparseConfig, sparseIndexConfig] = await Promise.all([
      captureGit(root, scratch, "sparse-config", ["config", "--bool", "core.sparseCheckout"], {
        allowFailure: true,
      }),
      captureGit(root, scratch, "sparse-index-config", ["config", "--bool", "index.sparse"], {
        allowFailure: true,
      }),
    ]);
    invariant(
      sparseConfig.bytes.toString("utf8").trim() !== "true" &&
        sparseIndexConfig.bytes.toString("utf8").trim() !== "true",
      "review archive requires a complete non-sparse worktree",
    );

    const trackedResult = await captureGit(root, scratch, "tracked.z", [
      "ls-files",
      "-z",
      "--cached",
    ]);
    const allResult = await captureGit(root, scratch, "all.z", [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);
    const trackedPaths = decodeNulList(trackedResult.bytes, "tracked file list").sort();
    const allPaths = decodeNulList(allResult.bytes, "review file list").sort();
    assertUniqueSafePaths(allPaths);
    invariant(
      trackedPaths.every((item) => allPaths.includes(item)),
      "complete tracked path inventory mismatch",
    );

    const outputPath = path.resolve(
      root,
      output ?? path.join("output", "chatgpt-review-packages", "tts-research-self-contained.zip"),
    );
    const relativeOutput = path.relative(root, outputPath).split(path.sep).join("/");
    if (!relativeOutput.startsWith("../") && allPaths.includes(relativeOutput)) {
      throw new Error(
        `archive output path is already a tracked or nonignored source: ${relativeOutput}`,
      );
    }

    const [statusResult, patchResult, patchNamesResult] = await Promise.all([
      captureGit(root, scratch, "git-status.z", [
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
      ]),
      captureGit(root, scratch, "git-diff.patch", ["diff", "--binary", "--no-ext-diff"]),
      captureGit(root, scratch, "git-diff-names.z", ["diff", "--name-only", "-z", "--no-ext-diff"]),
    ]);
    const statusModifiedPaths = parsePorcelainPaths(statusResult.bytes);
    const patchModifiedPaths = decodeNulList(patchNamesResult.bytes, "git diff path list").map(
      (item) => normalizeRepositoryPath(item, "git diff path"),
    );
    invariant(
      equalLists(statusModifiedPaths, patchModifiedPaths),
      `provenance patch/status modified-path mismatch; status=[${statusModifiedPaths.join(", ")}], patch=[${patchModifiedPaths.join(", ")}]`,
    );

    const files = await readPostimage(root, trackedPaths, allPaths);
    await validateSourceClosure(root, files);
    await verifyReverseApply(root, files, patchResult.outputPath, patchResult.bytes, scratch);

    const fileList = `${allPaths.join("\n")}\n`;
    const statusTextResult = await captureGit(root, scratch, "git-status.txt", [
      "status",
      "--short",
      "--untracked-files=all",
    ]);
    const metadata = new Map([
      ["_review/file-list.txt", Buffer.from(fileList)],
      ["_review/git-diff.patch", patchResult.bytes],
      ["_review/git-status.txt", statusTextResult.bytes],
    ]);
    const archive = new JSZip();
    for (const relativePath of allPaths) {
      const entry = files.get(relativePath);
      archive.file(archivePath(prefix, relativePath), entry.bytes, {
        createFolders: false,
        date: ZIP_DATE,
        unixPermissions: entry.mode,
      });
    }
    for (const [relativePath, bytes] of metadata) {
      archive.file(archivePath(prefix, relativePath), bytes, {
        createFolders: false,
        date: ZIP_DATE,
        unixPermissions: 0o644,
      });
    }
    const zipBytes = await archive.generateAsync({
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "UNIX",
      type: "nodebuffer",
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, zipBytes);
    return {
      entryCount: allPaths.length + metadata.size,
      modifiedPathCount: patchModifiedPaths.length,
      outputPath,
      sourceFileCount: allPaths.length,
    };
  } finally {
    await rm(scratch, { force: true, recursive: true });
  }
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (["--root", "--output", "--prefix"].includes(argument)) {
      invariant(args[index + 1], `${argument} requires a value`);
      options[argument.slice(2)] = args[++index];
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  return options;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      "Usage: node scripts/build-chatgpt-review-archive.mjs [--root PATH] [--output ZIP] [--prefix NAME]",
    );
  } else {
    buildReviewArchive(options)
      .then((result) =>
        console.log(
          `review archive passed: ${result.outputPath}; ${result.sourceFileCount} source files, ${result.modifiedPathCount} modified paths`,
        ),
      )
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      });
  }
}
