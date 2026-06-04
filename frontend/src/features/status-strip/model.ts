import type {
  ActivityStageSummary,
  VoiceCloningActivitySummary,
} from "../../appVoiceCloningHelpers";
import {
  estimateFirstAudioETA,
  formatElapsed,
  formatSimilarity,
  shortIdentifier,
} from "../../appHelpers";
import type { StatusChipTone } from "../../design";
import type { StageStatus, VoiceJob } from "../../types";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import {
  operationalGeneratedAudioLifecycleReason,
  operationalIssueTone,
  operationalRecovery,
  resolveOperationalAudioIssue,
  resolveOperationalCloningIssue,
  resolveOperationalReviewIssue,
  resolveOperationalSourceIssue,
  resolveOperationalSystemIssue,
  selectPrimaryOperationalIssue,
  type OperationalRecoveryAction,
  type OperationalStatusIssue,
  type OperationalStatusOwner,
  type OperationalStatusSeverity,
} from "../operational-status";
import {
  sourceLifecycleDescriptor,
  type SourceLifecycleEnvelope,
  type SourceLifecycleTone,
} from "../source-lifecycle/sourceLifecycle";
import type { DisclosurePanelState } from "../workspace/disclosure";
import type { WorkspaceDisclosureModel } from "../workspace/disclosure";
import {
  workspaceStageActionLabel,
  type WorkspaceStageActionId,
  type WorkspaceStageStatus,
} from "../workspace/stageActions";

export type NarrationPipelineState =
  | "blocked"
  | "failed"
  | "cancelled"
  | "generating"
  | "playing"
  | "ready"
  | "waiting"
  | "idle";

export type NarrationStatusActionId =
  | "cancel"
  | "create"
  | "openCinema"
  | "openDiagnostics"
  | "openIntake"
  | "openReview"
  | "openVoiceCloning"
  | "retry";

export interface NarrationStatusAction {
  readonly id: NarrationStatusActionId;
  readonly label: string;
  readonly tone: "danger" | "primary" | "secondary" | "warning";
}

export interface NarrationStatusChip {
  readonly id: string;
  readonly issue: OperationalStatusIssue;
  readonly label: string;
  readonly tone: StatusChipTone;
  readonly value: string;
}

export interface NarrationStatusBlocker {
  readonly actionLabel: string | null;
  readonly detail: string;
  readonly recovery?: OperationalRecoveryAction;
  readonly technicalDetail?: string;
  readonly title: string;
}

export interface NarrationQueueSnapshot {
  readonly currentSegment: number;
  readonly generatingCount: number;
  readonly readyCount: number;
  readonly totalSegments: number;
}

export interface NarrationStatusActivityItem {
  readonly detail: string;
  readonly id: string;
  readonly status: NarrationPipelineState | StageStatus;
  readonly title: string;
  readonly tone: StatusChipTone;
}

export interface NarrationStatusJobSummary {
  readonly detail: string;
  readonly id: string;
  readonly status: string;
  readonly title: string;
  readonly tone: StatusChipTone;
}

export interface NarrationStatusModel {
  readonly activeJobDetail: string;
  readonly activeJobLabel: string;
  readonly activityItems: NarrationStatusActivityItem[];
  readonly blocker: NarrationStatusBlocker | null;
  readonly chips: NarrationStatusChip[];
  readonly confidenceDetail: string;
  readonly confidenceLabel: string;
  readonly detail: string;
  readonly eta: string;
  readonly issues: readonly OperationalStatusIssue[];
  readonly primaryAction: NarrationStatusAction | null;
  readonly primaryLabel: string;
  readonly primaryMessage: string;
  readonly queue: NarrationQueueSnapshot;
  readonly recentJobs: NarrationStatusJobSummary[];
  readonly sourceTitle: string;
  readonly stageLabel: string;
  readonly stages: ActivityStageSummary[];
  readonly state: NarrationPipelineState;
  readonly tone: StatusChipTone;
  readonly voiceCloning: VoiceCloningActivitySummary;
}

export interface NarrationStatusModelInput {
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly disclosure: WorkspaceDisclosureModel;
  readonly generatedAudioLifecycle: GeneratedAudioLifecycleState;
  readonly hint: string;
  readonly isPlaybackActive: boolean;
  readonly isPlaybackPlaying: boolean;
  readonly isProcessing: boolean;
  readonly job: VoiceJob | null;
  readonly now: number;
  readonly projectJobs: readonly VoiceJob[];
  readonly sourceLifecycle: SourceLifecycleEnvelope;
  readonly stageStatus: WorkspaceStageStatus;
  readonly voiceCloningActivity: VoiceCloningActivitySummary;
}

