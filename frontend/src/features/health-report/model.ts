import type { StatusChipTone } from "../../design";
import type {
  AdapterDiagnostics,
  BookSource,
  PreparedSource,
  ProjectStorageSummary,
  SourceReadiness,
  SystemMetrics,
  TTSEngineDiagnostics,
  VoiceJob,
} from "../../types";
import type { NarrationStatusChip } from "../status-strip";
import {
  PROVIDER_CAPABILITY_KEYS,
  capabilityLabel,
  resolveProviderRuntimeCapabilities,
} from "../provider-capabilities";

export type ProviderReadinessState =
  | "pending"
  | "online"
  | "unavailable"
  | "missingModel"
  | "failedJob"
  | "unsupportedRoute";

export interface HealthReportFact {
  readonly label: string;
  readonly value: string;
}

export interface HealthReportCard {
  readonly detail: string;
  readonly facts: readonly HealthReportFact[];
  readonly label: string;
  readonly tone: StatusChipTone;
  readonly value: string;
}

export interface ProviderHealthReport extends HealthReportCard {
  readonly engineId: string;
  readonly engineLabel: string;
  readonly readiness: ProviderReadinessState;
}

export interface SourceExtractionHealthReport extends HealthReportCard {
  readonly state: "failed" | "ready" | "unsupported" | "waiting" | "warning";
}

export interface DiagnosticSummary {
  readonly generatedAt: string;
  readonly json: Record<string, unknown>;
  readonly text: string;
}

export interface HealthReport {
  readonly backend: HealthReportCard;
  readonly canNarrateNow: boolean;
  readonly diagnosticSummary: DiagnosticSummary;
  readonly job: HealthReportCard;
  readonly overall: HealthReportCard;
  readonly provider: ProviderHealthReport;
  readonly sourceExtraction: SourceExtractionHealthReport;
  readonly statusChips: readonly HealthReportCard[];
  readonly storage: HealthReportCard;
}

export interface HealthReportInput {
  readonly adapterDiagnostics?: Record<string, AdapterDiagnostics> | null;
  readonly adapterDiagnosticsError?: string | null;
  readonly canCreate: boolean;
  readonly job: VoiceJob | null;
  readonly metrics: SystemMetrics | null;
  readonly metricsError: string | null;
  readonly projectJobs: readonly VoiceJob[];
  readonly projectStorage: ProjectStorageSummary | null;
  readonly projectStorageError: string | null;
  readonly selectedBookSource?: BookSource | null;
  readonly selectedEngineId: string;
  readonly selectedPreparedSource?: PreparedSource | null;
  readonly sourceFallbackLabel?: string | null;
  readonly statusChips?: readonly NarrationStatusChip[];
  readonly ttsEngineError: string | null;
  readonly ttsEngines: readonly TTSEngineDiagnostics[];
}

export function buildHealthReport(input: HealthReportInput): HealthReport {
  const generatedAt = new Date().toISOString();
  const provider = providerHealth(input);
  const sourceExtraction = sourceExtractionHealth(input);
  const storage = storageHealth(input.projectStorage, input.projectStorageError);
  const backend = backendHealth(input.metrics, input.metricsError);
  const job = jobHealth(input.job, input.projectJobs);
  const statusChips = (input.statusChips ?? []).map((chip) => statusChipHealth(chip));
  const hasBlockingStatus = (input.statusChips ?? []).some((chip) => chip.issue.blocksCurrentStage);
  const canNarrateNow =
    input.canCreate &&
    provider.readiness === "online" &&
    sourceExtraction.state === "ready" &&
    !hasBlockingStatus;
  const overall = overallHealth({
    canNarrateNow,
    hasBlockingStatus,
    provider,
    sourceExtraction,
  });
  const report: Omit<HealthReport, "diagnosticSummary"> = {
    backend,
    canNarrateNow,
    job,
    overall,
    provider,
    sourceExtraction,
    statusChips,
    storage,
  };
  const diagnosticSummary = diagnosticSummaryForReport(report, input, generatedAt);
  return { ...report, diagnosticSummary };
}

