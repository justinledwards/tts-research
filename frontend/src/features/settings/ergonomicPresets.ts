import { createRunConfiguration, type RunConfiguration } from "../../runConfig";
import type { BuiltInSpeechPolicyProfileName, PerformanceMode, RunMode } from "../../types";
import { applyAccessibilityPreset, type AccessibilityPresetId } from "../accessibility";
import {
  READER_LINE_SPACING_LABELS,
  READER_MEASURE_LABELS,
  READER_TEXT_SCALE_LABELS,
  type ReaderAccessibilitySettings,
} from "../reader-accessibility";
import {
  READ_ALONG_PREFERENCE_LABELS,
  normalizeReadAlongPreferences,
  type ReadAlongPreferences,
  type ReadAlongSegmentBoundaryPreferences,
} from "../readalong";
import {
  applyTelepromptTheatrePreset,
  telepromptTheatrePreset,
  type TelepromptTheatrePresetId,
  type TelepromptTheatreSettings,
} from "../teleprompt/telepromptTheatreSettings";
import { buildSettingsChangeSet, type PresetChangeSet } from "./model";

export const ERGONOMIC_PRESET_IDS = [
  "longFormBookListening",
  "focusedStudy",
  "proofingReview",
  "accessibilityFirst",
  "telepromptRecording",
  "lowResourceLaptop",
  "websiteArticleReading",
] as const;

export type ErgonomicPresetId = (typeof ERGONOMIC_PRESET_IDS)[number];
export type ErgonomicTransportDensity = "compact" | "balanced" | "spacious";
export type ErgonomicContextPanelDefault =
  | "passage"
  | "studyNotes"
  | "reviewFindings"
  | "teleprompt"
  | "collapsed"
  | "articleOutline";
export type ErgonomicPreviewPlayerBehavior =
  | "continuousListen"
  | "focusedLoop"
  | "proofingAB"
  | "accessiblePreview"
  | "telepromptRehearsal"
  | "shortAudition"
  | "articleSkim";

export interface ErgonomicPresetReadAlongDefaults {
  degradedSyncDisplay: ReadAlongPreferences["degradedSyncDisplay"];
  highlightGranularity: ReadAlongPreferences["highlightGranularity"];
  highlightStyle: ReadAlongPreferences["highlightStyle"];
  scrollFollow: ReadAlongPreferences["scrollFollow"];
  segmentBoundary: ReadAlongSegmentBoundaryPreferences;
  syncStrictness: ReadAlongPreferences["syncStrictness"];
}

export interface ErgonomicPreset {
  contextPanelDefault: ErgonomicContextPanelDefault;
  description: string;
  id: ErgonomicPresetId;
  label: string;
  previewPlayerBehavior: ErgonomicPreviewPlayerBehavior;
  readerDisplayPreset: AccessibilityPresetId;
  readAlong: ErgonomicPresetReadAlongDefaults;
  runMode: RunMode;
  speechPolicyProfile: BuiltInSpeechPolicyProfileName;
  telepromptTheatrePreset: TelepromptTheatrePresetId;
  transportDensity: ErgonomicTransportDensity;
  performanceMode: PerformanceMode;
}

export interface ApplyErgonomicPresetInput {
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  runConfiguration: RunConfiguration;
  telepromptTheatreSettings: TelepromptTheatreSettings;
}

export interface AppliedErgonomicPresetDefaults {
  readerAccessibilitySettings: ReaderAccessibilitySettings;
  readAlongPreferences: ReadAlongPreferences;
  runConfiguration: RunConfiguration;
  telepromptTheatreSettings: TelepromptTheatreSettings;
}

export interface BuildErgonomicPresetChangeSetInput extends ApplyErgonomicPresetInput {
  sourcePinSummary?: string;
  speechPolicyProfile: string;
  speechPolicyProfileLabel?: (profile: string) => string;
}

const DEFAULT_SEGMENT_BOUNDARY: ReadAlongSegmentBoundaryPreferences = {
  autoAdvance: true,
  fadePreviousPhrase: true,
  flashSegment: false,
  pauseAtSegmentBoundary: false,
};

