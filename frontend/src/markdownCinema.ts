import type { NarrationBlock, PreparedSource } from "./types";

function narrationBlockIsSpeakable(block: NarrationBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  const policyMode = block.speechPolicy.mode.trim().toLowerCase();
  return speakMode !== "skip" && policyMode !== "skip" && policyMode !== "ondemand";
}

export interface PreparedSourceActiveWord {
  blockEndOffset: number;
  blockId: string;
  blockStartOffset: number;
  wordOffset: number;
}

export function markdownBlockText(block: NarrationBlock): string {
  return block.text ?? block.spokenText ?? "";
}

export function narrationWordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function resolvePreparedSourceActiveBlockId(
  source: PreparedSource,
  activeWordIndex: number,
): string | null {
  return resolvePreparedSourceActiveWord(source, activeWordIndex)?.blockId ?? null;
}

export function resolvePreparedSourceActiveWord(
  source: PreparedSource,
  activeWordIndex: number,
): PreparedSourceActiveWord | null {
  if (activeWordIndex < 0) {
    return null;
  }

  let wordCursor = 0;
  let lastSpeakableBlock: PreparedSourceActiveWord | null = null;

  for (const block of source.blocks ?? []) {
    if (!narrationBlockIsSpeakable(block)) {
      continue;
    }

    const wordCount = narrationWordCount(block.spokenText ?? block.text ?? "");
    if (wordCount === 0) {
      continue;
    }

    lastSpeakableBlock = {
      blockEndOffset: block.endOffset,
      blockId: block.id,
      blockStartOffset: block.startOffset,
      wordOffset: Math.max(0, wordCount - 1),
    };
    const blockStart = wordCursor;
    const blockEnd = wordCursor + wordCount - 1;
    if (activeWordIndex >= blockStart && activeWordIndex <= blockEnd) {
      return {
        blockEndOffset: block.endOffset,
        blockId: block.id,
        blockStartOffset: block.startOffset,
        wordOffset: activeWordIndex - blockStart,
      };
    }
    wordCursor += wordCount;
  }

  return lastSpeakableBlock;
}
