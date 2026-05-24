import type { HighlightCue } from "../../highlightMap";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import type {
  BookSourceWordSpan,
  HighlightMap,
  NarrationBlock,
  PlaybackProgress,
  PreparedSource,
  ProgressBookmark,
  ReadingPosition,
} from "../../types";
import type { GeneratedAudioLifecycleState } from "../playback/generatedAudioLifecycle";

export type ReadAlongInvariantStatus = "passed" | "degraded" | "failed";
export type ReadAlongInvariantSeverity = "info" | "warning" | "error";
export type ReadAlongInvariantSurface = "book" | "document" | "prepared" | "website";

export interface ReadAlongInvariantIssue {
  detail: string;
  id: string;
  label: string;
  severity: ReadAlongInvariantSeverity;
}

export interface ReadAlongInvariantReport {
  issues: ReadAlongInvariantIssue[];
  status: ReadAlongInvariantStatus;
  summary: string;
  surface: ReadAlongInvariantSurface;
}

export interface ReadAlongInvariantDebugRow {
  label: string;
  value: string;
}

interface BaseReadAlongInvariantInput {
  activeText?: string | null;
  activeWordIndex: number;
  generatedAudioState?: GeneratedAudioLifecycleState;
  highlightCue?: HighlightCue | null;
  highlightMap?: HighlightMap | null;
  progress?: PlaybackProgress | null;
  visibleNodeIds?: readonly string[];
  visibleWordIndexes?: readonly number[];
}

export interface BookReadAlongInvariantInput extends BaseReadAlongInvariantInput {
  activeBlock?: NarrationBlock | null;
  activeSpan?: BookSourceWordSpan | null;
  bookSourceId: string;
  bookmark?: ProgressBookmark | null;
  jobMatchesSource: boolean;
  scopeKey: string;
}

export interface PreparedSourceReadAlongInvariantInput extends BaseReadAlongInvariantInput {
  activeBlock?: NarrationBlock | null;
  jobMatchesSource: boolean;
  source: PreparedSource;
  surface: Exclude<ReadAlongInvariantSurface, "book">;
}

export interface SourceSwitchInvariantInput {
  activeWordIndex?: number;
  nextSourceId: string;
  previousHighlightCue?: HighlightCue | null;
  previousProgress?: PlaybackProgress | null;
  previousSourceId: string;
}

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

function pushIfStaleHighlight(
  issues: ReadAlongInvariantIssue[],
  lifecycle: GeneratedAudioLifecycleState,
  highlightCue: HighlightCue | null | undefined,
  activeWordIndex: number,
) {
  if (lifecycle !== "stale") {
    return;
  }
  if (highlightCue || activeWordIndex >= 0) {
    pushIssue(issues, {
      detail: "Stale generated audio must not drive the current-word highlight.",
      id: "stale-audio-highlight",
      label: "Stale audio is highlighting text",
      severity: "error",
    });
  }
}

function pushIfJobMismatch(issues: ReadAlongInvariantIssue[], matches: boolean, detail: string) {
  if (matches) {
    return;
  }
  pushIssue(issues, {
    detail,
    id: "job-source-mismatch",
    label: "Audio/source mismatch",
    severity: "error",
  });
}

function pushCueIntegrityIssues(
  issues: ReadAlongInvariantIssue[],
  cue: HighlightCue | null | undefined,
  map: HighlightMap | null | undefined,
) {
  if (!cue) {
    return;
  }
  if (cue.token && cue.fragment && cue.token.fragmentIndex !== cue.fragment.index) {
    pushIssue(issues, {
      detail: "The active token belongs to a different fragment than the current passage.",
      id: "token-fragment-mismatch",
      label: "Token outside active fragment",
      severity: "error",
    });
  }
  if (
    cue.fragment &&
    map &&
    !map.fragments.some((fragment) => fragment.index === cue.fragment?.index)
  ) {
    pushIssue(issues, {
      detail: "The active fragment is not present in the current highlight map.",
      id: "fragment-map-mismatch",
      label: "Fragment outside timing map",
      severity: "error",
    });
  }
  if (
    cue.fragment &&
    cue.token &&
    cue.fragment.tokenStart !== undefined &&
    cue.fragment.tokenEnd !== undefined
  ) {
    const tokenInRange =
      cue.token.index >= cue.fragment.tokenStart && cue.token.index <= cue.fragment.tokenEnd;
    if (!tokenInRange) {
      pushIssue(issues, {
        detail: "The active token index is outside the fragment token range.",
        id: "token-range-mismatch",
        label: "Token outside fragment range",
        severity: "error",
      });
    }
  }
}

