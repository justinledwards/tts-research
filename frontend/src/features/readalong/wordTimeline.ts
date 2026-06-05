import type { BookSourceWordSpan, HighlightMap, NarrationBlock, PreparedSource } from "../../types";
import type {
  HighlightMapV2,
  HighlightMapV2TimingLevel,
  HighlightMapV2TimingSource,
} from "./highlightMapV2";

import {
  activeTimelineEntryAtCursor,
  isPresent,
  speechTokenLedgerEntryFromTimelineEntry,
  sortedEntries,
  wordTimelineEntryFromLegacyToken,
  wordTimelineEntryFromV2Entry,
  normalizeWordIdentityText,
} from "./wordTimelineHelpers";
import type { ReadAlongTimingLookupOptions } from "./timingLookup";

export type WordTimelineProvenance =
  | HighlightMapV2TimingSource
  | "legacy-highlight-map"
  | "job-segment"
  | "estimate";

export interface NarrationWordLedgerEntry {
  readonly anchorTokenOffset?: number;
  readonly blockId?: string;
  readonly blockKind?: string;
  readonly displayText: string;
  readonly endOffset: number;
  readonly normalizedText: string;
  readonly pageIndex?: number;
  readonly sourceWordId: string;
  readonly sourceWordIndex: number;
  readonly startOffset: number;
  readonly text: string;
}

export interface SpeechTokenLedgerEntry {
  readonly normalizedText: string;
  readonly sourceWordIds: readonly string[];
  readonly spokenTokenId: string;
  readonly text: string;
  readonly transformation: "normal" | "expanded" | "skipped" | "generated" | "unknown";
}

export interface WordTimelineEntry {
  readonly anchorNodeId?: string;
  readonly anchorTokenOffset?: number;
  readonly anchorWordIndex?: number;
  readonly audioEndMs: number;
  readonly audioStartMs: number;
  readonly confidence: number;
  readonly entryId: string;
  readonly groupKey?: string;
  readonly normalizedText: string;
  readonly provenance: WordTimelineProvenance;
  readonly segmentId?: string;
  readonly sourceWordId: string;
  readonly sourceWordIndex: number;
  readonly spokenTokenId: string;
  readonly text: string;
  readonly timingLevel: HighlightMapV2TimingLevel | "legacy-token";
}

export interface WordTimeline {
  readonly durationMs: number;
  readonly entries: readonly WordTimelineEntry[];
  readonly ledger: readonly NarrationWordLedgerEntry[];
  readonly source: "highlight-map-v2" | "legacy-highlight-map";
  readonly speechTokens: readonly SpeechTokenLedgerEntry[];
  readonly status: string;
}

export interface WordTimelineCursorResolution {
  readonly activeEntry: WordTimelineEntry;
  readonly phraseWordEnd?: number;
  readonly phraseWordStart?: number;
}

export function sourceWordIdFor(
  sourceId: string,
  scopeKey: string,
  sourceWordIndex: number,
): string {
  return `${sourceId || "source"}:${scopeKey || "scope"}:word:${sourceWordIndex.toString()}`;
}

export function sourceWordIdForSpan(
  sourceId: string,
  scopeKey: string,
  span: BookSourceWordSpan,
): string {
  return sourceWordIdFor(sourceId, scopeKey, span.index);
}

export function buildNarrationWordLedger({
  blocks = [],
  scopeKey,
  sourceId,
  spans,
}: Readonly<{
  blocks?: readonly NarrationBlock[];
  scopeKey: string;
  sourceId: string;
  spans: readonly BookSourceWordSpan[];
}>): NarrationWordLedgerEntry[] {
  return spans.map((span) => {
    const block = blocks.find(
      (candidate) =>
        span.endOffset > candidate.startOffset && span.startOffset < candidate.endOffset,
    );
    return {
      blockId: block?.id,
      blockKind: block?.kind,
      displayText: span.text,
      endOffset: span.endOffset,
      normalizedText: normalizeWordIdentityText(span.text),
      pageIndex: span.pageIndex,
      sourceWordId: sourceWordIdForSpan(sourceId, scopeKey, span),
      sourceWordIndex: span.index,
      startOffset: span.startOffset,
      text: span.text,
    };
  });
}

