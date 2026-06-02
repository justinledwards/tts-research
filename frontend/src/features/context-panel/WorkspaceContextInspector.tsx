import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { StatusChipTone } from "../../design";
import type { WorkspaceStage, WorkspaceStageStatus } from "../workspace";
import { ContextPanel } from "./ContextPanel";
import {
  buildContextPanelTabs,
  type ContextPanelDisplayState,
  type ContextPanelSectionInput,
} from "./contextPanelModel";
import type { ContextPanelTabId } from "./contextPanelTabs";
import {
  DiagnosticsInspectorSection,
  HistoryInspectorSection,
  type InspectorFact,
  type InspectorNote,
  PolicyInspectorSection,
  QueueInspectorSection,
  SourceInspectorSection,
  VoiceInspectorSection,
} from "./InspectorSections";

export interface WorkspaceInspectorSourceModel {
  readonly detail: string;
  readonly importConfidence?: InspectorFact;
  readonly label: string;
  readonly metrics: readonly InspectorFact[];
  readonly scopeLabel: string;
  readonly stateLabel: string;
  readonly typeLabel: string;
}

export interface WorkspaceInspectorVoiceModel {
  readonly detail: string;
  readonly label: string;
  readonly tone?: StatusChipTone;
}

export interface WorkspaceInspectorPolicyModel {
  readonly notes: readonly InspectorNote[];
  readonly profileLabel: string;
  readonly scopeLabel: string;
}

export interface WorkspaceInspectorQueueModel {
  readonly currentSegment: number;
  readonly generatingCount: number;
  readonly readyCount: number;
  readonly totalSegments: number;
}

export interface WorkspaceInspectorAudioModel {
  readonly detail: string;
  readonly eta: string;
  readonly jobLabel: string;
  readonly lifecycleLabel: string;
  readonly queue: WorkspaceInspectorQueueModel;
  readonly tone?: StatusChipTone;
}

export interface WorkspaceInspectorDiagnosticsModel {
  readonly facts: readonly InspectorFact[];
  readonly notes: readonly InspectorNote[];
}

export interface WorkspaceInspectorReviewModel {
  readonly activeBlockDetail: string;
  readonly activeBlockLabel: string;
  readonly diagnosticsContent?: ReactNode;
  readonly policyContent?: ReactNode;
}

export interface WorkspaceInspectorTelepromptModel {
  readonly cueSyncLabel: string;
  readonly cueTimingLabel: string;
  readonly currentBlockLabel: string;
  readonly nextBlockLabel: string;
  readonly returnTargetLabel: string;
}

export interface WorkspaceInspectorHistoryModel {
  readonly facts: readonly InspectorFact[];
  readonly notes: readonly InspectorNote[];
}

export interface WorkspaceContextInspectorProps {
  readonly audio: WorkspaceInspectorAudioModel;
  readonly diagnostics: WorkspaceInspectorDiagnosticsModel;
  readonly displayState: ContextPanelDisplayState;
  readonly history: WorkspaceInspectorHistoryModel;
  readonly pinned?: boolean;
  readonly policy: WorkspaceInspectorPolicyModel;
  readonly review: WorkspaceInspectorReviewModel;
  readonly source: WorkspaceInspectorSourceModel;
  readonly stage: WorkspaceStage;
  readonly status: WorkspaceStageStatus;
  readonly teleprompt: WorkspaceInspectorTelepromptModel;
  readonly voice: WorkspaceInspectorVoiceModel;
  readonly onDisplayStateChange?: (state: ContextPanelDisplayState) => void;
  readonly onPinnedChange?: (pinned: boolean) => void;
}

const WORKSPACE_INSPECTOR_STAGE_TAB: Record<WorkspaceStage, ContextPanelTabId> = {
  intake: "overview",
  preview: "overview",
  review: "review",
  teleprompt: "review",
  theatre: "review",
};

const STAGE_LABEL: Record<WorkspaceStage, string> = {
  intake: "Intake",
  preview: "Preview",
  review: "Review",
  teleprompt: "Teleprompt",
  theatre: "Theatre",
};

