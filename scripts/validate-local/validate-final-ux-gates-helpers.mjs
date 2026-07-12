import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildCommandMoreCrossAudit } from "../command-more-cross-audit.mjs";
import {
  classifyDuplicateGroups,
  summarizeDuplicateClassifications,
} from "../ui-action-duplicate-waivers.mjs";
import {
  CINEMA_MORE_ACTION_BUDGETS,
  CINEMA_MORE_PRIMARY_LABELS,
  CINEMA_MORE_REQUIRED_SECTIONS,
  CINEMA_MORE_SURFACE_SCENARIOS,
  finalAccessibilityArtifacts,
  finalCommandPaletteArtifacts,
  finalContextPanelArtifacts,
  finalReadAlongSyncArtifacts,
  finalResponsiveArtifacts,
  finalSurfaceComplexityArtifacts,
  finalTelepromptArtifacts,
  finalUiActionArtifacts,
  finalUxArtifactPaths,
  PASSING_GATE_STATUSES,
  UI_ACTION_AUDIT_SEVERITIES,
  UI_ACTION_AUDIT_THRESHOLDS,
} from "./validate-final-ux-gates-contracts.mjs";

export function evaluateFinalUxGates({
  artifactPaths,
  commandSteps = [],
  documents,
  generatedAt = new Date().toISOString(),
  outputDir = ".",
  rootDir = ".",
}) {
  const commandFailures = commandSteps.filter((step) => step.status !== "passed");
  const gates = [
    evaluateUiActionAuditReviewGate(documents),
    evaluateMoreMenuGate(documents),
    evaluateTelepromptEntryGate(documents),
    evaluateFullscreenFallbackGate(documents),
    evaluateResponsiveOcclusionGate(documents),
    evaluateTelepromptReturnMemoryGate(documents),
    evaluateReadAlongBudgetGate(documents),
    evaluateWrongNodeGate(documents),
    evaluateStaleHighlightGate(documents),
    evaluateAccessibilityReadAlongGate(documents),
    evaluateActionOwnerGate(documents),
    evaluateDisabledReasonGate(documents),
    evaluateCommandMoreCrossAuditGate(documents),
  ].map((gate) => ({
    ...gate,
    artifactPaths: gate.artifactKeys.map((key) => relativePath(outputDir, artifactPaths[key])),
  }));
  const waivers = collectFinalUxWaivers(documents);
  const failedGates = gates.filter((gate) => gate.status === "failed");
  const passedWithFindingsGates = gates.filter((gate) => gate.status === "passed-with-findings");
  const unresolvedFindings = gates.flatMap((gate) =>
    (gate.findings ?? []).filter((finding) =>
      ["blocking", "needs-review"].includes(finding.severity),
    ),
  );
  const waivedFindings = gates.flatMap((gate) =>
    (gate.findings ?? []).filter((finding) => finding.severity === "waived"),
  );
  const status =
    commandFailures.length > 0 || failedGates.length > 0
      ? "failed"
      : passedWithFindingsGates.length > 0
        ? "passed-with-findings"
        : "passed";
  const mergeReadiness = finalUxMergeReadiness({
    commandFailures,
    failedGates,
    status,
    unresolvedFindings,
    waivedFindings,
    waivers,
  });
  const summary = {
    commandsFailed: commandFailures.length,
    failed: failedGates.length,
    mergeReadiness: mergeReadiness.status,
    passed: gates.filter((gate) => gate.status === "passed").length,
    passedWithFindings: passedWithFindingsGates.length,
    total: gates.length,
    unresolvedFindings: unresolvedFindings.length,
    waivedFindings: waivedFindings.length,
    waivers: waivers.length,
  };
  return {
    artifactPaths: Object.fromEntries(
      Object.entries(artifactPaths).map(([key, filePath]) => [
        key,
        relativePath(outputDir, filePath),
      ]),
    ),
    commandRunList: commandSteps.map((step) => commandRunEntry(step, outputDir)),
    commands: {
      failed: commandFailures.map((step) => step.id),
      total: commandSteps.length,
    },
    gates,
    generatedAt,
    mergeReadiness,
    outputDir,
    rootDir,
    schemaVersion: "final-ux-gates.v1",
    severityLevels: UI_ACTION_AUDIT_SEVERITIES,
    status,
    summary,
    unresolvedFindings,
    waivers,
    waivedFindings,
  };
}

function evaluateUiActionAuditReviewGate(documents) {
  const auditStatus = documents.uiActionSummary?.status ?? documents.actionResults?.status ?? null;
  const findings = collectUiActionAuditFindings(documents, auditStatus);
  const severityCounts = severityCountsFor(findings);
  const blockingFindings = findings.filter((finding) => finding.severity === "blocking");
  const needsReviewFindings = findings.filter((finding) => finding.severity === "needs-review");
  const waivedFindings = findings.filter((finding) => finding.severity === "waived");
  const status =
    blockingFindings.length > 0
      ? "failed"
      : needsReviewFindings.length > 0 || waivedFindings.length > 0
        ? "passed-with-findings"
        : "passed";
  const passExplanation =
    status === "passed-with-findings" && blockingFindings.length === 0 && waivedFindings.length > 0
      ? "Final still passes because every waiver-required UI action audit finding has an explicit owner/reason waiver; the result remains passed-with-findings, not clean passed."
      : null;

  return gate({
    artifactKeys: ["uiActionSummary", "actionInventory", "actionResults"],
    evidence: [
      `UI action audit status ${auditStatus ?? "missing"}.`,
      `Severity counts ${formatSeverityCounts(severityCounts)}.`,
      passExplanation ?? "",
    ].filter(Boolean),
    failures: blockingFindings.map(
      (finding) =>
        `${finding.message} Owner: ${finding.owner}. Required waiver: ${finding.waiverRequired ? "missing" : "not required"}.`,
    ),
    findings,
    id: "ui-action-audit-review-complete",
    passExplanation,
    severity: worstSeverity(findings),
    severityCounts,
    status,
    title: "UI action audit is review-complete or explicitly waived",
  });
}