export function wordTimelineFromHighlightMapV2({
  blocks = [],
  map,
  scopeKey,
  sourceId,
  spans,
}: Readonly<{
  blocks?: readonly NarrationBlock[];
  map: HighlightMapV2 | null | undefined;
  scopeKey?: string;
  sourceId?: string;
  spans: readonly BookSourceWordSpan[];
}>): WordTimeline | null {
  if (!map || spans.length === 0) {
    return null;
  }
  const resolvedSourceId = sourceId ?? map.sourceId;
  const resolvedScopeKey = scopeKey ?? map.scopeKey;
  const ledger = buildNarrationWordLedger({
    blocks,
    scopeKey: resolvedScopeKey,
    sourceId: resolvedSourceId,
    spans,
  });
  const wordEntries = sortedEntries(map.entries.filter((entry) => entry.level === "word"));
  if (wordEntries.length === 0) {
    return null;
  }
  const entries = wordEntries
    .map((entry, ordinal) =>
      wordTimelineEntryFromV2Entry({
        entry,
        ledger,
        map,
        ordinal,
        scopeKey: resolvedScopeKey,
        sourceId: resolvedSourceId,
      }),
    )
    .filter(isPresent);
  if (entries.length === 0) {
    return null;
  }
  return {
    durationMs: map.durationMs,
    entries,
    ledger,
    source: "highlight-map-v2",
    speechTokens: entries.map((entry) => speechTokenLedgerEntryFromTimelineEntry(entry)),
    status: map.summary.status,
  };
}

export function wordTimelineFromLegacyHighlightMap({
  blocks = [],
  map,
  scopeKey,
  sourceId,
  spans,
}: Readonly<{
  blocks?: readonly NarrationBlock[];
  map: HighlightMap | null | undefined;
  scopeKey: string;
  sourceId: string;
  spans: readonly BookSourceWordSpan[];
}>): WordTimeline | null {
  if (!map || spans.length === 0 || map.tokens.length === 0) {
    return null;
  }
  const ledger = buildNarrationWordLedger({ blocks, scopeKey, sourceId, spans });
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted is not available in this TS lib.
  const tokens = [...map.tokens].sort((left, right) => left.startMs - right.startMs);
  const entries = tokens
    .map((token, ordinal) =>
      wordTimelineEntryFromLegacyToken({
        ledger,
        map,
        ordinal,
        scopeKey,
        sourceId,
        token,
      }),
    )
    .filter(isPresent);
  if (entries.length === 0) {
    return null;
  }
  return {
    durationMs: map.durationMs,
    entries,
    ledger,
    source: "legacy-highlight-map",
    speechTokens: entries.map((entry) => speechTokenLedgerEntryFromTimelineEntry(entry)),
    status: map.status,
  };
}

export function wordTimelineFromPreparedSourceHighlightMapV2({
  map,
  source,
}: Readonly<{
  map: HighlightMapV2 | null | undefined;
  source: PreparedSource;
}>): WordTimeline | null {
  if (!map) {
    return null;
  }
  const scopeKey = map.scopeKey;
  const ledger = buildPreparedSourceWordLedger({
    scopeKey,
    source,
    sourceId: source.id,
  });
  if (ledger.length === 0) {
    return null;
  }
  const wordEntries = sortedEntries(
    map.entries.filter(
      (entry) =>
        entry.level === "word" &&
        entry.generatedAudioId === map.generatedAudioId &&
        (!entry.sourceId || entry.sourceId === source.id),
    ),
  );
  if (wordEntries.length === 0) {
    return null;
  }
  const entries = wordEntries
    .map((entry, ordinal) =>
      wordTimelineEntryFromV2Entry({
        entry,
        ledger,
        map,
        ordinal,
        scopeKey,
        sourceId: source.id,
      }),
    )
    .filter(isPresent);
  if (entries.length === 0) {
    return null;
  }
  return {
    durationMs: map.durationMs,
    entries,
    ledger,
    source: "highlight-map-v2",
    speechTokens: entries.map((entry) => speechTokenLedgerEntryFromTimelineEntry(entry)),
    status: map.summary.status,
  };
}

