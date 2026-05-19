import { describe, expect, it } from "vitest";
import { normalizeVoiceProfileSource } from "./api";
import { formatDuration } from "./format";
import { KOKORO_VOICEPACKS, kokoroVoicepackLabel } from "./kokoroVoices";
import {
  calculateArrivalThroughput,
  formatBufferHealth,
  pickActiveSegmentIndex,
} from "./studioMetrics";
import {
  DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
  buildTeleprompterCue,
  buildTeleprompterWordCues,
  normalizeTeleprompterHighlightSettings,
  pickTeleprompterWordIndex,
  splitTeleprompterTokens,
} from "./teleprompter";
import type { VoiceJob, VoiceProfileCandidate, VoiceProfileSource } from "./types";
import {
  candidateQualityLabel,
  candidateQualityScore,
  summarizeCandidateMetrics,
} from "./voiceProfileSourceMetrics";
import { buildWaveformBarsFromSamples, waveformProgressIndex } from "./waveform";

describe("formatDuration", () => {
  it("formats milliseconds as seconds", () => {
    expect(formatDuration(1234)).toBe("1.2s");
  });

  it("handles invalid durations", () => {
    expect(formatDuration(Number.NaN)).toBe("0.0s");
  });
});

const baseJob: VoiceJob = {
  id: "job-1",
  projectId: "default",
  status: "synthesizing",
  adaptiveMode: true,
  stages: {
    optimization: "done",
    synthesis: "running",
    checker: "running",
  },
  segments: [
    { index: 1, text: "Previous sentence.", status: "ready" },
    { index: 2, text: "Current sentence.", status: "ready" },
    { index: 3, text: "Next sentence.", status: "pending" },
  ],
  inputText: "Previous sentence. Current sentence. Next sentence.",
  optimizedText: "Previous sentence. Current sentence. Next sentence.",
  optimizer: "rules",
  audioUrl: "",
  audioPartialUrl: "",
  audioReadySegments: 2,
  audioSegmentDurationsMs: [1000, 2000],
  audioSegmentLatenciesMs: [500, 1000],
  contentType: "audio/wav",
  durationMs: 3000,
  provider: "mock",
  voice: "silent",
  retries: {
    maxRetries: 3,
    attempts: 2,
    segmentAttempts: 1,
    currentSegment: 2,
    totalSegments: 3,
  },
  voiceCheck: {
    complete: true,
    transcript: "Previous sentence. Current sentence.",
    needsResume: false,
    reason: "ok",
    provider: "mock",
    similarity: 0.9,
  },
  progress: {
    message: "Checked segment 2 of 3",
    detail: "ok",
    activeStage: "checking",
    currentSegment: 2,
    totalSegments: 3,
  },
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
};

describe("voice studio helpers", () => {
  it("selects the active read-along segment from the playback cursor", () => {
    expect(pickActiveSegmentIndex(baseJob, 0.2)).toBe(0);
    expect(pickActiveSegmentIndex(baseJob, 1.2)).toBe(1);
  });

  it("summarizes arrival pace and buffer health", () => {
    expect(calculateArrivalThroughput(baseJob)?.pace).toBe(2);
    expect(formatBufferHealth(baseJob)).toBe("Good");
  });
});

describe("Kokoro voice catalog", () => {
  it("matches the hexgrad Kokoro-82M v1.0 voicepack count and labels defaults", () => {
    expect(KOKORO_VOICEPACKS).toHaveLength(54);
    expect(kokoroVoicepackLabel("af_heart")).toBe("Heart (af_heart)");
    expect(kokoroVoicepackLabel("bf_emma")).toBe("Emma (bf_emma)");
  });
});

describe("teleprompter helpers", () => {
  it("preserves readable spacing while tokenizing words", () => {
    expect(splitTeleprompterTokens("Alpha  beta\nGamma")).toEqual([
      { kind: "word", text: "Alpha", wordIndex: 0 },
      { kind: "space", text: "  ", wordIndex: null },
      { kind: "word", text: "beta", wordIndex: 1 },
      { kind: "space", text: "\n", wordIndex: null },
      { kind: "word", text: "Gamma", wordIndex: 2 },
    ]);
  });

  it("resolves the active segment and word from the playback cursor", () => {
    const earlyCue = buildTeleprompterCue(baseJob, 1.2);
    expect(earlyCue?.segmentIndex).toBe(1);
    expect(earlyCue?.activeWordIndex).toBe(0);
    expect(earlyCue?.documentActiveWordIndex).toBe(2);

    const lateCue = buildTeleprompterCue(baseJob, 2.6);
    expect(lateCue?.segmentIndex).toBe(1);
    expect(lateCue?.activeWordIndex).toBe(1);
    expect(lateCue?.documentActiveWordIndex).toBe(3);
  });

  it("keeps the final word active at the end of a segment", () => {
    expect(pickTeleprompterWordIndex("one two three", 1)).toBe(2);
  });

  it("marks upcoming active and spoken words with configurable lead and fade", () => {
    const settings = {
      ...DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
      leadMs: 100,
      upcomingWindowMs: 250,
      spokenFadeMs: 600,
    };
    const cues = buildTeleprompterWordCues("one two three", 660, 1500, settings);

    expect(cues[0]?.state).toBe("spoken");
    expect(cues[1]?.state).toBe("active");
    expect(cues[2]?.state).toBe("upcoming");
    expect(cues[2]?.intensity).toBeGreaterThan(0);
  });

  it("normalizes teleprompter preferences into safe ranges", () => {
    expect(
      normalizeTeleprompterHighlightSettings({
        leadMs: 2000,
        spokenFadeMs: 50,
        upcomingIntensity: 4,
        effectStyle: "classic",
      }),
    ).toMatchObject({
      leadMs: 900,
      spokenFadeMs: 120,
      upcomingIntensity: 0.7,
      effectStyle: "classic",
    });
  });
});

