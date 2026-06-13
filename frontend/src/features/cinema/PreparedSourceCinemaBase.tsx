import {
  Component,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { ReaderCanvasFrame } from "../../components/reader/ReaderCanvasFrame";
import { Button, fieldControlClassName, StatusChip, Toggle } from "../../design";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import { looksLikeMermaidDiagram } from "../../markdownModel";
import { hasSpeechPolicyOverrides } from "../../speechPolicy";
import type {
  CustomSpeechPolicyProfile,
  HighlightMap,
  NarrationBlock,
  PlaybackProgress,
  PreparedSource,
  SourceSpeechPolicyUpdateRequest,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  ThemeName,
  VoiceJob,
} from "../../types";
import { useReadAlongLiveStatus } from "../accessibility";
import { HeaderContextSummary } from "../header";
import { ExitIcon, SettingsIcon } from "../navigation";
import { LazyPanelFallback } from "../performance";
import { generatedAudioLifecycleFromJob } from "../playback";
import { PolicyScopeSummary, policyScopeSummary, SourcePolicyPinEditor } from "../policy";
import type { UiMemoryCinemaState } from "../preferences";
import {
  AlignmentDiagnosticsPanel,
  type AlignmentRepairContext,
  AlignmentRepairEditor,
  type AlignmentRepairMap,
  alignmentRepairMapStaleness,
  buildReadAlongSyncDebugSnapshot,
  effectiveReadAlongPreferences,
  evaluatePreparedSourceReadAlongInvariant,
  type HighlightMapV2,
  HighlightRenderer,
  parseAlignmentRepairMap,
  type ReadAlongCueRole,
  type ReadAlongHighlightMotion,
  type ReadAlongHighlightStyle,
  type ReadAlongHighlightVisualMode,
  type ReadAlongPreferences,
  type ReadAlongScrollFollow,
  type ReadAlongTimingState,
  ReadAlongWordScheduler,
  readAlongAnchorForBlock,
  readAlongAnchorForWord,
  readAlongAudioElementForJob,
  readAlongCalibrationOffsetMs,
  readAlongInvariantStatusLabel,
  readAlongPreferenceDataAttributes,
  readAlongShouldHighlightBlock,
  readAlongShouldHighlightWord,
  readAlongTimingStateFromRuntime,
  readAlongVisualModeFromRuntime,
  resolveReadAlongRuntimeSnapshot,
  type SyncDebugSourceLocator,
  scrollReadAlongAnchor,
  serializeAlignmentRepairMap,
  type WordTimeline,
  wordTimelineFromPreparedSourceHighlightMapV2,
  wordTimelineFromPreparedSourceLegacyHighlightMap,
} from "../readalong";
import {
  normalizeReaderAccessibilitySettings,
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_TEXT_SCALE_CLASS,
  type ReaderAccessibilitySettings,
  readerDataAttributes,
  readerLiveAnnouncement,
  readerScrollBehavior,
  useReaderKeyboardControls,
  useReaderModalLifecycle,
} from "../reader-accessibility";
import {
  playbackProgressForBookmark,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
  ReaderWayfindingPanel,
  readerBookmarksFromProgress,
  readerRecentPositionsFromProgress,
} from "../reader-navigation";
import {
  applyReaderTypographyPreset,
  readingSurfaceClassName,
  readingSurfaceDataAttributes,
} from "../reading-surface";
import { ReaderSettingsPopover } from "../settings/ReaderSettingsPopover";
import {
  preparedSourceLifecycleEnvelope,
  sourceSelectorOption,
} from "../source-lifecycle/sourceSelectors";
import { TEMPORARY_SOURCE_COPY } from "../temporary-source-copy";
import { WebsiteExtractionReview } from "../website-cinema/WebsiteExtractionReview";
import {
  WebsiteExtractionSummary,
  websiteExtractionQuality,
  websiteExtractionTone,
} from "../website-cinema/WebsiteExtractionSummary";
import { useCinemaFocusController } from "./CinemaFocusController";
import { CinemaFocusModeToolbar } from "./CinemaFocusModeToolbar";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import {
  buildCinemaCurrentReadingSection,
  buildCinemaInspectorPanels,
  buildCinemaInspectorSection,
  buildCinemaTemporaryInspectorSections,
  buildCinemaWayfindingSection,
  ReadAlongInvariantDebugPanel,
} from "./CinemaInspectorPanels";
import {
  type CinemaMobilePanelSpec,
  CinemaMobileSheet,
  returnFocusToCinemaReaderCanvas,
} from "./CinemaMobileSheet";
import { CinemaShell } from "./CinemaShell";
import { CinemaTheatreChrome, useCinemaTheatreController } from "./CinemaTheatre";
import { cinemaMoreActionsForContext } from "./cinemaMoreActions";
import {
  cinemaContractFromPreparedSource,
  filterCinemaHistoryProgress,
} from "./cinemaTemporarySource";
import {
  type CinemaRendererLifecycleState,
  cinemaRendererLifecycleDetail,
  deriveCinemaPlaybackState,
  deriveCinemaReadinessDisplay,
} from "./model";
import {
  PreparedSourceCinemaAudioBarsIcon,
  PreparedSourceCinemaTransport,
} from "./PreparedSourceCinemaTransport";
import { MoreIcon } from "./PreparedSourceCinemaTransportHelpers";
import { PreparedSourcePolicyNotes } from "./policy-notes/PreparedSourcePolicyNotes";
import {
  isPreparedSourceMarkdownDocument,
  type PreparedSourceCinemaKind,
  type PreparedSourceCinemaOutlineItem,
  type PreparedSourceCinemaTextSize,
  preparedSourceCinemaActiveBlock,
  preparedSourceCinemaDomain,
  preparedSourceCinemaJobMatchesSource,
  preparedSourceCinemaKind,
  preparedSourceCinemaLabel,
  preparedSourceCinemaMetrics,
  preparedSourceCinemaOutline,
  preparedSourceCinemaPrimaryBlocks,
  preparedSourceCinemaSkippedGroups,
  preparedSourceCinemaSourceHref,
  preparedSourceCinemaTitle,
  preparedSourceNarrationBlockIsSpeakable,
} from "./preparedSourceModel";
import { preparedSourceCinemaPolicyNotes } from "./preparedSourcePolicyNotes";

const PREPARED_SOURCE_CINEMA_ACCEPT =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,text/csv,application/json";

const PreparedMarkdownRenderer = lazy(() =>
  import("../../MarkdownRenderer").then((module) => ({ default: module.MarkdownRenderer })),
);
const PreparedMermaidDiagram = lazy(() =>
  import("../../MarkdownRenderer").then((module) => ({ default: module.MermaidDiagram })),
);
const PREPARED_SOURCE_RENDERER_DEGRADED_AFTER_MS = 2500;

export interface PreparedSourceCinemaPlaybackControls {
  isAvailable: boolean;
  isPlaying: boolean;
  isSeeking?: boolean;
  playbackRate: number;
  pause: () => void;
  play: () => Promise<void> | void;
  restart: () => Promise<void> | void;
  seekTo?: (seconds: number) => void;
  setPlaybackRate?: (rate: number) => void;
  skipBy?: (seconds: number) => void;
}

type PreparedSourceCinemaMobilePanel =
  | "discard"
  | "keep"
  | "narration"
  | "source"
  | "structure"
  | "theatre";
const PREPARED_SOURCE_CINEMA_MOBILE_SHEET_ID = "prepared-source-cinema-mobile-sheet";

function preparedSourceCinemaLabelForKind(
  source: PreparedSource,
  surfaceKind: PreparedSourceCinemaKind | undefined,
): string {
  if (surfaceKind === "website") {
    return "Website Cinema";
  }
  if (surfaceKind === "document") {
    return "Document Cinema";
  }
  return preparedSourceCinemaLabel(source);
}

function preparedReadAlongSurface(
  source: PreparedSource,
  isWebsiteCinema: boolean,
): "document" | "prepared" | "website" {
  if (isWebsiteCinema) {
    return "website";
  }
  if (preparedSourceCinemaKind(source) === "document") {
    return "document";
  }
  return "prepared";
}

function websiteExtractionReadabilityLabel(
  articleUncertain: boolean | undefined,
  extractionConfidence: string,
): string {
  if (articleUncertain) {
    return "Article uncertain";
  }
  return `${extractionConfidence} confidence`;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function PreparedSourceCinemaOverlay({
  accessibilitySettings,
  activeWordIndex,
  canCreateAudio,
  customPolicyProfiles,
  highlightMap,
  highlightMapV2,
  importError,
  isImporting,
  isProcessing,
  isPlaybackActive,
  job,
  playbackControls,
  playbackCursorSec,
  policyDefinition,
  policyError,
  policyOverrides,
  policyProfile,
  policyProfiles,
  progress,
  progressItems,
  readAlongPreferences,
  source,
  surfaceKind,
  sourcePolicySaving,
  sources,
  theatreControlsSignal,
  theatreExitSignal,
  theatreOpenSignal,
  themeName,
  uiMemoryFocusState,
  uiMemoryResetSignal,
  onClose,
  onAccessibilitySettingsChange,
  onBookmark,
  onCommandPaletteOpen,
  onClearSourcePolicy,
  onCreateAudio,
  onDiscardTemporarySource,
  onHelpOpen,
  onInspectStructure,
  onKeepTemporarySource,
  onPrepareFile,
  onPlayPause,
  onRerunWebsiteExtraction,
  onRestart,
  onResumeProgress,
  onSaveSourcePolicy,
  onSelectSource,
  onShortcutCheatSheetOpen,
  onSkip,
  onThemeChange,
  onUiMemoryFocusStateChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  activeWordIndex: number;
  canCreateAudio: boolean;
  customPolicyProfiles: CustomSpeechPolicyProfile[];
  highlightMap: HighlightMap | null;
  highlightMapV2: HighlightMapV2 | null;
  importError: string | null;
  isImporting: boolean;
  isProcessing: boolean;
  isPlaybackActive: boolean;
  job: VoiceJob | null;
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  policyDefinition: SpeechPolicyDefinition;
  policyError: string | null;
  policyOverrides: SpeechPolicyOverrides;
  policyProfile: string;
  policyProfiles: SpeechPolicyProfile[];
  progress: PlaybackProgress | null;
  progressItems: PlaybackProgress[];
  readAlongPreferences: ReadAlongPreferences;
  source: PreparedSource;
  surfaceKind?: PreparedSourceCinemaKind;
  sourcePolicySaving: boolean;
  sources: PreparedSource[];
  theatreControlsSignal: number;
  theatreExitSignal: number;
  theatreOpenSignal: number;
  themeName: ThemeName;
  uiMemoryFocusState: UiMemoryCinemaState;
  uiMemoryResetSignal: number;
  onClose: () => void;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCommandPaletteOpen?: () => void;
  onClearSourcePolicy: () => Promise<void> | void;
  onCreateAudio: (source: PreparedSource) => void;
  onDiscardTemporarySource?: (source: PreparedSource) => void;
  onHelpOpen?: () => void;
  onInspectStructure: (source: PreparedSource) => void;
  onKeepTemporarySource?: (source: PreparedSource, title?: string) => void;
  onPrepareFile: (file: File) => Promise<void>;
  onPlayPause: () => void;
  onRerunWebsiteExtraction?: (source: PreparedSource, containerSelector: string) => void;
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSaveSourcePolicy: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
  onSelectSource: (sourceId: string) => void;
  onShortcutCheatSheetOpen?: () => void;
  onSkip: (seconds: number) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUiMemoryFocusStateChange: (state: UiMemoryCinemaState) => void;
}>) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousSourceIdRef = useRef(source.id);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
  const effectiveReadAlong = effectiveReadAlongPreferences(
    readAlongPreferences,
    normalizedAccessibility,
  );
  const [autoFollow, setAutoFollow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PreparedSourceCinemaMobilePanel | null>(null);
  const [pointedBlockId, setPointedBlockId] = useState<string | null>(null);
  const [rendererLifecycle, setRendererLifecycle] =
    useState<CinemaRendererLifecycleState>("notStarted");
  const [rendererRetryKey, setRendererRetryKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [alignmentRepairMap, setAlignmentRepairMap] = useState<AlignmentRepairMap | null>(() =>
    loadAlignmentRepairMap(source.projectId, source.id),
  );
  const title = preparedSourceCinemaTitle(source);
  const cinemaLabel = preparedSourceCinemaLabelForKind(source, surfaceKind);
  const isWebsiteCinema =
    surfaceKind === "website" || preparedSourceCinemaKind(source) === "website";
  const temporaryContract = useMemo(
    () => cinemaContractFromPreparedSource(source, isWebsiteCinema ? "website" : "document"),
    [isWebsiteCinema, source],
  );
  const effectivePlaybackCursorSec =
    playbackCursorSec > 0 ? playbackCursorSec : (progress?.currentTimeSec ?? playbackCursorSec);
  const calibratedPlaybackCursorSec =
    effectivePlaybackCursorSec +
    readAlongCalibrationOffsetMs(effectiveReadAlong, job?.ttsEngine ?? job?.provider) / 1000;
  const effectiveActiveWordIndex =
    activeWordIndex > 0 ? activeWordIndex : (progress?.activeWordIndex ?? activeWordIndex);
  const alignmentRepairContext = useMemo(
    (): AlignmentRepairContext => ({
      contentFingerprint: preparedSourceAlignmentRepairFingerprint(source, job),
      generatedAudioId: job?.id ?? "missing-generated-audio",
      projectId: source.projectId,
      sourceId: source.id,
      speechPlanId: preparedSourceSpeechPlanRepairId(source, job),
    }),
    [job, source],
  );
  const alignmentRepairStaleness = useMemo(
    () => alignmentRepairMapStaleness(alignmentRepairMap, alignmentRepairContext),
    [alignmentRepairContext, alignmentRepairMap],
  );
  const handleAlignmentRepairMapChange = useCallback(
    (map: AlignmentRepairMap | null) => {
      setAlignmentRepairMap(map);
      saveAlignmentRepairMap(source.projectId, source.id, map);
    },
    [source.id, source.projectId],
  );
  const handleRendererLifecycleChange = useCallback((next: CinemaRendererLifecycleState) => {
    setRendererLifecycle((current) => {
      if (current === "ready" && next === "loading") {
        return current;
      }
      return next;
    });
  }, []);
  const handleRendererRetry = useCallback(() => {
    setRendererLifecycle("loading");
    setRendererRetryKey((current) => current + 1);
  }, []);
  const activeBlock = preparedSourceCinemaActiveBlock(source, effectiveActiveWordIndex);
  const pointedBlock = useMemo(
    () => source.blocks?.find((block) => block.id === pointedBlockId) ?? null,
    [pointedBlockId, source.blocks],
  );
  const displayBlock = pointedBlock ?? activeBlock;
  const outline = useMemo(() => preparedSourceCinemaOutline(source), [source]);
  const outlineItems = useMemo(
    () =>
      outline.map(
        (item): ReaderOutlineItem<PreparedSourceCinemaOutlineItem> => ({
          detail: item.level > 1 ? "Subheading" : "Heading",
          id: item.id,
          isActive: item.blockId === displayBlock?.id,
          label: item.label,
          level: item.level,
          target: item,
        }),
      ),
    [displayBlock?.id, outline],
  );
  const sourceLabels = useMemo(
    () => new Map(sources.map((item) => [item.id, preparedSourceCinemaTitle(item)])),
    [sources],
  );
  const bookmarkItems = useMemo(() => readerBookmarksFromProgress(progress), [progress]);
  const recentItems = useMemo(
    () =>
      readerRecentPositionsFromProgress(
        filterCinemaHistoryProgress(progressItems, temporaryContract),
        { preparedSources: sourceLabels },
      ),
    [progressItems, sourceLabels, temporaryContract],
  );
  const scrollBehavior = readerScrollBehavior(normalizedAccessibility);
  const liveAnnouncement = useMemo(
    () =>
      readerLiveAnnouncement({
        activeWordIndex: effectiveActiveWordIndex,
        scopeLabel: displayBlock ? blockSnippet(displayBlock, "Source opening") : title,
        surfaceTitle: `${cinemaLabel}. ${title}`,
      }),
    [cinemaLabel, displayBlock, effectiveActiveWordIndex, title],
  );
  const handleOutlineNavigate = (item: PreparedSourceCinemaOutlineItem) => {
    setPointedBlockId(item.blockId);
    scrollToCinemaBlock(item.blockId, scrollBehavior);
  };
  const handleWayfindingOutlineNavigate = (
    item: ReaderOutlineItem<PreparedSourceCinemaOutlineItem>,
  ) => {
    handleOutlineNavigate(item.target);
  };
  const handleBookmarkNavigate = (bookmark: ReaderBookmarkItem) => {
    if (!progress) {
      return;
    }
    onResumeProgress(playbackProgressForBookmark(progress, bookmark));
  };
  const handleRecentNavigate = (item: ReaderRecentPositionItem) => {
    onResumeProgress(item.progressItem);
  };
  const canBookmark = Boolean(job && playbackControls.isAvailable);
  const playbackState = deriveCinemaPlaybackState({
    hasAudio: Boolean(job?.audioUrl),
    isGenerating: isProcessing && !job,
    isPlayable: Boolean(job && playbackControls.isAvailable),
    isPlaying: playbackControls.isPlaying,
    progressRatio: progress?.progress,
    status: job?.status,
  });
  const headerReadiness = deriveCinemaReadinessDisplay({
    isPlaybackActive,
    playbackState,
    rendererLifecycle,
  });
  const metrics = preparedSourceCinemaMetrics(source);
  const href = preparedSourceCinemaSourceHref(source);
  const webpageMetadata = websiteSourceMetadata(source);
  const urlProvenance = websiteUrlProvenance(source);
  const canonicalUrl = webpageMetadata.canonicalUrl || urlProvenance.fetchedUrl || href;
  const sourceDomain =
    urlProvenance.domain || domainFromHref(canonicalUrl) || preparedSourceCinemaDomain(source);
  const isTemporarySource = source.sourceOwner === "temporary";
  const websiteQuality = isWebsiteCinema ? websiteExtractionQuality(source) : null;
  let readabilityHealthLabel = source.warnings && source.warnings.length > 0 ? "Warnings" : "Good";
  if (websiteQuality) {
    readabilityHealthLabel = websiteExtractionReadabilityLabel(
      websiteQuality.articleUncertain,
      websiteQuality.extractionConfidence,
    );
  }
  const skippedGroups = preparedSourceCinemaSkippedGroups(source);
  const policyNotes = useMemo(() => preparedSourceCinemaPolicyNotes(source), [source]);
  const activeText = displayBlock ? markdownBlockText(displayBlock) : "";
  const activeSection = activeOutlineItem(outline, displayBlock);
  const activeJobMatchesSource = !job || preparedSourceCinemaJobMatchesSource(job, source);
  const generatedAudioState = generatedAudioLifecycleFromJob({ job });
  const temporaryArtifactCount = [job?.audioUrl, job?.timing].filter(Boolean).length;
  const temporaryInspectorSections = buildCinemaTemporaryInspectorSections({
    artifactCount: temporaryArtifactCount,
    audioStatus: job?.audioUrl ? "Generated audio ready" : "No generated audio",
    bookmarkCount: bookmarkItems.length,
    contract: temporaryContract,
    diagnostics: [
      ...(source.warnings ?? []),
      ...(activeJobMatchesSource ? [] : ["Generated audio belongs to another source"]),
    ],
    originLabel: href ?? source.sourceName,
    policyLabel:
      source.sourceSpeechPolicyProfile ??
      (hasSpeechPolicyOverrides(source.sourceSpeechPolicyOverrides ?? {})
        ? "Session override"
        : "Project default"),
    promotionItems: temporaryPromotionItems({
      artifactCount: temporaryArtifactCount,
      bookmarkCount: bookmarkItems.length,
      hasAudio: Boolean(job?.audioUrl),
      hasPolicy:
        Boolean(source.sourceSpeechPolicyProfile) ||
        hasSpeechPolicyOverrides(source.sourceSpeechPolicyOverrides ?? {}),
      hasTiming: Boolean(job?.timing),
      reviewEditCount: 0,
    }),
    pronunciationCount: 0,
    recentPositionCount: recentItems.length,
    repairNotes: alignmentRepairMap ? ["Alignment repair map exists for this session"] : [],
    reviewEditCount: 0,
    skippedCount: metrics.skippedCount,
    sourceTypeLabel: source.sourceContentType ?? source.sourceFormat ?? source.kind,
    timingConfidence: temporaryTimingConfidenceLabel(job),
    title,
    warnings: source.warnings,
  });
  const readAlongRuntime = useMemo(
    () =>
      resolveReadAlongRuntimeSnapshot({
        audioTimeSec: calibratedPlaybackCursorSec,
        generatedAudioState,
        highlightMap: null,
        isPaused: !playbackControls.isPlaying,
        isPlaying: playbackControls.isPlaying,
        isSeeking: playbackControls.isSeeking,
      }),
    [
      calibratedPlaybackCursorSec,
      generatedAudioState,
      playbackControls.isPlaying,
      playbackControls.isSeeking,
    ],
  );
  useReadAlongLiveStatus({
    reason: readAlongRuntime.reason,
    state: readAlongRuntime.state,
    surface: isWebsiteCinema ? "Website Cinema" : "Document Cinema",
  });
  const readAlongVisualMode = readAlongVisualModeFromRuntime(readAlongRuntime, effectiveReadAlong);
  const readAlongTimingState = readAlongTimingStateFromRuntime({ runtime: readAlongRuntime });
  const schedulerTimeline = useMemo(() => {
    if (
      !job ||
      !preparedSourceCinemaJobMatchesSource(job, source) ||
      isPreparedSourceMarkdownDocument(source)
    ) {
      return null;
    }
    if (highlightMapV2?.generatedAudioId === job.id && highlightMapV2.sourceId === source.id) {
      return wordTimelineFromPreparedSourceHighlightMapV2({
        map: highlightMapV2,
        source,
      });
    }
    if (
      highlightMap &&
      (!highlightMap.jobId || highlightMap.jobId === job.id) &&
      (!highlightMap.bookSourceId || highlightMap.bookSourceId === source.id)
    ) {
      return wordTimelineFromPreparedSourceLegacyHighlightMap({
        map: highlightMap,
        source,
      });
    }
    return null;
  }, [highlightMap, highlightMapV2, job, source]);
  const wordSchedulerAvailable =
    Boolean(job && schedulerTimeline) &&
    playbackControls.isPlaying &&
    readAlongVisualMode === "word";
  const readAlongReport = useMemo(
    () =>
      evaluatePreparedSourceReadAlongInvariant({
        activeBlock: displayBlock,
        activeText,
        activeWordIndex: effectiveActiveWordIndex,
        generatedAudioState,
        highlightCue: null,
        jobMatchesSource: activeJobMatchesSource,
        progress,
        source,
        surface: preparedReadAlongSurface(source, isWebsiteCinema),
        visibleNodeIds: preparedSourceCinemaPrimaryBlocks(source).map((block) => block.id),
      }),
    [
      activeJobMatchesSource,
      activeText,
      displayBlock,
      effectiveActiveWordIndex,
      generatedAudioState,
      isWebsiteCinema,
      progress,
      source,
    ],
  );
  const syncDebugSnapshot = useMemo(() => {
    const activeSegment = displayBlock?.segments?.[0] ?? null;
    const activeWordText = preparedSourceActiveWordText(source, effectiveActiveWordIndex);
    const locator: SyncDebugSourceLocator = {
      activeWordIndex: effectiveActiveWordIndex,
      blockId: displayBlock?.id ?? null,
      bookmarkTarget: progress?.targetId ?? null,
      kind: "prepared-source",
      projectId: source.projectId,
      sourceId: source.id,
      sourceTitle: title,
      textQuote: activeWordText ?? (activeText || null),
      value: `prepared-source:${source.id}:${
        displayBlock?.id ?? "no-block"
      }:word-${String(effectiveActiveWordIndex)}`,
    };
    return buildReadAlongSyncDebugSnapshot({
      activePhraseText: activeText || null,
      activeSegmentId: activeSegment ? String(activeSegment.index) : null,
      activeSegmentIndex: activeSegment?.index ?? null,
      activeSegmentLabel:
        activeSegment === null ? undefined : `Segment ${String(activeSegment.index + 1)}`,
      activeWordText,
      currentSourceLocator: locator,
      highlightMode: readAlongVisualMode,
      runtime: readAlongRuntime,
      surface: isWebsiteCinema ? "WebsiteCinema" : "DocumentCinema",
    });
  }, [
    activeText,
    displayBlock?.id,
    displayBlock?.segments,
    effectiveActiveWordIndex,
    isWebsiteCinema,
    progress?.targetId,
    readAlongRuntime,
    readAlongVisualMode,
    source,
    title,
  ]);
  const sourcePolicyState = {
    projectProfile: policyProfile,
    resolvedProfile: displayBlock?.speechPolicy.profile ?? source.speechPolicyProfile,
    sessionOverrides: policyOverrides,
    sourceOverrides: source.sourceSpeechPolicyOverrides,
    sourceProfile: source.sourceSpeechPolicyProfile,
  };
  const sourcePolicySummary = policyScopeSummary(sourcePolicyState);
  const sourceLifecycle = useMemo(
    () =>
      preparedSourceLifecycleEnvelope(source, {
        activeBlockId: displayBlock?.id ?? null,
        isActive: true,
        job: job?.preparedSourceId === source.id ? job : null,
        lastOpenedSurface: "Cinema",
      }),
    [displayBlock?.id, job, source],
  );
  const generatedHealth = (
    <div className="grid gap-2 text-sm">
      <HealthRow label="TTS engine" value={job ? "Healthy" : "Waiting"} />
      <HealthRow label="Audio quality" value={job ? "Good" : "Pending"} />
      <HealthRow label="Alignment" value={job?.voiceCheck.complete ? "Good" : "Pending"} />
      <HealthRow
        label="Coverage"
        value={job ? `${Math.round(job.voiceCheck.similarity * 100).toString()}%` : "0%"}
      />
    </div>
  );
  const sourceInspectorPanels = buildCinemaInspectorPanels([
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3">
          <PreparedSourceCinemaSourceLibrary
            importError={importError}
            isImporting={isImporting}
            source={source}
            sources={sources}
            onPrepareFile={onPrepareFile}
            onSelectSource={onSelectSource}
          />
          <dl className="grid gap-3 text-sm">
            {isTemporarySource ? (
              <div className="grid gap-2 rounded-md border bg-[var(--vs-surface)] p-3 vs-border">
                <div className="flex flex-wrap gap-2">
                  <StatusChip tone="metadata">{temporaryContract.ownershipLabel}</StatusChip>
                  <StatusChip tone="metadata">{temporaryContract.statusLabel}</StatusChip>
                  <StatusChip tone="metadata">{temporaryContract.expiryLabel}</StatusChip>
                </div>
                <MetadataRow label="Provenance" value={temporaryContract.provenanceLabel} />
                <MetadataRow
                  label="Session"
                  value={temporaryContract.temporarySourceId ?? source.id}
                />
                {websiteQuality ? (
                  <StatusChip tone={websiteExtractionTone(websiteQuality)}>
                    {websiteQuality.extractionConfidence} confidence
                  </StatusChip>
                ) : null}
              </div>
            ) : null}
            {href ? (
              <div className="grid min-w-0 grid-cols-[5.6rem_minmax(0,1fr)] gap-3">
                <dt className="vs-muted">Source URL</dt>
                <dd className="min-w-0 truncate text-[var(--vs-status-info)]" title={href}>
                  <a href={href} rel="noreferrer" target="_blank">
                    {href}
                  </a>
                </dd>
              </div>
            ) : null}
            {canonicalUrl ? <MetadataRow label="Canonical" value={canonicalUrl} /> : null}
            <MetadataRow label="Domain" value={sourceDomain} />
            {webpageMetadata.siteName ? (
              <MetadataRow label="Site" value={webpageMetadata.siteName} />
            ) : null}
            {webpageMetadata.author ? (
              <MetadataRow label="Author" value={webpageMetadata.author} />
            ) : null}
            {webpageMetadata.language ? (
              <MetadataRow label="Language" value={webpageMetadata.language} />
            ) : null}
            <MetadataRow label="Fetched" value={formatDateTime(source.updatedAt)} />
            <MetadataRow label="Page title" value={preparedSourceCinemaTitle(source)} />
            <MetadataRow
              label="Content type"
              value={source.sourceContentType ?? source.sourceFormat ?? source.kind}
            />
            <MetadataRow label="Reader mode" value={readerModeLabel(source)} valueTone="success" />
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => {
                onInspectStructure(source);
              }}
              size="md"
              variant="secondary"
            >
              Inspect structure
            </Button>
            {isTemporarySource ? (
              <Button
                disabled={!onKeepTemporarySource || source.temporarySourceId === undefined}
                disabledReason="This temporary source cannot be kept in project yet."
                onClick={
                  onKeepTemporarySource
                    ? () => {
                        onKeepTemporarySource(source);
                      }
                    : undefined
                }
                size="md"
                variant="primary"
              >
                {TEMPORARY_SOURCE_COPY.actions.keep}
              </Button>
            ) : null}
            {isTemporarySource ? (
              <Button
                disabled={!onKeepTemporarySource || source.temporarySourceId === undefined}
                disabledReason="This temporary source cannot be kept in project yet."
                onClick={
                  onKeepTemporarySource
                    ? () => {
                        const title = globalThis.prompt(
                          "Rename before keeping",
                          source.title ?? source.sourceName,
                        );
                        if (title !== null) {
                          onKeepTemporarySource(source, title);
                        }
                      }
                    : undefined
                }
                size="md"
                variant="secondary"
              >
                Rename before keeping
              </Button>
            ) : null}
            {isTemporarySource ? (
              <Button
                disabled={!onDiscardTemporarySource}
                disabledReason="Discard temporary source is unavailable here."
                onClick={
                  onDiscardTemporarySource
                    ? () => {
                        onDiscardTemporarySource(source);
                      }
                    : undefined
                }
                size="md"
                variant="secondary"
              >
                {TEMPORARY_SOURCE_COPY.actions.discard}
              </Button>
            ) : null}
            {isTemporarySource && job?.audioUrl ? (
              <a
                className="cinema-touch-target inline-flex h-10 items-center rounded-md border border-[var(--vs-action-secondary-border)] bg-[var(--vs-action-secondary-bg)] px-3 text-sm font-semibold text-[var(--vs-action-secondary-text)] shadow-sm hover:bg-[var(--vs-action-secondary-hover)]"
                download
                href={job.audioUrl}
              >
                Export audio only
              </a>
            ) : null}
          </div>
        </div>
      ),
      detail: href ?? source.sourceName,
      id: "source-provenance",
      kind: "source-provenance",
      modeAffinity: "inspect",
      tabId: "overview",
      title: "Source provenance",
    }),
    ...temporaryInspectorSections,
    ...(isWebsiteCinema
      ? [
          buildCinemaInspectorSection({
            children: (
              <WebsiteExtractionReview
                source={source}
                onRerunExtraction={onRerunWebsiteExtraction}
              />
            ),
            detail: websiteQuality
              ? `${websiteQuality.extractionConfidence} confidence · ${websiteQuality.articleCandidateCount.toLocaleString()} candidates`
              : "No extraction metadata",
            id: "website-extraction-review",
            kind: "source-provenance",
            modeAffinity: ["inspect", "debug"],
            tabId: "overview",
            title: "Website extraction",
          }),
        ]
      : []),
    buildCinemaCurrentReadingSection({
      detail: displayBlock
        ? `${blockKindLabel(displayBlock)} ${(displayBlock.index + 1).toString()}`
        : "No block selected",
      emptyText: "Start playback to follow the current narrated block.",
      excerpt: activeText,
      label: activeSection ? activeSection.label : blockSnippet(displayBlock, "Source opening"),
    }),
    buildCinemaWayfindingSection({
      bookmarks: bookmarkItems,
      canBookmark,
      outlineItems,
      recentItems,
      onAddBookmark: onBookmark,
      onBookmarkNavigate: handleBookmarkNavigate,
      onOutlineNavigate: handleWayfindingOutlineNavigate,
      onRecentNavigate: handleRecentNavigate,
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-2 text-sm">
          <MetadataRow
            label="Block"
            value={
              displayBlock
                ? `${blockKindLabel(displayBlock)} ${(displayBlock.index + 1).toString()}`
                : "None"
            }
          />
          <MetadataRow label="Segments" value={(displayBlock?.segments?.length ?? 0).toString()} />
          <MetadataRow label="Speak mode" value={displayBlock?.speakMode ?? "waiting"} />
          <p className="line-clamp-4 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border">
            {activeText || "Start playback to review narration block status."}
          </p>
        </div>
      ),
      detail: displayBlock
        ? `${(displayBlock.segments?.length ?? 0).toLocaleString()} segments`
        : "Waiting",
      id: "narration-block-status",
      kind: "narration-block-status",
      modeAffinity: "review",
      tabId: "review",
      title: "Narration block status",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3 text-sm">
          <PolicyScopeSummary display="expanded" state={sourcePolicyState} />
          <div className="grid grid-cols-2 gap-2 text-center text-[11px]">
            <PolicyMetric icon={<MicrophoneIcon />} label="Voice" value={job?.voice ?? "Alloy"} />
            <PolicyMetric
              icon={<DialIcon />}
              label="Speed"
              value={`${playbackControls.playbackRate.toFixed(2)}x`}
            />
          </div>
          <SourcePolicyPinEditor
            customProfiles={customPolicyProfiles}
            definition={policyDefinition}
            disabled={source.status !== "ready"}
            error={policyError}
            isSaving={sourcePolicySaving}
            profiles={policyProfiles}
            sourceLifecycle={sourceLifecycle}
            sourceOverrides={source.sourceSpeechPolicyOverrides}
            sourceProfile={source.sourceSpeechPolicyProfile}
            onClear={onClearSourcePolicy}
            onSave={onSaveSourcePolicy}
          />
        </div>
      ),
      detail:
        displayBlock?.speechPolicy.profile ?? source.sourceSpeechPolicyProfile ?? "Project default",
      id: "speech-policy",
      kind: "speech-policy",
      modeAffinity: ["inspect", "review", "debug"],
      tabId: "policy",
      title: "Speech policy",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3">
          <PolicyScopeSummary display="debug" state={sourcePolicyState} />
          <PreparedSourcePolicyNotes notes={policyNotes} />
        </div>
      ),
      detail: `${policyNotes.length.toLocaleString()} policy notes`,
      id: "policy-notes",
      kind: "policy-notes",
      modeAffinity: ["inspect", "review", "debug"],
      tabId: "policy",
      title: "Policy notes",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3 text-sm">
          <HealthRow label="Main content" value="Detected" />
          <HealthRow label="Readability" value={readabilityHealthLabel} />
          <HealthRow label="Content length" value={`${metrics.wordCount.toLocaleString()} words`} />
          <HealthRow
            label="You're ready"
            value={source.status === "ready" ? "Looks good!" : "Needs review"}
          />
          {generatedHealth}
        </div>
      ),
      detail: source.status === "ready" ? "Looks good" : "Needs review",
      id: "extraction-health",
      kind: "extraction-health",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Health",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-2 text-sm">
          {skippedGroups.length > 0 ? (
            skippedGroups.map((group) => (
              <div className="flex items-center justify-between gap-3" key={group.key}>
                <span className="flex min-w-0 items-center gap-2">
                  <SkippedIcon />
                  <span className="truncate">{group.label}</span>
                </span>
                <span className="font-semibold">{group.count.toLocaleString()}</span>
              </div>
            ))
          ) : (
            <p className="vs-muted">No skipped source items.</p>
          )}
          <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm font-semibold vs-border">
            <span>Total skipped</span>
            <span>{metrics.skippedCount.toLocaleString()}</span>
          </div>
        </div>
      ),
      detail: `${metrics.skippedCount.toLocaleString()} skipped`,
      id: "skipped-content",
      kind: "skipped-content",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Skipped content",
    }),
    buildCinemaInspectorSection({
      children: (
        <ReadAlongInvariantDebugPanel
          onRepairMapChange={handleAlignmentRepairMapChange}
          report={readAlongReport}
          repairContext={alignmentRepairContext}
          repairMap={alignmentRepairMap}
          runtime={readAlongRuntime}
          syncDebugSnapshot={syncDebugSnapshot}
        />
      ),
      detail: readAlongInvariantStatusLabel(readAlongReport),
      id: "read-along-fidelity",
      kind: "timing-map",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Read-along fidelity",
    }),
    buildCinemaInspectorSection({
      children: (
        <AlignmentDiagnosticsPanel
          job={job}
          repairMap={alignmentRepairMap}
          repairStaleness={alignmentRepairStaleness}
          runtime={readAlongRuntime}
          skippedPolicyContent={skippedGroups.map((group) => ({
            count: group.count,
            label: group.label,
          }))}
        />
      ),
      detail: job?.timing?.alignmentQuality?.fallbackReason ?? "Audio/text timing diagnostics",
      id: "alignment-diagnostics",
      kind: "timing-map",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Alignment diagnostics",
    }),
    buildCinemaInspectorSection({
      children: (
        <AlignmentRepairEditor
          context={alignmentRepairContext}
          job={job}
          repairMap={alignmentRepairMap}
          onRepairMapChange={handleAlignmentRepairMapChange}
        />
      ),
      detail: alignmentRepairStaleness.stale
        ? (alignmentRepairStaleness.reason ?? "Stale repair map")
        : "Versioned project-local repair map",
      id: "alignment-repair",
      kind: "alignment-repair",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Alignment repair",
    }),
  ]);
  const cinemaFocus = useCinemaFocusController(sourceInspectorPanels, {
    initialState: uiMemoryFocusState,
    onStateChange: onUiMemoryFocusStateChange,
    resetSignal: uiMemoryResetSignal,
  });
  const cinemaTheatre = useCinemaTheatreController(dialogRef);
  const focusedAccessibilitySettings = cinemaTheatre.active
    ? applyReaderTypographyPreset("theatre", normalizedAccessibility)
    : normalizedAccessibility;
  const theatreOpenSignalRef = useRef(theatreOpenSignal);
  const theatreExitSignalRef = useRef(theatreExitSignal);
  const theatreControlsSignalRef = useRef(theatreControlsSignal);
  const websiteReadModeCalm = isWebsiteCinema && cinemaFocus.mode === "read";
  const hasWebsiteQuality = websiteQuality !== null;
  let websiteNeedsExtractionAttention = false;
  if (hasWebsiteQuality) {
    websiteNeedsExtractionAttention = websiteQuality.extractionConfidence !== "high";
    if (websiteQuality.articleUncertain) {
      websiteNeedsExtractionAttention = true;
    }
  }
  const showWebsiteExtractionSummary =
    isWebsiteCinema && (!websiteReadModeCalm || websiteNeedsExtractionAttention);
  const showWebsiteReviewAction =
    isWebsiteCinema &&
    hasWebsiteQuality &&
    (!websiteReadModeCalm || websiteNeedsExtractionAttention);
  const handleReviewWebsiteExtraction = () => {
    cinemaFocus.setMode("inspect");
    cinemaFocus.setActivePanelId("overview");
  };
  const cinemaMoreActions = useMemo(() => {
    let audioAction: "create" | "none" | "retry" = "none";
    if (job && playbackState === "degraded") {
      audioAction = "retry";
    } else if (canCreateAudio) {
      audioAction = "create";
    }

    return cinemaMoreActionsForContext({
      audioAction,
      includeDiagnostics: cinemaFocus.mode === "debug",
      includeTemporaryActions: isTemporarySource,
    });
  }, [canCreateAudio, cinemaFocus.mode, isTemporarySource, job, playbackState]);

  useEffect(() => {
    if (websiteReadModeCalm) {
      setSettingsOpen(false);
    }
  }, [websiteReadModeCalm]);

  useReaderKeyboardControls({
    canBookmark,
    onBookmark,
    onClose: () => {
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      if (cinemaTheatre.active) {
        cinemaTheatre.exit();
        return;
      }
      onClose();
    },
    onPlayPause,
    onRestart,
    onSkip,
    onToggleTheatreControls: cinemaTheatre.active ? cinemaTheatre.toggleControls : undefined,
    playbackControls,
  });

  useReaderModalLifecycle(dialogRef, { closeOnEscape: false });

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === dialogRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    if (source.id && previousSourceIdRef.current !== source.id) {
      previousSourceIdRef.current = source.id;
      setPointedBlockId(null);
      setRendererLifecycle("notStarted");
      setRendererRetryKey(0);
      setAlignmentRepairMap(loadAlignmentRepairMap(source.projectId, source.id));
    }
  }, [source.id, source.projectId]);

  const handleFullscreenToggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (dialogRef.current) {
      void dialogRef.current.requestFullscreen();
    }
  };

  const handleCompactTransport = useCallback(() => {
    cinemaFocus.setMode("read");
    cinemaFocus.setPinnedPanelId(null);
    setMobilePanel(null);
  }, [cinemaFocus]);

  const handleTheatreMode = useCallback(() => {
    handleCompactTransport();
    setSettingsOpen(false);
    cinemaTheatre.open();
  }, [cinemaTheatre, handleCompactTransport]);

  useEffect(() => {
    if (theatreOpenSignalRef.current === theatreOpenSignal) {
      return;
    }
    theatreOpenSignalRef.current = theatreOpenSignal;
    if (theatreOpenSignal > 0) {
      handleTheatreMode();
    }
  }, [handleTheatreMode, theatreOpenSignal]);

  useEffect(() => {
    if (theatreExitSignalRef.current === theatreExitSignal) {
      return;
    }
    theatreExitSignalRef.current = theatreExitSignal;
    if (theatreExitSignal > 0) {
      cinemaTheatre.exit();
    }
  }, [cinemaTheatre, theatreExitSignal]);

  useEffect(() => {
    if (theatreControlsSignalRef.current === theatreControlsSignal) {
      return;
    }
    theatreControlsSignalRef.current = theatreControlsSignal;
    if (theatreControlsSignal > 0) {
      cinemaTheatre.toggleControls();
    }
  }, [cinemaTheatre, theatreControlsSignal]);

  return (
    <CinemaShell
      ariaLabelledBy="prepared-source-cinema-title"
      canvas={
        <PreparedSourceCinemaReader
          activeBlockId={displayBlock?.id ?? null}
          activeWordIndex={effectiveActiveWordIndex}
          autoFollow={autoFollow}
          accessibilitySettings={focusedAccessibilitySettings}
          canvasFirst={cinemaTheatre.active || cinemaFocus.layoutState.canvasFirst}
          calibratedPlaybackCursorSec={calibratedPlaybackCursorSec}
          highlightMotion={effectiveReadAlong.highlightMotion}
          highlightStyle={effectiveReadAlong.highlightStyle}
          jobId={job?.id ?? null}
          isFullscreen={isFullscreen || cinemaTheatre.fullscreenActive}
          readAlongVisualMode={readAlongVisualMode}
          readAlongTimingState={readAlongTimingState}
          rendererLifecycle={rendererLifecycle}
          rendererRetryKey={rendererRetryKey}
          scrollFollow={effectiveReadAlong.scrollFollow}
          source={source}
          schedulerTimeline={schedulerTimeline}
          theatreActive={cinemaTheatre.active}
          wordSchedulerAvailable={wordSchedulerAvailable}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          onAutoFollowChange={setAutoFollow}
          onFullscreenToggle={handleFullscreenToggle}
          onInspectStructure={onInspectStructure}
          onRendererLifecycleChange={handleRendererLifecycleChange}
          onRendererRetry={handleRendererRetry}
        />
      }
      canvasFirst={cinemaTheatre.active || cinemaFocus.layoutState.canvasFirst}
      footer={
        <PreparedSourceCinemaTransport
          accessibilitySettings={normalizedAccessibility}
          canBookmark={canBookmark}
          canCreateAudio={canCreateAudio}
          isMobileSheetOpen={mobilePanel !== null}
          isProcessing={isProcessing}
          job={job}
          playbackState={playbackState}
          playbackControls={playbackControls}
          playbackCursorSec={effectivePlaybackCursorSec}
          progress={progress}
          rendererLifecycle={rendererLifecycle}
          source={source}
          theatreControlsVisible={cinemaTheatre.controlsVisible}
          variant={cinemaTheatre.active ? "theatre" : "normal"}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          onBookmark={onBookmark}
          onCreateAudio={onCreateAudio}
          onPlayPause={onPlayPause}
          onRestart={onRestart}
          onSkip={onSkip}
          onTheatreMode={handleTheatreMode}
          onToggleMobilePanel={() => {
            setMobilePanel((current) => (current ? null : "source"));
          }}
        />
      }
      focusMode={cinemaFocus.mode}
      header={
        cinemaTheatre.active ? (
          <CinemaTheatreChrome
            activePassage={activeText}
            controlsVisible={cinemaTheatre.controlsVisible}
            fullscreenActive={cinemaTheatre.fullscreenActive}
            fullscreenAvailability={cinemaTheatre.fullscreenAvailability}
            highContrast={focusedAccessibilitySettings.highContrast}
            playbackState={playbackState}
            scopeLabel="Full source"
            rendererLifecycle={rendererLifecycle}
            sourceLabel={title}
            surfaceName={cinemaLabel}
            onExit={cinemaTheatre.exit}
            onRequestFullscreen={cinemaTheatre.requestFullscreen}
            onToggleControls={cinemaTheatre.toggleControls}
          />
        ) : (
          <header
            className="relative flex min-h-[4rem] flex-wrap items-center justify-between gap-3 border-b bg-[var(--vs-raised)] px-4 py-2.5 vs-border sm:px-6"
            data-cinema-header=""
            data-website-read-mode-calm={websiteReadModeCalm ? "true" : undefined}
          >
            <HeaderContextSummary
              className="min-w-0 flex-1 basis-[18rem] sm:min-w-[16rem] sm:basis-[26rem] lg:max-w-[min(36rem,42vw)]"
              density="compact"
              icon={
                <span className="grid h-9 w-9 place-items-center rounded-md border border-[var(--vs-selected-border)] text-[var(--vs-action-primary)] sm:border-[var(--vs-border-strong)] sm:bg-[var(--vs-theatre-bg)] sm:text-[var(--vs-theatre-text)]">
                  <CinemaFilmIcon />
                </span>
              }
              id="prepared-source-cinema-title"
              inlineSummary={!websiteReadModeCalm}
              metadata={[
                { label: "Reader", value: headerReadiness.readerLabel },
                { label: "Policy", value: sourcePolicySummary.compactLabel },
                { label: "Voice", value: job?.voice ?? "Default narrative" },
              ]}
              scopeTitle="Full source"
              sourceLifecycle={sourceLifecycle}
              sourceLifecycleDescriptorOverride={{
                detail: headerReadiness.detail,
                label: headerReadiness.label,
                state: sourceLifecycle.canonicalState,
                tone: headerReadiness.tone,
              }}
              sourceLifecycleGeneratedAudioLabel={headerReadiness.audioLabel}
              sourceTitle={title}
              stateLabel={headerReadiness.label}
              surfaceName={cinemaLabel}
              variant="bar"
            />
            {showWebsiteExtractionSummary ? <WebsiteExtractionSummary source={source} /> : null}
            <div className="order-last flex min-w-0 flex-1 basis-full flex-wrap items-center gap-3 lg:flex xl:order-none xl:basis-auto xl:flex-nowrap">
              {websiteReadModeCalm ? null : (
                <PreparedSourceCinemaHeaderSourceSelect
                  source={source}
                  sources={sources}
                  onSelectSource={onSelectSource}
                />
              )}
              <div className="hidden min-w-[17rem] shrink-0 lg:block">
                <CinemaFocusModeToolbar
                  actions={cinemaMoreActions}
                  activePanelId={cinemaFocus.activePanelId}
                  mode={cinemaFocus.mode}
                  onAdvancedAction={(action) => {
                    cinemaFocus.setMode(action.mode);
                    cinemaFocus.setActivePanelId(action.panelId);
                  }}
                  onCommandPalette={onCommandPaletteOpen}
                  onCreateAudio={() => {
                    onCreateAudio(source);
                  }}
                  onDiscardTemporarySource={
                    isTemporarySource && onDiscardTemporarySource
                      ? () => {
                          onDiscardTemporarySource(source);
                        }
                      : undefined
                  }
                  onHelpGuide={onHelpOpen}
                  onKeepTemporarySource={
                    isTemporarySource && onKeepTemporarySource
                      ? () => {
                          onKeepTemporarySource(source);
                        }
                      : undefined
                  }
                  onKeyboardShortcuts={onShortcutCheatSheetOpen}
                  onMenuOpen={() => {
                    setSettingsOpen(false);
                  }}
                  onModeChange={cinemaFocus.setMode}
                  onOpenInspector={() => {
                    cinemaFocus.setMode("inspect");
                    cinemaFocus.setActivePanelId("overview");
                  }}
                  onReturnPreview={onClose}
                  onReturnReview={onClose}
                  onReaderSettings={() => {
                    setSettingsOpen(true);
                  }}
                  onSourceDetails={() => {
                    cinemaFocus.setMode("inspect");
                    cinemaFocus.setActivePanelId("overview");
                  }}
                  onTheatreMode={handleTheatreMode}
                  sourceOwner={source.sourceOwner}
                  temporarySourceId={source.temporarySourceId}
                />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {showWebsiteReviewAction ? (
                <Button
                  className="hidden gap-2 sm:inline-flex"
                  onClick={handleReviewWebsiteExtraction}
                  size="md"
                  variant="secondary"
                >
                  Review article
                </Button>
              ) : null}
              {websiteReadModeCalm ? null : (
                <Button
                  className="hidden gap-2 sm:inline-flex"
                  onClick={() => {
                    setSettingsOpen((current) => !current);
                  }}
                  size="md"
                  variant="secondary"
                >
                  <SettingsIcon />
                  Settings
                </Button>
              )}
              <Button
                aria-label="More"
                aria-controls={PREPARED_SOURCE_CINEMA_MOBILE_SHEET_ID}
                aria-expanded={mobilePanel !== null}
                className="gap-1.5 px-2.5 lg:hidden"
                data-testid="ui-action-prepared-cinema-mobile-more"
                onClick={() => {
                  setSettingsOpen(false);
                  setMobilePanel((current) => (current ? null : "theatre"));
                }}
                size="md"
                variant="secondary"
              >
                <MoreIcon />
                <span className="hidden sm:inline">More</span>
              </Button>
              <Button
                className="gap-1.5 px-2.5 sm:gap-2 sm:px-3"
                onClick={onClose}
                size="md"
                variant="secondary"
              >
                <ExitIcon />
                Exit
              </Button>
            </div>
            {settingsOpen ? (
              <ReaderSettingsPopover
                accessibilitySettings={normalizedAccessibility}
                autoFollow={autoFollow}
                themeName={themeName}
                onAccessibilitySettingsChange={onAccessibilitySettingsChange}
                onAutoFollowChange={setAutoFollow}
                onThemeChange={onThemeChange}
              />
            ) : null}
          </header>
        )
      }
      inspector={
        !cinemaTheatre.active && cinemaFocus.layoutState.railVisible ? (
          <CinemaInspectorDock
            activePanelId={cinemaFocus.activePanelId}
            mode={cinemaFocus.mode}
            panels={sourceInspectorPanels}
            pinnedPanelId={cinemaFocus.pinnedPanelId}
            surface={isWebsiteCinema ? "website" : "document"}
            onActivePanelChange={cinemaFocus.setActivePanelId}
            onPinnedPanelChange={cinemaFocus.setPinnedPanelId}
          />
        ) : undefined
      }
      liveAnnouncement={liveAnnouncement}
      mobileSheet={
        cinemaTheatre.active ? undefined : (
          <PreparedSourceCinemaMobileSheet
            activeBlock={displayBlock}
            bookmarkItems={bookmarkItems}
            canBookmark={canBookmark}
            displayControls={
              <ReaderAccessibilityControls
                settings={normalizedAccessibility}
                variant="panel"
                onChange={onAccessibilitySettingsChange}
              />
            }
            job={job}
            mobilePanel={mobilePanel}
            outlineItems={outlineItems}
            progress={progress}
            recentItems={recentItems}
            source={source}
            sources={sources}
            importError={importError}
            isImporting={isImporting}
            onAddBookmark={onBookmark}
            onBookmarkNavigate={handleBookmarkNavigate}
            onInspectStructure={onInspectStructure}
            onDiscardTemporarySource={onDiscardTemporarySource}
            onKeepTemporarySource={onKeepTemporarySource}
            onMobilePanelChange={setMobilePanel}
            onOutlineNavigate={handleWayfindingOutlineNavigate}
            onPrepareFile={onPrepareFile}
            onRecentNavigate={handleRecentNavigate}
            onSelectSource={onSelectSource}
            onResumeProgress={onResumeProgress}
            onTheatreMode={handleTheatreMode}
          />
        )
      }
      readerAttributes={{
        ...readerDataAttributes(focusedAccessibilitySettings),
        ...readAlongPreferenceDataAttributes(effectiveReadAlong),
      }}
      rootRef={dialogRef}
      rendererLifecycle={rendererLifecycle}
      surfaceKind={isWebsiteCinema ? "website" : "document"}
      theatreActive={cinemaTheatre.active}
      themeName={themeName}
    />
  );
}

