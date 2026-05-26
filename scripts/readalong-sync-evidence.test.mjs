import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_READALONG_SYNC_THRESHOLDS,
  evaluateReadAlongSyncFixtures,
  loadReadAlongSyncFixtures,
} from "./readalong-sync-evidence.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("read-along sync fixtures cover required timing scenarios", async () => {
  const fixtureSet = await loadReadAlongSyncFixtures(rootDir);
  assert.equal(fixtureSet.fixtures.length >= 10, true);
  assert.equal(fixtureSet.requiredTypes.includes("stale-audio"), true);
  assert.equal(fixtureSet.requiredTypes.includes("website-article"), true);
});

test("read-along sync benchmark passes fixture thresholds", async () => {
  const fixtureSet = await loadReadAlongSyncFixtures(rootDir);
  const result = evaluateReadAlongSyncFixtures({
    fixtures: fixtureSet.fixtures,
    thresholds: DEFAULT_READALONG_SYNC_THRESHOLDS,
  });
  assert.equal(result.status, "passed");
  assert.equal(result.metrics.wrongNodeCount, 0);
  assert.equal(result.metrics.staleHighlightCount, 0);
  assert.equal(result.metrics.missedHighlightCount, 0);
  assert.equal(result.metrics.degradedTimePercentage > 0, true);
});

test("read-along sync benchmark fails wrong-node highlights hard", () => {
  const result = evaluateReadAlongSyncFixtures({
    fixtures: [
      {
        expectedLevel: "word",
        id: "wrong-node-fixture",
        kind: "unit",
        nodes: [
          { durationMs: 1000, nodeId: "expected", startMs: 0, text: "expected token" },
          { durationMs: 1000, nodeId: "other", startMs: 1000, text: "other token" },
        ],
        observations: [
          {
            audioTimeMs: 250,
            highlightedNodeId: "other",
            highlightedWordIndex: 2,
            id: "wrong-node",
          },
        ],
        timingSource: "provider-word",
        title: "Wrong node fixture",
      },
    ],
    thresholds: DEFAULT_READALONG_SYNC_THRESHOLDS,
  });
  assert.equal(result.status, "failed");
  assert.equal(result.metrics.wrongNodeCount, 1);
});
