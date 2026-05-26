import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildGoldenMinuteSyncFixture,
  evaluateGoldenMinuteFluency,
  evaluateGoldenMinuteSpeechFluency,
  evaluateGoldenMinuteSync,
  loadGoldenMinuteFixture,
  validateGoldenMinuteFixture,
} from "./golden-minute-fixture.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("golden minute fixture covers the required one-minute reading features", async () => {
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const validation = validateGoldenMinuteFixture(fixture);

  assert.deepEqual(validation.failures, []);
  assert.equal(validation.status, "passed");
  assert.equal(validation.coverage.segmentCount, 8);
  assert.equal(validation.coverage.citationPolicy, "onDemand");
  assert.ok(validation.coverage.durationMs >= 55_000);
  assert.ok(validation.coverage.durationMs <= 70_000);
  assert.ok(validation.coverage.phraseTimingCount >= 8);
  assert.ok(validation.coverage.wordTimingCount >= 8);
});

test("golden minute sync baseline passes local drift thresholds", async () => {
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const syncFixture = buildGoldenMinuteSyncFixture(fixture);
  const result = evaluateGoldenMinuteSync(fixture);

  assert.equal(syncFixture.nodes.length, 8);
  assert.equal(syncFixture.observations.length, 8);
  assert.equal(result.status, "passed");
  assert.equal(result.metrics.fixtureCount, 1);
  assert.equal(result.metrics.wrongNodeCount, 0);
  assert.equal(result.metrics.staleHighlightCount, 0);
});

test("golden minute speech fluency baseline passes local seam thresholds", async () => {
  const fixture = await loadGoldenMinuteFixture(rootDir);
  const report = evaluateGoldenMinuteSpeechFluency(fixture);

  assert.equal(report.status, "passed");
  assert.equal(report.metrics.clippedStartCount, 0);
  assert.equal(report.metrics.clippedEndCount, 0);
  assert.equal(report.metrics.silentSegmentCount, 0);
  assert.equal(report.metrics.excessivePauseCount, 0);
});

test("golden minute fluency rubric fails without visible segment handoff evidence", async () => {
  const fixture = await loadGoldenMinuteFixture(rootDir);

  assert.equal(
    evaluateGoldenMinuteFluency(fixture, {
      segmentTransitionState: { uniqueActiveSegments: 1 },
    }).status,
    "failed",
  );
  assert.equal(
    evaluateGoldenMinuteFluency(fixture, {
      segmentTransitionState: { uniqueActiveSegments: 2 },
    }).status,
    "passed",
  );
});
