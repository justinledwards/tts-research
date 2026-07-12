import {
  KOKORO_RENDER_MODE_OPTIONS,
  RUN_MODE_PRESETS,
  applyKokoroRenderMode,
  createRunConfiguration,
  getRunModePreset,
  isKokoroRenderEngine,
  kokoroEngineFamilyValue,
  kokoroRenderModeForConfiguration,
  normalizeRunConfiguration,
  type KokoroRenderMode,
  type RunConfiguration,
  type RunModePreset,
} from "../../runConfig";
import type {
  PipelineOptions,
  RunMode,
  TTSEngineDiagnostics,
  VoiceJob,
  VoiceProfile,
} from "../../types";
import { capabilityLabel, resolveProviderRuntimeCapabilities } from "../provider-capabilities";

export type RunConfigurationWizardStepId =
  | "outputIntent"
  | "engine"
  | "voice"
  | "speechProfile"
  | "structuredContent"
  | "previewSample";

export interface RunConfigurationWizardStep {
  id: RunConfigurationWizardStepId;
  label: string;
  scope: "session" | "project" | "source" | "machine";
  detail: string;
}

export type RunConfigurationVoiceChoice = "default" | "savedProfile" | "clonedProfile";

export interface RunEngineOption {
  id: string;
  label: string;
  category: "mockLocal" | "kokoro" | "supertonic" | "configuredProvider";
  detail: string;
  disabled: boolean;
  disabledReason?: string;
  readinessDetail: string;
  readinessLabel: string;
}

export interface RunIntentDefinition {
  mode: RunMode;
  label: string;
  description: string;
  speed: string;
  checking: string;
  retries: string;
  reporting: string;
  preprocessing: string;
  arrivalPlayback: string;
}

export interface RunPlannerVoicePath {
  label: string;
  detail: string;
}

export interface StructuredContentSummaryItem {
  id: string;
  label: string;
  value: string;
  detail: string;
}

export interface RunPlannerPreviewSample {
  label: string;
  text: string;
  detail: string;
}

export interface RunPlannerFact {
  label: string;
  value: string;
}

export interface RunPlannerSummaryInput {
  configuration: RunConfiguration;
  policyLabel: string;
  sampleText?: string;
  scopeLabel: string;
  selectedProfile?: VoiceProfile | null;
  sourceLabel: string;
  ttsEngines: readonly TTSEngineDiagnostics[];
  voiceLabel?: string;
}

export interface RunPlannerSummary {
  beforeGeneration: string[];
  engineDetail: string;
  engineLabel: string;
  engineReadiness: string;
  facts: RunPlannerFact[];
  intent: RunIntentDefinition;
  previewSample: RunPlannerPreviewSample;
  sourceLabel: string;
  speechProfileLabel: string;
  structuredContent: StructuredContentSummaryItem[];
  voicePath: RunPlannerVoicePath;
}

export interface RunPlannerDifference {
  label: string;
  current: string;
  retry: string;
}

export const RUN_CONFIGURATION_WIZARD_STEPS: RunConfigurationWizardStep[] = [
  {
    id: "outputIntent",
    label: "Output intent",
    scope: "session",
    detail: "Sets speed, checks, retries, and reporting for the next run.",
  },
  {
    id: "engine",
    label: "Engine",
    scope: "session",
    detail: "Chooses mock/local, Kokoro, Supertonic, or the configured provider.",
  },
  {
    id: "voice",
    label: "Voice",
    scope: "session",
    detail: "Uses the default voice, a saved profile, or a cloned-profile path.",
  },
  {
    id: "speechProfile",
    label: "Speech profile",
    scope: "project",
    detail: "Controls the policy model that turns structure into spoken form.",
  },
  {
    id: "structuredContent",
    label: "Structured content",
    scope: "session",
    detail: "Keeps preprocessing, checker, retry, and quality gates visible.",
  },
  {
    id: "previewSample",
    label: "Preview sample",
    scope: "session",
    detail: "Summarizes what the selected run will do before generation starts.",
  },
];

