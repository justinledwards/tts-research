import { useEffect, useMemo, useRef, useState } from "react";
import { Button, SegmentedControl, StatusChip, cx, fieldControlClassName } from "../../design";
import type {
  BookSource,
  BookSourceWordSpan,
  MarkdownParseMode,
  PreparedSource,
  SourceReadinessConfirmationRequest,
  TemporarySourceSession,
  TemporaryStorageUsageSummary,
} from "../../types";
import {
  DEFAULT_TEMPORARY_SOURCE_BEHAVIOR,
  type TemporarySourceBehaviorSettings,
} from "../settings/model";
import {
  detectIntakeSource,
  sourceTypeLabel,
  type IntakeSourceChoice,
  type IntakeSourceType,
} from "../intake/sourceTypeModel";
import { WebsiteExtractionSummary } from "../website-cinema/WebsiteExtractionSummary";

export type QuickListenMode = "paste" | "url" | "file" | "recent";
type QuickListenDestination = "review" | "preview";

export interface QuickListenPanelProps {
  error: string | null;
  initialMode?: QuickListenMode;
  isOpen: boolean;
  isSubmitting: boolean;
  recentSources: TemporarySourceSession[];
  storageUsage?: TemporaryStorageUsageSummary | null;
  temporaryBehavior?: TemporarySourceBehaviorSettings;
  onCleanup: (
    source: TemporarySourceSession,
    action: "removeGeneratedAudioOnly" | "removeAllTemporaryArtifacts",
  ) => Promise<void>;
  onClearExpired: () => Promise<void>;
  onClose: () => void;
  onCreateFromFile: (
    file: File,
    markdownParseMode: MarkdownParseMode,
    confirmation: SourceReadinessConfirmationRequest,
    destination: QuickListenDestination,
  ) => Promise<void>;
  onCreateFromText: (
    text: string,
    markdownParseMode: MarkdownParseMode,
    confirmation: SourceReadinessConfirmationRequest,
    destination: QuickListenDestination,
    sourceName?: string,
  ) => Promise<void>;
  onCreateFromUrl: (
    url: string,
    markdownParseMode: MarkdownParseMode,
    confirmation: SourceReadinessConfirmationRequest,
    destination: QuickListenDestination,
  ) => Promise<void>;
  onDiscard: (source: TemporarySourceSession) => Promise<void>;
  onExtend: (source: TemporarySourceSession, extendByHours: number) => Promise<void>;
  onUseRecentSource: (source: TemporarySourceSession) => Promise<void>;
}

const ACCEPTED_QUICK_LISTEN_FILE_TYPES =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/tiff,image/webp";

