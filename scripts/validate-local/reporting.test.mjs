import test from "node:test";
import assert from "node:assert/strict";
import {
  renderHTMLReport,
  renderMarkdownReport,
  summarizeRunDegradedStates,
} from "./reporting.mjs";

test("renders degraded states as JSON summary, Markdown, and HTML sections", () => {
  const summary = {
    durationMs: 1234,
    endedAt: "2026-05-20T10:00:01.000Z",
    kind: "validate-local",
    outputDir: "/tmp/validate-local",
    runId: "run-1",
    startedAt: "2026-05-20T10:00:00.000Z",
    status: "failed",
    steps: [
      {
        durationMs: 120,
        error: "One or more thresholds failed.",
        id: "book-cinema-e2e",
        logPath: "/tmp/validate-local/logs/book-cinema-e2e.log",
        metrics: {
          degradedStates: {
            byName: { "audio-not-ready": 1, "resume-position-fallback": 1 },
            bySurface: { "book-cinema": 1, "reader-resume": 1 },
            items: [
              {
                detail: { jobId: "job-1" },
                kind: "epub",
                name: "audio-not-ready",
                surface: "book-cinema",
              },
              {
                detail: { targetSeconds: 12 },
                kind: "epub",
                name: "resume-position-fallback",
                surface: "reader-resume",
              },
            ],
            total: 2,
          },
        },
        status: "failed",
        thresholds: [
          {
            actual: 550,
            expected: 500,
            metric: "reader-resume.maxMs",
            operator: "<=",
            passed: false,
          },
        ],
        title: "Book Cinema E2E Smoke",
      },
    ],
  };
  summary.degradedStates = summarizeRunDegradedStates(summary.steps);

  const markdown = renderMarkdownReport(summary);
  const html = renderHTMLReport(summary, markdown);

  assert.equal(summary.degradedStates.total, 2);
  assert.match(markdown, /## Degraded States/);
  assert.match(markdown, /audio-not-ready/);
  assert.match(markdown, /resume-position-fallback/);
  assert.match(html, /<h2>Degraded States<\/h2>/);
  assert.match(
    html,
    /<th>Name<\/th><th>Surface<\/th><th>Fixture<\/th><th>Step<\/th><th>Detail<\/th>/,
  );
  assert.match(html, /reader-resume\.maxMs/);
});
