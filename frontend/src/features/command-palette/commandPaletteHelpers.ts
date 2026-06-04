import {
  createAndListenScopeLabel,
  type CreateAndListenScope,
} from "../playback/workspacePlaybackActions";
import type { CommandEntry, CommandMetadata } from "./commandRegistry";
import type {
  CinemaAdvancedCommandTarget,
  CinemaFocusCommandTarget,
  HelpCommandTarget,
  SettingsCommandTarget,
  WorkspaceCommandTarget,
} from "../navigation/commands";
import type { CinemaFocusMode, CinemaSurfaceKind } from "../cinema";
import type { BookScope, BookSource, PlaybackProgress, PreparedSource } from "../../types";
import type { WorkspaceStageActionId } from "../workspace/stageActions";
import type { WorkspaceLayoutMode, WorkspaceStage } from "../workspace/model";
import { COMMAND_CENTER_ROUTES, type CommandCenterRouteId } from "../command-center/model";

type SourceMode = "book" | "fileUrl" | "text";

export interface CommandMetadataState {
  cinemaAdvanced: CommandMetadata<CinemaAdvancedCommandTarget>[];
  cinemaFocus: CommandMetadata<CinemaFocusCommandTarget>[];
  help: CommandMetadata<HelpCommandTarget>[];
  settings: CommandMetadata<SettingsCommandTarget>[];
  workspace: CommandMetadata<WorkspaceCommandTarget>[];
}

export interface CommandBookmarkData {
  detail: string;
  id: string;
  keywords: string[];
  label: string;
  resumeProgress: PlaybackProgress;
}

export interface CommandRecentData {
  detail: string;
  id: string;
  keywords: string[];
  label: string;
  progressItem: PlaybackProgress;
}

export interface CommandWayfindingState {
  bookmarks: CommandBookmarkData[];
  recentPositions: CommandRecentData[];
}

export interface CommandPaletteHandlers {
  openContextualHelp: (target: HelpCommandTarget | null) => void;
  openCommandCenterRoute: (routeId: CommandCenterRouteId) => void;
  openCurrentCinema: () => void;
  openDraftSource: () => void;
  openExportCurrent: () => void;
  openImportBundle: () => void;
  openShortcutCheatSheet: () => void;
  openProject: (projectId: string) => void;
  openSettings: (target: SettingsCommandTarget | null) => void;
  openTheatreControls: () => void;
  openTheatreExit: () => void;
  openTheatre: () => void;
  openTelepromptStage: () => void;
  openTelepromptTheatreStage: () => void;
  openVoiceDashboard: () => void;
  openWorkspace: () => void;
  openBookSource: (book: BookSource) => void;
  openPreparedSource: (source: PreparedSource) => void | Promise<void>;
  openPreparedSourceCinema: (source: PreparedSource) => void;
  openBookmarkProgress: () => void | Promise<void>;
  applyCinemaAdvancedMetadataTarget: (target: CinemaAdvancedCommandTarget) => void;
  applyCinemaFocusMetadataTarget: (target: CinemaFocusCommandTarget) => void;
  applyHelpMetadataTarget: (target: HelpCommandTarget) => void;
  applySettingsMetadataTarget: (target: SettingsCommandTarget) => void;
  applyWorkspaceMetadataTarget: (target: WorkspaceCommandTarget) => void;
  createAndListenFromCurrentSource: () => void;
  openWordHighlightSettings: () => void;
  resumeProgress: (progress: PlaybackProgress) => void | Promise<void>;
  resolveBookSourceLabel: (book: BookSource) => string;
  resolvePreparedSourceCinemaActionLabel: (source: PreparedSource) => string;
}

export interface CommandPaletteBuildContext {
  activeCinemaSurfaceKind: CinemaSurfaceKind | null;
  activeProjectId: string;
  canCreateCurrentSource: boolean;
  canOpenCurrentCinema: boolean;
  commandMetadata: CommandMetadataState | null;
  commandWayfinding: CommandWayfindingState;
  createAndListenCapabilityReason: string | undefined;
  createAndListenDisabledReason: string | undefined;
  createAndListenScope: CreateAndListenScope;
  handlers: CommandPaletteHandlers;
  job: { id?: string } | null;
  projects: { id: string; name: string }[];
  bookSources: BookSource[];
  preparedSources: PreparedSource[];
  wordHighlightCapabilityReason: string | undefined;
  workspaceStageActionLabel: (action: WorkspaceStageActionId) => string;
}

