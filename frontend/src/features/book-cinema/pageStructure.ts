import type {
  BookSourceScopeContent,
  BookSourceWordSpan,
  NarrationBlock,
  NarrationBlockKind,
} from "../../types";
import type { HighlightRendererToken } from "../readalong";
import { sourceWordIdForSpan } from "../readalong";
import type { BookPage } from "./model";

export interface BookPageStructuredBlock {
  endWordIndex: number;
  id: string;
  isFallback: boolean;
  kind: NarrationBlockKind | "body";
  label?: string;
  sourceBlockId?: string;
  startWordIndex: number;
  tokens: HighlightRendererToken[];
}

export function bookPageStructuredBlocks({
  blocks = [],
  page,
  scopeKey,
  scopedText,
  sourceId,
}: Readonly<{
  blocks?: readonly NarrationBlock[];
  page: BookPage | null;
  scopeKey: string;
  scopedText: string;
  sourceId: string;
}>): BookPageStructuredBlock[] {
  if (!page || page.spans.length === 0) {
    return [];
  }
  const pageSpans = page.spans;

  const offsetBase = resolveScopedTextOffsetBase(scopedText, pageSpans);
  const blockOffsetBase = resolveBlockOffsetBase(blocks, pageSpans, offsetBase);
  const coveredSpanIndexes = new Set<number>();
  const structured: BookPageStructuredBlock[] = [];
  for (const block of blocks) {
    const spans = pageSpans.filter((span) => spanOverlapsBlock(span, block, blockOffsetBase));
    if (spans.length === 0) {
      continue;
    }
    for (const span of spans) {
      coveredSpanIndexes.add(span.index);
    }
    structured.push(
      structuredBlockFromSpans({
        block,
        isFallback: false,
        offsetBase,
        page,
        scopeKey,
        scopedText,
        sourceId,
        spans,
      }),
    );
  }

  const uncovered = pageSpans.filter((span) => !coveredSpanIndexes.has(span.index));
  if (uncovered.length > 0) {
    for (const spans of contiguousSpanRuns(uncovered)) {
      structured.push(
        structuredBlockFromSpans({
          isFallback: true,
          offsetBase,
          page,
          scopeKey,
          scopedText,
          sourceId,
          spans,
        }),
      );
    }
  }

  if (structured.length === 0) {
    return [
      structuredBlockFromSpans({
        isFallback: true,
        offsetBase,
        page,
        scopeKey,
        scopedText,
        sourceId,
        spans: pageSpans,
      }),
    ];
  }

  const ordered = orderStructuredBlocks(structured);
  return splitLegacyIntroBlocks({
    blocks: ordered,
    offsetBase,
    page,
    scopeKey,
    scopedText,
    sourceId,
  });
}

export function bookPageBlocksFromScopeContent(
  scopeContent: BookSourceScopeContent | null | undefined,
): readonly NarrationBlock[] {
  return scopeContent?.blocks ?? [];
}

function structuredBlockFromSpans({
  block,
  isFallback,
  offsetBase,
  page,
  scopeKey,
  scopedText,
  sourceId,
  spans,
}: Readonly<{
  block?: NarrationBlock;
  isFallback: boolean;
  offsetBase: number;
  page: BookPage;
  scopeKey: string;
  scopedText: string;
  sourceId: string;
  spans: readonly BookSourceWordSpan[];
}>): BookPageStructuredBlock {
  const firstSpan = spans[0];
  const lastSpan = spans.at(-1) ?? firstSpan;
  const sourceBlockId = block?.id;
  return {
    endWordIndex: lastSpan.index,
    id: sourceBlockId ?? `page-${page.index.toString()}-fallback-${firstSpan.index.toString()}`,
    isFallback,
    kind: block?.kind ?? "body",
    label: block?.label,
    sourceBlockId,
    startWordIndex: firstSpan.index,
    tokens: bookPageHighlightTokens({
      blockId: sourceBlockId,
      offsetBase,
      page,
      scopeKey,
      scopedText,
      sourceId,
      spans,
    }),
  };
}

function contiguousSpanRuns(
  spans: readonly BookSourceWordSpan[],
): readonly (readonly BookSourceWordSpan[])[] {
  const runs: BookSourceWordSpan[][] = [];
  for (const span of spans) {
    const currentRun = runs.at(-1);
    const previous = currentRun?.at(-1);
    if (!currentRun || !previous || span.index !== previous.index + 1) {
      runs.push([span]);
    } else {
      currentRun.push(span);
    }
  }
  return runs;
}

