import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { type RequestState, TopProductBar } from "./AppShell";
import { BundleFlowPanel, type BundlePanelMode } from "./BundlePanels";
import {
  apiBaseUrl,
  audioSource,
  cancelVoiceJob,
  cloneResearchModule,
  closePlaybackSession,
  createBookNarrationJob,
  createBookSource,
  createBookSourceFromUrl,
  createProject,
  createCustomSpeechPolicyProfile,
  createPreparedSource,
  createPreparedSourceJob,
  createVoiceJob,
  createVoiceProfileFromCandidate,
  createVoiceProfileSource,
  deleteProject,
  deleteCustomSpeechPolicyProfile,
  deleteVoiceProfile,
  getBookCinemaDiagnostics,
  getBookSourceScope,
  getContentIR,
  getHighlightMap,
  getPreparedSource,
  getProjectSpeechPolicy,
  getProjectStorageSummary,
  getSystemMetrics,
  getVoiceJob,
  getVoiceProfileSource,
  getVoiceProfileSourceDiagnostics,
  isApiNotFoundError,
  listPreparedSources,
  listProjectBookSources,
  listProjectProgress,
  listSpeechPolicyProfiles,
  listTTSEngines,
  listProjectJobs,
  listProjects,
  listResearchModules,
  listVoiceProfiles,
  previewPreparedSourceSpeechPolicy,
  previewContentIRSpeechPolicy,
  queueVoiceProfileTarget,
  renameProject,
  startPlaybackSession,
  subscribeToVoiceJob,
  syncPlaybackSession,
  updateProjectSpeechPolicy,
  updateCustomSpeechPolicyProfile,
  updatePlaybackProgress,
} from "./api";
import { formatDuration } from "./format";
import {
  BookCinemaOverlay,
  BookCinemaPanel,
  type BookCinemaTextSize,
  bookSourceName,
  bookScopeKey,
  bookScopeText,
  normalizeBookScopeForBook,
  resolveBookActiveWordIndex,
  resolveDefaultBookScope,
} from "./BookCinemaPanel";
import { ContentIRDrawer } from "./ContentIrDrawer";
import { MarkdownRenderer, MermaidDiagram, looksLikeMermaidDiagram } from "./MarkdownRenderer";
import { HelpPanel, SettingsPanel } from "./ProductPanels";
import { PronunciationPanel } from "./PronunciationPanel";
import { RunConfigDrawer } from "./RunConfigDrawer";
import {
  KOKORO_VOICEPACKS,
  findKokoroVoicepack,
  kokoroVoicepackDetail,
  kokoroVoicepackLabel,
} from "./kokoroVoices";
import {
  buildCreateVoiceJobRequest,
  createRunConfiguration,
  normalizeRunConfiguration,
  RUN_CONFIG_STORAGE_KEY,
  type RunConfiguration,
} from "./runConfig";
import {
  ACTIVE_PROJECT_ID_STORAGE_KEY,
  clearProjectWorkspaceState,
  loadProjectWorkspaceState,
  migrateLegacyWorkspaceState,
  saveProjectWorkspaceState,
} from "./projectState";
import { calculateArrivalThroughput, formatBufferHealth } from "./studioMetrics";
import {
  SUPERTONIC_LANGUAGE_CODES,
  SUPERTONIC_LANGUAGE_OPTIONS,
  SUPERTONIC_VOICE_STYLES,
  supertonicLanguageLabel,
} from "./supertonic";
import {
  DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
  TELEPROMPTER_SETTINGS_STORAGE_KEY,
  buildTeleprompterCue,
  normalizeTeleprompterHighlightSettings,
  type TeleprompterCue,
  type TeleprompterHighlightSettings,
} from "./teleprompter";
import {
  readingPositionForHighlightCue,
  resolveHighlightCue,
  secondsForReadingPosition,
  type HighlightCue,
} from "./highlightMap";
import { THEME_STORAGE_KEY, VOICE_STUDIO_THEMES, normalizeThemeName } from "./theme";
import type {
  BookSource,
  BookCinemaDiagnostics,
  BookScope,
  BookSourceImportOptions,
  BookSourceScopeContent,
  CreateVoiceJobRequest,
  CreateVoiceProfileFromCandidateRequest,
  CustomSpeechPolicyProfile,
  HighlightMap,
  MarkdownParseMode,
  PlaybackProgress,
  PlaybackSession,
  PreparedSource,
  ProjectBundleImportResult,
  ReadingPosition,
  ProjectStorageSummary,
  ResearchModuleDiagnostics,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SpeechPolicySettings,
  StageStatus,
  SystemMetrics,
  ThemeName,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  CODE_MODE_OPTIONS,
  DEFAULT_SPEECH_POLICY_PROFILE,
  FOOTNOTE_MODE_OPTIONS,
  IMAGE_MODE_OPTIONS,
  MATH_MODE_OPTIONS,
  SPEECH_POLICY_PROFILE_OPTIONS,
  TABLE_MODE_OPTIONS,
  applySpeechPolicyOverridesToSettings,
  clearSpeechPolicyOverrides,
  compactSpeechPolicyOverrides,
  hasSpeechPolicyOverrides,
  loadSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  resolveSpeechPolicySettings,
  saveSpeechPolicyOverrides,
  speechPolicyProfileDisplayName,
  speechPolicyProfileLabel,
} from "./speechPolicy";
import type { ContentIRDocument } from "./content-ir";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "./markdownCinema";
import {
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";
import { VoiceSourceAnalysisPanel } from "./VoiceSourceAnalysisPanel";
import { WorkspaceDrawer } from "./WorkspaceDrawer";
import { buildWaveformBarsFromAudioBuffers, waveformProgressIndex } from "./waveform";

const DEFAULT_PROJECT_NAME = "The Future of Clean Energy";
const KOKORO_VOICE_STORAGE_KEY = "tts-kokoro-voice-id";
const RESEARCH_MODULE_PROMPT_HIDDEN_KEY = "tts-research-module-prompt-hidden";
const DEFAULT_KOKORO_VOICE_ID = "af_heart";
const PROFILE_ARTIFACT_MODULE_ORDER = ["kokoro-embed", "supertonic-embed"] as const;
const SOURCE_TEXT_FILE_ACCEPT =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,.zip,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/zip,image/png,image/jpeg,image/tiff,image/webp";
const SOURCE_TEXT_FILE_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "text",
  "log",
  "csv",
  "json",
  "html",
  "htm",
]);

interface PipelineStepState {
  optimization: StageStatus;
  synthesis: StageStatus;
  checker: StageStatus;
}

interface ActivePipelineFlags {
  optimizing: boolean;
  synthesizing: boolean;
  checking: boolean;
}

interface PlaybackController {
  isAvailable: boolean;
  isPlaying: boolean;
  playbackRate: number;
  play: () => Promise<void> | void;
  pause: () => void;
  restart: () => Promise<void> | void;
  setPlaybackRate?: (rate: number) => void;
  skipBy?: (seconds: number) => void;
  seekTo?: (seconds: number) => void;
}

interface WritableRef<T> {
  current: T;
}

type CinemaTextSize = "compact" | "comfortable" | "large" | "giant" | "massive";
type PreparedSourceBlock = NonNullable<PreparedSource["blocks"]>[number];

const DISABLED_PLAYBACK_CONTROLLER: PlaybackController = {
  isAvailable: false,
  isPlaying: false,
  playbackRate: 1,
  play: () => Promise.resolve(),
  pause: () => false,
  restart: () => Promise.resolve(),
  setPlaybackRate: undefined,
  skipBy: undefined,
  seekTo: undefined,
};

function createPipelineBase(job?: VoiceJob): PipelineStepState {
  if (!job) {
    return {
      optimization: "waiting",
      synthesis: "waiting",
      checker: "waiting",
    };
  }

  return {
    optimization: job.stages.optimization,
    synthesis: job.stages.synthesis,
    checker: job.stages.checker,
  };
}

function resolveRunLocale(config: RunConfiguration): string {
  const lang = config.ttsEngine === "supertonic-3" ? config.engineOptions.lang : undefined;
  if (lang === "sv") {
    return "sv-SE";
  }
  return "en-GB";
}

function resolveSupertonicLanguage(
  savedLanguage: string | undefined,
  source?: PreparedSource | null,
): string {
  const sourceLanguage = dominantPreparedSourceLanguage(source);
  if (sourceLanguage) {
    return sourceLanguage;
  }
  const normalized = normalizeSupertonicLanguage(savedLanguage);
  return normalized ?? "na";
}

function dominantPreparedSourceLanguage(source?: PreparedSource | null): string | null {
  const counts = new Map<string, number>();
  for (const block of source?.blocks ?? []) {
    const lang = normalizeSupertonicLanguage(block.language);
    if (lang && lang !== "na") {
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  let top: [string, number] | null = null;
  let total = 0;
  for (const entry of counts.entries()) {
    total += entry[1];
    if (!top || entry[1] > top[1]) {
      top = entry;
    }
  }
  if (!top) {
    return null;
  }
  return top[1] / total >= 0.6 ? top[0] : null;
}

function normalizeSupertonicLanguage(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return SUPERTONIC_LANGUAGE_CODES.has(normalized) ? normalized : null;
}

function isTerminalJob(job: VoiceJob): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

function getActivePipelineFlags(job: VoiceJob): ActivePipelineFlags {
  const activeStage = job.progress.activeStage.toLowerCase();
  return {
    optimizing: activeStage.includes("optim") || job.status === "optimizing",
    synthesizing: activeStage.includes("synth") || job.status === "synthesizing",
    checking:
      activeStage.includes("check") ||
      activeStage.includes("retry") ||
      job.status === "checking" ||
      job.status === "retrying",
  };
}

function hasSegmentWorkInFlight(job: VoiceJob): boolean {
  const total = job.progress.totalSegments ?? 0;
  const current = job.progress.currentSegment ?? 0;
  return total > 0 && current < total;
}

function markOptimizationStarted(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed" && pipeline.optimization !== "done") {
    pipeline.optimization = "running";
  }
}

function markSynthesisRunning(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed") {
    pipeline.optimization = "done";
  }
  if (pipeline.synthesis !== "failed") {
    pipeline.synthesis = "running";
  }
}

function markCheckerRunning(pipeline: PipelineStepState): void {
  markSynthesisRunning(pipeline);
  if (pipeline.checker !== "failed") {
    pipeline.checker = "running";
  }
}

function resolveTTSPipelineState(job: VoiceJob | null): PipelineStepState {
  if (!job) {
    return createPipelineBase();
  }

  const pipeline = createPipelineBase(job);
  if (isTerminalJob(job)) {
    return pipeline;
  }

  const flags = getActivePipelineFlags(job);

  if (flags.optimizing) {
    if (pipeline.optimization !== "failed") {
      pipeline.optimization = "running";
    }
    return pipeline;
  }

  markOptimizationStarted(pipeline);

  if (flags.synthesizing) {
    markSynthesisRunning(pipeline);
    return pipeline;
  }

  if (flags.checking || hasSegmentWorkInFlight(job)) {
    markCheckerRunning(pipeline);
  }

  return pipeline;
}

function getStudioJobName(job: VoiceJob | null): string {
  if (job?.voiceProfileName) {
    return `${job.voiceProfileName} - Long Form`;
  }
  return "Clean Energy - Long Form";
}

function getStudioPipelineHint({
  hasLoadedProfiles,
  isLoadingProfiles,
  isProfileStale,
  selectedProfileId,
}: Readonly<{
  hasLoadedProfiles: boolean;
  isLoadingProfiles: boolean;
  isProfileStale: boolean;
  selectedProfileId: string;
}>): string {
  if (isLoadingProfiles) {
    return "Loading profile catalog and updating studio controls.";
  }
  if (hasLoadedProfiles && isProfileStale) {
    return "Selected profile no longer exists; please choose another profile.";
  }
  if (selectedProfileId) {
    return "Custom reference profile active for this job.";
  }
  return "Using default TTS voice. Select or upload a reference profile above.";
}

function upsertVoiceProfileByCreatedAt(
  currentProfiles: VoiceProfile[],
  profile: VoiceProfile,
): VoiceProfile[] {
  const nextProfiles = currentProfiles.filter((item) => item.id !== profile.id);
  const insertAt = nextProfiles.findIndex(
    (item) => item.createdAt.localeCompare(profile.createdAt) > 0,
  );
  if (insertAt === -1) {
    return [...nextProfiles, profile];
  }
  return [...nextProfiles.slice(0, insertAt), profile, ...nextProfiles.slice(insertAt)];
}

function TeleprompterPanel({
  canOpenBookCinema,
  isPlaybackActive,
  job,
  latestProgress,
  onOpenBookCinema,
  onResumeProgress,
  playbackControls,
  playbackCursorSec,
  preparedSourceForCinema,
  settings,
  themeName,
  onOpenSettings,
}: Readonly<{
  canOpenBookCinema: boolean;
  isPlaybackActive: boolean;
  job: VoiceJob | null;
  latestProgress: PlaybackProgress | null;
  onOpenBookCinema: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  playbackControls: PlaybackController;
  playbackCursorSec: number;
  preparedSourceForCinema: PreparedSource | null;
  settings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  onOpenSettings: () => void;
}>) {
  const [isCinemaOpen, setIsCinemaOpen] = useState(false);
  const [cinemaTextSize, setCinemaTextSize] = useState<CinemaTextSize>("large");
  const [cinemaThemeName, setCinemaThemeName] = useState<ThemeName>("night");
  const [isContextVisible, setIsContextVisible] = useState(false);
  const [isFocusEnabled, setIsFocusEnabled] = useState(true);
  const effectiveSettings = useMemo(
    () =>
      isFocusEnabled
        ? settings
        : {
            ...settings,
            activeIntensity: 0.35,
            upcomingIntensity: 0,
            spokenIntensity: 0,
            effectStyle: "classic" as const,
          },
    [isFocusEnabled, settings],
  );
  const cue = useMemo(
    () => buildTeleprompterCue(job, playbackCursorSec, effectiveSettings),
    [effectiveSettings, job, playbackCursorSec],
  );
  const markdownCinemaSource = useMemo(
    () => resolveMarkdownCinemaSource(job, preparedSourceForCinema),
    [job, preparedSourceForCinema],
  );
  const cinemaResumeProgress = useMemo(
    () => resolveProgressForJob(job, latestProgress),
    [job, latestProgress],
  );
  const shouldOpenBookCinema = canOpenBookCinema && (!job || Boolean(job.bookSourceId));
  const canOpenCinema = Boolean(cue) || canOpenBookCinema;
  const handleOpenCinema = useCallback(() => {
    if (shouldOpenBookCinema) {
      onOpenBookCinema();
      return;
    }
    setCinemaThemeName(themeName === "light" ? "night" : themeName);
    setIsCinemaOpen(true);
  }, [onOpenBookCinema, shouldOpenBookCinema, themeName]);
  const handleCloseCinema = useCallback(() => {
    setIsCinemaOpen(false);
  }, []);
  const handlePlayPause = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      return;
    }
    void playbackControls.play();
  }, [playbackControls]);
  const handleRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    void playbackControls.restart();
  }, [playbackControls]);
  const handleSkip = useCallback(
    (seconds: number) => {
      playbackControls.skipBy?.(seconds);
    },
    [playbackControls],
  );

  if (!cue) {
    return (
      <section className="rounded-lg border p-5 shadow-sm vs-raised">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Teleprompter</h2>
          <button
            className="h-8 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-50 vs-border"
            disabled={!canOpenCinema}
            onClick={handleOpenCinema}
            type="button"
          >
            Cinema
          </button>
        </div>
        <p className="vs-muted mt-4 rounded-lg border border-dashed p-6 text-sm leading-6 vs-border">
          Generate audio to see a listener-friendly script with word-level focus.
        </p>
      </section>
    );
  }

  const currentWordLabel = teleprompterWordLabel(cue);

  return (
    <section className="rounded-xl border p-4 shadow-sm vs-raised sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Teleprompter</h2>
          <p className="vs-muted mt-1 text-xs">
            Segment {String(cue.segmentIndex + 1)} of {String(cue.segmentCount)} ·{" "}
            {currentWordLabel} words
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap">
          <button
            className={teleprompterToggleClass(isFocusEnabled)}
            onClick={() => {
              setIsFocusEnabled((current) => !current);
            }}
            type="button"
          >
            Focus
          </button>
          <button
            className={teleprompterToggleClass(isContextVisible)}
            onClick={() => {
              setIsContextVisible((current) => !current);
            }}
            type="button"
          >
            Context
          </button>
          <button
            className="h-8 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.isAvailable}
            onClick={handleRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-8 rounded-md px-3 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={handlePlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="h-8 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/15"
            onClick={handleOpenCinema}
            type="button"
          >
            Cinema
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-xl border border-orange-500/20 bg-orange-500/[0.055] p-5 sm:p-7">
        {isContextVisible ? <TeleprompterContext cue={cue} /> : null}
        <TeleprompterWords cue={cue} settings={effectiveSettings} variant="panel" />
        <div className="h-1.5 overflow-hidden rounded-full bg-orange-500/15">
          <div
            className="h-full rounded-full transition-[width] vs-accent-bg"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            className="vs-muted rounded-md border px-3 py-1.5 font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              handleSkip(-10);
            }}
            type="button"
          >
            10s back
          </button>
          <span className="vs-muted">
            {isFocusEnabled
              ? `Lead ${String(settings.leadMs)}ms · fade ${String(settings.spokenFadeMs)}ms`
              : "Focus highlighting muted"}
          </span>
          <button
            className="vs-muted rounded-md border px-3 py-1.5 font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              handleSkip(10);
            }}
            type="button"
          >
            10s forward
          </button>
        </div>
      </div>
      {isCinemaOpen ? (
        <CinemaTeleprompterOverlay
          cue={cue}
          isContextVisible={isContextVisible}
          isFocusEnabled={isFocusEnabled}
          settings={effectiveSettings}
          themeName={cinemaThemeName}
          markdownSource={markdownCinemaSource}
          playbackControls={playbackControls}
          resumeProgress={cinemaResumeProgress}
          textSize={cinemaTextSize}
          isPlaybackActive={isPlaybackActive}
          onClose={handleCloseCinema}
          onContextToggle={() => {
            setIsContextVisible((current) => !current);
          }}
          onFocusSettingsOpen={onOpenSettings}
          onFocusToggle={() => {
            setIsFocusEnabled((current) => !current);
          }}
          onPlayPause={handlePlayPause}
          onRestart={handleRestart}
          onResumeProgress={onResumeProgress}
          onSkip={handleSkip}
          onThemeChange={setCinemaThemeName}
          onTextSizeChange={setCinemaTextSize}
        />
      ) : null}
    </section>
  );
}

function teleprompterToggleClass(isActive: boolean): string {
  return `h-8 rounded-md border px-3 text-xs font-semibold transition vs-border ${
    isActive
      ? "border-orange-300 bg-orange-500/10 text-orange-600"
      : "vs-muted hover:bg-[var(--vs-surface)]"
  }`;
}

function TeleprompterContext({ cue }: Readonly<{ cue: TeleprompterCue }>) {
  return (
    <div className="grid gap-2 rounded-lg border bg-[var(--vs-raised)] p-3 text-xs vs-border md:grid-cols-3">
      <ContextSnippet label="Previous" value={cue.previousText ?? "Start of script"} />
      <ContextSnippet label="Current" value={cue.currentText} />
      <ContextSnippet label="Next" value={cue.nextText ?? "End of script"} />
    </div>
  );
}

function ContextSnippet({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <p className="vs-muted font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 line-clamp-2 break-words leading-5" title={value}>
        {value}
      </p>
    </div>
  );
}

function teleprompterWordLabel(cue: TeleprompterCue): string {
  return cue.activeWordIndex >= 0
    ? `${String(cue.activeWordIndex + 1)} / ${String(cue.wordCount)}`
    : "0 / 0";
}

function resolveMarkdownCinemaSource(
  job: VoiceJob | null,
  source: PreparedSource | null,
): PreparedSource | null {
  if (!job || !source) {
    return null;
  }
  if (source.renderMode !== "markdown") {
    return null;
  }
  if (!source.text && !source.blocks?.length) {
    return null;
  }
  if (job.preparedSourceId) {
    return source.id === job.preparedSourceId ? source : null;
  }
  if (!preparedSourceTextMatchesJob(source, job)) {
    return null;
  }
  return source;
}

function preparedSourceTextMatchesJob(source: PreparedSource, job: VoiceJob): boolean {
  const sourceSpeech = normalizeComparableText(source.speechText ?? "");
  if (!sourceSpeech) {
    return false;
  }
  return [job.inputText, job.optimizedText].some(
    (value) => normalizeComparableText(value) === sourceSpeech,
  );
}

function normalizeComparableText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function upsertPreparedSource(
  currentSources: PreparedSource[],
  source: PreparedSource,
): PreparedSource[] {
  return [source, ...currentSources.filter((item) => item.id !== source.id)];
}

function resolveProgressForJob(
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
): PlaybackProgress | null {
  if (!job || !progress || progress.finished) {
    return null;
  }

  if (progress.jobId && progress.jobId === job.id) {
    return progress;
  }
  if (progress.targetId && progress.targetId === progressTargetIdForJob(job)) {
    return progress;
  }
  if (progress.preparedSourceId && progress.preparedSourceId === job.preparedSourceId) {
    return progress;
  }
  if (
    progress.bookSourceId &&
    progress.bookSourceId === job.bookSourceId &&
    progress.bookScope &&
    job.bookScope &&
    bookScopeKey(progress.bookScope) === bookScopeKey(job.bookScope)
  ) {
    return progress;
  }

  return null;
}

function TeleprompterWords({
  cue,
  settings,
  textSize = "large",
  variant,
}: Readonly<{
  cue: TeleprompterCue;
  settings?: TeleprompterHighlightSettings;
  textSize?: CinemaTextSize;
  variant: "cinema" | "panel";
}>) {
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const cinemaTextClassBySize: Record<CinemaTextSize, string> = {
    compact:
      "whitespace-pre-wrap text-[1.18rem] leading-[1.72] text-[var(--vs-text)] sm:text-[1.55rem] lg:text-[1.95rem]",
    comfortable:
      "whitespace-pre-wrap text-[1.45rem] leading-[1.8] text-[var(--vs-text)] sm:text-[1.9rem] lg:text-[2.35rem]",
    large:
      "whitespace-pre-wrap text-[1.8rem] leading-[1.82] text-[var(--vs-text)] sm:text-[2.35rem] lg:text-[3rem]",
    giant:
      "whitespace-pre-wrap text-[2.1rem] leading-[1.86] text-[var(--vs-text)] sm:text-[2.8rem] lg:text-[3.55rem]",
    massive:
      "whitespace-pre-wrap text-[2.45rem] leading-[1.9] text-[var(--vs-text)] sm:text-[3.2rem] lg:text-[4.1rem]",
  };
  const textClass =
    variant === "cinema"
      ? cinemaTextClassBySize[textSize]
      : "whitespace-pre-wrap text-[1.22rem] leading-[1.95] text-[var(--vs-text)] sm:text-[1.9rem]";
  const wordClass = variant === "cinema" ? "rounded-lg px-2 py-1" : "rounded px-1 py-0.5";
  const activeWordIndex = cue.activeWordIndex;
  const wordCueByIndex = useMemo(
    () => new Map(cue.wordCues.map((wordCue) => [wordCue.wordIndex, wordCue])),
    [cue.wordCues],
  );
  const effectStyle = settings?.effectStyle ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.effectStyle;
  const accent = variant === "cinema" ? "#fb923c" : "#f97316";

  useEffect(() => {
    if (variant !== "cinema" || activeWordIndex < 0) {
      return;
    }
    activeWordRef.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeWordIndex, variant]);

  return (
    <p className={textClass}>
      {cue.tokens.map((token, tokenIndex) => {
        if (token.kind === "space") {
          return (
            <span key={`space-${String(tokenIndex)}`} className="whitespace-pre-wrap">
              {token.text}
            </span>
          );
        }
        const wordCue = token.wordIndex === null ? undefined : wordCueByIndex.get(token.wordIndex);
        const isActive = wordCue?.state === "active" || token.wordIndex === cue.activeWordIndex;
        const state = wordCue?.state ?? (isActive ? "active" : "idle");
        return (
          <span
            className={`${wordClass} teleprompter-word teleprompter-word--${state} ${
              variant === "cinema" ? "teleprompter-word--cinema" : ""
            }`}
            data-effect={effectStyle}
            key={`${token.text}-${String(token.wordIndex)}-${String(tokenIndex)}`}
            ref={isActive && variant === "cinema" ? activeWordRef : undefined}
            style={
              {
                "--teleprompter-accent": accent,
                "--teleprompter-intensity": String(wordCue?.intensity ?? 0),
              } as CSSProperties
            }
          >
            {token.text}
          </span>
        );
      })}
    </p>
  );
}

type CinemaViewMode = "teleprompter" | "markdown";

