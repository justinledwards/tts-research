import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceStageStatus, type WorkspaceStageStatus } from "../workspace";
import { ContextPanel } from "./ContextPanel";
import { buildContextPanelTabs } from "./contextPanelModel";
import {
  WorkspaceContextInspector,
  type WorkspaceContextInspectorProps,
} from "./WorkspaceContextInspector";
import {
  resolveWorkspaceInspectorTarget,
  type WorkspaceInspectorContextTargets,
  type WorkspaceInspectorTarget,
} from "./workspaceInspectorTarget";

describe("context panel inspector contract", () => {
  it("resolves selected and pinned targets before stage fallback", () => {
    const cueTarget: WorkspaceInspectorTarget = { id: "cue-1", kind: "cue", label: "Block 1" };
    const issueTarget: WorkspaceInspectorTarget = {
      id: "audio-failed",
      kind: "issue",
      label: "Generation failed",
    };
    const targets = inspectorTargets();

    expect(
      resolveWorkspaceInspectorTarget({
        selectedTarget: cueTarget,
        stage: "review",
        targets,
      }).target,
    ).toEqual(cueTarget);
    expect(
      resolveWorkspaceInspectorTarget({
        pinnedTarget: issueTarget,
        selectedTarget: cueTarget,
        stage: "review",
        targets,
      }).target,
    ).toEqual(issueTarget);
    expect(
      resolveWorkspaceInspectorTarget({
        selectedTarget: { id: "missing", kind: "cue", label: "Missing cue" },
        stage: "preview",
        targets,
      }).target,
    ).toMatchObject({ kind: "stage", stage: "preview" });
  });

  it("keeps invalid pinned targets visible while falling back to the active stage", () => {
    const resolved = resolveWorkspaceInspectorTarget({
      pinnedTarget: { id: "gone", kind: "cue", label: "Deleted cue" },
      stage: "review",
      targets: inspectorTargets(),
    });

    expect(resolved.invalidPinnedTarget).toMatchObject({ label: "Deleted cue" });
    expect(resolved.target).toMatchObject({ kind: "stage", stage: "review" });
  });

  it("orders sections by inspector priority", () => {
    const tabs = buildContextPanelTabs([
      {
        children: <p>Secondary source</p>,
        detail: "Source",
        id: "source",
        kind: "source-provenance",
        priority: "secondary",
        tabId: "overview",
        title: "Source",
      },
      {
        children: <p>Blocking issue</p>,
        detail: "Blocked",
        id: "blocker",
        kind: "narration-block-status",
        priority: "critical",
        tabId: "overview",
        title: "Blocker",
      },
    ]);

    expect(tabs[0]?.sections.map((section) => section.title)).toEqual(["Blocker", "Source"]);
  });

  it("renders a collapsed inspector affordance without section chrome", () => {
    const tabs = buildContextPanelTabs([
      {
        children: <p>Voice details</p>,
        detail: "Selected voice",
        id: "voice",
        kind: "voice-profile",
        tabId: "policy",
        title: "Voice",
      },
    ]);

    const markup = renderToStaticMarkup(
      <ContextPanel
        activeTabId="policy"
        displayState="collapsed"
        surface="Workspace"
        tabs={tabs}
        onDisplayStateChange={() => null}
        onTabChange={() => null}
      />,
    );

    expect(markup).toContain('data-context-panel-display-state="collapsed"');
    expect(markup).toContain("Inspector");
    expect(markup).toContain("Expand Inspector");
    expect(markup).not.toContain("Voice details");
  });

  it("shows scoped review task content in the workspace inspector", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        audio={{
          detail: "Ready to create audio.",
          eta: "n/a",
          jobLabel: "None",
          lifecycleLabel: "Missing",
          queue: {
            currentSegment: 0,
            generatingCount: 0,
            readyCount: 0,
            totalSegments: 0,
          },
          tone: "neutral",
        }}
        diagnostics={{ facts: [{ label: "Backend", value: "Ready" }], notes: [] }}
        displayState="expanded"
        history={{ facts: [{ label: "Stage", value: "Review" }], notes: [] }}
        policy={{ notes: [], profileLabel: "Default", scopeLabel: "project" }}
        review={{
          activeBlockDetail: "1 of 3",
          activeBlockLabel: "Block 1",
        }}
        source={{
          detail: "Draft text",
          label: "Draft text",
          metrics: [{ label: "Words", value: "120" }],
          scopeLabel: "Draft text",
          stateLabel: "reviewable",
          typeLabel: "draft",
        }}
        stage="review"
        status={stageStatus()}
        teleprompt={{
          cueSyncLabel: "Manual",
          cueTimingLabel: "15s",
          currentBlockLabel: "Block 1",
          nextBlockLabel: "Block 2",
          returnTargetLabel: "Review",
        }}
        voice={{ detail: "Provider voice", label: "Default voice" }}
      />,
    );

    expect(markup).toContain('data-context-panel-surface="Workspace"');
    expect(markup).toContain('data-context-panel-active-tab="review"');
    expect(markup).toContain("Stage · Review");
    expect(markup).toContain("Task context");
    expect(markup).not.toContain("Queue and readiness");
  });

  it("collapses to selected cue identity instead of repeating status dashboard content", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps()}
        displayState="collapsed"
        selectedTarget={{ id: "cue-1", kind: "cue", label: "Block 1" }}
        targets={inspectorTargets()}
      />,
    );

    expect(markup).toContain("Cue · Block 1 · 15s");
    expect(markup).toContain("Expand Inspector");
    expect(markup).not.toContain("Queue and readiness");
    expect(markup).not.toContain("Voice details");
  });

  it("shows issue detail copy when a status chip target is selected", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps()}
        selectedTarget={{ id: "audio-failed", kind: "issue", label: "Generation failed" }}
        targets={inspectorTargets()}
      />,
    );

    expect(markup).toContain("Issue · Generation failed");
    expect(markup).toContain("What happened");
    expect(markup).toContain("Why it matters");
    expect(markup).toContain("Next step");
    expect(markup).toContain("Provider failed.");
  });

  it("keeps stage blockers visible when pinned to another object", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          status: stageStatus({
            blocker: {
              correctiveAction: "retryGeneration",
              detail: "Retry generation before playback.",
              id: "generationFailed",
              title: "Generation failed",
            },
          }),
        })}
        pinned
        pinnedTarget={{ id: "missing-cue", kind: "cue", label: "Deleted cue" }}
        targets={inspectorTargets({ cues: [] })}
      />,
    );

    expect(markup).toContain("Pinned item unavailable");
    expect(markup).toContain("Generation failed");
    expect(markup).toContain("Retry generation before playback.");
  });
});