export function QuickListenPanel({
  error,
  initialMode,
  isOpen,
  isSubmitting,
  recentSources,
  storageUsage,
  temporaryBehavior = DEFAULT_TEMPORARY_SOURCE_BEHAVIOR,
  onCleanup,
  onClearExpired,
  onClose,
  onCreateFromFile,
  onCreateFromText,
  onCreateFromUrl,
  onDiscard,
  onExtend,
  onUseRecentSource,
}: Readonly<QuickListenPanelProps>) {
  const [mode, setMode] = useState<QuickListenMode>(initialMode ?? "paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [markdownParseMode, setMarkdownParseMode] = useState<MarkdownParseMode>("strict");
  const [sourceType, setSourceType] = useState<IntakeSourceType>("document");
  const [language, setLanguage] = useState("en-US");
  const [title, setTitle] = useState("");
  const [hasEditedMetadata, setHasEditedMetadata] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [expiryHours, setExpiryHours] = useState(24);
  const [askBeforeAudioDiscard, setAskBeforeAudioDiscard] = useState(true);
  const [autoCleanExpired, setAutoCleanExpired] = useState(true);
  const [includeTemporaryDiagnostics, setIncludeTemporaryDiagnostics] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setExpiryHours(expiryDurationHours(temporaryBehavior.expiryDuration));
    setAskBeforeAudioDiscard(temporaryBehavior.askBeforeDiscardingAudio);
    setAutoCleanExpired(temporaryBehavior.autoClean);
  }, [
    isOpen,
    temporaryBehavior.askBeforeDiscardingAudio,
    temporaryBehavior.autoClean,
    temporaryBehavior.expiryDuration,
  ]);

  useEffect(() => {
    if (!isOpen || !initialMode) {
      return;
    }
    setMode(initialMode);
    setLocalError(null);
    if (!hasEditedMetadata) {
      setSourceType(initialMode === "url" ? "webpage" : "document");
    }
  }, [hasEditedMetadata, initialMode, isOpen]);

  const detection = useMemo(() => {
    const sourceChoice = sourceChoiceForQuickListenMode(mode);
    return detectIntakeSource({
      fileName: file?.name,
      intentId: mode === "url" ? "webpage" : "document",
      pastedText: text,
      sourceChoice,
      templateSourceType: sourceType,
      url,
    });
  }, [file?.name, mode, sourceType, text, url]);

  const effectiveTitle =
    title.trim() || detection.title || sourceNameForTemporaryInput(mode, file, url);
  const effectiveLanguage = language.trim() || detection.language || "en-US";
  const confirmation = {
    language: effectiveLanguage,
    sourceType,
    structureLabel: detection.structureLabel,
    title: effectiveTitle,
  } satisfies SourceReadinessConfirmationRequest;

  if (!isOpen) {
    return null;
  }

  const submit = (destination: QuickListenDestination) => {
    setLocalError(null);
    if (mode === "paste") {
      if (text.trim().length < 12) {
        setLocalError("Paste at least a sentence so Quick Listen has something useful to read.");
        return;
      }
      void onCreateFromText(text, markdownParseMode, confirmation, destination, effectiveTitle);
      return;
    }
    if (mode === "url") {
      const trimmedUrl = url.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(trimmedUrl)) {
        setLocalError("Enter a full http or https URL.");
        return;
      }
      void onCreateFromUrl(trimmedUrl, markdownParseMode, confirmation, destination);
      return;
    }
    if (mode === "file") {
      if (!file) {
        setLocalError("Choose or drop a supported document before starting Quick Listen.");
        return;
      }
      if (!quickListenFileLooksSupported(file)) {
        setLocalError("That file type is not supported for Quick Listen yet.");
        return;
      }
      void onCreateFromFile(file, markdownParseMode, confirmation, destination);
      return;
    }
    if (recentSources.length === 0) {
      setLocalError("No temporary sources are available in this app session.");
      return;
    }
    void onUseRecentSource(recentSources[0]);
  };

  const displayError = localError ?? error;
  return (
    <div
      className="fixed inset-0 z-[65] bg-[var(--vs-surface-overlay)] px-3 py-6 sm:px-6"
      role="presentation"
    >
      <section
        aria-label="Quick Listen"
        aria-modal="true"
        className="vs-app mx-auto flex max-h-[min(760px,calc(100vh-3rem))] w-full max-w-2xl flex-col overflow-hidden rounded-lg border bg-[var(--vs-raised)] shadow-2xl vs-border"
        role="dialog"
      >
        <header className="grid gap-3 border-b p-4 vs-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="vs-muted text-xs font-semibold uppercase tracking-wide">
                Temporary narration
              </p>
              <h2 className="mt-1 text-xl font-semibold">Quick Listen</h2>
              <p className="vs-muted mt-1 max-w-xl text-sm leading-6">
                Read this now without making a project source. You can keep it in a project after
                the review is useful.
              </p>
            </div>
            <Button onClick={onClose} size="sm" variant="secondary">
              Close
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <StatusChip tone="metadata">Temporary</StatusChip>
            <StatusChip tone="success">Local-first when possible</StatusChip>
            <StatusChip tone="warning">Expires after about {expiryHours} hours</StatusChip>
          </div>
          <TemporaryStorageControls
            askBeforeAudioDiscard={askBeforeAudioDiscard}
            autoCleanExpired={autoCleanExpired}
            expiryHours={expiryHours}
            includeTemporaryDiagnostics={includeTemporaryDiagnostics}
            storageUsage={storageUsage}
            onClearExpired={onClearExpired}
            onSetAskBeforeAudioDiscard={setAskBeforeAudioDiscard}
            onSetAutoCleanExpired={setAutoCleanExpired}
            onSetExpiryHours={setExpiryHours}
            onSetIncludeTemporaryDiagnostics={setIncludeTemporaryDiagnostics}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <SegmentedControl
            ariaLabel="Quick Listen source"
            options={[
              { label: "Paste", value: "paste" },
              { label: "URL", value: "url" },
              { label: "File", value: "file" },
              { label: "Recent", value: "recent" },
            ]}
            value={mode}
            onChange={(value) => {
              setMode(value);
              setLocalError(null);
              if (!hasEditedMetadata) {
                const nextType = value === "url" ? "webpage" : "document";
                setSourceType(nextType);
              }
            }}
          />

          <div className="mt-4 grid gap-4">
            {mode === "paste" ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Paste text</span>
                <textarea
                  className={cx(fieldControlClassName, "min-h-44 resize-y p-3 leading-6")}
                  onChange={(event) => {
                    setText(event.currentTarget.value);
                    if (!hasEditedMetadata) {
                      setTitle(titleFromQuickText(event.currentTarget.value));
                    }
                  }}
                  placeholder="Paste the article, note, or excerpt you want narrated now."
                  value={text}
                />
              </label>
            ) : null}

            {mode === "url" ? (
              <label className="grid gap-2">
                <span className="text-sm font-semibold">Enter URL</span>
                <input
                  className={fieldControlClassName}
                  onChange={(event) => {
                    setUrl(event.currentTarget.value);
                    if (!hasEditedMetadata) {
                      setTitle(titleFromUrl(event.currentTarget.value));
                      setSourceType("webpage");
                    }
                  }}
                  placeholder="https://example.com/article"
                  type="url"
                  value={url}
                />
                <div className="grid gap-2 rounded-md border p-3 text-sm leading-6 vs-border vs-surface">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip tone="metadata">Temporary webpage</StatusChip>
                    <StatusChip tone="warning">Safety checked before fetch</StatusChip>
                  </div>
                  <p className="vs-muted">
                    Readable article text, URL provenance, extraction confidence, and removed
                    clutter stay temporary until you keep the source in a project.
                  </p>
                </div>
              </label>
            ) : null}

            {mode === "file" ? (
              <button
                className="grid w-full gap-3 rounded-md border border-dashed p-4 text-left vs-border vs-surface"
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const dropped = event.dataTransfer.files.item(0);
                  setFile(dropped);
                  if (dropped && !hasEditedMetadata) {
                    setTitle(titleFromFileName(dropped.name));
                    setSourceType(sourceTypeForQuickFile(dropped.name));
                  }
                  setLocalError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                type="button"
              >
                <input
                  accept={ACCEPTED_QUICK_LISTEN_FILE_TYPES}
                  className="sr-only"
                  onChange={(event) => {
                    const selected = event.currentTarget.files?.[0] ?? null;
                    setFile(selected);
                    if (selected && !hasEditedMetadata) {
                      setTitle(titleFromFileName(selected.name));
                      setSourceType(sourceTypeForQuickFile(selected.name));
                    }
                    setLocalError(null);
                  }}
                  ref={fileInputRef}
                  type="file"
                />
                <div>
                  <p className="text-sm font-semibold">Drop file</p>
                  <p className="vs-muted mt-1 text-sm leading-6">
                    Documents, text, markdown, webpages, PDFs, EPUB, DOCX, and common image formats
                    can start as temporary narration.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--vs-action-secondary-border)] bg-[var(--vs-action-secondary-bg)] px-3 text-sm font-semibold text-[var(--vs-action-secondary-text)] shadow-sm">
                    Choose file
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">
                    {file?.name ?? "No file selected"}
                  </span>
                </div>
              </button>
            ) : null}

            {mode === "recent" ? null : (
              <div className="grid gap-3 rounded-md border p-3 vs-border vs-surface">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Confirm source details</p>
                  <StatusChip tone={detection.confidence === "low" ? "warning" : "metadata"}>
                    {detection.confidence} confidence
                  </StatusChip>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-xs font-semibold">
                    <span className="vs-muted">Title</span>
                    <input
                      className={fieldControlClassName}
                      onChange={(event) => {
                        setTitle(event.currentTarget.value);
                        setHasEditedMetadata(true);
                      }}
                      placeholder={detection.title}
                      value={title}
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    <span className="vs-muted">Source type</span>
                    <select
                      className={fieldControlClassName}
                      onChange={(event) => {
                        setSourceType(event.currentTarget.value as IntakeSourceType);
                        setHasEditedMetadata(true);
                      }}
                      value={sourceType}
                    >
                      <option value="document">Document</option>
                      <option value="draft">Draft text</option>
                      <option value="webpage">Webpage</option>
                      <option value="book">Book</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-xs font-semibold">
                    <span className="vs-muted">Language</span>
                    <select
                      className={fieldControlClassName}
                      onChange={(event) => {
                        setLanguage(event.currentTarget.value);
                        setHasEditedMetadata(true);
                      }}
                      value={language}
                    >
                      <option value="en-US">English</option>
                      <option value="sv-SE">Swedish</option>
                      <option value="es-ES">Spanish</option>
                      <option value="fr-FR">French</option>
                      <option value="de-DE">German</option>
                    </select>
                  </label>
                </div>
                <p className="vs-muted text-xs leading-5">
                  Detected as {sourceTypeLabel(sourceType)} with {detection.structureLabel}.
                </p>
              </div>
            )}

            {mode === "recent" ? (
              <RecentTemporarySources
                askBeforeAudioDiscard={askBeforeAudioDiscard}
                expiryHours={expiryHours}
                sources={recentSources}
                onCleanup={onCleanup}
                onDiscard={onDiscard}
                onExtend={onExtend}
                onUseRecentSource={onUseRecentSource}
              />
            ) : null}

            <label className="grid max-w-xs gap-2">
              <span className="text-sm font-semibold">Markdown parsing</span>
              <select
                className={fieldControlClassName}
                onChange={(event) => {
                  setMarkdownParseMode(event.currentTarget.value as MarkdownParseMode);
                }}
                value={markdownParseMode}
              >
                <option value="strict">Strict</option>
                <option value="legacy">Legacy</option>
              </select>
            </label>

            <div className="rounded-md border p-3 text-sm leading-6 vs-border vs-surface">
              <p className="font-semibold">Temporary source boundary</p>
              <p className="vs-muted mt-1">
                Quick Listen does not create a durable project source. Generated files and progress
                stay tied to this temporary session until it expires, is discarded, or is promoted.
                Promotion keeps a project copy without deleting this session unless you choose to
                clean it.
              </p>
            </div>

            {displayError ? (
              <p className="rounded-md border border-[var(--vs-danger-border)] bg-[var(--vs-danger-bg)] p-3 text-sm font-semibold text-[var(--vs-danger)]">
                {displayError}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t p-4 vs-border">
          <p className="vs-muted max-w-sm text-xs leading-5">
            Keep in project appears after there is useful temporary work to save.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isSubmitting}
              onClick={() => {
                submit("review");
              }}
              size="md"
              variant="secondary"
            >
              {isSubmitting ? "Starting..." : "Review first"}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => {
                submit("preview");
              }}
              size="md"
              variant="primary"
            >
              {isSubmitting ? "Starting..." : "Create quick preview"}
            </Button>
          </div>
        </footer>
      </section>
    </div>
  );
}

