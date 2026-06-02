import { forwardRef, useMemo } from "react";
import type { RevisionBlock } from "../revision";
import type { ReadAlongTimingState } from "../readalong";
import { Button, SegmentedControl, Toggle, cx } from "../../design";
import { FocusedTheatreChrome } from "../theatre/FocusedTheatreShell";
import { nextReaderPlaybackRate } from "../reader-accessibility";
import {
  LocalizedPlaybackToolbar,
  playbackActionAriaLabel,
  playbackActionDataAttributes,
  playbackActionLabel,
  type GeneratedAudioLifecycleState,
  type LocalizedPlaybackToolbarModel,
} from "../playback";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import { workspaceStageActionLabel } from "../workspace";
import {
  TELEPROMPT_PRESET_IDS,
  telepromptPreset,
  telepromptPresetHighlightSettings,
  type TelepromptPresetId,
} from "./telepromptPresets";
import type { TelepromptFullscreenAvailability } from "./telepromptFullscreen";
import type {
  TelepromptTheatreMode,
  TelepromptTheatreSummary,
  TelepromptTheatreViewMode,
} from "./telepromptTheatreState";
import type { TelepromptCueSyncMode, TelepromptCueWordTiming } from "./telepromptCueTimeline";
import { TelepromptTheatreSettingsControls } from "./TelepromptTheatreSettingsControls";
import {
  telepromptTheatrePreset,
  type TelepromptTheatreSettings,
} from "./telepromptTheatreSettings";
import {
  CuePreviewList,
  OperatorFact,
  TelepromptTheatreCueText,
  telepromptTheatreWordLabel,
} from "./telepromptTheatreCueContent";

export interface TelepromptTheatreProps {
  readonly activeBlock: RevisionBlock | null;
  readonly activeBlockIndex: number;
  readonly audioProgressPercent: number;
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly createAndListenCapabilityReason?: string;
  readonly createAndListenDisabledReason?: string;
  readonly cuePlaybackDisabledReason?: string;
  readonly cueSyncDetail: string;
  readonly cueSyncMode: TelepromptCueSyncMode;
  readonly cueSyncStatusLabel: string;
  readonly currentCueText: string | null;
  readonly currentSourceWordId?: string | null;
  readonly currentWordIndex: number | null;
  readonly currentTimingState?: ReadAlongTimingState;
  readonly fullscreenAvailability: TelepromptFullscreenAvailability;
  readonly fullscreenActive: boolean;
  readonly mode: TelepromptTheatreMode;
  readonly nativeFullscreenDisabledReason?: string;
  readonly nextBlock: RevisionBlock | null;
  readonly openCinemaDisabledReason?: string;
  readonly playbackControlsAvailable: boolean;
  readonly playbackControlsPlaying: boolean;
  readonly playbackLifecycle: GeneratedAudioLifecycleState;
  readonly playbackRate: number;
  readonly presetId: TelepromptPresetId;
  readonly countdownRemaining: number | null;
  readonly controlsVisible: boolean;
  readonly previewBlocks: RevisionBlock[];
  readonly settings: TelepromptTheatreSettings;
  readonly settingsMemoryEnabled: boolean;
  readonly summary: TelepromptTheatreSummary;
  readonly theatreViewMode: TelepromptTheatreViewMode;
  readonly syncDebug?: TelepromptTheatreSyncDebug;
  readonly wordTimings?: readonly TelepromptCueWordTiming[];
  readonly onBackToPreview: () => void;
  readonly onBackToReview: () => void;
  readonly onCreateAndListen: () => void;
  readonly onExitTheatre: () => void;
  readonly onJumpToCurrentAudio: () => void;
  readonly onMoveCue: (direction: -1 | 1) => void;
  readonly onOpenCinema: () => void;
  readonly onPlaybackRateChange?: (rate: number) => void;
  readonly onBlurControls: () => void;
  readonly onFocusControls: () => void;
  readonly onPresetChange: (presetId: TelepromptPresetId) => void;
  readonly onRequestNativeFullscreen: () => void;
  readonly onRestart: () => void;
  readonly onRevealControls: () => void;
  readonly onSettingsChange: (settings: TelepromptTheatreSettings) => void;
  readonly onToggleControls: () => void;
  readonly onToggleMirror: (checked: boolean) => void;
  readonly onToggleOperatorPreview: () => void;
  readonly onTogglePlayback: () => void;
}

