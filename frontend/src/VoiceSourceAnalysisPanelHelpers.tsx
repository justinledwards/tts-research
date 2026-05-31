import { useState, type ReactNode } from "react";
import { voiceProfileCandidatePreviewSource } from "./api";
import { formatDuration } from "./format";
import type {
  ResearchModuleDiagnostics,
  TTSEngineDiagnostics,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "./types";
import {
  candidateQualityLabel,
  formatPercent,
  summarizeCandidateMetrics,
} from "./voiceProfileSourceMetrics";

type CandidatePreviewKind = "clean" | "raw";

export function sourceStatusClass(source: VoiceProfileSource): string {
  if (source.status === "failed") {
    return "bg-[var(--vs-status-danger-bg)] text-[var(--vs-status-danger)]";
  }
  if (source.status === "cancelled") {
    return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
  }
  if (source.status === "ready") {
    return "bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]";
  }
  return "bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]";
}

export function isSetupError(
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

export function SourceAnalysisSetupCard({
  diagnostics,
  error,
}: Readonly<{
  diagnostics: VoiceProfileSourceDiagnostics | null;
  error: string | null;
}>) {
  return (
    <section className="min-w-0 rounded-lg border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-sm text-[var(--vs-status-warning)]">
      <p className="font-semibold">Speaker analysis needs local pyannote setup</p>
      <p className="mt-2 break-words text-xs leading-5 text-[var(--vs-status-warning)]">
        {diagnostics?.setupMessage ??
          "Accept pyannote Community-1 terms, download or clone the model locally, then set VOICE_PROFILE_DIARIZATION_MODEL_PATH. A token is only needed for first-time model access."}
      </p>
      {error ? (
        <p className="mt-2 break-words text-xs leading-5 text-[var(--vs-status-danger)]">{error}</p>
      ) : null}
      <dl className="mt-3 grid gap-2 rounded-md border border-[var(--vs-status-warning-border)] bg-[color-mix(in_srgb,var(--vs-surface-primary)_60%,transparent)] p-2 text-xs">
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
          className="rounded border border-[var(--vs-status-warning-border)] bg-[var(--vs-surface-primary)] px-2 py-1 text-[var(--vs-status-warning)] hover:bg-[var(--vs-status-warning-bg)]"
          href="https://huggingface.co/pyannote/speaker-diarization-community-1"
          rel="noreferrer"
          target="_blank"
        >
          Model terms
        </a>
        <a
          className="rounded border border-[var(--vs-status-warning-border)] bg-[var(--vs-surface-primary)] px-2 py-1 text-[var(--vs-status-warning)] hover:bg-[var(--vs-status-warning-bg)]"
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
      <dt className="text-[var(--vs-status-warning)]">{label}</dt>
      <dd className="min-w-0 truncate font-medium text-[var(--vs-status-warning)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

export function SourceProgress({
  isRefreshingTranscript,
  source,
  onRefreshTranscript,
}: Readonly<{
  isRefreshingTranscript: boolean;
  source: VoiceProfileSource;
  onRefreshTranscript: () => void;
}>) {
  const candidates = Array.isArray(source.candidates) ? source.candidates : [];
  const stages = Array.isArray(source.stages) ? source.stages : [];
  const readyCount = candidates.filter((candidate) => candidate.status === "ready").length;

  return (
    <section className="min-w-0 rounded-lg border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className="truncate text-sm font-semibold text-[var(--vs-text-primary)]"
            title={source.sourceFile}
          >
            {source.sourceFile}
          </p>
          <p className="mt-1 text-xs text-[var(--vs-text-muted)]">
            {formatBytes(source.sourceBytes)} ·{" "}
            {source.sourceDurationMs ? formatDuration(source.sourceDurationMs) : "duration pending"}
          </p>
        </div>
        <span className="text-xs text-[var(--vs-text-muted)]">{String(readyCount)} voices</span>
      </div>
      <p className="mt-3 break-words text-sm font-medium text-[var(--vs-text-secondary)]">
        {source.progressMessage}
      </p>
      {source.progressDetail ? (
        <p className="mt-1 break-words text-xs leading-5 text-[var(--vs-text-muted)]">
          {source.progressDetail}
        </p>
      ) : null}
      <ol className="mt-3 grid gap-2">
        {stages.map((stage) => (
          <li
            className="flex min-w-0 items-center gap-2 text-xs text-[var(--vs-text-muted)]"
            key={stage.name}
          >
            <span className={`h-2 w-2 rounded-full ${sourceStageClass(stage.status)}`} />
            <span className="shrink-0 capitalize">{stage.name}</span>
            <span className="min-w-0 truncate text-[var(--vs-text-muted)]">{stage.detail}</span>
          </li>
        ))}
      </ol>
      <TranscriptBlock
        isRefreshing={isRefreshingTranscript}
        label="Source transcript"
        transcript={source.transcript}
        transcriptError={source.transcriptError}
        transcriptGeneratedAt={source.transcriptGeneratedAt}
        transcriptModel={source.transcriptModel}
        onRefresh={onRefreshTranscript}
      />
    </section>
  );
}

function sourceStageClass(status: string): string {
  if (status === "done") {
    return "bg-[var(--vs-status-success)]";
  }
  if (status === "running") {
    return "bg-[var(--vs-status-info)]";
  }
  if (status === "failed") {
    return "bg-[var(--vs-status-danger)]";
  }
  return "bg-[var(--vs-action-disabled-bg)]";
}

export function ReadyCandidateList({
  candidateNames,
  candidates,
  createCandidateId,
  language,
  selectedTargets,
  sourceId,
  targetOptions,
  refreshingTranscriptKey,
  onCreate,
  onLanguageChange,
  onNameChange,
  onTargetToggle,
  onTranscriptRefresh,
}: Readonly<{
  candidateNames: Record<string, string>;
  candidates: VoiceProfileCandidate[];
  createCandidateId: string | null;
  language: string;
  selectedTargets: string[];
  sourceId: string;
  targetOptions: ProfileTargetOption[];
  refreshingTranscriptKey: string | null;
  onCreate: (candidate: VoiceProfileCandidate) => Promise<void>;
  onLanguageChange: (value: string) => void;
  onNameChange: (candidate: VoiceProfileCandidate, value: string) => void;
  onTargetToggle: (targetId: string) => void;
  onTranscriptRefresh: (candidate: VoiceProfileCandidate) => Promise<void>;
}>) {
  if (candidates.length === 0 || sourceId === "") {
    return null;
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--vs-text-primary)]">Detected Voices</h3>
        <span className="text-xs text-[var(--vs-text-muted)]">
          {String(candidates.length)} ready
        </span>
      </div>
      <div className="grid gap-2">
        {candidates.map((candidate) => (
          <CandidateCard
            candidate={candidate}
            createCandidateId={createCandidateId}
            key={candidate.id}
            language={language}
            name={candidateNames[candidate.id] ?? candidate.suggestedName}
            isRefreshingTranscript={refreshingTranscriptKey === `candidate:${candidate.id}`}
            selectedTargets={selectedTargets}
            sourceId={sourceId}
            targetOptions={targetOptions}
            onCreate={() => {
              void onCreate(candidate);
            }}
            onLanguageChange={onLanguageChange}
            onNameChange={(value) => {
              onNameChange(candidate, value);
            }}
            onTargetToggle={onTargetToggle}
            onTranscriptRefresh={() => {
              void onTranscriptRefresh(candidate);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function RejectedCandidateList({
  candidates,
}: Readonly<{
  candidates: VoiceProfileCandidate[];
}>) {
  if (candidates.length === 0) {
    return null;
  }

  return (
    <details className="rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-3 text-xs text-[var(--vs-text-muted)]">
      <summary className="cursor-pointer font-medium text-[var(--vs-text-secondary)]">
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
  isRefreshingTranscript,
  language,
  name,
  selectedTargets,
  sourceId,
  targetOptions,
  onCreate,
  onLanguageChange,
  onNameChange,
  onTargetToggle,
  onTranscriptRefresh,
}: Readonly<{
  candidate: VoiceProfileCandidate;
  createCandidateId: string | null;
  isRefreshingTranscript: boolean;
  language: string;
  name: string;
  selectedTargets: string[];
  sourceId: string;
  targetOptions: ProfileTargetOption[];
  onCreate: () => void;
  onLanguageChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onTargetToggle: (targetId: string) => void;
  onTranscriptRefresh: () => void;
}>) {
  const isCreating = createCandidateId === candidate.id;
  const canCreate = selectedTargets.length > 0 && !isCreating;
  const [previewKind, setPreviewKind] = useState<CandidatePreviewKind>("clean");
  return (
    <article className="grid gap-3 rounded-lg border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--vs-text-primary)]">
              {candidateQualityLabel(candidate)}
            </p>
            {candidate.recommended ? (
              <span className="rounded bg-[var(--vs-status-success-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--vs-status-success)]">
                Recommended
              </span>
            ) : null}
            {candidate.suitability === "short_reference" ? (
              <span className="rounded bg-[var(--vs-status-warning-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--vs-status-warning)]">
                Short reference
              </span>
            ) : null}
          </div>
          <p
            className="mt-1 truncate text-xs text-[var(--vs-text-muted)]"
            title={candidate.speakerId}
          >
            {candidate.rank ? `#${String(candidate.rank)} · ` : ""}
            {candidate.speakerId} · {formatDuration(candidate.referenceDurationMs)} reference
          </p>
        </div>
        <span className="rounded bg-[var(--vs-selected)] px-2 py-1 text-xs font-semibold text-[var(--vs-selected-text)]">
          {formatPercent(candidate.score)}
        </span>
      </div>
      <CandidatePreview
        candidate={candidate}
        previewKind={previewKind}
        sourceId={sourceId}
        onPreviewKindChange={setPreviewKind}
      />
      <TranscriptBlock
        isRefreshing={isRefreshingTranscript}
        label="Reference transcript"
        transcript={candidate.transcript}
        transcriptError={candidate.transcriptError}
        transcriptGeneratedAt={candidate.transcriptGeneratedAt}
        transcriptModel={candidate.transcriptModel}
        onRefresh={onTranscriptRefresh}
      />
      <p className="break-words text-xs leading-5 text-[var(--vs-text-muted)]">
        {summarizeCandidateMetrics(candidate)}
      </p>
      {candidate.denoise ? (
        <div className="grid grid-cols-2 gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-2 text-xs text-[var(--vs-text-muted)]">
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
        <ul className="grid gap-1 rounded-md bg-[var(--vs-status-warning-bg)] p-2 text-xs leading-5 text-[var(--vs-status-warning)]">
          {candidate.warnings.map((warning) => (
            <li className="break-words" key={warning}>
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2">
        <input
          className="min-w-0 rounded-md border border-[var(--vs-border-subtle)] px-3 py-2 text-sm"
          maxLength={80}
          onChange={(event) => {
            onNameChange(event.currentTarget.value);
          }}
          placeholder="Voice name"
          type="text"
          value={name}
        />
        <input
          className="rounded-md border border-[var(--vs-border-subtle)] px-3 py-2 text-sm"
          maxLength={12}
          onChange={(event) => {
            onLanguageChange(event.currentTarget.value);
          }}
          placeholder="en"
          type="text"
          value={language}
        />
      </div>
      <ProfileTargetPicker
        options={targetOptions}
        selectedTargets={selectedTargets}
        onToggle={onTargetToggle}
      />
      <button
        className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--vs-action-primary)] px-3 text-sm font-semibold text-[var(--vs-action-primary-text)] hover:bg-[var(--vs-action-primary-hover)] disabled:cursor-not-allowed disabled:bg-[var(--vs-action-disabled-bg)]"
        disabled={!canCreate}
        onClick={onCreate}
        type="button"
      >
        {isCreating ? "Creating..." : "Create Profile"}
      </button>
    </article>
  );
}

function CandidatePreview({
  candidate,
  previewKind,
  sourceId,
  onPreviewKindChange,
}: Readonly<{
  candidate: VoiceProfileCandidate;
  previewKind: CandidatePreviewKind;
  sourceId: string;
  onPreviewKindChange: (kind: CandidatePreviewKind) => void;
}>) {
  const previewSource = voiceProfileCandidatePreviewSource(sourceId, candidate.id, previewKind);
  const hasRawPreview = Boolean(candidate.rawPreviewAudio);
  const denoiseLabel = candidate.denoise?.applied
    ? `${candidate.denoise.provider} ${candidate.denoise.strength}`
    : "raw normalized";
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] px-2 py-2 text-xs text-[var(--vs-text-muted)]">
        <span className="min-w-0 truncate" title={candidate.denoise?.reason ?? denoiseLabel}>
          Preview: {previewKind === "clean" ? "Cleaned" : "Raw"} · {denoiseLabel}
        </span>
        <div className="inline-flex overflow-hidden rounded border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)]">
          {(["clean", "raw"] as const).map((kind) => (
            <button
              className={`px-2 py-1 font-semibold ${
                previewKind === kind
                  ? "bg-[var(--vs-selected)] text-[var(--vs-selected-text)]"
                  : "text-[var(--vs-text-muted)]"
              }`}
              disabled={kind === "raw" && !hasRawPreview}
              key={kind}
              onClick={() => {
                onPreviewKindChange(kind);
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
    </>
  );
}

function TranscriptBlock({
  isRefreshing,
  label,
  transcript,
  transcriptError,
  transcriptGeneratedAt,
  transcriptModel,
  onRefresh,
}: Readonly<{
  isRefreshing: boolean;
  label: string;
  transcript?: string;
  transcriptError?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  onRefresh: () => void;
}>) {
  const generatedLabel = formatTranscriptTimestamp(transcriptGeneratedAt);
  let transcriptBody: ReactNode = null;
  if (transcript) {
    transcriptBody = (
      <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded bg-[var(--vs-surface-secondary)] p-2 leading-5 text-[var(--vs-text-secondary)]">
        {transcript}
      </p>
    );
  } else if (!transcriptError) {
    transcriptBody = (
      <p className="rounded bg-[var(--vs-surface-secondary)] p-2 leading-5 text-[var(--vs-text-muted)]">
        Transcript pending.
      </p>
    );
  }
  return (
    <section className="grid gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] p-2 text-xs">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--vs-text-secondary)]">{label}</p>
          <p className="mt-0.5 truncate text-[11px] text-[var(--vs-text-muted)]">
            {[transcriptModel, generatedLabel].filter(Boolean).join(" · ") || "Pending"}
          </p>
        </div>
        <button
          className="shrink-0 rounded border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] px-2 py-1 font-semibold text-[var(--vs-text-secondary)] hover:bg-[var(--vs-action-secondary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isRefreshing}
          onClick={onRefresh}
          type="button"
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>
      {transcriptError ? (
        <p className="break-words rounded bg-[var(--vs-status-danger-bg)] p-2 leading-5 text-[var(--vs-status-danger)]">
          {transcriptError}
        </p>
      ) : null}
      {transcriptBody}
    </section>
  );
}

function formatTranscriptTimestamp(value?: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString();
}

export interface ProfileTargetOption {
  id: string;
  label: string;
  available: boolean;
  detail: string;
}

function ProfileTargetPicker({
  options,
  selectedTargets,
  onToggle,
}: Readonly<{
  options: ProfileTargetOption[];
  selectedTargets: string[];
  onToggle: (targetId: string) => void;
}>) {
  return (
    <div className="grid gap-2 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--vs-text-secondary)]">Prepare for</p>
        <span className="text-[11px] text-[var(--vs-text-muted)]">
          {String(selectedTargets.length)} selected
        </span>
      </div>
      <div className="grid gap-2">
        {options.map((option) => {
          const selected = selectedTargets.includes(option.id);
          return (
            <label
              className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border px-2 py-2 text-xs ${
                option.available
                  ? "cursor-pointer border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] text-[var(--vs-text-secondary)]"
                  : "border-[var(--vs-border-subtle)] bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]"
              }`}
              key={option.id}
            >
              <input
                checked={selected}
                className="mt-0.5"
                disabled={!option.available}
                onChange={() => {
                  onToggle(option.id);
                }}
                type="checkbox"
              />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-[var(--vs-text-primary)]">
                  {option.label}
                </span>
                <span className="mt-0.5 block truncate" title={option.detail}>
                  {option.detail}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {selectedTargets.length === 0 ? (
        <p className="text-xs leading-5 text-[var(--vs-status-danger)]">
          Select at least one backend target.
        </p>
      ) : null}
    </div>
  );
}

export function voiceProfileTargetOptions(
  modules: ResearchModuleDiagnostics[],
  engines: TTSEngineDiagnostics[],
): ProfileTargetOption[] {
  const engineStatus = (engineId: string) => engines.find((engine) => engine.id === engineId);
  const moduleStatus = (moduleId: string) => modules.find((module) => module.id === moduleId);
  const kokoroClone = engineStatus("kokoro-clone");
  const kokoroCloneReady = engines.length === 0 || kokoroClone?.status === "ready";
  const kokoroEmbed = moduleStatus("kokoro-embed");
  const kokoroEmbedEngine = engineStatus("kokoro-embed");
  const supertonicEmbed = moduleStatus("supertonic-embed");
  const supertonicEngine = engineStatus("supertonic-3");
  const kokoroEmbedDetail = embedTargetDetail(
    kokoroEmbed,
    kokoroEmbedEngine,
    "Builds optimized Kokoro style, then validates it.",
    "Builds the style artifact; rendering waits for Kokoro Embed setup.",
    "Clone kokoro.embed in Research Modules.",
  );
  const supertonicEmbedDetail = embedTargetDetail(
    supertonicEmbed,
    supertonicEngine,
    "Builds a Supertonic style artifact, then validates it.",
    "Builds the style artifact; rendering waits for Supertonic setup.",
    "Clone supertonic.embed in Research Modules.",
  );
  return [
    {
      id: "kokoro-clone",
      label: "Kokoro Clone",
      available: kokoroCloneReady,
      detail: kokoroCloneReady
        ? "Available now; validates likeness after creation."
        : (kokoroClone?.reason ?? "Kokoro Clone engine is not ready."),
    },
    {
      id: "kokoro-embed",
      label: "Kokoro Embed",
      available: researchModuleBuildReady(kokoroEmbed),
      detail: kokoroEmbedDetail,
    },
    {
      id: "supertonic-embed",
      label: "Supertonic Embed",
      available: researchModuleBuildReady(supertonicEmbed),
      detail: supertonicEmbedDetail,
    },
  ];
}

function embedTargetDetail(
  module: ResearchModuleDiagnostics | undefined,
  engine: TTSEngineDiagnostics | undefined,
  readyMessage: string,
  waitingMessage: string,
  setupMessage: string,
): string {
  if (!module?.installed) {
    return module?.setup ?? module?.reason ?? setupMessage;
  }
  if (!researchModuleBuildReady(module)) {
    return (
      module.reason ??
      module.setup ??
      "Voice Embed runtime setup is needed before building this target."
    );
  }
  if (!engine || engine.status === "ready") {
    return readyMessage;
  }
  return waitingMessage;
}

function researchModuleBuildReady(module: ResearchModuleDiagnostics | undefined): boolean {
  if (!module?.installed) {
    return false;
  }
  return module.runtimeReady ?? module.status === "ready";
}

function MetricPill({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-[var(--vs-text-muted)]">{label}</p>
      <p className="truncate font-semibold text-[var(--vs-text-secondary)]" title={value}>
        {value}
      </p>
    </div>
  );
}

export function formatBytes(value: number): string {
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
