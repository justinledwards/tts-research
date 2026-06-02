import { describe, expect, it } from "vitest";
import type { VoiceCloningActivitySummary } from "../../appVoiceCloningHelpers";
import type { VoiceJob } from "../../types";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import { resolveWorkspaceDisclosure, type WorkspaceDisclosureModel } from "../workspace/disclosure";
import { resolveWorkspaceStageStatus, type WorkspaceStageStatus } from "../workspace/stageActions";
import {
  compareNarrationPipelineState,
  resolveNarrationStatusModel,
  type NarrationStatusModelInput,
} from "./model";

describe("resolveNarrationStatusModel", () => {
  it("ranks attention states above cancellation and active playback", () => {
    expect(compareNarrationPipelineState("failed", "cancelled")).toBeGreaterThan(0);
    expect(compareNarrationPipelineState("cancelled", "playing")).toBeGreaterThan(0);
    expect(compareNarrationPipelineState("playing", "generating")).toBeGreaterThan(0);
  });

  it("shows idle when no source is selected", () => {
    const model = resolveNarrationStatusModel(
      input({
        canCreate: false,
        stageStatus: stageStatus({
          blocker: {
            correctiveAction: "intakeSource",
            detail: "Add a source before creating audio.",
            id: "waitingForSource",
            title: "Waiting for source",
          },
        }),
      }),
    );

    expect(model.state).toBe("idle");
    expect(model.primaryMessage).toBe("Choose a source to begin.");
  });

  it("shows waiting with a create action when a source is ready but audio is missing", () => {
    const model = resolveNarrationStatusModel(input({ canCreate: true }));

    expect(model.state).toBe("waiting");
    expect(model.primaryMessage).toBe("Ready to create audio.");
    expect(model.primaryAction?.id).toBe("create");
  });

  it("shows review repair warnings without blocking preview readiness", () => {
    const model = resolveNarrationStatusModel(
      input({
        canCreate: true,
        stageStatus: stageStatus({
          reviewState: "needsRepair",
          reviewWarningCount: 3,
        }),
      }),
    );

    expect(model.state).toBe("waiting");
    expect(model.chips.find((chip) => chip.id === "review")).toMatchObject({
      tone: "warning",
      value: "Needs repair",
    });
    expect(model.primaryAction?.id).toBe("create");
  });

  it("shows queued as the generating lane without segment inflation", () => {
    const model = resolveNarrationStatusModel(
      input({
        generatedAudioLifecycle: "queued",
        isProcessing: true,
        job: job({ status: "queued" }),
      }),
    );

    expect(model.state).toBe("generating");
    expect(model.primaryLabel).toBe("Queued");
    expect(model.queue.generatingCount).toBe(0);
  });

  it("summarizes generating segment progress", () => {
    const model = resolveNarrationStatusModel(
      input({
        generatedAudioLifecycle: "generating",
        isProcessing: true,
        job: job({
          audioReadySegments: 3,
          progress: {
            activeStage: "synthesis",
            currentSegment: 4,
            detail: "Rendering speech",
            message: "Synthesizing",
            startedAt: "2026-05-30T10:00:00.000Z",
            totalSegments: 18,
          },
          status: "synthesizing",
        }),
      }),
    );

    expect(model.state).toBe("generating");
    expect(model.primaryMessage).toBe("Generating segment 4 of 18.");
    expect(model.queue.readyCount).toBe(3);
    expect(model.queue.generatingCount).toBe(1);
  });

  it("prioritizes playing over ready audio", () => {
    const model = resolveNarrationStatusModel(
      input({
        generatedAudioLifecycle: "ready",
        isPlaybackActive: true,
        job: job({ status: "completed" }),
      }),
    );

    expect(model.state).toBe("playing");
    expect(model.primaryLabel).toBe("Playing");
  });

  it("shows ready when current audio is complete", () => {
    const model = resolveNarrationStatusModel(
      input({
        canOpenCinema: true,
        generatedAudioLifecycle: "ready",
        job: job({ status: "completed" }),
      }),
    );

    expect(model.state).toBe("ready");
    expect(model.primaryAction?.id).toBe("openCinema");
  });

  it("surfaces failures and cancellations with recovery copy", () => {
    const failed = resolveNarrationStatusModel(
      input({
        canCreate: true,
        generatedAudioLifecycle: "failed",
        job: job({ error: "Provider failed", status: "failed" }),
      }),
    );
    const cancelled = resolveNarrationStatusModel(
      input({
        canCreate: true,
        generatedAudioLifecycle: "failed",
        job: job({ status: "cancelled" }),
      }),
    );

    expect(failed.state).toBe("failed");
    expect(failed.blocker?.detail).toBe("Provider failed");
    expect(cancelled.state).toBe("cancelled");
    expect(cancelled.primaryLabel).toBe("Generation cancelled");
    expect(cancelled.primaryMessage).toBe("Generation cancelled. Retry generation");
  });

  it("blocks stale or degraded audio before ready playback", () => {
    const stale = resolveNarrationStatusModel(
      input({
        generatedAudioLifecycle: "stale",
        job: job({ status: "completed" }),
      }),
    );
    const degraded = resolveNarrationStatusModel(
      input({
        generatedAudioLifecycle: "degraded",
        job: job({ status: "completed" }),
      }),
    );

    expect(stale.state).toBe("blocked");
    expect(stale.blocker?.title).toBe("Audio needs rebuild");
    expect(degraded.state).toBe("blocked");
  });

  it("lets voice cloning attention become the current blocker", () => {
    const model = resolveNarrationStatusModel(
      input({
        voiceCloningActivity: voiceActivity({
          actionLabel: "Review Issue",
          message: "Clone validation failed.",
          status: "attention",
          statusLabel: "Attention Needed",
        }),
      }),
    );

    expect(model.state).toBe("blocked");
    expect(model.blocker?.title).toBe("Voice cloning needs attention");
    expect(model.primaryAction?.id).toBe("openVoiceCloning");
  });

  it("keeps missing confidence explicit", () => {
    const model = resolveNarrationStatusModel(input({ job: null }));

    expect(model.confidenceLabel).toBe("Waiting");
    expect(model.confidenceDetail).toBe("No check yet");
  });
});

