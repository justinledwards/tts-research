export const TELEPROMPT_THEATRE_PRESET_IDS = [
  "recordingBooth",
  "laptopPresenter",
  "tabletPresenter",
  "lowVision",
  "mirrorRig",
  "operatorReview",
] as const;

export const TELEPROMPT_THEATRE_CUE_FONT_SIZES = [
  "comfortable",
  "large",
  "giant",
  "massive",
] as const;
export const TELEPROMPT_THEATRE_CUE_WIDTHS = ["narrow", "balanced", "wide", "full"] as const;
export const TELEPROMPT_THEATRE_VERTICAL_POSITIONS = ["upper", "center", "lower"] as const;
export const TELEPROMPT_THEATRE_SCROLL_MODES = ["paged", "smooth", "continuous"] as const;
export const TELEPROMPT_THEATRE_NEXT_CUE_PLACEMENTS = ["below", "side", "hidden"] as const;
export const TELEPROMPT_THEATRE_OPERATOR_POSITIONS = ["right", "left", "bottom"] as const;
export const TELEPROMPT_THEATRE_FULLSCREEN_PREFERENCES = ["browser", "native", "theatre"] as const;

export type TelepromptTheatrePresetId = (typeof TELEPROMPT_THEATRE_PRESET_IDS)[number];
export type TelepromptTheatreCueFontSize = (typeof TELEPROMPT_THEATRE_CUE_FONT_SIZES)[number];
export type TelepromptTheatreCueWidth = (typeof TELEPROMPT_THEATRE_CUE_WIDTHS)[number];
export type TelepromptTheatreVerticalPosition =
  (typeof TELEPROMPT_THEATRE_VERTICAL_POSITIONS)[number];
export type TelepromptTheatreScrollMode = (typeof TELEPROMPT_THEATRE_SCROLL_MODES)[number];
export type TelepromptTheatreNextCuePlacement =
  (typeof TELEPROMPT_THEATRE_NEXT_CUE_PLACEMENTS)[number];
export type TelepromptTheatreOperatorPosition =
  (typeof TELEPROMPT_THEATRE_OPERATOR_POSITIONS)[number];
export type TelepromptTheatreFullscreenPreference =
  (typeof TELEPROMPT_THEATRE_FULLSCREEN_PREFERENCES)[number];
export type TelepromptTheatreCountdownSeconds = 0 | 3 | 5;
export type TelepromptTheatreCuePreviewCount = 0 | 1 | 2 | 3;

export interface TelepromptTheatreSettings {
  readonly countdownSeconds: TelepromptTheatreCountdownSeconds;
  readonly cueFontSize: TelepromptTheatreCueFontSize;
  readonly cuePreviewCount: TelepromptTheatreCuePreviewCount;
  readonly cueWidth: TelepromptTheatreCueWidth;
  readonly fullscreenPreference: TelepromptTheatreFullscreenPreference;
  readonly metronomeEnabled: boolean;
  readonly mirrorMode: boolean;
  readonly nextCuePlacement: TelepromptTheatreNextCuePlacement;
  readonly operatorPanelPosition: TelepromptTheatreOperatorPosition;
  readonly operatorPanelVisible: boolean;
  readonly presetId: TelepromptTheatrePresetId;
  readonly scrollMode: TelepromptTheatreScrollMode;
  readonly syncOverlayVisible: boolean;
  readonly verticalCuePosition: TelepromptTheatreVerticalPosition;
}

export interface TelepromptTheatrePreset {
  readonly description: string;
  readonly id: TelepromptTheatrePresetId;
  readonly label: string;
  readonly settings: TelepromptTheatreSettings;
}

export const DEFAULT_TELEPROMPT_THEATRE_SETTINGS: TelepromptTheatreSettings = {
  countdownSeconds: 0,
  cueFontSize: "large",
  cuePreviewCount: 1,
  cueWidth: "balanced",
  fullscreenPreference: "theatre",
  metronomeEnabled: false,
  mirrorMode: false,
  nextCuePlacement: "below",
  operatorPanelPosition: "right",
  operatorPanelVisible: false,
  presetId: "laptopPresenter",
  scrollMode: "smooth",
  syncOverlayVisible: false,
  verticalCuePosition: "center",
};

export const TELEPROMPT_THEATRE_PRESETS: Record<
  TelepromptTheatrePresetId,
  TelepromptTheatrePreset
