import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUILT_IN_SPEECH_POLICY_SETTINGS,
  DEFAULT_SPEECH_POLICY_DEFINITION,
  applySpeechPolicyOverridesToSettings,
  clearSpeechPolicyOverrides,
  loadSpeechPolicyOverrides,
  normalizeSpeechPolicyOverrides,
  normalizeSpeechPolicyProfile,
  resolveSpeechPolicySettings,
  saveSpeechPolicyOverrides,
  speechPolicyOverrideKey,
} from "./speechPolicy";
import type { CustomSpeechPolicyProfile, SpeechPolicyProfile } from "./types";

describe("speech policy helpers", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: {
        clear: () => {
          values.clear();
        },
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => {
          values.delete(key);
        },
        setItem: (key: string, value: string) => {
          values.set(key, value);
        },
      },
    });
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it("normalizes profile names while preserving project custom ids", () => {
    expect(normalizeSpeechPolicyProfile("Accessibility")).toBe("Accessibility");
    expect(normalizeSpeechPolicyProfile("custom-reader")).toBe("custom-reader");
    expect(normalizeSpeechPolicyProfile(null)).toBe("Enterprise");
  });

  it("resolves custom profile settings and layers temporary overrides last", () => {
    const profiles: SpeechPolicyProfile[] = [
      {
        description: "",
        label: "Enterprise",
        name: "Enterprise",
        settings: BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
      },
    ];
    const customProfiles: CustomSpeechPolicyProfile[] = [
      {
        id: "custom-reader",
        name: "Reader",
        baseProfile: "Enterprise",
        settings: {
          ...BUILT_IN_SPEECH_POLICY_SETTINGS.Enterprise,
          codeMode: "literal",
          citationMode: "inline",
          footnoteMode: "inline",
        },
        createdAt: "2026-05-16T12:00:00Z",
        updatedAt: "2026-05-16T12:00:00Z",
      },
    ];

    const base = resolveSpeechPolicySettings("custom-reader", profiles, customProfiles);
    expect(base.codeMode).toBe("literal");
    expect(base.citationMode).toBe("inline");
    expect(base.footnoteMode).toBe("inline");
    const effective = applySpeechPolicyOverridesToSettings(base, {
      captionMode: "onDemand",
      codeMode: "skip",
      tableHeaderMode: "rowAndColumn",
    });
    expect(effective.captionMode).toBe("onDemand");
    expect(effective.codeMode).toBe("skip");
    expect(effective.tableHeaderMode).toBe("rowAndColumn");
  });

  it("keeps only supported override modes", () => {
    expect(
      normalizeSpeechPolicyOverrides({
        codeMode: "literal",
        captionMode: "onDemand",
        citationMode: "endnote",
        footnoteMode: "inline",
        imageMode: "unknown",
        listMarkerMode: "announce",
        tableMode: "rowLinear",
      }),
    ).toEqual({
      captionMode: "onDemand",
      citationMode: "endnote",
      codeMode: "literal",
      footnoteMode: "inline",
      listMarkerMode: "announce",
      tableMode: "rowLinear",
    });
  });

  it("exposes the shared policy definition fields used by settings controls", () => {
    expect(DEFAULT_SPEECH_POLICY_DEFINITION.fields.map((field) => field.key)).toEqual([
      "tableMode",
      "tableHeaderMode",
      "codeMode",
      "mathMode",
      "footnoteMode",
      "imageMode",
      "captionMode",
      "citationMode",
      "listMarkerMode",
      "admonitionMode",
      "quoteMode",
    ]);
    expect(
      DEFAULT_SPEECH_POLICY_DEFINITION.fields.find((field) => field.key === "tableHeaderMode")
        ?.options,
    ).toContainEqual({ value: "rowAndColumn", label: "Row and column" });
  });

  it("stores temporary overrides in session storage per project", () => {
    saveSpeechPolicyOverrides("alpha", { codeMode: "literal" });
    saveSpeechPolicyOverrides("beta", { tableMode: "skip" });

    expect(loadSpeechPolicyOverrides("alpha")).toEqual({ codeMode: "literal" });
    expect(loadSpeechPolicyOverrides("beta")).toEqual({ tableMode: "skip" });
    expect(sessionStorage.getItem(speechPolicyOverrideKey("alpha"))).toContain("literal");

    clearSpeechPolicyOverrides("alpha");
    expect(loadSpeechPolicyOverrides("alpha")).toEqual({});
    expect(loadSpeechPolicyOverrides("beta")).toEqual({ tableMode: "skip" });
  });
});
