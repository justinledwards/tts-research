import type { ProviderCapabilitySet, TTSEngineDiagnostics } from "../../types";

export type ProviderCapabilityKey = keyof ProviderCapabilitySet;

export function resolveProviderTtsGate(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): string | undefined {
  const engine = resolveLiteEngine(engineId, engines);
  if (!engine || engineSupportsTts(engine)) {
    return undefined;
  }
  return `${engine.label || engineId || "Configured provider"} does not support text-to-speech. Select a ready provider in Settings > Runtime.`;
}

export function providerRuntimeLeavesLocalBoundary(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): boolean {
  const engine = resolveLiteEngine(engineId, engines);
  if (!engine || isMockRuntime(engine)) {
    return false;
  }
  if (engine.local || engine.capabilities?.localOnly || engine.capabilities?.mockTts) {
    return false;
  }
  return engine.capabilities?.tts ?? engine.status === "ready";
}

export function providerCapabilityDataAttributes(
  capability: ProviderCapabilityKey,
  reason?: string | null,
) {
  return {
    "data-capability-gated": reason ? "true" : undefined,
    "data-capability-reason": reason ?? undefined,
    "data-provider-capability": capability,
  } as const;
}

function resolveLiteEngine(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): TTSEngineDiagnostics | null {
  if (engines.length === 0) {
    return null;
  }
  const normalizedId = normalizeEngineId(engineId);
  return (
    engines.find((engine) => normalizeEngineId(engine.id) === normalizedId) ??
    engines.find((engine) => engine.default || normalizeEngineId(engine.id) === "auto") ??
    engines[0]
  );
}

function engineSupportsTts(engine: TTSEngineDiagnostics): boolean {
  if (engine.capabilities) {
    return engine.capabilities.tts;
  }
  return engine.status === "ready";
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
  return clean === "supertonic" ? "supertonic-3" : clean || "auto";
}
