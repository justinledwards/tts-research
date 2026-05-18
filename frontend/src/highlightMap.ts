import type { HighlightFragment, HighlightMap, HighlightToken, ReadingPosition } from "./types";
import type { ContentIRLocator } from "./content-ir";

export interface HighlightCue {
  activeWordIndex: number;
  fragment?: HighlightFragment;
  fragmentIndex?: number;
  mode: "word" | "phrase";
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readingPosition?: ReadingPosition;
  token?: HighlightToken;
  tokenIndex?: number;
}

export function resolveHighlightCue(
  map: HighlightMap | null | undefined,
  playbackCursorSec: number,
): HighlightCue | null {
  if (!map) {
    return null;
  }
  const ms = Math.max(0, Math.round(playbackCursorSec * 1000));
  const fragment = findTimingAt(map.fragments, ms) ?? map.fragments.at(-1);
  if (!fragment) {
    return null;
  }
  const tokensInFragment = map.tokens.filter((token) => token.fragmentIndex === fragment.index);
  const token = findTimingAt(tokensInFragment, ms) ?? tokensInFragment.at(-1);
  const mode = map.mode === "word" && token ? "word" : "phrase";
  const readingPosition =
    mode === "word"
      ? (token?.readingPosition ?? fragment.readingPosition)
      : fragment.readingPosition;
  const activeWordIndex =
    readingPosition?.activeWordIndex ??
    token?.readingPosition?.activeWordIndex ??
    fragment.readingPosition?.activeWordIndex ??
    0;
  const phraseWordStart = fragment.readingPosition?.activeWordIndex ?? activeWordIndex;
  const phraseWordEnd =
    tokensInFragment.length > 0
      ? (tokensInFragment.at(-1)?.readingPosition?.activeWordIndex ?? phraseWordStart)
      : phraseWordStart;
  return {
    activeWordIndex,
    fragment,
    fragmentIndex: fragment.index,
    mode,
    phraseWordEnd,
    phraseWordStart,
    readingPosition,
    token,
    tokenIndex: token?.index,
  };
}

export function readingPositionForHighlightCue(
  cue: HighlightCue | null,
): ReadingPosition | undefined {
  return cue?.readingPosition;
}

export function secondsForReadingPosition(
  map: HighlightMap | null | undefined,
  position: ReadingPosition | null | undefined,
): number | null {
  if (!map || !position) {
    return null;
  }
  const byLocator = findTokenByLocator(
    map.tokens,
    position.locator ?? position.locatorEnvelope?.locator,
  );
  if (byLocator) {
    return byLocator.startMs / 1000;
  }
  if (position.activeWordIndex !== undefined) {
    const token = map.tokens.find(
      (item) => item.readingPosition?.activeWordIndex === position.activeWordIndex,
    );
    if (token) {
      return token.startMs / 1000;
    }
    const fragment = map.fragments.find(
      (item) => item.readingPosition?.activeWordIndex === position.activeWordIndex,
    );
    if (fragment) {
      return fragment.startMs / 1000;
    }
  }
  return null;
}

export function highlightMapMatchesJob(
  map: HighlightMap | null,
  jobId: string | undefined,
): boolean {
  return Boolean(map?.jobId && jobId && map.jobId === jobId);
}

function findTimingAt<T extends { endMs: number; startMs: number }>(
  items: T[],
  ms: number,
): T | undefined {
  return items.find((item) => ms >= item.startMs && ms <= item.endMs);
}

function findTokenByLocator(
  tokens: HighlightToken[],
  locator: ContentIRLocator | undefined,
): HighlightToken | undefined {
  if (!locator) {
    return undefined;
  }
  return tokens.find((token) => contentIRLocatorsMatch(token.readingPosition?.locator, locator));
}

function contentIRLocatorsMatch(
  left: ContentIRLocator | undefined,
  right: ContentIRLocator | undefined,
): boolean {
  if (!left?.type || !right?.type || left.type !== right.type) {
    return false;
  }
  if (left.epub || right.epub) {
    return left.epub?.href === right.epub?.href && left.epub?.fragment === right.epub?.fragment;
  }
  if (left.html || right.html) {
    return left.html?.href === right.html?.href && left.html?.fragment === right.html?.fragment;
  }
  if (left.pdf || right.pdf) {
    return left.pdf?.pageIndex === right.pdf?.pageIndex;
  }
  if (left.ocr || right.ocr) {
    return left.ocr?.pageIndex === right.ocr?.pageIndex;
  }
  if (left.docx || right.docx) {
    return left.docx?.paragraphIndex === right.docx?.paragraphIndex;
  }
  if (left.markdown || right.markdown) {
    return (
      left.markdown?.path === right.markdown?.path &&
      left.markdown?.lineStart === right.markdown?.lineStart
    );
  }
  return false;
}
