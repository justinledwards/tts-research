import { describe, expect, it } from "vitest";
import { applyKokoroRenderMode, createRunConfiguration } from "../../runConfig";
import type { TTSEngineDiagnostics, VoiceJob, VoiceProfile } from "../../types";
import {
  buildRunEngineOptions,
  buildRunPlannerSummary,
  compareRunPlannerSummaries,
  runConfigurationFromVoiceJob,
  runIntentDefinition,
} from "./runConfigSteps";

describe("run configuration planner", () => {
  it("defines output intent as product behavior", () => {
    expect(runIntentDefinition("draftPreview")).toMatchObject({
      checking: "No checker gate",
      reporting: "No quality report",
      retries: "No automatic retries",
      speed: "Fast draft",
    });
    expect(runIntentDefinition("publishMaster")).toMatchObject({
      checking: "Checker validation before completion",
      reporting: "Quality report included",
      retries: "Retry rejected segments automatically",
      speed: "Quality-first generation",
    });
  });

  it("maps engine diagnostics to readiness choices", () => {
    const options = buildRunEngineOptions([
      engine({ id: "kokoro", label: "Kokoro", status: "ready" }),
      engine({
        id: "supertonic-3",
        label: "Supertonic 3",
        reason: "Install Supertonic runtime first.",
        status: "unavailable",
      }),
    ]);

    expect(options.find((option) => option.id === "kokoro")).toMatchObject({
      label: "Kokoro",
      readinessLabel: "Ready",
    });
    expect(options.find((option) => option.id === "supertonic-3")).toMatchObject({
      disabled: true,
      readinessDetail: "Install Supertonic runtime first.",
      readinessLabel: "Setup needed",
    });
  });

  it("summarizes cloned profile voice paths and structured content", () => {
    const configuration = applyKokoroRenderMode(
      createRunConfiguration("checkedMaster"),
      "kokoro-embed",
    );
    const summary = buildRunPlannerSummary({
      configuration,
      policyLabel: "Accessibility",
      sampleText: "A short listener-ready sample.",
      scopeLabel: "Chapter 2",
      selectedProfile: voiceProfile(),
      sourceLabel: "Research note",
      ttsEngines: [engine({ id: "kokoro", label: "Kokoro", status: "ready" })],
    });

    expect(summary.voicePath).toMatchObject({
      detail: "Narrator One will render through its prepared Kokoro style artifact.",
      label: "Cloned profile artifact",
    });
    expect(summary.facts).toContainEqual({ label: "Speech profile", value: "Accessibility" });
    expect(summary.previewSample.text).toBe("A short listener-ready sample.");
    expect(summary.structuredContent).toContainEqual(
      expect.objectContaining({
        label: "Block segmentation",
        value: "Policy-aware blocks",
      }),
    );
    expect(summary.beforeGeneration.join(" ")).toContain(
      "Structured content is prepared into spoken blocks before synthesis.",
    );
  });

  it("compares current wizard plans against saved retry plans", () => {
    const current = buildRunPlannerSummary({
      configuration: createRunConfiguration("draftPreview"),
      policyLabel: "Enterprise",
      sampleText: "Retry sample.",
      scopeLabel: "Current source",
      sourceLabel: "Preview source",
      ttsEngines: [engine({ id: "auto", label: "Auto", status: "ready" })],
      voiceLabel: "Default voice",
    });
    const retry = buildRunPlannerSummary({
      configuration: runConfigurationFromVoiceJob(savedFailedJob()),
      policyLabel: "Accessibility",
      sampleText: "Retry sample.",
      scopeLabel: "Current source",
      sourceLabel: "Preview source",
      ttsEngines: [engine({ id: "auto", label: "Auto", status: "ready" })],
      voiceLabel: "Default voice",
    });

    expect(retry.intent.label).toBe("Publish Master");
    expect(retry.structuredContent).toContainEqual(
      expect.objectContaining({ label: "Retries", value: "Automatic" }),
    );
    expect(compareRunPlannerSummaries(current, retry)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          current: "Draft Preview",
          label: "Output intent",
          retry: "Publish Master",
        }),
        expect.objectContaining({
          current: "Enterprise",
          label: "Speech profile",
          retry: "Accessibility",
        }),
      ]),
    );
  });
});

function engine(overrides: Partial<TTSEngineDiagnostics>): TTSEngineDiagnostics {
  return {
    default: false,
    experimental: false,
    id: "auto",
    label: "Auto",
    local: true,
    status: "ready",
    supportsReference: true,
    supportsSSML: false,
    supportsSwedish: true,
    supportsVoice: true,
    ...overrides,
  };
}

function voiceProfile(): VoiceProfile {
  return {
    audioFormat: "audio/wav",
    createdAt: "2026-06-04T00:00:00Z",
    durationMs: 10_000,
    id: "voice-1",
    language: "en",
    name: "Narrator One",
    referenceAudio: "/voices/voice-1.wav",
    referencePath: "/data/voices/voice-1.wav",
    referenceTrimmed: true,
    sourceBytes: 1024,
    sourceFile: "voice.wav",
    status: "ready",
    updatedAt: "2026-06-04T00:00:00Z",
  };
}

function savedFailedJob(): VoiceJob {
  return {
    audioUrl: "",
    contentType: "audio/wav",
    createdAt: "2026-06-04T00:00:00Z",
    durationMs: 0,
    id: "job-1",
    inputText: "Input",
    optimizedText: "Output",
    optimizer: "rules",
    performanceMode: "quality",
    pipelineOptions: {
      arrivalPlayback: true,
      asrCheck: true,
      autoRetry: true,
      qualityReport: true,
      textPreprocess: true,
      voiceClone: false,
    },
    progress: {
      activeStage: "checker",
      detail: "Failed",
      message: "Failed",
    },
    projectId: "project",
    provider: "mock",
    retries: {
      attempts: 1,
      currentSegment: 1,
      maxRetries: 3,
      segmentAttempts: 1,
      totalSegments: 1,
    },
    retriable: true,
    runMode: "publishMaster",
    speechPolicyProfile: "Accessibility",
    stages: { checker: "failed", optimization: "done", synthesis: "done" },
    status: "failed",
    ttsEngine: "auto",
    updatedAt: "2026-06-04T00:00:00Z",
    voice: "Default voice",
    voiceCheck: {
      complete: false,
      needsResume: true,
      provider: "mock",
      reason: "failed",
      similarity: 0,
      transcript: "",
    },
  };
}
