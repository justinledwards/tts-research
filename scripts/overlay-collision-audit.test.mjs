import assert from "node:assert/strict";
import { test } from "node:test";
import {
  overlayCollisionOverlapArea,
  renderOverlayCollisionReport,
  summarizeOverlayCollisionReports,
} from "./overlay-collision-audit.mjs";

test("computes overlap area for intersecting rectangles", () => {
  assert.equal(
    overlayCollisionOverlapArea(
      { bottom: 100, left: 0, right: 100, top: 0 },
      { bottom: 120, left: 50, right: 120, top: 50 },
    ),
    2500,
  );
});

test("summarizes overlay collision findings across reports", () => {
  const summary = summarizeOverlayCollisionReports([
    {
      findings: [{ kind: "overlay-collision" }],
      summary: { overlays: 2, protectedTargets: 4 },
    },
    {
      findings: [],
      summary: { overlays: 1, protectedTargets: 3 },
    },
  ]);

  assert.deepEqual(summary, {
    failures: 1,
    overlays: 3,
    protectedTargets: 7,
    reports: 2,
  });
});

test("renders no-finding collision report for reviewer artifacts", () => {
  const markdown = renderOverlayCollisionReport({
    generatedAt: "2026-05-25T18:00:00.000Z",
    reports: [{ findings: [], summary: { overlays: 1, protectedTargets: 2 } }],
  });

  assert.match(markdown, /No overlay collisions detected/);
});
