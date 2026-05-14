import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { audioSource, createVoiceJob, listVoices, subscribeToVoiceJob, uploadVoice } from "./api";
import { formatDuration } from "./format";
import type { StageStatus, Voice, VoiceJob } from "./types";

const sampleText =
  'CPU usage is 92%, memory equals 4GB, and request latency is p95 = 280ms. ```go\nfmt.Println("hello")\n```';

type RequestState = "idle" | "running" | "complete" | "error";
type UploadState = "idle" | "uploading" | "error";

export function App() {
  const [text, setText] = useState(sampleText);
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [voiceName, setVoiceName] = useState("");
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isProcessing = requestState === "running";
  const isUploading = uploadState === "uploading";
  const canSubmit = useMemo(() => text.trim().length > 0 && !isProcessing, [text, isProcessing]);
  const canUploadVoice = useMemo(
    () => voiceFile !== null && !isUploading,
    [voiceFile, isUploading],
  );
  const audioJob = job?.audioUrl ? job : null;
  const activeJobId = job && job.status !== "completed" && job.status !== "failed" ? job.id : null;

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
      },
      (caughtError) => {
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

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    void submitVoiceJob();
  }

  const refreshVoices = useCallback(async () => {
    try {
      const nextVoices = await listVoices();
      setVoices(nextVoices);
    } catch (caughtError) {
      setVoiceError(caughtError instanceof Error ? caughtError.message : "Unable to load voices");
    }
  }, []);

  useEffect(() => {
    void refreshVoices();
  }, [refreshVoices]);

  useEffect(() => {
    if (selectedVoiceId || voices.length === 0) {
      return;
    }

    setSelectedVoiceId(voices[0]?.id ?? "");
  }, [selectedVoiceId, voices]);

  async function submitVoiceJob() {
    setRequestState("running");
    setError(null);

    try {
      const nextJob = await createVoiceJob({ text, voiceId: selectedVoiceId || undefined });
      setJob(nextJob);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
    } catch (caughtError) {
      setRequestState("error");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create voice job");
    }
  }

  async function submitVoiceUpload(file: File) {
    setUploadState("uploading");
    setVoiceError(null);

    try {
      const uploadedVoice = await uploadVoice(voiceName, file);
      const nextVoices = await listVoices();
      setVoices(nextVoices);
      setSelectedVoiceId(uploadedVoice.id);
      setVoiceName("");
      setVoiceFile(null);
      setUploadState("idle");
    } catch (caughtError) {
      setUploadState("error");
      setVoiceError(caughtError instanceof Error ? caughtError.message : "Unable to upload voice");
    }
  }

  return (
    <main className="min-h-screen bg-stone-50 text-zinc-950">
      <section className="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-0 px-5 py-6 md:grid-cols-[minmax(0,1fr)_380px] md:px-8 lg:px-10">
        <div className="flex min-h-[calc(100vh-3rem)] flex-col justify-between border-zinc-200 md:border-r md:pr-8">
          <header className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                TTS Research
              </p>
              <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-normal text-zinc-950 md:text-5xl">
                Convert dense text into checked audio.
              </h1>
            </div>
            <StatusBadge state={requestState} />
          </header>

          <form className="grid flex-1 gap-5 py-6" onSubmit={handleSubmit}>
            <label className="flex min-h-[320px] flex-col gap-3">
              <span className="text-sm font-medium text-zinc-700">Source text</span>
              <textarea
                className="min-h-[320px] flex-1 resize-none border border-zinc-300 bg-white p-4 font-mono text-sm leading-6 text-zinc-900 outline-none transition read-only:bg-zinc-100 read-only:text-zinc-600 focus:border-zinc-950 focus:ring-2 focus:ring-emerald-500/20"
                value={text}
                onChange={(event) => {
                  if (!isProcessing) {
                    setText(event.target.value);
                  }
                }}
                readOnly={isProcessing}
                spellCheck={false}
              />
            </label>

            <section className="grid items-start gap-4 border-t border-zinc-200 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
              <label className="grid gap-2 self-start">
                <span className="text-sm font-medium text-zinc-700">Voice</span>
                <select
                  className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-emerald-500/20"
                  disabled={isProcessing || voices.length === 0}
                  onChange={(event) => {
                    setSelectedVoiceId(event.target.value);
                  }}
                  value={selectedVoiceId}
                >
                  {voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.kind === "clone" ? "Clone" : "Kokoro"}: {voice.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3">
                <div className="grid gap-2">
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-zinc-700">Clone name</span>
                    <input
                      className="min-h-11 border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-emerald-500/20"
                      onChange={(event) => {
                        setVoiceName(event.target.value);
                      }}
                      placeholder="Reference voice"
                      type="text"
                      value={voiceName}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-medium text-zinc-700">Audio or video</span>
                    <input
                      accept="audio/*,video/*"
                      className="min-h-11 border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none file:mr-3 file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                      onChange={(event) => {
                        setVoiceFile(event.target.files?.[0] ?? null);
                      }}
                      type="file"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs leading-5 text-zinc-500">
                    Upload a short clip; video files are converted to a mono WAV reference.
                  </p>
                  <button
                    className="inline-flex min-h-10 shrink-0 items-center justify-center border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-400"
                    disabled={!canUploadVoice}
                    onClick={() => {
                      if (voiceFile) {
                        void submitVoiceUpload(voiceFile);
                      }
                    }}
                    type="button"
                  >
                    {isUploading ? "Adding..." : "Add clone"}
                  </button>
                </div>
                {voiceError ? <p className="text-sm leading-6 text-red-700">{voiceError}</p> : null}
              </div>
            </section>

            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-zinc-600">
                {text.trim().length.toLocaleString()} characters queued for optimization.
              </div>
              <button
                className="inline-flex min-h-11 items-center justify-center bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
                disabled={!canSubmit}
                type="submit"
              >
                {requestState === "running" ? "Creating audio..." : "Create checked audio"}
              </button>
            </div>
          </form>
        </div>

        <aside className="flex flex-col gap-6 pt-6 md:pl-8 md:pt-0">
          <section className="border-b border-zinc-200 pb-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Pipeline
            </h2>
            <ol className="mt-4 grid gap-3 text-sm">
              <PipelineStep
                label="Voice optimization"
                status={job?.stages.optimization ?? "waiting"}
              />
              <PipelineStep label="TTS synthesis" status={job?.stages.synthesis ?? "waiting"} />
              <PipelineStep label="Voice checker" status={job?.stages.checker ?? "waiting"} />
            </ol>
          </section>

          {job?.progress.message ? <ProgressPanel job={job} now={now} /> : null}

          {error ? (
            <section className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </section>
          ) : null}

          <section className="grid gap-3 border-b border-zinc-200 pb-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Optimized text
            </h2>
            <p className="min-h-28 whitespace-pre-wrap text-sm leading-6 text-zinc-800">
              {job?.optimizedText ??
                "Submit text to see the spoken-form output from the optimization agent."}
            </p>
          </section>

          <section className="grid gap-4 border-b border-zinc-200 pb-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Audio
            </h2>
            <AudioPanel audioJob={audioJob} job={job} />
          </section>

          <section className="grid gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
              Checker result
            </h2>
            <p className="text-sm leading-6 text-zinc-700">
              {job?.voiceCheck.reason ??
                "The checker transcript and retry decision will appear after synthesis."}
            </p>
            {job?.voiceCheck.transcript ? (
              <p className="text-xs leading-5 text-zinc-500">{job.voiceCheck.transcript}</p>
            ) : null}
          </section>
        </aside>
      </section>
    </main>
  );
}