export interface CommandPaletteHandlerContext {
  activeCinemaSurfaceKind: CinemaSurfaceKind | null;
  setCinemaAdvancedActionFromCommand: (
    target: CinemaAdvancedCommandTarget,
    surface: CinemaSurfaceKind,
  ) => void;
  setCinemaFocusModeFromCommand: (mode: CinemaFocusMode, surface: CinemaSurfaceKind) => void;
  setHelpCommandTarget: (target: HelpCommandTarget | null) => void;
  setIsHelpOpen: (open: boolean) => void;
  setIsWorkspaceOpen: (open: boolean) => void;
  setSettingsCommandTarget: (target: SettingsCommandTarget | null) => void;
  setIsSettingsOpen: (open: boolean) => void;
  setContentMode: (mode: WorkspaceStage) => void;
  setWorkspaceLayoutMode: (mode: WorkspaceLayoutMode) => void;
  openCommandCenterRoute: (routeId: CommandCenterRouteId) => void;
  openExportCurrent: () => void;
  openImportBundle: () => void;
  createAndListenFromCurrentSource: () => void;
  handleAddPlaybackBookmark: () => void | Promise<void>;
  handleResumeProgress: (progress: PlaybackProgress) => void | Promise<void>;
  handleUseBookText: (book: BookSource, scope: BookScope) => void;
  handleUsePreparedSource: (source: PreparedSource) => void | Promise<void>;
  openShortcutCheatSheet: () => void;
  openTelepromptStage: () => void;
  openTelepromptTheatreStage: () => void;
  openReadingCinema: () => void;
  openPreparedSourceCinema: (source: PreparedSource) => void;
  preparedSourceCinemaActionLabel: (source: PreparedSource) => string;
  resolveBookSourceLabel: (book: BookSource) => string;
  resolveDefaultBookScope: (book: BookSource) => BookScope;
  setIsBookCinemaOpen: (open: boolean) => void;
  setPreparedSourceCinemaSourceId: (id: string | null) => void;
  selectProject: (projectId: string) => void;
  setCinemaTheatreOpenSignal: (next: (current: number) => number) => void;
  setCinemaTheatreControlsSignal: (next: (current: number) => number) => void;
  setCinemaTheatreExitSignal: (next: (current: number) => number) => void;
  setIsVoiceDashboardOpen: (open: boolean) => void;
  setSourceMode: (mode: SourceMode) => void;
}

