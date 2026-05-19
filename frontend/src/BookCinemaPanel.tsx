import {
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ReaderAccessibilityControls } from "./components/reader/ReaderAccessibilityControls";
import {
  BOOK_SOURCE_ACCEPT,
  bookCinemaLiveAnnouncement,
  bookCinemaPolicyNotes,
  bookScopeKey,
  bookScopeLabel,
  bookScopeOptions,
  bookScopeSpans,
  bookScopeText,
  bookSourceName,
  isSupportedBookSourceBatch,
  normalizeBookScopeForBook,
  paginateBookSpans,
  resolveBookActiveWordIndex,
  resolveDefaultBookScope,
  resolveDisplayedBookActiveWordIndex,
  visibleBookSpans,
  type BookCinemaPolicyNote,
  type BookPage,
  type BookPaginationResult,
  type BookScopeOption,
} from "./bookCinemaModel";
import {
  ReaderWayfindingPanel,
  playbackProgressForBookmark,
  readerBookmarksFromProgress,
  readerOutlineFromBookScopes,
  readerRecentPositionsFromProgress,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "./features/reader-navigation";
import { PolicyScopeChips, SourcePolicyPinEditor } from "./features/policy";
import {
  READER_LINE_HEIGHT_RATIO,
  READER_MEASURE_CLASS,
  READER_PLAYBACK_RATES,
  READER_TEXT_SCALE_FONT_PX,
  normalizeReaderAccessibilitySettings,
  readerDataAttributes,
  useReaderKeyboardControls,
  useReaderModalLifecycle,
  type ReaderAccessibilitySettings,
  type ReaderKeyboardCommand,
  type ReaderTextScale,
} from "./features/reader-accessibility";
import {
  recordFrontendDegradedState,
  resolveTimingConfidenceDisplay,
} from "./features/performance";
import { useAudioWaveformBars } from "./audioWaveform";
import type {
  BookCinemaDiagnostics,
  BookImportProfile,
  BookScope,
  BookSource,
  BookSourceImportOptions,
  BookSourceScopeContent,
  BookSourceWordSpan,
  CustomSpeechPolicyProfile,
  HighlightMap,
  NarrationBlock,
  PDFTableMode,
  PlaybackProgress,
  SourceSpeechPolicyUpdateRequest,
  SpeechPolicyDefinition,
  SpeechPolicyOverrides,
  SpeechPolicyProfile,
  ThemeName,
  VoiceJob,
} from "./types";
import type { HighlightCue } from "./highlightMap";

const BOOK_PAGE_VERTICAL_PADDING = 108;
const BOOK_PAGE_HORIZONTAL_PADDING = 76;
const BOOK_PAGE_MIN_WORDS = 18;
const BOOK_PAGE_MAX_WORDS = 128;
const BOOK_PAGE_DEFAULT_WORDS: Record<BookCinemaTextSize, number> = {
  compact: 116,
  comfortable: 98,
  giant: 54,
  large: 76,
};
const LazyBookDocumentReaderStage = lazy(() =>
  import("./features/cinema/BookDocumentReaderStage").then((module) => ({
    default: module.BookDocumentReaderStage,
  })),
);
export {
  BOOK_SOURCE_ACCEPT,
  bookCinemaLiveAnnouncement,
  bookCinemaPolicyNotes,
  bookScopeKey,
  bookScopeLabel,
  bookScopeOptions,
  bookScopeSpans,
  bookScopeText,
  bookSourceName,
  isSupportedBookSource,
  isSupportedBookSourceBatch,
  normalizeBookScopeForBook,
  paginateBookSpans,
  resolveBookActiveWordIndex,
  resolveDefaultBookScope,
  resolveDisplayedBookActiveWordIndex,
  visibleBookSpans,
} from "./bookCinemaModel";
export {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  READER_ACCESSIBILITY_STORAGE_KEY,
  normalizeReaderAccessibilitySettings,
} from "./features/reader-accessibility";
export type {
  BookCinemaPolicyNote,
  BookPage,
  BookPaginationResult,
  BookScopeOption,
} from "./bookCinemaModel";
export type { ReaderAccessibilitySettings } from "./features/reader-accessibility";
export type BookCinemaTextSize = ReaderTextScale;
export type BookCinemaKeyboardCommand = ReaderKeyboardCommand;

type BookCinemaMobilePanel = "narration" | "source" | "structure";

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
            Import EPUB, PDF, DOCX, Markdown, or HTML, pick a scope, then enter Cinema from this
            teleprompter.
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
          {bookCreateLabel(scope, selectedBook)}
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
        EPUB, DOCX, Markdown, HTML, PDFs, scanned documents, and ordered image pages run through
        local IR adapters.
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

// eslint-disable-next-line sonarjs/cognitive-complexity
export function BookCinemaOverlay({
  accessibilitySettings,
  book,
  bookSources,
  canCreateAudio,
  customPolicyProfiles,
  importError,
  isImporting,
  isProcessing,
  isResumeRestoring,
  job,
  playbackCursorSec,
  playbackControls,
  policyDefinition,
  policyError,
  policyOverrides,
  policyProfile,
  policyProfiles,
  progress,
  progressItems,
  scope,
  scopeContent,
  sourcePolicySaving,
  highlightCue,
  highlightMap,
  themeName,
  onClose,
  onAccessibilitySettingsChange,
  onBookmark,
  onCreateAudio,
  onImport,
  onInspectStructure,
  onPlayPause,
  onRestart,
  onScopeChange,
  onSelectBook,
  onSkip,
  onClearSourcePolicy,
  onResumeProgress,
  onSaveSourcePolicy,
  onThemeChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  book: BookSource;
  bookSources: BookSource[];
  canCreateAudio: boolean;
  customPolicyProfiles: CustomSpeechPolicyProfile[];
  importError: string | null;
  isImporting: boolean;
  isProcessing: boolean;
  isResumeRestoring: boolean;
  job: VoiceJob | null;
  playbackCursorSec: number;
  policyDefinition: SpeechPolicyDefinition;
  policyError: string | null;
  policyOverrides: SpeechPolicyOverrides;
  policyProfile: string;
  policyProfiles: SpeechPolicyProfile[];
  progress: PlaybackProgress | null;
  progressItems: PlaybackProgress[];
  sourcePolicySaving: boolean;
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
  themeName: ThemeName;
  onClose: () => void;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  onInspectStructure: (book: BookSource) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
  onSkip: (seconds: number) => void;
  onClearSourcePolicy: () => Promise<void> | void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onSaveSourcePolicy: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const normalizedScope = normalizeBookScopeForBook(book, scope);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mobilePanel, setMobilePanel] = useState<BookCinemaMobilePanel | null>("source");
  const [pointerScopeKey, setPointerScopeKey] = useState<string | null>(null);
  const scopeOptions = useMemo(() => bookScopeOptions(book), [book]);
  const normalizedScopeKey = bookScopeKey(normalizedScope);
  const pointerOption = useMemo(
    () => scopeOptions.find((option) => option.key === pointerScopeKey) ?? null,
    [pointerScopeKey, scopeOptions],
  );
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
  const pointerWordIndex = useMemo(() => {
    if (!pointerOption) {
      return -1;
    }
    return bookScopeSpans(book, pointerOption.scope)[0]?.index ?? -1;
  }, [book, pointerOption]);
  const readerActiveWordIndex = pointerWordIndex >= 0 ? pointerWordIndex : displayedActiveWordIndex;
  const phraseRange = resolveHighlightPhraseRange(highlightCue);
  const queueOptions = useMemo(() => {
    const narratable = scopeOptions.filter(
      (option) => option.isNarratable && (option.wordCount ?? 0) > 0,
    );
    return narratable.length > 0 ? narratable : scopeOptions;
  }, [scopeOptions]);
  const activeJobMatchesBook = bookCinemaJobMatchesScope(job, book, normalizedScope);
  const activeBookJob = activeJobMatchesBook ? job : null;
  const isCancelledBookJob = activeJobMatchesBook && job?.status === "cancelled";
  const bookmarks = progress?.bookmarks ?? [];
  const bookmarkItems = useMemo(() => readerBookmarksFromProgress(progress), [progress]);
  const canBookmark = activeJobMatchesBook && playbackControls.isAvailable;
  const policyNotes = useMemo(() => bookCinemaPolicyNotes(scopeContent), [scopeContent]);
  const activeSpan = scopedSpans.find((span) => span.index === readerActiveWordIndex) ?? null;
  const activeBlock = bookCinemaActiveBlock(scopeContent?.blocks ?? [], activeSpan);
  const activePassage = bookCinemaActivePassage(activeBlock, scopedText);
  const bookSourceLabels = useMemo(
    () => new Map(bookSources.map((source) => [source.id, bookSourceName(source)])),
    [bookSources],
  );
  const recentItems = useMemo(
    () => readerRecentPositionsFromProgress(progressItems, { bookSources: bookSourceLabels }),
    [bookSourceLabels, progressItems],
  );
  const outlineItems = useMemo(
    () => readerOutlineFromBookScopes(scopeOptions, pointerScopeKey ?? normalizedScopeKey),
    [normalizedScopeKey, pointerScopeKey, scopeOptions],
  );
  const hasPlayableAudio = Boolean(activeBookJob && playbackControls.isAvailable);
  const createAudioScope = pointerOption?.scope ?? normalizedScope;
  const playbackTransportIcon = playbackControls.isPlaying ? (
    <CinemaPauseIcon />
  ) : (
    <CinemaPlayIcon />
  );
  const primaryTransportIcon = hasPlayableAudio ? playbackTransportIcon : <AudioCreateIcon />;
  const playbackTransportLabel = playbackControls.isPlaying ? "Pause" : "Play";
  const desktopPrimaryTransportLabel = hasPlayableAudio
    ? playbackTransportLabel
    : bookCreateLabel(createAudioScope, book);
  const mobilePrimaryTransportLabel = hasPlayableAudio ? playbackTransportLabel : "Create Audio";
  const primaryTransportStyle = hasPlayableAudio
    ? "text-white shadow-orange-500/25 vs-accent-bg"
    : "bg-amber-400 text-zinc-950 shadow-amber-500/20";
  const primaryTransportDisabled = hasPlayableAudio
    ? !playbackControls.isAvailable
    : !canCreateAudio || isProcessing || book.status !== "ready";
  const canUseTransportControls = hasPlayableAudio && playbackControls.isAvailable;
  const canUseSkipControls = hasPlayableAudio && Boolean(playbackControls.skipBy);
  const canChangePlaybackRate = hasPlayableAudio && Boolean(playbackControls.setPlaybackRate);
  const displayedPlaybackRate = hasPlayableAudio ? playbackControls.playbackRate : 1;
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
  const timingConfidence = useMemo(
    () => resolveTimingConfidenceDisplay(highlightMap),
    [highlightMap],
  );
  const handleScopeChange = (nextScope: BookScope) => {
    setPointerScopeKey(null);
    onScopeChange(nextScope);
  };
  const handleNavigateToScope = (option: BookScopeOption) => {
    setPointerScopeKey(option.key);
  };
  const handleWayfindingOutlineNavigate = (item: ReaderOutlineItem<BookScope>) => {
    const option = scopeOptions.find((scopeOption) => scopeOption.key === item.id);
    if (option) {
      setPointerScopeKey(option.key);
      onScopeChange(option.scope);
      return;
    }
    setPointerScopeKey(item.id);
  };
  const handleBookmarkNavigate = (bookmark: ReaderBookmarkItem) => {
    if (!progress) {
      return;
    }
    onResumeProgress(playbackProgressForBookmark(progress, bookmark), bookmark.currentTimeSec);
  };
  const handleRecentNavigate = (item: ReaderRecentPositionItem) => {
    onResumeProgress(item.progressItem, item.currentTimeSec);
  };

  useReaderKeyboardControls({
    canBookmark,
    onBookmark,
    onClose,
    onPlayPause,
    onRestart,
    onSkip,
    playbackControls,
  });

  useReaderModalLifecycle(dialogRef, { closeOnEscape: false });

  useEffect(() => {
    if (book.id || normalizedScopeKey) {
      setPointerScopeKey(null);
    }
  }, [book.id, normalizedScopeKey]);

  useEffect(() => {
    if (!highlightMap) {
      return;
    }
    if (highlightMap.summary.lowConfidence) {
      recordFrontendDegradedState(
        "low-confidence-highlight",
        book.kind === "markdown" ? "document-cinema" : "book-cinema",
        {
          jobId: highlightMap.jobId,
          reason: highlightMap.summary.reason ?? null,
          source: highlightMap.summary.source,
        },
      );
    }
    if (highlightMap.summary.mode === "phrase" || highlightMap.mode === "phrase") {
      recordFrontendDegradedState(
        "phrase-fallback",
        book.kind === "markdown" ? "document-cinema" : "book-cinema",
        {
          jobId: highlightMap.jobId,
          lowConfidence: highlightMap.summary.lowConfidence,
          reason: highlightMap.summary.reason ?? null,
        },
      );
    }
  }, [book.kind, highlightMap]);

  return (
    <div
      aria-labelledby="book-cinema-title"
      aria-modal="true"
      className="vs-app fixed inset-0 z-50 flex flex-col"
      {...readerDataAttributes(normalizedAccessibility)}
      data-theme={themeName}
      ref={dialogRef}
      role="dialog"
      tabIndex={-1}
    >
      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {liveAnnouncement}
      </div>
      <header className="relative flex min-h-[4rem] items-center justify-between gap-3 border-b bg-[var(--vs-raised)] px-4 py-2.5 vs-border sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-orange-400/30 bg-orange-500/10 text-orange-400">
            <CinemaFilmIcon />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                className="truncate text-base font-semibold tracking-[-0.01em] text-[var(--vs-text)] sm:text-xl"
                id="book-cinema-title"
                title={bookSourceName(book)}
              >
                {book.kind === "markdown" ? "Document Cinema" : "Book Cinema"}
              </h2>
            </div>
            <p className="hidden" title={bookSourceName(book)}>
              {bookSourceName(book)}
            </p>
          </div>
        </div>
        <BookCinemaStatusChip
          hasPlayableAudio={hasPlayableAudio}
          isPlaying={playbackControls.isPlaying}
          job={activeBookJob}
        />
        {timingConfidence.isDegraded ? (
          <BookCinemaTimingStatusChip display={timingConfidence} />
        ) : null}
        {isResumeRestoring ? <BookCinemaResumeChip /> : null}
        <div className="hidden min-w-0 flex-1 px-4 text-center lg:block">
          <p className="truncate text-sm font-medium" title={bookSourceName(book)}>
            {bookSourceName(book)}
          </p>
          <p className="truncate text-xs vs-muted">{bookScopeLabel(normalizedScope)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="hidden items-center gap-2 text-sm vs-muted md:flex">
            <span>Scope</span>
            <select
              className="h-10 max-w-64 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold text-[var(--vs-text)] outline-none vs-border"
              onChange={(event) => {
                const nextScope = scopeOptions.find(
                  (option) => option.key === event.currentTarget.value,
                )?.scope;
                if (nextScope) {
                  handleScopeChange(nextScope);
                }
              }}
              value={normalizedScopeKey}
            >
              {scopeOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label="Book scope"
            className="hidden h-10 max-w-[9rem] rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-semibold outline-none vs-border"
            onChange={(event) => {
              const nextScope = scopeOptions.find(
                (option) => option.key === event.currentTarget.value,
              )?.scope;
              if (nextScope) {
                handleScopeChange(nextScope);
              }
            }}
            value={normalizedScopeKey}
          >
            {scopeOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            className="hidden h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:inline-flex"
            onClick={() => {
              onThemeChange(themeName === "light" ? "dark" : "light");
            }}
            type="button"
          >
            <SettingsTinyIcon />
            Settings
          </button>
          <button
            className="inline-flex h-10 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:gap-2 sm:px-3"
            onClick={onClose}
            type="button"
          >
            <ExitTinyIcon />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3 lg:grid-cols-[326px_minmax(0,1fr)_362px] lg:gap-5 lg:px-4">
        <aside className="hidden min-h-0 min-w-0 overflow-y-auto pr-1 lg:block">
          <div className="grid gap-3">
            <BookCinemaRailCard title="Source & provenance">
              <BookCinemaSourceLibrary
                book={book}
                bookSources={bookSources}
                importError={importError}
                isImporting={isImporting}
                onImport={onImport}
                onSelectBook={onSelectBook}
              />
              <dl className="grid gap-3 text-sm">
                <MetadataRow label="File" value={book.sourceFile} />
                <MetadataRow label="Type" value={book.kind.toUpperCase()} />
                <MetadataRow label="Size" value={formatBytes(book.sourceBytes)} />
                <MetadataRow label="Imported" value={formatDateTime(book.createdAt)} />
                <MetadataRow
                  label="Structure"
                  value={book.structureVersion ? "Detected" : "Basic"}
                />
              </dl>
              <button
                className="mt-3 h-10 w-full rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
                onClick={() => {
                  onInspectStructure(book);
                }}
                type="button"
              >
                Inspect structure
              </button>
            </BookCinemaRailCard>

            <BookCinemaRailCard title="Extraction health">
              <div className="grid gap-2 text-sm">
                <BookCinemaHealthRow
                  label="Readable text"
                  value={scopedText.trim() ? "Ready" : "Empty"}
                />
                <BookCinemaHealthRow
                  label="Structure"
                  value={
                    scopeContent?.sourceStructureValid || book.structureVersion
                      ? "Detected"
                      : "Basic"
                  }
                />
                <BookCinemaHealthRow
                  label="Scope words"
                  value={`${(scopeContent?.wordCount ?? scopedSpans.length).toLocaleString()} words`}
                />
                <BookCinemaHealthRow
                  label="Audio state"
                  value={hasPlayableAudio ? "Generated" : "Pre-audio"}
                />
              </div>
            </BookCinemaRailCard>

            <ReaderWayfindingPanel
              activeTab="outline"
              bookmarks={bookmarkItems}
              canBookmark={canBookmark}
              maxItems={8}
              outlineItems={outlineItems}
              recentItems={recentItems}
              title="Structure outline"
              onAddBookmark={onBookmark}
              onBookmarkNavigate={handleBookmarkNavigate}
              onOutlineNavigate={handleWayfindingOutlineNavigate}
              onRecentNavigate={handleRecentNavigate}
            />

            <BookCinemaRailCard title="Warnings & skipped content">
              <div className="grid gap-2 text-sm">
                {(scopeContent?.warnings ?? book.warnings ?? []).length > 0 ? (
                  (scopeContent?.warnings ?? book.warnings ?? []).slice(0, 4).map((warning) => (
                    <p
                      className="rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-500"
                      key={warning}
                    >
                      {warning}
                    </p>
                  ))
                ) : (
                  <p className="vs-muted">No structural warnings for this scope.</p>
                )}
                {(scopeContent?.skippedItems ?? []).length > 0 ? (
                  <p className="text-xs vs-muted">
                    {(scopeContent?.skippedItems ?? []).length.toLocaleString()} skipped items are
                    available in policy notes.
                  </p>
                ) : null}
              </div>
            </BookCinemaRailCard>
          </div>
        </aside>

        <BookCinemaReaderStage
          activeWordIndex={readerActiveWordIndex}
          book={book}
          scope={normalizedScope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          scopeContent={scopeContent}
          accessibilitySettings={normalizedAccessibility}
          pointerLabel={pointerOption?.label ?? null}
          phraseWordEnd={phraseRange.end}
          phraseWordStart={phraseRange.start}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
        />

        <aside className="hidden min-h-0 min-w-0 overflow-y-auto pl-1 lg:block">
          <div className="grid gap-3">
            <BookCinemaRailCard title="Current passage">
              <p className="text-sm font-semibold">
                {pointerOption?.label ?? bookScopeLabel(normalizedScope)}
              </p>
              <p className="mt-1 text-xs vs-muted">
                {activeBlock ? `Block ${(activeBlock.index + 1).toString()}` : "Preview start"}
              </p>
              <p className="mt-3 line-clamp-5 text-sm leading-6">
                {activePassage ||
                  "Open the cinema before audio generation to validate the reading view."}
              </p>
            </BookCinemaRailCard>

            <BookCinemaRailCard title="Speech policy">
              <div className="grid gap-3 text-sm">
                <PolicyScopeChips
                  state={{
                    projectProfile: policyProfile,
                    resolvedProfile: activeBlock?.speechPolicy.profile,
                    sessionOverrides: policyOverrides,
                    sourceOverrides: book.sourceSpeechPolicyOverrides,
                    sourceProfile: book.sourceSpeechPolicyProfile,
                  }}
                />
                <MetadataRow label="Generation" value={bookScopeLabel(createAudioScope)} />
                <MetadataRow label="Voice" value={activeBookJob?.voice ?? "Default narrative"} />
                <MetadataRow label="Speed" value={`${playbackControls.playbackRate.toFixed(2)}x`} />
                <MetadataRow
                  label="Policy"
                  value={
                    activeBlock?.speechPolicy.profile ??
                    book.sourceSpeechPolicyProfile ??
                    "Project default"
                  }
                />
                <SourcePolicyPinEditor
                  customProfiles={customPolicyProfiles}
                  definition={policyDefinition}
                  disabled={book.status !== "ready"}
                  error={policyError}
                  isSaving={sourcePolicySaving}
                  profiles={policyProfiles}
                  sourceOverrides={book.sourceSpeechPolicyOverrides}
                  sourceProfile={book.sourceSpeechPolicyProfile}
                  onClear={onClearSourcePolicy}
                  onSave={onSaveSourcePolicy}
                />
              </div>
            </BookCinemaRailCard>

            <BookCinemaRailCard title="Generated audio health">
              <div className="grid gap-2 text-sm">
                <BookCinemaHealthRow
                  label="Audio"
                  value={hasPlayableAudio ? "Generated" : "Not generated"}
                />
                <BookCinemaHealthRow
                  label="Job status"
                  value={activeBookJob?.status ?? "Pre-audio"}
                />
                <BookCinemaHealthRow
                  label="Alignment"
                  value={highlightMap ? "Mapped" : "Pending"}
                />
                <BookCinemaHealthRow label="Bookmarks" value={bookmarks.length.toLocaleString()} />
              </div>
            </BookCinemaRailCard>

            <BookCinemaPolicyNotes notes={policyNotes} />

            <ReaderWayfindingPanel
              bookmarks={bookmarkItems}
              canBookmark={canBookmark}
              maxItems={6}
              outlineItems={outlineItems}
              recentItems={recentItems}
              onAddBookmark={onBookmark}
              onBookmarkNavigate={handleBookmarkNavigate}
              onOutlineNavigate={handleWayfindingOutlineNavigate}
              onRecentNavigate={handleRecentNavigate}
            />

            <BookCinemaRailCard title="Section queue">
              <BookCinemaScopeQueue
                activeScope={normalizedScope}
                maxItems={6}
                options={queueOptions}
                pointerScopeKey={pointerScopeKey}
                onNavigate={handleNavigateToScope}
              />
            </BookCinemaRailCard>

            {progress ? (
              <BookCinemaResumeButton progress={progress} onResumeProgress={onResumeProgress} />
            ) : null}

            <BookCinemaTimingDebug
              cursorSec={playbackCursorSec}
              highlightCue={highlightCue}
              highlightMap={highlightMap}
            />
          </div>
        </aside>
      </main>
      <BookCinemaMobileSheet
        activePassage={activePassage}
        activeScope={normalizedScope}
        book={book}
        bookSources={bookSources}
        hasPlayableAudio={hasPlayableAudio}
        importError={importError}
        isImporting={isImporting}
        mobilePanel={mobilePanel}
        bookmarkItems={bookmarkItems}
        outlineItems={outlineItems}
        progress={progress}
        recentItems={recentItems}
        scopeContent={scopeContent}
        canBookmark={canBookmark}
        onAddBookmark={onBookmark}
        onBookmarkNavigate={handleBookmarkNavigate}
        onImport={onImport}
        onInspectStructure={onInspectStructure}
        onMobilePanelChange={setMobilePanel}
        onSelectBook={onSelectBook}
        onResumeProgress={onResumeProgress}
        onRecentNavigate={handleRecentNavigate}
        onOutlineNavigate={handleWayfindingOutlineNavigate}
      />

      <footer className="border-t bg-[var(--vs-raised)] px-4 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.18)] vs-border lg:px-7">
        <div className="hidden items-center gap-5 lg:flex">
          <button
            className="inline-flex h-12 items-center gap-2 rounded-md border px-4 text-sm font-medium transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={!canUseTransportControls}
            onClick={onRestart}
            aria-keyshortcuts="Home"
            type="button"
          >
            <RestartTinyIcon />
            Restart
          </button>
          <button
            className="grid h-12 w-14 place-items-center rounded-md border transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={!canUseSkipControls}
            onClick={() => {
              onSkip(-10);
            }}
            aria-label="Back 10 seconds"
            aria-keyshortcuts="ArrowLeft J"
            type="button"
          >
            <SkipBackTinyIcon />
          </button>
          <button
            className={`inline-flex h-16 min-w-40 items-center justify-center gap-3 rounded-full px-6 text-base font-semibold shadow-lg disabled:opacity-50 ${primaryTransportStyle}`}
            disabled={primaryTransportDisabled}
            onClick={() => {
              if (hasPlayableAudio) {
                onPlayPause();
              } else {
                onCreateAudio(book, createAudioScope);
              }
            }}
            aria-keyshortcuts="Space K"
            type="button"
          >
            {primaryTransportIcon}
            {desktopPrimaryTransportLabel}
          </button>
          <button
            className="grid h-12 w-14 place-items-center rounded-md border transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={!canUseSkipControls}
            onClick={() => {
              onSkip(10);
            }}
            aria-label="Forward 10 seconds"
            aria-keyshortcuts="ArrowRight L"
            type="button"
          >
            <SkipForwardTinyIcon />
          </button>
          <div className="min-w-0 flex-1">
            {activeBookJob ? (
              <BookCinemaWaveform
                audioUrl={activeBookJob.audioUrl}
                progress={progress?.progress ?? 0}
              />
            ) : (
              <BookCinemaWaveformPlaceholder />
            )}
            <div className="mt-1 flex items-center justify-between text-xs tabular-nums vs-muted">
              <span>
                {progress ? formatEstimatedDuration(progress.currentTimeSec * 1000) : "0:00"}
              </span>
              <span>{formatEstimatedDuration(scopeContent?.estimatedDurationMs)}</span>
            </div>
          </div>
          <select
            aria-label="Playback speed"
            className="h-12 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold outline-none disabled:opacity-40 vs-border"
            disabled={!canChangePlaybackRate}
            onChange={(event) => {
              playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
            }}
            value={String(displayedPlaybackRate)}
          >
            {READER_PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate.toFixed(rate === 1 ? 0 : 2)}x
              </option>
            ))}
          </select>
          <button
            className="h-12 rounded-md border px-4 text-sm font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-40 vs-border"
            disabled={!canBookmark}
            onClick={onBookmark}
            aria-keyshortcuts="B"
            type="button"
          >
            Bookmark
          </button>
          <ReaderAccessibilityControls
            settings={normalizedAccessibility}
            onChange={onAccessibilitySettingsChange}
          />
        </div>

        <div className="grid gap-3 lg:hidden">
          <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-sm tabular-nums vs-muted">
            <span>
              {progress ? formatEstimatedDuration(progress.currentTimeSec * 1000) : "0:00"}
            </span>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--vs-surface)]">
              <div
                className="h-full rounded-full vs-accent-bg"
                style={{
                  width: progress ? `${Math.round(progress.progress * 100).toString()}%` : "0%",
                }}
              />
            </div>
            <span className="text-right">
              {formatEstimatedDuration(scopeContent?.estimatedDurationMs)}
            </span>
          </div>
          <div className="grid grid-cols-5 items-center gap-2">
            <IconBookTransportButton
              disabled={!canUseSkipControls}
              label="Back"
              onClick={() => {
                onSkip(-10);
              }}
            >
              <SkipBackTinyIcon />
            </IconBookTransportButton>
            <button
              className={`col-span-2 inline-flex h-16 items-center justify-center gap-3 rounded-md px-4 text-base font-semibold shadow-lg disabled:opacity-50 ${primaryTransportStyle}`}
              disabled={primaryTransportDisabled}
              onClick={() => {
                if (hasPlayableAudio) {
                  onPlayPause();
                } else {
                  onCreateAudio(book, createAudioScope);
                }
              }}
              type="button"
            >
              {primaryTransportIcon}
              <span>{mobilePrimaryTransportLabel}</span>
            </button>
            <IconBookTransportButton
              disabled={!canUseSkipControls}
              label="Forward"
              onClick={() => {
                onSkip(10);
              }}
            >
              <SkipForwardTinyIcon />
            </IconBookTransportButton>
            <IconBookTransportButton
              label="More"
              onClick={() => {
                setMobilePanel((current) => (current ? null : "source"));
              }}
            >
              <MoreTinyIcon />
            </IconBookTransportButton>
          </div>
          <div className="flex items-center justify-center gap-2">
            <select
              aria-label="Playback speed"
              className="h-8 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-medium outline-none disabled:opacity-40 vs-border"
              disabled={!canChangePlaybackRate}
              onChange={(event) => {
                playbackControls.setPlaybackRate?.(Number(event.currentTarget.value));
              }}
              value={String(displayedPlaybackRate)}
            >
              {READER_PLAYBACK_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate.toFixed(rate === 1 ? 0 : 2)}x Speed
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="hidden">
          <button
            className="h-10 rounded-md px-4 text-sm font-semibold text-white disabled:opacity-50 vs-accent-bg"
            disabled={!canCreateAudio || isProcessing || book.status !== "ready"}
            onClick={() => {
              onCreateAudio(book, createAudioScope);
            }}
            type="button"
          >
            {isCancelledBookJob
              ? `${bookCreateLabel(createAudioScope, book)} Again`
              : bookCreateLabel(createAudioScope, book)}
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

function BookCinemaRailCard({ children, title }: Readonly<{ children: ReactNode; title: string }>) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border bg-[var(--vs-raised)] p-3 shadow-sm vs-border">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function BookCinemaSourceLibrary({
  book,
  bookSources,
  importError,
  isImporting,
  onImport,
  onSelectBook,
}: Readonly<{
  book: BookSource;
  bookSources: BookSource[];
  importError: string | null;
  isImporting: boolean;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  onSelectBook: (bookId: string) => void;
}>) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="mb-4 grid gap-2 border-b pb-3 vs-border">
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Cinema source</span>
        <select
          aria-label="Cinema source"
          className="h-9 min-w-0 rounded-md border bg-[var(--vs-raised)] px-2 text-sm font-medium outline-none vs-border"
          onChange={(event) => {
            onSelectBook(event.currentTarget.value);
          }}
          value={book.id}
        >
          {bookSources.map((source, index) => (
            <option key={`${source.id}-${String(index)}`} value={source.id}>
              {bookSourceName(source)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex min-w-0 items-center gap-2">
        <button
          className="h-9 min-w-0 flex-1 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
          disabled={isImporting}
          onClick={() => {
            inputRef.current?.click();
          }}
          type="button"
        >
          {isImporting ? "Processing..." : "Select file"}
        </button>
        <input
          accept={BOOK_SOURCE_ACCEPT}
          aria-label="Cinema source files"
          className="sr-only"
          multiple
          onChange={(event) => {
            const files = event.currentTarget.files ? [...event.currentTarget.files] : [];
            event.currentTarget.value = "";
            if (files.length > 0) {
              void onImport(files, { importProfile: "auto", pdfTableMode: "auto" });
            }
          }}
          ref={inputRef}
          type="file"
        />
      </div>
      {importError ? (
        <p className="rounded border border-amber-400/30 bg-amber-500/10 px-2 py-1.5 text-xs leading-5 text-amber-500">
          {importError}
        </p>
      ) : null}
    </div>
  );
}

function MetadataRow({ label, value }: Readonly<{ label: string; value: string | number }>) {
  const text = String(value);
  return (
    <div className="grid min-w-0 grid-cols-[5.8rem_minmax(0,1fr)] gap-3">
      <dt className="vs-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium leading-5" title={text}>
        {text}
      </dd>
    </div>
  );
}

function BookCinemaHealthRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <CheckTinyIcon />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-right font-medium text-emerald-500">{value}</span>
    </div>
  );
}

