import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { runVoiceStudioCli } from "../dist/index.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("validates a Content IR fixture", async () => {
  await runVoiceStudioCli([
    "ir",
    "validate",
    path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
    "--json",
  ]);
});

test("builds a speech plan file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "voice-studio-cli-"));
  try {
    const out = path.join(dir, "speech-plan.json");
    await runVoiceStudioCli([
      "speech-plan",
      "build",
      path.join(repoRoot, "fixtures/contracts/markdown.content-ir.v1.json"),
      "--out",
      out,
      "--generated-at",
      "2026-05-18T00:00:00.000Z",
      "--json",
    ]);
    const plan = JSON.parse(await readFile(out, "utf8"));
    assert.equal(plan.schemaVersion, "speech-plan.v1");
    assert.ok(plan.segments.length > 0);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});
