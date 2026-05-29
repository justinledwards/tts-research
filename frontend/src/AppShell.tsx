import { Button, SegmentedControl, StatusChip } from "./design";
import { CommandIcon, SettingsIcon } from "./features/navigation/SurfaceActions";
import type { WorkspaceLayoutMode } from "./features/workspace/model";
import type { RunConfiguration } from "./runConfig";
import { describePerformanceMode } from "./runConfig";
import type { VoiceJob, VoiceProject } from "./types";

export type RequestState = "idle" | "running" | "complete" | "cancelled" | "error";
export type StudioMode = "narration" | "voiceCloning";

export function TopProductBar({
  activeJobId,
  activeProjectId,
  canSubmit,
  commandPaletteShortcutLabel,
  isProcessing,
  jobName,
  job,
  projectJobs,
  projectName,
  projects,
  requestState,
  runConfiguration,
  settingsShortcutLabel,
  showSubmitAction = true,
  studioMode,
  workspaceLayoutMode,
  onCancel,
  onCommandPaletteOpen,
  onExportOpen,
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
  commandPaletteShortcutLabel: string;
  isProcessing: boolean;
  jobName: string;
  job: VoiceJob | null;
  projectJobs: VoiceJob[];
  projectName: string;
  projects: VoiceProject[];
  requestState: RequestState;
  runConfiguration: RunConfiguration;
  settingsShortcutLabel: string;
  showSubmitAction?: boolean;
  studioMode: StudioMode;
  workspaceLayoutMode: WorkspaceLayoutMode;
  onCancel: () => void;
  onCommandPaletteOpen: () => void;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onJobSelect: (jobId: string) => void;
  onProjectSelect: (projectId: string) => void;
  onSettingsOpen: () => void;
  onStudioModeChange: (mode: StudioMode) => void;
  onSubmit: () => void;
  onWorkspaceLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
  onWorkspaceOpen: () => void;
}>) {
  const primaryButtonLabel = isProcessing ? "Cancel Job" : "Create & Listen";

  return (
    <header className="vs-raised grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 lg:px-4 2xl:grid-cols-[minmax(205px,auto)_minmax(330px,0.9fr)_auto]">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          aria-label="Open workspace"
          data-testid="ui-action-workspace-open-menu"
          onClick={onWorkspaceOpen}
          size="icon"
          variant="ghost"
        >
          <MenuIcon />
        </Button>
        <div className="min-w-0 md:shrink-0">
          <h1 className="truncate text-sm font-semibold tracking-normal sm:text-xl md:whitespace-nowrap">
            Voice Studio
          </h1>
          <p className="vs-muted hidden truncate text-xs sm:block">
            Reading studio · {describePerformanceMode(runConfiguration.performanceMode)}
          </p>
        </div>
        <Button
          align="start"
          className="hidden grid-cols-[auto_auto] items-center gap-2 2xl:grid"
          data-testid="ui-action-workspace-open"
          onClick={onWorkspaceOpen}
          size="md"
          variant="secondary"
        >
          <span>Workspace</span>
          <StatusChip className="rounded-full py-0.5 text-[0.65rem] capitalize">
            {requestState}
          </StatusChip>
        </Button>
      </div>
      <TopProductBarProjectSelectors
        activeProjectId={activeProjectId}
        job={job}
        jobName={jobName}
        projectJobs={projectJobs}
        projectName={projectName}
        projects={projects}
        onJobSelect={onJobSelect}
        onProjectSelect={onProjectSelect}
      />
      <nav
        aria-label="Primary workspace actions"
        className="hidden min-w-0 items-center justify-end gap-1.5 md:flex"
      >
        <SegmentedControl
          ariaLabel="Studio mode"
          className="min-w-[230px]"
          options={[
            { label: "Narration", testId: "ui-action-studio-mode-narration", value: "narration" },
            {
              label: "Voice Cloning",
              testId: "ui-action-studio-mode-voice-cloning",
              value: "voiceCloning",
            },
          ]}
          value={studioMode}
          onChange={onStudioModeChange}
        />
        <SegmentedControl
          ariaLabel="Workspace layout"
          className="hidden min-w-[230px] xl:grid"
          columns={3}
          options={[
            {
              ariaLabel: "Focus workspace layout",
              label: "Focus",
              testId: "ui-action-workspace-layout-focus",
              value: "focus",
            },
            {
              ariaLabel: "Balanced workspace layout",
              label: "Balanced",
              testId: "ui-action-workspace-layout-balanced",
              value: "balanced",
            },
            {
              ariaLabel: "Full workspace layout",
              label: "Full",
              testId: "ui-action-workspace-layout-full",
              value: "full",
            },
          ]}
          value={workspaceLayoutMode}
          onChange={onWorkspaceLayoutModeChange}
        />
        <Button
          aria-label="Open command palette"
          className="gap-2"
          data-command-id="command.palette"
          data-shortcut-command-id="command.palette"
          data-testid="ui-action-command-palette-open"
          data-ui-action-owner="command-palette"
          onClick={() => {
            onCommandPaletteOpen();
          }}
          size="md"
          title={`Actions (${commandPaletteShortcutLabel})`}
          variant="secondary"
        >
          <CommandIcon />
          <span className="hidden 2xl:inline">Actions</span>
        </Button>
        <Button
          aria-label="Open settings"
          data-command-id="settings:open"
          data-shortcut-command-id="settings.open"
          data-testid="ui-action-settings-open"
          data-ui-action-owner="settings"
          onClick={onSettingsOpen}
          size="icon"
          title={`Settings (${settingsShortcutLabel})`}
          variant="secondary"
        >
          <SettingsIcon />
        </Button>
        <div className="hidden h-10 shrink-0 overflow-hidden rounded-md border text-sm font-semibold shadow-sm vs-raised 2xl:inline-flex">
          <Button
            className="rounded-none border-0 shadow-none"
            onClick={onImportOpen}
            size="md"
            variant="ghost"
          >
            Import
          </Button>
          <Button
            className="rounded-none border-y-0 border-r-0 shadow-none"
            onClick={onExportOpen}
            size="md"
            variant="ghost"
          >
            Export
          </Button>
        </div>
        <TopProductBarPrimaryAction
          activeJobId={activeJobId}
          canSubmit={canSubmit}
          isProcessing={isProcessing}
          label={primaryButtonLabel}
          showSubmitAction={showSubmitAction}
          onCancel={onCancel}
          onSubmit={onSubmit}
        />
      </nav>
      <nav aria-label="Primary workspace actions" className="flex items-center gap-1.5 md:hidden">
        <Button
          className="px-2 text-orange-600"
          onClick={() => {
            onStudioModeChange(studioMode === "narration" ? "voiceCloning" : "narration");
          }}
          size="sm"
          variant="secondary"
        >
          {studioMode === "narration" ? "Narration" : "Cloning"}
        </Button>
        <Button
          aria-label="Open command palette"
          className="text-orange-600"
          data-command-id="command.palette"
          data-shortcut-command-id="command.palette"
          data-testid="ui-action-command-palette-open"
          data-ui-action-owner="command-palette"
          onClick={() => {
            onCommandPaletteOpen();
          }}
          size="icon"
          title={`Actions (${commandPaletteShortcutLabel})`}
          variant="secondary"
        >
          <CommandIcon />
        </Button>
        <Button
          aria-label="Open settings"
          className="text-orange-600"
          data-command-id="settings:open"
          data-shortcut-command-id="settings.open"
          data-testid="ui-action-settings-open"
          data-ui-action-owner="settings"
          onClick={onSettingsOpen}
          size="icon"
          title={`Settings (${settingsShortcutLabel})`}
          variant="secondary"
        >
          <SettingsIcon />
        </Button>
        {showSubmitAction ? (
          <Button
            disabled={!canSubmit || isProcessing}
            onClick={onSubmit}
            size="sm"
            variant="primary"
          >
            Run
          </Button>
        ) : null}
      </nav>
    </header>
  );
}

