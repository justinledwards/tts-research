import { type CSSProperties, useCallback } from "react";
import { cx, fieldControlClassName } from "../../design";
import type { RunMode } from "../../types";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import type { PreviewComparisonOption } from "./abComparison";
import {
  type buildPreviewComparisonModel,
  type PreviewComparisonChoice,
  previewComparisonSummary,
} from "./abComparison";
import {
  findAdjacentPreviewQueueItem,
  formatPreviewClock,
  type PreviewQueue,
  type PreviewQueueItem,
  previewSeekTargetSec,
} from "./previewQueue";

interface PreviewPlaybackController {
  readonly isAvailable: boolean;
  readonly isPlaying: boolean;
  readonly pause: () => void;
  readonly play: () => Promise<void> | void;
  readonly restart: () => Promise<void> | void;
  readonly seekTo?: (seconds: number) => void;
  readonly setPlaybackRate?: (rate: number) => void;
}

export function activePreviewQueueItem(
  queue: PreviewQueue,
  activeIndex: number,
): PreviewQueueItem | null {
  return activeIndex >= 0 ? queue.items[activeIndex] : null;
}

export function hasPreviewPlayback(
  playbackControls: PreviewPlaybackController,
  queue: PreviewQueue,
): boolean {
  return playbackControls.isAvailable && queue.hasGeneratedAudio;
}

export function previewPlaybackStatusLabel(isPlaying: boolean, isPlaybackActive: boolean): string {
  return isPlaying || isPlaybackActive ? "Playing" : "Preview ready";
}

export function previewPlayerClassName(placement: "inline" | "floating"): string {
  if (placement === "inline") {
    return "relative z-10 mx-3 my-2 max-h-[14rem] overflow-auto rounded-lg border bg-[var(--vs-raised)] p-3 shadow-sm vs-border lg:mx-4";
  }
  return "fixed z-40 overflow-auto rounded-lg border bg-[var(--vs-raised)] p-3 shadow-2xl vs-border";
}

export function previewPlayerStyle(
  fullVariant: boolean,
  dock: "bottom" | "top",
  placement: "inline" | "floating",
): CSSProperties {
  const size = {
    maxHeight: fullVariant ? "18rem" : "14rem",
    width: fullVariant
      ? "min(calc(100vw - var(--overlay-preview-right, 0.75rem) - 1.5rem), 34rem)"
      : "min(calc(100vw - var(--overlay-preview-right, 0.75rem) - 1.5rem), 28rem)",
  };
  if (placement === "inline") {
    return { maxHeight: size.maxHeight, width: "min(100%, 44rem)" };
  }
  const sideOffset = { right: "var(--overlay-preview-right, 0.75rem)" };
  return dock === "top"
    ? { ...size, ...sideOffset, top: "var(--overlay-preview-top, 7rem)" }
    : { ...size, ...sideOffset, bottom: "var(--overlay-preview-bottom, 4.75rem)" };
}

export function previewActiveDetail(
  activeItem: PreviewQueueItem | null,
  activeWords: number,
  scopeLabel: string,
): string {
  if (!activeItem) {
    return scopeLabel;
  }
  return `${activeItem.label} · ${activeWords.toString()} words · ${formatPreviewClock(activeItem.durationMs)} · ${scopeLabel}`;
}

export function previewVoiceBDisabledReason(
  voiceOptions: readonly PreviewComparisonOption[],
): string | undefined {
  return voiceOptions.length > 1 ? undefined : "Add another voice profile to compare voices.";
}

interface PreviewTransportActionsArgs {
  readonly activeIndex: number;
  readonly activeItem: PreviewQueueItem | null;
  readonly onActiveBlockChange: (blockId: string | null) => void;
  readonly playbackAvailable: boolean;
  readonly playbackControls: PreviewPlaybackController;
  readonly playbackDisabledReason: string | undefined;
  readonly queue: PreviewQueue;
  readonly setStatusMessage: (message: string) => void;
  readonly skipSilence: boolean;
}