export const NARRATION_PIPELINE_STATE_RANK: Record<NarrationPipelineState, number> = {
  blocked: 80,
  failed: 80,
  cancelled: 70,
  playing: 60,
  generating: 50,
  ready: 40,
  waiting: 30,
  idle: 20,
};

export function compareNarrationPipelineState(
  left: NarrationPipelineState,
  right: NarrationPipelineState,
): number {
  return NARRATION_PIPELINE_STATE_RANK[left] - NARRATION_PIPELINE_STATE_RANK[right];
}

export function resolveNarrationStatusModel(
  input: NarrationStatusModelInput,
): NarrationStatusModel {
  const queue = narrationQueueSnapshot(input.job);
  const state = resolveNarrationPipelineState(input, queue);
  const stages = resolveNarrationStages(input.job);
  const confidenceLabel = input.job ? formatSimilarity(input.job.voiceCheck.similarity) : "Waiting";
  const confidenceDetail = confidenceDetailForJob(input.job);
  const eta = estimateFirstAudioETA(input.job);
  const sourceDescriptor = sourceLifecycleDescriptor(input.sourceLifecycle.canonicalState);
  const operationalIssues = resolveNarrationOperationalIssues({
    confidenceLabel,
    input,
    queue,
    sourceDescriptor,
  });
  const primaryIssue = selectPrimaryOperationalIssue(operationalIssues);
  const audioIssue = operationalIssues.find((issue) => issue.owner === "audio");
  const blocker = resolveNarrationBlocker(input, state, primaryIssue);
  const primaryAction = resolvePrimaryAction(input, state, blocker, primaryIssue);
  const primaryCopy = resolvePrimaryCopy(input, state, queue, blocker);
  return {
    activeJobDetail: input.job ? jobDetail(input.job, input.now) : "No active job",
    activeJobLabel: input.job ? shortIdentifier(input.job.id) : "None",
    activityItems: buildActivityItems(input, state, stages, queue, blocker),
    blocker,
    chips: narrationStatusChips(operationalIssues),
    confidenceDetail,
    confidenceLabel,
    detail: primaryCopy.detail,
    eta,
    issues: operationalIssues,
    primaryAction,
    primaryLabel: primaryCopy.label,
    primaryMessage: primaryCopy.message,
    queue,
    recentJobs: input.projectJobs.slice(0, 6).map((job) => jobSummary(job)),
    sourceTitle: input.sourceLifecycle.title,
    stageLabel: input.stageStatus.label,
    stages,
    state,
    tone: audioIssue && state === "failed" ? operationalIssueTone(audioIssue) : toneForState(state),
    voiceCloning: input.voiceCloningActivity,
  };
}

function resolveNarrationPipelineState(
  input: NarrationStatusModelInput,
  queue: NarrationQueueSnapshot,
): NarrationPipelineState {
  if (input.job?.status === "failed") {
    return isRetryableGenerationFailure(input) ? "blocked" : "failed";
  }
  if (
    input.stageStatus.blocker?.id === "sourceFailed" ||
    input.stageStatus.blocker?.id === "generationFailed"
  ) {
    return "failed";
  }
  if (input.job?.status === "cancelled" || input.voiceCloningActivity.status === "cancelled") {
    return "cancelled";
  }
  if (input.generatedAudioLifecycle === "failed") {
    return isRetryableGenerationFailure(input) ? "blocked" : "failed";
  }
  if (
    input.generatedAudioLifecycle === "stale" ||
    input.generatedAudioLifecycle === "degraded" ||
    input.stageStatus.blocker?.id === "audioStale" ||
    input.voiceCloningActivity.status === "attention"
  ) {
    return "blocked";
  }
  if (input.stageStatus.blocker?.id === "waitingForSource" && !input.canCreate && !input.job) {
    return "idle";
  }
  if (input.isPlaybackPlaying || input.isPlaybackActive) {
    return "playing";
  }
  if (
    input.isProcessing ||
    input.generatedAudioLifecycle === "queued" ||
    input.generatedAudioLifecycle === "generating" ||
    queue.generatingCount > 0
  ) {
    return "generating";
  }
  if (input.generatedAudioLifecycle === "ready") {
    return "ready";
  }
  if (input.stageStatus.blocker || input.generatedAudioLifecycle === "missing" || input.canCreate) {
    return "waiting";
  }
  return "idle";
}

