import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import type {
  BookReadAlongInvariantInput,
  PreparedSourceReadAlongInvariantInput,
  ReadAlongInvariantDebugRow,
  ReadAlongInvariantIssue,
  ReadAlongInvariantReport,
  ReadAlongInvariantSurface,
  ReadAlongInvariantSeverity,
  ReadAlongInvariantStatus,
  SourceSwitchInvariantInput,
} from "./readAlongInvariantHelpers";
import {
  buildReport,
  fallbackBlock,
  pushActiveWordIssues,
  pushBookmarkIssues,
  pushCueIntegrityIssues,
  pushIfJobMismatch,
  pushIfStaleHighlight,
  pushIssue,
  pushPassageIssues,
  pushPreparedActiveWordIssues,
  pushProgressIssues,
  pushReadingPositionIssues,
} from "./readAlongInvariantHelpers";

export type {
  BookReadAlongInvariantInput,
  PreparedSourceReadAlongInvariantInput,
  ReadAlongInvariantDebugRow,
  ReadAlongInvariantIssue,
  ReadAlongInvariantReport,
  ReadAlongInvariantSeverity,
  ReadAlongInvariantSurface,
  ReadAlongInvariantStatus,
  SourceSwitchInvariantInput,
};

export function evaluateBookReadAlongInvariant({
  activeBlock,
  activeSpan,
  activeText,
  activeWordIndex,
  bookSourceId,
  bookmark,
  generatedAudioState = "missing",
  highlightCue,
  highlightMap,
  jobMatchesSource,
  progress,
  scopeKey,
  visibleWordIndexes,
}: BookReadAlongInvariantInput): ReadAlongInvariantReport {
  const issues: ReadAlongInvariantIssue[] = [];
  pushIfStaleHighlight(issues, generatedAudioState, highlightCue, activeWordIndex);
  pushIfJobMismatch(issues, jobMatchesSource, "Generated audio belongs to another book scope.");
  pushCueIntegrityIssues(issues, highlightCue, highlightMap);
  pushReadingPositionIssues(issues, highlightCue?.readingPosition, {
    sourceId: bookSourceId,
    sourceKey: "bookSourceId",
    scopeKey,
  });
  pushProgressIssues(issues, progress, { sourceId: bookSourceId, sourceKey: "bookSourceId" });
  pushBookmarkIssues(issues, bookmark, { sourceId: bookSourceId, sourceKey: "bookSourceId" });
  pushActiveWordIssues(issues, activeWordIndex, activeSpan?.index, visibleWordIndexes);
  pushPassageIssues(
    issues,
    activeText ?? markdownBlockText(activeBlock ?? fallbackBlock()),
    highlightCue,
  );
  return buildReport("book", issues);
}

export function evaluatePreparedSourceReadAlongInvariant({
  activeBlock,
  activeText,
  activeWordIndex,
  generatedAudioState = "missing",
  highlightCue,
  highlightMap,
  jobMatchesSource,
  progress,
  source,
  surface,
  visibleNodeIds,
}: PreparedSourceReadAlongInvariantInput): ReadAlongInvariantReport {
  const issues: ReadAlongInvariantIssue[] = [];
  const activeWord = resolvePreparedSourceActiveWord(source, activeWordIndex);
  const expectedNodeId = activeWord?.blockId ?? activeBlock?.id ?? null;
  pushIfStaleHighlight(issues, generatedAudioState, highlightCue, activeWordIndex);
  pushIfJobMismatch(
    issues,
    jobMatchesSource,
    "Generated audio belongs to another prepared source.",
  );
  pushCueIntegrityIssues(issues, highlightCue, highlightMap);
  pushReadingPositionIssues(issues, highlightCue?.readingPosition, {
    nodeId: expectedNodeId,
    sourceId: source.id,
    sourceKey: "preparedSourceId",
  });
  pushProgressIssues(issues, progress, { sourceId: source.id, sourceKey: "preparedSourceId" });
  pushPreparedActiveWordIssues(
    issues,
    activeWordIndex,
    expectedNodeId,
    activeBlock,
    visibleNodeIds,
  );
  pushPassageIssues(
    issues,
    activeText ?? markdownBlockText(activeBlock ?? fallbackBlock()),
    highlightCue,
  );
  return buildReport(surface, issues);
}

export function evaluateSourceSwitchInvariant({
  activeWordIndex = -1,
  nextSourceId,
  previousHighlightCue,
  previousProgress,
  previousSourceId,
}: SourceSwitchInvariantInput): ReadAlongInvariantReport {
  const issues: ReadAlongInvariantIssue[] = [];
  if (previousSourceId !== nextSourceId && activeWordIndex >= 0) {
    pushIssue(issues, {
      detail: "A source switch must clear the prior active word before the next source renders.",
      id: "source-switch-active-word",
      label: "Source switch retained an active word",
      severity: "error",
    });
  }
  if (previousSourceId !== nextSourceId && previousHighlightCue) {
    pushIssue(issues, {
      detail: "A source switch must detach the previous highlight cue before playback resumes.",
      id: "source-switch-highlight-cue",
      label: "Source switch retained a highlight cue",
      severity: "error",
    });
  }
  if (previousSourceId !== nextSourceId && previousProgress) {
    pushIssue(issues, {
      detail:
        "Recent-position resume must reattach through the selected source, not stale progress.",
      id: "source-switch-progress",
      label: "Source switch retained progress",
      severity: "warning",
    });
  }
  return buildReport("prepared", issues);
}

export function readAlongInvariantDebugRows(
  report: ReadAlongInvariantReport,
): ReadAlongInvariantDebugRow[] {
  if (report.issues.length === 0) {
    return [{ label: "Fidelity", value: "Source, locator, passage, and highlight agree" }];
  }
  return report.issues.slice(0, 5).map((issue) => ({
    label: issue.label,
    value: issue.detail,
  }));
}

export function readAlongInvariantStatusLabel(report: ReadAlongInvariantReport): string {
  if (report.status === "passed") {
    return "Read-along aligned";
  }
  if (report.status === "degraded") {
    return "Read-along degraded";
  }
  return "Read-along drift";
}
