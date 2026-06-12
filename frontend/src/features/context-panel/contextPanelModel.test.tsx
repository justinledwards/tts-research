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
        fallbackTarget: issueTarget,
        selectedTarget: { id: "missing", kind: "cue", label: "Missing cue" },
        stage: "preview",
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

  it("allows expanded inspector headings and details to wrap instead of truncating", () => {
    const longDetail =
      "Audio generated with 17 segments needing audio review. completed with 17 segment review warning(s).";
    const tabs = buildContextPanelTabs([
      {
        children: <p>{longDetail}</p>,
        detail: longDetail,
        id: "audio-review",
        kind: "narration-block-status",
        tabId: "overview",
        title: "Audio check needs review",
      },
    ]);

    const markup = renderToStaticMarkup(
      <ContextPanel
        activeTabId="overview"
        displayState="expanded"
        headingDetail={longDetail}
        headingTitle="Issue · Audio check needs review"
        surface="Workspace"
        tabs={tabs}
        onTabChange={() => null}
      />,
    );

    expect(markup).toContain(longDetail);
    expect(markup).toContain("break-words");
    expect(markup).not.toContain("line-clamp-2");
    expect(markup).not.toContain("truncate");
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

  it("defaults Preview inspector to audio recovery instead of cue text", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          audio: {
            detail:
              "12/70 segments are ready. Retry generation to create the full narration track.",
            eta: "Ready",
            jobLabel: "job-123456",
            lifecycleLabel: "Generation failed",
            queue: {
              currentSegment: 12,
              generatingCount: 0,
              readyCount: 12,
              totalSegments: 70,
            },
            tone: "warning",
          },
          stage: "preview",
          status: stageStatus({ stage: "preview" }),
        })}
        fallbackTarget={{ id: "audio-failed", kind: "issue", label: "Generation failed" }}
        targets={inspectorTargets({
          jobs: [
            {
              detail: "status=failed | terminalReason=provider_failed",
              facts: [
                { label: "Job", value: "job-123456" },
                { label: "Audio", tone: "warning", value: "Generation failed" },
              ],
              id: "job-123456",
              label: "job-123456",
              tone: "warning",
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('data-context-panel-active-tab="overview"');
    expect(markup).toContain("Issue · Generation failed");
    expect(markup).toContain("What happened");
    expect(markup).toContain("Preview readiness");
    expect(markup).toContain("Queue");
    expect(markup).not.toContain("Cue · Block 1");
  });

  it("defaults Preview inspector to audio review context for completed warned jobs", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          audio: {
            detail: "Audio generated with 1 segment needing audio review.",
            eta: "Ready",
            jobLabel: "job-123456",
            lifecycleLabel: "Audio review",
            queue: {
              currentSegment: 13,
              generatingCount: 0,
              readyCount: 70,
              totalSegments: 70,
            },
            tone: "warning",
          },
          stage: "preview",
          status: stageStatus({ stage: "preview" }),
        })}
        fallbackTarget={{ id: "job-123456", kind: "job", label: "job-123456" }}
        targets={inspectorTargets({
          jobs: [
            {
              detail: "Audio generated with 1 segment needing audio review.",
              facts: [
                { label: "Job", value: "job-123456" },
                { label: "Lifecycle", tone: "warning", value: "Audio review" },
                { label: "Audio review", tone: "warning", value: "1" },
                { label: "Ready", value: "70" },
                { label: "Total", value: "70" },
              ],
              id: "job-123456",
              label: "job-123456",
              notes: [
                {
                  detail:
                    "Segment 13: ASR validation exhausted; audio kept for review: ASR transcript did not sufficiently match",
                  label: "Segment warning",
                  tone: "warning",
                },
              ],
              tone: "warning",
            },
          ],
        })}
      />,
    );

    expect(markup).toContain('data-context-panel-active-tab="diagnostics"');
    expect(markup).toContain("Audio review");
    expect(markup).toContain("Segment 13");
    expect(markup).not.toContain("Cue · Block 1");
  });

  it("keeps explicit cue selection available in Preview", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          stage: "preview",
          status: stageStatus({ stage: "preview" }),
        })}
        fallbackTarget={{ id: "audio-failed", kind: "issue", label: "Generation failed" }}
        selectedTarget={{ id: "cue-1", kind: "cue", label: "Block 1" }}
        targets={inspectorTargets()}
      />,
    );

    expect(markup).toContain('data-context-panel-active-tab="review"');
    expect(markup).toContain("Cue detail");
    expect(markup).not.toContain("What happened");
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

  it("exposes temporary source inspector sections across workspace tabs", () => {
    const temporary = {
      artifactCount: 0,
      audioStatus: "No generated audio",
      bookmarkCount: 0,
      expiryLabel: "Expires Jun 12, 2026, 1:40 PM",
      originLabel: "Pasted text",
      policyLabel: "Session override",
      promotionItems: ["Temporary source text", "Project source pin"],
      pronunciationCount: 0,
      recentPositionCount: 0,
      repairNoteCount: 0,
      reviewEditCount: 0,
      sessionId: "tmp-123",
      skippedCount: 0,
      sourceTypeLabel: "Text",
      statusLabel: "Temporary source",
      timingConfidence: "No timing map",
      title: "Temporary Draft",
      warningCount: 0,
      warnings: [],
    } satisfies NonNullable<WorkspaceContextInspectorProps["temporary"]>;

    const overview = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          selectedTarget: { id: "draft", kind: "source", label: "Draft text" },
          targets: inspectorTargets(),
          temporary,
        })}
      />,
    );
    expect(overview).toContain("Temporary Draft");
    expect(overview).toContain("Expires Jun 12, 2026, 1:40 PM");

    const review = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          selectedTarget: { id: "cue-1", kind: "cue", label: "Block 1" },
          targets: inspectorTargets(),
          temporary,
        })}
      />,
    );
    expect(review).toContain("No review edits or repair notes exist");

    const diagnostics = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          selectedTarget: { id: "job-1", kind: "job", label: "Job 1" },
          targets: inspectorTargets({
            jobs: [
              {
                detail: "Job detail",
                facts: [{ label: "Job", value: "Queued" }],
                id: "job-1",
                label: "Job 1",
              },
            ],
          }),
          temporary,
        })}
      />,
    );
    expect(diagnostics).toContain("No generated audio, skipped content, timing map");

    const history = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          selectedTarget: null,
          stage: "teleprompt",
          temporary,
        })}
      />,
    );
    expect(history).toContain('data-testid="context-panel-Workspace-history"');

    const policy = renderToStaticMarkup(
      <WorkspaceContextInspector
        {...workspaceInspectorProps({
          selectedTarget: { id: "provider", kind: "voice", label: "Default voice" },
          targets: inspectorTargets(),
          temporary,
        })}
      />,
    );
    expect(policy).toContain("Promotion");
    expect(policy).toContain("Temporary source text, Project source pin");
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