function isRetryableGenerationFailure(input: NarrationStatusModelInput): boolean {
  if (!input.canCreate || !input.job) {
    return false;
  }
  return (
    input.job.status === "failed" &&
    input.generatedAudioLifecycle === "failed" &&
    input.job.retriable !== false &&
    input.job.terminalReason !== "configuration_failed"
  );
}

function resolveNarrationOperationalIssues({
  confidenceLabel,
  input,
  queue,
  sourceDescriptor,
}: Readonly<{
  confidenceLabel: string;
  input: NarrationStatusModelInput;
  queue: NarrationQueueSnapshot;
  sourceDescriptor: ReturnType<typeof sourceLifecycleDescriptor>;
}>): OperationalStatusIssue[] {
  const blocker = input.stageStatus.blocker;
  const audioIssue = resolveOperationalAudioIssue({
    canCancel: Boolean(input.job && !isTerminalJob(input.job) && input.isProcessing),
    canCreate: input.canCreate,
    canOpenCinema: input.canOpenCinema,
    job: input.job,
    lifecycle: input.generatedAudioLifecycle,
    requiresAudio: audioBlocksCurrentStage(input),
  });
  const cloningIssue = resolveOperationalCloningIssue(input.voiceCloningActivity);
  return [
    resolveOperationalSourceIssue({
      descriptorLabel: sourceDescriptor.label,
      descriptorSeverity: severityForLifecycleTone(sourceDescriptor.tone),
      detail: sourceDescriptor.detail,
      hasSource: blocker?.id !== "waitingForSource",
      sourceReadiness: input.sourceLifecycle.sourceReadiness,
      sourceError:
        blocker?.id === "sourceFailed" && input.sourceLifecycle.sourceReadiness.state !== "failed"
          ? blocker.detail
          : null,
      sourcePreparing: blocker?.id === "sourcePreparing",
    }),
    resolveOperationalReviewIssue({
      required: blocker?.id === "reviewRequired",
      warningCount: input.stageStatus.reviewWarningCount,
    }),
    audioIssue,
    resolveQueueIssue(queue),
    resolveCheckIssue(input.job, confidenceLabel),
    resolveOperationalSystemIssue({
      attentionCount: input.disclosure.attentionCount,
      critical: input.disclosure.highestPriorityPanel?.status === "blocking",
      detail: input.disclosure.highestPriorityPanel?.detail,
    }),
    ...(cloningIssue ? [cloningIssue] : []),
    ...resolveAttentionDisclosureIssues(input.disclosure),
  ];
}

function narrationStatusChips(issues: readonly OperationalStatusIssue[]): NarrationStatusChip[] {
  const issueByOwner = new Map<OperationalStatusOwner, OperationalStatusIssue>(
    issues.map((issue) => [issue.owner, issue]),
  );
  const coreOwners: OperationalStatusOwner[] = [
    "source",
    "review",
    "audio",
    "queue",
    "check",
    "system",
  ];
  const chips = coreOwners.flatMap((owner) => {
    const issue = issueByOwner.get(owner);
    if (!issue) {
      return [];
    }
    return [chipForIssue(issue)];
  });
  const attentionOwners: OperationalStatusOwner[] = ["cloning", "diagnostics", "importExport"];
  for (const owner of attentionOwners) {
    const issue = issueByOwner.get(owner);
    if (issue && issue.severity !== "ok") {
      chips.push(chipForIssue(issue));
    }
  }
  return chips;
}

function chipForIssue(issue: OperationalStatusIssue): NarrationStatusChip {
  return {
    id: issue.owner,
    issue,
    label: chipOwnerLabel(issue.owner),
    tone: operationalIssueTone(issue),
    value: issue.chipValue,
  };
}

function chipOwnerLabel(owner: OperationalStatusOwner): string {
  switch (owner) {
    case "importExport": {
      return "Import/export";
    }
    case "cloning": {
      return "Cloning";
    }
    default: {
      return owner.charAt(0).toUpperCase() + owner.slice(1);
    }
  }
}

