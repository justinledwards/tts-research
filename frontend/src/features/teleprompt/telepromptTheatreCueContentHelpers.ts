import { createElement, type ElementType, type ReactElement } from "react";
import type { RevisionBlock } from "../revision";
import { splitHighlightText, type HighlightRendererToken } from "../readalong";
import type { TelepromptCueSyncMode } from "./telepromptCueTimeline";

export interface TelepromptTheatreCueParagraph {
  id: string;
  text: string;
}

export interface TelepromptTheatreCueSection {
  id: string;
  kind: ReturnType<typeof telepromptTheatreCuePresentationKind>;
  text: string;
}

export interface TelepromptTheatreRenderedCueSection extends TelepromptTheatreCueSection {
  endWordIndex: number;
  startWordIndex: number;
  tokens: HighlightRendererToken[];
}

export interface TelepromptTheatreCrawlRow {
  height: number;
  top: number;
}

export interface TelepromptTheatreCrawlOffsetInput {
  activeCenterY: number;
  contentHeight: number;
  currentOffsetPx: number;
  reducedMotion: boolean;
  viewportHeight: number;
}

export function telepromptTheatreRenderedCueSections(
  sections: readonly TelepromptTheatreCueSection[],
  sourceWordIdByCueIndex: ReadonlyMap<number, string> = new Map(),
): TelepromptTheatreRenderedCueSection[] {
  let wordCursor = 0;
  return sections.map((section) => {
    const startWordIndex = wordCursor;
    const tokens = splitHighlightText(section.text, { nodeId: section.id }).map((token) => ({
      ...token,
      key: `${section.id}:${token.key ?? telepromptTheatreTokenKey(token)}`,
      sourceWordId: sourceWordIdByCueIndex.get(token.wordIndex + startWordIndex),
      tokenOffset: token.wordIndex,
      wordIndex: token.wordIndex + startWordIndex,
    }));
    wordCursor += tokens.length;
    return {
      ...section,
      endWordIndex: wordCursor > startWordIndex ? wordCursor - 1 : startWordIndex,
      startWordIndex,
      tokens,
    };
  });
}

export function telepromptTheatreCueSections({
  activeBlock,
  blockKind,
  previewBlocks = [],
  text,
}: Readonly<{
  activeBlock?: RevisionBlock | null;
  blockKind?: string | null;
  previewBlocks?: readonly RevisionBlock[];
  text: string;
}>): TelepromptTheatreCueSection[] {
  const blockSections = telepromptTheatreCueSectionsFromBlocks({
    activeBlock,
    previewBlocks,
    text,
  });
  if (blockSections.length > 0) {
    return blockSections;
  }
  const introSections = telepromptTheatreLegacyIntroSections(text);
  if (introSections.length > 0) {
    return introSections;
  }
  const fallbackKind = telepromptTheatreCuePresentationKind(blockKind);
  return telepromptTheatreCueParagraphs(text).map((paragraph) => ({
    id: paragraph.id,
    kind: fallbackKind,
    text: paragraph.text,
  }));
}

function telepromptTheatreCueSectionsFromBlocks({
  activeBlock,
  previewBlocks,
  text,
}: Readonly<{
  activeBlock?: RevisionBlock | null;
  previewBlocks: readonly RevisionBlock[];
  text: string;
}>): TelepromptTheatreCueSection[] {
  const cueText = text.trim();
  if (!cueText || !activeBlock) {
    return [];
  }
  const sourceBlocks = [activeBlock, ...previewBlocks].filter((block) =>
    isCueSectionCandidate(block),
  );
  if (sourceBlocks.length < 2) {
    return [];
  }
  const sections: TelepromptTheatreCueSection[] = [];
  let remaining = cueText;
  for (const block of sourceBlocks) {
    const consumed = consumeCueSectionPrefix(remaining, block.spokenText || block.text);
    if (!consumed) {
      break;
    }
    sections.push({
      id: `block:${block.id}`,
      kind: telepromptTheatreCuePresentationKind(block.kind),
      text: consumed.text,
    });
    remaining = consumed.remaining;
    if (!remaining) {
      break;
    }
  }
  const hasHierarchy = sections.some(
    (section) => section.kind === "heading" || section.kind === "subheading",
  );
  if (!hasHierarchy || sections.length < 2) {
    return [];
  }
  if (remaining) {
    sections.push({
      id: "cue:remaining-body",
      kind: "body",
      text: remaining,
    });
  }
  return sections;
}

