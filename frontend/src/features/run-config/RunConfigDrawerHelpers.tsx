import {
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetForEngine,
  voiceProfileTargetReadinessText,
} from "../../profileTargets";
import {
  applyKokoroRenderMode,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
  isKokoroRenderEngine,
  KOKORO_RENDER_MODE_OPTIONS,
  type KokoroRenderMode,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  RUN_MODE_PRESETS,
  type RunConfiguration,
  resolveRunPrimaryLabel,
} from "../../runConfig";
import {
  SUPERTONIC_LANGUAGE_OPTIONS,
  SUPERTONIC_VOICE_STYLES,
  supertonicLanguageLabel,
} from "../../supertonic";
import type {
  PerformanceMode,
  PipelineOptions,
  RunMode,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
} from "../../types";

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
    detail: "Play segments as soon as they are ready.",
  },
  qualityReport: {
    label: "Quality Report",
    detail: "Summarize retries, latency, confidence, and output shape.",
  },
};

export type RunConfigurationChangeHandler = (configuration: RunConfiguration) => void;
type DrawerEngineProps = Readonly<{
  canSubmit: boolean;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onChange: RunConfigurationChangeHandler;
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onSubmit?: () => void;
}>;

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
}: DrawerEngineProps) {
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
      engineOptions: engineOptionsForSelectedDrawerEngine(
        engineId,
        runConfiguration.engineOptions,
        firstVoice,
      ),
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
                  ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-text)]"
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
          className="w-full rounded-md border px-3 py-3 text-sm font-semibold outline-none focus:border-[var(--vs-selected-border)] focus:ring-2 focus:ring-[var(--vs-focus-ring-soft)] vs-border vs-raised"
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
                  ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-text)]"
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
          className="h-11 w-full rounded-md px-5 text-sm font-semibold text-[var(--vs-action-primary-text)] shadow-sm shadow-[var(--vs-shadow)] transition disabled:cursor-not-allowed disabled:bg-[var(--vs-action-disabled-bg)] disabled:shadow-none vs-accent-bg hover:brightness-95"
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

function engineOptionsForSelectedDrawerEngine(
  engineId: string,
  currentOptions: RunConfiguration["engineOptions"],
  firstVoice: string | undefined,
): RunConfiguration["engineOptions"] {
  if (engineId !== "supertonic-3") {
    return {};
  }
  return {
    ...currentOptions,
    voiceStyle: currentOptions.voiceStyle ?? firstVoice ?? "M1",
    lang: currentOptions.lang ?? "na",
  };
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
      <p className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
        {error}
      </p>
    );
  }
  if (!engine) {
    return (
      <p className="rounded-md border border-[var(--vs-border-subtle)] bg-[var(--vs-surface-secondary)] p-3 text-sm text-[var(--vs-text-muted)]">
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
              ? "border-[var(--vs-status-success-border)] bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]"
              : "border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]"
          }`}
        >
          <p>{profileReadiness.message}</p>
          {canPrepareTarget && selectedProfile && targetId ? (
            <button
              className="mt-2 rounded border border-[var(--vs-status-warning-border)] px-2 py-1 font-semibold text-[var(--vs-status-warning)] hover:bg-[var(--vs-status-warning-bg)] vs-raised"
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
                selected
                  ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
                  : "vs-border vs-surface"
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
                  className="mt-2 rounded border border-[var(--vs-selected-border)] px-2 py-1 text-xs font-semibold text-[var(--vs-selected-text)] hover:bg-[var(--vs-selected)] vs-raised"
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
    return "bg-[var(--vs-status-danger-bg)] text-[var(--vs-status-danger)]";
  }
  if (status === "cancelled") {
    return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
  }
  if (ready && status !== "check needed") {
    return "bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]";
  }
  if (status === "check needed") {
    return "bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]";
  }
  return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
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
    <div className="grid gap-3 rounded-md border border-[var(--vs-selected-border)] bg-[var(--vs-selected)] p-3">
      <label className="grid gap-1 text-sm font-semibold">
        Voice style
        <select
          className="rounded-md border border-[var(--vs-selected-border)] px-3 py-2 vs-raised"
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
          className="rounded-md border border-[var(--vs-selected-border)] px-3 py-2 vs-raised"
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
      <p className="text-xs leading-5 text-[var(--vs-selected-text)]">
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
