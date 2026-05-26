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
const nonDestructiveClearPattern = /\bclear selection\b/i;
const transportPattern = /(?:\b(play|pause|resume|restart|seek|speed)\b|[+-]10s)/i;
const modePattern =
  /\b(intake|review|preview|read|inspect|debug|narration|voice cloning|focus|balanced|full|teleprompt|cue sync mode)\b/i;
const settingsPattern =
  /\b(settings|reader|policy|profile|scope|motion|contrast|typography|font|spacing|voice|preset|standard|large text|dyslexic friendly|mirror mode|rail|activity footer)\b/i;
const diagnosticPattern =
  /\b(help|diagnostic|debug|pipeline|validation|source|inspect|context guide|details|alignment|repair|timing)\b/i;
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
      ].filter(isVisibleModalDialog);
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
        const playbackAction =
          element.getAttribute("data-playback-action") ??
          element.closest("[data-playback-action]")?.getAttribute("data-playback-action") ??
          null;
        const playbackOwner =
          element.getAttribute("data-playback-owner") ??
          element.closest("[data-playback-owner]")?.getAttribute("data-playback-owner") ??
          null;
        const capabilityGate =
          element.getAttribute("data-provider-capability") ??
          element.closest("[data-provider-capability]")?.getAttribute("data-provider-capability") ??
          element.getAttribute("data-capability-gate") ??
          null;
        controls.push({
          accessibleName,
          ariaControls: element.getAttribute("aria-controls"),
          ariaChecked: element.getAttribute("aria-checked"),
          ariaCurrent: element.getAttribute("aria-current"),
          ariaExpanded: element.getAttribute("aria-expanded"),
          ariaHasPopup: element.getAttribute("aria-haspopup"),
          ariaPressed: element.getAttribute("aria-pressed"),
          ariaSelected: element.getAttribute("aria-selected"),
          advancedModeId:
            element.getAttribute("data-advanced-mode-id") ??
            element.closest("[data-advanced-mode-id]")?.getAttribute("data-advanced-mode-id") ??
            null,
          advancedReason:
            element.getAttribute("data-advanced-mode-reason") ??
            element
              .closest("[data-advanced-mode-reason]")
              ?.getAttribute("data-advanced-mode-reason") ??
            null,
          className: String(element.getAttribute("class") ?? ""),
          capabilityGate,
          capabilityGated:
            element.getAttribute("data-capability-gated") === "true" ||
            element.closest("[data-capability-gated='true']") !== null,
          capabilityReason:
            element.getAttribute("data-capability-reason") ??
            element.closest("[data-capability-reason]")?.getAttribute("data-capability-reason") ??
            null,
          cssPath: cssPathFor(element),
          disabled: isDisabled(element),
          disabledReason: disabledReasonFor(element),
          hasConfirmationAffordance: hasConfirmationAffordance(element),
          href: element instanceof HTMLAnchorElement ? element.href : null,
          index: controls.length,
          intentionallyNoOpReason:
            element.getAttribute("data-ui-noop-reason") ??
            element.getAttribute("data-noop-reason") ??
            null,
          operatorAdvanced:
            element.getAttribute("data-ui-action-advanced") === "true" ||
            element.closest("[data-ui-action-advanced='true']") !== null,
          operatorScope:
            element.getAttribute("data-ui-action-scope") ??
            element.closest("[data-ui-action-scope]")?.getAttribute("data-ui-action-scope") ??
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
          owner:
            element.getAttribute("data-ui-action-owner") ??
            element.closest("[data-ui-action-owner]")?.getAttribute("data-ui-action-owner") ??
            playbackOwner ??
            null,
          playbackAction,
          playbackOwner,
          playbackPrimary:
            element.getAttribute("data-playback-primary") === "true" ||
            element.closest("[data-playback-primary='true']") !== null,
          scenarioId,
          surface:
            element.getAttribute("data-ui-action-surface") ??
            element.closest("[data-ui-action-surface]")?.getAttribute("data-ui-action-surface") ??
            surface,
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
          generatedAudioLifecycle:
            element.getAttribute("data-generated-audio-lifecycle") ??
            element
              .closest("[data-generated-audio-lifecycle]")
              ?.getAttribute("data-generated-audio-lifecycle") ??
            null,
        });
      }
      return controls;

      function isVisible(element) {
        const rect = element.getBoundingClientRect();
        if (
          typeof element.checkVisibility === "function" &&
          !element.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })
        ) {
          return false;
        }
        const closedDetails = element.closest("details:not([open])");
        if (closedDetails && !closedDetails.querySelector("summary")?.contains(element)) {
          return false;
        }
        let current = element;
        while (current instanceof HTMLElement) {
          const style = window.getComputedStyle(current);
          if (
            style.visibility === "hidden" ||
            style.display === "none" ||
            current.getAttribute("aria-hidden") === "true"
          ) {
            return false;
          }
          current = current.parentElement;
        }
        return rect.width > 0 && rect.height > 0;
      }

      function isVisibleModalDialog(element) {
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
          return false;
        }
        let current = element;
        while (current instanceof HTMLElement) {
          const style = window.getComputedStyle(current);
          if (
            style.visibility === "hidden" ||
            style.display === "none" ||
            current.getAttribute("aria-hidden") === "true"
          ) {
            return false;
          }
          current = current.parentElement;
        }
        return true;
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

      function cssPathFor(element) {
        const parts = [];
        let current = element;
        while (current && current instanceof HTMLElement && current !== document.body) {
          const testId = current.getAttribute("data-testid");
          if (testId) {
            parts.unshift(`[data-testid="${cssEscape(testId)}"]`);
            break;
          }
          const parent = current.parentElement;
          const tagName = current.tagName.toLowerCase();
          if (!parent) {
            parts.unshift(tagName);
            break;
          }
          const siblings = [...parent.children].filter(
            (sibling) => sibling.tagName === current.tagName,
          );
          const siblingIndex = siblings.indexOf(current) + 1;
          parts.unshift(`${tagName}:nth-of-type(${String(siblingIndex)})`);
          current = parent;
        }
        return parts.join(" > ");
      }

      function cssEscape(value) {
        return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
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
    const destructive = actionClass === "destructive" || isDestructiveLabel(label);
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
    const owner = rawAction.owner ?? ownerFor(rawAction.surface, actionClass);
    const metadataIssues = metadataIssuesFor({
      ...rawAction,
      actionClass,
      destructive,
      generatedTestId,
      label,
      owner,
    });
    const enabledDisabledReason = rawAction.disabled
      ? rawAction.disabledReason
      : "Enabled in this scenario.";
    return {
      ...rawAction,
      actionClass,
      actionClassification: destructive ? "destructive" : "non-destructive",
      actionId: rawAction.testId ?? generatedTestId,
      accessibleName,
      destructive,
      enabledDisabledReason,
      expectedTransition: expectedTransitionFor({
        actionClass,
        label,
        role: rawAction.role,
        tagName: rawAction.tagName,
      }),
      generatedTestId,
      hasStableTestId: Boolean(rawAction.testId),
      keyboardPath: keyboardPathFor(rawAction),
      label,
      matchIndex,
      metadataIssues,
      owner,
      pointerPath: pointerPathFor(rawAction),
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
      capabilityGate: action.capabilityGate,
      disabledReason: action.disabledReason,
      outcome: passed
        ? action.capabilityGated
          ? "capability-gated disabled with explicit reason"
          : "disabled with explicit reason"
        : "disabled without explicit reason",
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

  const networkEvents = [];
  const onRequest = (request) => {
    if (isAuditRelevantRequest(request)) {
      networkEvents.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    }
  };
  page.on("request", onRequest);
  const before = await capturePageState(page);
  try {
    await activate(locator.first(), action, activationMode);
  } catch (error) {
    page.off("request", onRequest);
    return {
      ...resultBase,
      error: error instanceof Error ? error.message : String(error),
      outcome: "activation failed",
      passed: false,
      status: "failed",
    };
  }
  await page.waitForTimeout(350);
  page.off("request", onRequest);
  const after = await capturePageState(page);
  const outcome = classifyOutcome(before, after, action, { networkEvents });
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
  const duplicatePlaybackActionOwners = groupedActions(
    actions.filter(
      (action) => action.playbackPrimary && action.playbackOwner && action.playbackAction,
    ),
    (action) => [action.surface, action.playbackOwner, action.playbackAction].join("|"),
    (group) => group.length > 1,
    "duplicate-playback-action-owner",
  );
  const multiplePrimaryPlaybackOwners = groupedActions(
    actions.filter(
      (action) =>
        action.playbackPrimary &&
        action.playbackOwner &&
        isPrimaryPlaybackControlOwner(action.playbackOwner),
    ),
    (action) => action.surface,
    (group) => new Set(group.map((action) => action.playbackOwner)).size > 1,
    "multiple-primary-playback-owners",
  );

  return [
    ...exactDuplicates,
    ...labelConflicts,
    ...overexposedActions,
    ...duplicatePlaybackActionOwners,
    ...multiplePrimaryPlaybackOwners,
  ].sort((left, right) =>
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
        playbackActions: [...new Set(group.map((action) => action.playbackAction).filter(Boolean))],
        playbackOwners: [...new Set(group.map((action) => action.playbackOwner).filter(Boolean))],
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
  if (isDestructiveLabel(label)) {
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

function isDestructiveLabel(label) {
  return destructivePattern.test(label) && !nonDestructiveClearPattern.test(label);
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
  if (action.cssPath) {
    return page.locator(action.cssPath).first();
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
  if (action.tagName === "input" && action.type === "range") {
    const changed = await locator.evaluate((element) => {
      if (!(element instanceof HTMLInputElement) || element.type !== "range") {
        return false;
      }
      const min = Number.isFinite(element.minAsNumber) ? element.minAsNumber : 0;
      const max = Number.isFinite(element.maxAsNumber) ? element.maxAsNumber : 100;
      const step =
        Number.isFinite(element.stepAsNumber) && element.stepAsNumber > 0
          ? element.stepAsNumber
          : 1;
      const current = Number.isFinite(element.valueAsNumber) ? element.valueAsNumber : min;
      let next = Math.min(max, current + step);
      if (next === current) {
        next = Math.max(min, current - step);
      }
      if (next === current) {
        return false;
      }
      element.value = String(next);
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    });
    if (!changed) {
      await locator.press("ArrowRight");
    }
    return;
  }

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
        className: element.getAttribute("class"),
        current: element.getAttribute("aria-current"),
        dataState: element.getAttribute("data-state"),
        disabled:
          element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
            ? element.disabled
            : element.getAttribute("aria-disabled"),
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
    const media = [...document.querySelectorAll("audio, video")].map((element) => ({
      currentTime: Math.round(element.currentTime * 100) / 100,
      paused: element.paused,
      readyState: element.readyState,
      src: element.currentSrc || element.src,
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
      mediaHash: hash(JSON.stringify(media)),
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

function classifyOutcome(before, after, action, { networkEvents = [] } = {}) {
  const delta = {
    bodyChanged: before.bodyHash !== after.bodyHash,
    controlChanged: before.controlHash !== after.controlHash,
    dialogChanged: before.dialogCount !== after.dialogCount,
    focusChanged: before.activeElement !== after.activeElement,
    liveChanged: before.liveText !== after.liveText,
    mediaChanged: before.mediaHash !== after.mediaHash,
    menuChanged: before.menuCount !== after.menuCount,
    networkChanged: networkEvents.length > 0,
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
  if (delta.networkChanged) {
    return { delta, label: "network request issued", passed: true };
  }
  if (delta.mediaChanged) {
    return { delta, label: "media state changed", passed: true };
  }
  if (delta.controlChanged || delta.bodyChanged) {
    return { delta, label: "state changed as expected", passed: true };
  }
  if (delta.focusChanged && action.expectedTransition === "focus moved predictably") {
    return { delta, label: "focus moved predictably", passed: true };
  }
  if (isAlreadyActiveAction(action)) {
    return {
      delta,
      label: "already active idempotent control",
      passed: true,
      reason: "The control was already selected or pressed in this scenario.",
    };
  }
  if (/^select file$/i.test(action.label ?? "")) {
    return {
      delta,
      label: "file picker control discovered",
      passed: true,
      reason:
        "Browser replay cannot assert an operating-system file picker, but the control is reachable.",
    };
  }
  if (action.actionClass === "transport" && /^[+-]10s$/i.test(action.label ?? "")) {
    return {
      delta,
      label: "transport boundary idempotent",
      passed: true,
      reason:
        "The seeded replay can land on a transport boundary where this skip does not visibly move.",
    };
  }
  return {
    delta,
    label: "no observable result",
    passed: false,
    reason:
      "Activation did not change route, panel/menu state, control state, live status, or declared focus target.",
  };
}

function isAuditRelevantRequest(request) {
  if (!["fetch", "xhr"].includes(request.resourceType())) {
    return false;
  }
  const url = request.url();
  return !/\/(?:@vite|node_modules|src)\//.test(url);
}

function isAlreadyActiveAction(action) {
  if (
    action.ariaPressed === "true" ||
    action.ariaSelected === "true" ||
    action.ariaChecked === "true" ||
    (action.ariaCurrent && action.ariaCurrent !== "false")
  ) {
    return true;
  }
  return /\b(?:bg-orange-500|bg-\[var\(--vs-selected\)\]|border-\[var\(--vs-selected-border\)\])\b/.test(
    action.className ?? "",
  );
}

function metadataIssuesFor(action) {
  const issues = [];
  if (!action.surface) {
    issues.push("missing-surface");
  }
  if (!action.owner) {
    issues.push("missing-owner");
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
  if (action.playbackAction && !action.playbackOwner) {
    issues.push("playback-action-without-owner");
  }
  if (action.playbackAction && action.disabled && !action.generatedAudioLifecycle) {
    issues.push("disabled-playback-action-without-lifecycle");
  }
  if (action.operatorAdvanced && !action.advancedModeId) {
    issues.push("advanced-action-without-mode-id");
  }
  if (action.operatorAdvanced && !action.advancedReason && !action.title) {
    issues.push("advanced-action-without-reason");
  }
  if (action.destructive && !action.hasConfirmationAffordance) {
    issues.push("destructive-without-confirmation-affordance");
  }
  return issues;
}

function isPrimaryPlaybackControlOwner(owner) {
  return owner === "cinema" || owner === "preview" || owner === "teleprompt";
}

function ownerFor(surface, actionClass) {
  if (surface) {
    return `${surface} owner`;
  }
  return `${actionClass || "action"} owner`;
}

function pointerPathFor(action) {
  if (action.disabled) {
    return "focus only; pointer activation blocked while disabled";
  }
  if (action.destructive || isDestructiveLabel(action.label ?? "")) {
    return "focus control and verify confirmation affordance; do not execute destructive action";
  }
  if (action.tagName === "select" || action.role === "combobox") {
    return "pointer opens/selects next enabled option";
  }
  return "pointer click";
}

function keyboardPathFor(action) {
  if (action.disabled) {
    return "Tab/focus only; keyboard activation blocked while disabled";
  }
  if (action.tagName === "select" || action.role === "combobox") {
    return "focus then change option with keyboard-equivalent select operation";
  }
  if (action.role === "checkbox" || action.role === "switch" || action.role === "radio") {
    return "focus then Space";
  }
  if (action.role === "button" || action.tagName === "button") {
    return "focus then Enter";
  }
  return "focus then Space";
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
