import { useEffect, useMemo, useState } from "react";
import { audioSource } from "../../api";
import { useAudioWaveformBars } from "../../audioWaveform";
import { Button, cx, fieldControlClassName, Toggle } from "../../design";
import type { RunMode, TTSEngineDiagnostics, VoiceJob } from "../../types";
import { pickTeleprompterWordIndex } from "../../teleprompter";
import { overlayDataAttributes, type PreviewPlayerPlacement } from "../layout";
import {
  canQueueGeneratedAudioPlayback,
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
  buildPreviewComparisonModel,
  normalizePreviewComparisonChoice,
  PREVIEW_RUN_COMPARISON_OPTIONS,
  previewComparisonChoicesEqual,
  type PreviewComparisonChoice,
  type PreviewComparisonOption,
  previewComparisonSummary,
} from "./abComparison";
import {
  activePreviewQueueItem,
  ComparisonSelect,
  hasPreviewPlayback,
  MiniWaveform,
  previewActiveDetail,
  previewPlaybackStatusLabel,
  previewPlayerClassName,
  previewPlayerStyle,
  previewVoiceBDisabledReason,
  usePreviewComparisonApplyAction,
  usePreviewTransportActions,
} from "./GlobalPreviewPlayerHelpers";
import {
  buildPreviewQueue,
  countPreviewWords,
  previewQueueProgress,
  resolvePreviewQueueIndex,
} from "./previewQueue";
import {
  ReadingFollowAlongRenderer,
  readingSurfaceClassName,
  readingSurfaceDataAttributes,
} from "../reading-surface";

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
  readonly placement?: PreviewPlayerPlacement;
  readonly policyOptions: readonly PreviewComparisonOption[];
  readonly providerEngineId?: string;
  readonly providerEngines?: readonly TTSEngineDiagnostics[];
  readonly policyProfileLabel: string;
  readonly mode?: "comparison-only" | "full";
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

// eslint-disable-next-line sonarjs/cognitive-complexity
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
  placement = "floating",
  policyOptions,
  providerEngineId = "mock",
  providerEngines = [],
  policyProfileLabel,
  mode = "full",
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
  const waveformBars = useAudioWaveformBars(job ? audioSource(job, { partial: true }) : "", 56);
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
    setChoiceB((current) => {
      const normalized = normalizePreviewComparisonChoice(current, choiceA, comparisonOptions);
      return previewComparisonChoicesEqual(current, normalized) ? current : normalized;
    });
  }, [choiceA, comparisonOptions]);

  const comparison = useMemo(
    () => buildPreviewComparisonModel(choiceA, choiceB, comparisonOptions),
    [choiceA, choiceB, comparisonOptions],
  );
  const auditionGate = providerCapabilityGateForPlaybackAction(providerRuntime, "audition");
  const abComparisonGate = providerCapabilityGateForPlaybackAction(providerRuntime, "abCompare");
  const playbackAvailable =
    (hasPreviewPlayback(playbackControls, queue) || canQueueGeneratedAudioPlayback(job)) &&
    playbackControls.isAvailable &&
    !auditionGate.disabled;
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
  const activePreviewWordIndex = previewActiveWordIndex(activeItem, playbackCursorSec);
  const statusLabel = previewPlaybackStatusLabel(playbackControls.isPlaying, isPlaybackActive);
  const previewPlayAriaLabel = playbackControls.isPlaying
    ? "Pause preview audition"
    : playbackActionAriaLabel("audition", { lifecycle: playbackLifecycle });
  const previewPlayLabel = playbackControls.isPlaying ? "Pause" : "Audition";
  const fullVariant = variant === "full";
  const showTransport = mode === "full";

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
  const visiblePlacement: Exclude<PreviewPlayerPlacement, "hidden"> =
    placement === "hidden" ? "floating" : placement;

  return (
    <aside
      aria-label="Global preview mini-player"
      className={previewPlayerClassName(visiblePlacement)}
      style={previewPlayerStyle(fullVariant, dock, visiblePlacement)}
      data-testid="global-preview-player"
      data-ui-action-surface="Preview"
      {...overlayDataAttributes(
        "preview-player",
        visiblePlacement === "inline" ? "stage-inline-preview" : "floating-preview",
      )}
    >
      <div className={cx("grid gap-3", fullVariant && "lg:grid-cols-1 lg:items-stretch")}>
        {showTransport ? (
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
            {activeItem?.spokenText ? (
              <p
                className={`mt-3 rounded-md bg-[var(--vs-raised)] px-3 py-2 ${readingSurfaceClassName(
                  "spoken",
                )}`}
                data-readalong-cue-role="current"
                data-readalong-timing-state="estimated"
                data-testid="preview-active-spoken-text"
                {...readingSurfaceDataAttributes({ active: true, kind: "spoken" })}
              >
                <ReadingFollowAlongRenderer
                  activeWordIndex={activePreviewWordIndex}
                  cue={{
                    cueText: activeItem.spokenText,
                    spokenText: activeItem.spokenText,
                  }}
                  cueRole="current"
                  exactWordTiming={false}
                  mode={playbackAvailable ? "audio-follow" : "reading-only"}
                  surface="teleprompt"
                  surfaceKind="spoken"
                  timingState="estimated"
                  upcomingWindow={3}
                />
              </p>
            ) : null}
            <p aria-live="polite" className="sr-only">
              {statusMessage}
            </p>
          </div>
        ) : null}

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

function previewActiveWordIndex(
  activeItem: ReturnType<typeof activePreviewQueueItem>,
  playbackCursorSec: number,
): number | null {
  if (!activeItem?.spokenText.trim()) {
    return null;
  }
  const durationSec = Math.max(0.001, activeItem.endSec - activeItem.startSec);
  const progress = Math.max(
    0,
    Math.min(1, (playbackCursorSec - activeItem.startSec) / durationSec),
  );
  return pickTeleprompterWordIndex(activeItem.spokenText, progress);
}