interface TemporaryStorageControlsProps {
  askBeforeAudioDiscard: boolean;
  autoCleanExpired: boolean;
  expiryHours: number;
  includeTemporaryDiagnostics: boolean;
  storageUsage?: TemporaryStorageUsageSummary | null;
  onClearExpired: () => Promise<void>;
  onSetAskBeforeAudioDiscard: (value: boolean) => void;
  onSetAutoCleanExpired: (value: boolean) => void;
  onSetExpiryHours: (value: number) => void;
  onSetIncludeTemporaryDiagnostics: (value: boolean) => void;
}

function TemporaryStorageControls({
  askBeforeAudioDiscard,
  autoCleanExpired,
  expiryHours,
  includeTemporaryDiagnostics,
  storageUsage,
  onClearExpired,
  onSetAskBeforeAudioDiscard,
  onSetAutoCleanExpired,
  onSetExpiryHours,
  onSetIncludeTemporaryDiagnostics,
}: Readonly<TemporaryStorageControlsProps>) {
  return (
    <div className="grid gap-3 rounded-md border p-3 text-xs leading-5 vs-border vs-surface">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Temporary storage</p>
          <p className="vs-muted">{temporaryUsageSummaryLabel(storageUsage)}</p>
        </div>
        <Button
          disabled={!storageUsage || storageUsage.expiredCount === 0}
          onClick={() => {
            void onClearExpired();
          }}
          size="sm"
          variant="secondary"
        >
          Clear expired
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 font-semibold">
          <span className="vs-muted">Expiry duration</span>
          <select
            className={fieldControlClassName}
            onChange={(event) => {
              onSetExpiryHours(Number(event.currentTarget.value));
            }}
            value={expiryHours}
          >
            <option value={6}>6 hours</option>
            <option value={24}>24 hours</option>
            <option value={72}>3 days</option>
            <option value={168}>7 days</option>
          </select>
        </label>
        <div className="grid gap-2">
          <TemporarySettingCheckbox
            checked={askBeforeAudioDiscard}
            label="Ask before discarding generated audio"
            onChange={onSetAskBeforeAudioDiscard}
          />
          <TemporarySettingCheckbox
            checked={autoCleanExpired}
            label="Auto-clean expired sessions"
            onChange={onSetAutoCleanExpired}
          />
          <TemporarySettingCheckbox
            checked={includeTemporaryDiagnostics}
            label="Include temporary sessions in diagnostics"
            onChange={onSetIncludeTemporaryDiagnostics}
          />
        </div>
      </div>
      {storageUsage && storageUsage.expiredCount > 0 ? (
        <p className="rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-[var(--vs-status-warning)]">
          {storageUsage.expiredCount} expired temporary session
          {storageUsage.expiredCount === 1 ? "" : "s"} can be cleaned.
        </p>
      ) : null}
    </div>
  );
}