function BookCinemaScopeQueue({
  activeScope,
  maxItems,
  options,
  pointerScopeKey,
  onNavigate,
}: Readonly<{
  activeScope: BookScope;
  maxItems: number;
  options: BookScopeOption[];
  pointerScopeKey?: string | null;
  onNavigate: (option: BookScopeOption) => void;
}>) {
  if (options.length === 0) {
    return <p className="text-sm vs-muted">No sections detected.</p>;
  }
  return (
    <ol className="grid gap-1 text-sm">
      {options.slice(0, maxItems).map((option, index) => {
        const activeKey = pointerScopeKey ?? bookScopeKey(activeScope);
        const active = option.key === activeKey;
        return (
          <li key={option.key}>
            <button
              className={`grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded px-2 py-1.5 text-left transition hover:bg-[var(--vs-surface)] ${
                active ? "bg-orange-500/10 text-orange-500" : ""
              }`}
              onClick={() => {
                onNavigate(option);
              }}
              type="button"
            >
              <span className="tabular-nums vs-muted">{String(index + 1)}</span>
              <span className="min-w-0 truncate font-medium">{option.label}</span>
              <span className="text-xs vs-muted">{(option.wordCount ?? 0).toLocaleString()}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function BookCinemaWaveform({
  audioUrl,
  progress,
}: Readonly<{ audioUrl: string; progress: number }>) {
  const bars = useAudioWaveformBars(audioUrl, 86);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  if (!bars) {
    return <BookCinemaWaveformPlaceholder label="Loading audio waveform..." />;
  }
  if (bars.length === 0) {
    return <BookCinemaWaveformPlaceholder label="Waveform unavailable for this audio." />;
  }
  return (
    <div aria-hidden="true" className="flex h-12 min-w-0 items-center gap-[2px]">
      {bars.map((amplitude, index) => (
        <span
          className={`w-[2px] rounded-full ${
            index / bars.length <= clampedProgress ? "bg-orange-500" : "bg-zinc-500/35"
          }`}
          key={`${audioUrl}-${index.toString()}`}
          style={{ height: `${String(8 + Math.round(amplitude * 34))}px` }}
        />
      ))}
    </div>
  );
}

function BookCinemaWaveformPlaceholder({
  label = "Audio waveform appears after generation.",
}: Readonly<{ label?: string }>) {
  return (
    <div className="flex h-12 min-w-0 items-center rounded-md border border-dashed px-4 text-xs font-medium vs-border vs-muted">
      {label}
    </div>
  );
}

function BookCinemaMobileSheet({
  activePassage,
  activeScope,
  book,
  bookSources,
  hasPlayableAudio,
  importError,
  isImporting,
  mobilePanel,
  bookmarkItems,
  canBookmark,
  outlineItems,
  progress,
  recentItems,
  scopeContent,
  onAddBookmark,
  onBookmarkNavigate,
  onImport,
  onInspectStructure,
  onMobilePanelChange,
  onOutlineNavigate,
  onRecentNavigate,
  onSelectBook,
  onResumeProgress,
}: Readonly<{
  activePassage: string;
  activeScope: BookScope;
  book: BookSource;
  bookSources: BookSource[];
  bookmarkItems: ReaderBookmarkItem[];
  canBookmark: boolean;
  hasPlayableAudio: boolean;
  importError: string | null;
  isImporting: boolean;
  mobilePanel: BookCinemaMobilePanel | null;
  outlineItems: ReaderOutlineItem<BookScope>[];
  progress: PlaybackProgress | null;
  recentItems: ReaderRecentPositionItem[];
  scopeContent: BookSourceScopeContent | null;
  onAddBookmark: () => void;
  onBookmarkNavigate: (bookmark: ReaderBookmarkItem) => void;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  onInspectStructure: (book: BookSource) => void;
  onMobilePanelChange: (panel: BookCinemaMobilePanel | null) => void;
  onOutlineNavigate: (item: ReaderOutlineItem<BookScope>) => void;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
  onSelectBook: (bookId: string) => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
}>) {
  if (!mobilePanel) {
    return null;
  }
  return (
    <section className="fixed inset-x-0 bottom-[8.75rem] z-[55] max-h-[42vh] overflow-y-auto rounded-t-2xl border bg-[var(--vs-raised)] px-4 pb-5 pt-3 shadow-2xl vs-border lg:hidden">
      <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-zinc-500/50" />
      <div className="mb-4 grid grid-cols-3 border-b text-sm font-semibold vs-border">
        {(["source", "structure", "narration"] as const).map((panel) => (
          <button
            className={`border-b-2 px-2 pb-3 ${
              mobilePanel === panel
                ? "border-orange-500 text-orange-500"
                : "border-transparent vs-muted"
            }`}
            key={panel}
            onClick={() => {
              onMobilePanelChange(panel);
            }}
            type="button"
          >
            {bookCinemaMobilePanelLabel(panel)}
          </button>
        ))}
      </div>
      {mobilePanel === "source" ? (
        <div className="grid gap-4 text-sm">
          <BookCinemaRailCard title="Cinema source">
            <BookCinemaSourceLibrary
              book={book}
              bookSources={bookSources}
              importError={importError}
              isImporting={isImporting}
              onImport={onImport}
              onSelectBook={onSelectBook}
            />
          </BookCinemaRailCard>
          <BookCinemaRailCard title="Source & provenance">
            <dl className="grid gap-3">
              <MetadataRow label="File" value={book.sourceFile} />
              <MetadataRow label="Type" value={book.kind.toUpperCase()} />
              <MetadataRow label="Scope" value={bookScopeLabel(activeScope)} />
              <MetadataRow label="Audio" value={hasPlayableAudio ? "Generated" : "Pre-audio"} />
            </dl>
          </BookCinemaRailCard>
          <BookCinemaRailCard title="Extraction health">
            <div className="grid gap-2">
              <BookCinemaHealthRow
                label="Readable text"
                value={scopeContent?.text ? "Ready" : "Empty"}
              />
              <BookCinemaHealthRow
                label="Scope words"
                value={`${(scopeContent?.wordCount ?? book.wordCount).toLocaleString()} words`}
              />
            </div>
          </BookCinemaRailCard>
        </div>
      ) : null}
      {mobilePanel === "structure" ? (
        <div className="grid gap-3 text-sm">
          <ReaderWayfindingPanel
            activeTab="outline"
            bookmarks={bookmarkItems}
            canBookmark={canBookmark}
            maxItems={8}
            outlineItems={outlineItems}
            recentItems={recentItems}
            onAddBookmark={onAddBookmark}
            onBookmarkNavigate={onBookmarkNavigate}
            onOutlineNavigate={onOutlineNavigate}
            onRecentNavigate={onRecentNavigate}
          />
          <button
            className="h-10 rounded-md border px-3 text-sm font-semibold vs-border"
            onClick={() => {
              onInspectStructure(book);
            }}
            type="button"
          >
            Inspect structure
          </button>
        </div>
      ) : null}
      {mobilePanel === "narration" ? (
        <div className="grid gap-3 text-sm">
          <p className="line-clamp-4 leading-6">
            {activePassage ||
              "Audio has not been generated yet. The reader remains ready for validation."}
          </p>
          {progress ? (
            <button
              className="h-10 rounded-md border border-orange-300 bg-orange-500/10 px-3 font-semibold text-orange-500"
              onClick={() => {
                onResumeProgress(progress);
              }}
              type="button"
            >
              Resume saved point
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function bookCinemaMobilePanelLabel(panel: BookCinemaMobilePanel): string {
  if (panel === "source") {
    return "Source";
  }
  if (panel === "structure") {
    return "Structure";
  }
  return "Narration";
}

function IconBookTransportButton({
  children,
  disabled,
  label,
  onClick,
}: Readonly<{
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}>) {
  return (
    <button
      aria-label={label}
      className="grid h-14 place-items-center rounded-md border text-sm font-medium disabled:opacity-35 vs-border"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function BookCinemaStatusChip({
  hasPlayableAudio,
  isPlaying,
  job,
}: Readonly<{ hasPlayableAudio: boolean; isPlaying: boolean; job: VoiceJob | null }>) {
  const label = bookCinemaStatusLabel({ hasPlayableAudio, isPlaying, job });
  const isReady = isPlaying || hasPlayableAudio;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm ${
        isReady
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-500"
          : "border-amber-400/40 bg-amber-500/10 text-amber-500"
      }`}
    >
      {label}
    </span>
  );
}

function bookCinemaStatusLabel({
  hasPlayableAudio,
  isPlaying,
  job,
}: Readonly<{ hasPlayableAudio: boolean; isPlaying: boolean; job: VoiceJob | null }>): string {
  if (isPlaying) {
    return "Playing";
  }
  if (hasPlayableAudio) {
    return "Ready";
  }
  return job?.status ?? "Pre-audio";
}

function BookCinemaTimingStatusChip({
  display,
}: Readonly<{ display: ReturnType<typeof resolveTimingConfidenceDisplay> }>) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 sm:px-3 sm:py-1.5 sm:text-sm"
      title={display.detail}
    >
      {display.label}
    </span>
  );
}

function BookCinemaResumeChip() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-500 sm:px-3 sm:py-1.5 sm:text-sm">
      Restoring saved point
    </span>
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
  const headingId = useId();
  if (notes.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby={headingId} className="mt-4 rounded-lg border p-4 vs-border">
      <div className="flex items-center justify-between gap-3">
        <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]" id={headingId}>
          Policy Notes
        </p>
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
    </section>
  );
}

function AudioCreateIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12h3M10 6v12M14 9v6M18 4v16M21 12h-2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckTinyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-emerald-500"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        clipRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.7a1 1 0 0 0-1.4-1.4L9 10.17 7.7 8.9a1 1 0 1 0-1.4 1.42l2 2a1 1 0 0 0 1.4 0l4-4Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

function CinemaFilmIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <rect height="14" rx="2" stroke="currentColor" strokeWidth="1.8" width="18" x="3" y="5" />
      <path
        d="M8 5v14M16 5v14M3 9h5M16 9h5M3 15h5M16 15h5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="m10.5 9.4 4.2 2.6-4.2 2.6V9.4Z" fill="currentColor" />
    </svg>
  );
}

function ExitTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path
        d="M9 6H5v12h4M14 8l4 4-4 4M18 12H9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function MoreTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
      <path d="M10 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM10 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

function RestartTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68M4 4v4.68h4.68"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SettingsTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SkipBackTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M11 7 6 12l5 5V7ZM18 7l-5 5 5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function SkipForwardTinyIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="m13 7 5 5-5 5V7ZM6 7l5 5-5 5V7Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
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
  scopeContent,
  accessibilitySettings,
  pointerLabel,
  phraseWordEnd,
  phraseWordStart,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  pointerLabel: string | null;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  if (book.kind === "markdown") {
    return (
      <Suspense fallback={<BookDocumentReaderSkeleton book={book} scope={scope} />}>
        <LazyBookDocumentReaderStage
          activeWordIndex={activeWordIndex}
          book={book}
          scope={scope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          scopeContent={scopeContent}
          accessibilitySettings={accessibilitySettings}
          pointerLabel={pointerLabel}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
        />
      </Suspense>
    );
  }
  return (
    <BookPagedReaderStage
      activeWordIndex={activeWordIndex}
      book={book}
      scope={scope}
      scopedSpans={scopedSpans}
      scopedText={scopedText}
      accessibilitySettings={accessibilitySettings}
      phraseWordEnd={phraseWordEnd}
      phraseWordStart={phraseWordStart}
      onAccessibilitySettingsChange={onAccessibilitySettingsChange}
    />
  );
}

function BookPagedReaderStage({
  activeWordIndex,
  book,
  scope,
  scopedSpans,
  scopedText,
  accessibilitySettings,
  phraseWordEnd,
  phraseWordStart,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  accessibilitySettings: ReaderAccessibilitySettings;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const pageMetrics = useBookPageMetrics(accessibilitySettings);
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
    <section className="min-h-0 min-w-0 overflow-hidden">
      <div
        className={`mx-auto flex h-full ${READER_MEASURE_CLASS[accessibilitySettings.measure]} flex-col overflow-hidden rounded-md border bg-[var(--vs-raised)] shadow-sm vs-border`}
      >
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <BookPageHeading book={book} scope={scope} />
          <BookPaginationControls
            accessibilitySettings={accessibilitySettings}
            pagination={pagination}
            onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          />
        </div>
        <div
          className={`book-cinema-spread grid min-h-0 flex-1 overflow-hidden ${
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
              lineHeightRatio={pageMetrics.lineHeightRatio}
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
              lineHeightRatio={pageMetrics.lineHeightRatio}
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
  accessibilitySettings,
  pagination,
  onAccessibilitySettingsChange,
}: Readonly<{
  accessibilitySettings: ReaderAccessibilitySettings;
  pagination: BookPaginationResult;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
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
          onAccessibilitySettingsChange({
            ...accessibilitySettings,
            textScale: decreaseBookTextSize(accessibilitySettings.textScale),
          });
        }}
        type="button"
      >
        A-
      </button>
      <button
        className="h-9 rounded-md border px-3 font-semibold vs-border"
        onClick={() => {
          onAccessibilitySettingsChange({
            ...accessibilitySettings,
            textScale: increaseBookTextSize(accessibilitySettings.textScale),
          });
        }}
        type="button"
      >
        A+
      </button>
    </div>
  );
}

function BookDocumentReaderSkeleton({
  book,
  scope,
}: Readonly<{ book: BookSource; scope: BookScope }>) {
  return (
    <section aria-busy="true" className="min-h-0 min-w-0 overflow-hidden">
      <div className="mx-auto flex h-full max-w-[780px] flex-col overflow-hidden rounded-md border bg-[var(--vs-raised)] shadow-sm vs-border max-lg:max-w-none max-lg:border-0 max-lg:shadow-none">
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <BookPageHeading book={book} scope={scope} />
          <div className="h-9 w-24 rounded-md border border-dashed vs-border" />
        </div>
        <div className="grid min-h-0 flex-1 content-start gap-4 overflow-hidden px-8 py-8 sm:px-12 lg:px-10 xl:px-12">
          <div className="h-7 w-3/4 rounded bg-zinc-500/15" />
          <div className="h-4 w-full rounded bg-zinc-500/10" />
          <div className="h-4 w-11/12 rounded bg-zinc-500/10" />
          <div className="h-4 w-5/6 rounded bg-zinc-500/10" />
          <div className="h-32 rounded-md border border-dashed vs-border" />
        </div>
      </div>
    </section>
  );
}

function BookReaderPage({
  activeWordIndex,
  book,
  fallbackText,
  fontSizePx,
  isActivePage,
  isRightPage = false,
  lineHeightRatio,
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
  lineHeightRatio: number;
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
        style={
          {
            "--book-page-font-size": `${String(fontSizePx)}px`,
            "--book-page-line-height": String(lineHeightRatio),
          } as CSSProperties
        }
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

function useBookPageMetrics(settings: ReaderAccessibilitySettings): {
  fontSizePx: number;
  lineHeightRatio: number;
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
    const baseFontPx = READER_TEXT_SCALE_FONT_PX[settings.textScale];
    const lineHeightRatio = READER_LINE_HEIGHT_RATIO[settings.lineSpacing];
    const lineHeightPx = baseFontPx * lineHeightRatio;
    const averageWordWidthPx = baseFontPx * 3.15;
    const wordsPerLine = Math.max(5, Math.floor(pageWidth / averageWordWidthPx));
    const linesPerPage = Math.max(6, Math.floor(pageHeight / lineHeightPx));
    const estimatedWords = Math.floor(wordsPerLine * linesPerPage * 0.86);
    return {
      fontSizePx: baseFontPx,
      lineHeightRatio,
      pagesPerSpread,
      ref: setElement,
      wordsPerPage: clampNumber(
        Number.isFinite(estimatedWords)
          ? estimatedWords
          : BOOK_PAGE_DEFAULT_WORDS[settings.textScale],
        BOOK_PAGE_MIN_WORDS,
        BOOK_PAGE_MAX_WORDS,
      ),
    };
  }, [settings.lineSpacing, settings.textScale, size.height, size.width]);
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

function bookCinemaActiveBlock(
  blocks: NarrationBlock[],
  activeSpan: BookSourceWordSpan | null,
): NarrationBlock | null {
  if (blocks.length === 0) {
    return null;
  }
  if (!activeSpan) {
    return blocks.find((block) => block.speakMode !== "skip") ?? blocks[0];
  }
  return (
    blocks.find(
      (block) =>
        activeSpan.startOffset >= block.startOffset && activeSpan.startOffset <= block.endOffset,
    ) ??
    blocks.find((block) => block.speakMode !== "skip") ??
    blocks[0]
  );
}

function bookCinemaActivePassage(activeBlock: NarrationBlock | null, fallbackText: string): string {
  const text = stringsFirstNonEmpty(activeBlock?.spokenText, activeBlock?.text, fallbackText);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
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

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function stringsFirstNonEmpty(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
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
    "full",
    "body",
    "pages",
    "frontmatter",
    "appendix",
    "backmatter",
  ];
  return order
    .map((group) => ({
      key: group,
      label: labels[group],
      options: options.filter((option) => option.group === group),
    }))
    .filter((group) => group.options.length > 0);
}

function bookCreateLabel(scope: BookScope, book?: BookSource): string {
  if (scope.type === "chapter") {
    return "Create Section Audio";
  }
  if (scope.type === "pages") {
    return "Create Page Range Audio";
  }
  if (book?.kind === "epub" || scope.label?.toLowerCase().includes("book")) {
    return "Create Book Audio";
  }
  return "Create Document Audio";
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.max(0, order.indexOf(size) - 1)] ?? "large";
}

function increaseBookTextSize(size: BookCinemaTextSize): BookCinemaTextSize {
  const order: BookCinemaTextSize[] = ["compact", "comfortable", "large", "giant"];
  return order[Math.min(order.length - 1, order.indexOf(size) + 1)] ?? "large";
}