function isCueSectionCandidate(block: RevisionBlock): boolean {
  const text = (block.spokenText || block.text).trim();
  return text.length > 0;
}

function consumeCueSectionPrefix(
  text: string,
  candidateText: string,
): { remaining: string; text: string } | null {
  const candidate = candidateText.trim();
  if (!candidate) {
    return null;
  }
  const source = text.trimStart();
  if (source.startsWith(candidate)) {
    return {
      remaining: source.slice(candidate.length).trimStart(),
      text: source.slice(0, candidate.length).trim(),
    };
  }
  const sourceNormalized = normalizeCueComparisonText(source);
  const candidateNormalized = normalizeCueComparisonText(candidate);
  if (!candidateNormalized || !sourceNormalized.startsWith(candidateNormalized)) {
    return null;
  }
  const prefixEnd = approximateCuePrefixEnd(source, candidate);
  if (prefixEnd <= 0) {
    return null;
  }
  return {
    remaining: source.slice(prefixEnd).trimStart(),
    text: source.slice(0, prefixEnd).trim(),
  };
}

function approximateCuePrefixEnd(text: string, candidateText: string): number {
  const candidateWordCount = cueWords(candidateText).length;
  if (candidateWordCount === 0) {
    return 0;
  }
  const matches = [...text.matchAll(/\S+/g)];
  const lastMatch = matches[candidateWordCount - 1];
  return lastMatch.index + lastMatch[0].length;
}

export function telepromptTheatreLegacyIntroSections(text: string): TelepromptTheatreCueSection[] {
  const matches = [...text.matchAll(/\S+/g)];
  if (matches.length < 4) {
    return [];
  }
  const words = matches.map((match) => normalizeCueIntroWord(match[0]));
  const maxTitleWords = Math.min(12, matches.length - 2);
  for (const phrase of TELEPROMPT_THEATRE_INTRO_SUBTITLE_PHRASES) {
    for (let index = 1; index <= maxTitleWords; index += 1) {
      if (!cueIntroPhraseMatches(words, index, phrase)) {
        continue;
      }
      const bodyStartWord = index + phrase.length;
      if (bodyStartWord >= matches.length) {
        continue;
      }
      const subtitleStart = matches[index]?.index ?? 0;
      const bodyStart = matches[bodyStartWord]?.index ?? 0;
      const heading = text.slice(0, subtitleStart).trim();
      const subheading = text.slice(subtitleStart, bodyStart).trim();
      const body = text.slice(bodyStart).trim();
      if (!heading || !subheading || !body) {
        continue;
      }
      return [
        { id: "legacy-intro-heading", kind: "heading", text: heading },
        { id: "legacy-intro-subheading", kind: "subheading", text: subheading },
        { id: "legacy-intro-body", kind: "body", text: body },
      ];
    }
  }
  return [];
}

function cueIntroPhraseMatches(
  words: readonly string[],
  startIndex: number,
  phrase: readonly string[],
): boolean {
  if (startIndex + phrase.length > words.length) {
    return false;
  }
  return phrase.every((word, offset) => words[startIndex + offset] === word);
}

function cueWords(value: string): readonly string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function normalizeCueComparisonText(value: string): string {
  return cueWords(value)
    .map((word) => normalizeCueIntroWord(word))
    .join(" ");
}

function normalizeCueIntroWord(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/g, "");
}

function telepromptTheatreTokenKey(token: HighlightRendererToken): string {
  return `${token.wordIndex.toString()}:${token.text}`;
}

const TELEPROMPT_THEATRE_INTRO_SUBTITLE_PHRASES = [["executive", "summary"]] as const;

export function telepromptTheatreCueParagraphs(text: string): TelepromptTheatreCueParagraph[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, index) => ({
      id: `${index.toString()}:${paragraph.slice(0, 24)}`,
      text: paragraph,
    }));
}

