import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
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
import { accessibilityPresetById, useLiveStatus } from "../accessibility";
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
import { PrivacyBoundaryPanel, providerRuntimePrivacyBoundary } from "../privacy";
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
import {
  telepromptTheatrePreset,
  type TelepromptTheatreSettings,
} from "../teleprompt/telepromptTheatreSettings";
import { READ_ALONG_PREFERENCE_LABELS, type ReadAlongPreferences } from "../readalong";
import {
  bookSourceLifecycleEnvelope,
  preparedSourceLifecycleEnvelope,
} from "../source-lifecycle/sourceSelectors";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import { VOICE_STUDIO_THEMES } from "../../theme";
import type {
  BookSource,
  CustomSpeechPolicyProfile,
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
  SETTINGS_SCOPE_META,
  settingsGroupMeta,
  settingsGroupsForLayer,
  settingsLayerForCommandTarget,
  settingsLayerMeta,
  settingsScopeAppliesTo,
  type SettingsCommandTarget,
  type SettingsGroupId,
  type SettingsLayerId,
  type SettingsScope,
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
  ERGONOMIC_CONTEXT_PANEL_LABELS,
  ERGONOMIC_PRESETS,
  ERGONOMIC_PREVIEW_BEHAVIOR_LABELS,
  ERGONOMIC_TRANSPORT_DENSITY_LABELS,
  applyErgonomicPresetDefaults,
  ergonomicPresetById,
  type ErgonomicPreset,
  type ErgonomicPresetId,
} from "./ergonomicPresets";

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

