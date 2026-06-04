import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VoiceSourceAnalysisPanel } from "./VoiceSourceAnalysisPanel";
import type { VoiceProfileCandidate, VoiceProfileSource } from "./types";

const noop = () => Promise.resolve();

describe("VoiceSourceAnalysisPanel", () => {
  it("makes source media and provenance the first disabled intake reason", () => {
    const markup = renderToStaticMarkup(
      <VoiceSourceAnalysisPanel
        createCandidateId={null}
        diagnostics={null}
        error={null}
        isAnalyzing={false}
        refreshingTranscriptKey={null}
        researchModules={[]}
        source={null}
        ttsEngines={[]}
        onAnalyze={noop}
        onCreateProfile={noop}
        onRefreshCandidateTranscript={noop}
        onRefreshSourceTranscript={noop}
      />,
    );

    expect(markup).toContain("Reference / Source Media");
    expect(markup).toContain("Provenance and consent");
    expect(markup).toContain("Choose source media first.");
  });

  it("uses Create Clone copy for ready speaker candidates", () => {
    const markup = renderToStaticMarkup(
      <VoiceSourceAnalysisPanel
        createCandidateId={null}
        diagnostics={null}
        error={null}
        isAnalyzing={false}
        refreshingTranscriptKey={null}
        researchModules={[]}
        source={voiceProfileSource()}
        ttsEngines={[]}
        onAnalyze={noop}
        onCreateProfile={noop}
        onRefreshCandidateTranscript={noop}
        onRefreshSourceTranscript={noop}
      />,
    );

    expect(markup).toContain("Detected Voices");
    expect(markup).toContain("Create Clone");
  });
});

function voiceProfileSource(): VoiceProfileSource {
  return {
    audioFormat: "audio/wav",
    candidates: [voiceProfileCandidate()],
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "source-1",
    progressMessage: "Voice candidates are ready for review.",
    sourceBytes: 1024,
    sourceFile: "narrator.wav",
    stages: [],
    status: "ready",
    strategyVersion: "v1",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function voiceProfileCandidate(): VoiceProfileCandidate {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "candidate-1",
    qualityMetrics: {
      cleanSpeech: 0.9,
      clippingRisk: 0,
      noiseRisk: 0.05,
      silenceRatio: 0.1,
      singleSpeakerConfidence: 0.95,
      sourceCoverage: 0.7,
      usableDurationMs: 24_000,
    },
    referenceDurationMs: 24_000,
    referenceSampleStrategy: "best-span",
    referenceVersion: "v1",
    score: 0.91,
    spans: [{ durationMs: 24_000, endMs: 24_000, score: 0.91, startMs: 0 }],
    speakerId: "SPEAKER_00",
    status: "ready",
    strategyVersion: "v1",
    suggestedName: "Narrator",
    totalSpeechDurationMs: 24_000,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
