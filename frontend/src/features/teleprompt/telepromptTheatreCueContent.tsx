import { useEffect, useMemo, useRef, useState, type CSSProperties, type ElementType } from "react";
import type { RevisionBlock } from "../revision";
import { cx } from "../../design";
import {
  buildTelepromptWordCuesFromIndex,
  type TeleprompterHighlightSettings,
  type TeleprompterToken,
} from "../../teleprompter";
import { HighlightRenderer, splitHighlightText, type HighlightRendererToken } from "../readalong";
import type { TelepromptCueSyncMode, TelepromptCueWordTiming } from "./telepromptCueTimeline";

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

export function TelepromptTheatreCueText({
  activeBlock,
  blockKind,
  currentSourceWordId,
  currentWordIndex,
  fallbackText,
  highlightSettings,
  mirrorMode,
  previewBlocks = [],
  text,
  textClassName,
  widthClassName,
  wordTimings = [],
  wordSpacing,
}: Readonly<{
  activeBlock?: RevisionBlock | null;
  blockKind?: string | null;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  fallbackText: string;
  highlightSettings: TeleprompterHighlightSettings;
  mirrorMode: boolean;
  previewBlocks?: readonly RevisionBlock[];
  text: string;
  textClassName: string;
  widthClassName: string;
  wordTimings?: readonly TelepromptCueWordTiming[];
  wordSpacing?: string;
}>) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastCueIdentityRef = useRef<string | null>(null);
  const lastCrawlRowKeyRef = useRef<string | null>(null);
  const [crawlOffsetPx, setCrawlOffsetPx] = useState(0);
  const prefersReducedMotion = usePrefersReducedMotion();
  const displayText = text.trim() || fallbackText;
  const sections = useMemo(
    () =>
      telepromptTheatreCueSections({
        activeBlock,
        blockKind,
        previewBlocks,
        text: displayText,
      }),
    [activeBlock, blockKind, displayText, previewBlocks],
  );
  const sourceWordIdByCueIndex = useMemo(() => {
    const values = new Map<number, string>();
    for (const timing of wordTimings) {
      if (timing.sourceWordId) {
        values.set(timing.wordIndex, timing.sourceWordId);
      }
    }
    return values;
  }, [wordTimings]);
  const renderedSections = useMemo(
    () => telepromptTheatreRenderedCueSections(sections, sourceWordIdByCueIndex),
    [sections, sourceWordIdByCueIndex],
  );
  const cueIdentity = sections.map((section) => `${section.id}:${section.text}`).join("|");
  const wordCueTokens = useMemo<TeleprompterToken[]>(
    () =>
      renderedSections.flatMap((section) =>
        section.tokens.map((token) => ({
          kind: "word" as const,
          text: token.text,
          wordIndex: token.wordIndex,
        })),
      ),
    [renderedSections],
  );
  const wordCues = useMemo(
    () =>
      typeof currentWordIndex === "number" && currentWordIndex >= 0
        ? buildTelepromptWordCuesFromIndex(wordCueTokens, currentWordIndex, highlightSettings)
        : [],
    [currentWordIndex, highlightSettings, wordCueTokens],
  );
  const cueByIndex = useMemo(
    () => new Map(wordCues.map((cue) => [cue.wordIndex, cue])),
    [wordCues],
  );
  const style: CSSProperties = {
    transform: telepromptTheatreCueTransform({
      mirrorMode,
      translateYPx: crawlOffsetPx,
    }),
    transition: prefersReducedMotion ? "none" : "transform 360ms ease-out",
    wordSpacing,
  };

  useEffect(() => {
    if (lastCueIdentityRef.current !== cueIdentity) {
      lastCueIdentityRef.current = cueIdentity;
      lastCrawlRowKeyRef.current = null;
      setCrawlOffsetPx(0);
    }
  }, [cueIdentity]);

  useEffect(() => {
    if (prefersReducedMotion || currentWordIndex === null || currentWordIndex === undefined) {
      lastCrawlRowKeyRef.current = null;
      setCrawlOffsetPx(0);
      return;
    }
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const activeWord = content?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!viewport || !content || !activeWord) {
      return;
    }
    const row = telepromptTheatreActiveRow(activeWord);
    if (!row) {
      return;
    }
    const rowKey = `${cueIdentity}:${telepromptTheatreCrawlRowKey(row)}`;
    if (lastCrawlRowKeyRef.current === rowKey) {
      return;
    }
    lastCrawlRowKeyRef.current = rowKey;
    setCrawlOffsetPx((currentOffsetPx) =>
      telepromptTheatreCrawlOffset({
        activeCenterY: row.top + row.height / 2 + currentOffsetPx,
        contentHeight: content.scrollHeight,
        currentOffsetPx,
        reducedMotion: prefersReducedMotion,
        viewportHeight: viewport.clientHeight,
      }),
    );
  }, [cueIdentity, currentWordIndex, prefersReducedMotion]);

  if (sections.length === 1 && (sections[0].kind === "code" || sections[0].kind === "table")) {
    const section = sections[0];
    return (
      <pre
        className={cx(
          "mx-auto whitespace-pre-wrap text-left font-mono",
          widthClassName,
          telepromptTheatreCueKindClassName(section.kind),
          textClassName,
        )}
        data-teleprompt-theatre-cue-kind={section.kind}
        style={{ transform: mirrorMode ? "scaleX(-1)" : undefined, wordSpacing }}
      >
        {section.text}
      </pre>
    );
  }

  return (
    <div
      className="teleprompt-theatre-crawl-viewport grid h-full min-h-0 w-full place-items-center overflow-hidden"
      data-teleprompt-theatre-crawl-motion={prefersReducedMotion ? "reduced" : "cinematic"}
      data-teleprompt-theatre-cue-kind={telepromptTheatreCueSectionKindAttribute(sections)}
      ref={viewportRef}
    >
      <div
        className={cx("mx-auto grid gap-6 text-center", widthClassName, textClassName)}
        data-teleprompt-theatre-crawl-content=""
        ref={contentRef}
        style={style}
      >
        {renderedSections.map((section) => {
          const CueElement = telepromptTheatreCueElement(section.kind);
          return (
            <CueElement
              className={cx(
                "whitespace-pre-wrap",
                telepromptTheatreCueKindClassName(section.kind),
                sections.length > 1 && section.kind === "body" && "font-medium",
              )}
              data-teleprompt-theatre-section-kind={section.kind}
              key={section.id}
            >
              <HighlightRenderer
                activeSourceWordId={currentSourceWordId}
                activeWordIndex={currentWordIndex}
                classNameForWord={({ token }) => {
                  const cue = cueByIndex.get(token.wordIndex);
                  return cx(
                    "teleprompter-word rounded px-1 py-0.5",
                    `teleprompter-word--${cue?.state ?? "idle"}`,
                    cue?.state === "active" && "teleprompt-theatre-word--active",
                  );
                }}
                dataEffect={highlightSettings.effectStyle}
                mode="word"
                surface="teleprompt"
                tokens={section.tokens}
                wordStyle={({ token }) => {
                  const cue = cueByIndex.get(token.wordIndex);
                  return {
                    "--teleprompter-accent": "#f97316",
                    "--teleprompter-intensity": String(cue?.intensity ?? 0),
                  } as CSSProperties;
                }}
              />
            </CueElement>
          );
        })}
      </div>
    </div>
  );
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

