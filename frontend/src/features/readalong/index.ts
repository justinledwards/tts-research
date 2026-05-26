export {
  ReadAlongClock,
  startReadAlongPlaybackClock,
  type ReadAlongClockReason,
  type ReadAlongClockRuntime,
  type ReadAlongClockTick,
  type ReadAlongPlaybackClockOptions,
} from "./ReadAlongClock";
export {
  alignmentQualityLabel,
  alignmentStatusFromReport,
  type AlignmentStatus,
  type AlignmentStatusTone,
} from "./alignmentStatus";
export {
  ReadAlongResyncController,
  resolveReadAlongRuntimeSnapshot,
  type ReadAlongResyncInput,
  type ReadAlongResyncOptions,
} from "./ReadAlongResyncController";
export {
  READ_ALONG_PHRASE_DRIFT_TARGET_MS,
  READ_ALONG_TRUSTED_CONFIDENCE,
  READ_ALONG_WORD_DRIFT_TARGET_MS,
  detectReadAlongDrift,
  driftFromRange,
  highlightTimingSourceLabel,
  isTrustedWordTiming,
  timingRangeForCue,
  type ReadAlongDriftInput,
  type ReadAlongDriftReport,
  type TimingRange,
} from "./driftDetection";
export {
  HIGHLIGHT_MAP_V2_SCHEMA_VERSION,
  highlightMapV2TimingSourceLabel,
  highlightMapV2ToLegacyHighlightMap,
  isHighlightMapV2,
  legacyHighlightMapFromTimingArtifact,
  legacyTimingSourceFromV2,
  type HighlightMapV2,
  type HighlightMapV2Entry,
  type HighlightMapV2FallbackMode,
  type HighlightMapV2Summary,
  type HighlightMapV2TimingLevel,
  type HighlightMapV2TimingSource,
  type HighlightMapV2Traceability,
  type TimingArtifact,
} from "./highlightMapV2";
export {
  readAlongRuntimeDebugRows,
  readAlongRuntimeStateLabel,
  readAlongRuntimeStatusClassName,
  type ReadAlongRuntimeDebugRow,
  type ReadAlongRuntimeSnapshot,
  type ReadAlongRuntimeState,
  type ReadAlongVisualMode,
} from "./readAlongState";
export {
  timingArtifactDebugRows,
  validateTimingArtifact,
  type TimingArtifactValidationInput,
  type TimingArtifactValidationIssue,
  type TimingArtifactValidationReport,
  type TimingArtifactValidationSeverity,
  type TimingArtifactValidationStatus,
} from "./timingArtifact";
export {
  evaluateBookReadAlongInvariant,
  evaluatePreparedSourceReadAlongInvariant,
  evaluateSourceSwitchInvariant,
  readAlongInvariantDebugRows,
  readAlongInvariantStatusLabel,
  type ReadAlongInvariantDebugRow,
  type ReadAlongInvariantIssue,
  type ReadAlongInvariantReport,
  type ReadAlongInvariantSeverity,
  type ReadAlongInvariantStatus,
  type ReadAlongInvariantSurface,
} from "./readAlongInvariant";
