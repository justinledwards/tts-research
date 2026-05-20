import type {
  BookScope,
  BookSource,
  BookSourceScopeContent,
  BookSourceSectionRole,
  PlaybackProgress,
  VoiceJob,
} from "../../types";
import {
  readerLiveAnnouncement,
  type ReaderKeyboardCommand,
  type ReaderTextScale,
} from "../reader-accessibility";

export const BOOK_SOURCE_ACCEPT =
  ".pdf,.epub,.docx,.md,.markdown,.html,.htm,.zip,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/x-markdown,text/html,application/xhtml+xml,application/zip,image/png,image/jpeg,image/tiff,image/webp";
const BOOK_PAGE_MIN_WORDS = 18;
const BOOK_PAGE_MAX_WORDS = 128;
const BOOK_PAGE_DEFAULT_WORDS: Record<BookCinemaTextSize, number> = {
  compact: 116,
  comfortable: 98,
  giant: 54,
  large: 76,
};
const POLICY_NOTE_KINDS = new Set([
  "admonition",
  "caption",
  "citation",
  "code",
  "list",
  "math",
  "quote",
  "table",
]);

export {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  READER_ACCESSIBILITY_STORAGE_KEY,
  nextReaderPlaybackRate as nextBookCinemaPlaybackRate,
  normalizeReaderAccessibilitySettings,
  readerKeyboardCommandForKey as bookCinemaKeyboardCommandForKey,
  shouldIgnoreReaderKeyboardTarget as shouldIgnoreBookCinemaKeyboardTarget,
} from "../reader-accessibility";
export type { ReaderAccessibilitySettings } from "../reader-accessibility";

export interface BookCinemaPolicyNote {
  explanation: string;
  id: string;
  kind: string;
  mode: string;
  text?: string;
  title: string;
}

export type BookCinemaTextSize = ReaderTextScale;
export type BookCinemaKeyboardCommand = ReaderKeyboardCommand;

export interface BookScopeOption {
  key: string;
  label: string;
  group: BookSourceSectionRole | "pages" | "full";
  isNarratable: boolean;
  wordCount?: number;
  scope: BookScope;
}

export interface BookPage {
  endWordIndex: number;
  index: number;
  spans: NonNullable<BookSource["wordSpans"]>;
  startWordIndex: number;
}

export interface BookPaginationResult {
  activePageIndex: number;
  pages: BookPage[];
  pagesPerSpread: 1 | 2;
  spreadIndex: number;
  totalPages: number;
}

interface BookPaginationOptions {
  pagesPerSpread?: 1 | 2;
  wordsPerPage?: number;
}

export function resolveDefaultBookScope(book: BookSource): BookScope {
  return fullBookScope(book);
}

export function normalizeBookScopeForBook(book: BookSource, scope: BookScope | null): BookScope {
  if (!scope) {
    return resolveDefaultBookScope(book);
  }
  if (scope.type === "chapter") {
    const chapter = book.chapters?.find((item) => item.index === scope.chapterIndex);
    const section = book.sections?.find(
      (item) =>
        item.chapterIndex === scope.chapterIndex ||
        (item.kind !== "pages" && item.index + 1 === scope.chapterIndex),
    );
    if (!chapter && !section) {
      return resolveDefaultBookScope(book);
    }
    return {
      type: "chapter",
      chapterIndex: scope.chapterIndex,
      label:
        nonEmptyString(scope.label) ??
        nonEmptyString(chapter?.title) ??
        nonEmptyString(section?.title) ??
        `Chapter ${String(scope.chapterIndex)}`,
    };
  }
  if (scope.type === "pages") {
    const pageEnd = scope.pageEnd ?? scope.pageStart;
    const section = book.sections?.find(
      (item) =>
        (item.kind === "pages" || item.pageStart !== undefined) &&
        item.pageStart === scope.pageStart &&
        (item.pageEnd ?? item.pageStart) === pageEnd,
    );
    const pagesExist =
      (book.pages ?? []).some((page) => page.index === scope.pageStart) &&
      (book.pages ?? []).some((page) => page.index === pageEnd);
    if (!section && !pagesExist) {
      return resolveDefaultBookScope(book);
    }
    return {
      type: "pages",
      pageStart: scope.pageStart,
      pageEnd: scope.pageEnd,
      label:
        nonEmptyString(scope.label) ??
        nonEmptyString(section?.title) ??
        pageRangeLabel(scope.pageStart ?? 1, scope.pageEnd ?? scope.pageStart ?? 1),
    };
  }
  return { type: "book", label: nonEmptyString(scope.label) ?? fullSourceScopeLabel(book) };
}