function resolveQueueIssue(queue: NarrationQueueSnapshot): OperationalStatusIssue {
  if (queue.totalSegments > 0 && queue.readyCount >= queue.totalSegments) {
    return operationalStaticIssue({
      chipValue: `${queue.readyCount.toString()}/${queue.totalSegments.toString()} ready`,
      condition: "ready",
      detail: queueDetail(queue),
      id: "queue-ready",
      label: "Queue ready",
      owner: "queue",
      severity: "ok",
    });
  }
  if (queue.generatingCount > 0) {
    return operationalStaticIssue({
      chipValue: `${queue.readyCount.toString()}/${queue.totalSegments.toString()} ready`,
      condition: "working",
      detail: queueDetail(queue),
      id: "queue-working",
      label: "Queue working",
      owner: "queue",
      recovery: operationalRecovery("cancelRun", true),
      severity: "info",
    });
  }
  return operationalStaticIssue({
    chipValue:
      queue.totalSegments > 0
        ? `${queue.readyCount.toString()}/${queue.totalSegments.toString()} ready`
        : "Waiting",
    condition: "waiting",
    detail: queue.totalSegments > 0 ? queueDetail(queue) : "No segment queue yet.",
    id: "queue-waiting",
    label: "Queue waiting",
    owner: "queue",
    severity: "ok",
  });
}

function resolveCheckIssue(job: VoiceJob | null, confidenceLabel: string): OperationalStatusIssue {
  if (!job) {
    return operationalStaticIssue({
      chipValue: "Waiting",
      condition: "waiting",
      detail: "No check yet.",
      id: "check-waiting",
      label: "Check waiting",
      owner: "check",
      severity: "ok",
    });
  }
  if (job.voiceCheck.complete) {
    return operationalStaticIssue({
      chipValue: confidenceLabel,
      condition: job.voiceCheck.needsResume ? "attention" : "ready",
      detail: job.voiceCheck.reason.trim() || "Voice check completed.",
      id: job.voiceCheck.needsResume ? "check-needs-review" : "check-ready",
      label: job.voiceCheck.needsResume ? "Check needs review" : "Check ready",
      owner: "check",
      severity: job.voiceCheck.needsResume ? "warning" : "ok",
    });
  }
  if (job.status === "checking" || job.status === "retrying") {
    return operationalStaticIssue({
      chipValue: "Checking",
      condition: "working",
      detail: "Audio check is running.",
      id: "check-working",
      label: "Check working",
      owner: "check",
      severity: "info",
    });
  }
  return operationalStaticIssue({
    chipValue: confidenceLabel,
    condition: "waiting",
    detail: "Audio check is waiting.",
    id: "check-waiting",
    label: "Check waiting",
    owner: "check",
    severity: "ok",
  });
}

function resolveAttentionDisclosureIssues(
  disclosure: WorkspaceDisclosureModel,
): OperationalStatusIssue[] {
  return [
    disclosurePanelIssue("diagnostics", disclosure.panels.diagnostics),
    disclosurePanelIssue("importExport", disclosure.panels.exportImport),
  ].filter((issue): issue is OperationalStatusIssue => issue !== null);
}

function disclosurePanelIssue(
  owner: Extract<OperationalStatusOwner, "diagnostics" | "importExport">,
  panel: DisclosurePanelState,
): OperationalStatusIssue | null {
  if (panel.status !== "warning" && panel.status !== "blocking") {
    return null;
  }
  const critical = panel.status === "blocking";
  return operationalStaticIssue({
    blocksCurrentStage: critical,
    chipValue: critical ? "Blocking" : "Attention",
    condition: critical ? "blocked" : "attention",
    detail: panel.detail,
    id: `${owner}-${panel.status}`,
    label: panel.title,
    owner,
    recovery: operationalRecovery("openDiagnostics", true),
    severity: critical ? "critical" : "warning",
  });
}

function operationalStaticIssue(
  issue: Omit<OperationalStatusIssue, "blocksCurrentStage" | "recovery"> &
    Partial<Pick<OperationalStatusIssue, "blocksCurrentStage" | "recovery">>,
): OperationalStatusIssue {
  return {
    blocksCurrentStage: false,
    recovery: operationalRecovery("none", false, "No recovery action is needed."),
    ...issue,
  };
}

function audioBlocksCurrentStage(input: NarrationStatusModelInput): boolean {
  return (
    input.stageStatus.blocker?.id === "audioMissing" ||
    input.stageStatus.blocker?.id === "audioStale" ||
    input.stageStatus.blocker?.id === "audioDegraded" ||
    input.stageStatus.blocker?.id === "audioArchived" ||
    input.stageStatus.blocker?.id === "generationFailed"
  );
}

