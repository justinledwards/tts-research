import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatDuration } from "./format";
import { commandCenterRouteDefinition, type CommandCenterRouteId } from "./features/command-center";
import type { VoiceJob, VoiceProfile, VoiceProfileSource, VoiceProject } from "./types";
import type { CancellableActivitySummary } from "./voiceStudioViewModels";

export type CommandCenterSectionId = CommandCenterRouteId;

export type WorkspaceActivitySummary = CancellableActivitySummary & {
  onCancel?: () => void;
};

type WorkspaceDashboardSummaryProps = Readonly<{
  detail: string;
  label: string;
  value: string;
}>;

export function WorkspaceDashboardSummary({
  detail,
  label,
  value,
}: WorkspaceDashboardSummaryProps) {
  return (
    <div className="rounded-md border border-dashed p-4 vs-border">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold" title={label}>
          {label}
        </p>
        <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold vs-border">
          {value}
        </span>
      </div>
      <p className="vs-muted text-xs leading-5">{detail}</p>
    </div>
  );
}

type DrawerStatProps = Readonly<{
  label: string;
  value: string;
}>;

export function DrawerStat({ label, value }: DrawerStatProps) {
  return (
    <div className="grid gap-0.5">
      <span className="vs-muted truncate text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
        {label}
      </span>
      <span className="truncate text-sm font-semibold" title={value}>
        {value}
      </span>
    </div>
  );
}

export function commandCenterSectionHeadline(section: CommandCenterSectionId): string {
  return commandCenterRouteDefinition(section).headline;
}

export function commandCenterSectionDescription(section: CommandCenterSectionId): string {
  return commandCenterRouteDefinition(section).description;
}

type WorkspaceActivityRowProps = Readonly<{
  activity: WorkspaceActivitySummary;
}>;

