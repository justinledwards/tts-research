import { useMemo, useRef, useState } from "react";
import { StatusChip } from "./design";
import type { BundleOperationReport } from "./BundlePanels";
import { useReaderModalLifecycle } from "./features/reader-accessibility";
import { formatDuration } from "./format";
import type {
  AdapterDiagnostics,
  BookScope,
  BookSource,
  CustomSpeechPolicyProfile,
  PreparedSource,
  ProjectStorageSummary,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SystemMetrics,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProject,
} from "./types";
import {
  buildHealthReport,
  type HealthReport,
  type HealthReportCard,
} from "./features/health-report";
import type { NarrationStatusModel } from "./features/status-strip";
import type { SettingsCommandTarget } from "./features/settings/model";
import {
  COMMAND_CENTER_ROUTES,
  commandCenterGeneratedAudioState,
  sortCommandCenterProjects,
  visibleCommandCenterJobs,
} from "./features/command-center";
import {
  buildSourceAssetModels,
  buildSpeechPolicyAssetModel,
  buildVoiceAssetModels,
  type SourceAssetModel,
  type SpeechPolicyAssetModel,
  type VoiceAssetModel,
} from "./features/assets/assetModels";
import { resolveDefaultBookScope } from "./features/book-cinema/model";
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
  type WorkspaceActivitySummary,
} from "./WorkspaceDrawerHelpers";

