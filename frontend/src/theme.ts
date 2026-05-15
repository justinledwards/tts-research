import type { ThemeName } from "./types";

export const THEME_STORAGE_KEY = "tts-theme";

export interface VoiceStudioTheme {
  name: ThemeName;
  label: string;
  description: string;
  swatches: {
    background: string;
    surface: string;
    raised: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    success: string;
    generating: string;
    queued: string;
  };
}

export const VOICE_STUDIO_THEMES: VoiceStudioTheme[] = [
  {
    name: "light",
    label: "Light",
    description: "Clean productivity",
    swatches: {
      background: "#ffffff",
      surface: "#f8fafc",
      raised: "#ffffff",
      text: "#111827",
      muted: "#667085",
      border: "#e4e7eb",
      accent: "#ff6a00",
      success: "#16a34a",
      generating: "#2563eb",
      queued: "#f59e0b",
    },
  },
  {
    name: "dark",
    label: "Dark",
    description: "Neutral work",
    swatches: {
      background: "#0b0f14",
      surface: "#111827",
      raised: "#151a22",
      text: "#f9fafb",
      muted: "#9ca3af",
      border: "#2f333b",
      accent: "#ff6a00",
      success: "#22c55e",
      generating: "#3b82f6",
      queued: "#fbbf24",
    },
  },
  {
    name: "dawn",
    label: "Dawn",
    description: "Soft daylight",
    swatches: {
      background: "#fff7f0",
      surface: "#fffffb",
      raised: "#fffefd",
      text: "#1f2937",
      muted: "#64748b",
      border: "#e1daca",
      accent: "#ff6a00",
      success: "#16a34a",
      generating: "#3656f4",
      queued: "#f59e0b",
    },
  },
  {
    name: "night",
    label: "Night",
    description: "Immersive reading",
    swatches: {
      background: "#050708",
      surface: "#0b1020",
      raised: "#171737",
      text: "#e6e7f8",
      muted: "#9ca3bf",
      border: "#1e2440",
      accent: "#ff6a00",
      success: "#22c55e",
      generating: "#60a5fa",
      queued: "#fbbf24",
    },
  },
];

export const DEFAULT_THEME_NAME: ThemeName = "light";

export function normalizeThemeName(value: unknown): ThemeName {
  if (value === "dark" || value === "dawn" || value === "night" || value === "light") {
    return value;
  }
  return DEFAULT_THEME_NAME;
}

export function getTheme(name: ThemeName): VoiceStudioTheme {
  return VOICE_STUDIO_THEMES.find((theme) => theme.name === name) ?? VOICE_STUDIO_THEMES[0];
}
