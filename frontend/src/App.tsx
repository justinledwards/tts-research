import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { type RequestState, TopProductBar } from "./AppShell";
import {
  apiBaseUrl,
  audioSource,
  cancelVoiceJob,
  createProject,
  createVoiceJob,
  createVoiceProfileFromCandidate,
  createVoiceProfileSource,
  deleteVoiceProfile,
  getSystemMetrics,
  getVoiceJob,
  getVoiceProfileSource,
  getVoiceProfileSourceDiagnostics,
  listProjectJobs,
  listProjects,
  listVoiceProfiles,
  renameProject,
  subscribeToVoiceJob,
} from "./api";
import { formatDuration } from "./format";
import { HelpPanel, SettingsPanel } from "./ProductPanels";
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
import { calculateArrivalThroughput, formatBufferHealth } from "./studioMetrics";
import {
  DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
  TELEPROMPTER_SETTINGS_STORAGE_KEY,
  buildTeleprompterCue,
  normalizeTeleprompterHighlightSettings,
  type TeleprompterCue,
  type TeleprompterHighlightSettings,
} from "./teleprompter";
import type {
  CreateVoiceJobRequest,
  CreateVoiceProfileFromCandidateRequest,
  StageStatus,
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";
import { VoiceSourceAnalysisPanel } from "./VoiceSourceAnalysisPanel";
import { WorkspaceDrawer } from "./WorkspaceDrawer";
import { buildWaveformBarsFromAudioBuffers, waveformProgressIndex } from "./waveform";

const DEFAULT_PROJECT_NAME = "The Future of Clean Energy";
const SOURCE_TEXT_DRAFT_STORAGE_KEY = "tts-source-text";
const KOKORO_VOICE_STORAGE_KEY = "tts-kokoro-voice-id";
const DEFAULT_KOKORO_VOICE_ID = "af_heart";
const SOURCE_TEXT_FILE_ACCEPT = ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm";
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
  play: () => Promise<void> | void;
  pause: () => void;
  restart: () => Promise<void> | void;
}

interface WritableRef<T> {
  current: T;
}

type CinemaTextSize = "comfortable" | "large" | "giant";

