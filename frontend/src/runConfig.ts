import type {
  CreateVoiceJobRequest,
  PerformanceMode,
  PipelineOptions,
  RunMode,
  VoiceJob,
} from "./types";

export const RUN_CONFIG_STORAGE_KEY = "tts-run-config-v1";

export interface RunConfiguration {
  runMode: RunMode;
  performanceMode: PerformanceMode;
  ttsEngine: string;
  engineOptions: Partial<Record<string, string>>;
  options: PipelineOptions;
}

export interface RunModePreset {
  mode: RunMode;
  label: string;
  description: string;
  primaryLabel: string;
  options: PipelineOptions;
  performanceMode: PerformanceMode;
}

export const RUN_MODE_PRESETS: RunModePreset[] = [
  {
    mode: "draftPreview",
    label: "Draft Preview",
    description: "Fastest pass for timing, phrasing, and read-along review.",
    primaryLabel: "Create & Listen",
    performanceMode: "balanced",
    options: {
      textPreprocess: true,
      voiceClone: false,
      asrCheck: false,
      autoRetry: false,
      arrivalPlayback: true,
      qualityReport: false,
    },
  },
  {
    mode: "fastCreate",
    label: "Fast Create",
    description: "Good daily output when speed matters more than checker validation.",
    primaryLabel: "Create & Listen",
    performanceMode: "throughput",
    options: {
      textPreprocess: true,
      voiceClone: true,
      asrCheck: false,
      autoRetry: false,
      arrivalPlayback: true,
      qualityReport: true,
    },
  },
  {
    mode: "checkedMaster",
    label: "Checked Master",
    description: "Balanced production pass with checker confidence and retry support.",
    primaryLabel: "Create & Listen",
    performanceMode: "balanced",
    options: {
      textPreprocess: true,
      voiceClone: true,
      asrCheck: true,
      autoRetry: true,
      arrivalPlayback: true,
      qualityReport: true,
    },
  },
  {
    mode: "publishMaster",
    label: "Publish Master",
    description: "Quality-first run for final review and delivery.",
    primaryLabel: "Create & Listen",
    performanceMode: "quality",
    options: {
      textPreprocess: true,
      voiceClone: true,
      asrCheck: true,
      autoRetry: true,
      arrivalPlayback: true,
      qualityReport: true,
    },
  },
];

export const DEFAULT_RUN_CONFIGURATION: RunConfiguration = {
  runMode: "checkedMaster",
  performanceMode: "balanced",
  ttsEngine: "auto",
  engineOptions: {},
  options: getRunModePreset("checkedMaster").options,
};

export function getRunModePreset(mode: RunMode): RunModePreset {
  return RUN_MODE_PRESETS.find((preset) => preset.mode === mode) ?? RUN_MODE_PRESETS[2];
}

export function createRunConfiguration(mode: RunMode): RunConfiguration {
  const preset = getRunModePreset(mode);
  return {
    runMode: preset.mode,
    performanceMode: preset.performanceMode,
    ttsEngine: "auto",
    engineOptions: {},
    options: { ...preset.options },
  };
}

export function resolveRunPrimaryLabel(config: RunConfiguration, job: VoiceJob | null): string {
  if (job?.status === "completed") {
    return "Create Again";
  }
  return getRunModePreset(config.runMode).primaryLabel;
}

export function buildCreateVoiceJobRequest(
  text: string,
  config: RunConfiguration,
  selectedVoiceProfileId: string,
  projectId?: string,
  ttsVoice?: string,
  ttsLanguage?: string,
): CreateVoiceJobRequest {
  const request: CreateVoiceJobRequest = {
    text,
    projectId,
    runMode: config.runMode,
    performanceMode: config.performanceMode,
    ttsEngine: config.ttsEngine,
    engineOptions: config.engineOptions,
    adaptiveMode: config.performanceMode === "throughput",
    pipelineOptions: config.options,
  };
  if (ttsVoice) {
    request.ttsVoice = ttsVoice;
  }
  if (ttsLanguage) {
    request.ttsLanguage = ttsLanguage;
  }
  if (selectedVoiceProfileId && config.options.voiceClone) {
    request.voiceProfileId = selectedVoiceProfileId;
  }
  return request;
}

export function describePerformanceMode(mode: PerformanceMode): string {
  if (mode === "throughput") {
    return "Parallel, lower-latency segmentation";
  }
  if (mode === "quality") {
    return "Serialized, steadier master rendering";
  }
  return "Balanced speed and review quality";
}

export function normalizeRunConfiguration(value: unknown): RunConfiguration {
  if (!isRunConfiguration(value)) {
    return createRunConfiguration("checkedMaster");
  }
  const preset = getRunModePreset(value.runMode);
  return {
    runMode: preset.mode,
    performanceMode: isPerformanceMode(value.performanceMode)
      ? value.performanceMode
      : preset.performanceMode,
    ttsEngine: normalizeTTSEngine(value.ttsEngine),
    engineOptions: normalizeEngineOptions(value.engineOptions),
    options: {
      ...preset.options,
      ...value.options,
    },
  };
}

function isRunConfiguration(value: unknown): value is RunConfiguration {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<RunConfiguration>;
  return isRunMode(candidate.runMode);
}

function isRunMode(value: unknown): value is RunMode {
  return (
    value === "draftPreview" ||
    value === "fastCreate" ||
    value === "checkedMaster" ||
    value === "publishMaster"
  );
}

function isPerformanceMode(value: unknown): value is PerformanceMode {
  return value === "balanced" || value === "throughput" || value === "quality";
}

export function normalizeTTSEngine(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "auto";
  }
  return value.trim();
}

function normalizeEngineOptions(value: unknown): Partial<Record<string, string>> {
  if (!value || typeof value !== "object") {
    return {};
  }
  const normalized: Partial<Record<string, string>> = {};
  for (const [key, optionValue] of Object.entries(value as Record<string, unknown>)) {
    if (typeof optionValue === "string" && key.trim().length > 0) {
      normalized[key.trim()] = optionValue.trim();
    }
  }
  return normalized;
}
