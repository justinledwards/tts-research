export type ReadAlongTimingLookupMode = "strict" | "current-or-next";

export interface ReadAlongTimingLookupOptions {
  lookAheadMs?: number;
  maxNextLeadMs?: number;
  mode?: ReadAlongTimingLookupMode;
}

export interface ReadAlongTimingLookupResult<T> {
  item: T;
  itemIndex: number;
  lookAheadMs: number;
  relation: "current" | "next" | "previous";
  strictItem: T | null;
  strictItemIndex: number | null;
}

export interface ReadAlongTimingRangeLike {
  endMs: number;
  startMs: number;
}

export const READ_ALONG_DEFAULT_LOOKAHEAD_MS = 80;

export const READ_ALONG_DISPLAY_LOOKUP: ReadAlongTimingLookupOptions = {
  lookAheadMs: READ_ALONG_DEFAULT_LOOKAHEAD_MS,
  maxNextLeadMs: READ_ALONG_DEFAULT_LOOKAHEAD_MS,
  mode: "current-or-next",
};

export function resolveReadAlongTimingItem<T extends ReadAlongTimingRangeLike>(
  items: readonly T[],
  cursorMs: number,
  options: ReadAlongTimingLookupOptions = {},
): ReadAlongTimingLookupResult<T> | null {
  if (items.length === 0) {
    return null;
  }
  const normalized = normalizeReadAlongTimingLookupOptions(options);
  const safeCursorMs = Math.max(0, cursorMs);
  const currentIndex = currentTimingIndex(items, safeCursorMs);
  const strictItem = currentIndex === -1 ? null : (items.at(currentIndex) ?? null);

  if (normalized.mode === "strict") {
    return strictItem
      ? timingResult({
          item: strictItem,
          itemIndex: currentIndex,
          lookAheadMs: normalized.lookAheadMs,
          relation: "current",
          strictItem,
          strictItemIndex: currentIndex,
        })
      : null;
  }

  if (currentIndex !== -1 && strictItem) {
    return timingResult({
      item: strictItem,
      itemIndex: currentIndex,
      lookAheadMs: normalized.lookAheadMs,
      relation: "current",
      strictItem,
      strictItemIndex: currentIndex,
    });
  }

  return resolveGapTimingItem(items, safeCursorMs, normalized);
}

export function normalizeReadAlongTimingLookupOptions(
  options: ReadAlongTimingLookupOptions = {},
): Required<ReadAlongTimingLookupOptions> {
  const lookAheadMs = normalizeTimingLead(options.lookAheadMs, READ_ALONG_DEFAULT_LOOKAHEAD_MS);
  return {
    lookAheadMs,
    maxNextLeadMs: normalizeTimingLead(options.maxNextLeadMs, lookAheadMs),
    mode: options.mode ?? "strict",
  };
}

function resolveGapTimingItem<T extends ReadAlongTimingRangeLike>(
  items: readonly T[],
  cursorMs: number,
  options: Required<ReadAlongTimingLookupOptions>,
): ReadAlongTimingLookupResult<T> | null {
  const previousIndex = previousTimingIndex(items, cursorMs);
  const nextIndex = nextTimingIndex(items, cursorMs);

  if (nextIndex !== null) {
    const nextItem = items.at(nextIndex);
    if (
      nextItem &&
      shouldLeadToNext(nextItem, cursorMs, options.maxNextLeadMs) &&
      (previousIndex === null || nextIndex === previousIndex + 1)
    ) {
      return timingResult({
        item: nextItem,
        itemIndex: nextIndex,
        lookAheadMs: options.lookAheadMs,
        relation: "next",
        strictItem: null,
        strictItemIndex: null,
      });
    }
  }

  if (previousIndex !== null) {
    const previousItem = items.at(previousIndex);
    if (previousItem) {
      return timingResult({
        item: previousItem,
        itemIndex: previousIndex,
        lookAheadMs: options.lookAheadMs,
        relation: "previous",
        strictItem: null,
        strictItemIndex: null,
      });
    }
  }

  return null;
}

function timingResult<T>({
  item,
  itemIndex,
  lookAheadMs,
  relation,
  strictItem,
  strictItemIndex,
}: ReadAlongTimingLookupResult<T>): ReadAlongTimingLookupResult<T> {
  return { item, itemIndex, lookAheadMs, relation, strictItem, strictItemIndex };
}

function currentTimingIndex(items: readonly ReadAlongTimingRangeLike[], cursorMs: number): number {
  return items.findIndex((item) => cursorMs >= item.startMs && cursorMs < item.endMs);
}

function previousTimingIndex(
  items: readonly ReadAlongTimingRangeLike[],
  cursorMs: number,
): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items.at(index);
    if (item && item.startMs <= cursorMs) {
      return index;
    }
  }
  return null;
}

function nextTimingIndex(
  items: readonly ReadAlongTimingRangeLike[],
  cursorMs: number,
): number | null {
  const index = items.findIndex((item) => item.startMs > cursorMs);
  return index === -1 ? null : index;
}

function shouldLeadToNext(
  item: ReadAlongTimingRangeLike,
  cursorMs: number,
  maxNextLeadMs: number,
): boolean {
  const leadMs = item.startMs - cursorMs;
  return leadMs >= 0 && leadMs <= maxNextLeadMs;
}

function normalizeTimingLead(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(500, Math.round(value)));
}
