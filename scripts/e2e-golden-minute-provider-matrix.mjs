#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  evaluateGoldenMinuteProviderMatrix,
  loadGoldenMinuteFixture,
  renderGoldenMinuteProviderMatrix,
} from "./golden-minute-fixture.mjs";
import { writeJson } from "./e2e-browser-qa-helpers.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_GOLDEN_MINUTE_MATRIX_OUTPUT_DIR ??
  path.join(rootDir, "output", "golden-minute", "matrix", "latest");

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  await mkdir(outputDir, { recursive: true }).catch(() => {});
  await writeJson(path.join(outputDir, "provider-matrix.json"), {
    error: message,
    generatedAt: new Date().toISOString(),
    schemaVersion: "golden-minute-provider-matrix.v1",
    status: "failed",
  }).catch(() => {});
  process.exitCode = 1;
});

async function main() {
  await mkdir(outputDir, { recursive: true });
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const matrix = evaluateGoldenMinuteProviderMatrix(fixture);
  const jsonPath = path.join(outputDir, "provider-matrix.json");
  const markdownPath = path.join(outputDir, "provider-matrix.md");

  await writeJson(jsonPath, matrix);
  await writeFile(markdownPath, renderGoldenMinuteProviderMatrix(matrix));

  console.log(`Golden minute provider matrix ${matrix.status}. Reports written to ${outputDir}`);
  process.exitCode = matrix.status === "passed" ? 0 : 1;
}
