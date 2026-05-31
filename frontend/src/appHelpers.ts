import { formatDuration } from "./format";
import { bookScopeKey, resolveDefaultBookScope } from "./features/book-cinema/model";
import type {
  BookScope,
  BookSource,
  PlaybackProgress,
  ReadingPosition,
  VoiceJob,
  VoiceProfile,
} from "./types";

export function parseBookCinemaHash(hash: string): ReadingPosition | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  if (params.get("cinema") !== "book") {
    return null;
  }
  const bookSourceId = params.get("book")?.trim();
  if (!bookSourceId) {
    return null;
  }
  const parsedWord = Number(params.get("word") ?? "0");
  return {
    activeWordIndex: Number.isFinite(parsedWord) ? Math.max(0, Math.round(parsedWord)) : 0,
    bookSourceId,
    nodeId: params.get("node") ?? undefined,
    scopeKey: params.get("scope") ?? undefined,
  };
}

export function replaceBookCinemaHash(position: ReadingPosition): void {
  if (!position.bookSourceId || !position.scopeKey) {
    return;
  }
  const params = new URLSearchParams();
  params.set("cinema", "book");
  params.set("book", position.bookSourceId);
  params.set("scope", position.scopeKey);
  params.set("word", String(Math.max(0, position.activeWordIndex ?? 0)));
  if (position.nodeId) {
    params.set("node", position.nodeId);
  }
  const nextHash = `#${params.toString()}`;
  if (globalThis.location.hash !== nextHash) {
    globalThis.history.replaceState(null, "", nextHash);
  }
}

export function scopeFromBookScopeKey(book: BookSource, key: string | undefined): BookScope {
  if (!key) {
    return resolveDefaultBookScope(book);
  }
  if (key === "book") {
    return { type: "book", label: "Full book" };
  }
  const chapter = /^chapter:(\d+)$/.exec(key);
  if (chapter) {
    const chapterIndex = Number(chapter[1]);
    const sourceChapter = book.chapters?.find((item) => item.index === chapterIndex);
    const sourceSection = book.sections?.find(
      (item) =>
        item.chapterIndex === chapterIndex ||
        (item.kind !== "pages" && item.index + 1 === chapterIndex),
    );
    return {
      type: "chapter",
      chapterIndex,
      label: sourceChapter?.title ?? sourceSection?.title ?? `Chapter ${String(chapterIndex)}`,
    };
  }
  const pages = /^pages:(\d+)-(\d+)$/.exec(key);
  if (pages) {
    const pageStart = Number(pages[1]);
    const pageEnd = Number(pages[2]);
    const sourceSection = book.sections?.find(
      (item) =>
        (item.kind === "pages" || item.pageStart !== undefined) &&
        item.pageStart === pageStart &&
        (item.pageEnd ?? item.pageStart) === pageEnd,
    );
    return {
      type: "pages",
      pageStart,
      pageEnd,
      label:
        sourceSection?.title ??
        (pageStart === pageEnd
          ? `Page ${String(pageStart)}`
          : `Pages ${String(pageStart)}-${String(pageEnd)}`),
    };
  }
  return resolveDefaultBookScope(book);
}

export function playbackProgressFromReadingPosition(
  position: ReadingPosition | null,
  bookSourceId: string,
  scopeKey: string,
  projectId: string,
): PlaybackProgress | null {
  if (
    position?.bookSourceId !== bookSourceId ||
    position.scopeKey !== scopeKey ||
    position.activeWordIndex === undefined
  ) {
    return null;
  }
  const timestamp = new Date(0).toISOString();
  return {
    activeWordIndex: position.activeWordIndex,
    bookScope: bookScopeFromScopeKey(scopeKey),
    bookSourceId,
    createdAt: timestamp,
    currentTimeSec: 0,
    finished: false,
    hidden: false,
    progress: 0,
    projectId,
    readingPosition: position,
    targetId: `hash:${bookSourceId}:${scopeKey}`,
    updatedAt: timestamp,
  };
}

function bookScopeFromScopeKey(scopeKey: string): BookScope | undefined {
  if (scopeKey === "book") {
    return { type: "book", label: "Full book" };
  }
  const chapter = /^chapter:(\d+)$/.exec(scopeKey);
  if (chapter) {
    const chapterIndex = Number(chapter[1]);
    return {
      type: "chapter",
      chapterIndex,
      label: `Chapter ${String(chapterIndex)}`,
    };
  }
  const pages = /^pages:(\d+)-(\d+)$/.exec(scopeKey);
  if (pages) {
    const pageStart = Number(pages[1]);
    const pageEnd = Number(pages[2]);
    return {
      type: "pages",
      pageStart,
      pageEnd,
      label:
        pageStart === pageEnd
          ? `Page ${String(pageStart)}`
          : `Pages ${String(pageStart)}-${String(pageEnd)}`,
    };
  }
  return undefined;
}

