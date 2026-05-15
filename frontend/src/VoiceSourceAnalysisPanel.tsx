import { useCallback, useMemo, useState, type ReactNode } from "react";
import { voiceProfileCandidatePreviewSource } from "./api";
import { formatDuration } from "./format";
import type {
  CreateVoiceProfileFromCandidateRequest,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "./types";
import {
  candidateQualityLabel,
  formatPercent,
  summarizeCandidateMetrics,
} from "./voiceProfileSourceMetrics";

export function VoiceSourceAnalysisPanel({
  createCandidateId,
  diagnostics,
  error,
  isAnalyzing,
  source,
  onAnalyze,
  onCreateProfile,
}: Readonly<{
  createCandidateId: string | null;
  diagnostics: VoiceProfileSourceDiagnostics | null;
  error: string | null;
  isAnalyzing: boolean;
  source: VoiceProfileSource | null;
  onAnalyze: (file: File) => Promise<void>;
  onCreateProfile: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("en");
  const [candidateNames, setCandidateNames] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = localError ?? error;
  const readyCandidates = useMemo(
    () => (source?.candidates ?? []).filter((candidate) => candidate.status === "ready"),
    [source?.candidates],
  );
  const rejectedCandidates = useMemo(
    () => (source?.candidates ?? []).filter((candidate) => candidate.status !== "ready"),
    [source?.candidates],
  );

  const handleAnalyze = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!file) {
        setLocalError("Choose an audio or video source first.");
        return;
      }
      setLocalError(null);
      await onAnalyze(file);
    },
    [file, onAnalyze],
  );

  let sourceNotice: ReactNode = null;
  if (isSetupError(displayError, diagnostics)) {
    sourceNotice = <SourceAnalysisSetupCard diagnostics={diagnostics} error={displayError} />;
  } else if (displayError) {
    sourceNotice = <p className="break-words text-sm leading-5 text-red-700">{displayError}</p>;
  }

  const handleCreate = useCallback(
    async (candidate: VoiceProfileCandidate) => {
      const fallbackName = candidate.suggestedName || candidate.speakerId || "Custom voice";
      await onCreateProfile(candidate, {
        name: (candidateNames[candidate.id] ?? fallbackName).trim() || fallbackName,
        language: language.trim() || "en",
      });
    },
    [candidateNames, language, onCreateProfile],
  );

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">Reference / Source Media</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Review detected voices before creating profiles.
          </p>
        </div>
        {source ? (
          <span className={`rounded px-2 py-1 text-xs font-medium ${sourceStatusClass(source)}`}>
            {source.status}
          </span>
        ) : null}
      </div>

      <form
        className="grid min-w-0 gap-3 rounded-lg border border-dashed border-zinc-300 bg-white p-4"
        onSubmit={(event) => {
          void handleAnalyze(event);
        }}
      >
        <input
          accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.mp4,.mov"
          className="sr-only"
          id="voice-source-file-input"
          onChange={(event) => {
            const selected = event.currentTarget.files;
            setFile(selected && selected.length > 0 ? selected[0] : null);
            setLocalError(null);
          }}
          type="file"
        />
        <label
          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50"
          htmlFor="voice-source-file-input"
        >
          {file ? "Replace Source" : "Browse Source"}
        </label>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
          <span className="min-w-0 truncate" title={file?.name ?? "Audio/video source"}>
            {file?.name ?? "Audio/video source"}
          </span>
          <span className="shrink-0 whitespace-nowrap text-zinc-500">
            {file ? formatBytes(file.size) : "No file selected"}
          </span>
        </div>
        <p className="-mt-1 min-w-0 text-xs leading-5 text-zinc-500">
          Local uploads are limited by available disk/runtime, not a fixed app cap.
        </p>
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={!file || isAnalyzing}
          type="submit"
        >
          {isAnalyzing ? "Analyzing..." : "Analyze Voices"}
        </button>
      </form>

      {source ? <SourceProgress source={source} /> : null}
      {sourceNotice}

      <ReadyCandidateList
        candidateNames={candidateNames}
        candidates={source?.status === "ready" ? readyCandidates : []}
        createCandidateId={createCandidateId}
        language={language}
        sourceId={source?.id ?? ""}
        onCreate={handleCreate}
        onLanguageChange={setLanguage}
        onNameChange={(candidate, value) => {
          setCandidateNames((current) => ({ ...current, [candidate.id]: value }));
        }}
      />
      <RejectedCandidateList candidates={rejectedCandidates} />
    </section>
  );
}