function providerHealth(input: HealthReportInput): ProviderHealthReport {
  const failedJob = latestProviderFailedJob(input.job, input.projectJobs);
  const resolved =
    input.ttsEngines.length > 0
      ? resolveProviderRuntimeCapabilities(input.selectedEngineId, input.ttsEngines)
      : null;
  const engine = resolved?.engine ?? null;
  const engineId = engine?.id ?? input.selectedEngineId;
  const engineLabel = engine?.label ?? (input.selectedEngineId || "Configured provider");

  if (failedJob) {
    return providerCard({
      detail: failedJob.error ?? "The latest provider or queue job failed.",
      engineId,
      engineLabel,
      readiness: "failedJob",
      tone: "danger",
      value: "Failed job",
      facts: jobFailureFacts(failedJob),
    });
  }

  if (input.ttsEngineError || input.metricsError) {
    return providerCard({
      detail: input.ttsEngineError ?? input.metricsError ?? "Provider diagnostics are unavailable.",
      engineId,
      engineLabel,
      readiness: "unavailable",
      tone: "danger",
      value: "Unavailable",
    });
  }

  if (input.ttsEngines.length === 0 || !input.metrics) {
    return providerCard({
      detail: "Waiting for backend metrics and provider diagnostics.",
      engineId,
      engineLabel,
      readiness: "pending",
      tone: "neutral",
      value: "Pending",
    });
  }

  if (selectedEngineMissing(input.selectedEngineId, input.ttsEngines)) {
    return providerCard({
      detail: `${input.selectedEngineId} is not present in the loaded engine list.`,
      engineId,
      engineLabel,
      readiness: "unavailable",
      tone: "danger",
      value: "Unavailable",
    });
  }

  if (!engine) {
    return providerCard({
      detail: "No provider engine is selected.",
      engineId,
      engineLabel,
      readiness: "pending",
      tone: "neutral",
      value: "Pending",
    });
  }

  if (isMissingModelState(engine)) {
    return providerCard({
      detail: firstNonEmpty(
        engine.reason,
        engine.setup,
        "Provider model or runtime setup is missing.",
      ),
      engineId,
      engineLabel,
      readiness: "missingModel",
      tone: "warning",
      value: "Missing model",
      facts: engineFacts(engine),
    });
  }

  if (isUnsupportedRoute(engine, resolved)) {
    return providerCard({
      detail:
        engine.reason ??
        engine.setup ??
        `${engine.label} is configured but cannot serve the current narration route.`,
      engineId,
      engineLabel,
      readiness: "unsupportedRoute",
      tone: "warning",
      value: "Unsupported route",
      facts: engineFacts(engine),
    });
  }

  if (engine.status !== "ready") {
    return providerCard({
      detail: firstNonEmpty(engine.reason, engine.setup, "Provider is not ready."),
      engineId,
      engineLabel,
      readiness: "unavailable",
      tone: "danger",
      value: "Unavailable",
      facts: engineFacts(engine),
    });
  }

  return providerCard({
    detail: `${engine.label} is ready for text-to-speech.`,
    engineId,
    engineLabel,
    readiness: "online",
    tone: "success",
    value: "Ready",
    facts: [
      ...engineFacts(engine),
      {
        label: "Capabilities",
        value:
          PROVIDER_CAPABILITY_KEYS.filter((capability) => resolved?.capabilities[capability])
            .map((capability) => capabilityLabel(capability))
            .join(", ") || "None",
      },
    ],
  });
}

function providerCard(
  card: Omit<ProviderHealthReport, "facts" | "label"> &
    Partial<Pick<ProviderHealthReport, "facts" | "label">>,
): ProviderHealthReport {
  return {
    label: "Provider readiness",
    ...card,
    facts: card.facts ?? [],
  };
}

