import type { ReactNode } from "react";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import type { PlaybackProgress, PreparedSource, VoiceJob } from "../../types";
import { playbackActionLabel } from "../playback";
import { READER_SEEK_SECONDS, type ReaderAccessibilitySettings } from "../reader-accessibility";
import { CinemaTheatreTransport } from "./CinemaTheatre";
import type { CinemaTransportModel } from "./CinemaTransportBar";
import { CinemaTransportBar } from "./CinemaTransportBar";
import {
  type CinemaRendererLifecycleState,
  cinemaRendererLifecycleDetail,
  cinemaRendererLifecycleLabel,
  type deriveCinemaPlaybackState,
  isCinemaRendererReady,
} from "./model";
import type { PreparedSourceCinemaPlaybackControls } from "./PreparedSourceCinemaBase";
import {
  formatClockTime,
  PauseIcon,
  PlayIcon,
  PreparedSourceCinemaAudioBarsIcon,
  playbackDisplayCursorSec,
  playbackProgressRatio,
  RestartIcon,
  SkipBackIcon,
  SkipForwardIcon,
  TransportSettingPills,
  TransportWaveformPlaceholder,
  Waveform,
} from "./PreparedSourceCinemaTransportHelpers";
import { preparedSourceCinemaMetrics, preparedSourceCinemaTitle } from "./preparedSourceModel";

export { PreparedSourceCinemaAudioBarsIcon } from "./PreparedSourceCinemaTransportHelpers";

export function PreparedSourceCinemaTransport({
  accessibilitySettings,
  canBookmark,
  canCreateAudio,
  isProcessing,
  job,
  playbackState,
  playbackControls,
  playbackCursorSec,
  progress,
  rendererLifecycle,
  source,
  theatreControlsVisible = true,
  variant = "normal",
  onAccessibilitySettingsChange,
  onBookmark,
  onCreateAudio,
  onPlayPause,
  onRestart,
  onSkip,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  canBookmark: boolean;
  canCreateAudio: boolean;
  isMobileSheetOpen: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>;
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  rendererLifecycle: CinemaRendererLifecycleState;
  source: PreparedSource;
  theatreControlsVisible?: boolean;
  variant?: "normal" | "theatre";
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCreateAudio: (source: PreparedSource) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
  onTheatreMode?: () => void;
  onToggleMobilePanel: () => void;
}>) {
  const progressRatio = playbackProgressRatio(playbackCursorSec, job, progress);
  const durationMs = job?.durationMs ?? 0;
  const displayCursorSec = playbackDisplayCursorSec(
    playbackCursorSec,
    job,
    progress,
    progressRatio,
  );
  const canStart = canCreateAudio && !isProcessing && source.status === "ready";
  const isPlaybackTransport =
    playbackState === "playable" ||
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "completed";
  const rendererReady = isCinemaRendererReady(rendererLifecycle);
  const primaryLabel = playbackPrimaryLabel(playbackState, playbackControls.isPlaying);
  let primaryDisabled = !canStart;
  if (isPlaybackTransport) {
    primaryDisabled = !playbackControls.isAvailable || !rendererReady;
  } else if (playbackState === "generating") {
    primaryDisabled = true;
  }
  let primaryIcon: ReactNode = <PreparedSourceCinemaAudioBarsIcon />;
  if (isPlaybackTransport) {
    primaryIcon = playbackControls.isPlaying ? <PauseIcon /> : <PlayIcon />;
  }
  const playbackUnavailableReason = preparedSourcePlaybackDisabledReason(
    playbackControls.isAvailable,
    rendererReady,
  );
  const primaryDisabledReason = preparedSourcePrimaryDisabledReason({
    canStart,
    isPlaybackTransport,
    isProcessing,
    playbackUnavailableReason,
    playbackState,
    source,
  });
  const seekUnavailableReason = preparedSourceSeekDisabledReason(
    Boolean(playbackControls.skipBy),
    rendererReady,
  );
  const handlePrimary = () => {
    if (isPlaybackTransport) {
      onPlayPause();
      return;
    }
    onCreateAudio(source);
  };
  const transportModel: CinemaTransportModel = {
    bookmark: {
      disabled: !canBookmark,
      onClick: onBookmark,
    },
    displayControls: (
      <ReaderAccessibilityControls
        settings={accessibilitySettings}
        variant="panel"
        onChange={onAccessibilitySettingsChange}
      />
    ),
    generationSettings: (
      <TransportSettingPills
        items={[
          source.sourceSpeechPolicyProfile ?? "Project voice",
          `${preparedSourceCinemaMetrics(source).wordCount.toLocaleString()} words`,
        ]}
      />
    ),
    playbackRate: {
      disabled: !playbackControls.setPlaybackRate,
      value: playbackControls.playbackRate,
      onChange: playbackControls.setPlaybackRate,
    },
    playbackState,
    primary: {
      className:
        playbackState === "preAudio"
          ? "bg-[var(--vs-status-warning)] text-[var(--vs-text-primary)] shadow-[var(--vs-shadow)]"
          : "bg-[var(--vs-action-primary-hover)] text-[var(--vs-action-primary-text)] shadow-[var(--vs-shadow)]",
      disabled: primaryDisabled,
      disabledReason: primaryDisabled ? primaryDisabledReason : undefined,
      icon: primaryIcon,
      label: primaryLabel,
      onClick: handlePrimary,
    },
    progress: {
      currentLabel: formatClockTime(displayCursorSec),
      durationLabel: durationMs > 0 ? formatClockTime(durationMs / 1000) : "--:--",
      ratio: progressRatio,
      waveform: job ? (
        <Waveform audioUrl={job.audioUrl} progressRatio={progressRatio} />
      ) : (
        <TransportWaveformPlaceholder />
      ),
    },
    restart: {
      disabled: !playbackControls.isAvailable || !rendererReady,
      disabledReason: playbackUnavailableReason,
      icon: <RestartIcon />,
      onClick: onRestart,
    },
    skipBackward: {
      disabled: !playbackControls.skipBy || !rendererReady,
      disabledReason: seekUnavailableReason,
      icon: <SkipBackIcon />,
      onClick: () => {
        onSkip(-READER_SEEK_SECONDS);
      },
      visible: true,
    },
    skipForward: {
      disabled: !playbackControls.skipBy || !rendererReady,
      disabledReason: seekUnavailableReason,
      icon: <SkipForwardIcon />,
      onClick: () => {
        onSkip(READER_SEEK_SECONDS);
      },
      visible: true,
    },
    stateSummary: {
      detail: preparedSourceTransportDetail(source, job, playbackState, rendererLifecycle),
      title: preparedSourceTransportTitle(playbackState, rendererLifecycle),
    },
  };

  if (variant === "theatre") {
    return (
      <CinemaTheatreTransport controlsVisible={theatreControlsVisible} model={transportModel} />
    );
  }

  return <CinemaTransportBar model={transportModel} />;
}

