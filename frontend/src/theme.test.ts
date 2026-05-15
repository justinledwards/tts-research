import { describe, expect, it } from "vitest";
import { getTheme, normalizeThemeName, VOICE_STUDIO_THEMES } from "./theme";

describe("Voice Studio themes", () => {
  it("normalizes persisted theme names", () => {
    expect(normalizeThemeName("light")).toBe("light");
    expect(normalizeThemeName("dark")).toBe("dark");
    expect(normalizeThemeName("dawn")).toBe("dawn");
    expect(normalizeThemeName("night")).toBe("night");
    expect(normalizeThemeName("tokyo")).toBe("light");
  });

  it("keeps dark and night visually distinct", () => {
    const dark = getTheme("dark");
    const night = getTheme("night");

    expect(VOICE_STUDIO_THEMES.map((theme) => theme.name)).toEqual([
      "light",
      "dark",
      "dawn",
      "night",
    ]);
    expect(dark.swatches.background).not.toBe(night.swatches.background);
    expect(dark.swatches.surface).not.toBe(night.swatches.surface);
    expect(night.description).toContain("reading");
  });
});
