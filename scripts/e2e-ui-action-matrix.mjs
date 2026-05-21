const interactiveSelector = [
  "button",
  "select",
  "a[href]",
  "input[type='checkbox']",
  "input[type='radio']",
  "input[type='range']",
  "input[type='file']",
  "[role='button']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='switch']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='option']",
  "[role='combobox']",
].join(",");

const destructivePattern =
  /\b(delete|remove|reset|clear|cancel job|discard|overwrite|revoke|disconnect)\b/i;
const transportPattern = /(?:\b(play|pause|resume|restart|seek|speed)\b|[+-]10s)/i;
const modePattern =
  /\b(intake|review|preview|read|inspect|debug|narration|voice cloning|focus|balanced|full|teleprompt)\b/i;
const settingsPattern =
  /\b(settings|reader|policy|profile|scope|motion|contrast|typography|font|spacing|voice)\b/i;
const diagnosticPattern =
  /\b(help|diagnostic|debug|pipeline|validation|source|inspect|context guide|details)\b/i;
const navigationPattern =
  /\b(open|close|back|exit|workspace|actions|import|export|book|file \/ url|website|cinema|more|outline|recent|bookmarks|structure)\b/i;
const previewPattern = /\b(preview speech|spoken form|preview spoken|speech preview)\b/i;
const generationPattern =
  /\b(create|listen|save|apply|submit|upload|analyze|refresh|generate|retry|bookmark)\b/i;

export function actionAuditSelector() {
  return interactiveSelector;
}