function severityForLifecycleTone(tone: SourceLifecycleTone): OperationalStatusSeverity {
  if (tone === "danger") {
    return "error";
  }
  if (tone === "warning") {
    return "warning";
  }
  if (tone === "info") {
    return "info";
  }
  return "ok";
}

function resolveNarrationBlocker(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
  primaryIssue: OperationalStatusIssue | null,
): NarrationStatusBlocker | null {
  return (
    operationalIssueBlocker(primaryIssue) ??
    stageStatusBlocker(input) ??
    audioLifecycleBlocker(input) ??
    voiceCloningBlocker(input) ??
    fallbackAttentionBlocker(input, state)
  );
}

function operationalIssueBlocker(
  issue: OperationalStatusIssue | null,
): NarrationStatusBlocker | null {
  if (
    !issue ||
    (issue.severity !== "critical" &&
      issue.severity !== "error" &&
      !issue.blocksCurrentStage &&
      issue.condition !== "cancelled")
  ) {
    return null;
  }
  return {
    actionLabel: issue.recovery.available ? issue.recovery.label : null,
    detail: issue.detail,
    recovery: issue.recovery,
    technicalDetail: issue.technicalDetail,
    title: issue.label,
  };
}

function stageStatusBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.stageStatus.blocker) {
    return {
      actionLabel: actionLabelForStageBlocker(input.stageStatus.blocker.correctiveAction),
      detail: input.stageStatus.blocker.detail,
      recovery: input.stageStatus.blocker.recovery,
      technicalDetail: input.stageStatus.blocker.technicalDetail,
      title: input.stageStatus.blocker.title,
    };
  }
  return null;
}

function audioLifecycleBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.generatedAudioLifecycle === "stale") {
    return {
      actionLabel: input.canCreate ? "Rebuild audio" : null,
      detail: operationalGeneratedAudioLifecycleReason("stale"),
      title: "Audio needs rebuild",
    };
  }
  if (input.generatedAudioLifecycle === "degraded") {
    return {
      actionLabel: input.canCreate ? "Rebuild audio" : null,
      detail: operationalGeneratedAudioLifecycleReason("degraded"),
      title: "Audio needs rebuild",
    };
  }
  return null;
}

function voiceCloningBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.voiceCloningActivity.status === "attention") {
    return {
      actionLabel: input.voiceCloningActivity.actionLabel,
      detail: input.voiceCloningActivity.message,
      title: "Voice cloning needs attention",
    };
  }
  return null;
}

function fallbackAttentionBlocker(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
): NarrationStatusBlocker | null {
  return state === "failed" || state === "blocked" || state === "cancelled"
    ? {
        actionLabel: null,
        detail: input.hint,
        title: "Narration needs attention",
      }
    : null;
}

function resolvePrimaryAction(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
  blocker: NarrationStatusBlocker | null,
  primaryIssue: OperationalStatusIssue | null,
): NarrationStatusAction | null {
  if (input.isProcessing && input.job && !isTerminalJob(input.job)) {
    return { id: "cancel", label: "Cancel Run", tone: "danger" };
  }
  if (input.voiceCloningActivity.status === "attention") {
    return {
      id: "openVoiceCloning",
      label: input.voiceCloningActivity.actionLabel,
      tone: "warning",
    };
  }
  if (state === "failed" || state === "cancelled" || state === "blocked") {
    return primaryActionForRecovery(primaryIssue?.recovery ?? blocker?.recovery ?? null, state);
  }
  if ((state === "ready" || state === "playing") && input.canOpenCinema) {
    return { id: "openCinema", label: "Open Cinema", tone: "secondary" };
  }
  if (input.canCreate && (state === "waiting" || state === "idle")) {
    return { id: "create", label: "Create & Listen", tone: "primary" };
  }
  return null;
}