export function buildCommandPaletteHandlers({
  activeCinemaSurfaceKind,
  createAndListenFromCurrentSource,
  handleAddPlaybackBookmark,
  handleUseBookText,
  handleUsePreparedSource,
  handleResumeProgress,
  openShortcutCheatSheet,
  openTelepromptStage,
  openTelepromptTheatreStage,
  openReadingCinema,
  openPreparedSourceCinema,
  openCommandCenterRoute,
  openExportCurrent,
  openImportBundle,
  preparedSourceCinemaActionLabel,
  resolveBookSourceLabel,
  resolveDefaultBookScope,
  setHelpCommandTarget,
  setIsHelpOpen,
  setIsWorkspaceOpen,
  setSettingsCommandTarget,
  setIsSettingsOpen,
  setContentMode,
  setWorkspaceLayoutMode,
  setCinemaAdvancedActionFromCommand,
  setCinemaFocusModeFromCommand,
  setIsBookCinemaOpen,
  setPreparedSourceCinemaSourceId,
  selectProject,
  setCinemaTheatreOpenSignal,
  setCinemaTheatreControlsSignal,
  setCinemaTheatreExitSignal,
  setIsVoiceDashboardOpen,
  setSourceMode,
}: CommandPaletteHandlerContext): CommandPaletteHandlers {
  return {
    applyCinemaAdvancedMetadataTarget: (target) => {
      if (!activeCinemaSurfaceKind) {
        return;
      }
      setCinemaAdvancedActionFromCommand(target, activeCinemaSurfaceKind);
    },
    applyCinemaFocusMetadataTarget: (target) => {
      if (!activeCinemaSurfaceKind) {
        return;
      }
      setCinemaFocusModeFromCommand(target.mode, activeCinemaSurfaceKind);
    },
    applyHelpMetadataTarget: (target) => {
      setHelpCommandTarget(target);
      setIsHelpOpen(true);
    },
    applySettingsMetadataTarget: (target) => {
      setIsWorkspaceOpen(false);
      setSettingsCommandTarget(target);
      setIsSettingsOpen(true);
    },
    applyWorkspaceMetadataTarget: (target) => {
      if (target.kind === "stage") {
        setContentMode(target.stage);
        return;
      }
      setWorkspaceLayoutMode(target.layoutMode);
    },
    createAndListenFromCurrentSource: () => {
      createAndListenFromCurrentSource();
    },
    openBookmarkProgress: () => {
      void handleAddPlaybackBookmark();
    },
    openContextualHelp: (target) => {
      setHelpCommandTarget(target);
      setIsHelpOpen(true);
    },
    openCurrentCinema: () => {
      openReadingCinema();
    },
    openCommandCenterRoute,
    openDraftSource: () => {
      setSourceMode("text");
      setContentMode("intake");
    },
    openExportCurrent,
    openImportBundle,
    openPreparedSource: (source) => {
      void handleUsePreparedSource(source);
    },
    openPreparedSourceCinema: (source) => {
      openPreparedSourceCinema(source);
    },
    openProject: (projectId) => {
      setIsBookCinemaOpen(false);
      setPreparedSourceCinemaSourceId(null);
      selectProject(projectId);
    },
    openSettings: (target) => {
      setIsWorkspaceOpen(false);
      setSettingsCommandTarget(target);
      setIsSettingsOpen(true);
    },
    openShortcutCheatSheet,
    openTelepromptStage,
    openTelepromptTheatreStage,
    openTheatre: () => {
      setCinemaTheatreOpenSignal((current) => current + 1);
    },
    openTheatreControls: () => {
      setCinemaTheatreControlsSignal((current) => current + 1);
    },
    openTheatreExit: () => {
      setCinemaTheatreExitSignal((current) => current + 1);
    },
    openVoiceDashboard: () => {
      setIsWorkspaceOpen(false);
      setIsVoiceDashboardOpen(true);
    },
    openWorkspace: () => {
      setIsWorkspaceOpen(true);
    },
    openBookSource: (book) => {
      const defaultScope = resolveDefaultBookScope(book);
      handleUseBookText(book, defaultScope);
    },
    openWordHighlightSettings: () => {
      setIsWorkspaceOpen(false);
      setSettingsCommandTarget({
        fieldId: "readAlongPreferences",
        groupId: "reader",
        layerId: "advanced",
        scope: "machine",
      });
      setIsSettingsOpen(true);
    },
    resolveBookSourceLabel,
    resolvePreparedSourceCinemaActionLabel: (source) => preparedSourceCinemaActionLabel(source),
    resumeProgress: (progress) => {
      void handleResumeProgress(progress);
    },
  };
}

export async function loadCommandMetadata(): Promise<CommandMetadataState> {
  const module = await import("../navigation/commands");
  return {
    cinemaAdvanced: module.buildCinemaAdvancedCommandMetadata(),
    cinemaFocus: module.buildCinemaFocusCommandMetadata(),
    help: module.buildHelpCommandMetadata(),
    settings: module.buildSettingsCommandMetadata(),
    workspace: module.buildWorkspaceCommandMetadata(),
  };
}

function preparedSourceCommandEntriesForSource(
  source: PreparedSource,
  handlers: CommandPaletteHandlers,
): CommandEntry[] {
  const isReady = source.status === "ready";
  const label = source.title ?? source.sourceName;
  const disabledReason = isReady ? undefined : (source.error ?? "Prepared source is not ready.");
  return [
    {
      category: "Source",
      detail: "Use this prepared source in Review.",
      disabled: !isReady,
      disabledReason,
      id: `source:prepared:${source.id}`,
      keywords: ["prepared", "source", source.kind, label],
      owner: "source",
      perform: () => {
        void handlers.openPreparedSource(source);
      },
      section: "Sources",
      title: `Use source: ${label}`,
    },
    {
      category: "Source",
      detail: handlers.resolvePreparedSourceCinemaActionLabel(source),
      disabled: !isReady,
      disabledReason,
      id: `source:prepared-cinema:${source.id}`,
      keywords: ["cinema", "read", "prepared", source.kind, label],
      owner: "source",
      perform: () => {
        handlers.openPreparedSourceCinema(source);
      },
      section: "Sources",
      title: `Open ${label} in Cinema`,
    },
  ];
}

