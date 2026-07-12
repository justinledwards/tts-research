import type { BookSourceWordSpan } from "../../types";
import type { HighlightCue } from "../../highlightMap";
import type { HighlightMapV2Entry } from "../readalong";

export function resolveCueActiveWordIndex(
  cue: HighlightCue,
  scopedSpans: readonly BookSourceWordSpan[],
): number | undefined {
  const expectedText =
    cue.token?.text ?? cue.token?.readingPosition?.textQuote ?? cue.readingPosition?.textQuote;
  const exactCandidates = uniqueNumbers([
    cue.token?.readingPosition?.activeWordIndex,
    cue.readingPosition?.activeWordIndex,
    cue.activeWordIndex,
  ]);
  for (const candidate of exactCandidates) {
    const span = spanBySourceWordIndex(scopedSpans, candidate, expectedText);
    if (span) {
      return span.index;
    }
  }
  const ordinalCandidates = uniqueNumbers([
    cue.tokenIndex,
    cue.token?.readingPosition?.activeWordIndex,
    cue.readingPosition?.activeWordIndex,
    cue.activeWordIndex,
  ]);
  for (const candidate of ordinalCandidates) {
    const span = spanByScopedOrdinal(scopedSpans, candidate, expectedText);
    if (span) {
      return span.index;
    }
  }
  for (const candidate of exactCandidates) {
    const span = spanBySourceWordIndex(scopedSpans, candidate);
    if (span) {
      return span.index;
    }
  }
  for (const candidate of ordinalCandidates) {
    const span = spanByScopedOrdinal(scopedSpans, candidate);
    if (span) {
      return span.index;
    }
  }
  return undefined;
}

export function resolveCueBoundaryWordIndex(
  candidate: number | null | undefined,
  scopedSpans: readonly BookSourceWordSpan[],
  boundary: "end" | "start",
): number | undefined {
  if (candidate === null || candidate === undefined || !Number.isInteger(candidate)) {
    return undefined;
  }
  const exact = spanBySourceWordIndex(scopedSpans, candidate);
  if (exact) {
    return exact.index;
  }
  const ordinal = spanByScopedOrdinal(scopedSpans, candidate);
  if (ordinal) {
    return ordinal.index;
  }
  if (scopedSpans.length === 0) {
    return undefined;
  }
  return boundary === "start" ? scopedSpans[0]?.index : scopedSpans.at(-1)?.index;
}

export function v2PhraseWordIndexes({
  activeEntry,
  anchorEntry,
  scopedSpans,
  wordEntries,
}: Readonly<{
  activeEntry: HighlightMapV2Entry;
  anchorEntry: HighlightMapV2Entry | null;
  scopedSpans: readonly BookSourceWordSpan[];
  wordEntries: readonly HighlightMapV2Entry[];
}>): number[] {
  const candidates =
    anchorEntry || activeEntry.level === "word"
      ? wordEntries.filter((entry) => v2EntriesShareCue(entry, anchorEntry ?? activeEntry))
      : [];
  const sourceIndexes = candidates
    .map((entry) => resolveV2EntrySourceWordIndex(entry, scopedSpans))
    .filter(isNonNegativeInteger);
  if (sourceIndexes.length > 0) {
    return sourceIndexes;
  }
  return [resolveV2EntrySourceWordIndex(activeEntry, scopedSpans)].filter(isNonNegativeInteger);
}

export function estimateV2AnchorEntryActiveWordIndex({
  cursorMs,
  entry,
  scopedSpans,
}: Readonly<{
  cursorMs: number;
  entry: HighlightMapV2Entry;
  scopedSpans: readonly BookSourceWordSpan[];
}>): number | undefined {
  const indexes = estimateV2AnchorEntryWordIndexes({ entry, scopedSpans });
  if (indexes.length === 0) {
    return undefined;
  }
  const durationMs = Math.max(1, v2EntryEndMs(entry) - v2EntryStartMs(entry));
  const progress = Math.max(0, Math.min(1, (cursorMs - v2EntryStartMs(entry)) / durationMs));
  const activeOffset = Math.min(indexes.length - 1, Math.floor(progress * indexes.length));
  return indexes[activeOffset];
}

