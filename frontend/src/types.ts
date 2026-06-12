import type { ContentIRLocator, LocatorEnvelope } from "./content-ir";
import type {
  CustomSpeechPolicyProfile,
  SpeechPolicyDecision,
  SpeechPolicyOverrides,
} from "./types/speechPolicyTypes";

export * from "./types/speechPolicyTypes";

export type JobStatus =
  | "queued"
  | "optimizing"
  | "synthesizing"
  | "checking"
  | "retrying"
  | "completed"
  | "failed"
  | "cancelled";

export type JobTerminalReason =
  | "user_cancelled"
  | "system_cancelled"
  | "provider_failed"
  | "provider_timeout"
  | "validation_failed"
  | "superseded"
  | "metadata_failed"
  | "configuration_failed";

export type JobFailureKind = "source" | "voice" | "engine" | "backend" | "cancellation" | "queue";

export type StageStatus = "waiting" | "running" | "done" | "failed";

export interface CreateVoiceJobRequest {
  text: string;
  speechText?: string;
  voiceId?: string;
  projectId?: string;
  bookSourceId?: string;
  bookScope?: BookScope;
  preparedSourceId?: string;
  temporarySourceId?: string;
  selectedBlockIds?: string[];
  sourceKind?: string;
  progressTargetId?: string;
  voiceProfileId?: string;
  voiceLanguage?: string;
  ttsEngine?: string;
  engineOptions?: Partial<Record<string, string>>;
  ttsVoice?: string;
  ttsLanguage?: string;
  adaptiveMode?: boolean;
  runMode?: RunMode;
  performanceMode?: PerformanceMode;
  pipelineOptions?: Partial<PipelineOptions>;
  speechPolicyProfile?: string;
  speechPolicyOverrides?: SpeechPolicyOverrides;
  locale?: string;
  speechRenderApplied?: boolean;
}

export type RunMode = "draftPreview" | "fastCreate" | "checkedMaster" | "publishMaster";

export type PerformanceMode = "balanced" | "throughput" | "quality";

export interface VoiceProject {
  id: string;
  name: string;
  speechPolicyProfile: string;
  speechPolicyProfiles?: CustomSpeechPolicyProfile[];
  createdAt: string;
  updatedAt: string;
}

export type VoiceKind = "native" | "clone";

export interface Voice {
  id: string;
  name: string;
  kind: VoiceKind;
  provider: string;
  langCode: string;
  referenceAudioUrl?: string;
  sourceFilename?: string;
  createdAt: string;
}

export interface ProjectStorageDownload {
  kind: string;
  label: string;
  url: string;
  fileName: string;
  bytes?: number;
  jobId?: string;
  segment?: number;
  available: boolean;
}

export interface ProjectStorageSummary {
  projectId: string;
  projectName: string;
  generatedAudioBytes: number;
  bookSourceBytes: number;
  preparedSourceBytes: number;
  jobBytes: number;
  totalBytes: number;
  jobCount: number;
  bookSourceCount: number;
  preparedSourceCount: number;
  downloads: ProjectStorageDownload[];
  directories?: Record<string, string>;
  warnings?: string[];
  updatedAt: string;
}

export type BookSourceStatus = "ready" | "failed";

export type SourceOwner = "project" | "temporary";

export type TemporarySourceLifecycleState =
  | "created"
  | "importing"
  | "extracted"
  | "needs_metadata"
  | "reviewable"
  | "previewable"
  | "generating"
  | "audio_ready"
  | "stale"
  | "failed"
  | "promoted"
  | "expired"
  | "discarded";

export type TemporarySourcePromotionStatus = "notPromoted" | "promoted" | "promotionFailed";

export type SourceArtifactScope = "project" | "temporary";

export interface SourceArtifactRef {
  id: string;
  scope: SourceArtifactScope;
  kind:
    | "extraction"
    | "review"
    | "previewAudio"
    | "generatedAudio"
    | "timing"
    | "validation"
    | "bookmark"
    | "progress";
  url?: string;
  bytes?: number;
  createdAt: string;
  expiresAt?: string;
}

export type TemporarySourceCleanupAction =
  | "discardNow"
  | "extendSession"
  | "removeGeneratedAudioOnly"
  | "removeAllTemporaryArtifacts";

