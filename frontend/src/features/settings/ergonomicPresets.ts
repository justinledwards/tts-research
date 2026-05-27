import { createRunConfiguration, type RunConfiguration } from "../../runConfig";
import type { BuiltInSpeechPolicyProfileName, PerformanceMode, RunMode } from "../../types";
import { applyAccessibilityPreset, type AccessibilityPresetId } from "../accessibility";
import type { ReaderAccessibilitySettings } from "../reader-accessibility";
import {
  normalizeReadAlongPreferences,
  type ReadAlongPreferences,
  type ReadAlongSegmentBoundaryPreferences,
} from "../readalong";
import {
  applyTelepromptTheatrePreset,
  type TelepromptTheatrePresetId,
  type TelepromptTheatreSettings,
} from "../teleprompt/telepromptTheatreSettings";

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
