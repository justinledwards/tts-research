import type { BuiltInSpeechPolicyProfileName } from "../../types";

export type UiStringId =
  | "accessibility.preset"
  | "accessibility.reducedMotion"
  | "accessibility.highContrast"
  | "accessibility.textScale"
  | "accessibility.lineSpacing"
  | "accessibility.measure"
  | "common.close"
  | "common.language"
  | "common.voice"
  | "settings.reader";

export interface I18nLanguageMeta {
  code: string;
  direction: "ltr" | "rtl";
  fallbackLocale: string;
  label: string;
  speechPolicyProfile: BuiltInSpeechPolicyProfileName;
}

export const DEFAULT_UI_LOCALE = "en-US";

export const UI_STRINGS: Readonly<Record<UiStringId, string>> = {
  "accessibility.highContrast": "High contrast",
  "accessibility.lineSpacing": "Line spacing",
  "accessibility.measure": "Measure",
  "accessibility.preset": "Accessibility preset",
  "accessibility.reducedMotion": "Reduced motion",
  "accessibility.textScale": "Text scale",
  "common.close": "Close",
  "common.language": "Language",
  "common.voice": "Voice",
  "settings.reader": "Reader",
};

export const I18N_LANGUAGES: readonly I18nLanguageMeta[] = [
  language("en", "English", "en-US", "Enterprise"),
  language("sv", "Swedish", "sv-SE", "Education"),
  language("fr", "French", "fr-FR", "Education"),
  language("de", "German", "de-DE", "Education"),
  language("es", "Spanish", "es-ES", "Education"),
  language("pt", "Portuguese", "pt-BR", "Education"),
  language("it", "Italian", "it-IT", "Education"),
  language("ja", "Japanese", "ja-JP", "LanguageLearning"),
  language("zh", "Mandarin Chinese", "zh-CN", "LanguageLearning"),
  language("hi", "Hindi", "hi-IN", "LanguageLearning"),
  language("ar", "Arabic", "ar", "LanguageLearning", "rtl"),
];

export function uiString(id: UiStringId): string {
  return UI_STRINGS[id];
}

export function canonicalLanguageCode(value: string | null | undefined): string {
  const clean = value?.trim();
  if (!clean) {
    return "en";
  }
  return clean.split(/[-_]/)[0]?.toLowerCase() || "en";
}

export function canonicalLocale(value: string | null | undefined): string {
  const language = languageMeta(value);
  if (value?.trim() && value.includes("-")) {
    return value.trim().replace("_", "-");
  }
  return language.fallbackLocale;
}

export function languageMeta(value: string | null | undefined): I18nLanguageMeta {
  const code = canonicalLanguageCode(value);
  return I18N_LANGUAGES.find((language) => language.code === code) ?? I18N_LANGUAGES[0];
}

export function languageDisplayName(value: string | null | undefined): string {
  return languageMeta(value).label;
}

export function languageDirection(value: string | null | undefined): I18nLanguageMeta["direction"] {
  return languageMeta(value).direction;
}

export function localeForLanguageCode(value: string | null | undefined): string {
  return languageMeta(value).fallbackLocale;
}

export function defaultSpeechPolicyProfileForLanguage(
  value: string | null | undefined,
): BuiltInSpeechPolicyProfileName {
  return languageMeta(value).speechPolicyProfile;
}

export function formatLocaleNumber(value: number, locale = DEFAULT_UI_LOCALE): string {
  return new Intl.NumberFormat(canonicalLocale(locale)).format(value);
}

export function formatLocaleDate(value: string | Date, locale = DEFAULT_UI_LOCALE): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "recently";
  }
  return new Intl.DateTimeFormat(canonicalLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function language(
  code: string,
  label: string,
  fallbackLocale: string,
  speechPolicyProfile: BuiltInSpeechPolicyProfileName,
  direction: I18nLanguageMeta["direction"] = "ltr",
): I18nLanguageMeta {
  return {
    code,
    direction,
    fallbackLocale,
    label,
    speechPolicyProfile,
  };
}