export function progressTargetIdForJob(job: VoiceJob): string {
  if (job.progressTargetId) {
    return job.progressTargetId;
  }
  if (job.bookSourceId && job.bookScope) {
    return progressTargetIdForBookScope(job.bookSourceId, job.bookScope);
  }
  if (job.preparedSourceId) {
    return `prepared:${job.preparedSourceId}`;
  }
  return job.id ? `job:${job.id}` : "";
}

export function progressTargetIdForBookScope(bookSourceId: string, scope: BookScope): string {
  return `book:${bookSourceId}:${bookScopeKey(scope)}`;
}

export function activeWordIndexForProgress(job: VoiceJob, cursorSec: number): number {
  const durationSec = job.durationMs > 0 ? job.durationMs / 1000 : 0;
  const wordCount = job.optimizedText.trim().split(/\s+/).filter(Boolean).length;
  if (durationSec <= 0 || wordCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(wordCount - 1, Math.floor((cursorSec / durationSec) * wordCount)));
}

export function formatSimilarity(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "waiting";
  }

  return `${Math.round(value * 100).toString()}%`;
}

export function formatLikenessLabel(profile: VoiceProfile): string {
  if (!profile.likeness) {
    return "likeness pending";
  }
  return `${formatLikenessBadge(profile.likeness)} likeness`;
}

export function formatLikenessBadge(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "pending";
  }
  if (likeness.status === "failed") {
    return "needs QA";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "strong";
  }
  if (score >= 0.68) {
    return "good";
  }
  return "weak";
}

export function likenessBadgeClass(likeness: NonNullable<VoiceProfile["likeness"]>): string {
  if (likeness.status === "pending") {
    return "bg-[var(--vs-surface-muted)] text-[var(--vs-text-muted)]";
  }
  if (likeness.status === "failed") {
    return "bg-[var(--vs-status-warning-bg)] text-[var(--vs-status-warning)]";
  }
  const score = likeness.score ?? likeness.speakerSimilarity ?? 0;
  if (score >= 0.82) {
    return "bg-[var(--vs-status-success-bg)] text-[var(--vs-status-success)]";
  }
  if (score >= 0.68) {
    return "bg-[var(--vs-status-info-bg)] text-[var(--vs-status-info)]";
  }
  return "bg-[var(--vs-status-danger-bg)] text-[var(--vs-status-danger)]";
}

export function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${String(Math.round(value))} B`;
}

export function formatPercentage(value: number): string {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  const ratio = Math.max(0, Math.min(1, value));
  return `${Math.round(ratio * 100).toString()}%`;
}

export function formatPercentageRatio(value: number, total: number): string {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return "0%";
  }
  return formatPercentage(value / total);
}

export function formatPace(value: number | null | undefined): string {
  if (!Number.isFinite(value) || !value || value <= 0) {
    return "n/a";
  }
  if (value >= 100) {
    return "99x+";
  }
  if (value >= 10) {
    return `${Math.round(value).toString()}x`;
  }
  return `${value.toFixed(2)}x`;
}

export function estimateFirstAudioETA(job: VoiceJob | null): string {
  if (!job) {
    return "n/a";
  }
  if ((job.audioReadySegments ?? 0) > 0) {
    return "Ready";
  }
  const latencies = (job.audioSegmentLatenciesMs ?? []).filter((value) => value > 0);
  if (latencies.length === 0) {
    return job.status === "synthesizing" || job.status === "checking" ? "Calculating" : "n/a";
  }
  return formatDuration(Math.round(latencies[0]));
}

export function formatSegment(job: VoiceJob): string {
  const current =
    job.retries.currentSegment > 0
      ? job.retries.currentSegment
      : (job.progress.currentSegment ?? 0);
  const total =
    job.retries.totalSegments > 0 ? job.retries.totalSegments : (job.progress.totalSegments ?? 0);
  if (current > 0 && total > 0) {
    return `${String(current)}/${String(total)}`;
  }

  return "waiting";
}

export function formatElapsed(startedAt: string | undefined, now: number): string {
  if (!startedAt) {
    return "waiting";
  }

  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) {
    return "waiting";
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - started) / 1000));
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  if (minutes > 0) {
    return `${String(minutes)}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${String(seconds)}s`;
}

export function formatRelativeTime(timestamp: string | undefined, now: number): string {
  if (!timestamp) {
    return "No updates yet";
  }
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) {
    return "No updates yet";
  }
  const elapsedSeconds = Math.max(0, Math.floor((now - parsed) / 1000));
  if (elapsedSeconds < 5) {
    return "just now";
  }
  if (elapsedSeconds < 60) {
    return `${String(elapsedSeconds)}s ago`;
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${String(elapsedMinutes)}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  return `${String(elapsedHours)}h ago`;
}

export function shortIdentifier(value: string): string {
  const clean = value.trim();
  if (clean.length <= 12) {
    return clean || "pending";
  }
  return clean.slice(0, 12);
}