export async function buildActionInventory(page, scenario) {
  const rawActions = await page.evaluate(
    ({ selector, scenarioId, surface }) => {
      const controls = [];
      const seen = new Set();
      const visibleModalDialogs = [
        ...document.querySelectorAll("[role='dialog'][aria-modal='true']"),
      ].filter(isVisible);
      const activeModalDialog = visibleModalDialogs[visibleModalDialogs.length - 1] ?? null;
      for (const element of document.querySelectorAll(selector)) {
        if (
          seen.has(element) ||
          !isVisible(element) ||
          (activeModalDialog && !activeModalDialog.contains(element))
        ) {
          continue;
        }
        seen.add(element);
        const rect = element.getBoundingClientRect();
        const visibleLabel = visibleLabelFor(element);
        const accessibleName = accessibleNameFor(element);
        const label = accessibleName || visibleLabel || "Unlabeled control";
        controls.push({
          accessibleName,
          ariaControls: element.getAttribute("aria-controls"),
          ariaExpanded: element.getAttribute("aria-expanded"),
          ariaHasPopup: element.getAttribute("aria-haspopup"),
          ariaPressed: element.getAttribute("aria-pressed"),
          className: String(element.getAttribute("class") ?? ""),
          disabled: isDisabled(element),
          disabledReason: disabledReasonFor(element),
          hasConfirmationAffordance: hasConfirmationAffordance(element),
          href: element instanceof HTMLAnchorElement ? element.href : null,
          index: controls.length,
          intentionallyNoOpReason:
            element.getAttribute("data-ui-noop-reason") ??
            element.getAttribute("data-noop-reason") ??
            null,
          label,
          name: element.getAttribute("name"),
          placeholder:
            element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
              ? element.placeholder
              : null,
          rect: {
            height: Math.round(rect.height),
            width: Math.round(rect.width),
            x: Math.round(rect.x),
            y: Math.round(rect.y),
          },
          role: element.getAttribute("role") ?? implicitRole(element),
          scenarioId,
          surface: element.getAttribute("data-ui-action-surface") ?? surface,
          tagName: element.tagName.toLowerCase(),
          testId: element.getAttribute("data-testid"),
          text: normalizeText(element.textContent ?? ""),
          title: element.getAttribute("title"),
          type: element instanceof HTMLInputElement ? element.type : null,
          value:
            element instanceof HTMLInputElement ||
            element instanceof HTMLSelectElement ||
            element instanceof HTMLTextAreaElement
              ? element.value
              : null,
          visibleLabel,
        });
      }
      return controls;

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          element.getAttribute("aria-hidden") !== "true"
        );
      }

      function isDisabled(element) {
        if (
          element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement ||
          element instanceof HTMLOptionElement
        ) {
          return element.disabled;
        }
        return element.getAttribute("aria-disabled") === "true";
      }

      function accessibleNameFor(element) {
        const ariaLabel = element.getAttribute("aria-label");
        if (ariaLabel) {
          return normalizeText(ariaLabel);
        }
        const labelledBy = element.getAttribute("aria-labelledby");
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ");
          if (normalizeText(text)) {
            return normalizeText(text);
          }
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          const labels = [...(element.labels ?? [])]
            .map((label) => label.textContent ?? "")
            .join(" ");
          if (normalizeText(labels)) {
            return normalizeText(labels);
          }
          if (element.placeholder) {
            return normalizeText(element.placeholder);
          }
        }
        return normalizeText(
          element.textContent ??
            element.getAttribute("title") ??
            element.getAttribute("name") ??
            "",
        );
      }

      function visibleLabelFor(element) {
        const text = normalizeText(element.textContent ?? "");
        if (text) {
          return text;
        }
        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          const labels = [...(element.labels ?? [])]
            .map((label) => label.textContent ?? "")
            .join(" ");
          if (normalizeText(labels)) {
            return normalizeText(labels);
          }
          if ("placeholder" in element && element.placeholder) {
            return normalizeText(element.placeholder);
          }
        }
        return normalizeText(
          element.getAttribute("data-ui-label") ??
            element.getAttribute("title") ??
            element.getAttribute("aria-label") ??
            element.getAttribute("name") ??
            "",
        );
      }

      function disabledReasonFor(element) {
        const explicit =
          element.getAttribute("data-disabled-reason") ??
          element.getAttribute("data-ui-disabled-reason") ??
          element.getAttribute("title");
        if (explicit) {
          return normalizeText(explicit);
        }
        const describedBy = element.getAttribute("aria-describedby");
        if (!describedBy) {
          return null;
        }
        const text = describedBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ");
        return normalizeText(text) || null;
      }

      function hasConfirmationAffordance(element) {
        if (
          element.getAttribute("data-confirm") ||
          element.getAttribute("aria-haspopup") === "dialog"
        ) {
          return true;
        }
        const nearestDialog = element.closest("[role='dialog']");
        return /confirm|are you sure|delete project|cannot be undone/i.test(
          normalizeText(nearestDialog?.textContent ?? ""),
        );
      }

      function implicitRole(element) {
        const tagName = element.tagName.toLowerCase();
        if (tagName === "button") {
          return "button";
        }
        if (tagName === "select") {
          return "combobox";
        }
        if (tagName === "a") {
          return "link";
        }
        if (element instanceof HTMLInputElement) {
          if (element.type === "checkbox") {
            return "checkbox";
          }
          if (element.type === "radio") {
            return "radio";
          }
          if (element.type === "range") {
            return "slider";
          }
        }
        return null;
      }

      function normalizeText(value) {
        return String(value).replaceAll(/\s+/g, " ").trim();
      }
    },
    { scenarioId: scenario.id, selector: interactiveSelector, surface: scenario.surface },
  );

  const counters = new Map();
  return rawActions.map((rawAction) => {
    const visibleLabel =
      rawAction.visibleLabel || rawAction.text || rawAction.title || rawAction.label || "";
    const accessibleName =
      rawAction.accessibleName || rawAction.label || visibleLabel || "Unlabeled control";
    const label = accessibleName || visibleLabel || "Unlabeled control";
    const actionClass = rawAction.disabled
      ? "disabled"
      : classifyAction({ label, role: rawAction.role, tagName: rawAction.tagName });
    const destructive = actionClass === "destructive" || destructivePattern.test(label);
    const fingerprint = [
      rawAction.surface,
      rawAction.role ?? rawAction.tagName,
      label.toLowerCase(),
      rawAction.testId ?? "",
      rawAction.type ?? "",
    ].join("|");
    const matchIndex = counters.get(fingerprint) ?? 0;
    counters.set(fingerprint, matchIndex + 1);
    const generatedTestId = `ui-action-${slug(`${rawAction.surface}-${label}-${matchIndex + 1}`)}`;
    const metadataIssues = metadataIssuesFor({
      ...rawAction,
      actionClass,
      destructive,
      generatedTestId,
      label,
    });
    return {
      ...rawAction,
      actionClass,
      actionId: rawAction.testId ?? generatedTestId,
      accessibleName,
      destructive,
      expectedTransition: expectedTransitionFor({
        actionClass,
        label,
        role: rawAction.role,
        tagName: rawAction.tagName,
      }),
      generatedTestId,
      hasStableTestId: Boolean(rawAction.testId),
      label,
      matchIndex,
      metadataIssues,
      visibleLabel,
    };
  });
}