export function WorkspaceContextInspector({
  audio,
  diagnostics,
  displayState,
  history,
  pinned = false,
  policy,
  review,
  source,
  stage,
  status,
  teleprompt,
  voice,
  onDisplayStateChange,
  onPinnedChange,
}: Readonly<WorkspaceContextInspectorProps>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>(
    WORKSPACE_INSPECTOR_STAGE_TAB[stage],
  );

  useEffect(() => {
    if (!pinned) {
      setActiveContextTab(WORKSPACE_INSPECTOR_STAGE_TAB[stage]);
    }
  }, [pinned, stage]);

  const tabs = useMemo(
    () =>
      buildContextPanelTabs(
        workspaceInspectorSections({
          audio,
          diagnostics,
          history,
          policy,
          review,
          source,
          stage,
          status,
          teleprompt,
          voice,
        }),
        { allowedSurfaces: ["Workspace"], owner: "workspace" },
      ),
    [audio, diagnostics, history, policy, review, source, stage, status, teleprompt, voice],
  );

  if (stage === "theatre" && displayState !== "pinned" && !pinned) {
    return null;
  }

  return (
    <ContextPanel
      activeTabId={activeContextTab}
      collapsedSummary={
        <WorkspaceInspectorCollapsedSummary audio={audio} source={source} status={status} />
      }
      displayState={displayState}
      label={`${STAGE_LABEL[stage]} inspector`}
      pinned={pinned}
      surface="Workspace"
      tabs={tabs}
      onDisplayStateChange={onDisplayStateChange}
      onPinnedChange={onPinnedChange}
      onTabChange={setActiveContextTab}
    />
  );
}

function workspaceInspectorSections({
  audio,
  diagnostics,
  history,
  policy,
  review,
  source,
  stage,
  status,
  teleprompt,
  voice,
}: Readonly<
  Pick<
    WorkspaceContextInspectorProps,
    | "audio"
    | "diagnostics"
    | "history"
    | "policy"
    | "review"
    | "source"
    | "stage"
    | "status"
    | "teleprompt"
    | "voice"
  >
>): readonly ContextPanelSectionInput[] {
  return [
    ...(status.blocker ? [criticalBlockerSection(status.blocker)] : []),
    ...(stage === "preview" ? [audioReadinessSection(audio)] : []),
    sourceSection(source, stage),
    ...(stage === "intake" && source.importConfidence
      ? [importConfidenceSection(source.importConfidence)]
      : []),
    reviewSection(review, stage, status, teleprompt),
    voiceSection(voice),
    policySection(policy, review.policyContent),
    queueSection(audio),
    diagnosticsSection(diagnostics, review.diagnosticsContent),
    historySection(history, teleprompt, stage),
  ];
}

function criticalBlockerSection(
  blocker: NonNullable<WorkspaceStageStatus["blocker"]>,
): ContextPanelSectionInput {
  return {
    children: (
      <p className="rounded-md border border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] p-3 text-xs leading-5 text-[var(--vs-text)]">
        <span className="font-semibold">{blocker.title}: </span>
        {blocker.detail}
      </p>
    ),
    detail: blocker.detail,
    id: "workspace-critical-blocker",
    kind: "narration-block-status",
    priority: "critical",
    tabId: "overview",
    title: blocker.title,
  };
}

function sourceSection(
  source: WorkspaceInspectorSourceModel,
  stage: WorkspaceStage,
): ContextPanelSectionInput {
  return {
    children: (
      <SourceInspectorSection
        facts={[
          { label: "Source", value: source.label },
          { label: "Scope", value: source.scopeLabel },
          { label: "Type", value: source.typeLabel },
          { label: "State", value: source.stateLabel },
          ...source.metrics,
        ]}
      />
    ),
    detail: source.detail,
    id: "workspace-inspector-source",
    kind: "source-provenance",
    priority: stage === "intake" ? "primary" : "secondary",
    tabId: "overview",
    title: "Source",
  };
}

