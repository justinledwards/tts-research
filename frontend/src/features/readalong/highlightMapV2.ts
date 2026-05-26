import type { ContentIRLocator } from "../../content-ir";
import type {
  HighlightFragment,
  HighlightMap,
  HighlightToken,
  ReadingPosition,
  TimingSource,
} from "../../types";

export const HIGHLIGHT_MAP_V2_SCHEMA_VERSION = "highlight-map.v2";

export type HighlightMapV2TimingLevel = "word" | "phrase" | "sentence" | "block";

export type HighlightMapV2TimingSource =
  | "provider-word"
  | "provider-mark"
  | "forced-alignment"
  | "phrase-estimate"
  | "heuristic";

export type HighlightMapV2FallbackMode =
  | "none"
  | "word-to-phrase"
  | "phrase-to-sentence"
  | "sentence-to-block"
  | "block-only"
  | "stale-audio"
  | "unavailable";

export interface HighlightMapV2Summary {
  blockCount: number;
  confidence: number;
  degraded: boolean;
  driftBudgetMs: number;
  entryCount: number;
  fallbackMode: HighlightMapV2FallbackMode;
  phraseCount: number;
  primaryLevel: HighlightMapV2TimingLevel;
  reason?: string;
  sentenceCount: number;
  status: string;
  timingSources: HighlightMapV2TimingSource[];
  wordCount: number;
  alignmentWarnings?: string[];
}

export interface HighlightMapV2Traceability {
  normalizedTextMatch?: string;
  policyTransform?: string;
  sourceTextMatch?: string;
  spokenTextMatch?: string;
}

export interface HighlightMapV2Entry {
  alignedEndMs: number | null;
  alignedStartMs: number | null;
  alignmentWarnings: string[];
  allowsOverlap?: boolean;
  audioEndMs: number;
  audioStartMs: number;
  confidence: number;
  contentIrVersion: "content-ir.v1";
  driftBudgetMs: number;
  entryId?: string;
  fallbackMode: HighlightMapV2FallbackMode;
  fragmentIndex: number | null;
  generatedAudioId: string;
  level: HighlightMapV2TimingLevel;
  nodeId: string;
  normalizedText: string;
  providerTimingEndMs: number | null;
  providerTimingStartMs: number | null;
  rawText: string;
  scopeKey: string;
  segmentId?: string;
  sentenceIndex: number | null;
  sourceId: string;
  sourceLocator: ContentIRLocator;
  speechPlanId: string;
  spokenText: string;
  textQuote: string;
  timingSource: HighlightMapV2TimingSource;
  tokenIndex: number | null;
  traceability?: HighlightMapV2Traceability;
}

export interface HighlightMapV2 {
  contentIrVersion: "content-ir.v1";
  durationMs: number;
  entries: HighlightMapV2Entry[];
  generatedAt: string;
  generatedAudioId: string;
  metadata?: Record<string, unknown>;
  schemaVersion: typeof HIGHLIGHT_MAP_V2_SCHEMA_VERSION;
  scopeKey: string;
  sourceId: string;
  speechPlanId: string;
  summary: HighlightMapV2Summary;
  timingLevels: HighlightMapV2TimingLevel[];
  warnings?: string[];
}

export type TimingArtifact = HighlightMap | HighlightMapV2;

export function isHighlightMapV2(
  value: TimingArtifact | null | undefined,
): value is HighlightMapV2 {
  return value?.schemaVersion === HIGHLIGHT_MAP_V2_SCHEMA_VERSION;
}

export function legacyHighlightMapFromTimingArtifact(
  artifact: TimingArtifact | null | undefined,
): HighlightMap | null {
  if (!artifact) {
    return null;
  }
  return isHighlightMapV2(artifact) ? highlightMapV2ToLegacyHighlightMap(artifact) : artifact;
}

export function highlightMapV2TimingSourceLabel(source: HighlightMapV2TimingSource): string {
  switch (source) {
    case "provider-word": {
      return "Provider word timing";
    }
    case "provider-mark": {
      return "Provider mark timing";
    }
    case "forced-alignment": {
      return "Forced alignment";
    }
    case "phrase-estimate": {
      return "Phrase estimate";
    }
    case "heuristic": {
      return "Heuristic timing";
    }
  }
}

export function legacyTimingSourceFromV2(source: HighlightMapV2TimingSource): TimingSource {
  switch (source) {
    case "provider-word":
    case "provider-mark": {
      return "native";
    }
    case "forced-alignment": {
      return "mfa";
    }
    case "phrase-estimate": {
      return "aeneas";
    }
    case "heuristic": {
      return "heuristic";
    }
  }
}

