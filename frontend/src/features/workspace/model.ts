import { isNarrowViewport } from "../layout/responsive";

export type WorkspaceStage = "intake" | "review" | "preview" | "teleprompt";
export type WorkspaceLayoutMode = "focus" | "balanced" | "full";
export type WorkspaceRailMode = "collapsed" | "compact" | "full";
export type WorkspaceSourceType = "book" | "draft" | "prepared";

export interface WorkspaceContext {
  activeBlockId: string | null;
  layoutMode: WorkspaceLayoutMode;
  sourceId: string | null;
  sourceType: WorkspaceSourceType;
  speechPolicyProfile: string | null;
  stage: WorkspaceStage;
  telepromptReturnStage: Exclude<WorkspaceStage, "teleprompt">;
  voiceProfileId: string | null;
}

export interface WorkspaceLayoutRails {
  activityFooterMode: WorkspaceRailMode;
  leftRailMode: WorkspaceRailMode;
  rightRailMode: WorkspaceRailMode;
}

export const WORKSPACE_LAYOUT_STORAGE_KEY = "tts-workspace-layout-mode";

export const WORKSPACE_STAGES: readonly WorkspaceStage[] = [
  "intake",
  "review",
  "preview",
  "teleprompt",
];

export const WORKSPACE_LAYOUT_MODES: readonly WorkspaceLayoutMode[] = ["focus", "balanced", "full"];

export interface WorkspaceStageMeta {
  description: string;
  id: WorkspaceStage;
  keywords: string[];
  label: string;
}

export interface WorkspaceLayoutModeMeta {
  description: string;
  id: WorkspaceLayoutMode;
  keywords: string[];
  label: string;
}

export const WORKSPACE_STAGE_META: Record<WorkspaceStage, WorkspaceStageMeta> = {
  intake: {
    description: "Collect draft text, books, prepared files, and URLs.",
    id: "intake",
    keywords: ["source", "draft", "book", "file", "url"],
    label: "Intake",
  },
  preview: {
    description: "Confirm the spoken form before creating audio.",
    id: "preview",
    keywords: ["spoken", "form", "confirm", "listen"],
    label: "Preview",
  },
  review: {
    description: "Check source blocks, listener text, and validation context.",
    id: "review",
    keywords: ["blocks", "script", "validation", "source"],
    label: "Review",
  },
  teleprompt: {
    description: "Follow the script with preserved source and policy context.",
    id: "teleprompt",
    keywords: ["teleprompter", "script", "read"],
    label: "Teleprompt",
  },
};

export const WORKSPACE_LAYOUT_MODE_META: Record<WorkspaceLayoutMode, WorkspaceLayoutModeMeta> = {
  balanced: {
    description: "Keep rails and the footer compact around the main stage.",
    id: "balanced",
    keywords: ["default", "compact", "rails"],
    label: "Balanced",
  },
  focus: {
    description: "Collapse rails and footer for the most stage-dominant workspace.",
    id: "focus",
    keywords: ["collapse", "minimal", "stage"],
    label: "Focus",
  },
  full: {
    description: "Expand rails and footer for operators who need all controls visible.",
    id: "full",
    keywords: ["expanded", "rails", "operator"],
    label: "Full",
  },
};

export function defaultWorkspaceLayoutMode(): WorkspaceLayoutMode {
  return isNarrowViewport() ? "focus" : "balanced";
}

export function workspaceStageMeta(stage: WorkspaceStage): WorkspaceStageMeta {
  return WORKSPACE_STAGE_META[stage];
}

export function workspaceLayoutModeMeta(mode: WorkspaceLayoutMode): WorkspaceLayoutModeMeta {
  return WORKSPACE_LAYOUT_MODE_META[mode];
}

export function normalizeWorkspaceStage(value: unknown): WorkspaceStage {
  if (value === "sourceIntake") {
    return "intake";
  }
  return WORKSPACE_STAGES.includes(value as WorkspaceStage) ? (value as WorkspaceStage) : "intake";
}

export function normalizeWorkspaceLayoutMode(value: unknown): WorkspaceLayoutMode {
  return WORKSPACE_LAYOUT_MODES.includes(value as WorkspaceLayoutMode)
    ? (value as WorkspaceLayoutMode)
    : defaultWorkspaceLayoutMode();
}

