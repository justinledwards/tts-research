import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import type { SourceReadiness } from "../../types";
import {
  operationalGeneratedAudioLifecycleReason,
  OPERATIONAL_RECOVERY_LABELS,
  operationalRecovery,
  type OperationalRecoveryAction,
} from "../operational-status";
import { workspacePlaybackActionLabel } from "../playback/workspacePlaybackActions";
import {
  WORKSPACE_STAGES,
  transitionWorkspaceStage,
  workspaceStageMeta,
  type WorkspaceContext,
  type WorkspaceStage,
} from "./model";

export type WorkspaceStageActionId =
  | "intakeSource"
  | "inspectStructure"
  | "reviewBlocks"
  | "previewSpeech"
  | "openTeleprompt"
  | "openTheatre"
  | "createAndListen"
  | "openCinema"
  | "retryGeneration"
  | "exportArtifact";

export type WorkspaceStageActionKind = "navigation" | "primary" | "secondary";
export type WorkspaceStagePrimaryActionId =
  | WorkspaceStageActionId
  | "continueIntake"
  | "playPauseTheatre";
export type WorkspaceStageInspectorTabId =
  | "overview"
  | "review"
  | "policy"
  | "diagnostics"
  | "history";
export type WorkspaceStageBlockerId =
  | "waitingForSource"
  | "sourcePreparing"
  | "sourceFailed"
  | "sourceNeedsMetadata"
  | "sourceStale"
  | "sourceUnsupported"
  | "listenerTextMissing"
  | "reviewRequired"
  | "voiceMissing"
  | "audioMissing"
  | "audioStale"
  | "audioDegraded"
  | "audioArchived"
  | "generationFailed";

export type WorkspaceStageReadinessState =
  | "ready"
  | "blocked"
  | "working"
  | "failed"
  | "warning"
  | "manual"
  | "complete";

export type WorkspaceStageReadinessTone =
  | "danger"
  | "info"
  | "neutral"
  | "pinned"
  | "success"
  | "warning";

export interface WorkspaceStageAction {
  readonly description: string;
  readonly id: WorkspaceStageActionId;
  readonly kind: WorkspaceStageActionKind;
  readonly label: string;
  readonly targetStage: WorkspaceStage | null;
}

export interface WorkspaceStageBlocker {
  readonly correctiveAction: WorkspaceStageActionId | null;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly id: WorkspaceStageBlockerId;
  readonly recovery?: OperationalRecoveryAction;
  readonly technicalDetail?: string;
  readonly title: string;
}

export interface WorkspaceStageStatusInput {
  readonly audioLifecycle: GeneratedAudioLifecycleState;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly createDisabledReason?: string;
  readonly hasListenerText: boolean;
  readonly hasSource: boolean;
  readonly hasVoice: boolean;
  readonly reviewRequired?: boolean;
  readonly reviewWarningCount?: number;
  readonly sourceError?: string | null;
  readonly sourceReadiness?: SourceReadiness | null;
  readonly sourcePreparing: boolean;
  readonly stage: WorkspaceStage;
}

export type WorkspaceReviewState = "needsRepair" | "ready";

export interface WorkspaceStageCurrentTask {
  readonly detail: string;
  readonly disabledReason?: string;
  readonly primaryAction: WorkspaceStageActionId | null;
  readonly primaryLabel: string | null;
  readonly title: string;
  readonly tone: WorkspaceStageReadinessTone;
}

export interface WorkspaceStageReadiness {
  readonly action: WorkspaceStageActionId | null;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly label: string;
  readonly stage: WorkspaceStage;
  readonly state: WorkspaceStageReadinessState;
  readonly tone: WorkspaceStageReadinessTone;
}

export interface WorkspaceStageStatus {
  readonly blocker: WorkspaceStageBlocker | null;
  readonly currentTask: WorkspaceStageCurrentTask;
  readonly description: string;
  readonly inspectorTabs: readonly WorkspaceStageInspectorTabId[];
  readonly label: string;
  readonly nextAction: WorkspaceStageActionId | null;
  readonly primaryAction: WorkspaceStagePrimaryActionId;
  readonly primaryLabel: string;
  readonly readinessByStage: Record<WorkspaceStage, WorkspaceStageReadiness>;
  readonly reviewState: WorkspaceReviewState;
  readonly reviewWarningCount: number;
  readonly stage: WorkspaceStage;
}