function telepromptTheatreTokenKey(token: HighlightRendererToken): string {
  return `${token.wordIndex.toString()}:${token.text}`;
}

export interface TelepromptTheatreCrawlOffsetInput {
  activeCenterY: number;
  contentHeight: number;
  currentOffsetPx: number;
  reducedMotion: boolean;
  viewportHeight: number;
}

export interface TelepromptTheatreCrawlRow {
  height: number;
  top: number;
}

export function telepromptTheatreCrawlRowKey(row: TelepromptTheatreCrawlRow): string {
  return `${Math.round(row.top).toString()}:${Math.round(row.height).toString()}`;
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

function telepromptTheatreActiveRow(activeWord: HTMLElement): TelepromptTheatreCrawlRow | null {
  const top = activeWord.offsetTop;
  const height = activeWord.offsetHeight || activeWord.getBoundingClientRect().height;
  if (!Number.isFinite(top) || !Number.isFinite(height) || height <= 0) {
    return null;
  }
  return { height, top };
}

function telepromptTheatreCueTransform({
  mirrorMode,
  translateYPx,
}: Readonly<{ mirrorMode: boolean; translateYPx: number }>): string {
  const translate = `translateY(${Math.round(translateYPx).toString()}px)`;
  return mirrorMode ? `scaleX(-1) ${translate}` : translate;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  useEffect(() => {
    const matchMedia = (globalThis as typeof globalThis & { matchMedia?: Window["matchMedia"] })
      .matchMedia;
    if (typeof matchMedia !== "function") {
      return;
    }
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setPrefersReducedMotion(media.matches);
    };
    update();
    media.addEventListener("change", update);
    return () => {
      media.removeEventListener("change", update);
    };
  }, []);
  return prefersReducedMotion;
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

function telepromptTheatreLegacyIntroSections(text: string): TelepromptTheatreCueSection[] {
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

function telepromptTheatreCueElement(
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

function telepromptTheatreCueSectionKindAttribute(
  sections: readonly TelepromptTheatreCueSection[],
): string {
  return [...new Set(sections.map((section) => section.kind))].join(" ");
}

function telepromptTheatreCueKindClassName(
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

export function CuePreviewList({ blocks }: Readonly<{ blocks: RevisionBlock[] }>) {
  if (blocks.length === 0) {
    return (
      <div>
        <p className="text-xs font-semibold uppercase text-zinc-400">Next cue</p>
        <p className="mt-1 text-sm text-zinc-200">Final cue.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase text-zinc-400">Next cue</p>
      {blocks.map((block) => (
        <p className="line-clamp-2 text-sm text-zinc-200" key={block.id}>
          {block.spokenText}
        </p>
      ))}
    </div>
  );
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

export function OperatorFact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-orange-200">{label}</dt>
      <dd className="text-right font-semibold text-white">{value}</dd>
    </div>
  );
}