export function SettingsPanel({
  canSubmit,
  commandTarget,
  customSpeechPolicyProfiles,
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
  sourcePolicySavingKey,
  speechPolicyDefinition,
  speechPolicyError,
  speechPolicyOverrides,
  speechPolicyProfile,
  speechPolicyProfiles,
  shortcutPreferences,
  telepromptTheatreSettings,
  teleprompterSettings,
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
  onThemeChange,
  onUiMemoryExportPreferences,
  onUiMemoryImportPreferences,
  onUiMemoryPreferenceChange,
  onUiMemoryReset,
  onUpdateCustomSpeechPolicyProfile,
}: Readonly<{
  canSubmit: boolean;
  commandTarget?: SettingsCommandTarget | null;
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
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
  sourcePolicySavingKey: string | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  shortcutPreferences: ShortcutPreferences;
  telepromptTheatreSettings: TelepromptTheatreSettings;
  teleprompterSettings: TeleprompterHighlightSettings;
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
    <PanelShell label="Settings" title="Studio Settings" onClose={onClose}>
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
          <Panel as="nav" className="grid content-start gap-2 p-2" variant="surface">
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
            <Panel className="mb-4 grid gap-3 p-4" variant="surface">
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
                onClearBookSourcePolicy={onClearBookSourcePolicy}
                onClearPreparedSourcePolicy={onClearPreparedSourcePolicy}
                onClearSpeechPolicyOverrides={onClearSpeechPolicyOverrides}
                onCreateCustomSpeechPolicyProfile={onCreateCustomSpeechPolicyProfile}
                onDeleteCustomSpeechPolicyProfile={onDeleteCustomSpeechPolicyProfile}
                onSaveBookSourcePolicy={onSaveBookSourcePolicy}
                onSavePreparedSourcePolicy={onSavePreparedSourcePolicy}
                onSpeechPolicyOverridesChange={onSpeechPolicyOverridesChange}
                onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
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
                highlightedCommandToken={highlightedCommandToken}
                job={job}
                metrics={metrics}
                metricsError={metricsError}
                profileSource={profileSource}
                profileSourceDiagnostics={profileSourceDiagnostics}
                projectStorage={projectStorage}
                projectStorageError={projectStorageError}
                selectedProfile={selectedProfile}
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
    <Panel className="grid gap-3 p-4" variant="raised">
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
        "field-previewSample",
        "field-ergonomicPresets",
        "field-readerPreferences",
        "field-readAlongPreferences",
        "field-telepromptTheatre",
        "scope-session",
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
      variant="raised"
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
      <Panel className="grid gap-2 p-3" variant="surface">
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
    <div className="grid gap-1 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs vs-border">
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
  const policyAlreadyActive = speechPolicyProfile === preset.speechPolicyProfile;
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
    if (!confirmErgonomicPolicyChange(preset, policyLabel)) {
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
      variant="surface"
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
        <div
          className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-3 vs-border"
          data-testid="ergonomic-preset-preview"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h5 className="text-sm font-semibold">{preset.label}</h5>
            <span className="vs-muted text-xs">{getRunModePreset(preset.runMode).label}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            <ErgonomicPreviewRow
              label="Reader display"
              scope="machine"
              value={accessibilityPresetById(preset.readerDisplayPreset).label}
            />
            <ErgonomicPreviewRow
              label="Highlight"
              scope="machine"
              value={`${READ_ALONG_PREFERENCE_LABELS.granularity[preset.readAlong.highlightGranularity]} / ${READ_ALONG_PREFERENCE_LABELS.style[preset.readAlong.highlightStyle]}`}
            />
            <ErgonomicPreviewRow
              label="Scroll follow"
              scope="machine"
              value={READ_ALONG_PREFERENCE_LABELS.scrollFollow[preset.readAlong.scrollFollow]}
            />
            <ErgonomicPreviewRow
              label="Sync strictness"
              scope="machine"
              value={READ_ALONG_PREFERENCE_LABELS.syncStrictness[preset.readAlong.syncStrictness]}
            />
            <ErgonomicPreviewRow
              label="Transport"
              scope="session"
              value={ERGONOMIC_TRANSPORT_DENSITY_LABELS[preset.transportDensity]}
            />
            <ErgonomicPreviewRow
              label="Context panel"
              scope="session"
              value={ERGONOMIC_CONTEXT_PANEL_LABELS[preset.contextPanelDefault]}
            />
            <ErgonomicPreviewRow
              label="Teleprompt Theatre"
              scope="machine"
              value={telepromptTheatrePreset(preset.telepromptTheatrePreset).label}
            />
            <ErgonomicPreviewRow
              label="Preview player"
              scope="session"
              value={ERGONOMIC_PREVIEW_BEHAVIOR_LABELS[preset.previewPlayerBehavior]}
            />
            <ErgonomicPreviewRow
              label="Segment boundary"
              scope="machine"
              value={segmentBoundaryPreview(preset)}
            />
            <ErgonomicPreviewRow
              label="Speech policy"
              scope="project"
              value={`${policyLabel} (confirm)`}
            />
          </div>
        </div>
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
          <Panel className="grid gap-1 px-3 py-2 text-xs" variant="raised">
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

function ErgonomicPreviewRow({
  label,
  scope,
  value,
}: Readonly<{ label: string; scope: SettingsScope; value: string }>) {
  return (
    <div className="min-w-0 rounded-md border bg-[var(--vs-surface)] px-3 py-2 vs-border">
      <div className="flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] vs-muted">
        {label}
        <ScopeBadge scope={scope} />
      </div>
      <p className="mt-1 truncate text-sm font-semibold" title={value}>
        {value}
      </p>
    </div>
  );
}

function speechPolicyProfileLabel(profile: string, options: SpeechPolicyProfile[]): string {
  return options.find((option) => option.name === profile)?.label ?? profile;
}

function confirmErgonomicPolicyChange(preset: ErgonomicPreset, policyLabel: string): boolean {
  if (typeof globalThis.confirm !== "function") {
    return true;
  }
  return globalThis.confirm(
    `Apply ${policyLabel} as the project speech policy for ${preset.label}? Source-level pins and overrides stay unchanged.`,
  );
}

function segmentBoundaryPreview(preset: ErgonomicPreset): string {
  const boundary = preset.readAlong.segmentBoundary;
  const parts = [
    boundary.autoAdvance ? "auto advance" : "manual advance",
    boundary.pauseAtSegmentBoundary ? "pause at boundary" : "no boundary pause",
  ];
  if (boundary.flashSegment) {
    parts.push("flash segment");
  }
  if (boundary.fadePreviousPhrase) {
    parts.push("fade previous");
  }
  return parts.join(", ");
}

function ScopeLegend() {
  return (
    <fieldset className="grid gap-2 text-xs sm:grid-cols-2">
      <legend className="sr-only">Settings applies-to scopes</legend>
      {(["session", "source", "project", "machine"] as const).map((scope) => (
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
        <span className="vs-muted text-xs">Saved locally</span>
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
  onClearBookSourcePolicy,
  onClearPreparedSourcePolicy,
  onClearSpeechPolicyOverrides,
  onCreateCustomSpeechPolicyProfile,
  onDeleteCustomSpeechPolicyProfile,
  onSaveBookSourcePolicy,
  onSavePreparedSourcePolicy,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
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
  onClearBookSourcePolicy: (sourceId: string) => Promise<void>;
  onClearPreparedSourcePolicy: (sourceId: string) => Promise<void>;
  onClearSpeechPolicyOverrides: () => void;
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
        "field-projectSpeechPolicy",
        "field-sourceSpeechPolicy",
        "scope-project",
        "scope-source",
      ]}
      highlightedCommandToken={highlightedCommandToken}
      scope="project"
      title="Sources"
      subtitle="Project defaults, session overrides, and selected-source pins use separate scopes."
    >
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
  highlightedCommandToken,
  job,
  metrics,
  metricsError,
  profileSource,
  profileSourceDiagnostics,
  projectStorage,
  projectStorageError,
  selectedProfile,
  ttsEngineError,
  ttsEngines,
}: Readonly<{
  highlightedCommandToken: string | null;
  job: VoiceJob | null;
  metrics: SystemMetrics | null;
  metricsError: string | null;
  profileSource: VoiceProfileSource | null;
  profileSourceDiagnostics: VoiceProfileSourceDiagnostics | null;
  projectStorage: ProjectStorageSummary | null;
  projectStorageError: string | null;
  selectedProfile: VoiceProfile | null;
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
      </div>
      {ttsEngineError ? (
        <p className="text-sm leading-6 text-[var(--vs-status-danger)]">{ttsEngineError}</p>
      ) : null}
      <ProjectStorageSummaryPanel
        job={job}
        profileSource={profileSource}
        projectStorage={projectStorage}
        projectStorageError={projectStorageError}
        selectedProfile={selectedProfile}
      />
      <TTSEngineHealthFacts engines={ttsEngines} />
    </PanelSection>
  );
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
          value={`${engine.status} · ${engine.reason ?? engine.setup ?? formatProviderLanguageSummary(engine)}`}
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
  children,
  label,
  onClose,
  title,
}: Readonly<{
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
      label={label}
      metadata={[{ label: "Groups", value: "Run, Reader, Voices, Sources, Runtime, Diagnostics" }]}
      onClose={onClose}
      overlayOwner={overlayAttributes["data-overlay-owner"]}
      overlayZone={overlayAttributes["data-overlay-zone"]}
      ref={panelRef}
      scopeTitle="Session, Source, Project, Machine"
      title={title}
    >
      {children}
    </Drawer>
  );
}