export const RUN_CONFIGURATION_VOICE_CHOICES: {
  id: RunConfigurationVoiceChoice;
  label: string;
  detail: string;
}[] = [
  {
    id: "default",
    label: "Default voice",
    detail: "Use the engine default or selected built-in voice.",
  },
  {
    id: "savedProfile",
    label: "Saved profile",
    detail: "Use the selected voice profile reference when the engine supports it.",
  },
  {
    id: "clonedProfile",
    label: "Cloned profile",
    detail: "Prefer the profile artifact or clone render path when available.",
  },
];

export function runIntentOptions(): RunModePreset[] {
  return RUN_MODE_PRESETS;
}

export function runIntentDefinitions(): RunIntentDefinition[] {
  return RUN_MODE_PRESETS.map((preset) => runIntentDefinition(preset.mode));
}

export function runIntentDefinition(mode: RunMode): RunIntentDefinition {
  const preset = getRunModePreset(mode);
  const detail = RUN_INTENT_DETAILS[preset.mode];
  return {
    mode: preset.mode,
    label: preset.label,
    description: preset.description,
    ...detail,
  };
}

export function applyRunIntent(configuration: RunConfiguration, mode: RunMode): RunConfiguration {
  const next = createRunConfiguration(mode);
  return {
    ...next,
    engineOptions: configuration.engineOptions,
    ttsEngine: configuration.ttsEngine,
  };
}

export function buildRunEngineOptions(engines: readonly TTSEngineDiagnostics[]): RunEngineOption[] {
  return engineFamilyOptions(engines).map((engine) => {
    const category = engineCategory(engine);
    const isReady = engine.status === "ready";
    const disabledReason = isReady ? undefined : (engine.reason ?? engine.setup);
    return {
      id: engine.id,
      label: engineCategoryLabel(engine, category),
      category,
      detail: engineDetail(engine, category),
      disabled: !isReady,
      disabledReason,
      readinessDetail: disabledReason ?? "Ready to create speech for the next run.",
      readinessLabel: isReady ? "Ready" : "Setup needed",
    };
  });
}

export function applyRunEngineSelection(
  configuration: RunConfiguration,
  engineId: string,
  engines: TTSEngineDiagnostics[],
): RunConfiguration {
  const selectedEngine = engines.find((item) => item.id === engineId);
  const firstVoice = selectedEngine?.voices?.[0]?.id;
  if (engineId === "kokoro") {
    return applyKokoroRenderMode(configuration, "voicepack");
  }
  return {
    ...configuration,
    engineOptions:
      engineId === "supertonic-3"
        ? {
            ...configuration.engineOptions,
            lang: configuration.engineOptions.lang ?? "na",
            voiceStyle: configuration.engineOptions.voiceStyle ?? firstVoice ?? "M1",
          }
        : {},
    ttsEngine: engineId,
  };
}

export function voiceChoiceForConfiguration(
  configuration: RunConfiguration,
  selectedProfile: VoiceProfile | null,
): RunConfigurationVoiceChoice {
  if (!configuration.options.voiceClone || !selectedProfile) {
    return "default";
  }
  if (
    configuration.ttsEngine === "kokoro-embed" ||
    kokoroRenderModeForConfiguration(configuration, true) === "kokoro-embed"
  ) {
    return "clonedProfile";
  }
  return "savedProfile";
}

export function applyVoiceChoice(
  configuration: RunConfiguration,
  choice: RunConfigurationVoiceChoice,
): RunConfiguration {
  if (choice === "default") {
    if (isKokoroRenderEngine(configuration.ttsEngine)) {
      return applyKokoroRenderMode(configuration, "voicepack");
    }
    return {
      ...configuration,
      options: {
        ...configuration.options,
        voiceClone: false,
      },
    };
  }

  if (isKokoroRenderEngine(configuration.ttsEngine)) {
    const kokoroMode: KokoroRenderMode = choice === "clonedProfile" ? "kokoro-embed" : "kokoclone";
    return applyKokoroRenderMode(configuration, kokoroMode);
  }

  return {
    ...configuration,
    options: {
      ...configuration.options,
      voiceClone: true,
    },
  };
}

