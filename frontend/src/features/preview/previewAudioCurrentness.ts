import type { CreateVoiceJobRequest, SpeechPolicyOverrides, VoiceJob } from "../../types";
import {
  compactSpeechPolicyOverrides,
  hasSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
} from "../../speechPolicy";
import { completedJobHasPlayableAudio } from "../playback/generatedAudioLifecycle";
import {
  canonicalPreviewSpeechPlanHasBlocks,
  previewSpeechPlanMatchesJobText,
  type CanonicalPreviewSpeechPlan,
} from "../revision";

export type PreviewAudioCurrentnessReason =
  | "missing-playable-audio"
  | "performance-mode-mismatch"
  | "policy-overrides-mismatch"
  | "policy-profile-mismatch"
  | "run-mode-mismatch"
  | "text-mismatch"
  | "tts-engine-mismatch"
  | "tts-language-mismatch"
  | "tts-voice-mismatch"
  | "voice-id-mismatch"
  | "voice-profile-mismatch";

export interface PreviewAudioCurrentness {
  readonly playable: boolean;
  readonly reasons: PreviewAudioCurrentnessReason[];
  readonly stale: boolean;
  readonly technicalDetail?: string;
}

export interface PreviewAudioCurrentnessInput {
  readonly job: VoiceJob | null;
  readonly request: CreateVoiceJobRequest;
  readonly speechPlan: CanonicalPreviewSpeechPlan;
}

export function resolvePreviewAudioCurrentness({
  job,
  request,
  speechPlan,
}: PreviewAudioCurrentnessInput): PreviewAudioCurrentness {
  const reasons: PreviewAudioCurrentnessReason[] = [];
  if (job?.status !== "completed") {
    return {
      playable: false,
      reasons,
      stale: false,
    };
  }

  if (
    canonicalPreviewSpeechPlanHasBlocks(speechPlan) &&
    !previewSpeechPlanMatchesJobText(speechPlan, job.optimizedText, job.inputText)
  ) {
    reasons.push("text-mismatch");
  }
  appendConfigCurrentnessReasons(reasons, job, request);
  const playable = completedJobHasPlayableAudio(job);
  if (!playable) {
    reasons.push("missing-playable-audio");
  }

  const stale = reasons.some((reason) => reason !== "missing-playable-audio");
  return {
    playable,
    reasons,
    stale,
    technicalDetail: previewAudioCurrentnessTechnicalDetail(reasons),
  };
}

export function previewAudioCurrentnessTechnicalDetail(
  reasons: readonly PreviewAudioCurrentnessReason[],
): string | undefined {
  return reasons.length > 0 ? `audio-currentness=${reasons.join(",")}` : undefined;
}

function appendConfigCurrentnessReasons(
  reasons: PreviewAudioCurrentnessReason[],
  job: VoiceJob,
  request: CreateVoiceJobRequest,
): void {
  if (comparableFieldDiffers(job.runMode, request.runMode)) {
    reasons.push("run-mode-mismatch");
  }
  if (comparableFieldDiffers(job.performanceMode, request.performanceMode)) {
    reasons.push("performance-mode-mismatch");
  }
  if (comparableFieldDiffers(job.ttsEngine, request.ttsEngine)) {
    reasons.push("tts-engine-mismatch");
  }
  if (optionalFieldDiffers(job.voiceProfileId, request.voiceProfileId)) {
    reasons.push("voice-profile-mismatch");
  }
  if (optionalFieldDiffers(job.voiceId, request.voiceId)) {
    reasons.push("voice-id-mismatch");
  }
  if (comparableFieldDiffers(job.ttsVoice, request.ttsVoice)) {
    reasons.push("tts-voice-mismatch");
  }
  if (comparableFieldDiffers(job.ttsLanguage, request.ttsLanguage)) {
    reasons.push("tts-language-mismatch");
  }
  if (
    job.speechPolicyProfile &&
    request.speechPolicyProfile &&
    normalizeSpeechPolicyProfile(job.speechPolicyProfile) !==
      normalizeSpeechPolicyProfile(request.speechPolicyProfile)
  ) {
    reasons.push("policy-profile-mismatch");
  }

  const storedOverrides = overridesFingerprint(job.speechPolicyOverrides);
  const requestedOverrides = overridesFingerprint(request.speechPolicyOverrides);
  if (
    storedOverrides !== requestedOverrides &&
    (storedOverrides !== "{}" || requestedOverrides !== "{}")
  ) {
    reasons.push("policy-overrides-mismatch");
  }
}

function comparableFieldDiffers(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const cleanStored = (stored ?? "").trim();
  const cleanExpected = (expected ?? "").trim();
  return cleanStored.length > 0 && cleanExpected.length > 0 && cleanStored !== cleanExpected;
}

function optionalFieldDiffers(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const cleanStored = (stored ?? "").trim();
  const cleanExpected = (expected ?? "").trim();
  return (cleanStored.length > 0 || cleanExpected.length > 0) && cleanStored !== cleanExpected;
}

function overridesFingerprint(overrides: SpeechPolicyOverrides | undefined): string {
  const compact = compactSpeechPolicyOverrides(overrides ?? {});
  if (!hasSpeechPolicyOverrides(compact)) {
    return "{}";
  }
  const keys = Object.keys(compact);
  keys.sort((left, right) => left.localeCompare(right));
  return JSON.stringify(compact, keys);
}
