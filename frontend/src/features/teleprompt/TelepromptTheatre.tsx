import { forwardRef } from "react";
import type { RevisionBlock } from "../revision";
import { Button, SegmentedControl, StatusChip, Toggle, cx } from "../../design";
import {
  playbackActionAriaLabel,
  playbackActionDataAttributes,
  playbackActionLabel,
  type GeneratedAudioLifecycleState,
} from "../playback";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import { workspaceStageActionLabel } from "../workspace";
import {
  TELEPROMPT_PRESET_IDS,
  telepromptPreset,
  type TelepromptPresetId,
} from "./telepromptPresets";
import type { TelepromptFullscreenAvailability } from "./telepromptFullscreen";
import type {
  TelepromptTheatreMode,
  TelepromptTheatreSummary,
  TelepromptTheatreViewMode,
} from "./telepromptTheatreState";
import type { TelepromptCueSyncMode } from "./telepromptCueTimeline";

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
  readonly currentWordIndex: number | null;
  readonly fullscreenAvailability: TelepromptFullscreenAvailability;
  readonly fullscreenActive: boolean;
  readonly mirrorMode: boolean;
  readonly mode: TelepromptTheatreMode;
  readonly nativeFullscreenDisabledReason?: string;
  readonly nextBlock: RevisionBlock | null;
  readonly openCinemaDisabledReason?: string;
  readonly playbackControlsAvailable: boolean;
  readonly playbackControlsPlaying: boolean;
  readonly playbackLifecycle: GeneratedAudioLifecycleState;
  readonly presetId: TelepromptPresetId;
  readonly summary: TelepromptTheatreSummary;
  readonly theatreViewMode: TelepromptTheatreViewMode;
  readonly onBackToPreview: () => void;
  readonly onBackToReview: () => void;
  readonly onCreateAndListen: () => void;
  readonly onExitTheatre: () => void;
  readonly onMoveCue: (direction: -1 | 1) => void;
  readonly onOpenCinema: () => void;
  readonly onPresetChange: (presetId: TelepromptPresetId) => void;
  readonly onRequestNativeFullscreen: () => void;
  readonly onRestart: () => void;
  readonly onToggleMirror: (checked: boolean) => void;
  readonly onToggleOperatorPreview: () => void;
  readonly onTogglePlayback: () => void;
}

