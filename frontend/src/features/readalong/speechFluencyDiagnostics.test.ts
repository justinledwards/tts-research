import { describe, expect, it } from "vitest";
import type { VoiceJob } from "../../types";
import { buildSpeechFluencyDiagnostics } from "./speechFluencyDiagnostics";

describe("speech fluency diagnostics", () => {
  it("summarizes seam quality and duration estimate from generated segments", () => {
    const diagnostics = buildSpeechFluencyDiagnostics({
      audioReadySegments: 2,
      audioSegmentDurationsMs: [1200, 1600],
      contentType: "audio/wav",
      durationMs: 2800,
      provider: "mock",
      segments: [
        { index: 1, text: "First sentence." },
        { index: 2, text: "Second sentence." },
      ],
    } as VoiceJob);

    expect(diagnostics.segmentSeamQuality).toContain("1 seam");
    expect(diagnostics.pauseModel).toContain("punctuation-aware");
    expect(diagnostics.durationEstimate).toContain("generated");
    expect(diagnostics.potentialClippedAudio).toContain("Waveform edge energy");
  });
});
