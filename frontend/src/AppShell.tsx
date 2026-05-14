import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode, getRunModePreset, resolveRunPrimaryLabel } from "./runConfig";
import type { VoiceJob } from "./types";

export type RequestState = "idle" | "running" | "complete" | "cancelled" | "error";

export function TopProductBar({
  activeJobId,
  canSubmit,
  isProcessing,
  jobName,
  job,
  projectName,
  requestState,
  runConfiguration,
  onCancel,
  onHelpOpen,
  onRunConfigOpen,
  onSettingsOpen,
  onSubmit,
  onWorkspaceOpen,
}: Readonly<{
  activeJobId: string | null;
  canSubmit: boolean;
  isProcessing: boolean;
  jobName: string;
  job: VoiceJob | null;
  projectName: string;
  requestState: RequestState;
  runConfiguration: RunConfiguration;
  onCancel: () => void;
  onHelpOpen: () => void;
  onRunConfigOpen: () => void;
  onSettingsOpen: () => void;
  onSubmit: () => void;
  onWorkspaceOpen: () => void;
}>) {
  const runPreset = getRunModePreset(runConfiguration.runMode);
  const primaryLabel = resolveRunPrimaryLabel(runConfiguration, job);

  return (
    <header className="flex min-h-[58px] items-center justify-between gap-4 border-b border-zinc-200 bg-white px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <button
          aria-label="Open workspace"
          className="grid h-9 w-9 place-items-center rounded-md border border-transparent text-zinc-700 transition hover:border-zinc-200 hover:bg-zinc-50"
          onClick={onWorkspaceOpen}
          type="button"
        >
          <span className="text-xl leading-none">☰</span>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-normal text-zinc-950">
            Voice Studio
          </h1>
          <p className="hidden truncate text-xs text-zinc-500 sm:block">
            {runPreset.label} · {describePerformanceMode(runConfiguration.performanceMode)} ·{" "}
            {projectName} / {jobName}
          </p>
        </div>
        <StatusBadge state={requestState} />
      </div>
      <div className="hidden items-center gap-3 md:flex">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
          onClick={onHelpOpen}
          type="button"
        >
          ? Help
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 shadow-sm transition hover:border-orange-200 hover:bg-orange-50"
          onClick={onSettingsOpen}
          type="button"
        >
          ⚙ Settings
        </button>
        <button
          className="inline-flex h-11 items-center gap-3 rounded-md border border-zinc-200 bg-white px-4 text-left text-sm font-semibold text-zinc-950 shadow-sm transition hover:border-orange-300 hover:bg-orange-50"
          onClick={onRunConfigOpen}
          type="button"
        >
          <span className="grid h-6 w-6 place-items-center rounded bg-orange-100 text-orange-700">
            ▥
          </span>
          <span>
            <span className="block leading-4">{runPreset.label}</span>
            <span className="block text-xs font-normal text-zinc-500">
              {runConfiguration.performanceMode}
            </span>
          </span>
        </button>
        {isProcessing ? (
          <button
            className="inline-flex h-11 items-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!activeJobId}
            onClick={onCancel}
            type="button"
          >
            ■ Cancel Job
          </button>
        ) : (
          <button
            className="inline-flex h-11 items-center whitespace-nowrap rounded-md bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {primaryLabel}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 md:hidden">
        <button
          aria-label="Configure run"
          className="grid h-10 w-10 place-items-center rounded-md border border-zinc-200 bg-white text-orange-600"
          onClick={onRunConfigOpen}
          type="button"
        >
          ▥
        </button>
        <button
          className="inline-flex h-10 items-center rounded-md bg-orange-500 px-4 text-sm font-semibold text-white disabled:bg-zinc-300"
          disabled={!canSubmit || isProcessing}
          onClick={onSubmit}
          type="button"
        >
          Create
        </button>
      </div>
    </header>
  );
}

function StatusBadge({ state }: Readonly<{ state: RequestState }>) {
  const classNameByState: Record<RequestState, string> = {
    idle: "border-zinc-200 bg-zinc-50 text-zinc-600",
    running: "border-blue-200 bg-blue-50 text-blue-700",
    complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
    cancelled: "border-zinc-200 bg-zinc-50 text-zinc-600",
    error: "border-red-200 bg-red-50 text-red-700",
  };
  return (
    <span
      className={`hidden rounded-full border px-3 py-1 text-xs font-semibold capitalize sm:inline-flex ${classNameByState[state]}`}
    >
      {state}
    </span>
  );
}
