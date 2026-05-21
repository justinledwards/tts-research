import {
  KOKORO_RENDER_MODE_OPTIONS,
  RUN_MODE_PRESETS,
  applyKokoroRenderMode,
  createRunConfiguration,
  getRunModePreset,
  isKokoroRenderEngine,
  kokoroRenderModeForConfiguration,
  type KokoroRenderMode,
  type RunConfiguration,
  type RunModePreset,
} from "../../runConfig";
import type { RunMode, TTSEngineDiagnostics, VoiceProfile } from "../../types";

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

export function applyRunIntent(configuration: RunConfiguration, mode: RunMode): RunConfiguration {
  const next = createRunConfiguration(mode);
  return {
    ...next,
    engineOptions: configuration.engineOptions,
    ttsEngine: configuration.ttsEngine,
  };
}

export function buildRunEngineOptions(engines: TTSEngineDiagnostics[]): RunEngineOption[] {
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
  const capabilities = [
    engine.supportsReference ? "voice profile" : "default voice",
    engine.supportsSSML ? "SSML" : "plain text",
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