function sourceExtractionHealth(input: HealthReportInput): SourceExtractionHealthReport {
  const source = input.selectedPreparedSource ?? input.selectedBookSource ?? null;
  const readiness = source?.sourceReadiness;
  const adapterFacts = adapterHealthFacts(input.adapterDiagnostics, input.adapterDiagnosticsError);
  if (!source) {
    if (input.sourceFallbackLabel) {
      return {
        detail: `${input.sourceFallbackLabel} is available for narration.`,
        facts: adapterFacts,
        label: "Source extraction",
        state: "ready",
        tone: "success",
        value: "Ready",
      };
    }
    return {
      detail: "Select a source before narration can run.",
      facts: adapterFacts,
      label: "Source extraction",
      state: "waiting",
      tone: "neutral",
      value: "No source",
    };
  }

  const title = sourceTitle(source);
  if (readiness) {
    return sourceReadinessHealth(title, readiness, adapterFacts);
  }

  if (source.status === "failed") {
    return {
      detail: source.error ?? "Source extraction failed.",
      facts: adapterFacts,
      label: "Source extraction",
      state: "failed",
      tone: "danger",
      value: "Failed",
    };
  }

  return {
    detail: `${title} is available for narration.`,
    facts: adapterFacts,
    label: "Source extraction",
    state: "ready",
    tone: "success",
    value: "Ready",
  };
}

function sourceReadinessHealth(
  title: string,
  readiness: SourceReadiness,
  adapterFacts: readonly HealthReportFact[],
): SourceExtractionHealthReport {
  const facts = [
    { label: "Title", value: readiness.title ?? title },
    { label: "Structure", value: readiness.structureLabel ?? "n/a" },
    { label: "Confidence", value: readiness.confidence ?? "n/a" },
    ...adapterFacts,
  ];
  if (readiness.state === "ready") {
    return {
      detail: readiness.detail,
      facts,
      label: "Source extraction",
      state: "ready",
      tone: "success",
      value: "Ready",
    };
  }
  if (readiness.state === "failed") {
    return {
      detail: readiness.detail,
      facts,
      label: "Source extraction",
      state: "failed",
      tone: "danger",
      value: readiness.failureStage ?? "Failed",
    };
  }
  if (readiness.state === "unsupported") {
    return {
      detail: readiness.detail,
      facts,
      label: "Source extraction",
      state: "unsupported",
      tone: "danger",
      value: "Unsupported",
    };
  }
  return {
    detail: readiness.staleReason ?? readiness.detail,
    facts,
    label: "Source extraction",
    state: "warning",
    tone: "warning",
    value: readiness.state === "stale" ? "Stale" : "Needs review",
  };
}

function storageHealth(
  projectStorage: ProjectStorageSummary | null,
  projectStorageError: string | null,
): HealthReportCard {
  if (projectStorageError) {
    return {
      detail: projectStorageError,
      facts: [],
      label: "Storage",
      tone: "warning",
      value: "Attention",
    };
  }
  return {
    detail: projectStorage
      ? `${formatHealthBytes(projectStorage.generatedAudioBytes)} generated audio across ${projectStorage.jobCount.toLocaleString()} job(s).`
      : "Storage summary loads when a project is active.",
    facts: [
      { label: "Project total", value: formatHealthBytes(projectStorage?.totalBytes ?? 0) },
      {
        label: "Generated audio",
        value: formatHealthBytes(projectStorage?.generatedAudioBytes ?? 0),
      },
      {
        label: "Book/source data",
        value: formatHealthBytes(
          (projectStorage?.bookSourceBytes ?? 0) + (projectStorage?.preparedSourceBytes ?? 0),
        ),
      },
      { label: "Jobs", value: String(projectStorage?.jobCount ?? 0) },
    ],
    label: "Storage",
    tone: projectStorage && projectStorage.totalBytes > 1024 * 1024 * 1024 ? "warning" : "success",
    value: formatHealthBytes(projectStorage?.totalBytes ?? 0),
  };
}

