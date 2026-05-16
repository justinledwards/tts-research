import { describe, expect, it } from "vitest";
import {
  SUPERTONIC_LANGUAGE_CODES,
  SUPERTONIC_LANGUAGE_OPTIONS,
  SUPERTONIC_VOICE_STYLES,
  supertonicLanguageLabel,
} from "./supertonic";

describe("Supertonic options", () => {
  it("exposes 31 languages plus language-agnostic mode", () => {
    expect(SUPERTONIC_LANGUAGE_OPTIONS).toHaveLength(32);
    for (const code of [
      "ar",
      "bg",
      "hr",
      "cs",
      "da",
      "nl",
      "en",
      "et",
      "fi",
      "fr",
      "de",
      "el",
      "hi",
      "hu",
      "id",
      "it",
      "ja",
      "ko",
      "lv",
      "lt",
      "pl",
      "pt",
      "ro",
      "ru",
      "sk",
      "sl",
      "es",
      "sv",
      "tr",
      "uk",
      "vi",
      "na",
    ]) {
      expect(SUPERTONIC_LANGUAGE_CODES.has(code)).toBe(true);
    }
  });

  it("exposes all ten Supertonic voice styles", () => {
    expect(SUPERTONIC_VOICE_STYLES).toEqual([
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
    ]);
    expect(supertonicLanguageLabel("na")).toBe("Language agnostic · na");
  });
});
