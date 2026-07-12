import { describe, expect, it } from "vitest";
import type {
  PreparedSource,
  ProjectStorageSummary,
  SystemMetrics,
  TTSEngineDiagnostics,
  VoiceJob,
} from "../../types";
import type { NarrationStatusChip } from "../status-strip";
import { buildHealthReport } from "./model";

describe("buildHealthReport", () => {
  it.each([
    ["pending", { metrics: null, ttsEngines: [] }, "pending"],
    ["online", {}, "online"],
    [
      "unavailable",
      { ttsEngines: [engine({ reason: "Runtime offline.", status: "unavailable" })] },
      "unavailable",
    ],
    [
      "missingModel",
      {
        ttsEngines: [
          engine({ reason: "Model artifact is missing from the cache.", status: "setup-needed" }),
        ],
      },
      "missingModel",
    ],
    [
      "failedJob",
      {
        job: voiceJob({
          failureKind: "engine",
          status: "failed",
          terminalReason: "provider_failed",
        }),
      },
      "failedJob",
    ],
    [
      "unsupportedRoute",
      {
        ttsEngines: [
          engine({
            capabilities: { ...capabilities(), tts: false },
            experimental: true,
            id: "experimental-provider",
            label: "Experimental provider",
          }),
        ],
        selectedEngineId: "experimental-provider",
      },
      "unsupportedRoute",
    ],
  ] as const)("resolves provider readiness state %s", (_label, overrides, readiness) => {
    expect(report(overrides).provider.readiness).toBe(readiness);
  });

  it("allows narration when provider, source, and status checks are ready", () => {
    const health = report();

    expect(health.canNarrateNow).toBe(true);
    expect(health.overall.value).toBe("Ready to narrate");
  });

  it("blocks narration when the current source still needs extraction review", () => {
    const health = report({
      selectedPreparedSource: preparedSource({
        sourceReadiness: {
          confidence: "medium",
          detail: "Confirm metadata before narration.",
          state: "needsMetadata",
          structureLabel: "Article",
          title: "Needs review",
        },
      }),
    });

    expect(health.canNarrateNow).toBe(false);
    expect(health.overall.value).toBe("Source attention");
    expect(health.sourceExtraction.value).toBe("Needs review");
  });

  it("preserves status strip labels and tones when a bottom chip blocks narration", () => {
    const health = report({
      statusChips: [
        statusChip({
          detail: "Open Review and fix two warnings.",
          label: "Review",
          tone: "warning",
          value: "2 warnings",
        }),
      ],
    });

    expect(health.canNarrateNow).toBe(false);
    expect(health.overall.value).toBe("Blocked");
    expect(health.statusChips).toContainEqual(
      expect.objectContaining({
        detail: "Open Review and fix two warnings.",
        label: "Review",
        tone: "warning",
        value: "2 warnings",
      }),
    );
  });

  it("exports plain-text and JSON-safe diagnostic facts", () => {
    const health = report({
      adapterDiagnostics: {
        pdf: {
          adapterId: "pdf",
          available: false,
          status: "missing",
          warnings: ["Install pdftotext."],
        },
      },
    });

    expect(health.diagnosticSummary.text).toContain("Can narrate now: yes");
    expect(health.diagnosticSummary.json.provider).toMatchObject({
      engineId: "kokoro",
      readiness: "online",
    });
    expect(health.diagnosticSummary.json.adapterDiagnostics).toMatchObject({
      pdf: { available: false, status: "missing" },
    });
  });
});

function report(
  overrides: Partial<Parameters<typeof buildHealthReport>[0]> = {},
): ReturnType<typeof buildHealthReport> {
  return buildHealthReport({
    adapterDiagnostics: null,
    adapterDiagnosticsError: null,
    canCreate: true,
    job: null,
    metrics: metrics(),
    metricsError: null,
    projectJobs: [],
    projectStorage: storage(),
    projectStorageError: null,
    selectedBookSource: null,
    selectedEngineId: "kokoro",
    selectedPreparedSource: preparedSource(),
    sourceFallbackLabel: null,
    statusChips: [],
    ttsEngineError: null,
    ttsEngines: [engine()],
    ...overrides,
  });
}

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

function capabilities() {
  return {
    abComparison: false,
    alignment: false,
    alignmentRequiredForWordHighlight: false,
    alignmentSupported: false,
    cancelJob: false,
    localOnly: false,
    mockTts: false,
    phonemeOverrides: false,
    phraseTiming: false,
    retryJob: false,
    ssml: false,
    ssmlMarks: false,
    streaming: false,
    tts: true,
    voiceCloning: false,
    voicePreview: false,
    wordTiming: false,
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
        powerDrawW: 45,
        powerLimitW: 200,
        temperatureCelsius: 54,
        utilizationGpuPct: 12,
        utilizationMemPct: 8,
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
    serviceVersion: "test-backend",
    warnings: [],
  };
}

function preparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 1,
    createdAt: "2026-06-04T09:00:00.000Z",
    id: "source-1",
    kind: "file",
    projectId: "project-1",
    segmentCount: 1,
    sourceName: "Ready source",
    sourceReadiness: {
      confidence: "high",
      detail: "Ready source is ready for narration.",
      state: "ready",
      structureLabel: "Article",
      title: "Ready source",
    },
    speechPolicyProfile: "general",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 1,
      sentenceSegmentCount: 1,
      skippedBlockCount: 0,
      spokenBlockCount: 1,
    },
    updatedAt: "2026-06-04T09:00:00.000Z",
    wordCount: 120,
    ...overrides,
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

function voiceJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    createdAt: "2026-06-04T08:59:00.000Z",
    durationMs: 1000,
    id: "job-1",
    inputText: "Hello",
    optimizedText: "Hello",
    optimizer: "none",
    progress: {
      activeStage: "synthesis",
      detail: "Provider failed.",
      message: "Provider failed",
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
    stages: {
      checker: "pending",
      optimization: "completed",
      synthesis: "failed",
    },
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

function statusChip(overrides: {
  detail: string;
  label: string;
  tone: NarrationStatusChip["tone"];
  value: string;
}): NarrationStatusChip {
  return {
    id: overrides.label.toLowerCase(),
    issue: {
      blocksCurrentStage: true,
      chipValue: overrides.value,
      condition: "attention",
      detail: overrides.detail,
      id: overrides.label.toLowerCase(),
      label: overrides.label,
      owner: "review",
      recovery: { available: true, id: "openReview", label: "Open Review" },
      severity: "warning",
    },
    label: overrides.label,
    tone: overrides.tone,
    value: overrides.value,
  };
}