function input(overrides: Partial<NarrationStatusModelInput> = {}): NarrationStatusModelInput {
  return {
    canCreate: false,
    canOpenCinema: false,
    disclosure: disclosure(),
    generatedAudioLifecycle: "missing",
    hint: "Start a job to see live TTS pipeline status.",
    isPlaybackActive: false,
    isPlaybackPlaying: false,
    isProcessing: false,
    job: null,
    now: Date.parse("2026-05-30T10:05:00.000Z"),
    projectJobs: [],
    sourceLifecycle: sourceLifecycle(),
    stageStatus: stageStatus(),
    voiceCloningActivity: voiceActivity(),
    ...overrides,
  };
}

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    adaptiveMode: false,
    audioReadySegments: 0,
    audioSegmentDurationsMs: [],
    audioSegmentLatenciesMs: [],
    audioUrl: "audio.mp3",
    completedAt: undefined,
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
    ttsEngine: "kokoro",
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

function sourceLifecycle(
  overrides: Partial<SourceLifecycleEnvelope> = {},
): SourceLifecycleEnvelope {
  return {
    adapterKind: "text",
    canonicalState: "narratable",
    extractionState: "imported",
    generatedAudioState: "missing",
    language: "Project default",
    lastOpenedSurface: "Preview",
    narrationState: "narratable",
    policyScope: "project",
    projectId: "default",
    selectedScope: "Draft text",
    sourceId: "draft",
    sourceKind: "draft",
    title: "Draft text",
    ...overrides,
  };
}

function stageStatus(overrides: Partial<WorkspaceStageStatus> = {}): WorkspaceStageStatus {
  return {
    ...resolveWorkspaceStageStatus({
      audioLifecycle: "missing",
      canCreate: true,
      canOpenCinema: false,
      hasListenerText: true,
      hasSource: true,
      hasVoice: true,
      sourcePreparing: false,
      stage: "preview",
    }),
    ...overrides,
  };
}

function voiceActivity(
  overrides: Partial<VoiceCloningActivitySummary> = {},
): VoiceCloningActivitySummary {
  return {
    activeProfile: null,
    actionLabel: "Create Clone",
    candidateDetail: "No candidates yet",
    detail: "Upload source media to begin.",
    elapsed: "waiting",
    eta: "n/a",
    lastUpdate: "No updates",
    message: "No source analysis is running.",
    sourceDetail: "No source queued",
    stages: [
      { label: "Analyze Source", status: "waiting" },
      { label: "Detect Speakers", status: "waiting" },
      { label: "Build Clone", status: "waiting" },
      { label: "Validate Voice", status: "waiting" },
    ],
    status: "idle",
    statusLabel: "Idle",
    ...overrides,
  };
}

function disclosure(): WorkspaceDisclosureModel {
  return resolveWorkspaceDisclosure({
    audioGeneration: { lifecycle: "missing", requiresPlayback: false },
    backendState: {
      active: false,
      blocking: false,
      online: true,
      warning: false,
    },
    diagnostics: {
      active: false,
      blocking: false,
      warning: false,
    },
    exportImport: {
      active: false,
      blocking: false,
      warning: false,
    },
    sourceDetails: {
      active: false,
      blocking: false,
      hasSource: true,
      warning: false,
    },
    stage: "preview",
    storage: {
      blocking: false,
      warning: false,
    },
    voiceCloning: {
      blocking: false,
      status: "idle",
    },
  });
}
