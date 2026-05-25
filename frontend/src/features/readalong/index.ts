export {
  ReadAlongClock,
  type ReadAlongClockReason,
  type ReadAlongClockRuntime,
  type ReadAlongClockTick,
} from "./ReadAlongClock";
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
  readAlongRuntimeDebugRows,
  readAlongRuntimeStateLabel,
  readAlongRuntimeStatusClassName,
  type ReadAlongRuntimeDebugRow,
  type ReadAlongRuntimeSnapshot,
  type ReadAlongRuntimeState,
  type ReadAlongVisualMode,
} from "./readAlongState";
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
