import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFixtureTimings,
  DEFAULT_READALONG_SYNC_THRESHOLDS,
  evaluateReadAlongSyncFixtures,
  loadReadAlongSyncFixtures,
  renderSyncEvidenceHtml,
} from "./readalong-sync-evidence.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("read-along sync fixtures cover required timing scenarios", async () => {
  const fixtureSet = await loadReadAlongSyncFixtures(rootDir);
  assert.equal(fixtureSet.fixtures.length >= 10, true);
  assert.equal(fixtureSet.requiredTypes.includes("stale-audio"), true);
  assert.equal(fixtureSet.requiredTypes.includes("heuristic-degraded"), true);
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

test("Markdown skipped-block fixtures keep visible blocks out of spoken indexes", async () => {
  const fixtureSet = await loadReadAlongSyncFixtures(rootDir);
  const fixture = fixtureSet.fixtures.find(
    (candidate) => candidate.id === "markdown-skipped-block-integrity",
  );
  assert(fixture, "markdown skipped-block fixture should be present");

  const timings = buildFixtureTimings(fixture);
  assert.deepEqual(
    timings.words.map((word) => [word.nodeId, word.wordIndex, word.text]),
    [
      ["md-p1", 0, "Opening"],
      ["md-p1", 1, "paragraph"],
      ["md-p1", 2, "remains"],
      ["md-p1", 3, "first"],
      ["md-p1", 4, "spoken"],
      ["md-p1", 5, "target."],
      ["md-p2", 6, "Second"],
      ["md-p2", 7, "paragraph"],
      ["md-p2", 8, "follows"],
      ["md-p2", 9, "skipped"],
      ["md-p2", 10, "table"],
      ["md-p2", 11, "without"],
      ["md-p2", 12, "index"],
      ["md-p2", 13, "drift."],
      ["summary-inside-section", 14, "Table"],
      ["summary-inside-section", 15, "summary"],
      ["bookmark-target", 16, "Bookmark"],
      ["bookmark-target", 17, "target"],
      ["bookmark-target", 18, "paragraph"],
      ["bookmark-target", 19, "follows"],
      ["bookmark-target", 20, "references"],
      ["bookmark-target", 21, "exactly."],
    ],
  );
  assert.equal(
    timings.words.some((word) => word.nodeId === "reference-before-bookmark"),
    false,
  );
  assert.equal(
    timings.blocks.some((block) => block.nodeId === "reference-before-bookmark"),
    false,
  );

  const result = evaluateReadAlongSyncFixtures({
    fixtures: [fixture],
    thresholds: { ...DEFAULT_READALONG_SYNC_THRESHOLDS, minFixtureCount: 1 },
  });
  assert.equal(result.status, "passed");
  assert.equal(result.metrics.wrongNodeCount, 0);
  assert.equal(result.metrics.missedHighlightCount, 0);

  const html = renderSyncEvidenceHtml(fixture, result.timeline);
  assert.match(html, /data-visible-node-id="skip-before-intro-code"/);
  assert.match(html, /data-visible-node-id="skip-between-table"/);
  assert.match(html, /data-visible-node-id="reference-before-bookmark"/);
  assert.match(html, /data-visible-node-id="skip-end-diagram"/);
  assert.match(html, /data-readalong-node-id="summary-inside-section"/);
  assert.doesNotMatch(
    html,
    /data-visible-node-id="reference-before-bookmark"[^>]*data-sync-active="true"/,
  );
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
  assert.match(result.timeline[0].failures.join("\n"), /Wrong visible block/);
});
