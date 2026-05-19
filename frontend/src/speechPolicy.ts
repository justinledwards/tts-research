import type {
  BuiltInSpeechPolicyProfileName,
  CustomSpeechPolicyProfile,
  SpeechPolicyAdmonitionMode,
  SpeechPolicyCaptionMode,
  SpeechPolicyCodeMode,
  SpeechPolicyCitationMode,
  SpeechPolicyDefinition,
  SpeechPolicyDefinitionField,
  SpeechPolicyFootnoteMode,
  SpeechPolicyImageMode,
  SpeechPolicyListMarkerMode,
  SpeechPolicyMathMode,
  SpeechPolicyOverrides,
  SpeechPolicyQuoteMode,
  SpeechPolicySettings,
  SpeechPolicyTableHeaderMode,
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
    tableHeaderMode: "column",
    codeMode: "skip",
    mathMode: "skip",
    footnoteMode: "onDemand",
    imageMode: "altFirst",
    captionMode: "speak",
    citationMode: "onDemand",
    listMarkerMode: "omit",
    admonitionMode: "speak",
    quoteMode: "speak",
  },
  Education: {
    mode: "speak",
    tableMode: "summary",
    tableHeaderMode: "column",
    codeMode: "summary",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeShort",
    captionMode: "speak",
    citationMode: "inline",
    listMarkerMode: "announce",
    admonitionMode: "speak",
    quoteMode: "speak",
  },
  Accessibility: {
    mode: "speak",
    tableMode: "rowLinear",
    tableHeaderMode: "rowAndColumn",
    codeMode: "syntaxAware",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeLong",
    captionMode: "speak",
    citationMode: "inline",
    listMarkerMode: "announce",
    admonitionMode: "speak",
    quoteMode: "speak",
  },
  TechnicalDocs: {
    mode: "speak",
    tableMode: "rowLinear",
    tableHeaderMode: "rowAndColumn",
    codeMode: "syntaxAware",
    mathMode: "literalsafe",
    footnoteMode: "endnote",
    imageMode: "altFirst",
    captionMode: "speak",
    citationMode: "endnote",
    listMarkerMode: "announce",
    admonitionMode: "speak",
    quoteMode: "speak",
  },
  LanguageLearning: {
    mode: "speak",
    tableMode: "summary",
    tableHeaderMode: "column",
    codeMode: "literal",
    mathMode: "semantic",
    footnoteMode: "inline",
    imageMode: "describeShort",
    captionMode: "speak",
    citationMode: "inline",
    listMarkerMode: "announce",
    admonitionMode: "speak",
    quoteMode: "speak",
  },
};