function pushReadingPositionIssues(
  issues: ReadAlongInvariantIssue[],
  position: ReadingPosition | undefined,
  expected: {
    nodeId?: string | null;
    scopeKey?: string;
    sourceId: string;
    sourceKey: "bookSourceId" | "preparedSourceId";
  },
) {
  if (!position) {
    return;
  }
  if (expected.sourceKey === "bookSourceId" && position.bookSourceId !== expected.sourceId) {
    pushIssue(issues, {
      detail: `Highlight locator points at ${position.bookSourceId ?? "no book"}, expected ${expected.sourceId}.`,
      id: "locator-source-mismatch",
      label: "Locator outside active source",
      severity: "error",
    });
  }
  if (expected.scopeKey && position.scopeKey && position.scopeKey !== expected.scopeKey) {
    pushIssue(issues, {
      detail: `Highlight scope is ${position.scopeKey}, expected ${expected.scopeKey}.`,
      id: "locator-scope-mismatch",
      label: "Locator outside active scope",
      severity: "error",
    });
  }
  if (expected.nodeId && position.nodeId && position.nodeId !== expected.nodeId) {
    pushIssue(issues, {
      detail: `Highlight node is ${position.nodeId}, expected ${expected.nodeId}.`,
      id: "locator-node-mismatch",
      label: "Locator outside active node",
      severity: "error",
    });
  }
}

function pushProgressIssues(
  issues: ReadAlongInvariantIssue[],
  progress: PlaybackProgress | null | undefined,
  expected: { sourceId: string; sourceKey: "bookSourceId" | "preparedSourceId" },
) {
  if (!progress) {
    return;
  }
  const actualSourceId =
    expected.sourceKey === "bookSourceId" ? progress.bookSourceId : progress.preparedSourceId;
  if (actualSourceId !== expected.sourceId) {
    pushIssue(issues, {
      detail: `Saved progress points at ${actualSourceId ?? "unknown source"}, expected ${expected.sourceId}.`,
      id: "progress-source-mismatch",
      label: "Recent position outside active source",
      severity: "error",
    });
  }
}

function pushBookmarkIssues(
  issues: ReadAlongInvariantIssue[],
  bookmark: ProgressBookmark | null | undefined,
  expected: { sourceId: string; sourceKey: "bookSourceId" | "preparedSourceId" },
) {
  if (!bookmark?.readingPosition) {
    return;
  }
  if (
    expected.sourceKey === "bookSourceId" &&
    bookmark.readingPosition.bookSourceId !== expected.sourceId
  ) {
    pushIssue(issues, {
      detail: `Bookmark reopens ${bookmark.readingPosition.bookSourceId ?? "no book"}, expected ${expected.sourceId}.`,
      id: "bookmark-source-mismatch",
      label: "Bookmark outside active source",
      severity: "error",
    });
  }
}

function pushActiveWordIssues(
  issues: ReadAlongInvariantIssue[],
  activeWordIndex: number,
  expectedWordIndex: number | undefined,
  visibleWordIndexes: readonly number[] | undefined,
) {
  if (expectedWordIndex !== undefined && activeWordIndex !== expectedWordIndex) {
    pushIssue(issues, {
      detail: `Reader active word is ${String(activeWordIndex)}, but the active span is ${String(expectedWordIndex)}.`,
      id: "active-word-span-mismatch",
      label: "Active word outside active span",
      severity: "error",
    });
  }
  if (visibleWordIndexes && activeWordIndex >= 0 && !visibleWordIndexes.includes(activeWordIndex)) {
    pushIssue(issues, {
      detail: `Word ${String(activeWordIndex)} is not in the visible reader region.`,
      id: "active-word-not-visible",
      label: "Locator outside visible region",
      severity: "error",
    });
  }
}