export function normalizeWorkspaceRailMode(value: unknown): WorkspaceRailMode {
  if (value === "full" || value === "compact" || value === "collapsed") {
    return value;
  }
  return "compact";
}

export function workspaceLayoutRails(mode: WorkspaceLayoutMode): WorkspaceLayoutRails {
  if (mode === "focus") {
    return {
      activityFooterMode: "collapsed",
      leftRailMode: "collapsed",
      rightRailMode: "collapsed",
    };
  }
  if (mode === "full") {
    return {
      activityFooterMode: "full",
      leftRailMode: "full",
      rightRailMode: "full",
    };
  }
  return {
    activityFooterMode: "compact",
    leftRailMode: "compact",
    rightRailMode: "compact",
  };
}

export function workspaceLayoutModeForRailMode(mode: WorkspaceRailMode): WorkspaceLayoutMode {
  if (mode === "collapsed") {
    return "focus";
  }
  if (mode === "full") {
    return "full";
  }
  return "balanced";
}

export function createWorkspaceContext(value: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return normalizeWorkspaceContext(value);
}

export function normalizeWorkspaceContext(value: Partial<WorkspaceContext>): WorkspaceContext {
  const stage = normalizeWorkspaceStage(value.stage);
  const returnStage = normalizeWorkspaceStage(value.telepromptReturnStage);
  return {
    activeBlockId: cleanOptionalId(value.activeBlockId),
    layoutMode: normalizeWorkspaceLayoutMode(value.layoutMode),
    sourceId: cleanOptionalId(value.sourceId),
    sourceType: normalizeWorkspaceSourceType(value.sourceType),
    speechPolicyProfile: cleanOptionalId(value.speechPolicyProfile),
    stage,
    telepromptReturnStage: returnStage === "teleprompt" ? "review" : returnStage,
    voiceProfileId: cleanOptionalId(value.voiceProfileId),
  };
}

export function transitionWorkspaceStage(
  context: WorkspaceContext,
  stage: WorkspaceStage,
): WorkspaceContext {
  if (stage === "teleprompt") {
    return enterTelepromptStage(context);
  }
  return {
    ...context,
    stage,
    telepromptReturnStage: stage,
  };
}

export function enterTelepromptStage(context: WorkspaceContext): WorkspaceContext {
  return {
    ...context,
    stage: "teleprompt",
    telepromptReturnStage:
      context.stage === "teleprompt" ? context.telepromptReturnStage : context.stage,
  };
}

export function returnFromTelepromptStage(context: WorkspaceContext): WorkspaceContext {
  return {
    ...context,
    stage: context.telepromptReturnStage,
  };
}

export function withWorkspaceSource(
  context: WorkspaceContext,
  sourceType: WorkspaceSourceType,
  sourceId: string | null,
): WorkspaceContext {
  return {
    ...context,
    activeBlockId:
      context.sourceId === sourceId && context.sourceType === sourceType
        ? context.activeBlockId
        : null,
    sourceId: cleanOptionalId(sourceId),
    sourceType,
  };
}

export function withWorkspaceActiveBlock(
  context: WorkspaceContext,
  activeBlockId: string | null,
): WorkspaceContext {
  return {
    ...context,
    activeBlockId: cleanOptionalId(activeBlockId),
  };
}

export function withWorkspaceVoiceProfile(
  context: WorkspaceContext,
  voiceProfileId: string | null,
): WorkspaceContext {
  return {
    ...context,
    voiceProfileId: cleanOptionalId(voiceProfileId),
  };
}

export function withWorkspaceSpeechPolicyProfile(
  context: WorkspaceContext,
  speechPolicyProfile: string | null,
): WorkspaceContext {
  return {
    ...context,
    speechPolicyProfile: cleanOptionalId(speechPolicyProfile),
  };
}

function normalizeWorkspaceSourceType(value: unknown): WorkspaceSourceType {
  if (value === "book" || value === "prepared" || value === "draft") {
    return value;
  }
  return "draft";
}

function cleanOptionalId(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
