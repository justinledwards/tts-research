#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { loadBenchmarkConfig } from "./validate-local/benchmarks.mjs";
import {
  blockingPageIssues,
  collectPageIssues,
  loadPlaywright,
} from "./e2e-browser-qa-helpers.mjs";
import {
  evaluateReadAlongSyncFixtures,
  loadReadAlongSyncFixtures,
  renderSyncEvidenceHtml,
  writeReadAlongSyncArtifacts,
} from "./readalong-sync-evidence.mjs";
import { mkdir, rm } from "node:fs/promises";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir =
  process.env.E2E_READALONG_SYNC_OUTPUT_DIR ??
  path.join(rootDir, "output", "readalong-sync", "latest");
const screenshotsDir = path.join(outputDir, "screenshots");

main().catch(async (error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  await rm(outputDir, { force: true, recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const { manifest, thresholds } = await loadBenchmarkConfig(rootDir);
  const fixtureSet = await loadReadAlongSyncFixtures(rootDir, manifest.readAlongSync);
  const result = evaluateReadAlongSyncFixtures({
    fixtures: fixtureSet.fixtures,
    thresholds: thresholds.readAlongSync,
  });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: process.env.E2E_HEADLESS !== "0" });
  const screenshots = [];
  const browserFailures = [];
  try {
    const page = await browser.newPage({ viewport: { height: 900, width: 1280 } });
    page.setDefaultTimeout(30_000);
    const issues = collectPageIssues(page);
    for (const fixture of fixtureSet.fixtures) {
      const timelineRows = result.timeline.filter((row) => row.fixtureId === fixture.id);
      await page.setContent(renderSyncEvidenceHtml(fixture, timelineRows));
      const checks = await page.evaluate(() =>
        [...document.querySelectorAll("[data-sync-observation-id]")].map((row) => {
          const active = row.querySelector('[data-sync-active="true"]');
          return {
            activeNodeId: active?.getAttribute("data-sync-node-id") ?? null,
            activeWordIndex: active?.getAttribute("data-sync-word-index") ?? null,
            expectedNodeId: row.getAttribute("data-sync-expected-node") || null,
            highlightedNodeId: row.getAttribute("data-sync-highlighted-node") || null,
            observationId: row.getAttribute("data-sync-observation-id"),
            runtimeState: row.getAttribute("data-sync-runtime-state"),
          };
        }),
      );
      for (const check of checks) {
        if (check.runtimeState === "stale-audio" && check.activeNodeId) {
          browserFailures.push(
            `${check.observationId} rendered an active highlight for stale audio.`,
          );
        }
        if (check.highlightedNodeId && check.activeNodeId !== check.highlightedNodeId) {
          browserFailures.push(
            `${check.observationId} DOM active node ${check.activeNodeId} did not match evidence ${check.highlightedNodeId}.`,
          );
        }
      }
      const screenshot = path.join(screenshotsDir, `${fixture.id}.png`);
      await page.screenshot({ fullPage: true, path: screenshot });
      screenshots.push(screenshot);
    }
    browserFailures.push(...blockingPageIssues(issues));
  } finally {
    await browser.close();
  }
  const e2eResult = {
    ...result,
    browser: {
      failureCount: browserFailures.length,
      failures: browserFailures,
      screenshotCount: screenshots.length,
    },
    status: result.status === "passed" && browserFailures.length === 0 ? "passed" : "failed",
  };
  await writeReadAlongSyncArtifacts({ outputDir, result: e2eResult, rootDir, screenshots });
  console.log(`Read-along sync E2E ${e2eResult.status}. Artifacts written to ${outputDir}`);
  process.exitCode = e2eResult.status === "passed" ? 0 : 1;
}
