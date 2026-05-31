import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildTeleprompterCue, type TeleprompterHighlightSettings } from "../../teleprompter";
import type { HighlightMap, VoiceJob } from "../../types";
import { audioSource } from "../../api";
import { useAudioWaveformBars } from "../../audioWaveform";
import { Button, Panel, SegmentedControl, StatusChip, Toggle, cx } from "../../design";
import { ContextPanel, type ContextPanelTabId } from "../context-panel";
import {
  readAlongTimingStateFromRuntime,
  type HighlightMapV2,
  type ReadAlongCueRole,
} from "../readalong";
import { liveStatusMessages, useLiveStatus } from "../accessibility";
import { nextReaderPlaybackRate } from "../reader-accessibility";
import { useFocusedTheatreControls } from "../theatre/FocusedTheatreShell";
import type { RevisionBlock } from "../revision";
import { HeaderContextSummary } from "../header";
import {
  generatedAudioLifecycleFromJob,
  LocalizedPlaybackToolbar,
  playbackActionAriaLabel,
  playbackActionDataAttributes,
  playbackActionDisabledReason,
  playbackActionLabel,
  telepromptSecondaryActionVariant,
  type LocalizedPlaybackToolbarModel,
} from "../playback";
import { providerCapabilityDataAttributes } from "../provider-capabilities";
import { workspaceStageActionLabel, workspaceStageActionTestId } from "../workspace";
import type {
  WorkspaceLayoutSlotDensity,
  WorkspaceReturnStage,
  WorkspaceSourceType,
} from "../workspace";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import {
  TELEPROMPT_PRESET_IDS,
  telepromptPreset,
  telepromptPresetHighlightSettings,
  type TelepromptPresetId,
} from "./telepromptPresets";
import {
  normalizeTelepromptTheatreSettings,
  type TelepromptTheatreSettings,
} from "./telepromptTheatreSettings";
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
import {
  buildTelepromptCueTimeline,
  resolveTelepromptCueSync,
  telepromptCueSeekSeconds,
  type TelepromptCueSyncMode,
} from "./telepromptCueTimeline";
import {
  TelepromptCurrentCueStage,
  TelepromptScriptBlock,
  TelepromptBlockPreview,
  telepromptCueLiveLabel,
} from "./telepromptStudioComponents";
import { buildTelepromptContextTabs } from "./telepromptStudioHelpers";
import {
  buildTelepromptWorkModeModel,
  TELEPROMPT_WORK_MODES,
  type TelepromptWorkMode,
} from "./telepromptStudioModel";
import {
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
  readonly playbackRate: number;
  readonly restart: () => Promise<void> | void;
  readonly seekTo?: (seconds: number) => void;
  readonly setPlaybackRate?: (rate: number) => void;
  readonly skipBy?: (seconds: number) => void;
}

export interface TelepromptStudioProps {
  readonly activeBlockId: string | null;
  readonly blocks: RevisionBlock[];
  readonly canCreate: boolean;
  readonly canOpenCinema: boolean;
  readonly createAndListenCapabilityReason?: string;
  readonly createAndListenDisabledReason?: string;
  readonly contextInspectorDensity: WorkspaceLayoutSlotDensity;
  readonly isPlaybackActive: boolean;
  readonly job: VoiceJob | null;
  readonly highlightMap?: HighlightMap | null;
  readonly highlightMapV2?: HighlightMapV2 | null;
  readonly playbackControls: TelepromptPlaybackController;
  readonly playbackCursorSec: number;
  readonly policyProfile: string;
  readonly projectId: string;
  readonly rememberReturnMemory: boolean;
  readonly returnStage: WorkspaceReturnStage;
  readonly scopeLabel: string;
  readonly settings: TeleprompterHighlightSettings;
  readonly theatreSettings: TelepromptTheatreSettings;
  readonly theatreSettingsMemoryEnabled: boolean;
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
  readonly onExitTheatreStage?: () => void;
  readonly onOpenCinema: () => void;
  readonly onOpenTheatreStage?: () => void;
  readonly onTheatreSettingsChange: (settings: TelepromptTheatreSettings) => void;
}

function findTelepromptBlockById(
  blocks: readonly RevisionBlock[],
  blockId: string | null,
): RevisionBlock | null {
  if (!blockId) {
    return null;
  }
  return blocks.find((block) => block.id === blockId) ?? null;
}

