import { Button, Panel, StatusChip, Toggle, fieldControlClassName } from "../../design";
import {
  KOKORO_RENDER_MODE_OPTIONS,
  applyKokoroRenderMode,
  describePerformanceMode,
  getRunModePreset,
  isKokoroRenderEngine,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  type RunConfiguration,
} from "../../runConfig";
import { speechPolicyProfileDisplayName, speechPolicyProfileLabel } from "../../speechPolicy";
import type {
  CustomSpeechPolicyProfile,
  PipelineOptions,
  SpeechPolicyDefinition,
  SpeechPolicyProfile,
  TTSEngineDiagnostics,
  VoiceProfile,
} from "../../types";
import { resolveSpeechPolicyProfileOptions } from "../policy";
import {
  providerCapabilityDataAttributes,
  providerCapabilityGate,
  resolveProviderRuntimeCapabilities,
  type ProviderCapabilityKey,
} from "../provider-capabilities";
import { ScopeBadge } from "../settings/ScopeBadge";
import {
  RUN_CONFIGURATION_VOICE_CHOICES,
  RUN_CONFIGURATION_WIZARD_STEPS,
  applyRunEngineSelection,
  applyRunIntent,
  applyVoiceChoice,
  buildRunEngineOptions,
  kokoroRenderLabel,
  runConfigurationSummary,
  runIntentOptions,
  voiceChoiceForConfiguration,
} from "./runConfigSteps";

const STRUCTURED_PIPELINE_KEYS: (keyof PipelineOptions)[] = [
  "textPreprocess",
  "arrivalPlayback",
  "asrCheck",
  "autoRetry",
  "qualityReport",
];

const STRUCTURED_PIPELINE_LABELS: Record<keyof PipelineOptions, { label: string; detail: string }> =
  {
    arrivalPlayback: {
      label: "Arrival playback",
      detail: "Play segments as soon as they are ready.",
    },
    asrCheck: {
      label: "Checker",
      detail: "Compare generated speech against the expected text.",
    },
    autoRetry: {
      label: "Retry rejected segments",
      detail: "Regenerate segments that fail checker validation.",
    },
    qualityReport: {
      label: "Quality report",
      detail: "Keep a summary of latency, retries, and confidence.",
    },
    textPreprocess: {
      label: "Text preprocessing",
      detail: "Normalize source text and structure before synthesis.",
    },
    voiceClone: {
      label: "Voice profile",
      detail: "Use the selected profile reference for synthesis.",
    },
  };

