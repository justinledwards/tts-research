import type { UiActionClass, UiActionExpectedTransition, UiActionSurface } from "./actionScopes";

export interface UiActionMetadata {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly surface: UiActionSurface;
  readonly actionClass: UiActionClass;
  readonly expectedTransition: UiActionExpectedTransition;
  readonly destructive: boolean;
  readonly disabledReason?: string;
  readonly aliases?: readonly string[];
}

export interface UiActionMetadataInput {
  readonly label: string;
  readonly surface: UiActionSurface;
  readonly role?: string | null;
  readonly testId?: string | null;
  readonly disabled?: boolean;
  readonly disabledReason?: string | null;
}

const transportPattern = /\b(play|pause|resume|restart|seek|\+10s|-10s|speed)\b/i;
const modePattern =
  /\b(intake|review|preview|read|inspect|debug|narration|voice cloning|focus|balanced|full|teleprompt)\b/i;
const settingsPattern =
  /\b(settings|reader|policy|profile|scope|motion|contrast|typography|font|spacing|voice)\b/i;
const destructivePattern =
  /\b(delete|remove|reset|clear|cancel job|discard|overwrite|revoke|disconnect)\b/i;
const diagnosticPattern =
  /\b(help|diagnostic|debug|pipeline|validation|source|inspect|context guide|details)\b/i;
const navigationPattern =
  /\b(open|close|back|exit|workspace|actions|import|export|book|file \/ url|website|cinema|more|outline|recent|bookmarks|structure)\b/i;
const primaryPattern = /\b(create|listen|save|apply|submit|upload|analyze|refresh|generate)\b/i;

export const STATIC_UI_ACTION_METADATA = [
  action("workspace-open", "Open workspace", "Workspace", "navigation", "menu-or-panel-opened"),
  action(
    "command-palette-open",
    "Open command palette",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
  ),
  action("help-open", "Open help", "Workspace", "diagnostic", "menu-or-panel-opened"),
  action("settings-open", "Open settings", "Settings", "settings", "menu-or-panel-opened"),
  action("project-import", "Import", "Workspace", "navigation", "menu-or-panel-opened"),
  action("project-export", "Export", "Workspace", "navigation", "menu-or-panel-opened"),
  action("create-listen", "Create & Listen", "Workspace", "primary", "live-status-updated"),
  action("cancel-job", "Cancel Job", "Workspace", "destructive", "menu-or-panel-opened", true),
  action("workspace-intake", "Intake", "Intake", "mode", "state-changed"),
  action("workspace-review", "Review", "Review", "mode", "state-changed"),
  action("workspace-preview", "Preview", "Preview", "mode", "state-changed"),
  action("teleprompt-open", "Open Teleprompt", "Teleprompt", "navigation", "state-changed"),
  action("teleprompter-open", "Open Teleprompter", "Teleprompt", "navigation", "state-changed"),
  action("teleprompt-back-review", "Back to Review", "Teleprompt", "navigation", "state-changed"),
  action("teleprompt-back-preview", "Back to Preview", "Teleprompt", "navigation", "state-changed"),
  action(
    "book-cinema-open",
    "Open Book Cinema",
    "BookCinema",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "document-cinema-open",
    "Open Document Cinema",
    "DocumentCinema",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "website-cinema-open",
    "Open Website Cinema",
    "WebsiteCinema",
    "navigation",
    "menu-or-panel-opened",
  ),
  action("cinema-play", "Play", "BookCinema", "transport", "live-status-updated"),
  action("cinema-pause", "Pause", "BookCinema", "transport", "live-status-updated"),
  action("cinema-restart", "Restart", "BookCinema", "transport", "state-changed"),
  action("cinema-back-10", "-10s", "BookCinema", "transport", "state-changed"),
  action("cinema-forward-10", "+10s", "BookCinema", "transport", "state-changed"),
  action("cinema-bookmark", "Bookmark", "BookCinema", "primary", "live-status-updated"),
  action("cinema-read-mode", "Read", "BookCinema", "mode", "state-changed"),
  action("cinema-inspect-mode", "Inspect", "BookCinema", "mode", "state-changed"),
  action("cinema-review-mode", "Review", "BookCinema", "mode", "state-changed"),
  action("cinema-debug-mode", "Debug", "BookCinema", "mode", "state-changed"),
  action("cinema-pin", "Pin", "BookCinema", "settings", "state-changed"),
  action("cinema-unpin", "Pinned", "BookCinema", "settings", "state-changed"),
  action("cinema-exit", "Exit", "BookCinema", "navigation", "state-changed"),
  action("settings-close", "Close Settings", "Settings", "navigation", "state-changed"),
  action(
    "settings-reset-ui-memory",
    "Reset UI memory",
    "Settings",
    "destructive",
    "menu-or-panel-opened",
    true,
  ),
] as const satisfies readonly UiActionMetadata[];

export const STATIC_UI_ACTION_METADATA_BY_TEST_ID: Readonly<
  Partial<Record<string, UiActionMetadata>>
> = Object.fromEntries(STATIC_UI_ACTION_METADATA.map((metadata) => [metadata.testId, metadata]));

export function inferUiActionMetadata(input: UiActionMetadataInput): UiActionMetadata {
  const label = normalizeUiActionLabel(input.label) || "Unlabeled control";
  const staticMatch = findStaticUiActionMetadata(label, input.testId);
  if (staticMatch) {
    return {
      ...staticMatch,
      disabledReason: input.disabledReason ?? staticMatch.disabledReason,
      surface: input.surface,
    };
  }

  const actionClass = input.disabled
    ? "disabled"
    : inferUiActionClass(label, input.role ?? undefined);
  const destructive = actionClass === "destructive" || destructivePattern.test(label);
  const generatedId = slugUiActionLabel(`${input.surface}-${label}`);
  return {
    id: generatedId,
    testId: input.testId ?? `ui-action-${generatedId}`,
    label,
    surface: input.surface,
    actionClass,
    expectedTransition: inferExpectedTransition(label, actionClass, input.role ?? undefined),
    destructive,
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
  if (destructivePattern.test(label)) {
    return "destructive";
  }
  if (transportPattern.test(label)) {
    return "transport";
  }
  if (role === "tab" || modePattern.test(label)) {
    return "mode";
  }
  if (settingsPattern.test(label)) {
    return "settings";
  }
  if (diagnosticPattern.test(label)) {
    return "diagnostic";
  }
  if (navigationPattern.test(label)) {
    return "navigation";
  }
  if (primaryPattern.test(label)) {
    return "primary";
  }
  return "primary";
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
  if (actionClass === "transport" || /\b(create|listen|save|refresh)\b/i.test(label)) {
    return "live-status-updated";
  }
  return "state-changed";
}

export function normalizeUiActionLabel(value: string): string {
  return value.replaceAll(/\s+/g, " ").trim();
}

export function slugUiActionLabel(value: string): string {
  const slug = normalizeUiActionLabel(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return slug || "control";
}

function action(
  id: string,
  label: string,
  surface: UiActionSurface,
  actionClass: UiActionClass,
  expectedTransition: UiActionExpectedTransition,
  destructive = false,
): UiActionMetadata {
  return {
    id,
    testId: `ui-action-${id}`,
    label,
    surface,
    actionClass,
    expectedTransition,
    destructive,
  };
}
