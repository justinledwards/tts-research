import type { AlignmentQualityReport, HighlightMap } from "../../types";

export type AlignmentStatusTone = "success" | "info" | "warning" | "danger" | "muted";

export interface AlignmentStatus {
  detail: string;
  label: string;
  primaryLevel: "word" | "phrase" | "sentence" | "block";
  tone: AlignmentStatusTone;
  wordTimingReliable: boolean;
}

export function alignmentStatusFromReport(
  report: AlignmentQualityReport | null | undefined,
  fallbackMap?: HighlightMap | null,
): AlignmentStatus {
  if (report) {
    return {
      detail: report.fallbackReason ?? alignmentQualityDetail(report),
      label: alignmentQualityLabel(report),
      primaryLevel: report.primaryLevel,
      tone: toneForQuality(report.quality),
      wordTimingReliable: report.wordTimingReliable,
    };
  }
  if (fallbackMap) {
    const wordTimingReliable =
      fallbackMap.mode === "word" &&
      fallbackMap.summary.mode === "word" &&
      fallbackMap.summary.confidence.token >= 0.75;
    return {
      detail:
        fallbackMap.summary.reason ??
        (wordTimingReliable
          ? "Legacy highlight map has usable word timing."
          : "Legacy highlight map is using phrase-level or degraded timing."),
      label: wordTimingReliable ? "Word sync" : "Phrase sync",
      primaryLevel: wordTimingReliable ? "word" : "phrase",
      tone: wordTimingReliable ? "success" : "warning",
      wordTimingReliable,
    };
  }
  return {
    detail: "No generated-audio timing artifact is available yet.",
    label: "Timing pending",
    primaryLevel: "block",
    tone: "muted",
    wordTimingReliable: false,
  };
}

export function alignmentQualityLabel(report: AlignmentQualityReport): string {
  switch (report.quality) {
    case "exact": {
      return "Exact word sync";
    }
    case "good": {
      return report.wordTimingReliable ? "Good word sync" : "Good phrase sync";
    }
    case "phrase-only": {
      return "Phrase sync";
    }
    case "degraded": {
      return "Degraded sync";
    }
    case "unavailable": {
      return "Sync unavailable";
    }
  }
}

function alignmentQualityDetail(report: AlignmentQualityReport): string {
  if (report.wordTimingReliable) {
    return `${report.timingSourceV2} timing is trusted for word-level highlighting.`;
  }
  if (report.primaryLevel === "phrase") {
    return `${report.timingSourceV2} timing is available at phrase level; word-level highlighting is withheld.`;
  }
  return "Timing is not accurate enough for read-along highlighting.";
}

function toneForQuality(quality: AlignmentQualityReport["quality"]): AlignmentStatusTone {
  switch (quality) {
    case "exact":
    case "good": {
      return "success";
    }
    case "phrase-only": {
      return "warning";
    }
    case "degraded": {
      return "danger";
    }
    case "unavailable": {
      return "muted";
    }
  }
}
