#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const outputDir = path.join(repoRoot, "output", "chatgpt-review-packages");

const requiredScreenshotFiles = [
  "reviewer-screenshot-manifest.md",
  "reviewer-screenshots/responsive-snapshots/phone-390-workspace.png",
  "reviewer-screenshots/responsive-snapshots/phone-390-website-cinema-calm-read.png",
  "reviewer-screenshots/responsive-snapshots/constrained-1100-workspace.png",
  "reviewer-screenshots/responsive-snapshots/constrained-1100-website-cinema-calm-read.png",
  "reviewer-screenshots/responsive-snapshots/desktop-1440-workspace.png",
  "reviewer-screenshots/responsive-snapshots/desktop-1440-website-cinema-calm-read.png",
  "reviewer-screenshots/responsive-snapshots/desktop-1920-taskbar-workspace.png",
  "reviewer-screenshots/responsive-snapshots/desktop-1920-taskbar-website-cinema-calm-read.png",
  "reviewer-screenshots/e2e-book-cinema/website-cinema-focus-read.png",
  "reviewer-screenshots/e2e-book-cinema/document-cinema-focus-read.png",
  "reviewer-screenshots/e2e-book-cinema/book-cinema-epub-focus-read.png",
  "reviewer-screenshots/e2e-book-cinema/book-cinema-pdf-focus-read.png",
  "reviewer-screenshots/e2e-book-cinema/book-cinema-docx-focus-read.png",
];

const forbiddenArchivePatterns = [
  /(^|\/)\.git\//,
  /(^|\/)node_modules\//,
  /(^|\/)\.venv[^/]*\//,
  /(^|\/)__pycache__\//,
  /(^|\/)backend\/data\/local-credentials\//,
  /\.(?:pt|pth|onnx|ckpt|safetensors)$/i,
];

const forbiddenEnvPattern = /(^|\/)\.env(?:\..*)?$/;

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(helpText());
    process.exit(0);
  }
  const missingScreenshots = await missingFiles(requiredScreenshotFiles);
  if (missingScreenshots.length > 0) {
    throw new Error(
      `Missing required ChatGPT review screenshots/evidence:\n${missingScreenshots.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  await mkdir(outputDir, { recursive: true });
  const zipOutput = options.output
    ? path.resolve(repoRoot, options.output)
    : path.join(outputDir, `tts-research-chatgpt-${await shortHead()}.zip`);

  const { stdout } = await execFileAsync(
    process.execPath,
    [
      "scripts/zip-branch-for-review.mjs",
      "--tracked-only",
      "--output",
      zipOutput,
      "--prefix",
      "tts-research-chatgpt-review",
    ],
    { cwd: repoRoot, maxBuffer: 20 * 1024 * 1024 },
  );

  const archiveBytes = await readFile(zipOutput);
  const archive = await JSZip.loadAsync(archiveBytes);
  const names = Object.keys(archive.files).filter((name) => !archive.files[name].dir);
  const forbidden = names.filter((name) => isForbiddenArchiveEntry(name));
  if (forbidden.length > 0) {
    throw new Error(`Archive contains forbidden entries:\n${forbidden.slice(0, 40).join("\n")}`);
  }

  const missingInArchive = requiredScreenshotFiles.filter(
    (required) => !names.some((name) => name.endsWith(`/${required}`)),
  );
  if (missingInArchive.length > 0) {
    throw new Error(
      `Archive was created but is missing required screenshot entries:\n${missingInArchive.map((item) => `- ${item}`).join("\n")}`,
    );
  }

  const sha256 = createHash("sha256").update(archiveBytes).digest("hex");
  const manifest = {
    archivePath: zipOutput,
    archiveSha256: sha256,
    archiveBytes: archiveBytes.length,
    createdAt: new Date().toISOString(),
    entryCount: names.length,
    requiredScreenshots: requiredScreenshotFiles,
    reviewMode: "tracked-source-plus-committed-ui-screenshots",
    schemaVersion: "chatgpt-review-package.v1",
  };
  const manifestPath = zipOutput.replace(/\.zip$/i, ".manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(stdout.trim());
  console.log(`ChatGPT review package verified: ${zipOutput}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`SHA256: ${sha256}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseArgs(args) {
  const options = { help: false, output: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg === "--output" || arg === "-o") {
      options.output = args[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

async function missingFiles(files) {
  const missing = [];
  for (const file of files) {
    try {
      const fileStat = await stat(path.join(repoRoot, file));
      if (!fileStat.isFile()) {
        missing.push(file);
      }
    } catch {
      missing.push(file);
    }
  }
  return missing;
}

function isForbiddenArchiveEntry(name) {
  const basename = path.basename(name);
  if (forbiddenEnvPattern.test(name) && basename !== ".env.example") {
    return true;
  }
  return forbiddenArchivePatterns.some((pattern) => pattern.test(name));
}

async function shortHead() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repoRoot,
  });
  return stdout.trim();
}

function helpText() {
  return `Usage: node scripts/create-chatgpt-review-package.mjs [--output path]\n\nCreates and verifies a ChatGPT review zip. The package is tracked-source-only and hard-fails unless committed UI screenshots for phone, constrained desktop, desktop, and large desktop are present in the archive.`;
}