function primaryActionForRecovery(
  recovery: OperationalRecoveryAction | null,
  state: NarrationPipelineState,
): NarrationStatusAction | null {
  if (!recovery?.available) {
    return null;
  }
  const failureTone = state === "failed" ? "danger" : "warning";
  switch (recovery.id) {
    case "retryGeneration": {
      return { id: "retry", label: recovery.label, tone: failureTone };
    }
    case "rebuildAudio": {
      return { id: "retry", label: recovery.label, tone: "warning" };
    }
    case "createAndListen": {
      return { id: "create", label: recovery.label, tone: "primary" };
    }
    case "openCinema": {
      return { id: "openCinema", label: recovery.label, tone: "secondary" };
    }
    case "openDiagnostics": {
      return { id: "openDiagnostics", label: recovery.label, tone: failureTone };
    }
    case "openIntake": {
      return { id: "openIntake", label: recovery.label, tone: failureTone };
    }
    case "openReview": {
      return { id: "openReview", label: recovery.label, tone: "warning" };
    }
    case "openVoiceCloning": {
      return { id: "openVoiceCloning", label: recovery.label, tone: "warning" };
    }
    case "cancelRun":
    case "none": {
      return null;
    }
  }
}

function resolvePrimaryCopy(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
  queue: NarrationQueueSnapshot,
  blocker: NarrationStatusBlocker | null,
): { detail: string; label: string; message: string } {
  if (state === "failed") {
    const label = blocker?.title ?? "Generation failed";
    return {
      detail: blocker?.detail ?? "Retry generation when the source and voice are ready.",
      label,
      message: `${label}. ${blocker?.actionLabel ?? blocker?.recovery?.unavailableReason ?? "Retry generation."}`,
    };
  }
  if (state === "blocked") {
    const label = blocker?.title ?? "Blocked";
    return {
      detail: blocker?.detail ?? "Resolve the blocker before continuing.",
      label,
      message: `${label}. ${blocker?.actionLabel ?? blocker?.recovery?.unavailableReason ?? "Review the issue."}`,
    };
  }
  if (state === "cancelled") {
    const label = blocker?.title ?? "Generation cancelled";
    return {
      detail: blocker?.detail ?? "Retry when you are ready.",
      label,
      message: `${label}. ${blocker?.actionLabel ?? "Retry generation when ready."}`,
    };
  }
  if (state === "playing") {
    return {
      detail: queue.totalSegments > 0 ? queueDetail(queue) : "Playback is using current audio.",
      label: "Playing",
      message: "Playing current narration audio.",
    };
  }
  if (state === "generating") {
    return {
      detail:
        queue.totalSegments > 0 ? queueDetail(queue) : (input.job?.progress.detail ?? input.hint),
      label: input.job?.status === "queued" ? "Queued" : "Generating",
      message: generatingMessage(input.job, queue),
    };
  }
  if (state === "ready") {
    return {
      detail: queue.totalSegments > 0 ? queueDetail(queue) : "Current generated audio is ready.",
      label: "Audio ready",
      message: "Audio ready.",
    };
  }
  if (state === "waiting") {
    const waitingDetail =
      blocker?.detail ?? waitingDetailForLifecycle(input.generatedAudioLifecycle);
    return {
      detail: waitingDetail,
      label: "Waiting",
      message: waitingMessage(input, blocker),
    };
  }
  return {
    detail: input.hint,
    label: "Idle",
    message: "Choose a source to begin.",
  };
}

function generatingMessage(job: VoiceJob | null, queue: NarrationQueueSnapshot): string {
  if (job?.status === "queued") {
    return "Audio generation is queued.";
  }
  if (queue.totalSegments > 0 && queue.currentSegment > 0) {
    return `Generating segment ${queue.currentSegment.toString()} of ${queue.totalSegments.toString()}.`;
  }
  if (!job) {
    return "Generating checked audio.";
  }
  return job.progress.message.trim() ? job.progress.message : "Generating checked audio.";
}

function waitingMessage(
  input: NarrationStatusModelInput,
  blocker: NarrationStatusBlocker | null,
): string {
  if (blocker?.title) {
    return blocker.title;
  }
  if (input.generatedAudioLifecycle === "missing" && input.canCreate) {
    return "Ready to create audio.";
  }
  if (input.generatedAudioLifecycle === "missing") {
    return "Waiting for checked audio.";
  }
  return input.hint;
}

function waitingDetailForLifecycle(lifecycle: GeneratedAudioLifecycleState): string {
  if (lifecycle === "missing") {
    return "Create & Listen will generate checked audio for the current source.";
  }
  if (lifecycle === "queued") {
    return "Audio generation is waiting for a worker.";
  }
  return "The pipeline is waiting for the next available action.";
}

