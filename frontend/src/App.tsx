import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { type RequestState, type StudioMode, TopProductBar } from "./AppShell";
import type { BundlePanelMode } from "./BundlePanels";
import {
  apiBaseUrl,
  audioSource,
  cancelVoiceJob,
  cancelVoiceProfileSource,
  cancelVoiceProfileTarget,
  clearHuggingFaceToken,
  cloneResearchModule,
  closePlaybackSession,
  createBookNarrationJob,
  createBookSource,
  createBookSourceFromUrl,
  createProject,
  createCustomSpeechPolicyProfile,
  createPreparedSource,
  createPreparedSourceJob,
  createVoiceJob,
  createVoiceProfileFromCandidate,
  createVoiceProfileSource,
  deleteProject,
  deleteCustomSpeechPolicyProfile,
  deleteVoiceProfile,
  getBookSourceScope,
  getContentIR,
  getHighlightMap,
  getHighlightMapV2,
  getPreparedSource,
  getProjectSpeechPolicy,
  getProjectStorageSummary,
  getSpeechPolicyDefinition,
  getSystemMetrics,
  getVoiceJob,
  buildVoiceProfileArtifact,
  getVoiceProfileCredentials,
  getVoiceProfileSource,
  getVoiceProfileSourceDiagnostics,
  isApiNotFoundError,
  listPreparedSources,
  listProjectBookSources,
  listProjectProgress,
  listSpeechPolicyProfiles,
  listTTSEngines,
  listProjectJobs,
  listProjects,
  listResearchModules,
  listVoiceProfiles,
  previewBookSourceScopeSpeechPolicy,
  previewPreparedSourceSpeechPolicy,
  previewContentIRSpeechPolicy,
  queueVoiceProfileTarget,
  refreshVoiceProfileCandidateTranscript,
  refreshVoiceProfileSourceTranscript,
  renameProject,
  saveHuggingFaceToken,
  startPlaybackSession,
  subscribeToVoiceJob,
  syncPlaybackSession,
  updateBookSourceSpeechPolicy,
  updateProjectSpeechPolicy,
  updateCustomSpeechPolicyProfile,
  updatePlaybackProgress,
  updatePreparedSourceSpeechPolicy,
} from "./api";
import { formatDuration } from "./format";
import {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  READER_ACCESSIBILITY_STORAGE_KEY,
  normalizeReaderAccessibilitySettings,
  type ReaderAccessibilitySettings,
  bookSourceName,
  bookScopeKey,
  bookScopeText,
  normalizeBookScopeForBook,
  resolveBookActiveWordIndex,
  resolveDefaultBookScope,
} from "./features/book-cinema/model";
import { looksLikeMermaidDiagram } from "./markdownModel";
import { findKokoroVoicepack, kokoroVoicepackDetail, kokoroVoicepackLabel } from "./kokoroVoices";
import {
  applyKokoroRenderMode,
  buildCreateVoiceJobRequest,
  createRunConfiguration,
  getRunModePreset,
  isKokoroRenderEngine,
  KOKORO_RENDER_MODE_OPTIONS,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  normalizeRunConfiguration,
  RUN_CONFIG_STORAGE_KEY,
  type KokoroRenderMode,
  type RunConfiguration,
} from "./runConfig";
import {
  ACTIVE_PROJECT_ID_STORAGE_KEY,
  clearProjectWorkspaceState,
  loadProjectWorkspaceState,
  migrateLegacyWorkspaceState,
  saveProjectWorkspaceState,
} from "./projectState";
import { calculateArrivalThroughput, formatBufferHealth } from "./studioMetrics";
import {
  SUPERTONIC_LANGUAGE_CODES,
  SUPERTONIC_LANGUAGE_OPTIONS,
  SUPERTONIC_VOICE_STYLES,
  supertonicLanguageLabel,
} from "./supertonic";
import {
  DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
  TELEPROMPTER_SETTINGS_STORAGE_KEY,
  buildTeleprompterCue,
  normalizeTeleprompterHighlightSettings,
  type TeleprompterCue,
  type TeleprompterHighlightSettings,
} from "./teleprompter";

import {
  readingPositionForHighlightCue,
  resolveHighlightCue,
  secondsForReadingPosition,
} from "./highlightMap";
import {
  DEFAULT_THEME_NAME,
  THEME_STORAGE_KEY,
  VOICE_STUDIO_THEMES,
  normalizeThemeName,
} from "./theme";
import { nextActivityFooterMode, type ActivityFooterMode } from "./activityFooter";
import {
  CompactRailToggle,
  RailMiniStack,
  RailModeToolbar,
  overlayDataAttributes,
  railColumnWidth,
  workspaceOverlayState,
} from "./features/layout";
import { normalizeReviewPane, selectReviewBlockId, type ReviewPane } from "./features/review/model";
import {
  deriveRevisionBlockStatus,
  normalizeRevisionPolicyNoteType,
  type RevisionBlock,
  type RevisionTabId,
} from "./features/revision";
import {
  loadUiMemory,
  rememberCinemaFocusState,
  rememberReviewPane,
  rememberTelepromptTheatreSettings,
  rememberTelepromptReturnStage,
  rememberWorkspaceLayoutMode,
  resetUiMemory,
  resetWorkspaceUiMemory,
  resolveCinemaFocusState,
  resolveReviewPane,
  resolveTelepromptTheatreSettings,
  resolveTelepromptReturnStage,
  resolveWorkspaceLayoutMode,
  saveUiMemory,
  updateUiMemoryPreference,
  type UiMemoryCinemaState,
  type UiMemoryPreferenceId,
  type UiMemoryState,
} from "./features/preferences";
import type { UiMemoryImportApplyResult } from "./features/ui-memory/UiMemoryPreferences";
import type { UiMemoryResetScope } from "./features/ui-memory/uiMemoryModel";
import type { HeaderContextSummaryProps } from "./features/header";
import { liveStatusMessages, useLiveStatus } from "./features/accessibility";
import {
  DEFAULT_READ_ALONG_PREFERENCES,
  clearStoredReadAlongPreferences,
  loadReadAlongPreferences,
  saveReadAlongPreferences,
  type HighlightMapV2,
  type ReadAlongPreferences,
} from "./features/readalong";
import {
  normalizeTelepromptTheatreSettings,
  type TelepromptTheatreSettings,
} from "./features/teleprompt/telepromptTheatreSettings";
import { generatedAudioLifecycleFromJob } from "./features/playback/generatedAudioLifecycle";
import { providerRuntimeLeavesLocalBoundary } from "./features/provider-capabilities/providerCapabilityLite";
import {
  createAndListenAriaLabel,
  createAndListenScopeLabel,
  workspacePlaybackActionDataAttributes,
  workspacePlaybackActionDisabledReason,
  type CreateAndListenScope,
} from "./features/playback/workspacePlaybackActions";
import {
  previewPlayerVariantForSurface,
  shouldShowGlobalPreviewPlayer,
  shouldShowRailCinemaShortcut,
} from "./features/playback/playbackSurfaceRules";
import type { SourceCardModel } from "./features/sources";
import type {
  SourceLifecycleEnvelope,
  SourceLifecycleSurface,
} from "./features/source-lifecycle/sourceLifecycleCore";
import {
  Button,
  Panel,
  SegmentedControl,
  StatusChip,
  compactHitTargetClassName,
  minInteractiveSize,
} from "./design";
import {
  createWorkspaceContext,
  defaultWorkspaceLayoutMode,
  withWorkspaceActiveBlock,
  withWorkspaceSource,
  withWorkspaceSpeechPolicyProfile,
  withWorkspaceVoiceProfile,
  workspaceStageMeta,
  workspaceLayoutModeForRailMode,
  workspaceLayoutRails,
  type WorkspaceContext,
  type WorkspaceLayoutMode,
  type WorkspaceRailMode,
  type WorkspaceSourceType,
  type WorkspaceStage,
} from "./features/workspace/model";
import {
  transitionWorkspaceContextForStageAction,
  workspaceStageActionLabel,
  workspaceStageActionTestId,
  workspaceStageNavigationAction,
  type WorkspaceStageActionId,
} from "./features/workspace/stageActions";
import type { IntakePreparationTarget } from "./features/intake";
import type { DemoProject } from "./features/demo";
import { demoVoiceLabel, demoVoices } from "./features/demo/demoVoices";
import type {
  BookSource,
  BookScope,
  BookSourceImportOptions,
  BookSourceScopeContent,
  CreateVoiceJobRequest,
  CreateVoiceProfileFromCandidateRequest,
  CustomSpeechPolicyProfile,
  HighlightMap,
  MarkdownParseMode,
  NarrationBlock,
  PlaybackProgress,
  PlaybackSession,
  PreparedSource,
  ProjectBundleImportResult,
  ReadingPosition,
  ProjectStorageSummary,
  ResearchModuleDiagnostics,
  RunMode,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SpeechPolicySettings,
  SourceSpeechPolicyUpdateRequest,
  StageStatus,
  SystemMetrics,
  ThemeName,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileCredentialStatus,
  VoiceProfileCandidate,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
  VoiceProject,
} from "./types";
import {
  DEFAULT_SPEECH_POLICY_DEFINITION,
  DEFAULT_SPEECH_POLICY_PROFILE,
  SPEECH_POLICY_PROFILE_OPTIONS,
  clearSpeechPolicyOverrides,
  compactSpeechPolicyOverrides,
  hasSpeechPolicyOverrides,
  loadSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  saveSpeechPolicyOverrides,
  speechPolicyProfileDisplayName,
  speechPolicyProfileLabel,
} from "./speechPolicy";
import type { ContentIRDocument } from "./content-ir";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "./markdownCinema";
import { sessionSpeechPolicyRequest } from "./features/policy/model";
import {
  preparedSourceCinemaActionLabel,
  preparedSourceCinemaKind,
  preparedSourceCinemaJobMatchesSource,
} from "./features/cinema/preparedSourceModel";
import type { CinemaFocusMode, CinemaSurfaceKind } from "./features/cinema";
import type {
  CinemaAdvancedCommandTarget,
  CinemaFocusCommandTarget,
  HelpCommandTarget,
  SettingsCommandTarget,
  WorkspaceCommandTarget,
} from "./features/navigation/commands";
import type { CommandEntry, CommandMetadata } from "./features/command-palette/commandRegistry";
import type { CommandPaletteView } from "./features/command-palette/CommandPalette";
import {
  loadShortcutPreferences,
  resetShortcutPreferences,
  resolveGlobalShortcutCommand,
  saveShortcutPreferences,
  shortcutLabelForCommand,
  shouldIgnoreGlobalShortcutTarget,
  type ShortcutPreferences,
} from "./features/shortcuts/shortcutRuntime";
import {
  humanizeProfileTargetProblem,
  isVoiceProfileTargetReadyForEngine,
  voiceProfileTargetForEngine,
  voiceProfileTargetReadinessText,
} from "./profileTargets";
import {
  LazyPanelFallback,
  recordColdUsableMetric,
  recordFrontendDegradedState,
  useDelayedBusy,
  useInteractionTiming,
} from "./features/performance";
import {
  orderedKokoroVoicepacksForLanguage,
  voiceProfileMatchesLanguage,
} from "./features/i18n/languageVoiceMapping";

type VoiceProfileArtifactBuildAction = (
  profileId: string,
  moduleId: string,
  timeoutSeconds?: number,
) => Promise<void>;

export interface ArtifactBuildTimeoutResolution {
  canBuild: boolean;
  error: string | null;
  timeoutSeconds?: number;
}

interface ArtifactBuildTimeoutState extends ArtifactBuildTimeoutResolution {
  input: string;
  setInput: (value: string) => void;
}

const ARTIFACT_BUILD_TIMEOUT_ERROR = "Timeout must be blank or a positive integer.";
const DEFAULT_PROJECT_NAME = "The Future of Clean Energy";
const KOKORO_VOICE_STORAGE_KEY = "tts-kokoro-voice-id";
const RESEARCH_MODULE_PROMPT_HIDDEN_KEY = "tts-research-module-prompt-hidden";
const DEFAULT_KOKORO_VOICE_ID = "af_heart";
const PROFILE_ARTIFACT_MODULE_ORDER = ["kokoro-embed", "supertonic-embed"] as const;
const WAVEFORM_DISPLAY_BAR_COUNT = 76;

function waveformProgressIndex(progress: number, barCount: number): number {
  if (barCount <= 0 || !Number.isFinite(progress)) {
    return 0;
  }
  return Math.max(0, Math.min(barCount, Math.round(Math.max(0, Math.min(1, progress)) * barCount)));
}

async function buildWaveformBarsFromAudioBuffersLazy(
  buffers: readonly AudioBuffer[],
  count = WAVEFORM_DISPLAY_BAR_COUNT,
): Promise<number[]> {
  const { buildWaveformBarsFromAudioBuffers } = await import("./waveform");
  return buildWaveformBarsFromAudioBuffers(buffers, count);
}

const BundleFlowPanel = lazy(() =>
  import("./BundlePanels").then((module) => ({ default: module.BundleFlowPanel })),
);
const BookCinemaOverlay = lazy(() =>
  import("./features/book-cinema/BookCinemaPanel").then((module) => ({
    default: module.BookCinemaOverlay,
  })),
);
const ContentIRDrawer = lazy(() =>
  import("./ContentIrDrawer").then((module) => ({ default: module.ContentIRDrawer })),
);
const DocumentCinemaOverlay = lazy(() =>
  import("./features/document-cinema/DocumentCinemaOverlay").then((module) => ({
    default: module.DocumentCinemaOverlay,
  })),
);
const WebsiteCinemaOverlay = lazy(() =>
  import("./features/website-cinema/WebsiteCinemaOverlay").then((module) => ({
    default: module.WebsiteCinemaOverlay,
  })),
);
const CommandPalette = lazy(() =>
  import("./features/command-palette/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);
const HelpPanel = lazy(() =>
  import("./features/help").then((module) => ({ default: module.HelpPanel })),
);
const SettingsPanel = lazy(() =>
  import("./features/settings").then((module) => ({ default: module.SettingsPanel })),
);
const LazyIntakeWizard = lazy(() =>
  import("./features/intake").then((module) => ({ default: module.IntakeWizard })),
);
const LazyTelepromptStudio = lazy(() =>
  import("./features/teleprompt").then((module) => ({ default: module.TelepromptStudio })),
);
const LazyGlobalPreviewPlayer = lazy(() =>
  import("./features/preview").then((module) => ({ default: module.GlobalPreviewPlayer })),
);
const LazyDemoMode = lazy(() =>
  import("./features/demo").then((module) => ({ default: module.DemoMode })),
);
const LazyHeaderContextSummary = lazy(() =>
  import("./features/header").then((module) => ({ default: module.HeaderContextSummary })),
);
const LazyRevisionPanel = lazy(() =>
  import("./features/revision").then((module) => ({
    default: module.RevisionPanel,
  })),
);
const LazyReviewContextPanel = lazy(() =>
  import("./features/context-panel").then((module) => ({ default: module.ReviewContextPanel })),
);
const LazyWorkspaceStageContextPanel = lazy(() =>
  import("./features/context-panel").then((module) => ({
    default: module.WorkspaceStageContextPanel,
  })),
);
const VoiceSourceAnalysisPanel = lazy(() =>
  import("./VoiceSourceAnalysisPanel").then((module) => ({
    default: module.VoiceSourceAnalysisPanel,
  })),
);
const WorkspaceDrawer = lazy(() =>
  import("./WorkspaceDrawer").then((module) => ({ default: module.WorkspaceDrawer })),
);
const ProjectDashboard = lazy(() =>
  import("./features/dashboard").then((module) => ({ default: module.ProjectDashboard })),
);
const VoiceProfileDashboard = lazy(() =>
  import("./features/voices").then((module) => ({ default: module.VoiceProfileDashboard })),
);
const MarkdownRenderer = lazy(() =>
  import("./MarkdownRenderer").then((module) => ({ default: module.MarkdownRenderer })),
);
const MermaidDiagram = lazy(() =>
  import("./MarkdownRenderer").then((module) => ({ default: module.MermaidDiagram })),
);

function clearStoredTelepromptReturnMemory(): void {
  void import("./features/teleprompt/telepromptReturnMemory").then((module) => {
    module.clearTelepromptReturnMemory();
  });
}

interface CommandMetadataState {
  cinemaAdvanced: CommandMetadata<CinemaAdvancedCommandTarget>[];
  cinemaFocus: CommandMetadata<CinemaFocusCommandTarget>[];
  help: CommandMetadata<HelpCommandTarget>[];
  settings: CommandMetadata<SettingsCommandTarget>[];
  workspace: CommandMetadata<WorkspaceCommandTarget>[];
}

interface CommandBookmarkData {
  detail: string;
  id: string;
  keywords: string[];
  label: string;
  resumeProgress: PlaybackProgress;
}

interface CommandRecentData {
  detail: string;
  id: string;
  keywords: string[];
  label: string;
  progressItem: PlaybackProgress;
}

interface CommandWayfindingState {
  bookmarks: CommandBookmarkData[];
  recentPositions: CommandRecentData[];
}

function LazySurfaceFallback({
  detail,
  label = "Loading...",
  minHeightClassName,
  surface,
}: Readonly<{
  detail?: string;
  label?: string;
  minHeightClassName?: string;
  surface?: string;
}>) {
  return (
    <LazyPanelFallback
      detail={detail}
      label={label}
      minHeightClassName={minHeightClassName}
      surface={surface}
    />
  );
}

function HeaderContextSummary(props: Readonly<HeaderContextSummaryProps>) {
  return (
    <Suspense fallback={null}>
      <LazyHeaderContextSummary {...props} />
    </Suspense>
  );
}

export function resolveArtifactBuildTimeoutInput(input: string): ArtifactBuildTimeoutResolution {
  const normalized = input.trim();
  if (normalized === "") {
    return { canBuild: true, error: null };
  }
  if (!/^[1-9]\d*$/.test(normalized)) {
    return { canBuild: false, error: ARTIFACT_BUILD_TIMEOUT_ERROR };
  }
  const timeoutSeconds = Number(normalized);
  if (!Number.isSafeInteger(timeoutSeconds)) {
    return { canBuild: false, error: ARTIFACT_BUILD_TIMEOUT_ERROR };
  }
  return { canBuild: true, error: null, timeoutSeconds };
}

function useArtifactBuildTimeoutState(): ArtifactBuildTimeoutState {
  const [input, setInput] = useState("");
  return {
    input,
    setInput,
    ...resolveArtifactBuildTimeoutInput(input),
  };
}

interface PipelineStepState {
  optimization: StageStatus;
  synthesis: StageStatus;
  checker: StageStatus;
}

interface ActivePipelineFlags {
  optimizing: boolean;
  synthesizing: boolean;
  checking: boolean;
}

interface ActivityStageSummary {
  detail?: string;
  label: string;
  status: StageStatus;
}

type ActivityStatus = "idle" | "running" | "attention" | "complete" | "cancelled";

interface VoiceCloningActivitySummary {
  activeProfile: VoiceProfile | null;
  actionLabel: string;
  candidateDetail: string;
  detail: string;
  elapsed: string;
  eta: string;
  lastUpdate: string;
  message: string;
  sourceDetail: string;
  stages: ActivityStageSummary[];
  status: ActivityStatus;
  statusLabel: string;
}

interface PlaybackController {
  isAvailable: boolean;
  isPlaying: boolean;
  isSeeking: boolean;
  playbackRate: number;
  play: () => Promise<void> | void;
  pause: () => void;
  restart: () => Promise<void> | void;
  setPlaybackRate?: (rate: number) => void;
  skipBy?: (seconds: number) => void;
  seekTo?: (seconds: number) => void;
}

interface WritableRef<T> {
  current: T;
}

type CinemaTextSize = "compact" | "comfortable" | "large" | "giant" | "massive";
type PreparedSourceBlock = NonNullable<PreparedSource["blocks"]>[number];
type SourceMode = "text" | "book" | "fileUrl";

function workspaceSourceType(sourceMode: SourceMode): WorkspaceSourceType {
  if (sourceMode === "book") {
    return "book";
  }
  if (sourceMode === "fileUrl") {
    return "prepared";
  }
  return "draft";
}

function isSameCinemaFocusState(left: UiMemoryCinemaState, right: UiMemoryCinemaState): boolean {
  return (
    left.activePanelId === right.activePanelId &&
    left.mode === right.mode &&
    left.pinnedPanelId === right.pinnedPanelId
  );
}

const DISABLED_PLAYBACK_CONTROLLER: PlaybackController = {
  isAvailable: false,
  isPlaying: false,
  isSeeking: false,
  playbackRate: 1,
  play: () => Promise.resolve(),
  pause: () => false,
  restart: () => Promise.resolve(),
  setPlaybackRate: undefined,
  skipBy: undefined,
  seekTo: undefined,
};

function createPipelineBase(job?: VoiceJob): PipelineStepState {
  if (!job) {
    return {
      optimization: "waiting",
      synthesis: "waiting",
      checker: "waiting",
    };
  }

  return {
    optimization: job.stages.optimization,
    synthesis: job.stages.synthesis,
    checker: job.stages.checker,
  };
}

function resolveRunLocale(config: RunConfiguration): string {
  const lang = config.ttsEngine === "supertonic-3" ? config.engineOptions.lang : undefined;
  if (lang && lang !== "na") {
    return lang;
  }
  return "en-GB";
}

function resolveSupertonicLanguage(
  savedLanguage: string | undefined,
  source?: PreparedSource | null,
): string {
  const sourceLanguage = dominantPreparedSourceLanguage(source);
  if (sourceLanguage) {
    return sourceLanguage;
  }
  const normalized = normalizeSupertonicLanguage(savedLanguage);
  return normalized ?? "na";
}

function dominantPreparedSourceLanguage(source?: PreparedSource | null): string | null {
  const counts = new Map<string, number>();
  for (const block of source?.blocks ?? []) {
    const lang = normalizeSupertonicLanguage(block.language);
    if (lang && lang !== "na") {
      counts.set(lang, (counts.get(lang) ?? 0) + 1);
    }
  }
  let top: [string, number] | null = null;
  let total = 0;
  for (const entry of counts.entries()) {
    total += entry[1];
    if (!top || entry[1] > top[1]) {
      top = entry;
    }
  }
  if (!top) {
    return null;
  }
  return top[1] / total >= 0.6 ? top[0] : null;
}

function normalizeSupertonicLanguage(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return SUPERTONIC_LANGUAGE_CODES.has(normalized) ? normalized : null;
}

function isTerminalJob(job: VoiceJob): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

function getActivePipelineFlags(job: VoiceJob): ActivePipelineFlags {
  const activeStage = job.progress.activeStage.toLowerCase();
  return {
    optimizing: activeStage.includes("optim") || job.status === "optimizing",
    synthesizing: activeStage.includes("synth") || job.status === "synthesizing",
    checking:
      activeStage.includes("check") ||
      activeStage.includes("retry") ||
      job.status === "checking" ||
      job.status === "retrying",
  };
}

function hasSegmentWorkInFlight(job: VoiceJob): boolean {
  const total = job.progress.totalSegments ?? 0;
  const current = job.progress.currentSegment ?? 0;
  return total > 0 && current < total;
}

function markOptimizationStarted(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed" && pipeline.optimization !== "done") {
    pipeline.optimization = "running";
  }
}

function markSynthesisRunning(pipeline: PipelineStepState): void {
  if (pipeline.optimization !== "failed") {
    pipeline.optimization = "done";
  }
  if (pipeline.synthesis !== "failed") {
    pipeline.synthesis = "running";
  }
}

function markCheckerRunning(pipeline: PipelineStepState): void {
  markSynthesisRunning(pipeline);
  if (pipeline.checker !== "failed") {
    pipeline.checker = "running";
  }
}

function resolveTTSPipelineState(job: VoiceJob | null): PipelineStepState {
  if (!job) {
    return createPipelineBase();
  }

  const pipeline = createPipelineBase(job);
  if (isTerminalJob(job)) {
    return pipeline;
  }

  const flags = getActivePipelineFlags(job);

  if (flags.optimizing) {
    if (pipeline.optimization !== "failed") {
      pipeline.optimization = "running";
    }
    return pipeline;
  }

  markOptimizationStarted(pipeline);

  if (flags.synthesizing) {
    markSynthesisRunning(pipeline);
    return pipeline;
  }

  if (flags.checking || hasSegmentWorkInFlight(job)) {
    markCheckerRunning(pipeline);
  }

  return pipeline;
}

function isVoiceProfileSourceActive(source: VoiceProfileSource | null): boolean {
  return Boolean(
    source &&
      source.status !== "ready" &&
      source.status !== "failed" &&
      source.status !== "cancelled",
  );
}

function scopedProfileTargetIds(engineId: string): string[] | null {
  const targetId = voiceProfileTargetForEngine(engineId);
  return targetId ? [targetId] : null;
}

function targetIdMatchesScope(targetId: string, targetIds?: readonly string[] | null): boolean {
  return !targetIds || targetIds.length === 0 || targetIds.includes(targetId);
}

function scopedCloneTargets(profile: VoiceProfile, targetIds?: readonly string[] | null) {
  return Object.entries(profile.cloneTargets ?? {})
    .filter(([targetId]) => targetIdMatchesScope(targetId, targetIds))
    .map(([, target]) => target);
}

function scopedCloneArtifacts(profile: VoiceProfile, targetIds?: readonly string[] | null) {
  return Object.entries(profile.cloneArtifacts ?? {})
    .filter(([targetId]) => targetIdMatchesScope(targetId, targetIds))
    .map(([, artifact]) => artifact);
}

function profileHasActiveTarget(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  return scopedCloneTargets(profile, targetIds).some((target) =>
    ["queued", "building", "validating"].includes(target.status),
  );
}

function profileHasTargetAttention(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some(
      (target) => target.status === "failed" || target.validation?.status === "failed",
    ) || artifacts.some((artifact) => artifact.status === "failed")
  );
}

function profileHasBlockingTargetAttention(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some((target) => target.status === "failed") ||
    artifacts.some((artifact) => artifact.status === "failed")
  );
}

function profileHasTargetCancelled(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some(
      (target) => target.status === "cancelled" || target.validation?.status === "cancelled",
    ) || artifacts.some((artifact) => artifact.status === "cancelled")
  );
}

function profileHasReadyCloneTarget(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!profile) {
    return false;
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  return (
    targets.some((target) => target.status === "ready") ||
    artifacts.some((artifact) => artifact.status === "ready")
  );
}

function resolveActiveCloneProfile(
  selectedProfile: VoiceProfile | null,
  profiles: VoiceProfile[],
  engineId: string,
): VoiceProfile | null {
  if (selectedProfile) {
    return selectedProfile;
  }
  const targetIds = scopedProfileTargetIds(engineId);
  return (
    profiles.find((profile) => profileHasActiveTarget(profile, targetIds)) ??
    profiles.find((profile) => isVoiceProfileTargetReadyForEngine(profile, engineId)) ??
    profiles.find((profile) => profileHasActiveTarget(profile)) ??
    profiles.find((profile) => profileHasTargetAttention(profile, targetIds)) ??
    profiles.find((profile) => profileHasTargetAttention(profile)) ??
    null
  );
}

function sourceStageStatus(source: VoiceProfileSource | null, stageName: string): StageStatus {
  return source?.stages.find((stage) => stage.name === stageName)?.status ?? "waiting";
}

function resolveAnalyzeStageStatus(source: VoiceProfileSource | null): StageStatus {
  if (!source) {
    return "waiting";
  }
  if (source.status === "cancelled") {
    return "failed";
  }
  if (source.status === "failed") {
    return sourceStageStatus(source, "normalize") === "failed" ||
      sourceStageStatus(source, "denoise") === "failed"
      ? "failed"
      : "done";
  }
  if (source.status === "queued" || source.status === "normalizing") {
    return "running";
  }
  return "done";
}

function resolveDetectStageStatus(source: VoiceProfileSource | null): StageStatus {
  if (!source) {
    return "waiting";
  }
  if (source.status === "cancelled") {
    return "failed";
  }
  if (source.status === "failed") {
    return sourceStageStatus(source, "analyze") === "failed" ||
      sourceStageStatus(source, "score") === "failed"
      ? "failed"
      : "waiting";
  }
  if (source.status === "analyzing" || source.status === "scoring") {
    return "running";
  }
  return source.status === "ready" ? "done" : "waiting";
}

function resolveBuildStageStatus(
  profile: VoiceProfile | null,
  buildingArtifactKey: string | null,
  targetIds?: readonly string[] | null,
  engineId?: string,
): StageStatus {
  if (!profile) {
    return buildingArtifactKey ? "running" : "waiting";
  }
  const targets = scopedCloneTargets(profile, targetIds);
  const artifacts = scopedCloneArtifacts(profile, targetIds);
  if (
    buildingArtifactMatchesScope(profile.id, buildingArtifactKey, targetIds) ||
    targets.some((target) => ["queued", "building"].includes(target.status)) ||
    artifacts.some((artifact) => artifact.status === "building")
  ) {
    return "running";
  }
  const engineTargetReady = engineId
    ? isVoiceProfileTargetReadyForEngine(profile, engineId)
    : false;
  if (profileHasReadyCloneTarget(profile, targetIds) || engineTargetReady) {
    return "done";
  }
  if (
    targets.some((target) => target.status === "failed") ||
    artifacts.some((artifact) => artifact.status === "failed")
  ) {
    return "failed";
  }
  return profileHasTargetCancelled(profile, targetIds) ? "failed" : "waiting";
}

function buildingArtifactMatchesScope(
  profileId: string,
  buildingArtifactKey: string | null,
  targetIds?: readonly string[] | null,
): boolean {
  if (!buildingArtifactKey?.startsWith(`${profileId}:`)) {
    return false;
  }
  if (!targetIds || targetIds.length === 0) {
    return true;
  }
  return targetIds.some((targetId) => buildingArtifactKey === `${profileId}:${targetId}`);
}

function resolveValidateStageStatus(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
  engineId?: string,
): StageStatus {
  if (!profile) {
    return "waiting";
  }
  const targets = scopedCloneTargets(profile, targetIds);
  if (
    targets.some((target) => target.status === "ready") ||
    (engineId ? isVoiceProfileTargetReadyForEngine(profile, engineId) : false)
  ) {
    return "done";
  }
  if (targets.some((target) => target.validation?.status === "failed")) {
    return "failed";
  }
  if (targets.some((target) => target.validation?.status === "cancelled")) {
    return "failed";
  }
  if (targets.some((target) => target.status === "validating")) {
    return "running";
  }
  if (targets.some((target) => target.validation?.status === "ready")) {
    return "done";
  }
  return "waiting";
}

function voiceCloningProgressRatio(stages: ActivityStageSummary[]): number {
  if (stages.length === 0) {
    return 0;
  }
  const doneCount = stages.filter((stage) => stage.status === "done").length;
  const runningIndex = stages.findIndex((stage) => stage.status === "running");
  const partial = runningIndex === -1 ? 0 : 0.55;
  return Math.min(1, (doneCount + partial) / stages.length);
}

function latestTimestamp(...timestamps: (string | undefined)[]): string | undefined {
  let latest: string | undefined;
  for (const timestamp of timestamps) {
    if (typeof timestamp !== "string" || timestamp.trim().length === 0) {
      continue;
    }
    if (!latest || Date.parse(timestamp) > Date.parse(latest)) {
      latest = timestamp;
    }
  }
  return latest;
}

function latestProfileActivityTimestamp(
  profile: VoiceProfile | null,
  targetIds?: readonly string[] | null,
): string | undefined {
  if (!profile) {
    return undefined;
  }
  const targetTimes = scopedCloneTargets(profile, targetIds).flatMap((target) => [
    target.updatedAt,
    target.validation?.measuredAt,
  ]);
  const artifactTimes = scopedCloneArtifacts(profile, targetIds).map(
    (artifact) => artifact.updatedAt,
  );
  return latestTimestamp(profile.updatedAt, ...targetTimes, ...artifactTimes);
}

export function resolveVoiceCloneCompletionReference(
  activeProfile: VoiceProfile | null,
  profileSource: VoiceProfileSource | null,
  targetIds: readonly string[] | null | undefined,
): string | undefined {
  const targets = activeProfile ? scopedCloneTargets(activeProfile, targetIds) : [];
  const measuredAt = latestTimestamp(...targets.map((target) => target.validation?.measuredAt));
  if (measuredAt) {
    return measuredAt;
  }
  const updatedAt = latestTimestamp(...targets.map((target) => target.updatedAt));
  if (updatedAt) {
    return updatedAt;
  }
  return latestTimestamp(
    activeProfile?.updatedAt,
    profileSource?.updatedAt,
    profileSource?.createdAt,
  );
}

export function resolveVoiceCloningActivityNow({
  now,
  status,
  completionReference,
}: Readonly<{
  completionReference: string | undefined | null;
  now: number;
  status: ActivityStatus;
}>): number {
  if (status === "running" || status === "attention") {
    return now;
  }
  if (!completionReference) {
    return now;
  }
  const parsed = Date.parse(completionReference);
  if (!Number.isFinite(parsed)) {
    return now;
  }
  return parsed;
}

function sourceActivityMessage(source: VoiceProfileSource | null): string {
  if (!source) {
    return "No source analysis is running.";
  }
  if (source.progressMessage.trim().length > 0) {
    return source.progressMessage;
  }
  switch (source.status) {
    case "queued": {
      return "Queued for source analysis.";
    }
    case "normalizing": {
      return "Preparing source audio.";
    }
    case "analyzing": {
      return "Detecting and separating speaker segments.";
    }
    case "scoring": {
      return "Scoring candidate voice references.";
    }
    case "ready": {
      return "Voice candidates are ready for review.";
    }
    case "failed": {
      return "Source analysis needs attention.";
    }
    case "cancelled": {
      return "Source analysis was cancelled.";
    }
    default: {
      return "Voice cloning is waiting.";
    }
  }
}

function resolveVoiceCloneActionLabel(status: ActivityStatus): string {
  switch (status) {
    case "attention": {
      return "Review Issue";
    }
    case "cancelled": {
      return "Review Cancelled";
    }
    case "running": {
      return "View Progress";
    }
    case "complete": {
      return "View Profile";
    }
    default: {
      return "Create Clone";
    }
  }
}

function resolveVoiceCloneStages(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
  buildingArtifactKey: string | null,
  targetIds: readonly string[] | null,
  engineId: string,
): ActivityStageSummary[] {
  const detectDetail =
    profileSource?.status === "scoring" ? "Scoring candidate references" : "Find speaker turns";
  return [
    {
      detail: profileSource?.progressDetail ?? "Prepare analysis-ready audio",
      label: "Analyze Source",
      status: resolveAnalyzeStageStatus(profileSource),
    },
    {
      detail: detectDetail,
      label: "Detect Speakers",
      status: resolveDetectStageStatus(profileSource),
    },
    {
      detail: activeProfile ? "Prepare selected clone targets" : "Waiting for profile",
      label: "Build Clone",
      status: resolveBuildStageStatus(activeProfile, buildingArtifactKey, targetIds, engineId),
    },
    {
      detail: activeProfile ? "Measure likeness and readiness" : "Waiting for target",
      label: "Validate Voice",
      status: resolveValidateStageStatus(activeProfile, targetIds, engineId),
    },
  ];
}

function resolveVoiceCloneActivityStatus({
  activeProfile,
  attention,
  cancelled,
  sourceActive,
  targetActive,
  profileSource,
  targetReady,
}: Readonly<{
  activeProfile: VoiceProfile | null;
  attention: boolean;
  cancelled: boolean;
  sourceActive: boolean;
  targetActive: boolean;
  profileSource: VoiceProfileSource | null;
  targetReady: boolean;
}>): ActivityStatus {
  if (attention) {
    return "attention";
  }
  if (cancelled) {
    return "cancelled";
  }
  if (sourceActive || targetActive) {
    return "running";
  }
  if (activeProfile && (profileSource?.status === "ready" || targetReady)) {
    return "complete";
  }
  return "idle";
}

function resolveVoiceCloneStatusLabel({
  profileSource,
  sourceActive,
  status,
}: Readonly<{
  profileSource: VoiceProfileSource | null;
  sourceActive: boolean;
  status: ActivityStatus;
}>): string {
  if (status === "attention") {
    return "Attention Needed";
  }
  if (status === "cancelled") {
    return "Cancelled";
  }
  if (status === "running") {
    return sourceActive
      ? humanizeSourceStatus(profileSource?.status ?? "queued")
      : "Preparing Target";
  }
  if (status === "complete") {
    return "Ready";
  }
  return "Idle";
}

function voiceCloneSourceDetail(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
): string {
  if (profileSource) {
    return `${shortIdentifier(profileSource.id)} · ${profileSource.sourceFile}`;
  }
  if (activeProfile) {
    return `${shortIdentifier(activeProfile.id)} · ${activeProfile.name}`;
  }
  return "No source queued";
}

function voiceCloneDetail(
  profileSource: VoiceProfileSource | null,
  activeProfile: VoiceProfile | null,
  engineId: string,
): string {
  if (profileSource?.progressDetail) {
    return profileSource.progressDetail;
  }
  if (activeProfile) {
    return voiceProfileTargetReadinessText(activeProfile, engineId);
  }
  return "Upload source media to begin.";
}

function voiceCloneEta(status: ActivityStatus): string {
  if (status === "running") {
    return "Polling every 3s";
  }
  if (status === "complete") {
    return "Complete";
  }
  if (status === "cancelled") {
    return "Stopped";
  }
  return "n/a";
}

export function resolveVoiceCloningActivity({
  activeEngineId,
  buildingArtifactKey,
  createCandidateId,
  error,
  isAnalyzing,
  now,
  profileSource,
  profiles,
  selectedProfile,
}: Readonly<{
  activeEngineId: string;
  buildingArtifactKey: string | null;
  createCandidateId: string | null;
  error: string | null;
  isAnalyzing: boolean;
  now: number;
  profileSource: VoiceProfileSource | null;
  profiles: VoiceProfile[];
  selectedProfile: VoiceProfile | null;
}>): VoiceCloningActivitySummary {
  const activeProfile = resolveActiveCloneProfile(selectedProfile, profiles, activeEngineId);
  const activeTargetIds = scopedProfileTargetIds(activeEngineId);
  const targetReady =
    Boolean(activeProfile) && isVoiceProfileTargetReadyForEngine(activeProfile, activeEngineId);
  const stages = resolveVoiceCloneStages(
    profileSource,
    activeProfile,
    buildingArtifactKey,
    activeTargetIds,
    activeEngineId,
  );
  const sourceActive = isAnalyzing || isVoiceProfileSourceActive(profileSource);
  const targetBuildActive = activeProfile
    ? buildingArtifactMatchesScope(activeProfile.id, buildingArtifactKey, activeTargetIds)
    : Boolean(buildingArtifactKey);
  const targetActive =
    targetBuildActive ||
    Boolean(createCandidateId) ||
    profileHasActiveTarget(activeProfile, activeTargetIds);
  const cancelled =
    profileSource?.status === "cancelled" ||
    profileHasTargetCancelled(activeProfile, activeTargetIds);
  const attention =
    Boolean(error) ||
    profileSource?.status === "failed" ||
    profileHasBlockingTargetAttention(activeProfile, activeTargetIds) ||
    (!cancelled && stages.some((stage) => stage.status === "failed"));
  const status = resolveVoiceCloneActivityStatus({
    activeProfile,
    attention,
    cancelled,
    profileSource,
    sourceActive,
    targetActive,
    targetReady,
  });
  const completionReference = resolveVoiceCloneCompletionReference(
    activeProfile,
    profileSource,
    activeTargetIds,
  );
  const nowForCloneTiming = resolveVoiceCloningActivityNow({
    completionReference,
    now,
    status,
  });
  const activityTimestamp = latestTimestamp(
    profileSource?.updatedAt,
    latestProfileActivityTimestamp(activeProfile, activeTargetIds),
  );
  const message =
    error ??
    (status === "complete" && activeProfile
      ? voiceProfileTargetReadinessText(activeProfile, activeEngineId)
      : sourceActivityMessage(profileSource));
  const candidates = profileSource?.candidates ?? [];
  const readyCandidates = candidates.filter((candidate) => candidate.status === "ready").length;
  const candidateDetail =
    candidates.length > 0
      ? `${String(readyCandidates)} ready / ${String(candidates.length)} detected`
      : "No candidates yet";
  return {
    activeProfile,
    actionLabel: resolveVoiceCloneActionLabel(status),
    candidateDetail,
    detail: voiceCloneDetail(profileSource, activeProfile, activeEngineId),
    elapsed: formatElapsed(profileSource?.createdAt ?? activeProfile?.createdAt, nowForCloneTiming),
    eta: voiceCloneEta(status),
    lastUpdate: formatRelativeTime(activityTimestamp, nowForCloneTiming),
    message,
    sourceDetail: voiceCloneSourceDetail(profileSource, activeProfile),
    stages,
    status,
    statusLabel: resolveVoiceCloneStatusLabel({ profileSource, sourceActive, status }),
  };
}

function humanizeSourceStatus(status: string): string {
  switch (status) {
    case "queued": {
      return "Queued";
    }
    case "normalizing": {
      return "Normalizing";
    }
    case "analyzing": {
      return "Detecting Speakers";
    }
    case "scoring": {
      return "Scoring Candidates";
    }
    case "ready": {
      return "Ready";
    }
    case "failed": {
      return "Failed";
    }
    case "cancelled": {
      return "Cancelled";
    }
    default: {
      return "Working";
    }
  }
}

function getStudioJobName(job: VoiceJob | null): string {
  if (job?.voiceProfileName) {
    return `${job.voiceProfileName} - Long Form`;
  }
  return "Clean Energy - Long Form";
}

function upsertVoiceProfileByCreatedAt(
  currentProfiles: VoiceProfile[],
  profile: VoiceProfile,
): VoiceProfile[] {
  const nextProfiles = currentProfiles.filter((item) => item.id !== profile.id);
  const insertAt = nextProfiles.findIndex(
    (item) => item.createdAt.localeCompare(profile.createdAt) > 0,
  );
  if (insertAt === -1) {
    return [...nextProfiles, profile];
  }
  return [...nextProfiles.slice(0, insertAt), profile, ...nextProfiles.slice(insertAt)];
}

function TeleprompterPanel({
  canOpenBookCinema,
  isPlaybackActive,
  job,
  latestProgress,
  openSignal,
  showCinemaAction = true,
  showInlinePreview = true,
  onOpenBookCinema,
  onResumeProgress,
  playbackControls,
  playbackCursorSec,
  preparedSourceForCinema,
  settings,
  themeName,
  onOpenSettings,
}: Readonly<{
  canOpenBookCinema: boolean;
  isPlaybackActive: boolean;
  job: VoiceJob | null;
  latestProgress: PlaybackProgress | null;
  openSignal: number;
  showCinemaAction?: boolean;
  showInlinePreview?: boolean;
  onOpenBookCinema: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  playbackControls: PlaybackController;
  playbackCursorSec: number;
  preparedSourceForCinema: PreparedSource | null;
  settings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  onOpenSettings: () => void;
}>) {
  const [isCinemaOpen, setIsCinemaOpen] = useState(false);
  const [cinemaTextSize, setCinemaTextSize] = useState<CinemaTextSize>("large");
  const [cinemaThemeName, setCinemaThemeName] = useState<ThemeName>("night");
  const [isContextVisible, setIsContextVisible] = useState(false);
  const [isFocusEnabled, setIsFocusEnabled] = useState(true);
  const handledOpenSignalRef = useRef(openSignal);
  const effectiveSettings = useMemo(
    () =>
      isFocusEnabled
        ? settings
        : {
            ...settings,
            activeIntensity: 0.35,
            upcomingIntensity: 0,
            spokenIntensity: 0,
            effectStyle: "classic" as const,
          },
    [isFocusEnabled, settings],
  );
  const cue = useMemo(
    () => buildTeleprompterCue(job, playbackCursorSec, effectiveSettings),
    [effectiveSettings, job, playbackCursorSec],
  );
  const markdownCinemaSource = useMemo(
    () => resolveMarkdownCinemaSource(job, preparedSourceForCinema),
    [job, preparedSourceForCinema],
  );
  const cinemaResumeProgress = useMemo(
    () => resolveProgressForJob(job, latestProgress),
    [job, latestProgress],
  );
  const shouldOpenBookCinema = canOpenBookCinema && (!job || Boolean(job.bookSourceId));
  const canOpenCinema = Boolean(cue) || canOpenBookCinema;
  const handleOpenCinema = useCallback(() => {
    if (shouldOpenBookCinema) {
      onOpenBookCinema();
      return;
    }
    setCinemaThemeName(themeName === "light" ? "night" : themeName);
    setIsCinemaOpen(true);
  }, [onOpenBookCinema, shouldOpenBookCinema, themeName]);
  const handleCloseCinema = useCallback(() => {
    setIsCinemaOpen(false);
  }, []);
  useEffect(() => {
    if (openSignal <= handledOpenSignalRef.current) {
      return;
    }
    handledOpenSignalRef.current = openSignal;
    if (canOpenCinema) {
      handleOpenCinema();
    }
  }, [canOpenCinema, handleOpenCinema, openSignal]);
  const handlePlayPause = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      return;
    }
    void playbackControls.play();
  }, [playbackControls]);
  const handleRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    void playbackControls.restart();
  }, [playbackControls]);
  const handleSkip = useCallback(
    (seconds: number) => {
      playbackControls.skipBy?.(seconds);
    },
    [playbackControls],
  );

  if (!cue) {
    if (!showInlinePreview) {
      return null;
    }
    return (
      <section className="rounded-lg border p-5 shadow-sm vs-raised">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold">Teleprompter</h2>
          {showCinemaAction ? (
            <button
              className="h-8 rounded-md border px-3 text-xs font-semibold transition disabled:opacity-50 vs-border"
              disabled={!canOpenCinema}
              onClick={handleOpenCinema}
              type="button"
            >
              Cinema
            </button>
          ) : null}
        </div>
        <p className="vs-muted mt-4 rounded-lg border border-dashed p-6 text-sm leading-6 vs-border">
          Generate audio to see a listener-friendly script with word-level focus.
        </p>
      </section>
    );
  }

  const currentWordLabel = teleprompterWordLabel(cue);
  const cinemaOverlay = isCinemaOpen ? (
    <CinemaTeleprompterOverlay
      cue={cue}
      isContextVisible={isContextVisible}
      isFocusEnabled={isFocusEnabled}
      settings={effectiveSettings}
      themeName={cinemaThemeName}
      markdownSource={markdownCinemaSource}
      playbackControls={playbackControls}
      resumeProgress={cinemaResumeProgress}
      textSize={cinemaTextSize}
      isPlaybackActive={isPlaybackActive}
      onClose={handleCloseCinema}
      onContextToggle={() => {
        setIsContextVisible((current) => !current);
      }}
      onFocusSettingsOpen={onOpenSettings}
      onFocusToggle={() => {
        setIsFocusEnabled((current) => !current);
      }}
      onPlayPause={handlePlayPause}
      onRestart={handleRestart}
      onResumeProgress={onResumeProgress}
      onSkip={handleSkip}
      onThemeChange={setCinemaThemeName}
      onTextSizeChange={setCinemaTextSize}
    />
  ) : null;

  if (!showInlinePreview) {
    return cinemaOverlay;
  }

  return (
    <section className="rounded-xl border p-4 shadow-sm vs-raised sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Teleprompter</h2>
          <p className="vs-muted mt-1 text-xs">
            Segment {String(cue.segmentIndex + 1)} of {String(cue.segmentCount)} ·{" "}
            {currentWordLabel} words
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:flex-nowrap">
          <button
            className={teleprompterToggleClass(isFocusEnabled)}
            onClick={() => {
              setIsFocusEnabled((current) => !current);
            }}
            type="button"
          >
            Focus
          </button>
          <button
            className={teleprompterToggleClass(isContextVisible)}
            onClick={() => {
              setIsContextVisible((current) => !current);
            }}
            type="button"
          >
            Context
          </button>
          <button
            className="h-8 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.isAvailable}
            onClick={handleRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-8 rounded-md px-3 text-xs font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={handlePlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          {showCinemaAction ? (
            <button
              className="h-8 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/15"
              onClick={handleOpenCinema}
              type="button"
            >
              Cinema
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-xl border border-orange-500/20 bg-orange-500/[0.055] p-5 sm:p-7">
        {isContextVisible ? <TeleprompterContext cue={cue} /> : null}
        <TeleprompterWords cue={cue} settings={effectiveSettings} variant="panel" />
        <div className="h-1.5 overflow-hidden rounded-full bg-orange-500/15">
          <div
            className="h-full rounded-full transition-[width] vs-accent-bg"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            className="vs-muted rounded-md border px-3 py-1.5 font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              handleSkip(-10);
            }}
            type="button"
          >
            10s back
          </button>
          <span className="vs-muted">
            {isFocusEnabled
              ? `Lead ${String(settings.leadMs)}ms · fade ${String(settings.spokenFadeMs)}ms`
              : "Focus highlighting muted"}
          </span>
          <button
            className="vs-muted rounded-md border px-3 py-1.5 font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              handleSkip(10);
            }}
            type="button"
          >
            10s forward
          </button>
        </div>
      </div>
      {cinemaOverlay}
    </section>
  );
}

function teleprompterToggleClass(isActive: boolean): string {
  return `h-8 rounded-md border px-3 text-xs font-semibold transition vs-border ${
    isActive
      ? "border-orange-300 bg-orange-500/10 text-orange-600"
      : "vs-muted hover:bg-[var(--vs-surface)]"
  }`;
}

function TeleprompterContext({ cue }: Readonly<{ cue: TeleprompterCue }>) {
  return (
    <div className="grid gap-2 rounded-lg border bg-[var(--vs-raised)] p-3 text-xs vs-border md:grid-cols-3">
      <ContextSnippet label="Previous" value={cue.previousText ?? "Start of script"} />
      <ContextSnippet label="Current" value={cue.currentText} />
      <ContextSnippet label="Next" value={cue.nextText ?? "End of script"} />
    </div>
  );
}

function ContextSnippet({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <p className="vs-muted font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 line-clamp-2 break-words leading-5" title={value}>
        {value}
      </p>
    </div>
  );
}

function teleprompterWordLabel(cue: TeleprompterCue): string {
  return cue.activeWordIndex >= 0
    ? `${String(cue.activeWordIndex + 1)} / ${String(cue.wordCount)}`
    : "0 / 0";
}

function resolveMarkdownCinemaSource(
  job: VoiceJob | null,
  source: PreparedSource | null,
): PreparedSource | null {
  if (!job || !source) {
    return null;
  }
  if (source.renderMode !== "markdown") {
    return null;
  }
  if (!source.text && !source.blocks?.length) {
    return null;
  }
  if (job.preparedSourceId) {
    return source.id === job.preparedSourceId ? source : null;
  }
  if (!preparedSourceTextMatchesJob(source, job)) {
    return null;
  }
  return source;
}

function preparedSourceTextMatchesJob(source: PreparedSource, job: VoiceJob): boolean {
  const sourceSpeech = normalizeComparableText(source.speechText ?? "");
  if (!sourceSpeech) {
    return false;
  }
  return [job.inputText, job.optimizedText].some(
    (value) => normalizeComparableText(value) === sourceSpeech,
  );
}

function normalizeComparableText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function upsertPreparedSource(
  currentSources: PreparedSource[],
  source: PreparedSource,
): PreparedSource[] {
  return [source, ...currentSources.filter((item) => item.id !== source.id)];
}

export function isPreparedSourceDisplayIncomplete(source: PreparedSource | null): boolean {
  if (!source) {
    return false;
  }
  if (source.renderMode === "markdown") {
    return !source.text;
  }
  return !source.text || !source.speechText;
}

export function mergePreparedSourcesPreservingFullContent(
  currentSources: PreparedSource[],
  nextSources: PreparedSource[],
): PreparedSource[] {
  return nextSources.map((nextSource) => {
    const currentSource = currentSources.find((source) => source.id === nextSource.id);
    if (
      currentSource?.updatedAt === nextSource.updatedAt &&
      !isPreparedSourceDisplayIncomplete(currentSource)
    ) {
      return currentSource;
    }
    return nextSource;
  });
}

function resolveProgressForJob(
  job: VoiceJob | null,
  progress: PlaybackProgress | null,
): PlaybackProgress | null {
  if (!job || !progress || progress.finished) {
    return null;
  }

  if (progress.jobId && progress.jobId === job.id) {
    return progress;
  }
  if (progress.targetId && progress.targetId === progressTargetIdForJob(job)) {
    return progress;
  }
  if (progress.preparedSourceId && progress.preparedSourceId === job.preparedSourceId) {
    return progress;
  }
  if (
    progress.bookSourceId &&
    progress.bookSourceId === job.bookSourceId &&
    progress.bookScope &&
    job.bookScope &&
    bookScopeKey(progress.bookScope) === bookScopeKey(job.bookScope)
  ) {
    return progress;
  }

  return null;
}

function TeleprompterWords({
  cue,
  settings,
  textSize = "large",
  variant,
}: Readonly<{
  cue: TeleprompterCue;
  settings?: TeleprompterHighlightSettings;
  textSize?: CinemaTextSize;
  variant: "cinema" | "panel";
}>) {
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const cinemaTextClassBySize: Record<CinemaTextSize, string> = {
    compact:
      "whitespace-pre-wrap text-[1.18rem] leading-[1.72] text-[var(--vs-text)] sm:text-[1.55rem] lg:text-[1.95rem]",
    comfortable:
      "whitespace-pre-wrap text-[1.45rem] leading-[1.8] text-[var(--vs-text)] sm:text-[1.9rem] lg:text-[2.35rem]",
    large:
      "whitespace-pre-wrap text-[1.8rem] leading-[1.82] text-[var(--vs-text)] sm:text-[2.35rem] lg:text-[3rem]",
    giant:
      "whitespace-pre-wrap text-[2.1rem] leading-[1.86] text-[var(--vs-text)] sm:text-[2.8rem] lg:text-[3.55rem]",
    massive:
      "whitespace-pre-wrap text-[2.45rem] leading-[1.9] text-[var(--vs-text)] sm:text-[3.2rem] lg:text-[4.1rem]",
  };
  const textClass =
    variant === "cinema"
      ? cinemaTextClassBySize[textSize]
      : "whitespace-pre-wrap text-[1.22rem] leading-[1.95] text-[var(--vs-text)] sm:text-[1.9rem]";
  const wordClass = variant === "cinema" ? "rounded-lg px-2 py-1" : "rounded px-1 py-0.5";
  const activeWordIndex = cue.activeWordIndex;
  const wordCueByIndex = useMemo(
    () => new Map(cue.wordCues.map((wordCue) => [wordCue.wordIndex, wordCue])),
    [cue.wordCues],
  );
  const effectStyle = settings?.effectStyle ?? DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS.effectStyle;
  const accent = variant === "cinema" ? "#fb923c" : "#f97316";

  useEffect(() => {
    if (variant !== "cinema" || activeWordIndex < 0) {
      return;
    }
    activeWordRef.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeWordIndex, variant]);

  return (
    <p className={textClass}>
      {cue.tokens.map((token, tokenIndex) => {
        if (token.kind === "space") {
          return (
            <span key={`space-${String(tokenIndex)}`} className="whitespace-pre-wrap">
              {token.text}
            </span>
          );
        }
        const wordCue = token.wordIndex === null ? undefined : wordCueByIndex.get(token.wordIndex);
        const isActive = wordCue?.state === "active" || token.wordIndex === cue.activeWordIndex;
        const state = wordCue?.state ?? (isActive ? "active" : "idle");
        return (
          <span
            className={`${wordClass} teleprompter-word teleprompter-word--${state} ${
              variant === "cinema" ? "teleprompter-word--cinema" : ""
            }`}
            data-effect={effectStyle}
            key={`${token.text}-${String(token.wordIndex)}-${String(tokenIndex)}`}
            ref={isActive && variant === "cinema" ? activeWordRef : undefined}
            style={
              {
                "--teleprompter-accent": accent,
                "--teleprompter-intensity": String(wordCue?.intensity ?? 0),
              } as CSSProperties
            }
          >
            {renderTeleprompterTokenContent(token.text)}
          </span>
        );
      })}
    </p>
  );
}

function renderTeleprompterTokenContent(text: string): ReactNode {
  const link = teleprompterLinkToken(text);
  if (!link) {
    return <>{text}</>;
  }

  return (
    <>
      {link.leading}
      <a href={link.href} target="_blank" rel="noopener noreferrer">
        {link.label}
      </a>
      {link.trailing}
    </>
  );
}

export interface TeleprompterLinkToken {
  href: string;
  label: string;
  leading: string;
  trailing: string;
}

export function teleprompterLinkToken(text: string): TeleprompterLinkToken | null {
  const token = text.trim();
  if (!token) {
    return null;
  }

  let offset = 0;
  while (offset < token.length && isLinkLeadingPunctuation(token[offset] ?? "")) {
    offset += 1;
  }
  let core = token.slice(offset);
  const leading = token.slice(0, offset);
  if (!core) {
    return null;
  }

  let trailing = "";
  while (core.length > 0 && isLinkTrailingPunctuation(core.at(-1) ?? "")) {
    const lastCharacter = core.at(-1) ?? "";
    trailing = `${lastCharacter}${trailing}`;
    core = core.slice(0, -1);
  }
  if (!core) {
    return null;
  }

  if (/^(?:https?:\/\/|mailto:)[^\s<>"']+$/i.test(core)) {
    return { href: core, label: core, leading, trailing };
  }
  if (/^www\.[^\s<>"']+$/i.test(core)) {
    return { href: `https://${core}`, label: core, leading, trailing };
  }

  return null;
}

function isLinkLeadingPunctuation(character: string): boolean {
  return (
    character === "(" ||
    character === "[" ||
    character === "{" ||
    character === '"' ||
    character === "'" ||
    character === "`" ||
    character === "“" ||
    character === "‘" ||
    character === "«"
  );
}

function isLinkTrailingPunctuation(character: string): boolean {
  return (
    character === ")" ||
    character === "]" ||
    character === "}" ||
    character === ">" ||
    character === '"' ||
    character === "'" ||
    character === "?" ||
    character === "!" ||
    character === "." ||
    character === "," ||
    character === ":" ||
    character === ";" ||
    character === "”" ||
    character === "’" ||
    character === "»"
  );
}

const CINEMA_PLAYBACK_RATES = [0.8, 1, 1.25, 1.5] as const;

type CinemaViewMode = "teleprompter" | "markdown";

function CinemaTeleprompterOverlay({
  cue,
  isContextVisible,
  isFocusEnabled,
  isPlaybackActive,
  markdownSource,
  playbackControls,
  resumeProgress,
  settings,
  themeName,
  textSize,
  onClose,
  onContextToggle,
  onFocusSettingsOpen,
  onFocusToggle,
  onPlayPause,
  onRestart,
  onResumeProgress,
  onSkip,
  onThemeChange,
  onTextSizeChange,
}: Readonly<{
  cue: TeleprompterCue;
  isContextVisible: boolean;
  isFocusEnabled: boolean;
  isPlaybackActive: boolean;
  markdownSource: PreparedSource | null;
  playbackControls: PlaybackController;
  resumeProgress: PlaybackProgress | null;
  settings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  textSize: CinemaTextSize;
  onClose: () => void;
  onContextToggle: () => void;
  onFocusSettingsOpen: () => void;
  onFocusToggle: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
  onSkip: (seconds: number) => void;
  onThemeChange: (theme: ThemeName) => void;
  onTextSizeChange: (size: CinemaTextSize) => void;
}>) {
  const [viewMode, setViewMode] = useState<CinemaViewMode>(
    markdownSource ? "markdown" : "teleprompter",
  );

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!markdownSource && viewMode === "markdown") {
      setViewMode("teleprompter");
    }
  }, [markdownSource, viewMode]);

  return (
    <div
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col"
      data-theme={themeName}
      role="dialog"
    >
      <header className="flex flex-col gap-4 border-b px-5 py-4 vs-border sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">
            Cinema Teleprompter
          </p>
          <h2 className="mt-1 text-lg font-semibold sm:text-xl">
            {isPlaybackActive ? "Following playback" : "Ready for playback"}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          {markdownSource ? (
            <fieldset
              aria-label="Cinema view"
              className="flex rounded-md border bg-[var(--vs-surface)] p-1 vs-border"
            >
              <legend className="sr-only">Cinema view</legend>
              <button
                className={cinemaViewModeClass(viewMode === "teleprompter")}
                onClick={() => {
                  setViewMode("teleprompter");
                }}
                type="button"
              >
                Teleprompter
              </button>
              <button
                className={cinemaViewModeClass(viewMode === "markdown")}
                onClick={() => {
                  setViewMode("markdown");
                }}
                type="button"
              >
                Markdown Render
              </button>
            </fieldset>
          ) : null}
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              isPlaybackActive
                ? "border-orange-400 bg-orange-500 text-white"
                : "vs-muted bg-[var(--vs-surface)] vs-border"
            }`}
          >
            {isPlaybackActive ? "Playing" : "Paused"}
          </span>
          <span className="vs-muted hidden text-sm sm:inline">
            Segment {String(cue.segmentIndex + 1)} / {String(cue.segmentCount)} ·{" "}
            {teleprompterWordLabel(cue)} words
          </span>
          <label className="hidden items-center gap-2 rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-sm vs-border sm:flex">
            Theme
            <select
              className="bg-transparent text-sm font-semibold outline-none"
              onChange={(event) => {
                onThemeChange(normalizeThemeName(event.currentTarget.value));
              }}
              value={themeName}
            >
              {VOICE_STUDIO_THEMES.map((theme) => (
                <option key={theme.name} value={theme.name}>
                  {theme.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="h-10 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            Exit
          </button>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col justify-center px-5 py-6 sm:px-10 lg:px-20">
        <div className="mx-auto grid min-h-0 w-full max-w-6xl gap-4">
          {isContextVisible ? <TeleprompterContext cue={cue} /> : null}
          <div className="max-h-[68vh] min-h-0 overflow-y-auto rounded-xl border bg-[var(--vs-raised)] p-5 shadow-2xl sm:p-8">
            {viewMode === "markdown" && markdownSource ? (
              <MarkdownCinemaView
                activeWordIndex={cue.documentActiveWordIndex}
                source={markdownSource}
                textSize={textSize}
              />
            ) : (
              <TeleprompterWords
                cue={cue}
                settings={settings}
                textSize={textSize}
                variant="cinema"
              />
            )}
          </div>
        </div>
      </main>
      <footer className="border-t px-5 py-5 vs-border sm:px-8">
        <div className="mb-5 flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <button
            className={cinemaToggleClass(isFocusEnabled)}
            onClick={onFocusToggle}
            type="button"
          >
            Focus
          </button>
          <button
            className={cinemaToggleClass(isContextVisible)}
            onClick={onContextToggle}
            type="button"
          >
            Context
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={onFocusSettingsOpen}
            type="button"
          >
            Settings
          </button>
          {resumeProgress ? (
            <button
              className="h-10 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-sm font-semibold text-orange-600 transition hover:bg-orange-500/15"
              onClick={() => {
                onResumeProgress(resumeProgress);
              }}
              type="button"
            >
              Resume saved
            </button>
          ) : null}
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.isAvailable}
            onClick={onRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-10);
            }}
            type="button"
          >
            -10s
          </button>
          <button
            className="h-12 min-w-28 rounded-full px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={onPlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(10);
            }}
            type="button"
          >
            +10s
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-30);
            }}
            type="button"
          >
            Prev segment
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:cursor-not-allowed disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(30);
            }}
            type="button"
          >
            Next segment
          </button>
          <label className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold vs-border">
            Speed
            <select
              className="bg-transparent text-sm font-semibold outline-none"
              data-testid="ui-action-cinema-playback-speed"
              data-ui-action-owner="cinema"
              disabled={!playbackControls.setPlaybackRate}
              onChange={(event) => {
                playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
              }}
              value={String(playbackControls.playbackRate)}
            >
              {CINEMA_PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate.toFixed(rate === 1 ? 0 : 2)}x
                </option>
              ))}
            </select>
          </label>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onTextSizeChange(decreaseCinemaTextSize(textSize));
            }}
            type="button"
          >
            A-
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onTextSizeChange(increaseCinemaTextSize(textSize));
            }}
            type="button"
          >
            A+
          </button>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-orange-500/15">
          <div
            className="h-full rounded-full transition-[width] vs-accent-bg"
            style={{ width: `${String(Math.round(cue.segmentProgress * 100))}%` }}
          />
        </div>
        <p className="vs-muted mt-3 text-center text-xs">Press Escape to return to the studio.</p>
      </footer>
    </div>
  );
}

function MarkdownCinemaView({
  activeWordIndex,
  source,
  textSize,
}: Readonly<{
  activeWordIndex: number;
  source: PreparedSource;
  textSize: CinemaTextSize;
}>) {
  const activeWord = useMemo(
    () => resolvePreparedSourceActiveWord(source, activeWordIndex),
    [activeWordIndex, source],
  );
  const activeBlock = useMemo(
    () => source.blocks?.find((block) => block.id === activeWord?.blockId) ?? null,
    [activeWord?.blockId, source.blocks],
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blocks = source.blocks ?? [];
  const markdownTextClassBySize: Record<CinemaTextSize, string> = {
    compact: "text-sm leading-7 sm:text-base",
    comfortable: "text-base leading-8 sm:text-lg",
    large: "text-lg leading-9 sm:text-xl",
    giant: "text-xl leading-10 sm:text-2xl",
    massive: "text-2xl leading-[2.8rem] sm:text-3xl",
  };
  const shouldHighlightWord = activeBlock ? isMarkdownCinemaWordHighlightable(activeBlock) : false;

  useEffect(() => {
    if (!activeWord) {
      return;
    }
    containerRef.current?.querySelector(".markdown-cinema-word-active")?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [activeWord]);

  if (source.text) {
    return (
      <div ref={containerRef}>
        <Suspense fallback={<LazySurfaceFallback label="Loading markdown..." />}>
          <MarkdownRenderer
            className={`markdown-cinema prose-markdown ${markdownTextClassBySize[textSize]} text-[var(--vs-text)]`}
            blockHighlight={
              activeWord && activeBlock && !shouldHighlightWord
                ? {
                    blockEndOffset: activeWord.blockEndOffset,
                    blockStartOffset: activeWord.blockStartOffset,
                  }
                : undefined
            }
            wordHighlight={
              activeWord && shouldHighlightWord
                ? {
                    activeWordOffset: activeWord.wordOffset,
                    blockEndOffset: activeWord.blockEndOffset,
                    blockStartOffset: activeWord.blockStartOffset,
                  }
                : undefined
            }
          >
            {source.text}
          </MarkdownRenderer>
        </Suspense>
      </div>
    );
  }

  return (
    <div
      className={`markdown-cinema prose-markdown ${markdownTextClassBySize[textSize]} text-[var(--vs-text)]`}
    >
      {blocks.map((block) => (
        <MarkdownCinemaBlock
          block={block}
          isActive={block.id === activeWord?.blockId}
          key={block.id}
        />
      ))}
    </div>
  );
}

function isMarkdownCinemaWordHighlightable(block: PreparedSourceBlock): boolean {
  return (
    (block.kind === "body" ||
      block.kind === "heading" ||
      block.kind === "subheading" ||
      block.kind === "quote") &&
    block.speakMode === "speak"
  );
}

function MarkdownCinemaBlock({
  block,
  isActive,
}: Readonly<{
  block: NonNullable<PreparedSource["blocks"]>[number];
  isActive: boolean;
}>) {
  const blockRef = useRef<HTMLElement | null>(null);
  const blockText = markdownBlockText(block);

  useEffect(() => {
    if (!isActive) {
      return;
    }
    blockRef.current?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [isActive]);

  if (!blockText.trim()) {
    return null;
  }

  return (
    <section
      className={`markdown-cinema-block rounded-lg border px-4 py-3 transition ${
        isActive
          ? "border-orange-300 bg-orange-500/10 shadow-[0_0_0_1px_rgba(249,115,22,0.25)]"
          : "border-transparent"
      }`}
      data-active={isActive ? "true" : "false"}
      ref={blockRef}
    >
      {renderMarkdownCinemaBlockContent(block, blockText)}
    </section>
  );
}

function renderMarkdownCinemaBlockContent(
  block: NonNullable<PreparedSource["blocks"]>[number],
  blockText: string,
): ReactNode {
  if (block.kind === "code" && looksLikeMermaidDiagram(blockText)) {
    return (
      <Suspense fallback={<LazySurfaceFallback label="Loading diagram..." />}>
        <MermaidDiagram chart={blockText} />
      </Suspense>
    );
  }

  if (block.kind === "code") {
    return (
      <pre>
        <code>{blockText}</code>
      </pre>
    );
  }

  return (
    <Suspense fallback={<LazySurfaceFallback label="Loading markdown..." />}>
      <MarkdownRenderer className="contents">{blockText}</MarkdownRenderer>
    </Suspense>
  );
}

function cinemaViewModeClass(isActive: boolean): string {
  return `h-8 rounded px-3 text-xs font-semibold transition ${
    isActive
      ? "bg-orange-500 text-white shadow-sm"
      : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
  }`;
}

function cinemaToggleClass(isActive: boolean): string {
  return `h-10 rounded-md border px-3 text-sm font-semibold transition vs-border ${
    isActive
      ? "border-orange-300 bg-orange-500/10 text-orange-600"
      : "vs-muted hover:bg-[var(--vs-surface)]"
  }`;
}

function decreaseCinemaTextSize(size: CinemaTextSize): CinemaTextSize {
  const order: CinemaTextSize[] = ["compact", "comfortable", "large", "giant", "massive"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "compact";
}

function increaseCinemaTextSize(size: CinemaTextSize): CinemaTextSize {
  const order: CinemaTextSize[] = ["compact", "comfortable", "large", "giant", "massive"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "massive";
}

type AudioPlaybackMode = "arrival" | "completed";

const VOICE_PROFILE_ID_STORAGE_KEY = "tts-active-voice-profile-id";
const PROFILE_LOADING_SHOW_DELAY_MS = 120;
const PROFILE_LOADING_MIN_VISIBLE_MS = 260;
const READER_RESUME_BUDGET_MS = 500;

function formatErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function bookScopeContentMatches(
  content: BookSourceScopeContent | null,
  bookId: string,
  scope: BookScope,
): boolean {
  return content?.bookSourceId === bookId && bookScopeKey(content.scope) === bookScopeKey(scope);
}

function removeBookSourceById(bookId: string): (books: BookSource[]) => BookSource[] {
  return (books) => books.filter((book) => book.id !== bookId);
}

function resolveResumeBookScope(
  progress: PlaybackProgress,
  bookSources: BookSource[],
  selectedBookSource: BookSource | null,
): BookScope | null {
  if (!progress.bookSourceId) {
    return null;
  }
  const progressBook =
    bookSources.find((book) => book.id === progress.bookSourceId) ?? selectedBookSource;
  return (
    progress.bookScope ??
    (progressBook && progress.readingPosition?.scopeKey
      ? scopeFromBookScopeKey(progressBook, progress.readingPosition.scopeKey)
      : null)
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function App() {
  const [text, setText] = useState("");
  const [job, setJob] = useState<VoiceJob | null>(null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [voiceProfiles, setVoiceProfiles] = useState<VoiceProfile[]>([]);
  const [selectedVoiceProfileId, setSelectedVoiceProfileId] = useState("");
  const [researchModules, setResearchModules] = useState<ResearchModuleDiagnostics[]>([]);
  const [researchModuleError, setResearchModuleError] = useState<string | null>(null);
  const [cloningResearchModuleId, setCloningResearchModuleId] = useState<string | null>(null);
  const [buildingArtifactKey, setBuildingArtifactKey] = useState<string | null>(null);
  const [cancelingProfileSourceId, setCancelingProfileSourceId] = useState<string | null>(null);
  const [cancelingTargetKey, setCancelingTargetKey] = useState<string | null>(null);
  const [isResearchPromptHidden, setIsResearchPromptHidden] = useState(() => {
    return localStorage.getItem(RESEARCH_MODULE_PROMPT_HIDDEN_KEY) === "1";
  });
  const [selectedKokoroVoiceId, setSelectedKokoroVoiceId] = useState(() => {
    const savedVoiceId = localStorage.getItem(KOKORO_VOICE_STORAGE_KEY);
    if (savedVoiceId && findKokoroVoicepack(savedVoiceId)) {
      return savedVoiceId;
    }
    return DEFAULT_KOKORO_VOICE_ID;
  });
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const hasLoadedVoiceProfilesRef = useRef(false);
  const hasRecordedColdUsableRef = useRef(false);
  const profileLoadingShowTimerRef = useRef<number | null>(null);
  const profileLoadingHideTimerRef = useRef<number | null>(null);
  const profileLoadingVisibleRequestCounter = useRef(0);
  const profileLoadingVisibleSinceRef = useRef(0);
  const studioRouteTiming = useInteractionTiming("studio-route-switch");
  const bookCinemaOpenTiming = useInteractionTiming("book-cinema-open");
  const preparedSourceCinemaOpenTiming = useInteractionTiming("prepared-source-cinema-open");
  const readerResumeTiming = useInteractionTiming("reader-resume");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSource, setProfileSource] = useState<VoiceProfileSource | null>(null);
  const [profileSourceDiagnostics, setProfileSourceDiagnostics] =
    useState<VoiceProfileSourceDiagnostics | null>(null);
  const [isAnalyzingProfileSource, setIsAnalyzingProfileSource] = useState(false);
  const [profileCandidateCreateId, setProfileCandidateCreateId] = useState<string | null>(null);
  const [refreshingTranscriptKey, setRefreshingTranscriptKey] = useState<string | null>(null);
  const [uiMemory, setUiMemory] = useState<UiMemoryState>(() => loadUiMemory());
  const [projects, setProjects] = useState<VoiceProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState(() =>
    uiMemory.rememberLastProject
      ? (localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY) ?? "default")
      : "default",
  );
  const [uiMemoryResetSignal, setUiMemoryResetSignal] = useState(0);
  const [projectStateReadyId, setProjectStateReadyId] = useState<string | null>(null);
  const [projectJobs, setProjectJobs] = useState<VoiceJob[]>([]);
  const [bookSources, setBookSources] = useState<BookSource[]>([]);
  const [selectedBookSourceId, setSelectedBookSourceId] = useState<string | null>(null);
  const [selectedBookScope, setSelectedBookScope] = useState<BookScope | null>(null);
  const [bookScopeContent, setBookScopeContent] = useState<BookSourceScopeContent | null>(null);
  const [preparedSources, setPreparedSources] = useState<PreparedSource[]>([]);
  const [selectedPreparedSourceId, setSelectedPreparedSourceId] = useState<string | null>(null);
  const [hydratingPreparedSourceId, setHydratingPreparedSourceId] = useState<string | null>(null);
  const [isPreparingSource, setIsPreparingSource] = useState(false);
  const [sourcePrepError, setSourcePrepError] = useState<string | null>(null);
  const [speechPolicyProfiles, setSpeechPolicyProfiles] = useState<SpeechPolicyProfile[]>([]);
  const [speechPolicyDefinition, setSpeechPolicyDefinition] = useState<SpeechPolicyDefinition>(
    DEFAULT_SPEECH_POLICY_DEFINITION,
  );
  const [customSpeechPolicyProfiles, setCustomSpeechPolicyProfiles] = useState<
    CustomSpeechPolicyProfile[]
  >([]);
  const [speechPolicyProfile, setSpeechPolicyProfile] = useState<string>(
    DEFAULT_SPEECH_POLICY_PROFILE,
  );
  const [speechPolicyOverrides, setSpeechPolicyOverrides] = useState<SpeechPolicyOverrides>(() =>
    loadSpeechPolicyOverrides(activeProjectId),
  );
  const [speechPolicyError, setSpeechPolicyError] = useState<string | null>(null);
  const [isSpeechPolicyPreviewing, setIsSpeechPolicyPreviewing] = useState(false);
  const [sourcePolicySavingKey, setSourcePolicySavingKey] = useState<string | null>(null);
  const [jobPreparedSource, setJobPreparedSource] = useState<PreparedSource | null>(null);
  const [projectProgress, setProjectProgress] = useState<PlaybackProgress[]>([]);
  const [hashReadingPosition, setHashReadingPosition] = useState<ReadingPosition | null>(() =>
    parseBookCinemaHash(globalThis.location.hash),
  );
  const [projectStorage, setProjectStorage] = useState<ProjectStorageSummary | null>(null);
  const [projectStorageError, setProjectStorageError] = useState<string | null>(null);
  const [activePlaybackSession, setActivePlaybackSession] = useState<PlaybackSession | null>(null);
  const [pendingPlaybackResume, setPendingPlaybackResume] = useState<{
    autoplay: boolean;
    readingPosition?: ReadingPosition;
    seconds: number;
  } | null>(null);
  const [resumeFallbackNotice, setResumeFallbackNotice] = useState<string | null>(null);
  const [resumeRestoreStartedAt, setResumeRestoreStartedAt] = useState<number | null>(null);
  const [isBookCinemaOpen, setIsBookCinemaOpen] = useState(false);
  const [bookCinemaThemeName, setBookCinemaThemeName] = useState<ThemeName>("dark");
  const [preparedSourceCinemaSourceId, setPreparedSourceCinemaSourceId] = useState<string | null>(
    null,
  );
  const [preparedSourceCinemaThemeName, setPreparedSourceCinemaThemeName] =
    useState<ThemeName>("light");
  const [readerAccessibilitySettings, setReaderAccessibilitySettings] =
    useState<ReaderAccessibilitySettings>(() => {
      if (!uiMemory.rememberReaderPreferences) {
        return DEFAULT_READER_ACCESSIBILITY_SETTINGS;
      }
      try {
        return normalizeReaderAccessibilitySettings(
          JSON.parse(localStorage.getItem(READER_ACCESSIBILITY_STORAGE_KEY) ?? "null") as unknown,
        );
      } catch {
        return DEFAULT_READER_ACCESSIBILITY_SETTINGS;
      }
    });
  const [readAlongPreferences, setReadAlongPreferences] = useState<ReadAlongPreferences>(() =>
    loadReadAlongPreferences(activeProjectId, uiMemory.rememberReaderPreferences),
  );
  const readAlongPreferencesProjectRef = useRef(activeProjectId);
  const [isImportingBookSource, setIsImportingBookSource] = useState(false);
  const [bookSourceError, setBookSourceError] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [runConfiguration, setRunConfiguration] = useState<RunConfiguration>(() => {
    const savedConfiguration = localStorage.getItem(RUN_CONFIG_STORAGE_KEY);
    if (!savedConfiguration) {
      return createRunConfiguration("checkedMaster");
    }
    try {
      return normalizeRunConfiguration(JSON.parse(savedConfiguration) as unknown);
    } catch {
      return createRunConfiguration("checkedMaster");
    }
  });
  const [teleprompterSettings, setTeleprompterSettings] = useState<TeleprompterHighlightSettings>(
    () => {
      const savedSettings = localStorage.getItem(TELEPROMPTER_SETTINGS_STORAGE_KEY);
      if (!savedSettings) {
        return DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS;
      }
      try {
        return normalizeTeleprompterHighlightSettings(
          JSON.parse(savedSettings) as Partial<TeleprompterHighlightSettings>,
        );
      } catch {
        return DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS;
      }
    },
  );
  const [telepromptTheatreSettings, setTelepromptTheatreSettings] =
    useState<TelepromptTheatreSettings>(() => resolveTelepromptTheatreSettings(uiMemory));
  const [themeName, setThemeName] = useState<ThemeName>(() =>
    uiMemory.rememberTheme
      ? normalizeThemeName(localStorage.getItem(THEME_STORAGE_KEY))
      : DEFAULT_THEME_NAME,
  );
  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContext>(() =>
    createWorkspaceContext({
      layoutMode: resolveWorkspaceLayoutMode(uiMemory, activeProjectId),
      speechPolicyProfile,
      voiceProfileId: selectedVoiceProfileId,
    }),
  );
  const [activeReviewPane, setActiveReviewPane] = useState<ReviewPane>(() =>
    resolveReviewPane(uiMemory, activeProjectId),
  );
  const uiMemoryRef = useRef(uiMemory);
  const rememberActiveProjectId = useCallback((projectId: string) => {
    if (uiMemoryRef.current.rememberLastProject) {
      localStorage.setItem(ACTIVE_PROJECT_ID_STORAGE_KEY, projectId);
      return;
    }
    localStorage.removeItem(ACTIVE_PROJECT_ID_STORAGE_KEY);
  }, []);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false);
  const [isProjectDashboardOpen, setIsProjectDashboardOpen] = useState(false);
  const [isVoiceDashboardOpen, setIsVoiceDashboardOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [activeDemoProjectId, setActiveDemoProjectId] = useState<string | null>(null);
  const [isDemoModeCollapsed, setIsDemoModeCollapsed] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [commandPaletteView, setCommandPaletteView] = useState<CommandPaletteView>("commands");
  const [shortcutPreferences, setShortcutPreferences] = useState<ShortcutPreferences>(() =>
    loadShortcutPreferences(),
  );
  const [settingsCommandTarget, setSettingsCommandTarget] = useState<SettingsCommandTarget | null>(
    null,
  );
  const [helpCommandTarget, setHelpCommandTarget] = useState<HelpCommandTarget | null>(null);
  const [commandMetadata, setCommandMetadata] = useState<CommandMetadataState | null>(null);
  const [commandWayfinding, setCommandWayfinding] = useState<CommandWayfindingState>({
    bookmarks: [],
    recentPositions: [],
  });
  const [cinemaFocusOverrides, setCinemaFocusOverrides] = useState<
    Record<CinemaSurfaceKind, UiMemoryCinemaState | null>
  >({
    book: null,
    document: null,
    website: null,
  });
  const openCommandPalette = useCallback((view: CommandPaletteView = "commands") => {
    setCommandPaletteView(view);
    setIsCommandPaletteOpen(true);
  }, []);
  const closeCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);
  const openShortcutCheatSheet = useCallback(() => {
    openCommandPalette("shortcuts");
  }, [openCommandPalette]);
  const openContextualHelp = useCallback(() => {
    setHelpCommandTarget(null);
    setIsHelpOpen(true);
  }, []);
  const openShortcutSettings = useCallback(() => {
    closeCommandPalette();
    setSettingsCommandTarget({ fieldId: "shortcuts", groupId: "reader", scope: "machine" });
    setIsSettingsOpen(true);
  }, [closeCommandPalette]);
  const createAndListenFromCurrentSourceRef = useRef<() => void>(() => {
    return;
  });
  useEffect(() => {
    saveShortcutPreferences(shortcutPreferences);
  }, [shortcutPreferences]);
  useEffect(() => {
    if (!isCommandPaletteOpen || commandMetadata) {
      return;
    }
    let cancelled = false;
    void import("./features/navigation/commands").then((module) => {
      if (cancelled) {
        return;
      }
      setCommandMetadata({
        cinemaAdvanced: module.buildCinemaAdvancedCommandMetadata(),
        cinemaFocus: module.buildCinemaFocusCommandMetadata(),
        help: module.buildHelpCommandMetadata(),
        settings: module.buildSettingsCommandMetadata(),
        workspace: module.buildWorkspaceCommandMetadata(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [commandMetadata, isCommandPaletteOpen]);
  const [bundlePanelMode, setBundlePanelMode] = useState<BundlePanelMode>("export");
  const [isBundlePanelOpen, setIsBundlePanelOpen] = useState(false);
  const [isContentIROpen, setIsContentIROpen] = useState(false);
  const [contentIRDocument, setContentIRDocument] = useState<ContentIRDocument | null>(null);
  const [contentIRError, setContentIRError] = useState<string | null>(null);
  const [contentIRTitle, setContentIRTitle] = useState("Content structure");
  const [isContentIRLoading, setIsContentIRLoading] = useState(false);
  const [playbackCursorSec, setPlaybackCursorSec] = useState(0);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [highlightMap, setHighlightMap] = useState<HighlightMap | null>(null);
  const [highlightMapV2, setHighlightMapV2] = useState<HighlightMapV2 | null>(null);
  const [playbackControls, setPlaybackControls] = useState<PlaybackController>(
    DISABLED_PLAYBACK_CONTROLLER,
  );
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [systemMetricsError, setSystemMetricsError] = useState<string | null>(null);
  const [systemMetricsUnavailable, setSystemMetricsUnavailable] = useState(false);
  const [ttsEngines, setTTSEngines] = useState<TTSEngineDiagnostics[]>([]);
  const [ttsEngineError, setTTSEngineError] = useState<string | null>(null);
  const createAndListenCapabilityReason = useMemo(
    () => resolveCreateAndListenCapabilityReason(runConfiguration.ttsEngine, ttsEngines),
    [runConfiguration.ttsEngine, ttsEngines],
  );
  const providerBackedGenerationBoundary = useMemo(
    () => providerRuntimeLeavesLocalBoundary(runConfiguration.ttsEngine, ttsEngines),
    [runConfiguration.ttsEngine, ttsEngines],
  );
  const [voiceProfileCredentials, setVoiceProfileCredentials] =
    useState<VoiceProfileCredentialStatus | null>(null);
  const [voiceProfileCredentialError, setVoiceProfileCredentialError] = useState<string | null>(
    null,
  );
  const [savingHuggingFaceTokenKey, setSavingHuggingFaceTokenKey] = useState<string | null>(null);
  const [isClearingHuggingFaceToken, setIsClearingHuggingFaceToken] = useState(false);
  const [studioMode, setStudioMode] = useState<StudioMode>("narration");
  const { announceAssertive, announcePolite } = useLiveStatus();
  const handleStudioModeChange = useCallback(
    (mode: StudioMode) => {
      if (mode !== studioMode) {
        studioRouteTiming.start({ fromMode: studioMode, toMode: mode });
      }
      setStudioMode(mode);
    },
    [studioMode, studioRouteTiming],
  );
  const [sourceMode, setSourceMode] = useState<SourceMode>("text");
  const [teleprompterOpenSignal, setTeleprompterOpenSignal] = useState(0);
  const [telepromptTheatreOpenSignal, setTelepromptTheatreOpenSignal] = useState(0);
  const [cinemaTheatreOpenSignal, setCinemaTheatreOpenSignal] = useState(0);
  const [cinemaTheatreExitSignal, setCinemaTheatreExitSignal] = useState(0);
  const [cinemaTheatreControlsSignal, setCinemaTheatreControlsSignal] = useState(0);
  const workspaceRails = workspaceLayoutRails(workspaceContext.layoutMode);
  const activityFooterMode: ActivityFooterMode = workspaceRails.activityFooterMode;
  const leftRailMode = workspaceRails.leftRailMode;
  const rightRailMode = workspaceRails.rightRailMode;
  const contentMode = workspaceContext.stage;
  const runWorkspaceStageAction = useCallback(
    (actionId: WorkspaceStageActionId) => {
      if (actionId === "openTeleprompt") {
        setTelepromptTheatreOpenSignal(0);
        setUiMemory((currentMemory) =>
          rememberTelepromptReturnStage(currentMemory, activeProjectId, contentMode),
        );
      }
      setWorkspaceContext((currentContext) =>
        transitionWorkspaceContextForStageAction(currentContext, actionId),
      );
    },
    [activeProjectId, contentMode],
  );
  const setContentMode = useCallback(
    (stage: WorkspaceStage) => {
      runWorkspaceStageAction(workspaceStageNavigationAction(stage));
    },
    [runWorkspaceStageAction],
  );
  function openDemoProject(project: DemoProject) {
    setActiveDemoProjectId(project.id);
    setIsDemoModeCollapsed(false);
    setProjectStateReadyId(null);
    setText(project.sampleText);
    setSourceMode("text");
    setSelectedBookSourceId(null);
    setSelectedBookScope(null);
    setBookScopeContent(null);
    setSelectedPreparedSourceId(null);
    setSourcePrepError(null);
    setBookSourceError(null);
    setError(null);
    setJob(null);
    setRequestState("idle");
    setResumeFallbackNotice(null);
    setActivePlaybackSession(null);
    setPendingPlaybackResume(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
    setSpeechPolicyProfile(project.policyProfile);
    setSelectedVoiceProfileId(project.voiceId === "default" ? "" : project.voiceId);
    setWorkspaceContext((currentContext) =>
      createWorkspaceContext({
        ...currentContext,
        activeBlockId: null,
        sourceId: project.id,
        sourceType: "draft",
        speechPolicyProfile: project.policyProfile,
        stage: "review",
        telepromptReturnStage: "review",
        voiceProfileId: project.voiceId === "default" ? null : project.voiceId,
      }),
    );
  }
  const setWorkspaceLayoutMode = useCallback(
    (layoutMode: WorkspaceLayoutMode) => {
      setWorkspaceContext((currentContext) => ({
        ...currentContext,
        layoutMode,
      }));
      setUiMemory((currentMemory) =>
        rememberWorkspaceLayoutMode(currentMemory, activeProjectId, layoutMode),
      );
    },
    [activeProjectId],
  );
  const handleRailModeChange = useCallback(
    (mode: WorkspaceRailMode) => {
      setWorkspaceLayoutMode(workspaceLayoutModeForRailMode(mode));
    },
    [setWorkspaceLayoutMode],
  );
  const setLeftRailMode = handleRailModeChange;
  const setRightRailMode = handleRailModeChange;
  const setActivityFooterMode = useCallback(
    (mode: ActivityFooterMode) => {
      setWorkspaceLayoutMode(workspaceLayoutModeForRailMode(mode));
    },
    [setWorkspaceLayoutMode],
  );
  const handleReviewPaneChange = useCallback(
    (pane: ReviewPane) => {
      const normalizedPane = normalizeReviewPane(pane);
      setActiveReviewPane(normalizedPane);
      setUiMemory((currentMemory) =>
        rememberReviewPane(currentMemory, activeProjectId, normalizedPane),
      );
    },
    [activeProjectId],
  );
  const handleUiMemoryPreferenceChange = useCallback(
    (preferenceId: UiMemoryPreferenceId, enabled: boolean) => {
      setUiMemory((currentMemory) => {
        const nextMemory = updateUiMemoryPreference(currentMemory, preferenceId, enabled);
        uiMemoryRef.current = nextMemory;
        return nextMemory;
      });
      if (enabled) {
        return;
      }
      if (preferenceId === "rememberLastProject") {
        localStorage.removeItem(ACTIVE_PROJECT_ID_STORAGE_KEY);
      }
      if (preferenceId === "rememberReaderPreferences") {
        localStorage.removeItem(READER_ACCESSIBILITY_STORAGE_KEY);
        clearStoredReadAlongPreferences(activeProjectId);
      }
      if (preferenceId === "rememberTelepromptReturnTarget") {
        clearStoredTelepromptReturnMemory();
      }
      if (preferenceId === "rememberTheme") {
        localStorage.removeItem(THEME_STORAGE_KEY);
      }
    },
    [activeProjectId],
  );
  const handleUiMemoryReset = useCallback(
    (scope: UiMemoryResetScope) => {
      if (scope === "reader") {
        setReaderAccessibilitySettings(DEFAULT_READER_ACCESSIBILITY_SETTINGS);
        setReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES);
        localStorage.removeItem(READER_ACCESSIBILITY_STORAGE_KEY);
        clearStoredReadAlongPreferences(activeProjectId);
        announcePolite(liveStatusMessages.settingsReset("Reader"));
        return;
      }
      if (scope === "workspace") {
        setUiMemory((currentMemory) => {
          const nextMemory = resetWorkspaceUiMemory(currentMemory);
          uiMemoryRef.current = nextMemory;
          return nextMemory;
        });
        setWorkspaceContext((currentContext) => ({
          ...currentContext,
          layoutMode: defaultWorkspaceLayoutMode(),
        }));
        setActiveReviewPane("blocks");
        announcePolite(liveStatusMessages.settingsReset("Workspace"));
        return;
      }
      setUiMemory((currentMemory) => {
        const nextMemory = resetUiMemory(currentMemory, { preservePreferences: false });
        uiMemoryRef.current = nextMemory;
        return nextMemory;
      });
      clearStoredTelepromptReturnMemory();
      localStorage.removeItem(ACTIVE_PROJECT_ID_STORAGE_KEY);
      localStorage.removeItem(READER_ACCESSIBILITY_STORAGE_KEY);
      clearStoredReadAlongPreferences(activeProjectId);
      localStorage.removeItem(THEME_STORAGE_KEY);
      setReaderAccessibilitySettings(DEFAULT_READER_ACCESSIBILITY_SETTINGS);
      setReadAlongPreferences(DEFAULT_READ_ALONG_PREFERENCES);
      setThemeName(DEFAULT_THEME_NAME);
      setCinemaFocusOverrides({
        book: null,
        document: null,
        website: null,
      });
      setWorkspaceContext((currentContext) => ({
        ...currentContext,
        layoutMode: defaultWorkspaceLayoutMode(),
        telepromptReturnStage: "review",
      }));
      setActiveReviewPane("blocks");
      setUiMemoryResetSignal((currentSignal) => currentSignal + 1);
      announcePolite(liveStatusMessages.settingsReset("All"));
    },
    [activeProjectId, announcePolite],
  );
  const handleCinemaFocusStateChange = useCallback(
    (surfaceKind: "book" | "document" | "website", state: UiMemoryCinemaState) => {
      setCinemaFocusOverrides((currentOverrides) => {
        const currentState = currentOverrides[surfaceKind];
        if (currentState && isSameCinemaFocusState(currentState, state)) {
          return currentOverrides;
        }
        return {
          ...currentOverrides,
          [surfaceKind]: state,
        };
      });
      setUiMemory((currentMemory) => rememberCinemaFocusState(currentMemory, surfaceKind, state));
    },
    [],
  );
  const resolveLiveCinemaFocusState = useCallback(
    (surfaceKind: CinemaSurfaceKind): UiMemoryCinemaState =>
      cinemaFocusOverrides[surfaceKind] ?? resolveCinemaFocusState(uiMemory, surfaceKind),
    [cinemaFocusOverrides, uiMemory],
  );
  const setCinemaFocusModeFromCommand = useCallback(
    (surfaceKind: CinemaSurfaceKind, mode: CinemaFocusMode) => {
      const currentState = resolveLiveCinemaFocusState(surfaceKind);
      handleCinemaFocusStateChange(surfaceKind, {
        ...currentState,
        activePanelId: null,
        mode,
      });
    },
    [handleCinemaFocusStateChange, resolveLiveCinemaFocusState],
  );
  const setCinemaAdvancedActionFromCommand = useCallback(
    (surfaceKind: CinemaSurfaceKind, target: CinemaAdvancedCommandTarget) => {
      const currentState = resolveLiveCinemaFocusState(surfaceKind);
      handleCinemaFocusStateChange(surfaceKind, {
        ...currentState,
        activePanelId: target.panelId,
        mode: target.mode,
      });
    },
    [handleCinemaFocusStateChange, resolveLiveCinemaFocusState],
  );

  const isProcessing = requestState === "running";
  const activeJobId =
    job && !["completed", "failed", "cancelled"].includes(job.status) ? job.id : null;
  const ttsPipeline = useMemo(() => resolveTTSPipelineState(job), [job]);
  const selectedVoiceProfile = useMemo(
    () => voiceProfiles.find((profile) => profile.id === selectedVoiceProfileId) ?? null,
    [selectedVoiceProfileId, voiceProfiles],
  );
  const selectedVoiceProfileLabel =
    selectedVoiceProfile?.name ?? demoVoiceLabel(selectedVoiceProfileId || "default");
  const hasActiveVoiceProfileTargets = useMemo(
    () =>
      voiceProfiles.some((profile) =>
        Object.values(profile.cloneTargets ?? {}).some((target) =>
          ["queued", "building", "validating"].includes(target.status),
        ),
      ),
    [voiceProfiles],
  );
  const voiceCloningActivity = useMemo(
    () =>
      resolveVoiceCloningActivity({
        activeEngineId: runConfiguration.ttsEngine,
        buildingArtifactKey,
        createCandidateId: profileCandidateCreateId,
        error: profileError,
        isAnalyzing: isAnalyzingProfileSource,
        now,
        profileSource,
        profiles: voiceProfiles,
        selectedProfile: selectedVoiceProfile,
      }),
    [
      buildingArtifactKey,
      isAnalyzingProfileSource,
      now,
      profileCandidateCreateId,
      profileError,
      profileSource,
      runConfiguration.ttsEngine,
      selectedVoiceProfile,
      voiceProfiles,
    ],
  );
  const hasActiveVoiceCloningActivity = useMemo(
    () =>
      voiceCloningActivity.status === "running" ||
      voiceCloningActivity.status === "attention" ||
      isProcessing,
    [isProcessing, voiceCloningActivity.status],
  );
  const activeProject = useMemo<VoiceProject | null>(() => {
    const selectedProject = projects.find((project) => project.id === activeProjectId);
    if (selectedProject) {
      return selectedProject;
    }
    return projects.length > 0 ? projects[0] : null;
  }, [activeProjectId, projects]);
  const selectedBookSource = useMemo(
    () =>
      selectedBookSourceId
        ? (bookSources.find((book) => book.id === selectedBookSourceId) ?? null)
        : (bookSources[0] ?? null),
    [bookSources, selectedBookSourceId],
  );
  const selectedPreparedSource = useMemo(
    () =>
      selectedPreparedSourceId
        ? (preparedSources.find((source) => source.id === selectedPreparedSourceId) ?? null)
        : (preparedSources[0] ?? null),
    [preparedSources, selectedPreparedSourceId],
  );
  const effectiveBookScope = useMemo(
    () =>
      selectedBookSource ? normalizeBookScopeForBook(selectedBookSource, selectedBookScope) : null,
    [selectedBookScope, selectedBookSource],
  );
  const activeNarrationBookSource = sourceMode === "book" ? selectedBookSource : null;
  const activeNarrationPreparedSource = sourceMode === "fileUrl" ? selectedPreparedSource : null;
  let activeNarrationSourceType: WorkspaceSourceType = "draft";
  if (activeNarrationPreparedSource) {
    activeNarrationSourceType = "prepared";
  } else if (activeNarrationBookSource) {
    activeNarrationSourceType = "book";
  }
  const narrationPreviewBlocks = useMemo(
    () =>
      buildNarrationReviewBlocks({
        optimizedText: job?.optimizedText ?? "",
        bookScopeContent,
        selectedBookScope: effectiveBookScope,
        selectedBookSource: activeNarrationBookSource,
        selectedPreparedSource: activeNarrationPreparedSource,
        text,
      }),
    [
      activeNarrationBookSource,
      activeNarrationPreparedSource,
      bookScopeContent,
      effectiveBookScope,
      job?.optimizedText,
      text,
    ],
  );
  const globalPreviewVoiceOptions = useMemo(
    () => [
      {
        detail: "Use the current engine default voice.",
        id: "default",
        label: "Default voice",
      },
      ...demoVoices
        .filter((voice) => voice.id !== "default")
        .map((voice) => ({
          detail: voice.description,
          id: voice.id,
          label: voice.label,
        })),
      ...voiceProfiles.map((profile) => ({
        detail: `${profile.language || "language"} · ${profile.status}`,
        id: profile.id,
        label: profile.name,
      })),
    ],
    [voiceProfiles],
  );
  const globalPreviewPolicyOptions = useMemo(() => {
    const builtInProfiles =
      speechPolicyProfiles.length > 0
        ? speechPolicyProfiles
        : DEFAULT_SPEECH_POLICY_DEFINITION.profiles;
    return [
      ...builtInProfiles.map((profile) => ({
        detail: profile.description || "Built-in speech policy profile.",
        id: profile.name,
        label: profile.label,
      })),
      ...customSpeechPolicyProfiles.map((profile) => ({
        detail: profile.baseProfile
          ? `Custom profile based on ${profile.baseProfile}.`
          : "Custom profile.",
        id: profile.id,
        label: profile.name,
      })),
    ];
  }, [customSpeechPolicyProfiles, speechPolicyProfiles]);
  useEffect(() => {
    let sourceId: string | null = null;
    if (sourceMode === "book") {
      sourceId = selectedBookSource?.id ?? null;
    } else if (sourceMode === "fileUrl") {
      sourceId = selectedPreparedSource?.id ?? null;
    }
    setWorkspaceContext((currentContext) =>
      withWorkspaceSource(currentContext, workspaceSourceType(sourceMode), sourceId),
    );
  }, [selectedBookSource?.id, selectedPreparedSource?.id, sourceMode]);
  useEffect(() => {
    setWorkspaceContext((currentContext) =>
      withWorkspaceVoiceProfile(currentContext, selectedVoiceProfileId),
    );
  }, [selectedVoiceProfileId]);
  useEffect(() => {
    setWorkspaceContext((currentContext) =>
      withWorkspaceSpeechPolicyProfile(currentContext, speechPolicyProfile),
    );
  }, [speechPolicyProfile]);
  const latestProgress = (() => {
    const unfinishedProgress = projectProgress.find((progress) => !progress.finished);
    if (unfinishedProgress) {
      return unfinishedProgress;
    }
    return projectProgress.length > 0 ? projectProgress[0] : null;
  })();
  const preparedSourceCinemaSource = useMemo(() => {
    if (!preparedSourceCinemaSourceId) {
      return null;
    }
    if (jobPreparedSource?.id === preparedSourceCinemaSourceId) {
      return jobPreparedSource;
    }
    return preparedSources.find((source) => source.id === preparedSourceCinemaSourceId) ?? null;
  }, [jobPreparedSource, preparedSourceCinemaSourceId, preparedSources]);
  const preparedSourceCinemaJob = useMemo(
    () => (preparedSourceCinemaJobMatchesSource(job, preparedSourceCinemaSource) ? job : null),
    [job, preparedSourceCinemaSource],
  );
  const preparedSourceCinemaCue = useMemo(
    () =>
      preparedSourceCinemaJob
        ? buildTeleprompterCue(preparedSourceCinemaJob, playbackCursorSec, teleprompterSettings)
        : null,
    [playbackCursorSec, preparedSourceCinemaJob, teleprompterSettings],
  );
  const preparedSourceCinemaProgress = useMemo(() => {
    if (!preparedSourceCinemaSource) {
      return null;
    }
    if (preparedSourceCinemaJob) {
      const targetId = progressTargetIdForJob(preparedSourceCinemaJob);
      return (
        projectProgress.find(
          (progress) =>
            progress.targetId === targetId ||
            progress.preparedSourceId === preparedSourceCinemaSource.id,
        ) ??
        resolveProgressForJob(preparedSourceCinemaJob, latestProgress) ??
        null
      );
    }
    return (
      projectProgress.find(
        (progress) =>
          progress.preparedSourceId === preparedSourceCinemaSource.id ||
          progress.targetId === `prepared:${preparedSourceCinemaSource.id}`,
      ) ?? null
    );
  }, [latestProgress, preparedSourceCinemaJob, preparedSourceCinemaSource, projectProgress]);
  const openPreparedSourceCinema = useCallback(
    (source: PreparedSource) => {
      preparedSourceCinemaOpenTiming.start({
        kind: preparedSourceCinemaKind(source),
        preparedSourceId: source.id,
      });
      setPreparedSourceCinemaSourceId(source.id);
      if (preparedSourceCinemaKind(source) === "website") {
        setPreparedSourceCinemaThemeName(themeName === "night" ? "light" : themeName);
        return;
      }
      setPreparedSourceCinemaThemeName("dark");
    },
    [preparedSourceCinemaOpenTiming, themeName],
  );
  useEffect(() => {
    if (
      sourceMode !== "fileUrl" ||
      !selectedPreparedSource ||
      !isPreparedSourceDisplayIncomplete(selectedPreparedSource) ||
      hydratingPreparedSourceId === selectedPreparedSource.id
    ) {
      return;
    }

    let isCancelled = false;
    setHydratingPreparedSourceId(selectedPreparedSource.id);
    void getPreparedSource(selectedPreparedSource.id)
      .then((source) => {
        if (isCancelled) {
          return;
        }
        setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared source"));
        }
      })
      .finally(() => {
        setHydratingPreparedSourceId((currentId) =>
          currentId === selectedPreparedSource.id ? null : currentId,
        );
      });

    return () => {
      isCancelled = true;
    };
  }, [hydratingPreparedSourceId, selectedPreparedSource, sourceMode]);

  useEffect(() => {
    const preparedSourceId = job?.preparedSourceId;
    if (!preparedSourceId) {
      setJobPreparedSource(null);
      return;
    }
    const requestedOverrides = compactSpeechPolicyOverrides(job.speechPolicyOverrides ?? {});
    if (jobPreparedSource?.id === preparedSourceId && jobPreparedSource.text) {
      return;
    }
    let isCancelled = false;
    void previewPreparedSourceSpeechPolicy(preparedSourceId, {
      ...sessionSpeechPolicyRequest(requestedOverrides),
      locale: resolveRunLocale(runConfiguration),
      ttsEngine: runConfiguration.ttsEngine,
      voiceProfileId: selectedVoiceProfileId,
    })
      .then((source) => {
        if (!isCancelled) {
          setJobPreparedSource(source);
          setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
        }
      })
      .catch(() => {
        if (!isCancelled) {
          void getPreparedSource(preparedSourceId)
            .then((source) => {
              if (!isCancelled) {
                setJobPreparedSource(source);
              }
            })
            .catch(() => {
              if (!isCancelled) {
                setJobPreparedSource(null);
              }
            });
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    job?.preparedSourceId,
    job?.speechPolicyOverrides,
    jobPreparedSource?.id,
    jobPreparedSource?.text,
    runConfiguration,
    selectedVoiceProfileId,
  ]);

  useEffect(() => {
    if (
      sourceMode !== "fileUrl" ||
      !selectedPreparedSource?.id ||
      selectedPreparedSource.status !== "ready"
    ) {
      return;
    }
    // The request omits profile on purpose; this guard keeps backend-resolved previews fresh
    // after the saved project profile changes without sending it as a session profile.
    const projectPolicyProfile = normalizeSpeechPolicyProfile(speechPolicyProfile);
    if (!projectPolicyProfile) {
      return;
    }
    let isCancelled = false;
    setIsSpeechPolicyPreviewing(true);
    void previewPreparedSourceSpeechPolicy(selectedPreparedSource.id, {
      ...sessionSpeechPolicyRequest(speechPolicyOverrides),
      locale: resolveRunLocale(runConfiguration),
      ttsEngine: runConfiguration.ttsEngine,
      voiceProfileId: selectedVoiceProfileId,
    })
      .then((source) => {
        if (isCancelled) {
          return;
        }
        setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
        setSourcePrepError(null);
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setSourcePrepError(formatErrorMessage(caughtError, "Unable to preview speech policy"));
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsSpeechPolicyPreviewing(false);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    selectedPreparedSource?.id,
    selectedPreparedSource?.status,
    runConfiguration,
    selectedVoiceProfileId,
    speechPolicyOverrides,
    speechPolicyProfile,
    sourceMode,
  ]);

  const selectedBookProgress = useMemo(() => {
    if (!selectedBookSource || !effectiveBookScope) {
      return null;
    }
    const targetId = progressTargetIdForBookScope(selectedBookSource.id, effectiveBookScope);
    return projectProgress.find((progress) => progress.targetId === targetId) ?? null;
  }, [effectiveBookScope, projectProgress, selectedBookSource]);
  const currentReadingPosition = useMemo<ReadingPosition | null>(() => {
    if (!selectedBookSource || !effectiveBookScope) {
      return null;
    }
    const scopeKey = bookScopeKey(effectiveBookScope);
    if (
      hashReadingPosition?.bookSourceId === selectedBookSource.id &&
      hashReadingPosition.scopeKey === scopeKey
    ) {
      return hashReadingPosition;
    }
    return {
      activeWordIndex: selectedBookProgress?.activeWordIndex ?? 0,
      bookSourceId: selectedBookSource.id,
      scopeKey,
    };
  }, [effectiveBookScope, hashReadingPosition, selectedBookProgress, selectedBookSource]);
  const hashProgress = useMemo(
    () =>
      selectedBookSource && effectiveBookScope
        ? playbackProgressFromReadingPosition(
            hashReadingPosition,
            selectedBookSource.id,
            bookScopeKey(effectiveBookScope),
            activeProjectId,
          )
        : null,
    [activeProjectId, effectiveBookScope, hashReadingPosition, selectedBookSource],
  );
  const canOpenBookCinema = selectedBookSource?.status === "ready";
  const canOpenCurrentCinema = Boolean(job) || canOpenBookCinema;
  let hasCreatableCurrentSource = false;
  if (!isProcessing && sourceMode === "book") {
    hasCreatableCurrentSource =
      selectedBookSource?.status === "ready" && Boolean(effectiveBookScope);
  } else if (!isProcessing && sourceMode === "fileUrl") {
    hasCreatableCurrentSource =
      selectedPreparedSource?.status === "ready" &&
      Boolean((selectedPreparedSource.speechText ?? selectedPreparedSource.text ?? "").trim());
  } else if (!isProcessing) {
    hasCreatableCurrentSource = text.trim().length > 0;
  }
  const canCreateCurrentSource = hasCreatableCurrentSource && !createAndListenCapabilityReason;
  const createAndListenDisabledReason = canCreateCurrentSource
    ? undefined
    : (createAndListenCapabilityReason ?? "Select a ready source or wait for the current run.");
  const createAndListenScope = createAndListenScopeForSource({
    selectedBookScope: effectiveBookScope,
    selectedBookSource: activeNarrationBookSource,
    selectedPreparedSource: activeNarrationPreparedSource,
    sourceMode,
  });
  const isResumeRestoring = useDelayedBusy(resumeRestoreStartedAt !== null, 250);
  const openReadingCinema = useCallback(
    (target?: "book") => {
      const shouldOpenSelectedBook = target === "book" || !job || Boolean(job.bookSourceId);
      if (canOpenBookCinema && shouldOpenSelectedBook) {
        bookCinemaOpenTiming.start({ target: "book" });
        setBookCinemaThemeName(themeName === "light" ? "dark" : themeName);
        setIsBookCinemaOpen(true);
        return;
      }
      setTeleprompterOpenSignal((currentSignal) => currentSignal + 1);
    },
    [bookCinemaOpenTiming, canOpenBookCinema, job, themeName],
  );
  const openSelectedBookCinema = useCallback(() => {
    if (canOpenBookCinema) {
      bookCinemaOpenTiming.start({ target: "selected-book" });
      setBookCinemaThemeName(themeName === "light" ? "dark" : themeName);
      setIsBookCinemaOpen(true);
      return;
    }
    setTeleprompterOpenSignal((currentSignal) => currentSignal + 1);
  }, [bookCinemaOpenTiming, canOpenBookCinema, themeName]);
  const openTelepromptStage = useCallback(() => {
    runWorkspaceStageAction("openTeleprompt");
  }, [runWorkspaceStageAction]);
  const openTelepromptTheatreStage = useCallback(() => {
    runWorkspaceStageAction("openTeleprompt");
    setTelepromptTheatreOpenSignal((currentSignal) => currentSignal + 1);
  }, [runWorkspaceStageAction]);
  const handleSelectBookCinemaSource = useCallback(
    (bookId: string) => {
      const book = bookSources.find((item) => item.id === bookId);
      if (!book) {
        return;
      }
      setSelectedBookSourceId(book.id);
      setSelectedBookScope(resolveDefaultBookScope(book));
      setBookScopeContent(null);
    },
    [bookSources],
  );
  const ttsPipelineHint = isProcessing
    ? (job?.progress.message ?? "TTS pipeline is processing the current job.")
    : "Start a job to see live TTS pipeline status.";

  useEffect(() => {
    if (hasRecordedColdUsableRef.current) {
      return;
    }
    hasRecordedColdUsableRef.current = true;
    recordColdUsableMetric({ studioMode });
  }, [studioMode]);

  useEffect(() => {
    studioRouteTiming.end({ studioMode });
  }, [studioMode, studioRouteTiming]);

  useEffect(() => {
    if (!isBookCinemaOpen || !selectedBookSource || !effectiveBookScope) {
      return;
    }
    bookCinemaOpenTiming.end({
      bookSourceId: selectedBookSource.id,
      scope: bookScopeKey(effectiveBookScope),
    });
  }, [bookCinemaOpenTiming, effectiveBookScope, isBookCinemaOpen, selectedBookSource]);

  useEffect(() => {
    if (!preparedSourceCinemaSourceId) {
      return;
    }
    if (!preparedSourceCinemaSource) {
      setPreparedSourceCinemaSourceId(null);
      return;
    }
    preparedSourceCinemaOpenTiming.end({
      preparedSourceId: preparedSourceCinemaSource.id,
      kind: preparedSourceCinemaSource.kind,
    });
  }, [preparedSourceCinemaOpenTiming, preparedSourceCinemaSource, preparedSourceCinemaSourceId]);

  useEffect(() => {
    const syncHashPosition = () => {
      setHashReadingPosition(parseBookCinemaHash(globalThis.location.hash));
    };
    globalThis.addEventListener("hashchange", syncHashPosition);
    return () => {
      globalThis.removeEventListener("hashchange", syncHashPosition);
    };
  }, []);

  useEffect(() => {
    if (!hashReadingPosition?.bookSourceId) {
      return;
    }
    const book = bookSources.find((item) => item.id === hashReadingPosition.bookSourceId);
    if (!book) {
      return;
    }
    setSelectedBookSourceId(book.id);
    setSelectedBookScope(scopeFromBookScopeKey(book, hashReadingPosition.scopeKey));
    if (book.status === "ready") {
      bookCinemaOpenTiming.start({
        bookSourceId: book.id,
        reason: "hash-resume",
      });
      setBookCinemaThemeName(themeName === "light" ? "dark" : themeName);
      setIsBookCinemaOpen(true);
    }
  }, [bookCinemaOpenTiming, bookSources, hashReadingPosition, themeName]);

  const beginProfileLoadingIndicator = useCallback(() => {
    const visibleRequestToken = ++profileLoadingVisibleRequestCounter.current;
    if (profileLoadingHideTimerRef.current !== null) {
      globalThis.clearTimeout(profileLoadingHideTimerRef.current);
      profileLoadingHideTimerRef.current = null;
    }
    if (profileLoadingShowTimerRef.current !== null) {
      globalThis.clearTimeout(profileLoadingShowTimerRef.current);
    }
    profileLoadingShowTimerRef.current = globalThis.setTimeout(() => {
      if (visibleRequestToken !== profileLoadingVisibleRequestCounter.current) {
        return;
      }
      profileLoadingVisibleSinceRef.current = Date.now();
      setIsLoadingProfiles(true);
    }, PROFILE_LOADING_SHOW_DELAY_MS);
    return visibleRequestToken;
  }, []);

  const finishProfileLoadingIndicator = useCallback((visibleRequestToken: number) => {
    if (visibleRequestToken !== profileLoadingVisibleRequestCounter.current) {
      return;
    }
    if (profileLoadingShowTimerRef.current !== null) {
      globalThis.clearTimeout(profileLoadingShowTimerRef.current);
      profileLoadingShowTimerRef.current = null;
    }
    const visibleSince = profileLoadingVisibleSinceRef.current;
    const hideDelay =
      visibleSince === 0
        ? 0
        : Math.max(0, PROFILE_LOADING_MIN_VISIBLE_MS - (Date.now() - visibleSince));
    const hideLoader = () => {
      if (visibleRequestToken !== profileLoadingVisibleRequestCounter.current) {
        return;
      }
      setIsLoadingProfiles(false);
      profileLoadingVisibleSinceRef.current = 0;
    };
    if (hideDelay === 0 || visibleSince === 0) {
      hideLoader();
      return;
    }
    profileLoadingHideTimerRef.current = globalThis.setTimeout(hideLoader, hideDelay);
  }, []);

  const refreshVoiceProfiles = useCallback(
    async (options?: Readonly<{ silent?: boolean }>) => {
      const isSilent = options?.silent ?? false;
      const shouldShowLoader = !isSilent && !hasLoadedVoiceProfilesRef.current;
      const visibleRequestToken = shouldShowLoader ? beginProfileLoadingIndicator() : 0;
      setProfileError(null);
      try {
        const profiles = await listVoiceProfiles();
        setVoiceProfiles(profiles);
        const restoreProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
        if (restoreProfileId && !profiles.some((profile) => profile.id === restoreProfileId)) {
          setSelectedVoiceProfileId("");
          localStorage.removeItem(VOICE_PROFILE_ID_STORAGE_KEY);
        }
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to load voice profiles",
        );
      } finally {
        hasLoadedVoiceProfilesRef.current = true;
        if (shouldShowLoader) {
          finishProfileLoadingIndicator(visibleRequestToken);
        }
      }
    },
    [beginProfileLoadingIndicator, finishProfileLoadingIndicator],
  );

  useEffect(() => {
    return () => {
      if (profileLoadingShowTimerRef.current !== null) {
        globalThis.clearTimeout(profileLoadingShowTimerRef.current);
      }
      if (profileLoadingHideTimerRef.current !== null) {
        globalThis.clearTimeout(profileLoadingHideTimerRef.current);
      }
    };
  }, []);

  const refreshResearchModules = useCallback(async () => {
    try {
      setResearchModules(await listResearchModules());
      setResearchModuleError(null);
    } catch (caughtError) {
      setResearchModuleError(
        caughtError instanceof Error ? caughtError.message : "Unable to load research modules",
      );
    }
  }, []);

  const refreshVoiceProfileCredentials = useCallback(async () => {
    try {
      setVoiceProfileCredentials(await getVoiceProfileCredentials());
      setVoiceProfileCredentialError(null);
    } catch (caughtError) {
      setVoiceProfileCredentialError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load voice profile credential status",
      );
    }
  }, []);

  useEffect(() => {
    if (!hasActiveVoiceProfileTargets) {
      return;
    }
    const timer = globalThis.setInterval(() => {
      void refreshVoiceProfiles({ silent: true });
    }, 1500);
    return () => {
      globalThis.clearInterval(timer);
    };
  }, [hasActiveVoiceProfileTargets, refreshVoiceProfiles]);

  const handleCloneResearchModule = useCallback(
    async (moduleId: string) => {
      setCloningResearchModuleId(moduleId);
      setResearchModuleError(null);
      try {
        const module = await cloneResearchModule(moduleId);
        setResearchModules((currentModules) => [
          ...currentModules.filter((item) => item.id !== module.id),
          module,
        ]);
        await refreshResearchModules();
      } catch (caughtError) {
        setResearchModuleError(
          caughtError instanceof Error ? caughtError.message : "Unable to clone research module",
        );
      } finally {
        setCloningResearchModuleId(null);
      }
    },
    [refreshResearchModules],
  );

  const handleHideResearchPrompt = useCallback(() => {
    localStorage.setItem(RESEARCH_MODULE_PROMPT_HIDDEN_KEY, "1");
    setIsResearchPromptHidden(true);
  }, []);

  const handleBuildVoiceProfileArtifact = useCallback(
    async (profileId: string, moduleId: string, timeoutSeconds?: number) => {
      setBuildingArtifactKey(`${profileId}:${moduleId}`);
      setProfileError(null);
      try {
        const profile =
          moduleId === "kokoro-clone"
            ? await queueVoiceProfileTarget(profileId, moduleId, true)
            : await buildVoiceProfileArtifact(profileId, moduleId, timeoutSeconds);
        setVoiceProfiles((currentProfiles) =>
          upsertVoiceProfileByCreatedAt(currentProfiles, profile),
        );
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to prepare voice profile target",
        );
      } finally {
        setBuildingArtifactKey(null);
      }
    },
    [],
  );

  const handleCancelVoiceProfileSource = useCallback(async (sourceId: string) => {
    setCancelingProfileSourceId(sourceId);
    setProfileError(null);
    try {
      const source = await cancelVoiceProfileSource(sourceId);
      setProfileSource(source);
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error ? caughtError.message : "Unable to cancel source analysis",
      );
    } finally {
      setCancelingProfileSourceId(null);
    }
  }, []);

  const handleCancelVoiceProfileTarget = useCallback(
    async (profileId: string, targetId: string) => {
      const key = `${profileId}:${targetId}`;
      setCancelingTargetKey(key);
      setProfileError(null);
      try {
        const profile = await cancelVoiceProfileTarget(profileId, targetId);
        setVoiceProfiles((currentProfiles) =>
          upsertVoiceProfileByCreatedAt(currentProfiles, profile),
        );
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to cancel target preparation",
        );
      } finally {
        setCancelingTargetKey(null);
      }
    },
    [],
  );

  const handleSaveHuggingFaceTokenAndValidate = useCallback(
    async (profileId: string, targetId: string, token: string) => {
      const saveKey = `${profileId}:${targetId}`;
      setSavingHuggingFaceTokenKey(saveKey);
      setVoiceProfileCredentialError(null);
      try {
        const status = await saveHuggingFaceToken(token);
        setVoiceProfileCredentials(status);
        await handleBuildVoiceProfileArtifact(profileId, targetId);
      } catch (caughtError) {
        setVoiceProfileCredentialError(
          caughtError instanceof Error ? caughtError.message : "Unable to save Hugging Face token",
        );
      } finally {
        setSavingHuggingFaceTokenKey(null);
      }
    },
    [handleBuildVoiceProfileArtifact],
  );

  const handleClearLocalHuggingFaceToken = useCallback(async () => {
    setIsClearingHuggingFaceToken(true);
    setVoiceProfileCredentialError(null);
    try {
      setVoiceProfileCredentials(await clearHuggingFaceToken());
    } catch (caughtError) {
      setVoiceProfileCredentialError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to clear local Hugging Face token",
      );
    } finally {
      setIsClearingHuggingFaceToken(false);
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    setProjectError(null);
    try {
      const nextProjects = await listProjects();
      setProjects(nextProjects);
      setActiveProjectId((currentProjectId) => {
        const storedProjectId = uiMemoryRef.current.rememberLastProject
          ? localStorage.getItem(ACTIVE_PROJECT_ID_STORAGE_KEY)
          : null;
        const candidate =
          currentProjectId.trim().length > 0 ? currentProjectId : (storedProjectId ?? "default");
        const resolved = nextProjects.some((project) => project.id === candidate)
          ? candidate
          : (nextProjects[0]?.id ?? "default");
        rememberActiveProjectId(resolved);
        return resolved;
      });
    } catch (caughtError) {
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to load projects",
      );
    }
  }, [rememberActiveProjectId]);

  const refreshProjectJobs = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectJobs([]);
      return;
    }
    try {
      const jobs = await listProjectJobs(projectId);
      setProjectJobs(jobs);
      setProjectError(null);
    } catch (caughtError) {
      setProjectJobs([]);
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to load project jobs",
      );
    }
  }, []);

  const refreshBookSources = useCallback(
    async (projectId: string) => {
      if (projectId.trim().length === 0) {
        setBookSources([]);
        setSelectedBookSourceId(null);
        setSelectedBookScope(null);
        setBookScopeContent(null);
        return;
      }
      try {
        const books = await listProjectBookSources(projectId);
        setBookSources(books);
        setSelectedBookSourceId((currentId) => {
          if (currentId && books.some((book) => book.id === currentId)) {
            return currentId;
          }
          return books[0]?.id ?? null;
        });
        setSelectedBookScope((currentScope) => currentScope);
        setBookSourceError(null);
      } catch (caughtError) {
        setBookSources([]);
        setSelectedBookSourceId(null);
        setSelectedBookScope(null);
        setBookScopeContent(null);
        if (isApiNotFoundError(caughtError)) {
          setBookSourceError(null);
          void refreshProjects();
          return;
        }
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load book sources"));
      }
    },
    [refreshProjects],
  );

  const refreshPreparedSources = useCallback(
    async (projectId: string) => {
      if (projectId.trim().length === 0) {
        setPreparedSources([]);
        setSelectedPreparedSourceId(null);
        return;
      }
      try {
        const sources = await listPreparedSources(projectId);
        setPreparedSources((currentSources) =>
          mergePreparedSourcesPreservingFullContent(currentSources, sources),
        );
        setSelectedPreparedSourceId((currentId) => {
          if (currentId && sources.some((source) => source.id === currentId)) {
            return currentId;
          }
          return sources[0]?.id ?? null;
        });
        setSourcePrepError(null);
      } catch (caughtError) {
        setPreparedSources([]);
        setSelectedPreparedSourceId(null);
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(null);
          void refreshProjects();
          return;
        }
        setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared sources"));
      }
    },
    [refreshProjects],
  );

  const refreshProjectProgress = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectProgress([]);
      return;
    }
    try {
      setProjectProgress(await listProjectProgress(projectId));
    } catch {
      setProjectProgress([]);
    }
  }, []);

  const refreshProjectStorage = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setProjectStorage(null);
      return;
    }
    try {
      setProjectStorage(await getProjectStorageSummary(projectId));
      setProjectStorageError(null);
    } catch (caughtError) {
      setProjectStorage(null);
      setProjectStorageError(
        caughtError instanceof Error ? caughtError.message : "Unable to load project storage",
      );
    }
  }, []);

  const refreshSpeechPolicyProfiles = useCallback(async () => {
    try {
      const definition = await getSpeechPolicyDefinition();
      setSpeechPolicyDefinition(definition);
      setSpeechPolicyProfiles(definition.profiles);
      setSpeechPolicyError(null);
    } catch (caughtError) {
      setSpeechPolicyDefinition(DEFAULT_SPEECH_POLICY_DEFINITION);
      try {
        setSpeechPolicyProfiles(await listSpeechPolicyProfiles());
      } catch {
        setSpeechPolicyProfiles(DEFAULT_SPEECH_POLICY_DEFINITION.profiles);
      }
      setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to load speech profiles"));
    }
  }, []);

  const refreshProjectSpeechPolicy = useCallback(async (projectId: string) => {
    if (projectId.trim().length === 0) {
      setSpeechPolicyProfile(DEFAULT_SPEECH_POLICY_PROFILE);
      setCustomSpeechPolicyProfiles([]);
      return;
    }
    try {
      const settings = await getProjectSpeechPolicy(projectId);
      setSpeechPolicyProfile(normalizeSpeechPolicyProfile(settings.profile));
      setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
      setSpeechPolicyError(null);
    } catch (caughtError) {
      setSpeechPolicyProfile(DEFAULT_SPEECH_POLICY_PROFILE);
      setCustomSpeechPolicyProfiles([]);
      setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to load project speech policy"));
    }
  }, []);

  const refreshProfileSourceDiagnostics = useCallback(async () => {
    try {
      const diagnostics = await getVoiceProfileSourceDiagnostics();
      setProfileSourceDiagnostics(diagnostics);
    } catch {
      setProfileSourceDiagnostics(null);
    }
  }, []);

  const refreshTTSEngines = useCallback(async () => {
    try {
      const engines = await listTTSEngines();
      setTTSEngines(engines);
      setTTSEngineError(null);
    } catch (caughtError) {
      setTTSEngineError(
        caughtError instanceof Error ? caughtError.message : "Unable to load TTS engines",
      );
    }
  }, []);

  const selectVoiceProfile = useCallback((profileId: string) => {
    setSelectedVoiceProfileId(profileId);
    localStorage.setItem(VOICE_PROFILE_ID_STORAGE_KEY, profileId);
  }, []);

  const clearVoiceProfileSelection = useCallback(() => {
    setSelectedVoiceProfileId("");
    localStorage.removeItem(VOICE_PROFILE_ID_STORAGE_KEY);
  }, []);

  const handleSpeechPolicyProfileChange = useCallback(
    async (profile: string) => {
      const normalizedProfile = normalizeSpeechPolicyProfile(profile);
      setSpeechPolicyProfile(normalizedProfile);
      setSpeechPolicyError(null);
      try {
        const settings = await updateProjectSpeechPolicy(activeProjectId, normalizedProfile);
        const storedProfile = normalizeSpeechPolicyProfile(settings.profile);
        setSpeechPolicyProfile(storedProfile);
        setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
        setProjects((currentProjects) =>
          currentProjects.map((project) =>
            project.id === activeProjectId
              ? { ...project, speechPolicyProfile: storedProfile }
              : project,
          ),
        );
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save speech profile"));
      }
    },
    [activeProjectId],
  );

  const handleSpeechPolicyOverridesChange = useCallback(
    (overrides: SpeechPolicyOverrides) => {
      const normalized = compactSpeechPolicyOverrides(overrides);
      setSpeechPolicyOverrides(normalized);
      saveSpeechPolicyOverrides(activeProjectId, normalized);
    },
    [activeProjectId],
  );

  const handleClearSpeechPolicyOverrides = useCallback(() => {
    setSpeechPolicyOverrides({});
    clearSpeechPolicyOverrides(activeProjectId);
  }, [activeProjectId]);

  const handleSavePreparedSourcePolicy = useCallback(
    async (sourceId: string, request: SourceSpeechPolicyUpdateRequest) => {
      const savingKey = `prepared:${sourceId}`;
      setSourcePolicySavingKey(savingKey);
      try {
        const source = await updatePreparedSourceSpeechPolicy(sourceId, request);
        setPreparedSources((currentSources) => upsertPreparedSource(currentSources, source));
        setJobPreparedSource((currentSource) =>
          currentSource?.id === source.id ? source : currentSource,
        );
        setSpeechPolicyError(null);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save source policy pin"));
      } finally {
        setSourcePolicySavingKey((currentKey) => (currentKey === savingKey ? null : currentKey));
      }
    },
    [],
  );

  const handleClearPreparedSourcePolicy = useCallback(
    async (sourceId: string) => {
      await handleSavePreparedSourcePolicy(sourceId, { clear: true });
    },
    [handleSavePreparedSourcePolicy],
  );

  const handleSaveBookSourcePolicy = useCallback(
    async (bookId: string, request: SourceSpeechPolicyUpdateRequest) => {
      const savingKey = `book:${bookId}`;
      setSourcePolicySavingKey(savingKey);
      try {
        const book = await updateBookSourceSpeechPolicy(bookId, request);
        setBookSources((currentBooks) => [
          book,
          ...currentBooks.filter((item) => item.id !== book.id),
        ]);
        setBookScopeContent((currentContent) =>
          currentContent?.bookSourceId === book.id ? null : currentContent,
        );
        setSpeechPolicyError(null);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save source policy pin"));
      } finally {
        setSourcePolicySavingKey((currentKey) => (currentKey === savingKey ? null : currentKey));
      }
    },
    [],
  );

  const handleClearBookSourcePolicy = useCallback(
    async (bookId: string) => {
      await handleSaveBookSourcePolicy(bookId, { clear: true });
    },
    [handleSaveBookSourcePolicy],
  );

  const applyProjectSpeechPolicyState = useCallback(
    (settings: Awaited<ReturnType<typeof getProjectSpeechPolicy>>) => {
      const storedProfile = normalizeSpeechPolicyProfile(settings.profile);
      setSpeechPolicyProfile(storedProfile);
      setCustomSpeechPolicyProfiles(settings.customProfiles ?? []);
      setProjects((currentProjects) =>
        currentProjects.map((project) =>
          project.id === activeProjectId
            ? {
                ...project,
                speechPolicyProfile: storedProfile,
                speechPolicyProfiles: settings.customProfiles ?? [],
              }
            : project,
        ),
      );
    },
    [activeProjectId],
  );

  const handleCreateCustomSpeechPolicyProfile = useCallback(
    async (name: string, settings: SpeechPolicySettings, baseProfile: string) => {
      setSpeechPolicyError(null);
      try {
        const response = await createCustomSpeechPolicyProfile(activeProjectId, {
          baseProfile,
          name,
          settings,
        });
        applyProjectSpeechPolicyState(response);
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to save custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const handleUpdateCustomSpeechPolicyProfile = useCallback(
    async (
      profileId: string,
      name: string,
      settings: SpeechPolicySettings,
      baseProfile: string,
    ) => {
      setSpeechPolicyError(null);
      try {
        applyProjectSpeechPolicyState(
          await updateCustomSpeechPolicyProfile(activeProjectId, profileId, {
            baseProfile,
            name,
            settings,
          }),
        );
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to update custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const handleDeleteCustomSpeechPolicyProfile = useCallback(
    async (profileId: string) => {
      setSpeechPolicyError(null);
      try {
        applyProjectSpeechPolicyState(
          await deleteCustomSpeechPolicyProfile(activeProjectId, profileId),
        );
        setSpeechPolicyOverrides({});
        clearSpeechPolicyOverrides(activeProjectId);
      } catch (caughtError) {
        setSpeechPolicyError(formatErrorMessage(caughtError, "Unable to delete custom profile"));
      }
    },
    [activeProjectId, applyProjectSpeechPolicyState],
  );

  const selectKokoroVoice = useCallback((voiceId: string) => {
    const nextVoiceId = findKokoroVoicepack(voiceId)?.id ?? DEFAULT_KOKORO_VOICE_ID;
    setSelectedKokoroVoiceId(nextVoiceId);
    localStorage.setItem(KOKORO_VOICE_STORAGE_KEY, nextVoiceId);
  }, []);

  const resetPlaybackSurface = useCallback(() => {
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
  }, []);

  const clearMissingBookSource = useCallback((bookId: string | null) => {
    if (bookId) {
      setBookSources(removeBookSourceById(bookId));
    }
    setSelectedBookSourceId(null);
    setSelectedBookScope(null);
    setBookScopeContent(null);
    setBookSourceError(
      "That book source is no longer available in this project. Import it again or select another source.",
    );
  }, []);

  const announceVoiceJobTerminalStatus = useCallback(
    (nextJob: VoiceJob) => {
      if (nextJob.status === "completed") {
        announcePolite(liveStatusMessages.audioGenerationCompleted());
        return;
      }
      if (nextJob.status === "failed") {
        announceAssertive(liveStatusMessages.audioGenerationFailed());
      }
    },
    [announceAssertive, announcePolite],
  );

  const announceSourceExtractionResult = useCallback(
    (source: BookSource | PreparedSource) => {
      if (source.status === "ready") {
        announcePolite(liveStatusMessages.sourceExtractionCompleted());
        return;
      }
      announceAssertive(liveStatusMessages.sourceExtractionFailed());
    },
    [announceAssertive, announcePolite],
  );

  const applyJobStatusState = useCallback((nextJob: VoiceJob) => {
    if (nextJob.status === "completed") {
      setRequestState("complete");
      setError(null);
      return;
    }
    if (nextJob.status === "failed") {
      setRequestState("error");
      setError(nextJob.error ?? "Voice job failed");
      return;
    }
    if (nextJob.status === "cancelled") {
      setRequestState("cancelled");
      setError(nextJob.error ?? "Voice job cancelled");
      return;
    }
    setRequestState("running");
    setError(null);
  }, []);

  const clearVisibleProjectWorkspace = useCallback(
    (projectId: string) => {
      const currentUiMemory = uiMemoryRef.current;
      clearProjectWorkspaceState(projectId);
      setText("");
      setJob(null);
      setRequestState("idle");
      setError(null);
      setProfileSource(null);
      setBookSources([]);
      setSelectedBookSourceId(null);
      setSelectedBookScope(null);
      setBookScopeContent(null);
      setPreparedSources([]);
      setSelectedPreparedSourceId(null);
      setSourcePrepError(null);
      setSourceMode("text");
      setWorkspaceContext(() =>
        createWorkspaceContext({
          layoutMode: resolveWorkspaceLayoutMode(currentUiMemory, projectId),
          speechPolicyProfile,
          voiceProfileId: selectedVoiceProfileId,
        }),
      );
      setActiveReviewPane(resolveReviewPane(currentUiMemory, projectId));
      setProjectProgress([]);
      setActivePlaybackSession(null);
      setPendingPlaybackResume(null);
      setBookSourceError(null);
      setIsBookCinemaOpen(false);
      resetPlaybackSurface();
      setProjectStateReadyId(projectId);
    },
    [resetPlaybackSurface, selectedVoiceProfileId, speechPolicyProfile],
  );

  const restoreProjectWorkspace = useCallback(
    async (projectId: string) => {
      const currentUiMemory = uiMemoryRef.current;
      setProjectStateReadyId(null);
      setError(null);
      setProfileSource(null);
      const hashPosition = parseBookCinemaHash(globalThis.location.hash);
      if (hashPosition?.bookSourceId) {
        setSelectedBookSourceId(hashPosition.bookSourceId);
      } else {
        setSelectedBookSourceId(null);
        setSelectedBookScope(null);
      }
      setBookScopeContent(null);
      setActivePlaybackSession(null);
      setPendingPlaybackResume(null);
      resetPlaybackSurface();
      const savedState = loadProjectWorkspaceState(projectId);
      setText(savedState.text);
      setSourceMode(savedState.sourceMode);
      if (savedState.preparedSourceId) {
        setSelectedPreparedSourceId(savedState.preparedSourceId);
      }
      if (savedState.voiceProfileId) {
        setSelectedVoiceProfileId(savedState.voiceProfileId);
      }
      if (savedState.speechPolicyProfile) {
        setSpeechPolicyProfile(savedState.speechPolicyProfile);
      }
      setActiveReviewPane(resolveReviewPane(currentUiMemory, projectId));
      let telepromptReturnStage: Exclude<WorkspaceStage, "teleprompt"> = "review";
      if (savedState.stage === "teleprompt") {
        telepromptReturnStage = resolveTelepromptReturnStage(currentUiMemory, projectId);
      } else if (savedState.stage === "preview") {
        telepromptReturnStage = "preview";
      }
      setWorkspaceContext((currentContext) =>
        createWorkspaceContext({
          ...currentContext,
          activeBlockId: savedState.activeBlockId,
          layoutMode: resolveWorkspaceLayoutMode(currentUiMemory, projectId),
          sourceId: savedState.preparedSourceId ?? savedState.bookSourceId,
          sourceType: savedState.sourceType,
          speechPolicyProfile: savedState.speechPolicyProfile ?? currentContext.speechPolicyProfile,
          stage: savedState.stage,
          telepromptReturnStage,
          voiceProfileId: savedState.voiceProfileId ?? currentContext.voiceProfileId,
        }),
      );
      if (hashPosition?.bookSourceId) {
        setSelectedBookSourceId(hashPosition.bookSourceId);
      } else {
        setSelectedBookSourceId(savedState.bookSourceId);
        setSelectedBookScope(savedState.bookScope);
      }

      if (!savedState.jobId) {
        setJob(null);
        setRequestState("idle");
        setProjectStateReadyId(projectId);
        return;
      }

      try {
        const restoredJob = await getVoiceJob(savedState.jobId);
        if ((restoredJob.projectId || "default") !== projectId) {
          throw new Error("Stored job belongs to another project.");
        }
        setJob(restoredJob);
        if (typeof restoredJob.inputText === "string") {
          setText(restoredJob.inputText);
        }
        applyJobStatusState(restoredJob);
      } catch {
        saveProjectWorkspaceState(projectId, {
          activeBlockId: savedState.activeBlockId,
          bookScope: savedState.bookScope,
          bookSourceId: savedState.bookSourceId,
          jobId: null,
          preparedSourceId: savedState.preparedSourceId,
          readingPosition: savedState.readingPosition,
          sourceMode: savedState.sourceMode,
          sourceType: savedState.sourceType,
          speechPolicyProfile: savedState.speechPolicyProfile,
          stage: savedState.stage,
          text: savedState.text,
          voiceProfileId: savedState.voiceProfileId,
        });
        setJob(null);
        setRequestState("idle");
      } finally {
        setProjectStateReadyId(projectId);
      }
    },
    [applyJobStatusState, resetPlaybackSurface],
  );

  const selectProject = useCallback(
    (projectId: string) => {
      if (projectId === activeProjectId) {
        return;
      }
      if (!activeDemoProjectId && projectStateReadyId === activeProjectId) {
        saveProjectWorkspaceState(activeProjectId, {
          activeBlockId: workspaceContext.activeBlockId,
          bookScope: selectedBookScope,
          bookSourceId: selectedBookSourceId,
          jobId: job?.id ?? null,
          preparedSourceId: selectedPreparedSourceId,
          readingPosition: currentReadingPosition,
          sourceMode,
          sourceType: workspaceSourceType(sourceMode),
          speechPolicyProfile,
          stage: contentMode,
          text,
          voiceProfileId: selectedVoiceProfileId,
        });
      }
      setProjectStateReadyId(null);
      setActiveDemoProjectId(null);
      setActiveProjectId(projectId);
      rememberActiveProjectId(projectId);
    },
    [
      activeDemoProjectId,
      contentMode,
      activeProjectId,
      currentReadingPosition,
      job?.id,
      projectStateReadyId,
      selectedPreparedSourceId,
      selectedBookScope,
      selectedBookSourceId,
      selectedVoiceProfileId,
      sourceMode,
      speechPolicyProfile,
      text,
      rememberActiveProjectId,
      workspaceContext.activeBlockId,
    ],
  );

  const handleCreateProject = useCallback(
    async (name: string) => {
      setProjectError(null);
      try {
        const project = await createProject(name);
        setProjects((currentProjects) => [
          project,
          ...currentProjects.filter((item) => item.id !== project.id),
        ]);
        clearProjectWorkspaceState(project.id);
        selectProject(project.id);
        clearVisibleProjectWorkspace(project.id);
      } catch (caughtError) {
        setProjectError(
          caughtError instanceof Error ? caughtError.message : "Unable to create project",
        );
      }
    },
    [clearVisibleProjectWorkspace, selectProject],
  );

  const handleUiMemoryExportPreferences = useCallback(async () => {
    const { buildUiMemoryExportJson } = await import("./features/ui-memory/uiMemoryExport");
    return buildUiMemoryExportJson({
      lastProjectId: activeProjectId,
      readerAccessibilitySettings,
      readAlongPreferences,
      themeName,
      uiMemory,
    });
  }, [activeProjectId, readAlongPreferences, readerAccessibilitySettings, themeName, uiMemory]);

  const handleUiMemoryImportPreferences = useCallback(
    async (json: string): Promise<UiMemoryImportApplyResult> => {
      try {
        const { parseUiMemoryImportJson } = await import("./features/ui-memory/uiMemoryExport");
        const imported = parseUiMemoryImportJson(json);
        uiMemoryRef.current = imported.uiMemory;
        setUiMemory(imported.uiMemory);
        setTelepromptTheatreSettings(resolveTelepromptTheatreSettings(imported.uiMemory));
        if (imported.readerAccessibilitySettings) {
          setReaderAccessibilitySettings(imported.readerAccessibilitySettings);
        }
        if (imported.readAlongPreferences) {
          setReadAlongPreferences(imported.readAlongPreferences);
        }
        if (imported.themeName) {
          setThemeName(imported.themeName);
        }
        if (
          imported.lastProjectId &&
          imported.lastProjectId !== activeProjectId &&
          projects.some((project) => project.id === imported.lastProjectId)
        ) {
          selectProject(imported.lastProjectId);
        }
        return {
          message:
            "Preferences imported. Project content, generated audio, secrets, and model paths were not included.",
          ok: true,
        };
      } catch (caughtError) {
        return {
          message:
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to import UI preferences JSON.",
          ok: false,
        };
      }
    },
    [activeProjectId, projects, selectProject],
  );

  const handleTelepromptTheatreSettingsChange = useCallback(
    (settings: TelepromptTheatreSettings) => {
      const normalizedSettings = normalizeTelepromptTheatreSettings(settings);
      setTelepromptTheatreSettings(normalizedSettings);
      setUiMemory((currentMemory) => {
        const nextMemory = rememberTelepromptTheatreSettings(currentMemory, normalizedSettings);
        uiMemoryRef.current = nextMemory;
        return nextMemory;
      });
    },
    [],
  );

  const handleRenameProject = useCallback(async (id: string, name: string) => {
    setProjectError(null);
    try {
      const project = await renameProject(id, name);
      setProjects((currentProjects) =>
        currentProjects.map((item) => (item.id === project.id ? project : item)),
      );
    } catch (caughtError) {
      setProjectError(
        caughtError instanceof Error ? caughtError.message : "Unable to rename project",
      );
    }
  }, []);

  const handleDeleteProject = useCallback(
    async (id: string) => {
      setProjectError(null);
      try {
        await deleteProject(id);
        clearProjectWorkspaceState(id);
        const remainingProjects = projects.filter((project) => project.id !== id);
        setProjects(remainingProjects);
        if (id === activeProjectId) {
          const nextProjectId = remainingProjects[0]?.id ?? "default";
          clearVisibleProjectWorkspace(nextProjectId);
          setActiveProjectId(nextProjectId);
          rememberActiveProjectId(nextProjectId);
        }
        void refreshProjects();
      } catch (caughtError) {
        setProjectError(
          caughtError instanceof Error ? caughtError.message : "Unable to delete project",
        );
      }
    },
    [
      activeProjectId,
      clearVisibleProjectWorkspace,
      projects,
      refreshProjects,
      rememberActiveProjectId,
    ],
  );

  const applyVoiceJobToState = useCallback(
    (nextJob: VoiceJob) => {
      const nextProjectId = nextJob.projectId || activeProjectId;
      let nextSourceMode: SourceMode = "text";
      if (nextJob.bookSourceId) {
        nextSourceMode = "book";
      } else if (nextJob.preparedSourceId) {
        nextSourceMode = "fileUrl";
      }
      const nextSourceType = workspaceSourceType(nextSourceMode);
      setJob(nextJob);
      setSelectedBookSourceId(nextJob.bookSourceId ?? null);
      setSelectedBookScope(nextJob.bookScope ?? null);
      setSelectedPreparedSourceId(nextJob.preparedSourceId ?? null);
      setSourceMode(nextSourceMode);
      setWorkspaceContext((currentContext) =>
        transitionWorkspaceContextForStageAction(
          withWorkspaceSource(
            currentContext,
            nextSourceType,
            nextJob.preparedSourceId ?? nextJob.bookSourceId ?? null,
          ),
          "previewSpeech",
        ),
      );
      if (nextProjectId !== activeProjectId) {
        setActiveProjectId(nextProjectId);
        rememberActiveProjectId(nextProjectId);
      }
      setProjectStateReadyId(nextProjectId);
      saveProjectWorkspaceState(nextProjectId, {
        activeBlockId: workspaceContext.activeBlockId,
        bookScope: nextJob.bookScope ?? null,
        bookSourceId: nextJob.bookSourceId ?? null,
        jobId: nextJob.id,
        preparedSourceId: nextJob.preparedSourceId ?? null,
        readingPosition:
          nextJob.bookSourceId && nextJob.bookScope
            ? {
                activeWordIndex: 0,
                bookSourceId: nextJob.bookSourceId,
                scopeKey: bookScopeKey(nextJob.bookScope),
              }
            : null,
        sourceMode: nextSourceMode,
        sourceType: nextSourceType,
        speechPolicyProfile,
        stage: "preview",
        text: typeof nextJob.inputText === "string" ? nextJob.inputText : text,
        voiceProfileId: selectedVoiceProfileId,
      });
      if (typeof nextJob.inputText === "string") {
        setText(nextJob.inputText);
      }
      applyJobStatusState(nextJob);
    },
    [
      activeProjectId,
      applyJobStatusState,
      rememberActiveProjectId,
      selectedVoiceProfileId,
      speechPolicyProfile,
      text,
      workspaceContext.activeBlockId,
    ],
  );

  const handleSelectJob = useCallback(
    async (jobId: string) => {
      if (!jobId) {
        return;
      }
      try {
        const nextJob = await getVoiceJob(jobId);
        applyVoiceJobToState(nextJob);
      } catch (caughtError) {
        setProjectError(caughtError instanceof Error ? caughtError.message : "Unable to load job");
      }
    },
    [applyVoiceJobToState],
  );

  const hydratePreparedSourceForResume = useCallback(
    async (progress: PlaybackProgress) => {
      if (!progress.preparedSourceId) {
        return;
      }
      setSelectedPreparedSourceId(progress.preparedSourceId);
      const preparedSource = preparedSources.find(
        (source) => source.id === progress.preparedSourceId,
      );
      if (!isPreparedSourceDisplayIncomplete(preparedSource ?? null)) {
        return;
      }
      try {
        const hydratedSource = await getPreparedSource(progress.preparedSourceId);
        setPreparedSources((currentSources) => [
          hydratedSource,
          ...currentSources.filter((source) => source.id !== hydratedSource.id),
        ]);
      } catch (caughtError) {
        setSourcePrepError(formatErrorMessage(caughtError, "Unable to load prepared source"));
      }
    },
    [preparedSources],
  );

  const handleResumeProgress = useCallback(
    async (progress: PlaybackProgress, seconds = progress.currentTimeSec) => {
      const startedAt = performance.now();
      setResumeFallbackNotice(null);
      setResumeRestoreStartedAt(startedAt);
      readerResumeTiming.start({
        jobId: progress.jobId ?? null,
        targetId: progress.targetId,
      });
      try {
        if (progress.bookSourceId) {
          setSelectedBookSourceId(progress.bookSourceId);
          setSelectedBookScope(resolveResumeBookScope(progress, bookSources, selectedBookSource));
          setBookCinemaThemeName(themeName === "light" ? "dark" : themeName);
          setIsBookCinemaOpen(true);
        }
        await hydratePreparedSourceForResume(progress);
        if (progress.jobId && progress.jobId !== job?.id) {
          await handleSelectJob(progress.jobId);
        }
        const locatorSeconds = secondsForReadingPosition(highlightMap, progress.readingPosition);
        const targetSeconds = Math.max(0, locatorSeconds ?? seconds);
        setPlaybackCursorSec(targetSeconds);
        setPendingPlaybackResume({
          autoplay: true,
          readingPosition: progress.readingPosition,
          seconds: targetSeconds,
        });
      } catch (caughtError) {
        readerResumeTiming.cancel();
        setResumeRestoreStartedAt(null);
        setError(formatErrorMessage(caughtError, "Unable to resume saved progress"));
      }
    },
    [
      bookSources,
      handleSelectJob,
      highlightMap,
      hydratePreparedSourceForResume,
      job?.id,
      readerResumeTiming,
      selectedBookSource,
      themeName,
    ],
  );

  const handleBundleImported = useCallback(
    async (result: ProjectBundleImportResult) => {
      setProjects((currentProjects) => [
        result.project,
        ...currentProjects.filter((project) => project.id !== result.project.id),
      ]);
      selectProject(result.project.id);
      if (result.profiles.length > 0) {
        setVoiceProfiles((currentProfiles) => {
          const importedIds = new Set(result.profiles.map((profile) => profile.id));
          return [
            ...result.profiles,
            ...currentProfiles.filter((profile) => !importedIds.has(profile.id)),
          ];
        });
      }
      await Promise.all([
        refreshBookSources(result.project.id),
        refreshProjects(),
        refreshVoiceProfiles(),
        refreshProjectJobs(result.project.id),
      ]);
    },
    [refreshBookSources, refreshProjectJobs, refreshProjects, refreshVoiceProfiles, selectProject],
  );

  const handleImportBookSource = useCallback(
    async (files: File[], options: BookSourceImportOptions = {}) => {
      setIsImportingBookSource(true);
      setBookSourceError(null);
      announcePolite(liveStatusMessages.sourceExtractionStarted());
      try {
        const book = await createBookSource(activeProjectId, files, options);
        setBookSources((currentBooks) => [
          book,
          ...currentBooks.filter((item) => item.id !== book.id),
        ]);
        setSelectedBookSourceId(book.id);
        const defaultScope = resolveDefaultBookScope(book);
        setSelectedBookScope(defaultScope);
        setSourceMode("book");
        setContentMode("review");
        if (book.status === "ready") {
          setText(bookScopeText(book, defaultScope));
        }
        announceSourceExtractionResult(book);
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setBookSourceError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and import again.",
          );
          void refreshProjects();
          announceAssertive(liveStatusMessages.sourceExtractionFailed());
          return;
        }
        setBookSourceError(
          caughtError instanceof Error ? caughtError.message : "Unable to import book source",
        );
        announceAssertive(liveStatusMessages.sourceExtractionFailed());
      } finally {
        setIsImportingBookSource(false);
      }
    },
    [
      activeProjectId,
      announceAssertive,
      announcePolite,
      announceSourceExtractionResult,
      refreshProjects,
      setContentMode,
    ],
  );

  const handlePrepareSourceFile = useCallback(
    async (
      file: File,
      markdownParseMode: MarkdownParseMode = "strict",
      preparationTarget: IntakePreparationTarget = "auto",
    ) => {
      setIsPreparingSource(true);
      setSourcePrepError(null);
      announcePolite(liveStatusMessages.sourceExtractionStarted());
      try {
        const extension = file.name.toLowerCase().split(".").pop() ?? "";
        if (
          preparationTarget === "book" ||
          (preparationTarget === "auto" && isBookSourceExtension(extension))
        ) {
          const book = await createBookSource(activeProjectId, file);
          setBookSources((currentBooks) => [
            book,
            ...currentBooks.filter((item) => item.id !== book.id),
          ]);
          setSelectedBookSourceId(book.id);
          setSelectedBookScope(resolveDefaultBookScope(book));
          setSourceMode("book");
          setContentMode("review");
          announceSourceExtractionResult(book);
          return;
        }
        const source = await createPreparedSource(activeProjectId, file, { markdownParseMode });
        setPreparedSources((currentSources) => [
          source,
          ...currentSources.filter((item) => item.id !== source.id),
        ]);
        setSelectedPreparedSourceId(source.id);
        setSourceMode("fileUrl");
        setContentMode("review");
        if (source.speechText) {
          setText(source.speechText);
        }
        announceSourceExtractionResult(source);
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and prepare the file again.",
          );
          void refreshProjects();
          announceAssertive(liveStatusMessages.sourceExtractionFailed());
          return;
        }
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to prepare source file",
        );
        announceAssertive(liveStatusMessages.sourceExtractionFailed());
      } finally {
        setIsPreparingSource(false);
      }
    },
    [
      activeProjectId,
      announceAssertive,
      announcePolite,
      announceSourceExtractionResult,
      refreshProjects,
      setContentMode,
    ],
  );
  const handlePrepareCinemaSourceFile = useCallback(
    async (file: File) => {
      setIsPreparingSource(true);
      setSourcePrepError(null);
      announcePolite(liveStatusMessages.sourceExtractionStarted());
      try {
        const source = await createPreparedSource(activeProjectId, file, {
          markdownParseMode: "strict",
        });
        setPreparedSources((currentSources) => [
          source,
          ...currentSources.filter((item) => item.id !== source.id),
        ]);
        setSelectedPreparedSourceId(source.id);
        setPreparedSourceCinemaSourceId(source.id);
        setSourceMode("fileUrl");
        setContentMode("review");
        if (source.speechText) {
          setText(source.speechText);
        }
        announceSourceExtractionResult(source);
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and prepare the file again.",
          );
          void refreshProjects();
          announceAssertive(liveStatusMessages.sourceExtractionFailed());
          return;
        }
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to prepare that source",
        );
        announceAssertive(liveStatusMessages.sourceExtractionFailed());
      } finally {
        setIsPreparingSource(false);
      }
    },
    [
      activeProjectId,
      announceAssertive,
      announcePolite,
      announceSourceExtractionResult,
      refreshProjects,
      setContentMode,
    ],
  );
  const handleSelectPreparedCinemaSource = useCallback(
    (sourceId: string) => {
      const source = preparedSources.find((item) => item.id === sourceId);
      if (!source) {
        return;
      }
      setSelectedPreparedSourceId(source.id);
      openPreparedSourceCinema(source);
    },
    [openPreparedSourceCinema, preparedSources],
  );

  const handlePrepareSourceUrl = useCallback(
    async (
      url: string,
      markdownParseMode: MarkdownParseMode = "strict",
      preparationTarget: IntakePreparationTarget = "auto",
      htmlContainerSelector?: string,
    ) => {
      setIsPreparingSource(true);
      setSourcePrepError(null);
      announcePolite(liveStatusMessages.sourceExtractionStarted());
      try {
        const lowerURL = url.toLowerCase().split("?")[0] ?? "";
        if (
          preparationTarget === "book" ||
          (preparationTarget === "auto" && isBookSourceURL(lowerURL))
        ) {
          const book = await createBookSourceFromUrl(activeProjectId, url);
          setBookSources((currentBooks) => [
            book,
            ...currentBooks.filter((item) => item.id !== book.id),
          ]);
          setSelectedBookSourceId(book.id);
          setSelectedBookScope(resolveDefaultBookScope(book));
          setSourceMode("book");
          setContentMode("review");
          announceSourceExtractionResult(book);
          return;
        }
        const source = await createPreparedSource(activeProjectId, {
          htmlContainerSelector,
          kind: "url",
          markdownParseMode,
          url,
          sourceName: url,
        });
        setPreparedSources((currentSources) => [
          source,
          ...currentSources.filter((item) => item.id !== source.id),
        ]);
        setSelectedPreparedSourceId(source.id);
        setSourceMode("fileUrl");
        setContentMode("review");
        if (source.speechText) {
          setText(source.speechText);
        }
        announceSourceExtractionResult(source);
      } catch (caughtError) {
        if (isApiNotFoundError(caughtError)) {
          setSourcePrepError(
            "The selected project is no longer available. I refreshed the workspace; choose a project and prepare the URL again.",
          );
          void refreshProjects();
          announceAssertive(liveStatusMessages.sourceExtractionFailed());
          return;
        }
        setSourcePrepError(
          caughtError instanceof Error ? caughtError.message : "Unable to prepare source URL",
        );
        announceAssertive(liveStatusMessages.sourceExtractionFailed());
      } finally {
        setIsPreparingSource(false);
      }
    },
    [
      activeProjectId,
      announceAssertive,
      announcePolite,
      announceSourceExtractionResult,
      refreshProjects,
      setContentMode,
    ],
  );

  const handleRerunWebsiteExtraction = useCallback(
    (source: PreparedSource, containerSelector: string) => {
      if (!source.sourceUrl) {
        return;
      }
      void handlePrepareSourceUrl(
        source.sourceUrl,
        source.markdownParseMode ?? "strict",
        "prepared",
        containerSelector,
      );
    },
    [handlePrepareSourceUrl],
  );

  const handleUsePreparedSource = useCallback(
    async (source: PreparedSource) => {
      setSelectedPreparedSourceId(source.id);
      setSourceMode("fileUrl");
      setContentMode("review");
      let nextSource = source;
      if (isPreparedSourceDisplayIncomplete(source)) {
        try {
          nextSource = await getPreparedSource(source.id);
          setPreparedSources((currentSources) => [
            nextSource,
            ...currentSources.filter((item) => item.id !== nextSource.id),
          ]);
        } catch (caughtError) {
          setSourcePrepError(
            caughtError instanceof Error ? caughtError.message : "Unable to load prepared source",
          );
          return;
        }
      }
      if (nextSource.speechText) {
        setText(nextSource.speechText);
      }
    },
    [setContentMode],
  );

  const handleInspectContentIR = useCallback(
    async (sourceId: string, title: string, previewSpeechPolicy = false) => {
      setContentIRTitle(title);
      setContentIRDocument(null);
      setContentIRError(null);
      setIsContentIROpen(true);
      setIsContentIRLoading(true);
      try {
        setContentIRDocument(
          previewSpeechPolicy
            ? await previewContentIRSpeechPolicy(sourceId, {
                ...sessionSpeechPolicyRequest(speechPolicyOverrides),
                locale: resolveRunLocale(runConfiguration),
                ttsEngine: runConfiguration.ttsEngine,
                voiceProfileId: selectedVoiceProfileId,
              })
            : await getContentIR(sourceId),
        );
      } catch (caughtError) {
        setContentIRError(formatErrorMessage(caughtError, "Unable to load content structure"));
      } finally {
        setIsContentIRLoading(false);
      }
    },
    [runConfiguration, selectedVoiceProfileId, speechPolicyOverrides],
  );

  const handleUseBookText = useCallback(
    (book: BookSource, scope: BookScope) => {
      const scopedText =
        bookScopeContent?.bookSourceId === book.id &&
        bookScopeKey(bookScopeContent.scope) === bookScopeKey(scope)
          ? bookScopeContent.text
          : bookScopeText(book, scope);
      if (book.status !== "ready" || !scopedText.trim()) {
        setBookSourceError(book.error ?? "Book source is not ready yet.");
        return;
      }
      setSelectedBookSourceId(book.id);
      setSelectedBookScope(scope);
      setSourceMode("book");
      setContentMode("review");
      setText(scopedText);
      setBookSourceError(null);
    },
    [bookScopeContent, setContentMode],
  );
  const openBookCinemaFromIntake = useCallback(
    (book?: BookSource, scope?: BookScope) => {
      const nextBook = book ?? selectedBookSource;
      if (nextBook?.status === "ready") {
        const nextScope = scope ?? resolveDefaultBookScope(nextBook);
        setSelectedBookSourceId(nextBook.id);
        setSelectedBookScope(nextScope);
        setSourceMode("book");
        setContentMode("review");
        setText(bookScopeText(nextBook, nextScope));
        setBookSourceError(null);
        bookCinemaOpenTiming.start({ target: "intake-book" });
        setBookCinemaThemeName(themeName === "light" ? "dark" : themeName);
        setIsBookCinemaOpen(true);
        return;
      }
      openSelectedBookCinema();
    },
    [bookCinemaOpenTiming, openSelectedBookCinema, selectedBookSource, setContentMode, themeName],
  );

  const handleReviewSourceCard = useCallback(
    (model: SourceCardModel) => {
      if (model.owner === "book") {
        const book = bookSources.find((source) => source.id === model.id);
        if (book) {
          handleUseBookText(book, resolveDefaultBookScope(book));
        }
        return;
      }
      const source = preparedSources.find((item) => item.id === model.id);
      if (source) {
        void handleUsePreparedSource(source);
      }
    },
    [bookSources, handleUseBookText, handleUsePreparedSource, preparedSources],
  );

  const handlePreviewSourceCard = useCallback(
    (model: SourceCardModel) => {
      if (model.owner === "book") {
        const book = bookSources.find((source) => source.id === model.id);
        if (book) {
          handleUseBookText(book, resolveDefaultBookScope(book));
          setContentMode("preview");
        }
        return;
      }
      const source = preparedSources.find((item) => item.id === model.id);
      if (source) {
        void handleUsePreparedSource(source).then(() => {
          setContentMode("preview");
        });
      }
    },
    [bookSources, handleUseBookText, handleUsePreparedSource, preparedSources, setContentMode],
  );

  const handleOpenSourceCardCinema = useCallback(
    (model: SourceCardModel) => {
      if (model.owner === "book") {
        const book = bookSources.find((source) => source.id === model.id);
        if (book) {
          openBookCinemaFromIntake(book, resolveDefaultBookScope(book));
        }
        return;
      }
      const source = preparedSources.find((item) => item.id === model.id);
      if (source) {
        openPreparedSourceCinema(source);
      }
    },
    [bookSources, openBookCinemaFromIntake, openPreparedSourceCinema, preparedSources],
  );

  const handlePlaybackControlsChange = useCallback((controls: PlaybackController | null) => {
    setPlaybackControls(controls ?? DISABLED_PLAYBACK_CONTROLLER);
  }, []);

  const handleGlobalPreviewVoiceChange = useCallback(
    (profileId: string) => {
      if (profileId === "default") {
        clearVoiceProfileSelection();
        return;
      }
      selectVoiceProfile(profileId);
    },
    [clearVoiceProfileSelection, selectVoiceProfile],
  );

  const handleGlobalPreviewRunModeChange = useCallback((runMode: RunMode) => {
    setRunConfiguration((currentConfiguration) => {
      const nextConfiguration = createRunConfiguration(runMode);
      return {
        ...nextConfiguration,
        engineOptions: currentConfiguration.engineOptions,
        ttsEngine: currentConfiguration.ttsEngine,
      };
    });
  }, []);

  const handleBookCinemaPlayPause = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    if (playbackControls.isPlaying) {
      playbackControls.pause();
      return;
    }
    void playbackControls.play();
  }, [playbackControls]);

  const handleBookCinemaRestart = useCallback(() => {
    if (!playbackControls.isAvailable) {
      return;
    }
    void playbackControls.restart();
  }, [playbackControls]);

  const handleBookCinemaSkip = useCallback(
    (seconds: number) => {
      playbackControls.skipBy?.(seconds);
    },
    [playbackControls],
  );

  const activeWordIndexForPlaybackProgress = useCallback(
    (currentJob: VoiceJob, currentTimeSec: number) => {
      if (highlightMap?.jobId === currentJob.id) {
        const cue = resolveHighlightCue(highlightMap, currentTimeSec);
        if (cue && cue.activeWordIndex >= 0) {
          return cue.activeWordIndex;
        }
      }
      if (selectedBookSource && currentJob.bookSourceId === selectedBookSource.id) {
        const bookIndex = resolveBookActiveWordIndex(
          selectedBookSource,
          currentJob,
          currentTimeSec,
          currentJob.bookScope ?? effectiveBookScope,
          bookScopeContent,
        );
        if (bookIndex >= 0) {
          return bookIndex;
        }
      }
      return activeWordIndexForProgress(currentJob, currentTimeSec);
    },
    [bookScopeContent, effectiveBookScope, highlightMap, selectedBookSource],
  );

  const readingPositionForPlaybackProgress = useCallback(
    (currentJob: VoiceJob, currentTimeSec: number): ReadingPosition | undefined => {
      if (highlightMap?.jobId === currentJob.id) {
        const cue = resolveHighlightCue(highlightMap, currentTimeSec);
        const position = readingPositionForHighlightCue(cue);
        if (position) {
          return position;
        }
      }
      if (!selectedBookSource || currentJob.bookSourceId !== selectedBookSource.id) {
        return undefined;
      }
      const scope = currentJob.bookScope ?? effectiveBookScope;
      if (!scope) {
        return undefined;
      }
      return {
        activeWordIndex: activeWordIndexForPlaybackProgress(currentJob, currentTimeSec),
        bookSourceId: selectedBookSource.id,
        scopeKey: bookScopeKey(scope),
      };
    },
    [activeWordIndexForPlaybackProgress, effectiveBookScope, highlightMap, selectedBookSource],
  );

  useEffect(() => {
    if (!isBookCinemaOpen || !selectedBookSource || !effectiveBookScope) {
      return;
    }
    let readingPosition: ReadingPosition | null | undefined = currentReadingPosition;
    if (job?.bookSourceId === selectedBookSource.id) {
      readingPosition = readingPositionForPlaybackProgress(job, playbackCursorSec);
    }
    if (!readingPosition) {
      return;
    }
    replaceBookCinemaHash(readingPosition);
  }, [
    currentReadingPosition,
    effectiveBookScope,
    isBookCinemaOpen,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    selectedBookSource,
  ]);

  const handleAddPlaybackBookmark = useCallback(async () => {
    if (!job) {
      return;
    }
    const targetId = progressTargetIdForJob(job);
    if (!targetId) {
      return;
    }
    const currentTimeSec = Math.max(0, playbackCursorSec);
    const durationSec = job.durationMs > 0 ? job.durationMs / 1000 : undefined;
    const readingPosition = readingPositionForPlaybackProgress(job, currentTimeSec);
    try {
      const progress = await updatePlaybackProgress(targetId, {
        activeWordIndex: activeWordIndexForPlaybackProgress(job, currentTimeSec),
        addBookmark: {
          activeWordIndex: activeWordIndexForPlaybackProgress(job, currentTimeSec),
          createdAt: new Date().toISOString(),
          currentTimeSec,
          id: `bookmark-${Date.now().toString(36)}`,
          label: formatDuration(Math.round(currentTimeSec * 1000)),
          readingPosition,
        },
        bookScope: job.bookScope,
        bookSourceId: job.bookSourceId,
        currentTimeSec,
        durationSec,
        jobId: job.id,
        preparedSourceId: job.preparedSourceId,
        projectId: job.projectId,
        readingPosition,
      });
      setProjectProgress((currentProgress) => [
        progress,
        ...currentProgress.filter((item) => item.targetId !== progress.targetId),
      ]);
      announcePolite(liveStatusMessages.bookmarkSaved());
    } catch {
      setError("Unable to save bookmark.");
      announceAssertive("Bookmark could not be saved.");
    }
  }, [
    activeWordIndexForPlaybackProgress,
    announceAssertive,
    announcePolite,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
  ]);

  useEffect(() => {
    const cachedProfileId = localStorage.getItem(VOICE_PROFILE_ID_STORAGE_KEY);
    if (cachedProfileId) {
      setSelectedVoiceProfileId(cachedProfileId);
    }
    void refreshVoiceProfiles();
    void refreshProjects();
    void refreshSpeechPolicyProfiles();
  }, [refreshProjects, refreshSpeechPolicyProfiles, refreshVoiceProfiles]);

  useEffect(() => {
    if (studioMode !== "voiceCloning" && !isHelpOpen && !isSettingsOpen) {
      return;
    }
    void refreshProfileSourceDiagnostics();
    void refreshResearchModules();
    void refreshTTSEngines();
    void refreshVoiceProfileCredentials();
  }, [
    isHelpOpen,
    isSettingsOpen,
    refreshProfileSourceDiagnostics,
    refreshResearchModules,
    refreshTTSEngines,
    refreshVoiceProfileCredentials,
    studioMode,
  ]);

  useEffect(() => {
    rememberActiveProjectId(activeProjectId);
    migrateLegacyWorkspaceState(activeProjectId);
    void refreshProjectJobs(activeProjectId);
    void refreshBookSources(activeProjectId);
    void refreshPreparedSources(activeProjectId);
    void refreshProjectProgress(activeProjectId);
    void refreshProjectStorage(activeProjectId);
    void refreshProjectSpeechPolicy(activeProjectId);
    void restoreProjectWorkspace(activeProjectId);
    setSpeechPolicyOverrides(loadSpeechPolicyOverrides(activeProjectId));
  }, [
    activeProjectId,
    refreshBookSources,
    refreshPreparedSources,
    refreshProjectJobs,
    refreshProjectProgress,
    refreshProjectStorage,
    refreshProjectSpeechPolicy,
    rememberActiveProjectId,
    restoreProjectWorkspace,
  ]);

  useEffect(() => {
    if (!selectedBookSource) {
      setSelectedBookScope(null);
      setBookScopeContent(null);
      return;
    }
    if (
      hashReadingPosition?.bookSourceId === selectedBookSource.id &&
      hashReadingPosition.scopeKey
    ) {
      const hashScope = scopeFromBookScopeKey(selectedBookSource, hashReadingPosition.scopeKey);
      if (JSON.stringify(hashScope) !== JSON.stringify(selectedBookScope)) {
        setSelectedBookScope(hashScope);
      }
      return;
    }
    const normalizedScope = normalizeBookScopeForBook(selectedBookSource, selectedBookScope);
    if (JSON.stringify(normalizedScope) !== JSON.stringify(selectedBookScope)) {
      setSelectedBookScope(normalizedScope);
    }
  }, [hashReadingPosition, selectedBookScope, selectedBookSource]);

  useEffect(() => {
    if (sourceMode !== "book" || selectedBookSource?.status !== "ready" || !effectiveBookScope) {
      setBookScopeContent(null);
      return;
    }
    // The request omits profile on purpose; this guard keeps backend-resolved previews fresh
    // after the saved project profile changes without sending it as a session profile.
    const projectPolicyProfile = normalizeSpeechPolicyProfile(speechPolicyProfile);
    if (!projectPolicyProfile) {
      return;
    }
    let isCurrent = true;
    void previewBookSourceScopeSpeechPolicy(selectedBookSource.id, {
      ...sessionSpeechPolicyRequest(speechPolicyOverrides),
      scope: effectiveBookScope,
      locale: resolveRunLocale(runConfiguration),
      ttsEngine: runConfiguration.ttsEngine,
      voiceProfileId: selectedVoiceProfileId,
    })
      .then((content) => {
        if (!isCurrent) {
          return;
        }
        setBookScopeContent(content);
        setBookSourceError(null);
      })
      .catch((caughtError: unknown) => {
        if (!isCurrent) {
          return;
        }
        setBookScopeContent(null);
        if (isApiNotFoundError(caughtError)) {
          clearMissingBookSource(selectedBookSource.id);
          return;
        }
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load selected book scope"));
      });
    return () => {
      isCurrent = false;
    };
  }, [
    clearMissingBookSource,
    effectiveBookScope,
    runConfiguration,
    selectedBookSource,
    selectedVoiceProfileId,
    speechPolicyOverrides,
    speechPolicyProfile,
    sourceMode,
  ]);

  useEffect(() => {
    if (!selectedVoiceProfileId) {
      return;
    }
    if (voiceProfiles.length === 0) {
      return;
    }
    if (!voiceProfiles.some((profile) => profile.id === selectedVoiceProfileId)) {
      clearVoiceProfileSelection();
    }
  }, [clearVoiceProfileSelection, selectedVoiceProfileId, voiceProfiles]);

  const handleAnalyzeVoiceSource = useCallback(
    async (file: File) => {
      setIsAnalyzingProfileSource(true);
      setProfileError(null);
      try {
        void refreshProfileSourceDiagnostics();
        const source = await createVoiceProfileSource({ file });
        setProfileSource(source);
      } catch (caughtError) {
        void refreshProfileSourceDiagnostics();
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to analyze voice source",
        );
      } finally {
        setIsAnalyzingProfileSource(false);
      }
    },
    [refreshProfileSourceDiagnostics],
  );

  const handleCreateVoiceProfileFromCandidate = useCallback(
    async (candidate: VoiceProfileCandidate, request: CreateVoiceProfileFromCandidateRequest) => {
      if (!profileSource) {
        return;
      }
      setProfileCandidateCreateId(candidate.id);
      setProfileError(null);
      try {
        const profile = await createVoiceProfileFromCandidate(
          profileSource.id,
          candidate.id,
          request,
        );
        setVoiceProfiles((currentProfiles) =>
          upsertVoiceProfileByCreatedAt(currentProfiles, profile),
        );
        selectVoiceProfile(profile.id);
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to create voice profile",
        );
      } finally {
        setProfileCandidateCreateId(null);
      }
    },
    [profileSource, selectVoiceProfile],
  );

  const handleRefreshVoiceSourceTranscript = useCallback(async (sourceId: string) => {
    const key = `source:${sourceId}`;
    setRefreshingTranscriptKey(key);
    setProfileError(null);
    try {
      const source = await refreshVoiceProfileSourceTranscript(sourceId);
      setProfileSource(source);
    } catch (caughtError) {
      setProfileError(
        caughtError instanceof Error ? caughtError.message : "Unable to refresh source transcript",
      );
    } finally {
      setRefreshingTranscriptKey(null);
    }
  }, []);

  const handleRefreshVoiceCandidateTranscript = useCallback(
    async (candidate: VoiceProfileCandidate) => {
      if (!profileSource) {
        return;
      }
      const key = `candidate:${candidate.id}`;
      setRefreshingTranscriptKey(key);
      setProfileError(null);
      try {
        const updatedCandidate = await refreshVoiceProfileCandidateTranscript(
          profileSource.id,
          candidate.id,
        );
        setProfileSource((currentSource) => {
          if (currentSource?.id !== profileSource.id) {
            return currentSource;
          }
          return {
            ...currentSource,
            candidates: currentSource.candidates.map((currentCandidate) =>
              currentCandidate.id === updatedCandidate.id ? updatedCandidate : currentCandidate,
            ),
          };
        });
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to refresh candidate transcript",
        );
      } finally {
        setRefreshingTranscriptKey(null);
      }
    },
    [profileSource],
  );

  const handleDeleteVoiceProfile = useCallback(
    async (id: string) => {
      setProfileError(null);
      try {
        await deleteVoiceProfile(id);
        setVoiceProfiles((currentProfiles) => currentProfiles.filter((item) => item.id !== id));
        if (selectedVoiceProfileId === id) {
          clearVoiceProfileSelection();
        }
      } catch (caughtError) {
        setProfileError(
          caughtError instanceof Error ? caughtError.message : "Unable to delete voice profile",
        );
      }
    },
    [clearVoiceProfileSelection, selectedVoiceProfileId],
  );

  useEffect(() => {
    if (
      !profileSource ||
      profileSource.status === "ready" ||
      profileSource.status === "failed" ||
      profileSource.status === "cancelled"
    ) {
      if (profileSource?.status === "failed") {
        void refreshProfileSourceDiagnostics();
      }
      return;
    }

    let isCancelled = false;
    const refreshSource = async () => {
      try {
        const nextSource = await getVoiceProfileSource(profileSource.id);
        if (!isCancelled) {
          setProfileSource(nextSource);
        }
      } catch (caughtError) {
        if (!isCancelled) {
          setProfileError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to refresh source analysis",
          );
        }
      }
    };

    const interval = globalThis.setInterval(() => {
      void refreshSource();
    }, 1500);
    void refreshSource();

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [profileSource, refreshProfileSourceDiagnostics]);

  useEffect(() => {
    if (activeDemoProjectId || projectStateReadyId !== activeProjectId) {
      return;
    }
    saveProjectWorkspaceState(activeProjectId, {
      activeBlockId: workspaceContext.activeBlockId,
      bookScope: selectedBookScope,
      bookSourceId: selectedBookSourceId,
      jobId: job?.id ?? null,
      preparedSourceId: selectedPreparedSourceId,
      readingPosition: currentReadingPosition,
      sourceMode,
      sourceType: workspaceSourceType(sourceMode),
      speechPolicyProfile,
      stage: contentMode,
      text,
      voiceProfileId: selectedVoiceProfileId,
    });
  }, [
    activeProjectId,
    activeDemoProjectId,
    contentMode,
    job?.id,
    currentReadingPosition,
    projectStateReadyId,
    selectedPreparedSourceId,
    selectedBookScope,
    selectedBookSourceId,
    selectedVoiceProfileId,
    sourceMode,
    speechPolicyProfile,
    text,
    workspaceContext.activeBlockId,
  ]);

  useEffect(() => {
    localStorage.setItem(RUN_CONFIG_STORAGE_KEY, JSON.stringify(runConfiguration));
  }, [runConfiguration]);

  useEffect(() => {
    localStorage.setItem(TELEPROMPTER_SETTINGS_STORAGE_KEY, JSON.stringify(teleprompterSettings));
  }, [teleprompterSettings]);

  useEffect(() => {
    if (!uiMemory.rememberReaderPreferences) {
      localStorage.removeItem(READER_ACCESSIBILITY_STORAGE_KEY);
      clearStoredReadAlongPreferences(activeProjectId);
      return;
    }
    localStorage.setItem(
      READER_ACCESSIBILITY_STORAGE_KEY,
      JSON.stringify(readerAccessibilitySettings),
    );
  }, [activeProjectId, readerAccessibilitySettings, uiMemory.rememberReaderPreferences]);

  useEffect(() => {
    const previousProjectId = readAlongPreferencesProjectRef.current;
    if (previousProjectId !== activeProjectId && readAlongPreferences.scope === "project") {
      readAlongPreferencesProjectRef.current = activeProjectId;
      setReadAlongPreferences(
        loadReadAlongPreferences(activeProjectId, uiMemory.rememberReaderPreferences),
      );
      return;
    }
    readAlongPreferencesProjectRef.current = activeProjectId;
    saveReadAlongPreferences(
      readAlongPreferences,
      activeProjectId,
      uiMemory.rememberReaderPreferences,
    );
  }, [activeProjectId, readAlongPreferences, uiMemory.rememberReaderPreferences]);

  useEffect(() => {
    if (!uiMemory.rememberTheme) {
      localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, themeName);
  }, [themeName, uiMemory.rememberTheme]);

  useEffect(() => {
    saveUiMemory(uiMemory);
    uiMemoryRef.current = uiMemory;
  }, [uiMemory]);

  useEffect(() => {
    if (!uiMemory.rememberTelepromptTheatreSettings) {
      return;
    }
    setTelepromptTheatreSettings(resolveTelepromptTheatreSettings(uiMemory));
  }, [uiMemory]);

  useEffect(() => {
    if (!uiMemory.rememberLastProject) {
      localStorage.removeItem(ACTIVE_PROJECT_ID_STORAGE_KEY);
    }
  }, [uiMemory.rememberLastProject]);

  useEffect(() => {
    if (!uiMemory.rememberTelepromptReturnTarget) {
      clearStoredTelepromptReturnMemory();
    }
  }, [uiMemory.rememberTelepromptReturnTarget]);

  useEffect(() => {
    const hasJob = Boolean(job?.id);
    setPlaybackCursorSec(0);
    setPlaybackControls(DISABLED_PLAYBACK_CONTROLLER);
    setActivePlaybackSession(null);
    setPendingPlaybackResume(null);
    setResumeFallbackNotice(null);
    if (hasJob) {
      setIsPlaybackActive(false);
    }
  }, [job?.id]);

  useEffect(() => {
    if (!pendingPlaybackResume || !playbackControls.isAvailable) {
      return;
    }
    const locatorSeconds = secondsForReadingPosition(
      highlightMap,
      pendingPlaybackResume.readingPosition,
    );
    const usedLocator = locatorSeconds !== null;
    const targetSeconds = Math.max(0, locatorSeconds ?? pendingPlaybackResume.seconds);
    if (pendingPlaybackResume.readingPosition && !usedLocator) {
      recordFrontendDegradedState("resume-position-fallback", "reader-resume", {
        fallback: "saved-elapsed-seconds",
        targetSeconds,
      });
      setResumeFallbackNotice(
        "Saved locator could not be mapped in this timing pass, so resume used saved elapsed time.",
      );
    } else {
      setResumeFallbackNotice(null);
    }
    if (playbackControls.seekTo) {
      playbackControls.seekTo(targetSeconds);
    } else if (playbackControls.skipBy) {
      playbackControls.skipBy(targetSeconds - playbackCursorSec);
    }
    setPlaybackCursorSec(targetSeconds);
    if (pendingPlaybackResume.autoplay) {
      void playbackControls.play();
    }
    const resumeElapsedMs =
      resumeRestoreStartedAt === null ? null : performance.now() - resumeRestoreStartedAt;
    if (resumeElapsedMs !== null && resumeElapsedMs > READER_RESUME_BUDGET_MS) {
      recordFrontendDegradedState("slow-resume", "reader-resume", {
        durationMs: Math.round(resumeElapsedMs),
        targetSeconds,
        usedLocator,
      });
    }
    readerResumeTiming.end({
      targetSeconds,
      usedLocator,
    });
    setResumeRestoreStartedAt(null);
    setPendingPlaybackResume(null);
  }, [
    highlightMap,
    pendingPlaybackResume,
    playbackControls,
    playbackCursorSec,
    readerResumeTiming,
    resumeRestoreStartedAt,
  ]);

  useEffect(() => {
    const restoreJobId = new URLSearchParams(globalThis.location.search).get("jobId");

    if (!restoreJobId) {
      return;
    }

    const restore = async () => {
      try {
        const restoredJob = await getVoiceJob(restoreJobId);
        applyVoiceJobToState(restoredJob);
      } catch {
        setError("Unable to restore the requested job.");
      }
    };

    void restore();
  }, [applyVoiceJobToState]);

  useEffect(() => {
    if (!activeJobId) {
      return;
    }

    return subscribeToVoiceJob(
      activeJobId,
      (nextJob) => {
        setJob(nextJob);
        if (nextJob.bookSourceId) {
          setSelectedBookSourceId(nextJob.bookSourceId);
          setSelectedBookScope(nextJob.bookScope ?? null);
        }
        if (nextJob.status !== "failed") {
          setError(null);
        }
        if (nextJob.status === "completed") {
          setRequestState("complete");
          announceVoiceJobTerminalStatus(nextJob);
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
          void refreshProjectStorage(nextJob.projectId || activeProjectId);
        }
        if (nextJob.status === "failed") {
          setRequestState("error");
          setError(nextJob.error ?? "Voice job failed");
          announceVoiceJobTerminalStatus(nextJob);
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
        }

        if (nextJob.status === "cancelled") {
          setRequestState("cancelled");
          setError(nextJob.error ?? "Voice job cancelled");
          void refreshProjectJobs(nextJob.projectId || activeProjectId);
        }
      },
      (caughtError) => {
        if (caughtError.message === "Voice job progress stream disconnected") {
          return;
        }
        setError(caughtError.message);
      },
    );
  }, [
    activeJobId,
    activeProjectId,
    announceVoiceJobTerminalStatus,
    refreshProjectJobs,
    refreshProjectStorage,
  ]);

  useEffect(() => {
    if (!job?.id || !job.timing?.highlightMapUrl) {
      setHighlightMap(null);
      return;
    }
    const expectedStatus = job.timing.summary.status;
    const expectedTokenCount = job.timing.summary.tokenCount;
    let isCancelled = false;
    void getHighlightMap(job.id)
      .then((map) => {
        if (
          !isCancelled &&
          (expectedStatus !== "partial" || map.summary.tokenCount >= expectedTokenCount)
        ) {
          setHighlightMap(map);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHighlightMap(null);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [
    job?.id,
    job?.timing?.highlightMapUrl,
    job?.timing?.summary.status,
    job?.timing?.summary.tokenCount,
  ]);

  useEffect(() => {
    if (!job?.id || !job.timing?.highlightMapV2Url) {
      setHighlightMapV2(null);
      return;
    }
    let isCancelled = false;
    void getHighlightMapV2(job.id)
      .then((map) => {
        if (!isCancelled) {
          setHighlightMapV2(map);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setHighlightMapV2(null);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [job?.id, job?.timing?.highlightMapV2Url]);

  useEffect(() => {
    if (!hasActiveVoiceCloningActivity) {
      return;
    }

    const interval = globalThis.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => {
      globalThis.clearInterval(interval);
    };
  }, [hasActiveVoiceCloningActivity]);

  useEffect(() => {
    if (!job || !isPlaybackActive || activePlaybackSession) {
      return;
    }
    const targetId = progressTargetIdForJob(job);
    if (!targetId) {
      return;
    }
    let isCancelled = false;
    void startPlaybackSession({
      targetId,
      projectId: job.projectId,
      jobId: job.id,
      bookSourceId: job.bookSourceId,
      preparedSourceId: job.preparedSourceId,
      bookScope: job.bookScope,
      currentTimeSec: playbackCursorSec,
      durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
      activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
      readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
    })
      .then((session) => {
        if (!isCancelled) {
          setActivePlaybackSession(session);
        }
      })
      .catch(() => {
        // Progress sync should never interrupt playback.
      });
    return () => {
      isCancelled = true;
    };
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    isPlaybackActive,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
  ]);

  useEffect(() => {
    if (!activePlaybackSession || !job) {
      return;
    }
    const sync = () => {
      void syncPlaybackSession(activePlaybackSession.id, {
        currentTimeSec: playbackCursorSec,
        durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
        activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
        readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
        finished:
          job.status === "completed" &&
          job.durationMs > 0 &&
          playbackCursorSec >= job.durationMs / 1000 - 0.2,
      }).then(() => {
        void refreshProjectProgress(job.projectId);
      });
    };
    const interval = globalThis.setInterval(sync, 15_000);
    return () => {
      globalThis.clearInterval(interval);
    };
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    refreshProjectProgress,
  ]);

  useEffect(() => {
    if (isPlaybackActive || !activePlaybackSession || !job) {
      return;
    }
    const session = activePlaybackSession;
    setActivePlaybackSession(null);
    void closePlaybackSession(session.id, {
      currentTimeSec: playbackCursorSec,
      durationSec: job.durationMs > 0 ? job.durationMs / 1000 : undefined,
      activeWordIndex: activeWordIndexForPlaybackProgress(job, playbackCursorSec),
      readingPosition: readingPositionForPlaybackProgress(job, playbackCursorSec),
      finished:
        job.status === "completed" &&
        job.durationMs > 0 &&
        playbackCursorSec >= job.durationMs / 1000 - 0.2,
    }).then(() => {
      void refreshProjectProgress(job.projectId);
    });
  }, [
    activePlaybackSession,
    activeWordIndexForPlaybackProgress,
    isPlaybackActive,
    job,
    playbackCursorSec,
    readingPositionForPlaybackProgress,
    refreshProjectProgress,
  ]);

  useEffect(() => {
    if (!isProcessing && !isSettingsOpen && !isWorkspaceOpen) {
      return;
    }
    if (systemMetricsUnavailable) {
      return;
    }

    let isCancelled = false;

    const refreshMetrics = async () => {
      try {
        const metrics = await getSystemMetrics();
        if (isCancelled) {
          return;
        }
        setSystemMetrics(metrics);
        setSystemMetricsUnavailable(false);
        setSystemMetricsError(null);
      } catch (caughtError) {
        if (isCancelled) {
          return;
        }

        const rawMessage =
          caughtError instanceof Error ? caughtError.message : "Unable to load system metrics";
        if (rawMessage.startsWith("404")) {
          setSystemMetricsUnavailable(true);
          setSystemMetrics(null);
          setSystemMetricsError(
            "System metrics endpoint is unavailable in the running backend. Restart backend after pulling this update to load GPU/CPU telemetry.",
          );
          return;
        }

        setSystemMetrics(null);
        setSystemMetricsError(rawMessage);
      }
    };

    void refreshMetrics();
    const interval = globalThis.setInterval(() => {
      void refreshMetrics();
    }, 3000);

    return () => {
      isCancelled = true;
      globalThis.clearInterval(interval);
    };
  }, [isProcessing, isSettingsOpen, isWorkspaceOpen, systemMetricsUnavailable]);

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canCreateCurrentSource) {
      return;
    }

    createAndListenFromCurrentSource();
  }

  async function handleCancelVoiceJob() {
    if (!job?.id || !activeJobId) {
      return;
    }

    try {
      await cancelVoiceJob(job.id);
      setError(null);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to cancel job");
      setRequestState("error");
    }
  }

  function buildVoiceJobRequest(
    sourceText: string,
    preparedSource?: PreparedSource | null,
  ): CreateVoiceJobRequest {
    const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
    const isSupertonicRun = runConfiguration.ttsEngine === "supertonic-3";
    const selectedProviderVoice = isSupertonicRun
      ? (runConfiguration.engineOptions.voiceStyle ?? "M1")
      : selectedKokoroVoice?.id;
    const selectedProviderLanguage = isSupertonicRun
      ? resolveSupertonicLanguage(runConfiguration.engineOptions.lang, preparedSource)
      : selectedKokoroVoice?.langCode;
    const voiceProfileIdForRequest = voiceProfiles.some(
      (profile) => profile.id === selectedVoiceProfileId,
    )
      ? selectedVoiceProfileId
      : "";
    const request: CreateVoiceJobRequest = buildCreateVoiceJobRequest(
      sourceText,
      runConfiguration,
      voiceProfileIdForRequest,
      activeProjectId,
      selectedProviderVoice,
      selectedProviderLanguage,
    );
    request.locale = resolveRunLocale(runConfiguration);
    return request;
  }

  async function submitVoiceJob() {
    const request = buildVoiceJobRequest(text);

    setRequestState("running");
    setError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    announcePolite(liveStatusMessages.audioGenerationStarted());

    try {
      const nextJob = await createVoiceJob(request);
      setActiveDemoProjectId(null);
      setJob(nextJob);
      setContentMode("preview");
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
      announceVoiceJobTerminalStatus(nextJob);
    } catch (caughtError) {
      setRequestState("error");
      setError(caughtError instanceof Error ? caughtError.message : "Unable to create voice job");
      announceAssertive(liveStatusMessages.audioGenerationFailed());
    }
  }

  async function loadBookNarrationText(book: BookSource, scope: BookScope): Promise<string | null> {
    const existingText = bookScopeContentMatches(bookScopeContent, book.id, scope)
      ? (bookScopeContent?.text ?? "")
      : bookScopeText(book, scope);
    if (existingText.trim()) {
      return existingText;
    }
    try {
      const content = await getBookSourceScope(book.id, scope);
      setBookScopeContent(content);
      return content.text;
    } catch (caughtError) {
      if (isApiNotFoundError(caughtError)) {
        clearMissingBookSource(book.id);
      } else {
        setBookSourceError(formatErrorMessage(caughtError, "Unable to load book narration text"));
      }
      return null;
    }
  }

  async function submitBookNarrationJob(book: BookSource, scope: BookScope) {
    if (book.status !== "ready") {
      setBookSourceError(book.error ?? "Book source is not ready for narration.");
      return;
    }
    const scopedText = await loadBookNarrationText(book, scope);
    if (!scopedText) {
      return;
    }
    const sessionOverrides = compactSpeechPolicyOverrides(speechPolicyOverrides);
    const request = {
      ...buildVoiceJobRequest(scopedText),
      bookSourceId: book.id,
      bookScope: scope,
      ...(hasSpeechPolicyOverrides(sessionOverrides)
        ? { speechPolicyOverrides: sessionOverrides }
        : {}),
    };
    setRequestState("running");
    setError(null);
    setBookSourceError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setSelectedBookSourceId(book.id);
    setSelectedBookScope(scope);
    setText(scopedText);
    announcePolite(liveStatusMessages.audioGenerationStarted());

    try {
      const nextJob = await createBookNarrationJob(book.id, request);
      setActiveDemoProjectId(null);
      setJob(nextJob);
      setSelectedBookSourceId(nextJob.bookSourceId ?? book.id);
      setSelectedBookScope(nextJob.bookScope ?? scope);
      setContentMode("preview");
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
      announceVoiceJobTerminalStatus(nextJob);
    } catch (caughtError) {
      setRequestState("error");
      setBookSourceError(
        caughtError instanceof Error ? caughtError.message : "Unable to create book narration",
      );
      announceAssertive(liveStatusMessages.audioGenerationFailed());
    }
  }

  async function submitPreparedSourceJob(source: PreparedSource) {
    if (source.status !== "ready") {
      setSourcePrepError(source.error ?? "Prepared source is not ready for narration.");
      return;
    }
    const speechText = source.speechText ?? "";
    if (!speechText.trim()) {
      setSourcePrepError("Prepared source has no speakable blocks.");
      return;
    }
    const sessionOverrides = compactSpeechPolicyOverrides(speechPolicyOverrides);
    const request = {
      ...buildVoiceJobRequest(speechText, source),
      preparedSourceId: source.id,
      selectedBlockIds:
        source.blocks?.filter((block) => block.speakMode !== "skip").map((block) => block.id) ?? [],
      sourceKind: source.kind,
      progressTargetId: `prepared:${source.id}`,
      ...(hasSpeechPolicyOverrides(sessionOverrides)
        ? { speechPolicyOverrides: sessionOverrides }
        : {}),
    };
    setRequestState("running");
    setError(null);
    setSourcePrepError(null);
    setPlaybackCursorSec(0);
    setIsPlaybackActive(false);
    setSelectedPreparedSourceId(source.id);
    setText(speechText);
    announcePolite(liveStatusMessages.audioGenerationStarted());

    try {
      const nextJob = await createPreparedSourceJob(source.id, request);
      setActiveDemoProjectId(null);
      setJob(nextJob);
      setContentMode("preview");
      void refreshProjectJobs(nextJob.projectId || activeProjectId);
      setRequestState(nextJob.status === "completed" ? "complete" : "running");
      announceVoiceJobTerminalStatus(nextJob);
    } catch (caughtError) {
      setRequestState("error");
      setSourcePrepError(
        caughtError instanceof Error ? caughtError.message : "Unable to create prepared narration",
      );
      announceAssertive(liveStatusMessages.audioGenerationFailed());
    }
  }

  function createAndListenFromCurrentSource() {
    if (!canCreateCurrentSource) {
      return;
    }
    if (sourceMode === "book" && selectedBookSource && effectiveBookScope) {
      void submitBookNarrationJob(selectedBookSource, effectiveBookScope);
      return;
    }
    if (sourceMode === "fileUrl" && selectedPreparedSource) {
      void submitPreparedSourceJob(selectedPreparedSource);
      return;
    }
    void submitVoiceJob();
  }
  createAndListenFromCurrentSourceRef.current = createAndListenFromCurrentSource;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isCommandPaletteOpen) {
        event.preventDefault();
        closeCommandPalette();
        return;
      }
      const shortcutCommand = resolveGlobalShortcutCommand(event, shortcutPreferences);
      if (
        !shortcutCommand ||
        (shortcutCommand === "command.palette"
          ? !isCommandPaletteOpen && shouldIgnoreGlobalShortcutTarget(event.target)
          : shouldIgnoreGlobalShortcutTarget(event.target))
      ) {
        return;
      }
      event.preventDefault();
      if (shortcutCommand === "command.palette") {
        if (isCommandPaletteOpen) {
          closeCommandPalette();
          return;
        }
        openCommandPalette("commands");
        return;
      }
      if (shortcutCommand === "shortcut.cheatsheet") {
        openShortcutCheatSheet();
        return;
      }
      if (shortcutCommand === "settings.open") {
        setSettingsCommandTarget(null);
        setIsSettingsOpen(true);
        return;
      }
      if (shortcutCommand === "help.open") {
        setHelpCommandTarget(null);
        setIsHelpOpen(true);
        return;
      }
      if (canCreateCurrentSource) {
        createAndListenFromCurrentSourceRef.current();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    canCreateCurrentSource,
    closeCommandPalette,
    isCommandPaletteOpen,
    openCommandPalette,
    openShortcutCheatSheet,
    shortcutPreferences,
  ]);

  const studioJobName = getStudioJobName(job);
  const studioProjectName = activeProject?.name ?? DEFAULT_PROJECT_NAME;
  const studioGridStyle = {
    "--studio-left-column": railColumnWidth(leftRailMode, "left"),
    "--studio-right-column": railColumnWidth(rightRailMode, "right"),
  } as CSSProperties;
  const preparedSourceCinemaSurfaceKind =
    preparedSourceCinemaSource && preparedSourceCinemaKind(preparedSourceCinemaSource) === "website"
      ? "website"
      : "document";
  const PreparedCinemaOverlay =
    preparedSourceCinemaSurfaceKind === "website" ? WebsiteCinemaOverlay : DocumentCinemaOverlay;
  const handleBookCinemaFocusStateChange = useCallback(
    (state: UiMemoryCinemaState) => {
      handleCinemaFocusStateChange("book", state);
    },
    [handleCinemaFocusStateChange],
  );
  const handlePreparedCinemaFocusStateChange = useCallback(
    (state: UiMemoryCinemaState) => {
      handleCinemaFocusStateChange(preparedSourceCinemaSurfaceKind, state);
    },
    [handleCinemaFocusStateChange, preparedSourceCinemaSurfaceKind],
  );
  let activeHelpCinema: "book" | "prepared" | null = null;
  if (isBookCinemaOpen) {
    activeHelpCinema = "book";
  } else if (preparedSourceCinemaSourceId) {
    activeHelpCinema = "prepared";
  }
  let activeCinemaSurfaceKind: CinemaSurfaceKind | null = null;
  if (isBookCinemaOpen) {
    activeCinemaSurfaceKind = "book";
  } else if (preparedSourceCinemaSource) {
    activeCinemaSurfaceKind = preparedSourceCinemaSurfaceKind;
  }
  const readerNavigationLabels = useMemo(
    () => ({
      bookSources: new Map(bookSources.map((book) => [book.id, bookSourceName(book)])),
      preparedSources: new Map(
        preparedSources.map((source) => [source.id, source.title ?? source.sourceName]),
      ),
    }),
    [bookSources, preparedSources],
  );
  const commandBookmarkProgress =
    (isBookCinemaOpen ? (selectedBookProgress ?? hashProgress) : preparedSourceCinemaProgress) ??
    latestProgress;
  useEffect(() => {
    if (!isCommandPaletteOpen) {
      return;
    }
    let cancelled = false;
    void import("./features/reader-navigation").then((module) => {
      if (cancelled) {
        return;
      }
      const recentPositions = module
        .readerRecentPositionsFromProgress(projectProgress, readerNavigationLabels, 8)
        .map<CommandRecentData>((recent) => ({
          detail: recent.detail,
          id: `wayfinding:recent:${recent.id}`,
          keywords: ["recent", "resume", "position", recent.label],
          label: recent.label,
          progressItem: recent.progressItem,
        }));
      const bookmarks =
        commandBookmarkProgress === null
          ? []
          : module
              .readerBookmarksFromProgress(commandBookmarkProgress)
              .map<CommandBookmarkData>((bookmark) => ({
                detail: `${bookmark.detail} · ${module.formatReaderClock(bookmark.currentTimeSec)}`,
                id: `wayfinding:bookmark:${bookmark.progressTargetId}:${bookmark.id}`,
                keywords: ["bookmark", "saved", bookmark.detail],
                label: bookmark.label,
                resumeProgress: module.playbackProgressForBookmark(
                  commandBookmarkProgress,
                  bookmark,
                ),
              }));
      setCommandWayfinding({ bookmarks, recentPositions });
    });
    return () => {
      cancelled = true;
    };
  }, [commandBookmarkProgress, isCommandPaletteOpen, projectProgress, readerNavigationLabels]);
  const coreCommandEntries: CommandEntry[] = [
    {
      category: "Navigation",
      detail: "Open the project library and current chapter context.",
      id: "workspace:open",
      keywords: ["drawer", "project", "library"],
      perform: () => {
        setIsWorkspaceOpen(true);
      },
      section: "Workspace",
      title: "Open workspace",
    },
    {
      category: "Settings",
      detail: "Open Studio Settings.",
      id: "settings:open",
      keywords: ["configuration", "preferences"],
      perform: () => {
        setSettingsCommandTarget(null);
        setIsSettingsOpen(true);
      },
      section: "Settings",
      shortcutCommandId: "settings.open",
      title: "Open settings",
    },
    {
      category: "Settings",
      detail: "Show available keyboard shortcuts and customization entry.",
      id: "shortcuts:open",
      keywords: ["keyboard", "hotkey", "cheat sheet"],
      perform: () => {
        openShortcutCheatSheet();
      },
      section: "Settings",
      shortcutCommandId: "shortcut.cheatsheet",
      title: "Open shortcut cheat sheet",
    },
    {
      category: "Diagnostics",
      detail: "Open contextual workflow help.",
      id: "help:open",
      keywords: ["guide", "support", "workflow"],
      perform: () => {
        setHelpCommandTarget(null);
        setIsHelpOpen(true);
      },
      section: "Help",
      shortcutCommandId: "help.open",
      title: "Open help",
    },
    {
      capabilityGate: "tts",
      capabilityGated: Boolean(createAndListenCapabilityReason),
      category: "Playback",
      detail: `Generate ${createAndListenScopeLabel(createAndListenScope)} audio from the current draft, book, or prepared source.`,
      disabled: !canCreateCurrentSource,
      disabledReason: createAndListenDisabledReason,
      id: "playback:create-listen",
      keywords: ["run", "generate", "listen", "audio"],
      perform: () => {
        createAndListenFromCurrentSource();
      },
      section: "Playback",
      shortcutCommandId: "playback.createListen",
      title: workspaceStageActionLabel("createAndListen"),
    },
    {
      category: "Teleprompt",
      detail: "Follow the current script inline with preserved context.",
      id: "workspace:teleprompt",
      keywords: ["script", "read", "stage"],
      perform: () => {
        openTelepromptStage();
      },
      section: "Workspace",
      title: workspaceStageActionLabel("openTeleprompt"),
    },
    {
      category: "Teleprompt",
      detail: "Open the presenter-first Theatre teleprompter with fullscreen fallback.",
      id: "teleprompt:theatre",
      keywords: ["fullscreen", "presenter", "cinematic", "recording"],
      perform: () => {
        openTelepromptTheatreStage();
      },
      section: "Teleprompt",
      title: "Open Teleprompt Theatre",
    },
    {
      category: "Voice",
      detail: "Open saved voices, candidates, targets, and voice diagnostics.",
      id: "voice:dashboard",
      keywords: ["voice", "profile", "candidate", "diagnostics"],
      perform: () => {
        setIsWorkspaceOpen(false);
        setIsVoiceDashboardOpen(true);
      },
      section: "Voice",
      title: "Open voice dashboard",
    },
  ];
  const workspaceCommandEntries = (commandMetadata?.workspace ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      id: metadata.id,
      keywords: metadata.keywords,
      perform: () => {
        if (metadata.target.kind === "stage") {
          setContentMode(metadata.target.stage);
          return;
        }
        setWorkspaceLayoutMode(metadata.target.layoutMode);
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const settingsCommandEntries = (commandMetadata?.settings ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      id: metadata.id,
      keywords: metadata.keywords,
      perform: () => {
        setIsWorkspaceOpen(false);
        setSettingsCommandTarget(metadata.target);
        setIsSettingsOpen(true);
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const helpCommandEntries = (commandMetadata?.help ?? []).map<CommandEntry>((metadata) => ({
    detail: metadata.detail,
    id: metadata.id,
    keywords: metadata.keywords,
    perform: () => {
      setHelpCommandTarget(metadata.target);
      setIsHelpOpen(true);
    },
    category: metadata.category,
    section: metadata.section,
    title: metadata.title,
  }));
  const cinemaFocusCommandEntries = (commandMetadata?.cinemaFocus ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      disabled: !activeCinemaSurfaceKind,
      disabledReason: activeCinemaSurfaceKind
        ? undefined
        : "Open Book, Document, or Website Cinema first.",
      id: metadata.id,
      keywords: metadata.keywords,
      perform: () => {
        if (activeCinemaSurfaceKind) {
          setCinemaFocusModeFromCommand(activeCinemaSurfaceKind, metadata.target.mode);
        }
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const cinemaAdvancedCommandEntries = (commandMetadata?.cinemaAdvanced ?? []).map<CommandEntry>(
    (metadata) => ({
      detail: metadata.detail,
      disabled: !activeCinemaSurfaceKind,
      disabledReason: activeCinemaSurfaceKind
        ? undefined
        : "Open Book, Document, or Website Cinema before using operator diagnostics.",
      id: metadata.id,
      keywords: metadata.keywords,
      perform: () => {
        if (activeCinemaSurfaceKind) {
          setCinemaAdvancedActionFromCommand(activeCinemaSurfaceKind, metadata.target);
        }
      },
      category: metadata.category,
      section: metadata.section,
      title: metadata.title,
    }),
  );
  const projectCommandEntries = projects.map<CommandEntry>((project) => ({
    category: "Project",
    detail: project.id === activeProjectId ? "Current project" : "Switch active project.",
    disabled: project.id === activeProjectId,
    disabledReason: project.id === activeProjectId ? "Already selected." : undefined,
    id: `project:${project.id}`,
    keywords: ["project", project.name],
    perform: () => {
      setIsBookCinemaOpen(false);
      setPreparedSourceCinemaSourceId(null);
      selectProject(project.id);
    },
    section: "Projects",
    title: `Switch project: ${project.name}`,
  }));
  const draftSourceCommand: CommandEntry = {
    category: "Source",
    detail: "Return to draft text intake.",
    id: "source:text",
    keywords: ["draft", "text", "source"],
    perform: () => {
      setSourceMode("text");
      setContentMode("intake");
    },
    section: "Sources",
    title: "Use draft text source",
  };
  const bookSourceCommandEntries = bookSources.map<CommandEntry>((book) => {
    const defaultScope = resolveDefaultBookScope(book);
    const isReady = book.status === "ready";
    const label = bookSourceName(book);
    return {
      category: "Source",
      detail: isReady
        ? "Use this book source in Review."
        : (book.error ?? "Book source is still preparing."),
      disabled: !isReady,
      disabledReason: isReady ? undefined : (book.error ?? "Book source is not ready."),
      id: `source:book:${book.id}`,
      keywords: ["book", "source", label],
      perform: () => {
        handleUseBookText(book, defaultScope);
      },
      section: "Sources",
      title: `Use book: ${label}`,
    };
  });
  const preparedSourceCommandEntries = preparedSources.flatMap<CommandEntry>((source) => {
    const isReady = source.status === "ready";
    const label = source.title ?? source.sourceName;
    const disabledReason = isReady ? undefined : (source.error ?? "Prepared source is not ready.");
    return [
      {
        category: "Source",
        detail: "Use this prepared source in Review.",
        disabled: !isReady,
        disabledReason,
        id: `source:prepared:${source.id}`,
        keywords: ["prepared", "source", source.kind, label],
        perform: () => {
          void handleUsePreparedSource(source);
        },
        section: "Sources",
        title: `Use source: ${label}`,
      },
      {
        category: "Source",
        detail: preparedSourceCinemaActionLabel(source),
        disabled: !isReady,
        disabledReason,
        id: `source:prepared-cinema:${source.id}`,
        keywords: ["cinema", "read", "prepared", source.kind, label],
        perform: () => {
          openPreparedSourceCinema(source);
        },
        section: "Sources",
        title: `Open ${label} in Cinema`,
      },
    ];
  });
  const openCurrentCinemaCommand: CommandEntry = {
    category: "Playback",
    detail: "Open the current narration or selected book in Cinema.",
    disabled: !canOpenCurrentCinema,
    disabledReason: canOpenCurrentCinema ? undefined : "Create audio or select a ready book first.",
    id: "cinema:open-current",
    keywords: ["reader", "cinema", "listen"],
    perform: () => {
      openReadingCinema();
    },
    section: "Cinema",
    title: "Open current Cinema",
  };
  const cinemaTheatreDisabledReason = activeCinemaSurfaceKind
    ? undefined
    : "Open Book, Document, or Website Cinema first.";
  const openCinemaTheatreCommand: CommandEntry = {
    category: "Playback",
    detail: "Enter the reader-first theatre layout for the active Cinema surface.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:open",
    keywords: ["cinema", "theatre", "immersive", "fullscreen", "reader"],
    perform: () => {
      setCinemaTheatreOpenSignal((current) => current + 1);
    },
    section: "Cinema",
    title: "Open Cinema Theatre",
  };
  const exitTheatreCommand: CommandEntry = {
    category: "Playback",
    detail: "Leave Theatre and return to the normal Cinema layout.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:exit",
    keywords: ["cinema", "theatre", "exit", "close", "reader"],
    perform: () => {
      setCinemaTheatreExitSignal((current) => current + 1);
    },
    section: "Cinema",
    title: "Exit Theatre",
  };
  const toggleTheatreControlsCommand: CommandEntry = {
    category: "Playback",
    detail: "Show or hide the compact Theatre controls.",
    disabled: !activeCinemaSurfaceKind,
    disabledReason: cinemaTheatreDisabledReason,
    id: "cinema:theatre:toggle-controls",
    keywords: ["cinema", "theatre", "controls", "hide", "show"],
    perform: () => {
      setCinemaTheatreControlsSignal((current) => current + 1);
    },
    section: "Cinema",
    title: "Toggle Theatre controls",
  };
  let bookmarkDisabledReason: string | undefined;
  if (!activeCinemaSurfaceKind) {
    bookmarkDisabledReason = "Open a Cinema surface first.";
  } else if (!job) {
    bookmarkDisabledReason = "Create audio before saving bookmarks.";
  }
  const bookmarkCurrentCommand: CommandEntry = {
    category: "Review",
    detail: "Save the current reader position as a bookmark.",
    disabled: Boolean(bookmarkDisabledReason),
    disabledReason: bookmarkDisabledReason,
    id: "wayfinding:bookmark-current",
    keywords: ["save", "marker", "reader"],
    perform: () => {
      void handleAddPlaybackBookmark();
    },
    section: "Wayfinding",
    shortcut: "B",
    title: "Bookmark current position",
  };
  const bookmarkCommandEntries = commandWayfinding.bookmarks.map<CommandEntry>((bookmark) => ({
    category: "Review",
    detail: bookmark.detail,
    id: bookmark.id,
    keywords: bookmark.keywords,
    perform: () => {
      void handleResumeProgress(bookmark.resumeProgress);
    },
    section: "Wayfinding",
    title: `Bookmark: ${bookmark.label}`,
  }));
  const recentCommandEntries = commandWayfinding.recentPositions.map<CommandEntry>((recent) => ({
    category: "Navigation",
    detail: recent.detail,
    id: recent.id,
    keywords: recent.keywords,
    perform: () => {
      void handleResumeProgress(recent.progressItem);
    },
    section: "Wayfinding",
    title: `Recent: ${recent.label}`,
  }));
  const commandEntries: CommandEntry[] = [
    ...coreCommandEntries,
    ...workspaceCommandEntries,
    ...settingsCommandEntries,
    ...helpCommandEntries,
    ...cinemaFocusCommandEntries,
    ...cinemaAdvancedCommandEntries,
    ...projectCommandEntries,
    draftSourceCommand,
    ...bookSourceCommandEntries,
    ...preparedSourceCommandEntries,
    openCurrentCinemaCommand,
    openCinemaTheatreCommand,
    exitTheatreCommand,
    toggleTheatreControlsCommand,
    bookmarkCurrentCommand,
    ...bookmarkCommandEntries,
    ...recentCommandEntries,
  ];
  let globalPreviewOwner: "preview" | "teleprompt" = "preview";
  if (contentMode === "teleprompt") {
    globalPreviewOwner = "teleprompt";
  }
  const globalPreviewVisible =
    studioMode === "narration" &&
    shouldShowGlobalPreviewPlayer({
      activityFooterMode,
      isCinemaOpen: isBookCinemaOpen,
      isSettingsOpen,
      owner: globalPreviewOwner,
      preparedSourceCinemaOpen: Boolean(preparedSourceCinemaSource),
      stage: contentMode,
    });
  const workspaceOverlay = workspaceOverlayState({
    activityFooterMode,
    previewPlayerVisible: globalPreviewVisible,
    rightRailMode,
    stage: contentMode,
  });
  let activityFooterReserve = "5rem";
  if (activityFooterMode === "compact") {
    activityFooterReserve = "9rem";
  }
  if (activityFooterMode === "full") {
    activityFooterReserve = "min(34vh,24rem)";
  }
  const workspaceOverlayStyle = {
    ...studioGridStyle,
    "--overlay-activity-footer-reserved": activityFooterReserve,
    "--overlay-preview-bottom": `calc(${activityFooterReserve} + 0.75rem)`,
    "--overlay-preview-right": "0.75rem",
    scrollPaddingBottom: `calc(${activityFooterReserve} + 1rem)`,
  } as CSSProperties;

  return (
    <main
      className="vs-app flex h-screen min-h-0 flex-col overflow-hidden"
      data-theme={themeName}
      data-overlay-reserved-zones={workspaceOverlay.reservedZones.join(" ")}
      style={workspaceOverlayStyle}
    >
      <TopProductBar
        activeJobId={activeJobId}
        activeProjectId={activeProjectId}
        canSubmit={canCreateCurrentSource}
        commandPaletteShortcutLabel={
          shortcutLabelForCommand("command.palette", shortcutPreferences) ?? "Ctrl+K / Cmd+K"
        }
        isProcessing={isProcessing}
        job={job}
        jobName={studioJobName}
        projectJobs={projectJobs}
        projectName={studioProjectName}
        projects={projects}
        requestState={requestState}
        settingsShortcutLabel={
          shortcutLabelForCommand("settings.open", shortcutPreferences) ?? "Ctrl+, / Cmd+,"
        }
        studioMode={studioMode}
        showSubmitAction={false}
        onCancel={() => {
          void handleCancelVoiceJob();
        }}
        onCommandPaletteOpen={openCommandPalette}
        onExportOpen={() => {
          setBundlePanelMode("export");
          setIsBundlePanelOpen(true);
        }}
        onImportOpen={() => {
          setBundlePanelMode("import");
          setIsBundlePanelOpen(true);
        }}
        onJobSelect={(jobId) => {
          void handleSelectJob(jobId);
        }}
        onProjectSelect={selectProject}
        onSettingsOpen={() => {
          setSettingsCommandTarget(null);
          setIsSettingsOpen(true);
        }}
        onStudioModeChange={handleStudioModeChange}
        onSubmit={() => {
          createAndListenFromCurrentSource();
        }}
        onWorkspaceLayoutModeChange={setWorkspaceLayoutMode}
        onWorkspaceOpen={() => {
          setIsWorkspaceOpen(true);
        }}
        runConfiguration={runConfiguration}
        workspaceLayoutMode={workspaceContext.layoutMode}
      />
      {isDemoModeCollapsed ? (
        <div className="border-b px-3 py-2 vs-border vs-surface lg:px-4">
          <Button
            className="gap-2"
            data-testid="ui-action-demo-open"
            data-ui-action-surface="Workspace"
            onClick={() => {
              setIsDemoModeCollapsed(false);
            }}
            size="sm"
            variant="secondary"
          >
            Try the Studio
            {activeDemoProjectId ? <StatusChip className="py-0.5">Demo loaded</StatusChip> : null}
          </Button>
        </div>
      ) : (
        <Suspense fallback={null}>
          <LazyDemoMode
            activeDemoProjectId={activeDemoProjectId}
            canCreateAudio={canCreateCurrentSource}
            canOpenCinema={canOpenCurrentCinema}
            currentStage={contentMode}
            hasGeneratedAudio={Boolean(job)}
            onCollapse={setIsDemoModeCollapsed}
            onCreateAndListen={createAndListenFromCurrentSource}
            onOpenCinema={openReadingCinema}
            onOpenDemoProject={openDemoProject}
            onStageSelect={setContentMode}
            providerEngineId={runConfiguration.ttsEngine}
            providerEngines={ttsEngines}
          />
        </Suspense>
      )}
      {isCommandPaletteOpen ? (
        <Suspense fallback={null}>
          <CommandPalette
            entries={commandEntries}
            isOpen={isCommandPaletteOpen}
            shortcutPreferences={shortcutPreferences}
            view={commandPaletteView}
            onClose={closeCommandPalette}
            onCustomizeShortcuts={openShortcutSettings}
            onViewChange={setCommandPaletteView}
          />
        </Suspense>
      ) : null}

      {isWorkspaceOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading workspace..." />}>
          <WorkspaceDrawer
            activeProjectId={activeProjectId}
            bookSources={bookSources}
            isOpen={isWorkspaceOpen}
            job={job}
            metrics={systemMetrics}
            metricsError={systemMetricsError}
            preparedSources={preparedSources}
            projectError={projectError}
            projectJobs={projectJobs}
            projectStorage={projectStorage}
            projectStorageError={projectStorageError}
            projects={projects}
            profileSource={profileSource}
            profiles={voiceProfiles}
            customSpeechPolicyProfiles={customSpeechPolicyProfiles}
            speechPolicyProfile={speechPolicyProfile}
            speechPolicyProfiles={speechPolicyProfiles}
            selectedProfileId={selectedVoiceProfileId}
            cancelingProfileSourceId={cancelingProfileSourceId}
            cancelingTargetKey={cancelingTargetKey}
            onCancelJob={handleCancelVoiceJob}
            onCancelProfileSource={handleCancelVoiceProfileSource}
            onCancelProfileTarget={handleCancelVoiceProfileTarget}
            onDeleteProject={handleDeleteProject}
            onCreateProject={handleCreateProject}
            onClose={() => {
              setIsWorkspaceOpen(false);
            }}
            onExportOpen={() => {
              setIsWorkspaceOpen(false);
              setBundlePanelMode("export");
              setIsBundlePanelOpen(true);
            }}
            onImportOpen={() => {
              setIsWorkspaceOpen(false);
              setBundlePanelMode("import");
              setIsBundlePanelOpen(true);
            }}
            onOpenSettings={() => {
              setIsWorkspaceOpen(false);
              setSettingsCommandTarget(null);
              setIsSettingsOpen(true);
            }}
            onOpenProjectDashboard={() => {
              setIsWorkspaceOpen(false);
              setIsProjectDashboardOpen(true);
            }}
            onOpenVoiceDashboard={() => {
              setIsWorkspaceOpen(false);
              setIsVoiceDashboardOpen(true);
            }}
            onRenameProject={handleRenameProject}
            onSelectProject={selectProject}
            onSelectProfile={selectVoiceProfile}
            onSpeechPolicyProfileChange={(profile) => {
              void handleSpeechPolicyProfileChange(profile);
            }}
          />
        </Suspense>
      ) : null}
      {isProjectDashboardOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading project dashboard..." />}>
          <ProjectDashboard
            activeProjectId={activeProjectId}
            bookSources={bookSources}
            job={job}
            preparedSources={preparedSources}
            projectError={projectError}
            projectJobs={projectJobs}
            projectStorage={projectStorage}
            projectStorageError={projectStorageError}
            projects={projects}
            onClose={() => {
              setIsProjectDashboardOpen(false);
            }}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onExportOpen={() => {
              setIsProjectDashboardOpen(false);
              setBundlePanelMode("export");
              setIsBundlePanelOpen(true);
            }}
            onImportOpen={() => {
              setIsProjectDashboardOpen(false);
              setBundlePanelMode("import");
              setIsBundlePanelOpen(true);
            }}
            onOpenSourceCinema={handleOpenSourceCardCinema}
            onPreviewSource={handlePreviewSourceCard}
            onRenameProject={handleRenameProject}
            onReviewSource={handleReviewSourceCard}
            onSelectProject={selectProject}
            selectedBookSourceId={selectedBookSourceId}
            selectedPreparedSourceId={selectedPreparedSourceId}
          />
        </Suspense>
      ) : null}
      {isVoiceDashboardOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading voice dashboard..." />}>
          <VoiceProfileDashboard
            buildingArtifactKey={buildingArtifactKey}
            cancelingProfileSourceId={cancelingProfileSourceId}
            cancelingTargetKey={cancelingTargetKey}
            diagnostics={profileSourceDiagnostics}
            profileSource={profileSource}
            profiles={voiceProfiles}
            researchModules={researchModules}
            selectedProfileId={selectedVoiceProfileId}
            ttsEngines={ttsEngines}
            onBuildArtifact={handleBuildVoiceProfileArtifact}
            onCancelProfileSource={handleCancelVoiceProfileSource}
            onCancelProfileTarget={handleCancelVoiceProfileTarget}
            onClose={() => {
              setIsVoiceDashboardOpen(false);
            }}
            onDeleteProfile={(id) => {
              void handleDeleteVoiceProfile(id);
            }}
            onOpenVoiceCloning={() => {
              setIsVoiceDashboardOpen(false);
              handleStudioModeChange("voiceCloning");
            }}
            onSelectProfile={selectVoiceProfile}
          />
        </Suspense>
      ) : null}
      {isHelpOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading help..." />}>
          <HelpPanel
            commandPaletteShortcutLabel={
              shortcutLabelForCommand("command.palette", shortcutPreferences) ?? "Ctrl+K / Cmd+K"
            }
            context={{
              activeCinema: activeHelpCinema,
              runConfiguration,
              sourceMode,
              stage: contentMode,
              studioMode,
            }}
            isOpen={isHelpOpen}
            job={job}
            profileSourceDiagnostics={profileSourceDiagnostics}
            profileSource={profileSource}
            preferredAnchorId={helpCommandTarget?.anchorId ?? null}
            selectedProfile={selectedVoiceProfile}
            shortcutCheatSheetLabel={
              shortcutLabelForCommand("shortcut.cheatsheet", shortcutPreferences) ?? "?"
            }
            onClose={() => {
              setIsHelpOpen(false);
            }}
          />
        </Suspense>
      ) : null}
      {isSettingsOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading settings..." />}>
          <SettingsPanel
            canSubmit={canCreateCurrentSource}
            commandTarget={settingsCommandTarget}
            customSpeechPolicyProfiles={customSpeechPolicyProfiles}
            isOpen={isSettingsOpen}
            isSpeechPolicyPreviewing={isSpeechPolicyPreviewing}
            job={job}
            metrics={systemMetrics}
            metricsError={systemMetricsError}
            profileSourceDiagnostics={profileSourceDiagnostics}
            profileSource={profileSource}
            projectStorage={projectStorage}
            projectStorageError={projectStorageError}
            readerAccessibilitySettings={readerAccessibilitySettings}
            readAlongPreferences={readAlongPreferences}
            researchModules={researchModules}
            runConfiguration={runConfiguration}
            selectedBookSource={selectedBookSource}
            selectedPreparedSource={selectedPreparedSource}
            selectedProfile={selectedVoiceProfile}
            sourceMode={sourceMode}
            sourcePolicySavingKey={sourcePolicySavingKey}
            speechPolicyDefinition={speechPolicyDefinition}
            speechPolicyError={speechPolicyError}
            speechPolicyOverrides={speechPolicyOverrides}
            speechPolicyProfile={speechPolicyProfile}
            speechPolicyProfiles={speechPolicyProfiles}
            shortcutPreferences={shortcutPreferences}
            telepromptTheatreSettings={telepromptTheatreSettings}
            teleprompterSettings={teleprompterSettings}
            themeName={themeName}
            ttsEngineError={ttsEngineError}
            ttsEngines={ttsEngines}
            uiMemory={uiMemory}
            onClearBookSourcePolicy={handleClearBookSourcePolicy}
            onClearPreparedSourcePolicy={handleClearPreparedSourcePolicy}
            onClearSpeechPolicyOverrides={handleClearSpeechPolicyOverrides}
            onCreateCustomSpeechPolicyProfile={handleCreateCustomSpeechPolicyProfile}
            onDeleteCustomSpeechPolicyProfile={handleDeleteCustomSpeechPolicyProfile}
            onReaderAccessibilitySettingsChange={setReaderAccessibilitySettings}
            onReadAlongPreferencesChange={setReadAlongPreferences}
            onRunConfigurationChange={setRunConfiguration}
            onSaveBookSourcePolicy={handleSaveBookSourcePolicy}
            onSavePreparedSourcePolicy={handleSavePreparedSourcePolicy}
            onShortcutPreferencesChange={setShortcutPreferences}
            onShortcutPreferencesReset={() => {
              setShortcutPreferences(resetShortcutPreferences());
              announcePolite(liveStatusMessages.settingsReset("Shortcut"));
            }}
            onClose={() => {
              setIsSettingsOpen(false);
            }}
            onSpeechPolicyOverridesChange={handleSpeechPolicyOverridesChange}
            onSpeechPolicyProfileChange={(profile) => {
              void handleSpeechPolicyProfileChange(profile);
            }}
            onSubmit={() => {
              setIsSettingsOpen(false);
              createAndListenFromCurrentSource();
            }}
            onTelepromptTheatreSettingsChange={handleTelepromptTheatreSettingsChange}
            onTeleprompterSettingsChange={(settings) => {
              setTeleprompterSettings(normalizeTeleprompterHighlightSettings(settings));
            }}
            onThemeChange={setThemeName}
            onUiMemoryExportPreferences={handleUiMemoryExportPreferences}
            onUiMemoryImportPreferences={handleUiMemoryImportPreferences}
            onUiMemoryPreferenceChange={handleUiMemoryPreferenceChange}
            onUiMemoryReset={handleUiMemoryReset}
            onUpdateCustomSpeechPolicyProfile={handleUpdateCustomSpeechPolicyProfile}
          />
        </Suspense>
      ) : null}
      {isBundlePanelOpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading bundle tools..." />}>
          <BundleFlowPanel
            activeProjectId={activeProjectId}
            activeProjectName={studioProjectName}
            isOpen={isBundlePanelOpen}
            mode={bundlePanelMode}
            projects={projects}
            onClose={() => {
              setIsBundlePanelOpen(false);
            }}
            onImported={handleBundleImported}
          />
        </Suspense>
      ) : null}
      {isContentIROpen ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading content structure..." />}>
          <ContentIRDrawer
            document={contentIRDocument}
            error={contentIRError}
            isLoading={isContentIRLoading}
            isOpen={isContentIROpen}
            title={contentIRTitle}
            onClose={() => {
              setIsContentIROpen(false);
            }}
          />
        </Suspense>
      ) : null}
      {studioMode === "narration" ? (
        <Suspense fallback={null}>
          <LazyGlobalPreviewPlayer
            activeBlockId={workspaceContext.activeBlockId}
            blocks={narrationPreviewBlocks}
            canOpenCinema={canOpenCurrentCinema}
            currentPolicyId={speechPolicyProfile}
            currentRunMode={runConfiguration.runMode}
            currentVoiceId={selectedVoiceProfileId || "default"}
            hidden={!globalPreviewVisible || workspaceOverlay.previewPlacement === "hidden"}
            isPlaybackActive={isPlaybackActive}
            job={job}
            playbackControls={playbackControls}
            playbackCursorSec={playbackCursorSec}
            placement={workspaceOverlay.previewPlacement}
            policyOptions={globalPreviewPolicyOptions}
            providerEngineId={runConfiguration.ttsEngine}
            providerEngines={ttsEngines}
            policyProfileLabel={speechPolicyProfileDisplayName(
              speechPolicyProfile,
              customSpeechPolicyProfiles,
            )}
            runConfigurationLabel={getRunModePreset(runConfiguration.runMode).label}
            scopeLabel={workbenchScopeTitle({
              selectedBookScope: effectiveBookScope,
              selectedBookSource: activeNarrationBookSource,
              selectedPreparedSource: activeNarrationPreparedSource,
              sourceMode,
            })}
            sourceLabel={narrationReviewSourceLabel(
              activeNarrationPreparedSource,
              activeNarrationBookSource,
            )}
            variant={
              workspaceOverlay.previewPlacement === "floating"
                ? previewPlayerVariantForSurface({ isSettingsOpen, stage: contentMode })
                : workspaceOverlay.previewVariant
            }
            voiceOptions={globalPreviewVoiceOptions}
            voiceProfileLabel={selectedVoiceProfileLabel}
            onActiveBlockChange={(blockId) => {
              setWorkspaceContext((currentContext) =>
                withWorkspaceActiveBlock(currentContext, blockId),
              );
            }}
            onOpenCinema={openReadingCinema}
            onPolicyProfileChange={handleSpeechPolicyProfileChange}
            onRunModeChange={handleGlobalPreviewRunModeChange}
            onVoiceProfileChange={handleGlobalPreviewVoiceChange}
          />
        </Suspense>
      ) : null}
      <TeleprompterPanel
        canOpenBookCinema={canOpenBookCinema}
        isPlaybackActive={isPlaybackActive}
        job={job}
        latestProgress={latestProgress}
        openSignal={teleprompterOpenSignal}
        playbackControls={playbackControls}
        playbackCursorSec={playbackCursorSec}
        preparedSourceForCinema={jobPreparedSource ?? selectedPreparedSource}
        settings={teleprompterSettings}
        showInlinePreview={false}
        themeName={themeName}
        onOpenBookCinema={openReadingCinema}
        onOpenSettings={() => {
          setSettingsCommandTarget(null);
          setIsSettingsOpen(true);
        }}
        onResumeProgress={(progress) => {
          void handleResumeProgress(progress);
        }}
      />
      {rightRailMode !== "full" && job ? (
        <PlaybackControllerHost
          job={job}
          latestProgress={latestProgress}
          onOpenCinema={openReadingCinema}
          onPlaybackCursorChange={setPlaybackCursorSec}
          onPlaybackControlsChange={handlePlaybackControlsChange}
          onPlaybackStateChange={setIsPlaybackActive}
          onResumeProgress={(progress) => {
            void handleResumeProgress(progress);
          }}
        />
      ) : null}
      {isBookCinemaOpen && selectedBookSource && effectiveBookScope ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading Book Cinema..." />}>
          <BookCinemaOverlay
            book={selectedBookSource}
            bookSources={bookSources}
            canCreateAudio={!isProcessing}
            customPolicyProfiles={customSpeechPolicyProfiles}
            importError={bookSourceError}
            isImporting={isImportingBookSource}
            isProcessing={isProcessing}
            isResumeRestoring={isResumeRestoring}
            job={job}
            playbackControls={playbackControls}
            playbackCursorSec={playbackCursorSec}
            policyDefinition={speechPolicyDefinition}
            policyError={speechPolicyError}
            policyOverrides={speechPolicyOverrides}
            policyProfile={speechPolicyProfile}
            policyProfiles={speechPolicyProfiles}
            progress={selectedBookProgress ?? hashProgress}
            progressItems={projectProgress}
            resumeFallbackNotice={resumeFallbackNotice}
            readAlongPreferences={readAlongPreferences}
            sourcePolicySaving={sourcePolicySavingKey === `book:${selectedBookSource.id}`}
            theatreControlsSignal={cinemaTheatreControlsSignal}
            theatreExitSignal={cinemaTheatreExitSignal}
            theatreOpenSignal={cinemaTheatreOpenSignal}
            uiMemoryFocusState={resolveLiveCinemaFocusState("book")}
            uiMemoryResetSignal={uiMemoryResetSignal}
            accessibilitySettings={readerAccessibilitySettings}
            scope={effectiveBookScope}
            scopeContent={bookScopeContent}
            highlightMap={highlightMap}
            themeName={bookCinemaThemeName}
            onClose={() => {
              setIsBookCinemaOpen(false);
            }}
            onCreateAudio={(book, scope) => {
              void submitBookNarrationJob(book, scope);
            }}
            onImport={handleImportBookSource}
            onInspectStructure={(book) => {
              void handleInspectContentIR(book.id, bookSourceName(book));
            }}
            onBookmark={() => {
              void handleAddPlaybackBookmark();
            }}
            onCommandPaletteOpen={() => {
              openCommandPalette("commands");
            }}
            onPlayPause={handleBookCinemaPlayPause}
            onHelpOpen={openContextualHelp}
            onRestart={handleBookCinemaRestart}
            onScopeChange={setSelectedBookScope}
            onSelectBook={handleSelectBookCinemaSource}
            onShortcutCheatSheetOpen={openShortcutCheatSheet}
            onSkip={handleBookCinemaSkip}
            onClearSourcePolicy={() => handleClearBookSourcePolicy(selectedBookSource.id)}
            onResumeProgress={(progress, seconds) => {
              void handleResumeProgress(progress, seconds);
            }}
            onSaveSourcePolicy={(request) =>
              handleSaveBookSourcePolicy(selectedBookSource.id, request)
            }
            onAccessibilitySettingsChange={setReaderAccessibilitySettings}
            onThemeChange={setBookCinemaThemeName}
            onUiMemoryFocusStateChange={handleBookCinemaFocusStateChange}
          />
        </Suspense>
      ) : null}
      {preparedSourceCinemaSource ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading source cinema..." />}>
          <PreparedCinemaOverlay
            accessibilitySettings={readerAccessibilitySettings}
            activeWordIndex={preparedSourceCinemaCue?.documentActiveWordIndex ?? -1}
            canCreateAudio={!isProcessing}
            importError={sourcePrepError}
            isImporting={isPreparingSource}
            isProcessing={isProcessing}
            isPlaybackActive={
              isPlaybackActive &&
              preparedSourceCinemaJobMatchesSource(job, preparedSourceCinemaSource)
            }
            job={preparedSourceCinemaJob}
            playbackControls={playbackControls}
            playbackCursorSec={playbackCursorSec}
            customPolicyProfiles={customSpeechPolicyProfiles}
            policyDefinition={speechPolicyDefinition}
            policyError={speechPolicyError}
            policyOverrides={speechPolicyOverrides}
            policyProfile={speechPolicyProfile}
            policyProfiles={speechPolicyProfiles}
            progress={preparedSourceCinemaProgress}
            progressItems={projectProgress}
            readAlongPreferences={readAlongPreferences}
            source={preparedSourceCinemaSource}
            sourcePolicySaving={
              sourcePolicySavingKey === `prepared:${preparedSourceCinemaSource.id}`
            }
            sources={preparedSources}
            theatreControlsSignal={cinemaTheatreControlsSignal}
            theatreExitSignal={cinemaTheatreExitSignal}
            theatreOpenSignal={cinemaTheatreOpenSignal}
            themeName={preparedSourceCinemaThemeName}
            uiMemoryFocusState={resolveLiveCinemaFocusState(preparedSourceCinemaSurfaceKind)}
            uiMemoryResetSignal={uiMemoryResetSignal}
            onAccessibilitySettingsChange={setReaderAccessibilitySettings}
            onBookmark={() => {
              void handleAddPlaybackBookmark();
            }}
            onCommandPaletteOpen={() => {
              openCommandPalette("commands");
            }}
            onClearSourcePolicy={() =>
              handleClearPreparedSourcePolicy(preparedSourceCinemaSource.id)
            }
            onClose={() => {
              setPreparedSourceCinemaSourceId(null);
            }}
            onCreateAudio={(source) => {
              void submitPreparedSourceJob(source);
            }}
            onInspectStructure={(source) => {
              void handleInspectContentIR(source.id, source.title ?? source.sourceName, true);
            }}
            onPrepareFile={handlePrepareCinemaSourceFile}
            onPlayPause={handleBookCinemaPlayPause}
            onHelpOpen={openContextualHelp}
            onRerunWebsiteExtraction={handleRerunWebsiteExtraction}
            onRestart={handleBookCinemaRestart}
            onResumeProgress={(progress) => {
              void handleResumeProgress(progress);
            }}
            onSaveSourcePolicy={(request) =>
              handleSavePreparedSourcePolicy(preparedSourceCinemaSource.id, request)
            }
            onSelectSource={handleSelectPreparedCinemaSource}
            onShortcutCheatSheetOpen={openShortcutCheatSheet}
            onSkip={handleBookCinemaSkip}
            onThemeChange={setPreparedSourceCinemaThemeName}
            onUiMemoryFocusStateChange={handlePreparedCinemaFocusStateChange}
          />
        </Suspense>
      ) : null}

      <ResearchModulesSetupCard
        error={researchModuleError}
        hidden={isResearchPromptHidden}
        modules={researchModules}
        cloningModuleId={cloningResearchModuleId}
        onClone={(moduleId) => {
          void handleCloneResearchModule(moduleId);
        }}
        onHide={handleHideResearchPrompt}
      />

      {studioMode === "voiceCloning" ? (
        <section
          className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto border-t lg:grid-cols-[var(--studio-left-column)_minmax(0,1fr)_var(--studio-right-column)] lg:overflow-hidden vs-border"
          style={studioGridStyle}
        >
          <aside
            className="vs-raised order-3 flex min-w-0 flex-col border-zinc-200 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-r"
            {...overlayDataAttributes("left-rail", "left-rail")}
          >
            {leftRailMode === "collapsed" ? null : (
              <RailModeToolbar
                label="Voice Command"
                mode={leftRailMode}
                onModeChange={setLeftRailMode}
              />
            )}
            {leftRailMode === "full" ? (
              <VoiceCloningVoiceRail
                buildingArtifactKey={buildingArtifactKey}
                isClearingHuggingFaceToken={isClearingHuggingFaceToken}
                isLoading={isLoadingProfiles}
                profiles={voiceProfiles}
                researchModules={researchModules}
                runConfiguration={runConfiguration}
                savingHuggingFaceTokenKey={savingHuggingFaceTokenKey}
                selectedKokoroVoiceId={selectedKokoroVoiceId}
                selectedProfile={selectedVoiceProfile ?? voiceCloningActivity.activeProfile}
                selectedProfileId={
                  (selectedVoiceProfile ?? voiceCloningActivity.activeProfile)?.id ??
                  selectedVoiceProfileId
                }
                ttsEngines={ttsEngines}
                voiceProfileCredentialError={voiceProfileCredentialError}
                voiceProfileCredentials={voiceProfileCredentials}
                onBuildArtifact={handleBuildVoiceProfileArtifact}
                onClearHuggingFaceToken={() => {
                  void handleClearLocalHuggingFaceToken();
                }}
                onClearSelection={clearVoiceProfileSelection}
                onDeleteProfile={(id) => {
                  void handleDeleteVoiceProfile(id);
                }}
                onOpenVoiceDashboard={() => {
                  setIsVoiceDashboardOpen(true);
                }}
                onRunConfigurationChange={setRunConfiguration}
                onSaveHuggingFaceToken={handleSaveHuggingFaceTokenAndValidate}
                onSelectKokoroVoice={selectKokoroVoice}
                onSelectProfile={selectVoiceProfile}
              />
            ) : (
              <VoiceCloningRailMini
                mode={leftRailMode}
                profile={selectedVoiceProfile}
                source={profileSource}
                totalProfiles={voiceProfiles.length}
                onModeChange={setLeftRailMode}
              />
            )}
          </aside>
          <section className="order-1 min-w-0 px-5 pt-5 pb-24 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pb-5 xl:px-6 xl:pt-6 xl:pb-6">
            <VoiceCloningWorkspace
              activity={voiceCloningActivity}
              buildingArtifactKey={buildingArtifactKey}
              cancelingTargetKey={cancelingTargetKey}
              createCandidateId={profileCandidateCreateId}
              diagnostics={profileSourceDiagnostics}
              error={profileError}
              isCancelingSource={
                profileSource ? cancelingProfileSourceId === profileSource.id : false
              }
              isAnalyzing={isAnalyzingProfileSource}
              refreshingTranscriptKey={refreshingTranscriptKey}
              researchModules={researchModules}
              runConfiguration={runConfiguration}
              source={profileSource}
              ttsEngines={ttsEngines}
              onAnalyze={handleAnalyzeVoiceSource}
              onBuildArtifact={handleBuildVoiceProfileArtifact}
              onCancelSource={handleCancelVoiceProfileSource}
              onCancelTarget={handleCancelVoiceProfileTarget}
              onCreateProfile={handleCreateVoiceProfileFromCandidate}
              onRefreshCandidateTranscript={handleRefreshVoiceCandidateTranscript}
              onRefreshSourceTranscript={handleRefreshVoiceSourceTranscript}
              onRunConfigurationChange={setRunConfiguration}
            />
          </section>
          <aside
            className="vs-raised order-2 flex min-w-0 flex-col border-zinc-200 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l"
            {...overlayDataAttributes("right-rail", "right-rail")}
          >
            {rightRailMode === "collapsed" ? null : (
              <RailModeToolbar
                label="Readiness"
                mode={rightRailMode}
                onModeChange={setRightRailMode}
              />
            )}
            {rightRailMode === "full" ? (
              <div className="grid gap-3 p-4 xl:p-5">
                <CloneArtifactReadinessPanel
                  buildingArtifactKey={buildingArtifactKey}
                  cancelingTargetKey={cancelingTargetKey}
                  modules={researchModules}
                  profile={selectedVoiceProfile ?? voiceCloningActivity.activeProfile}
                  runConfiguration={runConfiguration}
                  ttsEngines={ttsEngines}
                  onBuildArtifact={handleBuildVoiceProfileArtifact}
                  onCancelTarget={handleCancelVoiceProfileTarget}
                  onRunConfigurationChange={setRunConfiguration}
                />
              </div>
            ) : (
              <CloneReadinessRailMini
                activity={voiceCloningActivity}
                mode={rightRailMode}
                onModeChange={setRightRailMode}
                onOpenVoiceCloning={() => {
                  handleStudioModeChange("voiceCloning");
                }}
              />
            )}
          </aside>
        </section>
      ) : (
        <section
          className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto border-t lg:grid-cols-[var(--studio-left-column)_minmax(0,1fr)_var(--studio-right-column)] lg:overflow-hidden vs-border"
          style={studioGridStyle}
        >
          <aside
            className="vs-raised order-3 flex min-w-0 flex-col border-zinc-200 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-r"
            {...overlayDataAttributes("left-rail", "left-rail")}
          >
            {leftRailMode === "collapsed" ? null : (
              <RailModeToolbar
                label="Voice Command"
                mode={leftRailMode}
                onModeChange={setLeftRailMode}
              />
            )}
            {leftRailMode === "full" ? (
              <NarrationSidebar
                bookSources={bookSources}
                customSpeechPolicyProfiles={customSpeechPolicyProfiles}
                preparedSources={preparedSources}
                profiles={voiceProfiles}
                researchModules={researchModules}
                runConfiguration={runConfiguration}
                selectedBookSourceId={selectedBookSourceId}
                selectedKokoroVoiceId={selectedKokoroVoiceId}
                selectedPreparedSourceId={selectedPreparedSourceId}
                selectedProfile={selectedVoiceProfile}
                selectedProfileId={selectedVoiceProfileId}
                speechPolicyProfile={speechPolicyProfile}
                speechPolicyProfiles={speechPolicyProfiles}
                ttsEngines={ttsEngines}
                onClearSelection={clearVoiceProfileSelection}
                onCloneVoice={() => {
                  handleStudioModeChange("voiceCloning");
                }}
                onInspectSelectedSource={() => {
                  if (selectedPreparedSource) {
                    void handleInspectContentIR(
                      selectedPreparedSource.id,
                      selectedPreparedSource.title ?? selectedPreparedSource.sourceName,
                      true,
                    );
                    return;
                  }
                  if (selectedBookSource) {
                    void handleInspectContentIR(
                      selectedBookSource.id,
                      bookSourceName(selectedBookSource),
                    );
                  }
                }}
                onCreateSource={() => {
                  setContentMode("intake");
                  setSourceMode("text");
                }}
                onOpenProjectDashboard={() => {
                  setIsProjectDashboardOpen(true);
                }}
                onOpenVoiceDashboard={() => {
                  setIsVoiceDashboardOpen(true);
                }}
                onSelectProfile={selectVoiceProfile}
                onSpeechPolicyProfileChange={(profile) => {
                  void handleSpeechPolicyProfileChange(profile);
                }}
              />
            ) : (
              <NarrationRailMini
                activeSourceLabel={
                  activeNarrationPreparedSource?.title ??
                  (activeNarrationBookSource
                    ? bookSourceName(activeNarrationBookSource)
                    : undefined)
                }
                mode={leftRailMode}
                profile={selectedVoiceProfile}
                sourceCount={preparedSources.length + bookSources.length}
                onModeChange={setLeftRailMode}
                onOpenVoiceCloning={() => {
                  handleStudioModeChange("voiceCloning");
                }}
              />
            )}
          </aside>

          <section className="order-1 flex min-w-0 flex-col gap-3 px-4 pt-4 pb-24 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:pb-4 xl:px-5 xl:pt-5 xl:pb-5">
            <SourceTextPanel
              activeReviewPane={activeReviewPane}
              activeReviewBlockId={workspaceContext.activeBlockId}
              projectId={activeProjectId}
              bookSourceError={bookSourceError}
              bookSources={bookSources}
              canSubmit={canCreateCurrentSource}
              contentMode={contentMode}
              isImportingBookSource={isImportingBookSource}
              isPreparingSource={isPreparingSource}
              isProcessing={isProcessing}
              job={job}
              bookScopeContent={bookScopeContent}
              optimizedText={job?.optimizedText ?? ""}
              preparedSources={preparedSources}
              selectedBookScope={effectiveBookScope}
              selectedBookSource={selectedBookSource}
              selectedPreparedSource={selectedPreparedSource}
              sourceMode={sourceMode}
              speechPolicyProfileLabel={speechPolicyProfileDisplayName(
                speechPolicyProfile,
                customSpeechPolicyProfiles,
              )}
              sourcePrepError={sourcePrepError}
              telepromptStage={
                <Suspense fallback={<LazySurfaceFallback label="Loading teleprompt..." />}>
                  <LazyTelepromptStudio
                    activeBlockId={workspaceContext.activeBlockId}
                    blocks={narrationPreviewBlocks}
                    canCreate={canCreateCurrentSource}
                    canOpenCinema={canOpenCurrentCinema}
                    createAndListenCapabilityReason={createAndListenCapabilityReason}
                    createAndListenDisabledReason={createAndListenDisabledReason}
                    highlightMap={highlightMap}
                    highlightMapV2={highlightMapV2}
                    isPlaybackActive={isPlaybackActive}
                    job={job}
                    playbackControls={playbackControls}
                    playbackCursorSec={playbackCursorSec}
                    policyProfile={speechPolicyProfileDisplayName(
                      speechPolicyProfile,
                      customSpeechPolicyProfiles,
                    )}
                    projectId={activeProjectId}
                    rememberReturnMemory={uiMemory.rememberTelepromptReturnTarget}
                    returnStage={workspaceContext.telepromptReturnStage}
                    scopeLabel={workbenchScopeTitle({
                      selectedBookScope: effectiveBookScope,
                      selectedBookSource: activeNarrationBookSource,
                      selectedPreparedSource: activeNarrationPreparedSource,
                      sourceMode,
                    })}
                    sourceLabel={narrationReviewSourceLabel(
                      activeNarrationPreparedSource,
                      activeNarrationBookSource,
                    )}
                    sourceLifecycle={workbenchSourceLifecycleEnvelope({
                      job,
                      projectId: activeProjectId,
                      selectedScopeLabel: workbenchScopeTitle({
                        selectedBookScope: effectiveBookScope,
                        selectedBookSource: activeNarrationBookSource,
                        selectedPreparedSource: activeNarrationPreparedSource,
                        sourceMode,
                      }),
                      selectedBookSource: activeNarrationBookSource,
                      selectedPreparedSource: activeNarrationPreparedSource,
                      sourceMode,
                      surface: "Teleprompt",
                      text,
                    })}
                    sourceMeta={narrationReviewSourceMeta({
                      bookScopeContent,
                      selectedBookScope: effectiveBookScope,
                      selectedBookSource: activeNarrationBookSource,
                      selectedPreparedSource: activeNarrationPreparedSource,
                      text,
                    })}
                    settings={teleprompterSettings}
                    theatreSettings={telepromptTheatreSettings}
                    theatreSettingsMemoryEnabled={uiMemory.rememberTelepromptTheatreSettings}
                    sourceId={
                      activeNarrationPreparedSource?.id ?? activeNarrationBookSource?.id ?? null
                    }
                    voiceProfile={selectedVoiceProfileLabel}
                    sourceType={activeNarrationSourceType}
                    theatreOpenSignal={telepromptTheatreOpenSignal}
                    onActiveBlockChange={(blockId) => {
                      setWorkspaceContext((currentContext) =>
                        withWorkspaceActiveBlock(currentContext, blockId),
                      );
                    }}
                    onBackToPreview={() => {
                      runWorkspaceStageAction("previewSpeech");
                    }}
                    onBackToReview={() => {
                      runWorkspaceStageAction("reviewBlocks");
                    }}
                    onCreateAndListen={createAndListenFromCurrentSource}
                    onOpenCinema={openReadingCinema}
                    onTheatreSettingsChange={handleTelepromptTheatreSettingsChange}
                  />
                </Suspense>
              }
              text={text}
              voiceProfileId={selectedVoiceProfileId}
              voiceProfileLabel={selectedVoiceProfileLabel}
              voiceProfiles={voiceProfiles}
              onCreateAndListen={createAndListenFromCurrentSource}
              createAndListenCapabilityReason={createAndListenCapabilityReason}
              createAndListenDisabledReason={createAndListenDisabledReason}
              createAndListenScope={createAndListenScope}
              onInspectBookSource={(book) => {
                void handleInspectContentIR(book.id, bookSourceName(book));
              }}
              onInspectPreparedSource={(source) => {
                void handleInspectContentIR(source.id, source.title ?? source.sourceName, true);
              }}
              onOpenCinema={openReadingCinema}
              onOpenBookCinema={openBookCinemaFromIntake}
              onOpenVoiceCloning={() => {
                handleStudioModeChange("voiceCloning");
              }}
              onOpenPreparedSourceCinema={openPreparedSourceCinema}
              onImportBookSource={handleImportBookSource}
              onBookScopeChange={setSelectedBookScope}
              onPrepareFile={handlePrepareSourceFile}
              onPrepareUrl={handlePrepareSourceUrl}
              providerBackedGenerationBoundary={providerBackedGenerationBoundary}
              onSelectVoiceProfile={selectVoiceProfile}
              onSourceModeChange={setSourceMode}
              onStageAction={runWorkspaceStageAction}
              onSpeechPolicyProfileChange={(profile) => {
                void handleSpeechPolicyProfileChange(profile);
              }}
              onReviewBlockChange={(blockId) => {
                setWorkspaceContext((currentContext) =>
                  withWorkspaceActiveBlock(currentContext, blockId),
                );
              }}
              onReviewPaneChange={handleReviewPaneChange}
              onSubmit={handleSubmit}
              onTextChange={setText}
              onUseBookSource={handleUseBookText}
              onUsePreparedSource={handleUsePreparedSource}
              runConfigurationLabel={getRunModePreset(runConfiguration.runMode).label}
            />
            {error ? (
              <section className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                {error}
              </section>
            ) : null}
          </section>

          <aside
            className="vs-raised order-2 flex min-w-0 flex-col border-zinc-200 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l"
            {...overlayDataAttributes("right-rail", "right-rail")}
          >
            {rightRailMode === "collapsed" ? null : (
              <RailModeToolbar
                label="Playback"
                mode={rightRailMode}
                onModeChange={setRightRailMode}
              />
            )}
            {rightRailMode === "full" ? (
              <div className="grid gap-3 p-4 xl:p-5">
                {job || isProcessing ? (
                  <AudioPanel
                    canOpenCinema={Boolean(job) || canOpenBookCinema}
                    job={job}
                    latestProgress={latestProgress}
                    onOpenCinema={openReadingCinema}
                    onPlaybackCursorChange={setPlaybackCursorSec}
                    onPlaybackControlsChange={handlePlaybackControlsChange}
                    onPlaybackStateChange={setIsPlaybackActive}
                    onResumeProgress={(progress) => {
                      void handleResumeProgress(progress);
                    }}
                  />
                ) : (
                  <NarrationStageContextPanel
                    policyProfile={speechPolicyProfileDisplayName(
                      speechPolicyProfile,
                      customSpeechPolicyProfiles,
                    )}
                    sourceLabel={
                      activeNarrationPreparedSource?.title ??
                      activeNarrationPreparedSource?.sourceName ??
                      (activeNarrationBookSource
                        ? bookSourceName(activeNarrationBookSource)
                        : "Draft text")
                    }
                    stage={contentMode}
                  />
                )}
                {job?.progress.message ? <ProgressPanel job={job} now={now} /> : null}
                {job || systemMetricsError ? (
                  <RelevantMetricsPanel
                    job={job}
                    metrics={systemMetrics}
                    metricsError={systemMetricsError}
                  />
                ) : null}
              </div>
            ) : (
              <PlaybackRailMini
                job={job}
                mode={rightRailMode}
                onModeChange={setRightRailMode}
                onOpenCinema={openReadingCinema}
                showCinemaAction={shouldShowRailCinemaShortcut(contentMode)}
              />
            )}
          </aside>
        </section>
      )}
      <PipelineStatusFooter
        activeJobId={activeJobId}
        canSubmit={canCreateCurrentSource}
        hint={ttsPipelineHint}
        isProcessing={isProcessing}
        job={job}
        mode={activityFooterMode}
        pipeline={ttsPipeline}
        showNarrationAction={false}
        voiceCloningActivity={voiceCloningActivity}
        onCancel={() => {
          void handleCancelVoiceJob();
        }}
        onOpenVoiceCloning={() => {
          handleStudioModeChange("voiceCloning");
        }}
        onModeChange={setActivityFooterMode}
        onSubmit={() => {
          createAndListenFromCurrentSource();
        }}
      />
    </main>
  );
}

function NarrationRailMini({
  activeSourceLabel,
  mode,
  profile,
  sourceCount,
  onModeChange,
  onOpenVoiceCloning,
}: Readonly<{
  activeSourceLabel?: string;
  mode: ActivityFooterMode;
  profile: VoiceProfile | null;
  sourceCount: number;
  onModeChange: (mode: ActivityFooterMode) => void;
  onOpenVoiceCloning: () => void;
}>) {
  if (mode === "collapsed") {
    return (
      <CompactRailToggle
        controlId="voice-command"
        onExpand={() => {
          onModeChange("compact");
        }}
      />
    );
  }
  return (
    <RailMiniStack
      items={[
        { label: "Sources", value: String(sourceCount), detail: activeSourceLabel ?? "No source" },
        { label: "Voice", value: profile?.name ?? "Default", detail: profile?.status ?? "ready" },
        { label: "Backend", value: "Run", detail: "Settings" },
      ]}
      actionLabel="Clone"
      actionSurface="Voice Command"
      actionTestId="ui-action-rail-narration-open-voice-cloning"
      onAction={onOpenVoiceCloning}
    />
  );
}

function VoiceCloningRailMini({
  mode,
  profile,
  source,
  totalProfiles,
  onModeChange,
}: Readonly<{
  mode: ActivityFooterMode;
  profile: VoiceProfile | null;
  source: VoiceProfileSource | null;
  totalProfiles: number;
  onModeChange: (mode: ActivityFooterMode) => void;
}>) {
  if (mode === "collapsed") {
    return (
      <CompactRailToggle
        controlId="voice-cloning"
        onExpand={() => {
          onModeChange("compact");
        }}
      />
    );
  }
  return (
    <RailMiniStack
      items={[
        { label: "Media", value: source ? "Active" : "Empty", detail: source?.status ?? "idle" },
        { label: "Voice", value: profile?.name ?? "None", detail: profile?.status ?? "select" },
        { label: "Saved", value: String(totalProfiles), detail: "voices" },
      ]}
    />
  );
}

function PlaybackRailMini({
  job,
  mode,
  onModeChange,
  onOpenCinema,
  showCinemaAction = true,
}: Readonly<{
  job: VoiceJob | null;
  mode: ActivityFooterMode;
  onModeChange: (mode: ActivityFooterMode) => void;
  onOpenCinema: () => void;
  showCinemaAction?: boolean;
}>) {
  const total = job?.retries.totalSegments ?? job?.segments?.length ?? 0;
  const ready = job?.audioReadySegments ?? 0;
  if (mode === "collapsed") {
    return (
      <CompactRailToggle
        controlId="playback"
        onExpand={() => {
          onModeChange("compact");
        }}
      />
    );
  }
  return (
    <RailMiniStack
      items={[
        { label: "Audio", value: job?.status ?? "Idle", detail: estimateFirstAudioETA(job) },
        {
          label: "Segments",
          value: total > 0 ? formatPercentageRatio(ready, total) : "0%",
          detail: total > 0 ? `${String(ready)} / ${String(total)}` : "waiting",
        },
        { label: "Check", value: formatSimilarity(job?.voiceCheck.similarity ?? 0), detail: "ASR" },
      ]}
      actionLabel={showCinemaAction ? "Cinema" : undefined}
      actionSurface="Playback"
      actionTestId="ui-action-rail-playback-open-cinema"
      onAction={showCinemaAction ? onOpenCinema : undefined}
    />
  );
}

function CloneReadinessRailMini({
  activity,
  mode,
  onModeChange,
  onOpenVoiceCloning,
}: Readonly<{
  activity: VoiceCloningActivitySummary;
  mode: ActivityFooterMode;
  onModeChange: (mode: ActivityFooterMode) => void;
  onOpenVoiceCloning: () => void;
}>) {
  if (mode === "collapsed") {
    return (
      <CompactRailToggle
        controlId="readiness"
        onExpand={() => {
          onModeChange("compact");
        }}
      />
    );
  }
  return (
    <RailMiniStack
      items={[
        { label: "State", value: activity.statusLabel, detail: activity.lastUpdate },
        { label: "Elapsed", value: activity.elapsed, detail: activity.eta },
        { label: "Candidates", value: activity.candidateDetail, detail: "voices" },
      ]}
      actionLabel={activity.actionLabel}
      onAction={onOpenVoiceCloning}
    />
  );
}

function NarrationStageContextPanel({
  policyProfile,
  sourceLabel,
  stage,
}: Readonly<{ policyProfile: string; sourceLabel: string; stage: WorkspaceStage }>) {
  return (
    <Suspense
      fallback={
        <LazySurfaceFallback label="Loading context..." surface="workspace-context-panel" />
      }
    >
      <LazyWorkspaceStageContextPanel
        policyProfile={policyProfile}
        sourceLabel={sourceLabel}
        stage={stage}
      />
    </Suspense>
  );
}

function RelevantMetricsPanel({
  job,
  metrics,
  metricsError,
}: Readonly<{
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
}>) {
  const total = job?.retries.totalSegments ?? job?.segments?.length ?? 0;
  const ready = job?.audioReadySegments ?? 0;
  const throughput = calculateArrivalThroughput(job);
  const gpu = metrics?.gpus?.[0];
  const gpuMemory = gpu ? formatPercentageRatio(gpu.memoryUsedMiB, gpu.memoryTotalMiB) : "n/a";
  const confidence = formatSimilarity(job?.voiceCheck.similarity ?? 0);

  return (
    <section className="rounded-lg border shadow-sm vs-border vs-raised">
      <div className="border-b px-3 py-3 vs-border">
        <h2 className="text-sm font-semibold text-[var(--vs-text)]">Output Health</h2>
        <p className="vs-muted mt-1 truncate text-xs">
          {job ? `${job.status} · ${estimateFirstAudioETA(job)}` : "Waiting for a narration run"}
        </p>
      </div>
      <dl className="grid grid-cols-2">
        <ProductMetric
          label="Segment Progress"
          value={total > 0 ? formatPercentageRatio(ready, total) : "0%"}
          detail={total > 0 ? `${String(ready)} / ${String(total)} segments` : "Waiting"}
          tone="blue"
        />
        <ProductMetric
          label="First Audio ETA"
          value={estimateFirstAudioETA(job)}
          detail="until first checked segment"
        />
        <ProductMetric
          label="Buffer Health"
          value={formatBufferHealth(job)}
          detail={ready > 0 ? `${String(ready)} ready` : "No buffer yet"}
          tone="green"
        />
        <ProductMetric
          label="Clone Pace"
          value={formatPace(throughput?.pace)}
          detail="realtime"
          tone="orange"
        />
        <ProductMetric
          label="Checker Confidence"
          value={confidence}
          detail={job?.voiceCheck.provider ?? "waiting"}
        />
        <ProductMetric
          label="GPU Memory"
          value={gpuMemory}
          detail={gpu?.name ?? metricsError ?? "metrics unavailable"}
          tone="orange"
        />
      </dl>
    </section>
  );
}

function ProductMetric({
  detail,
  label,
  tone = "neutral",
  value,
}: Readonly<{
  detail: string;
  label: string;
  tone?: "neutral" | "blue" | "green" | "orange";
  value: string;
}>) {
  const barClassByTone: Record<"neutral" | "blue" | "green" | "orange", string> = {
    neutral: "bg-blue-500",
    blue: "bg-blue-500",
    green: "bg-emerald-500",
    orange: "bg-orange-500",
  };
  const barClass = barClassByTone[tone];
  return (
    <div className="min-w-0 border-b p-3 last:border-b-0 vs-border">
      <dt className="vs-muted text-xs font-medium">{label}</dt>
      <dd className="mt-2 break-words text-base font-semibold leading-tight text-[var(--vs-text)]">
        {value}
      </dd>
      <p className="vs-muted mt-1 truncate text-xs" title={detail}>
        {detail}
      </p>
      <div className="mt-3 h-1 rounded-full bg-[var(--vs-surface)]">
        <div className={`h-1 w-2/5 rounded-full ${barClass}`} />
      </div>
    </div>
  );
}

function NarrationSidebar({
  bookSources,
  customSpeechPolicyProfiles,
  preparedSources,
  profiles,
  researchModules,
  runConfiguration,
  selectedBookSourceId,
  selectedKokoroVoiceId,
  selectedPreparedSourceId,
  selectedProfile,
  selectedProfileId,
  speechPolicyProfile,
  speechPolicyProfiles,
  ttsEngines,
  onClearSelection,
  onCloneVoice,
  onCreateSource,
  onInspectSelectedSource,
  onOpenProjectDashboard,
  onOpenVoiceDashboard,
  onSelectProfile,
  onSpeechPolicyProfileChange,
}: Readonly<{
  bookSources: BookSource[];
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  preparedSources: PreparedSource[];
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedBookSourceId: string | null;
  selectedKokoroVoiceId: string;
  selectedPreparedSourceId: string | null;
  selectedProfile: VoiceProfile | null;
  selectedProfileId: string;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  ttsEngines: TTSEngineDiagnostics[];
  onClearSelection: () => void;
  onCloneVoice: () => void;
  onCreateSource: () => void;
  onInspectSelectedSource: () => void;
  onOpenProjectDashboard: () => void;
  onOpenVoiceDashboard: () => void;
  onSelectProfile: (id: string) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  const selectedPreparedSource = preparedSources.find(
    (source) => source.id === selectedPreparedSourceId,
  );
  const selectedBookSource = bookSources.find((book) => book.id === selectedBookSourceId);
  const activeSourceLabel =
    selectedPreparedSource?.title ??
    selectedPreparedSource?.sourceName ??
    (selectedBookSource ? bookSourceName(selectedBookSource) : "Draft text");
  const activeSourceDetail = narrationSourceSummaryDetail({
    bookSource: selectedBookSource,
    preparedSource: selectedPreparedSource,
    sourceCount: preparedSources.length + bookSources.length,
  });
  const voiceRuntimeLabel = selectedProfile?.name ?? kokoroVoicepackLabel(selectedKokoroVoiceId);
  const readyCloneModules = researchModules.filter((module) => module.cloneAllowed).length;
  const readyVoiceEngines = ttsEngines.filter((engine) => engine.supportsVoice).length;
  return (
    <section className="min-h-full min-w-0 overflow-visible">
      <div className="grid min-w-0 gap-3 p-4 xl:p-5">
        <section className="grid min-w-0 gap-3 rounded-lg border p-3 vs-border vs-raised">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-semibold text-[var(--vs-text)]">Active Source</h2>
            <span className="vs-muted text-xs">
              {String(preparedSources.length + bookSources.length)} managed
            </span>
          </div>
          <div className="min-w-0 rounded-md border p-3 vs-border vs-surface">
            <p className="min-w-0 truncate text-sm font-semibold" title={activeSourceLabel}>
              {activeSourceLabel}
            </p>
            <p className="vs-muted mt-1 min-w-0 truncate text-xs" title={activeSourceDetail}>
              {activeSourceDetail}
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 2xl:grid-cols-2">
            <button
              className="min-h-9 min-w-0 rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight transition hover:border-orange-300 hover:text-orange-700 vs-border vs-surface"
              data-testid="ui-action-project-dashboard-open-rail"
              data-ui-action-surface="Workspace"
              onClick={onOpenProjectDashboard}
              type="button"
            >
              Manage Sources
            </button>
            <button
              className="min-h-9 min-w-0 rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight transition hover:border-orange-300 hover:text-orange-700 vs-border vs-surface"
              onClick={onCreateSource}
              type="button"
            >
              New Source
            </button>
          </div>
        </section>

        <section className="grid min-w-0 gap-3 rounded-lg border p-3 vs-border vs-raised">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-semibold text-[var(--vs-text)]">Voice Profile</h2>
            <span className="shrink-0 vs-muted text-xs">
              {profiles.length.toString()} profile{profiles.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="min-w-0 rounded-md border p-3 vs-border vs-surface">
            <p className="min-w-0 truncate text-sm font-semibold" title={voiceRuntimeLabel}>
              {voiceRuntimeLabel}
            </p>
            <p className="vs-muted mt-1 min-w-0 truncate text-xs">
              {selectedProfile
                ? `${selectedProfile.language} · ${selectedProfile.status}`
                : `Default Kokoro voice · ${readyVoiceEngines.toString()} voice engines`}
            </p>
          </div>
          <label className="grid min-w-0 gap-1 text-xs font-semibold">
            <span className="vs-muted">Voice profile</span>
            <select
              className="h-9 min-w-0 rounded-md border px-2 text-xs font-semibold vs-border vs-surface"
              onChange={(event) => {
                const nextProfileId = event.currentTarget.value;
                if (nextProfileId) {
                  onSelectProfile(nextProfileId);
                } else {
                  onClearSelection();
                }
              }}
              value={selectedProfileId}
            >
              <option value="">Default Kokoro</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid min-w-0 grid-cols-1 gap-2 2xl:grid-cols-2">
            <button
              className="min-h-9 min-w-0 rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight transition hover:border-orange-300 hover:text-orange-700 vs-border vs-surface"
              data-testid="ui-action-voice-dashboard-open-rail"
              data-ui-action-surface="Workspace"
              onClick={onOpenVoiceDashboard}
              type="button"
            >
              Manage Voices
            </button>
            <button
              className="min-h-9 min-w-0 rounded-md border border-orange-300 bg-orange-500/10 px-2 py-1.5 text-xs font-semibold leading-tight text-orange-700 transition hover:bg-orange-500/15"
              onClick={onCloneVoice}
              type="button"
            >
              Clone Voice
            </button>
          </div>
          <p className="vs-muted text-xs leading-5">
            {readyCloneModules.toString()} clone module
            {readyCloneModules === 1 ? "" : "s"} available for profile preparation.
          </p>
        </section>

        <section className="grid min-w-0 gap-3 rounded-lg border p-3 text-xs vs-border vs-raised">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h2 className="min-w-0 text-sm font-semibold text-[var(--vs-text)]">
              Run / Policy Summary
            </h2>
            <button
              className="min-h-8 shrink-0 rounded border px-2 py-1 font-semibold leading-tight transition hover:border-orange-300 hover:text-orange-700 vs-border vs-surface"
              onClick={onInspectSelectedSource}
              type="button"
            >
              Content Structure
            </button>
          </div>
          <dl className="grid gap-2">
            <SidebarFact
              label="Run mode"
              value={getRunModePreset(runConfiguration.runMode).label}
            />
            <SidebarFact label="Performance" value={runConfiguration.performanceMode} />
            <SidebarFact
              label="Speech Policy"
              value={speechPolicyProfileDisplayName(
                speechPolicyProfile,
                customSpeechPolicyProfiles,
              )}
            />
          </dl>
          <select
            className="h-9 rounded-md border px-2 text-xs font-semibold vs-border vs-surface"
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
        </section>
      </div>
    </section>
  );
}

function VoiceCloningVoiceRail({
  buildingArtifactKey,
  isClearingHuggingFaceToken,
  isLoading,
  profiles,
  researchModules,
  runConfiguration,
  savingHuggingFaceTokenKey,
  selectedKokoroVoiceId,
  selectedProfile,
  selectedProfileId,
  ttsEngines,
  voiceProfileCredentialError,
  voiceProfileCredentials,
  onBuildArtifact,
  onClearHuggingFaceToken,
  onClearSelection,
  onDeleteProfile,
  onOpenVoiceDashboard,
  onRunConfigurationChange,
  onSaveHuggingFaceToken,
  onSelectKokoroVoice,
  onSelectProfile,
}: Readonly<{
  buildingArtifactKey: string | null;
  isClearingHuggingFaceToken: boolean;
  isLoading: boolean;
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  savingHuggingFaceTokenKey: string | null;
  selectedKokoroVoiceId: string;
  selectedProfile: VoiceProfile | null;
  selectedProfileId: string;
  ttsEngines: TTSEngineDiagnostics[];
  voiceProfileCredentialError: string | null;
  voiceProfileCredentials: VoiceProfileCredentialStatus | null;
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onClearHuggingFaceToken: () => void;
  onClearSelection: () => void;
  onDeleteProfile: (id: string) => void;
  onOpenVoiceDashboard: () => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSaveHuggingFaceToken: (profileId: string, targetId: string, token: string) => Promise<void>;
  onSelectKokoroVoice: (voiceId: string) => void;
  onSelectProfile: (id: string) => void;
}>) {
  return (
    <section className="min-h-full min-w-0 overflow-visible">
      <div className="grid min-w-0 gap-3 p-4 xl:p-5">
        <VoiceProfileDropdown
          heading="Voice Profile"
          buildingArtifactKey={buildingArtifactKey}
          isClearingHuggingFaceToken={isClearingHuggingFaceToken}
          isLoading={isLoading}
          profiles={profiles}
          researchModules={researchModules}
          runConfiguration={runConfiguration}
          savingHuggingFaceTokenKey={savingHuggingFaceTokenKey}
          selectedKokoroVoiceId={selectedKokoroVoiceId}
          selectedProfile={selectedProfile}
          selectedProfileId={selectedProfileId}
          ttsEngines={ttsEngines}
          voiceProfileCredentialError={voiceProfileCredentialError}
          voiceProfileCredentials={voiceProfileCredentials}
          showArtifactControls={false}
          showBackendControls={false}
          showBackendSummary={false}
          onBuildArtifact={onBuildArtifact}
          onClearHuggingFaceToken={onClearHuggingFaceToken}
          onClearSelection={onClearSelection}
          onDeleteProfile={onDeleteProfile}
          onOpenVoiceDashboard={onOpenVoiceDashboard}
          onRunConfigurationChange={onRunConfigurationChange}
          onSaveHuggingFaceToken={onSaveHuggingFaceToken}
          onSelectKokoroVoice={onSelectKokoroVoice}
          onSelectProfile={onSelectProfile}
        />
      </div>
    </section>
  );
}

function voiceLibraryProfileStatus(profile: VoiceProfile): { label: string; className: string } {
  if (profileHasActiveTarget(profile)) {
    return { label: "Building", className: "bg-amber-100 text-amber-800" };
  }
  if (profileHasTargetAttention(profile)) {
    return { label: "Issue", className: "bg-red-100 text-red-700" };
  }
  if (profileHasReadyCloneTarget(profile)) {
    return { label: "Ready", className: "bg-emerald-100 text-emerald-700" };
  }
  if (profile.status === "error") {
    return { label: "Issue", className: "bg-red-100 text-red-700" };
  }
  return { label: profile.status, className: "bg-zinc-100 text-zinc-600" };
}

function VoiceCloningWorkspace({
  activity,
  buildingArtifactKey,
  cancelingTargetKey,
  createCandidateId,
  diagnostics,
  error,
  isCancelingSource,
  isAnalyzing,
  refreshingTranscriptKey,
  researchModules,
  runConfiguration,
  source,
  ttsEngines,
  onAnalyze,
  onBuildArtifact,
  onCancelSource,
  onCancelTarget,
  onCreateProfile,
  onRefreshCandidateTranscript,
  onRefreshSourceTranscript,
  onRunConfigurationChange,
}: Readonly<{
  activity: VoiceCloningActivitySummary;
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  createCandidateId: string | null;
  diagnostics: VoiceProfileSourceDiagnostics | null;
  error: string | null;
  isCancelingSource: boolean;
  isAnalyzing: boolean;
  refreshingTranscriptKey: string | null;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  source: VoiceProfileSource | null;
  ttsEngines: TTSEngineDiagnostics[];
  onAnalyze: (file: File) => Promise<void>;
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelSource: (sourceId: string) => Promise<void>;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onCreateProfile: (
    candidate: VoiceProfileCandidate,
    request: CreateVoiceProfileFromCandidateRequest,
  ) => Promise<void>;
  onRefreshCandidateTranscript: (candidate: VoiceProfileCandidate) => Promise<void>;
  onRefreshSourceTranscript: (sourceId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  return (
    <section className="grid min-w-0 gap-5">
      <VoiceCloningActivityPanel
        activity={activity}
        isCancelingSource={isCancelingSource}
        source={source}
        onCancelSource={onCancelSource}
      />
      <BackendContractReviewPanel
        activeEngineId={runConfiguration.ttsEngine}
        buildingArtifactKey={buildingArtifactKey}
        cancelingTargetKey={cancelingTargetKey}
        modules={researchModules}
        profile={activity.activeProfile}
        runConfiguration={runConfiguration}
        ttsEngines={ttsEngines}
        onBuildArtifact={onBuildArtifact}
        onCancelTarget={onCancelTarget}
        onRunConfigurationChange={onRunConfigurationChange}
      />
      <Suspense fallback={<LazySurfaceFallback label="Loading source diagnostics..." />}>
        <VoiceSourceAnalysisPanel
          createCandidateId={createCandidateId}
          diagnostics={diagnostics}
          error={error}
          isAnalyzing={isAnalyzing}
          refreshingTranscriptKey={refreshingTranscriptKey}
          researchModules={researchModules}
          source={source}
          ttsEngines={ttsEngines}
          onAnalyze={onAnalyze}
          onCreateProfile={onCreateProfile}
          onRefreshCandidateTranscript={onRefreshCandidateTranscript}
          onRefreshSourceTranscript={onRefreshSourceTranscript}
        />
      </Suspense>
    </section>
  );
}

function VoiceCloningActivityPanel({
  activity,
  isCancelingSource,
  source,
  onCancelSource,
}: Readonly<{
  activity: VoiceCloningActivitySummary;
  isCancelingSource: boolean;
  source: VoiceProfileSource | null;
  onCancelSource: (sourceId: string) => Promise<void>;
}>) {
  const progress = formatPercentage(voiceCloningProgressRatio(activity.stages));
  const canCancelSource = isVoiceProfileSourceActive(source);
  return (
    <section className="grid gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Voice Cloning Workbench
          </p>
          <h2 className="mt-2 text-xl font-semibold text-zinc-950">Build a reusable voice</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">{activity.message}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canCancelSource && source ? (
            <button
              className="h-9 rounded-md border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              disabled={isCancelingSource}
              onClick={() => {
                void onCancelSource(source.id);
              }}
              type="button"
            >
              {isCancelingSource ? "Cancelling..." : "Cancel Analysis"}
            </button>
          ) : null}
          <ActivityStatusBadge status={activity.status} label={activity.statusLabel} />
        </div>
      </div>
      <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <div className="grid gap-2 md:grid-cols-4">
          <ActivityFact label="Elapsed" value={activity.elapsed} detail={activity.eta} />
          <ActivityFact label="Last Update" value={activity.lastUpdate} detail={activity.eta} />
          <ActivityFact
            label="Source"
            value={activity.sourceDetail}
            detail={activity.candidateDetail}
          />
          <ActivityFact label="Progress" value={progress} detail={activity.detail} />
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white">
          <div className="h-full rounded-full bg-orange-500" style={{ width: progress }} />
        </div>
      </div>
      <ol className="grid gap-2 md:grid-cols-4">
        {activity.stages.map((stage, index) => (
          <li
            className={`rounded-md border p-3 ${
              stage.status === "running"
                ? "border-orange-300 bg-orange-50"
                : "border-zinc-200 bg-zinc-50"
            }`}
            key={stage.label}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-600">
                {String(index + 1)}
              </span>
              <PipelineFooterStage label={stageStatusLabel(stage.status)} status={stage.status} />
            </div>
            <p className="mt-3 text-sm font-semibold text-zinc-950">{stage.label}</p>
            <p className="mt-1 min-h-10 break-words text-xs leading-5 text-zinc-500">
              {stage.detail}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ArtifactBuildTimeoutInput({
  input,
  error,
  onInputChange,
}: Readonly<{
  input: string;
  error: string | null;
  onInputChange: (value: string) => void;
}>) {
  return (
    <label className="grid min-w-0 gap-1 rounded-md border p-3 text-xs vs-border vs-raised">
      <span className="font-semibold text-[var(--vs-text)]">Artifact build timeout (seconds)</span>
      <input
        aria-invalid={error ? "true" : "false"}
        className="h-9 min-w-0 rounded-md border px-2 text-sm outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100 vs-border vs-surface"
        inputMode="numeric"
        onChange={(event) => {
          onInputChange(event.currentTarget.value);
        }}
        placeholder="Server default"
        type="number"
        value={input}
      />
      <span className={error ? "text-red-700" : "vs-muted"}>
        {error ?? "Blank uses the server default for this build."}
      </span>
    </label>
  );
}

function CloneArtifactReadinessPanel({
  buildingArtifactKey,
  cancelingTargetKey,
  modules,
  profile,
  runConfiguration,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile | null;
  runConfiguration: RunConfiguration;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const profileIssues = profile ? voiceProfileTargetIssues(profile, modules) : [];
  const artifactBuildTimeout = useArtifactBuildTimeoutState();
  return (
    <section className="grid min-w-0 gap-3 overflow-hidden rounded-lg border p-4 shadow-sm vs-raised">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Clone Readiness</h2>
          <p className="vs-muted mt-1 truncate text-xs">
            {profile ? profile.name : "Select or create a voice profile to prepare engine targets."}
          </p>
        </div>
        {profile ? (
          <span
            className={`rounded px-2 py-1 text-[0.65rem] font-semibold ${voiceLibraryProfileStatus(profile).className}`}
          >
            {voiceLibraryProfileStatus(profile).label}
          </span>
        ) : null}
      </div>
      {profile ? (
        <>
          <ArtifactBuildTimeoutInput
            error={artifactBuildTimeout.error}
            input={artifactBuildTimeout.input}
            onInputChange={artifactBuildTimeout.setInput}
          />
          <CloneTargetReadinessList
            artifactBuildTimeout={artifactBuildTimeout}
            buildingArtifactKey={buildingArtifactKey}
            cancelingTargetKey={cancelingTargetKey}
            modules={modules}
            profile={profile}
            runConfiguration={runConfiguration}
            ttsEngines={ttsEngines}
            onBuildArtifact={onBuildArtifact}
            onCancelTarget={onCancelTarget}
            onRunConfigurationChange={onRunConfigurationChange}
          />
          <CloneReadinessDiagnostics issues={profileIssues} />
        </>
      ) : (
        <p className="break-words rounded-md border border-dashed p-4 text-sm leading-6 vs-border vs-muted">
          Analyze source media, create a candidate, then validate clone artifacts here.
        </p>
      )}
    </section>
  );
}

function CloneReadinessDiagnostics({
  issues,
}: Readonly<{ issues: ReturnType<typeof voiceProfileTargetIssues> }>) {
  if (issues.length === 0) {
    return (
      <div className="rounded-md border p-3 text-xs vs-border vs-surface">
        <p className="font-semibold text-[var(--vs-text)]">Diagnostics</p>
        <p className="vs-muted mt-1 leading-5">
          No blocking setup issues for the selected profile. Detailed provider configuration lives
          in Settings.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-2 rounded-md border p-3 text-xs vs-border vs-surface">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold text-[var(--vs-text)]">Diagnostics</p>
        <span className="rounded bg-amber-100 px-2 py-1 font-semibold text-amber-800">
          {issues.length.toString()}
        </span>
      </div>
      {issues.slice(0, 2).map((issue) => (
        <div
          className={`rounded-md border p-2 ${
            issue.severity === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
          key={issue.key}
        >
          <p className="font-semibold">
            {issue.label}: {issue.title}
          </p>
          <p className="mt-1 line-clamp-2 leading-5">{issue.detail}</p>
        </div>
      ))}
      {issues.length > 2 ? (
        <p className="vs-muted">Open Settings for {String(issues.length - 2)} more issue(s).</p>
      ) : null}
    </div>
  );
}

const BACKEND_CONTRACTS = [
  {
    artifact: "Reference clone",
    engineId: "kokoro-clone",
    label: "Kokoro Clone",
    targetId: "kokoro-clone",
    voiceSource: "Profile",
  },
  {
    artifact: "Style vector",
    engineId: "kokoro-embed",
    label: "Kokoro Embed",
    targetId: "kokoro-embed",
    voiceSource: "Profile",
  },
  {
    artifact: "Style vector",
    engineId: "supertonic-3",
    label: "Supertonic",
    targetId: "supertonic-embed",
    voiceSource: "Profile",
  },
] as const;

type BackendContractRow = (typeof BACKEND_CONTRACTS)[number];

function BackendContractReviewPanel({
  activeEngineId,
  buildingArtifactKey,
  cancelingTargetKey,
  modules,
  profile,
  runConfiguration,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  activeEngineId: string;
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile | null;
  runConfiguration: RunConfiguration;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const artifactBuildTimeout = useArtifactBuildTimeoutState();
  return (
    <section className="grid gap-3 rounded-lg border p-4 shadow-sm vs-border vs-surface">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
            Backend Contract Review
          </p>
          <h3 className="mt-1 text-base font-semibold text-[var(--vs-text)]">
            Profile targets by narration backend
          </h3>
        </div>
        <p className="max-w-lg text-xs leading-5 vs-muted">
          One row per backend. The required target, artifact, readiness, and next action stay
          visible so adding another backend remains a descriptor-level change.
        </p>
      </div>
      <ArtifactBuildTimeoutInput
        error={artifactBuildTimeout.error}
        input={artifactBuildTimeout.input}
        onInputChange={artifactBuildTimeout.setInput}
      />
      <div className="overflow-x-auto rounded-md border vs-border">
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="bg-[var(--vs-raised)] text-[0.65rem] uppercase tracking-[0.14em] vs-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Backend</th>
              <th className="px-3 py-2 font-semibold">Voice Source</th>
              <th className="px-3 py-2 font-semibold">Required Target</th>
              <th className="px-3 py-2 font-semibold">Artifact</th>
              <th className="px-3 py-2 font-semibold">Readiness</th>
              <th className="px-3 py-2 font-semibold">Validation</th>
              <th className="px-3 py-2 font-semibold">User Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--vs-border)]">
            {BACKEND_CONTRACTS.map((contract) => {
              const summary = backendContractSummary({
                activeEngineId,
                buildingArtifactKey,
                cancelingTargetKey,
                contract,
                modules,
                profile,
                ttsEngines,
              });
              const actionBuildsArtifact = backendContractActionBuildsArtifact(summary.status);
              const timeoutBlocksAction = actionBuildsArtifact && !artifactBuildTimeout.canBuild;
              return (
                <tr
                  className={
                    contract.engineId === activeEngineId
                      ? "bg-orange-500/10"
                      : "bg-[var(--vs-surface)] hover:bg-[var(--vs-raised)]"
                  }
                  key={contract.engineId}
                >
                  <td className="px-3 py-3 align-middle">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${backendContractDotClass(summary.status)}`}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-[var(--vs-text)]">
                          {contract.label}
                        </p>
                        <p className="truncate text-[0.68rem] vs-muted">{summary.engineLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 vs-muted">{contract.voiceSource}</td>
                  <td className="px-3 py-3 vs-muted">{moduleLabel(contract.targetId)}</td>
                  <td className="px-3 py-3 vs-muted">{summary.artifact}</td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex rounded-md px-2 py-1 font-semibold ${backendContractStatusClass(summary.status)}`}
                    >
                      {summary.label}
                    </span>
                    <p className="mt-1 max-w-[14rem] truncate text-[0.68rem] vs-muted">
                      {summary.detail}
                    </p>
                  </td>
                  <td className="px-3 py-3 text-[0.68rem] vs-muted">{summary.validationPercent}</td>
                  <td className="px-3 py-3">
                    <button
                      className={`h-8 min-w-28 rounded-md border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${backendContractActionButtonClass(summary.status)}`}
                      disabled={!summary.canAct || timeoutBlocksAction}
                      onClick={() => {
                        handleBackendContractAction({
                          contract,
                          profile,
                          runConfiguration,
                          summary,
                          timeoutSeconds: artifactBuildTimeout.timeoutSeconds,
                          ttsEngines,
                          onBuildArtifact,
                          onCancelTarget,
                          onRunConfigurationChange,
                        });
                      }}
                      title={
                        timeoutBlocksAction ? (artifactBuildTimeout.error ?? undefined) : undefined
                      }
                      type="button"
                    >
                      {summary.actionLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type BackendContractStatus = "ready" | "running" | "failed" | "waiting" | "setup";

interface BackendContractSummary {
  actionLabel: string;
  artifact: string;
  canAct: boolean;
  detail: string;
  engineLabel: string;
  validationPercent: string;
  label: string;
  status: BackendContractStatus;
}

function backendContractSummary({
  activeEngineId,
  buildingArtifactKey,
  cancelingTargetKey,
  contract,
  modules,
  profile,
  ttsEngines,
}: Readonly<{
  activeEngineId: string;
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  contract: BackendContractRow;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile | null;
  ttsEngines: TTSEngineDiagnostics[];
}>): BackendContractSummary {
  const engine = ttsEngines.find((item) => item.id === contract.engineId);
  const engineLabel = engine ? `${engine.label} · ${engine.status}` : contract.engineId;
  const module = modules.find((item) => item.id === contract.targetId);
  const target = profile?.cloneTargets?.[contract.targetId];
  const artifact = profile?.cloneArtifacts?.[contract.targetId];
  const targetKey = profile ? `${profile.id}:${contract.targetId}` : "";
  const isCanceling = cancelingTargetKey === targetKey;
  const isBusy =
    buildingArtifactKey === targetKey ||
    isCanceling ||
    ["queued", "building", "validating"].includes(target?.status ?? "") ||
    artifact?.status === "building";
  const moduleReady =
    contract.targetId === "kokoro-clone" ||
    (module?.installed === true && researchModuleRuntimeReady(module));
  const ready =
    profile !== null &&
    (target?.status === "ready" ||
      artifact?.status === "ready" ||
      (contract.targetId === "kokoro-clone" && !target));
  const validationPercent =
    typeof target?.validation?.score === "number" ? formatSimilarity(target.validation.score) : "—";
  const status = backendContractReadinessStatus({
    artifactStatus: artifact?.status,
    isBusy,
    moduleReady,
    profile,
    ready,
    targetStatus: target?.status,
  });
  return {
    actionLabel: backendContractActionLabel({
      active: activeEngineId === contract.engineId,
      contract,
      isCanceling,
      status,
    }),
    artifact: artifact?.status ?? contract.artifact,
    canAct: backendContractCanAct(status, profile),
    detail:
      target?.error ??
      artifact?.error ??
      target?.validation?.error ??
      (profile ? voiceProfileTargetReadinessText(profile, contract.engineId) : "Select a profile"),
    engineLabel,
    validationPercent,
    label: backendContractReadinessLabel(status),
    status,
  };
}

function backendContractCanAct(
  status: BackendContractStatus,
  profile: VoiceProfile | null,
): boolean {
  if (status === "ready") {
    return true;
  }
  return Boolean(profile) && (status === "running" || status === "failed" || status === "waiting");
}

function backendContractActionBuildsArtifact(status: BackendContractStatus): boolean {
  return status === "failed" || status === "waiting";
}

function backendContractReadinessStatus({
  artifactStatus,
  isBusy,
  moduleReady,
  profile,
  ready,
  targetStatus,
}: Readonly<{
  artifactStatus?: string;
  isBusy: boolean;
  moduleReady: boolean;
  profile: VoiceProfile | null;
  ready: boolean;
  targetStatus?: string;
}>): BackendContractStatus {
  if (isBusy) {
    return "running";
  }
  if (!profile) {
    return "waiting";
  }
  if (!moduleReady) {
    return "setup";
  }
  if (ready) {
    return "ready";
  }
  if (targetStatus === "failed" || artifactStatus === "failed") {
    return "failed";
  }
  return "waiting";
}

function backendContractActionLabel({
  active,
  contract,
  isCanceling,
  status,
}: Readonly<{
  active: boolean;
  contract: BackendContractRow;
  isCanceling: boolean;
  status: BackendContractStatus;
}>): string {
  const actionLabel = moduleLabel(contract.targetId);
  if (isCanceling) {
    return "Cancelling...";
  }
  if (status === "running") {
    return "Cancel";
  }
  if (status === "failed") {
    return `Retry ${actionLabel}`;
  }
  if (status === "ready") {
    return active ? "Selected" : `Use ${actionLabel}`;
  }
  if (status === "waiting") {
    return `Prepare ${actionLabel}`;
  }
  return "Setup needed";
}

function backendContractReadinessLabel(status: BackendContractStatus): string {
  switch (status) {
    case "failed": {
      return "Issue";
    }
    case "ready": {
      return "Ready";
    }
    case "running": {
      return "Working";
    }
    case "setup": {
      return "Setup";
    }
    default: {
      return "Not built";
    }
  }
}

function backendContractStatusClass(status: BackendContractStatus): string {
  if (status === "ready") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "running") {
    return "bg-orange-100 text-orange-800";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (status === "setup") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-zinc-100 text-zinc-600";
}

function backendContractDotClass(status: BackendContractStatus): string {
  if (status === "ready") {
    return "bg-emerald-500";
  }
  if (status === "running") {
    return "bg-orange-500";
  }
  if (status === "failed") {
    return "bg-red-500";
  }
  if (status === "setup") {
    return "bg-amber-500";
  }
  return "bg-zinc-300";
}

function backendContractActionButtonClass(status: BackendContractStatus): string {
  if (status === "failed") {
    return "border-red-200 bg-white text-red-700 hover:bg-red-50";
  }
  if (status === "running") {
    return "border-orange-300 bg-white text-orange-800 hover:bg-orange-50";
  }
  return "border-zinc-200 bg-white text-zinc-800 hover:border-orange-200 hover:bg-orange-50";
}

function handleBackendContractAction({
  contract,
  profile,
  runConfiguration,
  summary,
  timeoutSeconds,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  contract: BackendContractRow;
  profile: VoiceProfile | null;
  runConfiguration: RunConfiguration;
  summary: BackendContractSummary;
  timeoutSeconds?: number;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  if (profile && summary.status === "running") {
    void onCancelTarget(profile.id, contract.targetId);
    return;
  }
  if (profile && (summary.status === "failed" || summary.status === "waiting")) {
    void onBuildArtifact(profile.id, contract.targetId, timeoutSeconds);
    return;
  }
  if (summary.status === "ready") {
    onRunConfigurationChange(
      runConfigurationForBackendContract(runConfiguration, contract.engineId, ttsEngines, profile),
    );
  }
}

function runConfigurationForBackendContract(
  runConfiguration: RunConfiguration,
  engineId: string,
  ttsEngines: TTSEngineDiagnostics[],
  profile: VoiceProfile | null,
): RunConfiguration {
  if (engineId === "kokoro") {
    return applyKokoroRenderMode(runConfiguration, "voicepack");
  }
  if (engineId === "kokoro-clone") {
    return applyKokoroRenderMode(runConfiguration, "kokoclone");
  }
  if (engineId === "kokoro-embed") {
    return applyKokoroRenderMode(runConfiguration, "kokoro-embed");
  }
  if (engineId === "supertonic-3") {
    const engine = ttsEngines.find((item) => item.id === engineId);
    return {
      ...runConfiguration,
      engineOptions: {
        ...runConfiguration.engineOptions,
        lang: runConfiguration.engineOptions.lang ?? "na",
        voiceStyle: runConfiguration.engineOptions.voiceStyle ?? engine?.voices?.[0]?.id ?? "M1",
      },
      options: {
        ...runConfiguration.options,
        voiceClone: Boolean(profile),
      },
      ttsEngine: engineId,
    };
  }
  return {
    ...runConfiguration,
    engineOptions: {},
    options: {
      ...runConfiguration.options,
      voiceClone: false,
    },
    ttsEngine: "auto",
  };
}

function CloneTargetReadinessList({
  artifactBuildTimeout,
  buildingArtifactKey,
  cancelingTargetKey,
  modules,
  profile,
  runConfiguration,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  artifactBuildTimeout: ArtifactBuildTimeoutResolution;
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile;
  runConfiguration: RunConfiguration;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const targetOrder = cloneReadinessTargetOrder(profile);
  return (
    <div className="grid gap-2">
      {targetOrder.map((moduleId) => (
        <CloneTargetReadinessRow
          artifactBuildTimeout={artifactBuildTimeout}
          buildingArtifactKey={buildingArtifactKey}
          cancelingTargetKey={cancelingTargetKey}
          key={moduleId}
          module={modules.find((item) => item.id === moduleId)}
          moduleId={moduleId}
          profile={profile}
          runConfiguration={runConfiguration}
          ttsEngines={ttsEngines}
          onBuildArtifact={onBuildArtifact}
          onCancelTarget={onCancelTarget}
          onRunConfigurationChange={onRunConfigurationChange}
        />
      ))}
    </div>
  );
}

function CloneTargetReadinessRow({
  artifactBuildTimeout,
  buildingArtifactKey,
  cancelingTargetKey,
  module,
  moduleId,
  profile,
  runConfiguration,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  artifactBuildTimeout: ArtifactBuildTimeoutResolution;
  buildingArtifactKey: string | null;
  cancelingTargetKey: string | null;
  module?: ResearchModuleDiagnostics;
  moduleId: string;
  profile: VoiceProfile;
  runConfiguration: RunConfiguration;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const target = profile.cloneTargets?.[moduleId];
  const artifact = profile.cloneArtifacts?.[moduleId];
  const moduleReady =
    moduleId === "kokoro-clone" ||
    (module?.installed === true && researchModuleRuntimeReady(module));
  const status = artifactChipStatus(moduleId, target?.status, artifact?.status, moduleReady);
  const targetKey = `${profile.id}:${moduleId}`;
  const isCanceling = cancelingTargetKey === targetKey;
  const isBusy =
    buildingArtifactKey === targetKey ||
    isCanceling ||
    ["queued", "building", "validating"].includes(target?.status ?? "") ||
    artifact?.status === "building";
  const canPrepare = moduleReady && !isBusy && status !== "ready";
  const canRevalidate =
    moduleReady && !isBusy && target?.status === "ready" && target.validation?.status === "failed";
  const isSelected = isCloneTargetSelected(moduleId, runConfiguration, profile);
  const score = target?.validation?.score ?? artifact?.score;
  const detail =
    target?.error ??
    artifact?.error ??
    target?.validation?.error ??
    voiceProfileTargetReadinessText(profile, moduleId);
  const isReady = status === "ready" && !canRevalidate;
  const canUse = isReady && !isSelected;
  const canAct = isBusy || canPrepare || canRevalidate || canUse;
  const engineLabel = target?.engineId ?? module?.engineId ?? moduleId;
  const actionLabel = cloneTargetInspectorActionLabel({
    isBusy,
    isCanceling,
    isReady,
    isSelected,
    moduleId,
    status,
    validationStatus: target?.validation?.status,
  });
  const buildActionNeedsTimeout = canPrepare || canRevalidate;
  const timeoutBlocksAction = buildActionNeedsTimeout && !artifactBuildTimeout.canBuild;

  return (
    <div
      className={`grid gap-3 rounded-md border p-3 text-xs ${cloneTargetReadinessCardClass(
        isBusy,
        status,
      )}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--vs-text)]">{moduleLabel(moduleId)}</p>
          <p className="vs-muted mt-1 truncate" title={detail}>
            {detail}
          </p>
        </div>
        <span className={`shrink-0 rounded px-2 py-1 font-semibold ${targetStatusClass(status)}`}>
          {isBusy ? "working" : status}
        </span>
      </div>
      <p className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[0.68rem] vs-muted">
        <span className="min-w-0">
          Artifact:{" "}
          <span className="font-semibold text-[var(--vs-text)]">
            {artifact?.status ?? (moduleReady ? "available" : "setup")}
          </span>
        </span>
        <span className="min-w-0">
          Validation:{" "}
          <span className="font-semibold text-[var(--vs-text)]">
            {typeof score === "number"
              ? formatSimilarity(score)
              : (target?.validation?.status ?? "waiting")}
          </span>
        </span>
      </p>
      <p className="truncate text-[0.68rem] vs-muted" title={engineLabel}>
        {engineLabel} · {moduleReady ? "engine ready" : "setup needed"}
      </p>
      {canAct || isSelected ? (
        <button
          className={`${compactHitTargetClassName} h-8 w-full rounded-md border px-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${cloneTargetActionButtonClass(
            isBusy,
            isReady,
          )}`}
          data-hit-target-min={minInteractiveSize}
          data-testid={`ui-action-clone-target-${moduleId}`}
          data-ui-action-surface="Voice Cloning"
          disabled={isCanceling || isSelected || timeoutBlocksAction}
          onClick={() => {
            handleCloneTargetReadinessAction({
              canPrepare,
              canRevalidate,
              canUse,
              isBusy,
              moduleId,
              profile,
              runConfiguration,
              timeoutSeconds: artifactBuildTimeout.timeoutSeconds,
              ttsEngines,
              onBuildArtifact,
              onCancelTarget,
              onRunConfigurationChange,
            });
          }}
          title={timeoutBlocksAction ? (artifactBuildTimeout.error ?? undefined) : undefined}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

function cloneReadinessTargetOrder(profile: VoiceProfile): string[] {
  const targets = ["kokoro-clone", "kokoro-embed"];
  if (profile.cloneTargets?.["supertonic-embed"] || profile.cloneArtifacts?.["supertonic-embed"]) {
    targets.push("supertonic-embed");
  }
  return targets;
}

function cloneTargetActionButtonClass(isBusy: boolean, isReady: boolean): string {
  if (isBusy) {
    return "border-red-200 bg-white text-red-600 hover:bg-red-50";
  }
  if (isReady) {
    return "border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-50";
  }
  return "border-orange-200 bg-white text-orange-800 hover:bg-orange-50";
}

export function handleCloneTargetReadinessAction({
  canPrepare,
  canRevalidate,
  canUse,
  isBusy,
  moduleId,
  profile,
  runConfiguration,
  timeoutSeconds,
  ttsEngines,
  onBuildArtifact,
  onCancelTarget,
  onRunConfigurationChange,
}: Readonly<{
  canPrepare: boolean;
  canRevalidate: boolean;
  canUse: boolean;
  isBusy: boolean;
  moduleId: string;
  profile: VoiceProfile;
  runConfiguration: RunConfiguration;
  timeoutSeconds?: number;
  ttsEngines: TTSEngineDiagnostics[];
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onCancelTarget: (profileId: string, targetId: string) => Promise<void>;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  if (isBusy) {
    void onCancelTarget(profile.id, moduleId);
    return;
  }
  if (canUse) {
    onRunConfigurationChange(
      runConfigurationForCloneTarget(runConfiguration, moduleId, ttsEngines, profile),
    );
    return;
  }
  if (canPrepare || canRevalidate) {
    void onBuildArtifact(profile.id, moduleId, timeoutSeconds);
  }
}

function isCloneTargetSelected(
  moduleId: string,
  runConfiguration: RunConfiguration,
  profile: VoiceProfile,
): boolean {
  if (moduleId === "supertonic-embed") {
    return runConfiguration.ttsEngine === "supertonic-3";
  }
  if (!isKokoroRenderEngine(runConfiguration.ttsEngine)) {
    return false;
  }
  const activeMode = kokoroRenderModeForConfiguration(runConfiguration, Boolean(profile));
  return kokoroRenderModeTargetId(activeMode) === moduleId;
}

function runConfigurationForCloneTarget(
  runConfiguration: RunConfiguration,
  moduleId: string,
  ttsEngines: TTSEngineDiagnostics[],
  profile: VoiceProfile | null,
): RunConfiguration {
  if (moduleId === "kokoro-clone") {
    return applyKokoroRenderMode(runConfiguration, "kokoclone");
  }
  if (moduleId === "kokoro-embed") {
    return applyKokoroRenderMode(runConfiguration, "kokoro-embed");
  }
  if (moduleId === "supertonic-embed") {
    return runConfigurationForBackendContract(
      runConfiguration,
      "supertonic-3",
      ttsEngines,
      profile,
    );
  }
  return runConfiguration;
}

function cloneTargetInspectorActionLabel({
  isBusy,
  isCanceling,
  isReady,
  isSelected,
  moduleId,
  status,
  validationStatus,
}: Readonly<{
  isBusy: boolean;
  isCanceling: boolean;
  isReady: boolean;
  isSelected: boolean;
  moduleId: string;
  status: string;
  validationStatus?: string;
}>): string {
  if (isSelected) {
    return "Selected";
  }
  if (isReady) {
    return "Use";
  }
  return cloneTargetActionLabel({
    isBusy,
    isCanceling,
    moduleId,
    status,
    validationStatus,
  });
}

function cloneTargetActionLabel({
  isBusy,
  isCanceling,
  moduleId,
  status,
  validationStatus,
}: Readonly<{
  isBusy: boolean;
  isCanceling: boolean;
  moduleId: string;
  status: string;
  validationStatus?: string;
}>): string {
  if (isCanceling) {
    return "Cancelling...";
  }
  if (isBusy) {
    return "Cancel";
  }
  if (status === "ready" && validationStatus === "failed") {
    return "Revalidate";
  }
  if (status === "failed" || status === "cancelled") {
    return `Retry ${moduleLabel(moduleId)}`;
  }
  return `Prepare ${moduleLabel(moduleId)}`;
}

function cloneTargetReadinessCardClass(isBusy: boolean, status: string): string {
  if (isBusy) {
    return "border-orange-300 bg-orange-50";
  }
  if (status === "failed") {
    return "border-red-200 bg-red-50";
  }
  if (status === "cancelled") {
    return "border-zinc-300 bg-zinc-50";
  }
  if (status === "ready") {
    return "border-emerald-200 bg-emerald-50";
  }
  return "vs-border vs-raised";
}

function targetStatusClass(status: string): string {
  if (status === "ready") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (status === "cancelled") {
    return "bg-zinc-100 text-zinc-600";
  }
  if (["queued", "building", "validating"].includes(status)) {
    return "bg-orange-100 text-orange-700";
  }
  return "bg-zinc-100 text-zinc-600";
}

function PipelineStatusFooter({
  activeJobId,
  canSubmit,
  hint,
  isProcessing,
  job,
  mode,
  pipeline,
  showNarrationAction = true,
  voiceCloningActivity,
  onCancel,
  onModeChange,
  onOpenVoiceCloning,
  onSubmit,
}: Readonly<{
  activeJobId: string | null;
  canSubmit: boolean;
  hint: string;
  isProcessing: boolean;
  job: VoiceJob | null;
  mode: ActivityFooterMode;
  pipeline: PipelineStepState;
  showNarrationAction?: boolean;
  voiceCloningActivity: VoiceCloningActivitySummary;
  onCancel: () => void;
  onModeChange: (mode: ActivityFooterMode) => void;
  onOpenVoiceCloning: () => void;
  onSubmit: () => void;
}>) {
  const total = job?.retries.totalSegments ?? job?.progress.totalSegments ?? 0;
  const current = job?.audioReadySegments ?? job?.progress.currentSegment ?? 0;
  const narrationStatus = resolveNarrationActivityStatus(job, isProcessing);
  const narrationStages: ActivityStageSummary[] = [
    { label: "Optimize", status: pipeline.optimization },
    { label: "Synthesize", status: pipeline.synthesis },
    { label: "Check", status: pipeline.checker },
  ];
  let narrationAction: ReactNode = null;
  if (isProcessing) {
    narrationAction = (
      <button
        className="min-h-11 rounded-md border border-red-200 bg-white px-4 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
        data-testid="ui-action-activity-footer-cancel-run"
        disabled={!activeJobId}
        onClick={onCancel}
        type="button"
      >
        Cancel Run
      </button>
    );
  } else if (showNarrationAction) {
    narrationAction = (
      <button
        className="min-h-11 rounded-md px-4 text-sm font-semibold text-white transition disabled:bg-zinc-300 vs-accent-bg"
        data-testid="ui-action-activity-footer-create-listen"
        disabled={!canSubmit}
        onClick={onSubmit}
        type="button"
      >
        {workspaceStageActionLabel("createAndListen")}
      </button>
    );
  }
  const voiceCloningAction = (
    <button
      className={`min-h-11 rounded-md px-4 text-sm font-semibold transition ${
        voiceCloningActivity.status === "attention"
          ? "border border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
          : "border border-orange-300 bg-orange-500/10 text-orange-700 hover:bg-orange-50"
      }`}
      data-testid="ui-action-activity-footer-voice-cloning"
      onClick={onOpenVoiceCloning}
      type="button"
    >
      {voiceCloningActivity.actionLabel}
    </button>
  );
  const narrationMessage = narrationActivityMessage(job, hint);
  const narrationSegmentSummary = total > 0 ? `${String(current)} / ${String(total)}` : "0 / 0";
  const narrationCompactDetail = `${narrationSegmentSummary} · ${estimateFirstAudioETA(job)}`;

  if (mode === "collapsed") {
    return (
      <footer
        className="z-30 shrink-0 border-t px-3 py-2 shadow-[0_-8px_24px_rgb(15_23_42_/_0.08)] backdrop-blur lg:px-4 vs-border vs-raised"
        {...overlayDataAttributes("activity-footer", "bottom-activity-footer")}
      >
        <button
          className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-md border px-3 text-left transition hover:bg-[var(--vs-surface)] vs-border"
          data-testid="ui-action-activity-footer-open"
          onClick={() => {
            onModeChange("compact");
          }}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <FooterStatusDots
              narrationStatus={narrationStatus}
              voiceCloningStatus={voiceCloningActivity.status}
            />
            <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
              Activity
            </span>
            <span className="min-w-0 truncate text-sm font-semibold">
              Narration {job?.status ?? "Idle"} · Voice Cloning {voiceCloningActivity.statusLabel}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-orange-700">Expand</span>
        </button>
      </footer>
    );
  }

  if (mode === "compact") {
    return (
      <footer
        className="z-30 shrink-0 border-t px-3 py-3 shadow-[0_-8px_24px_rgb(15_23_42_/_0.08)] backdrop-blur lg:px-4 vs-border vs-raised"
        {...overlayDataAttributes("activity-footer", "bottom-activity-footer")}
      >
        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:items-center">
          <CompactActivityLane
            action={narrationAction}
            detail={narrationCompactDetail}
            message={narrationMessage}
            stages={narrationStages}
            status={narrationStatus}
            statusLabel={job?.status ?? "Idle"}
            title="Narration"
          />
          <CompactActivityLane
            action={voiceCloningAction}
            detail={`${voiceCloningActivity.elapsed} · ${voiceCloningActivity.lastUpdate}`}
            message={voiceCloningActivity.message}
            stages={voiceCloningActivity.stages}
            status={voiceCloningActivity.status}
            statusLabel={voiceCloningActivity.statusLabel}
            title="Voice Cloning"
          />
          <ActivityFooterModeControls mode={mode} onModeChange={onModeChange} />
        </div>
      </footer>
    );
  }

  return (
    <footer
      className="z-30 max-h-[min(34vh,24rem)] shrink-0 overflow-y-auto border-t px-3 py-3 shadow-[0_-8px_24px_rgb(15_23_42_/_0.08)] backdrop-blur lg:px-4 vs-border vs-raised"
      {...overlayDataAttributes("activity-footer", "bottom-activity-footer")}
    >
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
          Activity Footer
        </span>
        <ActivityFooterModeControls mode={mode} onModeChange={onModeChange} />
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ActivityLanePanel
          action={narrationAction}
          facts={
            <>
              <ActivityFact
                label="Job Status"
                value={job?.status ?? "Idle"}
                detail={activeJobId ?? hint}
              />
              <ActivityFact
                label="Segments"
                value={total > 0 ? `${String(current)} / ${String(total)}` : "0 / 0"}
                detail={total > 0 ? formatPercentageRatio(current, total) : "Waiting"}
              />
              <ActivityFact
                label="First Audio ETA"
                value={estimateFirstAudioETA(job)}
                detail="until checked audio"
              />
              <ActivityFact
                label="Confidence"
                value={formatSimilarity(job?.voiceCheck.similarity ?? 0)}
                detail={job?.voiceCheck.reason ?? "waiting"}
              />
            </>
          }
          message={narrationMessage}
          stages={narrationStages}
          status={narrationStatus}
          statusLabel={job?.status ?? "Idle"}
          title="Narration Pipeline"
        />
        <ActivityLanePanel
          action={voiceCloningAction}
          facts={
            <>
              <ActivityFact
                label="Status"
                value={voiceCloningActivity.statusLabel}
                detail={voiceCloningActivity.sourceDetail}
              />
              <ActivityFact
                label="Elapsed"
                value={voiceCloningActivity.elapsed}
                detail={voiceCloningActivity.eta}
              />
              <ActivityFact
                label="Last Update"
                value={voiceCloningActivity.lastUpdate}
                detail={voiceCloningActivity.eta}
              />
              <ActivityFact
                label="Candidates"
                value={voiceCloningActivity.candidateDetail}
                detail={voiceCloningActivity.activeProfile?.name ?? "profile pending"}
              />
            </>
          }
          message={voiceCloningActivity.message}
          stages={voiceCloningActivity.stages}
          status={voiceCloningActivity.status}
          statusLabel={voiceCloningActivity.statusLabel}
          title="Voice Cloning"
        />
      </div>
    </footer>
  );
}

function ActivityLanePanel({
  action,
  facts,
  message,
  stages,
  status,
  statusLabel,
  title,
}: Readonly<{
  action: ReactNode;
  facts: ReactNode;
  message: string;
  stages: ActivityStageSummary[];
  status: ActivityStatus;
  statusLabel: string;
  title: string;
}>) {
  return (
    <section className="min-w-0 rounded-lg border p-3 vs-border vs-surface">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{title}</h2>
            <ActivityStatusBadge label={statusLabel} status={status} />
          </div>
          <p className="mt-2 truncate text-sm font-medium" title={message}>
            {message}
          </p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
        {stages.map((stage) => (
          <PipelineFooterStage key={stage.label} label={stage.label} status={stage.status} />
        ))}
      </div>
      <div className="mt-3 grid min-w-0 grid-cols-2 gap-2 text-xs md:grid-cols-4">{facts}</div>
    </section>
  );
}

function ActivityFooterModeControls({
  mode,
  onModeChange,
}: Readonly<{
  mode: ActivityFooterMode;
  onModeChange: (mode: ActivityFooterMode) => void;
}>) {
  const nextMode = nextActivityFooterMode(mode);
  const labelByMode: Record<ActivityFooterMode, string> = {
    collapsed: "Open",
    compact: "Hide",
    full: "Less",
  };
  const viewLabelByMode: Record<ActivityFooterMode, string> = {
    collapsed: "Hide",
    compact: "Slim",
    full: "Full",
  };
  return (
    <div className="flex w-full shrink-0 flex-wrap items-center gap-1 rounded-md border p-1 vs-border vs-surface sm:w-auto">
      {(["full", "compact", "collapsed"] as const).map((item) => (
        <button
          aria-label={`Show ${item} activity footer`}
          aria-pressed={mode === item}
          className={`${compactHitTargetClassName} h-7 min-w-[3.8rem] flex-1 rounded px-2 text-[0.68rem] font-semibold transition sm:flex-none ${
            mode === item
              ? "bg-orange-500 text-white"
              : "vs-muted hover:bg-[var(--vs-raised)] hover:text-[var(--vs-text)]"
          }`}
          data-hit-target-min={minInteractiveSize}
          data-testid={`ui-action-activity-footer-${item}`}
          key={item}
          onClick={() => {
            onModeChange(item);
          }}
          type="button"
        >
          {viewLabelByMode[item]}
        </button>
      ))}
      <button
        className={`${compactHitTargetClassName} h-7 min-w-[3.8rem] flex-1 rounded border border-orange-300 px-2 text-[0.68rem] font-semibold text-orange-700 transition hover:bg-orange-50 sm:flex-none`}
        data-hit-target-min={minInteractiveSize}
        data-testid={`ui-action-activity-footer-toggle-${mode}`}
        onClick={() => {
          onModeChange(nextMode);
        }}
        type="button"
      >
        {labelByMode[mode]}
      </button>
    </div>
  );
}

function CompactActivityLane({
  action,
  detail,
  message,
  stages,
  status,
  statusLabel,
  title,
}: Readonly<{
  action: ReactNode;
  detail: string;
  message: string;
  stages: ActivityStageSummary[];
  status: ActivityStatus;
  statusLabel: string;
  title: string;
}>) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-3 vs-border vs-surface">
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">{title}</h2>
          <ActivityStatusBadge label={statusLabel} status={status} />
          <span className="vs-muted min-w-0 truncate text-xs">{detail}</span>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 items-center gap-1">
            {stages.map((stage) => (
              <span
                className={`h-2 w-2 rounded-full ${stageDotClass(stage.status)}`}
                key={stage.label}
                title={`${stage.label}: ${stageStatusLabel(stage.status)}`}
              />
            ))}
          </div>
          <p className="min-w-0 truncate text-sm font-medium" title={message}>
            {message}
          </p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </section>
  );
}

function FooterStatusDots({
  narrationStatus,
  voiceCloningStatus,
}: Readonly<{ narrationStatus: ActivityStatus; voiceCloningStatus: ActivityStatus }>) {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${activityDotClass(narrationStatus)}`} />
      <span className={`h-2.5 w-2.5 rounded-full ${activityDotClass(voiceCloningStatus)}`} />
    </span>
  );
}

function activityDotClass(status: ActivityStatus): string {
  if (status === "running") {
    return "bg-orange-500";
  }
  if (status === "attention") {
    return "bg-amber-500";
  }
  if (status === "complete") {
    return "bg-emerald-500";
  }
  if (status === "cancelled") {
    return "bg-zinc-500";
  }
  return "bg-zinc-300";
}

function ActivityStatusBadge({
  label,
  status,
}: Readonly<{ label: string; status: ActivityStatus }>) {
  const classNameByStatus: Record<ActivityStatus, string> = {
    attention: "border-amber-300 bg-amber-50 text-amber-800",
    cancelled: "border-zinc-300 bg-zinc-50 text-zinc-600",
    complete: "border-emerald-300 bg-emerald-50 text-emerald-700",
    idle: "border-zinc-200 bg-zinc-50 text-zinc-600",
    running: "border-orange-300 bg-orange-50 text-orange-700",
  };
  return (
    <span
      className={`inline-flex h-7 shrink-0 items-center rounded-md border px-2 text-[0.68rem] font-semibold ${classNameByStatus[status]}`}
    >
      {label}
    </span>
  );
}

function PipelineFooterStage({ label, status }: Readonly<{ label: string; status: StageStatus }>) {
  let tone = "border-zinc-200 bg-zinc-50 text-zinc-500";
  switch (status) {
    case "done": {
      tone = "border-emerald-300 bg-emerald-50 text-emerald-700";
      break;
    }
    case "running": {
      tone = "border-orange-300 bg-orange-500/10 text-orange-700";
      break;
    }
    case "failed": {
      tone = "border-red-300 bg-red-50 text-red-700";
      break;
    }
    default: {
      break;
    }
  }
  return (
    <span
      className={`inline-flex h-9 min-w-0 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${tone}`}
      title={`${label}: ${stageStatusLabel(status)}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${stageDotClass(status)}`} />
      <span className="truncate">{label}</span>
    </span>
  );
}

function ActivityFact({
  detail,
  label,
  value,
}: Readonly<{ detail: string; label: string; value: string }>) {
  return (
    <div className="min-w-0 border-l pl-3 vs-border">
      <p className="vs-muted truncate text-[0.65rem] font-semibold uppercase tracking-[0.12em]">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </p>
      <p className="vs-muted mt-0.5 truncate text-xs" title={detail}>
        {detail}
      </p>
    </div>
  );
}

function stageStatusLabel(status: StageStatus): string {
  switch (status) {
    case "done": {
      return "done";
    }
    case "failed": {
      return "failed";
    }
    case "running": {
      return "running";
    }
    default: {
      return "waiting";
    }
  }
}

function stageDotClass(status: StageStatus): string {
  switch (status) {
    case "done": {
      return "bg-emerald-500";
    }
    case "failed": {
      return "bg-red-500";
    }
    case "running": {
      return "bg-orange-500";
    }
    default: {
      return "bg-zinc-300";
    }
  }
}

function resolveNarrationActivityStatus(
  job: VoiceJob | null,
  isProcessing: boolean,
): ActivityStatus {
  if (job?.status === "failed" || job?.status === "cancelled") {
    return "attention";
  }
  if (isProcessing) {
    return "running";
  }
  if (job?.status === "completed") {
    return "complete";
  }
  return "idle";
}

function narrationActivityMessage(job: VoiceJob | null, hint: string): string {
  const progressMessage = job?.progress.message.trim();
  if (progressMessage && progressMessage.length > 0) {
    return progressMessage;
  }
  return hint;
}

function narrationSourceSummaryDetail({
  bookSource,
  preparedSource,
  sourceCount,
}: Readonly<{
  bookSource: BookSource | undefined;
  preparedSource: PreparedSource | undefined;
  sourceCount: number;
}>): string {
  if (preparedSource) {
    return `${preparedSource.kind.toUpperCase()} · ${preparedSource.wordCount.toLocaleString()} words`;
  }
  if (bookSource) {
    return `${bookSource.kind.toUpperCase()} · ${bookSource.wordCount.toLocaleString()} words`;
  }
  return `${sourceCount.toString()} managed sources`;
}

function SidebarFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
      <dt className="vs-muted">{label}</dt>
      <dd className="truncate font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function activeBookSourceForWorkbench(
  sourceMode: SourceMode,
  selectedBookSource: BookSource | null,
): BookSource | null {
  return sourceMode === "book" ? selectedBookSource : null;
}

function activePreparedSourceForWorkbench(
  sourceMode: SourceMode,
  selectedPreparedSource: PreparedSource | null,
): PreparedSource | null {
  return sourceMode === "fileUrl" ? selectedPreparedSource : null;
}

/* eslint-disable sonarjs/cognitive-complexity, sonarjs/no-nested-conditional, unicorn/no-nested-ternary, unicorn/prefer-switch */
function workbenchSourceLifecycleEnvelope({
  job,
  projectId,
  selectedScopeLabel,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  surface,
  text,
}: Readonly<{
  job: VoiceJob | null;
  projectId: string;
  selectedScopeLabel: string;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
  surface: SourceLifecycleSurface;
  text: string;
}>): SourceLifecycleEnvelope {
  if (sourceMode === "fileUrl" && selectedPreparedSource) {
    const sourceJob = job?.preparedSourceId === selectedPreparedSource.id ? job : null;
    const generatedAudioState = workbenchGeneratedAudioState(
      sourceJob,
      selectedPreparedSource.updatedAt,
    );
    const extractionState = workbenchExtractionState(
      selectedPreparedSource.status,
      selectedPreparedSource.blockCount > 0 ||
        selectedPreparedSource.wordCount > 0 ||
        Boolean(selectedPreparedSource.text),
      generatedAudioState,
      selectedPreparedSource.summary.spokenBlockCount,
    );
    const { canonicalState, narrationState } = workbenchLifecycleStates({
      extractionState,
      generatedAudioState,
      narratableCount: selectedPreparedSource.summary.spokenBlockCount,
      status: selectedPreparedSource.status,
    });
    return {
      adapterKind:
        selectedPreparedSource.kind === "url"
          ? "url"
          : selectedPreparedSource.kind === "text" || selectedPreparedSource.kind === "book"
            ? selectedPreparedSource.kind
            : "unknown",
      canonicalState,
      extractionState,
      generatedAudioState,
      language: "Project default",
      lastOpenedSurface: surface,
      narrationState,
      policyScope:
        selectedPreparedSource.sourceSpeechPolicyProfile?.trim() ||
        hasSpeechPolicyOverrides(selectedPreparedSource.sourceSpeechPolicyOverrides ?? {})
          ? "source"
          : "project",
      projectId,
      selectedScope: selectedScopeLabel,
      sourceId: selectedPreparedSource.id,
      sourceKind:
        selectedPreparedSource.kind === "url"
          ? "website"
          : selectedPreparedSource.kind === "text"
            ? "text"
            : selectedPreparedSource.kind === "book"
              ? "book"
              : "document",
      title: selectedPreparedSource.title ?? selectedPreparedSource.sourceName,
    };
  }
  if (sourceMode === "book" && selectedBookSource) {
    const sourceJob = job?.bookSourceId === selectedBookSource.id ? job : null;
    const generatedAudioState = workbenchGeneratedAudioState(
      sourceJob,
      selectedBookSource.updatedAt,
    );
    const narratableCount =
      selectedBookSource.sections?.filter((section) => section.isNarratable).length ??
      selectedBookSource.chapters?.filter((chapter) => chapter.isNarratable !== false).length ??
      selectedBookSource.chapterCount;
    const extractionState = workbenchExtractionState(
      selectedBookSource.status,
      narratableCount > 0 ||
        selectedBookSource.pageCount > 0 ||
        selectedBookSource.wordCount > 0 ||
        Boolean(selectedBookSource.text),
      generatedAudioState,
      narratableCount,
    );
    const { canonicalState, narrationState } = workbenchLifecycleStates({
      extractionState,
      generatedAudioState,
      narratableCount,
      status: selectedBookSource.status,
    });
    return {
      adapterKind: selectedBookSource.kind === "image" ? "image" : selectedBookSource.kind,
      canonicalState,
      extractionState,
      generatedAudioState,
      language: "Project default",
      lastOpenedSurface: surface,
      narrationState,
      policyScope:
        selectedBookSource.sourceSpeechPolicyProfile?.trim() ||
        hasSpeechPolicyOverrides(selectedBookSource.sourceSpeechPolicyOverrides ?? {})
          ? "source"
          : "project",
      projectId,
      selectedScope: selectedScopeLabel,
      sourceId: selectedBookSource.id,
      sourceKind: selectedBookSource.kind === "html" ? "website" : "book",
      title: bookSourceName(selectedBookSource),
    };
  }
  const generatedAudioState = generatedAudioLifecycleFromJob({ job });
  const hasText = text.trim().length > 0;
  const extractionState = hasText ? "imported" : "new";
  const narrationState = hasText ? "previewable" : "new";
  return {
    adapterKind: "text",
    canonicalState:
      generatedAudioState === "ready"
        ? "audioReady"
        : generatedAudioState === "queued" || generatedAudioState === "generating"
          ? "generating"
          : narrationState,
    extractionState,
    generatedAudioState,
    language: "Project default",
    lastOpenedSurface: surface,
    narrationState,
    policyScope: "project",
    projectId,
    selectedScope: "Draft text",
    sourceId: "draft",
    sourceKind: "draft",
    title: "Draft text",
  };
}

function workbenchGeneratedAudioState(
  job: VoiceJob | null,
  sourceUpdatedAt: string,
): SourceLifecycleEnvelope["generatedAudioState"] {
  const audioUpdatedAt = job?.completedAt ?? job?.updatedAt;
  return generatedAudioLifecycleFromJob({
    job,
    stale:
      Boolean(audioUpdatedAt) && Date.parse(sourceUpdatedAt) > Date.parse(audioUpdatedAt ?? ""),
  });
}

function workbenchExtractionState(
  status: string,
  hasContent: boolean,
  generatedAudioState: SourceLifecycleEnvelope["generatedAudioState"],
  narratableCount: number,
): SourceLifecycleEnvelope["extractionState"] {
  if (status === "failed" || generatedAudioState === "failed") return "failed";
  if (generatedAudioState === "ready" || narratableCount > 0 || hasContent) return "extracted";
  return status === "ready" ? "imported" : "extracting";
}

function workbenchLifecycleStates({
  extractionState,
  generatedAudioState,
  narratableCount,
  status,
}: {
  extractionState: SourceLifecycleEnvelope["extractionState"];
  generatedAudioState: SourceLifecycleEnvelope["generatedAudioState"];
  narratableCount: number;
  status: string;
}): Pick<SourceLifecycleEnvelope, "canonicalState" | "narrationState"> {
  let narrationState: SourceLifecycleEnvelope["narrationState"] = "prepared";
  if (status === "failed" || generatedAudioState === "failed") narrationState = "failed";
  else if (generatedAudioState === "stale" || generatedAudioState === "degraded")
    narrationState = "stale";
  else if (generatedAudioState === "ready") narrationState = "audioReady";
  else if (generatedAudioState === "queued" || generatedAudioState === "generating")
    narrationState = "generating";
  else if (status === "ready") narrationState = narratableCount > 0 ? "narratable" : "reviewable";
  return {
    canonicalState: narrationState === "prepared" ? extractionState : narrationState,
    narrationState,
  };
}
/* eslint-enable sonarjs/cognitive-complexity, sonarjs/no-nested-conditional, unicorn/no-nested-ternary, unicorn/prefer-switch */

function workspaceSourceLifecycleSurface(stage: WorkspaceStage): SourceLifecycleSurface {
  if (stage === "intake") {
    return "Intake";
  }
  if (stage === "review") {
    return "Review";
  }
  if (stage === "preview") {
    return "Preview";
  }
  return "Teleprompt";
}

function createAndListenScopeForSource({
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
}: Readonly<{
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
}>): CreateAndListenScope {
  if (sourceMode === "book" && selectedBookSource && selectedBookScope?.type !== "book") {
    return "current-scope";
  }
  if (sourceMode === "fileUrl" && selectedPreparedSource?.blocks?.length === 1) {
    return "selected-block";
  }
  return "whole-source";
}

function SourceTextPanel({
  activeReviewPane,
  activeReviewBlockId,
  bookScopeContent,
  bookSourceError,
  bookSources,
  canSubmit,
  contentMode,
  isImportingBookSource,
  isPreparingSource,
  isProcessing,
  job,
  optimizedText,
  preparedSources,
  projectId,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  speechPolicyProfileLabel,
  sourcePrepError,
  telepromptStage,
  text,
  voiceProfileId,
  voiceProfileLabel,
  voiceProfiles,
  createAndListenCapabilityReason,
  createAndListenDisabledReason,
  createAndListenScope,
  onCreateAndListen,
  onInspectBookSource,
  onInspectPreparedSource,
  onOpenCinema,
  onOpenBookCinema,
  onOpenVoiceCloning,
  onOpenPreparedSourceCinema,
  onImportBookSource,
  onBookScopeChange,
  onPrepareFile,
  onPrepareUrl,
  providerBackedGenerationBoundary,
  onSelectVoiceProfile,
  onSourceModeChange,
  onStageAction,
  onSpeechPolicyProfileChange,
  onReviewBlockChange,
  onReviewPaneChange,
  onSubmit,
  onTextChange,
  onUseBookSource,
  onUsePreparedSource,
  runConfigurationLabel,
}: Readonly<{
  activeReviewPane: ReviewPane;
  activeReviewBlockId: string | null;
  bookScopeContent: BookSourceScopeContent | null;
  bookSourceError: string | null;
  bookSources: BookSource[];
  canSubmit: boolean;
  contentMode: WorkspaceStage;
  isImportingBookSource: boolean;
  isPreparingSource: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  optimizedText: string;
  preparedSources: PreparedSource[];
  projectId: string;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
  speechPolicyProfileLabel: string;
  sourcePrepError: string | null;
  telepromptStage: ReactNode;
  text: string;
  voiceProfileId: string;
  voiceProfileLabel: string;
  voiceProfiles: VoiceProfile[];
  createAndListenCapabilityReason?: string;
  createAndListenDisabledReason?: string;
  createAndListenScope: CreateAndListenScope;
  onCreateAndListen: () => void;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onOpenCinema: () => void;
  onOpenBookCinema: (source?: BookSource, scope?: BookScope) => void;
  onOpenVoiceCloning: () => void;
  onOpenPreparedSourceCinema: (source: PreparedSource) => void;
  onImportBookSource: (files: File[], options?: BookSourceImportOptions) => Promise<void>;
  onBookScopeChange: (scope: BookScope) => void;
  onPrepareFile: (
    file: File,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<void>;
  onPrepareUrl: (
    url: string,
    markdownParseMode: MarkdownParseMode,
    preparationTarget?: IntakePreparationTarget,
  ) => Promise<void>;
  providerBackedGenerationBoundary?: boolean;
  onSelectVoiceProfile: (profileId: string) => void;
  onSourceModeChange: (mode: SourceMode) => void;
  onStageAction: (actionId: WorkspaceStageActionId) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onReviewBlockChange: (blockId: string | null) => void;
  onReviewPaneChange: (pane: ReviewPane) => void;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
  onTextChange: (text: string) => void;
  onUseBookSource: (source: BookSource, scope: BookScope) => void;
  onUsePreparedSource: (source: PreparedSource) => Promise<void> | void;
  runConfigurationLabel: string;
}>) {
  const showSourceIntake = contentMode === "intake";
  const activeBookSource = activeBookSourceForWorkbench(sourceMode, selectedBookSource);
  const activePreparedSource = activePreparedSourceForWorkbench(sourceMode, selectedPreparedSource);
  const sourceIdentity = resolveWorkbenchSourceIdentity({
    contentMode,
    selectedBookSource: activeBookSource,
    selectedPreparedSource: activePreparedSource,
    sourceMode,
    text,
  });
  const scopeTitle = workbenchScopeTitle({
    selectedBookScope,
    selectedBookSource: activeBookSource,
    selectedPreparedSource: activePreparedSource,
    sourceMode,
  });
  const sourceLifecycle = workbenchSourceLifecycleEnvelope({
    job,
    projectId,
    selectedScopeLabel: scopeTitle,
    selectedBookSource: activeBookSource,
    selectedPreparedSource: activePreparedSource,
    sourceMode,
    surface: workspaceSourceLifecycleSurface(contentMode),
    text,
  });
  const stageLabel = workspaceStageMeta(contentMode).label;

  return (
    <form
      className="grid min-w-0 gap-4 rounded-xl border bg-[var(--vs-raised)] p-4 xl:p-5 vs-border"
      onSubmit={onSubmit}
    >
      <HeaderContextSummary
        metadata={[
          { label: "Policy", value: speechPolicyProfileLabel },
          { label: "Voice", value: voiceProfileLabel },
        ]}
        scopeTitle={scopeTitle}
        sourceLifecycle={sourceLifecycle}
        sourceTitle={sourceIdentity.label}
        stateLabel={stageLabel}
        surfaceName="Narration Workbench"
      />

      <SegmentedControl
        ariaLabel="Workspace stage"
        columns={4}
        options={[
          { label: "Intake", testId: "workspace-stage-intake", value: "intake" },
          { label: "Review", testId: "workspace-stage-review", value: "review" },
          { label: "Preview", testId: "workspace-stage-preview", value: "preview" },
          { label: "Teleprompt", testId: "workspace-stage-teleprompt", value: "teleprompt" },
        ]}
        value={contentMode}
        onChange={(mode) => {
          onStageAction(workspaceStageNavigationAction(mode));
        }}
      />

      {showSourceIntake ? (
        <Suspense fallback={<LazySurfaceFallback label="Loading intake wizard..." />}>
          <LazyIntakeWizard
            bookSourceError={bookSourceError}
            bookSources={bookSources}
            bookScopeContent={bookScopeContent}
            isImportingBookSource={isImportingBookSource}
            isPreparingSource={isPreparingSource}
            preparedSources={preparedSources}
            selectedBookScope={selectedBookScope}
            selectedBookSource={selectedBookSource}
            selectedPreparedSource={selectedPreparedSource}
            selectedVoiceProfileId={voiceProfileId}
            sourceMode={sourceMode}
            sourcePrepError={sourcePrepError}
            text={text}
            voiceProfileLabel={voiceProfileLabel}
            voiceProfiles={voiceProfiles}
            onImportBookFiles={onImportBookSource}
            onInspectBookSource={onInspectBookSource}
            onInspectPreparedSource={onInspectPreparedSource}
            onOpenBookCinema={onOpenBookCinema}
            onOpenPreparedSourceCinema={onOpenPreparedSourceCinema}
            onOpenVoiceCloning={onOpenVoiceCloning}
            onPrepareFile={onPrepareFile}
            onPrepareUrl={onPrepareUrl}
            providerBackedGenerationBoundary={providerBackedGenerationBoundary}
            onScopeChange={onBookScopeChange}
            onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
            onStageChange={(stage) => {
              onStageAction(stage === "review" ? "reviewBlocks" : "previewSpeech");
            }}
            onUseBookSource={onUseBookSource}
            onUseDraftText={(nextText) => {
              onSourceModeChange("text");
              onTextChange(nextText);
            }}
            onUsePreparedSource={onUsePreparedSource}
            onVoiceProfileChange={onSelectVoiceProfile}
          />
        </Suspense>
      ) : null}
      {contentMode === "review" ? (
        <div className="grid gap-3">
          <NarrationReviewWorkbench
            activePane={activeReviewPane}
            activeBlockId={activeReviewBlockId}
            bookScopeContent={bookScopeContent}
            job={job}
            optimizedText={optimizedText}
            policyProfileLabel={speechPolicyProfileLabel}
            projectId={projectId}
            runConfigurationLabel={runConfigurationLabel}
            selectedBookScope={selectedBookScope}
            selectedBookSource={activeBookSource}
            selectedPreparedSource={activePreparedSource}
            sourceLifecycle={sourceLifecycle}
            text={text}
            voiceProfileLabel={voiceProfileLabel}
            voiceProfileId={voiceProfileId}
            onInspectBookSource={onInspectBookSource}
            onInspectPreparedSource={onInspectPreparedSource}
            onActiveBlockChange={onReviewBlockChange}
            onActivePaneChange={onReviewPaneChange}
            onPreviewSpeech={() => {
              onStageAction("previewSpeech");
            }}
          />
        </div>
      ) : null}
      {contentMode === "preview" ? (
        <NarrationPreviewStage
          bookScopeContent={bookScopeContent}
          canCreate={canSubmit && !isProcessing}
          canOpenCinema={Boolean(job)}
          job={job}
          optimizedText={optimizedText}
          policyProfileLabel={speechPolicyProfileLabel}
          selectedBookScope={selectedBookScope}
          selectedBookSource={activeBookSource}
          selectedPreparedSource={activePreparedSource}
          sourceLifecycle={sourceLifecycle}
          sourceMode={sourceMode}
          text={text}
          voiceProfileLabel={voiceProfileLabel}
          createAndListenCapabilityReason={createAndListenCapabilityReason}
          createAndListenDisabledReason={createAndListenDisabledReason}
          createAndListenScope={createAndListenScope}
          onCreateAndListen={onCreateAndListen}
          onOpenCinema={onOpenCinema}
          onOpenTeleprompt={() => {
            onStageAction("openTeleprompt");
          }}
        />
      ) : null}
      {contentMode === "teleprompt" ? telepromptStage : null}
      {showSourceIntake && sourceMode !== "fileUrl" ? (
        <SourceMetadataStrip
          job={job}
          selectedBookSource={activeBookSource}
          selectedBookScope={selectedBookScope}
          bookScopeContent={bookScopeContent}
          selectedPreparedSource={activePreparedSource}
          sourceMode={sourceMode}
          text={text}
        />
      ) : null}
    </form>
  );
}

function NarrationPreviewStage({
  bookScopeContent,
  canCreate,
  canOpenCinema,
  job,
  optimizedText,
  policyProfileLabel,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceLifecycle,
  sourceMode,
  text,
  voiceProfileLabel,
  createAndListenCapabilityReason,
  createAndListenDisabledReason: externalCreateAndListenDisabledReason,
  createAndListenScope,
  onCreateAndListen,
  onOpenCinema,
  onOpenTeleprompt,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  canCreate: boolean;
  canOpenCinema: boolean;
  job: VoiceJob | null;
  optimizedText: string;
  policyProfileLabel: string;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceLifecycle: SourceLifecycleEnvelope;
  sourceMode: SourceMode;
  text: string;
  voiceProfileLabel: string;
  createAndListenCapabilityReason?: string;
  createAndListenDisabledReason?: string;
  createAndListenScope: CreateAndListenScope;
  onCreateAndListen: () => void;
  onOpenCinema: () => void;
  onOpenTeleprompt: () => void;
}>) {
  const sourceLabel = narrationReviewSourceLabel(selectedPreparedSource, selectedBookSource);
  const sourceMeta = narrationReviewSourceMeta({
    bookScopeContent,
    selectedBookScope,
    selectedBookSource,
    selectedPreparedSource,
    text,
  });
  const scopeTitle = workbenchScopeTitle({
    selectedBookScope,
    selectedBookSource,
    selectedPreparedSource,
    sourceMode,
  });
  const previewText =
    firstNonEmptyString(
      selectedPreparedSource?.text,
      selectedPreparedSource?.speechText,
      text.trim(),
    ) ?? "Select or prepare a source to preview spoken output.";
  const spokenText =
    firstNonEmptyString(optimizedText, selectedPreparedSource?.speechText, text.trim()) ??
    "Create audio to generate listener-ready spoken text.";
  const previewContent = narrationReviewPreviewContent({
    bookScopeContent,
    previewText,
    selectedBookScope,
    selectedBookSource,
    selectedPreparedSource,
  });
  const createDisabled = !canCreate;
  const generatedAudioLifecycle = generatedAudioLifecycleFromJob({ job });
  const createAndListenDisabledReason = canCreate
    ? undefined
    : (externalCreateAndListenDisabledReason ??
      workspacePlaybackActionDisabledReason({
        action: "createAndListen",
        fallbackReason: "Select a ready source before creating audio.",
        lifecycle: generatedAudioLifecycle,
        scope: createAndListenScope,
      }));
  const openCinemaDisabledReason = canOpenCinema
    ? undefined
    : workspacePlaybackActionDisabledReason({
        action: "openCinema",
        fallbackReason: "Create audio before opening Cinema.",
        lifecycle: generatedAudioLifecycle,
        scope: createAndListenScope,
      });
  const createDetail = job
    ? `${job.status} · ${estimateFirstAudioETA(job)}`
    : "Ready to create checked narration";
  const policyNotes = narrationPreviewPolicyNotes({
    bookScopeContent,
    policyProfileLabel,
    scopeTitle,
    selectedBookSource,
    selectedPreparedSource,
    sourceMode,
    voiceProfileLabel,
  });

  return (
    <Panel className="grid gap-3 p-4" variant="raised">
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <HeaderContextSummary
          className="flex-1"
          metadata={[
            { label: "Policy", value: policyProfileLabel },
            { label: "Voice", value: voiceProfileLabel },
            { label: "Size", value: sourceMeta },
          ]}
          scopeTitle={scopeTitle}
          sourceLifecycle={sourceLifecycle}
          sourceTitle={sourceLabel}
          stateLabel={generatedAudioLifecycle === "missing" ? "Source ready" : null}
          surfaceName="Preview"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid={workspaceStageActionTestId("openTeleprompt")}
            onClick={onOpenTeleprompt}
            size="sm"
            variant="soft"
          >
            {workspaceStageActionLabel("openTeleprompt")}
          </Button>
          <Button
            {...workspacePlaybackActionDataAttributes("openCinema", generatedAudioLifecycle)}
            disabledReason={openCinemaDisabledReason}
            data-testid={workspaceStageActionTestId("openCinema")}
            disabled={!canOpenCinema}
            onClick={onOpenCinema}
            size="sm"
            variant="secondary"
          >
            {workspaceStageActionLabel("openCinema")}
          </Button>
          <Button
            {...workspacePlaybackActionDataAttributes("createAndListen", generatedAudioLifecycle)}
            {...createAndListenCapabilityAttributes(createAndListenCapabilityReason)}
            aria-label={createAndListenAriaLabel(createAndListenScope)}
            data-create-listen-scope={createAndListenScope}
            disabledReason={createAndListenDisabledReason}
            data-testid={workspaceStageActionTestId("createAndListen")}
            disabled={createDisabled}
            onClick={onCreateAndListen}
            size="sm"
            variant="primary"
          >
            {workspaceStageActionLabel("createAndListen")}
          </Button>
        </div>
      </div>
      <StatusChip className="justify-self-start" tone={job ? "info" : "neutral"}>
        {createDetail}
      </StatusChip>
      <dl className="grid gap-2 rounded-lg border bg-[var(--vs-surface)] p-3 text-xs sm:grid-cols-3 vs-border">
        <PreviewFact label="Voice choice" value={voiceProfileLabel} />
        <PreviewFact label="Speech policy" value={policyProfileLabel} />
        <PreviewFact label="Scope" value={scopeTitle} />
      </dl>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]">
        <div className="max-h-[34rem] overflow-auto rounded-lg border bg-[var(--vs-raised)] p-4 text-sm leading-6 vs-border">
          {previewContent}
        </div>
        <div className="grid min-w-0 gap-3">
          <Panel className="grid gap-3 p-4" variant="raised">
            <div>
              <h3 className="text-base font-semibold">Spoken Form</h3>
              <p className="mt-1 text-xs vs-muted">
                This is the listener-ready text Create & Listen will turn into audio.
              </p>
            </div>
            <p className="max-h-[20rem] overflow-auto whitespace-pre-wrap break-words rounded-md border bg-[var(--vs-surface)] p-4 font-mono text-sm leading-7 vs-border">
              {spokenText}
            </p>
          </Panel>
          <Panel className="grid gap-2 p-4" variant="raised">
            <h3 className="text-sm font-semibold">Policy Notes</h3>
            <ul className="grid gap-2 text-xs leading-5 vs-muted">
              {policyNotes.map((note) => (
                <li
                  className="rounded-md border bg-[var(--vs-surface)] px-3 py-2 vs-border"
                  key={note.label}
                >
                  <span className="font-semibold text-[var(--vs-text)]">{note.label}: </span>
                  {note.detail}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}

function PreviewFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0">
      <dt className="font-semibold uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

interface NarrationPreviewPolicyNote {
  detail: string;
  label: string;
}

function narrationPreviewPolicyNotes({
  bookScopeContent,
  policyProfileLabel,
  scopeTitle,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  voiceProfileLabel,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  policyProfileLabel: string;
  scopeTitle: string;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
  voiceProfileLabel: string;
}>): NarrationPreviewPolicyNote[] {
  if (selectedPreparedSource) {
    return [
      {
        detail: `${selectedPreparedSource.summary.spokenBlockCount.toLocaleString()} spoken blocks and ${selectedPreparedSource.summary.citationSkipCount.toLocaleString()} citation-only items skipped.`,
        label: "Prepared blocks",
      },
      {
        detail: `${selectedPreparedSource.summary.sentenceSegmentCount.toLocaleString()} sentence-safe segments are queued for ${voiceProfileLabel}.`,
        label: "Segmentation",
      },
      {
        detail: `${policyProfileLabel} applies to the full prepared source.`,
        label: "Policy",
      },
    ];
  }
  if (selectedBookSource) {
    const blockCount = bookScopeContent?.blocks?.length ?? 0;
    return [
      {
        detail: `${scopeTitle} from ${bookSourceName(selectedBookSource)} is the active narration scope.`,
        label: "Book scope",
      },
      {
        detail:
          blockCount > 0
            ? `${blockCount.toLocaleString()} source blocks are preserved for review and playback.`
            : "The selected scope will be split into listener-sized blocks during generation.",
        label: "Blocks",
      },
      {
        detail: `${policyProfileLabel} and ${voiceProfileLabel} stay attached to this scope.`,
        label: "Policy",
      },
    ];
  }
  return [
    {
      detail: `${sourceMode === "text" ? "Draft text" : scopeTitle} will be narrated with ${voiceProfileLabel}.`,
      label: "Source",
    },
    {
      detail: `${policyProfileLabel} is applied before audio is generated.`,
      label: "Policy",
    },
    {
      detail:
        "Paragraphs are chunked into listener-sized blocks for Review, Teleprompt, and Cinema.",
      label: "Blocks",
    },
  ];
}

interface WorkbenchSourceIdentity {
  label: string;
  meta: string;
  mode: SourceMode;
}

function resolveWorkbenchSourceIdentity({
  contentMode,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  text,
}: Readonly<{
  contentMode: WorkspaceStage;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
  text: string;
}>): WorkbenchSourceIdentity {
  if (contentMode === "intake") {
    return sourceIntakeIdentity(sourceMode, selectedBookSource, selectedPreparedSource, text);
  }
  if (selectedPreparedSource) {
    return preparedSourceIdentity(selectedPreparedSource);
  }
  if (selectedBookSource) {
    return bookSourceIdentity(selectedBookSource);
  }
  return draftTextIdentity(text);
}

function sourceIntakeIdentity(
  sourceMode: SourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
  text: string,
): WorkbenchSourceIdentity {
  if (sourceMode === "book") {
    return selectedBookSource
      ? bookSourceIdentity(selectedBookSource)
      : {
          label: "Book source",
          meta: "Select or import a book",
          mode: "book",
        };
  }
  if (sourceMode === "fileUrl") {
    return selectedPreparedSource
      ? preparedSourceIdentity(selectedPreparedSource)
      : {
          label: "File / URL source",
          meta: "Prepare a document, article, or URL",
          mode: "fileUrl",
        };
  }
  return draftTextIdentity(text);
}

function preparedSourceIdentity(source: PreparedSource): WorkbenchSourceIdentity {
  return {
    label: source.title ?? source.sourceName,
    meta: `${source.kind.toUpperCase()} · ${source.wordCount.toLocaleString()} words`,
    mode: "fileUrl",
  };
}

function bookSourceIdentity(source: BookSource): WorkbenchSourceIdentity {
  return {
    label: bookSourceName(source),
    meta: `${source.kind.toUpperCase()} · ${source.wordCount.toLocaleString()} words`,
    mode: "book",
  };
}

function draftTextIdentity(text: string): WorkbenchSourceIdentity {
  return {
    label: "Draft text",
    meta: `${text.trim().length.toLocaleString()} characters queued`,
    mode: "text",
  };
}

function SourcePrepMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="min-w-0 border-l pl-3 first:border-l-0 first:pl-0 vs-border">
      <dt className="truncate text-[0.68rem] font-semibold uppercase tracking-[0.16em] vs-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold text-[var(--vs-text)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

function SourcePrepMathPanel({ source }: Readonly<{ source: PreparedSource | null }>) {
  const mathBlocks = (source?.blocks ?? []).filter(
    (block) => block.kind === "math" || Boolean(block.mathPreview),
  );
  if (!source) {
    return null;
  }
  if (mathBlocks.length === 0) {
    return (
      <div className="p-4 text-sm text-zinc-600">
        <p>No maths blocks were detected in this source.</p>
      </div>
    );
  }
  return (
    <div className="grid max-h-[28rem] gap-3 overflow-y-auto p-4 text-sm">
      {mathBlocks.map((block) => (
        <article
          className="grid gap-3 rounded-md border border-zinc-200 bg-white p-3"
          key={block.id}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {block.kind} · block {block.index.toLocaleString()}
            </p>
            <span
              className={`rounded-full border px-2 py-1 text-[0.68rem] font-semibold ${
                block.mathPreview?.source === "fallback"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {block.mathPreview?.source ?? "speech policy"}
            </span>
          </div>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-800">
            {block.text ?? block.label}
          </div>
          <div className="rounded-md border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            {block.mathPreview?.speech ?? block.spokenText ?? "No maths speech available"}
          </div>
          {block.mathPreview?.warnings && block.mathPreview.warnings.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {block.mathPreview.warnings.map((warning) => (
                <span
                  className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
                  key={warning}
                >
                  {warning}
                </span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function SourcePrepRulesPanel({ source }: Readonly<{ source: PreparedSource | null }>) {
  if (!source) {
    return null;
  }
  return (
    <div className="grid gap-4 p-4 text-sm">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
        <SourcePrepMetric label="Headings" value={String(source.summary.headingCount)} />
        <SourcePrepMetric label="Skipped Blocks" value={String(source.summary.skippedBlockCount)} />
        <SourcePrepMetric label="Notes" value={String(source.warnings?.length ?? 0)} />
      </dl>
      {source.warnings && source.warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {source.warnings.map((warning) => (
            <span
              className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
              key={warning}
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
      {source.skippedItems && source.skippedItems.length > 0 ? (
        <div className="max-h-56 overflow-y-auto border-t border-zinc-200">
          {source.skippedItems.slice(0, 12).map((item) => (
            <div className="border-b border-zinc-100 py-3 last:border-b-0" key={item.id}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                {item.kind}
              </p>
              <p className="mt-1 truncate font-medium text-zinc-900" title={item.reason}>
                {item.reason}
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isBookSourceExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
    "docx",
    "html",
    "htm",
    "zip",
    "png",
    "jpg",
    "jpeg",
    "tif",
    "tiff",
    "bmp",
    "webp",
  ].includes(extension);
}

function isBookSourceURL(lowerURL: string): boolean {
  return [
    ".pdf",
    ".epub",
    ".docx",
    ".html",
    ".htm",
    ".zip",
    ".png",
    ".jpg",
    ".jpeg",
    ".tif",
    ".tiff",
    ".bmp",
    ".webp",
  ].some((extension) => lowerURL.endsWith(extension));
}

function SourceMetadataStrip({
  bookScopeContent,
  job,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  text,
}: Readonly<{
  bookScopeContent?: BookSourceScopeContent | null;
  job: VoiceJob | null;
  selectedBookScope?: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
  text: string;
}>) {
  const metadataBookSource = sourceMode === "book" ? selectedBookSource : null;
  const metadataPreparedSource = sourceMode === "fileUrl" ? selectedPreparedSource : null;
  const preparedDurationMs =
    metadataPreparedSource?.blocks?.reduce(
      (total, block) => total + (block.estimatedDurationMs ?? 0),
      0,
    ) ?? 0;
  const bookDurationMs =
    bookScopeContent?.estimatedDurationMs ??
    (metadataBookSource && selectedBookScope
      ? estimateNarrationTextDurationMs(bookScopeText(metadataBookSource, selectedBookScope))
      : 0);
  const totalSegments =
    job?.retries.totalSegments ??
    job?.segments?.length ??
    metadataPreparedSource?.summary.sentenceSegmentCount ??
    bookScopeContent?.summary?.sentenceSegmentCount ??
    bookScopeContent?.blocks?.length ??
    0;
  const contentType = job?.contentType ?? "48kHz - 24bit - WAV";
  const durationMs = sourceMetadataDurationMs({
    job,
    bookDurationMs,
    preparedDurationMs,
    selectedBookSource: metadataBookSource,
    text,
  });
  const sourceTextLabel = sourceMetadataLabel({
    job,
    selectedBookSource: metadataBookSource,
    selectedPreparedSource: metadataPreparedSource,
  });

  return (
    <dl className="grid gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 text-sm md:grid-cols-4 vs-border">
      <Metric label="Source Text" value={sourceTextLabel} />
      <Metric label="Total Segments" value={String(totalSegments)} />
      <Metric label="Total Duration (est.)" value={formatDuration(durationMs)} />
      <Metric label="Output Format" value={contentType} />
    </dl>
  );
}

function sourceMetadataDurationMs({
  bookDurationMs,
  job,
  preparedDurationMs,
  selectedBookSource,
  text,
}: Readonly<{
  bookDurationMs?: number;
  job: VoiceJob | null;
  preparedDurationMs: number;
  selectedBookSource: BookSource | null;
  text: string;
}>): number {
  if (job?.durationMs) {
    return job.durationMs;
  }
  if (preparedDurationMs > 0) {
    return preparedDurationMs;
  }
  if (bookDurationMs && bookDurationMs > 0) {
    return bookDurationMs;
  }
  if (selectedBookSource) {
    return selectedBookSource.wordCount * 430;
  }
  return text.length * 35;
}

function sourceMetadataLabel({
  job,
  selectedBookSource,
  selectedPreparedSource,
}: Readonly<{
  job: VoiceJob | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
}>): string {
  if (job?.inputText) {
    return "restored job text";
  }
  if (selectedPreparedSource) {
    return `${selectedPreparedSource.kind.toUpperCase()} source`;
  }
  if (selectedBookSource) {
    return `${selectedBookSource.kind.toUpperCase()} source`;
  }
  return "draft text";
}

function ResearchModulesSetupCard({
  cloningModuleId,
  error,
  hidden,
  modules,
  onClone,
  onHide,
}: Readonly<{
  cloningModuleId: string | null;
  error: string | null;
  hidden: boolean;
  modules: ResearchModuleDiagnostics[];
  onClone: (moduleId: string) => void;
  onHide: () => void;
}>) {
  const cloneModules = modules.filter((module) => module.prompt && !module.installed);
  const setupModules = modules.filter(
    (module) => module.prompt && module.installed && module.status === "setup-needed",
  );
  if (hidden || (cloneModules.length === 0 && setupModules.length === 0 && !error)) {
    return null;
  }
  return (
    <section className="border-t border-zinc-200 bg-amber-50 px-5 py-3 text-sm text-amber-950">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">Optional local research modules are available.</p>
          <p className="mt-1 break-words text-xs leading-5 text-amber-900">
            Clone upstreams into ignored .upstreams paths only when you want profile-specific embed
            artifacts. Current Kokoro Clone and Supertonic preset rendering stay available.
          </p>
          {error ? <p className="mt-2 text-xs font-semibold text-red-700">{error}</p> : null}
          {setupModules.length > 0 ? (
            <div className="mt-2 grid gap-2">
              {setupModules.map((module) => (
                <div
                  className="rounded border border-amber-200 bg-amber-100/40 p-2 text-xs text-amber-950"
                  key={module.id}
                >
                  <p className="font-semibold">{module.label} runtime setup needed</p>
                  <p className="mt-1 break-words leading-5">
                    {module.reason ?? "Install missing runtime dependencies and rerun checks."}
                  </p>
                  {module.setup ? (
                    <code className="mt-1 block overflow-hidden text-ellipsis rounded border border-current/20 bg-white/80 p-2 font-mono text-[11px]">
                      {module.setup}
                    </code>
                  ) : null}
                  {module.setupCommand ? (
                    <code className="mt-1 block overflow-hidden text-ellipsis rounded border border-current/20 bg-white/80 p-2 font-mono text-[11px]">
                      {module.setupCommand}
                    </code>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cloneModules.map((module) => (
            <button
              className="rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-60"
              disabled={!module.cloneAllowed || cloningModuleId === module.id}
              key={module.id}
              onClick={() => {
                onClone(module.id);
              }}
              type="button"
            >
              {cloningModuleId === module.id ? "Cloning..." : `Clone ${module.label}`}
            </button>
          ))}
          <button
            className="rounded-md border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            onClick={onHide}
            type="button"
          >
            Hide
          </button>
        </div>
      </div>
    </section>
  );
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function VoiceProfileDropdown({
  buildingArtifactKey,
  heading = "Voice Profile",
  isLoading,
  profiles,
  researchModules,
  runConfiguration,
  selectedKokoroVoiceId,
  selectedProfile,
  selectedProfileId,
  ttsEngines,
  voiceProfileCredentialError,
  voiceProfileCredentials,
  showArtifactControls = true,
  showBackendControls = true,
  showBackendSummary = true,
  onBuildArtifact,
  onClearHuggingFaceToken,
  onClearSelection,
  onDeleteProfile,
  onOpenVoiceDashboard,
  onRunConfigurationChange,
  onSaveHuggingFaceToken,
  onSelectKokoroVoice,
  onSelectProfile,
  savingHuggingFaceTokenKey,
  isClearingHuggingFaceToken,
}: Readonly<{
  buildingArtifactKey: string | null;
  heading?: string;
  isLoading: boolean;
  profiles: VoiceProfile[];
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedKokoroVoiceId: string;
  selectedProfile: VoiceProfile | null;
  selectedProfileId: string;
  ttsEngines: TTSEngineDiagnostics[];
  voiceProfileCredentialError: string | null;
  voiceProfileCredentials: VoiceProfileCredentialStatus | null;
  showArtifactControls?: boolean;
  showBackendControls?: boolean;
  showBackendSummary?: boolean;
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onClearHuggingFaceToken: () => void;
  onClearSelection: () => void;
  onDeleteProfile: (id: string) => void;
  onOpenVoiceDashboard?: () => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSaveHuggingFaceToken: (profileId: string, targetId: string, token: string) => Promise<void>;
  onSelectKokoroVoice: (voiceId: string) => void;
  onSelectProfile: (id: string) => void;
  savingHuggingFaceTokenKey: string | null;
  isClearingHuggingFaceToken: boolean;
}>) {
  const [isOpen, setIsOpen] = useState(false);
  const artifactBuildTimeout = useArtifactBuildTimeoutState();
  const selectedKokoroVoice = findKokoroVoicepack(selectedKokoroVoiceId);
  const engineFamilyValue = kokoroEngineFamilyValue(runConfiguration.ttsEngine);
  const selectedEngine = findVoicePanelEngine(ttsEngines, engineFamilyValue);
  const showKokoroRenderModes = isKokoroRenderEngine(runConfiguration.ttsEngine);
  const activeKokoroRenderMode = kokoroRenderModeForConfiguration(
    runConfiguration,
    Boolean(selectedProfile),
  );
  const selectedEngineBlocked =
    selectedProfile && runConfiguration.options.voiceClone
      ? isEngineUnavailableForSelectedProfile(
          findVoicePanelEngine(ttsEngines, runConfiguration.ttsEngine) ?? selectedEngine,
          selectedProfile,
          runConfiguration,
        )
      : false;
  const supertonicVoices = selectedEngine?.voices ?? voicePanelSupertonicVoices();
  const supertonicLanguages = voicePanelSupertonicLanguages(selectedEngine);
  const activeLanguage =
    runConfiguration.ttsEngine === "supertonic-3"
      ? (runConfiguration.engineOptions.lang ?? "na")
      : (selectedProfile?.language ?? "en-US");
  const effectiveLanguage =
    activeLanguage === "na" ? (selectedProfile?.language ?? "en-US") : activeLanguage;
  const orderedKokoroVoicepacks = orderedKokoroVoicepacksForLanguage(effectiveLanguage);
  const activeName = selectedProfile?.name ?? "Default Voice";
  const likenessBadge = selectedProfile ? formatLikenessLabel(selectedProfile) : "Provider voice";
  const activeDetail = selectedProfile
    ? `${selectedProfile.language} · ${formatDuration(
        selectedProfile.referenceDurationMs ?? selectedProfile.durationMs,
      )} reference · ${likenessBadge}`
    : `${effectiveLanguage} voicepacks · ready`;
  let kokoroDetailSuffix = "";
  if (runConfiguration.ttsEngine === "supertonic-3") {
    kokoroDetailSuffix = " · kept for Auto/Kokoro runs";
  } else if (selectedProfile) {
    kokoroDetailSuffix = " · used when the cloned profile is off";
  }
  const updateEngine = (engineId: string) => {
    const engine = findVoicePanelEngine(ttsEngines, engineId);
    if (engineId === "kokoro") {
      onRunConfigurationChange(
        applyKokoroRenderMode(runConfiguration, selectedProfile ? "kokoclone" : "voicepack"),
      );
      return;
    }
    onRunConfigurationChange({
      ...runConfiguration,
      ttsEngine: engineId,
      engineOptions:
        engineId === "supertonic-3"
          ? {
              ...runConfiguration.engineOptions,
              voiceStyle:
                runConfiguration.engineOptions.voiceStyle ?? engine?.voices?.[0]?.id ?? "M1",
              lang: runConfiguration.engineOptions.lang ?? "na",
            }
          : {},
    });
  };
  const updateKokoroRenderMode = (mode: KokoroRenderMode) => {
    onRunConfigurationChange(applyKokoroRenderMode(runConfiguration, mode));
  };
  const updateEngineOption = (key: string, value: string) => {
    onRunConfigurationChange({
      ...runConfiguration,
      engineOptions: {
        ...runConfiguration.engineOptions,
        [key]: value,
      },
    });
  };
  const backendCopy =
    runConfiguration.ttsEngine === "supertonic-3" || showKokoroRenderModes
      ? null
      : "Auto keeps provider selection flexible; choose Kokoro when you want an explicit voicepack, KokoClone, or Kokoro Embed render.";
  const backendCopyNode = backendCopy ? <span>{backendCopy}</span> : null;
  const showKokoroVoicepackPicker =
    activeKokoroRenderMode === "voicepack" || runConfiguration.ttsEngine === "supertonic-3";
  const kokoroVoicepackControlLabel =
    runConfiguration.ttsEngine === "supertonic-3"
      ? "Kokoro fallback voicepack"
      : "Kokoro voicepack";
  const backendSummaryNode = showBackendSummary ? (
    <VoiceBackendSummary
      activeKokoroRenderMode={activeKokoroRenderMode}
      runConfiguration={runConfiguration}
      selectedEngine={selectedEngine}
      selectedKokoroVoiceId={selectedKokoroVoice?.id}
      selectedProfile={selectedProfile}
    />
  ) : null;

  return (
    <section className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[var(--vs-text)]">{heading}</h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="vs-muted text-xs">{String(profiles.length + 1)} voices</span>
          {onOpenVoiceDashboard ? (
            <button
              className="h-8 rounded-md border px-2 text-xs font-semibold transition hover:border-orange-300 hover:text-orange-700 vs-border vs-surface"
              data-testid="ui-action-voice-dashboard-open-cloning-rail"
              data-ui-action-surface="Workspace"
              onClick={onOpenVoiceDashboard}
              type="button"
            >
              Dashboard
            </button>
          ) : null}
        </div>
      </div>
      <div className="min-w-0 rounded-lg border p-3 vs-border vs-raised">
        <button
          className="flex w-full min-w-0 items-center gap-3 text-left"
          onClick={() => {
            setIsOpen((current) => !current);
          }}
          type="button"
        >
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border text-base font-semibold vs-border vs-surface">
            {activeName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-[var(--vs-text)]" title={activeName}>
              {activeName}
            </p>
            <p className="vs-muted mt-1 truncate text-xs" title={activeDetail}>
              {activeDetail}
            </p>
          </div>
          <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
            Ready
          </span>
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded border vs-border vs-surface vs-muted">
            <DisclosureIcon open={isOpen} />
          </span>
        </button>
        {selectedProfile ? (
          <div className="mt-3 grid gap-2">
            <p className="vs-muted truncate text-xs" title={selectedProfile.sourceFile}>
              {selectedProfile.referenceTrimmed
                ? "Trimmed clone reference"
                : "Full clone reference"}{" "}
              · {formatBytes(selectedProfile.sourceBytes)}
            </p>
            {showArtifactControls ? (
              <VoiceProfileArtifactControls
                artifactBuildTimeout={artifactBuildTimeout}
                buildingArtifactKey={buildingArtifactKey}
                credentialError={voiceProfileCredentialError}
                credentials={voiceProfileCredentials}
                isClearingHuggingFaceToken={isClearingHuggingFaceToken}
                modules={researchModules}
                profile={selectedProfile}
                onBuildArtifact={onBuildArtifact}
                onClearHuggingFaceToken={onClearHuggingFaceToken}
                onSaveHuggingFaceToken={onSaveHuggingFaceToken}
                savingHuggingFaceTokenKey={savingHuggingFaceTokenKey}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      {showBackendControls ? (
        <>
          <section className="grid min-w-0 gap-2 rounded-md border p-3 text-xs vs-border vs-raised vs-muted">
            <label className="grid min-w-0 gap-1">
              <span className="font-semibold text-[var(--vs-text)]">Narration backend</span>
              <select
                className="min-w-0 rounded-md border px-2 py-2 text-sm font-medium vs-border vs-surface"
                value={engineFamilyValue}
                onChange={(event) => {
                  updateEngine(event.currentTarget.value);
                }}
              >
                {voicePanelEngineOptions(ttsEngines).map((engine) => (
                  <option disabled={engine.status !== "ready"} key={engine.id} value={engine.id}>
                    {engine.label} · {engine.status}
                  </option>
                ))}
              </select>
              {selectedEngineBlocked ? (
                <span className="break-words text-xs leading-5 text-amber-700">
                  {voiceProfileTargetReadinessText(selectedProfile, runConfiguration.ttsEngine)}
                </span>
              ) : null}
              {runConfiguration.ttsEngine === "auto" ? (
                <span className="text-xs leading-5">
                  Auto chooses a sensible default; the Kokoro render mode below makes profile-backed
                  generation explicit.
                </span>
              ) : null}
            </label>
            {showKokoroRenderModes ? (
              <KokoroRenderModeSelector
                activeMode={activeKokoroRenderMode}
                buildingArtifactKey={buildingArtifactKey}
                modules={researchModules}
                profile={selectedProfile ?? null}
                artifactBuildTimeout={artifactBuildTimeout}
                onBuildArtifact={onBuildArtifact}
                onSelectMode={updateKokoroRenderMode}
              />
            ) : null}
            {runConfiguration.ttsEngine === "supertonic-3" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold text-[var(--vs-text)]">Supertonic voice</span>
                  <select
                    className="min-w-0 rounded-md border px-2 py-2 text-sm font-medium vs-border vs-surface"
                    value={runConfiguration.engineOptions.voiceStyle ?? "M1"}
                    onChange={(event) => {
                      updateEngineOption("voiceStyle", event.currentTarget.value);
                    }}
                  >
                    {supertonicVoices.map((voice) => (
                      <option key={voice.id} value={voice.id}>
                        {voice.name} {voice.gender ? `· ${voice.gender}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid min-w-0 gap-1">
                  <span className="font-semibold text-[var(--vs-text)]">Language</span>
                  <select
                    className="min-w-0 rounded-md border px-2 py-2 text-sm font-medium vs-border vs-surface"
                    value={runConfiguration.engineOptions.lang ?? "na"}
                    onChange={(event) => {
                      updateEngineOption("lang", event.currentTarget.value);
                    }}
                  >
                    {supertonicLanguages.map((language) => (
                      <option key={language.code} value={language.code}>
                        {language.label} · {language.code}
                      </option>
                    ))}
                  </select>
                </label>
                <span
                  className="min-w-0 truncate sm:col-span-2"
                  title={voicePanelSupertonicSummary(runConfiguration, selectedEngine)}
                >
                  {voicePanelSupertonicSummary(runConfiguration, selectedEngine)}
                </span>
              </div>
            ) : (
              backendCopyNode
            )}
          </section>
          {showKokoroVoicepackPicker ? (
            <label className="grid min-w-0 gap-1 rounded-md border p-3 text-xs vs-border vs-raised vs-muted">
              <span className="font-semibold text-[var(--vs-text)]">
                {kokoroVoicepackControlLabel}
              </span>
              <select
                className="min-w-0 rounded-md border px-2 py-2 text-sm font-medium vs-border vs-surface"
                value={selectedKokoroVoice?.id ?? DEFAULT_KOKORO_VOICE_ID}
                onChange={(event) => {
                  onSelectKokoroVoice(event.currentTarget.value);
                }}
              >
                {orderedKokoroVoicepacks.map(({ languageMatched, voice }) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} · {voice.locale} · {voice.id}
                    {languageMatched ? " · recommended" : ""}
                  </option>
                ))}
              </select>
              <span className="truncate" title={kokoroVoicepackDetail(selectedKokoroVoice?.id)}>
                {kokoroVoicepackDetail(selectedKokoroVoice?.id)}
                {kokoroDetailSuffix}
              </span>
            </label>
          ) : (
            <p className="rounded-md border p-3 text-xs leading-5 vs-border vs-raised vs-muted">
              Kokoro voicepack fallback: {kokoroVoicepackLabel(selectedKokoroVoice?.id)}. Switch to
              Kokoro Voicepack to change it for non-cloned renders.
            </p>
          )}
        </>
      ) : (
        backendSummaryNode
      )}
      {isLoading ? <p className="vs-muted text-sm">Loading profiles...</p> : null}
      {isOpen ? (
        <ul className="max-h-80 min-w-0 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <VoiceProfileOption
            detail="Kokoro voicepacks · non-cloned · ready"
            isActive={selectedProfileId === ""}
            name="Default Voice"
            onSelect={() => {
              onClearSelection();
              setIsOpen(false);
            }}
          />
          {profiles.map((profile) => (
            <VoiceProfileOption
              artifactSummary={
                <ProfileOptionArtifactStrip modules={researchModules} profile={profile} />
              }
              detail={`${profile.status} · ${profile.language} · ${formatDuration(profile.referenceDurationMs ?? profile.durationMs)}`}
              isActive={profile.id === selectedProfileId}
              key={profile.id}
              languageMatched={voiceProfileMatchesLanguage(effectiveLanguage, profile)}
              likeness={profile.likeness}
              name={profile.name}
              score={profile.referenceScore}
              onDelete={() => {
                onDeleteProfile(profile.id);
              }}
              onSelect={() => {
                onSelectProfile(profile.id);
                setIsOpen(false);
              }}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function VoiceBackendSummary({
  activeKokoroRenderMode,
  runConfiguration,
  selectedEngine,
  selectedKokoroVoiceId,
  selectedProfile,
}: Readonly<{
  activeKokoroRenderMode: KokoroRenderMode;
  runConfiguration: RunConfiguration;
  selectedEngine?: TTSEngineDiagnostics;
  selectedKokoroVoiceId?: string;
  selectedProfile: VoiceProfile | null;
}>) {
  const renderMode = KOKORO_RENDER_MODE_OPTIONS.find(
    (option) => option.id === activeKokoroRenderMode,
  );
  const backendLabel = selectedEngine?.label ?? runConfiguration.ttsEngine;
  const voiceLabel =
    runConfiguration.ttsEngine === "supertonic-3"
      ? voicePanelSupertonicSummary(runConfiguration, selectedEngine)
      : (renderMode?.label ?? kokoroVoicepackLabel(selectedKokoroVoiceId));
  return (
    <section className="grid min-w-0 gap-3 rounded-md border p-3 text-xs vs-border vs-raised">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className="font-semibold text-[var(--vs-text)]">Backend Summary</span>
        <span className="rounded px-2 py-1 text-[0.65rem] font-semibold bg-emerald-100 text-emerald-700">
          {selectedEngine?.status ?? "ready"}
        </span>
      </div>
      <dl className="grid gap-2">
        <SidebarFact label="Backend" value={backendLabel} />
        <SidebarFact label="Voice mode" value={voiceLabel} />
        <SidebarFact
          label="Profile"
          value={selectedProfile ? selectedProfile.name : "Built-in voice"}
        />
      </dl>
      <p className="vs-muted break-words leading-5">
        Edit backend, voicepack, performance, and provider options in Settings. The rail stays
        focused on selection and readiness.
      </p>
    </section>
  );
}

function KokoroRenderModeSelector({
  activeMode,
  artifactBuildTimeout,
  buildingArtifactKey,
  modules,
  profile,
  onBuildArtifact,
  onSelectMode,
}: Readonly<{
  activeMode: KokoroRenderMode;
  artifactBuildTimeout: ArtifactBuildTimeoutResolution;
  buildingArtifactKey: string | null;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile | null;
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onSelectMode: (mode: KokoroRenderMode) => void;
}>) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="font-semibold text-zinc-800">Kokoro render mode</span>
      <div className="grid gap-2">
        {KOKORO_RENDER_MODE_OPTIONS.map((option) => {
          const readiness = kokoroRenderModeReadiness(option.id, profile, modules);
          const targetId = kokoroRenderModeTargetId(option.id);
          const isBusy =
            targetId !== null &&
            profile !== null &&
            (buildingArtifactKey === `${profile.id}:${targetId}` ||
              ["queued", "building", "validating"].includes(
                profile.cloneTargets?.[targetId]?.status ?? "",
              ));
          const selected = option.id === activeMode;
          const canSelect = readiness.ready;
          const canPrepare = Boolean(profile && targetId && readiness.canPrepare && !isBusy);
          const timeoutBlocksAction = canPrepare && !artifactBuildTimeout.canBuild;
          return (
            <div
              className={`rounded-md border p-2 ${
                selected ? "border-orange-300 bg-orange-50" : "border-zinc-200 bg-white"
              }`}
              key={option.id}
            >
              <button
                className="grid w-full min-w-0 gap-1 text-left disabled:cursor-not-allowed"
                disabled={!canSelect}
                onClick={() => {
                  onSelectMode(option.id);
                }}
                type="button"
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-zinc-950">
                    {option.label}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[0.65rem] font-semibold ${kokoroRenderModeStatusClass(
                      readiness.status,
                      readiness.ready,
                    )}`}
                  >
                    {readiness.status}
                  </span>
                </span>
                <span className="text-xs leading-5 text-zinc-600">{option.detail}</span>
                <span className="text-xs leading-5 text-zinc-500">{readiness.detail}</span>
              </button>
              {canPrepare && profile && targetId ? (
                <button
                  className="mt-2 rounded border border-orange-200 bg-white px-2 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                  disabled={timeoutBlocksAction}
                  onClick={() => {
                    void onBuildArtifact(profile.id, targetId, artifactBuildTimeout.timeoutSeconds);
                  }}
                  title={
                    timeoutBlocksAction ? (artifactBuildTimeout.error ?? undefined) : undefined
                  }
                  type="button"
                >
                  {kokoroRenderModeActionLabel(readiness.status, isBusy)}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function kokoroRenderModeTargetId(mode: KokoroRenderMode): string | null {
  if (mode === "kokoclone") {
    return "kokoro-clone";
  }
  if (mode === "kokoro-embed") {
    return "kokoro-embed";
  }
  return null;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function kokoroRenderModeReadiness(
  mode: KokoroRenderMode,
  profile: VoiceProfile | null,
  modules: ResearchModuleDiagnostics[],
): { ready: boolean; status: string; detail: string; canPrepare: boolean } {
  const targetId = kokoroRenderModeTargetId(mode);
  if (!targetId) {
    return {
      ready: true,
      status: "ready",
      detail: "No voice profile target is required.",
      canPrepare: false,
    };
  }
  if (!profile) {
    return {
      ready: false,
      status: "profile needed",
      detail: "Select a voice profile before using profile-backed rendering.",
      canPrepare: false,
    };
  }
  const module = modules.find((item) => item.id === targetId);
  const target = profile.cloneTargets?.[targetId];
  const isInstalled = targetId === "kokoro-clone" || (module?.installed ?? false);
  const runtimeReady = targetId === "kokoro-clone" || researchModuleRuntimeReady(module);
  if (!isInstalled) {
    return {
      ready: false,
      status: "setup needed",
      detail: `${moduleLabel(targetId)} needs its optional local module cloned first.`,
      canPrepare: false,
    };
  }
  if (!runtimeReady) {
    return {
      ready: false,
      status: "setup needed",
      detail: module?.reason ?? "Run the isolated voice-embed setup before preparing this target.",
      canPrepare: false,
    };
  }
  if (!target) {
    return targetId === "kokoro-clone"
      ? {
          ready: true,
          status: "ready",
          detail: "Legacy KokoClone rendering can use the reference audio immediately.",
          canPrepare: false,
        }
      : {
          ready: false,
          status: "not built",
          detail: `${moduleLabel(targetId)} has not been prepared for this profile yet.`,
          canPrepare: true,
        };
  }
  if (target.status === "ready") {
    if (target.validation?.status === "failed") {
      return {
        ready: true,
        status: "check needed",
        detail: target.validation.error ?? "Rendering is ready; validation can be re-run.",
        canPrepare: true,
      };
    }
    const score = target.validation?.score;
    return {
      ready: true,
      status:
        typeof score === "number" && Number.isFinite(score)
          ? String(Math.round(score * 100))
          : "ready",
      detail: `${moduleLabel(targetId)} is ready for this profile.`,
      canPrepare: false,
    };
  }
  if (target.status === "failed") {
    return {
      ready: false,
      status: "failed",
      detail: target.error ?? target.validation?.error ?? `${moduleLabel(targetId)} failed.`,
      canPrepare: true,
    };
  }
  if (target.status === "cancelled") {
    return {
      ready: false,
      status: "cancelled",
      detail: `${moduleLabel(targetId)} was cancelled.`,
      canPrepare: true,
    };
  }
  if (target.status === "selected") {
    return {
      ready: false,
      status: "not built",
      detail: `${moduleLabel(targetId)} is selected for this profile and can be prepared now.`,
      canPrepare: true,
    };
  }
  return {
    ready: false,
    status: target.status,
    detail: `${moduleLabel(targetId)} is ${target.status}.`,
    canPrepare: false,
  };
}

function kokoroRenderModeActionLabel(status: string, isBusy: boolean): string {
  if (isBusy) {
    return "Preparing...";
  }
  if (status === "check needed") {
    return "Revalidate";
  }
  if (status === "failed" || status === "cancelled") {
    return "Retry";
  }
  return "Prepare target";
}

function kokoroRenderModeStatusClass(status: string, ready: boolean): string {
  if (status === "failed") {
    return "bg-red-100 text-red-700";
  }
  if (ready && status !== "check needed") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (status === "check needed") {
    return "bg-amber-100 text-amber-800";
  }
  return "bg-zinc-100 text-zinc-600";
}

function VoiceProfileArtifactControls({
  artifactBuildTimeout,
  buildingArtifactKey,
  credentialError,
  credentials,
  isClearingHuggingFaceToken,
  modules,
  profile,
  showTargetButtons = true,
  onBuildArtifact,
  onClearHuggingFaceToken,
  onSaveHuggingFaceToken,
  savingHuggingFaceTokenKey,
}: Readonly<{
  artifactBuildTimeout: ArtifactBuildTimeoutState;
  buildingArtifactKey: string | null;
  credentialError: string | null;
  credentials: VoiceProfileCredentialStatus | null;
  isClearingHuggingFaceToken: boolean;
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile;
  showTargetButtons?: boolean;
  onBuildArtifact: VoiceProfileArtifactBuildAction;
  onClearHuggingFaceToken: () => void;
  onSaveHuggingFaceToken: (profileId: string, targetId: string, token: string) => Promise<void>;
  savingHuggingFaceTokenKey: string | null;
}>) {
  const issues = voiceProfileTargetIssues(profile, modules);
  const startArtifactBuild = async (moduleId: string): Promise<void> => {
    if (!artifactBuildTimeout.canBuild) {
      return;
    }
    await onBuildArtifact(profile.id, moduleId, artifactBuildTimeout.timeoutSeconds);
  };
  return (
    <div className="grid gap-2 rounded-md border border-zinc-200 bg-white p-2">
      <div className="flex flex-wrap gap-1">
        <ArtifactChip profile={profile} moduleId="kokoro-clone" label="KokoClone" />
        {PROFILE_ARTIFACT_MODULE_ORDER.map((moduleId) => {
          const module = modules.find((item) => item.id === moduleId);
          return (
            <ArtifactChip
              key={moduleId}
              label={moduleLabel(moduleId)}
              module={module}
              moduleId={moduleId}
              profile={profile}
            />
          );
        })}
      </div>
      <ArtifactBuildTimeoutInput
        error={artifactBuildTimeout.error}
        input={artifactBuildTimeout.input}
        onInputChange={artifactBuildTimeout.setInput}
      />
      {showTargetButtons ? (
        <div className="grid gap-2">
          {["kokoro-clone", ...PROFILE_ARTIFACT_MODULE_ORDER].map((moduleId) => {
            const module = modules.find((item) => item.id === moduleId);
            const target = profile.cloneTargets?.[moduleId];
            const artifact = profile.cloneArtifacts?.[moduleId];
            const isBusy =
              buildingArtifactKey === `${profile.id}:${moduleId}` ||
              target?.status === "queued" ||
              target?.status === "building" ||
              target?.status === "validating" ||
              artifact?.status === "building";
            const isInstalled = moduleId === "kokoro-clone" || (module?.installed ?? false);
            const runtimeReady = moduleId === "kokoro-clone" || researchModuleRuntimeReady(module);
            const status = artifactChipStatus(
              moduleId,
              target?.status,
              artifact?.status,
              isInstalled && runtimeReady,
            );
            const validationNeedsCheck =
              target?.status === "ready" && target.validation?.status === "failed";
            const isReady = status === "ready" && !validationNeedsCheck;
            const showAction = isBusy || validationNeedsCheck || !isReady;
            if (!showAction) {
              return null;
            }
            const canPrepare = isInstalled && runtimeReady;
            const buttonLabel = targetBuildButtonLabel({
              isBusy,
              isInstalled,
              moduleId,
              runtimeReady,
              ready: status === "ready",
              status: target?.status,
            });
            const resolveArtifactBuildButtonTitle = (): string | undefined => {
              if (!artifactBuildTimeout.canBuild) {
                return artifactBuildTimeout.error ?? undefined;
              }
              if (!canPrepare) {
                return module?.reason ?? module?.setup;
              }
              return undefined;
            };
            const artifactBuildButtonTitle = resolveArtifactBuildButtonTitle();
            return (
              <button
                className="rounded-md border border-zinc-200 px-2 py-2 text-left text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
                disabled={!artifactBuildTimeout.canBuild || !canPrepare || isBusy}
                key={moduleId}
                onClick={() => {
                  void startArtifactBuild(moduleId);
                }}
                title={artifactBuildButtonTitle}
                type="button"
              >
                {buttonLabel}
              </button>
            );
          })}
        </div>
      ) : null}
      {issues.length > 0 ? (
        <div className="grid gap-2">
          {issues.map((issue) => (
            <div
              className={`rounded-md border px-3 py-2 text-xs leading-5 ${
                issue.severity === "error"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
              key={issue.key}
            >
              <p className="font-semibold">
                {issue.label}: {issue.title}
              </p>
              <p>{issue.detail}</p>
              {issue.command ? (
                <code className="mt-1 block overflow-hidden text-ellipsis rounded border border-current/20 bg-white/70 px-2 py-1 font-mono text-[11px]">
                  {issue.command}
                </code>
              ) : null}
              {issue.requiresHuggingFaceToken ? (
                <HuggingFaceTokenPrompt
                  credentialError={credentialError}
                  credentials={credentials}
                  isClearing={isClearingHuggingFaceToken}
                  isSaving={savingHuggingFaceTokenKey === `${profile.id}:${issue.moduleId}`}
                  onClear={onClearHuggingFaceToken}
                  onRevalidate={() => startArtifactBuild(issue.moduleId)}
                  onSave={(token) => onSaveHuggingFaceToken(profile.id, issue.moduleId, token)}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function HuggingFaceTokenPrompt({
  credentialError,
  credentials,
  isClearing,
  isSaving,
  onClear,
  onRevalidate,
  onSave,
}: Readonly<{
  credentialError: string | null;
  credentials: VoiceProfileCredentialStatus | null;
  isClearing: boolean;
  isSaving: boolean;
  onClear: () => void;
  onRevalidate: () => Promise<void>;
  onSave: (token: string) => Promise<void>;
}>) {
  const [token, setToken] = useState("");
  const source = credentials?.huggingFaceTokenSource ?? "none";
  const hasConfiguredToken = credentials?.huggingFaceTokenConfigured ?? false;
  const sourceLabel = huggingFaceCredentialSourceLabel(source);
  const saveLabel = hasConfiguredToken ? "Update token & re-validate" : "Save token & re-validate";
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-white/80 p-2">
      <p className="text-xs font-semibold text-amber-950">
        Hugging Face access:{" "}
        {hasConfiguredToken ? `Token configured from ${sourceLabel}` : "Token not configured"}
      </p>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <input
          autoComplete="off"
          className="min-w-0 rounded-md border border-amber-200 bg-white px-2 py-2 text-xs text-zinc-950 outline-none focus:border-orange-300 focus:ring-2 focus:ring-orange-100"
          onChange={(event) => {
            setToken(event.currentTarget.value);
          }}
          placeholder={hasConfiguredToken ? "Paste a replacement token" : "Paste HF token"}
          type="password"
          value={token}
        />
        <button
          className="rounded-md bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
          disabled={isSaving || token.trim().length === 0}
          onClick={() => {
            const clean = token.trim();
            if (clean.length === 0) {
              return;
            }
            void onSave(clean).then(() => {
              setToken("");
            });
          }}
          type="button"
        >
          {isSaving ? "Saving..." : saveLabel}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {hasConfiguredToken ? (
          <button
            className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            disabled={isSaving}
            onClick={() => {
              void onRevalidate();
            }}
            type="button"
          >
            Re-validate
          </button>
        ) : null}
        {source === "local" ? (
          <button
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
            disabled={isClearing || isSaving}
            onClick={onClear}
            type="button"
          >
            {isClearing ? "Clearing..." : "Clear local token"}
          </button>
        ) : null}
      </div>
      {credentialError ? <p className="text-xs text-red-700">{credentialError}</p> : null}
    </div>
  );
}

function huggingFaceCredentialSourceLabel(source: string): string {
  if (source === "local") {
    return "local";
  }
  if (source === "env") {
    return "environment";
  }
  return "not configured";
}

function ProfileOptionArtifactStrip({
  modules,
  profile,
}: Readonly<{
  modules: ResearchModuleDiagnostics[];
  profile: VoiceProfile;
}>) {
  return (
    <span className="mt-2 flex min-w-0 flex-wrap gap-1">
      <ArtifactChip profile={profile} moduleId="kokoro-clone" label="KokoClone" />
      {PROFILE_ARTIFACT_MODULE_ORDER.map((moduleId) => {
        const module = modules.find((item) => item.id === moduleId);
        return (
          <ArtifactChip
            key={moduleId}
            label={compactModuleLabel(moduleId)}
            module={module}
            moduleId={moduleId}
            profile={profile}
          />
        );
      })}
    </span>
  );
}

function ArtifactChip({
  label,
  module,
  moduleId,
  profile,
}: Readonly<{
  label: string;
  module?: ResearchModuleDiagnostics;
  moduleId: string;
  profile: VoiceProfile;
}>) {
  const artifact = profile.cloneArtifacts?.[moduleId];
  const target = profile.cloneTargets?.[moduleId];
  const moduleReady =
    moduleId === "kokoro-clone" ||
    (module?.installed === true && researchModuleRuntimeReady(module));
  const status = artifactChipStatus(moduleId, target?.status, artifact?.status, moduleReady);
  const validationWarning = target?.status === "ready" && target.validation?.status === "failed";
  const ready = status === "ready" && !validationWarning;
  const failed = status === "failed";
  const cancelled = status === "cancelled";
  const className = artifactChipClass(ready, failed, cancelled);
  const score = target?.validation?.score;
  let displayStatus = status;
  if (validationWarning) {
    displayStatus = "check needed";
  } else if (ready && typeof score === "number" && Number.isFinite(score)) {
    displayStatus = String(Math.round(score * 100));
  }
  return (
    <span
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-[0.65rem] font-semibold leading-none ${className}`}
      title={
        target?.validation?.error ?? target?.error ?? artifact?.error ?? module?.reason ?? status
      }
    >
      {label} {displayStatus}
    </span>
  );
}

function moduleLabel(moduleId: string): string {
  switch (moduleId) {
    case "kokoro-clone": {
      return "Kokoro Clone";
    }
    case "kokoro-embed": {
      return "Kokoro Embed";
    }
    case "supertonic-embed": {
      return "Supertonic Embed";
    }
    default: {
      return moduleId;
    }
  }
}

function compactModuleLabel(moduleId: string): string {
  switch (moduleId) {
    case "kokoro-clone": {
      return "KokoClone";
    }
    case "kokoro-embed": {
      return "K-Embed";
    }
    case "supertonic-embed": {
      return "S-Embed";
    }
    default: {
      return moduleId;
    }
  }
}

function targetBuildButtonLabel({
  isBusy,
  isInstalled,
  moduleId,
  ready,
  runtimeReady,
  status,
}: Readonly<{
  isBusy: boolean;
  isInstalled: boolean;
  moduleId: string;
  ready?: boolean;
  runtimeReady?: boolean;
  status?: string;
}>): string {
  const label = moduleLabel(moduleId);
  if (isBusy) {
    return `Preparing ${label}...`;
  }
  if (ready) {
    return `Re-validate ${label}`;
  }
  if (status === "failed") {
    return `Retry ${label}`;
  }
  if (status === "cancelled") {
    return `Retry ${label}`;
  }
  if (isInstalled) {
    if (runtimeReady === false) {
      return `${label} runtime setup needed`;
    }
    return `Prepare ${label}`;
  }
  return `${label} setup needed`;
}

function DisclosureIcon({ open }: Readonly<{ open: boolean }>) {
  return (
    <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16">
      <path
        d={open ? "m4 9 4-4 4 4" : "m4 6 4 4 4-4"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

interface VoiceProfileTargetIssue {
  key: string;
  label: string;
  moduleId: string;
  title: string;
  detail: string;
  command?: string;
  requiresHuggingFaceToken?: boolean;
  severity: "error" | "warning";
}

function voiceProfileTargetIssues(
  profile: VoiceProfile,
  modules: ResearchModuleDiagnostics[],
): VoiceProfileTargetIssue[] {
  const issues: VoiceProfileTargetIssue[] = [];
  for (const moduleId of ["kokoro-clone", ...PROFILE_ARTIFACT_MODULE_ORDER]) {
    const module = modules.find((item) => item.id === moduleId);
    const target = profile.cloneTargets?.[moduleId];
    const artifact = profile.cloneArtifacts?.[moduleId];
    const label = moduleLabel(moduleId);
    if (moduleId === "supertonic-embed" && !target && !artifact) {
      continue;
    }
    if (moduleId !== "kokoro-clone" && module?.installed && module.runtimeReady === false) {
      issues.push({
        key: `${moduleId}:runtime`,
        label,
        moduleId,
        title: "Runtime setup needed",
        detail:
          module.reason ??
          "The optional upstream is cloned, but its isolated Python runtime is not ready to build style artifacts.",
        command: module.setupCommand,
        severity: "warning",
      });
      continue;
    }
    if (target?.status === "ready" && target.validation?.status === "failed") {
      const normalized = humanizeProfileTargetProblem(target.validation.error ?? "", module);
      issues.push({
        key: `${moduleId}:validation`,
        label,
        moduleId,
        title: "Rendering is ready; validation needs attention",
        detail: normalized.detail,
        command: normalized.command,
        requiresHuggingFaceToken: normalized.requiresHuggingFaceToken,
        severity: "warning",
      });
      continue;
    }
    if (target?.status === "failed") {
      const normalized = humanizeProfileTargetProblem(
        target.error ?? target.validation?.error ?? "",
        module,
      );
      issues.push({
        key: `${moduleId}:target`,
        label,
        moduleId,
        title: "Preparation failed",
        detail: normalized.detail,
        command: normalized.command,
        requiresHuggingFaceToken: normalized.requiresHuggingFaceToken,
        severity: "error",
      });
      continue;
    }
    if (artifact?.status === "failed") {
      const normalized = humanizeProfileTargetProblem(artifact.error ?? "", module);
      issues.push({
        key: `${moduleId}:artifact`,
        label,
        moduleId,
        title: "Artifact build failed",
        detail: normalized.detail,
        command: normalized.command,
        requiresHuggingFaceToken: normalized.requiresHuggingFaceToken,
        severity: "error",
      });
    }
  }
  return issues;
}

function researchModuleRuntimeReady(module: ResearchModuleDiagnostics | undefined): boolean {
  if (!module) {
    return false;
  }
  return module.runtimeReady ?? module.status === "ready";
}

function artifactChipStatus(
  moduleId: string,
  targetStatus: string | undefined,
  artifactStatus: string | undefined,
  moduleInstalled: boolean,
): string {
  if (targetStatus) {
    return targetStatus;
  }
  if (moduleId === "kokoro-clone") {
    return "ready";
  }
  if (artifactStatus) {
    return artifactStatus;
  }
  return moduleInstalled ? "not built" : "setup needed";
}

function artifactChipClass(ready: boolean, failed: boolean, cancelled: boolean): string {
  if (ready) {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (failed) {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (cancelled) {
    return "border-zinc-300 bg-zinc-50 text-zinc-600";
  }
  return "border-amber-300 bg-amber-50 text-amber-800";
}

function voicePanelEngineOptions(engines: TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  if (engines.length > 0) {
    return engines.filter((engine) => engine.id !== "kokoro-clone" && engine.id !== "kokoro-embed");
  }
  return [
    {
      default: true,
      experimental: false,
      id: "auto",
      label: "Auto",
      local: true,
      status: "ready",
      supportsReference: true,
      supportsSSML: false,
      supportsSwedish: false,
      supportsVoice: true,
    },
    {
      default: false,
      experimental: false,
      id: "supertonic-3",
      label: "Supertonic 3",
      local: true,
      status: "ready",
      supportsReference: false,
      supportsSSML: false,
      supportsSwedish: true,
      supportsVoice: true,
    },
  ];
}

function resolveCreateAndListenCapabilityReason(
  engineId: string,
  engines: readonly TTSEngineDiagnostics[],
): string | undefined {
  if (engines.length === 0) {
    return undefined;
  }
  const cleanId = engineId.trim().toLowerCase();
  const engine =
    engines.find(
      (item) => item.id === cleanId || (cleanId === "supertonic" && item.id === "supertonic-3"),
    ) ??
    engines.find((item) => item.default || item.id === "auto") ??
    engines[0];
  if (engine.capabilities ? engine.capabilities.tts : engine.status === "ready") {
    return undefined;
  }
  return `${engine.label || engineId || "Provider"} lacks TTS. Select a ready provider in Settings > Runtime.`;
}

function createAndListenCapabilityAttributes(reason?: string | null) {
  return {
    "data-capability-gated": reason ? "true" : undefined,
    "data-capability-reason": reason ?? undefined,
    "data-provider-capability": "tts",
  } as const;
}

function findVoicePanelEngine(
  engines: TTSEngineDiagnostics[],
  engineId: string,
): TTSEngineDiagnostics | undefined {
  return voicePanelEngineOptions(engines).find((engine) => engine.id === engineId);
}

function isEngineUnavailableForSelectedProfile(
  engine: TTSEngineDiagnostics | undefined,
  profile: VoiceProfile | null,
  runConfiguration: RunConfiguration,
): boolean {
  if (engine?.status !== "ready") {
    return true;
  }
  if (!profile || !runConfiguration.options.voiceClone) {
    return false;
  }
  return !isVoiceProfileTargetReadyForEngine(profile, engine.id);
}

function voicePanelSupertonicVoices(): { id: string; name: string; gender?: string }[] {
  return SUPERTONIC_VOICE_STYLES.map((id) => ({
    gender: id.startsWith("M") ? "male" : "female",
    id,
    name: id,
  }));
}

function voicePanelSupertonicLanguages(engine: TTSEngineDiagnostics | undefined) {
  const supportedCodes =
    engine?.languages && engine.languages.length > 0
      ? engine.languages
      : SUPERTONIC_LANGUAGE_OPTIONS.map((language) => language.code);
  const supported = new Set(supportedCodes);
  return SUPERTONIC_LANGUAGE_OPTIONS.filter((language) => supported.has(language.code));
}

function voicePanelSupertonicSummary(
  runConfiguration: RunConfiguration,
  engine: TTSEngineDiagnostics | undefined,
): string {
  const voice = runConfiguration.engineOptions.voiceStyle ?? "M1";
  const language = runConfiguration.engineOptions.lang ?? "na";
  return `${voice} · ${supertonicLanguageLabel(language)} · ${language} · ${
    engine?.supportsSSML ? "SSML" : "plain text fallback"
  }`;
}

function VoiceProfileOption({
  artifactSummary,
  detail,
  isActive,
  languageMatched = false,
  likeness,
  name,
  score,
  onDelete,
  onSelect,
}: Readonly<{
  artifactSummary?: ReactNode;
  detail: string;
  isActive: boolean;
  languageMatched?: boolean;
  likeness?: VoiceProfile["likeness"];
  name: string;
  score?: number;
  onDelete?: () => void;
  onSelect: () => void;
}>) {
  return (
    <li className={`border-b border-zinc-200 last:border-b-0 ${isActive ? "bg-orange-50" : ""}`}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 p-3">
        <button className="min-w-0 text-left" onClick={onSelect} type="button">
          <span className="block truncate text-sm font-semibold text-zinc-950" title={name}>
            {name}
          </span>
          <span className="mt-1 block truncate text-xs text-zinc-500" title={detail}>
            {detail}
          </span>
          {languageMatched ? (
            <span className="mt-1 inline-flex rounded bg-sky-50 px-2 py-1 text-[0.65rem] font-semibold text-sky-700">
              Language match
            </span>
          ) : null}
          {artifactSummary}
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {likeness ? (
            <span
              className={`rounded px-2 py-1 text-xs font-semibold ${likenessBadgeClass(likeness)}`}
              title={likeness.reason}
            >
              {formatLikenessBadge(likeness)}
            </span>
          ) : null}
          {score ? (
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700">
              {formatSimilarity(score)}
            </span>
          ) : null}
          <button
            className="h-8 rounded-md border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:bg-zinc-100 disabled:text-zinc-400"
            disabled={isActive}
            onClick={onSelect}
            type="button"
          >
            {isActive ? "Active" : "Use"}
          </button>
          {onDelete ? (
            <button
              className="h-8 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50"
              onClick={onDelete}
              type="button"
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function NarrationReviewWorkbench({
  activePane,
  activeBlockId,
  bookScopeContent,
  job,
  onInspectBookSource,
  onInspectPreparedSource,
  onActiveBlockChange,
  onActivePaneChange,
  onPreviewSpeech,
  optimizedText,
  policyProfileLabel,
  projectId,
  runConfigurationLabel,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceLifecycle,
  text,
  voiceProfileLabel,
  voiceProfileId,
}: Readonly<{
  activePane: ReviewPane;
  activeBlockId: string | null;
  bookScopeContent: BookSourceScopeContent | null;
  job: VoiceJob | null;
  onActiveBlockChange: (blockId: string | null) => void;
  onActivePaneChange: (pane: ReviewPane) => void;
  onInspectBookSource: (source: BookSource) => void;
  onInspectPreparedSource: (source: PreparedSource) => void;
  onPreviewSpeech: () => void;
  optimizedText: string;
  policyProfileLabel: string;
  projectId: string;
  runConfigurationLabel: string;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceLifecycle: SourceLifecycleEnvelope;
  text: string;
  voiceProfileLabel: string;
  voiceProfileId: string;
}>) {
  const reviewBlocks = useMemo(
    () =>
      buildNarrationReviewBlocks({
        optimizedText,
        bookScopeContent,
        selectedBookScope,
        selectedBookSource,
        selectedPreparedSource,
        text,
      }),
    [
      bookScopeContent,
      optimizedText,
      selectedBookScope,
      selectedBookSource,
      selectedPreparedSource,
      text,
    ],
  );
  const selectedBlockId = selectReviewBlockId(reviewBlocks, activeBlockId);
  const selectedBlock =
    reviewBlocks.find((block) => block.id === selectedBlockId) ??
    (reviewBlocks.length > 0 ? reviewBlocks[0] : null);
  const sourceLabel = narrationReviewSourceLabel(selectedPreparedSource, selectedBookSource);
  const sourceMeta = narrationReviewSourceMeta({
    bookScopeContent,
    selectedBookScope,
    selectedBookSource,
    selectedPreparedSource,
    text,
  });
  let reviewSourceMode: SourceMode = "text";
  if (selectedPreparedSource) {
    reviewSourceMode = "fileUrl";
  } else if (selectedBookSource) {
    reviewSourceMode = "book";
  }
  const scopeTitle = workbenchScopeTitle({
    selectedBookScope,
    selectedBookSource,
    selectedPreparedSource,
    sourceMode: reviewSourceMode,
  });
  const validationReason =
    job?.voiceCheck.reason ??
    (job?.pipelineOptions?.asrCheck === false
      ? "Validation was disabled for this run."
      : "Validation appears after synthesis.");
  const validationTranscript = job?.voiceCheck.transcript ?? "";
  const mathPanel = narrationReviewMathPanel(selectedPreparedSource);
  const rulesPanel = narrationReviewRulesPanel(selectedPreparedSource, reviewBlocks, text);
  const inspectStructure =
    selectedPreparedSource || selectedBookSource
      ? () => {
          if (selectedPreparedSource) {
            onInspectPreparedSource(selectedPreparedSource);
            return;
          }
          if (selectedBookSource) {
            onInspectBookSource(selectedBookSource);
          }
        }
      : undefined;

  useEffect(() => {
    const nextBlockId = selectReviewBlockId(reviewBlocks, activeBlockId);
    if (nextBlockId !== activeBlockId) {
      onActiveBlockChange(nextBlockId);
    }
  }, [activeBlockId, onActiveBlockChange, reviewBlocks]);

  return (
    <Panel className="grid gap-3 p-4" variant="raised">
      <Suspense
        fallback={
          <LazySurfaceFallback
            label="Loading revision panel..."
            minHeightClassName="min-h-24"
            surface="revision-panel"
          />
        }
      >
        <LazyRevisionPanel
          activeBlockId={selectedBlock?.id ?? null}
          blocks={reviewBlocks}
          initialTabId={revisionTabForReviewPane(activePane)}
          policyProfileLabel={policyProfileLabel}
          runConfigurationLabel={runConfigurationLabel}
          scopeLabel={scopeTitle}
          sourceLifecycle={sourceLifecycle}
          sourceLabel={sourceLabel}
          sourceMeta={sourceMeta}
          validationReason={validationReason}
          validationSimilarity={job?.voiceCheck.similarity ?? 0}
          validationTranscript={validationTranscript}
          voiceProfileLabel={voiceProfileLabel}
          onActiveBlockChange={onActiveBlockChange}
          onInspectStructure={inspectStructure}
          onPreviewSpeech={onPreviewSpeech}
          onTabChange={(tabId) => {
            onActivePaneChange(reviewPaneForRevisionTab(tabId));
          }}
        />
      </Suspense>

      <ReviewContextPanels
        mathPanel={mathPanel}
        projectId={projectId}
        rulesPanel={rulesPanel}
        selectedPreparedSource={selectedPreparedSource}
        voiceProfileId={voiceProfileId}
      />
    </Panel>
  );
}

function revisionTabForReviewPane(pane: ReviewPane): RevisionTabId {
  if (pane === "validation") {
    return "diagnostics";
  }
  if (pane === "blocks") {
    return "blocks";
  }
  return "overview";
}

function reviewPaneForRevisionTab(tabId: RevisionTabId): ReviewPane {
  if (tabId === "diagnostics") {
    return "validation";
  }
  if (tabId === "blocks") {
    return "blocks";
  }
  return "script";
}

function narrationReviewSourceLabel(
  selectedPreparedSource: PreparedSource | null,
  selectedBookSource: BookSource | null,
): string {
  if (selectedPreparedSource?.title) {
    return selectedPreparedSource.title;
  }
  if (selectedPreparedSource?.sourceName) {
    return selectedPreparedSource.sourceName;
  }
  if (selectedBookSource) {
    return bookSourceName(selectedBookSource);
  }
  return "Draft text";
}

function narrationReviewSourceMeta({
  bookScopeContent,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  text,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  text: string;
}>): string {
  if (selectedPreparedSource) {
    return `${selectedPreparedSource.kind.toUpperCase()} · ${selectedPreparedSource.wordCount.toLocaleString()} words`;
  }
  if (selectedBookSource) {
    const scopeLabel = selectedBookScope ? bookScopeLabelForReview(selectedBookScope) : "Full book";
    const wordCount = bookScopeContent?.wordCount ?? selectedBookSource.wordCount;
    return `${selectedBookSource.kind.toUpperCase()} · ${scopeLabel} · ${wordCount.toLocaleString()} words`;
  }
  return `${text.trim().length.toLocaleString()} characters`;
}

function narrationReviewPreviewContent({
  bookScopeContent,
  previewText,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  previewText: string;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
}>): ReactNode {
  if (selectedPreparedSource?.renderMode === "markdown" && selectedPreparedSource.text) {
    return (
      <Suspense fallback={<LazySurfaceFallback label="Loading markdown preview..." />}>
        <MarkdownRenderer className="prose-markdown text-sm leading-6">
          {selectedPreparedSource.text}
        </MarkdownRenderer>
      </Suspense>
    );
  }
  if (selectedBookSource) {
    const bookText =
      bookScopeContent?.text ??
      (selectedBookScope ? bookScopeText(selectedBookSource, selectedBookScope) : "");
    return (
      <p className="whitespace-pre-wrap break-words">
        {bookText.trim() || "Select a readable book scope to preview narration text."}
      </p>
    );
  }
  return <p className="whitespace-pre-wrap break-words">{previewText}</p>;
}

function bookScopeLabelForReview(scope: BookScope): string {
  if (scope.label?.trim()) {
    return scope.label.trim();
  }
  if (scope.type === "chapter") {
    return `Chapter ${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    const start = scope.pageStart ?? 1;
    const end = scope.pageEnd ?? start;
    return start === end ? `Page ${String(start)}` : `Pages ${String(start)}-${String(end)}`;
  }
  return "Full book";
}

function workbenchScopeTitle({
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
}: Readonly<{
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: SourceMode;
}>): string {
  if (selectedPreparedSource) {
    return "Full source";
  }
  if (selectedBookSource) {
    return selectedBookScope ? bookScopeLabelForReview(selectedBookScope) : "Full book";
  }
  return sourceMode === "text" ? "Draft text" : "No source scope";
}

function narrationReviewMathPanel(selectedPreparedSource: PreparedSource | null): ReactNode {
  if (selectedPreparedSource) {
    return (
      <div className="overflow-hidden rounded-md border vs-border">
        <SourcePrepMathPanel source={selectedPreparedSource} />
      </div>
    );
  }
  return (
    <NarrationReviewEmptyState
      title="No prepared maths blocks"
      detail="Prepare a file or URL to review math-specific spoken forms before synthesis."
    />
  );
}

function narrationReviewRulesPanel(
  selectedPreparedSource: PreparedSource | null,
  reviewBlocks: RevisionBlock[],
  text: string,
): ReactNode {
  if (selectedPreparedSource) {
    return (
      <div className="overflow-hidden rounded-md border vs-border">
        <SourcePrepRulesPanel source={selectedPreparedSource} />
      </div>
    );
  }
  return <NarrationDraftRulesPanel blocks={reviewBlocks} text={text} />;
}

function ReviewContextPanels({
  mathPanel,
  projectId,
  rulesPanel,
  selectedPreparedSource,
  voiceProfileId,
}: Readonly<{
  mathPanel: ReactNode;
  projectId: string;
  rulesPanel: ReactNode;
  selectedPreparedSource: PreparedSource | null;
  voiceProfileId: string;
}>) {
  return (
    <Suspense
      fallback={<LazySurfaceFallback label="Loading context..." surface="review-context-panel" />}
    >
      <LazyReviewContextPanel
        mathPanel={mathPanel}
        projectId={projectId}
        rulesPanel={rulesPanel}
        selectedPreparedSource={selectedPreparedSource}
        voiceProfileId={voiceProfileId}
      />
    </Suspense>
  );
}

function NarrationReviewEmptyState({ detail, title }: Readonly<{ detail: string; title: string }>) {
  return (
    <div className="rounded-md border border-dashed p-5 text-sm vs-border vs-raised">
      <p className="font-semibold">{title}</p>
      <p className="mt-2 vs-muted">{detail}</p>
    </div>
  );
}

function NarrationDraftRulesPanel({
  blocks,
  text,
}: Readonly<{ blocks: RevisionBlock[]; text: string }>) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border text-sm sm:grid-cols-3 vs-border">
      <SourcePrepMetric label="Draft Blocks" value={blocks.length.toString()} />
      <SourcePrepMetric label="Words" value={words.toLocaleString()} />
      <SourcePrepMetric
        label="Estimate"
        value={formatDuration(
          blocks.reduce((total, block) => total + block.estimatedDurationMs, 0),
        )}
      />
    </dl>
  );
}

function buildNarrationReviewBlocks({
  bookScopeContent,
  optimizedText,
  selectedBookScope,
  selectedBookSource,
  selectedPreparedSource,
  text,
}: Readonly<{
  bookScopeContent: BookSourceScopeContent | null;
  optimizedText: string;
  selectedBookScope: BookScope | null;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  text: string;
}>): RevisionBlock[] {
  if (selectedPreparedSource?.blocks && selectedPreparedSource.blocks.length > 0) {
    return selectedPreparedSource.blocks.map((block, index) =>
      narrationBlockToReviewBlock(block, index),
    );
  }

  if (selectedBookSource) {
    if (bookScopeContent?.blocks && bookScopeContent.blocks.length > 0) {
      return bookScopeContent.blocks.map((block, index) =>
        narrationBlockToReviewBlock(block, index),
      );
    }
    const scopedBookText =
      bookScopeContent?.text ??
      (selectedBookScope ? bookScopeText(selectedBookSource, selectedBookScope) : "");
    if (scopedBookText.trim()) {
      return splitNarrationDraftIntoBlocks(scopedBookText.trim()).map((part, index) =>
        draftTextToRevisionBlock(part, index, "book", "body", "Book scope"),
      );
    }
  }

  const draft = (optimizedText || text).trim();
  if (draft) {
    return splitNarrationDraftIntoBlocks(draft).map((part, index) =>
      draftTextToRevisionBlock(part, index, "draft", "text", "Draft text"),
    );
  }

  if (selectedBookSource) {
    return [
      emptyRevisionBlock({
        id: `book-${selectedBookSource.id}`,
        kind: selectedBookSource.kind,
        label: bookSourceName(selectedBookSource),
        sourceSection: "Book source",
        spokenText: "Choose a book scope or create audio to review the listener-ready script.",
        text: `${bookSourceName(selectedBookSource)} · ${selectedBookSource.wordCount.toLocaleString()} words`,
      }),
    ];
  }

  return [
    emptyRevisionBlock({
      id: "empty-draft",
      kind: "text",
      label: "Waiting for source",
      sourceSection: "Draft text",
      spokenText: "Paste text, select a book, or prepare a file/URL to begin review.",
      text: "No source content selected.",
    }),
  ];
}

function narrationBlockToReviewBlock(block: NarrationBlock, index: number): RevisionBlock {
  const confidence = typeof block.confidence === "number" ? block.confidence : null;
  const warnings = block.warnings ?? [];
  const status = deriveRevisionBlockStatus({
    confidence,
    speakMode: block.speakMode,
    warnings,
  });
  const sourceSection = narrationBlockSourceSection(block, index);
  const policyNoteType = normalizeRevisionPolicyNoteType(block.speechPolicy.element ?? block.kind);
  return {
    confidence,
    estimatedDurationMs:
      block.estimatedDurationMs ??
      estimateNarrationTextDurationMs(block.spokenText ?? block.text ?? ""),
    id: block.id,
    index: index + 1,
    kind: block.kind,
    label: block.label ?? firstWords(block.spokenText ?? block.text ?? "", 8),
    mathSpeech: block.mathPreview?.speech,
    needsAttention: status === "needsReview" || warnings.length > 0,
    normalisationCount: block.normalisations?.length ?? 0,
    policyNote:
      block.speechPolicy.explanation ||
      `${block.speechPolicy.profile} policy rendered this block as ${block.speechPolicy.mode}.`,
    policyNoteType,
    pronunciationCount: block.pronunciations?.length ?? 0,
    segmentCount: block.segments?.length ?? 0,
    sourceSection,
    speakMode: block.speakMode,
    spokenText: block.spokenText ?? block.text ?? "",
    status,
    text: block.text ?? block.spokenText ?? block.label ?? "",
    warnings,
  };
}

function draftTextToRevisionBlock(
  part: string,
  index: number,
  idPrefix: string,
  kind: string,
  sourceSection: string,
): RevisionBlock {
  return {
    confidence: 1,
    estimatedDurationMs: estimateNarrationTextDurationMs(part),
    id: `${idPrefix}-${index.toString()}`,
    index: index + 1,
    kind,
    label: firstWords(part, 8),
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Draft prose is spoken as written before source-specific policy decisions exist.",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: estimateNarrationSegmentCount(part),
    sourceSection,
    speakMode: "speak",
    spokenText: part,
    status: "waiting",
    text: part,
    warnings: [],
  };
}

function emptyRevisionBlock({
  id,
  kind,
  label,
  sourceSection,
  spokenText,
  text,
}: Readonly<{
  id: string;
  kind: string;
  label: string;
  sourceSection: string;
  spokenText: string;
  text: string;
}>): RevisionBlock {
  return {
    confidence: null,
    estimatedDurationMs: 0,
    id,
    index: 1,
    kind,
    label,
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "No source block is ready for speech policy review yet.",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 0,
    sourceSection,
    speakMode: "speak",
    spokenText,
    status: "waiting",
    text,
    warnings: [],
  };
}

function narrationBlockSourceSection(block: NarrationBlock, index: number): string {
  const metadata = block.metadata ?? {};
  return (
    metadataString(metadata, "sectionTitle") ??
    metadataString(metadata, "section") ??
    metadataString(metadata, "heading") ??
    metadataString(metadata, "chapterTitle") ??
    block.label ??
    `Block ${String(index + 1)}`
  );
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function splitNarrationDraftIntoBlocks(value: string): string[] {
  const paragraphs = value
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const source = paragraphs.length > 0 ? paragraphs : [value];
  return source.flatMap((part) => chunkLongNarrationText(part, 720)).slice(0, 36);
}

function chunkLongNarrationText(value: string, maxLength: number): string[] {
  if (value.length <= maxLength) {
    return [value];
  }
  const chunks: string[] = [];
  let cursor = value.trim();
  while (cursor.length > maxLength) {
    const boundary = Math.max(
      cursor.lastIndexOf(". ", maxLength),
      cursor.lastIndexOf("? ", maxLength),
      cursor.lastIndexOf("! ", maxLength),
      cursor.lastIndexOf("; ", maxLength),
    );
    const cut = boundary > maxLength * 0.45 ? boundary + 1 : maxLength;
    chunks.push(cursor.slice(0, cut).trim());
    cursor = cursor.slice(cut).trim();
  }
  if (cursor) {
    chunks.push(cursor);
  }
  return chunks;
}

function firstWords(value: string, count: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean).slice(0, count);
  return words.length > 0 ? words.join(" ") : "Untitled block";
}

function firstNonEmptyString(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

function estimateNarrationSegmentCount(value: string): number {
  const sentenceMarkers = value.split(/[.!?]+/).filter((part) => part.trim().length > 0).length;
  return Math.max(1, sentenceMarkers);
}

function estimateNarrationTextDurationMs(value: string): number {
  if (!value.trim()) {
    return 0;
  }
  return Math.max(1200, Math.round(value.trim().split(/\s+/).length * 430));
}

function PlaybackControllerHost({
  job,
  latestProgress,
  onOpenCinema,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onResumeProgress,
}: Readonly<{
  job: VoiceJob;
  latestProgress: PlaybackProgress | null;
  onOpenCinema: () => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  return (
    <div aria-hidden="true" className="hidden">
      <StreamingAudioPanel
        job={job}
        latestProgress={latestProgress}
        onOpenCinema={onOpenCinema}
        onPlaybackCursorChange={onPlaybackCursorChange}
        onPlaybackControlsChange={onPlaybackControlsChange}
        onPlaybackStateChange={onPlaybackStateChange}
        onResumeProgress={onResumeProgress}
      />
    </div>
  );
}

function AudioPanel({
  canOpenCinema,
  job,
  latestProgress,
  onOpenCinema,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onResumeProgress,
}: Readonly<{
  canOpenCinema: boolean;
  job: VoiceJob | null;
  latestProgress: PlaybackProgress | null;
  onOpenCinema: () => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  useEffect(() => {
    if (!job) {
      onPlaybackControlsChange?.(null);
      onPlaybackStateChange?.(false);
    }
  }, [job, onPlaybackControlsChange, onPlaybackStateChange]);

  if (!job) {
    return (
      <Panel className="p-3 shadow-sm" variant="raised">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Audio Player</h2>
          <Button disabled={!canOpenCinema} onClick={onOpenCinema} size="sm" variant="secondary">
            Cinema
          </Button>
        </div>
        <div className="mt-3 grid min-h-32 place-items-center rounded-md border border-dashed px-4 py-5 text-center vs-border">
          <div>
            <p className="text-sm font-semibold">No audio generated yet</p>
            <p className="vs-muted mt-2 text-xs">
              Choose a run mode, then create audio to start buffering playback.
            </p>
            {latestProgress ? (
              <Button
                className="mt-4"
                onClick={() => {
                  onResumeProgress(latestProgress);
                }}
                size="sm"
                variant="soft"
              >
                Continue Listening · {formatPercentage(latestProgress.progress)}
              </Button>
            ) : null}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <StreamingAudioPanel
      job={job}
      key={job.id}
      latestProgress={latestProgress}
      onOpenCinema={onOpenCinema}
      onPlaybackCursorChange={onPlaybackCursorChange}
      onPlaybackControlsChange={onPlaybackControlsChange}
      onPlaybackStateChange={onPlaybackStateChange}
      onResumeProgress={onResumeProgress}
    />
  );
}

function StreamingAudioPanel({
  job,
  latestProgress,
  onOpenCinema,
  onPlaybackCursorChange,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onResumeProgress,
}: Readonly<{
  job: VoiceJob;
  latestProgress: PlaybackProgress | null;
  onOpenCinema: () => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const canPlayCompleted = job.status === "completed";
  const canPlayArrival = job.status !== "failed";
  const [playMode, setPlayMode] = useState<AudioPlaybackMode>(() =>
    job.status === "completed" ? "completed" : "arrival",
  );
  const [isStreamingPlaying, setIsStreamingPlaying] = useState(false);
  const [panelCursorSec, setPanelCursorSec] = useState(0);

  const isModeAvailable: Record<AudioPlaybackMode, boolean> = {
    arrival: true,
    completed: canPlayCompleted,
  };
  const isPlaybackLocked = isStreamingPlaying;

  const isModeDisabled = useCallback(
    (mode: AudioPlaybackMode) => isPlaybackLocked && playMode !== mode,
    [isPlaybackLocked, playMode],
  );

  const modeButtonClass = useCallback(
    (mode: AudioPlaybackMode, isAvailable: boolean) => {
      if (playMode === mode) {
        return "inline-flex h-7 min-w-0 items-center justify-center rounded border border-orange-500 bg-orange-500/10 px-2 text-xs font-semibold text-orange-600";
      }

      if (!isAvailable) {
        return "inline-flex h-7 min-w-0 items-center justify-center rounded border border-transparent px-2 text-xs font-semibold opacity-40";
      }

      return "vs-muted inline-flex h-7 min-w-0 items-center justify-center rounded border border-transparent px-2 text-xs font-semibold transition hover:bg-[var(--vs-raised)]";
    },
    [playMode],
  );

  const isArrivalMode = playMode === "arrival";
  const isCompletedMode = playMode === "completed";

  const playModeLabel: Record<AudioPlaybackMode, string> = {
    arrival: "Arrival",
    completed: "Completed",
  };

  const handlePlaybackStateChange = useCallback(
    (isPlaying: boolean) => {
      setIsStreamingPlaying(isPlaying);
      onPlaybackStateChange?.(isPlaying);
    },
    [onPlaybackStateChange],
  );
  const handlePlaybackCursorChange = useCallback(
    (cursorSec: number) => {
      setPanelCursorSec(cursorSec);
      onPlaybackCursorChange?.(cursorSec);
    },
    [onPlaybackCursorChange],
  );

  useEffect(() => {
    return () => {
      onPlaybackControlsChange?.(null);
      onPlaybackStateChange?.(false);
    };
  }, [onPlaybackControlsChange, onPlaybackStateChange]);

  useEffect(() => {
    if (job.status === "completed" && !isStreamingPlaying) {
      setPlayMode("completed");
    }
  }, [isStreamingPlaying, job.status]);

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border p-3 shadow-sm vs-raised">
      <div className="grid gap-2.5">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Audio Player</h2>
            <p className="vs-muted mt-1 truncate text-xs">
              {job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"} ·{" "}
              {formatDuration(job.durationMs)}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-orange-300 bg-orange-500/10 px-2 py-0.5 text-[0.68rem] font-semibold text-orange-600">
            {job.status}
          </span>
        </div>
        <div className="grid min-w-0 gap-2 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
          <p className="vs-muted min-w-0 truncate text-xs">
            {playModeLabel[playMode]} mode · {String(readySegments)} segment
            {readySegments === 1 ? "" : "s"} ready
          </p>
          <div className="grid min-w-0 grid-cols-1 gap-2 2xl:grid-cols-[auto_minmax(0,1fr)]">
            <button
              className="min-h-8 min-w-0 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 transition hover:bg-orange-500/15"
              onClick={onOpenCinema}
              type="button"
            >
              Cinema
            </button>
            <div className="grid min-w-0 grid-cols-2 overflow-hidden rounded-md border p-0.5 vs-border">
              {(["arrival", "completed"] as const).map((mode) => {
                const isAvailable = isModeAvailable[mode];
                return (
                  <button
                    className={modeButtonClass(mode, isAvailable)}
                    disabled={isModeDisabled(mode)}
                    key={mode}
                    onClick={() => {
                      setPlayMode(mode);
                    }}
                    type="button"
                  >
                    {playModeLabel[mode]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        {latestProgress ? (
          <AudioResumeAction progress={latestProgress} onResumeProgress={onResumeProgress} />
        ) : null}
      </div>

      <div className="mt-3">
        {isCompletedMode ? (
          <CompletedAudioPlayer
            key={`completed-${job.id}`}
            job={job}
            src={canPlayCompleted ? audioSource(job) : ""}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={handlePlaybackCursorChange}
          />
        ) : null}
        {isArrivalMode ? (
          <ArrivalAudioPlayer
            key={`arrival-${job.id}`}
            job={job}
            canPlay={canPlayArrival}
            onPlaybackControlsChange={onPlaybackControlsChange}
            onPlaybackStateChange={handlePlaybackStateChange}
            onPlaybackCursorChange={handlePlaybackCursorChange}
          />
        ) : null}
      </div>
      <QueueBufferPanel currentTimeSec={panelCursorSec} job={job} />
    </section>
  );
}

function AudioResumeAction({
  progress,
  onResumeProgress,
}: Readonly<{
  progress: PlaybackProgress;
  onResumeProgress: (progress: PlaybackProgress) => void;
}>) {
  return (
    <button
      className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-orange-500/10 px-3 py-2 text-left text-xs text-orange-700 transition hover:bg-orange-500/15"
      onClick={() => {
        onResumeProgress(progress);
      }}
      type="button"
    >
      <span className="min-w-0">
        <span className="block font-semibold">Continue Listening</span>
        <span className="block truncate">
          {resumeProgressLabel(progress)} ·{" "}
          {formatDuration(Math.round(progress.currentTimeSec * 1000))}
        </span>
      </span>
      <span className="shrink-0 font-semibold">{formatPercentage(progress.progress)}</span>
    </button>
  );
}

function resumeProgressLabel(progress: PlaybackProgress): string {
  if (progress.bookScope?.label) {
    return progress.bookScope.label;
  }
  if (progress.bookSourceId) {
    return "Book source";
  }
  if (progress.preparedSourceId) {
    return "Prepared source";
  }
  return progress.jobId ? "Previous job" : "Saved progress";
}

function queueBlockClass(
  segmentIndex: number,
  ready: number,
  generating: number,
  playing: number,
): string {
  if (segmentIndex === playing) {
    return "bg-orange-600 ring-2 ring-orange-200";
  }
  if (segmentIndex <= ready) {
    return "bg-orange-400";
  }
  if (segmentIndex === generating) {
    return "bg-[var(--vs-generating)]";
  }
  return "bg-[var(--vs-border)]";
}

function queueBlockSegmentIndex(
  blockIndex: number,
  visibleBlocks: number,
  totalSegments: number,
): number {
  if (totalSegments <= visibleBlocks) {
    return blockIndex + 1;
  }
  return Math.max(1, Math.ceil(((blockIndex + 1) / visibleBlocks) * totalSegments));
}

function QueueBufferPanel({
  currentTimeSec,
  job,
}: Readonly<{ currentTimeSec: number; job: VoiceJob }>) {
  const total = Math.max(
    job.retries.totalSegments,
    job.segments?.length ?? 0,
    job.audioReadySegments ?? 0,
    1,
  );
  const ready = Math.max(0, job.audioReadySegments ?? 0);
  const generating =
    job.status === "completed" ? 0 : Math.max(ready + 1, job.progress.currentSegment ?? 0);
  const playing = resolvePlayingSegmentIndex(job, currentTimeSec);
  const visibleBlocks = Math.min(24, Math.max(1, total));

  return (
    <section className="mt-3 border-t pt-3 vs-border">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Queue</h3>
        <p className="text-xs font-semibold text-orange-600">
          {String(ready)} / {String(total)} ready
        </p>
      </div>
      <div
        className="mt-3 grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(${String(visibleBlocks)}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: visibleBlocks }).map((_, index) => {
          const segmentIndex = queueBlockSegmentIndex(index, visibleBlocks, total);
          const blockClass = queueBlockClass(segmentIndex, ready, generating, playing);
          return (
            <span
              aria-hidden="true"
              className={`h-3.5 rounded ${blockClass}`}
              key={`queue-${String(index)}`}
              title={`Segment ${String(segmentIndex)}`}
            />
          );
        })}
      </div>
      <div className="vs-muted mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-xs">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-600" />
          Playing
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-orange-400" />
          Buffered
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--vs-generating)]" />
          Generating
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--vs-border)]" />
          Pending
        </span>
      </div>
    </section>
  );
}

function resolvePlayingSegmentIndex(job: VoiceJob, currentTimeSec: number): number {
  if (currentTimeSec <= 0) {
    return job.status === "completed" ? 0 : Math.max(1, job.progress.currentSegment ?? 0);
  }
  const durations = job.audioSegmentDurationsMs ?? [];
  if (durations.length === 0) {
    return Math.max(1, job.progress.currentSegment ?? 0);
  }
  let cursorMs = currentTimeSec * 1000;
  for (const [index, durationMs] of durations.entries()) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      continue;
    }
    if (cursorMs <= durationMs) {
      return index + 1;
    }
    cursorMs -= durationMs;
  }
  return Math.min(durations.length, Math.max(1, job.audioReadySegments ?? 1));
}

function WaveformDisplay({
  bars,
  progress,
}: Readonly<{
  bars: number[];
  progress: number;
}>) {
  const displayBars =
    bars.length > 0 ? bars : Array.from({ length: WAVEFORM_DISPLAY_BAR_COUNT }, () => 0);
  const activeIndex = waveformProgressIndex(progress, displayBars.length);

  return (
    <div
      className="grid h-10 min-w-0 items-center gap-px rounded-md bg-[var(--vs-surface)] py-1"
      style={{ gridTemplateColumns: `repeat(${String(displayBars.length)}, minmax(0, 1fr))` }}
    >
      {displayBars.map((height, index) => (
        <span
          aria-hidden="true"
          className={`w-full rounded-full ${index < activeIndex ? "bg-orange-500" : "bg-[var(--vs-border)]"}`}
          data-waveform-bar={index}
          data-waveform-value={height.toFixed(4)}
          key={`waveform-${String(index)}`}
          style={{ height: `${Math.round(4 + height * 29).toString()}px` }}
        />
      ))}
    </div>
  );
}

function TransportButton({
  children,
  label,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-full text-sm hover:bg-[var(--vs-surface)]"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function SeekTenIcon({ direction }: Readonly<{ direction: "backward" | "forward" }>) {
  const isBackward = direction === "backward";
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <path
        d={
          isBackward
            ? "M8 6.5H4.8V3.2M5 6.4A8.4 8.4 0 1 1 3.7 12"
            : "M16 6.5h3.2V3.2M19 6.4A8.4 8.4 0 1 0 20.3 12"
        }
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <text fill="currentColor" fontSize="6.6" fontWeight="700" textAnchor="middle" x="12" y="14.2">
        10
      </text>
    </svg>
  );
}

function SkipSegmentIcon({ direction }: Readonly<{ direction: "backward" | "forward" }>) {
  if (direction === "backward") {
    return (
      <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
        <path d="M6.5 5v14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
        <path d="M18 6.5 9.5 12l8.5 5.5V6.5Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M17.5 5v14" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
      <path d="M6 6.5 14.5 12 6 17.5V6.5Z" fill="currentColor" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5 translate-x-px" fill="none" viewBox="0 0 24 24">
      <path d="M8 5.8v12.4L18.4 12 8 5.8Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24">
      <rect fill="currentColor" height="13" rx="1.4" width="4" x="7" y="5.5" />
      <rect fill="currentColor" height="13" rx="1.4" width="4" x="13" y="5.5" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 9.5h3.5L13 5v14l-5.5-4.5H4v-5Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M16 9a4.4 4.4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24">
      <path
        d="M5 7h14M5 17h14M9 4.8v4.4M15 14.8v4.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.7"
      />
      <circle cx="9" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="15" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PlayerStatusLine({
  currentTimeSec,
  durationSec,
  isLive,
  segment,
}: Readonly<{
  currentTimeSec: number;
  durationSec: number;
  isLive: boolean;
  segment: string;
}>) {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden text-xs">
      <span className="inline-flex min-w-0 items-center gap-2 font-medium text-orange-600">
        <span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />
        {isLive ? "Playing (live)" : "Ready"}
      </span>
      <span className="vs-muted">
        {formatDuration(Math.round(currentTimeSec * 1000))} /{" "}
        {formatDuration(Math.round(durationSec * 1000))}
      </span>
      <span className="vs-muted col-span-2 truncate" title={segment}>
        {segment}
      </span>
    </div>
  );
}

function useCompletedWaveformBars(src: string, canPlayCompleted: boolean) {
  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  useEffect(() => {
    if (!canPlayCompleted || !src) {
      setWaveformBars([]);
      return;
    }

    const controller = new AbortController();
    const context = new AudioContext();
    const analyze = async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) {
          return;
        }
        const rawAudio = await response.arrayBuffer();
        const decoded = await context.decodeAudioData(rawAudio);
        const bars = await buildWaveformBarsFromAudioBuffersLazy(
          [decoded],
          WAVEFORM_DISPLAY_BAR_COUNT,
        );
        if (!controller.signal.aborted) {
          setWaveformBars(bars);
        }
      } catch {
        if (!controller.signal.aborted) {
          setWaveformBars([]);
        }
      } finally {
        void context.close().catch(() => null);
      }
    };

    void analyze();
    return () => {
      controller.abort();
      void context.close().catch(() => null);
    };
  }, [canPlayCompleted, src]);

  return waveformBars;
}

function resetUnavailableCompletedAudio({
  audioRef,
  isSeekCommitInProgressRef,
  isSeekingRef,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
  setIsSeeking,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSeeking: (value: boolean) => void;
}) {
  const audio = audioRef.current;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
  setError(null);
  setIsPlaying(false);
  setCurrentTimeSec(0);
  setDurationSec(0);
  isSeekingRef.current = false;
  isSeekCommitInProgressRef.current = false;
  setIsSeeking(false);
}

function useCompletedAudioAvailabilityReset({
  audioRef,
  canPlayCompleted,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackStateChange,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
  setIsSeeking,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSeeking: (value: boolean) => void;
}) {
  useEffect(() => {
    if (!canPlayCompleted) {
      resetUnavailableCompletedAudio({
        audioRef,
        isSeekCommitInProgressRef,
        isSeekingRef,
        setCurrentTimeSec,
        setDurationSec,
        setError,
        setIsPlaying,
        setIsSeeking,
      });
    }
    onPlaybackStateChange?.(false);
  }, [
    audioRef,
    canPlayCompleted,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackStateChange,
    setCurrentTimeSec,
    setDurationSec,
    setError,
    setIsPlaying,
    setIsSeeking,
  ]);
}

function useCompletedSeekControls({
  audioRef,
  currentTimeRef,
  durationMs,
  durationSec,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackCursorChange,
  seekSliderValueRef,
  setCurrentTimeSec,
  setIsSeeking,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeRef: WritableRef<number>;
  durationMs: number;
  durationSec: number;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  seekSliderValueRef: WritableRef<number>;
  setCurrentTimeSec: (value: number) => void;
  setIsSeeking: (value: boolean) => void;
}) {
  const handleSeekStart = useCallback(() => {
    isSeekingRef.current = true;
    setIsSeeking(true);
    seekSliderValueRef.current = currentTimeRef.current;
  }, [currentTimeRef, isSeekingRef, seekSliderValueRef, setIsSeeking]);

  const clampSeekTarget = useCallback(
    (target: number) => {
      const fallbackDurationSec = durationMs > 0 ? durationMs / 1000 : 0;
      const safeDuration = durationSec > 0 ? durationSec : fallbackDurationSec;
      return safeDuration > 0 ? Math.max(0, Math.min(target, safeDuration)) : Math.max(0, target);
    },
    [durationMs, durationSec],
  );

  const commitSeek = useCallback(
    (target: number) => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      const safeTarget = clampSeekTarget(target);
      isSeekingRef.current = true;
      setIsSeeking(true);
      currentTimeRef.current = safeTarget;
      setCurrentTimeSec(safeTarget);
      onPlaybackCursorChange?.(safeTarget);
      audio.currentTime = safeTarget;
      requestAnimationFrame(() => {
        isSeekingRef.current = false;
        setIsSeeking(false);
      });
    },
    [
      audioRef,
      clampSeekTarget,
      currentTimeRef,
      isSeekingRef,
      onPlaybackCursorChange,
      setCurrentTimeSec,
      setIsSeeking,
    ],
  );

  const resolveSeekTarget = useCallback(
    (value?: number) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return clampSeekTarget(value);
      }
      return clampSeekTarget(seekSliderValueRef.current);
    },
    [clampSeekTarget, seekSliderValueRef],
  );

  const handleSeekCommit = useCallback(
    (value?: number) => {
      if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
        isSeekingRef.current = true;
        setIsSeeking(true);
        seekSliderValueRef.current = currentTimeRef.current;
      }

      if (!isSeekingRef.current || isSeekCommitInProgressRef.current) {
        return;
      }
      isSeekCommitInProgressRef.current = true;
      const next = resolveSeekTarget(value);
      currentTimeRef.current = next;
      seekSliderValueRef.current = next;
      setCurrentTimeSec(next);
      commitSeek(next);
      requestAnimationFrame(() => {
        isSeekingRef.current = false;
        isSeekCommitInProgressRef.current = false;
        setIsSeeking(false);
      });
    },
    [
      commitSeek,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      resolveSeekTarget,
      seekSliderValueRef,
      setCurrentTimeSec,
      setIsSeeking,
    ],
  );

  const handleSeekUpdate = useCallback(
    (rawValue: number) => {
      if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
        isSeekingRef.current = true;
        setIsSeeking(true);
        seekSliderValueRef.current = currentTimeRef.current;
      }

      if (!isSeekingRef.current) {
        return;
      }

      const target = clampSeekTarget(
        Number.isFinite(rawValue) ? rawValue : seekSliderValueRef.current,
      );
      seekSliderValueRef.current = target;
      currentTimeRef.current = target;
      setCurrentTimeSec(target);
      onPlaybackCursorChange?.(target);
    },
    [
      clampSeekTarget,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      onPlaybackCursorChange,
      seekSliderValueRef,
      setCurrentTimeSec,
      setIsSeeking,
    ],
  );

  const handleSeekInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekInputEvent = useCallback(
    (event: React.SyntheticEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekBlur = useCallback(() => {
    if (!isSeekingRef.current && !isSeekCommitInProgressRef.current) {
      return;
    }
    handleSeekCommit();
  }, [handleSeekCommit, isSeekCommitInProgressRef, isSeekingRef]);

  const skipBy = useCallback(
    (seconds: number) => {
      commitSeek(currentTimeRef.current + seconds);
    },
    [commitSeek, currentTimeRef],
  );

  return {
    handleSeekBlur,
    handleSeekInput,
    handleSeekInputEvent,
    handleSeekKeyCommit: handleSeekCommit,
    handleSeekPointerCommit: handleSeekCommit,
    handleSeekStart,
    handleSeekTouchCommit: handleSeekCommit,
    seekTo: commitSeek,
    skipBy,
  };
}

function useCompletedAudioEventHandlers({
  audioRef,
  currentTimeRef,
  isSeekCommitInProgressRef,
  isSeekingRef,
  onPlaybackCursorChange,
  onPlaybackStateChange,
  setCurrentTimeSec,
  setDurationSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeRef: WritableRef<number>;
  isSeekCommitInProgressRef: WritableRef<boolean>;
  isSeekingRef: WritableRef<boolean>;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  setCurrentTimeSec: (value: number) => void;
  setDurationSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    const nextDuration = Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0;
    setDurationSec(nextDuration);
    if (currentTimeRef.current > 0 && currentTimeRef.current < nextDuration) {
      audio.currentTime = currentTimeRef.current;
    } else {
      currentTimeRef.current = audio.currentTime;
      setCurrentTimeSec(audio.currentTime);
      onPlaybackCursorChange?.(audio.currentTime);
    }
  }, [audioRef, currentTimeRef, onPlaybackCursorChange, setCurrentTimeSec, setDurationSec]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || isSeekingRef.current || isSeekCommitInProgressRef.current) {
      return;
    }
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    currentTimeRef.current = current;
    setCurrentTimeSec(current);
    onPlaybackCursorChange?.(current);
  }, [
    audioRef,
    currentTimeRef,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackCursorChange,
    setCurrentTimeSec,
  ]);

  const onPlay = useCallback(() => {
    setError(null);
    setIsPlaying(true);
    onPlaybackCursorChange?.(currentTimeRef.current);
    onPlaybackStateChange?.(true);
  }, [currentTimeRef, onPlaybackCursorChange, onPlaybackStateChange, setError, setIsPlaying]);

  const onPause = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange, setIsPlaying]);

  const onEnded = useCallback(() => {
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [onPlaybackStateChange, setIsPlaying]);

  const onAudioError = useCallback(() => {
    const audioError = audioRef.current?.error;
    const message = audioError && typeof audioError.message === "string" ? audioError.message : "";
    setError(message || "Completed playback failed. Please retry.");
    setIsPlaying(false);
    onPlaybackStateChange?.(false);
  }, [audioRef, onPlaybackStateChange, setError, setIsPlaying]);

  return { onAudioError, onEnded, onLoadedMetadata, onPause, onPlay, onTimeUpdate };
}

function useCompletedAudioCommands({
  audioRef,
  canPlayCompleted,
  currentTimeRef,
  isPlaying,
  onPlaybackCursorChange,
  onPlaybackStateChange,
  resolvedDurationSec,
  setCurrentTimeSec,
  setError,
  setIsPlaying,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  currentTimeRef: WritableRef<number>;
  isPlaying: boolean;
  onPlaybackCursorChange?: (cursorSec: number) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  resolvedDurationSec: number;
  setCurrentTimeSec: (value: number) => void;
  setError: (value: string | null) => void;
  setIsPlaying: (value: boolean) => void;
}) {
  const resetAudioToStart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    audio.currentTime = 0;
    currentTimeRef.current = 0;
    setCurrentTimeSec(0);
    onPlaybackCursorChange?.(0);
  }, [audioRef, currentTimeRef, onPlaybackCursorChange, setCurrentTimeSec]);

  const playCompletedAudio = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !canPlayCompleted) {
      return;
    }
    if (resolvedDurationSec > 0 && currentTimeRef.current >= resolvedDurationSec - 0.05) {
      resetAudioToStart();
    }

    setError(null);
    try {
      await audio.play();
    } catch {
      setError("Browser blocked playback. Press play again.");
      setIsPlaying(false);
      onPlaybackStateChange?.(false);
    }
  }, [
    audioRef,
    canPlayCompleted,
    currentTimeRef,
    onPlaybackStateChange,
    resetAudioToStart,
    resolvedDurationSec,
    setError,
    setIsPlaying,
  ]);

  const handlePlayToggle = useCallback(async () => {
    if (isPlaying) {
      audioRef.current?.pause();
      return;
    }
    await playCompletedAudio();
  }, [audioRef, isPlaying, playCompletedAudio]);

  const restartCompletedAudio = useCallback(async () => {
    resetAudioToStart();
    await playCompletedAudio();
  }, [playCompletedAudio, resetAudioToStart]);

  return { handlePlayToggle, playCompletedAudio, restartCompletedAudio };
}

function useCompletedPlaybackControllerRegistration({
  audioRef,
  canPlayCompleted,
  isPlaying,
  isSeeking,
  onPlaybackControlsChange,
  playbackRate,
  playCompletedAudio,
  restartCompletedAudio,
  seekTo,
  setPlaybackRate,
  skipBy,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  isPlaying: boolean;
  isSeeking: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  playbackRate: number;
  playCompletedAudio: () => Promise<void> | void;
  restartCompletedAudio: () => Promise<void> | void;
  seekTo: (seconds: number) => void;
  setPlaybackRate: (rate: number) => void;
  skipBy: (seconds: number) => void;
}) {
  useEffect(() => {
    if (!canPlayCompleted) {
      onPlaybackControlsChange?.(null);
      return;
    }
    onPlaybackControlsChange?.({
      isAvailable: true,
      isPlaying,
      isSeeking,
      playbackRate,
      pause: () => {
        audioRef.current?.pause();
      },
      play: playCompletedAudio,
      restart: restartCompletedAudio,
      seekTo,
      setPlaybackRate,
      skipBy,
    });
    return () => {
      onPlaybackControlsChange?.(null);
    };
  }, [
    audioRef,
    canPlayCompleted,
    isPlaying,
    isSeeking,
    onPlaybackControlsChange,
    playbackRate,
    playCompletedAudio,
    restartCompletedAudio,
    seekTo,
    setPlaybackRate,
    skipBy,
  ]);
}

function useCompletedAudioElementSource({
  audioRef,
  canPlayCompleted,
  src,
  volume,
}: {
  audioRef: WritableRef<HTMLAudioElement | null>;
  canPlayCompleted: boolean;
  src: string;
  volume: number;
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !canPlayCompleted) {
      return;
    }

    audio.volume = volume;
    audio.preload = "auto";
    if (audio.currentSrc === "" && src) {
      audio.src = src;
      audio.load();
    }
  }, [audioRef, canPlayCompleted, src, volume]);
}

function CompletedAudioPlayer({
  job,
  src,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  src: string;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  const canPlayCompleted = job.status === "completed" && src.length > 0;
  const durationMs = job.durationMs;

  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [durationSec, setDurationSec] = useState(0);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const waveformBars = useCompletedWaveformBars(src, canPlayCompleted);
  const isSeekingRef = useRef(false);
  const isSeekCommitInProgressRef = useRef(false);
  const currentTimeRef = useRef(0);
  const seekSliderValueRef = useRef(0);
  const resolvedDurationSec = Math.max(0, durationSec > 0 ? durationSec : durationMs / 1000);

  useCompletedAudioAvailabilityReset({
    audioRef,
    canPlayCompleted,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackStateChange,
    setCurrentTimeSec,
    setDurationSec,
    setError,
    setIsPlaying,
    setIsSeeking,
  });

  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  const { onAudioError, onEnded, onLoadedMetadata, onPause, onPlay, onTimeUpdate } =
    useCompletedAudioEventHandlers({
      audioRef,
      currentTimeRef,
      isSeekCommitInProgressRef,
      isSeekingRef,
      onPlaybackCursorChange,
      onPlaybackStateChange,
      setCurrentTimeSec,
      setDurationSec,
      setError,
      setIsPlaying,
    });

  useEffect(() => {
    if (!canPlayCompleted || !isPlaying) {
      return;
    }
    let isMounted = true;
    let stopClock: (() => void) | null = null;
    void import("./features/readalong/ReadAlongClock").then(({ startReadAlongPlaybackClock }) => {
      if (!isMounted) {
        return;
      }
      stopClock = startReadAlongPlaybackClock({
        audioElement: () => audioRef.current,
        onCursor: (cursorSec) => {
          currentTimeRef.current = cursorSec;
          setCurrentTimeSec(cursorSec);
          onPlaybackCursorChange?.(cursorSec);
        },
      });
    });
    return () => {
      isMounted = false;
      stopClock?.();
    };
  }, [canPlayCompleted, isPlaying, onPlaybackCursorChange]);

  const { handlePlayToggle, playCompletedAudio, restartCompletedAudio } = useCompletedAudioCommands(
    {
      audioRef,
      canPlayCompleted,
      currentTimeRef,
      isPlaying,
      onPlaybackCursorChange,
      onPlaybackStateChange,
      resolvedDurationSec,
      setCurrentTimeSec,
      setError,
      setIsPlaying,
    },
  );

  const {
    handleSeekBlur,
    handleSeekInput,
    handleSeekInputEvent,
    handleSeekKeyCommit,
    handleSeekPointerCommit,
    handleSeekStart,
    handleSeekTouchCommit,
    seekTo,
    skipBy,
  } = useCompletedSeekControls({
    audioRef,
    currentTimeRef,
    durationMs,
    durationSec,
    isSeekCommitInProgressRef,
    isSeekingRef,
    onPlaybackCursorChange,
    seekSliderValueRef,
    setCurrentTimeSec,
    setIsSeeking,
  });

  const handleVolume = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.currentTarget.value);
    const next = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    setVolume(next);
    if (audioRef.current) {
      audioRef.current.volume = next;
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const next = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
    setPlaybackRateState(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  }, []);

  useCompletedPlaybackControllerRegistration({
    audioRef,
    canPlayCompleted,
    isPlaying,
    isSeeking,
    onPlaybackControlsChange,
    playbackRate,
    playCompletedAudio,
    restartCompletedAudio,
    seekTo,
    setPlaybackRate,
    skipBy,
  });

  useCompletedAudioElementSource({ audioRef, canPlayCompleted, src, volume });
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);
  const durationForSliderSec = Math.max(1, resolvedDurationSec);
  const sliderValue = Math.max(0, Math.min(currentTimeSec, durationForSliderSec));

  if (!canPlayCompleted) {
    return <CompletedAudioPending error={error} job={job} />;
  }

  return (
    <CompletedAudioReadyView
      audioRef={audioRef}
      currentTimeSec={currentTimeSec}
      durationForSliderSec={durationForSliderSec}
      durationMs={durationMs}
      durationSec={durationSec}
      error={error}
      handlePlayToggle={handlePlayToggle}
      handleSeekBlur={handleSeekBlur}
      handleSeekInput={handleSeekInput}
      handleSeekInputEvent={handleSeekInputEvent}
      handleSeekKeyCommit={handleSeekKeyCommit}
      handleSeekPointerCommit={handleSeekPointerCommit}
      handleSeekStart={handleSeekStart}
      handleSeekTouchCommit={handleSeekTouchCommit}
      handleVolume={handleVolume}
      isPlaying={isPlaying}
      job={job}
      onAudioError={onAudioError}
      onEnded={onEnded}
      onLoadedMetadata={onLoadedMetadata}
      onPause={onPause}
      onPlay={onPlay}
      onTimeUpdate={onTimeUpdate}
      skipBy={skipBy}
      sliderValue={sliderValue}
      src={src}
      volume={volume}
      waveformBars={waveformBars}
    />
  );
}

function CompletedAudioPending({
  error,
  job,
}: Readonly<{
  error: string | null;
  job: VoiceJob;
}>) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-6 text-zinc-600">
        Final audio will appear after every generated segment passes voice checking.
        {job.durationMs > 0
          ? ` Current generated duration: ${formatDuration(job.durationMs)}.`
          : ""}
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

function CompletedAudioReadyView({
  audioRef,
  currentTimeSec,
  durationForSliderSec,
  durationMs,
  durationSec,
  error,
  handlePlayToggle,
  handleSeekBlur,
  handleSeekInput,
  handleSeekInputEvent,
  handleSeekKeyCommit,
  handleSeekPointerCommit,
  handleSeekStart,
  handleSeekTouchCommit,
  handleVolume,
  isPlaying,
  job,
  onAudioError,
  onEnded,
  onLoadedMetadata,
  onPause,
  onPlay,
  onTimeUpdate,
  skipBy,
  sliderValue,
  src,
  volume,
  waveformBars,
}: Readonly<{
  audioRef: WritableRef<HTMLAudioElement | null>;
  currentTimeSec: number;
  durationForSliderSec: number;
  durationMs: number;
  durationSec: number;
  error: string | null;
  handlePlayToggle: () => Promise<void> | void;
  handleSeekBlur: () => void;
  handleSeekInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleSeekInputEvent: (event: React.SyntheticEvent<HTMLInputElement>) => void;
  handleSeekKeyCommit: () => void;
  handleSeekPointerCommit: () => void;
  handleSeekStart: () => void;
  handleSeekTouchCommit: () => void;
  handleVolume: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isPlaying: boolean;
  job: VoiceJob;
  onAudioError: () => void;
  onEnded: () => void;
  onLoadedMetadata: () => void;
  onPause: () => void;
  onPlay: () => void;
  onTimeUpdate: () => void;
  skipBy: (seconds: number) => void;
  sliderValue: number;
  src: string;
  volume: number;
  waveformBars: number[];
}>) {
  return (
    <div className="grid gap-2.5">
      <div className="grid gap-2.5">
        <PlayerStatusLine
          currentTimeSec={currentTimeSec}
          durationSec={durationSec > 0 ? durationSec : durationMs / 1000}
          isLive={isPlaying}
          segment={formatSegment(job)}
        />
        <WaveformDisplay
          bars={waveformBars}
          progress={durationForSliderSec > 0 ? sliderValue / durationForSliderSec : 0}
        />
        <input
          className="h-1 w-full cursor-pointer accent-orange-500"
          max={String(durationForSliderSec)}
          min={0}
          onPointerDown={handleSeekStart}
          onPointerUp={handleSeekPointerCommit}
          onPointerCancel={handleSeekPointerCommit}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekTouchCommit}
          onBlur={handleSeekBlur}
          onInput={handleSeekInputEvent}
          onChange={handleSeekInput}
          onKeyDown={handleSeekStart}
          onKeyUp={handleSeekKeyCommit}
          step={0.05}
          type="range"
          value={String(sliderValue)}
        />
        <CompletedTransportControls
          isPlaying={isPlaying}
          onPlayToggle={handlePlayToggle}
          onSkip={skipBy}
        />
        <CompletedVolumeControl volume={volume} onVolumeChange={handleVolume} />
      </div>
      <audio
        ref={audioRef}
        className="sr-only"
        preload="auto"
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={onPlay}
        onPause={onPause}
        onEnded={onEnded}
        onError={onAudioError}
      >
        <track kind="captions" />
      </audio>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-3 gap-2 rounded-md border p-2 text-[0.7rem] vs-surface">
        <span className="truncate" title={formatDuration(durationMs)}>
          {formatDuration(durationMs)}
        </span>
        <span className="truncate">{formatSimilarity(job.voiceCheck.similarity)} match</span>
        <span
          className="truncate"
          title={job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"}
        >
          {job.voice ? kokoroVoicepackLabel(job.voice) : job.provider || "tts"}
        </span>
      </div>
    </div>
  );
}

function CompletedTransportControls({
  isPlaying,
  onPlayToggle,
  onSkip,
}: Readonly<{
  isPlaying: boolean;
  onPlayToggle: () => Promise<void> | void;
  onSkip: (seconds: number) => void;
}>) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <TransportButton
        label="Back 10 seconds"
        onClick={() => {
          onSkip(-10);
        }}
      >
        <SeekTenIcon direction="backward" />
      </TransportButton>
      <TransportButton
        label="Previous segment"
        onClick={() => {
          onSkip(-30);
        }}
      >
        <SkipSegmentIcon direction="backward" />
      </TransportButton>
      <button
        aria-label={isPlaying ? "Pause" : "Play"}
        className="grid h-11 w-11 place-items-center rounded-full text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-95 vs-accent-bg"
        onClick={() => {
          void onPlayToggle();
        }}
        type="button"
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <TransportButton
        label="Next segment"
        onClick={() => {
          onSkip(30);
        }}
      >
        <SkipSegmentIcon direction="forward" />
      </TransportButton>
      <TransportButton
        label="Forward 10 seconds"
        onClick={() => {
          onSkip(10);
        }}
      >
        <SeekTenIcon direction="forward" />
      </TransportButton>
    </div>
  );
}

function CompletedVolumeControl({
  volume,
  onVolumeChange,
}: Readonly<{
  volume: number;
  onVolumeChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}>) {
  return (
    <div className="vs-muted flex items-center gap-2.5 text-xs">
      <VolumeIcon />
      <input
        className="h-1 flex-1 cursor-pointer accent-orange-500"
        max={1}
        min={0}
        onChange={onVolumeChange}
        step={0.01}
        type="range"
        value={volume}
      />
      <span className="w-10 text-right">{Math.round(volume * 100).toString()}%</span>
      <SlidersIcon />
    </div>
  );
}

function ArrivalAudioPlayer({
  job,
  canPlay,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  return (
    <ArrivalAudioPlayerQueue
      job={job}
      canPlay={canPlay}
      onPlaybackControlsChange={onPlaybackControlsChange}
      onPlaybackStateChange={onPlaybackStateChange}
      onPlaybackCursorChange={onPlaybackCursorChange}
    />
  );
}

function ArrivalAudioPlayerQueue({
  job,
  canPlay,
  onPlaybackControlsChange,
  onPlaybackStateChange,
  onPlaybackCursorChange,
}: Readonly<{
  job: VoiceJob;
  canPlay: boolean;
  onPlaybackControlsChange?: (controls: PlaybackController | null) => void;
  onPlaybackStateChange?: (isPlaying: boolean) => void;
  onPlaybackCursorChange?: (cursorSec: number) => void;
}>) {
  const readySegments = job.audioReadySegments ?? 0;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [bufferedDurationSec, setBufferedDurationSec] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);

  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const segmentsRef = useRef<Map<number, AudioBuffer>>(new Map());
  const loadedThroughRef = useRef(0);
  const activeSourcesRef = useRef<Map<number, AudioBufferSourceNode>>(new Map());
  const isIntentRef = useRef(false);
  const playbackSessionCursorRef = useRef(0);
  const playbackSessionContextRef = useRef(0);
  const cursorSecRef = useRef(0);
  const rafRef = useRef(0);
  const playbackSequenceRef = useRef(0);
  const isScrubbingRef = useRef(false);
  const isSeekCommitInProgressRef = useRef(false);
  const seekSliderValueRef = useRef(0);

  const volumeRef = useRef(1);
  const playbackRateRef = useRef(1);

  const getContext = useCallback(() => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }

    const context = new AudioContext();
    const gainNode = context.createGain();
    gainNode.gain.value = volumeRef.current;
    gainNode.connect(context.destination);
    audioContextRef.current = context;
    gainNodeRef.current = gainNode;
    return context;
  }, []);

  const getSegmentTimeline = useCallback(() => {
    const timeline: { index: number; buffer: AudioBuffer; startSec: number }[] = [];
    let start = 0;
    for (let index = 1; segmentsRef.current.has(index); index += 1) {
      const buffer = segmentsRef.current.get(index);
      if (!buffer) {
        break;
      }
      timeline.push({ index, buffer, startSec: start });
      start += buffer.duration;
    }
    return timeline;
  }, []);

  const getBufferedDurationSec = useCallback(() => {
    return getSegmentTimeline().reduce((total, segment) => total + segment.buffer.duration, 0);
  }, [getSegmentTimeline]);

  const getTotalDurationSec = useCallback(() => {
    const bufferMs = getBufferedDurationSec() * 1000;
    return Math.max(job.durationMs, bufferedDurationSec * 1000, bufferMs) / 1000;
  }, [bufferedDurationSec, getBufferedDurationSec, job.durationMs]);

  const clampCursor = useCallback(
    (cursor: number) => {
      const target = getTotalDurationSec();
      return target > 0 ? Math.max(0, Math.min(cursor, target)) : Math.max(0, cursor);
    },
    [getTotalDurationSec],
  );

  const publishCursor = useCallback(
    (cursor: number) => {
      const safeCursor = clampCursor(cursor);
      cursorSecRef.current = safeCursor;
      setCurrentTimeSec(safeCursor);
      onPlaybackCursorChange?.(safeCursor);
      return safeCursor;
    },
    [clampCursor, onPlaybackCursorChange],
  );

  const getCurrentCursor = useCallback(() => {
    const context = audioContextRef.current;
    if (
      !isIntentRef.current ||
      !isPlaying ||
      !context ||
      playbackSessionContextRef.current <= 0 ||
      activeSourcesRef.current.size === 0
    ) {
      return cursorSecRef.current;
    }

    const played =
      playbackSessionCursorRef.current +
      (context.currentTime - playbackSessionContextRef.current) * playbackRateRef.current;
    const clamped = clampCursor(played);
    if (isScrubbingRef.current || isSeekCommitInProgressRef.current) {
      return cursorSecRef.current;
    }
    if (clamped >= cursorSecRef.current) {
      publishCursor(clamped);
    }
    return cursorSecRef.current;
  }, [clampCursor, isPlaying, publishCursor]);

  const getPlaybackCursorFromContext = useCallback(() => {
    const context = audioContextRef.current;
    if (!context || playbackSessionContextRef.current <= 0) {
      return cursorSecRef.current;
    }

    return clampCursor(
      playbackSessionCursorRef.current +
        (context.currentTime - playbackSessionContextRef.current) * playbackRateRef.current,
    );
  }, [clampCursor]);

  const clearSources = useCallback(() => {
    playbackSequenceRef.current += 1;
    for (const source of activeSourcesRef.current.values()) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
      try {
        source.disconnect();
      } catch {
        // ignore
      }
    }

    activeSourcesRef.current.clear();
  }, []);

  const stopPlayback = useCallback(
    (notify = true) => {
      isIntentRef.current = false;
      clearSources();
      playbackSessionCursorRef.current = 0;
      playbackSessionContextRef.current = 0;
      setIsPlaying(false);
      setIsSeeking(false);
      setIsQueued(false);
      if (notify) {
        onPlaybackStateChange?.(false);
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    },
    [clearSources, onPlaybackStateChange],
  );

  const completeIfDone = useCallback(
    (cursor: number) => {
      if (job.status !== "completed") {
        return;
      }

      const target = getTotalDurationSec();
      if (target <= 0 || cursor < target - 0.01) {
        return;
      }

      setIsQueued(false);
      publishCursor(target);
      stopPlayback();
    },
    [getTotalDurationSec, job.status, publishCursor, stopPlayback],
  );

  const scheduleFromCursor = useCallback(
    // eslint-disable-next-line sonarjs/cognitive-complexity
    (cursor: number, context: AudioContext) => {
      if (!isIntentRef.current) {
        return;
      }

      const timeline = getSegmentTimeline();
      if (timeline.length === 0) {
        setIsQueued(true);
        return;
      }

      const clippedCursor = clampCursor(cursor);
      const startContext = context.currentTime;
      const hasActiveSources = activeSourcesRef.current.size > 0;
      const activeIndexList = [...activeSourcesRef.current.keys()];
      const highestActiveIndex = activeIndexList.length === 0 ? 0 : Math.max(...activeIndexList);
      const playbackAnchorCursor = hasActiveSources
        ? getPlaybackCursorFromContext()
        : clippedCursor;
      const playbackSequence = hasActiveSources
        ? playbackSequenceRef.current
        : playbackSequenceRef.current + 1;
      if (!hasActiveSources) {
        playbackSequenceRef.current = playbackSequence;
      }

      let anyScheduled = false;
      for (const segment of timeline) {
        const segmentEnd = segment.startSec + segment.buffer.duration;
        const currentSegmentEndForScheduling = hasActiveSources
          ? playbackAnchorCursor
          : clippedCursor;
        if (segmentEnd <= currentSegmentEndForScheduling) {
          continue;
        }
        if (hasActiveSources && segment.index <= highestActiveIndex) {
          continue;
        }

        const source = context.createBufferSource();
        source.buffer = segment.buffer;
        const gainNode = gainNodeRef.current;
        if (!gainNode) {
          setError("Audio output is not initialized. Press play again.");
          return;
        }
        source.connect(gainNode);
        source.playbackRate.value = playbackRateRef.current;
        const segmentOffset = Math.max(0, playbackAnchorCursor - segment.startSec);
        const start =
          startContext +
          Math.max(0, segment.startSec - playbackAnchorCursor) /
            Math.max(0.1, playbackRateRef.current);

        source.addEventListener("ended", () => {
          if (playbackSequenceRef.current !== playbackSequence) {
            return;
          }

          activeSourcesRef.current.delete(segment.index);
          if (activeSourcesRef.current.size > 0) {
            return;
          }

          const nextCursor = getPlaybackCursorFromContext();
          if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
            publishCursor(nextCursor);
          }
          if (!isIntentRef.current) {
            return;
          }
          const buffered = getBufferedDurationSec();
          if (nextCursor < buffered - 0.01) {
            setIsQueued(false);
            scheduleFromCursor(nextCursor, context);
            return;
          }

          if (nextCursor >= buffered - 0.01) {
            setIsQueued(true);
          }
          completeIfDone(nextCursor);
        });

        source.start(start, segmentOffset);
        activeSourcesRef.current.set(segment.index, source);
        anyScheduled = true;
      }

      if (!hasActiveSources) {
        playbackSessionCursorRef.current = clippedCursor;
        playbackSessionContextRef.current = startContext;
        if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
          publishCursor(clippedCursor);
        }
      }
      if (hasActiveSources && !isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        publishCursor(playbackAnchorCursor);
      }
      setIsQueued(!anyScheduled);
      if (anyScheduled) {
        setError(null);
      }
    },
    [
      clampCursor,
      getBufferedDurationSec,
      getPlaybackCursorFromContext,
      getSegmentTimeline,
      completeIfDone,
      publishCursor,
    ],
  );

  const beginPlayback = useCallback(async () => {
    const context = getContext();
    try {
      await context.resume();
    } catch {
      setError("Browser blocked playback. Press play again.");
      return;
    }

    isIntentRef.current = true;
    const totalDuration = getTotalDurationSec();
    if (totalDuration > 0 && cursorSecRef.current >= totalDuration - 0.01) {
      publishCursor(0);
    }
    setIsPlaying(true);
    setError(null);
    onPlaybackStateChange?.(true);
    publishCursor(cursorSecRef.current);
    scheduleFromCursor(publishCursor(cursorSecRef.current), context);
  }, [getContext, getTotalDurationSec, onPlaybackStateChange, publishCursor, scheduleFromCursor]);

  const pausePlayback = useCallback(() => {
    publishCursor(getCurrentCursor());
    stopPlayback(false);
    onPlaybackStateChange?.(false);
  }, [getCurrentCursor, onPlaybackStateChange, publishCursor, stopPlayback]);

  const handlePlayToggle = useCallback(async () => {
    if (isPlaying) {
      pausePlayback();
      return;
    }

    await beginPlayback();
  }, [beginPlayback, isPlaying, pausePlayback]);

  const commitSeek = useCallback(
    async (target: number) => {
      const seekCursor = publishCursor(target);
      if (!isIntentRef.current || !isPlaying) {
        return;
      }

      clearSources();
      const context = getContext();
      try {
        await context.resume();
        scheduleFromCursor(seekCursor, context);
      } catch {
        // continue
      }
    },
    [clearSources, getContext, isPlaying, publishCursor, scheduleFromCursor],
  );

  const handleSeekStart = useCallback(() => {
    isScrubbingRef.current = true;
    setIsSeeking(true);
    seekSliderValueRef.current = cursorSecRef.current;
  }, []);

  const resolveSeekTarget = useCallback(
    (value?: number) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return clampCursor(value);
      }
      return clampCursor(seekSliderValueRef.current);
    },
    [clampCursor],
  );

  const handleSeekUpdate = useCallback(
    (rawValue: number) => {
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        isScrubbingRef.current = true;
        setIsSeeking(true);
        seekSliderValueRef.current = cursorSecRef.current;
      }

      if (!isScrubbingRef.current) {
        return;
      }

      const target = clampCursor(Number.isFinite(rawValue) ? rawValue : cursorSecRef.current);
      seekSliderValueRef.current = target;
      publishCursor(target);
    },
    [clampCursor, publishCursor],
  );

  const handleSeekCommit = useCallback(
    (value?: number) => {
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        isScrubbingRef.current = true;
        setIsSeeking(true);
        seekSliderValueRef.current = cursorSecRef.current;
      }

      if (!isScrubbingRef.current) {
        return;
      }

      if (isSeekCommitInProgressRef.current) {
        return;
      }
      isSeekCommitInProgressRef.current = true;
      const seekTo = resolveSeekTarget(value);
      seekSliderValueRef.current = seekTo;
      publishCursor(seekTo);
      void commitSeek(seekTo);
      requestAnimationFrame(() => {
        isScrubbingRef.current = false;
        isSeekCommitInProgressRef.current = false;
        setIsSeeking(false);
      });
    },
    [commitSeek, publishCursor, resolveSeekTarget],
  );

  const handleSeekInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekInputEvent = useCallback(
    (event: React.SyntheticEvent<HTMLInputElement>) => {
      handleSeekUpdate(Number(event.currentTarget.value));
    },
    [handleSeekUpdate],
  );

  const handleSeekBlur = useCallback(() => {
    if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
      return;
    }
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekPointerCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekKeyCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleSeekTouchCommit = useCallback(() => {
    handleSeekCommit();
  }, [handleSeekCommit]);

  const handleVolume = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = Number(event.currentTarget.value);
    const next = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1;
    setVolume(next);
    volumeRef.current = next;
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.setValueAtTime(next, audioContextRef.current.currentTime);
    }
  }, []);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const next = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;
      const context = audioContextRef.current;
      if (context && isPlaying && isIntentRef.current) {
        const cursor = getCurrentCursor();
        clearSources();
        playbackRateRef.current = next;
        setPlaybackRateState(next);
        playbackSessionCursorRef.current = cursor;
        playbackSessionContextRef.current = 0;
        scheduleFromCursor(cursor, context);
        return;
      }
      playbackRateRef.current = next;
      setPlaybackRateState(next);
      for (const source of activeSourcesRef.current.values()) {
        if (context) {
          source.playbackRate.setValueAtTime(next, context.currentTime);
        } else {
          source.playbackRate.value = next;
        }
      }
    },
    [clearSources, getCurrentCursor, isPlaying, scheduleFromCursor],
  );

  const seekTo = useCallback(
    (seconds: number) => {
      const next = clampCursor(seconds);
      setIsSeeking(true);
      publishCursor(next);
      void commitSeek(next);
      requestAnimationFrame(() => {
        setIsSeeking(false);
      });
    },
    [clampCursor, commitSeek, publishCursor],
  );

  const skipBy = useCallback(
    (seconds: number) => {
      seekTo(cursorSecRef.current + seconds);
    },
    [seekTo],
  );

  const restartArrivalPlayback = useCallback(async () => {
    clearSources();
    isIntentRef.current = false;
    playbackSessionCursorRef.current = 0;
    playbackSessionContextRef.current = 0;
    publishCursor(0);
    await beginPlayback();
  }, [beginPlayback, clearSources, publishCursor]);

  useEffect(() => {
    if (!canPlay) {
      onPlaybackControlsChange?.(null);
      return;
    }
    onPlaybackControlsChange?.({
      isAvailable: true,
      isPlaying,
      isSeeking,
      playbackRate,
      pause: pausePlayback,
      play: beginPlayback,
      restart: restartArrivalPlayback,
      seekTo,
      setPlaybackRate,
      skipBy,
    });
    return () => {
      onPlaybackControlsChange?.(null);
    };
  }, [
    beginPlayback,
    canPlay,
    isSeeking,
    isPlaying,
    onPlaybackControlsChange,
    pausePlayback,
    playbackRate,
    restartArrivalPlayback,
    seekTo,
    setPlaybackRate,
    skipBy,
  ]);

  const refreshBufferedDuration = useCallback(() => {
    const timeline = getSegmentTimeline();
    const duration = timeline.reduce((total, segment) => total + segment.buffer.duration, 0);
    setBufferedDurationSec(duration);
    const buffers = timeline.map((segment) => segment.buffer);
    if (buffers.length === 0) {
      setWaveformBars([]);
      return;
    }
    void buildWaveformBarsFromAudioBuffersLazy(buffers, WAVEFORM_DISPLAY_BAR_COUNT)
      .then(setWaveformBars)
      .catch(() => {
        setWaveformBars([]);
      });
  }, [getSegmentTimeline]);

  const arrivalThroughput = useMemo(() => {
    const durations = job.audioSegmentDurationsMs ?? [];
    const latencies = job.audioSegmentLatenciesMs ?? [];
    const readyCount = Math.max(0, Math.min(readySegments, durations.length, latencies.length));
    if (readyCount <= 0) {
      return null;
    }

    const windowSize = Math.min(6, readyCount);
    const startIndex = Math.max(0, readyCount - windowSize);
    let totalDurationMS = 0;
    let totalLatencyMS = 0;
    let sampleCount = 0;

    for (let index = startIndex; index < readyCount; index += 1) {
      const durationMS = durations[index];
      const latencyMS = latencies[index];
      if (!Number.isFinite(durationMS) || !Number.isFinite(latencyMS)) {
        continue;
      }
      if (durationMS <= 0 || latencyMS <= 0) {
        continue;
      }
      totalDurationMS += durationMS;
      totalLatencyMS += latencyMS;
      sampleCount += 1;
    }

    if (sampleCount === 0 || totalLatencyMS <= 0) {
      return null;
    }

    const productionRatio = totalDurationMS / totalLatencyMS;
    const bufferLeadSec = Math.max(0, getBufferedDurationSec() - currentTimeSec);
    const isBufferGrowing = productionRatio >= 1;
    const remainingBufferedLeadSec = isBufferGrowing
      ? Number.POSITIVE_INFINITY
      : bufferLeadSec / Math.max(1e-4, 1 - productionRatio);
    let riskLabel = "stable";
    if (!isBufferGrowing && productionRatio < 0.9) {
      riskLabel = remainingBufferedLeadSec < 2 ? "high" : "medium";
    } else if (!isBufferGrowing && productionRatio < 0.98) {
      riskLabel = "low";
    }

    return {
      productionRatio,
      bufferLeadSec,
      remainingBufferedLeadSec,
      riskLabel,
    };
  }, [
    job.audioSegmentDurationsMs,
    job.audioSegmentLatenciesMs,
    readySegments,
    currentTimeSec,
    getBufferedDurationSec,
  ]);

  const queueRiskValue = useMemo(() => {
    if (!arrivalThroughput) {
      return "waiting";
    }

    const estimatedLead = arrivalThroughput.remainingBufferedLeadSec;
    const riskDuration = Number.isFinite(estimatedLead)
      ? formatDuration(Math.max(0, Math.round(estimatedLead * 1000)))
      : "growing";

    return `${arrivalThroughput.riskLabel} (${riskDuration})`;
  }, [arrivalThroughput]);

  useEffect(() => {
    if (Math.max(0, readySegments) <= 0) {
      return;
    }
    if (!isPlaying && !isIntentRef.current) {
      return;
    }

    let cancelled = false;
    const target = Math.max(0, readySegments);
    const context = getContext();
    const load = async () => {
      if (loadedThroughRef.current >= target) {
        return;
      }

      interface SegmentLoadResult {
        index: number;
        audioBuffer?: AudioBuffer;
        skipped?: boolean;
        error?: string;
      }

      const missingSegmentIndexes: number[] = [];
      for (let index = loadedThroughRef.current + 1; index <= target; index += 1) {
        if (segmentsRef.current.has(index)) {
          continue;
        }
        missingSegmentIndexes.push(index);
      }

      if (missingSegmentIndexes.length === 0) {
        loadedThroughRef.current = target;
        refreshBufferedDuration();
        return;
      }

      const loadRequests: Promise<SegmentLoadResult>[] = missingSegmentIndexes.map(
        async (segmentIndex) => {
          const response = await fetch(
            `${apiBaseUrl}/api/voice-jobs/${job.id}/audio/segment/${String(segmentIndex)}`,
          );
          if (!response.ok) {
            if (response.status === 409) {
              return { index: segmentIndex, skipped: true };
            }

            const message = await response.text();
            return { index: segmentIndex, error: message || "Failed to load segment audio." };
          }

          try {
            const raw = await response.arrayBuffer();
            const audioBuffer = await context.decodeAudioData(raw);
            return { index: segmentIndex, audioBuffer };
          } catch {
            return { index: segmentIndex, error: "Failed to decode segment audio." };
          }
        },
      );

      const results = await Promise.all(loadRequests);
      if (cancelled) {
        return;
      }

      for (const result of results) {
        if (result.error) {
          setError(result.error);
          return;
        }
        if (result.skipped) {
          return;
        }
        if (result.audioBuffer) {
          segmentsRef.current.set(result.index, result.audioBuffer);
        }
      }

      let nextThrough = loadedThroughRef.current + 1;
      while (segmentsRef.current.has(nextThrough)) {
        loadedThroughRef.current = nextThrough;
        nextThrough += 1;
      }

      refreshBufferedDuration();
      if (isIntentRef.current) {
        scheduleFromCursor(clampCursor(getCurrentCursor()), context);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [
    readySegments,
    getContext,
    getCurrentCursor,
    isPlaying,
    job.id,
    refreshBufferedDuration,
    scheduleFromCursor,
    clampCursor,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const tick = () => {
      if (!isIntentRef.current) {
        return;
      }

      const cursor = getCurrentCursor();
      if (!isScrubbingRef.current && !isSeekCommitInProgressRef.current) {
        publishCursor(cursor);
      }
      const buffered = getBufferedDurationSec();
      const target = getTotalDurationSec();
      if (
        activeSourcesRef.current.size === 0 &&
        cursor >= buffered - 0.01 &&
        cursor < target - 0.01
      ) {
        setIsQueued(true);
      }
      completeIfDone(cursor);
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [
    completeIfDone,
    getBufferedDurationSec,
    getCurrentCursor,
    getTotalDurationSec,
    isPlaying,
    publishCursor,
  ]);

  useEffect(() => {
    return () => {
      clearSources();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (audioContextRef.current) {
        void audioContextRef.current.close();
      }
      audioContextRef.current = null;
      gainNodeRef.current = null;
      segmentsRef.current.clear();
      loadedThroughRef.current = 0;
      activeSourcesRef.current.clear();
    };
  }, [clearSources]);

  useEffect(() => {
    clearSources();
    isIntentRef.current = false;
    isScrubbingRef.current = false;
    isSeekCommitInProgressRef.current = false;
    setIsPlaying(false);
    setIsSeeking(false);
    setIsQueued(false);
    cursorSecRef.current = 0;
    setCurrentTimeSec(0);
    playbackSessionCursorRef.current = 0;
    playbackSessionContextRef.current = 0;
    segmentsRef.current.clear();
    loadedThroughRef.current = 0;
    setBufferedDurationSec(0);
    setWaveformBars([]);
    setError(null);
    stopPlayback(false);
  }, [clearSources, stopPlayback]);

  useEffect(() => {
    onPlaybackStateChange?.(isPlaying);
  }, [isPlaying, onPlaybackStateChange]);

  const totalDurationSec = getTotalDurationSec();
  const sliderMax =
    totalDurationSec > 0 ? totalDurationSec : Math.max(1, currentTimeSec, cursorSecRef.current);
  const sliderValue = Math.max(0, Math.min(currentTimeSec, sliderMax));
  const showArrivalPendingMessage = !canPlay;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2.5">
        <PlayerStatusLine
          currentTimeSec={sliderValue}
          durationSec={Math.max(totalDurationSec, 0)}
          isLive={isPlaying}
          segment={formatSegment(job)}
        />
        <WaveformDisplay
          bars={waveformBars}
          progress={sliderMax > 0 ? sliderValue / sliderMax : 0}
        />
        <input
          className="h-1 w-full cursor-pointer accent-orange-500"
          max={String(sliderMax)}
          min={0}
          onPointerDown={handleSeekStart}
          onPointerUp={handleSeekPointerCommit}
          onPointerCancel={handleSeekPointerCommit}
          onInput={handleSeekInputEvent}
          onTouchStart={handleSeekStart}
          onTouchEnd={handleSeekTouchCommit}
          onBlur={handleSeekBlur}
          onChange={handleSeekInput}
          onKeyDown={handleSeekStart}
          onKeyUp={handleSeekKeyCommit}
          step={0.05}
          type="range"
          value={String(sliderValue)}
        />
        <div className="flex items-center justify-center gap-1.5">
          <TransportButton
            label="Back 10 seconds"
            onClick={() => {
              skipBy(-10);
            }}
          >
            <SeekTenIcon direction="backward" />
          </TransportButton>
          <TransportButton
            label="Previous segment"
            onClick={() => {
              skipBy(-30);
            }}
          >
            <SkipSegmentIcon direction="backward" />
          </TransportButton>
          <button
            aria-label={isPlaying ? "Pause" : "Play"}
            className="grid h-11 w-11 place-items-center rounded-full text-lg font-semibold text-white shadow-lg shadow-orange-500/25 transition hover:brightness-95 vs-accent-bg"
            onClick={() => {
              void handlePlayToggle();
            }}
            type="button"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <TransportButton
            label="Next segment"
            onClick={() => {
              skipBy(30);
            }}
          >
            <SkipSegmentIcon direction="forward" />
          </TransportButton>
          <TransportButton
            label="Forward 10 seconds"
            onClick={() => {
              skipBy(10);
            }}
          >
            <SeekTenIcon direction="forward" />
          </TransportButton>
        </div>
        <div className="vs-muted flex items-center gap-2.5 text-xs">
          <VolumeIcon />
          <input
            className="h-1 flex-1 cursor-pointer accent-orange-500"
            max={1}
            min={0}
            onChange={handleVolume}
            step={0.01}
            type="range"
            value={volume}
          />
          <span className="w-10 text-right">{Math.round(volume * 100).toString()}%</span>
          <SlidersIcon />
        </div>
      </div>
      {showArrivalPendingMessage ? (
        <p className="vs-muted text-xs leading-5">
          Arrival playback will begin when the first segment arrives.
        </p>
      ) : null}
      {isQueued ? (
        <p className="text-xs text-zinc-600">
          Playback queued. It will continue as segments arrive.
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="grid grid-cols-3 gap-3 rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
        <span>
          {formatDuration(Math.max(job.durationMs, Math.round(bufferedDurationSec * 1000)))} buffer
        </span>
        <span>
          {arrivalThroughput
            ? `${formatPace(arrivalThroughput.productionRatio)} pace`
            : "pace waiting"}
        </span>
        <span>{queueRiskValue} risk</span>
      </div>
    </div>
  );
}

function ProgressPanel({ job, now }: Readonly<{ job: VoiceJob; now: number }>) {
  return (
    <section className="grid gap-3 border-b border-zinc-200 pb-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-500">
          Progress
        </h2>
        {job.status === "completed" || job.status === "failed" ? null : (
          <span className="inline-flex h-2.5 w-2.5 animate-pulse bg-amber-500" />
        )}
      </div>
      <div className="grid gap-1 text-sm">
        <p className="font-medium text-zinc-900">{job.progress.message}</p>
        <p className="leading-6 text-zinc-600">{job.progress.detail}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <Metric label="Elapsed" value={formatElapsed(job.progress.startedAt, now)} />
        <Metric label="Current segment" value={formatSegment(job)} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="border-t pt-3 vs-border">
      <dt className="text-xs uppercase tracking-[0.14em] vs-muted">{label}</dt>
      <dd className="mt-1 break-words font-medium text-[var(--vs-text)]">{value}</dd>
    </div>
  );
}

function parseBookCinemaHash(hash: string): ReadingPosition | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (params.get("cinema") !== "book") {
    return null;
  }
  const bookSourceId = params.get("book")?.trim();
  if (!bookSourceId) {
    return null;
  }
  const parsedWord = Number(params.get("word") ?? "0");
  return {
    activeWordIndex: Number.isFinite(parsedWord) ? Math.max(0, Math.round(parsedWord)) : 0,
    bookSourceId,
    nodeId: params.get("node") ?? undefined,
    scopeKey: params.get("scope") ?? undefined,
  };
}

function replaceBookCinemaHash(position: ReadingPosition): void {
  if (!position.bookSourceId || !position.scopeKey) {
    return;
  }
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", position.bookSourceId);
  params.set("scope", position.scopeKey);
  params.set("word", String(Math.max(0, position.activeWordIndex ?? 0)));
  if (position.nodeId) {
    params.set("node", position.nodeId);
  }
  const nextHash = `#${params.toString()}`;
  if (globalThis.location.hash !== nextHash) {
    globalThis.history.replaceState(null, "", nextHash);
  }
}

function scopeFromBookScopeKey(book: BookSource, key: string | undefined): BookScope {
  if (!key) {
    return resolveDefaultBookScope(book);
  }
  if (key === "book") {
    return { type: "book", label: "Full book" };
  }
  const chapter = /^chapter:(\d+)$/.exec(key);
  if (chapter) {
    const chapterIndex = Number(chapter[1]);
    const sourceChapter = book.chapters?.find((item) => item.index === chapterIndex);
    const sourceSection = book.sections?.find(
      (item) =>
        item.chapterIndex === chapterIndex ||
        (item.kind !== "pages" && item.index + 1 === chapterIndex),
    );
    return {
      type: "chapter",
      chapterIndex,
      label: sourceChapter?.title ?? sourceSection?.title ?? `Chapter ${String(chapterIndex)}`,
    };
  }
  const pages = /^pages:(\d+)-(\d+)$/.exec(key);
  if (pages) {
    const pageStart = Number(pages[1]);
    const pageEnd = Number(pages[2]);
    const sourceSection = book.sections?.find(
      (item) =>
        (item.kind === "pages" || item.pageStart !== undefined) &&
        item.pageStart === pageStart &&
        (item.pageEnd ?? item.pageStart) === pageEnd,
    );
    return {
      type: "pages",
      pageStart,
      pageEnd,
      label:
        sourceSection?.title ??
        (pageStart === pageEnd
          ? `Page ${String(pageStart)}`
          : `Pages ${String(pageStart)}-${String(pageEnd)}`),
    };
  }
  return resolveDefaultBookScope(book);
}

function playbackProgressFromReadingPosition(
  position: ReadingPosition | null,
  bookSourceId: string,
  scopeKey: string,
  projectId: string,
): PlaybackProgress | null {
  if (
    position?.bookSourceId !== bookSourceId ||
    position.scopeKey !== scopeKey ||
    position.activeWordIndex === undefined
  ) {
    return null;
  }
  const timestamp = new Date(0).toISOString();
  return {
    activeWordIndex: position.activeWordIndex,
    bookScope: bookScopeFromScopeKey(scopeKey),
    bookSourceId,
    createdAt: timestamp,
    currentTimeSec: 0,
    finished: false,
    hidden: false,
    progress: 0,
    projectId,
    readingPosition: position,
    targetId: `hash:${bookSourceId}:${scopeKey}`,
    updatedAt: timestamp,
  };
}

function bookScopeFromScopeKey(scopeKey: string): BookScope | undefined {
  if (scopeKey === "book") {
    return { type: "book", label: "Full book" };
  }
  const chapter = /^chapter:(\d+)$/.exec(scopeKey);
  if (chapter) {
    const chapterIndex = Number(chapter[1]);
    return {
      type: "chapter",
      chapterIndex,
      label: `Chapter ${String(chapterIndex)}`,
    };
  }
  const pages = /^pages:(\d+)-(\d+)$/.exec(scopeKey);
  if (pages) {
    const pageStart = Number(pages[1]);
    const pageEnd = Number(pages[2]);
    return {
      type: "pages",
      pageStart,
      pageEnd,
      label:
        pageStart === pageEnd
          ? `Page ${String(pageStart)}`
          : `Pages ${String(pageStart)}-${String(pageEnd)}`,
    };
  }
  return undefined;
}

function progressTargetIdForJob(job: VoiceJob): string {
  if (job.progressTargetId) {
    return job.progressTargetId;
  }
  if (job.bookSourceId && job.bookScope) {
    return progressTargetIdForBookScope(job.bookSourceId, job.bookScope);
  }
  if (job.preparedSourceId) {
    return `prepared:${job.preparedSourceId}`;
  }
  return job.id ? `job:${job.id}` : "";
}

function progressTargetIdForBookScope(bookSourceId: string, scope: BookScope): string {
  return `book:${bookSourceId}:${bookScopeKey(scope)}`;
}

function activeWordIndexForProgress(job: VoiceJob, cursorSec: number): number {
  const durationSec = job.durationMs > 0 ? job.durationMs / 1000 : 0;
  const wordCount = job.optimizedText.trim().split(/\s+/).filter(Boolean).length;
  if (durationSec <= 0 || wordCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(wordCount - 1, Math.floor((cursorSec / durationSec) * wordCount)));
}

function formatSimilarity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "waiting";
  }

  return `${Math.round(value * 100).toString()}%`;
}

function formatLikenessLabel(profile: VoiceProfile): string {
  if (!profile.likeness) {
    return "likeness pending";
  }
  return `${formatLikenessBadge(profile.likeness)} likeness`;
}

function formatLikenessBadge(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "pending";
  }
  if (likeness.status === "failed") {
    return "needs QA";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "strong";
  }
  if (score >= 0.68) {
    return "good";
  }
  return "weak";
}

function likenessBadgeClass(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "bg-zinc-100 text-zinc-600";
  }
  if (likeness.status === "failed") {
    return "bg-amber-100 text-amber-800";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "bg-emerald-100 text-emerald-700";
  }
  if (score >= 0.68) {
    return "bg-blue-100 text-blue-700";
  }
  return "bg-red-100 text-red-700";
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${String(Math.round(value))} B`;
}

function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const ratio = Math.max(0, Math.min(1, value));
  return `${Math.round(ratio * 100).toString()}%`;
}

function formatPercentageRatio(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }
  return formatPercentage(value / total);
}

function formatPace(value: number | null | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return "n/a";
  }
  if (value >= 100) {
    return "99x+";
  }
  if (value >= 10) {
    return `${Math.round(value).toString()}x`;
  }
  return `${value.toFixed(2)}x`;
}

function estimateFirstAudioETA(job: VoiceJob | null): string {
  if (!job) {
    return "n/a";
  }
  if ((job.audioReadySegments ?? 0) > 0) {
    return "Ready";
  }
  const latencies = (job.audioSegmentLatenciesMs ?? []).filter((value) => value > 0);
  if (latencies.length === 0) {
    return job.status === "synthesizing" || job.status === "checking" ? "Calculating" : "n/a";
  }
  return formatDuration(Math.round(latencies[0]));
}

function formatSegment(job: VoiceJob): string {
  const current =
    job.retries.currentSegment > 0
      ? job.retries.currentSegment
      : (job.progress.currentSegment ?? 0);
  const total =
    job.retries.totalSegments > 0 ? job.retries.totalSegments : (job.progress.totalSegments ?? 0);
  if (current > 0 && total > 0) {
    return `${String(current)}/${String(total)}`;
  }

  return "waiting";
}

function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) {
    return "waiting";
  }

  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return "waiting";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes > 0) {
    return `${String(minutes)}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${String(seconds)}s`;
}

function formatRelativeTime(timestamp: string | undefined, now: number): string {
  if (!timestamp) {
    return "No updates yet";
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return "No updates yet";
  }
  const elapsedSeconds = Math.max(0, Math.floor((now - parsed) / 1000));
  if (elapsedSeconds < 5) {
    return "just now";
  }
  if (elapsedSeconds < 60) {
    return `${String(elapsedSeconds)}s ago`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${String(elapsedMinutes)}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${String(elapsedHours)}h ago`;
}

function shortIdentifier(value: string): string {
  const clean = value.trim();
  if (clean.length <= 12) {
    return clean || "pending";
  }
  return clean.slice(0, 12);
}
