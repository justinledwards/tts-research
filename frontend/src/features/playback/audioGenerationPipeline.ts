import type { VoiceJob } from "../../types";
import type { GeneratedAudioLifecycleState } from "./generatedAudioLifecycle";

export const AUDIO_GENERATION_PIPELINE_STATES = [
  "notReady",
  "readyToGenerate",
  "queued",
  "generating",
  "partialReady",
  "readyToListen",
  "failed",
  "cancelled",
  "repairRequired",
] as const;

export type AudioGenerationPipelineState = (typeof AUDIO_GENERATION_PIPELINE_STATES)[number];

export interface AudioGenerationPipelineInput {
  readonly canCreate: boolean;
  readonly generatedAudioLifecycle: GeneratedAudioLifecycleState;
  readonly hasSource: boolean;
  readonly hasSpokenText: boolean;
  readonly job?: VoiceJob | null;
  readonly reviewComplete?: boolean;
  readonly runtimeReady?: boolean;
  readonly voiceReady?: boolean;
}

export interface AudioGenerationPipelineModel {
  readonly canAudioFollow: boolean;
  readonly canCreateAndListen: boolean;
  readonly canRetryGeneration: boolean;
  readonly canUsePartialAudio: boolean;
  readonly detail: string;
  readonly failedKind: VoiceJob["failureKind"] | null;
  readonly label: string;
  readonly pendingSegments: number;
  readonly readySegments: number;
  readonly retryLabel: string;
  readonly state: AudioGenerationPipelineState;
  readonly totalSegments: number;
}

export function resolveAudioGenerationPipelineModel(
  input: AudioGenerationPipelineInput,
): AudioGenerationPipelineModel {
  const readySegments = readySegmentCount(input.job);
  const totalSegments = totalSegmentCount(input.job);
  const pendingSegments = Math.max(0, totalSegments - readySegments);
  const prerequisitesReady =
    input.hasSource &&
    input.hasSpokenText &&
    input.runtimeReady !== false &&
    input.voiceReady !== false;
  const working = input.job ? isWorkingJob(input.job) : false;
  const state = resolvePipelineState({
    generatedAudioLifecycle: input.generatedAudioLifecycle,
    job: input.job ?? null,
    prerequisitesReady,
    readySegments,
    totalSegments,
    working,
  });
  const canUsePartialAudio = readySegments > 0 && state !== "readyToListen";
  const canCreateAndListen = prerequisitesReady && input.canCreate && !working;
  const canRetryGeneration = Boolean(
    input.job &&
      (input.job.status === "failed" || input.job.status === "cancelled") &&
      input.job.retriable !== false &&
      input.job.terminalReason !== "configuration_failed",
  );
  const canAudioFollow = state === "readyToListen";
  return {
    canAudioFollow,
    canCreateAndListen,
    canRetryGeneration,
    canUsePartialAudio,
    detail: pipelineDetail(state, readySegments, totalSegments, input.job ?? null),
    failedKind: input.job?.failureKind ?? null,
    label: pipelineLabel(state),
    pendingSegments,
    readySegments,
    retryLabel: "Retry generation",
    state,
    totalSegments,
  };
}

export function isAudioGenerationWorking(state: AudioGenerationPipelineState): boolean {
  return state === "queued" || state === "generating" || state === "partialReady";
}

function resolvePipelineState({
  generatedAudioLifecycle,
  job,
  prerequisitesReady,
  readySegments,
  totalSegments,
  working,
}: Readonly<{
  generatedAudioLifecycle: GeneratedAudioLifecycleState;
  job: VoiceJob | null;
  prerequisitesReady: boolean;
  readySegments: number;
  totalSegments: number;
  working: boolean;
}>): AudioGenerationPipelineState {
  if (job?.status === "cancelled") {
    return "cancelled";
  }
  if (job?.status === "failed" || generatedAudioLifecycle === "failed") {
    return "failed";
  }
  if (
    generatedAudioLifecycle === "archived" ||
    generatedAudioLifecycle === "degraded" ||
    generatedAudioLifecycle === "stale"
  ) {
    return "repairRequired";
  }
  if (working && readySegments > 0 && readySegments < Math.max(1, totalSegments)) {
    return "partialReady";
  }
  if (job?.status === "queued" || generatedAudioLifecycle === "queued") {
    return "queued";
  }
  if (working || generatedAudioLifecycle === "generating") {
    return "generating";
  }
  if (generatedAudioLifecycle === "ready") {
    return "readyToListen";
  }
  if (!prerequisitesReady) {
    return "notReady";
  }
  return "readyToGenerate";
}

