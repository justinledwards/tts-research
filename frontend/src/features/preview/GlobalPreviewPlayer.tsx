import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useAudioWaveformBars } from "../../audioWaveform";
import { Button, Toggle, cx, fieldControlClassName } from "../../design";
import type { RunMode, TTSEngineDiagnostics, VoiceJob } from "../../types";
import {
  generatedAudioLifecycleFromJob,
  playbackActionAriaLabel,
  playbackActionDataAttributes,
  playbackActionDisabledReason,
  playbackActionLabel,
} from "../playback";
import {
  providerCapabilityDataAttributes,
  providerCapabilityGateForPlaybackAction,
  resolveProviderRuntimeCapabilities,
} from "../provider-capabilities";
import { READER_PLAYBACK_RATES } from "../reader-accessibility";
import type { RevisionBlock } from "../revision";
import {
  PREVIEW_RUN_COMPARISON_OPTIONS,
  buildPreviewComparisonModel,
  normalizePreviewComparisonChoice,
  previewComparisonSummary,
  type PreviewComparisonChoice,
  type PreviewComparisonOption,
} from "./abComparison";
import {
  buildPreviewQueue,
  countPreviewWords,
  findAdjacentPreviewQueueItem,
  formatPreviewClock,
  previewQueueProgress,
  previewSeekTargetSec,
  resolvePreviewQueueIndex,
  type PreviewQueue,
  type PreviewQueueItem,
} from "./previewQueue";

export interface GlobalPreviewPlaybackController {
  readonly isAvailable: boolean;
  readonly isPlaying: boolean;
  readonly pause: () => void;
  readonly play: () => Promise<void> | void;
  readonly playbackRate: number;
  readonly restart: () => Promise<void> | void;
  readonly seekTo?: (seconds: number) => void;
  readonly setPlaybackRate?: (rate: number) => void;
}

export interface GlobalPreviewPlayerProps {
  readonly activeBlockId: string | null;
  readonly blocks: RevisionBlock[];
  readonly canOpenCinema: boolean;
  readonly currentPolicyId: string;
  readonly currentRunMode: RunMode;
  readonly currentVoiceId: string;
  readonly dock?: "bottom" | "top";
  readonly hidden?: boolean;
  readonly isPlaybackActive: boolean;
  readonly job: VoiceJob | null;
  readonly playbackControls: GlobalPreviewPlaybackController;
  readonly playbackCursorSec: number;
  readonly policyOptions: readonly PreviewComparisonOption[];
  readonly providerEngineId?: string;
  readonly providerEngines?: readonly TTSEngineDiagnostics[];
  readonly policyProfileLabel: string;
  readonly runConfigurationLabel: string;
  readonly scopeLabel: string;
  readonly sourceLabel: string;
  readonly voiceOptions: readonly PreviewComparisonOption[];
  readonly voiceProfileLabel: string;
  readonly variant?: "compact" | "full";
  readonly onActiveBlockChange: (blockId: string | null) => void;
  readonly onOpenCinema: () => void;
  readonly onPolicyProfileChange: (profileId: string) => void | Promise<void>;
  readonly onRunModeChange: (runMode: RunMode) => void;
  readonly onVoiceProfileChange: (profileId: string) => void;
}

