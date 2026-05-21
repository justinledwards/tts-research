import { describe, expect, it } from "vitest";
import type { VoiceProfile } from "../../types";
import {
  kokoroVoicepacksForLanguage,
  languageAwareVoiceSummary,
  voiceProfilesForLanguage,
} from "./languageVoiceMapping";

describe("language voice mapping", () => {
  it("filters Kokoro voicepacks by source language when supported", () => {
    const french = kokoroVoicepacksForLanguage("fr-FR");

    expect(french).toHaveLength(1);
    expect(french[0].id).toBe("ff_siwis");
  });

  it("orders saved profiles by language match", () => {
    const profiles = [voiceProfile("english", "en-US"), voiceProfile("swedish", "sv-SE")];

    expect(voiceProfilesForLanguage("sv", profiles).map((profile) => profile.id)).toEqual([
      "swedish",
    ]);
    expect(languageAwareVoiceSummary("sv-SE", profiles)).toContain("Swedish");
  });
});

function voiceProfile(id: string, language: string): VoiceProfile {
  return {
    audioFormat: "wav",
    cloneArtifacts: {},
    cloneTargets: {},
    createdAt: "2026-05-21T00:00:00.000Z",
    durationMs: 1000,
    id,
    language,
    name: id,
    referenceAudio: `${id}.wav`,
    referenceDurationMs: 1000,
    referencePath: `/tmp/${id}.wav`,
    referenceTrimmed: false,
    sourceBytes: 100,
    sourceFile: `${id}.wav`,
    status: "ready",
    updatedAt: "2026-05-21T00:00:00.000Z",
  };
}