function AudioPanel({
  audioJob,
  job,
}: Readonly<{ audioJob: VoiceJob | null; job: VoiceJob | null }>) {
  if (audioJob) {
    return (
      <>
        <ProgressiveAudio job={audioJob} />
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Duration" value={formatDuration(audioJob.durationMs)} />
          <Metric label="Attempts" value={formatAttempts(audioJob)} />
          <Metric label="Ready" value={formatReadySegments(audioJob)} />
          <Metric label="Optimizer" value={audioJob.optimizer} />
          <Metric label="TTS" value={audioJob.provider} />
          <Metric label="Voice" value={audioJob.voice} />
          <Metric label="Workers" value={formatWorkers(audioJob)} />
          <Metric label="ASR" value={audioJob.voiceCheck.provider || "waiting"} />
          <Metric label="Similarity" value={formatSimilarity(audioJob.voiceCheck.similarity)} />
          {audioJob.audioPath ? <Metric label="Saved" value={audioJob.audioPath} /> : null}
        </dl>
        {audioJob.status === "completed" ? null : (
          <p className="text-sm leading-6 text-zinc-600">
            Playback uses the verified contiguous segments that are ready so far.
          </p>
        )}
      </>
    );
  }

  if (job && job.status !== "failed") {
    const currentDuration =
      job.durationMs > 0 ? ` Current generated duration: ${formatDuration(job.durationMs)}.` : "";

    return (
      <p className="text-sm leading-6 text-zinc-600">
        Final audio will appear after every generated segment passes voice checking.
        {currentDuration}
      </p>
    );
  }

  return <p className="text-sm text-zinc-600">No audio generated yet.</p>;
}

