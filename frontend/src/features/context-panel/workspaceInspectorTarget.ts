import type { StatusChipTone } from "../../design";
import type { OperationalStatusIssue } from "../operational-status";
import type { WorkspaceStage } from "../workspace";
import type { InspectorFact, InspectorNote } from "./InspectorSections";
import type { ContextPanelTabId } from "./contextPanelTabs";

export type WorkspaceInspectorTargetKind = "cue" | "issue" | "job" | "source" | "stage" | "voice";

export interface WorkspaceInspectorTargetBase {
  readonly id: string;
  readonly kind: WorkspaceInspectorTargetKind;
  readonly label: string;
}

export interface WorkspaceInspectorStageTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "stage";
  readonly stage: WorkspaceStage;
}

export interface WorkspaceInspectorIssueTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "issue";
}

export interface WorkspaceInspectorCueTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "cue";
}

export interface WorkspaceInspectorSourceTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "source";
}

export interface WorkspaceInspectorVoiceTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "voice";
}

export interface WorkspaceInspectorJobTarget extends WorkspaceInspectorTargetBase {
  readonly kind: "job";
}

export type WorkspaceInspectorTarget =
  | WorkspaceInspectorCueTarget
  | WorkspaceInspectorIssueTarget
  | WorkspaceInspectorJobTarget
  | WorkspaceInspectorSourceTarget
  | WorkspaceInspectorStageTarget
  | WorkspaceInspectorVoiceTarget;

export interface WorkspaceInspectorCueDetail {
  readonly detail: string;
  readonly facts: readonly InspectorFact[];
  readonly id: string;
  readonly label: string;
  readonly notes?: readonly InspectorNote[];
  readonly timingLabel: string;
}

export interface WorkspaceInspectorJobDetail {
  readonly detail: string;
  readonly facts: readonly InspectorFact[];
  readonly id: string;
  readonly label: string;
  readonly notes?: readonly InspectorNote[];
  readonly tone?: StatusChipTone;
}

export interface WorkspaceInspectorContextTargets {
  readonly cues: readonly WorkspaceInspectorCueDetail[];
  readonly issues: readonly OperationalStatusIssue[];
  readonly jobs: readonly WorkspaceInspectorJobDetail[];
  readonly source: WorkspaceInspectorTarget | null;
  readonly voice: WorkspaceInspectorTarget | null;
}

export interface WorkspaceInspectorResolvedTarget {
  readonly invalidPinnedTarget: WorkspaceInspectorTarget | null;
  readonly source: "fallback" | "pinned" | "selected";
  readonly target: WorkspaceInspectorTarget;
}

export function stageInspectorTarget(stage: WorkspaceStage): WorkspaceInspectorStageTarget {
  return {
    id: `stage:${stage}`,
    kind: "stage",
    label: stage,
    stage,
  };
}

export function workspaceInspectorTargetEqual(
  left: WorkspaceInspectorTarget | null | undefined,
  right: WorkspaceInspectorTarget | null | undefined,
): boolean {
  if (!left || !right) {
    return false;
  }
  return left.kind === right.kind && left.id === right.id;
}

export function resolveWorkspaceInspectorTarget({
  fallbackTarget,
  pinnedTarget,
  selectedTarget,
  stage,
  targets,
}: Readonly<{
  fallbackTarget?: WorkspaceInspectorTarget | null;
  pinnedTarget?: WorkspaceInspectorTarget | null;
  selectedTarget?: WorkspaceInspectorTarget | null;
  stage: WorkspaceStage;
  targets: WorkspaceInspectorContextTargets;
}>): WorkspaceInspectorResolvedTarget {
  if (pinnedTarget) {
    if (workspaceInspectorTargetAvailable(pinnedTarget, targets)) {
      return {
        invalidPinnedTarget: null,
        source: "pinned",
        target: pinnedTarget,
      };
    }
    return {
      invalidPinnedTarget: pinnedTarget,
      source: "pinned",
      target: stageInspectorTarget(stage),
    };
  }
  if (selectedTarget && workspaceInspectorTargetAvailable(selectedTarget, targets)) {
    return {
      invalidPinnedTarget: null,
      source: "selected",
      target: selectedTarget,
    };
  }
  if (fallbackTarget && workspaceInspectorTargetAvailable(fallbackTarget, targets)) {
    return {
      invalidPinnedTarget: null,
      source: "fallback",
      target: fallbackTarget,
    };
  }
  return {
    invalidPinnedTarget: null,
    source: "fallback",
    target: stageInspectorTarget(stage),
  };
}

export function workspaceInspectorTargetAvailable(
  target: WorkspaceInspectorTarget,
  targets: WorkspaceInspectorContextTargets,
): boolean {
  switch (target.kind) {
    case "cue": {
      return targets.cues.some((cue) => cue.id === target.id);
    }
    case "issue": {
      return targets.issues.some((issue) => issue.id === target.id);
    }
    case "job": {
      return targets.jobs.some((job) => job.id === target.id);
    }
    case "source": {
      return targets.source?.id === target.id;
    }
    case "stage": {
      return true;
    }
    case "voice": {
      return targets.voice?.id === target.id;
    }
  }
  const exhaustive: never = target;
  return exhaustive;
}

export function contextPanelTabForWorkspaceInspectorTarget(
  target: WorkspaceInspectorTarget,
): ContextPanelTabId {
  switch (target.kind) {
    case "cue": {
      return "review";
    }
    case "issue":
    case "source":
    case "stage": {
      return "overview";
    }
    case "job": {
      return "diagnostics";
    }
    case "voice": {
      return "policy";
    }
  }
  const exhaustive: never = target;
  return exhaustive;
}