export const WORKSPACE_STAGE_ACTIONS: Record<WorkspaceStageActionId, WorkspaceStageAction> = {
  createAndListen: {
    description: "Create narration audio from the active source, voice, policy, and scope.",
    id: "createAndListen",
    kind: "primary",
    label: workspacePlaybackActionLabel("createAndListen"),
    targetStage: null,
  },
  exportArtifact: {
    description: "Export the current project or generated artifact bundle.",
    id: "exportArtifact",
    kind: "secondary",
    label: "Export",
    targetStage: null,
  },
  inspectStructure: {
    description: "Inspect headings, blocks, skipped content, and source structure.",
    id: "inspectStructure",
    kind: "secondary",
    label: "Content Structure",
    targetStage: null,
  },
  intakeSource: {
    description: "Collect or switch the active draft, book, file, or URL source.",
    id: "intakeSource",
    kind: "navigation",
    label: "Intake",
    targetStage: "intake",
  },
  openCinema: {
    description: "Open Cinema for generated audio playback and review.",
    id: "openCinema",
    kind: "secondary",
    label: workspacePlaybackActionLabel("openCinema"),
    targetStage: null,
  },
  openTeleprompt: {
    description: "Open Teleprompt with the active source, block, voice, policy, and scope.",
    id: "openTeleprompt",
    kind: "secondary",
    label: "Open Teleprompt",
    targetStage: "teleprompt",
  },
  openTheatre: {
    description: "Open Theatre with the active source, cue, voice, policy, and playback context.",
    id: "openTheatre",
    kind: "primary",
    label: "Enter Theatre",
    targetStage: "theatre",
  },
  previewSpeech: {
    description: "Preview the spoken form before audio generation.",
    id: "previewSpeech",
    kind: "primary",
    label: "Preview Speech",
    targetStage: "preview",
  },
  retryGeneration: {
    description: "Retry a failed narration generation with the current settings.",
    id: "retryGeneration",
    kind: "primary",
    label: workspacePlaybackActionLabel("retryGeneration"),
    targetStage: null,
  },
  reviewBlocks: {
    description: "Review source blocks, speech policy effects, and validation context.",
    id: "reviewBlocks",
    kind: "navigation",
    label: "Open Review",
    targetStage: "review",
  },
};

export const WORKSPACE_STAGE_NAVIGATION_ACTIONS: Record<WorkspaceStage, WorkspaceStageActionId> = {
  intake: "intakeSource",
  preview: "previewSpeech",
  review: "reviewBlocks",
  teleprompt: "openTeleprompt",
  theatre: "openTheatre",
};

export const WORKSPACE_STAGE_PRIMARY_ACTIONS: Record<WorkspaceStage, WorkspaceStageActionId> = {
  intake: "reviewBlocks",
  preview: "createAndListen",
  review: "previewSpeech",
  teleprompt: "openTheatre",
  theatre: "createAndListen",
};

export function workspaceStageAction(id: WorkspaceStageActionId): WorkspaceStageAction {
  return WORKSPACE_STAGE_ACTIONS[id];
}

export function workspaceStageActionLabel(id: WorkspaceStageActionId): string {
  return workspaceStageAction(id).label;
}

export function workspaceStageActionTestId(id: WorkspaceStageActionId): string {
  return `workspace-stage-action-${id}`;
}

export function workspaceStageNavigationAction(stage: WorkspaceStage): WorkspaceStageActionId {
  return WORKSPACE_STAGE_NAVIGATION_ACTIONS[stage];
}

export function workspaceStagePrimaryAction(stage: WorkspaceStage): WorkspaceStageActionId {
  return WORKSPACE_STAGE_PRIMARY_ACTIONS[stage];
}

export function workspaceStagePrimaryActionDisplayLabel(
  actionId: WorkspaceStagePrimaryActionId,
): string {
  if (actionId === "continueIntake") {
    return "Continue";
  }
  if (actionId === "playPauseTheatre") {
    return "Play / Pause";
  }
  return workspaceStageActionLabel(actionId);
}

