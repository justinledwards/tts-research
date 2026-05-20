import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode } from "./runConfig";
import type { VoiceJob, VoiceProject } from "./types";
import type { WorkspaceLayoutMode } from "./features/workspace/model";
import { HelpIcon, SettingsIcon } from "./features/navigation";

export type RequestState = "idle" | "running" | "complete" | "cancelled" | "error";
export type StudioMode = "narration" | "voiceCloning";

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
  studioMode,
  workspaceLayoutMode,
  onCancel,
  onExportOpen,
  onHelpOpen,
  onImportOpen,
  onJobSelect,
  onProjectSelect,
  onSettingsOpen,
  onStudioModeChange,
  onSubmit,
  onWorkspaceLayoutModeChange,
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
  studioMode: StudioMode;
  workspaceLayoutMode: WorkspaceLayoutMode;
  onCancel: () => void;
  onExportOpen: () => void;
  onHelpOpen: () => void;
  onImportOpen: () => void;
  onJobSelect: (jobId: string) => void;
  onProjectSelect: (projectId: string) => void;
  onSettingsOpen: () => void;
  onStudioModeChange: (mode: StudioMode) => void;
  onSubmit: () => void;
  onWorkspaceLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
  onWorkspaceOpen: () => void;
}>) {
  const visibleJobs =
    job && !projectJobs.some((projectJob) => projectJob.id === job.id)
      ? [job, ...projectJobs]
      : projectJobs;
  const selectedJobId = job?.id ?? "";
  const primaryButtonLabel = isProcessing ? "Cancel Job" : "Create & Listen";

  return (
    <header className="vs-raised grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 lg:grid-cols-[minmax(205px,auto)_minmax(330px,0.9fr)_auto] lg:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          aria-label="Open workspace"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-transparent transition hover:border-[var(--vs-border)] hover:bg-[var(--vs-surface)]"
          onClick={onWorkspaceOpen}
          type="button"
        >
          <MenuIcon />
        </button>
        <div className="min-w-0 md:shrink-0">
          <h1 className="truncate text-sm font-semibold tracking-normal sm:text-xl md:whitespace-nowrap">
            Voice Studio
          </h1>
          <p className="vs-muted hidden truncate text-xs sm:block">
            Reading studio · {describePerformanceMode(runConfiguration.performanceMode)}
          </p>
        </div>
        <button
          className="hidden h-10 shrink-0 grid-cols-[auto_auto] items-center gap-2 rounded-md border px-3 text-left text-xs font-semibold transition hover:border-orange-200 hover:bg-orange-50 vs-raised xl:grid"
          onClick={onWorkspaceOpen}
          type="button"
        >
          <span>Workspace</span>
          <span className="rounded-full border px-2 py-0.5 text-[0.65rem] capitalize vs-border vs-muted">
            {requestState}
          </span>
        </button>
      </div>
      <div className="hidden min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 vs-surface lg:flex">
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
      </div>
      <div className="hidden min-w-0 items-center justify-end gap-1.5 md:flex">
        <div className="grid min-w-[210px] grid-cols-2 rounded-md border p-1 text-xs font-semibold shadow-sm vs-border vs-surface">
          {(
            [
              ["narration", "Narration"],
              ["voiceCloning", "Voice Cloning"],
            ] as const
          ).map(([mode, label]) => (
            <button
              className={`h-8 whitespace-nowrap rounded px-3 transition ${
                studioMode === mode
                  ? "bg-orange-500 text-white shadow-sm"
                  : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
              }`}
              key={mode}
              onClick={() => {
                onStudioModeChange(mode);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="hidden min-w-[210px] grid-cols-3 rounded-md border p-1 text-xs font-semibold shadow-sm vs-border vs-surface xl:grid">
          {(
            [
              ["focus", "Focus"],
              ["balanced", "Balanced"],
              ["full", "Full"],
            ] as const
          ).map(([mode, label]) => (
            <button
              aria-label={`${label} workspace layout`}
              className={`h-8 whitespace-nowrap rounded px-2 transition ${
                workspaceLayoutMode === mode
                  ? "bg-orange-500 text-white shadow-sm"
                  : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
              }`}
              key={mode}
              onClick={() => {
                onWorkspaceLayoutModeChange(mode);
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          aria-label="Open help"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised"
          onClick={onHelpOpen}
          title="Open help"
          type="button"
        >
          <HelpIcon />
        </button>
        <button
          aria-label="Open settings"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border text-sm font-semibold shadow-sm transition hover:border-orange-200 hover:bg-orange-50 vs-raised"
          onClick={onSettingsOpen}
          title="Settings"
          type="button"
        >
          <SettingsIcon />
        </button>
        <div className="hidden h-10 shrink-0 overflow-hidden rounded-md border text-sm font-semibold shadow-sm vs-raised xl:inline-flex">
          <button
            className="px-3 transition hover:bg-orange-50"
            onClick={onImportOpen}
            type="button"
          >
            Import
          </button>
          <button
            className="border-l border-zinc-200 px-3 transition hover:bg-orange-50"
            onClick={onExportOpen}
            type="button"
          >
            Export
          </button>
        </div>
        {isProcessing ? (
          <button
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!activeJobId}
            onClick={onCancel}
            type="button"
          >
            <StopIcon />
            Cancel Job
          </button>
        ) : (
          <button
            className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md px-3 text-sm font-semibold text-white shadow-sm shadow-orange-500/20 transition disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:shadow-none vs-accent-bg hover:brightness-95"
            disabled={!canSubmit}
            onClick={onSubmit}
            type="button"
          >
            {primaryButtonLabel}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5 md:hidden">
        <button
          className="grid h-10 place-items-center rounded-md border px-2 text-xs font-semibold text-orange-600 vs-border vs-raised"
          onClick={() => {
            onStudioModeChange(studioMode === "narration" ? "voiceCloning" : "narration");
          }}
          type="button"
        >
          {studioMode === "narration" ? "Narration" : "Cloning"}
        </button>
        <button
          aria-label="Open settings"
          className="grid h-10 w-10 place-items-center rounded-md border text-orange-600 vs-border vs-raised"
          onClick={onSettingsOpen}
          type="button"
        >
          <SettingsIcon />
        </button>
        <button
          className="inline-flex h-10 items-center rounded-md bg-orange-500 px-3 text-xs font-semibold text-white disabled:bg-zinc-300"
          disabled={!canSubmit || isProcessing}
          onClick={onSubmit}
          type="button"
        >
          Run
        </button>
      </div>
    </header>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 16 16">
      <rect height="9" rx="1.5" width="9" x="3.5" y="3.5" />
    </svg>
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