function CinemaTeleprompterOverlay({
  cue,
  isContextVisible,
  isFocusEnabled,
  isPlaybackActive,
  markdownSource,
  playbackControls,
  resumeProgress,
  settings,
  themeName,
  textSize,
  onClose,
  onContextToggle,
  onFocusSettingsOpen,
  onFocusToggle,
  onPlayPause,
  onRestart,
  onResumeProgress,
  onSkip,
  onThemeChange,
  onTextSizeChange,
}: Readonly<{
  cue: TeleprompterCue;
  isContextVisible: boolean;
  isFocusEnabled: boolean;
  isPlaybackActive: boolean;
  markdownSource: PreparedSource | null;
  playbackControls: PlaybackController;
  resumeProgress: PlaybackProgress | null;
  settings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  textSize: CinemaTextSize;
  onClose: () => void;
  onContextToggle: () => void;
  onFocusSettingsOpen: () => void;
  onFocusToggle: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSkip: (seconds: number) => void;
  onThemeChange: (theme: ThemeName) => void;
  onTextSizeChange: (size: CinemaTextSize) => void;
}>) {
  const [viewMode, setViewMode] = useState<CinemaViewMode>(
    markdownSource ? "markdown" : "teleprompter",
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!markdownSource && viewMode === "markdown") {
      setViewMode("teleprompter");
    }
  }, [markdownSource, viewMode]);

  return (
    <div
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col"
      data-theme={themeName}
      role="dialog"
    >
      <header className="flex flex-col gap-4 border-b px-5 py-4 vs-border sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">
            Cinema Teleprompter
          </p>
          <h2 className="mt-1 text-lg font-semibold sm:text-xl">
            {isPlaybackActive ? "Following playback" : "Ready for playback"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {markdownSource ? (
            <fieldset
              aria-label="Cinema view"
              className="flex rounded-md border bg-[var(--vs-surface)] p-1 vs-border"
            >
              <legend className="sr-only">Cinema view</legend>
              <button
                className={cinemaViewModeClass(viewMode === "teleprompter")}
                onClick={() => {
                  setViewMode("teleprompter");
                }}
                type="button"
              >
                Teleprompter
              </button>
              <button
                className={cinemaViewModeClass(viewMode === "markdown")}
                onClick={() => {
                  setViewMode("markdown");
                }}
                type="button"
              >
                Markdown Render
              </button>
            </fieldset>
          ) : null}
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isPlaybackActive
                ? "border-orange-400 bg-orange-500 text-white"
                : "vs-muted bg-[var(--vs-surface)] vs-border"
            }`}
          >
            {isPlaybackActive ? "Playing" : "Paused"}
          </span>
          <span className="vs-muted hidden text-sm sm:inline">
            Segment {String(cue.segmentIndex + 1)} / {String(cue.segmentCount)} ·{" "}
            {teleprompterWordLabel(cue)} words
          </span>
          <label className="hidden items-center gap-2 rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-sm vs-border sm:flex">
            Theme
            <select
              className="bg-transparent text-sm font-semibold outline-none"
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
          <button
            className="h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            Exit
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col justify-center px-5 py-6 sm:px-10 lg:px-20">
        <div className="mx-auto grid min-h-0 w-full max-w-6xl gap-4">
          {isContextVisible ? <TeleprompterContext cue={cue} /> : null}
          <div className="max-h-[68vh] min-h-0 overflow-y-auto rounded-xl border bg-[var(--vs-raised)] p-5 shadow-2xl sm:p-8">
            {viewMode === "markdown" && markdownSource ? (
              <MarkdownCinemaView
                activeWordIndex={cue.documentActiveWordIndex}
                source={markdownSource}
                textSize={textSize}
              />
            ) : (
              <TeleprompterWords
                cue={cue}
                settings={settings}
                textSize={textSize}
                variant="cinema"
              />
            )}
          </div>
        </div>
      </main>
      <footer className="border-t px-5 py-5 vs-border sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            className={cinemaToggleClass(isFocusEnabled)}
            onClick={onFocusToggle}
            type="button"
          >
            Focus
          </button>
          <button
            className={cinemaToggleClass(isContextVisible)}
            onClick={onContextToggle}
            type="button"
          >
            Context
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={onFocusSettingsOpen}
            type="button"
          >
            Settings
          </button>
          {resumeProgress ? (
            <button
              className="h-10 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-sm font-semibold text-orange-600 transition hover:bg-orange-500/15"
              onClick={() => {
                onResumeProgress(resumeProgress);
              }}
              type="button"
            >
              Resume saved
            </button>
          ) : null}
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.isAvailable}
            onClick={onRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-10);
            }}
            type="button"
          >
            -10s
          </button>
          <button
            className="h-12 min-w-28 rounded-full px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={onPlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(10);
            }}
            type="button"
          >
            +10s
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-30);
            }}
            type="button"
          >
            Prev segment
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(30);
            }}
            type="button"
          >
            Next segment
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onTextSizeChange(decreaseCinemaTextSize(textSize));
            }}
            type="button"
          >
            A-
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onTextSizeChange(increaseCinemaTextSize(textSize));
            }}
            type="button"
          >
            A+
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-orange-500/15">
          <div
            className="h-full rounded-full transition-[width] vs-accent-bg"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
        <p className="vs-muted mt-3 text-center text-xs">Press Escape to return to the studio.</p>
      </footer>
    </div>
  );
}

function MarkdownCinemaView({
  activeWordIndex,
  source,
  textSize,
}: Readonly<{
  activeWordIndex: number;
  source: PreparedSource;
  textSize: CinemaTextSize;
}>) {
  const activeWord = useMemo(
    () => resolvePreparedSourceActiveWord(source, activeWordIndex),
    [activeWordIndex, source],
  );
  const activeBlock = useMemo(
    () => source.blocks?.find((block) => block.id === activeWord?.blockId) ?? null,
    [activeWord?.blockId, source.blocks],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blocks = source.blocks ?? [];
  const markdownTextClassBySize: Record<CinemaTextSize, string> = {
    compact: "text-sm leading-7 sm:text-base",
    comfortable: "text-base leading-8 sm:text-lg",
    large: "text-lg leading-9 sm:text-xl",
    giant: "text-xl leading-10 sm:text-2xl",
    massive: "text-2xl leading-[2.8rem] sm:text-3xl",
  };
  const shouldHighlightWord = activeBlock ? isMarkdownCinemaWordHighlightable(activeBlock) : false;

  useEffect(() => {
    if (!activeWord) {
      return;
    }
    containerRef.current?.querySelector(".markdown-cinema-word-active")?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeWord]);

  if (source.text) {
    return (
      <div ref={containerRef}>
        <MarkdownRenderer
          className={`markdown-cinema prose-markdown ${markdownTextClassBySize[textSize]} text-[var(--vs-text)]`}
          blockHighlight={
            activeWord && activeBlock && !shouldHighlightWord
              ? {
                  blockEndOffset: activeWord.blockEndOffset,
                  blockStartOffset: activeWord.blockStartOffset,
                }
              : undefined
          }
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
          {source.text}
        </MarkdownRenderer>
      </div>
    );
  }

  return (
    <div
      className={`markdown-cinema prose-markdown ${markdownTextClassBySize[textSize]} text-[var(--vs-text)]`}
    >
      {blocks.map((block) => (
        <MarkdownCinemaBlock
          block={block}
          isActive={block.id === activeWord?.blockId}
          key={block.id}
        />
      ))}
    </div>
  );
}

function isMarkdownCinemaWordHighlightable(block: PreparedSourceBlock): boolean {
  return (
    (block.kind === "body" ||
      block.kind === "heading" ||
      block.kind === "subheading" ||
      block.kind === "quote") &&
    block.speakMode === "speak"
  );
}

function MarkdownCinemaBlock({
  block,
  isActive,
}: Readonly<{
  block: NonNullable<PreparedSource["blocks"]>[number];
  isActive: boolean;
}>) {
  const blockRef = useRef<HTMLElement | null>(null);
  const blockText = markdownBlockText(block);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    blockRef.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [isActive]);

  if (!blockText.trim()) {
    return null;
  }

  return (
    <section
      className={`markdown-cinema-block rounded-lg border px-4 py-3 transition ${
        isActive
          ? "border-orange-300 bg-orange-500/10 shadow-[0_0_0_1px_rgba(249,115,22,0.25)]"
          : "border-transparent"
      }`}
      data-active={isActive ? "true" : "false"}
      ref={blockRef}
    >
      {renderMarkdownCinemaBlockContent(block, blockText)}
    </section>
  );
}

function renderMarkdownCinemaBlockContent(
  block: NonNullable<PreparedSource["blocks"]>[number],
  blockText: string,
): ReactNode {
  if (block.kind === "code" && looksLikeMermaidDiagram(blockText)) {
    return <MermaidDiagram chart={blockText} />;
  }

  if (block.kind === "code") {
    return (
      <pre>
        <code>{blockText}</code>
      </pre>
    );
  }

  return <MarkdownRenderer className="contents">{blockText}</MarkdownRenderer>;
}

function cinemaViewModeClass(isActive: boolean): string {
  return `h-8 rounded px-3 text-xs font-semibold transition ${
    isActive
      ? "bg-orange-500 text-white shadow-sm"
      : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
  }`;
}

function cinemaToggleClass(isActive: boolean): string {
  return `h-10 rounded-md border px-3 text-sm font-semibold transition vs-border ${
    isActive
      ? "border-orange-300 bg-orange-500/10 text-orange-600"
      : "vs-muted hover:bg-[var(--vs-surface)]"
  }`;
}

function decreaseCinemaTextSize(size: CinemaTextSize): CinemaTextSize {
  const order: CinemaTextSize[] = ["compact", "comfortable", "large", "giant", "massive"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "compact";
}

function increaseCinemaTextSize(size: CinemaTextSize): CinemaTextSize {
  const order: CinemaTextSize[] = ["compact", "comfortable", "large", "giant", "massive"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "massive";
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  const sorted: string[] = [];
  for (const value of new Set(values)) {
    const insertIndex = sorted.findIndex((item) => value.localeCompare(item) < 0);
    if (insertIndex === -1) {
      sorted.push(value);
    } else {
      sorted.splice(insertIndex, 0, value);
    }
  }
  return sorted;
}

type AudioPlaybackMode = "arrival" | "completed";

const VOICE_PROFILE_ID_STORAGE_KEY = "tts-active-voice-profile-id";

function formatErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function bookScopeContentMatches(
  content: BookSourceScopeContent | null,
  bookId: string,
  scope: BookScope,
): boolean {
  return content?.bookSourceId === bookId && bookScopeKey(content.scope) === bookScopeKey(scope);
}

function removeBookSourceById(bookId: string): (books: BookSource[]) => BookSource[] {
  return (books) => books.filter((book) => book.id !== bookId);
}

export function App() {
  const [text, setText] = useState("");
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("");
  const [researchModules, setResearchModules] = useState<ResearchModuleDiagnostics[]>([]);
  const [researchModuleError, setResearchModuleError] = useState<string | null>(null);
  const [cloningResearchModuleId, setCloningResearchModuleId] = useState<string | null>(null);
  const [buildingArtifactKey, setBuildingArtifactKey] = useState<string | null>(null);
  const [isResearchPromptHidden, setIsResearchPromptHidden] = useState(() => {
    return localStorage.getItem(RESEARCH_MODULE_PROMPT_HIDDEN_KEY) === "1";
  });
  const [selectedKokoroVoiceId, setSelectedKokoroVoiceId] = useState(() => {
    const savedVoiceId = localStorage.getItem(KOKORO_VOICE_STORAGE_KEY);
    if (savedVoiceId && findKokoroVoicepack(savedVoiceId)) {
      return savedVoiceId;
    }
    return DEFAULT_KOKORO_VOICE_ID;
  });
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [hasLoadedVoiceProfiles, setHasLoadedVoiceProfiles] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSource, setProfileSource] = useState<VoiceProfileSource | null>(null);
  const [profileSourceDiagnostics, setProfileSourceDiagnostics] =
    useState<VoiceProfileSourceDiagnostics | null>(null);
  const [isAnalyzingProfileSource, setIsAnalyzingProfileSource] = useState(false);
  const [profileCandidateCreateId, setProfileCandidateCreateId] = useState<string | null>(null);
  const [projects, setProjects] = useState<VoiceProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(
    () => localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY) ?? "default",
  );
  const [projectStateReadyId, setProjectStateReadyId] = useState<string | null>(null);
  const [projectJobs, setProjectJobs] = useState<VoiceJob[]>([]);
  const [bookSources, setBookSources] = useState<BookSource[]>([]);
  const [selectedBookSourceId, setSelectedBookSourceId] = useState<string | null>(null);
  const [selectedBookScope, setSelectedBookScope] = useState<BookScope | null>(null);
  const [bookScopeContent, setBookScopeContent] = useState<BookSourceScopeContent | null>(null);
  const [isLoadingBookScope, setIsLoadingBookScope] = useState(false);
  const [preparedSources, setPreparedSources] = useState<PreparedSource[]>([]);
  const [selectedPreparedSourceId, setSelectedPreparedSourceId] = useState<string | null>(null);
  const [hydratingPreparedSourceId, setHydratingPreparedSourceId] = useState<string | null>(null);
  const [isPreparingSource, setIsPreparingSource] = useState(false);
  const [sourcePrepError, setSourcePrepError] = useState<string | null>(null);
  const [speechPolicyProfiles, setSpeechPolicyProfiles] = useState<SpeechPolicyProfile[]>([]);
  const [customSpeechPolicyProfiles, setCustomSpeechPolicyProfiles] = useState<
    CustomSpeechPolicyProfile[]
  >([]);
  const [speechPolicyProfile, setSpeechPolicyProfile] = useState<string>(
    DEFAULT_SPEECH_POLICY_PROFILE,
  );
  const [speechPolicyOverrides, setSpeechPolicyOverrides] = useState<SpeechPolicyOverrides>(() =>
    loadSpeechPolicyOverrides(localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY) ?? "default"),
  );
  const [speechPolicyError, setSpeechPolicyError] = useState<string | null>(null);
  const [isSpeechPolicyPreviewing, setIsSpeechPolicyPreviewing] = useState(false);
  const [jobPreparedSource, setJobPreparedSource] = useState<PreparedSource | null>(null);
  const [projectProgress, setProjectProgress] = useState<PlaybackProgress[]>([]);
  const [hashReadingPosition, setHashReadingPosition] = useState<ReadingPosition | null>(() =>
    parseBookCinemaHash(globalThis.location.hash),
  );
  const [projectStorage, setProjectStorage] = useState<ProjectStorageSummary | null>(null);
  const [projectStorageError, setProjectStorageError] = useState<string | null>(null);
  const [activePlaybackSession, setActivePlaybackSession] = useState<PlaybackSession | null>(null);
  const [pendingPlaybackResume, setPendingPlaybackResume] = useState<{
    autoplay: boolean;
    readingPosition?: ReadingPosition;
    seconds: number;
  } | null>(null);
  const [bookCinemaDiagnostics, setBookCinemaDiagnostics] = useState<BookCinemaDiagnostics | null>(
    null,
  );
  const [isBookCinemaOpen, setIsBookCinemaOpen] = useState(false);
  const [bookCinemaTextSize, setBookCinemaTextSize] = useState<BookCinemaTextSize>("large");
  const [bookCinemaThemeName, setBookCinemaThemeName] = useState<ThemeName>("night");
  const [isImportingBookSource, setIsImportingBookSource] = useState(false);
  const [bookSourceError, setBookSourceError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [runConfiguration, setRunConfiguration] = useState<RunConfiguration>(() => {
    const savedConfiguration = localStorage.getItem(RUN_CONFIG_STORAGE_KEY);
    if (!savedConfiguration) {
      return createRunConfiguration("checkedMaster");
    }
    try {
      return normalizeRunConfiguration(JSON.parse(savedConfiguration) as unknown);
    } catch {
      return createRunConfiguration("checkedMaster");
    }
  });
  const [teleprompterSettings, setTeleprompterSettings] = useState<TeleprompterHighlightSettings>(
    () => {
      const savedSettings = localStorage.getItem(TELEPROMPTER_SETTINGS_STORAGE_KEY);
      if (!savedSettings) {
        return DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS;
      }
      try {
        return normalizeTeleprompterHighlightSettings(
          JSON.parse(savedSettings) as Partial<TeleprompterHighlightSettings>,
        );
      } catch {
        return DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS;
      }
    },
  );
  const [themeName, setThemeName] = useState<ThemeName>(() =>
    normalizeThemeName(localStorage.getItem(THEME_STORAGE_KEY)),
  );
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [bundlePanelMode, setBundlePanelMode] = useState<BundlePanelMode>("export");
  const [isBundlePanelOpen, setIsBundlePanelOpen] = useState(false);
  const [isContentIROpen, setIsContentIROpen] = useState(false);
  const [contentIRDocument, setContentIRDocument] = useState<ContentIRDocument | null>(null);
  const [contentIRError, setContentIRError] = useState<string | null>(null);
  const [contentIRTitle, setContentIRTitle] = useState("Content structure");
  const [isContentIRLoading, setIsContentIRLoading] = useState(false);
  const [playbackCursorSec, setPlaybackCursorSec] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [highlightMap, setHighlightMap] = useState<HighlightMap | null>(null);
  const [playbackControls, setPlaybackControls] = useState<PlaybackController>(
    DISABLED_PLAYBACK_CONTROLLER,
  );
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [systemMetricsError, setSystemMetricsError] = useState<string | null>(null);
  const [systemMetricsUnavailable, setSystemMetricsUnavailable] = useState(false);
  const [ttsEngines, setTTSEngines] = useState<TTSEngineDiagnostics[]>([]);
  const [ttsEngineError, setTTSEngineError] = useState<string | null>(null);

  const isProcessing = requestState === "running";
  const canSubmit = useMemo(() => text.trim().length > 0 && !isProcessing, [text, isProcessing]);
  const activeJobId =
    job && !["completed", "failed", "cancelled"].includes(job.status) ? job.id : null;
  const ttsPipeline = useMemo(() => resolveTTSPipelineState(job), [job]);
  const isStudioProfileStale =
    selectedVoiceProfileId !== "" &&
    hasLoadedVoiceProfiles &&
    !voiceProfiles.some((profile) => profile.id === selectedVoiceProfileId);
  const selectedVoiceProfile = useMemo(
    () => voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId) ?? null,
    [selectedVoiceProfileId, voiceProfiles],
  );
  const hasActiveVoiceProfileTargets = useMemo(
    () =>
      voiceProfiles.some((profile) =>
        Object.values(profile.cloneTargets ?? {}).some((target) =>
          ["queued", "building", "validating"].includes(target.status),
        ),
      ),
    [voiceProfiles],
  );
  const activeProject = useMemo<VoiceProject | null>(() => {
    const selectedProject = projects.find((project) => project.id === activeProjectId);
    if (selectedProject) {
      return selectedProject;
    }
    return projects.length > 0 ? projects[0] : null;
  }, [activeProjectId, projects]);
  const selectedBookSource = useMemo(
    () =>
      selectedBookSourceId
        ? (bookSources.find((book) => book.id === selectedBookSourceId) ?? null)
        : (bookSources[0] ?? null),
    [bookSources, selectedBookSourceId],
  );
  const selectedPreparedSource = useMemo(
    () =>
      selectedPreparedSourceId
        ? (preparedSources.find((source) => source.id === selectedPreparedSourceId) ?? null)
        : (preparedSources[0] ?? null),
    [preparedSources, selectedPreparedSourceId],
  );
  const latestProgress = (() => {
    const unfinishedProgress = projectProgress.find((progress) => !progress.finished);
    if (unfinishedProgress) {
      return unfinishedProgress;
    }
    return projectProgress.length > 0 ? projectProgress[0] : null;
  })();
  useEffect(() => {
    if (
      selectedPreparedSource?.renderMode !== "markdown" ||
      selectedPreparedSource.text ||
      hydratingPreparedSourceId === selectedPreparedSource.id
    ) {
      return;
    }

    let isCancelled = false;
    setHydratingPreparedSourceId(selectedPreparedSource.id);
    void getPreparedSource(selectedPreparedSource.id)
      .then((source) => {
        if (isCancelled) {
          return;
        }
        setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared source"));
        }
      })
      .finally(() => {
        setHydratingPreparedSourceId((currentId) =>
          currentId === selectedPreparedSource.id ? null : currentId,
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [hydratingPreparedSourceId, selectedPreparedSource]);

  useEffect(() => {
    const preparedSourceId = job?.preparedSourceId;
    if (!preparedSourceId) {
      setJobPreparedSource(null);
      return;
    }
    const requestedProfile = normalizeSpeechPolicyProfile(
      job.speechPolicyProfile ?? speechPolicyProfile,
    );
    const requestedOverrides = compactSpeechPolicyOverrides(
      job.speechPolicyOverrides ?? speechPolicyOverrides,
    );
    if (
      jobPreparedSource?.id === preparedSourceId &&
      jobPreparedSource.text &&
      jobPreparedSource.speechPolicyProfile === requestedProfile
    ) {
      return;
    }
    let isCancelled = false;
    void previewPreparedSourceSpeechPolicy(preparedSourceId, {
      profile: requestedProfile,
      overrides: requestedOverrides,
      locale: resolveRunLocale(runConfiguration),
      ttsEngine: runConfiguration.ttsEngine,
      voiceProfileId: selectedVoiceProfileId,
    })
      .then((source) => {
        if (!isCancelled) {
          setJobPreparedSource(source);
          setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          void getPreparedSource(preparedSourceId)
            .then((source) => {
              if (!isCancelled) {
                setJobPreparedSource(source);
              }
            })
            .catch(() => {
              if (!isCancelled) {
                setJobPreparedSource(null);
              }
            });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    job?.preparedSourceId,
    job?.speechPolicyOverrides,
    job?.speechPolicyProfile,
    jobPreparedSource?.id,
    jobPreparedSource?.speechPolicyProfile,
    jobPreparedSource?.text,
    runConfiguration,
    selectedVoiceProfileId,
    speechPolicyOverrides,
    speechPolicyProfile,
  ]);

  useEffect(() => {
    if (!selectedPreparedSource?.id || selectedPreparedSource.status !== "ready") {
      return;
    }
    let isCancelled = false;
    setIsSpeechPolicyPreviewing(true);
    void previewPreparedSourceSpeechPolicy(selectedPreparedSource.id, {
      profile: speechPolicyProfile,
      overrides: compactSpeechPolicyOverrides(speechPolicyOverrides),
      locale: resolveRunLocale(runConfiguration),
      ttsEngine: runConfiguration.ttsEngine,
      voiceProfileId: selectedVoiceProfileId,
    })
      .then((source) => {
        if (isCancelled) {
          return;
        }
        setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
        setSourcePrepError(null);
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setSourcePrepError(formatErrorMessage(caughtError, "Unable to preview speech policy"));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsSpeechPolicyPreviewing(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    selectedPreparedSource?.id,
    selectedPreparedSource?.status,
    runConfiguration,
    selectedVoiceProfileId,
    speechPolicyOverrides,
    speechPolicyProfile,
  ]);

  const effectiveBookScope = useMemo(
    () =>
      selectedBookSource ? normalizeBookScopeForBook(selectedBookSource, selectedBookScope) : null,
    [selectedBookScope, selectedBookSource],
  );
  const selectedBookProgress = useMemo(() => {
    if (!selectedBookSource || !effectiveBookScope) {
      return null;
    }
    const targetId = progressTargetIdForBookScope(selectedBookSource.id, effectiveBookScope);
    return projectProgress.find((progress) => progress.targetId === targetId) ?? null;
  }, [effectiveBookScope, projectProgress, selectedBookSource]);
  const currentReadingPosition = useMemo<ReadingPosition | null>(() => {
    if (!selectedBookSource || !effectiveBookScope) {
      return null;
    }
    const scopeKey = bookScopeKey(effectiveBookScope);
    if (
      hashReadingPosition?.bookSourceId === selectedBookSource.id &&
      hashReadingPosition.scopeKey === scopeKey
    ) {
      return hashReadingPosition;
    }
    return {
      activeWordIndex: selectedBookProgress?.activeWordIndex ?? 0,
      bookSourceId: selectedBookSource.id,
      scopeKey,
    };
  }, [effectiveBookScope, hashReadingPosition, selectedBookProgress, selectedBookSource]);
  const hashProgress = useMemo(
    () =>
      selectedBookSource && effectiveBookScope
        ? playbackProgressFromReadingPosition(
            hashReadingPosition,
            selectedBookSource.id,
            bookScopeKey(effectiveBookScope),
            activeProjectId,
          )
        : null,
    [activeProjectId, effectiveBookScope, hashReadingPosition, selectedBookSource],
  );
  const canOpenBookCinema = selectedBookSource?.status === "ready";
  const studioPipelineHint = getStudioPipelineHint({
    hasLoadedProfiles: hasLoadedVoiceProfiles,
    isLoadingProfiles,
    isProfileStale: isStudioProfileStale,
    selectedProfileId: selectedVoiceProfileId,
  });
  const ttsPipelineHint = isProcessing
    ? (job?.progress.message ?? "TTS pipeline is processing the current job.")
    : "Start a job to see live TTS pipeline status.";

  useEffect(() => {
    const syncHashPosition = () => {
      setHashReadingPosition(parseBookCinemaHash(globalThis.location.hash));
    };
    globalThis.addEventListener("hashchange", syncHashPosition);
    return () => {
      globalThis.removeEventListener("hashchange", syncHashPosition);
    };
  }, []);

  useEffect(() => {
    if (!hashReadingPosition?.bookSourceId) {
      return;
    }
    const book = bookSources.find((item) => item.id === hashReadingPosition.bookSourceId);
    if (!book) {
      return;
    }
    setSelectedBookSourceId(book.id);
    setSelectedBookScope(scopeFromBookScopeKey(book, hashReadingPosition.scopeKey));
    if (book.status === "ready") {
      setIsBookCinemaOpen(true);
    }
  }, [bookSources, hashReadingPosition]);

  const refreshVoiceProfiles = useCallback(async () => {
    setIsLoadingProfiles(true);
    setProfileError(null);
    try {
      const profiles = await listVoiceProfiles();
      setVoiceProfiles(profiles);
      const restoreProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
      if (restoreProfileId && !profiles.some((profile) => profile.id === restoreProfileId)) {
        setSelectedVoiceProfileId("");
        localStorage.removeItem(VOICE_PROFILE_ID_STORAGE_KEY);
      }
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error ? caughtError.message : "Unable to load voice profiles",
      );
    } finally {
      setHasLoadedVoiceProfiles(true);
      setIsLoadingProfiles(false);
    }
  }, []);

  const refreshResearchModules = useCallback(async () => {
    try {
      setResearchModules(await listResearchModules());
      setResearchModuleError(null);
    } catch (caughtError) {
      setResearchModuleError(
        caughtError instanceof Error ? caughtError.message : "Unable to load research modules",
      );
    }
  }, []);

  useEffect(() => {
    if (!hasActiveVoiceProfileTargets) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      void refreshVoiceProfiles();
    }, 1500);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [hasActiveVoiceProfileTargets, refreshVoiceProfiles]);

  const handleCloneResearchModule = useCallback(
    async (moduleId: string) => {
      setCloningResearchModuleId(moduleId);
      setResearchModuleError(null);
      try {
        const module = await cloneResearchModule(moduleId);
        setResearchModules((currentModules) => [
          ...currentModules.filter((item) => item.id !== module.id),
          module,
        ]);
        await refreshResearchModules();
      } catch (caughtError) {
        setResearchModuleError(
          caughtError instanceof Error ? caughtError.message : "Unable to clone research module",
        );
      } finally {
        setCloningResearchModuleId(null);
      }
    },
    [refreshResearchModules],
  );

  const handleHideResearchPrompt = useCallback(() => {
    localStorage.setItem(RESEARCH_MODULE_PROMPT_HIDDEN_KEY, "1");
    setIsResearchPromptHidden(true);
  }, []);

  const handleBuildVoiceProfileArtifact = useCallback(
    async (profileId: string, moduleId: string) => {
      setBuildingArtifactKey(`${profileId}:${moduleId}`);
      setProfileError(null);
      try {
        const profile = await queueVoiceProfileTarget(profileId, moduleId, true);
        setVoiceProfiles((currentProfiles) =>
          upsertVoiceProfileByCreatedAt(currentProfiles, profile),
        );
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to prepare voice profile target",
        );
      } finally {
        setBuildingArtifactKey(null);
      }
    },
    [],
  );

  const refreshProjects = useCallback(async () => {
    setProjectError(null);
    try {
      const nextProjects = await listProjects();
      setProjects(nextProjects);
      setActiveProjectId((currentProjectId) => {
        const storedProjectId = localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY);
        const candidate =
          currentProjectId.trim().length > 0 ? currentProjectId : (storedProjectId ?? "default");
        const resolved = nextProjects.some((project) => project.id === candidate)
          ? candidate
          : (nextProjects[0]?.id ?? "default");
        localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, resolved);
        return resolved;
      });
    } catch (caughtError) {
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to load projects",
      );
    }
  }, []);

  const refreshProjectJobs = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectJobs([]);
      return;
    }
    try {
      const jobs = await listProjectJobs(projectId);
      setProjectJobs(jobs);
      setProjectError(null);
    } catch (caughtError) {
      setProjectJobs([]);
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to load project jobs",
      );
    }
  }, []);

  const refreshBookSources = useCallback(
    async (projectId: string) => {
      if (projectId.trim().length === 0) {
        setBookSources([]);
        setSelectedBookSourceId(null);
        setSelectedBookScope(null);
        setBookScopeContent(null);
        return;
      }
      try {
        const books = await listProjectBookSources(projectId);
        setBookSources(books);
        setSelectedBookSourceId((currentId) => {
          if (currentId && books.some((book) => book.id === currentId)) {
            return currentId;
          }
          return books[0]?.id ?? null;
        });
        setSelectedBookScope((currentScope) => currentScope);
        setBookSourceError(null);
      } catch (caughtError) {
        setBookSources([]);
        setSelectedBookSourceId(null);
        setSelectedBookScope(null);
        setBookScopeContent(null);
        if (isApiNotFoundError(caughtError)) {
          setBookSourceError(null);
          void refreshProjects();
          return;
        }
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load book sources"));
      }
    },
    [refreshProjects],
  );

  const refreshPreparedSources = useCallback(
    async (projectId: string) => {
      if (projectId.trim().length === 0) {
        setPreparedSources([]);
        setSelectedPreparedSourceId(null);
        return;
      }
      try {
        const sources = await listPreparedSources(projectId);
        setPreparedSources(sources);
        setSelectedPreparedSourceId((currentId) => {
          if (currentId && sources.some((source) => source.id === currentId)) {
            return currentId;
          }
          return sources[0]?.id ?? null;
        });
        setSourcePrepError(null);
      } catch (caughtError) {
        setPreparedSources([]);
        setSelectedPreparedSourceId(null);
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(null);
          void refreshProjects();
          return;
        }
        setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared sources"));
      }
    },
    [refreshProjects],
  );

  const refreshProjectProgress = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectProgress([]);
      return;
    }
    try {
      setProjectProgress(await listProjectProgress(projectId));
    } catch {
      setProjectProgress([]);
    }
  }, []);

  const refreshProjectStorage = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectStorage(null);
      return;
    }
    try {
      setProjectStorage(await getProjectStorageSummary(projectId));
      setProjectStorageError(null);
    } catch (caughtError) {
      setProjectStorage(null);
      setProjectStorageError(
        caughtError instanceof Error ? caughtError.message : "Unable to load project storage",
      );
    }
  }, []);

  const refreshSpeechPolicyProfiles = useCallback(async () => {
    try {
      setSpeechPolicyProfiles(await listSpeechPolicyProfiles());
      setSpeechPolicyError(null);
    } catch (caughtError) {
      setSpeechPolicyProfiles([]);
      setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to load speech profiles"));
    }
  }, []);

  const refreshProjectSpeechPolicy = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setSpeechPolicyProfile(DEFAULT_SPEECH_POLICY_PROFILE);
      setCustomSpeechPolicyProfiles([]);
      return;
    }
    try {
      const settings = await getProjectSpeechPolicy(projectId);
      setSpeechPolicyProfile(normalizeSpeechPolicyProfile(settings.profile));
      setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
      setSpeechPolicyError(null);
    } catch (caughtError) {
      setSpeechPolicyProfile(DEFAULT_SPEECH_POLICY_PROFILE);
      setCustomSpeechPolicyProfiles([]);
      setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to load project speech policy"));
    }
  }, []);

  const refreshBookCinemaDiagnostics = useCallback(async () => {
    try {
      setBookCinemaDiagnostics(await getBookCinemaDiagnostics());
    } catch {
      setBookCinemaDiagnostics(null);
    }
  }, []);

  const refreshProfileSourceDiagnostics = useCallback(async () => {
    try {
      const diagnostics = await getVoiceProfileSourceDiagnostics();
      setProfileSourceDiagnostics(diagnostics);
    } catch {
      setProfileSourceDiagnostics(null);
    }
  }, []);

  const refreshTTSEngines = useCallback(async () => {
    try {
      const engines = await listTTSEngines();
      setTTSEngines(engines);
      setTTSEngineError(null);
    } catch (caughtError) {
      setTTSEngineError(
        caughtError instanceof Error ? caughtError.message : "Unable to load TTS engines",
      );
    }
  }, []);

  const selectVoiceProfile = useCallback((profileId: string) => {
    setSelectedVoiceProfileId(profileId);
    localStorage.setItem(VOICE_PROFILE_ID_STORAGE_KEY, profileId);
  }, []);

  const clearVoiceProfileSelection = useCallback(() => {
    setSelectedVoiceProfileId("");
    localStorage.removeItem(VOICE_PROFILE_ID_STORAGE_KEY);
  }, []);

  const handleSpeechPolicyProfileChange = useCallback(
    async (profile: string) => {
      const normalizedProfile = normalizeSpeechPolicyProfile(profile);
      setSpeechPolicyProfile(normalizedProfile);
      setSpeechPolicyError(null);
      try {
        const settings = await updateProjectSpeechPolicy(activeProjectId, normalizedProfile);
        const storedProfile = normalizeSpeechPolicyProfile(settings.profile);
        setSpeechPolicyProfile(storedProfile);
        setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
        setProjects((currentProjects) =>
          currentProjects.map((project) =>
            project.id === activeProjectId
              ? { ...project, speechPolicyProfile: storedProfile }
              : project,
          ),
        );
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save speech profile"));
      }
    },
    [activeProjectId],
  );

  const handleSpeechPolicyOverridesChange = useCallback(
    (overrides: SpeechPolicyOverrides) => {
      const normalized = compactSpeechPolicyOverrides(overrides);
      setSpeechPolicyOverrides(normalized);
      saveSpeechPolicyOverrides(activeProjectId, normalized);
    },
    [activeProjectId],
  );

  const handleClearSpeechPolicyOverrides = useCallback(() => {
    setSpeechPolicyOverrides({});
    clearSpeechPolicyOverrides(activeProjectId);
  }, [activeProjectId]);

  const applyProjectSpeechPolicyState = useCallback(
    (settings: Awaited<ReturnType<typeof getProjectSpeechPolicy>>) => {
      const storedProfile = normalizeSpeechPolicyProfile(settings.profile);
      setSpeechPolicyProfile(storedProfile);
      setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                speechPolicyProfile: storedProfile,
                speechPolicyProfiles: settings.customProfiles ?? [],
              }
            : project,
        ),
      );
    },
    [activeProjectId],
  );

  const handleCreateCustomSpeechPolicyProfile = useCallback(
    async (name: string, settings: SpeechPolicySettings, baseProfile: string) => {
      setSpeechPolicyError(null);
      try {
        const response = await createCustomSpeechPolicyProfile(activeProjectId, {
          baseProfile,
          name,
          settings,
        });
        applyProjectSpeechPolicyState(response);
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const handleUpdateCustomSpeechPolicyProfile = useCallback(
    async (
      profileId: string,
      name: string,
      settings: SpeechPolicySettings,
      baseProfile: string,
    ) => {
      setSpeechPolicyError(null);
      try {
        applyProjectSpeechPolicyState(
          await updateCustomSpeechPolicyProfile(activeProjectId, profileId, {
            baseProfile,
            name,
            settings,
          }),
        );
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to update custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const handleDeleteCustomSpeechPolicyProfile = useCallback(
    async (profileId: string) => {
      setSpeechPolicyError(null);
      try {
        applyProjectSpeechPolicyState(
          await deleteCustomSpeechPolicyProfile(activeProjectId, profileId),
        );
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to delete custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const selectKokoroVoice = useCallback((voiceId: string) => {
    const nextVoiceId = findKokoroVoicepack(voiceId)?.id ?? DEFAULT_KOKORO_VOICE_ID;
    setSelectedKokoroVoiceId(nextVoiceId);
    localStorage.setItem(KOKORO_VOICE_STORAGE_KEY, nextVoiceId);
  }, []);

  const resetPlaybackSurface = useCallback(() => {
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
  }, []);

  const clearMissingBookSource = useCallback((bookId: string | null) => {
    if (bookId) {
      setBookSources(removeBookSourceById(bookId));
    }
    setSelectedBookSourceId(null);
    setSelectedBookScope(null);
    setBookScopeContent(null);
    setBookSourceError(
      "That book source is no longer available in this project. Import it again or select another source.",
    );
  }, []);

  const applyJobStatusState = useCallback((nextJob: VoiceJob) => {
    if (nextJob.status === "completed") {
      setRequestState("complete");
      setError(null);
      return;
    }
    if (nextJob.status === "failed") {
      setRequestState("error");
      setError(nextJob.error ?? "Voice job failed");
      return;
    }
    if (nextJob.status === "cancelled") {
      setRequestState("cancelled");
      setError(nextJob.error ?? "Voice job cancelled");
      return;
    }
    setRequestState("running");
    setError(null);
  }, []);

  const clearVisibleProjectWorkspace = useCallback(
    (projectId: string) => {
      clearProjectWorkspaceState(projectId);
      setText("");
      setJob(null);
      setRequestState("idle");
      setError(null);
      setProfileSource(null);
      setBookSources([]);
      setSelectedBookSourceId(null);
      setSelectedBookScope(null);
      setBookScopeContent(null);
      setPreparedSources([]);
      setSelectedPreparedSourceId(null);
      setSourcePrepError(null);
      setProjectProgress([]);
      setActivePlaybackSession(null);
      setPendingPlaybackResume(null);
      setBookSourceError(null);
      setIsBookCinemaOpen(false);
      resetPlaybackSurface();
      setProjectStateReadyId(projectId);
    },
    [resetPlaybackSurface],
  );

  const restoreProjectWorkspace = useCallback(
    async (projectId: string) => {
      setProjectStateReadyId(null);
      setError(null);
      setProfileSource(null);
      setSelectedBookSourceId(null);
      setSelectedBookScope(null);
      setBookScopeContent(null);
      setActivePlaybackSession(null);
      setPendingPlaybackResume(null);
      resetPlaybackSurface();
      const savedState = loadProjectWorkspaceState(projectId);
      setText(savedState.text);
      setSelectedBookSourceId(savedState.bookSourceId);
      setSelectedBookScope(savedState.bookScope);

      if (!savedState.jobId) {
        setJob(null);
        setRequestState("idle");
        setProjectStateReadyId(projectId);
        return;
      }

      try {
        const restoredJob = await getVoiceJob(savedState.jobId);
        if ((restoredJob.projectId || "default") !== projectId) {
          throw new Error("Stored job belongs to another project.");
        }
        setJob(restoredJob);
        if (typeof restoredJob.inputText === "string") {
          setText(restoredJob.inputText);
        }
        applyJobStatusState(restoredJob);
      } catch {
        saveProjectWorkspaceState(projectId, {
          bookScope: savedState.bookScope,
          bookSourceId: savedState.bookSourceId,
          readingPosition: savedState.readingPosition,
          text: savedState.text,
          jobId: null,
        });
        setJob(null);
        setRequestState("idle");
      } finally {
        setProjectStateReadyId(projectId);
      }
    },
    [applyJobStatusState, resetPlaybackSurface],
  );

  const selectProject = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectId) {
        return;
      }
      if (projectStateReadyId === activeProjectId) {
        saveProjectWorkspaceState(activeProjectId, {
          bookScope: selectedBookScope,
          bookSourceId: selectedBookSourceId,
          readingPosition: currentReadingPosition,
          text,
          jobId: job?.id ?? null,
        });
      }
      setProjectStateReadyId(null);
      setActiveProjectId(projectId);
      localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, projectId);
    },
    [
      activeProjectId,
      currentReadingPosition,
      job?.id,
      projectStateReadyId,
      selectedBookScope,
      selectedBookSourceId,
      text,
    ],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      setProjectError(null);
      try {
        const project = await createProject(name);
        setProjects((currentProjects) => [
          project,
          ...currentProjects.filter((item) => item.id !== project.id),
        ]);
        clearProjectWorkspaceState(project.id);
        selectProject(project.id);
        clearVisibleProjectWorkspace(project.id);
      } catch (caughtError) {
        setProjectError(
          caughtError instanceof Error ? caughtError.message : "Unable to create project",
        );
      }
    },
    [clearVisibleProjectWorkspace, selectProject],
  );

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    setProjectError(null);
    try {
      const project = await renameProject(id, name);
      setProjects((currentProjects) =>
        currentProjects.map((item) => (item.id === project.id ? project : item)),
      );
    } catch (caughtError) {
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to rename project",
      );
    }
  }, []);

  const handleDeleteProject = useCallback(
    async (id: string) => {
      setProjectError(null);
      try {
        await deleteProject(id);
        clearProjectWorkspaceState(id);
        const remainingProjects = projects.filter((project) => project.id !== id);
        setProjects(remainingProjects);
        if (id === activeProjectId) {
          const nextProjectId = remainingProjects[0]?.id ?? "default";
          clearVisibleProjectWorkspace(nextProjectId);
          setActiveProjectId(nextProjectId);
          localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, nextProjectId);
        }
        void refreshProjects();
      } catch (caughtError) {
        setProjectError(
          caughtError instanceof Error ? caughtError.message : "Unable to delete project",
        );
      }
    },
    [activeProjectId, clearVisibleProjectWorkspace, projects, refreshProjects],
  );

  const applyVoiceJobToState = useCallback(
    (nextJob: VoiceJob) => {
      const nextProjectId = nextJob.projectId || activeProjectId;
      setJob(nextJob);
      setSelectedBookSourceId(nextJob.bookSourceId ?? null);
      setSelectedBookScope(nextJob.bookScope ?? null);
      if (nextProjectId !== activeProjectId) {
        setActiveProjectId(nextProjectId);
        localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, nextProjectId);
      }
      setProjectStateReadyId(nextProjectId);
      saveProjectWorkspaceState(nextProjectId, {
        bookScope: nextJob.bookScope ?? null,
        bookSourceId: nextJob.bookSourceId ?? null,
        readingPosition:
          nextJob.bookSourceId && nextJob.bookScope
            ? {
                activeWordIndex: 0,
                bookSourceId: nextJob.bookSourceId,
                scopeKey: bookScopeKey(nextJob.bookScope),
              }
            : null,
        text: typeof nextJob.inputText === "string" ? nextJob.inputText : text,
        jobId: nextJob.id,
      });
      if (typeof nextJob.inputText === "string") {
        setText(nextJob.inputText);
      }
      applyJobStatusState(nextJob);
    },
    [activeProjectId, applyJobStatusState, text],
  );

  const handleSelectJob = useCallback(
    async (jobId: string) => {
      if (!jobId) {
        return;
      }
      try {
        const nextJob = await getVoiceJob(jobId);
        applyVoiceJobToState(nextJob);
      } catch (caughtError) {
        setProjectError(caughtError instanceof Error ? caughtError.message : "Unable to load job");
      }
    },
    [applyVoiceJobToState],
  );

  const handleResumeProgress = useCallback(
    async (progress: PlaybackProgress, seconds = progress.currentTimeSec) => {
      if (progress.bookSourceId) {
        setSelectedBookSourceId(progress.bookSourceId);
        setSelectedBookScope(progress.bookScope ?? null);
        setBookCinemaThemeName(themeName === "light" ? "night" : themeName);
        setIsBookCinemaOpen(true);
      }
      if (progress.preparedSourceId) {
        setSelectedPreparedSourceId(progress.preparedSourceId);
        const preparedSource = preparedSources.find(
          (source) => source.id === progress.preparedSourceId,
        );
        if (!preparedSource?.text) {
          try {
            const hydratedSource = await getPreparedSource(progress.preparedSourceId);
            setPreparedSources((currentSources) => [
              hydratedSource,
              ...currentSources.filter((source) => source.id !== hydratedSource.id),
            ]);
          } catch (caughtError) {
            setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared source"));
          }
        }
      }
      if (progress.jobId && progress.jobId !== job?.id) {
        await handleSelectJob(progress.jobId);
      }
      const locatorSeconds = secondsForReadingPosition(highlightMap, progress.readingPosition);
      setPendingPlaybackResume({
        autoplay: true,
        readingPosition: progress.readingPosition,
        seconds: Math.max(0, locatorSeconds ?? seconds),
      });
    },
    [handleSelectJob, highlightMap, job?.id, preparedSources, themeName],
  );

  const handleBundleImported = useCallback(
    async (result: ProjectBundleImportResult) => {
      setProjects((currentProjects) => [
        result.project,
        ...currentProjects.filter((project) => project.id !== result.project.id),
      ]);
      selectProject(result.project.id);
      if (result.profiles.length > 0) {
        setVoiceProfiles((currentProfiles) => {
          const importedIds = new Set(result.profiles.map((profile) => profile.id));
          return [
            ...result.profiles,
            ...currentProfiles.filter((profile) => !importedIds.has(profile.id)),
          ];
        });
      }
      await Promise.all([
        refreshBookSources(result.project.id),
        refreshProjects(),
        refreshVoiceProfiles(),
        refreshProjectJobs(result.project.id),
      ]);
    },
    [refreshBookSources, refreshProjectJobs, refreshProjects, refreshVoiceProfiles, selectProject],
  );

  const handleImportBookSource = useCallback(
    async (files: File[], options: BookSourceImportOptions = {}) => {
      setIsImportingBookSource(true);
      setBookSourceError(null);
      try {
        const book = await createBookSource(activeProjectId, files, options);
        setBookSources((currentBooks) => [
          book,
          ...currentBooks.filter((item) => item.id !== book.id),
        ]);
        setSelectedBookSourceId(book.id);
        const defaultScope = resolveDefaultBookScope(book);
        setSelectedBookScope(defaultScope);
        if (book.status === "ready") {
          setText(bookScopeText(book, defaultScope));
        }
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setBookSourceError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and import again.",
          );
          void refreshProjects();
          return;
        }
        setBookSourceError(
          caughtError instanceof Error ? caughtError.message : "Unable to import book source",
        );
      } finally {
        setIsImportingBookSource(false);
      }
    },
    [activeProjectId, refreshProjects],
  );

  const handlePrepareSourceFile = useCallback(
    async (file: File, markdownParseMode: MarkdownParseMode = "strict") => {
      setIsPreparingSource(true);
      setSourcePrepError(null);
      try {
        const extension = file.name.toLowerCase().split(".").pop() ?? "";
        if (isBookSourceExtension(extension)) {
          const book = await createBookSource(activeProjectId, file);
          setBookSources((currentBooks) => [
            book,
            ...currentBooks.filter((item) => item.id !== book.id),
          ]);
          setSelectedBookSourceId(book.id);
          setSelectedBookScope(resolveDefaultBookScope(book));
          return;
        }
        const source = await createPreparedSource(activeProjectId, file, { markdownParseMode });
        setPreparedSources((currentSources) => [
          source,
          ...currentSources.filter((item) => item.id !== source.id),
        ]);
        setSelectedPreparedSourceId(source.id);
        if (source.speechText) {
          setText(source.speechText);
        }
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and prepare the file again.",
          );
          void refreshProjects();
          return;
        }
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to prepare source file",
        );
      } finally {
        setIsPreparingSource(false);
      }
    },
    [activeProjectId, refreshProjects],
  );

  const handlePrepareSourceUrl = useCallback(
    async (url: string, markdownParseMode: MarkdownParseMode = "strict") => {
      setIsPreparingSource(true);
      setSourcePrepError(null);
      try {
        const lowerURL = url.toLowerCase().split("?")[0] ?? "";
        if (isBookSourceURL(lowerURL)) {
          const book = await createBookSourceFromUrl(activeProjectId, url);
          setBookSources((currentBooks) => [
            book,
            ...currentBooks.filter((item) => item.id !== book.id),
          ]);
          setSelectedBookSourceId(book.id);
          setSelectedBookScope(resolveDefaultBookScope(book));
          return;
        }
        const source = await createPreparedSource(activeProjectId, {
          kind: "url",
          markdownParseMode,
          url,
          sourceName: url,
        });
        setPreparedSources((currentSources) => [
          source,
          ...currentSources.filter((item) => item.id !== source.id),
        ]);
        setSelectedPreparedSourceId(source.id);
        if (source.speechText) {
          setText(source.speechText);
        }
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and prepare the URL again.",
          );
          void refreshProjects();
          return;
        }
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to prepare source URL",
        );
      } finally {
        setIsPreparingSource(false);
      }
    },
    [activeProjectId, refreshProjects],
  );

  const handleUsePreparedSource = useCallback(async (source: PreparedSource) => {
    setSelectedPreparedSourceId(source.id);
    let nextSource = source;
    if (
      (!source.text && source.renderMode === "markdown") ||
      (!source.text && !source.speechText)
    ) {
      try {
        nextSource = await getPreparedSource(source.id);
        setPreparedSources((currentSources) => [
          nextSource,
          ...currentSources.filter((item) => item.id !== nextSource.id),
        ]);
      } catch (caughtError) {
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to load prepared source",
        );
        return;
      }
    }
    if (nextSource.speechText) {
      setText(nextSource.speechText);
    }
  }, []);

  const handleInspectContentIR = useCallback(
    async (sourceId: string, title: string, previewSpeechPolicy = false) => {
      setContentIRTitle(title);
      setContentIRDocument(null);
      setContentIRError(null);
      setIsContentIROpen(true);
      setIsContentIRLoading(true);
      try {
        setContentIRDocument(
          previewSpeechPolicy
            ? await previewContentIRSpeechPolicy(sourceId, {
                profile: speechPolicyProfile,
                overrides: compactSpeechPolicyOverrides(speechPolicyOverrides),
                locale: resolveRunLocale(runConfiguration),
                ttsEngine: runConfiguration.ttsEngine,
                voiceProfileId: selectedVoiceProfileId,
              })
            : await getContentIR(sourceId),
        );
      } catch (caughtError) {
        setContentIRError(formatErrorMessage(caughtError, "Unable to load content structure"));
      } finally {
        setIsContentIRLoading(false);
      }
    },
    [runConfiguration, selectedVoiceProfileId, speechPolicyOverrides, speechPolicyProfile],
  );

  const handleUseBookText = useCallback(
    (book: BookSource, scope: BookScope) => {
      const scopedText =
        bookScopeContent?.bookSourceId === book.id &&
        bookScopeKey(bookScopeContent.scope) === bookScopeKey(scope)
          ? bookScopeContent.text
          : bookScopeText(book, scope);
      if (book.status !== "ready" || !scopedText.trim()) {
        setBookSourceError(book.error ?? "Book source is not ready yet.");
        return;
      }
      setSelectedBookSourceId(book.id);
      setSelectedBookScope(scope);
      setText(scopedText);
      setBookSourceError(null);
    },
    [bookScopeContent],
  );

  const handlePlaybackControlsChange = useCallback((controls: PlaybackController | null) => {
    setPlaybackControls(controls ?? DISABLED_PLAYBACK_CONTROLLER);
  }, []);

  const handleBookCinemaPlayPause = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      return;
    }
    void playbackControls.play();
  }, [playbackControls]);

  const handleBookCinemaRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    void playbackControls.restart();
  }, [playbackControls]);

  const handleBookCinemaSkip = useCallback(
    (seconds: number) => {
      playbackControls.skipBy?.(seconds);
    },
    [playbackControls],
  );

  const activeHighlightCue = useMemo<HighlightCue | null>(() => {
    if (!job || highlightMap?.jobId !== job.id) {
      return null;
    }
    return resolveHighlightCue(highlightMap, playbackCursorSec);
  }, [highlightMap, job, playbackCursorSec]);

  const activeWordIndexForPlaybackProgress = useCallback(
    (currentJob: VoiceJob, currentTimeSec: number) => {
      if (highlightMap?.jobId === currentJob.id) {
        const cue = resolveHighlightCue(highlightMap, currentTimeSec);
        if (cue && cue.activeWordIndex >= 0) {
          return cue.activeWordIndex;
        }
      }
      if (selectedBookSource && currentJob.bookSourceId === selectedBookSource.id) {
        const bookIndex = resolveBookActiveWordIndex(
          selectedBookSource,
          currentJob,
          currentTimeSec,
          currentJob.bookScope ?? effectiveBookScope,
          bookScopeContent,
        );
        if (bookIndex >= 0) {
          return bookIndex;
        }
      }
      return activeWordIndexForProgress(currentJob, currentTimeSec);
    },
    [bookScopeContent, effectiveBookScope, highlightMap, selectedBookSource],
  );

  const readingPositionForPlaybackProgress = useCallback(
    (currentJob: VoiceJob, currentTimeSec: number): ReadingPosition | undefined => {
      if (highlightMap?.jobId === currentJob.id) {
        const cue = resolveHighlightCue(highlightMap, currentTimeSec);
        const position = readingPositionForHighlightCue(cue);
        if (position) {
          return position;
        }
      }
      if (!selectedBookSource || currentJob.bookSourceId !== selectedBookSource.id) {
        return undefined;
      }
      const scope = currentJob.bookScope ?? effectiveBookScope;
      if (!scope) {
        return undefined;
      }
      return {
        activeWordIndex: activeWordIndexForPlaybackProgress(currentJob, currentTimeSec),
        bookSourceId: selectedBookSource.id,
        scopeKey: bookScopeKey(scope),
      };
    },
    [activeWordIndexForPlaybackProgress, effectiveBookScope, highlightMap, selectedBookSource],
  );

  useEffect(() => {
    if (!isBookCinemaOpen || !selectedBookSource || !effectiveBookScope) {
      return;
    }
    let readingPosition: ReadingPosition | null | undefined = currentReadingPosition;
    if (job?.bookSourceId === selectedBookSource.id) {
      readingPosition = readingPositionForPlaybackProgress(job, playbackCursorSec);
    }
    if (!readingPosition) {
      return;
    }
    replaceBookCinemaHash(readingPosition);
  }, [
    currentReadingPosition,
    effectiveBookScope,
    isBookCinemaOpen,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    selectedBookSource,
  ]);

  const handleAddPlaybackBookmark = useCallback(async () => {
    if (!job) {
      return;
    }
    const targetId = progressTargetIdForJob(job);
    if (!targetId) {
      return;
    }
    const currentTimeSec = Math.max(0, playbackCursorSec);
    const durationSec = job.durationMs > 0 ? job.durationMs / 1000 : undefined;
    const readingPosition = readingPositionForPlaybackProgress(job, currentTimeSec);
    try {
      const progress = await updatePlaybackProgress(targetId, {
        activeWordIndex: activeWordIndexForPlaybackProgress(job, currentTimeSec),
        addBookmark: {
          activeWordIndex: activeWordIndexForPlaybackProgress(job, currentTimeSec),
          createdAt: new Date().toISOString(),
          currentTimeSec,
          id: `bookmark-${Date.now().toString(36)}`,
          label: formatDuration(Math.round(currentTimeSec * 1000)),
          readingPosition,
        },
        bookScope: job.bookScope,
        bookSourceId: job.bookSourceId,
        currentTimeSec,
        durationSec,
        jobId: job.id,
        preparedSourceId: job.preparedSourceId,
        projectId: job.projectId,
        readingPosition,
      });
      setProjectProgress((currentProgress) => [
        progress,
        ...currentProgress.filter((item) => item.targetId !== progress.targetId),
      ]);
    } catch {
      setError("Unable to save bookmark.");
    }
  }, [
    activeWordIndexForPlaybackProgress,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
  ]);

  useEffect(() => {
    const cachedProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
    if (cachedProfileId) {
      setSelectedVoiceProfileId(cachedProfileId);
    }
    void refreshVoiceProfiles();
    void refreshProjects();
    void refreshSpeechPolicyProfiles();
    void refreshProfileSourceDiagnostics();
    void refreshBookCinemaDiagnostics();
    void refreshResearchModules();
    void refreshTTSEngines();
  }, [
    refreshBookCinemaDiagnostics,
    refreshProfileSourceDiagnostics,
    refreshProjects,
    refreshResearchModules,
    refreshSpeechPolicyProfiles,
    refreshTTSEngines,
    refreshVoiceProfiles,
  ]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, activeProjectId);
    migrateLegacyWorkspaceState(activeProjectId);
    void refreshProjectJobs(activeProjectId);
    void refreshBookSources(activeProjectId);
    void refreshPreparedSources(activeProjectId);
    void refreshProjectProgress(activeProjectId);
    void refreshProjectStorage(activeProjectId);
    void refreshProjectSpeechPolicy(activeProjectId);
    void restoreProjectWorkspace(activeProjectId);
    setSpeechPolicyOverrides(loadSpeechPolicyOverrides(activeProjectId));
  }, [
    activeProjectId,
    refreshBookSources,
    refreshPreparedSources,
    refreshProjectJobs,
    refreshProjectProgress,
    refreshProjectStorage,
    refreshProjectSpeechPolicy,
    restoreProjectWorkspace,
  ]);

  useEffect(() => {
    if (!selectedBookSource) {
      setSelectedBookScope(null);
      setBookScopeContent(null);
      return;
    }
    const normalizedScope = normalizeBookScopeForBook(selectedBookSource, selectedBookScope);
    if (JSON.stringify(normalizedScope) !== JSON.stringify(selectedBookScope)) {
      setSelectedBookScope(normalizedScope);
    }
  }, [selectedBookScope, selectedBookSource]);

  useEffect(() => {
    if (selectedBookSource?.status !== "ready" || !effectiveBookScope) {
      setBookScopeContent(null);
      setIsLoadingBookScope(false);
      return;
    }
    let isCurrent = true;
    setIsLoadingBookScope(true);
    void getBookSourceScope(selectedBookSource.id, effectiveBookScope)
      .then((content) => {
        if (!isCurrent) {
          return;
        }
        setBookScopeContent(content);
        setBookSourceError(null);
      })
      .catch((caughtError: unknown) => {
        if (!isCurrent) {
          return;
        }
        setBookScopeContent(null);
        if (isApiNotFoundError(caughtError)) {
          clearMissingBookSource(selectedBookSource.id);
          return;
        }
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load selected book scope"));
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoadingBookScope(false);
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [clearMissingBookSource, effectiveBookScope, selectedBookSource]);

  useEffect(() => {
    if (!selectedVoiceProfileId) {
      return;
    }
    if (voiceProfiles.length === 0) {
      return;
    }
    if (!voiceProfiles.some((profile) => profile.id === selectedVoiceProfileId)) {
      clearVoiceProfileSelection();
    }
  }, [clearVoiceProfileSelection, selectedVoiceProfileId, voiceProfiles]);

  const handleAnalyzeVoiceSource = useCallback(
    async (file: File) => {
      setIsAnalyzingProfileSource(true);
      setProfileError(null);
      try {
        void refreshProfileSourceDiagnostics();
        const source = await createVoiceProfileSource({ file });
        setProfileSource(source);
      } catch (caughtError) {
        void refreshProfileSourceDiagnostics();
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to analyze voice source",
        );
      } finally {
        setIsAnalyzingProfileSource(false);
      }
    },
    [refreshProfileSourceDiagnostics],
  );

  const handleCreateVoiceProfileFromCandidate = useCallback(
    async (candidate: VoiceProfileCandidate, request: CreateVoiceProfileFromCandidateRequest) => {
      if (!profileSource) {
        return;
      }
      setProfileCandidateCreateId(candidate.id);
      setProfileError(null);
      try {
        const profile = await createVoiceProfileFromCandidate(
          profileSource.id,
          candidate.id,
          request,
        );
        setVoiceProfiles((currentProfiles) =>
          upsertVoiceProfileByCreatedAt(currentProfiles, profile),
        );
        selectVoiceProfile(profile.id);
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to create voice profile",
        );
      } finally {
        setProfileCandidateCreateId(null);
      }
    },
    [profileSource, selectVoiceProfile],
  );

  const handleDeleteVoiceProfile = useCallback(
    async (id: string) => {
      setProfileError(null);
      try {
        await deleteVoiceProfile(id);
        setVoiceProfiles((currentProfiles) => currentProfiles.filter((item) => item.id !== id));
        if (selectedVoiceProfileId === id) {
          clearVoiceProfileSelection();
        }
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to delete voice profile",
        );
      }
    },
    [clearVoiceProfileSelection, selectedVoiceProfileId],
  );

  useEffect(() => {
    if (!profileSource || profileSource.status === "ready" || profileSource.status === "failed") {
      if (profileSource?.status === "failed") {
        void refreshProfileSourceDiagnostics();
      }
      return;
    }

    let isCancelled = false;
    const refreshSource = async () => {
      try {
        const nextSource = await getVoiceProfileSource(profileSource.id);
        if (!isCancelled) {
          setProfileSource(nextSource);
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setProfileError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to refresh source analysis",
          );
        }
      }
    };

    const interval = globalThis.setInterval(() => {
      void refreshSource();
    }, 1500);
    void refreshSource();

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [profileSource, refreshProfileSourceDiagnostics]);

  useEffect(() => {
    if (projectStateReadyId !== activeProjectId) {
      return;
    }
    saveProjectWorkspaceState(activeProjectId, {
      bookScope: selectedBookScope,
      bookSourceId: selectedBookSourceId,
      readingPosition: currentReadingPosition,
      text,
      jobId: job?.id ?? null,
    });
  }, [
    activeProjectId,
    job?.id,
    currentReadingPosition,
    projectStateReadyId,
    selectedBookScope,
    selectedBookSourceId,
    text,
  ]);

  useEffect(() => {
    localStorage.setItem(RUN_CONFIG_STORAGE_KEY, JSON.stringify(runConfiguration));
  }, [runConfiguration]);

  useEffect(() => {
    localStorage.setItem(TELEPROMPTER_SETTINGS_STORAGE_KEY, JSON.stringify(teleprompterSettings));
  }, [teleprompterSettings]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeName);
  }, [themeName]);

  useEffect(() => {
    const hasJob = Boolean(job?.id);
    setPlaybackCursorSec(0);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
    setActivePlaybackSession(null);
    setPendingPlaybackResume(null);
    if (hasJob) {
      setIsPlaybackActive(false);
    }
  }, [job?.id]);

  useEffect(() => {
    if (!pendingPlaybackResume || !playbackControls.isAvailable) {
      return;
    }
    const locatorSeconds = secondsForReadingPosition(
      highlightMap,
      pendingPlaybackResume.readingPosition,
    );
    const targetSeconds = Math.max(0, locatorSeconds ?? pendingPlaybackResume.seconds);
    if (playbackControls.seekTo) {
      playbackControls.seekTo(targetSeconds);
    } else if (playbackControls.skipBy) {
      playbackControls.skipBy(targetSeconds - playbackCursorSec);
    }
    setPlaybackCursorSec(targetSeconds);
    if (pendingPlaybackResume.autoplay) {
      void playbackControls.play();
    }
    setPendingPlaybackResume(null);
  }, [highlightMap, pendingPlaybackResume, playbackControls, playbackCursorSec]);

  useEffect(() => {
    const restoreJobId = new URLSearchParams(globalThis.location.search).get("jobId");

    if (!restoreJobId) {
      return;
    }

    const restore = async () => {
      try {
        const restoredJob = await getVoiceJob(restoreJobId);
        applyVoiceJobToState(restoredJob);
      } catch {
        setError("Unable to restore the requested job.");
      }
    };

    void restore();
  }, [applyVoiceJobToState]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    return subscribeToVoiceJob(
      activeJobId,
      (nextJob) => {
        setJob(nextJob);
        if (nextJob.bookSourceId) {
          setSelectedBookSourceId(nextJob.bookSourceId);
          setSelectedBookScope(nextJob.bookScope ?? null);
        }
        if (nextJob.status !== "failed") {
          setError(null);
        }
        if (nextJob.status === "completed") {
          setRequestState("complete");
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
          void refreshProjectStorage(nextJob.projectId || activeProjectId);
        }
        if (nextJob.status === "failed") {
          setRequestState("error");
          setError(nextJob.error ?? "Voice job failed");
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
        }

        if (nextJob.status === "cancelled") {
          setRequestState("cancelled");
          setError(nextJob.error ?? "Voice job cancelled");
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
        }
      },
      (caughtError) => {
        if (caughtError.message === "Voice job progress stream disconnected") {
          return;
        }
        setError(caughtError.message);
      },
    );
  }, [activeJobId, activeProjectId, refreshProjectJobs, refreshProjectStorage]);

  useEffect(() => {
    if (!job?.id || !job.timing?.highlightMapUrl) {
      setHighlightMap(null);
      return;
    }
    const expectedStatus = job.timing.summary.status;
    const expectedTokenCount = job.timing.summary.tokenCount;
    let isCancelled = false;
    void getHighlightMap(job.id)
      .then((map) => {
        if (
          !isCancelled &&
          (expectedStatus !== "partial" || map.summary.tokenCount >= expectedTokenCount)
        ) {
          setHighlightMap(map);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHighlightMap(null);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    job?.id,
    job?.timing?.highlightMapUrl,
    job?.timing?.summary.status,
    job?.timing?.summary.tokenCount,
  ]);

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      globalThis.clearInterval(interval);
    };
  }, [isProcessing]);

  useEffect(() => {
    if (!job || !isPlaybackActive || activePlaybackSession) {
      return;
    }
    const targetId = progressTargetIdForJob(job);
    if (!targetId) {
      return;
    }
    let isCancelled = false;
    void startPlaybackSession({
      targetId,
      projectId: job.projectId,
      jobId: job.id,
      bookSourceId: job.bookSourceId,
      preparedSourceId: job.preparedSourceId,
      bookScope: job.bookScope,
      currentTimeSec: playbackCursorSec,
      durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
      activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
      readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
    })
      .then((session) => {
        if (!isCancelled) {
          setActivePlaybackSession(session);
        }
      })
      .catch(() => {
        // Progress sync should never interrupt playback.
      });
    return () => {
      isCancelled = true;
    };
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    isPlaybackActive,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
  ]);

  useEffect(() => {
    if (!activePlaybackSession || !job) {
      return;
    }
    const sync = () => {
      void syncPlaybackSession(activePlaybackSession.id, {
        currentTimeSec: playbackCursorSec,
        durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
        activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
        readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
        finished:
          job.status === "completed" &&
          job.durationMs > 0 &&
          playbackCursorSec >= job.durationMs / 1000 - 0.2,
      }).then(() => {
        void refreshProjectProgress(job.projectId);
      });
    };
    const interval = globalThis.setInterval(sync, 15_000);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    refreshProjectProgress,
  ]);

  useEffect(() => {
    if (isPlaybackActive || !activePlaybackSession || !job) {
      return;
    }
    const session = activePlaybackSession;
    setActivePlaybackSession(null);
    void closePlaybackSession(session.id, {
      currentTimeSec: playbackCursorSec,
      durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
      activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
      readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
      finished:
        job.status === "completed" &&
        job.durationMs > 0 &&
        playbackCursorSec >= job.durationMs / 1000 - 0.2,
    }).then(() => {
      void refreshProjectProgress(job.projectId);
    });
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    isPlaybackActive,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    refreshProjectProgress,
  ]);

  useEffect(() => {
    if (!isProcessing && !isSettingsOpen && !isWorkspaceOpen) {
      return;
    }
    if (systemMetricsUnavailable) {
      return;
    }

    let isCancelled = false;

    const refreshMetrics = async () => {
      try {
        const metrics = await getSystemMetrics();
        if (isCancelled) {
          return;
        }
        setSystemMetrics(metrics);
        setSystemMetricsUnavailable(false);
        setSystemMetricsError(null);
      } catch (caughtError) {
        if (isCancelled) {
          return;
        }

        const rawMessage =
          caughtError instanceof Error ? caughtError.message : "Unable to load system metrics";
        if (rawMessage.startsWith("404")) {
          setSystemMetricsUnavailable(true);
          setSystemMetrics(null);
          setSystemMetricsError(
            "System metrics endpoint is unavailable in the running backend. Restart backend after pulling this update to load GPU/CPU telemetry.",
          );
          return;
        }

        setSystemMetrics(null);
        setSystemMetricsError(rawMessage);
      }
    };

    void refreshMetrics();
    const interval = globalThis.setInterval(() => {
      void refreshMetrics();
    }, 3000);

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [isProcessing, isSettingsOpen, isWorkspaceOpen, systemMetricsUnavailable]);

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    void submitVoiceJob();
  }

  async function handleCancelVoiceJob() {
    if (!job?.id || !activeJobId) {
      return;
    }

    try {
      await cancelVoiceJob(job.id);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to cancel job");
      setRequestState("error");
    }
  }

  function buildVoiceJobRequest(
    sourceText: string,
    preparedSource?: PreparedSource | null,
  ): CreateVoiceJobRequest {
    const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
    const isSupertonicRun = runConfiguration.ttsEngine === "supertonic-3";
    const selectedProviderVoice = isSupertonicRun
      ? (runConfiguration.engineOptions.voiceStyle ?? "M1")
      : selectedKokoroVoice?.id;
    const selectedProviderLanguage = isSupertonicRun
      ? resolveSupertonicLanguage(runConfiguration.engineOptions.lang, preparedSource)
      : selectedKokoroVoice?.langCode;
    const request: CreateVoiceJobRequest = buildCreateVoiceJobRequest(
      sourceText,
      runConfiguration,
      selectedVoiceProfileId,
      activeProjectId,
      selectedProviderVoice,
      selectedProviderLanguage,
    );
    request.locale = resolveRunLocale(runConfiguration);
    return request;
  }

  async function submitVoiceJob() {
    const request = buildVoiceJobRequest(text);

    setRequestState("running");
    setError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);

    try {
      const nextJob = await createVoiceJob(request);
      setJob(nextJob);
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
    } catch (caughtError) {
      setRequestState("error");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create voice job");
    }
  }

  async function loadBookNarrationText(book: BookSource, scope: BookScope): Promise<string | null> {
    const existingText = bookScopeContentMatches(bookScopeContent, book.id, scope)
      ? (bookScopeContent?.text ?? "")
      : bookScopeText(book, scope);
    if (existingText.trim()) {
      return existingText;
    }
    try {
      const content = await getBookSourceScope(book.id, scope);
      setBookScopeContent(content);
      return content.text;
    } catch (caughtError) {
      if (isApiNotFoundError(caughtError)) {
        clearMissingBookSource(book.id);
      } else {
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load book narration text"));
      }
      return null;
    }
  }

  async function submitBookNarrationJob(book: BookSource, scope: BookScope) {
    if (book.status !== "ready") {
      setBookSourceError(book.error ?? "Book source is not ready for narration.");
      return;
    }
    const scopedText = await loadBookNarrationText(book, scope);
    if (!scopedText) {
      return;
    }
    const request = {
      ...buildVoiceJobRequest(scopedText),
      bookSourceId: book.id,
      bookScope: scope,
    };
    setRequestState("running");
    setError(null);
    setBookSourceError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setSelectedBookSourceId(book.id);
    setSelectedBookScope(scope);
    setText(scopedText);

    try {
      const nextJob = await createBookNarrationJob(book.id, request);
      setJob(nextJob);
      setSelectedBookSourceId(nextJob.bookSourceId ?? book.id);
      setSelectedBookScope(nextJob.bookScope ?? scope);
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
    } catch (caughtError) {
      setRequestState("error");
      setBookSourceError(
        caughtError instanceof Error ? caughtError.message : "Unable to create book narration",
      );
    }
  }

  async function submitPreparedSourceJob(source: PreparedSource) {
    if (source.status !== "ready") {
      setSourcePrepError(source.error ?? "Prepared source is not ready for narration.");
      return;
    }
    const speechText = source.speechText ?? "";
    if (!speechText.trim()) {
      setSourcePrepError("Prepared source has no speakable blocks.");
      return;
    }
    const request = {
      ...buildVoiceJobRequest(speechText, source),
      preparedSourceId: source.id,
      selectedBlockIds:
        source.blocks?.filter((block) => block.speakMode !== "skip").map((block) => block.id) ?? [],
      sourceKind: source.kind,
      progressTargetId: `prepared:${source.id}`,
      speechPolicyProfile,
      speechPolicyOverrides: compactSpeechPolicyOverrides(speechPolicyOverrides),
    };
    setRequestState("running");
    setError(null);
    setSourcePrepError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setSelectedPreparedSourceId(source.id);
    setText(speechText);

    try {
      const nextJob = await createPreparedSourceJob(source.id, request);
      setJob(nextJob);
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
    } catch (caughtError) {
      setRequestState("error");
      setSourcePrepError(
        caughtError instanceof Error ? caughtError.message : "Unable to create prepared narration",
      );
    }
  }

  const studioJobName = getStudioJobName(job);
  const studioProjectName = activeProject?.name ?? DEFAULT_PROJECT_NAME;

  return (
    <main className="vs-app" data-theme={themeName}>
      <TopProductBar
        activeJobId={activeJobId}
        activeProjectId={activeProjectId}
        canSubmit={canSubmit}
        isProcessing={isProcessing}
        job={job}
        jobName={studioJobName}
        projectJobs={projectJobs}
        projectName={studioProjectName}
        projects={projects}
        requestState={requestState}
        onCancel={() => {
          void handleCancelVoiceJob();
        }}
        onExportOpen={() => {
          setBundlePanelMode("export");
          setIsBundlePanelOpen(true);
        }}
        onHelpOpen={() => {
          setIsHelpOpen(true);
        }}
        onImportOpen={() => {
          setBundlePanelMode("import");
          setIsBundlePanelOpen(true);
        }}
        onJobSelect={(jobId) => {
          void handleSelectJob(jobId);
        }}
        onProjectSelect={selectProject}
        onRunConfigOpen={() => {
          setIsRunConfigOpen(true);
        }}
        onSettingsOpen={() => {
          setIsSettingsOpen(true);
        }}
        onSubmit={() => {
          void submitVoiceJob();
        }}
        onWorkspaceOpen={() => {
          setIsWorkspaceOpen(true);
        }}
        runConfiguration={runConfiguration}
      />

      <WorkspaceDrawer
        activeProjectId={activeProjectId}
        bookSources={bookSources}
        isOpen={isWorkspaceOpen}
        job={job}
        metrics={systemMetrics}
        metricsError={systemMetricsError}
        projectError={projectError}
        projectJobs={projectJobs}
        projects={projects}
        profileSource={profileSource}
        profiles={voiceProfiles}
        customSpeechPolicyProfiles={customSpeechPolicyProfiles}
        speechPolicyProfile={speechPolicyProfile}
        speechPolicyProfiles={speechPolicyProfiles}
        selectedProfileId={selectedVoiceProfileId}
        onDeleteProject={handleDeleteProject}
        onCreateProject={handleCreateProject}
        onClose={() => {
          setIsWorkspaceOpen(false);
        }}
        onExportOpen={() => {
          setIsWorkspaceOpen(false);
          setBundlePanelMode("export");
          setIsBundlePanelOpen(true);
        }}
        onImportOpen={() => {
          setIsWorkspaceOpen(false);
          setBundlePanelMode("import");
          setIsBundlePanelOpen(true);
        }}
        onOpenSettings={() => {
          setIsWorkspaceOpen(false);
          setIsSettingsOpen(true);
        }}
        onRenameProject={handleRenameProject}
        onSelectProject={selectProject}
        onSelectProfile={selectVoiceProfile}
        onSpeechPolicyProfileChange={(profile) => {
          void handleSpeechPolicyProfileChange(profile);
        }}
      />
      <RunConfigDrawer
        canSubmit={canSubmit}
        isOpen={isRunConfigOpen}
        job={job}
        runConfiguration={runConfiguration}
        selectedProfile={selectedVoiceProfile}
        ttsEngineError={ttsEngineError}
        ttsEngines={ttsEngines}
        onChange={setRunConfiguration}
        onClose={() => {
          setIsRunConfigOpen(false);
        }}
        onPrepareProfileTarget={handleBuildVoiceProfileArtifact}
        onSubmit={() => {
          setIsRunConfigOpen(false);
          void submitVoiceJob();
        }}
      />
      <HelpPanel
        isOpen={isHelpOpen}
        job={job}
        profileSourceDiagnostics={profileSourceDiagnostics}
        profileSource={profileSource}
        selectedProfile={selectedVoiceProfile}
        onClose={() => {
          setIsHelpOpen(false);
        }}
      />
      <SettingsPanel
        isOpen={isSettingsOpen}
        job={job}
        metrics={systemMetrics}
        metricsError={systemMetricsError}
        profileSourceDiagnostics={profileSourceDiagnostics}
        profileSource={profileSource}
        projectStorage={projectStorage}
        projectStorageError={projectStorageError}
        researchModules={researchModules}
        runConfiguration={runConfiguration}
        selectedProfile={selectedVoiceProfile}
        teleprompterSettings={teleprompterSettings}
        themeName={themeName}
        ttsEngineError={ttsEngineError}
        ttsEngines={ttsEngines}
        onRunConfigurationChange={setRunConfiguration}
        onClose={() => {
          setIsSettingsOpen(false);
        }}
        onTeleprompterSettingsChange={(settings) => {
          setTeleprompterSettings(normalizeTeleprompterHighlightSettings(settings));
        }}
        onThemeChange={setThemeName}
      />
      <BundleFlowPanel
        activeProjectId={activeProjectId}
        activeProjectName={studioProjectName}
        isOpen={isBundlePanelOpen}
        mode={bundlePanelMode}
        projects={projects}
        onClose={() => {
          setIsBundlePanelOpen(false);
        }}
        onImported={handleBundleImported}
      />
      <ContentIRDrawer
        document={contentIRDocument}
        error={contentIRError}
        isLoading={isContentIRLoading}
        isOpen={isContentIROpen}
        title={contentIRTitle}
        onClose={() => {
          setIsContentIROpen(false);
        }}
      />
      {isBookCinemaOpen && selectedBookSource && effectiveBookScope ? (
        <BookCinemaOverlay
          book={selectedBookSource}
          canCreateAudio={!isProcessing}
          isProcessing={isProcessing}
          job={job}
          playbackControls={playbackControls}
          playbackCursorSec={playbackCursorSec}
          progress={selectedBookProgress ?? hashProgress}
          scope={effectiveBookScope}
          scopeContent={bookScopeContent}
          highlightCue={activeHighlightCue}
          highlightMap={highlightMap}
          textSize={bookCinemaTextSize}
          themeName={bookCinemaThemeName}
          onClose={() => {
            setIsBookCinemaOpen(false);
          }}
          onCreateAudio={(book, scope) => {
            void submitBookNarrationJob(book, scope);
          }}
          onInspectStructure={(book) => {
            void handleInspectContentIR(book.id, bookSourceName(book));
          }}
          onBookmark={() => {
            void handleAddPlaybackBookmark();
          }}
          onPlayPause={handleBookCinemaPlayPause}
          onRestart={handleBookCinemaRestart}
          onScopeChange={setSelectedBookScope}
          onSkip={handleBookCinemaSkip}
          onResumeProgress={(progress, seconds) => {
            void handleResumeProgress(progress, seconds);
          }}
          onTextSizeChange={setBookCinemaTextSize}
          onThemeChange={setBookCinemaThemeName}
        />
      ) : null}

      <ResearchModulesSetupCard
        error={researchModuleError}
        hidden={isResearchPromptHidden}
        modules={researchModules}
        cloningModuleId={cloningResearchModuleId}
        onClone={(moduleId) => {
          void handleCloneResearchModule(moduleId);
        }}
        onHide={handleHideResearchPrompt}
      />

      <section className="grid min-h-[calc(100vh-58px)] grid-cols-1 border-t lg:grid-cols-[340px_minmax(0,1fr)_360px] vs-border">
        <aside className="vs-raised order-3 flex min-w-0 flex-col overflow-hidden border-zinc-200 lg:order-none lg:border-r">
          <VoiceStudioPanel
            buildingArtifactKey={buildingArtifactKey}
            error={profileError}
            job={job}
            profileSource={profileSource}
            profileSourceDiagnostics={profileSourceDiagnostics}
            isLoading={isLoadingProfiles}
            isAnalyzingSource={isAnalyzingProfileSource}
            optimizedText={job?.optimizedText ?? ""}
            profileCandidateCreateId={profileCandidateCreateId}
            profiles={voiceProfiles}
            researchModules={researchModules}
            runConfiguration={runConfiguration}
            selectedKokoroVoiceId={selectedKokoroVoiceId}
            selectedProfileId={selectedVoiceProfileId}
            studioPipelineHint={studioPipelineHint}
            ttsEngines={ttsEngines}
            onAnalyzeSource={handleAnalyzeVoiceSource}
            onClearSelection={clearVoiceProfileSelection}
            onBuildArtifact={handleBuildVoiceProfileArtifact}
            onCreateProfileFromCandidate={handleCreateVoiceProfileFromCandidate}
            onDeleteProfile={(id) => {
              void handleDeleteVoiceProfile(id);
            }}
            onRunConfigurationChange={setRunConfiguration}
            onSelectKokoroVoice={selectKokoroVoice}
            onSelectProfile={selectVoiceProfile}
          />
        </aside>

        <section className="order-1 flex min-w-0 flex-col gap-5 p-5 lg:order-none xl:p-6">
          <TeleprompterPanel
            canOpenBookCinema={canOpenBookCinema}
            isPlaybackActive={isPlaybackActive}
            job={job}
            latestProgress={latestProgress}
            onOpenBookCinema={() => {
              setBookCinemaThemeName(themeName === "light" ? "night" : themeName);
              setIsBookCinemaOpen(true);
            }}
            onResumeProgress={(progress) => {
              void handleResumeProgress(progress);
            }}
            playbackControls={playbackControls}
            playbackCursorSec={playbackCursorSec}
            preparedSourceForCinema={jobPreparedSource ?? selectedPreparedSource}
            settings={teleprompterSettings}
            themeName={themeName}
            onOpenSettings={() => {
              setIsSettingsOpen(true);
            }}
          />
          <SourceTextPanel
            projectId={activeProjectId}
            bookControls={
              <BookCinemaPanel
                bookSources={bookSources}
                canCreateAudio={!isProcessing}
                diagnostics={bookCinemaDiagnostics}
                error={bookSourceError}
                isImporting={isImportingBookSource}
                isProcessing={isProcessing}
                isScopeLoading={isLoadingBookScope}
                scopeContent={bookScopeContent}
                selectedBookScope={effectiveBookScope}
                selectedBookSourceId={selectedBookSourceId}
                onCreateAudio={(book, scope) => {
                  void submitBookNarrationJob(book, scope);
                }}
                onImport={handleImportBookSource}
                onOpenCinema={() => {
                  setBookCinemaThemeName(themeName === "light" ? "night" : themeName);
                  setIsBookCinemaOpen(true);
                }}
                onInspectStructure={(book) => {
                  void handleInspectContentIR(book.id, bookSourceName(book));
                }}
                onScopeChange={setSelectedBookScope}
                onSelectBook={setSelectedBookSourceId}
                onUseText={handleUseBookText}
              />
            }
            canSubmit={canSubmit}
            isPreparingSource={isPreparingSource}
            isProcessing={isProcessing}
            preparedSources={preparedSources}
            selectedPreparedSource={selectedPreparedSource}
            speechPolicyError={speechPolicyError}
            speechPolicyOverrides={speechPolicyOverrides}
            speechPolicyProfile={speechPolicyProfile}
            customSpeechPolicyProfiles={customSpeechPolicyProfiles}
            speechPolicyProfiles={speechPolicyProfiles}
            sourcePrepError={sourcePrepError}
            text={text}
            voiceProfileId={selectedVoiceProfileId}
            isSpeechPolicyPreviewing={isSpeechPolicyPreviewing}
            onClearSpeechPolicyOverrides={handleClearSpeechPolicyOverrides}
            onCreatePreparedAudio={(source) => {
              void submitPreparedSourceJob(source);
            }}
            onInspectPreparedSource={(source) => {
              void handleInspectContentIR(source.id, source.title ?? source.sourceName, true);
            }}
            onPrepareFile={handlePrepareSourceFile}
            onPrepareUrl={handlePrepareSourceUrl}
            onSpeechPolicyOverridesChange={handleSpeechPolicyOverridesChange}
            onSpeechPolicyProfileChange={(profile) => {
              void handleSpeechPolicyProfileChange(profile);
            }}
            onCreateCustomSpeechPolicyProfile={handleCreateCustomSpeechPolicyProfile}
            onDeleteCustomSpeechPolicyProfile={handleDeleteCustomSpeechPolicyProfile}
            onUpdateCustomSpeechPolicyProfile={handleUpdateCustomSpeechPolicyProfile}
            onSubmit={handleSubmit}
            onTextChange={setText}
            onUsePreparedSource={handleUsePreparedSource}
          />
          <SourceMetadataStrip job={job} text={text} />
          <PipelineStageCards pipeline={ttsPipeline} job={job} hint={ttsPipelineHint} />
          <RelevantMetricsPanel
            job={job}
            metrics={systemMetrics}
            metricsError={systemMetricsError}
          />
          {error ? (
            <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </section>
          ) : null}
        </section>

        <aside className="vs-raised order-2 flex min-w-0 flex-col gap-4 border-zinc-200 p-5 lg:order-none lg:border-l">
          <AudioPanel
            job={job}
            latestProgress={latestProgress}
            onPlaybackCursorChange={setPlaybackCursorSec}
            onPlaybackControlsChange={handlePlaybackControlsChange}
            onPlaybackStateChange={setIsPlaybackActive}
            onResumeProgress={(progress) => {
              void handleResumeProgress(progress);
            }}
          />
          {job?.progress.message ? <ProgressPanel job={job} now={now} /> : null}
        </aside>
      </section>
    </main>
  );
}

function pipelineStatusClass(status: StageStatus): string {
  if (status === "done") {
    return "border-emerald-500 text-emerald-600";
  }
  if (status === "running") {
    return "border-blue-500 text-blue-600";
  }
  if (status === "failed") {
    return "border-red-500 text-red-600";
  }
  return "border-zinc-300 text-zinc-500";
}

function PipelineStageCards({
  hint,
  job,
  pipeline,
}: Readonly<{ hint: string; job: VoiceJob | null; pipeline: PipelineStepState }>) {
  const total = job?.retries.totalSegments ?? job?.progress.totalSegments ?? 0;
  const current = job?.audioReadySegments ?? job?.progress.currentSegment ?? 0;
  const stages = [
    {
      label: "Optimize",
      status: pipeline.optimization,
      detail: pipeline.optimization === "done" ? "Completed" : hint,
      meta: `${String(Math.max(0, Math.round((job?.optimizedText.length ?? 0) / 4)))} tokens`,
    },
    {
      label: "Synthesize",
      status: pipeline.synthesis,
      detail: pipeline.synthesis === "running" ? "In Progress" : pipeline.synthesis,
      meta:
        total > 0
          ? `${formatPercentageRatio(current, total)} · ${String(current)} / ${String(total)} segments`
          : "Waiting for segments",
    },
    {
      label: "Check",
      status: pipeline.checker,
      detail: pipeline.checker === "running" ? "Checker running" : pipeline.checker,
      meta: job?.voiceCheck.reason ?? "Checker will run automatically",
    },
  ];

  return (
    <ol className="grid overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm md:grid-cols-3">
      {stages.map((stage, index) => (
        <li
          className="grid gap-2 border-b border-zinc-200 p-5 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          key={stage.label}
        >
          <div className="flex items-center gap-3">
            <span
              className={`grid h-8 w-8 place-items-center rounded-full border text-sm font-semibold ${pipelineStatusClass(stage.status)}`}
            >
              {stage.status === "done" ? "✓" : String(index + 1)}
            </span>
            <p className="font-semibold text-zinc-950">{stage.label}</p>
          </div>
          <p className="pl-11 text-sm text-zinc-600">{stage.detail}</p>
          <p className="pl-11 text-xs text-zinc-500">{stage.meta}</p>
        </li>
      ))}
    </ol>
  );
}

function RelevantMetricsPanel({
  job,
  metrics,
  metricsError,
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
}>) {
  const total = job?.retries.totalSegments ?? job?.segments?.length ?? 0;
  const ready = job?.audioReadySegments ?? 0;
  const throughput = calculateArrivalThroughput(job);
  const gpu = metrics?.gpus?.[0];
  const gpuMemory = gpu ? formatPercentageRatio(gpu.memoryUsedMiB, gpu.memoryTotalMiB) : "n/a";
  const confidence = formatSimilarity(job?.voiceCheck.similarity ?? 0);

  return (
    <dl className="grid rounded-lg border border-zinc-200 bg-white shadow-sm sm:grid-cols-2 2xl:grid-cols-3">
      <ProductMetric
        label="Segment Progress"
        value={total > 0 ? formatPercentageRatio(ready, total) : "0%"}
        detail={total > 0 ? `${String(ready)} / ${String(total)} segments` : "Waiting"}
        tone="blue"
      />
      <ProductMetric
        label="First Audio ETA"
        value={estimateFirstAudioETA(job)}
        detail="until first checked segment"
      />
      <ProductMetric
        label="Buffer Health"
        value={formatBufferHealth(job)}
        detail={ready > 0 ? `${String(ready)} ready` : "No buffer yet"}
        tone="green"
      />
      <ProductMetric
        label="Clone Pace"
        value={formatPace(throughput?.pace)}
        detail="realtime"
        tone="orange"
      />
      <ProductMetric
        label="Checker Confidence"
        value={confidence}
        detail={job?.voiceCheck.provider ?? "waiting"}
      />
      <ProductMetric
        label="GPU Memory"
        value={gpuMemory}
        detail={gpu?.name ?? metricsError ?? "metrics unavailable"}
        tone="orange"
      />
    </dl>
  );
}

function ProductMetric({
  detail,
  label,
  tone = "neutral",
  value,
}: Readonly<{
  detail: string;
  label: string;
  tone?: "neutral" | "blue" | "green" | "orange";
  value: string;
}>) {
  const barClassByTone: Record<"neutral" | "blue" | "green" | "orange", string> = {
    neutral: "bg-blue-500",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    orange: "bg-orange-500",
  };
  const barClass = barClassByTone[tone];
  return (
    <div className="min-w-0 border-b border-zinc-200 p-4 last:border-b-0">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold leading-tight text-zinc-950">
        {value}
      </dd>
      <p className="mt-1 truncate text-xs text-zinc-500" title={detail}>
        {detail}
      </p>
      <div className="mt-3 h-1 rounded-full bg-zinc-100">
        <div className={`h-1 w-2/5 rounded-full ${barClass}`} />
      </div>
    </div>
  );
}

function SourceTextPanel({
  bookControls,
  canSubmit,
  isProcessing,
  isPreparingSource,
  isSpeechPolicyPreviewing,
  preparedSources,
  projectId,
  selectedPreparedSource,
  customSpeechPolicyProfiles,
  speechPolicyError,
  speechPolicyOverrides,
  speechPolicyProfile,
  speechPolicyProfiles,
  sourcePrepError,
  text,
  voiceProfileId,
  onClearSpeechPolicyOverrides,
  onCreateCustomSpeechPolicyProfile,
  onCreatePreparedAudio,
  onDeleteCustomSpeechPolicyProfile,
  onInspectPreparedSource,
  onPrepareFile,
  onPrepareUrl,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
  onUpdateCustomSpeechPolicyProfile,
  onSubmit,
  onTextChange,
  onUsePreparedSource,
}: Readonly<{
  bookControls: ReactNode;
  canSubmit: boolean;
  isProcessing: boolean;
  isPreparingSource: boolean;
  isSpeechPolicyPreviewing: boolean;
  preparedSources: PreparedSource[];
  projectId: string;
  selectedPreparedSource: PreparedSource | null;
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  sourcePrepError: string | null;
  text: string;
  voiceProfileId: string;
  onClearSpeechPolicyOverrides: () => void;
  onCreateCustomSpeechPolicyProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onCreatePreparedAudio: (source: PreparedSource) => void;
  onDeleteCustomSpeechPolicyProfile: (profileId: string) => Promise<void>;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onPrepareFile: (file: File, markdownParseMode: MarkdownParseMode) => Promise<void>;
  onPrepareUrl: (url: string, markdownParseMode: MarkdownParseMode) => Promise<void>;
  onSpeechPolicyOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onUpdateCustomSpeechPolicyProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onTextChange: (text: string) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [sourceFileLabel, setSourceFileLabel] = useState<string | null>(null);
  const [sourceFileError, setSourceFileError] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<"book" | "file" | "text">("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [markdownParseMode, setMarkdownParseMode] = useState<MarkdownParseMode>("strict");

  const loadSourceFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isProcessing) {
        return;
      }

      setSourceFileError(null);
      const fileArray = [...files].filter((file) =>
        sourceMode === "file" ? isSupportedSourcePrepFile(file) : isSupportedSourceTextFile(file),
      );
      if (fileArray.length === 0) {
        setSourceFileError("Drop a text, HTML, PDF, EPUB, CSV, JSON, or log file.");
        return;
      }

      try {
        if (sourceMode === "file") {
          await onPrepareFile(fileArray[0], markdownParseMode);
          setSourceFileLabel(formatSourceTextFileLabel(fileArray));
          return;
        }
        const parts = await Promise.all(fileArray.map((file) => file.text()));
        onTextChange(
          parts
            .map((part) => part.trim())
            .filter(Boolean)
            .join("\n\n"),
        );
        setSourceFileLabel(formatSourceTextFileLabel(fileArray));
      } catch {
        setSourceFileError("Unable to read that file locally.");
      }
    },
    [isProcessing, markdownParseMode, onPrepareFile, onTextChange, sourceMode],
  );

  return (
    <form
      className={`min-w-0 overflow-hidden rounded-lg border bg-white p-5 shadow-sm ${
        isDragActive ? "border-orange-300 ring-2 ring-orange-100" : "border-zinc-200"
      }`}
      onSubmit={onSubmit}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isProcessing) {
          setIsDragActive(true);
        }
      }}
      onDragLeave={() => {
        setIsDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        void loadSourceFiles(event.dataTransfer.files);
      }}
    >
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <label className="text-sm font-semibold text-zinc-950" htmlFor="source-text">
            Source Intake
          </label>
          <p className="mt-1 text-xs text-zinc-500">
            {text.trim().length.toLocaleString()} characters queued
          </p>
        </div>
        <div className="grid grid-cols-3 rounded-md border border-zinc-200 bg-zinc-50 p-1 text-xs font-semibold text-zinc-600">
          {(["text", "book", "file"] as const).map((mode) => (
            <button
              className={`rounded px-3 py-1.5 capitalize transition ${
                sourceMode === mode ? "bg-white text-orange-700 shadow-sm" : "hover:text-zinc-900"
              }`}
              key={mode}
              onClick={() => {
                setSourceMode(mode);
              }}
              type="button"
            >
              {mode === "file" ? "File / URL" : mode}
            </button>
          ))}
        </div>
      </div>
      {sourceMode === "book" ? bookControls : null}
      {sourceMode === "file" ? (
        <SourcePrepReview
          projectId={projectId}
          isPreparing={isPreparingSource}
          isSpeechPolicyPreviewing={isSpeechPolicyPreviewing}
          customSpeechPolicyProfiles={customSpeechPolicyProfiles}
          preparedSources={preparedSources}
          selectedPreparedSource={selectedPreparedSource}
          speechPolicyError={speechPolicyError}
          speechPolicyOverrides={speechPolicyOverrides}
          speechPolicyProfile={speechPolicyProfile}
          speechPolicyProfiles={speechPolicyProfiles}
          sourceFileError={sourceFileError}
          sourceFileLabel={sourceFileLabel}
          markdownParseMode={markdownParseMode}
          sourcePrepError={sourcePrepError}
          sourceUrl={sourceUrl}
          voiceProfileId={voiceProfileId}
          onBrowse={() => {
            fileInputRef.current?.click();
          }}
          onCreatePreparedAudio={onCreatePreparedAudio}
          onCreateCustomSpeechPolicyProfile={onCreateCustomSpeechPolicyProfile}
          onDeleteCustomSpeechPolicyProfile={onDeleteCustomSpeechPolicyProfile}
          onInspectPreparedSource={onInspectPreparedSource}
          onPrepareUrl={() => {
            if (sourceUrl.trim()) {
              void onPrepareUrl(sourceUrl.trim(), markdownParseMode);
            }
          }}
          onClearSpeechPolicyOverrides={onClearSpeechPolicyOverrides}
          onSpeechPolicyOverridesChange={onSpeechPolicyOverridesChange}
          onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
          onUpdateCustomSpeechPolicyProfile={onUpdateCustomSpeechPolicyProfile}
          onSourceUrlChange={setSourceUrl}
          onMarkdownParseModeChange={setMarkdownParseMode}
          onUsePreparedSource={(source) => {
            void onUsePreparedSource(source);
          }}
        >
          <input
            ref={fileInputRef}
            accept={SOURCE_TEXT_FILE_ACCEPT}
            className="sr-only"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.item(0);
              if (file) {
                void loadSourceFiles([file]);
              }
              event.currentTarget.value = "";
            }}
          />
        </SourcePrepReview>
      ) : null}
      {sourceMode === "text" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
            <span className="min-w-0 flex-1 basis-48 truncate" title={sourceFileLabel ?? undefined}>
              {sourceFileLabel ?? "Drop text or Markdown files here"}
            </span>
            <button
              className="rounded border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700 disabled:opacity-50"
              disabled={isProcessing}
              onClick={() => {
                fileInputRef.current?.click();
              }}
              type="button"
            >
              Browse Text
            </button>
            <input
              ref={fileInputRef}
              accept={SOURCE_TEXT_FILE_ACCEPT}
              className="sr-only"
              multiple
              type="file"
              onChange={(event) => {
                if (event.currentTarget.files) {
                  void loadSourceFiles(event.currentTarget.files);
                }
                event.currentTarget.value = "";
              }}
            />
          </div>
          {sourceFileError ? <p className="mb-3 text-xs text-red-700">{sourceFileError}</p> : null}
          <textarea
            className="min-h-[180px] w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 p-4 font-mono text-sm leading-6 text-zinc-900 outline-none transition read-only:bg-zinc-100 read-only:text-zinc-500 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100"
            id="source-text"
            onChange={(event) => {
              if (!isProcessing) {
                onTextChange(event.currentTarget.value);
              }
            }}
            placeholder="Paste the text you want to listen to."
            readOnly={isProcessing}
            spellCheck={false}
            value={text}
          />
        </>
      ) : null}
      <button className="sr-only" disabled={!canSubmit} type="submit">
        Create & Listen
      </button>
    </form>
  );
}

function isSupportedSourceTextFile(file: File): boolean {
  if (file.type.startsWith("text/") || file.type === "application/json") {
    return true;
  }
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return SOURCE_TEXT_FILE_EXTENSIONS.has(extension);
}

function speakModeClass(mode: string): string {
  if (mode === "skip") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (mode === "summarize") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

type SourcePrepReviewTab = "blocks" | "preview" | "pronunciation" | "math" | "rules";

function SourcePrepMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 bg-white px-4 py-3">
      <dt className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-zinc-950" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SourcePrepTabButton({
  active,
  label,
  onClick,
}: Readonly<{ active: boolean; label: string; onClick: () => void }>) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 transition ${
        active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function MarkdownParseModeControl({
  mode,
  onChange,
}: Readonly<{
  mode: MarkdownParseMode;
  onChange: (mode: MarkdownParseMode) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-3 text-xs">
      <span className="font-semibold text-zinc-700">Markdown parser</span>
      <div className="grid grid-cols-2 rounded-md border border-zinc-200 bg-white p-1 font-semibold text-zinc-600">
        {(["strict", "legacy"] as const).map((item) => (
          <button
            className={`rounded px-3 py-1.5 capitalize transition ${
              mode === item ? "bg-zinc-950 text-white shadow-sm" : "hover:text-zinc-900"
            }`}
            key={item}
            onClick={() => {
              onChange(item);
            }}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function preparedSourceBlockMatchesFilters(
  block: PreparedSourceBlock,
  kindFilter: string,
  modeFilter: string,
  query: string,
): boolean {
  if (kindFilter && block.kind !== kindFilter) {
    return false;
  }
  if (modeFilter && block.speakMode !== modeFilter) {
    return false;
  }
  if (!query) {
    return true;
  }
  return [
    block.kind,
    block.speakMode,
    block.label,
    block.text,
    block.spokenText,
    block.speechPolicy.explanation,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(query);
}

function preparedSourceSummaryLine(source: PreparedSource | null): string {
  const base = `${String(source?.summary.sentenceSegmentCount ?? 0)} sentence segments · ${String(
    source?.summary.citationSkipCount ?? 0,
  )} citations skipped`;
  if (source?.sourceFormat !== "markdown") {
    return base;
  }
  return `${base} · ${source.markdownParseMode ?? "strict"} markdown`;
}

function blockHasSpeechDifference(block: PreparedSourceBlock): boolean {
  const displayed = normalizeSpeechComparisonText(block.text ?? block.label ?? "");
  const spoken = normalizeSpeechComparisonText(block.spokenText ?? "");
  return Boolean(displayed && spoken && displayed !== spoken);
}

function normalizeSpeechComparisonText(value: string): string {
  return value
    .replaceAll(/^#+\s*/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function LanguageBadge({ block }: Readonly<{ block: PreparedSourceBlock }>) {
  const lang = block.language ?? block.languageSpans?.[0]?.lang;
  const spanCount = block.languageSpans?.length ?? 0;
  if (!lang && spanCount === 0) {
    return null;
  }
  const mixed = spanCount > 1;
  return (
    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-700">
      {mixed ? `mixed · ${lang ?? "multi"} · ${spanCount.toLocaleString()} spans` : lang}
    </span>
  );
}

function SourcePrepReview({
  children,
  customSpeechPolicyProfiles,
  isPreparing,
  isSpeechPolicyPreviewing,
  preparedSources,
  projectId,
  selectedPreparedSource,
  speechPolicyError,
  speechPolicyOverrides,
  speechPolicyProfile,
  speechPolicyProfiles,
  sourceFileError,
  sourceFileLabel,
  markdownParseMode,
  sourcePrepError,
  sourceUrl,
  voiceProfileId,
  onBrowse,
  onClearSpeechPolicyOverrides,
  onCreateCustomSpeechPolicyProfile,
  onCreatePreparedAudio,
  onDeleteCustomSpeechPolicyProfile,
  onInspectPreparedSource,
  onMarkdownParseModeChange,
  onPrepareUrl,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
  onSourceUrlChange,
  onUpdateCustomSpeechPolicyProfile,
  onUsePreparedSource,
}: Readonly<{
  children: ReactNode;
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  isPreparing: boolean;
  isSpeechPolicyPreviewing: boolean;
  preparedSources: PreparedSource[];
  projectId: string;
  selectedPreparedSource: PreparedSource | null;
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  sourceFileError: string | null;
  sourceFileLabel: string | null;
  markdownParseMode: MarkdownParseMode;
  sourcePrepError: string | null;
  sourceUrl: string;
  voiceProfileId: string;
  onBrowse: () => void;
  onClearSpeechPolicyOverrides: () => void;
  onCreateCustomSpeechPolicyProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onCreatePreparedAudio: (source: PreparedSource) => void;
  onDeleteCustomSpeechPolicyProfile: (profileId: string) => Promise<void>;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onMarkdownParseModeChange: (mode: MarkdownParseMode) => void;
  onPrepareUrl: () => void;
  onSpeechPolicyOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onSourceUrlChange: (url: string) => void;
  onUpdateCustomSpeechPolicyProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onUsePreparedSource: (source: PreparedSource) => void;
}>) {
  const source = selectedPreparedSource;
  const blocks = source?.blocks ?? [];
  const [reviewTab, setReviewTab] = useState<SourcePrepReviewTab>("blocks");
  const [blockQuery, setBlockQuery] = useState("");
  const [blockKindFilter, setBlockKindFilter] = useState("");
  const [blockModeFilter, setBlockModeFilter] = useState("");
  const blockKinds = useMemo(
    () => uniqueSortedStrings(blocks.map((block) => block.kind)),
    [blocks],
  );
  const filteredBlocks = useMemo(() => {
    const query = blockQuery.trim().toLowerCase();
    return blocks.filter((block) =>
      preparedSourceBlockMatchesFilters(block, blockKindFilter, blockModeFilter, query),
    );
  }, [blockKindFilter, blockModeFilter, blockQuery, blocks]);

  return (
    <div className="grid min-w-0 gap-4">
      <div className="grid min-w-0 gap-3 overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid max-w-full min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            className="h-10 w-full min-w-0 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            onChange={(event) => {
              onSourceUrlChange(event.currentTarget.value);
            }}
            placeholder="Paste a readable web page, raw text, PDF, or EPUB URL"
            type="url"
            value={sourceUrl}
          />
          <button
            className="h-10 w-full rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 md:w-auto"
            disabled={isPreparing || sourceUrl.trim().length === 0}
            onClick={onPrepareUrl}
            type="button"
          >
            {isPreparing ? "Preparing..." : "Fetch & Prepare"}
          </button>
        </div>
        <MarkdownParseModeControl mode={markdownParseMode} onChange={onMarkdownParseModeChange} />
        <div className="flex max-w-full min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-zinc-600">
          <span className="min-w-0 flex-1 truncate" title={sourceFileLabel ?? undefined}>
            {sourceFileLabel ??
              "Drop a file here, or browse for text, PDF, EPUB, HTML, CSV, JSON, or logs"}
          </span>
          <button
            className="rounded border border-zinc-200 bg-white px-3 py-1.5 font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700 disabled:opacity-50"
            disabled={isPreparing}
            onClick={onBrowse}
            type="button"
          >
            Browse File
          </button>
          {children}
        </div>
        {sourceFileError || sourcePrepError ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {sourceFileError ?? sourcePrepError}
          </p>
        ) : null}
      </div>

      {preparedSources.length > 0 ? (
        <div className="grid gap-3">
          <SpeechPolicyControls
            customProfiles={customSpeechPolicyProfiles}
            isPreviewing={isSpeechPolicyPreviewing}
            overrides={speechPolicyOverrides}
            profile={speechPolicyProfile}
            profiles={speechPolicyProfiles}
            error={speechPolicyError}
            onClearOverrides={onClearSpeechPolicyOverrides}
            onCreateCustomProfile={onCreateCustomSpeechPolicyProfile}
            onDeleteCustomProfile={onDeleteCustomSpeechPolicyProfile}
            onOverridesChange={onSpeechPolicyOverridesChange}
            onProfileChange={onSpeechPolicyProfileChange}
            onUpdateCustomProfile={onUpdateCustomSpeechPolicyProfile}
          />
          <div className="-mx-1 flex max-w-full min-w-0 gap-2 overflow-x-auto px-1 pb-1">
            {preparedSources.slice(0, 5).map((item) => (
              <button
                className={`w-[190px] shrink-0 rounded-md border p-3 text-left transition sm:w-[220px] ${
                  item.id === source?.id
                    ? "border-orange-300 bg-orange-500/10"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
                key={item.id}
                onClick={() => {
                  onUsePreparedSource(item);
                }}
                type="button"
              >
                <span
                  className="block truncate text-sm font-semibold"
                  title={item.title ?? item.sourceName}
                >
                  {item.title ?? item.sourceName}
                </span>
                <span className="mt-1 block truncate text-xs text-zinc-500" title={item.sourceName}>
                  {item.kind.toUpperCase()} · {item.wordCount.toLocaleString()} words
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            <div className="flex min-w-0 flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <h3
                  className="truncate text-sm font-semibold"
                  title={source?.title ?? source?.sourceName}
                >
                  {source?.title ?? "Prepared Source"}
                </h3>
                <p className="mt-1 text-xs text-zinc-500">{preparedSourceSummaryLine(source)}</p>
              </div>
              {source ? (
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  <button
                    className="h-9 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700"
                    onClick={() => {
                      onInspectPreparedSource(source);
                    }}
                    type="button"
                  >
                    Inspect structure
                  </button>
                  <button
                    className="h-9 rounded-md bg-orange-600 px-3 text-xs font-semibold text-white shadow-sm shadow-orange-500/20 disabled:opacity-50"
                    disabled={isPreparing}
                    onClick={() => {
                      onCreatePreparedAudio(source);
                    }}
                    type="button"
                  >
                    Create & Listen
                  </button>
                </div>
              ) : null}
            </div>
            <dl className="grid grid-cols-2 gap-px border-b border-zinc-200 bg-zinc-200 text-sm sm:grid-cols-5">
              <SourcePrepMetric label="Blocks" value={String(source?.blockCount ?? 0)} />
              <SourcePrepMetric
                label="Speak"
                value={String(source?.summary.spokenBlockCount ?? 0)}
              />
              <SourcePrepMetric
                label="Segments"
                value={String(source?.summary.sentenceSegmentCount ?? 0)}
              />
              <SourcePrepMetric
                label="Citations"
                value={String(source?.summary.citationSkipCount ?? 0)}
              />
              <SourcePrepMetric label="Skipped" value={String(source?.skippedItems?.length ?? 0)} />
            </dl>

            <div className="flex gap-2 overflow-x-auto border-b border-zinc-200 px-4 py-3 text-xs font-semibold">
              <SourcePrepTabButton
                active={reviewTab === "blocks"}
                label="Blocks"
                onClick={() => {
                  setReviewTab("blocks");
                }}
              />
              <SourcePrepTabButton
                active={reviewTab === "preview"}
                label="Preview"
                onClick={() => {
                  setReviewTab("preview");
                }}
              />
              <SourcePrepTabButton
                active={reviewTab === "pronunciation"}
                label="Pronunciation"
                onClick={() => {
                  setReviewTab("pronunciation");
                }}
              />
              <SourcePrepTabButton
                active={reviewTab === "math"}
                label="Math"
                onClick={() => {
                  setReviewTab("math");
                }}
              />
              <SourcePrepTabButton
                active={reviewTab === "rules"}
                label="Rules"
                onClick={() => {
                  setReviewTab("rules");
                }}
              />
            </div>

            {reviewTab === "blocks" ? (
              <SourcePrepBlocksPanel
                blockKindFilter={blockKindFilter}
                blockKinds={blockKinds}
                blockModeFilter={blockModeFilter}
                blockQuery={blockQuery}
                blocks={blocks}
                filteredBlocks={filteredBlocks}
                onKindFilterChange={setBlockKindFilter}
                onModeFilterChange={setBlockModeFilter}
                onQueryChange={setBlockQuery}
              />
            ) : null}
            {reviewTab === "preview" ? <PreparedSourceMarkdownPreview source={source} /> : null}
            {reviewTab === "pronunciation" ? (
              <PronunciationPanel
                projectId={projectId}
                source={source}
                voiceProfileId={voiceProfileId}
              />
            ) : null}
            {reviewTab === "math" ? <SourcePrepMathPanel source={source} /> : null}
            {reviewTab === "rules" ? <SourcePrepRulesPanel source={source} /> : null}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-white p-5 text-sm text-zinc-600">
          Prepare a file or URL to review headings, skipped citations, and sentence-safe narration
          blocks before generating audio.
        </div>
      )}
    </div>
  );
}

