import { useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  CreateVoiceProfileFromCandidateRequest,
  CreateVoiceProfileSourceRequest,
  ResearchModuleDiagnostics,
  TTSEngineDiagnostics,
  VoiceProfileCandidate,
  VoiceProfileProvenance,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "./types";
import {
  isSetupError,
  formatBytes,
  ReadyCandidateList,
  RejectedCandidateList,
  SourceAnalysisSetupCard,
  SourceProgress,
  sourceStatusClass,
  voiceProfileTargetOptions,
} from "./VoiceSourceAnalysisPanelHelpers";

export function VoiceSourceAnalysisPanel({
  createCandidateId,
  diagnostics,
  error,
  isAnalyzing,
  refreshingTranscriptKey,
  source,
  onAnalyze,
  onCreateProfile,
  onRefreshCandidateTranscript,
  onRefreshSourceTranscript,
  researchModules,
  ttsEngines,
}: Readonly<{
  createCandidateId: string | null;
  diagnostics: VoiceProfileSourceDiagnostics | null;
  error: string | null;
  isAnalyzing: boolean;
  refreshingTranscriptKey: string | null;
  researchModules: ResearchModuleDiagnostics[];
  source: VoiceProfileSource | null;
  ttsEngines: TTSEngineDiagnostics[];
  onAnalyze: (request: CreateVoiceProfileSourceRequest) => Promise<void>;
  onCreateProfile: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onRefreshCandidateTranscript: (candidate: VoiceProfileCandidate) => Promise<void>;
  onRefreshSourceTranscript: (sourceId: string) => Promise<void>;
}>) {
  const [file, setFile] = useState<File | null>(null);
  const [provenance, setProvenance] = useState<VoiceProfileProvenance>(
    defaultVoiceProfileProvenance,
  );
  const [language, setLanguage] = useState("en");
  const [candidateNames, setCandidateNames] = useState<Record<string, string>>({});
  const [selectedTargets, setSelectedTargets] = useState<string[]>(["kokoro-clone"]);
  const [localError, setLocalError] = useState<string | null>(null);
  const displayError = localError ?? error;
  const targetOptions = useMemo(
    () => voiceProfileTargetOptions(researchModules, ttsEngines),
    [researchModules, ttsEngines],
  );
  const readyCandidates = useMemo(
    () => (source?.candidates ?? []).filter((candidate) => candidate.status === "ready"),
    [source?.candidates],
  );
  const rejectedCandidates = useMemo(
    () => (source?.candidates ?? []).filter((candidate) => candidate.status !== "ready"),
    [source?.candidates],
  );
  const analyzeDisabledReason = voiceSourceIntakeDisabledReason(file, provenance, isAnalyzing);

  const handleAnalyze = useCallback(
    async (event: React.SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      const disabledReason = voiceSourceIntakeDisabledReason(file, provenance, isAnalyzing);
      if (disabledReason || !file) {
        setLocalError(disabledReason ?? "Choose an audio or video source first.");
        return;
      }
      setLocalError(null);
      await onAnalyze({ file, provenance: normalizedVoiceProfileProvenance(provenance) });
    },
    [file, isAnalyzing, onAnalyze, provenance],
  );

  let sourceNotice: ReactNode = null;
  if (isSetupError(displayError, diagnostics)) {
    sourceNotice = <SourceAnalysisSetupCard diagnostics={diagnostics} error={displayError} />;
  } else if (displayError) {
    sourceNotice = (
      <p className="break-words text-sm leading-5 text-[var(--vs-status-danger)]">{displayError}</p>
    );
  }

  const handleCreate = useCallback(
    async (candidate: VoiceProfileCandidate) => {
      const fallbackName = candidate.suggestedName || candidate.speakerId || "Custom voice";
      await onCreateProfile(candidate, {
        name: (candidateNames[candidate.id] ?? fallbackName).trim() || fallbackName,
        language: language.trim() || "en",
        targets: selectedTargets,
        autoValidate: true,
      });
    },
    [candidateNames, language, onCreateProfile, selectedTargets],
  );
  const toggleTarget = useCallback((targetId: string) => {
    setSelectedTargets((currentTargets) => {
      if (currentTargets.includes(targetId)) {
        return currentTargets.filter((id) => id !== targetId);
      }
      return [...currentTargets, targetId];
    });
  }, []);

  return (
    <section className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--vs-text-primary)]">
            Reference / Source Media
          </h2>
          <p className="mt-1 text-xs text-[var(--vs-text-muted)]">
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
        className="grid min-w-0 gap-3 rounded-lg border border-dashed border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] p-4"
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
          className="inline-flex cursor-pointer items-center justify-center rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-4 py-2 text-sm font-medium text-[var(--vs-text-primary)] shadow-sm hover:bg-[var(--vs-action-secondary-hover)]"
          htmlFor="voice-source-file-input"
        >
          {file ? "Replace Source" : "Browse Source"}
        </label>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] px-3 py-2 text-xs text-[var(--vs-text-muted)]">
          <span className="min-w-0 truncate" title={file?.name ?? "Audio/video source"}>
            {file?.name ?? "Audio/video source"}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[var(--vs-text-muted)]">
            {file ? formatBytes(file.size) : "No file selected"}
          </span>
        </div>
        <p className="-mt-1 min-w-0 text-xs leading-5 text-[var(--vs-text-muted)]">
          Local uploads are limited by available disk/runtime, not a fixed app cap.
        </p>
        <VoiceSourceProvenanceFields
          provenance={provenance}
          onChange={(patch) => {
            setProvenance((current) => ({ ...current, ...patch }));
            setLocalError(null);
          }}
        />
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--vs-theatre-bg)] px-4 text-sm font-semibold text-[var(--vs-action-primary-text)] disabled:cursor-not-allowed disabled:bg-[var(--vs-action-disabled-bg)]"
          disabled={Boolean(analyzeDisabledReason)}
          title={analyzeDisabledReason ?? undefined}
          type="submit"
        >
          {isAnalyzing ? "Analyzing..." : "Analyze Voices"}
        </button>
        {analyzeDisabledReason ? (
          <p className="-mt-1 text-xs leading-5 text-[var(--vs-text-muted)]">
            {analyzeDisabledReason}
          </p>
        ) : null}
      </form>

      {source ? (
        <SourceProgress
          isRefreshingTranscript={refreshingTranscriptKey === `source:${source.id}`}
          source={source}
          onRefreshTranscript={() => {
            void onRefreshSourceTranscript(source.id);
          }}
        />
      ) : null}
      {sourceNotice}

      <ReadyCandidateList
        candidateNames={candidateNames}
        candidates={source?.status === "ready" ? readyCandidates : []}
        createCandidateId={createCandidateId}
        language={language}
        selectedTargets={selectedTargets}
        sourceId={source?.id ?? ""}
        targetOptions={targetOptions}
        refreshingTranscriptKey={refreshingTranscriptKey}
        onCreate={handleCreate}
        onLanguageChange={setLanguage}
        onNameChange={(candidate, value) => {
          setCandidateNames((current) => ({ ...current, [candidate.id]: value }));
        }}
        onTargetToggle={toggleTarget}
        onTranscriptRefresh={onRefreshCandidateTranscript}
      />
      <RejectedCandidateList candidates={rejectedCandidates} />
    </section>
  );
}

