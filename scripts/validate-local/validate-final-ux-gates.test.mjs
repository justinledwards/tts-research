import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinalUxGates, renderFinalUxSummary } from "./validate-final-ux-gates.mjs";

const artifactPaths = {
  accessibilityResults: "/tmp/final/accessibility-results.json",
  actionInventory: "/tmp/final/action-inventory.json",
  actionResults: "/tmp/final/action-results.json",
  commandPaletteResults: "/tmp/final/command-palette-results.json",
  readalongSyncMetrics: "/tmp/final/sync-metrics.json",
  readalongSyncSummary: "/tmp/final/sync-summary.md",
  readalongSyncTimeline: "/tmp/final/drift-timeline.json",
  responsiveResults: "/tmp/final/responsive-results.json",
  telepromptMemoryReport: "/tmp/final/teleprompt-memory-report.md",
  telepromptMemoryResults: "/tmp/final/teleprompt-memory-results.json",
  uiActionSummary: "/tmp/final/ui-action-summary.json",
};

test("passes final UX gates from composed local evidence", () => {
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [{ id: "ui-actions", status: "passed", title: "UI Action Audit" }],
    documents: passingDocuments(),
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  assert.equal(result.status, "passed");
  assert.equal(result.summary.total, 11);
  assert.equal(result.summary.failed, 0);
  assert.match(renderFinalUxSummary(result), /More menu is functional/);
});

test("fails when UI action audit is completed with unwaived findings", () => {
  const documents = passingDocuments();
  const failedResult = {
    actionId: "project-open",
    activationMode: "pointer",
    label: "Open project",
    outcome: "no observable result",
    passed: false,
    scenarioId: "project-dashboard",
    surface: "Project dashboard",
  };
  documents.actionResults = {
    results: [...documents.actionResults.results, failedResult],
    status: "completed-with-findings",
  };
  documents.actionInventory.actions.push({
    actionId: "project-open",
    hasStableTestId: true,
    label: "Open project",
    metadataIssues: [],
    owner: "project-dashboard",
    scenarioId: "project-dashboard",
    surface: "Project dashboard",
  });
  documents.actionInventory.duplicates = [
    {
      actionIds: ["project-open", "project-open-secondary"],
      count: 2,
      label: "Open project",
      scenarios: ["project-dashboard"],
      surface: "Project dashboard",
    },
  ];
  documents.uiActionSummary = {
    status: "completed-with-findings",
    summaries: {
      gateFindings: {
        duplicates: documents.actionInventory.duplicates,
        failedResults: [failedResult],
        total: 1,
      },
    },
  };

  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });
  const actionGate = result.gates.find((gate) => gate.id === "ui-action-audit-review-complete");
  const markdown = renderFinalUxSummary(result);

  assert.equal(result.status, "failed");
  assert.equal(actionGate.status, "failed");
  assert.match(markdown, /Unresolved Findings/);
  assert.match(markdown, /Owner: project-dashboard/);
  assert.match(markdown, /duplicate action group/);
});

test("reports passed-with-findings when UI action findings are explicitly waived", () => {
  const documents = passingDocuments();
  const failedResult = {
    actionId: "project-open",
    activationMode: "pointer",
    label: "Open project",
    outcome: "no observable result",
    passed: false,
    scenarioId: "project-dashboard",
    surface: "Project dashboard",
  };
  documents.actionResults.status = "completed-with-findings";
  documents.actionResults.results = [...documents.actionResults.results, failedResult];
  documents.actionInventory.actions.push({
    actionId: "project-open",
    hasStableTestId: true,
    label: "Open project",
    metadataIssues: [],
    owner: "project-dashboard",
    scenarioId: "project-dashboard",
    surface: "Project dashboard",
  });
  documents.actionInventory.duplicates = [
    {
      actionIds: ["project-open", "project-open-secondary"],
      count: 2,
      label: "Open project",
      scenarios: ["project-dashboard"],
      surface: "Project dashboard",
    },
  ];
  documents.uiActionSummary = {
    status: "completed-with-findings",
    summaries: {
      gateFindings: {
        duplicates: documents.actionInventory.duplicates,
        failedResults: [failedResult],
        total: 1,
      },
    },
    waivers: [
      {
        category: "no-op-controls",
        owner: "project-dashboard",
        reason: "Tracked in WP follow-up for project dashboard generated source rows.",
      },
      {
        category: "duplicate-groups",
        owner: "design-systems",
        reason: "Known repeated project actions stay visible until the dashboard IA pass lands.",
      },
    ],
  };

  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });
  const markdown = renderFinalUxSummary(result);

  assert.equal(result.status, "passed-with-findings");
  assert.equal(result.summary.passedWithFindings, 1);
  assert.match(markdown, /Why Final Still Passes/);
  assert.match(markdown, /Waived Findings/);
  assert.match(markdown, /not clean passed/);
});

