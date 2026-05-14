import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { formatDuration } from "./format";
import { KOKORO_VOICEPACKS, kokoroVoicepackDetail, kokoroVoicepackLabel } from "./kokoroVoices";
import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode, getRunModePreset } from "./runConfig";
import {
  buildTeleprompterWordCues,
  type TeleprompterEffectStyle,
  type TeleprompterHighlightSettings,
} from "./teleprompter";
import type {
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
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
  runConfiguration,
  selectedProfile,
  teleprompterSettings,
  onClose,
  onTeleprompterSettingsChange,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  profileSource: VoiceProfileSource | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  teleprompterSettings: TeleprompterHighlightSettings;
  onClose: () => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
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
                : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
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
        runConfiguration={runConfiguration}
        selectedProfile={selectedProfile}
        teleprompterSettings={teleprompterSettings}
        onTeleprompterSettingsChange={onTeleprompterSettingsChange}
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
  runConfiguration,
  selectedProfile,
  teleprompterSettings,
  onTeleprompterSettingsChange,
}: Readonly<{
  activeTab: "preferences" | "providers" | "performance" | "storage";
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  teleprompterSettings: TeleprompterHighlightSettings;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
}>) {
  const preset = getRunModePreset(runConfiguration.runMode);

  if (activeTab === "preferences") {
    return (
      <SettingsPreferencesTab
        presetLabel={preset.label}
        runConfiguration={runConfiguration}
        teleprompterSettings={teleprompterSettings}
        onTeleprompterSettingsChange={onTeleprompterSettingsChange}
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
      />
    );
  }

  return (
    <SettingsStorageTab job={job} profileSource={profileSource} selectedProfile={selectedProfile} />
  );
}

function SettingsPreferencesTab({
  presetLabel,
  runConfiguration,
  teleprompterSettings,
  onTeleprompterSettingsChange,
}: Readonly<{
  presetLabel: string;
  runConfiguration: RunConfiguration;
  teleprompterSettings: TeleprompterHighlightSettings;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
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
      <p className="text-sm leading-6 text-zinc-600">
        Preferences are saved locally in this browser. Runtime provider configuration remains
        read-only in this pass.
      </p>
      <TeleprompterSettingsControls
        settings={teleprompterSettings}
        onChange={onTeleprompterSettingsChange}
      />
    </PanelSection>
  );
}

function SettingsProvidersTab({
  job,
  metrics,
  metricsError,
  profileSourceDiagnostics,
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
}>) {
  return (
    <PanelSection title="Providers">
      <DiagnosticLine label="Backend" value={metrics ? "Online" : (metricsError ?? "Pending")} />
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
      <KokoroVoicepackDetails />
    </PanelSection>
  );
}

function KokoroVoicepackDetails() {
  return (
    <details className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
      <summary className="cursor-pointer font-semibold text-zinc-800">
        Kokoro voicepacks ({String(KOKORO_VOICEPACKS.length)})
      </summary>
      <ul className="mt-3 grid gap-2">
        {KOKORO_VOICEPACKS.map((voicepack) => (
          <li className="grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] gap-2" key={voicepack.id}>
            <code className="rounded bg-white px-2 py-1 font-mono text-[11px] text-zinc-700">
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
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  presetLabel: string;
  runConfiguration: RunConfiguration;
}>) {
  const gpu = metrics?.gpus?.[0];

  return (
    <PanelSection title="Performance">
      <DiagnosticLine label="Run shape" value={presetLabel} />
      <DiagnosticLine label="Performance mode" value={runConfiguration.performanceMode} />
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
  selectedProfile,
}: Readonly<{
  job: VoiceJob | null;
  profileSource: VoiceProfileSource | null;
  selectedProfile: VoiceProfile | null;
}>) {
  return (
    <PanelSection title="Storage">
      <DiagnosticLine label="Selected profile" value={selectedProfile?.referencePath ?? "None"} />
      <DiagnosticLine label="Source analysis" value={profileSource?.normalizedAudio ?? "None"} />
      <DiagnosticLine label="Completed audio" value={job?.audioPath ?? "None"} />
      <p className="text-sm leading-6 text-zinc-600">
        Storage locations are backend-managed and surfaced here for diagnostics.
      </p>
    </PanelSection>
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
    <div className="grid gap-4 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div>
        <h4 className="text-sm font-semibold text-zinc-950">Teleprompter focus</h4>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
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
                ? "border-pink-300 bg-pink-50 text-pink-800"
                : "border-zinc-200 bg-white text-zinc-700"
            }`}
            key={style}
            onClick={() => {
              updateEffect(style);
            }}
            type="button"
          >
            {style}
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
    <label className="grid gap-2 text-xs font-medium text-zinc-600">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-semibold text-zinc-950">
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
    <div className="rounded-md border border-pink-100 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-pink-700">Highlight demo</p>
      <p className="mt-3 whitespace-pre-wrap text-lg leading-10 text-zinc-950">
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
        className="ml-auto flex h-full w-full max-w-[520px] flex-col border-l border-zinc-200 bg-white shadow-2xl md:w-[500px]"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
            <h2 className="text-lg font-semibold text-zinc-950">{title}</h2>
          </div>
          <button
            aria-label={`Close ${label}`}
            className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
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
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="grid gap-3 rounded-md border border-zinc-200 bg-white p-4">{children}</div>
    </section>
  );
}

function GuideStep({ detail, title }: Readonly<{ detail: string; title: string }>) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-zinc-600">{detail}</p>
    </div>
  );
}

function DiagnosticLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="max-w-[65%] text-right font-medium text-zinc-900">{value}</dd>
    </div>
  );
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
