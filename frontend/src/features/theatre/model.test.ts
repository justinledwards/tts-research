import { describe, expect, it } from "vitest";
import { theatreAvailabilityState, theatreRuntimeShellState } from "./model";

describe("theatre runtime model", () => {
  it("distinguishes audio, timing, confidence, and renderer fallback states", () => {
    expect(theatreAvailabilityState({ audioLifecycle: "missing", playbackAvailable: false })).toBe(
      "waiting-audio",
    );
    expect(theatreAvailabilityState({ audioLifecycle: "failed", playbackAvailable: false })).toBe(
      "generation-failed",
    );
    expect(
      theatreAvailabilityState({
        audioLifecycle: "ready",
        playbackAvailable: true,
        timingState: "estimated",
      }),
    ).toBe("waiting-timing");
    expect(
      theatreAvailabilityState({
        audioLifecycle: "ready",
        playbackAvailable: true,
        timingState: "lowConfidence",
      }),
    ).toBe("low-confidence");
    expect(
      theatreAvailabilityState({
        audioLifecycle: "ready",
        playbackAvailable: true,
        rendererLifecycle: "failed",
      }),
    ).toBe("renderer-failed");
  });

  it("keeps recording rehearsal distinct from audio-follow and reading-only", () => {
    expect(
      theatreRuntimeShellState({
        audioLifecycle: "missing",
        playbackAvailable: false,
        requestedMode: "recording-rehearsal",
      }),
    ).toMatchObject({
      availabilityState: "waiting-audio",
      mode: "recording-rehearsal",
      statusLabel: "Recording rehearsal",
    });
    expect(
      theatreRuntimeShellState({
        audioLifecycle: "ready",
        playbackAvailable: true,
        requestedMode: "audio-follow",
      }),
    ).toMatchObject({
      availabilityState: "ready",
      mode: "audio-follow",
      statusLabel: "Audio-follow ready",
    });
    expect(
      theatreRuntimeShellState({
        availabilityState: "waiting-timing",
        playbackAvailable: true,
        requestedMode: "audio-follow",
      }),
    ).toMatchObject({
      mode: "reading-only",
      statusLabel: "Timing unavailable",
    });
  });
});
