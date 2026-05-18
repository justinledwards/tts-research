import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  BookCinemaDiagnostics,
  BookImportProfile,
  BookScope,
  BookSource,
  BookSourceImportOptions,
  BookSourceSectionRole,
  BookSourceScopeContent,
  HighlightMap,
  PDFTableMode,
  PlaybackProgress,
  ThemeName,
  VoiceJob,
} from "./types";
import type { HighlightCue } from "./highlightMap";
import { VOICE_STUDIO_THEMES } from "./theme";

export const BOOK_SOURCE_ACCEPT =
  ".pdf,.epub,.docx,.html,.htm,.zip,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,application/xhtml+xml,application/zip,image/png,image/jpeg,image/tiff,image/webp";
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
const BOOK_CINEMA_PLAYBACK_RATES = [0.8, 1, 1.25, 1.5] as const;
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
export const READER_ACCESSIBILITY_STORAGE_KEY = "tts-reader-accessibility-v1";

export type BookCinemaTextSize = "comfortable" | "large" | "giant";
export type BookCinemaKeyboardCommand =
  | "bookmark"
  | "close"
  | "restart"
  | "seekBackward"
  | "seekForward"
  | "speedDown"
  | "speedUp"
  | "togglePlayback";

export interface ReaderAccessibilitySettings {
  highContrast: boolean;
  reducedMotion: boolean;
}

export interface BookCinemaPolicyNote {
  explanation: string;
  id: string;
  kind: string;
  mode: string;
  text?: string;
  title: string;
}

export const DEFAULT_READER_ACCESSIBILITY_SETTINGS: ReaderAccessibilitySettings = {
  highContrast: false,
  reducedMotion: false,
};

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

export function normalizeReaderAccessibilitySettings(value: unknown): ReaderAccessibilitySettings {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_READER_ACCESSIBILITY_SETTINGS };
  }
  const candidate = value as Partial<ReaderAccessibilitySettings>;
  return {
    highContrast: candidate.highContrast === true,
    reducedMotion: candidate.reducedMotion === true,
  };
}

export function bookCinemaKeyboardCommandForKey(key: string): BookCinemaKeyboardCommand | null {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  if (normalized === " " || normalized === "k") {
    return "togglePlayback";
  }
  if (normalized === "ArrowLeft" || normalized === "j") {
    return "seekBackward";
  }
  if (normalized === "ArrowRight" || normalized === "l") {
    return "seekForward";
  }
  if (normalized === "Home") {
    return "restart";
  }
  if (normalized === "[") {
    return "speedDown";
  }
  if (normalized === "]") {
    return "speedUp";
  }
  if (normalized === "b") {
    return "bookmark";
  }
  if (normalized === "Escape") {
    return "close";
  }
  return null;
}

export function shouldIgnoreBookCinemaKeyboardTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined" || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "button" ||
    tagName === "input" ||
    tagName === "select" ||
    tagName === "textarea" ||
    Boolean(target.closest("[data-book-cinema-ignore-shortcuts]"))
  );
}

