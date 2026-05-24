import {
  generatedAudioLifecycleLabel,
  generatedAudioLifecycleReason,
  isGeneratedAudioPlayable,
  type GeneratedAudioLifecycleState,
} from "./generatedAudioLifecycle";
import { playbackOwnerCanOwnPlaybackControls, type PlaybackOwner } from "./playbackOwner";
import {
  createAndListenScopeLabel,
  workspacePlaybackActionDisabledReason,
  type CreateAndListenScope,
} from "./workspacePlaybackActions";

export {
  createAndListenAriaLabel,
  createAndListenScopeLabel,
  workspacePlaybackActionDataAttributes,
  workspacePlaybackActionDisabledReason,
  workspacePlaybackActionLabel,
  type CreateAndListenScope,
  type WorkspacePlaybackActionKey,
  type WorkspacePlaybackLabelKey,
} from "./workspacePlaybackActions";

export type PlaybackActionMeaning =
  | "ab-compare"
  | "audition"
  | "create-and-listen"
  | "open-cinema"
  | "play"
  | "preview"
  | "rebuild-audio"
  | "retry-generation";

export interface PlaybackActionDefinition {
  readonly id: PlaybackActionMeaning;
  readonly label: string;
  readonly owner: PlaybackOwner;
}

export interface PlaybackSurfaceAction {
  readonly action: PlaybackActionKey;
  readonly owner?: PlaybackOwner;
  readonly primary?: boolean;
}

export interface PlaybackSurfaceOwnershipIssue {
  readonly actionIds: readonly string[];
  readonly kind: "duplicate-playback-action-owner" | "multiple-primary-playback-owners";
  readonly message: string;
  readonly owner?: PlaybackOwner;
}

export type PlaybackActionKey =
  | "abCompare"
  | "audition"
  | "createAndListen"
  | "openCinema"
  | "play"
  | "preview"
  | "rebuildAudio"
  | "retryGeneration"
  | "telepromptPlay";

const PLAYBACK_ACTIONS = {
  abCompare: ["ab-compare", "A/B Compare", "preview"],
  audition: ["audition", "Audition", "preview"],
  createAndListen: ["create-and-listen", "Create & Listen", "workspace"],
  openCinema: ["open-cinema", "Open Cinema", "cinema"],
  play: ["play", "Play", "cinema"],
  preview: ["preview", "Preview", "preview"],
  rebuildAudio: ["rebuild-audio", "Rebuild audio", "cinema"],
  retryGeneration: ["retry-generation", "Retry generation", "workspace"],
  telepromptPlay: ["play", "Play Cue", "teleprompt"],
} as const satisfies Record<
  PlaybackActionKey,
  readonly [PlaybackActionMeaning, string, PlaybackOwner]
>;

export function playbackActionDefinition(actionId: PlaybackActionKey): PlaybackActionDefinition {
  const [id, label, owner] = PLAYBACK_ACTIONS[actionId];
  return { id, label, owner };
}

export function playbackActionLabel(actionId: PlaybackActionKey): string {
  return playbackActionDefinition(actionId).label;
}

export function playbackActionAriaLabel(
  actionId: PlaybackActionKey,
  options: Readonly<{
    createScope?: CreateAndListenScope;
    lifecycle?: GeneratedAudioLifecycleState;
  }> = {},
): string {
  const definition = playbackActionDefinition(actionId);
  if (actionId === "createAndListen") {
    return `Create & Listen: generate ${createAndListenScopeLabel(
      options.createScope ?? "current-scope",
    )}`;
  }
  if (options.lifecycle && !isGeneratedAudioPlayable(options.lifecycle)) {
    return `${definition.label}: ${generatedAudioLifecycleLabel(options.lifecycle)}`;
  }
  return definition.label;
}

export function playbackActionDisabledReason({
  action,
  fallbackReason,
  lifecycle,
  scope = "current-scope",
}: Readonly<{
  action: PlaybackActionKey;
  fallbackReason?: string;
  lifecycle: GeneratedAudioLifecycleState;
  scope?: CreateAndListenScope;
}>): string | undefined {
  if (isGeneratedAudioPlayable(lifecycle)) {
    return fallbackReason;
  }
  const lifecycleReason = generatedAudioLifecycleReason(lifecycle);
  if (action === "createAndListen" || action === "openCinema") {
    return workspacePlaybackActionDisabledReason({
      action,
      fallbackReason,
      lifecycle,
      scope,
    });
  }
  const definition = playbackActionDefinition(action);
  if (definition.owner === "teleprompt") {
    return `${lifecycleReason} Teleprompt cue playback unlocks after generated audio is ready.`;
  }
  if (definition.owner === "preview") {
    return `${lifecycleReason} Preview audition unlocks after generated audio is ready.`;
  }
  return lifecycleReason;
}

export function playbackActionDataAttributes(
  actionId: PlaybackActionKey,
  lifecycle: GeneratedAudioLifecycleState,
  options: Readonly<{ primary?: boolean }> = {},
) {
  const definition = playbackActionDefinition(actionId);
  return {
    "data-generated-audio-lifecycle": lifecycle,
    "data-playback-action": definition.id,
    "data-playback-owner": definition.owner,
    "data-playback-primary": options.primary ? "true" : undefined,
    "data-ui-action-owner": definition.owner,
  } as const;
}

export function validatePlaybackSurfaceOwnership(
  actions: readonly PlaybackSurfaceAction[],
): PlaybackSurfaceOwnershipIssue[] {
  const issues: PlaybackSurfaceOwnershipIssue[] = [];
  const primaryActions = actions.filter((item) => item.primary === true);
  const primaryOwners = [
    ...new Set(
      primaryActions
        .map((item) => item.owner ?? playbackActionDefinition(item.action).owner)
        .filter(playbackOwnerCanOwnPlaybackControls),
    ),
  ];
  if (primaryOwners.length > 1) {
    issues.push({
      actionIds: primaryActions.map((item) => playbackActionDefinition(item.action).id),
      kind: "multiple-primary-playback-owners",
      message: `Surface exposes multiple primary playback owners: ${primaryOwners.join(", ")}.`,
    });
  }

  const actionOwnerCounts = new Map<string, PlaybackSurfaceAction[]>();
  for (const item of primaryActions) {
    const definition = playbackActionDefinition(item.action);
    const owner = item.owner ?? definition.owner;
    const key = `${owner}:${definition.id}`;
    actionOwnerCounts.set(key, [...(actionOwnerCounts.get(key) ?? []), item]);
  }
  for (const [key, group] of actionOwnerCounts) {
    if (group.length <= 1) {
      continue;
    }
    const [owner] = key.split(":") as [PlaybackOwner, string];
    issues.push({
      actionIds: group.map((item) => playbackActionDefinition(item.action).id),
      kind: "duplicate-playback-action-owner",
      message: `Surface exposes duplicate primary playback action for ${owner}.`,
      owner,
    });
  }
  return issues;
}
