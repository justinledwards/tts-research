import { KOKORO_VOICEPACKS, type KokoroVoicepack } from "../../kokoroVoices";
import { SUPERTONIC_LANGUAGE_OPTIONS } from "../../supertonic";
import type { TTSEngineDiagnostics, VoiceProfile } from "../../types";
import { languageDisplayName, localeForLanguageCode } from "./i18nRegistry";

const KOKORO_LANGUAGE_CODES_BY_I18N: Readonly<
  Record<string, readonly KokoroVoicepack["langCode"][]>
> = {
  en: ["a", "b"],
  es: ["e"],
  fr: ["f"],
  hi: ["h"],
  it: ["i"],
  ja: ["j"],
  pt: ["p"],
  zh: ["z"],
};

export interface LanguageVoiceOption<T> {
  languageMatched: boolean;
  voice: T;
}

export function kokoroVoicepacksForLanguage(
  language: string | null | undefined,
  voicepacks: readonly KokoroVoicepack[] = KOKORO_VOICEPACKS,
): KokoroVoicepack[] {
  const langCodes = kokoroLanguageCodesForLanguage(language);
  if (langCodes.length === 0) {
    return [...voicepacks];
  }
  const exact = voicepacks.filter((voicepack) => langCodes.includes(voicepack.langCode));
  return exact.length > 0 ? exact : [...voicepacks];
}

export function orderedKokoroVoicepacksForLanguage(
  language: string | null | undefined,
  voicepacks: readonly KokoroVoicepack[] = KOKORO_VOICEPACKS,
): LanguageVoiceOption<KokoroVoicepack>[] {
  const langCodes = kokoroLanguageCodesForLanguage(language);
  return (
    voicepacks
      .map((voice) => ({ languageMatched: langCodes.includes(voice.langCode), voice }))
      // eslint-disable-next-line unicorn/no-array-sort -- toSorted is not available in this TS lib.
      .sort((left, right) => Number(right.languageMatched) - Number(left.languageMatched))
  );
}

export function defaultKokoroVoicepackForLanguage(
  language: string | null | undefined,
): KokoroVoicepack {
  return kokoroVoicepacksForLanguage(language)[0] ?? KOKORO_VOICEPACKS[0];
}

export function voiceProfilesForLanguage(
  language: string | null | undefined,
  profiles: readonly VoiceProfile[],
): VoiceProfile[] {
  const code = canonicalLanguageCode(language);
  const preferred = profiles.filter((profile) => canonicalLanguageCode(profile.language) === code);
  return preferred.length > 0 ? preferred : [...profiles];
}

export function voiceProfileMatchesLanguage(
  language: string | null | undefined,
  profile: VoiceProfile,
): boolean {
  return canonicalLanguageCode(profile.language) === canonicalLanguageCode(language);
}

export function languageAwareVoiceSummary(
  language: string | null | undefined,
  profiles: readonly VoiceProfile[],
): string {
  const label = languageDisplayName(language);
  const matchingProfiles = voiceProfilesForLanguage(language, profiles).filter((profile) =>
    voiceProfileMatchesLanguage(language, profile),
  );
  const profileCount = matchingProfiles.length;
  const langCodes = kokoroLanguageCodesForLanguage(language);
  const kokoroCount =
    langCodes.length > 0
      ? KOKORO_VOICEPACKS.filter((voicepack) => langCodes.includes(voicepack.langCode)).length
      : 0;
  return `${label}: ${profileCount.toString()} saved profile${
    profileCount === 1 ? "" : "s"
  }, ${kokoroCount.toString()} language-matched Kokoro voicepack${kokoroCount === 1 ? "" : "s"}`;
}

export function languageOptionsForEngine(engine: TTSEngineDiagnostics | undefined) {
  const supportedCodes = new Set(
    engine?.languages && engine.languages.length > 0
      ? engine.languages
      : SUPERTONIC_LANGUAGE_OPTIONS.map((language) => language.code),
  );
  return SUPERTONIC_LANGUAGE_OPTIONS.filter((language) => supportedCodes.has(language.code)).map(
    (language) => ({
      ...language,
      locale: localeForLanguageCode(language.code),
    }),
  );
}

function kokoroLanguageCodesForLanguage(
  language: string | null | undefined,
): readonly KokoroVoicepack["langCode"][] {
  return KOKORO_LANGUAGE_CODES_BY_I18N[canonicalLanguageCode(language)] ?? [];
}

function canonicalLanguageCode(value: string | null | undefined): string {
  const clean = value?.trim();
  return clean ? clean.split(/[-_]/)[0]?.toLowerCase() || "en" : "en";
}
