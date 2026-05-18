#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./benchmarks.mjs";
import { runFrontendBundleBenchmark } from "./frontend-performance.mjs";
import { createRunContext, finalizeRun, runCallbackStep, runCommandStep } from "./reporting.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const context = await createRunContext({ kind: "validate-local", rootDir });
const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);

const commandSteps = [
  {
    id: "format-check",
    title: "Format Check",
    command: "pnpm",
    args: ["format:check"],
  },
  {
    id: "lint",
    title: "Lint",
    command: "pnpm",
    args: ["lint"],
  },
  {
    id: "typecheck",
    title: "Typecheck",
    command: "pnpm",
    args: ["typecheck"],
  },
  {
    id: "backend-tests",
    title: "Backend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/backend", "test"],
  },
  {
    id: "adapter-tests",
    title: "Adapter Tests",
    command: "pnpm",
    args: ["test:adapters"],
  },
  {
    id: "frontend-tests",
    title: "Frontend Tests",
    command: "pnpm",
    args: ["--filter", "@tts-research/frontend", "test"],
  },
  {
    id: "content-ir-validation",
    title: "Content IR Validation",
    command: "pnpm",
    args: ["validate:ir"],
  },
  {
    id: "package-smoke",
    title: "Package Smoke",
    command: "pnpm",
    args: ["package:smoke"],
  },
  {
    id: "cli-parity",
    title: "CLI Parity",
    command: "pnpm",
    args: ["cli:parity"],
  },
];

for (const step of commandSteps) {
  await runCommandStep(context, step);
}

await runCallbackStep(
  context,
  {
    id: "frontend-bundle-performance",
    title: "Frontend Bundle Performance",
    command: "pnpm bundle:local",
  },
  ({ log }) => runFrontendBundleBenchmark({ rootDir, thresholds, log }),
);

await runCallbackStep(
  context,
  {
    id: "alignment-benchmark",
    title: "Alignment Benchmark",
    command: "alignment benchmark",
  },
  () => runAlignmentBenchmark({ rootDir, manifest, thresholds }),
);

await runCommandStep(context, {
  id: "book-cinema-e2e",
  title: "Book Cinema E2E Smoke",
  command: "pnpm",
  args: ["e2e:book-cinema"],
  env: {
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-e2e"),
    E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "book-cinema-e2e", "summary.json"),
    screenshots: path.join(context.artifactsDir, "book-cinema-e2e", "screenshots"),
  },
});

const summary = await finalizeRun(context);
console.log(`validate:local ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;
