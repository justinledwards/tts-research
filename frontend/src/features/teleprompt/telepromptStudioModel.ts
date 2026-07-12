import type { StatusChipTone } from "../../design";
import {
  generatedAudioLifecycleDescriptor,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";
import type { TelepromptCueSyncMode } from "./telepromptCueTimeline";

export const TELEPROMPT_WORK_MODES = [
  "rehearsal",
  "recording",
  "audio-follow",
  "review-playback",
] as const;

export type TelepromptWorkMode = (typeof TELEPROMPT_WORK_MODES)[number];

export interface TelepromptWorkModeModel {
  readonly dataAttributes: Record<string, string | undefined>;
  readonly detail: string;
  readonly disabledReason?: string;
  readonly label: string;
  readonly mode: TelepromptWorkMode;
  readonly syncMode: TelepromptCueSyncMode;
  readonly tone: StatusChipTone;
}

export interface BuildTelepromptWorkModeModelInput {
  readonly audioProgressPercent?: number;
  readonly generatedAudioLifecycle?: GeneratedAudioLifecycleState;
  readonly mode: TelepromptWorkMode;
  readonly playbackAvailable: boolean;
  readonly playbackPlaying: boolean;
}

export interface TelepromptGeneratedAudioModeInput {
  readonly generatedAudioLifecycle: GeneratedAudioLifecycleState;
  readonly playbackAvailable: boolean;
}

export function telepromptGeneratedAudioReady({
  generatedAudioLifecycle,
  playbackAvailable,
}: TelepromptGeneratedAudioModeInput): boolean {
  return (
    playbackAvailable &&
    (generatedAudioLifecycle === "ready" ||
      generatedAudioLifecycle === "generating" ||
      generatedAudioLifecycle === "queued")
  );
}

export function defaultTelepromptWorkMode(
  input: TelepromptGeneratedAudioModeInput,
): TelepromptWorkMode {
  return telepromptGeneratedAudioReady(input) ? "audio-follow" : "rehearsal";
}

export function telepromptCueSyncModeForWorkMode(mode: TelepromptWorkMode): TelepromptCueSyncMode {
  return workModeBase(mode).syncMode;
}

export function buildTelepromptWorkModeModel({
  audioProgressPercent = 0,
  mode,
  playbackAvailable,
  playbackPlaying,
  generatedAudioLifecycle = playbackAvailable ? "ready" : "missing",
}: BuildTelepromptWorkModeModelInput): TelepromptWorkModeModel {
  const base = workModeBase(mode);
  const disabledReason = workModeDisabledReason(mode, playbackAvailable, generatedAudioLifecycle);
  const detail = workModeDetail({
    audioProgressPercent,
    disabledReason,
    generatedAudioLifecycle,
    mode,
    playbackAvailable,
    playbackPlaying,
  });
  const tone = workModeTone({ disabledReason, mode, playbackPlaying });
  return {
    dataAttributes: {
      "data-teleprompt-work-mode": mode,
      "data-teleprompt-work-mode-disabled": disabledReason ? "true" : undefined,
      "data-teleprompt-work-mode-sync": base.syncMode,
    },
    detail,
    disabledReason,
    label: base.label,
    mode,
    syncMode: base.syncMode,
    tone,
  };
}

function workModeBase(mode: TelepromptWorkMode): {
  readonly label: string;
  readonly syncMode: TelepromptCueSyncMode;
} {
  switch (mode) {
    case "audio-follow": {
      return { label: "Audio-follow", syncMode: "audio-follow" };
    }
    case "recording": {
      return { label: "Recording", syncMode: "manual" };
    }
    case "rehearsal": {
      return { label: "Rehearsal", syncMode: "manual" };
    }
    case "review-playback": {
      return { label: "Review playback", syncMode: "review-playback" };
    }
  }
}

function workModeDisabledReason(
  mode: TelepromptWorkMode,
  playbackAvailable: boolean,
  generatedAudioLifecycle: GeneratedAudioLifecycleState,
): string | undefined {
  if ((mode === "audio-follow" || mode === "review-playback") && !playbackAvailable) {
    const lifecycleReason =
      generatedAudioLifecycle === "ready"
        ? "Generated audio is ready, but playback controls are still loading."
        : generatedAudioLifecycleDescriptor(generatedAudioLifecycle).disabledReason;
    if (mode === "audio-follow") {
      return `${lifecycleReason} Rehearsal remains available.`;
    }
    return lifecycleReason;
  }
  return undefined;
}

function workModeDetail({
  audioProgressPercent = 0,
  disabledReason,
  generatedAudioLifecycle = "missing",
  mode,
  playbackAvailable,
  playbackPlaying,
}: Readonly<
  BuildTelepromptWorkModeModelInput & {
    disabledReason?: string;
  }
>): string {
  if (disabledReason) {
    return disabledReason;
  }
  if (mode === "recording") {
    return "External recording focus. Advance cues manually; Teleprompt is not capturing audio.";
  }
  if (mode === "rehearsal") {
    return "Manual rehearsal. Advance cues at your own pace without generated audio.";
  }
  if (mode === "review-playback") {
    return playbackPlaying
      ? `Review playback is following generated audio at ${audioProgressPercent.toString()}%.`
      : "Generated audio is ready for review playback.";
  }
  if (!playbackAvailable) {
    return "Generated audio and timing are required for audio-follow. Rehearsal remains available.";
  }
  if (generatedAudioLifecycle !== "ready") {
    return playbackPlaying
      ? `Following generated audio at ${audioProgressPercent.toString()}% while generation continues.`
      : "Partial generated audio is available. Play to follow ready cues as new segments arrive.";
  }
  return playbackPlaying
    ? `Following generated audio at ${audioProgressPercent.toString()}%.`
    : "Generated audio is ready. Play to follow cues automatically.";
}

function workModeTone({
  disabledReason,
  mode,
  playbackPlaying,
}: Readonly<{
  disabledReason?: string;
  mode: TelepromptWorkMode;
  playbackPlaying: boolean;
}>): StatusChipTone {
  if (disabledReason) {
    return "warning";
  }
  if (playbackPlaying && (mode === "audio-follow" || mode === "review-playback")) {
    return "success";
  }
  if (mode === "recording") {
    return "danger";
  }
  if (mode === "audio-follow" || mode === "review-playback") {
    return "info";
  }
  return "neutral";
}