function ProgressiveAudio({ job }: Readonly<{ job: VoiceJob }>) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [source, setSource] = useState(() => audioSource(job));
  const restoreTimeRef = useRef(0);
  const shouldResumeRef = useRef(false);

  useEffect(() => {
    const nextSource = audioSource(job);
    const audio = audioRef.current;
    restoreTimeRef.current = audio?.currentTime ?? 0;
    shouldResumeRef.current = audio ? !audio.paused && !audio.ended : false;
    setSource(nextSource);
  }, [job]);

  return (
    <audio
      className="w-full"
      controls
      onLoadedMetadata={() => {
        const audio = audioRef.current;
        if (!audio) {
          return;
        }
        if (restoreTimeRef.current > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(restoreTimeRef.current, Math.max(audio.duration - 0.25, 0));
        }
        if (shouldResumeRef.current) {
          void audio.play().catch(() => false);
        }
      }}
      ref={audioRef}
      src={source}
    >
      <track kind="captions" />
    </audio>
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
        <Metric label="Ready" value={formatReadySegments(job)} />
        <Metric label="Workers" value={formatWorkers(job)} />
      </dl>
    </section>
  );
}

function StatusBadge({ state }: Readonly<{ state: RequestState }>) {
  const labelByState: Record<RequestState, string> = {
    idle: "Ready",
    running: "Running",
    complete: "Complete",
    error: "Needs attention",
  };

  return (
    <span className="inline-flex shrink-0 items-center gap-2 border border-zinc-300 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-700">
      {state === "running" ? <span className="h-2 w-2 animate-pulse bg-amber-500" /> : null}
      {labelByState[state]}
    </span>
  );
}

function PipelineStep({ label, status }: Readonly<{ label: string; status: StageStatus }>) {
  const classByStatus: Record<StageStatus, string> = {
    waiting: "text-zinc-400",
    running: "text-amber-700",
    done: "text-emerald-700",
    failed: "text-red-700",
  };

  return (
    <li className="flex items-center justify-between gap-4 border-l-2 border-zinc-200 pl-3">
      <span className="text-zinc-800">{label}</span>
      <span className={`inline-flex items-center gap-2 ${classByStatus[status]}`}>
        {status === "running" ? <span className="h-2 w-2 animate-pulse bg-current" /> : null}
        {status}
      </span>
    </li>
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

function formatAttempts(job: VoiceJob): string {
  if (job.retries.segmentAttempts > 0) {
    return `${String(job.retries.attempts)} total, ${String(job.retries.segmentAttempts)}/${String(job.retries.maxRetries)} current`;
  }

  return `${String(job.retries.attempts)} total`;
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

function formatReadySegments(job: VoiceJob): string {
  const ready = job.retries.completedSegments;
  const total =
    job.retries.totalSegments > 0 ? job.retries.totalSegments : (job.progress.totalSegments ?? 0);
  if (ready > 0 && total > 0) {
    return `${String(ready)}/${String(total)}`;
  }

  return formatSegment(job);
}

function formatWorkers(job: VoiceJob): string {
  if (job.retries.workerCount > 0) {
    return String(job.retries.workerCount);
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