function PreparedSourceCinemaSourceLibrary({
  importError,
  isImporting,
  source,
  sources,
  onPrepareFile,
  onSelectSource,
}: Readonly<{
  importError: string | null;
  isImporting: boolean;
  source: PreparedSource;
  sources: PreparedSource[];
  onPrepareFile: (file: File) => Promise<void>;
  onSelectSource: (sourceId: string) => void;
}>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="mt-3 grid gap-2 border-b pb-3 vs-border" data-cinema-expanded-source-detail="">
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Cinema source</span>
        <select
          aria-label="Cinema prepared source"
          className={`${fieldControlClassName} min-w-0 px-2`}
          data-prepared-source-id={source.id}
          data-testid="ui-action-prepared-cinema-source"
          onChange={(event) => {
            onSelectSource(event.currentTarget.value);
          }}
          value={source.id}
        >
          {preparedSourceCinemaSourceOptions(sources)}
        </select>
      </label>
      <Button
        data-prepared-source-id={source.id}
        data-testid="ui-action-prepared-cinema-prepare-file"
        disabled={isImporting}
        onClick={() => {
          inputRef.current?.click();
        }}
        size="sm"
        variant="secondary"
      >
        {isImporting ? "Processing..." : "Prepare file"}
      </Button>
      <input
        accept={PREPARED_SOURCE_CINEMA_ACCEPT}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0) ?? null;
          event.currentTarget.value = "";
          if (file) {
            void onPrepareFile(file);
          }
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      {importError ? (
        <p className="rounded border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-2 py-1.5 text-xs leading-5 text-[var(--vs-status-warning)]">
          {importError}
        </p>
      ) : null}
    </div>
  );
}