export function runConfigurationSummary(
  configuration: RunConfiguration,
  selectedProfile: VoiceProfile | null,
): string[] {
  const preset = getRunModePreset(configuration.runMode);
  const checks = [
    configuration.options.asrCheck ? "ASR check" : null,
    configuration.options.autoRetry ? "auto retry" : null,
    configuration.options.qualityReport ? "quality report" : null,
  ].filter(Boolean);
  return [
    `${preset.label} uses ${configuration.performanceMode} performance for ${preset.description.toLowerCase()}`,
    configuration.options.textPreprocess
      ? "Source text is normalized before synthesis."
      : "Source text is sent without preprocessing.",
    selectedProfile && configuration.options.voiceClone
      ? `Voice profile: ${selectedProfile.name}.`
      : "Voice profile: engine default.",
    checks.length > 0
      ? `Checks enabled: ${checks.join(", ")}.`
      : "Checker gates are off for this run.",
  ];
}

export function kokoroRenderLabel(configuration: RunConfiguration): string | null {
  if (!isKokoroRenderEngine(configuration.ttsEngine)) {
    return null;
  }
  const active = kokoroRenderModeForConfiguration(configuration, true);
  return KOKORO_RENDER_MODE_OPTIONS.find((option) => option.id === active)?.label ?? "Kokoro";
}

export function buildRunPlannerSummary(input: RunPlannerSummaryInput): RunPlannerSummary {
  const intent = runIntentDefinition(input.configuration.runMode);
  const engine = activeRunEngineOption(input.configuration, input.ttsEngines);
  const voicePath = plannerVoicePath(
    input.configuration,
    input.selectedProfile ?? null,
    input.voiceLabel,
  );
  const structuredContent = structuredContentSummary(input.configuration.options);
  const previewSample = plannerPreviewSample(input.sampleText);
  return {
    beforeGeneration: beforeGenerationSummary({
      configuration: input.configuration,
      engineLabel: engine.label,
      intent,
      voicePath,
    }),
    engineDetail: engine.detail,
    engineLabel: engine.label,
    engineReadiness: engine.readinessLabel,
    facts: [
      { label: "Source", value: input.sourceLabel },
      { label: "Scope", value: input.scopeLabel },
      { label: "Intent", value: intent.label },
      { label: "Engine", value: engine.label },
      { label: "Voice path", value: voicePath.label },
      { label: "Speech profile", value: input.policyLabel },
    ],
    intent,
    previewSample,
    sourceLabel: input.sourceLabel,
    speechProfileLabel: input.policyLabel,
    structuredContent,
    voicePath,
  };
}

export function runConfigurationFromVoiceJob(job: VoiceJob): RunConfiguration {
  return normalizeRunConfiguration({
    engineOptions: job.engineOptions ?? {},
    options: job.pipelineOptions,
    performanceMode: job.performanceMode,
    runMode: job.runMode ?? "checkedMaster",
    ttsEngine: job.ttsEngine ?? "auto",
  });
}

export function compareRunPlannerSummaries(
  current: RunPlannerSummary,
  retry: RunPlannerSummary,
): RunPlannerDifference[] {
  return [
    difference("Output intent", current.intent.label, retry.intent.label),
    difference("Performance", current.intent.speed, retry.intent.speed),
    difference("Engine", current.engineLabel, retry.engineLabel),
    difference("Voice path", current.voicePath.label, retry.voicePath.label),
    difference("Speech profile", current.speechProfileLabel, retry.speechProfileLabel),
    difference(
      "Structured content",
      structuredContentDifferenceValue(current.structuredContent),
      structuredContentDifferenceValue(retry.structuredContent),
    ),
  ].filter((item): item is RunPlannerDifference => item !== null);
}

const RUN_INTENT_DETAILS: Record<
  RunMode,
  Omit<RunIntentDefinition, "description" | "label" | "mode">
> = {
  checkedMaster: {
    arrivalPlayback: "Play segments as they arrive",
    checking: "Checker validation before completion",
    preprocessing: "Prepare listener-ready structured text",
    reporting: "Quality report included",
    retries: "Retry rejected segments automatically",
    speed: "Balanced generation",
  },
  draftPreview: {
    arrivalPlayback: "Play segments as they arrive",
    checking: "No checker gate",
    preprocessing: "Prepare listener-ready structured text",
    reporting: "No quality report",
    retries: "No automatic retries",
    speed: "Fast draft",
  },
  fastCreate: {
    arrivalPlayback: "Play segments as they arrive",
    checking: "No checker gate",
    preprocessing: "Prepare listener-ready structured text",
    reporting: "Quality report included",
    retries: "No automatic retries",
    speed: "Fast daily generation",
  },
  publishMaster: {
    arrivalPlayback: "Play segments as they arrive",
    checking: "Checker validation before completion",
    preprocessing: "Prepare listener-ready structured text",
    reporting: "Quality report included",
    retries: "Retry rejected segments automatically",
    speed: "Quality-first generation",
  },
};