export const TABLE_MODE_OPTIONS: SpeechPolicyTableMode[] = [
  "skip",
  "summary",
  "rowLinear",
  "interactive",
];
export const TABLE_HEADER_MODE_OPTIONS: SpeechPolicyTableHeaderMode[] = [
  "none",
  "column",
  "rowAndColumn",
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
export const CAPTION_MODE_OPTIONS: SpeechPolicyCaptionMode[] = ["skip", "speak", "onDemand"];
export const CITATION_MODE_OPTIONS: SpeechPolicyCitationMode[] = [
  "skip",
  "inline",
  "endnote",
  "onDemand",
];
export const LIST_MARKER_MODE_OPTIONS: SpeechPolicyListMarkerMode[] = ["omit", "announce"];
export const ADMONITION_MODE_OPTIONS: SpeechPolicyAdmonitionMode[] = ["skip", "speak", "summarise"];
export const QUOTE_MODE_OPTIONS: SpeechPolicyQuoteMode[] = ["skip", "speak", "summarise"];

export const DEFAULT_SPEECH_POLICY_DEFINITION: SpeechPolicyDefinition = {
  fields: [
    policyField("tableMode", "Tables", TABLE_MODE_OPTIONS),
    policyField("tableHeaderMode", "Table headers", TABLE_HEADER_MODE_OPTIONS),
    policyField("codeMode", "Code", CODE_MODE_OPTIONS),
    policyField("mathMode", "Math", MATH_MODE_OPTIONS),
    policyField("footnoteMode", "Notes", FOOTNOTE_MODE_OPTIONS),
    policyField("imageMode", "Images", IMAGE_MODE_OPTIONS),
    policyField("captionMode", "Captions", CAPTION_MODE_OPTIONS),
    policyField("citationMode", "Citations", CITATION_MODE_OPTIONS),
    policyField("listMarkerMode", "List markers", LIST_MARKER_MODE_OPTIONS),
    policyField("admonitionMode", "Admonitions", ADMONITION_MODE_OPTIONS),
    policyField("quoteMode", "Quotes", QUOTE_MODE_OPTIONS),
  ],
  profiles: SPEECH_POLICY_PROFILE_OPTIONS.map((name) => ({
    description: "",
    label: speechPolicyProfileLabel(name),
    name,
    settings: BUILT_IN_SPEECH_POLICY_SETTINGS[name],
  })),
};

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
    tableHeaderMode: includesMode(TABLE_HEADER_MODE_OPTIONS, candidate.tableHeaderMode)
      ? candidate.tableHeaderMode
      : undefined,
    codeMode: includesMode(CODE_MODE_OPTIONS, candidate.codeMode) ? candidate.codeMode : undefined,
    mathMode: includesMode(MATH_MODE_OPTIONS, candidate.mathMode) ? candidate.mathMode : undefined,
    footnoteMode: includesMode(FOOTNOTE_MODE_OPTIONS, candidate.footnoteMode)
      ? candidate.footnoteMode
      : undefined,
    imageMode: includesMode(IMAGE_MODE_OPTIONS, candidate.imageMode)
      ? candidate.imageMode
      : undefined,
    captionMode: includesMode(CAPTION_MODE_OPTIONS, candidate.captionMode)
      ? candidate.captionMode
      : undefined,
    citationMode: includesMode(CITATION_MODE_OPTIONS, candidate.citationMode)
      ? candidate.citationMode
      : undefined,
    listMarkerMode: includesMode(LIST_MARKER_MODE_OPTIONS, candidate.listMarkerMode)
      ? candidate.listMarkerMode
      : undefined,
    admonitionMode: includesMode(ADMONITION_MODE_OPTIONS, candidate.admonitionMode)
      ? candidate.admonitionMode
      : undefined,
    quoteMode: includesMode(QUOTE_MODE_OPTIONS, candidate.quoteMode)
      ? candidate.quoteMode
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
  if (overrides.tableHeaderMode) {
    output.tableHeaderMode = overrides.tableHeaderMode;
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
  if (overrides.captionMode) {
    output.captionMode = overrides.captionMode;
  }
  if (overrides.citationMode) {
    output.citationMode = overrides.citationMode;
  }
  if (overrides.listMarkerMode) {
    output.listMarkerMode = overrides.listMarkerMode;
  }
  if (overrides.admonitionMode) {
    output.admonitionMode = overrides.admonitionMode;
  }
  if (overrides.quoteMode) {
    output.quoteMode = overrides.quoteMode;
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
    tableHeaderMode: overrides.tableHeaderMode ?? settings.tableHeaderMode,
    codeMode: overrides.codeMode ?? settings.codeMode,
    mathMode: overrides.mathMode ?? settings.mathMode,
    footnoteMode: overrides.footnoteMode ?? settings.footnoteMode,
    imageMode: overrides.imageMode ?? settings.imageMode,
    captionMode: overrides.captionMode ?? settings.captionMode,
    citationMode: overrides.citationMode ?? settings.citationMode,
    listMarkerMode: overrides.listMarkerMode ?? settings.listMarkerMode,
    admonitionMode: overrides.admonitionMode ?? settings.admonitionMode,
    quoteMode: overrides.quoteMode ?? settings.quoteMode,
  };
}

function enterpriseDefaults(): SpeechPolicySettings {
  return { ...BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise };
}

function policyField(
  key: SpeechPolicyDefinitionField["key"],
  label: string,
  values: string[],
): SpeechPolicyDefinitionField {
  return {
    key,
    label,
    description: "",
    options: values.map((value) => ({ value, label: speechPolicyModeLabel(value) })),
  };
}

function speechPolicyModeLabel(value: string): string {
  const spaced = value.replaceAll(/([A-Z])/g, " $1");
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).replaceAll(
    "Row And Column",
    "Row and column",
  );
}

function includesMode<const T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}
