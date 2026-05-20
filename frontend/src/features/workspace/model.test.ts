import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceContext,
  defaultWorkspaceLayoutMode,
  enterTelepromptStage,
  normalizeWorkspaceLayoutMode,
  normalizeWorkspaceStage,
  returnFromTelepromptStage,
  transitionWorkspaceStage,
  withWorkspaceActiveBlock,
  withWorkspaceSource,
  workspaceLayoutModeForRailMode,
  workspaceLayoutModeMeta,
  workspaceLayoutRails,
  workspaceStageMeta,
} from "./model";

describe("workspace stage model", () => {
  it("normalizes legacy and unknown stage values", () => {
    expect(normalizeWorkspaceStage("sourceIntake")).toBe("intake");
    expect(normalizeWorkspaceStage("review")).toBe("review");
    expect(normalizeWorkspaceStage("teleprompt")).toBe("teleprompt");
    expect(normalizeWorkspaceStage("old")).toBe("intake");
  });

  it("uses balanced layout as the default shell density", () => {
    expect(normalizeWorkspaceLayoutMode(null)).toBe("balanced");
    expect(defaultWorkspaceLayoutMode()).toBe("balanced");
    expect(workspaceLayoutRails("balanced")).toEqual({
      activityFooterMode: "compact",
      leftRailMode: "compact",
      rightRailMode: "compact",
    });
    expect(workspaceLayoutRails("focus")).toEqual({
      activityFooterMode: "collapsed",
      leftRailMode: "collapsed",
      rightRailMode: "collapsed",
    });
    expect(workspaceLayoutRails("full")).toEqual({
      activityFooterMode: "full",
      leftRailMode: "full",
      rightRailMode: "full",
    });
    expect(workspaceLayoutModeForRailMode("collapsed")).toBe("focus");
    expect(workspaceLayoutModeForRailMode("compact")).toBe("balanced");
    expect(workspaceLayoutModeForRailMode("full")).toBe("full");
  });

  it("defaults narrow viewports to focus density when layout memory is off", () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn(
      (query: string) => ({ matches: query === "(max-width: 1023px)" }) as MediaQueryList,
    );

    expect(defaultWorkspaceLayoutMode()).toBe("focus");
    expect(normalizeWorkspaceLayoutMode(null)).toBe("focus");

    globalThis.matchMedia = original;
  });

  it("preserves context while entering and returning from Teleprompt", () => {
    const review = createWorkspaceContext({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "enterprise",
      stage: "review",
      voiceProfileId: "voice-1",
    });

    const teleprompt = enterTelepromptStage(review);

    expect(teleprompt).toMatchObject({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "enterprise",
      stage: "teleprompt",
      telepromptReturnStage: "review",
      voiceProfileId: "voice-1",
    });
    expect(returnFromTelepromptStage(teleprompt).stage).toBe("review");
  });

  it("tracks stage transitions and clears stale block selection when source changes", () => {
    const context = createWorkspaceContext({
      activeBlockId: "block-1",
      sourceId: "source-1",
      sourceType: "prepared",
      stage: "preview",
    });

    expect(transitionWorkspaceStage(context, "review")).toMatchObject({
      stage: "review",
      telepromptReturnStage: "review",
    });
    expect(withWorkspaceActiveBlock(context, "block-3").activeBlockId).toBe("block-3");
    expect(withWorkspaceSource(context, "prepared", "source-1").activeBlockId).toBe("block-1");
    expect(withWorkspaceSource(context, "prepared", "source-2").activeBlockId).toBeNull();
  });

  it("exposes searchable metadata for stages and layouts", () => {
    expect(workspaceStageMeta("teleprompt").keywords).toContain("script");
    expect(workspaceLayoutModeMeta("focus").description).toContain("Collapse");
  });
});
