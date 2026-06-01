import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
  WORKSPACE_LAYOUT_STORAGE_KEY,
} from "../workspace";
import type { CinemaPanelDefinition } from "../cinema";
import {
  UI_MEMORY_STORAGE_KEY,
  defaultUiMemoryState,
  loadUiMemory,
  rememberCinemaFocusState,
  rememberReviewPane,
  rememberTelepromptReturnStage,
  rememberWorkspaceCustomLayout,
  rememberWorkspaceDisclosurePin,
  rememberWorkspaceLayoutMode,
  resetUiMemory,
  resolveCinemaFocusState,
  resolveReviewPane,
  resolveTelepromptReturnStage,
  resolveWorkspaceCustomLayout,
  resolveWorkspaceDisclosurePins,
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
    expect(memory.rememberPanelPins).toBe(false);
    expect(memory.rememberReaderPreferences).toBe(true);
    expect(memory.rememberTelepromptReturnTarget).toBe(true);
    expect(memory.rememberTheme).toBe(true);
    expect(memory.showTutorialLauncher).toBe(true);
    expect(resolveWorkspaceLayoutMode(memory, "alpha")).toBe("balanced");
    expect(resolveWorkspaceCustomLayout(memory, "alpha")).toEqual(DEFAULT_WORKSPACE_CUSTOM_LAYOUT);
    expect(resolveWorkspaceDisclosurePins(memory, "alpha")).toEqual(
      DEFAULT_WORKSPACE_DISCLOSURE_PINS,
    );
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
    const customized = rememberWorkspaceCustomLayout(beta, "alpha", {
      contextInspector: "pinned",
      sourceContext: "summary",
      systemStatus: "pinned",
    });

    expect(resolveWorkspaceLayoutMode(customized, "alpha")).toBe("focus");
    expect(resolveWorkspaceLayoutMode(customized, "beta")).toBe("full");
    expect(resolveWorkspaceLayoutMode(customized, "gamma")).toBe("full");
    expect(resolveWorkspaceCustomLayout(customized, "alpha")).toEqual({
      contextInspector: "pinned",
      sourceContext: "summary",
      systemStatus: "pinned",
    });
    expect(resolveWorkspaceCustomLayout(customized, "beta")).toEqual({
      contextInspector: "pinned",
      sourceContext: "summary",
      systemStatus: "pinned",
    });

    saveUiMemory(customized);
    expect(resolveWorkspaceLayoutMode(loadUiMemory(), "alpha")).toBe("focus");
    expect(resolveWorkspaceCustomLayout(loadUiMemory(), "alpha").sourceContext).toBe("summary");
  });

  it("persists disclosure panel pins only when panel memory is enabled", () => {
    const disabled = defaultUiMemoryState({ rememberPanelPins: false });
    expect(rememberWorkspaceDisclosurePin(disabled, "alpha", "diagnostics", true)).toBe(disabled);
    expect(resolveWorkspaceDisclosurePins(disabled, "alpha").diagnostics).toBe(false);

    const enabled = defaultUiMemoryState({ rememberPanelPins: true });
    const pinned = rememberWorkspaceDisclosurePin(enabled, "alpha", "diagnostics", true);

    expect(resolveWorkspaceDisclosurePins(pinned, "alpha")).toMatchObject({
      diagnostics: true,
    });
    expect(resolveWorkspaceDisclosurePins(pinned, "beta")).toMatchObject({
      diagnostics: true,
    });

    saveUiMemory(pinned);
    expect(resolveWorkspaceDisclosurePins(loadUiMemory(), "alpha").diagnostics).toBe(true);
  });

  it("does not persist remembered layout details while memory is disabled", () => {
    const disabled = defaultUiMemoryState({
      rememberLayout: false,
      rememberPanelPins: false,
      rememberTelepromptReturnTarget: false,
    });

    expect(rememberWorkspaceLayoutMode(disabled, "alpha", "full")).toBe(disabled);
    expect(rememberWorkspaceCustomLayout(disabled, "alpha", DEFAULT_WORKSPACE_CUSTOM_LAYOUT)).toBe(
      disabled,
    );
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

  it("normalizes and persists Studio tutorial launcher visibility", () => {
    localStorage.setItem(
      UI_MEMORY_STORAGE_KEY,
      JSON.stringify({
        rememberTheme: false,
        version: 1,
      }),
    );

    expect(loadUiMemory().showTutorialLauncher).toBe(true);

    saveUiMemory({
      ...defaultUiMemoryState(),
      showTutorialLauncher: false,
    });

    expect(loadUiMemory().showTutorialLauncher).toBe(false);
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
        customLayout: DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
        layoutMode: null,
        projectCustomLayouts: {},
        projectLayoutModes: {},
        reviewPanes: {},
      },
    });
  });

  it("normalizes review panes, teleprompt returns, and cinema panels", () => {
    const memory = {
      ...defaultUiMemoryState({
        rememberLayout: true,
        rememberPanelPins: true,
        rememberTelepromptReturnTarget: true,
      }),
      cinema: {
        ...defaultUiMemoryState({
          rememberLayout: true,
          rememberPanelPins: true,
        }).cinema,
        book: {
          activePanelId: "policy",
          mode: "review",
          pinnedPanelId: "debug",
        },
      },
      workspace: {
        ...defaultUiMemoryState(true).workspace,
        customLayout: {
          contextInspector: "full",
          sourceContext: "summary",
          systemStatus: "invalid",
        },
        disclosurePins: {
          ...DEFAULT_WORKSPACE_DISCLOSURE_PINS,
          diagnostics: true,
        },
        projectDisclosurePins: {
          alpha: {
            ...DEFAULT_WORKSPACE_DISCLOSURE_PINS,
            audioGeneration: true,
          },
        },
        projectCustomLayouts: {
          alpha: {
            contextInspector: "pinned",
            sourceContext: "hidden",
            systemStatus: "summary",
          },
        },
        reviewPanes: { alpha: "validation" },
        telepromptReturnStages: { alpha: "preview", beta: "intake" },
      },
    } as unknown as UiMemoryState;
    const panels: CinemaPanelDefinition[] = [
      {
        detail: "Policy",
        id: "policy",
        modeAffinity: "review",
        sections: [
          {
            children: "Policy",
            detail: "Policy",
            id: "policy-section",
            kind: "speech-policy",
            title: "Policy",
          },
        ],
        title: "Policy",
      },
    ];

    expect(resolveReviewPane(memory, "alpha")).toBe("validation");
    expect(resolveWorkspaceCustomLayout(memory, "alpha")).toEqual({
      contextInspector: "pinned",
      sourceContext: "hidden",
      systemStatus: "summary",
    });
    expect(resolveWorkspaceCustomLayout(memory, "gamma")).toEqual({
      contextInspector: "summary",
      sourceContext: "summary",
      systemStatus: "hidden",
    });
    expect(resolveWorkspaceDisclosurePins(memory, "alpha").audioGeneration).toBe(true);
    expect(resolveWorkspaceDisclosurePins(memory, "gamma").diagnostics).toBe(true);
    expect(resolveTelepromptReturnStage(memory, "alpha")).toBe("preview");
    expect(resolveTelepromptReturnStage(memory, "beta")).toBe("review");
    expect(resolveCinemaFocusState(memory, "book", panels)).toEqual({
      activePanelId: "policy",
      mode: "review",
      pinnedPanelId: null,
    });
  });
});
