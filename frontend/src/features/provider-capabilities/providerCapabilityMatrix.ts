import type { ProviderCapabilitySet, TTSEngineDiagnostics } from "../../types";
import type { PlaybackActionKey } from "../playback";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  MOCK_PROVIDER_CAPABILITIES,
  PROVIDER_CAPABILITY_KEYS,
  completeProviderCapabilities,
  providerCapabilityDisabledReason,
  type ProviderCapabilityKey,
} from "./providerCapabilities";

export interface ProviderRuntimeCapabilities {
  readonly capabilities: ProviderCapabilitySet;
  readonly engine: TTSEngineDiagnostics | null;
  readonly missing: readonly ProviderCapabilityKey[];
  readonly providerId: string;
  readonly providerLabel: string;
}

export interface ProviderCapabilityGate {
  readonly capability: ProviderCapabilityKey;
  readonly disabled: boolean;
  readonly reason?: string;
}

export function resolveProviderRuntimeCapabilities(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): ProviderRuntimeCapabilities {
  const engine = resolveEngine(engineId, engines);
  const capabilities = engine
    ? capabilitiesForEngine(engine)
    : completeProviderCapabilities(EMPTY_PROVIDER_CAPABILITIES);
  return {
    capabilities,
    engine,
    missing: PROVIDER_CAPABILITY_KEYS.filter((capability) => !capabilities[capability]),
    providerId: engine?.id ?? engineId,
    providerLabel: engine?.label ?? (engineId || "Configured provider"),
  };
}

export function providerCapabilityGate(
  runtime: ProviderRuntimeCapabilities,
  capability: ProviderCapabilityKey,
  options: Readonly<{ fallback?: string }> = {},
): ProviderCapabilityGate {
  if (runtime.capabilities[capability]) {
    return { capability, disabled: false };
  }
  return {
    capability,
    disabled: true,
    reason: providerCapabilityDisabledReason({
      capability,
      fallback: options.fallback,
      providerLabel: runtime.providerLabel,
    }),
  };
}

export function providerCapabilityForPlaybackAction(
  action: PlaybackActionKey,
): ProviderCapabilityKey {
  switch (action) {
    case "abCompare": {
      return "abComparison";
    }
    case "audition":
    case "preview": {
      return "voicePreview";
    }
    case "createAndListen":
    case "openCinema":
    case "play":
    case "telepromptPlay": {
      return "tts";
    }
    case "rebuildAudio":
    case "retryGeneration": {
      return "retryJob";
    }
  }
}

export function providerCapabilityGateForPlaybackAction(
  runtime: ProviderRuntimeCapabilities,
  action: PlaybackActionKey,
  options: Readonly<{ fallback?: string }> = {},
): ProviderCapabilityGate {
  return providerCapabilityGate(runtime, providerCapabilityForPlaybackAction(action), options);
}

function resolveEngine(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): TTSEngineDiagnostics | null {
  if (engines.length === 0) {
    return fallbackEngine(engineId);
  }
  const normalizedId = normalizeEngineId(engineId);
  return (
    engines.find((engine) => normalizeEngineId(engine.id) === normalizedId) ??
    (normalizedId.startsWith("kokoro")
      ? engines.find((engine) => normalizeEngineId(engine.id) === "kokoro")
      : undefined) ??
    engines.find((engine) => engine.default) ??
    engines.find((engine) => normalizeEngineId(engine.id) === "auto") ??
    engines[0]
  );
}

function capabilitiesForEngine(engine: TTSEngineDiagnostics) {
  if (isMockRuntime(engine)) {
    return MOCK_PROVIDER_CAPABILITIES;
  }
  if (engine.capabilities) {
    return completeProviderCapabilities(engine.capabilities);
  }
  const ready = engine.status === "ready";
  const voiceCloning =
    ready &&
    (engine.supportsReference ||
      engine.supportsProfileArtifacts === true ||
      engine.id.includes("clone") ||
      engine.id.includes("embed"));
  const voicePreview = ready && (engine.supportsVoice || voiceCloning);
  return completeProviderCapabilities({
    abComparison: ready && voicePreview,
    cancelJob: ready,
    localOnly: engine.local,
    retryJob: ready,
    ssml: ready && engine.supportsSSML,
    tts: ready,
    voiceCloning,
    voicePreview,
  });
}

function fallbackEngine(engineId: string): TTSEngineDiagnostics {
  return {
    capabilities: MOCK_PROVIDER_CAPABILITIES,
    default: true,
    experimental: false,
    id: engineId || "mock",
    label: "Mock/local provider",
    local: true,
    metadata: { runtimeProvider: "mock" },
    status: "ready",
    supportsReference: true,
    supportsSSML: true,
    supportsSwedish: true,
    supportsVoice: true,
  };
}

function isMockRuntime(engine: TTSEngineDiagnostics): boolean {
  const runtimeProvider = engine.metadata?.runtimeProvider ?? engine.metadata?.provider ?? "";
  return (
    runtimeProvider.toLowerCase() === "mock" ||
    engine.id === "mock" ||
    /mock/i.test(engine.label) ||
    /silent runtime/i.test(engine.setup ?? "")
  );
}

function normalizeEngineId(value: string): string {
  const clean = value.trim().toLowerCase();
  if (clean === "supertonic") {
    return "supertonic-3";
  }
  return clean || "auto";
}
