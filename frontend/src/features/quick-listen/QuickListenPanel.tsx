import { useRef, useState } from "react";
import { Button, SegmentedControl, StatusChip, cx, fieldControlClassName } from "../../design";
import type { MarkdownParseMode, PreparedSource, TemporarySourceSession } from "../../types";

type QuickListenMode = "paste" | "url" | "file" | "recent";

export interface QuickListenPanelProps {
  error: string | null;
  isOpen: boolean;
  isSubmitting: boolean;
  recentSources: TemporarySourceSession[];
  onClose: () => void;
  onCreateFromFile: (file: File, markdownParseMode: MarkdownParseMode) => Promise<void>;
  onCreateFromText: (
    text: string,
    markdownParseMode: MarkdownParseMode,
    sourceName?: string,
  ) => Promise<void>;
  onCreateFromUrl: (url: string, markdownParseMode: MarkdownParseMode) => Promise<void>;
  onDiscard: (source: TemporarySourceSession) => Promise<void>;
  onUseRecentSource: (source: TemporarySourceSession) => Promise<void>;
}

const ACCEPTED_QUICK_LISTEN_FILE_TYPES =
  ".txt,.md,.markdown,.text,.log,.csv,.json,.html,.htm,.pdf,.epub,.docx,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.webp,application/pdf,application/epub+zip,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/tiff,image/webp";

export function QuickListenPanel({
  error,
  isOpen,
  isSubmitting,
  recentSources,
  onClose,
  onCreateFromFile,
  onCreateFromText,
  onCreateFromUrl,
  onDiscard,
  onUseRecentSource,
}: Readonly<QuickListenPanelProps>) {
  const [mode, setMode] = useState<QuickListenMode>("paste");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [markdownParseMode, setMarkdownParseMode] = useState<MarkdownParseMode>("strict");
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) {
    return null;
  }

  const submit = () => {
    setLocalError(null);
    if (mode === "paste") {
      if (text.trim().length < 12) {
        setLocalError("Paste at least a sentence so Quick Listen has something useful to read.");
        return;
      }
      void onCreateFromText(text, markdownParseMode, "Quick Listen paste");
      return;
    }
    if (mode === "url") {
      const trimmedUrl = url.trim();
      if (!/^https?:\/\/\S+\.\S+/.test(trimmedUrl)) {
        setLocalError("Enter a full http or https URL.");
        return;
      }
      void onCreateFromUrl(trimmedUrl, markdownParseMode);
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
      void onCreateFromFile(file, markdownParseMode);
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
            <StatusChip tone="warning">Expires after about 24 hours</StatusChip>
          </div>
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
                  }}
                  placeholder="https://example.com/article"
                  type="url"
                  value={url}
                />
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
                  setFile(event.dataTransfer.files.item(0));
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
                    setFile(event.currentTarget.files?.[0] ?? null);
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

            {mode === "recent" ? (
              <div className="grid gap-2">
                {recentSources.length === 0 ? (
                  <p className="vs-muted rounded-md border p-4 text-sm vs-border vs-surface">
                    Recent temporary sources appear here after you start Quick Listen in this app
                    session.
                  </p>
                ) : (
                  recentSources.map((source) => (
                    <div
                      className="grid gap-2 rounded-md border p-3 vs-border vs-surface sm:grid-cols-[minmax(0,1fr)_auto]"
                      key={source.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {source.title ?? source.sourceName}
                        </p>
                        <p className="vs-muted mt-1 text-xs">
                          {source.wordCount.toLocaleString()} words · expires{" "}
                          {formatExpiry(source.expiresAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
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
                            void onDiscard(source);
                          }}
                          size="sm"
                          variant="secondary"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
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
          <Button disabled={isSubmitting} onClick={submit} size="md" variant="primary">
            {isSubmitting ? "Starting..." : "Start Quick Listen"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

export function temporarySessionToPreparedSource(source: TemporarySourceSession): PreparedSource {
  return {
    blockCount: source.blockCount ?? source.blocks?.length ?? 0,
    blocks: source.blocks,
    createdAt: source.createdAt,
    id: source.id,
    kind: source.kind as PreparedSource["kind"],
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

function quickListenFileLooksSupported(file: File): boolean {
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  return QUICK_LISTEN_SUPPORTED_EXTENSIONS.has(extension);
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
