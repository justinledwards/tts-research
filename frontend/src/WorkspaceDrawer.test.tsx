import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceDrawer } from "./WorkspaceDrawer";
import type {
  BookSource,
  PreparedSource,
  ProjectStorageSummary,
  SystemMetrics,
  VoiceJob,
  VoiceProfile,
  VoiceProject,
} from "./types";

describe("Command Center", () => {
  it("renders consolidated IA and return behavior", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="overview" />);

    expect(markup).toContain('aria-label="Command Center"');
    expect(markup).toContain("Command Center");
    expect(markup).toContain("Return to Narration Workbench");
    expect(markup).toContain('aria-label="Return to Narration Workbench"');
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

  it("keeps project library and generated audio in the projects section", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="projects" />);

    expect(markup).toContain("Projects (1)");
    expect(markup).toContain("Current Novel");
    expect(markup).toContain("Generated Audio");
    expect(markup).toContain("Opening chapter");
    expect(markup).toContain("Export");
  });

  it("groups source and voice assets together", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="assets" />);

    expect(markup).toContain("Sources");
    expect(markup).toContain("Book One");
    expect(markup).toContain("Prepared Article");
    expect(markup).toContain("Voice profiles");
    expect(markup).toContain("Narrator");
    expect(markup).toContain("Speech Policy");
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

  it("shows reports and storage summary", () => {
    const markup = renderToStaticMarkup(<WorkspaceDrawer {...props()} activeSection="reports" />);

    expect(markup).toContain("frontend-test online");
    expect(markup).toContain("Test GPU");
    expect(markup).toContain("Storage");
    expect(markup).toContain("Open diagnostics");
  });
});

function props(): Parameters<typeof WorkspaceDrawer>[0] {
  return {
    activeProjectId: "project-1",
    bookSources: [bookSource()],
    cancelingProfileSourceId: null,
    cancelingTargetKey: null,
    customSpeechPolicyProfiles: [],
    isOpen: true,
    job: job(),
    metrics: metrics(),
    metricsError: null,
    preparedSources: [preparedSource()],
    profileSource: null,
    profiles: [profile()],
    projectError: null,
    projectJobs: [job()],
    projectStorage: storage(),
    projectStorageError: null,
    projects: [project()],
    returnWorkspaceLabel: "Narration Workbench",
    selectedProfileId: "profile-1",
    speechPolicyProfile: "general",
    speechPolicyProfiles: [],
    onCancelJob: () => Promise.resolve(),
    onCancelProfileSource: () => Promise.resolve(),
    onCancelProfileTarget: () => Promise.resolve(),
    onClose: () => null,
    onCreateProject: () => Promise.resolve(),
    onDeleteProject: () => Promise.resolve(),
    onExportOpen: () => null,
    onImportOpen: () => null,
    onOpenSettings: () => null,
    onOpenVoiceDashboard: () => null,
    onRenameProject: () => Promise.resolve(),
    onSelectProfile: () => null,
    onSelectProject: () => null,
    onSpeechPolicyProfileChange: () => null,
  };
}

function project(): VoiceProject {
  return {
    createdAt: "2026-05-31T20:00:00Z",
    id: "project-1",
    name: "Current Novel",
    speechPolicyProfile: "general",
    updatedAt: "2026-05-31T21:00:00Z",
  };
}

function job(): VoiceJob {
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
    speechPolicyProfile: "general",
    status: "ready",
    summary: {},
    title: "Prepared Article",
    updatedAt: "2026-05-31T20:00:00Z",
    wordCount: 1200,
  } as unknown as PreparedSource;
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
