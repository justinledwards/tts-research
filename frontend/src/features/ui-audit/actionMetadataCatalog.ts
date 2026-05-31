import { workspaceStageActionLabel } from "../workspace/stageActions";
import type { PlaybackOwner } from "../playback/playbackOwner";
import type { UiActionClass, UiActionExpectedTransition, UiActionSurface } from "./actionScopes";
import type { UiActionMetadata } from "./actionMetadata";
export const STATIC_UI_ACTION_METADATA = [
  action("workspace-open", "Open workspace", "Workspace", "navigation", "menu-or-panel-opened"),
  action("demo-open", "Try the Studio", "Workspace", "navigation", "menu-or-panel-opened"),
  action("demo-collapse", "Hide demo mode", "Workspace", "navigation", "state-changed", false, [
    "Hide",
  ]),
  action(
    "demo-tour-intake",
    "Demo tour: Intake",
    "Workspace",
    "navigation",
    "state-changed",
    false,
    ["Intake"],
  ),
  action(
    "demo-tour-review",
    "Demo tour: Review",
    "Workspace",
    "navigation",
    "state-changed",
    false,
    ["Review"],
  ),
  action(
    "demo-tour-preview",
    "Demo tour: Preview",
    "Workspace",
    "navigation",
    "state-changed",
    false,
    ["Preview"],
  ),
  action(
    "demo-tour-teleprompt",
    "Demo tour: Teleprompt",
    "Workspace",
    "navigation",
    "state-changed",
    false,
    ["Teleprompt"],
  ),
  action(
    "demo-tour-createAudio",
    "Demo tour: Create audio",
    "Workspace",
    "generation",
    "live-status-updated",
    false,
    ["Create audio", "Create & Listen"],
  ),
  action(
    "demo-tour-openCinema",
    "Demo tour: Cinema",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
    false,
    ["Cinema"],
  ),
  action(
    "command-palette-open",
    "Open command palette",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
  ),
  action("help-open", "Open help", "Workspace", "diagnostic", "menu-or-panel-opened"),
  action("settings-open", "Open settings", "Settings", "settings", "menu-or-panel-opened"),
  action(
    "project-dashboard-open-rail",
    "Manage Sources",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
    false,
    ["Project Dashboard", "Manage projects"],
  ),
  action(
    "project-dashboard-open-drawer",
    "Project Dashboard",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
  ),
  action("project-dashboard-close", "Close", "Workspace", "navigation", "state-changed"),
  action("project-dashboard-new", "New Project", "Workspace", "generation", "menu-or-panel-opened"),
  action(
    "voice-dashboard-open-rail",
    "Manage Voices",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
    false,
    ["Voice Dashboard"],
  ),
  action(
    "voice-dashboard-open-drawer",
    "Voice Dashboard",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "voice-dashboard-open-cloning-rail",
    "Dashboard",
    "Workspace",
    "navigation",
    "menu-or-panel-opened",
    false,
    ["Voice Dashboard"],
  ),
  action("voice-dashboard-close", "Close", "Workspace", "navigation", "state-changed"),
  action(
    "voice-dashboard-open-cloning",
    "Open Voice Studio",
    "Workspace",
    "navigation",
    "route-changed",
  ),
  action("project-import", "Import", "Workspace", "navigation", "menu-or-panel-opened"),
  action("project-export", "Export", "Workspace", "navigation", "menu-or-panel-opened"),
  action(
    "create-listen",
    workspaceStageActionLabel("createAndListen"),
    "Workspace",
    "generation",
    "live-status-updated",
  ),
  action("cancel-job", "Cancel Job", "Workspace", "destructive", "menu-or-panel-opened", true),
  action(
    "workspace-intake",
    workspaceStageActionLabel("intakeSource"),
    "Intake",
    "mode",
    "state-changed",
  ),
  action(
    "workspace-review",
    workspaceStageActionLabel("reviewBlocks"),
    "Review",
    "mode",
    "state-changed",
  ),
  action(
    "workspace-preview",
    workspaceStageActionLabel("previewSpeech"),
    "Preview",
    "preview",
    "state-changed",
  ),
  action(
    "preview-mini-previous",
    "Previous preview block",
    "Preview",
    "transport",
    "state-changed",
  ),
  action("preview-mini-play", "Audition", "Preview", "preview", "live-status-updated", false, [
    "Play preview",
    "Audition",
  ]),
  action("preview-mini-restart", "Restart preview", "Preview", "transport", "state-changed"),
  action("preview-mini-next", "Next preview block", "Preview", "transport", "state-changed"),
  action("preview-mini-speed", "Preview playback speed", "Preview", "transport", "state-changed"),
  action("preview-mini-skip-silence", "Skip silence", "Preview", "settings", "state-changed"),
  action("preview-mini-segment", "Selected segment", "Preview", "preview", "state-changed"),
  action("preview-mini-source", "Whole source", "Preview", "preview", "live-status-updated"),
  action(
    "preview-mini-open-cinema",
    "Open Cinema",
    "Preview",
    "navigation",
    "menu-or-panel-opened",
    false,
    ["Cinema"],
  ),
  action("preview-mini-audition-a", "Audition A", "Preview", "preview", "live-status-updated"),
  action("preview-audition-voice", "Audition voice", "Preview", "preview", "live-status-updated"),
  action("preview-mini-voice-b", "Voice B", "Preview", "settings", "state-changed"),
  action("preview-mini-policy-b", "Policy B", "Preview", "settings", "state-changed"),
  action("preview-mini-run-b", "Run B", "Preview", "settings", "state-changed"),
  action("preview-mini-apply-b", "Use B", "Preview", "settings", "state-changed"),
  action("revision-filter-reset", "Show all", "Review", "settings", "state-changed"),
  action("revision-clear-selection", "Clear selection", "Review", "settings", "state-changed"),
  action("revision-batch-approve", "Approve selected", "Review", "generation", "state-changed"),
  action("revision-batch-retry", "Retry selected", "Review", "generation", "live-status-updated"),
  action(
    "revision-batch-regenerate",
    "Regenerate selected",
    "Review",
    "generation",
    "live-status-updated",
  ),
  action("revision-batch-needs-review", "Mark needs review", "Review", "settings", "state-changed"),
  action("revision-batch-export", "Export selected", "Review", "navigation", "state-changed"),
  action(
    "revision-inline-preview",
    "Preview changed sentence",
    "Review",
    "preview",
    "state-changed",
  ),
  action("revision-inline-save", "Save edit", "Review", "generation", "state-changed"),
  action("revision-inline-revert", "Revert", "Review", "settings", "state-changed"),
  action(
    "teleprompt-open",
    workspaceStageActionLabel("openTeleprompt"),
    "Teleprompt",
    "navigation",
    "state-changed",
  ),
  action("teleprompt-back-review", "Back to Review", "Teleprompt", "navigation", "state-changed"),
  action("teleprompt-back-preview", "Back to Preview", "Teleprompt", "navigation", "state-changed"),
  action(
    "teleprompt-enter-theatre",
    "Enter Theatre",
    "Teleprompt",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "teleprompt-cue-drawer",
    "Inspector and cue list",
    "Teleprompt",
    "settings",
    "menu-or-panel-opened",
  ),
  action("teleprompt-exit-theatre", "Exit theatre", "Teleprompt", "navigation", "state-changed"),
  action(
    "teleprompt-native-fullscreen",
    "Native fullscreen",
    "Teleprompt",
    "navigation",
    "state-changed",
    false,
    ["Fullscreen active"],
  ),
  action(
    "teleprompt-theatre-back-review",
    "Back to Review",
    "Teleprompt",
    "navigation",
    "state-changed",
  ),
  action(
    "teleprompt-theatre-back-preview",
    "Back to Preview",
    "Teleprompt",
    "navigation",
    "state-changed",
  ),
  action("teleprompt-previous-cue", "Previous cue", "Teleprompt", "navigation", "state-changed"),
  action("teleprompt-next-cue", "Next cue", "Teleprompt", "navigation", "state-changed"),
  action(
    "teleprompt-theatre-previous-cue",
    "Previous",
    "Teleprompt",
    "navigation",
    "state-changed",
  ),
  action("teleprompt-theatre-next-cue", "Next", "Teleprompt", "navigation", "state-changed"),
  action(
    "teleprompt-play-pause",
    "Play Cue",
    "Teleprompt",
    "transport",
    "live-status-updated",
    false,
    ["Play", "Pause Cue"],
  ),
  action(
    "teleprompt-theatre-play-pause",
    "Play Cue",
    "Teleprompt",
    "transport",
    "live-status-updated",
    false,
    ["Play", "Pause Cue"],
  ),
  action("teleprompt-restart", "Restart", "Teleprompt", "transport", "state-changed"),
  action("teleprompt-theatre-restart", "Restart", "Teleprompt", "transport", "state-changed"),
  action(
    "teleprompt-theatre-open-cinema",
    "Open Cinema",
    "Teleprompt",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "teleprompt-theatre-create-listen",
    "Create & Listen",
    "Teleprompt",
    "generation",
    "live-status-updated",
    false,
    ["Create & Listen: generate current scope"],
  ),
  action("teleprompt-mirror", "Mirror mode", "Teleprompt", "settings", "state-changed"),
  action("teleprompt-theatre-mirror", "Mirror mode", "Teleprompt", "settings", "state-changed"),
  action(
    "teleprompt-operator-preview",
    "Operator Preview",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action("teleprompt-preset-standard", "Standard", "Teleprompt", "settings", "state-changed"),
  action("teleprompt-preset-largeText", "Large text", "Teleprompt", "settings", "state-changed"),
  action(
    "teleprompt-preset-highContrast",
    "High contrast",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action(
    "teleprompt-theatre-preset-standard",
    "Standard",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action(
    "teleprompt-theatre-preset-largeText",
    "Large text",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action(
    "teleprompt-theatre-preset-highContrast",
    "High contrast",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action(
    "teleprompt-theatre-preset-dyslexicFriendly",
    "Dyslexic friendly",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
  action(
    "teleprompt-preset-dyslexicFriendly",
    "Dyslexic friendly",
    "Teleprompt",
    "settings",
    "state-changed",
  ),
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
  action("cinema-bookmark", "Bookmark", "BookCinema", "generation", "live-status-updated"),
  action("cinema-read-mode", "Read", "BookCinema", "mode", "state-changed"),
  action("cinema-inspect-mode", "Inspect", "BookCinema", "mode", "state-changed"),
  action("cinema-review-mode", "Review", "BookCinema", "mode", "state-changed"),
  action("cinema-debug-mode", "Debug", "BookCinema", "mode", "state-changed", false, [
    "Diagnostics",
  ]),
  action(
    "cinema-more-menu",
    "Cinema More menu",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
    false,
    ["Open Cinema More menu", "Cinema More menu. Active operator mode: Diagnostics", "Diagnostics"],
  ),
  action(
    "cinema-more-reader-settings",
    "Reader settings",
    "BookCinema",
    "settings",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-more-theatre-mode",
    "Cinema Theatre",
    "BookCinema",
    "navigation",
    "state-changed",
    false,
    ["Theatre/Cinematic mode", "Open Cinema Theatre"],
  ),
  action(
    "cinema-more-command-palette",
    "Command palette",
    "BookCinema",
    "navigation",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-more-keyboard-shortcuts",
    "Keyboard shortcuts",
    "BookCinema",
    "settings",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-more-help-guide",
    "Help/guide",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-advanced-diagnostics",
    "Diagnostics",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-advanced-timing-map",
    "Timing map",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-advanced-policy-internals",
    "Policy internals",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
  ),
  action(
    "cinema-advanced-source-internals",
    "Source internals",
    "BookCinema",
    "diagnostic",
    "menu-or-panel-opened",
  ),
  action(
    "readalong-copy-sync-debug-snapshot",
    "Copy sync debug snapshot",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-mark-highlight-wrong",
    "Mark drift here",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-export-sync-debug-snapshot",
    "Export sync debug snapshot",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-repair-adjust-offset",
    "Adjust offset",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-repair-split-segment",
    "Split segment",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-repair-merge-segment",
    "Merge segment",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-repair-phrase-fallback",
    "Phrase fallback",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action(
    "readalong-repair-regenerate-segment",
    "Regenerate segment",
    "BookCinema",
    "diagnostic",
    "state-changed",
  ),
  action("cinema-pin", "Pin", "BookCinema", "settings", "state-changed"),
  action("cinema-unpin", "Pinned", "BookCinema", "settings", "state-changed"),
  action("cinema-exit", "Exit", "BookCinema", "navigation", "state-changed"),
  action("settings-close", "Close Settings", "Settings", "navigation", "state-changed"),
  action(
    "reader-accessibility-preset",
    "Accessibility preset",
    "Settings",
    "settings",
    "state-changed",
  ),
  action("reader-reduced-motion", "Reduced motion", "Settings", "settings", "state-changed"),
  action("reader-high-contrast", "High contrast", "Settings", "settings", "state-changed"),
  action("reader-text-scale", "Text scale", "Settings", "settings", "state-changed"),
  action("reader-line-spacing", "Line spacing", "Settings", "settings", "state-changed"),
  action("reader-measure", "Measure", "Settings", "settings", "state-changed"),
  action("ui-memory-remember-layout", "Remember layout", "Settings", "settings", "state-changed"),
  action("ui-memory-remember-theme", "Remember theme", "Settings", "settings", "state-changed"),
  action(
    "ui-memory-remember-last-project",
    "Remember last project",
    "Settings",
    "settings",
    "state-changed",
  ),
  action(
    "ui-memory-remember-reader-preferences",
    "Remember reader preferences",
    "Settings",
    "settings",
    "state-changed",
  ),
  action(
    "ui-memory-remember-teleprompt-return-target",
    "Remember Teleprompt return target",
    "Settings",
    "settings",
    "state-changed",
  ),
  action(
    "ui-memory-remember-panel-pins",
    "Remember panel pins",
    "Settings",
    "settings",
    "state-changed",
  ),
  action(
    "ui-memory-export-json",
    "Export preferences JSON",
    "Settings",
    "navigation",
    "state-changed",
  ),
  action(
    "ui-memory-import-json",
    "Import preferences JSON",
    "Settings",
    "settings",
    "state-changed",
  ),
  action(
    "ui-memory-reset-workspace",
    "Reset workspace layout",
    "Settings",
    "destructive",
    "menu-or-panel-opened",
    true,
  ),
  action(
    "ui-memory-reset-reader",
    "Reset reader preferences",
    "Settings",
    "destructive",
    "menu-or-panel-opened",
    true,
  ),
  action(
    "ui-memory-reset-all",
    "Reset all UI memory",
    "Settings",
    "destructive",
    "menu-or-panel-opened",
    true,
  ),
] as const satisfies readonly UiActionMetadata[];

export const STATIC_UI_ACTION_METADATA_BY_TEST_ID: Readonly<
  Partial<Record<string, UiActionMetadata>>
> = Object.fromEntries(STATIC_UI_ACTION_METADATA.map((metadata) => [metadata.testId, metadata]));

function action(
  id: string,
  label: string,
  surface: UiActionSurface,
  actionClass: UiActionClass,
  expectedTransition: UiActionExpectedTransition,
  destructive = false,
  aliases?: readonly string[],
): UiActionMetadata {
  return {
    id,
    testId: `ui-action-${id}`,
    label,
    visibleLabel: label,
    accessibleName: label,
    surface,
    actionClass,
    expectedTransition,
    destructive,
    owner: playbackOwnerForAction(id, surface, actionClass, label),
    aliases,
  };
}

function playbackOwnerForAction(
  id: string,
  surface: UiActionSurface,
  actionClass: UiActionClass,
  label: string,
): PlaybackOwner | undefined {
  if (id === "create-listen" || id.includes("createAndListen")) {
    return "workspace";
  }
  if (isDashboardPlaybackOwnerAction(id, surface)) {
    return "dashboard";
  }
  if (isCinemaPlaybackOwnerAction(id, surface)) {
    return "cinema";
  }
  if (isTelepromptPlaybackOwnerAction(surface, actionClass, label)) {
    return "teleprompt";
  }
  if (isPreviewPlaybackOwnerAction(id, surface, label)) {
    return "preview";
  }
  return undefined;
}

function isDashboardPlaybackOwnerAction(id: string, surface: UiActionSurface): boolean {
  return (
    surface === "Project Dashboard" || surface === "Voice Dashboard" || id.includes("dashboard")
  );
}

function isCinemaPlaybackOwnerAction(id: string, surface: UiActionSurface): boolean {
  return (
    surface === "BookCinema" ||
    surface === "DocumentCinema" ||
    surface === "WebsiteCinema" ||
    id.includes("cinema")
  );
}

function isTelepromptPlaybackOwnerAction(
  surface: UiActionSurface,
  actionClass: UiActionClass,
  label: string,
): boolean {
  return surface === "Teleprompt" && (actionClass === "transport" || /\bcue\b/i.test(label));
}

function isPreviewPlaybackOwnerAction(
  id: string,
  surface: UiActionSurface,
  label: string,
): boolean {
  return (
    surface === "Preview" ||
    surface === "Preview mini-player" ||
    id.startsWith("preview-mini") ||
    (surface === "Review" && /\bpreview\b/i.test(label))
  );
}