function PreparedSourceCinemaHeaderSourceSelect({
  source,
  sources,
  onSelectSource,
}: Readonly<{
  source: PreparedSource;
  sources: PreparedSource[];
  onSelectSource: (sourceId: string) => void;
}>) {
  const currentLabel = preparedSourceCinemaOptionLabel(source);
  return (
    <label
      className="hidden min-w-[13rem] max-w-[18rem] flex-1 basis-[13rem] items-center gap-2 lg:flex"
      data-cinema-expanded-source-detail=""
    >
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.16em] vs-muted">
        Cinema
      </span>
      <select
        aria-label={`Select cinema source: ${currentLabel}`}
        className={`${fieldControlClassName} h-11 min-w-0 flex-1 truncate py-0`}
        data-testid="prepared-source-cinema-source-select"
        onChange={(event) => {
          onSelectSource(event.currentTarget.value);
        }}
        title={currentLabel}
        value={source.id}
      >
        {preparedSourceCinemaSourceOptions(sources)}
      </select>
    </label>
  );
}

function preparedSourceCinemaSourceOptions(sources: PreparedSource[]): ReactNode {
  return sources.map((item, index) => (
    <option key={`${item.id}-${String(index)}`} value={item.id}>
      {preparedSourceCinemaOptionLabel(item)}
    </option>
  ));
}

