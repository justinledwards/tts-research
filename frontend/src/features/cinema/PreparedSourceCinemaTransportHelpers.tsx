import { useAudioWaveformBars } from "../../audioWaveform";
import type { PlaybackProgress, VoiceJob } from "../../types";

export function TransportSettingPills({ items }: Readonly<{ items: string[] }>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          className="max-w-40 truncate rounded-md border px-2 py-1 text-xs font-semibold vs-border vs-muted"
          key={item}
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

export function Waveform({
  audioUrl,
  progressRatio,
}: Readonly<{ audioUrl: string; progressRatio: number }>) {
  const bars = useAudioWaveformBars(audioUrl, 96);
  if (!bars) {
    return <TransportWaveformPlaceholder label="Loading audio waveform..." />;
  }
  if (bars.length === 0) {
    return <TransportWaveformPlaceholder label="Waveform unavailable for this audio." />;
  }
  return (
    <div aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((amplitude, index) => {
        const active = index / bars.length <= progressRatio;
        return (
          <span
            className={`w-[2px] rounded-full ${active ? "bg-[var(--vs-action-primary-hover)]" : "bg-[var(--vs-action-disabled-bg)]"}`}
            key={`${audioUrl}-${index.toString()}`}
            style={{ height: `${String(5 + Math.round(amplitude * 20))}px` }}
          />
        );
      })}
    </div>
  );
}

export function TransportWaveformPlaceholder({
  label = "Audio waveform appears after generation.",
}: Readonly<{ label?: string }>) {
  const showVisualLabel = !/unavailable/i.test(label);
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-dashed px-2 text-xs font-medium vs-border vs-muted"
      title={label}
    >
      <span className={showVisualLabel ? "min-w-0 truncate" : "sr-only"}>{label}</span>
    </div>
  );
}

export function playbackProgressRatio(
  playbackCursorSec: number,
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
): number {
  if (progress) {
    return clamp01(progress.progress);
  }
  if (!job || job.durationMs <= 0) {
    return 0;
  }
  return clamp01(playbackCursorSec / (job.durationMs / 1000));
}

export function playbackDisplayCursorSec(
  playbackCursorSec: number,
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
  progressRatio: number,
): number {
  if (playbackCursorSec > 0) {
    return playbackCursorSec;
  }
  if (progress && progress.currentTimeSec > 0) {
    return progress.currentTimeSec;
  }
  if (job && job.durationMs > 0 && progressRatio > 0) {
    return (job.durationMs / 1000) * progressRatio;
  }
  return playbackCursorSec;
}

export function formatClockTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function PreparedSourceCinemaAudioBarsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 10v4M9 5v14M13 8v8M17 3v18M21 9v6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 4h3v12H6V4ZM11 4h3v12h-3V4Z" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="m6 4 10 6-10 6V4Z" />
    </svg>
  );
}

export function RestartIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68M4 4v4.68h4.68"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function SkipBackIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M11 7 6 12l5 5V7ZM18 7l-5 5 5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function SkipForwardIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m13 7 5 5-5 5V7ZM6 7l5 5-5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
