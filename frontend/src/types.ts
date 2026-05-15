export type JobStatus =
  | "queued"
  | "optimizing"
  | "synthesizing"
  | "checking"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export type StageStatus = "waiting" | "running" | "done" | "failed";

export interface CreateVoiceJobRequest {
  text: string;
  projectId?: string;
  voiceProfileId?: string;
  voiceLanguage?: string;
  ttsVoice?: string;
  ttsLanguage?: string;
  adaptiveMode?: boolean;
  runMode?: RunMode;
  performanceMode?: PerformanceMode;
  pipelineOptions?: Partial<PipelineOptions>;
}

export type RunMode = "draftPreview" | "fastCreate" | "checkedMaster" | "publishMaster";

export type PerformanceMode = "balanced" | "throughput" | "quality";

export interface VoiceProject {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export type ThemeName = "light" | "dark" | "dawn" | "night";

export interface ProjectBundleContentItem {
  key: string;
  label: string;
  included: boolean;
  required: boolean;
  estimatedBytes?: number;
}

export interface ProjectBundleQuality {
  overallScore: number;
  averageLikeness?: number;
  checkerConfidence?: number;
  generatedDurationMs: number;
  warningCount: number;
}

export interface ProjectBundleFile {
  role: string;
  path: string;
  bytes: number;
  sha256?: string;
}

export interface ProjectBundleManifest {
  version: string;
  createdAt: string;
  appVersion: string;
  project: VoiceProject;
  jobs: VoiceJob[];
  profiles: VoiceProfile[];
  files: ProjectBundleFile[];
  providerVersions?: Record<string, string>;
  quality: ProjectBundleQuality;
  hashes?: Record<string, string>;
}

export interface ProjectBundleSummary {
  projectId: string;
  projectName: string;
  version: string;
  fileName: string;
  estimatedBytes: number;
  chapterCount: number;
  profileCount: number;
  generatedAudio: number;
  durationMs: number;
  contents: ProjectBundleContentItem[];
  warnings?: string[];
  createdAt: string;
}

export interface ProjectBundlePreview {
  valid: boolean;
  version?: string;
  projectName?: string;
  chapterCount?: number;
  profileCount?: number;
  generatedAudio?: number;
  estimatedBytes?: number;
  quality: ProjectBundleQuality;
  compatibility: string[];
  warnings?: string[];
  errors?: string[];
  manifest?: ProjectBundleManifest;
}

export type BundleImportMode = "copy" | "merge" | "replace";

export interface ProjectBundleImportResult {
  project: VoiceProject;
  jobs: VoiceJob[];
  profiles: VoiceProfile[];
  warnings?: string[];
}

export interface PipelineOptions {
  textPreprocess: boolean;
  voiceClone: boolean;
  asrCheck: boolean;
  autoRetry: boolean;
  arrivalPlayback: boolean;
  qualityReport: boolean;
}

export interface JobSegment {
  index: number;
  text: string;
  status?: "pending" | "running" | "checking" | "ready" | "failed";
  attempts?: number;
  durationMs?: number;
  latencyMs?: number;
  similarity?: number;
  reason?: string;
}

export type VoiceProfileStatus = "ready" | "error" | "pending";

export interface VoiceProfile {
  id: string;
  name: string;
  language: string;
  sourceFile: string;
  sourceBytes: number;
  sourceId?: string;
  speakerId?: string;
  speakerName?: string;
  sourceDurationMs?: number;
  referenceAudio: string;
  referencePath: string;
  referenceDurationMs?: number;
  referenceTrimmed: boolean;
  referenceSampleStrategy?: string;
  referenceVersion?: string;
  referenceScore?: number;
  referenceSpans?: VoiceProfileReferenceSpan[];
  qualityMetrics?: VoiceProfileQualityMetrics;
  denoise?: VoiceProfileDenoiseMetadata;
  likeness?: VoiceProfileLikeness;
  audioFormat: string;
  status: VoiceProfileStatus;
  error?: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVoiceProfileRequest {
  name: string;
  language: string;
  file: File;
}

export type VoiceProfileSourceStatus =
  | "queued"
  | "normalizing"
  | "analyzing"
  | "scoring"
  | "ready"
  | "failed";

export interface VoiceProfileReferenceSpan {
  startMs: number;
  endMs: number;
  durationMs: number;
  score: number;
}

export interface VoiceProfileQualityMetrics {
  cleanSpeech: number;
  singleSpeakerConfidence: number;
  usableDurationMs: number;
  clippingRisk: number;
  noiseRisk: number;
  noiseRiskBefore?: number;
  noiseRiskAfter?: number;
  silenceRatio: number;
  sourceCoverage: number;
}

export interface VoiceProfileDenoiseMetadata {
  provider: string;
  strength: string;
  applied: boolean;
  rawAudio?: string;
  cleanAudio?: string;
  rawPath?: string;
  cleanPath?: string;
  noiseRiskBefore?: number;
  noiseRiskAfter?: number;
  snrBeforeDb?: number;
  snrAfterDb?: number;
  warnings?: string[];
  reason?: string;
}

export interface VoiceProfileLikeness {
  status: "pending" | "ready" | "failed";
  score?: number;
  speakerSimilarity?: number;
  embeddingModel?: string;
  calibrationText?: string;
  measuredAt?: string;
  reason?: string;
}

export interface VoiceProfileCandidate {
  id: string;
  speakerId: string;
  suggestedName: string;
  status: "ready" | "rejected";
  rank?: number;
  recommended?: boolean;
  suitability?: "recommended" | "short_reference" | "rejected";
  warnings?: string[];
  reason?: string;
  previewAudio?: string;
  rawPreviewAudio?: string;
  cleanPreviewAudio?: string;
  referenceAudio?: string;
  referenceDurationMs: number;
  referenceVersion: string;
  referenceSampleStrategy: string;
  strategyVersion: string;
  modelVersion?: string;
  score: number;
  totalSpeechDurationMs: number;
  referenceSpanCount?: number;
  spans: VoiceProfileReferenceSpan[];
  qualityMetrics: VoiceProfileQualityMetrics;
  denoise?: VoiceProfileDenoiseMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceProfileSourceStage {
  name: string;
  status: "waiting" | "running" | "done" | "failed";
  detail?: string;
}

export interface VoiceProfileSource {
  id: string;
  status: VoiceProfileSourceStatus;
  sourceFile: string;
  sourceBytes: number;
  sourceDurationMs?: number;
  normalizedAudio?: string;
  cleanedAudio?: string;
  denoise?: VoiceProfileDenoiseMetadata;
  audioFormat: string;
  progressMessage: string;
  progressDetail?: string;
  error?: string;
  stages: VoiceProfileSourceStage[];
  candidates: VoiceProfileCandidate[];
  strategyVersion: string;
  modelVersion?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceProfileSourceDiagnostics {
  mode: string;
  model: string;
  modelPath?: string;
  localModelDir?: string;
  pythonPath: string;
  tokenConfigured: boolean;
  localModelAvailable: boolean;
  ffmpegAvailable: boolean;
  setupMessage: string;
}

export interface CreateVoiceProfileSourceRequest {
  file: File;
}

export interface CreateVoiceProfileFromCandidateRequest {
  name: string;
  language: string;
}

export interface RetryMetadata {
  maxRetries: number;
  attempts: number;
  segmentAttempts: number;
  currentSegment: number;
  totalSegments: number;
}

export interface PipelineStages {
  optimization: StageStatus;
  synthesis: StageStatus;
  checker: StageStatus;
}

export interface GpuMetric {
  index: number;
  name: string;
  uuid: string;
  utilizationGpuPct: number;
  utilizationMemPct: number;
  memoryTotalMiB: number;
  memoryUsedMiB: number;
  memoryFreeMiB: number;
  powerDrawW: number;
  powerLimitW: number;
  temperatureCelsius: number;
}

export interface ProcessMetrics {
  pid: number;
  threads: number;
  rssBytes: number;
  vmSizeBytes: number;
  workingDir: string;
  runtime: string;
  numGoroutines: number;
  heapAllocBytes: number;
  totalAllocBytes: number;
  sysBytes: number;
}

export interface HostMetrics {
  hostname: string;
  goMaxProcs: number;
  cpuCount: number;
  os: string;
  kernel: string;
  swapFreeBytes: number;
  swapTotalBytes: number;
  memTotalBytes: number;
  memAvailableBytes: number;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
}

export interface SystemMetrics {
  collectedAt: string;
  serviceVersion: string;
  gpus?: GpuMetric[] | null;
  warnings?: string[] | null;
  process: ProcessMetrics;
  host: HostMetrics;
}

export interface VoiceCheck {
  complete: boolean;
  transcript: string;
  resumeText?: string;
  needsResume: boolean;
  reason: string;
  provider: string;
  similarity: number;
}

export interface JobProgress {
  message: string;
  detail: string;
  activeStage: string;
  currentSegment?: number;
  totalSegments?: number;
  startedAt?: string;
}

export interface VoiceJob {
  id: string;
  projectId: string;
  status: JobStatus;
  adaptiveMode?: boolean;
  runMode?: RunMode;
  performanceMode?: PerformanceMode;
  pipelineOptions?: PipelineOptions;
  stages: PipelineStages;
  segments?: JobSegment[];
  inputText: string;
  optimizedText: string;
  optimizer: string;
  audioUrl: string;
  audioPartialUrl?: string;
  audioPath?: string;
  audioReadySegments?: number;
  audioSegmentDurationsMs?: number[];
  audioSegmentLatenciesMs?: number[];
  contentType: string;
  durationMs: number;
  provider: string;
  voice: string;
  ttsVoice?: string;
  ttsLanguage?: string;
  voiceProfileName?: string;
  retries: RetryMetadata;
  voiceCheck: VoiceCheck;
  qualityReport?: JobQualityReport;
  progress: JobProgress;
  error?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface JobQualityReport {
  enabled: boolean;
  preprocessChangedPct: number;
  retryCount: number;
  averageSimilarity: number;
  averageLatencyMs: number;
  segmentCount: number;
  referenceProfile: boolean;
  reason: string;
}
