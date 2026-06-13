import { generatedUiActionId, slugUiActionPart } from "./ui-action-stable-ids.mjs";
import { classifyDuplicateGroup } from "./ui-action-duplicate-waivers.mjs";
import {
  activate,
  behaviorKeyFor,
  classifyAction,
  classifyOutcome,
  disabledReasonForLocator,
  expectedTransitionFor,
  groupedActions,
  isAuditRelevantRequest,
  isDestructiveLabel,
  isLocatorDisabled,
  isPrimaryPlaybackControlOwner,
  keyboardPathFor,
  locateAction,
  metadataIssuesFor,
  normalize,
  ownerFor,
  pointerPathFor,
  interactiveSelector,
} from "./e2e-ui-action-matrix-helpers.mjs";

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
        const commandId =
          element.getAttribute("data-command-id") ??
          element.closest("[data-command-id]")?.getAttribute("data-command-id") ??
          null;
        const shortcutCommandId =
          element.getAttribute("data-shortcut-command-id") ??
          element.closest("[data-shortcut-command-id]")?.getAttribute("data-shortcut-command-id") ??
          null;
        const cinemaMoreSection = element.closest("[data-cinema-more-section]");
        const railModeToolbar =
          element.closest("[data-rail-mode-toolbar]")?.getAttribute("data-rail-mode-toolbar") ??
          null;
        const railModeOption = element.getAttribute("data-rail-mode-option");
        const segmentedControl =
          element.closest("[data-segmented-control]")?.getAttribute("data-segmented-control") ??
          null;
        const segmentedOption = element.getAttribute("data-segmented-option");
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
          commandId,
          shortcutCommandId,
          cinemaMoreActionId:
            element.getAttribute("data-cinema-more-action-id") ??
            element
              .closest("[data-cinema-more-action-id]")
              ?.getAttribute("data-cinema-more-action-id") ??
            null,
          cinemaMoreActionKind:
            element.getAttribute("data-cinema-more-action-kind") ??
            element
              .closest("[data-cinema-more-action-kind]")
              ?.getAttribute("data-cinema-more-action-kind") ??
            null,
          cinemaMoreDisabledReason:
            element.getAttribute("data-cinema-more-disabled-reason") ??
            element
              .closest("[data-cinema-more-disabled-reason]")
              ?.getAttribute("data-cinema-more-disabled-reason") ??
            null,
          cinemaMorePrimaryProxy:
            element.getAttribute("data-cinema-more-primary-proxy") ??
            element
              .closest("[data-cinema-more-primary-proxy]")
              ?.getAttribute("data-cinema-more-primary-proxy") ??
            null,
          cinemaMoreSectionId:
            element.getAttribute("data-cinema-more-section-id") ??
            cinemaMoreSection?.getAttribute("data-cinema-more-section") ??
            null,
          cinemaMoreSectionLabel:
            cinemaMoreSection?.getAttribute("data-cinema-more-section-label") ?? null,
          cinemaMoreShortcutHint:
            element.getAttribute("data-cinema-more-shortcut-hint") ??
            element
              .closest("[data-cinema-more-shortcut-hint]")
              ?.getAttribute("data-cinema-more-shortcut-hint") ??
            null,
          compactControlId:
            element.getAttribute("data-compact-control-id") ??
            element.closest("[data-compact-control-id]")?.getAttribute("data-compact-control-id") ??
            null,
          cssPath: cssPathFor(element),
          disabled: isDisabled(element),
          disabledReason: disabledReasonFor(element),
          explicitActionId:
            element.getAttribute("data-ui-action-id") ??
            element.getAttribute("data-action-id") ??
            null,
          actionSlug:
            element.getAttribute("data-ui-action-slug") ??
            element.getAttribute("data-action-slug") ??
            null,
          focusTarget:
            element.getAttribute("data-ui-focus-target") ??
            element.getAttribute("data-ui-action-focus-target") ??
            null,
          hasConfirmationAffordance: hasConfirmationAffordance(element),
          href: element instanceof HTMLAnchorElement ? element.href : null,
          index: controls.length,
          intentionallyNoOpReason:
            element.getAttribute("data-ui-noop-reason") ??
            element.getAttribute("data-noop-reason") ??
            null,
          explicitDestructive:
            element.getAttribute("data-ui-action-destructive") ??
            element
              .closest("[data-ui-action-destructive]")
              ?.getAttribute("data-ui-action-destructive") ??
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
          projectId:
            element.getAttribute("data-ui-project-id") ??
            element.closest("[data-ui-project-id]")?.getAttribute("data-ui-project-id") ??
            element.getAttribute("data-project-id") ??
            element.closest("[data-project-id]")?.getAttribute("data-project-id") ??
            null,
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
          railModeIdentity:
            railModeToolbar && railModeOption ? `${railModeToolbar}:${railModeOption}` : null,
          scenarioId,
          segmentedIdentity:
            segmentedControl && segmentedOption ? `${segmentedControl}:${segmentedOption}` : null,
          sourceId:
            element.getAttribute("data-ui-source-id") ??
            element.closest("[data-ui-source-id]")?.getAttribute("data-ui-source-id") ??
            element.getAttribute("data-source-id") ??
            element.closest("[data-source-id]")?.getAttribute("data-source-id") ??
            null,
          bookSourceId:
            element.getAttribute("data-book-source-id") ??
            element.closest("[data-book-source-id]")?.getAttribute("data-book-source-id") ??
            null,
          preparedSourceId:
            element.getAttribute("data-prepared-source-id") ??
            element.closest("[data-prepared-source-id]")?.getAttribute("data-prepared-source-id") ??
            null,
          stageId:
            element.getAttribute("data-ui-stage-id") ??
            element.closest("[data-ui-stage-id]")?.getAttribute("data-ui-stage-id") ??
            null,
          surface:
            element.getAttribute("data-ui-action-surface") ??
            element.closest("[data-ui-action-surface]")?.getAttribute("data-ui-action-surface") ??
            surface,
          surfaceId:
            element.getAttribute("data-ui-surface-id") ??
            element.closest("[data-ui-surface-id]")?.getAttribute("data-ui-surface-id") ??
            null,
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
  const stableFingerprints = rawActions.map((rawAction) => {
    const label =
      rawAction.accessibleName ||
      rawAction.label ||
      rawAction.visibleLabel ||
      rawAction.text ||
      rawAction.title ||
      "Unlabeled control";
    return stableActionFingerprint(rawAction, label);
  });
  const stableFingerprintCounts = stableFingerprints.reduce((counts, fingerprint) => {
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
    return counts;
  }, new Map());
  return rawActions.map((rawAction) => {
    const visibleLabel =
      rawAction.visibleLabel || rawAction.text || rawAction.title || rawAction.label || "";
    const accessibleName =
      rawAction.accessibleName || rawAction.label || visibleLabel || "Unlabeled control";
    const label = accessibleName || visibleLabel || "Unlabeled control";
    const inferredActionClass = rawAction.disabled
      ? "disabled"
      : classifyAction({ label, role: rawAction.role, tagName: rawAction.tagName });
    const explicitDestructive = rawAction.explicitDestructive;
    const destructive =
      explicitDestructive === "true"
        ? true
        : explicitDestructive === "false"
          ? false
          : inferredActionClass === "destructive" || isDestructiveLabel(label);
    const actionClass = rawAction.disabled
      ? "disabled"
      : destructive
        ? "destructive"
        : explicitDestructive === "false" && inferredActionClass === "destructive"
          ? "settings"
          : inferredActionClass;
    const fingerprint = [
      rawAction.surface,
      rawAction.role ?? rawAction.tagName,
      label.toLowerCase(),
      rawAction.testId ?? "",
      rawAction.type ?? "",
    ].join("|");
    const matchIndex = counters.get(fingerprint) ?? 0;
    counters.set(fingerprint, matchIndex + 1);
    const stableFingerprint = stableActionFingerprint(rawAction, label);
    const stableGenerated =
      stableFingerprintCounts.get(stableFingerprint) === 1 &&
      rawAction.surface &&
      label !== "Unlabeled control";
    const generatedAction = generatedUiActionId(rawAction, {
      label,
      matchIndex,
      stable: stableGenerated,
    });
    const explicitActionId = rawAction.explicitActionId ?? rawAction.testId ?? null;
    const actionId = explicitActionId ?? generatedAction.id;
    const stableIdKind = rawAction.testId
      ? "explicit-testid"
      : rawAction.explicitActionId
        ? "explicit-action-id"
        : stableGenerated
          ? "generated-stable"
          : "generated-unstable";
    const owner = rawAction.owner ?? ownerFor(rawAction.surface, actionClass);
    const metadataIssues = metadataIssuesFor({
      ...rawAction,
      actionClass,
      destructive,
      generatedTestId: generatedAction.id,
      hasStableActionId: stableIdKind !== "generated-unstable",
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
      actionId,
      accessibleName,
      destructive,
      enabledDisabledReason,
      expectedTransition: rawAction.focusTarget
        ? "focus moved predictably"
        : expectedTransitionFor({
            actionClass,
            label,
            role: rawAction.role,
            tagName: rawAction.tagName,
          }),
      generatedTestId: generatedAction.id,
      hasStableActionId: stableIdKind !== "generated-unstable",
      stableIdContext: generatedAction.context,
      stableIdKind,
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
    focusTarget: action.focusTarget,
    hasStableActionId: action.hasStableActionId,
    label: action.label,
    scenarioId: action.scenarioId,
    stableIdKind: action.stableIdKind,
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
    const disabledReason =
      action.disabledReason ?? (await disabledReasonForLocator(locator.first()));
    const passed = Boolean(disabledReason);
    return {
      ...resultBase,
      capabilityGate: action.capabilityGate,
      disabledReason,
      outcome: passed
        ? action.capabilityGated
          ? "capability-gated disabled with explicit reason"
          : "disabled with explicit reason"
        : "disabled without explicit reason",
      passed,
      reason: passed
        ? disabledReason
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
  ]
    .map((duplicate) => ({
      ...duplicate,
      classification: classifyDuplicateGroup(duplicate),
    }))
    .sort((left, right) =>
      `${left.kind}:${left.label}`.localeCompare(`${right.kind}:${right.label}`),
    );
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
      activeElementTargets:
        document.activeElement instanceof HTMLElement
          ? [
              document.activeElement.getAttribute("data-testid"),
              document.activeElement.getAttribute("id"),
              document.activeElement.getAttribute("aria-label"),
              normalizeText(document.activeElement.textContent ?? ""),
              document.activeElement.tagName.toLowerCase(),
            ].filter(Boolean)
          : [],
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

function stableActionFingerprint(rawAction, label) {
  return [
    rawAction.scenarioId,
    rawAction.surface,
    rawAction.owner ?? rawAction.playbackOwner ?? "",
    rawAction.explicitActionId ?? rawAction.testId ?? "",
    rawAction.commandId ?? "",
    rawAction.playbackAction ?? "",
    rawAction.railModeIdentity ?? "",
    rawAction.compactControlId ?? "",
    rawAction.segmentedIdentity ?? "",
    rawAction.sourceId ?? rawAction.bookSourceId ?? rawAction.preparedSourceId ?? "",
    rawAction.projectId ?? "",
    rawAction.stageId ?? "",
    rawAction.role ?? rawAction.tagName ?? "",
    rawAction.type ?? "",
    slugUiActionPart(rawAction.actionSlug ?? label),
  ].join("|");
}
