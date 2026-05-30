import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_DISCLOSURE_PINS,
  resolveDisclosureStatus,
  resolveWorkspaceDisclosure,
  shouldExpandDisclosurePanel,
  workspaceDisclosureRails,
  type WorkspaceDisclosureInput,
} from "./disclosure";

describe("workspace disclosure model", () => {
  it("prioritizes warning and blocking states over pins and idle collapse", () => {
    expect(resolveDisclosureStatus({ available: true, pinned: true })).toBe("available");
    expect(resolveDisclosureStatus({ available: true, pinned: true, warning: true })).toBe(
      "warning",
    );
    expect(resolveDisclosureStatus({ active: true, blocking: true })).toBe("blocking");
    expect(resolveDisclosureStatus({ hidden: true })).toBe("hidden");
  });

  it("resolves all advanced systems from idle to task-relevant statuses", () => {
    const disclosure = resolveWorkspaceDisclosure(baseInput());

    expect(disclosure.panels.voiceCloning.status).toBe("collapsed");
    expect(disclosure.panels.diagnostics.status).toBe("available");
    expect(disclosure.panels.sourceDetails.status).toBe("active");
    expect(disclosure.panels.audioGeneration.status).toBe("collapsed");
    expect(disclosure.panels.exportImport.status).toBe("hidden");
    expect(disclosure.panels.storage.status).toBe("collapsed");
    expect(disclosure.panels.backendState.status).toBe("collapsed");
  });

  it("keeps pinned available panels expanded without suppressing warnings", () => {
    const disclosure = resolveWorkspaceDisclosure({
      ...baseInput(),
      diagnostics: { active: false, blocking: false, warning: true },
      pins: {
        ...DEFAULT_WORKSPACE_DISCLOSURE_PINS,
        audioGeneration: true,
        diagnostics: true,
      },
      audioGeneration: { lifecycle: "ready", requiresPlayback: false },
    });

    expect(disclosure.panels.audioGeneration).toMatchObject({
      pinned: true,
      status: "available",
    });
    expect(shouldExpandDisclosurePanel(disclosure.panels.audioGeneration)).toBe(true);
    expect(disclosure.panels.diagnostics.status).toBe("warning");
    expect(disclosure.attentionCount).toBe(1);
  });

  it("surfaces audio blockers and failed diagnostics before lower-priority systems", () => {
    const disclosure = resolveWorkspaceDisclosure({
      ...baseInput(),
      audioGeneration: { lifecycle: "missing", requiresPlayback: true },
      diagnostics: { active: false, blocking: false, warning: true },
      stage: "theatre",
    });

    expect(disclosure.panels.audioGeneration.status).toBe("blocking");
    expect(disclosure.highestPriorityPanel?.id).toBe("audioGeneration");
    expect(disclosure.attentionCount).toBe(2);
  });

  it("raises collapsed footer and rail density when hidden systems need attention", () => {
    const disclosure = resolveWorkspaceDisclosure({
      ...baseInput(),
      sourceDetails: {
        active: false,
        blocking: true,
        detail: "Source failed to prepare.",
        hasSource: true,
        warning: false,
      },
      voiceCloning: {
        blocking: false,
        detail: "Clone target failed.",
        status: "attention",
      },
    });

    expect(
      workspaceDisclosureRails(
        {
          activityFooterMode: "collapsed",
          leftRailMode: "collapsed",
          rightRailMode: "collapsed",
        },
        disclosure,
      ),
    ).toEqual({
      activityFooterMode: "compact",
      leftRailMode: "compact",
      rightRailMode: "compact",
    });
  });
});

function baseInput(): WorkspaceDisclosureInput {
  return {
    audioGeneration: { lifecycle: "missing", requiresPlayback: false },
    backendState: {
      active: false,
      blocking: false,
      online: true,
      warning: false,
    },
    diagnostics: {
      active: false,
      blocking: false,
      warning: false,
    },
    exportImport: {
      active: false,
      blocking: false,
      warning: false,
    },
    pins: DEFAULT_WORKSPACE_DISCLOSURE_PINS,
    sourceDetails: {
      active: false,
      blocking: false,
      hasSource: false,
      warning: false,
    },
    stage: "intake",
    storage: {
      blocking: false,
      warning: false,
    },
    voiceCloning: {
      blocking: false,
      status: "idle",
    },
  };
}
