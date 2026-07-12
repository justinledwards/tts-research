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
import { mkdir, rm, writeFile } from "node:fs/promises";

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
  let syncDebugSnapshot = null;
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
            activeReadAlongNodeId: active?.getAttribute("data-readalong-node-id") ?? null,
            activeReadAlongSourceId: active?.getAttribute("data-readalong-source-id") ?? null,
            activeReadAlongTimingState: active?.getAttribute("data-readalong-timing-state") ?? null,
            activeReadAlongWordIndex: active?.getAttribute("data-readalong-word-index") ?? null,
            activeSourceWordId: active?.getAttribute("data-source-word-id") ?? null,
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
        if (
          check.expectedNodeId &&
          check.activeNodeId &&
          check.activeNodeId !== check.expectedNodeId
        ) {
          browserFailures.push(
            `${check.observationId} wrong visible block: active node ${check.activeNodeId} did not match expected node ${check.expectedNodeId}.`,
          );
        }
        if (check.activeNodeId && check.activeReadAlongNodeId !== check.activeNodeId) {
          browserFailures.push(
            `${check.observationId} active read-along node ${check.activeReadAlongNodeId} did not match DOM sync node ${check.activeNodeId}.`,
          );
        }
        if (check.activeWordIndex && check.activeReadAlongWordIndex !== check.activeWordIndex) {
          browserFailures.push(
            `${check.observationId} active read-along word ${check.activeReadAlongWordIndex} did not match DOM sync word ${check.activeWordIndex}.`,
          );
        }
        if (check.activeNodeId && !check.activeReadAlongSourceId) {
          browserFailures.push(`${check.observationId} active highlight had no source id.`);
        }
        if (check.activeNodeId && !check.activeSourceWordId) {
          browserFailures.push(`${check.observationId} active highlight had no source word id.`);
        }
        if (check.activeNodeId && !check.activeReadAlongTimingState) {
          browserFailures.push(`${check.observationId} active highlight had no timing state.`);
        }
      }
      const screenshot = path.join(screenshotsDir, `${fixture.id}.png`);
      await page.screenshot({ fullPage: true, path: screenshot });
      screenshots.push(screenshot);
      if (!syncDebugSnapshot && timelineRows[0]) {
        syncDebugSnapshot = buildSyncDebugSnapshot({
          fixture,
          generatedAt: result.generatedAt,
          rootDir,
          row: timelineRows[0],
          screenshot,
        });
      }
    }
    browserFailures.push(...blockingPageIssues(issues));
  } finally {
    await browser.close();
  }
  const syncDebugSnapshotPath = path.join(outputDir, "sync-debug-snapshot.json");
  if (syncDebugSnapshot) {
    await writeFile(syncDebugSnapshotPath, `${JSON.stringify(syncDebugSnapshot, null, 2)}\n`);
  }
  const e2eResult = {
    ...result,
    browser: {
      failureCount: browserFailures.length,
      failures: browserFailures,
      screenshotCount: screenshots.length,
      syncDebugSnapshot: syncDebugSnapshot ? path.relative(rootDir, syncDebugSnapshotPath) : null,
    },
    status: result.status === "passed" && browserFailures.length === 0 ? "passed" : "failed",
  };
  await writeReadAlongSyncArtifacts({ outputDir, result: e2eResult, rootDir, screenshots });
  console.log(`Read-along sync E2E ${e2eResult.status}. Artifacts written to ${outputDir}`);
  process.exitCode = e2eResult.status === "passed" ? 0 : 1;
}

function buildSyncDebugSnapshot({ fixture, generatedAt, rootDir, row, screenshot }) {
  const audioTimeSec = Math.max(0, row.audioTimeMs / 1000);
  const activeWordIndex = row.highlightedWordIndex ?? row.expectedWordIndex ?? null;
  const activePhraseIndex = row.highlightedPhraseIndex ?? row.expectedPhraseIndex ?? null;
  const locatorValue = `fixture:${fixture.id}:${row.observationId}`;
  return {
    activeCue: {
      activeWordIndex,
      fragmentIndex: activePhraseIndex,
      nodeId: row.highlightedNodeId ?? row.expectedNodeId ?? null,
      phraseWordEnd: null,
      phraseWordStart: null,
      readingPosition: {
        activeWordIndex,
        nodeId: row.highlightedNodeId ?? row.expectedNodeId ?? null,
        textQuote: fixture.title,
      },
      segmentIndex: null,
      text: null,
      timingMs: {
        end: null,
        start: null,
      },
      tokenIndex: activeWordIndex,
    },
    activePhrase: {
      id: activePhraseIndex === null ? null : String(activePhraseIndex),
      index: activePhraseIndex,
      label:
        activePhraseIndex === null ? "No active phrase" : `Phrase ${String(activePhraseIndex + 1)}`,
      text: null,
    },
    activeSegment: {
      id: row.expectedNodeId ?? null,
      index: null,
      label: row.expectedNodeId ?? "No active segment",
      text: null,
    },
    activeWord: {
      id: activeWordIndex === null ? null : String(activeWordIndex),
      index: activeWordIndex,
      label: activeWordIndex === null ? "No active word" : `Word ${String(activeWordIndex)}`,
      text: null,
    },
    capturedAt: generatedAt,
    confidence: null,
    currentAudioTimeSec: audioTimeSec,
    currentAudioTimestamp: formatAudioTimestamp(audioTimeSec),
    currentSourceLocator: {
      activeWordIndex,
      blockId: row.highlightedNodeId ?? row.expectedNodeId ?? null,
      bookmarkTarget: locatorValue,
      kind: "fixture",
      sourceId: fixture.id,
      sourceTitle: fixture.title,
      textQuote: fixture.title,
      value: locatorValue,
    },
    degradedModeReason:
      row.runtimeState === "degraded" ? "Fixture entered degraded read-along sync." : null,
    driftMs: row.wordDriftMs ?? row.phraseDriftMs ?? null,
    expectedCue: {
      activeWordIndex: row.expectedWordIndex ?? null,
      fragmentIndex: row.expectedPhraseIndex ?? null,
      nodeId: row.expectedNodeId ?? null,
      phraseWordEnd: null,
      phraseWordStart: null,
      readingPosition: {
        activeWordIndex: row.expectedWordIndex ?? null,
        nodeId: row.expectedNodeId ?? null,
        textQuote: fixture.title,
      },
      segmentIndex: null,
      text: null,
      timingMs: {
        end: null,
        start: null,
      },
      tokenIndex: row.expectedWordIndex ?? null,
    },
    exportHints: {
      jsonFileName: "sync-debug-snapshot.json",
      screenshot: path.relative(rootDir, screenshot),
      screenshotRecommended: true,
    },
    highlightMode: highlightModeForRow(row),
    manualQaMarker: null,
    resyncCount: row.runtimeState === "resyncing" ? 1 : 0,
    runtimeState: row.runtimeState,
    schemaVersion: "sync-debug-snapshot.v1",
    surface: "ReadAlongSyncFixture",
    timingSource: fixture.timingSource,
  };
}

function highlightModeForRow(row) {
  if (row.runtimeState === "degraded") {
    return "block";
  }
  if (row.expectedLevel === "phrase" || row.runtimeState === "resyncing") {
    return "phrase";
  }
  return "word";
}

function formatAudioTimestamp(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}
