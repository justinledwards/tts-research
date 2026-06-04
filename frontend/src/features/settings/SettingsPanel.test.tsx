import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  DEFAULT_SPEECH_POLICY_DEFINITION,
} from "../../speechPolicy";
import { createRunConfiguration } from "../../runConfig";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS } from "../../teleprompter";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { DEFAULT_TELEPROMPT_THEATRE_SETTINGS } from "../teleprompt/telepromptTheatreSettings";
import { defaultUiMemoryState } from "../preferences";
import { DEFAULT_SHORTCUT_PREFERENCES } from "../shortcuts/shortcutRegistry";
import { SettingsPanel } from "./SettingsPanel";
import type { SettingsCommandTarget } from "./model";
import type {
  AdapterDiagnostics,
  CustomSpeechPolicyProfile,
  ProjectStorageSummary,
  SystemMetrics,
  TTSEngineDiagnostics,
  VoiceJob,
} from "../../types";

const noop = () => {
  // Test callback.
};

const asyncNoop = async () => {
  // Test callback.
};

function renderSettingsPanel(
  commandTarget?: SettingsCommandTarget,
  options: Readonly<{
    adapterDiagnostics?: Record<string, AdapterDiagnostics> | null;
    customSpeechPolicyProfiles?: CustomSpeechPolicyProfile[];
    job?: VoiceJob | null;
    metrics?: SystemMetrics | null;
    projectStorage?: ProjectStorageSummary | null;
    sourceFallbackLabel?: string | null;
    speechPolicyProfile?: string;
    ttsEngines?: TTSEngineDiagnostics[];
  }> = {},
): string {
  return renderToStaticMarkup(
    <SettingsPanel
      adapterDiagnostics={options.adapterDiagnostics ?? null}
      adapterDiagnosticsError={null}
      canSubmit
      commandTarget={commandTarget}
      customSpeechPolicyProfiles={options.customSpeechPolicyProfiles ?? []}
      isOpen
      isSpeechPolicyPreviewing={false}
      job={options.job ?? null}
      metrics={options.metrics ?? null}
      metricsError={null}
      profileSource={null}
      profileSourceDiagnostics={null}
      projectStorage={options.projectStorage ?? null}
      projectStorageError={null}
      readerAccessibilitySettings={DEFAULT_READER_ACCESSIBILITY_SETTINGS}
      readAlongPreferences={DEFAULT_READ_ALONG_PREFERENCES}
      researchModules={[]}
      runConfiguration={createRunConfiguration("checkedMaster")}
      selectedBookSource={null}
      selectedPreparedSource={null}
      selectedProfile={null}
      sourceMode="text"
      sourceFallbackLabel={options.sourceFallbackLabel ?? "Draft text"}
      sourcePolicySavingKey={null}
      speechPolicyDefinition={DEFAULT_SPEECH_POLICY_DEFINITION}
      speechPolicyError={null}
      speechPolicyOverrides={{}}
      speechPolicyProfile={options.speechPolicyProfile ?? "Enterprise"}
      speechPolicyProfiles={DEFAULT_SPEECH_POLICY_DEFINITION.profiles}
      shortcutPreferences={DEFAULT_SHORTCUT_PREFERENCES}
      telepromptTheatreSettings={DEFAULT_TELEPROMPT_THEATRE_SETTINGS}
      teleprompterSettings={DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS}
      themeName="light"
      ttsEngineError={null}
      ttsEngines={options.ttsEngines ?? []}
      uiMemory={defaultUiMemoryState()}
      onClearBookSourcePolicy={asyncNoop}
      onClearPreparedSourcePolicy={asyncNoop}
      onClearSpeechPolicyOverrides={noop}
      onClose={noop}
      onCreateCustomSpeechPolicyProfile={asyncNoop}
      onDeleteCustomSpeechPolicyProfile={asyncNoop}
      onReaderAccessibilitySettingsChange={noop}
      onReadAlongPreferencesChange={noop}
      onRunConfigurationChange={noop}
      onSaveBookSourcePolicy={asyncNoop}
      onSavePreparedSourcePolicy={asyncNoop}
      onShortcutPreferencesChange={noop}
      onShortcutPreferencesReset={noop}
      onSpeechPolicyOverridesChange={noop}
      onSpeechPolicyProfileChange={noop}
      onSubmit={noop}
      onTelepromptTheatreSettingsChange={noop}
      onTeleprompterSettingsChange={noop}
      onThemeChange={noop}
      onUiMemoryExportPreferences={() => "{}"}
      onUiMemoryImportPreferences={() => ({ message: "Imported.", ok: true })}
      onUiMemoryPreferenceChange={noop}
      onUiMemoryReset={noop}
      onUpdateCustomSpeechPolicyProfile={asyncNoop}
    />,
  );
}