const baseCandidate: VoiceProfileCandidate = {
  id: "speaker-00",
  speakerId: "SPEAKER_00",
  suggestedName: "Voice 1",
  status: "ready",
  rank: 1,
  recommended: true,
  suitability: "recommended",
  warnings: [],
  referenceDurationMs: 45_000,
  referenceVersion: "v1",
  referenceSampleStrategy: "speaker-aware-best-spans",
  strategyVersion: "speaker-aware-v1",
  modelVersion: "mock",
  score: 0.91,
  totalSpeechDurationMs: 60_000,
  spans: [{ startMs: 0, endMs: 45_000, durationMs: 45_000, score: 0.91 }],
  qualityMetrics: {
    cleanSpeech: 0.92,
    singleSpeakerConfidence: 0.94,
    usableDurationMs: 45_000,
    clippingRisk: 0.02,
    noiseRisk: 0.04,
    silenceRatio: 0.08,
    sourceCoverage: 0.7,
  },
  createdAt: "2026-05-14T00:00:00Z",
  updatedAt: "2026-05-14T00:00:00Z",
};

describe("voice profile source helpers", () => {
  it("normalizes nullable source-analysis arrays from queued API responses", () => {
    const source = normalizeVoiceProfileSource({
      id: "source-1",
      status: "queued",
      sourceFile: "demo.mp4",
      sourceBytes: 1024,
      audioFormat: "audio/wav",
      progressMessage: "Queued",
      stages: null,
      candidates: null,
      strategyVersion: "speaker-aware-v1",
      createdAt: "2026-05-14T00:00:00Z",
      updatedAt: "2026-05-14T00:00:00Z",
    } as unknown as VoiceProfileSource);

    expect(source.stages).toEqual([]);
    expect(source.candidates).toEqual([]);
  });

  it("normalizes transcript metadata onto source and candidate compatibility fields", () => {
    const source = normalizeVoiceProfileSource({
      id: "source-1",
      status: "ready",
      sourceFile: "demo.wav",
      sourceBytes: 1024,
      audioFormat: "audio/wav",
      progressMessage: "Ready",
      stages: [],
      candidates: [
        {
          ...baseCandidate,
          transcriptMetadata: {
            text: "candidate words",
            generatedAt: "2026-05-18T19:31:00Z",
            model: "test-asr",
          },
        },
      ],
      transcriptMetadata: {
        text: "source words",
        generatedAt: "2026-05-18T19:30:00Z",
        model: "test-asr",
      },
      strategyVersion: "speaker-aware-v1",
      createdAt: "2026-05-14T00:00:00Z",
      updatedAt: "2026-05-14T00:00:00Z",
    });

    expect(source.transcript).toBe("source words");
    expect(source.transcriptGeneratedAt).toBe("2026-05-18T19:30:00Z");
    expect(source.candidates[0]?.transcript).toBe("candidate words");
    expect(source.candidates[0]?.transcriptModel).toBe("test-asr");
  });

  it("labels strong source candidates with understandable quality language", () => {
    expect(candidateQualityScore(baseCandidate.qualityMetrics)).toBeGreaterThan(0.8);
    expect(candidateQualityLabel(baseCandidate)).toBe("Excellent");
    expect(summarizeCandidateMetrics(baseCandidate)).toContain("recommended");
  });

  it("labels high-quality short references separately", () => {
    const shortCandidate: VoiceProfileCandidate = {
      ...baseCandidate,
      referenceDurationMs: 12_000,
      suitability: "short_reference",
      warnings: ["Short reference"],
      qualityMetrics: {
        ...baseCandidate.qualityMetrics,
        usableDurationMs: 12_000,
      },
    };

    expect(candidateQualityLabel(shortCandidate)).toBe("Short, high-quality");
    expect(summarizeCandidateMetrics(shortCandidate)).toContain("short reference");
  });

  it("summarizes denoise and stitched span metadata", () => {
    const denoisedCandidate: VoiceProfileCandidate = {
      ...baseCandidate,
      referenceSpanCount: 3,
      denoise: {
        provider: "ffmpeg",
        strength: "balanced",
        applied: true,
        noiseRiskBefore: 0.44,
        noiseRiskAfter: 0.18,
      },
    };

    expect(summarizeCandidateMetrics(denoisedCandidate)).toContain("18% noise risk");
    expect(summarizeCandidateMetrics(denoisedCandidate)).toContain("3 stitched spans");
  });

  it("generates waveform bars from audio samples and progress indices", () => {
    const samples = new Float32Array(160);
    samples.fill(0.1, 0, 80);
    samples.fill(0.8, 80);

    const bars = buildWaveformBarsFromSamples(samples, 16);
    expect(bars).toHaveLength(16);
    expect(bars.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(bars.at(-1)).toBeGreaterThan(bars[0] ?? 0);
    expect(waveformProgressIndex(0.5, bars.length)).toBe(8);
  });
});
