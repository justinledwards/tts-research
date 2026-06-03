import type { GeneratedAudioLifecycleState } from "../playback";
import type { ReadAlongTimingState } from "../readalong";

export const THEATRE_RUNTIME_MODES = [
  "audio-follow",
  "recording-rehearsal",
  "reading-only",
] as const;

export const THEATRE_AVAILABILITY_STATES = [
  "ready",
  "waiting-audio",
  "waiting-timing",
  "low-confidence",
  "generation-failed",
  "renderer-failed",
] as const;

export const THEATRE_CONTROL_ZONES = [
  "persistent",
  "listener",
  "return",
  "operator",
  "environment",
  "emergency",
] as const;

export const THEATRE_REVEALED_CONTROL_ZONE_ORDER = [
  "listener",
  "return",
  "operator",
  "environment",
  "emergency",
] as const satisfies readonly TheatreControlZone[];

export type TheatreRuntimeMode = (typeof THEATRE_RUNTIME_MODES)[number];
export type TheatreAvailabilityState = (typeof THEATRE_AVAILABILITY_STATES)[number];
export type TheatreControlZone = (typeof THEATRE_CONTROL_ZONES)[number];

export interface TheatreRuntimeShellState {
  readonly availabilityState: TheatreAvailabilityState;
  readonly detail: string;
  readonly mode: TheatreRuntimeMode;
  readonly statusLabel: string;
}

export interface TheatreRuntimeShellStateInput {
  readonly availabilityState?: TheatreAvailabilityState;
  readonly audioLifecycle?: GeneratedAudioLifecycleState;
  readonly playbackAvailable: boolean;
  readonly playbackPlaying?: boolean;
  readonly rendererLifecycle?: TheatreRendererLifecycleState;
  readonly requestedMode?: TheatreRuntimeMode;
  readonly timingState?: ReadAlongTimingState;
}

export type TheatreRendererLifecycleState =
  | "degraded"
  | "failed"
  | "loading"
  | "notStarted"
  | "ready";

export function theatreRuntimeShellState({
  availabilityState,
  audioLifecycle = "missing",
  playbackAvailable,
  playbackPlaying = false,
  rendererLifecycle = "ready",
  requestedMode,
  timingState = "trusted",
}: TheatreRuntimeShellStateInput): TheatreRuntimeShellState {
  const resolvedAvailability =
    availabilityState ??
    theatreAvailabilityState({
      audioLifecycle,
      playbackAvailable,
      rendererLifecycle,
      timingState,
    });
  const mode = theatreRuntimeMode({
    availabilityState: resolvedAvailability,
    playbackAvailable,
    requestedMode,
  });
  return {
    availabilityState: resolvedAvailability,
    detail: theatreRuntimeDetail(resolvedAvailability, mode, playbackPlaying),
    mode,
    statusLabel: theatreRuntimeStatusLabel(resolvedAvailability, mode, playbackPlaying),
  };
}

export function theatreAvailabilityState({
  audioLifecycle = "missing",
  playbackAvailable,
  rendererLifecycle = "ready",
  timingState = "trusted",
}: Readonly<{
  audioLifecycle?: GeneratedAudioLifecycleState;
  playbackAvailable: boolean;
  rendererLifecycle?: TheatreRendererLifecycleState;
  timingState?: ReadAlongTimingState;
}>): TheatreAvailabilityState {
  if (rendererLifecycle === "failed") {
    return "renderer-failed";
  }
  if (audioLifecycle === "failed") {
    return "generation-failed";
  }
  if (!playbackAvailable) {
    return "waiting-audio";
  }
  if (timingState === "lowConfidence") {
    return "low-confidence";
  }
  if (
    timingState === "degraded" ||
    timingState === "estimated" ||
    timingState === "resyncing" ||
    timingState === "stale"
  ) {
    return "waiting-timing";
  }
  return "ready";
}

export function theatreRuntimeMode({
  availabilityState,
  playbackAvailable,
  requestedMode,
}: Readonly<{
  availabilityState: TheatreAvailabilityState;
  playbackAvailable: boolean;
  requestedMode?: TheatreRuntimeMode;
}>): TheatreRuntimeMode {
  if (requestedMode === "recording-rehearsal") {
    return "recording-rehearsal";
  }
  if (!playbackAvailable || availabilityState !== "ready") {
    return "reading-only";
  }
  return requestedMode ?? "audio-follow";
}

export function theatreRuntimeStatusLabel(
  availabilityState: TheatreAvailabilityState,
  mode: TheatreRuntimeMode,
  playbackPlaying = false,
): string {
  if (availabilityState === "ready") {
    if (mode === "recording-rehearsal") {
      return "Recording rehearsal";
    }
    return playbackPlaying ? "Audio-follow running" : "Audio-follow ready";
  }
  switch (availabilityState) {
    case "generation-failed": {
      return "Generation failed";
    }
    case "low-confidence": {
      return "Low-confidence sync";
    }
    case "renderer-failed": {
      return "Reader failed";
    }
    case "waiting-audio": {
      return mode === "recording-rehearsal" ? "Recording rehearsal" : "Reading only";
    }
    case "waiting-timing": {
      return "Timing unavailable";
    }
  }
}

export function theatreRuntimeDetail(
  availabilityState: TheatreAvailabilityState,
  mode: TheatreRuntimeMode,
  playbackPlaying = false,
): string {
  if (availabilityState === "ready") {
    if (mode === "recording-rehearsal") {
      return "Manual cue advance is active; Theatre is not following generated audio.";
    }
    return playbackPlaying
      ? "Generated audio and trusted timing are driving the current cue."
      : "Generated audio and trusted timing are ready for audio-follow.";
  }
  switch (availabilityState) {
    case "generation-failed": {
      return "Generated audio failed. Theatre remains readable until generation is retried.";
    }
    case "low-confidence": {
      return "Generated audio is available, but word-level timing confidence is below the trusted threshold.";
    }
    case "renderer-failed": {
      return "The reader surface failed. Exit Theatre or retry the reader before trusting playback.";
    }
    case "waiting-audio": {
      return mode === "recording-rehearsal"
        ? "Manual cue advance is available while generated audio is not ready."
        : "Readable text is available while generated audio is missing or still preparing.";
    }
    case "waiting-timing": {
      return "Audio may be available, but Theatre is withholding audio-follow until timing is trusted.";
    }
  }
}
