import { useMemo, useRef, useState } from "react";
import type { BookSource, VoiceJob } from "./types";

const BOOK_SOURCE_ACCEPT = ".pdf,.epub,application/pdf,application/epub+zip";

export function BookCinemaPanel({
  bookSources,
  canCreateAudio,
  error,
  isImporting,
  isProcessing,
  job,
  playbackCursorSec,
  selectedBookSourceId,
  onCreateAudio,
  onImport,
  onSelectBook,
  onUseText,
}: Readonly<{
  bookSources: BookSource[];
  canCreateAudio: boolean;
  error: string | null;
  isImporting: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  playbackCursorSec: number;
  selectedBookSourceId: string | null;
  onCreateAudio: (book: BookSource) => void;
  onImport: (file: File) => Promise<void>;
  onSelectBook: (bookId: string) => void;
  onUseText: (book: BookSource) => void;
}>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedBook = useMemo(() => {
    if (selectedBookSourceId) {
      const selected = bookSources.find((book) => book.id === selectedBookSourceId);
      if (selected) {
        return selected;
      }
    }
    return bookSources[0] ?? null;
  }, [bookSources, selectedBookSourceId]);

  const importFile = async (file: File | null | undefined) => {
    setLocalError(null);
    if (!file) {
      return;
    }
    if (!isSupportedBookSource(file)) {
      setLocalError("Upload a PDF or EPUB book source.");
      return;
    }
    await onImport(file);
  };

  return (
    <fieldset
      className={`grid gap-4 rounded-lg border p-4 shadow-sm vs-raised ${
        isDragActive ? "border-orange-300 ring-2 ring-orange-100" : "vs-border"
      }`}
      onDragLeave={() => {
        setIsDragActive(false);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!isProcessing) {
          setIsDragActive(true);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragActive(false);
        void importFile(event.dataTransfer.files.item(0));
      }}
    >
      <legend className="sr-only">Book Cinema source import</legend>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Book Cinema</h2>
          <p className="vs-muted mt-1 text-xs leading-5">
            Import PDF or EPUB, then narrate the extracted book text with word-span overlay.
          </p>
        </div>
        <button
          className="h-9 shrink-0 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-50 vs-border"
          disabled={isImporting || isProcessing}
          onClick={() => {
            inputRef.current?.click();
          }}
          type="button"
        >
          Import Book
        </button>
        <input
          accept={BOOK_SOURCE_ACCEPT}
          className="sr-only"
          ref={inputRef}
          type="file"
          onChange={(event) => {
            void importFile(event.currentTarget.files?.item(0));
            event.currentTarget.value = "";
          }}
        />
      </div>

      {(error ?? localError) ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">
          {error ?? localError}
        </p>
      ) : null}

      {bookSources.length > 0 ? (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <div className="grid min-w-0 gap-2">
            {bookSources.slice(0, 4).map((book) => (
              <button
                className={`min-w-0 rounded-md border p-3 text-left transition ${
                  selectedBook.id === book.id
                    ? "border-orange-300 bg-orange-500/10"
                    : "hover:bg-[var(--vs-surface)] vs-border"
                }`}
                key={book.id}
                onClick={() => {
                  onSelectBook(book.id);
                }}
                type="button"
              >
                <span className="block truncate text-sm font-semibold" title={bookSourceName(book)}>
                  {bookSourceName(book)}
                </span>
                <span className="vs-muted mt-1 block truncate text-xs" title={book.sourceFile}>
                  {book.kind.toUpperCase()} · {formatBookCount(book)} ·{" "}
                  {formatBytes(book.sourceBytes)}
                </span>
                <span
                  className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${
                    book.status === "ready"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {book.status === "ready" ? "Ready" : "Needs attention"}
                </span>
              </button>
            ))}
          </div>

          <BookReadingPreview
            book={selectedBook}
            canCreateAudio={canCreateAudio}
            job={job}
            playbackCursorSec={playbackCursorSec}
            onCreateAudio={onCreateAudio}
            onUseText={onUseText}
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border">
          <p className="font-semibold">Drop a book source here</p>
          <p className="vs-muted mt-1 text-xs">
            EPUB imports run fully local. PDF imports use the local text layer through pdftotext
            when available.
          </p>
        </div>
      )}
    </fieldset>
  );
}

