import { describe, expect, it } from "vitest";
import {
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";
import type { VoiceProfile } from "./types";

describe("voice profile target helpers", () => {
  it("requires selected target readiness before enabling clone engines", () => {
    const profile = profileWithTargets({
      "kokoro-clone": "ready",
      "kokoro-embed": "building",
      "supertonic-embed": "failed",
    });

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro-embed")).toBe(false);
    expect(isVoiceProfileTargetReadyForEngine(profile, "supertonic-3")).toBe(false);
    expect(voiceProfileTargetReadinessText(profile, "kokoro-embed")).toContain("building");
  });

  it("treats an unselected target as unavailable on new targeted profiles", () => {
    const profile = profileWithTargets({ "kokoro-embed": "ready" });

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(false);
    expect(voiceProfileTargetReadinessText(profile, "kokoro")).toContain("Prepare Kokoro Clone");
  });

  it("keeps legacy artifact profiles usable when target state is absent", () => {
    const profile = {
      ...baseProfile,
      cloneArtifacts: {
        "kokoro-embed": {
          moduleId: "kokoro-embed",
          engineId: "kokoro-embed",
          status: "ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    } satisfies VoiceProfile;

    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "kokoro-embed")).toBe(true);
    expect(isVoiceProfileTargetReadyForEngine(profile, "supertonic-3")).toBe(false);
  });
});

function profileWithTargets(targets: Record<string, "ready" | "building" | "failed">) {
  const now = new Date().toISOString();
  return {
    ...baseProfile,
    cloneTargets: Object.fromEntries(
      Object.entries(targets).map(([id, status]) => [
        id,
        {
          id,
          selected: true,
          status,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    ),
  } satisfies VoiceProfile;
}

const baseProfile: VoiceProfile = {
  id: "profile-1",
  name: "Narrator",
  language: "en",
  sourceFile: "source.wav",
  sourceBytes: 100,
  referenceAudio: "reference.wav",
  referencePath: "/profile/reference.wav",
  referenceTrimmed: false,
  audioFormat: "audio/wav",
  status: "ready",
  durationMs: 1000,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
