#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig } from "./validate-local/benchmarks.mjs";
import {
  evaluateReadAlongSyncFixtures,
  formatReadAlongSyncBenchmark,
  loadReadAlongSyncFixtures,
  writeReadAlongSyncArtifacts,
} from "./readalong-sync-evidence.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.READALONG_SYNC_OUTPUT_DIR ?? path.join(rootDir, "output", "readalong-sync", "latest");

const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);
const fixtureSet = await loadReadAlongSyncFixtures(rootDir, manifest.readAlongSync);
const result = evaluateReadAlongSyncFixtures({
  fixtures: fixtureSet.fixtures,
  thresholds: thresholds.readAlongSync,
});
const artifacts = await writeReadAlongSyncArtifacts({ outputDir, result, rootDir });

console.log(formatReadAlongSyncBenchmark(result));
console.log(`Artifacts: ${path.relative(rootDir, artifacts.summary)}`);
process.exitCode = result.status === "passed" ? 0 : 1;
