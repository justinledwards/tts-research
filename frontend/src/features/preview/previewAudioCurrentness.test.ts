import { describe, expect, it } from "vitest";
import type { CreateVoiceJobRequest, VoiceJob } from "../../types";
import { generatedAudioLifecycleFromJob } from "../playback/generatedAudioLifecycle";
import { buildCanonicalPreviewSpeechPlan, type RevisionBlock } from "../revision";
import { resolvePreviewAudioCurrentness } from "./previewAudioCurrentness";

describe("preview audio currentness", () => {
  it("keeps completed review-warning audio current when synthesized text matches", () => {
    const plan = speechPlan("Intro body.");
    const job = voiceJob({
      inputText: "Intro body.",
      optimizedText: "Intro body.",
      qualityReport: {
        averageLatencyMs: 120,
        averageSimilarity: 0.88,
        enabled: true,
        preprocessChangedPct: 0,
        reason: "completed with 1 segment review warning(s)",
        referenceProfile: false,
        retryCount: 1,
        segmentCount: 1,
        unverifiedSegmentCount: 1,
        warningCount: 1,
      },
      segments: [
        {
          index: 1,
          reason: "ASR transcript did not sufficiently match",
          status: "ready",
          text: "Intro body.",
          warnings: ["ASR validation exhausted; audio kept for review."],
        },
      ],
      voiceCheck: {
        complete: true,
        needsResume: false,
        provider: "mock",
        reason: "completed with 1 segment review warning(s)",
        similarity: 0.88,
        transcript: "Intro body.",
      },
    });

    const currentness = resolvePreviewAudioCurrentness({
      job,
      request: request({ text: plan.text }),
      speechPlan: plan,
    });

    expect(currentness).toMatchObject({ playable: true, reasons: [], stale: false });
    expect(generatedAudioLifecycleFromJob({ job, stale: currentness.stale })).toBe("ready");
  });

  it("accepts completed full partial audio when all segments are ready", () => {
    const plan = speechPlan("Intro body.");
    const job = voiceJob({
      audioPartialUrl: "/audio/job.partial.wav",
      audioReadySegments: 2,
      audioUrl: "",
      inputText: "Intro body.",
      optimizedText: "Intro body.",
      retries: {
        attempts: 2,
        currentSegment: 2,
        maxRetries: 2,
        segmentAttempts: 2,
        totalSegments: 2,
      },
      segments: [
        { index: 1, status: "ready", text: "Intro " },
        { index: 2, status: "ready", text: "body." },
      ],
    });

    const currentness = resolvePreviewAudioCurrentness({
      job,
      request: request({ text: plan.text }),
      speechPlan: plan,
    });

    expect(currentness).toMatchObject({ playable: true, reasons: [], stale: false });
    expect(generatedAudioLifecycleFromJob({ job, stale: currentness.stale })).toBe("ready");
  });

  it("blocks true text drift and reports the stale predicate", () => {
    const currentness = resolvePreviewAudioCurrentness({
      job: voiceJob({ inputText: "Old text.", optimizedText: "Old text." }),
      request: request({ text: "Current text." }),
      speechPlan: speechPlan("Current text."),
    });

    expect(currentness.stale).toBe(true);
    expect(currentness.reasons).toContain("text-mismatch");
    expect(currentness.technicalDetail).toBe("audio-currentness=text-mismatch");
  });

  it("reports true config drift while ignoring provider voice display fallback", () => {
    const plan = speechPlan("Intro body.");
    const configDrift = resolvePreviewAudioCurrentness({
      job: voiceJob({
        inputText: "Intro body.",
        optimizedText: "Intro body.",
        ttsEngine: "kokoro",
      }),
      request: request({ text: plan.text, ttsEngine: "supertonic-3" }),
      speechPlan: plan,
    });
    const providerVoiceOnly = resolvePreviewAudioCurrentness({
      job: voiceJob({
        inputText: "Intro body.",
        optimizedText: "Intro body.",
        ttsVoice: "",
        voice: "provider-result-voice",
      }),
      request: request({ text: plan.text, ttsVoice: "af_heart" }),
      speechPlan: plan,
    });

    expect(configDrift.stale).toBe(true);
    expect(configDrift.reasons).toContain("tts-engine-mismatch");
    expect(providerVoiceOnly.stale).toBe(false);
    expect(providerVoiceOnly.reasons).not.toContain("tts-voice-mismatch");
  });

  it("reports missing playable audio without treating it as source drift", () => {
    const plan = speechPlan("Intro body.");
    const currentness = resolvePreviewAudioCurrentness({
      job: voiceJob({
        audioPartialUrl: "",
        audioReadySegments: 0,
        audioUrl: "",
        inputText: "Intro body.",
        optimizedText: "Intro body.",
        retries: {
          attempts: 1,
          currentSegment: 1,
          maxRetries: 1,
          segmentAttempts: 1,
          totalSegments: 1,
        },
        segments: [{ index: 1, status: "pending", text: "Intro body." }],
      }),
      request: request({ text: plan.text }),
      speechPlan: plan,
    });

    expect(currentness).toMatchObject({
      playable: false,
      reasons: ["missing-playable-audio"],
      stale: false,
    });
    expect(
      generatedAudioLifecycleFromJob({ job: currentnessJobWithoutAudio(), stale: false }),
    ).toBe("degraded");
  });
});

