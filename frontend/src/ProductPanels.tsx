import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { backendAssetUrl } from "./api";
import { formatDuration } from "./format";
import { KOKORO_VOICEPACKS, kokoroVoicepackDetail, kokoroVoicepackLabel } from "./kokoroVoices";
import type { RunConfiguration } from "./runConfig";
import {
  RUN_MODE_PRESETS,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
} from "./runConfig";
import {
  buildTeleprompterWordCues,
  type TeleprompterEffectStyle,
  type TeleprompterHighlightSettings,
} from "./teleprompter";
import { SUPERTONIC_LANGUAGE_OPTIONS } from "./supertonic";
import { VOICE_STUDIO_THEMES } from "./theme";
import type {
  SystemMetrics,
  ResearchModuleDiagnostics,
  ThemeName,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  ProjectStorageSummary,
} from "./types";

export function HelpPanel({
  isOpen,
  job,
  profileSourceDiagnostics,
  profileSource,
  selectedProfile,
  onClose,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  profileSource: VoiceProfileSource | null;
  selectedProfile: VoiceProfile | null;
  onClose: () => void;
}>) {
  useEscapeClose(isOpen, onClose);
  if (!isOpen) {
    return null;
  }

  const currentExplanation = explainCurrentState(job, profileSource);
  return (
    <PanelShell label="Help" title="Pipeline Guide" onClose={onClose}>
      <section className="rounded-md border border-orange-200 bg-orange-50 p-4">
        <h3 className="text-sm font-semibold text-orange-950">What is happening now</h3>
        <p className="mt-2 text-sm leading-6 text-orange-900">{currentExplanation}</p>
      </section>

      <PanelSection title="Voice Studio Flow">
        <GuideStep
          title="1. Analyze Source"
          detail="Upload source media, detect voices, and choose the cleanest candidate reference."
        />
        <GuideStep
          title="2. Configure Run"
          detail="Choose preview, fast output, checked master, or publish master before creating audio."
        />
        <GuideStep
          title="3. Listen While It Arrives"
          detail="Arrival mode buffers completed segments; Completed mode plays the final WAV."
        />
      </PanelSection>

      <PanelSection title="Diagnostics">
        <DiagnosticLine label="Selected profile" value={selectedProfile?.name ?? "Default voice"} />
        <DiagnosticLine
          label="Source analysis"
          value={profileSource?.status ?? "No source queued"}
        />
        <DiagnosticLine
          label="Pyannote"
          value={profileSourceDiagnostics?.mode ?? "Diagnostics pending"}
        />
        <DiagnosticLine
          label="Local model"
          value={
            profileSourceDiagnostics?.localModelAvailable
              ? "Available"
              : "Set VOICE_PROFILE_DIARIZATION_MODEL_PATH"
          }
        />
        <DiagnosticLine label="TTS job" value={job?.status ?? "No active job"} />
        <DiagnosticLine
          label="Checker"
          value={
            job?.pipelineOptions?.asrCheck === false
              ? "Disabled for this run"
              : "Enabled when creating checked audio"
          }
        />
      </PanelSection>

      <PanelSection title="Recovery">
        <p className="text-sm leading-6 text-zinc-600">
          If source analysis fails, check pyannote/Hugging Face access and ffmpeg availability. If
          synthesis stalls, lower performance mode to Balanced or Quality and retry the failed job.
        </p>
      </PanelSection>
    </PanelShell>
  );
}

