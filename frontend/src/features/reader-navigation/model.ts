import type { BookScope, PlaybackProgress, ProgressBookmark, ReadingPosition } from "../../types";
import { formatContentIRLocator } from "../../locatorCodecs";

export type ReaderNavigationTab = "outline" | "bookmarks" | "recent";

export interface ReaderOutlineItem<TTarget = unknown> {
  id: string;
  label: string;
  detail?: string;
  level?: number;
  isActive?: boolean;
  target: TTarget;
}

export interface ReaderBookmarkItem {
  id: string;
  label: string;
  detail: string;
  createdAt: string;
  currentTimeSec: number;
  activeWordIndex?: number;
  progressTargetId: string;
  readingPosition?: ReadingPosition;
}

export interface ReaderRecentPositionItem {
  id: string;
  label: string;
  detail: string;
  updatedAt: string;
  currentTimeSec: number;
  progress: number;
  progressItem: PlaybackProgress;
  readingPosition?: ReadingPosition;
}

export interface ReaderNavigationSourceLabels {
  bookSources?: ReadonlyMap<string, string>;
  preparedSources?: ReadonlyMap<string, string>;
}

export function readerBookmarksFromProgress(
  progress: PlaybackProgress | null | undefined,
): ReaderBookmarkItem[] {
  if (!progress?.bookmarks || progress.bookmarks.length === 0) {
    return [];
  }
  return sortByTimeDescending(progress.bookmarks, (bookmark) => bookmark.createdAt).map(
    (bookmark) => readerBookmarkFromProgress(progress, bookmark),
  );
}

export function readerBookmarkFromProgress(
  progress: PlaybackProgress,
  bookmark: ProgressBookmark,
): ReaderBookmarkItem {
  const label = nonEmptyString(bookmark.label);
  return {
    activeWordIndex: bookmark.activeWordIndex,
    createdAt: bookmark.createdAt,
    currentTimeSec: bookmark.currentTimeSec,
    detail: readerPositionDetail(bookmark.readingPosition, bookmark.activeWordIndex),
    id: bookmark.id,
    label: label ?? formatReaderClock(bookmark.currentTimeSec),
    progressTargetId: progress.targetId,
    readingPosition: bookmark.readingPosition,
  };
}

export function playbackProgressForBookmark(
  progress: PlaybackProgress,
  bookmark: ReaderBookmarkItem | ProgressBookmark,
): PlaybackProgress {
  const readingPosition =
    "readingPosition" in bookmark && bookmark.readingPosition
      ? bookmark.readingPosition
      : progress.readingPosition;
  return {
    ...progress,
    activeWordIndex:
      "activeWordIndex" in bookmark && bookmark.activeWordIndex !== undefined
        ? bookmark.activeWordIndex
        : progress.activeWordIndex,
    currentTimeSec: bookmark.currentTimeSec,
    progress: progress.progress,
    readingPosition,
  };
}

export function readerRecentPositionsFromProgress(
  progressItems: PlaybackProgress[],
  labels: ReaderNavigationSourceLabels = {},
  limit = 8,
): ReaderRecentPositionItem[] {
  return uniqueByTargetId(
    sortByTimeDescending(
      progressItems.filter((progress) => !progress.hidden),
      (progress) => progress.updatedAt,
    ),
  )
    .slice(0, limit)
    .map((progress) => readerRecentPositionFromProgress(progress, labels));
}

function uniqueByTargetId(progressItems: readonly PlaybackProgress[]): PlaybackProgress[] {
  const seen = new Set<string>();
  const unique: PlaybackProgress[] = [];
  for (const progress of progressItems) {
    if (seen.has(progress.targetId)) {
      continue;
    }
    seen.add(progress.targetId);
    unique.push(progress);
  }
  return unique;
}

export function readerRecentPositionFromProgress(
  progress: PlaybackProgress,
  labels: ReaderNavigationSourceLabels = {},
): ReaderRecentPositionItem {
  return {
    currentTimeSec: progress.currentTimeSec,
    detail: [
      progress.finished ? "Finished" : formatProgressPercent(progress.progress),
      formatReaderClock(progress.currentTimeSec),
      readerPositionDetail(progress.readingPosition, progress.activeWordIndex),
    ]
      .filter(Boolean)
      .join(" · "),
    id: progress.targetId,
    label: readerProgressSourceLabel(progress, labels),
    progress: progress.progress,
    progressItem: progress,
    readingPosition: progress.readingPosition,
    updatedAt: progress.updatedAt,
  };
}

export function readerPositionDetail(
  position: ReadingPosition | undefined,
  activeWordIndex: number | undefined,
): string {
  if (position?.scopeKey) {
    return `Scope ${position.scopeKey}`;
  }
  if (position?.nodeId) {
    return `Node ${position.nodeId}`;
  }
  const locator = position?.locator ?? position?.locatorEnvelope?.locator;
  if (locator) {
    return formatContentIRLocator(locator);
  }
  const quote = position?.textQuote?.replaceAll(/\s+/g, " ").trim();
  if (quote) {
    return quote.length > 48 ? `${quote.slice(0, 45)}...` : quote;
  }
  if (activeWordIndex !== undefined && activeWordIndex >= 0) {
    return `Word ${String(activeWordIndex + 1)}`;
  }
  return "Saved position";
}

export function readerProgressSourceLabel(
  progress: PlaybackProgress,
  labels: ReaderNavigationSourceLabels = {},
): string {
  if (progress.preparedSourceId) {
    return labels.preparedSources?.get(progress.preparedSourceId) ?? "Prepared source";
  }
  if (progress.bookSourceId) {
    return labels.bookSources?.get(progress.bookSourceId) ?? bookScopeFallbackLabel(progress);
  }
  return progress.jobId ? "Narration job" : "Reading position";
}

export function readerOutlineFromBookScopes<TScope extends BookScope>(
  options: {
    key: string;
    label: string;
    scope: TScope;
    wordCount?: number;
  }[],
  activeKey: string,
): ReaderOutlineItem<TScope>[] {
  return options.map((option) => ({
    detail:
      option.wordCount === undefined ? undefined : `${option.wordCount.toLocaleString()} words`,
    id: option.key,
    isActive: option.key === activeKey,
    label: option.label,
    level: option.key === "book" ? 1 : 2,
    target: option.scope,
  }));
}

export function formatReaderClock(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes)}:${String(remainder).padStart(2, "0")}`;
}

export function formatReaderDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

export function formatProgressPercent(progress: number): string {
  if (Number.isFinite(progress) && progress > 0) {
    return `${Math.round(Math.min(1, progress) * 100).toString()}%`;
  }
  return "0%";
}

function bookScopeFallbackLabel(progress: PlaybackProgress): string {
  if (progress.bookScope?.label) {
    return progress.bookScope.label;
  }
  if (progress.readingPosition?.scopeKey) {
    return `Book ${progress.readingPosition.scopeKey}`;
  }
  return "Book source";
}

function sortByTimeDescending<T>(items: readonly T[], getTimestamp: (item: T) => string): T[] {
  const sorted: T[] = [];
  for (const item of items) {
    const itemTime = timeValue(getTimestamp(item));
    const insertAt = sorted.findIndex((existing) => itemTime > timeValue(getTimestamp(existing)));
    if (insertAt === -1) {
      sorted.push(item);
    } else {
      sorted.splice(insertAt, 0, item);
    }
  }
  return sorted;
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed !== undefined && trimmed.length > 0) {
    return trimmed;
  }
  return undefined;
}

function timeValue(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