function sourceStatusClass(source: VoiceProfileSource): string {
  if (source.status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (source.status === "ready") {
    return "bg-emerald-100 text-emerald-700";
  }
  return "bg-blue-100 text-blue-700";
}

function isSetupError(
  error: string | null,
  diagnostics: VoiceProfileSourceDiagnostics | null,
): boolean {
  if (diagnostics?.mode === "unconfigured") {
    return true;
  }
  if (!error) {
    return false;
  }
  return (
    error.includes("PYANNOTE_AUTH_TOKEN") ||
    error.includes("HF_TOKEN") ||
    error.includes("VOICE_PROFILE_DIARIZATION_MODEL_PATH")
  );
}

function SourceAnalysisSetupCard({
  diagnostics,
  error,
}: Readonly<{
  diagnostics: VoiceProfileSourceDiagnostics | null;
  error: string | null;
}>) {
  return (
    <section className="min-w-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-semibold">Speaker analysis needs local pyannote setup</p>
      <p className="mt-2 break-words text-xs leading-5 text-amber-900">
        {diagnostics?.setupMessage ??
          "Accept pyannote Community-1 terms, download or clone the model locally, then set VOICE_PROFILE_DIARIZATION_MODEL_PATH. A token is only needed for first-time model access."}
      </p>
      {error ? <p className="mt-2 break-words text-xs leading-5 text-red-800">{error}</p> : null}
      <dl className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-white/60 p-2 text-xs">
        <SetupLine label="Mode" value={diagnostics?.mode ?? "unconfigured"} />
        <SetupLine
          label="Model"
          value={diagnostics?.model ?? "pyannote/speaker-diarization-community-1"}
        />
        <SetupLine
          label="Local model"
          value={diagnostics?.localModelAvailable ? "available" : "not found"}
        />
        <SetupLine label="Python" value={diagnostics?.pythonPath ?? "pending"} />
        <SetupLine label="ffmpeg" value={diagnostics?.ffmpegAvailable ? "available" : "missing"} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        <a
          className="rounded border border-amber-300 bg-white px-2 py-1 text-amber-900 hover:bg-amber-100"
          href="https://huggingface.co/pyannote/speaker-diarization-community-1"
          rel="noreferrer"
          target="_blank"
        >
          Model terms
        </a>
        <a
          className="rounded border border-amber-300 bg-white px-2 py-1 text-amber-900 hover:bg-amber-100"
          href="https://github.com/pyannote/pyannote-audio/releases"
          rel="noreferrer"
          target="_blank"
        >
          Offline notes
        </a>
      </div>
    </section>
  );
}

function SetupLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] gap-2">
      <dt className="text-amber-800">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-amber-950" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SourceProgress({ source }: Readonly<{ source: VoiceProfileSource }>) {
  const candidates = Array.isArray(source.candidates) ? source.candidates : [];
  const stages = Array.isArray(source.stages) ? source.stages : [];
  const readyCount = candidates.filter((candidate) => candidate.status === "ready").length;

  return (
    <section className="min-w-0 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-950" title={source.sourceFile}>
            {source.sourceFile}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {formatBytes(source.sourceBytes)} ·{" "}
            {source.sourceDurationMs ? formatDuration(source.sourceDurationMs) : "duration pending"}
          </p>
        </div>
        <span className="text-xs text-zinc-500">{String(readyCount)} voices</span>
      </div>
      <p className="mt-3 break-words text-sm font-medium text-zinc-800">{source.progressMessage}</p>
      {source.progressDetail ? (
        <p className="mt-1 break-words text-xs leading-5 text-zinc-500">{source.progressDetail}</p>
      ) : null}
      <ol className="mt-3 grid gap-2">
        {stages.map((stage) => (
          <li className="flex min-w-0 items-center gap-2 text-xs text-zinc-600" key={stage.name}>
            <span className={`h-2 w-2 rounded-full ${sourceStageClass(stage.status)}`} />
            <span className="shrink-0 capitalize">{stage.name}</span>
            <span className="min-w-0 truncate text-zinc-400">{stage.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function sourceStageClass(status: string): string {
  if (status === "done") {
    return "bg-emerald-500";
  }
  if (status === "running") {
    return "bg-blue-500";
  }
  if (status === "failed") {
    return "bg-red-500";
  }
  return "bg-zinc-300";
}

function ReadyCandidateList({
  candidateNames,
  candidates,
  createCandidateId,
  language,
  sourceId,
  onCreate,
  onLanguageChange,
  onNameChange,
}: Readonly<{
  candidateNames: Record<string, string>;
  candidates: VoiceProfileCandidate[];
  createCandidateId: string | null;
  language: string;
  sourceId: string;
  onCreate: (candidate: VoiceProfileCandidate) => Promise<void>;
  onLanguageChange: (value: string) => void;
  onNameChange: (candidate: VoiceProfileCandidate, value: string) => void;
}>) {
  if (candidates.length === 0 || sourceId === "") {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-950">Detected Voices</h3>
        <span className="text-xs text-zinc-500">{String(candidates.length)} ready</span>
      </div>
      <div className="grid gap-2">
        {candidates.map((candidate) => (
          <CandidateCard
            candidate={candidate}
            createCandidateId={createCandidateId}
            key={candidate.id}
            language={language}
            name={candidateNames[candidate.id] ?? candidate.suggestedName}
            sourceId={sourceId}
            onCreate={() => {
              void onCreate(candidate);
            }}
            onLanguageChange={onLanguageChange}
            onNameChange={(value) => {
              onNameChange(candidate, value);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RejectedCandidateList({
  candidates,
}: Readonly<{
  candidates: VoiceProfileCandidate[];
}>) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
      <summary className="cursor-pointer font-medium text-zinc-700">
        {String(candidates.length)} rejected candidate{candidates.length === 1 ? "" : "s"}
      </summary>
      <ul className="mt-2 grid gap-1">
        {candidates.map((candidate) => (
          <li className="break-words" key={candidate.id}>
            {candidate.speakerId}: {candidate.reason ?? "Not enough clean speech"}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CandidateCard({
  candidate,
  createCandidateId,
  language,
  name,
  sourceId,
  onCreate,
  onLanguageChange,
  onNameChange,
}: Readonly<{
  candidate: VoiceProfileCandidate;
  createCandidateId: string | null;
  language: string;
  name: string;
  sourceId: string;
  onCreate: () => void;
  onLanguageChange: (value: string) => void;
  onNameChange: (value: string) => void;
}>) {
  const isCreating = createCandidateId === candidate.id;
  const [previewKind, setPreviewKind] = useState<"clean" | "raw">("clean");
  const previewSource = voiceProfileCandidatePreviewSource(sourceId, candidate.id, previewKind);
  const hasRawPreview = Boolean(candidate.rawPreviewAudio);
  const denoiseLabel = candidate.denoise?.applied
    ? `${candidate.denoise.provider} ${candidate.denoise.strength}`
    : "raw normalized";
  return (
    <article className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="font-semibold text-zinc-950">{candidateQualityLabel(candidate)}</p>
            {candidate.recommended ? (
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                Recommended
              </span>
            ) : null}
            {candidate.suitability === "short_reference" ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                Short reference
              </span>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-zinc-500" title={candidate.speakerId}>
            {candidate.rank ? `#${String(candidate.rank)} · ` : ""}
            {candidate.speakerId} · {formatDuration(candidate.referenceDurationMs)} reference
          </p>
        </div>
        <span className="rounded bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
          {formatPercent(candidate.score)}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-xs text-zinc-600">
        <span className="min-w-0 truncate" title={candidate.denoise?.reason ?? denoiseLabel}>
          Preview: {previewKind === "clean" ? "Cleaned" : "Raw"} · {denoiseLabel}
        </span>
        <div className="inline-flex overflow-hidden rounded border border-zinc-200 bg-white">
          {(["clean", "raw"] as const).map((kind) => (
            <button
              className={`px-2 py-1 font-semibold ${
                previewKind === kind ? "bg-orange-50 text-orange-700" : "text-zinc-500"
              }`}
              disabled={kind === "raw" && !hasRawPreview}
              key={kind}
              onClick={() => {
                setPreviewKind(kind);
              }}
              type="button"
            >
              {kind}
            </button>
          ))}
        </div>
      </div>
      <audio className="h-9 w-full" controls preload="none" src={previewSource}>
        <track kind="captions" />
      </audio>
      <p className="break-words text-xs leading-5 text-zinc-500">
        {summarizeCandidateMetrics(candidate)}
      </p>
      {candidate.denoise ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
          <MetricPill
            label="Noise before"
            value={formatPercent(
              candidate.denoise.noiseRiskBefore ?? candidate.qualityMetrics.noiseRisk,
            )}
          />
          <MetricPill
            label="Noise after"
            value={formatPercent(
              candidate.denoise.noiseRiskAfter ?? candidate.qualityMetrics.noiseRisk,
            )}
          />
          <MetricPill
            label="Spans"
            value={String(candidate.referenceSpanCount ?? candidate.spans.length)}
          />
          <MetricPill label="SNR" value={`${(candidate.denoise.snrAfterDb ?? 0).toFixed(1)} dB`} />
        </div>
      ) : null}
      {candidate.warnings && candidate.warnings.length > 0 ? (
        <ul className="grid gap-1 rounded-md bg-amber-50 p-2 text-xs leading-5 text-amber-800">
          {candidate.warnings.map((warning) => (
            <li className="break-words" key={warning}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
        <input
          className="min-w-0 rounded-md border border-zinc-200 px-3 py-2 text-sm"
          maxLength={80}
          onChange={(event) => {
            onNameChange(event.currentTarget.value);
          }}
          placeholder="Voice name"
          type="text"
          value={name}
        />
        <input
          className="rounded-md border border-zinc-200 px-3 py-2 text-sm"
          maxLength={12}
          onChange={(event) => {
            onLanguageChange(event.currentTarget.value);
          }}
          placeholder="en"
          type="text"
          value={language}
        />
      </div>
      <button
        className="inline-flex h-9 items-center justify-center rounded-md bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
        disabled={isCreating}
        onClick={onCreate}
        type="button"
      >
        {isCreating ? "Creating..." : "Create Profile"}
      </button>
    </article>
  );
}

function MetricPill({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-zinc-400">{label}</p>
      <p className="truncate font-semibold text-zinc-800" title={value}>
        {value}
      </p>
    </div>
  );
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
