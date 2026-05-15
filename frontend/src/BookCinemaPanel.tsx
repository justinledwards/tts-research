import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  BookCinemaDiagnostics,
  BookScope,
  BookSource,
  BookSourceSectionRole,
  BookSourceScopeContent,
  PlaybackProgress,
  ThemeName,
  VoiceJob,
} from "./types";

const BOOK_SOURCE_ACCEPT = ".pdf,.epub,application/pdf,application/epub+zip";
const CINEMA_THEMES: ThemeName[] = ["light", "dark", "dawn", "night"];
const BOOK_PAGE_VERTICAL_PADDING = 108;
const BOOK_PAGE_HORIZONTAL_PADDING = 76;
const BOOK_PAGE_MIN_WORDS = 18;
const BOOK_PAGE_MAX_WORDS = 128;
const BOOK_PAGE_DEFAULT_WORDS: Record<BookCinemaTextSize, number> = {
  comfortable: 98,
  large: 76,
  giant: 54,
};
const BOOK_PAGE_FONT_PX: Record<BookCinemaTextSize, number> = {
  comfortable: 20,
  large: 24,
  giant: 30,
};

export type BookCinemaTextSize = "comfortable" | "large" | "giant";

interface BookScopeOption {
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

export interface BookCinemaControlsProps {
  bookSources: BookSource[];
  canCreateAudio: boolean;
  diagnostics: BookCinemaDiagnostics | null;
  error: string | null;
  isImporting: boolean;
  isProcessing: boolean;
  isScopeLoading: boolean;
  scopeContent: BookSourceScopeContent | null;
  scopeProgress: PlaybackProgress | null;
  selectedBookScope: BookScope | null;
  selectedBookSourceId: string | null;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onImport: (file: File) => Promise<void>;
  onOpenCinema: () => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
  onUseText: (book: BookSource, scope: BookScope) => void;
}

export function BookCinemaPanel(props: Readonly<BookCinemaControlsProps>) {
  const {
    bookSources,
    canCreateAudio,
    diagnostics,
    error,
    isImporting,
    isProcessing,
    isScopeLoading,
    scopeContent,
    scopeProgress,
    selectedBookScope,
    selectedBookSourceId,
    onCreateAudio,
    onImport,
    onOpenCinema,
    onResumeProgress,
    onScopeChange,
    onSelectBook,
    onUseText,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const selectedBook = useSelectedBook(bookSources, selectedBookSourceId);
  const scope = selectedBook ? normalizeBookScopeForBook(selectedBook, selectedBookScope) : null;
  const scopeOptions = useMemo(
    () => (selectedBook ? bookScopeOptions(selectedBook) : []),
    [selectedBook],
  );
  const groupedScopeOptions = useMemo(() => groupBookScopeOptions(scopeOptions), [scopeOptions]);

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
      className={`grid gap-4 rounded-lg border border-dashed p-4 ${
        isDragActive ? "border-orange-300 bg-orange-500/10" : "vs-border"
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
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Book Cinema</h3>
          <p className="vs-muted mt-1 text-xs leading-5">
            Import EPUB or PDF, pick a chapter/page range, then enter Cinema from this teleprompter.
          </p>
          <p className="vs-muted mt-1 text-[0.7rem]">
            PDF extractor: {diagnostics?.pdfExtractor ?? "checking"}
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
          {isImporting ? "Importing..." : "Import Book"}
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

      {(error ?? localError ?? diagnostics?.pdfSetup) ? (
        <p
          className={`rounded-md border p-3 text-xs leading-5 ${
            (error ?? localError)
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}
        >
          {error ?? localError ?? diagnostics?.pdfSetup}
        </p>
      ) : null}

      {bookSources.length > 0 && selectedBook && scope ? (
        <BookCinemaSelectedSource
          bookSources={bookSources}
          canCreateAudio={canCreateAudio}
          groupedScopeOptions={groupedScopeOptions}
          isScopeLoading={isScopeLoading}
          scope={scope}
          scopeContent={scopeContent}
          scopeOptions={scopeOptions}
          scopeProgress={scopeProgress}
          selectedBook={selectedBook}
          onCreateAudio={onCreateAudio}
          onOpenCinema={onOpenCinema}
          onResumeProgress={onResumeProgress}
          onScopeChange={onScopeChange}
          onSelectBook={onSelectBook}
          onUseText={onUseText}
        />
      ) : (
        <BookCinemaDropHint />
      )}
    </fieldset>
  );
}

