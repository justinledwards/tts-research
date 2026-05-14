import { useEffect } from "react";
import type { RunConfiguration } from "./runConfig";
import {
  RUN_MODE_PRESETS,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
  resolveRunPrimaryLabel,
} from "./runConfig";
import type { PerformanceMode, PipelineOptions, RunMode, VoiceJob } from "./types";

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
  selectedProfileName,
  onChange,
  onClose,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  isOpen: boolean;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfileName: string | null;
  onChange: (configuration: RunConfiguration) => void;
  onClose: () => void;
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
              <DrawerFact label="Voice" value={selectedProfileName ?? "Default voice"} />
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
