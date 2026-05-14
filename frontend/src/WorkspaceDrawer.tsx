import { useEffect, useMemo, useState, type ReactNode } from "react";
import { formatDuration } from "./format";
import type {
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProject,
} from "./types";

export function WorkspaceDrawer({
  activeProjectId,
  isOpen,
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
  onClose,
  onOpenSettings,
  onRenameProject,
  onSelectProject,
  onSelectProfile,
}: Readonly<{
  activeProjectId: string;
  isOpen: boolean;
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
  onClose: () => void;
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
        className="flex h-full w-full max-w-[460px] flex-col border-r border-zinc-200 bg-white shadow-2xl md:w-[420px]"
      >
        <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Workspace</p>
            <h2 className="text-lg font-semibold text-zinc-950">Voice Studio</h2>
          </div>
          <button
            aria-label="Close workspace"
            className="grid h-9 w-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <WorkspaceSection title="Project">
            <div className="grid min-w-0 gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="text-xs font-medium text-zinc-500">Selected project</span>
                <select
                  className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-950"
                  onChange={(event) => {
                    onSelectProject(event.currentTarget.value);
                  }}
                  value={activeProject ? activeProject.id : ""}
                >
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </label>
              <form
                className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!activeProject || renameName.trim().length === 0) {
                    return;
                  }
                  setIsSavingProject(true);
                  void onRenameProject(activeProject.id, renameName).finally(() => {
                    setIsSavingProject(false);
                  });
                }}
              >
                <input
                  aria-label="Rename project"
                  className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  onChange={(event) => {
                    setRenameName(event.currentTarget.value);
                  }}
                  title={renameName}
                  value={renameName}
                />
                <button
                  className="h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
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
                  setIsSavingProject(true);
                  void onCreateProject(name)
                    .then(() => {
                      setNewProjectName("");
                    })
                    .finally(() => {
                      setIsSavingProject(false);
                    });
                }}
              >
                <input
                  aria-label="New project name"
                  className="min-w-0 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
                  onChange={(event) => {
                    setNewProjectName(event.currentTarget.value);
                  }}
                  placeholder="New project"
                  title={newProjectName}
                  value={newProjectName}
                />
                <button
                  className="h-9 rounded-md bg-orange-500 px-3 text-xs font-semibold text-white hover:bg-orange-600 disabled:bg-zinc-300"
                  disabled={newProjectName.trim().length === 0 || isSavingProject}
                  type="submit"
                >
                  Create
                </button>
              </form>
              {projectError ? (
                <p className="break-words text-xs leading-5 text-red-700">{projectError}</p>
              ) : (
                <p
                  className="truncate text-xs text-zinc-500"
                  title={activeProject ? activeProject.id : ""}
                >
                  {job?.id ? `Active job ${job.id.slice(0, 8)}` : "No active job"}
                </p>
              )}
            </div>
          </WorkspaceSection>

          <WorkspaceSection title="Recent Jobs">
            {visibleJobs.length > 0 ? (
              <div className="grid gap-2">
                {visibleJobs.slice(0, 6).map((item) => (
                  <div
                    className="min-w-0 rounded-md border border-zinc-200 bg-white p-4"
                    key={item.id}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <p
                        className="min-w-0 truncate text-sm font-semibold text-zinc-950"
                        title={item.voiceProfileName ?? "Default voice"}
                      >
                        {item.voiceProfileName ?? "Default voice"}
                      </p>
                      <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-w-0 break-words text-xs leading-5 text-zinc-500">
                      {item.inputText.trim().length > 0 ? item.inputText : "Draft source text"}
                    </p>
                    <p className="mt-3 truncate text-xs text-zinc-500">
                      {Math.max(item.retries.totalSegments, item.segments?.length ?? 0)} segments ·{" "}
                      {formatDuration(item.durationMs)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyDrawerText>No jobs saved for this project yet.</EmptyDrawerText>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Voice Profiles">
            <div className="grid gap-2">
              {profiles.length > 0 ? (
                profiles.slice(0, 8).map((profile) => (
                  <button
                    className={`min-w-0 rounded-md border p-3 text-left text-sm transition ${
                      profile.id === selectedProfileId
                        ? "border-orange-300 bg-orange-50 text-orange-950"
                        : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50"
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
                    <span className="mt-1 block truncate text-xs text-zinc-500">
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

          <WorkspaceSection title="Source Analyses">
            {profileSource ? (
              <div className="rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <p
                    className="min-w-0 truncate text-sm font-semibold text-zinc-950"
                    title={profileSource.sourceFile}
                  >
                    {profileSource.sourceFile}
                  </p>
                  <span className="shrink-0 rounded-full border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600">
                    {profileSource.status}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {profileSource.candidates.length} detected voice
                  {profileSource.candidates.length === 1 ? "" : "s"} ·{" "}
                  {profileSource.progressMessage}
                </p>
              </div>
            ) : (
              <EmptyDrawerText>No source analysis staged.</EmptyDrawerText>
            )}
          </WorkspaceSection>

          <WorkspaceSection title="Runtime">
            <div className="grid gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm">
              <p className="font-semibold text-zinc-950">{providerStatus}</p>
              <p className="text-xs text-zinc-500">
                {gpu
                  ? `${gpu.name} · ${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB`
                  : "GPU telemetry unavailable"}
              </p>
              <button
                className="mt-2 h-9 rounded-md border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                onClick={onOpenSettings}
                type="button"
              >
                Open Settings
              </button>
            </div>
          </WorkspaceSection>
        </div>
      </aside>
    </div>
  );
}

function WorkspaceSection({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function EmptyDrawerText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
      {children}
    </p>
  );
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