function preparedSourceCinemaOptionLabel(source: PreparedSource): string {
  const envelope = preparedSourceLifecycleEnvelope(source, { lastOpenedSurface: "Cinema" });
  return sourceSelectorOption(envelope, "prepared").optionLabel;
}

class PreparedSourceRendererErrorBoundary extends Component<
  Readonly<{
    children: ReactNode;
    onLifecycleChange: (state: CinemaRendererLifecycleState) => void;
    onRetry: () => void;
    resetKey: string;
  }>,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(): void {
    this.props.onLifecycleChange("failed");
  }

  componentDidUpdate(previousProps: Readonly<{ resetKey: string }>): void {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <PreparedSourceRendererFailedFallback
          detail={cinemaRendererLifecycleDetail("failed")}
          onRetry={this.props.onRetry}
        />
      );
    }
    return <>{this.props.children}</>;
  }
}

function PreparedSourceRendererLoadingFallback({
  onLifecycleChange,
}: Readonly<{
  onLifecycleChange: (state: CinemaRendererLifecycleState) => void;
}>) {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    onLifecycleChange("loading");
    const timer = globalThis.setTimeout(() => {
      setIsSlow(true);
      onLifecycleChange("degraded");
    }, PREPARED_SOURCE_RENDERER_DEGRADED_AFTER_MS);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [onLifecycleChange]);

  return (
    <LazyPanelFallback
      detail={
        isSlow
          ? "Taking longer than expected. The reader will recover automatically or show a retry action if rendering fails."
          : "Preparing this view locally."
      }
      label={isSlow ? "Taking longer than expected" : "Preparing this view locally"}
      minHeightClassName="min-h-64"
      surface="prepared-source-markdown-renderer"
    />
  );
}

