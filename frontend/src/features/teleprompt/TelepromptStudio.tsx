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
import type { HighlightMap, VoiceJob } from "../../types";
import { Button, Panel, SegmentedControl, StatusChip, Toggle, cx } from "../../design";
import { ContextPanel, buildContextPanelTabs, type ContextPanelTabId } from "../context-panel";
import { HighlightRenderer, type HighlightMapV2 } from "../readalong";
import { liveStatusMessages, useLiveStatus } from "../accessibility";
import type { RevisionBlock } from "../revision";
import { HeaderContextSummary } from "../header";
import {
  generatedAudioLifecycleFromJob,
  playbackActionAriaLabel,
  playbackActionDataAttributes,
  playbackActionDisabledReason,
  playbackActionLabel,
  telepromptSecondaryActionVariant,
} from "../playback";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import { workspaceStageActionLabel, workspaceStageActionTestId } from "../workspace";
import type { WorkspaceSourceType, WorkspaceStage } from "../workspace";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import {
  TELEPROMPT_PRESET_IDS,
  telepromptPreset,
  telepromptPresetHighlightSettings,
  type TelepromptPresetId,
} from "./telepromptPresets";
import { TelepromptTheatre } from "./TelepromptTheatre";
import {
  exitTelepromptFullscreen,
  isTelepromptFullscreenActive,
  requestTelepromptFullscreen,
  subscribeTelepromptFullscreenChange,
  telepromptFullscreenAvailability,
} from "./telepromptFullscreen";
import {
  readTelepromptReturnSnapshot,
  rememberTelepromptReturnSnapshot,
  telepromptSourceKey,
  workspaceStageToTelepromptReturnTarget,
  type TelepromptReturnTarget,
} from "./telepromptReturnMemory";
import { resolveTelepromptTheatreShortcut } from "./telepromptTheatreShortcuts";
import {
  buildTelepromptTheatreSummary,
  type TelepromptTheatreMode,
  type TelepromptTheatreViewMode,
} from "./telepromptTheatreState";
import { TelepromptCueSync } from "./TelepromptCueSync";
import {
  buildTelepromptCueTimeline,
  resolveTelepromptCueSync,
  telepromptCueSeekSeconds,
  type TelepromptCueSyncMode,
} from "./telepromptCueTimeline";
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
  readonly seekTo?: (seconds: number) => void;
  readonly skipBy?: (seconds: number) => void;
}

