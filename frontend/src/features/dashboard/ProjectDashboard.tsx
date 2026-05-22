import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Panel, StatusChip } from "../../design";
import { formatLocaleDate, formatLocaleNumber } from "../i18n";
import { useReaderModalLifecycle } from "../reader-accessibility";
import { SourceCard, sourceLifecycleModelsFromSources, type SourceCardModel } from "../sources";
import type {
  BookSource,
  PreparedSource,
  ProjectStorageSummary,
  VoiceJob,
  VoiceProject,
} from "../../types";

export interface ProjectDashboardProps {
  activeProjectId: string;
  bookSources: BookSource[];
  job: VoiceJob | null;
  preparedSources: PreparedSource[];
  projectError: string | null;
  projectJobs: VoiceJob[];
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  projects: VoiceProject[];
  onClose: () => void;
  onCreateProject: (name: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onOpenSourceCinema?: (model: SourceCardModel) => void;
  onPreviewSource?: (model: SourceCardModel) => void;
  onReviewSource?: (model: SourceCardModel) => void;
  onSelectProject: (id: string) => void;
  selectedBookSourceId?: string | null;
  selectedPreparedSourceId?: string | null;
}

export function ProjectDashboard({
  activeProjectId,
  bookSources,
  job,
  preparedSources,
  projectError,
  projectJobs,
  projectStorage,
  projectStorageError,
  projects,
  onClose,
  onCreateProject,
  onDeleteProject,
  onExportOpen,
  onImportOpen,
  onOpenSourceCinema,
  onPreviewSource,
  onRenameProject,
  onReviewSource,
  onSelectProject,
  selectedBookSourceId = null,
  selectedPreparedSourceId = null,
}: Readonly<ProjectDashboardProps>) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(dialogRef, { closeOnEscape: true, isOpen: true, onClose });
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const visibleJobs = useMemo(
    () => uniqueJobs(job ? [job, ...projectJobs] : projectJobs),
    [job, projectJobs],
  );
  const sourceModels = useMemo(
    () =>
      sourceLifecycleModelsFromSources({
        activeBookSourceId: selectedBookSourceId,
        activePreparedSourceId: selectedPreparedSourceId,
        bookSources,
        jobs: visibleJobs,
        preparedSources,
      }),
    [bookSources, preparedSources, selectedBookSourceId, selectedPreparedSourceId, visibleJobs],
  );
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/35 p-3 md:p-6" role="presentation">
      <aside
        aria-label="Project Dashboard"
        aria-modal="true"
        className="vs-app mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-lg border shadow-2xl vs-border vs-raised"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b p-4 md:p-5 vs-border">
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              Assets and storage
            </p>
            <h2 className="mt-1 text-2xl font-semibold">Project Dashboard</h2>
            <p className="vs-muted mt-2 max-w-3xl text-sm leading-6">
              Manage projects, source material, generated audio, and portable bundles away from the
              narration workbench.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="ui-action-project-dashboard-import"
              data-ui-action-surface="Workspace"
              onClick={onImportOpen}
              size="sm"
              variant="secondary"
            >
              Import Bundle
            </Button>
            <Button
              data-testid="ui-action-project-dashboard-export"
              data-ui-action-surface="Workspace"
              onClick={onExportOpen}
              size="sm"
              variant="primary"
            >
              Export Current
            </Button>
            <Button
              data-testid="ui-action-project-dashboard-close"
              data-ui-action-surface="Workspace"
              onClick={onClose}
              size="sm"
              variant="ghost"
            >
              Close
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {projectError ? (
            <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {projectError}
            </p>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="grid min-w-0 gap-4">
              <DashboardStatGrid>
                <DashboardStat label="Active Project" value={activeProject?.name ?? "Draft"} />
                <DashboardStat label="Projects" value={formatLocaleNumber(projects.length)} />
                <DashboardStat
                  label="Sources"
                  value={formatLocaleNumber(preparedSources.length + bookSources.length)}
                />
                <DashboardStat
                  label="Generated Audio"
                  value={formatLocaleNumber(visibleJobs.length)}
                  detail={formatDuration(generatedDurationMs)}
                />
                <DashboardStat
                  label="Storage"
                  value={formatBytes(projectStorage?.totalBytes ?? 0)}
                  detail={projectStorageError ?? "current project"}
                />
              </DashboardStatGrid>

              <Panel
                actions={
                  <Button
                    data-testid="ui-action-project-dashboard-new"
                    data-ui-action-surface="Workspace"
                    disabled={isCreatingProject}
                    disabledReason="Project creation form is already open."
                    onClick={() => {
                      setIsCreatingProject(true);
                    }}
                    size="sm"
                    variant="primary"
                  >
                    New Project
                  </Button>
                }
                title={`Projects (${formatLocaleNumber(projects.length)})`}
              >
                <div className="grid gap-3 p-3">
                  {isCreatingProject ? (
                    <ProjectCreateForm
                      onCancel={() => {
                        setIsCreatingProject(false);
                      }}
                      onCreateProject={onCreateProject}
                      onCreated={() => {
                        setIsCreatingProject(false);
                      }}
                    />
                  ) : null}
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <ProjectDashboardRow
                        activeProjectId={activeProjectId}
                        key={project.id}
                        project={project}
                        onDeleteProject={onDeleteProject}
                        onRenameProject={onRenameProject}
                        onSelectProject={onSelectProject}
                      />
                    ))
                  ) : (
                    <EmptyState>
                      No projects yet. Create one to start a new studio workspace.
                    </EmptyState>
                  )}
                </div>
              </Panel>

              <Panel
                title={`Sources (${formatLocaleNumber(preparedSources.length + bookSources.length)})`}
              >
                <div className="grid gap-2 p-3">
                  {sourceModels.map((source) => (
                    <SourceCard
                      key={`${source.owner}:${source.id}`}
                      model={source}
                      onOpenCinema={onOpenSourceCinema}
                      onPreview={onPreviewSource}
                      onReview={onReviewSource}
                    />
                  ))}
                  {sourceModels.length === 0 ? (
                    <EmptyState>
                      Imported files, URLs, pasted text, and books will appear here after intake.
                    </EmptyState>
                  ) : null}
                </div>
              </Panel>
            </div>

            <div className="grid content-start gap-4">
              <Panel title="Protected and Deletable State">
                <div className="grid gap-3 p-3 text-sm">
                  <ProjectStateFact
                    label="Default project"
                    value="Protected"
                    detail="It can be renamed or reused, but cannot be deleted."
                  />
                  <ProjectStateFact
                    label="Current project"
                    value={activeProject?.name ?? "Draft"}
                    detail="Export uses the current project bundle."
                  />
                  <ProjectStateFact
                    label="Destructive actions"
                    value="Confirmed"
                    detail="Deletes require an in-row confirmation before mutation."
                  />
                </div>
              </Panel>

              <Panel title="Generated Audio">
                <div className="grid gap-2 p-3">
                  {visibleJobs.slice(0, 8).map((item) => (
                    <GeneratedAudioRow job={item} key={item.id} />
                  ))}
                  {visibleJobs.length === 0 ? (
                    <EmptyState>
                      No generated audio is attached to the current project yet.
                    </EmptyState>
                  ) : null}
                </div>
              </Panel>

              <Panel title="Storage">
                <div className="grid gap-2 p-3 text-sm">
                  {projectStorageError ? (
                    <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      {projectStorageError}
                    </p>
                  ) : null}
                  <StorageFact
                    label="Generated audio"
                    value={formatBytes(projectStorage?.generatedAudioBytes ?? 0)}
                  />
                  <StorageFact label="Jobs" value={formatBytes(projectStorage?.jobBytes ?? 0)} />
                  <StorageFact
                    label="Sources"
                    value={formatBytes(
                      (projectStorage?.bookSourceBytes ?? 0) +
                        (projectStorage?.preparedSourceBytes ?? 0),
                    )}
                  />
                  <StorageFact label="Total" value={formatBytes(projectStorage?.totalBytes ?? 0)} />
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectDashboardRow({
  activeProjectId,
  project,
  onDeleteProject,
  onRenameProject,
  onSelectProject,
}: Readonly<{
  activeProjectId: string;
  project: VoiceProject;
  onDeleteProject: (id: string) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSelectProject: (id: string) => void;
}>) {
  const [draftName, setDraftName] = useState(project.name);
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isActive = project.id === activeProjectId;
  const isProtected = project.id === "default";
  const deleteDisabledReason = projectDeleteDisabledReason(isProtected, isDeleting);

  useEffect(() => {
    if (!isEditing) {
      setDraftName(project.name);
    }
  }, [isEditing, project.name]);

  const submitRename = () => {
    const nextName = draftName.trim();
    if (nextName.length === 0 || nextName === project.name || isSaving) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    void onRenameProject(project.id, nextName).finally(() => {
      setIsSaving(false);
      setIsEditing(false);
    });
  };

  return (
    <div
      className={`grid min-w-0 gap-3 rounded-md border p-3 ${
        isActive ? "border-orange-300 bg-orange-500/5" : "vs-border vs-surface"
      }`}
    >
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          {isEditing ? (
            <ProjectRenameForm
              draftName={draftName}
              isSaving={isSaving}
              projectName={project.name}
              onCancel={() => {
                setIsEditing(false);
                setDraftName(project.name);
              }}
              onDraftNameChange={setDraftName}
              onSubmit={submitRename}
            />
          ) : (
            <ProjectDashboardTitle
              isActive={isActive}
              isProtected={isProtected}
              project={project}
              onSelectProject={onSelectProject}
            />
          )}
          <p className="vs-muted mt-1 text-xs">
            Created {formatDate(project.createdAt)} · Updated {formatDate(project.updatedAt)}
          </p>
        </div>
        <ProjectDashboardRowActions
          deleteDisabledReason={deleteDisabledReason}
          isActive={isActive}
          isDeleting={isDeleting}
          isProtected={isProtected}
          project={project}
          onDelete={() => {
            setIsConfirmingDelete(true);
          }}
          onEdit={() => {
            setIsEditing(true);
          }}
          onSelectProject={onSelectProject}
        />
      </div>
      {isConfirmingDelete ? (
        <ProjectDeleteConfirmation
          isDeleting={isDeleting}
          project={project}
          onCancel={() => {
            setIsConfirmingDelete(false);
          }}
          onConfirm={() => {
            setIsDeleting(true);
            void onDeleteProject(project.id).finally(() => {
              setIsDeleting(false);
              setIsConfirmingDelete(false);
            });
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectRenameForm({
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

function ProjectDashboardTitle({
  isActive,
  isProtected,
  project,
  onSelectProject,
}: Readonly<{
  isActive: boolean;
  isProtected: boolean;
  project: VoiceProject;
  onSelectProject: (id: string) => void;
}>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <button
        className="min-w-0 truncate text-left text-base font-semibold hover:text-orange-700"
        data-testid={`ui-action-project-dashboard-open-${project.id}`}
        data-ui-action-surface="Workspace"
        onClick={() => {
          onSelectProject(project.id);
        }}
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

function ProjectDashboardRowActions({
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
  onSelectProject: (id: string) => void;
}>) {
  return (
    <div className="flex flex-wrap gap-2 md:justify-end">
      <Button
        data-testid={`ui-action-project-dashboard-select-${project.id}`}
        data-ui-action-surface="Workspace"
        onClick={() => {
          onSelectProject(project.id);
        }}
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

function ProjectDeleteConfirmation({
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
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
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

function projectDeleteDisabledReason(isProtected: boolean, isDeleting: boolean) {
  if (isProtected) {
    return "The default project is protected and cannot be deleted.";
  }
  if (isDeleting) {
    return "Project deletion is in progress.";
  }
}

function ProjectCreateForm({
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
      className="grid gap-2 rounded-md border border-orange-200 bg-orange-500/5 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
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

function DashboardStatGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function DashboardStat({
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

function GeneratedAudioRow({ job }: Readonly<{ job: VoiceJob }>) {
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

function ProjectStateFact({
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

function StorageFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 vs-border vs-surface">
      <span className="vs-muted text-xs font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="truncate font-semibold" title={value}>
        {value}
      </span>
    </div>
  );
}

function EmptyState({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border vs-muted">
      {children}
    </p>
  );
}

function uniqueJobs(jobs: VoiceJob[]): VoiceJob[] {
  const seen = new Set<string>();
  return jobs.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function formatDate(value: string): string {
  return formatLocaleDate(value);
}

function formatDuration(milliseconds: number): string {
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

function formatBytes(bytes: number): string {
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
