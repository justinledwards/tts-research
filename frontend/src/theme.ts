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
      background: "#f7f1e8",
      surface: "#f4eadc",
      raised: "#fffdf9",
      text: "#17130f",
      muted: "#6d5f52",
      border: "#e4d5c2",
      accent: "#c2410c",
      success: "#047857",
      generating: "#1d4ed8",
      queued: "#8a3f0b",
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
      background: "#0d0b09",
      surface: "#231d17",
      raised: "#1c1712",
      text: "#fff7ed",
      muted: "#c7b29f",
      border: "#3b322b",
      accent: "#fb923c",
      success: "#86efac",
      generating: "#93c5fd",
      queued: "#fcd34d",
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
      background: "#fff4eb",
      surface: "#f7eadc",
      raised: "#fffefd",
      text: "#201712",
      muted: "#6d5e52",
      border: "#e2d2c0",
      accent: "#c2410c",
      success: "#047857",
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
      background: "#fbf0dc",
      surface: "#efe2cb",
      raised: "#fff8eb",
      text: "#29231c",
      muted: "#6d6255",
      border: "#d8c6a8",
      accent: "#c2410c",
      success: "#047857",
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
      background: "#060606",
      surface: "#111827",
      raised: "#171923",
      text: "#f8fafc",
      muted: "#b7c2d1",
      border: "#252b3b",
      accent: "#fb923c",
      success: "#86efac",
      generating: "#93c5fd",
      queued: "#fcd34d",
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