export function telepromptTheatreCuePresentationKind(
  kind: string | null | undefined,
): "body" | "code" | "heading" | "quote" | "subheading" | "table" {
  if (kind === "heading") {
    return "heading";
  }
  if (kind === "subheading") {
    return "subheading";
  }
  if (kind === "quote") {
    return "quote";
  }
  if (kind === "code") {
    return "code";
  }
  if (kind === "table") {
    return "table";
  }
  return "body";
}

export function telepromptTheatreCueElement(
  kind: ReturnType<typeof telepromptTheatreCuePresentationKind>,
): ElementType {
  if (kind === "heading") {
    return "h1";
  }
  if (kind === "subheading") {
    return "h2";
  }
  if (kind === "quote") {
    return "blockquote";
  }
  return "p";
}

export function telepromptTheatreCueSectionKindAttribute(
  sections: readonly TelepromptTheatreCueSection[],
): string {
  return [...new Set(sections.map((section) => section.kind))].join(" ");
}

export function telepromptTheatreCueKindClassName(
  kind: ReturnType<typeof telepromptTheatreCuePresentationKind>,
): string {
  if (kind === "heading") {
    return "teleprompt-theatre-cue--heading font-bold text-white";
  }
  if (kind === "subheading") {
    return "teleprompt-theatre-cue--subheading font-semibold text-zinc-100";
  }
  if (kind === "quote") {
    return "teleprompt-theatre-cue--quote border-l-4 border-orange-300/70 pl-6 text-left font-semibold italic text-zinc-100";
  }
  if (kind === "code" || kind === "table") {
    return "teleprompt-theatre-cue--technical rounded-md border border-white/15 bg-white/5 p-5 font-medium text-zinc-100";
  }
  return "teleprompt-theatre-cue--body font-semibold text-white";
}

export function telepromptTheatreCrawlOffset({
  activeCenterY,
  contentHeight,
  currentOffsetPx,
  reducedMotion,
  viewportHeight,
}: TelepromptTheatreCrawlOffsetInput): number {
  if (
    reducedMotion ||
    !Number.isFinite(activeCenterY) ||
    !Number.isFinite(contentHeight) ||
    !Number.isFinite(currentOffsetPx) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return 0;
  }
  const focusY = viewportHeight * 0.44;
  const margin = Math.max(24, viewportHeight * 0.12);
  const minOffset = Math.min(0, viewportHeight - contentHeight - margin);
  const maxOffset = Math.max(0, viewportHeight * 0.18);
  return clampNumber(currentOffsetPx + focusY - activeCenterY, minOffset, maxOffset);
}

export function telepromptTheatreCrawlRowKey(row: TelepromptTheatreCrawlRow): string {
  return `${Math.round(row.top).toString()}:${Math.round(row.height).toString()}`;
}

export function telepromptTheatreCueSyncTone(mode: TelepromptCueSyncMode): "info" | "neutral" {
  return mode === "manual" ? "neutral" : "info";
}

export function telepromptTheatreWordLabel(currentWordIndex: number | null): string {
  if (currentWordIndex === null || currentWordIndex < 0) {
    return "Phrase cue";
  }
  return `Word ${(currentWordIndex + 1).toString()}`;
}

export function CuePreviewList({ blocks }: Readonly<{ blocks: RevisionBlock[] }>): ReactElement {
  if (blocks.length === 0) {
    return createElement(
      "div",
      null,
      createElement(
        "p",
        { className: "text-xs font-semibold uppercase text-zinc-400" },
        "Next cue",
      ),
      createElement("p", { className: "mt-1 text-sm text-zinc-200" }, "Final cue."),
    );
  }
  return createElement(
    "div",
    { className: "grid gap-2" },
    createElement("p", { className: "text-xs font-semibold uppercase text-zinc-400" }, "Next cue"),
    ...blocks.map((block) =>
      createElement(
        "p",
        { className: "line-clamp-2 text-sm text-zinc-200", key: block.id },
        block.spokenText,
      ),
    ),
  );
}

export function OperatorFact({
  label,
  value,
}: Readonly<{ label: string; value: string }>): ReactElement {
  return createElement(
    "div",
    { className: "flex items-center justify-between gap-3" },
    createElement("dt", { className: "text-orange-200" }, label),
    createElement("dd", { className: "text-right font-semibold text-white" }, value),
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
