import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_REVIEW_SURFACES,
  renderReviewerSummary,
  summarizeSurfaceCoverage,
} from "./review-evidence.mjs";

test("summarizes required review surfaces from UI action inventory aliases", () => {
  const coverage = summarizeSurfaceCoverage({
    actions: [
      {
        scenarioId: "voice-dashboard",
        surface: "Workspace",
      },
      {
        scenarioId: "voice-dashboard",
        surface: "Workspace",
      },
    ],
    scenarios: [
      {
        id: "voice-dashboard",
        label: "Voice dashboard",
        surface: "Voice Dashboard",
      },
    ],
    summary: {
      surfaces: {
        BookCinema: 5,
        "Command Palette": 9,
        DocumentCinema: 6,
        Intake: 2,
        Preview: 4,
        "Preview mini-player": 1,
        "Project Dashboard": 10,
        Review: 3,
        Settings: 8,
        Teleprompt: 1,
        "UI Memory": 12,
        WebsiteCinema: 7,
        Workspace: 1,
      },
    },
  });

  assert.equal(coverage.length, REQUIRED_REVIEW_SURFACES.length);
  assert.equal(
    coverage.every((item) => item.status === "covered"),
    true,
  );
  assert.equal(coverage.find((item) => item.surface === "Book Cinema")?.actionCount, 5);
  assert.equal(coverage.find((item) => item.surface === "Preview")?.actionCount, 5);
  assert.equal(coverage.find((item) => item.surface === "Document Cinema")?.actionCount, 6);
  assert.equal(coverage.find((item) => item.surface === "Website Cinema")?.actionCount, 7);
  assert.equal(coverage.find((item) => item.surface === "Voice Dashboard")?.actionCount, 2);
});

test("renders reviewer summary with local-only evidence, surfaces, artifacts, and waivers", () => {
  const outputDir = "/tmp/review";
  const manifest = {
    artifactRecords: [
      {
        key: "actionInventory",
        ok: true,
        relativePath: "artifacts/ui-actions-e2e/action-inventory.json",
        stepId: "ui-actions-e2e",
        stepTitle: "UI Action Audit E2E",
      },
      {
        key: "lowResourceTiming",
        ok: true,
        relativePath: "artifacts/book-cinema-low-resource-e2e/performance/timing.json",
        stepId: "book-cinema-low-resource-e2e",
        stepTitle: "Book Cinema Low-resource E2E",
      },
    ],
    branch: "feature/review",
    commandRunList: [
      {
        durationMs: 20,
        logPath: `${outputDir}/logs/01-check.log`,
        status: "passed",
        title: "Project Check",
      },
    ],
    generatedAt: "2026-05-23T20:00:00.000Z",
    head: "abc123",
    outputDir,
    passFailSummary: {
      artifacts: { missingPaths: [], present: 2, total: 2 },
      commands: { passed: 1, total: 1 },
      qa: {
        lowResourceTiming: { status: "recorded", summary: { maxMs: 100 } },
      },
      surfaces: {
        covered: REQUIRED_REVIEW_SURFACES.length,
        total: REQUIRED_REVIEW_SURFACES.length,
      },
    },
    status: "passed",
    surfaceCoverage: REQUIRED_REVIEW_SURFACES.map((surface) => ({
      actionCount: 1,
      status: "covered",
      surface,
    })),
    waivers: [],
    workingTree: { dirty: false },
  };

  const markdown = renderReviewerSummary(manifest);

  assert.match(markdown, /Hosted CI required: no/);
  assert.match(markdown, /No waivers declared\./);
  assert.match(markdown, /Action Audit/);
  assert.match(markdown, /Low-resource Timing/);
  assert.match(markdown, /Low Resource Timing/);
  for (const surface of REQUIRED_REVIEW_SURFACES) {
    assert.match(markdown, new RegExp(surface.replaceAll(" ", "\\s+")));
  }
});
