import { Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { ReaderCanvasFrame } from "../../components/reader/ReaderCanvasFrame";
import { CinemaFocusModeToolbar } from "./CinemaFocusModeToolbar";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import {
  CinemaMobileSheet,
  returnFocusToCinemaReaderCanvas,
  type CinemaMobilePanelSpec,
} from "./CinemaMobileSheet";
import { CinemaShell } from "./CinemaShell";
import { CinemaTransportBar, type CinemaTransportModel } from "./CinemaTransportBar";
import { useCinemaFocusController } from "./CinemaFocusController";
import {
  buildCinemaCurrentReadingPanel,
  buildCinemaInspectorPanel,
  buildCinemaWayfindingPanel,
} from "./CinemaInspectorPanels";
import type { CinemaPanelDefinition } from "./model";
import {
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_SEEK_SECONDS,
  READER_TEXT_SCALE_CLASS,
  normalizeReaderAccessibilitySettings,
  readerDataAttributes,
  readerLiveAnnouncement,
  readerScrollBehavior,
  useReaderKeyboardControls,
  useReaderModalLifecycle,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
import {
  ReaderWayfindingPanel,
  playbackProgressForBookmark,
  readerBookmarksFromProgress,
  readerRecentPositionsFromProgress,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
import { PolicyScopeChips, SourcePolicyPinEditor } from "../policy";
import { LazyPanelFallback } from "../performance";
import { ReaderSettingsPopover } from "../settings/ReaderSettingsPopover";
import { ExitIcon, SettingsIcon } from "../navigation";
import type { UiMemoryCinemaState } from "../preferences";
import { useAudioWaveformBars } from "../../audioWaveform";
import { looksLikeMermaidDiagram } from "../../markdownModel";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import {
  preparedSourceCinemaActiveBlock,
  preparedSourceCinemaLabel,
  preparedSourceCinemaMetrics,
  preparedSourceCinemaOutline,
  preparedSourceCinemaPlaybackStatusLabel,
  preparedSourceCinemaPrimaryBlocks,
  preparedSourceCinemaSkippedGroups,
  preparedSourceCinemaSourceHref,
  preparedSourceCinemaTitle,
  isPreparedSourceMarkdownDocument,
  type PreparedSourceCinemaOutlineItem,
  type PreparedSourceCinemaKind,
  type PreparedSourceCinemaTextSize,
} from "./preparedSourceModel";
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

const PREPARED_SOURCE_CINEMA_ACCEPT =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/html,text/csv,application/json";

const PreparedMarkdownRenderer = lazy(() =>
  import("../../MarkdownRenderer").then((module) => ({ default: module.MarkdownRenderer })),
);
const PreparedMermaidDiagram = lazy(() =>
  import("../../MarkdownRenderer").then((module) => ({ default: module.MermaidDiagram })),
);

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
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSaveSourcePolicy: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
  onSelectSource: (sourceId: string) => void;
  onSkip: (seconds: number) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUiMemoryFocusStateChange: (state: UiMemoryCinemaState) => void;
}>) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PreparedSourceCinemaMobilePanel | null>(null);
  const [pointedBlockId, setPointedBlockId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const title = preparedSourceCinemaTitle(source);
  const cinemaLabel = preparedSourceCinemaLabelForKind(source, surfaceKind);
  const effectivePlaybackCursorSec =
    playbackCursorSec > 0 ? playbackCursorSec : (progress?.currentTimeSec ?? playbackCursorSec);
  const effectiveActiveWordIndex =
    activeWordIndex > 0 ? activeWordIndex : (progress?.activeWordIndex ?? activeWordIndex);
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
  const metrics = preparedSourceCinemaMetrics(source);
  const href = preparedSourceCinemaSourceHref(source);
  const skippedGroups = preparedSourceCinemaSkippedGroups(source);
  const activeText = displayBlock ? markdownBlockText(displayBlock) : "";
  const activeSection = activeOutlineItem(outline, displayBlock);
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
  const sourceInspectorPanels: CinemaPanelDefinition[] = [
    buildCinemaInspectorPanel({
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
          <button
            className="cinema-touch-target rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onInspectStructure(source);
            }}
            type="button"
          >
            Inspect structure
          </button>
        </div>
      ),
      detail: href ?? source.sourceName,
      id: "provenance",
      modeAffinity: "inspect",
      title: "Source provenance",
    }),
    buildCinemaCurrentReadingPanel({
      detail: displayBlock
        ? `${blockKindLabel(displayBlock)} ${(displayBlock.index + 1).toString()}`
        : "No block selected",
      emptyText: "Start playback to follow the current narrated block.",
      excerpt: activeText,
      label: activeSection ? activeSection.label : blockSnippet(displayBlock, "Source opening"),
    }),
    buildCinemaWayfindingPanel({
      bookmarks: bookmarkItems,
      canBookmark,
      outlineItems,
      recentItems,
      onAddBookmark: onBookmark,
      onBookmarkNavigate: handleBookmarkNavigate,
      onOutlineNavigate: handleWayfindingOutlineNavigate,
      onRecentNavigate: handleRecentNavigate,
    }),
    buildCinemaInspectorPanel({
      children: (
        <div className="grid gap-3 text-sm">
          <PolicyScopeChips
            state={{
              projectProfile: policyProfile,
              resolvedProfile: displayBlock?.speechPolicy.profile ?? source.speechPolicyProfile,
              sessionOverrides: policyOverrides,
              sourceOverrides: source.sourceSpeechPolicyOverrides,
              sourceProfile: source.sourceSpeechPolicyProfile,
            }}
          />
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 text-center text-[11px]">
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
            sourceOverrides={source.sourceSpeechPolicyOverrides}
            sourceProfile={source.sourceSpeechPolicyProfile}
            onClear={onClearSourcePolicy}
            onSave={onSaveSourcePolicy}
          />
        </div>
      ),
      detail:
        displayBlock?.speechPolicy.profile ?? source.sourceSpeechPolicyProfile ?? "Project default",
      id: "policy",
      modeAffinity: ["inspect", "review"],
      title: "Speech policy",
    }),
    buildCinemaInspectorPanel({
      children: (
        <div className="grid gap-3 text-sm">
          <HealthRow label="Main content" value="Detected" />
          <HealthRow
            label="Readability"
            value={source.warnings && source.warnings.length > 0 ? "Warnings" : "Good"}
          />
          <HealthRow label="Content length" value={`${metrics.wordCount.toLocaleString()} words`} />
          <HealthRow
            label="You're ready"
            value={source.status === "ready" ? "Looks good!" : "Needs review"}
          />
          {generatedHealth}
        </div>
      ),
      detail: source.status === "ready" ? "Looks good" : "Needs review",
      id: "health",
      modeAffinity: ["inspect", "debug"],
      title: "Health",
    }),
    buildCinemaInspectorPanel({
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
      id: "notes",
      modeAffinity: "debug",
      title: "Skipped content",
    }),
  ];
  const cinemaFocus = useCinemaFocusController(sourceInspectorPanels, {
    initialState: uiMemoryFocusState,
    onStateChange: onUiMemoryFocusStateChange,
    resetSignal: uiMemoryResetSignal,
  });

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
    if (source.id) {
      setPointedBlockId(null);
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
          source={source}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          onAutoFollowChange={setAutoFollow}
          onFullscreenToggle={handleFullscreenToggle}
          onInspectStructure={onInspectStructure}
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
          playbackControls={playbackControls}
          playbackCursorSec={effectivePlaybackCursorSec}
          progress={progress}
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
      header={
        <header className="relative flex min-h-[4rem] items-center justify-between gap-3 border-b bg-[var(--vs-raised)] px-4 py-2.5 vs-border sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-orange-200 text-orange-600 sm:border-zinc-900 sm:bg-zinc-950 sm:text-white">
              <CinemaFilmIcon />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h2
                  className="truncate text-base font-semibold tracking-[-0.01em] text-[var(--vs-text)] sm:text-xl"
                  id="prepared-source-cinema-title"
                >
                  {cinemaLabel}
                </h2>
              </div>
              <p className="max-w-[54vw] truncate text-sm vs-muted sm:hidden" title={title}>
                {title}
              </p>
            </div>
          </div>
          <PlaybackStatusChip isPlaybackActive={isPlaybackActive} job={job} />
          <div className="hidden min-w-[20rem] shrink-0 lg:block">
            <CinemaFocusModeToolbar mode={cinemaFocus.mode} onModeChange={cinemaFocus.setMode} />
          </div>
          <p
            className="hidden min-w-0 flex-1 truncate text-center text-sm vs-muted lg:block"
            title={title}
          >
            {title}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="cinema-touch-target hidden h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:inline-flex"
              onClick={() => {
                setSettingsOpen((current) => !current);
              }}
              type="button"
            >
              <SettingsIcon />
              Settings
            </button>
            <button
              className="cinema-touch-target inline-flex h-11 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:gap-2 sm:px-3"
              onClick={onClose}
              type="button"
            >
              <ExitIcon />
              Exit
            </button>
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
    <div className="mt-3 grid gap-2 border-b pb-3 vs-border">
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Cinema source</span>
        <select
          aria-label="Cinema prepared source"
          className="cinema-touch-target min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-medium outline-none vs-border"
          onChange={(event) => {
            onSelectSource(event.currentTarget.value);
          }}
          value={source.id}
        >
          {sources.map((item, index) => (
            <option key={`${item.id}-${String(index)}`} value={item.id}>
              {preparedSourceCinemaTitle(item)}
            </option>
          ))}
        </select>
      </label>
      <button
        className="cinema-touch-target rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-50 vs-border"
        disabled={isImporting}
        onClick={() => {
          inputRef.current?.click();
        }}
        type="button"
      >
        {isImporting ? "Processing..." : "Prepare file"}
      </button>
      <input
        accept={PREPARED_SOURCE_CINEMA_ACCEPT}
        aria-label="Prepared cinema source files"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.item(0) ?? null;
          event.currentTarget.value = "";
          if (file) {
            void onPrepareFile(file);
          }
        }}
        ref={inputRef}
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

