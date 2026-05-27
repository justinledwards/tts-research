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
import {
  buildGoldenMinuteVisualTimeline,
  renderGoldenMinuteVisualTimeline,
} from "./golden-minute-visual-timeline.mjs";

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

test("golden minute visual timeline summarizes continuity evidence", () => {
  const timeline = buildGoldenMinuteVisualTimeline({
    checkpoints: [
      {
        audioTimeSec: 1.25,
        label: "play-start",
        nodeId: "segment-1",
        scroll: { y: 0 },
        text: "Opening word",
        visible: true,
        wordIndex: "0",
      },
      {
        audioTimeSec: 11.5,
        label: "seek-10",
        nodeId: "segment-2",
        scroll: { y: 220 },
        text: "After seek",
        visible: true,
        wordIndex: "18",
      },
      {
        audioTimeSec: 12.0,
        label: "speed-change-1.25x",
        nodeId: "segment-2",
        playbackRate: 1.25,
        scroll: { y: 220 },
        text: "After speed change",
        visible: true,
        wordIndex: "19",
      },
      {
        audioTimeSec: 47.0,
        label: "resume",
        nodeId: "segment-4",
        scroll: { y: 900 },
        text: "Resume target",
        visible: true,
        wordIndex: "120",
      },
    ],
    generatedAt: "2026-05-27T00:08:00.000Z",
    sampleIntervalSec: 2,
    sync: {
      timeline: [
        {
          audioTimeMs: 1250,
          observationId: "gm-1",
          phraseDriftMs: 0,
          runtimeState: "synced-word",
          wordDriftMs: 20,
        },
      ],
    },
    traceArtifacts: {
      enabled: true,
      tracePath: "output/golden-minute/latest/golden-minute-trace.zip",
    },
  });
  const markdown = renderGoldenMinuteVisualTimeline(timeline);

  assert.equal(timeline.summary.coveredEvents.seek, true);
  assert.equal(timeline.summary.coveredEvents.resume, true);
  assert.equal(timeline.summary.coveredEvents["speed-change"], true);
  assert.equal(timeline.summary.segmentHandoffCount, 2);
  assert.match(markdown, /Golden-Minute Visual Timeline/);
  assert.match(markdown, /speed-change-1.25x/);
  assert.match(markdown, /Segment Handoffs/);
});
