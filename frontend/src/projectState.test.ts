import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLegacyWorkspaceState,
  clearProjectWorkspaceState,
  LEGACY_JOB_ID_STORAGE_KEY,
  LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY,
  loadProjectWorkspaceState,
  migrateLegacyWorkspaceState,
  projectWorkspaceStateKey,
  saveProjectWorkspaceState,
} from "./projectState";

describe("project workspace state", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        clear: () => {
          values.clear();
        },
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => {
          values.delete(key);
        },
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("starts a project blank when no scoped state exists", () => {
    expect(loadProjectWorkspaceState("new-project")).toMatchObject({
      activeBlockId: null,
      bookScope: null,
      bookSourceId: null,
      jobId: null,
      preparedSourceId: null,
      sourceMode: "text",
      sourceType: "draft",
      speechPolicyProfile: null,
      stage: "intake",
      text: "",
      voiceProfileId: null,
    });
  });

  it("saves draft text, active job, stage, source, and selected book state per project", () => {
    saveProjectWorkspaceState("alpha", {
      activeBlockId: "block-2",
      bookScope: { type: "chapter", chapterIndex: 2, label: "Chapter 2" },
      bookSourceId: "book-1",
      jobId: "job-1",
      preparedSourceId: "source-1",
      readingPosition: {
        activeWordIndex: 12,
        bookSourceId: "book-1",
        locator: { type: "html", html: { href: "chapter.html", fragment: "p12" } },
        nodeId: "p12",
        scopeKey: "chapter:2",
        textQuote: "exact text",
      },
      sourceMode: "fileUrl",
      sourceType: "prepared",
      speechPolicyProfile: "Enterprise",
      stage: "teleprompt",
      text: "Alpha text",
      voiceProfileId: "voice-1",
    });
    saveProjectWorkspaceState("beta", { jobId: null, text: "Beta text" });

    expect(loadProjectWorkspaceState("alpha")).toMatchObject({
      activeBlockId: "block-2",
      bookScope: { type: "chapter", chapterIndex: 2, label: "Chapter 2" },
      bookSourceId: "book-1",
      jobId: "job-1",
      preparedSourceId: "source-1",
      readingPosition: {
        activeWordIndex: 12,
        bookSourceId: "book-1",
        nodeId: "p12",
        scopeKey: "chapter:2",
      },
      sourceMode: "fileUrl",
      sourceType: "prepared",
      speechPolicyProfile: "Enterprise",
      stage: "teleprompt",
      text: "Alpha text",
      voiceProfileId: "voice-1",
    });
    expect(loadProjectWorkspaceState("beta")).toMatchObject({
      jobId: null,
      stage: "intake",
      text: "Beta text",
    });
  });

  it("migrates legacy global draft keys once into the selected project", () => {
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");
    localStorage.setItem(LEGACY_JOB_ID_STORAGE_KEY, "legacy-job");

    migrateLegacyWorkspaceState("default");

    expect(loadProjectWorkspaceState("default")).toMatchObject({
      jobId: "legacy-job",
      text: "Legacy draft",
    });
    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY)).toBeNull();
  });

  it("does not overwrite an existing scoped project during migration", () => {
    saveProjectWorkspaceState("default", { jobId: null, text: "Scoped draft" });
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");

    migrateLegacyWorkspaceState("default");

    expect(loadProjectWorkspaceState("default").text).toBe("Scoped draft");
    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
  });

  it("can clear a newly created project back to blank", () => {
    saveProjectWorkspaceState("fresh", { jobId: "old", text: "Old state" });
    clearProjectWorkspaceState("fresh");

    expect(loadProjectWorkspaceState("fresh")).toMatchObject({
      activeBlockId: null,
      bookScope: null,
      bookSourceId: null,
      jobId: null,
      preparedSourceId: null,
      stage: "intake",
      text: "",
    });
    expect(localStorage.getItem(projectWorkspaceStateKey("fresh"))).toBeNull();
  });

  it("keeps older saved state valid when workspace fields are missing or legacy", () => {
    localStorage.setItem(
      projectWorkspaceStateKey("older"),
      JSON.stringify({
        jobId: "job-1",
        stage: "sourceIntake",
        text: "Older text",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    expect(loadProjectWorkspaceState("older")).toMatchObject({
      activeBlockId: null,
      jobId: "job-1",
      preparedSourceId: null,
      sourceMode: "text",
      sourceType: "draft",
      speechPolicyProfile: null,
      stage: "intake",
      text: "Older text",
      voiceProfileId: null,
    });
  });

  it("can clear old global keys without scoped state", () => {
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");
    localStorage.setItem(LEGACY_JOB_ID_STORAGE_KEY, "legacy-job");

    clearLegacyWorkspaceState();

    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY)).toBeNull();
  });
});
