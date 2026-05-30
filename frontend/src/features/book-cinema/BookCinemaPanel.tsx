import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ElementType,
  type ReactNode,
} from "react";
import { compactHitTargetClassName, minInteractiveSize } from "../../design";
import { ReaderAccessibilityControls } from "../../components/reader/ReaderAccessibilityControls";
import { ReaderCanvasFrame } from "../../components/reader/ReaderCanvasFrame";
import { generatedAudioLifecycleFromJob, playbackActionLabel } from "../playback";
import {
  CinemaFocusModeToolbar,
  CinemaInspectorDock,
  CinemaMobileSheet,
  CinemaShell,
  CinemaTheatreChrome,
  CinemaTheatreTransport,
  CinemaTransportBar,
  ReadAlongInvariantDebugPanel,
  buildCinemaCurrentReadingSection,
  buildCinemaInspectorPanels,
  buildCinemaInspectorSection,
  buildCinemaWayfindingSection,
  deriveCinemaPlaybackState,
  returnFocusToCinemaReaderCanvas,
  useCinemaFocusController,
  useCinemaTheatreController,
  type CinemaMobilePanelSpec,
  type CinemaTransportModel,
} from "../cinema";
import type { UiMemoryCinemaState } from "../preferences";
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
  estimateBookWordsPerPage,
  normalizeBookScopeForBook,
  paginateBookSpans,
  resolveBookActiveWordIndex,
  resolveDefaultBookScope,
  resolveDisplayedBookActiveWordIndex,
  resolveBookTimingMapV2WordIndexes,
  resolveBookTimingCueWordIndexes,
  visibleBookSpans,
  type BookCinemaPolicyNote,
  type BookPage,
  type BookPaginationResult,
  type BookScopeOption,
} from "./model";
import {
  bookPageBlocksFromScopeContent,
  bookPageStructuredBlocks,
  type BookPageStructuredBlock,
} from "./pageStructure";
import { importBookCinemaSources, normalizeBookCinemaImportFiles } from "./bookCinemaImportHelpers";
import {
  ReaderWayfindingPanel,
  playbackProgressForBookmark,
  readerBookmarksFromProgress,
  readerOutlineFromBookScopes,
  readerRecentPositionsFromProgress,
  type ReaderBookmarkItem,
  type ReaderOutlineItem,
  type ReaderRecentPositionItem,
} from "../reader-navigation";
import { HeaderContextSummary } from "../header";
import { PolicyScopeSummary, SourcePolicyPinEditor, policyScopeSummary } from "../policy";
import { ReaderSettingsPopover } from "../settings/ReaderSettingsPopover";
import { ExitIcon, SettingsIcon } from "../navigation";
import { useReadAlongLiveStatus } from "../accessibility";
import {
  bookSourceLifecycleEnvelope,
  sourceSelectorOption,
} from "../source-lifecycle/sourceSelectors";
import {
  READER_LINE_HEIGHT_RATIO,
  READER_LINE_SPACING_CLASS,
  READER_MEASURE_CLASS,
  READER_SEEK_SECONDS,
  READER_TEXT_SCALE_CLASS,
  READER_TEXT_SCALE_FONT_PX,
  normalizeReaderAccessibilitySettings,
  readerDataAttributes,
  readerScrollBehavior,
  useReaderKeyboardControls,
  useReaderModalLifecycle,
  type ReaderAccessibilitySettings,
  type ReaderKeyboardCommand,
  type ReaderTextScale,
} from "../reader-accessibility";
import {
  recordFrontendDegradedState,
  recordFrontendMetric,
  resolveTimingConfidenceDisplay,
} from "../performance";
import {
  alignmentStatusFromReport,
  buildReadAlongSyncDebugSnapshot,
  evaluateBookReadAlongInvariant,
  HighlightRenderer,
  ReadAlongResyncController,
  readAlongAnchorForWord,
  readAlongInvariantStatusLabel,
  effectiveReadAlongPreferences,
  readAlongCalibrationOffsetMs,
  readAlongPreferenceDataAttributes,
  readAlongRuntimeStateLabel,
  readAlongVisualModeFromRuntime,
  scrollReadAlongAnchor,
  type AlignmentStatus,
  type ReadAlongHighlightStyle,
  type ReadAlongHighlightVisualMode,
  type ReadAlongPreferences,
  type ReadAlongRuntimeSnapshot,
  type ReadAlongScrollFollow,
  type SyncDebugSourceLocator,
  type HighlightMapV2,
} from "../readalong";
import { useAudioWaveformBars } from "../../audioWaveform";
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
} from "../../types";
import { resolveHighlightCue, type HighlightCue } from "../../highlightMap";

const LazyBookDocumentReaderStage = lazy(() =>
  import("../cinema/BookDocumentReaderStage").then((module) => ({
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
  resolveBookTimingMapV2WordIndexes,
  resolveBookTimingCueWordIndexes,
  visibleBookSpans,
} from "./model";
export {
  DEFAULT_READER_ACCESSIBILITY_SETTINGS,
  READER_ACCESSIBILITY_STORAGE_KEY,
  normalizeReaderAccessibilitySettings,
} from "../reader-accessibility";
export type {
  BookCinemaPolicyNote,
  BookPage,
  BookPaginationResult,
  BookScopeOption,
} from "./model";
export type { ReaderAccessibilitySettings } from "../reader-accessibility";
export type BookCinemaTextSize = ReaderTextScale;
export type BookCinemaKeyboardCommand = ReaderKeyboardCommand;

type BookCinemaMobilePanel = "narration" | "source" | "structure" | "theatre";
const BOOK_CINEMA_MOBILE_SHEET_ID = "book-cinema-mobile-sheet";

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
    await importBookCinemaSources({
      files,
      importProfile,
      onError: setLocalError,
      onImport,
      pdfTableMode,
    });
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
              className="cinema-touch-target rounded-md border bg-[var(--vs-surface)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--vs-text)] vs-border"
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
              className="cinema-touch-target rounded-md border bg-[var(--vs-surface)] px-2 text-xs font-medium normal-case tracking-normal text-[var(--vs-text)] vs-border"
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
            className="cinema-touch-target shrink-0 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-surface)] disabled:opacity-50 vs-border"
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
          accept={BOOK_SOURCE_ACCEPT}
          aria-hidden="true"
          className="sr-only"
          ref={inputRef}
          tabIndex={-1}
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
        <BookSourceListButton
          book={book}
          isSelected={selectedBookId === book.id}
          key={book.id}
          onScopeChange={onScopeChange}
          onSelectBook={onSelectBook}
        />
      ))}
    </div>
  );
}

