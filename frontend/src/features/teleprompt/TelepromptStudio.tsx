import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import {
  buildTeleprompterCue,
  buildTeleprompterWordCues,
  splitTeleprompterTokens,
  type TeleprompterHighlightSettings,
  type TeleprompterToken,
  type TeleprompterWordCue,
} from "../../teleprompter";
import type { VoiceJob } from "../../types";
import { Button, Panel, SegmentedControl, StatusChip, Toggle, cx } from "../../design";
import { ContextPanel, buildContextPanelTabs, type ContextPanelTabId } from "../context-panel";
import type { RevisionBlock } from "../revision";
import { HeaderContextSummary } from "../header";
import { playbackActionLabel, telepromptSecondaryActionVariant } from "../playback";
import { workspaceStageActionLabel, workspaceStageActionTestId } from "../workspace";
import type { WorkspaceSourceType, WorkspaceStage } from "../workspace";
import {
  TELEPROMPT_PRESET_IDS,
  telepromptPreset,
  telepromptPresetHighlightSettings,
  type TelepromptPresetId,
} from "./telepromptPresets";
import {
  readTelepromptReturnSnapshot,
  rememberTelepromptReturnSnapshot,
  telepromptSourceKey,
  workspaceStageToTelepromptReturnTarget,
  type TelepromptReturnTarget,
} from "./telepromptReturnMemory";
import {
  TELEPROMPT_SHORTCUTS,
  adjacentTelepromptBlockId,
  countTelepromptWords,
  estimateTelepromptDurationMs,
  formatTelepromptDuration,
  resolveTelepromptBlockIndex,
  resolveTelepromptShortcut,
  totalTelepromptWords,
} from "./telepromptToolbar";

export interface TelepromptPlaybackController {
  readonly isAvailable: boolean;
  readonly isPlaying: boolean;
  readonly pause: () => void;
  readonly play: () => Promise<void> | void;
  readonly restart: () => Promise<void> | void;
  readonly skipBy?: (seconds: number) => void;
}