function BookCinemaSelectedSource({
  bookSources,
  canCreateAudio,
  groupedScopeOptions,
  isScopeLoading,
  scope,
  scopeContent,
  scopeOptions,
  scopeProgress,
  selectedBook,
  onCreateAudio,
  onOpenCinema,
  onResumeProgress,
  onScopeChange,
  onSelectBook,
  onUseText,
}: Readonly<{
  bookSources: BookSource[];
  canCreateAudio: boolean;
  groupedScopeOptions: { key: string; label: string; options: BookScopeOption[] }[];
  isScopeLoading: boolean;
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  scopeOptions: BookScopeOption[];
  scopeProgress: PlaybackProgress | null;
  selectedBook: BookSource;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onOpenCinema: () => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
  onUseText: (book: BookSource, scope: BookScope) => void;
}>) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
      <BookSourceList
        bookSources={bookSources}
        selectedBookId={selectedBook.id}
        onScopeChange={onScopeChange}
        onSelectBook={onSelectBook}
      />
      <article className="min-w-0 rounded-md border p-3 vs-surface vs-border">
        <BookScopeActionHeader
          canCreateAudio={canCreateAudio}
          isScopeLoading={isScopeLoading}
          scope={scope}
          scopeContent={scopeContent}
          selectedBook={selectedBook}
          onCreateAudio={onCreateAudio}
          onOpenCinema={onOpenCinema}
          onUseText={onUseText}
        />
        <BookScopeSelector
          groupedScopeOptions={groupedScopeOptions}
          scope={scope}
          scopeOptions={scopeOptions}
          onScopeChange={onScopeChange}
        />
        {scopeProgress ? (
          <BookScopeProgressButton progress={scopeProgress} onResumeProgress={onResumeProgress} />
        ) : null}
        <BookReadingPreview
          book={selectedBook}
          isLoading={isScopeLoading}
          scope={scope}
          scopeContent={scopeContent}
        />
      </article>
    </div>
  );
}

function BookSourceList({
  bookSources,
  selectedBookId,
  onScopeChange,
  onSelectBook,
}: Readonly<{
  bookSources: BookSource[];
  selectedBookId: string;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
}>) {
  return (
    <div className="grid min-w-0 gap-2 content-start">
      {bookSources.map((book) => (
        <button
          className={`min-w-0 rounded-md border p-3 text-left transition ${
            selectedBookId === book.id
              ? "border-orange-300 bg-orange-500/10"
              : "hover:bg-[var(--vs-surface)] vs-border"
          }`}
          key={book.id}
          onClick={() => {
            onSelectBook(book.id);
            onScopeChange(resolveDefaultBookScope(book));
          }}
          type="button"
        >
          <span className="block truncate text-sm font-semibold" title={bookSourceName(book)}>
            {bookSourceName(book)}
          </span>
          <span className="vs-muted mt-1 block truncate text-xs" title={book.sourceFile}>
            {book.kind.toUpperCase()} · {formatBookCount(book)} · {formatBytes(book.sourceBytes)}
          </span>
          <BookStatusBadge status={book.status} />
        </button>
      ))}
    </div>
  );
}