function PreparedSourceCinemaReader({
  activeBlockId,
  activeWordIndex,
  accessibilitySettings,
  autoFollow,
  canvasFirst,
  isFullscreen,
  source,
  onAccessibilitySettingsChange,
  onAutoFollowChange,
  onFullscreenToggle,
  onInspectStructure,
}: Readonly<{
  activeBlockId: string | null;
  activeWordIndex: number;
  accessibilitySettings: ReaderAccessibilitySettings;
  autoFollow: boolean;
  canvasFirst: boolean;
  isFullscreen: boolean;
  source: PreparedSource;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onAutoFollowChange: (enabled: boolean) => void;
  onFullscreenToggle: () => void;
  onInspectStructure: (source: PreparedSource) => void;
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

  if (isMarkdownDocument && source.text) {
    readerContent = (
      <Suspense
        fallback={
          <LazyPanelFallback
            label="Loading source renderer..."
            minHeightClassName="min-h-64"
            surface="prepared-source-markdown-renderer"
          />
        }
      >
        <PreparedMarkdownRenderer
          blockHighlight={blockHighlight}
          className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
          wordHighlight={wordHighlight}
        >
          {source.text}
        </PreparedMarkdownRenderer>
      </Suspense>
    );
  } else if (blocks.length > 0) {
    readerContent = (
      <div className={`website-cinema-article ${textClass} text-[var(--vs-text)]`}>
        {blocks.map((block) => (
          <PreparedSourceCinemaBlock
            activeWordOffset={
              activeWord?.blockId === block.id && shouldHighlightWord ? activeWord.wordOffset : null
            }
            block={block}
            isActive={block.id === activeBlockId}
            key={block.id}
          />
        ))}
      </div>
    );
  } else {
    readerContent = (
      <Suspense
        fallback={
          <LazyPanelFallback
            label="Loading source renderer..."
            minHeightClassName="min-h-64"
            surface="prepared-source-markdown-renderer"
          />
        }
      >
        <PreparedMarkdownRenderer
          blockHighlight={blockHighlight}
          className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
          wordHighlight={wordHighlight}
        >
          {source.text ?? source.speechText ?? ""}
        </PreparedMarkdownRenderer>
      </Suspense>
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
            <button
              aria-label="Decrease text size"
              className="cinema-touch-target grid place-items-center rounded-md text-lg font-medium transition hover:bg-[var(--vs-surface)]"
              onClick={() => {
                onAccessibilitySettingsChange({
                  ...accessibilitySettings,
                  textScale: decreasePreparedSourceCinemaTextSize(accessibilitySettings.textScale),
                });
              }}
              type="button"
            >
              A-
            </button>
            <button
              aria-label="Increase text size"
              className="cinema-touch-target grid place-items-center rounded-md text-lg font-medium transition hover:bg-[var(--vs-surface)]"
              onClick={() => {
                onAccessibilitySettingsChange({
                  ...accessibilitySettings,
                  textScale: increasePreparedSourceCinemaTextSize(accessibilitySettings.textScale),
                });
              }}
              type="button"
            >
              A+
            </button>
            <button
              aria-label="Content Structure"
              className="cinema-touch-target grid place-items-center rounded-md transition hover:bg-[var(--vs-surface)]"
              onClick={() => {
                onInspectStructure(source);
              }}
              type="button"
            >
              <ListIcon />
            </button>
          </div>
          <div className="hidden items-center gap-3 text-sm sm:flex">
            <span className="font-medium">Auto-follow</span>
            <button
              aria-pressed={autoFollow}
              className={`relative h-7 w-12 rounded-full transition ${
                autoFollow ? "bg-emerald-500" : "bg-zinc-300"
              }`}
              onClick={() => {
                onAutoFollowChange(!autoFollow);
              }}
              type="button"
            >
              <span
                className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
                  autoFollow ? "left-6" : "left-1"
                }`}
              />
            </button>
            <button
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="cinema-touch-target grid place-items-center rounded-md transition hover:bg-[var(--vs-surface)]"
              onClick={onFullscreenToggle}
              type="button"
            >
              <FullscreenIcon />
            </button>
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
          <button
            className="cinema-touch-target rounded-md border px-3 text-sm font-semibold vs-border"
            onClick={() => {
              onInspectStructure(source);
            }}
            type="button"
          >
            Content Structure
          </button>
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
            <button
              className="cinema-touch-target rounded-md border border-orange-300 bg-orange-500/10 px-3 font-semibold text-orange-700"
              onClick={() => {
                handleResumeProgress(progress);
              }}
              type="button"
            >
              Resume saved point
            </button>
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
  playbackControls,
  playbackCursorSec,
  progress,
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
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
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
  let primaryLabel = "Create & Listen";
  if (job) {
    primaryLabel = playbackControls.isPlaying ? "Pause" : "Play";
  }
  const primaryDisabled = job ? !playbackControls.isAvailable : !canStart;
  const handlePrimary = () => {
    if (job) {
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
        onChange={onAccessibilitySettingsChange}
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
    primary: {
      className: "bg-orange-600 text-white shadow-orange-500/25",
      disabled: primaryDisabled,
      icon: playbackControls.isPlaying ? <PauseIcon /> : <PlayIcon />,
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
      disabled: !playbackControls.isAvailable,
      icon: <RestartIcon />,
      onClick: onRestart,
    },
    skipBackward: {
      disabled: !playbackControls.skipBy,
      icon: <SkipBackIcon />,
      onClick: () => {
        onSkip(-READER_SEEK_SECONDS);
      },
    },
    skipForward: {
      disabled: !playbackControls.skipBy,
      icon: <SkipForwardIcon />,
      onClick: () => {
        onSkip(READER_SEEK_SECONDS);
      },
    },
  };

  return <CinemaTransportBar model={transportModel} />;
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
    <div aria-hidden="true" className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((amplitude, index) => {
        const active = index / bars.length <= progressRatio;
        return (
          <span
            className={`w-[2px] rounded-full ${active ? "bg-orange-600" : "bg-zinc-300"}`}
            key={`${audioUrl}-${index.toString()}`}
            style={{ height: `${String(8 + Math.round(amplitude * 38))}px` }}
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
    <div className="flex h-12 min-w-0 flex-1 items-center rounded-md border border-dashed px-4 text-xs font-medium vs-border vs-muted">
      {label}
    </div>
  );
}

function PlaybackStatusChip({
  isPlaybackActive,
  job,
}: Readonly<{ isPlaybackActive: boolean; job: VoiceJob | null }>) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm ${
        isPlaybackActive
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-orange-200 bg-orange-50 text-orange-700"
      }`}
    >
      <span className="hidden sm:inline-flex">
        <AudioBarsIcon />
      </span>
      {preparedSourceCinemaPlaybackStatusLabel(isPlaybackActive, job)}
    </span>
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
