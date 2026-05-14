import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  apiBaseUrl,
  audioSource,
  createVoiceJob,
  createVoiceProfileFromCandidate,
  createVoiceProfileSource,
  deleteVoiceProfile,
  cancelVoiceJob,
  getSystemMetrics,
  getVoiceJob,
  getVoiceProfileSource,
  listVoiceProfiles,
  subscribeToVoiceJob,
} from "./api";
import { TopProductBar, type RequestState } from "./AppShell";
import { formatDuration } from "./format";
import { HelpPanel, SettingsPanel } from "./ProductPanels";
import { RunConfigDrawer } from "./RunConfigDrawer";
import {
  RUN_CONFIG_STORAGE_KEY,
  buildCreateVoiceJobRequest,
  createRunConfiguration,
  normalizeRunConfiguration,
  type RunConfiguration,
} from "./runConfig";
import {
  calculateArrivalThroughput,
  formatBufferHealth,
  pickActiveSegmentIndex,
} from "./studioMetrics";
import type {
  CreateVoiceProfileFromCandidateRequest,
  CreateVoiceJobRequest,
  StageStatus,
  SystemMetrics,
  VoiceProfileCandidate,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
} from "./types";
import { VoiceSourceAnalysisPanel } from "./VoiceSourceAnalysisPanel";
import { WorkspaceDrawer } from "./WorkspaceDrawer";
import { buildWaveformBars, waveformProgressIndex } from "./waveform";

const TRANSCRIPT_CUE_WINDOW = 3;
const SOURCE_TEXT_DRAFT_STORAGE_KEY = "tts-source-text";

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

