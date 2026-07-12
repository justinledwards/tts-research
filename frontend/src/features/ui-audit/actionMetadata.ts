import { buildUiActionId, slugUiActionPart, uiActionSurfaceId } from "./actionIds";
import type { UiActionClass, UiActionExpectedTransition, UiActionSurface } from "./actionScopes";
import {
  STATIC_UI_ACTION_METADATA,
  STATIC_UI_ACTION_METADATA_BY_TEST_ID,
} from "./actionMetadataCatalog";

export interface UiActionMetadata {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly visibleLabel: string;
  readonly accessibleName: string;
  readonly surface: UiActionSurface;
  readonly actionClass: UiActionClass;
  readonly expectedTransition: UiActionExpectedTransition;
  readonly destructive: boolean;
  readonly disabledReason?: string;
  readonly capabilityGate?: string;
  readonly owner?: string;
  readonly aliases?: readonly string[];
}

export interface UiActionMetadataInput {
  readonly label: string;
  readonly visibleLabel?: string | null;
  readonly accessibleName?: string | null;
  readonly surface: UiActionSurface;
  readonly role?: string | null;
  readonly testId?: string | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
  readonly capabilityGate?: string | null;
}

const transportPattern = /(?:\b(play|pause|resume|restart|seek|speed)\b|[+-]10s)/i;
const modePattern =
  /\b(intake|review|preview|read|inspect|debug|narration|voice cloning|focus|balanced|full|teleprompt|cue sync mode)\b/i;
const settingsPattern =
  /\b(settings|reader|policy|profile|scope|motion|contrast|typography|font|spacing|voice|preset|standard|large text|dyslexic friendly|mirror mode|rail|activity footer)\b/i;
const destructivePattern =
  /\b(delete|remove|reset|clear|cancel job|discard|overwrite|revoke|disconnect)\b/i;
const nonDestructiveClearPattern = /\bclear selection\b/i;
const diagnosticPattern =
  /\b(help|diagnostic|debug|pipeline|validation|source|inspect|context guide|details|alignment|repair|timing)\b/i;
const navigationPattern =
  /\b(open|close|back|exit|workspace|actions|import|export|book|file \/ url|website|cinema|more|outline|recent|bookmarks|structure)\b/i;
const previewPattern = /\b(preview speech|spoken form|preview spoken|speech preview)\b/i;
const generationPattern =
  /\b(create|listen|save|apply|submit|upload|analyze|refresh|generate|retry|bookmark)\b/i;
export function inferUiActionMetadata(input: UiActionMetadataInput): UiActionMetadata {
  const visibleLabel =
    normalizeUiActionLabel(input.visibleLabel ?? input.label) || "Unlabeled control";
  const accessibleName =
    normalizeUiActionLabel(input.accessibleName ?? input.label) || visibleLabel;
  const label = accessibleName || visibleLabel || "Unlabeled control";
  const staticMatch = findStaticUiActionMetadata(label, input.testId);
  if (staticMatch) {
    return {
      ...staticMatch,
      accessibleName: accessibleName || staticMatch.accessibleName,
      capabilityGate: input.capabilityGate ?? staticMatch.capabilityGate,
      disabledReason: input.disabledReason ?? staticMatch.disabledReason,
      visibleLabel: visibleLabel || staticMatch.visibleLabel,
      surface: input.surface,
    };
  }

  const actionClass = input.disabled
    ? "disabled"
    : inferUiActionClass(label, input.role ?? undefined);
  const destructive = actionClass === "destructive" || isDestructiveLabel(label);
  const generatedId = buildUiActionId({
    actionSlug: slugUiActionPart(label),
    surfaceId: uiActionSurfaceId(input.surface),
  }).replace(/^ui-action-/, "");
  return {
    id: generatedId,
    testId: input.testId ?? `ui-action-${generatedId}`,
    label,
    visibleLabel,
    accessibleName,
    surface: input.surface,
    actionClass,
    expectedTransition: inferExpectedTransition(label, actionClass, input.role ?? undefined),
    destructive,
    capabilityGate: input.capabilityGate ?? undefined,
    disabledReason: input.disabledReason ?? undefined,
  };
}

export function findStaticUiActionMetadata(
  label: string,
  testId?: string | null,
): UiActionMetadata | null {
  if (testId && STATIC_UI_ACTION_METADATA_BY_TEST_ID[testId]) {
    return STATIC_UI_ACTION_METADATA_BY_TEST_ID[testId];
  }
  const normalized = normalizeUiActionLabel(label);
  return (
    STATIC_UI_ACTION_METADATA.find((metadata) => {
      if (normalizeUiActionLabel(metadata.label) === normalized) {
        return true;
      }
      return (
        metadata.aliases?.some((alias) => normalizeUiActionLabel(alias) === normalized) ?? false
      );
    }) ?? null
  );
}

export function inferUiActionClass(label: string, role?: string): UiActionClass {
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

export function inferExpectedTransition(
  label: string,
  actionClass: UiActionClass,
  role?: string,
): UiActionExpectedTransition {
  if (role === "combobox" || role === "switch" || role === "checkbox" || role === "tab") {
    return "state-changed";
  }
  if (actionClass === "disabled") {
    return "disabled-with-reason";
  }
  if (actionClass === "navigation" || actionClass === "diagnostic") {
    return /\b(open|actions|help|settings|more|outline|recent|bookmarks|structure)\b/i.test(label)
      ? "menu-or-panel-opened"
      : "state-changed";
  }
  if (
    actionClass === "transport" ||
    actionClass === "generation" ||
    /\b(create|listen|save|refresh)\b/i.test(label)
  ) {
    return "live-status-updated";
  }
  return "state-changed";
}

export function normalizeUiActionLabel(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function slugUiActionLabel(value: string): string {
  return slugUiActionPart(value);
}

function isDestructiveLabel(label: string): boolean {
  return destructivePattern.test(label) && !nonDestructiveClearPattern.test(label);
}