export interface TelepromptTheatreSyncDebug {
  readonly activeCueId: string;
  readonly activeSourceWordId: string;
  readonly activeWordIndex: number;
  readonly activeWordText: string;
  readonly jobId: string;
  readonly playbackCursorSec: number;
  readonly runtimeState: string;
  readonly syncMode: string;
  readonly timingSource: string;
}

export const TelepromptTheatre = forwardRef<HTMLDivElement, TelepromptTheatreProps>(
  // The Theatre dialog is intentionally dense UI composition; leaf helpers keep behavior local.
  // eslint-disable-next-line sonarjs/cognitive-complexity
  function TelepromptTheatre(
    {
      activeBlock,
      activeBlockIndex,
      audioProgressPercent,
      canCreate,
      canOpenCinema,
      createAndListenCapabilityReason,
      createAndListenDisabledReason,
      cuePlaybackDisabledReason,
      cueSyncDetail,
      cueSyncMode,
      cueSyncStatusLabel,
      currentCueText,
      currentSourceWordId,
      currentTimingState = "trusted",
      currentWordIndex,
      countdownRemaining,
      controlsVisible,
      fullscreenAvailability,
      fullscreenActive,
      mode,
      nativeFullscreenDisabledReason,
      nextBlock,
      openCinemaDisabledReason,
      playbackControlsAvailable,
      playbackControlsPlaying,
      playbackLifecycle,
      playbackRate,
      previewBlocks,
      presetId,
      settings,
      settingsMemoryEnabled,
      summary,
      syncDebug,
      theatreViewMode,
      wordTimings = [],
      onBackToPreview,
      onBackToReview,
      onCreateAndListen,
      onExitTheatre,
      onJumpToCurrentAudio,
      onMoveCue,
      onOpenCinema,
      onPlaybackRateChange,
      onBlurControls,
      onFocusControls,
      onPresetChange,
      onRequestNativeFullscreen,
      onRestart,
      onRevealControls,
      onSettingsChange,
      onToggleControls,
      onToggleMirror,
      onToggleOperatorPreview,
      onTogglePlayback,
    },
    ref,
  ) {
    const preset = telepromptPreset(presetId);
    const theatreHighlightSettings = useMemo(
      () => telepromptPresetHighlightSettings(presetId),
      [presetId],
    );
    const theatrePreset = telepromptTheatrePreset(settings.presetId);
    const currentCue = currentCueText ?? activeBlock?.spokenText ?? activeBlock?.text ?? "";
    const currentWordLabel = telepromptTheatreWordLabel(currentWordIndex);
    const theatrePlayPauseAction = {
      ariaKeyShortcuts: "Space K",
      shortcutCommandId: "theatre.playPause" as const,
      ariaLabel: playbackControlsPlaying
        ? "Pause Cue"
        : playbackActionAriaLabel("telepromptPlay", { lifecycle: playbackLifecycle }),
      dataAttributes: playbackActionDataAttributes("telepromptPlay", playbackLifecycle, {
        primary: true,
      }),
      disabled: !playbackControlsAvailable,
      disabledReason: cuePlaybackDisabledReason,
      label: playbackControlsPlaying ? "Pause Cue" : playbackActionLabel("telepromptPlay"),
      primary: true,
      onClick: onTogglePlayback,
      testId: "ui-action-teleprompt-theatre-play-pause",
    };
    const theatreJumpToAudioAction = {
      ariaKeyShortcuts: "J",
      shortcutCommandId: "theatre.jumpCurrentAudio" as const,
      disabled: !playbackControlsAvailable,
      disabledReason: cuePlaybackDisabledReason,
      label: "Jump to Audio",
      onClick: onJumpToCurrentAudio,
      testId: "ui-action-teleprompt-theatre-jump-current-audio",
    };
    const theatrePreviousAction = {
      ariaKeyShortcuts: "ArrowLeft ArrowUp",
      shortcutCommandId: "theatre.previousCue" as const,
      disabled: activeBlockIndex <= 0,
      disabledReason: activeBlockIndex > 0 ? undefined : "Already at the first cue.",
      label: "Previous",
      onClick: () => {
        onMoveCue(-1);
      },
      testId: "ui-action-teleprompt-theatre-previous-cue",
    };
    const theatreNextAction = {
      ariaKeyShortcuts: "ArrowRight ArrowDown",
      shortcutCommandId: "theatre.nextCue" as const,
      disabled: !nextBlock,
      disabledReason: nextBlock ? undefined : "Already at the final cue.",
      label: "Next",
      onClick: () => {
        onMoveCue(1);
      },
      testId: "ui-action-teleprompt-theatre-next-cue",
    };
    const theatreRestartAction = {
      ariaKeyShortcuts: "Home",
      shortcutCommandId: "theatre.restart" as const,
      disabled: !playbackControlsAvailable,
      disabledReason: cuePlaybackDisabledReason,
      label: "Restart",
      onClick: onRestart,
      testId: "ui-action-teleprompt-theatre-restart",
    };
    const theatreSpeedLabel = `${playbackRate.toFixed(playbackRate === 1 ? 0 : 2)}x`;
    const theatreSpeedAction = {
      ariaLabel: "Playback speed",
      disabled: !onPlaybackRateChange,
      disabledReason: onPlaybackRateChange
        ? undefined
        : "Playback speed is available after generated audio is loaded.",
      label: `Playback speed ${theatreSpeedLabel}`,
      shortcutCommandId: "theatre.speed" as const,
      testId: "ui-action-teleprompt-theatre-speed",
      onClick: () => {
        onPlaybackRateChange?.(nextReaderPlaybackRate(playbackRate, 1));
      },
    };
    const backToReviewAction = {
      label: "Back to Review",
      shortcutCommandId: "teleprompt.returnReview" as const,
      testId: "ui-action-teleprompt-theatre-back-review",
      onClick: onBackToReview,
    };
    const backToPreviewAction = {
      label: "Back to Preview",
      shortcutCommandId: "teleprompt.returnPreview" as const,
      testId: "ui-action-teleprompt-theatre-back-preview",
      onClick: onBackToPreview,
    };
    const theatrePlaybackToolbar: LocalizedPlaybackToolbarModel = {
      activeDetail: `${summary.cuePositionLabel} · ${summary.syncStatusLabel}`,
      activeLabel: activeBlock?.label ?? "No active cue",
      jumpToAudio: { ...theatreJumpToAudioAction, visible: false },
      next: { ...theatreNextAction, visible: false },
      playPause: { ...theatrePlayPauseAction, visible: false },
      previous: { ...theatrePreviousAction, visible: false },
      progress: {
        currentLabel: `${Math.max(0, Math.min(100, audioProgressPercent)).toString()}%`,
        durationLabel: summary.estimatedRemainingLabel,
        ratio: audioProgressPercent / 100,
      },
      restart: { ...theatreRestartAction, visible: false },
      stage: "theatre",
      statusLabel: summary.playbackStatusLabel,
      testId: "localized-theatre-playback-toolbar",
      variant: "theatre",
    };
    const exitAction = {
      label: "Exit Theatre",
      shortcutCommandId: "theatre.exit" as const,
      testId: "ui-action-teleprompt-exit-theatre",
      onClick: onExitTheatre,
    };
    const operatorAction = {
      label: settings.operatorPanelVisible ? "Hide operator" : "Operator",
      selected: settings.operatorPanelVisible,
      shortcutCommandId: "theatre.operator" as const,
      testId: "ui-action-teleprompt-operator-preview",
      onClick: onToggleOperatorPreview,
    };
    const theatreChromeActions = [
      {
        disabled: !fullscreenAvailability.supported,
        disabledReason:
          nativeFullscreenDisabledReason ?? fullscreenAvailability.reason ?? undefined,
        label: fullscreenActive ? "Fullscreen active" : "Native fullscreen",
        shortcutCommandId: "theatre.fullscreen" as const,
        testId: "ui-action-teleprompt-native-fullscreen",
        onClick: onRequestNativeFullscreen,
      },
    ];
    const operatorPanelContent = (
      <>
        <TelepromptTheatreSettingsControls
          memoryEnabled={settingsMemoryEnabled}
          settings={settings}
          variant="compact"
          onChange={onSettingsChange}
        />

        <div className="grid gap-3 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--vs-text-muted)]">
              Inline text preset
            </p>
            <p className="mt-1 text-xs text-[var(--vs-text-muted)]">{preset.description}</p>
          </div>
          <SegmentedControl
            ariaLabel="Teleprompt inline presenter preset"
            className="text-[var(--vs-text-primary)]"
            columns={2}
            options={TELEPROMPT_PRESET_IDS.map((id) => ({
              label: telepromptPreset(id).label,
              testId: `ui-action-teleprompt-theatre-preset-${id}`,
              value: id,
            }))}
            value={presetId}
            onChange={onPresetChange}
          />
          <Toggle
            checked={settings.mirrorMode}
            className="text-[var(--vs-text-primary)]"
            data-testid="ui-action-teleprompt-theatre-mirror"
            detail="Flip the presenter script for mirrored recording rigs."
            label="Mirror mode"
            onChange={onToggleMirror}
          />
        </div>

        <div className="grid gap-3 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3">
          <div>
            <p className="text-xs font-semibold uppercase text-[var(--vs-text-muted)]">
              Exit paths
            </p>
            <p className="mt-1 text-xs text-[var(--vs-text-muted)]">
              Leaving theatre preserves source, cue, voice, policy, and return target.
            </p>
          </div>
          <Button
            {...playbackActionDataAttributes("openCinema", playbackLifecycle)}
            className="border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] text-[var(--vs-theatre-text)] hover:bg-[var(--vs-theatre-panel)]"
            data-testid="ui-action-teleprompt-theatre-open-cinema"
            disabled={!canOpenCinema}
            disabledReason={openCinemaDisabledReason}
            onClick={onOpenCinema}
            size="sm"
            variant="secondary"
          >
            {workspaceStageActionLabel("openCinema")}
          </Button>
          <Button
            {...playbackActionDataAttributes("createAndListen", playbackLifecycle)}
            {...providerCapabilityDataAttributes("tts", createAndListenCapabilityReason)}
            aria-label={playbackActionAriaLabel("createAndListen", {
              createScope: "current-scope",
            })}
            className="border-[var(--vs-selected-border)] bg-[var(--vs-action-primary)] text-[var(--vs-action-primary-text)] hover:bg-[var(--vs-action-primary-hover)]"
            data-testid="ui-action-teleprompt-theatre-create-listen"
            disabled={!canCreate}
            disabledReason={createAndListenDisabledReason}
            onClick={onCreateAndListen}
            size="sm"
            variant="primary"
          >
            {workspaceStageActionLabel("createAndListen")}
          </Button>
        </div>

        {theatreViewMode === "operator-preview" || settings.syncOverlayVisible ? (
          <div
            className="grid gap-3 rounded-lg border border-[var(--vs-selected-border)] bg-[var(--vs-selected)] p-3"
            data-testid="teleprompt-operator-preview"
          >
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--vs-theatre-accent)]">
                Operator Preview
              </p>
              <p className="mt-1 text-xs text-[var(--vs-theatre-text)]">
                {summary.activeWordsLabel} · {summary.playbackStatusLabel}
              </p>
            </div>
            <dl className="grid gap-2 text-xs text-[var(--vs-theatre-text)]">
              <OperatorFact label="Sync" value={summary.syncStatusLabel} />
              <OperatorFact label="Word" value={currentWordLabel} />
              <OperatorFact label="Confidence" value={summary.confidenceLabel} />
              <OperatorFact label="Progress" value={`${summary.progressPercent.toString()}%`} />
            </dl>
          </div>
        ) : null}

        {fullscreenAvailability.supported ? null : (
          <p className="rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3 text-xs leading-5 text-[var(--vs-text-secondary)]">
            {fullscreenAvailability.reason}
          </p>
        )}
      </>
    );
    const operatorPanelClassName = cx(
      "max-h-[min(34vh,22rem)] rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-chrome)] p-2 lg:max-h-none lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0",
      settings.operatorPanelPosition === "left" ? "lg:order-first" : "",
    );
    const renderOperatorPanel = (className = "") => (
      <aside
        className={cx("grid min-h-0 gap-3 overflow-auto", className)}
        data-teleprompt-theatre-control-zone="operator"
        data-testid="teleprompt-operator-panel"
      >
        {operatorPanelContent}
      </aside>
    );
    return (
      <section
        aria-label="Teleprompt Theatre"
        aria-modal="true"
        className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[var(--vs-theatre-bg)] text-[var(--vs-theatre-text)]"
        data-testid="teleprompt-theatre"
        data-teleprompt-theatre-preset={settings.presetId}
        data-teleprompt-theatre-mode={mode}
        data-teleprompt-theatre-scroll-mode={settings.scrollMode}
        data-teleprompt-theatre-cue-sync-mode={cueSyncMode}
        data-teleprompt-sync-active-cue-id={syncDebug?.activeCueId ?? ""}
        data-teleprompt-sync-active-source-word-id={syncDebug?.activeSourceWordId ?? ""}
        data-teleprompt-sync-active-word-index={String(syncDebug?.activeWordIndex ?? -1)}
        data-teleprompt-sync-active-word-text={syncDebug?.activeWordText ?? ""}
        data-teleprompt-sync-job-id={syncDebug?.jobId ?? ""}
        data-teleprompt-sync-playback-cursor-sec={
          syncDebug ? syncDebug.playbackCursorSec.toFixed(3) : "0.000"
        }
        data-teleprompt-sync-runtime-state={syncDebug?.runtimeState ?? ""}
        data-teleprompt-sync-mode={syncDebug?.syncMode ?? ""}
        data-teleprompt-sync-timing-source={syncDebug?.timingSource ?? ""}
        data-ui-action-owner="teleprompt"
        data-ui-action-surface="Teleprompt Theatre"
        ref={ref}
        role="dialog"
        tabIndex={-1}
        onBlurCapture={onBlurControls}
        onFocusCapture={onFocusControls}
        onKeyDownCapture={(event) => {
          if (event.key !== "Escape") {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          onExitTheatre();
        }}
        onPointerDown={onRevealControls}
        onPointerMove={onRevealControls}
      >
        <FocusedTheatreChrome
          actions={theatreChromeActions}
          activeLabel={activeBlock?.label ?? "No active cue"}
          activeText={currentCue}
          confidenceLabel={settings.syncOverlayVisible ? summary.confidenceLabel : null}
          controlsVisible={controlsVisible}
          persistentAction={exitAction}
          persistentActions={[
            backToReviewAction,
            backToPreviewAction,
            theatrePreviousAction,
            theatrePlayPauseAction,
            theatreJumpToAudioAction,
            theatreNextAction,
            theatreRestartAction,
            theatreSpeedAction,
            operatorAction,
            exitAction,
          ]}
          progress={{
            currentLabel: `${Math.max(0, Math.min(100, audioProgressPercent)).toString()}%`,
            durationLabel: summary.estimatedRemainingLabel,
            ratio: audioProgressPercent / 100,
          }}
          scopeLabel={summary.cuePositionLabel}
          sourceLabel={summary.sourceScopeLabel}
          statusLabel={summary.playbackStatusLabel}
          surfaceLabel={fullscreenActive ? "Native fullscreen" : "Theatre"}
          syncStatusLabel={settings.syncOverlayVisible ? cueSyncStatusLabel : null}
          testId="teleprompt-theatre-escape-bar"
          toggleControlsTestId="ui-action-teleprompt-theatre-toggle-controls"
          onToggleControls={onToggleControls}
        />

        <div className={theatreLayoutClassName(settings, controlsVisible)}>
          <main
            className={cx(
              "grid min-h-0 gap-4",
              controlsVisible ? "grid-rows-[auto_minmax(0,1fr)_auto]" : "grid-rows-[minmax(0,1fr)]",
            )}
          >
            {controlsVisible ? (
              <div className="hidden gap-2 xl:grid" data-teleprompt-theatre-control-zone="cue-meta">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold uppercase text-[var(--vs-theatre-accent)]">
                      {summary.cuePositionLabel}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold text-[var(--vs-theatre-text)]">
                      {activeBlock?.label ?? "No active cue"}
                    </h2>
                  </div>
                  {settings.syncOverlayVisible ? (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--vs-text-secondary)]">
                      <span>{summary.totalWordsLabel}</span>
                      <span>{summary.estimatedRemainingLabel}</span>
                      <span>{summary.confidenceLabel}</span>
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--vs-text-muted)]">
                  <span>{theatrePreset.label}</span>
                  <span>{settings.fullscreenPreference} fullscreen preference</span>
                  {countdownRemaining === null ? null : (
                    <span className="font-semibold text-[var(--vs-theatre-accent)]">
                      Starting in {countdownRemaining.toString()}
                    </span>
                  )}
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-theatre-panel)]">
                  <div
                    className="h-full rounded-full bg-[var(--vs-theatre-accent)]"
                    style={{ width: `${summary.progressPercent.toString()}%` }}
                  />
                </div>
              </div>
            ) : null}

            <div
              className={cx(
                "grid min-h-0 overflow-auto bg-[var(--vs-theatre-bg)] px-3 py-5 sm:px-6",
                presetId === "highContrast" && "bg-[var(--vs-theatre-bg)]",
                theatreCuePositionClassName(settings.verticalCuePosition),
              )}
              data-testid="teleprompt-theatre-current-cue"
            >
              <TelepromptTheatreCueText
                activeBlock={activeBlock}
                blockKind={activeBlock?.kind}
                currentSourceWordId={currentSourceWordId}
                currentWordIndex={currentWordIndex}
                fallbackText="No spoken text is available for this cue."
                highlightSettings={theatreHighlightSettings}
                mirrorMode={settings.mirrorMode}
                previewBlocks={previewBlocks}
                timingState={currentTimingState}
                text={currentCue}
                textClassName={theatreTextSizeClassName(settings.cueFontSize, presetId)}
                widthClassName={theatreCueWidthClassName(settings.cueWidth)}
                wordTimings={wordTimings}
                wordSpacing={preset.wordSpacing}
              />
            </div>

            {controlsVisible ? (
              <div
                className="grid gap-3 rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3"
                data-teleprompt-theatre-control-zone="transport"
              >
                {settings.nextCuePlacement === "below" ? (
                  <CuePreviewList blocks={previewBlocks} />
                ) : null}
                <LocalizedPlaybackToolbar model={theatrePlaybackToolbar} />
                <p className="hidden text-xs text-[var(--vs-text-muted)] sm:block">
                  {cueSyncDetail || summary.syncStatusLabel}
                  {playbackControlsAvailable
                    ? ` · audio segment ${audioProgressPercent.toString()}%`
                    : ""}
                </p>
              </div>
            ) : null}
          </main>

          {controlsVisible && settings.operatorPanelVisible
            ? renderOperatorPanel(operatorPanelClassName)
            : null}
          {controlsVisible &&
          settings.nextCuePlacement === "side" &&
          !settings.operatorPanelVisible ? (
            <aside
              className="hidden min-h-0 gap-3 overflow-auto rounded-lg border border-[var(--vs-theatre-panel-border)] bg-[var(--vs-theatre-panel)] p-3 lg:grid"
              data-teleprompt-theatre-control-zone="next-cue"
            >
              <CuePreviewList blocks={previewBlocks} />
            </aside>
          ) : null}
        </div>
      </section>
    );
  },
);

