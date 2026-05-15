import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDuration } from "./format";
import type {
  BookSource,
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProject,
} from "./types";

export function WorkspaceDrawer({
  activeProjectId,
  bookSources,
  canSubmit,
  isOpen,
  isProcessing,
  job,
  metrics,
  metricsError,
  projectError,
  projectJobs,
  projects,
  profileSource,
  profiles,
  selectedProfileId,
  onCreateProject,
  onCreateAudio,
  onClose,
  onExportOpen,
  onImportOpen,
  onOpenSettings,
  onRenameProject,
  onSelectProject,
  onSelectProfile,
}: Readonly<{
  activeProjectId: string;
  bookSources: BookSource[];
  canSubmit: boolean;
  isOpen: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  projectError: string | null;
  projectJobs: VoiceJob[];
  projects: VoiceProject[];
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  selectedProfileId: string;
  onCreateProject: (name: string) => Promise<void>;
  onCreateAudio: () => void;
  onClose: () => void;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onOpenSettings: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSelectProject: (id: string) => void;
  onSelectProfile: (profileId: string) => void;
}>) {
  useEscapeClose(isOpen, onClose);
  const [newProjectName, setNewProjectName] = useState("");
  const [renameName, setRenameName] = useState("");
  const [isSavingProject, setIsSavingProject] = useState(false);
  const activeProject = useMemo<VoiceProject | null>(() => {
    const selectedProject = projects.find((project) => project.id === activeProjectId);
    if (selectedProject) {
      return selectedProject;
    }
    return projects.length > 0 ? projects[0] : null;
  }, [activeProjectId, projects]);
  const visibleJobs = useMemo(() => {
    if (!job) {
      return projectJobs;
    }
    if (projectJobs.some((item) => item.id === job.id)) {
      return projectJobs;
    }
    return [job, ...projectJobs];
  }, [job, projectJobs]);

  useEffect(() => {
    if (activeProject) {
      setRenameName(activeProject.name);
    }
  }, [activeProject]);

  if (!isOpen) {
    return null;
  }

  const gpu = metrics?.gpus?.[0];
  const providerStatus = metrics
    ? `${metrics.serviceVersion || "backend"} online`
    : (metricsError ?? "Provider status pending");

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Workspace"
        className="vs-app flex h-full w-full max-w-[920px] flex-col border-r shadow-2xl md:w-[86vw] xl:w-[920px]"
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">
              Workspace Library
            </p>
            <h2 className="truncate text-lg font-semibold">Voice Studio</h2>
          </div>
          <button
            aria-label="Close workspace"
            className="grid h-9 w-9 place-items-center rounded-md border hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[180px_minmax(0,1fr)]">
          <nav className="border-b p-4 vs-border md:border-r md:border-b-0">
            <div className="grid grid-cols-5 gap-2 md:grid-cols-1">
              {["Projects", "Voices", "Sources", "Imports", "Reports"].map((item, index) => (
                <a
                  className={`truncate rounded-md px-3 py-2 text-sm font-semibold transition ${
                    index === 0
                      ? "bg-orange-500 text-white"
                      : "vs-muted hover:bg-[var(--vs-surface)] hover:text-[var(--vs-text)]"
                  }`}
                  href={`#workspace-${item.toLowerCase()}`}
                  key={item}
                >
                  {item}
                </a>
              ))}
            </div>
          </nav>

          <div className="min-h-0 overflow-y-auto p-5">
            <WorkspaceSection id="workspace-projects" title="Projects">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <div className="grid gap-3">
                  {projects.map((project) => (
                    <ProjectLibraryRow
                      activeProjectId={activeProjectId}
                      key={project.id}
                      project={project}
                      visibleJobs={project.id === activeProjectId ? visibleJobs : []}
                      onSelectProject={onSelectProject}
                    />
                  ))}
                </div>
                <CurrentProjectPanel
                  activeProject={activeProject}
                  canSubmit={canSubmit}
                  isSavingProject={isSavingProject}
                  isProcessing={isProcessing}
                  job={job}
                  newProjectName={newProjectName}
                  projectError={projectError}
                  renameName={renameName}
                  visibleJobs={visibleJobs}
                  onClose={onClose}
                  onCreateAudio={onCreateAudio}
                  onCreateProject={onCreateProject}
                  onExportOpen={onExportOpen}
                  onRenameNameChange={setRenameName}
                  onRenameProject={onRenameProject}
                  onSavingProjectChange={setIsSavingProject}
                  onNewProjectNameChange={setNewProjectName}
                />
              </div>
            </WorkspaceSection>

            <WorkspaceSection id="workspace-voices" title="Voices">
              <div className="grid gap-2 md:grid-cols-2">
                {profiles.length > 0 ? (
                  profiles.slice(0, 8).map((profile) => (
                    <button
                      className={`min-w-0 rounded-md border p-3 text-left text-sm transition ${
                        profile.id === selectedProfileId
                          ? "border-orange-300 bg-orange-500/10"
                          : "vs-raised hover:bg-[var(--vs-surface)]"
                      }`}
                      key={profile.id}
                      onClick={() => {
                        onSelectProfile(profile.id);
                        onClose();
                      }}
                      type="button"
                    >
                      <span className="block truncate font-semibold" title={profile.name}>
                        {profile.name}
                      </span>
                      <span className="vs-muted mt-1 block truncate text-xs">
                        {profile.language} ·{" "}
                        {formatDuration(profile.referenceDurationMs ?? profile.durationMs)}
                      </span>
                    </button>
                  ))
                ) : (
                  <EmptyDrawerText>No saved voice profiles yet.</EmptyDrawerText>
                )}
              </div>
            </WorkspaceSection>

            <WorkspaceSection id="workspace-sources" title="Sources">
              <div className="grid gap-3">
                {profileSource ? (
                  <div className="rounded-md border p-4 vs-raised">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p
                        className="min-w-0 truncate text-sm font-semibold"
                        title={profileSource.sourceFile}
                      >
                        {profileSource.sourceFile}
                      </p>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs vs-border">
                        {profileSource.status}
                      </span>
                    </div>
                    <p className="vs-muted mt-2 text-xs">
                      {profileSource.candidates.length} detected voice
                      {profileSource.candidates.length === 1 ? "" : "s"} ·{" "}
                      {profileSource.progressMessage}
                    </p>
                  </div>
                ) : null}
                {bookSources.length > 0 ? (
                  <div className="grid gap-2">
                    {bookSources.slice(0, 5).map((book) => (
                      <div className="min-w-0 rounded-md border p-3 vs-raised" key={book.id}>
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <p
                            className="min-w-0 truncate text-sm font-semibold"
                            title={book.title ?? book.sourceFile}
                          >
                            {book.title ?? book.sourceFile}
                          </p>
                          <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize vs-border">
                            {book.kind}
                          </span>
                        </div>
                        <p className="vs-muted mt-1 truncate text-xs" title={book.sourceFile}>
                          {book.wordCount.toLocaleString()} words · {book.status}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {!profileSource && bookSources.length === 0 ? (
                  <EmptyDrawerText>No source analysis or book source staged.</EmptyDrawerText>
                ) : null}
              </div>
            </WorkspaceSection>

            <WorkspaceSection id="workspace-imports" title="Imports">
              <div className="grid gap-3 rounded-md border p-4 vs-surface">
                <p className="text-sm font-semibold">Shareable project bundles</p>
                <p className="vs-muted text-sm leading-6">
                  Import evaluates a bundle before mutation. Export includes portable assets needed
                  to review the project independently.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                    onClick={onImportOpen}
                    type="button"
                  >
                    Import Bundle
                  </button>
                  <button
                    className="h-9 rounded-md px-3 text-xs font-semibold text-white vs-accent-bg"
                    onClick={onExportOpen}
                    type="button"
                  >
                    Export Current
                  </button>
                </div>
              </div>
            </WorkspaceSection>

            <WorkspaceSection id="workspace-reports" title="Reports">
              <div className="grid gap-3 rounded-md border p-4 vs-surface">
                <p className="font-semibold">{providerStatus}</p>
                <p className="vs-muted text-xs">
                  {gpu
                    ? `${gpu.name} · ${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB`
                    : "GPU telemetry unavailable"}
                </p>
                <button
                  className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-[var(--vs-raised)] vs-border"
                  onClick={onOpenSettings}
                  type="button"
                >
                  Open diagnostics
                </button>
              </div>
            </WorkspaceSection>
          </div>
        </div>
      </aside>
    </div>
  );
}

function ProjectLibraryRow({
  activeProjectId,
  project,
  visibleJobs,
  onSelectProject,
}: Readonly<{
  activeProjectId: string;
  project: VoiceProject;
  visibleJobs: VoiceJob[];
  onSelectProject: (id: string) => void;
}>) {
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const primaryVoice =
    visibleJobs.find((item) => item.voiceProfileName)?.voiceProfileName ?? "Default";
  const qualityScore = resolveProjectQualityScore(visibleJobs);
  const isActive = project.id === activeProjectId;
  return (
    <button
      className={`grid min-w-0 gap-3 rounded-lg border p-4 text-left transition ${
        isActive ? "border-orange-300 bg-orange-500/10" : "vs-raised hover:bg-[var(--vs-surface)]"
      }`}
      onClick={() => {
        onSelectProject(project.id);
      }}
      type="button"
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold" title={project.name}>
            {project.name}
          </p>
          <p className="vs-muted mt-1 truncate text-xs" title={project.id}>
            Updated {formatDate(project.updatedAt)}
          </p>
        </div>
        <span className="shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold vs-border">
          {isActive ? "Open" : "Select"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <LibraryStat label="Chapters" value={String(visibleJobs.length)} />
        <LibraryStat label="Duration" value={formatDuration(generatedDurationMs)} />
        <LibraryStat label="Voice" value={primaryVoice} />
        <LibraryStat label="Quality" value={qualityScore} />
      </div>
    </button>
  );
}

function CurrentProjectPanel({
  activeProject,
  canSubmit,
  isSavingProject,
  isProcessing,
  job,
  newProjectName,
  projectError,
  renameName,
  visibleJobs,
  onClose,
  onCreateAudio,
  onCreateProject,
  onExportOpen,
  onNewProjectNameChange,
  onRenameNameChange,
  onRenameProject,
  onSavingProjectChange,
}: Readonly<{
  activeProject: VoiceProject | null;
  canSubmit: boolean;
  isSavingProject: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  newProjectName: string;
  projectError: string | null;
  renameName: string;
  visibleJobs: VoiceJob[];
  onClose: () => void;
  onCreateAudio: () => void;
  onCreateProject: (name: string) => Promise<void>;
  onExportOpen: () => void;
  onNewProjectNameChange: (name: string) => void;
  onRenameNameChange: (name: string) => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSavingProjectChange: (isSaving: boolean) => void;
}>) {
  const nextAction = resolveNextBestAction(job, visibleJobs);
  const canCreateAudio = canSubmit && !isProcessing;
  return (
    <aside className="grid min-w-0 gap-4 rounded-lg border p-4 vs-surface">
      <div>
        <p className="vs-muted text-xs font-semibold uppercase tracking-wide">Current project</p>
        <h3 className="mt-1 truncate text-lg font-semibold" title={activeProject?.name}>
          {activeProject?.name ?? "Default project"}
        </h3>
        <p className="vs-muted mt-1 text-sm">{nextAction}</p>
      </div>
      <form
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!activeProject || renameName.trim().length === 0) {
            return;
          }
          onSavingProjectChange(true);
          void onRenameProject(activeProject.id, renameName).finally(() => {
            onSavingProjectChange(false);
          });
        }}
      >
        <input
          aria-label="Rename project"
          className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm vs-border"
          onChange={(event) => {
            onRenameNameChange(event.currentTarget.value);
          }}
          title={renameName}
          value={renameName}
        />
        <button
          className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
          disabled={!activeProject || isSavingProject}
          type="submit"
        >
          Rename
        </button>
      </form>
      <form
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newProjectName.trim();
          if (name.length === 0) {
            return;
          }
          onSavingProjectChange(true);
          void onCreateProject(name)
            .then(() => {
              onNewProjectNameChange("");
            })
            .finally(() => {
              onSavingProjectChange(false);
            });
        }}
      >
        <input
          aria-label="New project name"
          className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm vs-border"
          onChange={(event) => {
            onNewProjectNameChange(event.currentTarget.value);
          }}
          placeholder="New project"
          title={newProjectName}
          value={newProjectName}
        />
        <button
          className="h-9 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
          disabled={newProjectName.trim().length === 0 || isSavingProject}
          type="submit"
        >
          New
        </button>
      </form>
      {projectError ? (
        <p className="break-words text-xs leading-5 text-red-700">{projectError}</p>
      ) : null}
      <div className="grid gap-2">
        <button
          className="h-10 rounded-md text-sm font-semibold text-white vs-accent-bg"
          disabled={job?.status !== "completed" && !canCreateAudio}
          onClick={job?.status === "completed" ? onClose : onCreateAudio}
          type="button"
        >
          {job?.status === "completed" ? "Continue Listening" : "Create Audio"}
        </button>
        <button
          className="h-10 rounded-md border text-sm font-semibold hover:bg-[var(--vs-raised)] vs-border"
          onClick={onExportOpen}
          type="button"
        >
          Export Bundle
        </button>
      </div>
    </aside>
  );
}