export interface TelepromptStudioProps {
  readonly activeBlockId: string | null;
  readonly blocks: RevisionBlock[];
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly createAndListenCapabilityReason?: string;
  readonly createAndListenDisabledReason?: string;
  readonly isPlaybackActive: boolean;
  readonly job: VoiceJob | null;
  readonly highlightMap?: HighlightMap | null;
  readonly highlightMapV2?: HighlightMapV2 | null;
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
  readonly sourceLifecycle?: SourceLifecycleEnvelope | null;
  readonly sourceMeta: string;
  readonly sourceType: WorkspaceSourceType;
  readonly theatreOpenSignal?: number;
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
  createAndListenCapabilityReason,
  createAndListenDisabledReason: externalCreateAndListenDisabledReason,
  isPlaybackActive,
  job,
  highlightMap = null,
  highlightMapV2 = null,
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
  sourceLifecycle = null,
  sourceMeta,
  sourceType,
  theatreOpenSignal = 0,
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
  const [theatreMode, setTheatreMode] = useState<TelepromptTheatreMode>("inline");
  const [theatreViewMode, setTheatreViewMode] = useState<TelepromptTheatreViewMode>("manual");
  const [fullscreenAvailability, setFullscreenAvailability] = useState(() =>
    telepromptFullscreenAvailability(),
  );
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Teleprompt Studio ready.");
  const { announcePolite } = useLiveStatus();
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const [cueSyncMode, setCueSyncMode] = useState<TelepromptCueSyncMode>("audio-follow");
  const scriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const activeBlockElementRef = useRef<HTMLDivElement | null>(null);
  const theatreRootRef = useRef<HTMLDivElement | null>(null);
  const theatreOpenSignalRef = useRef(0);
  const theatreReturnFocusRef = useRef<HTMLElement | null>(null);
  const restoredMemoryRef = useRef(false);
  const sourceKey = useMemo(
    () => telepromptSourceKey({ scopeLabel, sourceId, sourceLabel, sourceType }),
    [scopeLabel, sourceId, sourceLabel, sourceType],
  );
  const returnTarget = workspaceStageToTelepromptReturnTarget(returnStage);
  const cueTimeline = useMemo(
    () => buildTelepromptCueTimeline({ blocks, highlightMap, highlightMapV2, job }),
    [blocks, highlightMap, highlightMapV2, job],
  );
  const cueSync = useMemo(
    () =>
      resolveTelepromptCueSync({
        activeBlockId,
        mode: cueSyncMode,
        playbackAvailable: playbackControls.isAvailable,
        playbackCursorSec,
        playbackPlaying: playbackControls.isPlaying || isPlaybackActive,
        timeline: cueTimeline,
      }),
    [
      activeBlockId,
      cueSyncMode,
      cueTimeline,
      isPlaybackActive,
      playbackControls.isAvailable,
      playbackControls.isPlaying,
      playbackCursorSec,
    ],
  );
  const syncedActiveBlockId = cueSync.activeCue?.sourceBlockId ?? activeBlockId;
  const activeBlockIndex = resolveTelepromptBlockIndex(blocks, syncedActiveBlockId);
  const activeBlock = activeBlockIndex >= 0 ? blocks[activeBlockIndex] : null;
  const activeBlockIdForScroll = activeBlock?.id ?? null;
  const previousBlock = activeBlockIndex > 0 ? blocks[activeBlockIndex - 1] : null;
  const nextBlock =
    activeBlockIndex >= 0 && activeBlockIndex < blocks.length - 1
      ? blocks[activeBlockIndex + 1]
      : null;
  const previousCueUnavailable = activeBlockIndex <= 0;
  const previousCueNoopReason =
    previousCueUnavailable && activeBlockIndex >= 0 ? "Already at the first cue." : undefined;
  const nextCueUnavailable = activeBlockIndex < 0 || activeBlockIndex >= blocks.length - 1;
  const nextCueNoopReason =
    nextCueUnavailable && activeBlockIndex >= 0 ? "Already at the final cue." : undefined;
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
  const playbackLifecycle = playbackControls.isAvailable
    ? "ready"
    : generatedAudioLifecycleFromJob({ job });
  const cuePlaybackDisabledReason = playbackControls.isAvailable
    ? undefined
    : playbackActionDisabledReason({ action: "telepromptPlay", lifecycle: playbackLifecycle });
  const openCinemaDisabledReason = canOpenCinema
    ? undefined
    : playbackActionDisabledReason({
        action: "openCinema",
        fallbackReason: "Create audio before opening Cinema.",
        lifecycle: playbackLifecycle,
      });
  const createAndListenDisabledReason = canCreate
    ? undefined
    : (externalCreateAndListenDisabledReason ??
      playbackActionDisabledReason({
        action: "createAndListen",
        fallbackReason: "Select a ready source before creating audio.",
        lifecycle: playbackLifecycle,
      }));
  const cueProgressPercent =
    activeBlockIndex >= 0 && blocks.length > 0
      ? Math.round(((activeBlockIndex + 1) / blocks.length) * 100)
      : 0;
  const audioProgressPercent = cueSync.activeCue
    ? Math.round(cueSync.activeCue.cueProgress * 100)
    : Math.round((cue?.segmentProgress ?? 0) * 100);
  const theatreSummary = useMemo(
    () => ({
      ...buildTelepromptTheatreSummary({
        activeBlockId: activeBlock?.id ?? activeBlockId,
        blocks,
        estimatedDurationMs,
        isPlaybackActive: playbackControls.isPlaying || isPlaybackActive,
        playbackAvailable: playbackControls.isAvailable,
        scopeLabel,
        sourceLabel,
      }),
      syncStatusLabel: cueSync.statusLabel,
    }),
    [
      activeBlock?.id,
      activeBlockId,
      blocks,
      cueSync.statusLabel,
      estimatedDurationMs,
      isPlaybackActive,
      playbackControls.isAvailable,
      playbackControls.isPlaying,
      scopeLabel,
      sourceLabel,
    ],
  );
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

