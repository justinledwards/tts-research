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
  book: {
    ink: string;
    muted: string;
    paper: string;
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
    book: {
      ink: "#1f2937",
      muted: "#776b58",
      paper: "#f8f0df",
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
    book: {
      ink: "#ece7dc",
      muted: "#a9a193",
      paper: "#15181d",
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
    book: {
      ink: "#261b13",
      muted: "#7c6d5a",
      paper: "#fbecd6",
    },
  },
  {
    name: "papery",
    label: "Papery",
    description: "Warm paper workspace",
    swatches: {
      background: "#fbf3df",
      surface: "#f1e7d0",
      raised: "#fff9ec",
      text: "#2d332f",
      muted: "#766f61",
      border: "#dccdad",
      accent: "#ff6a00",
      success: "#16845b",
      generating: "#556a88",
      queued: "#b66a1d",
    },
    book: {
      ink: "#2d332f",
      muted: "#7a7467",
      paper: "#fff4da",
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
    book: {
      ink: "#e9e4d6",
      muted: "#a49d8f",
      paper: "#0c1020",
    },
  },
];

export const DEFAULT_THEME_NAME: ThemeName = "light";

export function normalizeThemeName(value: unknown): ThemeName {
  if (
    value === "dark" ||
    value === "dawn" ||
    value === "night" ||
    value === "light" ||
    value === "papery"
  ) {
    return value;
  }
  return DEFAULT_THEME_NAME;
}

export function getTheme(name: ThemeName): VoiceStudioTheme {
  return VOICE_STUDIO_THEMES.find((theme) => theme.name === name) ?? VOICE_STUDIO_THEMES[0];
}
