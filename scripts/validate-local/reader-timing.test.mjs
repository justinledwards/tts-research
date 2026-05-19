import test from "node:test";
import assert from "node:assert/strict";
import {
  compareReaderTimingBudgets,
  formatReaderTimingReport,
  summarizeReaderTimingSummary,
} from "./reader-timing.mjs";

test("summarizes reader timing metrics across Book Cinema fixtures", () => {
  const metrics = summarizeReaderTimingSummary({
    lowResourceMode: true,
    performance: [
      {
        kind: "epub",
        metrics: {
          firstOpen: {
            degradedStates: [
              {
                detail: { reason: "fixture" },
                name: "low-confidence-highlight",
                surface: "book-cinema",
              },
            ],
            metrics: [
              { durationMs: 1400.2, name: "app-cold-usable" },
              { durationMs: 80, name: "studio-route-switch" },
              { durationMs: 230.3, name: "book-cinema-open" },
            ],
          },
          resumed: {
            metrics: [
              { durationMs: 235.3, name: "book-cinema-open" },
              { durationMs: 260.4, name: "reader-resume" },
            ],
          },
        },
      },
      {
        kind: "pdf",
        metrics: {
          resumed: {
            metrics: [
              { durationMs: 1500.5, name: "app-cold-usable" },
              { durationMs: 120.4, name: "studio-route-switch" },
              { durationMs: 270.1, name: "book-cinema-open" },
              { durationMs: 280.8, name: "reader-resume" },
            ],
          },
        },
      },
    ],
  });

  assert.equal(metrics.lowResourceMode, true);
  assert.deepEqual(metrics.fixtureKinds, ["epub", "pdf"]);
  assert.equal(metrics.metrics["app-cold-usable"].maxMs, 1500.5);
  assert.equal(metrics.metrics["book-cinema-open"].byKind.pdf, 270.1);
  assert.equal(metrics.metrics["book-cinema-open"].count, 3);
  assert.equal(metrics.metrics["studio-route-switch"].byKind.epub, 80);
  assert.equal(metrics.degradedStates.total, 1);
  assert.equal(metrics.degradedStates.byName["low-confidence-highlight"], 1);
  assert.deepEqual(metrics.missingMetrics, []);
});

test("fails configured reader timing budgets when metrics are slow or missing", () => {
  const metrics = summarizeReaderTimingSummary({
    performance: [
      {
        kind: "epub",
        metrics: {
          resumed: {
            metrics: [
              { durationMs: 1800, name: "app-cold-usable" },
              { durationMs: 550, name: "book-cinema-open" },
              { durationMs: 320, name: "reader-resume" },
            ],
          },
        },
      },
    ],
  });
  const comparisons = compareReaderTimingBudgets(metrics, {
    maxAppColdUsableMs: 2200,
    maxBookCinemaOpenMs: 450,
    maxReaderResumeMs: 500,
    maxStudioRouteSwitchMs: 600,
  });
  const report = formatReaderTimingReport(metrics, comparisons);

  assert.equal(comparisons.find((item) => item.metric === "app-cold-usable.maxMs").passed, true);
  assert.equal(comparisons.find((item) => item.metric === "book-cinema-open.maxMs").passed, false);
  assert.equal(
    comparisons.find((item) => item.metric === "studio-route-switch.maxMs").passed,
    false,
  );
  assert.match(report, /Missing metrics: studio-route-switch/);
  assert.match(report, /FAIL book-cinema-open\.maxMs/);
});