export function estimateV2AnchorEntryWordIndexes({
  entry,
  scopedSpans,
}: Readonly<{
  entry: HighlightMapV2Entry;
  scopedSpans: readonly BookSourceWordSpan[];
}>): number[] {
  if (scopedSpans.length === 0) {
    return [];
  }
  const startWordIndex = resolveV2EntrySourceWordIndex(entry, scopedSpans);
  const startOffset = scopedSpans.findIndex((span) => span.index === startWordIndex);
  if (startOffset === -1) {
    return [];
  }
  const remainingSpans = scopedSpans.slice(startOffset);
  const spokenWordCount = tokenizeV2EntryWords(v2EntrySpokenWordText(entry)).length;
  const phraseWordCount = Math.max(
    1,
    Math.min(remainingSpans.length, spokenWordCount || remainingSpans.length),
  );
  return remainingSpans.slice(0, phraseWordCount).map((span) => span.index);
}

export function resolveV2EntrySourceWordIndex(
  entry: HighlightMapV2Entry,
  scopedSpans: readonly BookSourceWordSpan[],
): number | undefined {
  const expectedText = v2EntryExpectedText(entry);
  const sourceIndexCandidate = entry.readingPosition?.activeWordIndex ?? entry.sourceWordIndex;
  const readingPositionSpan = spanBySourceWordIndexForV2(scopedSpans, sourceIndexCandidate, entry);
  if (readingPositionSpan) {
    return readingPositionSpan.index;
  }
  const tokenCandidates = uniqueNumbers([entry.tokenIndex]);
  for (const candidate of tokenCandidates) {
    const span = spanByScopedOrdinalForV2(scopedSpans, candidate, entry, expectedText);
    if (span) {
      return span.index;
    }
  }
  for (const candidate of tokenCandidates) {
    const span = spanBySourceWordIndexForV2(scopedSpans, candidate, entry, expectedText);
    if (span) {
      return span.index;
    }
  }
  const uniqueLocatedTextSpan = uniqueSpanForV2Entry(scopedSpans, entry, expectedText);
  if (uniqueLocatedTextSpan) {
    return uniqueLocatedTextSpan.index;
  }
  for (const candidate of uniqueNumbers([
    sourceIndexCandidate,
    entry.sourceWordIndex,
    entry.tokenIndex,
  ])) {
    const exact = spanBySourceWordIndex(scopedSpans, candidate, expectedText);
    if (exact) {
      return exact.index;
    }
    const ordinal = spanByScopedOrdinal(scopedSpans, candidate, expectedText);
    if (ordinal) {
      return ordinal.index;
    }
  }
  return undefined;
}

export function sortedV2Entries(entries: readonly HighlightMapV2Entry[]): HighlightMapV2Entry[] {
  // eslint-disable-next-line unicorn/no-array-sort -- toSorted is not available in this TS lib.
  return [...entries].sort((left, right) => v2EntryStartMs(left) - v2EntryStartMs(right));
}

export function v2EntryAtCursor(
  entries: readonly HighlightMapV2Entry[],
  cursorMs: number,
): HighlightMapV2Entry | null {
  if (entries.length === 0) {
    return null;
  }
  const active = entries.find(
    (entry) => cursorMs >= v2EntryStartMs(entry) && cursorMs <= v2EntryEndMs(entry),
  );
  if (active) {
    return active;
  }
  return (
    // eslint-disable-next-line unicorn/no-array-reverse -- toReversed is not available in this TS lib.
    [...entries].reverse().find((entry) => v2EntryStartMs(entry) <= cursorMs) ??
    entries.find((entry) => v2EntryStartMs(entry) > cursorMs) ??
    null
  );
}

export function v2AnchorEntryForWord(
  anchorEntries: readonly HighlightMapV2Entry[],
  wordEntry: HighlightMapV2Entry | null,
  cursorMs: number,
): HighlightMapV2Entry | null {
  if (!wordEntry) {
    return null;
  }
  return (
    anchorEntries.find((entry) => v2EntriesShareCue(wordEntry, entry)) ??
    anchorEntries.find(
      (entry) => cursorMs >= v2EntryStartMs(entry) && cursorMs <= v2EntryEndMs(entry),
    ) ??
    null
  );
}

export function spanBySourceWordIndex(
  spans: readonly BookSourceWordSpan[],
  wordIndex: number,
  expectedText?: string,
): BookSourceWordSpan | undefined {
  if (!Number.isInteger(wordIndex) || wordIndex < 0) {
    return undefined;
  }
  const span = spans.find((item) => item.index === wordIndex);
  if (!span || !spanMatchesCueText(span, expectedText)) {
    return undefined;
  }
  return span;
}

export function spanByScopedOrdinal(
  spans: readonly BookSourceWordSpan[],
  ordinal: number,
  expectedText?: string,
): BookSourceWordSpan | undefined {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= spans.length) {
    return undefined;
  }
  const span = spans[ordinal];
  if (!spanMatchesCueText(span, expectedText)) {
    return undefined;
  }
  return span;
}

