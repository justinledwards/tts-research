export interface PlaybackTimeLabels {
  readonly durationSec: number;
  readonly elapsedLabel: string;
  readonly elapsedSec: number;
  readonly hasDuration: boolean;
  readonly ratio: number;
  readonly remainingLabel: string;
  readonly totalLabel: string;
}

export function playbackTimeLabels({
  currentSec,
  durationMs,
  fallbackRatio = 0,
}: Readonly<{
  currentSec: number;
  durationMs: number | null | undefined;
  fallbackRatio?: number;
}>): PlaybackTimeLabels {
  const durationSec = playbackDurationSec(durationMs);
  const hasDuration = durationSec > 0;
  let elapsedSec = 0;
  if (hasDuration) {
    elapsedSec = clamp(currentSec, 0, durationSec);
  } else if (Number.isFinite(currentSec)) {
    elapsedSec = Math.max(0, currentSec);
  }
  return {
    durationSec,
    elapsedLabel: formatPlaybackClock(elapsedSec),
    elapsedSec,
    hasDuration,
    ratio: hasDuration ? elapsedSec / durationSec : clamp(fallbackRatio, 0, 1),
    remainingLabel: hasDuration ? `-${formatPlaybackClock(durationSec - elapsedSec)}` : "--:--",
    totalLabel: hasDuration ? `Total ${formatPlaybackClock(durationSec)}` : "Total --:--",
  };
}

export function formatPlaybackClock(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }
  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

function playbackDurationSec(durationMs: number | null | undefined): number {
  if (!Number.isFinite(durationMs) || !durationMs || durationMs <= 0) {
    return 0;
  }
  return durationMs / 1000;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}