const defaultVoiceProfileProvenance: VoiceProfileProvenance = {
  allowedUse: "",
  consentStatus: "",
  retentionPolicy: "",
  rightsBasis: "",
  sourceType: "",
};

const PROVENANCE_OPTIONS = {
  allowedUse: [
    { label: "Narration profile", value: "narration-profile" },
    { label: "Local workbench", value: "local-workbench" },
    { label: "Research only", value: "research-only" },
    { label: "Other", value: "other" },
  ],
  consentStatus: [
    { label: "Confirmed", value: "confirmed" },
    { label: "Pending", value: "pending" },
    { label: "Not required", value: "not-required" },
    { label: "Unknown", value: "unknown" },
  ],
  retentionPolicy: [
    { label: "Keep profile", value: "keep-profile" },
    { label: "Delete source after profile", value: "delete-source-after-profile" },
    { label: "Delete after session", value: "delete-after-session" },
    { label: "Other", value: "other" },
  ],
  rightsBasis: [
    { label: "Speaker consent", value: "speaker-consent" },
    { label: "Licensed", value: "licensed" },
    { label: "Public domain", value: "public-domain" },
    { label: "Internal research", value: "internal-research" },
    { label: "Other", value: "other" },
    { label: "Unknown", value: "unknown" },
  ],
  sourceType: [
    { label: "Self recording", value: "self-recording" },
    { label: "Provided recording", value: "provided-recording" },
    { label: "Archive media", value: "archive-media" },
    { label: "Other", value: "other" },
    { label: "Unknown", value: "unknown" },
  ],
} as const;

