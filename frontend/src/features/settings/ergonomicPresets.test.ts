import { describe, expect, it } from "vitest";
import { createRunConfiguration } from "../../runConfig";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { DEFAULT_TELEPROMPT_THEATRE_SETTINGS } from "../teleprompt/telepromptTheatreSettings";
import {
  ERGONOMIC_PRESET_IDS,
  ERGONOMIC_PRESETS,
  applyErgonomicPresetDefaults,
  ergonomicPresetById,
} from "./ergonomicPresets";

describe("ergonomic presets", () => {
  it("defines the expected use-case presets", () => {
    expect(ERGONOMIC_PRESETS.map((preset) => preset.id)).toEqual([...ERGONOMIC_PRESET_IDS]);
    expect(ERGONOMIC_PRESETS.map((preset) => preset.label)).toEqual([
      "Long-form book listening",
      "Focused study",
      "Proofing/review",
      "Accessibility-first",
      "Teleprompt recording",
      "Low-resource laptop",
      "Website article reading",
    ]);
  });

  it("applies display and playback defaults without changing policy implicitly", () => {
    const applied = applyErgonomicPresetDefaults("lowResourceLaptop", {
      readerAccessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      readAlongPreferences: {
        ...DEFAULT_READ_ALONG_PREFERENCES,
        globalHighlightOffsetMs: 75,
        providerOffsetsMs: { kokoro: -30 },
        scope: "project",
      },
      runConfiguration: {
        ...createRunConfiguration("publishMaster"),
        engineOptions: { voice: "studio" },
        ttsEngine: "kokoro",
      },
      telepromptTheatreSettings: DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
    });

    expect("speechPolicyProfile" in applied).toBe(false);
    expect(applied.readerAccessibilitySettings.reducedMotion).toBe(true);
    expect(applied.readAlongPreferences.highlightGranularity).toBe("block");
    expect(applied.readAlongPreferences.scope).toBe("project");
    expect(applied.readAlongPreferences.globalHighlightOffsetMs).toBe(75);
    expect(applied.readAlongPreferences.providerOffsetsMs).toEqual({ kokoro: -30 });
    expect(applied.runConfiguration.runMode).toBe("fastCreate");
    expect(applied.runConfiguration.performanceMode).toBe("throughput");
    expect(applied.runConfiguration.ttsEngine).toBe("kokoro");
    expect(applied.runConfiguration.engineOptions).toEqual({ voice: "studio" });
    expect(applied.telepromptTheatreSettings.presetId).toBe("laptopPresenter");
  });

  it("keeps policy recommendations transparent and separate", () => {
    const preset = ergonomicPresetById("accessibilityFirst");

    expect(preset.speechPolicyProfile).toBe("Accessibility");
    expect(preset.readerDisplayPreset).toBe("lowVision");
    expect(preset.telepromptTheatrePreset).toBe("lowVision");
  });
});
