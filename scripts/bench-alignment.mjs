#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./validate-local/benchmarks.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);
const result = await runAlignmentBenchmark({
  rootDir,
  manifest,
  thresholds: process.argv.includes("--check") ? thresholds : {},
});

console.log(result.output);
if (result.thresholds.some((threshold) => !threshold.passed)) {
  process.exitCode = 1;
}
