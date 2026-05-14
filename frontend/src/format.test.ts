import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";
import {
  calculateArrivalThroughput,
  formatBufferHealth,
  pickActiveSegmentIndex,
} from "./studioMetrics";
import type { VoiceJob, VoiceProfileCandidate } from "./types";
import {
  candidateQualityLabel,
  candidateQualityScore,
  summarizeCandidateMetrics,
} from "./voiceProfileSourceMetrics";
import { buildWaveformBars, waveformProgressIndex } from "./waveform";

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

const baseCandidate: VoiceProfileCandidate = {
  id: "speaker-00",
  speakerId: "SPEAKER_00",
  suggestedName: "Voice 1",
  status: "ready",
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
  it("labels strong source candidates with understandable quality language", () => {
    expect(candidateQualityScore(baseCandidate.qualityMetrics)).toBeGreaterThan(0.8);
    expect(candidateQualityLabel(baseCandidate)).toBe("Excellent");
    expect(summarizeCandidateMetrics(baseCandidate)).toContain("single speaker");
  });

  it("generates stable waveform bars and progress indices", () => {
    const bars = buildWaveformBars("job-1", 16);
    expect(bars).toHaveLength(16);
    expect(bars.every((value) => value >= 0 && value <= 1)).toBe(true);
    expect(buildWaveformBars("job-1", 16)).toEqual(bars);
    expect(waveformProgressIndex(0.5, bars.length)).toBe(8);
  });
});
