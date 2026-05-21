import { describe, expect, it } from "vitest";
import {
  canonicalLocale,
  defaultSpeechPolicyProfileForLanguage,
  languageDirection,
  languageDisplayName,
  uiString,
} from "./i18nRegistry";

describe("i18n registry", () => {
  it("normalizes language labels, locale fallback, and direction", () => {
    expect(languageDisplayName("sv-SE")).toBe("Swedish");
    expect(canonicalLocale("sv")).toBe("sv-SE");
    expect(languageDirection("ar")).toBe("rtl");
  });

  it("keeps UI labels and speech policy defaults centralized", () => {
    expect(uiString("accessibility.preset")).toBe("Accessibility preset");
    expect(defaultSpeechPolicyProfileForLanguage("ja-JP")).toBe("LanguageLearning");
    expect(defaultSpeechPolicyProfileForLanguage("en-US")).toBe("Enterprise");
  });
});