export function WorkspaceActivityRow({ activity }: WorkspaceActivityRowProps) {
  return (
    <div className="grid gap-3 rounded-md border p-4 vs-raised">
      <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="min-w-0 truncate text-sm font-semibold" title={activity.label}>
              {activity.label}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${workspaceActivityStatusClass(activity.status)}`}
            >
              {activity.status}
            </span>
          </div>
          <p className="vs-muted mt-1 break-words text-xs leading-5">{activity.detail}</p>
        </div>
        {activity.canCancel && activity.onCancel ? (
          <button
            className="h-9 rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-surface-primary)] px-3 text-xs font-semibold text-[var(--vs-status-danger)] hover:bg-[var(--vs-action-destructive-hover)] disabled:opacity-50"
            onClick={() => {
              activity.onCancel?.();
            }}
            type="button"
          >
            {activity.cancelLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type BuildWorkspaceActivitySummariesInput = Readonly<{
  cancelingProfileSourceId: string | null;
  cancelingTargetKey: string | null;
  job: VoiceJob | null;
  onCancelJob: () => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
}>;

export function buildWorkspaceActivitySummaries({
  cancelingProfileSourceId,
  cancelingTargetKey,
  job,
  onCancelJob,
  onCancelProfileSource,
  onCancelProfileTarget,
  profileSource,
  profiles,
}: BuildWorkspaceActivitySummariesInput): WorkspaceActivitySummary[] {
  const activities: WorkspaceActivitySummary[] = [];

  if (job && !isTerminalJobStatus(job.status)) {
    activities.push({
      cancelLabel: "Cancel Run",
      canCancel: true,
      detail:
        `${job.progress.message || "Narration is running."} ${job.progress.detail || ""}`.trim(),
      id: `job:${job.id}`,
      label: "Narration pipeline",
      onCancel: () => {
        void onCancelJob();
      },
      status: "running",
    });
  }

  if (profileSource && isActiveProfileSource(profileSource)) {
    const isCanceling = cancelingProfileSourceId === profileSource.id;
    activities.push({
      cancelLabel: isCanceling ? "Cancelling..." : "Cancel Analysis",
      canCancel: !isCanceling,
      detail: `${profileSource.sourceFile} · ${profileSource.progressMessage || profileSource.status}`,
      id: `source:${profileSource.id}`,
      label: "Voice source analysis",
      onCancel: () => {
        void onCancelProfileSource(profileSource.id);
      },
      status: "running",
    });
  }

  for (const profile of profiles) {
    for (const [targetId, target] of Object.entries(profile.cloneTargets ?? {})) {
      const artifact = profile.cloneArtifacts?.[targetId];
      const isActiveTarget =
        ["queued", "building", "validating"].includes(target.status) ||
        artifact?.status === "building";
      if (!isActiveTarget) {
        continue;
      }
      const targetKey = `${profile.id}:${targetId}`;
      const isCanceling = cancelingTargetKey === targetKey;
      activities.push({
        cancelLabel: isCanceling ? "Cancelling..." : "Cancel Target",
        canCancel: !isCanceling,
        detail: `${profile.name} · ${target.label ?? targetId} · ${target.status}`,
        id: `target:${targetKey}`,
        label: "Voice clone target",
        onCancel: () => {
          void onCancelProfileTarget(profile.id, targetId);
        },
        status: "running",
      });
    }
  }
  return activities;
}

function isTerminalJobStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isActiveProfileSource(source: VoiceProfileSource): boolean {
  return source.status !== "ready" && source.status !== "failed" && source.status !== "cancelled";
}

function workspaceActivityStatusClass(status: WorkspaceActivitySummary["status"]): string {
  if (status === "running") {
    return "bg-[var(--vs-selected)] text-[var(--vs-selected-text)]";
  }
  if (status === "attention") {
    return "bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]";
  }
  if (status === "complete") {
    return "bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]";
  }
  if (status === "cancelled") {
    return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
  }
  return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
}

type CreateProjectRowProps = Readonly<{
  onCancel: () => void;
  onCreateProject: (name: string) => Promise<void>;
  onCreated: () => void;
}>;

export function CreateProjectRow({ onCancel, onCreateProject, onCreated }: CreateProjectRowProps) {
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitCreate = () => {
    const nextName = name.trim();
    if (nextName.length === 0 || isSaving) {
      return;
    }
    setIsSaving(true);
    void onCreateProject(nextName)
      .then(() => {
        setName("");
        onCreated();
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  return (
    <form
      className="grid min-w-0 gap-3 rounded-md border border-[var(--vs-selected-border)] bg-[var(--vs-selected)] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitCreate();
      }}
    >
      <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          aria-label="New project name"
          className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm font-semibold vs-border"
          data-reader-autofocus=""
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder="Project name"
          ref={inputRef}
          title={name}
          value={name}
        />
        <button
          className="h-9 rounded-md px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
          disabled={name.trim().length === 0 || isSaving}
          type="submit"
        >
          {isSaving ? "Creating..." : "Create"}
        </button>
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
      </div>
      <p className="vs-muted text-xs">
        New projects start blank for source text, chapters, playback, and staged sources.
      </p>
    </form>
  );
}

type ProjectLibraryRowProps = Readonly<{
  activeProjectId: string;
  project: VoiceProject;
  visibleJobs: VoiceJob[];
  onDeleteProject: (id: string) => Promise<void>;
  onExportProject: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSelectProject: (id: string) => void;
}>;

type ProjectLibraryStats = Readonly<{
  generatedDurationMs: number;
  primaryVoice: string;
  qualityScore: string;
}>;

export function ProjectLibraryRow({
  activeProjectId,
  project,
  visibleJobs,
  onDeleteProject,
  onExportProject,
  onRenameProject,
  onSelectProject,
}: ProjectLibraryRowProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const { generatedDurationMs, primaryVoice, qualityScore } =
    resolveProjectLibraryStats(visibleJobs);
  const isActive = project.id === activeProjectId;
  const isDefault = project.id === "default";

  useEffect(() => {
    if (!isEditingName) {
      setDraftName(project.name);
    }
  }, [isEditingName, project.name]);

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  const submitRename = () => {
    const nextName = draftName.trim();
    if (nextName.length === 0 || isSavingName) {
      return;
    }
    if (nextName === project.name) {
      setIsEditingName(false);
      return;
    }
    setIsSavingName(true);
    void onRenameProject(project.id, nextName).finally(() => {
      setIsSavingName(false);
      setIsEditingName(false);
    });
  };

  return (
    <div
      className={`relative grid min-w-0 gap-3 overflow-hidden rounded-md border p-3 pl-4 text-left transition ${
        isActive
          ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
          : "vs-raised hover:bg-[var(--vs-surface)]"
      }`}
    >
      {isActive ? (
        <span className="absolute inset-y-0 left-0 w-1 bg-[var(--vs-action-primary)]" />
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          {isEditingName ? (
            <form
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                submitRename();
              }}
            >
              <input
                aria-label={`Rename ${project.name}`}
                className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm font-semibold vs-border"
                onChange={(event) => {
                  setDraftName(event.currentTarget.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setDraftName(project.name);
                    setIsEditingName(false);
                  }
                }}
                ref={nameInputRef}
                title={draftName}
                value={draftName}
              />
              <button
                className="h-9 rounded-md px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
                disabled={draftName.trim().length === 0 || isSavingName}
                type="submit"
              >
                Save
              </button>
              <button
                className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
                disabled={isSavingName}
                onClick={() => {
                  setDraftName(project.name);
                  setIsEditingName(false);
                }}
                type="button"
              >
                Cancel
              </button>
            </form>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <button
                className="min-w-0 truncate text-left text-base font-semibold hover:text-[var(--vs-selected-text)]"
                onClick={() => {
                  onSelectProject(project.id);
                }}
                title={project.name}
                type="button"
              >
                {project.name}
              </button>
              <button
                aria-label={`Rename ${project.name}`}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-md border text-xs hover:bg-[var(--vs-raised)] vs-border"
                onClick={() => {
                  setDraftName(project.name);
                  setIsEditingName(true);
                }}
                title="Rename project"
                type="button"
              >
                ✎
              </button>
            </div>
          )}
          <p className="vs-muted mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-1 text-xs">
            <span>{visibleJobs.length.toString()} chapters</span>
            <span>·</span>
            <span>{formatDuration(generatedDurationMs)}</span>
            <span>·</span>
            <span className="min-w-0 truncate" title={primaryVoice}>
              {primaryVoice}
            </span>
            <span>·</span>
            <span>{qualityScore}</span>
            <span>·</span>
            <span>Updated {formatDate(project.updatedAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          {isDefault ? (
            <span
              className="rounded-full border px-2.5 py-1 text-xs font-semibold vs-border"
              title="The default project can be renamed or reused, but it cannot be deleted."
            >
              Default
            </span>
          ) : null}
          <button
            aria-label={isActive ? `Current project ${project.name}` : `Open ${project.name}`}
            className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
            onClick={() => {
              onSelectProject(project.id);
            }}
            type="button"
          >
            {isActive ? "Current" : "Open"}
          </button>
          <button
            aria-label={`Export ${project.name}`}
            className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:cursor-not-allowed disabled:opacity-45 vs-border"
            disabled={!isActive}
            onClick={onExportProject}
            title={isActive ? "Export this project" : "Open this project before exporting"}
            type="button"
          >
            Export
          </button>
          <button
            aria-label={`Delete ${project.name}`}
            className="h-8 rounded-md border border-[var(--vs-status-danger-border)] px-3 text-xs font-semibold text-[var(--vs-status-danger)] hover:bg-[var(--vs-action-destructive-hover)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isDefault || isDeleting}
            onClick={() => {
              setIsConfirmingDelete(true);
            }}
            title={
              isDefault
                ? "The default project is protected. Rename or reuse it instead."
                : "Delete project"
            }
            type="button"
          >
            {isDefault ? "Protected" : "Delete"}
          </button>
        </div>
      </div>
      {isConfirmingDelete ? (
        <div className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
          <p className="font-semibold">Delete “{project.name}”?</p>
          <p className="mt-1 text-xs leading-5">
            This removes this project’s jobs, generated audio, books, prepared sources, and
            listening progress. Voice profiles stay in your library.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="h-8 rounded-md bg-[var(--vs-status-danger)] px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50"
              disabled={isDeleting}
              onClick={() => {
                setIsDeleting(true);
                void onDeleteProject(project.id).finally(() => {
                  setIsDeleting(false);
                  setIsConfirmingDelete(false);
                });
              }}
              type="button"
            >
              {isDeleting ? "Deleting..." : "Delete project"}
            </button>
            <button
              className="h-8 rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-surface-primary)] px-3 text-xs font-semibold text-[var(--vs-status-danger)]"
              disabled={isDeleting}
              onClick={() => {
                setIsConfirmingDelete(false);
              }}
              type="button"
            >
              Keep project
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function resolveProjectLibraryStats(visibleJobs: VoiceJob[]): ProjectLibraryStats {
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const primaryVoice =
    visibleJobs.find((item) => item.voiceProfileName)?.voiceProfileName ?? "Default";
  const qualityScore = resolveProjectQualityScore(visibleJobs);

  return {
    generatedDurationMs,
    primaryVoice,
    qualityScore,
  };
}

export function WorkspaceSection({
  actions,
  children,
  id,
  title,
}: Readonly<{ actions?: ReactNode; children: ReactNode; id: string; title: string }>) {
  return (
    <section className="mb-8 scroll-mt-6 last:mb-0" id={id}>
      <div className="mb-3 flex min-w-0 items-center justify-between gap-3">
        <h3 className="vs-muted min-w-0 truncate text-xs font-semibold uppercase tracking-wide">
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyDrawerText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="vs-muted rounded-md border border-dashed p-4 text-sm vs-border">{children}</p>
  );
}

export function resolveProjectQualityScore(jobs: VoiceJob[]): string {
  const scores = jobs
    .map((item) => item.voiceCheck.similarity)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (scores.length === 0) {
    return "pending";
  }
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `${Math.round(average * 100).toString()}%`;
}

export function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
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
