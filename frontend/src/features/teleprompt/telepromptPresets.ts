import {
  DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
  normalizeTeleprompterHighlightSettings,
  type TeleprompterHighlightSettings,
} from "../../teleprompter";

export const TELEPROMPT_PRESET_IDS = [
  "standard",
  "largeText",
  "highContrast",
  "dyslexicFriendly",
] as const;

export type TelepromptPresetId = (typeof TELEPROMPT_PRESET_IDS)[number];

export interface TelepromptPreset {
  readonly description: string;
  readonly id: TelepromptPresetId;
  readonly label: string;
  readonly scriptClassName: string;
  readonly shellClassName: string;
  readonly wordSpacing: string;
}

export const TELEPROMPT_PRESETS: Record<TelepromptPresetId, TelepromptPreset> = {
  dyslexicFriendly: {
    description: "Wider spacing, calm contrast, and generous line height.",
    id: "dyslexicFriendly",
    label: "Dyslexic friendly",
    scriptClassName: "text-2xl leading-10 sm:text-3xl",
    shellClassName: "bg-[var(--vs-raised)]",
    wordSpacing: "0.18em",
  },
  highContrast: {
    description: "Strong foreground and cue contrast for difficult lighting.",
    id: "highContrast",
    label: "High contrast",
    scriptClassName: "text-2xl leading-10 sm:text-3xl",
    shellClassName: "border-zinc-100 bg-zinc-950 text-white",
    wordSpacing: "0.08em",
  },
  largeText: {
    description: "Larger type and extra line height for recording distance.",
    id: "largeText",
    label: "Large text",
    scriptClassName: "text-3xl leading-10 sm:text-3xl",
    shellClassName: "bg-[var(--vs-raised)]",
    wordSpacing: "0.08em",
  },
  standard: {
    description: "Balanced teleprompt text and gentle focus cues.",
    id: "standard",
    label: "Standard",
    scriptClassName: "text-xl leading-10 sm:text-2xl",
    shellClassName: "bg-[var(--vs-raised)]",
    wordSpacing: "normal",
  },
};

export function normalizeTelepromptPresetId(value: unknown): TelepromptPresetId {
  return TELEPROMPT_PRESET_IDS.includes(value as TelepromptPresetId)
    ? (value as TelepromptPresetId)
    : "standard";
}

export function telepromptPreset(id: TelepromptPresetId): TelepromptPreset {
  return TELEPROMPT_PRESETS[id];
}

export function telepromptPresetHighlightSettings(
  id: TelepromptPresetId,
  settings: TeleprompterHighlightSettings = DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
): TeleprompterHighlightSettings {
  const base = normalizeTeleprompterHighlightSettings(settings);
  if (id === "highContrast") {
    return normalizeTeleprompterHighlightSettings({
      ...base,
      activeIntensity: 1.25,
      effectStyle: "classic",
      spokenIntensity: 0.34,
      upcomingIntensity: 0.48,
      upcomingWindowMs: Math.max(base.upcomingWindowMs, 360),
    });
  }
  if (id === "dyslexicFriendly") {
    return normalizeTeleprompterHighlightSettings({
      ...base,
      activeIntensity: 0.92,
      effectStyle: "classic",
      leadMs: Math.min(base.leadMs, 140),
      spokenFadeMs: Math.max(base.spokenFadeMs, 1200),
      spokenIntensity: 0.2,
      upcomingIntensity: 0.18,
    });
  }
  if (id === "largeText") {
    return normalizeTeleprompterHighlightSettings({
      ...base,
      activeIntensity: 1.08,
      upcomingIntensity: Math.max(base.upcomingIntensity, 0.26),
    });
  }
  return base;
}
