import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { StatusChipTone } from "../../design";
import { operationalIssueTone, type OperationalStatusIssue } from "../operational-status";
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
import {
  contextPanelTabForWorkspaceInspectorTarget,
  resolveWorkspaceInspectorTarget,
  type WorkspaceInspectorContextTargets,
  type WorkspaceInspectorCueDetail,
  type WorkspaceInspectorJobDetail,
  type WorkspaceInspectorResolvedTarget,
  type WorkspaceInspectorTarget,
} from "./workspaceInspectorTarget";

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
  readonly fallbackTarget?: WorkspaceInspectorTarget | null;
  readonly history: WorkspaceInspectorHistoryModel;
  readonly pinned?: boolean;
  readonly pinnedTarget?: WorkspaceInspectorTarget | null;
  readonly policy: WorkspaceInspectorPolicyModel;
  readonly review: WorkspaceInspectorReviewModel;
  readonly selectedTarget?: WorkspaceInspectorTarget | null;
  readonly source: WorkspaceInspectorSourceModel;
  readonly stage: WorkspaceStage;
  readonly status: WorkspaceStageStatus;
  readonly targets?: WorkspaceInspectorContextTargets;
  readonly teleprompt: WorkspaceInspectorTelepromptModel;
  readonly voice: WorkspaceInspectorVoiceModel;
  readonly onDisplayStateChange?: (state: ContextPanelDisplayState) => void;
  readonly onPinnedChange?: (pinned: boolean) => void;
  readonly onPinnedTargetChange?: (target: WorkspaceInspectorTarget | null) => void;
}

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
  fallbackTarget,
  history,
  pinned = false,
  pinnedTarget,
  policy,
  review,
  selectedTarget,
  source,
  stage,
  status,
  targets,
  teleprompt,
  voice,
  onDisplayStateChange,
  onPinnedChange,
  onPinnedTargetChange,
}: Readonly<WorkspaceContextInspectorProps>) {
  const contextTargets = useMemo(
    () =>
      targets ??
      defaultWorkspaceInspectorTargets({
        audio,
        review,
        source,
        voice,
      }),
    [audio, review, source, targets, voice],
  );
  const resolvedTarget = useMemo(
    () =>
      resolveWorkspaceInspectorTarget({
        pinnedTarget: pinned ? pinnedTarget : null,
        fallbackTarget,
        selectedTarget,
        stage,
        targets: contextTargets,
      }),
    [contextTargets, fallbackTarget, pinned, pinnedTarget, selectedTarget, stage],
  );
  const resolvedTargetTab = contextPanelTabForWorkspaceInspectorTarget(resolvedTarget.target);
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>(resolvedTargetTab);

  useEffect(() => {
    if (!pinned) {
      setActiveContextTab(resolvedTargetTab);
    }
  }, [pinned, resolvedTargetTab]);

  const tabs = useMemo(
    () =>
      buildContextPanelTabs(
        workspaceInspectorSections({
          audio,
          contextTargets,
          diagnostics,
          history,
          policy,
          review,
          resolvedTarget,
          source,
          stage,
          status,
          teleprompt,
          voice,
        }),
        { allowedSurfaces: ["Workspace"], owner: "workspace" },
      ),
    [
      audio,
      contextTargets,
      diagnostics,
      history,
      policy,
      resolvedTarget,
      review,
      source,
      stage,
      status,
      teleprompt,
      voice,
    ],
  );
  const heading = workspaceInspectorHeading(resolvedTarget, contextTargets, stage);

  if (stage === "theatre" && displayState !== "pinned" && !pinned) {
    return null;
  }

  return (
    <ContextPanel
      activeTabId={activeContextTab}
      collapsedSummary={
        <WorkspaceInspectorCollapsedSummary
          audio={audio}
          contextTargets={contextTargets}
          resolvedTarget={resolvedTarget}
          source={source}
          status={status}
          teleprompt={teleprompt}
        />
      }
      displayState={displayState}
      headingDetail={heading.detail}
      headingTitle={heading.title}
      label={`${STAGE_LABEL[stage]} inspector`}
      pinned={pinned}
      surface="Workspace"
      tabs={tabs}
      onDisplayStateChange={onDisplayStateChange}
      onPinnedChange={(nextPinned) => {
        onPinnedTargetChange?.(nextPinned ? resolvedTarget.target : null);
        onPinnedChange?.(nextPinned);
      }}
      onTabChange={setActiveContextTab}
    />
  );
}

