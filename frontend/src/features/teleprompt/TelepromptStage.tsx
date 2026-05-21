import { useState, type ReactNode } from "react";
import { Button, Panel } from "../../design";
import { ContextPanel, buildContextPanelTabs, type ContextPanelTabId } from "../context-panel";
import { HeaderContextSummary } from "../header";
import { workspaceStageActionLabel, workspaceStageActionTestId } from "../workspace";

export function TelepromptStage({
  activeBlockLabel,
  canCreate,
  canOpenCinema,
  children,
  policyProfile,
  scopeLabel,
  sourceLabel,
  sourceMeta,
  voiceProfile,
  onBackToPreview,
  onBackToReview,
  onCreateAndListen,
  onOpenCinema,
}: Readonly<{
  activeBlockLabel: string;
  canCreate: boolean;
  canOpenCinema: boolean;
  children: ReactNode;
  policyProfile: string;
  scopeLabel: string;
  sourceLabel: string;
  sourceMeta: string;
  voiceProfile: string;
  onBackToPreview: () => void;
  onBackToReview: () => void;
  onCreateAndListen: () => void;
  onOpenCinema: () => void;
}>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>("overview");
  const contextTabs = buildContextPanelTabs([
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <TelepromptContextFact label="Source" value={sourceLabel} />
          <TelepromptContextFact label="Scope" value={scopeLabel} />
          <TelepromptContextFact label="Block" value={activeBlockLabel} />
        </dl>
      ),
      detail: sourceMeta,
      id: "teleprompt-source-overview",
      kind: "source-provenance",
      tabId: "overview",
      title: "Teleprompt source",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Back to Review and Back to Preview return with the same active source, block, policy,
          voice, and scope.
        </p>
      ),
      detail: "Review and Preview return paths",
      id: "teleprompt-return-review",
      kind: "narration-block-status",
      tabId: "review",
      title: "Return context",
    },
    {
      children: (
        <dl className="grid gap-2 text-xs">
          <TelepromptContextFact label="Policy" value={policyProfile} />
          <TelepromptContextFact label="Voice" value={voiceProfile} />
        </dl>
      ),
      detail: `${policyProfile} · ${voiceProfile}`,
      id: "teleprompt-policy",
      kind: "speech-policy",
      tabId: "policy",
      title: "Speech policy",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Generated-audio diagnostics appear after Create & Listen. Teleprompt stays focused on the
          spoken prompt until audio exists.
        </p>
      ),
      detail: "Waiting for generated audio",
      id: "teleprompt-diagnostics",
      kind: "generated-audio-health",
      tabId: "diagnostics",
      title: "Generated audio health",
    },
    {
      children: (
        <p className="text-xs leading-5 vs-muted">
          Preview is the normal return path before creating audio; Review remains one step farther
          back for block and policy edits.
        </p>
      ),
      detail: "Preview and Review",
      id: "teleprompt-history",
      kind: "wayfinding",
      tabId: "history",
      title: "Return history",
    },
  ]);

  return (
    <Panel className="grid gap-3 p-4" variant="raised">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <HeaderContextSummary
          className="flex-1"
          metadata={[
            { label: "Policy", value: policyProfile },
            { label: "Voice", value: voiceProfile },
            { label: "Block", value: activeBlockLabel },
            { label: "Size", value: sourceMeta },
          ]}
          scopeTitle={scopeLabel}
          sourceTitle={sourceLabel}
          stateLabel="Teleprompt"
          surfaceName="Teleprompt Stage"
        />
        <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            data-testid={workspaceStageActionTestId("reviewBlocks")}
            onClick={onBackToReview}
            size="sm"
            variant="secondary"
          >
            Back to Review
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            data-testid={workspaceStageActionTestId("previewSpeech")}
            onClick={onBackToPreview}
            size="sm"
            variant="secondary"
          >
            Back to Preview
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            disabledReason={canOpenCinema ? undefined : "Create audio before opening Cinema."}
            data-testid={workspaceStageActionTestId("openCinema")}
            disabled={!canOpenCinema}
            onClick={onOpenCinema}
            size="sm"
            variant="soft"
          >
            {workspaceStageActionLabel("openCinema")}
          </Button>
          <Button
            className="flex-1 whitespace-nowrap sm:flex-none"
            disabledReason={canCreate ? undefined : "Select a ready source before creating audio."}
            data-testid={workspaceStageActionTestId("createAndListen")}
            disabled={!canCreate}
            onClick={onCreateAndListen}
            size="sm"
            variant="primary"
          >
            {workspaceStageActionLabel("createAndListen")}
          </Button>
        </div>
      </div>
      {children}
      <ContextPanel
        activeTabId={activeContextTab}
        label="Teleprompt context"
        surface="Teleprompt"
        tabs={contextTabs}
        onTabChange={setActiveContextTab}
      />
    </Panel>
  );
}

function TelepromptContextFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}