function importConfidenceSection(importConfidence: InspectorFact): ContextPanelSectionInput {
  return {
    children: (
      <SourceInspectorSection
        facts={[importConfidence]}
        notes={[
          {
            detail: "Import confidence summarizes detected source metadata and preparation status.",
            label: "Detection",
          },
        ]}
      />
    ),
    detail: importConfidence.detail ?? importConfidence.value,
    id: "workspace-inspector-import-confidence",
    kind: "import-confidence",
    priority: "primary",
    tabId: "overview",
    title: "Import confidence",
  };
}

function reviewSection(
  review: WorkspaceInspectorReviewModel,
  stage: WorkspaceStage,
  status: WorkspaceStageStatus,
  teleprompt: WorkspaceInspectorTelepromptModel,
): ContextPanelSectionInput {
  const isTeleprompt = stage === "teleprompt" || stage === "theatre";
  return {
    children: (
      <SourceInspectorSection
        facts={
          isTeleprompt
            ? [
                { label: "Current", value: teleprompt.currentBlockLabel },
                { label: "Next", value: teleprompt.nextBlockLabel },
                { label: "Cue sync", value: teleprompt.cueSyncLabel },
                { label: "Cue timing", value: teleprompt.cueTimingLabel },
              ]
            : [
                { label: "Task", value: status.label },
                {
                  label: "Block",
                  value: review.activeBlockLabel,
                  detail: review.activeBlockDetail,
                },
                {
                  label: "Next",
                  value: status.currentTask.primaryLabel ?? status.currentTask.title,
                },
              ]
        }
      />
    ),
    detail: isTeleprompt ? teleprompt.cueTimingLabel : review.activeBlockDetail,
    id: "workspace-inspector-review",
    kind: "narration-block-status",
    priority: stage === "review" || isTeleprompt ? "primary" : "secondary",
    tabId: "review",
    title: isTeleprompt ? "Cue context" : "Task context",
  };
}

function audioReadinessSection(audio: WorkspaceInspectorAudioModel): ContextPanelSectionInput {
  return {
    children: (
      <QueueInspectorSection
        facts={[
          { label: "Audio", tone: audio.tone, value: audio.lifecycleLabel },
          { label: "ETA", value: audio.eta },
          { label: "Job", value: audio.jobLabel },
        ]}
      />
    ),
    detail: audio.detail,
    id: "workspace-inspector-audio-readiness",
    kind: "generated-audio-health",
    priority: "primary",
    tabId: "overview",
    title: "Preview readiness",
  };
}

function voiceSection(voice: WorkspaceInspectorVoiceModel): ContextPanelSectionInput {
  return {
    children: (
      <VoiceInspectorSection
        facts={[
          { label: "Voice", tone: voice.tone, value: voice.label },
          { label: "Detail", value: voice.detail },
        ]}
      />
    ),
    detail: voice.detail,
    id: "workspace-inspector-voice",
    kind: "voice-profile",
    priority: "secondary",
    tabId: "policy",
    title: "Voice",
  };
}

function policySection(
  policy: WorkspaceInspectorPolicyModel,
  policyContent: ReactNode,
): ContextPanelSectionInput {
  return {
    children: (
      <PolicyInspectorSection
        facts={[
          { label: "Policy", value: policy.profileLabel },
          { label: "Scope", value: policy.scopeLabel },
        ]}
        notes={policy.notes}
      >
        {policyContent}
      </PolicyInspectorSection>
    ),
    detail: policy.profileLabel,
    id: "workspace-inspector-policy",
    kind: "speech-policy",
    priority: "primary",
    tabId: "policy",
    title: "Policy",
  };
}

