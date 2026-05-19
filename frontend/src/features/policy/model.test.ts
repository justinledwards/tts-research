import { describe, expect, it } from "vitest";
import { DEFAULT_SPEECH_POLICY_DEFINITION } from "../../speechPolicy";
import {
  policyScopeChips,
  sessionSpeechPolicyRequest,
  sourcePolicyUpdateRequest,
  speechPolicyProfileOptions,
} from "./model";

describe("policy scope model", () => {
  it("shows project, source, session, and current policy layers", () => {
    const chips = policyScopeChips({
      projectProfile: "Enterprise",
      resolvedProfile: "Accessibility",
      sessionOverrides: { codeMode: "literal" },
      sourceOverrides: { quoteMode: "summarise" },
      sourceProfile: "Accessibility",
    });

    expect(chips.map((chip) => [chip.id, chip.isActive, chip.detail])).toEqual([
      ["current", true, "Accessibility"],
      ["project", false, "Enterprise"],
      ["source", true, "Accessibility · 1 field"],
      ["session", true, "1 field"],
    ]);
  });

  it("omits empty session policy payloads so project profile stays project scoped", () => {
    expect(sessionSpeechPolicyRequest({})).toEqual({});
    expect(sessionSpeechPolicyRequest({ codeMode: "literal" })).toEqual({
      overrides: { codeMode: "literal" },
    });
  });

  it("normalizes source pin requests and profile options", () => {
    expect(sourcePolicyUpdateRequest("Accessibility", { codeMode: "literal" })).toEqual({
      overrides: { codeMode: "literal" },
      profile: "Accessibility",
    });
    expect(
      speechPolicyProfileOptions(
        DEFAULT_SPEECH_POLICY_DEFINITION,
        [],
        [{ id: "custom-reader", name: "Reader" }],
      ).at(-1),
    ).toEqual({ label: "Reader", name: "custom-reader" });
  });
});