function BookSourceListButton({
  book,
  isSelected,
  onScopeChange,
  onSelectBook,
}: Readonly<{
  book: BookSource;
  isSelected: boolean;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
}>) {
  const option = sourceSelectorOption(
    bookSourceLifecycleEnvelope(book, {
      isActive: isSelected,
      lastOpenedSurface: "Book Cinema",
    }),
    "book",
  );
  return (
    <button
      className={`min-w-0 rounded-md border p-3 text-left transition ${
        isSelected
          ? "border-orange-300 bg-orange-500/10"
          : "bg-[var(--vs-raised)] hover:bg-[var(--vs-surface)] vs-border"
      }`}
      onClick={() => {
        onSelectBook(book.id);
        onScopeChange(resolveDefaultBookScope(book));
      }}
      title={option.optionLabel}
      type="button"
    >
      <span className="block truncate text-sm font-semibold" title={bookSourceName(book)}>
        {bookSourceName(book)}
      </span>
      <span className="vs-muted mt-1 block truncate text-xs" title={option.detail}>
        {option.detail}
      </span>
      {book.ingestion?.supportTierLabel ? (
        <span className="vs-muted mt-1 block truncate text-[0.68rem]">
          {book.ingestion.supportTierLabel}
        </span>
      ) : null}
      <BookStatusBadge status={book.status} />
    </button>
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
  const selectedBookFileLabel = selectedBook.author
    ? `${selectedBook.author} · ${selectedBook.sourceFile}`
    : selectedBook.sourceFile;
  const isSourceReady = selectedBook.status === "ready";
  const hasScopeContent = Boolean(scopeContent);
  const scopeUnavailableReason = isScopeLoading
    ? "Scope content is loading."
    : "Scope text is not available.";
  const sourceUnavailableReason = isSourceReady ? undefined : "Book source is not ready.";
  const useTextDisabledReason =
    sourceUnavailableReason ?? (hasScopeContent ? undefined : scopeUnavailableReason);
  const cinemaDisabledReason =
    sourceUnavailableReason ?? (isScopeLoading ? scopeUnavailableReason : undefined);
  const createAudioDisabledReason =
    sourceUnavailableReason ??
    (isScopeLoading ? scopeUnavailableReason : undefined) ??
    (canCreateAudio ? undefined : "Select a ready scope before creating audio.");

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <HeaderContextSummary
        density="compact"
        metadata={[
          { label: "Kind", value: selectedBook.kind.toUpperCase() },
          {
            label: "File",
            value: selectedBookFileLabel,
          },
        ]}
        scopeTitle={bookScopeLabel(scope)}
        sourceTitle={bookSourceName(selectedBook)}
        stateLabel={selectedBook.status === "ready" ? "Ready" : "Needs attention"}
        surfaceName="Book Source"
      />
      <div className="flex min-w-0 flex-wrap gap-2">
        <button
          className={`${compactHitTargetClassName} h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] vs-border`}
          data-hit-target-min={minInteractiveSize}
          data-testid="ui-action-book-source-inspect-structure"
          onClick={() => {
            onInspectStructure(selectedBook);
          }}
          type="button"
        >
          Inspect structure
        </button>
        <button
          className={`${compactHitTargetClassName} h-8 rounded-md border px-3 text-xs font-semibold hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border`}
          data-disabled-reason={useTextDisabledReason}
          data-hit-target-min={minInteractiveSize}
          data-testid="ui-action-book-source-use-text"
          disabled={selectedBook.status !== "ready" || isScopeLoading || !scopeContent}
          onClick={() => {
            onUseText(selectedBook, scope);
          }}
          type="button"
        >
          Use Text
        </button>
        <button
          className={`${compactHitTargetClassName} h-8 rounded-md border border-orange-300 bg-orange-500/10 px-3 text-xs font-semibold text-orange-600 disabled:opacity-50`}
          data-disabled-reason={cinemaDisabledReason}
          data-hit-target-min={minInteractiveSize}
          data-testid="ui-action-book-source-open-cinema"
          disabled={selectedBook.status !== "ready" || isScopeLoading}
          onClick={onOpenCinema}
          type="button"
        >
          Cinema
        </button>
        <button
          className={`${compactHitTargetClassName} h-8 rounded-md px-3 text-xs font-semibold text-white disabled:opacity-50 vs-accent-bg`}
          data-disabled-reason={createAudioDisabledReason}
          data-hit-target-min={minInteractiveSize}
          data-testid="ui-action-book-source-create-audio"
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
          const nextScope = findScopeByOptionKey(scopeOptions, event.currentTarget.value);
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
  readAlongPreferences,
  resumeFallbackNotice,
  scope,
  scopeContent,
  sourcePolicySaving,
  theatreControlsSignal,
  theatreExitSignal,
  theatreOpenSignal,
  uiMemoryFocusState,
  uiMemoryResetSignal,
  highlightMap,
  highlightMapV2,
  themeName,
  onClose,
  onAccessibilitySettingsChange,
  onBookmark,
  onCommandPaletteOpen,
  onCreateAudio,
  onHelpOpen,
  onImport,
  onInspectStructure,
  onShortcutCheatSheetOpen,
  onPlayPause,
  onRestart,
  onScopeChange,
  onSelectBook,
  onSkip,
  onClearSourcePolicy,
  onResumeProgress,
  onSaveSourcePolicy,
  onUiMemoryFocusStateChange,
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
  readAlongPreferences: ReadAlongPreferences;
  resumeFallbackNotice: string | null;
  sourcePolicySaving: boolean;
  theatreControlsSignal: number;
  theatreExitSignal: number;
  theatreOpenSignal: number;
  uiMemoryFocusState: UiMemoryCinemaState;
  uiMemoryResetSignal: number;
  playbackControls: {
    isAvailable: boolean;
    isPlaying: boolean;
    isSeeking?: boolean;
    playbackRate: number;
    play: () => void | Promise<void>;
    pause: () => void;
    restart: () => void | Promise<void>;
    setPlaybackRate?: (rate: number) => void;
    skipBy?: (seconds: number) => void;
  };
  scope: BookScope;
  scopeContent: BookSourceScopeContent | null;
  highlightMap: HighlightMap | null;
  highlightMapV2: HighlightMapV2 | null;
  themeName: ThemeName;
  onClose: () => void;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
  onBookmark: () => void;
  onCommandPaletteOpen?: () => void;
  onCreateAudio: (book: BookSource, scope: BookScope) => void;
  onHelpOpen?: () => void;
  onImport: (files: File[], options: BookSourceImportOptions) => Promise<void>;
  onInspectStructure: (book: BookSource) => void;
  onShortcutCheatSheetOpen?: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onScopeChange: (scope: BookScope) => void;
  onSelectBook: (bookId: string) => void;
  onSkip: (seconds: number) => void;
  onClearSourcePolicy: () => Promise<void> | void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
  onSaveSourcePolicy: (request: SourceSpeechPolicyUpdateRequest) => Promise<void> | void;
  onUiMemoryFocusStateChange: (state: UiMemoryCinemaState) => void;
  onThemeChange: (theme: ThemeName) => void;
}>) {
  const normalizedScope = normalizeBookScopeForBook(book, scope);
  const normalizedAccessibility = normalizeReaderAccessibilitySettings(accessibilitySettings);
  const effectiveReadAlong = effectiveReadAlongPreferences(
    readAlongPreferences,
    normalizedAccessibility,
  );
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [mobilePanel, setMobilePanel] = useState<BookCinemaMobilePanel | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const calibratedPlaybackCursorSec =
    playbackCursorSec +
    readAlongCalibrationOffsetMs(effectiveReadAlong, job?.ttsEngine ?? job?.provider) / 1000;
  const activeWordIndex = resolveBookActiveWordIndex(
    book,
    job,
    calibratedPlaybackCursorSec,
    normalizedScope,
    scopeContent,
  );
  const activeJobMatchesBook = bookCinemaJobMatchesScope(job, book, normalizedScope);
  const activeBookJob = activeJobMatchesBook ? job : null;
  const activeReadAlongTimingMap =
    activeBookJob && highlightMap?.jobId === activeBookJob.id ? highlightMap : null;
  const activeReadAlongTimingMapV2 =
    activeBookJob && highlightMapV2?.generatedAudioId === activeBookJob.id ? highlightMapV2 : null;
  const highlightCue = useMemo(
    () =>
      activeReadAlongTimingMap
        ? resolveHighlightCue(activeReadAlongTimingMap, calibratedPlaybackCursorSec)
        : null,
    [activeReadAlongTimingMap, calibratedPlaybackCursorSec],
  );
  const readAlongRuntimeKey = `${activeBookJob?.id ?? "none"}:${
    activeReadAlongTimingMap?.jobId ?? "none"
  }`;
  const readAlongResyncControllerRef = useRef({
    controller: new ReadAlongResyncController(),
    key: readAlongRuntimeKey,
  });
  if (readAlongResyncControllerRef.current.key !== readAlongRuntimeKey) {
    readAlongResyncControllerRef.current = {
      controller: new ReadAlongResyncController(),
      key: readAlongRuntimeKey,
    };
  }
  const readAlongResyncController = readAlongResyncControllerRef.current.controller;
  const readAlongRuntime = useMemo<ReadAlongRuntimeSnapshot>(
    () =>
      readAlongResyncController.resolve({
        audioTimeSec: calibratedPlaybackCursorSec,
        generatedAudioState:
          activeBookJob && highlightMap && highlightMap.jobId !== activeBookJob.id
            ? "stale"
            : generatedAudioLifecycleFromJob({ job: activeBookJob }),
        highlightMap: activeReadAlongTimingMapV2 ? null : activeReadAlongTimingMap,
        timingArtifact: activeReadAlongTimingMapV2 ?? activeReadAlongTimingMap,
        isPaused: !playbackControls.isPlaying,
        isPlaying: playbackControls.isPlaying,
        isSeeking: playbackControls.isSeeking,
      }),
    [
      activeBookJob,
      activeReadAlongTimingMap,
      activeReadAlongTimingMapV2,
      highlightMap,
      playbackControls.isPlaying,
      playbackControls.isSeeking,
      calibratedPlaybackCursorSec,
      readAlongResyncController,
    ],
  );
  useReadAlongLiveStatus({
    reason: readAlongRuntime.reason,
    state: readAlongRuntime.state,
    surface: "Book Cinema",
  });
  const runtimeHighlightCue = readAlongRuntime.activeCue ?? highlightCue;
  const readAlongVisualMode = readAlongVisualModeFromRuntime(readAlongRuntime, effectiveReadAlong);
  const resolvedTimingCue = useMemo(() => {
    const directV2Timing = resolveBookTimingMapV2WordIndexes({
      map: activeReadAlongTimingMapV2,
      playbackCursorSec: calibratedPlaybackCursorSec,
      scopedSpans,
    });
    if (directV2Timing) {
      return directV2Timing;
    }
    return resolveBookTimingCueWordIndexes({
      cue: runtimeHighlightCue,
      fallbackActiveWordIndex: activeWordIndex,
      scopedSpans,
    });
  }, [
    activeReadAlongTimingMapV2,
    activeWordIndex,
    calibratedPlaybackCursorSec,
    runtimeHighlightCue,
    scopedSpans,
  ]);
  const timingActiveWordIndex = resolvedTimingCue.activeWordIndex;
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
  const phraseRange = {
    end: resolvedTimingCue.phraseWordEnd,
    start: resolvedTimingCue.phraseWordStart,
  };
  const queueOptions = useMemo(() => {
    const narratable = scopeOptions.filter(
      (option) => option.isNarratable && (option.wordCount ?? 0) > 0,
    );
    return narratable.length > 0 ? narratable : scopeOptions;
  }, [scopeOptions]);
  const isCancelledBookJob = activeJobMatchesBook && job?.status === "cancelled";
  const bookmarks = progress?.bookmarks ?? [];
  const bookmarkItems = useMemo(() => readerBookmarksFromProgress(progress), [progress]);
  const canBookmark = activeJobMatchesBook && playbackControls.isAvailable;
  const policyNotes = useMemo(() => bookCinemaPolicyNotes(scopeContent), [scopeContent]);
  const activeSpan = scopedSpans.find((span) => span.index === readerActiveWordIndex) ?? null;
  const activeBlock = bookCinemaActiveBlock(scopeContent?.blocks ?? [], activeSpan);
  const activePassage = bookCinemaActivePassage(activeBlock, scopedText);
  const phraseStart = phraseRange.start;
  const phraseEnd = phraseRange.end;
  const phraseText =
    phraseStart === undefined || phraseEnd === undefined
      ? (runtimeHighlightCue?.fragment?.text ?? null)
      : scopedSpans
          .filter((span) => span.index >= phraseStart && span.index <= phraseEnd)
          .map((span) => span.text)
          .join(" ");
  const syncDebugSnapshot = useMemo(() => {
    const locator: SyncDebugSourceLocator = {
      activeWordIndex: readerActiveWordIndex,
      blockId: activeBlock?.id ?? null,
      bookmarkTarget: progress?.targetId ?? null,
      kind: "book",
      pageIndex: activeSpan?.pageIndex ?? null,
      projectId: book.projectId,
      scopeKey: normalizedScopeKey,
      sourceId: book.id,
      sourceTitle: bookSourceName(book),
      textQuote: activeSpan?.text ?? (activePassage || null),
      value: `book:${book.id}:${normalizedScopeKey}:word-${String(readerActiveWordIndex)}`,
    };
    return buildReadAlongSyncDebugSnapshot({
      activePhraseText: phraseText,
      activeWordText: activeSpan?.text ?? runtimeHighlightCue?.token?.text ?? null,
      currentSourceLocator: locator,
      highlightMode: readAlongVisualMode,
      runtime: readAlongRuntime,
      surface: "BookCinema",
    });
  }, [
    activeBlock?.id,
    activePassage,
    activeSpan?.pageIndex,
    activeSpan?.text,
    book,
    normalizedScopeKey,
    phraseText,
    progress?.targetId,
    readAlongRuntime,
    readAlongVisualMode,
    readerActiveWordIndex,
    runtimeHighlightCue?.token?.text,
  ]);
  const readerSyncDataAttributes = useMemo(() => {
    let timingSource = "fallback";
    if (activeReadAlongTimingMapV2) {
      timingSource = "highlight-map-v2";
    } else if (activeReadAlongTimingMap) {
      timingSource = "highlight-map-v1";
    }
    return {
      "data-cinema-sync-active-word-index": readerActiveWordIndex,
      "data-cinema-sync-active-word-text":
        activeSpan?.text ?? runtimeHighlightCue?.token?.text ?? "",
      "data-cinema-sync-job-id": activeBookJob?.id ?? "",
      "data-cinema-sync-playback-cursor-sec": calibratedPlaybackCursorSec.toFixed(3),
      "data-cinema-sync-runtime-state": readAlongRuntime.state,
      "data-cinema-sync-timing-source": timingSource,
    };
  }, [
    activeBookJob?.id,
    activeReadAlongTimingMap,
    activeReadAlongTimingMapV2,
    activeSpan?.text,
    calibratedPlaybackCursorSec,
    readAlongRuntime.state,
    readerActiveWordIndex,
    runtimeHighlightCue?.token?.text,
  ]);
  const sourceLifecycle = useMemo(
    () =>
      bookSourceLifecycleEnvelope(book, {
        activeBlockId: activeBlock?.id ?? null,
        isActive: true,
        job: activeBookJob,
        lastOpenedSurface: "Book Cinema",
        selectedScope: normalizedScope,
      }),
    [activeBlock?.id, activeBookJob, book, normalizedScope],
  );
  const bookPolicyState = {
    projectProfile: policyProfile,
    resolvedProfile: activeBlock?.speechPolicy.profile,
    sessionOverrides: policyOverrides,
    sourceOverrides: book.sourceSpeechPolicyOverrides,
    sourceProfile: book.sourceSpeechPolicyProfile,
  };
  const bookPolicySummary = policyScopeSummary(bookPolicyState);
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
  const isActiveBookJobGenerating = isBookJobGenerating(activeBookJob);
  const createAudioScope = pointerOption?.scope ?? normalizedScope;
  const playbackState = deriveCinemaPlaybackState({
    hasAudio: Boolean(activeBookJob?.audioUrl),
    isGenerating: isProcessing && !activeBookJob,
    isPlayable: hasPlayableAudio,
    isPlaying: playbackControls.isPlaying,
    progressRatio: progress?.progress,
    status: activeBookJob?.status,
  });
  const isPlaybackTransport =
    playbackState === "playable" ||
    playbackState === "playing" ||
    playbackState === "paused" ||
    playbackState === "completed";
  let primaryTransportIcon: ReactNode = <AudioCreateIcon />;
  if (isPlaybackTransport) {
    primaryTransportIcon = playbackControls.isPlaying ? <CinemaPauseIcon /> : <CinemaPlayIcon />;
  }
  const playbackTransportLabel = playbackControls.isPlaying ? "Pause" : "Play";
  const primaryTransportLabel = bookPrimaryTransportLabel({
    activeBookJob,
    playbackLabel: playbackTransportLabel,
    playbackState,
  });
  const primaryTransportStyle =
    playbackState === "preAudio"
      ? "bg-amber-400 text-zinc-950 shadow-amber-500/20"
      : "text-white shadow-orange-500/25 vs-accent-bg";
  let primaryTransportDisabled = !canCreateAudio || isProcessing || book.status !== "ready";
  if (isPlaybackTransport) {
    primaryTransportDisabled = !playbackControls.isAvailable;
  } else if (playbackState === "generating") {
    primaryTransportDisabled = true;
  }
  const canUseTransportControls = hasPlayableAudio && playbackControls.isAvailable;
  const canUseSkipControls = hasPlayableAudio && Boolean(playbackControls.skipBy);
  const canChangePlaybackRate = hasPlayableAudio && Boolean(playbackControls.setPlaybackRate);
  const displayedPlaybackRate = hasPlayableAudio ? playbackControls.playbackRate : 1;
  const generationProgress = bookGenerationProgress(activeBookJob, progress?.progress ?? 0);
  const liveAnnouncementWordIndex = bookCinemaLiveWordIndex(
    runtimeHighlightCue,
    displayedActiveWordIndex,
  );
  const liveAnnouncement = useMemo(
    () =>
      bookCinemaLiveAnnouncement({
        activeWordIndex: liveAnnouncementWordIndex,
        book,
        fragmentIndex: runtimeHighlightCue?.fragmentIndex,
        scope: normalizedScope,
      }),
    [book, runtimeHighlightCue?.fragmentIndex, liveAnnouncementWordIndex, normalizedScope],
  );
  const timingConfidence = useMemo(
    () => resolveTimingConfidenceDisplay(highlightMap),
    [highlightMap],
  );
  const alignmentStatus = useMemo(
    () => alignmentStatusFromReport(activeBookJob?.timing?.alignmentQuality, highlightMap),
    [activeBookJob?.timing?.alignmentQuality, highlightMap],
  );
  const readAlongReport = useMemo(
    () =>
      evaluateBookReadAlongInvariant({
        activeBlock,
        activeSpan,
        activeText: activePassage,
        activeWordIndex: readerActiveWordIndex,
        bookSourceId: book.id,
        bookmark: bookmarks.at(0) ?? null,
        generatedAudioState: generatedAudioLifecycleFromJob({ job: activeBookJob }),
        highlightCue: runtimeHighlightCue,
        highlightMap,
        jobMatchesSource: activeJobMatchesBook,
        progress,
        scopeKey: normalizedScopeKey,
        visibleWordIndexes: visibleBookSpans(scopedSpans, readerActiveWordIndex).map(
          (span) => span.index,
        ),
      }),
    [
      activeBlock,
      activeBookJob,
      activeJobMatchesBook,
      activePassage,
      activeSpan,
      book.id,
      bookmarks,
      highlightMap,
      normalizedScopeKey,
      progress,
      readerActiveWordIndex,
      runtimeHighlightCue,
      scopedSpans,
    ],
  );
  const audioNotice = resolveBookCinemaAudioNotice({
    activeBookJob,
    book,
    hasPlayableAudio,
    isProcessing,
  });
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
  const structuralWarnings = [
    ...new Set([...(book.warnings ?? []), ...(scopeContent?.warnings ?? [])]),
  ];
  const bookInspectorPanels = buildCinemaInspectorPanels([
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3">
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
            <MetadataRow label="Structure" value={book.structureVersion ? "Detected" : "Basic"} />
          </dl>
          <button
            className="cinema-touch-target w-full rounded-md border px-3 text-sm font-semibold transition hover:bg-[var(--vs-surface)] vs-border"
            onClick={() => {
              onInspectStructure(book);
            }}
            type="button"
          >
            Inspect structure
          </button>
        </div>
      ),
      detail: book.sourceFile,
      id: "source-provenance",
      kind: "source-provenance",
      modeAffinity: "inspect",
      tabId: "overview",
      title: "Source & provenance",
    }),
    buildCinemaCurrentReadingSection({
      action: progress ? (
        <BookCinemaResumeButton progress={progress} onResumeProgress={onResumeProgress} />
      ) : null,
      detail: activeBlock ? `Block ${(activeBlock.index + 1).toString()}` : "Preview start",
      emptyText: "Open the cinema before audio generation to validate the reading view.",
      excerpt: activePassage,
      label: pointerOption?.label ?? bookScopeLabel(normalizedScope),
    }),
    buildCinemaWayfindingSection({
      bookmarks: bookmarkItems,
      canBookmark,
      outlineItems,
      recentItems,
      onAddBookmark: onBookmark,
      onBookmarkNavigate: handleBookmarkNavigate,
      onOutlineNavigate: handleWayfindingOutlineNavigate,
      onRecentNavigate: handleRecentNavigate,
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3 text-sm">
          <PolicyScopeSummary display="expanded" state={bookPolicyState} />
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
            sourceLifecycle={sourceLifecycle}
            sourceOverrides={book.sourceSpeechPolicyOverrides}
            sourceProfile={book.sourceSpeechPolicyProfile}
            onClear={onClearSourcePolicy}
            onSave={onSaveSourcePolicy}
          />
        </div>
      ),
      detail:
        activeBlock?.speechPolicy.profile ?? book.sourceSpeechPolicyProfile ?? "Project default",
      id: "speech-policy",
      kind: "speech-policy",
      modeAffinity: ["inspect", "review", "debug"],
      tabId: "policy",
      title: "Speech policy",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3 text-sm">
          <BookCinemaHealthRow
            label="Readable text"
            value={scopedText.trim() ? "Ready" : "Empty"}
          />
          <BookCinemaHealthRow
            label="Structure"
            value={
              scopeContent?.sourceStructureValid || book.structureVersion ? "Detected" : "Basic"
            }
          />
          <BookCinemaHealthRow
            label="Scope words"
            value={`${(scopeContent?.wordCount ?? scopedSpans.length).toLocaleString()} words`}
          />
          <BookCinemaHealthRow
            label="Audio"
            value={hasPlayableAudio ? "Generated" : "Not generated"}
          />
          <BookCinemaHealthRow label="Job status" value={activeBookJob?.status ?? "Pre-audio"} />
          {activeBookJob ? (
            <>
              <BookCinemaHealthRow label="Job id" value={activeBookJob.id} />
              <BookCinemaHealthRow
                label="Terminal reason"
                value={formatBookJobTerminalReason(activeBookJob.terminalReason)}
              />
              <BookCinemaHealthRow
                label="Retryable"
                value={activeBookJob.retriable ? "Yes" : "No"}
              />
              <BookCinemaHealthRow
                label="Stage"
                value={activeBookJob.progress.activeStage || activeBookJob.status}
              />
              <BookCinemaHealthRow
                label="Segments"
                value={formatBookJobSegmentProgress(activeBookJob)}
              />
              <BookCinemaHealthRow
                label="Last event"
                value={formatDateTime(activeBookJob.updatedAt)}
              />
              {activeBookJob.error ? (
                <BookCinemaHealthRow label="Error" value={activeBookJob.error} />
              ) : null}
            </>
          ) : null}
          <BookCinemaHealthRow label="Alignment" value={alignmentStatus.label} />
          <BookCinemaHealthRow label="Bookmarks" value={bookmarks.length.toLocaleString()} />
          {structuralWarnings.length > 0 ? (
            <div className="grid gap-2">
              {structuralWarnings.slice(0, 4).map((warning) => (
                <p
                  className="rounded border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-amber-500"
                  key={warning}
                >
                  {warning}
                </p>
              ))}
            </div>
          ) : (
            <p className="vs-muted">No structural warnings for this scope.</p>
          )}
        </div>
      ),
      detail: hasPlayableAudio ? "Generated audio ready" : "Pre-audio",
      id: "extraction-health",
      kind: "extraction-health",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Health",
    }),
    buildCinemaInspectorSection({
      children: (
        <div className="grid gap-3">
          <PolicyScopeSummary display="debug" state={bookPolicyState} />
          <BookCinemaPolicyNotes notes={policyNotes} />
        </div>
      ),
      detail: `${policyNotes.length.toLocaleString()} policy notes`,
      id: "policy-notes",
      kind: "policy-notes",
      modeAffinity: ["inspect", "review", "debug"],
      tabId: "policy",
      title: "Policy notes",
    }),
    buildCinemaInspectorSection({
      children: (
        <BookCinemaScopeQueue
          activeScope={normalizedScope}
          maxItems={8}
          options={queueOptions}
          pointerScopeKey={pointerScopeKey}
          onNavigate={handleNavigateToScope}
        />
      ),
      detail: "Narratable sections",
      id: "narration-queue",
      kind: "narration-block-status",
      modeAffinity: "review",
      tabId: "review",
      title: "Section queue",
    }),
    buildCinemaInspectorSection({
      children: <BookCinemaHighlightConfidence display={timingConfidence} />,
      detail: timingConfidence.detail,
      id: "highlight-confidence",
      kind: "highlight-confidence",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Highlight confidence",
    }),
    buildCinemaInspectorSection({
      children: (
        <ReadAlongInvariantDebugPanel
          report={readAlongReport}
          runtime={readAlongRuntime}
          syncDebugSnapshot={syncDebugSnapshot}
        />
      ),
      detail: readAlongInvariantStatusLabel(readAlongReport),
      id: "read-along-fidelity",
      kind: "timing-map",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Read-along fidelity",
    }),
    buildCinemaInspectorSection({
      children: (
        <BookCinemaTimingDebug
          cursorSec={playbackCursorSec}
          highlightCue={runtimeHighlightCue}
          highlightMap={highlightMap}
          alignmentStatus={alignmentStatus}
          readAlongRuntime={readAlongRuntime}
        />
      ),
      detail: alignmentStatus.detail,
      id: "timing-map",
      kind: "timing-map",
      modeAffinity: "debug",
      tabId: "diagnostics",
      title: "Timing debug",
    }),
  ]);
  const cinemaFocus = useCinemaFocusController(bookInspectorPanels, {
    initialState: uiMemoryFocusState,
    onStateChange: onUiMemoryFocusStateChange,
    resetSignal: uiMemoryResetSignal,
  });
  const cinemaTheatre = useCinemaTheatreController(dialogRef);
  const theatreOpenSignalRef = useRef(theatreOpenSignal);
  const theatreExitSignalRef = useRef(theatreExitSignal);
  const theatreControlsSignalRef = useRef(theatreControlsSignal);

  useReaderKeyboardControls({
    canBookmark,
    onBookmark,
    onClose: () => {
      if (cinemaTheatre.active) {
        cinemaTheatre.exit();
        return;
      }
      onClose();
    },
    onPlayPause,
    onRestart,
    onSkip,
    playbackControls,
  });

  useReaderModalLifecycle(dialogRef, { closeOnEscape: false });

  const handleCompactTransport = useCallback(() => {
    cinemaFocus.setMode("read");
    cinemaFocus.setPinnedPanelId(null);
    setMobilePanel(null);
  }, [cinemaFocus]);

  const handleTheatreMode = useCallback(() => {
    handleCompactTransport();
    setSettingsOpen(false);
    cinemaTheatre.open();
  }, [cinemaTheatre, handleCompactTransport]);

  useEffect(() => {
    if (theatreOpenSignalRef.current === theatreOpenSignal) {
      return;
    }
    theatreOpenSignalRef.current = theatreOpenSignal;
    if (theatreOpenSignal > 0) {
      handleTheatreMode();
    }
  }, [handleTheatreMode, theatreOpenSignal]);

  useEffect(() => {
    if (theatreExitSignalRef.current === theatreExitSignal) {
      return;
    }
    theatreExitSignalRef.current = theatreExitSignal;
    if (theatreExitSignal > 0) {
      cinemaTheatre.exit();
    }
  }, [cinemaTheatre, theatreExitSignal]);

  useEffect(() => {
    if (theatreControlsSignalRef.current === theatreControlsSignal) {
      return;
    }
    theatreControlsSignalRef.current = theatreControlsSignal;
    if (theatreControlsSignal > 0) {
      cinemaTheatre.toggleControls();
    }
  }, [cinemaTheatre, theatreControlsSignal]);

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

  useEffect(() => {
    if (!activeBookJob || hasPlayableAudio) {
      return;
    }
    recordFrontendDegradedState("audio-not-ready", "book-cinema", {
      hasAudioUrl: Boolean(activeBookJob.audioUrl),
      jobId: activeBookJob.id,
      status: activeBookJob.status,
    });
  }, [activeBookJob, hasPlayableAudio]);

  let transportCurrentLabel = "0:00";
  if (isActiveBookJobGenerating || playbackState === "generating") {
    transportCurrentLabel = generationProgress.currentLabel;
  } else if (progress) {
    transportCurrentLabel = formatEstimatedDuration(progress.currentTimeSec * 1000);
  }
  const transportProgressRatio =
    isActiveBookJobGenerating || playbackState === "generating"
      ? generationProgress.ratio
      : (progress?.progress ?? 0);

  const bookTransportModel: CinemaTransportModel = {
    bookmark: {
      disabled: !canBookmark,
      onClick: onBookmark,
    },
    displayControls: (
      <ReaderAccessibilityControls
        settings={normalizedAccessibility}
        variant="panel"
        onChange={onAccessibilitySettingsChange}
      />
    ),
    details:
      playbackState === "degraded"
        ? {
            disabled: false,
            label: "View details",
            onClick: () => {
              cinemaFocus.setMode("debug");
              cinemaFocus.setActivePanelId("diagnostics");
            },
          }
        : undefined,
    playbackRate: {
      disabled: !canChangePlaybackRate,
      value: displayedPlaybackRate,
      onChange: playbackControls.setPlaybackRate,
    },
    playbackState,
    primary: {
      className: primaryTransportStyle,
      disabled: primaryTransportDisabled,
      icon: primaryTransportIcon,
      label: primaryTransportLabel,
      mobileLabel: primaryTransportLabel,
      onClick: () => {
        if (isPlaybackTransport) {
          onPlayPause();
        } else {
          onCreateAudio(book, createAudioScope);
        }
      },
    },
    progress: {
      currentLabel: transportCurrentLabel,
      durationLabel: formatEstimatedDuration(scopeContent?.estimatedDurationMs),
      ratio: transportProgressRatio,
      waveform: activeBookJob ? (
        <BookCinemaWaveform
          audioUrl={bookJobAudioUrl(activeBookJob)}
          progress={progress?.progress ?? 0}
        />
      ) : (
        <BookCinemaWaveformPlaceholder />
      ),
    },
    restart: {
      disabled: !canUseTransportControls,
      icon: <RestartTinyIcon />,
      onClick: onRestart,
    },
    skipBackward: {
      disabled: !canUseSkipControls,
      icon: <SkipBackTinyIcon />,
      onClick: () => {
        onSkip(-READER_SEEK_SECONDS);
      },
    },
    generationSettings: (
      <BookTransportSettingPills
        items={[
          bookScopeLabel(createAudioScope),
          formatEstimatedDuration(scopeContent?.estimatedDurationMs),
          activeBlock?.speechPolicy.profile ?? book.sourceSpeechPolicyProfile ?? "Project voice",
        ]}
      />
    ),
    skipForward: {
      disabled: !canUseSkipControls,
      icon: <SkipForwardTinyIcon />,
      onClick: () => {
        onSkip(READER_SEEK_SECONDS);
      },
    },
    stateSummary: {
      detail: bookTransportStateDetail({
        activeBookJob,
        createAudioScope,
        playbackState,
        scopeContent,
      }),
      title: bookTransportStateTitle(playbackState, activeBookJob),
    },
    estimatedReadyLabel:
      isActiveBookJobGenerating || playbackState === "generating"
        ? generationProgress.estimatedReadyLabel
        : undefined,
  };

  return (
    <CinemaShell
      ariaLabelledBy="book-cinema-title"
      canvas={
        <BookCinemaReaderStage
          activeWordIndex={readerActiveWordIndex}
          book={book}
          scope={normalizedScope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          scopeContent={scopeContent}
          accessibilitySettings={normalizedAccessibility}
          canvasFirst={cinemaTheatre.active || cinemaFocus.layoutState.canvasFirst}
          pointerLabel={pointerOption?.label ?? null}
          phraseWordEnd={phraseRange.end}
          phraseWordStart={phraseRange.start}
          highlightStyle={effectiveReadAlong.highlightStyle}
          scrollFollow={effectiveReadAlong.scrollFollow}
          syncDataAttributes={readerSyncDataAttributes}
          readAlongVisualMode={readAlongVisualMode}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
        />
      }
      canvasFirst={cinemaTheatre.active || cinemaFocus.layoutState.canvasFirst}
      footer={
        cinemaTheatre.active ? (
          <CinemaTheatreTransport
            controlsVisible={cinemaTheatre.controlsVisible}
            model={bookTransportModel}
          />
        ) : (
          <>
            <CinemaTransportBar model={bookTransportModel} />
            <BookCinemaReaderNoticeList
              audioNotice={playbackState === "degraded" && !isCancelledBookJob ? audioNotice : null}
              isResumeRestoring={isResumeRestoring}
              resumeFallbackNotice={resumeFallbackNotice}
              timingConfidence={timingConfidence}
            />
          </>
        )
      }
      focusMode={cinemaFocus.mode}
      header={
        cinemaTheatre.active ? (
          <CinemaTheatreChrome
            activePassage={activePassage}
            controlsVisible={cinemaTheatre.controlsVisible}
            fullscreenActive={cinemaTheatre.fullscreenActive}
            fullscreenAvailability={cinemaTheatre.fullscreenAvailability}
            highContrast={normalizedAccessibility.highContrast}
            scopeLabel={bookScopeLabel(normalizedScope)}
            sourceLabel={bookSourceName(book)}
            surfaceName={book.kind === "markdown" ? "Document Cinema" : "Book Cinema"}
            onExit={cinemaTheatre.exit}
            onRequestFullscreen={cinemaTheatre.requestFullscreen}
            onToggleControls={cinemaTheatre.toggleControls}
          />
        ) : (
          <header className="relative flex min-h-[4rem] items-center justify-between gap-3 border-b bg-[var(--vs-raised)] px-4 py-2.5 vs-border sm:px-6">
            <HeaderContextSummary
              className="flex-1 lg:max-w-[min(36rem,42vw)]"
              density="compact"
              icon={
                <span className="grid h-9 w-9 place-items-center rounded-md border border-orange-400/30 bg-orange-500/10 text-orange-400">
                  <CinemaFilmIcon />
                </span>
              }
              id="book-cinema-title"
              metadata={[
                { label: "Policy", value: bookPolicySummary.compactLabel },
                { label: "Voice", value: activeBookJob?.voice ?? "Default narrative" },
              ]}
              scopeTitle={bookScopeLabel(normalizedScope)}
              sourceLifecycle={sourceLifecycle}
              sourceTitle={bookSourceName(book)}
              stateLabel={bookTransportStateTitle(playbackState, activeBookJob)}
              surfaceName={book.kind === "markdown" ? "Document Cinema" : "Book Cinema"}
              variant="bar"
            />
            <div className="hidden min-w-[20rem] shrink-0 lg:block">
              <CinemaFocusModeToolbar
                activePanelId={cinemaFocus.activePanelId}
                mode={cinemaFocus.mode}
                onAdvancedAction={(action) => {
                  cinemaFocus.setMode(action.mode);
                  cinemaFocus.setActivePanelId(action.panelId);
                }}
                onCommandPalette={onCommandPaletteOpen}
                onHelpGuide={onHelpOpen}
                onKeyboardShortcuts={onShortcutCheatSheetOpen}
                onMenuOpen={() => {
                  setSettingsOpen(false);
                }}
                onModeChange={cinemaFocus.setMode}
                onReaderSettings={() => {
                  setSettingsOpen(true);
                }}
                onTheatreMode={handleTheatreMode}
              />
            </div>
            {timingConfidence.isDegraded ? (
              <BookCinemaTimingStatusChip
                display={timingConfidence}
                onClick={() => {
                  cinemaFocus.setMode("debug");
                  cinemaFocus.setActivePanelId("diagnostics");
                }}
              />
            ) : null}
            {isResumeRestoring ? <BookCinemaResumeChip /> : null}
            <div className="flex shrink-0 items-center gap-2">
              <label className="hidden items-center gap-2 text-sm vs-muted lg:flex">
                <span>Scope</span>
                <select
                  aria-label={`Book scope: ${bookScopeLabel(normalizedScope)}`}
                  className="cinema-touch-target max-w-64 rounded-md border bg-[var(--vs-surface)] px-3 text-sm font-semibold text-[var(--vs-text)] outline-none vs-border"
                  data-book-source-id={book.id}
                  data-testid="ui-action-book-cinema-scope"
                  onChange={(event) => {
                    const nextScope = findScopeByOptionKey(scopeOptions, event.currentTarget.value);
                    if (nextScope) {
                      handleScopeChange(nextScope);
                    }
                  }}
                  title={`Scope: ${bookScopeLabel(normalizedScope)}`}
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
                className="cinema-touch-target hidden max-w-[9rem] rounded-md border bg-[var(--vs-surface)] px-2 text-sm font-semibold outline-none vs-border"
                data-book-source-id={book.id}
                data-testid="ui-action-book-cinema-scope"
                onChange={(event) => {
                  const nextScope = findScopeByOptionKey(scopeOptions, event.currentTarget.value);
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
                aria-label="More"
                aria-controls={BOOK_CINEMA_MOBILE_SHEET_ID}
                aria-expanded={mobilePanel !== null}
                className="cinema-touch-target inline-flex h-11 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border lg:hidden"
                data-testid="ui-action-book-cinema-mobile-more"
                onClick={() => {
                  setSettingsOpen(false);
                  setMobilePanel((current) => (current ? null : "theatre"));
                }}
                type="button"
              >
                <MoreTinyIcon />
                <span className="hidden sm:inline">More</span>
              </button>
              <button
                className="cinema-touch-target hidden h-11 items-center gap-2 rounded-md border px-3 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:inline-flex"
                onClick={() => {
                  setSettingsOpen((current) => !current);
                }}
                type="button"
              >
                <SettingsIcon />
                Settings
              </button>
              <button
                className="cinema-touch-target inline-flex h-11 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition hover:bg-[var(--vs-surface)] vs-border sm:gap-2 sm:px-3"
                onClick={onClose}
                type="button"
              >
                <ExitIcon />
                <span className="hidden sm:inline">Exit</span>
              </button>
            </div>
            {settingsOpen ? (
              <ReaderSettingsPopover
                accessibilitySettings={normalizedAccessibility}
                themeName={themeName}
                onAccessibilitySettingsChange={onAccessibilitySettingsChange}
                onThemeChange={onThemeChange}
              />
            ) : null}
          </header>
        )
      }
      inspector={
        !cinemaTheatre.active && cinemaFocus.layoutState.railVisible ? (
          <CinemaInspectorDock
            activePanelId={cinemaFocus.activePanelId}
            mode={cinemaFocus.mode}
            panels={bookInspectorPanels}
            pinnedPanelId={cinemaFocus.pinnedPanelId}
            surface={book.kind === "markdown" ? "document" : "book"}
            onActivePanelChange={cinemaFocus.setActivePanelId}
            onPinnedPanelChange={cinemaFocus.setPinnedPanelId}
          />
        ) : undefined
      }
      liveAnnouncement={liveAnnouncement}
      mobileSheet={
        cinemaTheatre.active ? undefined : (
          <BookCinemaMobileSheet
            activePassage={activePassage}
            activeScope={normalizedScope}
            book={book}
            bookSources={bookSources}
            hasPlayableAudio={hasPlayableAudio}
            importError={importError}
            isImporting={isImporting}
            mobilePanel={mobilePanel}
            displayControls={
              <ReaderAccessibilityControls
                settings={normalizedAccessibility}
                variant="panel"
                onChange={onAccessibilitySettingsChange}
              />
            }
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
            onTheatreMode={handleTheatreMode}
            onSelectBook={onSelectBook}
            onResumeProgress={onResumeProgress}
            onRecentNavigate={handleRecentNavigate}
            onOutlineNavigate={handleWayfindingOutlineNavigate}
          />
        )
      }
      readerAttributes={{
        ...readerDataAttributes(normalizedAccessibility),
        ...readAlongPreferenceDataAttributes(effectiveReadAlong),
      }}
      rootRef={dialogRef}
      surfaceKind={book.kind === "markdown" ? "document" : "book"}
      theatreActive={cinemaTheatre.active}
      themeName={themeName}
    />
  );
}

export function bookPrimaryTransportLabel({
  activeBookJob,
  playbackLabel,
  playbackState,
}: Readonly<{
  activeBookJob: VoiceJob | null;
  playbackLabel: string;
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>;
}>): string {
  if (playbackState === "preAudio") {
    return "Create audio";
  }
  if (playbackState === "generating") {
    return bookJobPlayableSegments(activeBookJob) > 0
      ? "Creating audio"
      : "Preparing first segment";
  }
  if (playbackState === "degraded") {
    if (activeBookJob?.terminalReason === "provider_timeout") {
      return "Try again";
    }
    if (activeBookJob?.terminalReason === "provider_failed") {
      return "Try again";
    }
    if (activeBookJob?.terminalReason === "validation_failed") {
      return "Try again";
    }
    if (activeBookJob?.terminalReason === "system_cancelled") {
      return "Try again";
    }
    return playbackActionLabel("rebuildAudio");
  }
  return playbackLabel === "Play" ? playbackActionLabel("play") : playbackLabel;
}

export function bookTransportStateTitle(
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>,
  activeBookJob: VoiceJob | null,
): string {
  if (playbackState === "preAudio") {
    return "Ready to create audio";
  }
  if (playbackState === "generating" || isBookJobGenerating(activeBookJob)) {
    if (bookJobPlayableSegments(activeBookJob) <= 0) {
      return "Preparing first segment";
    }
    return "Creating audio";
  }
  if (playbackState === "degraded") {
    if (activeBookJob?.status === "cancelled") {
      return activeBookJob.terminalReason === "user_cancelled"
        ? "Generation cancelled"
        : "Generation stopped";
    }
    if (activeBookJob?.status === "failed") {
      if (activeBookJob.terminalReason === "provider_timeout") {
        return "Audio generation timed out";
      }
      return "Audio generation failed";
    }
    return "Audio needs attention";
  }
  return "Audio ready";
}

export function bookTransportStateDetail({
  activeBookJob,
  createAudioScope,
  playbackState,
  scopeContent,
}: Readonly<{
  activeBookJob: VoiceJob | null;
  createAudioScope: BookScope;
  playbackState: ReturnType<typeof deriveCinemaPlaybackState>;
  scopeContent: BookSourceScopeContent | null;
}>): string {
  const scopeLabel = bookScopeLabel(createAudioScope);
  const estimate = formatEstimatedDuration(scopeContent?.estimatedDurationMs);
  if (playbackState === "preAudio") {
    return `${scopeLabel} is ready to read. Create audio for synchronized playback, estimated ${estimate}.`;
  }
  if (playbackState === "generating" || isBookJobGenerating(activeBookJob)) {
    const ready = bookJobPlayableSegments(activeBookJob);
    const segmentProgress = activeBookJob ? formatBookJobSegmentProgress(activeBookJob) : "pending";
    if (ready <= 0) {
      return `${scopeLabel} narration is preparing its first playable segment. Progress: ${segmentProgress}.`;
    }
    return `${scopeLabel} is playable while narration continues. ${ready.toLocaleString()} segments are ready.`;
  }
  if (playbackState === "degraded") {
    return degradedBookTransportStateDetail(activeBookJob, scopeLabel);
  }
  return `${scopeLabel} has generated audio.`;
}

function degradedBookTransportStateDetail(job: VoiceJob | null, scopeLabel: string): string {
  if (job?.status === "failed") {
    if (job.terminalReason === "provider_timeout") {
      return (
        job.error ??
        `${scopeLabel} generation timed out before completion. Try again with the same scope and voice.`
      );
    }
    if (job.terminalReason === "validation_failed") {
      return (
        job.error ??
        `${scopeLabel} audio did not pass validation. Try again or inspect timing details.`
      );
    }
    return job.error ?? `${scopeLabel} generation failed. Try again when ready.`;
  }
  if (job?.status === "cancelled") {
    if (job.terminalReason === "user_cancelled") {
      return `${scopeLabel} generation was cancelled by request. Rebuild audio when ready.`;
    }
    return `${scopeLabel} generation stopped before audio was ready. Try again when ready.`;
  }
  return `${scopeLabel} has audio metadata, but playback is not available yet. Rebuild if it does not recover.`;
}

function isBookJobGenerating(job: VoiceJob | null): boolean {
  return Boolean(
    job && ["queued", "optimizing", "synthesizing", "checking", "retrying"].includes(job.status),
  );
}

function bookJobPlayableSegments(job: VoiceJob | null): number {
  return Math.max(0, job?.audioReadySegments ?? 0);
}

function bookJobAudioUrl(job: VoiceJob): string {
  if (job.audioUrl.length > 0) {
    return job.audioUrl;
  }
  return job.audioPartialUrl ?? "";
}

function bookGenerationProgress(
  activeBookJob: VoiceJob | null,
  fallbackRatio: number,
): { currentLabel: string; estimatedReadyLabel: string; ratio: number } {
  const current = activeBookJob ? activeBookJob.retries.currentSegment : 0;
  const total = activeBookJob ? activeBookJob.retries.totalSegments : 0;
  const ready = bookJobPlayableSegments(activeBookJob);
  if (total > 0) {
    const clampedCurrent = Math.min(total, Math.max(0, current));
    let currentLabel = `Preparing first segment · ${String(total)} segments`;
    if (ready > 0) {
      currentLabel = `${ready.toLocaleString()} ready · segment ${String(
        clampedCurrent,
      )} of ${String(total)}`;
    } else if (clampedCurrent > 0) {
      currentLabel = `Preparing first segment · ${String(clampedCurrent)} of ${String(total)}`;
    }
    return {
      currentLabel,
      estimatedReadyLabel: `${String(total)} segments`,
      ratio: clampedCurrent / total,
    };
  }
  return {
    currentLabel: "Preparing segments",
    estimatedReadyLabel: "Estimating",
    ratio: fallbackRatio,
  };
}

function formatBookJobSegmentProgress(job: VoiceJob): string {
  const progressCurrent = job.progress.currentSegment;
  const progressTotal = job.progress.totalSegments;
  const current =
    typeof progressCurrent === "number" && progressCurrent > 0
      ? progressCurrent
      : job.retries.currentSegment;
  const total =
    typeof progressTotal === "number" && progressTotal > 0
      ? progressTotal
      : job.retries.totalSegments;
  if (total > 0) {
    return `${Math.min(total, Math.max(0, current)).toLocaleString()} of ${total.toLocaleString()}`;
  }
  return "Not segmented yet";
}

function formatBookJobTerminalReason(reason: VoiceJob["terminalReason"]): string {
  switch (reason) {
    case "user_cancelled": {
      return "User cancelled";
    }
    case "system_cancelled": {
      return "System cancelled";
    }
    case "provider_failed": {
      return "Provider failed";
    }
    case "provider_timeout": {
      return "Provider timed out";
    }
    case "validation_failed": {
      return "Validation failed";
    }
    case "superseded": {
      return "Superseded";
    }
    case "metadata_failed": {
      return "Metadata failed";
    }
    case "configuration_failed": {
      return "Configuration failed";
    }
    default: {
      return "None";
    }
  }
}

function BookTransportSettingPills({ items }: Readonly<{ items: string[] }>) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <span
          className="max-w-40 truncate rounded-md border px-2 py-1 text-xs font-semibold vs-border vs-muted"
          key={item}
          title={item}
        >
          {item}
        </span>
      ))}
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
  const handleLibraryImport = async (files: FileList | File[] | null | undefined) => {
    await importBookCinemaSources({
      files,
      importProfile: "auto",
      onImport,
      pdfTableMode: "auto",
      validateBatch: false,
    });
  };
  return (
    <div className="mb-4 grid gap-2 border-b pb-3 vs-border">
      <label className="grid gap-1 text-xs font-semibold">
        <span className="vs-muted">Cinema source</span>
        <select
          aria-label={`Cinema source: ${bookSourceName(book)}`}
          className="cinema-touch-target min-w-0 rounded-md border bg-[var(--vs-raised)] px-2 text-sm font-medium outline-none vs-border"
          data-book-source-id={book.id}
          data-testid="ui-action-book-cinema-source"
          onChange={(event) => {
            onSelectBook(event.currentTarget.value);
          }}
          title={bookSourceName(book)}
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
          className="cinema-touch-target min-w-0 flex-1 rounded-md border px-3 text-xs font-semibold transition hover:bg-[var(--vs-raised)] disabled:opacity-50 vs-border"
          data-book-source-id={book.id}
          data-testid="ui-action-book-cinema-select-file"
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
          aria-hidden="true"
          className="sr-only"
          multiple
          onChange={(event) => {
            const files = normalizeBookCinemaImportFiles(event.currentTarget.files);
            event.currentTarget.value = "";
            if (files.length > 0) {
              void handleLibraryImport(files);
            }
          }}
          ref={inputRef}
          tabIndex={-1}
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
  const startedAtRef = useRef(performance.now());
  const recordedRef = useRef(false);
  const bars = useAudioWaveformBars(audioUrl, 86);
  const clampedProgress = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    if (!audioUrl) {
      return;
    }
    startedAtRef.current = performance.now();
    recordedRef.current = false;
  }, [audioUrl]);

  useEffect(() => {
    if (recordedRef.current || bars === null) {
      return;
    }
    recordedRef.current = true;
    recordFrontendMetric("waveform-progress-render", performance.now() - startedAtRef.current, {
      bars: bars.length,
      surface: "book-cinema",
      status: bars.length > 0 ? "ready" : "unavailable",
    });
  }, [bars]);

  if (!bars) {
    return <BookCinemaWaveformPlaceholder label="Loading audio waveform..." />;
  }
  if (bars.length === 0) {
    return <BookCinemaWaveformPlaceholder label="Waveform unavailable for this audio." />;
  }
  return (
    <div aria-hidden="true" className="flex h-7 min-w-0 items-center gap-[2px]">
      {bars.map((amplitude, index) => (
        <span
          className={`w-[2px] rounded-full ${
            index / bars.length <= clampedProgress ? "bg-orange-500" : "bg-zinc-500/35"
          }`}
          key={`${audioUrl}-${index.toString()}`}
          style={{ height: `${String(5 + Math.round(amplitude * 20))}px` }}
        />
      ))}
    </div>
  );
}

