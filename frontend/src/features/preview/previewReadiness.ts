import {
  generatedAudioLifecycleDescriptor,
  type GeneratedAudioLifecycleState,
} from "../playback/generatedAudioLifecycle";

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
  const createDisabledReason = canCreate
    ? undefined
    : (firstBlockingDetail([source, spoken, voice]) ??
      input.createDisabledReason ??
      "Select a ready source or wait for the current run.");

  return {
    canAudition,
    canCreate,
    canOpenCinema: canOpenAudioSurface,
    canOpenTeleprompt: source.status === "ready" && spoken.status === "ready",
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
    createHelper: canOpenAudioSurface
      ? "Audio is ready. Recreate only if the source, voice, policy, or scope changed."
      : "Generates current-scope audio, enables Preview playback, and unlocks Cinema.",
    generatedPlaybackDisabledReason: canOpenAudioSurface ? undefined : audio.detail,
    openTelepromptDetail: canOpenAudioSurface
      ? "Teleprompt opens with generated cue playback ready."
      : "Script-only now. Cue playback unlocks after audio.",
    openTelepromptDisabledReason:
      source.status === "ready" && spoken.status === "ready"
        ? undefined
        : firstBlockingDetail([source, spoken]),
    openTheatreDisabledReason: canOpenAudioSurface ? undefined : audio.detail,
    primaryLabel: canOpenAudioSurface ? "Create Again" : "Create & Listen",
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
      detail: "Audio is generating. Playback and Cinema unlock when ready.",
      id: "audio",
      label: "Generated audio",
      status: "working",
    };
  }
  if (lifecycle === "missing") {
    return {
      detail: "Create & Listen before playing the full narration.",
      id: "audio",
      label: "Generated audio",
      status: "waiting",
    };
  }
  const descriptor = generatedAudioLifecycleDescriptor(lifecycle);
  return {
    detail: descriptor.disabledReason,
    id: "audio",
    label: "Generated audio",
    status: "blocked",
  };
}

function firstBlockingDetail(rows: readonly PreviewReadinessRow[]): string | undefined {
  return rows.find((row) => row.status === "blocked" || row.status === "working")?.detail;
}
