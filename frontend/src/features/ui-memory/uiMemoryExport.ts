import {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  normalizeReaderAccessibilitySettings,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
import {
  DEFAULT_READ_ALONG_PREFERENCES,
  normalizeReadAlongPreferences,
  type ReadAlongPreferences,
} from "../readalong";
import {
  DEFAULT_UI_MEMORY_PREFERENCES,
  normalizeUiMemoryState,
  persistableUiMemoryState,
  type UiMemoryState,
} from "../preferences";
import { UI_MEMORY_EXPORT_OMITTED_ITEMS } from "../privacy";
import { DEFAULT_THEME_NAME, normalizeThemeName } from "../../theme";
import type { ThemeName } from "../../types";

export const UI_MEMORY_EXPORT_KIND = "tts-ui-preferences";
export const UI_MEMORY_EXPORT_VERSION = 1;

export interface UiMemoryExportInput {
  readonly lastProjectId: string;
  readonly readerAccessibilitySettings: ReaderAccessibilitySettings;
  readonly readAlongPreferences: ReadAlongPreferences;
  readonly themeName: ThemeName;
  readonly uiMemory: UiMemoryState;
}

export interface UiMemoryExportPayload {
  readonly exportedAt: string;
  readonly kind: typeof UI_MEMORY_EXPORT_KIND;
  readonly omitted: readonly string[];
  readonly preferences: {
    readonly lastProjectId?: string;
    readonly readerAccessibilitySettings?: ReaderAccessibilitySettings;
    readonly readAlongPreferences?: ReadAlongPreferences;
    readonly themeName?: ThemeName;
    readonly uiMemory: UiMemoryState;
  };
  readonly version: typeof UI_MEMORY_EXPORT_VERSION;
}

export interface UiMemoryImportResult {
  readonly lastProjectId?: string;
  readonly readerAccessibilitySettings?: ReaderAccessibilitySettings;
  readonly readAlongPreferences?: ReadAlongPreferences;
  readonly themeName?: ThemeName;
  readonly uiMemory: UiMemoryState;
}

export function buildUiMemoryExportPayload(input: UiMemoryExportInput): UiMemoryExportPayload {
  const uiMemory = persistableUiMemoryState(input.uiMemory);
  return {
    exportedAt: new Date().toISOString(),
    kind: UI_MEMORY_EXPORT_KIND,
    omitted: UI_MEMORY_EXPORT_OMITTED_ITEMS,
    preferences: {
      lastProjectId: uiMemory.rememberLastProject ? cleanProjectId(input.lastProjectId) : undefined,
      readerAccessibilitySettings: uiMemory.rememberReaderPreferences
        ? normalizeReaderAccessibilitySettings(input.readerAccessibilitySettings)
        : undefined,
      readAlongPreferences: uiMemory.rememberReaderPreferences
        ? normalizeReadAlongPreferences(input.readAlongPreferences)
        : undefined,
      themeName: uiMemory.rememberTheme ? normalizeThemeName(input.themeName) : undefined,
      uiMemory,
    },
    version: UI_MEMORY_EXPORT_VERSION,
  };
}

export function buildUiMemoryExportJson(input: UiMemoryExportInput): string {
  return `${JSON.stringify(buildUiMemoryExportPayload(input), null, 2)}\n`;
}

export function parseUiMemoryImportJson(json: string): UiMemoryImportResult {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Import JSON must be an object.");
  }
  const candidate = parsed as Partial<UiMemoryExportPayload>;
  if (candidate.kind !== UI_MEMORY_EXPORT_KIND) {
    throw new Error("This is not a Voice Studio UI preferences export.");
  }
  const preferences = candidate.preferences as
    | Partial<UiMemoryExportPayload["preferences"]>
    | undefined;
  if (!preferences || typeof preferences !== "object") {
    throw new Error("The preferences export does not include a preferences object.");
  }
  const importedUiMemory = normalizeUiMemoryState(
    preferences.uiMemory ?? DEFAULT_UI_MEMORY_PREFERENCES,
  );
  const result: {
    lastProjectId?: string;
    readerAccessibilitySettings?: ReaderAccessibilitySettings;
    readAlongPreferences?: ReadAlongPreferences;
    themeName?: ThemeName;
    uiMemory: UiMemoryState;
  } = {
    uiMemory: importedUiMemory,
  };
  if (importedUiMemory.rememberTheme && preferences.themeName) {
    result.themeName = normalizeThemeName(preferences.themeName);
  }
  if (importedUiMemory.rememberReaderPreferences && preferences.readerAccessibilitySettings) {
    result.readerAccessibilitySettings = normalizeReaderAccessibilitySettings(
      preferences.readerAccessibilitySettings,
    );
  }
  if (importedUiMemory.rememberReaderPreferences && preferences.readAlongPreferences) {
    result.readAlongPreferences = normalizeReadAlongPreferences(preferences.readAlongPreferences);
  }
  if (importedUiMemory.rememberLastProject && preferences.lastProjectId) {
    result.lastProjectId = cleanProjectId(preferences.lastProjectId);
  }
  return result;
}

export function defaultUiMemoryImportResult(): UiMemoryImportResult {
  return {
    readerAccessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
    readAlongPreferences: DEFAULT_READ_ALONG_PREFERENCES,
    themeName: DEFAULT_THEME_NAME,
    uiMemory: normalizeUiMemoryState(DEFAULT_UI_MEMORY_PREFERENCES),
  };
}

function cleanProjectId(value: unknown): string {
  if (typeof value !== "string") {
    return "default";
  }
  const clean = value.trim();
  return clean.length > 0 ? clean : "default";
}
