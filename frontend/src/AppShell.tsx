import { Button, SegmentedControl, StatusChip, cx } from "./design";
import { CommandIcon, SettingsIcon } from "./features/navigation/SurfaceActions";
import {
  WORKSPACE_LAYOUT_MODES,
  WORKSPACE_LAYOUT_SLOT_DENSITIES,
  WORKSPACE_LAYOUT_SLOTS,
  workspaceLayoutModeMeta,
  workspaceLayoutSlotDensityMeta,
  workspaceLayoutSlotMeta,
  type WorkspaceCustomLayout,
  type WorkspaceLayoutMode,
  type WorkspaceLayoutSlot,
  type WorkspaceLayoutSlotDensity,
} from "./features/workspace/model";
import {
  WORKSPACE_DISCLOSURE_PANEL_IDS,
  workspaceDisclosurePanelMeta,
  type WorkspaceDisclosurePanelId,
  type WorkspaceDisclosurePins,
} from "./features/workspace/disclosure";
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
  workspaceCustomLayout,
  workspaceDisclosurePins,
  workspaceLayoutMode,
  onCancel,
  onCommandPaletteOpen,
  onJobSelect,
  onProjectSelect,
  onSettingsOpen,
  onStudioModeChange,
  onSubmit,
  onWorkspaceCustomLayoutChange,
  onWorkspaceDisclosurePinChange,
  onWorkspaceLayoutModeChange,
  onCommandCenterOpen,
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
  workspaceCustomLayout: WorkspaceCustomLayout;
  workspaceDisclosurePins: WorkspaceDisclosurePins;
  workspaceLayoutMode: WorkspaceLayoutMode;
  onCancel: () => void;
  onCommandPaletteOpen: () => void;
  onJobSelect: (jobId: string) => void;
  onProjectSelect: (projectId: string) => void;
  onSettingsOpen: () => void;
  onStudioModeChange: (mode: StudioMode) => void;
  onSubmit: () => void;
  onWorkspaceCustomLayoutChange: (layout: WorkspaceCustomLayout) => void;
  onWorkspaceDisclosurePinChange: (panelId: WorkspaceDisclosurePanelId, pinned: boolean) => void;
  onWorkspaceLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
  onCommandCenterOpen: () => void;
}>) {
  const primaryButtonLabel = isProcessing ? "Cancel Job" : "Create & Listen";

  return (
    <header className="vs-raised grid min-h-[64px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3 lg:px-4 2xl:grid-cols-[minmax(205px,auto)_minmax(330px,0.9fr)_auto]">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button
          aria-label="Open Command Center"
          data-testid="ui-action-workspace-open-menu"
          onClick={onCommandCenterOpen}
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
          onClick={onCommandCenterOpen}
          size="md"
          variant="secondary"
        >
          <span>Command Center</span>
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
        <WorkspaceLayoutControl
          customLayout={workspaceCustomLayout}
          disclosurePins={workspaceDisclosurePins}
          layoutMode={workspaceLayoutMode}
          onCustomLayoutChange={onWorkspaceCustomLayoutChange}
          onDisclosurePinChange={onWorkspaceDisclosurePinChange}
          onLayoutModeChange={onWorkspaceLayoutModeChange}
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
          className="px-2 text-[var(--vs-action-primary)]"
          onClick={() => {
            onStudioModeChange(studioMode === "narration" ? "voiceCloning" : "narration");
          }}
          size="sm"
          variant="secondary"
        >
          {studioMode === "narration" ? "Narration" : "Cloning"}
        </Button>
        <WorkspaceLayoutControl
          compact
          customLayout={workspaceCustomLayout}
          disclosurePins={workspaceDisclosurePins}
          layoutMode={workspaceLayoutMode}
          onCustomLayoutChange={onWorkspaceCustomLayoutChange}
          onDisclosurePinChange={onWorkspaceDisclosurePinChange}
          onLayoutModeChange={onWorkspaceLayoutModeChange}
        />
        <Button
          aria-label="Open command palette"
          className="text-[var(--vs-action-primary)]"
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
          className="text-[var(--vs-action-primary)]"
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

export function WorkspaceLayoutControl({
  compact = false,
  customLayout,
  disclosurePins,
  layoutMode,
  onCustomLayoutChange,
  onDisclosurePinChange,
  onLayoutModeChange,
}: Readonly<{
  compact?: boolean;
  customLayout: WorkspaceCustomLayout;
  disclosurePins: WorkspaceDisclosurePins;
  layoutMode: WorkspaceLayoutMode;
  onCustomLayoutChange: (layout: WorkspaceCustomLayout) => void;
  onDisclosurePinChange: (panelId: WorkspaceDisclosurePanelId, pinned: boolean) => void;
  onLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
}>) {
  const activeMeta = workspaceLayoutModeMeta(layoutMode);
  return (
    <details
      className={cx("group relative", compact ? "" : "hidden lg:block")}
      data-testid="ui-action-workspace-layout-menu"
    >
      <summary
        aria-label={`Workspace layout: ${activeMeta.label}`}
        className={cx(
          "flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold shadow-sm transition hover:bg-[var(--vs-surface)] vs-border [&::-webkit-details-marker]:hidden",
          compact ? "min-w-11 px-2 text-[var(--vs-action-primary)]" : "min-w-36 gap-2",
        )}
      >
        <span>Layout</span>
        {compact ? null : (
          <StatusChip className="rounded-full py-0.5 text-[0.65rem]">{activeMeta.label}</StatusChip>
        )}
      </summary>
      <div
        className={cx(
          "absolute right-0 z-50 mt-2 grid w-[min(22rem,calc(100vw-1rem))] gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 text-sm shadow-xl vs-border",
          compact ? "-right-20" : "",
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          {WORKSPACE_LAYOUT_MODES.map((mode) => {
            const meta = workspaceLayoutModeMeta(mode);
            return (
              <Button
                align="start"
                aria-label={`${meta.label} workspace layout`}
                className="min-w-0 flex-col gap-1 px-3 py-2"
                data-testid={`ui-action-workspace-layout-${mode}`}
                key={mode}
                onClick={() => {
                  onLayoutModeChange(mode);
                }}
                selected={layoutMode === mode}
                size="sm"
                variant={layoutMode === mode ? "pinned" : "secondary"}
              >
                <span className="truncate text-sm font-semibold">{meta.label}</span>
                <span className="line-clamp-2 text-left text-xs vs-muted">{meta.description}</span>
              </Button>
            );
          })}
        </div>
        <div className="grid gap-2 border-t pt-3 vs-border">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
              Custom pins
            </p>
            <p className="mt-1 text-xs vs-muted">
              Pin advanced panels here without adding controls to every panel.
            </p>
          </div>
          {WORKSPACE_LAYOUT_SLOTS.map((slot) => (
            <WorkspaceLayoutSlotControl
              density={customLayout[slot]}
              key={slot}
              slot={slot}
              onDensityChange={(density) => {
                onCustomLayoutChange({
                  ...customLayout,
                  [slot]: density,
                });
              }}
            />
          ))}
        </div>
        <div className="grid gap-2 border-t pt-3 vs-border">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
              Advanced pins
            </p>
            <p className="mt-1 text-xs vs-muted">
              Keep frequently used advanced systems expanded when they are available.
            </p>
          </div>
          {WORKSPACE_DISCLOSURE_PANEL_IDS.map((panelId) => (
            <WorkspaceDisclosurePinControl
              key={panelId}
              panelId={panelId}
              pinned={disclosurePins[panelId]}
              onPinnedChange={(pinned) => {
                onDisclosurePinChange(panelId, pinned);
              }}
            />
          ))}
        </div>
      </div>
    </details>
  );
}

function WorkspaceLayoutSlotControl({
  density,
  slot,
  onDensityChange,
}: Readonly<{
  density: WorkspaceLayoutSlotDensity;
  slot: WorkspaceLayoutSlot;
  onDensityChange: (density: WorkspaceLayoutSlotDensity) => void;
}>) {
  const slotMeta = workspaceLayoutSlotMeta(slot);
  return (
    <div className="grid gap-1">
      <p className="truncate text-xs font-semibold" title={slotMeta.description}>
        {slotMeta.label}
      </p>
      <div className="grid grid-cols-3 gap-1">
        {WORKSPACE_LAYOUT_SLOT_DENSITIES.map((item) => {
          const meta = workspaceLayoutSlotDensityMeta(item);
          const label = workspaceLayoutDensityLabel(slot, item);
          return (
            <Button
              aria-label={`${slotMeta.label} ${label}`}
              className="min-w-0 px-2 text-xs"
              data-testid={`ui-action-workspace-layout-custom-${slot}-${item}`}
              key={item}
              onClick={() => {
                onDensityChange(item);
              }}
              selected={density === item}
              size="sm"
              title={
                slot === "systemStatus" && item === "hidden" ? "Essential status" : meta.description
              }
              variant={density === item ? "pinned" : "secondary"}
            >
              {label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

function workspaceLayoutDensityLabel(
  slot: WorkspaceLayoutSlot,
  density: WorkspaceLayoutSlotDensity,
): string {
  if (slot === "systemStatus" && density === "hidden") {
    return "Essential";
  }
  return workspaceLayoutSlotDensityMeta(density).label;
}

function WorkspaceDisclosurePinControl({
  panelId,
  pinned,
  onPinnedChange,
}: Readonly<{
  panelId: WorkspaceDisclosurePanelId;
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
}>) {
  const meta = workspaceDisclosurePanelMeta(panelId);
  return (
    <Button
      align="start"
      aria-pressed={pinned}
      className="min-w-0 justify-between gap-2 px-3 py-2"
      data-testid={`ui-action-workspace-disclosure-pin-${panelId}`}
      onClick={() => {
        onPinnedChange(!pinned);
      }}
      selected={pinned}
      size="sm"
      title={meta.detail}
      variant={pinned ? "pinned" : "secondary"}
    >
      <span className="min-w-0 truncate text-left text-xs font-semibold">{meta.label}</span>
      <span className="shrink-0 text-[0.65rem]">{pinned ? "Pinned" : "Auto"}</span>
    </Button>
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
