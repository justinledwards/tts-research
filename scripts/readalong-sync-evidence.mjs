import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  collectWaivers,
  compareReadAlongSyncThresholds,
  countIssues,
  evaluateFixture,
  normalizeFixture,
} from "./readalong-sync-evidence-helpers.mjs";

export {
  buildFixtureTimings,
  formatReadAlongSyncBenchmark,
  renderReadAlongSyncSummary,
  renderSyncEvidenceHtml,
} from "./readalong-sync-evidence-helpers.mjs";

export const DEFAULT_READALONG_SYNC_THRESHOLDS = {
  maxDegradedTimePercentage: 35,
  maxMedianWordDriftMs: 150,
  maxMissedHighlightCount: 0,
  maxP95WordDriftMs: 150,
  maxPhraseDriftMs: 350,
  maxScrollJumpCount: 0,
  maxStaleHighlightCount: 0,
  maxWrongNodeCount: 0,
  maxWrongWordCount: 0,
  minFixtureCount: 10,
};

export async function loadReadAlongSyncFixtures(rootDir, configured = {}) {
  const manifestPath = path.resolve(rootDir, configured.manifest ?? "fixtures/sync/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = manifest.fixtureFiles?.length
    ? manifest.fixtureFiles
    : ["fixtures/sync/fixtures.json"];
  const fixtures = [];
  for (const file of files) {
    const filePath = path.resolve(rootDir, file);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    fixtures.push(
      ...(data.fixtures ?? []).map((fixture) => ({
        ...fixture,
        file: path.relative(rootDir, filePath),
      })),
    );
  }
  const requiredTypes = configured.requiredTypes ?? manifest.requiredTypes ?? [];
  const presentTypes = new Set(fixtures.map((fixture) => fixture.kind));
  const missingTypes = requiredTypes.filter((kind) => !presentTypes.has(kind));
  if (missingTypes.length > 0) {
    throw new Error(`Missing read-along sync fixture types: ${missingTypes.join(", ")}`);
  }
  return {
    fixtureFiles: files,
    fixtures: fixtures.map(normalizeFixture),
    manifest: {
      ...manifest,
      path: path.relative(rootDir, manifestPath),
    },
    requiredTypes,
  };
}

export function evaluateReadAlongSyncFixtures({
  fixtures,
  generatedAt = new Date().toISOString(),
  thresholds = DEFAULT_READALONG_SYNC_THRESHOLDS,
} = {}) {
  const normalizedFixtures = fixtures.map(normalizeFixture);
  const fixtureResults = normalizedFixtures.map(evaluateFixture);
  const timeline = fixtureResults.flatMap((fixture) => fixture.timeline);
  const wordDrifts = timeline
    .map((row) => row.wordDriftMs)
    .filter((value) => typeof value === "number");
  const phraseDrifts = timeline
    .map((row) => row.phraseDriftMs)
    .filter((value) => typeof value === "number");
  const totalObservedMs = timeline.reduce((sum, row) => sum + row.sampleDurationMs, 0);
  const degradedObservedMs = timeline
    .filter((row) => row.runtimeState === "degraded")
    .reduce((sum, row) => sum + row.sampleDurationMs, 0);

  const metrics = {
    degradedTimePercentage:
      totalObservedMs > 0 ? roundMetric((degradedObservedMs / totalObservedMs) * 100) : 0,
    fixtureCount: normalizedFixtures.length,
    maxPhraseDriftMs: roundMetric(max(phraseDrifts)),
    medianWordDriftMs: roundMetric(percentile(wordDrifts, 50)),
    missedHighlightCount: countIssues(timeline, "missed-highlight"),
    p95WordDriftMs: roundMetric(percentile(wordDrifts, 95)),
    phraseDriftSampleCount: phraseDrifts.length,
    resyncCount: timeline.filter((row) => row.runtimeState === "resyncing").length,
    scrollJumpCount: countIssues(timeline, "scroll-jump"),
    staleHighlightCount: countIssues(timeline, "stale-highlight"),
    wordDriftSampleCount: wordDrifts.length,
    wrongNodeCount: countIssues(timeline, "wrong-node"),
    wrongWordCount: countIssues(timeline, "wrong-word"),
  };

  const normalizedThresholds = {
    ...DEFAULT_READALONG_SYNC_THRESHOLDS,
    ...thresholds,
  };
  const comparisons = compareReadAlongSyncThresholds(metrics, normalizedThresholds);
  const failures = [
    ...timeline.flatMap((row) => row.failures),
    ...comparisons
      .filter((comparison) => !comparison.passed)
      .map(
        (comparison) =>
          `${comparison.metric} ${formatNumber(comparison.actual)} ${comparison.operator} ${formatNumber(
            comparison.expected,
          )}`,
      ),
  ];
  return {
    comparisons,
    fixtureResults,
    generatedAt,
    metrics,
    schemaVersion: "readalong-sync-results.v1",
    status: failures.length === 0 ? "passed" : "failed",
    thresholds: normalizedThresholds,
    timeline,
    waivers: collectWaivers(normalizedFixtures),
  };
}

export async function writeReadAlongSyncArtifacts({
  outputDir,
  result,
  rootDir,
  screenshots = [],
}) {
  await mkdir(outputDir, { recursive: true });
  const metricsPath = path.join(outputDir, "sync-metrics.json");
  const timelinePath = path.join(outputDir, "drift-timeline.json");
  const summaryPath = path.join(outputDir, "sync-summary.md");
  const resultWithScreenshots = {
    ...result,
    screenshots: screenshots.map((screenshot) => path.relative(rootDir, screenshot)),
  };
  await writeFile(metricsPath, `${JSON.stringify(resultWithScreenshots, null, 2)}\n`);
  await writeFile(timelinePath, `${JSON.stringify(result.timeline, null, 2)}\n`);
  await writeFile(summaryPath, renderReadAlongSyncSummary(resultWithScreenshots));
  return {
    metrics: metricsPath,
    summary: summaryPath,
    timeline: timelinePath,
  };
}

function max(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}
