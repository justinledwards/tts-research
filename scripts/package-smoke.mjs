#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = process.cwd();
const tempDir = await mkdtemp(path.join(tmpdir(), "voice-studio-packages-"));
const tarballDir = path.join(tempDir, "tarballs");
const appDir = path.join(tempDir, "app");
const venvDir = path.join(tempDir, "venv");

try {
  await run("pnpm", ["package:build"], repoRoot);
  await run("pnpm", ["--filter", "@tts-research/schema", "pack", "--dry-run"], repoRoot);
  await run("pnpm", ["--filter", "@tts-research/sdk-ts", "pack", "--dry-run"], repoRoot);
  await run("pnpm", ["--filter", "@tts-research/cli", "pack", "--dry-run"], repoRoot);
  await run(
    "pnpm",
    ["--filter", "@tts-research/schema", "pack", "--pack-destination", tarballDir],
    repoRoot,
  );
  await run(
    "pnpm",
    ["--filter", "@tts-research/sdk-ts", "pack", "--pack-destination", tarballDir],
    repoRoot,
  );
  await run(
    "pnpm",
    ["--filter", "@tts-research/cli", "pack", "--pack-destination", tarballDir],
    repoRoot,
  );

  const tarballs = (await readdir(tarballDir))
    .filter((file) => file.endsWith(".tgz"))
    .map((file) => path.join(tarballDir, file));
  const tarballByName = Object.fromEntries(
    tarballs.map((tarball) => [path.basename(tarball).replace(/^tts-research-/, ""), tarball]),
  );
  await mkdir(appDir, { recursive: true });
  const schemaTarball = requiredTarball(tarballByName, "schema-0.0.0.tgz");
  const sdkTarball = requiredTarball(tarballByName, "sdk-ts-0.0.0.tgz");
  const cliTarball = requiredTarball(tarballByName, "cli-0.0.0.tgz");
  await writeFile(
    path.join(appDir, "package.json"),
    `${JSON.stringify(
      {
        type: "module",
        dependencies: {
          "@tts-research/cli": `file:${cliTarball}`,
          "@tts-research/schema": `file:${schemaTarball}`,
          "@tts-research/sdk-ts": `file:${sdkTarball}`,
        },
        pnpm: {
          overrides: {
            "@tts-research/cli": `file:${cliTarball}`,
            "@tts-research/schema": `file:${schemaTarball}`,
            "@tts-research/sdk-ts": `file:${sdkTarball}`,
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  await run("pnpm", ["install", "--ignore-scripts"], appDir);
  await writeFile(
    path.join(appDir, "smoke.mjs"),
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSpeechPlanFromContentIR, validateContentIR } from "@tts-research/sdk-ts";
const fixture = JSON.parse(await readFile(${JSON.stringify(
      path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
    )}, "utf8"));
assert.equal(validateContentIR(fixture).valid, true);
const plan = buildSpeechPlanFromContentIR(fixture, { generatedAt: "2026-05-18T00:00:00.000Z" });
assert.equal(plan.schemaVersion, "speech-plan.v1");
`,
  );
  await run("node", ["smoke.mjs"], appDir);
  await run(
    "pnpm",
    [
      "exec",
      "voice-studio",
      "ir",
      "validate",
      path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
      "--json",
    ],
    appDir,
  );

  await run("python3", ["-m", "venv", "--system-site-packages", venvDir], repoRoot);
  const python = path.join(venvDir, "bin/python");
  const wheelDir = path.join(tempDir, "wheels");
  await run(python, ["-m", "pip", "install", "setuptools>=69", "wheel"], repoRoot);
  await run(
    python,
    ["-m", "pip", "wheel", "--no-deps", "--no-build-isolation", "-w", wheelDir, "packages/sdk-py"],
    repoRoot,
  );
  const wheel = (await readdir(wheelDir)).find((file) => file.endsWith(".whl"));
  if (!wheel) {
    throw new Error("Python SDK wheel was not created.");
  }
  await run(python, ["-m", "pip", "install", "--no-deps", path.join(wheelDir, wheel)], repoRoot);
  await writeFile(
    path.join(tempDir, "python-smoke.py"),
    `import json
from pathlib import Path
from voice_studio_sdk import CONTENT_IR_SCHEMA_VERSION, load_schema, validate_schema
payload = json.loads(Path(${JSON.stringify(
      path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
    )}).read_text())
assert CONTENT_IR_SCHEMA_VERSION == "content-ir.v1"
assert load_schema("content-ir.v1")["title"] == "Content IR v1"
valid, errors = validate_schema(payload)
assert valid, errors
`,
  );
  await run(python, [path.join(tempDir, "python-smoke.py")], repoRoot);
  console.log("Package smoke tests passed.");
} finally {
  if (process.env.KEEP_PACKAGE_SMOKE_ARTIFACTS !== "1") {
    await rm(tempDir, { force: true, recursive: true });
  } else {
    console.log(`Kept smoke artifacts at ${tempDir}`);
  }
}

async function run(command, args, cwd) {
  const { stdout, stderr } = await execFileAsync(command, args, {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (stdout.trim()) {
    console.log(stdout.trim());
  }
  if (stderr.trim()) {
    console.error(stderr.trim());
  }
}

function requiredTarball(tarballByName, name) {
  const tarball = tarballByName[name];
  if (!tarball) {
    throw new Error(`Missing tarball ${name}`);
  }
  return tarball;
}
