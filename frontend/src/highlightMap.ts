import {
  highlightMapMatchesJob as sdkHighlightMapMatchesJob,
  readingPositionForHighlightCue as sdkReadingPositionForHighlightCue,
  resolveHighlightCue as sdkResolveHighlightCue,
  secondsForReadingPosition as sdkSecondsForReadingPosition,
} from "@tts-research/sdk-ts";
import type { HighlightFragment, HighlightMap, HighlightToken, ReadingPosition } from "./types";

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
  return sdkResolveHighlightCue(map, playbackCursorSec);
}

export function readingPositionForHighlightCue(
  cue: HighlightCue | null,
): ReadingPosition | undefined {
  return sdkReadingPositionForHighlightCue(cue);
}

export function secondsForReadingPosition(
  map: HighlightMap | null | undefined,
  position: ReadingPosition | null | undefined,
): number | null {
  return sdkSecondsForReadingPosition(map, position);
}

export function highlightMapMatchesJob(
  map: HighlightMap | null,
  jobId: string | undefined,
): boolean {
  return sdkHighlightMapMatchesJob(map, jobId);
}
