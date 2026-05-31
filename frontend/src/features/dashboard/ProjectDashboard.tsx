import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Panel } from "../../design";
import { formatLocaleNumber } from "../i18n";
import {
  PrivacyBoundaryPanel,
  privacyBoundaryCatalog,
  projectExportPrivacyBoundary,
} from "../privacy";
import { useReaderModalLifecycle } from "../reader-accessibility";
import { SourceCard, sourceLifecycleModelsFromSources, type SourceCardModel } from "../sources";
import type {
  BookSource,
  PreparedSource,
  ProjectStorageSummary,
  VoiceJob,
  VoiceProject,
} from "../../types";
import {
  DashboardStat,
  DashboardStatGrid,
  EmptyState,
  GeneratedAudioRow,
  ProjectCreateForm,
  ProjectDashboardRowActions,
  ProjectDashboardTitle,
  ProjectDeleteConfirmation,
  ProjectRenameForm,
  ProjectStateFact,
  StorageFact,
  formatBytes,
  formatDate,
  formatDuration,
  uniqueJobs,
} from "./components/projectDashboardHelpers";

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
  const statusRef = useRef<HTMLOutputElement | null>(null);
  useReaderModalLifecycle(dialogRef, { closeOnEscape: true, isOpen: true, onClose });
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Project Dashboard ready.");
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
        projectId: activeProjectId,
      }),
    [
      activeProjectId,
      bookSources,
      preparedSources,
      selectedBookSourceId,
      selectedPreparedSourceId,
      visibleJobs,
    ],
  );
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const announceDashboardStatus = (message: string, options: { focusStatus?: boolean } = {}) => {
    setStatusMessage(message);
    if (options.focusStatus) {
      globalThis.requestAnimationFrame(() => {
        statusRef.current?.focus();
      });
    }
  };
  const handleReviewSource = onReviewSource
    ? (source: SourceCardModel) => {
        announceDashboardStatus(`Opening ${source.title} in Review.`);
        onReviewSource(source);
        onClose();
      }
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-[var(--vs-surface-overlay)] p-3 md:p-6"
      role="presentation"
    >
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
          <output
            aria-live="polite"
            className="w-full rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs font-semibold vs-border"
            data-testid="project-dashboard-status-message"
            ref={statusRef}
            tabIndex={-1}
          >
            {statusMessage}
          </output>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
          {projectError ? (
            <p className="mb-4 rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
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
                        onProjectSelectionStatus={announceDashboardStatus}
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
                      onReview={handleReviewSource}
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
              <PrivacyBoundaryPanel
                boundaries={[
                  privacyBoundaryCatalog.projectStorage,
                  privacyBoundaryCatalog.generatedAudio,
                  projectExportPrivacyBoundary(),
                ]}
                title="Storage and export boundary"
              />

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
                    <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-xs text-[var(--vs-status-warning)]">
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
  onProjectSelectionStatus,
  onRenameProject,
  onSelectProject,
}: Readonly<{
  activeProjectId: string;
  project: VoiceProject;
  onDeleteProject: (id: string) => Promise<void>;
  onProjectSelectionStatus: (message: string, options?: { focusStatus?: boolean }) => void;
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
  const selectProject = () => {
    if (isActive) {
      onProjectSelectionStatus(`${project.name} is already selected.`, { focusStatus: true });
      return;
    }
    onProjectSelectionStatus(`Opened ${project.name}.`);
    onSelectProject(project.id);
  };

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
        isActive
          ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
          : "vs-border vs-surface"
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
              onSelectProject={selectProject}
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
          onSelectProject={selectProject}
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

function projectDeleteDisabledReason(isProtected: boolean, isDeleting: boolean) {
  if (isProtected) {
    return "The default project is protected and cannot be deleted.";
  }
  if (isDeleting) {
    return "Project deletion is in progress.";
  }
}
