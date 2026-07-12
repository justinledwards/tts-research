import type { VoiceJob } from "../../types";

export function audioReviewWarningCount(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const reportedCount = Math.max(0, job.qualityReport?.unverifiedSegmentCount ?? 0);
  const segmentCount = (job.segments ?? []).filter(
    (segment) => (segment.warnings?.length ?? 0) > 0,
  ).length;
  return Math.max(reportedCount, segmentCount);
}

export function audioReviewWarningTotal(job: VoiceJob | null | undefined): number {
  if (!job) {
    return 0;
  }
  const reportedCount = Math.max(0, job.qualityReport?.warningCount ?? 0);
  const segmentCount = (job.segments ?? []).reduce(
    (total, segment) => total + (segment.warnings?.length ?? 0),
    0,
  );
  return Math.max(reportedCount, segmentCount);
}

export function audioReviewWarningSummary(job: VoiceJob | null | undefined): string | null {
  const count = audioReviewWarningCount(job);
  if (count === 0) {
    return null;
  }
  return `Audio generated with ${count.toString()} ${count === 1 ? "segment" : "segments"} needing audio review.`;
}

export function audioReviewWarningReasons(job: VoiceJob | null | undefined, limit = 3): string[] {
  if (!job) {
    return [];
  }
  return (job.segments ?? [])
    .flatMap((segment) =>
      (segment.warnings ?? []).map((warning) => `Segment ${segment.index.toString()}: ${warning}`),
    )
    .slice(0, limit);
}