function TopProductBarProjectSelectors({
  activeProjectId,
  job,
  jobName,
  projectJobs,
  projectName,
  projects,
  onJobSelect,
  onProjectSelect,
}: Readonly<{
  activeProjectId: string;
  job: VoiceJob | null;
  jobName: string;
  projectJobs: VoiceJob[];
  projectName: string;
  projects: VoiceProject[];
  onJobSelect: (jobId: string) => void;
  onProjectSelect: (projectId: string) => void;
}>) {
  const visibleJobs =
    job && !projectJobs.some((projectJob) => projectJob.id === job.id)
      ? [job, ...projectJobs]
      : projectJobs;
  const selectedJobId = job?.id ?? "";

  return (
    <div className="hidden min-w-0 items-center gap-2 overflow-hidden rounded-lg border px-2 py-1.5 vs-surface 2xl:flex">
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
          data-disabled-reason={
            visibleJobs.length === 0
              ? "Create audio before selecting a generated chapter."
              : undefined
          }
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
  );
}

function TopProductBarPrimaryAction({
  activeJobId,
  canSubmit,
  isProcessing,
  label,
  showSubmitAction,
  onCancel,
  onSubmit,
}: Readonly<{
  activeJobId: string | null;
  canSubmit: boolean;
  isProcessing: boolean;
  label: string;
  showSubmitAction: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}>) {
  if (isProcessing) {
    return (
      <Button
        className="gap-2"
        disabled={!activeJobId}
        onClick={onCancel}
        size="md"
        variant="destructive"
      >
        <StopIcon />
        Cancel Job
      </Button>
    );
  }

  if (!showSubmitAction) {
    return null;
  }

  return (
    <Button
      className="whitespace-nowrap"
      disabled={!canSubmit}
      onClick={onSubmit}
      size="md"
      variant="primary"
    >
      {label}
    </Button>
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