const DISABLED_PLAYBACK_CONTROLLER: PlaybackController = {
  isAvailable: false,
  isPlaying: false,
  play: () => Promise.resolve(),
  pause: () => false,
  restart: () => Promise.resolve(),
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
  isPlaybackActive,
  job,
  playbackControls,
  playbackCursorSec,
  settings,
}: Readonly<{
  isPlaybackActive: boolean;
  job: VoiceJob | null;
  playbackControls: PlaybackController;
  playbackCursorSec: number;
  settings: TeleprompterHighlightSettings;
}>) {
  const [isCinemaOpen, setIsCinemaOpen] = useState(false);
  const [cinemaTextSize, setCinemaTextSize] = useState<CinemaTextSize>("large");
  const cue = useMemo(
    () => buildTeleprompterCue(job, playbackCursorSec, settings),
    [job, playbackCursorSec, settings],
  );
  const handleOpenCinema = useCallback(() => {
    setIsCinemaOpen(true);
  }, []);
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

  if (!cue) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-zinc-950">Teleprompter</h2>
          <button
            className="h-8 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-400"
            disabled
            type="button"
          >
            Cinema
          </button>
        </div>
        <p className="mt-4 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-6 text-sm leading-6 text-zinc-500">
          Generate audio to see a listener-friendly script with word-level focus.
        </p>
      </section>
    );
  }

  const currentWordLabel = teleprompterWordLabel(cue);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-zinc-950">Teleprompter</h2>
          <p className="mt-1 text-xs text-zinc-500">Word focus follows the audio cursor.</p>
        </div>
        <div className="text-left text-xs text-zinc-500 sm:text-right">
          <p>
            Segment {String(cue.segmentIndex + 1)} of {String(cue.segmentCount)}
          </p>
          <p>{currentWordLabel} words</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:flex-nowrap">
          <button
            className="h-8 rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
            disabled={!playbackControls.isAvailable}
            onClick={handleRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-8 rounded-md bg-orange-500 px-3 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
            disabled={!playbackControls.isAvailable}
            onClick={handlePlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="h-8 rounded-md border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
            onClick={handleOpenCinema}
            type="button"
          >
            Cinema
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-lg border border-orange-100 bg-[#fffaf5] p-5 sm:p-7">
        <p className="min-h-6 truncate text-sm leading-6 text-zinc-400">
          {cue.previousText ?? "Start of script"}
        </p>
        <TeleprompterWords cue={cue} settings={settings} variant="panel" />
        <p className="min-h-6 truncate text-sm leading-6 text-zinc-400">
          {cue.nextText ?? "End of script"}
        </p>
        <div className="h-1.5 overflow-hidden rounded-full bg-orange-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width]"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
      </div>
      {isCinemaOpen ? (
        <CinemaTeleprompterOverlay
          cue={cue}
          settings={settings}
          playbackControls={playbackControls}
          textSize={cinemaTextSize}
          isPlaybackActive={isPlaybackActive}
          onClose={handleCloseCinema}
          onPlayPause={handlePlayPause}
          onRestart={handleRestart}
          onTextSizeChange={setCinemaTextSize}
        />
      ) : null}
    </section>
  );
}

function teleprompterWordLabel(cue: TeleprompterCue): string {
  return cue.activeWordIndex >= 0
    ? `${String(cue.activeWordIndex + 1)} / ${String(cue.wordCount)}`
    : "0 / 0";
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
    comfortable:
      "whitespace-pre-wrap text-[1.45rem] leading-[1.8] text-white sm:text-[1.9rem] lg:text-[2.35rem]",
    large:
      "whitespace-pre-wrap text-[1.8rem] leading-[1.82] text-white sm:text-[2.35rem] lg:text-[3rem]",
    giant:
      "whitespace-pre-wrap text-[2.1rem] leading-[1.86] text-white sm:text-[2.8rem] lg:text-[3.55rem]",
  };
  const textClass =
    variant === "cinema"
      ? cinemaTextClassBySize[textSize]
      : "whitespace-pre-wrap text-[1.35rem] leading-[2.1] text-zinc-950 sm:text-2xl";
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

function CinemaTeleprompterOverlay({
  cue,
  isPlaybackActive,
  playbackControls,
  settings,
  textSize,
  onClose,
  onPlayPause,
  onRestart,
  onTextSizeChange,
}: Readonly<{
  cue: TeleprompterCue;
  isPlaybackActive: boolean;
  playbackControls: PlaybackController;
  settings: TeleprompterHighlightSettings;
  textSize: CinemaTextSize;
  onClose: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onTextSizeChange: (size: CinemaTextSize) => void;
}>) {
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

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white"
      role="dialog"
    >
      <header className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-300">
            Cinema Teleprompter
          </p>
          <h2 className="mt-1 text-lg font-semibold sm:text-xl">
            {isPlaybackActive ? "Following playback" : "Ready for playback"}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isPlaybackActive
                ? "border-orange-400 bg-orange-500 text-white"
                : "border-white/15 bg-white/5 text-zinc-300"
            }`}
          >
            {isPlaybackActive ? "Playing" : "Paused"}
          </span>
          <span className="hidden text-sm text-zinc-400 sm:inline">
            Segment {String(cue.segmentIndex + 1)} / {String(cue.segmentCount)} ·{" "}
            {teleprompterWordLabel(cue)} words
          </span>
          <button
            className="h-10 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            onClick={onClose}
            type="button"
          >
            Exit
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col justify-center px-5 py-6 sm:px-10 lg:px-20">
        <div className="mx-auto grid min-h-0 w-full max-w-6xl gap-6">
          <p className="line-clamp-2 text-lg leading-8 text-zinc-500 sm:text-2xl">
            {cue.previousText ?? "Start of script"}
          </p>
          <div className="max-h-[62vh] min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 sm:p-8">
            <TeleprompterWords cue={cue} settings={settings} textSize={textSize} variant="cinema" />
          </div>
          <p className="line-clamp-2 text-lg leading-8 text-zinc-500 sm:text-2xl">
            {cue.nextText ?? "End of script"}
          </p>
        </div>
      </main>
      <footer className="border-t border-white/10 px-5 py-5 sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-center gap-3">
          <button
            className="h-10 rounded-md border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-500"
            disabled={!playbackControls.isAvailable}
            onClick={onRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-12 min-w-28 rounded-full bg-orange-500 px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-700"
            disabled={!playbackControls.isAvailable}
            onClick={onPlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <div className="inline-flex overflow-hidden rounded-md border border-white/15 bg-white/5 p-1">
            {(["comfortable", "large", "giant"] as const).map((size) => (
              <button
                className={`h-8 px-3 text-xs font-semibold capitalize ${
                  textSize === size
                    ? "rounded bg-white text-zinc-950"
                    : "text-zinc-300 hover:text-white"
                }`}
                key={size}
                onClick={() => {
                  onTextSizeChange(size);
                }}
                type="button"
              >
                {size}
              </button>
            ))}
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-orange-500 transition-[width]"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Press Escape to return to the studio.
        </p>
      </footer>
    </div>
  );
}

type AudioPlaybackMode = "arrival" | "completed";

const JOB_ID_STORAGE_KEY = "tts-active-job-id";
const VOICE_PROFILE_ID_STORAGE_KEY = "tts-active-voice-profile-id";
const ACTIVE_PROJECT_ID_STORAGE_KEY = "tts-active-project-id";

export function App() {
  const [text, setText] = useState(() => {
    const savedText = localStorage.getItem(SOURCE_TEXT_DRAFT_STORAGE_KEY);
    if (savedText === null) {
      return "";
    }
    return savedText;
  });
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("");
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
  const [projectJobs, setProjectJobs] = useState<VoiceJob[]>([]);
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
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playbackCursorSec, setPlaybackCursorSec] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [playbackControls, setPlaybackControls] = useState<PlaybackController>(
    DISABLED_PLAYBACK_CONTROLLER,
  );
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [systemMetricsError, setSystemMetricsError] = useState<string | null>(null);
  const [systemMetricsUnavailable, setSystemMetricsUnavailable] = useState(false);

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
  const activeProject = useMemo<VoiceProject | null>(() => {
    const selectedProject = projects.find((project) => project.id === activeProjectId);
    if (selectedProject) {
      return selectedProject;
    }
    return projects.length > 0 ? projects[0] : null;
  }, [activeProjectId, projects]);
  const studioPipelineHint = getStudioPipelineHint({
    hasLoadedProfiles: hasLoadedVoiceProfiles,
    isLoadingProfiles,
    isProfileStale: isStudioProfileStale,
    selectedProfileId: selectedVoiceProfileId,
  });
  const ttsPipelineHint = isProcessing
    ? (job?.progress.message ?? "TTS pipeline is processing the current job.")
    : "Start a job to see live TTS pipeline status.";
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

  const refreshProfileSourceDiagnostics = useCallback(async () => {
    try {
      const diagnostics = await getVoiceProfileSourceDiagnostics();
      setProfileSourceDiagnostics(diagnostics);
    } catch {
      setProfileSourceDiagnostics(null);
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

  const selectKokoroVoice = useCallback((voiceId: string) => {
    const nextVoiceId = findKokoroVoicepack(voiceId)?.id ?? DEFAULT_KOKORO_VOICE_ID;
    setSelectedKokoroVoiceId(nextVoiceId);
    localStorage.setItem(KOKORO_VOICE_STORAGE_KEY, nextVoiceId);
  }, []);

  const selectProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, projectId);
  }, []);

  const handleCreateProject = useCallback(
    async (name: string) => {
      setProjectError(null);
      try {
        const project = await createProject(name);
        setProjects((currentProjects) => [
          project,
          ...currentProjects.filter((item) => item.id !== project.id),
        ]);
        selectProject(project.id);
      } catch (caughtError) {
        setProjectError(
          caughtError instanceof Error ? caughtError.message : "Unable to create project",
        );
      }
    },
    [selectProject],
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

  const handlePlaybackControlsChange = useCallback((controls: PlaybackController | null) => {
    setPlaybackControls(controls ?? DISABLED_PLAYBACK_CONTROLLER);
  }, []);

  useEffect(() => {
    const cachedProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
    if (cachedProfileId) {
      setSelectedVoiceProfileId(cachedProfileId);
    }
    void refreshVoiceProfiles();
    void refreshProjects();
    void refreshProfileSourceDiagnostics();
  }, [refreshProfileSourceDiagnostics, refreshProjects, refreshVoiceProfiles]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, activeProjectId);
    void refreshProjectJobs(activeProjectId);
  }, [activeProjectId, refreshProjectJobs]);

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
    localStorage.setItem(SOURCE_TEXT_DRAFT_STORAGE_KEY, text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem(RUN_CONFIG_STORAGE_KEY, JSON.stringify(runConfiguration));
  }, [runConfiguration]);

  useEffect(() => {
    localStorage.setItem(TELEPROMPTER_SETTINGS_STORAGE_KEY, JSON.stringify(teleprompterSettings));
  }, [teleprompterSettings]);

  useEffect(() => {
    if (job?.id) {
      localStorage.setItem(JOB_ID_STORAGE_KEY, job.id);
    }
  }, [job?.id]);

  useEffect(() => {
    const hasJob = Boolean(job?.id);
    setPlaybackCursorSec(0);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
    if (hasJob) {
      setIsPlaybackActive(false);
    }
  }, [job?.id]);

  useEffect(() => {
    const restoreJobId =
      new URLSearchParams(globalThis.location.search).get("jobId") ??
      localStorage.getItem(JOB_ID_STORAGE_KEY);

    if (!restoreJobId) {
      return;
    }

    const restore = async () => {
      try {
        const restoredJob = await getVoiceJob(restoreJobId);
        setJob(restoredJob);
        if (restoredJob.projectId) {
          selectProject(restoredJob.projectId);
        }
        if (typeof restoredJob.inputText === "string") {
          setText(restoredJob.inputText);
          localStorage.setItem(SOURCE_TEXT_DRAFT_STORAGE_KEY, restoredJob.inputText);
        }
        if (restoredJob.status === "completed") {
          setRequestState("complete");
          setError(null);
          return;
        }

        if (restoredJob.status === "failed") {
          setRequestState("error");
          setError(restoredJob.error ?? "Voice job failed");
          return;
        }

        if (restoredJob.status === "cancelled") {
          setRequestState("cancelled");
          setError(restoredJob.error ?? "Voice job cancelled");
          return;
        }

        setRequestState("running");
        setError(null);
      } catch {
        localStorage.removeItem(JOB_ID_STORAGE_KEY);
      }
    };

    void restore();
  }, [selectProject]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    return subscribeToVoiceJob(
      activeJobId,
      (nextJob) => {
        setJob(nextJob);
        if (nextJob.status !== "failed") {
          setError(null);
        }
        if (nextJob.status === "completed") {
          setRequestState("complete");
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
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
  }, [activeJobId, activeProjectId, refreshProjectJobs]);

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

  async function submitVoiceJob() {
    const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
    const request: CreateVoiceJobRequest = buildCreateVoiceJobRequest(
      text,
      runConfiguration,
      selectedVoiceProfileId,
      activeProjectId,
      selectedKokoroVoice?.id,
      selectedKokoroVoice?.langCode,
    );

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

  const studioJobName = getStudioJobName(job);
  const studioProjectName = activeProject?.name ?? DEFAULT_PROJECT_NAME;

  return (
    <main className="min-h-screen bg-[#f7f8f7] text-zinc-950">
      <TopProductBar
        activeJobId={activeJobId}
        canSubmit={canSubmit}
        isProcessing={isProcessing}
        job={job}
        jobName={studioJobName}
        projectName={studioProjectName}
        requestState={requestState}
        onCancel={() => {
          void handleCancelVoiceJob();
        }}
        onHelpOpen={() => {
          setIsHelpOpen(true);
        }}
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
        isOpen={isWorkspaceOpen}
        job={job}
        metrics={systemMetrics}
        metricsError={systemMetricsError}
        projectError={projectError}
        projectJobs={projectJobs}
        projects={projects}
        profileSource={profileSource}
        profiles={voiceProfiles}
        selectedProfileId={selectedVoiceProfileId}
        onCreateProject={handleCreateProject}
        onClose={() => {
          setIsWorkspaceOpen(false);
        }}
        onOpenSettings={() => {
          setIsWorkspaceOpen(false);
          setIsSettingsOpen(true);
        }}
        onRenameProject={handleRenameProject}
        onSelectProject={selectProject}
        onSelectProfile={selectVoiceProfile}
      />
      <RunConfigDrawer
        canSubmit={canSubmit}
        isOpen={isRunConfigOpen}
        job={job}
        runConfiguration={runConfiguration}
        selectedProfileName={selectedVoiceProfile?.name ?? null}
        onChange={setRunConfiguration}
        onClose={() => {
          setIsRunConfigOpen(false);
        }}
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
        runConfiguration={runConfiguration}
        selectedProfile={selectedVoiceProfile}
        teleprompterSettings={teleprompterSettings}
        onClose={() => {
          setIsSettingsOpen(false);
        }}
        onTeleprompterSettingsChange={(settings) => {
          setTeleprompterSettings(normalizeTeleprompterHighlightSettings(settings));
        }}
      />

      <section className="grid min-h-[calc(100vh-58px)] grid-cols-1 border-t border-zinc-200 lg:grid-cols-[375px_minmax(0,1fr)_430px]">
        <aside className="flex min-w-0 flex-col overflow-hidden border-zinc-200 bg-white lg:border-r">
          <VoiceStudioPanel
            error={profileError}
            job={job}
            profileSource={profileSource}
            profileSourceDiagnostics={profileSourceDiagnostics}
            isLoading={isLoadingProfiles}
            isAnalyzingSource={isAnalyzingProfileSource}
            optimizedText={job?.optimizedText ?? ""}
            profileCandidateCreateId={profileCandidateCreateId}
            profiles={voiceProfiles}
            selectedKokoroVoiceId={selectedKokoroVoiceId}
            selectedProfileId={selectedVoiceProfileId}
            studioPipelineHint={studioPipelineHint}
            onAnalyzeSource={handleAnalyzeVoiceSource}
            onClearSelection={clearVoiceProfileSelection}
            onCreateProfileFromCandidate={handleCreateVoiceProfileFromCandidate}
            onDeleteProfile={(id) => {
              void handleDeleteVoiceProfile(id);
            }}
            onSelectKokoroVoice={selectKokoroVoice}
            onSelectProfile={selectVoiceProfile}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-6 p-5 xl:p-6">
          <TeleprompterPanel
            isPlaybackActive={isPlaybackActive}
            job={job}
            playbackControls={playbackControls}
            playbackCursorSec={playbackCursorSec}
            settings={teleprompterSettings}
          />
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
          <SourceTextPanel
            canSubmit={canSubmit}
            isProcessing={isProcessing}
            text={text}
            onSubmit={handleSubmit}
            onTextChange={setText}
          />
          <SourceMetadataStrip job={job} text={text} />
        </section>

        <aside className="flex min-w-0 flex-col gap-4 border-zinc-200 bg-white p-5 lg:border-l">
          <AudioPanel
            job={job}
            onPlaybackCursorChange={setPlaybackCursorSec}
            onPlaybackControlsChange={handlePlaybackControlsChange}
            onPlaybackStateChange={setIsPlaybackActive}
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
  canSubmit,
  isProcessing,
  text,
  onSubmit,
  onTextChange,
}: Readonly<{
  canSubmit: boolean;
  isProcessing: boolean;
  text: string;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onTextChange: (text: string) => void;
}>) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [sourceFileLabel, setSourceFileLabel] = useState<string | null>(null);
  const [sourceFileError, setSourceFileError] = useState<string | null>(null);

  const loadSourceFiles = useCallback(
    async (files: FileList | File[]) => {
      if (isProcessing) {
        return;
      }

      setSourceFileError(null);
      const fileArray = [...files].filter((file) => isSupportedSourceTextFile(file));
      if (fileArray.length === 0) {
        setSourceFileError("Drop a text, Markdown, HTML, CSV, JSON, or log file.");
        return;
      }

      try {
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
    [isProcessing, onTextChange],
  );

  return (
    <form
      className={`rounded-lg border bg-white p-5 shadow-sm ${
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-zinc-950" htmlFor="source-text">
          Source Text
        </label>
        <p className="text-xs text-zinc-500">
          {text.trim().length.toLocaleString()} characters queued
        </p>
      </div>
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
        readOnly={isProcessing}
        spellCheck={false}
        value={text}
      />
      <button className="sr-only" disabled={!canSubmit} type="submit">
        Create checked audio
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

function VoiceStudioPanel({
  error,
  job,
  profileSource,
  profileSourceDiagnostics,
  isLoading,
  isAnalyzingSource,
  optimizedText,
  profileCandidateCreateId,
  profiles,
  selectedKokoroVoiceId,
  selectedProfileId,
  studioPipelineHint,
  onAnalyzeSource,
  onClearSelection,
  onCreateProfileFromCandidate,
  onDeleteProfile,
  onSelectKokoroVoice,
  onSelectProfile,
}: Readonly<{
  error: string | null;
  job: VoiceJob | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  isLoading: boolean;
  isAnalyzingSource: boolean;
  optimizedText: string;
  profileCandidateCreateId: string | null;
  profiles: VoiceProfile[];
  selectedKokoroVoiceId: string;
  selectedProfileId: string;
  studioPipelineHint: string;
  onAnalyzeSource: (file: File) => Promise<void>;
  onClearSelection: () => void;
  onCreateProfileFromCandidate: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onDeleteProfile: (id: string) => void;
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
          isLoading={isLoading}
          profiles={profiles}
          selectedKokoroVoiceId={selectedKokoroVoiceId}
          selectedProfile={selectedProfile ?? null}
          selectedProfileId={selectedProfileId}
          onClearSelection={onClearSelection}
          onDeleteProfile={onDeleteProfile}
          onSelectKokoroVoice={onSelectKokoroVoice}
          onSelectProfile={onSelectProfile}
        />

        <ScriptReviewPanel job={job} optimizedText={optimizedText} />

        <VoiceSourceAnalysisPanel
          createCandidateId={profileCandidateCreateId}
          diagnostics={profileSourceDiagnostics}
          error={error}
          isAnalyzing={isAnalyzingSource}
          source={profileSource}
          onAnalyze={onAnalyzeSource}
          onCreateProfile={onCreateProfileFromCandidate}
        />
      </div>
    </section>
  );
}

function VoiceProfileDropdown({
  isLoading,
  profiles,
  selectedKokoroVoiceId,
  selectedProfile,
  selectedProfileId,
  onClearSelection,
  onDeleteProfile,
  onSelectKokoroVoice,
  onSelectProfile,
}: Readonly<{
  isLoading: boolean;
  profiles: VoiceProfile[];
  selectedKokoroVoiceId: string;
  selectedProfile: VoiceProfile | null;
  selectedProfileId: string;
  onClearSelection: () => void;
  onDeleteProfile: (id: string) => void;
  onSelectKokoroVoice: (voiceId: string) => void;
  onSelectProfile: (id: string) => void;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
  const activeName = selectedProfile?.name ?? "Default Voice";
  const likenessBadge = selectedProfile ? formatLikenessLabel(selectedProfile) : "Provider voice";
  const activeDetail = selectedProfile
    ? `${selectedProfile.language} · ${formatDuration(
        selectedProfile.referenceDurationMs ?? selectedProfile.durationMs,
      )} reference · ${likenessBadge}`
    : "Kokoro voicepacks · ready";

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
          <p className="mt-3 truncate text-xs text-zinc-500" title={selectedProfile.sourceFile}>
            {selectedProfile.referenceTrimmed ? "Trimmed clone reference" : "Full clone reference"}{" "}
            · {formatBytes(selectedProfile.sourceBytes)}
          </p>
        ) : null}
      </div>
      <label className="grid min-w-0 gap-1 rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-600">
        <span className="font-semibold text-zinc-800">Kokoro voicepack</span>
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
          {selectedProfile ? " · used when the cloned profile is off" : ""}
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

function VoiceProfileOption({
  detail,
  isActive,
  likeness,
  name,
  score,
  onDelete,
  onSelect,
}: Readonly<{
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
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
}: Readonly<{
  job: VoiceJob | null;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}>) {
  useEffect(() => {
    if (!job) {
      onPlaybackControlsChange?.(null);
      onPlaybackStateChange?.(false);
    }
  }, [job, onPlaybackControlsChange, onPlaybackStateChange]);

  if (!job) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-950">Audio Player</h2>
        <div className="mt-4 grid h-36 place-items-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-5 text-center">
          <div>
            <p className="text-sm font-semibold text-zinc-700">No audio generated yet</p>
            <p className="mt-2 text-xs text-zinc-500">
              Choose a run mode, then create audio to start buffering playback.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <StreamingAudioPanel
      job={job}
      key={job.id}
      onPlaybackCursorChange={onPlaybackCursorChange}
      onPlaybackControlsChange={onPlaybackControlsChange}
      onPlaybackStateChange={onPlaybackStateChange}
    />
  );
}

function StreamingAudioPanel({
  job,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
}: Readonly<{
  job: VoiceJob;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const canPlayCompleted = job.status === "completed";
  const canPlayArrival = job.status !== "failed";
  const [playMode, setPlayMode] = useState<AudioPlaybackMode>(() =>
    job.status === "completed" ? "completed" : "arrival",
  );
  const [isStreamingPlaying, setIsStreamingPlaying] = useState(false);

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
        return "inline-flex h-9 min-w-24 items-center justify-center rounded border border-orange-500 bg-white px-4 text-sm font-medium text-orange-600";
      }

      if (!isAvailable) {
        return "inline-flex h-9 min-w-24 items-center justify-center rounded border border-transparent bg-zinc-100 px-4 text-sm font-medium text-zinc-400";
      }

      return "inline-flex h-9 min-w-24 items-center justify-center rounded border border-transparent bg-zinc-50 px-4 text-sm font-medium text-zinc-600 transition hover:bg-white";
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
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Audio Player</h2>
          <p className="mt-1 text-xs text-zinc-500">
            {playModeLabel[playMode]} mode · {String(readySegments)} segment
            {readySegments === 1 ? "" : "s"} ready
          </p>
        </div>
        <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
          {job.status}
        </span>
      </div>
      <div className="mt-3 flex justify-end">
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 p-1">
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

      <div className="mt-3">
        {isCompletedMode ? (
          <CompletedAudioPlayer
            key={`completed-${job.id}`}
            job={job}
            src={canPlayCompleted ? audioSource(job) : ""}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={onPlaybackCursorChange}
          />
        ) : null}
        {isArrivalMode ? (
          <ArrivalAudioPlayer
            key={`arrival-${job.id}`}
            job={job}
            canPlay={canPlayArrival}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={onPlaybackCursorChange}
          />
        ) : null}
      </div>
      <QueueBufferPanel job={job} />
    </section>
  );
}

