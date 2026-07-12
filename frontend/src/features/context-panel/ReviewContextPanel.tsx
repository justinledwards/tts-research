import { Suspense, lazy, useState, type ReactNode } from "react";
import type { PreparedSource } from "../../types";
import { LazyPanelFallback } from "../performance";
import { ContextPanel } from "./ContextPanel";
import { buildContextPanelTabs } from "./contextPanelModel";
import type { ContextPanelTabId } from "./contextPanelTabs";

const PronunciationPanel = lazy(() =>
  import("../../PronunciationPanel").then((module) => ({ default: module.PronunciationPanel })),
);

export function ReviewContextPanel({
  mathPanel,
  projectId,
  rulesPanel,
  selectedPreparedSource,
  voiceProfileId,
}: Readonly<{
  mathPanel: ReactNode;
  projectId: string;
  rulesPanel: ReactNode;
  selectedPreparedSource: PreparedSource | null;
  voiceProfileId: string;
}>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>("policy");
  const tabs = buildContextPanelTabs(
    [
      {
        children: (
          <dl className="grid gap-2 text-xs">
            <ContextFact
              label="Source"
              value={
                selectedPreparedSource?.title ??
                selectedPreparedSource?.sourceName ??
                "Draft or book source"
              }
            />
            <ContextFact label="Project" value={projectId} />
          </dl>
        ),
        detail: selectedPreparedSource
          ? selectedPreparedSource.kind.toUpperCase()
          : "Workspace text",
        id: "review-source-overview",
        kind: "source-provenance",
        tabId: "overview",
        title: "Source context",
      },
      {
        children: (
          <p className="text-xs leading-5 vs-muted">
            Search, batch actions, inline speech edits, and revision history live in the Review
            workflow. Supporting source, policy, and diagnostics details stay here.
          </p>
        ),
        detail: "Active revision workflow",
        id: "review-task-context",
        kind: "narration-block-status",
        tabId: "review",
        title: "Review task context",
      },
      {
        children: <div className="overflow-hidden rounded-md border vs-border">{rulesPanel}</div>,
        detail: "Structured speech rules",
        id: "review-policy-rules",
        kind: "speech-policy",
        tabId: "policy",
        title: "Policy rules",
      },
      ...(selectedPreparedSource
        ? [
            {
              children: (
                <div className="overflow-hidden rounded-md border vs-border">
                  <Suspense
                    fallback={
                      <LazyPanelFallback label="Loading pronunciation..." surface="pronunciation" />
                    }
                  >
                    <PronunciationPanel
                      projectId={projectId}
                      source={selectedPreparedSource}
                      voiceProfileId={voiceProfileId}
                    />
                  </Suspense>
                </div>
              ),
              detail: "Voice-specific pronunciation",
              id: "review-pronunciation",
              kind: "speech-policy" as const,
              tabId: "policy" as const,
              title: "Pronunciation",
            },
          ]
        : []),
      {
        children: <div className="overflow-hidden rounded-md border vs-border">{mathPanel}</div>,
        detail: "Math and structured speech",
        id: "review-structured-speech",
        kind: "policy-notes",
        tabId: "diagnostics",
        title: "Structured speech diagnostics",
      },
      {
        children: (
          <p className="text-xs leading-5 vs-muted">
            Return from Preview or Teleprompt keeps this same source, selected block, policy
            profile, and voice profile.
          </p>
        ),
        detail: "Review return context",
        id: "review-history",
        kind: "wayfinding",
        tabId: "history",
        title: "Review history",
      },
    ],
    { allowedSurfaces: ["Review"], owner: "review" },
  );

  return (
    <ContextPanel
      activeTabId={activeContextTab}
      label="Review context"
      surface="Review"
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
