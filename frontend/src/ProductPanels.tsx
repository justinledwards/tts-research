import { useEffect, useState, type ReactNode } from "react";
import { formatDuration } from "./format";
import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode, getRunModePreset } from "./runConfig";
import type { SystemMetrics, VoiceJob, VoiceProfile, VoiceProfileSource } from "./types";

export function HelpPanel({
  isOpen,
  job,
  profileSource,
  selectedProfile,
  onClose,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
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
  profileSource,
  runConfiguration,
  selectedProfile,
  onClose,
}: Readonly<{
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  onClose: () => void;
}>) {
  useEscapeClose(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<
    "preferences" | "providers" | "performance" | "storage"
  >("preferences");
  if (!isOpen) {
    return null;
  }

  const gpu = metrics?.gpus?.[0];
  const preset = getRunModePreset(runConfiguration.runMode);

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

      {activeTab === "preferences" ? (
        <PanelSection title="Preferences">
          <DiagnosticLine label="Run mode" value={preset.label} />
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
        </PanelSection>
      ) : null}

      {activeTab === "providers" ? (
        <PanelSection title="Providers">
          <DiagnosticLine
            label="Backend"
            value={metrics ? "Online" : (metricsError ?? "Pending")}
          />
          <DiagnosticLine
            label="TTS provider"
            value={job?.provider ?? "Resolved when a job runs"}
          />
          <DiagnosticLine
            label="Checker provider"
            value={job?.voiceCheck.provider ?? "Resolved when checker runs"}
          />
          <DiagnosticLine
            label="Diarization"
            value={profileSource?.modelVersion ?? "Requires configured pyannote access"}
          />
        </PanelSection>
      ) : null}

      {activeTab === "performance" ? (
        <PanelSection title="Performance">
          <DiagnosticLine label="Run shape" value={preset.label} />
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
              job?.qualityReport
                ? formatDuration(job.qualityReport.averageLatencyMs)
                : "No report yet"
            }
          />
        </PanelSection>
      ) : null}

      {activeTab === "storage" ? (
        <PanelSection title="Storage">
          <DiagnosticLine
            label="Selected profile"
            value={selectedProfile?.referencePath ?? "None"}
          />
          <DiagnosticLine
            label="Source analysis"
            value={profileSource?.normalizedAudio ?? "None"}
          />
          <DiagnosticLine label="Completed audio" value={job?.audioPath ?? "None"} />
          <p className="text-sm leading-6 text-zinc-600">
            Storage locations are backend-managed and surfaced here for diagnostics.
          </p>
        </PanelSection>
      ) : null}
    </PanelShell>
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