function TemporarySettingCheckbox({
  checked,
  label,
  onChange,
}: Readonly<{ checked: boolean; label: string; onChange: (value: boolean) => void }>) {
  return (
    <label className="flex items-center gap-2">
      <input
        checked={checked}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
        type="checkbox"
      />
      <span>{label}</span>
    </label>
  );
}

interface RecentTemporarySourcesProps {
  askBeforeAudioDiscard: boolean;
  expiryHours: number;
  sources: TemporarySourceSession[];
  onCleanup: QuickListenPanelProps["onCleanup"];
  onDiscard: QuickListenPanelProps["onDiscard"];
  onExtend: QuickListenPanelProps["onExtend"];
  onUseRecentSource: QuickListenPanelProps["onUseRecentSource"];
}

function RecentTemporarySources({
  askBeforeAudioDiscard,
  expiryHours,
  sources,
  onCleanup,
  onDiscard,
  onExtend,
  onUseRecentSource,
}: Readonly<RecentTemporarySourcesProps>) {
  if (sources.length === 0) {
    return (
      <p className="vs-muted rounded-md border p-4 text-sm vs-border vs-surface">
        Recent temporary sources appear here after you start Quick Listen in this app session.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {sources.map((source) => (
        <TemporarySourceRow
          askBeforeAudioDiscard={askBeforeAudioDiscard}
          expiryHours={expiryHours}
          key={source.id}
          source={source}
          onCleanup={onCleanup}
          onDiscard={onDiscard}
          onExtend={onExtend}
          onUseRecentSource={onUseRecentSource}
        />
      ))}
    </div>
  );
}

interface TemporarySourceRowProps extends Omit<RecentTemporarySourcesProps, "sources"> {
  source: TemporarySourceSession;
}

function TemporarySourceRow({
  askBeforeAudioDiscard,
  expiryHours,
  source,
  onCleanup,
  onDiscard,
  onExtend,
  onUseRecentSource,
}: Readonly<TemporarySourceRowProps>) {
  return (
    <div className="grid gap-2 rounded-md border p-3 vs-border vs-surface sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap gap-2">
          {source.kind === "url" ? (
            <>
              <StatusChip tone="metadata">Temporary webpage</StatusChip>
              <WebsiteExtractionSummary source={temporarySessionToPreparedSource(source)} />
            </>
          ) : (
            <StatusChip tone="metadata">Temporary source</StatusChip>
          )}
        </div>
        <p className="truncate text-sm font-semibold">{source.title ?? source.sourceName}</p>
        <p className="vs-muted mt-1 text-xs">
          {source.wordCount.toLocaleString()} words · expires {formatExpiry(source.expiresAt)}
        </p>
        {source.status === "expired" ? (
          <p className="mt-2 rounded-md border border-[var(--vs-status-warning-border)] bg-[var(--vs-status-warning-bg)] px-3 py-2 text-xs font-semibold text-[var(--vs-status-warning)]">
            {source.error ??
              "This temporary source expired. Recovery metadata remains, but generated artifacts were cleaned."}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Button
          disabled={source.status === "expired"}
          onClick={() => {
            void onUseRecentSource(source);
          }}
          size="sm"
          variant="primary"
        >
          Open
        </Button>
        <Button
          onClick={() => {
            void onExtend(source, expiryHours);
          }}
          size="sm"
          variant="secondary"
        >
          Extend
        </Button>
        <Button
          onClick={() => {
            if (
              askBeforeAudioDiscard &&
              !globalThis.confirm(
                "Remove generated audio for this temporary session? Extracted source text and review state will remain.",
              )
            ) {
              return;
            }
            void onCleanup(source, "removeGeneratedAudioOnly");
          }}
          size="sm"
          variant="secondary"
        >
          Audio only
        </Button>
        <Button
          onClick={() => {
            if (
              !globalThis.confirm(
                "Remove all temporary artifacts for this session? Recovery metadata will remain, but source text, audio, timing, bookmarks, and progress will be cleaned.",
              )
            ) {
              return;
            }
            void onCleanup(source, "removeAllTemporaryArtifacts");
          }}
          size="sm"
          variant="secondary"
        >
          Artifacts
        </Button>
        <Button
          onClick={() => {
            if (
              !globalThis.confirm(
                "Discard this temporary session now? This removes temporary source data, generated audio, timing, bookmarks, progress, and diagnostics.",
              )
            ) {
              return;
            }
            void onDiscard(source);
          }}
          size="sm"
          variant="secondary"
        >
          Discard
        </Button>
      </div>
    </div>
  );
}

function sourceNameForTemporaryInput(
  mode: QuickListenMode,
  file: File | null,
  url: string,
): string {
  if (mode === "file" && file) {
    return titleFromFileName(file.name);
  }
  if (mode === "url") {
    return titleFromUrl(url);
  }
  return "Quick Listen paste";
}

function titleFromQuickText(value: string): string {
  return (
    value
      .trim()
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.replace(/^#+\s*/, "")
      .trim()
      .slice(0, 80) ?? ""
  );
}

function titleFromFileName(value: string): string {
  return (
    value
      .replace(/\.[^.]+$/, "")
      .replaceAll(/[-_]+/g, " ")
      .trim() || value
  );
}

function titleFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/");
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index]?.trim();
      if (part) {
        return part.replaceAll(/[-_]+/g, " ");
      }
    }
    return url.hostname;
  } catch {
    return value.trim();
  }
}