function getTranscriptCueLabel(index: number, activeIndex: number): string {
  if (index < activeIndex) {
    return "Previous";
  }
  if (index === activeIndex) {
    return "Current";
  }
  return "Next";
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

function TranscriptCuePanel({
  job,
  playbackCursorSec,
}: Readonly<{
  job: VoiceJob | null;
  playbackCursorSec: number;
}>) {
  const activeSegmentIndex = pickActiveSegmentIndex(job, playbackCursorSec);
  const segments = job?.segments ?? [];

  if (!job || segments.length === 0) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-950">Read Along</h2>
        <p className="mt-4 rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-5 text-sm leading-6 text-zinc-500">
          Generate audio to see listener-friendly transcript cues.
        </p>
      </section>
    );
  }

  const cueStart = Math.max(
    0,
    Math.min(activeSegmentIndex, segments.length - TRANSCRIPT_CUE_WINDOW),
  );
  const cueEnd = Math.min(segments.length, cueStart + TRANSCRIPT_CUE_WINDOW);

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-950">Read Along</h2>
        <p className="text-xs text-zinc-500">
          Segment {String(activeSegmentIndex + 1)} of {String(segments.length)}
        </p>
      </div>
      <ul className="mt-4 grid overflow-hidden rounded-md border border-zinc-200">
        {segments.slice(cueStart, cueEnd).map((segment, offset) => {
          const absoluteIndex = cueStart + offset;
          const isActive = absoluteIndex === activeSegmentIndex;
          const cueLabel = getTranscriptCueLabel(absoluteIndex, activeSegmentIndex);
          return (
            <li
              className={`grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-zinc-200 px-5 py-4 last:border-b-0 ${
                isActive ? "bg-orange-50/70 text-zinc-950" : "bg-white text-zinc-600"
              }`}
              key={`${String(segment.index)}-${segment.text.slice(0, 12)}`}
            >
              <span
                className={`mt-6 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                  isActive ? "bg-orange-500 text-white" : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {isActive ? "▶" : ""}
              </span>
              <div className="grid gap-2">
                <p className="text-xs font-medium text-zinc-500">{cueLabel}</p>
                <p className={`text-base leading-8 ${isActive ? "font-medium" : ""}`}>
                  {segment.text}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
        <label className="inline-flex items-center gap-2">
          <input className="h-4 w-4 accent-orange-500" defaultChecked type="checkbox" />
          Auto-advance
        </label>
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-200">
          <button className="px-3 py-2 hover:bg-zinc-50" type="button">
            A-
          </button>
          <button className="border-l border-zinc-200 px-3 py-2 hover:bg-zinc-50" type="button">
            A+
          </button>
        </div>
      </div>
    </section>
  );
}

type AudioPlaybackMode = "arrival" | "completed";

const JOB_ID_STORAGE_KEY = "tts-active-job-id";
const VOICE_PROFILE_ID_STORAGE_KEY = "tts-active-voice-profile-id";

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
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [hasLoadedVoiceProfiles, setHasLoadedVoiceProfiles] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSource, setProfileSource] = useState<VoiceProfileSource | null>(null);
  const [isAnalyzingProfileSource, setIsAnalyzingProfileSource] = useState(false);
  const [profileCandidateCreateId, setProfileCandidateCreateId] = useState<string | null>(null);
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
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isRunConfigOpen, setIsRunConfigOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playbackCursorSec, setPlaybackCursorSec] = useState(0);
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

  const selectVoiceProfile = useCallback((profileId: string) => {
    setSelectedVoiceProfileId(profileId);
    localStorage.setItem(VOICE_PROFILE_ID_STORAGE_KEY, profileId);
  }, []);

  const clearVoiceProfileSelection = useCallback(() => {
    setSelectedVoiceProfileId("");
    localStorage.removeItem(VOICE_PROFILE_ID_STORAGE_KEY);
  }, []);

  useEffect(() => {
    const cachedProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
    if (cachedProfileId) {
      setSelectedVoiceProfileId(cachedProfileId);
    }
    void refreshVoiceProfiles();
  }, [refreshVoiceProfiles]);

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

  const handleAnalyzeVoiceSource = useCallback(async (file: File) => {
    setIsAnalyzingProfileSource(true);
    setProfileError(null);
    try {
      const source = await createVoiceProfileSource({ file });
      setProfileSource(source);
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error ? caughtError.message : "Unable to analyze voice source",
      );
    } finally {
      setIsAnalyzingProfileSource(false);
    }
  }, []);

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
  }, [profileSource]);

  useEffect(() => {
    localStorage.setItem(SOURCE_TEXT_DRAFT_STORAGE_KEY, text);
  }, [text]);

  useEffect(() => {
    localStorage.setItem(RUN_CONFIG_STORAGE_KEY, JSON.stringify(runConfiguration));
  }, [runConfiguration]);

  useEffect(() => {
    if (job?.id) {
      localStorage.setItem(JOB_ID_STORAGE_KEY, job.id);
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
  }, []);

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
        }
        if (nextJob.status === "failed") {
          setRequestState("error");
          setError(nextJob.error ?? "Voice job failed");
        }

        if (nextJob.status === "cancelled") {
          setRequestState("cancelled");
          setError(nextJob.error ?? "Voice job cancelled");
        }
      },
      (caughtError) => {
        if (caughtError.message === "Voice job progress stream disconnected") {
          return;
        }
        setError(caughtError.message);
      },
    );
  }, [activeJobId]);

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
    const request: CreateVoiceJobRequest = buildCreateVoiceJobRequest(
      text,
      runConfiguration,
      selectedVoiceProfileId,
    );

    setRequestState("running");
    setError(null);
    setPlaybackCursorSec(0);

    try {
      const nextJob = await createVoiceJob(request);
      setJob(nextJob);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
    } catch (caughtError) {
      setRequestState("error");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create voice job");
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f7] text-zinc-950">
      <TopProductBar
        activeJobId={activeJobId}
        canSubmit={canSubmit}
        isProcessing={isProcessing}
        job={job}
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
        isOpen={isWorkspaceOpen}
        job={job}
        metrics={systemMetrics}
        metricsError={systemMetricsError}
        profileSource={profileSource}
        profiles={voiceProfiles}
        selectedProfileId={selectedVoiceProfileId}
        onClose={() => {
          setIsWorkspaceOpen(false);
        }}
        onOpenSettings={() => {
          setIsWorkspaceOpen(false);
          setIsSettingsOpen(true);
        }}
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
        profileSource={profileSource}
        runConfiguration={runConfiguration}
        selectedProfile={selectedVoiceProfile}
        onClose={() => {
          setIsSettingsOpen(false);
        }}
      />

      <section className="grid min-h-[calc(100vh-58px)] grid-cols-1 border-t border-zinc-200 lg:grid-cols-[375px_minmax(0,1fr)_490px]">
        <aside className="flex flex-col border-zinc-200 bg-white lg:border-r">
          <VoiceStudioPanel
            error={profileError}
            profileSource={profileSource}
            isLoading={isLoadingProfiles}
            isAnalyzingSource={isAnalyzingProfileSource}
            optimizedText={job?.optimizedText ?? ""}
            profileCandidateCreateId={profileCandidateCreateId}
            profiles={voiceProfiles}
            selectedProfileId={selectedVoiceProfileId}
            studioPipelineHint={studioPipelineHint}
            onAnalyzeSource={handleAnalyzeVoiceSource}
            onClearSelection={clearVoiceProfileSelection}
            onCreateProfileFromCandidate={handleCreateVoiceProfileFromCandidate}
            onDeleteProfile={(id) => {
              void handleDeleteVoiceProfile(id);
            }}
            onSelectProfile={selectVoiceProfile}
          />
        </aside>

        <section className="flex min-w-0 flex-col gap-6 p-5 xl:p-6">
          <ProjectJobHeader job={job} requestState={requestState} />
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
          <TranscriptCuePanel job={job} playbackCursorSec={playbackCursorSec} />
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
          <AudioPanel job={job} onPlaybackCursorChange={setPlaybackCursorSec} />
          {job?.progress.message ? <ProgressPanel job={job} now={now} /> : null}
          <CheckerPanel job={job} />
        </aside>
      </section>
    </main>
  );
}

function ProjectJobHeader({
  job,
  requestState,
}: Readonly<{ job: VoiceJob | null; requestState: RequestState }>) {
  const jobTitle = job?.voiceProfileName
    ? `${job.voiceProfileName} - Long Form`
    : "Clean Energy - Long Form";
  return (
    <section className="grid gap-4 border-b border-zinc-200 pb-4 md:grid-cols-[minmax(0,1fr)_1.4fr]">
      <div>
        <p className="text-xs text-zinc-500">Project</p>
        <p className="mt-1 text-lg font-semibold text-zinc-950">The Future of Clean Energy</p>
      </div>
      <div>
        <p className="text-xs text-zinc-500">Job</p>
        <div className="mt-1 flex items-center gap-3">
          <p className="text-lg font-semibold text-zinc-950">{jobTitle}</p>
          <span className="text-sm text-zinc-500">✎</span>
          <StatusBadge state={requestState} />
        </div>
      </div>
    </section>
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
    <dl className="grid rounded-lg border border-zinc-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-6">
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
    <div className="border-b border-zinc-200 p-4 last:border-b-0 sm:border-r sm:last:border-r-0 xl:border-b-0">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className="mt-2 text-base font-semibold text-zinc-950">{value}</dd>
      <p className="mt-1 truncate text-xs text-zinc-500">{detail}</p>
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
  return (
    <form className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm" onSubmit={onSubmit}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label className="text-sm font-semibold text-zinc-950" htmlFor="source-text">
          Source Text
        </label>
        <p className="text-xs text-zinc-500">
          {text.trim().length.toLocaleString()} characters queued
        </p>
      </div>
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

function CheckerPanel({ job }: Readonly<{ job: VoiceJob | null }>) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-950">Checker Result</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-700">
        {job?.voiceCheck.reason ??
          "The checker transcript and retry decision will appear after synthesis."}
      </p>
      {job?.voiceCheck.transcript ? (
        <p className="mt-3 max-h-32 overflow-auto rounded-md bg-zinc-50 p-3 text-xs leading-5 text-zinc-500">
          {job.voiceCheck.transcript}
        </p>
      ) : null}
    </section>
  );
}

function VoiceStudioPanel({
  error,
  profileSource,
  isLoading,
  isAnalyzingSource,
  optimizedText,
  profileCandidateCreateId,
  profiles,
  selectedProfileId,
  studioPipelineHint,
  onAnalyzeSource,
  onClearSelection,
  onCreateProfileFromCandidate,
  onDeleteProfile,
  onSelectProfile,
}: Readonly<{
  error: string | null;
  profileSource: VoiceProfileSource | null;
  isLoading: boolean;
  isAnalyzingSource: boolean;
  optimizedText: string;
  profileCandidateCreateId: string | null;
  profiles: VoiceProfile[];
  selectedProfileId: string;
  studioPipelineHint: string;
  onAnalyzeSource: (file: File) => Promise<void>;
  onClearSelection: () => void;
  onCreateProfileFromCandidate: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onDeleteProfile: (id: string) => void;
  onSelectProfile: (id: string) => void;
}>) {
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId);
  const isProfileListLoaded = !isLoading;
  const showEmptyProfiles = isProfileListLoaded && profiles.length === 0;
  const showProfileRows = isProfileListLoaded && profiles.length > 0;

  const statusByProfile = useCallback((status: string) => {
    if (status === "ready") {
      return "ready";
    }
    if (status === "error") {
      return "error";
    }
    return "pending";
  }, []);

  return (
    <section className="flex min-h-full flex-col">
      <div className="grid gap-5 border-b border-zinc-200 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Voice Studio
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{studioPipelineHint}</p>
        </div>

        <section className="grid gap-2">
          <h2 className="text-sm font-semibold text-zinc-950">Active Profile</h2>
          <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-100 text-lg font-semibold text-zinc-700">
                {selectedProfile?.name.slice(0, 1).toUpperCase() ?? "D"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-950">
                  {selectedProfile?.name ?? "Default Voice"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {selectedProfile
                    ? `${selectedProfile.language} · ${formatDuration(selectedProfile.referenceDurationMs ?? selectedProfile.durationMs)} reference`
                    : "Non-cloned voice · ready"}
                </p>
              </div>
              <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                Ready
              </span>
            </div>
            {selectedProfile ? (
              <p className="text-xs text-zinc-500">
                {selectedProfile.referenceTrimmed
                  ? "Trimmed clone reference"
                  : "Full clone reference"}{" "}
                · {formatBytes(selectedProfile.sourceBytes)}
              </p>
            ) : null}
          </div>
        </section>

        <VoiceSourceAnalysisPanel
          createCandidateId={profileCandidateCreateId}
          error={error}
          isAnalyzing={isAnalyzingSource}
          source={profileSource}
          onAnalyze={onAnalyzeSource}
          onCreateProfile={onCreateProfileFromCandidate}
        />

        <section className="grid gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-950">Profile Library</h2>
            <span className="text-xs text-zinc-500">{String(profiles.length)} profiles</span>
          </div>
          {isLoading ? <p className="text-sm text-zinc-600">Loading profiles...</p> : null}
          {showEmptyProfiles ? (
            <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
              No voice profiles yet.
            </p>
          ) : null}
          {showProfileRows ? (
            <ul className="overflow-hidden rounded-lg border border-zinc-200">
              {profiles.map((profile) => {
                const isActive = profile.id === selectedProfileId;

                return (
                  <li
                    className={`grid gap-2 border-b border-zinc-200 p-3 last:border-b-0 ${
                      isActive ? "bg-zinc-50" : "bg-white"
                    }`}
                    key={profile.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="grid gap-1">
                        <span className="font-medium text-zinc-950">{profile.name}</span>
                        <span className="text-xs text-zinc-500">
                          {statusByProfile(profile.status)} · {profile.language} ·{" "}
                          {formatDuration(profile.referenceDurationMs ?? profile.durationMs)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            profile.status === "ready" ? "bg-emerald-500" : "bg-zinc-300"
                          }`}
                        />
                        {isActive ? (
                          <button
                            className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 px-3 text-xs font-semibold text-zinc-500"
                            onClick={onClearSelection}
                            type="button"
                          >
                            Default
                          </button>
                        ) : (
                          <button
                            className="inline-flex h-8 items-center justify-center rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                            onClick={() => {
                              onSelectProfile(profile.id);
                            }}
                            type="button"
                          >
                            Use
                          </button>
                        )}
                        <button
                          className="inline-flex h-8 items-center justify-center rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
                          onClick={() => {
                            onDeleteProfile(profile.id);
                          }}
                          type="button"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>

      <section className="mt-auto border-t border-zinc-200 p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-zinc-950">Optimized Text</h2>
          <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">
            {optimizedText ? "Up to date" : "Waiting"}
          </span>
        </div>
        <p className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md border border-zinc-200 bg-white p-3 text-sm leading-6 text-zinc-700">
          {optimizedText || "Submit text to see spoken-form output from the optimization agent."}
        </p>
      </section>
    </section>
  );
}

