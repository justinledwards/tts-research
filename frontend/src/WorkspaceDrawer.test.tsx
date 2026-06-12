import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NarrationStatusModel } from "./features/status-strip";
import type {
  AdapterDiagnostics,
  BookSource,
  PreparedSource,
  ProjectStorageSummary,
  SystemMetrics,
  TemporarySourceSession,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProject,
} from "./types";
import { WorkspaceDrawer } from "./WorkspaceDrawer";
import { CreateProjectRow } from "./WorkspaceDrawerHelpers";

describe("Command Center", () => {
  it("renders consolidated IA and return behavior", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="overview" />);

    expect(markup).toContain('aria-label="Command Center"');
    expect(markup).toContain("Command Center");
    expect(markup).toContain("Return to Narration Workbench");
    expect(markup).toContain('aria-label="Return to Narration Workbench"');
    expect(markup).toContain("Current work");
    expect(markup).toContain("Source / scope");
    expect(markup).toContain("Book One · Chapter 1");
    expect(markup).toContain("Generated audio");
    expect(markup).toContain("Working");
    expect(markup).toContain("Projects");
    expect(markup).toContain("Assets");
    expect(markup).toContain("Activity");
    expect(markup).toContain("Import/Export");
    expect(markup).not.toContain("Workspace &amp; Activity");
    expect(markup).not.toContain("Project Dashboard");
  });

  it("labels return behavior for the active major workbench", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="overview"
        returnWorkspaceLabel="Voice Cloning Workbench"
      />,
    );

    expect(markup).toContain("Return to Voice Cloning Workbench");
    expect(markup).toContain('aria-label="Return to Voice Cloning Workbench"');
  });

  it("exposes stable temporary source actions with disabled reasons", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="temporary"
        temporarySources={[temporarySource({ status: "promoted" })]}
      />,
    );

    expect(markup).toContain('data-testid="temporary-source-card-temp-1"');
    expect(markup).toContain('data-testid="ui-action-temporary-source-reopen-temp-1"');
    expect(markup).toContain('data-testid="ui-action-temporary-source-keep-temp-1"');
    expect(markup).toContain('data-testid="ui-action-temporary-source-discard-temp-1"');
    expect(markup).toContain("Temporary source is already kept in a project.");
  });

  it("keeps project library and generated audio in the projects section", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="projects" />);

    expect(markup).toContain("Projects (1)");
    expect(markup).toContain("Current Novel");
    expect(markup).toContain("Generated Audio");
    expect(markup).toContain("Opening chapter");
    expect(markup).toContain("Prepared source");
    expect(markup).toContain("1 of 2 segments ready");
    expect(markup).toContain("Narrator");
    expect(markup).toContain("Export");
  });

  it("marks the new project name field as the stable autofocus target", () => {
    const markup = renderToStaticMarkup(
      <CreateProjectRow
        onCancel={() => null}
        onCreateProject={() => Promise.resolve()}
        onCreated={() => null}
      />,
    );

    expect(markup).toContain('aria-label="New project name"');
    expect(markup).toContain('data-reader-autofocus=""');
  });

  it("sorts projects active-first and generated audio newest-first", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="projects"
        job={job({ id: "job-new", inputText: "Newest chapter", updatedAt: "2026-06-03T12:00:00Z" })}
        projectJobs={[
          job({
            id: "job-old",
            inputText: "Older chapter",
            status: "completed",
            updatedAt: "2026-06-01T12:00:00Z",
          }),
        ]}
        projects={[
          otherProject({ updatedAt: "2026-06-03T12:00:00Z" }),
          project({ updatedAt: "2026-05-31T21:00:00Z" }),
        ]}
      />,
    );

    expect(markup.indexOf("Current Novel")).toBeLessThan(markup.indexOf("Later Project"));
    expect(markup.indexOf("Newest chapter")).toBeLessThan(markup.indexOf("Older chapter"));
  });

  it("gates generated audio deletion to terminal jobs", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="projects"
        job={null}
        projectJobs={[
          job({ id: "job-ready", status: "completed" }),
          job({ id: "job-active", status: "synthesizing" }),
        ]}
      />,
    );

    expect(markup).toContain('data-testid="ui-action-generated-audio-delete-job-ready"');
    expect(markup).not.toMatch(
      /data-testid="ui-action-generated-audio-delete-job-ready"[^>]*disabled/,
    );
    expect(markup).toMatch(
      /data-testid="ui-action-generated-audio-delete-job-active"[^>]*disabled/,
    );
    expect(markup).toContain("Cancel this run before deleting.");
  });

  it("groups source and voice assets together", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="assets" />);

    expect(markup).toContain("Source Assets");
    expect(markup).toContain("Book One");
    expect(markup).toContain("Prepared Article");
    expect(markup).toContain("Active source");
    expect(markup).toContain("Available source");
    expect(markup).toContain("Reusable");
    expect(markup).toContain("Asset detail");
    expect(markup).toContain("Provenance");
    expect(markup).toContain("Reuse for narration");
    expect(markup).toContain("Generate narration");
    expect(markup).toContain("Voice Assets");
    expect(markup).toContain("Active voice");
    expect(markup).toContain("Narrator");
    expect(markup).toContain("Speech Policy Assets");
    expect(markup).toContain("Requires confirmation");
    expect(markup).toContain(
      "Changing the project default requires confirmation because source-specific overrides stay pinned.",
    );
  });

  it("shows activity and bundle actions outside the narration workbench", () => {
    const activityMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...props()} activeSection="activity" />,
    );
    const bundleMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...props()} activeSection="importsExports" />,
    );

    expect(activityMarkup).toContain("Narration pipeline");
    expect(activityMarkup).toContain("Cancel Run");
    expect(bundleMarkup).toContain("Import Bundle");
    expect(bundleMarkup).toContain("Export Current");
  });

  it("surfaces bundle operation activity and latest bundle report", () => {
    const activityMarkup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="activity"
        bundleActivity={{
          cancelLabel: "Cancel",
          canCancel: false,
          detail: "Import preview found blocking validation issues.",
          id: "bundle:import",
          label: "Bundle import",
          status: "attention",
        }}
      />,
    );
    const reportMarkup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="reports"
        bundleReport={{
          detail: "portable.voice-studio.zip · generated audio excluded.",
          excluded: [
            {
              detail: "Provider tokens are never exported.",
              included: false,
              key: "providerSecrets",
              label: "Provider secrets",
              required: false,
            },
          ],
          generatedAudio: 0,
          generatedAudioIncluded: false,
          kind: "import",
          omittedGeneratedAudio: 2,
          status: "blocked",
          title: "Import preview for Portable",
          updatedAt: "2026-06-04T10:00:00.000Z",
          validation: [
            {
              blocking: true,
              detail: "jobs/audio.wav did not match its manifest checksum.",
              key: "hash",
              label: "Hash mismatch",
              status: "error",
            },
          ],
          warnings: ["Generated audio is not included."],
        }}
      />,
    );

    expect(activityMarkup).toContain("Bundle import");
    expect(activityMarkup).toContain("Import preview found blocking validation issues.");
    expect(reportMarkup).toContain("Latest bundle report");
    expect(reportMarkup).toContain("Import preview for Portable");
    expect(reportMarkup).toContain("Generated audio");
    expect(reportMarkup).toContain("Excluded");
    expect(reportMarkup).toContain("Bundle warnings");
  });

  it("shows reports and storage summary", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="reports" />);

    expect(markup).toContain("Health report");
    expect(markup).toContain("Ready to narrate");
    expect(markup).toContain("Provider readiness");
    expect(markup).toContain("Source extraction");
    expect(markup).toContain("Job health");
    expect(markup).toContain("Test GPU");
    expect(markup).toContain("Test GPU - 6,000/24,000 MiB VRAM");
    expect(markup).toContain("Storage");
    expect(markup).toContain("Open Expert Diagnostics");
    expect(markup).not.toContain("Model cache");
    expect(markup).not.toContain("Active run configuration");
    expect(markup).not.toContain("Inspector");
  });

  it("links failed generation reports to job health and expert diagnostics", () => {
    const failedJob = job({
      failureKind: "engine",
      status: "failed",
      terminalReason: "provider_failed",
    });
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="reports"
        job={failedJob}
        projectJobs={[failedJob]}
      />,
    );

    expect(markup).toContain("Failed generation");
    expect(markup).toContain("Terminal reason: provider_failed");
    expect(markup).toContain("Failure kind: engine");
    expect(markup).toContain('href="#command-center-report-job-health"');
    expect(markup).toContain("Open Expert Diagnostics");
  });

  it("uses the same status chip labels and tones as the bottom status strip model", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="reports"
        narrationStatusModel={statusModel([
          statusChip({
            detail: "Open Review and fix two warnings.",
            label: "Review",
            tone: "warning",
            value: "2 warnings",
          }),
        ])}
      />,
    );

    expect(markup).toContain("Status strip blockers");
    expect(markup).toContain("Review");
    expect(markup).toContain("2 warnings");
    expect(markup).toContain("Open Review and fix two warnings.");
    expect(markup).toContain("vs-status-warning");
  });

  it("keeps empty and idle states quiet", () => {
    const emptyProps = {
      ...props(),
      bookSources: [],
      job: null,
      metrics: null,
      preparedSources: [],
      profiles: [],
      projectJobs: [],
      projectStorage: null,
      projects: [],
      selectedProfileId: "",
    };
    const projectsMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...emptyProps} activeSection="projects" />,
    );
    const assetsMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...emptyProps} activeSection="assets" />,
    );
    const activityMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...emptyProps} activeSection="activity" />,
    );
    const reportsMarkup = renderToStaticMarkup(
      <WorkspaceDrawer {...emptyProps} activeSection="reports" />,
    );

    expect(projectsMarkup).toContain("No projects yet");
    expect(projectsMarkup).toContain('data-testid="ui-action-empty-workspace-quick-listen"');
    expect(projectsMarkup).toContain("Quick Listen");
    expect(projectsMarkup).toContain("No generated audio is attached to the current project yet.");
    expect(assetsMarkup).toContain("No source analysis or book source staged.");
    expect(assetsMarkup).toContain("No saved voice profiles yet.");
    expect(activityMarkup).toContain("No active background work.");
    expect(activityMarkup).toContain("Idle");
    expect(reportsMarkup).toContain("Health report");
    expect(reportsMarkup).toContain("Pending");
    expect(reportsMarkup).toContain("GPU telemetry unavailable");
    expect(reportsMarkup).toContain("Open Expert Diagnostics");
  });

  it("hides empty workspace Quick Listen when temporarySources.quickListen is disabled", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceDrawer
        {...props()}
        activeSection="projects"
        bookSources={[]}
        preparedSources={[]}
        projectJobs={[]}
        projects={[]}
        quickListenEnabled={false}
      />,
    );

    expect(markup).toContain("No projects yet");
    expect(markup).not.toContain('data-testid="ui-action-empty-workspace-quick-listen"');
    expect(markup).not.toContain("start Quick Listen as a temporary source");
  });
});

