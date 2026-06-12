import { describe, expect, it } from "vitest";
import { buildCommandEntries, type CommandPaletteHandlers } from "./commandPaletteHelpers";
import { commandDisabledReason, searchCommandEntries, type CommandEntry } from "./commandRegistry";
import type { TemporarySourceSession } from "../../types";

const noop = () => {
  // Test callback.
};

describe("command palette helpers", () => {
  it("exposes Command Center routes and bundle operations", () => {
    const entries = buildCommandEntries(buildContext());

    expect(entries.map((entry) => entry.id)).toContain("command-center:activity");
    expect(entries.map((entry) => entry.id)).toContain("command-center:temporary");
    expect(entries.map((entry) => entry.id)).toContain("command-center:importsExports");
    expect(entries.map((entry) => entry.id)).toContain("command-center:reports");
    expect(entries.map((entry) => entry.id)).toContain("bundle:import");
    expect(entries.map((entry) => entry.id)).toContain("bundle:export-current");
    expect(entries.find((entry) => entry.id === "quick-listen:open")).toMatchObject({
      category: "Source",
      title: "Quick Listen",
    });
    expect(entries.find((entry) => entry.id === "command-center:activity")).toMatchObject({
      category: "Diagnostics",
      title: "Open Activity",
    });
    expect(entries.find((entry) => entry.id === "command-center:temporary")).toMatchObject({
      category: "Source",
      title: "Open Temporary Work",
    });
  });

  it("exposes temporary source commands with ownership and disabled reasons", () => {
    const entries = buildCommandEntries(buildContext());

    const newTemporarySourceCommand = entryById(entries, "temporary-source:new");
    expect(newTemporarySourceCommand).toMatchObject({
      category: "Source",
      owner: "temporary-source",
      title: "New temporary source",
    });
    expect(newTemporarySourceCommand.detail).toContain("Temporary source");
    expect(entries.find((entry) => entry.id === "temporary-source:paste")).toMatchObject({
      title: "Paste text as temporary source",
    });
    expect(entries.find((entry) => entry.id === "temporary-source:open-url")).toMatchObject({
      title: "Open webpage temporarily",
    });
    expect(entries.find((entry) => entry.id === "temporary-source:upload-file")).toMatchObject({
      title: "Upload file temporarily",
    });
    expect(commandDisabledReason(entryById(entries, "temporary-source:open-review"))).toBe(
      "Open or select a temporary source first.",
    );
    expect(commandDisabledReason(entryById(entries, "temporary-source:reopen-recent"))).toBe(
      "No recent temporary sources are available.",
    );
    expect(entryById(entries, "temporary-source:keep-in-project").shortcutCommandId).toBe(
      "temporary.keepInProject",
    );
    expect(entryById(entries, "temporary-source:create-audio").shortcutCommandId).toBe(
      "temporary.quickListen",
    );
  });

  it("labels recent temporary sources and makes them searchable by expert terms", () => {
    const session = temporarySourceSession();
    const entries = buildCommandEntries(
      buildContext({
        activeTemporarySource: session,
        temporarySources: [session],
        temporaryStorageUsage: {
          artifactBytes: 0,
          audioBytes: 0,
          expiredCount: 1,
          generatingCount: 0,
          progressBytes: 0,
          sessions: [],
          sourceBytes: 2048,
          temporaryCount: 1,
          totalBytes: 2048,
          updatedAt: "2026-06-12T10:00:00Z",
        },
      }),
    );

    const recentTemporaryCommand = entryById(entries, "temporary-source:recent:temp-article");
    expect(recentTemporaryCommand).toMatchObject({
      owner: "temporary-source",
      title: "Temporary: Cache and Cache Coherency",
    });
    expect(recentTemporaryCommand.detail).toContain("Temporary source");
    expect(entryById(entries, "temporary-source:open-review").disabled).toBe(false);
    expect(entryById(entries, "temporary-source:clear-expired").disabled).toBe(false);
    expect(searchCommandEntries(entries, "webpage article").map((entry) => entry.id)).toContain(
      "temporary-source:recent:temp-article",
    );
    expect(searchCommandEntries(entries, "quick listen").map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["quick-listen:open", "temporary-source:new"]),
    );
    expect(searchCommandEntries(entries, "scratch paste").map((entry) => entry.id)).toContain(
      "temporary-source:paste",
    );
  });
});

function buildContext(
  overrides: Partial<Parameters<typeof buildCommandEntries>[0]> = {},
): Parameters<typeof buildCommandEntries>[0] {
  return {
    activeCinemaSurfaceKind: null,
    activeProjectId: "project-1",
    activeTemporarySource: null,
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
    temporarySources: [],
    temporaryStorageUsage: null,
    wordHighlightCapabilityReason: undefined,
    workspaceStageActionLabel: () => "Create & Listen",
    ...overrides,
  };
}

function entryById(entries: ReturnType<typeof buildCommandEntries>, id: string): CommandEntry {
  const entry = entries.find((candidate) => candidate.id === id);
  if (!entry) {
    throw new Error(`Expected command entry ${id}`);
  }
  return entry;
}

function temporarySourceSession(): TemporarySourceSession {
  return {
    artifacts: [],
    createdAt: "2026-06-12T09:00:00Z",
    expiresAt: "2026-06-13T09:00:00Z",
    id: "temp-article",
    kind: "url",
    lastAccessedAt: "2026-06-12T09:30:00Z",
    promotionStatus: "notPromoted",
    sourceName: "https://example.com/cache-article",
    sourceOwner: "temporary",
    sourceUrl: "https://example.com/cache-article",
    status: "reviewable",
    temporarySourceId: "temp-article",
    title: "Cache and Cache Coherency",
    updatedAt: "2026-06-12T09:30:00Z",
    wordCount: 420,
  };
}

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
  openQuickListen: noop,
  openPreparedSource: noop,
  openPreparedSourceCinema: noop,
  openTemporarySourceCinema: noop,
  openTemporarySourceInReview: noop,
  openTemporarySourceInPreview: noop,
  keepTemporarySourceInProject: noop,
  discardTemporarySource: noop,
  clearExpiredTemporarySources: noop,
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
