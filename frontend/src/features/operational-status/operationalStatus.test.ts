import { describe, expect, it } from "vitest";
import type { VoiceJob } from "../../types";
import {
  operationalGeneratedAudioLifecycleReason,
  resolveOperationalAudioIssue,
  resolveOperationalCloningIssue,
  resolveOperationalReviewIssue,
  resolveOperationalSourceIssue,
  resolveOperationalSystemIssue,
  selectPrimaryOperationalIssue,
} from "./operationalStatus";

describe("operational status model", () => {
  it("maps retriable failures to one generation recovery path", () => {
    const issue = resolveOperationalAudioIssue({
      canCreate: true,
      canOpenCinema: false,
      job: job({
        error: "Provider failed while creating audio.",
        retriable: true,
        status: "failed",
        terminalReason: "provider_failed",
      }),
      lifecycle: "failed",
      requiresAudio: true,
    });

    expect(issue).toMatchObject({
      chipValue: "Retry",
      condition: "failed",
      label: "Generation failed",
      recovery: { id: "retryGeneration", label: "Retry generation" },
      severity: "warning",
    });
    expect(issue.detail).toBe("Provider failed while creating audio.");
    expect(issue.technicalDetail).toContain("terminalReason=provider_failed");
  });

  it("routes non-retriable configuration failures to diagnostics", () => {
    const issue = resolveOperationalAudioIssue({
      canCreate: true,
      canOpenCinema: false,
      job: job({
        error: "Voice profile artifact is missing.",
        retriable: false,
        status: "failed",
        terminalReason: "configuration_failed",
      }),
      lifecycle: "failed",
      requiresAudio: true,
    });

    expect(issue).toMatchObject({
      condition: "blocked",
      label: "Configuration blocks generation",
      recovery: { id: "openDiagnostics", label: "Open diagnostics" },
      severity: "error",
    });
  });

  it("keeps user cancellation separate from system failure", () => {
    const issue = resolveOperationalAudioIssue({
      canCreate: true,
      canOpenCinema: false,
      job: job({
        status: "cancelled",
        terminalReason: "user_cancelled",
      }),
      lifecycle: "failed",
      requiresAudio: true,
    });

    expect(issue).toMatchObject({
      condition: "cancelled",
      label: "Generation cancelled",
      recovery: { id: "retryGeneration", label: "Retry generation" },
      severity: "warning",
    });
  });

  it("distinguishes missing, rebuild, ready, and working audio conditions", () => {
    expect(
      resolveOperationalAudioIssue({
        canCreate: true,
        canOpenCinema: false,
        job: null,
        lifecycle: "missing",
      }),
    ).toMatchObject({
      chipValue: "Missing",
      label: "Audio missing",
      recovery: { id: "createAndListen", label: "Create & Listen" },
      severity: "ok",
    });
    expect(
      resolveOperationalAudioIssue({
        canCreate: true,
        canOpenCinema: false,
        job: job({ status: "completed" }),
        lifecycle: "stale",
        requiresAudio: true,
      }),
    ).toMatchObject({
      chipValue: "Needs rebuild",
      label: "Audio needs rebuild",
      recovery: { id: "rebuildAudio", label: "Rebuild audio" },
      severity: "warning",
    });
    expect(
      resolveOperationalAudioIssue({
        canCreate: false,
        canOpenCinema: true,
        job: job({ status: "completed" }),
        lifecycle: "ready",
      }),
    ).toMatchObject({
      chipValue: "Ready",
      label: "Audio ready",
      recovery: { id: "openCinema", label: "Open Cinema" },
      severity: "ok",
    });
    expect(
      resolveOperationalAudioIssue({
        canCancel: true,
        canCreate: false,
        canOpenCinema: false,
        job: job({ status: "synthesizing" }),
        lifecycle: "generating",
      }),
    ).toMatchObject({
      chipValue: "Working",
      label: "Audio working",
      recovery: { id: "cancelRun", label: "Cancel Run" },
      severity: "info",
    });
  });

  it("maps source, review, system, and cloning attention", () => {
    const source = resolveOperationalSourceIssue({
      descriptorLabel: "Narratable",
      detail: "Imported source is narratable.",
      sourceError: "PDF extraction failed.",
    });
    const review = resolveOperationalReviewIssue({ warningCount: 2 });
    const system = resolveOperationalSystemIssue({ attentionCount: 1 });
    const cloning = resolveOperationalCloningIssue({
      actionLabel: "Review Issue",
      message: "Clone validation failed.",
      status: "attention",
    });

    expect(source).toMatchObject({ label: "Source failed", recovery: { id: "openIntake" } });
    expect(review).toMatchObject({ label: "Review needs repair", recovery: { id: "openReview" } });
    expect(system).toMatchObject({
      label: "System attention",
      recovery: { id: "openDiagnostics" },
    });
    expect(cloning).toMatchObject({
      label: "Voice cloning needs attention",
      recovery: { id: "openVoiceCloning" },
    });
  });

  it("suppresses idle and complete voice cloning from operational status", () => {
    expect(
      resolveOperationalCloningIssue({
        actionLabel: "Create Clone",
        message: "No source analysis is running.",
        status: "idle",
      }),
    ).toBeNull();
    expect(
      resolveOperationalCloningIssue({
        actionLabel: "View Profile",
        message: "Kokoro Clone is ready.",
        status: "complete",
      }),
    ).toBeNull();
  });

  it("selects the most urgent blocking issue", () => {
    const source = resolveOperationalSourceIssue({
      descriptorLabel: "Narratable",
      detail: "Imported source is narratable.",
    });
    const review = resolveOperationalReviewIssue({ warningCount: 2 });
    const audio = resolveOperationalAudioIssue({
      canCreate: true,
      canOpenCinema: false,
      job: job({ retriable: true, status: "failed", terminalReason: "provider_failed" }),
      lifecycle: "failed",
      requiresAudio: true,
    });

    expect(selectPrimaryOperationalIssue([source, review, audio])?.label).toBe("Generation failed");
  });

  it("uses canonical generated-audio detail copy", () => {
    expect(operationalGeneratedAudioLifecycleReason("failed")).toBe(
      "Generation failed. Retry generation before playback.",
    );
    expect(operationalGeneratedAudioLifecycleReason("missing")).toBe(
      "Audio missing. Create & Listen before playback.",
    );
  });

  it("keeps conflicting generation recovery copy out of production source", () => {
    const featureSources = import.meta.glob<string>("../**/*.{ts,tsx}", {
      eager: true,
      import: "default",
      query: "?raw",
    });
    const shellSources = import.meta.glob<string>("../../*.{ts,tsx}", {
      eager: true,
      import: "default",
      query: "?raw",
    });
    const productionSources = { ...featureSources, ...shellSources };
    const forbiddenCopy = [
      "Audio failed",
      "Audio generation failed",
      "Generation stopped",
      "Job cancelled",
      "Retry audio",
      "Try again",
    ];
    const violations = Object.entries(productionSources).flatMap(([path, source]) => {
      if (path.includes(".test.")) {
        return [];
      }
      return forbiddenCopy
        .filter((copy) => source.includes(copy))
        .map((copy) => `${path}: ${copy}`);
    });

    expect(violations).toEqual([]);
  });
});

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    adaptiveMode: false,
    audioReadySegments: 0,
    audioSegmentDurationsMs: [],
    audioSegmentLatenciesMs: [],
    audioUrl: "audio.mp3",
    contentType: "audio/mpeg",
    createdAt: "2026-05-30T10:00:00.000Z",
    durationMs: 12_000,
    id: "job-123456",
    inputText: "Hello world",
    optimizedText: "Hello world",
    optimizer: "rules",
    progress: {
      activeStage: "waiting",
      detail: "",
      message: "",
      startedAt: "2026-05-30T10:00:00.000Z",
      totalSegments: 0,
    },
    projectId: "default",
    provider: "kokoro",
    retries: {
      attempts: 0,
      currentSegment: 0,
      maxRetries: 2,
      segmentAttempts: 0,
      totalSegments: 0,
    },
    stages: {
      checker: "waiting",
      optimization: "waiting",
      synthesis: "waiting",
    },
    status: "completed",
    updatedAt: "2026-05-30T10:01:00.000Z",
    voice: "af_heart",
    voiceCheck: {
      complete: false,
      needsResume: false,
      provider: "mock",
      reason: "",
      similarity: 0,
      transcript: "",
    },
    ...overrides,
  };
}