function pushPreparedActiveWordIssues(
  issues: ReadAlongInvariantIssue[],
  activeWordIndex: number,
  expectedNodeId: string | null,
  activeBlock: NarrationBlock | null | undefined,
  visibleNodeIds: readonly string[] | undefined,
) {
  if (activeWordIndex >= 0 && !expectedNodeId) {
    pushIssue(issues, {
      detail: `Word ${String(activeWordIndex)} could not be resolved to a narration block.`,
      id: "prepared-word-unresolved",
      label: "Active word has no source node",
      severity: "error",
    });
  }
  if (expectedNodeId && activeBlock && activeBlock.id !== expectedNodeId) {
    pushIssue(issues, {
      detail: `Reader block is ${activeBlock.id}, but the active word resolves to ${expectedNodeId}.`,
      id: "prepared-active-block-mismatch",
      label: "Active fragment outside source node",
      severity: "error",
    });
  }
  if (visibleNodeIds && expectedNodeId && !visibleNodeIds.includes(expectedNodeId)) {
    pushIssue(issues, {
      detail: `Node ${expectedNodeId} is not in the visible reader region.`,
      id: "prepared-node-not-visible",
      label: "Locator outside visible region",
      severity: "error",
    });
  }
}

function pushPassageIssues(
  issues: ReadAlongInvariantIssue[],
  activeText: string,
  cue: HighlightCue | null | undefined,
) {
  const fragmentText = cue?.fragment?.text;
  if (!fragmentText || textMatchesPassage(fragmentText, activeText)) {
    return;
  }
  pushIssue(issues, {
    detail: `Spoken fragment "${trimForDisplay(fragmentText)}" does not match the current passage "${trimForDisplay(activeText)}".`,
    id: "spoken-fragment-passage-mismatch",
    label: "Spoken fragment outside current passage",
    severity: "error",
  });
}

function textMatchesPassage(fragmentText: string, passageText: string): boolean {
  const fragment = normalizeText(fragmentText);
  const passage = normalizeText(passageText);
  if (!fragment || !passage) {
    return true;
  }
  if (passage.includes(fragment) || fragment.includes(passage)) {
    return true;
  }
  const locatorText = fragmentText.length < 80 ? fragmentText : fragmentText.slice(0, 80);
  return normalizeText(locatorText)
    .split(" ")
    .filter((token) => token.length > 3)
    .some((token) => passage.includes(token));
}

function buildReport(
  surface: ReadAlongInvariantSurface,
  issues: ReadAlongInvariantIssue[],
): ReadAlongInvariantReport {
  const status = readAlongStatusForIssues(issues);
  return {
    issues,
    status,
    summary:
      status === "passed"
        ? "Read-along source, locator, visible region, and spoken passage agree."
        : `${String(issues.length)} read-along invariant ${issueNoun(issues.length)} detected.`,
    surface,
  };
}

function readAlongStatusForIssues(
  issues: readonly ReadAlongInvariantIssue[],
): ReadAlongInvariantStatus {
  if (issues.some((issue) => issue.severity === "error")) {
    return "failed";
  }
  if (issues.length > 0) {
    return "degraded";
  }
  return "passed";
}

function issueNoun(count: number): string {
  if (count === 1) {
    return "issue";
  }
  return "issues";
}

function pushIssue(issues: ReadAlongInvariantIssue[], issue: ReadAlongInvariantIssue) {
  if (!issues.some((item) => item.id === issue.id)) {
    issues.push(issue);
  }
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}\s]+/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function trimForDisplay(value: string): string {
  const trimmed = value.replaceAll(/\s+/g, " ").trim();
  return trimmed.length > 72 ? `${trimmed.slice(0, 69)}...` : trimmed;
}

function fallbackBlock(): NarrationBlock {
  return {
    endOffset: 0,
    id: "unknown",
    index: 0,
    kind: "body",
    segments: [],
    speakMode: "speak",
    speechPolicy: { explanation: "", mode: "speak", profile: "default" },
    startOffset: 0,
    text: "",
  };
}