> = {
  laptopPresenter: {
    description: "Balanced laptop view with a clean presenter script and one next cue.",
    id: "laptopPresenter",
    label: "Laptop presenter",
    settings: DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
  },
  lowVision: {
    description: "Very large centered cue with diagnostics available but secondary.",
    id: "lowVision",
    label: "Low vision",
    settings: {
      ...DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
      cueFontSize: "massive",
      cuePreviewCount: 0,
      cueWidth: "wide",
      presetId: "lowVision",
      syncOverlayVisible: true,
    },
  },
  mirrorRig: {
    description: "Mirrored full-width cue for beam-splitter and reflection rigs.",
    id: "mirrorRig",
    label: "Mirror rig",
    settings: {
      ...DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
      cueFontSize: "giant",
      cueWidth: "full",
      mirrorMode: true,
      presetId: "mirrorRig",
    },
  },
  operatorReview: {
    description: "Operator panel open with sync confidence, shortcuts, and review controls.",
    id: "operatorReview",
    label: "Operator review",
    settings: {
      ...DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
      cueFontSize: "comfortable",
      cuePreviewCount: 2,
      nextCuePlacement: "side",
      operatorPanelVisible: true,
      presetId: "operatorReview",
      scrollMode: "paged",
      syncOverlayVisible: true,
    },
  },
  recordingBooth: {
    description: "Large booth cue with a short countdown and minimal chrome.",
    id: "recordingBooth",
    label: "Recording booth",
    settings: {
      ...DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
      countdownSeconds: 3,
      cueFontSize: "giant",
      cueWidth: "narrow",
      fullscreenPreference: "native",
      presetId: "recordingBooth",
    },
  },
  tabletPresenter: {
    description: "Full-width tablet cue with a lower visual anchor and paged motion.",
    id: "tabletPresenter",
    label: "Tablet presenter",
    settings: {
      ...DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
      cueFontSize: "large",
      cueWidth: "full",
      fullscreenPreference: "browser",
      presetId: "tabletPresenter",
      scrollMode: "paged",
      verticalCuePosition: "lower",
    },
  },
};

export function telepromptTheatrePreset(id: TelepromptTheatrePresetId): TelepromptTheatrePreset {
  return TELEPROMPT_THEATRE_PRESETS[id];
}

export function applyTelepromptTheatrePreset(
  id: TelepromptTheatrePresetId,
): TelepromptTheatreSettings {
  return TELEPROMPT_THEATRE_PRESETS[id].settings;
}

export function normalizeTelepromptTheatreSettings(value: unknown): TelepromptTheatreSettings {
  const candidate =
    value && typeof value === "object" ? (value as Partial<TelepromptTheatreSettings>) : {};
  const presetId = normalizeTheatreOption(
    candidate.presetId,
    TELEPROMPT_THEATRE_PRESET_IDS,
    DEFAULT_TELEPROMPT_THEATRE_SETTINGS.presetId,
  );
  const base = telepromptTheatrePreset(presetId).settings;
  return {
    countdownSeconds: normalizeCountdown(candidate.countdownSeconds, base.countdownSeconds),
    cueFontSize: normalizeTheatreOption(
      candidate.cueFontSize,
      TELEPROMPT_THEATRE_CUE_FONT_SIZES,
      base.cueFontSize,
    ),
    cuePreviewCount: normalizeCuePreviewCount(candidate.cuePreviewCount, base.cuePreviewCount),
    cueWidth: normalizeTheatreOption(
      candidate.cueWidth,
      TELEPROMPT_THEATRE_CUE_WIDTHS,
      base.cueWidth,
    ),
    fullscreenPreference: normalizeTheatreOption(
      candidate.fullscreenPreference,
      TELEPROMPT_THEATRE_FULLSCREEN_PREFERENCES,
      base.fullscreenPreference,
    ),
    metronomeEnabled:
      typeof candidate.metronomeEnabled === "boolean"
        ? candidate.metronomeEnabled
        : base.metronomeEnabled,
    mirrorMode: typeof candidate.mirrorMode === "boolean" ? candidate.mirrorMode : base.mirrorMode,
    nextCuePlacement: normalizeTheatreOption(
      candidate.nextCuePlacement,
      TELEPROMPT_THEATRE_NEXT_CUE_PLACEMENTS,
      base.nextCuePlacement,
    ),
    operatorPanelPosition: normalizeTheatreOption(
      candidate.operatorPanelPosition,
      TELEPROMPT_THEATRE_OPERATOR_POSITIONS,
      base.operatorPanelPosition,
    ),
    operatorPanelVisible:
      typeof candidate.operatorPanelVisible === "boolean"
        ? candidate.operatorPanelVisible
        : base.operatorPanelVisible,
    presetId,
    scrollMode: normalizeTheatreOption(
      candidate.scrollMode,
      TELEPROMPT_THEATRE_SCROLL_MODES,
      base.scrollMode,
    ),
    syncOverlayVisible:
      typeof candidate.syncOverlayVisible === "boolean"
        ? candidate.syncOverlayVisible
        : base.syncOverlayVisible,
    verticalCuePosition: normalizeTheatreOption(
      candidate.verticalCuePosition,
      TELEPROMPT_THEATRE_VERTICAL_POSITIONS,
      base.verticalCuePosition,
    ),
  };
}

function normalizeTheatreOption<const T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  return options.includes(value as T[number]) ? (value as T[number]) : fallback;
}

function normalizeCuePreviewCount(
  value: unknown,
  fallback: TelepromptTheatreCuePreviewCount,
): TelepromptTheatreCuePreviewCount {
  if (value === 0 || value === 1 || value === 2 || value === 3) {
    return value;
  }
  return fallback;
}

function normalizeCountdown(
  value: unknown,
  fallback: TelepromptTheatreCountdownSeconds,
): TelepromptTheatreCountdownSeconds {
  if (value === 0 || value === 3 || value === 5) {
    return value;
  }
  return fallback;
}
