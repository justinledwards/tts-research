import { describe, expect, it } from "vitest";
import type { VoiceProfile, VoiceProfileSource } from "../../types";
import { buildVoiceProfileDashboardModel } from "./voiceProfileModel";

describe("voice profile dashboard model", () => {
  it("surfaces provenance summaries for cloned profiles and active sources", () => {
    const profile = voiceProfile();
    const source = voiceProfileSource();
    const model = buildVoiceProfileDashboardModel({
      engines: [],
      modules: [],
      profiles: [profile],
      selectedProfileId: profile.id,
      source,
    });

    expect(model.profiles[0]?.provenanceSummary).toBe(
      "provided-recording · confirmed · speaker-consent · narration-profile",
    );
    expect(model.source?.provenanceSummary).toBe(
      "provided-recording · confirmed · speaker-consent · narration-profile",
    );
  });
});

function voiceProfile(): VoiceProfile {
  return {
    audioFormat: "audio/wav",
    createdAt: "2026-01-01T00:00:00.000Z",
    durationMs: 1000,
    id: "profile-1",
    language: "en",
    name: "Narrator",
    provenance: provenance(),
    referenceAudio: "reference.wav",
    referencePath: "/profiles/profile-1/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1024,
    sourceFile: "narrator.wav",
    status: "ready",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function voiceProfileSource(): VoiceProfileSource {
  return {
    audioFormat: "audio/wav",
    candidates: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "source-1",
    progressMessage: "Voice candidates are ready for review.",
    provenance: provenance(),
    sourceBytes: 1024,
    sourceFile: "narrator.wav",
    stages: [],
    status: "ready",
    strategyVersion: "v1",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function provenance() {
  return {
    allowedUse: "narration-profile",
    consentStatus: "confirmed",
    retentionPolicy: "keep-profile",
    rightsBasis: "speaker-consent",
    sourceType: "provided-recording",
  };
}