export function workspaceStageCurrentTaskActionLabel(
  task: Pick<WorkspaceStageCurrentTask, "primaryAction">,
  status: Pick<WorkspaceStageStatus, "reviewWarningCount" | "stage">,
): string | null {
  if (!task.primaryAction) {
    return null;
  }
  if (
    status.stage === "review" &&
    task.primaryAction === "reviewBlocks" &&
    status.reviewWarningCount > 0
  ) {
    return "Review warnings";
  }
  return workspaceStageActionLabel(task.primaryAction);
}

export function resolveWorkspaceStageStatus(
  input: WorkspaceStageStatusInput,
): WorkspaceStageStatus {
  const blocker = workspaceStageBlocker(input);
  const reviewWarningCount = Math.max(0, input.reviewWarningCount ?? 0);
  const reviewState = reviewWarningCount > 0 ? "needsRepair" : "ready";
  const readinessByStage = workspaceStageReadinessByStage(input, reviewWarningCount);
  const primaryAction = workspaceStagePrimaryActionForStatus(
    input,
    blocker,
    readinessByStage[input.stage],
  );
  return {
    blocker,
    currentTask: workspaceStageCurrentTask(input, blocker, readinessByStage[input.stage]),
    description: workspaceStageMeta(input.stage).description,
    inspectorTabs: workspaceStageInspectorTabs(input.stage, blocker),
    label: workspaceStageMeta(input.stage).label,
    nextAction: workspaceStageNextAction(input, blocker),
    primaryAction,
    primaryLabel: workspaceStagePrimaryActionDisplayLabel(primaryAction),
    readinessByStage,
    reviewState,
    reviewWarningCount,
    stage: input.stage,
  };
}

export function transitionWorkspaceContextForStageAction(
  context: WorkspaceContext,
  actionId: WorkspaceStageActionId,
): WorkspaceContext {
  const targetStage = workspaceStageAction(actionId).targetStage;
  if (!targetStage) {
    return context;
  }
  return transitionWorkspaceStage(context, targetStage);
}

function workspaceStageBlocker(input: WorkspaceStageStatusInput): WorkspaceStageBlocker | null {
  if (input.sourceError) {
    return {
      correctiveAction: "intakeSource",
      detail: input.sourceError,
      id: "sourceFailed",
      recovery: operationalRecovery("openIntake", true),
      title: "Source needs attention",
    };
  }
  if (input.sourcePreparing) {
    return {
      correctiveAction: null,
      detail: "Import, extraction, or source preparation is still running.",
      disabledReason: "Source preparation is still running.",
      id: "sourcePreparing",
      recovery: operationalRecovery("none", false, "Wait for source preparation to finish."),
      title: "Waiting for source",
    };
  }
  if (!input.hasSource) {
    return {
      correctiveAction: "intakeSource",
      detail: "Choose draft text, a book, a prepared file, or a URL before continuing.",
      id: "waitingForSource",
      recovery: operationalRecovery("openIntake", true),
      title: "No narration source selected",
    };
  }
  const sourceReadinessBlocker = workspaceSourceReadinessBlocker(input);
  if (sourceReadinessBlocker) {
    return sourceReadinessBlocker;
  }
  if (input.reviewRequired) {
    return {
      correctiveAction: "reviewBlocks",
      detail: "Review the active source before moving into generated-audio or read-along stages.",
      id: "reviewRequired",
      recovery: operationalRecovery("openReview", true),
      title: "Review required",
    };
  }
  if (!input.hasListenerText && input.stage !== "intake" && input.stage !== "review") {
    return {
      correctiveAction: "reviewBlocks",
      detail: "Prepare listener-ready text in Review before using this stage.",
      id: "listenerTextMissing",
      recovery: operationalRecovery("openReview", true),
      title: "Spoken form needs review",
    };
  }
  if (!input.hasVoice && input.stage === "preview") {
    return {
      correctiveAction: null,
      detail: input.createDisabledReason ?? "Select a voice or resolve provider setup first.",
      disabledReason:
        input.createDisabledReason ?? "Select a voice or resolve provider setup first.",
      id: "voiceMissing",
      recovery: operationalRecovery(
        "none",
        false,
        "Select a voice or resolve provider setup first.",
      ),
      title: "Voice unavailable",
    };
  }
  return workspaceAudioStageBlocker(input);
}

