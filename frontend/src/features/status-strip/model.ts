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
import {
  generatedAudioLifecycleLabel,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";
import {
  sourceLifecycleDescriptor,
  type SourceLifecycleEnvelope,
} from "../source-lifecycle/sourceLifecycle";
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
  | "openVoiceCloning"
  | "retry";

export interface NarrationStatusAction {
  readonly id: NarrationStatusActionId;
  readonly label: string;
  readonly tone: "danger" | "primary" | "secondary" | "warning";
}

export interface NarrationStatusChip {
  readonly id: string;
  readonly label: string;
  readonly tone: StatusChipTone;
  readonly value: string;
}

export interface NarrationStatusBlocker {
  readonly actionLabel: string | null;
  readonly detail: string;
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
  const blocker = resolveNarrationBlocker(input, state);
  const stages = resolveNarrationStages(input.job);
  const primaryAction = resolvePrimaryAction(input, state, blocker);
  const confidenceLabel = input.job ? formatSimilarity(input.job.voiceCheck.similarity) : "Waiting";
  const confidenceDetail = confidenceDetailForJob(input.job);
  const eta = estimateFirstAudioETA(input.job);
  const sourceDescriptor = sourceLifecycleDescriptor(input.sourceLifecycle.canonicalState);
  const audioLabel = generatedAudioLifecycleLabel(input.generatedAudioLifecycle);
  const primaryCopy = resolvePrimaryCopy(input, state, queue, blocker);
  const reviewNeedsRepair =
    input.stageStatus.reviewState === "needsRepair" ||
    input.stageStatus.blocker?.id === "reviewRequired";
  let reviewChipValue = "Ready";
  if (input.stageStatus.reviewWarningCount > 0) {
    reviewChipValue = "Needs repair";
  }
  if (input.stageStatus.blocker?.id === "reviewRequired") {
    reviewChipValue = "Needed";
  }
  return {
    activeJobDetail: input.job ? jobDetail(input.job, input.now) : "No active job",
    activeJobLabel: input.job ? shortIdentifier(input.job.id) : "None",
    activityItems: buildActivityItems(input, state, stages, queue, blocker),
    blocker,
    chips: [
      {
        id: "source",
        label: "Source",
        tone: sourceDescriptor.tone,
        value: sourceDescriptor.label,
      },
      {
        id: "review",
        label: "Review",
        tone: reviewNeedsRepair ? "warning" : "success",
        value: reviewChipValue,
      },
      {
        id: "audio",
        label: "Audio",
        tone: toneForAudioLifecycle(input.generatedAudioLifecycle),
        value: audioLabel,
      },
      {
        id: "queue",
        label: "Queue",
        tone: queueTone(queue, state),
        value:
          queue.totalSegments > 0
            ? `${queue.readyCount.toString()}/${queue.totalSegments.toString()} ready`
            : "Waiting",
      },
      {
        id: "check",
        label: "Check",
        tone: checkTone(input.job),
        value: confidenceLabel,
      },
      {
        id: "system",
        label: "System",
        tone: input.disclosure.attentionCount > 0 ? "warning" : "success",
        value:
          input.disclosure.attentionCount > 0
            ? `${input.disclosure.attentionCount.toString()} attention`
            : "Healthy",
      },
    ],
    confidenceDetail,
    confidenceLabel,
    detail: primaryCopy.detail,
    eta,
    primaryAction,
    primaryLabel: primaryCopy.label,
    primaryMessage: primaryCopy.message,
    queue,
    recentJobs: input.projectJobs.slice(0, 6).map((job) => jobSummary(job)),
    sourceTitle: input.sourceLifecycle.title,
    stageLabel: input.stageStatus.label,
    stages,
    state,
    tone: toneForState(state),
    voiceCloning: input.voiceCloningActivity,
  };
}

function resolveNarrationPipelineState(
  input: NarrationStatusModelInput,
  queue: NarrationQueueSnapshot,
): NarrationPipelineState {
  if (input.job?.status === "failed") {
    return "failed";
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
    return "failed";
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

function resolveNarrationBlocker(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
): NarrationStatusBlocker | null {
  return (
    jobFailureBlocker(input) ??
    jobCancelledBlocker(input) ??
    stageStatusBlocker(input) ??
    audioLifecycleBlocker(input) ??
    voiceCloningBlocker(input) ??
    fallbackAttentionBlocker(input, state)
  );
}

function jobFailureBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.job?.status === "failed") {
    return {
      actionLabel: input.canCreate ? "Retry generation" : null,
      detail:
        input.job.error ??
        (input.job.progress.detail.trim() ? input.job.progress.detail : "Generation failed."),
      title: "Generation failed",
    };
  }
  return null;
}

function jobCancelledBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.job?.status === "cancelled") {
    return {
      actionLabel: input.canCreate ? "Retry generation" : null,
      detail: input.job.error ?? "The active narration job was cancelled.",
      title: "Job cancelled",
    };
  }
  return null;
}

function stageStatusBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.stageStatus.blocker) {
    return {
      actionLabel: actionLabelForStageBlocker(input.stageStatus.blocker.correctiveAction),
      detail: input.stageStatus.blocker.detail,
      title: input.stageStatus.blocker.title,
    };
  }
  return null;
}

function audioLifecycleBlocker(input: NarrationStatusModelInput): NarrationStatusBlocker | null {
  if (input.generatedAudioLifecycle === "stale") {
    return {
      actionLabel: input.canCreate ? "Regenerate audio" : null,
      detail: "Generated audio does not match the current source, voice, policy, or scope.",
      title: "Audio stale",
    };
  }
  if (input.generatedAudioLifecycle === "degraded") {
    return {
      actionLabel: input.canCreate ? "Rebuild audio" : null,
      detail: "Generated audio exists, but playback is not reliable yet.",
      title: "Audio needs review",
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
  if ((state === "failed" || state === "cancelled" || state === "blocked") && input.canCreate) {
    return {
      id: "retry",
      label: blocker?.actionLabel ?? "Retry generation",
      tone: state === "failed" ? "danger" : "warning",
    };
  }
  if ((state === "ready" || state === "playing") && input.canOpenCinema) {
    return { id: "openCinema", label: "Open Cinema", tone: "secondary" };
  }
  if (input.canCreate && (state === "waiting" || state === "idle")) {
    return { id: "create", label: "Create & Listen", tone: "primary" };
  }
  return null;
}

function resolvePrimaryCopy(
  input: NarrationStatusModelInput,
  state: NarrationPipelineState,
  queue: NarrationQueueSnapshot,
  blocker: NarrationStatusBlocker | null,
): { detail: string; label: string; message: string } {
  if (state === "failed") {
    return {
      detail: blocker?.detail ?? "Retry generation when the source and voice are ready.",
      label: "Generation failed",
      message: `${blocker?.title ?? "Generation failed"}. ${blocker?.actionLabel ?? "Retry generation."}`,
    };
  }
  if (state === "blocked") {
    return {
      detail: blocker?.detail ?? "Resolve the blocker before continuing.",
      label: "Blocked",
      message: `${blocker?.title ?? "Narration blocked"}. ${blocker?.actionLabel ?? "Review the issue."}`,
    };
  }
  if (state === "cancelled") {
    return {
      detail: blocker?.detail ?? "Retry when you are ready.",
      label: "Cancelled",
      message: "Job cancelled. Retry when ready.",
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
  if (input.voiceCloningActivity.status !== "idle") {
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

function toneForAudioLifecycle(lifecycle: GeneratedAudioLifecycleState): StatusChipTone {
  switch (lifecycle) {
    case "ready": {
      return "success";
    }
    case "queued":
    case "generating": {
      return "info";
    }
    case "stale":
    case "degraded":
    case "archived": {
      return "warning";
    }
    case "failed": {
      return "danger";
    }
    default: {
      return "neutral";
    }
  }
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
  if (state === "failed") {
    return "danger";
  }
  if (state === "blocked" || state === "cancelled") {
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

function checkTone(job: VoiceJob | null): StatusChipTone {
  if (!job) {
    return "neutral";
  }
  if (job.status === "failed") {
    return "danger";
  }
  if (job.voiceCheck.complete) {
    return job.voiceCheck.needsResume ? "warning" : "success";
  }
  if (job.status === "checking" || job.status === "retrying") {
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