export function highlightMapV2ToLegacyHighlightMap(map: HighlightMapV2): HighlightMap {
  const legacySource = legacyTimingSourceFromV2(map.summary.timingSources[0] ?? "heuristic");
  const wordEntries = map.entries.filter((entry) => entry.level === "word");
  const anchorEntries = entriesForLegacyFragments(map);
  const fragments = anchorEntries.map((entry, index) => highlightFragmentFromV2Entry(entry, index));
  const tokens = wordEntries.map((entry, index) =>
    highlightTokenFromV2Entry(entry, index, fragmentIndexForEntry(entry, fragments)),
  );
  const mode = wordEntries.length > 0 && !map.summary.degraded ? "word" : "phrase";
  return {
    bookSourceId: map.sourceId,
    durationMs: map.durationMs,
    fragments,
    generatedAt: map.generatedAt,
    jobId: map.generatedAudioId,
    mode,
    schemaVersion: "highlight-map.v1",
    scopeKey: map.scopeKey,
    source: legacySource,
    status: map.summary.status,
    summary: {
      confidence: {
        overall: map.summary.confidence,
        segment: map.summary.confidence,
        token: wordEntries.length > 0 ? map.summary.confidence : 0,
        reason: map.summary.reason,
      },
      drift: {
        corrected: map.summary.fallbackMode !== "none",
        lowConfidence: map.summary.degraded,
        maxAbsoluteMs: map.summary.driftBudgetMs,
        maxRatio: 0,
        meanAbsoluteMs: 0,
        reason: map.summary.reason,
      },
      durationMs: map.durationMs,
      fragmentCount: fragments.length,
      lowConfidence: map.summary.degraded,
      mode,
      reason: map.summary.reason,
      source: legacySource,
      status: map.summary.status,
      tokenCount: tokens.length,
      warnings: [...(map.warnings ?? []), ...(map.summary.alignmentWarnings ?? [])],
    },
    tokens,
    warnings: map.warnings,
  };
}

function entriesForLegacyFragments(map: HighlightMapV2): HighlightMapV2Entry[] {
  const nonWordEntries = map.entries.filter((entry) => entry.level !== "word");
  if (nonWordEntries.length > 0) {
    return nonWordEntries;
  }
  const byFragment = new Map<number, HighlightMapV2Entry>();
  for (const entry of map.entries) {
    const fragmentIndex = entry.fragmentIndex ?? 0;
    if (!byFragment.has(fragmentIndex)) {
      byFragment.set(fragmentIndex, entry);
    }
  }
  return [...byFragment.values()];
}

function highlightFragmentFromV2Entry(
  entry: HighlightMapV2Entry,
  fallbackIndex: number,
): HighlightFragment {
  const activeWordIndex = entry.tokenIndex ?? entry.fragmentIndex ?? fallbackIndex;
  return {
    confidence: entry.confidence,
    endMs: entry.audioEndMs,
    index: entry.fragmentIndex ?? fallbackIndex,
    readingPosition: readingPositionFromV2Entry(entry, activeWordIndex),
    segmentIndex: entry.fragmentIndex ?? fallbackIndex,
    startMs: entry.audioStartMs,
    text: entry.spokenText || entry.normalizedText || entry.rawText,
    tokenEnd: entry.tokenIndex ?? undefined,
    tokenStart: entry.tokenIndex ?? undefined,
  };
}

function highlightTokenFromV2Entry(
  entry: HighlightMapV2Entry,
  fallbackIndex: number,
  fragmentIndex: number,
): HighlightToken {
  const tokenIndex = entry.tokenIndex ?? fallbackIndex;
  return {
    confidence: entry.confidence,
    endMs: entry.audioEndMs,
    fragmentIndex,
    index: tokenIndex,
    mode: "word",
    readingPosition: readingPositionFromV2Entry(entry, tokenIndex),
    segmentIndex: entry.fragmentIndex ?? fragmentIndex,
    startMs: entry.audioStartMs,
    text: entry.spokenText || entry.normalizedText || entry.rawText,
  };
}

function readingPositionFromV2Entry(
  entry: HighlightMapV2Entry,
  activeWordIndex: number,
): ReadingPosition {
  return {
    activeWordIndex,
    bookSourceId: entry.sourceId,
    locator: entry.sourceLocator,
    nodeId: entry.nodeId,
    scopeKey: entry.scopeKey,
    textQuote: entry.textQuote,
  };
}

function fragmentIndexForEntry(entry: HighlightMapV2Entry, fragments: HighlightFragment[]): number {
  const matchingFragment = fragments.find((fragment) => fragment.index === entry.fragmentIndex);
  if (matchingFragment) {
    return matchingFragment.index;
  }
  return fragments.length > 0 ? fragments[0].index : 0;
}