function evaluateMoreMenuGate(documents) {
  const results = documents.actionResults?.results ?? [];
  const actions = documents.actionInventory?.actions ?? [];
  const failures = [];
  const evidence = [];
  const moreActions = actions.filter(isCinemaMoreMenuAction);

  for (const [surface, scenarioId] of CINEMA_MORE_SURFACE_SCENARIOS) {
    const surfaceInventory = moreActions.filter((action) => action.surface === surface);
    if (surfaceInventory.length === 0) {
      failures.push(`${surface} did not expose the Cinema More menu in the action inventory.`);
      continue;
    }
    if (surfaceInventory.some((action) => action.disabled)) {
      failures.push(`${surface} Cinema More menu was disabled.`);
    }
    if (surfaceInventory.some((action) => !action.owner)) {
      failures.push(`${surface} Cinema More menu did not declare an action owner.`);
    }
    for (const mode of ["pointer", "keyboard"]) {
      const matchingResults = results.filter(
        (result) =>
          result.surface === surface &&
          result.actionId === "ui-action-cinema-more-menu" &&
          result.activationMode === mode,
      );
      const passed = matchingResults.some(
        (result) =>
          result.passed && (result.stateDelta?.menuChanged || /menu/i.test(result.outcome ?? "")),
      );
      if (!passed) {
        failures.push(`${surface} Cinema More menu did not open by ${mode}.`);
      }
    }

    const menuEntries = actions.filter(
      (action) => action.scenarioId === scenarioId && isCinemaMoreMenuEntry(action),
    );
    const budget = CINEMA_MORE_ACTION_BUDGETS.get(surface) ?? { max: 10, min: 1 };
    if (menuEntries.length < budget.min || menuEntries.length > budget.max) {
      failures.push(
        `${surface} Cinema More exposed ${String(menuEntries.length)} actions outside budget ${String(
          budget.min,
        )}-${String(budget.max)}.`,
      );
    }

    const sections = new Set(
      menuEntries.map((action) => action.cinemaMoreSectionId).filter(Boolean),
    );
    for (const section of CINEMA_MORE_REQUIRED_SECTIONS) {
      if (!sections.has(section)) {
        failures.push(`${surface} Cinema More did not expose the ${section} section.`);
      }
    }

    const disabledWithoutReason = menuEntries.filter(
      (action) =>
        action.disabled &&
        !action.disabledReason &&
        !action.cinemaMoreDisabledReason &&
        !action.intentionallyNoOpReason,
    );
    if (disabledWithoutReason.length > 0) {
      failures.push(
        `${surface} Cinema More disabled actions lack reasons: ${disabledWithoutReason
          .map((action) => action.actionId ?? action.label ?? "unknown")
          .join(", ")}.`,
      );
    }

    const missingOwners = menuEntries.filter((action) => !action.owner);
    if (missingOwners.length > 0) {
      failures.push(
        `${surface} Cinema More actions lack owners: ${missingOwners
          .map((action) => action.actionId ?? action.label ?? "unknown")
          .join(", ")}.`,
      );
    }

    const helpWithoutHints = menuEntries.filter(
      (action) => action.cinemaMoreSectionId === "help-shortcuts" && !action.cinemaMoreShortcutHint,
    );
    if (helpWithoutHints.length > 0) {
      failures.push(
        `${surface} Cinema More help actions lack keyboard shortcut hints: ${helpWithoutHints
          .map((action) => action.actionId ?? action.label ?? "unknown")
          .join(", ")}.`,
      );
    }

    const primaryLabels = new Set(
      actions
        .filter(
          (action) =>
            action.scenarioId === scenarioId &&
            !isCinemaMoreMenuAction(action) &&
            !isCinemaMoreMenuEntry(action),
        )
        .map((action) => normalizeFinalUxLabel(action.label))
        .filter((label) => CINEMA_MORE_PRIMARY_LABELS.has(label)),
    );
    const duplicatePrimaryControls = menuEntries.filter((action) => {
      const label = normalizeFinalUxLabel(action.label);
      return (
        label &&
        primaryLabels.has(label) &&
        CINEMA_MORE_PRIMARY_LABELS.has(label) &&
        !action.cinemaMorePrimaryProxy
      );
    });
    if (duplicatePrimaryControls.length > 0) {
      failures.push(
        `${surface} Cinema More duplicates visible primary controls without proxy metadata: ${duplicatePrimaryControls
          .map((action) => action.label ?? action.actionId ?? "unknown")
          .join(", ")}.`,
      );
    }

    if (menuEntries.length > 0) {
      evidence.push(
        `${surface}: ${String(menuEntries.length)} More actions across ${[...sections].join(
          ", ",
        )} within budget ${String(budget.min)}-${String(budget.max)}.`,
      );
    }
    evidence.push(`${surface}: pointer and keyboard menu-open evidence recorded.`);
  }

  return gate({
    artifactKeys: ["actionInventory", "actionResults"],
    evidence,
    failures,
    id: "more-menu-functional",
    title: "More menu is useful on every Cinema surface",
  });
}

function evaluateTelepromptEntryGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const required = [
    {
      label: "Preview to Theatre",
      pattern:
        /Teleprompt Theatre opens .*from Preview|Teleprompt Theatre opens with (?:presenter|Theatre presets)/i,
    },
    {
      label: "Review to Theatre",
      pattern: /Teleprompt Theatre opens .*from Review/i,
    },
  ];
  const evidence = [];
  for (const item of required) {
    if (checks.some((check) => item.pattern.test(check))) {
      evidence.push(item.label);
    } else {
      failures.push(`${item.label} was not verified by Teleprompt memory E2E.`);
    }
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults", "telepromptMemoryReport"],
    evidence,
    failures,
    id: "teleprompt-theatre-entrypoints",
    title: "Teleprompt Theatre opens from Review and Preview",
  });
}

function evaluateFullscreenFallbackGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const responsiveSummary = documents.responsiveResults?.summary ?? {};
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const evidence = [];
  if (
    checks.some((check) =>
      /Native fullscreen action is reachable|Native fullscreen fallback explains/i.test(check),
    )
  ) {
    evidence.push("Native fullscreen reachable or fallback reason exposed.");
  } else {
    failures.push("Native fullscreen availability/fallback was not verified.");
  }
  if (
    documents.responsiveResults?.status === "passed" &&
    Number(responsiveSummary.telepromptTheatreFailures ?? 0) === 0 &&
    Number(responsiveSummary.viewports ?? 0) >= 3
  ) {
    evidence.push(
      `Theatre fallback passed ${String(responsiveSummary.viewports)} responsive viewports.`,
    );
  } else {
    failures.push("Teleprompt Theatre fallback did not pass responsive viewport validation.");
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults", "responsiveResults"],
    evidence,
    failures,
    id: "teleprompt-fullscreen-fallback",
    title: "Native fullscreen and Theatre fallback are verified",
  });
}

function evaluateResponsiveOcclusionGate(documents) {
  const responsive = documents.responsiveResults;
  const results = responsive?.results ?? [];
  const failures = [];
  const evidence = [
    `Responsive status ${responsive?.status ?? "missing"}.`,
    `Teleprompt Theatre failures ${String(
      responsive?.summary?.telepromptTheatreFailures ?? "missing",
    )}.`,
    `Website calm-read failures ${String(
      responsive?.summary?.websiteCalmReadFailures ?? "missing",
    )}.`,
  ];
  for (const result of results) {
    for (const failure of result.telepromptTheatre?.failures ?? []) {
      if (/overlap|cue area|readability/i.test(failure)) {
        failures.push(`${result.id}: ${failure}`);
      }
    }
    for (const failure of result.websiteCalmRead?.failures ?? []) {
      if (
        /footerOverlapsReaderCanvas|readerScrollPaddingBottomPx|articleCenterOffsetPx/i.test(
          failure.metric ?? failure.reason ?? "",
        )
      ) {
        failures.push(`${result.id}: ${failure.metric} ${String(failure.actual)}.`);
      }
    }
  }
  if (Number(responsive?.summary?.overlayCollisionFailures ?? 0) > 0) {
    failures.push(
      `Responsive overlay audit reported ${String(
        responsive.summary.overlayCollisionFailures,
      )} collision failure(s).`,
    );
  }
  return gate({
    artifactKeys: ["responsiveResults"],
    evidence,
    failures,
    id: "responsive-no-control-occlusion",
    title: "Mobile reader and Theatre controls do not occlude content",
  });
}

function evaluateTelepromptReturnMemoryGate(documents) {
  const checks = documents.telepromptMemory?.result?.checks ?? [];
  const failures = [...(documents.telepromptMemory?.result?.failures ?? [])];
  const requiredPatterns = [
    /^Escape exits Theatre while preserving inline Teleprompt state\.$/i,
    /^Preview return target persisted\.$/i,
    /^Review return target persisted\.$/i,
  ];
  const evidence = [];
  for (const pattern of requiredPatterns) {
    const check = checks.find((candidate) => pattern.test(candidate));
    if (check) {
      evidence.push(check);
    } else {
      failures.push(`Missing Teleprompt memory check: ${pattern.source}`);
    }
  }
  return gate({
    artifactKeys: ["telepromptMemoryResults"],
    evidence,
    failures,
    id: "teleprompt-return-memory",
    title: "Teleprompt return memory survives theatre/fullscreen exit",
  });
}

function evaluateReadAlongBudgetGate(documents) {
  const sync = documents.readalongSync;
  const failedComparisons = (sync?.comparisons ?? []).filter((comparison) => !comparison.passed);
  const failures = [
    ...(sync?.status === "passed"
      ? []
      : [`Read-along sync status was ${sync?.status ?? "missing"}.`]),
    ...failedComparisons.map(
      (comparison) =>
        `${comparison.metric}: ${String(comparison.actual)} ${comparison.operator} ${String(
          comparison.expected,
        )}`,
    ),
  ];
  return gate({
    artifactKeys: ["readalongSyncMetrics", "readalongSyncSummary", "readalongSyncTimeline"],
    evidence: [
      `Median word drift ${String(sync?.metrics?.medianWordDriftMs ?? "missing")} ms.`,
      `P95 word drift ${String(sync?.metrics?.p95WordDriftMs ?? "missing")} ms.`,
      `Max phrase drift ${String(sync?.metrics?.maxPhraseDriftMs ?? "missing")} ms.`,
    ],
    failures,
    id: "readalong-sync-budget",
    title: "Read-along sync passes word and phrase budgets",
  });
}

function evaluateWrongNodeGate(documents) {
  const metrics = documents.readalongSync?.metrics ?? {};
  const browser = documents.readalongSync?.browser ?? {};
  const failures = [];
  if (Number(metrics.wrongNodeCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Wrong-node highlight count was ${String(metrics.wrongNodeCount)}.`);
  }
  if (Number(metrics.wrongWordCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Wrong-word highlight count was ${String(metrics.wrongWordCount)}.`);
  }
  if (Number(browser.failureCount ?? 0) !== 0) {
    failures.push(`Read-along browser evidence had ${String(browser.failureCount)} failures.`);
  }
  return gate({
    artifactKeys: ["readalongSyncMetrics"],
    evidence: [
      `Wrong-node count ${String(metrics.wrongNodeCount ?? "missing")}.`,
      `Wrong-word count ${String(metrics.wrongWordCount ?? "missing")}.`,
      `Browser failures ${String(browser.failureCount ?? 0)}.`,
    ],
    failures,
    id: "readalong-zero-wrong-node",
    title: "Wrong-node highlight is zero",
  });
}

function evaluateStaleHighlightGate(documents) {
  const metrics = documents.readalongSync?.metrics ?? {};
  const staleRows = (documents.readalongSync?.timeline ?? []).filter(
    (row) => row.runtimeState === "stale-audio" || row.fixtureId === "stale-audio",
  );
  const failures = [];
  if (Number(metrics.staleHighlightCount ?? Number.POSITIVE_INFINITY) !== 0) {
    failures.push(`Stale highlight count was ${String(metrics.staleHighlightCount)}.`);
  }
  const badRows = staleRows.filter(
    (row) => row.highlightedNodeId || row.highlightedWordIndex !== null || row.failures?.length,
  );
  if (badRows.length > 0) {
    failures.push(
      `Stale-audio evidence still rendered ${String(badRows.length)} active highlights.`,
    );
  }
  return gate({
    artifactKeys: ["readalongSyncMetrics", "readalongSyncTimeline"],
    evidence: [
      `Stale highlight count ${String(metrics.staleHighlightCount ?? "missing")}.`,
      `Stale rows inspected ${String(staleRows.length)}.`,
    ],
    failures,
    id: "stale-audio-no-highlight",
    title: "Stale audio cannot drive highlight",
  });
}

