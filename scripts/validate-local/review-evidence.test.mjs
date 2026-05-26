import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_REVIEW_SURFACES,
  buildDirtyTreeReviewState,
  buildPassFailSummary,
  isDirtyTreeWaiverEnabled,
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
      {
        key: "finalUxResults",
        ok: true,
        relativePath: "artifacts/final-ux-gates/final-ux-results.json",
        stepId: "final-ux-gates",
        stepTitle: "Final UX Gates",
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
      artifacts: { missingPaths: [], present: 3, total: 3 },
      commands: { passed: 1, total: 1 },
      qa: {
        finalUxGates: { status: "passed", summary: { failed: 0, total: 10 } },
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
    workingTree: { diffStat: [], dirty: false, status: [], untrackedFiles: [] },
  };

  const markdown = renderReviewerSummary(manifest);

  assert.match(markdown, /Hosted CI required: no/);
  assert.match(markdown, /No waivers declared\./);
  assert.match(markdown, /Action Audit/);
  assert.match(markdown, /Low-resource Timing/);
  assert.match(markdown, /Low Resource Timing/);
  assert.match(markdown, /Final UX Gates/);
  assert.match(markdown, /Final Ux Gates/);
  for (const surface of REQUIRED_REVIEW_SURFACES) {
    assert.match(markdown, new RegExp(surface.replaceAll(" ", "\\s+")));
  }
});

test("dirty tree state requires explicit REVIEW_ALLOW_DIRTY waiver", () => {
  assert.equal(isDirtyTreeWaiverEnabled({ REVIEW_ALLOW_DIRTY: "1" }), true);
  assert.equal(isDirtyTreeWaiverEnabled({ REVIEW_ALLOW_DIRTY: "true" }), false);

  const clean = buildDirtyTreeReviewState({
    allowDirty: false,
    gitInfo: { dirty: false },
  });
  assert.equal(clean.gateStatus, "passed");
  assert.equal(clean.waived, false);

  const dirty = buildDirtyTreeReviewState({
    allowDirty: false,
    gitInfo: { dirty: true },
  });
  assert.equal(dirty.gateStatus, "failed");
  assert.equal(dirty.waived, false);

  const waived = buildDirtyTreeReviewState({
    allowDirty: true,
    gitInfo: { dirty: true },
  });
  assert.equal(waived.gateStatus, "waived");
  assert.equal(waived.waived, true);
});

test("pass/fail summary fails an unwaived dirty tree", () => {
  const failed = buildPassFailSummary({
    artifactRecords: [],
    commandSteps: [],
    dirtyTree: { dirty: true, gateStatus: "failed", waived: false },
    qaDocuments: {},
    surfaceCoverage: [],
  });

  assert.equal(failed.status, "failed");
  assert.deepEqual(failed.dirtyTree, {
    dirty: true,
    status: "failed",
    waived: false,
  });

  const waived = buildPassFailSummary({
    artifactRecords: [],
    commandSteps: [],
    dirtyTree: { dirty: true, gateStatus: "waived", waived: true },
    qaDocuments: {},
    surfaceCoverage: [],
  });

  assert.equal(waived.status, "passed");
  assert.deepEqual(waived.dirtyTree, {
    dirty: true,
    status: "waived",
    waived: true,
  });
});

test("renders red dirty tree waiver section with git status snapshot details", () => {
  const outputDir = "/tmp/review";
  const manifest = {
    artifactRecords: [],
    branch: "feature/review",
    commandRunList: [],
    dirtyTree: {
      allowDirty: true,
      dirty: true,
      environmentVariable: "REVIEW_ALLOW_DIRTY",
      gateStatus: "waived",
      waived: true,
    },
    generatedAt: "2026-05-23T20:00:00.000Z",
    gitStatusSnapshot: {
      commitHash: "abc123",
    },
    head: "abc123",
    outputDir,
    passFailSummary: {
      artifacts: { missingPaths: [], present: 0, total: 0 },
      commands: { passed: 0, total: 0 },
      qa: {},
      surfaces: {
        covered: 0,
        total: 0,
      },
    },
    status: "passed",
    surfaceCoverage: [],
    waivers: [],
    workingTree: {
      diffStat: [" scripts/validate-local/review-evidence.mjs | 42 +++++++++"],
      dirty: true,
      status: [" M scripts/validate-local/review-evidence.mjs", "?? scripts/new-gate.mjs"],
      untrackedFiles: ["scripts/new-gate.mjs"],
    },
  };

  const markdown = renderReviewerSummary(manifest);

  assert.match(markdown, /color: #b91c1c/);
  assert.match(markdown, /Dirty Tree Waiver/);
  assert.match(markdown, /REVIEW_ALLOW_DIRTY=1/);
  assert.match(markdown, /Commit hash: `abc123`/);
  assert.match(markdown, /scripts\/new-gate\.mjs/);
});
