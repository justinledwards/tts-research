import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_REVIEW_SURFACES,
  buildDirtyTreeReviewState,
  buildPassFailSummary,
  buildReviewTriage,
  isDirtyTreeWaiverEnabled,
  renderReviewerSummary,
  renderTriageDashboard,
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

test("renders severity-sorted triage dashboard with merge readiness and artifact links", () => {
  const outputDir = "/tmp/review";
  const manifest = {
    artifactRecords: [
      {
        key: "finalUxResults",
        ok: true,
        relativePath: "artifacts/final-ux-gates/final-ux-results.json",
        stepId: "final-ux-gates",
        stepTitle: "Final UX Gates",
      },
      {
        key: "summary",
        ok: true,
        relativePath: "artifacts/ui-actions-e2e/summary.json",
        stepId: "ui-actions-e2e",
        stepTitle: "UI Action Audit E2E",
      },
      {
        key: "actionInventory",
        ok: true,
        relativePath: "artifacts/ui-actions-e2e/action-inventory.json",
        stepId: "ui-actions-e2e",
        stepTitle: "UI Action Audit E2E",
      },
      {
        key: "duplicates",
        ok: true,
        relativePath: "artifacts/ui-actions-e2e/duplicates.md",
        stepId: "ui-actions-e2e",
        stepTitle: "UI Action Audit E2E",
      },
      {
        key: "lowResourceWaiverBurndownJson",
        ok: true,
        relativePath: "artifacts/book-cinema-low-resource-e2e/performance/waiver-burndown.json",
        stepId: "book-cinema-low-resource-e2e",
        stepTitle: "Book Cinema Low-resource E2E",
      },
      {
        key: "accessibilityFindings",
        ok: true,
        relativePath: "artifacts/accessibility-audit-e2e/a11y-findings.json",
        stepId: "accessibility-audit-e2e",
        stepTitle: "Accessibility Audit E2E",
      },
      {
        key: "syncMetrics",
        ok: true,
        relativePath: "artifacts/readalong-sync-e2e/sync-metrics.json",
        stepId: "readalong-sync-e2e",
        stepTitle: "Read-along Sync E2E",
      },
      {
        key: "goldenMinuteResults",
        ok: true,
        relativePath: "artifacts/golden-minute-e2e/golden-minute-results.json",
        stepId: "golden-minute-e2e",
        stepTitle: "Golden Minute E2E",
      },
      {
        key: "telepromptMemoryResults",
        ok: true,
        relativePath: "artifacts/teleprompt-memory-e2e/teleprompt-memory-results.json",
        stepId: "teleprompt-memory-e2e",
        stepTitle: "Teleprompt Memory E2E",
      },
      {
        key: "screenshots",
        ok: true,
        relativePath: "artifacts/golden-minute-e2e/screenshots",
        stepId: "golden-minute-e2e",
        stepTitle: "Golden Minute E2E",
      },
    ],
    branch: "feature/review",
    commandRunList: [],
    dirtyTree: { dirty: false, gateStatus: "passed", waived: false },
    generatedAt: "2026-05-23T20:00:00.000Z",
    head: "abc123",
    outputDir,
    passFailSummary: {
      artifacts: { missing: 0, missingPaths: [], present: 10, total: 10 },
      commands: { failed: 0, passed: 18, total: 18 },
      qa: {},
      surfaces: {
        covered: REQUIRED_REVIEW_SURFACES.length,
        missing: [],
        total: REQUIRED_REVIEW_SURFACES.length,
      },
    },
    reviewFiles: {
      commands: `${outputDir}/commands.txt`,
      head: `${outputDir}/head.txt`,
      reviewManifest: `${outputDir}/review-manifest.json`,
      reviewerSummary: `${outputDir}/reviewer-summary.md`,
      triage: `${outputDir}/triage.md`,
    },
    rootDir: "/repo",
    status: "passed",
    surfaceCoverage: REQUIRED_REVIEW_SURFACES.map((surface) => ({
      actionCount: 1,
      status: "covered",
      surface,
    })),
    waivers: [],
    workingTree: { diffStat: [], dirty: false, status: [], untrackedFiles: [] },
  };
  const qaDocuments = {
    accessibilityFindings: {
      summary: { failures: 0, warnings: 2 },
    },
    actionInventory: {
      summary: {
        explicitStableTestIds: 482,
        generatedStableActionIds: 47,
        generatedUnstableActionIds: 0,
        missingStableTestIds: 0,
      },
    },
    actionSummary: {
      resultSummary: { failed: 0, passed: 100, skipped: 1, total: 100 },
      reviewGate: {
        duplicateClassification: {
          needsConsolidation: 1,
          overexposed: 3,
          total: 12,
          unclassified: 0,
          waived: 8,
        },
        status: "not-review-complete",
        summary: { blocking: 0, "needs-review": 2, waived: 1 },
      },
      status: "completed-with-findings",
    },
    finalUxGates: {
      status: "passed-with-findings",
      summary: { unresolvedFindings: 1, waivedFindings: 1 },
      unresolvedFindings: [
        {
          message: "UI action audit completed with findings.",
          owner: "UX QA owner",
          severity: "needs-review",
        },
      ],
      waivedFindings: [
        {
          message: "Duplicate registry has accepted surface parity waivers.",
          owner: "UX action inventory owner",
          severity: "waived",
        },
      ],
      waivers: [
        {
          id: "duplicate:allowed-surface-parity",
          owner: "UX action inventory owner",
          reason: "Surface parity duplicates are accepted.",
          reviewDate: "2026-06-30",
        },
      ],
    },
    goldenMinute: {
      status: "passed",
      summary: {
        browserFailures: 0,
        driftMedianMs: 70,
        driftP95Ms: 80,
        screenshots: 8,
        speechFluencyStatus: "passed",
      },
    },
    lowResourceWaiverBurndown: {
      activeWaivers: 1,
      blocking: 0,
      closedUnderBudget: 2,
      items: [
        {
          actualMaxMs: 2789,
          budgetMs: 2200,
          classification: "known budget overrun",
          metric: "command-palette-open-search.maxMs",
          owner: "Performance owner",
          p95Ms: 2789,
          p99Ms: 2789,
          reviewDate: "2026-06-10",
          status: "waived-over-budget",
          target: "Split first-run indexing from warm search.",
          waiverId: "command-palette-open-search-low-resource-budget",
        },
      ],
    },
    readAlongSync: {
      metrics: {
        degradedTimePercentage: 8.11,
        medianWordDriftMs: 60,
        p95WordDriftMs: 120,
        staleHighlightCount: 0,
        wrongNodeCount: 0,
        wrongWordCount: 0,
      },
      status: "passed",
    },
    telepromptMemory: {
      status: "passed",
      summary: { checks: 11, failures: 0, screenshots: 6 },
    },
  };

  const triage = buildReviewTriage(manifest, qaDocuments);
  const markdown = renderTriageDashboard(manifest, qaDocuments, triage);

  assert.equal(triage.mergeReadiness.status, "not ready");
  assert.equal(triage.severityCounts["needs-review"] > 0, true);
  assert.match(markdown, /Merge Readiness/);
  assert.match(markdown, /Decision: \*\*NOT READY\*\*/);
  assert.match(markdown, /Action audit findings/);
  assert.match(markdown, /Duplicate count/);
  assert.match(markdown, /Stable test ID coverage/);
  assert.match(markdown, /Low-resource blocking\/waived metrics/);
  assert.match(markdown, /Accessibility warnings/);
  assert.match(markdown, /Read-along metrics/);
  assert.match(markdown, /Golden-minute metrics/);
  assert.match(markdown, /Teleprompt Theatre status/);
  assert.match(markdown, /Top 10 Next Issues/);
  assert.match(markdown, /Human QA/);
  assert.match(markdown, /\[artifacts\/ui-actions-e2e\/summary\.json\]/);
  assert.match(markdown, /\[artifacts\/golden-minute-e2e\/screenshots\]/);
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
