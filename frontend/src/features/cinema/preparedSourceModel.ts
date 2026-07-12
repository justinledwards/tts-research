import type { NarrationBlock, PreparedSource, VoiceJob } from "../../types";
import { markdownBlockText, resolvePreparedSourceActiveWord } from "../../markdownCinema";
import type { ReaderTextScale } from "../reader-accessibility";

export type PreparedSourceCinemaTextSize = ReaderTextScale;

export interface PreparedSourceCinemaMetrics {
  blockCount: number;
  citationSkipCount: number;
  segmentCount: number;
  skippedCount: number;
  spokenBlockCount: number;
  wordCount: number;
}

export interface PreparedSourceCinemaOutlineItem {
  blockId: string;
  id: string;
  index: number;
  label: string;
  level: number;
}

export interface PreparedSourceCinemaSkippedGroup {
  count: number;
  key: string;
  label: string;
}

export function preparedSourceCinemaTitle(source: PreparedSource): string {
  return firstNonEmptyPreparedSourceValue(source.title, source.sourceName, "Prepared source");
}

export function preparedSourceCinemaLabel(source: PreparedSource): string {
  const kind = preparedSourceCinemaKind(source);
  if (kind === "website") {
    return "Website Cinema";
  }
  if (kind === "document") {
    return "Document Cinema";
  }
  return "Source Cinema";
}

export function preparedSourceCinemaActionLabel(source: PreparedSource): string {
  const kind = preparedSourceCinemaKind(source);
  if (kind === "website") {
    return "Open Website Cinema";
  }
  if (kind === "document") {
    return "Open Document Cinema";
  }
  return "Open Source Cinema";
}

export type PreparedSourceCinemaKind = "document" | "source" | "website";

export function preparedSourceCinemaKind(source: PreparedSource): PreparedSourceCinemaKind {
  if (source.kind === "url") {
    return "website";
  }
  if (isPreparedSourceMarkdownDocument(source) || source.kind === "file") {
    return "document";
  }
  return "source";
}