function evaluateAccessibilityReadAlongGate(documents) {
  const highContrastScenario = (documents.accessibilityResults?.results ?? []).find((result) =>
    /high-contrast|reduced-motion/i.test(result.id ?? result.label ?? ""),
  );
  const sync = documents.readalongSync;
  const failures = [];
  if (!highContrastScenario) {
    failures.push("Accessibility audit did not include a high-contrast reduced-motion scenario.");
  } else if (
    Number(highContrastScenario.scan?.failCount ?? 0) !== 0 ||
    (highContrastScenario.browserIssues ?? []).length !== 0
  ) {
    failures.push("High-contrast reduced-motion accessibility scenario had failures.");
  }
  if (sync?.status !== "passed") {
    failures.push("Read-along sync did not pass alongside accessibility evidence.");
  }
  return gate({
    artifactKeys: ["accessibilityResults", "readalongSyncMetrics"],
    evidence: [
      `Accessibility status ${documents.accessibilityResults?.status ?? "missing"}.`,
      `High-contrast/reduced-motion scenario ${highContrastScenario ? "recorded" : "missing"}.`,
      `Read-along sync status ${sync?.status ?? "missing"}.`,
    ],
    failures,
    id: "readalong-accessibility-modes",
    title: "Reduced motion and high contrast work during read-along",
  });
}

function evaluateActionOwnerGate(documents) {
  const actions = documents.actionInventory?.actions ?? [];
  const commandPalette = documents.commandPaletteResults;
  const ownershipIssues = actions.filter((action) =>
    (action.metadataIssues ?? []).some((issue) =>
      [
        "missing-owner",
        "playback-action-without-owner",
        "duplicate-playback-action-owner",
        "multiple-primary-playback-owners",
      ].includes(issue),
    ),
  );
  const failures = ownershipIssues.map(
    (action) => `${action.scenarioId}:${action.label} has ${action.metadataIssues.join(", ")}`,
  );
  if (commandPalette?.status !== "passed") {
    failures.push(`Command palette status was ${commandPalette?.status ?? "missing"}.`);
  }
  const advancedCommands = commandPalette?.result?.commandsObserved?.filter((command) =>
    /Advanced|Diagnostics|Timing map|Alignment repair/i.test(command.title),
  );
  if (!advancedCommands?.length) {
    failures.push("Command palette did not expose advanced/debug owner commands.");
  }
  return gate({
    artifactKeys: ["actionInventory", "commandPaletteResults"],
    evidence: [
      `Action ownership issues ${String(ownershipIssues.length)}.`,
      `Command palette commands observed ${String(commandPalette?.summary?.commandsObserved ?? "missing")}.`,
      `Advanced/debug commands observed ${String(advancedCommands?.length ?? 0)}.`,
    ],
    failures,
    id: "command-visible-owner-parity",
    title: "Command palette and visible controls share action owners",
  });
}

function evaluateDisabledReasonGate(documents) {
  const actions = documents.actionInventory?.actions ?? [];
  const disabledActionsWithoutReason = actions.filter(
    (action) =>
      action.disabled && !explicitReason(action.disabledReason ?? action.capabilityReason),
  );
  const disabledCommandsWithoutReason = (
    documents.commandPaletteResults?.result?.disabledCommands ?? []
  ).filter((command) => !explicitReason(command.reason));
  const accessibilityFailures = documents.accessibilityResults?.summary?.failures ?? 0;
  const failures = [
    ...disabledActionsWithoutReason.map(
      (action) => `${action.scenarioId}:${action.label} disabled without visible reason`,
    ),
    ...disabledCommandsWithoutReason.map(
      (command) => `${command.id || command.title} command disabled without visible reason`,
    ),
  ];
  if (Number(accessibilityFailures) > 0) {
    failures.push(`Accessibility audit had ${String(accessibilityFailures)} failures.`);
  }
  return gate({
    artifactKeys: ["actionInventory", "commandPaletteResults", "accessibilityResults"],
    evidence: [
      `Disabled visible controls ${String(actions.filter((action) => action.disabled).length)}.`,
      `Disabled commands ${String(documents.commandPaletteResults?.summary?.disabledCommands ?? "missing")}.`,
      `Accessibility disabled-reason failures included in total ${String(accessibilityFailures)}.`,
    ],
    failures,
    id: "disabled-controls-explain-why",
    title: "All disabled controls explain why",
  });
}

function evaluateCommandMoreCrossAuditGate(documents) {
  const audit = buildCommandMoreCrossAudit({
    actionInventory: documents.actionInventory,
    commandPaletteResults: documents.commandPaletteResults,
  });
  return gate({
    artifactKeys: ["actionInventory", "commandPaletteResults"],
    evidence: [
      `Matrix rows ${String(audit.summary.rows)}.`,
      `Visible-required actions ${String(audit.summary.visibleRequired)}.`,
      `Contextual More actions ${String(audit.summary.contextualMore)}.`,
      `Command palette actions observed ${String(audit.summary.commandPaletteActions)}.`,
      `More actions observed ${String(audit.summary.moreActions)}.`,
    ],
    failures: audit.findings.map((finding) => finding.message),
    findings: audit.findings.map((finding) => ({
      category: "command-more-cross-audit",
      message: finding.message,
      owner: "ui-platform",
      severity: finding.severity,
      waiverRequired: false,
    })),
    id: "command-more-cross-audit",
    severity: worstSeverity(
      audit.findings.map((finding) => ({
        severity: finding.severity,
      })),
    ),
    status: audit.status,
    title: "Command palette, More menu, visible controls, and shortcuts share one action contract",
  });
}

function gate({
  artifactKeys,
  evidence = [],
  failures = [],
  findings = [],
  id,
  passExplanation = null,
  severity = failures.length === 0 ? "informational" : "blocking",
  severityCounts = severityCountsFor(findings),
  status = failures.length === 0 ? "passed" : "failed",
  title,
}) {
  return {
    artifactKeys,
    evidence,
    failures,
    findings,
    id,
    passExplanation,
    severity,
    severityCounts,
    status,
    title,
  };
}

