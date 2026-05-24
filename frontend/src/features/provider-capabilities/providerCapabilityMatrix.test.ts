import { describe, expect, it } from "vitest";
import {
  providerCapabilityGate,
  providerCapabilityGateForPlaybackAction,
  resolveProviderRuntimeCapabilities,
} from "./providerCapabilityMatrix";

describe("providerCapabilityMatrix", () => {
  it("keeps mock mode fully useful for local review", () => {
    const runtime = resolveProviderRuntimeCapabilities("kokoro", [
      {
        default: true,
        experimental: false,
        id: "kokoro",
        label: "Kokoro",
        local: true,
        metadata: { runtimeProvider: "mock" },
        status: "ready",
        supportsReference: false,
        supportsSSML: false,
        supportsSwedish: true,
        supportsVoice: true,
      },
    ]);

    expect(runtime.capabilities.mockTts).toBe(true);
    expect(runtime.capabilities.wordTiming).toBe(true);
    expect(runtime.capabilities.abComparison).toBe(true);
    expect(runtime.missing).toEqual([]);
  });

  it("explains unsupported provider actions with the provider label", () => {
    const runtime = resolveProviderRuntimeCapabilities("kokoro", [
      {
        capabilities: {
          abComparison: false,
          alignment: false,
          cancelJob: true,
          localOnly: true,
          mockTts: false,
          phonemeOverrides: false,
          phraseTiming: false,
          retryJob: true,
          ssml: false,
          ssmlMarks: false,
          streaming: false,
          tts: true,
          voiceCloning: false,
          voicePreview: true,
          wordTiming: false,
        },
        default: true,
        experimental: false,
        id: "kokoro",
        label: "Kokoro",
        local: true,
        status: "ready",
        supportsReference: false,
        supportsSSML: false,
        supportsSwedish: true,
        supportsVoice: true,
      },
    ]);

    const gate = providerCapabilityGate(runtime, "voiceCloning");

    expect(gate.disabled).toBe(true);
    expect(gate.reason).toContain("Kokoro does not support voice cloning");
  });

  it("maps playback-like actions onto provider capabilities", () => {
    const runtime = resolveProviderRuntimeCapabilities("remote", [
      {
        default: true,
        experimental: true,
        id: "remote",
        label: "Remote provider",
        local: false,
        status: "ready",
        supportsReference: false,
        supportsSSML: false,
        supportsSwedish: false,
        supportsVoice: true,
      },
    ]);

    expect(providerCapabilityGateForPlaybackAction(runtime, "createAndListen").disabled).toBe(
      false,
    );
    expect(providerCapabilityGateForPlaybackAction(runtime, "abCompare").disabled).toBe(false);
  });
});