export interface TelepromptStudioProps {
  readonly activeBlockId: string | null;
  readonly blocks: RevisionBlock[];
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly isPlaybackActive: boolean;
  readonly job: VoiceJob | null;
  readonly playbackControls: TelepromptPlaybackController;
  readonly playbackCursorSec: number;
  readonly policyProfile: string;
  readonly projectId: string;
  readonly rememberReturnMemory: boolean;
  readonly returnStage: Exclude<WorkspaceStage, "teleprompt">;
  readonly scopeLabel: string;
  readonly settings: TeleprompterHighlightSettings;
  readonly sourceId: string | null;
  readonly sourceLabel: string;
  readonly sourceMeta: string;
  readonly sourceType: WorkspaceSourceType;
  readonly voiceProfile: string;
  readonly onActiveBlockChange: (blockId: string | null) => void;
  readonly onBackToPreview: () => void;
  readonly onBackToReview: () => void;
  readonly onCreateAndListen: () => void;
  readonly onOpenCinema: () => void;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function TelepromptStudio({
  activeBlockId,
  blocks,
  canCreate,
  canOpenCinema,
  isPlaybackActive,
  job,
  playbackControls,
  playbackCursorSec,
  policyProfile,
  projectId,
  rememberReturnMemory,
  returnStage,
  scopeLabel,
  settings,
  sourceId,
  sourceLabel,
  sourceMeta,
  sourceType,
  voiceProfile,
  onActiveBlockChange,
  onBackToPreview,
  onBackToReview,
  onCreateAndListen,
  onOpenCinema,
}: Readonly<TelepromptStudioProps>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>("overview");
  const [presetId, setPresetId] = useState<TelepromptPresetId>("standard");
  const [mirrorMode, setMirrorMode] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Teleprompt Studio ready.");
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const scriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const activeBlockElementRef = useRef<HTMLDivElement | null>(null);
  const restoredMemoryRef = useRef(false);
  const sourceKey = useMemo(
    () => telepromptSourceKey({ scopeLabel, sourceId, sourceLabel, sourceType }),
    [scopeLabel, sourceId, sourceLabel, sourceType],
  );
  const returnTarget = workspaceStageToTelepromptReturnTarget(returnStage);
  const activeBlockIndex = resolveTelepromptBlockIndex(blocks, activeBlockId);
  const activeBlock = activeBlockIndex >= 0 ? blocks[activeBlockIndex] : null;
  const activeBlockIdForScroll = activeBlock?.id ?? null;
  const previousBlock = activeBlockIndex > 0 ? blocks[activeBlockIndex - 1] : null;
  const nextBlock =
    activeBlockIndex >= 0 && activeBlockIndex < blocks.length - 1
      ? blocks[activeBlockIndex + 1]
      : null;
  const totalWords = totalTelepromptWords(blocks);
  const activeWords = activeBlock ? countTelepromptWords(activeBlock.spokenText) : 0;
  const estimatedDurationMs =
    blocks.reduce((total, block) => total + block.estimatedDurationMs, 0) ||
    estimateTelepromptDurationMs(totalWords);
  const effectiveSettings = useMemo(
    () => telepromptPresetHighlightSettings(presetId, settings),
    [presetId, settings],
  );
  const cue = useMemo(
    () => buildTeleprompterCue(job, playbackCursorSec, effectiveSettings),
    [effectiveSettings, job, playbackCursorSec],
  );
  const preset = telepromptPreset(presetId);
  const playbackStatusLabel =
    playbackControls.isPlaying || isPlaybackActive ? "Recording playback" : "Ready to record";
  const cueProgressPercent =
    activeBlockIndex >= 0 && blocks.length > 0
      ? Math.round(((activeBlockIndex + 1) / blocks.length) * 100)
      : 0;
  const audioProgressPercent = cue ? Math.round(cue.segmentProgress * 100) : 0;
  const persistSnapshot = useCallback(
    (
      nextReturnTarget: TelepromptReturnTarget = returnTarget,
      nextBlockId: string | null = activeBlock?.id ?? null,
    ) => {
      if (!rememberReturnMemory) {
        return;
      }
      const snapshotBlock = nextBlockId ? blocks.find((block) => block.id === nextBlockId) : null;
      rememberTelepromptReturnSnapshot({
        activeBlockId: nextBlockId,
        activeBlockLabel: snapshotBlock?.label ?? activeBlock?.label ?? null,
        originatingStage: returnStage,
        policyProfile,
        projectId,
        returnTarget: nextReturnTarget,
        scrollTop: scriptScrollerRef.current?.scrollTop ?? 0,
        selectedCueIndex: snapshotBlock?.index ?? activeBlock?.index ?? null,
        sourceKey,
        sourceLabel,
        updatedAt: new Date().toISOString(),
        voiceProfile,
      });
    },
    [
      activeBlock?.id,
      activeBlock?.index,
      activeBlock?.label,
      blocks,
      policyProfile,
      projectId,
      rememberReturnMemory,
      returnStage,
      returnTarget,
      sourceKey,
      sourceLabel,
      voiceProfile,
    ],
  );

  useEffect(() => {
    if (!rememberReturnMemory || blocks.length === 0 || restoredMemoryRef.current) {
      return;
    }
    restoredMemoryRef.current = true;
    const snapshot = readTelepromptReturnSnapshot(projectId, sourceKey);
    const activeBlockStillExists = blocks.some((block) => block.id === activeBlockId);
    if (!activeBlockStillExists && snapshot?.activeBlockId) {
      const restoredBlock = blocks.find((block) => block.id === snapshot.activeBlockId);
      if (restoredBlock) {
        onActiveBlockChange(restoredBlock.id);
      }
    }
    if (snapshot && scriptScrollerRef.current) {
      requestAnimationFrame(() => {
        if (scriptScrollerRef.current) {
          scriptScrollerRef.current.scrollTop = snapshot.scrollTop;
        }
      });
    }
  }, [activeBlockId, blocks, onActiveBlockChange, projectId, rememberReturnMemory, sourceKey]);

  useEffect(() => {
    if (!activeBlock && blocks[0]) {
      onActiveBlockChange(blocks[0].id);
    }
  }, [activeBlock, blocks, onActiveBlockChange]);

  useEffect(() => {
    if (!activeBlockIdForScroll) {
      return;
    }
    activeBlockElementRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [activeBlockIdForScroll]);

  useEffect(() => {
    persistSnapshot();
  }, [persistSnapshot]);

  const moveCue = useCallback(
    (direction: -1 | 1) => {
      const nextId = adjacentTelepromptBlockId(blocks, activeBlock?.id ?? activeBlockId, direction);
      if (!nextId || nextId === activeBlock?.id) {
        setStatusMessage(direction < 0 ? "Already at the first cue." : "Already at the final cue.");
        return;
      }
      onActiveBlockChange(nextId);
      persistSnapshot(returnTarget, nextId);
      setStatusMessage(direction < 0 ? "Moved to previous cue." : "Moved to next cue.");
    },
    [activeBlock?.id, activeBlockId, blocks, onActiveBlockChange, persistSnapshot, returnTarget],
  );

  const handlePlayPause = useCallback(() => {
    if (!playbackControls.isAvailable) {
      setStatusMessage("Playback controls are available after Create & Listen.");
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      setStatusMessage("Playback paused.");
      return;
    }
    void playbackControls.play();
    setStatusMessage("Playback started.");
  }, [playbackControls]);

  const handleRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      setStatusMessage("Playback controls are available after Create & Listen.");
      return;
    }
    void playbackControls.restart();
    setStatusMessage("Playback restarted.");
  }, [playbackControls]);

  const handleReturn = useCallback(
    (target: TelepromptReturnTarget) => {
      persistSnapshot(target);
      if (target === "preview") {
        setWorkflowMenuOpen(false);
        onBackToPreview();
        return;
      }
      setWorkflowMenuOpen(false);
      onBackToReview();
    },
    [onBackToPreview, onBackToReview, persistSnapshot],
  );

  const handleCreateAndListen = useCallback(() => {
    if (!canCreate) {
      setStatusMessage("Select a ready source before creating audio.");
      return;
    }
    persistSnapshot(returnTarget);
    setWorkflowMenuOpen(false);
    onCreateAndListen();
  }, [canCreate, onCreateAndListen, persistSnapshot, returnTarget]);

  const handleOpenCinema = useCallback(() => {
    if (!canOpenCinema) {
      setStatusMessage("Create audio before opening Cinema.");
      return;
    }
    persistSnapshot(returnTarget);
    setWorkflowMenuOpen(false);
    onOpenCinema();
  }, [canOpenCinema, onOpenCinema, persistSnapshot, returnTarget]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveTelepromptShortcut(event);
      if (!shortcut) {
        return;
      }
      event.preventDefault();
      switch (shortcut) {
        case "createListen": {
          handleCreateAndListen();
          break;
        }
        case "nextCue": {
          moveCue(1);
          break;
        }
        case "playPause": {
          handlePlayPause();
          break;
        }
        case "previousCue": {
          moveCue(-1);
          break;
        }
        case "returnPreview": {
          handleReturn("preview");
          break;
        }
        case "returnReview": {
          handleReturn("review");
          break;
        }
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCreateAndListen, handlePlayPause, handleReturn, moveCue]);

  const contextTabs = buildContextPanelTabs(
    [
      {
        children: (
          <dl className="grid gap-2 text-xs">
            <TelepromptContextFact label="Source" value={sourceLabel} />
            <TelepromptContextFact label="Scope" value={scopeLabel} />
            <TelepromptContextFact label="Block" value={activeBlock?.label ?? "No active block"} />
          </dl>
        ),
        detail: sourceMeta,
        id: "teleprompt-source-overview",
        kind: "source-provenance",
        tabId: "overview",
        title: "Teleprompt source",
      },
      {
        children: (
          <p className="text-xs leading-5 vs-muted">
            Back to Review and Back to Preview preserve this source, block, policy, voice, and
            script scroll position.
          </p>
        ),
        detail: `Current return target: ${returnTarget}`,
        id: "teleprompt-return-review",
        kind: "narration-block-status",
        tabId: "review",
        title: "Return context",
      },
      {
        children: (
          <dl className="grid gap-2 text-xs">
            <TelepromptContextFact label="Policy" value={policyProfile} />
            <TelepromptContextFact label="Voice" value={voiceProfile} />
          </dl>
        ),
        detail: `${policyProfile} - ${voiceProfile}`,
        id: "teleprompt-policy",
        kind: "speech-policy",
        tabId: "policy",
        title: "Speech policy",
      },
      {
        children: (
          <dl className="grid gap-2 text-xs">
            <TelepromptContextFact
              label="Audio cue"
              value={
                cue
                  ? `Segment ${String(cue.segmentIndex + 1)} of ${String(cue.segmentCount)}`
                  : "Waiting for generated audio"
              }
            />
            <TelepromptContextFact
              label="Playback"
              value={playbackControls.isAvailable ? playbackStatusLabel : "Not generated"}
            />
          </dl>
        ),
        detail: playbackControls.isAvailable ? playbackStatusLabel : "Waiting for generated audio",
        id: "teleprompt-diagnostics",
        kind: "generated-audio-health",
        tabId: "diagnostics",
        title: "Generated audio health",
      },
      {
        children: (
          <div className="grid gap-2 text-xs">
            {TELEPROMPT_SHORTCUTS.map((shortcut) => (
              <div className="flex items-center justify-between gap-3" key={shortcut.action}>
                <span className="font-semibold">{shortcut.label}</span>
                <kbd className="rounded border bg-[var(--vs-raised)] px-2 py-1 text-[0.68rem] vs-border">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        ),
        detail: "Keyboard operation",
        id: "teleprompt-history",
        kind: "wayfinding",
        tabId: "history",
        title: "Keyboard shortcuts",
      },
    ],
    { allowedSurfaces: ["Teleprompt"], owner: "teleprompt" },
  );

  return (
    <Panel className="grid gap-3 p-4" data-testid="teleprompt-studio" variant="raised">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <HeaderContextSummary
          className="flex-1"
          metadata={[
            { label: "Policy", value: policyProfile },
            { label: "Voice", value: voiceProfile },
            { label: "Block", value: activeBlock?.label ?? "No active block" },
            { label: "Size", value: sourceMeta },
          ]}
          scopeTitle={scopeLabel}
          sourceTitle={sourceLabel}
          stateLabel="Teleprompt"
          surfaceName="Teleprompt Studio"
        />
        <div className="grid gap-2 text-xs sm:grid-cols-3 lg:min-w-[24rem]">
          <TelepromptMetric label="Words" value={totalWords.toLocaleString()} />
          <TelepromptMetric
            label="Estimate"
            value={formatTelepromptDuration(estimatedDurationMs)}
          />
          <TelepromptMetric
            label="Active cue"
            value={
              activeBlock
                ? `${String(activeBlock.index)} / ${String(Math.max(1, blocks.length))}`
                : "0 / 0"
            }
          />
        </div>
      </div>

      <div className="sticky top-3 z-10 rounded-lg border bg-[var(--vs-surface)] p-3 shadow-sm vs-border">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                tone={playbackControls.isPlaying || isPlaybackActive ? "success" : "neutral"}
              >
                {playbackStatusLabel}
              </StatusChip>
              <StatusChip tone={playbackControls.isAvailable ? "success" : "warning"}>
                {playbackControls.isAvailable ? "Preview ready" : "Audio not generated"}
              </StatusChip>
              <span className="text-xs font-semibold vs-muted">
                Cue {activeBlock ? activeBlock.index.toString() : "0"} of{" "}
                {Math.max(1, blocks.length).toString()}
              </span>
            </div>
            <div className="grid gap-1">
              <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-border)]">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${cueProgressPercent.toString()}%` }}
                />
              </div>
              <p className="text-xs vs-muted">
                Script progress {cueProgressPercent.toString()}%
                {playbackControls.isAvailable
                  ? ` · audio segment ${audioProgressPercent.toString()}%`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button
              data-testid="ui-action-teleprompt-previous-cue"
              disabled={activeBlockIndex <= 0}
              disabledReason={activeBlockIndex > 0 ? undefined : "Already at the first cue."}
              onClick={() => {
                moveCue(-1);
              }}
              size="sm"
              variant="secondary"
            >
              Previous cue
            </Button>
            <Button
              data-testid="ui-action-teleprompt-play-pause"
              disabled={!playbackControls.isAvailable}
              disabledReason={
                playbackControls.isAvailable ? undefined : "Create audio before playback."
              }
              onClick={handlePlayPause}
              size="sm"
              variant="primary"
            >
              {playbackControls.isPlaying ? "Pause Cue" : playbackActionLabel("telepromptPlay")}
            </Button>
            <Button
              data-testid="ui-action-teleprompt-restart"
              disabled={!playbackControls.isAvailable}
              disabledReason={
                playbackControls.isAvailable ? undefined : "Create audio before playback."
              }
              onClick={handleRestart}
              size="sm"
              variant="secondary"
            >
              Restart
            </Button>
            <Button
              data-testid="ui-action-teleprompt-next-cue"
              disabled={activeBlockIndex < 0 || activeBlockIndex >= blocks.length - 1}
              disabledReason={
                activeBlockIndex >= 0 && activeBlockIndex < blocks.length - 1
                  ? undefined
                  : "Already at the final cue."
              }
              onClick={() => {
                moveCue(1);
              }}
              size="sm"
              variant="secondary"
            >
              Next cue
            </Button>
          </div>
          <details
            className="relative lg:justify-self-end"
            open={workflowMenuOpen}
            onToggle={(event) => {
              setWorkflowMenuOpen(event.currentTarget.open);
            }}
          >
            <summary
              className="flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md border px-3 text-sm font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border vs-raised [&::-webkit-details-marker]:hidden"
              data-testid="ui-action-teleprompt-workflow-menu"
            >
              Workflow
            </summary>
            <div className="mt-2 grid gap-2 rounded-md border bg-[var(--vs-raised)] p-2 shadow-xl vs-border lg:absolute lg:right-0 lg:w-52">
              <Button
                data-testid="ui-action-teleprompt-back-review"
                onClick={() => {
                  handleReturn("review");
                }}
                size="sm"
                variant={returnTarget === "review" ? "pinned" : "secondary"}
              >
                Back to Review
              </Button>
              <Button
                data-testid="ui-action-teleprompt-back-preview"
                onClick={() => {
                  handleReturn("preview");
                }}
                size="sm"
                variant={returnTarget === "preview" ? "pinned" : "secondary"}
              >
                Back to Preview
              </Button>
              <Button
                data-testid={workspaceStageActionTestId("openCinema")}
                disabled={!canOpenCinema}
                disabledReason={canOpenCinema ? undefined : "Create audio before opening Cinema."}
                onClick={handleOpenCinema}
                size="sm"
                variant={telepromptSecondaryActionVariant("open-cinema")}
              >
                {workspaceStageActionLabel("openCinema")}
              </Button>
              <Button
                data-testid={workspaceStageActionTestId("createAndListen")}
                disabled={!canCreate}
                disabledReason={
                  canCreate ? undefined : "Select a ready source before creating audio."
                }
                onClick={handleCreateAndListen}
                size="sm"
                variant={telepromptSecondaryActionVariant("create-and-listen")}
              >
                {workspaceStageActionLabel("createAndListen")}
              </Button>
            </div>
          </details>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="grid min-w-0 gap-3">
          <div className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
                Presentation settings
              </p>
              <p className="mt-1 text-xs leading-5 vs-muted">
                Adjust the recording display without exposing timing internals.
              </p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <SegmentedControl
                ariaLabel="Teleprompt accessibility preset"
                className="min-w-0 flex-1"
                columns={2}
                options={TELEPROMPT_PRESET_IDS.map((id) => ({
                  label: telepromptPreset(id).label,
                  testId: `ui-action-teleprompt-preset-${id}`,
                  value: id,
                }))}
                value={presetId}
                onChange={(id) => {
                  setPresetId(id);
                  setStatusMessage(`${telepromptPreset(id).label} preset applied.`);
                }}
              />
              <Toggle
                checked={mirrorMode}
                className="sm:min-w-48"
                data-testid="ui-action-teleprompt-mirror"
                detail="Flip the script for mirrored recording rigs."
                label="Mirror mode"
                onChange={(checked) => {
                  setMirrorMode(checked);
                  setStatusMessage(checked ? "Mirror mode enabled." : "Mirror mode disabled.");
                }}
              />
            </div>
            <p className="text-xs leading-5 vs-muted">
              Cue highlight style: {effectiveSettings.effectStyle === "spark" ? "Guided" : "Bold"}.
              {` ${preset.description}`}
            </p>
          </div>

          <div
            className={cx(
              "overflow-auto rounded-lg border p-4 shadow-sm vs-border sm:p-6",
              preset.shellClassName,
            )}
            data-testid="teleprompt-script-scroll"
            onScroll={() => {
              persistSnapshot();
            }}
            ref={scriptScrollerRef}
            style={{ maxHeight: "38rem" }}
          >
            <div
              className="grid gap-5"
              data-testid="teleprompt-script"
              style={{
                transform: mirrorMode ? "scaleX(-1)" : undefined,
                wordSpacing: preset.wordSpacing,
              }}
            >
              {blocks.map((block) => (
                <TelepromptScriptBlock
                  active={block.id === activeBlock?.id}
                  block={block}
                  cueText={cue?.currentText ?? null}
                  highContrast={presetId === "highContrast"}
                  key={block.id}
                  presetClassName={preset.scriptClassName}
                  activeRef={block.id === activeBlock?.id ? activeBlockElementRef : undefined}
                  settings={effectiveSettings}
                  onSelect={() => {
                    onActiveBlockChange(block.id);
                    persistSnapshot(returnTarget, block.id);
                    setStatusMessage(`Selected cue ${block.index.toString()}.`);
                  }}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="grid gap-3">
          <TelepromptBlockPreview block={activeBlock} label="Current block" words={activeWords} />
          <TelepromptBlockPreview block={nextBlock} label="Next block" />
          <TelepromptBlockPreview block={previousBlock} label="Previous block" />
        </aside>
      </div>

      <output
        className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold vs-border"
        data-testid="teleprompt-status-message"
      >
        {statusMessage}
      </output>

      <ContextPanel
        activeTabId={activeContextTab}
        label="Teleprompt context"
        surface="Teleprompt"
        tabs={contextTabs}
        onTabChange={setActiveContextTab}
      />
    </Panel>
  );
}

function TelepromptScriptBlock({
  activeRef,
  active,
  block,
  cueText,
  highContrast,
  presetClassName,
  settings,
  onSelect,
}: Readonly<{
  activeRef?: RefObject<HTMLDivElement | null>;
  active: boolean;
  block: RevisionBlock;
  cueText: string | null;
  highContrast: boolean;
  presetClassName: string;
  settings: TeleprompterHighlightSettings;
  onSelect: () => void;
}>) {
  const spokenText = block.spokenText || block.text;
  const shouldRenderCue =
    active && cueText && normalizeCueText(cueText) === normalizeCueText(spokenText);
  return (
    <div
      className={cx(
        "rounded-lg border p-3 transition vs-border",
        telepromptScriptBlockClassName({ active, highContrast }),
      )}
      data-testid={`teleprompt-block-${block.id}`}
      ref={activeRef}
    >
      <button
        className="mb-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-left text-sm font-semibold vs-border"
        data-testid={`ui-action-teleprompt-cue-${String(block.index)}`}
        data-ui-noop-reason={active ? "Cue is already selected." : undefined}
        onClick={onSelect}
        type="button"
      >
        <span>
          Cue {block.index.toString()}: {block.label}
        </span>
        {active ? <StatusChip tone="success">Selected</StatusChip> : null}
      </button>
      <p className={cx("whitespace-pre-wrap", presetClassName)}>
        {shouldRenderCue ? (
          <TelepromptCueWords settings={settings} text={spokenText} />
        ) : (
          spokenText || "No spoken text is available for this cue."
        )}
      </p>
    </div>
  );
}

function telepromptScriptBlockClassName({
  active,
  highContrast,
}: Readonly<{ active: boolean; highContrast: boolean }>): string {
  if (active && highContrast) {
    return "border-zinc-100 bg-zinc-950 text-white ring-2 ring-orange-300";
  }
  if (active) {
    return "border-orange-300 bg-orange-500/10 ring-1 ring-orange-300";
  }
  if (highContrast) {
    return "border-zinc-100 bg-zinc-950 text-white";
  }
  return "bg-[var(--vs-surface)]";
}

function TelepromptCueWords({
  settings,
  text,
}: Readonly<{ settings: TeleprompterHighlightSettings; text: string }>) {
  const tokens = splitTeleprompterTokens(text);
  const cues = buildTeleprompterWordCues(
    text,
    settings.leadMs,
    estimateTelepromptDurationMs(countTelepromptWords(text)),
    settings,
  );
  const cueByIndex = new Map(cues.map((cue) => [cue.wordIndex, cue]));
  return (
    <>
      {tokens.map((token, index) => (
        <TelepromptCueToken
          cue={token.wordIndex === null ? null : (cueByIndex.get(token.wordIndex) ?? null)}
          key={`${token.text}-${index.toString()}`}
          token={token}
        />
      ))}
    </>
  );
}

function TelepromptCueToken({
  cue,
  token,
}: Readonly<{ cue: TeleprompterWordCue | null; token: TeleprompterToken }>) {
  if (token.kind === "space") {
    return <span className="whitespace-pre-wrap">{token.text}</span>;
  }
  const state = cue?.state ?? "idle";
  return (
    <span
      className={`teleprompter-word teleprompter-word--${state} rounded px-1 py-0.5`}
      data-effect="classic"
      style={
        {
          "--teleprompter-accent": "#f97316",
          "--teleprompter-intensity": String(cue?.intensity ?? 0),
        } as CSSProperties
      }
    >
      {token.text}
    </span>
  );
}

function TelepromptBlockPreview({
  block,
  label,
  words,
}: Readonly<{ block: RevisionBlock | null; label: string; words?: number }>) {
  return (
    <Panel className="grid gap-2 p-3" variant="surface">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
        {block ? (
          <StatusChip tone="neutral">
            {words?.toLocaleString() ?? countTelepromptWords(block.spokenText)} words
          </StatusChip>
        ) : null}
      </div>
      <p className="text-sm font-semibold">{block ? block.label : "No block"}</p>
      <p className="line-clamp-4 text-xs leading-5 vs-muted">
        {block ? block.spokenText || block.text : "This edge of the script is empty."}
      </p>
    </Panel>
  );
}

function TelepromptMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 text-base font-semibold">{value}</dd>
    </div>
  );
}

function TelepromptContextFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function normalizeCueText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}