function sourceChoiceForQuickListenMode(mode: QuickListenMode): IntakeSourceChoice {
  if (mode === "file") {
    return "file";
  }
  if (mode === "url") {
    return "url";
  }
  return "pastedText";
}

function sourceTypeForQuickFile(value: string): IntakeSourceType {
  const extension = value.toLowerCase().split(".").pop() ?? "";
  if (extension === "html" || extension === "htm") {
    return "webpage";
  }
  if (extension === "epub" || extension === "pdf" || extension === "docx") {
    return "book";
  }
  return "document";
}

export function temporarySessionToPreparedSource(source: TemporarySourceSession): PreparedSource {
  return {
    blockCount: source.blockCount ?? source.blocks?.length ?? 0,
    blocks: source.blocks,
    createdAt: source.createdAt,
    id: source.id,
    kind: source.kind as PreparedSource["kind"],
    metadata: {
      ...source.metadata,
      temporaryExpiresAt: source.expiresAt,
      temporaryStatus: source.status,
    },
    projectId: "",
    renderMode: source.kind === "text" ? "markdown" : undefined,
    segmentCount: source.segmentCount ?? 0,
    skippedItems: source.skippedItems,
    sourceBytes: source.sourceBytes,
    sourceContentType: source.sourceContentType,
    sourceName: source.sourceName,
    sourceOwner: "temporary",
    sourceReadiness: source.sourceReadiness,
    sourceSpeechPolicyOverrides: source.sourceSpeechPolicyOverrides,
    sourceSpeechPolicyProfile: source.sourceSpeechPolicyProfile,
    sourceUrl: source.sourceUrl,
    speechPolicyProfile: "default",
    speechText: source.speechText,
    status: source.status === "failed" ? "failed" : "ready",
    summary: source.summary ?? {
      citationSkipCount: 0,
      headingCount: 0,
      sentenceSegmentCount: source.segmentCount ?? 0,
      skippedBlockCount: source.skippedItems?.length ?? 0,
      spokenBlockCount: source.blocks?.length ?? (source.text ? 1 : 0),
    },
    temporarySourceId: source.temporarySourceId,
    text: source.text,
    title: source.title,
    updatedAt: source.updatedAt,
    warnings: source.warnings,
    wordCount: source.wordCount,
  };
}