function props(): Parameters<typeof WorkspaceDrawer>[0] {
  return {
    activeProjectId: "project-1",
    activeScopeLabel: "Chapter 1",
    activeSourceLabel: "Book One",
    adapterDiagnostics: adapterDiagnostics(),
    adapterDiagnosticsError: null,
    bookSources: [bookSource()],
    bundleActivity: null,
    bundleReport: null,
    cancelingProfileSourceId: null,
    cancelingTargetKey: null,
    canCreate: true,
    customSpeechPolicyProfiles: [],
    isOpen: true,
    job: job(),
    metrics: metrics(),
    metricsError: null,
    narrationStatusModel: statusModel(),
    preparedSources: [preparedSource()],
    profileSource: null,
    profiles: [profile()],
    projectError: null,
    projectJobs: [job()],
    projectStorage: storage(),
    projectStorageError: null,
    projects: [project()],
    returnWorkspaceLabel: "Narration Workbench",
    selectedBookScope: { type: "chapter", chapterIndex: 0, label: "Chapter 1" },
    selectedBookSourceId: "book-1",
    selectedEngineId: "kokoro",
    selectedPreparedSourceId: null,
    selectedProfileId: "profile-1",
    speechPolicyProfile: "general",
    speechPolicyOverrides: {},
    speechPolicyProfiles: [],
    sourceFallbackLabel: null,
    temporarySources: [],
    temporaryStorageUsage: null,
    ttsEngineError: null,
    ttsEngines: [ttsEngine()],
    onCancelJob: () => Promise.resolve(),
    onCancelProfileSource: () => Promise.resolve(),
    onCancelProfileTarget: () => Promise.resolve(),
    onClearExpiredTemporarySources: () => Promise.resolve(),
    onClearVoiceProfile: () => null,
    onClose: () => null,
    onCreateProject: () => Promise.resolve(),
    onDeleteBookSource: () => Promise.resolve(),
    onDeletePreparedSource: () => Promise.resolve(),
    onDeleteProject: () => Promise.resolve(),
    onDeleteVoiceJob: () => Promise.resolve(),
    onDeleteVoiceProfile: () => Promise.resolve(),
    onExportOpen: () => null,
    onGenerateBookSourceNarration: () => null,
    onGeneratePreparedSourceNarration: () => null,
    onImportOpen: () => null,
    onOpenIntake: () => null,
    onOpenQuickListen: () => null,
    onOpenSettings: () => null,
    onOpenTemporarySource: () => Promise.resolve(),
    onOpenVoiceDashboard: () => null,
    onOpenVoiceCloning: () => null,
    onDiscardTemporarySource: () => Promise.resolve(),
    onKeepTemporarySource: () => null,
    onRenameBookSource: () => Promise.resolve(),
    onRenamePreparedSource: () => Promise.resolve(),
    onRenameProject: () => Promise.resolve(),
    onRenameVoiceProfile: () => Promise.resolve(),
    onSelectProfile: () => null,
    onSelectProject: () => null,
    onSpeechPolicyProfileChange: () => null,
    onUseBookSource: () => null,
    onUsePreparedSource: () => Promise.resolve(),
  };
}