export function GlobalPreviewPlayer({
  activeBlockId,
  blocks,
  canOpenCinema,
  currentPolicyId,
  currentRunMode,
  currentVoiceId,
  dock = "bottom",
  hidden = false,
  isPlaybackActive,
  job,
  playbackControls,
  playbackCursorSec,
  policyOptions,
  providerEngineId = "mock",
  providerEngines = [],
  policyProfileLabel,
  runConfigurationLabel,
  scopeLabel,
  sourceLabel,
  voiceOptions,
  voiceProfileLabel,
  variant = "full",
  onActiveBlockChange,
  onOpenCinema,
  onPolicyProfileChange,
  onRunModeChange,
  onVoiceProfileChange,
}: Readonly<GlobalPreviewPlayerProps>) {
  const [skipSilence, setSkipSilence] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Preview mini-player ready.");
  const queue = useMemo(() => buildPreviewQueue(blocks, job), [blocks, job]);
  const activeIndex = resolvePreviewQueueIndex(queue, activeBlockId, playbackCursorSec);
  const activeItem = activePreviewQueueItem(queue, activeIndex);
  const progress = previewQueueProgress(queue, playbackCursorSec);
  const waveformBars = useAudioWaveformBars(job?.audioUrl, 56);
  const choiceA = useMemo<PreviewComparisonChoice>(
    () => ({
      policyId: currentPolicyId,
      runMode: currentRunMode,
      voiceId: currentVoiceId || "default",
    }),
    [currentPolicyId, currentRunMode, currentVoiceId],
  );
  const comparisonOptions = useMemo(
    () => ({ policyOptions, voiceOptions }),
    [policyOptions, voiceOptions],
  );
  const [choiceB, setChoiceB] = useState<PreviewComparisonChoice>(choiceA);
  const providerRuntime = useMemo(
    () => resolveProviderRuntimeCapabilities(providerEngineId, providerEngines),
    [providerEngineId, providerEngines],
  );

  useEffect(() => {
    setChoiceB((current) => normalizePreviewComparisonChoice(current, choiceA, comparisonOptions));
  }, [choiceA, comparisonOptions]);

  const comparison = useMemo(
    () => buildPreviewComparisonModel(choiceA, choiceB, comparisonOptions),
    [choiceA, choiceB, comparisonOptions],
  );
  const auditionGate = providerCapabilityGateForPlaybackAction(providerRuntime, "audition");
  const abComparisonGate = providerCapabilityGateForPlaybackAction(providerRuntime, "abCompare");
  const playbackAvailable = hasPreviewPlayback(playbackControls, queue) && !auditionGate.disabled;
  const playbackLifecycle = playbackAvailable ? "ready" : generatedAudioLifecycleFromJob({ job });
  const playbackDisabledReason = playbackAvailable
    ? undefined
    : (auditionGate.reason ??
      playbackActionDisabledReason({ action: "audition", lifecycle: playbackLifecycle }));
  const openCinemaDisabledReason = canOpenCinema
    ? undefined
    : playbackActionDisabledReason({
        action: "openCinema",
        fallbackReason: "Create audio before opening Cinema.",
        lifecycle: playbackLifecycle,
      });
  const activeWords = countPreviewWords(activeItem?.spokenText ?? "");
  const statusLabel = previewPlaybackStatusLabel(playbackControls.isPlaying, isPlaybackActive);
  const previewPlayAriaLabel = playbackControls.isPlaying
    ? "Pause preview audition"
    : playbackActionAriaLabel("audition", { lifecycle: playbackLifecycle });
  const previewPlayLabel = playbackControls.isPlaying ? "Pause" : "Audition";
  const fullVariant = variant === "full";

  const { auditionItem, handlePlayPause, handleRestart, handleWholeSourcePreview, moveBlock } =
    usePreviewTransportActions({
      activeIndex,
      activeItem,
      onActiveBlockChange,
      playbackAvailable,
      playbackControls,
      playbackDisabledReason,
      queue,
      setStatusMessage,
      skipSilence,
    });
  const handleApplyB = usePreviewComparisonApplyAction({
    choiceA,
    comparison,
    onPolicyProfileChange,
    onRunModeChange,
    onVoiceProfileChange,
    setStatusMessage,
  });

  if (hidden) {
    return null;
  }

  return (
    <aside
      aria-label="Global preview mini-player"
      className={previewPlayerClassName()}
      style={previewPlayerStyle(fullVariant, dock)}
      data-testid="global-preview-player"
      data-ui-action-surface="Preview"
    >
      <div className={cx("grid gap-3", fullVariant && "lg:grid-cols-1 lg:items-stretch")}>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
                Preview Player
              </p>
              <h2 className="truncate text-sm font-semibold" title={sourceLabel}>
                {sourceLabel}
              </h2>
            </div>
            <span className="shrink-0 rounded-full border px-2 py-1 text-xs font-semibold vs-border">
              {statusLabel}
            </span>
          </div>
          <div className="mt-2 grid gap-2">
            <MiniWaveform bars={waveformBars} progress={progress.ratio} />
            <div className="flex items-center justify-between gap-3 text-xs tabular-nums vs-muted">
              <span>{progress.currentLabel}</span>
              <span>
                {queue.readyCount.toString()} / {queue.totalCount.toString()} ready
              </span>
              <span>{progress.durationLabel}</span>
            </div>
          </div>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
            <Button
              aria-label="Previous preview block"
              data-testid="ui-action-preview-mini-previous"
              data-ui-action-surface="Preview"
              onClick={() => {
                moveBlock(-1);
              }}
              size="sm"
              variant="secondary"
            >
              Prev
            </Button>
            <Button
              aria-label={previewPlayAriaLabel}
              {...playbackActionDataAttributes("audition", playbackLifecycle, { primary: true })}
              {...providerCapabilityDataAttributes("voicePreview", auditionGate.reason)}
              data-testid="ui-action-preview-mini-play"
              data-ui-action-surface="Preview"
              disabled={!playbackAvailable}
              disabledReason={playbackDisabledReason}
              onClick={handlePlayPause}
              size="sm"
              variant="primary"
            >
              {previewPlayLabel}
            </Button>
            <Button
              {...playbackActionDataAttributes("audition", playbackLifecycle)}
              {...providerCapabilityDataAttributes("voicePreview", auditionGate.reason)}
              aria-label="Restart preview"
              data-testid="ui-action-preview-mini-restart"
              data-ui-action-surface="Preview"
              disabled={!playbackAvailable}
              disabledReason={playbackDisabledReason}
              onClick={handleRestart}
              size="sm"
              variant="secondary"
            >
              Restart
            </Button>
            <Button
              aria-label="Next preview block"
              data-testid="ui-action-preview-mini-next"
              data-ui-action-surface="Preview"
              onClick={() => {
                moveBlock(1);
              }}
              size="sm"
              variant="secondary"
            >
              Next
            </Button>
            <label className="flex min-h-11 items-center gap-2 text-xs font-semibold">
              <span className="sr-only">Preview playback speed</span>
              <select
                aria-label="Preview playback speed"
                className={`${fieldControlClassName} h-11 text-xs font-semibold`}
                data-disabled-reason={
                  playbackControls.setPlaybackRate
                    ? undefined
                    : "Playback speed is available after generated audio is loaded."
                }
                data-testid="ui-action-preview-mini-speed"
                data-ui-action-surface="Preview"
                disabled={!playbackControls.setPlaybackRate}
                onChange={(event) => {
                  playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
                }}
                value={String(playbackControls.playbackRate)}
              >
                {READER_PLAYBACK_RATES.map((rate) => (
                  <option key={rate} value={rate}>
                    {rate.toFixed(rate === 1 ? 0 : 2)}x
                  </option>
                ))}
              </select>
            </label>
            <Toggle
              checked={skipSilence}
              className="min-h-11 py-1.5 text-xs"
              data-testid="ui-action-preview-mini-skip-silence"
              data-ui-action-surface="Preview"
              label="Skip silence"
              onChange={setSkipSilence}
            />
            <Button
              {...playbackActionDataAttributes("audition", playbackLifecycle)}
              {...providerCapabilityDataAttributes("voicePreview", auditionGate.reason)}
              data-testid="ui-action-preview-mini-segment"
              data-ui-action-surface="Preview"
              disabled={!playbackAvailable}
              disabledReason={playbackDisabledReason}
              onClick={() => {
                auditionItem(activeItem);
              }}
              size="sm"
              variant="soft"
            >
              Selected segment
            </Button>
            {fullVariant ? (
              <>
                <Button
                  {...playbackActionDataAttributes("audition", playbackLifecycle)}
                  {...providerCapabilityDataAttributes("voicePreview", auditionGate.reason)}
                  data-testid="ui-action-preview-mini-source"
                  data-ui-action-surface="Preview"
                  disabled={!playbackAvailable}
                  disabledReason={playbackDisabledReason}
                  onClick={handleWholeSourcePreview}
                  size="sm"
                  variant="secondary"
                >
                  Whole source
                </Button>
                <Button
                  {...playbackActionDataAttributes("openCinema", playbackLifecycle)}
                  data-testid="ui-action-preview-mini-open-cinema"
                  data-ui-action-surface="Preview"
                  disabled={!canOpenCinema}
                  disabledReason={openCinemaDisabledReason}
                  onClick={onOpenCinema}
                  size="sm"
                  variant="ghost"
                >
                  {playbackActionLabel("openCinema")}
                </Button>
              </>
            ) : null}
          </div>
          <p aria-live="polite" className="mt-2 text-xs vs-muted">
            {previewActiveDetail(activeItem, activeWords, scopeLabel)}
          </p>
          <p aria-live="polite" className="sr-only">
            {statusMessage}
          </p>
        </div>

        {fullVariant ? (
          <div className="grid min-w-0 gap-2 rounded-md border bg-[var(--vs-surface)] p-3 vs-border">
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{playbackActionLabel("abCompare")}</h3>
                <p
                  className="mt-1 truncate text-xs vs-muted"
                  title={previewComparisonSummary(comparison)}
                >
                  A: {voiceProfileLabel} · {policyProfileLabel} · {runConfigurationLabel}
                </p>
              </div>
              <Button
                {...playbackActionDataAttributes("abCompare", playbackLifecycle)}
                {...providerCapabilityDataAttributes("abComparison", abComparisonGate.reason)}
                data-testid="ui-action-preview-mini-audition-a"
                data-ui-action-surface="Preview"
                disabled={!playbackAvailable || abComparisonGate.disabled}
                disabledReason={abComparisonGate.reason ?? playbackDisabledReason}
                onClick={() => {
                  auditionItem(activeItem);
                }}
                size="sm"
                variant="soft"
              >
                Audition A
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <ComparisonSelect
                capabilityReason={abComparisonGate.reason}
                disabledReason={
                  abComparisonGate.reason ?? previewVoiceBDisabledReason(voiceOptions)
                }
                label="Voice B"
                options={voiceOptions}
                testId="ui-action-preview-mini-voice-b"
                value={comparison.choiceB.voiceId}
                onChange={(voiceId) => {
                  setChoiceB((current) => ({ ...current, voiceId }));
                }}
              />
              <ComparisonSelect
                capabilityReason={abComparisonGate.reason}
                disabledReason={abComparisonGate.reason}
                label="Policy B"
                options={policyOptions}
                testId="ui-action-preview-mini-policy-b"
                value={comparison.choiceB.policyId}
                onChange={(policyId) => {
                  setChoiceB((current) => ({ ...current, policyId }));
                }}
              />
              <ComparisonSelect
                capabilityReason={abComparisonGate.reason}
                disabledReason={abComparisonGate.reason}
                label="Run B"
                options={PREVIEW_RUN_COMPARISON_OPTIONS}
                testId="ui-action-preview-mini-run-b"
                value={comparison.choiceB.runMode}
                onChange={(runMode) => {
                  setChoiceB((current) => ({ ...current, runMode: runMode as RunMode }));
                }}
              />
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <p
                className="min-w-0 flex-1 truncate text-xs vs-muted"
                title={previewComparisonSummary(comparison)}
              >
                {previewComparisonSummary(comparison)}
              </p>
              <Button
                {...providerCapabilityDataAttributes("abComparison", abComparisonGate.reason)}
                data-testid="ui-action-preview-mini-apply-b"
                data-ui-action-surface="Preview"
                disabled={!comparison.hasDifference || abComparisonGate.disabled}
                disabledReason={
                  abComparisonGate.reason ??
                  (comparison.hasDifference ? undefined : "B already matches A.")
                }
                onClick={handleApplyB}
                size="sm"
                variant="primary"
              >
                Use B
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function activePreviewQueueItem(queue: PreviewQueue, activeIndex: number): PreviewQueueItem | null {
  return activeIndex >= 0 ? queue.items[activeIndex] : null;
}

function hasPreviewPlayback(
  playbackControls: GlobalPreviewPlaybackController,
  queue: PreviewQueue,
): boolean {
  return playbackControls.isAvailable && queue.hasGeneratedAudio;
}

function previewPlaybackStatusLabel(isPlaying: boolean, isPlaybackActive: boolean): string {
  return isPlaying || isPlaybackActive ? "Playing" : "Ready";
}

function previewPlayerClassName(): string {
  return "fixed right-3 z-50 overflow-auto rounded-lg border bg-[var(--vs-raised)] p-3 shadow-2xl vs-border";
}

function previewPlayerStyle(fullVariant: boolean, dock: "bottom" | "top"): CSSProperties {
  const size = {
    maxHeight: fullVariant ? "18rem" : "14rem",
    width: fullVariant ? "min(calc(100vw - 1.5rem), 34rem)" : "min(calc(100vw - 1.5rem), 28rem)",
  };
  return dock === "top" ? { ...size, top: "7rem" } : { ...size, bottom: "7rem" };
}

function previewActiveDetail(
  activeItem: PreviewQueueItem | null,
  activeWords: number,
  scopeLabel: string,
): string {
  if (!activeItem) {
    return scopeLabel;
  }
  return `${activeItem.label} · ${activeWords.toString()} words · ${formatPreviewClock(
    activeItem.durationMs,
  )} · ${scopeLabel}`;
}

function previewVoiceBDisabledReason(
  voiceOptions: readonly PreviewComparisonOption[],
): string | undefined {
  return voiceOptions.length > 1 ? undefined : "Add another voice profile to compare voices.";
}

interface PreviewTransportActionsArgs {
  readonly activeIndex: number;
  readonly activeItem: PreviewQueueItem | null;
  readonly onActiveBlockChange: (blockId: string | null) => void;
  readonly playbackAvailable: boolean;
  readonly playbackControls: GlobalPreviewPlaybackController;
  readonly playbackDisabledReason: string | undefined;
  readonly queue: PreviewQueue;
  readonly setStatusMessage: (message: string) => void;
  readonly skipSilence: boolean;
}

function usePreviewTransportActions({
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

function usePreviewComparisonApplyAction({
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

function MiniWaveform({
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
            index <= activeIndex ? "bg-orange-500" : "bg-[var(--vs-border)]",
          )}
          key={`preview-waveform-${index.toString()}`}
          style={{ height: `${Math.round(4 + Math.max(0, Math.min(1, bar)) * 24).toString()}px` }}
        />
      ))}
    </div>
  );
}

function ComparisonSelect({
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