function theatreLayoutClassName(
  settings: TelepromptTheatreSettings,
  controlsVisible: boolean,
): string {
  const base = "grid min-h-0 flex-1 gap-3 p-3 sm:gap-4 sm:p-4";
  if (!controlsVisible) {
    return `${base} lg:grid-cols-1`;
  }
  if (!settings.operatorPanelVisible && settings.nextCuePlacement !== "side") {
    return `${base} lg:grid-cols-1`;
  }
  if (settings.operatorPanelPosition === "bottom") {
    return `${base} grid-rows-[minmax(0,1fr)_auto] lg:grid-cols-1`;
  }
  if (settings.operatorPanelPosition === "left") {
    return `${base} grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-none lg:grid-cols-[22rem_minmax(0,1fr)]`;
  }
  return `${base} grid-rows-[minmax(0,1fr)_auto] lg:grid-rows-none lg:grid-cols-[minmax(0,1fr)_22rem]`;
}

function theatreCuePositionClassName(
  value: TelepromptTheatreSettings["verticalCuePosition"],
): string {
  return {
    center: "place-items-center",
    lower: "items-end justify-items-center",
    upper: "items-start justify-items-center",
  }[value];
}

function theatreCueWidthClassName(value: TelepromptTheatreSettings["cueWidth"]): string {
  return {
    balanced: "max-w-5xl [--reading-theatre-measure:24ch]",
    full: "max-w-none [--reading-theatre-measure:34ch]",
    narrow: "max-w-3xl [--reading-theatre-measure:18ch]",
    wide: "max-w-7xl [--reading-theatre-measure:30ch]",
  }[value];
}

