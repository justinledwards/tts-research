import type {
  BuiltInSpeechPolicyProfileName,
  CustomSpeechPolicyProfile,
  SpeechPolicyCodeMode,
  SpeechPolicyFootnoteMode,
  SpeechPolicyImageMode,
  SpeechPolicyMathMode,
  SpeechPolicyOverrides,
  SpeechPolicySettings,
  SpeechPolicyTableMode,
} from "./types";

export const DEFAULT_SPEECH_POLICY_PROFILE = "Enterprise";

export const SPEECH_POLICY_PROFILE_OPTIONS: BuiltInSpeechPolicyProfileName[] = [
  "Enterprise",
  "Education",
  "Accessibility",
  "TechnicalDocs",
  "LanguageLearning",
];

export const BUILT_IN_SPEECH_POLICY_SETTINGS: Record<
  BuiltInSpeechPolicyProfileName,
  SpeechPolicySettings
> = {
  Enterprise: {
    mode: "speak",
    tableMode: "summary",
    codeMode: "skip",
    mathMode: "skip",
    footnoteMode: "onDemand",
    imageMode: "altFirst",
  },
  Education: {
    mode: "speak",
    tableMode: "summary",
    codeMode: "summary",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeShort",
  },
  Accessibility: {
    mode: "speak",
    tableMode: "rowLinear",
    codeMode: "syntaxAware",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeLong",
  },
  TechnicalDocs: {
    mode: "speak",
    tableMode: "rowLinear",
    codeMode: "syntaxAware",
    mathMode: "literalsafe",
    footnoteMode: "endnote",
    imageMode: "altFirst",
  },
  LanguageLearning: {
    mode: "speak",
    tableMode: "summary",
    codeMode: "literal",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeShort",
  },
};

export const TABLE_MODE_OPTIONS: SpeechPolicyTableMode[] = [
  "skip",
  "summary",
  "rowLinear",
  "interactive",
];
export const CODE_MODE_OPTIONS: SpeechPolicyCodeMode[] = [
  "skip",
  "summary",
  "syntaxAware",
  "literal",
];
export const MATH_MODE_OPTIONS: SpeechPolicyMathMode[] = ["skip", "semantic", "literalsafe"];
export const FOOTNOTE_MODE_OPTIONS: SpeechPolicyFootnoteMode[] = [
  "skip",
  "inline",
  "endnote",
  "onDemand",
];
export const IMAGE_MODE_OPTIONS: SpeechPolicyImageMode[] = [
  "skip",
  "altFirst",
  "describeShort",
  "describeLong",
];

const SPEECH_POLICY_OVERRIDE_PREFIX = "tts-speech-policy-overrides:";

export function normalizeSpeechPolicyProfile(value: unknown): string {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean || DEFAULT_SPEECH_POLICY_PROFILE;
}

export function normalizeSpeechPolicyOverrides(value: unknown): SpeechPolicyOverrides {
  if (!value || typeof value !== "object") {
    return {};
  }
  const candidate = value as SpeechPolicyOverrides;
  return compactSpeechPolicyOverrides({
    tableMode: includesMode(TABLE_MODE_OPTIONS, candidate.tableMode)
      ? candidate.tableMode
      : undefined,
    codeMode: includesMode(CODE_MODE_OPTIONS, candidate.codeMode) ? candidate.codeMode : undefined,
    mathMode: includesMode(MATH_MODE_OPTIONS, candidate.mathMode) ? candidate.mathMode : undefined,
    footnoteMode: includesMode(FOOTNOTE_MODE_OPTIONS, candidate.footnoteMode)
      ? candidate.footnoteMode
      : undefined,
    imageMode: includesMode(IMAGE_MODE_OPTIONS, candidate.imageMode)
      ? candidate.imageMode
      : undefined,
  });
}

export function loadSpeechPolicyOverrides(projectId: string): SpeechPolicyOverrides {
  try {
    const stored = sessionStorage.getItem(speechPolicyOverrideKey(projectId));
    return stored ? normalizeSpeechPolicyOverrides(JSON.parse(stored) as unknown) : {};
  } catch {
    return {};
  }
}

