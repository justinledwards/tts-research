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
});
