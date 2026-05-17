import { useEffect } from "react";
import type { RunConfiguration } from "./runConfig";
import {
  RUN_MODE_PRESETS,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
  resolveRunPrimaryLabel,
} from "./runConfig";
import type {
  PerformanceMode,
  PipelineOptions,
  RunMode,
  TTSEngineDiagnostics,
  VoiceProfile,
  VoiceJob,
} from "./types";
import {
  SUPERTONIC_LANGUAGE_OPTIONS,
  SUPERTONIC_VOICE_STYLES,
  supertonicLanguageLabel,
} from "./supertonic";
import {
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";

const OPTION_LABELS: Record<keyof PipelineOptions, { label: string; detail: string }> = {
  textPreprocess: {
    label: "Text Preprocess",
    detail: "Clean and structure source text before synthesis.",
  },
  voiceClone: {
    label: "Voice Clone",
    detail: "Use the selected voice profile reference.",
  },
  asrCheck: {
    label: "ASR Check",
    detail: "Validate generated speech against the expected segment.",
  },
  autoRetry: {
    label: "Auto Retry",
    detail: "Retry or resume segments when the checker rejects output.",
  },
  arrivalPlayback: {
    label: "Arrival Playback",
    detail: "Play segments as soon as they arrive.",
  },
  qualityReport: {
    label: "Quality Report",
    detail: "Summarize retries, latency, confidence, and output shape.",
  },
};

export function RunConfigDrawer({
  canSubmit,
  isOpen,
  job,
  runConfiguration,
  selectedProfile,
  ttsEngineError,
  ttsEngines,
  onChange,
  onClose,
  onPrepareProfileTarget,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  isOpen: boolean;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onChange: (configuration: RunConfiguration) => void;
  onClose: () => void;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onSubmit: () => void;
}>) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) {
    return null;
  }

  const preset = getRunModePreset(runConfiguration.runMode);

  const updateOption = (key: keyof PipelineOptions, value: boolean) => {
    onChange({
      ...runConfiguration,
      options: {
        ...runConfiguration.options,
        [key]: value,
      },
    });
  };

  const updateMode = (mode: RunMode) => {
    onChange(createRunConfiguration(mode));
  };

  const updatePerformanceMode = (mode: PerformanceMode) => {
    onChange({
      ...runConfiguration,
      performanceMode: mode,
    });
  };

  const updateTTSEngine = (engineId: string) => {
    const selectedEngine = ttsEngines.find((engine) => engine.id === engineId);
    const firstVoice = selectedEngine?.voices?.[0]?.id;
    onChange({
      ...runConfiguration,
      ttsEngine: engineId,
      engineOptions:
        engineId === "supertonic-3"
          ? {
              ...runConfiguration.engineOptions,
              voiceStyle: runConfiguration.engineOptions.voiceStyle ?? firstVoice ?? "M1",
              lang: runConfiguration.engineOptions.lang ?? "na",
            }
          : {},
    });
  };

  const updateEngineOption = (key: string, value: string) => {
    onChange({
      ...runConfiguration,
      engineOptions: {
        ...runConfiguration.engineOptions,
        [key]: value,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Run configuration"
        className="ml-auto flex h-full w-full max-w-[520px] flex-col border-l border-zinc-200 bg-white shadow-2xl md:w-[500px]"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Create</p>
            <h2 className="text-lg font-semibold text-zinc-950">Run Configuration</h2>
          </div>
          <button
            aria-label="Close run configuration"
            className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Mode</h3>
            <div className="mt-3 grid gap-3">
              {RUN_MODE_PRESETS.map((item) => (
                <button
                  className={`rounded-md border p-4 text-left transition ${
                    item.mode === runConfiguration.runMode
                      ? "border-orange-300 bg-orange-50 text-orange-950"
                      : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50"
                  }`}
                  key={item.mode}
                  onClick={() => {
                    updateMode(item.mode);
                  }}
                  type="button"
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{item.label}</span>
                    <span className="text-xs text-zinc-500">{item.primaryLabel}</span>
                  </span>
                  <span className="mt-2 block text-sm leading-5 text-zinc-600">
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Narration Engine
            </h3>
            <div className="mt-3 grid gap-3">
              <select
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-3 text-sm font-semibold text-zinc-900 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
                onChange={(event) => {
                  updateTTSEngine(event.currentTarget.value);
                }}
                value={runConfiguration.ttsEngine}
              >
                {(ttsEngines.length > 0 ? ttsEngines : fallbackTTSEngines()).map((engine) => (
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
              <EngineDiagnosticsCard
                engine={findEngine(ttsEngines, runConfiguration.ttsEngine)}
                error={ttsEngineError}
                onPrepareProfileTarget={onPrepareProfileTarget}
                runConfiguration={runConfiguration}
                selectedProfile={selectedProfile}
              />
              {runConfiguration.ttsEngine === "supertonic-3" ? (
                <SupertonicOptions
                  engine={findEngine(ttsEngines, "supertonic-3")}
                  language={runConfiguration.engineOptions.lang ?? "na"}
                  voiceStyle={runConfiguration.engineOptions.voiceStyle ?? "M1"}
                  onOptionChange={updateEngineOption}
                />
              ) : null}
            </div>
          </section>

          <section className="mt-7">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Performance
            </h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {(["balanced", "throughput", "quality"] as const).map((mode) => (
                <button
                  className={`rounded-md border px-3 py-3 text-sm font-semibold capitalize transition ${
                    mode === runConfiguration.performanceMode
                      ? "border-orange-300 bg-orange-50 text-orange-900"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                  key={mode}
                  onClick={() => {
                    updatePerformanceMode(mode);
                  }}
                  type="button"
                >
                  {mode}
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm leading-5 text-zinc-500">
              {describePerformanceMode(runConfiguration.performanceMode)}
            </p>
          </section>

          <section className="mt-7">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Pipeline Toggles
            </h3>
            <div className="mt-3 grid gap-3">
              {(Object.keys(OPTION_LABELS) as (keyof PipelineOptions)[]).map((key) => (
                <label
                  className="flex cursor-pointer items-start justify-between gap-4 rounded-md border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
                  key={key}
                >
                  <span>
                    <span className="block text-sm font-semibold text-zinc-950">
                      {OPTION_LABELS[key].label}
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-500">
                      {OPTION_LABELS[key].detail}
                    </span>
                  </span>
                  <input
                    checked={runConfiguration.options[key]}
                    className="mt-1 h-5 w-5 accent-orange-500"
                    onChange={(event) => {
                      updateOption(key, event.currentTarget.checked);
                    }}
                    type="checkbox"
                  />
                </label>
              ))}
            </div>
          </section>

          <section className="mt-7 rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold text-zinc-950">Current Job Shape</h3>
            <dl className="mt-3 grid gap-2 text-sm">
              <DrawerFact label="Mode" value={preset.label} />
              <DrawerFact label="Voice" value={selectedProfile?.name ?? "Default voice"} />
              <DrawerFact label="Last status" value={job?.status ?? "No job yet"} />
              <DrawerFact
                label="Primary action"
                value={resolveRunPrimaryLabel(runConfiguration, job)}
              />
            </dl>
          </section>
        </div>

        <footer className="border-t border-zinc-200 p-5">
          <button
            className="h-11 w-full rounded-md bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {resolveRunPrimaryLabel(runConfiguration, job)}
          </button>
        </footer>
      </aside>
    </div>
  );
}

function EngineDiagnosticsCard({
  engine,
  error,
  onPrepareProfileTarget,
  runConfiguration,
  selectedProfile,
}: Readonly<{
  engine: TTSEngineDiagnostics | undefined;
  error: string | null;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
}>) {
  if (error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
    );
  }
  if (!engine) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-600">
        Engine diagnostics are loading.
      </p>
    );
  }
  const profileReadiness = selectedProfile
    ? profileReadinessForEngine(engine.id, selectedProfile, runConfiguration)
    : null;
  const targetId = voiceProfileTargetForEngine(engine.id);
  const canPrepareTarget =
    Boolean(selectedProfile && targetId && profileReadiness && !profileReadiness.ready) &&
    runConfiguration.options.voiceClone;
  return (
    <div className="grid gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm">
      <p className="font-semibold text-zinc-950">
        {engine.label} · {engine.status}
      </p>
      <p className="leading-5 text-zinc-600">{engine.reason ?? engine.setup ?? "Ready."}</p>
      {profileReadiness ? (
        <div
          className={`rounded border px-2 py-1 text-xs ${
            profileReadiness.ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          <p>{profileReadiness.message}</p>
          {canPrepareTarget && selectedProfile && targetId ? (
            <button
              className="mt-2 rounded border border-amber-300 bg-white px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100"
              onClick={() => {
                void onPrepareProfileTarget(selectedProfile.id, targetId);
              }}
              type="button"
            >
              Prepare target
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-zinc-500">
        {engine.local ? "Local" : "Remote"} · {engine.supportsSSML ? "SSML" : "plain text"} ·{" "}
        {formatEngineLanguageCount(engine)}
        {engine.estimatedVram ? ` · ${engine.estimatedVram}` : ""}
        {engine.supportsSwedish ? " · Swedish" : ""}
      </p>
    </div>
  );
}

function profileReadinessForEngine(
  engineId: string,
  profile: VoiceProfile,
  runConfiguration: RunConfiguration,
): { ready: boolean; message: string } | null {
  if (!runConfiguration.options.voiceClone) {
    return {
      ready: true,
      message: "Voice cloning is off for this run; provider presets will render.",
    };
  }
  const ready = isVoiceProfileTargetReadyForEngine(profile, engineId);
  return {
    ready,
    message: voiceProfileTargetReadinessText(profile, engineId),
  };
}

function SupertonicOptions({
  engine,
  language,
  voiceStyle,
  onOptionChange,
}: Readonly<{
  engine: TTSEngineDiagnostics | undefined;
  language: string;
  voiceStyle: string;
  onOptionChange: (key: string, value: string) => void;
}>) {
  const voices = engine?.voices ?? fallbackSupertonicVoices();
  const languages = languageOptionsForEngine(engine);
  return (
    <div className="grid gap-3 rounded-md border border-orange-200 bg-orange-50 p-3">
      <label className="grid gap-1 text-sm font-semibold text-orange-950">
        Voice style
        <select
          className="rounded-md border border-orange-200 bg-white px-3 py-2 text-zinc-900"
          onChange={(event) => {
            onOptionChange("voiceStyle", event.currentTarget.value);
          }}
          value={voiceStyle}
        >
          {voices.map((voice) => (
            <option key={voice.id} value={voice.id}>
              {voice.name} {voice.gender ? `· ${voice.gender}` : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm font-semibold text-orange-950">
        Language
        <select
          className="rounded-md border border-orange-200 bg-white px-3 py-2 text-zinc-900"
          onChange={(event) => {
            onOptionChange("lang", event.currentTarget.value);
          }}
          value={language}
        >
          {languages.map((option) => (
            <option key={option.code} value={option.code}>
              {option.label} · {option.code}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs leading-5 text-orange-900">
        Selected before audio: {voiceStyle} · {supertonicLanguageLabel(language)} ·{" "}
        {engine?.supportsSSML ? "SSML" : "plain text fallback"}
      </p>
    </div>
  );
}

function formatEngineLanguageCount(engine: TTSEngineDiagnostics): string {
  const count = engine.languages?.length ?? 0;
  if (engine.id === "supertonic-3" && count >= 31) {
    return `${(count - 1).toLocaleString()} languages + na`;
  }
  return count > 0 ? `${count.toLocaleString()} languages` : "language auto";
}

function languageOptionsForEngine(engine: TTSEngineDiagnostics | undefined) {
  const supportedCodes =
    engine?.languages && engine.languages.length > 0
      ? engine.languages
      : SUPERTONIC_LANGUAGE_OPTIONS.map((item) => item.code);
  const supported = new Set(supportedCodes);
  return SUPERTONIC_LANGUAGE_OPTIONS.filter((option) => supported.has(option.code));
}

function findEngine(
  engines: TTSEngineDiagnostics[],
  engineId: string,
): TTSEngineDiagnostics | undefined {
  return engines.find((engine) => engine.id === engineId);
}

function isEngineUnavailableForSelectedProfile(
  engine: TTSEngineDiagnostics,
  profile: VoiceProfile | null,
  runConfiguration: RunConfiguration,
): boolean {
  if (engine.status !== "ready") {
    return true;
  }
  if (!profile || !runConfiguration.options.voiceClone) {
    return false;
  }
  return !isVoiceProfileTargetReadyForEngine(profile, engine.id);
}

function fallbackTTSEngines(): TTSEngineDiagnostics[] {
  return [
    {
      id: "auto",
      label: "Auto",
      status: "ready",
      default: false,
      local: true,
      experimental: false,
      supportsVoice: true,
      supportsReference: true,
      supportsSwedish: false,
      supportsSSML: false,
    },
  ];
}

function fallbackSupertonicVoices(): { id: string; name: string; gender?: string }[] {
  return SUPERTONIC_VOICE_STYLES.map((id) => ({
    id,
    name: id,
    gender: id.startsWith("M") ? "male" : "female",
  }));
}

function DrawerFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="truncate font-medium text-zinc-900">{value}</dd>
    </div>
  );
}

function useEscapeClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);
}