export const TelepromptTheatre = forwardRef<HTMLDivElement, TelepromptTheatreProps>(
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
      currentWordIndex,
      fullscreenAvailability,
      fullscreenActive,
      mirrorMode,
      mode,
      nativeFullscreenDisabledReason,
      nextBlock,
      openCinemaDisabledReason,
      playbackControlsAvailable,
      playbackControlsPlaying,
      playbackLifecycle,
      presetId,
      summary,
      theatreViewMode,
      onBackToPreview,
      onBackToReview,
      onCreateAndListen,
      onExitTheatre,
      onMoveCue,
      onOpenCinema,
      onPresetChange,
      onRequestNativeFullscreen,
      onRestart,
      onToggleMirror,
      onToggleOperatorPreview,
      onTogglePlayback,
    },
    ref,
  ) {
    const preset = telepromptPreset(presetId);
    const currentCue = currentCueText ?? activeBlock?.spokenText ?? activeBlock?.text ?? "";
    const cueSyncTone = telepromptTheatreCueSyncTone(cueSyncMode);
    const currentWordLabel = telepromptTheatreWordLabel(currentWordIndex);
    return (
      <section
        aria-label="Teleprompt Theatre"
        aria-modal="true"
        className={cx(
          "fixed inset-0 z-[80] flex flex-col overflow-hidden bg-zinc-950 text-white",
          presetId === "highContrast" ? "text-white" : "text-zinc-50",
        )}
        data-testid="teleprompt-theatre"
        data-teleprompt-theatre-mode={mode}
        data-ui-action-owner="teleprompt"
        data-ui-action-surface="Teleprompt Theatre"
        ref={ref}
        role="dialog"
        tabIndex={-1}
      >
        <div
          className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-white/15 bg-black/80 px-4 py-3 backdrop-blur"
          data-testid="teleprompt-theatre-escape-bar"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusChip tone="success">
              {fullscreenActive ? "Native fullscreen" : "Theatre mode"}
            </StatusChip>
            <StatusChip tone={playbackControlsPlaying ? "success" : "neutral"}>
              {summary.playbackStatusLabel}
            </StatusChip>
            <StatusChip tone={cueSyncTone}>{cueSyncStatusLabel}</StatusChip>
            <span className="truncate text-sm font-semibold text-zinc-200">
              {summary.sourceScopeLabel}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              data-testid="ui-action-teleprompt-theatre-back-review"
              onClick={onBackToReview}
              size="sm"
              variant="secondary"
            >
              Back to Review
            </Button>
            <Button
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              data-testid="ui-action-teleprompt-theatre-back-preview"
              onClick={onBackToPreview}
              size="sm"
              variant="secondary"
            >
              Back to Preview
            </Button>
            <Button
              className="border-white/20 bg-white/10 text-white hover:bg-white/15"
              data-testid="ui-action-teleprompt-native-fullscreen"
              disabled={!fullscreenAvailability.supported}
              disabledReason={
                nativeFullscreenDisabledReason ?? fullscreenAvailability.reason ?? undefined
              }
              onClick={onRequestNativeFullscreen}
              size="sm"
              variant="secondary"
            >
              {fullscreenActive ? "Fullscreen active" : "Native fullscreen"}
            </Button>
            <Button
              className="border-white/25 bg-white text-zinc-950 hover:bg-zinc-200"
              data-testid="ui-action-teleprompt-exit-theatre"
              onClick={onExitTheatre}
              size="sm"
              variant="primary"
            >
              Exit theatre
            </Button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase text-orange-300">
                    {summary.cuePositionLabel}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-white">
                    {activeBlock?.label ?? "No active cue"}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-300">
                  <span>{summary.totalWordsLabel}</span>
                  <span>{summary.estimatedRemainingLabel}</span>
                  <span>{summary.confidenceLabel}</span>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-orange-400"
                  style={{ width: `${summary.progressPercent.toString()}%` }}
                />
              </div>
            </div>

            <div
              className={cx(
                "min-h-0 overflow-auto rounded-lg border border-white/15 bg-black/35 p-5 shadow-2xl",
                presetId === "highContrast" && "border-white bg-black",
              )}
              data-testid="teleprompt-theatre-current-cue"
            >
              <p
                className={cx(
                  "mx-auto max-w-5xl whitespace-pre-wrap text-center font-semibold",
                  theatreTextSizeClassName(presetId),
                )}
                style={{
                  transform: mirrorMode ? "scaleX(-1)" : undefined,
                  wordSpacing: preset.wordSpacing,
                }}
              >
                {currentCue || "No spoken text is available for this cue."}
              </p>
            </div>

            <div className="grid gap-3 rounded-lg border border-white/15 bg-white/5 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase text-zinc-400">Next cue</p>
                  <p className="line-clamp-2 text-sm text-zinc-200">
                    {nextBlock?.spokenText ?? nextBlock?.text ?? "Final cue."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                    data-testid="ui-action-teleprompt-theatre-previous-cue"
                    disabled={activeBlockIndex <= 0}
                    disabledReason={activeBlockIndex > 0 ? undefined : "Already at the first cue."}
                    onClick={() => {
                      onMoveCue(-1);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Previous
                  </Button>
                  <Button
                    {...playbackActionDataAttributes("telepromptPlay", playbackLifecycle, {
                      primary: true,
                    })}
                    aria-label={
                      playbackControlsPlaying
                        ? "Pause Cue"
                        : playbackActionAriaLabel("telepromptPlay", {
                            lifecycle: playbackLifecycle,
                          })
                    }
                    className="border-orange-400 bg-orange-500 text-white hover:bg-orange-600"
                    data-testid="ui-action-teleprompt-theatre-play-pause"
                    disabled={!playbackControlsAvailable}
                    disabledReason={cuePlaybackDisabledReason}
                    onClick={onTogglePlayback}
                    size="sm"
                    variant="primary"
                  >
                    {playbackControlsPlaying ? "Pause Cue" : playbackActionLabel("telepromptPlay")}
                  </Button>
                  <Button
                    className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                    data-testid="ui-action-teleprompt-theatre-restart"
                    disabled={!playbackControlsAvailable}
                    disabledReason={cuePlaybackDisabledReason}
                    onClick={onRestart}
                    size="sm"
                    variant="secondary"
                  >
                    Restart
                  </Button>
                  <Button
                    className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                    data-testid="ui-action-teleprompt-theatre-next-cue"
                    disabled={!nextBlock}
                    disabledReason={nextBlock ? undefined : "Already at the final cue."}
                    onClick={() => {
                      onMoveCue(1);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    Next
                  </Button>
                </div>
              </div>
              <p className="text-xs text-zinc-400">
                {cueSyncDetail || summary.syncStatusLabel}
                {playbackControlsAvailable
                  ? ` · audio segment ${audioProgressPercent.toString()}%`
                  : ""}
              </p>
            </div>
          </main>

          <aside className="grid min-h-0 gap-3 overflow-auto">
            <div className="grid gap-3 rounded-lg border border-white/15 bg-white/5 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Presenter preset</p>
                <p className="mt-1 text-xs text-zinc-400">{preset.description}</p>
              </div>
              <SegmentedControl
                ariaLabel="Teleprompt theatre preset"
                className="text-zinc-950"
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
                checked={mirrorMode}
                className="text-zinc-100"
                data-testid="ui-action-teleprompt-theatre-mirror"
                detail="Flip the presenter script for mirrored recording rigs."
                label="Mirror mode"
                onChange={onToggleMirror}
              />
              <Button
                className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                data-testid="ui-action-teleprompt-operator-preview"
                onClick={onToggleOperatorPreview}
                selected={theatreViewMode === "operator-preview"}
                size="sm"
                variant="secondary"
              >
                Operator Preview
              </Button>
            </div>

            <div className="grid gap-3 rounded-lg border border-white/15 bg-white/5 p-3">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Exit paths</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Leaving theatre preserves source, cue, voice, policy, and return target.
                </p>
              </div>
              <Button
                {...playbackActionDataAttributes("openCinema", playbackLifecycle)}
                className="border-white/20 bg-white/10 text-white hover:bg-white/15"
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
                className="border-orange-400 bg-orange-500 text-white hover:bg-orange-600"
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

            {theatreViewMode === "operator-preview" ? (
              <div
                className="grid gap-3 rounded-lg border border-orange-300/40 bg-orange-500/10 p-3"
                data-testid="teleprompt-operator-preview"
              >
                <div>
                  <p className="text-xs font-semibold uppercase text-orange-200">
                    Operator Preview
                  </p>
                  <p className="mt-1 text-xs text-orange-100">
                    {summary.activeWordsLabel} · {summary.playbackStatusLabel}
                  </p>
                </div>
                <dl className="grid gap-2 text-xs text-orange-50">
                  <OperatorFact label="Sync" value={summary.syncStatusLabel} />
                  <OperatorFact label="Word" value={currentWordLabel} />
                  <OperatorFact label="Confidence" value={summary.confidenceLabel} />
                  <OperatorFact label="Progress" value={`${summary.progressPercent.toString()}%`} />
                </dl>
              </div>
            ) : null}

            {fullscreenAvailability.supported ? null : (
              <p className="rounded-lg border border-white/15 bg-white/5 p-3 text-xs leading-5 text-zinc-300">
                {fullscreenAvailability.reason}
              </p>
            )}
          </aside>
        </div>
      </section>
    );
  },
);

function theatreTextSizeClassName(presetId: TelepromptPresetId): string {
  if (presetId === "largeText" || presetId === "dyslexicFriendly") {
    return "text-5xl leading-[1.25] md:text-6xl";
  }
  if (presetId === "highContrast") {
    return "text-4xl leading-[1.25] md:text-6xl";
  }
  return "text-4xl leading-[1.3] md:text-5xl";
}

function telepromptTheatreCueSyncTone(mode: TelepromptCueSyncMode): "info" | "neutral" {
  return mode === "manual" ? "neutral" : "info";
}

function telepromptTheatreWordLabel(currentWordIndex: number | null): string {
  if (currentWordIndex === null || currentWordIndex < 0) {
    return "Phrase cue";
  }
  return `Word ${(currentWordIndex + 1).toString()}`;
}

function OperatorFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-orange-200">{label}</dt>
      <dd className="text-right font-semibold text-white">{value}</dd>
    </div>
  );
}
