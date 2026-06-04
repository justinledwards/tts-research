import { describe, expect, it } from "vitest";
import { buildCommandEntries, type CommandPaletteHandlers } from "./commandPaletteHelpers";

const noop = () => {
  // Test callback.
};

describe("command palette helpers", () => {
  it("exposes Command Center routes and bundle operations", () => {
    const entries = buildCommandEntries({
      activeCinemaSurfaceKind: null,
      activeProjectId: "project-1",
      bookSources: [],
      canCreateCurrentSource: true,
      canOpenCurrentCinema: false,
      commandMetadata: null,
      commandWayfinding: { bookmarks: [], recentPositions: [] },
      createAndListenCapabilityReason: undefined,
      createAndListenDisabledReason: undefined,
      createAndListenScope: "current-scope",
      handlers,
      job: { id: "job-1" },
      preparedSources: [],
      projects: [{ id: "project-1", name: "Project One" }],
      wordHighlightCapabilityReason: undefined,
      workspaceStageActionLabel: () => "Create & Listen",
    });

    expect(entries.map((entry) => entry.id)).toContain("command-center:activity");
    expect(entries.map((entry) => entry.id)).toContain("command-center:importsExports");
    expect(entries.map((entry) => entry.id)).toContain("command-center:reports");
    expect(entries.map((entry) => entry.id)).toContain("bundle:import");
    expect(entries.map((entry) => entry.id)).toContain("bundle:export-current");
    expect(entries.find((entry) => entry.id === "command-center:activity")).toMatchObject({
      category: "Diagnostics",
      title: "Open Activity",
    });
  });
});

const handlers: CommandPaletteHandlers = {
  applyCinemaAdvancedMetadataTarget: noop,
  applyCinemaFocusMetadataTarget: noop,
  applyHelpMetadataTarget: noop,
  applySettingsMetadataTarget: noop,
  applyWorkspaceMetadataTarget: noop,
  createAndListenFromCurrentSource: noop,
  openBookmarkProgress: noop,
  openBookSource: noop,
  openCommandCenterRoute: noop,
  openContextualHelp: noop,
  openCurrentCinema: noop,
  openDraftSource: noop,
  openExportCurrent: noop,
  openImportBundle: noop,
  openPreparedSource: noop,
  openPreparedSourceCinema: noop,
  openProject: noop,
  openSettings: noop,
  openShortcutCheatSheet: noop,
  openTelepromptStage: noop,
  openTelepromptTheatreStage: noop,
  openTheatre: noop,
  openTheatreControls: noop,
  openTheatreExit: noop,
  openVoiceDashboard: noop,
  openWordHighlightSettings: noop,
  openWorkspace: noop,
  resolveBookSourceLabel: () => "Book",
  resolvePreparedSourceCinemaActionLabel: () => "Open Cinema",
  resumeProgress: noop,
};
