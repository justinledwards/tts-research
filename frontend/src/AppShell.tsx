import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode, getRunModePreset, resolveRunPrimaryLabel } from "./runConfig";
import type { VoiceJob, VoiceProject } from "./types";

export type RequestState = "idle" | "running" | "complete" | "cancelled" | "error";

export function TopProductBar({
  activeJobId,
  activeProjectId,
  canSubmit,
  isProcessing,
  jobName,
  job,
  projectJobs,
  projectName,
  projects,
  requestState,
  runConfiguration,
  onCancel,
  onExportOpen,
  onHelpOpen,
  onImportOpen,
  onJobSelect,
  onProjectSelect,
  onRunConfigOpen,
  onSettingsOpen,
  onSubmit,
  onWorkspaceOpen,
}: Readonly<{
  activeJobId: string | null;
  activeProjectId: string;
  canSubmit: boolean;
  isProcessing: boolean;
  jobName: string;
  job: VoiceJob | null;
  projectJobs: VoiceJob[];
  projectName: string;
  projects: VoiceProject[];
  requestState: RequestState;
  runConfiguration: RunConfiguration;
  onCancel: () => void;
  onExportOpen: () => void;
  onHelpOpen: () => void;
  onImportOpen: () => void;
  onJobSelect: (jobId: string) => void;
  onProjectSelect: (projectId: string) => void;
  onRunConfigOpen: () => void;
  onSettingsOpen: () => void;
  onSubmit: () => void;
  onWorkspaceOpen: () => void;
}>) {
  const runPreset = getRunModePreset(runConfiguration.runMode);
  const primaryLabel = resolveRunPrimaryLabel(runConfiguration, job);
  const visibleJobs =
    job && !projectJobs.some((projectJob) => projectJob.id === job.id)
      ? [job, ...projectJobs]
      : projectJobs;
  const selectedJobId = job?.id ?? "";
  const selectedJobIndex = visibleJobs.findIndex((item) => item.id === selectedJobId);
  const previousJobId = selectedJobIndex > 0 ? visibleJobs[selectedJobIndex - 1]?.id : "";
  const nextJobId =
    selectedJobIndex >= 0 && selectedJobIndex < visibleJobs.length - 1
      ? visibleJobs[selectedJobIndex + 1]?.id
      : "";
  const primaryButtonLabel = isProcessing ? "Cancel Job" : "Create & Listen";

  return (
    <header className="vs-raised grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b px-4 lg:grid-cols-[minmax(210px,0.75fr)_minmax(360px,1.25fr)_auto] lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          aria-label="Open workspace"
          className="grid h-10 w-10 place-items-center rounded-md border border-transparent transition hover:border-[var(--vs-border)] hover:bg-[var(--vs-surface)]"
          onClick={onWorkspaceOpen}
          type="button"
        >
          <span className="text-xl leading-none">☰</span>
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-normal">Voice Studio</h1>
          <p className="vs-muted hidden truncate text-xs sm:block">
            Reading studio · {describePerformanceMode(runConfiguration.performanceMode)}
          </p>
        </div>
        <StatusBadge state={requestState} />
      </div>
      <div className="hidden min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 vs-surface lg:flex">
        <label className="grid min-w-0 flex-1 gap-0.5">
          <span className="vs-muted px-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em]">
            Project
          </span>
          <select
            aria-label="Select project"
            className="min-w-0 truncate rounded-md border-0 bg-transparent px-1 py-0.5 text-sm font-semibold outline-none"
            onChange={(event) => {
              onProjectSelect(event.currentTarget.value);
            }}
            value={activeProjectId}
          >
            {projects.length > 0 ? (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            ) : (
              <option value={activeProjectId}>{projectName}</option>
            )}
          </select>
        </label>
        <button
          aria-label="Previous chapter"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-sm disabled:opacity-35 vs-border"
          disabled={!previousJobId}
          onClick={() => {
            if (previousJobId) {
              onJobSelect(previousJobId);
            }
          }}
          type="button"
        >
          ‹
        </button>
        <label className="grid min-w-0 flex-1 gap-0.5 border-l pl-3 vs-border">
          <span className="vs-muted px-1 text-[0.64rem] font-semibold uppercase tracking-[0.18em]">
            Chapter
          </span>
          <select
            aria-label="Select chapter"
            className="min-w-0 truncate rounded-md border-0 bg-transparent px-1 py-0.5 text-sm font-semibold outline-none"
            disabled={visibleJobs.length === 0}
            onChange={(event) => {
              onJobSelect(event.currentTarget.value);
            }}
            value={selectedJobId}
          >
            {visibleJobs.length > 0 ? (
              visibleJobs.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {`Chapter ${String(index + 1)} · ${chapterLabel(item)}`}
                </option>
              ))
            ) : (
              <option value="">Draft chapter · {jobName}</option>
            )}
          </select>
        </label>
        <button
          aria-label="Next chapter"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md border text-sm disabled:opacity-35 vs-border"
          disabled={!nextJobId}
          onClick={() => {
            if (nextJobId) {
              onJobSelect(nextJobId);
            }
          }}
          type="button"
        >
          ›
        </button>
      </div>
      <div className="hidden items-center justify-end gap-2 md:flex">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised"
          onClick={onHelpOpen}
          type="button"
        >
          ? Help
        </button>
        <button
          className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised"
          onClick={onSettingsOpen}
          type="button"
        >
          ⚙ Settings
        </button>
        <button
          className="hidden h-10 items-center rounded-md border px-3 text-sm font-semibold shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised xl:inline-flex"
          onClick={onImportOpen}
          type="button"
        >
          Import Bundle
        </button>
        <button
          className="hidden h-10 items-center rounded-md border px-3 text-sm font-semibold shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised xl:inline-flex"
          onClick={onExportOpen}
          type="button"
        >
          Export Current
        </button>
        <button
          className="inline-flex h-11 items-center gap-3 rounded-md border px-3 text-left text-sm font-semibold shadow-sm transition hover:border-orange-300 hover:bg-orange-50 vs-raised"
          onClick={onRunConfigOpen}
          type="button"
          title={primaryLabel}
        >
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-orange-100 text-orange-700">
            ▥
          </span>
          <span>
            <span className="block leading-4">{runPreset.label}</span>
            <span className="vs-muted block text-xs font-normal">
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
            className="inline-flex h-11 items-center whitespace-nowrap rounded-md px-5 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none vs-accent-bg hover:brightness-95"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {primaryButtonLabel}
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
          Listen
        </button>
      </div>
    </header>
  );
}

function chapterLabel(job: VoiceJob): string {
  const text = job.inputText.trim();
  let voice = "Default voice";
  if (job.voice.length > 0) {
    voice = job.voice;
  }
  if (job.voiceProfileName && job.voiceProfileName.length > 0) {
    voice = job.voiceProfileName;
  }
  if (text.length > 0) {
    return `${text.slice(0, 64)}${text.length > 64 ? "..." : ""}`;
  }
  return voice;
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
