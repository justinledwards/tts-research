import { useCallback, useMemo, useState, type ReactNode } from "react";
import type {
  CreateVoiceProfileFromCandidateRequest,
  ResearchModuleDiagnostics,
  TTSEngineDiagnostics,
  VoiceProfileCandidate,
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
  onAnalyze: (file: File) => Promise<void>;
  onCreateProfile: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onRefreshCandidateTranscript: (candidate: VoiceProfileCandidate) => Promise<void>;
  onRefreshSourceTranscript: (sourceId: string) => Promise<void>;
}>) {
  const [file, setFile] = useState<File | null>(null);
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