function workspaceSourceReadinessBlocker(
  input: WorkspaceStageStatusInput,
): WorkspaceStageBlocker | null {
  if (
    input.stage === "intake" ||
    !input.sourceReadiness ||
    input.sourceReadiness.state === "ready"
  ) {
    return null;
  }
  if (input.sourceReadiness.state === "needsMetadata") {
    return {
      correctiveAction: "intakeSource",
      detail: input.sourceReadiness.detail,
      id: "sourceNeedsMetadata",
      recovery: operationalRecovery("openIntake", true),
      title: "Source metadata needs confirmation",
    };
  }
  if (input.sourceReadiness.state === "stale") {
    return {
      correctiveAction: "intakeSource",
      detail: input.sourceReadiness.staleReason ?? input.sourceReadiness.detail,
      id: "sourceStale",
      recovery: operationalRecovery("openIntake", true),
      title: "Source readiness is stale",
    };
  }
  if (input.sourceReadiness.state === "unsupported") {
    return {
      correctiveAction: "intakeSource",
      detail: input.sourceReadiness.detail,
      id: "sourceUnsupported",
      recovery: operationalRecovery("openIntake", true),
      title: "Source is unsupported",
    };
  }
  if (input.sourceReadiness.state === "failed") {
    return {
      correctiveAction: "intakeSource",
      detail: input.sourceReadiness.detail,
      id: "sourceFailed",
      recovery: operationalRecovery("openIntake", true),
      technicalDetail: input.sourceReadiness.failureStage
        ? `Failure stage: ${input.sourceReadiness.failureStage}`
        : undefined,
      title: "Source needs attention",
    };
  }
  return null;
}

function workspaceAudioStageBlocker(
  input: WorkspaceStageStatusInput,
): WorkspaceStageBlocker | null {
  if (input.stage === "intake" || input.stage === "review") {
    return null;
  }
  if (input.audioLifecycle === "failed") {
    if (input.stage !== "preview") {
      return null;
    }
    return {
      correctiveAction: "retryGeneration",
      detail: operationalGeneratedAudioLifecycleReason("failed"),
      id: "generationFailed",
      recovery: operationalRecovery("retryGeneration", input.canCreate),
      title: "Generation failed",
    };
  }
  if (isAudioRecoveryLifecycle(input.audioLifecycle)) {
    if (input.stage === "teleprompt" || input.stage === "theatre") {
      return null;
    }
    return audioRecoveryBlocker(input);
  }
  return null;
}

function workspaceStagePrimaryActionForStatus(
  input: WorkspaceStageStatusInput,
  blocker: WorkspaceStageBlocker | null,
  readiness: WorkspaceStageReadiness,
): WorkspaceStagePrimaryActionId {
  if (blocker?.correctiveAction) {
    return blocker.correctiveAction;
  }
  if (input.stage === "intake" && !input.hasSource) {
    return "continueIntake";
  }
  if (input.stage === "theatre" && input.audioLifecycle === "ready") {
    return "playPauseTheatre";
  }
  if (input.stage === "review") {
    return workspaceStagePrimaryAction(input.stage);
  }
  if (input.stage === "preview") {
    return workspaceStagePrimaryAction(input.stage);
  }
  if (readiness.action) {
    return readiness.action;
  }
  return workspaceStagePrimaryAction(input.stage);
}

function workspaceStageNextAction(
  input: WorkspaceStageStatusInput,
  blocker: WorkspaceStageBlocker | null,
): WorkspaceStageActionId | null {
  if (blocker?.correctiveAction) {
    return blocker.correctiveAction;
  }
  if (input.stage === "intake") {
    return input.hasSource ? "reviewBlocks" : null;
  }
  if (input.stage === "review") {
    return "previewSpeech";
  }
  if (input.stage === "preview") {
    return input.audioLifecycle === "ready" ? "openTheatre" : "createAndListen";
  }
  if (input.stage === "teleprompt") {
    return "openTheatre";
  }
  return input.canOpenCinema ? "openCinema" : "createAndListen";
}