function collectUiActionAuditFindings(documents, auditStatus) {
  const actions = documents.actionInventory?.actions ?? [];
  const actionResults = documents.actionResults?.results ?? [];
  const summaryFindings = documents.uiActionSummary?.summaries?.gateFindings ?? {};
  const failedResults = summaryFindings.failedResults ?? actionResults.filter(isFailedResult);
  const noOpResults = failedResults.filter(isNoOpResult);
  const failedActivations = failedResults.filter((result) => !isNoOpResult(result));
  const duplicates = classifyDuplicateGroups(
    summaryFindings.duplicates ?? documents.actionInventory?.duplicates ?? [],
  );
  const duplicateClassification =
    summaryFindings.duplicateClassification ??
    documents.actionInventory?.duplicateClassification ??
    summarizeDuplicateClassifications(duplicates);
  const duplicatesByCategory = (category) =>
    duplicates.filter((duplicate) => duplicate.classification?.category === category);
  const missingStableTestIds = actions.filter((action) => !hasStableActionId(action));
  const waivers = collectUiActionAuditWaivers(documents);
  const findings = [];

  if (!auditStatus) {
    findings.push(
      uiActionFinding({
        category: "ui-action-audit-status",
        count: 1,
        message: "UI action audit status was missing.",
        owner: "UX QA owner",
        samples: [],
        severity: "blocking",
        waiverRequired: false,
      }),
    );
  } else if (!["passed", "completed-with-findings"].includes(auditStatus)) {
    findings.push(
      uiActionFinding({
        category: "ui-action-audit-status",
        count: 1,
        message: `UI action audit status was ${auditStatus}.`,
        owner: "UX QA owner",
        samples: [],
        severity: auditStatus === "inventory-only" ? "blocking" : "needs-review",
        waiverRequired: false,
      }),
    );
  } else if (auditStatus === "completed-with-findings") {
    findings.push(
      uiActionFinding({
        category: "ui-action-audit-status",
        count: 1,
        message: "UI action audit completed with findings and is not clean review-complete.",
        owner: "UX QA owner",
        samples: [],
        severity: "needs-review",
        waiverRequired: false,
      }),
    );
  }

  if (failedActivations.length > 0) {
    findings.push(
      applyUiActionWaiver(
        uiActionFinding({
          category: "failed-activations",
          count: failedActivations.length,
          message: `${String(failedActivations.length)} failed action activation(s) require review.`,
          owner: ownersForResults(failedActivations, actions),
          samples: failedActivations.slice(0, 5).map(formatResultSample),
          severity: "blocking",
          waiverRequired: true,
        }),
        waivers,
      ),
    );
  }

  if (noOpResults.length > 0) {
    findings.push(
      applyUiActionWaiver(
        uiActionFinding({
          category: "no-op-controls",
          count: noOpResults.length,
          message: `${String(noOpResults.length)} no-op control activation(s) require review.`,
          owner: ownersForResults(noOpResults, actions),
          samples: noOpResults.slice(0, 5).map(formatResultSample),
          severity: "blocking",
          waiverRequired: true,
        }),
        waivers,
      ),
    );
  }

  if (duplicateClassification.unclassified > 0) {
    const unclassified = duplicatesByCategory("unclassified");
    findings.push(
      uiActionFinding({
        category: "unclassified-duplicate-groups",
        count: duplicateClassification.unclassified,
        message: `${String(
          duplicateClassification.unclassified,
        )} duplicate action group(s) are missing duplicate waiver registry classification.`,
        owner: ownersForDuplicates(unclassified),
        samples: unclassified.slice(0, 5).map(formatDuplicateSample),
        severity: "blocking",
        threshold: 0,
        waiverRequired: false,
      }),
    );
  }

  if (duplicateClassification.overexposed > 0) {
    const overexposed = duplicatesByCategory("overexposed");
    const missingCarryMetadata = overexposed.filter(
      (duplicate) => !duplicateHasCarryMetadata(duplicate),
    );
    findings.push(
      uiActionFinding({
        category: "overexposed-duplicate-groups",
        count: duplicateClassification.overexposed,
        message: `${String(
          duplicateClassification.overexposed,
        )} overexposed duplicate action group(s) have burn-down owners/issues.`,
        owner: ownersForDuplicates(overexposed),
        samples: overexposed.slice(0, 5).map(formatDuplicateSample),
        severity: "needs-review",
        threshold: 0,
        waiverRequired: false,
      }),
    );
    if (missingCarryMetadata.length > 0) {
      findings.push(
        uiActionFinding({
          category: "uncarried-overexposed-duplicate-groups",
          count: missingCarryMetadata.length,
          message: `${String(
            missingCarryMetadata.length,
          )} overexposed duplicate action group(s) lack owner, reason, review date, or burn-down issue.`,
          owner: ownersForDuplicates(missingCarryMetadata),
          samples: missingCarryMetadata.slice(0, 5).map(formatDuplicateSample),
          severity: "blocking",
          threshold: 0,
          waiverRequired: false,
        }),
      );
    }
  }

  if (duplicateClassification.needsConsolidation > 0) {
    const needsConsolidation = duplicatesByCategory("needs-consolidation");
    const missingCarryMetadata = needsConsolidation.filter(
      (duplicate) => !duplicateHasCarryMetadata(duplicate),
    );
    findings.push(
      uiActionFinding({
        category: "needs-consolidation-duplicate-groups",
        count: duplicateClassification.needsConsolidation,
        message: `${String(
          duplicateClassification.needsConsolidation,
        )} duplicate action group(s) are classified for IA consolidation.`,
        owner: ownersForDuplicates(needsConsolidation),
        samples: needsConsolidation.slice(0, 5).map(formatDuplicateSample),
        severity: "needs-review",
        threshold: 0,
        waiverRequired: false,
      }),
    );
    if (missingCarryMetadata.length > 0) {
      findings.push(
        uiActionFinding({
          category: "uncarried-needs-consolidation-duplicate-groups",
          count: missingCarryMetadata.length,
          message: `${String(
            missingCarryMetadata.length,
          )} IA duplicate action group(s) lack owner, reason, review date, or burn-down issue.`,
          owner: ownersForDuplicates(missingCarryMetadata),
          samples: missingCarryMetadata.slice(0, 5).map(formatDuplicateSample),
          severity: "blocking",
          threshold: 0,
          waiverRequired: false,
        }),
      );
    }
  }

  if (duplicateClassification.waived > 0) {
    findings.push(
      uiActionFinding({
        category: "classified-duplicate-waivers",
        count: duplicateClassification.waived,
        message: `${String(
          duplicateClassification.waived,
        )} duplicate action group(s) are classified by the duplicate waiver registry.`,
        owner: "UX action inventory owner",
        samples: duplicates
          .filter((duplicate) => duplicate.classification?.category?.startsWith("allowed-"))
          .slice(0, 5)
          .map(formatDuplicateSample),
        severity: "waived",
        threshold: 0,
        waiver: {
          id: "wp46-duplicate-waiver-registry",
          owner: "UX action inventory owner",
          reason:
            "WP46 duplicate waiver registry classifies accepted duplicate controls with owners, reasons, accepted surfaces, and review dates.",
          reviewDate: duplicateClassification.duplicateWaiverRegistry?.[0]?.reviewDate ?? null,
          source: "ui-action-audit",
        },
        waiverRequired: false,
      }),
    );
  }

  if (missingStableTestIds.length > UI_ACTION_AUDIT_THRESHOLDS.missingStableTestIds) {
    findings.push(
      applyUiActionWaiver(
        uiActionFinding({
          category: "missing-stable-test-ids",
          count: missingStableTestIds.length,
          message: `${String(
            missingStableTestIds.length,
          )} visible action(s) without stable data-testid exceed the threshold of ${String(
            UI_ACTION_AUDIT_THRESHOLDS.missingStableTestIds,
          )}.`,
          owner: ownersForActions(missingStableTestIds),
          samples: missingStableTestIds.slice(0, 5).map(formatActionSample),
          severity: "blocking",
          threshold: UI_ACTION_AUDIT_THRESHOLDS.missingStableTestIds,
          waiverRequired: true,
        }),
        waivers,
      ),
    );
  }

  if (findings.length === 0) {
    findings.push(
      uiActionFinding({
        category: "ui-action-audit-status",
        count: 0,
        message: "UI action audit is clean review-complete.",
        owner: "UX QA owner",
        samples: [],
        severity: "informational",
        waiverRequired: false,
      }),
    );
  }

  reconcileCompletedWithFindingsStatus(findings, auditStatus);
  return findings;
}

