import type { VoiceJob } from "../../types";

export interface SpeechFluencyDiagnosticRow {
  label: string;
  value: string;
}

export interface SpeechFluencyDiagnostics {
  durationEstimate: string;
  potentialClippedAudio: string;
  rowCount: number;
  rows: SpeechFluencyDiagnosticRow[];
  pauseModel: string;
  segmentSeamQuality: string;
}

export function buildSpeechFluencyDiagnostics(job?: VoiceJob | null): SpeechFluencyDiagnostics {
  const segments = job?.segments ?? [];
  const durations = job?.audioSegmentDurationsMs ?? [];
  const generatedDurationMs = durations.reduce((sum, duration) => sum + Math.max(0, duration), 0);
  const estimatedDurationMs = segments.reduce(
    (sum, segment) => sum + estimateMockSpeechDurationMs(segment.text),
    0,
  );
  const durationDeltaPct =
    estimatedDurationMs > 0
      ? Math.round(
          (Math.abs(generatedDurationMs - estimatedDurationMs) / estimatedDurationMs) * 100,
        )
      : 0;
  const maxSegmentDurationMs = Math.max(0, ...durations);
  const minSegmentDurationMs = durations.length > 0 ? Math.min(...durations) : 0;
  const readySegments = job?.audioReadySegments ?? durations.length;
  const seamCount = Math.max(0, readySegments - 1);
  const hasAudio = (job?.durationMs ?? 0) > 0 && readySegments > 0;
  const waveformEnergyAvailable = job?.provider === "mock" || job?.contentType === "audio/wav";
  const seamLabel = seamCount === 1 ? "seam" : "seams";
  const segmentSeamQuality = hasAudio
    ? `${seamCount.toLocaleString()} ${seamLabel} ready for local fluency review`
    : "Generate audio to inspect segment seams";
  const pauseModel = hasAudio
    ? "Uses punctuation-aware seam thresholds from local fluency gates"
    : "Pause model pending generated audio";
  const durationEstimate =
    generatedDurationMs > 0 && estimatedDurationMs > 0
      ? `${formatMs(generatedDurationMs)} generated / ${formatMs(estimatedDurationMs)} estimated (${durationDeltaPct.toLocaleString()}% delta)`
      : "Duration estimate pending generated segment data";
  const potentialClippedAudio = waveformEnergyAvailable
    ? "Waveform edge energy is checked in local reports; inspect speech-fluency-report for clipped starts or ends"
    : "Waveform edge energy is unavailable for this provider in the browser";

  return {
    durationEstimate,
    pauseModel,
    potentialClippedAudio,
    rowCount: 5,
    rows: [
      { label: "Ready segments", value: readySegments.toLocaleString() },
      { label: "Seams", value: seamCount.toLocaleString() },
      { label: "Shortest segment", value: formatMs(minSegmentDurationMs) },
      { label: "Longest segment", value: formatMs(maxSegmentDurationMs) },
      { label: "Duration delta", value: `${durationDeltaPct.toLocaleString()}%` },
    ],
    segmentSeamQuality,
  };
}

function estimateMockSpeechDurationMs(text: string): number {
  return Math.min(12_000, 800 + text.length * 35);
}

function formatMs(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "-";
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 1 : 2)}s`;
  }
  return `${Math.round(value).toLocaleString()}ms`;
}