function AudioPanel({
  job,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob | null;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  if (!job) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-950">Audio Player</h2>
        <div className="mt-5 grid h-64 place-items-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 text-center">
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
    <StreamingAudioPanel job={job} key={job.id} onPlaybackCursorChange={onPlaybackCursorChange} />
  );
}

function StreamingAudioPanel({
  job,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const canPlayCompleted = job.status === "completed";
  const canPlayArrival = job.status !== "failed";
  const [playMode, setPlayMode] = useState<AudioPlaybackMode>("arrival");
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
      <div className="mt-4 flex justify-end">
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

      <div className="mt-4">
        {isCompletedMode ? (
          <CompletedAudioPlayer
            key={`completed-${job.id}`}
            job={job}
            src={canPlayCompleted ? audioSource(job) : ""}
            onPlaybackStateChange={setIsStreamingPlaying}
            onPlaybackCursorChange={onPlaybackCursorChange}
          />
        ) : null}
        {isArrivalMode ? (
          <ArrivalAudioPlayer
            key={`arrival-${job.id}`}
            job={job}
            canPlay={canPlayArrival}
            onPlaybackStateChange={setIsStreamingPlaying}
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
  const total = Math.max(job.retries.totalSegments, job.segments?.length ?? 0, 24);
  const ready = Math.max(0, job.audioReadySegments ?? 0);
  const generating = Math.max(ready + 1, job.progress.currentSegment ?? 0);
  const visibleBlocks = Math.min(40, Math.max(16, total));

  return (
    <section className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-950">Queue & Buffer</h3>
        <p className="text-xs text-orange-700">{String(ready)} segments in buffer</p>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(20,minmax(0,1fr))] gap-1">
        {Array.from({ length: visibleBlocks }).map((_, index) => {
          const segmentIndex = queueBlockSegmentIndex(index, visibleBlocks, total);
          const blockClass = queueBlockClass(segmentIndex, ready, generating);
          return (
            <span
              aria-hidden="true"
              className={`h-5 rounded-sm ${blockClass}`}
              key={`queue-${String(index)}`}
            />
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-orange-500" />
          Buffered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-zinc-950" />
          Generating
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-zinc-300" />
          Pending
        </span>
      </div>
    </section>
  );
}

function WaveformDisplay({
  progress,
  seed,
}: Readonly<{
  progress: number;
  seed: string;
}>) {
  const bars = useMemo(() => buildWaveformBars(seed, 76), [seed]);
  const activeIndex = waveformProgressIndex(progress, bars.length);

  return (
    <div
      className="grid h-24 min-w-0 items-center gap-px rounded-md bg-white py-3"
      style={{ gridTemplateColumns: `repeat(${String(bars.length)}, minmax(0, 1fr))` }}
    >
      {bars.map((height, index) => (
        <span
          aria-hidden="true"
          className={`w-full rounded-full ${index < activeIndex ? "bg-orange-500" : "bg-zinc-300"}`}
          key={`${seed}-${String(index)}`}
          style={{ height: `${Math.round(18 + height * 58).toString()}px` }}
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

function CompletedAudioPlayer({
  job,
  src,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  src: string;
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
  const isSeekingRef = useRef(false);
  const isSeekCommitInProgressRef = useRef(false);
  const currentTimeRef = useRef(0);
  const seekSliderValueRef = useRef(0);

  useEffect(() => {
    if (!canPlayCompleted) {
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
    onPlaybackStateChange?.(false);
  }, [canPlayCompleted, onPlaybackStateChange]);

  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

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
  }, [onPlaybackCursorChange]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isSeekingRef.current || isSeekCommitInProgressRef.current) {
      return;
    }
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    currentTimeRef.current = current;
    setCurrentTimeSec(current);
    onPlaybackCursorChange?.(current);
  }, [onPlaybackCursorChange]);

  const onPlay = useCallback(() => {
    setError(null);
    setIsPlaying(true);
    onPlaybackCursorChange?.(currentTimeRef.current);
    onPlaybackStateChange?.(true);
  }, [onPlaybackCursorChange, onPlaybackStateChange]);

  const onPause = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange]);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange]);

  const onAudioError = useCallback(() => {
    const audioError = audioRef.current?.error;
    if (!audioError) {
      setError("Completed playback failed. Please retry.");
      setIsPlaying(false);
      onPlaybackStateChange?.(false);
      return;
    }

    const message = typeof audioError.message === "string" ? audioError.message : "";
    setError(message || "Completed playback failed. Please retry.");
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange]);

  const handlePlayToggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !canPlayCompleted) {
      return;
    }

    if (isPlaying) {
      audio.pause();
      return;
    }

    setError(null);
    try {
      await audio.play();
    } catch {
      setError("Browser blocked playback. Press play again.");
      setIsPlaying(false);
      onPlaybackStateChange?.(false);
    }
  }, [canPlayCompleted, isPlaying, onPlaybackStateChange]);

  const handleSeekStart = useCallback(() => {
    isSeekingRef.current = true;
    seekSliderValueRef.current = currentTimeRef.current;
  }, []);

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
    [clampSeekTarget, onPlaybackCursorChange],
  );

  const resolveSeekTarget = useCallback(
    (value?: number) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return clampSeekTarget(value);
      }
      return clampSeekTarget(seekSliderValueRef.current);
    },
    [clampSeekTarget],
  );

  const handleSeekCommit = useCallback(
    (value?: number) => {
      if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
        isSeekingRef.current = true;
        seekSliderValueRef.current = currentTimeRef.current;
      }

      if (!isSeekingRef.current) {
        return;
      }

      if (isSeekCommitInProgressRef.current) {
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
    [commitSeek, resolveSeekTarget],
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
    [clampSeekTarget, onPlaybackCursorChange],
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
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
  }, []);

  const skipBy = useCallback(
    (seconds: number) => {
      commitSeek(currentTimeRef.current + seconds);
    },
    [commitSeek],
  );

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
  }, [canPlayCompleted, src, volume]);
  const durationForSliderSec = Math.max(1, durationSec > 0 ? durationSec : durationMs / 1000);
  const sliderValue = Math.max(0, Math.min(currentTimeSec, durationForSliderSec));

  return (
    <div className="grid gap-4">
      {canPlayCompleted ? (
        <>
          <div className="grid gap-3">
            <PlayerStatusLine
              currentTimeSec={currentTimeSec}
              durationSec={durationSec > 0 ? durationSec : durationMs / 1000}
              isLive={isPlaying}
              segment={formatSegment(job)}
            />
            <WaveformDisplay
              progress={durationForSliderSec > 0 ? sliderValue / durationForSliderSec : 0}
              seed={`completed-${job.id}`}
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
            <div className="flex items-center justify-center gap-5">
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
                className="grid h-16 w-16 place-items-center rounded-full bg-orange-500 text-3xl font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
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
        </>
      ) : (
        <p className="text-sm leading-6 text-zinc-600">
          Final audio will appear after every generated segment passes voice checking.
          {job.durationMs > 0
            ? ` Current generated duration: ${formatDuration(job.durationMs)}.`
            : ""}
        </p>
      )}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {canPlayCompleted ? (
        <div className="grid grid-cols-3 gap-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
          <span>{formatDuration(durationMs)} total</span>
          <span>{formatSimilarity(job.voiceCheck.similarity)} checker</span>
          <span>{job.provider || "tts"} voice</span>
        </div>
      ) : null}
    </div>
  );
}