function queueBlockClass(segmentIndex: number, ready: number, generating: number): string {
  if (segmentIndex <= ready) {
    return "bg-orange-500";
  }
  if (segmentIndex === generating) {
    return "bg-zinc-950";
  }
  return "bg-zinc-300";
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

function QueueBufferPanel({ job }: Readonly<{ job: VoiceJob }>) {
  const total = Math.max(
    job.retries.totalSegments,
    job.segments?.length ?? 0,
    job.audioReadySegments ?? 0,
    1,
  );
  const ready = Math.max(0, job.audioReadySegments ?? 0);
  const generating =
    job.status === "completed" ? 0 : Math.max(ready + 1, job.progress.currentSegment ?? 0);
  const visibleBlocks = Math.min(48, Math.max(1, total));

  return (
    <section className="mt-3 border-t border-zinc-200 pt-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">Queue & Buffer</h3>
        <p className="text-xs text-orange-700">
          {String(ready)} / {String(total)} ready
        </p>
      </div>
      <div
        className="mt-3 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${String(visibleBlocks)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: visibleBlocks }).map((_, index) => {
          const segmentIndex = queueBlockSegmentIndex(index, visibleBlocks, total);
          const blockClass = queueBlockClass(segmentIndex, ready, generating);
          return (
            <span
              aria-hidden="true"
              className={`h-3 rounded-sm ${blockClass}`}
              key={`queue-${String(index)}`}
            />
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
          Buffered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-950" />
          Generating
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-zinc-300" />
          Pending
        </span>
      </div>
    </section>
  );
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
      className="grid h-16 min-w-0 items-center gap-px rounded-md bg-white py-2"
      style={{ gridTemplateColumns: `repeat(${String(displayBars.length)}, minmax(0, 1fr))` }}
    >
      {displayBars.map((height, index) => (
        <span
          aria-hidden="true"
          className={`w-full rounded-full ${index < activeIndex ? "bg-orange-500" : "bg-zinc-300"}`}
          data-waveform-bar={index}
          data-waveform-value={height.toFixed(4)}
          key={`waveform-${String(index)}`}
          style={{ height: `${Math.round(7 + height * 44).toString()}px` }}
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
      className="grid h-10 w-10 place-items-center rounded-full text-lg text-zinc-950 hover:bg-zinc-100"
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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 overflow-hidden text-sm">
      <span className="inline-flex min-w-0 items-center gap-2 font-medium text-orange-600">
        <span className="h-3 w-3 rounded-sm bg-orange-500" />
        {isLive ? "Playing (live)" : "Ready"}
      </span>
      <span className="text-zinc-500">
        {formatDuration(Math.round(currentTimeSec * 1000))} /{" "}
        {formatDuration(Math.round(durationSec * 1000))}
      </span>
      <span className="shrink-0 text-xs text-zinc-500">{segment}</span>
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
  playCompletedAudio,
  restartCompletedAudio,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  isPlaying: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  playCompletedAudio: () => Promise<void> | void;
  restartCompletedAudio: () => Promise<void> | void;
}) {
  useEffect(() => {
    if (!canPlayCompleted) {
      onPlaybackControlsChange?.(null);
      return;
    }
    onPlaybackControlsChange?.({
      isAvailable: true,
      isPlaying,
      pause: () => {
        audioRef.current?.pause();
      },
      play: playCompletedAudio,
      restart: restartCompletedAudio,
    });
    return () => {
      onPlaybackControlsChange?.(null);
    };
  }, [
    audioRef,
    canPlayCompleted,
    isPlaying,
    onPlaybackControlsChange,
    playCompletedAudio,
    restartCompletedAudio,
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

  useCompletedPlaybackControllerRegistration({
    audioRef,
    canPlayCompleted,
    isPlaying,
    onPlaybackControlsChange,
    playCompletedAudio,
    restartCompletedAudio,
  });

  useCompletedAudioElementSource({ audioRef, canPlayCompleted, src, volume });
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
    <div className="grid gap-4">
      <div className="grid gap-3">
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
      <div className="grid grid-cols-3 gap-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
        <span>{formatDuration(durationMs)} total</span>
        <span>{formatSimilarity(job.voiceCheck.similarity)} checker</span>
        <span>{job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"} voice</span>
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
    <div className="flex items-center justify-center gap-3">
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
        className="grid h-12 w-12 place-items-center rounded-full bg-orange-500 text-xl font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
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
    <div className="flex items-center gap-3 text-sm text-zinc-500">
      <span className="text-lg">♩</span>
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
      <span className="text-lg text-zinc-800">⚙</span>
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
      playbackSessionCursorRef.current + (context.currentTime - playbackSessionContextRef.current);
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
      playbackSessionCursorRef.current + (context.currentTime - playbackSessionContextRef.current),
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
        const segmentOffset = Math.max(0, playbackAnchorCursor - segment.startSec);
        const start = startContext + Math.max(0, segment.startSec - playbackAnchorCursor);

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

  const skipBy = useCallback(
    (seconds: number) => {
      const next = clampCursor(cursorSecRef.current + seconds);
      publishCursor(next);
      void commitSeek(next);
    },
    [clampCursor, commitSeek, publishCursor],
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
      pause: pausePlayback,
      play: beginPlayback,
      restart: restartArrivalPlayback,
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
    restartArrivalPlayback,
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
    <div className="grid gap-4">
      <div className="grid gap-3">
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
        <div className="flex items-center justify-center gap-3">
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
            className="grid h-12 w-12 place-items-center rounded-full bg-orange-500 text-xl font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
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
        <div className="flex items-center gap-3 text-sm text-zinc-500">
          <span className="text-lg">♩</span>
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
          <span className="text-lg text-zinc-800">⚙</span>
        </div>
      </div>
      {showArrivalPendingMessage ? (
        <p className="text-sm leading-6 text-zinc-600">
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
