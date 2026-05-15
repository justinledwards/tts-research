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
      bookScope: null,
      bookSourceId: null,
      jobId: null,
      text: "",
    });
  });

  it("saves draft text, active job, and selected book state per project", () => {
    saveProjectWorkspaceState("alpha", {
      bookScope: { type: "chapter", chapterIndex: 2, label: "Chapter 2" },
      bookSourceId: "book-1",
      jobId: "job-1",
      text: "Alpha text",
    });
    saveProjectWorkspaceState("beta", { jobId: null, text: "Beta text" });

    expect(loadProjectWorkspaceState("alpha")).toMatchObject({
      bookScope: { type: "chapter", chapterIndex: 2, label: "Chapter 2" },
      bookSourceId: "book-1",
      jobId: "job-1",
      text: "Alpha text",
    });
    expect(loadProjectWorkspaceState("beta")).toMatchObject({
      jobId: null,
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
      bookScope: null,
      bookSourceId: null,
      jobId: null,
      text: "",
    });
    expect(localStorage.getItem(projectWorkspaceStateKey("fresh"))).toBeNull();
  });

  it("can clear old global keys without scoped state", () => {
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");
    localStorage.setItem(LEGACY_JOB_ID_STORAGE_KEY, "legacy-job");

    clearLegacyWorkspaceState();

    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY)).toBeNull();
  });
});
