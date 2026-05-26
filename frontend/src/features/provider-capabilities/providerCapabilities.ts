import type { ProviderCapabilitySet } from "../../types";

export type ProviderCapabilityKey = keyof ProviderCapabilitySet;

export const PROVIDER_CAPABILITY_KEYS = [
  "tts",
  "mockTts",
  "streaming",
  "wordTiming",
  "phraseTiming",
  "ssml",
  "ssmlMarks",
  "phonemeOverrides",
  "voiceCloning",
  "voicePreview",
  "cancelJob",
  "retryJob",
  "alignment",
  "alignmentSupported",
  "abComparison",
  "localOnly",
] as const satisfies readonly ProviderCapabilityKey[];

export interface ProviderCapabilityDescriptor {
  readonly detail: string;
  readonly fallback: string;
  readonly key: ProviderCapabilityKey;
  readonly label: string;
}

export const PROVIDER_CAPABILITY_DESCRIPTORS = {
  abComparison: descriptor(
    "abComparison",
    "A/B comparison",
    "Compare two preview choices before committing to a generation run.",
    "Switch to mock review mode or a provider that supports preview comparison.",
  ),
  alignment: descriptor(
    "alignment",
    "alignment",
    "Align generated audio back to source text for review and timing checks.",
    "Use a provider with alignment metadata or run a local alignment pass after synthesis.",
  ),
  alignmentRequiredForWordHighlight: descriptor(
    "alignmentRequiredForWordHighlight",
    "required alignment for word highlight",
    "Require a trusted provider or local forced-alignment pass before word-level highlighting is shown.",
    "Use phrase-level highlighting or configure a local alignment runtime.",
  ),
  alignmentSupported: descriptor(
    "alignmentSupported",
    "alignment support",
    "Supply provider timing or local alignment evidence for generated audio.",
    "Use mock review mode or configure MFA, Aeneas, or Gentle for local alignment.",
  ),
  cancelJob: descriptor(
    "cancelJob",
    "job cancellation",
    "Stop an active provider job before it finishes.",
    "Use a local/mock provider or wait for the current job to finish.",
  ),
  localOnly: descriptor(
    "localOnly",
    "local runtime",
    "Run without a hosted provider dependency.",
    "Use start:mock or start:local when a local-only review is required.",
  ),
  mockTts: descriptor(
    "mockTts",
    "mock TTS",
    "Use deterministic silent audio for local review and UI automation.",
    "Run pnpm start:mock for fully local review fixtures.",
  ),
  phonemeOverrides: descriptor(
    "phonemeOverrides",
    "phoneme overrides",
    "Honor policy-level pronunciation overrides in provider synthesis.",
    "Disable phoneme overrides or choose a provider that supports them.",
  ),
  phraseTiming: descriptor(
    "phraseTiming",
    "phrase timing",
    "Return phrase-level timing for reader resume and highlighting.",
    "Use mock review mode or a provider with timing metadata.",
  ),
  retryJob: descriptor(
    "retryJob",
    "retry",
    "Retry failed or rejected synthesis segments.",
    "Use a provider with retry support or start a fresh generation run.",
  ),
  ssml: descriptor(
    "ssml",
    "SSML",
    "Render provider-supported speech markup.",
    "Switch to plain-text policy or choose an SSML-capable provider.",
  ),
  ssmlMarks: descriptor(
    "ssmlMarks",
    "SSML marks",
    "Emit SSML mark callbacks for timeline cues.",
    "Use word or phrase timing when SSML marks are unavailable.",
  ),
  streaming: descriptor(
    "streaming",
    "streaming",
    "Play audio while provider synthesis is still running.",
    "Use arrival playback only with a streaming-capable provider.",
  ),
  tts: descriptor(
    "tts",
    "text-to-speech",
    "Generate narration audio for the active source.",
    "Select a ready provider in Settings > Runtime.",
  ),
  voiceCloning: descriptor(
    "voiceCloning",
    "voice cloning",
    "Use a saved reference or artifact as the synthesis voice.",
    "Choose a clone-capable engine or use the provider default voice.",
  ),
  voicePreview: descriptor(
    "voicePreview",
    "voice preview",
    "Audition voices and selected blocks before full generation.",
    "Use mock/local preview mode or generate the source before auditioning.",
  ),
  wordTiming: descriptor(
    "wordTiming",
    "word timing",
    "Return word-level timing for highlighting and resume checks.",
    "Use mock review mode or a timing-capable provider.",
  ),
} as const satisfies Record<ProviderCapabilityKey, ProviderCapabilityDescriptor>;

export const EMPTY_PROVIDER_CAPABILITIES: ProviderCapabilitySet = {
  abComparison: false,
  alignment: false,
  alignmentRequiredForWordHighlight: false,
  alignmentSupported: false,
  cancelJob: false,
  localOnly: false,
  mockTts: false,
  phonemeOverrides: false,
  phraseTiming: false,
  retryJob: false,
  ssml: false,
  ssmlMarks: false,
  streaming: false,
  tts: false,
  voiceCloning: false,
  voicePreview: false,
  wordTiming: false,
};

export const MOCK_PROVIDER_CAPABILITIES: ProviderCapabilitySet = {
  abComparison: true,
  alignment: true,
  alignmentRequiredForWordHighlight: false,
  alignmentSupported: true,
  cancelJob: true,
  localOnly: true,
  mockTts: true,
  phonemeOverrides: true,
  phraseTiming: true,
  retryJob: true,
  ssml: true,
  ssmlMarks: true,
  streaming: true,
  tts: true,
  voiceCloning: true,
  voicePreview: true,
  wordTiming: true,
};

export function completeProviderCapabilities(
  capabilities: Partial<ProviderCapabilitySet> | null | undefined,
): ProviderCapabilitySet {
  return { ...EMPTY_PROVIDER_CAPABILITIES, ...capabilities };
}

export function capabilityLabel(capability: ProviderCapabilityKey): string {
  return PROVIDER_CAPABILITY_DESCRIPTORS[capability].label;
}

export function capabilityRecommendedFallback(capability: ProviderCapabilityKey): string {
  return PROVIDER_CAPABILITY_DESCRIPTORS[capability].fallback;
}

export function providerCapabilityDisabledReason({
  capability,
  fallback,
  providerLabel,
}: Readonly<{
  capability: ProviderCapabilityKey;
  fallback?: string;
  providerLabel: string;
}>): string {
  return `${providerLabel} does not support ${capabilityLabel(capability)}. ${
    fallback ?? capabilityRecommendedFallback(capability)
  }`;
}

export function missingProviderCapabilities(
  capabilities: ProviderCapabilitySet,
): ProviderCapabilityKey[] {
  return PROVIDER_CAPABILITY_KEYS.filter((key) => !capabilities[key]);
}

function descriptor(
  key: ProviderCapabilityKey,
  label: string,
  detail: string,
  fallback: string,
): ProviderCapabilityDescriptor {
  return { detail, fallback, key, label };
}