function narrationQueueSnapshot(job: VoiceJob | null): NarrationQueueSnapshot {
  const totalSegments = Math.max(
    job?.retries.totalSegments ?? 0,
    job?.progress.totalSegments ?? 0,
    job?.segments?.length ?? 0,
    job?.audioReadySegments ?? 0,
    0,
  );
  const readyCount = Math.max(0, Math.min(totalSegments, job?.audioReadySegments ?? 0));
  const currentSegment = Math.max(
    0,
    job?.retries.currentSegment ?? 0,
    job?.progress.currentSegment ?? 0,
  );
  const generatingCount =
    job && !isTerminalJob(job) && job.status !== "queued" && totalSegments > readyCount ? 1 : 0;
  return {
    currentSegment,
    generatingCount,
    readyCount,
    totalSegments,
  };
}

function resolveNarrationStages(job: VoiceJob | null): ActivityStageSummary[] {
  const pipeline = resolveTTSPipelineState(job);
  return [
    { label: "Optimize", status: pipeline.optimization },
    { label: "Synthesize", status: pipeline.synthesis },
    { label: "Check", status: pipeline.checker },
  ];
}

function buildActivityItems(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
  stages: ActivityStageSummary[],
  queue: NarrationQueueSnapshot,
  blocker: NarrationStatusBlocker | null,
): NarrationStatusActivityItem[] {
  const items: NarrationStatusActivityItem[] = [
    {
      detail: input.sourceLifecycle.selectedScope,
      id: "source",
      status: state,
      title: `Source: ${input.sourceLifecycle.title}`,
      tone: toneForState(state),
    },
    {
      detail: queue.totalSegments > 0 ? queueDetail(queue) : "No segment queue yet.",
      id: "queue",
      status: state,
      title: "Queue and readiness",
      tone: queueTone(queue, state),
    },
  ];
  if (blocker) {
    items.unshift({
      detail: blocker.detail,
      id: "blocker",
      status: state,
      title: blocker.title,
      tone: state === "failed" ? "danger" : "warning",
    });
  }
  for (const stage of stages) {
    items.push({
      detail: stage.detail ?? stageStatusLabel(stage.status),
      id: `stage-${stage.label}`,
      status: stage.status,
      title: stage.label,
      tone: toneForStageStatus(stage.status),
    });
  }
  if (
    input.voiceCloningActivity.status === "running" ||
    input.voiceCloningActivity.status === "attention" ||
    input.voiceCloningActivity.status === "cancelled"
  ) {
    items.push({
      detail: input.voiceCloningActivity.message,
      id: "voice-cloning",
      status: input.voiceCloningActivity.status === "attention" ? "blocked" : state,
      title: `Voice cloning: ${input.voiceCloningActivity.statusLabel}`,
      tone: input.voiceCloningActivity.status === "attention" ? "warning" : "info",
    });
  }
  return items;
}

function jobSummary(job: VoiceJob): NarrationStatusJobSummary {
  const totalSegments = Math.max(job.retries.totalSegments, job.progress.totalSegments ?? 0, 0);
  const readySegments = Math.max(0, Math.min(totalSegments, job.audioReadySegments ?? 0));
  const detail = jobSummaryDetail(job, totalSegments, readySegments);
  return {
    detail,
    id: job.id,
    status: job.status,
    title: `${shortIdentifier(job.id)} · ${job.voiceProfileName ?? job.voice}`,
    tone: toneForJobStatus(job.status),
  };
}

function jobSummaryDetail(job: VoiceJob, totalSegments: number, readySegments: number): string {
  if (totalSegments > 0) {
    return `${readySegments.toString()} of ${totalSegments.toString()} ready`;
  }
  if (job.progress.message.trim()) {
    return job.progress.message;
  }
  return "No segment detail";
}

function confidenceDetailForJob(job: VoiceJob | null): string {
  const reason = job?.voiceCheck.reason.trim();
  if (reason) {
    return reason;
  }
  const provider = job?.voiceCheck.provider.trim();
  return provider ?? "No check yet";
}

function jobDetail(job: VoiceJob, now: number): string {
  const elapsed = formatElapsed(job.progress.startedAt ?? job.createdAt, now);
  if (job.progress.detail.trim()) {
    return `${job.status} · ${elapsed} · ${job.progress.detail}`;
  }
  return `${job.status} · ${elapsed}`;
}

function queueDetail(queue: NarrationQueueSnapshot): string {
  return `${queue.readyCount.toString()} ready, ${queue.generatingCount.toString()} generating, ${queue.totalSegments.toString()} total`;
}