function orderStructuredBlocks(
  blocks: readonly BookPageStructuredBlock[],
): BookPageStructuredBlock[] {
  const ordered: BookPageStructuredBlock[] = [];
  for (const block of blocks) {
    const insertAt = ordered.findIndex((item) => item.startWordIndex > block.startWordIndex);
    if (insertAt === -1) {
      ordered.push(block);
    } else {
      ordered.splice(insertAt, 0, block);
    }
  }
  return ordered;
}

function splitLegacyIntroBlocks({
  blocks,
  offsetBase,
  page,
  scopeKey,
  scopedText,
  sourceId,
}: Readonly<{
  blocks: readonly BookPageStructuredBlock[];
  offsetBase: number;
  page: BookPage;
  scopeKey: string;
  scopedText: string;
  sourceId: string;
}>): BookPageStructuredBlock[] {
  if (
    page.index !== 0 ||
    blocks.some((block) => block.kind === "heading" || block.kind === "subheading")
  ) {
    return [...blocks];
  }
  const firstBlock = blocks[0];
  if (
    blocks.length !== 1 ||
    firstBlock.startWordIndex !== page.startWordIndex ||
    firstBlock.endWordIndex !== page.endWordIndex
  ) {
    return [...blocks];
  }
  const split = legacyIntroSplitForSpans(page.spans);
  if (!split) {
    return [...blocks];
  }
  const [headingSpans, subheadingSpans, bodySpans] = [
    page.spans.slice(0, split.subtitleStart),
    page.spans.slice(split.subtitleStart, split.bodyStart),
    page.spans.slice(split.bodyStart),
  ];
  if (headingSpans.length === 0 || subheadingSpans.length === 0 || bodySpans.length === 0) {
    return [...blocks];
  }
  const introBlocks = [
    displayOnlyBlockFromSpans({
      id: `page-${page.index.toString()}-legacy-heading`,
      kind: "heading",
      offsetBase,
      page,
      scopeKey,
      scopedText,
      sourceId,
      spans: headingSpans,
    }),
    displayOnlyBlockFromSpans({
      id: `page-${page.index.toString()}-legacy-subheading`,
      kind: "subheading",
      offsetBase,
      page,
      scopeKey,
      scopedText,
      sourceId,
      spans: subheadingSpans,
    }),
    displayOnlyBlockFromSpans({
      id: `page-${page.index.toString()}-legacy-body`,
      kind: "body",
      offsetBase,
      page,
      scopeKey,
      scopedText,
      sourceId,
      spans: bodySpans,
    }),
  ];
  return introBlocks;
}

function displayOnlyBlockFromSpans({
  id,
  kind,
  offsetBase,
  page,
  scopeKey,
  scopedText,
  sourceId,
  spans,
}: Readonly<{
  id: string;
  kind: BookPageStructuredBlock["kind"];
  offsetBase: number;
  page: BookPage;
  scopeKey: string;
  scopedText: string;
  sourceId: string;
  spans: readonly BookSourceWordSpan[];
}>): BookPageStructuredBlock {
  const firstSpan = spans[0];
  const lastSpan = spans.at(-1) ?? firstSpan;
  return {
    endWordIndex: lastSpan.index,
    id,
    isFallback: true,
    kind,
    startWordIndex: firstSpan.index,
    tokens: bookPageHighlightTokens({
      offsetBase,
      page,
      scopeKey,
      scopedText,
      sourceId,
      spans,
    }),
  };
}

function legacyIntroSplitForSpans(
  spans: readonly BookSourceWordSpan[],
): { bodyStart: number; subtitleStart: number } | null {
  const maxTitleWords = Math.min(12, spans.length - 2);
  for (const phrase of LEGACY_INTRO_SUBTITLE_PHRASES) {
    const phraseLength = phrase.length;
    for (let index = 1; index <= maxTitleWords; index += 1) {
      if (spanWordsMatch(spans, index, phrase)) {
        const bodyStart = index + phraseLength;
        if (bodyStart < spans.length) {
          return { bodyStart, subtitleStart: index };
        }
      }
    }
  }
  return null;
}

function spanWordsMatch(
  spans: readonly BookSourceWordSpan[],
  startIndex: number,
  words: readonly string[],
): boolean {
  if (startIndex + words.length > spans.length) {
    return false;
  }
  return words.every(
    (word, offset) => normalizeIntroWord(spans[startIndex + offset]?.text ?? "") === word,
  );
}