function BookReadingPreview({
  book,
  canCreateAudio,
  job,
  playbackCursorSec,
  onCreateAudio,
  onUseText,
}: Readonly<{
  book: BookSource;
  canCreateAudio: boolean;
  job: VoiceJob | null;
  playbackCursorSec: number;
  onCreateAudio: (book: BookSource) => void;
  onUseText: (book: BookSource) => void;
}>) {
  const activeWordIndex = resolveBookActiveWordIndex(book, job, playbackCursorSec);
  const visibleSpans = useMemo(
    () => visibleBookSpans(book.wordSpans ?? [], activeWordIndex),
    [activeWordIndex, book.wordSpans],
  );

  return (
    <article className="min-w-0 rounded-md border p-3 vs-surface vs-border">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold" title={bookSourceName(book)}>
            {bookSourceName(book)}
          </h3>
          <p className="vs-muted mt-1 truncate text-xs" title={book.sourceFile}>
            {book.author ? `${book.author} · ` : ""}
            {book.sourceFile}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <button
            className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
            disabled={book.status !== "ready"}
            onClick={() => {
              onUseText(book);
            }}
            type="button"
          >
            Use Text
          </button>
          <button
            className="h-8 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
            disabled={!canCreateAudio || book.status !== "ready"}
            onClick={() => {
              onCreateAudio(book);
            }}
            type="button"
          >
            Create & Listen
          </button>
        </div>
      </div>

      {book.status === "failed" ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          {book.error ??
            "This source could not be imported. For PDFs, install a local text-layer extractor or try EPUB."}
        </p>
      ) : (
        <div className="mt-3 max-h-60 overflow-y-auto rounded-md border bg-[var(--vs-raised)] p-4 leading-8 vs-border">
          {visibleSpans.length > 0 ? (
            <p className="book-cinema-text text-lg">
              {visibleSpans.map((span) => (
                <span
                  className={span.index === activeWordIndex ? "book-cinema-word-active" : ""}
                  data-book-word={span.index}
                  key={`${book.id}-${String(span.index)}`}
                  title={bookSpanTitle(span)}
                >
                  {span.text}{" "}
                </span>
              ))}
            </p>
          ) : (
            <p className="vs-muted text-sm">No readable word spans were extracted yet.</p>
          )}
        </div>
      )}
    </article>
  );
}

export function resolveBookActiveWordIndex(
  book: BookSource,
  job: VoiceJob | null,
  playbackCursorSec: number,
): number {
  const spans = book.wordSpans ?? [];
  if (spans.length === 0 || !job || job.durationMs <= 0 || playbackCursorSec <= 0) {
    return -1;
  }
  const bookText = (book.text ?? "").trim();
  const jobText = job.inputText.trim();
  if (bookText.length > 0 && jobText.length > 0 && bookText !== jobText) {
    return -1;
  }
  const progress = Math.min(0.999, Math.max(0, playbackCursorSec / (job.durationMs / 1000)));
  return Math.min(spans.length - 1, Math.max(0, Math.floor(progress * spans.length)));
}

export function visibleBookSpans(
  spans: BookSource["wordSpans"],
  activeWordIndex: number,
): NonNullable<BookSource["wordSpans"]> {
  const sourceSpans = spans ?? [];
  if (sourceSpans.length <= 220) {
    return sourceSpans;
  }
  if (activeWordIndex < 0) {
    return sourceSpans.slice(0, 220);
  }
  const start = Math.max(0, activeWordIndex - 88);
  return sourceSpans.slice(start, Math.min(sourceSpans.length, start + 220));
}

export function bookSourceName(book: BookSource): string {
  const title = book.title?.trim();
  return title && title.length > 0 ? title : book.sourceFile;
}

function bookSpanTitle(span: NonNullable<BookSource["wordSpans"]>[number]): string | undefined {
  if (span.pageIndex) {
    return `Page ${String(span.pageIndex)}`;
  }
  if (span.chapter) {
    return `Chapter ${String(span.chapter)}`;
  }
  return undefined;
}

function formatBookCount(book: BookSource): string {
  if (book.chapterCount > 0) {
    return `${book.chapterCount.toLocaleString()} chapters · ${book.wordCount.toLocaleString()} words`;
  }
  if (book.pageCount > 0) {
    return `${book.pageCount.toLocaleString()} pages · ${book.wordCount.toLocaleString()} words`;
  }
  return `${book.wordCount.toLocaleString()} words`;
}

function isSupportedBookSource(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return extension === "pdf" || extension === "epub";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
