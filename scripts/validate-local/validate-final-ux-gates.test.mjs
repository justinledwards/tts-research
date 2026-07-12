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
  assert.equal(result.mergeReadiness.status, "ready");
  assert.equal(result.summary.total, 13);
  assert.equal(result.summary.failed, 0);
  assert.match(renderFinalUxSummary(result), /More menu is useful/);
  assert.match(renderFinalUxSummary(result), /Command palette, More menu/);
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
    surface: "Command Center",
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
    owner: "command-center",
    scenarioId: "project-dashboard",
    surface: "Command Center",
  });
  documents.actionInventory.duplicates = [
    {
      actionIds: ["project-open", "project-open-secondary"],
      count: 2,
      label: "Open project",
      scenarios: ["project-dashboard"],
      surface: "Command Center",
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
  assert.equal(result.mergeReadiness.status, "blocked");
  assert.equal(actionGate.status, "failed");
  assert.match(markdown, /Unresolved Findings/);
  assert.match(markdown, /Owner: command-center/);
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
    surface: "Command Center",
  };
  documents.actionResults.status = "completed-with-findings";
  documents.actionResults.results = [...documents.actionResults.results, failedResult];
  documents.actionInventory.actions.push({
    actionId: "project-open",
    hasStableTestId: true,
    label: "Open project",
    metadataIssues: [],
    owner: "command-center",
    scenarioId: "project-dashboard",
    surface: "Command Center",
  });
  documents.actionInventory.duplicates = [
    {
      actionIds: ["project-review", "project-review-secondary"],
      count: 2,
      label: "Review",
      scenarios: ["project-dashboard"],
      surface: "Command Center",
      surfaces: ["Command Center"],
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
        owner: "command-center",
        reason: "Tracked in WP follow-up for Command Center generated source rows.",
        reviewDate: "2026-06-30",
      },
      {
        category: "classified-duplicate-waivers",
        owner: "design-systems",
        reason: "Known repeated project actions are covered by the WP46 duplicate registry.",
        reviewDate: "2026-06-30",
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
  assert.equal(result.mergeReadiness.status, "ready with waivers");
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

test("fails when Cinema More omits required information architecture", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.filter(
    (action) =>
      !(action.scenarioId === "book-more-menu" && action.cinemaMoreSectionId === "source"),
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
  assert.match(moreGate.failures.join("\n"), /BookCinema.*source section/);
});

test("fails when Cinema More duplicates visible primary controls without proxy metadata", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions.push({
    actionId: "ui-action-visible-read-mode",
    disabled: false,
    hasStableTestId: true,
    label: "Read",
    metadataIssues: [],
    owner: "cinema",
    scenarioId: "book-more-menu",
    surface: "BookCinema",
  });
  documents.actionInventory.actions = documents.actionInventory.actions.map((action) =>
    action.scenarioId === "book-more-menu" &&
    action.actionId === "ui-action-cinema-more-reader-settings"
      ? { ...action, label: "Read" }
      : action,
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
  assert.match(moreGate.failures.join("\n"), /duplicates visible primary controls/);
});

test("fails when Cinema More help actions omit shortcut hints", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.map((action) =>
    action.scenarioId === "website-more-menu" &&
    action.actionId === "ui-action-cinema-more-keyboard-shortcuts"
      ? { ...action, cinemaMoreShortcutHint: "" }
      : action,
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
  assert.match(moreGate.failures.join("\n"), /help actions lack keyboard shortcut hints/);
});

test("fails when a required task exists only in command palette", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.filter(
    (action) => action.commandId !== "settings:open",
  );
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const crossGate = result.gates.find((gate) => gate.id === "command-more-cross-audit");
  assert.equal(result.status, "failed");
  assert.equal(crossGate.status, "failed");
  assert.match(crossGate.failures.join("\n"), /Open settings exists only in the command palette/);
});

test("fails when a More action has no command owner", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.map((action) =>
    action.cinemaMoreActionId === "reader-settings" ? { ...action, owner: "" } : action,
  );
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const crossGate = result.gates.find((gate) => gate.id === "command-more-cross-audit");
  assert.equal(result.status, "failed");
  assert.equal(crossGate.status, "failed");
  assert.match(crossGate.failures.join("\n"), /Reader settings owner missing/);
});

test("fails when command and visible button disabled reasons drift", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.map((action) =>
    action.commandId === "playback:create-listen"
      ? { ...action, disabled: true, disabledReason: "Select a source first." }
      : action,
  );
  documents.commandPaletteResults.result.commandsObserved =
    documents.commandPaletteResults.result.commandsObserved.map((command) =>
      command.id === "playback:create-listen"
        ? { ...command, disabled: true, reason: "Create audio is unavailable." }
        : command,
    );
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const crossGate = result.gates.find((gate) => gate.id === "command-more-cross-audit");
  assert.equal(result.status, "failed");
  assert.equal(crossGate.status, "failed");
  assert.match(crossGate.failures.join("\n"), /Create & Listen visible disabled reason/);
});

