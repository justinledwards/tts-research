import type { SourceLifecycleEnvelope } from "../source-lifecycle";
import type { WorkspaceReturnStage } from "../workspace";
import type { TelepromptReturnMemoryScope, TelepromptReturnTarget } from "./telepromptReturnMemory";

export interface TemporaryTelepromptContextAdapter {
  readonly active: boolean;
  readonly memoryScope: TelepromptReturnMemoryScope;
  readonly returnTarget: TelepromptReturnTarget;
  readonly sourceStatusLabel: string;
  readonly theatreSourceScopeLabel: string;
  readonly temporarySourceId: string | null;
}

export function buildTemporaryTelepromptContextAdapter({
  returnStage,
  scopeLabel,
  sourceLifecycle,
}: Readonly<{
  returnStage: WorkspaceReturnStage;
  scopeLabel: string;
  sourceLifecycle?: SourceLifecycleEnvelope | null;
}>): TemporaryTelepromptContextAdapter {
  const temporarySourceId = sourceLifecycle?.temporarySourceId ?? null;
  const active = sourceLifecycle?.sourceOwner === "temporary" || Boolean(temporarySourceId);
  return {
    active,
    memoryScope: active ? "temporary-session" : "project",
    returnTarget: returnStage === "preview" ? "preview" : "review",
    sourceStatusLabel: active ? temporaryStatusLabel(sourceLifecycle) : "Project source",
    temporarySourceId,
    theatreSourceScopeLabel: active
      ? `Temporary source · ${scopeLabel || "Temporary session"}`
      : scopeLabel,
  };
}

function temporaryStatusLabel(sourceLifecycle?: SourceLifecycleEnvelope | null): string {
  if (sourceLifecycle?.temporaryStatus === "expired") {
    return "Temporary source expired";
  }
  if (sourceLifecycle?.temporaryStatus === "discarded") {
    return "Temporary source discarded";
  }
  if (
    sourceLifecycle?.promotionStatus === "promoted" ||
    sourceLifecycle?.temporaryStatus === "promoted"
  ) {
    return "Temporary source kept in project";
  }
  if (sourceLifecycle?.generatedAudioState === "ready") {
    return "Temporary source · audio ready";
  }
  if (
    sourceLifecycle?.generatedAudioState === "generating" ||
    sourceLifecycle?.generatedAudioState === "queued"
  ) {
    return "Temporary source · generating audio";
  }
  if (sourceLifecycle?.sourceReadiness.state === "ready") {
    return "Temporary source";
  }
  return sourceLifecycle?.sourceReadiness.detail ?? "Temporary source";
}