describe("SettingsPanel", () => {
  it("renders task groups, quick settings, and scope labels", () => {
    const markup = renderSettingsPanel();

    expect(markup).toContain("Studio Settings");
    expect(markup).toContain("Quick settings");
    expect(markup).toContain("Quick");
    expect(markup).toContain("Advanced");
    expect(markup).toContain("Expert / Diagnostics");
    expect(markup).toContain("Output intent");
    expect(markup).toContain("Use-case preset");
    expect(markup).toContain("Long-form book listening");
    expect(markup).toContain("Before / after summary");
    expect(markup).toContain("Settings audit");
    expect(markup).toContain("Built-in defaults -&gt; Machine defaults -&gt; Project defaults");
    expect(markup).toContain("Preview draft");
    expect(markup).toContain("Apply preset defaults");
    expect(markup).toContain("Policy requires confirm");
    expect(markup).toContain("Preview sample");
    expect(markup).toContain("Session");
    expect(markup).toContain("Project");
    expect(markup).toContain("Source");
    expect(markup).toContain("Machine");
  });

  it("renders the golden-minute speech-policy preview when targeted", () => {
    const markup = renderSettingsPanel({
      fieldId: "projectSpeechPolicy",
      groupId: "sources",
      layerId: "advanced",
      scope: "project",
    });

    expect(markup).toContain("Golden-minute policy preview");
    expect(markup).toContain("Visual spoken-text preview");
    expect(markup).toContain("Reset project default");
    expect(markup).toContain("without changing selected-source pins");
    expect(markup).toContain("citation [^gm1]");
    expect(markup).toContain("Dr. -&gt; Doctor");
    expect(markup).toContain("Enterprise vs Education");
    expect(markup).toContain("Accessibility vs Technical Docs");
  });

  it("renders Teleprompt Theatre settings when targeted", () => {
    const markup = renderSettingsPanel({
      fieldId: "telepromptTheatre",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Teleprompt Theatre");
    expect(markup).toContain("Laptop presenter");
    expect(markup).toContain("Recording booth");
    expect(markup).toContain("Cue font size");
  });

  it("renders reader typography presets only inside Reader settings", () => {
    const markup = renderSettingsPanel({
      fieldId: "readerPreferences",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Typography preset");
    expect(markup).toContain("Teleprompt");
    expect(markup).toContain("Theatre");
    expect(markup).toContain('data-testid="ui-action-reader-typography-preset"');
    expect(markup).not.toContain("settings-quick-reader-scale");
  });

  it("renders the Studio tutorial launcher preference in UI memory settings", () => {
    const markup = renderSettingsPanel({
      fieldId: "uiMemory",
      groupId: "reader",
      layerId: "advanced",
      scope: "machine",
    });

    expect(markup).toContain("Show Studio tutorial launcher");
    expect(markup).toContain('data-testid="ui-action-ui-memory-show-tutorial-launcher"');
  });

  it("renders custom golden-minute policy comparison when a user profile exists", () => {
    const markup = renderSettingsPanel(
      {
        fieldId: "projectSpeechPolicy",
        groupId: "sources",
        layerId: "advanced",
        scope: "project",
      },
      {
        customSpeechPolicyProfiles: [
          {
            baseProfile: "Enterprise",
            createdAt: "2026-05-27T00:00:00.000Z",
            id: "custom-policy",
            name: "Project proofing custom",
            settings: {
              ...BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
              citationMode: "inline",
              footnoteMode: "inline",
            },
            updatedAt: "2026-05-27T00:00:00.000Z",
          },
        ],
        speechPolicyProfile: "custom-policy",
      },
    );

    expect(markup).toContain("Project proofing custom");
    expect(markup).toContain("Custom vs project default");
    expect(markup).toContain("sentence highlight");
    expect(markup).toContain("Citation marker [^gm1] is read inline");
  });

  it("shows provider timing limits in read-along settings", () => {
    const markup = renderSettingsPanel(
      {
        fieldId: "readAlongPreferences",
        groupId: "reader",
        layerId: "advanced",
        scope: "machine",
      },
      {
        ttsEngines: [
          {
            capabilities: {
              abComparison: true,
              alignment: true,
              alignmentRequiredForWordHighlight: true,
              alignmentSupported: true,
              cancelJob: true,
              localOnly: true,
              mockTts: false,
              phonemeOverrides: true,
              phraseTiming: true,
              retryJob: true,
              ssml: true,
              ssmlMarks: true,
              streaming: true,
              tts: true,
              voiceCloning: true,
              voicePreview: true,
              wordTiming: false,
            },
            default: true,
            experimental: false,
            id: "kokoro",
            label: "No word timing profile",
            local: true,
            status: "ready",
            supportsReference: true,
            supportsSSML: true,
            supportsSwedish: true,
            supportsVoice: true,
          },
        ],
      },
    );

    expect(markup).toContain("Provider timing limits");
    expect(markup).toContain("Word highlight unavailable");
    expect(markup).toContain("Phrase highlight fallback available");
    expect(markup).toContain("Forced alignment required");
    expect(markup).toContain('data-command-id="readalong:word-highlight"');
  });

  it("renders expert diagnostic facts with copy and JSON export controls", () => {
    const markup = renderSettingsPanel(
      {
        groupId: "diagnostics",
        layerId: "expert",
        scope: "machine",
      },
      {
        adapterDiagnostics: {
          markdown: {
            adapterId: "markdown",
            available: true,
            cliPath: "/usr/bin/markdown",
            status: "available",
          },
        },
        job: job({
          failureKind: "engine",
          status: "failed",
          terminalReason: "provider_timeout",
        }),
        metrics: metrics(),
        projectStorage: storage(),
        ttsEngines: [
          engine({
            estimatedVram: "6 GB",
            modelCache: "/models/kokoro",
          }),
        ],
      },
    );

    expect(markup).toContain("Diagnostic summary");
    expect(markup).toContain("Copy diagnostic summary");
    expect(markup).toContain("Download diagnostics JSON");
    expect(markup).toContain("Provider readiness");
    expect(markup).toContain("failedJob");
    expect(markup).toContain("Terminal reason");
    expect(markup).toContain("provider_timeout");
    expect(markup).toContain("Backend, process, host, and GPU");
    expect(markup).toContain("Test GPU");
    expect(markup).toContain("8,000/24,000 MiB");
    expect(markup).toContain("Adapter diagnostics");
    expect(markup).toContain("markdown");
    expect(markup).toContain("/usr/bin/markdown");
    expect(markup).toContain("Technical storage details");
    expect(markup).toContain("/opt/tts-research-test/audio");
    expect(markup).toContain("Engine health");
    expect(markup).toContain("/models/kokoro");
    expect(markup).toContain("Run configuration and speech policy JSON");
    expect(markup).toContain("Active run configuration");
    expect(markup).toContain("Speech policy and overrides");
  });
});

function engine(overrides: Partial<TTSEngineDiagnostics> = {}): TTSEngineDiagnostics {
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

function metrics(): SystemMetrics {
  return {
    collectedAt: "2026-06-04T09:00:00.000Z",
    gpus: [
      {
        index: 0,
        memoryFreeMiB: 16_000,
        memoryTotalMiB: 24_000,
        memoryUsedMiB: 8000,
        name: "Test GPU",
        powerDrawW: 50,
        powerLimitW: 200,
        temperatureCelsius: 54,
        utilizationGpuPct: 10,
        utilizationMemPct: 5,
        uuid: "gpu-1",
      },
    ],
    host: {
      cpuCount: 8,
      goMaxProcs: 8,
      hostname: "test-host",
      kernel: "test-kernel",
      loadAvg1: 0.1,
      loadAvg15: 0.3,
      loadAvg5: 0.2,
      memAvailableBytes: 512,
      memTotalBytes: 1024,
      os: "linux",
      swapFreeBytes: 0,
      swapTotalBytes: 0,
    },
    process: {
      heapAllocBytes: 128,
      numGoroutines: 4,
      pid: 123,
      rssBytes: 4096,
      runtime: "go-test",
      sysBytes: 512,
      threads: 3,
      totalAllocBytes: 256,
      vmSizeBytes: 8192,
      workingDir: "/opt/tts-research-test",
    },
    serviceVersion: "frontend-test",
    warnings: [],
  };
}

function storage(): ProjectStorageSummary {
  return {
    bookSourceBytes: 1024,
    bookSourceCount: 1,
    directories: {
      audio: "/opt/tts-research-test/audio",
      sources: "/opt/tts-research-test/sources",
    },
    downloads: [],
    generatedAudioBytes: 2048,
    jobBytes: 512,
    jobCount: 1,
    preparedSourceBytes: 256,
    preparedSourceCount: 1,
    projectId: "project-1",
    projectName: "Project",
    totalBytes: 3840,
    updatedAt: "2026-06-04T09:00:00.000Z",
  };
}

function job(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    createdAt: "2026-06-04T08:59:00.000Z",
    durationMs: 1000,
    error: "Provider timed out.",
    id: "job-1",
    inputText: "Hello",
    optimizedText: "Hello",
    optimizer: "none",
    progress: {
      activeStage: "synthesis",
      detail: "Provider timed out.",
      message: "Provider timed out",
    },
    projectId: "project-1",
    provider: "kokoro",
    retries: {
      attempts: 1,
      currentSegment: 1,
      maxRetries: 1,
      segmentAttempts: 1,
      totalSegments: 1,
    },
    stages: {},
    status: "completed",
    updatedAt: "2026-06-04T09:00:00.000Z",
    voice: "default",
    voiceCheck: {
      complete: false,
      needsResume: false,
      provider: "none",
      reason: "",
      similarity: 0,
      transcript: "",
    },
    ...overrides,
  } as VoiceJob;
}
