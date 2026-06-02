import {
  generatedAudioLifecycleDescriptor,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";
import { OPERATIONAL_RECOVERY_LABELS } from "../operational-status";

export type PreviewReadinessRowId = "audition" | "audio" | "policy" | "source" | "spoken" | "voice";

export type PreviewReadinessRowStatus = "blocked" | "ready" | "waiting" | "working";

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
  readonly generatedAudioLifecycle: GeneratedAudioLifecycleState;
  readonly hasSource: boolean;
  readonly hasSpokenText: boolean;
  readonly outputFormat: string;
  readonly policyLabel: string;
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
  const canAudition =
    source.status === "ready" && spoken.status === "ready" && voice.status === "ready";
  const audio = resolveGeneratedAudioReadiness(input.generatedAudioLifecycle);
  const canOpenAudioSurface = input.generatedAudioLifecycle === "ready";
  const canCreate = input.canCreate && canAudition;
  const canOpenTeleprompt = source.status === "ready" && spoken.status === "ready";
  const createDisabledReason = canCreate
    ? undefined
    : (firstBlockingDetail([source, spoken, voice]) ??
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
    canOpenTheatre: canOpenAudioSurface,
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
    createHelper: createHelperForAudioLifecycle(input.generatedAudioLifecycle, canOpenAudioSurface),
    generatedPlaybackDisabledReason: canOpenAudioSurface ? undefined : audio.detail,
    openTelepromptDetail: canOpenAudioSurface
      ? "Teleprompt opens with generated cue playback ready."
      : telepromptDetailForAudioLifecycle(input.generatedAudioLifecycle),
    openTelepromptDisabledReason,
    openTheatreDisabledReason: canOpenAudioSurface ? undefined : audio.detail,
    primaryLabel: previewPrimaryLabel(input.generatedAudioLifecycle, canOpenAudioSurface),
    rows: [
      source,
      spoken,
      voice,
      {
        detail: `${input.policyLabel} applied to ${input.scopeLabel}.`,
        id: "policy",
        label: "Policy & scope",
        status: source.status === "ready" ? "ready" : "waiting",
      },
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

function resolveGeneratedAudioReadiness(
  lifecycle: GeneratedAudioLifecycleState,
): PreviewReadinessRow {
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
      detail: descriptor.disabledReason,
      id: "audio",
      label: "Generated audio",
      status: "waiting",
    };
  }
  return {
    detail: descriptor.disabledReason,
    id: "audio",
    label: "Generated audio",
    status: "blocked",
  };
}

function createHelperForAudioLifecycle(
  lifecycle: GeneratedAudioLifecycleState,
  canOpenAudioSurface: boolean,
): string {
  if (canOpenAudioSurface) {
    return "Audio is ready. Recreate only if the source, voice, policy, or scope changed.";
  }
  if (lifecycle === "failed") {
    return `${OPERATIONAL_RECOVERY_LABELS.retryGeneration} with the current source, voice, policy, and scope.`;
  }
  return "Generates current-scope audio, enables Preview playback, and unlocks Cinema.";
}

function telepromptDetailForAudioLifecycle(lifecycle: GeneratedAudioLifecycleState): string {
  if (lifecycle === "failed") {
    return "Rehearsal only. Retry generation unlocks audio-follow.";
  }
  return "Rehearsal only. Audio-follow unlocks after Create & Listen.";
}

function previewPrimaryLabel(
  lifecycle: GeneratedAudioLifecycleState,
  canOpenAudioSurface: boolean,
): string {
  if (lifecycle === "failed") {
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