function BookCinemaWaveformPlaceholder({
  label = "Audio waveform appears after generation.",
}: Readonly<{ label?: string }>) {
  return (
    <div
      className="flex h-7 min-w-0 items-center overflow-hidden rounded-md border border-dashed px-2 text-xs font-medium vs-border vs-muted"
      title={label}
    >
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function BookCinemaMobileSheet({
  activePassage,
  activeScope,
  book,
  bookSources,
  displayControls,
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
  onTheatreMode,
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
  displayControls: ReactNode;
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
  onTheatreMode: () => void;
  onOutlineNavigate: (item: ReaderOutlineItem<BookScope>) => void;
  onRecentNavigate: (item: ReaderRecentPositionItem) => void;
  onSelectBook: (bookId: string) => void;
  onResumeProgress: (progress: PlaybackProgress, seconds?: number) => void;
}>) {
  const returnToCanvas = () => {
    onMobilePanelChange(null);
    returnFocusToCinemaReaderCanvas();
  };
  const handleBookmarkNavigate = (bookmark: ReaderBookmarkItem) => {
    onBookmarkNavigate(bookmark);
    returnToCanvas();
  };
  const handleOutlineNavigate = (item: ReaderOutlineItem<BookScope>) => {
    onOutlineNavigate(item);
    returnToCanvas();
  };
  const handleRecentNavigate = (item: ReaderRecentPositionItem) => {
    onRecentNavigate(item);
    returnToCanvas();
  };
  const handleResumeProgress = (nextProgress: PlaybackProgress) => {
    onResumeProgress(nextProgress);
    returnToCanvas();
  };
  const panels: CinemaMobilePanelSpec<BookCinemaMobilePanel>[] = [
    {
      children: (
        <div className="grid gap-3 text-sm">
          <p className="leading-6 vs-muted">
            Switch to the reader-first Theatre layout for focused follow-along.
          </p>
          <button
            className="cinema-touch-target rounded-md border border-orange-300 bg-orange-500/10 px-3 font-semibold text-orange-500"
            data-testid="ui-action-book-cinema-mobile-theatre"
            onClick={() => {
              onTheatreMode();
            }}
            type="button"
          >
            Enter Theatre
          </button>
        </div>
      ),
      id: "theatre",
      label: "Theatre",
    },
    {
      children: (
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
      ),
      id: "source",
      label: "Source",
    },
    {
      children: (
        <div className="grid gap-3 text-sm">
          <ReaderWayfindingPanel
            activeTab="outline"
            bookmarks={bookmarkItems}
            canBookmark={canBookmark}
            maxItems={8}
            outlineItems={outlineItems}
            recentItems={recentItems}
            onAddBookmark={onAddBookmark}
            onBookmarkNavigate={handleBookmarkNavigate}
            onOutlineNavigate={handleOutlineNavigate}
            onRecentNavigate={handleRecentNavigate}
          />
          <button
            className="cinema-touch-target rounded-md border px-3 text-sm font-semibold vs-border"
            data-book-source-id={book.id}
            data-testid="ui-action-book-cinema-inspect-structure"
            onClick={() => {
              onInspectStructure(book);
            }}
            type="button"
          >
            Inspect structure
          </button>
        </div>
      ),
      id: "structure",
      label: "Structure",
    },
    {
      children: (
        <div className="grid gap-3 text-sm">
          <p className="line-clamp-4 leading-6">
            {activePassage ||
              "Audio has not been generated yet. The reader remains ready for validation."}
          </p>
          {progress ? (
            <button
              className="cinema-touch-target rounded-md border border-orange-300 bg-orange-500/10 px-3 font-semibold text-orange-500"
              onClick={() => {
                handleResumeProgress(progress);
              }}
              type="button"
            >
              Resume saved point
            </button>
          ) : null}
        </div>
      ),
      id: "narration",
      label: "Narration",
    },
  ];

  return (
    <CinemaMobileSheet
      activePanelId={mobilePanel}
      displayControls={displayControls}
      id={BOOK_CINEMA_MOBILE_SHEET_ID}
      label="Book Cinema more controls"
      panels={panels}
      onPanelChange={onMobilePanelChange}
    />
  );
}

export function resolveBookCinemaAudioNotice({
  activeBookJob,
  book,
  hasPlayableAudio,
  isProcessing,
}: Readonly<{
  activeBookJob: VoiceJob | null;
  book: BookSource;
  hasPlayableAudio: boolean;
  isProcessing: boolean;
}>): string | null {
  if (hasPlayableAudio) {
    return null;
  }
  if (activeBookJob) {
    if (activeBookJob.audioUrl) {
      return "Generated audio is present, but playback controls are still initializing.";
    }
    if (
      isProcessing ||
      ["queued", "optimizing", "synthesizing", "checking", "retrying"].includes(
        activeBookJob.status,
      )
    ) {
      return "Audio is still being generated; the reader remains usable for review.";
    }
    return "Narration exists for this scope, but generated audio is not ready yet.";
  }
  return `Audio has not been generated for this ${book.kind.toUpperCase()} scope yet.`;
}

interface BookCinemaReaderNotice {
  label: string;
  text: string;
  tone: "info" | "warning";
}

export function BookCinemaReaderNoticeList({
  audioNotice,
  isResumeRestoring,
  resumeFallbackNotice,
  timingConfidence,
}: Readonly<{
  audioNotice: string | null;
  isResumeRestoring: boolean;
  resumeFallbackNotice: string | null;
  timingConfidence: ReturnType<typeof resolveTimingConfidenceDisplay>;
}>) {
  const notices = [
    timingConfidence.isDegraded
      ? {
          label: timingConfidence.label,
          text: timingConfidence.detail,
          tone: "warning",
        }
      : null,
    isResumeRestoring
      ? {
          label: "Restoring saved point",
          text: "The reader is open while saved playback position and audio controls catch up.",
          tone: "info",
        }
      : null,
    resumeFallbackNotice
      ? {
          label: "Resume fallback",
          text: resumeFallbackNotice,
          tone: "info",
        }
      : null,
    audioNotice
      ? {
          label: "Audio not ready",
          text: audioNotice,
          tone: "warning",
        }
      : null,
  ].filter(Boolean) as BookCinemaReaderNotice[];

  if (notices.length === 0) {
    return null;
  }

  return (
    <div aria-live="polite" className="grid border-t bg-[var(--vs-raised)] vs-border">
      {notices.map((notice) => (
        <p
          className={`px-4 py-2 text-center text-xs leading-5 ${
            notice.tone === "warning" ? "text-amber-600" : "text-sky-600"
          }`}
          key={`${notice.label}:${notice.text}`}
        >
          <span className="font-semibold">{notice.label}:</span> {notice.text}
        </p>
      ))}
    </div>
  );
}

export function BookCinemaStatusChip({
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
    return "Audio ready";
  }
  if (!job) {
    return "Audio missing";
  }
  if (["queued", "optimizing", "synthesizing", "checking", "retrying"].includes(job.status)) {
    return "Creating";
  }
  if (job.status === "cancelled") {
    return job.terminalReason === "user_cancelled" ? "Cancelled" : "Stopped";
  }
  if (job.status === "failed") {
    return "Try again";
  }
  return job.status;
}

export function BookCinemaTimingStatusChip({
  display,
  onClick,
}: Readonly<{ display: ReturnType<typeof resolveTimingConfidenceDisplay>; onClick?: () => void }>) {
  const className =
    "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-500 sm:px-3 sm:py-1.5 sm:text-sm";
  if (onClick) {
    return (
      <button className={className} onClick={onClick} title={display.detail} type="button">
        {display.label}
      </button>
    );
  }
  return (
    <span className={className} title={display.detail}>
      {display.label}
    </span>
  );
}

function BookCinemaHighlightConfidence({
  display,
}: Readonly<{ display: ReturnType<typeof resolveTimingConfidenceDisplay> }>) {
  return (
    <div className="grid gap-2 text-sm">
      <BookCinemaHealthRow
        label="Timing mode"
        value={display.isDegraded ? display.label : "Word sync"}
      />
      <p className="rounded-md border bg-[var(--vs-raised)] px-3 py-2 text-xs leading-5 vs-border vs-muted">
        {display.detail}
      </p>
    </div>
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
  alignmentStatus,
  cursorSec,
  highlightCue,
  highlightMap,
  readAlongRuntime,
}: Readonly<{
  alignmentStatus: AlignmentStatus;
  cursorSec: number;
  highlightCue: HighlightCue | null;
  highlightMap: HighlightMap | null;
  readAlongRuntime?: ReadAlongRuntimeSnapshot | null;
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
        <dt className="vs-muted">Alignment status</dt>
        <dd className="truncate text-right">{alignmentStatus.label}</dd>
        <dt className="vs-muted">Primary level</dt>
        <dd className="truncate text-right">{alignmentStatus.primaryLevel}</dd>
        {readAlongRuntime ? (
          <>
            <dt className="vs-muted">Runtime state</dt>
            <dd className="truncate text-right">{readAlongRuntimeStateLabel(readAlongRuntime)}</dd>
            <dt className="vs-muted">Expected token</dt>
            <dd className="truncate text-right">{readAlongRuntime.expectedTokenIndex ?? "-"}</dd>
            <dt className="vs-muted">Runtime drift</dt>
            <dd className="truncate text-right">
              {readAlongRuntime.driftMs === null
                ? "-"
                : `${Math.round(readAlongRuntime.driftMs).toString()}ms`}
            </dd>
          </>
        ) : null}
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
  canvasFirst,
  scope,
  scopedSpans,
  scopedText,
  scopeContent,
  accessibilitySettings,
  highlightStyle,
  pointerLabel,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  scrollFollow,
  syncDataAttributes,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  canvasFirst: boolean;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  highlightStyle: ReadAlongHighlightStyle;
  pointerLabel: string | null;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  scrollFollow: ReadAlongScrollFollow;
  syncDataAttributes: Record<string, string | number>;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const presentation = bookCinemaReaderPresentation();
  if (book.kind === "markdown") {
    return (
      <Suspense fallback={<BookDocumentReaderSkeleton book={book} scope={scope} />}>
        <LazyBookDocumentReaderStage
          activeWordIndex={activeWordIndex}
          book={book}
          canvasFirst={canvasFirst}
          scope={scope}
          scopedSpans={scopedSpans}
          scopedText={scopedText}
          scopeContent={scopeContent}
          accessibilitySettings={accessibilitySettings}
          highlightStyle={highlightStyle}
          pointerLabel={pointerLabel}
          onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          phraseWordEnd={phraseWordEnd}
          phraseWordStart={phraseWordStart}
          readAlongVisualMode={readAlongVisualMode}
          scrollFollow={scrollFollow}
        />
      </Suspense>
    );
  }
  if (presentation === "follow") {
    return (
      <BookFollowReaderStage
        activeWordIndex={activeWordIndex}
        book={book}
        canvasFirst={canvasFirst}
        scope={scope}
        scopedSpans={scopedSpans}
        scopedText={scopedText}
        scopeContent={scopeContent}
        accessibilitySettings={accessibilitySettings}
        highlightStyle={highlightStyle}
        pointerLabel={pointerLabel}
        phraseWordEnd={phraseWordEnd}
        phraseWordStart={phraseWordStart}
        readAlongVisualMode={readAlongVisualMode}
        scrollFollow={scrollFollow}
        syncDataAttributes={syncDataAttributes}
        onAccessibilitySettingsChange={onAccessibilitySettingsChange}
      />
    );
  }
  return (
    <BookPagedReaderStage
      activeWordIndex={activeWordIndex}
      book={book}
      canvasFirst={canvasFirst}
      scope={scope}
      scopedSpans={scopedSpans}
      scopedText={scopedText}
      scopeContent={scopeContent}
      accessibilitySettings={accessibilitySettings}
      highlightStyle={highlightStyle}
      phraseWordEnd={phraseWordEnd}
      phraseWordStart={phraseWordStart}
      readAlongVisualMode={readAlongVisualMode}
      scrollFollow={scrollFollow}
      syncDataAttributes={syncDataAttributes}
      onAccessibilitySettingsChange={onAccessibilitySettingsChange}
    />
  );
}

type BookCinemaReaderPresentation = "follow" | "pages";

function bookCinemaReaderPresentation(): BookCinemaReaderPresentation {
  return "follow";
}

function BookFollowReaderStage({
  activeWordIndex,
  book,
  canvasFirst,
  scope,
  scopedSpans,
  scopedText,
  scopeContent,
  accessibilitySettings,
  highlightStyle,
  pointerLabel,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  scrollFollow,
  syncDataAttributes,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  canvasFirst: boolean;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  highlightStyle: ReadAlongHighlightStyle;
  pointerLabel: string | null;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  scrollFollow: ReadAlongScrollFollow;
  syncDataAttributes: Record<string, string | number>;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const readerRef = useRef<HTMLDivElement | null>(null);
  const activeSpan = scopedSpans.find((span) => span.index === activeWordIndex) ?? null;
  const activeBlock = bookCinemaActiveBlock(
    bookPageBlocksFromScopeContent(scopeContent),
    activeSpan,
  );
  const followPage = useMemo<BookPage | null>(() => {
    if (scopedSpans.length === 0) {
      return null;
    }
    const firstSpan = scopedSpans[0];
    const lastSpan = scopedSpans.at(-1) ?? firstSpan;
    return {
      endWordIndex: lastSpan.index,
      index: 0,
      spans: scopedSpans,
      startWordIndex: firstSpan.index,
    };
  }, [scopedSpans]);
  const blocks = useMemo(
    () =>
      bookPageStructuredBlocks({
        blocks: bookPageBlocksFromScopeContent(scopeContent),
        page: followPage,
        scopeKey: bookScopeKey(scope),
        scopedText,
        sourceId: book.id,
      }),
    [book.id, followPage, scope, scopedText, scopeContent],
  );
  const visibleFallback = scopedText.split(/\s+/).filter(Boolean).slice(0, 180).join(" ");
  const textClass = `${READER_TEXT_SCALE_CLASS[accessibilitySettings.textScale]} ${
    READER_LINE_SPACING_CLASS[accessibilitySettings.lineSpacing]
  }`;
  const scrollBehavior = readerScrollBehavior(accessibilitySettings);

  useEffect(() => {
    if (activeWordIndex < 0) {
      return;
    }
    scrollReadAlongAnchor(
      readerRef.current,
      readAlongAnchorForWord({
        fallbackTextQuote: activeSpan?.text,
        nodeId: activeBlock?.id,
        pageIndex: activeSpan?.pageIndex,
        sourceId: book.id,
        wordIndex: activeWordIndex,
      }),
      {
        autoFollow: true,
        fallbackSelectors: [
          '[aria-current="true"][data-readalong-word-index]',
          ".book-cinema-word-active",
          ".book-cinema-word-phrase",
        ],
        mode: readAlongVisualMode,
        scrollFollow,
        settings: accessibilitySettings,
        surface: "book",
      },
    );
  }, [
    accessibilitySettings,
    activeBlock?.id,
    activeSpan?.pageIndex,
    activeSpan?.text,
    activeWordIndex,
    book.id,
    readAlongVisualMode,
    scrollFollow,
  ]);

  useEffect(() => {
    const label = pointerLabel?.trim();
    if (!label) {
      return;
    }
    const heading = [...(readerRef.current?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? [])].find(
      (element) => element.textContent.trim() === label,
    );
    heading?.scrollIntoView({ block: "start", inline: "nearest", behavior: scrollBehavior });
  }, [pointerLabel, scrollBehavior]);

  return (
    <ReaderCanvasFrame
      canvasFirst={canvasFirst}
      contentClassName="book-cinema-follow-reader min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-12"
      contentDataAttributes={{
        "data-book-reader-presentation": "follow",
        "data-book-pages-per-spread": 1,
        "data-readalong-highlight-style": highlightStyle,
        "data-readalong-scroll-follow": scrollFollow,
        ...syncDataAttributes,
      }}
      contentRef={readerRef}
      measureClassName={READER_MEASURE_CLASS[accessibilitySettings.measure]}
      toolbar={
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <BookPageHeading book={book} scope={scope} />
          <div className="flex items-center gap-2 text-sm">
            <span className="vs-muted hidden text-xs font-semibold uppercase tracking-[0.16em] sm:inline">
              Follow
            </span>
            <BookReaderTextButton
              label="Decrease text size"
              onClick={() => {
                onAccessibilitySettingsChange({
                  ...accessibilitySettings,
                  textScale: decreaseBookTextSize(accessibilitySettings.textScale),
                });
              }}
            >
              A-
            </BookReaderTextButton>
            <BookReaderTextButton
              label="Increase text size"
              onClick={() => {
                onAccessibilitySettingsChange({
                  ...accessibilitySettings,
                  textScale: increaseBookTextSize(accessibilitySettings.textScale),
                });
              }}
            >
              A+
            </BookReaderTextButton>
          </div>
        </div>
      }
    >
      <div className={`book-cinema-follow-copy mx-auto ${textClass}`}>
        {blocks.length > 0 ? (
          blocks.map((block) => (
            <BookFollowReaderBlock
              activeWordIndex={activeWordIndex}
              block={block}
              highlightStyle={highlightStyle}
              key={block.id}
              phraseWordEnd={phraseWordEnd}
              phraseWordStart={phraseWordStart}
              readAlongVisualMode={readAlongVisualMode}
              sourceId={book.id}
            />
          ))
        ) : (
          <p className="book-cinema-follow-block book-cinema-follow-block--body">
            {visibleFallback}
          </p>
        )}
      </div>
    </ReaderCanvasFrame>
  );
}

function BookReaderTextButton({
  children,
  label,
  onClick,
}: Readonly<{ children: ReactNode; label: string; onClick: () => void }>) {
  return (
    <button
      aria-label={label}
      className="cinema-touch-target rounded-md border px-3 text-base font-semibold vs-border"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function BookFollowReaderBlock({
  activeWordIndex,
  block,
  highlightStyle,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  sourceId,
}: Readonly<{
  activeWordIndex: number;
  block: BookPageStructuredBlock;
  highlightStyle: ReadAlongHighlightStyle;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  sourceId: string;
}>) {
  const BlockElement = bookReaderPageBlockElement(block.kind);
  return (
    <BlockElement
      className={bookFollowReaderBlockClassName(block.kind)}
      data-book-page-block-kind={block.kind}
      data-readalong-node-id={block.sourceBlockId}
      id={block.sourceBlockId ? `cinema-block-${block.sourceBlockId}` : undefined}
    >
      <HighlightRenderer
        activeWordIndex={activeWordIndex}
        highlightStyle={highlightStyle}
        mode={readAlongVisualMode}
        nodeId={block.sourceBlockId}
        phraseWordEnd={phraseWordEnd}
        phraseWordStart={phraseWordStart}
        sourceId={sourceId}
        surface="book"
        tokens={block.tokens}
      />
    </BlockElement>
  );
}

function bookFollowReaderBlockClassName(kind: BookPageStructuredBlock["kind"]): string {
  const normalizedKind = BOOK_PAGE_BLOCK_STYLE_KINDS.has(kind) ? kind : "body";
  return `book-cinema-follow-block book-cinema-follow-block--${normalizedKind}`;
}

function BookPagedReaderStage({
  activeWordIndex,
  book,
  canvasFirst,
  scope,
  scopedSpans,
  scopedText,
  scopeContent,
  accessibilitySettings,
  highlightStyle,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  scrollFollow,
  syncDataAttributes,
  onAccessibilitySettingsChange,
}: Readonly<{
  activeWordIndex: number;
  book: BookSource;
  canvasFirst: boolean;
  scope: BookScope;
  scopedSpans: NonNullable<BookSource["wordSpans"]>;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  accessibilitySettings: ReaderAccessibilitySettings;
  highlightStyle: ReadAlongHighlightStyle;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  scrollFollow: ReadAlongScrollFollow;
  syncDataAttributes: Record<string, string | number>;
  onAccessibilitySettingsChange: (settings: ReaderAccessibilitySettings) => void;
}>) {
  const pageMetrics = useBookPageMetrics(accessibilitySettings);
  const [pageFit, setPageFit] = useState({
    fallbackScroll: false,
    key: "",
    wordsPerPage: pageMetrics.wordsPerPage,
  });
  const pageFitKey = [
    book.id,
    bookScopeKey(scope),
    pageMetrics.pagesPerSpread,
    pageMetrics.wordsPerPage,
    pageMetrics.fontSizePx,
    pageMetrics.lineHeightRatio,
  ].join(":");
  useEffect(() => {
    setPageFit({
      fallbackScroll: false,
      key: pageFitKey,
      wordsPerPage: pageMetrics.wordsPerPage,
    });
  }, [pageFitKey, pageMetrics.wordsPerPage]);
  const fittedWordsPerPage =
    pageFit.key === pageFitKey
      ? Math.min(pageFit.wordsPerPage, pageMetrics.wordsPerPage)
      : pageMetrics.wordsPerPage;
  const pagination = useMemo(
    () =>
      paginateBookSpans(scopedSpans, activeWordIndex, {
        pagesPerSpread: pageMetrics.pagesPerSpread,
        wordsPerPage: fittedWordsPerPage,
      }),
    [activeWordIndex, fittedWordsPerPage, pageMetrics.pagesPerSpread, scopedSpans],
  );
  const renderedPageFitKey = pagination.pages
    .map((page) => `${page.startWordIndex.toString()}-${page.endWordIndex.toString()}`)
    .join("|");
  useEffect(() => {
    const element = pageMetrics.element;
    if (!element) {
      return;
    }
    if (!renderedPageFitKey) {
      return;
    }
    const copies = [...element.querySelectorAll<HTMLElement>(".book-cinema-page-copy")].filter(
      (copy) => copy.offsetParent !== null,
    );
    if (copies.length === 0) {
      return;
    }
    const overflowing = copies.some((copy) => copy.scrollHeight > copy.clientHeight + 2);
    for (const copy of copies) {
      const hiddenOverflow = copy.scrollHeight > copy.clientHeight + 2 && !pageFit.fallbackScroll;
      copy.dataset.bookPageOverflow = hiddenOverflow ? "true" : "false";
    }
    if (!overflowing) {
      return;
    }
    const minimumWordsPerPage = 18;
    if (fittedWordsPerPage > minimumWordsPerPage) {
      setPageFit((current) => {
        if (current.key !== pageFitKey) {
          return current;
        }
        return {
          ...current,
          wordsPerPage: Math.max(minimumWordsPerPage, Math.floor(fittedWordsPerPage * 0.86)),
        };
      });
      return;
    }
    if (!pageFit.fallbackScroll) {
      setPageFit((current) =>
        current.key === pageFitKey ? { ...current, fallbackScroll: true } : current,
      );
    }
  }, [
    fittedWordsPerPage,
    pageFit.fallbackScroll,
    pageFitKey,
    pageMetrics.element,
    renderedPageFitKey,
  ]);
  const displayedPages: (BookPage | null)[] =
    pagination.pages.length > 0 ? pagination.pages : [null];
  const pagesPerSpread = pagination.totalPages <= 1 ? 1 : pagination.pagesPerSpread;

  return (
    <ReaderCanvasFrame
      canvasFirst={canvasFirst}
      contentClassName={`book-cinema-spread grid min-h-0 flex-1 overflow-hidden ${
        pagesPerSpread === 2 ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : "grid-cols-1"
      }`}
      contentDataAttributes={{
        "data-book-pages-per-spread": pagesPerSpread,
        ...syncDataAttributes,
      }}
      contentRef={pageMetrics.ref}
      measureClassName={READER_MEASURE_CLASS[accessibilitySettings.measure]}
      toolbar={
        <div className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5 vs-border">
          <BookPageHeading book={book} scope={scope} />
          <BookPaginationControls
            accessibilitySettings={accessibilitySettings}
            pagination={pagination}
            onAccessibilitySettingsChange={onAccessibilitySettingsChange}
          />
        </div>
      }
    >
      {displayedPages.map((page, index) => (
        <BookReaderPage
          activeWordIndex={activeWordIndex}
          book={book}
          fontSizePx={pageMetrics.fontSizePx}
          highlightStyle={highlightStyle}
          isActivePage={isReaderPageActive(page, activeWordIndex)}
          isRightPage={index === 1}
          lineHeightRatio={pageMetrics.lineHeightRatio}
          allowPageScroll={pageFit.fallbackScroll}
          key={`${book.id}-${bookScopeKey(scope)}-${String(page?.index ?? "fallback")}`}
          page={page}
          phraseWordEnd={phraseWordEnd}
          phraseWordStart={phraseWordStart}
          readAlongVisualMode={readAlongVisualMode}
          scrollFollow={scrollFollow}
          scope={scope}
          scopedText={index === 0 || page ? scopedText : ""}
          scopeContent={scopeContent}
          totalPages={pagination.totalPages}
        />
      ))}
      {displayedPages.length === 1 && pagesPerSpread === 2 && pagination.totalPages > 1 ? (
        <BookReaderPage
          activeWordIndex={activeWordIndex}
          book={book}
          fontSizePx={pageMetrics.fontSizePx}
          highlightStyle={highlightStyle}
          isActivePage={false}
          isRightPage
          lineHeightRatio={pageMetrics.lineHeightRatio}
          allowPageScroll={pageFit.fallbackScroll}
          page={null}
          phraseWordEnd={phraseWordEnd}
          phraseWordStart={phraseWordStart}
          readAlongVisualMode={readAlongVisualMode}
          scrollFollow={scrollFollow}
          scope={scope}
          scopedText=""
          scopeContent={null}
          totalPages={pagination.totalPages}
        />
      ) : null}
    </ReaderCanvasFrame>
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
        className="cinema-touch-target rounded-md border px-3 font-semibold vs-border"
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
        className="cinema-touch-target rounded-md border px-3 font-semibold vs-border"
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
  allowPageScroll,
  activeWordIndex,
  book,
  fontSizePx,
  highlightStyle,
  isActivePage,
  isRightPage = false,
  lineHeightRatio,
  page,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  scrollFollow,
  scope,
  scopedText,
  scopeContent,
  totalPages,
}: Readonly<{
  allowPageScroll?: boolean;
  activeWordIndex: number;
  book: BookSource;
  fontSizePx: number;
  highlightStyle: ReadAlongHighlightStyle;
  isActivePage: boolean;
  isRightPage?: boolean;
  lineHeightRatio: number;
  page: BookPage | null;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  scrollFollow: ReadAlongScrollFollow;
  scope: BookScope;
  scopedText: string;
  scopeContent: BookSourceScopeContent | null;
  totalPages: number;
}>) {
  const pageNumber = page ? page.index + 1 : totalPages + 1;
  const pageLabel = page ? `Reader page ${String(pageNumber)} of ${String(totalPages)}` : "End";
  const visibleFallback = scopedText.split(/\s+/).filter(Boolean).slice(0, 120).join(" ");
  const pageBlocks = useMemo(
    () =>
      bookPageStructuredBlocks({
        blocks: bookPageBlocksFromScopeContent(scopeContent),
        page,
        scopeKey: bookScopeKey(scope),
        scopedText,
        sourceId: book.id,
      }),
    [book.id, page, scope, scopedText, scopeContent],
  );

  return (
    <article
      className={`book-cinema-page-shell ${isRightPage ? "book-cinema-page-shell--right" : ""} ${
        isActivePage ? "book-cinema-page-shell--active" : ""
      }`}
      data-book-reader-page={page?.index ?? "blank"}
      data-readalong-scroll-follow={scrollFollow}
    >
      <header className="book-cinema-page-header">
        <span className="truncate">{bookScopeLabel(scope)}</span>
        <span>{pageLabel}</span>
      </header>
      <div
        className={`book-cinema-page-copy ${
          allowPageScroll ? "book-cinema-page-copy--fit-scroll" : ""
        }`}
        style={
          {
            "--book-page-font-size": `${String(fontSizePx)}px`,
            "--book-page-line-height": String(lineHeightRatio),
          } as CSSProperties
        }
      >
        {page && pageBlocks.length > 0 ? (
          pageBlocks.map((block) => (
            <BookReaderPageBlock
              activeWordIndex={activeWordIndex}
              block={block}
              highlightStyle={highlightStyle}
              key={block.id}
              phraseWordEnd={phraseWordEnd}
              phraseWordStart={phraseWordStart}
              readAlongVisualMode={readAlongVisualMode}
              sourceId={book.id}
            />
          ))
        ) : (
          <p className="book-cinema-page-block book-cinema-page-block--body">{visibleFallback}</p>
        )}
      </div>
      <footer className="book-cinema-page-footer">
        <span>{bookSourceName(book)}</span>
        <span>{page ? String(pageNumber) : ""}</span>
      </footer>
    </article>
  );
}

function BookReaderPageBlock({
  activeWordIndex,
  block,
  highlightStyle,
  phraseWordEnd,
  phraseWordStart,
  readAlongVisualMode,
  sourceId,
}: Readonly<{
  activeWordIndex: number;
  block: BookPageStructuredBlock;
  highlightStyle: ReadAlongHighlightStyle;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  readAlongVisualMode: ReadAlongHighlightVisualMode;
  sourceId: string;
}>) {
  const BlockElement = bookReaderPageBlockElement(block.kind);
  return (
    <BlockElement
      className={bookReaderPageBlockClassName(block.kind)}
      data-book-page-block-kind={block.kind}
      data-readalong-node-id={block.sourceBlockId}
      id={block.sourceBlockId ? `cinema-block-${block.sourceBlockId}` : undefined}
    >
      <HighlightRenderer
        activeWordIndex={activeWordIndex}
        highlightStyle={highlightStyle}
        mode={readAlongVisualMode}
        nodeId={block.sourceBlockId}
        phraseWordEnd={phraseWordEnd}
        phraseWordStart={phraseWordStart}
        sourceId={sourceId}
        surface="book"
        tokens={block.tokens}
      />
    </BlockElement>
  );
}

function bookReaderPageBlockElement(kind: BookPageStructuredBlock["kind"]): ElementType {
  if (kind === "heading") {
    return "h1";
  }
  if (kind === "subheading") {
    return "h2";
  }
  if (kind === "quote") {
    return "blockquote";
  }
  if (kind === "code" || kind === "table") {
    return "pre";
  }
  return "p";
}

function bookReaderPageBlockClassName(kind: BookPageStructuredBlock["kind"]): string {
  const normalizedKind = BOOK_PAGE_BLOCK_STYLE_KINDS.has(kind) ? kind : "body";
  return `book-cinema-page-block book-cinema-page-block--${normalizedKind}`;
}

const BOOK_PAGE_BLOCK_STYLE_KINDS = new Set<BookPageStructuredBlock["kind"]>([
  "body",
  "caption",
  "code",
  "footnote",
  "heading",
  "list",
  "quote",
  "subheading",
  "table",
]);

function useBookPageMetrics(settings: ReaderAccessibilitySettings): {
  element: HTMLDivElement | null;
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
    const baseFontPx = READER_TEXT_SCALE_FONT_PX[settings.textScale];
    const lineHeightRatio = READER_LINE_HEIGHT_RATIO[settings.lineSpacing];
    return {
      element,
      fontSizePx: baseFontPx,
      lineHeightRatio,
      pagesPerSpread,
      ref: setElement,
      wordsPerPage: estimateBookWordsPerPage({
        lineSpacing: settings.lineSpacing,
        pagesPerSpread,
        textScale: settings.textScale,
        viewportHeight,
        viewportWidth,
      }),
    };
  }, [element, settings.lineSpacing, settings.textScale, size.height, size.width]);
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
  blocks: readonly NarrationBlock[],
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

function findScopeByOptionKey(options: BookScopeOption[], key: string): BookScope | undefined {
  return options.find((option) => option.key === key)?.scope;
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