function backendHealth(
  metrics: SystemMetrics | null,
  metricsError: string | null,
): HealthReportCard {
  const gpu = metrics?.gpus?.[0] ?? null;
  if (metricsError) {
    return {
      detail: metricsError,
      facts: [],
      label: "Backend and GPU",
      tone: "danger",
      value: "Unavailable",
    };
  }
  return {
    detail: gpu
      ? `${gpu.name} - ${gpu.memoryUsedMiB.toLocaleString()}/${gpu.memoryTotalMiB.toLocaleString()} MiB VRAM`
      : "GPU telemetry unavailable",
    facts: [
      { label: "Backend", value: metrics ? `Online - ${metrics.serviceVersion}` : "Pending" },
      { label: "GPU", value: gpu ? gpu.name : "Unavailable" },
      {
        label: "VRAM",
        value: gpu
          ? `${gpu.memoryUsedMiB.toLocaleString()}/${gpu.memoryTotalMiB.toLocaleString()} MiB`
          : "n/a",
      },
      { label: "Process RSS", value: formatHealthBytes(metrics?.process.rssBytes ?? 0) },
    ],
    label: "Backend and GPU",
    tone: metrics ? "success" : "neutral",
    value: metrics ? "Online" : "Pending",
  };
}

function jobHealth(job: VoiceJob | null, projectJobs: readonly VoiceJob[]): HealthReportCard {
  const latest = latestJob(job, projectJobs);
  if (!latest) {
    return {
      detail: "No narration job has run yet.",
      facts: [],
      label: "Job health",
      tone: "neutral",
      value: "Idle",
    };
  }
  if (latest.status === "failed") {
    return {
      detail: latest.error ?? latest.progress.detail,
      facts: jobFailureFacts(latest),
      label: "Job health",
      tone: "danger",
      value: "Failed generation",
    };
  }
  if (isWorkingJobStatus(latest.status)) {
    return {
      detail: latest.progress.detail || latest.progress.message || "Generation is running.",
      facts: jobFacts(latest),
      label: "Job health",
      tone: "info",
      value: "Working",
    };
  }
  if (latest.status === "completed") {
    return {
      detail: `${(latest.audioReadySegments ?? 0).toLocaleString()} ready segment(s); ${formatDurationMs(latest.durationMs)} audio.`,
      facts: jobFacts(latest),
      label: "Job health",
      tone: "success",
      value: "Ready",
    };
  }
  return {
    detail: latest.progress.detail || latest.status,
    facts: jobFacts(latest),
    label: "Job health",
    tone: latest.status === "cancelled" ? "warning" : "neutral",
    value: latest.status,
  };
}

function statusChipHealth(chip: NarrationStatusChip): HealthReportCard {
  return {
    detail: chip.issue.detail,
    facts: chip.issue.technicalDetail
      ? [{ label: "Technical", value: chip.issue.technicalDetail }]
      : [],
    label: chip.label,
    tone: chip.tone,
    value: chip.value,
  };
}

function overallHealth({
  canNarrateNow,
  hasBlockingStatus,
  provider,
  sourceExtraction,
}: Readonly<{
  canNarrateNow: boolean;
  hasBlockingStatus: boolean;
  provider: ProviderHealthReport;
  sourceExtraction: SourceExtractionHealthReport;
}>): HealthReportCard {
  if (canNarrateNow) {
    return {
      detail: "Create & Listen can run for the current source.",
      facts: [],
      label: "System health",
      tone: "success",
      value: "Ready to narrate",
    };
  }
  if (provider.readiness !== "online") {
    return {
      detail: provider.detail,
      facts: [],
      label: "System health",
      tone: provider.tone,
      value: "Provider attention",
    };
  }
  if (sourceExtraction.state !== "ready") {
    return {
      detail: sourceExtraction.detail,
      facts: [],
      label: "System health",
      tone: sourceExtraction.tone,
      value: "Source attention",
    };
  }
  if (hasBlockingStatus) {
    return {
      detail: "Resolve the blocking status item before creating audio.",
      facts: [],
      label: "System health",
      tone: "warning",
      value: "Blocked",
    };
  }
  return {
    detail: "Current narration controls are not ready yet.",
    facts: [],
    label: "System health",
    tone: "neutral",
    value: "Waiting",
  };
}