export function buildCommandEntries(context: CommandPaletteBuildContext): CommandEntry[] {
  const {
    activeCinemaSurfaceKind,
    activeProjectId,
    canCreateCurrentSource,
    canOpenCurrentCinema,
    commandMetadata,
    commandWayfinding,
    createAndListenCapabilityReason,
    createAndListenDisabledReason,
    createAndListenScope,
    handlers,
    job,
    projects,
    bookSources,
    preparedSources,
    wordHighlightCapabilityReason,
    workspaceStageActionLabel,
  } = context;
  const coreCommandEntries: CommandEntry[] = [
    {
      category: "Navigation",
      detail: "Open the project library and current chapter context.",
      id: "workspace:open",
      keywords: ["drawer", "project", "library"],
      owner: "workspace",
      perform: () => {
        handlers.openWorkspace();
      },
      section: "Workspace",
      title: "Open workspace",
    },
    {
      category: "Settings",
      detail: "Open Studio Settings.",
      id: "settings:open",
      keywords: ["configuration", "preferences"],
      owner: "settings",
      perform: () => {
        handlers.openSettings(null);
      },
      section: "Settings",
      shortcutCommandId: "settings.open",
      title: "Open settings",
    },
    {
      category: "Settings",
      detail: "Show available keyboard shortcuts and customization entry.",
      id: "shortcuts:open",
      keywords: ["keyboard", "hotkey", "cheat sheet"],
      owner: "settings",
      perform: () => {
        handlers.openShortcutCheatSheet();
      },
      section: "Settings",
      shortcutCommandId: "shortcut.cheatsheet",
      title: "Open shortcut cheat sheet",
    },
    {
      category: "Diagnostics",
      detail: "Open contextual workflow help.",
      id: "help:open",
      keywords: ["guide", "support", "workflow"],
      owner: "help",
      perform: () => {
        handlers.openContextualHelp(null);
      },
      section: "Help",
      shortcutCommandId: "help.open",
      title: "Open help",
    },
    {
      capabilityGate: "tts",
      capabilityGated: Boolean(createAndListenCapabilityReason),
      category: "Playback",
      detail: `Generate ${createAndListenScopeLabel(createAndListenScope)} audio from the current draft, book, or prepared source.`,
      disabled: !canCreateCurrentSource,
      disabledReason: createAndListenDisabledReason,
      id: "playback:create-listen",
      keywords: ["run", "generate", "listen", "audio"],
      owner: "workspace",
      perform: () => {
        handlers.createAndListenFromCurrentSource();
      },
      section: "Playback",
      shortcutCommandId: "playback.createListen",
      title: workspaceStageActionLabel("createAndListen"),
    },
    {
      capabilityGate: "wordTiming",
      capabilityGated: Boolean(wordHighlightCapabilityReason),
      category: "Settings",
      detail: "Open read-along settings for word-level highlight configuration.",
      disabled: Boolean(wordHighlightCapabilityReason),
      disabledReason: wordHighlightCapabilityReason,
      id: "readalong:word-highlight",
      keywords: ["readalong", "highlight", "word", "timing", "provider"],
      owner: "settings",
      perform: () => {
        handlers.openWordHighlightSettings();
      },
      section: "Settings",
      title: "Use word highlight",
    },
    {
      category: "Teleprompt",
      detail: "Follow the current script inline with preserved context.",
      id: "workspace:teleprompt",
      keywords: ["script", "read", "stage"],
      owner: "workspace",
      perform: () => {
        handlers.openTelepromptStage();
      },
      section: "Workspace",
      title: workspaceStageActionLabel("openTeleprompt"),
    },
    {
      category: "Voice",
      detail: "Open saved voices, candidates, targets, and voice diagnostics.",
      id: "voice:dashboard",
      keywords: ["voice", "profile", "candidate", "diagnostics"],
      owner: "voice",
      perform: () => {
        handlers.openVoiceDashboard();
      },
      section: "Voice",
      title: "Open voice dashboard",
    },
  ];
  const commandCenterRouteEntries = COMMAND_CENTER_ROUTES.map<CommandEntry>((route) => ({
    category: commandCenterRouteCategory(route.id),
    detail: route.description,
    id: `command-center:${route.id}`,
    keywords: ["command center", "activity", "operations", route.label, route.detail],
    owner: "command-center",
    perform: () => {
      handlers.openCommandCenterRoute(route.id);
    },
    section: "Workspace",
    title: route.id === "importsExports" ? "Open Import/Export" : `Open ${route.label}`,
  }));
  const bundleCommandEntries: CommandEntry[] = [
    {
      category: "Project",
      detail: "Preview and import a portable project bundle.",
      id: "bundle:import",
      keywords: ["bundle", "import", "portable", "project"],
      owner: "command-center",
      perform: () => {
        handlers.openImportBundle();
      },
      section: "Project",
      title: "Import Bundle",
    },
    {
      category: "Project",
      detail: "Export the active project as a portable bundle.",
      id: "bundle:export-current",
      keywords: ["bundle", "export", "download", "project"],
      owner: "command-center",
      perform: () => {
        handlers.openExportCurrent();
      },
      section: "Project",
      title: "Export Current",
    },
  ];
  const workspaceCommandEntries = (commandMetadata?.workspace ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      id: metadata.id,
      keywords: metadata.keywords,
      owner: metadata.owner,
      perform: () => {
        handlers.applyWorkspaceMetadataTarget(metadata.target);
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const settingsCommandEntries = (commandMetadata?.settings ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      id: metadata.id,
      keywords: metadata.keywords,
      owner: metadata.owner,
      perform: () => {
        handlers.applySettingsMetadataTarget(metadata.target);
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const helpCommandEntries = (commandMetadata?.help ?? []).map<CommandEntry>((metadata) => ({
    detail: metadata.detail,
    id: metadata.id,
    keywords: metadata.keywords,
    owner: metadata.owner,
    perform: () => {
      handlers.openContextualHelp(metadata.target);
    },
    category: metadata.category,
    section: metadata.section,
    title: metadata.title,
  }));
  const cinemaFocusCommandEntries = (commandMetadata?.cinemaFocus ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      disabled: !activeCinemaSurfaceKind,
      disabledReason: activeCinemaSurfaceKind
        ? undefined
        : "Open Book, Document, or Website Cinema first.",
      id: metadata.id,
      keywords: metadata.keywords,
      owner: metadata.owner,
      perform: () => {
        if (activeCinemaSurfaceKind) {
          handlers.applyCinemaFocusMetadataTarget(metadata.target);
        }
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const cinemaAdvancedCommandEntries = (commandMetadata?.cinemaAdvanced ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      disabled: !activeCinemaSurfaceKind,
      disabledReason: activeCinemaSurfaceKind
        ? undefined
        : "Open Book, Document, or Website Cinema before using operator diagnostics.",
      id: metadata.id,
      keywords: metadata.keywords,
      owner: metadata.owner,
      perform: () => {
        if (activeCinemaSurfaceKind) {
          handlers.applyCinemaAdvancedMetadataTarget(metadata.target);
        }
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const projectCommandEntries = projects.map<CommandEntry>((project) => ({
    category: "Project",
    detail: project.id === activeProjectId ? "Current project" : "Switch active project.",
    disabled: project.id === activeProjectId,
    disabledReason: project.id === activeProjectId ? "Already selected." : undefined,
    id: `project:${project.id}`,
    keywords: ["project", project.name],
    owner: "command-center",
    perform: () => {
      handlers.openProject(project.id);
    },
    section: "Projects",
    title: `Switch project: ${project.name}`,
  }));
  const draftSourceCommand: CommandEntry = {
    category: "Source",
    detail: "Return to draft text intake.",
    id: "source:text",
    keywords: ["draft", "text", "source"],
    owner: "source",
    perform: () => {
      handlers.openDraftSource();
    },
    section: "Sources",
    title: "Use draft text source",
  };
  const bookSourceCommandEntries = bookSources.map<CommandEntry>((book) => ({
    category: "Source",
    detail:
      book.status === "ready"
        ? "Use this book source in Review."
        : (book.error ?? "Book source is still preparing."),
    disabled: book.status !== "ready",
    disabledReason:
      book.status === "ready" ? undefined : (book.error ?? "Book source is not ready."),
    id: `source:book:${book.id}`,
    keywords: ["book", "source", handlers.resolveBookSourceLabel(book)],
    owner: "source",
    perform: () => {
      handlers.openBookSource(book);
    },
    section: "Sources",
    title: `Use book: ${handlers.resolveBookSourceLabel(book)}`,
  }));
  const preparedSourceCommandEntries = preparedSources.flatMap((source) =>
    preparedSourceCommandEntriesForSource(source, handlers),
  );
  const openCurrentCinemaCommand: CommandEntry = {
    category: "Playback",
    detail: "Open the current narration or selected book in Cinema.",
    disabled: !canOpenCurrentCinema,
    disabledReason: canOpenCurrentCinema ? undefined : "Create audio or select a ready book first.",
    id: "cinema:open-current",
    keywords: ["reader", "cinema", "listen"],
    owner: "cinema",
    perform: () => {
      handlers.openCurrentCinema();
    },
    section: "Cinema",
    title: "Open current Cinema",
  };
  const cinemaTheatreDisabledReason = activeCinemaSurfaceKind
    ? undefined
    : "Open Book, Document, or Website Cinema first.";
  const openCinemaTheatreCommand: CommandEntry = {
    category: "Playback",
    detail: "Enter the reader-first theatre layout for the active Cinema surface.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:open",
    keywords: ["cinema", "theatre", "immersive", "fullscreen", "reader"],
    owner: "cinema-theatre",
    perform: () => {
      handlers.openTheatre();
    },
    section: "Cinema",
    title: "Open Cinema Theatre",
  };
  const exitTheatreCommand: CommandEntry = {
    category: "Playback",
    detail: "Leave Theatre and return to the normal Cinema layout.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:exit",
    keywords: ["cinema", "theatre", "exit", "close", "reader"],
    owner: "cinema-theatre",
    perform: () => {
      handlers.openTheatreExit();
    },
    section: "Cinema",
    title: "Exit Theatre",
  };
  const toggleTheatreControlsCommand: CommandEntry = {
    category: "Playback",
    detail: "Show or hide the compact Theatre controls.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:toggle-controls",
    keywords: ["cinema", "theatre", "controls", "hide", "show"],
    owner: "cinema-theatre",
    perform: () => {
      handlers.openTheatreControls();
    },
    section: "Cinema",
    title: "Toggle Theatre controls",
  };
  let bookmarkDisabledReason: string | undefined;
  if (!activeCinemaSurfaceKind) {
    bookmarkDisabledReason = "Open a Cinema surface first.";
  } else if (!job) {
    bookmarkDisabledReason = "Create audio before saving bookmarks.";
  }
  const bookmarkCurrentCommand: CommandEntry = {
    category: "Review",
    detail: "Save the current reader position as a bookmark.",
    disabled: Boolean(bookmarkDisabledReason),
    disabledReason: bookmarkDisabledReason,
    id: "wayfinding:bookmark-current",
    keywords: ["save", "marker", "reader"],
    owner: "wayfinding",
    perform: () => {
      void handlers.openBookmarkProgress();
    },
    section: "Wayfinding",
    shortcut: "B",
    title: "Bookmark current position",
  };
  const bookmarkCommandEntries = commandWayfinding.bookmarks.map<CommandEntry>((bookmark) => ({
    category: "Review",
    detail: bookmark.detail,
    id: bookmark.id,
    keywords: bookmark.keywords,
    owner: "wayfinding",
    perform: () => {
      void handlers.resumeProgress(bookmark.resumeProgress);
    },
    section: "Wayfinding",
    title: `Bookmark: ${bookmark.label}`,
  }));
  const recentCommandEntries = commandWayfinding.recentPositions.map<CommandEntry>((recent) => ({
    category: "Navigation",
    detail: recent.detail,
    id: recent.id,
    keywords: recent.keywords,
    owner: "wayfinding",
    perform: () => {
      void handlers.resumeProgress(recent.progressItem);
    },
    section: "Wayfinding",
    title: `Recent: ${recent.label}`,
  }));
  return [
    ...coreCommandEntries,
    ...commandCenterRouteEntries,
    ...bundleCommandEntries,
    ...workspaceCommandEntries,
    ...settingsCommandEntries,
    ...helpCommandEntries,
    ...cinemaFocusCommandEntries,
    ...cinemaAdvancedCommandEntries,
    ...projectCommandEntries,
    draftSourceCommand,
    ...bookSourceCommandEntries,
    ...preparedSourceCommandEntries,
    openCurrentCinemaCommand,
    openCinemaTheatreCommand,
    exitTheatreCommand,
    toggleTheatreControlsCommand,
    bookmarkCurrentCommand,
    ...bookmarkCommandEntries,
    ...recentCommandEntries,
  ];
}

function commandCenterRouteCategory(routeId: CommandCenterRouteId): CommandEntry["category"] {
  if (routeId === "activity" || routeId === "reports") {
    return "Diagnostics";
  }
  if (routeId === "assets") {
    return "Source";
  }
  return "Project";
}