export async function exerciseAction(page, action, { activationMode }) {
  const resultBase = {
    accessibleName: action.accessibleName,
    actionClass: action.actionClass,
    actionId: action.actionId,
    activationMode,
    destructive: action.destructive,
    expectedTransition: action.expectedTransition,
    label: action.label,
    scenarioId: action.scenarioId,
    surface: action.surface,
    visibleLabel: action.visibleLabel,
  };
  const locator = locateAction(page, action);
  const count = await locator.count().catch(() => 0);
  if (count === 0) {
    return {
      ...resultBase,
      outcome: "control missing during replay",
      passed: false,
      reason:
        "The control was visible during inventory but could not be found in the replayed scenario.",
      status: "failed",
    };
  }

  await locator
    .first()
    .scrollIntoViewIfNeeded()
    .catch(() => {});
  await locator
    .first()
    .focus()
    .catch(() => {});

  const disabled = action.disabled || (await isLocatorDisabled(locator.first()));
  if (disabled) {
    const passed = Boolean(action.disabledReason);
    return {
      ...resultBase,
      disabledReason: action.disabledReason,
      outcome: passed ? "disabled with explicit reason" : "disabled without explicit reason",
      passed,
      reason: passed
        ? action.disabledReason
        : "Disabled controls must expose data-disabled-reason, data-ui-disabled-reason, title, or aria-describedby text.",
      status: passed ? "passed" : "failed",
    };
  }

  if (action.destructive) {
    const passed = action.hasConfirmationAffordance;
    return {
      ...resultBase,
      confirmationAffordance: action.hasConfirmationAffordance,
      outcome: passed
        ? "destructive control discovered with confirmation affordance"
        : "destructive control missing confirmation affordance",
      passed,
      reason: passed
        ? "Focused but not executed during the audit."
        : "Destructive controls need an obvious dialog, confirmation state, or data-confirm marker.",
      status: passed ? "skipped" : "failed",
    };
  }

  if (action.intentionallyNoOpReason) {
    return {
      ...resultBase,
      outcome: "intentionally no-op with explicit reason",
      passed: true,
      reason: action.intentionallyNoOpReason,
      status: "passed",
    };
  }

  const before = await capturePageState(page);
  try {
    await activate(locator.first(), action, activationMode);
  } catch (error) {
    return {
      ...resultBase,
      error: error instanceof Error ? error.message : String(error),
      outcome: "activation failed",
      passed: false,
      status: "failed",
    };
  }
  await page.waitForTimeout(350);
  const after = await capturePageState(page);
  const outcome = classifyOutcome(before, after, action);
  return {
    ...resultBase,
    outcome: outcome.label,
    passed: outcome.passed,
    reason: outcome.reason,
    status: outcome.passed ? "passed" : "failed",
    stateDelta: outcome.delta,
  };
}

export function summarizeDuplicates(actions) {
  const exactDuplicates = groupedActions(
    actions,
    (action) =>
      [
        action.surface,
        action.actionClass,
        normalize(action.label).toLowerCase(),
        action.destructive ? "destructive" : "safe",
      ].join("|"),
    (group) => group.length > 1,
    "same-label-same-surface",
  );
  const labelConflicts = groupedActions(
    actions.filter((action) => action.label && action.label !== "Unlabeled control"),
    (action) => normalize(action.label).toLowerCase(),
    (group) => new Set(group.map(behaviorKeyFor)).size > 1,
    "same-label-different-behavior",
  );
  const overexposedActions = groupedActions(
    actions.filter((action) => action.label && action.label !== "Unlabeled control"),
    (action) =>
      [
        action.actionClass,
        normalize(action.label).toLowerCase(),
        action.expectedTransition,
        action.destructive ? "destructive" : "safe",
      ].join("|"),
    (group) => group.length > 3 || new Set(group.map((action) => action.surface)).size > 2,
    "identical-action-overexposed",
  );

  return [...exactDuplicates, ...labelConflicts, ...overexposedActions].sort((left, right) =>
    `${left.kind}:${left.label}`.localeCompare(`${right.kind}:${right.label}`),
  );
}

