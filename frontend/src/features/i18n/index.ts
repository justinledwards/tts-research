export {
  DEFAULT_UI_LOCALE,
  I18N_LANGUAGES,
  UI_STRINGS,
  canonicalLanguageCode,
  canonicalLocale,
  defaultSpeechPolicyProfileForLanguage,
  formatLocaleDate,
  formatLocaleNumber,
  languageDirection,
  languageDisplayName,
  languageMeta,
  localeForLanguageCode,
  uiString,
  type I18nLanguageMeta,
  type UiStringId,
} from "./i18nRegistry";

export {
  defaultKokoroVoicepackForLanguage,
  kokoroVoicepacksForLanguage,
  languageAwareVoiceSummary,
  languageOptionsForEngine,
  orderedKokoroVoicepacksForLanguage,
  voiceProfileMatchesLanguage,
  voiceProfilesForLanguage,
  type LanguageVoiceOption,
} from "./languageVoiceMapping";
