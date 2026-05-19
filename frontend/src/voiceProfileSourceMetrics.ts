import type { VoiceProfileCandidate, VoiceProfileQualityMetrics } from "./types";

export function candidateQualityLabel(candidate: VoiceProfileCandidate): string {
  if (candidate.status !== "ready") {
    return "Needs cleaner speech";
  }
  if (candidate.suitability === "short_reference") {
    return "Short, high-quality";
  }
  const score = candidateQualityScore(candidate.qualityMetrics);
  if (score >= 0.82) {
    return "Excellent";
  }
  if (score >= 0.68) {
    return "Strong";
  }
  return "Usable";
}

export function candidateQualityScore(metrics: VoiceProfileQualityMetrics): number {
  const cleanSpeech = clamp01(metrics.cleanSpeech);
  const purity = clamp01(metrics.singleSpeakerConfidence);
  const riskPenalty =
    clamp01(metrics.clippingRisk) * 0.28 +
    clamp01(metrics.noiseRisk) * 0.24 +
    clamp01(metrics.silenceRatio) * 0.18;
  return clamp01(cleanSpeech * 0.56 + purity * 0.44 - riskPenalty);
}

export function summarizeCandidateMetrics(candidate: VoiceProfileCandidate): string {
  const metrics = candidate.qualityMetrics;
  const summary = [
    `${formatPercent(metrics.cleanSpeech)} clean`,
    `${formatPercent(metrics.singleSpeakerConfidence)} single speaker`,
    `${formatPercent(metrics.sourceCoverage)} source coverage`,
  ];
  if (candidate.denoise?.applied) {
    summary.push(
      `${formatPercent(candidate.denoise.noiseRiskAfter ?? metrics.noiseRisk)} noise risk`,
    );
  }
  if ((candidate.referenceSpanCount ?? candidate.spans.length) > 1) {
    summary.push(
      `${String(candidate.referenceSpanCount ?? candidate.spans.length)} stitched spans`,
    );
  }
  if (candidate.suitability === "short_reference") {
    summary.push("short reference");
  }
  if (candidate.recommended) {
    summary.push("recommended");
  }
  return summary.join(" · ");
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return "0%";
  }
  return `${Math.round(clamp01(value) * 100).toString()}%`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
