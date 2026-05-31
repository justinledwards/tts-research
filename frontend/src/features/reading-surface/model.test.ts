import { describe, expect, it } from "vitest";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import {
  applyReaderTypographyPreset,
  normalizeReadingTypographyPresetId,
  readerTypographyPresetForSettings,
  readingSurfaceDataAttributes,
  readingSurfaceMetricsFromElement,
} from "./model";

describe("reading surface model", () => {
  it("maps typography presets onto existing reader settings", () => {
    expect(
      applyReaderTypographyPreset("editor", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      lineSpacing: "compact",
      measure: "wide",
      textScale: "comfortable",
    });
    expect(
      applyReaderTypographyPreset("teleprompt", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      lineSpacing: "comfortable",
      measure: "narrow",
      textScale: "large",
    });
    expect(
      applyReaderTypographyPreset("theatre", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
    ).toMatchObject({
      highContrast: true,
      lineSpacing: "compact",
      measure: "narrow",
      textScale: "giant",
    });
  });

  it("normalizes unknown preset ids without requiring storage migration", () => {
    expect(normalizeReadingTypographyPresetId("teleprompt")).toBe("teleprompt");
    expect(normalizeReadingTypographyPresetId("unknown")).toBe("editor");
    expect(normalizeReadingTypographyPresetId(null)).toBe("editor");
  });

  it("recognizes stored settings that match typography presets", () => {
    expect(
      readerTypographyPresetForSettings(
        applyReaderTypographyPreset("teleprompt", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
      ),
    ).toBe("teleprompt");
    expect(
      readerTypographyPresetForSettings(
        applyReaderTypographyPreset("theatre", DEFAULT_READER_ACCESSIBILITY_SETTINGS),
      ),
    ).toBe("theatre");
  });

  it("publishes line length, line height, and active emphasis data attributes", () => {
    expect(readingSurfaceDataAttributes({ active: true, kind: "theatre" })).toMatchObject({
      "data-reading-active-emphasis": "dominant",
      "data-reading-measure-ch": "24",
      "data-reading-surface": "theatre",
      "data-reading-typography-preset": "theatre",
    });
  });

  it("derives comparable reader metrics from measured elements", () => {
    expect(
      readingSurfaceMetricsFromElement({
        fontSizePx: 20,
        frameWidthPx: 1200,
        lineHeightPx: 33,
        measurePx: 660,
        visibleActionCount: 4,
        visibleBorderCount: 2,
      }),
    ).toEqual({
      approximateCharactersPerLine: 66,
      lineHeightRatio: 1.65,
      measurePx: 660,
      visualChromeCount: 6,
    });
  });
});