function activeRunEngineOption(
  configuration: RunConfiguration,
  engines: readonly TTSEngineDiagnostics[],
): RunEngineOption {
  const activeEngineId = kokoroEngineFamilyValue(configuration.ttsEngine);
  return (
    buildRunEngineOptions(engines).find((engine) => engine.id === activeEngineId) ??
    buildRunEngineOptions([]).find((engine) => engine.id === "auto") ?? {
      category: "configuredProvider",
      detail: "Provider selected for the next run.",
      disabled: false,
      id: activeEngineId,
      label: activeEngineId || "Configured provider",
      readinessDetail: "Ready to create speech for the next run.",
      readinessLabel: "Ready",
    }
  );
}

function plannerVoicePath(
  configuration: RunConfiguration,
  selectedProfile: VoiceProfile | null,
  voiceLabel: string | undefined,
): RunPlannerVoicePath {
  const namedVoice = cleanLabel(selectedProfile?.name ?? voiceLabel);
  if (!configuration.options.voiceClone) {
    return {
      detail: namedVoice
        ? `${namedVoice} will be used as the provider or built-in engine voice.`
        : "The selected engine default or built-in voice will be used.",
      label: "Default/provider voice",
    };
  }
  if (configuration.ttsEngine === "kokoro-embed") {
    return {
      detail: namedVoice
        ? `${namedVoice} will render through its prepared Kokoro style artifact.`
        : "A prepared Kokoro style artifact will be used for this run.",
      label: "Cloned profile artifact",
    };
  }
  if (configuration.ttsEngine === "kokoro-clone") {
    return {
      detail: namedVoice
        ? `${namedVoice} will render from the saved reference audio.`
        : "The saved profile reference audio will guide synthesis.",
      label: "Cloned profile reference",
    };
  }
  return {
    detail: namedVoice
      ? `${namedVoice} will be used where the selected engine supports profile audio.`
      : "A saved profile path will be used where the selected engine supports it.",
    label: "Saved voice profile",
  };
}

function structuredContentSummary(options: PipelineOptions): StructuredContentSummaryItem[] {
  return [
    {
      detail: options.textPreprocess
        ? "Source structure is normalized into listener-ready speech before synthesis."
        : "Source text is sent directly to synthesis.",
      id: "preprocessing",
      label: "Preprocessing",
      value: options.textPreprocess ? "Prepare spoken form" : "Use text as written",
    },
    {
      detail: options.textPreprocess
        ? "Blocks, skips, and summaries follow the active speech profile."
        : "The engine receives simple text segments.",
      id: "segmentation",
      label: "Block segmentation",
      value: options.textPreprocess ? "Policy-aware blocks" : "Simple text segments",
    },
    {
      detail: "Skipped, summarized, and preserved content follows the active speech profile.",
      id: "skipped-content",
      label: "Skipped content",
      value: "Speech profile controlled",
    },
    {
      detail: options.asrCheck
        ? "Generated speech is compared against the expected spoken form."
        : "Generation completes without a checker gate.",
      id: "checking",
      label: "Checking",
      value: options.asrCheck ? "Checker on" : "Checker off",
    },
    {
      detail: options.autoRetry
        ? "Rejected segments can be regenerated automatically."
        : "Rejected segments require an explicit retry.",
      id: "retries",
      label: "Retries",
      value: options.autoRetry ? "Automatic" : "Manual",
    },
    {
      detail: options.qualityReport
        ? "Latency, retry, and confidence details are kept with the job."
        : "No run-quality report is attached.",
      id: "reporting",
      label: "Reporting",
      value: options.qualityReport ? "Included" : "Off",
    },
  ];
}