function speechPlan(text: string) {
  return buildCanonicalPreviewSpeechPlan([revisionBlock({ spokenText: text, text })]);
}

function request(overrides: Partial<CreateVoiceJobRequest> = {}): CreateVoiceJobRequest {
  return {
    performanceMode: "balanced",
    runMode: "checkedMaster",
    text: "Intro body.",
    ttsEngine: "kokoro",
    ...overrides,
  };
}

function voiceJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioReadySegments: 1,
    audioSegmentDurationsMs: [1000],
    audioUrl: "/audio/job.wav",
    contentType: "audio/wav",
    createdAt: "2026-06-06T10:00:00.000Z",
    durationMs: 1000,
    id: "job-1",
    inputText: "Intro body.",
    optimizedText: "Intro body.",
    optimizer: "rules",
    performanceMode: "balanced",
    progress: {
      activeStage: "done",
      currentSegment: 1,
      detail: "Audio generated with 1 segment needing audio review.",
      message: "Audio ready",
      totalSegments: 1,
    },
    projectId: "project-1",
    provider: "mock",
    retries: {
      attempts: 1,
      currentSegment: 1,
      maxRetries: 1,
      segmentAttempts: 1,
      totalSegments: 1,
    },
    runMode: "checkedMaster",
    segments: [{ index: 1, status: "ready", text: "Intro body." }],
    stages: { checker: "done", optimization: "done", synthesis: "done" },
    status: "completed",
    ttsEngine: "kokoro",
    updatedAt: "2026-06-06T10:01:00.000Z",
    voice: "provider-result-voice",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "all generated segments passed voice checking",
      similarity: 0.99,
      transcript: "Intro body.",
    },
    ...overrides,
  };
}

function currentnessJobWithoutAudio(): VoiceJob {
  return voiceJob({
    audioPartialUrl: "",
    audioReadySegments: 0,
    audioUrl: "",
    retries: {
      attempts: 1,
      currentSegment: 1,
      maxRetries: 1,
      segmentAttempts: 1,
      totalSegments: 1,
    },
    segments: [{ index: 1, status: "pending", text: "Intro body." }],
  });
}

function revisionBlock(overrides: Partial<RevisionBlock> = {}): RevisionBlock {
  return {
    confidence: 1,
    estimatedDurationMs: 1000,
    id: "block-1",
    index: 1,
    kind: "text",
    label: "Intro",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Draft text",
    speakMode: "speak",
    spokenText: "Intro body.",
    status: "waiting",
    text: "Intro body.",
    warnings: [],
    ...overrides,
  };
}
