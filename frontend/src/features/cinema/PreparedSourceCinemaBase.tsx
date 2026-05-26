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
import { useAudioWaveformBars } from "../../audioWaveform";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { ReaderCanvasFrame } from "../../components/reader/ReaderCanvasFrame";
import { Button, fieldControlClassName, Toggle } from "../../design";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import { looksLikeMermaidDiagram } from "../../markdownModel";
import type {
  CustomSpeechPolicyProfile,
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
import { HeaderContextSummary } from "../header";
import { ExitIcon, SettingsIcon } from "../navigation";
import { LazyPanelFallback } from "../performance";
import { generatedAudioLifecycleFromJob, playbackActionLabel } from "../playback";
import { PolicyScopeSummary, policyScopeSummary, SourcePolicyPinEditor } from "../policy";
import type { UiMemoryCinemaState } from "../preferences";
import {
  evaluatePreparedSourceReadAlongInvariant,
  readAlongInvariantStatusLabel,
  resolveReadAlongRuntimeSnapshot,
} from "../readalong";
import {
  normalizeReaderAccessibilitySettings,
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_SEEK_SECONDS,
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
import { ReaderSettingsPopover } from "../settings/ReaderSettingsPopover";
import {
  preparedSourceLifecycleEnvelope,
  sourceSelectorOption,
} from "../source-lifecycle/sourceSelectors";
import { WebsiteExtractionReview } from "../website-cinema/WebsiteExtractionReview";
import {
  WebsiteExtractionSummary,
  websiteExtractionQuality,
} from "../website-cinema/WebsiteExtractionSummary";
import { useCinemaFocusController } from "./CinemaFocusController";
import { CinemaFocusModeToolbar } from "./CinemaFocusModeToolbar";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import {
  buildCinemaCurrentReadingSection,
  buildCinemaInspectorPanels,
  buildCinemaInspectorSection,
  buildCinemaWayfindingSection,
  ReadAlongInvariantDebugPanel,
} from "./CinemaInspectorPanels";
import {
  type CinemaMobilePanelSpec,
  CinemaMobileSheet,
  returnFocusToCinemaReaderCanvas,
} from "./CinemaMobileSheet";
import { CinemaShell } from "./CinemaShell";
import { CinemaTransportBar, type CinemaTransportModel } from "./CinemaTransportBar";
import {
  type CinemaRendererLifecycleState,
  cinemaRendererLifecycleDetail,
  cinemaRendererLifecycleLabel,
  deriveCinemaPlaybackState,
  deriveCinemaReadinessDisplay,
  isCinemaRendererReady,
} from "./model";
import { PreparedSourcePolicyNotes } from "./policy-notes/PreparedSourcePolicyNotes";
import {
  isPreparedSourceMarkdownDocument,
  type PreparedSourceCinemaKind,
  type PreparedSourceCinemaOutlineItem,
  type PreparedSourceCinemaTextSize,
  preparedSourceCinemaActiveBlock,
  preparedSourceCinemaJobMatchesSource,
  preparedSourceCinemaKind,
  preparedSourceCinemaLabel,
  preparedSourceCinemaMetrics,
  preparedSourceCinemaOutline,
  preparedSourceCinemaPrimaryBlocks,
  preparedSourceCinemaSkippedGroups,
  preparedSourceCinemaSourceHref,
  preparedSourceCinemaTitle,
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
  playbackRate: number;
  pause: () => void;
  play: () => Promise<void> | void;
  restart: () => Promise<void> | void;
  seekTo?: (seconds: number) => void;
  setPlaybackRate?: (rate: number) => void;
  skipBy?: (seconds: number) => void;
}

type PreparedSourceCinemaMobilePanel = "source" | "structure" | "narration";
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
  source,
  surfaceKind,
  sourcePolicySaving,
  sources,
  themeName,
  uiMemoryFocusState,
  uiMemoryResetSignal,
  onClose,
  onAccessibilitySettingsChange,
  onBookmark,
  onClearSourcePolicy,
  onCreateAudio,
  onInspectStructure,
  onPrepareFile,
  onPlayPause,
  onRerunWebsiteExtraction,
  onRestart,
  onResumeProgress,
  onSaveSourcePolicy,
  onSelectSource,
  onSkip,
  onThemeChange,
  onUiMemoryFocusStateChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  activeWordIndex: number;
  canCreateAudio: boolean;
  customPolicyProfiles: CustomSpeechPolicyProfile[];
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
  source: PreparedSource;
  surfaceKind?: PreparedSourceCinemaKind;
  sourcePolicySaving: boolean;
  sources: PreparedSource[];
  themeName: ThemeName;
  uiMemoryFocusState: UiMemoryCinemaState;
  uiMemoryResetSignal: number;
  onClose: () => void;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onClearSourcePolicy: () => Promise<void> | void;
  onCreateAudio: (source: PreparedSource) => void;
  onInspectStructure: (source: PreparedSource) => void;
  onPrepareFile: (file: File) => Promise<void>;
  onPlayPause: () => void;
  onRerunWebsiteExtraction?: (source: PreparedSource, containerSelector: string) => void;
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSaveSourcePolicy: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
  onSelectSource: (sourceId: string) => void;
  onSkip: (seconds: number) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUiMemoryFocusStateChange: (state: UiMemoryCinemaState) => void;
}>) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousSourceIdRef = useRef(source.id);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PreparedSourceCinemaMobilePanel | null>(null);
  const [pointedBlockId, setPointedBlockId] = useState<string | null>(null);
  const [rendererLifecycle, setRendererLifecycle] =
    useState<CinemaRendererLifecycleState>("notStarted");
  const [rendererRetryKey, setRendererRetryKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const title = preparedSourceCinemaTitle(source);
  const cinemaLabel = preparedSourceCinemaLabelForKind(source, surfaceKind);
  const isWebsiteCinema =
    surfaceKind === "website" || preparedSourceCinemaKind(source) === "website";
  const effectivePlaybackCursorSec =
    playbackCursorSec > 0 ? playbackCursorSec : (progress?.currentTimeSec ?? playbackCursorSec);
  const effectiveActiveWordIndex =
    activeWordIndex > 0 ? activeWordIndex : (progress?.activeWordIndex ?? activeWordIndex);
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
    () => readerRecentPositionsFromProgress(progressItems, { preparedSources: sourceLabels }),
    [progressItems, sourceLabels],
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
  const readAlongRuntime = useMemo(
    () =>
      resolveReadAlongRuntimeSnapshot({
        audioTimeSec: effectivePlaybackCursorSec,
        generatedAudioState,
        highlightMap: null,
        isPaused: !playbackControls.isPlaying,
        isPlaying: playbackControls.isPlaying,
      }),
    [effectivePlaybackCursorSec, generatedAudioState, playbackControls.isPlaying],
  );
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
            {href ? (
              <div className="grid min-w-0 grid-cols-[5.6rem_minmax(0,1fr)] gap-3">
                <dt className="vs-muted">URL</dt>
                <dd className="min-w-0 truncate text-blue-600" title={href}>
                  <a href={href} rel="noreferrer" target="_blank">
                    {href}
                  </a>
                </dd>
              </div>
            ) : null}
            <MetadataRow label="Fetched" value={formatDateTime(source.updatedAt)} />
            <MetadataRow label="Page title" value={preparedSourceCinemaTitle(source)} />
            <MetadataRow
              label="Content type"
              value={source.sourceContentType ?? source.sourceFormat ?? source.kind}
            />
            <MetadataRow label="Reader mode" value={readerModeLabel(source)} valueTone="success" />
          </dl>
          <Button
            onClick={() => {
              onInspectStructure(source);
            }}
            size="md"
            variant="secondary"
          >
            Inspect structure
          </Button>
        </div>
      ),
      detail: href ?? source.sourceName,
      id: "source-provenance",
      kind: "source-provenance",
      modeAffinity: "inspect",
      tabId: "overview",
      title: "Source provenance",
    }),
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
        <ReadAlongInvariantDebugPanel report={readAlongReport} runtime={readAlongRuntime} />
      ),
      detail: readAlongInvariantStatusLabel(readAlongReport),
      id: "read-along-fidelity",
      kind: "timing-map",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Read-along fidelity",
    }),
  ]);
  const cinemaFocus = useCinemaFocusController(sourceInspectorPanels, {
    initialState: uiMemoryFocusState,
    onStateChange: onUiMemoryFocusStateChange,
    resetSignal: uiMemoryResetSignal,
  });
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
      onClose();
    },
    onPlayPause,
    onRestart,
    onSkip,
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
    }
  }, [source.id]);

  const handleFullscreenToggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (dialogRef.current) {
      void dialogRef.current.requestFullscreen();
    }
  };

  return (
    <CinemaShell
      ariaLabelledBy="prepared-source-cinema-title"
      canvas={
        <PreparedSourceCinemaReader
          activeBlockId={displayBlock?.id ?? null}
          activeWordIndex={effectiveActiveWordIndex}
          autoFollow={autoFollow}
          accessibilitySettings={normalizedAccessibility}
          canvasFirst={cinemaFocus.layoutState.canvasFirst}
          isFullscreen={isFullscreen}
          rendererLifecycle={rendererLifecycle}
          rendererRetryKey={rendererRetryKey}
          source={source}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          onAutoFollowChange={setAutoFollow}
          onFullscreenToggle={handleFullscreenToggle}
          onInspectStructure={onInspectStructure}
          onRendererLifecycleChange={handleRendererLifecycleChange}
          onRendererRetry={handleRendererRetry}
        />
      }
      canvasFirst={cinemaFocus.layoutState.canvasFirst}
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
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          onBookmark={onBookmark}
          onCreateAudio={onCreateAudio}
          onPlayPause={onPlayPause}
          onRestart={onRestart}
          onSkip={onSkip}
          onToggleMobilePanel={() => {
            setMobilePanel((current) => (current ? null : "source"));
          }}
        />
      }
      focusMode={cinemaFocus.mode}
      header={
        <header
          className="relative flex min-h-[4rem] flex-wrap items-center justify-between gap-3 border-b bg-[var(--vs-raised)] px-4 py-2.5 vs-border sm:px-6"
          data-cinema-header=""
          data-website-read-mode-calm={websiteReadModeCalm ? "true" : undefined}
        >
          <HeaderContextSummary
            className="min-w-0 flex-1 basis-[18rem] sm:min-w-[16rem] sm:basis-[26rem] lg:max-w-[min(36rem,42vw)]"
            density="compact"
            icon={
              <span className="grid h-9 w-9 place-items-center rounded-md border border-orange-200 text-orange-600 sm:border-zinc-900 sm:bg-zinc-950 sm:text-white">
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
                activePanelId={cinemaFocus.activePanelId}
                mode={cinemaFocus.mode}
                onAdvancedAction={(action) => {
                  cinemaFocus.setMode(action.mode);
                  cinemaFocus.setActivePanelId(action.panelId);
                }}
                onModeChange={cinemaFocus.setMode}
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
      }
      inspector={
        cinemaFocus.layoutState.railVisible ? (
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
          onMobilePanelChange={setMobilePanel}
          onOutlineNavigate={handleWayfindingOutlineNavigate}
          onPrepareFile={onPrepareFile}
          onRecentNavigate={handleRecentNavigate}
          onSelectSource={onSelectSource}
          onResumeProgress={onResumeProgress}
        />
      }
      readerAttributes={readerDataAttributes(normalizedAccessibility)}
      rootRef={dialogRef}
      rendererLifecycle={rendererLifecycle}
      surfaceKind={isWebsiteCinema ? "website" : "document"}
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
          onChange={(event) => {
            onSelectSource(event.currentTarget.value);
          }}
          value={source.id}
        >
          {sources.map((item, index) => (
            <option key={`${item.id}-${String(index)}`} value={item.id}>
              {preparedSourceCinemaOptionLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <Button
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
        <p className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-xs leading-5 text-amber-600">
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
        {sources.map((item, index) => (
          <option key={`${item.id}-${String(index)}`} value={item.id}>
            {preparedSourceCinemaOptionLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
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
  canvasFirst,
  isFullscreen,
  rendererLifecycle,
  rendererRetryKey,
  source,
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
  canvasFirst: boolean;
  isFullscreen: boolean;
  rendererLifecycle: CinemaRendererLifecycleState;
  rendererRetryKey: number;
  source: PreparedSource;
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
  const shouldHighlightWord = activeBlock ? isPreparedCinemaWordHighlightable(activeBlock) : false;
  const blockHighlight =
    activeWord && activeBlock && !shouldHighlightWord
      ? {
          blockEndOffset: activeWord.blockEndOffset,
          blockStartOffset: activeWord.blockStartOffset,
        }
      : undefined;
  const wordHighlight =
    activeWord && shouldHighlightWord
      ? {
          activeWordOffset: activeWord.wordOffset,
          blockEndOffset: activeWord.blockEndOffset,
          blockStartOffset: activeWord.blockStartOffset,
        }
      : undefined;
  let readerContent: ReactNode;
  const rendererFallback = (
    <PreparedSourceRendererLoadingFallback onLifecycleChange={onRendererLifecycleChange} />
  );

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
              className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
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
        <div className={`website-cinema-article ${textClass} text-[var(--vs-text)]`}>
          {blocks.map((block) => (
            <PreparedSourceCinemaBlock
              activeWordOffset={
                activeWord?.blockId === block.id && shouldHighlightWord
                  ? activeWord.wordOffset
                  : null
              }
              block={block}
              isActive={block.id === activeBlockId}
              key={block.id}
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
              className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
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
    if (!autoFollow || activeWordIndex < 0) {
      return;
    }
    readerRef.current
      ?.querySelector(
        ".prepared-source-cinema-active, .website-cinema-word-active, .markdown-cinema-word-active",
      )
      ?.scrollIntoView({ block: "center", inline: "nearest", behavior: scrollBehavior });
  }, [activeWordIndex, autoFollow, scrollBehavior]);

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
      contentClassName="min-h-0 flex-1 overflow-y-auto px-8 py-8 sm:px-12 lg:px-10 xl:px-12"
      contentRef={readerRef}
      measureClassName={READER_MEASURE_CLASS[accessibilitySettings.measure]}
      toolbar={
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <div className="flex items-center gap-1">
            <Button
              aria-label="Decrease text size"
              className="grid place-items-center text-lg font-medium"
              onClick={() => {
                onAccessibilitySettingsChange({
                  ...accessibilitySettings,
                  textScale: decreasePreparedSourceCinemaTextSize(accessibilitySettings.textScale),
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
                  textScale: increasePreparedSourceCinemaTextSize(accessibilitySettings.textScale),
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
  onInspectStructure,
  onMobilePanelChange,
  onOutlineNavigate,
  onPrepareFile,
  onRecentNavigate,
  onSelectSource,
  onResumeProgress,
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
  onInspectStructure: (source: PreparedSource) => void;
  onMobilePanelChange: (panel: PreparedSourceCinemaMobilePanel | null) => void;
  onOutlineNavigate: (item: ReaderOutlineItem<PreparedSourceCinemaOutlineItem>) => void;
  onPrepareFile: (file: File) => Promise<void>;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
  onSelectSource: (sourceId: string) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
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
  const panels: CinemaMobilePanelSpec<PreparedSourceCinemaMobilePanel>[] = [
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
                  className="mt-1 block truncate text-blue-600"
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  {href}
                </a>
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
      icon: <AudioBarsIcon />,
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

function PreparedSourceCinemaTransport({
  accessibilitySettings,
  canBookmark,
  canCreateAudio,
  isMobileSheetOpen,
  isProcessing,
  job,
  playbackState,
  playbackControls,
  playbackCursorSec,
  progress,
  rendererLifecycle,
  source,
  onAccessibilitySettingsChange,
  onBookmark,
  onCreateAudio,
  onPlayPause,
  onRestart,
  onSkip,
  onToggleMobilePanel,
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
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCreateAudio: (source: PreparedSource) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
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
  let primaryIcon: ReactNode = <AudioBarsIcon />;
  if (isPlaybackTransport) {
    primaryIcon = playbackControls.isPlaying ? <PauseIcon /> : <PlayIcon />;
  }
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
    mobileMore: {
      active: isMobileSheetOpen,
      controlsId: PREPARED_SOURCE_CINEMA_MOBILE_SHEET_ID,
      icon: <MoreIcon />,
      onClick: onToggleMobilePanel,
    },
    playbackRate: {
      disabled: !playbackControls.setPlaybackRate,
      value: playbackControls.playbackRate,
      onChange: playbackControls.setPlaybackRate,
    },
    playbackState,
    primary: {
      className:
        playbackState === "preAudio"
          ? "bg-amber-400 text-zinc-950 shadow-amber-500/20"
          : "bg-orange-600 text-white shadow-orange-500/25",
      disabled: primaryDisabled,
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
      icon: <RestartIcon />,
      onClick: onRestart,
    },
    skipBackward: {
      disabled: !playbackControls.skipBy || !rendererReady,
      icon: <SkipBackIcon />,
      onClick: () => {
        onSkip(-READER_SEEK_SECONDS);
      },
    },
    skipForward: {
      disabled: !playbackControls.skipBy || !rendererReady,
      icon: <SkipForwardIcon />,
      onClick: () => {
        onSkip(READER_SEEK_SECONDS);
      },
    },
    stateSummary: {
      detail: preparedSourceTransportDetail(source, job, playbackState, rendererLifecycle),
      title: preparedSourceTransportTitle(playbackState, rendererLifecycle),
    },
  };

  return <CinemaTransportBar model={transportModel} />;
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

function TransportSettingPills({ items }: Readonly<{ items: string[] }>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          className="max-w-40 truncate rounded-md border px-2 py-1 text-xs font-semibold vs-border vs-muted"
          key={item}
          title={item}
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function PreparedSourceCinemaBlock({
  activeWordOffset,
  block,
  isActive,
}: Readonly<{ activeWordOffset: number | null; block: NarrationBlock; isActive: boolean }>) {
  const ref = useRef<HTMLElement | null>(null);
  const text = markdownBlockText(block);

  if (!text.trim()) {
    return null;
  }

  const id = `cinema-block-${block.id}`;
  const content = renderPreparedSourceCinemaBlockContent(block, text, activeWordOffset, isActive);
  if (block.kind === "heading") {
    return (
      <h1
        className={`mt-0 scroll-mt-20 text-3xl font-semibold leading-tight tracking-[-0.01em] first:mt-0 sm:text-[28px] ${
          isActive ? "prepared-source-cinema-active" : ""
        }`}
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
          isActive ? "prepared-source-cinema-active" : ""
        }`}
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
        isActive ? "text-[var(--vs-text)]" : ""
      } ${isActive ? "prepared-source-cinema-active" : ""}`}
      id={id}
      ref={ref}
    >
      {content}
    </section>
  );
}

function renderPreparedSourceCinemaBlockContent(
  block: NarrationBlock,
  text: string,
  activeWordOffset: number | null,
  isActive: boolean,
): ReactNode {
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
  const words = renderTextWithActiveWord(text, activeWordOffset);
  if (block.kind === "heading" || block.kind === "subheading") {
    return <>{words}</>;
  }
  if (isActive) {
    return (
      <p className="m-0">
        <span className="rounded-md bg-orange-100/80 px-1 py-0.5 box-decoration-clone">
          {words}
        </span>
      </p>
    );
  }
  return <p className="m-0">{words}</p>;
}

function renderTextWithActiveWord(text: string, activeWordOffset: number | null): ReactNode[] {
  let wordIndex = 0;
  return text.split(/(\s+)/).map((part, index) => {
    const key = `${part}:${index.toString()}`;
    if (!part || /^\s+$/.test(part)) {
      return <span key={key}>{part}</span>;
    }
    const currentWord = wordIndex;
    wordIndex += 1;
    if (currentWord !== activeWordOffset) {
      return <span key={key}>{part}</span>;
    }
    return (
      <span
        className="website-cinema-word-active rounded bg-orange-300/80 px-0.5 font-semibold text-zinc-950"
        key={key}
      >
        {part}
      </span>
    );
  });
}

function Waveform({
  audioUrl,
  progressRatio,
}: Readonly<{ audioUrl: string; progressRatio: number }>) {
  const bars = useAudioWaveformBars(audioUrl, 96);
  if (!bars) {
    return <TransportWaveformPlaceholder label="Loading audio waveform..." />;
  }
  if (bars.length === 0) {
    return <TransportWaveformPlaceholder label="Waveform unavailable for this audio." />;
  }
  return (
    <div aria-hidden="true" className="flex h-7 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((amplitude, index) => {
        const active = index / bars.length <= progressRatio;
        return (
          <span
            className={`w-[2px] rounded-full ${active ? "bg-orange-600" : "bg-zinc-300"}`}
            key={`${audioUrl}-${index.toString()}`}
            style={{ height: `${String(5 + Math.round(amplitude * 20))}px` }}
          />
        );
      })}
    </div>
  );
}

function TransportWaveformPlaceholder({
  label = "Audio waveform appears after generation.",
}: Readonly<{ label?: string }>) {
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-md border border-dashed px-2 text-xs font-medium vs-border vs-muted"
      title={label}
    >
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function HealthRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <CheckIcon />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right font-medium text-emerald-700">{value}</span>
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
      <span className="text-zinc-600">{icon}</span>
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
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    neutral: "vs-border bg-[var(--vs-surface)] text-[var(--vs-text)]",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
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
          valueTone === "success" ? "text-emerald-700" : ""
        }`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
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

function playbackProgressRatio(
  playbackCursorSec: number,
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
): number {
  if (progress) {
    return clamp01(progress.progress);
  }
  if (!job || job.durationMs <= 0) {
    return 0;
  }
  return clamp01(playbackCursorSec / (job.durationMs / 1000));
}

function playbackDisplayCursorSec(
  playbackCursorSec: number,
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
  progressRatio: number,
): number {
  if (playbackCursorSec > 0) {
    return playbackCursorSec;
  }
  if (progress && progress.currentTimeSec > 0) {
    return progress.currentTimeSec;
  }
  if (job && job.durationMs > 0 && progressRatio > 0) {
    return (job.durationMs / 1000) * progressRatio;
  }
  return playbackCursorSec;
}

function formatClockTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "0:00";
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString()}:${seconds.toString().padStart(2, "0")}`;
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scrollToCinemaBlock(blockId: string, behavior: ScrollBehavior) {
  const elementId = `cinema-block-${blockId}`;
  document
    .querySelector<HTMLElement>(`#${CSS.escape(elementId)}`)
    ?.scrollIntoView({ block: "center", inline: "nearest", behavior });
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

function AudioBarsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 10v4M9 5v14M13 8v8M17 3v18M21 9v6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-emerald-600"
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

function MoreIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 4h3v12H6V4ZM11 4h3v12h-3V4Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="m6 4 10 6-10 6V4Z" />
    </svg>
  );
}

function RestartIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68M4 4v4.68h4.68"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SkipBackIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M11 7 6 12l5 5V7ZM18 7l-5 5 5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SkipForwardIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m13 7 5 5-5 5V7ZM6 7l5 5-5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
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
