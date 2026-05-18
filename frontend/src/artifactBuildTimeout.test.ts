import { describe, expect, it, vi } from "vitest";
import { handleCloneTargetReadinessAction, resolveArtifactBuildTimeoutInput } from "./App";
import { createRunConfiguration } from "./runConfig";
import type { VoiceProfile } from "./types";

describe("artifact build timeout controls", () => {
  it("allows blank values and positive integer second overrides", () => {
    expect(resolveArtifactBuildTimeoutInput("")).toEqual({ canBuild: true, error: null });
    expect(resolveArtifactBuildTimeoutInput("  7200 ")).toEqual({
      canBuild: true,
      error: null,
      timeoutSeconds: 7200,
    });
  });

  it("rejects values the backend will not accept", () => {
    for (const input of ["0", "-1", "1.5", "abc"]) {
      expect(resolveArtifactBuildTimeoutInput(input)).toMatchObject({
        canBuild: false,
        error: "Timeout must be blank or a positive integer.",
      });
    }
  });

  it("passes the configured timeout through Workbench readiness actions", () => {
    const calls: [string, string, number | undefined][] = [];

    handleCloneTargetReadinessAction({
      canPrepare: true,
      canRevalidate: false,
      canUse: false,
      isBusy: false,
      moduleId: "kokoro-embed",
      profile: voiceProfile(),
      runConfiguration: createRunConfiguration("checkedMaster"),
      timeoutSeconds: 5400,
      ttsEngines: [],
      onBuildArtifact: (profileId, moduleId, timeoutSeconds) => {
        calls.push([profileId, moduleId, timeoutSeconds]);
        return Promise.resolve();
      },
      onCancelTarget: vi.fn(() => Promise.resolve()),
      onRunConfigurationChange: vi.fn(),
    });

    expect(calls).toEqual([["profile-id", "kokoro-embed", 5400]]);
  });
});

function voiceProfile(): VoiceProfile {
  return {
    audioFormat: "audio/wav",
    createdAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    id: "profile-id",
    language: "en",
    name: "Narrator",
    referenceAudio: "reference.wav",
    referencePath: "/profiles/profile-id/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1000,
    sourceFile: "reference.wav",
    status: "ready",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