export interface TemporarySourceCleanupRequest {
  action: TemporarySourceCleanupAction;
  extendByHours?: number;
}

export interface TemporarySourceCleanupResult {
  temporarySourceId: string;
  action: TemporarySourceCleanupAction;
  status: TemporarySourceLifecycleState;
  removedBytes?: number;
  expiresAt?: string;
  message?: string;
  source?: TemporarySourceSession;
}

export interface TemporaryStorageUsageSession {
  temporarySourceId: string;
  title?: string;
  status: TemporarySourceLifecycleState;
  bytes: number;
  audioBytes?: number;
  artifactBytes?: number;
  sourceBytes?: number;
  progressBytes?: number;
  expiresAt: string;
  lastAccessedAt: string;
}

export interface TemporaryStorageUsageSummary {
  totalBytes: number;
  sourceBytes: number;
  artifactBytes: number;
  audioBytes: number;
  progressBytes: number;
  temporaryCount: number;
  expiredCount: number;
  generatingCount: number;
  sessions: TemporaryStorageUsageSession[];
  updatedAt: string;
}

export type SourceReadinessState =
  | "noSource"
  | "importing"
  | "needsMetadata"
  | "ready"
  | "failed"
  | "unsupported"
  | "stale";

export type SourceReadinessFailureStage = "file" | "extraction" | "structure" | "policyPreparation";

export interface SourceReadiness {
  state: SourceReadinessState;
  title?: string;
  sourceType?: string;
  language?: string;
  structureLabel?: string;
  confidence?: string;
  confirmedFields?: string[];
  preparedAt?: string;
  staleReason?: string;
  failureStage?: SourceReadinessFailureStage;
  retryAction?: string;
  detail: string;
}

export interface SourceReadinessConfirmationRequest {
  title?: string;
  sourceType?: string;
  language?: string;
  structureChoice?: string;
  structureLabel?: string;
  scope?: BookScope;
  speechPolicyProfile?: string;
  voiceProfileId?: string;
}

export interface RenameAssetRequest {
  name: string;
}

export type BookSourceKind = "pdf" | "epub" | "docx" | "html" | "markdown" | "image";

export type BookImportProfile = "auto" | "scholarly";
export type PDFTableMode = "auto" | "off" | "structured";

export interface BookSourceImportOptions {
  importProfile?: BookImportProfile;
  pdfTableMode?: PDFTableMode;
}

export interface BookSourcePage {
  index: number;
  label: string;
  text?: string;
  wordCount: number;
  sectionId?: string;
}

export interface BookSourceChapter {
  index: number;
  id?: string;
  title: string;
  text?: string;
  wordCount: number;
  role?: BookSourceSectionRole;
  isNarratable?: boolean;
  pageStart?: number;
  pageEnd?: number;
  sourceHref?: string;
  estimatedDurationMs?: number;
  warnings?: string[];
}

export interface BookSourceWordSpan {
  index: number;
  text: string;
  pageIndex?: number;
  chapter?: number;
  startOffset: number;
  endOffset: number;
}

export type BookSourceSectionRole = "frontmatter" | "body" | "backmatter" | "appendix";

export interface BookSourceSection {
  id: string;
  index: number;
  title: string;
  role: BookSourceSectionRole;
  isNarratable: boolean;
  kind: string;
  chapterIndex?: number;
  pageStart?: number;
  pageEnd?: number;
  sourceHref?: string;
  wordCount: number;
  estimatedDurationMs?: number;
  warnings?: string[];
}

