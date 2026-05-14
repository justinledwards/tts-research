import type { VoiceJob } from "./types";

function estimateSegmentDurationSec(
  index: number,
  job: VoiceJob,
  totalKnownSegments: number,
  averageKnownDurationSec: number,
): number {
  const knownDurations = job.audioSegmentDurationsMs ?? [];
  if (knownDurations[index] && knownDurations[index] > 0) {
    return knownDurations[index] / 1000;
  }

  const fallbackSec = Math.max(0, averageKnownDurationSec);
  if (fallbackSec > 0) {
    return fallbackSec;
  }

  if (index < totalKnownSegments) {
    return 0.7;
  }

  return 0;
}

export function pickActiveSegmentIndex(job: VoiceJob | null, cursorSec: number): number {
  if (!job?.segments || job.segments.length === 0) {
    return 0;
  }

  const segments = job.segments;
  const safeCursor = Number.isFinite(cursorSec) && cursorSec >= 0 ? cursorSec : 0;
  const durations = job.audioSegmentDurationsMs ?? [];

  const knownDurationsSec = durations
    .map((value) => (Number.isFinite(value) && value > 0 ? value / 1000 : 0))
    .filter((value) => value > 0);
  const totalKnownDurationSec = knownDurationsSec.reduce((sum, value) => sum + value, 0);
  const averageKnownDurationSec =
    knownDurationsSec.length > 0 ? totalKnownDurationSec / knownDurationsSec.length : 0;

  let cursor = 0;
  for (let index = 0; index < segments.length; index += 1) {
    const segmentDurationSec = estimateSegmentDurationSec(
      index,
      job,
      durations.length,
      averageKnownDurationSec,
    );

    const segmentEnd = cursor + segmentDurationSec;
    if (segmentEnd <= cursor) {
      cursor += 0.05;
      continue;
    }

    if (safeCursor < segmentEnd || index === segments.length - 1) {
      return index;
    }
    cursor = segmentEnd;
  }

  return segments.length - 1;
}

export function calculateArrivalThroughput(job: VoiceJob | null): { pace: number } | null {
  if (!job) {
    return null;
  }
  const durations = job.audioSegmentDurationsMs ?? [];
  const latencies = job.audioSegmentLatenciesMs ?? [];
  const readyCount = Math.min(job.audioReadySegments ?? 0, durations.length, latencies.length);
  if (readyCount <= 0) {
    return null;
  }

  const windowSize = Math.min(6, readyCount);
  let durationMS = 0;
  let latencyMS = 0;
  for (let index = readyCount - windowSize; index < readyCount; index += 1) {
    durationMS += Math.max(0, durations[index] ?? 0);
    latencyMS += Math.max(0, latencies[index] ?? 0);
  }
  if (durationMS <= 0 || latencyMS <= 0) {
    return null;
  }
  return { pace: durationMS / latencyMS };
}

export function formatBufferHealth(job: VoiceJob | null): string {
  if (!job) {
    return "Waiting";
  }
  const retryTotal = job.retries.totalSegments;
  const segmentTotal = job.segments?.length ?? 0;
  const total = retryTotal > 0 ? retryTotal : segmentTotal;
  const ready = job.audioReadySegments ?? 0;
  if (total <= 0 || ready <= 0) {
    return "Waiting";
  }
  if (job.status === "completed") {
    return "Complete";
  }
  const ratio = ready / total;
  if (ratio >= 0.3) {
    return "Good";
  }
  return "Building";
}
