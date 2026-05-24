import { workspacePlaybackActionLabel } from "../playback/workspacePlaybackActions";
import { transitionWorkspaceStage, type WorkspaceContext, type WorkspaceStage } from "./model";

export type WorkspaceStageActionId =
  | "intakeSource"
  | "inspectStructure"
  | "reviewBlocks"
  | "previewSpeech"
  | "openTeleprompt"
  | "createAndListen"
  | "openCinema"
  | "retryGeneration"
  | "exportArtifact";

export type WorkspaceStageActionKind = "navigation" | "primary" | "secondary";

export interface WorkspaceStageAction {
  readonly description: string;
  readonly id: WorkspaceStageActionId;
  readonly kind: WorkspaceStageActionKind;
  readonly label: string;
  readonly targetStage: WorkspaceStage | null;
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
    label: "Review",
    targetStage: "review",
  },
};

export const WORKSPACE_STAGE_NAVIGATION_ACTIONS: Record<WorkspaceStage, WorkspaceStageActionId> = {
  intake: "intakeSource",
  preview: "previewSpeech",
  review: "reviewBlocks",
  teleprompt: "openTeleprompt",
};

export const WORKSPACE_STAGE_PRIMARY_ACTIONS: Record<WorkspaceStage, WorkspaceStageActionId> = {
  intake: "reviewBlocks",
  preview: "createAndListen",
  review: "previewSpeech",
  teleprompt: "createAndListen",
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