function project(overrides: Partial<VoiceProject> = {}): VoiceProject {
  return {
    createdAt: "2026-05-31T20:00:00Z",
    id: "project-1",
    name: "Current Novel",
    speechPolicyProfile: "general",
    updatedAt: "2026-05-31T21:00:00Z",
    ...overrides,
  };
}

function otherProject(overrides: Partial<VoiceProject> = {}): VoiceProject {
  return {
    createdAt: "2026-06-03T10:00:00Z",
    id: "project-2",
    name: "Later Project",
    speechPolicyProfile: "general",
    updatedAt: "2026-06-03T10:00:00Z",
    ...overrides,
  };
}

function temporarySource(overrides: Partial<TemporarySourceSession> = {}): TemporarySourceSession {
  return {
    artifacts: [],
    createdAt: "2026-06-12T10:00:00Z",
    expiresAt: "2026-06-13T10:00:00Z",
    id: "temp-1",
    kind: "text",
    lastAccessedAt: "2026-06-12T11:00:00Z",
    promotionStatus: "notPromoted",
    sourceName: "Temporary briefing",
    sourceOwner: "temporary",
    scope: "temporary",
    status: "reviewable",
    temporarySourceId: "temp-1",
    text: "Temporary briefing text.",
    title: "Temporary briefing",
    updatedAt: "2026-06-12T11:00:00Z",
    wordCount: 3,
    ...overrides,
  };
}

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioReadySegments: 1,
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    createdAt: "2026-05-31T20:30:00Z",
    durationMs: 120_000,
    id: "job-1",
    inputText: "Opening chapter",
    optimizedText: "Opening chapter",
    optimizer: "rules",
    progress: {
      activeStage: "synthesis",
      currentSegment: 1,
      detail: "Segment 1",
      message: "Generating audio.",
      totalSegments: 2,
    },
    preparedSourceId: "prepared-1",
    projectId: "project-1",
    provider: "mock",
    retries: { currentSegment: 1, totalSegments: 2 },
    stages: {},
    status: "synthesizing",
    updatedAt: "2026-05-31T20:31:00Z",
    voice: "default",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "",
      similarity: 0.94,
      transcript: "Opening chapter",
    },
    voiceProfileName: "Narrator",
    ...overrides,
  } as unknown as VoiceJob;
}