test("fails hard when stale audio drives an active highlight", () => {
  const documents = passingDocuments();
  documents.readalongSync = {
    ...documents.readalongSync,
    metrics: {
      ...documents.readalongSync.metrics,
      staleHighlightCount: 1,
    },
    timeline: [
      {
        fixtureId: "stale-audio",
        failures: ["stale highlight"],
        highlightedNodeId: "node-1",
        highlightedWordIndex: 2,
        runtimeState: "stale-audio",
      },
    ],
  };
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const staleGate = result.gates.find((gate) => gate.id === "stale-audio-no-highlight");
  assert.equal(result.status, "failed");
  assert.equal(staleGate.status, "failed");
  assert.match(staleGate.failures.join("\n"), /Stale highlight count/);
});

test("fails when Cinema More lacks keyboard evidence on a required surface", () => {
  const documents = passingDocuments();
  documents.actionResults.results = documents.actionResults.results.filter(
    (result) => !(result.surface === "WebsiteCinema" && result.activationMode === "keyboard"),
  );
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const moreGate = result.gates.find((gate) => gate.id === "more-menu-functional");
  assert.equal(result.status, "failed");
  assert.equal(moreGate.status, "failed");
  assert.match(moreGate.failures.join("\n"), /WebsiteCinema.*keyboard/);
});

function passingDocuments() {
  return {
    accessibilityResults: {
      results: [
        {
          browserIssues: [],
          id: "phone-high-contrast-reduced-motion",
          scan: { failCount: 0 },
        },
      ],
      status: "passed",
      summary: { failures: 0 },
    },
    actionInventory: {
      actions: [
        ...["BookCinema", "DocumentCinema", "WebsiteCinema"].map((surface) => ({
          actionId: "ui-action-cinema-more-menu",
          disabled: false,
          hasStableTestId: true,
          label: "Open Cinema More menu",
          metadataIssues: [],
          owner: "cinema-more",
          scenarioId: `${surface}-read`,
          surface,
        })),
        ...Array.from({ length: 6 }, (_, index) => ({
          actionId: `ui-action-cinema-more-entry-${String(index)}`,
          disabled: false,
          hasStableTestId: true,
          label: `More entry ${String(index)}`,
          metadataIssues: [],
          owner: "cinema-more",
          scenarioId: "book-more-menu",
          surface: "BookCinema",
        })),
        {
          actionId: "ui-action-disabled",
          disabled: true,
          disabledReason: "Generated audio is not ready.",
          hasStableTestId: true,
          label: "Play",
          metadataIssues: [],
          owner: "cinema",
          scenarioId: "BookCinema-read",
          surface: "BookCinema",
        },
      ],
    },
    actionResults: {
      results: ["BookCinema", "DocumentCinema", "WebsiteCinema"].flatMap((surface) =>
        ["pointer", "keyboard"].map((activationMode) => ({
          actionId: "ui-action-cinema-more-menu",
          activationMode,
          outcome: "menu/panel opened",
          passed: true,
          stateDelta: { menuChanged: true },
          surface,
        })),
      ),
      status: "passed",
    },
    commandPaletteResults: {
      result: {
        commandsObserved: [
          {
            id: "cinema:advanced:diagnostics",
            title: "Advanced: Diagnostics",
          },
        ],
        disabledCommands: [{ id: "disabled-command", reason: "Unavailable in this context." }],
        failures: [],
      },
      status: "passed",
      summary: { commandsObserved: 1, disabledCommands: 1 },
    },
    readalongSync: {
      browser: { failureCount: 0 },
      comparisons: [{ metric: "medianWordDriftMs", passed: true }],
      metrics: {
        maxPhraseDriftMs: 160,
        medianWordDriftMs: 60,
        p95WordDriftMs: 120,
        staleHighlightCount: 0,
        wrongNodeCount: 0,
        wrongWordCount: 0,
      },
      status: "passed",
      timeline: [
        {
          fixtureId: "stale-audio",
          failures: [],
          highlightedNodeId: null,
          highlightedWordIndex: null,
          runtimeState: "stale-audio",
        },
      ],
      waivers: [],
    },
    responsiveResults: {
      status: "passed",
      summary: {
        telepromptTheatreFailures: 0,
        viewports: 3,
      },
    },
    telepromptMemory: {
      result: {
        checks: [
          "Teleprompt Theatre opens with presenter presets, mirror mode, and operator preview.",
          "Teleprompt Theatre opens from Review.",
          "Native fullscreen fallback explains availability.",
          "Escape exits Theatre while preserving inline Teleprompt state.",
          "Preview return target persisted.",
          "Review return target persisted.",
        ],
        failures: [],
      },
      status: "passed",
    },
    uiActionSummary: {
      status: "passed",
      summaries: {
        gateFindings: {
          duplicates: [],
          failedResults: [],
          total: 0,
        },
      },
    },
  };
}