export function bookScopeText(book: BookSource, scope: BookScope): string {
  if (scope.type === "chapter") {
    const chapter = book.chapters?.find((item) => item.index === scope.chapterIndex);
    if (chapter?.text) {
      return chapter.text;
    }
    if (chapter?.pageStart && chapter.pageEnd) {
      return (book.pages ?? [])
        .filter(
          (page) => page.index >= (chapter.pageStart ?? 1) && page.index <= (chapter.pageEnd ?? 1),
        )
        .map((page) => page.text ?? "")
        .join("\n\n");
    }
    return "";
  }
  if (scope.type === "pages") {
    const start = scope.pageStart ?? 1;
    const end = scope.pageEnd ?? start;
    return (book.pages ?? [])
      .filter((page) => page.index >= start && page.index <= end)
      .map((page) => page.text ?? "")
      .join("\n\n");
  }
  return book.text ?? "";
}

export function bookScopeSpans(
  book: BookSource,
  scope: BookScope,
): NonNullable<BookSource["wordSpans"]> {
  const spans = book.wordSpans ?? [];
  if (scope.type === "chapter") {
    return spans.filter((span) => span.chapter === scope.chapterIndex);
  }
  if (scope.type === "pages") {
    const start = scope.pageStart ?? 1;
    const end = scope.pageEnd ?? start;
    return spans.filter((span) => (span.pageIndex ?? 0) >= start && (span.pageIndex ?? 0) <= end);
  }
  return spans;
}

export function bookScopeOptions(book: BookSource): BookScopeOption[] {
  const fullOption = fullBookScopeOption(book);
  const sections = book.sections ?? [];
  if (sections.length > 0) {
    const sectionOptions = sections.map((section) => ({
      key: bookScopeKey(scopeFromBookSection(section)),
      label: section.title,
      group: section.role,
      isNarratable: section.isNarratable,
      wordCount: section.wordCount,
      scope: scopeFromBookSection(section),
    }));
    return [fullOption, ...sectionOptions];
  }
  const chapters = book.chapters ?? [];
  const pages = book.pages ?? [];
  if (book.kind === "epub" && chapters.length > 0) {
    return [
      fullOption,
      ...chapters.map(
        (chapter): BookScopeOption => ({
          key: `chapter:${String(chapter.index)}`,
          label: nonEmptyString(chapter.title) ?? `Chapter ${String(chapter.index)}`,
          group: chapter.role ?? "body",
          isNarratable: chapter.isNarratable ?? true,
          wordCount: chapter.wordCount,
          scope: {
            type: "chapter",
            chapterIndex: chapter.index,
            label: nonEmptyString(chapter.title) ?? `Chapter ${String(chapter.index)}`,
          },
        }),
      ),
    ];
  }
  if (book.kind === "pdf" && pages.length > 0) {
    const options: BookScopeOption[] = [];
    for (let index = 1; index <= pages.length; index += 2) {
      const end = Math.min(index + 1, pages.length);
      options.push({
        key: `pages:${String(index)}-${String(end)}`,
        label: pageRangeLabel(index, end),
        group: "pages",
        isNarratable: true,
        wordCount: pages.slice(index - 1, end).reduce((total, page) => total + page.wordCount, 0),
        scope: { type: "pages", pageStart: index, pageEnd: end, label: pageRangeLabel(index, end) },
      });
    }
    return [fullOption, ...options];
  }
  return [fullOption];
}