function workspaceStageInspectorTabs(
  stage: WorkspaceStage,
  blocker: WorkspaceStageBlocker | null,
): readonly WorkspaceStageInspectorTabId[] {
  if (blocker) {
    return ["overview", "diagnostics"];
  }
  if (stage === "intake") {
    return ["overview", "policy", "history"];
  }
  if (stage === "review") {
    return ["overview", "review", "policy", "diagnostics"];
  }
  if (stage === "preview") {
    return ["overview", "policy", "diagnostics"];
  }
  if (stage === "teleprompt") {
    return ["overview", "review", "history"];
  }
  return ["overview", "diagnostics", "history"];
}

function workspaceStageReadinessByStage(
  input: WorkspaceStageStatusInput,
  reviewWarningCount: number,
): Record<WorkspaceStage, WorkspaceStageReadiness> {
  return Object.fromEntries(
    WORKSPACE_STAGES.map((stage) => [
      stage,
      workspaceStageReadiness(input, stage, reviewWarningCount),
    ]),
  ) as Record<WorkspaceStage, WorkspaceStageReadiness>;
}

function workspaceStageReadiness(
  input: WorkspaceStageStatusInput,
  stage: WorkspaceStage,
  reviewWarningCount: number,
): WorkspaceStageReadiness {
  const sourceReadiness = sourceGateReadiness(input, stage);
  if (sourceReadiness) {
    return sourceReadiness;
  }
  if (stage === "intake") {
    return stageReadiness({
      action: "intakeSource",
      detail: "A narratable source is selected and ready for Review.",
      label: "Complete",
      stage,
      state: "complete",
      tone: "success",
    });
  }
  if (stage === "review") {
    return reviewStageReadiness(input, reviewWarningCount);
  }
  if (input.reviewRequired) {
    return stageReadiness({
      action: "reviewBlocks",
      detail: "Review the active source before moving into generated-audio or read-along stages.",
      label: "Review first",
      stage,
      state: "blocked",
      tone: "warning",
    });
  }
  if (!input.hasListenerText) {
    return listenerTextReadiness(stage);
  }
  if (stage === "preview") {
    return previewStageReadiness(input);
  }
  if (stage === "teleprompt") {
    return telepromptStageReadiness(input);
  }
  return theatreStageReadiness(input);
}

function sourceGateReadiness(
  input: WorkspaceStageStatusInput,
  stage: WorkspaceStage,
): WorkspaceStageReadiness | null {
  if (input.sourceError) {
    return stageReadiness({
      action: "intakeSource",
      detail: input.sourceError,
      label: stage === "intake" ? "Source issue" : "Blocked",
      stage,
      state: "failed",
      tone: "danger",
    });
  }
  if (input.sourcePreparing) {
    return stageReadiness({
      action: null,
      detail: "Import, extraction, or source preparation is still running.",
      disabledReason: "Source preparation is still running.",
      label: "Preparing",
      stage,
      state: "working",
      tone: "info",
    });
  }
  if (!input.hasSource) {
    return stageReadiness({
      action: "intakeSource",
      detail: "Choose draft text, a book, a prepared file, or a URL before continuing.",
      label: stage === "intake" ? "Choose source" : "Blocked",
      stage,
      state: stage === "intake" ? "ready" : "blocked",
      tone: stage === "intake" ? "neutral" : "warning",
    });
  }
  return sourceReadinessGateReadiness(input.sourceReadiness, stage);
}

function sourceReadinessGateReadiness(
  readiness: SourceReadiness | null | undefined,
  stage: WorkspaceStage,
): WorkspaceStageReadiness | null {
  if (!readiness || readiness.state === "ready") {
    return null;
  }
  if (readiness.state === "needsMetadata") {
    return stageReadiness({
      action: "intakeSource",
      detail: readiness.detail,
      label: stage === "intake" ? "Confirm metadata" : "Blocked",
      stage,
      state: stage === "intake" ? "ready" : "blocked",
      tone: "warning",
    });
  }
  if (readiness.state === "stale") {
    return stageReadiness({
      action: "intakeSource",
      detail: readiness.staleReason ?? readiness.detail,
      label: "Source stale",
      stage,
      state: "blocked",
      tone: "warning",
    });
  }
  return stageReadiness({
    action: "intakeSource",
    detail: readiness.detail,
    label: readiness.state === "unsupported" ? "Unsupported" : "Source issue",
    stage,
    state: "failed",
    tone: "danger",
  });
}

