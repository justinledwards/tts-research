import { useState, type ReactNode } from "react";
import { Button, StatusChip } from "../../../design";
import { formatLocaleDate, formatLocaleNumber } from "../../../features/i18n";
import type { VoiceJob, VoiceProject } from "../../../types";

export function uniqueJobs(jobs: VoiceJob[]): VoiceJob[] {
  const seen = new Set<string>();
  return jobs.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

export function formatDate(value: string): string {
  return formatLocaleDate(value);
}

export function formatDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "0s";
  }
  const seconds = Math.round(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes === 0) {
    return `${remainingSeconds.toString()}s`;
  }
  return `${minutes.toString()}m ${remainingSeconds.toString()}s`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function DashboardStatGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

export function DashboardStat({
  detail,
  label,
  value,
}: Readonly<{ detail?: string; label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-lg border p-3 vs-border vs-raised">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold" title={value}>
        {value}
      </p>
      {detail ? (
        <p className="vs-muted mt-1 truncate text-xs" title={detail}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

export function GeneratedAudioRow({ job }: Readonly<{ job: VoiceJob }>) {
  const ready = job.audioReadySegments ?? 0;
  const total = job.retries.totalSegments || (job.segments?.length ?? 0);
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold" title={job.id}>
          {job.preparedSourceId ?? job.bookSourceId ?? job.id}
        </p>
        <StatusChip tone={job.status === "completed" ? "success" : "info"}>{job.status}</StatusChip>
      </div>
      <p className="vs-muted mt-1 text-xs">
        {formatLocaleNumber(ready)} / {formatLocaleNumber(total)} ready ·{" "}
        {formatDuration(job.durationMs)}
      </p>
    </div>
  );
}

export function ProjectStateFact({
  detail,
  label,
  value,
}: Readonly<{ detail: string; label: string; value: string }>) {
  return (
    <div className="rounded-md border p-3 vs-border vs-surface">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      <p className="vs-muted mt-1 text-xs leading-5">{detail}</p>
    </div>
  );
}

export function StorageFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 vs-border vs-surface">
      <span className="vs-muted text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="truncate font-semibold" title={value}>
        {value}
      </span>
    </div>
  );
}

export function EmptyState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border vs-muted">
      {children}
    </p>
  );
}

export function ProjectDashboardTitle({
  isActive,
  isProtected,
  project,
  onSelectProject,
}: Readonly<{
  isActive: boolean;
  isProtected: boolean;
  project: VoiceProject;
  onSelectProject: () => void;
}>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        aria-current={isActive ? "page" : undefined}
        className="min-w-0 truncate text-left text-base font-semibold hover:text-[var(--vs-selected-text)]"
        data-testid={`ui-action-project-dashboard-open-${project.id}`}
        data-ui-focus-target={isActive ? "project-dashboard-status-message" : undefined}
        data-ui-action-surface="Workspace"
        onClick={onSelectProject}
        title={project.name}
        type="button"
      >
        {project.name}
      </button>
      {isActive ? <StatusChip tone="accent">Current</StatusChip> : null}
      {isProtected ? <StatusChip tone="pinned">Protected</StatusChip> : null}
    </div>
  );
}

export function ProjectDashboardRowActions({
  deleteDisabledReason,
  isActive,
  isDeleting,
  isProtected,
  project,
  onDelete,
  onEdit,
  onSelectProject,
}: Readonly<{
  deleteDisabledReason: string | undefined;
  isActive: boolean;
  isDeleting: boolean;
  isProtected: boolean;
  project: VoiceProject;
  onDelete: () => void;
  onEdit: () => void;
  onSelectProject: () => void;
}>) {
  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      <Button
        data-testid={`ui-action-project-dashboard-select-${project.id}`}
        data-ui-action-surface="Workspace"
        onClick={onSelectProject}
        selected={isActive}
        size="sm"
        variant="secondary"
      >
        {isActive ? "Current" : "Open"}
      </Button>
      <Button
        data-testid={`ui-action-project-dashboard-rename-${project.id}`}
        data-ui-action-surface="Workspace"
        onClick={onEdit}
        size="sm"
        variant="secondary"
      >
        Rename
      </Button>
      <Button
        data-testid={`ui-action-project-dashboard-delete-${project.id}`}
        data-ui-action-surface="Workspace"
        disabled={isProtected || isDeleting}
        disabledReason={deleteDisabledReason}
        onClick={onDelete}
        size="sm"
        variant="destructive"
      >
        {isProtected ? "Protected" : "Delete"}
      </Button>
    </div>
  );
}

