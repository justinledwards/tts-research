import { isNarrowViewport } from "../layout/responsive";

export type WorkspaceStage = "intake" | "review" | "preview" | "teleprompt";
export type WorkspaceLayoutMode = "focus" | "balanced" | "full" | "custom";
export type WorkspaceRailMode = "collapsed" | "compact" | "full";
export type WorkspaceSourceType = "book" | "draft" | "prepared";
export type WorkspaceLayoutSlot = "sourceContext" | "contextInspector" | "systemStatus";
export type WorkspaceLayoutSlotDensity = "hidden" | "summary" | "pinned";

export interface WorkspaceContext {
  activeBlockId: string | null;
  customLayout: WorkspaceCustomLayout;
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

export type WorkspaceCustomLayout = Record<WorkspaceLayoutSlot, WorkspaceLayoutSlotDensity>;

export interface WorkspaceResolvedLayout extends WorkspaceCustomLayout {
  layoutMode: WorkspaceLayoutMode;
}

export const WORKSPACE_LAYOUT_STORAGE_KEY = "tts-workspace-layout-mode";

export const WORKSPACE_STAGES: readonly WorkspaceStage[] = [
  "intake",
  "review",
  "preview",
  "teleprompt",
];

export const WORKSPACE_LAYOUT_MODES: readonly WorkspaceLayoutMode[] = [
  "focus",
  "balanced",
  "full",
  "custom",
];

export const WORKSPACE_LAYOUT_SLOTS: readonly WorkspaceLayoutSlot[] = [
  "sourceContext",
  "contextInspector",
  "systemStatus",
];

export const WORKSPACE_LAYOUT_SLOT_DENSITIES: readonly WorkspaceLayoutSlotDensity[] = [
  "hidden",
  "summary",
  "pinned",
];

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

export interface WorkspaceLayoutSlotMeta {
  description: string;
  id: WorkspaceLayoutSlot;
  label: string;
}

export interface WorkspaceLayoutSlotDensityMeta {
  description: string;
  id: WorkspaceLayoutSlotDensity;
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
  custom: {
    description: "Use the saved workspace panel pins from the layout menu.",
    id: "custom",
    keywords: ["custom", "pins", "advanced"],
    label: "Custom",
  },
};

export const WORKSPACE_LAYOUT_SLOT_META: Record<WorkspaceLayoutSlot, WorkspaceLayoutSlotMeta> = {
  contextInspector: {
    description: "Stage-aware inspector, playback, review context, and teleprompt cue context.",
    id: "contextInspector",
    label: "Inspector",
  },
  sourceContext: {
    description: "Source, voice, policy, project, and backend setup context.",
    id: "sourceContext",
    label: "Source context",
  },
  systemStatus: {
    description: "Narration and voice-cloning activity, progress, and status.",
    id: "systemStatus",
    label: "System status",
  },
};

export const WORKSPACE_LAYOUT_SLOT_DENSITY_META: Record<
  WorkspaceLayoutSlotDensity,
  WorkspaceLayoutSlotDensityMeta
> = {
  hidden: {
    description: "Keep the slot out of the workspace. System status keeps an essential strip.",
    id: "hidden",
    label: "Hidden",
  },
  pinned: {
    description: "Keep the full panel visible.",
    id: "pinned",
    label: "Pinned",
  },
  summary: {
    description: "Show compact contextual information.",
    id: "summary",
    label: "Summary",
  },
};

export const DEFAULT_WORKSPACE_CUSTOM_LAYOUT: WorkspaceCustomLayout = {
  contextInspector: "summary",
  sourceContext: "hidden",
  systemStatus: "hidden",
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

export function workspaceLayoutSlotMeta(slot: WorkspaceLayoutSlot): WorkspaceLayoutSlotMeta {
  return WORKSPACE_LAYOUT_SLOT_META[slot];
}

export function workspaceLayoutSlotDensityMeta(
  density: WorkspaceLayoutSlotDensity,
): WorkspaceLayoutSlotDensityMeta {
  return WORKSPACE_LAYOUT_SLOT_DENSITY_META[density];
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

export function normalizeWorkspaceLayoutSlotDensity(
  value: unknown,
  fallback: WorkspaceLayoutSlotDensity = "hidden",
): WorkspaceLayoutSlotDensity {
  return WORKSPACE_LAYOUT_SLOT_DENSITIES.includes(value as WorkspaceLayoutSlotDensity)
    ? (value as WorkspaceLayoutSlotDensity)
    : fallback;
}

export function normalizeWorkspaceCustomLayout(value: unknown): WorkspaceCustomLayout {
  const candidate =
    value && typeof value === "object" ? (value as Partial<WorkspaceCustomLayout>) : {};
  return {
    contextInspector: normalizeWorkspaceLayoutSlotDensity(
      candidate.contextInspector,
      DEFAULT_WORKSPACE_CUSTOM_LAYOUT.contextInspector,
    ),
    sourceContext: normalizeWorkspaceLayoutSlotDensity(
      candidate.sourceContext,
      DEFAULT_WORKSPACE_CUSTOM_LAYOUT.sourceContext,
    ),
    systemStatus: normalizeWorkspaceLayoutSlotDensity(
      candidate.systemStatus,
      DEFAULT_WORKSPACE_CUSTOM_LAYOUT.systemStatus,
    ),
  };
}

export function workspaceCustomLayoutEqual(
  left: WorkspaceCustomLayout,
  right: WorkspaceCustomLayout,
): boolean {
  return WORKSPACE_LAYOUT_SLOTS.every(
    (slot) =>
      normalizeWorkspaceLayoutSlotDensity(left[slot]) ===
      normalizeWorkspaceLayoutSlotDensity(right[slot]),
  );
}

export function normalizeWorkspaceRailMode(value: unknown): WorkspaceRailMode {
  if (value === "full" || value === "compact" || value === "collapsed") {
    return value;
  }
  return "compact";
}

export function workspaceResolvedLayout(
  mode: WorkspaceLayoutMode,
  customLayout: WorkspaceCustomLayout = DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
): WorkspaceResolvedLayout {
  if (mode === "custom") {
    return {
      ...normalizeWorkspaceCustomLayout(customLayout),
      layoutMode: "custom",
    };
  }
  if (mode === "focus") {
    return {
      contextInspector: "hidden",
      layoutMode: "focus",
      sourceContext: "hidden",
      systemStatus: "hidden",
    };
  }
  if (mode === "full") {
    return {
      contextInspector: "pinned",
      layoutMode: "full",
      sourceContext: "pinned",
      systemStatus: "pinned",
    };
  }
  return {
    contextInspector: "summary",
    layoutMode: "balanced",
    sourceContext: "hidden",
    systemStatus: "hidden",
  };
}

export function workspaceLayoutRails(
  mode: WorkspaceLayoutMode,
  customLayout: WorkspaceCustomLayout = DEFAULT_WORKSPACE_CUSTOM_LAYOUT,
): WorkspaceLayoutRails {
  const layout = workspaceResolvedLayout(mode, customLayout);
  return {
    activityFooterMode: workspaceRailModeForSlotDensity(layout.systemStatus),
    leftRailMode: workspaceRailModeForSlotDensity(layout.sourceContext),
    rightRailMode: workspaceRailModeForSlotDensity(layout.contextInspector),
  };
}

export function workspaceRailModeForSlotDensity(
  density: WorkspaceLayoutSlotDensity,
): WorkspaceRailMode {
  if (density === "pinned") {
    return "full";
  }
  if (density === "summary") {
    return "compact";
  }
  return "collapsed";
}

export function createWorkspaceContext(value: Partial<WorkspaceContext> = {}): WorkspaceContext {
  return normalizeWorkspaceContext(value);
}

export function normalizeWorkspaceContext(value: Partial<WorkspaceContext>): WorkspaceContext {
  const stage = normalizeWorkspaceStage(value.stage);
  const returnStage = normalizeWorkspaceStage(value.telepromptReturnStage);
  return {
    activeBlockId: cleanOptionalId(value.activeBlockId),
    customLayout: normalizeWorkspaceCustomLayout(value.customLayout),
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
