import {
  generatedAudioLifecycleReason,
  isGeneratedAudioPlayable,
  type GeneratedAudioLifecycleState,
} from "./generatedAudioLifecycle";

export type CreateAndListenScope = "current-scope" | "selected-block" | "whole-source";

export type WorkspacePlaybackActionKey = "createAndListen" | "openCinema";

export type WorkspacePlaybackLabelKey = WorkspacePlaybackActionKey | "retryGeneration";

export function createAndListenScopeLabel(scope: CreateAndListenScope): string {
  if (scope === "selected-block") {
    return "selected block";
  }
  if (scope === "whole-source") {
    return "whole source";
  }
  return "current scope";
}

export function createAndListenAriaLabel(scope: CreateAndListenScope): string {
  return `Create & Listen: generate ${createAndListenScopeLabel(scope)}`;
}

export function workspacePlaybackActionLabel(action: WorkspacePlaybackLabelKey): string {
  if (action === "createAndListen") {
    return "Create & Listen";
  }
  if (action === "retryGeneration") {
    return "Retry generation";
  }
  return "Open Cinema";
}

export function workspacePlaybackActionDisabledReason({
  action,
  fallbackReason,
  lifecycle,
  scope = "current-scope",
}: Readonly<{
  action: WorkspacePlaybackActionKey;
  fallbackReason?: string;
  lifecycle: GeneratedAudioLifecycleState;
  scope?: CreateAndListenScope;
}>): string | undefined {
  if (isGeneratedAudioPlayable(lifecycle)) {
    return fallbackReason;
  }
  if (action === "createAndListen") {
    return fallbackReason ?? `Cannot generate ${createAndListenScopeLabel(scope)} yet.`;
  }
  return `${generatedAudioLifecycleReason(lifecycle)} Open Cinema unlocks after ${createAndListenScopeLabel(
    scope,
  )} audio is ready.`;
}

export function workspacePlaybackActionDataAttributes(
  action: WorkspacePlaybackActionKey,
  lifecycle: GeneratedAudioLifecycleState,
) {
  const owner = action === "openCinema" ? "cinema" : "workspace";
  return {
    "data-command-id": action === "openCinema" ? "cinema:open-current" : "playback:create-listen",
    "data-generated-audio-lifecycle": lifecycle,
    "data-playback-action": action === "openCinema" ? "open-cinema" : "create-and-listen",
    "data-playback-owner": owner,
    "data-playback-primary": undefined,
    "data-shortcut-command-id": action === "createAndListen" ? "playback.createListen" : undefined,
    "data-ui-action-owner": owner,
  } as const;
}