function VoiceSourceProvenanceFields({
  provenance,
  onChange,
}: Readonly<{
  provenance: VoiceProfileProvenance;
  onChange: (patch: Partial<VoiceProfileProvenance>) => void;
}>) {
  const notesRequired = voiceProfileProvenanceNeedsNotes(provenance);
  return (
    <fieldset className="grid gap-3 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-3">
      <legend className="px-1 text-xs font-semibold text-[var(--vs-text-primary)]">
        Provenance and consent
      </legend>
      <div className="grid gap-2 md:grid-cols-2">
        <ProvenanceSelect
          label="Source type"
          options={PROVENANCE_OPTIONS.sourceType}
          value={provenance.sourceType}
          onChange={(sourceType) => {
            onChange({ sourceType });
          }}
        />
        <ProvenanceSelect
          label="Rights basis"
          options={PROVENANCE_OPTIONS.rightsBasis}
          value={provenance.rightsBasis}
          onChange={(rightsBasis) => {
            onChange({ rightsBasis });
          }}
        />
        <ProvenanceSelect
          label="Consent status"
          options={PROVENANCE_OPTIONS.consentStatus}
          value={provenance.consentStatus}
          onChange={(consentStatus) => {
            onChange({ consentStatus });
          }}
        />
        <ProvenanceSelect
          label="Allowed use"
          options={PROVENANCE_OPTIONS.allowedUse}
          value={provenance.allowedUse}
          onChange={(allowedUse) => {
            onChange({ allowedUse });
          }}
        />
        <ProvenanceSelect
          label="Retention"
          options={PROVENANCE_OPTIONS.retentionPolicy}
          value={provenance.retentionPolicy}
          onChange={(retentionPolicy) => {
            onChange({ retentionPolicy });
          }}
        />
        <ProvenanceInput
          label="Speaker"
          placeholder="Optional speaker name"
          value={provenance.speakerName ?? ""}
          onChange={(speakerName) => {
            onChange({ speakerName });
          }}
        />
        <ProvenanceInput
          label="Owner"
          placeholder="Optional owner"
          value={provenance.sourceOwner ?? ""}
          onChange={(sourceOwner) => {
            onChange({ sourceOwner });
          }}
        />
        <ProvenanceInput
          label="Source URI"
          placeholder="Optional link or identifier"
          value={provenance.sourceUri ?? ""}
          onChange={(sourceUri) => {
            onChange({ sourceUri });
          }}
        />
      </div>
      <label className="grid gap-1 text-xs">
        <span className="font-semibold text-[var(--vs-text-secondary)]">
          Notes{notesRequired ? " required" : ""}
        </span>
        <textarea
          className="min-h-20 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-3 py-2 text-sm text-[var(--vs-text-primary)] outline-none focus:border-[var(--vs-selected-border)] focus:ring-2 focus:ring-[var(--vs-focus-ring-soft)]"
          onChange={(event) => {
            onChange({ notes: event.currentTarget.value });
          }}
          placeholder="Document consent details, limitations, or unknowns."
          value={provenance.notes ?? ""}
        />
      </label>
    </fieldset>
  );
}

function ProvenanceSelect({
  label,
  options,
  value,
  onChange,
}: Readonly<{
  label: string;
  options: readonly { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-semibold text-[var(--vs-text-secondary)]">{label}</span>
      <select
        className="h-9 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-2 text-sm text-[var(--vs-text-primary)] outline-none focus:border-[var(--vs-selected-border)] focus:ring-2 focus:ring-[var(--vs-focus-ring-soft)]"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ProvenanceInput({
  label,
  placeholder,
  value,
  onChange,
}: Readonly<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-semibold text-[var(--vs-text-secondary)]">{label}</span>
      <input
        className="h-9 rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-primary)] px-2 text-sm text-[var(--vs-text-primary)] outline-none focus:border-[var(--vs-selected-border)] focus:ring-2 focus:ring-[var(--vs-focus-ring-soft)]"
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        placeholder={placeholder}
        type="text"
        value={value}
      />
    </label>
  );
}

function voiceSourceIntakeDisabledReason(
  file: File | null,
  provenance: VoiceProfileProvenance,
  isAnalyzing: boolean,
): string | null {
  if (isAnalyzing) {
    return "Source analysis is already running.";
  }
  if (!file) {
    return "Choose source media first.";
  }
  for (const [key, label] of requiredProvenanceFields) {
    if (!provenance[key].trim()) {
      return `Select ${label}.`;
    }
  }
  if (voiceProfileProvenanceNeedsNotes(provenance) && !provenance.notes?.trim()) {
    return "Add notes for pending, other, or unknown provenance.";
  }
  return null;
}

const requiredProvenanceFields = [
  ["sourceType", "source type"],
  ["rightsBasis", "rights basis"],
  ["consentStatus", "consent status"],
  ["allowedUse", "allowed use"],
  ["retentionPolicy", "retention policy"],
] as const satisfies readonly (readonly [keyof VoiceProfileProvenance, string])[];

function voiceProfileProvenanceNeedsNotes(provenance: VoiceProfileProvenance): boolean {
  return requiredProvenanceFields.some(([key]) =>
    ["other", "pending", "unknown"].includes(provenance[key].trim().toLowerCase()),
  );
}

function normalizedVoiceProfileProvenance(
  provenance: VoiceProfileProvenance,
): VoiceProfileProvenance {
  return {
    allowedUse: provenance.allowedUse.trim(),
    consentDocumentLabel: optionalTrimmedValue(provenance.consentDocumentLabel),
    consentStatus: provenance.consentStatus.trim(),
    notes: optionalTrimmedValue(provenance.notes),
    retentionPolicy: provenance.retentionPolicy.trim(),
    rightsBasis: provenance.rightsBasis.trim(),
    sourceOwner: optionalTrimmedValue(provenance.sourceOwner),
    sourceType: provenance.sourceType.trim(),
    sourceUri: optionalTrimmedValue(provenance.sourceUri),
    speakerName: optionalTrimmedValue(provenance.speakerName),
  };
}

function optionalTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}