function diagnosticSummaryForReport(
  report: Omit<HealthReport, "diagnosticSummary">,
  input: HealthReportInput,
  generatedAt: string,
): DiagnosticSummary {
  const sections = [
    report.overall,
    report.provider,
    report.sourceExtraction,
    report.job,
    report.storage,
    report.backend,
  ];
  const text = [
    `Generated: ${generatedAt}`,
    `Can narrate now: ${report.canNarrateNow ? "yes" : "no"}`,
    ...sections.map((section) => sectionText(section)),
    statusChipsText(report.statusChips),
  ]
    .filter(Boolean)
    .join("\n\n");
  const json = {
    adapterDiagnostics: input.adapterDiagnostics ?? null,
    backend: cardJSON(report.backend),
    canNarrateNow: report.canNarrateNow,
    generatedAt,
    job: {
      ...cardJSON(report.job),
      activeJobId: input.job?.id ?? null,
      activeJobStatus: input.job?.status ?? null,
      failureKind: input.job?.failureKind ?? null,
      terminalReason: input.job?.terminalReason ?? null,
    },
    provider: {
      ...cardJSON(report.provider),
      engineId: report.provider.engineId,
      engineLabel: report.provider.engineLabel,
      readiness: report.provider.readiness,
      engines: input.ttsEngines.map((engine) => ({
        capabilities: engine.capabilities ?? null,
        id: engine.id,
        label: engine.label,
        modelCache: engine.modelCache ?? null,
        reason: engine.reason ?? null,
        setup: engine.setup ?? null,
        status: engine.status,
      })),
    },
    sourceExtraction: cardJSON(report.sourceExtraction),
    statusChips: report.statusChips.map((chip) => cardJSON(chip)),
    storage: {
      ...cardJSON(report.storage),
      directories: input.projectStorage?.directories ?? null,
      downloads: input.projectStorage?.downloads ?? [],
    },
  };
  return { generatedAt, json, text };
}

function sectionText(section: HealthReportCard): string {
  const facts = section.facts.map((fact) => `- ${fact.label}: ${fact.value}`).join("\n");
  return [`${section.label}: ${section.value}`, section.detail, facts].filter(Boolean).join("\n");
}

function statusChipsText(chips: readonly HealthReportCard[]): string {
  if (chips.length === 0) {
    return "";
  }
  return `Status chips:\n${chips
    .map((chip) => `- ${chip.label}: ${chip.value} - ${chip.detail}`)
    .join("\n")}`;
}

function cardJSON(card: HealthReportCard): Record<string, unknown> {
  return {
    detail: card.detail,
    facts: card.facts,
    label: card.label,
    tone: card.tone,
    value: card.value,
  };
}

function selectedEngineMissing(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): boolean {
  const normalized = normalizeEngineId(engineId);
  if (normalized === "auto") {
    return false;
  }
  return !engines.some((engine) => normalizeEngineId(engine.id) === normalized);
}

function isMissingModelState(engine: TTSEngineDiagnostics): boolean {
  const status = engine.status.trim().toLowerCase();
  const text = [engine.status, engine.reason, engine.setup, engine.modelCache]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    status !== "ready" &&
    /\b(missing|not found|not installed|install|dependency|dependencies|model|cache|artifact|setup-needed)\b/.test(
      text,
    )
  );
}

function isUnsupportedRoute(
  engine: TTSEngineDiagnostics,
  resolved: ReturnType<typeof resolveProviderRuntimeCapabilities> | null,
): boolean {
  const status = engine.status.trim().toLowerCase();
  return status === "configured" || (engine.experimental && resolved?.capabilities.tts !== true);
}