export interface BookSource {
  id: string;
  projectId: string;
  sourceOwner?: SourceOwner;
  temporarySourceId?: string;
  status: BookSourceStatus;
  sourceReadiness?: SourceReadiness;
  kind: BookSourceKind;
  sourceFile: string;
  sourceBytes: number;
  title?: string;
  author?: string;
  text?: string;
  wordCount: number;
  pageCount: number;
  chapterCount: number;
  structureVersion?: string;
  defaultSectionId?: string;
  readingOrder?: string[];
  sections?: BookSourceSection[];
  pages?: BookSourcePage[];
  chapters?: BookSourceChapter[];
  wordSpans?: BookSourceWordSpan[];
  sourceSpeechPolicyProfile?: string;
  sourceSpeechPolicyOverrides?: SpeechPolicyOverrides;
  warnings?: string[];
  ingestion?: IngestionDiagnostics;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface IngestionDiagnostics {
  supportTier?: string;
  supportTierLabel?: string;
  confidence?: number;
  importProfile?: string;
  pdfTableMode?: string;
  temporaryExpiresAt?: string;
  temporaryStatus?: TemporarySourceLifecycleState;
  extractorChain?: ExtractorChainStep[];
  warnings?: string[];
}

export interface ExtractorChainStep {
  id: string;
  label: string;
  status: string;
  confidence?: number;
  warnings?: string[];
}

export type BookScopeType = "book" | "chapter" | "pages";

export interface BookScope {
  type: BookScopeType;
  chapterIndex?: number;
  pageStart?: number;
  pageEnd?: number;
  label?: string;
}

export interface BookCinemaDiagnostics {
  pdfExtractor: string;
  pdfExtractorAvailable: boolean;
  pdfStrict: boolean;
  pdfSetup?: string;
  pdftotextAvailable: boolean;
  pythonFallbackAvailable: boolean;
  pythonFallbackConfigured: boolean;
  pythonPath?: string;
  pythonScript?: string;
  adapters?: Record<string, AdapterDiagnostics>;
}

export interface AdapterCapability {
  adapterId: string;
  extensions: string[];
  mimeTypes: string[];
  sourceKinds: string[];
  features: Record<string, unknown>;
}

export interface AdapterDiagnostics {
  adapterId: string;
  available: boolean;
  status: string;
  cliPath?: string;
  warnings?: string[];
  tools?: Record<string, AdapterToolDiagnostics>;
}

export interface AdapterToolDiagnostics {
  available: boolean;
  status: string;
}

export interface BookSourceScopeContent {
  bookSourceId: string;
  scope: BookScope;
  text: string;
  wordSpans: BookSourceWordSpan[];
  section?: BookSourceSection;
  wordCount: number;
  estimatedDurationMs?: number;
  sourceStructureValid: boolean;
  blocks?: NarrationBlock[];
  skippedItems?: SkippedSourceItem[];
  summary?: PreparedSourceSummary;
  warnings?: string[];
}

export type PreparedSourceKind = "text" | "file" | "url" | "book";
export type PreparedSourceStatus = "ready" | "failed";
export type MarkdownParseMode = "strict" | "legacy";
export type NarrationBlockKind =
  | "heading"
  | "subheading"
  | "body"
  | "quote"
  | "table"
  | "code"
  | "math"
  | "image"
  | "caption"
  | "citation"
  | "footnote"
  | "reference"
  | "artifact_token"
  | "unknown_inline_marker"
  | "list"
  | "frontmatter"
  | "admonition"
  | "directive"
  | "embedded";
export type NarrationSpeakMode = "speak" | "skip" | "summarize";

export interface NarrationSegment {
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
  warnings?: string[];
}

export interface LanguageSpan {
  startOffset: number;
  endOffset: number;
  text: string;
  lang: string;
  script: string;
  confidence: number;
  source: string;
}

export interface PronunciationDecision {
  term: string;
  spoken: string;
  source: string;
  entryId?: string;
  scope?: "project" | "voiceProfile";
  protected?: boolean;
  startOffset: number;
  endOffset: number;
  originalText: string;
}

export interface NormalisationDecision {
  kind: string;
  original: string;
  spoken: string;
  rule: string;
  startOffset: number;
  endOffset: number;
}

export interface MathPreviewResult {
  input: string;
  normalized: string;
  speech: string;
  source: string;
  previewMath?: string;
  warnings?: string[];
  toolOptional: boolean;
}

export interface NarrationBlock {
  id: string;
  index: number;
  kind: NarrationBlockKind;
  speakMode: NarrationSpeakMode;
  label?: string;
  text?: string;
  spokenText?: string;
  language?: string;
  emphasis?: string;
  pauseBeforeMs?: number;
  pauseAfterMs?: number;
  startOffset: number;
  endOffset: number;
  estimatedDurationMs?: number;
  confidence?: number;
  segments?: NarrationSegment[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
  speechPolicy: SpeechPolicyDecision;
  languageSpans?: LanguageSpan[];
  pronunciations?: PronunciationDecision[];
  normalisations?: NormalisationDecision[];
  mathPreview?: MathPreviewResult;
}

export interface SkippedSourceItem {
  id: string;
  kind: NarrationBlockKind;
  text: string;
  reason: string;
  offset?: number;
}

export interface PreparedSourceSummary {
  headingCount: number;
  spokenBlockCount: number;
  skippedBlockCount: number;
  citationSkipCount: number;
  sentenceSegmentCount: number;
}

export interface TranscriptMetadata {
  text?: string;
  generatedAt?: string;
  model?: string;
  provider?: string;
  confidence?: number;
  error?: string;
}

export interface PreparedSource {
  id: string;
  projectId: string;
  sourceOwner?: SourceOwner;
  temporarySourceId?: string;
  status: PreparedSourceStatus;
  sourceReadiness?: SourceReadiness;
  kind: PreparedSourceKind;
  sourceName: string;
  sourceUrl?: string;
  sourceContentType?: string;
  sourceBytes?: number;
  preprocessorId?: string;
  preprocessorVersion?: string;
  sourceFormat?: string;
  renderMode?: string;
  markdownParseMode?: MarkdownParseMode;
  speechPolicyProfile: string;
  sourceSpeechPolicyProfile?: string;
  sourceSpeechPolicyOverrides?: SpeechPolicyOverrides;
  title?: string;
  text?: string;
  speechText?: string;
  wordCount: number;
  blockCount: number;
  segmentCount: number;
  summary: PreparedSourceSummary;
  blocks?: NarrationBlock[];
  skippedItems?: SkippedSourceItem[];
  warnings?: string[];
  metadata?: Record<string, unknown>;
  transcriptMetadata?: TranscriptMetadata;
  transcript?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  transcriptError?: string;
  transcriptConfidence?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteExtractionContainerCandidate {
  selector: string;
  label: string;
  reason: string;
  wordCount: number;
  linkDensity: number;
  score: number;
}

export interface WebsiteExtractionSkippedBlock {
  kind: string;
  selector: string;
  reason: string;
  text: string;
  wordCount: number;
}

export type WebsiteExtractionConfidence = "high" | "medium" | "low";

export interface WebsiteExtractionQuality {
  articleCandidateCount: number;
  chosenContainer: string;
  readableTextRatio: number;
  chromeTextRatio: number;
  linkDensity: number;
  headingDepth: number;
  skippedBlockCount: number;
  narrationBlockCount: number;
  extractionConfidence: WebsiteExtractionConfidence;
  extractionConfidenceScore?: number;
  articleUncertain?: boolean;
  alternateContainers?: WebsiteExtractionContainerCandidate[];
  skippedBlocks?: WebsiteExtractionSkippedBlock[];
}

export interface CreatePreparedSourceRequest {
  kind: PreparedSourceKind;
  text?: string;
  url?: string;
  sourceName?: string;
  sourceContentType?: string;
  sourceBytes?: number;
  markdownParseMode?: MarkdownParseMode;
  htmlContainerSelector?: string;
}

export interface CreateTemporarySourceRequest extends CreatePreparedSourceRequest {
  localPath?: string;
}

export interface TemporarySourcePromotionRequest {
  projectId: string;
  createProjectName?: string;
  title?: string;
  sourceType?: string;
  language?: string;
  scope?: string;
  structureChoice?: string;
  structureLabel?: string;
  speechPolicyProfile?: string;
  voiceProfileId?: string;
  conflictResolution?: "error" | "keepBoth";
  keep?: TemporarySourcePromotionKeep;
  preserveGeneratedArtifacts?: boolean;
  manifest?: TemporarySourcePromotionManifest;
}

export interface TemporarySourcePromotionKeep {
  extractedSource?: boolean;
  reviewEdits?: boolean;
  lexiconOverrides?: boolean;
  policySourcePin?: boolean;
  generatedAudio?: boolean;
  timingMaps?: boolean;
  bookmarks?: boolean;
  progress?: boolean;
  diagnosticsReport?: boolean;
}

export interface TemporarySourcePromotionManifest {
  temporarySourceId: string;
  projectId: string;
  sourceId?: string;
  title: string;
  sourceType?: string;
  language?: string;
  scope?: string;
  keep: TemporarySourcePromotionKeep;
  storageImpactBytes?: number;
  warnings?: string[];
  createdAt?: string;
}

export interface TemporarySourceSession {
  id: string;
  temporarySourceId: string;
  sourceOwner: "temporary";
  projectId?: string;
  status: TemporarySourceLifecycleState;
  promotionStatus: TemporarySourcePromotionStatus;
  promotedProjectId?: string;
  promotedSourceId?: string;
  kind: PreparedSourceKind | BookSourceKind;
  sourceReadiness?: SourceReadiness;
  sourceName: string;
  sourceUrl?: string;
  sourceContentType?: string;
  sourceBytes?: number;
  title?: string;
  text?: string;
  speechText?: string;
  wordCount: number;
  blockCount?: number;
  segmentCount?: number;
  summary?: PreparedSourceSummary;
  blocks?: NarrationBlock[];
  skippedItems?: SkippedSourceItem[];
  reviewNotes?: string[];
  metadata?: Record<string, unknown>;
  artifacts: SourceArtifactRef[];
  bookmarks?: ProgressBookmark[];
  playbackProgress?: PlaybackProgress;
  sourceSpeechPolicyProfile?: string;
  sourceSpeechPolicyOverrides?: SpeechPolicyOverrides;
  warnings?: string[];
  error?: string;
  createdAt: string;
  lastAccessedAt: string;
  expiresAt: string;
  updatedAt: string;
}

export interface ProjectSourceEnvelope {
  sourceOwner: "project";
  projectId: string;
  temporarySourceId?: never;
  source: BookSource | PreparedSource;
}

export interface TemporarySourceEnvelope {
  sourceOwner: "temporary";
  projectId?: never;
  temporarySourceId: string;
  source: TemporarySourceSession;
}

export type SourceEnvelope = ProjectSourceEnvelope | TemporarySourceEnvelope;

export interface ProgressBookmark {
  id: string;
  label?: string;
  currentTimeSec: number;
  activeWordIndex?: number;
  readingPosition?: ReadingPosition;
  createdAt: string;
}

export interface ReadingPosition {
  bookSourceId?: string;
  temporarySourceId?: string;
  scopeKey?: string;
  activeWordIndex?: number;
  nodeId?: string;
  locator?: ContentIRLocator;
  locatorEnvelope?: LocatorEnvelope;
  textQuote?: string;
}

export interface PlaybackProgress {
  targetId: string;
  projectId?: string;
  jobId?: string;
  bookSourceId?: string;
  preparedSourceId?: string;
  temporarySourceId?: string;
  bookScope?: BookScope;
  currentTimeSec: number;
  progress: number;
  activeWordIndex?: number;
  readingPosition?: ReadingPosition;
  finished: boolean;
  hidden: boolean;
  bookmarks?: ProgressBookmark[];
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlaybackProgressUpdate {
  targetId?: string;
  projectId?: string;
  jobId?: string;
  bookSourceId?: string;
  preparedSourceId?: string;
  temporarySourceId?: string;
  bookScope?: BookScope;
  currentTimeSec: number;
  durationSec?: number;
  progress?: number;
  activeWordIndex?: number;
  readingPosition?: ReadingPosition;
  finished?: boolean;
  hidden?: boolean;
  addBookmark?: ProgressBookmark;
}

export interface PlaybackSession {
  id: string;
  targetId: string;
  projectId?: string;
  jobId?: string;
  bookSourceId?: string;
  preparedSourceId?: string;
  temporarySourceId?: string;
  bookScope?: BookScope;
  currentTimeSec: number;
  activeWordIndex?: number;
  readingPosition?: ReadingPosition;
  status: "open" | "closed";
  startedAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface TTSEngineVoice {
  id: string;
  name: string;
  gender?: string;
  description?: string;
}

export interface ProviderCapabilitySet {
  tts: boolean;
  mockTts: boolean;
  streaming: boolean;
  wordTiming: boolean;
  phraseTiming: boolean;
  ssml: boolean;
  ssmlMarks: boolean;
  phonemeOverrides: boolean;
  voiceCloning: boolean;
  voicePreview: boolean;
  cancelJob: boolean;
  retryJob: boolean;
  alignment: boolean;
  alignmentSupported: boolean;
  alignmentRequiredForWordHighlight: boolean;
  abComparison: boolean;
  localOnly: boolean;
}

export interface TTSEngineDiagnostics {
  id: string;
  label: string;
  status: string;
  default: boolean;
  local: boolean;
  experimental: boolean;
  supportsVoice: boolean;
  supportsReference: boolean;
  supportsProfileArtifacts?: boolean;
  supportsSwedish: boolean;
  supportsSSML: boolean;
  languages?: string[];
  voices?: TTSEngineVoice[];
  estimatedVram?: string;
  modelCache?: string;
  reason?: string;
  setup?: string;
  capabilities?: ProviderCapabilitySet;
  metadata?: Record<string, string>;
}

export interface ResearchModuleDiagnostics {
  id: string;
  label: string;
  repoUrl: string;
  ref: string;
  localPath: string;
  engineId?: string;
  status: string;
  installed: boolean;
  runtimeReady?: boolean;
  missingDependencies?: string[];
  cloneAllowed: boolean;
  prompt: boolean;
  reason?: string;
  setup?: string;
  setupCommand?: string;
}

export type VoiceProfileCredentialSource = "local" | "env" | "none";

export interface VoiceProfileCredentialStatus {
  huggingFaceTokenConfigured: boolean;
  huggingFaceTokenSource: VoiceProfileCredentialSource;
}

export type LexiconScope = "project" | "voiceProfile";

export interface LexiconEntry {
  id: string;
  term: string;
  replacement?: string;
  alphabet?: string;
  phoneme?: string;
  lang?: string;
  locale?: string;
  caseSensitive?: boolean;
  protected?: boolean;
  scope: LexiconScope;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PronunciationLexicon {
  version: string;
  scope: LexiconScope;
  ownerId: string;
  entries: LexiconEntry[];
  updatedAt: string;
}

export interface LexiconUpsertRequest {
  id?: string;
  term: string;
  replacement?: string;
  alphabet?: string;
  phoneme?: string;
  lang?: string;
  locale?: string;
  caseSensitive?: boolean;
  protected?: boolean;
  notes?: string;
}

export type ThemeName = "light" | "dark" | "dawn" | "night" | "papery";

export interface ProjectBundleContentItem {
  key: string;
  label: string;
  detail?: string;
  included: boolean;
  required: boolean;
  estimatedBytes?: number;
}

export interface ProjectBundleConflict {
  key: string;
  label: string;
  detail: string;
  severity: string;
  blocking: boolean;
  resolutions?: BundleImportMode[];
}

export interface ProjectBundleDependency {
  key: string;
  label: string;
  detail: string;
  status: string;
  currentVersion?: string;
  requiredVersion?: string;
  missing?: boolean;
}

export interface ProjectBundleValidationItem {
  key: string;
  label: string;
  detail: string;
  status: string;
  blocking?: boolean;
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
  books?: BookSource[];
  files: ProjectBundleFile[];
  providerVersions?: Record<string, string>;
  quality: ProjectBundleQuality;
  hashes?: Record<string, string>;
  contents?: ProjectBundleContentItem[];
  excluded?: ProjectBundleContentItem[];
  generatedAudioIncluded?: boolean;
  omittedGeneratedAudio?: number;
  omittedGeneratedBytes?: number;
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
  generatedAudioIncluded: boolean;
  omittedGeneratedAudio?: number;
  omittedGeneratedBytes?: number;
  durationMs: number;
  contents: ProjectBundleContentItem[];
  excluded?: ProjectBundleContentItem[];
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
  contents?: ProjectBundleContentItem[];
  excluded?: ProjectBundleContentItem[];
  conflicts?: ProjectBundleConflict[];
  dependencies?: ProjectBundleDependency[];
  validation?: ProjectBundleValidationItem[];
  availableImportModes?: BundleImportMode[];
  recommendedMode?: BundleImportMode;
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
  reusedFromJobId?: string;
  warnings?: string[];
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
  provenance?: VoiceProfileProvenance;
  cloneTargets?: Record<string, VoiceProfileTarget>;
  cloneArtifacts?: Record<string, VoiceProfileCloneArtifact>;
  audioFormat: string;
  status: VoiceProfileStatus;
  error?: string;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export type VoiceProfileTargetStatus =
  | "selected"
  | "queued"
  | "building"
  | "validating"
  | "ready"
  | "failed"
  | "cancelled";

export interface VoiceProfileTargetValidation {
  status: VoiceProfileTargetStatus;
  score?: number;
  speakerSimilarity?: number;
  transcriptSimilarity?: number;
  generatedAudio?: string;
  generatedPath?: string;
  expectedTranscript?: string;
  asrTranscript?: string;
  provider?: string;
  model?: string;
  measuredAt?: string;
  error?: string;
}

export interface VoiceProfileTarget {
  id: string;
  label?: string;
  engineId?: string;
  moduleId?: string;
  status: VoiceProfileTargetStatus;
  selected: boolean;
  validation?: VoiceProfileTargetValidation;
  createdAt: string;
  updatedAt: string;
  error?: string;
  metadata?: Record<string, string>;
}

export type VoiceProfileCloneArtifactStatus =
  | "pending"
  | "building"
  | "ready"
  | "failed"
  | "cancelled";

export interface VoiceProfileCloneArtifact {
  moduleId: string;
  engineId?: string;
  kind?: string;
  status: VoiceProfileCloneArtifactStatus;
  file?: string;
  path?: string;
  loss?: number;
  score?: number;
  steps?: number;
  baseStyle?: string;
  upstreamRef?: string;
  modelVersion?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

export interface CreateVoiceProfileRequest {
  name: string;
  language: string;
  file: File;
  targets?: string[];
  autoValidate?: boolean;
}

export type VoiceProfileSourceStatus =
  | "queued"
  | "normalizing"
  | "analyzing"
  | "scoring"
  | "ready"
  | "failed"
  | "cancelled";

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

export interface VoiceProfileProvenance {
  sourceType: string;
  rightsBasis: string;
  consentStatus: string;
  allowedUse: string;
  retentionPolicy: string;
  speakerName?: string;
  sourceOwner?: string;
  sourceUri?: string;
  consentDocumentLabel?: string;
  notes?: string;
  collectedAt?: string;
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
  transcriptMetadata?: TranscriptMetadata;
  transcript?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  transcriptError?: string;
  transcriptConfidence?: number;
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
  transcriptMetadata?: TranscriptMetadata;
  transcript?: string;
  transcriptGeneratedAt?: string;
  transcriptModel?: string;
  transcriptError?: string;
  transcriptConfidence?: number;
  provenance?: VoiceProfileProvenance;
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
  provenance?: VoiceProfileProvenance;
}

export interface CreateVoiceProfileFromCandidateRequest {
  name: string;
  language: string;
  targets?: string[];
  autoValidate?: boolean;
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

export type TimingSource = "native" | "mfa" | "aeneas" | "gentle" | "heuristic";

export interface TimingConfidence {
  overall: number;
  segment: number;
  token: number;
  reason?: string;
}

export interface DriftStats {
  meanAbsoluteMs: number;
  maxAbsoluteMs: number;
  maxRatio: number;
  corrected: boolean;
  lowConfidence: boolean;
  reason?: string;
}

export interface FragmentTiming {
  index: number;
  segmentIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  source: TimingSource;
  tokenStart?: number;
  tokenEnd?: number;
}

export interface TokenTiming {
  index: number;
  fragmentIndex: number;
  segmentIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  source: TimingSource;
}

export interface FragmentTimingArtifact {
  schemaVersion: "timing.v1";
  jobId?: string;
  source: TimingSource;
  status: string;
  durationMs: number;
  generatedAt: string;
  confidence: TimingConfidence;
  drift: DriftStats;
  fragments: FragmentTiming[];
  warnings?: string[];
}

export interface TokenTimingArtifact {
  schemaVersion: "timing.v1";
  jobId?: string;
  source: TimingSource;
  status: string;
  durationMs: number;
  generatedAt: string;
  confidence: TimingConfidence;
  drift: DriftStats;
  tokens: TokenTiming[];
  warnings?: string[];
}

export interface HighlightMapSummary {
  status: string;
  source: TimingSource;
  mode: "word" | "phrase";
  durationMs: number;
  fragmentCount: number;
  tokenCount: number;
  confidence: TimingConfidence;
  drift: DriftStats;
  lowConfidence: boolean;
  reason?: string;
  warnings?: string[];
}

export interface HighlightFragment {
  index: number;
  segmentIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  tokenStart?: number;
  tokenEnd?: number;
  readingPosition?: ReadingPosition;
}

export interface HighlightToken {
  index: number;
  fragmentIndex: number;
  segmentIndex: number;
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  mode: "word" | "phrase";
  readingPosition?: ReadingPosition;
}

export interface HighlightMap {
  schemaVersion: "highlight-map.v1";
  jobId?: string;
  bookSourceId?: string;
  scopeKey?: string;
  status: string;
  source: TimingSource;
  mode: "word" | "phrase";
  durationMs: number;
  generatedAt: string;
  summary: HighlightMapSummary;
  fragments: HighlightFragment[];
  tokens: HighlightToken[];
  warnings?: string[];
}

export interface TimingArtifacts {
  status: string;
  summary: HighlightMapSummary;
  highlightMapUrl?: string;
  highlightMapV2Url?: string;
  fragmentTimingUrl?: string;
  tokenTimingUrl?: string;
  alignmentQualityUrl?: string;
  fragmentTiming?: FragmentTimingArtifact;
  tokenTiming?: TokenTimingArtifact;
  alignmentQuality?: AlignmentQualityReport;
}

export type AlignmentMode =
  | "off"
  | "provider-only"
  | "provider-plus-validation"
  | "local-forced-alignment"
  | "local-forced-alignment-required"
  | "heuristic-fallback";

export type AlignmentQuality = "exact" | "good" | "phrase-only" | "degraded" | "unavailable";

export interface AlignmentStageReport {
  id: string;
  status: string;
  detail?: string;
}

export interface AlignmentQualityReport {
  schemaVersion: "alignment-quality.v1";
  mode: AlignmentMode;
  quality: AlignmentQuality;
  primaryLevel: "word" | "phrase" | "sentence" | "block";
  timingSource: TimingSource;
  timingSourceV2:
    | "provider-word"
    | "provider-mark"
    | "forced-alignment"
    | "phrase-estimate"
    | "heuristic";
  wordTimingReliable: boolean;
  providerTimingAvailable: boolean;
  forcedAlignmentAvailable: boolean;
  usedProviderTiming: boolean;
  usedForcedAlignment: boolean;
  fallbackReason?: string;
  confidence: TimingConfidence;
  drift: DriftStats;
  fragmentCount: number;
  tokenCount: number;
  durationMs: number;
  alignmentWarnings?: string[];
  stages?: AlignmentStageReport[];
}

export interface VoiceJob {
  id: string;
  projectId: string;
  bookSourceId?: string;
  bookScope?: BookScope;
  preparedSourceId?: string;
  temporarySourceId?: string;
  selectedBlockIds?: string[];
  sourceKind?: string;
  progressTargetId?: string;
  speechPolicyProfile?: string;
  speechPolicyOverrides?: SpeechPolicyOverrides;
  status: JobStatus;
  adaptiveMode?: boolean;
  runMode?: RunMode;
  performanceMode?: PerformanceMode;
  pipelineOptions?: PipelineOptions;
  stages: PipelineStages;
  segments?: JobSegment[];
  segmentationWarnings?: string[];
  inputText: string;
  optimizedText: string;
  optimizer: string;
  audioUrl: string;
  audioPartialUrl?: string;
  audioPath?: string;
  audioReadySegments?: number;
  audioSegmentDurationsMs?: number[];
  audioSegmentLatenciesMs?: number[];
  timing?: TimingArtifacts;
  contentType: string;
  durationMs: number;
  provider: string;
  voice: string;
  voiceId?: string;
  ttsVoice?: string;
  ttsLanguage?: string;
  voiceProfileId?: string;
  voiceProfileName?: string;
  ttsEngine?: string;
  engineOptions?: Partial<Record<string, string>>;
  retries: RetryMetadata;
  voiceCheck: VoiceCheck;
  qualityReport?: JobQualityReport;
  progress: JobProgress;
  error?: string;
  terminalReason?: JobTerminalReason;
  failureKind?: JobFailureKind;
  retriable?: boolean;
  retryOfJobId?: string;
  reusedReadySegments?: number;
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
  warningCount?: number;
  unverifiedSegmentCount?: number;
  referenceProfile: boolean;
  reason: string;
}
