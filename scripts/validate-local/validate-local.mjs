#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig, runAlignmentBenchmark } from "./benchmarks.mjs";
import { runFrontendBundleBenchmark } from "./frontend-performance.mjs";
import { evaluateReaderTimingSummary } from "./reader-timing.mjs";
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

const bookCinemaStep = await runCommandStep(context, {
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
await attachReaderTimingBudgets(bookCinemaStep, thresholds);

await runCommandStep(context, {
  id: "book-cinema-responsive-e2e",
  title: "Book Cinema Responsive E2E Smoke",
  command: "pnpm",
  args: ["e2e:book-cinema:responsive"],
  env: {
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "book-cinema-responsive-e2e"),
    E2E_SCREENSHOT_DIR: path.join(
      context.artifactsDir,
      "book-cinema-responsive-e2e",
      "screenshots",
    ),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "summary.json"),
    screenshots: path.join(context.artifactsDir, "book-cinema-responsive-e2e", "screenshots"),
  },
});

await runCommandStep(context, {
  id: "workspace-flow-e2e",
  title: "Workspace Flow E2E Smoke",
  command: "pnpm",
  args: ["e2e:workspace-flow"],
  env: {
    E2E_ARTIFACT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e"),
    E2E_SCREENSHOT_DIR: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
    E2E_SUMMARY_PATH: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
  },
  artifacts: {
    e2eSummary: path.join(context.artifactsDir, "workspace-flow-e2e", "summary.json"),
    screenshots: path.join(context.artifactsDir, "workspace-flow-e2e", "screenshots"),
  },
});

const summary = await finalizeRun(context);
console.log(`validate:local ${summary.status}; report: ${summary.reports.markdown}`);
process.exitCode = summary.status === "passed" ? 0 : 1;

async function attachReaderTimingBudgets(step, thresholds) {
  const summaryPath = step.artifacts?.e2eSummary;
  if (!summaryPath) {
    return;
  }
  try {
    const e2eSummary = JSON.parse(await readFile(summaryPath, "utf8"));
    const readerTiming = evaluateReaderTimingSummary(e2eSummary, thresholds?.readerTiming ?? {});
    step.metrics = readerTiming.metrics;
    step.thresholds = readerTiming.thresholds;
    const failedThreshold = readerTiming.thresholds.some((threshold) => !threshold.passed);
    if (failedThreshold) {
      step.status = "failed";
      step.exitCode = 1;
      step.error = step.error
        ? `${step.error} One or more reader timing thresholds failed.`
        : "One or more reader timing thresholds failed.";
    }
  } catch (error) {
    if (step.status === "passed") {
      step.status = "failed";
      step.exitCode = 1;
      step.error =
        error instanceof Error
          ? `Unable to read Book Cinema timing summary: ${error.message}`
          : String(error);
    }
  }
}
