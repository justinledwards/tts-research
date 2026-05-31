import type { VoiceJob } from "../../types";

export const GENERATED_AUDIO_LIFECYCLE_STATES = [
  "missing",
  "queued",
  "generating",
  "ready",
  "stale",
  "degraded",
  "failed",
  "archived",
] as const;

export type GeneratedAudioLifecycleState = (typeof GENERATED_AUDIO_LIFECYCLE_STATES)[number];

export type GeneratedAudioLifecycleTone =
  | "danger"
  | "info"
  | "muted"
  | "neutral"
  | "success"
  | "warning";

export interface GeneratedAudioLifecycleDescriptor {
  readonly disabledReason: string;
  readonly label: string;
  readonly state: GeneratedAudioLifecycleState;
  readonly summary: string;
  readonly tone: GeneratedAudioLifecycleTone;
  readonly visualClassName: string;
}

export interface GeneratedAudioLifecycleInput {
  readonly archived?: boolean;
  readonly degraded?: boolean;
  readonly job?: VoiceJob | null;
  readonly stale?: boolean;
}

export const GENERATED_AUDIO_LIFECYCLE_DESCRIPTORS = {
  archived: lifecycleDescriptor({
    disabledReason: "Audio archived. Restore or rebuild before playback.",
    label: "Archived",
    state: "archived",
    summary: "Audio exists only as an archived asset.",
    tone: "muted",
    visualClassName:
      "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] text-[var(--vs-text-muted)]",
  }),
  degraded: lifecycleDescriptor({
    disabledReason: "Audio degraded. Rebuild before playback.",
    label: "Degraded",
    state: "degraded",
    summary: "Audio metadata exists, but playback is not currently reliable.",
    tone: "warning",
    visualClassName:
      "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]",
  }),
  failed: lifecycleDescriptor({
    disabledReason: "Audio failed. Retry generation before playback.",
    label: "Failed",
    state: "failed",
    summary: "The last generation attempt failed or was cancelled.",
    tone: "danger",
    visualClassName:
      "border-[var(--vs-danger-border)] bg-[var(--vs-danger-soft)] text-[var(--vs-danger)]",
  }),
  generating: lifecycleDescriptor({
    disabledReason: "Audio is generating. Playback unlocks when ready.",
    label: "Generating",
    state: "generating",
    summary: "Audio is being optimized, synthesized, checked, or retried.",
    tone: "info",
    visualClassName:
      "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
  }),
  missing: lifecycleDescriptor({
    disabledReason: "Generated audio is missing. Create & Listen before playback.",
    label: "Missing",
    state: "missing",
    summary: "No generated audio exists for this source and scope yet.",
    tone: "neutral",
    visualClassName:
      "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] text-[var(--vs-text-secondary)]",
  }),
  queued: lifecycleDescriptor({
    disabledReason: "Audio queued. Playback unlocks when ready.",
    label: "Queued",
    state: "queued",
    summary: "Audio generation is queued.",
    tone: "info",
    visualClassName:
      "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
  }),
  ready: lifecycleDescriptor({
    disabledReason: "Audio ready.",
    label: "Ready",
    state: "ready",
    summary: "Audio is ready for playback.",
    tone: "success",
    visualClassName:
      "border-[var(--vs-success-border)] bg-[var(--vs-success-soft)] text-[var(--vs-success)]",
  }),
  stale: lifecycleDescriptor({
    disabledReason: "Audio stale. Rebuild before treating it as current.",
    label: "Stale",
    state: "stale",
    summary: "Audio was generated for an older source, scope, voice, or policy.",
    tone: "warning",
    visualClassName:
      "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]",
  }),
} as const satisfies Record<GeneratedAudioLifecycleState, GeneratedAudioLifecycleDescriptor>;

export function generatedAudioLifecycleDescriptor(
  state: GeneratedAudioLifecycleState,
): GeneratedAudioLifecycleDescriptor {
  return GENERATED_AUDIO_LIFECYCLE_DESCRIPTORS[state];
}

export function generatedAudioLifecycleFromJob({
  archived = false,
  degraded = false,
  job,
  stale = false,
}: GeneratedAudioLifecycleInput): GeneratedAudioLifecycleState {
  if (archived) {
    return "archived";
  }
  if (stale) {
    return "stale";
  }
  if (degraded) {
    return "degraded";
  }
  if (!job) {
    return "missing";
  }
  if (job.status === "queued") {
    return "queued";
  }
  if (
    job.status === "optimizing" ||
    job.status === "synthesizing" ||
    job.status === "checking" ||
    job.status === "retrying"
  ) {
    return "generating";
  }
  if (job.status === "completed") {
    return job.audioUrl ? "ready" : "degraded";
  }
  return "failed";
}

export function generatedAudioLifecycleFromPlaybackState(
  playbackState:
    | "completed"
    | "degraded"
    | "generating"
    | "paused"
    | "playable"
    | "playing"
    | "preAudio",
): GeneratedAudioLifecycleState {
  if (playbackState === "preAudio") {
    return "missing";
  }
  if (playbackState === "generating") {
    return "generating";
  }
  if (playbackState === "degraded") {
    return "degraded";
  }
  return "ready";
}

export function generatedAudioLifecycleReason(state: GeneratedAudioLifecycleState): string {
  switch (state) {
    case "archived": {
      return "Audio archived. Restore or rebuild before playback.";
    }
    case "degraded": {
      return "Audio degraded. Rebuild before playback.";
    }
    case "failed": {
      return "Audio failed. Retry generation before playback.";
    }
    case "generating": {
      return "Audio is generating. Playback unlocks when ready.";
    }
    case "queued": {
      return "Audio queued. Playback unlocks when ready.";
    }
    case "ready": {
      return "Audio ready.";
    }
    case "stale": {
      return "Audio stale. Rebuild before treating it as current.";
    }
    case "missing": {
      return "Generated audio is missing. Create & Listen before playback.";
    }
  }
}

export function generatedAudioLifecycleLabel(state: GeneratedAudioLifecycleState): string {
  switch (state) {
    case "archived": {
      return "Archived";
    }
    case "degraded": {
      return "Degraded";
    }
    case "failed": {
      return "Failed";
    }
    case "generating": {
      return "Generating";
    }
    case "queued": {
      return "Queued";
    }
    case "ready": {
      return "Ready";
    }
    case "stale": {
      return "Stale";
    }
    case "missing": {
      return "Missing";
    }
  }
}

export function generatedAudioLifecycleVisualClassName(
  state: GeneratedAudioLifecycleState,
): string {
  return generatedAudioLifecycleDescriptor(state).visualClassName;
}

export function isGeneratedAudioPlayable(state: GeneratedAudioLifecycleState): boolean {
  return state === "ready";
}

function lifecycleDescriptor(
  descriptor: GeneratedAudioLifecycleDescriptor,
): GeneratedAudioLifecycleDescriptor {
  return descriptor;
}
