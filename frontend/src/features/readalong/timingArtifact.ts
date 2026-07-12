import type {
  ContentIRDocument,
  ContentIRLocator,
  ContentIRNode,
  SpeechPlanDocument,
} from "../../content-ir";
import type {
  HighlightMapV2,
  HighlightMapV2Entry,
  HighlightMapV2TimingLevel,
} from "./highlightMapV2";

export type TimingArtifactValidationSeverity = "error" | "warning";
export type TimingArtifactValidationStatus = "passed" | "degraded" | "failed";

export interface TimingArtifactValidationIssue {
  detail: string;
  entryId?: string;
  id: string;
  severity: TimingArtifactValidationSeverity;
}

export interface TimingArtifactValidationInput {
  artifact: HighlightMapV2;
  contentIr?: ContentIRDocument | null;
  speechPlan?: SpeechPlanDocument | null;
}

export interface TimingArtifactValidationReport {
  issues: TimingArtifactValidationIssue[];
  status: TimingArtifactValidationStatus;
  summary: string;
}

export function validateTimingArtifact({
  artifact,
  contentIr,
  speechPlan,
}: TimingArtifactValidationInput): TimingArtifactValidationReport {
  const issues: TimingArtifactValidationIssue[] = [];
  const nodeById = new Map<string, ContentIRNode>(
    (contentIr?.nodes ?? []).map((node) => [node.nodeId, node]),
  );

  validateRootConsistency(issues, artifact);
  validateSummaryCounts(issues, artifact);
  validateEntries(issues, artifact, nodeById, contentIr, speechPlan);

  const hasErrors = issues.some((issue) => issue.severity === "error");
  if (hasErrors) {
    return {
      issues,
      status: "failed",
      summary: "Timing artifact failed read-along contract validation.",
    };
  }
  if (artifact.summary.degraded || issues.length > 0) {
    return {
      issues,
      status: "degraded",
      summary: "Timing artifact is valid but degraded or warning-bearing.",
    };
  }
  return {
    issues,
    status: "passed",
    summary: "Timing artifact binds source text, spoken text, locators, and audio time.",
  };
}

export function timingArtifactDebugRows(
  report: TimingArtifactValidationReport,
): { label: string; value: string }[] {
  if (report.issues.length === 0) {
    return [{ label: "Timing contract", value: report.summary }];
  }
  return report.issues.slice(0, 5).map((issue) => ({
    label: issue.id,
    value: issue.detail,
  }));
}

function validateRootConsistency(
  issues: TimingArtifactValidationIssue[],
  artifact: HighlightMapV2,
) {
  for (const entry of artifact.entries) {
    if (entry.sourceId !== artifact.sourceId) {
      pushIssue(
        issues,
        "entry-source-mismatch",
        "error",
        "Entry sourceId differs from artifact sourceId.",
        entry,
      );
    }
    if (entry.scopeKey !== artifact.scopeKey) {
      pushIssue(
        issues,
        "entry-scope-mismatch",
        "error",
        "Entry scopeKey differs from artifact scopeKey.",
        entry,
      );
    }
    if (entry.generatedAudioId !== artifact.generatedAudioId) {
      pushIssue(
        issues,
        "entry-audio-mismatch",
        "error",
        "Entry generatedAudioId differs from artifact generatedAudioId.",
        entry,
      );
    }
    if (entry.speechPlanId !== artifact.speechPlanId) {
      pushIssue(
        issues,
        "entry-speech-plan-mismatch",
        "error",
        "Entry speechPlanId differs from artifact speechPlanId.",
        entry,
      );
    }
    if (!artifact.timingLevels.includes(entry.level)) {
      pushIssue(
        issues,
        "entry-level-missing",
        "error",
        `Entry level ${entry.level} is not declared in timingLevels.`,
        entry,
      );
    }
  }
}

