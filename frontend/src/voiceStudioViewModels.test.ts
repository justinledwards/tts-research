import { describe, expect, it } from "vitest";
import { buildVoiceLibraryViewModel } from "./voiceStudioViewModels";
import type { VoiceProfile } from "./types";

describe("voice studio view models", () => {
  it("keeps saved voices stable while polling updates profile status", () => {
    const profiles = [
      profile("charlie", "Charlie", "2026-01-03T00:00:00.000Z"),
      profile("alpha", "Alpha", "2026-01-01T00:00:00.000Z"),
      profile("bravo", "Bravo", "2026-01-02T00:00:00.000Z"),
      profile("delta", "Delta", "2026-01-04T00:00:00.000Z"),
    ];

    const first = buildVoiceLibraryViewModel({
      limit: 4,
      pinnedIds: ["delta"],
      profiles,
      recentIds: ["bravo"],
      selectedProfileId: "charlie",
    }).entries.map((entry) => entry.profile.id);

    const polledProfiles = profiles.map((item) =>
      item.id === "bravo" ? { ...item, referenceScore: 0.91 } : item,
    );
    const second = buildVoiceLibraryViewModel({
      limit: 4,
      pinnedIds: ["delta"],
      profiles: polledProfiles,
      recentIds: ["bravo"],
      selectedProfileId: "charlie",
    }).entries.map((entry) => entry.profile.id);

    expect(first).toEqual(["charlie", "delta", "bravo", "alpha"]);
    expect(second).toEqual(first);
  });

  it("falls back to deterministic name and created order", () => {
    const entries = buildVoiceLibraryViewModel({
      limit: 3,
      profiles: [
        profile("z", "Echo", "2026-01-02T00:00:00.000Z"),
        profile("a", "echo", "2026-01-01T00:00:00.000Z"),
        profile("b", "Alpha", "2026-01-03T00:00:00.000Z"),
      ],
      selectedProfileId: "",
    }).entries.map((entry) => entry.profile.id);

    expect(entries).toEqual(["b", "a", "z"]);
  });
});

function profile(id: string, name: string, createdAt: string): VoiceProfile {
  return {
    audioFormat: "audio/wav",
    createdAt,
    durationMs: 1000,
    id,
    language: "en",
    name,
    referenceAudio: "reference.wav",
    referencePath: `/profiles/${id}/reference.wav`,
    referenceTrimmed: false,
    sourceBytes: 100,
    sourceFile: "source.wav",
    status: "ready",
    updatedAt: createdAt,
  };
}
