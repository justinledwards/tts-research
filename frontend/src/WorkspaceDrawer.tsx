import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import { formatDuration } from "./format";
import type {
  BookSource,
  CustomSpeechPolicyProfile,
  SpeechPolicyProfile,
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProject,
} from "./types";
import { SPEECH_POLICY_PROFILE_OPTIONS, speechPolicyProfileLabel } from "./speechPolicy";
import type { CancellableActivitySummary } from "./voiceStudioViewModels";

type WorkspaceActivitySummary = CancellableActivitySummary & {
  onCancel?: () => void;
};

const WORKSPACE_SECTIONS = [
  { id: "projects", label: "Projects", detail: "Project library and chapter sets" },
  { id: "activity", label: "Activity", detail: "Live work and cancellation" },
  { id: "voices", label: "Voices", detail: "Saved profiles and selection" },
  { id: "sources", label: "Sources", detail: "Books, URLs, and media" },
  { id: "imports", label: "Imports", detail: "Portable bundles" },
  { id: "reports", label: "Reports", detail: "Health and diagnostics" },
] as const;

type WorkspaceSectionId = (typeof WORKSPACE_SECTIONS)[number]["id"];

// eslint-disable-next-line sonarjs/cognitive-complexity
export function WorkspaceDrawer({
  activeProjectId,
  bookSources,
  isOpen,
  job,
  metrics,
  metricsError,
  projectError,
  projectJobs,
  projects,
  profileSource,
  profiles,
  customSpeechPolicyProfiles,
  speechPolicyProfile,
  speechPolicyProfiles,
  selectedProfileId,
  cancelingProfileSourceId,
  cancelingTargetKey,
  onCreateProject,
  onCancelJob,
  onCancelProfileSource,
  onCancelProfileTarget,
  onClose,
  onDeleteProject,
  onExportOpen,
  onImportOpen,
  onOpenSettings,
  onRenameProject,
  onSelectProject,
  onSelectProfile,
  onSpeechPolicyProfileChange,
}: Readonly<{
  activeProjectId: string;
  bookSources: BookSource[];
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  projectError: string | null;
  projectJobs: VoiceJob[];
  projects: VoiceProject[];
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  selectedProfileId: string;
  cancelingProfileSourceId: string | null;
  cancelingTargetKey: string | null;
  onCreateProject: (name: string) => Promise<void>;
  onCancelJob: () => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onClose: () => void;
  onDeleteProject: (id: string) => Promise<void>;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onOpenSettings: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSelectProject: (id: string) => void;
  onSelectProfile: (profileId: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  const drawerRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(drawerRef, { closeOnEscape: true, isOpen, onClose });
  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>("projects");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const visibleJobs = useMemo(() => {
    if (!job) {
      return projectJobs;
    }
    if (projectJobs.some((item) => item.id === job.id)) {
      return projectJobs;
    }
    return [job, ...projectJobs];
  }, [job, projectJobs]);
  const activitySummaries = useMemo(
    () =>
      buildWorkspaceActivitySummaries({
        cancelingProfileSourceId,
        cancelingTargetKey,
        job,
        onCancelJob,
        onCancelProfileSource,
        onCancelProfileTarget,
        profileSource,
        profiles,
      }),
    [
      cancelingProfileSourceId,
      cancelingTargetKey,
      job,
      onCancelJob,
      onCancelProfileSource,
      onCancelProfileTarget,
      profileSource,
      profiles,
    ],
  );

  if (!isOpen) {
    return null;
  }

  const gpu = metrics?.gpus?.[0];
  const providerStatus = metrics
    ? `${metrics.serviceVersion || "backend"} online`
    : (metricsError ?? "Provider status pending");
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeSectionLabel =
    WORKSPACE_SECTIONS.find((section) => section.id === activeSection)?.label ?? "Projects";
  const sectionCounts: Record<WorkspaceSectionId, string> = {
    activity: activitySummaries.length.toString(),
    imports: "",
    projects: projects.length.toString(),
    reports: metrics || metricsError ? "1" : "",
    sources: (bookSources.length + (profileSource ? 1 : 0)).toString(),
    voices: profiles.length.toString(),
  };

  return (
    <div className="fixed inset-0 z-40 bg-zinc-950/25" role="presentation">
      <aside
        aria-label="Workspace"
        aria-modal="true"
        className="vs-app flex h-full w-full max-w-[920px] flex-col border-r shadow-2xl md:w-[86vw] xl:w-[920px]"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between border-b px-5 py-4 vs-border">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">
              Workspace & Activity
            </p>
            <h2 className="truncate text-lg font-semibold">Voice Studio</h2>
          </div>
          <button
            aria-label="Close workspace"
            className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="border-b p-4 vs-border md:border-r md:border-b-0">
            <div className="grid gap-3 rounded-md border p-3 vs-border vs-surface">
              <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                Command Center
              </p>
              <div className="grid gap-2">
                <DrawerStat label="Project" value={activeProject?.name ?? "Draft"} />
                <DrawerStat
                  label="Background work"
                  value={
                    activitySummaries.length > 0
                      ? `${activitySummaries.length.toString()} active`
                      : "Idle"
                  }
                />
                <DrawerStat label="Backend" value={metrics ? "Online" : "Pending"} />
              </div>
            </div>
            <div className="mt-4 grid gap-1.5">
              {WORKSPACE_SECTIONS.map((section) => (
                <button
                  className={`grid min-w-0 gap-1 rounded-md border px-3 py-2 text-left transition ${
                    activeSection === section.id
                      ? "border-orange-300 bg-orange-500 text-white shadow-sm"
                      : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
                  }`}
                  key={section.id}
                  onClick={() => {
                    setActiveSection(section.id);
                  }}
                  type="button"
                >
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{section.label}</span>
                    {sectionCounts[section.id] ? (
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[0.65rem] ${
                          activeSection === section.id
                            ? "border-white/35 text-white"
                            : "vs-border vs-muted"
                        }`}
                      >
                        {sectionCounts[section.id]}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`truncate text-[0.68rem] ${
                      activeSection === section.id ? "text-white/80" : "vs-muted"
                    }`}
                  >
                    {section.detail}
                  </span>
                </button>
              ))}
            </div>
          </nav>

          <div className="min-h-0 overflow-y-auto p-5">
            <div className="mb-5 grid gap-2 rounded-md border p-4 vs-border vs-surface">
              <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                {activeSectionLabel}
              </p>
              <h3 className="text-xl font-semibold">{workspaceSectionHeadline(activeSection)}</h3>
              <p className="vs-muted text-sm leading-6">
                {workspaceSectionDescription(activeSection)}
              </p>
            </div>

            {activeSection === "projects" ? (
              <WorkspaceSection
                actions={
                  <button
                    className="h-9 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
                    disabled={isCreatingProject}
                    onClick={() => {
                      setIsCreatingProject(true);
                    }}
                    type="button"
                  >
                    New Project
                  </button>
                }
                id="workspace-projects"
                title={`Projects (${projects.length.toString()})`}
              >
                <div className="grid gap-3">
                  {isCreatingProject ? (
                    <CreateProjectRow
                      onCancel={() => {
                        setIsCreatingProject(false);
                      }}
                      onCreateProject={onCreateProject}
                      onCreated={() => {
                        setIsCreatingProject(false);
                      }}
                    />
                  ) : null}
                  {projectError ? (
                    <p className="break-words rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
                      {projectError}
                    </p>
                  ) : null}
                  {projects.length > 0 ? (
                    projects.map((project) => (
                      <ProjectLibraryRow
                        activeProjectId={activeProjectId}
                        key={project.id}
                        project={project}
                        visibleJobs={project.id === activeProjectId ? visibleJobs : []}
                        onDeleteProject={onDeleteProject}
                        onExportProject={onExportOpen}
                        onRenameProject={onRenameProject}
                        onSelectProject={onSelectProject}
                      />
                    ))
                  ) : (
                    <EmptyDrawerText>No projects yet. Create one to start fresh.</EmptyDrawerText>
                  )}
                </div>
              </WorkspaceSection>
            ) : null}

            {activeSection === "activity" ? (
              <WorkspaceSection id="workspace-activity" title="Activity">
                <div className="grid gap-3">
                  {activitySummaries.length > 0 ? (
                    activitySummaries.map((activity) => (
                      <WorkspaceActivityRow activity={activity} key={activity.id} />
                    ))
                  ) : (
                    <EmptyDrawerText>
                      No active background work. New runs, source analysis, and clone target builds
                      will appear here with cancellation controls.
                    </EmptyDrawerText>
                  )}
                </div>
              </WorkspaceSection>
            ) : null}

            {activeSection === "voices" ? (
              <>
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

                <WorkspaceSection id="workspace-speech" title="Speech Policy">
                  <div className="grid gap-2 rounded-md border p-4 vs-surface">
                    <label className="grid gap-1 text-sm font-semibold">
                      <span>Market profile</span>
                      <select
                        className="h-10 rounded-md border bg-[var(--vs-raised)] px-3 text-sm outline-none vs-border"
                        onChange={(event) => {
                          onSpeechPolicyProfileChange(event.currentTarget.value);
                        }}
                        value={speechPolicyProfile}
                      >
                        {(speechPolicyProfiles.length > 0
                          ? speechPolicyProfiles.map((profile) => profile.name)
                          : SPEECH_POLICY_PROFILE_OPTIONS
                        ).map((profile) => (
                          <option key={profile} value={profile}>
                            {speechPolicyProfileLabel(profile)}
                          </option>
                        ))}
                        {customSpeechPolicyProfiles.length > 0 ? (
                          <optgroup label="Custom profiles">
                            {customSpeechPolicyProfiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                      </select>
                    </label>
                  </div>
                </WorkspaceSection>
              </>
            ) : null}

            {activeSection === "sources" ? (
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
            ) : null}

            {activeSection === "imports" ? (
              <WorkspaceSection id="workspace-imports" title="Imports">
                <div className="grid gap-3 rounded-md border p-4 vs-surface">
                  <p className="text-sm font-semibold">Shareable project bundles</p>
                  <p className="vs-muted text-sm leading-6">
                    Import evaluates a bundle before mutation. Export includes portable assets
                    needed to review the project independently.
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
            ) : null}

            {activeSection === "reports" ? (
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
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function DrawerStat({ label, value }: Readonly<{ label: string; value: string }>) {
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

function workspaceSectionHeadline(section: WorkspaceSectionId): string {
  const headlines: Record<WorkspaceSectionId, string> = {
    activity: "Background work that can be understood and stopped",
    imports: "Move projects in and out without leaving the studio",
    projects: "Project library and current chapter context",
    reports: "System health, diagnostics, and provider readiness",
    sources: "Reusable source material and voice reference media",
    voices: "Saved voice profiles and speech policy",
  };
  return headlines[section];
}

function workspaceSectionDescription(section: WorkspaceSectionId): string {
  const descriptions: Record<WorkspaceSectionId, string> = {
    activity:
      "Every long-running task belongs here with plain status, last-known detail, and a cancellation path when the backend supports it.",
    imports:
      "Bundle operations are grouped here so the header can stay compact and the workbench can stay focused on source and review.",
    projects:
      "Open, rename, export, or protect projects from one stable command surface without disturbing the current workbench.",
    reports:
      "A short operational view for backend status, GPU telemetry, and the route into deeper diagnostics.",
    sources:
      "Books, prepared files, URLs, and reference media are collected here as reusable project material.",
    voices:
      "Voice selection and speech policy live together because they shape how narration is produced.",
  };
  return descriptions[section];
}

function WorkspaceActivityRow({
  activity,
}: Readonly<{
  activity: WorkspaceActivitySummary;
}>) {
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
            className="h-9 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
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

function buildWorkspaceActivitySummaries({
  cancelingProfileSourceId,
  cancelingTargetKey,
  job,
  onCancelJob,
  onCancelProfileSource,
  onCancelProfileTarget,
  profileSource,
  profiles,
}: Readonly<{
  cancelingProfileSourceId: string | null;
  cancelingTargetKey: string | null;
  job: VoiceJob | null;
  onCancelJob: () => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
}>): WorkspaceActivitySummary[] {
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
    return "bg-orange-100 text-orange-700";
  }
  if (status === "attention") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "complete") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "cancelled") {
    return "bg-zinc-100 text-zinc-600";
  }
  return "bg-zinc-100 text-zinc-600";
}

function CreateProjectRow({
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
      className="grid min-w-0 gap-3 rounded-md border border-orange-200 bg-orange-500/5 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submitCreate();
      }}
    >
      <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
        <input
          aria-label="New project name"
          className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm font-semibold vs-border"
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
          className="h-9 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
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

function ProjectLibraryRow({
  activeProjectId,
  project,
  visibleJobs,
  onDeleteProject,
  onExportProject,
  onRenameProject,
  onSelectProject,
}: Readonly<{
  activeProjectId: string;
  project: VoiceProject;
  visibleJobs: VoiceJob[];
  onDeleteProject: (id: string) => Promise<void>;
  onExportProject: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSelectProject: (id: string) => void;
}>) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSavingName, setIsSavingName] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const primaryVoice =
    visibleJobs.find((item) => item.voiceProfileName)?.voiceProfileName ?? "Default";
  const qualityScore = resolveProjectQualityScore(visibleJobs);
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
        isActive ? "border-orange-300 bg-orange-500/5" : "vs-raised hover:bg-[var(--vs-surface)]"
      }`}
    >
      {isActive ? <span className="absolute inset-y-0 left-0 w-1 bg-orange-500" /> : null}
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
                className="h-9 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
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
                className="min-w-0 truncate text-left text-base font-semibold hover:text-orange-700"
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
            className="h-8 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-45"
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
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-semibold">Delete “{project.name}”?</p>
          <p className="mt-1 text-xs leading-5">
            This removes this project’s jobs, generated audio, books, prepared sources, and
            listening progress. Voice profiles stay in your library.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className="h-8 rounded-md bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
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
              className="h-8 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-700"
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

function WorkspaceSection({
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

function EmptyDrawerText({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <p className="vs-muted rounded-md border border-dashed p-4 text-sm vs-border">{children}</p>
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