export function wordTimelineFromPreparedSourceLegacyHighlightMap({
  map,
  source,
}: Readonly<{
  map: HighlightMap | null | undefined;
  source: PreparedSource;
}>): WordTimeline | null {
  if (!map || map.tokens.length === 0) {
    return null;
  }
  const scopeKey = map.scopeKey ?? "prepared-source";
  const ledger = buildPreparedSourceWordLedger({
    scopeKey,
    source,
    sourceId: source.id,
  });
  if (ledger.length === 0) {
    return null;
  }
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted is not available in this TS lib.
  const tokens = [...map.tokens].sort((left, right) => left.startMs - right.startMs);
  const entries = tokens
    .map((token, ordinal) =>
      wordTimelineEntryFromLegacyToken({
        ledger,
        map,
        ordinal,
        scopeKey,
        sourceId: source.id,
        token,
      }),
    )
    .filter(isPresent);
  if (entries.length === 0) {
    return null;
  }
  return {
    durationMs: map.durationMs,
    entries,
    ledger,
    source: "legacy-highlight-map",
    speechTokens: entries.map((entry) => speechTokenLedgerEntryFromTimelineEntry(entry)),
    status: map.status,
  };
}

export function buildPreparedSourceWordLedger({
  scopeKey,
  source,
  sourceId,
}: Readonly<{
  scopeKey: string;
  source: PreparedSource;
  sourceId: string;
}>): NarrationWordLedgerEntry[] {
  const ledger: NarrationWordLedgerEntry[] = [];
  for (const block of source.blocks ?? []) {
    if (block.speakMode === "skip") {
      continue;
    }
    const text = block.spokenText ?? block.text ?? "";
    let tokenOffset = 0;
    for (const match of text.matchAll(/(\S+)(\s*)/g)) {
      const sourceWordIndex = ledger.length;
      const matchStart = match.index;
      ledger.push({
        anchorTokenOffset: tokenOffset,
        blockId: block.id,
        blockKind: block.kind,
        displayText: match[1],
        endOffset: block.startOffset + matchStart + match[1].length,
        normalizedText: normalizeWordIdentityText(match[1]),
        sourceWordId: sourceWordIdFor(sourceId, scopeKey, sourceWordIndex),
        sourceWordIndex,
        startOffset: block.startOffset + matchStart,
        text: match[1],
      });
      tokenOffset += 1;
    }
  }
  return ledger;
}

export function resolveWordTimelineAtCursor(
  timeline: WordTimeline | null | undefined,
  cursorMs: number,
  options: ReadAlongTimingLookupOptions = {},
): WordTimelineCursorResolution | null {
  const entries = timeline?.entries ?? [];
  if (entries.length === 0) {
    return null;
  }
  const activeEntry = activeTimelineEntryAtCursor(entries, cursorMs, options);
  if (!activeEntry) {
    return null;
  }
  const groupEntries = activeEntry.groupKey
    ? entries.filter((entry) => entry.groupKey === activeEntry.groupKey)
    : [activeEntry];
  const indexes = groupEntries.map((entry) => entry.sourceWordIndex);
  return {
    activeEntry,
    phraseWordEnd: indexes.length > 0 ? Math.max(...indexes) : undefined,
    phraseWordStart: indexes.length > 0 ? Math.min(...indexes) : undefined,
  };
}

export function wordTimelineEntryForSourceWordId(
  timeline: WordTimeline | null | undefined,
  sourceWordId: string | null | undefined,
): WordTimelineEntry | null {
  if (!sourceWordId) {
    return null;
  }
  return timeline?.entries.find((entry) => entry.sourceWordId === sourceWordId) ?? null;
}
