import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WORKSPACE_LAYOUT_STORAGE_KEY } from "../workspace";
import type { CinemaPanelDefinition } from "../cinema";
import {
  UI_MEMORY_STORAGE_KEY,
  defaultUiMemoryState,
  loadUiMemory,
  rememberCinemaFocusState,
  rememberReviewPane,
  rememberTelepromptReturnStage,
  rememberWorkspaceLayoutMode,
  resetUiMemory,
  resolveCinemaFocusState,
  resolveReviewPane,
  resolveTelepromptReturnStage,
  resolveWorkspaceLayoutMode,
  saveUiMemory,
  type UiMemoryState,
} from "./model";

describe("UI memory model", () => {
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

  it("defaults memory off and resolves documented layout defaults", () => {
    const memory = loadUiMemory();

    expect(memory.rememberLayout).toBe(false);
    expect(resolveWorkspaceLayoutMode(memory, "alpha")).toBe("balanced");
    expect(resolveReviewPane(memory, "alpha")).toBe("blocks");
    expect(resolveTelepromptReturnStage(memory, "alpha")).toBe("review");
    expect(resolveCinemaFocusState(memory, "book")).toEqual({
      activePanelId: null,
      mode: "read",
      pinnedPanelId: null,
    });
  });

  it("persists project layout before local layout defaults when memory is enabled", () => {
    const enabled = { ...defaultUiMemoryState(true), rememberLayout: true };
    const alpha = rememberWorkspaceLayoutMode(enabled, "alpha", "focus");
    const beta = rememberWorkspaceLayoutMode(alpha, "beta", "full");

    expect(resolveWorkspaceLayoutMode(beta, "alpha")).toBe("focus");
    expect(resolveWorkspaceLayoutMode(beta, "beta")).toBe("full");
    expect(resolveWorkspaceLayoutMode(beta, "gamma")).toBe("full");

    saveUiMemory(beta);
    expect(resolveWorkspaceLayoutMode(loadUiMemory(), "alpha")).toBe("focus");
  });

  it("does not persist remembered layout details while memory is disabled", () => {
    const disabled = defaultUiMemoryState(false);

    expect(rememberWorkspaceLayoutMode(disabled, "alpha", "full")).toBe(disabled);
    expect(rememberReviewPane(disabled, "alpha", "script")).toBe(disabled);
    expect(rememberTelepromptReturnStage(disabled, "alpha", "preview")).toBe(disabled);
    expect(
      rememberCinemaFocusState(disabled, "book", {
        activePanelId: "policy",
        mode: "review",
        pinnedPanelId: "policy",
      }),
    ).toBe(disabled);
  });

  it("normalizes corrupt storage and removes the legacy workspace layout key", () => {
    localStorage.setItem(UI_MEMORY_STORAGE_KEY, "{bad json");
    localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, "full");

    const memory = loadUiMemory();

    expect(memory).toMatchObject({ rememberLayout: false });
    expect(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toBeNull();
    expect(resolveWorkspaceLayoutMode(memory, "alpha")).toBe("balanced");
  });

  it("migrates legacy workspace layout as an opt-in default without enabling memory", () => {
    localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, "focus");

    const memory = loadUiMemory();

    expect(memory.rememberLayout).toBe(false);
    expect(memory.workspace.layoutMode).toBe("focus");
    expect(resolveWorkspaceLayoutMode(memory, "alpha")).toBe("balanced");
    expect(resolveWorkspaceLayoutMode({ ...memory, rememberLayout: true }, "alpha")).toBe("focus");
    expect(localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toBeNull();
  });

  it("resets remembered values while preserving the remember toggle", () => {
    const memory = rememberReviewPane(
      rememberWorkspaceLayoutMode(defaultUiMemoryState(true), "alpha", "full"),
      "alpha",
      "validation",
    );

    expect(resetUiMemory(memory)).toMatchObject({
      rememberLayout: true,
      workspace: {
        layoutMode: null,
        projectLayoutModes: {},
        reviewPanes: {},
      },
    });
  });

  it("normalizes review panes, teleprompt returns, and cinema panels", () => {
    const memory = {
      ...defaultUiMemoryState(true),
      cinema: {
        ...defaultUiMemoryState(true).cinema,
        book: {
          activePanelId: "policy",
          mode: "review",
          pinnedPanelId: "debug",
        },
      },
      workspace: {
        ...defaultUiMemoryState(true).workspace,
        reviewPanes: { alpha: "validation" },
        telepromptReturnStages: { alpha: "preview", beta: "intake" },
      },
    } as unknown as UiMemoryState;
    const panels: CinemaPanelDefinition[] = [
      {
        children: "Policy",
        detail: "Policy",
        id: "policy",
        modeAffinity: "review",
        title: "Policy",
      },
    ];

    expect(resolveReviewPane(memory, "alpha")).toBe("validation");
    expect(resolveTelepromptReturnStage(memory, "alpha")).toBe("preview");
    expect(resolveTelepromptReturnStage(memory, "beta")).toBe("review");
    expect(resolveCinemaFocusState(memory, "book", panels)).toEqual({
      activePanelId: "policy",
      mode: "review",
      pinnedPanelId: null,
    });
  });
});