function pipelineLabel(state: AudioGenerationPipelineState): string {
  switch (state) {
    case "cancelled": {
      return "Cancelled";
    }
    case "failed": {
      return "Failed";
    }
    case "generating": {
      return "Generating";
    }
    case "notReady": {
      return "Not ready";
    }
    case "partialReady": {
      return "Partially ready";
    }
    case "queued": {
      return "Queued";
    }
    case "readyToGenerate": {
      return "Ready to generate";
    }
    case "readyToListen": {
      return "Ready to listen";
    }
    case "repairRequired": {
      return "Repair required";
    }
  }
}

function pipelineDetail(
  state: AudioGenerationPipelineState,
  readySegments: number,
  totalSegments: number,
  job: VoiceJob | null,
): string {
  switch (state) {
    case "cancelled": {
      return job?.retriable === false
        ? "Generation was cancelled. Create & Listen starts a fresh run for the current scope."
        : "Generation was cancelled. Ready segments remain available when they exist.";
    }
    case "failed": {
      return failureDetail(job);
    }
    case "generating": {
      return "Audio generation is running. Playback unlocks as segments become ready.";
    }
    case "notReady": {
      return "Source, review, spoken form, voice, and runtime must be ready before generation.";
    }
    case "partialReady": {
      return `Partially ready. ${readySegments.toString()}/${Math.max(
        readySegments,
        totalSegments,
      ).toString()} segments can play; pending segments will unlock as generation continues.`;
    }
    case "queued": {
      return "Audio generation is queued.";
    }
    case "readyToGenerate": {
      return "Preview shows the listener-ready text. No generated audio exists yet. Create & Listen to generate audio for this scope.";
    }
    case "readyToListen": {
      return "Generated audio and timing are ready for playback and audio-follow.";
    }
    case "repairRequired": {
      return "Generated audio is stale, degraded, or archived. Rebuild audio before treating it as current.";
    }
  }
}

function failureDetail(job: VoiceJob | null): string {
  const failureKind = job?.failureKind;
  const prefix = failureKind
    ? `Generation failed in ${failureKind} handling.`
    : "Generation failed.";
  const readySegments = readySegmentCount(job);
  if (readySegments > 0) {
    if (job?.retriable === false) {
      return `${prefix} ${readySegments.toString()} ready ${
        readySegments === 1 ? "segment remains" : "segments remain"
      } available. Create & Listen starts a fresh run for the current scope.`;
    }
    return `${prefix} ${readySegments.toString()} ready ${
      readySegments === 1 ? "segment remains" : "segments remain"
    } available. Retry generation to resume from valid audio.`;
  }
  if (job?.retriable === false) {
    return `${prefix} Create & Listen starts a fresh run for the current scope.`;
  }
  return `${prefix} Retry generation before playback.`;
}

function readySegmentCount(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const readyBySegments = (job.segments ?? []).filter(
    (segment) => segment.status === "ready",
  ).length;
  return Math.max(0, job.audioReadySegments ?? 0, readyBySegments);
}

function totalSegmentCount(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const retryMetadata = (job as Partial<VoiceJob>).retries;
  return Math.max(0, retryMetadata?.totalSegments ?? 0, job.segments?.length ?? 0);
}

function isWorkingJob(job: VoiceJob): boolean {
  return (
    job.status === "queued" ||
    job.status === "optimizing" ||
    job.status === "synthesizing" ||
    job.status === "checking" ||
    job.status === "retrying"
  );
}
