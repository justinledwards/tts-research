import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { backendAssetUrl } from "../../api";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { Button, Panel, StatusChip, Toggle, fieldControlClassName } from "../../design";
import { Drawer } from "../../design/components/Drawer";
import { overlayDataAttributes } from "../layout";
import { useReaderModalLifecycle, type ReaderAccessibilitySettings } from "../reader-accessibility";
import {
  KOKORO_RENDER_MODE_OPTIONS,
  RUN_MODE_PRESETS,
  applyKokoroRenderMode,
  createRunConfiguration,
  describePerformanceMode,
  getRunModePreset,
  isKokoroRenderEngine,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  type RunConfiguration,
} from "../../runConfig";
import { RunConfigurationWizard } from "../run-config/RunConfigurationWizard";
import { applyRunEngineSelection } from "../run-config/runConfigSteps";
import { SpeechPolicyWizard } from "../speech-policy/SpeechPolicyWizard";
import { ShortcutSettings, type ShortcutPreferences } from "./shortcutSettings";
import { useLiveStatus } from "../accessibility";
import {
  SpeechPolicyControls,
  SourcePolicyPinEditor,
  resolveSpeechPolicyProfileOptions,
} from "../policy";
import {
  CapabilityBadge,
  PROVIDER_CAPABILITY_KEYS,
  capabilityLabel,
  capabilityRecommendedFallback,
  missingProviderCapabilities,
  resolveProviderRuntimeCapabilities,
  type ProviderCapabilityKey,
} from "../provider-capabilities";
import {
  PrivacyBoundaryPanel,
  providerRuntimePrivacyBoundary,
  temporarySourcePrivacyBoundary,
} from "../privacy";
import { TEMPORARY_SOURCE_COPY } from "../temporary-source-copy";
import type { UiMemoryPreferenceId, UiMemoryState } from "../preferences";
import {
  UiMemoryPreferences,
  type UiMemoryImportApplyResult,
  type UiMemoryResetScope,
} from "../ui-memory";
import {
  buildTeleprompterWordCues,
  type TeleprompterEffectStyle,
  type TeleprompterHighlightSettings,
} from "../../teleprompter";
import { TelepromptTheatreSettingsControls } from "../teleprompt/TelepromptTheatreSettingsControls";
import type { TelepromptTheatreSettings } from "../teleprompt/telepromptTheatreSettings";
import type { ReadAlongPreferences } from "../readalong";
import {
  bookSourceLifecycleEnvelope,
  preparedSourceLifecycleEnvelope,
} from "../source-lifecycle/sourceSelectors";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import { VOICE_STUDIO_THEMES } from "../../theme";
import type {
  AdapterDiagnostics,
  BookSource,
  CustomSpeechPolicyProfile,
  ExtractorChainStep,
  PerformanceMode,
  PipelineOptions,
  PreparedSource,
  ProjectStorageSummary,
  ResearchModuleDiagnostics,
  SourceSpeechPolicyUpdateRequest,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  SpeechPolicySettings,
  SystemMetrics,
  TemporaryStorageUsageSummary,
  ThemeName,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
  VoiceProfileSource,
  VoiceProfileSourceDiagnostics,
} from "../../types";
import {
  SETTINGS_FIELD_META,
  SETTINGS_LAYERS,
  SETTINGS_PRECEDENCE,
  SETTINGS_SCOPE_META,
  DEFAULT_TEMPORARY_SOURCE_BEHAVIOR,
  buildSettingsAuditRows,
  settingsGroupMeta,
  settingsGroupsForLayer,
  settingsLayerForCommandTarget,
  settingsLayerMeta,
  settingsScopeAppliesTo,
  type PresetChangeSet,
  type SettingsAuditRow,
  type SettingsChangeSetItem,
  type SettingsCommandTarget,
  type SettingsGroupId,
  type SettingsLayerId,
  type SettingsScope,
  type TemporaryDestination,
  type TemporaryExpiryDuration,
  type TemporaryReturnContextMemory,
  type TemporarySourceBehaviorSettings,
  type TemporaryWebExtractionMode,
} from "./model";
import { ScopeBadge } from "./ScopeBadge";
import { ReadAlongSettingsControls } from "./ReadAlongSettingsControls";
import {
  DiagnosticLine,
  PanelSection,
  engineFamilyOptions,
  findSettingsCommandTargetElement,
  formatBytes,
  formatProviderLanguageSummary,
  nextActiveGroupForLayer,
  quickSourceLabel,
  settingsCommandTargetToken,
  settingsGroupsForActiveLayer,
} from "./settingsPanelHelpers";
import {
  ERGONOMIC_PRESETS,
  applyErgonomicPresetDefaults,
  buildErgonomicPresetChangeSet,
  ergonomicPresetById,
  type ErgonomicPreset,
  type ErgonomicPresetId,
} from "./ergonomicPresets";
import { DEFAULT_SPEECH_POLICY_PROFILE } from "../../speechPolicy";
import {
  buildHealthReport,
  type DiagnosticSummary,
  type HealthReport,
  type HealthReportCard,
} from "../health-report";

const COMMON_PIPELINE_OPTIONS: (keyof PipelineOptions)[] = [
  "textPreprocess",
  "voiceClone",
  "arrivalPlayback",
];

const PERFORMANCE_MODE_OPTIONS: readonly PerformanceMode[] = ["balanced", "throughput", "quality"];

const PIPELINE_OPTION_LABELS: Record<keyof PipelineOptions, { label: string; detail: string }> = {
  arrivalPlayback: {
    detail: "Play completed segments as they arrive.",
    label: "Arrival playback",
  },
  asrCheck: {
    detail: "Validate generated speech against expected text.",
    label: "ASR check",
  },
  autoRetry: {
    detail: "Retry segments when validation rejects output.",
    label: "Auto retry",
  },
  qualityReport: {
    detail: "Summarize confidence, latency, retries, and output shape.",
    label: "Quality report",
  },
  textPreprocess: {
    detail: "Clean and structure source text before synthesis.",
    label: "Text preprocess",
  },
  voiceClone: {
    detail: "Use the selected voice profile reference.",
    label: "Voice clone",
  },
};

interface SourcePolicyTarget {
  clear: () => Promise<void>;
  isSaving: boolean;
  label: string;
  lifecycle: SourceLifecycleEnvelope;
  overrides?: SpeechPolicyOverrides | null;
  profile?: string | null;
  save: (request: SourceSpeechPolicyUpdateRequest) => Promise<void>;
}

type SettingsSourceMode = "book" | "fileUrl" | "text";

const TEMPORARY_EXPIRY_OPTIONS: readonly {
  detail: string;
  label: string;
  value: TemporaryExpiryDuration;
}[] = [
  {
    detail: "Deleted when discarded or when the browser session ends.",
    label: "End of temporary session",
    value: "endOfSession",
  },
  {
    detail: "Default runtime expiry for recent temporary work.",
    label: "24 hours",
    value: "24h",
  },
  {
    detail: "Keep recent temporary work available for a longer review pass.",
    label: "7 days",
    value: "7d",
  },
];

const TEMPORARY_DESTINATION_OPTIONS: readonly {
  label: string;
  value: TemporaryDestination;
}[] = [
  { label: "Review", value: "review" },
  { label: "Preview", value: "preview" },
  { label: "Cinema", value: "cinema" },
];

const TEMPORARY_WEB_EXTRACTION_OPTIONS: readonly {
  detail: string;
  label: string;
  value: TemporaryWebExtractionMode;
}[] = [
  {
    detail: "Prefer article text and remove navigation chrome.",
    label: "Article",
    value: "article",
  },
  {
    detail: "Use readable main content and keep useful headings.",
    label: "Readable page",
    value: "readable",
  },
  {
    detail: "Keep more page text for manual review before generation.",
    label: "Full page review",
    value: "fullPage",
  },
];

const TEMPORARY_RETURN_CONTEXT_OPTIONS: readonly {
  detail: string;
  label: string;
  value: TemporaryReturnContextMemory;
}[] = [
  {
    detail: "Return to the last temporary Review, Preview, or Cinema surface.",
    label: "Remember return surface",
    value: "rememberSurface",
  },
  {
    detail: "Ask before reopening a temporary surface with prior context.",
    label: "Ask each time",
    value: "askEachTime",
  },
  {
    detail: "Forget temporary return context when the surface closes.",
    label: "Forget on close",
    value: "forgetOnClose",
  },
];

