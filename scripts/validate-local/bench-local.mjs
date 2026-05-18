#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig, runAlignmentBenchmark, runMarkdownBenchmark } from "./benchmarks.mjs";
import { createRunContext, finalizeRun, runCallbackStep } from "./reporting.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const context = await createRunContext({ kind: "bench-local", rootDir });
const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);

await runCallbackStep(
  context,
  {
    id: "alignment-benchmark",
    title: "Alignment Benchmark",
    command: "alignment benchmark",
  },
  () => runAlignmentBenchmark({ rootDir, manifest, thresholds }),
);

await runCallbackStep(
  context,
  {
    id: "markdown-benchmark",
    title: "Markdown Adapter Benchmark",
    command: "markdown adapter benchmark",
  },
  () => runMarkdownBenchmark({ rootDir, manifest, thresholds }),
);

const summary = await finalizeRun(context);
console.log(`bench:local ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;