function WorkspaceSection({
  children,
  id,
  title,
}: Readonly<{ children: ReactNode; id: string; title: string }>) {
  return (
    <section className="mb-8 scroll-mt-6 last:mb-0" id={id}>
      <h3 className="vs-muted mb-3 text-xs font-semibold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}

function EmptyDrawerText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="vs-muted rounded-md border border-dashed p-4 text-sm vs-border">{children}</p>
  );
}

function LibraryStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <span className="min-w-0 rounded-md border px-2 py-1.5 vs-border">
      <span className="vs-muted block uppercase tracking-wide">{label}</span>
      <span className="block truncate font-semibold" title={value}>
        {value}
      </span>
    </span>
  );
}

function resolveProjectQualityScore(jobs: VoiceJob[]): string {
  const scores = jobs
    .map((item) => item.voiceCheck.similarity)
    .filter((value) => Number.isFinite(value) && value > 0);
  if (scores.length === 0) {
    return "pending";
  }
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return `${Math.round(average * 100).toString()}%`;
}

function resolveNextBestAction(job: VoiceJob | null, jobs: VoiceJob[]): string {
  if (job?.status === "completed") {
    return "Continue listening or export the finished bundle.";
  }
  if (job && job.status !== "failed" && job.status !== "cancelled") {
    return "Keep the studio open while audio arrives.";
  }
  if (jobs.length > 0) {
    return "Review quality, continue a chapter, or create the next one.";
  }
  return "Add source text and create the first listenable chapter.";
}

function formatDate(value: string): string {
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
