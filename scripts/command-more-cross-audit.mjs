export const COMMAND_MORE_ACTION_CONTRACTS = [
  {
    classification: "duplicate-allowed",
    commandId: "command.palette",
    id: "open-command-palette",
    keyboardShortcutId: "command.palette",
    label: "Open command palette",
    moreActionId: "command-palette",
    moreOwner: "cinema-help",
    owner: "command-palette",
    searchQuery: "command palette",
    visibleRequired: true,
    visibleTestIds: ["ui-action-command-palette-open"],
  },
  {
    classification: "duplicate-allowed",
    commandId: "settings:open",
    id: "open-settings",
    keyboardShortcutId: "settings.open",
    label: "Open settings",
    owner: "settings",
    searchQuery: "open settings",
    visibleRequired: true,
    visibleTestIds: ["ui-action-settings-open"],
  },
  {
    classification: "duplicate-allowed",
    commandId: "playback:create-listen",
    id: "create-listen",
    keyboardShortcutId: "playback.createListen",
    label: "Create & Listen",
    owner: "workspace",
    searchQuery: "create listen",
    visibleRequired: true,
    visibleTestIds: ["workspace-stage-action-createAndListen", "ui-action-create-listen"],
  },
  {
    classification: "contextual-more",
    commandId: "settings:field:readerPreferences",
    commandOwner: "settings",
    id: "reader-settings",
    label: "Reader settings",
    moreActionId: "reader-settings",
    owner: "cinema-display",
    searchQuery: "reader preferences",
  },
  {
    classification: "visible-required",
    commandId: "cinema:theatre:open",
    id: "cinema-theatre",
    label: "Cinema Theatre",
    moreActionId: "theatre-mode",
    owner: "cinema-theatre",
    searchQuery: "cinema theatre",
    visibleRequired: true,
    visibleTestIds: ["ui-action-cinema-theatre"],
  },
  {
    classification: "contextual-more",
    commandId: "cinema:advanced:policy-internals",
    id: "policy-internals",
    label: "Policy internals",
    moreActionId: "policy-internals",
    owner: "cinema-advanced",
    searchQuery: "policy internals",
  },
  {
    classification: "contextual-more",
    commandId: "cinema:advanced:source-internals",
    id: "source-internals",
    label: "Source internals",
    moreActionId: "source-internals",
    owner: "cinema-advanced",
    searchQuery: "source internals",
  },
  {
    classification: "contextual-more",
    commandId: "cinema:advanced:diagnostics",
    id: "diagnostics",
    label: "Diagnostics",
    moreActionId: "diagnostics",
    owner: "cinema-diagnostics",
    searchQuery: "advanced diagnostics",
  },
  {
    classification: "contextual-more",
    commandId: "cinema:advanced:timing-map",
    id: "timing-map",
    label: "Timing map",
    moreActionId: "timing-map",
    owner: "cinema-diagnostics",
    searchQuery: "timing map",
  },
  {
    classification: "contextual-more",
    commandId: "cinema:advanced:alignment-repair",
    id: "alignment-repair",
    label: "Alignment repair",
    moreActionId: "alignment-repair",
    owner: "cinema-diagnostics",
    searchQuery: "alignment repair",
  },
  {
    classification: "contextual-more",
    commandId: "shortcuts:open",
    commandOwner: "settings",
    id: "keyboard-shortcuts",
    keyboardShortcutId: "shortcut.cheatsheet",
    label: "Keyboard shortcuts",
    moreActionId: "keyboard-shortcuts",
    owner: "cinema-help",
    searchQuery: "shortcut cheat sheet",
  },
  {
    classification: "contextual-more",
    commandId: "help:open",
    commandOwner: "help",
    id: "help-guide",
    keyboardShortcutId: "help.open",
    label: "Help/guide",
    moreActionId: "help-guide",
    owner: "cinema-help",
    searchQuery: "open help",
  },
  {
    classification: "command-only-okay",
    commandId: "cinema:theatre:exit",
    id: "exit-theatre",
    label: "Exit Theatre",
    owner: "cinema-theatre",
    searchQuery: "exit theatre",
  },
  {
    classification: "command-only-okay",
    commandId: "cinema:theatre:toggle-controls",
    id: "toggle-theatre-controls",
    label: "Toggle Theatre controls",
    owner: "cinema-theatre",
    searchQuery: "toggle theatre controls",
  },
];

export const COMMAND_MORE_CLASSIFICATIONS = [
  "visible-required",
  "contextual-more",
  "command-only-okay",
  "duplicate-allowed",
  "duplicate-not-allowed",
];

export function contractCommandSearchQueries() {
  return COMMAND_MORE_ACTION_CONTRACTS.filter((contract) => contract.commandId).map((contract) => ({
    commandId: contract.commandId,
    id: contract.id,
    query: contract.searchQuery ?? contract.label,
  }));
}

