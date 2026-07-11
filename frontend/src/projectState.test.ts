import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearLegacyWorkspaceState,
  LEGACY_JOB_ID_STORAGE_KEY,
  LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY,
  loadProjectWorkspaceState,
  migrateLegacyWorkspaceState,
  projectWorkspaceStateKey,
  saveProjectWorkspaceState,
} from "./projectState";

describe("legacy project workspace state", () => {
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
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("never hydrates authoritative identity, locator, rate, follow, or content from localStorage", () => {
    localStorage.setItem(
      projectWorkspaceStateKey("project-1"),
      JSON.stringify({
        bookSourceId: "local-book",
        jobId: "local-run",
        preparedSourceId: "local-source",
        readingPosition: { nodeId: "local-node" },
        playbackRate: 3,
        followPreference: false,
        text: "local text",
      }),
    );

    expect(loadProjectWorkspaceState("project-1")).toMatchObject({
      bookSourceId: null,
      jobId: null,
      preparedSourceId: null,
      readingPosition: null,
      sourceMode: "text",
      text: "",
    });
    expect(localStorage.getItem(projectWorkspaceStateKey("project-1"))).toBeNull();
  });

  it("treats all old workspace writes as cleanup-only", () => {
    localStorage.setItem(projectWorkspaceStateKey("project-1"), "stale");
    saveProjectWorkspaceState("project-1", { jobId: "run", text: "draft" });
    expect(localStorage.getItem(projectWorkspaceStateKey("project-1"))).toBeNull();
  });

  it("deletes scoped and global legacy workspace keys during migration", () => {
    localStorage.setItem(projectWorkspaceStateKey("project-1"), "stale");
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");
    localStorage.setItem(LEGACY_JOB_ID_STORAGE_KEY, "legacy-job");

    migrateLegacyWorkspaceState("project-1");

    expect(localStorage.getItem(projectWorkspaceStateKey("project-1"))).toBeNull();
    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY)).toBeNull();
  });

  it("can explicitly clean global workspace keys", () => {
    localStorage.setItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY, "Legacy draft");
    localStorage.setItem(LEGACY_JOB_ID_STORAGE_KEY, "legacy-job");
    clearLegacyWorkspaceState();
    expect(localStorage.getItem(LEGACY_SOURCE_TEXT_DRAFT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_JOB_ID_STORAGE_KEY)).toBeNull();
  });
});