function hasStableActionId(action) {
  return action.hasStableActionId ?? action.hasStableTestId;
}

function uiActionFinding({
  category,
  count,
  message,
  owner,
  samples,
  severity,
  threshold = 0,
  waiver = null,
  waiverRequired,
}) {
  return {
    category,
    count,
    id: `ui-action-audit:${category}`,
    message,
    owner: owner || "UX QA owner",
    samples,
    severity,
    threshold,
    waiver,
    waiverRequired,
    waived: severity === "waived",
  };
}

function applyUiActionWaiver(finding, waivers) {
  const waiver = waivers.find((candidate) => waiverMatchesFinding(candidate, finding));
  if (!waiver) {
    return finding;
  }
  return {
    ...finding,
    severity: "waived",
    waiver,
    waived: true,
  };
}

function waiverMatchesFinding(waiver, finding) {
  if (!validWaiver(waiver)) {
    return false;
  }
  return (
    waiver.findingId === finding.id ||
    waiver.id === finding.id ||
    waiver.category === finding.category ||
    waiver.id === finding.category
  );
}

function validWaiver(waiver) {
  return Boolean(
    String(waiver?.owner ?? "").trim() &&
      String(waiver?.reason ?? "").trim() &&
      validReviewDate(waiver?.reviewDate),
  );
}

function reconcileCompletedWithFindingsStatus(findings, auditStatus) {
  if (auditStatus !== "completed-with-findings") {
    return;
  }
  const statusFinding = findings.find((finding) => finding.category === "ui-action-audit-status");
  if (!statusFinding) {
    return;
  }
  const concreteFindings = findings.filter((finding) => finding !== statusFinding);
  const unresolvedConcrete = concreteFindings.filter((finding) =>
    ["blocking", "needs-review"].includes(finding.severity),
  );
  const waivedConcrete = concreteFindings.find((finding) => finding.severity === "waived");
  if (unresolvedConcrete.length > 0 || !waivedConcrete) {
    return;
  }
  statusFinding.severity = "waived";
  statusFinding.waived = true;
  statusFinding.waiver = {
    id: "ui-action-audit:completed-with-waived-findings",
    owner: waivedConcrete.waiver?.owner ?? waivedConcrete.owner ?? "UX QA owner",
    reason:
      "UI action audit remains completed-with-findings because the concrete review findings are explicitly waived.",
    reviewDate: waivedConcrete.waiver?.reviewDate ?? null,
    source: "ui-action-audit",
  };
}

function collectUiActionAuditWaivers(documents) {
  return [
    ...(documents.uiActionSummary?.waivers ?? []),
    ...(documents.uiActionSummary?.qualityWaivers ?? []),
    ...(documents.actionResults?.waivers ?? []),
    ...(documents.actionResults?.qualityWaivers ?? []),
    ...(documents.actionInventory?.waivers ?? []),
    ...(documents.actionInventory?.qualityWaivers ?? []),
    ...(documents.actionInventory?.duplicateWaiverRegistry ?? [])
      .filter((waiver) => String(waiver.category ?? "").startsWith("allowed-"))
      .map((waiver) => ({
        ...waiver,
        category: `duplicate:${waiver.category}`,
        source: "duplicate-waiver-registry",
      })),
  ].map((waiver) => ({
    acceptedSurfaces: waiver.acceptedSurfaces ?? [],
    category: waiver.category ?? null,
    findingId: waiver.findingId ?? null,
    id: waiver.id ?? waiver.category ?? waiver.findingId ?? "ui-action-audit-waiver",
    owner: waiver.owner ?? "unassigned",
    reason: waiver.reason ?? "No reason provided.",
    reviewDate: waiver.reviewDate ?? waiver.expiresAt ?? null,
    source: waiver.source ?? "ui-action-audit",
  }));
}