export function buildCommandMoreCrossAudit({
  actionInventory = null,
  commandPaletteResults = null,
  generatedAt = new Date().toISOString(),
} = {}) {
  const hasActionInventory = Boolean(actionInventory);
  const hasCommandPaletteResults = Boolean(commandPaletteResults);
  const actions = actionInventory?.actions ?? [];
  const commands = commandPaletteResults?.result?.commandsObserved ?? [];
  const shortcutExpectations = new Map(
    COMMAND_MORE_ACTION_CONTRACTS.filter((contract) => contract.keyboardShortcutId).map(
      (contract) => [contract.keyboardShortcutId, contract.commandId],
    ),
  );
  const matrix = COMMAND_MORE_ACTION_CONTRACTS.map((contract) =>
    matrixRow({ actions, commands, contract }),
  );
  const findings = [
    ...(hasActionInventory ? requiredCommandOnlyFindings(matrix) : []),
    ...(hasActionInventory ? moreActionOwnerFindings(actions) : []),
    ...(hasCommandPaletteResults ? commandOwnerFindings(matrix) : []),
    ...(hasActionInventory && hasCommandPaletteResults ? disabledReasonParityFindings(matrix) : []),
    ...shortcutDriftFindings({ actions, commands, shortcutExpectations }),
    ...(hasCommandPaletteResults
      ? missingCommandFindings({ commands, commandPaletteResults })
      : []),
  ];
  return {
    classifications: COMMAND_MORE_CLASSIFICATIONS,
    findings,
    generatedAt,
    matrix,
    schemaVersion: "command-more-cross-audit.v1",
    status: findings.some((finding) => finding.severity === "blocking") ? "failed" : "passed",
    summary: {
      blocking: findings.filter((finding) => finding.severity === "blocking").length,
      commandPaletteActions: commands.length,
      contextualMore: matrix.filter((row) => row.classification === "contextual-more").length,
      duplicateAllowed: matrix.filter((row) => row.classification === "duplicate-allowed").length,
      findings: findings.length,
      moreActions: actions.filter((action) => action.cinemaMoreActionId).length,
      rows: matrix.length,
      visibleRequired: matrix.filter((row) => row.visibleRequired).length,
    },
  };
}