function BookStatusBadge({ status }: Readonly<{ status: BookSource["status"] }>) {
  const badgeClass =
    status === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-red-200 bg-red-50 text-red-700";
  return (
    <span
      className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold ${badgeClass}`}
    >
      {status === "ready" ? "Ready" : "Needs attention"}
    </span>
  );
}

function BookScopeActionHeader({
  canCreateAudio,
  isScopeLoading,
  scope,
  scopeContent,
  selectedBook,
  onCreateAudio,
  onOpenCinema,
  onUseText,
}: Readonly<{
  canCreateAudio: boolean;
  isScopeLoading: boolean;
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  selectedBook: BookSource;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onOpenCinema: () => void;
  onUseText: (book: BookSource, scope: BookScope) => void;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" title={bookSourceName(selectedBook)}>
          {bookSourceName(selectedBook)}
        </h3>
        <p className="vs-muted mt-1 truncate text-xs" title={selectedBook.sourceFile}>
          {selectedBook.author ? `${selectedBook.author} · ` : ""}
          {selectedBook.sourceFile}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
          disabled={selectedBook.status !== "ready" || isScopeLoading || !scopeContent}
          onClick={() => {
            onUseText(selectedBook, scope);
          }}
          type="button"
        >
          Use Text
        </button>
        <button
          className="h-8 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 disabled:opacity-50"
          disabled={selectedBook.status !== "ready" || isScopeLoading}
          onClick={onOpenCinema}
          type="button"
        >
          Cinema
        </button>
        <button
          className="h-8 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg"
          disabled={!canCreateAudio || selectedBook.status !== "ready" || isScopeLoading}
          onClick={() => {
            onCreateAudio(selectedBook, scope);
          }}
          type="button"
        >
          {bookCreateLabel(scope)}
        </button>
      </div>
    </div>
  );
}

function BookScopeSelector({
  groupedScopeOptions,
  scope,
  scopeOptions,
  onScopeChange,
}: Readonly<{
  groupedScopeOptions: { key: string; label: string; options: BookScopeOption[] }[];
  scope: BookScope;
  scopeOptions: BookScopeOption[];
  onScopeChange: (scope: BookScope) => void;
}>) {
  return (
    <label className="mt-3 grid gap-1 text-xs font-semibold">
      <span className="vs-muted">Chapter / scope</span>
      <select
        className="min-w-0 rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-sm outline-none vs-border"
        onChange={(event) => {
          const nextScope = scopeOptions.find(
            (option) => option.key === event.currentTarget.value,
          )?.scope;
          if (nextScope) {
            onScopeChange(nextScope);
          }
        }}
        value={bookScopeKey(scope)}
      >
        {groupedScopeOptions.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.options.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function BookScopeProgressButton({
  progress,
  onResumeProgress,
}: Readonly<{
  progress: PlaybackProgress;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
}>) {
  return (
    <button
      className="mt-3 flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-orange-300 bg-orange-500/10 px-3 py-2 text-left text-xs text-orange-600"
      onClick={() => {
        onResumeProgress(progress);
      }}
      type="button"
    >
      <span className="min-w-0">
        <span className="block font-semibold">Continue this scope</span>
        <span className="block truncate">
          {formatProgressPercent(progress.progress)} ·{" "}
          {formatEstimatedDuration(progress.currentTimeSec * 1000)}
          {formatBookmarkSummary(progress.bookmarks?.length ?? 0)}
        </span>
      </span>
      <span className="shrink-0 font-semibold">Resume</span>
    </button>
  );
}

function BookCinemaDropHint() {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border">
      <p className="font-semibold">Drop a book source here</p>
      <p className="vs-muted mt-1 text-xs">
        EPUB imports run fully local. PDF imports use pdftotext or the managed Python fallback.
      </p>
    </div>
  );
}

function BookReadingPreview({
  book,
  isLoading,
  scope,
  scopeContent,
}: Readonly<{
  book: BookSource;
  isLoading: boolean;
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
}>) {
  const visibleSpans = useMemo(() => {
    const spans = scopeContent?.wordSpans ?? bookScopeSpans(book, scope);
    return visibleBookSpans(spans, -1);
  }, [book, scope, scopeContent]);

  if (book.status === "failed") {
    return (
      <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
        {book.error ??
          "This source could not be imported. For PDFs, use a text-layer PDF or try EPUB."}
      </p>
    );
  }

  let previewContent = (
    <p className="vs-muted text-sm">No readable word spans were extracted yet.</p>
  );
  if (visibleSpans.length > 0) {
    previewContent = (
      <p className="book-cinema-text text-lg">
        {visibleSpans.map((span) => (
          <span data-book-word={span.index} key={`${book.id}-${String(span.index)}`}>
            {span.text}{" "}
          </span>
        ))}
      </p>
    );
  }
  if (isLoading) {
    previewContent = <p className="vs-muted text-sm">Loading selected chapter...</p>;
  }

  return (
    <div className="mt-3 max-h-52 overflow-y-auto rounded-md border bg-[var(--vs-raised)] p-4 leading-8 vs-border">
      {previewContent}
    </div>
  );
}

export function BookCinemaOverlay({
  book,
  canCreateAudio,
  isProcessing,
  job,
  playbackCursorSec,
  playbackControls,
  progress,
  scope,
  scopeContent,
  textSize,
  themeName,
  onClose,
  onBookmark,
  onCreateAudio,
  onPlayPause,
  onRestart,
  onScopeChange,
  onSkip,
  onResumeProgress,
  onTextSizeChange,
  onThemeChange,
}: Readonly<{
  book: BookSource;
  canCreateAudio: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  playbackControls: {
    isAvailable: boolean;
    isPlaying: boolean;
    play: () => void | Promise<void>;
    pause: () => void;
    restart: () => void | Promise<void>;
    skipBy?: (seconds: number) => void;
  };
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  textSize: BookCinemaTextSize;
  themeName: ThemeName;
  onClose: () => void;
  onBookmark: () => void;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onScopeChange: (scope: BookScope) => void;
  onSkip: (seconds: number) => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onTextSizeChange: (size: BookCinemaTextSize) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const normalizedScope = normalizeBookScopeForBook(book, scope);
  const scopeOptions = useMemo(() => bookScopeOptions(book), [book]);
  const scopedSpans = useMemo(
    () => scopeContent?.wordSpans ?? bookScopeSpans(book, normalizedScope),
    [book, normalizedScope, scopeContent],
  );
  const scopedText = scopeContent?.text ?? bookScopeText(book, normalizedScope);
  const activeWordIndex = resolveBookActiveWordIndex(
    book,
    job,
    playbackCursorSec,
    normalizedScope,
    scopeContent,
  );
  const queueOptions = useMemo(() => {
    const narratable = scopeOptions.filter(
      (option) => option.isNarratable && (option.wordCount ?? 0) > 0,
    );
    return narratable.length > 0 ? narratable : scopeOptions;
  }, [scopeOptions]);
  const activeJobMatchesBook =
    job !== null &&
    job.bookSourceId === book.id &&
    bookScopeKey(job.bookScope ?? normalizedScope) === bookScopeKey(normalizedScope);
  const isCancelledBookJob = activeJobMatchesBook && job.status === "cancelled";
  const bookmarks = progress?.bookmarks ?? [];
  const progressPercent = progress ? formatProgressPercent(progress.progress) : "0%";
  const canBookmark = activeJobMatchesBook && playbackControls.isAvailable;

  return (
    <div
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col"
      data-theme={themeName}
      role="dialog"
    >
      <header className="flex items-center justify-between gap-4 border-b px-5 py-4 vs-border sm:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500">
            Book Cinema
          </p>
          <h2
            className="mt-1 truncate text-lg font-semibold sm:text-xl"
            title={bookSourceName(book)}
          >
            {bookSourceName(book)}
          </h2>
          <p className="vs-muted mt-1 truncate text-sm">{bookScopeLabel(normalizedScope)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <select
            className="hidden rounded-md border bg-[var(--vs-surface)] px-3 py-2 text-sm font-semibold outline-none vs-border sm:block"
            onChange={(event) => {
              const nextScope = scopeOptions.find(
                (option) => option.key === event.currentTarget.value,
              )?.scope;
              if (nextScope) {
                onScopeChange(nextScope);
              }
            }}
            value={bookScopeKey(normalizedScope)}
          >
            {scopeOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-md border px-4 text-sm font-semibold vs-border"
            onClick={onClose}
            type="button"
          >
            Exit
          </button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_330px]">
        <aside className="hidden min-h-0 border-r p-5 vs-border lg:block">
          <div className="rounded-lg border p-4 vs-border">
            <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">Source</p>
            <h3 className="mt-2 line-clamp-2 text-lg font-semibold" title={bookSourceName(book)}>
              {bookSourceName(book)}
            </h3>
            <p className="vs-muted mt-2 text-sm">
              {book.kind.toUpperCase()} · {formatBookCount(book)}
            </p>
          </div>
          <div className="mt-4 rounded-lg border p-4 vs-border">
            <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">Narration</p>
            <p className="mt-2 text-sm font-semibold">{bookScopeLabel(normalizedScope)}</p>
            <p className="vs-muted mt-1 text-xs">
              {(scopeContent?.wordCount ?? scopedSpans.length).toLocaleString()} words ·{" "}
              {formatEstimatedDuration(scopeContent?.estimatedDurationMs)}
            </p>
          </div>
          <div className="mt-4 rounded-lg border p-4 vs-border">
            <div className="flex items-center justify-between gap-3">
              <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">Progress</p>
              <span className="text-xs font-semibold text-orange-500">{progressPercent}</span>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-[var(--vs-surface)]">
              <div
                className="h-1.5 rounded-full vs-accent-bg"
                style={{
                  width: progress ? `${Math.round(progress.progress * 100).toString()}%` : "0%",
                }}
              />
            </div>
            <p className="vs-muted mt-2 text-xs">
              {progress
                ? `${formatEstimatedDuration(progress.currentTimeSec * 1000)} listened`
                : "No saved progress for this scope yet."}
            </p>
            {bookmarks.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {bookmarks.slice(-3).map((bookmark) => (
                  <button
                    className="min-w-0 rounded-md border px-3 py-2 text-left text-xs transition hover:border-orange-400 vs-border"
                    key={bookmark.id}
                    onClick={() => {
                      if (progress) {
                        onResumeProgress(progress, bookmark.currentTimeSec);
                      }
                    }}
                    type="button"
                  >
                    <span className="block truncate font-semibold">
                      {bookmark.label ?? formatEstimatedDuration(bookmark.currentTimeSec * 1000)}
                    </span>
                    <span className="vs-muted mt-1 block">
                      {formatEstimatedDuration(bookmark.currentTimeSec * 1000)}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </aside>

        <BookCinemaReaderStage
          activeWordIndex={activeWordIndex}
          book={book}
          scope={normalizedScope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          textSize={textSize}
          onTextSizeChange={onTextSizeChange}
        />

        <aside className="hidden min-h-0 border-l p-5 vs-border lg:block">
          <div className="rounded-lg border p-4 vs-border">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">
                  Audio Player
                </p>
                <p className="mt-2 text-sm font-semibold">{bookScopeLabel(normalizedScope)}</p>
              </div>
              <span className="rounded-full border border-orange-400/30 px-2 py-1 text-xs text-orange-500">
                {job?.status ?? "ready"}
              </span>
            </div>
            <div className="mt-5 h-12 rounded bg-[linear-gradient(90deg,rgba(255,106,0,.95)_0_4px,transparent_4px_12px)] opacity-70" />
            <button
              className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg shadow-orange-500/30 disabled:opacity-50 vs-accent-bg"
              disabled={!playbackControls.isAvailable}
              onClick={onPlayPause}
              type="button"
            >
              {playbackControls.isPlaying ? "Ⅱ" : "▶"}
            </button>
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <span className="vs-muted truncate">
                {progress
                  ? `${formatEstimatedDuration(progress.currentTimeSec * 1000)} saved`
                  : "Progress starts when playback begins"}
              </span>
              <button
                className="rounded border px-2 py-1 font-semibold disabled:opacity-40 vs-border"
                disabled={!canBookmark}
                onClick={onBookmark}
                type="button"
              >
                Bookmark
              </button>
            </div>
          </div>
          <div className="mt-4 rounded-lg border p-4 vs-border">
            <div className="flex items-center justify-between gap-3">
              <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">Queue</p>
              <p className="text-xs text-orange-500">
                {String(book.chapterCount || book.pageCount)} scopes
              </p>
            </div>
            <div className="mt-3 grid gap-2">
              {queueOptions.slice(0, 6).map((option) => (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    bookScopeKey(option.scope) === bookScopeKey(normalizedScope)
                      ? "border-orange-400 bg-orange-500/10 text-orange-500"
                      : "vs-border"
                  }`}
                  key={option.key}
                >
                  <span className="block truncate font-semibold">{option.label}</span>
                  <span className="vs-muted mt-1 block">
                    {(option.wordCount ?? 0).toLocaleString()} words
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
      <footer className="border-t px-4 py-4 vs-border sm:px-8">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!playbackControls.isAvailable}
            onClick={onRestart}
            type="button"
          >
            Restart
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-10);
            }}
            type="button"
          >
            -10s
          </button>
          <button
            className="h-12 min-w-28 rounded-full px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/25 disabled:opacity-50 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={onPlayPause}
            type="button"
          >
            {playbackControls.isPlaying ? "Pause" : "Play"}
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(10);
            }}
            type="button"
          >
            +10s
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold vs-border"
            onClick={() => {
              onTextSizeChange(decreaseBookTextSize(textSize));
            }}
            type="button"
          >
            A-
          </button>
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold vs-border"
            onClick={() => {
              onTextSizeChange(increaseBookTextSize(textSize));
            }}
            type="button"
          >
            A+
          </button>
          <select
            className="h-10 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold outline-none vs-border"
            onChange={(event) => {
              onThemeChange(event.currentTarget.value as ThemeName);
            }}
            value={themeName}
          >
            {CINEMA_THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {theme}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!canBookmark}
            onClick={onBookmark}
            type="button"
          >
            Bookmark
          </button>
          <button
            className="h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 vs-accent-bg"
            disabled={!canCreateAudio || isProcessing || book.status !== "ready"}
            onClick={() => {
              onCreateAudio(book, normalizedScope);
            }}
            type="button"
          >
            {isCancelledBookJob
              ? `${bookCreateLabel(normalizedScope)} Again`
              : bookCreateLabel(normalizedScope)}
          </button>
        </div>
        {isCancelledBookJob ? (
          <p className="mt-3 text-center text-xs text-amber-600">
            This narration was cancelled. The selected scope is ready to create again.
          </p>
        ) : null}
      </footer>
    </div>
  );
}