function stageStatus(overrides: Partial<WorkspaceStageStatus> = {}): WorkspaceStageStatus {
  return {
    ...resolveWorkspaceStageStatus({
      audioLifecycle: "missing",
      canCreate: true,
      canOpenCinema: false,
      hasListenerText: true,
      hasSource: true,
      hasVoice: true,
      sourcePreparing: false,
      stage: "review",
    }),
    ...overrides,
  };
}

function workspaceInspectorProps(
  overrides: Partial<WorkspaceContextInspectorProps> = {},
): WorkspaceContextInspectorProps {
  return {
    audio: {
      detail: "Queue and readiness",
      eta: "n/a",
      jobLabel: "None",
      lifecycleLabel: "Missing",
      queue: {
        currentSegment: 0,
        generatingCount: 0,
        readyCount: 0,
        totalSegments: 0,
      },
      tone: "neutral",
    },
    diagnostics: { facts: [{ label: "Backend", value: "Ready" }], notes: [] },
    displayState: "expanded",
    history: { facts: [{ label: "Stage", value: "Review" }], notes: [] },
    policy: { notes: [], profileLabel: "Default", scopeLabel: "project" },
    review: {
      activeBlockDetail: "1 of 3",
      activeBlockLabel: "Block 1",
    },
    source: {
      detail: "Draft text",
      label: "Draft text",
      metrics: [{ label: "Words", value: "120" }],
      scopeLabel: "Draft text",
      stateLabel: "reviewable",
      typeLabel: "draft",
    },
    stage: "review",
    status: stageStatus(),
    teleprompt: {
      cueSyncLabel: "Manual",
      cueTimingLabel: "15s",
      currentBlockLabel: "Block 1",
      nextBlockLabel: "Block 2",
      returnTargetLabel: "Review",
    },
    voice: { detail: "Voice details", label: "Default voice" },
    ...overrides,
  };
}

function inspectorTargets(
  overrides: Partial<WorkspaceInspectorContextTargets> = {},
): WorkspaceInspectorContextTargets {
  return {
    cues: [
      {
        detail: "Cue detail",
        facts: [
          { label: "Cue", value: "Block 1" },
          { label: "Duration", value: "15s" },
        ],
        id: "cue-1",
        label: "Block 1",
        timingLabel: "15s",
      },
    ],
    issues: [
      {
        blocksCurrentStage: true,
        chipValue: "Failed",
        condition: "failed",
        detail: "Provider failed.",
        id: "audio-failed",
        label: "Generation failed",
        owner: "audio",
        recovery: {
          available: true,
          id: "retryGeneration",
          label: "Retry generation",
        },
        severity: "error",
        technicalDetail: "terminalReason=provider_failed",
      },
    ],
    jobs: [],
    source: { id: "draft", kind: "source", label: "Draft text" },
    voice: { id: "provider", kind: "voice", label: "Default voice" },
    ...overrides,
  };
}
