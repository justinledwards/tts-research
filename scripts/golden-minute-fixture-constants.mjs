export const GOLDEN_MINUTE_THRESHOLDS = {
  maxDegradedTimePercentage: 0,
  maxMedianWordDriftMs: 150,
  maxMissedHighlightCount: 0,
  maxP95WordDriftMs: 150,
  maxPhraseDriftMs: 350,
  maxScrollJumpCount: 0,
  maxStaleHighlightCount: 0,
  maxWrongNodeCount: 0,
  maxWrongWordCount: 0,
  minFixtureCount: 1,
};

export const GOLDEN_MINUTE_SPEECH_FLUENCY_THRESHOLDS = {
  maxDurationEstimateDeltaRatio: 0.18,
  maxInterSegmentPauseMs: 900,
  maxRepeatedSilenceMs: 450,
  maxUnpunctuatedInterSegmentPauseMs: 500,
  minEdgeRms: 0.012,
  minSegmentRms: 0.018,
};

export const GOLDEN_MINUTE_PROVIDER_MATRIX_CASES = [
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: true,
    },
    expectedLevel: "word",
    id: "provider-word-timing",
    runtimeState: "synced-word",
    timingSource: "provider-word",
    userFacingLabel: "Word-level highlight from provider timing",
    visualHighlightMode: "word",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: false,
    },
    expectedLevel: "phrase",
    id: "phrase-only-timing",
    runtimeState: "synced-phrase",
    timingSource: "provider-phrase",
    userFacingLabel: "Phrase-level highlight from provider timing",
    visualHighlightMode: "phrase",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: true,
      alignmentSupported: true,
      phraseTiming: true,
      wordTiming: false,
    },
    expectedLevel: "word",
    id: "forced-alignment",
    runtimeState: "synced-word",
    timingSource: "forced-alignment",
    userFacingLabel: "Word-level highlight after forced alignment",
    visualHighlightMode: "word",
  },
  {
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: false,
      wordTiming: false,
    },
    expectedLevel: "degraded",
    id: "heuristic-degraded-fallback",
    runtimeState: "degraded",
    timingSource: "heuristic-estimate",
    userFacingLabel: "Approximate block highlight in degraded mode",
    visualHighlightMode: "block",
  },
  {
    audioState: "stale",
    capabilities: {
      alignmentRequiredForWordHighlight: false,
      alignmentSupported: false,
      phraseTiming: true,
      wordTiming: true,
    },
    expectedLevel: "word",
    id: "stale-audio",
    runtimeState: "stale-audio",
    timingSource: "stale-audio",
    userFacingLabel: "Stale audio detected; highlight paused",
    visualHighlightMode: "none",
  },
];

export const GOLDEN_MINUTE_BOUNDARY_STRESS_CASES = [
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 32,
    fromSegmentId: "gm-h1",
    id: "heading-to-paragraph",
    scenario: "heading-to-paragraph boundary",
    toSegmentId: "gm-p1",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 38,
    fromSegmentId: "gm-p1",
    id: "quote-boundary",
    scenario: "quote boundary",
    toSegmentId: "gm-p2",
  },
  {
    citationSkipped: true,
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 42,
    fromSegmentId: "gm-p3",
    id: "citation-skipped-boundary",
    scenario: "citation skipped at boundary",
    toSegmentId: "gm-p4",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 48,
    fromSegmentId: "gm-p4",
    id: "long-to-short",
    scenario: "long-to-short segment",
    toSegmentId: "gm-p5",
  },
  {
    expectedMaxDriftMs: 140,
    expectedPauseMs: 650,
    expectedScrollJumpPx: 54,
    fromSegmentId: "gm-p5",
    id: "short-to-long",
    scenario: "short-to-long segment",
    toSegmentId: "gm-p6",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 86,
    id: "seek-into-segment-middle",
    interaction: "seek",
    scenario: "seek into segment middle",
    seekAudioTimeMs: 52_500,
    toSegmentId: "gm-p7",
  },
  {
    expectedMaxDriftMs: 140,
    expectedScrollJumpPx: 64,
    fromSegmentId: "gm-p6",
    id: "speed-change-across-boundary",
    interaction: "speed-change",
    playbackRateAfter: 1.25,
    scenario: "speed change across boundary",
    toSegmentId: "gm-p7",
  },
];

export const GOLDEN_MINUTE_ARTIFACT_IDENTITY_FIELDS = [
  "sourceRevisionId",
  "speechPlanId",
  "policyProfileId",
  "voiceProfileId",
  "generatedAudioId",
  "highlightMapId",
  "alignmentMapId",
];

export const GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS = {
  alignmentMissing: "Alignment missing",
  audioReady: "Audio ready",
  audioStale: "Audio stale",
  highlightStale: "Highlight stale",
  regenerateRequired: "Regenerate required",
};

export const GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_CASES = [
  {
    expectedResult: "compatible",
    id: "current-compatible",
    title: "Current source, speech plan, audio, highlight map, and alignment map",
    uiLabels: [GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioReady],
  },
  {
    expectedResult: "blocked",
    id: "audio-stale-speech-plan",
    title: "Generated audio points at an older speech plan",
    uiLabels: [
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioStale,
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.regenerateRequired,
    ],
  },
  {
    expectedResult: "blocked",
    id: "highlight-stale-audio",
    title: "Highlight map points at an older generated audio artifact",
    uiLabels: [
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.highlightStale,
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.regenerateRequired,
    ],
  },
  {
    expectedResult: "blocked",
    id: "alignment-missing",
    title: "Alignment map is absent for a word-highlight path",
    uiLabels: [
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.alignmentMissing,
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.regenerateRequired,
    ],
  },
  {
    expectedResult: "blocked",
    id: "speech-plan-source-policy-voice-stale",
    title: "Speech plan no longer matches source, policy, or voice",
    uiLabels: [
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioStale,
      GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.regenerateRequired,
    ],
  },
  {
    expectedResult: "compatible",
    id: "source-compatible-bookmark",
    title: "Bookmark survives a source-compatible revision",
    uiLabels: [GOLDEN_MINUTE_ARTIFACT_COMPATIBILITY_LABELS.audioReady],
  },
];