function BookPageHeading({
  book,
  compact = false,
  scope,
}: Readonly<{ book: BookSource; compact?: boolean; scope: BookScope }>) {
  return (
    <div className={compact ? "lg:hidden" : ""}>
      <p className="vs-muted text-sm font-semibold uppercase tracking-[0.2em]">
        {book.kind.toUpperCase()}
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">
        {bookScopeLabel(scope)}
      </h3>
      <p className="vs-muted mt-2 text-sm">{bookSourceName(book)}</p>
    </div>
  );
}

function BookCinemaReaderStage({
  activeWordIndex,
  book,
  scope,
  scopedSpans,
  scopedText,
  textSize,
  onTextSizeChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  textSize: BookCinemaTextSize;
  onTextSizeChange: (size: BookCinemaTextSize) => void;
}>) {
  const pageMetrics = useBookPageMetrics(textSize);
  const pagination = useMemo(
    () =>
      paginateBookSpans(scopedSpans, activeWordIndex, {
        pagesPerSpread: pageMetrics.pagesPerSpread,
        wordsPerPage: pageMetrics.wordsPerPage,
      }),
    [activeWordIndex, pageMetrics.pagesPerSpread, pageMetrics.wordsPerPage, scopedSpans],
  );
  const displayedPages: (BookPage | null)[] =
    pagination.pages.length > 0 ? pagination.pages : [null];

  return (
    <section className="min-h-0 overflow-hidden px-4 py-5 sm:px-8">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <BookPageHeading book={book} scope={scope} />
          <BookPaginationControls
            pagination={pagination}
            textSize={textSize}
            onTextSizeChange={onTextSizeChange}
          />
        </div>
        <div
          className={`book-cinema-spread grid min-h-0 flex-1 overflow-hidden rounded-xl border shadow-2xl vs-border ${
            pagination.pagesPerSpread === 2
              ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
              : "grid-cols-1"
          }`}
          data-book-pages-per-spread={pagination.pagesPerSpread}
          ref={pageMetrics.ref}
        >
          {displayedPages.map((page, index) => (
            <BookReaderPage
              activeWordIndex={activeWordIndex}
              book={book}
              fallbackText={index === 0 ? scopedText : ""}
              fontSizePx={pageMetrics.fontSizePx}
              isActivePage={isReaderPageActive(page, activeWordIndex)}
              isRightPage={index === 1}
              key={`${book.id}-${bookScopeKey(scope)}-${String(page?.index ?? "fallback")}`}
              page={page}
              scope={scope}
              totalPages={pagination.totalPages}
            />
          ))}
          {displayedPages.length === 1 && pagination.pagesPerSpread === 2 ? (
            <BookReaderPage
              activeWordIndex={activeWordIndex}
              book={book}
              fallbackText=""
              fontSizePx={pageMetrics.fontSizePx}
              isActivePage={false}
              isRightPage
              page={null}
              scope={scope}
              totalPages={pagination.totalPages}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function BookPaginationControls({
  pagination,
  textSize,
  onTextSizeChange,
}: Readonly<{
  pagination: BookPaginationResult;
  textSize: BookCinemaTextSize;
  onTextSizeChange: (size: BookCinemaTextSize) => void;
}>) {
  const firstPage = pagination.spreadIndex * pagination.pagesPerSpread + 1;
  const lastPage =
    pagination.pagesPerSpread === 2 && pagination.totalPages > 1
      ? Math.min(pagination.totalPages, pagination.spreadIndex * 2 + 2)
      : firstPage;

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="vs-muted hidden text-xs font-semibold sm:inline">
        Page {String(firstPage)}
        {lastPage > firstPage ? `-${String(lastPage)}` : ""} of{" "}
        {String(Math.max(1, pagination.totalPages))}
      </span>
      <button
        className="h-9 rounded-md border px-3 font-semibold vs-border"
        onClick={() => {
          onTextSizeChange(decreaseBookTextSize(textSize));
        }}
        type="button"
      >
        A-
      </button>
      <button
        className="h-9 rounded-md border px-3 font-semibold vs-border"
        onClick={() => {
          onTextSizeChange(increaseBookTextSize(textSize));
        }}
        type="button"
      >
        A+
      </button>
    </div>
  );
}

function BookReaderPage({
  activeWordIndex,
  book,
  fallbackText,
  fontSizePx,
  isActivePage,
  isRightPage = false,
  page,
  scope,
  totalPages,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  fallbackText: string;
  fontSizePx: number;
  isActivePage: boolean;
  isRightPage?: boolean;
  page: BookPage | null;
  scope: BookScope;
  totalPages: number;
}>) {
  const pageNumber = page ? page.index + 1 : totalPages + 1;
  const pageLabel = page ? `Reader page ${String(pageNumber)} of ${String(totalPages)}` : "End";
  const visibleFallback = fallbackText.split(/\s+/).filter(Boolean).slice(0, 120).join(" ");

  return (
    <article
      className={`book-cinema-page-shell ${isRightPage ? "book-cinema-page-shell--right" : ""} ${
        isActivePage ? "book-cinema-page-shell--active" : ""
      }`}
      data-book-reader-page={page?.index ?? "blank"}
    >
      <header className="book-cinema-page-header">
        <span className="truncate">{bookScopeLabel(scope)}</span>
        <span>{pageLabel}</span>
      </header>
      <p
        className="book-cinema-page-copy"
        style={{ "--book-page-font-size": `${String(fontSizePx)}px` } as CSSProperties}
      >
        {page && page.spans.length > 0
          ? page.spans.map((span) => (
              <span
                className={span.index === activeWordIndex ? "book-cinema-word-active" : ""}
                data-book-word={span.index}
                key={`${book.id}-cinema-page-${String(page.index)}-${String(span.index)}`}
                title={bookSpanTitle(span)}
              >
                {span.text}{" "}
              </span>
            ))
          : visibleFallback}
      </p>
      <footer className="book-cinema-page-footer">
        <span>{bookSourceName(book)}</span>
        <span>{page ? String(pageNumber) : ""}</span>
      </footer>
    </article>
  );
}

function useBookPageMetrics(textSize: BookCinemaTextSize): {
  fontSizePx: number;
  pagesPerSpread: 1 | 2;
  ref: (node: HTMLDivElement | null) => void;
  wordsPerPage: number;
} {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ height: 0, width: 0 });

  useEffect(() => {
    if (!element) {
      return;
    }
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({
        height: Math.round(rect.height),
        width: Math.round(rect.width),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [element]);

  return useMemo(() => {
    const viewportWidth = size.width > 0 ? size.width : fallbackBookViewportWidth();
    const viewportHeight = size.height > 0 ? size.height : fallbackBookViewportHeight();
    const pagesPerSpread: 1 | 2 = viewportWidth >= 620 ? 2 : 1;
    const pageWidth = Math.max(260, viewportWidth / pagesPerSpread - BOOK_PAGE_HORIZONTAL_PADDING);
    const pageHeight = Math.max(280, viewportHeight - BOOK_PAGE_VERTICAL_PADDING);
    const baseFontPx = BOOK_PAGE_FONT_PX[textSize];
    const lineHeightPx = baseFontPx * 1.76;
    const averageWordWidthPx = baseFontPx * 3.15;
    const wordsPerLine = Math.max(5, Math.floor(pageWidth / averageWordWidthPx));
    const linesPerPage = Math.max(6, Math.floor(pageHeight / lineHeightPx));
    const estimatedWords = Math.floor(wordsPerLine * linesPerPage * 0.86);
    return {
      fontSizePx: baseFontPx,
      pagesPerSpread,
      ref: setElement,
      wordsPerPage: clampNumber(
        Number.isFinite(estimatedWords) ? estimatedWords : BOOK_PAGE_DEFAULT_WORDS[textSize],
        BOOK_PAGE_MIN_WORDS,
        BOOK_PAGE_MAX_WORDS,
      ),
    };
  }, [size.height, size.width, textSize]);
}

function fallbackBookViewportWidth(): number {
  return window.innerWidth;
}

function fallbackBookViewportHeight(): number {
  return Math.max(420, Math.floor(window.innerHeight * 0.62));
}

function isReaderPageActive(page: BookPage | null, activeWordIndex: number): boolean {
  return Boolean(
    page && activeWordIndex >= page.startWordIndex && activeWordIndex <= page.endWordIndex,
  );
}

function useSelectedBook(
  bookSources: BookSource[],
  selectedBookSourceId: string | null,
): BookSource | null {
  return useMemo(() => {
    if (selectedBookSourceId) {
      const selected = bookSources.find((book) => book.id === selectedBookSourceId);
      if (selected) {
        return selected;
      }
    }
    return bookSources[0] ?? null;
  }, [bookSources, selectedBookSourceId]);
}

export function resolveDefaultBookScope(book: BookSource): BookScope {
  const defaultSection = (book.sections ?? []).find(
    (section) => section.id === book.defaultSectionId,
  );
  if (defaultSection) {
    return scopeFromBookSection(defaultSection);
  }
  const firstNarratableSection = (book.sections ?? []).find((section) => section.isNarratable);
  if (firstNarratableSection) {
    return scopeFromBookSection(firstNarratableSection);
  }
  const chapters = book.chapters ?? [];
  const pages = book.pages ?? [];
  if (book.kind === "epub" && chapters.length > 0) {
    const chapter = chapters.find((item) => item.isNarratable !== false) ?? chapters[0];
    return {
      type: "chapter",
      chapterIndex: chapter.index,
      label: nonEmptyString(chapter.title) ?? `Chapter ${String(chapter.index)}`,
    };
  }
  if (book.kind === "pdf" && pages.length > 0) {
    return {
      type: "pages",
      pageStart: 1,
      pageEnd: Math.min(2, pages.length),
      label: pages.length > 1 ? "Pages 1-2" : "Page 1",
    };
  }
  return { type: "book", label: "Full book" };
}

export function normalizeBookScopeForBook(book: BookSource, scope: BookScope | null): BookScope {
  if (!scope) {
    return resolveDefaultBookScope(book);
  }
  if (
    scope.type === "chapter" &&
    (book.chapters ?? []).some((chapter) => chapter.index === scope.chapterIndex)
  ) {
    const chapter = book.chapters?.find((item) => item.index === scope.chapterIndex);
    return {
      type: "chapter",
      chapterIndex: scope.chapterIndex,
      label:
        nonEmptyString(scope.label) ??
        nonEmptyString(chapter?.title) ??
        `Chapter ${String(scope.chapterIndex)}`,
    };
  }
  if (
    scope.type === "pages" &&
    (book.pages ?? []).some((page) => page.index === scope.pageStart) &&
    (book.pages ?? []).some((page) => page.index === scope.pageEnd)
  ) {
    return {
      type: "pages",
      pageStart: scope.pageStart,
      pageEnd: scope.pageEnd,
      label:
        nonEmptyString(scope.label) ??
        pageRangeLabel(scope.pageStart ?? 1, scope.pageEnd ?? scope.pageStart ?? 1),
    };
  }
  if (scope.type === "book") {
    return { type: "book", label: nonEmptyString(scope.label) ?? "Full book" };
  }
  return resolveDefaultBookScope(book);
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
  const sections = book.sections ?? [];
  if (sections.length > 0) {
    return sections.map((section) => ({
      key: bookScopeKey(scopeFromBookSection(section)),
      label: section.title,
      group: section.role,
      isNarratable: section.isNarratable,
      wordCount: section.wordCount,
      scope: scopeFromBookSection(section),
    }));
  }
  const chapters = book.chapters ?? [];
  const pages = book.pages ?? [];
  if (book.kind === "epub" && chapters.length > 0) {
    return chapters.map((chapter) => ({
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
    }));
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
    return options;
  }
  return [
    {
      key: "book",
      label: "Full book",
      group: "full",
      isNarratable: true,
      wordCount: book.wordCount,
      scope: { type: "book", label: "Full book" },
    },
  ];
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function nonEmptyString(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
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

function groupBookScopeOptions(options: BookScopeOption[]): {
  key: string;
  label: string;
  options: BookScopeOption[];
}[] {
  const labels: Record<BookScopeOption["group"], string> = {
    appendix: "Appendix",
    backmatter: "Back matter",
    body: "Chapters",
    frontmatter: "Front matter",
    full: "Full source",
    pages: "Page ranges",
  };
  const order: BookScopeOption["group"][] = [
    "body",
    "pages",
    "frontmatter",
    "appendix",
    "backmatter",
    "full",
  ];
  return order
    .map((group) => ({
      key: group,
      label: labels[group],
      options: options.filter((option) => option.group === group),
    }))
    .filter((group) => group.options.length > 0);
}

function bookCreateLabel(scope: BookScope): string {
  if (scope.type === "chapter") {
    return "Create Current Chapter";
  }
  if (scope.type === "pages") {
    return "Create Page Range";
  }
  return "Create Book Audio";
}

function pageRangeLabel(start: number, end: number): string {
  return start === end ? `Page ${String(start)}` : `Pages ${String(start)}-${String(end)}`;
}

function formatEstimatedDuration(durationMs: number | null | undefined): string {
  if (!durationMs || durationMs <= 0) {
    return "duration pending";
  }
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${String(seconds)} sec`;
  }
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

function formatProgressPercent(progress: number): string {
  if (!Number.isFinite(progress) || progress <= 0) {
    return "0%";
  }
  return `${Math.round(Math.min(1, progress) * 100).toString()}%`;
}

function formatBookmarkSummary(count: number): string {
  if (count <= 0) {
    return "";
  }
  return ` · ${count.toString()} bookmark${count === 1 ? "" : "s"}`;
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
  if (book.kind === "pdf" && book.pageCount > 0) {
    return `${book.pageCount.toLocaleString()} pages · ${book.wordCount.toLocaleString()} words`;
  }
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

function decreaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  if (size === "giant") {
    return "large";
  }
  return "comfortable";
}

function increaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  if (size === "comfortable") {
    return "large";
  }
  return "giant";
}