function groupedActions(actions, keyFor, shouldReport, kind) {
  return [
    ...actions
      .reduce((groups, action) => {
        const key = keyFor(action);
        const group = groups.get(key) ?? [];
        group.push(action);
        groups.set(key, group);
        return groups;
      }, new Map())
      .values(),
  ]
    .filter(shouldReport)
    .map((group) => {
      const surfaces = [...new Set(group.map((action) => action.surface))];
      return {
        actionClass: group[0].actionClass,
        actionIds: group.map((action) => action.actionId),
        behaviorKeys: [...new Set(group.map(behaviorKeyFor))],
        count: group.length,
        kind,
        label: group[0].label,
        scenarios: [...new Set(group.map((action) => action.scenarioId))],
        surface: surfaces.join(", "),
        surfaces,
      };
    });
}

function behaviorKeyFor(action) {
  return [
    action.surface,
    action.actionClass,
    action.expectedTransition,
    action.destructive ? "destructive" : "safe",
  ].join("|");
}

function classifyAction({ label, role }) {
  if (destructivePattern.test(label)) {
    return "destructive";
  }
  if (transportPattern.test(label)) {
    return "transport";
  }
  if (role === "tab" || /^preview$/i.test(label)) {
    return "mode";
  }
  if (navigationPattern.test(label)) {
    return "navigation";
  }
  if (previewPattern.test(label)) {
    return "preview";
  }
  if (generationPattern.test(label)) {
    return "generation";
  }
  if (settingsPattern.test(label)) {
    return "settings";
  }
  if (diagnosticPattern.test(label)) {
    return "diagnostic";
  }
  if (modePattern.test(label)) {
    return "mode";
  }
  return "generation";
}

function expectedTransitionFor({ actionClass, label, role, tagName }) {
  if (role === "combobox" || tagName === "select" || role === "switch" || role === "checkbox") {
    return "state changed as expected";
  }
  if (actionClass === "disabled") {
    return "disabled with explicit reason";
  }
  if (actionClass === "navigation" || actionClass === "diagnostic") {
    return /\b(open|actions|help|settings|more|outline|recent|bookmarks|structure)\b/i.test(label)
      ? "menu/panel opened"
      : "state changed as expected";
  }
  if (
    actionClass === "transport" ||
    actionClass === "generation" ||
    /\b(create|listen|save|refresh)\b/i.test(label)
  ) {
    return "live status updated";
  }
  return "state changed as expected";
}

function locateAction(page, action) {
  if (action.testId) {
    return page.getByTestId(action.testId).first();
  }
  if (action.role && action.label && action.label !== "Unlabeled control") {
    return page.getByRole(action.role, { exact: true, name: action.label }).nth(action.matchIndex);
  }
  const selector = selectorForAction(action);
  if (action.label && action.label !== "Unlabeled control") {
    return page.locator(selector).filter({ hasText: action.label }).nth(action.matchIndex);
  }
  return page.locator(selector).nth(action.matchIndex);
}

function selectorForAction(action) {
  if (action.tagName === "select") {
    return "select";
  }
  if (action.tagName === "a") {
    return "a[href]";
  }
  if (action.tagName === "input" && action.type) {
    return `input[type='${cssString(action.type)}']`;
  }
  if (action.role) {
    return `[role='${cssString(action.role)}']`;
  }
  return action.tagName || "button";
}

async function isLocatorDisabled(locator) {
  return locator.evaluate((element) => {
    if (
      element instanceof HTMLButtonElement ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    ) {
      return element.disabled;
    }
    return element.getAttribute("aria-disabled") === "true";
  });
}