function bookSource(): BookSource {
  return {
    chapterCount: 1,
    createdAt: "2026-05-31T20:00:00Z",
    id: "book-1",
    kind: "epub",
    pageCount: 8,
    projectId: "project-1",
    sourceBytes: 4000,
    sourceFile: "book.epub",
    status: "ready",
    title: "Book One",
    updatedAt: "2026-05-31T20:00:00Z",
    wordCount: 5000,
  };
}

function preparedSource(): PreparedSource {
  return {
    blockCount: 4,
    createdAt: "2026-05-31T20:00:00Z",
    id: "prepared-1",
    kind: "file",
    projectId: "project-1",
    segmentCount: 2,
    sourceName: "article.md",
    sourceSpeechPolicyProfile: "Accessibility",
    speechPolicyProfile: "general",
    status: "ready",
    summary: {},
    title: "Prepared Article",
    updatedAt: "2026-05-31T20:00:00Z",
    wordCount: 1200,
  } as unknown as PreparedSource;
}

function ttsEngine(overrides: Partial<TTSEngineDiagnostics> = {}): TTSEngineDiagnostics {
  return {
    default: true,
    experimental: false,
    id: "kokoro",
    label: "Kokoro",
    local: true,
    status: "ready",
    supportsReference: false,
    supportsSSML: false,
    supportsSwedish: true,
    supportsVoice: true,
    ...overrides,
  };
}

