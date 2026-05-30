import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
  createWorkspaceContext,
  defaultWorkspaceLayoutMode,
  enterTelepromptStage,
  enterTheatreStage,
  normalizeWorkspaceCustomLayout,
  normalizeWorkspaceLayoutMode,
  normalizeWorkspaceStage,
  returnFromTelepromptStage,
  returnFromTheatreStage,
  transitionWorkspaceStage,
  withWorkspaceActiveBlock,
  withWorkspaceSource,
  workspaceLayoutModeMeta,
  workspaceLayoutRails,
  workspaceResolvedLayout,
  workspaceStageMeta,
} from "./model";
import {
  transitionWorkspaceContextForStageAction,
  resolveWorkspaceStageStatus,
  workspaceStageActionLabel,
  workspaceStageNavigationAction,
  workspaceStagePrimaryAction,
} from "./stageActions";

describe("workspace stage model", () => {
  it("normalizes legacy and unknown stage values", () => {
    expect(normalizeWorkspaceStage("sourceIntake")).toBe("intake");
    expect(normalizeWorkspaceStage("review")).toBe("review");
    expect(normalizeWorkspaceStage("teleprompt")).toBe("teleprompt");
    expect(normalizeWorkspaceStage("theatre")).toBe("theatre");
    expect(normalizeWorkspaceStage("old")).toBe("intake");
  });

  it("uses balanced layout as the default shell density", () => {
    expect(normalizeWorkspaceLayoutMode(null)).toBe("balanced");
    expect(defaultWorkspaceLayoutMode()).toBe("balanced");
    expect(workspaceLayoutRails("balanced")).toEqual({
      activityFooterMode: "collapsed",
      leftRailMode: "collapsed",
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
  });

  it("maps custom layout pins through the global workspace layout", () => {
    expect(workspaceResolvedLayout("balanced")).toEqual({
      contextInspector: "summary",
      layoutMode: "balanced",
      sourceContext: "hidden",
      systemStatus: "hidden",
    });
    expect(workspaceResolvedLayout("custom", DEFAULT_WORKSPACE_CUSTOM_LAYOUT)).toEqual({
      ...DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
      layoutMode: "custom",
    });
    expect(
      workspaceLayoutRails("custom", {
        contextInspector: "pinned",
        sourceContext: "summary",
        systemStatus: "pinned",
      }),
    ).toEqual({
      activityFooterMode: "full",
      leftRailMode: "compact",
      rightRailMode: "full",
    });
    expect(normalizeWorkspaceCustomLayout({ contextInspector: "bad" })).toEqual(
      DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
    );
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

  it("preserves return context while entering and leaving Theatre", () => {
    const preview = createWorkspaceContext({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      stage: "preview",
    });

    const theatre = enterTheatreStage(preview);

    expect(theatre).toMatchObject({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      stage: "theatre",
      telepromptReturnStage: "preview",
    });
    expect(returnFromTheatreStage(theatre).stage).toBe("preview");
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
    expect(workspaceStageMeta("theatre").keywords).toContain("immersive");
    expect(workspaceLayoutModeMeta("focus").description).toContain("Collapse");
    expect(workspaceLayoutModeMeta("custom").keywords).toContain("pins");
  });

  it("centralizes stage action labels, primary actions, and transitions", () => {
    const context = createWorkspaceContext({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "policy-1",
      stage: "review",
      voiceProfileId: "voice-1",
    });

    expect(workspaceStageActionLabel("createAndListen")).toBe("Create & Listen");
    expect(workspaceStageActionLabel("previewSpeech")).toBe("Preview Speech");
    expect(workspaceStageNavigationAction("preview")).toBe("previewSpeech");
    expect(workspaceStageNavigationAction("theatre")).toBe("openTheatre");
    expect(workspaceStagePrimaryAction("review")).toBe("previewSpeech");
    expect(workspaceStagePrimaryAction("teleprompt")).toBe("openTheatre");
    expect(workspaceStagePrimaryAction("theatre")).toBe("createAndListen");

    const preview = transitionWorkspaceContextForStageAction(context, "previewSpeech");
    expect(preview).toMatchObject({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "policy-1",
      stage: "preview",
      telepromptReturnStage: "preview",
      voiceProfileId: "voice-1",
    });

    const teleprompt = transitionWorkspaceContextForStageAction(preview, "openTeleprompt");
    expect(teleprompt).toMatchObject({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "policy-1",
      stage: "teleprompt",
      telepromptReturnStage: "preview",
      voiceProfileId: "voice-1",
    });

    const theatre = transitionWorkspaceContextForStageAction(teleprompt, "openTheatre");
    expect(theatre).toMatchObject({
      activeBlockId: "block-2",
      sourceId: "source-1",
      sourceType: "prepared",
      speechPolicyProfile: "policy-1",
      stage: "theatre",
      telepromptReturnStage: "preview",
      voiceProfileId: "voice-1",
    });
  });

  it("derives task-first stage status, blockers, and inspector tabs", () => {
    const waiting = resolveWorkspaceStageStatus({
      audioLifecycle: "missing",
      canCreate: false,
      canOpenCinema: false,
      hasSource: false,
      hasVoice: true,
      sourcePreparing: false,
      stage: "preview",
    });

    expect(waiting.blocker).toMatchObject({
      correctiveAction: "intakeSource",
      id: "waitingForSource",
    });
    expect(waiting.primaryAction).toBe("intakeSource");
    expect(waiting.inspectorTabs).toContain("diagnostics");

    const theatre = resolveWorkspaceStageStatus({
      audioLifecycle: "ready",
      canCreate: true,
      canOpenCinema: true,
      hasSource: true,
      hasVoice: true,
      sourcePreparing: false,
      stage: "theatre",
    });

    expect(theatre.blocker).toBeNull();
    expect(theatre.primaryAction).toBe("playPauseTheatre");
    expect(theatre.nextAction).toBe("openCinema");
  });
});
