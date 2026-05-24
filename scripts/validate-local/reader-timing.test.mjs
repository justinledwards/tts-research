import test from "node:test";
import assert from "node:assert/strict";
import {
  compareReaderTimingBudgets,
  formatBudgetFailuresMarkdown,
  formatReaderTimingReport,
  summarizeReaderTimingFailures,
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
              { durationMs: 210, name: "source-switch" },
              { durationMs: 80, name: "studio-route-switch" },
              { durationMs: 230.3, name: "book-cinema-open" },
              { durationMs: 310, name: "preview-cinema-open" },
              { durationMs: 90, name: "transport-interaction-latency" },
              { durationMs: 340, name: "waveform-progress-render" },
              { durationMs: 170, name: "teleprompt-cue-switch" },
              { durationMs: 420, name: "settings-open" },
              { durationMs: 500, name: "preview-generation-handoff" },
              { durationMs: 190, name: "command-palette-open-search" },
              { durationMs: 130, name: "context-panel-tab-switch" },
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
              { durationMs: 180, name: "source-switch" },
              { durationMs: 120.4, name: "studio-route-switch" },
              { durationMs: 270.1, name: "book-cinema-open" },
              { durationMs: 330, name: "preview-cinema-open" },
              { durationMs: 110, name: "transport-interaction-latency" },
              { durationMs: 360, name: "waveform-progress-render" },
              { durationMs: 205, name: "teleprompt-cue-switch" },
              { durationMs: 390, name: "settings-open" },
              { durationMs: 530, name: "preview-generation-handoff" },
              { durationMs: 220, name: "command-palette-open-search" },
              { durationMs: 150, name: "context-panel-tab-switch" },
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
  assert.equal(metrics.metrics["source-switch"].maxMs, 210);
  assert.equal(metrics.metrics["book-cinema-open"].byKind.pdf, 270.1);
  assert.equal(metrics.metrics["book-cinema-open"].count, 3);
  assert.equal(metrics.metrics["preview-cinema-open"].maxMs, 330);
  assert.equal(metrics.metrics["waveform-progress-render"].maxMs, 360);
  assert.equal(metrics.metrics["command-palette-open-search"].count, 2);
  assert.equal(metrics.metrics["teleprompt-cue-switch"].byKind.pdf, 205);
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
              { durationMs: 1300, name: "waveform-progress-render" },
              { durationMs: 620, name: "reader-resume" },
            ],
          },
        },
      },
    ],
  });
  const comparisons = compareReaderTimingBudgets(metrics, {
    maxAppColdUsableMs: 2200,
    maxBookCinemaOpenMs: 450,
    maxCommandPaletteOpenSearchMs: 500,
    maxReaderResumeMs: 500,
    maxStudioRouteSwitchMs: 600,
    maxWaveformProgressRenderMs: 1200,
  });
  const report = formatReaderTimingReport(metrics, comparisons);
  const failures = summarizeReaderTimingFailures(comparisons);
  const failuresReport = formatBudgetFailuresMarkdown(comparisons);

  assert.equal(comparisons.find((item) => item.metric === "app-cold-usable.maxMs").passed, true);
  assert.equal(comparisons.find((item) => item.metric === "book-cinema-open.maxMs").passed, false);
  assert.equal(
    comparisons.find((item) => item.metric === "studio-route-switch.maxMs").passed,
    false,
  );
  assert.match(report, /Missing metrics: source-switch, studio-route-switch/);
  assert.equal(
    comparisons.find((item) => item.metric === "command-palette-open-search.maxMs").passed,
    false,
  );
  assert.match(report, /FAIL book-cinema-open\.maxMs/);
  assert.match(failuresReport, /blocking regression/);
  assert.equal(failures.blocking, 4);
  assert.equal(failures.waived, 1);
  assert.equal(
    comparisons.find((item) => item.metric === "reader-resume.maxMs").classification,
    "known budget overrun",
  );
});