function telepromptTheatreSettingsForWorkspaceLayout(
  settings: TelepromptTheatreSettings,
): TelepromptTheatreSettings {
  return settings;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function TelepromptStudio({
  activeBlockId,
  blocks,
  canCreate,
  canOpenCinema,
  createAndListenCapabilityReason,
  createAndListenDisabledReason: externalCreateAndListenDisabledReason,
  contextInspectorDensity,
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
  theatreSettings,
  theatreSettingsMemoryEnabled,
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
  onExitTheatreStage,
  onOpenCinema,
  onOpenTheatreStage,
  onTheatreSettingsChange,
}: Readonly<TelepromptStudioProps>) {
  const [activeContextTab, setActiveContextTab] = useState<ContextPanelTabId>("overview");
  const [presetId, setPresetId] = useState<TelepromptPresetId>("standard");
  const [theatreMode, setTheatreMode] = useState<TelepromptTheatreMode>("inline");
  const [theatreViewMode, setTheatreViewMode] = useState<TelepromptTheatreViewMode>("manual");
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);
  const theatreControls = useFocusedTheatreControls({
    active: theatreMode !== "inline",
    initialVisible: false,
  });
  const [fullscreenAvailability, setFullscreenAvailability] = useState(() =>
    telepromptFullscreenAvailability(),
  );
  const [nativeFullscreenActive, setNativeFullscreenActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Teleprompt Studio ready.");
  const { announcePolite } = useLiveStatus();
  const [cueDrawerOpen, setCueDrawerOpen] = useState(false);
  const [workMode, setWorkMode] = useState<TelepromptWorkMode>("audio-follow");
  const [cueSyncMode, setCueSyncMode] = useState<TelepromptCueSyncMode>("audio-follow");
  const scriptScrollerRef = useRef<HTMLDivElement | null>(null);
  const activeBlockElementRef = useRef<HTMLDivElement | null>(null);
  const theatreRootRef = useRef<HTMLDivElement | null>(null);
  const theatreOpenSignalRef = useRef(0);
  const theatreReturnFocusRef = useRef<HTMLElement | null>(null);
  const theatreUsesWorkspaceStageRef = useRef(false);
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
  const waveformBars = useAudioWaveformBars(job ? audioSource(job, { partial: true }) : "", 56);
  const workModeModel = useMemo(
    () =>
      buildTelepromptWorkModeModel({
        audioProgressPercent,
        mode: workMode,
        playbackAvailable: playbackControls.isAvailable,
        playbackPlaying: playbackControls.isPlaying || isPlaybackActive,
      }),
    [
      audioProgressPercent,
      isPlaybackActive,
      playbackControls.isAvailable,
      playbackControls.isPlaying,
      workMode,
    ],
  );
  const workModeOptions = useMemo(
    () =>
      TELEPROMPT_WORK_MODES.map((mode) => {
        const optionModel = buildTelepromptWorkModeModel({
          audioProgressPercent,
          mode,
          playbackAvailable: playbackControls.isAvailable,
          playbackPlaying: playbackControls.isPlaying || isPlaybackActive,
        });
        return {
          disabled: Boolean(optionModel.disabledReason && mode !== workMode),
          disabledReason: optionModel.disabledReason,
          label: optionModel.label,
          testId: `ui-action-teleprompt-work-mode-${mode}`,
          value: mode,
        };
      }),
    [
      audioProgressPercent,
      isPlaybackActive,
      playbackControls.isAvailable,
      playbackControls.isPlaying,
      workMode,
    ],
  );
  const activeCueCurrentSourceWordId: string | null =
    typeof cueSync.activeCue?.currentSourceWordId === "string"
      ? cueSync.activeCue.currentSourceWordId
      : null;
  const activeCueCurrentWordTiming = cueSync.activeCue?.wordTimings.find(
    (word) => word.wordIndex === cueSync.activeCue?.currentWordIndex,
  );
  const activeCueTimingState = readAlongTimingStateFromRuntime({
    confidence: activeCueCurrentWordTiming?.confidence ?? cueSync.activeCue?.confidence ?? null,
    timingLevel: cueSync.activeCue?.timingLevel ?? null,
    timingSource: cueSync.activeCue?.timingSource ?? cueTimeline.source,
  });
  const telepromptTheatreSyncDebug = useMemo(
    () => ({
      activeCueId: cueSync.activeCue?.cueId ?? "",
      activeSourceWordId: activeCueCurrentSourceWordId ?? "",
      activeWordIndex: cueSync.activeCue?.currentWordIndex ?? -1,
      activeWordText:
        activeCueCurrentWordTiming?.text ??
        (cueSync.activeCue?.currentWordIndex !== undefined &&
        cueSync.activeCue.currentWordIndex >= 0
          ? String(cueSync.activeCue.currentWordIndex)
          : ""),
      jobId: job?.id ?? "",
      playbackCursorSec,
      runtimeState: cueSync.statusLabel,
      syncMode: cueSyncMode,
      timingSource: cueTimeline.source,
    }),
    [
      activeCueCurrentSourceWordId,
      activeCueCurrentWordTiming?.text,
      cueSync.activeCue?.cueId,
      cueSync.activeCue?.currentWordIndex,
      cueSync.statusLabel,
      cueSyncMode,
      cueTimeline.source,
      job?.id,
      playbackCursorSec,
    ],
  );
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
      const snapshotBlock = findTelepromptBlockById(blocks, nextBlockId);
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

  const updateTheatreSettings = useCallback(
    (patch: Partial<TelepromptTheatreSettings>) => {
      onTheatreSettingsChange(normalizeTelepromptTheatreSettings({ ...theatreSettings, ...patch }));
    },
    [onTheatreSettingsChange, theatreSettings],
  );

  const toggleOperatorPanel = useCallback(() => {
    updateTheatreSettings({
      operatorPanelVisible: !theatreSettings.operatorPanelVisible,
      syncOverlayVisible: theatreSettings.operatorPanelVisible
        ? theatreSettings.syncOverlayVisible
        : true,
    });
    setTheatreViewMode("operator-preview");
    setStatusMessage(
      theatreSettings.operatorPanelVisible ? "Operator panel hidden." : "Operator panel shown.",
    );
  }, [
    theatreSettings.operatorPanelVisible,
    theatreSettings.syncOverlayVisible,
    updateTheatreSettings,
  ]);

  const activateTheatre = useCallback(() => {
    if (typeof document !== "undefined" && document.activeElement instanceof HTMLElement) {
      theatreReturnFocusRef.current = document.activeElement;
    }
    persistSnapshot(returnTarget);
    setFullscreenAvailability(telepromptFullscreenAvailability());
    setTheatreMode("theatre");
    setStatusMessage("Teleprompt Theatre opened.");
    announcePolite(liveStatusMessages.telepromptTheatreEntered());
  }, [announcePolite, persistSnapshot, returnTarget]);

  const openTheatre = useCallback(() => {
    if (onOpenTheatreStage && playbackControls.isAvailable) {
      theatreUsesWorkspaceStageRef.current = true;
      onOpenTheatreStage();
      return;
    }
    theatreUsesWorkspaceStageRef.current = false;
    activateTheatre();
  }, [activateTheatre, onOpenTheatreStage, playbackControls.isAvailable]);

  const handleExitTheatre = useCallback(() => {
    const shouldExitWorkspaceStage = theatreUsesWorkspaceStageRef.current;
    theatreUsesWorkspaceStageRef.current = false;
    void exitTelepromptFullscreen();
    setNativeFullscreenActive(false);
    setCountdownRemaining(null);
    setTheatreMode("inline");
    setStatusMessage("Exited Teleprompt Theatre.");
    announcePolite(liveStatusMessages.telepromptTheatreExited());
    requestAnimationFrame(() => {
      theatreReturnFocusRef.current?.focus();
      theatreReturnFocusRef.current = null;
    });
    if (shouldExitWorkspaceStage) {
      onExitTheatreStage?.();
    }
  }, [announcePolite, onExitTheatreStage]);

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
    const activeBlockStillExists = findTelepromptBlockById(blocks, activeBlockId) !== null;
    if (!activeBlockStillExists && snapshot?.activeBlockId) {
      const restoredBlock = findTelepromptBlockById(blocks, snapshot.activeBlockId);
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
    theatreUsesWorkspaceStageRef.current = true;
    activateTheatre();
  }, [activateTheatre, theatreOpenSignal]);

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
      setWorkMode("rehearsal");
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
          telepromptCueLiveLabel(findTelepromptBlockById(blocks, nextId), blocks.length),
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

  const handleTheatrePlayPause = useCallback(() => {
    if (
      playbackControls.isPlaying ||
      !playbackControls.isAvailable ||
      theatreSettings.countdownSeconds === 0
    ) {
      setCountdownRemaining(null);
      handlePlayPause();
      return;
    }
    setCountdownRemaining(theatreSettings.countdownSeconds);
    setStatusMessage(
      `Playback countdown started: ${theatreSettings.countdownSeconds.toString()} seconds.`,
    );
  }, [
    handlePlayPause,
    playbackControls.isAvailable,
    playbackControls.isPlaying,
    theatreSettings.countdownSeconds,
  ]);

  useEffect(() => {
    if (countdownRemaining === null) {
      return;
    }
    if (countdownRemaining <= 0) {
      setCountdownRemaining(null);
      if (playbackControls.isAvailable && !playbackControls.isPlaying) {
        void playbackControls.play();
        setStatusMessage("Playback started.");
      }
      return;
    }
    const timerId = globalThis.setTimeout(() => {
      setCountdownRemaining((current) => (current === null ? null : Math.max(0, current - 1)));
    }, 1000);
    return () => {
      globalThis.clearTimeout(timerId);
    };
  }, [countdownRemaining, playbackControls]);

  const handleJumpToCurrentAudio = useCallback(() => {
    setWorkMode("audio-follow");
    setCueSyncMode("audio-follow");
    const sourceBlockId = cueSync.activeCue?.sourceBlockId;
    if (!sourceBlockId) {
      setStatusMessage("Current audio cue is not available yet.");
      return;
    }
    onActiveBlockChange(sourceBlockId);
    persistSnapshot(returnTarget, sourceBlockId);
    setStatusMessage("Jumped to the current audio cue.");
  }, [cueSync.activeCue?.sourceBlockId, onActiveBlockChange, persistSnapshot, returnTarget]);

  const handleRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      setStatusMessage("Playback controls are available after Create & Listen.");
      return;
    }
    void playbackControls.restart();
    setStatusMessage("Playback restarted.");
  }, [playbackControls]);

  const adjustPlaybackRate = useCallback(
    (direction: -1 | 1) => {
      if (!playbackControls.setPlaybackRate) {
        setStatusMessage("Playback speed is available after generated audio is loaded.");
        return;
      }
      const nextRate = nextReaderPlaybackRate(playbackControls.playbackRate, direction);
      playbackControls.setPlaybackRate(nextRate);
      setStatusMessage(`Playback speed set to ${nextRate.toFixed(nextRate === 1 ? 0 : 2)}x.`);
    },
    [playbackControls],
  );

  const selectWorkMode = useCallback(
    (nextMode: TelepromptWorkMode) => {
      const nextModel = buildTelepromptWorkModeModel({
        audioProgressPercent,
        mode: nextMode,
        playbackAvailable: playbackControls.isAvailable,
        playbackPlaying: playbackControls.isPlaying || isPlaybackActive,
      });
      if (nextModel.disabledReason) {
        setStatusMessage(nextModel.disabledReason);
        return;
      }
      setWorkMode(nextMode);
      setCueSyncMode(nextModel.syncMode);
      setStatusMessage(`${nextModel.label} mode selected.`);
    },
    [
      audioProgressPercent,
      isPlaybackActive,
      playbackControls.isAvailable,
      playbackControls.isPlaying,
    ],
  );

  const handleReturn = useCallback(
    (target: TelepromptReturnTarget) => {
      persistSnapshot(target);
      void exitTelepromptFullscreen();
      setNativeFullscreenActive(false);
      setCountdownRemaining(null);
      setTheatreMode("inline");
      if (theatreMode !== "inline") {
        announcePolite(liveStatusMessages.telepromptTheatreExited());
      }
      if (target === "preview") {
        setCueDrawerOpen(false);
        onBackToPreview();
        return;
      }
      setCueDrawerOpen(false);
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
    setCountdownRemaining(null);
    setTheatreMode("inline");
    if (theatreMode !== "inline") {
      announcePolite(liveStatusMessages.telepromptTheatreExited());
    }
    setCueDrawerOpen(false);
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
    setCountdownRemaining(null);
    setTheatreMode("inline");
    if (theatreMode !== "inline") {
      announcePolite(liveStatusMessages.telepromptTheatreExited());
    }
    setCueDrawerOpen(false);
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
  const telepromptDurationMs = job?.durationMs ?? estimatedDurationMs;
  const telepromptPlaybackToolbar: LocalizedPlaybackToolbarModel = {
    activeDetail: activeBlock
      ? `Cue ${activeBlock.index.toString()} of ${Math.max(1, blocks.length).toString()} · ${cueSync.statusLabel}`
      : scopeLabel,
    activeLabel: activeBlock?.label ?? "No active cue",
    jumpToAudio: {
      ariaKeyShortcuts: "Alt+J",
      disabled: !playbackControls.isAvailable || !cueSync.activeCue,
      disabledReason:
        cuePlaybackDisabledReason ??
        (cueSync.activeCue ? undefined : "Current audio cue is not available yet."),
      label: "Jump to Audio",
      onClick: handleJumpToCurrentAudio,
      testId: "ui-action-teleprompt-local-jump-audio",
    },
    next: {
      ariaKeyShortcuts: "ArrowRight ArrowDown",
      disabled: nextCueUnavailable,
      disabledReason: nextCueNoopReason ?? "No cue is selected.",
      label: "Next cue",
      onClick: () => {
        moveCue(1);
      },
      testId: "ui-action-teleprompt-local-next-cue",
    },
    playPause: {
      ariaKeyShortcuts: "Space K",
      ariaLabel: playbackControls.isPlaying
        ? "Pause Cue"
        : playbackActionAriaLabel("telepromptPlay", { lifecycle: playbackLifecycle }),
      dataAttributes: playbackActionDataAttributes("telepromptPlay", playbackLifecycle, {
        primary: true,
      }),
      disabled: !playbackControls.isAvailable,
      disabledReason: cuePlaybackDisabledReason,
      label: playbackControls.isPlaying ? "Pause Cue" : playbackActionLabel("telepromptPlay"),
      primary: true,
      onClick: handlePlayPause,
      testId: "ui-action-teleprompt-local-play-pause",
    },
    previous: {
      ariaKeyShortcuts: "ArrowLeft ArrowUp",
      disabled: previousCueUnavailable,
      disabledReason: previousCueNoopReason ?? "No cue is selected.",
      label: "Previous cue",
      onClick: () => {
        moveCue(-1);
      },
      testId: "ui-action-teleprompt-local-previous-cue",
    },
    progress: {
      currentLabel: formatTelepromptDuration(playbackCursorSec * 1000),
      durationLabel:
        telepromptDurationMs > 0 ? formatTelepromptDuration(telepromptDurationMs) : "--:--",
      ratio:
        telepromptDurationMs > 0
          ? Math.max(0, Math.min(1, (playbackCursorSec * 1000) / telepromptDurationMs))
          : 0,
      waveformBars,
    },
    restart: {
      ariaKeyShortcuts: "Home",
      dataAttributes: playbackActionDataAttributes("telepromptPlay", playbackLifecycle),
      disabled: !playbackControls.isAvailable,
      disabledReason: cuePlaybackDisabledReason,
      label: "Restart",
      onClick: handleRestart,
      testId: "ui-action-teleprompt-local-restart",
    },
    speed: {
      ariaKeyShortcuts: "[ ]",
      disabled: !playbackControls.setPlaybackRate,
      disabledReason: playbackControls.setPlaybackRate
        ? undefined
        : "Playback speed is available after generated audio is loaded.",
      testId: "ui-action-teleprompt-local-speed",
      value: playbackControls.playbackRate,
      onChange: playbackControls.setPlaybackRate,
    },
    stage: "teleprompt",
    statusLabel: playbackStatusLabel,
    testId: "localized-teleprompt-playback-toolbar",
  };

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
          toggleOperatorPanel();
          theatreControls.revealControls();
          break;
        }
        case "toggleControls": {
          theatreControls.toggleControls();
          setStatusMessage(
            theatreControls.controlsVisible
              ? "Theatre controls hidden."
              : "Theatre controls shown.",
          );
          break;
        }
        case "jumpCurrentAudio": {
          handleJumpToCurrentAudio();
          break;
        }
        case "restart": {
          handleRestart();
          break;
        }
        case "speedDown": {
          adjustPlaybackRate(-1);
          break;
        }
        case "speedUp": {
          adjustPlaybackRate(1);
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
          updateTheatreSettings({ mirrorMode: !theatreSettings.mirrorMode });
          setStatusMessage(
            theatreSettings.mirrorMode ? "Mirror mode disabled." : "Mirror mode enabled.",
          );
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
          if (theatreMode === "inline") {
            handlePlayPause();
          } else {
            handleTheatrePlayPause();
          }
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
    handleJumpToCurrentAudio,
    handlePlayPause,
    handleRequestNativeFullscreen,
    handleRestart,
    handleReturn,
    handleTheatrePlayPause,
    moveCue,
    adjustPlaybackRate,
    theatreSettings.mirrorMode,
    theatreMode,
    theatreControls,
    toggleOperatorPanel,
    updateTheatreSettings,
  ]);

  const contextTabs = buildTelepromptContextTabs({
    activeBlock,
    cueSegmentCount: cue?.segmentCount ?? null,
    cueSegmentIndex: cue?.segmentIndex ?? null,
    cueSync,
    cueSyncStatusLabel: cueSync.statusLabel,
    playbackAvailable: playbackControls.isAvailable,
    playbackStatusLabel,
    policyProfile,
    returnTarget,
    scopeLabel,
    sourceLabel,
    sourceMeta,
    voiceProfile,
  });
  const showTelepromptContextPanel = contextInspectorDensity === "pinned";
  const effectiveTheatreSettings = telepromptTheatreSettingsForWorkspaceLayout(theatreSettings);
  const theatrePresetId = presetId === "standard" ? "highContrast" : presetId;
  const cuePositionLabel = activeBlock
    ? `Cue ${activeBlock.index.toString()} of ${Math.max(1, blocks.length).toString()}`
    : "No cue selected";
  const audioPlaying = playbackControls.isPlaying || isPlaybackActive;
  let audioStatusLabel = "Audio missing";
  if (playbackControls.isAvailable) {
    audioStatusLabel = audioPlaying ? "Audio playing" : "Audio ready";
  }
  const audioStatusTone = playbackControls.isAvailable ? "success" : "warning";

  return (
    <>
      <Panel
        className="grid gap-3 p-4"
        data-teleprompt-work-mode={workMode}
        data-testid="teleprompt-studio"
        variant="raised"
      >
        <section
          className="flex min-w-0 flex-col gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 vs-border lg:flex-row lg:items-center lg:justify-between"
          data-testid="teleprompt-source-strip"
        >
          <HeaderContextSummary
            className="flex-1"
            density="compact"
            inlineSummary={false}
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
            variant="bar"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <StatusChip tone="neutral">{totalWords.toLocaleString()} words</StatusChip>
            <StatusChip tone="neutral">{formatTelepromptDuration(estimatedDurationMs)}</StatusChip>
            <StatusChip tone="pinned">{cuePositionLabel}</StatusChip>
          </div>
        </section>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
          <TelepromptCurrentCueStage
            activeRef={activeBlockElementRef}
            audioStatusLabel={audioStatusLabel}
            audioStatusTone={audioStatusTone}
            block={activeBlock}
            cuePositionLabel={cuePositionLabel}
            cueProgressPercent={cueProgressPercent}
            cueText={cue?.currentText ?? null}
            currentWordIndex={cueSync.activeCue?.currentWordIndex ?? null}
            highContrast={presetId === "highContrast"}
            mirrorMode={theatreSettings.mirrorMode}
            settings={effectiveSettings}
            textClassName={telepromptStageTextClassName(presetId)}
            timingState={activeCueTimingState}
            wordSpacing={preset.wordSpacing}
            workModeDataAttributes={workModeModel.dataAttributes}
            workModeDetail={workModeModel.detail}
            workModeLabel={workModeModel.label}
            workModeTone={workModeModel.tone}
          />
          <aside className="sticky top-3 z-10 grid gap-3 self-start">
            <LocalizedPlaybackToolbar
              model={{ ...telepromptPlaybackToolbar, variant: "compact" }}
            />
            <div className="grid gap-3 rounded-lg border bg-[var(--vs-surface)] p-3 shadow-sm vs-border">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
                    Performance
                  </p>
                  <p className="mt-1 text-xs font-semibold">{workModeModel.label}</p>
                </div>
                <Button
                  data-testid="ui-action-teleprompt-enter-theatre"
                  onClick={openTheatre}
                  size="sm"
                  variant="primary"
                >
                  Enter Theatre
                </Button>
              </div>
              <SegmentedControl
                ariaLabel="Teleprompt work mode"
                columns={4}
                options={workModeOptions}
                value={workMode}
                onChange={selectWorkMode}
              />
              <div className="grid gap-3">
                <SegmentedControl
                  ariaLabel="Teleprompt accessibility preset"
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
                  checked={theatreSettings.mirrorMode}
                  data-testid="ui-action-teleprompt-mirror"
                  detail="Flip the script for mirrored recording rigs."
                  label="Mirror mode"
                  onChange={(checked) => {
                    updateTheatreSettings({ mirrorMode: checked });
                    setStatusMessage(checked ? "Mirror mode enabled." : "Mirror mode disabled.");
                  }}
                />
              </div>
              <p className="text-xs leading-5 vs-muted">
                Cue highlight style: {effectiveSettings.effectStyle === "spark" ? "Guided" : "Bold"}
                .{` ${preset.description}`}
              </p>
            </div>
          </aside>
        </div>

        <details
          className="rounded-lg border bg-[var(--vs-surface)] vs-border"
          data-testid="teleprompt-cue-drawer"
          open={cueDrawerOpen}
          onToggle={(event) => {
            setCueDrawerOpen(event.currentTarget.open);
          }}
        >
          <summary
            className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm font-semibold transition hover:text-[var(--vs-selected-text)] [&::-webkit-details-marker]:hidden"
            data-testid="ui-action-teleprompt-cue-drawer"
          >
            <span>Inspector and cue list</span>
            <span className="text-xs vs-muted">{cuePositionLabel}</span>
          </summary>
          <div className="grid gap-3 border-t p-3 vs-border xl:grid-cols-[18rem_minmax(0,1fr)]">
            <div className="grid gap-3 self-start">
              <section className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-3 vs-border">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
                  Workflow
                </p>
                <div className="grid gap-2">
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
              </section>
              <TelepromptBlockPreview block={previousBlock} label="Previous block" />
              <TelepromptBlockPreview
                block={activeBlock}
                label="Current block"
                words={activeWords}
              />
              <TelepromptBlockPreview block={nextBlock} label="Next block" />
              <section className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-3 text-xs vs-border">
                <p className="font-semibold uppercase tracking-[0.14em] vs-muted">
                  Cue diagnostics
                </p>
                <dl className="grid gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <dt className="vs-muted">Sync</dt>
                    <dd className="font-semibold">{cueSync.statusLabel}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <dt className="vs-muted">Timing</dt>
                    <dd className="font-semibold">{cueSync.source}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <dt className="vs-muted">Audio</dt>
                    <dd className="font-semibold">{audioStatusLabel}</dd>
                  </div>
                </dl>
                <p className="leading-5 vs-muted">{cueSync.detail}</p>
              </section>
            </div>
            <div
              className={cx(
                "overflow-auto rounded-md bg-[var(--vs-surface)] p-3",
                preset.shellClassName,
              )}
              data-testid="teleprompt-script-scroll"
              onScroll={() => {
                persistSnapshot();
              }}
              ref={scriptScrollerRef}
              style={{ maxHeight: "34rem" }}
            >
              <div
                className="grid gap-4"
                data-testid="teleprompt-script"
                style={{
                  transform: theatreSettings.mirrorMode ? "scaleX(-1)" : undefined,
                  wordSpacing: preset.wordSpacing,
                }}
              >
                {blocks.map((block, blockIndex) => (
                  <TelepromptScriptBlock
                    active={block.id === activeBlock?.id}
                    block={block}
                    cueRole={telepromptCueRoleForBlock({
                      activeBlockIndex,
                      block,
                      blockIndex,
                      cueSyncNextBlockId: cueSync.nextCue?.sourceBlockId ?? null,
                      cueSyncPreviousBlockId: cueSync.previousCue?.sourceBlockId ?? null,
                    })}
                    cueText={cue?.currentText ?? null}
                    currentWordIndex={
                      block.id === activeBlock?.id ? cueSync.activeCue?.currentWordIndex : null
                    }
                    highContrast={presetId === "highContrast"}
                    key={block.id}
                    presetClassName={preset.scriptClassName}
                    settings={effectiveSettings}
                    timingState={block.id === activeBlock?.id ? activeCueTimingState : "trusted"}
                    onSelect={() => {
                      setWorkMode("rehearsal");
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
          </div>
        </details>

        <output
          aria-live="polite"
          className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold vs-border"
          data-testid="teleprompt-status-message"
        >
          {statusMessage}
        </output>

        {showTelepromptContextPanel ? (
          <ContextPanel
            activeTabId={activeContextTab}
            label="Teleprompt context"
            surface="Teleprompt"
            tabs={contextTabs}
            onTabChange={setActiveContextTab}
          />
        ) : null}
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
          currentSourceWordId={activeCueCurrentSourceWordId}
          currentTimingState={activeCueTimingState}
          currentWordIndex={cueSync.activeCue?.currentWordIndex ?? null}
          fullscreenActive={nativeFullscreenActive}
          fullscreenAvailability={fullscreenAvailability}
          mode={theatreMode}
          nativeFullscreenDisabledReason={fullscreenAvailability.reason ?? undefined}
          nextBlock={nextBlock}
          openCinemaDisabledReason={openCinemaDisabledReason}
          playbackControlsAvailable={playbackControls.isAvailable}
          playbackControlsPlaying={playbackControls.isPlaying}
          playbackLifecycle={playbackLifecycle}
          playbackRate={playbackControls.playbackRate}
          presetId={theatrePresetId}
          countdownRemaining={countdownRemaining}
          previewBlocks={blocks.slice(
            Math.max(0, activeBlockIndex + 1),
            Math.max(0, activeBlockIndex + 1 + effectiveTheatreSettings.cuePreviewCount),
          )}
          ref={theatreRootRef}
          settings={effectiveTheatreSettings}
          settingsMemoryEnabled={theatreSettingsMemoryEnabled}
          summary={theatreSummary}
          syncDebug={telepromptTheatreSyncDebug}
          theatreViewMode={theatreViewMode}
          controlsVisible={theatreControls.controlsVisible}
          wordTimings={cueSync.activeCue?.wordTimings ?? []}
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
          onPlaybackRateChange={playbackControls.setPlaybackRate}
          onBlurControls={theatreControls.blurControls}
          onFocusControls={theatreControls.focusControls}
          onJumpToCurrentAudio={handleJumpToCurrentAudio}
          onPresetChange={(id) => {
            setPresetId(id);
            setStatusMessage(`${telepromptPreset(id).label} presenter preset applied.`);
          }}
          onRequestNativeFullscreen={handleRequestNativeFullscreen}
          onRestart={handleRestart}
          onRevealControls={theatreControls.revealControls}
          onToggleControls={theatreControls.toggleControls}
          onSettingsChange={onTheatreSettingsChange}
          onToggleMirror={(checked) => {
            updateTheatreSettings({ mirrorMode: checked });
            setStatusMessage(checked ? "Mirror mode enabled." : "Mirror mode disabled.");
          }}
          onToggleOperatorPreview={() => {
            toggleOperatorPanel();
          }}
          onTogglePlayback={handleTheatrePlayPause}
        />
      )}
    </>
  );
}

function telepromptStageTextClassName(presetId: TelepromptPresetId): string {
  switch (presetId) {
    case "dyslexicFriendly": {
      return "text-3xl leading-[1.7] sm:text-4xl";
    }
    case "highContrast": {
      return "text-3xl leading-[1.5] sm:text-4xl";
    }
    case "largeText": {
      return "text-4xl leading-[1.35] sm:text-5xl";
    }
    case "standard": {
      return "text-3xl leading-[1.5] sm:text-4xl";
    }
  }
}

function telepromptCueRoleForBlock({
  activeBlockIndex,
  block,
  blockIndex,
  cueSyncNextBlockId,
  cueSyncPreviousBlockId,
}: Readonly<{
  activeBlockIndex: number;
  block: RevisionBlock;
  blockIndex: number;
  cueSyncNextBlockId: string | null;
  cueSyncPreviousBlockId: string | null;
}>): ReadAlongCueRole {
  if (block.speakMode.trim().toLowerCase() === "skip" || block.status === "skipped") {
    return "skipped";
  }
  if (activeBlockIndex < 0) {
    return "unavailable";
  }
  if (blockIndex === activeBlockIndex) {
    return "current";
  }
  if (block.id === cueSyncNextBlockId || blockIndex === activeBlockIndex + 1) {
    return "next";
  }
  if (block.id === cueSyncPreviousBlockId || blockIndex < activeBlockIndex) {
    return "previous";
  }
  return "unavailable";
}
