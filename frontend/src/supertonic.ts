export interface SupertonicLanguageOption {
  code: string;
  label: string;
}

export const SUPERTONIC_VOICE_STYLES = [
  "M1",
  "M2",
  "M3",
  "M4",
  "M5",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
] as const;

export const SUPERTONIC_LANGUAGE_OPTIONS: SupertonicLanguageOption[] = [
  { code: "ar", label: "Arabic" },
  { code: "bg", label: "Bulgarian" },
  { code: "hr", label: "Croatian" },
  { code: "cs", label: "Czech" },
  { code: "da", label: "Danish" },
  { code: "nl", label: "Dutch" },
  { code: "en", label: "English" },
  { code: "et", label: "Estonian" },
  { code: "fi", label: "Finnish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "el", label: "Greek" },
  { code: "hi", label: "Hindi" },
  { code: "hu", label: "Hungarian" },
  { code: "id", label: "Indonesian" },
  { code: "it", label: "Italian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "lv", label: "Latvian" },
  { code: "lt", label: "Lithuanian" },
  { code: "pl", label: "Polish" },
  { code: "pt", label: "Portuguese" },
  { code: "ro", label: "Romanian" },
  { code: "ru", label: "Russian" },
  { code: "sk", label: "Slovak" },
  { code: "sl", label: "Slovenian" },
  { code: "es", label: "Spanish" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
  { code: "uk", label: "Ukrainian" },
  { code: "vi", label: "Vietnamese" },
  { code: "na", label: "Language agnostic" },
];

export const SUPERTONIC_LANGUAGE_CODES = new Set(
  SUPERTONIC_LANGUAGE_OPTIONS.map((language) => language.code),
);

export function supertonicLanguageLabel(code: string): string {
  const language = SUPERTONIC_LANGUAGE_OPTIONS.find((option) => option.code === code);
  return language ? `${language.label} · ${language.code}` : code;
}