function reviewStageReadiness(
  input: WorkspaceStageStatusInput,
  reviewWarningCount: number,
): WorkspaceStageReadiness {
  if (input.reviewRequired) {
    return stageReadiness({
      action: "reviewBlocks",
      detail: "Review the active source before moving into generated-audio or read-along stages.",
      label: "Review required",
      stage: "review",
      state: "warning",
      tone: "warning",
    });
  }
  if (reviewWarningCount > 0) {
    return stageReadiness({
      action: "reviewBlocks",
      detail: `${reviewWarningCount.toString()} review ${reviewWarningCount === 1 ? "warning needs" : "warnings need"} attention.`,
      label: "Needs repair",
      stage: "review",
      state: "warning",
      tone: "warning",
    });
  }
  if (!input.hasListenerText) {
    return stageReadiness({
      action: "reviewBlocks",
      detail: "Prepare listener-ready text before Preview, Teleprompt, or Theatre.",
      label: "Review text",
      stage: "review",
      state: "ready",
      tone: "neutral",
    });
  }
  return stageReadiness({
    action: "reviewBlocks",
    detail: "Listener-ready text is available for Preview.",
    label: "Complete",
    stage: "review",
    state: "complete",
    tone: "success",
  });
}

function previewStageReadiness(input: WorkspaceStageStatusInput): WorkspaceStageReadiness {
  if (!input.hasVoice) {
    return stageReadiness({
      action: null,
      detail: input.createDisabledReason ?? "Select a voice or resolve provider setup first.",
      disabledReason:
        input.createDisabledReason ?? "Select a voice or resolve provider setup first.",
      label: "Voice unavailable",
      stage: "preview",
      state: "blocked",
      tone: "warning",
    });
  }
  if (input.audioLifecycle === "failed") {
    return stageReadiness({
      action: "retryGeneration",
      detail: operationalGeneratedAudioLifecycleReason("failed"),
      label: OPERATIONAL_RECOVERY_LABELS.retryGeneration,
      stage: "preview",
      state: "failed",
      tone: "danger",
    });
  }
  if (input.audioLifecycle === "queued" || input.audioLifecycle === "generating") {
    return stageReadiness({
      action: "previewSpeech",
      detail: "Audio is generating. Playback unlocks when ready.",
      label: "Generating",
      stage: "preview",
      state: "working",
      tone: "info",
    });
  }
  if (input.audioLifecycle === "ready") {
    return stageReadiness({
      action: "previewSpeech",
      detail: "Audio is ready for Preview playback, Teleprompt audio-follow, and Theatre.",
      label: "Complete",
      stage: "preview",
      state: "complete",
      tone: "success",
    });
  }
  if (isAudioRecoveryLifecycle(input.audioLifecycle)) {
    return stageReadiness({
      action: "previewSpeech",
      detail: operationalGeneratedAudioLifecycleReason(input.audioLifecycle),
      label: OPERATIONAL_RECOVERY_LABELS.rebuildAudio,
      stage: "preview",
      state: "warning",
      tone: "warning",
    });
  }
  return stageReadiness({
    action: "previewSpeech",
    detail: "Create & Listen will generate audio for the current source, voice, policy, and scope.",
    label: "Create audio",
    stage: "preview",
    state: "ready",
    tone: "neutral",
  });
}

function telepromptStageReadiness(input: WorkspaceStageStatusInput): WorkspaceStageReadiness {
  if (input.audioLifecycle === "failed") {
    return stageReadiness({
      action: "retryGeneration",
      detail:
        "Generation failed. Manual rehearsal remains available inside Teleprompt. Retry generation to unlock audio-follow.",
      label: OPERATIONAL_RECOVERY_LABELS.retryGeneration,
      stage: "teleprompt",
      state: "failed",
      tone: "danger",
    });
  }
  if (input.audioLifecycle === "ready") {
    return stageReadiness({
      action: "openTeleprompt",
      detail: "Cue rehearsal, recording, and audio-follow are available.",
      label: "Ready",
      stage: "teleprompt",
      state: "ready",
      tone: "success",
    });
  }
  return stageReadiness({
    action: "openTeleprompt",
    detail:
      "Manual rehearsal is available. Audio-follow unlocks when generated audio and timing are ready.",
    label: "Rehearsal only",
    stage: "teleprompt",
    state: "manual",
    tone: "info",
  });
}

