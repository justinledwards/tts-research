#!/usr/bin/env node

import { execFile } from "node:child_process";
import { lstat, mkdir, readFile, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }

  const repoRoot = await git(["rev-parse", "--show-toplevel"], process.cwd());
  const branchName = await git(["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  const shortSha = await git(["rev-parse", "--short", "HEAD"], repoRoot);
  const status = await git(["status", "--short"], repoRoot);
  const branchSlug = slugify(branchName === "HEAD" ? shortSha : branchName);
  const archivePrefix = normalizeArchivePrefix(options.prefix ?? `tts-research-${branchSlug}`);
  const outputPath = resolveOutputPath(repoRoot, options, branchSlug, shortSha);
  const relativeFilePaths = await listReviewFiles(repoRoot, options.trackedOnly);

  if (relativeFilePaths.length === 0) {
    throw new Error("No files were found to include in the reviewer archive.");
  }

  const archive = new JSZip();
  const skippedPaths = [];
  let includedCount = 0;

  for (const relativeFilePath of relativeFilePaths) {
    const fullPath = path.join(repoRoot, relativeFilePath);
    let stats;
    try {
      stats = await lstat(fullPath);
    } catch {
      skippedPaths.push(relativeFilePath);
      continue;
    }

    const archivePath = `${archivePrefix}${relativeFilePath}`;
    if (stats.isSymbolicLink()) {
      const target = await readlink(fullPath);
      archive.file(archivePath, target, {
        date: stats.mtime,
        unixPermissions: 0o120000,
      });
      includedCount += 1;
      continue;
    }

    if (!stats.isFile()) {
      skippedPaths.push(relativeFilePath);
      continue;
    }

    archive.file(archivePath, await readFile(fullPath), {
      date: stats.mtime,
      unixPermissions: stats.mode & 0o777,
    });
    includedCount += 1;
  }

  if (includedCount === 0) {
    throw new Error("No regular files were available to include in the reviewer archive.");
  }

  const zipBuffer = await archive.generateAsync({
    comment: `tts-research ${branchName} ${shortSha}`,
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
    platform: "UNIX",
    type: "nodebuffer",
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, zipBuffer);

  console.log(`Created reviewer archive: ${outputPath}`);
  console.log(`Branch: ${branchName}`);
  console.log(`Commit: ${shortSha}`);
  console.log(`Archive prefix: ${archivePrefix}`);
  console.log(`Files included: ${includedCount}`);
  console.log(`Includes untracked non-ignored files: ${options.trackedOnly ? "no" : "yes"}`);
  console.log(`Working tree had local changes: ${status ? "yes" : "no"}`);
  if (skippedPaths.length > 0) {
    console.log(`Skipped missing or special paths: ${skippedPaths.length}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    help: false,
    output: undefined,
    outputDir: undefined,
    prefix: undefined,
    trackedOnly: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--tracked-only") {
      options.trackedOnly = true;
      continue;
    }
    if (arg === "--output" || arg === "-o") {
      options.output = requiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = requiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--prefix") {
      options.prefix = requiredValue(args, index, arg);
      index += 1;
      continue;
    }
    if (arg.startsWith("--prefix=")) {
      options.prefix = arg.slice("--prefix=".length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function requiredValue(args, index, name) {
  const value = args[index + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

async function git(args, cwd) {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
  return stdout.trim();
}

async function listReviewFiles(repoRoot, trackedOnly) {
  const args = ["ls-files", "-z", "--cached"];
  if (!trackedOnly) {
    args.push("--others", "--exclude-standard");
  }

  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 50 * 1024 * 1024,
  });
  return [...new Set(stdout.toString("utf8").split("\0").filter(Boolean))].sort();
}

function resolveOutputPath(repoRoot, options, branchSlug, shortSha) {
  if (options.output) {
    return path.resolve(repoRoot, options.output);
  }

  const outputDir = path.resolve(repoRoot, options.outputDir ?? "output/reviewer-zips");
  return path.join(outputDir, `tts-research-${branchSlug}-${shortSha}.zip`);
}

function normalizeArchivePrefix(prefix) {
  const normalized = prefix.trim().replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("--prefix must not be empty.");
  }
  return `${normalized}/`;
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");
}

function helpText() {
  return `Usage: node scripts/zip-branch-for-review.mjs [options]

Creates a reviewer-ready zip of the current git working tree.

Options:
  -o, --output <path>      Write the archive to a specific path.
      --output-dir <path>  Write to this directory using the default archive name.
      --prefix <name>      Top-level directory name inside the zip.
      --tracked-only       Exclude non-ignored untracked files.
  -h, --help              Show this help text.
`;
}
