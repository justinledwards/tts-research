import { useRef } from "react";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import type { RunConfiguration } from "./runConfig";
import {
  KOKORO_RENDER_MODE_OPTIONS,
  RUN_MODE_PRESETS,
  applyKokoroRenderMode,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
  isKokoroRenderEngine,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  resolveRunPrimaryLabel,
  type KokoroRenderMode,
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
  const drawerRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(drawerRef, { closeOnEscape: true, isOpen, onClose });
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Run configuration"
        aria-modal="true"
        className="vs-app ml-auto flex h-full w-full max-w-[660px] flex-col border-l shadow-2xl md:w-[620px] vs-border"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div>
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">Create</p>
            <h2 className="text-lg font-semibold">Run Configuration</h2>
          </div>
          <button
            aria-label="Close run configuration"
            className="grid h-9 w-9 place-items-center rounded-md border hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <RunConfigurationControls
            canSubmit={canSubmit}
            job={job}
            runConfiguration={runConfiguration}
            selectedProfile={selectedProfile}
            ttsEngineError={ttsEngineError}
            ttsEngines={ttsEngines}
            onChange={onChange}
            onPrepareProfileTarget={onPrepareProfileTarget}
            onSubmit={onSubmit}
          />
        </div>
      </aside>
    </div>
  );
}

