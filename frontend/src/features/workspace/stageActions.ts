import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";
import { workspacePlaybackActionLabel } from "../playback/workspacePlaybackActions";
import {
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
  | "reviewRequired"
  | "voiceMissing"
  | "audioMissing"
  | "audioStale"
  | "generationFailed";

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
  readonly id: WorkspaceStageBlockerId;
  readonly title: string;
}

export interface WorkspaceStageStatusInput {
  readonly audioLifecycle: GeneratedAudioLifecycleState;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly createDisabledReason?: string;
  readonly hasSource: boolean;
  readonly hasVoice: boolean;
  readonly reviewRequired?: boolean;
  readonly reviewWarningCount?: number;
  readonly sourceError?: string | null;
  readonly sourcePreparing: boolean;
  readonly stage: WorkspaceStage;
}

export type WorkspaceReviewState = "needsRepair" | "ready";

export interface WorkspaceStageStatus {
  readonly blocker: WorkspaceStageBlocker | null;
  readonly description: string;
  readonly inspectorTabs: readonly WorkspaceStageInspectorTabId[];
  readonly label: string;
  readonly nextAction: WorkspaceStageActionId | null;
  readonly primaryAction: WorkspaceStagePrimaryActionId;
  readonly primaryLabel: string;
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

export function resolveWorkspaceStageStatus(
  input: WorkspaceStageStatusInput,
): WorkspaceStageStatus {
  const blocker = workspaceStageBlocker(input);
  const primaryAction = workspaceStagePrimaryActionForStatus(input, blocker);
  const reviewWarningCount = Math.max(0, input.reviewWarningCount ?? 0);
  return {
    blocker,
    description: workspaceStageMeta(input.stage).description,
    inspectorTabs: workspaceStageInspectorTabs(input.stage, blocker),
    label: workspaceStageMeta(input.stage).label,
    nextAction: workspaceStageNextAction(input, blocker),
    primaryAction,
    primaryLabel: workspaceStagePrimaryActionDisplayLabel(primaryAction),
    reviewState: reviewWarningCount > 0 ? "needsRepair" : "ready",
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
      title: "Source needs attention",
    };
  }
  if (input.sourcePreparing) {
    return {
      correctiveAction: null,
      detail: "Import, extraction, or source preparation is still running.",
      id: "sourcePreparing",
      title: "Waiting for source",
    };
  }
  if (!input.hasSource) {
    return {
      correctiveAction: "intakeSource",
      detail: "Choose draft text, a book, a prepared file, or a URL before continuing.",
      id: "waitingForSource",
      title: "No narration source selected",
    };
  }
  if (input.reviewRequired) {
    return {
      correctiveAction: "reviewBlocks",
      detail: "Review the active source before moving into generated-audio or read-along stages.",
      id: "reviewRequired",
      title: "Review required",
    };
  }
  if (!input.hasVoice && input.stage !== "intake" && input.stage !== "review") {
    return {
      correctiveAction: null,
      detail: input.createDisabledReason ?? "Select a voice or resolve provider setup first.",
      id: "voiceMissing",
      title: "Voice unavailable",
    };
  }
  return workspaceAudioStageBlocker(input);
}

function workspaceAudioStageBlocker(
  input: WorkspaceStageStatusInput,
): WorkspaceStageBlocker | null {
  if (input.stage === "intake" || input.stage === "review") {
    return null;
  }
  if (input.audioLifecycle === "failed") {
    return {
      correctiveAction: "retryGeneration",
      detail: "The last generation attempt failed or was cancelled.",
      id: "generationFailed",
      title: "Audio generation failed",
    };
  }
  if (input.audioLifecycle === "stale" && input.stage === "theatre") {
    return {
      correctiveAction: "createAndListen",
      detail: "Audio exists, but it does not match the current source, voice, policy, or scope.",
      id: "audioStale",
      title: "Audio is stale",
    };
  }
  if (input.stage !== "theatre" || input.audioLifecycle === "ready") {
    return null;
  }
  return {
    correctiveAction: input.canCreate ? "createAndListen" : null,
    detail:
      input.audioLifecycle === "generating" || input.audioLifecycle === "queued"
        ? "Generated audio is not ready yet."
        : "Create audio before Theatre can play the source.",
    id: "audioMissing",
    title: "Audio missing",
  };
}

function workspaceStagePrimaryActionForStatus(
  input: WorkspaceStageStatusInput,
  blocker: WorkspaceStageBlocker | null,
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
  if (input.stage === "theatre" && input.audioLifecycle === "failed") {
    return "retryGeneration";
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