export function usePreviewTransportActions({
  activeIndex,
  activeItem,
  onActiveBlockChange,
  playbackAvailable,
  playbackControls,
  playbackDisabledReason,
  queue,
  setStatusMessage,
  skipSilence,
}: PreviewTransportActionsArgs) {
  const auditionItem = useCallback(
    (item: PreviewQueueItem | null, shouldPlay = true) => {
      if (!item) {
        setStatusMessage("No preview block is available.");
        return;
      }
      onActiveBlockChange(item.id);
      if (!playbackAvailable) {
        setStatusMessage(item.disabledReason ?? playbackDisabledReason ?? "Audio is not ready.");
        return;
      }
      playbackControls.seekTo?.(previewSeekTargetSec(item));
      if (shouldPlay) {
        void playbackControls.play();
      }
      setStatusMessage(`Auditioning ${item.label}.`);
    },
    [
      onActiveBlockChange,
      playbackAvailable,
      playbackControls,
      playbackDisabledReason,
      setStatusMessage,
    ],
  );

  const moveBlock = useCallback(
    (direction: -1 | 1) => {
      const item = findAdjacentPreviewQueueItem(queue, activeIndex, direction, { skipSilence });
      if (!item || item.id === activeItem?.id) {
        setStatusMessage(
          direction < 0 ? "Already at the first block." : "Already at the final block.",
        );
        return;
      }
      auditionItem(item, false);
      setStatusMessage(direction < 0 ? "Moved to previous block." : "Moved to next block.");
    },
    [activeIndex, activeItem?.id, auditionItem, queue, setStatusMessage, skipSilence],
  );

  const handlePlayPause = useCallback(() => {
    if (!playbackAvailable) {
      setStatusMessage(playbackDisabledReason ?? "Audio is not ready.");
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      setStatusMessage("Preview paused.");
      return;
    }
    void playbackControls.play();
    setStatusMessage("Preview playing.");
  }, [playbackAvailable, playbackControls, playbackDisabledReason, setStatusMessage]);

  const handleRestart = useCallback(() => {
    if (!playbackAvailable) {
      setStatusMessage(playbackDisabledReason ?? "Audio is not ready.");
      return;
    }
    void playbackControls.restart();
    setStatusMessage("Preview restarted.");
  }, [playbackAvailable, playbackControls, playbackDisabledReason, setStatusMessage]);

  const handleWholeSourcePreview = useCallback(() => {
    if (!playbackAvailable) {
      setStatusMessage(playbackDisabledReason ?? "Audio is not ready.");
      return;
    }
    playbackControls.seekTo?.(0);
    void playbackControls.play();
    setStatusMessage("Auditioning the whole source.");
  }, [playbackAvailable, playbackControls, playbackDisabledReason, setStatusMessage]);

  return { auditionItem, handlePlayPause, handleRestart, handleWholeSourcePreview, moveBlock };
}

type PreviewComparisonModel = ReturnType<typeof buildPreviewComparisonModel>;

interface PreviewComparisonApplyActionArgs {
  readonly choiceA: PreviewComparisonChoice;
  readonly comparison: PreviewComparisonModel;
  readonly onPolicyProfileChange: (profileId: string) => void | Promise<void>;
  readonly onRunModeChange: (runMode: RunMode) => void;
  readonly onVoiceProfileChange: (profileId: string) => void;
  readonly setStatusMessage: (message: string) => void;
}

export function usePreviewComparisonApplyAction({
  choiceA,
  comparison,
  onPolicyProfileChange,
  onRunModeChange,
  onVoiceProfileChange,
  setStatusMessage,
}: PreviewComparisonApplyActionArgs) {
  return useCallback(() => {
    if (!comparison.hasDifference) {
      setStatusMessage("A and B already match.");
      return;
    }
    if (choiceA.voiceId !== comparison.choiceB.voiceId) {
      onVoiceProfileChange(comparison.choiceB.voiceId);
    }
    if (choiceA.policyId !== comparison.choiceB.policyId) {
      void onPolicyProfileChange(comparison.choiceB.policyId);
    }
    if (choiceA.runMode !== comparison.choiceB.runMode) {
      onRunModeChange(comparison.choiceB.runMode);
    }
    setStatusMessage(`${previewComparisonSummary(comparison)}. Create & Listen renders B.`);
  }, [
    choiceA,
    comparison,
    onPolicyProfileChange,
    onRunModeChange,
    onVoiceProfileChange,
    setStatusMessage,
  ]);
}

export function MiniWaveform({
  bars,
  progress,
}: Readonly<{
  bars: number[] | null;
  progress: number;
}>) {
  if (!bars || bars.length === 0) {
    return (
      <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-surface)]">
        <div
          className="h-full rounded-full vs-accent-bg"
          style={{ width: `${Math.round(Math.max(0, Math.min(1, progress)) * 100).toString()}%` }}
        />
      </div>
    );
  }
  const activeIndex = Math.round(Math.max(0, Math.min(1, progress)) * bars.length);
  return (
    <div
      aria-label="Preview waveform"
      className="grid h-9 min-w-0 items-center gap-px rounded-md bg-[var(--vs-surface)] py-1"
      role="img"
      style={{ gridTemplateColumns: `repeat(${bars.length.toString()}, minmax(0, 1fr))` }}
    >
      {bars.map((bar, index) => (
        <span
          aria-hidden="true"
          className={cx(
            "w-full rounded-full",
            index <= activeIndex ? "bg-[var(--vs-action-primary)]" : "bg-[var(--vs-border)]",
          )}
          key={`preview-waveform-${index.toString()}`}
          style={{ height: `${Math.round(4 + Math.max(0, Math.min(1, bar)) * 24).toString()}px` }}
        />
      ))}
    </div>
  );
}

export function ComparisonSelect({
  capabilityReason,
  disabledReason,
  label,
  options,
  testId,
  value,
  onChange,
}: Readonly<{
  capabilityReason?: string;
  disabledReason?: string;
  label: string;
  options: readonly PreviewComparisonOption[];
  testId: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-semibold">
      <span>{label}</span>
      <select
        {...providerCapabilityDataAttributes("abComparison", capabilityReason)}
        aria-label={label}
        className={`${fieldControlClassName} h-11 min-w-0 text-xs font-semibold`}
        data-disabled-reason={disabledReason}
        data-testid={testId}
        data-ui-action-surface="Preview"
        disabled={Boolean(disabledReason)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