test("fails when a keyboard shortcut points at a different command action", () => {
  const documents = passingDocuments();
  documents.actionInventory.actions = documents.actionInventory.actions.map((action) =>
    action.commandId === "settings:open"
      ? { ...action, shortcutCommandId: "playback.createListen" }
      : action,
  );
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const crossGate = result.gates.find((gate) => gate.id === "command-more-cross-audit");
  assert.equal(result.status, "failed");
  assert.equal(crossGate.status, "failed");
  assert.match(
    crossGate.failures.join("\n"),
    /shortcut playback\.createListen maps to settings:open/,
  );
});

test("fails when responsive evidence reports mobile cue or reader occlusion", () => {
  const documents = passingDocuments();
  documents.responsiveResults = {
    results: [
      {
        id: "phone-390",
        telepromptTheatre: {
          failures: ["Teleprompt Theatre cue/control overlap: transport overlaps cue by 72px."],
        },
        websiteCalmRead: {
          failures: [
            {
              actual: 0,
              budget: 96,
              metric: "readerScrollPaddingBottomPx",
              reason: "Mobile reader canvas needs scroll padding above transport controls",
            },
          ],
        },
      },
    ],
    status: "failed",
    summary: {
      overlayCollisionFailures: 0,
      telepromptTheatreFailures: 1,
      websiteCalmReadFailures: 1,
    },
  };
  const result = evaluateFinalUxGates({
    artifactPaths,
    commandSteps: [],
    documents,
    outputDir: "/tmp/final",
    rootDir: "/repo",
  });

  const responsiveGate = result.gates.find((gate) => gate.id === "responsive-no-control-occlusion");
  assert.equal(result.status, "failed");
  assert.equal(responsiveGate.status, "failed");
  assert.match(responsiveGate.failures.join("\n"), /cue\/control overlap/);
  assert.match(responsiveGate.failures.join("\n"), /readerScrollPaddingBottomPx/);
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
        {
          actionId: "ui-action-settings-open",
          commandId: "settings:open",
          disabled: false,
          hasStableTestId: true,
          label: "Open settings",
          metadataIssues: [],
          owner: "settings",
          scenarioId: "workspace-review",
          shortcutCommandId: "settings.open",
          surface: "Workspace",
          testId: "ui-action-settings-open",
        },
        {
          actionId: "workspace-stage-action-createAndListen",
          commandId: "playback:create-listen",
          disabled: false,
          hasStableTestId: true,
          label: "Create & Listen",
          metadataIssues: [],
          owner: "workspace",
          scenarioId: "workspace-preview",
          shortcutCommandId: "playback.createListen",
          surface: "Preview",
          testId: "workspace-stage-action-createAndListen",
        },
        {
          actionId: "ui-action-command-palette-open",
          commandId: "command.palette",
          disabled: false,
          hasStableTestId: true,
          label: "Open command palette",
          metadataIssues: [],
          owner: "command-palette",
          scenarioId: "workspace-review",
          shortcutCommandId: "command.palette",
          surface: "Workspace",
          testId: "ui-action-command-palette-open",
        },
        {
          actionId: "ui-action-quick-listen-open",
          commandId: "temporary-source:new",
          disabled: false,
          hasStableTestId: true,
          label: "Quick Listen",
          metadataIssues: [],
          owner: "temporary-source",
          scenarioId: "workspace-review",
          shortcutCommandId: "temporary.quickListen",
          surface: "Workspace",
          testId: "ui-action-quick-listen-open",
        },
        {
          actionId: "ui-action-temporary-source-clear-expired",
          commandId: "temporary-source:clear-expired",
          disabled: false,
          hasStableTestId: true,
          label: "Clear expired temporary work",
          metadataIssues: [],
          owner: "temporary-source",
          scenarioId: "command-center-temporary",
          surface: "Command Center",
          testId: "ui-action-temporary-source-clear-expired",
        },
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
        ...["BookCinema", "DocumentCinema", "WebsiteCinema"].map((surface) => ({
          actionId: "ui-action-cinema-theatre",
          commandId: "cinema:theatre:open",
          disabled: false,
          hasStableTestId: true,
          label: "Open Cinema Theatre",
          metadataIssues: [],
          owner: "cinema-theatre",
          scenarioId: `${surface}-read`,
          surface,
          testId: "ui-action-cinema-theatre",
        })),
        ...moreMenuEntries(),
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
        commandsObserved: contractCommandsObserved(),
        disabledCommands: [{ id: "disabled-command", reason: "Unavailable in this context." }],
        failures: [],
      },
      status: "passed",
      summary: { commandsObserved: contractCommandsObserved().length, disabledCommands: 1 },
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

function moreMenuEntries() {
  const surfaces = [
    { scenarioId: "book-more-menu", surface: "BookCinema" },
    { scenarioId: "document-more-menu", surface: "DocumentCinema" },
    { scenarioId: "website-more-menu", surface: "WebsiteCinema" },
  ];
  const entries = [
    {
      actionId: "ui-action-cinema-more-open-inspector",
      cinemaMoreActionId: "open-inspector",
      cinemaMoreActionKind: "source",
      cinemaMoreSectionId: "source",
      commandId: "cinema:source:inspector",
      label: "Open Inspector",
      owner: "cinema-source",
    },
    {
      actionId: "ui-action-cinema-more-source-details",
      cinemaMoreActionId: "source-details",
      cinemaMoreActionKind: "source",
      cinemaMoreSectionId: "source",
      commandId: "cinema:source:details",
      label: "Source details",
      owner: "cinema-source",
    },
    {
      actionId: "ui-action-cinema-more-create-audio",
      cinemaMoreActionId: "create-audio",
      cinemaMoreActionKind: "audio",
      cinemaMoreSectionId: "audio",
      commandId: "cinema:audio:create",
      label: "Create audio",
      owner: "cinema-audio",
    },
    {
      actionId: "ui-action-cinema-more-reader-settings",
      cinemaMoreActionId: "reader-settings",
      cinemaMoreActionKind: "display",
      cinemaMoreSectionId: "display",
      commandId: "settings:field:readerPreferences",
      label: "Reader settings",
      owner: "cinema-display",
    },
    {
      actionId: "ui-action-cinema-more-theatre-mode",
      cinemaMoreActionId: "theatre-mode",
      cinemaMoreActionKind: "theatre",
      cinemaMoreSectionId: "theatre",
      commandId: "cinema:theatre:open",
      label: "Cinema Theatre",
      owner: "cinema-theatre",
    },
    {
      actionId: "ui-action-cinema-more-return-review",
      cinemaMoreActionId: "return-review",
      cinemaMoreActionKind: "workflow",
      cinemaMoreSectionId: "workflow",
      commandId: "cinema:workflow:return-review",
      label: "Return to Review",
      owner: "cinema-workflow",
    },
    {
      actionId: "ui-action-cinema-more-return-preview",
      cinemaMoreActionId: "return-preview",
      cinemaMoreActionKind: "workflow",
      cinemaMoreSectionId: "workflow",
      commandId: "cinema:workflow:return-preview",
      label: "Return to Preview",
      owner: "cinema-workflow",
    },
    {
      actionId: "ui-action-cinema-advanced-policy-internals",
      cinemaMoreActionId: "policy-internals",
      cinemaMoreActionKind: "advanced",
      cinemaMoreSectionId: "advanced",
      commandId: "cinema:advanced:policy-internals",
      label: "Policy internals",
      owner: "cinema-advanced",
    },
    {
      actionId: "ui-action-cinema-advanced-source-internals",
      cinemaMoreActionId: "source-internals",
      cinemaMoreActionKind: "advanced",
      cinemaMoreSectionId: "advanced",
      commandId: "cinema:advanced:source-internals",
      label: "Source internals",
      owner: "cinema-advanced",
    },
    {
      actionId: "ui-action-cinema-more-command-palette",
      cinemaMoreActionId: "command-palette",
      cinemaMoreActionKind: "help-shortcuts",
      cinemaMoreSectionId: "help-shortcuts",
      cinemaMoreShortcutHint: "Ctrl+K / Cmd+K",
      commandId: "command.palette",
      label: "Command palette",
      owner: "cinema-help",
      shortcutCommandId: "command.palette",
    },
    {
      actionId: "ui-action-cinema-more-keyboard-shortcuts",
      cinemaMoreActionId: "keyboard-shortcuts",
      cinemaMoreActionKind: "help-shortcuts",
      cinemaMoreSectionId: "help-shortcuts",
      cinemaMoreShortcutHint: "? / F1",
      commandId: "shortcuts:open",
      label: "Keyboard shortcuts",
      owner: "cinema-help",
      shortcutCommandId: "shortcut.cheatsheet",
    },
  ];
  return surfaces.flatMap(({ scenarioId, surface }) =>
    entries.map((entry) => ({
      ...entry,
      disabled: false,
      hasStableTestId: true,
      metadataIssues: [],
      scenarioId,
      surface,
    })),
  );
}

function contractCommandsObserved() {
  return [
    {
      id: "settings:open",
      owner: "settings",
      shortcutCommandId: "settings.open",
      title: "Open settings",
    },
    {
      id: "playback:create-listen",
      owner: "workspace",
      shortcutCommandId: "playback.createListen",
      title: "Create & Listen",
    },
    {
      id: "temporary-source:new",
      owner: "temporary-source",
      shortcutCommandId: "temporary.quickListen",
      title: "Temporary source · Start Quick Listen",
    },
    {
      id: "temporary-source:paste",
      owner: "temporary-source",
      title: "Temporary source · Paste text",
    },
    {
      id: "temporary-source:open-url",
      owner: "temporary-source",
      title: "Temporary source · Open webpage",
    },
    {
      id: "temporary-source:upload-file",
      owner: "temporary-source",
      title: "Temporary source · Upload file",
    },
    {
      id: "temporary-source:reopen-recent",
      owner: "temporary-source",
      reason: "No temporary sources are available in this app session.",
      title: "Temporary source · Reopen recent temporary source",
    },
    {
      id: "temporary-source:open-review",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Open in Review",
    },
    {
      id: "temporary-source:open-preview",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Open in Preview",
    },
    {
      id: "temporary-source:open-cinema",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Open in Cinema",
    },
    {
      id: "temporary-source:create-audio",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Create audio",
    },
    {
      id: "temporary-source:retry-audio",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Retry audio",
    },
    {
      id: "temporary-source:keep-in-project",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      shortcutCommandId: "temporary.keepInProject",
      title: "Temporary source · Keep in project",
    },
    {
      id: "temporary-source:discard",
      owner: "temporary-source",
      reason: "Open or select a temporary source first.",
      title: "Temporary source · Discard temporary source",
    },
    {
      id: "temporary-source:clear-expired",
      owner: "temporary-source",
      title: "Temporary storage · Clear expired temporary work",
    },
    {
      id: "settings:field:readerPreferences",
      owner: "settings",
      title: "Reader preferences",
    },
    {
      id: "cinema:source:inspector",
      owner: "cinema-source",
      title: "Open Cinema Inspector",
    },
    {
      id: "cinema:source:details",
      owner: "cinema-source",
      title: "Cinema source details",
    },
    {
      id: "cinema:audio:create",
      owner: "cinema-audio",
      title: "Create Cinema audio",
    },
    {
      id: "cinema:audio:retry",
      owner: "cinema-audio",
      title: "Retry Cinema audio",
    },
    {
      id: "cinema:theatre:open",
      owner: "cinema-theatre",
      title: "Open Cinema Theatre",
    },
    {
      id: "cinema:workflow:return-review",
      owner: "cinema-workflow",
      title: "Return to Review",
    },
    {
      id: "cinema:workflow:return-preview",
      owner: "cinema-workflow",
      title: "Return to Preview",
    },
    {
      id: "cinema:advanced:policy-internals",
      owner: "cinema-advanced",
      title: "Advanced: Policy internals",
    },
    {
      id: "cinema:advanced:source-internals",
      owner: "cinema-advanced",
      title: "Advanced: Source internals",
    },
    {
      id: "cinema:advanced:diagnostics",
      owner: "cinema-diagnostics",
      title: "Advanced: Diagnostics",
    },
    {
      id: "cinema:advanced:timing-map",
      owner: "cinema-diagnostics",
      title: "Advanced: Timing map",
    },
    {
      id: "cinema:advanced:alignment-repair",
      owner: "cinema-diagnostics",
      title: "Advanced: Alignment repair",
    },
    {
      id: "shortcuts:open",
      owner: "settings",
      shortcutCommandId: "shortcut.cheatsheet",
      title: "Open shortcut cheat sheet",
    },
    {
      id: "help:open",
      owner: "help",
      shortcutCommandId: "help.open",
      title: "Open help",
    },
  ];
}