export function SettingsPanel({
  isOpen,
  job,
  metrics,
  metricsError,
  profileSourceDiagnostics,
  profileSource,
  projectStorage,
  projectStorageError,
  researchModules,
  runConfiguration,
  selectedProfile,
  teleprompterSettings,
  themeName,
  ttsEngineError,
  ttsEngines,
  onClose,
  onRunConfigurationChange,
  onTeleprompterSettingsChange,
  onThemeChange,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  profileSource: VoiceProfileSource | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  teleprompterSettings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onClose: () => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  useEscapeClose(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<
    "preferences" | "providers" | "performance" | "storage"
  >("preferences");
  if (!isOpen) {
    return null;
  }

  return (
    <PanelShell label="Settings" title="Studio Settings" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["preferences", "providers", "performance", "storage"] as const).map((tab) => (
          <button
            className={`rounded-md border px-3 py-2 text-sm font-semibold capitalize ${
              activeTab === tab
                ? "border-orange-300 bg-orange-50 text-orange-900"
                : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
            }`}
            key={tab}
            onClick={() => {
              setActiveTab(tab);
            }}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      <SettingsTabContent
        activeTab={activeTab}
        job={job}
        metrics={metrics}
        metricsError={metricsError}
        profileSource={profileSource}
        profileSourceDiagnostics={profileSourceDiagnostics}
        projectStorage={projectStorage}
        projectStorageError={projectStorageError}
        researchModules={researchModules}
        runConfiguration={runConfiguration}
        selectedProfile={selectedProfile}
        teleprompterSettings={teleprompterSettings}
        themeName={themeName}
        ttsEngineError={ttsEngineError}
        ttsEngines={ttsEngines}
        onRunConfigurationChange={onRunConfigurationChange}
        onTeleprompterSettingsChange={onTeleprompterSettingsChange}
        onThemeChange={onThemeChange}
      />
    </PanelShell>
  );
}

function SettingsTabContent({
  activeTab,
  job,
  metrics,
  metricsError,
  profileSource,
  profileSourceDiagnostics,
  projectStorage,
  projectStorageError,
  researchModules,
  runConfiguration,
  selectedProfile,
  teleprompterSettings,
  themeName,
  ttsEngineError,
  ttsEngines,
  onRunConfigurationChange,
  onTeleprompterSettingsChange,
  onThemeChange,
}: Readonly<{
  activeTab: "preferences" | "providers" | "performance" | "storage";
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  teleprompterSettings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const preset = getRunModePreset(runConfiguration.runMode);

  if (activeTab === "preferences") {
    return (
      <SettingsPreferencesTab
        presetLabel={preset.label}
        runConfiguration={runConfiguration}
        teleprompterSettings={teleprompterSettings}
        themeName={themeName}
        onTeleprompterSettingsChange={onTeleprompterSettingsChange}
        onThemeChange={onThemeChange}
      />
    );
  }

  if (activeTab === "providers") {
    return (
      <SettingsProvidersTab
        job={job}
        metrics={metrics}
        metricsError={metricsError}
        profileSourceDiagnostics={profileSourceDiagnostics}
        researchModules={researchModules}
        runConfiguration={runConfiguration}
        ttsEngineError={ttsEngineError}
        ttsEngines={ttsEngines}
        onRunConfigurationChange={onRunConfigurationChange}
      />
    );
  }

  if (activeTab === "performance") {
    return (
      <SettingsPerformanceTab
        job={job}
        metrics={metrics}
        presetLabel={preset.label}
        runConfiguration={runConfiguration}
        onRunConfigurationChange={onRunConfigurationChange}
      />
    );
  }

  return (
    <SettingsStorageTab
      job={job}
      profileSource={profileSource}
      projectStorage={projectStorage}
      projectStorageError={projectStorageError}
      selectedProfile={selectedProfile}
    />
  );
}

function SettingsPreferencesTab({
  presetLabel,
  runConfiguration,
  teleprompterSettings,
  themeName,
  onTeleprompterSettingsChange,
  onThemeChange,
}: Readonly<{
  presetLabel: string;
  runConfiguration: RunConfiguration;
  teleprompterSettings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  return (
    <PanelSection title="Preferences">
      <DiagnosticLine label="Run mode" value={presetLabel} />
      <DiagnosticLine
        label="Performance"
        value={describePerformanceMode(runConfiguration.performanceMode)}
      />
      <DiagnosticLine
        label="Arrival playback"
        value={runConfiguration.options.arrivalPlayback ? "On" : "Off"}
      />
      <p className="vs-muted text-sm leading-6">
        Preferences are saved locally in this browser. Runtime provider configuration remains
        read-only in this pass.
      </p>
      <TeleprompterSettingsControls
        settings={teleprompterSettings}
        onChange={onTeleprompterSettingsChange}
      />
      <ThemeSettingsControls themeName={themeName} onThemeChange={onThemeChange} />
    </PanelSection>
  );
}

function ThemeSettingsControls({
  themeName,
  onThemeChange,
}: Readonly<{ themeName: ThemeName; onThemeChange: (theme: ThemeName) => void }>) {
  return (
    <div className="grid gap-3 rounded-md border p-3 vs-border vs-surface">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Theme</h4>
        <span className="vs-muted text-xs">Saved locally</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {VOICE_STUDIO_THEMES.map((theme) => (
          <button
            className={`rounded-md border p-3 text-left transition ${
              themeName === theme.name
                ? "border-orange-300 bg-orange-50 text-orange-950"
                : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
            }`}
            key={theme.name}
            onClick={() => {
              onThemeChange(theme.name);
            }}
            type="button"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold">{theme.label}</span>
              <span className="vs-muted text-xs">{theme.description}</span>
            </span>
            <span className="mt-3 grid grid-cols-5 gap-1">
              {[
                theme.swatches.background,
                theme.swatches.surface,
                theme.swatches.text,
                theme.swatches.accent,
                theme.swatches.generating,
              ].map((color) => (
                <span
                  aria-hidden="true"
                  className="h-4 rounded border border-black/10"
                  key={`${theme.name}-${color}`}
                  style={{ background: color }}
                />
              ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SettingsProvidersTab({
  job,
  metrics,
  metricsError,
  profileSourceDiagnostics,
  researchModules,
  runConfiguration,
  ttsEngineError,
  ttsEngines,
  onRunConfigurationChange,
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const updateEngine = (engineId: string) => {
    const engine = ttsEngines.find((item) => item.id === engineId);
    if (engine && engine.status !== "ready") {
      return;
    }
    onRunConfigurationChange({
      ...runConfiguration,
      ttsEngine: engineId,
      engineOptions:
        engineId === "supertonic-3"
          ? {
              ...runConfiguration.engineOptions,
              voiceStyle:
                runConfiguration.engineOptions.voiceStyle ?? engine?.voices?.[0]?.id ?? "M1",
              lang: runConfiguration.engineOptions.lang ?? "na",
            }
          : {},
    });
  };
  return (
    <PanelSection title="Providers">
      <DiagnosticLine label="Backend" value={metrics ? "Online" : (metricsError ?? "Pending")} />
      <DiagnosticLine
        label="Narration engine"
        value={runConfiguration.ttsEngine === "auto" ? "Auto" : runConfiguration.ttsEngine}
      />
      <DiagnosticLine label="TTS provider" value={job?.provider ?? "Resolved when a job runs"} />
      <DiagnosticLine
        label="Kokoro voice"
        value={job?.voice ? kokoroVoicepackLabel(job.voice) : "Resolved when Kokoro runs"}
      />
      <DiagnosticLine
        label="Checker provider"
        value={job?.voiceCheck.provider ?? "Resolved when checker runs"}
      />
      <DiagnosticLine
        label="Diarization"
        value={profileSourceDiagnostics?.mode ?? "Diagnostics pending"}
      />
      <DiagnosticLine
        label="Model"
        value={profileSourceDiagnostics?.modelPath ?? profileSourceDiagnostics?.model ?? "pyannote"}
      />
      <DiagnosticLine
        label="Analysis Python"
        value={profileSourceDiagnostics?.pythonPath ?? "Diagnostics pending"}
      />
      <DiagnosticLine
        label="ffmpeg"
        value={profileSourceDiagnostics?.ffmpegAvailable ? "Available" : "Missing"}
      />
      {profileSourceDiagnostics?.setupMessage ? (
        <p className="break-words text-sm leading-6 text-zinc-600">
          {profileSourceDiagnostics.setupMessage}
        </p>
      ) : null}
      <ResearchModuleDiagnosticsList modules={researchModules} />
      <TTSEngineDiagnosticsList
        engines={ttsEngines}
        error={ttsEngineError}
        selectedEngine={runConfiguration.ttsEngine}
        onSelectEngine={updateEngine}
      />
      <KokoroVoicepackDetails />
    </PanelSection>
  );
}

function TTSEngineDiagnosticsList({
  engines,
  error,
  selectedEngine,
  onSelectEngine,
}: Readonly<{
  engines: TTSEngineDiagnostics[];
  error: string | null;
  selectedEngine: string;
  onSelectEngine: (engineId: string) => void;
}>) {
  if (error) {
    return <p className="text-sm leading-6 text-red-700">{error}</p>;
  }
  return (
    <div className="grid gap-3 rounded-md border p-3 text-xs vs-border vs-surface">
      <div>
        <h4 className="text-sm font-semibold">Narration Engine</h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Ready engines can be selected here. Unavailable engines show what needs setup first.
        </p>
      </div>
      <ul className="grid gap-2">
        {engines.map((engine) => (
          <li key={engine.id}>
            <button
              className={`grid w-full gap-2 rounded-md border p-3 text-left transition ${
                selectedEngine === engine.id
                  ? "border-orange-300 bg-orange-500/10"
                  : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
              }`}
              disabled={engine.status !== "ready"}
              onClick={() => {
                onSelectEngine(engine.id);
              }}
              type="button"
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold" title={engine.label}>
                  {engine.label}
                </span>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${
                    engine.status === "ready"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                  }`}
                >
                  {engine.status}
                </span>
              </span>
              <span className="vs-muted break-words">
                {engine.supportsSSML ? "SSML" : "plain text"} ·{" "}
                {formatProviderLanguageSummary(engine)} ·{" "}
                {engine.estimatedVram ?? (engine.local ? "local" : "remote")}
              </span>
              {engine.reason || engine.setup ? (
                <span className="vs-muted break-words">{engine.reason ?? engine.setup}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResearchModuleDiagnosticsList({
  modules,
}: Readonly<{ modules: ResearchModuleDiagnostics[] }>) {
  if (modules.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-3 rounded-md border p-3 text-xs vs-border vs-surface">
      <div>
        <h4 className="text-sm font-semibold">Research Modules</h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Optional cloned upstreams live outside the app source and are only used for profile
          artifact builds.
        </p>
      </div>
      <ul className="grid gap-2">
        {modules.map((module) => (
          <li className="grid gap-1 rounded-md border p-3 vs-border" key={module.id}>
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-semibold" title={module.label}>
                {module.label}
              </span>
              <span
                className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] font-semibold ${
                  module.installed
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-amber-300 bg-amber-50 text-amber-800"
                }`}
              >
                {module.status}
              </span>
            </span>
            <span className="vs-muted break-words">{module.reason ?? module.setup}</span>
            <code className="truncate rounded bg-[var(--vs-raised)] px-2 py-1 font-mono text-[11px]">
              {module.localPath}
            </code>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatProviderLanguageSummary(engine: TTSEngineDiagnostics): string {
  const count = engine.languages?.length ?? 0;
  if (engine.id === "supertonic-3") {
    const languageCount = Math.max(count || SUPERTONIC_LANGUAGE_OPTIONS.length, 1);
    return `${(languageCount - 1).toLocaleString()} languages + na`;
  }
  if (count > 0) {
    return `${count.toLocaleString()} languages`;
  }
  return engine.supportsSwedish ? "Swedish" : "language auto";
}

function KokoroVoicepackDetails() {
  return (
    <details className="rounded-md border p-3 text-xs vs-border vs-surface">
      <summary className="cursor-pointer font-semibold">
        Kokoro voicepacks ({String(KOKORO_VOICEPACKS.length)})
      </summary>
      <ul className="mt-3 grid gap-2">
        {KOKORO_VOICEPACKS.map((voicepack) => (
          <li className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2" key={voicepack.id}>
            <code className="rounded bg-[var(--vs-raised)] px-2 py-1 font-mono text-[11px]">
              {voicepack.id}
            </code>
            <span className="min-w-0 truncate" title={kokoroVoicepackDetail(voicepack.id)}>
              {voicepack.name} · {voicepack.locale}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function SettingsPerformanceTab({
  job,
  metrics,
  presetLabel,
  runConfiguration,
  onRunConfigurationChange,
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  presetLabel: string;
  runConfiguration: RunConfiguration;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const gpu = metrics?.gpus?.[0];

  return (
    <PanelSection title="Performance">
      <div className="grid gap-3">
        <div>
          <h4 className="text-sm font-semibold">Run shape</h4>
          <p className="vs-muted mt-1 text-sm leading-6">
            {presetLabel} controls which checks run. Performance controls how aggressively segments
            are generated.
          </p>
        </div>
        <div className="grid gap-2">
          {RUN_MODE_PRESETS.map((preset) => (
            <button
              className={`rounded-md border p-3 text-left transition ${
                preset.mode === runConfiguration.runMode
                  ? "border-orange-300 bg-orange-500/10"
                  : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
              }`}
              key={preset.mode}
              onClick={() => {
                const nextConfig = createRunConfiguration(preset.mode);
                onRunConfigurationChange({
                  ...nextConfig,
                  ttsEngine: runConfiguration.ttsEngine,
                  engineOptions: runConfiguration.engineOptions,
                });
              }}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{preset.label}</span>
                <span className="vs-muted text-xs">{preset.primaryLabel}</span>
              </span>
              <span className="vs-muted mt-1 block text-xs leading-5">{preset.description}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {(["balanced", "throughput", "quality"] as const).map((mode) => (
          <button
            className={`rounded-md border p-3 text-left capitalize transition ${
              mode === runConfiguration.performanceMode
                ? "border-orange-300 bg-orange-500/10"
                : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
            }`}
            key={mode}
            onClick={() => {
              onRunConfigurationChange({ ...runConfiguration, performanceMode: mode });
            }}
            type="button"
          >
            <span className="font-semibold">{mode}</span>
            <span className="vs-muted mt-1 block text-xs leading-5">
              {describePerformanceMode(mode)}
            </span>
          </button>
        ))}
      </div>
      <DiagnosticLine
        label="GPU memory"
        value={
          gpu
            ? `${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB (${String(
                gpu.utilizationGpuPct,
              )}% util.)`
            : "Unavailable"
        }
      />
      <DiagnosticLine
        label="Average latency"
        value={
          job?.qualityReport ? formatDuration(job.qualityReport.averageLatencyMs) : "No report yet"
        }
      />
    </PanelSection>
  );
}

function SettingsStorageTab({
  job,
  profileSource,
  projectStorage,
  projectStorageError,
  selectedProfile,
}: Readonly<{
  job: VoiceJob | null;
  profileSource: VoiceProfileSource | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  selectedProfile: VoiceProfile | null;
}>) {
  return (
    <PanelSection title="Storage">
      {projectStorageError ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {projectStorageError}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <StorageStat
          label="Generated audio"
          value={formatBytes(projectStorage?.generatedAudioBytes ?? 0)}
        />
        <StorageStat label="Project total" value={formatBytes(projectStorage?.totalBytes ?? 0)} />
        <StorageStat
          label="Book/source data"
          value={formatBytes(
            (projectStorage?.bookSourceBytes ?? 0) + (projectStorage?.preparedSourceBytes ?? 0),
          )}
        />
        <StorageStat label="Jobs" value={String(projectStorage?.jobCount ?? 0)} />
      </div>
      {projectStorage?.downloads && projectStorage.downloads.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Audio Downloads</h4>
          {projectStorage.downloads.slice(0, 12).map((download) => (
            <a
              className={`flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-sm font-semibold transition ${
                download.available
                  ? "vs-border vs-raised hover:bg-[var(--vs-surface)]"
                  : "pointer-events-none opacity-45 vs-border vs-surface"
              }`}
              download={download.fileName}
              href={backendAssetUrl(download.url)}
              key={`${download.kind}-${download.jobId ?? ""}-${String(download.segment ?? 0)}`}
            >
              <span className="min-w-0 truncate" title={download.label}>
                {download.label}
              </span>
              <span className="vs-muted shrink-0 text-xs">
                {download.bytes ? formatBytes(download.bytes) : "WAV"}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="vs-muted rounded-md border border-dashed p-3 text-sm vs-border">
          Create audio to unlock direct WAV downloads here.
        </p>
      )}
      <details className="rounded-md border p-3 text-xs vs-border vs-surface">
        <summary className="cursor-pointer font-semibold">Technical storage details</summary>
        <dl className="mt-3 grid gap-2">
          <DiagnosticLine
            label="Selected profile"
            value={selectedProfile?.referencePath ?? "None"}
          />
          <DiagnosticLine
            label="Source analysis"
            value={profileSource?.normalizedAudio ?? "None"}
          />
          <DiagnosticLine label="Completed audio" value={job?.audioPath ?? "None"} />
          {Object.entries(projectStorage?.directories ?? {}).map(([label, path]) => (
            <DiagnosticLine key={label} label={label} value={path} />
          ))}
        </dl>
      </details>
    </PanelSection>
  );
}

function StorageStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <dt className="vs-muted text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </dd>
    </div>
  );
}

function TeleprompterSettingsControls({
  settings,
  onChange,
}: Readonly<{
  settings: TeleprompterHighlightSettings;
  onChange: (settings: TeleprompterHighlightSettings) => void;
}>) {
  const updateNumber = (key: keyof TeleprompterHighlightSettings, value: number) => {
    onChange({ ...settings, [key]: value });
  };
  const updateEffect = (effectStyle: TeleprompterEffectStyle) => {
    onChange({ ...settings, effectStyle });
  };

  return (
    <div className="grid gap-4 rounded-md border p-3 vs-border vs-surface">
      <div>
        <h4 className="text-sm font-semibold">Teleprompter focus</h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Lead timing pulls the eye forward; fade timing keeps spoken words gently visible.
        </p>
      </div>
      <TeleprompterRange
        label="Lead timing"
        max={600}
        min={0}
        suffix="ms"
        value={settings.leadMs}
        onChange={(value) => {
          updateNumber("leadMs", value);
        }}
      />
      <TeleprompterRange
        label="Spoken fade"
        max={2400}
        min={120}
        suffix="ms"
        value={settings.spokenFadeMs}
        onChange={(value) => {
          updateNumber("spokenFadeMs", value);
        }}
      />
      <TeleprompterRange
        label="Upcoming window"
        max={900}
        min={0}
        suffix="ms"
        value={settings.upcomingWindowMs}
        onChange={(value) => {
          updateNumber("upcomingWindowMs", value);
        }}
      />
      <TeleprompterRange
        label="Upcoming glow"
        max={0.7}
        min={0}
        step={0.01}
        value={settings.upcomingIntensity}
        onChange={(value) => {
          updateNumber("upcomingIntensity", value);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {(["spark", "classic"] as const).map((style) => (
          <button
            className={`rounded-md border px-3 py-2 text-xs font-semibold capitalize ${
              settings.effectStyle === style
                ? "border-orange-300 bg-orange-500/10 text-[var(--vs-text)]"
                : "vs-border vs-raised"
            }`}
            key={style}
            onClick={() => {
              updateEffect(style);
            }}
            type="button"
          >
            {style === "spark" ? "Spark Demo" : "Outline Glow"}
          </button>
        ))}
      </div>
      <TeleprompterHighlightDemo settings={settings} />
    </div>
  );
}

function TeleprompterRange({
  label,
  max,
  min,
  step = 1,
  suffix = "",
  value,
  onChange,
}: Readonly<{
  label: string;
  max: number;
  min: number;
  step?: number;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="vs-muted grid gap-2 text-xs font-medium">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-semibold text-[var(--vs-text)]">
          {Number.isInteger(value) ? value.toString() : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        className="accent-orange-500"
        max={max}
        min={min}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function TeleprompterHighlightDemo({
  settings,
}: Readonly<{ settings: TeleprompterHighlightSettings }>) {
  const [cursorMs, setCursorMs] = useState(0);
  const sample = "Ready eyes follow the next word before it arrives.";
  const durationMs = 5200;
  const wordCues = useMemo(
    () => buildTeleprompterWordCues(sample, cursorMs, durationMs, settings),
    [cursorMs, settings],
  );
  const words = sample.split(" ");

  useEffect(() => {
    const interval = globalThis.setInterval(() => {
      setCursorMs((current) => (current + 90) % durationMs);
    }, 90);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, []);

  return (
    <div className="rounded-md border p-3 vs-border vs-raised">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#cc0d55]">Highlight demo</p>
      <p className="mt-3 whitespace-pre-wrap text-lg leading-10">
        {words.map((word, index) => {
          const wordCue = wordCues[index];
          return (
            <span
              className={`teleprompter-word teleprompter-word--${wordCue.state}`}
              data-effect={settings.effectStyle}
              key={`${word}-${String(index)}`}
              style={
                {
                  "--teleprompter-accent": "#cc0d55",
                  "--teleprompter-intensity": String(wordCue.intensity),
                } as CSSProperties
              }
            >
              {word}
              {index < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function PanelShell({
  children,
  label,
  onClose,
  title,
}: Readonly<{
  children: ReactNode;
  label: string;
  onClose: () => void;
  title: string;
}>) {
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/25" role="presentation">
      <aside
        aria-label={label}
        className="vs-app ml-auto flex h-full w-full max-w-[520px] flex-col border-l shadow-2xl md:w-[500px] vs-border"
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div>
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">{label}</p>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button
            aria-label={`Close ${label}`}
            className="grid h-9 w-9 place-items-center rounded-md border hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
}

function PanelSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="mt-6 first:mt-0">
      <h3 className="vs-muted mb-3 text-xs font-semibold uppercase tracking-wide">{title}</h3>
      <div className="grid gap-3 rounded-md border p-4 vs-border vs-raised">{children}</div>
    </section>
  );
}

function GuideStep({ detail, title }: Readonly<{ detail: string; title: string }>) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="vs-muted mt-1 text-sm leading-6">{detail}</p>
    </div>
  );
}

function DiagnosticLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="vs-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function explainCurrentState(job: VoiceJob | null, source: VoiceProfileSource | null): string {
  if (job?.status === "failed") {
    return job.error ?? "The current job failed. Open Settings for provider diagnostics.";
  }
  if (job && job.status !== "completed") {
    return `${job.progress.message || "The job is running."} ${job.progress.detail || ""}`.trim();
  }
  if (source?.status === "failed") {
    return source.error ?? "Source analysis failed before candidates were ready.";
  }
  if (source && source.status !== "ready") {
    return source.progressMessage || "Source analysis is preparing candidate voices.";
  }
  if (job?.status === "completed") {
    return "Completed audio is ready. Use Arrival for segment review or Completed for final playback.";
  }
  return "Upload source media or paste text, then choose a run mode before creating audio.";
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