export function bookScopeKey(scope: BookScope): string {
  if (scope.type === "chapter") {
    return `chapter:${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    return `pages:${String(scope.pageStart ?? 1)}-${String(scope.pageEnd ?? scope.pageStart ?? 1)}`;
  }
  return "book";
}

export function bookScopeLabel(scope: BookScope): string {
  if (scope.label && scope.label.trim().length > 0) {
    return scope.label;
  }
  if (scope.type === "chapter") {
    return `Chapter ${String(scope.chapterIndex ?? 1)}`;
  }
  if (scope.type === "pages") {
    return pageRangeLabel(scope.pageStart ?? 1, scope.pageEnd ?? scope.pageStart ?? 1);
  }
  return "Full book";
}

export function bookCinemaLiveAnnouncement({
  activeWordIndex = -1,
  book,
  fragmentIndex,
  scope,
}: Readonly<{
  activeWordIndex?: number;
  book: BookSource;
  fragmentIndex?: number;
  scope: BookScope;
}>): string {
  return readerLiveAnnouncement({
    activeWordIndex,
    fragmentIndex: fragmentIndex !== undefined && fragmentIndex >= 0 ? fragmentIndex : undefined,
    scopeLabel: bookScopeLabel(scope),
    surfaceTitle: bookSourceName(book),
  });
}

export function bookCinemaPolicyNotes(
  scopeContent: BookSourceScopeContent | null | undefined,
): BookCinemaPolicyNote[] {
  const notes: BookCinemaPolicyNote[] = [];
  const seen = new Set<string>();
  for (const block of scopeContent?.blocks ?? []) {
    const explanation = block.speechPolicy.explanation.trim();
    const mode = block.speechPolicy.mode;
    const shouldInclude =
      explanation.length > 0 &&
      (mode !== "speak" ||
        block.speakMode !== "speak" ||
        POLICY_NOTE_KINDS.has(block.kind) ||
        Boolean(block.speechPolicy.elementMode));
    if (!shouldInclude) {
      continue;
    }
    const note = {
      explanation,
      id: `block:${block.id}`,
      kind: block.kind,
      mode,
      text: compactBookPolicyText(block.spokenText ?? block.text),
      title: block.label ?? formatPolicyKindLabel(block.kind),
    };
    const key = `${note.kind}:${note.mode}:${note.explanation}:${note.text ?? ""}`;
    if (!seen.has(key)) {
      notes.push(note);
      seen.add(key);
    }
  }
  for (const item of scopeContent?.skippedItems ?? []) {
    const explanation = item.reason.trim();
    if (!explanation) {
      continue;
    }
    const note = {
      explanation,
      id: `skipped:${item.id}`,
      kind: item.kind,
      mode: "skip",
      text: compactBookPolicyText(item.text),
      title: formatPolicyKindLabel(item.kind),
    };
    const key = `${note.kind}:${note.mode}:${note.explanation}:${note.text ?? ""}`;
    if (!seen.has(key)) {
      notes.push(note);
      seen.add(key);
    }
  }
  return notes;
}

export function resolveBookActiveWordIndex(
  book: BookSource,
  job: VoiceJob | null,
  playbackCursorSec: number,
  scope: BookScope | null = null,
  scopeContent: BookSourceScopeContent | null = null,
): number {
  const normalizedScope = normalizeBookScopeForBook(book, scope);
  const spans = scopeContent?.wordSpans ?? bookScopeSpans(book, normalizedScope);
  if (spans.length === 0 || !job || job.durationMs <= 0 || playbackCursorSec <= 0) {
    return -1;
  }
  if (job.bookSourceId && job.bookSourceId !== book.id) {
    return -1;
  }
  const scopedText = (scopeContent?.text ?? bookScopeText(book, normalizedScope)).trim();
  const jobText = job.inputText.trim();
  if (scopedText.length > 0 && jobText.length > 0 && scopedText !== jobText) {
    return -1;
  }
  const progress = Math.min(0.999, Math.max(0, playbackCursorSec / (job.durationMs / 1000)));
  return (
    spans[Math.min(spans.length - 1, Math.max(0, Math.floor(progress * spans.length)))]?.index ?? -1
  );
}

export function resolveDisplayedBookActiveWordIndex(
  activeWordIndex: number,
  progress: PlaybackProgress | null,
): number {
  return activeWordIndex >= 0 ? activeWordIndex : (progress?.activeWordIndex ?? -1);
}

export function visibleBookSpans(
  spans: BookSource["wordSpans"],
  activeWordIndex: number,
  maxWords = 220,
): NonNullable<BookSource["wordSpans"]> {
  const sourceSpans = spans ?? [];
  if (sourceSpans.length <= maxWords) {
    return sourceSpans;
  }
  if (activeWordIndex < 0) {
    return sourceSpans.slice(0, maxWords);
  }
  const activeOffset = Math.max(
    0,
    sourceSpans.findIndex((span) => span.index === activeWordIndex),
  );
  const start = Math.max(0, activeOffset - Math.floor(maxWords * 0.4));
  return sourceSpans.slice(start, Math.min(sourceSpans.length, start + maxWords));
}

export function paginateBookSpans(
  spans: NonNullable<BookSource["wordSpans"]>,
  activeWordIndex: number,
  options: BookPaginationOptions = {},
): BookPaginationResult {
  const wordsPerPage = clampNumber(
    options.wordsPerPage ?? BOOK_PAGE_DEFAULT_WORDS.large,
    BOOK_PAGE_MIN_WORDS,
    BOOK_PAGE_MAX_WORDS,
  );
  const pagesPerSpread = options.pagesPerSpread ?? 2;
  if (spans.length === 0) {
    return {
      activePageIndex: 0,
      pages: [],
      pagesPerSpread,
      spreadIndex: 0,
      totalPages: 0,
    };
  }

  const pages: BookPage[] = [];
  for (let start = 0; start < spans.length; start += wordsPerPage) {
    const pageSpans = spans.slice(start, start + wordsPerPage);
    const firstSpan = pageSpans[0];
    const lastSpan = pageSpans.at(-1) ?? firstSpan;
    pages.push({
      endWordIndex: lastSpan.index,
      index: pages.length,
      spans: pageSpans,
      startWordIndex: firstSpan.index,
    });
  }

  const activeOffset = spans.findIndex((span) => span.index === activeWordIndex);
  const activePageIndex = activeOffset === -1 ? 0 : Math.floor(activeOffset / wordsPerPage);
  const spreadIndex = Math.floor(activePageIndex / pagesPerSpread);
  const firstPageIndex = spreadIndex * pagesPerSpread;

  return {
    activePageIndex,
    pages: pages.slice(firstPageIndex, firstPageIndex + pagesPerSpread),
    pagesPerSpread,
    spreadIndex,
    totalPages: pages.length,
  };
}

export function bookSourceName(book: BookSource): string {
  return nonEmptyString(book.title) ?? book.sourceFile;
}

export function isSupportedBookSource(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return isBookSourceExtension(extension);
}

export function isSupportedBookSourceBatch(files: File[]): boolean {
  if (files.length === 0) {
    return false;
  }
  if (files.length === 1) {
    return isSupportedBookSource(files[0]);
  }
  return files.every((file) => isImageBookSource(file));
}

function compactBookPolicyText(value: string | undefined): string | undefined {
  const clean = value?.replaceAll(/\s+/g, " ").trim() ?? "";
  if (!clean) {
    return undefined;
  }
  return clean.length > 160 ? `${clean.slice(0, 157)}...` : clean;
}

function formatPolicyKindLabel(value: string): string {
  if (value === "math") {
    return "Math";
  }
  const spaced = value.replaceAll(/([A-Z])/g, " $1");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function fullSourceScopeLabel(book: BookSource): string {
  return book.kind === "epub" ? "Full book" : "Full document";
}

function fullBookScope(book: BookSource): BookScope {
  return { type: "book", label: fullSourceScopeLabel(book) };
}

function fullBookScopeOption(book: BookSource): BookScopeOption {
  const scope = fullBookScope(book);
  return {
    key: bookScopeKey(scope),
    label: bookScopeLabel(scope),
    group: "full",
    isNarratable: true,
    wordCount: book.wordCount,
    scope,
  };
}

function scopeFromBookSection(section: NonNullable<BookSource["sections"]>[number]): BookScope {
  if (section.kind === "pages" || (section.pageStart && section.pageEnd && !section.chapterIndex)) {
    return {
      type: "pages",
      pageStart: section.pageStart ?? 1,
      pageEnd: section.pageEnd ?? section.pageStart ?? 1,
      label: section.title,
    };
  }
  return {
    type: "chapter",
    chapterIndex: section.chapterIndex ?? section.index + 1,
    label: section.title,
  };
}

function pageRangeLabel(start: number, end: number): string {
  return start === end ? `Page ${String(start)}` : `Pages ${String(start)}-${String(end)}`;
}

function isImageBookSource(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"].includes(extension);
}

function isBookSourceExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
    "docx",
    "md",
    "markdown",
    "html",
    "htm",
    "zip",
    "png",
    "jpg",
    "jpeg",
    "tif",
    "tiff",
    "bmp",
    "webp",
  ].includes(extension);
}