function latestProviderFailedJob(
  job: VoiceJob | null,
  projectJobs: readonly VoiceJob[],
): VoiceJob | null {
  const latest = latestJob(job, projectJobs);
  if (latest?.status !== "failed") {
    return null;
  }
  if (
    latest.failureKind === "engine" ||
    latest.failureKind === "queue" ||
    latest.terminalReason === "provider_failed" ||
    latest.terminalReason === "provider_timeout"
  ) {
    return latest;
  }
  return null;
}

function latestJob(job: VoiceJob | null, projectJobs: readonly VoiceJob[]): VoiceJob | null {
  const jobs = uniqueJobs([...(job ? [job] : []), ...projectJobs]);
  let latest: VoiceJob | null = null;
  for (const current of jobs) {
    if (!latest || dateValue(current.updatedAt) > dateValue(latest.updatedAt)) {
      latest = current;
    }
  }
  return latest;
}

function uniqueJobs(jobs: readonly VoiceJob[]): VoiceJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) {
      return false;
    }
    seen.add(job.id);
    return true;
  });
}

function jobFacts(job: VoiceJob): HealthReportFact[] {
  return [
    { label: "Job ID", value: job.id },
    { label: "Status", value: job.status },
    { label: "Provider", value: firstNonEmpty(job.provider, "n/a") },
    { label: "Engine", value: firstNonEmpty(job.ttsEngine, "n/a") },
    { label: "Progress", value: firstNonEmpty(job.progress.message, "n/a") },
  ];
}

function jobFailureFacts(job: VoiceJob): HealthReportFact[] {
  return [
    ...jobFacts(job),
    { label: "Terminal reason", value: job.terminalReason ?? "n/a" },
    { label: "Failure kind", value: job.failureKind ?? "n/a" },
    { label: "Retriable", value: job.retriable === false ? "no" : "yes" },
  ];
}

function engineFacts(engine: TTSEngineDiagnostics): HealthReportFact[] {
  return [
    { label: "Engine", value: engine.label },
    { label: "Status", value: engine.status },
    { label: "Model cache", value: engine.modelCache ?? "n/a" },
    { label: "VRAM", value: engine.estimatedVram ?? "n/a" },
  ];
}

function adapterHealthFacts(
  adapters: Record<string, AdapterDiagnostics> | null | undefined,
  error: string | null | undefined,
): HealthReportFact[] {
  if (error) {
    return [{ label: "Adapters", value: `Unavailable - ${error}` }];
  }
  const entries = Object.values(adapters ?? {});
  if (entries.length === 0) {
    return [{ label: "Adapters", value: "Pending" }];
  }
  const available = entries.filter((adapter) => adapter.available).length;
  const attention = entries
    .filter((adapter) => !adapter.available)
    .map((adapter) => adapter.adapterId);
  return [
    {
      label: "Adapters",
      value: `${available.toString()}/${entries.length.toString()} available`,
    },
    ...(attention.length > 0 ? [{ label: "Adapter attention", value: attention.join(", ") }] : []),
  ];
}

function sourceTitle(source: BookSource | PreparedSource): string {
  if ("sourceFile" in source) {
    return source.title ?? source.sourceFile;
  }
  return source.title ?? source.sourceName;
}

export function formatHealthBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatDurationMs(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0.0s";
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function isWorkingJobStatus(status: string): boolean {
  return (
    status === "queued" ||
    status === "optimizing" ||
    status === "synthesizing" ||
    status === "checking" ||
    status === "retrying"
  );
}

function dateValue(value: string): number {
  const date = Date.parse(value);
  return Number.isFinite(date) ? date : 0;
}

function normalizeEngineId(value: string): string {
  const clean = value.trim().toLowerCase();
  if (clean === "supertonic") {
    return "supertonic-3";
  }
  return clean || "auto";
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  return values.find((value) => value && value.trim().length > 0)?.trim() ?? "";
}