async function activate(locator, action, activationMode) {
  if (action.tagName === "select" || action.role === "combobox") {
    const changed = await locator.evaluate((element) => {
      if (!(element instanceof HTMLSelectElement)) {
        return false;
      }
      const options = [...element.options].filter((option) => !option.disabled);
      if (options.length <= 1) {
        return false;
      }
      const currentIndex = Math.max(
        0,
        options.findIndex((option) => option.value === element.value),
      );
      const nextOption = options[(currentIndex + 1) % options.length];
      element.value = nextOption.value;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (!changed) {
      await locator.click();
    }
    return;
  }

  if (action.role === "checkbox" || action.role === "switch" || action.role === "radio") {
    await locator.press("Space").catch(async () => locator.click());
    return;
  }

  if (activationMode === "keyboard") {
    await locator.press(
      action.role === "button" || action.tagName === "button" ? "Enter" : "Space",
    );
    return;
  }
  await locator.click();
}

async function capturePageState(page) {
  return page.evaluate(() => {
    const normalizeText = (value) => String(value).replaceAll(/\s+/g, " ").trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none";
    };
    const controls = [...document.querySelectorAll("button, select, a[href], input, [role]")]
      .filter((element) => element instanceof HTMLElement && visible(element))
      .map((element) => ({
        checked: element instanceof HTMLInputElement ? element.checked : null,
        expanded: element.getAttribute("aria-expanded"),
        label:
          element.getAttribute("aria-label") ??
          normalizeText(element.textContent ?? "") ??
          element.getAttribute("title"),
        pressed: element.getAttribute("aria-pressed"),
        selected: element.getAttribute("aria-selected"),
        value:
          element instanceof HTMLInputElement || element instanceof HTMLSelectElement
            ? element.value
            : null,
      }));
    const liveText = [...document.querySelectorAll("[role='status'], [aria-live]")]
      .map((element) => normalizeText(element.textContent ?? ""))
      .filter(Boolean)
      .join(" | ");
    const bodyText = normalizeText(document.body.textContent ?? "").slice(0, 80_000);
    return {
      activeElement:
        document.activeElement instanceof HTMLElement
          ? (document.activeElement.getAttribute("aria-label") ??
            normalizeText(document.activeElement.textContent ?? "") ??
            document.activeElement.tagName)
          : null,
      bodyHash: hash(bodyText),
      controlHash: hash(JSON.stringify(controls)),
      dialogCount: document.querySelectorAll("[role='dialog']").length,
      liveText,
      menuCount: document.querySelectorAll("[role='menu'], [role='listbox']").length,
      url: window.location.href,
    };

    function hash(value) {
      let output = 0;
      for (let index = 0; index < value.length; index += 1) {
        output = (Math.imul(31, output) + value.charCodeAt(index)) | 0;
      }
      return output;
    }
  });
}

function classifyOutcome(before, after, action) {
  const delta = {
    bodyChanged: before.bodyHash !== after.bodyHash,
    controlChanged: before.controlHash !== after.controlHash,
    dialogChanged: before.dialogCount !== after.dialogCount,
    focusChanged: before.activeElement !== after.activeElement,
    liveChanged: before.liveText !== after.liveText,
    menuChanged: before.menuCount !== after.menuCount,
    routeChanged: before.url !== after.url,
  };
  if (delta.routeChanged) {
    return { delta, label: "route changed", passed: true };
  }
  if (delta.dialogChanged || delta.menuChanged) {
    return { delta, label: "menu/panel opened", passed: true };
  }
  if (delta.liveChanged) {
    return { delta, label: "live status updated", passed: true };
  }
  if (delta.controlChanged || delta.bodyChanged) {
    return { delta, label: "state changed as expected", passed: true };
  }
  if (delta.focusChanged && action.expectedTransition === "focus moved predictably") {
    return { delta, label: "focus moved predictably", passed: true };
  }
  return {
    delta,
    label: "no observable result",
    passed: false,
    reason:
      "Activation did not change route, panel/menu state, control state, live status, or declared focus target.",
  };
}

function metadataIssuesFor(action) {
  const issues = [];
  if (!action.testId) {
    issues.push("missing-stable-data-testid");
  }
  if (
    (!action.label && !action.visibleLabel && !action.accessibleName) ||
    action.label === "Unlabeled control"
  ) {
    issues.push("missing-human-label");
  }
  if (!action.accessibleName || action.accessibleName === "Unlabeled control") {
    issues.push("missing-accessible-name");
  }
  if (action.disabled && !action.disabledReason) {
    issues.push("disabled-without-explicit-reason");
  }
  if (action.destructive && !action.hasConfirmationAffordance) {
    issues.push("destructive-without-confirmation-affordance");
  }
  return issues;
}

function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

function normalize(value) {
  return String(value).replaceAll(/\s+/g, " ").trim();
}

function slug(value) {
  return normalize(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}