export function v2EntriesShareCue(left: HighlightMapV2Entry, right: HighlightMapV2Entry): boolean {
  if (left.fragmentIndex !== null && right.fragmentIndex !== null) {
    return left.fragmentIndex === right.fragmentIndex;
  }
  if (left.sentenceIndex !== null && right.sentenceIndex !== null) {
    return left.sentenceIndex === right.sentenceIndex;
  }
  if (left.nodeId && right.nodeId && left.nodeId === right.nodeId) {
    return true;
  }
  const rightStart = v2EntryStartMs(right);
  const rightEnd = v2EntryEndMs(right);
  return v2EntryStartMs(left) >= rightStart && v2EntryEndMs(left) <= rightEnd;
}

export function spanBySourceWordIndexForV2(
  spans: readonly BookSourceWordSpan[],
  wordIndex: number | null | undefined,
  entry: HighlightMapV2Entry,
  expectedText = v2EntryExpectedText(entry),
): BookSourceWordSpan | undefined {
  const span = spanBySourceWordIndex(spans, wordIndex ?? -1, expectedText);
  return span && spanMatchesV2Locator(span, entry) ? span : undefined;
}

export function spanByScopedOrdinalForV2(
  spans: readonly BookSourceWordSpan[],
  ordinal: number | null | undefined,
  entry: HighlightMapV2Entry,
  expectedText = v2EntryExpectedText(entry),
): BookSourceWordSpan | undefined {
  const span = spanByScopedOrdinal(spans, ordinal ?? -1, expectedText);
  return span && spanMatchesV2Locator(span, entry) ? span : undefined;
}

export function uniqueSpanForV2Entry(
  spans: readonly BookSourceWordSpan[],
  entry: HighlightMapV2Entry,
  expectedText: string,
): BookSourceWordSpan | undefined {
  const matches = spans.filter(
    (span) => spanMatchesCueText(span, expectedText) && spanMatchesV2Locator(span, entry),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

export function spanMatchesCueText(span: BookSourceWordSpan, expectedText?: string): boolean {
  const expected = normalizeCueTextForWordMatch(expectedText);
  if (!expected) {
    return true;
  }
  const spanText = normalizeCueTextForWordMatch(span.text);
  if (!spanText) {
    return false;
  }
  return expected === spanText || expected.split(" ").includes(spanText);
}

function normalizeCueTextForWordMatch(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function uniqueNumbers(values: readonly (number | null | undefined)[]): number[] {
  return [...new Set(values.filter(isNonNegativeInteger))];
}

function isNonNegativeInteger(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function v2EntryExpectedText(entry: HighlightMapV2Entry): string {
  return (
    nonEmptyString(entry.readingPosition?.textQuote) ??
    nonEmptyString(entry.spokenText) ??
    nonEmptyString(entry.normalizedText) ??
    nonEmptyString(entry.rawText) ??
    entry.textQuote
  );
}

function v2EntrySpokenWordText(entry: HighlightMapV2Entry): string {
  return (
    nonEmptyString(entry.spokenText) ??
    nonEmptyString(entry.normalizedText) ??
    nonEmptyString(entry.rawText) ??
    nonEmptyString(entry.textQuote) ??
    nonEmptyString(entry.readingPosition?.textQuote) ??
    ""
  );
}

function tokenizeV2EntryWords(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function v2EntryStartMs(entry: HighlightMapV2Entry): number {
  return Math.max(0, entry.alignedStartMs ?? entry.providerTimingStartMs ?? entry.audioStartMs);
}

function v2EntryEndMs(entry: HighlightMapV2Entry): number {
  return Math.max(
    v2EntryStartMs(entry) + 1,
    entry.alignedEndMs ?? entry.providerTimingEndMs ?? entry.audioEndMs,
  );
}

function spanMatchesV2Locator(span: BookSourceWordSpan, entry: HighlightMapV2Entry): boolean {
  const locator = entry.readingPosition?.locator ?? entry.sourceLocator;
  if (locator.pdf && span.pageIndex !== undefined) {
    return span.pageIndex === locator.pdf.pageIndex;
  }
  if (locator.ocr && span.pageIndex !== undefined) {
    return span.pageIndex === locator.ocr.pageIndex;
  }
  const htmlFragment = locator.html?.fragment ?? locator.epub?.fragment;
  if (htmlFragment && span.chapter !== undefined) {
    const chapterMatch = /chapter-(\d+)/i.exec(htmlFragment);
    return !chapterMatch || Number(chapterMatch[1]) === span.chapter;
  }
  return true;
}
