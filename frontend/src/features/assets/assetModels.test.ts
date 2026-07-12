import { describe, expect, it } from "vitest";
import type { BookSource, PreparedSource, VoiceJob, VoiceProfile } from "../../types";
import { BUILT_IN_SPEECH_POLICY_SETTINGS } from "../../speechPolicy";
import {
  buildSourceAssetModels,
  buildSpeechPolicyAssetModel,
  buildVoiceAssetModels,
} from "./assetModels";

describe("asset models", () => {
  it("labels active and available sources with readiness, policy, and usage", () => {
    const models = buildSourceAssetModels({
      activeBookSourceId: "book-1",
      activePreparedSourceId: null,
      bookSources: [bookSource()],
      jobs: [
        job({
          bookSourceId: "book-1",
          completedAt: "2026-06-03T12:00:00Z",
          id: "job-book",
        }),
        job({
          id: "job-prepared",
          preparedSourceId: "prepared-1",
          updatedAt: "2026-06-02T12:00:00Z",
        }),
      ],
      preparedSources: [preparedSource({ sourceSpeechPolicyProfile: "Accessibility" })],
      selectedBookScope: { type: "chapter", chapterIndex: 0, label: "Chapter 1" },
    });

    const activeBook = models.find((model) => model.id === "book-1");
    const prepared = models.find((model) => model.id === "prepared-1");

    expect(activeBook?.availabilityLabel).toBe("Active source");
    expect(activeBook?.reuseLabel).toBe("Reused 1 run");
    expect(activeBook?.usage.lastUsedAt).toBe("2026-06-03T12:00:00Z");
    expect(activeBook?.structureLabel).toBe("2 chapters · 12 pages");
    expect(prepared?.availabilityLabel).toBe("Available source");
    expect(prepared?.policyPinLabel).toBe("Policy pinned");
    expect(prepared?.readiness).toBe("ready");
  });

  it("labels stale, failed, and needs-metadata source readiness", () => {
    const stale = buildSourceAssetModels({
      activeBookSourceId: null,
      activePreparedSourceId: "prepared-1",
      bookSources: [],
      jobs: [
        job({
          id: "job-stale",
          preparedSourceId: "prepared-1",
          status: "completed",
          updatedAt: "2026-05-31T12:00:00Z",
        }),
      ],
      preparedSources: [
        preparedSource({
          sourceReadiness: {
            detail: "Metadata is older than the source.",
            staleReason: "metadata_outdated",
            state: "stale",
          },
          updatedAt: "2026-06-01T12:00:00Z",
        }),
      ],
    });
    const failed = buildSourceAssetModels({
      bookSources: [
        bookSource({
          sourceReadiness: {
            detail: "Extractor failed.",
            failureStage: "extraction",
            state: "failed",
          },
        }),
      ],
      jobs: [],
      preparedSources: [],
    });

    expect(stale[0]?.readiness).toBe("stale");
    expect(failed[0]?.readiness).toBe("failed");
  });

  it("labels voice default, saved profiles, generated clones, unavailable state, and usage", () => {
    const models = buildVoiceAssetModels({
      jobs: [
        job({ id: "default-job" }),
        job({
          id: "profile-job",
          updatedAt: "2026-06-03T10:00:00Z",
          voiceProfileId: "profile-1",
        }),
      ],
      profiles: [
        voiceProfile(),
        voiceProfile({
          cloneArtifacts: {
            "kokoro-clone": {
              createdAt: "2026-06-01T10:00:00Z",
              engineId: "kokoro",
              moduleId: "kokoro-clone",
              status: "ready",
              updatedAt: "2026-06-01T10:00:00Z",
            },
          },
          id: "profile-2",
          name: "Clone",
        }),
        voiceProfile({ id: "profile-3", name: "Broken", status: "error" }),
      ],
      selectedProfileId: "profile-1",
    });

    expect(models[0]?.labels).toContain("Default voice");
    expect(models.find((model) => model.id === "profile-1")?.activeStateLabel).toBe("Active voice");
    expect(models.find((model) => model.id === "profile-1")?.usage.usageCount).toBe(1);
    expect(models.find((model) => model.id === "profile-2")?.labels).toContain("Generated clone");
    expect(models.find((model) => model.id === "profile-3")?.readinessLabel).toBe("Unavailable");
  });

  it("models policy inheritance, source pins, session overrides, and confirmation needs", () => {
    const model = buildSpeechPolicyAssetModel({
      bookSources: [bookSource({ sourceSpeechPolicyProfile: "Accessibility" })],
      customProfiles: [
        {
          baseProfile: "Enterprise",
          createdAt: "2026-06-01T10:00:00Z",
          id: "custom-1",
          name: "Studio Default",
          settings: BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
          updatedAt: "2026-06-01T10:00:00Z",
        },
      ],
      preparedSources: [preparedSource({ sourceSpeechPolicyOverrides: { codeMode: "summary" } })],
      sessionOverrides: { tableMode: "rowLinear" },
      speechPolicyProfile: "Enterprise",
      speechPolicyProfiles: [],
    });

    expect(model.projectDefaultLabel).toBe("Enterprise");
    expect(model.sourcePinCount).toBe(2);
    expect(model.sessionOverrideCount).toBe(1);
    expect(model.customPresetCount).toBe(1);
    expect(model.requiresConfirmation).toBe(true);
    expect(model.statusLabels).toContain("Requires confirmation");
  });
});

function bookSource(overrides: Partial<BookSource> = {}): BookSource {
  return {
    chapterCount: 2,
    createdAt: "2026-06-01T10:00:00Z",
    id: "book-1",
    kind: "epub",
    pageCount: 12,
    projectId: "project-1",
    sourceBytes: 4000,
    sourceFile: "book.epub",
    status: "ready",
    title: "Book One",
    updatedAt: "2026-06-01T10:00:00Z",
    wordCount: 5000,
    ...overrides,
  };
}

function preparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 5,
    createdAt: "2026-06-01T10:00:00Z",
    id: "prepared-1",
    kind: "file",
    projectId: "project-1",
    segmentCount: 3,
    sourceName: "article.md",
    speechPolicyProfile: "Enterprise",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 1,
      sentenceSegmentCount: 3,
      skippedBlockCount: 0,
      spokenBlockCount: 5,
    },
    title: "Prepared Article",
    updatedAt: "2026-06-01T10:00:00Z",
    wordCount: 1200,
    ...overrides,
  };
}

function voiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    audioFormat: "wav",
    createdAt: "2026-06-01T10:00:00Z",
    durationMs: 60_000,
    id: "profile-1",
    language: "en",
    name: "Narrator",
    referenceAudio: "/reference.wav",
    referencePath: "/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1000,
    sourceFile: "voice.wav",
    status: "ready",
    updatedAt: "2026-06-01T10:00:00Z",
    ...overrides,
  };
}

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioReadySegments: 1,
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    createdAt: "2026-06-01T10:00:00Z",
    durationMs: 120_000,
    id: "job-1",
    inputText: "Opening chapter",
    optimizedText: "Opening chapter",
    optimizer: "rules",
    progress: {
      activeStage: "synthesis",
      currentSegment: 1,
      detail: "Segment 1",
      message: "Generating audio.",
      totalSegments: 2,
    },
    projectId: "project-1",
    provider: "mock",
    retries: { currentSegment: 1, totalSegments: 2 },
    stages: {},
    status: "completed",
    updatedAt: "2026-06-01T10:00:00Z",
    voice: "default",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "",
      similarity: 0.94,
      transcript: "Opening chapter",
    },
    ...overrides,
  } as VoiceJob;
}
