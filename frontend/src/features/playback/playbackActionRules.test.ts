import { describe, expect, it } from "vitest";
import type { VoiceJob } from "../../types";
import {
  GENERATED_AUDIO_LIFECYCLE_STATES,
  PLAYBACK_OWNERS,
  buildPlaybackState,
  generatedAudioLifecycleFromJob,
  generatedAudioLifecycleVisualClassName,
  playbackActionAriaLabel,
  playbackActionDisabledReason,
  playbackActionLabel,
  playbackOwnerCanOwnPlaybackControls,
  playbackOwnerCanRequestGeneration,
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
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("completed") })).toBe("degraded");
    expect(generatedAudioLifecycleFromJob({ job: voiceJob("failed") })).toBe("failed");
    expect(
      generatedAudioLifecycleFromJob({ job: voiceJob("completed", "/audio.wav"), stale: true }),
    ).toBe("stale");
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