export function temporarySessionToBookSource(source: TemporarySourceSession): BookSource {
  const text = source.text ?? source.speechText ?? "";
  const wordSpans = temporaryBookWordSpans(text);
  const sourceFile = source.sourceName;
  return {
    chapterCount: text.trim() ? 1 : 0,
    chapters: text.trim()
      ? [
          {
            index: 0,
            isNarratable: true,
            title: source.title ?? sourceFile,
            text,
            wordCount: source.wordCount || wordSpans.length,
          },
        ]
      : [],
    createdAt: source.createdAt,
    id: source.id,
    ingestion: {
      supportTier: "temporary",
      supportTierLabel: "Temporary source",
      temporaryExpiresAt: source.expiresAt,
      temporaryStatus: source.status,
      warnings: source.warnings,
    },
    kind: temporaryBookKind(source.kind),
    pageCount: text.trim() ? 1 : 0,
    pages: text.trim()
      ? [
          {
            index: 0,
            label: "Temporary session",
            text,
            wordCount: source.wordCount || wordSpans.length,
          },
        ]
      : [],
    projectId: "",
    sourceBytes: source.sourceBytes ?? text.length,
    sourceFile,
    sourceOwner: "temporary",
    sourceReadiness: source.sourceReadiness,
    sourceSpeechPolicyOverrides: source.sourceSpeechPolicyOverrides,
    sourceSpeechPolicyProfile: source.sourceSpeechPolicyProfile,
    status: source.status === "failed" ? "failed" : "ready",
    temporarySourceId: source.temporarySourceId,
    text,
    title: source.title,
    updatedAt: source.updatedAt,
    warnings: source.warnings,
    wordCount: source.wordCount || wordSpans.length,
    wordSpans,
  };
}

