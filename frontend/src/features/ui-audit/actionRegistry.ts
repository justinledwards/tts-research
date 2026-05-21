import { inferUiActionMetadata, normalizeUiActionLabel } from "./actionMetadata";
import type { UiActionMetadata, UiActionMetadataInput } from "./actionMetadata";
import type { UiActionSurface } from "./actionScopes";

export interface UiActionRegistryEntry extends UiActionMetadata {
  readonly disabled: boolean;
  readonly source: "static" | "inferred" | "runtime";
  readonly issues: readonly string[];
}

export interface UiActionRegistrySummary {
  readonly total: number;
  readonly missingTestIds: number;
  readonly missingLabels: number;
  readonly missingAccessibleNames: number;
  readonly disabledWithoutReason: number;
  readonly destructiveWithoutConfirmation: number;
}

export class UiActionRegistry {
  readonly #entries = new Map<string, UiActionRegistryEntry>();

  register(input: UiActionMetadataInput, source: UiActionRegistryEntry["source"] = "runtime") {
    const metadata = inferUiActionMetadata(input);
    const entry = buildRegistryEntry(metadata, input.disabled === true, source);
    this.#entries.set(entry.testId, entry);
    return entry;
  }

  entries() {
    return [...this.#entries.values()];
  }

  toJSON() {
    return this.entries();
  }

  summary(): UiActionRegistrySummary {
    const entries = this.entries();
    return {
      total: entries.length,
      missingTestIds: entries.filter((entry) => entry.issues.includes("missing-stable-data-testid"))
        .length,
      missingLabels: entries.filter((entry) => entry.issues.includes("missing-human-label")).length,
      missingAccessibleNames: entries.filter((entry) =>
        entry.issues.includes("missing-accessible-name"),
      ).length,
      disabledWithoutReason: entries.filter((entry) =>
        entry.issues.includes("disabled-without-explicit-reason"),
      ).length,
      destructiveWithoutConfirmation: entries.filter((entry) =>
        entry.issues.includes("destructive-without-confirmation-affordance"),
      ).length,
    };
  }
}

export function createUiActionRegistry() {
  return new UiActionRegistry();
}

export function describeUiActionElement(
  element: Element,
  fallbackSurface: UiActionSurface,
): UiActionMetadataInput {
  const visibleLabel = visibleLabelForElement(element);
  const accessibleName = accessibleNameForElement(element);
  const label = accessibleName || visibleLabel || "Unlabeled control";
  const testId = element instanceof HTMLElement ? (element.dataset.testid ?? null) : null;
  const disabled =
    element instanceof HTMLButtonElement ||
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
      ? element.disabled
      : element.getAttribute("aria-disabled") === "true";
  return {
    label,
    visibleLabel,
    accessibleName,
    surface: fallbackSurface,
    role: element.getAttribute("role") ?? implicitRoleForElement(element),
    testId,
    disabled,
    disabledReason: disabled ? disabledReasonForElement(element) : null,
  };
}

export function buildRegistryEntry(
  metadata: UiActionMetadata,
  disabled: boolean,
  source: UiActionRegistryEntry["source"],
): UiActionRegistryEntry {
  const issues = validateUiActionMetadata(metadata, disabled);
  return {
    ...metadata,
    disabled,
    source,
    issues,
  };
}

export function validateUiActionMetadata(metadata: UiActionMetadata, disabled: boolean) {
  const issues: string[] = [];
  if (!metadata.testId || metadata.testId.startsWith("ui-action-Workspace-unlabeled")) {
    issues.push("missing-stable-data-testid");
  }
  const humanLabel =
    normalizeUiActionLabel(metadata.visibleLabel) ||
    normalizeUiActionLabel(metadata.accessibleName) ||
    normalizeUiActionLabel(metadata.label);
  if (!humanLabel || metadata.label === "Unlabeled control") {
    issues.push("missing-human-label");
  }
  if (
    !normalizeUiActionLabel(metadata.accessibleName) ||
    metadata.accessibleName === "Unlabeled control"
  ) {
    issues.push("missing-accessible-name");
  }
  if (disabled && !metadata.disabledReason) {
    issues.push("disabled-without-explicit-reason");
  }
  if (metadata.destructive && metadata.expectedTransition !== "menu-or-panel-opened") {
    issues.push("destructive-without-confirmation-affordance");
  }
  return issues;
}

function accessibleNameForElement(element: Element): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return normalizeUiActionLabel(ariaLabel);
  }
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.querySelector(`#${CSS.escape(id)}`)?.textContent ?? "")
      .join(" ");
    if (normalizeUiActionLabel(text)) {
      return normalizeUiActionLabel(text);
    }
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labels = associatedLabelText(element);
    if (normalizeUiActionLabel(labels)) {
      return normalizeUiActionLabel(labels);
    }
    const placeholder =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.placeholder
        : "";
    if (placeholder) {
      return normalizeUiActionLabel(placeholder);
    }
  }
  return normalizeUiActionLabel(
    firstText(element.textContent, element.getAttribute("title"), element.getAttribute("name")),
  );
}

function visibleLabelForElement(element: Element): string {
  const text = normalizeUiActionLabel(element.textContent);
  if (text) {
    return text;
  }
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  ) {
    const labels = associatedLabelText(element);
    if (normalizeUiActionLabel(labels)) {
      return normalizeUiActionLabel(labels);
    }
    if ("placeholder" in element && element.placeholder) {
      return normalizeUiActionLabel(element.placeholder);
    }
  }
  return normalizeUiActionLabel(
    firstText(
      element instanceof HTMLElement ? (element.dataset.uiLabel ?? null) : null,
      element.getAttribute("title"),
      element.getAttribute("aria-label"),
      element.getAttribute("name"),
    ),
  );
}

function disabledReasonForElement(element: Element): string | null {
  const dataset = element instanceof HTMLElement ? element.dataset : null;
  const explicit =
    dataset?.disabledReason ?? dataset?.uiDisabledReason ?? element.getAttribute("title");
  if (explicit) {
    return normalizeUiActionLabel(explicit);
  }
  const describedBy = element.getAttribute("aria-describedby");
  if (!describedBy) {
    return null;
  }
  const text = describedBy
    .split(/\s+/)
    .map((id) => element.ownerDocument.querySelector(`#${CSS.escape(id)}`)?.textContent ?? "")
    .join(" ");
  return normalizeUiActionLabel(text) || null;
}

function firstText(...values: readonly (string | null)[]) {
  return values.find((value) => typeof value === "string" && value.length > 0) ?? "";
}

function associatedLabelText(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (!element.labels) {
    return "";
  }
  return Array.from(element.labels, (label: HTMLLabelElement) => label.textContent).join(" ");
}

function implicitRoleForElement(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "button") {
    return "button";
  }
  if (tagName === "select") {
    return "combobox";
  }
  if (tagName === "a" && element.hasAttribute("href")) {
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