function validateSummaryCounts(issues: TimingArtifactValidationIssue[], artifact: HighlightMapV2) {
  const counts = countEntriesByLevel(artifact.entries);
  const expected = {
    block: artifact.summary.blockCount,
    phrase: artifact.summary.phraseCount,
    sentence: artifact.summary.sentenceCount,
    word: artifact.summary.wordCount,
  };
  if (artifact.summary.entryCount !== artifact.entries.length) {
    pushIssue(
      issues,
      "summary-entry-count",
      "error",
      `Summary entryCount ${artifact.summary.entryCount.toString()} does not match ${artifact.entries.length.toString()} entries.`,
    );
  }
  for (const level of Object.keys(expected) as HighlightMapV2TimingLevel[]) {
    if (counts[level] !== expected[level]) {
      pushIssue(
        issues,
        `summary-${level}-count`,
        "error",
        `Summary ${level}Count ${expected[level].toString()} does not match ${counts[level].toString()} ${level} entries.`,
      );
    }
  }
}

function validateEntries(
  issues: TimingArtifactValidationIssue[],
  artifact: HighlightMapV2,
  nodeById: Map<string, ContentIRNode>,
  contentIr: ContentIRDocument | null | undefined,
  speechPlan: SpeechPlanDocument | null | undefined,
) {
  let previousAudioStartMs = -1;
  for (const entry of artifact.entries) {
    validateTimingRange(issues, entry, "audio", entry.audioStartMs, entry.audioEndMs);
    validateTimingRange(
      issues,
      entry,
      "provider",
      entry.providerTimingStartMs,
      entry.providerTimingEndMs,
    );
    validateTimingRange(issues, entry, "aligned", entry.alignedStartMs, entry.alignedEndMs);
    if (entry.audioStartMs < previousAudioStartMs) {
      pushIssue(
        issues,
        "audio-range-not-monotonic",
        "error",
        "Timing entries must be sorted by nondecreasing audioStartMs.",
        entry,
      );
    }
    previousAudioStartMs = entry.audioStartMs;
    if (entry.audioEndMs > artifact.durationMs) {
      pushIssue(
        issues,
        "audio-range-exceeds-duration",
        "error",
        "Entry audioEndMs exceeds artifact durationMs.",
        entry,
      );
    }
    validateSourceBinding(issues, entry, contentIr, nodeById);
    validateTextTraceability(issues, entry, nodeById.get(entry.nodeId), speechPlan);
  }
  validateWordOverlap(issues, artifact.entries);
}

function validateTimingRange(
  issues: TimingArtifactValidationIssue[],
  entry: HighlightMapV2Entry,
  label: string,
  startMs: number | null,
  endMs: number | null,
) {
  if (startMs === null && endMs === null) {
    return;
  }
  if (startMs === null || endMs === null) {
    pushIssue(
      issues,
      `${label}-range-partial`,
      "error",
      `${label} timing must provide both start and end or neither.`,
      entry,
    );
    return;
  }
  if (endMs < startMs) {
    pushIssue(
      issues,
      `${label}-range-reversed`,
      "error",
      `${label} timing end must be greater than or equal to start.`,
      entry,
    );
  }
}

function validateSourceBinding(
  issues: TimingArtifactValidationIssue[],
  entry: HighlightMapV2Entry,
  contentIr: ContentIRDocument | null | undefined,
  nodeById: Map<string, ContentIRNode>,
) {
  if (!contentIr) {
    return;
  }
  if (contentIr.sourceId !== entry.sourceId) {
    pushIssue(
      issues,
      "artifact-source-not-found",
      "error",
      `Content IR sourceId ${contentIr.sourceId} does not match timing sourceId ${entry.sourceId}.`,
      entry,
    );
    return;
  }
  const node = nodeById.get(entry.nodeId);
  if (!node) {
    pushIssue(
      issues,
      "entry-node-not-found",
      "error",
      `Entry nodeId ${entry.nodeId} does not resolve to a Content IR node.`,
      entry,
    );
    return;
  }
  if (!contentIRLocatorsMatch(entry.sourceLocator, node.provenance.locator)) {
    pushIssue(
      issues,
      "entry-locator-mismatch",
      "error",
      "Entry sourceLocator does not match the Content IR node locator.",
      entry,
    );
  }
}

