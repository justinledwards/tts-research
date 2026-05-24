import {
  generatedAudioLifecycleDescriptor,
  isGeneratedAudioPlayable,
  type GeneratedAudioLifecycleState,
} from "./generatedAudioLifecycle";
import {
  playbackOwnerCanRequestGeneration,
  playbackOwnerDefinition,
  type PlaybackOwner,
} from "./playbackOwner";

export type PlaybackAvailabilityState =
  | "archived"
  | "degraded"
  | "failed"
  | "generating"
  | "missing"
  | "playable"
  | "queued"
  | "stale";

export interface PlaybackStateModel {
  readonly canPlay: boolean;
  readonly canRequestGeneration: boolean;
  readonly disabledReason: string | null;
  readonly lifecycle: GeneratedAudioLifecycleState;
  readonly owner: PlaybackOwner;
  readonly ownerLabel: string;
  readonly state: PlaybackAvailabilityState;
  readonly statusLabel: string;
}

export function buildPlaybackState({
  lifecycle,
  owner,
}: Readonly<{
  lifecycle: GeneratedAudioLifecycleState;
  owner: PlaybackOwner;
}>): PlaybackStateModel {
  const descriptor = generatedAudioLifecycleDescriptor(lifecycle);
  const ownerDefinition = playbackOwnerDefinition(owner);
  const canPlay = ownerDefinition.ownsPlaybackControls && isGeneratedAudioPlayable(lifecycle);
  return {
    canPlay,
    canRequestGeneration: playbackOwnerCanRequestGeneration(owner),
    disabledReason: canPlay ? null : descriptor.disabledReason,
    lifecycle,
    owner,
    ownerLabel: ownerDefinition.label,
    state: playbackAvailabilityStateForLifecycle(lifecycle),
    statusLabel: descriptor.label,
  };
}

export function playbackAvailabilityStateForLifecycle(
  lifecycle: GeneratedAudioLifecycleState,
): PlaybackAvailabilityState {
  if (lifecycle === "ready") {
    return "playable";
  }
  return lifecycle;
}
