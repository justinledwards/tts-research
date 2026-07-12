import { describe, expect, it } from "vitest";
import type { VoiceProfile, VoiceProfileSource } from "./types";
import {
  resolveVoiceCloneCompletionReference,
  resolveVoiceCloningActivity,
  resolveVoiceCloningActivityNow,
} from "./App";

const PROFILE_CREATED = "2026-01-01T00:00:00.000Z";
const PROFILE_UPDATED = "2026-01-01T00:10:00.000Z";
const TARGET_VALIDATION_MEASURED = "2026-01-01T00:05:00.000Z";
const TARGET_UPDATED = "2026-01-01T00:06:00.000Z";

describe("voice cloning timing", () => {
  it("keeps completed clone summary values stable as wall-clock advances", () => {
    const profile = completedProfile();
    const first = resolveVoiceCloningActivity({
      activeEngineId: "kokoro",
      buildingArtifactKey: null,
      createCandidateId: null,
      error: null,
      isAnalyzing: false,
      now: Date.parse("2026-01-01T00:09:00.000Z"),
      profileSource: null,
      profiles: [profile],
      selectedProfile: profile,
    });
    const second = resolveVoiceCloningActivity({
      activeEngineId: "kokoro",
      buildingArtifactKey: null,
      createCandidateId: null,
      error: null,
      isAnalyzing: false,
      now: Date.parse("2026-01-01T00:25:00.000Z"),
      profileSource: null,
      profiles: [profile],
      selectedProfile: profile,
    });

    expect(first.elapsed).toBe(second.elapsed);
    expect(first.lastUpdate).toBe(second.lastUpdate);
  });

  it("keeps running clone timing dependent on live now", () => {
    expect(
      resolveVoiceCloningActivityNow({
        completionReference: TARGET_VALIDATION_MEASURED,
        now: Date.parse("2026-01-01T00:09:00.000Z"),
        status: "running",
      }),
    ).toBe(Date.parse("2026-01-01T00:09:00.000Z"));
    expect(
      resolveVoiceCloningActivityNow({
        completionReference: TARGET_VALIDATION_MEASURED,
        now: Date.parse("2026-01-01T00:09:10.000Z"),
        status: "attention",
      }),
    ).toBe(Date.parse("2026-01-01T00:09:10.000Z"));
  });

  it("prefers measuredAt over target and profile activity timestamps", () => {
    const profile = completedProfile();
    expect(resolveVoiceCloneCompletionReference(profile, null, ["kokoro-clone"])).toBe(
      TARGET_VALIDATION_MEASURED,
    );
    expect(resolveVoiceCloneCompletionReference(null, profileSourceFallback(), null)).toBe(
      PROFILE_UPDATED,
    );
  });

  it("marks validation failure as attention before profile activation", () => {
    const profile = completedProfile();
    const target = profile.cloneTargets?.["kokoro-clone"];
    if (!target?.validation) {
      throw new Error("test fixture should include validation");
    }
    target.validation.status = "failed";
    target.validation.error = "Speaker likeness was below threshold.";
    const activity = resolveVoiceCloningActivity({
      activeEngineId: "kokoro",
      buildingArtifactKey: null,
      createCandidateId: null,
      error: null,
      isAnalyzing: false,
      now: Date.parse("2026-01-01T00:09:00.000Z"),
      profileSource: null,
      profiles: [profile],
      selectedProfile: profile,
    });

    expect(activity.status).toBe("attention");
    expect(activity.stages.find((stage) => stage.label === "Validate Voice")?.status).toBe(
      "failed",
    );
  });
});

function completedProfile(): VoiceProfile {
  return {
    id: "profile-id",
    name: "Primary",
    language: "en",
    status: "ready",
    audioFormat: "audio/wav",
    cloneTargets: {
      "kokoro-clone": {
        id: "kokoro-clone",
        selected: true,
        status: "ready",
        createdAt: PROFILE_CREATED,
        updatedAt: TARGET_UPDATED,
        validation: {
          status: "ready",
          measuredAt: TARGET_VALIDATION_MEASURED,
        },
      },
    },
    durationMs: 1024,
    createdAt: PROFILE_CREATED,
    updatedAt: PROFILE_UPDATED,
    referenceAudio: "reference.wav",
    referencePath: "/profiles/profile-id/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1024,
    sourceFile: "reference.wav",
  };
}

function profileSourceFallback() {
  return {
    id: "source-id",
    status: "queued",
    sourceFile: "source.wav",
    sourceBytes: 1024,
    audioFormat: "audio/wav",
    progressMessage: "ready",
    stages: [],
    candidates: [],
    createdAt: PROFILE_CREATED,
    updatedAt: PROFILE_UPDATED,
    strategyVersion: "1",
  } as const satisfies VoiceProfileSource;
}
