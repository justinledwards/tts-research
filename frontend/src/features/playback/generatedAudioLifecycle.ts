import type { VoiceJob } from "../../types";
import {
  operationalGeneratedAudioLifecycleLabel,
  operationalGeneratedAudioLifecycleReason,
} from "../operational-status";

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
    disabledReason: operationalGeneratedAudioLifecycleReason("archived"),
    label: "Archived",
    state: "archived",
    summary: "Audio exists only as an archived asset.",
    tone: "muted",
    visualClassName:
      "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] text-[var(--vs-text-muted)]",
  }),
  degraded: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("degraded"),
    label: "Needs rebuild",
    state: "degraded",
    summary: "Audio metadata exists, but playback is not currently reliable.",
    tone: "warning",
    visualClassName:
      "border-[var(--vs-warning-border)] bg-[var(--vs-warning-soft)] text-[var(--vs-warning)]",
  }),
  failed: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("failed"),
    label: "Failed",
    state: "failed",
    summary: "The last generation attempt failed before playable audio was ready.",
    tone: "danger",
    visualClassName:
      "border-[var(--vs-danger-border)] bg-[var(--vs-danger-soft)] text-[var(--vs-danger)]",
  }),
  generating: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("generating"),
    label: "Generating",
    state: "generating",
    summary: "Audio is being optimized, synthesized, checked, or retried.",
    tone: "info",
    visualClassName:
      "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
  }),
  missing: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("missing"),
    label: "Missing",
    state: "missing",
    summary: "No generated audio exists for this source and scope yet.",
    tone: "neutral",
    visualClassName:
      "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] text-[var(--vs-text-secondary)]",
  }),
  queued: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("queued"),
    label: "Queued",
    state: "queued",
    summary: "Audio generation is queued.",
    tone: "info",
    visualClassName:
      "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
  }),
  ready: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("ready"),
    label: "Ready",
    state: "ready",
    summary: "Audio is ready for playback.",
    tone: "success",
    visualClassName:
      "border-[var(--vs-success-border)] bg-[var(--vs-success-soft)] text-[var(--vs-success)]",
  }),
  stale: lifecycleDescriptor({
    disabledReason: operationalGeneratedAudioLifecycleReason("stale"),
    label: "Needs rebuild",
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
    return completedJobHasPlayableAudio(job) ? "ready" : "degraded";
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
  return operationalGeneratedAudioLifecycleReason(state);
}

export function generatedAudioLifecycleLabel(state: GeneratedAudioLifecycleState): string {
  return operationalGeneratedAudioLifecycleLabel(state);
}

export function generatedAudioLifecycleVisualClassName(
  state: GeneratedAudioLifecycleState,
): string {
  return generatedAudioLifecycleDescriptor(state).visualClassName;
}

export function isGeneratedAudioPlayable(state: GeneratedAudioLifecycleState): boolean {
  return state === "ready";
}

export function generatedAudioReadySegmentCount(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const readyByManifest = job.partialAudioManifest?.readySegments ?? 0;
  const readyBySegments = (job.segments ?? []).filter(
    (segment) => segment.status === "ready",
  ).length;
  return Math.max(0, readyByManifest, job.audioReadySegments ?? 0, readyBySegments);
}

export function generatedAudioTotalSegmentCount(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const legacyRetries = (job as { retries?: { totalSegments?: number } }).retries;
  return Math.max(
    0,
    job.partialAudioManifest?.totalSegments ?? 0,
    legacyRetries?.totalSegments ?? 0,
    job.segments?.length ?? 0,
  );
}

export function completedJobHasPlayableAudio(job: VoiceJob | null | undefined): boolean {
  if (job?.status !== "completed") {
    return false;
  }
  const audioUrls = job as { audioPartialUrl?: string; audioUrl?: string };
  if ((audioUrls.audioUrl?.trim() ?? "").length > 0) {
    return true;
  }
  if ((audioUrls.audioPartialUrl?.trim() ?? "").length === 0) {
    return false;
  }
  const totalSegments = generatedAudioTotalSegmentCount(job);
  return totalSegments > 0 && generatedAudioReadySegmentCount(job) >= totalSegments;
}

export function isGeneratedAudioWorkingJob(job: VoiceJob | null | undefined): boolean {
  return (
    job?.status === "queued" ||
    job?.status === "optimizing" ||
    job?.status === "synthesizing" ||
    job?.status === "checking" ||
    job?.status === "retrying"
  );
}

export function isGeneratedAudioPartiallyPlayable(job: VoiceJob | null | undefined): boolean {
  if (!job || job.status === "completed") {
    return false;
  }
  return (
    generatedAudioReadySegmentCount(job) > 0 &&
    ((job.audioPartialUrl?.trim() ?? "").length > 0 ||
      (job.partialAudioManifest?.audioUrl?.trim() ?? "").length > 0)
  );
}

export function canQueueGeneratedAudioPlayback(job: VoiceJob | null | undefined): boolean {
  return (
    isGeneratedAudioPartiallyPlayable(job) ||
    (isGeneratedAudioWorkingJob(job) && generatedAudioTotalSegmentCount(job) > 0)
  );
}

function lifecycleDescriptor(
  descriptor: GeneratedAudioLifecycleDescriptor,
): GeneratedAudioLifecycleDescriptor {
  return descriptor;
}