export const ERGONOMIC_PRESETS: readonly ErgonomicPreset[] = [
  {
    contextPanelDefault: "passage",
    description: "Comfortable long-session listening with gentle phrase follow and steady output.",
    id: "longFormBookListening",
    label: "Long-form book listening",
    performanceMode: "balanced",
    previewPlayerBehavior: "continuousListen",
    readerDisplayPreset: "dyslexicFriendly",
    readAlong: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "phrase",
      highlightStyle: "background",
      scrollFollow: "gentle",
      segmentBoundary: DEFAULT_SEGMENT_BOUNDARY,
      syncStrictness: "phraseFallback",
    },
    runMode: "checkedMaster",
    speechPolicyProfile: "Education",
    telepromptTheatrePreset: "laptopPresenter",
    transportDensity: "balanced",
  },
  {
    contextPanelDefault: "studyNotes",
    description: "Centered study mode with sentence landmarks and tighter sync confidence.",
    id: "focusedStudy",
    label: "Focused study",
    performanceMode: "quality",
    previewPlayerBehavior: "focusedLoop",
    readerDisplayPreset: "standard",
    readAlong: {
      degradedSyncDisplay: "debugOnly",
      highlightGranularity: "sentence",
      highlightStyle: "outline",
      scrollFollow: "centerCurrentLine",
      segmentBoundary: {
        ...DEFAULT_SEGMENT_BOUNDARY,
        flashSegment: true,
      },
      syncStrictness: "exactWordWhenAvailable",
    },
    runMode: "checkedMaster",
    speechPolicyProfile: "Education",
    telepromptTheatrePreset: "operatorReview",
    transportDensity: "balanced",
  },
  {
    contextPanelDefault: "reviewFindings",
    description: "Quality-first review with word-level checking and visible degraded states.",
    id: "proofingReview",
    label: "Proofing/review",
    performanceMode: "quality",
    previewPlayerBehavior: "proofingAB",
    readerDisplayPreset: "standard",
    readAlong: {
      degradedSyncDisplay: "always",
      highlightGranularity: "word",
      highlightStyle: "underline",
      scrollFollow: "pageBoundaryOnly",
      segmentBoundary: {
        ...DEFAULT_SEGMENT_BOUNDARY,
        flashSegment: true,
      },
      syncStrictness: "exactWordWhenAvailable",
    },
    runMode: "publishMaster",
    speechPolicyProfile: "TechnicalDocs",
    telepromptTheatrePreset: "operatorReview",
    transportDensity: "spacious",
  },
  {
    contextPanelDefault: "passage",
    description: "Low-motion, high-contrast reader defaults with honest sync fallback labels.",
    id: "accessibilityFirst",
    label: "Accessibility-first",
    performanceMode: "balanced",
    previewPlayerBehavior: "accessiblePreview",
    readerDisplayPreset: "lowVision",
    readAlong: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "sentence",
      highlightStyle: "highContrastShape",
      scrollFollow: "pageBoundaryOnly",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: false,
        flashSegment: false,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "blockFallback",
    },
    runMode: "checkedMaster",
    speechPolicyProfile: "Accessibility",
    telepromptTheatrePreset: "lowVision",
    transportDensity: "spacious",
  },
  {
    contextPanelDefault: "teleprompt",
    description: "Presenter defaults for rehearsing cues before stepping into Theatre.",
    id: "telepromptRecording",
    label: "Teleprompt recording",
    performanceMode: "balanced",
    previewPlayerBehavior: "telepromptRehearsal",
    readerDisplayPreset: "largeText",
    readAlong: {
      degradedSyncDisplay: "debugOnly",
      highlightGranularity: "phrase",
      highlightStyle: "leftBar",
      scrollFollow: "telepromptContinuous",
      segmentBoundary: {
        ...DEFAULT_SEGMENT_BOUNDARY,
        pauseAtSegmentBoundary: true,
      },
      syncStrictness: "phraseFallback",
    },
    runMode: "checkedMaster",
    speechPolicyProfile: "Enterprise",
    telepromptTheatrePreset: "recordingBooth",
    transportDensity: "compact",
  },
  {
    contextPanelDefault: "collapsed",
    description: "Reduced motion and faster local preview defaults for constrained machines.",
    id: "lowResourceLaptop",
    label: "Low-resource laptop",
    performanceMode: "throughput",
    previewPlayerBehavior: "shortAudition",
    readerDisplayPreset: "reducedMotion",
    readAlong: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "block",
      highlightStyle: "underline",
      scrollFollow: "off",
      segmentBoundary: {
        autoAdvance: true,
        fadePreviousPhrase: false,
        flashSegment: false,
        pauseAtSegmentBoundary: false,
      },
      syncStrictness: "blockFallback",
    },
    runMode: "fastCreate",
    speechPolicyProfile: "Enterprise",
    telepromptTheatrePreset: "laptopPresenter",
    transportDensity: "compact",
  },
  {
    contextPanelDefault: "articleOutline",
    description: "Article reading defaults with sentence highlights and skim-friendly preview.",
    id: "websiteArticleReading",
    label: "Website article reading",
    performanceMode: "balanced",
    previewPlayerBehavior: "articleSkim",
    readerDisplayPreset: "standard",
    readAlong: {
      degradedSyncDisplay: "neverClaimWordSync",
      highlightGranularity: "sentence",
      highlightStyle: "background",
      scrollFollow: "gentle",
      segmentBoundary: DEFAULT_SEGMENT_BOUNDARY,
      syncStrictness: "phraseFallback",
    },
    runMode: "draftPreview",
    speechPolicyProfile: "Education",
    telepromptTheatrePreset: "tabletPresenter",
    transportDensity: "balanced",
  },
];