function theatreStageReadiness(input: WorkspaceStageStatusInput): WorkspaceStageReadiness {
  if (input.audioLifecycle === "ready") {
    return stageReadiness({
      action: "openTheatre",
      detail: "Generated audio is ready for distraction-light playback and follow-along reading.",
      label: "Ready",
      stage: "theatre",
      state: "ready",
      tone: "success",
    });
  }
  if (input.audioLifecycle === "failed") {
    return stageReadiness({
      action: "openTheatre",
      detail:
        "Reading-only mode. Audio-follow and playback are unavailable because generation failed. Use Retry generation from Preview to recover.",
      label: "Reading-only",
      stage: "theatre",
      state: "manual",
      tone: "warning",
    });
  }
  if (input.audioLifecycle === "queued" || input.audioLifecycle === "generating") {
    return stageReadiness({
      action: "openTheatre",
      detail:
        "Reading-only mode. Audio generation is running; playback and audio-follow unlock when timing is ready.",
      label: "Reading-only",
      stage: "theatre",
      state: "manual",
      tone: "info",
    });
  }
  if (isAudioRecoveryLifecycle(input.audioLifecycle)) {
    const detail = operationalGeneratedAudioLifecycleReason(input.audioLifecycle);
    return stageReadiness({
      action: "openTheatre",
      detail: `${detail} Theatre opens in reading-only mode until audio is rebuilt from Preview.`,
      label: "Reading-only",
      stage: "theatre",
      state: "manual",
      tone: "warning",
    });
  }
  return stageReadiness({
    action: "openTheatre",
    detail:
      "Reading-only mode. Audio-follow and playback are unavailable because generated audio is missing. Use Create & Listen from Preview to generate audio.",
    label: "Reading-only",
    stage: "theatre",
    state: "manual",
    tone: "info",
  });
}

function listenerTextReadiness(stage: WorkspaceStage): WorkspaceStageReadiness {
  return stageReadiness({
    action: "reviewBlocks",
    detail: "Prepare listener-ready text in Review before using this stage.",
    label: "Review text",
    stage,
    state: "blocked",
    tone: "warning",
  });
}

function workspaceStageCurrentTask(
  input: WorkspaceStageStatusInput,
  blocker: WorkspaceStageBlocker | null,
  readiness: WorkspaceStageReadiness,
): WorkspaceStageCurrentTask {
  const primaryAction = workspaceStageCurrentTaskAction(input, readiness, blocker);
  const currentTask: Omit<WorkspaceStageCurrentTask, "primaryLabel"> = {
    detail: blocker?.detail ?? readiness.detail,
    disabledReason:
      blocker?.disabledReason ??
      readiness.disabledReason ??
      (primaryAction === null ? readiness.detail : undefined),
    primaryAction,
    title: blocker?.title ?? workspaceStageCurrentTaskTitle(input, readiness),
    tone: blocker ? blockerTone(blocker) : readiness.tone,
  };
  return {
    ...currentTask,
    primaryLabel: workspaceStageCurrentTaskActionLabel(currentTask, {
      reviewWarningCount: Math.max(0, input.reviewWarningCount ?? 0),
      stage: input.stage,
    }),
  };
}

function workspaceStageCurrentTaskAction(
  input: WorkspaceStageStatusInput,
  readiness: WorkspaceStageReadiness,
  blocker: WorkspaceStageBlocker | null,
): WorkspaceStageActionId | null {
  if (blocker?.correctiveAction) {
    return blocker.correctiveAction;
  }
  switch (input.stage) {
    case "intake": {
      return input.hasSource ? "reviewBlocks" : null;
    }
    case "preview": {
      return previewCurrentTaskAction(input);
    }
    case "review": {
      return reviewCurrentTaskAction(input, readiness);
    }
    case "teleprompt": {
      return telepromptCurrentTaskAction(input, readiness);
    }
    case "theatre": {
      return theatreCurrentTaskAction(input);
    }
  }
}