function ArrivalAudioPlayer({
  job,
  canPlay,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  return (
    <ArrivalAudioPlayerQueue
      job={job}
      canPlay={canPlay}
      onPlaybackStateChange={onPlaybackStateChange}
      onPlaybackCursorChange={onPlaybackCursorChange}
    />
  );
}

function ArrivalAudioPlayerQueue({
  job,
  canPlay,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
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
      if (!isIntentRef.current || !isPlaying) {
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
      isPlaying,
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
    setIsPlaying(true);
    setError(null);
    onPlaybackStateChange?.(true);
    publishCursor(cursorSecRef.current);
    scheduleFromCursor(publishCursor(cursorSecRef.current), context);
  }, [getContext, onPlaybackStateChange, publishCursor, scheduleFromCursor]);

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

  const refreshBufferedDuration = useCallback(() => {
    const duration = getSegmentTimeline().reduce(
      (total, segment) => total + segment.buffer.duration,
      0,
    );
    setBufferedDurationSec(duration);
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
          progress={sliderMax > 0 ? sliderValue / sliderMax : 0}
          seed={`arrival-${job.id}-${String(readySegments)}`}
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
        <div className="flex items-center justify-center gap-5">
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
            className="grid h-16 w-16 place-items-center rounded-full bg-orange-500 text-3xl font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:bg-orange-600"
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

function StatusBadge({ state }: Readonly<{ state: RequestState }>) {
  const labelByState: Record<RequestState, string> = {
    idle: "Ready",
    running: "Running",
    complete: "Complete",
    cancelled: "Cancelled",
    error: "Needs attention",
  };

  return (
    <span className="inline-flex shrink-0 items-center gap-2 border border-zinc-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700">
      {state === "running" ? <span className="h-2 w-2 animate-pulse bg-amber-500" /> : null}
      {labelByState[state]}
    </span>
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
