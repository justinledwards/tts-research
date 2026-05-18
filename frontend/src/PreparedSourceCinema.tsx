import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { formatDuration } from "./format";
import { looksLikeMermaidDiagram } from "./markdownModel";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "./markdownCinema";
import { MermaidDiagram, MarkdownRenderer } from "./MarkdownRenderer";
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
  type PreparedSourceCinemaOutlineItem,
  type PreparedSourceCinemaTextSize,
} from "./preparedSourceCinema";
import { normalizeThemeName, VOICE_STUDIO_THEMES } from "./theme";
import type {
  NarrationBlock,
  PlaybackProgress,
  PreparedSource,
  ThemeName,
  VoiceJob,
} from "./types";

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

export function PreparedSourceCinemaOverlay({
  activeWordIndex,
  canCreateAudio,
  isProcessing,
  isPlaybackActive,
  job,
  playbackControls,
  playbackCursorSec,
  progress,
  source,
  textSize,
  themeName,
  onClose,
  onCreateAudio,
  onInspectStructure,
  onPlayPause,
  onRestart,
  onResumeProgress,
  onSkip,
  onTextSizeChange,
  onThemeChange,
}: Readonly<{
  activeWordIndex: number;
  canCreateAudio: boolean;
  isProcessing: boolean;
  isPlaybackActive: boolean;
  job: VoiceJob | null;
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  source: PreparedSource;
  textSize: PreparedSourceCinemaTextSize;
  themeName: ThemeName;
  onClose: () => void;
  onCreateAudio: (source: PreparedSource) => void;
  onInspectStructure: (source: PreparedSource) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSkip: (seconds: number) => void;
  onTextSizeChange: (size: PreparedSourceCinemaTextSize) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<PreparedSourceCinemaMobilePanel | null>("source");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const title = preparedSourceCinemaTitle(source);
  const cinemaLabel = preparedSourceCinemaLabel(source);
  const effectivePlaybackCursorSec =
    playbackCursorSec > 0 ? playbackCursorSec : (progress?.currentTimeSec ?? playbackCursorSec);
  const effectiveActiveWordIndex =
    activeWordIndex > 0 ? activeWordIndex : (progress?.activeWordIndex ?? activeWordIndex);
  const activeBlock = preparedSourceCinemaActiveBlock(source, effectiveActiveWordIndex);
  const outline = useMemo(() => preparedSourceCinemaOutline(source), [source]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const activeElement = document.activeElement;
    const previouslyFocused = activeElement instanceof HTMLElement ? activeElement : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      onClose();
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, settingsOpen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === dialogRef.current);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

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
    <div
      aria-labelledby="prepared-source-cinema-title"
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col bg-[var(--vs-bg)] text-[var(--vs-text)]"
      data-theme={themeName}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
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
        <p
          className="hidden min-w-0 flex-1 truncate text-center text-sm vs-muted lg:block"
          title={title}
        >
          {title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="hidden h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:inline-flex"
            onClick={() => {
              setSettingsOpen((current) => !current);
            }}
            type="button"
          >
            <SettingsIcon />
            Settings
          </button>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:gap-2 sm:px-3"
            onClick={onClose}
            type="button"
          >
            <ExitIcon />
            Exit
          </button>
        </div>
        {settingsOpen ? (
          <PreparedSourceCinemaSettings
            autoFollow={autoFollow}
            textSize={textSize}
            themeName={themeName}
            onAutoFollowChange={setAutoFollow}
            onTextSizeChange={onTextSizeChange}
            onThemeChange={onThemeChange}
          />
        ) : null}
      </header>

      <main className="grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 lg:grid-cols-[326px_minmax(0,1fr)_362px] lg:gap-5 lg:px-4">
        <PreparedSourceCinemaSourcePanel
          activeBlock={activeBlock}
          outline={outline}
          source={source}
        />
        <PreparedSourceCinemaReader
          activeBlockId={activeBlock?.id ?? null}
          activeWordIndex={effectiveActiveWordIndex}
          autoFollow={autoFollow}
          isFullscreen={isFullscreen}
          source={source}
          textSize={textSize}
          onAutoFollowChange={setAutoFollow}
          onFullscreenToggle={handleFullscreenToggle}
          onInspectStructure={onInspectStructure}
          onTextSizeChange={onTextSizeChange}
        />
        <PreparedSourceCinemaNarrationPanel
          activeBlock={activeBlock}
          canCreateAudio={canCreateAudio}
          isProcessing={isProcessing}
          job={job}
          outline={outline}
          playbackControls={playbackControls}
          playbackCursorSec={effectivePlaybackCursorSec}
          progress={progress}
          source={source}
          onCreateAudio={onCreateAudio}
          onResumeProgress={onResumeProgress}
        />
      </main>

      <PreparedSourceCinemaMobileSheet
        activeBlock={activeBlock}
        job={job}
        mobilePanel={mobilePanel}
        outline={outline}
        progress={progress}
        source={source}
        onInspectStructure={onInspectStructure}
        onMobilePanelChange={setMobilePanel}
        onResumeProgress={onResumeProgress}
      />

      <PreparedSourceCinemaTransport
        canCreateAudio={canCreateAudio}
        isProcessing={isProcessing}
        job={job}
        playbackControls={playbackControls}
        playbackCursorSec={effectivePlaybackCursorSec}
        progress={progress}
        source={source}
        onCreateAudio={onCreateAudio}
        onPlayPause={onPlayPause}
        onRestart={onRestart}
        onSkip={onSkip}
        onToggleMobilePanel={() => {
          setMobilePanel((current) => (current ? null : "source"));
        }}
      />
    </div>
  );
}

function PreparedSourceCinemaSourcePanel({
  activeBlock,
  outline,
  source,
}: Readonly<{
  activeBlock: NarrationBlock | null;
  outline: PreparedSourceCinemaOutlineItem[];
  source: PreparedSource;
}>) {
  const metrics = preparedSourceCinemaMetrics(source);
  const href = preparedSourceCinemaSourceHref(source);
  const skippedGroups = preparedSourceCinemaSkippedGroups(source);
  const activeSection = activeOutlineItem(outline, activeBlock);

  return (
    <aside className="hidden min-h-0 min-w-0 overflow-y-auto pr-1 lg:block">
      <div className="grid gap-3">
        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <h3 className="text-sm font-semibold">Source provenance</h3>
          <dl className="mt-3 grid gap-3 text-sm">
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
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <h3 className="text-sm font-semibold">Extraction health</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <HealthRow label="Main content" value="Detected" />
            <HealthRow
              label="Readability"
              value={source.warnings && source.warnings.length > 0 ? "Warnings" : "Good"}
            />
            <HealthRow
              label="Content length"
              value={`${metrics.wordCount.toLocaleString()} words`}
            />
            <HealthRow
              label="You're ready"
              value={source.status === "ready" ? "Looks good!" : "Needs review"}
            />
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <h3 className="text-sm font-semibold">Skipped content</h3>
          <div className="mt-3 grid gap-2 text-sm">
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
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <h3 className="text-sm font-semibold">Content Structure</h3>
          <OutlineList activeItem={activeSection} items={outline} maxItems={7} />
        </section>
      </div>
    </aside>
  );
}

function PreparedSourceCinemaReader({
  activeBlockId,
  activeWordIndex,
  autoFollow,
  isFullscreen,
  source,
  textSize,
  onAutoFollowChange,
  onFullscreenToggle,
  onInspectStructure,
  onTextSizeChange,
}: Readonly<{
  activeBlockId: string | null;
  activeWordIndex: number;
  autoFollow: boolean;
  isFullscreen: boolean;
  source: PreparedSource;
  textSize: PreparedSourceCinemaTextSize;
  onAutoFollowChange: (enabled: boolean) => void;
  onFullscreenToggle: () => void;
  onInspectStructure: (source: PreparedSource) => void;
  onTextSizeChange: (size: PreparedSourceCinemaTextSize) => void;
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
  const textClass = {
    compact: "text-base leading-8 sm:text-[17px]",
    comfortable: "text-lg leading-9",
    giant: "text-2xl leading-[1.55] sm:text-3xl",
    large: "text-[21px] leading-[1.62]",
  }[textSize];
  const shouldHighlightWord = activeBlock ? isPreparedCinemaWordHighlightable(activeBlock) : false;

  useEffect(() => {
    if (!autoFollow || activeWordIndex < 0) {
      return;
    }
    readerRef.current
      ?.querySelector(
        ".prepared-source-cinema-active, .website-cinema-word-active, .markdown-cinema-word-active",
      )
      ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
  }, [activeWordIndex, autoFollow]);

  return (
    <section className="min-h-0 min-w-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[780px] flex-col overflow-hidden rounded-md border bg-[var(--vs-raised)] shadow-sm vs-border max-lg:max-w-none max-lg:border-0 max-lg:shadow-none">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <div className="flex items-center gap-1">
            <button
              aria-label="Decrease text size"
              className="grid h-9 w-10 place-items-center rounded-md text-lg font-medium transition hover:bg-[var(--vs-surface)]"
              onClick={() => {
                onTextSizeChange(decreasePreparedSourceCinemaTextSize(textSize));
              }}
              type="button"
            >
              A-
            </button>
            <button
              aria-label="Increase text size"
              className="grid h-9 w-10 place-items-center rounded-md text-lg font-medium transition hover:bg-[var(--vs-surface)]"
              onClick={() => {
                onTextSizeChange(increasePreparedSourceCinemaTextSize(textSize));
              }}
              type="button"
            >
              A+
            </button>
            <button
              aria-label="Content Structure"
              className="grid h-9 w-10 place-items-center rounded-md transition hover:bg-[var(--vs-surface)]"
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
              className="grid h-9 w-10 place-items-center rounded-md transition hover:bg-[var(--vs-surface)]"
              onClick={onFullscreenToggle}
              type="button"
            >
              <FullscreenIcon />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto px-8 py-8 sm:px-12 lg:px-10 xl:px-12"
          ref={readerRef}
        >
          {blocks.length > 0 ? (
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
          ) : (
            <MarkdownRenderer
              blockHighlight={
                activeWord && activeBlock && !shouldHighlightWord
                  ? {
                      blockEndOffset: activeWord.blockEndOffset,
                      blockStartOffset: activeWord.blockStartOffset,
                    }
                  : undefined
              }
              className={`markdown-cinema prose-markdown ${textClass} text-[var(--vs-text)]`}
              wordHighlight={
                activeWord && shouldHighlightWord
                  ? {
                      activeWordOffset: activeWord.wordOffset,
                      blockEndOffset: activeWord.blockEndOffset,
                      blockStartOffset: activeWord.blockStartOffset,
                    }
                  : undefined
              }
            >
              {source.text ?? source.speechText ?? ""}
            </MarkdownRenderer>
          )}
        </div>
      </div>
    </section>
  );
}

function PreparedSourceCinemaNarrationPanel({
  activeBlock,
  canCreateAudio,
  isProcessing,
  job,
  outline,
  playbackControls,
  playbackCursorSec,
  progress,
  source,
  onCreateAudio,
  onResumeProgress,
}: Readonly<{
  activeBlock: NarrationBlock | null;
  canCreateAudio: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  outline: PreparedSourceCinemaOutlineItem[];
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  source: PreparedSource;
  onCreateAudio: (source: PreparedSource) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  const metrics = preparedSourceCinemaMetrics(source);
  const activeText = activeBlock ? markdownBlockText(activeBlock) : "";
  const activeSection = activeOutlineItem(outline, activeBlock);
  const durationSec = job ? job.durationMs / 1000 : 0;
  const progressRatio = playbackProgressRatio(playbackCursorSec, job, progress);
  const displayCursorSec = playbackDisplayCursorSec(
    playbackCursorSec,
    job,
    progress,
    progressRatio,
  );

  return (
    <aside className="hidden min-h-0 min-w-0 overflow-y-auto pl-1 lg:block">
      <div className="grid gap-3">
        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Current block</h3>
              <p className="mt-2 truncate text-sm font-medium">
                {activeSection ? activeSection.label : blockSnippet(activeBlock, "Source opening")}
              </p>
              <p className="mt-1 text-xs vs-muted">
                {activeBlock
                  ? `${blockKindLabel(activeBlock)} ${(activeBlock.index + 1).toString()}`
                  : "No block selected"}
              </p>
            </div>
            <span className="mt-5 h-2 w-2 shrink-0 rounded-full bg-orange-600" />
          </div>
          <p className="mt-3 line-clamp-4 text-sm leading-6">
            {activeText || "Start playback to follow the current narrated block."}
          </p>
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Segment timeline</h3>
            <span className="text-xs font-semibold text-orange-600">
              {metrics.segmentCount.toLocaleString()} segments
            </span>
          </div>
          <div className="mt-3 grid gap-2 text-xs">
            {preparedSourceCinemaPrimaryBlocks(source)
              .filter((block) => block.speakMode !== "skip")
              .slice(0, 4)
              .map((block, index) => (
                <TimelineRow
                  active={block.id === activeBlock?.id}
                  block={block}
                  durationSec={estimatedSegmentDuration(durationSec, metrics.segmentCount, index)}
                  key={block.id}
                />
              ))}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600"
              style={{ width: `${Math.round(progressRatio * 100).toString()}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs vs-muted">
            {formatPlaybackTime(displayCursorSec, job?.durationMs ?? 0)}
          </p>
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Speech policy</h3>
            <button className="text-xs font-medium text-blue-600" type="button">
              View
            </button>
          </div>
          <div className="mt-3 grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 text-center text-[11px]">
            <PolicyMetric icon={<MicrophoneIcon />} label="Voice" value={job?.voice ?? "Alloy"} />
            <PolicyMetric
              icon={<DialIcon />}
              label="Std"
              value={`${playbackControls.playbackRate.toFixed(2)}x`}
            />
            <PolicyMetric icon={<ToneIcon />} label="Tone" value="Neutral" />
            <PolicyMetric icon={<GlobeIcon />} label="Language" value="Auto" />
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <h3 className="text-sm font-semibold">Generated audio health</h3>
          <div className="mt-3 grid gap-2 text-sm">
            <HealthRow label="TTS engine" value={job ? "Healthy" : "Waiting"} />
            <HealthRow label="Audio quality" value={job ? "Good" : "Pending"} />
            <HealthRow label="Alignment" value={job?.voiceCheck.complete ? "Good" : "Pending"} />
            <HealthRow
              label="Coverage"
              value={job ? `${Math.round(job.voiceCheck.similarity * 100).toString()}%` : "0%"}
            />
          </div>
        </section>

        <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Section queue</h3>
            <span className="text-xs font-semibold text-orange-600">
              {outline.length.toLocaleString()} sections
            </span>
          </div>
          <OutlineList activeItem={activeSection} items={outline} maxItems={6} />
        </section>

        {job ? null : (
          <section className="min-w-0 rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
            <button
              className="h-11 w-full rounded-md bg-orange-600 px-3 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 disabled:opacity-50"
              disabled={!canCreateAudio || isProcessing || source.status !== "ready"}
              onClick={() => {
                onCreateAudio(source);
              }}
              type="button"
            >
              Create & Listen
            </button>
          </section>
        )}

        {progress ? (
          <button
            className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-left text-xs font-semibold text-orange-700"
            onClick={() => {
              onResumeProgress(progress);
            }}
            type="button"
          >
            Resume saved point {formatProgressPercent(progress.progress)}
          </button>
        ) : null}
      </div>
    </aside>
  );
}

function PreparedSourceCinemaMobileSheet({
  activeBlock,
  job,
  mobilePanel,
  outline,
  progress,
  source,
  onInspectStructure,
  onMobilePanelChange,
  onResumeProgress,
}: Readonly<{
  activeBlock: NarrationBlock | null;
  job: VoiceJob | null;
  mobilePanel: PreparedSourceCinemaMobilePanel | null;
  outline: PreparedSourceCinemaOutlineItem[];
  progress: PlaybackProgress | null;
  source: PreparedSource;
  onInspectStructure: (source: PreparedSource) => void;
  onMobilePanelChange: (panel: PreparedSourceCinemaMobilePanel | null) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  if (!mobilePanel) {
    return null;
  }
  const metrics = preparedSourceCinemaMetrics(source);
  const activeText = activeBlock ? markdownBlockText(activeBlock) : "";
  const href = preparedSourceCinemaSourceHref(source);

  return (
    <section className="fixed inset-x-0 bottom-[8.75rem] z-[55] max-h-[39vh] overflow-y-auto rounded-t-2xl border bg-[var(--vs-raised)] px-4 pb-5 pt-3 shadow-2xl vs-border lg:hidden">
      <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-zinc-300" />
      <div className="mb-4 grid grid-cols-3 border-b text-sm font-semibold vs-border">
        {(["source", "structure", "narration"] as const).map((panel) => (
          <button
            className={`flex items-center justify-center gap-2 border-b-2 px-2 pb-3 ${
              mobilePanel === panel
                ? "border-orange-600 text-orange-600"
                : "border-transparent vs-muted"
            }`}
            key={panel}
            onClick={() => {
              onMobilePanelChange(panel);
            }}
            type="button"
          >
            {panel === "source" ? <LinkIcon /> : null}
            {panel === "structure" ? <ListIcon /> : null}
            {panel === "narration" ? <AudioBarsIcon /> : null}
            {panelLabel(panel)}
          </button>
        ))}
      </div>
      {mobilePanel === "source" ? (
        <div className="grid gap-4 text-sm">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <GlobeIcon />
              Source Summary
            </h3>
            <div className="mt-3 rounded-md border p-3 vs-border">
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
      ) : null}
      {mobilePanel === "structure" ? (
        <div className="grid gap-3 text-sm">
          <OutlineList
            activeItem={activeOutlineItem(outline, activeBlock)}
            items={outline}
            maxItems={8}
          />
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold vs-border"
            onClick={() => {
              onInspectStructure(source);
            }}
            type="button"
          >
            Content Structure
          </button>
        </div>
      ) : null}
      {mobilePanel === "narration" ? (
        <div className="grid gap-3 text-sm">
          <p className="line-clamp-4 leading-6">
            {activeText || "Playback will show the current narrated block here."}
          </p>
          <MetadataRow label="Audio" value={job ? "Generated" : "Not generated"} />
          {progress ? (
            <button
              className="h-10 rounded-md border border-orange-300 bg-orange-500/10 px-3 font-semibold text-orange-700"
              onClick={() => {
                onResumeProgress(progress);
              }}
              type="button"
            >
              Resume saved point
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PreparedSourceCinemaTransport({
  canCreateAudio,
  isProcessing,
  job,
  playbackControls,
  playbackCursorSec,
  progress,
  source,
  onCreateAudio,
  onPlayPause,
  onRestart,
  onSkip,
  onToggleMobilePanel,
}: Readonly<{
  canCreateAudio: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  playbackControls: PreparedSourceCinemaPlaybackControls;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  source: PreparedSource;
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

  return (
    <footer className="border-t bg-[var(--vs-raised)] px-4 py-3 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] vs-border lg:px-7">
      <div className="hidden items-center gap-5 lg:flex">
        <button
          className="inline-flex h-12 min-w-32 items-center justify-center gap-3 rounded-md bg-orange-600 px-5 text-base font-semibold text-white shadow-lg shadow-orange-500/25 disabled:opacity-45"
          disabled={primaryDisabled}
          onClick={handlePrimary}
          type="button"
        >
          {playbackControls.isPlaying ? <PauseIcon /> : <PlayIcon />}
          {primaryLabel}
        </button>
        <button
          className="inline-flex h-12 items-center gap-2 rounded-md border px-4 text-sm font-medium transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
          disabled={!playbackControls.isAvailable}
          onClick={onRestart}
          type="button"
        >
          <RestartIcon />
          Restart
        </button>
        <span className="min-w-12 text-right text-sm tabular-nums vs-muted">
          {formatClockTime(displayCursorSec)}
        </span>
        <Waveform progressRatio={progressRatio} />
        <span className="min-w-12 text-sm tabular-nums vs-muted">
          {durationMs > 0 ? formatClockTime(durationMs / 1000) : "--:--"}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <VolumeIcon />
          <input
            aria-label="Volume"
            className="h-1.5 w-32 accent-orange-600"
            defaultValue={72}
            max={100}
            min={0}
            type="range"
          />
          <select
            aria-label="Playback speed"
            className="h-12 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-medium outline-none disabled:opacity-40 vs-border"
            disabled={!playbackControls.setPlaybackRate}
            onChange={(event) => {
              playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
            }}
            value={String(playbackControls.playbackRate)}
          >
            {[0.8, 1, 1.25, 1.5].map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(rate === 1 ? 0 : 2)}x
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums vs-muted">
          <span>{formatClockTime(displayCursorSec)}</span>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-orange-600"
              style={{ width: `${Math.round(progressRatio * 100).toString()}%` }}
            />
          </div>
          <span className="text-right">
            {durationMs > 0 ? formatClockTime(durationMs / 1000) : "--:--"}
          </span>
        </div>
        <div className="grid grid-cols-6 items-center gap-2">
          <IconTransportButton
            disabled={!playbackControls.isAvailable}
            label="Restart"
            onClick={onRestart}
          >
            <RestartIcon />
          </IconTransportButton>
          <IconTransportButton
            disabled={!playbackControls.skipBy}
            label="-15"
            onClick={() => {
              onSkip(-15);
            }}
          >
            <SkipBackIcon />
          </IconTransportButton>
          <button
            className="col-span-2 inline-flex h-16 items-center justify-center gap-3 rounded-full bg-orange-600 px-4 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 disabled:opacity-45"
            disabled={primaryDisabled}
            onClick={handlePrimary}
            type="button"
          >
            {playbackControls.isPlaying ? <PauseIcon /> : <PlayIcon />}
            <span className="hidden min-[360px]:inline">{primaryLabel}</span>
          </button>
          <IconTransportButton
            disabled={!playbackControls.skipBy}
            label="+15"
            onClick={() => {
              onSkip(15);
            }}
          >
            <SkipForwardIcon />
          </IconTransportButton>
          <IconTransportButton label="More" onClick={onToggleMobilePanel}>
            <MoreIcon />
          </IconTransportButton>
        </div>
        <div className="flex items-center justify-center">
          <select
            aria-label="Playback speed"
            className="h-8 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-medium outline-none disabled:opacity-40 vs-border"
            disabled={!playbackControls.setPlaybackRate}
            onChange={(event) => {
              playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
            }}
            value={String(playbackControls.playbackRate)}
          >
            {[0.8, 1, 1.25, 1.5].map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(rate === 1 ? 0 : 2)}x Speed
              </option>
            ))}
          </select>
        </div>
      </div>
    </footer>
  );
}

function PreparedSourceCinemaSettings({
  autoFollow,
  textSize,
  themeName,
  onAutoFollowChange,
  onTextSizeChange,
  onThemeChange,
}: Readonly<{
  autoFollow: boolean;
  textSize: PreparedSourceCinemaTextSize;
  themeName: ThemeName;
  onAutoFollowChange: (enabled: boolean) => void;
  onTextSizeChange: (size: PreparedSourceCinemaTextSize) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  return (
    <div className="absolute right-6 top-[3.6rem] z-[60] w-72 rounded-md border bg-[var(--vs-raised)] p-4 text-sm shadow-xl vs-border">
      <h3 className="font-semibold">Website Cinema settings</h3>
      <label className="mt-4 flex items-center justify-between gap-3">
        <span>Auto-follow</span>
        <input
          checked={autoFollow}
          className="h-4 w-4 accent-orange-600"
          onChange={(event) => {
            onAutoFollowChange(event.currentTarget.checked);
          }}
          type="checkbox"
        />
      </label>
      <label className="mt-3 grid gap-1">
        <span className="vs-muted">Text size</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-surface)] px-3 outline-none vs-border"
          onChange={(event) => {
            onTextSizeChange(event.currentTarget.value as PreparedSourceCinemaTextSize);
          }}
          value={textSize}
        >
          {(["compact", "comfortable", "large", "giant"] as const).map((size) => (
            <option key={size} value={size}>
              {sentenceCase(size)}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 grid gap-1">
        <span className="vs-muted">Theme</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-surface)] px-3 outline-none vs-border"
          onChange={(event) => {
            onThemeChange(normalizeThemeName(event.currentTarget.value));
          }}
          value={themeName}
        >
          {VOICE_STUDIO_THEMES.map((theme) => (
            <option key={theme.name} value={theme.name}>
              {theme.label}
            </option>
          ))}
        </select>
      </label>
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

  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    }
  }, [isActive]);

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
        fallback={<div className="rounded-md border p-4 text-sm vs-border">Loading diagram...</div>}
      >
        <MermaidDiagram chart={text} />
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

function OutlineList({
  activeItem,
  items,
  maxItems,
}: Readonly<{
  activeItem: PreparedSourceCinemaOutlineItem | null;
  items: PreparedSourceCinemaOutlineItem[];
  maxItems: number;
}>) {
  if (items.length === 0) {
    return <p className="mt-3 text-sm vs-muted">No headings detected.</p>;
  }
  return (
    <ol className="mt-3 grid gap-1 text-sm">
      {items.slice(0, maxItems).map((item, index) => (
        <li key={item.id}>
          <button
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-[var(--vs-surface)] ${
              item.id === activeItem?.id ? "bg-orange-50 text-orange-700" : ""
            } ${item.level > 1 ? "pl-7 text-xs vs-muted" : ""}`}
            onClick={() => {
              scrollToCinemaBlock(item.blockId);
            }}
            type="button"
          >
            <span className="min-w-0 flex-1 truncate">
              {item.level === 1 ? `${(index + 1).toString()}. ` : ""}
              {item.label}
            </span>
            {item.id === activeItem?.id ? <PlayTinyIcon /> : null}
          </button>
        </li>
      ))}
    </ol>
  );
}

function TimelineRow({
  active,
  block,
  durationSec,
}: Readonly<{ active: boolean; block: NarrationBlock; durationSec: number }>) {
  return (
    <div
      className={`grid grid-cols-[1.25rem_minmax(0,1fr)_2.5rem] items-center gap-2 rounded px-2 py-1.5 ${
        active ? "bg-orange-50 text-orange-700" : ""
      }`}
    >
      <span>{(block.index + 1).toString()}</span>
      <span className="truncate">{blockSnippet(block, "Untitled segment")}</span>
      <span className="text-right tabular-nums vs-muted">{formatClockTime(durationSec)}</span>
    </div>
  );
}

function Waveform({ progressRatio }: Readonly<{ progressRatio: number }>) {
  const bars = useMemo(
    () =>
      Array.from({ length: 96 }, (_, index) => ({
        height: 20 + Math.round(Math.abs(Math.sin(index * 1.7) * 24 + Math.cos(index * 0.47) * 10)),
        index,
      })),
    [],
  );
  return (
    <div aria-hidden="true" className="flex h-12 min-w-0 flex-1 items-center gap-[2px]">
      {bars.map((bar) => {
        const active = bar.index / bars.length <= progressRatio;
        return (
          <span
            className={`w-[2px] rounded-full ${active ? "bg-orange-600" : "bg-zinc-300"}`}
            key={bar.index}
            style={{ height: `${bar.height.toString()}px` }}
          />
        );
      })}
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

function IconTransportButton({
  children,
  disabled,
  label,
  onClick,
}: Readonly<{
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid h-14 place-items-center rounded-md text-sm font-medium disabled:opacity-35"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
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
        className={`min-w-0 break-words text-right font-medium leading-5 ${
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

function estimatedSegmentDuration(totalSeconds: number, segments: number, index: number): number {
  if (totalSeconds <= 0 || segments <= 0) {
    return 4 + index;
  }
  return Math.max(3, Math.round(totalSeconds / segments));
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

function formatPlaybackTime(cursorSec: number, durationMs: number): string {
  const cursor = formatClockTime(cursorSec);
  const duration = durationMs > 0 ? formatClockTime(durationMs / 1000) : formatDuration(durationMs);
  return `${cursor} / ${duration}`;
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

function formatProgressPercent(progress: number): string {
  return `${Math.round(clamp01(progress) * 100).toString()}%`;
}

function sentenceCase(value: string): string {
  const normalised = value.replaceAll(/[-_]+/g, " ").trim();
  return normalised ? `${normalised.charAt(0).toUpperCase()}${normalised.slice(1)}` : value;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function scrollToCinemaBlock(blockId: string) {
  const elementId = `cinema-block-${blockId}`;
  document
    .querySelector<HTMLElement>(`#${CSS.escape(elementId)}`)
    ?.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

function panelLabel(panel: PreparedSourceCinemaMobilePanel): string {
  switch (panel) {
    case "narration": {
      return "Narration";
    }
    case "structure": {
      return "Structure";
    }
    default: {
      return "Source";
    }
  }
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

function ExitIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 6H5v12h4M14 8l4 4-4 4M18 12H9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
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

function PlayTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-3 w-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
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

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"
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

function ToneIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12h4l2-6 4 12 2-6h4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M4 8v4h3l4 3V5L7 8H4Z" />
      <path d="M14.2 6.8a1 1 0 0 0-1.4 1.4 2.5 2.5 0 0 1 0 3.6 1 1 0 0 0 1.4 1.4 4.5 4.5 0 0 0 0-6.4Z" />
    </svg>
  );
}

export { preparedSourceCinemaActionLabel } from "./preparedSourceCinema";
