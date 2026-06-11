import {
  generatedAudioLifecycleDescriptor,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";
import type { AudioGenerationPipelineModel } from "../playback/audioGenerationPipeline";
import { OPERATIONAL_RECOVERY_LABELS } from "../operational-status";

export type PreviewReadinessRowId =
  | "audition"
  | "audio"
  | "policy"
  | "review"
  | "runtime"
  | "source"
  | "spoken"
  | "voice";

export type PreviewReadinessRowStatus = "blocked" | "ready" | "waiting" | "warning" | "working";

export interface PreviewReadinessRow {
  readonly detail: string;
  readonly id: PreviewReadinessRowId;
  readonly label: string;
  readonly status: PreviewReadinessRowStatus;
}

export interface PreviewReadinessConfirmation {
  readonly label: string;
  readonly value: string;
}

export interface PreviewReadinessModelInput {
  readonly canCreate: boolean;
  readonly createDisabledReason?: string;
  readonly audioPipeline?: AudioGenerationPipelineModel;
  readonly generatedAudioLifecycle: GeneratedAudioLifecycleState;
  readonly hasSource: boolean;
  readonly hasSpokenText: boolean;
  readonly isTemporarySource?: boolean;
  readonly outputFormat: string;
  readonly policyLabel: string;
  readonly reviewWarningCount?: number;
  readonly runLabel: string;
  readonly scopeLabel: string;
  readonly sourceError?: string | null;
  readonly sourceLabel: string;
  readonly sourcePreparing: boolean;
  readonly voiceCapabilityReason?: string | null;
  readonly voiceLabel: string;
}

export interface PreviewReadinessModel {
  readonly canAudition: boolean;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly canOpenTeleprompt: boolean;
  readonly canOpenTheatre: boolean;
  readonly cinemaDisabledReason?: string;
  readonly confirmations: readonly PreviewReadinessConfirmation[];
  readonly createDisabledReason?: string;
  readonly createHelper: string;
  readonly generatedPlaybackDisabledReason?: string;
  readonly openTelepromptDetail: string;
  readonly openTelepromptDisabledReason?: string;
  readonly openTheatreDisabledReason?: string;
  readonly primaryLabel: string;
  readonly rows: readonly PreviewReadinessRow[];
}

export function resolvePreviewReadinessModel(
  input: PreviewReadinessModelInput,
): PreviewReadinessModel {
  const source = resolveSourceReadiness(input);
  const spoken = resolveSpokenReadiness(input, source.status === "ready");
  const voice = resolveVoiceReadiness(input);
  const review = resolveReviewReadiness(input, source.status === "ready");
  const runtime = resolveRuntimeReadiness(input, source, spoken, voice, review);
  const canAudition =
    source.status === "ready" && spoken.status === "ready" && voice.status === "ready";
  const audio = resolveGeneratedAudioReadiness(input.generatedAudioLifecycle, input.audioPipeline);
  const canOpenAudioSurface = input.generatedAudioLifecycle === "ready";
  const canCreate = input.canCreate && canAudition;
  const canOpenTeleprompt = source.status === "ready" && spoken.status === "ready";
  const canOpenTheatre = canOpenTeleprompt;
  const canPlayGeneratedAudio =
    input.generatedAudioLifecycle === "ready" || Boolean(input.audioPipeline?.canUsePartialAudio);
  const createDisabledReason = canCreate
    ? undefined
    : (firstBlockingDetail([source, spoken, voice, runtime]) ??
      input.createDisabledReason ??
      "Select a ready source or wait for the current run.");
  const openTelepromptDisabledReason = canOpenTeleprompt
    ? undefined
    : firstBlockingDetail([source, spoken]);

  return {
    canAudition,
    canCreate,
    canOpenCinema: canOpenAudioSurface,
    canOpenTeleprompt,
    canOpenTheatre,
    cinemaDisabledReason: canOpenAudioSurface ? undefined : audio.detail,
    confirmations: [
      { label: "Source", value: input.sourceLabel },
      { label: "Scope", value: input.scopeLabel },
      { label: "Voice", value: input.voiceLabel },
      { label: "Policy", value: input.policyLabel },
      { label: "Run", value: input.runLabel },
      { label: "Format", value: input.outputFormat },
    ],
    createDisabledReason,
    createHelper: createHelperForAudioLifecycle(
      input.generatedAudioLifecycle,
      canOpenAudioSurface,
      input.audioPipeline,
      input.isTemporarySource,
    ),
    generatedPlaybackDisabledReason: canPlayGeneratedAudio ? undefined : audio.detail,
    openTelepromptDetail: canPlayGeneratedAudio
      ? "Teleprompt opens with generated cue playback available."
      : telepromptDetailForAudioLifecycle(input.generatedAudioLifecycle),
    openTelepromptDisabledReason,
    openTheatreDisabledReason: canOpenTheatre ? undefined : openTelepromptDisabledReason,
    primaryLabel: previewPrimaryLabel(
      input.generatedAudioLifecycle,
      canPlayGeneratedAudio,
      input.audioPipeline,
    ),
    rows: [
      source,
      spoken,
      review,
      voice,
      {
        detail: `${input.policyLabel} applied to ${input.scopeLabel}.`,
        id: "policy",
        label: "Policy & scope",
        status: source.status === "ready" ? "ready" : "waiting",
      },
      runtime,
      {
        detail: canAudition
          ? "Selected spoken block can be auditioned before full generation."
          : (firstBlockingDetail([source, spoken, voice]) ??
            "Audition unlocks when source, spoken form, and voice are ready."),
        id: "audition",
        label: "Audition",
        status: canAudition ? "ready" : "waiting",
      },
      audio,
    ],
  };
}

function resolveSourceReadiness(input: PreviewReadinessModelInput): PreviewReadinessRow {
  if (input.sourceError) {
    return {
      detail: input.sourceError,
      id: "source",
      label: "Source",
      status: "blocked",
    };
  }
  if (input.sourcePreparing) {
    return {
      detail: "Source preparation is still running.",
      id: "source",
      label: "Source",
      status: "working",
    };
  }
  if (!input.hasSource) {
    return {
      detail: "Choose or prepare a source before creating audio.",
      id: "source",
      label: "Source",
      status: "blocked",
    };
  }
  return {
    detail: `${input.sourceLabel} is ready for ${input.scopeLabel}.`,
    id: "source",
    label: "Source",
    status: "ready",
  };
}

function resolveSpokenReadiness(
  input: PreviewReadinessModelInput,
  sourceReady: boolean,
): PreviewReadinessRow {
  if (!input.hasSpokenText) {
    return {
      detail: sourceReady
        ? "This source has no listener-ready text to audition or generate."
        : "Spoken form unlocks after a source is ready.",
      id: "spoken",
      label: "Spoken form",
      status: sourceReady ? "blocked" : "waiting",
    };
  }
  return {
    detail: "Listener-ready text is available for preview and generation.",
    id: "spoken",
    label: "Spoken form",
    status: "ready",
  };
}

function resolveReviewReadiness(
  input: PreviewReadinessModelInput,
  sourceReady: boolean,
): PreviewReadinessRow {
  const warningCount = Math.max(0, input.reviewWarningCount ?? 0);
  if (!sourceReady) {
    return {
      detail: "Review unlocks after a source is ready.",
      id: "review",
      label: "Review",
      status: "waiting",
    };
  }
  if (warningCount > 0) {
    return {
      detail: `${warningCount.toString()} review ${
        warningCount === 1 ? "warning needs" : "warnings need"
      } repair. Preview remains available while repairs continue.`,
      id: "review",
      label: "Review",
      status: "warning",
    };
  }
  return {
    detail: "No Review repair warnings are attached to this source.",
    id: "review",
    label: "Review",
    status: "ready",
  };
}

function resolveVoiceReadiness(input: PreviewReadinessModelInput): PreviewReadinessRow {
  if (input.voiceCapabilityReason) {
    return {
      detail: input.voiceCapabilityReason || "Select a ready voice or TTS engine.",
      id: "voice",
      label: "Voice/provider",
      status: "blocked",
    };
  }
  return {
    detail: `${input.voiceLabel} is available for this run.`,
    id: "voice",
    label: "Voice/provider",
    status: "ready",
  };
}

function resolveRuntimeReadiness(
  input: PreviewReadinessModelInput,
  source: PreviewReadinessRow,
  spoken: PreviewReadinessRow,
  voice: PreviewReadinessRow,
  review: PreviewReadinessRow,
): PreviewReadinessRow {
  if (input.audioPipeline?.state === "queued" || input.generatedAudioLifecycle === "queued") {
    return {
      detail: input.audioPipeline?.detail ?? "Audio generation is queued.",
      id: "runtime",
      label: "Runtime/queue",
      status: "working",
    };
  }
  if (
    input.audioPipeline?.state === "generating" ||
    input.audioPipeline?.state === "partialReady" ||
    input.generatedAudioLifecycle === "generating"
  ) {
    return {
      detail:
        input.audioPipeline?.detail ??
        "Audio generation is running. Playback unlocks as segments become ready.",
      id: "runtime",
      label: "Runtime/queue",
      status: "working",
    };
  }
  const prerequisiteBlocker = firstBlockingDetail([source, spoken, review, voice]);
  if (prerequisiteBlocker) {
    return {
      detail:
        "Runtime and queue checks run after source, review, spoken form, and voice are ready.",
      id: "runtime",
      label: "Runtime/queue",
      status: "waiting",
    };
  }
  if (input.createDisabledReason && !input.voiceCapabilityReason) {
    return {
      detail: input.createDisabledReason,
      id: "runtime",
      label: "Runtime/queue",
      status: "blocked",
    };
  }
  return {
    detail: "Runtime is available and no active generation is blocking the queue.",
    id: "runtime",
    label: "Runtime/queue",
    status: "ready",
  };
}

function resolveGeneratedAudioReadiness(
  lifecycle: GeneratedAudioLifecycleState,
  pipeline?: AudioGenerationPipelineModel,
): PreviewReadinessRow {
  if (pipeline?.state === "partialReady") {
    return {
      detail: pipeline.detail,
      id: "audio",
      label: "Generated audio",
      status: "working",
    };
  }
  const descriptor = generatedAudioLifecycleDescriptor(lifecycle);
  if (lifecycle === "ready") {
    return {
      detail: "Audio ready. Preview playback and Cinema are available.",
      id: "audio",
      label: "Generated audio",
      status: "ready",
    };
  }
  if (lifecycle === "queued" || lifecycle === "generating") {
    return {
      detail: descriptor.disabledReason,
      id: "audio",
      label: "Generated audio",
      status: "working",
    };
  }
  if (lifecycle === "missing") {
    return {
      detail:
        pipeline?.detail ??
        "Preview shows the listener-ready text. No generated audio exists yet. Create & Listen to generate audio for this scope.",
      id: "audio",
      label: "Generated audio",
      status: "waiting",
    };
  }
  if (lifecycle === "failed" && pipeline?.canRetryGeneration && pipeline.canCreateAndListen) {
    return {
      detail: pipeline.detail,
      id: "audio",
      label: "Generated audio",
      status: "warning",
    };
  }
  return {
    detail: pipeline?.detail ?? descriptor.disabledReason,
    id: "audio",
    label: "Generated audio",
    status: "blocked",
  };
}

function createHelperForAudioLifecycle(
  lifecycle: GeneratedAudioLifecycleState,
  canOpenAudioSurface: boolean,
  pipeline?: AudioGenerationPipelineModel,
  isTemporarySource = false,
): string {
  const temporaryExpiryCopy =
    "Temporary audio will expire unless you keep the source as a project source.";
  if (pipeline?.detail) {
    return isTemporarySource ? `${pipeline.detail} ${temporaryExpiryCopy}` : pipeline.detail;
  }
  if (canOpenAudioSurface) {
    const helper = "Audio is ready. Recreate only if the source, voice, policy, or scope changed.";
    return isTemporarySource ? `${helper} ${temporaryExpiryCopy}` : helper;
  }
  if (lifecycle === "failed") {
    return `${OPERATIONAL_RECOVERY_LABELS.retryGeneration} with the current source, voice, policy, and scope.`;
  }
  const helper = "Generates current-scope audio, enables Preview playback, and unlocks Cinema.";
  return isTemporarySource ? `${helper} ${temporaryExpiryCopy}` : helper;
}

function telepromptDetailForAudioLifecycle(lifecycle: GeneratedAudioLifecycleState): string {
  if (lifecycle === "failed") {
    return "Rehearsal only. Retry generation unlocks audio-follow.";
  }
  return "Manual rehearsal is available. Audio-follow unlocks when generated audio and timing are ready.";
}

function previewPrimaryLabel(
  lifecycle: GeneratedAudioLifecycleState,
  canOpenAudioSurface: boolean,
  pipeline?: AudioGenerationPipelineModel,
): string {
  if (
    ((pipeline?.state === "failed" || pipeline?.state === "cancelled") &&
      pipeline.canRetryGeneration &&
      pipeline.canCreateAndListen) ||
    (!pipeline && lifecycle === "failed")
  ) {
    return OPERATIONAL_RECOVERY_LABELS.retryGeneration;
  }
  if (canOpenAudioSurface) {
    return "Create Again";
  }
  return "Create & Listen";
}

function firstBlockingDetail(rows: readonly PreviewReadinessRow[]): string | undefined {
  return rows.find((row) => row.status === "blocked" || row.status === "working")?.detail;
}