  const openTheatre = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      theatreReturnFocusRef.current = document.activeElement;
    }
    persistSnapshot(returnTarget);
    setFullscreenAvailability(telepromptFullscreenAvailability());
    setTheatreMode("theatre");
    setStatusMessage("Teleprompt Theatre opened.");
    announcePolite(liveStatusMessages.telepromptTheatreEntered());
  }, [announcePolite, persistSnapshot, returnTarget]);

  const handleExitTheatre = useCallback(() => {
    void exitTelepromptFullscreen();
    setNativeFullscreenActive(false);
    setTheatreMode("inline");
    setStatusMessage("Exited Teleprompt Theatre.");
    announcePolite(liveStatusMessages.telepromptTheatreExited());
    requestAnimationFrame(() => {
      theatreReturnFocusRef.current?.focus();
      theatreReturnFocusRef.current = null;
    });
  }, [announcePolite]);

  const handleRequestNativeFullscreen = useCallback(() => {
    const availability = telepromptFullscreenAvailability();
    setFullscreenAvailability(availability);
    if (!availability.supported) {
      setTheatreMode("theatre");
      setStatusMessage("Native fullscreen is unavailable; Theatre Mode remains active.");
      return;
    }
    void requestTelepromptFullscreen(theatreRootRef.current).then((result) => {
      if (result === "fullscreen") {
        setNativeFullscreenActive(true);
        setTheatreMode("fullscreen");
        setStatusMessage("Native fullscreen active.");
        return;
      }
      setTheatreMode("theatre");
      setStatusMessage("Native fullscreen is unavailable; Theatre Mode remains active.");
    });
  }, []);

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
    if (!cueSync.shouldUpdateActiveBlock || !cueSync.activeCue) {
      return;
    }
    onActiveBlockChange(cueSync.activeCue.sourceBlockId);
  }, [cueSync.activeCue, cueSync.shouldUpdateActiveBlock, onActiveBlockChange]);

  useEffect(() => {
    if (!activeBlockIdForScroll) {
      return;
    }
    const reducedMotion =
      typeof globalThis.matchMedia === "function" &&
      globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches;
    activeBlockElementRef.current?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [activeBlockIdForScroll]);

  useEffect(() => {
    persistSnapshot();
  }, [persistSnapshot]);

  useEffect(() => {
    if (theatreOpenSignal === theatreOpenSignalRef.current) {
      return;
    }
    theatreOpenSignalRef.current = theatreOpenSignal;
    openTheatre();
  }, [openTheatre, theatreOpenSignal]);

  useEffect(() => {
    if (theatreMode === "inline") {
      return;
    }
    requestAnimationFrame(() => {
      theatreRootRef.current?.focus();
    });
  }, [theatreMode]);

  useEffect(() => {
    const documentRef = typeof document === "undefined" ? null : document;
    const unsubscribe = subscribeTelepromptFullscreenChange(documentRef, () => {
      const active = isTelepromptFullscreenActive(documentRef);
      setNativeFullscreenActive(active);
      if (!active && theatreMode === "fullscreen") {
        setTheatreMode("theatre");
      }
    });
    return unsubscribe;
  }, [theatreMode]);

  const moveCue = useCallback(
    (direction: -1 | 1) => {
      setCueSyncMode("manual");
      const nextId = adjacentTelepromptBlockId(blocks, activeBlock?.id ?? activeBlockId, direction);
      if (!nextId || nextId === activeBlock?.id) {
        setStatusMessage(direction < 0 ? "Already at the first cue." : "Already at the final cue.");
        return;
      }
      onActiveBlockChange(nextId);
      persistSnapshot(returnTarget, nextId);
      setStatusMessage(direction < 0 ? "Moved to previous cue." : "Moved to next cue.");
      announcePolite(
        liveStatusMessages.cueChanged(
          telepromptCueLiveLabel(
            blocks.find((block) => block.id === nextId) ?? null,
            blocks.length,
          ),
        ),
      );
    },
    [
      activeBlock?.id,
      activeBlockId,
      announcePolite,
      blocks,
      onActiveBlockChange,
      persistSnapshot,
      returnTarget,
    ],
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
      void exitTelepromptFullscreen();
      setNativeFullscreenActive(false);
      setTheatreMode("inline");
      if (theatreMode !== "inline") {
        announcePolite(liveStatusMessages.telepromptTheatreExited());
      }
      if (target === "preview") {
        setWorkflowMenuOpen(false);
        onBackToPreview();
        return;
      }
      setWorkflowMenuOpen(false);
      onBackToReview();
    },
    [announcePolite, onBackToPreview, onBackToReview, persistSnapshot, theatreMode],
  );

  const handleCreateAndListen = useCallback(() => {
    if (!canCreate) {
      setStatusMessage("Select a ready source before creating audio.");
      return;
    }
    persistSnapshot(returnTarget);
    void exitTelepromptFullscreen();
    setNativeFullscreenActive(false);
    setTheatreMode("inline");
    if (theatreMode !== "inline") {
      announcePolite(liveStatusMessages.telepromptTheatreExited());
    }
    setWorkflowMenuOpen(false);
    onCreateAndListen();
  }, [announcePolite, canCreate, onCreateAndListen, persistSnapshot, returnTarget, theatreMode]);

  const handleOpenCinema = useCallback(() => {
    if (!canOpenCinema) {
      setStatusMessage("Create audio before opening Cinema.");
      return;
    }
    const seekSeconds = telepromptCueSeekSeconds(cueSync.activeCue);
    if (seekSeconds !== null && playbackControls.seekTo) {
      playbackControls.seekTo(seekSeconds);
      setStatusMessage("Opening Cinema at the current Teleprompt cue.");
    } else if (seekSeconds !== null && playbackControls.skipBy) {
      playbackControls.skipBy(seekSeconds - playbackCursorSec);
      setStatusMessage("Opening Cinema at the current Teleprompt cue.");
    }
    persistSnapshot(returnTarget, cueSync.activeCue?.sourceBlockId ?? activeBlock?.id ?? null);
    void exitTelepromptFullscreen();
    setNativeFullscreenActive(false);
    setTheatreMode("inline");
    if (theatreMode !== "inline") {
      announcePolite(liveStatusMessages.telepromptTheatreExited());
    }
    setWorkflowMenuOpen(false);
    onOpenCinema();
  }, [
    activeBlock?.id,
    announcePolite,
    canOpenCinema,
    cueSync.activeCue,
    onOpenCinema,
    persistSnapshot,
    playbackControls,
    playbackCursorSec,
    returnTarget,
    theatreMode,
  ]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const shortcut =
        theatreMode === "inline"
          ? resolveTelepromptShortcut(event)
          : resolveTelepromptTheatreShortcut(event);
      if (!shortcut) {
        return;
      }
      event.preventDefault();
      switch (shortcut) {
        case "exitTheatre": {
          handleExitTheatre();
          break;
        }
        case "largeText": {
          setPresetId("largeText");
          setStatusMessage("Large text presenter preset applied.");
          break;
        }
        case "operatorPreview": {
          setTheatreViewMode((currentMode) =>
            currentMode === "operator-preview" ? "manual" : "operator-preview",
          );
          setStatusMessage("Operator preview toggled.");
          break;
        }
        case "toggleHighContrast": {
          setPresetId((currentPreset) =>
            currentPreset === "highContrast" ? "standard" : "highContrast",
          );
          setStatusMessage("High contrast presenter preset toggled.");
          break;
        }
        case "toggleMirror": {
          setMirrorMode((currentMirrorMode) => !currentMirrorMode);
          setStatusMessage("Mirror mode toggled.");
          break;
        }
        case "toggleNativeFullscreen": {
          handleRequestNativeFullscreen();
          break;
        }
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
  }, [
    handleCreateAndListen,
    handleExitTheatre,
    handlePlayPause,
    handleRequestNativeFullscreen,
    handleReturn,
    moveCue,
    theatreMode,
  ]);

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
            <TelepromptContextFact label="Cue sync" value={cueSync.statusLabel} />
            <TelepromptContextFact
              label="Cue timing"
              value={
                cueSync.activeCue
                  ? `${cueSync.activeCue.timingSource} / word ${cueSync.activeCue.currentWordIndex.toString()}`
                  : "No active timing cue"
              }
            />
          </dl>
        ),
        detail: cueSync.detail,
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
    <>
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
            sourceLifecycle={sourceLifecycle}
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
              <TelepromptCueSync
                mode={cueSyncMode}
                playbackAvailable={playbackControls.isAvailable}
                sync={cueSync}
                onModeChange={(nextMode) => {
                  setCueSyncMode(nextMode);
                  setStatusMessage(`${cueSyncModeLabel(nextMode)} selected.`);
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <Button
                data-testid="ui-action-teleprompt-enter-theatre"
                onClick={openTheatre}
                size="sm"
                variant="primary"
              >
                Enter Theatre
              </Button>
              <Button
                data-testid="ui-action-teleprompt-previous-cue"
                data-ui-noop-reason={previousCueNoopReason}
                disabled={activeBlockIndex < 0}
                disabledReason={activeBlockIndex < 0 ? "No cue is selected." : undefined}
                onClick={() => {
                  moveCue(-1);
                }}
                size="sm"
                variant="secondary"
              >
                Previous cue
              </Button>
              <Button
                {...playbackActionDataAttributes("telepromptPlay", playbackLifecycle, {
                  primary: true,
                })}
                aria-label={
                  playbackControls.isPlaying
                    ? "Pause Cue"
                    : playbackActionAriaLabel("telepromptPlay", { lifecycle: playbackLifecycle })
                }
                data-testid="ui-action-teleprompt-play-pause"
                disabled={!playbackControls.isAvailable}
                disabledReason={cuePlaybackDisabledReason}
                onClick={handlePlayPause}
                size="sm"
                variant="primary"
              >
                {playbackControls.isPlaying ? "Pause Cue" : playbackActionLabel("telepromptPlay")}
              </Button>
              <Button
                {...playbackActionDataAttributes("telepromptPlay", playbackLifecycle)}
                data-testid="ui-action-teleprompt-restart"
                disabled={!playbackControls.isAvailable}
                disabledReason={cuePlaybackDisabledReason}
                onClick={handleRestart}
                size="sm"
                variant="secondary"
              >
                Restart
              </Button>
              <Button
                data-testid="ui-action-teleprompt-next-cue"
                data-ui-noop-reason={nextCueNoopReason}
                disabled={activeBlockIndex < 0}
                disabledReason={activeBlockIndex < 0 ? "No cue is selected." : undefined}
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
                  data-testid="ui-action-teleprompt-workflow-theatre"
                  onClick={() => {
                    setWorkflowMenuOpen(false);
                    openTheatre();
                  }}
                  size="sm"
                  variant="primary"
                >
                  Open Theatre
                </Button>
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
                  {...playbackActionDataAttributes("openCinema", playbackLifecycle)}
                  data-testid={workspaceStageActionTestId("openCinema")}
                  disabled={!canOpenCinema}
                  disabledReason={openCinemaDisabledReason}
                  onClick={handleOpenCinema}
                  size="sm"
                  variant={telepromptSecondaryActionVariant("open-cinema")}
                >
                  {workspaceStageActionLabel("openCinema")}
                </Button>
                <Button
                  {...playbackActionDataAttributes("createAndListen", playbackLifecycle)}
                  {...providerCapabilityDataAttributes("tts", createAndListenCapabilityReason)}
                  aria-label={playbackActionAriaLabel("createAndListen", {
                    createScope: "current-scope",
                  })}
                  data-testid={workspaceStageActionTestId("createAndListen")}
                  disabled={!canCreate}
                  disabledReason={createAndListenDisabledReason}
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
                Cue highlight style: {effectiveSettings.effectStyle === "spark" ? "Guided" : "Bold"}
                .{` ${preset.description}`}
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
                    currentWordIndex={
                      block.id === activeBlock?.id ? cueSync.activeCue?.currentWordIndex : null
                    }
                    highContrast={presetId === "highContrast"}
                    key={block.id}
                    presetClassName={preset.scriptClassName}
                    activeRef={block.id === activeBlock?.id ? activeBlockElementRef : undefined}
                    settings={effectiveSettings}
                    onSelect={() => {
                      setCueSyncMode("manual");
                      onActiveBlockChange(block.id);
                      persistSnapshot(returnTarget, block.id);
                      setStatusMessage(`Selected cue ${block.index.toString()}.`);
                      announcePolite(
                        liveStatusMessages.cueChanged(telepromptCueLiveLabel(block, blocks.length)),
                      );
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
          aria-live="polite"
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
      {theatreMode === "inline" ? null : (
        <TelepromptTheatre
          activeBlock={activeBlock}
          activeBlockIndex={activeBlockIndex}
          audioProgressPercent={audioProgressPercent}
          canCreate={canCreate}
          canOpenCinema={canOpenCinema}
          createAndListenCapabilityReason={createAndListenCapabilityReason}
          createAndListenDisabledReason={createAndListenDisabledReason}
          cuePlaybackDisabledReason={cuePlaybackDisabledReason}
          cueSyncDetail={cueSync.detail}
          cueSyncMode={cueSyncMode}
          cueSyncStatusLabel={cueSync.statusLabel}
          currentCueText={cueSync.activeCue?.spokenText ?? cue?.currentText ?? null}
          currentWordIndex={cueSync.activeCue?.currentWordIndex ?? null}
          fullscreenActive={nativeFullscreenActive}
          fullscreenAvailability={fullscreenAvailability}
          mirrorMode={mirrorMode}
          mode={theatreMode}
          nativeFullscreenDisabledReason={fullscreenAvailability.reason ?? undefined}
          nextBlock={nextBlock}
          openCinemaDisabledReason={openCinemaDisabledReason}
          playbackControlsAvailable={playbackControls.isAvailable}
          playbackControlsPlaying={playbackControls.isPlaying}
          playbackLifecycle={playbackLifecycle}
          presetId={presetId}
          ref={theatreRootRef}
          summary={theatreSummary}
          theatreViewMode={theatreViewMode}
          onBackToPreview={() => {
            handleReturn("preview");
          }}
          onBackToReview={() => {
            handleReturn("review");
          }}
          onCreateAndListen={handleCreateAndListen}
          onExitTheatre={handleExitTheatre}
          onMoveCue={moveCue}
          onOpenCinema={handleOpenCinema}
          onPresetChange={(id) => {
            setPresetId(id);
            setStatusMessage(`${telepromptPreset(id).label} presenter preset applied.`);
          }}
          onRequestNativeFullscreen={handleRequestNativeFullscreen}
          onRestart={handleRestart}
          onToggleMirror={(checked) => {
            setMirrorMode(checked);
            setStatusMessage(checked ? "Mirror mode enabled." : "Mirror mode disabled.");
          }}
          onToggleOperatorPreview={() => {
            setTheatreViewMode((currentMode) =>
              currentMode === "operator-preview" ? "manual" : "operator-preview",
            );
            setStatusMessage("Operator preview toggled.");
          }}
          onTogglePlayback={handlePlayPause}
        />
      )}
    </>
  );
}

function TelepromptScriptBlock({
  activeRef,
  active,
  block,
  cueText,
  currentWordIndex,
  highContrast,
  presetClassName,
  settings,
  onSelect,
}: Readonly<{
  activeRef?: RefObject<HTMLDivElement | null>;
  active: boolean;
  block: RevisionBlock;
  cueText: string | null;
  currentWordIndex?: number | null;
  highContrast: boolean;
  presetClassName: string;
  settings: TeleprompterHighlightSettings;
  onSelect: () => void;
}>) {
  const spokenText = block.spokenText || block.text;
  const shouldRenderCue =
    active &&
    ((typeof currentWordIndex === "number" && currentWordIndex >= 0) ||
      Boolean(cueText && normalizeCueText(cueText) === normalizeCueText(spokenText)));
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
          <TelepromptCueWords
            currentWordIndex={currentWordIndex}
            settings={settings}
            text={spokenText}
          />
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
  currentWordIndex,
  settings,
  text,
}: Readonly<{
  currentWordIndex?: number | null;
  settings: TeleprompterHighlightSettings;
  text: string;
}>) {
  const tokens = splitTeleprompterTokens(text);
  const cues =
    typeof currentWordIndex === "number" && currentWordIndex >= 0
      ? buildTelepromptWordCuesFromIndex(tokens, currentWordIndex, settings)
      : buildTeleprompterWordCues(
          text,
          settings.leadMs,
          estimateTelepromptDurationMs(countTelepromptWords(text)),
          settings,
        );
  const cueByIndex = new Map(cues.map((cue) => [cue.wordIndex, cue]));
  return (
    <HighlightRenderer
      activeWordIndex={currentWordIndex}
      classNameForWord={({ token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return `teleprompter-word teleprompter-word--${cue?.state ?? "idle"} rounded px-1 py-0.5`;
      }}
      dataEffect="classic"
      mode="word"
      surface="teleprompt"
      text={text}
      wordStyle={({ token }) => {
        const cue = cueByIndex.get(token.wordIndex);
        return {
          "--teleprompter-accent": "#f97316",
          "--teleprompter-intensity": String(cue?.intensity ?? 0),
        } as CSSProperties;
      }}
    />
  );
}

function buildTelepromptWordCuesFromIndex(
  tokens: readonly TeleprompterToken[],
  currentWordIndex: number,
  settings: TeleprompterHighlightSettings,
): TeleprompterWordCue[] {
  const wordTokens = tokens.filter((token) => token.kind === "word");
  return wordTokens.map((token) => {
    const wordIndex = token.wordIndex ?? 0;
    if (wordIndex === currentWordIndex) {
      return {
        endMs: 1,
        intensity: settings.activeIntensity,
        progress: 0.5,
        startMs: 0,
        state: "active",
        wordIndex,
      };
    }
    if (wordIndex < currentWordIndex) {
      return {
        endMs: 1,
        intensity: settings.spokenIntensity,
        progress: 1,
        startMs: 0,
        state: "spoken",
        wordIndex,
      };
    }
    if (wordIndex <= currentWordIndex + 2) {
      return {
        endMs: 1,
        intensity: settings.upcomingIntensity,
        progress: 0,
        startMs: 0,
        state: "upcoming",
        wordIndex,
      };
    }
    return {
      endMs: 1,
      intensity: 0,
      progress: 0,
      startMs: 0,
      state: "idle",
      wordIndex,
    };
  });
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

function cueSyncModeLabel(mode: TelepromptCueSyncMode): string {
  switch (mode) {
    case "audio-follow": {
      return "Audio-follow cue sync";
    }
    case "manual": {
      return "Manual cue sync";
    }
    case "recording-rehearsal": {
      return "Recording rehearsal cue sync";
    }
    case "review-playback": {
      return "Review playback cue sync";
    }
  }
}

function telepromptCueLiveLabel(block: RevisionBlock | null, totalBlocks: number): string {
  if (!block) {
    return "the selected cue";
  }
  return `${block.index.toString()} of ${totalBlocks.toString()}`;
}

function normalizeCueText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}
