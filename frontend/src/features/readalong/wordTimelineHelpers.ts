import type { HighlightMap, HighlightToken, ReadingPosition } from "../../types";
import type { HighlightMapV2, HighlightMapV2Entry } from "./highlightMapV2";
import type {
  NarrationWordLedgerEntry,
  SpeechTokenLedgerEntry,
  WordTimelineEntry,
} from "./wordTimeline";
import { resolveReadAlongTimingItem, type ReadAlongTimingLookupOptions } from "./timingLookup";

export function wordTimelineEntryFromV2Entry({
  entry,
  ledger,
  map,
  ordinal,
  scopeKey,
  sourceId,
}: Readonly<{
  entry: HighlightMapV2Entry;
  ledger: readonly NarrationWordLedgerEntry[];
  map: HighlightMapV2;
  ordinal: number;
  scopeKey: string;
  sourceId: string;
}>): WordTimelineEntry | null {
  const ledgerEntry = ledgerEntryForV2Entry({ entry, ledger, scopeKey, sourceId });
  if (!ledgerEntry) {
    return null;
  }
  const spokenTokenId =
    optionalString(entry.spokenTokenId) ??
    `${map.speechPlanId}:token:${(entry.tokenIndex ?? ordinal).toString()}`;
  return {
    anchorNodeId: ledgerEntry.blockId,
    anchorTokenOffset: ledgerEntry.anchorTokenOffset,
    anchorWordIndex: ledgerEntry.anchorWordIndex,
    audioEndMs: resolvedEndMs(entry),
    audioStartMs: resolvedStartMs(entry),
    confidence: safeConfidence(entry.confidence, 1),
    entryId: entry.entryId ?? `v2:${ordinal.toString()}`,
    groupKey: v2GroupKey(entry),
    normalizedText: normalizeWordIdentityText(v2EntryText(entry)),
    provenance: entry.timingSource,
    segmentId: entry.segmentId,
    sourceWordId: ledgerEntry.sourceWordId,
    sourceWordIndex: entry.sourceWordIndex ?? ledgerEntry.sourceWordIndex,
    spokenTokenId,
    text: v2EntryText(entry),
    timingLevel: entry.level,
  };
}

export function wordTimelineEntryFromLegacyToken({
  ledger,
  map,
  ordinal,
  scopeKey,
  sourceId,
  token,
}: Readonly<{
  ledger: readonly NarrationWordLedgerEntry[];
  map: HighlightMap;
  ordinal: number;
  scopeKey: string;
  sourceId: string;
  token: HighlightToken;
}>): WordTimelineEntry | null {
  const ledgerEntry =
    ledgerEntryForReadingPosition({
      expectedText: token.text,
      ledger,
      position: token.readingPosition,
      scopeKey,
      sourceId,
    }) ?? ledgerEntryByOrdinalOrText({ expectedText: token.text, ledger, ordinal: token.index });
  if (!ledgerEntry) {
    return null;
  }
  return {
    anchorNodeId: ledgerEntry.blockId,
    anchorTokenOffset: ledgerEntry.anchorTokenOffset,
    anchorWordIndex: ledgerEntry.anchorWordIndex,
    audioEndMs: Math.max(token.endMs, token.startMs + 1),
    audioStartMs: Math.max(0, token.startMs),
    confidence: safeConfidence(token.confidence, 1),
    entryId: `legacy:${token.index.toString()}:${ordinal.toString()}`,
    groupKey: `legacy-fragment:${token.fragmentIndex.toString()}`,
    normalizedText: normalizeWordIdentityText(token.text),
    provenance: "legacy-highlight-map",
    sourceWordId: ledgerEntry.sourceWordId,
    sourceWordIndex: ledgerEntry.sourceWordIndex,
    spokenTokenId: `${map.jobId ?? "legacy"}:token:${token.index.toString()}`,
    text: token.text,
    timingLevel: "legacy-token",
  };
}