function severityCountsFor(findings) {
  return Object.fromEntries(
    UI_ACTION_AUDIT_SEVERITIES.map((severity) => [
      severity,
      findings.filter((finding) => finding.severity === severity).length,
    ]),
  );
}

function worstSeverity(findings) {
  if (findings.some((finding) => finding.severity === "blocking")) {
    return "blocking";
  }
  if (findings.some((finding) => finding.severity === "needs-review")) {
    return "needs-review";
  }
  if (findings.some((finding) => finding.severity === "waived")) {
    return "waived";
  }
  return "informational";
}

function duplicateHasCarryMetadata(duplicate) {
  const classification = duplicate.classification ?? {};
  return Boolean(
    String(classification.owner ?? "").trim() &&
      String(classification.reason ?? "").trim() &&
      validReviewDate(classification.reviewDate ?? classification.expiresAt) &&
      String(classification.burnDownIssue ?? "").trim(),
  );
}

function validReviewDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""));
}

function finalUxMergeReadiness({
  commandFailures,
  failedGates,
  status,
  unresolvedFindings,
  waivedFindings,
  waivers,
}) {
  if (commandFailures.length > 0 || failedGates.length > 0) {
    return {
      reasons: [
        ...commandFailures.slice(0, 3).map((step) => `${step.title} command failed.`),
        ...failedGates.slice(0, 3).map((gateResult) => `${gateResult.title} failed.`),
      ].slice(0, 4),
      status: "blocked",
    };
  }
  if (unresolvedFindings.length > 0) {
    return {
      reasons: unresolvedFindings
        .slice(0, 4)
        .map((finding) => finding.message ?? finding.category ?? "Unresolved UX finding."),
      status: "not ready",
    };
  }
  if (status === "passed-with-findings" || waivedFindings.length > 0 || waivers.length > 0) {
    return {
      reasons: ["No blocking findings remain, but explicit waivers are still active."],
      status: "ready with waivers",
    };
  }
  return {
    reasons: ["No blocking, needs-review, or waived findings were detected."],
    status: "ready",
  };
}

export function finalUxGateThresholds(gates) {
  return gates.map((gateResult) => ({
    actual: gateResult.status,
    expected: "passed or passed-with-findings",
    metric: gateResult.id,
    operator: "in",
    passed: PASSING_GATE_STATUSES.has(gateResult.status),
    threshold: gateResult.title,
  }));
}

function formatSeverityCounts(severityCounts) {
  return UI_ACTION_AUDIT_SEVERITIES.map(
    (severity) => `${severity}=${String(severityCounts[severity] ?? 0)}`,
  ).join(", ");
}

function isFailedResult(result) {
  return result?.passed === false;
}

function isNoOpResult(result) {
  return /no observable result/i.test(result?.outcome ?? result?.reason ?? "");
}

function ownersForResults(results, actions) {
  const actionByKey = new Map(
    actions.map((action) => [`${action.scenarioId}|${action.actionId}`, action]),
  );
  const owners = results
    .map((result) => actionByKey.get(`${result.scenarioId}|${result.actionId}`)?.owner)
    .filter(Boolean);
  return formatOwnerList(owners);
}

function ownersForActions(actions) {
  return formatOwnerList(actions.map((action) => action.owner).filter(Boolean));
}

function ownersForDuplicates(duplicates) {
  const owners = duplicates.flatMap((duplicate) => [
    duplicate.classification?.owner,
    ...(duplicate.playbackOwners ?? []),
    ...(duplicate.surfaces ?? []),
  ]);
  return formatOwnerList(owners, "UX action inventory owner");
}

function formatOwnerList(owners, fallback = "UX QA owner") {
  const unique = [...new Set(owners.map((owner) => String(owner).trim()).filter(Boolean))].slice(
    0,
    4,
  );
  return unique.length > 0 ? unique.join(", ") : fallback;
}

function formatResultSample(result) {
  return `${result.surface ?? "unknown surface"} / ${result.scenarioId ?? "unknown scenario"} / ${result.label ?? result.actionId ?? "unknown action"} / ${result.activationMode ?? "activation"}: ${result.outcome ?? result.reason ?? result.status ?? "failed"}`;
}

function formatActionSample(action) {
  return `${action.surface ?? "unknown surface"} / ${action.scenarioId ?? "unknown scenario"} / ${action.label ?? action.actionId ?? "unknown action"}`;
}

function formatDuplicateSample(duplicate) {
  const classification = duplicate.classification?.category
    ? ` / ${duplicate.classification.category}`
    : "";
  const issue = duplicate.classification?.burnDownIssue
    ? ` / ${duplicate.classification.burnDownIssue}`
    : "";
  return `${duplicate.surface ?? duplicate.surfaces?.join(", ") ?? "unknown surface"} / ${duplicate.label ?? "unknown label"} / count=${String(duplicate.count ?? 0)}${classification}${issue}`;
}

function formatFindingSummary(finding) {
  return `[${finding.severity}] ${finding.message} Owner: ${finding.owner}. Count: ${String(
    finding.count,
  )}; threshold: ${String(finding.threshold)}.`;
}

function formatWaiver(waiver) {
  if (!waiver) {
    return "missing";
  }
  const reviewDate = waiver.reviewDate ? `, review: ${waiver.reviewDate}` : "";
  return `${waiver.reason} (owner: ${waiver.owner}${reviewDate})`;
}

function isCinemaMoreMenuAction(action) {
  return (
    action.actionId === "ui-action-cinema-more-menu" ||
    /Open Cinema More menu/i.test(action.label ?? "")
  );
}

function isCinemaMoreMenuEntry(action) {
  if (isCinemaMoreMenuAction(action)) {
    return false;
  }
  if (action.cinemaMoreActionId || action.cinemaMoreSectionId) {
    return true;
  }
  return /^ui-action-cinema-(more|advanced)-/.test(action.actionId ?? "");
}