function SpeechPolicyControls({
  customProfiles,
  error,
  isPreviewing,
  overrides,
  profile,
  profiles,
  onClearOverrides,
  onCreateCustomProfile,
  onDeleteCustomProfile,
  onOverridesChange,
  onProfileChange,
  onUpdateCustomProfile,
}: Readonly<{
  customProfiles: CustomSpeechPolicyProfile[];
  error: string | null;
  isPreviewing: boolean;
  overrides: SpeechPolicyOverrides;
  profile: string;
  profiles: SpeechPolicyProfile[];
  onClearOverrides: () => void;
  onCreateCustomProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onDeleteCustomProfile: (profileId: string) => Promise<void>;
  onOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onProfileChange: (profile: string) => void;
  onUpdateCustomProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
}>) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isDefaultsOpen, setIsDefaultsOpen] = useState(false);
  const [isCustomFormOpen, setIsCustomFormOpen] = useState(false);
  const activeCustomProfile = customProfiles.find((item) => item.id === profile) ?? null;
  const [customProfileName, setCustomProfileName] = useState("");
  const profileOptions: SpeechPolicyProfile[] =
    profiles.length > 0
      ? profiles
      : SPEECH_POLICY_PROFILE_OPTIONS.map(
          (name): SpeechPolicyProfile => ({
            description: "",
            label: speechPolicyProfileLabel(name),
            name,
            settings: { ...BUILT_IN_SPEECH_POLICY_SETTINGS[name] },
          }),
        );
  const baseSettings = resolveSpeechPolicySettings(profile, profileOptions, customProfiles);
  const effectiveSettings = applySpeechPolicyOverridesToSettings(baseSettings, overrides);
  const baseProfile = activeCustomProfile?.baseProfile ?? profile;
  const customNamePlaceholder = `${speechPolicyProfileDisplayName(profile, customProfiles)} copy`;

  useEffect(() => {
    setCustomProfileName(activeCustomProfile?.name ?? customNamePlaceholder);
  }, [activeCustomProfile?.name, customNamePlaceholder]);

  return (
    <section className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <label className="grid min-w-0 gap-1 text-sm font-semibold text-zinc-950">
          <span>Profile</span>
          <select
            className="h-10 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            onChange={(event) => {
              onProfileChange(normalizeSpeechPolicyProfile(event.currentTarget.value));
            }}
            value={profile}
          >
            {profileOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.label || speechPolicyProfileLabel(option.name)}
              </option>
            ))}
            {customProfiles.length > 0 ? (
              <optgroup label="Custom profiles">
                {customProfiles.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {isPreviewing ? (
            <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">
              Updating preview
            </span>
          ) : null}
          <button
            className="h-9 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700"
            onClick={() => {
              setIsAdvancedOpen((current) => !current);
            }}
            type="button"
          >
            Advanced
          </button>
          <button
            className="h-9 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700"
            onClick={() => {
              setIsDefaultsOpen((current) => !current);
            }}
            type="button"
          >
            Defaults
          </button>
          <button
            className="h-9 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 transition hover:border-orange-300 hover:text-orange-700"
            onClick={() => {
              setIsCustomFormOpen((current) => !current);
            }}
            type="button"
          >
            Save as profile
          </button>
          {hasSpeechPolicyOverrides(overrides) ? (
            <button
              className="h-9 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800"
              onClick={onClearOverrides}
              type="button"
            >
              Clear overrides
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      {isDefaultsOpen ? <SpeechPolicyDefaultsTable profiles={profileOptions} /> : null}
      {isAdvancedOpen ? (
        <div className="grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-2">
          <PolicyModeSelect
            label="Tables"
            options={TABLE_MODE_OPTIONS}
            value={overrides.tableMode ?? ""}
            onChange={(value) => {
              onOverridesChange({
                ...overrides,
                tableMode: value as SpeechPolicyOverrides["tableMode"],
              });
            }}
          />
          <PolicyModeSelect
            label="Code"
            options={CODE_MODE_OPTIONS}
            value={overrides.codeMode ?? ""}
            onChange={(value) => {
              onOverridesChange({
                ...overrides,
                codeMode: value as SpeechPolicyOverrides["codeMode"],
              });
            }}
          />
          <PolicyModeSelect
            label="Math"
            options={MATH_MODE_OPTIONS}
            value={overrides.mathMode ?? ""}
            onChange={(value) => {
              onOverridesChange({
                ...overrides,
                mathMode: value as SpeechPolicyOverrides["mathMode"],
              });
            }}
          />
          <PolicyModeSelect
            label="Notes"
            options={FOOTNOTE_MODE_OPTIONS}
            value={overrides.footnoteMode ?? ""}
            onChange={(value) => {
              onOverridesChange({
                ...overrides,
                footnoteMode: value as SpeechPolicyOverrides["footnoteMode"],
              });
            }}
          />
          <PolicyModeSelect
            label="Images"
            options={IMAGE_MODE_OPTIONS}
            value={overrides.imageMode ?? ""}
            onChange={(value) => {
              onOverridesChange({
                ...overrides,
                imageMode: value as SpeechPolicyOverrides["imageMode"],
              });
            }}
          />
        </div>
      ) : null}
      {isCustomFormOpen ? (
        <div className="grid gap-3 border-t border-zinc-100 pt-3">
          <label className="grid gap-1 text-xs font-semibold text-zinc-700">
            <span>Profile name</span>
            <input
              className="h-9 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-sm outline-none focus:border-orange-400"
              onChange={(event) => {
                setCustomProfileName(event.currentTarget.value);
              }}
              value={customProfileName}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              className="h-9 rounded-md bg-zinc-950 px-3 text-xs font-semibold text-white"
              onClick={() => {
                void onCreateCustomProfile(customProfileName, effectiveSettings, baseProfile);
              }}
              type="button"
            >
              Save new profile
            </button>
            {activeCustomProfile ? (
              <>
                <button
                  className="h-9 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800"
                  onClick={() => {
                    void onUpdateCustomProfile(
                      activeCustomProfile.id,
                      customProfileName,
                      effectiveSettings,
                      baseProfile,
                    );
                  }}
                  type="button"
                >
                  Update selected
                </button>
                <button
                  className="h-9 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700"
                  onClick={() => {
                    void onDeleteCustomProfile(activeCustomProfile.id);
                  }}
                  type="button"
                >
                  Delete selected
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SpeechPolicyDefaultsTable({
  profiles,
}: Readonly<{ profiles: Pick<SpeechPolicyProfile, "name" | "label" | "settings">[] }>) {
  return (
    <div className="overflow-x-auto border-t border-zinc-100 pt-3">
      <table className="min-w-[760px] border-collapse text-left text-xs">
        <thead className="bg-zinc-50 text-[0.68rem] uppercase tracking-[0.14em] text-zinc-500">
          <tr>
            {["Profile", "Mode", "Tables", "Code", "Math", "Notes", "Images"].map((header) => (
              <th className="border border-zinc-200 px-3 py-2" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profiles.map((item) => (
            <tr key={item.name}>
              <td className="border border-zinc-200 px-3 py-2 font-semibold">
                {item.label || speechPolicyProfileLabel(item.name)}
              </td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.mode}</td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.tableMode}</td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.codeMode}</td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.mathMode}</td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.footnoteMode}</td>
              <td className="border border-zinc-200 px-3 py-2">{item.settings.imageMode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PolicyModeSelect({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: string[];
  value: string;
  onChange: (value: string | undefined) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-zinc-700">
      <span>{label}</span>
      <select
        className="h-9 min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs outline-none focus:border-orange-400"
        onChange={(event) => {
          onChange(event.currentTarget.value || undefined);
        }}
        value={value}
      >
        <option value="">Profile default</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {formatPolicyModeLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function formatPolicyModeLabel(value: string): string {
  if (value === "rowLinear") {
    return "Row linear";
  }
  if (value === "syntaxAware") {
    return "Syntax aware";
  }
  if (value === "literalsafe") {
    return "Literal safe";
  }
  if (value === "altFirst") {
    return "Alt first";
  }
  if (value === "describeShort") {
    return "Describe short";
  }
  if (value === "describeLong") {
    return "Describe long";
  }
  if (value === "onDemand") {
    return "On demand";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function SourcePrepBlocksPanel({
  blockKindFilter,
  blockKinds,
  blockModeFilter,
  blockQuery,
  blocks,
  filteredBlocks,
  onKindFilterChange,
  onModeFilterChange,
  onQueryChange,
}: Readonly<{
  blockKindFilter: string;
  blockKinds: string[];
  blockModeFilter: string;
  blockQuery: string;
  blocks: PreparedSourceBlock[];
  filteredBlocks: PreparedSourceBlock[];
  onKindFilterChange: (value: string) => void;
  onModeFilterChange: (value: string) => void;
  onQueryChange: (value: string) => void;
}>) {
  return (
    <div>
      <div className="grid gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 md:grid-cols-[minmax(0,1fr)_11rem_11rem]">
        <input
          className="h-9 min-w-0 rounded-md border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-orange-400"
          onChange={(event) => {
            onQueryChange(event.currentTarget.value);
          }}
          placeholder="Search blocks and explanations"
          type="search"
          value={blockQuery}
        />
        <select
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-orange-400"
          onChange={(event) => {
            onKindFilterChange(event.currentTarget.value);
          }}
          value={blockKindFilter}
        >
          <option value="">All kinds</option>
          {blockKinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border border-zinc-200 bg-white px-2 text-sm outline-none focus:border-orange-400"
          onChange={(event) => {
            onModeFilterChange(event.currentTarget.value);
          }}
          value={blockModeFilter}
        >
          <option value="">All modes</option>
          <option value="speak">Speak</option>
          <option value="summarize">Summarize</option>
          <option value="skip">Skip</option>
        </select>
      </div>
      <div className="max-h-[28rem] overflow-y-auto">
        {filteredBlocks.map((block) => (
          <SourcePrepBlockRow block={block} key={block.id} />
        ))}
        {filteredBlocks.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No blocks match the filters.</p>
        ) : null}
        <p className="px-4 py-3 text-xs text-zinc-500">
          Showing {filteredBlocks.length.toString()} of {blocks.length.toString()} blocks
        </p>
      </div>
    </div>
  );
}

function SourcePrepBlockRow({ block }: Readonly<{ block: PreparedSourceBlock }>) {
  return (
    <div className="grid gap-2 border-b border-zinc-100 px-4 py-3 text-sm last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:items-start">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-zinc-500">
        {block.kind}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium" title={block.spokenText ?? block.text}>
          {block.spokenText ?? block.text ?? block.label}
        </span>
        <span className="mt-1 block truncate text-xs text-zinc-500">
          {String(block.segments?.length ?? 0)} segments ·{" "}
          {formatDuration(block.estimatedDurationMs ?? 0)}
        </span>
        <BlockSpeechBadges block={block} />
        {blockHasSpeechDifference(block) ? (
          <span className="mt-2 grid gap-1 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
            <span className="font-semibold text-blue-900">Spoken as</span>
            <span className="max-h-12 overflow-hidden break-words">
              {block.spokenText ?? block.label}
            </span>
          </span>
        ) : null}
        {block.speechPolicy.explanation ? (
          <span
            className="mt-1 block truncate text-xs text-blue-700"
            title={block.speechPolicy.explanation}
          >
            {block.speechPolicy.explanation}
          </span>
        ) : null}
        {block.warnings && block.warnings.length > 0 ? (
          <span className="mt-2 flex flex-wrap gap-1">
            {block.warnings.slice(0, 3).map((warning) => (
              <span
                className="rounded-full bg-amber-50 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-700"
                key={warning}
              >
                {warning}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      <span
        className={`w-fit rounded-full border px-2 py-1 text-[0.68rem] font-semibold sm:justify-self-end ${speakModeClass(block.speakMode)}`}
      >
        {block.speakMode}
      </span>
    </div>
  );
}

function BlockSpeechBadges({ block }: Readonly<{ block: PreparedSourceBlock }>) {
  return (
    <span className="mt-2 flex flex-wrap gap-1">
      <LanguageBadge block={block} />
      {block.normalisations && block.normalisations.length > 0 ? (
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[0.68rem] font-semibold text-violet-700">
          {block.normalisations.length.toLocaleString()} normalised
        </span>
      ) : null}
      {block.pronunciations && block.pronunciations.length > 0 ? (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[0.68rem] font-semibold text-blue-700">
          {block.pronunciations.length.toLocaleString()} pronunciations
        </span>
      ) : null}
    </span>
  );
}

function PreparedSourceMarkdownPreview({ source }: Readonly<{ source: PreparedSource | null }>) {
  if (!source) {
    return null;
  }
  if (source.renderMode !== "markdown" || !source.text) {
    return (
      <div className="p-4 text-sm text-zinc-600">
        <p>Rendered preview is unavailable for this source.</p>
      </div>
    );
  }
  return (
    <div className="max-h-[28rem] overflow-y-auto p-4">
      <MarkdownRenderer className="prose-markdown text-sm leading-6 text-zinc-800">
        {source.text}
      </MarkdownRenderer>
    </div>
  );
}

function SourcePrepMathPanel({ source }: Readonly<{ source: PreparedSource | null }>) {
  const mathBlocks = (source?.blocks ?? []).filter(
    (block) => block.kind === "math" || Boolean(block.mathPreview),
  );
  if (!source) {
    return null;
  }
  if (mathBlocks.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-600">
        <p>No maths blocks were detected in this source.</p>
      </div>
    );
  }
  return (
    <div className="grid max-h-[28rem] gap-3 overflow-y-auto p-4 text-sm">
      {mathBlocks.map((block) => (
        <article
          className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3"
          key={block.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {block.kind} · block {block.index.toLocaleString()}
            </p>
            <span
              className={`rounded-full border px-2 py-1 text-[0.68rem] font-semibold ${
                block.mathPreview?.source === "fallback"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {block.mathPreview?.source ?? "speech policy"}
            </span>
          </div>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-800">
            {block.text ?? block.label}
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            {block.mathPreview?.speech ?? block.spokenText ?? "No maths speech available"}
          </div>
          {block.mathPreview?.warnings && block.mathPreview.warnings.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {block.mathPreview.warnings.map((warning) => (
                <span
                  className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                  key={warning}
                >
                  {warning}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SourcePrepRulesPanel({ source }: Readonly<{ source: PreparedSource | null }>) {
  if (!source) {
    return null;
  }
  return (
    <div className="grid gap-4 p-4 text-sm">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <SourcePrepMetric label="Headings" value={String(source.summary.headingCount)} />
        <SourcePrepMetric label="Skipped Blocks" value={String(source.summary.skippedBlockCount)} />
        <SourcePrepMetric label="Notes" value={String(source.warnings?.length ?? 0)} />
      </dl>
      {source.warnings && source.warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {source.warnings.map((warning) => (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
              key={warning}
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
      {source.skippedItems && source.skippedItems.length > 0 ? (
        <div className="max-h-56 overflow-y-auto border-t border-zinc-200">
          {source.skippedItems.slice(0, 12).map((item) => (
            <div className="border-b border-zinc-100 py-3 last:border-b-0" key={item.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {item.kind}
              </p>
              <p className="mt-1 truncate font-medium text-zinc-900" title={item.reason}>
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isSupportedSourcePrepFile(file: File): boolean {
  if (isSupportedSourceTextFile(file)) {
    return true;
  }
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return isBookSourceExtension(extension);
}

function isBookSourceExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
    "docx",
    "html",
    "htm",
    "zip",
    "png",
    "jpg",
    "jpeg",
    "tif",
    "tiff",
    "bmp",
    "webp",
  ].includes(extension);
}

function isBookSourceURL(lowerURL: string): boolean {
  return [
    ".pdf",
    ".epub",
    ".docx",
    ".html",
    ".htm",
    ".zip",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".bmp",
    ".webp",
  ].some((extension) => lowerURL.endsWith(extension));
}

function formatSourceTextFileLabel(files: File[]): string {
  if (files.length === 1) {
    return `${files[0].name} · ${formatBytes(files[0].size)}`;
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  return `${files.length.toString()} files · ${formatBytes(totalBytes)}`;
}

function SourceMetadataStrip({ job, text }: Readonly<{ job: VoiceJob | null; text: string }>) {
  const totalSegments = job?.retries.totalSegments ?? job?.segments?.length ?? 0;
  const durationMs = job?.durationMs ?? text.length * 35;
  const contentType = job?.contentType ?? "48kHz - 24bit - WAV";

  return (
    <dl className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm md:grid-cols-4">
      <Metric label="Source Text" value={job?.inputText ? "restored job text" : "draft text"} />
      <Metric label="Total Segments" value={String(totalSegments)} />
      <Metric label="Total Duration (est.)" value={formatDuration(durationMs)} />
      <Metric label="Output Format" value={contentType} />
    </dl>
  );
}

function ResearchModulesSetupCard({
  cloningModuleId,
  error,
  hidden,
  modules,
  onClone,
  onHide,
}: Readonly<{
  cloningModuleId: string | null;
  error: string | null;
  hidden: boolean;
  modules: ResearchModuleDiagnostics[];
  onClone: (moduleId: string) => void;
  onHide: () => void;
}>) {
  const promptModules = modules.filter((module) => module.prompt && !module.installed);
  if (hidden || (promptModules.length === 0 && !error)) {
    return null;
  }
  return (
    <section className="border-t border-zinc-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Optional local research modules are available.</p>
          <p className="mt-1 break-words text-xs leading-5 text-amber-900">
            Clone upstreams into ignored .upstreams paths only when you want profile-specific embed
            artifacts. Current Kokoro Clone and Supertonic preset rendering stay available.
          </p>
          {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {promptModules.map((module) => (
            <button
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
              disabled={!module.cloneAllowed || cloningModuleId === module.id}
              key={module.id}
              onClick={() => {
                onClone(module.id);
              }}
              type="button"
            >
              {cloningModuleId === module.id ? "Cloning..." : `Clone ${module.label}`}
            </button>
          ))}
          <button
            className="rounded-md border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            onClick={onHide}
            type="button"
          >
            Hide
          </button>
        </div>
      </div>
    </section>
  );
}

function VoiceStudioPanel({
  buildingArtifactKey,
  error,
  job,
  profileSource,
  profileSourceDiagnostics,
  isLoading,
  isAnalyzingSource,
  optimizedText,
  profileCandidateCreateId,
  profiles,
  researchModules,
  runConfiguration,
  selectedKokoroVoiceId,
  selectedProfileId,
  studioPipelineHint,
  ttsEngines,
  onAnalyzeSource,
  onBuildArtifact,
  onClearSelection,
  onCreateProfileFromCandidate,
  onDeleteProfile,
  onRunConfigurationChange,
  onSelectKokoroVoice,
  onSelectProfile,
}: Readonly<{
  buildingArtifactKey: string | null;
  error: string | null;
  job: VoiceJob | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  isLoading: boolean;
  isAnalyzingSource: boolean;
  optimizedText: string;
  profileCandidateCreateId: string | null;
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedKokoroVoiceId: string;
  selectedProfileId: string;
  studioPipelineHint: string;
  ttsEngines: TTSEngineDiagnostics[];
  onAnalyzeSource: (file: File) => Promise<void>;
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
  onClearSelection: () => void;
  onCreateProfileFromCandidate: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onDeleteProfile: (id: string) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSelectKokoroVoice: (voiceId: string) => void;
  onSelectProfile: (id: string) => void;
}>) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);

  return (
    <section className="min-h-full min-w-0 overflow-y-auto">
      <div className="grid min-w-0 gap-5 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Voice Studio
          </p>
          <p className="mt-2 break-words text-xs leading-5 text-zinc-500">{studioPipelineHint}</p>
        </div>

        <VoiceProfileDropdown
          buildingArtifactKey={buildingArtifactKey}
          isLoading={isLoading}
          profiles={profiles}
          researchModules={researchModules}
          runConfiguration={runConfiguration}
          selectedKokoroVoiceId={selectedKokoroVoiceId}
          selectedProfile={selectedProfile ?? null}
          selectedProfileId={selectedProfileId}
          ttsEngines={ttsEngines}
          onBuildArtifact={onBuildArtifact}
          onClearSelection={onClearSelection}
          onDeleteProfile={onDeleteProfile}
          onRunConfigurationChange={onRunConfigurationChange}
          onSelectKokoroVoice={onSelectKokoroVoice}
          onSelectProfile={onSelectProfile}
        />

        <ScriptReviewPanel job={job} optimizedText={optimizedText} />

        <VoiceSourceAnalysisPanel
          createCandidateId={profileCandidateCreateId}
          diagnostics={profileSourceDiagnostics}
          error={error}
          isAnalyzing={isAnalyzingSource}
          researchModules={researchModules}
          source={profileSource}
          ttsEngines={ttsEngines}
          onAnalyze={onAnalyzeSource}
          onCreateProfile={onCreateProfileFromCandidate}
        />
      </div>
    </section>
  );
}

function VoiceProfileDropdown({
  buildingArtifactKey,
  isLoading,
  profiles,
  researchModules,
  runConfiguration,
  selectedKokoroVoiceId,
  selectedProfile,
  selectedProfileId,
  ttsEngines,
  onBuildArtifact,
  onClearSelection,
  onDeleteProfile,
  onRunConfigurationChange,
  onSelectKokoroVoice,
  onSelectProfile,
}: Readonly<{
  buildingArtifactKey: string | null;
  isLoading: boolean;
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedKokoroVoiceId: string;
  selectedProfile: VoiceProfile | null;
  selectedProfileId: string;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
  onClearSelection: () => void;
  onDeleteProfile: (id: string) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSelectKokoroVoice: (voiceId: string) => void;
  onSelectProfile: (id: string) => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
  const selectedEngine = findVoicePanelEngine(ttsEngines, runConfiguration.ttsEngine);
  const selectedEngineBlocked =
    selectedProfile && runConfiguration.options.voiceClone
      ? isEngineUnavailableForSelectedProfile(selectedEngine, selectedProfile, runConfiguration)
      : false;
  const supertonicVoices = selectedEngine?.voices ?? voicePanelSupertonicVoices();
  const supertonicLanguages = voicePanelSupertonicLanguages(selectedEngine);
  const activeName = selectedProfile?.name ?? "Default Voice";
  const likenessBadge = selectedProfile ? formatLikenessLabel(selectedProfile) : "Provider voice";
  const activeDetail = selectedProfile
    ? `${selectedProfile.language} · ${formatDuration(
        selectedProfile.referenceDurationMs ?? selectedProfile.durationMs,
      )} reference · ${likenessBadge}`
    : "Kokoro voicepacks · ready";
  let kokoroDetailSuffix = "";
  if (runConfiguration.ttsEngine === "supertonic-3") {
    kokoroDetailSuffix = " · kept for Auto/Kokoro runs";
  } else if (selectedProfile) {
    kokoroDetailSuffix = " · used when the cloned profile is off";
  }
  const updateEngine = (engineId: string) => {
    const engine = findVoicePanelEngine(ttsEngines, engineId);
    onRunConfigurationChange({
      ...runConfiguration,
      ttsEngine: engineId,
      engineOptions:
        engineId === "supertonic-3"
          ? {
              ...runConfiguration.engineOptions,
              voiceStyle:
                runConfiguration.engineOptions.voiceStyle ?? engine?.voices?.[0]?.id ?? "M1",
              lang: runConfiguration.engineOptions.lang ?? "na",
            }
          : {},
    });
  };
  const updateEngineOption = (key: string, value: string) => {
    onRunConfigurationChange({
      ...runConfiguration,
      engineOptions: {
        ...runConfiguration.engineOptions,
        [key]: value,
      },
    });
  };

  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-950">Voice Profile</h2>
        <span className="shrink-0 text-xs text-zinc-500">{String(profiles.length + 1)} voices</span>
      </div>
      <div className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <button
          className="flex w-full min-w-0 items-center gap-3 text-left"
          onClick={() => {
            setIsOpen((current) => !current);
          }}
          type="button"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-100 text-base font-semibold text-zinc-700">
            {activeName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-950" title={activeName}>
              {activeName}
            </p>
            <p className="mt-1 truncate text-xs text-zinc-500" title={activeDetail}>
              {activeDetail}
            </p>
          </div>
          <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            Ready
          </span>
          <span className="shrink-0 text-zinc-500">{isOpen ? "▴" : "▾"}</span>
        </button>
        {selectedProfile ? (
          <div className="mt-3 grid gap-2">
            <p className="truncate text-xs text-zinc-500" title={selectedProfile.sourceFile}>
              {selectedProfile.referenceTrimmed
                ? "Trimmed clone reference"
                : "Full clone reference"}{" "}
              · {formatBytes(selectedProfile.sourceBytes)}
            </p>
            <VoiceProfileArtifactControls
              buildingArtifactKey={buildingArtifactKey}
              modules={researchModules}
              profile={selectedProfile}
              onBuildArtifact={onBuildArtifact}
            />
          </div>
        ) : null}
      </div>
      <section className="grid min-w-0 gap-2 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
        <label className="grid min-w-0 gap-1">
          <span className="font-semibold text-zinc-800">Narration backend</span>
          <select
            className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-900"
            value={runConfiguration.ttsEngine}
            onChange={(event) => {
              updateEngine(event.currentTarget.value);
            }}
          >
            {voicePanelEngineOptions(ttsEngines).map((engine) => (
              <option
                disabled={isEngineUnavailableForSelectedProfile(
                  engine,
                  selectedProfile,
                  runConfiguration,
                )}
                key={engine.id}
                value={engine.id}
              >
                {engine.label} · {engine.status}
              </option>
            ))}
          </select>
          {selectedEngineBlocked ? (
            <span className="break-words text-xs leading-5 text-amber-700">
              {voiceProfileTargetReadinessText(selectedProfile, runConfiguration.ttsEngine)}
            </span>
          ) : null}
        </label>
        {runConfiguration.ttsEngine === "supertonic-3" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1">
              <span className="font-semibold text-zinc-800">Supertonic voice</span>
              <select
                className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-900"
                value={runConfiguration.engineOptions.voiceStyle ?? "M1"}
                onChange={(event) => {
                  updateEngineOption("voiceStyle", event.currentTarget.value);
                }}
              >
                {supertonicVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} {voice.gender ? `· ${voice.gender}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid min-w-0 gap-1">
              <span className="font-semibold text-zinc-800">Language</span>
              <select
                className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-900"
                value={runConfiguration.engineOptions.lang ?? "na"}
                onChange={(event) => {
                  updateEngineOption("lang", event.currentTarget.value);
                }}
              >
                {supertonicLanguages.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.label} · {language.code}
                  </option>
                ))}
              </select>
            </label>
            <span
              className="min-w-0 truncate text-zinc-500 sm:col-span-2"
              title={voicePanelSupertonicSummary(runConfiguration, selectedEngine)}
            >
              {voicePanelSupertonicSummary(runConfiguration, selectedEngine)}
            </span>
          </div>
        ) : (
          <span>Switch to Supertonic 3 here to choose M/F styles and language.</span>
        )}
      </section>
      <label className="grid min-w-0 gap-1 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
        <span className="font-semibold text-zinc-800">
          {runConfiguration.ttsEngine === "supertonic-3"
            ? "Kokoro fallback voicepack"
            : "Kokoro voicepack"}
        </span>
        <select
          className="min-w-0 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-sm font-medium text-zinc-900"
          value={selectedKokoroVoice?.id ?? DEFAULT_KOKORO_VOICE_ID}
          onChange={(event) => {
            onSelectKokoroVoice(event.currentTarget.value);
          }}
        >
          {KOKORO_VOICEPACKS.map((voicepack) => (
            <option key={voicepack.id} value={voicepack.id}>
              {voicepack.name} · {voicepack.locale} · {voicepack.id}
            </option>
          ))}
        </select>
        <span className="truncate" title={kokoroVoicepackDetail(selectedKokoroVoice?.id)}>
          {kokoroVoicepackDetail(selectedKokoroVoice?.id)}
          {kokoroDetailSuffix}
        </span>
      </label>
      {isLoading ? <p className="text-sm text-zinc-600">Loading profiles...</p> : null}
      {isOpen ? (
        <ul className="max-h-80 min-w-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <VoiceProfileOption
            detail="Kokoro voicepacks · non-cloned · ready"
            isActive={selectedProfileId === ""}
            name="Default Voice"
            onSelect={onClearSelection}
          />
          {profiles.map((profile) => (
            <VoiceProfileOption
              artifactSummary={
                <ProfileOptionArtifactStrip modules={researchModules} profile={profile} />
              }
              detail={`${profile.status} · ${profile.language} · ${formatDuration(profile.referenceDurationMs ?? profile.durationMs)}`}
              isActive={profile.id === selectedProfileId}
              key={profile.id}
              likeness={profile.likeness}
              name={profile.name}
              score={profile.referenceScore}
              onDelete={() => {
                onDeleteProfile(profile.id);
              }}
              onSelect={() => {
                onSelectProfile(profile.id);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function VoiceProfileArtifactControls({
  buildingArtifactKey,
  modules,
  profile,
  onBuildArtifact,
}: Readonly<{
  buildingArtifactKey: string | null;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile;
  onBuildArtifact: (profileId: string, moduleId: string) => Promise<void>;
}>) {
  return (
    <div className="grid gap-2 rounded-md border border-zinc-200 bg-white p-2">
      <div className="flex flex-wrap gap-1">
        <ArtifactChip profile={profile} moduleId="kokoro-clone" label="KokoClone" />
        {PROFILE_ARTIFACT_MODULE_ORDER.map((moduleId) => {
          const module = modules.find((item) => item.id === moduleId);
          return (
            <ArtifactChip
              key={moduleId}
              label={moduleLabel(moduleId)}
              module={module}
              moduleId={moduleId}
              profile={profile}
            />
          );
        })}
      </div>
      <div className="grid gap-2">
        {["kokoro-clone", ...PROFILE_ARTIFACT_MODULE_ORDER].map((moduleId) => {
          const module = modules.find((item) => item.id === moduleId);
          const target = profile.cloneTargets?.[moduleId];
          const isBusy =
            buildingArtifactKey === `${profile.id}:${moduleId}` ||
            target?.status === "queued" ||
            target?.status === "building" ||
            target?.status === "validating" ||
            profile.cloneArtifacts?.[moduleId]?.status === "building";
          const isInstalled = moduleId === "kokoro-clone" || (module?.installed ?? false);
          const buttonLabel = targetBuildButtonLabel({
            isBusy,
            isInstalled,
            moduleId,
            ready: target?.status === "ready",
          });
          return (
            <button
              className="rounded-md border border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
              disabled={!isInstalled || isBusy}
              key={moduleId}
              onClick={() => {
                void onBuildArtifact(profile.id, moduleId);
              }}
              type="button"
            >
              {buttonLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ProfileOptionArtifactStrip({
  modules,
  profile,
}: Readonly<{
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile;
}>) {
  return (
    <span className="mt-2 flex min-w-0 flex-wrap gap-1">
      <ArtifactChip profile={profile} moduleId="kokoro-clone" label="KokoClone" />
      {PROFILE_ARTIFACT_MODULE_ORDER.map((moduleId) => {
        const module = modules.find((item) => item.id === moduleId);
        return (
          <ArtifactChip
            key={moduleId}
            label={compactModuleLabel(moduleId)}
            module={module}
            moduleId={moduleId}
            profile={profile}
          />
        );
      })}
    </span>
  );
}

function ArtifactChip({
  label,
  module,
  moduleId,
  profile,
}: Readonly<{
  label: string;
  module?: ResearchModuleDiagnostics;
  moduleId: string;
  profile: VoiceProfile;
}>) {
  const artifact = profile.cloneArtifacts?.[moduleId];
  const target = profile.cloneTargets?.[moduleId];
  const status = artifactChipStatus(
    moduleId,
    target?.status,
    artifact?.status,
    module?.installed ?? false,
  );
  const ready = status === "ready";
  const failed = status === "failed";
  const className = artifactChipClass(ready, failed);
  const score = target?.validation?.score;
  const displayStatus =
    ready && typeof score === "number" && Number.isFinite(score)
      ? String(Math.round(score * 100))
      : status;
  return (
    <span
      className={`rounded-full border px-2 py-1 text-[0.65rem] font-semibold ${className}`}
      title={
        target?.validation?.error ?? target?.error ?? artifact?.error ?? module?.reason ?? status
      }
    >
      {label} {displayStatus}
    </span>
  );
}

function moduleLabel(moduleId: string): string {
  switch (moduleId) {
    case "kokoro-clone": {
      return "Kokoro Clone";
    }
    case "kokoro-embed": {
      return "Kokoro Embed";
    }
    case "supertonic-embed": {
      return "Supertonic Embed";
    }
    default: {
      return moduleId;
    }
  }
}

function compactModuleLabel(moduleId: string): string {
  switch (moduleId) {
    case "kokoro-clone": {
      return "KokoClone";
    }
    case "kokoro-embed": {
      return "K-Embed";
    }
    case "supertonic-embed": {
      return "S-Embed";
    }
    default: {
      return moduleId;
    }
  }
}

function targetBuildButtonLabel({
  isBusy,
  isInstalled,
  moduleId,
  ready,
}: Readonly<{
  isBusy: boolean;
  isInstalled: boolean;
  moduleId: string;
  ready?: boolean;
}>): string {
  const label = moduleLabel(moduleId);
  if (isBusy) {
    return `Preparing ${label}...`;
  }
  if (ready) {
    return `Re-validate ${label}`;
  }
  if (isInstalled) {
    return `Prepare ${label}`;
  }
  return `${label} setup needed`;
}

function artifactChipStatus(
  moduleId: string,
  targetStatus: string | undefined,
  artifactStatus: string | undefined,
  moduleInstalled: boolean,
): string {
  if (targetStatus) {
    return targetStatus;
  }
  if (moduleId === "kokoro-clone") {
    return "ready";
  }
  if (artifactStatus) {
    return artifactStatus;
  }
  return moduleInstalled ? "not built" : "setup needed";
}

function artifactChipClass(ready: boolean, failed: boolean): string {
  if (ready) {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (failed) {
    return "border-red-300 bg-red-50 text-red-700";
  }
  return "border-amber-300 bg-amber-50 text-amber-800";
}

function voicePanelEngineOptions(engines: TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  if (engines.length > 0) {
    return engines;
  }
  return [
    {
      default: true,
      experimental: false,
      id: "auto",
      label: "Auto",
      local: true,
      status: "ready",
      supportsReference: true,
      supportsSSML: false,
      supportsSwedish: false,
      supportsVoice: true,
    },
    {
      default: false,
      experimental: false,
      id: "supertonic-3",
      label: "Supertonic 3",
      local: true,
      status: "ready",
      supportsReference: false,
      supportsSSML: false,
      supportsSwedish: true,
      supportsVoice: true,
    },
  ];
}

function findVoicePanelEngine(
  engines: TTSEngineDiagnostics[],
  engineId: string,
): TTSEngineDiagnostics | undefined {
  return voicePanelEngineOptions(engines).find((engine) => engine.id === engineId);
}

function isEngineUnavailableForSelectedProfile(
  engine: TTSEngineDiagnostics | undefined,
  profile: VoiceProfile | null,
  runConfiguration: RunConfiguration,
): boolean {
  if (engine?.status !== "ready") {
    return true;
  }
  if (!profile || !runConfiguration.options.voiceClone) {
    return false;
  }
  return !isVoiceProfileTargetReadyForEngine(profile, engine.id);
}

function voicePanelSupertonicVoices(): { id: string; name: string; gender?: string }[] {
  return SUPERTONIC_VOICE_STYLES.map((id) => ({
    gender: id.startsWith("M") ? "male" : "female",
    id,
    name: id,
  }));
}

function voicePanelSupertonicLanguages(engine: TTSEngineDiagnostics | undefined) {
  const supportedCodes =
    engine?.languages && engine.languages.length > 0
      ? engine.languages
      : SUPERTONIC_LANGUAGE_OPTIONS.map((language) => language.code);
  const supported = new Set(supportedCodes);
  return SUPERTONIC_LANGUAGE_OPTIONS.filter((language) => supported.has(language.code));
}

function voicePanelSupertonicSummary(
  runConfiguration: RunConfiguration,
  engine: TTSEngineDiagnostics | undefined,
): string {
  const voice = runConfiguration.engineOptions.voiceStyle ?? "M1";
  const language = runConfiguration.engineOptions.lang ?? "na";
  return `${voice} · ${supertonicLanguageLabel(language)} · ${language} · ${
    engine?.supportsSSML ? "SSML" : "plain text fallback"
  }`;
}

function VoiceProfileOption({
  artifactSummary,
  detail,
  isActive,
  likeness,
  name,
  score,
  onDelete,
  onSelect,
}: Readonly<{
  artifactSummary?: ReactNode;
  detail: string;
  isActive: boolean;
  likeness?: VoiceProfile["likeness"];
  name: string;
  score?: number;
  onDelete?: () => void;
  onSelect: () => void;
}>) {
  return (
    <li className={`border-b border-zinc-200 last:border-b-0 ${isActive ? "bg-orange-50" : ""}`}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
        <button className="min-w-0 text-left" onClick={onSelect} type="button">
          <span className="block truncate text-sm font-semibold text-zinc-950" title={name}>
            {name}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-500" title={detail}>
            {detail}
          </span>
          {artifactSummary}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {likeness ? (
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${likenessBadgeClass(likeness)}`}
              title={likeness.reason}
            >
              {formatLikenessBadge(likeness)}
            </span>
          ) : null}
          {score ? (
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
              {formatSimilarity(score)}
            </span>
          ) : null}
          <button
            className="h-8 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
            disabled={isActive}
            onClick={onSelect}
            type="button"
          >
            {isActive ? "Active" : "Use"}
          </button>
          {onDelete ? (
            <button
              className="h-8 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
              onClick={onDelete}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function ScriptReviewPanel({
  job,
  optimizedText,
}: Readonly<{
  job: VoiceJob | null;
  optimizedText: string;
}>) {
  const validationReason =
    job?.voiceCheck.reason ??
    (job?.pipelineOptions?.asrCheck === false
      ? "Validation was disabled for this run."
      : "Validation appears after synthesis.");
  const validationTranscript = job?.voiceCheck.transcript ?? "";

  return (
    <section className="grid min-w-0 gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-950">Script Review</h2>
        <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
          {optimizedText ? "Optimized" : "Waiting"}
        </span>
      </div>
      <p className="max-h-48 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm leading-6 text-zinc-700">
        {optimizedText || "Submit text to see spoken-form output from the optimization agent."}
      </p>
      <details className="rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
        <summary className="cursor-pointer font-semibold text-zinc-800">Validation</summary>
        <p className="mt-2 break-words leading-5">{validationReason}</p>
        {validationTranscript ? (
          <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded bg-zinc-50 p-2 leading-5 text-zinc-500">
            {validationTranscript}
          </p>
        ) : null}
      </details>
    </section>
  );
}

function AudioPanel({
  job,
  latestProgress,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onResumeProgress,
}: Readonly<{
  job: VoiceJob | null;
  latestProgress: PlaybackProgress | null;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  useEffect(() => {
    if (!job) {
      onPlaybackControlsChange?.(null);
      onPlaybackStateChange?.(false);
    }
  }, [job, onPlaybackControlsChange, onPlaybackStateChange]);

  if (!job) {
    return (
      <section className="min-w-0 rounded-lg border p-3 shadow-sm vs-raised">
        <h2 className="text-sm font-semibold">Audio Player</h2>
        <div className="mt-3 grid min-h-32 place-items-center rounded-md border border-dashed px-4 py-5 text-center vs-border">
          <div>
            <p className="text-sm font-semibold">No audio generated yet</p>
            <p className="vs-muted mt-2 text-xs">
              Choose a run mode, then create audio to start buffering playback.
            </p>
            {latestProgress ? (
              <button
                className="mt-4 inline-flex h-9 items-center rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/15"
                onClick={() => {
                  onResumeProgress(latestProgress);
                }}
                type="button"
              >
                Continue Listening · {formatPercentage(latestProgress.progress)}
              </button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <StreamingAudioPanel
      job={job}
      key={job.id}
      latestProgress={latestProgress}
      onPlaybackCursorChange={onPlaybackCursorChange}
      onPlaybackControlsChange={onPlaybackControlsChange}
      onPlaybackStateChange={onPlaybackStateChange}
      onResumeProgress={onResumeProgress}
    />
  );
}

function StreamingAudioPanel({
  job,
  latestProgress,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onResumeProgress,
}: Readonly<{
  job: VoiceJob;
  latestProgress: PlaybackProgress | null;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const canPlayCompleted = job.status === "completed";
  const canPlayArrival = job.status !== "failed";
  const [playMode, setPlayMode] = useState<AudioPlaybackMode>(() =>
    job.status === "completed" ? "completed" : "arrival",
  );
  const [isStreamingPlaying, setIsStreamingPlaying] = useState(false);
  const [panelCursorSec, setPanelCursorSec] = useState(0);

  const isModeAvailable: Record<AudioPlaybackMode, boolean> = {
    arrival: true,
    completed: canPlayCompleted,
  };
  const isPlaybackLocked = isStreamingPlaying;

  const isModeDisabled = useCallback(
    (mode: AudioPlaybackMode) => isPlaybackLocked && playMode !== mode,
    [isPlaybackLocked, playMode],
  );

  const modeButtonClass = useCallback(
    (mode: AudioPlaybackMode, isAvailable: boolean) => {
      if (playMode === mode) {
        return "inline-flex h-7 min-w-[3.9rem] items-center justify-center rounded border border-orange-500 bg-orange-500/10 px-2 text-xs font-semibold text-orange-600";
      }

      if (!isAvailable) {
        return "inline-flex h-7 min-w-[3.9rem] items-center justify-center rounded border border-transparent px-2 text-xs font-semibold opacity-40";
      }

      return "vs-muted inline-flex h-7 min-w-[3.9rem] items-center justify-center rounded border border-transparent px-2 text-xs font-semibold transition hover:bg-[var(--vs-raised)]";
    },
    [playMode],
  );

  const isArrivalMode = playMode === "arrival";
  const isCompletedMode = playMode === "completed";

  const playModeLabel: Record<AudioPlaybackMode, string> = {
    arrival: "Arrival",
    completed: "Completed",
  };

  const handlePlaybackStateChange = useCallback(
    (isPlaying: boolean) => {
      setIsStreamingPlaying(isPlaying);
      onPlaybackStateChange?.(isPlaying);
    },
    [onPlaybackStateChange],
  );
  const handlePlaybackCursorChange = useCallback(
    (cursorSec: number) => {
      setPanelCursorSec(cursorSec);
      onPlaybackCursorChange?.(cursorSec);
    },
    [onPlaybackCursorChange],
  );

  useEffect(() => {
    return () => {
      onPlaybackControlsChange?.(null);
      onPlaybackStateChange?.(false);
    };
  }, [onPlaybackControlsChange, onPlaybackStateChange]);

  useEffect(() => {
    if (job.status === "completed" && !isStreamingPlaying) {
      setPlayMode("completed");
    }
  }, [isStreamingPlaying, job.status]);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border p-3 shadow-sm vs-raised">
      <div className="grid gap-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Audio Player</h2>
            <p className="vs-muted mt-1 truncate text-xs">
              {job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"} ·{" "}
              {formatDuration(job.durationMs)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-orange-300 bg-orange-500/10 px-2 py-0.5 text-[0.68rem] font-semibold text-orange-600">
            {job.status}
          </span>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p className="vs-muted min-w-0 truncate text-xs">
            {playModeLabel[playMode]} mode · {String(readySegments)} segment
            {readySegments === 1 ? "" : "s"} ready
          </p>
          <div className="inline-flex shrink-0 overflow-hidden rounded-md border p-0.5 vs-border">
            {(["arrival", "completed"] as const).map((mode) => {
              const isAvailable = isModeAvailable[mode];
              return (
                <button
                  className={modeButtonClass(mode, isAvailable)}
                  disabled={isModeDisabled(mode)}
                  key={mode}
                  onClick={() => {
                    setPlayMode(mode);
                  }}
                  type="button"
                >
                  {playModeLabel[mode]}
                </button>
              );
            })}
          </div>
        </div>
        {latestProgress ? (
          <AudioResumeAction progress={latestProgress} onResumeProgress={onResumeProgress} />
        ) : null}
      </div>

      <div className="mt-3">
        {isCompletedMode ? (
          <CompletedAudioPlayer
            key={`completed-${job.id}`}
            job={job}
            src={canPlayCompleted ? audioSource(job) : ""}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={handlePlaybackCursorChange}
          />
        ) : null}
        {isArrivalMode ? (
          <ArrivalAudioPlayer
            key={`arrival-${job.id}`}
            job={job}
            canPlay={canPlayArrival}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={handlePlaybackCursorChange}
          />
        ) : null}
      </div>
      <QueueBufferPanel currentTimeSec={panelCursorSec} job={job} />
    </section>
  );
}

function AudioResumeAction({
  progress,
  onResumeProgress,
}: Readonly<{
  progress: PlaybackProgress;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  return (
    <button
      className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-orange-500/10 px-3 py-2 text-left text-xs text-orange-700 transition hover:bg-orange-500/15"
      onClick={() => {
        onResumeProgress(progress);
      }}
      type="button"
    >
      <span className="min-w-0">
        <span className="block font-semibold">Continue Listening</span>
        <span className="block truncate">
          {resumeProgressLabel(progress)} ·{" "}
          {formatDuration(Math.round(progress.currentTimeSec * 1000))}
        </span>
      </span>
      <span className="shrink-0 font-semibold">{formatPercentage(progress.progress)}</span>
    </button>
  );
}

function resumeProgressLabel(progress: PlaybackProgress): string {
  if (progress.bookScope?.label) {
    return progress.bookScope.label;
  }
  if (progress.bookSourceId) {
    return "Book source";
  }
  if (progress.preparedSourceId) {
    return "Prepared source";
  }
  return progress.jobId ? "Previous job" : "Saved progress";
}

function queueBlockClass(
  segmentIndex: number,
  ready: number,
  generating: number,
  playing: number,
): string {
  if (segmentIndex === playing) {
    return "bg-orange-600 ring-2 ring-orange-200";
  }
  if (segmentIndex <= ready) {
    return "bg-orange-400";
  }
  if (segmentIndex === generating) {
    return "bg-[var(--vs-generating)]";
  }
  return "bg-[var(--vs-border)]";
}

function queueBlockSegmentIndex(
  blockIndex: number,
  visibleBlocks: number,
  totalSegments: number,
): number {
  if (totalSegments <= visibleBlocks) {
    return blockIndex + 1;
  }
  return Math.max(1, Math.ceil(((blockIndex + 1) / visibleBlocks) * totalSegments));
}

function QueueBufferPanel({
  currentTimeSec,
  job,
}: Readonly<{ currentTimeSec: number; job: VoiceJob }>) {
  const total = Math.max(
    job.retries.totalSegments,
    job.segments?.length ?? 0,
    job.audioReadySegments ?? 0,
    1,
  );
  const ready = Math.max(0, job.audioReadySegments ?? 0);
  const generating =
    job.status === "completed" ? 0 : Math.max(ready + 1, job.progress.currentSegment ?? 0);
  const playing = resolvePlayingSegmentIndex(job, currentTimeSec);
  const visibleBlocks = Math.min(24, Math.max(1, total));

  return (
    <section className="mt-3 border-t pt-3 vs-border">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Queue</h3>
        <p className="text-xs font-semibold text-orange-600">
          {String(ready)} / {String(total)} ready
        </p>
      </div>
      <div
        className="mt-3 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${String(visibleBlocks)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: visibleBlocks }).map((_, index) => {
          const segmentIndex = queueBlockSegmentIndex(index, visibleBlocks, total);
          const blockClass = queueBlockClass(segmentIndex, ready, generating, playing);
          return (
            <span
              aria-hidden="true"
              className={`h-3.5 rounded ${blockClass}`}
              key={`queue-${String(index)}`}
              title={`Segment ${String(segmentIndex)}`}
            />
          );
        })}
      </div>
      <div className="vs-muted mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-600" />
          Playing
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />
          Buffered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--vs-generating)]" />
          Generating
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--vs-border)]" />
          Pending
        </span>
      </div>
    </section>
  );
}

function resolvePlayingSegmentIndex(job: VoiceJob, currentTimeSec: number): number {
  if (currentTimeSec <= 0) {
    return job.status === "completed" ? 0 : Math.max(1, job.progress.currentSegment ?? 0);
  }
  const durations = job.audioSegmentDurationsMs ?? [];
  if (durations.length === 0) {
    return Math.max(1, job.progress.currentSegment ?? 0);
  }
  let cursorMs = currentTimeSec * 1000;
  for (const [index, durationMs] of durations.entries()) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      continue;
    }
    if (cursorMs <= durationMs) {
      return index + 1;
    }
    cursorMs -= durationMs;
  }
  return Math.min(durations.length, Math.max(1, job.audioReadySegments ?? 1));
}

function WaveformDisplay({
  bars,
  progress,
}: Readonly<{
  bars: number[];
  progress: number;
}>) {
  const displayBars = bars.length > 0 ? bars : Array.from({ length: 76 }, () => 0);
  const activeIndex = waveformProgressIndex(progress, displayBars.length);

  return (
    <div
      className="grid h-10 min-w-0 items-center gap-px rounded-md bg-[var(--vs-surface)] py-1"
      style={{ gridTemplateColumns: `repeat(${String(displayBars.length)}, minmax(0, 1fr))` }}
    >
      {displayBars.map((height, index) => (
        <span
          aria-hidden="true"
          className={`w-full rounded-full ${index < activeIndex ? "bg-orange-500" : "bg-[var(--vs-border)]"}`}
          data-waveform-bar={index}
          data-waveform-value={height.toFixed(4)}
          key={`waveform-${String(index)}`}
          style={{ height: `${Math.round(4 + height * 29).toString()}px` }}
        />
      ))}
    </div>
  );
}

function TransportButton({
  children,
  label,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full text-sm hover:bg-[var(--vs-surface)]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function PlayerStatusLine({
  currentTimeSec,
  durationSec,
  isLive,
  segment,
}: Readonly<{
  currentTimeSec: number;
  durationSec: number;
  isLive: boolean;
  segment: string;
}>) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden text-xs">
      <span className="inline-flex min-w-0 items-center gap-2 font-medium text-orange-600">
        <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
        {isLive ? "Playing (live)" : "Ready"}
      </span>
      <span className="vs-muted">
        {formatDuration(Math.round(currentTimeSec * 1000))} /{" "}
        {formatDuration(Math.round(durationSec * 1000))}
      </span>
      <span className="vs-muted col-span-2 truncate" title={segment}>
        {segment}
      </span>
    </div>
  );
}

function useCompletedWaveformBars(src: string, canPlayCompleted: boolean) {
  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  useEffect(() => {
    if (!canPlayCompleted || !src) {
      setWaveformBars([]);
      return;
    }

    const controller = new AbortController();
    const context = new AudioContext();
    const analyze = async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const rawAudio = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(rawAudio);
        if (!controller.signal.aborted) {
          setWaveformBars(buildWaveformBarsFromAudioBuffers([decoded], 76));
        }
      } catch {
        if (!controller.signal.aborted) {
          setWaveformBars([]);
        }
      } finally {
        void context.close().catch(() => null);
      }
    };

    void analyze();
    return () => {
      controller.abort();
      void context.close().catch(() => null);
    };
  }, [canPlayCompleted, src]);

  return waveformBars;
}

function resetUnavailableCompletedAudio({
  audioRef,
  isSeekCommitInProgressRef,
  isSeekingRef,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  const audio = audioRef.current;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  setError(null);
  setIsPlaying(false);
  setCurrentTimeSec(0);
  setDurationSec(0);
  isSeekingRef.current = false;
  isSeekCommitInProgressRef.current = false;
}

function useCompletedAudioAvailabilityReset({
  audioRef,
  canPlayCompleted,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackStateChange,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  useEffect(() => {
    if (!canPlayCompleted) {
      resetUnavailableCompletedAudio({
        audioRef,
        isSeekCommitInProgressRef,
        isSeekingRef,
        setCurrentTimeSec,
        setDurationSec,
        setError,
        setIsPlaying,
      });
    }
    onPlaybackStateChange?.(false);
  }, [
    audioRef,
    canPlayCompleted,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackStateChange,
    setCurrentTimeSec,
    setDurationSec,
    setError,
    setIsPlaying,
  ]);
}

function useCompletedSeekControls({
  audioRef,
  currentTimeRef,
  durationMs,
  durationSec,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackCursorChange,
  seekSliderValueRef,
  setCurrentTimeSec,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeRef: WritableRef<number>;
  durationMs: number;
  durationSec: number;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  seekSliderValueRef: WritableRef<number>;
  setCurrentTimeSec: (value: number) => void;
}) {
  const handleSeekStart = useCallback(() => {
    isSeekingRef.current = true;
    seekSliderValueRef.current = currentTimeRef.current;
  }, [currentTimeRef, isSeekingRef, seekSliderValueRef]);

  const clampSeekTarget = useCallback(
    (target: number) => {
      const fallbackDurationSec = durationMs > 0 ? durationMs / 1000 : 0;
      const safeDuration = durationSec > 0 ? durationSec : fallbackDurationSec;
      return safeDuration > 0 ? Math.max(0, Math.min(target, safeDuration)) : Math.max(0, target);
    },
    [durationMs, durationSec],
  );

  const commitSeek = useCallback(
    (target: number) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const safeTarget = clampSeekTarget(target);
      currentTimeRef.current = safeTarget;
      setCurrentTimeSec(safeTarget);
      onPlaybackCursorChange?.(safeTarget);
      audio.currentTime = safeTarget;
    },
    [audioRef, clampSeekTarget, currentTimeRef, onPlaybackCursorChange, setCurrentTimeSec],
  );

  const resolveSeekTarget = useCallback(
    (value?: number) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return clampSeekTarget(value);
      }
      return clampSeekTarget(seekSliderValueRef.current);
    },
    [clampSeekTarget, seekSliderValueRef],
  );

  const handleSeekCommit = useCallback(
    (value?: number) => {
      if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
        isSeekingRef.current = true;
        seekSliderValueRef.current = currentTimeRef.current;
      }

      if (!isSeekingRef.current || isSeekCommitInProgressRef.current) {
        return;
      }
      isSeekCommitInProgressRef.current = true;
      const next = resolveSeekTarget(value);
      currentTimeRef.current = next;
      seekSliderValueRef.current = next;
      setCurrentTimeSec(next);
      commitSeek(next);
      requestAnimationFrame(() => {
        isSeekingRef.current = false;
        isSeekCommitInProgressRef.current = false;
      });
    },
    [
      commitSeek,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      resolveSeekTarget,
      seekSliderValueRef,
      setCurrentTimeSec,
    ],
  );

  const handleSeekUpdate = useCallback(
    (rawValue: number) => {
      if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
        isSeekingRef.current = true;
        seekSliderValueRef.current = currentTimeRef.current;
      }

      if (!isSeekingRef.current) {
        return;
      }

      const target = clampSeekTarget(
        Number.isFinite(rawValue) ? rawValue : seekSliderValueRef.current,
      );
      seekSliderValueRef.current = target;
      currentTimeRef.current = target;
      setCurrentTimeSec(target);
      onPlaybackCursorChange?.(target);
    },
    [
      clampSeekTarget,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      onPlaybackCursorChange,
      seekSliderValueRef,
      setCurrentTimeSec,
    ],
  );

  const handleSeekInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekInputEvent = useCallback(
    (event: React.SyntheticEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekBlur = useCallback(() => {
    if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
      return;
    }
    handleSeekCommit();
  }, [handleSeekCommit, isSeekCommitInProgressRef, isSeekingRef]);

  const skipBy = useCallback(
    (seconds: number) => {
      commitSeek(currentTimeRef.current + seconds);
    },
    [commitSeek, currentTimeRef],
  );

  return {
    handleSeekBlur,
    handleSeekInput,
    handleSeekInputEvent,
    handleSeekKeyCommit: handleSeekCommit,
    handleSeekPointerCommit: handleSeekCommit,
    handleSeekStart,
    handleSeekTouchCommit: handleSeekCommit,
    seekTo: commitSeek,
    skipBy,
  };
}

function useCompletedAudioEventHandlers({
  audioRef,
  currentTimeRef,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackCursorChange,
  onPlaybackStateChange,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeRef: WritableRef<number>;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const nextDuration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0;
    setDurationSec(nextDuration);
    if (currentTimeRef.current > 0 && currentTimeRef.current < nextDuration) {
      audio.currentTime = currentTimeRef.current;
    } else {
      currentTimeRef.current = audio.currentTime;
      setCurrentTimeSec(audio.currentTime);
      onPlaybackCursorChange?.(audio.currentTime);
    }
  }, [audioRef, currentTimeRef, onPlaybackCursorChange, setCurrentTimeSec, setDurationSec]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isSeekingRef.current || isSeekCommitInProgressRef.current) {
      return;
    }
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    currentTimeRef.current = current;
    setCurrentTimeSec(current);
    onPlaybackCursorChange?.(current);
  }, [
    audioRef,
    currentTimeRef,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackCursorChange,
    setCurrentTimeSec,
  ]);

  const onPlay = useCallback(() => {
    setError(null);
    setIsPlaying(true);
    onPlaybackCursorChange?.(currentTimeRef.current);
    onPlaybackStateChange?.(true);
  }, [currentTimeRef, onPlaybackCursorChange, onPlaybackStateChange, setError, setIsPlaying]);

  const onPause = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange, setIsPlaying]);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange, setIsPlaying]);

  const onAudioError = useCallback(() => {
    const audioError = audioRef.current?.error;
    const message = audioError && typeof audioError.message === "string" ? audioError.message : "";
    setError(message || "Completed playback failed. Please retry.");
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [audioRef, onPlaybackStateChange, setError, setIsPlaying]);

  return { onAudioError, onEnded, onLoadedMetadata, onPause, onPlay, onTimeUpdate };
}

function useCompletedAudioCommands({
  audioRef,
  canPlayCompleted,
  currentTimeRef,
  isPlaying,
  onPlaybackCursorChange,
  onPlaybackStateChange,
  resolvedDurationSec,
  setCurrentTimeSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  currentTimeRef: WritableRef<number>;
  isPlaying: boolean;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  resolvedDurationSec: number;
  setCurrentTimeSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  const resetAudioToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = 0;
    currentTimeRef.current = 0;
    setCurrentTimeSec(0);
    onPlaybackCursorChange?.(0);
  }, [audioRef, currentTimeRef, onPlaybackCursorChange, setCurrentTimeSec]);

  const playCompletedAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !canPlayCompleted) {
      return;
    }
    if (resolvedDurationSec > 0 && currentTimeRef.current >= resolvedDurationSec - 0.05) {
      resetAudioToStart();
    }

    setError(null);
    try {
      await audio.play();
    } catch {
      setError("Browser blocked playback. Press play again.");
      setIsPlaying(false);
      onPlaybackStateChange?.(false);
    }
  }, [
    audioRef,
    canPlayCompleted,
    currentTimeRef,
    onPlaybackStateChange,
    resetAudioToStart,
    resolvedDurationSec,
    setError,
    setIsPlaying,
  ]);

  const handlePlayToggle = useCallback(async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      return;
    }
    await playCompletedAudio();
  }, [audioRef, isPlaying, playCompletedAudio]);

  const restartCompletedAudio = useCallback(async () => {
    resetAudioToStart();
    await playCompletedAudio();
  }, [playCompletedAudio, resetAudioToStart]);

  return { handlePlayToggle, playCompletedAudio, restartCompletedAudio };
}

function useCompletedPlaybackControllerRegistration({
  audioRef,
  canPlayCompleted,
  isPlaying,
  onPlaybackControlsChange,
  playbackRate,
  playCompletedAudio,
  restartCompletedAudio,
  seekTo,
  setPlaybackRate,
  skipBy,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  isPlaying: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  playbackRate: number;
  playCompletedAudio: () => Promise<void> | void;
  restartCompletedAudio: () => Promise<void> | void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  skipBy: (seconds: number) => void;
}) {
  useEffect(() => {
    if (!canPlayCompleted) {
      onPlaybackControlsChange?.(null);
      return;
    }
    onPlaybackControlsChange?.({
      isAvailable: true,
      isPlaying,
      playbackRate,
      pause: () => {
        audioRef.current?.pause();
      },
      play: playCompletedAudio,
      restart: restartCompletedAudio,
      seekTo,
      setPlaybackRate,
      skipBy,
    });
    return () => {
      onPlaybackControlsChange?.(null);
    };
  }, [
    audioRef,
    canPlayCompleted,
    isPlaying,
    onPlaybackControlsChange,
    playbackRate,
    playCompletedAudio,
    restartCompletedAudio,
    seekTo,
    setPlaybackRate,
    skipBy,
  ]);
}

function useCompletedAudioElementSource({
  audioRef,
  canPlayCompleted,
  src,
  volume,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  src: string;
  volume: number;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlayCompleted) {
      return;
    }

    audio.volume = volume;
    audio.preload = "auto";
    if (audio.currentSrc === "" && src) {
      audio.src = src;
      audio.load();
    }
  }, [audioRef, canPlayCompleted, src, volume]);
}

function CompletedAudioPlayer({
  job,
  src,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  src: string;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  const canPlayCompleted = job.status === "completed" && src.length > 0;
  const durationMs = job.durationMs;

  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const waveformBars = useCompletedWaveformBars(src, canPlayCompleted);
  const isSeekingRef = useRef(false);
  const isSeekCommitInProgressRef = useRef(false);
  const currentTimeRef = useRef(0);
  const seekSliderValueRef = useRef(0);
  const resolvedDurationSec = Math.max(0, durationSec > 0 ? durationSec : durationMs / 1000);

  useCompletedAudioAvailabilityReset({
    audioRef,
    canPlayCompleted,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackStateChange,
    setCurrentTimeSec,
    setDurationSec,
    setError,
    setIsPlaying,
  });

  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  const { onAudioError, onEnded, onLoadedMetadata, onPause, onPlay, onTimeUpdate } =
    useCompletedAudioEventHandlers({
      audioRef,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      onPlaybackCursorChange,
      onPlaybackStateChange,
      setCurrentTimeSec,
      setDurationSec,
      setError,
      setIsPlaying,
    });

  const { handlePlayToggle, playCompletedAudio, restartCompletedAudio } = useCompletedAudioCommands(
    {
      audioRef,
      canPlayCompleted,
      currentTimeRef,
      isPlaying,
      onPlaybackCursorChange,
      onPlaybackStateChange,
      resolvedDurationSec,
      setCurrentTimeSec,
      setError,
      setIsPlaying,
    },
  );

  const {
    handleSeekBlur,
    handleSeekInput,
    handleSeekInputEvent,
    handleSeekKeyCommit,
    handleSeekPointerCommit,
    handleSeekStart,
    handleSeekTouchCommit,
    seekTo,
    skipBy,
  } = useCompletedSeekControls({
    audioRef,
    currentTimeRef,
    durationMs,
    durationSec,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackCursorChange,
    seekSliderValueRef,
    setCurrentTimeSec,
  });

  const handleVolume = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.currentTarget.value);
    const next = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    setVolume(next);
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const next = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
    setPlaybackRateState(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }, []);

  useCompletedPlaybackControllerRegistration({
    audioRef,
    canPlayCompleted,
    isPlaying,
    onPlaybackControlsChange,
    playbackRate,
    playCompletedAudio,
    restartCompletedAudio,
    seekTo,
    setPlaybackRate,
    skipBy,
  });

  useCompletedAudioElementSource({ audioRef, canPlayCompleted, src, volume });
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);
  const durationForSliderSec = Math.max(1, resolvedDurationSec);
  const sliderValue = Math.max(0, Math.min(currentTimeSec, durationForSliderSec));

  if (!canPlayCompleted) {
    return <CompletedAudioPending error={error} job={job} />;
  }

  return (
    <CompletedAudioReadyView
      audioRef={audioRef}
      currentTimeSec={currentTimeSec}
      durationForSliderSec={durationForSliderSec}
      durationMs={durationMs}
      durationSec={durationSec}
      error={error}
      handlePlayToggle={handlePlayToggle}
      handleSeekBlur={handleSeekBlur}
      handleSeekInput={handleSeekInput}
      handleSeekInputEvent={handleSeekInputEvent}
      handleSeekKeyCommit={handleSeekKeyCommit}
      handleSeekPointerCommit={handleSeekPointerCommit}
      handleSeekStart={handleSeekStart}
      handleSeekTouchCommit={handleSeekTouchCommit}
      handleVolume={handleVolume}
      isPlaying={isPlaying}
      job={job}
      onAudioError={onAudioError}
      onEnded={onEnded}
      onLoadedMetadata={onLoadedMetadata}
      onPause={onPause}
      onPlay={onPlay}
      onTimeUpdate={onTimeUpdate}
      skipBy={skipBy}
      sliderValue={sliderValue}
      src={src}
      volume={volume}
      waveformBars={waveformBars}
    />
  );
}

function CompletedAudioPending({
  error,
  job,
}: Readonly<{
  error: string | null;
  job: VoiceJob;
}>) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-zinc-600">
        Final audio will appear after every generated segment passes voice checking.
        {job.durationMs > 0
          ? ` Current generated duration: ${formatDuration(job.durationMs)}.`
          : ""}
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function CompletedAudioReadyView({
  audioRef,
  currentTimeSec,
  durationForSliderSec,
  durationMs,
  durationSec,
  error,
  handlePlayToggle,
  handleSeekBlur,
  handleSeekInput,
  handleSeekInputEvent,
  handleSeekKeyCommit,
  handleSeekPointerCommit,
  handleSeekStart,
  handleSeekTouchCommit,
  handleVolume,
  isPlaying,
  job,
  onAudioError,
  onEnded,
  onLoadedMetadata,
  onPause,
  onPlay,
  onTimeUpdate,
  skipBy,
  sliderValue,
  src,
  volume,
  waveformBars,
}: Readonly<{
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeSec: number;
  durationForSliderSec: number;
  durationMs: number;
  durationSec: number;
  error: string | null;
  handlePlayToggle: () => Promise<void> | void;
  handleSeekBlur: () => void;
  handleSeekInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekInputEvent: (event: React.SyntheticEvent<HTMLInputElement>) => void;
  handleSeekKeyCommit: () => void;
  handleSeekPointerCommit: () => void;
  handleSeekStart: () => void;
  handleSeekTouchCommit: () => void;
  handleVolume: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isPlaying: boolean;
  job: VoiceJob;
  onAudioError: () => void;
  onEnded: () => void;
  onLoadedMetadata: () => void;
  onPause: () => void;
  onPlay: () => void;
  onTimeUpdate: () => void;
  skipBy: (seconds: number) => void;
  sliderValue: number;
  src: string;
  volume: number;
  waveformBars: number[];
}>) {
  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2.5">
        <PlayerStatusLine
          currentTimeSec={currentTimeSec}
          durationSec={durationSec > 0 ? durationSec : durationMs / 1000}
          isLive={isPlaying}
          segment={formatSegment(job)}
        />
        <WaveformDisplay
          bars={waveformBars}
          progress={durationForSliderSec > 0 ? sliderValue / durationForSliderSec : 0}
        />
        <input
          className="h-1 w-full cursor-pointer accent-orange-500"
          max={String(durationForSliderSec)}
          min={0}
          onPointerDown={handleSeekStart}
          onPointerUp={handleSeekPointerCommit}
          onPointerCancel={handleSeekPointerCommit}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekTouchCommit}
          onBlur={handleSeekBlur}
          onInput={handleSeekInputEvent}
          onChange={handleSeekInput}
          onKeyDown={handleSeekStart}
          onKeyUp={handleSeekKeyCommit}
          step={0.05}
          type="range"
          value={String(sliderValue)}
        />
        <CompletedTransportControls
          isPlaying={isPlaying}
          onPlayToggle={handlePlayToggle}
          onSkip={skipBy}
        />
        <CompletedVolumeControl volume={volume} onVolumeChange={handleVolume} />
      </div>
      <audio
        ref={audioRef}
        className="sr-only"
        preload="auto"
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={onAudioError}
      >
        <track kind="captions" />
      </audio>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-3 gap-2 rounded-md border p-2 text-[0.7rem] vs-surface">
        <span className="truncate" title={formatDuration(durationMs)}>
          {formatDuration(durationMs)}
        </span>
        <span className="truncate">{formatSimilarity(job.voiceCheck.similarity)} match</span>
        <span
          className="truncate"
          title={job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"}
        >
          {job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"}
        </span>
      </div>
    </div>
  );
}

function CompletedTransportControls({
  isPlaying,
  onPlayToggle,
  onSkip,
}: Readonly<{
  isPlaying: boolean;
  onPlayToggle: () => Promise<void> | void;
  onSkip: (seconds: number) => void;
}>) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <TransportButton
        label="Back 10 seconds"
        onClick={() => {
          onSkip(-10);
        }}
      >
        ↶10
      </TransportButton>
      <TransportButton
        label="Previous segment"
        onClick={() => {
          onSkip(-30);
        }}
      >
        |‹
      </TransportButton>
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        className="grid h-11 w-11 place-items-center rounded-full text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-95 vs-accent-bg"
        onClick={() => {
          void onPlayToggle();
        }}
        type="button"
      >
        {isPlaying ? "Ⅱ" : "▶"}
      </button>
      <TransportButton
        label="Next segment"
        onClick={() => {
          onSkip(30);
        }}
      >
        ›|
      </TransportButton>
      <TransportButton
        label="Forward 10 seconds"
        onClick={() => {
          onSkip(10);
        }}
      >
        10↷
      </TransportButton>
    </div>
  );
}

function CompletedVolumeControl({
  volume,
  onVolumeChange,
}: Readonly<{
  volume: number;
  onVolumeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}>) {
  return (
    <div className="vs-muted flex items-center gap-2.5 text-xs">
      <span className="text-base">♩</span>
      <input
        className="h-1 flex-1 cursor-pointer accent-orange-500"
        max={1}
        min={0}
        onChange={onVolumeChange}
        step={0.01}
        type="range"
        value={volume}
      />
      <span className="w-10 text-right">{Math.round(volume * 100).toString()}%</span>
      <span className="text-sm">⚙</span>
    </div>
  );
}

function ArrivalAudioPlayer({
  job,
  canPlay,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  return (
    <ArrivalAudioPlayerQueue
      job={job}
      canPlay={canPlay}
      onPlaybackControlsChange={onPlaybackControlsChange}
      onPlaybackStateChange={onPlaybackStateChange}
      onPlaybackCursorChange={onPlaybackCursorChange}
    />
  );
}

function ArrivalAudioPlayerQueue({
  job,
  canPlay,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [bufferedDurationSec, setBufferedDurationSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const segmentsRef = useRef<Map<number, AudioBuffer>>(new Map());
  const loadedThroughRef = useRef(0);
  const activeSourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const isIntentRef = useRef(false);
  const playbackSessionCursorRef = useRef(0);
  const playbackSessionContextRef = useRef(0);
  const cursorSecRef = useRef(0);
  const rafRef = useRef(0);
  const playbackSequenceRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const isSeekCommitInProgressRef = useRef(false);
  const seekSliderValueRef = useRef(0);

  const volumeRef = useRef(1);
  const playbackRateRef = useRef(1);

  const getContext = useCallback(() => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const context = new AudioContext();
    const gainNode = context.createGain();
    gainNode.gain.value = volumeRef.current;
    gainNode.connect(context.destination);
    audioContextRef.current = context;
    gainNodeRef.current = gainNode;
    return context;
  }, []);

  const getSegmentTimeline = useCallback(() => {
    const timeline: { index: number; buffer: AudioBuffer; startSec: number }[] = [];
    let start = 0;
    for (let index = 1; segmentsRef.current.has(index); index += 1) {
      const buffer = segmentsRef.current.get(index);
      if (!buffer) {
        break;
      }
      timeline.push({ index, buffer, startSec: start });
      start += buffer.duration;
    }
    return timeline;
  }, []);

  const getBufferedDurationSec = useCallback(() => {
    return getSegmentTimeline().reduce((total, segment) => total + segment.buffer.duration, 0);
  }, [getSegmentTimeline]);

  const getTotalDurationSec = useCallback(() => {
    const bufferMs = getBufferedDurationSec() * 1000;
    return Math.max(job.durationMs, bufferedDurationSec * 1000, bufferMs) / 1000;
  }, [bufferedDurationSec, getBufferedDurationSec, job.durationMs]);

  const clampCursor = useCallback(
    (cursor: number) => {
      const target = getTotalDurationSec();
      return target > 0 ? Math.max(0, Math.min(cursor, target)) : Math.max(0, cursor);
    },
    [getTotalDurationSec],
  );

  const publishCursor = useCallback(
    (cursor: number) => {
      const safeCursor = clampCursor(cursor);
      cursorSecRef.current = safeCursor;
      setCurrentTimeSec(safeCursor);
      onPlaybackCursorChange?.(safeCursor);
      return safeCursor;
    },
    [clampCursor, onPlaybackCursorChange],
  );

  const getCurrentCursor = useCallback(() => {
    const context = audioContextRef.current;
    if (
      !isIntentRef.current ||
      !isPlaying ||
      !context ||
      playbackSessionContextRef.current <= 0 ||
      activeSourcesRef.current.size === 0
    ) {
      return cursorSecRef.current;
    }

    const played =
      playbackSessionCursorRef.current +
      (context.currentTime - playbackSessionContextRef.current) * playbackRateRef.current;
    const clamped = clampCursor(played);
    if (isScrubbingRef.current || isSeekCommitInProgressRef.current) {
      return cursorSecRef.current;
    }
    if (clamped >= cursorSecRef.current) {
      publishCursor(clamped);
    }
    return cursorSecRef.current;
  }, [clampCursor, isPlaying, publishCursor]);

  const getPlaybackCursorFromContext = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || playbackSessionContextRef.current <= 0) {
      return cursorSecRef.current;
    }

    return clampCursor(
      playbackSessionCursorRef.current +
        (context.currentTime - playbackSessionContextRef.current) * playbackRateRef.current,
    );
  }, [clampCursor]);

  const clearSources = useCallback(() => {
    playbackSequenceRef.current += 1;
    for (const source of activeSourcesRef.current.values()) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    }

    activeSourcesRef.current.clear();
  }, []);

  const stopPlayback = useCallback(
    (notify = true) => {
      isIntentRef.current = false;
      clearSources();
      playbackSessionCursorRef.current = 0;
      playbackSessionContextRef.current = 0;
      setIsPlaying(false);
      setIsQueued(false);
      if (notify) {
        onPlaybackStateChange?.(false);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    },
    [clearSources, onPlaybackStateChange],
  );

  const completeIfDone = useCallback(
    (cursor: number) => {
      if (job.status !== "completed") {
        return;
      }

      const target = getTotalDurationSec();
      if (target <= 0 || cursor < target - 0.01) {
        return;
      }

      setIsQueued(false);
      publishCursor(target);
      stopPlayback();
    },
    [getTotalDurationSec, job.status, publishCursor, stopPlayback],
  );

  const scheduleFromCursor = useCallback(
    // eslint-disable-next-line sonarjs/cognitive-complexity
    (cursor: number, context: AudioContext) => {
      if (!isIntentRef.current) {
        return;
      }

      const timeline = getSegmentTimeline();
      if (timeline.length === 0) {
        setIsQueued(true);
        return;
      }

      const clippedCursor = clampCursor(cursor);
      const startContext = context.currentTime;
      const hasActiveSources = activeSourcesRef.current.size > 0;
      const activeIndexList = [...activeSourcesRef.current.keys()];
      const highestActiveIndex = activeIndexList.length === 0 ? 0 : Math.max(...activeIndexList);
      const playbackAnchorCursor = hasActiveSources
        ? getPlaybackCursorFromContext()
        : clippedCursor;
      const playbackSequence = hasActiveSources
        ? playbackSequenceRef.current
        : playbackSequenceRef.current + 1;
      if (!hasActiveSources) {
        playbackSequenceRef.current = playbackSequence;
      }

      let anyScheduled = false;
      for (const segment of timeline) {
        const segmentEnd = segment.startSec + segment.buffer.duration;
        const currentSegmentEndForScheduling = hasActiveSources
          ? playbackAnchorCursor
          : clippedCursor;
        if (segmentEnd <= currentSegmentEndForScheduling) {
          continue;
        }
        if (hasActiveSources && segment.index <= highestActiveIndex) {
          continue;
        }

        const source = context.createBufferSource();
        source.buffer = segment.buffer;
        const gainNode = gainNodeRef.current;
        if (!gainNode) {
          setError("Audio output is not initialized. Press play again.");
          return;
        }
        source.connect(gainNode);
        source.playbackRate.value = playbackRateRef.current;
        const segmentOffset = Math.max(0, playbackAnchorCursor - segment.startSec);
        const start =
          startContext +
          Math.max(0, segment.startSec - playbackAnchorCursor) /
            Math.max(0.1, playbackRateRef.current);

        source.addEventListener("ended", () => {
          if (playbackSequenceRef.current !== playbackSequence) {
            return;
          }

          activeSourcesRef.current.delete(segment.index);
          if (activeSourcesRef.current.size > 0) {
            return;
          }

          const nextCursor = getPlaybackCursorFromContext();
          if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
            publishCursor(nextCursor);
          }
          if (!isIntentRef.current) {
            return;
          }
          const buffered = getBufferedDurationSec();
          if (nextCursor < buffered - 0.01) {
            setIsQueued(false);
            scheduleFromCursor(nextCursor, context);
            return;
          }

          if (nextCursor >= buffered - 0.01) {
            setIsQueued(true);
          }
          completeIfDone(nextCursor);
        });

        source.start(start, segmentOffset);
        activeSourcesRef.current.set(segment.index, source);
        anyScheduled = true;
      }

      if (!hasActiveSources) {
        playbackSessionCursorRef.current = clippedCursor;
        playbackSessionContextRef.current = startContext;
        if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
          publishCursor(clippedCursor);
        }
      }
      if (hasActiveSources && !isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        publishCursor(playbackAnchorCursor);
      }
      setIsQueued(!anyScheduled);
      if (anyScheduled) {
        setError(null);
      }
    },
    [
      clampCursor,
      getBufferedDurationSec,
      getPlaybackCursorFromContext,
      getSegmentTimeline,
      completeIfDone,
      publishCursor,
    ],
  );

  const beginPlayback = useCallback(async () => {
    const context = getContext();
    try {
      await context.resume();
    } catch {
      setError("Browser blocked playback. Press play again.");
      return;
    }

    isIntentRef.current = true;
    const totalDuration = getTotalDurationSec();
    if (totalDuration > 0 && cursorSecRef.current >= totalDuration - 0.01) {
      publishCursor(0);
    }
    setIsPlaying(true);
    setError(null);
    onPlaybackStateChange?.(true);
    publishCursor(cursorSecRef.current);
    scheduleFromCursor(publishCursor(cursorSecRef.current), context);
  }, [getContext, getTotalDurationSec, onPlaybackStateChange, publishCursor, scheduleFromCursor]);

  const pausePlayback = useCallback(() => {
    publishCursor(getCurrentCursor());
    stopPlayback(false);
    onPlaybackStateChange?.(false);
  }, [getCurrentCursor, onPlaybackStateChange, publishCursor, stopPlayback]);

  const handlePlayToggle = useCallback(async () => {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    await beginPlayback();
  }, [beginPlayback, isPlaying, pausePlayback]);

  const commitSeek = useCallback(
    async (target: number) => {
      const seekCursor = publishCursor(target);
      if (!isIntentRef.current || !isPlaying) {
        return;
      }

      clearSources();
      const context = getContext();
      try {
        await context.resume();
        scheduleFromCursor(seekCursor, context);
      } catch {
        // continue
      }
    },
    [clearSources, getContext, isPlaying, publishCursor, scheduleFromCursor],
  );

  const handleSeekStart = useCallback(() => {
    isScrubbingRef.current = true;
    seekSliderValueRef.current = cursorSecRef.current;
  }, []);

  const resolveSeekTarget = useCallback(
    (value?: number) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return clampCursor(value);
      }
      return clampCursor(seekSliderValueRef.current);
    },
    [clampCursor],
  );

  const handleSeekUpdate = useCallback(
    (rawValue: number) => {
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        isScrubbingRef.current = true;
        seekSliderValueRef.current = cursorSecRef.current;
      }

      if (!isScrubbingRef.current) {
        return;
      }

      const target = clampCursor(Number.isFinite(rawValue) ? rawValue : cursorSecRef.current);
      seekSliderValueRef.current = target;
      publishCursor(target);
    },
    [clampCursor, publishCursor],
  );

  const handleSeekCommit = useCallback(
    (value?: number) => {
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        isScrubbingRef.current = true;
        seekSliderValueRef.current = cursorSecRef.current;
      }

      if (!isScrubbingRef.current) {
        return;
      }

      if (isSeekCommitInProgressRef.current) {
        return;
      }
      isSeekCommitInProgressRef.current = true;
      const seekTo = resolveSeekTarget(value);
      seekSliderValueRef.current = seekTo;
      publishCursor(seekTo);
      void commitSeek(seekTo);
      requestAnimationFrame(() => {
        isScrubbingRef.current = false;
        isSeekCommitInProgressRef.current = false;
      });
    },
    [commitSeek, publishCursor, resolveSeekTarget],
  );

  const handleSeekInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekInputEvent = useCallback(
    (event: React.SyntheticEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekBlur = useCallback(() => {
    if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
      return;
    }
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekPointerCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekKeyCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekTouchCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleVolume = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.currentTarget.value);
    const next = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    setVolume(next);
    volumeRef.current = next;
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(next, audioContextRef.current.currentTime);
    }
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const next = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
      const context = audioContextRef.current;
      if (context && isPlaying && isIntentRef.current) {
        const cursor = getCurrentCursor();
        clearSources();
        playbackRateRef.current = next;
        setPlaybackRateState(next);
        playbackSessionCursorRef.current = cursor;
        playbackSessionContextRef.current = 0;
        scheduleFromCursor(cursor, context);
        return;
      }
      playbackRateRef.current = next;
      setPlaybackRateState(next);
      for (const source of activeSourcesRef.current.values()) {
        if (context) {
          source.playbackRate.setValueAtTime(next, context.currentTime);
        } else {
          source.playbackRate.value = next;
        }
      }
    },
    [clearSources, getCurrentCursor, isPlaying, scheduleFromCursor],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const next = clampCursor(seconds);
      publishCursor(next);
      void commitSeek(next);
    },
    [clampCursor, commitSeek, publishCursor],
  );

  const skipBy = useCallback(
    (seconds: number) => {
      seekTo(cursorSecRef.current + seconds);
    },
    [seekTo],
  );

  const restartArrivalPlayback = useCallback(async () => {
    clearSources();
    isIntentRef.current = false;
    playbackSessionCursorRef.current = 0;
    playbackSessionContextRef.current = 0;
    publishCursor(0);
    await beginPlayback();
  }, [beginPlayback, clearSources, publishCursor]);

  useEffect(() => {
    if (!canPlay) {
      onPlaybackControlsChange?.(null);
      return;
    }
    onPlaybackControlsChange?.({
      isAvailable: true,
      isPlaying,
      playbackRate,
      pause: pausePlayback,
      play: beginPlayback,
      restart: restartArrivalPlayback,
      seekTo,
      setPlaybackRate,
      skipBy,
    });
    return () => {
      onPlaybackControlsChange?.(null);
    };
  }, [
    beginPlayback,
    canPlay,
    isPlaying,
    onPlaybackControlsChange,
    pausePlayback,
    playbackRate,
    restartArrivalPlayback,
    seekTo,
    setPlaybackRate,
    skipBy,
  ]);

  const refreshBufferedDuration = useCallback(() => {
    const timeline = getSegmentTimeline();
    const duration = timeline.reduce((total, segment) => total + segment.buffer.duration, 0);
    setBufferedDurationSec(duration);
    setWaveformBars(
      buildWaveformBarsFromAudioBuffers(
        timeline.map((segment) => segment.buffer),
        76,
      ),
    );
  }, [getSegmentTimeline]);

  const arrivalThroughput = useMemo(() => {
    const durations = job.audioSegmentDurationsMs ?? [];
    const latencies = job.audioSegmentLatenciesMs ?? [];
    const readyCount = Math.max(0, Math.min(readySegments, durations.length, latencies.length));
    if (readyCount <= 0) {
      return null;
    }

    const windowSize = Math.min(6, readyCount);
    const startIndex = Math.max(0, readyCount - windowSize);
    let totalDurationMS = 0;
    let totalLatencyMS = 0;
    let sampleCount = 0;

    for (let index = startIndex; index < readyCount; index += 1) {
      const durationMS = durations[index];
      const latencyMS = latencies[index];
      if (!Number.isFinite(durationMS) || !Number.isFinite(latencyMS)) {
        continue;
      }
      if (durationMS <= 0 || latencyMS <= 0) {
        continue;
      }
      totalDurationMS += durationMS;
      totalLatencyMS += latencyMS;
      sampleCount += 1;
    }

    if (sampleCount === 0 || totalLatencyMS <= 0) {
      return null;
    }

    const productionRatio = totalDurationMS / totalLatencyMS;
    const bufferLeadSec = Math.max(0, getBufferedDurationSec() - currentTimeSec);
    const isBufferGrowing = productionRatio >= 1;
    const remainingBufferedLeadSec = isBufferGrowing
      ? Number.POSITIVE_INFINITY
      : bufferLeadSec / Math.max(1e-4, 1 - productionRatio);
    let riskLabel = "stable";
    if (!isBufferGrowing && productionRatio < 0.9) {
      riskLabel = remainingBufferedLeadSec < 2 ? "high" : "medium";
    } else if (!isBufferGrowing && productionRatio < 0.98) {
      riskLabel = "low";
    }

    return {
      productionRatio,
      bufferLeadSec,
      remainingBufferedLeadSec,
      riskLabel,
    };
  }, [
    job.audioSegmentDurationsMs,
    job.audioSegmentLatenciesMs,
    readySegments,
    currentTimeSec,
    getBufferedDurationSec,
  ]);

  const queueRiskValue = useMemo(() => {
    if (!arrivalThroughput) {
      return "waiting";
    }

    const estimatedLead = arrivalThroughput.remainingBufferedLeadSec;
    const riskDuration = Number.isFinite(estimatedLead)
      ? formatDuration(Math.max(0, Math.round(estimatedLead * 1000)))
      : "growing";

    return `${arrivalThroughput.riskLabel} (${riskDuration})`;
  }, [arrivalThroughput]);

  useEffect(() => {
    if (Math.max(0, readySegments) <= 0) {
      return;
    }
    if (!isPlaying && !isIntentRef.current) {
      return;
    }

    let cancelled = false;
    const target = Math.max(0, readySegments);
    const context = getContext();
    const load = async () => {
      if (loadedThroughRef.current >= target) {
        return;
      }

      interface SegmentLoadResult {
        index: number;
        audioBuffer?: AudioBuffer;
        skipped?: boolean;
        error?: string;
      }

      const missingSegmentIndexes: number[] = [];
      for (let index = loadedThroughRef.current + 1; index <= target; index += 1) {
        if (segmentsRef.current.has(index)) {
          continue;
        }
        missingSegmentIndexes.push(index);
      }

      if (missingSegmentIndexes.length === 0) {
        loadedThroughRef.current = target;
        refreshBufferedDuration();
        return;
      }

      const loadRequests: Promise<SegmentLoadResult>[] = missingSegmentIndexes.map(
        async (segmentIndex) => {
          const response = await fetch(
            `${apiBaseUrl}/api/voice-jobs/${job.id}/audio/segment/${String(segmentIndex)}`,
          );
          if (!response.ok) {
            if (response.status === 409) {
              return { index: segmentIndex, skipped: true };
            }

            const message = await response.text();
            return { index: segmentIndex, error: message || "Failed to load segment audio." };
          }

          try {
            const raw = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(raw);
            return { index: segmentIndex, audioBuffer };
          } catch {
            return { index: segmentIndex, error: "Failed to decode segment audio." };
          }
        },
      );

      const results = await Promise.all(loadRequests);
      if (cancelled) {
        return;
      }

      for (const result of results) {
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.skipped) {
          return;
        }
        if (result.audioBuffer) {
          segmentsRef.current.set(result.index, result.audioBuffer);
        }
      }

      let nextThrough = loadedThroughRef.current + 1;
      while (segmentsRef.current.has(nextThrough)) {
        loadedThroughRef.current = nextThrough;
        nextThrough += 1;
      }

      refreshBufferedDuration();
      if (isIntentRef.current) {
        scheduleFromCursor(clampCursor(getCurrentCursor()), context);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    readySegments,
    getContext,
    getCurrentCursor,
    isPlaying,
    job.id,
    refreshBufferedDuration,
    scheduleFromCursor,
    clampCursor,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const tick = () => {
      if (!isIntentRef.current) {
        return;
      }

      const cursor = getCurrentCursor();
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        publishCursor(cursor);
      }
      const buffered = getBufferedDurationSec();
      const target = getTotalDurationSec();
      if (
        activeSourcesRef.current.size === 0 &&
        cursor >= buffered - 0.01 &&
        cursor < target - 0.01
      ) {
        setIsQueued(true);
      }
      completeIfDone(cursor);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [
    completeIfDone,
    getBufferedDurationSec,
    getCurrentCursor,
    getTotalDurationSec,
    isPlaying,
    publishCursor,
  ]);

  useEffect(() => {
    return () => {
      clearSources();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      audioContextRef.current = null;
      gainNodeRef.current = null;
      segmentsRef.current.clear();
      loadedThroughRef.current = 0;
      activeSourcesRef.current.clear();
    };
  }, [clearSources]);

  useEffect(() => {
    clearSources();
    isIntentRef.current = false;
    isScrubbingRef.current = false;
    isSeekCommitInProgressRef.current = false;
    setIsPlaying(false);
    setIsQueued(false);
    cursorSecRef.current = 0;
    setCurrentTimeSec(0);
    playbackSessionCursorRef.current = 0;
    playbackSessionContextRef.current = 0;
    segmentsRef.current.clear();
    loadedThroughRef.current = 0;
    setBufferedDurationSec(0);
    setWaveformBars([]);
    setError(null);
    stopPlayback(false);
  }, [clearSources, stopPlayback]);

  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  const totalDurationSec = getTotalDurationSec();
  const sliderMax =
    totalDurationSec > 0 ? totalDurationSec : Math.max(1, currentTimeSec, cursorSecRef.current);
  const sliderValue = Math.max(0, Math.min(currentTimeSec, sliderMax));
  const showArrivalPendingMessage = !canPlay;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">
        <PlayerStatusLine
          currentTimeSec={sliderValue}
          durationSec={Math.max(totalDurationSec, 0)}
          isLive={isPlaying}
          segment={formatSegment(job)}
        />
        <WaveformDisplay
          bars={waveformBars}
          progress={sliderMax > 0 ? sliderValue / sliderMax : 0}
        />
        <input
          className="h-1 w-full cursor-pointer accent-orange-500"
          max={String(sliderMax)}
          min={0}
          onPointerDown={handleSeekStart}
          onPointerUp={handleSeekPointerCommit}
          onPointerCancel={handleSeekPointerCommit}
          onInput={handleSeekInputEvent}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekTouchCommit}
          onBlur={handleSeekBlur}
          onChange={handleSeekInput}
          onKeyDown={handleSeekStart}
          onKeyUp={handleSeekKeyCommit}
          step={0.05}
          type="range"
          value={String(sliderValue)}
        />
        <div className="flex items-center justify-center gap-1.5">
          <TransportButton
            label="Back 10 seconds"
            onClick={() => {
              skipBy(-10);
            }}
          >
            ↶10
          </TransportButton>
          <TransportButton
            label="Previous segment"
            onClick={() => {
              skipBy(-30);
            }}
          >
            |‹
          </TransportButton>
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-11 w-11 place-items-center rounded-full bg-orange-500 text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
            onClick={() => {
              void handlePlayToggle();
            }}
            type="button"
          >
            {isPlaying ? "Ⅱ" : "▶"}
          </button>
          <TransportButton
            label="Next segment"
            onClick={() => {
              skipBy(30);
            }}
          >
            ›|
          </TransportButton>
          <TransportButton
            label="Forward 10 seconds"
            onClick={() => {
              skipBy(10);
            }}
          >
            10↷
          </TransportButton>
        </div>
        <div className="vs-muted flex items-center gap-2.5 text-xs">
          <span className="text-base">♩</span>
          <input
            className="h-1 flex-1 cursor-pointer accent-orange-500"
            max={1}
            min={0}
            onChange={handleVolume}
            step={0.01}
            type="range"
            value={volume}
          />
          <span className="w-10 text-right">{Math.round(volume * 100).toString()}%</span>
          <span className="text-sm">⚙</span>
        </div>
      </div>
      {showArrivalPendingMessage ? (
        <p className="vs-muted text-xs leading-5">
          Arrival playback will begin when the first segment arrives.
        </p>
      ) : null}
      {isQueued ? (
        <p className="text-xs text-zinc-600">
          Playback queued. It will continue as segments arrive.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
        <span>
          {formatDuration(Math.max(job.durationMs, Math.round(bufferedDurationSec * 1000)))} buffer
        </span>
        <span>
          {arrivalThroughput
            ? `${formatPace(arrivalThroughput.productionRatio)} pace`
            : "pace waiting"}
        </span>
        <span>{queueRiskValue} risk</span>
      </div>
    </div>
  );
}

function ProgressPanel({ job, now }: Readonly<{ job: VoiceJob; now: number }>) {
  return (
    <section className="grid gap-3 border-b border-zinc-200 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Progress
        </h2>
        {job.status === "completed" || job.status === "failed" ? null : (
          <span className="inline-flex h-2.5 w-2.5 animate-pulse bg-amber-500" />
        )}
      </div>
      <div className="grid gap-1 text-sm">
        <p className="font-medium text-zinc-900">{job.progress.message}</p>
        <p className="leading-6 text-zinc-600">{job.progress.detail}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Elapsed" value={formatElapsed(job.progress.startedAt, now)} />
        <Metric label="Current segment" value={formatSegment(job)} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border-t border-zinc-200 pt-3">
      <dt className="text-xs uppercase tracking-[0.14em] text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function parseBookCinemaHash(hash: string): ReadingPosition | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (params.get("cinema") !== "book") {
    return null;
  }
  const bookSourceId = params.get("book")?.trim();
  if (!bookSourceId) {
    return null;
  }
  const parsedWord = Number(params.get("word") ?? "0");
  return {
    activeWordIndex: Number.isFinite(parsedWord) ? Math.max(0, Math.round(parsedWord)) : 0,
    bookSourceId,
    nodeId: params.get("node") ?? undefined,
    scopeKey: params.get("scope") ?? undefined,
  };
}

function replaceBookCinemaHash(position: ReadingPosition): void {
  if (!position.bookSourceId || !position.scopeKey) {
    return;
  }
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", position.bookSourceId);
  params.set("scope", position.scopeKey);
  params.set("word", String(Math.max(0, position.activeWordIndex ?? 0)));
  if (position.nodeId) {
    params.set("node", position.nodeId);
  }
  const nextHash = `#${params.toString()}`;
  if (globalThis.location.hash !== nextHash) {
    globalThis.history.replaceState(null, "", nextHash);
  }
}

function scopeFromBookScopeKey(book: BookSource, key: string | undefined): BookScope {
  if (!key) {
    return resolveDefaultBookScope(book);
  }
  if (key === "book") {
    return { type: "book", label: "Full book" };
  }
  const chapter = /^chapter:(\d+)$/.exec(key);
  if (chapter) {
    const chapterIndex = Number(chapter[1]);
    const sourceChapter = book.chapters?.find((item) => item.index === chapterIndex);
    return {
      type: "chapter",
      chapterIndex,
      label: sourceChapter?.title ?? `Chapter ${String(chapterIndex)}`,
    };
  }
  const pages = /^pages:(\d+)-(\d+)$/.exec(key);
  if (pages) {
    const pageStart = Number(pages[1]);
    const pageEnd = Number(pages[2]);
    return {
      type: "pages",
      pageStart,
      pageEnd,
      label:
        pageStart === pageEnd
          ? `Page ${String(pageStart)}`
          : `Pages ${String(pageStart)}-${String(pageEnd)}`,
    };
  }
  return resolveDefaultBookScope(book);
}

function playbackProgressFromReadingPosition(
  position: ReadingPosition | null,
  bookSourceId: string,
  scopeKey: string,
  projectId: string,
): PlaybackProgress | null {
  if (
    position?.bookSourceId !== bookSourceId ||
    position.scopeKey !== scopeKey ||
    position.activeWordIndex === undefined
  ) {
    return null;
  }
  const timestamp = new Date(0).toISOString();
  return {
    activeWordIndex: position.activeWordIndex,
    bookSourceId,
    createdAt: timestamp,
    currentTimeSec: 0,
    finished: false,
    hidden: false,
    progress: 0,
    projectId,
    readingPosition: position,
    targetId: `hash:${bookSourceId}:${scopeKey}`,
    updatedAt: timestamp,
  };
}

function progressTargetIdForJob(job: VoiceJob): string {
  if (job.progressTargetId) {
    return job.progressTargetId;
  }
  if (job.bookSourceId && job.bookScope) {
    return progressTargetIdForBookScope(job.bookSourceId, job.bookScope);
  }
  if (job.preparedSourceId) {
    return `prepared:${job.preparedSourceId}`;
  }
  return job.id ? `job:${job.id}` : "";
}

function progressTargetIdForBookScope(bookSourceId: string, scope: BookScope): string {
  return `book:${bookSourceId}:${bookScopeKey(scope)}`;
}

function activeWordIndexForProgress(job: VoiceJob, cursorSec: number): number {
  const durationSec = job.durationMs > 0 ? job.durationMs / 1000 : 0;
  const wordCount = job.optimizedText.trim().split(/\s+/).filter(Boolean).length;
  if (durationSec <= 0 || wordCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(wordCount - 1, Math.floor((cursorSec / durationSec) * wordCount)));
}

function formatSimilarity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "waiting";
  }

  return `${Math.round(value * 100).toString()}%`;
}

function formatLikenessLabel(profile: VoiceProfile): string {
  if (!profile.likeness) {
    return "likeness pending";
  }
  return `${formatLikenessBadge(profile.likeness)} likeness`;
}

function formatLikenessBadge(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "pending";
  }
  if (likeness.status === "failed") {
    return "needs QA";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "strong";
  }
  if (score >= 0.68) {
    return "good";
  }
  return "weak";
}

function likenessBadgeClass(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "bg-zinc-100 text-zinc-600";
  }
  if (likeness.status === "failed") {
    return "bg-amber-100 text-amber-800";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (score >= 0.68) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-red-100 text-red-700";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${String(Math.round(value))} B`;
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const ratio = Math.max(0, Math.min(1, value));
  return `${Math.round(ratio * 100).toString()}%`;
}

function formatPercentageRatio(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }
  return formatPercentage(value / total);
}

function formatPace(value: number | null | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return "n/a";
  }
  if (value >= 100) {
    return "99x+";
  }
  if (value >= 10) {
    return `${Math.round(value).toString()}x`;
  }
  return `${value.toFixed(2)}x`;
}

function estimateFirstAudioETA(job: VoiceJob | null): string {
  if (!job) {
    return "n/a";
  }
  if ((job.audioReadySegments ?? 0) > 0) {
    return "Ready";
  }
  const latencies = (job.audioSegmentLatenciesMs ?? []).filter((value) => value > 0);
  if (latencies.length === 0) {
    return job.status === "synthesizing" || job.status === "checking" ? "Calculating" : "n/a";
  }
  return formatDuration(Math.round(latencies[0]));
}

function formatSegment(job: VoiceJob): string {
  const current =
    job.retries.currentSegment > 0
      ? job.retries.currentSegment
      : (job.progress.currentSegment ?? 0);
  const total =
    job.retries.totalSegments > 0 ? job.retries.totalSegments : (job.progress.totalSegments ?? 0);
  if (current > 0 && total > 0) {
    return `${String(current)}/${String(total)}`;
  }

  return "waiting";
}

function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) {
    return "waiting";
  }

  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return "waiting";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes > 0) {
    return `${String(minutes)}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${String(seconds)}s`;
}
