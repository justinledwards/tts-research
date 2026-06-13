import { describe, expect, it } from "vitest";
import { temporaryPromotionDisabledReason } from "../featureFlags";
import { buildSettingsCommandMetadata } from "../navigation";
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
    const requiredTemporaryCommands = [
      ["temporary-source:new", "Temporary source · Start Quick Listen"],
      ["temporary-source:paste", "Temporary source · Paste text"],
      ["temporary-source:open-url", "Temporary source · Open webpage"],
      ["temporary-source:upload-file", "Temporary source · Upload file"],
      ["temporary-source:reopen-recent", "Temporary source · Reopen recent temporary source"],
      ["temporary-source:open-review", "Temporary source · Open in Review"],
      ["temporary-source:open-preview", "Temporary source · Open in Preview"],
      ["temporary-source:open-cinema", "Temporary source · Open in Cinema"],
      ["temporary-source:create-audio", "Temporary source · Create audio"],
      ["temporary-source:retry-audio", "Temporary source · Retry audio"],
      ["temporary-source:keep-in-project", "Temporary source · Keep in project"],
      ["temporary-source:discard", "Temporary source · Discard temporary source"],
      ["temporary-source:clear-expired", "Temporary storage · Clear expired temporary work"],
    ] as const;

    for (const [id, title] of requiredTemporaryCommands) {
      const entry = entryById(entries, id);
      expect(entry).toMatchObject({
        owner: "temporary-source",
        title,
      });
      expect(
        entry.detail?.startsWith(
          id === "temporary-source:clear-expired" ? "Temporary storage" : "Temporary source",
        ),
      ).toBe(true);
    }
    expect(commandDisabledReason(entryById(entries, "temporary-source:open-review"))).toBe(
      "Open or select a temporary source first.",
    );
    expect(commandDisabledReason(entryById(entries, "temporary-source:reopen-recent"))).toBe(
      "No temporary sources are available in this app session.",
    );
    expect(entryById(entries, "temporary-source:keep-in-project").shortcutCommandId).toBe(
      "temporary.keepInProject",
    );
    expect(entryById(entries, "temporary-source:new").shortcutCommandId).toBe(
      "temporary.quickListen",
    );
  });

  it("routes temporary commands through the same handler contract as visible actions", async () => {
    const calls: string[] = [];
    const session = temporarySourceSession();
    const entries = buildCommandEntries(
      buildContext({
        activeTemporarySource: session,
        canCreateCurrentSource: true,
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
        handlers: {
          ...handlers,
          clearExpiredTemporarySources: () => {
            calls.push("clearExpiredTemporarySources");
          },
          createAndListenFromCurrentSource: () => {
            calls.push("createAndListenFromCurrentSource");
          },
          discardTemporarySource: (source) => {
            calls.push(`discardTemporarySource:${source.id}`);
          },
          keepTemporarySourceInProject: (source) => {
            calls.push(`keepTemporarySourceInProject:${source.id}`);
          },
          openQuickListen: (mode) => {
            calls.push(`openQuickListen:${mode ?? "default"}`);
          },
          openTemporarySourceCinema: (source) => {
            calls.push(`openTemporarySourceCinema:${source.id}`);
          },
          openTemporarySourceInPreview: (source) => {
            calls.push(`openTemporarySourceInPreview:${source.id}`);
          },
          openTemporarySourceInReview: (source) => {
            calls.push(`openTemporarySourceInReview:${source.id}`);
          },
        },
      }),
    );

    for (const id of [
      "temporary-source:new",
      "temporary-source:paste",
      "temporary-source:open-url",
      "temporary-source:upload-file",
      "temporary-source:reopen-recent",
      "temporary-source:open-review",
      "temporary-source:open-preview",
      "temporary-source:open-cinema",
      "temporary-source:create-audio",
      "temporary-source:retry-audio",
      "temporary-source:keep-in-project",
      "temporary-source:discard",
      "temporary-source:clear-expired",
    ]) {
      await entryById(entries, id).perform({ close: noop, source: "palette" });
    }

    expect(calls).toEqual([
      "openQuickListen:paste",
      "openQuickListen:paste",
      "openQuickListen:url",
      "openQuickListen:file",
      "openTemporarySourceInReview:temp-article",
      "openTemporarySourceInReview:temp-article",
      "openTemporarySourceInPreview:temp-article",
      "openTemporarySourceCinema:temp-article",
      "createAndListenFromCurrentSource",
      "createAndListenFromCurrentSource",
      "keepTemporarySourceInProject:temp-article",
      "discardTemporarySource:temp-article",
      "clearExpiredTemporarySources",
    ]);
  });

  it("hides Quick Listen commands when temporarySources.quickListen is disabled", () => {
    const entries = buildCommandEntries(buildContext({ quickListenEnabled: false }));
    const entryIds = entries.map((entry) => entry.id);

    expect(entryIds).not.toContain("quick-listen:open");
    expect(entryIds).not.toContain("temporary-source:new");
    expect(entryIds).not.toContain("temporary-source:paste");
    expect(entryIds).not.toContain("temporary-source:open-url");
    expect(entryIds).not.toContain("temporary-source:upload-file");
    expect(searchCommandEntries(entries, "quick listen").map((entry) => entry.id)).not.toContain(
      "quick-listen:open",
    );
  });

  it("hides Temporary Work management commands when temporarySources.premiumSurfaces is disabled", () => {
    const session = temporarySourceSession();
    const entries = buildCommandEntries(
      buildContext({
        activeTemporarySource: session,
        temporarySources: [session],
        temporaryWorkEnabled: false,
      }),
    );
    const entryIds = entries.map((entry) => entry.id);

    expect(entryIds).toContain("quick-listen:open");
    expect(entryIds).not.toContain("command-center:temporary");
    expect(entryIds).not.toContain("temporary-source:reopen-recent");
    expect(entryIds).not.toContain("temporary-source:keep-in-project");
    expect(entryIds).not.toContain("temporary-source:discard");
    expect(entryIds).not.toContain("temporary-source:clear-expired");
    expect(entryIds).not.toContain("temporary-source:recent:temp-article");
  });

  it("keeps promotion visible but disabled when temporarySources.promotion is disabled", async () => {
    const calls: string[] = [];
    const session = temporarySourceSession();
    const entries = buildCommandEntries(
      buildContext({
        activeTemporarySource: session,
        temporaryPromotionEnabled: false,
        temporarySources: [session],
        handlers: {
          ...handlers,
          keepTemporarySourceInProject: (source) => {
            calls.push(source.id);
          },
        },
      }),
    );
    const keepEntry = entryById(entries, "temporary-source:keep-in-project");

    expect(keepEntry.disabled).toBe(true);
    expect(commandDisabledReason(keepEntry)).toBe(temporaryPromotionDisabledReason());
    await keepEntry.perform({ close: noop, source: "palette" });
    expect(calls).toEqual([]);
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

  it("exposes settings deep links for temporary source behavior", () => {
    const entries = buildCommandEntries(
      buildContext({
        commandMetadata: {
          cinemaAdvanced: [],
          cinemaFocus: [],
          help: [],
          settings: buildSettingsCommandMetadata(),
          workspace: [],
        },
      }),
    );

    const temporarySettings = entryById(entries, "settings:field:temporarySourceBehavior");
    expect(temporarySettings).toMatchObject({
      category: "Settings",
      owner: "settings",
      title: "Temporary source behavior",
    });
    expect(temporarySettings.detail).toContain("Temporary source scope");
    expect(
      searchCommandEntries(entries, "temporary expiry cleanup").map((entry) => entry.id),
    ).toContain("settings:field:temporarySourceBehavior");
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
    scope: "temporary",
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
