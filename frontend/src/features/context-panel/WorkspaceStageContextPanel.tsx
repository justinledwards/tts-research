import { useState } from "react";
import { ContextPanel } from "./ContextPanel";
import { buildContextPanelTabs } from "./contextPanelModel";
import type { ContextPanelTabId } from "./contextPanelTabs";

export type WorkspaceStageContextStage = "intake" | "preview" | "review" | "teleprompt";

export function WorkspaceStageContextPanel({
  policyProfile,
  sourceLabel,
  stage,
}: Readonly<{
  policyProfile: string;
  sourceLabel: string;
  stage: WorkspaceStageContextStage;
}>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>("overview");
  const stageLabel: Record<WorkspaceStageContextStage, string> = {
    intake: "Intake",
    preview: "Preview",
    review: "Review",
    teleprompt: "Teleprompt",
  };
  const tabs = buildContextPanelTabs([
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <ContextFact label="Source" value={sourceLabel} />
          <ContextFact label="Stage" value={stageLabel[stage]} />
        </dl>
      ),
      detail: `${stageLabel[stage]} is active`,
      id: "workspace-source-overview",
      kind: "source-provenance",
      tabId: "overview",
      title: "Workspace source",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Review, Preview, and Teleprompt preserve the same source, block, voice, and policy until
          Create & Listen starts playback.
        </p>
      ),
      detail: "Stage continuity",
      id: "workspace-review-context",
      kind: "narration-block-status",
      tabId: "review",
      title: "Review context",
    },
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <ContextFact label="Policy" value={policyProfile} />
          <ContextFact label="Scope" value="Current stage" />
        </dl>
      ),
      detail: policyProfile,
      id: "workspace-policy-context",
      kind: "speech-policy",
      tabId: "policy",
      title: "Speech policy",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Playback diagnostics appear here after Create & Listen starts. Operator Debug details stay
          behind Diagnostics.
        </p>
      ),
      detail: "Waiting for audio",
      id: "workspace-audio-diagnostics",
      kind: "generated-audio-health",
      tabId: "diagnostics",
      title: "Generated audio health",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Teleprompt return paths preserve the current Review and Preview context for this source.
        </p>
      ),
      detail: "Return context",
      id: "workspace-history-context",
      kind: "wayfinding",
      tabId: "history",
      title: "Return history",
    },
  ]);

  return (
    <ContextPanel
      activeTabId={activeContextTab}
      label={`${stageLabel[stage]} context`}
      surface="Workspace"
      tabs={tabs}
      onTabChange={setActiveContextTab}
    />
  );
}

function ContextFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