export function ergonomicPresetById(id: ErgonomicPresetId): ErgonomicPreset {
  return ERGONOMIC_PRESETS.find((preset) => preset.id === id) ?? ERGONOMIC_PRESETS[0];
}

export function applyErgonomicPresetDefaults(
  id: ErgonomicPresetId,
  current: ApplyErgonomicPresetInput,
): AppliedErgonomicPresetDefaults {
  const preset = ergonomicPresetById(id);
  const runPreset = createRunConfiguration(preset.runMode);
  return {
    readerAccessibilitySettings: applyAccessibilityPreset(preset.readerDisplayPreset),
    readAlongPreferences: normalizeReadAlongPreferences({
      ...current.readAlongPreferences,
      ...preset.readAlong,
      globalHighlightOffsetMs: current.readAlongPreferences.globalHighlightOffsetMs,
      providerOffsetsMs: current.readAlongPreferences.providerOffsetsMs,
      scope: current.readAlongPreferences.scope,
      segmentBoundary: {
        ...current.readAlongPreferences.segmentBoundary,
        ...preset.readAlong.segmentBoundary,
      },
    }),
    runConfiguration: {
      ...runPreset,
      engineOptions: current.runConfiguration.engineOptions,
      performanceMode: preset.performanceMode,
      ttsEngine: current.runConfiguration.ttsEngine,
    },
    telepromptTheatreSettings: {
      ...applyTelepromptTheatrePreset(preset.telepromptTheatrePreset),
    },
  };
}