function plannerPreviewSample(sampleText: string | undefined): RunPlannerPreviewSample {
  const clean = cleanLabel(sampleText);
  return {
    detail: clean
      ? "This sample can be auditioned before full narration generation."
      : "A selected spoken block will be used when Preview has one available.",
    label: clean ? "Selected Preview sample" : "Preview sample pending",
    text: clean ? truncateSample(clean) : "Select a spoken block to preview the run sample.",
  };
}

function beforeGenerationSummary({
  configuration,
  engineLabel,
  intent,
  voicePath,
}: Readonly<{
  configuration: RunConfiguration;
  engineLabel: string;
  intent: RunIntentDefinition;
  voicePath: RunPlannerVoicePath;
}>): string[] {
  return [
    `${intent.label} applies ${intent.speed.toLowerCase()} with ${intent.checking.toLowerCase()}.`,
    `${engineLabel} will render speech through ${voicePath.label.toLowerCase()}.`,
    configuration.options.textPreprocess
      ? "Structured content is prepared into spoken blocks before synthesis."
      : "Source text is sent directly to synthesis.",
    configuration.options.autoRetry
      ? "Rejected segments can be regenerated automatically before completion."
      : "Rejected segments wait for an explicit retry.",
    configuration.options.qualityReport
      ? "A quality report is kept with the generated job."
      : "No quality report is generated for this run.",
  ];
}

function difference(label: string, current: string, retry: string): RunPlannerDifference | null {
  return current === retry ? null : { current, label, retry };
}

function structuredContentDifferenceValue(items: StructuredContentSummaryItem[]): string {
  return items.map((item) => `${item.label}: ${item.value}`).join("; ");
}

function cleanLabel(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function truncateSample(value: string): string {
  return value.length > 180 ? `${value.slice(0, 177).trimEnd()}...` : value;
}

function engineFamilyOptions(engines: readonly TTSEngineDiagnostics[]): TTSEngineDiagnostics[] {
  const source = engines.length > 0 ? engines : fallbackTTSEngines();
  return source.filter((engine) => engine.id !== "kokoro-clone" && engine.id !== "kokoro-embed");
}

function fallbackTTSEngines(): TTSEngineDiagnostics[] {
  return [
    {
      default: false,
      experimental: false,
      id: "auto",
      label: "Configured provider",
      local: true,
      status: "ready",
      supportsReference: true,
      supportsSSML: false,
      supportsSwedish: true,
      supportsVoice: true,
    },
  ];
}

function engineCategory(
  engine: TTSEngineDiagnostics,
): "mockLocal" | "kokoro" | "supertonic" | "configuredProvider" {
  if (engine.id === "kokoro" || engine.id.startsWith("kokoro-")) {
    return "kokoro";
  }
  if (engine.id.includes("supertonic")) {
    return "supertonic";
  }
  if (engine.local || engine.id === "mock" || engine.id === "auto") {
    return "mockLocal";
  }
  return "configuredProvider";
}

function engineCategoryLabel(
  engine: TTSEngineDiagnostics,
  category: RunEngineOption["category"],
): string {
  if (category === "mockLocal") {
    return engine.id === "auto" ? "Configured provider" : "Mock/local";
  }
  if (category === "kokoro") {
    return "Kokoro";
  }
  if (category === "supertonic") {
    return "Supertonic";
  }
  return engine.label || "Configured provider";
}

function engineDetail(engine: TTSEngineDiagnostics, category: RunEngineOption["category"]): string {
  const runtime = resolveProviderRuntimeCapabilities(engine.id, [engine]);
  const capabilities = [
    runtime.capabilities.voiceCloning ? capabilityLabel("voiceCloning") : "default voice",
    runtime.capabilities.voicePreview ? capabilityLabel("voicePreview") : null,
    runtime.capabilities.ssml ? capabilityLabel("ssml") : "plain text",
    runtime.capabilities.wordTiming ? capabilityLabel("wordTiming") : null,
    engine.supportsSwedish ? "Swedish ready" : null,
  ].filter(Boolean);
  if (category === "mockLocal") {
    return `${engine.label} · ${capabilities.join(", ")}`;
  }
  if (category === "configuredProvider") {
    return engine.reason ?? engine.setup ?? `${engine.label} · provider configured at runtime`;
  }
  return `${engine.label} · ${capabilities.join(", ")}`;
}