export function renderCommandMoreCrossAuditMarkdown(audit) {
  const lines = [
    "# Command Palette and More Menu Cross-Audit",
    "",
    `Status: **${audit.status.toUpperCase()}**`,
    `Generated: ${audit.generatedAt}`,
    "",
    "## Matrix",
    "",
    "| Action | Classification | Visible button | More menu action | Command palette action | Keyboard shortcut | Owner | Disabled reason |",
    "|---|---|---:|---:|---:|---|---|---|",
  ];
  for (const row of audit.matrix) {
    lines.push(
      `| ${escapeCell(row.label)} | ${row.classification} | ${formatCount(
        row.visibleButton.count,
      )} | ${formatCount(row.moreMenuAction.count)} | ${formatCount(
        row.commandPaletteAction.count,
      )} | ${escapeCell(row.keyboardShortcut.id || "None")} | ${escapeCell(row.owner)} | ${escapeCell(
        row.disabledReason || "None",
      )} |`,
    );
  }
  if (audit.findings.length > 0) {
    lines.push("", "## Findings", "");
    for (const finding of audit.findings) {
      lines.push(`- **${finding.severity}** ${finding.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function matrixRow({ actions, commands, contract }) {
  const visibleActions = actions.filter((action) => visibleActionMatchesContract(action, contract));
  const moreActions = contract.moreActionId
    ? actions.filter((action) => action.cinemaMoreActionId === contract.moreActionId)
    : [];
  const commandActions = contract.commandId
    ? commands.filter((command) => command.id === contract.commandId)
    : [];
  const disabledReasons = [
    ...visibleActions.map((action) => action.disabledReason),
    ...moreActions.map((action) => action.disabledReason ?? action.cinemaMoreDisabledReason),
    ...commandActions.map((command) => command.reason),
  ]
    .map(normalizeReason)
    .filter(Boolean);
  return {
    classification: contract.classification,
    commandId: contract.commandId ?? null,
    commandPaletteAction: {
      count: commandActions.length,
      disabledReasons: unique(commandActions.map((command) => command.reason).filter(Boolean)),
      ids: unique(commandActions.map((command) => command.id).filter(Boolean)),
      owners: unique(commandActions.map((command) => command.owner).filter(Boolean)),
    },
    disabledReason: unique(disabledReasons).join(" | "),
    id: contract.id,
    keyboardShortcut: {
      id: contract.keyboardShortcutId ?? null,
    },
    label: contract.label,
    moreMenuAction: {
      commandIds: unique(moreActions.map((action) => action.commandId).filter(Boolean)),
      count: moreActions.length,
      ids: unique(moreActions.map((action) => action.cinemaMoreActionId).filter(Boolean)),
      owners: unique(moreActions.map((action) => action.owner).filter(Boolean)),
    },
    owner: contract.owner,
    commandOwner: contract.commandOwner ?? contract.owner,
    visibleButton: {
      count: visibleActions.length,
      disabledReasons: unique(
        visibleActions.map((action) => action.disabledReason).filter(Boolean),
      ),
      ids: unique(visibleActions.map((action) => action.actionId).filter(Boolean)),
      testIds: unique(visibleActions.map((action) => action.testId).filter(Boolean)),
    },
    visibleRequired: Boolean(contract.visibleRequired),
  };
}

function visibleActionMatchesContract(action, contract) {
  if (action.surface === "Command Palette" || action.cinemaMoreActionId) {
    return false;
  }
  if (contract.commandId && action.commandId === contract.commandId) {
    return true;
  }
  if (contract.visibleTestIds?.includes(action.testId)) {
    return true;
  }
  return contract.visibleTestIds?.includes(action.actionId) ?? false;
}

function requiredCommandOnlyFindings(matrix) {
  return matrix
    .filter(
      (row) =>
        row.visibleRequired && row.commandPaletteAction.count > 0 && row.visibleButton.count === 0,
    )
    .map((row) => finding("blocking", `${row.label} exists only in the command palette.`));
}

function moreActionOwnerFindings(actions) {
  const contractsByMoreAction = new Map(
    COMMAND_MORE_ACTION_CONTRACTS.filter((contract) => contract.moreActionId).map((contract) => [
      contract.moreActionId,
      contract,
    ]),
  );
  return actions
    .filter((action) => action.cinemaMoreActionId)
    .flatMap((action) => {
      const contract = contractsByMoreAction.get(action.cinemaMoreActionId);
      const issues = [];
      if (!contract) {
        issues.push(
          finding(
            "blocking",
            `${action.surface}:${action.label} is a More action without an action contract owner.`,
          ),
        );
        return issues;
      }
      const expectedOwner = contract.moreOwner ?? contract.owner;
      if (!action.owner || action.owner !== expectedOwner) {
        issues.push(
          finding(
            "blocking",
            `${action.surface}:${action.label} owner ${action.owner || "missing"} does not match ${expectedOwner}.`,
          ),
        );
      }
      if (contract.commandId && action.commandId !== contract.commandId) {
        issues.push(
          finding(
            "blocking",
            `${action.surface}:${action.label} command ${action.commandId || "missing"} does not match ${contract.commandId}.`,
          ),
        );
      }
      return issues;
    });
}

function commandOwnerFindings(matrix) {
  return matrix.flatMap((row) =>
    row.commandPaletteAction.owners
      .filter((owner) => owner !== row.commandOwner && row.commandPaletteAction.count > 0)
      .map((owner) =>
        finding(
          "blocking",
          `${row.label} command owner ${owner || "missing"} does not match ${row.commandOwner}.`,
        ),
      ),
  );
}

function disabledReasonParityFindings(matrix) {
  return matrix
    .filter((row) => row.visibleRequired)
    .flatMap((row) => {
      const visibleReasons = row.visibleButton.disabledReasons.map(normalizeReason).filter(Boolean);
      const commandReasons = row.commandPaletteAction.disabledReasons
        .map(normalizeReason)
        .filter(Boolean);
      if (visibleReasons.length === 0 || commandReasons.length === 0) {
        return [];
      }
      const commandSet = new Set(commandReasons);
      return visibleReasons
        .filter((reason) => !commandSet.has(reason))
        .map((reason) =>
          finding(
            "blocking",
            `${row.label} visible disabled reason "${reason}" does not match command palette reason "${commandReasons.join(" | ")}".`,
          ),
        );
    });
}

function shortcutDriftFindings({ actions, commands, shortcutExpectations }) {
  const observed = [
    ...actions
      .filter((action) => action.shortcutCommandId)
      .map((action) => ({
        commandId: action.commandId,
        label: action.label,
        shortcutCommandId: action.shortcutCommandId,
        source: action.surface,
      })),
    ...commands
      .filter((command) => command.shortcutCommandId)
      .map((command) => ({
        commandId: command.id,
        label: command.title,
        shortcutCommandId: command.shortcutCommandId,
        source: "Command Palette",
      })),
  ];
  return observed.flatMap((item) => {
    const expectedCommandId = shortcutExpectations.get(item.shortcutCommandId);
    if (!expectedCommandId || expectedCommandId === item.commandId) {
      return [];
    }
    return [
      finding(
        "blocking",
        `${item.source}:${item.label} shortcut ${item.shortcutCommandId} maps to ${item.commandId || "missing"} but contract expects ${expectedCommandId}.`,
      ),
    ];
  });
}

function missingCommandFindings({ commands, commandPaletteResults }) {
  if (!commandPaletteResults) {
    return [];
  }
  const commandIds = new Set(commands.map((command) => command.id));
  return COMMAND_MORE_ACTION_CONTRACTS.filter(
    (contract) =>
      contract.commandId &&
      contract.commandId !== "command.palette" &&
      contract.classification !== "command-only-okay" &&
      !commandIds.has(contract.commandId),
  ).map((contract) =>
    finding("blocking", `${contract.label} command ${contract.commandId} was not observed.`),
  );
}

function finding(severity, message) {
  return { message, severity };
}

function normalizeReason(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))].sort();
}

function formatCount(value) {
  return value > 0 ? String(value) : "0";
}

function escapeCell(value) {
  return String(value ?? "").replaceAll("|", "\\|");
}