export function ledgerEntryForV2Entry({
  entry,
  ledger,
  scopeKey,
  sourceId,
}: Readonly<{
  entry: HighlightMapV2Entry;
  ledger: readonly NarrationWordLedgerEntry[];
  scopeKey: string;
  sourceId: string;
}>): NarrationWordLedgerEntry | null {
  const explicitId = optionalString(entry.sourceWordId);
  if (explicitId) {
    const match = ledger.find((item) => item.sourceWordId === explicitId);
    if (match) {
      return match;
    }
  }
  if (Number.isInteger(entry.sourceWordIndex)) {
    const match = ledger.find((item) => item.sourceWordIndex === entry.sourceWordIndex);
    if (match) {
      return match;
    }
  }
  const positionMatch = ledgerEntryForReadingPosition({
    expectedText: v2EntryText(entry),
    ledger,
    position: entry.readingPosition,
    scopeKey,
    sourceId,
  });
  if (positionMatch) {
    return positionMatch;
  }
  const expectedText = v2EntryText(entry);
  const tokenIndex = entry.tokenIndex;
  const exactTextMatch = ledgerEntryBySourceIndex({
    expectedText,
    ledger,
    sourceWordIndex: tokenIndex,
    strictText: true,
  });
  if (exactTextMatch) {
    return exactTextMatch;
  }
  const ordinalTextMatch = ledgerEntryByOrdinalOrText({
    expectedText,
    ledger,
    ordinal: tokenIndex,
    strictText: true,
  });
  if (ordinalTextMatch) {
    return ordinalTextMatch;
  }
  return (
    ledgerEntryBySourceIndex({ expectedText, ledger, sourceWordIndex: tokenIndex }) ??
    ledgerEntryByOrdinalOrText({ expectedText, ledger, ordinal: tokenIndex }) ??
    uniqueLedgerEntryByText(ledger, expectedText)
  );
}

export function ledgerEntryForReadingPosition({
  expectedText,
  ledger,
  position,
  scopeKey,
  sourceId,
}: Readonly<{
  expectedText: string;
  ledger: readonly NarrationWordLedgerEntry[];
  position?: ReadingPosition;
  scopeKey: string;
  sourceId: string;
}>): NarrationWordLedgerEntry | null {
  if (!position || !Number.isInteger(position.activeWordIndex)) {
    return null;
  }
  if (position.bookSourceId && position.bookSourceId !== sourceId) {
    return null;
  }
  if (position.scopeKey && position.scopeKey !== scopeKey) {
    return null;
  }
  return (
    ledgerEntryBySourceIndex({
      expectedText,
      ledger,
      sourceWordIndex: position.activeWordIndex,
    }) ?? null
  );
}

export function ledgerEntryBySourceIndex({
  expectedText,
  ledger,
  sourceWordIndex,
  strictText = false,
}: Readonly<{
  expectedText: string;
  ledger: readonly NarrationWordLedgerEntry[];
  sourceWordIndex: number | null | undefined;
  strictText?: boolean;
}>): NarrationWordLedgerEntry | null {
  if (
    typeof sourceWordIndex !== "number" ||
    !Number.isInteger(sourceWordIndex) ||
    sourceWordIndex < 0
  ) {
    return null;
  }
  const match = ledger.find((entry) => entry.sourceWordIndex === sourceWordIndex);
  if (!match) {
    return null;
  }
  return !strictText || wordTextsCompatible(match.text, expectedText) ? match : null;
}

export function ledgerEntryByOrdinalOrText({
  expectedText,
  ledger,
  ordinal,
  strictText = false,
}: Readonly<{
  expectedText: string;
  ledger: readonly NarrationWordLedgerEntry[];
  ordinal: number | null | undefined;
  strictText?: boolean;
}>): NarrationWordLedgerEntry | null {
  if (
    typeof ordinal !== "number" ||
    !Number.isInteger(ordinal) ||
    ordinal < 0 ||
    ordinal >= ledger.length
  ) {
    return null;
  }
  const match = ledger[ordinal];
  return !strictText || wordTextsCompatible(match.text, expectedText) ? match : null;
}