export function bookPageHighlightTokens({
  blockId,
  offsetBase,
  page,
  scopeKey,
  scopedText,
  sourceId,
  spans,
}: Readonly<{
  blockId?: string;
  offsetBase?: number;
  page: BookPage;
  scopeKey: string;
  scopedText: string;
  sourceId: string;
  spans: readonly BookSourceWordSpan[];
}>): HighlightRendererToken[] {
  const base = offsetBase ?? resolveScopedTextOffsetBase(scopedText, spans);
  return spans.map((span, index) => {
    return {
      key: `${sourceId}-page-${page.index.toString()}-${span.index.toString()}`,
      nodeId: blockId,
      pageIndex: page.index,
      sourceId,
      sourceWordId: sourceWordIdForSpan(sourceId, scopeKey, span),
      text: spanDisplayText(scopedText, span, base),
      title: span.pageIndex ? `Source page ${span.pageIndex.toString()}` : undefined,
      tokenOffset: index,
      trailingText:
        index + 1 < spans.length
          ? spanTrailingText(scopedText, span, spans[index + 1], base)
          : undefined,
      wordIndex: span.index,
    };
  });
}

function resolveScopedTextOffsetBase(
  scopedText: string,
  spans: readonly BookSourceWordSpan[],
): number {
  if (spans.length === 0 || scopedText.length === 0) {
    return 0;
  }
  const firstSpan = spans[0];
  const candidates = uniqueNumbers([0, firstSpan.startOffset]);
  let best = candidates[0] ?? 0;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = spanMatchScore(scopedText, spans, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  if (bestScore > 0) {
    return best;
  }
  const maxEndOffset = Math.max(...spans.map((span) => span.endOffset));
  return maxEndOffset <= scopedText.length ? 0 : firstSpan.startOffset;
}

function spanMatchScore(
  scopedText: string,
  spans: readonly BookSourceWordSpan[],
  offsetBase: number,
): number {
  return spans.slice(0, 8).filter((span) => {
    const start = span.startOffset - offsetBase;
    const end = span.endOffset - offsetBase;
    if (start < 0 || end > scopedText.length || end <= start) {
      return false;
    }
    return scopedText.slice(start, end).includes(span.text);
  }).length;
}

function resolveBlockOffsetBase(
  blocks: readonly NarrationBlock[],
  spans: readonly BookSourceWordSpan[],
  scopedTextOffsetBase: number,
): number {
  if (blocks.length === 0 || spans.length === 0 || scopedTextOffsetBase === 0) {
    return 0;
  }
  const candidates = uniqueNumbers([0, scopedTextOffsetBase]);
  let best = candidates[0] ?? 0;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = blockOverlapScore(blocks, spans, candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function blockOverlapScore(
  blocks: readonly NarrationBlock[],
  spans: readonly BookSourceWordSpan[],
  blockOffsetBase: number,
): number {
  return spans
    .slice(0, 24)
    .filter((span) => blocks.some((block) => spanOverlapsBlock(span, block, blockOffsetBase)))
    .length;
}

function spanOverlapsBlock(
  span: BookSourceWordSpan,
  block: NarrationBlock,
  blockOffsetBase: number,
): boolean {
  const blockStart = block.startOffset + blockOffsetBase;
  const blockEnd = block.endOffset + blockOffsetBase;
  return span.endOffset > blockStart && span.startOffset < blockEnd;
}

function spanDisplayText(scopedText: string, span: BookSourceWordSpan, offsetBase: number): string {
  const start = span.startOffset - offsetBase;
  const end = span.endOffset - offsetBase;
  if (start >= 0 && end <= scopedText.length && end > start) {
    return scopedText.slice(start, end).trim() || span.text;
  }
  return span.text;
}

function spanTrailingText(
  scopedText: string,
  span: BookSourceWordSpan,
  nextSpan: BookSourceWordSpan,
  offsetBase: number,
): string {
  const start = span.endOffset - offsetBase;
  const end = nextSpan.startOffset - offsetBase;
  if (start >= 0 && end <= scopedText.length && end >= start) {
    const trailing = scopedText.slice(start, end);
    return trailing.length > 0 ? trailing : " ";
  }
  return " ";
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isFinite(value) && value >= 0))];
}

function normalizeIntroWord(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

const LEGACY_INTRO_SUBTITLE_PHRASES = [["executive", "summary"]] as const;