function workspaceInspectorSections({
  audio,
  contextTargets,
  diagnostics,
  history,
  policy,
  review,
  resolvedTarget,
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
  > & {
    contextTargets: WorkspaceInspectorContextTargets;
    resolvedTarget: WorkspaceInspectorResolvedTarget;
  }
>): readonly ContextPanelSectionInput[] {
  const stageSections = () =>
    workspaceInspectorStageSections({
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
    });
  if (resolvedTarget.invalidPinnedTarget) {
    return [invalidPinnedTargetSection(resolvedTarget.invalidPinnedTarget), ...stageSections()];
  }
  switch (resolvedTarget.target.kind) {
    case "cue": {
      const cue = contextTargets.cues.find((item) => item.id === resolvedTarget.target.id);
      return cue
        ? [cueDetailSection(cue), policySection(policy, review.policyContent)]
        : stageSections();
    }
    case "issue": {
      const issue = contextTargets.issues.find((item) => item.id === resolvedTarget.target.id);
      return issue
        ? issueInspectorSections({
            audio,
            diagnostics,
            diagnosticsContent: review.diagnosticsContent,
            issue,
            stage,
          })
        : stageSections();
    }
    case "job": {
      const job = contextTargets.jobs.find((item) => item.id === resolvedTarget.target.id);
      return job
        ? [
            jobDetailSection(job),
            queueSection(audio),
            diagnosticsSection(diagnostics, review.diagnosticsContent),
          ]
        : stageSections();
    }
    case "source": {
      return [
        sourceSection(source, stage),
        ...(source.importConfidence ? [importConfidenceSection(source.importConfidence)] : []),
      ];
    }
    case "stage": {
      return stageSections();
    }
    case "voice": {
      return [voiceSection(voice), policySection(policy, review.policyContent)];
    }
  }
  const exhaustive: never = resolvedTarget.target;
  return exhaustive;
}

function issueInspectorSections({
  audio,
  diagnostics,
  diagnosticsContent,
  issue,
  stage,
}: Readonly<{
  audio: WorkspaceInspectorAudioModel;
  diagnostics: WorkspaceInspectorDiagnosticsModel;
  diagnosticsContent: ReactNode;
  issue: OperationalStatusIssue;
  stage: WorkspaceStage;
}>): readonly ContextPanelSectionInput[] {
  if (issue.owner !== "audio" || stage !== "preview") {
    return [issueDetailSection(issue)];
  }
  return [
    issueDetailSection(issue),
    audioReadinessSection(audio),
    queueSection(audio, "overview"),
    ...(diagnosticsHasContent(diagnostics, diagnosticsContent)
      ? [diagnosticsSection(diagnostics, diagnosticsContent)]
      : []),
  ];
}

function workspaceInspectorStageSections({
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
  const blockerSections = status.blocker ? [criticalBlockerSection(status.blocker)] : [];
  if (stage === "intake") {
    return [
      ...blockerSections,
      sourceSection(source, stage),
      ...(source.importConfidence ? [importConfidenceSection(source.importConfidence)] : []),
      policySection(policy, review.policyContent),
      historySection(history, teleprompt, stage),
    ];
  }
  if (stage === "preview") {
    return [
      ...blockerSections,
      audioReadinessSection(audio),
      voiceSection(voice),
      policySection(policy, review.policyContent),
      ...(diagnosticsHasContent(diagnostics, review.diagnosticsContent)
        ? [diagnosticsSection(diagnostics, review.diagnosticsContent)]
        : []),
    ];
  }
  if (stage === "review") {
    return [
      ...blockerSections,
      reviewSection(review, stage, status, teleprompt),
      policySection(policy, review.policyContent),
      ...(diagnosticsHasContent(diagnostics, review.diagnosticsContent)
        ? [diagnosticsSection(diagnostics, review.diagnosticsContent)]
        : []),
    ];
  }
  return [
    ...blockerSections,
    reviewSection(review, stage, status, teleprompt),
    historySection(history, teleprompt, stage),
    ...(stage === "theatre" && diagnosticsHasContent(diagnostics, review.diagnosticsContent)
      ? [diagnosticsSection(diagnostics, review.diagnosticsContent)]
      : []),
  ];
}

function criticalBlockerSection(
  blocker: NonNullable<WorkspaceStageStatus["blocker"]>,
): ContextPanelSectionInput {
  return {
    children: (
      <div className="grid gap-2 rounded-md border border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] p-3 text-xs leading-5 text-[var(--vs-text)]">
        <p>
          <span className="font-semibold">{blocker.title}: </span>
          {blocker.detail}
        </p>
        <dl className="grid gap-1">
          <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
            <dt className="font-semibold">Recovery</dt>
            <dd className="min-w-0">
              {blocker.recovery?.available
                ? blocker.recovery.label
                : (blocker.recovery?.unavailableReason ?? "No action available")}
            </dd>
          </div>
          {blocker.technicalDetail ? (
            <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
              <dt className="font-semibold">Detail</dt>
              <dd className="min-w-0 break-words">{blocker.technicalDetail}</dd>
            </div>
          ) : null}
        </dl>
      </div>
    ),
    detail: blocker.detail,
    id: "workspace-critical-blocker",
    kind: "narration-block-status",
    priority: "critical",
    tabId: "overview",
    title: blocker.title,
  };
}

function issueDetailSection(issue: OperationalStatusIssue): ContextPanelSectionInput {
  return {
    children: (
      <SourceInspectorSection
        facts={[
          { label: "What happened", tone: operationalIssueTone(issue), value: issue.label },
          {
            label: "Why it matters",
            value: issueImpactLabel(issue),
          },
          {
            label: "Next step",
            value: issue.recovery.available
              ? issue.recovery.label
              : (issue.recovery.unavailableReason ?? "No action available"),
          },
          ...(issue.technicalDetail
            ? [{ label: "Technical detail", value: issue.technicalDetail }]
            : []),
        ]}
        notes={[{ detail: issue.detail, label: "Explanation", tone: operationalIssueTone(issue) }]}
      />
    ),
    detail: issue.detail,
    id: `workspace-inspector-issue-${issue.id}`,
    kind: "narration-block-status",
    priority: issue.blocksCurrentStage ? "critical" : "primary",
    tabId: "overview",
    title: issue.label,
  };
}

function issueImpactLabel(issue: OperationalStatusIssue): string {
  if (issue.blocksCurrentStage) {
    return "Blocks the current stage";
  }
  if (issue.severity === "ok") {
    return "No action needed";
  }
  return "Affects quality or readiness";
}

function cueDetailSection(cue: WorkspaceInspectorCueDetail): ContextPanelSectionInput {
  return {
    children: <SourceInspectorSection facts={cue.facts} notes={cue.notes ?? []} />,
    detail: cue.detail,
    id: `workspace-inspector-cue-${cue.id}`,
    kind: "current-passage",
    priority: "primary",
    tabId: "review",
    title: cue.label,
  };
}

function jobDetailSection(job: WorkspaceInspectorJobDetail): ContextPanelSectionInput {
  return {
    children: (
      <QueueInspectorSection
        facts={job.facts}
        notes={job.notes ?? [{ detail: job.detail, label: "Job" }]}
      />
    ),
    detail: job.detail,
    id: `workspace-inspector-job-${job.id}`,
    kind: "generated-audio-health",
    priority: "primary",
    tabId: "diagnostics",
    title: job.label,
  };
}

function invalidPinnedTargetSection(target: WorkspaceInspectorTarget): ContextPanelSectionInput {
  return {
    children: (
      <SourceInspectorSection
        facts={[
          { label: "Pinned item", value: `${targetKindLabel(target.kind)} · ${target.label}` },
          { label: "State", tone: "warning", value: "No longer available" },
        ]}
        notes={[
          {
            detail: "The active stage summary is still shown below so work can continue.",
            label: "Fallback",
            tone: "warning",
          },
        ]}
      />
    ),
    detail: "Pinned item is no longer available.",
    id: `workspace-inspector-invalid-${target.kind}-${target.id}`,
    kind: "wayfinding",
    priority: "critical",
    tabId: "overview",
    title: "Pinned item unavailable",
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

function queueSection(
  audio: WorkspaceInspectorAudioModel,
  tabId: ContextPanelTabId = "review",
): ContextPanelSectionInput {
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
    tabId,
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

function defaultWorkspaceInspectorTargets({
  audio,
  review,
  source,
  voice,
}: Readonly<{
  audio: WorkspaceInspectorAudioModel;
  review: WorkspaceInspectorReviewModel;
  source: WorkspaceInspectorSourceModel;
  voice: WorkspaceInspectorVoiceModel;
}>): WorkspaceInspectorContextTargets {
  return {
    cues: [
      {
        detail: review.activeBlockDetail,
        facts: [
          { label: "Cue", value: review.activeBlockLabel },
          { label: "Position", value: review.activeBlockDetail },
        ],
        id: review.activeBlockLabel,
        label: review.activeBlockLabel,
        timingLabel: review.activeBlockDetail,
      },
    ],
    issues: [],
    jobs:
      audio.jobLabel === "None"
        ? []
        : [
            {
              detail: audio.detail,
              facts: [
                { label: "Job", value: audio.jobLabel },
                { label: "Audio", tone: audio.tone, value: audio.lifecycleLabel },
              ],
              id: audio.jobLabel,
              label: audio.jobLabel,
              tone: audio.tone,
            },
          ],
    source: source.label
      ? {
          id: source.label,
          kind: "source",
          label: source.label,
        }
      : null,
    voice: voice.label
      ? {
          id: voice.label,
          kind: "voice",
          label: voice.label,
        }
      : null,
  };
}

function workspaceInspectorHeading(
  resolvedTarget: WorkspaceInspectorResolvedTarget,
  targets: WorkspaceInspectorContextTargets,
  stage: WorkspaceStage,
): Readonly<{ detail: string; title: string }> {
  if (resolvedTarget.invalidPinnedTarget) {
    return {
      detail: "Pinned item is no longer available. Active stage context remains below.",
      title: "Pinned item unavailable",
    };
  }
  const target = resolvedTarget.target;
  if (target.kind === "stage") {
    return {
      detail: stageTargetDetail(stage),
      title: `Stage · ${STAGE_LABEL[stage]}`,
    };
  }
  return {
    detail: targetDetail(target, targets),
    title: `${targetKindLabel(target.kind)} · ${target.label}`,
  };
}

function targetDetail(
  target: WorkspaceInspectorTarget,
  targets: WorkspaceInspectorContextTargets,
): string {
  if (target.kind === "cue") {
    return targets.cues.find((cue) => cue.id === target.id)?.detail ?? target.label;
  }
  if (target.kind === "issue") {
    return targets.issues.find((issue) => issue.id === target.id)?.detail ?? target.label;
  }
  if (target.kind === "job") {
    return targets.jobs.find((job) => job.id === target.id)?.detail ?? target.label;
  }
  if (target.kind === "source") {
    return "Source metadata, lifecycle, scope, and policy pin.";
  }
  if (target.kind === "voice") {
    return "Voice profile, provider readiness, and policy context.";
  }
  return stageTargetDetail(target.stage);
}

function stageTargetDetail(stage: WorkspaceStage): string {
  switch (stage) {
    case "intake": {
      return "Active source, preparation state, import confidence, and policy scope.";
    }
    case "preview": {
      return "Generation prerequisites, voice readiness, policy, and audio lifecycle.";
    }
    case "review": {
      return "Selected block, review state, next action, and policy effects.";
    }
    case "teleprompt": {
      return "Current cue, next cue, sync mode, timing, and return target.";
    }
    case "theatre": {
      return "Current playback and cue context while the inspector is pinned.";
    }
  }
  const exhaustive: never = stage;
  return exhaustive;
}

function targetKindLabel(kind: WorkspaceInspectorTarget["kind"]): string {
  switch (kind) {
    case "cue": {
      return "Cue";
    }
    case "issue": {
      return "Issue";
    }
    case "job": {
      return "Job";
    }
    case "source": {
      return "Source";
    }
    case "stage": {
      return "Stage";
    }
    case "voice": {
      return "Voice";
    }
  }
  const exhaustive: never = kind;
  return exhaustive;
}

function diagnosticsHasContent(
  diagnostics: WorkspaceInspectorDiagnosticsModel,
  diagnosticsContent: ReactNode,
): boolean {
  return (
    diagnostics.facts.length > 0 || diagnostics.notes.length > 0 || Boolean(diagnosticsContent)
  );
}

function WorkspaceInspectorCollapsedSummary({
  audio,
  contextTargets,
  resolvedTarget,
  source,
  status,
  teleprompt,
}: Readonly<{
  audio: WorkspaceInspectorAudioModel;
  contextTargets: WorkspaceInspectorContextTargets;
  resolvedTarget: WorkspaceInspectorResolvedTarget;
  source: WorkspaceInspectorSourceModel;
  status: WorkspaceStageStatus;
  teleprompt: WorkspaceInspectorTelepromptModel;
}>) {
  if (resolvedTarget.invalidPinnedTarget) {
    return (
      <p className="text-xs leading-5 vs-muted">
        Pinned item is no longer available · {resolvedTarget.invalidPinnedTarget.label}
      </p>
    );
  }
  const target = resolvedTarget.target;
  if (target.kind === "cue") {
    const cue = contextTargets.cues.find((item) => item.id === target.id);
    return (
      <p className="text-xs leading-5 vs-muted">
        Cue · {cue?.label ?? target.label} · {cue?.timingLabel ?? teleprompt.cueTimingLabel}
      </p>
    );
  }
  if (target.kind === "issue") {
    const issue = contextTargets.issues.find((item) => item.id === target.id);
    if (issue?.owner === "audio") {
      return (
        <p className="text-xs leading-5 vs-muted">
          Issue · {issue.label} · {issue.recovery.label} · Queue ·{" "}
          {audio.queue.readyCount.toString()}/{audio.queue.totalSegments.toString()} ready · Job{" "}
          {audio.jobLabel}
        </p>
      );
    }
    return (
      <p className="text-xs leading-5 vs-muted">
        Issue · {issue?.label ?? target.label} · {issue?.recovery.label ?? "Review"}
      </p>
    );
  }
  if (target.kind === "job") {
    const job = contextTargets.jobs.find((item) => item.id === target.id);
    return (
      <p className="text-xs leading-5 vs-muted">
        Job · {job?.label ?? target.label} · {audio.lifecycleLabel}
      </p>
    );
  }
  if (target.kind === "source") {
    return (
      <p className="text-xs leading-5 vs-muted">
        Source · {source.label} · {source.stateLabel}
      </p>
    );
  }
  if (target.kind === "voice") {
    return <p className="text-xs leading-5 vs-muted">Voice · {target.label}</p>;
  }
  const message = status.blocker
    ? `${STAGE_LABEL[target.stage]} · ${status.blocker.title}`
    : `${STAGE_LABEL[target.stage]} · ${source.label} · ${audio.lifecycleLabel}`;
  return <p className="text-xs leading-5 vs-muted">{message}</p>;
}

function segmentValue(value: number): string {
  return value > 0 ? value.toString() : "n/a";
}
