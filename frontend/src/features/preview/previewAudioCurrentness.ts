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
  readonly allowPreparedSourceSelectionMatch?: boolean;
}

export function resolvePreviewAudioCurrentness({
  allowPreparedSourceSelectionMatch = true,
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
    !previewSpeechPlanMatchesJobText(
      speechPlan,
      job.optimizedText,
      job.inputText,
      jobSegmentsText(job),
    ) &&
    !(
      allowPreparedSourceSelectionMatch && preparedSourceSelectionMatchesSpeechPlan(job, speechPlan)
    )
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
  if (requestedFieldDiffers(job.runMode, request.runMode)) {
    reasons.push("run-mode-mismatch");
  }
  if (requestedFieldDiffers(job.performanceMode, request.performanceMode)) {
    reasons.push("performance-mode-mismatch");
  }
  if (requestedFieldDiffers(job.ttsEngine, request.ttsEngine)) {
    reasons.push("tts-engine-mismatch");
  }
  if (optionalFieldDiffers(job.voiceProfileId, request.voiceProfileId)) {
    reasons.push("voice-profile-mismatch");
  }
  if (optionalFieldDiffers(job.voiceId, request.voiceId)) {
    reasons.push("voice-id-mismatch");
  }
  if (ttsVoiceDiffers(job.ttsVoice, request.ttsVoice)) {
    reasons.push("tts-voice-mismatch");
  }
  if (requestedFieldDiffers(job.ttsLanguage, request.ttsLanguage)) {
    reasons.push("tts-language-mismatch");
  }
  if (
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

function requestedFieldDiffers(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const cleanStored = (stored ?? "").trim();
  const cleanExpected = (expected ?? "").trim();
  return cleanExpected.length > 0 && cleanStored !== cleanExpected;
}

function optionalFieldDiffers(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const cleanStored = (stored ?? "").trim();
  const cleanExpected = (expected ?? "").trim();
  return (cleanStored.length > 0 || cleanExpected.length > 0) && cleanStored !== cleanExpected;
}

function ttsVoiceDiffers(
  stored: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  const cleanStored = (stored ?? "").trim();
  const cleanExpected = (expected ?? "").trim();
  if (cleanStored.length === 0 && cleanExpected.length > 0) {
    return false;
  }
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

function jobSegmentsText(job: VoiceJob): string {
  const segments = job.segments ?? [];
  if (segments.length === 0) {
    return "";
  }
  const orderedSegments: NonNullable<VoiceJob["segments"]> = [];
  for (const segment of segments) {
    const insertIndex = orderedSegments.findIndex((candidate) => candidate.index > segment.index);
    if (insertIndex === -1) {
      orderedSegments.push(segment);
    } else {
      orderedSegments.splice(insertIndex, 0, segment);
    }
  }
  return orderedSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function preparedSourceSelectionMatchesSpeechPlan(
  job: VoiceJob,
  speechPlan: CanonicalPreviewSpeechPlan,
): boolean {
  if (!job.preparedSourceId || !job.selectedBlockIds || job.selectedBlockIds.length === 0) {
    return false;
  }
  const selectedBlockIds = normalizeBlockIds(job.selectedBlockIds);
  const speechPlanBlockIds = normalizeBlockIds(speechPlan.blockIds);
  if (selectedBlockIds.length === 0 || selectedBlockIds.length !== speechPlanBlockIds.length) {
    return false;
  }
  return selectedBlockIds.every((blockId, index) => blockId === speechPlanBlockIds[index]);
}

function normalizeBlockIds(blockIds: readonly string[]): string[] {
  return blockIds.map((blockId) => blockId.trim()).filter(Boolean);
}
