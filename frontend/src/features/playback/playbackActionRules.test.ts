import { describe, expect, it } from "vitest";
import type { VoiceJob } from "../../types";
import {
  GENERATED_AUDIO_LIFECYCLE_STATES,
  PLAYBACK_OWNERS,
  buildPlaybackState,
  canQueueGeneratedAudioPlayback,
  generatedAudioLifecycleFromJob,
  generatedAudioLifecycleVisualClassName,
  isGeneratedAudioPartiallyPlayable,
  playbackActionAriaLabel,
  playbackActionDisabledReason,
  playbackActionLabel,
  playbackOwnerCanOwnPlaybackControls,
  playbackOwnerCanRequestGeneration,
  resolveAudioGenerationPipelineModel,
  validatePlaybackSurfaceOwnership,
} from "./index";

describe("playback ownership model", () => {
  it("declares the canonical playback owners and capabilities", () => {
    expect(PLAYBACK_OWNERS).toEqual(["preview", "cinema", "teleprompt", "workspace", "dashboard"]);
    expect(playbackOwnerCanOwnPlaybackControls("preview")).toBe(true);
    expect(playbackOwnerCanOwnPlaybackControls("cinema")).toBe(true);
    expect(playbackOwnerCanOwnPlaybackControls("teleprompt")).toBe(true);
    expect(playbackOwnerCanOwnPlaybackControls("workspace")).toBe(false);
    expect(playbackOwnerCanOwnPlaybackControls("dashboard")).toBe(false);
    expect(playbackOwnerCanRequestGeneration("workspace")).toBe(true);
    expect(playbackOwnerCanRequestGeneration("dashboard")).toBe(false);
  });

  it("maps playback action labels through one rule table", () => {
    expect(playbackActionLabel("preview")).toBe("Preview");
    expect(playbackActionLabel("audition")).toBe("Audition");
    expect(playbackActionLabel("play")).toBe("Play");
    expect(playbackActionLabel("createAndListen")).toBe("Create & Listen");
    expect(playbackActionLabel("openCinema")).toBe("Open Cinema");
    expect(playbackActionLabel("abCompare")).toBe("A/B Compare");
    expect(playbackActionLabel("retryGeneration")).toBe("Retry generation");
    expect(playbackActionLabel("rebuildAudio")).toBe("Rebuild audio");
  });

  it("normalizes generated-audio lifecycle states from jobs", () => {
    expect(GENERATED_AUDIO_LIFECYCLE_STATES).toContain("stale");
    expect(generatedAudioLifecycleFromJob({ job: null })).toBe("missing");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("queued") })).toBe("queued");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("synthesizing") })).toBe("generating");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("completed", "/audio.wav") })).toBe(
      "ready",
    );
    expect(
      generatedAudioLifecycleFromJob({
        job: {
          audioPartialUrl: "/audio/partial.wav",
          audioReadySegments: 2,
          audioUrl: "",
          retries: { totalSegments: 2 },
          status: "completed",
        } as VoiceJob,
      }),
    ).toBe("ready");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("completed") })).toBe("degraded");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("failed") })).toBe("failed");
    expect(
      generatedAudioLifecycleFromJob({ job: voiceJob("completed", "/audio.wav"), stale: true }),
    ).toBe("stale");
  });

  it("distinguishes final, partial, and queueable generated audio jobs", () => {
    const partialJob = {
      audioPartialUrl: "/jobs/job-1/partial.wav",
      audioReadySegments: 1,
      retries: { totalSegments: 3 },
      status: "synthesizing",
    } as VoiceJob;
    const queueableJob = {
      audioReadySegments: 0,
      retries: { totalSegments: 3 },
      status: "synthesizing",
    } as VoiceJob;
    const unplannedJob = {
      audioReadySegments: 0,
      retries: { totalSegments: 0 },
      status: "optimizing",
    } as VoiceJob;

    expect(isGeneratedAudioPartiallyPlayable(partialJob)).toBe(true);
    expect(canQueueGeneratedAudioPlayback(partialJob)).toBe(true);
    expect(isGeneratedAudioPartiallyPlayable(queueableJob)).toBe(false);
    expect(canQueueGeneratedAudioPlayback(queueableJob)).toBe(true);
    expect(canQueueGeneratedAudioPlayback(unplannedJob)).toBe(false);
  });

  it("uses the partial manifest to unlock streaming-first playback", () => {
    const manifestJob = {
      audioPartialUrl: "",
      partialAudioManifest: {
        audioUrl: "/api/voice-jobs/job-1/audio/partial",
        completeEnough: false,
        firstPlayableAt: "2026-06-14T10:10:30Z",
        readySegments: 2,
        status: "partialReady",
        totalSegments: 5,
      },
      status: "checking",
    } as VoiceJob;

    expect(isGeneratedAudioPartiallyPlayable(manifestJob)).toBe(true);
    expect(canQueueGeneratedAudioPlayback(manifestJob)).toBe(true);
  });

  it("keeps stale generated audio visually distinct from ready audio", () => {
    expect(generatedAudioLifecycleVisualClassName("stale")).not.toBe(
      generatedAudioLifecycleVisualClassName("ready"),
    );
    const state = buildPlaybackState({ lifecycle: "stale", owner: "cinema" });
    expect(state.canPlay).toBe(false);
    expect(state.disabledReason).toContain("Audio needs rebuild");
    expect(state.state).toBe("stale");
  });

  it("requires Create & Listen copy to declare the generation scope", () => {
    expect(playbackActionAriaLabel("createAndListen", { createScope: "selected-block" })).toContain(
      "selected block",
    );
    expect(playbackActionAriaLabel("createAndListen", { createScope: "current-scope" })).toContain(
      "current scope",
    );
    expect(playbackActionAriaLabel("createAndListen", { createScope: "whole-source" })).toContain(
      "whole source",
    );
  });

  it("uses lifecycle reasons for disabled playback actions", () => {
    expect(playbackActionDisabledReason({ action: "audition", lifecycle: "missing" })).toContain(
      "Audio missing",
    );
    expect(
      playbackActionDisabledReason({ action: "telepromptPlay", lifecycle: "generating" }),
    ).toContain("Teleprompt cue playback");
  });

  it("resolves the canonical audio generation pipeline states", () => {
    const ready = resolveAudioGenerationPipelineModel({
      canCreate: true,
      generatedAudioLifecycle: "missing",
      hasSource: true,
      hasSpokenText: true,
      reviewComplete: true,
      runtimeReady: true,
      voiceReady: true,
    });
    const partial = resolveAudioGenerationPipelineModel({
      canCreate: false,
      generatedAudioLifecycle: "generating",
      hasSource: true,
      hasSpokenText: true,
      job: {
        audioPartialUrl: "/jobs/job-1/partial.wav",
        audioReadySegments: 2,
        retries: { totalSegments: 5 },
        segments: [
          { index: 1, status: "ready", text: "One" },
          { index: 2, status: "ready", text: "Two" },
          { index: 3, status: "running", text: "Three" },
        ],
        status: "synthesizing",
      } as VoiceJob,
      reviewComplete: true,
      runtimeReady: true,
      voiceReady: true,
    });
    const failed = resolveAudioGenerationPipelineModel({
      canCreate: true,
      generatedAudioLifecycle: "failed",
      hasSource: true,
      hasSpokenText: true,
      job: {
        audioReadySegments: 1,
        failureKind: "engine",
        retriable: true,
        status: "failed",
      } as VoiceJob,
      reviewComplete: true,
      runtimeReady: true,
      voiceReady: true,
    });

    expect(ready).toMatchObject({
      canCreateAndListen: true,
      state: "readyToGenerate",
    });
    expect(partial).toMatchObject({
      canUsePartialAudio: true,
      pendingSegments: 3,
      readySegments: 2,
      state: "partialReady",
    });
    expect(partial.detail).toContain("Partially ready. 2/5 segments can play");
    expect(failed).toMatchObject({
      canRetryGeneration: true,
      failedKind: "engine",
      state: "failed",
    });
    expect(failed.detail).toContain("Retry generation");
  });

  it("flags duplicate primary playback ownership on one surface", () => {
    expect(
      validatePlaybackSurfaceOwnership([
        { action: "audition", primary: true },
        { action: "play", primary: true },
      ]),
    ).toEqual([expect.objectContaining({ kind: "multiple-primary-playback-owners" })]);
    expect(
      validatePlaybackSurfaceOwnership([
        { action: "audition", primary: true },
        { action: "audition", primary: true },
      ]),
    ).toEqual([
      expect.objectContaining({ kind: "duplicate-playback-action-owner", owner: "preview" }),
    ]);
  });
});

function voiceJob(status: VoiceJob["status"], audioUrl = ""): VoiceJob {
  return { audioUrl, status } as VoiceJob;
}
