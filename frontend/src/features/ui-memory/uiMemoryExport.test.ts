import { describe, expect, it } from "vitest";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { defaultUiMemoryState } from "../preferences";
import { buildUiMemoryExportPayload, parseUiMemoryImportJson } from "./uiMemoryExport";

describe("UI memory export", () => {
  it("omits private runtime artifacts from preferences JSON", () => {
    const payload = buildUiMemoryExportPayload({
      lastProjectId: "alpha",
      readerAccessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      readAlongPreferences: DEFAULT_READ_ALONG_PREFERENCES,
      themeName: "dark",
      uiMemory: defaultUiMemoryState({
        rememberLastProject: true,
        rememberReaderPreferences: true,
        rememberTheme: true,
      }),
    });

    expect(payload.kind).toBe("tts-ui-preferences");
    expect(payload.preferences.lastProjectId).toBe("alpha");
    expect(payload.preferences.themeName).toBe("dark");
    expect(payload.preferences.readerAccessibilitySettings).toEqual(
      DEFAULT_READER_ACCESSIBILITY_SETTINGS,
    );
    expect(payload.preferences.readAlongPreferences).toEqual(DEFAULT_READ_ALONG_PREFERENCES);
    expect(payload.omitted).toContain("generated audio");
    expect(payload.omitted).toContain("model paths");
    expect(payload.omitted).toContain("provider secrets");
    expect(payload.omitted).toContain("private project content");
  });

  it("honors disabled preference categories when exporting", () => {
    const payload = buildUiMemoryExportPayload({
      lastProjectId: "alpha",
      readerAccessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
      readAlongPreferences: DEFAULT_READ_ALONG_PREFERENCES,
      themeName: "dark",
      uiMemory: defaultUiMemoryState({
        rememberLastProject: false,
        rememberReaderPreferences: false,
        rememberTheme: false,
      }),
    });

    expect(payload.preferences.lastProjectId).toBeUndefined();
    expect(payload.preferences.readerAccessibilitySettings).toBeUndefined();
    expect(payload.preferences.readAlongPreferences).toBeUndefined();
    expect(payload.preferences.themeName).toBeUndefined();
  });

  it("imports known preference fields and rejects unrelated JSON", () => {
    const payload = buildUiMemoryExportPayload({
      lastProjectId: "alpha",
      readerAccessibilitySettings: {
        ...DEFAULT_READER_ACCESSIBILITY_SETTINGS,
        highContrast: true,
      },
      readAlongPreferences: {
        ...DEFAULT_READ_ALONG_PREFERENCES,
        highlightGranularity: "phrase",
      },
      themeName: "night",
      uiMemory: defaultUiMemoryState({
        rememberLastProject: true,
        rememberReaderPreferences: true,
        rememberTheme: true,
      }),
    });

    const imported = parseUiMemoryImportJson(JSON.stringify(payload));

    expect(imported.lastProjectId).toBe("alpha");
    expect(imported.readerAccessibilitySettings?.highContrast).toBe(true);
    expect(imported.readAlongPreferences?.highlightGranularity).toBe("phrase");
    expect(imported.themeName).toBe("night");
    expect(() => parseUiMemoryImportJson("{}")).toThrow(/not a Voice Studio/i);
  });
});