export function buildErgonomicPresetChangeSet(
  id: ErgonomicPresetId,
  current: BuildErgonomicPresetChangeSetInput,
): PresetChangeSet {
  const preset = ergonomicPresetById(id);
  const next = applyErgonomicPresetDefaults(id, current);
  const labelPolicy = current.speechPolicyProfileLabel ?? ((profile: string) => profile);
  const changeSet = buildSettingsChangeSet({
    id: `ergonomic-preset:${preset.id}`,
    label: preset.label,
    items: [
      {
        after: runModeLabel(next.runConfiguration),
        before: runModeLabel(current.runConfiguration),
        fieldId: "runMode",
      },
      {
        after: performanceLabel(next.runConfiguration.performanceMode),
        before: performanceLabel(current.runConfiguration.performanceMode),
        fieldId: "performanceMode",
      },
      {
        after: readerSettingsLabel(next.readerAccessibilitySettings),
        before: readerSettingsLabel(current.readerAccessibilitySettings),
        fieldId: "readerPreferences",
      },
      {
        after: readAlongSettingsLabel(next.readAlongPreferences),
        before: readAlongSettingsLabel(current.readAlongPreferences),
        fieldId: "readAlongPreferences",
      },
      {
        after: telepromptTheatrePreset(next.telepromptTheatreSettings.presetId).label,
        before: telepromptTheatrePreset(current.telepromptTheatreSettings.presetId).label,
        fieldId: "telepromptTheatre",
      },
      {
        after: labelPolicy(preset.speechPolicyProfile),
        before: labelPolicy(current.speechPolicyProfile),
        fieldId: "projectSpeechPolicy",
      },
      {
        after: "Unchanged by preset",
        before: current.sourcePinSummary ?? "Existing source pins",
        fieldId: "sourceSpeechPolicy",
        preserved: true,
      },
      {
        after: "Unchanged by preset",
        before: "Saved to this temporary session",
        fieldId: "temporarySourceBehavior",
        preserved: true,
      },
    ],
  });
  return {
    ...changeSet,
    presetId: preset.id,
    presetLabel: preset.label,
  };
}

export const ERGONOMIC_TRANSPORT_DENSITY_LABELS: Record<ErgonomicTransportDensity, string> = {
  balanced: "Balanced controls",
  compact: "Compact controls",
  spacious: "Spacious controls",
};

export const ERGONOMIC_CONTEXT_PANEL_LABELS: Record<ErgonomicContextPanelDefault, string> = {
  articleOutline: "Article outline",
  collapsed: "Collapsed",
  passage: "Current passage",
  reviewFindings: "Review findings",
  studyNotes: "Study notes",
  teleprompt: "Teleprompt cues",
};

export const ERGONOMIC_PREVIEW_BEHAVIOR_LABELS: Record<ErgonomicPreviewPlayerBehavior, string> = {
  accessiblePreview: "Low-motion preview",
  articleSkim: "Article skim preview",
  continuousListen: "Continuous listen",
  focusedLoop: "Focused loop",
  proofingAB: "Proofing A/B",
  shortAudition: "Short audition",
  telepromptRehearsal: "Teleprompt rehearsal",
};

function runModeLabel(configuration: RunConfiguration): string {
  return createRunConfiguration(configuration.runMode).runMode === configuration.runMode
    ? RUN_MODE_LABELS[configuration.runMode]
    : configuration.runMode;
}

const RUN_MODE_LABELS: Record<RunMode, string> = {
  checkedMaster: "Checked Master",
  draftPreview: "Draft Preview",
  fastCreate: "Fast Create",
  publishMaster: "Publish Master",
};

function performanceLabel(mode: PerformanceMode): string {
  if (mode === "throughput") {
    return "Throughput";
  }
  if (mode === "quality") {
    return "Quality";
  }
  return "Balanced";
}

function readerSettingsLabel(settings: ReaderAccessibilitySettings): string {
  const flags = [
    settings.highContrast ? "high contrast" : "",
    settings.reducedMotion ? "reduced motion" : "",
  ].filter(Boolean);
  return [
    READER_TEXT_SCALE_LABELS[settings.textScale],
    READER_LINE_SPACING_LABELS[settings.lineSpacing],
    READER_MEASURE_LABELS[settings.measure],
    ...flags,
  ].join(" / ");
}

function readAlongSettingsLabel(settings: ReadAlongPreferences): string {
  const normalized = normalizeReadAlongPreferences(settings);
  return [
    READ_ALONG_PREFERENCE_LABELS.granularity[normalized.highlightGranularity],
    READ_ALONG_PREFERENCE_LABELS.style[normalized.highlightStyle],
    READ_ALONG_PREFERENCE_LABELS.scrollFollow[normalized.scrollFollow],
    READ_ALONG_PREFERENCE_LABELS.syncStrictness[normalized.syncStrictness],
  ].join(" / ");
}