function preparedSourcePrimaryDisabledReason({
  canStart,
  isPlaybackTransport,
  isProcessing,
  playbackUnavailableReason,
  playbackState,
  source,
}: Readonly<{
  canStart: boolean;
  isPlaybackTransport: boolean;
  isProcessing: boolean;
  playbackUnavailableReason: string | undefined;
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>;
  source: PreparedSource;
}>): string | undefined {
  if (isPlaybackTransport) {
    return playbackUnavailableReason;
  }
  if (playbackState === "generating") {
    return "Audio generation is already in progress.";
  }
  if (canStart) {
    return undefined;
  }
  if (isProcessing) {
    return "Source preparation is already running.";
  }
  if (source.status !== "ready") {
    return source.error ?? "Source is not ready yet.";
  }
  return "Audio creation is not available for this source.";
}

function preparedSourcePlaybackDisabledReason(
  isAvailable: boolean,
  rendererReady: boolean,
): string | undefined {
  if (isAvailable && rendererReady) {
    return undefined;
  }
  if (isAvailable) {
    return "Audio renderer is still preparing.";
  }
  return "Audio playback is not available for this source.";
}

function preparedSourceSeekDisabledReason(
  canSeek: boolean,
  rendererReady: boolean,
): string | undefined {
  if (canSeek && rendererReady) {
    return undefined;
  }
  if (canSeek) {
    return "Audio renderer is still preparing.";
  }
  return "Seeking is unavailable for this audio.";
}

function playbackPrimaryLabel(
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>,
  isPlaying: boolean,
): string {
  if (playbackState === "generating") {
    return "Creating audio";
  }
  if (playbackState === "degraded") {
    return playbackActionLabel("rebuildAudio");
  }
  if (playbackState === "preAudio") {
    return "Create audio";
  }
  return isPlaying ? "Pause" : playbackActionLabel("play");
}

function preparedSourceTransportTitle(
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>,
  rendererLifecycle: CinemaRendererLifecycleState,
): string {
  if (!isCinemaRendererReady(rendererLifecycle)) {
    return cinemaRendererLifecycleLabel(rendererLifecycle);
  }
  if (playbackState === "generating") {
    return "Creating audio";
  }
  if (playbackState === "degraded") {
    return "Audio needs attention";
  }
  if (playbackState === "preAudio") {
    return "Ready to create audio";
  }
  return "Audio ready";
}

function preparedSourceTransportDetail(
  source: PreparedSource,
  job: VoiceJob | null,
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>,
  rendererLifecycle: CinemaRendererLifecycleState,
): string {
  const title = preparedSourceCinemaTitle(source);
  if (!isCinemaRendererReady(rendererLifecycle)) {
    return cinemaRendererLifecycleDetail(rendererLifecycle);
  }
  if (playbackState === "generating") {
    return `${title} is being narrated. You can keep reading while audio is prepared.`;
  }
  if (playbackState === "degraded") {
    if (job?.status === "failed") {
      return job.error ?? "Generation failed for this source. Rebuild audio when ready.";
    }
    if (job?.status === "cancelled") {
      return "Generation was cancelled. Rebuild audio for this source when ready.";
    }
    return "Generated audio is not playable yet. Rebuild audio if the controls do not recover.";
  }
  if (playbackState === "preAudio") {
    return `${title} is ready to read. Create audio when you want synchronized playback.`;
  }
  return `${title} has generated audio.`;
}