function theatreTextSizeClassName(
  size: TelepromptTheatreSettings["cueFontSize"],
  presetId: TelepromptPresetId,
): string {
  if (size === "massive") {
    return "[--reading-theatre-font-size:44px] [--reading-theatre-line-height:1.1] sm:[--reading-theatre-font-size:88px] lg:[--reading-theatre-font-size:100px]";
  }
  if (size === "giant") {
    return "[--reading-theatre-font-size:40px] [--reading-theatre-line-height:1.12] sm:[--reading-theatre-font-size:76px] lg:[--reading-theatre-font-size:92px]";
  }
  if (size === "large" || presetId === "largeText" || presetId === "dyslexicFriendly") {
    return "[--reading-theatre-font-size:36px] [--reading-theatre-line-height:1.16] sm:[--reading-theatre-font-size:64px] lg:[--reading-theatre-font-size:78px]";
  }
  if (presetId === "highContrast") {
    return "[--reading-theatre-font-size:34px] [--reading-theatre-line-height:1.18] sm:[--reading-theatre-font-size:56px] lg:[--reading-theatre-font-size:68px]";
  }
  return "[--reading-theatre-font-size:32px] [--reading-theatre-line-height:1.2] sm:[--reading-theatre-font-size:52px] lg:[--reading-theatre-font-size:60px]";
}

export {
  TelepromptTheatreCueText,
  telepromptTheatreCueSections,
  telepromptTheatreCuePresentationKind,
  telepromptTheatreCueParagraphs,
  telepromptTheatreRenderedCueSections,
  telepromptTheatreCrawlOffset,
  telepromptTheatreCrawlRowKey,
  telepromptTheatreCueSyncTone,
  telepromptTheatreWordLabel,
  CuePreviewList,
  OperatorFact,
} from "./telepromptTheatreCueContent";
export type {
  TelepromptTheatreCueParagraph,
  TelepromptTheatreCueSection,
  TelepromptTheatreRenderedCueSection,
} from "./telepromptTheatreCueContent";