export function RunConfigurationWizard({
  customSpeechPolicyProfiles,
  runConfiguration,
  selectedProfile,
  speechPolicyDefinition,
  speechPolicyProfile,
  speechPolicyProfiles,
  ttsEngines,
  onRunConfigurationChange,
  onSpeechPolicyProfileChange,
}: Readonly<{
  customSpeechPolicyProfiles: CustomSpeechPolicyProfile[];
  runConfiguration: RunConfiguration;
  selectedProfile: VoiceProfile | null;
  speechPolicyDefinition: SpeechPolicyDefinition;
  speechPolicyProfile: string;
  speechPolicyProfiles: SpeechPolicyProfile[];
  ttsEngines: TTSEngineDiagnostics[];
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
  onSpeechPolicyProfileChange: (profile: string) => void;
}>) {
  const profileOptions = resolveSpeechPolicyProfileOptions(
    speechPolicyDefinition,
    speechPolicyProfiles,
  );
  const engineOptions = buildRunEngineOptions(ttsEngines);
  const activeEngineId = kokoroEngineFamilyValue(runConfiguration.ttsEngine);
  const activeVoiceChoice = voiceChoiceForConfiguration(runConfiguration, selectedProfile);
  const summary = runConfigurationSummary(runConfiguration, selectedProfile);
  const activeIntent = getRunModePreset(runConfiguration.runMode);
  const activeEngine = engineOptions.find((engine) => engine.id === activeEngineId);
  const activeProviderRuntime = resolveProviderRuntimeCapabilities(activeEngineId, ttsEngines);
  const activeKokoroMode = kokoroRenderModeForConfiguration(
    runConfiguration,
    Boolean(selectedProfile),
  );
  const activePolicyLabel = speechPolicyProfileDisplayName(
    speechPolicyProfile,
    customSpeechPolicyProfiles,
  );

  return (
    <Panel
      className="grid gap-4 p-3"
      data-testid="run-configuration-wizard"
      data-ui-action-surface="Settings"
      title="Run configuration wizard"
      variant="surface"
    >
      <WizardStepRail activeStepId="outputIntent" />

      <section className="grid gap-3" aria-labelledby="run-config-output-intent">
        <WizardStepHeader
          id="run-config-output-intent"
          detail="Choose the amount of checking and reporting before synthesis starts."
          label="1. Output intent"
          scope="session"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {runIntentOptions().map((preset) => (
            <Button
              align="start"
              className="grid gap-2 p-3"
              data-testid={`run-config-intent-${preset.mode}`}
              key={preset.mode}
              onClick={() => {
                onRunConfigurationChange(applyRunIntent(runConfiguration, preset.mode));
              }}
              selected={preset.mode === runConfiguration.runMode}
              variant="mode"
            >
              <span className="flex items-center justify-between gap-3">
                <span>{preset.label}</span>
                <StatusChip className="rounded-full py-0.5 text-[0.65rem]" tone="neutral">
                  {preset.performanceMode}
                </StatusChip>
              </span>
              <span className="vs-muted block text-xs leading-5">{preset.description}</span>
            </Button>
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="run-config-engine">
        <WizardStepHeader
          id="run-config-engine"
          detail="Pick the provider family; unavailable engines stay visible with their setup reason."
          label="2. Engine"
          scope="session"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {engineOptions.map((engine) => (
            <Button
              align="start"
              className="grid gap-2 p-3"
              data-testid={`run-config-engine-${engine.id}`}
              disabled={engine.disabled}
              disabledReason={
                engine.disabled ? (engine.disabledReason ?? "Engine is not ready.") : undefined
              }
              key={engine.id}
              onClick={() => {
                onRunConfigurationChange(
                  applyRunEngineSelection(runConfiguration, engine.id, ttsEngines),
                );
              }}
              selected={engine.id === activeEngineId}
              variant="mode"
            >
              <span className="flex items-center justify-between gap-3">
                <span>{engine.label}</span>
                <StatusChip
                  className="rounded-full py-0.5 text-[0.65rem]"
                  tone={engine.disabled ? "warning" : "success"}
                >
                  {engine.disabled ? "setup" : "ready"}
                </StatusChip>
              </span>
              <span className="vs-muted block text-xs leading-5">{engine.detail}</span>
            </Button>
          ))}
        </div>
        {isKokoroRenderEngine(runConfiguration.ttsEngine) ? (
          <div className="grid gap-2 sm:grid-cols-3">
            {KOKORO_RENDER_MODE_OPTIONS.map((option) => (
              <Button
                align="start"
                className="grid gap-1 p-3"
                data-testid={`run-config-kokoro-${option.id}`}
                key={option.id}
                onClick={() => {
                  onRunConfigurationChange(applyKokoroRenderMode(runConfiguration, option.id));
                }}
                selected={option.id === activeKokoroMode}
                variant="mode"
              >
                <span className="font-semibold">{option.label}</span>
                <span className="vs-muted text-xs leading-5">{option.detail}</span>
              </Button>
            ))}
          </div>
        ) : null}
      </section>

      <section className="grid gap-3" aria-labelledby="run-config-voice">
        <WizardStepHeader
          id="run-config-voice"
          detail="Decide whether this run uses the engine default or the selected voice profile."
          label="3. Voice"
          scope="session"
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {RUN_CONFIGURATION_VOICE_CHOICES.map((choice) => {
            const requiresProfile = choice.id !== "default";
            const voiceCloneGate = providerCapabilityGate(activeProviderRuntime, "voiceCloning");
            const disabled = requiresProfile && (!selectedProfile || voiceCloneGate.disabled);
            const disabledReason = disabled
              ? (voiceCloneGate.reason ?? "Select a voice profile before using profile audio.")
              : undefined;
            return (
              <Button
                align="start"
                className="grid gap-1 p-3"
                {...providerCapabilityDataAttributes(
                  "voiceCloning",
                  requiresProfile ? voiceCloneGate.reason : null,
                )}
                data-testid={`run-config-voice-${choice.id}`}
                disabled={disabled}
                disabledReason={disabledReason}
                key={choice.id}
                onClick={() => {
                  onRunConfigurationChange(applyVoiceChoice(runConfiguration, choice.id));
                }}
                selected={choice.id === activeVoiceChoice}
                variant="mode"
              >
                <span className="font-semibold">{choice.label}</span>
                <span className="vs-muted text-xs leading-5">{choice.detail}</span>
              </Button>
            );
          })}
        </div>
        <DiagnosticSummary
          items={[
            ["Selected voice", selectedProfile?.name ?? "Default voice"],
            [
              "Render path",
              kokoroRenderLabel(runConfiguration) ?? activeEngine?.label ?? activeEngineId,
            ],
          ]}
        />
      </section>

      <section className="grid gap-3" aria-labelledby="run-config-speech-profile">
        <WizardStepHeader
          id="run-config-speech-profile"
          detail="Use the same project profile that Preview, Teleprompt, and Cinema will resolve."
          label="4. Speech profile"
          scope="project"
        />
        <label className="grid gap-1 text-sm font-semibold">
          <span className="flex items-center gap-2">
            Profile
            <ScopeBadge scope="project" />
          </span>
          <select
            className={`${fieldControlClassName} min-w-0`}
            data-testid="run-config-speech-profile"
            onChange={(event) => {
              onSpeechPolicyProfileChange(event.currentTarget.value);
            }}
            value={speechPolicyProfile}
          >
            {profileOptions.map((option) => (
              <option key={option.name} value={option.name}>
                {option.label || speechPolicyProfileLabel(option.name)}
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
        </label>
        <DiagnosticSummary items={[["Current project policy", activePolicyLabel]]} />
      </section>

      <section className="grid gap-3" aria-labelledby="run-config-structured-content">
        <WizardStepHeader
          id="run-config-structured-content"
          detail="Keep the expensive gates visible without sending users through the full advanced matrix."
          label="5. Structured content"
          scope="session"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          {STRUCTURED_PIPELINE_KEYS.map((key) => (
            <PipelineToggle
              activeProviderRuntime={activeProviderRuntime}
              key={key}
              optionKey={key}
              runConfiguration={runConfiguration}
              onRunConfigurationChange={onRunConfigurationChange}
            />
          ))}
        </div>
      </section>

      <section className="grid gap-3" aria-labelledby="run-config-preview-sample">
        <WizardStepHeader
          id="run-config-preview-sample"
          detail="Review the planned run before using the primary Create & Listen action."
          label="6. Preview sample"
          scope="session"
        />
        <Panel className="grid gap-2 p-3" variant="raised">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone="info">{activeIntent.label}</StatusChip>
            <StatusChip tone="neutral">
              {describePerformanceMode(runConfiguration.performanceMode)}
            </StatusChip>
          </div>
          <ul className="grid gap-2 text-sm leading-6">
            {summary.map((item) => (
              <li className="vs-muted" key={item}>
                {item}
              </li>
            ))}
          </ul>
        </Panel>
      </section>
    </Panel>
  );
}

function PipelineToggle({
  activeProviderRuntime,
  optionKey,
  runConfiguration,
  onRunConfigurationChange,
}: Readonly<{
  activeProviderRuntime: ReturnType<typeof resolveProviderRuntimeCapabilities>;
  optionKey: (typeof STRUCTURED_PIPELINE_KEYS)[number];
  runConfiguration: RunConfiguration;
  onRunConfigurationChange: (configuration: RunConfiguration) => void;
}>) {
  const capability = capabilityForPipelineOption(optionKey);
  const gate = capability ? providerCapabilityGate(activeProviderRuntime, capability) : null;
  const disabled = gate?.disabled === true;
  const reason = gate && disabled ? gate.reason : undefined;
  return (
    <Toggle
      {...(capability ? providerCapabilityDataAttributes(capability, reason) : {})}
      checked={runConfiguration.options[optionKey]}
      data-disabled-reason={reason}
      data-testid={`run-config-pipeline-${optionKey}`}
      detail={reason ?? STRUCTURED_PIPELINE_LABELS[optionKey].detail}
      disabled={disabled}
      label={STRUCTURED_PIPELINE_LABELS[optionKey].label}
      onChange={(checked) => {
        onRunConfigurationChange({
          ...runConfiguration,
          options: {
            ...runConfiguration.options,
            [optionKey]: checked,
          },
        });
      }}
    />
  );
}

function capabilityForPipelineOption(
  optionKey: (typeof STRUCTURED_PIPELINE_KEYS)[number],
): ProviderCapabilityKey | null {
  switch (optionKey) {
    case "arrivalPlayback": {
      return "streaming";
    }
    case "asrCheck": {
      return "alignment";
    }
    case "autoRetry": {
      return "retryJob";
    }
    case "qualityReport":
    case "textPreprocess": {
      return null;
    }
  }
  return null;
}

function WizardStepRail({
  activeStepId,
}: Readonly<{ activeStepId: (typeof RUN_CONFIGURATION_WIZARD_STEPS)[number]["id"] }>) {
  return (
    <ol className="grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-3">
      {RUN_CONFIGURATION_WIZARD_STEPS.map((step) => (
        <li
          className={`rounded-md border px-3 py-2 ${
            step.id === activeStepId
              ? "border-[var(--vs-selected-border)] bg-[var(--vs-selected)]"
              : "vs-border vs-surface"
          }`}
          key={step.id}
        >
          <span className="flex items-center justify-between gap-2 font-semibold">
            {step.label}
            <ScopeBadge scope={step.scope} />
          </span>
          <span className="vs-muted mt-1 block leading-5">{step.detail}</span>
        </li>
      ))}
    </ol>
  );
}

function WizardStepHeader({
  detail,
  id,
  label,
  scope,
}: Readonly<{
  detail: string;
  id: string;
  label: string;
  scope: "session" | "project" | "source" | "machine";
}>) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-t pt-3 vs-border">
      <div>
        <h4 className="text-sm font-semibold" id={id}>
          {label}
        </h4>
        <p className="vs-muted mt-1 text-xs leading-5">{detail}</p>
      </div>
      <ScopeBadge scope={scope} />
    </div>
  );
}

function DiagnosticSummary({ items }: Readonly<{ items: [string, string][] }>) {
  return (
    <dl className="grid gap-2 rounded-md border bg-[var(--vs-raised)] p-3 text-xs vs-border sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="vs-muted font-semibold">{label}</dt>
          <dd className="mt-1 truncate text-sm font-semibold" title={value}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
