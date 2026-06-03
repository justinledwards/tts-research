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
import {
  COMMAND_CENTER_ROUTES,
  commandCenterGeneratedAudioState,
  sortCommandCenterProjects,
  visibleCommandCenterJobs,
} from "./features/command-center";
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
  commandCenterSectionDescription,
  commandCenterSectionHeadline,
  formatBytes,
  formatDate,
  resolveProjectQualityScore,
  type CommandCenterSectionId,
} from "./WorkspaceDrawerHelpers";

// eslint-disable-next-line sonarjs/cognitive-complexity
export function WorkspaceDrawer({
  activeProjectId,
  activeScopeLabel,
  activeSection,
  activeSourceLabel,
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
  returnWorkspaceLabel,
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
  onOpenVoiceDashboard,
  onRenameProject,
  onSectionChange,
  onSelectProject,
  onSelectProfile,
  onSpeechPolicyProfileChange,
}: Readonly<{
  activeProjectId: string;
  activeScopeLabel: string;
  activeSection?: CommandCenterSectionId;
  activeSourceLabel: string;
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
  returnWorkspaceLabel: string;
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
  onOpenVoiceDashboard: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onSectionChange?: (section: CommandCenterSectionId) => void;
  onSelectProject: (id: string) => void;
  onSelectProfile: (profileId: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  const drawerRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(drawerRef, { closeOnEscape: true, isOpen, onClose });
  const [localActiveSection, setLocalActiveSection] = useState<CommandCenterSectionId>("overview");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const effectiveActiveSection = activeSection ?? localActiveSection;
  const visibleJobs = useMemo(
    () => visibleCommandCenterJobs({ activeProjectId, job, projectJobs }),
    [activeProjectId, job, projectJobs],
  );
  const sortedProjects = useMemo(
    () => sortCommandCenterProjects(projects, activeProjectId),
    [activeProjectId, projects],
  );
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
    COMMAND_CENTER_ROUTES.find((section) => section.id === effectiveActiveSection)?.label ??
    "Overview";
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const totalSources = bookSources.length + preparedSources.length;
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const generatedAudioState = commandCenterGeneratedAudioState(visibleJobs);
  const currentWorkSource = `${activeSourceLabel} · ${activeScopeLabel}`;
  const selectedVoiceLabel = selectedProfile?.name ?? "Default";
  const sectionCounts: Record<CommandCenterSectionId, string> = {
    activity: activitySummaries.length > 0 ? activitySummaries.length.toString() : "",
    assets: (totalSources + profiles.length + (profileSource ? 1 : 0)).toString(),
    importsExports: "",
    overview: "",
    projects: projects.length.toString(),
    reports: metrics || metricsError || projectStorage || projectStorageError ? "1" : "",
  };

  const setActiveSection = (section: CommandCenterSectionId) => {
    setLocalActiveSection(section);
    onSectionChange?.(section);
  };

  return (
    <div className="fixed inset-0 z-40 bg-[var(--vs-surface-overlay)]" role="presentation">
      <aside
        aria-label="Command Center"
        aria-modal="true"
        className="vs-app mx-auto flex h-full w-full max-w-6xl flex-col border-r shadow-2xl md:w-[92vw] xl:w-[1120px]"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4 vs-border">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-medium uppercase tracking-wide">
              Project and activity management
            </p>
            <h2 className="truncate text-lg font-semibold">Command Center</h2>
          </div>
          <button
            aria-label={`Return to ${returnWorkspaceLabel}`}
            className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-surface)] vs-border"
            data-testid="ui-action-command-center-return"
            onClick={onClose}
            type="button"
          >
            Return to {returnWorkspaceLabel}
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden md:grid-cols-[230px_minmax(0,1fr)]">
          <nav className="border-b p-4 vs-border md:border-r md:border-b-0">
            <div className="grid gap-3 rounded-md border p-3 vs-border vs-surface">
              <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                Current work
              </p>
              <div className="grid gap-2">
                <DrawerStat label="Project" value={activeProject?.name ?? "Draft"} />
                <DrawerStat label="Source / scope" value={currentWorkSource} />
                <DrawerStat label="Voice" value={selectedVoiceLabel} />
                <DrawerStat label="Generated audio" value={generatedAudioState} />
                <DrawerStat
                  label="Background work"
                  value={
                    activitySummaries.length > 0
                      ? `${activitySummaries.length.toString()} active`
                      : "Idle"
                  }
                />
              </div>
            </div>
            <div className="mt-4 grid gap-1.5">
              {COMMAND_CENTER_ROUTES.map((section) => (
                <button
                  aria-current={effectiveActiveSection === section.id ? "page" : undefined}
                  className={`grid min-w-0 gap-1 rounded-md border px-3 py-2 text-left transition ${
                    effectiveActiveSection === section.id
                      ? "border-[var(--vs-selected-border)] bg-[var(--vs-action-primary)] text-[var(--vs-action-primary-text)] shadow-sm"
                      : "vs-border vs-raised hover:bg-[var(--vs-surface)]"
                  }`}
                  data-testid={`ui-action-command-center-section-${section.id}`}
                  data-ui-action-owner="command-center"
                  data-ui-noop-reason={
                    effectiveActiveSection === section.id
                      ? "Command Center section is already selected."
                      : undefined
                  }
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
                          effectiveActiveSection === section.id
                            ? "border-[var(--vs-theatre-panel-border)] text-[var(--vs-action-primary-text)]"
                            : "vs-border vs-muted"
                        }`}
                      >
                        {sectionCounts[section.id]}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`truncate text-[0.68rem] ${
                      effectiveActiveSection === section.id
                        ? "text-[var(--vs-theatre-muted)]"
                        : "vs-muted"
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
              <h3 className="text-xl font-semibold">
                {commandCenterSectionHeadline(effectiveActiveSection)}
              </h3>
              <p className="vs-muted text-sm leading-6">
                {commandCenterSectionDescription(effectiveActiveSection)}
              </p>
            </div>

            {effectiveActiveSection === "overview" ? (
              <CommandCenterOverview
                activityCount={activitySummaries.length}
                activeProjectName={activeProject?.name ?? "Draft"}
                activeScopeLabel={activeScopeLabel}
                activeSourceLabel={activeSourceLabel}
                generatedAudioState={generatedAudioState}
                generatedDurationMs={generatedDurationMs}
                projectStorage={projectStorage}
                projectStorageError={projectStorageError}
                projectsCount={projects.length}
                providerStatus={providerStatus}
                selectedProfile={selectedProfile}
                onExportOpen={onExportOpen}
                onImportOpen={onImportOpen}
                onOpenActivity={() => {
                  setActiveSection("activity");
                }}
                onOpenAssets={() => {
                  setActiveSection("assets");
                }}
                onOpenProjects={() => {
                  setActiveSection("projects");
                }}
                onOpenReports={() => {
                  setActiveSection("reports");
                }}
              />
            ) : null}

            {effectiveActiveSection === "projects" ? (
              <WorkspaceSection
                actions={
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-md px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] disabled:opacity-50 vs-accent-bg"
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
                id="command-center-projects"
                title={`Projects (${projects.length.toString()})`}
              >
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
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
                      <p className="break-words rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-xs leading-5 text-[var(--vs-status-danger)]">
                        {projectError}
                      </p>
                    ) : null}
                    <WorkspaceDashboardSummary
                      detail={
                        projectStorageError ??
                        `${formatBytes(projectStorage?.totalBytes ?? 0)} in current project storage`
                      }
                      label={activeProject?.name ?? "Draft"}
                      value={`${totalSources.toString()} sources`}
                    />
                    {sortedProjects.length > 0 ? (
                      sortedProjects.map((project) => (
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
                      <EmptyDrawerText>
                        No saved projects yet. Create a project when you want a separate library, or
                        keep using the draft workspace.
                      </EmptyDrawerText>
                    )}
                  </div>
                  <GeneratedAudioList visibleJobs={visibleJobs} />
                </div>
              </WorkspaceSection>
            ) : null}

            {effectiveActiveSection === "assets" ? (
              <WorkspaceSection
                actions={
                  <button
                    className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                    data-testid="ui-action-voice-dashboard-open-drawer"
                    data-ui-action-surface="Command Center"
                    onClick={onOpenVoiceDashboard}
                    type="button"
                  >
                    Voice Asset Detail
                  </button>
                }
                id="command-center-assets"
                title="Assets"
              >
                <div className="grid gap-4 xl:grid-cols-2">
                  <SourceAssetList
                    bookSources={bookSources}
                    preparedSources={preparedSources}
                    profileSource={profileSource}
                  />
                  <VoiceAssetList
                    customSpeechPolicyProfiles={customSpeechPolicyProfiles}
                    profiles={profiles}
                    selectedProfileId={selectedProfileId}
                    speechPolicyProfile={speechPolicyProfile}
                    speechPolicyProfiles={speechPolicyProfiles}
                    onClose={onClose}
                    onSelectProfile={onSelectProfile}
                    onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
                  />
                </div>
              </WorkspaceSection>
            ) : null}

            {effectiveActiveSection === "activity" ? (
              <WorkspaceSection id="command-center-activity" title="Activity">
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

            {effectiveActiveSection === "importsExports" ? (
              <WorkspaceSection id="command-center-imports-exports" title="Imports and Exports">
                <div className="grid gap-3 rounded-md border p-4 vs-surface">
                  <p className="text-sm font-semibold">Shareable project bundles</p>
                  <p className="vs-muted text-sm leading-6">
                    Import evaluates a bundle before mutation. Export includes portable assets
                    needed to review the project independently.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                      data-testid="ui-action-command-center-import"
                      onClick={onImportOpen}
                      type="button"
                    >
                      Import Bundle
                    </button>
                    <button
                      className="h-9 rounded-md px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] vs-accent-bg"
                      data-testid="ui-action-command-center-export"
                      onClick={onExportOpen}
                      type="button"
                    >
                      Export Current
                    </button>
                  </div>
                </div>
              </WorkspaceSection>
            ) : null}

            {effectiveActiveSection === "reports" ? (
              <WorkspaceSection id="command-center-reports" title="Reports">
                <div className="grid gap-3 rounded-md border p-4 vs-surface">
                  <p className="font-semibold">{providerStatus}</p>
                  <p className="vs-muted text-xs">
                    {gpu
                      ? `${gpu.name} - ${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB`
                      : "GPU telemetry unavailable"}
                  </p>
                  <StorageBreakdown
                    projectStorage={projectStorage}
                    projectStorageError={projectStorageError}
                  />
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

function CommandCenterOverview({
  activityCount,
  activeProjectName,
  activeScopeLabel,
  activeSourceLabel,
  generatedAudioState,
  generatedDurationMs,
  projectStorage,
  projectStorageError,
  projectsCount,
  providerStatus,
  selectedProfile,
  onExportOpen,
  onImportOpen,
  onOpenActivity,
  onOpenAssets,
  onOpenProjects,
  onOpenReports,
}: Readonly<{
  activityCount: number;
  activeProjectName: string;
  activeScopeLabel: string;
  activeSourceLabel: string;
  generatedAudioState: string;
  generatedDurationMs: number;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  projectsCount: number;
  providerStatus: string;
  selectedProfile: VoiceProfile | null;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onOpenActivity: () => void;
  onOpenAssets: () => void;
  onOpenProjects: () => void;
  onOpenReports: () => void;
}>) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OverviewStat
          detail={`${projectsCount.toString()} total projects`}
          label="Current project"
          value={activeProjectName}
        />
        <OverviewStat detail={activeScopeLabel} label="Active source" value={activeSourceLabel} />
        <OverviewStat
          detail={formatDuration(generatedDurationMs)}
          label="Generated audio"
          value={generatedAudioState}
        />
        <OverviewStat
          detail={selectedProfile?.status ?? "provider voice"}
          label="Voice"
          value={selectedProfile?.name ?? "Default"}
        />
      </div>
      <div className="grid gap-3 rounded-md border p-4 vs-border vs-surface">
        <p className="text-sm font-semibold">Management routes</p>
        <div className="grid gap-2 md:grid-cols-3">
          <OverviewRouteButton
            detail="Open, rename, export, or protect projects."
            onClick={onOpenProjects}
          >
            Projects
          </OverviewRouteButton>
          <OverviewRouteButton
            detail="Manage sources, voice assets, and policy."
            onClick={onOpenAssets}
          >
            Assets
          </OverviewRouteButton>
          <OverviewRouteButton
            detail={
              activityCount > 0
                ? `${activityCount.toString()} active item(s).`
                : "No active background work."
            }
            onClick={onOpenActivity}
          >
            Activity
          </OverviewRouteButton>
          <OverviewRouteButton
            detail="Preview import and export project bundles."
            onClick={onImportOpen}
          >
            Import Bundle
          </OverviewRouteButton>
          <OverviewRouteButton detail="Export the active project bundle." onClick={onExportOpen}>
            Export Current
          </OverviewRouteButton>
          <OverviewRouteButton detail={providerStatus} onClick={onOpenReports}>
            Reports
          </OverviewRouteButton>
        </div>
      </div>
      <StorageBreakdown projectStorage={projectStorage} projectStorageError={projectStorageError} />
    </div>
  );
}

function OverviewStat({
  detail,
  label,
  value,
}: Readonly<{ detail: string; label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md border p-4 vs-border vs-raised">
      <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold" title={value}>
        {value}
      </p>
      <p className="vs-muted mt-1 truncate text-xs" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function OverviewRouteButton({
  children,
  detail,
  onClick,
}: Readonly<{ children: string; detail: string; onClick: () => void }>) {
  return (
    <button
      className="grid min-h-24 min-w-0 content-start gap-2 rounded-md border p-3 text-left transition hover:border-[var(--vs-selected-border)] hover:text-[var(--vs-selected-text)] vs-border vs-raised"
      onClick={onClick}
      type="button"
    >
      <span className="text-sm font-semibold">{children}</span>
      <span className="vs-muted text-xs leading-5">{detail}</span>
    </button>
  );
}

function SourceAssetList({
  bookSources,
  preparedSources,
  profileSource,
}: Readonly<{
  bookSources: BookSource[];
  preparedSources: PreparedSource[];
  profileSource: VoiceProfileSource | null;
}>) {
  return (
    <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
      <p className="text-sm font-semibold">Sources</p>
      {profileSource ? (
        <div className="rounded-md border p-3 vs-raised">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold" title={profileSource.sourceFile}>
              {profileSource.sourceFile}
            </p>
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs vs-border">
              {profileSource.status}
            </span>
          </div>
          <p className="vs-muted mt-2 text-xs">
            {profileSource.candidates.length} detected voice
            {profileSource.candidates.length === 1 ? "" : "s"} - {profileSource.progressMessage}
          </p>
        </div>
      ) : null}
      {bookSources.map((book) => (
        <SourceAssetRow
          detail={`${book.wordCount.toLocaleString()} words - ${book.status}`}
          key={book.id}
          kind={book.kind}
          title={book.title ?? book.sourceFile}
        />
      ))}
      {preparedSources.map((source) => (
        <SourceAssetRow
          detail={`${source.wordCount.toLocaleString()} words - ${source.status}`}
          key={source.id}
          kind={source.kind}
          title={source.title ?? source.sourceName}
        />
      ))}
      {!profileSource && bookSources.length === 0 && preparedSources.length === 0 ? (
        <EmptyDrawerText>No source analysis or book source staged.</EmptyDrawerText>
      ) : null}
    </div>
  );
}

function SourceAssetRow({
  detail,
  kind,
  title,
}: Readonly<{ detail: string; kind: string; title: string }>) {
  return (
    <div className="min-w-0 rounded-md border p-3 vs-raised">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold" title={title}>
          {title}
        </p>
        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize vs-border">
          {kind}
        </span>
      </div>
      <p className="vs-muted mt-1 truncate text-xs" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function VoiceAssetList({
  customSpeechPolicyProfiles,
  profiles,
  selectedProfileId,
  speechPolicyProfile,
  speechPolicyProfiles,
  onClose,
  onSelectProfile,
  onSpeechPolicyProfileChange,
}: Readonly<{
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  profiles: VoiceProfile[];
  selectedProfileId: string;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  onClose: () => void;
  onSelectProfile: (profileId: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  return (
    <div className="grid content-start gap-4">
      <div className="grid gap-3 rounded-md border p-4 vs-border vs-surface">
        <p className="text-sm font-semibold">Voice profiles</p>
        <WorkspaceDashboardSummary
          detail={
            selectedProfileId
              ? "Selected profile is active for narration and preview."
              : "Default voice is active until a profile is selected."
          }
          label={
            profiles.find((profile) => profile.id === selectedProfileId)?.name ?? "Default voice"
          }
          value={`${profiles.length.toString()} saved`}
        />
        <div className="grid gap-2">
          {profiles.length > 0 ? (
            profiles.map((profile) => (
              <button
                className={`min-w-0 rounded-md border p-3 text-left text-sm transition ${
                  profile.id === selectedProfileId
                    ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
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
                  {profile.language} -{" "}
                  {formatDuration(profile.referenceDurationMs ?? profile.durationMs)}
                </span>
              </button>
            ))
          ) : (
            <EmptyDrawerText>No saved voice profiles yet.</EmptyDrawerText>
          )}
        </div>
      </div>
      <div className="grid gap-2 rounded-md border p-4 vs-border vs-surface">
        <p className="text-sm font-semibold">Speech Policy</p>
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
    </div>
  );
}

function GeneratedAudioList({ visibleJobs }: Readonly<{ visibleJobs: VoiceJob[] }>) {
  return (
    <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
      <p className="text-sm font-semibold">Generated Audio</p>
      {visibleJobs.length > 0 ? (
        visibleJobs.slice(0, 8).map((item) => (
          <div className="grid gap-1 rounded-md border p-3 vs-raised" key={item.id}>
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold" title={item.inputText}>
                {generatedAudioTitle(item)}
              </p>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize vs-border">
                {item.status}
              </span>
            </div>
            <p className="vs-muted truncate text-xs" title={generatedAudioDetail(item)}>
              {generatedAudioDetail(item)}
            </p>
          </div>
        ))
      ) : (
        <EmptyDrawerText>
          No generated audio is attached to the current project yet.
        </EmptyDrawerText>
      )}
    </div>
  );
}

function generatedAudioTitle(item: VoiceJob): string {
  const inputText = item.inputText.trim();
  if (inputText.length > 0) {
    return inputText;
  }
  return item.voiceProfileName ?? item.voice;
}

function generatedAudioDetail(item: VoiceJob): string {
  return [
    generatedAudioSourceLabel(item),
    generatedAudioSegmentProgress(item),
    formatDuration(item.durationMs),
    generatedAudioVoiceLabel(item),
    `${resolveProjectQualityScore([item])} check`,
    `Updated ${formatDate(item.updatedAt || item.createdAt)}`,
  ].join(" - ");
}

function generatedAudioSourceLabel(item: VoiceJob): string {
  if (item.bookSourceId) {
    return item.bookScope ? `Book source ${item.bookScope.type}` : "Book source";
  }
  if (item.preparedSourceId) {
    return "Prepared source";
  }
  if (item.progressTargetId) {
    return item.progressTargetId;
  }
  return item.sourceKind ?? "Draft source";
}

function generatedAudioSegmentProgress(item: VoiceJob): string {
  const ready = item.audioReadySegments ?? 0;
  const total =
    item.retries.totalSegments > 0 ? item.retries.totalSegments : (item.segments?.length ?? 0);
  if (total <= 0) {
    return "segments pending";
  }
  return `${ready.toString()} of ${total.toString()} segments ready`;
}

function generatedAudioVoiceLabel(item: VoiceJob): string {
  return item.voiceProfileName ?? item.ttsVoice ?? item.voice;
}

function StorageBreakdown({
  projectStorage,
  projectStorageError,
}: Readonly<{
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
}>) {
  return (
    <div className="grid gap-3 rounded-md border p-4 vs-border vs-surface">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="text-sm font-semibold">Storage</p>
        <span className="rounded-full border px-2.5 py-1 text-xs font-semibold vs-border">
          {formatBytes(projectStorage?.totalBytes ?? 0)}
        </span>
      </div>
      {projectStorageError ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-xs text-[var(--vs-status-warning)]">
          {projectStorageError}
        </p>
      ) : null}
      <div className="grid gap-2 text-sm">
        <StorageFact
          label="Generated audio"
          value={formatBytes(projectStorage?.generatedAudioBytes ?? 0)}
        />
        <StorageFact label="Jobs" value={formatBytes(projectStorage?.jobBytes ?? 0)} />
        <StorageFact
          label="Sources"
          value={formatBytes(
            (projectStorage?.bookSourceBytes ?? 0) + (projectStorage?.preparedSourceBytes ?? 0),
          )}
        />
      </div>
    </div>
  );
}

function StorageFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border px-3 py-2 vs-border">
      <span className="vs-muted min-w-0 truncate text-xs font-semibold">{label}</span>
      <span className="shrink-0 text-xs font-semibold">{value}</span>
    </div>
  );
}