function actionLabelForStageBlocker(actionId: WorkspaceStageActionId | null): string | null {
  if (!actionId) {
    return null;
  }
  return workspaceStageActionLabel(actionId);
}

function toneForState(state: NarrationPipelineState): StatusChipTone {
  switch (state) {
    case "blocked":
    case "cancelled": {
      return "warning";
    }
    case "failed": {
      return "danger";
    }
    case "generating":
    case "playing": {
      return "info";
    }
    case "ready": {
      return "success";
    }
    default: {
      return "neutral";
    }
  }
}

function queueTone(queue: NarrationQueueSnapshot, state: NarrationPipelineState): StatusChipTone {
  if (state === "failed" || state === "blocked" || state === "cancelled") {
    return "warning";
  }
  if (queue.totalSegments > 0 && queue.readyCount >= queue.totalSegments) {
    return "success";
  }
  if (queue.generatingCount > 0) {
    return "info";
  }
  return "neutral";
}

function toneForJobStatus(status: VoiceJob["status"]): StatusChipTone {
  switch (status) {
    case "completed": {
      return "success";
    }
    case "failed": {
      return "danger";
    }
    case "cancelled": {
      return "warning";
    }
    case "queued":
    case "optimizing":
    case "synthesizing":
    case "checking":
    case "retrying": {
      return "info";
    }
  }
}

function toneForStageStatus(status: StageStatus): StatusChipTone {
  switch (status) {
    case "done": {
      return "success";
    }
    case "failed": {
      return "danger";
    }
    case "running": {
      return "info";
    }
    default: {
      return "neutral";
    }
  }
}

function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case "done": {
      return "done";
    }
    case "failed": {
      return "failed";
    }
    case "running": {
      return "running";
    }
    default: {
      return "waiting";
    }
  }
}

interface PipelineStepState {
  checker: StageStatus;
  optimization: StageStatus;
  synthesis: StageStatus;
}

interface ActivePipelineFlags {
  checking: boolean;
  optimizing: boolean;
  synthesizing: boolean;
}

function createPipelineBase(job?: VoiceJob | null): PipelineStepState {
  if (!job) {
    return {
      checker: "waiting",
      optimization: "waiting",
      synthesis: "waiting",
    };
  }
  return {
    checker: job.stages.checker,
    optimization: job.stages.optimization,
    synthesis: job.stages.synthesis,
  };
}

function resolveTTSPipelineState(job: VoiceJob | null): PipelineStepState {
  if (!job) {
    return createPipelineBase();
  }
  const pipeline = createPipelineBase(job);
  if (isTerminalJob(job)) {
    return pipeline;
  }
  const flags = getActivePipelineFlags(job);
  if (flags.optimizing) {
    if (pipeline.optimization !== "failed") {
      pipeline.optimization = "running";
    }
    return pipeline;
  }
  markOptimizationStarted(pipeline);
  if (flags.synthesizing) {
    markSynthesisRunning(pipeline);
    return pipeline;
  }
  if (flags.checking || hasSegmentWorkInFlight(job)) {
    markCheckerRunning(pipeline);
  }
  return pipeline;
}

function isTerminalJob(job: VoiceJob): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

function getActivePipelineFlags(job: VoiceJob): ActivePipelineFlags {
  const activeStage = job.progress.activeStage.toLowerCase();
  return {
    checking:
      activeStage.includes("check") ||
      activeStage.includes("retry") ||
      job.status === "checking" ||
      job.status === "retrying",
    optimizing: activeStage.includes("optim") || job.status === "optimizing",
    synthesizing: activeStage.includes("synth") || job.status === "synthesizing",
  };
}

function hasSegmentWorkInFlight(job: VoiceJob): boolean {
  const total = job.progress.totalSegments ?? 0;
  const current = job.progress.currentSegment ?? 0;
  return total > 0 && current < total;
}

function markOptimizationStarted(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed" && pipeline.optimization !== "done") {
    pipeline.optimization = "running";
  }
}

function markSynthesisRunning(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed") {
    pipeline.optimization = "done";
  }
  if (pipeline.synthesis !== "failed") {
    pipeline.synthesis = "running";
  }
}

function markCheckerRunning(pipeline: PipelineStepState): void {
  markSynthesisRunning(pipeline);
  if (pipeline.checker !== "failed") {
    pipeline.checker = "running";
  }
}