export function saveSpeechPolicyOverrides(
  projectId: string,
  overrides: SpeechPolicyOverrides,
): void {
  const normalized = normalizeSpeechPolicyOverrides(overrides);
  const key = speechPolicyOverrideKey(projectId);
  if (Object.keys(normalized).length === 0) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, JSON.stringify(normalized));
}

export function clearSpeechPolicyOverrides(projectId: string): void {
  sessionStorage.removeItem(speechPolicyOverrideKey(projectId));
}

export function speechPolicyOverrideKey(projectId: string): string {
  const clean = projectId.trim() || "default";
  return `${SPEECH_POLICY_OVERRIDE_PREFIX}${clean}`;
}

export function compactSpeechPolicyOverrides(
  overrides: SpeechPolicyOverrides,
): SpeechPolicyOverrides {
  const output: SpeechPolicyOverrides = {};
  if (overrides.mode) {
    output.mode = overrides.mode;
  }
  if (overrides.tableMode) {
    output.tableMode = overrides.tableMode;
  }
  if (overrides.codeMode) {
    output.codeMode = overrides.codeMode;
  }
  if (overrides.mathMode) {
    output.mathMode = overrides.mathMode;
  }
  if (overrides.footnoteMode) {
    output.footnoteMode = overrides.footnoteMode;
  }
  if (overrides.imageMode) {
    output.imageMode = overrides.imageMode;
  }
  return output;
}

export function hasSpeechPolicyOverrides(overrides: SpeechPolicyOverrides): boolean {
  return Object.keys(compactSpeechPolicyOverrides(overrides)).length > 0;
}

export function speechPolicyOverridesEqual(
  left: SpeechPolicyOverrides,
  right: SpeechPolicyOverrides,
): boolean {
  return (
    JSON.stringify(compactSpeechPolicyOverrides(left)) ===
    JSON.stringify(compactSpeechPolicyOverrides(right))
  );
}

export function speechPolicyProfileLabel(profile: string): string {
  if (profile === "TechnicalDocs") {
    return "Technical Docs";
  }
  if (profile === "LanguageLearning") {
    return "Language Learning";
  }
  return profile;
}

export function isBuiltInSpeechPolicyProfile(
  value: string,
): value is BuiltInSpeechPolicyProfileName {
  return SPEECH_POLICY_PROFILE_OPTIONS.includes(value as BuiltInSpeechPolicyProfileName);
}

export function speechPolicyProfileDisplayName(
  profile: string,
  customProfiles: CustomSpeechPolicyProfile[] = [],
): string {
  const custom = customProfiles.find((item) => item.id === profile);
  return custom?.name ?? speechPolicyProfileLabel(profile);
}

export function resolveSpeechPolicySettings(
  profile: string,
  builtInProfiles: { name: string; settings: SpeechPolicySettings }[],
  customProfiles: CustomSpeechPolicyProfile[],
): SpeechPolicySettings {
  const custom = customProfiles.find((item) => item.id === profile);
  if (custom) {
    return custom.settings;
  }
  const builtIn = builtInProfiles.find((item) => item.name === profile);
  return builtIn?.settings ?? enterpriseDefaults();
}

export function applySpeechPolicyOverridesToSettings(
  settings: SpeechPolicySettings,
  overrides: SpeechPolicyOverrides,
): SpeechPolicySettings {
  return {
    mode: overrides.mode ?? settings.mode,
    tableMode: overrides.tableMode ?? settings.tableMode,
    codeMode: overrides.codeMode ?? settings.codeMode,
    mathMode: overrides.mathMode ?? settings.mathMode,
    footnoteMode: overrides.footnoteMode ?? settings.footnoteMode,
    imageMode: overrides.imageMode ?? settings.imageMode,
  };
}

function enterpriseDefaults(): SpeechPolicySettings {
  return { ...BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise };
}

function includesMode<const T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}
