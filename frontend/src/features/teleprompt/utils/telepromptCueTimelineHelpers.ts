interface HighlightMapV2EntryLike {
  alignedEndMs?: number | null;
  alignedStartMs?: number | null;
  audioEndMs: number;
  audioStartMs: number;
  entryId?: string | null;
  fragmentIndex?: number | null;
  level: string;
  normalizedText?: string | null;
  providerTimingEndMs?: number | null;
  providerTimingStartMs?: number | null;
  rawText?: string | null;
  sentenceIndex?: number | null;
  spokenText?: string | null;
  textQuote?: string | null;
  tokenIndex?: number | null;
}

interface RevisionBlockLike {
  estimatedDurationMs: number;
  spokenText: string;
}

interface MutableCueDraftLike {
  audioEndMs: number;
  audioStartMs: number;
  spokenText: string;
}

export function applyEstimateRange(draft: MutableCueDraftLike, startMs: number): void {
  const durationMs = safeDurationMs(draft.audioEndMs - draft.audioStartMs, draft.spokenText);
  draft.audioStartMs = startMs;
  draft.audioEndMs = startMs + durationMs;
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

export function cueTextScore(left: string, right: string): number {
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.includes(right) || right.includes(left)) {
    return Math.min(left.length, right.length) / Math.max(left.length, right.length);
  }
  const leftWords = new Set(left.split(" ").filter(Boolean));
  const rightWords = new Set(right.split(" ").filter(Boolean));
  if (leftWords.size === 0 || rightWords.size === 0) {
    return 0;
  }
  let overlap = 0;
  for (const word of leftWords) {
    if (rightWords.has(word)) {
      overlap += 1;
    }
  }
  return overlap / Math.max(leftWords.size, rightWords.size);
}

export function fallbackAt<T>(values: readonly T[], index: number): T | null {
  if (index < 0 || index >= values.length) {
    return null;
  }
  return values[index];
}

export function normalizeCueText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

export function previousEndMsFromDrafts(
  index: number,
  blocks: readonly RevisionBlockLike[],
): number {
  return blocks
    .slice(0, index)
    .reduce(
      (cursor, block) => cursor + safeDurationMs(block.estimatedDurationMs, block.spokenText),
      0,
    );
}

export function safeConfidence(value: number | null | undefined, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value ?? fallback, 0, 1);
}

export function safeDurationMs(value: number | null | undefined, text: string): number {
  if (Number.isFinite(value) && (value ?? 0) > 0) {
    return Math.max(1, Math.round(value ?? 0));
  }
  const wordCount = Math.max(1, normalizeCueText(text).split(" ").filter(Boolean).length);
  return Math.max(900, wordCount * 320);
}

export function sortedCopy<T>(values: readonly T[], compare: (left: T, right: T) => number): T[] {
  const copy = [...values];
  copy.sort(compare);
  return copy;
}

export function v2EntryKey(entry: HighlightMapV2EntryLike): string {
  return (
    entry.entryId ??
    `${entry.level}:${String(entry.fragmentIndex ?? "fragment")}:${String(entry.sentenceIndex ?? "sentence")}:${String(entry.tokenIndex ?? "token")}:${entry.audioStartMs.toString()}`
  );
}

export function v2EntryText(entry: HighlightMapV2EntryLike): string {
  return entry.spokenText ?? entry.normalizedText ?? entry.rawText ?? entry.textQuote ?? "";
}

export function compareV2EntryTime(
  left: HighlightMapV2EntryLike,
  right: HighlightMapV2EntryLike,
): number {
  return resolvedStartMs(left) - resolvedStartMs(right);
}

export function resolvedStartMs(entry: HighlightMapV2EntryLike): number {
  return Math.max(0, entry.alignedStartMs ?? entry.providerTimingStartMs ?? entry.audioStartMs);
}

export function resolvedEndMs(entry: HighlightMapV2EntryLike): number {
  return Math.max(
    resolvedStartMs(entry) + 1,
    entry.alignedEndMs ?? entry.providerTimingEndMs ?? entry.audioEndMs,
  );
}