function adapterDiagnostics(): Record<string, AdapterDiagnostics> {
  return {
    markdown: {
      adapterId: "markdown",
      available: true,
      status: "available",
    },
  };
}

function statusModel(chips: NarrationStatusModel["chips"] = []): NarrationStatusModel {
  return {
    activeJobDetail: "Generating audio.",
    activeJobLabel: "Working",
    activityItems: [],
    blocker: null,
    chips,
    confidenceDetail: "Ready",
    confidenceLabel: "Ready",
    detail: "Ready",
    eta: "soon",
    issues: chips.map((chip) => chip.issue),
    primaryAction: null,
    primaryLabel: "Ready",
    primaryMessage: "Ready",
    queue: {
      currentSegment: 1,
      generatingCount: 0,
      readyCount: 1,
      totalSegments: 2,
    },
    recentJobs: [],
    sourceTitle: "Book One",
    stageLabel: "Preview",
    stages: [],
    state: "ready",
    tone: chips[0]?.tone ?? "success",
    voiceCloning: {
      activeProfile: null,
      actionLabel: "Open voice cloning",
      candidateDetail: "No source queued",
      detail: "Idle",
      elapsed: "0s",
      eta: "n/a",
      lastUpdate: "n/a",
      message: "Idle",
      sourceDetail: "No source queued",
      stages: [],
      status: "idle",
      statusLabel: "Idle",
    },
  };
}

function statusChip({
  detail,
  label,
  tone,
  value,
}: {
  detail: string;
  label: string;
  tone: NarrationStatusModel["tone"];
  value: string;
}): NarrationStatusModel["chips"][number] {
  return {
    id: label.toLowerCase(),
    issue: {
      blocksCurrentStage: true,
      chipValue: value,
      condition: "attention",
      detail,
      id: label.toLowerCase(),
      label,
      owner: "review",
      recovery: { available: true, id: "openReview", label: "Open Review" },
      severity: "warning",
    },
    label,
    tone,
    value,
  };
}

function profile(): VoiceProfile {
  return {
    audioFormat: "wav",
    createdAt: "2026-05-31T20:00:00Z",
    durationMs: 60_000,
    id: "profile-1",
    language: "en",
    name: "Narrator",
    referenceAudio: "/reference.wav",
    referencePath: "/reference.wav",
    referenceTrimmed: false,
    sourceBytes: 1000,
    sourceFile: "voice.wav",
    status: "ready",
    updatedAt: "2026-05-31T20:00:00Z",
  };
}

function storage(): ProjectStorageSummary {
  return {
    bookSourceBytes: 4000,
    bookSourceCount: 1,
    downloads: [],
    generatedAudioBytes: 12_000,
    jobBytes: 2000,
    jobCount: 1,
    preparedSourceBytes: 3000,
    preparedSourceCount: 1,
    projectId: "project-1",
    projectName: "Current Novel",
    totalBytes: 21_000,
    updatedAt: "2026-05-31T20:00:00Z",
  };
}

function metrics(): SystemMetrics {
  return {
    collectedAt: "2026-05-31T20:00:00Z",
    gpus: [{ memoryTotalMiB: 24_000, memoryUsedMiB: 6000, name: "Test GPU" }],
    host: {},
    process: {},
    serviceVersion: "frontend-test",
  } as SystemMetrics;
}