function normalizeFinalUxLabel(label) {
  return String(label ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function collectFinalUxWaivers(documents) {
  return [
    ...(documents.readalongSync?.waivers ?? []).map((waiver) => ({
      id: waiver.fixtureId,
      owner: waiver.owner,
      reason: waiver.reason,
      source: "readalong-sync",
    })),
    ...collectUiActionAuditWaivers(documents)
      .filter(validWaiver)
      .map((waiver) => ({
        acceptedSurfaces: waiver.acceptedSurfaces,
        id: waiver.findingId ?? waiver.category ?? waiver.id,
        owner: waiver.owner,
        reason: waiver.reason,
        reviewDate: waiver.reviewDate,
        source: "ui-action-audit",
      })),
  ];
}

function explicitReason(value) {
  return String(value ?? "").trim().length > 0;
}

export function renderFinalUxSummary(result) {
  const lines = [
    "# Final UX Gates",
    "",
    `Status: **${result.status.toUpperCase()}**`,
    `Generated: ${result.generatedAt}`,
    `Merge readiness: **${(result.mergeReadiness?.status ?? "unknown").toUpperCase()}**`,
    "",
    "## Summary",
    "",
    `- Gates: ${String(result.summary.passed)}/${String(result.summary.total)} clean passed`,
    `- Passed with findings: ${String(result.summary.passedWithFindings)}`,
    `- Failed gates: ${String(result.summary.failed)}`,
    `- Command failures: ${String(result.summary.commandsFailed)}`,
    `- Merge readiness: ${result.summary.mergeReadiness ?? "unknown"}`,
    `- Unresolved findings: ${String(result.summary.unresolvedFindings)}`,
    `- Waived findings: ${String(result.summary.waivedFindings)}`,
    `- Waivers: ${String(result.summary.waivers)}`,
    "",
    "## Gate Results",
    "",
    "| Gate | Status | Severity | Evidence | Artifacts |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const gateResult of result.gates) {
    lines.push(
      `| ${escapeMarkdown(gateResult.title)} | ${gateResult.status.toUpperCase()} | ${escapeMarkdown(
        gateResult.severity ?? "informational",
      ).toUpperCase()} | ${escapeMarkdown(
        gateResult.evidence.join("; ") || "-",
      )} | ${gateResult.artifactPaths.map((item) => `[${escapeMarkdown(item)}](${encodeURI(item)})`).join("<br>")} |`,
    );
  }
  const passExplanations = result.gates
    .map((gateResult) => gateResult.passExplanation)
    .filter(Boolean);
  if (passExplanations.length > 0) {
    lines.push("", "## Why Final Still Passes", "");
    for (const explanation of passExplanations) {
      lines.push(`- ${explanation}`);
    }
  }
  if (result.mergeReadiness) {
    lines.push("", "## Merge Readiness", "");
    for (const reason of result.mergeReadiness.reasons ?? []) {
      lines.push(`- ${reason}`);
    }
  }
  if (result.unresolvedFindings.length > 0) {
    lines.push("", "## Unresolved Findings", "");
    for (const finding of result.unresolvedFindings) {
      lines.push(`- ${formatFindingSummary(finding)}`);
      for (const sample of finding.samples ?? []) {
        lines.push(`  - ${escapeMarkdown(sample)}`);
      }
    }
  }
  if (result.waivedFindings.length > 0) {
    lines.push("", "## Waived Findings", "");
    for (const finding of result.waivedFindings) {
      lines.push(`- ${formatFindingSummary(finding)} Waiver: ${formatWaiver(finding.waiver)}`);
    }
  }
  const failedGates = result.gates.filter((gateResult) => gateResult.status === "failed");
  if (failedGates.length > 0) {
    lines.push("", "## Failures", "");
    for (const gateResult of failedGates) {
      lines.push(`### ${gateResult.title}`, "");
      for (const failure of gateResult.failures) {
        lines.push(`- ${failure}`);
      }
      lines.push("");
    }
  }
  lines.push("", "## Commands", "", "| Command | Status | Log |");
  lines.push("| --- | --- | --- |");
  for (const command of result.commandRunList) {
    lines.push(
      `| ${escapeMarkdown(command.title)} | ${command.status.toUpperCase()} | [log](${encodeURI(
        command.logPath,
      )}) |`,
    );
  }
  lines.push("", "## Waivers", "");
  if (result.waivers.length === 0) {
    lines.push("No waivers declared.");
  } else {
    for (const waiver of result.waivers) {
      const reviewDate = waiver.reviewDate ? `, review: ${waiver.reviewDate}` : "";
      lines.push(`- ${waiver.id}: ${waiver.reason} (owner: ${waiver.owner}${reviewDate})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function commandRunEntry(step, outputDir) {
  return {
    durationMs: step.durationMs,
    exitCode: step.exitCode,
    id: step.id,
    logPath: step.logPath ? path.relative(outputDir, step.logPath) : "",
    status: step.status,
    title: step.title,
  };
}

export {
  finalAccessibilityArtifacts,
  finalCommandPaletteArtifacts,
  finalContextPanelArtifacts,
  finalReadAlongSyncArtifacts,
  finalResponsiveArtifacts,
  finalSurfaceComplexityArtifacts,
  finalTelepromptArtifacts,
  finalUiActionArtifacts,
  finalUxArtifactPaths,
};

export async function readFinalUxDocuments(paths) {
  return {
    accessibilityResults: await readJsonIfPresent(paths.accessibilityResults),
    actionInventory: await readJsonIfPresent(paths.actionInventory),
    actionResults: await readJsonIfPresent(paths.actionResults),
    commandPaletteResults: await readJsonIfPresent(paths.commandPaletteResults),
    contextPanelResults: await readJsonIfPresent(paths.contextPanelResults),
    readalongSync: await readJsonIfPresent(paths.readalongSyncMetrics),
    responsiveResults: await readJsonIfPresent(paths.responsiveResults),
    surfaceComplexity: await readJsonIfPresent(paths.surfaceComplexityBudget),
    telepromptMemory: await readJsonIfPresent(paths.telepromptMemoryResults),
    uiActionSummary: await readJsonIfPresent(paths.uiActionSummary),
  };
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function relativePath(fromDir, filePath) {
  return path.relative(fromDir, filePath);
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}