export function isPreparedSourceMarkdownDocument(source: PreparedSource): boolean {
  const haystack = [
    source.renderMode,
    source.sourceFormat,
    source.sourceContentType,
    source.sourceName,
    source.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return (
    source.renderMode === "markdown" ||
    source.sourceFormat === "markdown" ||
    haystack.includes("markdown") ||
    /\.md(?:\b|$)/.test(haystack) ||
    /\.markdown(?:\b|$)/.test(haystack)
  );
}

export function preparedSourceCinemaSourceHref(source: PreparedSource): string | null {
  const sourceUrl = firstNonEmptyPreparedSourceValue(source.sourceUrl, source.sourceName);
  if (/^https?:\/\//i.test(sourceUrl)) {
    return sourceUrl;
  }
  return null;
}

export function preparedSourceCinemaDomain(source: PreparedSource): string {
  const href = preparedSourceCinemaSourceHref(source);
  if (!href) {
    return firstNonEmptyPreparedSourceValue(
      source.sourceContentType,
      source.sourceFormat,
      source.kind.toUpperCase(),
    );
  }
  try {
    return new URL(href).hostname.replace(/^www\./i, "");
  } catch {
    return href;
  }
}

export function preparedSourceCinemaMetrics(source: PreparedSource): PreparedSourceCinemaMetrics {
  return {
    blockCount: source.blockCount,
    citationSkipCount: source.summary.citationSkipCount,
    segmentCount: source.segmentCount,
    skippedCount: source.skippedItems?.length ?? 0,
    spokenBlockCount: source.summary.spokenBlockCount,
    wordCount: source.wordCount,
  };
}

export function preparedSourceCinemaSkippedGroups(
  source: PreparedSource,
): PreparedSourceCinemaSkippedGroup[] {
  const counts = new Map<string, PreparedSourceCinemaSkippedGroup>();

  const ensure = (key: string, label: string) => {
    const existing = counts.get(key);
    if (existing) {
      return existing;
    }
    const group = { count: 0, key, label };
    counts.set(key, group);
    return group;
  };

  for (const item of source.skippedItems ?? []) {
    const group = ensureSkippedGroup(item.kind, item.reason, item.text, ensure);
    group.count += 1;
  }

  if ((source.skippedItems?.length ?? 0) === 0 && source.summary.skippedBlockCount > 0) {
    ensure("other", "Other boilerplate").count = source.summary.skippedBlockCount;
  }
  if (source.summary.citationSkipCount > 0) {
    const related = ensure("related", "Related / Citations");
    related.count = Math.max(related.count, source.summary.citationSkipCount);
  }

  const groups = [...counts.values()];
  const order = ["nav", "ads", "related", "comments", "other"];
  return order.flatMap((key) => {
    const group = groups.find((item) => item.key === key);
    return group ? [group] : [];
  });
}

export function preparedSourceCinemaOutline(
  source: PreparedSource,
): PreparedSourceCinemaOutlineItem[] {
  const blocks =
    preparedSourceCinemaKind(source) === "website"
      ? preparedSourceCinemaPrimaryBlocks(source)
      : (source.blocks ?? []);
  const outline = blocks
    .filter((block) => block.kind === "heading" || block.kind === "subheading")
    .map((block, index) => ({
      blockId: block.id,
      id: `${source.id}:outline:${block.id}`,
      index,
      label: markdownBlockText(block).trim(),
      level: block.kind === "subheading" ? 2 : 1,
    }))
    .filter((item) => item.label.length > 0);

  if (outline.length > 0) {
    return outline;
  }

  return parseMarkdownOutline(source.id, source.text ?? "");
}

export function preparedSourceCinemaPrimaryBlocks(source: PreparedSource): NarrationBlock[] {
  const blocks = source.blocks ?? [];
  if (blocks.length > 0) {
    const readableBlocks = blocks.filter((block) => markdownBlockText(block).trim().length > 0);
    if (preparedSourceCinemaKind(source) === "website") {
      return focusWebsiteCinemaBlocks(readableBlocks, source);
    }
    return readableBlocks;
  }
  const text = firstNonEmptyPreparedSourceValue(source.text, source.speechText);
  if (!text) {
    return [];
  }
  return [
    {
      endOffset: text.length,
      id: `${source.id}:text`,
      index: 0,
      kind: "body",
      segments: [],
      speakMode: "speak",
      speechPolicy: {
        explanation: "",
        mode: "speak",
        profile: source.speechPolicyProfile,
      },
      spokenText: source.speechText ?? text,
      startOffset: 0,
      text,
    },
  ];
}

export function preparedSourceCinemaActiveBlock(
  source: PreparedSource,
  activeWordIndex: number,
): NarrationBlock | null {
  const primaryBlocks = preparedSourceCinemaPrimaryBlocks(source);
  const primaryBlockIds = new Set(primaryBlocks.map((block) => block.id));
  const activeWord = resolvePreparedSourceActiveWord(source, activeWordIndex);
  if (activeWord) {
    const activeBlock = source.blocks?.find((block) => block.id === activeWord.blockId) ?? null;
    if (activeBlock && primaryBlockIds.has(activeBlock.id)) {
      return activeBlock;
    }
  }
  return primaryBlocks.find((block) => preparedSourceNarrationBlockIsSpeakable(block)) ?? null;
}

export function preparedSourceNarrationBlockIsSpeakable(block: NarrationBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  const policyMode = block.speechPolicy.mode.trim().toLowerCase();
  return (
    speakMode !== "skip" &&
    policyMode !== "skip" &&
    policyMode !== "ondemand" &&
    (block.spokenText ?? "").trim().length > 0
  );
}

export function preparedSourceCinemaJobMatchesSource(
  job: VoiceJob | null,
  source: PreparedSource | null,
): boolean {
  if (!job || !source) {
    return false;
  }
  if (job.preparedSourceId) {
    return job.preparedSourceId === source.id;
  }
  const sourceSpeech = normalizeComparablePreparedSourceText(source.speechText ?? "");
  if (!sourceSpeech) {
    return false;
  }
  return [job.inputText, job.optimizedText].some(
    (value) => normalizeComparablePreparedSourceText(value) === sourceSpeech,
  );
}

export function preparedSourceCinemaPlaybackStatusLabel(
  isPlaybackActive: boolean,
  job: VoiceJob | null,
): string {
  if (isPlaybackActive) {
    return "Playing";
  }
  if (!job) {
    return "Source ready";
  }
  if (job.status === "completed") {
    return "Ready";
  }
  if (job.status === "synthesizing" || job.status === "optimizing" || job.status === "checking") {
    return "Working";
  }
  return job.status;
}

export function normalizeComparablePreparedSourceText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

function firstNonEmptyPreparedSourceValue(...values: (string | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function focusWebsiteCinemaBlocks(
  blocks: NarrationBlock[],
  source: PreparedSource,
): NarrationBlock[] {
  if (blocks.length === 0) {
    return blocks;
  }
  const articleStart = findWebsiteArticleStart(blocks, source);
  const focused = blocks
    .slice(articleStart)
    .filter((block) => !isWebsiteChromeBlockText(markdownBlockText(block)));
  return focused.length > 0 ? focused : blocks;
}

function findWebsiteArticleStart(blocks: NarrationBlock[], source: PreparedSource): number {
  const titleTokens = meaningfulTokens(preparedSourceCinemaTitle(source));
  const strongTitleThreshold = Math.min(5, Math.max(3, titleTokens.size - 1));
  const titleMatchIndex = blocks.findIndex((block) => {
    const text = markdownBlockText(block);
    if (isWebsiteChromeBlockText(text)) {
      return false;
    }
    const tokenMatches = sharedTokenCount(titleTokens, meaningfulTokens(text));
    return tokenMatches >= strongTitleThreshold;
  });
  if (titleMatchIndex !== -1) {
    return titleMatchIndex;
  }

  const headingIndex = blocks.findIndex((block) => {
    const text = markdownBlockText(block);
    return (
      (block.kind === "heading" || block.kind === "subheading") &&
      countTextWords(text) >= 5 &&
      !isWebsiteChromeBlockText(text)
    );
  });
  if (headingIndex !== -1) {
    return headingIndex;
  }

  const bodyIndex = blocks.findIndex((block) => {
    const text = markdownBlockText(block);
    return countTextWords(text) >= 18 && !isWebsiteChromeBlockText(text);
  });
  return Math.max(bodyIndex, 0);
}

function meaningfulTokens(value: string): Set<string> {
  const stopWords = new Set([
    "a",
    "an",
    "and",
    "are",
    "for",
    "from",
    "have",
    "into",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
  ]);
  return new Set(
    value
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3 && !stopWords.has(token)),
  );
}

function sharedTokenCount(left: Set<string>, right: Set<string>): number {
  let count = 0;
  for (const token of left) {
    if (right.has(token)) {
      count += 1;
    }
  }
  return count;
}

function countTextWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function isWebsiteChromeBlockText(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return true;
  }
  const normalized = text.toLowerCase().replaceAll(/\s+/g, " ");
  if (
    /^(features|skip to content|menu|subscribe|donate|search|open search|facebook|instagram|bluesky|categories|tags)$/i.test(
      normalized,
    )
  ) {
    return true;
  }
  if (/^(opinion|state power|movement media alliance|explainers)$/.test(normalized)) {
    return true;
  }
  if (/^(facebook|instagram|bluesky|x|twitter)\b/.test(normalized) && countTextWords(text) <= 4) {
    return true;
  }
  if (/open dropdown menu|search for: search|justice requires the full story/.test(normalized)) {
    return true;
  }
  return countTextWords(text) <= 2 && /^(home|news|about|contact|privacy|terms)$/.test(normalized);
}

function ensureSkippedGroup(
  kind: string,
  reason: string,
  text: string,
  ensure: (key: string, label: string) => PreparedSourceCinemaSkippedGroup,
): PreparedSourceCinemaSkippedGroup {
  const haystack = `${kind} ${reason} ${text}`.toLowerCase();
  if (/ad|promo|sponsor/.test(haystack)) {
    return ensure("ads", "Ads / Promotions");
  }
  if (
    kind === "citation" ||
    kind === "footnote" ||
    kind === "reference" ||
    kind === "artifact_token" ||
    kind === "unknown_inline_marker" ||
    /related|trend|citation|footnote|reference|artifact/.test(haystack)
  ) {
    return ensure("related", "Related / Citations");
  }
  if (haystack.includes("comment")) {
    return ensure("comments", "Comments");
  }
  if (kind === "embedded" || /nav|menu|header|footer/.test(haystack)) {
    return ensure("nav", "Nav / Menus");
  }
  return ensure("other", "Other boilerplate");
}

function parseMarkdownOutline(
  sourceId: string,
  markdown: string,
): PreparedSourceCinemaOutlineItem[] {
  return markdown
    .split(/\r?\n/)
    .map((line, lineIndex) => {
      const trimmed = line.trim();
      let level = 0;
      while (trimmed.charAt(level) === "#") {
        level += 1;
      }
      if (level < 1 || level > 3 || trimmed.charAt(level) !== " ") {
        return null;
      }
      const label = trimmed.slice(level).trim();
      if (label === "") {
        return null;
      }
      return {
        blockId: `${sourceId}:heading:${lineIndex.toString()}`,
        id: `${sourceId}:outline:${lineIndex.toString()}`,
        index: lineIndex,
        label,
        level,
      };
    })
    .filter((item): item is PreparedSourceCinemaOutlineItem => Boolean(item?.label));
}