export function ProjectDeleteConfirmation({
  isDeleting,
  project,
  onCancel,
  onConfirm,
}: Readonly<{
  isDeleting: boolean;
  project: VoiceProject;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  const deletionReason = isDeleting ? "Project deletion is in progress." : undefined;
  return (
    <div className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
      <p className="font-semibold">Delete “{project.name}”?</p>
      <p className="mt-1 text-xs leading-5">
        This removes the project, generated audio, books, prepared sources, and listening progress.
        Saved voice profiles remain in the voice dashboard.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={isDeleting}
          disabledReason={deletionReason}
          onClick={onConfirm}
          size="sm"
          variant="destructive"
        >
          {isDeleting ? "Deleting..." : "Delete Project"}
        </Button>
        <Button
          disabled={isDeleting}
          disabledReason={deletionReason}
          onClick={onCancel}
          size="sm"
          variant="secondary"
        >
          Keep Project
        </Button>
      </div>
    </div>
  );
}

export function ProjectRenameForm({
  draftName,
  isSaving,
  projectName,
  onCancel,
  onDraftNameChange,
  onSubmit,
}: Readonly<{
  draftName: string;
  isSaving: boolean;
  projectName: string;
  onCancel: () => void;
  onDraftNameChange: (value: string) => void;
  onSubmit: () => void;
}>) {
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        aria-label={`Rename ${projectName}`}
        className="h-11 min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border"
        onChange={(event) => {
          onDraftNameChange(event.currentTarget.value);
        }}
        value={draftName}
      />
      <Button
        disabled={isSaving}
        disabledReason={isSaving ? "Project rename is saving." : undefined}
        size="sm"
        type="submit"
        variant="primary"
      >
        Save
      </Button>
      <Button
        disabled={isSaving}
        disabledReason={isSaving ? "Project rename is saving." : undefined}
        onClick={onCancel}
        size="sm"
        variant="secondary"
      >
        Cancel
      </Button>
    </form>
  );
}

export function ProjectCreateForm({
  onCancel,
  onCreateProject,
  onCreated,
}: Readonly<{
  onCancel: () => void;
  onCreateProject: (name: string) => Promise<void>;
  onCreated: () => void;
}>) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const createDisabled = name.trim().length === 0 || isSaving;

  return (
    <form
      className="grid gap-2 rounded-md border border-[var(--vs-selected-border)] bg-[var(--vs-selected)] p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      onSubmit={(event) => {
        event.preventDefault();
        const nextName = name.trim();
        if (!nextName || isSaving) {
          return;
        }
        setIsSaving(true);
        void onCreateProject(nextName).finally(() => {
          setIsSaving(false);
          onCreated();
        });
      }}
    >
      <input
        aria-label="New project name"
        className="h-11 min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 text-sm font-semibold vs-border"
        onChange={(event) => {
          setName(event.currentTarget.value);
        }}
        placeholder="Project name"
        value={name}
      />
      <Button
        disabled={createDisabled}
        disabledReason={createDisabled ? "Enter a project name before creating." : undefined}
        size="sm"
        type="submit"
        variant="primary"
      >
        {isSaving ? "Creating..." : "Create"}
      </Button>
      <Button
        disabled={isSaving}
        disabledReason={isSaving ? "Project creation is saving." : undefined}
        onClick={onCancel}
        size="sm"
        variant="secondary"
      >
        Cancel
      </Button>
    </form>
  );
}
