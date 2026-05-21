import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { backendAssetUrl } from "../../api";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { Button, Drawer, Panel, StatusChip, Toggle, fieldControlClassName } from "../../design";
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
import {
  SpeechPolicyControls,
  SourcePolicyPinEditor,
  resolveSpeechPolicyProfileOptions,
} from "../policy";
import type { UiMemoryState } from "../preferences";
import {
  buildTeleprompterWordCues,
  type TeleprompterEffectStyle,
  type TeleprompterHighlightSettings,
} from "../../teleprompter";
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
  SETTINGS_GROUPS,
  SETTINGS_SCOPE_META,
  settingsGroupMeta,
  settingsScopeAppliesTo,
  type SettingsCommandTarget,
  type SettingsGroupId,
  type SettingsScope,
} from "./model";
import { ScopeBadge } from "./ScopeBadge";

const COMMON_PIPELINE_OPTIONS: (keyof PipelineOptions)[] = [
  "textPreprocess",
  "voiceClone",
  "arrivalPlayback",
];

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
  overrides?: SpeechPolicyOverrides | null;
  profile?: string | null;
  save: (request: SourceSpeechPolicyUpdateRequest) => Promise<void>;
}

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
  onPrepareProfileTarget,
  onReaderAccessibilitySettingsChange,
  onRememberLayoutChange,
  onResetUiMemory,
  onRunConfigurationChange,
  onSaveBookSourcePolicy,
  onSavePreparedSourcePolicy,
  onSpeechPolicyOverridesChange,
  onSpeechPolicyProfileChange,
  onSubmit,
  onTeleprompterSettingsChange,
  onThemeChange,
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
  researchModules: ResearchModuleDiagnostics[];
  runConfiguration: RunConfiguration;
  selectedBookSource: BookSource | null;
  selectedPreparedSource: PreparedSource | null;
  selectedProfile: VoiceProfile | null;
  sourceMode: "book" | "fileUrl" | "text";
  sourcePolicySavingKey: string | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyError: string | null;
  speechPolicyOverrides: SpeechPolicyOverrides;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
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
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onRememberLayoutChange: (rememberLayout: boolean) => void;
  onResetUiMemory: () => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
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
  onSubmit: () => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
  onUpdateCustomSpeechPolicyProfile: (
    profileId: string,
    name: string,
    settings: SpeechPolicySettings,
    baseProfile: string,
  ) => Promise<void>;
}>) {
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>("run");
  const highlightedCommandToken = commandTarget ? settingsCommandTargetToken(commandTarget) : null;

  useEffect(() => {
    if (!commandTarget) {
      return;
    }
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
  return (
    <PanelShell label="Settings" title="Studio Settings" onClose={onClose}>
      <QuickSettings
        customProfiles={customSpeechPolicyProfiles}
        definition={speechPolicyDefinition}
        readerAccessibilitySettings={readerAccessibilitySettings}
        runConfiguration={runConfiguration}
        speechPolicyProfile={speechPolicyProfile}
        speechPolicyProfiles={speechPolicyProfiles}
        themeName={themeName}
        ttsEngines={ttsEngines}
        onReaderAccessibilitySettingsChange={onReaderAccessibilitySettingsChange}
        onRunConfigurationChange={onRunConfigurationChange}
        onSpeechPolicyProfileChange={onSpeechPolicyProfileChange}
        onThemeChange={onThemeChange}
      />

      <div className="mt-5 grid min-h-0 gap-4 lg:grid-cols-[210px_minmax(0,1fr)]">
        <Panel as="nav" className="grid content-start gap-2 p-2" variant="surface">
          {SETTINGS_GROUPS.map((group) => (
            <Button
              align="start"
              className="grid gap-1 px-3 py-2"
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
            </div>
            <ScopeLegend />
          </Panel>

          {activeGroup === "run" ? (
            <RunSettingsGroup
              canSubmit={canSubmit}
              highlightedCommandToken={highlightedCommandToken}
              job={job}
              runConfiguration={runConfiguration}
              onRunConfigurationChange={onRunConfigurationChange}
              onSubmit={onSubmit}
            />
          ) : null}
          {activeGroup === "reader" ? (
            <ReaderSettingsGroup
              highlightedCommandToken={highlightedCommandToken}
              readerAccessibilitySettings={readerAccessibilitySettings}
              runConfiguration={runConfiguration}
              teleprompterSettings={teleprompterSettings}
              themeName={themeName}
              uiMemory={uiMemory}
              onReaderAccessibilitySettingsChange={onReaderAccessibilitySettingsChange}
              onRememberLayoutChange={onRememberLayoutChange}
              onResetUiMemory={onResetUiMemory}
              onTeleprompterSettingsChange={onTeleprompterSettingsChange}
              onThemeChange={onThemeChange}
            />
          ) : null}
          {activeGroup === "voices" ? (
            <VoiceSettingsGroup
              highlightedCommandToken={highlightedCommandToken}
              runConfiguration={runConfiguration}
              selectedProfile={selectedProfile}
              ttsEngineError={ttsEngineError}
              ttsEngines={ttsEngines}
              onPrepareProfileTarget={onPrepareProfileTarget}
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
    </PanelShell>
  );
}

function QuickSettings({
  customProfiles,
  definition,
  readerAccessibilitySettings,
  runConfiguration,
  speechPolicyProfile,
  speechPolicyProfiles,
  themeName,
  ttsEngines,
  onReaderAccessibilitySettingsChange,
  onRunConfigurationChange,
  onSpeechPolicyProfileChange,
  onThemeChange,
}: Readonly<{
  customProfiles: CustomSpeechPolicyProfile[];
  definition: SpeechPolicyDefinition;
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  runConfiguration: RunConfiguration;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  themeName: ThemeName;
  ttsEngines: TTSEngineDiagnostics[];
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const profileOptions = resolveSpeechPolicyProfileOptions(definition, speechPolicyProfiles);
  return (
    <Panel className="grid gap-3 p-4" variant="raised">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="vs-muted text-[0.65rem] font-semibold uppercase tracking-[0.16em]">
            Quick settings
          </p>
          <h3 className="mt-1 text-base font-semibold">Common changes without the long scroll</h3>
        </div>
        <ScopeBadge scope="session" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <QuickSelect
          label="Run mode"
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
          label="Performance"
          scope="session"
          value={runConfiguration.performanceMode}
          onChange={(value) => {
            onRunConfigurationChange({
              ...runConfiguration,
              performanceMode: value as PerformanceMode,
            });
          }}
        >
          {(["balanced", "throughput", "quality"] as const).map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </QuickSelect>
        <QuickSelect
          label="Reader scale"
          scope="machine"
          value={readerAccessibilitySettings.textScale}
          onChange={(value) => {
            onReaderAccessibilitySettingsChange({
              ...readerAccessibilitySettings,
              textScale: value as ReaderAccessibilitySettings["textScale"],
            });
          }}
        >
          {(["compact", "comfortable", "large", "giant"] as const).map((scale) => (
            <option key={scale} value={scale}>
              {scale}
            </option>
          ))}
        </QuickSelect>
        <QuickSelect
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
          label="Project policy"
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
          label="Engine"
          scope="session"
          value={kokoroEngineFamilyValue(runConfiguration.ttsEngine)}
          onChange={(value) => {
            onRunConfigurationChange(applyEngineSelection(runConfiguration, value, ttsEngines));
          }}
        >
          {engineFamilyOptions(ttsEngines).map((engine) => (
            <option disabled={engine.status !== "ready"} key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </QuickSelect>
      </div>
    </Panel>
  );
}

function QuickSelect({
  children,
  label,
  scope,
  value,
  onChange,
}: Readonly<{
  children: ReactNode;
  label: string;
  scope: SettingsScope;
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
  highlightedCommandToken,
  job,
  runConfiguration,
  onRunConfigurationChange,
  onSubmit,
}: Readonly<{
  canSubmit: boolean;
  highlightedCommandToken: string | null;
  job: VoiceJob | null;
  runConfiguration: RunConfiguration;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
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
        {(["balanced", "throughput", "quality"] as const).map((mode) => (
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
      <details className="rounded-md border p-3 vs-border vs-surface">
        <summary className="cursor-pointer text-sm font-semibold">Advanced pipeline checks</summary>
        <div className="mt-3">
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
          label={PIPELINE_OPTION_LABELS[key].label}
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
  runConfiguration,
  teleprompterSettings,
  themeName,
  uiMemory,
  onReaderAccessibilitySettingsChange,
  onRememberLayoutChange,
  onResetUiMemory,
  onTeleprompterSettingsChange,
  onThemeChange,
}: Readonly<{
  highlightedCommandToken: string | null;
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  runConfiguration: RunConfiguration;
  teleprompterSettings: TeleprompterHighlightSettings;
  themeName: ThemeName;
  uiMemory: UiMemoryState;
  onReaderAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onRememberLayoutChange: (rememberLayout: boolean) => void;
  onResetUiMemory: () => void;
  onTeleprompterSettingsChange: (settings: TeleprompterHighlightSettings) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  return (
    <PanelSection
      commandTargetTokens={[
        "group-reader",
        "field-readerPreferences",
        "field-uiMemory",
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
      <ThemeSettingsControls themeName={themeName} onThemeChange={onThemeChange} />
      <UiMemorySettingsControls
        rememberLayout={uiMemory.rememberLayout}
        onRememberLayoutChange={onRememberLayoutChange}
        onResetUiMemory={onResetUiMemory}
      />
      <TeleprompterSettingsControls
        settings={teleprompterSettings}
        onChange={onTeleprompterSettingsChange}
      />
    </PanelSection>
  );
}

function UiMemorySettingsControls({
  rememberLayout,
  onRememberLayoutChange,
  onResetUiMemory,
}: Readonly<{
  rememberLayout: boolean;
  onRememberLayoutChange: (rememberLayout: boolean) => void;
  onResetUiMemory: () => void;
}>) {
  return (
    <Panel className="grid gap-3 p-3" variant="surface">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold">
            UI memory
            <ScopeBadge scope="machine" />
          </h4>
          <p className="vs-muted mt-1 text-xs leading-5">
            Remember presentation-only workspace and cinema layout on this machine.
          </p>
        </div>
        <Toggle
          checked={rememberLayout}
          className="text-xs"
          label="Remember my layout"
          onChange={onRememberLayoutChange}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs vs-border">
        <span className="vs-muted">Reset returns Workspace and Cinema to documented defaults.</span>
        <Button onClick={onResetUiMemory} size="sm" variant="secondary">
          Reset UI memory
        </Button>
      </div>
    </Panel>
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
  ttsEngineError,
  ttsEngines,
  onPrepareProfileTarget,
  onRunConfigurationChange,
}: Readonly<{
  highlightedCommandToken: string | null;
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  ttsEngineError: string | null;
  ttsEngines: TTSEngineDiagnostics[];
  onPrepareProfileTarget: (profileId: string, targetId: string) => Promise<void>;
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
        value={kokoroEngineFamilyValue(runConfiguration.ttsEngine)}
        onChange={(value) => {
          onRunConfigurationChange(applyEngineSelection(runConfiguration, value, ttsEngines));
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
      {selectedProfile && activeKokoroRenderMode === "kokoro-embed" ? (
        <Button
          onClick={() => {
            void onPrepareProfileTarget(selectedProfile.id, "kokoro-embed");
          }}
          size="sm"
          variant="soft"
        >
          Prepare selected profile target
        </Button>
      ) : null}
      <TTSEngineDiagnosticsList
        engines={ttsEngines}
        error={ttsEngineError}
        selectedEngine={runConfiguration.ttsEngine}
        onSelectEngine={(engineId) => {
          onRunConfigurationChange(applyEngineSelection(runConfiguration, engineId, ttsEngines));
        }}
      />
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
          onRunConfigurationChange(applyEngineSelection(runConfiguration, engineId, ttsEngines));
        }}
      />
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
      {ttsEngineError ? <p className="text-sm leading-6 text-red-700">{ttsEngineError}</p> : null}
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
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
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
    return <p className="text-sm leading-6 text-red-700">{error}</p>;
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

  return (
    <Drawer
      label={label}
      metadata={[{ label: "Groups", value: "Run, Reader, Voices, Sources, Runtime, Diagnostics" }]}
      onClose={onClose}
      ref={panelRef}
      scopeTitle="Session, Source, Project, Machine"
      title={title}
    >
      {children}
    </Drawer>
  );
}

function PanelSection({
  children,
  commandTargetTokens,
  highlightedCommandToken,
  scope,
  subtitle,
  title,
}: Readonly<{
  children: ReactNode;
  commandTargetTokens: string[];
  highlightedCommandToken: string | null;
  scope: SettingsScope;
  subtitle: string;
  title: string;
}>) {
  const isHighlighted = highlightedCommandToken
    ? commandTargetTokens.includes(highlightedCommandToken)
    : false;
  return (
    <Panel
      className="grid gap-3 p-4"
      data-settings-command-targets={commandTargetTokens.join(" ")}
      highlighted={isHighlighted}
      variant="raised"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="vs-muted mt-1 text-sm leading-6">{subtitle}</p>
        </div>
        <AppliesToScope scope={scope} />
      </div>
      {children}
    </Panel>
  );
}

function AppliesToScope({ scope }: Readonly<{ scope: SettingsScope }>) {
  return (
    <StatusChip className="gap-2" tone="neutral">
      <span className="vs-muted">Applies to</span>
      <ScopeBadge scope={scope} />
    </StatusChip>
  );
}

function settingsCommandTargetToken(target: SettingsCommandTarget): string {
  if (target.fieldId) {
    return `field-${target.fieldId}`;
  }
  if (target.scope) {
    return `scope-${target.scope}`;
  }
  return `group-${target.groupId}`;
}

function findSettingsCommandTargetElement(token: string): HTMLElement | null {
  const elements = document.querySelectorAll<HTMLElement>("[data-settings-command-targets]");
  for (const element of elements) {
    if (element.dataset.settingsCommandTargets?.split(" ").includes(token)) {
      return element;
    }
  }
  return null;
}

function DiagnosticLine({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="vs-muted">{label}</dt>
      <dd className="max-w-[65%] break-words text-right font-medium">{value}</dd>
    </div>
  );
}

function applyEngineSelection(
  runConfiguration: RunConfiguration,
  engineId: string,
  engines: TTSEngineDiagnostics[],
): RunConfiguration {
  const selectedEngine = engines.find((item) => item.id === engineId);
  const firstVoice = selectedEngine?.voices?.[0]?.id;
  if (engineId === "kokoro") {
    return applyKokoroRenderMode(runConfiguration, "voicepack");
  }
  return {
    ...runConfiguration,
    engineOptions:
      engineId === "supertonic-3"
        ? {
            ...runConfiguration.engineOptions,
            lang: runConfiguration.engineOptions.lang ?? "na",
            voiceStyle: runConfiguration.engineOptions.voiceStyle ?? firstVoice ?? "M1",
          }
        : {},
    ttsEngine: engineId,
  };
}

function engineFamilyOptions(engines: TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  const source = engines.length > 0 ? engines : fallbackTTSEngines();
  return source.filter((engine) => engine.id !== "kokoro-clone" && engine.id !== "kokoro-embed");
}

function fallbackTTSEngines(): TTSEngineDiagnostics[] {
  return [
    {
      default: false,
      experimental: false,
      id: "auto",
      label: "Auto",
      local: true,
      status: "ready",
      supportsReference: true,
      supportsSSML: false,
      supportsSwedish: true,
      supportsVoice: true,
    },
  ];
}

function formatProviderLanguageSummary(engine: TTSEngineDiagnostics): string {
  const count = engine.languages?.length ?? 0;
  if (count > 0) {
    return `${count.toLocaleString()} languages`;
  }
  return engine.supportsSwedish ? "Swedish" : "language auto";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
