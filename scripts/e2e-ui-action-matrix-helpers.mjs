export const interactiveSelector = [
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

export function groupedActions(actions, keyFor, shouldReport, kind) {
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

export function behaviorKeyFor(action) {
  return [
    action.surface,
    action.actionClass,
    action.expectedTransition,
    action.destructive ? "destructive" : "safe",
  ].join("|");
}

export function classifyAction({ label, role }) {
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

export function isDestructiveLabel(label) {
  return destructivePattern.test(label) && !nonDestructiveClearPattern.test(label);
}

export function expectedTransitionFor({ actionClass, label, role, tagName }) {
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

export function locateAction(page, action) {
  if (action.testId) {
    return page.getByTestId(action.testId).filter({ visible: true }).first();
  }
  if (action.explicitActionId) {
    return page
      .locator(`[data-ui-action-id='${cssString(action.explicitActionId)}']`)
      .filter({ visible: true })
      .first();
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

export async function isLocatorDisabled(locator) {
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

export async function disabledReasonForLocator(locator) {
  return locator.evaluate((element) => {
    const normalizeText = (value) => String(value).replaceAll(/\s+/g, " ").trim();
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
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ");
    return normalizeText(text) || null;
  });
}

export async function activate(locator, action, activationMode) {
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

  if (action.tagName === "checkbox" || action.role === "switch" || action.role === "radio") {
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

export function classifyOutcome(before, after, action, { networkEvents = [] } = {}) {
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
    focusTargetMatched: Boolean(
      action.focusTarget && after.activeElementTargets.includes(action.focusTarget),
    ),
  };
  if (delta.routeChanged) {
    return { delta, label: "route changed", passed: true };
  }
  if (action.expectedTransition === "focus moved predictably") {
    if (delta.focusChanged && (!action.focusTarget || delta.focusTargetMatched)) {
      return { delta, label: "focus moved predictably", passed: true };
    }
    return {
      delta,
      label: action.focusTarget ? "focus moved to unexpected target" : "focus did not move",
      passed: false,
      reason: action.focusTarget
        ? `Expected focus target ${action.focusTarget}.`
        : "Expected focus to move to a declared target.",
    };
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

export function isAuditRelevantRequest(request) {
  if (!["fetch", "xhr"].includes(request.resourceType())) {
    return false;
  }
  const url = request.url();
  return !/\/(?:@vite|node_modules|src)\//.test(url);
}

export function isAlreadyActiveAction(action) {
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

export function metadataIssuesFor(action) {
  const issues = [];
  if (!action.surface) {
    issues.push("missing-surface");
  }
  if (!action.owner) {
    issues.push("missing-owner");
  }
  if (!action.hasStableActionId) {
    issues.push("missing-stable-action-id");
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

export function isPrimaryPlaybackControlOwner(owner) {
  return owner === "cinema" || owner === "preview" || owner === "teleprompt";
}

export function ownerFor(surface, actionClass) {
  if (surface) {
    return `${surface} owner`;
  }
  return `${actionClass || "action"} owner`;
}

export function pointerPathFor(action) {
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

export function keyboardPathFor(action) {
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

export function cssString(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function normalize(value) {
  return String(value).replaceAll(/\s+/g, " ").trim();
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
