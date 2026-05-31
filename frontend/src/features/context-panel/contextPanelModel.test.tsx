import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceStageStatus } from "../workspace";
import { ContextPanel } from "./ContextPanel";
import { buildContextPanelTabs } from "./contextPanelModel";
import { WorkspaceContextInspector } from "./WorkspaceContextInspector";

describe("context panel inspector contract", () => {
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

  it("shows review task and queue content in the workspace inspector", () => {
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
    expect(markup).toContain("Task context");
    expect(markup).toContain("Queue");
  });
});

function stageStatus(): WorkspaceStageStatus {
  return {
    blocker: null,
    description: "Review blocks before preview.",
    inspectorTabs: ["review", "policy"],
    label: "Review blocks",
    nextAction: "previewSpeech",
    primaryAction: "previewSpeech",
    primaryLabel: "Preview speech",
    reviewState: "ready",
    reviewWarningCount: 0,
    stage: "review",
  };
}
