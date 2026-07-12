import { describe, expect, it } from "vitest";
import {
  accessibilityPresetForSettings,
  applyAccessibilityPreset,
  auditAccessibilityControls,
} from "./accessibilityAudit";

describe("accessibility audit foundations", () => {
  it("maps reader presets to concrete accessibility settings", () => {
    const preset = applyAccessibilityPreset("lowVision");

    expect(preset).toMatchObject({
      highContrast: true,
      lineSpacing: "spacious",
      measure: "narrow",
      reducedMotion: true,
      textScale: "giant",
    });
    expect(accessibilityPresetForSettings(preset)).toBe("lowVision");
  });

  it("reports unnamed, unexplained, and undersized controls", () => {
    const summary = auditAccessibilityControls([
      {
        accessibleName: "",
        disabled: true,
        disabledReason: "",
        height: 32,
        id: "unnamed",
        role: null,
        visibleLabel: "",
        width: 40,
      },
    ]);

    expect(summary.failCount).toBe(2);
    expect(summary.warningCount).toBe(2);
    expect(summary.issues.map((issue) => issue.ruleId)).toEqual([
      "control-name",
      "disabled-reason",
      "touch-target",
      "control-role",
    ]);
  });

  it("allows compact visual controls when the hit area meets the shared minimum", () => {
    const summary = auditAccessibilityControls([
      {
        accessibleName: "Collapse rail",
        disabled: false,
        height: 28,
        hitAreaHeight: 44,
        hitAreaWidth: 44,
        id: "ui-action-rail-voice-command-compact",
        role: "button",
        stableTestId: "ui-action-rail-voice-command-compact",
        surface: "Voice Command rail",
        visibleLabel: "Compact",
        width: 40,
      },
    ]);

    expect(summary.warningCount).toBe(0);
    expect(summary.issues).toEqual([]);
  });
});