function validateTextTraceability(
  issues: TimingArtifactValidationIssue[],
  entry: HighlightMapV2Entry,
  node: ContentIRNode | undefined,
  speechPlan: SpeechPlanDocument | null | undefined,
) {
  if (!node) {
    return;
  }
  const sourceText = normalizeTraceText([node.displayText, node.normalisedText, entry.textQuote]);
  const spokenText = normalizeTraceText([
    node.speechText,
    ...speechPlanSegmentsForEntry(speechPlan, entry),
    entry.traceability?.spokenTextMatch ?? "",
  ]);
  if (
    !containsTraceText(sourceText, entry.rawText) &&
    !containsTraceText(sourceText, entry.textQuote)
  ) {
    pushIssue(
      issues,
      "raw-text-not-traceable",
      "error",
      "Entry rawText/textQuote is not traceable to the Content IR node text.",
      entry,
    );
  }
  if (!containsTraceText(sourceText, entry.normalizedText)) {
    pushIssue(
      issues,
      "normalized-text-not-traceable",
      "error",
      "Entry normalizedText is not traceable to Content IR display or normalized text.",
      entry,
    );
  }
  if (
    !containsTraceText(spokenText, entry.spokenText) &&
    !containsTraceText(sourceText, entry.spokenText) &&
    !entry.traceability?.policyTransform
  ) {
    pushIssue(
      issues,
      "spoken-text-not-traceable",
      "error",
      "Entry spokenText is not traceable to source text, speech-plan text, or a policy transform.",
      entry,
    );
  }
}

function validateWordOverlap(
  issues: TimingArtifactValidationIssue[],
  entries: readonly HighlightMapV2Entry[],
) {
  const wordEntriesByFragment = new Map<number, HighlightMapV2Entry[]>();
  for (const entry of entries) {
    if (entry.level !== "word") {
      continue;
    }
    const fragmentIndex = entry.fragmentIndex ?? 0;
    const words = wordEntriesByFragment.get(fragmentIndex) ?? [];
    insertWordEntryByAudioStart(words, entry);
    wordEntriesByFragment.set(fragmentIndex, words);
  }
  for (const words of wordEntriesByFragment.values()) {
    for (let index = 1; index < words.length; index += 1) {
      const previous = words[index - 1];
      const current = words[index];
      if (
        current.audioStartMs < previous.audioEndMs &&
        !previous.allowsOverlap &&
        !current.allowsOverlap
      ) {
        pushIssue(
          issues,
          "word-overlap",
          "error",
          "Word timing entries overlap inside the same fragment without allowsOverlap.",
          current,
        );
      }
    }
  }
}

function insertWordEntryByAudioStart(words: HighlightMapV2Entry[], entry: HighlightMapV2Entry) {
  const insertAt = words.findIndex((word) => entry.audioStartMs < word.audioStartMs);
  if (insertAt === -1) {
    words.push(entry);
    return;
  }
  words.splice(insertAt, 0, entry);
}

function countEntriesByLevel(entries: readonly HighlightMapV2Entry[]) {
  const counts: Record<HighlightMapV2TimingLevel, number> = {
    block: 0,
    phrase: 0,
    sentence: 0,
    word: 0,
  };
  for (const entry of entries) {
    counts[entry.level] += 1;
  }
  return counts;
}

function speechPlanSegmentsForEntry(
  speechPlan: SpeechPlanDocument | null | undefined,
  entry: HighlightMapV2Entry,
): string[] {
  if (speechPlan?.id !== entry.speechPlanId) {
    return [];
  }
  return speechPlan.segments
    .filter((segment) => segment.nodeId === entry.nodeId)
    .map((segment) => segment.text);
}

function containsTraceText(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeTraceText([needle]);
  return normalizedNeedle.length === 0 || haystack.includes(normalizedNeedle);
}

function normalizeTraceText(values: readonly string[]): string {
  return values
    .join(" ")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function contentIRLocatorsMatch(left: ContentIRLocator, right: ContentIRLocator): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pushIssue(
  issues: TimingArtifactValidationIssue[],
  id: string,
  severity: TimingArtifactValidationSeverity,
  detail: string,
  entry?: HighlightMapV2Entry,
) {
  issues.push({
    detail,
    entryId: entry?.entryId,
    id,
    severity,
  });
}