interface GenerateNarrationOptions {
  useCurrentReviewSession?: boolean;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function WorkspaceDrawer({
  activeProjectId,
  activeScopeLabel,
  activeSection,
  activeSourceLabel,
  adapterDiagnostics,
  adapterDiagnosticsError,
  bookSources,
  bundleActivity,
  bundleReport,
  canCreate,
  isOpen,
  job,
  metrics,
  metricsError,
  narrationStatusModel,
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
  selectedBookScope,
  speechPolicyProfile,
  speechPolicyOverrides,
  speechPolicyProfiles,
  sourceFallbackLabel,
  selectedBookSourceId,
  selectedPreparedSourceId,
  selectedEngineId,
  selectedProfileId,
  cancelingProfileSourceId,
  cancelingTargetKey,
  ttsEngineError,
  ttsEngines,
  onCreateProject,
  onCancelJob,
  onCancelProfileSource,
  onCancelProfileTarget,
  onClose,
  onDeleteProject,
  onExportOpen,
  onImportOpen,
  onOpenSettings,
  onOpenIntake,
  onOpenQuickListen,
  onOpenVoiceDashboard,
  onOpenVoiceCloning,
  onRenameProject,
  onRenameBookSource,
  onRenamePreparedSource,
  onRenameVoiceProfile,
  onSectionChange,
  onSelectProject,
  onSelectProfile,
  onClearVoiceProfile,
  onDeleteBookSource,
  onDeletePreparedSource,
  onDeleteVoiceProfile,
  onDeleteVoiceJob,
  onGenerateBookSourceNarration,
  onGeneratePreparedSourceNarration,
  onSpeechPolicyProfileChange,
  onUseBookSource,
  onUsePreparedSource,
}: Readonly<{
  activeProjectId: string;
  activeScopeLabel: string;
  activeSection?: CommandCenterSectionId;
  activeSourceLabel: string;
  adapterDiagnostics: Record<string, AdapterDiagnostics> | null;
  adapterDiagnosticsError: string | null;
  bookSources: BookSource[];
  bundleActivity: WorkspaceActivitySummary | null;
  bundleReport: BundleOperationReport | null;
  canCreate: boolean;
  isOpen: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  narrationStatusModel: NarrationStatusModel;
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
  selectedBookScope: BookScope | null;
  speechPolicyProfile: string;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfiles: SpeechPolicyProfile[];
  sourceFallbackLabel: string | null;
  selectedBookSourceId: string | null;
  selectedPreparedSourceId: string | null;
  selectedEngineId: string;
  selectedProfileId: string;
  cancelingProfileSourceId: string | null;
  cancelingTargetKey: string | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onCreateProject: (name: string) => Promise<void>;
  onCancelJob: () => Promise<void>;
  onCancelProfileSource: (sourceId: string) => Promise<void>;
  onCancelProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onClose: () => void;
  onDeleteProject: (id: string) => Promise<void>;
  onExportOpen: () => void;
  onImportOpen: () => void;
  onOpenSettings: (target?: SettingsCommandTarget | null) => void;
  onOpenIntake: () => void;
  onOpenQuickListen: () => void;
  onOpenVoiceDashboard: () => void;
  onOpenVoiceCloning: () => void;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onRenameBookSource: (id: string, name: string) => Promise<void>;
  onRenamePreparedSource: (id: string, name: string) => Promise<void>;
  onRenameVoiceProfile: (id: string, name: string) => Promise<void>;
  onSectionChange?: (section: CommandCenterSectionId) => void;
  onSelectProject: (id: string) => void;
  onSelectProfile: (profileId: string) => void;
  onClearVoiceProfile: () => void;
  onDeleteBookSource: (id: string) => Promise<void>;
  onDeletePreparedSource: (id: string) => Promise<void>;
  onDeleteVoiceProfile: (id: string) => Promise<void>;
  onDeleteVoiceJob: (id: string) => Promise<void>;
  onGenerateBookSourceNarration: (
    book: BookSource,
    scope: BookScope,
    options?: GenerateNarrationOptions,
  ) => void;
  onGeneratePreparedSourceNarration: (
    source: PreparedSource,
    options?: GenerateNarrationOptions,
  ) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onUseBookSource: (book: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  const drawerRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(drawerRef, { closeOnEscape: true, isOpen, onClose });
  const [localActiveSection, setLocalActiveSection] = useState<CommandCenterSectionId>("overview");
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [inspectedAssetKey, setInspectedAssetKey] = useState<string | null>(null);
  const effectiveActiveSection = activeSection ?? localActiveSection;
  const visibleJobs = useMemo(
    () => visibleCommandCenterJobs({ activeProjectId, job, projectJobs }),
    [activeProjectId, job, projectJobs],
  );
  const reportBookSource = useMemo(
    () =>
      selectedBookSourceId
        ? (bookSources.find((book) => book.id === selectedBookSourceId) ?? null)
        : null,
    [bookSources, selectedBookSourceId],
  );
  const reportPreparedSource = useMemo(
    () =>
      selectedPreparedSourceId
        ? (preparedSources.find((source) => source.id === selectedPreparedSourceId) ?? null)
        : null,
    [preparedSources, selectedPreparedSourceId],
  );
  const healthReport = useMemo(
    () =>
      buildHealthReport({
        adapterDiagnostics,
        adapterDiagnosticsError,
        canCreate,
        job,
        metrics,
        metricsError,
        projectJobs: visibleJobs,
        projectStorage,
        projectStorageError,
        selectedBookSource: reportBookSource,
        selectedEngineId,
        selectedPreparedSource: reportPreparedSource,
        sourceFallbackLabel:
          !reportBookSource && !reportPreparedSource ? sourceFallbackLabel : null,
        statusChips: narrationStatusModel.chips,
        ttsEngineError,
        ttsEngines,
      }),
    [
      adapterDiagnostics,
      adapterDiagnosticsError,
      canCreate,
      job,
      metrics,
      metricsError,
      narrationStatusModel.chips,
      projectStorage,
      projectStorageError,
      reportBookSource,
      reportPreparedSource,
      selectedEngineId,
      sourceFallbackLabel,
      ttsEngineError,
      ttsEngines,
      visibleJobs,
    ],
  );
  const sourceAssetModels = useMemo(
    () =>
      buildSourceAssetModels({
        activeBookSourceId: selectedBookSourceId,
        activePreparedSourceId: selectedPreparedSourceId,
        bookSources,
        jobs: visibleJobs,
        preparedSources,
        projectId: activeProjectId,
        selectedBookScope,
      }),
    [
      activeProjectId,
      bookSources,
      preparedSources,
      selectedBookScope,
      selectedBookSourceId,
      selectedPreparedSourceId,
      visibleJobs,
    ],
  );
  const voiceAssetModels = useMemo(
    () =>
      buildVoiceAssetModels({
        jobs: visibleJobs,
        profiles,
        selectedProfileId,
      }),
    [profiles, selectedProfileId, visibleJobs],
  );
  const speechPolicyAsset = useMemo(
    () =>
      buildSpeechPolicyAssetModel({
        bookSources,
        customProfiles: customSpeechPolicyProfiles,
        preparedSources,
        sessionOverrides: speechPolicyOverrides,
        speechPolicyProfile,
        speechPolicyProfiles,
      }),
    [
      bookSources,
      customSpeechPolicyProfiles,
      preparedSources,
      speechPolicyOverrides,
      speechPolicyProfile,
      speechPolicyProfiles,
    ],
  );
  const sortedProjects = useMemo(
    () => sortCommandCenterProjects(projects, activeProjectId),
    [activeProjectId, projects],
  );
  const activitySummaries = useMemo(() => {
    const baseActivities = buildWorkspaceActivitySummaries({
      cancelingProfileSourceId,
      cancelingTargetKey,
      job,
      onCancelJob,
      onCancelProfileSource,
      onCancelProfileTarget,
      profileSource,
      profiles,
    });
    if (!bundleActivity) {
      return baseActivities;
    }
    return [
      bundleActivity,
      ...baseActivities.filter((activity) => activity.id !== bundleActivity.id),
    ];
  }, [
    bundleActivity,
    cancelingProfileSourceId,
    cancelingTargetKey,
    job,
    onCancelJob,
    onCancelProfileSource,
    onCancelProfileTarget,
    profileSource,
    profiles,
  ]);

  if (!isOpen) {
    return null;
  }

  const providerStatus = metrics
    ? `${metrics.serviceVersion || "backend"} online`
    : (metricsError ?? "Provider status pending");
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activeSectionLabel =
    COMMAND_CENTER_ROUTES.find((section) => section.id === effectiveActiveSection)?.label ??
    "Overview";
  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const totalSources = sourceAssetModels.length;
  const generatedDurationMs = visibleJobs.reduce((total, item) => total + item.durationMs, 0);
  const generatedAudioState = commandCenterGeneratedAudioState(visibleJobs);
  const currentWorkSource = `${activeSourceLabel} · ${activeScopeLabel}`;
  const selectedVoiceLabel = selectedProfile?.name ?? "Default";
  const sectionCounts: Record<CommandCenterSectionId, string> = {
    activity: activitySummaries.length > 0 ? activitySummaries.length.toString() : "",
    assets: (
      totalSources +
      voiceAssetModels.length +
      speechPolicyAsset.customPresetCount +
      (profileSource ? 1 : 0)
    ).toString(),
    importsExports: "",
    overview: "",
    projects: projects.length.toString(),
    reports:
      metrics || metricsError || projectStorage || projectStorageError || bundleReport ? "1" : "",
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
        className="vs-app vs-workbench mx-auto flex h-full w-full max-w-6xl flex-col border-r shadow-2xl md:w-[92vw] xl:w-[1120px]"
        ref={drawerRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4 vs-work-surface">
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
            <div className="grid gap-3 rounded-md border p-3 vs-metadata-surface">
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
                      ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)] shadow-sm"
                      : "vs-work-surface hover:bg-[var(--vs-surface)]"
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
                            ? "border-[var(--vs-selected-border)] text-[var(--vs-selected-text)]"
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
                        ? "text-[var(--vs-selected-text)]"
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
                      <div className="grid gap-3 rounded-md border p-4 vs-border vs-surface">
                        <EmptyDrawerText>
                          No saved projects yet. Create a project when you want a separate library,
                          or start temporary narration without saving anything.
                        </EmptyDrawerText>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="h-9 rounded-md px-3 text-xs font-semibold text-[var(--vs-action-primary-text)] vs-accent-bg"
                            data-testid="ui-action-empty-workspace-quick-listen"
                            onClick={onOpenQuickListen}
                            type="button"
                          >
                            Quick Listen
                          </button>
                          <button
                            className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                            onClick={() => {
                              setIsCreatingProject(true);
                            }}
                            type="button"
                          >
                            New Project
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <GeneratedAudioList
                    visibleJobs={visibleJobs}
                    onDeleteVoiceJob={onDeleteVoiceJob}
                  />
                </div>
              </WorkspaceSection>
            ) : null}

            {effectiveActiveSection === "assets" ? (
              <WorkspaceSection
                actions={
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                      data-testid="ui-action-command-center-intake"
                      data-ui-action-surface="Command Center"
                      onClick={onOpenIntake}
                      type="button"
                    >
                      Intake
                    </button>
                    <button
                      className="h-9 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
                      data-testid="ui-action-voice-dashboard-open-drawer"
                      data-ui-action-surface="Command Center"
                      onClick={onOpenVoiceDashboard}
                      type="button"
                    >
                      Voice Asset Detail
                    </button>
                  </div>
                }
                id="command-center-assets"
                title="Assets"
              >
                <AssetManagementPanel
                  activeSourceLabel={activeSourceLabel}
                  activeScopeLabel={activeScopeLabel}
                  inspectedAssetKey={inspectedAssetKey}
                  profileSource={profileSource}
                  sourceAssets={sourceAssetModels}
                  speechPolicyAsset={speechPolicyAsset}
                  speechPolicyProfile={speechPolicyProfile}
                  speechPolicyProfiles={speechPolicyProfiles}
                  customSpeechPolicyProfiles={customSpeechPolicyProfiles}
                  voiceAssets={voiceAssetModels}
                  bookSources={bookSources}
                  preparedSources={preparedSources}
                  selectedBookScope={selectedBookScope}
                  selectedVoiceLabel={selectedVoiceLabel}
                  onClearVoiceProfile={onClearVoiceProfile}
                  onDeleteBookSource={onDeleteBookSource}
                  onDeletePreparedSource={onDeletePreparedSource}
                  onDeleteVoiceProfile={onDeleteVoiceProfile}
                  onGenerateBookSourceNarration={onGenerateBookSourceNarration}
                  onGeneratePreparedSourceNarration={onGeneratePreparedSourceNarration}
                  onInspectAsset={setInspectedAssetKey}
                  onOpenIntake={onOpenIntake}
                  onOpenVoiceCloning={onOpenVoiceCloning}
                  onRenameBookSource={onRenameBookSource}
                  onRenamePreparedSource={onRenamePreparedSource}
                  onRenameVoiceProfile={onRenameVoiceProfile}
                  onSelectProfile={onSelectProfile}
                  onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
                  onUseBookSource={onUseBookSource}
                  onUsePreparedSource={onUsePreparedSource}
                />
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
                <HealthReportsPanel
                  bundleReport={bundleReport}
                  report={healthReport}
                  onOpenDiagnostics={() => {
                    onOpenSettings({ groupId: "diagnostics", layerId: "expert", scope: "machine" });
                  }}
                />
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
      <div className="grid gap-3 rounded-md border p-4 vs-management-surface">
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
    <div className="min-w-0 rounded-md border p-4 vs-work-surface">
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
      className="grid min-h-24 min-w-0 content-start gap-2 rounded-md border p-3 text-left transition hover:border-[var(--vs-selected-border)] hover:text-[var(--vs-selected-text)] vs-work-surface"
      onClick={onClick}
      type="button"
    >
      <span className="text-sm font-semibold">{children}</span>
      <span className="vs-muted text-xs leading-5">{detail}</span>
    </button>
  );
}

function AssetManagementPanel({
  activeScopeLabel,
  activeSourceLabel,
  bookSources,
  customSpeechPolicyProfiles,
  inspectedAssetKey,
  preparedSources,
  profileSource,
  selectedBookScope,
  selectedVoiceLabel,
  sourceAssets,
  speechPolicyAsset,
  speechPolicyProfile,
  speechPolicyProfiles,
  voiceAssets,
  onClearVoiceProfile,
  onDeleteBookSource,
  onDeletePreparedSource,
  onDeleteVoiceProfile,
  onGenerateBookSourceNarration,
  onGeneratePreparedSourceNarration,
  onInspectAsset,
  onOpenIntake,
  onOpenVoiceCloning,
  onRenameBookSource,
  onRenamePreparedSource,
  onRenameVoiceProfile,
  onSelectProfile,
  onSpeechPolicyProfileChange,
  onUseBookSource,
  onUsePreparedSource,
}: Readonly<{
  activeScopeLabel: string;
  activeSourceLabel: string;
  bookSources: BookSource[];
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  inspectedAssetKey: string | null;
  preparedSources: PreparedSource[];
  profileSource: VoiceProfileSource | null;
  selectedBookScope: BookScope | null;
  selectedVoiceLabel: string;
  sourceAssets: SourceAssetModel[];
  speechPolicyAsset: SpeechPolicyAssetModel;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  voiceAssets: VoiceAssetModel[];
  onClearVoiceProfile: () => void;
  onDeleteBookSource: (id: string) => Promise<void>;
  onDeletePreparedSource: (id: string) => Promise<void>;
  onDeleteVoiceProfile: (id: string) => Promise<void>;
  onGenerateBookSourceNarration: (
    book: BookSource,
    scope: BookScope,
    options?: GenerateNarrationOptions,
  ) => void;
  onGeneratePreparedSourceNarration: (
    source: PreparedSource,
    options?: GenerateNarrationOptions,
  ) => void;
  onInspectAsset: (assetKey: string) => void;
  onOpenIntake: () => void;
  onOpenVoiceCloning: () => void;
  onRenameBookSource: (id: string, name: string) => Promise<void>;
  onRenamePreparedSource: (id: string, name: string) => Promise<void>;
  onRenameVoiceProfile: (id: string, name: string) => Promise<void>;
  onSelectProfile: (profileId: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onUseBookSource: (book: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  const activeSource = sourceAssets.find((asset) => asset.availability === "active") ?? null;
  const activeVoice =
    voiceAssets.find((asset) => asset.availability === "active") ?? voiceAssets[0];
  const selectedAssetKey = inspectedAssetKey ?? activeSource?.assetKey ?? "policy:project";
  const inspectedSource = sourceAssets.find((asset) => asset.assetKey === selectedAssetKey) ?? null;
  const inspectedVoice = voiceAssets.find((asset) => asset.assetKey === selectedAssetKey) ?? null;
  const inspectPolicy =
    selectedAssetKey === "policy:project" || (!inspectedSource && !inspectedVoice);

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <ActiveAssetSummary
          detail={activeSource ? activeSource.selectedScope : activeScopeLabel}
          label="Active source"
          value={activeSource?.title ?? activeSourceLabel}
        />
        <ActiveAssetSummary
          detail={activeVoice.readinessLabel}
          label="Active voice"
          value={activeVoice.title || selectedVoiceLabel}
        />
        <ActiveAssetSummary
          detail={speechPolicyAsset.inheritedLabel}
          label="Speech policy"
          value={speechPolicyAsset.projectDefaultLabel}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
        <div className="grid gap-4">
          <SourceAssetsSection
            bookSources={bookSources}
            models={sourceAssets}
            preparedSources={preparedSources}
            profileSource={profileSource}
            selectedBookScope={selectedBookScope}
            onInspectAsset={onInspectAsset}
            onGenerateBookSourceNarration={onGenerateBookSourceNarration}
            onGeneratePreparedSourceNarration={onGeneratePreparedSourceNarration}
            onOpenIntake={onOpenIntake}
            onUseBookSource={onUseBookSource}
            onUsePreparedSource={onUsePreparedSource}
          />
          <VoiceAssetsSection
            models={voiceAssets}
            onClearVoiceProfile={onClearVoiceProfile}
            onInspectAsset={onInspectAsset}
            onOpenVoiceCloning={onOpenVoiceCloning}
            onSelectProfile={onSelectProfile}
          />
          <SpeechPolicyAssetsSection
            customSpeechPolicyProfiles={customSpeechPolicyProfiles}
            model={speechPolicyAsset}
            speechPolicyProfile={speechPolicyProfile}
            speechPolicyProfiles={speechPolicyProfiles}
            onInspectAsset={onInspectAsset}
            onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
          />
        </div>
        <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
          <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            Asset detail
          </p>
          {inspectedSource ? (
            <SourceAssetDetail
              asset={inspectedSource}
              bookSources={bookSources}
              preparedSources={preparedSources}
              selectedBookScope={selectedBookScope}
              onDeleteBookSource={onDeleteBookSource}
              onDeletePreparedSource={onDeletePreparedSource}
              onOpenIntake={onOpenIntake}
              onRenameBookSource={onRenameBookSource}
              onRenamePreparedSource={onRenamePreparedSource}
              onUseBookSource={onUseBookSource}
              onUsePreparedSource={onUsePreparedSource}
            />
          ) : null}
          {inspectedVoice ? (
            <VoiceAssetDetail
              asset={inspectedVoice}
              onClearVoiceProfile={onClearVoiceProfile}
              onDeleteVoiceProfile={onDeleteVoiceProfile}
              onOpenVoiceCloning={onOpenVoiceCloning}
              onRenameVoiceProfile={onRenameVoiceProfile}
              onSelectProfile={onSelectProfile}
            />
          ) : null}
          {inspectPolicy ? <PolicyAssetDetail model={speechPolicyAsset} /> : null}
        </div>
      </div>
    </div>
  );
}

function ActiveAssetSummary({
  detail,
  label,
  value,
}: Readonly<{ detail: string; label: string; value: string }>) {
  return (
    <div className="min-w-0 rounded-md border p-3 vs-border vs-raised">
      <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </p>
      <p className="vs-muted mt-1 truncate text-xs" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function SourceAssetsSection({
  bookSources,
  models,
  preparedSources,
  profileSource,
  selectedBookScope,
  onInspectAsset,
  onGenerateBookSourceNarration,
  onGeneratePreparedSourceNarration,
  onOpenIntake,
  onUseBookSource,
  onUsePreparedSource,
}: Readonly<{
  bookSources: BookSource[];
  models: SourceAssetModel[];
  preparedSources: PreparedSource[];
  profileSource: VoiceProfileSource | null;
  selectedBookScope: BookScope | null;
  onInspectAsset: (assetKey: string) => void;
  onGenerateBookSourceNarration: (
    book: BookSource,
    scope: BookScope,
    options?: GenerateNarrationOptions,
  ) => void;
  onGeneratePreparedSourceNarration: (
    source: PreparedSource,
    options?: GenerateNarrationOptions,
  ) => void;
  onOpenIntake: () => void;
  onUseBookSource: (book: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  return (
    <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Source Assets</p>
        <button
          className="h-8 rounded-md border px-2.5 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
          onClick={onOpenIntake}
          type="button"
        >
          Add Source
        </button>
      </div>
      {profileSource ? (
        <div className="rounded-md border p-3 vs-raised">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold" title={profileSource.sourceFile}>
              {profileSource.sourceFile}
            </p>
            <StatusPill>{profileSource.status}</StatusPill>
          </div>
          <p className="vs-muted mt-2 text-xs">
            Voice cloning intake · {profileSource.candidates.length} detected voice
            {profileSource.candidates.length === 1 ? "" : "s"} · {profileSource.progressMessage}
          </p>
        </div>
      ) : null}
      {models.length > 0 ? (
        models.map((asset) => (
          <SourceAssetRow
            asset={asset}
            bookSources={bookSources}
            key={asset.assetKey}
            preparedSources={preparedSources}
            selectedBookScope={selectedBookScope}
            onInspectAsset={onInspectAsset}
            onGenerateBookSourceNarration={onGenerateBookSourceNarration}
            onGeneratePreparedSourceNarration={onGeneratePreparedSourceNarration}
            onUseBookSource={onUseBookSource}
            onUsePreparedSource={onUsePreparedSource}
          />
        ))
      ) : (
        <EmptyDrawerText>No source analysis or book source staged.</EmptyDrawerText>
      )}
    </div>
  );
}

function SourceAssetRow({
  asset,
  bookSources,
  preparedSources,
  selectedBookScope,
  onInspectAsset,
  onGenerateBookSourceNarration,
  onGeneratePreparedSourceNarration,
  onUseBookSource,
  onUsePreparedSource,
}: Readonly<{
  asset: SourceAssetModel;
  bookSources: BookSource[];
  preparedSources: PreparedSource[];
  selectedBookScope: BookScope | null;
  onInspectAsset: (assetKey: string) => void;
  onGenerateBookSourceNarration: (
    book: BookSource,
    scope: BookScope,
    options?: GenerateNarrationOptions,
  ) => void;
  onGeneratePreparedSourceNarration: (
    source: PreparedSource,
    options?: GenerateNarrationOptions,
  ) => void;
  onUseBookSource: (book: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  const useDisabledReason = sourceAssetUseDisabledReason(asset);
  const generateDisabledReason = sourceAssetGenerateDisabledReason(asset);
  return (
    <div
      className={`min-w-0 rounded-md border p-3 ${
        asset.isActive ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]" : "vs-raised"
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold" title={asset.title}>
          {asset.title}
        </p>
        <StatusPill>{asset.availabilityLabel}</StatusPill>
      </div>
      <p className="vs-muted mt-1 truncate text-xs" title={sourceAssetRowDetail(asset)}>
        {sourceAssetRowDetail(asset)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <AssetButton
          testId={`ui-action-asset-source-inspect-${asset.assetKey}`}
          onClick={() => {
            onInspectAsset(asset.assetKey);
          }}
        >
          Inspect
        </AssetButton>
        <AssetButton
          disabled={Boolean(useDisabledReason)}
          disabledReason={useDisabledReason}
          selected={asset.isActive}
          testId={`ui-action-asset-source-use-${asset.assetKey}`}
          onClick={() => {
            applySourceAsset(asset, bookSources, preparedSources, selectedBookScope, {
              onUseBookSource,
              onUsePreparedSource,
            });
          }}
        >
          Use in narration
        </AssetButton>
        <AssetButton
          disabled={Boolean(generateDisabledReason)}
          disabledReason={generateDisabledReason}
          testId={`ui-action-asset-source-generate-${asset.assetKey}`}
          onClick={() => {
            generateSourceAsset(asset, bookSources, preparedSources, selectedBookScope, {
              onGenerateBookSourceNarration,
              onGeneratePreparedSourceNarration,
            });
          }}
        >
          Generate narration
        </AssetButton>
      </div>
    </div>
  );
}

function VoiceAssetsSection({
  models,
  onClearVoiceProfile,
  onInspectAsset,
  onOpenVoiceCloning,
  onSelectProfile,
}: Readonly<{
  models: VoiceAssetModel[];
  onClearVoiceProfile: () => void;
  onInspectAsset: (assetKey: string) => void;
  onOpenVoiceCloning: () => void;
  onSelectProfile: (profileId: string) => void;
}>) {
  return (
    <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Voice Assets</p>
        <button
          className="h-8 rounded-md border px-2.5 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
          onClick={onOpenVoiceCloning}
          type="button"
        >
          Voice Cloning
        </button>
      </div>
      {models.map((asset) => (
        <div
          className={`min-w-0 rounded-md border p-3 ${
            asset.availability === "active"
              ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
              : "vs-raised"
          }`}
          key={asset.assetKey}
        >
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm font-semibold" title={asset.title}>
              {asset.title}
            </p>
            <StatusPill>{asset.activeStateLabel}</StatusPill>
          </div>
          <p className="vs-muted mt-1 truncate text-xs" title={voiceAssetRowDetail(asset)}>
            {voiceAssetRowDetail(asset)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <AssetButton
              testId={`ui-action-asset-voice-inspect-${asset.assetKey}`}
              onClick={() => {
                onInspectAsset(asset.assetKey);
              }}
            >
              Inspect
            </AssetButton>
            <AssetButton
              disabled={asset.availability === "active"}
              disabledReason={
                asset.availability === "active"
                  ? "Already using this voice for narration."
                  : undefined
              }
              selected={asset.availability === "active"}
              testId={`ui-action-asset-voice-use-${asset.assetKey}`}
              onClick={() => {
                if (asset.type === "default") {
                  onClearVoiceProfile();
                  return;
                }
                onSelectProfile(asset.id);
              }}
            >
              {asset.type === "default" ? "Use default" : "Use saved voice"}
            </AssetButton>
          </div>
        </div>
      ))}
      {models.every((asset) => asset.type === "default") ? (
        <EmptyDrawerText>No saved voice profiles yet.</EmptyDrawerText>
      ) : null}
    </div>
  );
}

function SpeechPolicyAssetsSection({
  customSpeechPolicyProfiles,
  model,
  speechPolicyProfile,
  speechPolicyProfiles,
  onInspectAsset,
  onSpeechPolicyProfileChange,
}: Readonly<{
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  model: SpeechPolicyAssetModel;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  onInspectAsset: (assetKey: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  return (
    <div className="grid gap-3 rounded-md border p-4 vs-border vs-surface">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Speech Policy Assets</p>
        <AssetButton
          testId="ui-action-asset-policy-inspect"
          onClick={() => {
            onInspectAsset("policy:project");
          }}
        >
          Inspect
        </AssetButton>
      </div>
      <WorkspaceDashboardSummary
        detail={`${model.sourcePinCount.toString()} source pin(s) · ${model.sessionOverrideCount.toString()} session override field(s)`}
        label={model.projectDefaultLabel}
        value={model.requiresConfirmation ? "Requires confirmation" : "Inherited"}
      />
      <label className="grid gap-1 text-sm font-semibold">
        <span>Project default</span>
        <select
          className="h-10 rounded-md border bg-[var(--vs-raised)] px-3 text-sm outline-none vs-border"
          onChange={(event) => {
            const nextProfile = event.currentTarget.value;
            if (
              nextProfile !== speechPolicyProfile &&
              model.requiresConfirmation &&
              !confirmAssetAction(
                "Change project default? Source-specific speech policy pins and overrides will remain unchanged.",
              )
            ) {
              return;
            }
            onSpeechPolicyProfileChange(nextProfile);
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
      {model.requiresConfirmation ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-xs leading-5 text-[var(--vs-status-warning)]">
          Changing the project default requires confirmation because source-specific overrides stay
          pinned.
        </p>
      ) : null}
    </div>
  );
}

function SourceAssetDetail({
  asset,
  bookSources,
  preparedSources,
  selectedBookScope,
  onDeleteBookSource,
  onDeletePreparedSource,
  onOpenIntake,
  onRenameBookSource,
  onRenamePreparedSource,
  onUseBookSource,
  onUsePreparedSource,
}: Readonly<{
  asset: SourceAssetModel;
  bookSources: BookSource[];
  preparedSources: PreparedSource[];
  selectedBookScope: BookScope | null;
  onDeleteBookSource: (id: string) => Promise<void>;
  onDeletePreparedSource: (id: string) => Promise<void>;
  onOpenIntake: () => void;
  onRenameBookSource: (id: string, name: string) => Promise<void>;
  onRenamePreparedSource: (id: string, name: string) => Promise<void>;
  onUseBookSource: (book: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
}>) {
  return (
    <div className="grid gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="min-w-0 truncate text-lg font-semibold" title={asset.title}>
            {asset.title}
          </h4>
          <StatusPill>{asset.availabilityLabel}</StatusPill>
          <StatusPill>{asset.policyPinLabel}</StatusPill>
        </div>
        <p className="vs-muted mt-1 text-sm leading-6">{asset.lifecycleDetail}</p>
      </div>
      <DetailGrid
        rows={[
          ["Type", asset.typeLabel],
          ["Word count", `${asset.envelope.wordCount?.toLocaleString() ?? "Unknown"} words`],
          ["Structure", asset.structureLabel],
          ["Extraction", asset.extractionStateLabel],
          ["Readiness", `${asset.readinessLabel} · ${asset.readinessDetail}`],
          ["Last prepared", formatDate(asset.lastPreparedAt)],
          ["Last used", asset.usage.lastUsedAt ? formatDate(asset.usage.lastUsedAt) : "Never"],
          ["Usage", asset.reuseLabel],
          ["Policy scope", asset.policyPinLabel],
          ["Provenance", asset.provenance],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <AssetButton
          disabled={!asset.routeState.canReview}
          onClick={() => {
            applySourceAsset(asset, bookSources, preparedSources, selectedBookScope, {
              onUseBookSource,
              onUsePreparedSource,
            });
          }}
        >
          Reuse for narration
        </AssetButton>
        <AssetButton onClick={onOpenIntake}>Open Intake</AssetButton>
        <AssetButton
          onClick={() => {
            const nextName = promptAssetName("Rename source asset", asset.title);
            if (!nextName) {
              return;
            }
            void (asset.owner === "book"
              ? onRenameBookSource(asset.id, nextName)
              : onRenamePreparedSource(asset.id, nextName));
          }}
        >
          Rename
        </AssetButton>
        <DangerAssetButton
          onClick={() => {
            const message =
              asset.availability === "active"
                ? `${asset.deleteConfirmation} It is active, so narration will fall back to draft text.`
                : asset.deleteConfirmation;
            if (!confirmAssetAction(message)) {
              return;
            }
            void (asset.owner === "book"
              ? onDeleteBookSource(asset.id)
              : onDeletePreparedSource(asset.id));
          }}
        >
          Delete
        </DangerAssetButton>
      </div>
    </div>
  );
}

function VoiceAssetDetail({
  asset,
  onClearVoiceProfile,
  onDeleteVoiceProfile,
  onOpenVoiceCloning,
  onRenameVoiceProfile,
  onSelectProfile,
}: Readonly<{
  asset: VoiceAssetModel;
  onClearVoiceProfile: () => void;
  onDeleteVoiceProfile: (id: string) => Promise<void>;
  onOpenVoiceCloning: () => void;
  onRenameVoiceProfile: (id: string, name: string) => Promise<void>;
  onSelectProfile: (profileId: string) => void;
}>) {
  return (
    <div className="grid gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="min-w-0 truncate text-lg font-semibold" title={asset.title}>
            {asset.title}
          </h4>
          {asset.labels.map((label) => (
            <StatusPill key={label}>{label}</StatusPill>
          ))}
        </div>
        <p className="vs-muted mt-1 text-sm leading-6">{asset.readinessDetail}</p>
      </div>
      <DetailGrid
        rows={[
          ["Provider", asset.providerLabel],
          ["Engine", asset.engineLabel],
          ["Readiness", asset.readinessLabel],
          ["Language", asset.language],
          ["Profile path", asset.profilePath],
          ["Reference path", asset.referencePath],
          ["Source", asset.sourceLabel],
          ["Last used", asset.usage.lastUsedAt ? formatDate(asset.usage.lastUsedAt) : "Never"],
          ["Usage", usageCountLabel(asset.usage.usageCount)],
        ]}
      />
      <div className="flex flex-wrap gap-2">
        <AssetButton
          onClick={() => {
            if (asset.type === "default") {
              onClearVoiceProfile();
              return;
            }
            onSelectProfile(asset.id);
          }}
        >
          {asset.type === "default" ? "Use default voice" : "Use saved voice"}
        </AssetButton>
        <AssetButton onClick={onOpenVoiceCloning}>Open Voice Cloning</AssetButton>
        {asset.type === "profile" ? (
          <>
            <AssetButton
              onClick={() => {
                const nextName = promptAssetName("Rename voice profile", asset.title);
                if (nextName) {
                  void onRenameVoiceProfile(asset.id, nextName);
                }
              }}
            >
              Rename
            </AssetButton>
            <DangerAssetButton
              onClick={() => {
                const message =
                  asset.availability === "active"
                    ? `${asset.deleteConfirmation ?? ""} It is active, so narration will fall back to the default voice.`
                    : (asset.deleteConfirmation ?? "");
                if (message && confirmAssetAction(message)) {
                  void onDeleteVoiceProfile(asset.id);
                }
              }}
            >
              Delete
            </DangerAssetButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PolicyAssetDetail({ model }: Readonly<{ model: SpeechPolicyAssetModel }>) {
  return (
    <div className="grid gap-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-lg font-semibold">Speech policy preset</h4>
          {model.statusLabels.map((label) => (
            <StatusPill key={label}>{label}</StatusPill>
          ))}
        </div>
        <p className="vs-muted mt-1 text-sm leading-6">
          Project defaults are inherited by unpinned sources. Source-specific overrides are kept
          separate and are not changed silently.
        </p>
      </div>
      <DetailGrid
        rows={[
          ["Project default", model.projectDefaultLabel],
          ["Session overrides", model.sessionOverrideCount.toLocaleString()],
          ["Source pins", model.sourcePinCount.toLocaleString()],
          ["Custom presets", model.customPresetCount.toLocaleString()],
          ["Machine scope", model.machineDefaultLabel],
          ["Default change", model.requiresConfirmation ? "Requires confirmation" : "Inherited"],
        ]}
      />
    </div>
  );
}

function DetailGrid({ rows }: Readonly<{ rows: [string, string][] }>) {
  return (
    <dl className="grid gap-2">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 rounded-md border p-3 vs-metadata-surface" key={label}>
          <dt className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
            {label}
          </dt>
          <dd className="break-words text-sm font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusPill({ children }: Readonly<{ children: string }>) {
  return (
    <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold capitalize vs-metadata-surface">
      {children}
    </span>
  );
}

function AssetButton({
  children,
  disabled = false,
  disabledReason,
  onClick,
  selected = false,
  testId,
}: Readonly<{
  children: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  selected?: boolean;
  testId?: string;
}>) {
  return (
    <button
      className={`h-8 rounded-md border px-2.5 text-xs font-semibold hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:border-[var(--vs-action-disabled-border)] disabled:bg-[var(--vs-action-disabled-bg)] disabled:text-[var(--vs-action-disabled-text)] ${
        selected
          ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)] text-[var(--vs-selected-text)]"
          : "vs-border"
      }`}
      data-disabled-reason={disabledReason}
      data-selected={selected ? "true" : undefined}
      data-testid={testId}
      data-ui-noop-reason={selected ? (disabledReason ?? "Already selected.") : undefined}
      disabled={disabled}
      onClick={onClick}
      title={disabled && disabledReason ? disabledReason : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

function DangerAssetButton({
  children,
  disabled = false,
  disabledReason,
  onClick,
  testId,
}: Readonly<{
  children: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
  testId?: string;
}>) {
  return (
    <button
      className="h-8 rounded-md border border-[var(--vs-action-destructive-border)] bg-[var(--vs-action-destructive-bg)] px-2.5 text-xs font-semibold text-[var(--vs-action-destructive)] hover:bg-[var(--vs-action-destructive-hover)] disabled:cursor-not-allowed disabled:border-[var(--vs-action-disabled-border)] disabled:bg-[var(--vs-action-disabled-bg)] disabled:text-[var(--vs-action-disabled-text)]"
      data-disabled-reason={disabledReason}
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      title={disabled && disabledReason ? disabledReason : undefined}
      type="button"
    >
      {children}
    </button>
  );
}

function sourceAssetRowDetail(asset: SourceAssetModel): string {
  return [
    asset.typeLabel,
    `${asset.envelope.wordCount?.toLocaleString() ?? "Unknown"} words`,
    asset.readinessLabel,
    asset.policyPinLabel,
    asset.reuseLabel,
  ].join(" · ");
}

function voiceAssetRowDetail(asset: VoiceAssetModel): string {
  return [
    asset.providerLabel,
    asset.engineLabel,
    asset.readinessLabel,
    usageCountLabel(asset.usage.usageCount),
  ].join(" · ");
}

function usageCountLabel(count: number): string {
  if (count === 0) {
    return "Never used";
  }
  return `Used ${count.toLocaleString()} time${count === 1 ? "" : "s"}`;
}

function sourceAssetUseDisabledReason(asset: SourceAssetModel): string | undefined {
  if (asset.isActive) {
    return "Already using this source for narration.";
  }
  return asset.routeState.canReview
    ? undefined
    : (asset.routeState.reviewDisabledReason ?? asset.enabledDisabledReason);
}

function sourceAssetGenerateDisabledReason(asset: SourceAssetModel): string | undefined {
  return asset.routeState.canReview
    ? undefined
    : (asset.routeState.reviewDisabledReason ?? asset.enabledDisabledReason);
}

function applySourceAsset(
  asset: SourceAssetModel,
  bookSources: BookSource[],
  preparedSources: PreparedSource[],
  selectedBookScope: BookScope | null,
  actions: {
    onUseBookSource: (book: BookSource, scope: BookScope) => void;
    onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
  },
) {
  if (asset.owner === "book") {
    const book = bookSources.find((source) => source.id === asset.id);
    if (book) {
      actions.onUseBookSource(
        book,
        asset.isActive && selectedBookScope ? selectedBookScope : resolveDefaultBookScope(book),
      );
    }
    return;
  }
  const source = preparedSources.find((item) => item.id === asset.id);
  if (source) {
    void actions.onUsePreparedSource(source);
  }
}

function generateSourceAsset(
  asset: SourceAssetModel,
  bookSources: BookSource[],
  preparedSources: PreparedSource[],
  selectedBookScope: BookScope | null,
  actions: {
    onGenerateBookSourceNarration: (
      book: BookSource,
      scope: BookScope,
      options?: GenerateNarrationOptions,
    ) => void;
    onGeneratePreparedSourceNarration: (
      source: PreparedSource,
      options?: GenerateNarrationOptions,
    ) => void;
  },
) {
  if (asset.owner === "book") {
    const book = bookSources.find((source) => source.id === asset.id);
    if (book) {
      const scope =
        asset.isActive && selectedBookScope ? selectedBookScope : resolveDefaultBookScope(book);
      actions.onGenerateBookSourceNarration(book, scope, {
        useCurrentReviewSession: asset.isActive,
      });
    }
    return;
  }
  const source = preparedSources.find((item) => item.id === asset.id);
  if (source) {
    actions.onGeneratePreparedSourceNarration(source, {
      useCurrentReviewSession: asset.isActive,
    });
  }
}

function confirmAssetAction(message: string): boolean {
  if (typeof globalThis.confirm !== "function") {
    return true;
  }
  return globalThis.confirm(message);
}

function promptAssetName(label: string, currentName: string): string | null {
  if (typeof globalThis.prompt !== "function") {
    return null;
  }
  const nextName = globalThis.prompt(label, currentName)?.trim() ?? "";
  return nextName.length > 0 && nextName !== currentName ? nextName : null;
}

function GeneratedAudioList({
  visibleJobs,
  onDeleteVoiceJob,
}: Readonly<{ visibleJobs: VoiceJob[]; onDeleteVoiceJob: (id: string) => Promise<void> }>) {
  return (
    <div className="grid content-start gap-3 rounded-md border p-4 vs-border vs-surface">
      <p className="text-sm font-semibold">Generated Audio</p>
      {visibleJobs.length > 0 ? (
        visibleJobs.slice(0, 8).map((item) => {
          const deleteDisabledReason = generatedAudioDeleteDisabledReason(item);
          const title = generatedAudioTitle(item);
          return (
            <div className="grid gap-3 rounded-md border p-3 vs-raised" key={item.id}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="min-w-0 truncate text-sm font-semibold" title={item.inputText}>
                    {title}
                  </p>
                  <p className="vs-muted mt-1 truncate text-xs" title={generatedAudioDetail(item)}>
                    {generatedAudioDetail(item)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs capitalize vs-border">
                  {item.status}
                </span>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <DangerAssetButton
                  disabled={Boolean(deleteDisabledReason)}
                  disabledReason={deleteDisabledReason}
                  testId={`ui-action-generated-audio-delete-${item.id}`}
                  onClick={() => {
                    if (
                      !confirmAssetAction(
                        `Delete narration "${title}"? This removes generated audio and timing artifacts but keeps the source asset.`,
                      )
                    ) {
                      return;
                    }
                    void onDeleteVoiceJob(item.id);
                  }}
                >
                  Delete
                </DangerAssetButton>
              </div>
            </div>
          );
        })
      ) : (
        <EmptyDrawerText>
          No generated audio is attached to the current project yet.
        </EmptyDrawerText>
      )}
    </div>
  );
}

function generatedAudioDeleteDisabledReason(item: VoiceJob): string | undefined {
  return item.status === "completed" || item.status === "failed" || item.status === "cancelled"
    ? undefined
    : "Cancel this run before deleting.";
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

function HealthReportsPanel({
  bundleReport,
  report,
  onOpenDiagnostics,
}: Readonly<{
  bundleReport: BundleOperationReport | null;
  report: HealthReport;
  onOpenDiagnostics: () => void;
}>) {
  const reportCards = [
    report.overall,
    report.provider,
    report.sourceExtraction,
    report.job,
    report.storage,
    report.backend,
  ];
  const failedGeneration =
    report.provider.readiness === "failedJob" || report.job.value === "Failed generation";
  const terminalReason =
    report.job.facts.find((fact) => fact.label === "Terminal reason")?.value ??
    report.provider.facts.find((fact) => fact.label === "Terminal reason")?.value ??
    "n/a";
  const failureKind =
    report.job.facts.find((fact) => fact.label === "Failure kind")?.value ??
    report.provider.facts.find((fact) => fact.label === "Failure kind")?.value ??
    "n/a";
  return (
    <div className="grid gap-3">
      <div className="rounded-md border p-4 vs-work-surface">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-semibold uppercase tracking-wide">Health report</p>
            <h3 className="mt-1 text-base font-semibold">{report.overall.value}</h3>
            <p className="vs-muted mt-1 text-sm leading-6">{report.overall.detail}</p>
          </div>
          <StatusChip tone={report.overall.tone}>
            {report.canNarrateNow ? "Can narrate now" : "Needs attention"}
          </StatusChip>
        </div>
      </div>
      {failedGeneration ? (
        <div className="rounded-md border p-4 text-sm text-[var(--vs-status-danger)] vs-alert-surface">
          <p className="font-semibold">Failed generation</p>
          <p className="mt-1 leading-6">
            Terminal reason: {terminalReason}. Failure kind: {failureKind}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              className="rounded-md border px-3 py-2 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
              href="#command-center-report-job-health"
            >
              View job health
            </a>
            <button
              className="rounded-md border px-3 py-2 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
              onClick={onOpenDiagnostics}
              type="button"
            >
              Open Expert Diagnostics
            </button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 lg:grid-cols-2">
        {reportCards.map((card) => (
          <HealthReportCardRow card={card} key={card.label} />
        ))}
      </div>
      {bundleReport ? <BundleOperationReportCard report={bundleReport} /> : null}
      {report.statusChips.length > 0 ? (
        <div className="rounded-md border p-4 vs-management-surface">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">Status strip blockers</p>
            <StatusChip tone="metadata">{report.statusChips.length.toString()}</StatusChip>
          </div>
          <div className="mt-3 grid gap-2">
            {report.statusChips.map((chip) => (
              <div
                className="flex min-w-0 items-start justify-between gap-3 rounded-md border px-3 py-2 vs-work-surface"
                key={`${chip.label}-${chip.value}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold" title={chip.label}>
                    {chip.label}
                  </p>
                  <p className="vs-muted mt-1 line-clamp-2 text-xs leading-5">{chip.detail}</p>
                </div>
                <StatusChip className="py-0.5" tone={chip.tone}>
                  {chip.value}
                </StatusChip>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex justify-end">
        <button
          className="h-9 rounded-md border px-3 text-sm font-semibold hover:bg-[var(--vs-raised)] vs-border"
          onClick={onOpenDiagnostics}
          type="button"
        >
          Open Expert Diagnostics
        </button>
      </div>
    </div>
  );
}

function BundleOperationReportCard({ report }: Readonly<{ report: BundleOperationReport }>) {
  const validationCount = report.validation?.length ?? 0;
  const dependencyCount = report.dependencies?.length ?? 0;
  const conflictCount = report.conflicts?.length ?? 0;
  const excludedCount = report.excluded?.length ?? 0;
  const warnings = report.warnings ?? [];
  let statusTone: "danger" | "warning" | "success" = "success";
  if (report.status === "blocked") {
    statusTone = "danger";
  } else if (report.status === "warning") {
    statusTone = "warning";
  }

  return (
    <article className="rounded-md border p-4 vs-management-surface">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="vs-muted text-xs font-semibold uppercase tracking-wide">
            Latest bundle report
          </p>
          <h3 className="mt-1 truncate text-base font-semibold" title={report.title}>
            {report.title}
          </h3>
          <p className="vs-muted mt-1 break-words text-sm leading-6">{report.detail}</p>
        </div>
        <StatusChip tone={statusTone}>{report.status}</StatusChip>
      </div>
      <DetailGrid
        rows={[
          ["Generated audio", report.generatedAudioIncluded === false ? "Excluded" : "Included"],
          ["Audio files", String(report.generatedAudio ?? 0)],
          ["Omitted audio", String(report.omittedGeneratedAudio ?? 0)],
          ["Validation", validationCount.toLocaleString()],
          ["Dependencies", dependencyCount.toLocaleString()],
          ["Conflicts", conflictCount.toLocaleString()],
          ["Exclusions", excludedCount.toLocaleString()],
          ["Updated", formatDate(report.updatedAt)],
        ]}
      />
      {warnings.length > 0 ? (
        <div className="mt-3 rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] p-3 text-xs text-[var(--vs-status-warning)]">
          <p className="font-semibold">Bundle warnings</p>
          <ul className="mt-2 grid gap-1">
            {warnings.slice(0, 5).map((warning) => (
              <li className="break-words" key={warning}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

function HealthReportCardRow({ card }: Readonly<{ card: HealthReportCard }>) {
  return (
    <article
      className="rounded-md border p-4 vs-work-surface"
      id={`command-center-report-${healthReportAnchor(card.label)}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={card.label}>
            {card.label}
          </p>
          <p className="vs-muted mt-1 text-sm leading-6">{card.detail}</p>
        </div>
        <StatusChip tone={card.tone}>{card.value}</StatusChip>
      </div>
    </article>
  );
}

function healthReportAnchor(label: string): string {
  return label
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/(^-|-$)/g, "");
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