export function uniqueLedgerEntryByText(
  ledger: readonly NarrationWordLedgerEntry[],
  expectedText: string,
): NarrationWordLedgerEntry | null {
  const normalizedExpected = normalizeWordIdentityText(expectedText);
  if (!normalizedExpected) {
    return null;
  }
  const matches = ledger.filter((entry) => wordTextsCompatible(entry.text, normalizedExpected));
  return matches.length === 1 ? matches[0] : null;
}

export function activeTimelineEntryAtCursor(
  entries: readonly WordTimelineEntry[],
  cursorMs: number,
  options: ReadAlongTimingLookupOptions = {},
): WordTimelineEntry | null {
  if (entries.length === 0) {
    return null;
  }
  if (options.mode === "current-or-next") {
    const timingEntries = entries.map((entry) => ({
      ...entry,
      endMs: entry.audioEndMs,
      startMs: entry.audioStartMs,
    }));
    return resolveReadAlongTimingItem(timingEntries, cursorMs, options)?.item ?? null;
  }
  const safeCursor = Math.max(0, cursorMs);
  let low = 0;
  let high = entries.length - 1;
  let closestBefore: WordTimelineEntry | null = null;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const entry = entries[mid];
    if (safeCursor < entry.audioStartMs) {
      high = mid - 1;
    } else if (safeCursor >= entry.audioEndMs) {
      closestBefore = entry;
      low = mid + 1;
    } else {
      return entry;
    }
  }
  return closestBefore ?? entries[0];
}

export function speechTokenLedgerEntryFromTimelineEntry(
  entry: WordTimelineEntry,
): SpeechTokenLedgerEntry {
  return {
    normalizedText: entry.normalizedText,
    sourceWordIds: [entry.sourceWordId],
    spokenTokenId: entry.spokenTokenId,
    text: entry.text,
    transformation: wordTextsCompatible(entry.text, entry.normalizedText) ? "normal" : "unknown",
  };
}

export function resolvedStartMs(entry: HighlightMapV2Entry): number {
  return Math.max(0, entry.alignedStartMs ?? entry.providerTimingStartMs ?? entry.audioStartMs);
}

export function resolvedEndMs(entry: HighlightMapV2Entry): number {
  return Math.max(
    resolvedStartMs(entry) + 1,
    entry.alignedEndMs ?? entry.providerTimingEndMs ?? entry.audioEndMs,
  );
}

export function v2EntryText(entry: HighlightMapV2Entry): string {
  return entry.spokenText || entry.normalizedText || entry.rawText || entry.textQuote;
}

export function v2GroupKey(entry: HighlightMapV2Entry): string | undefined {
  if (entry.fragmentIndex !== null) {
    return `fragment:${entry.fragmentIndex.toString()}`;
  }
  if (entry.sentenceIndex !== null) {
    return `sentence:${entry.sentenceIndex.toString()}`;
  }
  return entry.nodeId ? `node:${entry.nodeId}` : undefined;
}

export function sortedEntries(entries: readonly HighlightMapV2Entry[]): HighlightMapV2Entry[] {
  const copy = [...entries];
  copy.sort((left, right) => resolvedStartMs(left) - resolvedStartMs(right));
  return copy;
}

export function normalizeWordIdentityText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function wordTextsCompatible(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const normalizedLeft = normalizeWordIdentityText(left);
  const normalizedRight = normalizeWordIdentityText(right);
  if (!normalizedLeft || !normalizedRight) {
    return false;
  }
  return (
    normalizedLeft === normalizedRight ||
    normalizedLeft.split(" ").includes(normalizedRight) ||
    normalizedRight.split(" ").includes(normalizedLeft)
  );
}

export function optionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }
  return null;
}

export function safeConfidence(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, value));
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