export function SettingsPanel({
  adapterDiagnostics,
  adapterDiagnosticsError,
  canSubmit,
  commandTarget,
  customSpeechPolicyProfiles,
  hydrationBusy = false,
  isOpen,
  isSpeechPolicyPreviewing,
  job,
  metrics,
  metricsError,
  profileSource,
  profileSourceDiagnostics,
  projectStorage,
  projectStorageError,
  readerAccessibilitySettings,
  readAlongPreferences,
  researchModules,
  runConfiguration,
  selectedBookSource,
  selectedPreparedSource,
  selectedProfile,
  sourceMode,
  sourceFallbackLabel,
  sourcePolicySavingKey,
  speechPolicyDefinition,
  speechPolicyError,
  speechPolicyOverrides,
  speechPolicyProfile,
  speechPolicyProfiles,
  shortcutPreferences,
  telepromptTheatreSettings,
  teleprompterSettings,
  temporarySourceBehavior,
  temporaryStorageUsage,
  themeName,
  ttsEngineError,
  ttsEngines,
  uiMemory,
  onClearBookSourcePolicy,
  onClearPreparedSourcePolicy,
  onClearSpeechPolicyOverrides,
  onClose,
  onCreateCustomSpeechPolicyProfile,
  onDeleteCustomSpeechPolicyProfile,
  onReaderAccessibilitySettingsChange,
  onReadAlongPreferencesChange,
  onRunConfigurationChange,
  onSaveBookSourcePolicy,
  onSavePreparedSourcePolicy,
  onShortcutPreferencesChange,
  onShortcutPreferencesReset,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
  onSubmit,
  onTelepromptTheatreSettingsChange,
  onTeleprompterSettingsChange,
  onClearTemporarySources,
  onTemporarySourceBehaviorChange,
  onThemeChange,
  onUiMemoryExportPreferences,
  onUiMemoryImportPreferences,
  onUiMemoryPreferenceChange,
  onUiMemoryReset,
  onUpdateCustomSpeechPolicyProfile,
}: Readonly<{
  adapterDiagnostics: Record<string, AdapterDiagnostics> | null;
  adapterDiagnosticsError: string | null;
  canSubmit: boolean;
  commandTarget?: SettingsCommandTarget | null;
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  hydrationBusy?: boolean;
  isOpen: boolean;
  isSpeechPolicyPreviewing: boolean;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedProfile: VoiceProfile | null;
  sourceMode: SettingsSourceMode;
  sourceFallbackLabel: string | null;
  sourcePolicySavingKey: string | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  shortcutPreferences: ShortcutPreferences;
  telepromptTheatreSettings: TelepromptTheatreSettings;
  teleprompterSettings: TeleprompterHighlightSettings;
  temporarySourceBehavior?: TemporarySourceBehaviorSettings;
  temporaryStorageUsage?: TemporaryStorageUsageSummary | null;
  themeName: ThemeName;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  uiMemory: UiMemoryState;
  onClearBookSourcePolicy: (sourceId: string) => Promise<void>;
  onClearPreparedSourcePolicy: (sourceId: string) => Promise<void>;
  onClearSpeechPolicyOverrides: () => void;
  onClose: () => void;
  onCreateCustomSpeechPolicyProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onDeleteCustomSpeechPolicyProfile: (profileId: string) => Promise<void>;
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onReadAlongPreferencesChange: (settings: ReadAlongPreferences) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSaveBookSourcePolicy: (
    sourceId: string,
    request: SourceSpeechPolicyUpdateRequest,
  ) => Promise<void>;
  onSavePreparedSourcePolicy: (
    sourceId: string,
    request: SourceSpeechPolicyUpdateRequest,
  ) => Promise<void>;
  onShortcutPreferencesChange: (preferences: ShortcutPreferences) => void;
  onShortcutPreferencesReset: () => void;
  onSpeechPolicyOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onSubmit: () => void;
  onTelepromptTheatreSettingsChange: (settings: TelepromptTheatreSettings) => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onClearTemporarySources?: () => void | Promise<void>;
  onTemporarySourceBehaviorChange?: (settings: TemporarySourceBehaviorSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUiMemoryExportPreferences: () => Promise<string> | string;
  onUiMemoryImportPreferences: (
    json: string,
  ) => Promise<UiMemoryImportApplyResult> | UiMemoryImportApplyResult;
  onUiMemoryPreferenceChange: (preferenceId: UiMemoryPreferenceId, enabled: boolean) => void;
  onUiMemoryReset: (scope: UiMemoryResetScope) => void;
  onUpdateCustomSpeechPolicyProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
}>) {
  const [activeLayer, setActiveLayer] = useState<SettingsLayerId>(() =>
    commandTarget ? settingsLayerForCommandTarget(commandTarget) : "quick",
  );
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>(
    () => commandTarget?.groupId ?? "run",
  );
  const highlightedCommandToken = commandTarget ? settingsCommandTargetToken(commandTarget) : null;
  const healthReport = useMemo(
    () =>
      buildHealthReport({
        adapterDiagnostics,
        adapterDiagnosticsError,
        canCreate: canSubmit,
        job,
        metrics,
        metricsError,
        projectJobs: [],
        projectStorage,
        projectStorageError,
        selectedBookSource: sourceMode === "book" ? selectedBookSource : null,
        selectedEngineId: runConfiguration.ttsEngine,
        selectedPreparedSource: sourceMode === "fileUrl" ? selectedPreparedSource : null,
        sourceFallbackLabel,
        ttsEngineError,
        ttsEngines,
      }),
    [
      adapterDiagnostics,
      adapterDiagnosticsError,
      canSubmit,
      job,
      metrics,
      metricsError,
      projectStorage,
      projectStorageError,
      runConfiguration.ttsEngine,
      selectedBookSource,
      selectedPreparedSource,
      sourceFallbackLabel,
      sourceMode,
      ttsEngineError,
      ttsEngines,
    ],
  );

  useEffect(() => {
    if (!commandTarget) {
      return;
    }
    const nextLayer = settingsLayerForCommandTarget(commandTarget);
    setActiveLayer(nextLayer);
    setActiveGroup(commandTarget.groupId);
    const targetToken = settingsCommandTargetToken(commandTarget);
    const animationFrameId = globalThis.requestAnimationFrame(() => {
      findSettingsCommandTargetElement(targetToken)?.scrollIntoView({
        block: "center",
        inline: "nearest",
      });
    });
    return () => {
      globalThis.cancelAnimationFrame(animationFrameId);
    };
  }, [commandTarget]);

  if (!isOpen) {
    return null;
  }

  const activeMeta = settingsGroupMeta(activeGroup);
  const activeLayerMeta = settingsLayerMeta(activeLayer);
  const visibleGroups = settingsGroupsForActiveLayer(activeLayer);
  const selectLayer = (layerId: SettingsLayerId) => {
    setActiveLayer(layerId);
    setActiveGroup(nextActiveGroupForLayer(layerId, activeGroup));
  };
  return (
    <PanelShell busy={hydrationBusy} label="Settings" title="Studio Settings" onClose={onClose}>
      <SettingsLayerSwitcher activeLayer={activeLayer} onSelectLayer={selectLayer} />

      {activeLayer === "quick" ? (
        <QuickSettings
          canSubmit={canSubmit}
          customProfiles={customSpeechPolicyProfiles}
          definition={speechPolicyDefinition}
          highlightedCommandToken={highlightedCommandToken}
          readerAccessibilitySettings={readerAccessibilitySettings}
          readAlongPreferences={readAlongPreferences}
          runConfiguration={runConfiguration}
          selectedBookSource={selectedBookSource}
          selectedPreparedSource={selectedPreparedSource}
          selectedProfile={selectedProfile}
          sourceMode={sourceMode}
          speechPolicyProfile={speechPolicyProfile}
          speechPolicyProfiles={speechPolicyProfiles}
          telepromptTheatreSettings={telepromptTheatreSettings}
          temporarySourceBehavior={temporarySourceBehavior ?? DEFAULT_TEMPORARY_SOURCE_BEHAVIOR}
          temporaryStorageUsage={temporaryStorageUsage ?? null}
          themeName={themeName}
          ttsEngines={ttsEngines}
          onReaderAccessibilitySettingsChange={onReaderAccessibilitySettingsChange}
          onReadAlongPreferencesChange={onReadAlongPreferencesChange}
          onRunConfigurationChange={onRunConfigurationChange}
          onOpenGroup={(groupId) => {
            setActiveLayer(settingsGroupMeta(groupId).layer);
            setActiveGroup(groupId);
          }}
          onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
          onSubmit={onSubmit}
          onTelepromptTheatreSettingsChange={onTelepromptTheatreSettingsChange}
          onThemeChange={onThemeChange}
        />
      ) : (
        <div className="mt-5 grid min-h-0 gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
          <Panel as="nav" className="grid content-start gap-2 p-2" variant="inspector">
            <p className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.16em] vs-muted">
              {activeLayerMeta.label}
            </p>
            {visibleGroups.map((group) => (
              <Button
                align="start"
                className="grid gap-1 px-3 py-2"
                data-testid={`settings-group-${group.id}`}
                key={group.id}
                onClick={() => {
                  setActiveGroup(group.id);
                }}
                selected={activeGroup === group.id}
                size="md"
                variant="mode"
              >
                <span className="text-sm font-semibold">{group.label}</span>
                <span className="text-[0.68rem] leading-4 vs-muted">{group.detail}</span>
              </Button>
            ))}
          </Panel>

          <div className="min-w-0">
            <Panel className="mb-4 grid gap-3 p-4" variant="workSurface">
              <div>
                <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
                  {activeMeta.label}
                </p>
                <h3 className="mt-1 text-xl font-semibold">{activeMeta.summary}</h3>
                <p className="vs-muted mt-1 text-sm leading-6">{activeLayerMeta.summary}</p>
              </div>
              <ScopeLegend />
            </Panel>

            {activeGroup === "run" ? (
              <RunSettingsGroup
                canSubmit={canSubmit}
                customSpeechPolicyProfiles={customSpeechPolicyProfiles}
                highlightedCommandToken={highlightedCommandToken}
                job={job}
                runConfiguration={runConfiguration}
                selectedProfile={selectedProfile}
                speechPolicyDefinition={speechPolicyDefinition}
                speechPolicyProfile={speechPolicyProfile}
                speechPolicyProfiles={speechPolicyProfiles}
                ttsEngines={ttsEngines}
                onRunConfigurationChange={onRunConfigurationChange}
                onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
                onSubmit={onSubmit}
              />
            ) : null}
            {activeGroup === "reader" ? (
              <ReaderSettingsGroup
                highlightedCommandToken={highlightedCommandToken}
                readerAccessibilitySettings={readerAccessibilitySettings}
                readAlongPreferences={readAlongPreferences}
                runConfiguration={runConfiguration}
                shortcutPreferences={shortcutPreferences}
                telepromptTheatreSettings={telepromptTheatreSettings}
                teleprompterSettings={teleprompterSettings}
                themeName={themeName}
                ttsEngines={ttsEngines}
                uiMemory={uiMemory}
                onReaderAccessibilitySettingsChange={onReaderAccessibilitySettingsChange}
                onReadAlongPreferencesChange={onReadAlongPreferencesChange}
                onShortcutPreferencesChange={onShortcutPreferencesChange}
                onShortcutPreferencesReset={onShortcutPreferencesReset}
                onTelepromptTheatreSettingsChange={onTelepromptTheatreSettingsChange}
                onTeleprompterSettingsChange={onTeleprompterSettingsChange}
                onThemeChange={onThemeChange}
                onUiMemoryExportPreferences={onUiMemoryExportPreferences}
                onUiMemoryImportPreferences={onUiMemoryImportPreferences}
                onUiMemoryPreferenceChange={onUiMemoryPreferenceChange}
                onUiMemoryReset={onUiMemoryReset}
              />
            ) : null}
            {activeGroup === "voices" ? (
              <VoiceSettingsGroup
                highlightedCommandToken={highlightedCommandToken}
                runConfiguration={runConfiguration}
                selectedProfile={selectedProfile}
                ttsEngines={ttsEngines}
                onRunConfigurationChange={onRunConfigurationChange}
              />
            ) : null}
            {activeGroup === "sources" ? (
              <SourceSettingsGroup
                customSpeechPolicyProfiles={customSpeechPolicyProfiles}
                highlightedCommandToken={highlightedCommandToken}
                isSpeechPolicyPreviewing={isSpeechPolicyPreviewing}
                selectedBookSource={selectedBookSource}
                selectedPreparedSource={selectedPreparedSource}
                sourceMode={sourceMode}
                sourcePolicySavingKey={sourcePolicySavingKey}
                speechPolicyDefinition={speechPolicyDefinition}
                speechPolicyError={speechPolicyError}
                speechPolicyOverrides={speechPolicyOverrides}
                speechPolicyProfile={speechPolicyProfile}
                speechPolicyProfiles={speechPolicyProfiles}
                temporarySourceBehavior={
                  temporarySourceBehavior ?? DEFAULT_TEMPORARY_SOURCE_BEHAVIOR
                }
                temporaryStorageUsage={temporaryStorageUsage ?? null}
                onClearBookSourcePolicy={onClearBookSourcePolicy}
                onClearPreparedSourcePolicy={onClearPreparedSourcePolicy}
                onClearSpeechPolicyOverrides={onClearSpeechPolicyOverrides}
                onCreateCustomSpeechPolicyProfile={onCreateCustomSpeechPolicyProfile}
                onDeleteCustomSpeechPolicyProfile={onDeleteCustomSpeechPolicyProfile}
                onSaveBookSourcePolicy={onSaveBookSourcePolicy}
                onSavePreparedSourcePolicy={onSavePreparedSourcePolicy}
                onSpeechPolicyOverridesChange={onSpeechPolicyOverridesChange}
                onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
                onTemporarySourceBehaviorChange={
                  onTemporarySourceBehaviorChange ??
                  (() => {
                    // Optional in tests and legacy callers; App owns the live setting.
                  })
                }
                onClearTemporarySources={onClearTemporarySources}
                onUpdateCustomSpeechPolicyProfile={onUpdateCustomSpeechPolicyProfile}
              />
            ) : null}
            {activeGroup === "runtime" ? (
              <RuntimeSettingsGroup
                highlightedCommandToken={highlightedCommandToken}
                metrics={metrics}
                metricsError={metricsError}
                profileSourceDiagnostics={profileSourceDiagnostics}
                researchModules={researchModules}
                runConfiguration={runConfiguration}
                ttsEngineError={ttsEngineError}
                ttsEngines={ttsEngines}
                onRunConfigurationChange={onRunConfigurationChange}
              />
            ) : null}
            {activeGroup === "diagnostics" ? (
              <DiagnosticsSettingsGroup
                adapterDiagnostics={adapterDiagnostics}
                adapterDiagnosticsError={adapterDiagnosticsError}
                diagnosticSummary={diagnosticSummaryWithSettingsContext(healthReport, {
                  runConfiguration,
                  speechPolicyOverrides,
                  speechPolicyProfile,
                })}
                healthReport={healthReport}
                highlightedCommandToken={highlightedCommandToken}
                job={job}
                metrics={metrics}
                metricsError={metricsError}
                profileSource={profileSource}
                profileSourceDiagnostics={profileSourceDiagnostics}
                projectStorage={projectStorage}
                projectStorageError={projectStorageError}
                runConfiguration={runConfiguration}
                selectedBookSource={selectedBookSource}
                selectedPreparedSource={selectedPreparedSource}
                selectedProfile={selectedProfile}
                speechPolicyOverrides={speechPolicyOverrides}
                speechPolicyProfile={speechPolicyProfile}
                ttsEngineError={ttsEngineError}
                ttsEngines={ttsEngines}
              />
            ) : null}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

function SettingsLayerSwitcher({
  activeLayer,
  onSelectLayer,
}: Readonly<{
  activeLayer: SettingsLayerId;
  onSelectLayer: (layerId: SettingsLayerId) => void;
}>) {
  return (
    <Panel className="grid gap-3 p-4" variant="management">
      <div className="grid gap-2 md:grid-cols-3">
        {SETTINGS_LAYERS.map((layer) => (
          <Button
            align="start"
            className="grid gap-1 p-3"
            data-testid={`settings-layer-${layer.id}`}
            key={layer.id}
            onClick={() => {
              onSelectLayer(layer.id);
            }}
            selected={activeLayer === layer.id}
            variant="mode"
          >
            <span className="text-sm font-semibold">{layer.label}</span>
            <span className="vs-muted text-xs leading-5">{layer.detail}</span>
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function QuickSettings({
  canSubmit,
  customProfiles,
  definition,
  highlightedCommandToken,
  readerAccessibilitySettings,
  readAlongPreferences,
  runConfiguration,
  selectedBookSource,
  selectedPreparedSource,
  selectedProfile,
  sourceMode,
  speechPolicyProfile,
  speechPolicyProfiles,
  telepromptTheatreSettings,
  temporarySourceBehavior,
  temporaryStorageUsage,
  themeName,
  ttsEngines,
  onReaderAccessibilitySettingsChange,
  onReadAlongPreferencesChange,
  onRunConfigurationChange,
  onOpenGroup,
  onSpeechPolicyProfileChange,
  onSubmit,
  onTelepromptTheatreSettingsChange,
  onThemeChange,
}: Readonly<{
  canSubmit: boolean;
  customProfiles: CustomSpeechPolicyProfile[];
  definition: SpeechPolicyDefinition;
  highlightedCommandToken: string | null;
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  runConfiguration: RunConfiguration;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedProfile: VoiceProfile | null;
  sourceMode: SettingsSourceMode;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  telepromptTheatreSettings: TelepromptTheatreSettings;
  temporarySourceBehavior: TemporarySourceBehaviorSettings;
  temporaryStorageUsage: TemporaryStorageUsageSummary | null;
  themeName: ThemeName;
  ttsEngines: TTSEngineDiagnostics[];
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onReadAlongPreferencesChange: (settings: ReadAlongPreferences) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onOpenGroup: (groupId: SettingsGroupId) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onSubmit: () => void;
  onTelepromptTheatreSettingsChange: (settings: TelepromptTheatreSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const profileOptions = resolveSpeechPolicyProfileOptions(definition, speechPolicyProfiles);
  const [selectedErgonomicPresetId, setSelectedErgonomicPresetId] =
    useState<ErgonomicPresetId>("longFormBookListening");
  const activeSourceLabel = quickSourceLabel(
    sourceMode,
    selectedBookSource,
    selectedPreparedSource,
  );
  const activePolicyLabel = speechPolicyProfileLabel(speechPolicyProfile, profileOptions);
  const settingsAuditRows = buildSettingsAuditRows([
    {
      currentValue: getRunModePreset(runConfiguration.runMode).label,
      fieldId: "runMode",
    },
    {
      currentValue: runConfiguration.performanceMode,
      fieldId: "performanceMode",
    },
    {
      currentValue: selectedProfile?.name ?? "Default voice",
      fieldId: "voice",
    },
    {
      currentValue: activeSourceLabel,
      fieldId: "activeSource",
    },
    {
      currentValue: themeName,
      fieldId: "readerPreferences",
    },
    {
      currentValue: activePolicyLabel,
      fieldId: "projectSpeechPolicy",
    },
    {
      currentValue: ergonomicPresetById(selectedErgonomicPresetId).label,
      fieldId: "ergonomicPresets",
      pendingValue: "Preview draft",
    },
  ]);
  const resetRunDefaults = () => {
    const next = createRunConfiguration("checkedMaster");
    onRunConfigurationChange({
      ...next,
      engineOptions: runConfiguration.engineOptions,
      ttsEngine: runConfiguration.ttsEngine,
    });
  };
  return (
    <Panel
      className="mt-5 grid gap-4 p-4"
      data-settings-command-targets={[
        "group-run",
        "group-voices",
        "group-sources",
        "field-runMode",
        "field-performanceMode",
        "field-voice",
        "field-activeSource",
        "field-projectSpeechPolicy",
        "field-temporarySourceBehavior",
        "field-previewSample",
        "field-ergonomicPresets",
        "field-readerPreferences",
        "field-readAlongPreferences",
        "field-telepromptTheatre",
        "scope-session",
        "scope-temporarySource",
        "scope-machine",
        "scope-source",
        "scope-project",
      ].join(" ")}
      highlighted={
        highlightedCommandToken
          ? ["field-previewSample", "field-ergonomicPresets", highlightedCommandToken].includes(
              highlightedCommandToken,
            )
          : false
      }
      variant="workSurface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            Quick settings
          </p>
          <h3 className="mt-1 text-base font-semibold">Useful audio without the long scroll</h3>
          <p className="vs-muted mt-1 text-sm leading-6">
            Set voice, speed, source, output intent, basic policy, then preview or create.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ScopeBadge scope="session" />
          <ScopeBadge scope="source" />
          <ScopeBadge scope="project" />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <QuickSelect
          testId="settings-quick-output-intent"
          label="Output intent"
          scope="session"
          value={runConfiguration.runMode}
          onChange={(value) => {
            const next = createRunConfiguration(value as RunConfiguration["runMode"]);
            onRunConfigurationChange({
              ...next,
              engineOptions: runConfiguration.engineOptions,
              ttsEngine: runConfiguration.ttsEngine,
            });
          }}
        >
          {RUN_MODE_PRESETS.map((preset) => (
            <option key={preset.mode} value={preset.mode}>
              {preset.label}
            </option>
          ))}
        </QuickSelect>
        <QuickSelect
          testId="settings-quick-speed"
          label="Speed"
          scope="session"
          value={runConfiguration.performanceMode}
          onChange={(value) => {
            onRunConfigurationChange({
              ...runConfiguration,
              performanceMode: value as PerformanceMode,
            });
          }}
        >
          {PERFORMANCE_MODE_OPTIONS.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </QuickSelect>
        <QuickFact label="Voice" scope="session" value={selectedProfile?.name ?? "Default voice"} />
        <QuickFact label="Source" scope="source" value={activeSourceLabel} />
        <QuickSelect
          testId="settings-quick-theme"
          label="Theme"
          scope="machine"
          value={themeName}
          onChange={(value) => {
            onThemeChange(value as ThemeName);
          }}
        >
          {VOICE_STUDIO_THEMES.map((theme) => (
            <option key={theme.name} value={theme.name}>
              {theme.label}
            </option>
          ))}
        </QuickSelect>
        <QuickSelect
          testId="settings-quick-basic-policy"
          label="Basic policy"
          scope="project"
          value={speechPolicyProfile}
          onChange={onSpeechPolicyProfileChange}
        >
          {profileOptions.map((profile) => (
            <option key={profile.name} value={profile.name}>
              {profile.label}
            </option>
          ))}
          {customProfiles.length > 0 ? (
            <optgroup label="Custom profiles">
              {customProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </QuickSelect>
        <QuickSelect
          testId="settings-quick-engine"
          label="Engine"
          scope="session"
          value={kokoroEngineFamilyValue(runConfiguration.ttsEngine)}
          onChange={(value) => {
            onRunConfigurationChange(applyRunEngineSelection(runConfiguration, value, ttsEngines));
          }}
        >
          {engineFamilyOptions(ttsEngines).map((engine) => (
            <option disabled={engine.status !== "ready"} key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </QuickSelect>
      </div>
      <Panel
        className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
        data-settings-command-targets="field-temporarySourceBehavior scope-temporarySource"
        data-testid="settings-quick-temporary-work-row"
        variant="metadata"
      >
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Temporary work
            <ScopeBadge scope="temporarySource" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Keeps return position, bookmarks, and progress for temporary sources until they expire
            or you clear them. Temporary work is not project history.
          </p>
        </div>
        <div className="grid gap-1 text-xs md:text-right">
          <span className="font-semibold">
            {temporarySourceBehavior.returnContextMemory === "forgetOnClose"
              ? "Recall off"
              : "Recall on"}
          </span>
          <span className="vs-muted">
            {temporaryExpiryLabel(temporarySourceBehavior.expiryDuration)} ·{" "}
            {formatBytes(temporaryStorageUsage?.totalBytes ?? 0)}
          </span>
        </div>
      </Panel>
      <ErgonomicPresetControls
        profileOptions={profileOptions}
        readerAccessibilitySettings={readerAccessibilitySettings}
        readAlongPreferences={readAlongPreferences}
        runConfiguration={runConfiguration}
        selectedPresetId={selectedErgonomicPresetId}
        speechPolicyProfile={speechPolicyProfile}
        telepromptTheatreSettings={telepromptTheatreSettings}
        onReaderAccessibilitySettingsChange={onReaderAccessibilitySettingsChange}
        onReadAlongPreferencesChange={onReadAlongPreferencesChange}
        onRunConfigurationChange={onRunConfigurationChange}
        onSelectPreset={setSelectedErgonomicPresetId}
        onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
        onTelepromptTheatreSettingsChange={onTelepromptTheatreSettingsChange}
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <Button
          data-testid="settings-quick-preview-sample"
          data-ui-action-surface="Settings"
          disabled={!canSubmit}
          disabledReason={
            canSubmit ? undefined : "Select or prepare source text before previewing."
          }
          onClick={onSubmit}
          variant="primary"
        >
          Preview sample
        </Button>
        <Button
          data-confirm="Reset run defaults"
          data-testid="settings-quick-reset-run"
          data-ui-action-surface="Settings"
          onClick={resetRunDefaults}
          variant="secondary"
        >
          Reset run defaults
        </Button>
        <Button
          data-confirm="Reset display"
          data-testid="settings-quick-reset-reader"
          data-ui-action-surface="Settings"
          onClick={() => {
            onReaderAccessibilitySettingsChange({
              ...readerAccessibilitySettings,
              textScale: "comfortable",
            });
            onThemeChange("light");
          }}
          variant="secondary"
        >
          Reset display
        </Button>
      </div>
      <SettingsAuditSummary rows={settingsAuditRows} />
      <Panel className="grid gap-2 p-3" variant="management">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] vs-muted">
          More configuration
        </p>
        <div className="grid gap-2 sm:grid-cols-4">
          {settingsGroupsForLayer("advanced").map((group) => (
            <Button
              align="start"
              className="grid gap-1 px-3 py-2"
              data-testid={`settings-quick-group-${group.id}`}
              key={group.id}
              onClick={() => {
                onOpenGroup(group.id);
              }}
              size="sm"
              variant="secondary"
            >
              <span className="font-semibold">{group.label}</span>
              <span className="vs-muted text-[0.65rem] leading-4">{group.summary}</span>
            </Button>
          ))}
        </div>
      </Panel>
    </Panel>
  );
}

function QuickFact({
  label,
  scope,
  value,
}: Readonly<{ label: string; scope: SettingsScope; value: string }>) {
  return (
    <div className="grid gap-1 rounded-md border px-3 py-2 text-xs vs-metadata-surface">
      <span className="flex items-center gap-2 font-semibold">
        {label}
        <ScopeBadge scope={scope} />
      </span>
      <span className="truncate text-sm font-medium" title={value}>
        {value}
      </span>
    </div>
  );
}

function QuickSelect({
  children,
  label,
  scope,
  testId,
  value,
  onChange,
}: Readonly<{
  children: ReactNode;
  label: string;
  scope: SettingsScope;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="flex items-center gap-2">
        {label}
        <ScopeBadge scope={scope} />
      </span>
      <select
        className={`${fieldControlClassName} min-w-0`}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function temporaryExpiryLabel(duration: TemporaryExpiryDuration): string {
  return TEMPORARY_EXPIRY_OPTIONS.find((option) => option.value === duration)?.label ?? "24 hours";
}

function ErgonomicPresetControls({
  profileOptions,
  readerAccessibilitySettings,
  readAlongPreferences,
  runConfiguration,
  selectedPresetId,
  speechPolicyProfile,
  telepromptTheatreSettings,
  onReaderAccessibilitySettingsChange,
  onReadAlongPreferencesChange,
  onRunConfigurationChange,
  onSelectPreset,
  onSpeechPolicyProfileChange,
  onTelepromptTheatreSettingsChange,
}: Readonly<{
  profileOptions: SpeechPolicyProfile[];
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  runConfiguration: RunConfiguration;
  selectedPresetId: ErgonomicPresetId;
  speechPolicyProfile: string;
  telepromptTheatreSettings: TelepromptTheatreSettings;
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onReadAlongPreferencesChange: (settings: ReadAlongPreferences) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSelectPreset: (presetId: ErgonomicPresetId) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onTelepromptTheatreSettingsChange: (settings: TelepromptTheatreSettings) => void;
}>) {
  const { announcePolite } = useLiveStatus();
  const preset = ergonomicPresetById(selectedPresetId);
  const policyLabel = speechPolicyProfileLabel(preset.speechPolicyProfile, profileOptions);
  const currentPolicyLabel = speechPolicyProfileLabel(speechPolicyProfile, profileOptions);
  const policyAlreadyActive = speechPolicyProfile === preset.speechPolicyProfile;
  const presetChangeSet = buildErgonomicPresetChangeSet(selectedPresetId, {
    readerAccessibilitySettings,
    readAlongPreferences,
    runConfiguration,
    sourcePinSummary: "Existing source pins",
    speechPolicyProfile,
    speechPolicyProfileLabel: (profile) => speechPolicyProfileLabel(profile, profileOptions),
    telepromptTheatreSettings,
  });
  const applyPreset = () => {
    const next = applyErgonomicPresetDefaults(selectedPresetId, {
      readerAccessibilitySettings,
      readAlongPreferences,
      runConfiguration,
      telepromptTheatreSettings,
    });
    onReaderAccessibilitySettingsChange(next.readerAccessibilitySettings);
    onReadAlongPreferencesChange(next.readAlongPreferences);
    onRunConfigurationChange(next.runConfiguration);
    onTelepromptTheatreSettingsChange(next.telepromptTheatreSettings);
    announcePolite(`Applied ${preset.label} ergonomic defaults.`);
  };
  const applyPolicy = () => {
    if (policyAlreadyActive) {
      announcePolite(`${policyLabel} speech policy is already active.`);
      return;
    }
    if (!confirmErgonomicPolicyChange(preset, currentPolicyLabel, policyLabel)) {
      announcePolite(`Speech policy change cancelled for ${preset.label}.`);
      return;
    }
    onSpeechPolicyProfileChange(preset.speechPolicyProfile);
    announcePolite(`Applied ${policyLabel} speech policy.`);
  };

  return (
    <Panel
      className="grid gap-3 p-3"
      data-settings-command-targets="field-ergonomicPresets scope-machine scope-session scope-project"
      data-testid="settings-ergonomic-presets"
      variant="management"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Use-case preset
            <ScopeBadge scope="machine" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Presets set display, read-along, Theatre, preview, and run defaults.
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] vs-border vs-muted">
          Policy requires confirm
        </span>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {ERGONOMIC_PRESETS.map((candidate) => (
          <Button
            align="start"
            className="grid gap-1 p-3"
            data-testid={`ui-action-ergonomic-preset-${candidate.id}`}
            data-ui-action-surface="Settings"
            key={candidate.id}
            onClick={() => {
              onSelectPreset(candidate.id);
            }}
            selected={candidate.id === selectedPresetId}
            variant="mode"
          >
            <span className="text-sm font-semibold">{candidate.label}</span>
            <span className="vs-muted text-xs leading-5">{candidate.description}</span>
          </Button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <PresetChangeSetView changeSet={presetChangeSet} />
        <div className="grid content-start gap-2">
          <Button
            data-testid="ui-action-ergonomic-preset-apply"
            data-ui-action-surface="Settings"
            onClick={applyPreset}
            variant="primary"
          >
            Apply preset defaults
          </Button>
          <Button
            data-confirm={`Apply ${policyLabel} project speech policy`}
            data-testid="ui-action-ergonomic-preset-apply-policy"
            data-ui-action-surface="Settings"
            disabled={policyAlreadyActive}
            disabledReason={
              policyAlreadyActive ? "Project speech policy already matches this preset." : undefined
            }
            onClick={applyPolicy}
            variant="secondary"
          >
            Apply speech policy
          </Button>
          <Panel className="grid gap-1 px-3 py-2 text-xs" variant="metadata">
            <span className="font-semibold">Source pins stay unchanged</span>
            <span className="vs-muted leading-5">
              Individual controls below remain editable after applying a preset.
            </span>
          </Panel>
        </div>
      </div>
    </Panel>
  );
}

function PresetChangeSetView({ changeSet }: Readonly<{ changeSet: PresetChangeSet }>) {
  return (
    <div
      className="grid gap-3 rounded-md border p-3 vs-work-surface"
      data-testid="ergonomic-preset-preview"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold">Before / after summary</h5>
          <p className="vs-muted mt-1 text-xs leading-5">
            {changeSet.changedCount.toString()} changes, {changeSet.preservedCount.toString()}{" "}
            preserved fields.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {changeSet.affectedScopes.map((scope) => (
            <ScopeBadge key={scope} scope={scope} />
          ))}
        </div>
      </div>
      <div className="grid gap-2">
        {changeSet.items.map((item) => (
          <PresetChangeSetRow item={item} key={item.fieldId} />
        ))}
      </div>
      {changeSet.requiresConfirmation ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs font-semibold text-[var(--vs-status-warning)]">
          Policy changes are recommendations until confirmed.
        </p>
      ) : null}
    </div>
  );
}

function PresetChangeSetRow({ item }: Readonly<{ item: SettingsChangeSetItem }>) {
  const status = presetChangeSetRowStatus(item);
  return (
    <div className="grid gap-2 rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-xs vs-border md:grid-cols-[minmax(7rem,0.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
      <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
        <span className="truncate">{item.label}</span>
        <ScopeBadge scope={item.scope} />
      </div>
      <div className="min-w-0">
        <span className="vs-muted block text-[0.65rem] uppercase tracking-[0.12em]">Before</span>
        <span className="block truncate text-sm font-medium" title={item.before}>
          {item.before}
        </span>
      </div>
      <div className="min-w-0">
        <span className="vs-muted block text-[0.65rem] uppercase tracking-[0.12em]">After</span>
        <span className="block truncate text-sm font-medium" title={item.after}>
          {item.after}
        </span>
      </div>
      <span className="rounded-full border px-2 py-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] vs-border vs-muted">
        {status}
      </span>
    </div>
  );
}

function presetChangeSetRowStatus(item: SettingsChangeSetItem): string {
  if (item.preserved) {
    return "Preserved";
  }
  if (!item.changed) {
    return "Unchanged";
  }
  if (item.confirmationLevel === "none") {
    return "Changed";
  }
  return "Confirm";
}

function speechPolicyProfileLabel(profile: string, options: SpeechPolicyProfile[]): string {
  return options.find((option) => option.name === profile)?.label ?? profile;
}

function confirmErgonomicPolicyChange(
  preset: ErgonomicPreset,
  currentPolicyLabel: string,
  policyLabel: string,
): boolean {
  if (typeof globalThis.confirm !== "function") {
    return true;
  }
  return globalThis.confirm(
    `Change project speech policy from ${currentPolicyLabel} to ${policyLabel} for ${preset.label}? Source-level pins and overrides stay unchanged.`,
  );
}

function SettingsAuditSummary({ rows }: Readonly<{ rows: SettingsAuditRow[] }>) {
  return (
    <details className="rounded-md border bg-[var(--vs-surface)] p-3 vs-border">
      <summary className="cursor-pointer text-sm font-semibold">Settings audit</summary>
      <p className="vs-muted mt-2 text-xs leading-5">
        Precedence: {SETTINGS_PRECEDENCE.map((item) => item.label).join(" -> ")}.
      </p>
      <div className="mt-3 grid gap-2">
        {rows.map((row) => (
          <div
            className="grid gap-2 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs vs-border md:grid-cols-[minmax(7rem,0.7fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
            key={row.fieldId}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2 font-semibold">
              <span className="truncate">{row.label}</span>
              <ScopeBadge scope={row.scope} />
            </div>
            <div className="min-w-0">
              <span className="vs-muted block text-[0.65rem] uppercase tracking-[0.12em]">
                Current
              </span>
              <span className="block truncate text-sm font-medium" title={row.currentValue}>
                {row.currentValue}
              </span>
            </div>
            <div className="min-w-0">
              <span className="vs-muted block text-[0.65rem] uppercase tracking-[0.12em]">
                Source of truth
              </span>
              <span className="block truncate" title={row.sourceOfTruth}>
                {row.sourceOfTruth}
              </span>
            </div>
            <span className="rounded-full border px-2 py-1 text-center text-[0.65rem] font-semibold uppercase tracking-[0.12em] vs-border vs-muted">
              {row.pendingValue ? `Pending: ${row.pendingValue}` : row.resetAction}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

function ScopeLegend() {
  return (
    <fieldset className="grid gap-2 text-xs sm:grid-cols-2">
      <legend className="sr-only">Settings applies-to scopes</legend>
      {(["session", "temporarySource", "source", "project", "machine"] as const).map((scope) => (
        <Panel className="px-3 py-2" key={scope} variant="raised">
          <div className="flex items-center gap-2">
            <ScopeBadge scope={scope} />
            <span className="font-semibold">{SETTINGS_SCOPE_META[scope].label}</span>
          </div>
          <p className="vs-muted mt-1 leading-5">{settingsScopeAppliesTo(scope)}</p>
        </Panel>
      ))}
    </fieldset>
  );
}

function RunSettingsGroup({
  canSubmit,
  customSpeechPolicyProfiles,
  highlightedCommandToken,
  job,
  runConfiguration,
  selectedProfile,
  speechPolicyDefinition,
  speechPolicyProfile,
  speechPolicyProfiles,
  ttsEngines,
  onRunConfigurationChange,
  onSpeechPolicyProfileChange,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  highlightedCommandToken: string | null;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onSubmit: () => void;
}>) {
  return (
    <PanelSection
      commandTargetTokens={["group-run", "field-runMode", "field-performanceMode", "scope-session"]}
      highlightedCommandToken={highlightedCommandToken}
      scope="session"
      title="Run"
      subtitle={SETTINGS_FIELD_META.find((field) => field.id === "runMode")?.description ?? ""}
    >
      <RunConfigurationWizard
        customSpeechPolicyProfiles={customSpeechPolicyProfiles}
        runConfiguration={runConfiguration}
        selectedProfile={selectedProfile}
        speechPolicyDefinition={speechPolicyDefinition}
        speechPolicyProfile={speechPolicyProfile}
        speechPolicyProfiles={speechPolicyProfiles}
        ttsEngines={ttsEngines}
        onRunConfigurationChange={onRunConfigurationChange}
        onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
      />
      <details className="rounded-md border p-3 vs-border vs-surface">
        <summary className="cursor-pointer text-sm font-semibold">Advanced run controls</summary>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {RUN_MODE_PRESETS.map((preset) => (
              <Button
                align="start"
                className="grid p-3"
                key={preset.mode}
                onClick={() => {
                  const next = createRunConfiguration(preset.mode);
                  onRunConfigurationChange({
                    ...next,
                    engineOptions: runConfiguration.engineOptions,
                    ttsEngine: runConfiguration.ttsEngine,
                  });
                }}
                selected={preset.mode === runConfiguration.runMode}
                variant="mode"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{preset.label}</span>
                  <span className="vs-muted text-xs">{preset.primaryLabel}</span>
                </span>
                <span className="vs-muted mt-2 block text-sm leading-5">{preset.description}</span>
              </Button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {PERFORMANCE_MODE_OPTIONS.map((mode) => (
              <Button
                align="start"
                className="grid px-3 py-3 capitalize"
                key={mode}
                onClick={() => {
                  onRunConfigurationChange({ ...runConfiguration, performanceMode: mode });
                }}
                selected={mode === runConfiguration.performanceMode}
                variant="mode"
              >
                <span className="font-semibold">{mode}</span>
                <span className="vs-muted mt-1 block text-xs leading-5">
                  {describePerformanceMode(mode)}
                </span>
              </Button>
            ))}
          </div>
          <PipelineToggles
            keys={COMMON_PIPELINE_OPTIONS}
            runConfiguration={runConfiguration}
            onRunConfigurationChange={onRunConfigurationChange}
          />
          <PipelineToggles
            keys={Object.keys(PIPELINE_OPTION_LABELS) as (keyof PipelineOptions)[]}
            runConfiguration={runConfiguration}
            onRunConfigurationChange={onRunConfigurationChange}
          />
        </div>
      </details>
      <DiagnosticLine label="Current job" value={job?.status ?? "No job yet"} />
      <Button fullWidth disabled={!canSubmit} onClick={onSubmit} variant="primary">
        {job?.status === "completed"
          ? "Create Again"
          : getRunModePreset(runConfiguration.runMode).primaryLabel}
      </Button>
    </PanelSection>
  );
}

function PipelineToggles({
  keys,
  runConfiguration,
  onRunConfigurationChange,
}: Readonly<{
  keys: (keyof PipelineOptions)[];
  runConfiguration: RunConfiguration;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {keys.map((key) => (
        <Toggle
          checked={runConfiguration.options[key]}
          detail={PIPELINE_OPTION_LABELS[key].detail}
          key={key}
          label={
            <span className="flex flex-wrap items-center gap-2">
              {PIPELINE_OPTION_LABELS[key].label}
              <ScopeBadge scope="session" />
            </span>
          }
          onChange={(checked) => {
            onRunConfigurationChange({
              ...runConfiguration,
              options: {
                ...runConfiguration.options,
                [key]: checked,
              },
            });
          }}
        />
      ))}
    </div>
  );
}

function ReaderSettingsGroup({
  highlightedCommandToken,
  readerAccessibilitySettings,
  readAlongPreferences,
  runConfiguration,
  shortcutPreferences,
  telepromptTheatreSettings,
  teleprompterSettings,
  themeName,
  ttsEngines,
  uiMemory,
  onReaderAccessibilitySettingsChange,
  onReadAlongPreferencesChange,
  onShortcutPreferencesChange,
  onShortcutPreferencesReset,
  onTelepromptTheatreSettingsChange,
  onTeleprompterSettingsChange,
  onThemeChange,
  onUiMemoryExportPreferences,
  onUiMemoryImportPreferences,
  onUiMemoryPreferenceChange,
  onUiMemoryReset,
}: Readonly<{
  highlightedCommandToken: string | null;
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  runConfiguration: RunConfiguration;
  shortcutPreferences: ShortcutPreferences;
  telepromptTheatreSettings: TelepromptTheatreSettings;
  teleprompterSettings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  ttsEngines: TTSEngineDiagnostics[];
  uiMemory: UiMemoryState;
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onReadAlongPreferencesChange: (settings: ReadAlongPreferences) => void;
  onShortcutPreferencesChange: (preferences: ShortcutPreferences) => void;
  onShortcutPreferencesReset: () => void;
  onTelepromptTheatreSettingsChange: (settings: TelepromptTheatreSettings) => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUiMemoryExportPreferences: () => Promise<string> | string;
  onUiMemoryImportPreferences: (
    json: string,
  ) => Promise<UiMemoryImportApplyResult> | UiMemoryImportApplyResult;
  onUiMemoryPreferenceChange: (preferenceId: UiMemoryPreferenceId, enabled: boolean) => void;
  onUiMemoryReset: (scope: UiMemoryResetScope) => void;
}>) {
  return (
    <PanelSection
      commandTargetTokens={[
        "group-reader",
        "field-readerPreferences",
        "field-readAlongPreferences",
        "field-telepromptTheatre",
        "field-uiMemory",
        "field-shortcuts",
        "scope-machine",
      ]}
      highlightedCommandToken={highlightedCommandToken}
      scope="machine"
      title="Reader"
      subtitle={
        SETTINGS_FIELD_META.find((field) => field.id === "readerPreferences")?.description ?? ""
      }
    >
      <DiagnosticLine
        label="Run mode context"
        value={getRunModePreset(runConfiguration.runMode).label}
      />
      <ReaderAccessibilityControls
        settings={readerAccessibilitySettings}
        variant="panel"
        onChange={onReaderAccessibilitySettingsChange}
      />
      <ReadAlongSettingsControls
        accessibilitySettings={readerAccessibilitySettings}
        preferences={readAlongPreferences}
        providerId={runConfiguration.ttsEngine}
        providerRuntime={resolveProviderRuntimeCapabilities(runConfiguration.ttsEngine, ttsEngines)}
        onChange={onReadAlongPreferencesChange}
      />
      <TelepromptTheatreSettingsControls
        memoryEnabled={uiMemory.rememberTelepromptTheatreSettings}
        settings={telepromptTheatreSettings}
        onChange={onTelepromptTheatreSettingsChange}
      />
      <ThemeSettingsControls themeName={themeName} onThemeChange={onThemeChange} />
      <UiMemoryPreferences
        uiMemory={uiMemory}
        onExportPreferences={onUiMemoryExportPreferences}
        onImportPreferences={onUiMemoryImportPreferences}
        onPreferenceChange={onUiMemoryPreferenceChange}
        onResetMemory={onUiMemoryReset}
      />
      <ShortcutSettings
        preferences={shortcutPreferences}
        onChange={onShortcutPreferencesChange}
        onReset={onShortcutPreferencesReset}
      />
      <details className="rounded-lg border bg-[var(--vs-surface)] p-3 vs-border">
        <summary className="cursor-pointer text-sm font-semibold">
          Advanced teleprompt highlight timing
        </summary>
        <p className="vs-muted mt-2 text-xs leading-5">
          Recording presets live in Teleprompt Studio. Use these timing controls only when the
          default cue behavior needs fine tuning.
        </p>
        <div className="mt-3">
          <TeleprompterSettingsControls
            settings={teleprompterSettings}
            onChange={onTeleprompterSettingsChange}
          />
        </div>
      </details>
    </PanelSection>
  );
}

function ThemeSettingsControls({
  themeName,
  onThemeChange,
}: Readonly<{ themeName: ThemeName; onThemeChange: (theme: ThemeName) => void }>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Theme
          <ScopeBadge scope="machine" />
        </h4>
        <span className="vs-muted text-xs">Stored on this machine</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {VOICE_STUDIO_THEMES.map((theme) => (
          <Button
            align="start"
            className="grid p-3"
            key={theme.name}
            onClick={() => {
              onThemeChange(theme.name);
            }}
            selected={themeName === theme.name}
            variant="mode"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="font-semibold">{theme.label}</span>
              <span className="vs-muted text-xs">{theme.description}</span>
            </span>
            <span className="mt-3 grid grid-cols-5 gap-1">
              {[
                theme.swatches.background,
                theme.swatches.surface,
                theme.swatches.text,
                theme.swatches.accent,
                theme.swatches.generating,
              ].map((color) => (
                <span
                  aria-hidden="true"
                  className="h-4 rounded border border-black/10"
                  key={`${theme.name}-${color}`}
                  style={{ background: color }}
                />
              ))}
            </span>
          </Button>
        ))}
      </div>
    </Panel>
  );
}

function TeleprompterSettingsControls({
  settings,
  onChange,
}: Readonly<{
  settings: TeleprompterHighlightSettings;
  onChange: (settings: TeleprompterHighlightSettings) => void;
}>) {
  const updateNumber = (key: keyof TeleprompterHighlightSettings, value: number) => {
    onChange({ ...settings, [key]: value });
  };
  const updateEffect = (effectStyle: TeleprompterEffectStyle) => {
    onChange({ ...settings, effectStyle });
  };

  return (
    <Panel className="grid gap-4 p-3" variant="surface">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Teleprompter focus
          <ScopeBadge scope="machine" />
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Lead timing pulls the eye forward; fade timing keeps spoken words gently visible.
        </p>
      </div>
      <TeleprompterRange
        label="Lead timing"
        max={600}
        min={0}
        suffix="ms"
        value={settings.leadMs}
        onChange={(value) => {
          updateNumber("leadMs", value);
        }}
      />
      <TeleprompterRange
        label="Spoken fade"
        max={2400}
        min={120}
        suffix="ms"
        value={settings.spokenFadeMs}
        onChange={(value) => {
          updateNumber("spokenFadeMs", value);
        }}
      />
      <TeleprompterRange
        label="Upcoming window"
        max={900}
        min={0}
        suffix="ms"
        value={settings.upcomingWindowMs}
        onChange={(value) => {
          updateNumber("upcomingWindowMs", value);
        }}
      />
      <div className="flex flex-wrap gap-2">
        {(["spark", "classic"] as const).map((style) => (
          <Button
            className="capitalize"
            key={style}
            onClick={() => {
              updateEffect(style);
            }}
            selected={settings.effectStyle === style}
            size="sm"
            variant="mode"
          >
            {style === "spark" ? "Spark Demo" : "Outline Glow"}
          </Button>
        ))}
      </div>
      <TeleprompterHighlightDemo settings={settings} />
    </Panel>
  );
}

function TeleprompterRange({
  label,
  max,
  min,
  step = 1,
  suffix = "",
  value,
  onChange,
}: Readonly<{
  label: string;
  max: number;
  min: number;
  step?: number;
  suffix?: string;
  value: number;
  onChange: (value: number) => void;
}>) {
  return (
    <label className="vs-muted grid gap-2 text-xs font-medium">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        <span className="font-semibold text-[var(--vs-text)]">
          {Number.isInteger(value) ? value.toString() : value.toFixed(2)}
          {suffix}
        </span>
      </span>
      <input
        className="accent-orange-500"
        max={max}
        min={min}
        onChange={(event) => {
          onChange(Number(event.currentTarget.value));
        }}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

function TeleprompterHighlightDemo({
  settings,
}: Readonly<{ settings: TeleprompterHighlightSettings }>) {
  const sample = "Ready eyes follow the next word before it arrives.";
  const wordCues = buildTeleprompterWordCues(sample, 1800, 5200, settings);
  const words = sample.split(" ");
  return (
    <Panel className="p-3" variant="raised">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#cc0d55]">Highlight demo</p>
      <p className="mt-3 whitespace-pre-wrap text-lg leading-10">
        {words.map((word, index) => {
          const wordCue = wordCues[index];
          return (
            <span
              className={`teleprompter-word teleprompter-word--${wordCue.state}`}
              data-effect={settings.effectStyle}
              key={`${word}-${String(index)}`}
              style={
                {
                  "--teleprompter-accent": "#cc0d55",
                  "--teleprompter-intensity": String(wordCue.intensity),
                } as CSSProperties
              }
            >
              {word}
              {index < words.length - 1 ? " " : ""}
            </span>
          );
        })}
      </p>
    </Panel>
  );
}

function VoiceSettingsGroup({
  highlightedCommandToken,
  runConfiguration,
  selectedProfile,
  ttsEngines,
  onRunConfigurationChange,
}: Readonly<{
  highlightedCommandToken: string | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const activeKokoroRenderMode = kokoroRenderModeForConfiguration(
    runConfiguration,
    Boolean(selectedProfile),
  );
  return (
    <PanelSection
      commandTargetTokens={["group-voices", "scope-session"]}
      highlightedCommandToken={highlightedCommandToken}
      scope="session"
      title="Voices"
      subtitle="Select the render path for the next run."
    >
      <DiagnosticLine label="Selected profile" value={selectedProfile?.name ?? "Default voice"} />
      <QuickSelect
        label="Narration engine"
        scope="session"
        testId="settings-voices-narration-engine"
        value={kokoroEngineFamilyValue(runConfiguration.ttsEngine)}
        onChange={(value) => {
          onRunConfigurationChange(applyRunEngineSelection(runConfiguration, value, ttsEngines));
        }}
      >
        {engineFamilyOptions(ttsEngines).map((engine) => (
          <option disabled={engine.status !== "ready"} key={engine.id} value={engine.id}>
            {engine.label} · {engine.status}
          </option>
        ))}
      </QuickSelect>
      {isKokoroRenderEngine(runConfiguration.ttsEngine) ? (
        <div className="grid gap-2">
          {KOKORO_RENDER_MODE_OPTIONS.map((option) => (
            <Button
              align="start"
              className="grid p-3"
              key={option.id}
              onClick={() => {
                onRunConfigurationChange(applyKokoroRenderMode(runConfiguration, option.id));
              }}
              selected={option.id === activeKokoroRenderMode}
              variant="mode"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-semibold">{option.label}</span>
                <ScopeBadge scope="session" />
              </span>
              <span className="vs-muted mt-1 block text-xs leading-5">{option.detail}</span>
            </Button>
          ))}
        </div>
      ) : null}
    </PanelSection>
  );
}

function SourceSettingsGroup({
  customSpeechPolicyProfiles,
  highlightedCommandToken,
  isSpeechPolicyPreviewing,
  selectedBookSource,
  selectedPreparedSource,
  sourceMode,
  sourcePolicySavingKey,
  speechPolicyDefinition,
  speechPolicyError,
  speechPolicyOverrides,
  speechPolicyProfile,
  speechPolicyProfiles,
  temporarySourceBehavior,
  temporaryStorageUsage,
  onClearBookSourcePolicy,
  onClearPreparedSourcePolicy,
  onClearSpeechPolicyOverrides,
  onClearTemporarySources,
  onCreateCustomSpeechPolicyProfile,
  onDeleteCustomSpeechPolicyProfile,
  onSaveBookSourcePolicy,
  onSavePreparedSourcePolicy,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
  onTemporarySourceBehaviorChange,
  onUpdateCustomSpeechPolicyProfile,
}: Readonly<{
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  highlightedCommandToken: string | null;
  isSpeechPolicyPreviewing: boolean;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  sourceMode: "book" | "fileUrl" | "text";
  sourcePolicySavingKey: string | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  temporarySourceBehavior: TemporarySourceBehaviorSettings;
  temporaryStorageUsage: TemporaryStorageUsageSummary | null;
  onClearBookSourcePolicy: (sourceId: string) => Promise<void>;
  onClearPreparedSourcePolicy: (sourceId: string) => Promise<void>;
  onClearSpeechPolicyOverrides: () => void;
  onClearTemporarySources?: () => void | Promise<void>;
  onCreateCustomSpeechPolicyProfile: (
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
  onDeleteCustomSpeechPolicyProfile: (profileId: string) => Promise<void>;
  onSaveBookSourcePolicy: (
    sourceId: string,
    request: SourceSpeechPolicyUpdateRequest,
  ) => Promise<void>;
  onSavePreparedSourcePolicy: (
    sourceId: string,
    request: SourceSpeechPolicyUpdateRequest,
  ) => Promise<void>;
  onSpeechPolicyOverridesChange: (overrides: SpeechPolicyOverrides) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onTemporarySourceBehaviorChange: (settings: TemporarySourceBehaviorSettings) => void;
  onUpdateCustomSpeechPolicyProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
}>) {
  let sourceTarget: SourcePolicyTarget | null = null;
  if (sourceMode === "book" && selectedBookSource) {
    sourceTarget = {
      clear: () => onClearBookSourcePolicy(selectedBookSource.id),
      isSaving: sourcePolicySavingKey === `book:${selectedBookSource.id}`,
      label: selectedBookSource.title ?? selectedBookSource.sourceFile,
      lifecycle: bookSourceLifecycleEnvelope(selectedBookSource, {
        isActive: true,
        lastOpenedSurface: "Settings",
      }),
      overrides: selectedBookSource.sourceSpeechPolicyOverrides,
      profile: selectedBookSource.sourceSpeechPolicyProfile,
      save: (request: SourceSpeechPolicyUpdateRequest) =>
        onSaveBookSourcePolicy(selectedBookSource.id, request),
    };
  } else if (selectedPreparedSource) {
    sourceTarget = {
      clear: () => onClearPreparedSourcePolicy(selectedPreparedSource.id),
      isSaving: sourcePolicySavingKey === `prepared:${selectedPreparedSource.id}`,
      label: selectedPreparedSource.title ?? selectedPreparedSource.sourceName,
      lifecycle: preparedSourceLifecycleEnvelope(selectedPreparedSource, {
        isActive: true,
        lastOpenedSurface: "Settings",
      }),
      overrides: selectedPreparedSource.sourceSpeechPolicyOverrides,
      profile: selectedPreparedSource.sourceSpeechPolicyProfile,
      save: (request: SourceSpeechPolicyUpdateRequest) =>
        onSavePreparedSourcePolicy(selectedPreparedSource.id, request),
    };
  }

  return (
    <PanelSection
      commandTargetTokens={[
        "group-sources",
        "field-temporarySourceBehavior",
        "field-projectSpeechPolicy",
        "field-sourceSpeechPolicy",
        "scope-temporarySource",
        "scope-project",
        "scope-source",
      ]}
      highlightedCommandToken={highlightedCommandToken}
      scope="project"
      title="Sources"
      subtitle="Temporary sources, project defaults, session overrides, and selected-source pins use separate scopes."
    >
      <TemporarySourceBehaviorPanel
        highlightedCommandToken={highlightedCommandToken}
        settings={temporarySourceBehavior}
        storageUsage={temporaryStorageUsage}
        onChange={onTemporarySourceBehaviorChange}
        onClearTemporarySources={onClearTemporarySources}
      />
      <SpeechPolicyWizard
        customProfiles={customSpeechPolicyProfiles}
        definition={speechPolicyDefinition}
        error={speechPolicyError}
        isPreviewing={isSpeechPolicyPreviewing}
        overrides={speechPolicyOverrides}
        profile={speechPolicyProfile}
        profiles={speechPolicyProfiles}
        onClearOverrides={onClearSpeechPolicyOverrides}
        onCreateCustomProfile={onCreateCustomSpeechPolicyProfile}
        onDeleteCustomProfile={onDeleteCustomSpeechPolicyProfile}
        onOverridesChange={onSpeechPolicyOverridesChange}
        onProfileChange={onSpeechPolicyProfileChange}
        onUpdateCustomProfile={onUpdateCustomSpeechPolicyProfile}
      />
      <Panel
        className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
        variant="surface"
      >
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Project default reset
            <ScopeBadge scope="project" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Restore the project speech policy default without changing selected-source pins.
          </p>
        </div>
        <Button
          data-confirm="Reset project default"
          data-testid="settings-reset-project-default"
          data-ui-action-surface="Settings"
          disabled={speechPolicyProfile === DEFAULT_SPEECH_POLICY_PROFILE}
          disabledReason={
            speechPolicyProfile === DEFAULT_SPEECH_POLICY_PROFILE
              ? "Project policy already uses the default profile."
              : undefined
          }
          onClick={() => {
            if (
              typeof globalThis.confirm === "function" &&
              !globalThis.confirm(
                "Reset the current project speech policy default? Source pins stay unchanged.",
              )
            ) {
              return;
            }
            onSpeechPolicyProfileChange(DEFAULT_SPEECH_POLICY_PROFILE);
          }}
          variant="secondary"
        >
          Reset project default
        </Button>
      </Panel>
      <details className="rounded-md border p-3 vs-border vs-surface">
        <summary className="cursor-pointer text-sm font-semibold">Advanced policy editor</summary>
        <div className="mt-3">
          <SpeechPolicyControls
            customProfiles={customSpeechPolicyProfiles}
            definition={speechPolicyDefinition}
            error={speechPolicyError}
            isPreviewing={isSpeechPolicyPreviewing}
            overrides={speechPolicyOverrides}
            profile={speechPolicyProfile}
            profiles={speechPolicyProfiles}
            onClearOverrides={onClearSpeechPolicyOverrides}
            onCreateCustomProfile={onCreateCustomSpeechPolicyProfile}
            onDeleteCustomProfile={onDeleteCustomSpeechPolicyProfile}
            onOverridesChange={onSpeechPolicyOverridesChange}
            onProfileChange={onSpeechPolicyProfileChange}
            onUpdateCustomProfile={onUpdateCustomSpeechPolicyProfile}
          />
        </div>
      </details>
      <Panel className="p-3" variant="surface">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Selected source</h4>
          <ScopeBadge scope="source" />
        </div>
        {sourceTarget ? (
          <>
            <p className="vs-muted mb-3 truncate text-xs" title={sourceTarget.label}>
              {sourceTarget.label}
            </p>
            <SourcePolicyPinEditor
              customProfiles={customSpeechPolicyProfiles}
              definition={speechPolicyDefinition}
              disabled={false}
              error={speechPolicyError}
              isSaving={sourceTarget.isSaving}
              profiles={speechPolicyProfiles}
              sourceLifecycle={sourceTarget.lifecycle}
              sourceOverrides={sourceTarget.overrides ?? undefined}
              sourceProfile={sourceTarget.profile ?? undefined}
              onClear={sourceTarget.clear}
              onSave={sourceTarget.save}
            />
          </>
        ) : (
          <p className="vs-muted text-sm leading-6">
            Select a prepared source or book source to set a durable source-level pin.
          </p>
        )}
      </Panel>
    </PanelSection>
  );
}

function TemporarySourceBehaviorPanel({
  highlightedCommandToken,
  settings,
  storageUsage,
  onChange,
  onClearTemporarySources,
}: Readonly<{
  highlightedCommandToken: string | null;
  settings: TemporarySourceBehaviorSettings;
  storageUsage: TemporaryStorageUsageSummary | null;
  onChange: (settings: TemporarySourceBehaviorSettings) => void;
  onClearTemporarySources?: () => void | Promise<void>;
}>) {
  const boundary = temporarySourcePrivacyBoundary();
  const highlighted =
    highlightedCommandToken === "field-temporarySourceBehavior" ||
    highlightedCommandToken === "scope-temporarySource";
  const patchSettings = (patch: Partial<TemporarySourceBehaviorSettings>) => {
    onChange({ ...settings, ...patch });
  };

  return (
    <Panel
      className="grid gap-4 p-3"
      data-settings-command-targets="field-temporarySourceBehavior scope-temporarySource"
      data-testid="settings-temporary-source-behavior"
      highlighted={highlighted}
      variant="surface"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            Temporary source behavior
            <ScopeBadge scope="temporarySource" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Applies to this temporary source until expiry, Discard temporary source, or Keep in
            project. Presets do not promote these choices into project defaults.
          </p>
        </div>
        <StatusChip tone="metadata">
          {TEMPORARY_SOURCE_COPY.terms.expiresAfterInactivity}
        </StatusChip>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Toggle
          checked={settings.returnContextMemory !== "forgetOnClose"}
          data-testid="settings-temporary-remember-session"
          data-ui-action-destructive="false"
          detail="Keeps return position, bookmarks, and progress for temporary sources until they expire or you clear them. Temporary work is not project history."
          label="Remember temporary work for this session"
          onChange={(checked) => {
            patchSettings({ returnContextMemory: checked ? "rememberSurface" : "forgetOnClose" });
          }}
        />
        <TemporarySelect
          detail={
            TEMPORARY_EXPIRY_OPTIONS.find((option) => option.value === settings.expiryDuration)
              ?.detail ?? ""
          }
          label="Expiry duration"
          testId="settings-temporary-expiry"
          value={settings.expiryDuration}
          onChange={(value) => {
            patchSettings({ expiryDuration: value as TemporaryExpiryDuration });
          }}
        >
          {TEMPORARY_EXPIRY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TemporarySelect>
        <TemporarySelect
          detail="Open new temporary sources in the selected surface after creation without adding them to project history."
          label="Default destination after creation"
          testId="settings-temporary-destination"
          value={settings.defaultDestination}
          onChange={(value) => {
            patchSettings({ defaultDestination: value as TemporaryDestination });
          }}
        >
          {TEMPORARY_DESTINATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TemporarySelect>
        <TemporarySelect
          detail={
            TEMPORARY_WEB_EXTRACTION_OPTIONS.find(
              (option) => option.value === settings.webpageExtractionMode,
            )?.detail ?? ""
          }
          destructive={false}
          label="Default temporary webpage extraction"
          testId="settings-temporary-webpage-extraction"
          value={settings.webpageExtractionMode}
          onChange={(value) => {
            patchSettings({ webpageExtractionMode: value as TemporaryWebExtractionMode });
          }}
        >
          {TEMPORARY_WEB_EXTRACTION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TemporarySelect>
        <TemporarySelect
          detail={
            TEMPORARY_RETURN_CONTEXT_OPTIONS.find(
              (option) => option.value === settings.returnContextMemory,
            )?.detail ?? ""
          }
          label="UI memory for temporary return context"
          testId="settings-temporary-return-context"
          value={settings.returnContextMemory}
          onChange={(value) => {
            patchSettings({ returnContextMemory: value as TemporaryReturnContextMemory });
          }}
        >
          {TEMPORARY_RETURN_CONTEXT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </TemporarySelect>
      </div>

      <Panel
        className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto]"
        data-testid="settings-temporary-storage-summary"
        variant="management"
      >
        <div className="grid gap-2">
          <p className="text-sm font-semibold">Temporary storage summary</p>
          <div className="grid gap-2 text-xs sm:grid-cols-4">
            <DiagnosticLine label="Sources" value={String(storageUsage?.temporaryCount ?? 0)} />
            <DiagnosticLine label="Total" value={formatBytes(storageUsage?.totalBytes ?? 0)} />
            <DiagnosticLine label="Audio" value={formatBytes(storageUsage?.audioBytes ?? 0)} />
            <DiagnosticLine label="Expired" value={String(storageUsage?.expiredCount ?? 0)} />
          </div>
          <p className="vs-muted text-xs leading-5">Project sources are unchanged.</p>
        </div>
        <Button
          data-confirm="Clear temporary sources? This deletes temporary content and artifacts. Project sources are unchanged."
          data-testid="settings-clear-temporary-sources"
          data-ui-action-surface="Settings"
          disabled={!onClearTemporarySources || (storageUsage?.temporaryCount ?? 0) === 0}
          disabledReason={
            onClearTemporarySources
              ? "No temporary sources are using storage."
              : "Temporary cleanup is unavailable in this context."
          }
          onClick={() => {
            void onClearTemporarySources?.();
          }}
          variant="secondary"
        >
          Clear temporary sources
        </Button>
      </Panel>

      <div className="grid gap-2 md:grid-cols-3">
        <Toggle
          checked={settings.autoClean}
          data-testid="settings-temporary-auto-clean"
          detail="Expired temporary sources and generated temporary audio are eligible for cleanup without changing project sources."
          label="Auto-clean expired temporary work"
          onChange={(checked) => {
            patchSettings({ autoClean: checked });
          }}
        />
        <Toggle
          checked={settings.askBeforeDiscardingAudio}
          data-testid="settings-temporary-confirm-audio-discard"
          detail="Ask before discarding generated temporary audio from this temporary source."
          label="Ask before discarding generated temporary audio"
          onChange={(checked) => {
            patchSettings({ askBeforeDiscardingAudio: checked });
          }}
        />
        <Toggle
          checked={settings.includeGeneratedAudioOnPromotion}
          data-testid="settings-temporary-promote-audio"
          detail="When enabled, generated temporary audio may be included when the temporary source is kept in project."
          label={TEMPORARY_SOURCE_COPY.terms.promoteWithAudio}
          onChange={(checked) => {
            patchSettings({ includeGeneratedAudioOnPromotion: checked });
          }}
        />
      </div>

      <Panel className="grid gap-2 p-3 text-xs" variant="metadata">
        <p className="font-semibold">Reset and cleanup stay separate</p>
        <p className="vs-muted leading-5">
          Reset UI memory clears preferences stored on this machine for panels and return context.
          It does not delete temporary source content; choose Discard temporary source or Clear
          temporary sources for that.
        </p>
      </Panel>

      <PrivacyBoundaryPanel boundaries={boundary} compact title="Temporary source privacy" />
    </Panel>
  );
}

function TemporarySelect({
  children,
  destructive,
  detail,
  label,
  testId,
  value,
  onChange,
}: Readonly<{
  children: ReactNode;
  destructive?: boolean;
  detail: string;
  label: string;
  testId: string;
  value: string;
  onChange: (value: string) => void;
}>) {
  return (
    <label className="grid gap-1 text-xs font-semibold">
      <span className="flex items-center gap-2">
        {label}
        <ScopeBadge scope="temporarySource" />
      </span>
      <select
        className={`${fieldControlClassName} min-w-0`}
        data-testid={testId}
        data-ui-action-destructive={destructive === undefined ? undefined : String(destructive)}
        onChange={(event) => {
          onChange(event.currentTarget.value);
        }}
        value={value}
      >
        {children}
      </select>
      <span className="vs-muted leading-5">{detail}</span>
    </label>
  );
}

function RuntimeSettingsGroup({
  highlightedCommandToken,
  metrics,
  metricsError,
  profileSourceDiagnostics,
  researchModules,
  runConfiguration,
  ttsEngineError,
  ttsEngines,
  onRunConfigurationChange,
}: Readonly<{
  highlightedCommandToken: string | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const runtimePrivacy = providerRuntimePrivacyBoundary(
    resolveProviderRuntimeCapabilities(runConfiguration.ttsEngine, ttsEngines),
  );
  return (
    <PanelSection
      commandTargetTokens={["group-runtime", "field-runtimeDiagnostics", "scope-machine"]}
      highlightedCommandToken={highlightedCommandToken}
      scope="machine"
      title="Runtime"
      subtitle={
        SETTINGS_FIELD_META.find((field) => field.id === "runtimeDiagnostics")?.description ?? ""
      }
    >
      <DiagnosticLine label="Backend" value={metrics ? "Online" : (metricsError ?? "Pending")} />
      <DiagnosticLine
        label="Diarization"
        value={profileSourceDiagnostics?.mode ?? "Diagnostics pending"}
      />
      <DiagnosticLine
        label="Analysis Python"
        value={profileSourceDiagnostics?.pythonPath ?? "Diagnostics pending"}
      />
      <DiagnosticLine
        label="ffmpeg"
        value={profileSourceDiagnostics?.ffmpegAvailable ? "Available" : "Missing"}
      />
      <TTSEngineDiagnosticsList
        engines={ttsEngines}
        error={ttsEngineError}
        selectedEngine={runConfiguration.ttsEngine}
        onSelectEngine={(engineId) => {
          onRunConfigurationChange(applyRunEngineSelection(runConfiguration, engineId, ttsEngines));
        }}
      />
      <RuntimeCapabilityPanel engines={ttsEngines} selectedEngine={runConfiguration.ttsEngine} />
      <PrivacyBoundaryPanel boundaries={runtimePrivacy} compact title="Runtime data boundary" />
      <ResearchModuleDiagnosticsList modules={researchModules} />
    </PanelSection>
  );
}

function DiagnosticsSettingsGroup({
  adapterDiagnostics,
  adapterDiagnosticsError,
  diagnosticSummary,
  healthReport,
  highlightedCommandToken,
  job,
  metrics,
  metricsError,
  profileSource,
  profileSourceDiagnostics,
  projectStorage,
  projectStorageError,
  runConfiguration,
  selectedBookSource,
  selectedPreparedSource,
  selectedProfile,
  speechPolicyOverrides,
  speechPolicyProfile,
  ttsEngineError,
  ttsEngines,
}: Readonly<{
  adapterDiagnostics: Record<string, AdapterDiagnostics> | null;
  adapterDiagnosticsError: string | null;
  diagnosticSummary: DiagnosticSummary;
  healthReport: HealthReport;
  highlightedCommandToken: string | null;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  runConfiguration: RunConfiguration;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedProfile: VoiceProfile | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
}>) {
  const gpu = metrics?.gpus?.[0];
  return (
    <PanelSection
      commandTargetTokens={["group-diagnostics", "scope-machine"]}
      highlightedCommandToken={highlightedCommandToken}
      scope="machine"
      title="Diagnostics"
      subtitle="Operational health and storage facts."
    >
      <DiagnosticsSummaryPanel summary={diagnosticSummary} report={healthReport} />
      <div className="grid gap-2 sm:grid-cols-2">
        <DiagnosticLine
          label="Backend"
          value={metrics ? `Online · ${metrics.serviceVersion}` : (metricsError ?? "Pending")}
        />
        <DiagnosticLine label="TTS job" value={job?.status ?? "No active job"} />
        <DiagnosticLine
          label="Source analysis"
          value={profileSource?.status ?? "No source queued"}
        />
        <DiagnosticLine
          label="Diarization"
          value={profileSourceDiagnostics?.mode ?? "Diagnostics pending"}
        />
        <DiagnosticLine
          label="GPU"
          value={
            gpu ? `${String(gpu.memoryUsedMiB)}/${String(gpu.memoryTotalMiB)} MiB` : "Unavailable"
          }
        />
        <DiagnosticLine
          label="Checker"
          value={
            job?.pipelineOptions?.asrCheck === false
              ? "Disabled for this run"
              : (job?.voiceCheck.provider ?? "Resolved when a job runs")
          }
        />
        <DiagnosticLine label="Provider readiness" value={healthReport.provider.readiness} />
        <DiagnosticLine label="Source extraction" value={healthReport.sourceExtraction.value} />
      </div>
      {ttsEngineError ? (
        <p className="text-sm leading-6 text-[var(--vs-status-danger)]">{ttsEngineError}</p>
      ) : null}
      <BackendRuntimeDiagnosticsPanel metrics={metrics} metricsError={metricsError} />
      <SourceExtractionDiagnosticsPanel
        healthReport={healthReport}
        selectedBookSource={selectedBookSource}
        selectedPreparedSource={selectedPreparedSource}
      />
      <DiagnosticsFactsPanel
        cards={[
          healthReport.provider,
          healthReport.sourceExtraction,
          healthReport.job,
          healthReport.backend,
          healthReport.storage,
        ]}
      />
      <AdapterDiagnosticsPanel diagnostics={adapterDiagnostics} error={adapterDiagnosticsError} />
      <ProjectStorageSummaryPanel
        job={job}
        profileSource={profileSource}
        projectStorage={projectStorage}
        projectStorageError={projectStorageError}
        selectedProfile={selectedProfile}
      />
      <TTSEngineHealthFacts engines={ttsEngines} />
      <RunPolicyDiagnosticsPanel
        runConfiguration={runConfiguration}
        speechPolicyOverrides={speechPolicyOverrides}
        speechPolicyProfile={speechPolicyProfile}
      />
    </PanelSection>
  );
}

function diagnosticSummaryWithSettingsContext(
  report: HealthReport,
  context: Readonly<{
    runConfiguration: RunConfiguration;
    speechPolicyOverrides: SpeechPolicyOverrides;
    speechPolicyProfile: string;
  }>,
): DiagnosticSummary {
  const json = {
    ...report.diagnosticSummary.json,
    runConfiguration: context.runConfiguration,
    speechPolicy: {
      overrides: context.speechPolicyOverrides,
      profile: context.speechPolicyProfile,
    },
  };
  const text = [
    report.diagnosticSummary.text,
    "Run configuration:",
    `- Engine: ${context.runConfiguration.ttsEngine}`,
    `- Run mode: ${context.runConfiguration.runMode}`,
    `- Performance: ${context.runConfiguration.performanceMode}`,
    `- Pipeline options: ${JSON.stringify(context.runConfiguration.options)}`,
    "Speech policy:",
    `- Profile: ${context.speechPolicyProfile}`,
    `- Overrides JSON: ${JSON.stringify(context.speechPolicyOverrides)}`,
  ].join("\n");
  return {
    generatedAt: report.diagnosticSummary.generatedAt,
    json,
    text,
  };
}

function DiagnosticsSummaryPanel({
  report,
  summary,
}: Readonly<{
  report: HealthReport;
  summary: DiagnosticSummary;
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold">Diagnostic summary</h4>
          <p className="vs-muted mt-1 text-sm leading-6">{report.overall.detail}</p>
        </div>
        <StatusChip tone={report.overall.tone}>{report.overall.value}</StatusChip>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DiagnosticLine label="Can narrate now" value={report.canNarrateNow ? "Yes" : "No"} />
        <DiagnosticLine label="Provider" value={report.provider.readiness} />
        <DiagnosticLine label="Source" value={report.sourceExtraction.value} />
        <DiagnosticLine label="Generated" value={summary.generatedAt} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          data-testid="settings-copy-diagnostic-summary"
          onClick={() => {
            copyDiagnosticSummary(summary);
          }}
          size="sm"
          variant="secondary"
        >
          Copy diagnostic summary
        </Button>
        <Button
          data-testid="settings-download-diagnostics-json"
          onClick={() => {
            downloadDiagnosticSummary(summary);
          }}
          size="sm"
          variant="secondary"
        >
          Download diagnostics JSON
        </Button>
      </div>
    </Panel>
  );
}

function DiagnosticsFactsPanel({
  cards,
}: Readonly<{
  cards: readonly HealthReportCard[];
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <h4 className="text-sm font-semibold">Operational facts</h4>
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((card) => (
          <div className="rounded-md border p-3 vs-border" key={card.label}>
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{card.label}</p>
                <p className="vs-muted mt-1 text-xs leading-5">{card.detail}</p>
              </div>
              <StatusChip className="py-0.5" tone={card.tone}>
                {card.value}
              </StatusChip>
            </div>
            {card.facts.length > 0 ? (
              <dl className="mt-3 grid gap-2">
                {card.facts.map((fact) => (
                  <DiagnosticLine
                    key={`${card.label}-${fact.label}`}
                    label={fact.label}
                    value={fact.value}
                  />
                ))}
              </dl>
            ) : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BackendRuntimeDiagnosticsPanel({
  metrics,
  metricsError,
}: Readonly<{
  metrics: SystemMetrics | null;
  metricsError: string | null;
}>) {
  const gpu = metrics?.gpus?.[0] ?? null;
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <h4 className="text-sm font-semibold">Backend, process, host, and GPU</h4>
      {metricsError ? (
        <p className="text-sm leading-6 text-[var(--vs-status-danger)]">{metricsError}</p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <DiagnosticLine label="Service version" value={metrics?.serviceVersion ?? "Pending"} />
        <DiagnosticLine label="Collected at" value={metrics?.collectedAt ?? "Pending"} />
        <DiagnosticLine label="Process ID" value={String(metrics?.process.pid ?? "n/a")} />
        <DiagnosticLine label="Runtime" value={metrics?.process.runtime ?? "n/a"} />
        <DiagnosticLine label="RSS" value={formatBytes(metrics?.process.rssBytes ?? 0)} />
        <DiagnosticLine label="Working directory" value={metrics?.process.workingDir ?? "n/a"} />
        <DiagnosticLine label="Host" value={metrics?.host.hostname ?? "n/a"} />
        <DiagnosticLine
          label="OS"
          value={metrics ? `${metrics.host.os} · ${metrics.host.kernel}` : "n/a"}
        />
        <DiagnosticLine label="CPU count" value={String(metrics?.host.cpuCount ?? "n/a")} />
        <DiagnosticLine
          label="Load average"
          value={
            metrics
              ? `${metrics.host.loadAvg1.toFixed(2)} / ${metrics.host.loadAvg5.toFixed(2)} / ${metrics.host.loadAvg15.toFixed(2)}`
              : "n/a"
          }
        />
        <DiagnosticLine label="GPU" value={gpu?.name ?? "GPU telemetry unavailable"} />
        <DiagnosticLine
          label="VRAM"
          value={
            gpu
              ? `${gpu.memoryUsedMiB.toLocaleString()}/${gpu.memoryTotalMiB.toLocaleString()} MiB`
              : "n/a"
          }
        />
      </div>
    </Panel>
  );
}

function SourceExtractionDiagnosticsPanel({
  healthReport,
  selectedBookSource,
  selectedPreparedSource,
}: Readonly<{
  healthReport: HealthReport;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
}>) {
  const bookChain = selectedBookSource?.ingestion?.extractorChain ?? [];
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Source extraction</h4>
          <p className="vs-muted mt-1 text-xs leading-5">{healthReport.sourceExtraction.detail}</p>
        </div>
        <StatusChip tone={healthReport.sourceExtraction.tone}>
          {healthReport.sourceExtraction.value}
        </StatusChip>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <DiagnosticLine
          label="Book source"
          value={selectedBookSource?.title ?? selectedBookSource?.sourceFile ?? "None"}
        />
        <DiagnosticLine
          label="Prepared source"
          value={selectedPreparedSource?.title ?? selectedPreparedSource?.sourceName ?? "None"}
        />
        <DiagnosticLine
          label="Readiness state"
          value={
            selectedBookSource?.sourceReadiness?.state ??
            selectedPreparedSource?.sourceReadiness?.state ??
            "n/a"
          }
        />
        <DiagnosticLine
          label="Extractor support"
          value={selectedBookSource?.ingestion?.supportTierLabel ?? "n/a"}
        />
        <DiagnosticLine
          label="Prepared format"
          value={selectedPreparedSource?.sourceFormat ?? selectedPreparedSource?.kind ?? "n/a"}
        />
        <DiagnosticLine
          label="Prepared parser"
          value={selectedPreparedSource?.markdownParseMode ?? "n/a"}
        />
      </div>
      {bookChain.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide vs-muted">Extractor chain</p>
          {bookChain.map((step) => (
            <DiagnosticLine
              key={step.id}
              label={step.label}
              value={extractorStepDiagnosticValue(step)}
            />
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function AdapterDiagnosticsPanel({
  diagnostics,
  error,
}: Readonly<{
  diagnostics: Record<string, AdapterDiagnostics> | null;
  error: string | null;
}>) {
  const entries = Object.values(diagnostics ?? {});
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <h4 className="text-sm font-semibold">Adapter diagnostics</h4>
      {error ? <p className="text-sm leading-6 text-[var(--vs-status-danger)]">{error}</p> : null}
      {entries.length > 0 ? (
        <div className="grid gap-2">
          {entries.map((adapter) => (
            <div className="rounded-md border p-3 vs-border" key={adapter.adapterId}>
              <div className="flex min-w-0 items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold" title={adapter.adapterId}>
                  {adapter.adapterId}
                </p>
                <StatusChip tone={adapter.available ? "success" : "warning"}>
                  {adapter.status}
                </StatusChip>
              </div>
              <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                <DiagnosticLine label="CLI path" value={adapter.cliPath ?? "n/a"} />
                <DiagnosticLine
                  label="Warnings"
                  value={(adapter.warnings ?? []).join(", ") || "None"}
                />
                {Object.entries(adapter.tools ?? {}).map(([tool, status]) => (
                  <DiagnosticLine
                    key={`${adapter.adapterId}-${tool}`}
                    label={tool}
                    value={`${status.status} · ${status.available ? "available" : "missing"}`}
                  />
                ))}
              </dl>
            </div>
          ))}
        </div>
      ) : (
        <p className="vs-muted rounded-md border border-dashed p-3 text-sm vs-border">
          Adapter diagnostics are pending.
        </p>
      )}
    </Panel>
  );
}

function extractorStepDiagnosticValue(step: ExtractorChainStep): string {
  const confidence = step.confidence ? ` · ${String(step.confidence)}` : "";
  return `${step.status}${confidence}`;
}

function RunPolicyDiagnosticsPanel({
  runConfiguration,
  speechPolicyOverrides,
  speechPolicyProfile,
}: Readonly<{
  runConfiguration: RunConfiguration;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <h4 className="text-sm font-semibold">Run configuration and speech policy JSON</h4>
      <details className="rounded-md border p-3 text-xs vs-border vs-surface">
        <summary className="cursor-pointer font-semibold">Active run configuration</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 vs-border">
          {JSON.stringify(runConfiguration, null, 2)}
        </pre>
      </details>
      <details className="rounded-md border p-3 text-xs vs-border vs-surface">
        <summary className="cursor-pointer font-semibold">Speech policy and overrides</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 vs-border">
          {JSON.stringify(
            { overrides: speechPolicyOverrides, profile: speechPolicyProfile },
            null,
            2,
          )}
        </pre>
      </details>
    </Panel>
  );
}

function copyDiagnosticSummary(summary: DiagnosticSummary): void {
  void globalThis.navigator.clipboard.writeText(summary.text);
}

function downloadDiagnosticSummary(summary: DiagnosticSummary): void {
  const blob = new Blob([JSON.stringify(summary.json, null, 2)], {
    type: "application/json",
  });
  const url = globalThis.URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.download = `tts-diagnostics-${summary.generatedAt.replaceAll(/[:.]/g, "-")}.json`;
  anchor.href = url;
  anchor.click();
  globalThis.URL.revokeObjectURL(url);
}

function ProjectStorageSummaryPanel({
  job,
  profileSource,
  projectStorage,
  projectStorageError,
  selectedProfile,
}: Readonly<{
  job: VoiceJob | null;
  profileSource: VoiceProfileSource | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  selectedProfile: VoiceProfile | null;
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Storage</h4>
        <ScopeBadge scope="machine" />
      </div>
      {projectStorageError ? (
        <p className="rounded-md border border-[var(--vs-status-danger-border)] bg-[var(--vs-status-danger-bg)] p-3 text-sm text-[var(--vs-status-danger)]">
          {projectStorageError}
        </p>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        <StorageStat
          label="Generated audio"
          value={formatBytes(projectStorage?.generatedAudioBytes ?? 0)}
        />
        <StorageStat label="Project total" value={formatBytes(projectStorage?.totalBytes ?? 0)} />
        <StorageStat
          label="Book/source data"
          value={formatBytes(
            (projectStorage?.bookSourceBytes ?? 0) + (projectStorage?.preparedSourceBytes ?? 0),
          )}
        />
        <StorageStat label="Jobs" value={String(projectStorage?.jobCount ?? 0)} />
      </div>
      {projectStorage?.downloads && projectStorage.downloads.length > 0 ? (
        <div className="grid gap-2">
          <h4 className="text-sm font-semibold">Audio downloads</h4>
          {projectStorage.downloads.slice(0, 8).map((download) => (
            <a
              className={`flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-sm font-semibold transition ${
                download.available
                  ? "vs-border vs-raised hover:bg-[var(--vs-surface)]"
                  : "pointer-events-none opacity-45 vs-border vs-surface"
              }`}
              download={download.fileName}
              href={backendAssetUrl(download.url)}
              key={`${download.kind}-${download.jobId ?? ""}-${String(download.segment ?? 0)}`}
            >
              <span className="min-w-0 truncate" title={download.label}>
                {download.label}
              </span>
              <span className="vs-muted shrink-0 text-xs">
                {download.bytes ? formatBytes(download.bytes) : "WAV"}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className="vs-muted rounded-md border border-dashed p-3 text-sm vs-border">
          Create audio to unlock direct WAV downloads here.
        </p>
      )}
      <details className="rounded-md border p-3 text-xs vs-border vs-surface">
        <summary className="cursor-pointer font-semibold">Technical storage details</summary>
        <dl className="mt-3 grid gap-2">
          <DiagnosticLine
            label="Selected profile"
            value={selectedProfile?.referencePath ?? "None"}
          />
          <DiagnosticLine
            label="Source analysis"
            value={profileSource?.normalizedAudio ?? "None"}
          />
          <DiagnosticLine label="Completed audio" value={job?.audioPath ?? "None"} />
          {Object.entries(projectStorage?.directories ?? {}).map(([label, path]) => (
            <DiagnosticLine key={label} label={label} value={path} />
          ))}
        </dl>
      </details>
    </Panel>
  );
}

function StorageStat({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <Panel className="p-3" variant="surface">
      <dt className="vs-muted text-xs font-semibold uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </dd>
    </Panel>
  );
}

function TTSEngineDiagnosticsList({
  engines,
  error,
  selectedEngine,
  onSelectEngine,
}: Readonly<{
  engines: TTSEngineDiagnostics[];
  error: string | null;
  selectedEngine: string;
  onSelectEngine: (engineId: string) => void;
}>) {
  if (error) {
    return <p className="text-sm leading-6 text-[var(--vs-status-danger)]">{error}</p>;
  }
  return (
    <Panel className="grid gap-3 p-3 text-xs" variant="surface">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Narration engine
          <ScopeBadge scope="machine" />
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Ready engines can be selected here. Unavailable engines show what needs setup first.
        </p>
      </div>
      <ul className="grid gap-2">
        {engines.map((engine) => (
          <li key={engine.id}>
            <Button
              align="start"
              className="grid w-full gap-2 p-3"
              disabled={engine.status !== "ready"}
              disabledReason={engine.reason ?? engine.setup ?? "Engine is not ready."}
              onClick={() => {
                onSelectEngine(engine.id);
              }}
              selected={selectedEngine === engine.id}
              variant="mode"
            >
              <span className="flex min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-semibold" title={engine.label}>
                  {engine.label}
                </span>
                <StatusChip
                  className="rounded-full py-0.5 text-[0.65rem]"
                  tone={engine.status === "ready" ? "success" : "warning"}
                >
                  {engine.status}
                </StatusChip>
              </span>
              <span className="vs-muted break-words">
                {engine.supportsSSML ? "SSML" : "plain text"} ·{" "}
                {formatProviderLanguageSummary(engine)} ·{" "}
                {engine.estimatedVram ?? (engine.local ? "local" : "remote")}
              </span>
              {engine.reason || engine.setup ? (
                <span className="vs-muted break-words">{engine.reason ?? engine.setup}</span>
              ) : null}
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TTSEngineHealthFacts({ engines }: Readonly<{ engines: TTSEngineDiagnostics[] }>) {
  if (engines.length === 0) {
    return null;
  }
  return (
    <Panel className="grid gap-2 p-3 text-xs" variant="surface">
      <h4 className="text-sm font-semibold">Engine health</h4>
      {engines.map((engine) => (
        <DiagnosticLine
          key={engine.id}
          label={engine.label}
          value={`${engine.status} · ${engine.reason ?? engine.setup ?? engine.modelCache ?? formatProviderLanguageSummary(engine)}`}
        />
      ))}
    </Panel>
  );
}

function RuntimeCapabilityPanel({
  engines,
  selectedEngine,
}: Readonly<{
  engines: TTSEngineDiagnostics[];
  selectedEngine: string;
}>) {
  const runtime = resolveProviderRuntimeCapabilities(selectedEngine, engines);
  const visibleCapabilities: ProviderCapabilityKey[] = [
    "tts",
    "voicePreview",
    "voiceCloning",
    "streaming",
    "wordTiming",
    "ssml",
    "cancelJob",
    "retryJob",
    "abComparison",
    "mockTts",
  ];
  const missing = missingProviderCapabilities(runtime.capabilities).filter(
    (capability) => capability !== "mockTts" && capability !== "localOnly",
  );
  const fallback = missing[0]
    ? capabilityRecommendedFallback(missing[0])
    : "Current provider supports the reviewed local workflow.";
  return (
    <Panel
      className="grid gap-3 p-3 text-xs"
      data-testid="settings-runtime-capability-panel"
      variant="surface"
    >
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Runtime capabilities
          <ScopeBadge scope="machine" />
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          {runtime.providerLabel} is the active provider for provider-gated controls.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {visibleCapabilities.map((capability) => (
          <CapabilityBadge
            available={runtime.capabilities[capability]}
            capability={capability}
            key={capability}
          />
        ))}
      </div>
      <DiagnosticLine
        label="Available features"
        value={PROVIDER_CAPABILITY_KEYS.filter((capability) => runtime.capabilities[capability])
          .map((capability) => capabilityLabel(capability))
          .join(", ")}
      />
      <DiagnosticLine
        label="Missing features"
        value={
          missing.length > 0
            ? missing.map((capability) => capabilityLabel(capability)).join(", ")
            : "None for current review path"
        }
      />
      <DiagnosticLine label="Recommended fallback" value={fallback} />
    </Panel>
  );
}

function ResearchModuleDiagnosticsList({
  modules,
}: Readonly<{ modules: ResearchModuleDiagnostics[] }>) {
  if (modules.length === 0) {
    return null;
  }
  return (
    <Panel className="grid gap-3 p-3 text-xs" variant="surface">
      <div>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          Research modules
          <ScopeBadge scope="machine" />
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">
          Optional cloned upstreams live outside the app source and are only used for profile
          artifact builds.
        </p>
      </div>
      <ul className="grid gap-2">
        {modules.map((module) => (
          <Panel as="li" className="grid gap-1 p-3" key={module.id} variant="raised">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="truncate font-semibold" title={module.label}>
                {module.label}
              </span>
              <StatusChip
                className="rounded-full py-0.5 text-[0.65rem]"
                tone={module.status === "ready" ? "success" : "warning"}
              >
                {module.status}
              </StatusChip>
            </span>
            <span className="vs-muted break-words">{module.reason ?? module.setup}</span>
            {module.setupCommand ? (
              <code className="truncate rounded bg-[var(--vs-raised)] px-2 py-1 font-mono text-[11px]">
                {module.setupCommand}
              </code>
            ) : null}
            <code className="truncate rounded bg-[var(--vs-raised)] px-2 py-1 font-mono text-[11px]">
              {module.localPath}
            </code>
          </Panel>
        ))}
      </ul>
    </Panel>
  );
}

function PanelShell({
  busy = false,
  children,
  label,
  onClose,
  title,
}: Readonly<{
  busy?: boolean;
  children: ReactNode;
  label: string;
  onClose: () => void;
  title: string;
}>) {
  const panelRef = useRef<HTMLElement | null>(null);
  useReaderModalLifecycle(panelRef, { closeOnEscape: true, onClose });
  const overlayAttributes = overlayDataAttributes("settings-drawer", "settings-drawer");

  return (
    <Drawer
      busy={busy}
      label={label}
      metadata={[{ label: "Groups", value: "Run, Reader, Voices, Sources, Runtime, Diagnostics" }]}
      onClose={onClose}
      overlayOwner={overlayAttributes["data-overlay-owner"]}
      overlayZone={overlayAttributes["data-overlay-zone"]}
      ref={panelRef}
      scopeTitle="Session, Temporary source, Source, Project, Machine"
      title={title}
    >
      {children}
    </Drawer>
  );
}