function queueSection(audio: WorkspaceInspectorAudioModel): ContextPanelSectionInput {
  return {
    children: (
      <QueueInspectorSection
        facts={[
          { label: "Audio", tone: audio.tone, value: audio.lifecycleLabel },
          { label: "Ready", value: audio.queue.readyCount.toString() },
          { label: "Generating", value: audio.queue.generatingCount.toString() },
          { label: "Total", value: audio.queue.totalSegments.toString() },
          { label: "Current", value: segmentValue(audio.queue.currentSegment) },
        ]}
        notes={[{ detail: audio.detail, label: "Status" }]}
      >
        <QueueBlocks queue={audio.queue} />
      </QueueInspectorSection>
    ),
    detail: audio.detail,
    id: "workspace-inspector-queue",
    kind: "generation-queue",
    priority: "primary",
    tabId: "review",
    title: "Queue",
  };
}

function diagnosticsSection(
  diagnostics: WorkspaceInspectorDiagnosticsModel,
  diagnosticsContent: ReactNode,
): ContextPanelSectionInput {
  return {
    children: (
      <DiagnosticsInspectorSection facts={diagnostics.facts} notes={diagnostics.notes}>
        {diagnosticsContent}
      </DiagnosticsInspectorSection>
    ),
    detail: diagnostics.facts[0]?.value ?? "Diagnostics",
    id: "workspace-inspector-diagnostics",
    kind: "generated-audio-health",
    priority: "advanced",
    tabId: "diagnostics",
    title: "Diagnostics",
  };
}

function historySection(
  history: WorkspaceInspectorHistoryModel,
  teleprompt: WorkspaceInspectorTelepromptModel,
  stage: WorkspaceStage,
): ContextPanelSectionInput {
  const facts =
    stage === "teleprompt" || stage === "theatre"
      ? [...history.facts, { label: "Return", value: teleprompt.returnTargetLabel }]
      : history.facts;
  return {
    children: <HistoryInspectorSection facts={facts} notes={history.notes} />,
    detail: history.notes[0]?.detail ?? "Return and recent work context",
    id: "workspace-inspector-history",
    kind: "wayfinding",
    priority: "secondary",
    tabId: "history",
    title: "History",
  };
}

function QueueBlocks({ queue }: Readonly<{ queue: WorkspaceInspectorQueueModel }>) {
  const visibleBlocks = Math.min(16, Math.max(1, queue.totalSegments));
  return (
    <div
      aria-label="Queue buffer map"
      className="grid gap-1"
      role="img"
      style={{ gridTemplateColumns: `repeat(${String(visibleBlocks)}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: visibleBlocks }).map((_, index) => {
        const segment = Math.max(1, Math.ceil(((index + 1) / visibleBlocks) * queue.totalSegments));
        const active = queue.currentSegment > 0 && segment === queue.currentSegment;
        const ready = segment <= queue.readyCount;
        const generating =
          queue.generatingCount > 0 &&
          segment > queue.readyCount &&
          segment <= queue.readyCount + queue.generatingCount;
        return (
          <span
            aria-hidden="true"
            className={`h-2.5 rounded-sm ${queueBlockClassName({ active, generating, ready })}`}
            key={`queue-${String(index)}`}
            title={`Segment ${String(segment)}`}
          />
        );
      })}
    </div>
  );
}

function queueBlockClassName({
  active,
  generating,
  ready,
}: Readonly<{
  active: boolean;
  generating: boolean;
  ready: boolean;
}>): string {
  if (active) {
    return "bg-[var(--vs-action-primary-hover)]";
  }
  if (ready) {
    return "bg-[var(--vs-theatre-accent)]";
  }
  if (generating) {
    return "bg-[var(--vs-generating)]";
  }
  return "bg-[var(--vs-border)]";
}

function WorkspaceInspectorCollapsedSummary({
  audio,
  source,
  status,
}: Readonly<{
  audio: WorkspaceInspectorAudioModel;
  source: WorkspaceInspectorSourceModel;
  status: WorkspaceStageStatus;
}>) {
  const message = status.blocker
    ? `${status.blocker.title}: ${status.blocker.detail}`
    : `${source.label} - ${audio.lifecycleLabel}`;
  return <p className="text-xs leading-5 vs-muted">{message}</p>;
}

function segmentValue(value: number): string {
  return value > 0 ? value.toString() : "n/a";
}