export function temporarySessionPrefersBookCinema(source: TemporarySourceSession): boolean {
  return source.kind === "book" || source.kind === "epub" || source.kind === "pdf";
}

function temporaryBookKind(kind: TemporarySourceSession["kind"]): BookSource["kind"] {
  if (kind === "epub" || kind === "pdf") {
    return kind;
  }
  if (kind === "docx" || kind === "html" || kind === "markdown" || kind === "image") {
    return kind;
  }
  return "pdf";
}

function temporaryBookWordSpans(text: string): BookSourceWordSpan[] {
  const spans: BookSourceWordSpan[] = [];
  const wordPattern = /\S+/g;
  let match = wordPattern.exec(text);
  while (match) {
    spans.push({
      endOffset: match.index + match[0].length,
      index: spans.length,
      pageIndex: 0,
      startOffset: match.index,
      text: match[0],
    });
    match = wordPattern.exec(text);
  }
  return spans;
}

function quickListenFileLooksSupported(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return QUICK_LISTEN_SUPPORTED_EXTENSIONS.has(extension);
}

function expiryDurationHours(duration: TemporarySourceBehaviorSettings["expiryDuration"]): number {
  if (duration === "endOfSession") {
    return 1;
  }
  if (duration === "7d") {
    return 168;
  }
  return 24;
}

const QUICK_LISTEN_SUPPORTED_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "text",
  "log",
  "csv",
  "json",
  "html",
  "htm",
  "pdf",
  "epub",
  "docx",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "bmp",
  "webp",
]);

function formatExpiry(value: string): string {
  const expiresAt = new Date(value);
  if (Number.isNaN(expiresAt.getTime())) {
    return "soon";
  }
  return expiresAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function temporaryUsageSummaryLabel(storageUsage?: TemporaryStorageUsageSummary | null): string {
  if (!storageUsage) {
    return "Storage usage will appear after the backend responds.";
  }
  const sessionLabel = storageUsage.temporaryCount === 1 ? "session" : "sessions";
  return `${formatBytes(storageUsage.totalBytes)} across ${String(storageUsage.temporaryCount)} ${sessionLabel}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 || unitIndex === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
}