function PreparedSourceRendererReady({
  children,
  fallback,
  onLifecycleChange,
}: Readonly<{
  children: ReactNode;
  fallback: ReactNode;
  onLifecycleChange: (state: CinemaRendererLifecycleState) => void;
}>) {
  const delayMs = useMemo(() => rendererDelayMsForLocalQa(), []);
  const [isDelayed, setIsDelayed] = useState(delayMs > 0);

  useEffect(() => {
    setIsDelayed(delayMs > 0);
    if (delayMs <= 0) {
      onLifecycleChange("ready");
      return;
    }
    onLifecycleChange("loading");
    const timer = globalThis.setTimeout(() => {
      setIsDelayed(false);
      onLifecycleChange("ready");
    }, delayMs);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [delayMs, onLifecycleChange]);

  return isDelayed ? fallback : children;
}

function PreparedSourceRendererFailedFallback({
  detail,
  onRetry,
}: Readonly<{ detail: string; onRetry: () => void }>) {
  return (
    <div
      aria-busy="false"
      className="grid min-h-64 content-start gap-3 rounded-md border border-[var(--vs-danger-border)] bg-[var(--vs-danger-soft)] p-4 text-sm"
      data-cinema-renderer-error="true"
      role="alert"
    >
      <div className="min-w-0">
        <p className="font-semibold text-[var(--vs-danger)]">Renderer failed, retry</p>
        <p className="mt-1 text-xs leading-5 text-[var(--vs-danger)]">{detail}</p>
      </div>
      <Button onClick={onRetry} size="sm" variant="secondary">
        Retry renderer
      </Button>
    </div>
  );
}

function rendererDelayMsForLocalQa(): number {
  if (!import.meta.env.DEV) {
    return 0;
  }
  const raw = (globalThis as { __ttsCinemaRendererDelayMs?: number | string })
    .__ttsCinemaRendererDelayMs;
  const value = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  return Number.isFinite(value) && value && value > 0 ? Math.min(value, 15_000) : 0;
}

function PreparedSourceCinemaReader({
  activeBlockId,
  activeWordIndex,
  accessibilitySettings,
  autoFollow,
  calibratedPlaybackCursorSec,
  canvasFirst,
  highlightMotion,
  highlightStyle,
  jobId,
  isFullscreen,
  readAlongVisualMode,
  readAlongTimingState,
  rendererLifecycle,
  rendererRetryKey,
  scrollFollow,
  source,
  schedulerTimeline,
  theatreActive,
  wordSchedulerAvailable,
  onAccessibilitySettingsChange,
  onAutoFollowChange,
  onFullscreenToggle,
  onInspectStructure,
  onRendererLifecycleChange,
  onRendererRetry,
}: Readonly<{
  activeBlockId: string | null;
  activeWordIndex: number;
  accessibilitySettings: ReaderAccessibilitySettings;
  autoFollow: boolean;
  calibratedPlaybackCursorSec: number;
  canvasFirst: boolean;
  highlightMotion: ReadAlongHighlightMotion;
  highlightStyle: ReadAlongHighlightStyle;
  jobId: string | null;
  isFullscreen: boolean;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  readAlongTimingState: ReadAlongTimingState;
  rendererLifecycle: CinemaRendererLifecycleState;
  rendererRetryKey: number;
  scrollFollow: ReadAlongScrollFollow;
  source: PreparedSource;
  schedulerTimeline: WordTimeline | null;
  theatreActive: boolean;
  wordSchedulerAvailable: boolean;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onAutoFollowChange: (enabled: boolean) => void;
  onFullscreenToggle: () => void;
  onInspectStructure: (source: PreparedSource) => void;
  onRendererLifecycleChange: (state: CinemaRendererLifecycleState) => void;
  onRendererRetry: () => void;
}>) {
  const activeWord = useMemo(
    () => resolvePreparedSourceActiveWord(source, activeWordIndex),
    [activeWordIndex, source],
  );
  const activeBlock = useMemo(
    () => source.blocks?.find((block) => block.id === activeWord?.blockId) ?? null,
    [activeWord?.blockId, source.blocks],
  );
  const readerRef = useRef<HTMLDivElement | null>(null);
  const blocks = preparedSourceCinemaPrimaryBlocks(source);
  const isMarkdownDocument = isPreparedSourceMarkdownDocument(source);
  const textClass = `${READER_TEXT_SCALE_CLASS[accessibilitySettings.textScale]} ${
    READER_LINE_SPACING_CLASS[accessibilitySettings.lineSpacing]
  }`;
  const scrollBehavior = readerScrollBehavior(accessibilitySettings);
  const shouldHighlightWord =
    activeBlock &&
    isPreparedCinemaWordHighlightable(activeBlock) &&
    readAlongShouldHighlightWord(readAlongVisualMode) &&
    !wordSchedulerAvailable;
  const shouldHighlightBlock = readAlongShouldHighlightBlock(readAlongVisualMode);
  const blockHighlight =
    activeWord && activeBlock && shouldHighlightBlock
      ? {
          blockEndOffset: activeWord.blockEndOffset,
          blockStartOffset: activeWord.blockStartOffset,
          cueRole: "current" as const,
          nodeId: activeWord.blockId,
          sourceId: source.id,
          timingState: readAlongTimingState,
        }
      : undefined;
  const wordHighlight =
    activeWord && shouldHighlightWord
      ? {
          activeWordOffset: activeWord.wordOffset,
          activeWordIndex,
          blockEndOffset: activeWord.blockEndOffset,
          blockStartOffset: activeWord.blockStartOffset,
          cueRole: "current" as const,
          nodeId: activeWord.blockId,
          sourceId: source.id,
          timingState: readAlongTimingState,
        }
      : undefined;
  let readerContent: ReactNode;
  const rendererFallback = (
    <PreparedSourceRendererLoadingFallback onLifecycleChange={onRendererLifecycleChange} />
  );
  const activeBlockIndex = blocks.findIndex((block) => block.id === activeBlockId);

  if (isMarkdownDocument && source.text) {
    readerContent = (
      <PreparedSourceRendererErrorBoundary
        onLifecycleChange={onRendererLifecycleChange}
        onRetry={onRendererRetry}
        resetKey={`${source.id}:${String(rendererRetryKey)}:document`}
      >
        <Suspense fallback={rendererFallback}>
          <PreparedSourceRendererReady
            fallback={rendererFallback}
            key={`${source.id}:${String(rendererRetryKey)}:document`}
            onLifecycleChange={onRendererLifecycleChange}
          >
            <PreparedMarkdownRenderer
              artifactRendering="document-cinema"
              blockHighlight={blockHighlight}
              className={`markdown-cinema prose-markdown readalong-markdown-renderer mx-auto ${readingSurfaceClassName(
                "spoken",
              )} ${textClass} text-[var(--vs-text)]`}
              wordHighlight={wordHighlight}
            >
              {source.text}
            </PreparedMarkdownRenderer>
          </PreparedSourceRendererReady>
        </Suspense>
      </PreparedSourceRendererErrorBoundary>
    );
  } else if (blocks.length > 0) {
    readerContent = (
      <PreparedSourceRendererReady
        fallback={rendererFallback}
        key={`${source.id}:${String(rendererRetryKey)}:blocks`}
        onLifecycleChange={onRendererLifecycleChange}
      >
        <div
          className={`website-cinema-article mx-auto w-full ${readingSurfaceClassName(
            "spoken",
          )} ${textClass} text-[var(--vs-text)]`}
          data-testid="website-cinema-article"
        >
          {blocks.map((block) => (
            <PreparedSourceCinemaBlock
              activeWordOffset={
                activeWord?.blockId === block.id && shouldHighlightWord
                  ? activeWord.wordOffset
                  : null
              }
              block={block}
              cueRole={preparedSourceCueRole(block, blocks, activeBlockIndex)}
              highlightStyle={highlightStyle}
              isActive={block.id === activeBlockId}
              key={block.id}
              readAlongVisualMode={readAlongVisualMode}
              readAlongTimingState={block.id === activeBlockId ? readAlongTimingState : "trusted"}
              scrollFollow={scrollFollow}
              sourceId={source.id}
              surface={preparedSourceCinemaKind(source) === "website" ? "website" : "document"}
            />
          ))}
        </div>
      </PreparedSourceRendererReady>
    );
  } else {
    readerContent = (
      <PreparedSourceRendererErrorBoundary
        onLifecycleChange={onRendererLifecycleChange}
        onRetry={onRendererRetry}
        resetKey={`${source.id}:${String(rendererRetryKey)}:fallback`}
      >
        <Suspense fallback={rendererFallback}>
          <PreparedSourceRendererReady
            fallback={rendererFallback}
            key={`${source.id}:${String(rendererRetryKey)}:fallback`}
            onLifecycleChange={onRendererLifecycleChange}
          >
            <PreparedMarkdownRenderer
              artifactRendering="document-cinema"
              blockHighlight={blockHighlight}
              className={`markdown-cinema prose-markdown readalong-markdown-renderer mx-auto ${readingSurfaceClassName(
                "spoken",
              )} ${textClass} text-[var(--vs-text)]`}
              wordHighlight={wordHighlight}
            >
              {source.text ?? source.speechText ?? ""}
            </PreparedMarkdownRenderer>
          </PreparedSourceRendererReady>
        </Suspense>
      </PreparedSourceRendererErrorBoundary>
    );
  }

  if (rendererLifecycle === "failed") {
    readerContent = (
      <PreparedSourceRendererFailedFallback
        detail={cinemaRendererLifecycleDetail(rendererLifecycle)}
        onRetry={onRendererRetry}
      />
    );
  }

  useEffect(() => {
    if (!wordSchedulerAvailable || !jobId || !schedulerTimeline || rendererLifecycle !== "ready") {
      return;
    }
    const surface = preparedSourceCinemaKind(source) === "website" ? "website" : "document";
    const scheduler = new ReadAlongWordScheduler({
      audioElement: () => readAlongAudioElementForJob(jobId),
      highlight: {
        accessibilitySettings,
        autoFollow,
        highlightMotion,
        highlightStyle,
        mode: readAlongVisualMode,
        root: () => readerRef.current,
        scrollFollow,
        sourceId: source.id,
        surface,
      },
      initialCursorSec: calibratedPlaybackCursorSec,
      timeline: schedulerTimeline,
    });
    scheduler.start();
    return () => {
      scheduler.stop();
    };
  }, [
    accessibilitySettings,
    autoFollow,
    calibratedPlaybackCursorSec,
    highlightMotion,
    highlightStyle,
    jobId,
    readAlongVisualMode,
    rendererLifecycle,
    schedulerTimeline,
    scrollFollow,
    source,
    wordSchedulerAvailable,
  ]);

  useEffect(() => {
    if (!autoFollow || activeWordIndex < 0 || wordSchedulerAvailable) {
      return;
    }
    const anchor =
      activeWord && shouldHighlightWord
        ? readAlongAnchorForWord({
            nodeId: activeWord.blockId,
            sourceId: source.id,
            tokenOffset: activeWord.wordOffset,
            wordIndex: activeWordIndex,
          })
        : readAlongAnchorForBlock({
            nodeId: activeBlock?.id ?? activeBlockId,
            sourceId: source.id,
          });
    scrollReadAlongAnchor(readerRef.current, anchor, {
      autoFollow,
      fallbackSelectors: [
        ".prepared-source-cinema-active",
        ".website-cinema-word-active",
        ".markdown-cinema-word-active",
        ".markdown-cinema-block-active",
      ],
      mode: readAlongVisualMode,
      scrollFollow,
      settings: accessibilitySettings,
      surface: preparedSourceCinemaKind(source) === "website" ? "website" : "document",
    });
  }, [
    accessibilitySettings,
    activeBlock?.id,
    activeBlockId,
    activeWord,
    activeWordIndex,
    autoFollow,
    readAlongVisualMode,
    scrollFollow,
    shouldHighlightWord,
    source,
    wordSchedulerAvailable,
  ]);

  useEffect(() => {
    if (!activeBlockId) {
      return;
    }
    const directBlockId = `cinema-block-${activeBlockId}`;
    const directBlock = readerRef.current?.querySelector<HTMLElement>(
      `#${CSS.escape(directBlockId)}`,
    );
    if (directBlock) {
      directBlock.scrollIntoView({ block: "center", inline: "nearest", behavior: scrollBehavior });
      return;
    }
    const block = source.blocks?.find((item) => item.id === activeBlockId);
    if (!block) {
      return;
    }
    const label = markdownBlockText(block).trim();
    if (!label) {
      return;
    }
    const heading = [...(readerRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? [])].find(
      (element) => element.textContent.trim() === label,
    );
    heading?.scrollIntoView({ block: "start", inline: "nearest", behavior: scrollBehavior });
  }, [activeBlockId, scrollBehavior, source.blocks]);

  return (
    <ReaderCanvasFrame
      canvasFirst={canvasFirst}
      contentClassName="min-h-0 flex-1 overflow-y-auto scroll-pb-[calc(var(--cinema-footer-max-height)+4rem)] px-6 py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-12 sm:py-8 lg:px-10 lg:pb-8 xl:px-12"
      contentDataAttributes={{
        ...readerDataAttributes(accessibilitySettings),
        ...readingSurfaceDataAttributes({ kind: "spoken" }),
        "data-cinema-sync-active-word-index": activeWordIndex,
        "data-cinema-sync-display-driver": wordSchedulerAvailable ? "word-scheduler" : "react",
        "data-cinema-sync-playback-cursor-sec": calibratedPlaybackCursorSec.toFixed(3),
        "data-cinema-reader-scroll-padding": "transport-safe",
        "data-readalong-highlight-motion": highlightMotion,
      }}
      contentRef={readerRef}
      frameMode="reading"
      measureClassName={READER_MEASURE_CLASS[accessibilitySettings.measure]}
      toolbar={
        theatreActive ? null : (
          <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
            <div className="flex items-center gap-1">
              <Button
                aria-label="Decrease text size"
                className="grid place-items-center text-lg font-medium"
                onClick={() => {
                  onAccessibilitySettingsChange({
                    ...accessibilitySettings,
                    textScale: decreasePreparedSourceCinemaTextSize(
                      accessibilitySettings.textScale,
                    ),
                  });
                }}
                size="icon"
                variant="ghost"
              >
                A-
              </Button>
              <Button
                aria-label="Increase text size"
                className="grid place-items-center text-lg font-medium"
                onClick={() => {
                  onAccessibilitySettingsChange({
                    ...accessibilitySettings,
                    textScale: increasePreparedSourceCinemaTextSize(
                      accessibilitySettings.textScale,
                    ),
                  });
                }}
                size="icon"
                variant="ghost"
              >
                A+
              </Button>
              <Button
                aria-label="Content Structure"
                className="grid place-items-center"
                onClick={() => {
                  onInspectStructure(source);
                }}
                size="icon"
                variant="ghost"
              >
                <ListIcon />
              </Button>
            </div>
            <div className="hidden items-center gap-3 text-sm sm:flex">
              <Toggle
                checked={autoFollow}
                className="border-0 bg-transparent px-2 py-1"
                label="Auto-follow"
                onChange={onAutoFollowChange}
              />
              <Button
                aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="grid place-items-center"
                onClick={onFullscreenToggle}
                size="icon"
                variant="ghost"
              >
                <FullscreenIcon />
              </Button>
            </div>
          </div>
        )
      }
    >
      {readerContent}
    </ReaderCanvasFrame>
  );
}

function PreparedSourceCinemaMobileSheet({
  activeBlock,
  bookmarkItems,
  canBookmark,
  displayControls,
  importError,
  isImporting,
  job,
  mobilePanel,
  outlineItems,
  progress,
  recentItems,
  source,
  sources,
  onAddBookmark,
  onBookmarkNavigate,
  onDiscardTemporarySource,
  onInspectStructure,
  onKeepTemporarySource,
  onMobilePanelChange,
  onOutlineNavigate,
  onPrepareFile,
  onRecentNavigate,
  onSelectSource,
  onResumeProgress,
  onTheatreMode,
}: Readonly<{
  activeBlock: NarrationBlock | null;
  bookmarkItems: ReaderBookmarkItem[];
  canBookmark: boolean;
  displayControls: ReactNode;
  importError: string | null;
  isImporting: boolean;
  job: VoiceJob | null;
  mobilePanel: PreparedSourceCinemaMobilePanel | null;
  outlineItems: ReaderOutlineItem<PreparedSourceCinemaOutlineItem>[];
  progress: PlaybackProgress | null;
  recentItems: ReaderRecentPositionItem[];
  source: PreparedSource;
  sources: PreparedSource[];
  onAddBookmark: () => void;
  onBookmarkNavigate: (bookmark: ReaderBookmarkItem) => void;
  onDiscardTemporarySource?: (source: PreparedSource) => void;
  onInspectStructure: (source: PreparedSource) => void;
  onKeepTemporarySource?: (source: PreparedSource, title?: string) => void;
  onMobilePanelChange: (panel: PreparedSourceCinemaMobilePanel | null) => void;
  onOutlineNavigate: (item: ReaderOutlineItem<PreparedSourceCinemaOutlineItem>) => void;
  onPrepareFile: (file: File) => Promise<void>;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
  onSelectSource: (sourceId: string) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onTheatreMode: () => void;
}>) {
  const returnToCanvas = () => {
    onMobilePanelChange(null);
    returnFocusToCinemaReaderCanvas();
  };
  const handleBookmarkNavigate = (bookmark: ReaderBookmarkItem) => {
    onBookmarkNavigate(bookmark);
    returnToCanvas();
  };
  const handleOutlineNavigate = (item: ReaderOutlineItem<PreparedSourceCinemaOutlineItem>) => {
    onOutlineNavigate(item);
    returnToCanvas();
  };
  const handleRecentNavigate = (item: ReaderRecentPositionItem) => {
    onRecentNavigate(item);
    returnToCanvas();
  };
  const handleResumeProgress = (nextProgress: PlaybackProgress) => {
    onResumeProgress(nextProgress);
    returnToCanvas();
  };
  const metrics = preparedSourceCinemaMetrics(source);
  const activeText = activeBlock ? markdownBlockText(activeBlock) : "";
  const href = preparedSourceCinemaSourceHref(source);
  const temporaryContract = cinemaContractFromPreparedSource(
    source,
    preparedSourceCinemaKind(source) === "website" ? "website" : "document",
  );
  const isTemporarySource = temporaryContract.isTemporary;
  const panels: CinemaMobilePanelSpec<PreparedSourceCinemaMobilePanel>[] = [
    ...(isTemporarySource
      ? [
          {
            children: (
              <div className="grid gap-3 text-sm">
                <div className="grid gap-2 rounded-md border p-3 vs-border vs-surface">
                  <StatusChip tone="metadata">Temporary source</StatusChip>
                  <p className="leading-6 vs-muted">
                    Keep this source when the extraction, edits, or generated audio should become
                    part of a project.
                  </p>
                  <StatusChip tone="metadata">{temporaryContract.expiryLabel}</StatusChip>
                </div>
                <Button
                  data-testid="ui-action-prepared-cinema-mobile-keep-temporary"
                  disabled={!onKeepTemporarySource}
                  onClick={() => {
                    onKeepTemporarySource?.(source);
                  }}
                  size="md"
                  variant="secondary"
                >
                  Keep in project
                </Button>
                <Button
                  data-testid="ui-action-prepared-cinema-mobile-rename-keep-temporary"
                  disabled={!onKeepTemporarySource}
                  onClick={() => {
                    const title = globalThis.prompt(
                      "Rename before keeping",
                      source.title ?? source.sourceName,
                    );
                    if (title !== null) {
                      onKeepTemporarySource?.(source, title);
                    }
                  }}
                  size="md"
                  variant="ghost"
                >
                  Rename before keeping
                </Button>
              </div>
            ),
            id: "keep" as const,
            label: TEMPORARY_SOURCE_COPY.actions.keep,
          },
          {
            children: (
              <div className="grid gap-3 text-sm">
                <p className="rounded-md border p-3 leading-6 vs-border vs-surface vs-muted">
                  Discard temporary source removes this temporary source and its session-scoped
                  work. Keep in project first if the source should become durable.
                </p>
                <Button
                  data-testid="ui-action-prepared-cinema-mobile-discard-temporary"
                  disabled={!onDiscardTemporarySource}
                  onClick={() => {
                    onDiscardTemporarySource?.(source);
                  }}
                  size="md"
                  variant="destructive"
                >
                  Discard temporary source
                </Button>
              </div>
            ),
            id: "discard" as const,
            label: TEMPORARY_SOURCE_COPY.actions.discard,
          },
        ]
      : []),
    {
      children: (
        <div className="grid gap-3 text-sm">
          <p className="leading-6 vs-muted">
            Switch to the reader-first Theatre layout for focused follow-along.
          </p>
          <Button
            className="border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-action-primary)]"
            data-testid="ui-action-prepared-cinema-mobile-theatre"
            onClick={onTheatreMode}
            size="md"
            variant="secondary"
          >
            Enter Theatre
          </Button>
        </div>
      ),
      id: "theatre",
      label: "Theatre",
    },
    {
      children: (
        <div className="grid gap-4 text-sm">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <GlobeIcon />
              Source Summary
            </h3>
            <div className="mt-3 rounded-md border p-3 vs-border">
              <PreparedSourceCinemaSourceLibrary
                importError={importError}
                isImporting={isImporting}
                source={source}
                sources={sources}
                onPrepareFile={onPrepareFile}
                onSelectSource={onSelectSource}
              />
              <p className="line-clamp-2 font-medium">{preparedSourceCinemaTitle(source)}</p>
              {href ? (
                <a
                  className="mt-1 block truncate text-[var(--vs-status-info)]"
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {href}
                </a>
              ) : null}
              {isTemporarySource ? (
                <div className="mt-3 grid gap-2 border-t pt-3 vs-border">
                  <div className="flex flex-wrap gap-2">
                    <StatusChip tone="metadata">Temporary</StatusChip>
                    <StatusChip tone="metadata">{temporaryContract.statusLabel}</StatusChip>
                  </div>
                  <StatusChip tone="metadata">{temporaryContract.expiryLabel}</StatusChip>
                  <Button
                    disabled={!onKeepTemporarySource}
                    onClick={() => {
                      onKeepTemporarySource?.(source);
                    }}
                    size="md"
                    variant="primary"
                  >
                    Keep in project
                  </Button>
                  {job?.audioUrl ? (
                    <a
                      className="cinema-touch-target inline-flex h-10 items-center justify-center rounded-md border border-[var(--vs-action-secondary-border)] bg-[var(--vs-action-secondary-bg)] px-3 text-sm font-semibold text-[var(--vs-action-secondary-text)] shadow-sm"
                      download
                      href={job.audioUrl}
                    >
                      Export audio only
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <StructureIcon />
              Content Structure
            </h3>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <MobileMetric
                label="H1"
                tone="orange"
                value={Math.max(1, source.summary.headingCount)}
              />
              <MobileMetric label="Blocks" tone="blue" value={metrics.blockCount} />
              <MobileMetric label="Skipped" tone="green" value={metrics.skippedCount} />
              <MobileMetric label="Words" tone="neutral" value={metrics.wordCount} />
            </div>
          </div>
        </div>
      ),
      icon: <LinkIcon />,
      id: "source",
      label: "Source",
    },
    {
      children: (
        <div className="grid gap-3 text-sm">
          <ReaderWayfindingPanel
            activeTab="outline"
            bookmarks={bookmarkItems}
            canBookmark={canBookmark}
            maxItems={8}
            outlineItems={outlineItems}
            recentItems={recentItems}
            onAddBookmark={onAddBookmark}
            onBookmarkNavigate={handleBookmarkNavigate}
            onOutlineNavigate={handleOutlineNavigate}
            onRecentNavigate={handleRecentNavigate}
          />
          <Button
            onClick={() => {
              onInspectStructure(source);
            }}
            size="md"
            variant="secondary"
          >
            Content Structure
          </Button>
        </div>
      ),
      icon: <ListIcon />,
      id: "structure",
      label: "Structure",
    },
    {
      children: (
        <div className="grid gap-3 text-sm">
          <p className="line-clamp-4 leading-6">
            {activeText || "Playback will show the current narrated block here."}
          </p>
          <MetadataRow label="Audio" value={job ? "Generated" : "Not generated"} />
          {progress ? (
            <Button
              onClick={() => {
                handleResumeProgress(progress);
              }}
              size="md"
              variant="soft"
            >
              Resume saved point
            </Button>
          ) : null}
        </div>
      ),
      icon: <PreparedSourceCinemaAudioBarsIcon />,
      id: "narration",
      label: "Narration",
    },
  ];

  return (
    <CinemaMobileSheet
      activePanelId={mobilePanel}
      displayControls={displayControls}
      id={PREPARED_SOURCE_CINEMA_MOBILE_SHEET_ID}
      label="Cinema more controls"
      panels={panels}
      onPanelChange={onMobilePanelChange}
    />
  );
}

function PreparedSourceCinemaBlock({
  activeWordOffset,
  block,
  cueRole,
  highlightStyle,
  isActive,
  readAlongVisualMode,
  readAlongTimingState,
  scrollFollow,
  sourceId,
  surface,
}: Readonly<{
  activeWordOffset: number | null;
  block: NarrationBlock;
  cueRole: ReadAlongCueRole;
  highlightStyle: ReadAlongHighlightStyle;
  isActive: boolean;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  readAlongTimingState: ReadAlongTimingState;
  scrollFollow: ReadAlongScrollFollow;
  sourceId: string;
  surface: "document" | "website";
}>) {
  const ref = useRef<HTMLElement | null>(null);
  const text = markdownBlockText(block);
  const highlightActiveBlock = isActive && readAlongVisualMode !== "none";

  if (!text.trim()) {
    return null;
  }

  const id = `cinema-block-${block.id}`;
  const content = renderPreparedSourceCinemaBlockContent({
    activeWordOffset,
    block,
    cueRole,
    highlightStyle,
    isActive,
    readAlongVisualMode,
    readAlongTimingState,
    sourceId,
    surface,
    text,
  });
  if (block.kind === "heading") {
    return (
      <h1
        className={`mt-0 scroll-mt-20 text-3xl font-semibold leading-tight tracking-[-0.01em] first:mt-0 sm:text-[28px] ${
          highlightActiveBlock ? "prepared-source-cinema-active" : ""
        }`}
        data-readalong-cue-role={cueRole}
        data-readalong-node-id={block.id}
        data-readalong-scroll-follow={scrollFollow}
        data-readalong-source-id={sourceId}
        data-readalong-timing-state={readAlongTimingState}
        id={id}
        ref={ref as React.RefObject<HTMLHeadingElement>}
      >
        {content}
      </h1>
    );
  }
  if (block.kind === "subheading") {
    return (
      <h2
        className={`mt-8 scroll-mt-20 text-xl font-semibold leading-snug ${
          highlightActiveBlock ? "prepared-source-cinema-active" : ""
        }`}
        data-readalong-cue-role={cueRole}
        data-readalong-node-id={block.id}
        data-readalong-scroll-follow={scrollFollow}
        data-readalong-source-id={sourceId}
        data-readalong-timing-state={readAlongTimingState}
        id={id}
        ref={ref as React.RefObject<HTMLHeadingElement>}
      >
        {content}
      </h2>
    );
  }
  return (
    <section
      className={`my-5 scroll-mt-20 transition ${
        highlightActiveBlock ? "text-[var(--vs-text)]" : ""
      } ${highlightActiveBlock ? "prepared-source-cinema-active" : ""}`}
      data-readalong-cue-role={cueRole}
      data-readalong-node-id={block.id}
      data-readalong-scroll-follow={scrollFollow}
      data-readalong-source-id={sourceId}
      data-readalong-timing-state={readAlongTimingState}
      id={id}
      ref={ref}
    >
      {content}
    </section>
  );
}

function preparedSourceCueRole(
  block: NarrationBlock,
  blocks: readonly NarrationBlock[],
  activeBlockIndex: number,
): ReadAlongCueRole {
  if (!preparedSourceNarrationBlockIsSpeakable(block)) {
    return "skipped";
  }
  if (activeBlockIndex < 0) {
    return "unavailable";
  }
  const activeBlock = blocks.at(activeBlockIndex);
  if (!activeBlock) {
    return "unavailable";
  }
  const speakableBlocks = blocks.filter((item) => preparedSourceNarrationBlockIsSpeakable(item));
  const activeSpeakableIndex = speakableBlocks.findIndex((item) => item.id === activeBlock.id);
  const blockSpeakableIndex = speakableBlocks.findIndex((item) => item.id === block.id);
  if (activeSpeakableIndex === -1 || blockSpeakableIndex === -1) {
    return "unavailable";
  }
  if (blockSpeakableIndex === activeSpeakableIndex) {
    return "current";
  }
  if (blockSpeakableIndex === activeSpeakableIndex + 1) {
    return "next";
  }
  if (blockSpeakableIndex < activeSpeakableIndex) {
    return "previous";
  }
  return "unavailable";
}

function renderPreparedSourceCinemaBlockContent({
  activeWordOffset,
  block,
  cueRole,
  highlightStyle,
  isActive,
  readAlongVisualMode,
  readAlongTimingState,
  sourceId,
  surface,
  text,
}: Readonly<{
  activeWordOffset: number | null;
  block: NarrationBlock;
  cueRole: ReadAlongCueRole;
  highlightStyle: ReadAlongHighlightStyle;
  isActive: boolean;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  readAlongTimingState: ReadAlongTimingState;
  sourceId: string;
  surface: "document" | "website";
  text: string;
}>): ReactNode {
  if (block.kind === "code" && looksLikeMermaidDiagram(text)) {
    return (
      <Suspense
        fallback={
          <LazyPanelFallback
            label="Loading diagram..."
            minHeightClassName="min-h-36"
            surface="prepared-source-diagram-renderer"
          />
        }
      >
        <PreparedMermaidDiagram chart={text} />
      </Suspense>
    );
  }
  if (block.kind === "code") {
    return (
      <pre>
        <code>{text}</code>
      </pre>
    );
  }
  const words = (
    <HighlightRenderer
      activeWordIndex={activeWordOffset}
      cueRole={cueRole}
      highlightStyle={highlightStyle}
      mode={readAlongVisualMode}
      nodeId={block.id}
      sourceId={sourceId}
      surface={surface}
      text={text}
      timingState={readAlongTimingState}
      wordRole={cueRole === "skipped" ? "skipped" : undefined}
    />
  );
  if (block.kind === "heading" || block.kind === "subheading") {
    return <>{words}</>;
  }
  if (isActive && readAlongVisualMode !== "none") {
    return (
      <p className="m-0">
        <span className="rounded-md bg-[var(--vs-highlight-current-word)] px-1 py-0.5 box-decoration-clone">
          {words}
        </span>
      </p>
    );
  }
  return <p className="m-0">{words}</p>;
}

function HealthRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <CheckIcon />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right font-medium text-[var(--vs-status-success)]">{value}</span>
    </div>
  );
}

function PolicyMetric({
  icon,
  label,
  value,
}: Readonly<{ icon: ReactNode; label: string; value: string }>) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1">
      <span className="text-[var(--vs-text-muted)]">{icon}</span>
      <span className="max-w-full truncate font-medium leading-none">{label}</span>
      <span className="max-w-full truncate leading-none vs-muted">{value}</span>
    </div>
  );
}

function MobileMetric({
  label,
  tone,
  value,
}: Readonly<{ label: string; tone: "blue" | "green" | "neutral" | "orange"; value: number }>) {
  const toneClass = {
    blue: "border-[var(--vs-status-info-border)] bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]",
    green:
      "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]",
    neutral: "vs-border bg-[var(--vs-surface)] text-[var(--vs-text)]",
    orange:
      "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  valueTone = "default",
}: Readonly<{ label: string; value: string; valueTone?: "default" | "success" }>) {
  return (
    <div className="grid min-w-0 grid-cols-[5.6rem_minmax(0,1fr)] gap-3">
      <dt className="vs-muted">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right font-medium leading-5 ${
          valueTone === "success" ? "text-[var(--vs-status-success)]" : ""
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

function websiteSourceMetadata(source: PreparedSource): Record<string, string> {
  return stringRecord(source.metadata?.websiteMetadata);
}

function websiteUrlProvenance(source: PreparedSource): Record<string, string> {
  return stringRecord(source.metadata?.urlProvenance);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    if (typeof rawValue === "string" && rawValue.trim() !== "") {
      record[key] = rawValue.trim();
    }
  }
  return record;
}

function domainFromHref(href: string | null): string {
  if (!href) {
    return "";
  }
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function activeOutlineItem(
  outline: PreparedSourceCinemaOutlineItem[],
  activeBlock: NarrationBlock | null,
): PreparedSourceCinemaOutlineItem | null {
  if (outline.length === 0) {
    return null;
  }
  if (!activeBlock) {
    return outline[0];
  }
  for (let index = outline.length - 1; index >= 0; index -= 1) {
    const item = outline[index];
    if (item.index <= activeBlock.index || item.blockId === activeBlock.id) {
      return item;
    }
  }
  return outline[0];
}

function blockSnippet(block: NarrationBlock | null, fallback: string): string {
  const text = block ? markdownBlockText(block).trim() : "";
  if (!text) {
    return fallback;
  }
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function preparedSourceActiveWordText(
  source: PreparedSource,
  activeWordIndex: number,
): string | null {
  const activeWord = resolvePreparedSourceActiveWord(source, activeWordIndex);
  const block = source.blocks?.find((item) => item.id === activeWord?.blockId);
  if (!activeWord || !block) {
    return null;
  }
  return markdownBlockText(block).trim().split(/\s+/)[activeWord.wordOffset] ?? null;
}

function blockKindLabel(block: NarrationBlock): string {
  if (block.kind === "heading" || block.kind === "subheading") {
    return "Heading";
  }
  if (block.kind === "body") {
    return "Paragraph";
  }
  return sentenceCase(block.kind);
}

function readerModeLabel(source: PreparedSource): string {
  const readerMode = source.metadata?.readerMode;
  if (typeof readerMode === "string" && readerMode.trim()) {
    return sentenceCase(readerMode);
  }
  return source.status === "ready" ? "Success" : "Review";
}

function isPreparedCinemaWordHighlightable(block: NarrationBlock): boolean {
  return (
    (block.kind === "body" ||
      block.kind === "heading" ||
      block.kind === "subheading" ||
      block.kind === "quote") &&
    block.speakMode === "speak"
  );
}

function decreasePreparedSourceCinemaTextSize(
  size: PreparedSourceCinemaTextSize,
): PreparedSourceCinemaTextSize {
  const order: PreparedSourceCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "comfortable";
}

function increasePreparedSourceCinemaTextSize(
  size: PreparedSourceCinemaTextSize,
): PreparedSourceCinemaTextSize {
  const order: PreparedSourceCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "large";
}

function temporaryPromotionItems({
  artifactCount,
  bookmarkCount,
  hasAudio,
  hasPolicy,
  hasTiming,
  reviewEditCount,
}: Readonly<{
  artifactCount: number;
  bookmarkCount: number;
  hasAudio: boolean;
  hasPolicy: boolean;
  hasTiming: boolean;
  reviewEditCount: number;
}>): string[] {
  const items: string[] = [TEMPORARY_SOURCE_COPY.promotion.extractedSource];
  if (reviewEditCount > 0) {
    items.push("Review edits");
  }
  if (hasPolicy) {
    items.push(TEMPORARY_SOURCE_COPY.promotion.sourcePin);
  }
  if (hasAudio) {
    items.push(TEMPORARY_SOURCE_COPY.promotion.generatedAudio);
  }
  if (hasTiming) {
    items.push("Timing maps");
  }
  if (bookmarkCount > 0) {
    items.push("Bookmarks");
  }
  if (artifactCount > 0 && !hasAudio && !hasTiming) {
    items.push("Generated artifacts");
  }
  return items;
}

function temporaryTimingConfidenceLabel(job: VoiceJob | null): string {
  const alignmentQuality = job?.timing?.alignmentQuality;
  if (alignmentQuality?.primaryLevel) {
    return alignmentQuality.primaryLevel;
  }
  if (job?.timing?.summary.mode) {
    return job.timing.summary.mode;
  }
  return "No timing map";
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function sentenceCase(value: string): string {
  const normalised = value.replaceAll(/[-_]+/g, " ").trim();
  return normalised ? `${normalised.charAt(0).toUpperCase()}${normalised.slice(1)}` : value;
}

function scrollToCinemaBlock(blockId: string, behavior: ScrollBehavior) {
  const elementId = `cinema-block-${blockId}`;
  document
    .querySelector<HTMLElement>(`#${CSS.escape(elementId)}`)
    ?.scrollIntoView({ block: "center", inline: "nearest", behavior });
}

function preparedSourceAlignmentRepairFingerprint(
  source: PreparedSource,
  job: VoiceJob | null,
): string {
  return JSON.stringify({
    pipelineOptions: job?.pipelineOptions ?? null,
    preparedSourceId: source.id,
    runMode: job?.runMode ?? null,
    sourcePolicyOverrides: source.sourceSpeechPolicyOverrides ?? null,
    sourcePolicyProfile: source.sourceSpeechPolicyProfile ?? null,
    sourcePolicyUpdatedAt: source.updatedAt,
    speechPolicyProfile: source.speechPolicyProfile,
  });
}

function preparedSourceSpeechPlanRepairId(source: PreparedSource, job: VoiceJob | null): string {
  if (!job) {
    return "missing-speech-plan";
  }
  return [
    job.id,
    job.speechPolicyProfile ?? source.speechPolicyProfile,
    job.runMode ?? "run-mode",
    job.performanceMode ?? "performance-mode",
  ].join(":");
}

function alignmentRepairStorageKey(projectId: string, sourceId: string): string {
  return `tts-alignment-repair:${projectId}:${sourceId}`;
}

function loadAlignmentRepairMap(projectId: string, sourceId: string): AlignmentRepairMap | null {
  if (!("localStorage" in globalThis)) {
    return null;
  }
  const raw = globalThis.localStorage.getItem(alignmentRepairStorageKey(projectId, sourceId));
  if (!raw) {
    return null;
  }
  try {
    return parseAlignmentRepairMap(raw);
  } catch {
    return null;
  }
}

function saveAlignmentRepairMap(
  projectId: string,
  sourceId: string,
  repairMap: AlignmentRepairMap | null,
) {
  if (!("localStorage" in globalThis)) {
    return;
  }
  const key = alignmentRepairStorageKey(projectId, sourceId);
  if (!repairMap) {
    globalThis.localStorage.removeItem(key);
    return;
  }
  globalThis.localStorage.setItem(key, serializeAlignmentRepairMap(repairMap));
}

function CinemaFilmIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
      <path
        d="M8 5v14M16 5v14M3 9h5M16 9h5M3 15h5M16 15h5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m10.5 9.4 4.2 2.6-4.2 2.6V9.4Z" fill="currentColor" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[var(--vs-status-success)]"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        clipRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.7a1 1 0 0 0-1.4-1.4L9 10.17 7.7 8.9a1 1 0 1 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function DialIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 21a9 9 0 1 0-9-9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path d="m12 12 4-4" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 14a4 4 0 0 0 4-4V5a4 4 0 0 0-8 0v5a4 4 0 0 0 4 4ZM5 10a7 7 0 0 0 14 0M12 17v4M8 21h8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SkippedIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0 vs-muted" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4v3M12 17v3M5 12h3M16 12h3M7.8 7.8l2.1 2.1M14.1 14.1l2.1 2.1M16.2 7.8l-2.1 2.1M9.9 14.1l-2.1 2.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function StructureIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M12 4v5M6 20v-5h12v5M6 15v-3h12v3M12 9h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export { preparedSourceCinemaActionLabel } from "./preparedSourceModel";