export function RunConfigurationControls({
  canSubmit,
  job,
  runConfiguration,
  selectedProfile,
  ttsEngineError,
  ttsEngines,
  onChange,
  onPrepareProfileTarget,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onChange: (configuration: RunConfiguration) => void;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onSubmit?: () => void;
}>) {
  const preset = getRunModePreset(runConfiguration.runMode);
  const engineFamilyValue = kokoroEngineFamilyValue(runConfiguration.ttsEngine);
  const showKokoroRenderModes = isKokoroRenderEngine(runConfiguration.ttsEngine);
  const activeKokoroRenderMode = kokoroRenderModeForConfiguration(
    runConfiguration,
    Boolean(selectedProfile),
  );

  const updateOption = (key: keyof PipelineOptions, value: boolean) => {
    const nextConfiguration = {
      ...runConfiguration,
      options: {
        ...runConfiguration.options,
        [key]: value,
      },
    };
    if (key === "voiceClone" && isKokoroRenderEngine(runConfiguration.ttsEngine)) {
      onChange(applyKokoroRenderMode(nextConfiguration, value ? "kokoclone" : "voicepack"));
      return;
    }
    onChange(nextConfiguration);
  };

  const updateMode = (mode: RunMode) => {
    const nextConfiguration = createRunConfiguration(mode);
    onChange({
      ...nextConfiguration,
      ttsEngine: runConfiguration.ttsEngine,
      engineOptions: runConfiguration.engineOptions,
    });
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
    if (engineId === "kokoro") {
      onChange(
        applyKokoroRenderMode(runConfiguration, selectedProfile ? "kokoclone" : "voicepack"),
      );
      return;
    }
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

  const updateKokoroRenderMode = (mode: KokoroRenderMode) => {
    onChange(applyKokoroRenderMode(runConfiguration, mode));
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
    <div className="grid gap-5">
      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide vs-muted">Mode</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {RUN_MODE_PRESETS.map((item) => (
            <button
              className={`rounded-md border p-4 text-left transition ${
                item.mode === runConfiguration.runMode
                  ? "border-orange-300 bg-orange-500/10 text-[var(--vs-text)]"
                  : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
              }`}
              key={item.mode}
              onClick={() => {
                updateMode(item.mode);
              }}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{item.label}</span>
                <span className="vs-muted text-xs">{item.primaryLabel}</span>
              </span>
              <span className="vs-muted mt-2 block text-sm leading-5">{item.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide vs-muted">Narration Engine</h3>
        <select
          className="w-full rounded-md border px-3 py-3 text-sm font-semibold outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 vs-border vs-raised"
          onChange={(event) => {
            updateTTSEngine(event.currentTarget.value);
          }}
          value={engineFamilyValue}
        >
          {drawerEngineFamilyOptions(ttsEngines).map((engine) => (
            <option disabled={engine.status !== "ready"} key={engine.id} value={engine.id}>
              {engine.label} · {engine.status}
            </option>
          ))}
        </select>
        {runConfiguration.ttsEngine === "auto" ? (
          <p className="vs-muted text-sm leading-5">
            Auto chooses a sensible default; use the Kokoro render mode below when you want a
            specific profile-backed path.
          </p>
        ) : null}
        <EngineDiagnosticsCard
          engine={
            findEngine(ttsEngines, runConfiguration.ttsEngine) ??
            findEngine(ttsEngines, engineFamilyValue)
          }
          error={ttsEngineError}
          onPrepareProfileTarget={onPrepareProfileTarget}
          runConfiguration={runConfiguration}
          selectedProfile={selectedProfile}
        />
        {showKokoroRenderModes ? (
          <DrawerKokoroRenderModeSelector
            activeMode={activeKokoroRenderMode}
            profile={selectedProfile}
            onPrepareProfileTarget={onPrepareProfileTarget}
            onSelectMode={updateKokoroRenderMode}
          />
        ) : null}
        {runConfiguration.ttsEngine === "supertonic-3" ? (
          <SupertonicOptions
            engine={findEngine(ttsEngines, "supertonic-3")}
            language={runConfiguration.engineOptions.lang ?? "na"}
            voiceStyle={runConfiguration.engineOptions.voiceStyle ?? "M1"}
            onOptionChange={updateEngineOption}
          />
        ) : null}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide vs-muted">Performance</h3>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(["balanced", "throughput", "quality"] as const).map((mode) => (
            <button
              className={`rounded-md border px-3 py-3 text-sm font-semibold capitalize transition ${
                mode === runConfiguration.performanceMode
                  ? "border-orange-300 bg-orange-500/10 text-[var(--vs-text)]"
                  : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
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
        <p className="vs-muted mt-2 text-sm leading-5">
          {describePerformanceMode(runConfiguration.performanceMode)}
        </p>
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wide vs-muted">Pipeline Toggles</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {(Object.keys(OPTION_LABELS) as (keyof PipelineOptions)[]).map((key) => (
            <label
              className="flex cursor-pointer items-start justify-between gap-4 rounded-md border p-4 transition hover:bg-[var(--vs-surface)] vs-border vs-raised"
              key={key}
            >
              <span>
                <span className="block text-sm font-semibold">{OPTION_LABELS[key].label}</span>
                <span className="vs-muted mt-1 block text-sm leading-5">
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

      <section className="rounded-md border p-4 vs-border vs-surface">
        <h3 className="text-sm font-semibold">Current Job Shape</h3>
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

      {onSubmit ? (
        <button
          className="h-11 w-full rounded-md px-5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none vs-accent-bg hover:brightness-95"
          disabled={!canSubmit}
          onClick={onSubmit}
          type="button"
        >
          {resolveRunPrimaryLabel(runConfiguration, job)}
        </button>
      ) : null}
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
    <div className="grid gap-1 rounded-md border p-3 text-sm vs-border vs-surface">
      <p className="font-semibold">
        {engine.label} · {engine.status}
      </p>
      <p className="vs-muted leading-5">{engine.reason ?? engine.setup ?? "Ready."}</p>
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
              className="mt-2 rounded border border-amber-300 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100 vs-raised"
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
      <p className="vs-muted text-xs">
        {engine.local ? "Local" : "Remote"} · {engine.supportsSSML ? "SSML" : "plain text"} ·{" "}
        {formatEngineLanguageCount(engine)}
        {engine.estimatedVram ? ` · ${engine.estimatedVram}` : ""}
        {engine.supportsSwedish ? " · Swedish" : ""}
      </p>
    </div>
  );
}

function DrawerKokoroRenderModeSelector({
  activeMode,
  profile,
  onPrepareProfileTarget,
  onSelectMode,
}: Readonly<{
  activeMode: KokoroRenderMode;
  profile: VoiceProfile | null;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onSelectMode: (mode: KokoroRenderMode) => void;
}>) {
  return (
    <div className="grid gap-2 rounded-md border p-3 vs-border vs-raised">
      <p className="text-sm font-semibold">Kokoro Render Mode</p>
      <div className="grid gap-2">
        {KOKORO_RENDER_MODE_OPTIONS.map((option) => {
          const readiness = drawerKokoroModeReadiness(option.id, profile);
          const targetId = drawerKokoroModeTargetId(option.id);
          const selected = option.id === activeMode;
          const canPrepare = Boolean(profile && targetId && readiness.canPrepare);
          return (
            <div
              className={`rounded-md border p-3 ${
                selected ? "border-orange-300 bg-orange-500/10" : "vs-border vs-surface"
              }`}
              key={option.id}
            >
              <button
                className="grid w-full gap-1 text-left disabled:cursor-not-allowed"
                disabled={!readiness.ready}
                onClick={() => {
                  onSelectMode(option.id);
                }}
                type="button"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{option.label}</span>
                  <span
                    className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ${drawerKokoroModeStatusClass(
                      readiness.ready,
                      readiness.status,
                    )}`}
                  >
                    {readiness.status}
                  </span>
                </span>
                <span className="vs-muted text-sm leading-5">{option.detail}</span>
                <span className="vs-muted text-xs leading-5">{readiness.detail}</span>
              </button>
              {canPrepare && profile && targetId ? (
                <button
                  className="mt-2 rounded border border-orange-200 px-2 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100 vs-raised"
                  onClick={() => {
                    void onPrepareProfileTarget(profile.id, targetId);
                  }}
                  type="button"
                >
                  {drawerKokoroModeActionLabel(readiness.status)}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function drawerKokoroModeTargetId(mode: KokoroRenderMode): string | null {
  if (mode === "kokoclone") {
    return "kokoro-clone";
  }
  if (mode === "kokoro-embed") {
    return "kokoro-embed";
  }
  return null;
}

function drawerKokoroModeReadiness(
  mode: KokoroRenderMode,
  profile: VoiceProfile | null,
): { ready: boolean; status: string; detail: string; canPrepare: boolean } {
  const targetId = drawerKokoroModeTargetId(mode);
  if (!targetId) {
    return {
      ready: true,
      status: "ready",
      detail: "Uses the selected built-in Kokoro voicepack.",
      canPrepare: false,
    };
  }
  if (!profile) {
    return {
      ready: false,
      status: "profile needed",
      detail: "Select a voice profile before using profile-backed Kokoro rendering.",
      canPrepare: false,
    };
  }
  const target = profile.cloneTargets?.[targetId];
  if (!target) {
    return targetId === "kokoro-clone"
      ? {
          ready: true,
          status: "ready",
          detail: "KokoClone can use the selected reference audio.",
          canPrepare: false,
        }
      : {
          ready: false,
          status: "not built",
          detail: "Prepare this profile target before rendering.",
          canPrepare: true,
        };
  }
  if (target.status === "ready") {
    if (target.validation?.status === "failed") {
      return {
        ready: true,
        status: "check needed",
        detail: target.validation.error ?? "Rendering is ready; validation can be re-run.",
        canPrepare: true,
      };
    }
    const score = target.validation?.score;
    return {
      ready: true,
      status:
        typeof score === "number" && Number.isFinite(score)
          ? String(Math.round(score * 100))
          : "ready",
      detail: "Ready for the selected voice profile.",
      canPrepare: false,
    };
  }
  if (target.status === "failed") {
    return {
      ready: false,
      status: "failed",
      detail: target.error ?? target.validation?.error ?? "Preparation failed.",
      canPrepare: true,
    };
  }
  if (target.status === "cancelled") {
    return {
      ready: false,
      status: "cancelled",
      detail: "Preparation was cancelled.",
      canPrepare: true,
    };
  }
  if (target.status === "selected") {
    return {
      ready: false,
      status: "not built",
      detail: "This profile target is selected and can be prepared now.",
      canPrepare: true,
    };
  }
  return {
    ready: false,
    status: target.status,
    detail: `Target is ${target.status}.`,
    canPrepare: false,
  };
}

function drawerKokoroModeActionLabel(status: string): string {
  if (status === "check needed") {
    return "Revalidate";
  }
  if (status === "failed" || status === "cancelled") {
    return "Retry";
  }
  return "Prepare target";
}

function drawerKokoroModeStatusClass(ready: boolean, status: string): string {
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (status === "cancelled") {
    return "bg-zinc-100 text-zinc-600";
  }
  if (ready && status !== "check needed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "check needed") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-zinc-100 text-zinc-600";
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
    <div className="grid gap-3 rounded-md border border-orange-200 bg-orange-500/10 p-3">
      <label className="grid gap-1 text-sm font-semibold">
        Voice style
        <select
          className="rounded-md border border-orange-200 px-3 py-2 vs-raised"
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
      <label className="grid gap-1 text-sm font-semibold">
        Language
        <select
          className="rounded-md border border-orange-200 px-3 py-2 vs-raised"
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

function drawerEngineFamilyOptions(engines: TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  const source = engines.length > 0 ? engines : fallbackTTSEngines();
  return source.filter((engine) => engine.id !== "kokoro-clone" && engine.id !== "kokoro-embed");
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
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