export function nextBookCinemaPlaybackRate(currentRate: number, direction: -1 | 1): number {
  const currentIndex = BOOK_CINEMA_PLAYBACK_RATES.findIndex(
    (rate) => Math.abs(rate - currentRate) < 0.01,
  );
  let fallbackIndex = 0;
  for (const [index, rate] of BOOK_CINEMA_PLAYBACK_RATES.entries()) {
    if (
      Math.abs(rate - currentRate) <
      Math.abs(BOOK_CINEMA_PLAYBACK_RATES[fallbackIndex] - currentRate)
    ) {
      fallbackIndex = index;
    }
  }
  const nextIndex = clampNumber(
    (currentIndex === -1 ? fallbackIndex : currentIndex) + direction,
    0,
    BOOK_CINEMA_PLAYBACK_RATES.length - 1,
  );
  return BOOK_CINEMA_PLAYBACK_RATES[nextIndex] ?? 1;
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
  selectedBookScope: BookScope | null;
  selectedBookSourceId: string | null;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  onInspectStructure: (book: BookSource) => void;
  onOpenCinema: () => void;
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
    selectedBookScope,
    selectedBookSourceId,
    onCreateAudio,
    onImport,
    onInspectStructure,
    onOpenCinema,
    onScopeChange,
    onSelectBook,
    onUseText,
  } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [importProfile, setImportProfile] = useState<BookImportProfile>("auto");
  const [pdfTableMode, setPDFTableMode] = useState<PDFTableMode>("auto");
  const selectedBook = useSelectedBook(bookSources, selectedBookSourceId);
  const scope = selectedBook ? normalizeBookScopeForBook(selectedBook, selectedBookScope) : null;
  const scopeOptions = useMemo(
    () => (selectedBook ? bookScopeOptions(selectedBook) : []),
    [selectedBook],
  );
  const groupedScopeOptions = useMemo(() => groupBookScopeOptions(scopeOptions), [scopeOptions]);

  const importFiles = async (files: FileList | File[] | null | undefined) => {
    setLocalError(null);
    const fileArray = files ? [...files] : [];
    if (fileArray.length === 0) {
      return;
    }
    if (!isSupportedBookSourceBatch(fileArray)) {
      setLocalError("Upload one book source or an ordered batch of image pages.");
      return;
    }
    await onImport(fileArray, { importProfile, pdfTableMode });
  };

  return (
    <fieldset
      className={`grid gap-3 rounded-lg border bg-[var(--vs-raised)] p-3 ${
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
        void importFiles(event.dataTransfer.files);
      }}
    >
      <legend className="sr-only">Book Cinema source import</legend>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Book Cinema</h3>
          <p className="vs-muted mt-1 text-xs leading-5">
            Import EPUB, PDF, DOCX, or HTML, pick a scope, then enter Cinema from this teleprompter.
          </p>
          <p className="vs-muted mt-1 text-[0.7rem]">
            PDF extractor: {diagnostics?.pdfExtractor ?? "checking"} · Adapters:{" "}
            {formatAdapterDiagnostics(diagnostics)}
          </p>
        </div>
        <div className="grid shrink-0 gap-2 sm:grid-cols-[8.5rem_8.5rem_auto] sm:items-end">
          <label className="grid gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] vs-muted">
            <span>Profile</span>
            <select
              className="h-9 rounded-md border bg-[var(--vs-surface)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--vs-text)] vs-border"
              onChange={(event) => {
                setImportProfile(event.currentTarget.value as BookImportProfile);
              }}
              value={importProfile}
            >
              <option value="auto">Auto</option>
              <option value="scholarly">Scholarly</option>
            </select>
          </label>
          <label className="grid gap-1 text-[0.7rem] font-semibold uppercase tracking-[0.12em] vs-muted">
            <span>Tables</span>
            <select
              className="h-9 rounded-md border bg-[var(--vs-surface)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--vs-text)] vs-border"
              onChange={(event) => {
                setPDFTableMode(event.currentTarget.value as PDFTableMode);
              }}
              value={pdfTableMode}
            >
              <option value="auto">Auto</option>
              <option value="structured">Structured</option>
              <option value="off">Off</option>
            </select>
          </label>
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
        </div>
        <input
          aria-label="Book source files"
          accept={BOOK_SOURCE_ACCEPT}
          className="sr-only"
          ref={inputRef}
          type="file"
          multiple
          onChange={(event) => {
            void importFiles(event.currentTarget.files);
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
          selectedBook={selectedBook}
          onCreateAudio={onCreateAudio}
          onInspectStructure={onInspectStructure}
          onOpenCinema={onOpenCinema}
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
  selectedBook,
  onCreateAudio,
  onInspectStructure,
  onOpenCinema,
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
  selectedBook: BookSource;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onInspectStructure: (book: BookSource) => void;
  onOpenCinema: () => void;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
  onUseText: (book: BookSource, scope: BookScope) => void;
}>) {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(180px,0.52fr)_minmax(0,1.48fr)]">
      <BookSourceList
        bookSources={bookSources}
        selectedBookId={selectedBook.id}
        onScopeChange={onScopeChange}
        onSelectBook={onSelectBook}
      />
      <article className="min-w-0 rounded-lg border bg-[var(--vs-raised)] p-3 vs-border">
        <BookScopeActionHeader
          canCreateAudio={canCreateAudio}
          isScopeLoading={isScopeLoading}
          scope={scope}
          scopeContent={scopeContent}
          selectedBook={selectedBook}
          onCreateAudio={onCreateAudio}
          onInspectStructure={onInspectStructure}
          onOpenCinema={onOpenCinema}
          onUseText={onUseText}
        />
        <BookIngestionDiagnostics book={selectedBook} />
        <BookScopeSelector
          groupedScopeOptions={groupedScopeOptions}
          scope={scope}
          scopeOptions={scopeOptions}
          onScopeChange={onScopeChange}
        />
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
    <div className="grid max-h-72 min-w-0 content-start gap-2 overflow-y-auto pr-1">
      {bookSources.map((book) => (
        <button
          className={`min-w-0 rounded-md border p-3 text-left transition ${
            selectedBookId === book.id
              ? "border-orange-300 bg-orange-500/10"
              : "bg-[var(--vs-raised)] hover:bg-[var(--vs-surface)] vs-border"
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
          {book.ingestion?.supportTierLabel ? (
            <span className="vs-muted mt-1 block truncate text-[0.68rem]">
              {book.ingestion.supportTierLabel}
            </span>
          ) : null}
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

function BookIngestionDiagnostics({ book }: Readonly<{ book: BookSource }>) {
  const ingestion = book.ingestion;
  if (!ingestion) {
    return null;
  }
  const confidence =
    typeof ingestion.confidence === "number" && Number.isFinite(ingestion.confidence)
      ? `${Math.round(ingestion.confidence * 100).toString()}%`
      : "n/a";
  const warnings = [...(ingestion.warnings ?? []), ...(book.warnings ?? [])].filter(Boolean);
  return (
    <section className="my-3 grid gap-2 rounded-md border bg-[var(--vs-surface)] p-3 text-xs vs-border">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="rounded border px-2 py-1 font-semibold uppercase tracking-[0.12em] vs-border">
          {ingestion.supportTier ?? "tier"}
        </span>
        <span className="min-w-0 font-semibold">{ingestion.supportTierLabel ?? "Detected"}</span>
        <span className="vs-muted">Confidence {confidence}</span>
        {ingestion.importProfile ? (
          <span className="vs-muted">{ingestion.importProfile}</span>
        ) : null}
        {ingestion.pdfTableMode ? (
          <span className="vs-muted">tables {ingestion.pdfTableMode}</span>
        ) : null}
      </div>
      {(ingestion.extractorChain ?? []).length > 0 ? (
        <div className="grid gap-1">
          {(ingestion.extractorChain ?? []).map((step) => (
            <div className="flex min-w-0 items-center justify-between gap-3" key={step.id}>
              <span className="min-w-0 truncate" title={step.label}>
                {step.label}
              </span>
              <span className="vs-muted shrink-0">
                {step.status}
                {typeof step.confidence === "number"
                  ? ` · ${Math.round(step.confidence * 100).toString()}%`
                  : ""}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {warnings.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {[...new Set(warnings)].map((warning) => (
            <span
              className="rounded-full bg-amber-50 px-2 py-1 font-semibold text-amber-700"
              key={warning}
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function BookScopeActionHeader({
  canCreateAudio,
  isScopeLoading,
  scope,
  scopeContent,
  selectedBook,
  onCreateAudio,
  onInspectStructure,
  onOpenCinema,
  onUseText,
}: Readonly<{
  canCreateAudio: boolean;
  isScopeLoading: boolean;
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  selectedBook: BookSource;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onInspectStructure: (book: BookSource) => void;
  onOpenCinema: () => void;
  onUseText: (book: BookSource, scope: BookScope) => void;
}>) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold" title={bookSourceName(selectedBook)}>
          {bookSourceName(selectedBook)}
        </h3>
        <p className="vs-muted mt-1 truncate text-xs" title={selectedBook.sourceFile}>
          {selectedBook.author ? `${selectedBook.author} · ` : ""}
          {selectedBook.sourceFile}
        </p>
      </div>
      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          className="h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border"
          onClick={() => {
            onInspectStructure(selectedBook);
          }}
          type="button"
        >
          Inspect structure
        </button>
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

function BookCinemaDropHint() {
  return (
    <div className="rounded-md border border-dashed p-4 text-sm leading-6 vs-border">
      <p className="font-semibold">Drop a book source here</p>
      <p className="vs-muted mt-1 text-xs">
        EPUB, DOCX, HTML, PDFs, scanned documents, and ordered image pages run through local IR
        adapters.
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
    <div className="mt-3 max-h-44 overflow-y-auto rounded-md border bg-[var(--vs-surface)] p-4 leading-8 vs-border">
      {previewContent}
    </div>
  );
}

function useBookCinemaKeyboardControls({
  canBookmark,
  onBookmark,
  onClose,
  onPlayPause,
  onRestart,
  onSkip,
  playbackControls,
}: Readonly<{
  canBookmark: boolean;
  onBookmark: () => void;
  onClose: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
  playbackControls: {
    isAvailable: boolean;
    playbackRate: number;
    setPlaybackRate?: (rate: number) => void;
    skipBy?: (seconds: number) => void;
  };
}>) {
  useEffect(() => {
    const actions = bookCinemaKeyboardActions({
      canBookmark,
      onBookmark,
      onClose,
      onPlayPause,
      onRestart,
      onSkip,
      playbackControls,
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreBookCinemaKeyboardTarget(event.target)) {
        return;
      }
      const command = bookCinemaKeyboardCommandForKey(event.key);
      if (!command) {
        return;
      }
      const action = actions[command];
      if (!action) {
        return;
      }
      event.preventDefault();
      action();
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
    };
  }, [canBookmark, onBookmark, onClose, onPlayPause, onRestart, onSkip, playbackControls]);
}

function bookCinemaKeyboardActions({
  canBookmark,
  onBookmark,
  onClose,
  onPlayPause,
  onRestart,
  onSkip,
  playbackControls,
}: Readonly<{
  canBookmark: boolean;
  onBookmark: () => void;
  onClose: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onSkip: (seconds: number) => void;
  playbackControls: {
    isAvailable: boolean;
    playbackRate: number;
    setPlaybackRate?: (rate: number) => void;
    skipBy?: (seconds: number) => void;
  };
}>): Partial<Record<BookCinemaKeyboardCommand, () => void>> {
  const actions: Partial<Record<BookCinemaKeyboardCommand, () => void>> = {
    close: onClose,
  };
  if (canBookmark) {
    actions.bookmark = onBookmark;
  }
  if (playbackControls.isAvailable) {
    actions.restart = onRestart;
    actions.togglePlayback = onPlayPause;
  }
  if (playbackControls.skipBy) {
    actions.seekBackward = () => {
      onSkip(-10);
    };
    actions.seekForward = () => {
      onSkip(10);
    };
  }
  const setPlaybackRate = playbackControls.setPlaybackRate;
  if (setPlaybackRate) {
    actions.speedDown = () => {
      setPlaybackRate(nextBookCinemaPlaybackRate(playbackControls.playbackRate, -1));
    };
    actions.speedUp = () => {
      setPlaybackRate(nextBookCinemaPlaybackRate(playbackControls.playbackRate, 1));
    };
  }
  return actions;
}

function bookCinemaJobMatchesScope(
  job: VoiceJob | null,
  book: BookSource,
  scope: BookScope,
): boolean {
  return (
    job?.bookSourceId === book.id && bookScopeKey(job.bookScope ?? scope) === bookScopeKey(scope)
  );
}

function bookCinemaLiveWordIndex(
  cue: HighlightCue | null,
  displayedActiveWordIndex: number,
): number {
  if (cue?.fragmentIndex !== undefined) {
    return -1;
  }
  return displayedActiveWordIndex;
}

export function BookCinemaOverlay({
  accessibilitySettings,
  book,
  canCreateAudio,
  isProcessing,
  job,
  playbackCursorSec,
  playbackControls,
  progress,
  scope,
  scopeContent,
  highlightCue,
  highlightMap,
  textSize,
  themeName,
  onClose,
  onAccessibilitySettingsChange,
  onBookmark,
  onCreateAudio,
  onInspectStructure,
  onPlayPause,
  onRestart,
  onScopeChange,
  onSkip,
  onResumeProgress,
  onTextSizeChange,
  onThemeChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  book: BookSource;
  canCreateAudio: boolean;
  isProcessing: boolean;
  job: VoiceJob | null;
  playbackCursorSec: number;
  progress: PlaybackProgress | null;
  playbackControls: {
    isAvailable: boolean;
    isPlaying: boolean;
    playbackRate: number;
    play: () => void | Promise<void>;
    pause: () => void;
    restart: () => void | Promise<void>;
    setPlaybackRate?: (rate: number) => void;
    skipBy?: (seconds: number) => void;
  };
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  highlightCue: HighlightCue | null;
  highlightMap: HighlightMap | null;
  textSize: BookCinemaTextSize;
  themeName: ThemeName;
  onClose: () => void;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onInspectStructure: (book: BookSource) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onScopeChange: (scope: BookScope) => void;
  onSkip: (seconds: number) => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onTextSizeChange: (size: BookCinemaTextSize) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const normalizedScope = normalizeBookScopeForBook(book, scope);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
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
  const timingActiveWordIndex = highlightCue?.activeWordIndex ?? activeWordIndex;
  const displayedActiveWordIndex = resolveDisplayedBookActiveWordIndex(
    timingActiveWordIndex,
    progress,
  );
  const phraseRange = resolveHighlightPhraseRange(highlightCue);
  const queueOptions = useMemo(() => {
    const narratable = scopeOptions.filter(
      (option) => option.isNarratable && (option.wordCount ?? 0) > 0,
    );
    return narratable.length > 0 ? narratable : scopeOptions;
  }, [scopeOptions]);
  const activeJobMatchesBook = bookCinemaJobMatchesScope(job, book, normalizedScope);
  const isCancelledBookJob = activeJobMatchesBook && job?.status === "cancelled";
  const bookmarks = progress?.bookmarks ?? [];
  const progressPercent = progress ? formatProgressPercent(progress.progress) : "0%";
  const canBookmark = activeJobMatchesBook && playbackControls.isAvailable;
  const policyNotes = useMemo(() => bookCinemaPolicyNotes(scopeContent), [scopeContent]);
  const liveAnnouncementWordIndex = bookCinemaLiveWordIndex(highlightCue, displayedActiveWordIndex);
  const liveAnnouncement = useMemo(
    () =>
      bookCinemaLiveAnnouncement({
        activeWordIndex: liveAnnouncementWordIndex,
        book,
        fragmentIndex: highlightCue?.fragmentIndex,
        scope: normalizedScope,
      }),
    [book, highlightCue?.fragmentIndex, liveAnnouncementWordIndex, normalizedScope],
  );

  useBookCinemaKeyboardControls({
    canBookmark,
    onBookmark,
    onClose,
    onPlayPause,
    onRestart,
    onSkip,
    playbackControls,
  });

  return (
    <div
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col"
      data-reader-highlight={normalizedAccessibility.highContrast ? "high-contrast" : "standard"}
      data-reader-motion={normalizedAccessibility.reducedMotion ? "reduced" : "standard"}
      data-theme={themeName}
      role="dialog"
    >
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>
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
            onClick={() => {
              onInspectStructure(book);
            }}
            type="button"
          >
            Inspect structure
          </button>
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
          activeWordIndex={displayedActiveWordIndex}
          book={book}
          scope={normalizedScope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          textSize={textSize}
          phraseWordEnd={phraseRange.end}
          phraseWordStart={phraseRange.start}
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
            {progress ? (
              <BookCinemaResumeButton progress={progress} onResumeProgress={onResumeProgress} />
            ) : null}
            <button
              className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white shadow-lg shadow-orange-500/30 disabled:opacity-50 vs-accent-bg"
              disabled={!playbackControls.isAvailable}
              onClick={onPlayPause}
              aria-keyshortcuts="Space K"
              type="button"
            >
              {playbackControls.isPlaying ? <CinemaPauseIcon /> : <CinemaPlayIcon />}
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
                aria-keyshortcuts="B"
                type="button"
              >
                Bookmark
              </button>
            </div>
            <BookCinemaPlaybackRateControls
              playbackRate={playbackControls.playbackRate}
              setPlaybackRate={playbackControls.setPlaybackRate}
            />
          </div>
          <BookCinemaTimingDebug
            cursorSec={playbackCursorSec}
            highlightCue={highlightCue}
            highlightMap={highlightMap}
          />
          <BookCinemaPolicyNotes notes={policyNotes} />
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
            aria-keyshortcuts="Home"
            type="button"
          >
            Restart
          </button>
          {progress ? (
            <button
              className="h-10 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-sm font-semibold text-orange-500 lg:hidden"
              onClick={() => {
                onResumeProgress(progress);
              }}
              type="button"
            >
              Resume saved
            </button>
          ) : null}
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!playbackControls.skipBy}
            onClick={() => {
              onSkip(-10);
            }}
            aria-keyshortcuts="ArrowLeft J"
            type="button"
          >
            -10s
          </button>
          <button
            className="h-12 min-w-28 rounded-full px-6 text-base font-semibold text-white shadow-lg shadow-orange-500/25 disabled:opacity-50 vs-accent-bg"
            disabled={!playbackControls.isAvailable}
            onClick={onPlayPause}
            aria-keyshortcuts="Space K"
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
            aria-keyshortcuts="ArrowRight L"
            type="button"
          >
            +10s
          </button>
          <select
            aria-label="Playback speed"
            className="h-10 rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-semibold outline-none disabled:opacity-40 vs-border"
            disabled={!playbackControls.setPlaybackRate}
            onChange={(event) => {
              playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
            }}
            value={String(playbackControls.playbackRate)}
          >
            {BOOK_CINEMA_PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(rate === 1 ? 0 : 2)}x
              </option>
            ))}
          </select>
          <BookCinemaAccessibilityControls
            settings={normalizedAccessibility}
            onChange={onAccessibilitySettingsChange}
          />
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
            {VOICE_STUDIO_THEMES.map((theme) => (
              <option key={theme.name} value={theme.name}>
                {theme.label}
              </option>
            ))}
          </select>
          <button
            className="h-10 rounded-md border px-4 text-sm font-semibold disabled:opacity-40 vs-border"
            disabled={!canBookmark}
            onClick={onBookmark}
            aria-keyshortcuts="B"
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

function BookCinemaResumeButton({
  progress,
  onResumeProgress,
}: Readonly<{
  progress: PlaybackProgress;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
}>) {
  return (
    <button
      className="mt-4 flex w-full min-w-0 items-center justify-between gap-3 rounded-md bg-orange-500/10 px-3 py-2 text-left text-xs text-orange-500 transition hover:bg-orange-500/15"
      onClick={() => {
        onResumeProgress(progress);
      }}
      type="button"
    >
      <span className="min-w-0">
        <span className="block font-semibold">Resume saved point</span>
        <span className="vs-muted mt-1 block truncate">
          {formatProgressPercent(progress.progress)} ·{" "}
          {formatEstimatedDuration(progress.currentTimeSec * 1000)}
        </span>
      </span>
      <span className="shrink-0 font-semibold">Resume</span>
    </button>
  );
}

function BookCinemaTimingDebug({
  cursorSec,
  highlightCue,
  highlightMap,
}: Readonly<{
  cursorSec: number;
  highlightCue: HighlightCue | null;
  highlightMap: HighlightMap | null;
}>) {
  if (!highlightMap) {
    return null;
  }
  const summary = highlightMap.summary;
  return (
    <div className="mt-4 rounded-lg border p-4 text-xs vs-border">
      <div className="flex items-center justify-between gap-3">
        <p className="vs-muted font-semibold uppercase tracking-[0.2em]">Timing</p>
        <span className="font-semibold text-orange-500">{summary.mode}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        <dt className="vs-muted">Clock</dt>
        <dd className="truncate text-right">{formatEstimatedDuration(cursorSec * 1000)}</dd>
        <dt className="vs-muted">Token</dt>
        <dd className="truncate text-right">{highlightCue?.tokenIndex ?? "phrase"}</dd>
        <dt className="vs-muted">Locator</dt>
        <dd className="truncate text-right">
          {highlightCue?.readingPosition?.activeWordIndex ?? "-"}
        </dd>
        <dt className="vs-muted">Source</dt>
        <dd className="truncate text-right">{summary.source}</dd>
        <dt className="vs-muted">Confidence</dt>
        <dd className="truncate text-right">{Math.round(summary.confidence.overall * 100)}%</dd>
        <dt className="vs-muted">Drift</dt>
        <dd className="truncate text-right">{summary.drift.maxAbsoluteMs}ms</dd>
      </dl>
    </div>
  );
}

function BookCinemaPolicyNotes({ notes }: Readonly<{ notes: BookCinemaPolicyNote[] }>) {
  if (notes.length === 0) {
    return null;
  }
  return (
    <div className="mt-4 rounded-lg border p-4 vs-border">
      <div className="flex items-center justify-between gap-3">
        <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">Policy Notes</p>
        <span className="text-xs font-semibold text-orange-500">{String(notes.length)}</span>
      </div>
      <div className="mt-3 grid gap-2">
        {notes.slice(0, 6).map((note) => (
          <article className="rounded-md border px-3 py-2 text-xs vs-border" key={note.id}>
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="truncate font-semibold" title={note.title}>
                {note.title}
              </p>
              <span className="shrink-0 rounded-full border px-2 py-0.5 text-[0.68rem] vs-border">
                {formatPolicyModeLabel(note.mode)}
              </span>
            </div>
            <p className="vs-muted mt-1 leading-5">{note.explanation}</p>
            {note.text ? (
              <p className="mt-2 line-clamp-2 text-[0.7rem] leading-5" title={note.text}>
                {note.text}
              </p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

function BookCinemaAccessibilityControls({
  settings,
  onChange,
}: Readonly<{
  settings: ReaderAccessibilitySettings;
  onChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReaderToggle
        checked={settings.reducedMotion}
        label="Reduced motion"
        onChange={(checked) => {
          onChange({ ...settings, reducedMotion: checked });
        }}
      />
      <ReaderToggle
        checked={settings.highContrast}
        label="High contrast"
        onChange={(checked) => {
          onChange({ ...settings, highContrast: checked });
        }}
      />
    </div>
  );
}

function ReaderToggle({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: (checked: boolean) => void }>) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-semibold vs-border">
      <input
        checked={checked}
        className="h-4 w-4 accent-orange-600"
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

function CinemaPlayIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5 translate-x-px" fill="none" viewBox="0 0 24 24">
      <path d="M8 5.8v12.4L18.4 12 8 5.8Z" fill="currentColor" />
    </svg>
  );
}

function CinemaPauseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect fill="currentColor" height="13" rx="1.4" width="4" x="7" y="5.5" />
      <rect fill="currentColor" height="13" rx="1.4" width="4" x="13" y="5.5" />
    </svg>
  );
}

function BookCinemaPlaybackRateControls({
  playbackRate,
  setPlaybackRate,
}: Readonly<{
  playbackRate: number;
  setPlaybackRate?: (rate: number) => void;
}>) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-1.5">
      {BOOK_CINEMA_PLAYBACK_RATES.map((rate) => (
        <button
          className={`rounded border px-2 py-1 text-xs font-semibold ${
            Math.abs(playbackRate - rate) < 0.01
              ? "border-orange-400 bg-orange-500/10 text-orange-500"
              : "vs-border"
          }`}
          disabled={!setPlaybackRate}
          key={rate}
          onClick={() => {
            setPlaybackRate?.(rate);
          }}
          type="button"
        >
          {rate.toFixed(rate === 1 ? 0 : 2)}x
        </button>
      ))}
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
  phraseWordEnd,
  phraseWordStart,
  onTextSizeChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  textSize: BookCinemaTextSize;
  phraseWordEnd?: number;
  phraseWordStart?: number;
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
              phraseWordEnd={phraseWordEnd}
              phraseWordStart={phraseWordStart}
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
              phraseWordEnd={phraseWordEnd}
              phraseWordStart={phraseWordStart}
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
  phraseWordEnd,
  phraseWordStart,
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
  phraseWordEnd?: number;
  phraseWordStart?: number;
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
                className={bookWordClassName(
                  span.index,
                  activeWordIndex,
                  phraseWordStart,
                  phraseWordEnd,
                )}
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
  const parts = [bookSourceName(book), bookScopeLabel(scope)];
  if (fragmentIndex !== undefined && fragmentIndex >= 0) {
    parts.push(`Fragment ${String(fragmentIndex + 1)}`);
  } else if (activeWordIndex >= 0) {
    parts.push(`Word ${String(activeWordIndex + 1)}`);
  } else {
    parts.push("Ready");
  }
  return parts.join(". ");
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

function formatPolicyModeLabel(value: string): string {
  if (value === "rowLinear") {
    return "Row linear";
  }
  if (value === "syntaxAware") {
    return "Syntax aware";
  }
  if (value === "literalsafe") {
    return "Literal safe";
  }
  if (value === "altFirst") {
    return "Alt first";
  }
  if (value === "describeShort") {
    return "Describe short";
  }
  if (value === "describeLong") {
    return "Describe long";
  }
  if (value === "onDemand") {
    return "On demand";
  }
  if (value === "rowAndColumn") {
    return "Row and column";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
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

function resolveHighlightPhraseRange(cue: HighlightCue | null): {
  end?: number;
  start?: number;
} {
  if (cue?.mode !== "phrase") {
    return {};
  }
  return {
    end: cue.phraseWordEnd,
    start: cue.phraseWordStart,
  };
}

function bookWordClassName(
  index: number,
  activeWordIndex: number,
  phraseWordStart?: number,
  phraseWordEnd?: number,
): string {
  if (
    phraseWordStart !== undefined &&
    phraseWordEnd !== undefined &&
    index >= phraseWordStart &&
    index <= phraseWordEnd
  ) {
    return "book-cinema-word-phrase";
  }
  return index === activeWordIndex ? "book-cinema-word-active" : "";
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
    body: "Main sections",
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
    return "Create Scope Audio";
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
  if ((book.kind === "docx" || book.kind === "html") && (book.sections ?? []).length > 0) {
    return `${(book.sections ?? []).length.toLocaleString()} sections · ${book.wordCount.toLocaleString()} words`;
  }
  if (book.chapterCount > 0) {
    return `${book.chapterCount.toLocaleString()} chapters · ${book.wordCount.toLocaleString()} words`;
  }
  if (book.pageCount > 0) {
    return `${book.pageCount.toLocaleString()} pages · ${book.wordCount.toLocaleString()} words`;
  }
  return `${book.wordCount.toLocaleString()} words`;
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

function isImageBookSource(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return ["png", "jpg", "jpeg", "tif", "tiff", "bmp", "webp"].includes(extension);
}

function isBookSourceExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
    "docx",
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

function formatAdapterDiagnostics(diagnostics: BookCinemaDiagnostics | null): string {
  const adapters = diagnostics?.adapters;
  if (!adapters) {
    return "checking";
  }
  const available = Object.values(adapters)
    .filter((adapter) => adapter.available)
    .map((adapter) => adapter.adapterId.toUpperCase());
  return available.length > 0 ? available.join(", ") : "unavailable";
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
