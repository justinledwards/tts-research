import { useMemo, useRef, useState } from "react";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import { formatDuration } from "./format";
import type {
  BookSource,
  CustomSpeechPolicyProfile,
  PreparedSource,
  ProjectStorageSummary,
  SpeechPolicyProfile,
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProject,
} from "./types";
import { SPEECH_POLICY_PROFILE_OPTIONS, speechPolicyProfileLabel } from "./speechPolicy";
import {
  CreateProjectRow,
  DrawerStat,
  EmptyDrawerText,
  ProjectLibraryRow,
  WorkspaceActivityRow,
  WorkspaceDashboardSummary,
  WorkspaceSection,
  buildWorkspaceActivitySummaries,
  formatBytes,
  type WorkspaceSectionId,
  workspaceSectionDescription,
  workspaceSectionHeadline,
} from "./WorkspaceDrawerHelpers";

const WORKSPACE_SECTIONS = [
  { id: "projects", label: "Projects", detail: "Project library and chapter sets" },
  { id: "activity", label: "Activity", detail: "Live work and cancellation" },
  { id: "voices", label: "Voices", detail: "Saved profiles and selection" },
  { id: "sources", label: "Sources", detail: "Books, URLs, and media" },
  { id: "imports", label: "Imports", detail: "Portable bundles" },
  { id: "reports", label: "Reports", detail: "Health and diagnostics" },
] as const;

// eslint-disable-next-line sonarjs/cognitive-complexity
export function WorkspaceDrawer({
  activeProjectId,
  bookSources,
  isOpen,
  job,
  metrics,
  metricsError,
  preparedSources,
  projectError,
  projectJobs,
  projectStorage,
  projectStorageError,
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
  onOpenProjectDashboard,
  onOpenVoiceDashboard,
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
  preparedSources: PreparedSource[];
  projectError: string | null;
  projectJobs: VoiceJob[];
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
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
  onOpenProjectDashboard: () => void;
  onOpenVoiceDashboard: () => void;
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
    sources: (bookSources.length + preparedSources.length + (profileSource ? 1 : 0)).toString(),
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                      data-testid="ui-action-project-dashboard-open-drawer"
                      data-ui-action-surface="Workspace"
                      onClick={onOpenProjectDashboard}
                      type="button"
                    >
                      Project Dashboard
                    </button>
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
                  </div>
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
                  <WorkspaceDashboardSummary
                    detail={
                      projectStorageError ??
                      `${formatBytes(projectStorage?.totalBytes ?? 0)} in current project storage`
                    }
                    label={activeProject?.name ?? "Draft"}
                    value={`${(preparedSources.length + bookSources.length).toString()} sources`}
                  />
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
                <WorkspaceSection
                  actions={
                    <button
                      className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                      data-testid="ui-action-voice-dashboard-open-drawer"
                      data-ui-action-surface="Workspace"
                      onClick={onOpenVoiceDashboard}
                      type="button"
                    >
                      Voice Dashboard
                    </button>
                  }
                  id="workspace-voices"
                  title="Voices"
                >
                  <WorkspaceDashboardSummary
                    detail={
                      selectedProfileId
                        ? "Selected profile is active for narration and preview."
                        : "Default voice is active until a profile is selected."
                    }
                    label={
                      profiles.find((profile) => profile.id === selectedProfileId)?.name ??
                      "Default voice"
                    }
                    value={`${profiles.length.toString()} saved`}
                  />
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
                  {preparedSources.length > 0 ? (
                    <div className="grid gap-2">
                      {preparedSources.slice(0, 5).map((source) => (
                        <div className="min-w-0 rounded-md border p-3 vs-raised" key={source.id}>
                          <div className="flex min-w-0 items-center justify-between gap-3">
                            <p
                              className="min-w-0 truncate text-sm font-semibold"
                              title={source.title ?? source.sourceName}
                            >
                              {source.title ?? source.sourceName}
                            </p>
                            <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize vs-border">
                              {source.kind}
                            </span>
                          </div>
                          <p className="vs-muted mt-1 truncate text-xs" title={source.sourceName}>
                            {source.wordCount.toLocaleString()} words · {source.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {!profileSource && bookSources.length === 0 && preparedSources.length === 0 ? (
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