function previewCurrentTaskAction(input: WorkspaceStageStatusInput): WorkspaceStageActionId | null {
  if (input.audioLifecycle === "ready") {
    return "openTheatre";
  }
  if (input.audioLifecycle === "queued" || input.audioLifecycle === "generating") {
    return null;
  }
  if (input.canCreate) {
    return "createAndListen";
  }
  return null;
}

function reviewCurrentTaskAction(
  input: WorkspaceStageStatusInput,
  readiness: WorkspaceStageReadiness,
): WorkspaceStageActionId | null {
  if (input.reviewRequired || !input.hasListenerText) {
    return null;
  }
  if (readiness.state === "warning") {
    return "reviewBlocks";
  }
  return "previewSpeech";
}

function telepromptCurrentTaskAction(
  input: WorkspaceStageStatusInput,
  readiness: WorkspaceStageReadiness,
): WorkspaceStageActionId | null {
  if (readiness.state === "manual" && input.canCreate) {
    return "createAndListen";
  }
  return input.audioLifecycle === "ready" ? "openTheatre" : null;
}

function theatreCurrentTaskAction(input: WorkspaceStageStatusInput): WorkspaceStageActionId | null {
  if (input.audioLifecycle === "ready") {
    return input.canOpenCinema ? "openCinema" : null;
  }
  if (input.audioLifecycle === "failed") {
    return "retryGeneration";
  }
  if (input.audioLifecycle === "missing" || isAudioRecoveryLifecycle(input.audioLifecycle)) {
    return input.canCreate ? "createAndListen" : null;
  }
  return null;
}

function workspaceStageCurrentTaskTitle(
  input: WorkspaceStageStatusInput,
  readiness: WorkspaceStageReadiness,
): string {
  if (input.stage === "review" && readiness.state === "warning") {
    return "Review needs repair";
  }
  if (input.stage === "preview" && input.audioLifecycle === "missing") {
    return "Ready to create";
  }
  if (input.stage === "preview" && input.audioLifecycle === "ready") {
    return "Audio ready";
  }
  if (input.stage === "teleprompt" && readiness.state === "manual") {
    return "Rehearsal only";
  }
  if (input.stage === "theatre" && input.audioLifecycle === "ready") {
    return "Theatre ready";
  }
  if (input.stage === "theatre") {
    return "Reading-only mode";
  }
  if (input.stage === "intake" && input.hasSource) {
    return "Source ready";
  }
  return readiness.label;
}

function audioRecoveryBlocker(input: WorkspaceStageStatusInput): WorkspaceStageBlocker {
  const id = audioRecoveryBlockerId(input.audioLifecycle);
  const detail = operationalGeneratedAudioLifecycleReason(input.audioLifecycle);
  return {
    correctiveAction: input.canCreate ? "createAndListen" : null,
    detail,
    disabledReason: input.canCreate ? undefined : (input.createDisabledReason ?? detail),
    id,
    recovery: operationalRecovery(
      "rebuildAudio",
      input.canCreate,
      input.canCreate ? undefined : (input.createDisabledReason ?? detail),
    ),
    title: audioRecoveryTitle(input.audioLifecycle),
  };
}

function audioRecoveryBlockerId(lifecycle: GeneratedAudioLifecycleState): WorkspaceStageBlockerId {
  if (lifecycle === "degraded") {
    return "audioDegraded";
  }
  if (lifecycle === "archived") {
    return "audioArchived";
  }
  return "audioStale";
}

function audioRecoveryTitle(lifecycle: GeneratedAudioLifecycleState): string {
  if (lifecycle === "degraded") {
    return "Audio needs rebuild";
  }
  if (lifecycle === "archived") {
    return "Audio archived";
  }
  return "Audio needs rebuild";
}

function isAudioRecoveryLifecycle(lifecycle: GeneratedAudioLifecycleState): boolean {
  return lifecycle === "stale" || lifecycle === "degraded" || lifecycle === "archived";
}

function blockerTone(blocker: WorkspaceStageBlocker): WorkspaceStageReadinessTone {
  return blocker.id === "generationFailed" || blocker.id === "sourceFailed" ? "danger" : "warning";
}

function stageReadiness(readiness: WorkspaceStageReadiness): WorkspaceStageReadiness {
  return readiness;
}
