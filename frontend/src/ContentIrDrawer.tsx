import { useMemo, useState } from "react";
import {
  contentIRNodePreview,
  formatContentIRLocator,
  type ContentIRDocument,
  type ContentIRNode,
} from "./content-ir";

export function ContentIRDrawer({
  document,
  error,
  isLoading,
  isOpen,
  title,
  onClose,
}: Readonly<{
  document: ContentIRDocument | null;
  error: string | null;
  isLoading: boolean;
  isOpen: boolean;
  title: string;
  onClose: () => void;
}>) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950/30" role="presentation">
      <aside
        aria-label="Content structure"
        className="vs-app ml-auto flex h-full w-full max-w-[720px] flex-col border-l bg-[var(--vs-raised)] shadow-2xl vs-border"
      >
        <header className="flex items-center justify-between gap-4 border-b px-5 py-4 vs-border">
          <div className="min-w-0">
            <p className="vs-muted text-xs font-semibold uppercase tracking-[0.2em]">
              Inspect Structure
            </p>
            <h2 className="truncate text-lg font-semibold" title={title}>
              {title}
            </h2>
          </div>
          <button
            aria-label="Close content structure"
            className="grid h-9 w-9 place-items-center rounded-md border hover:bg-[var(--vs-surface)] vs-border"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isLoading ? <DrawerMessage>Loading structure...</DrawerMessage> : null}
          {error ? <DrawerMessage tone="error">{error}</DrawerMessage> : null}
          {!isLoading && !error && document ? <ContentIRDocumentView document={document} /> : null}
        </div>
      </aside>
    </div>
  );
}

function ContentIRDocumentView({ document }: Readonly<{ document: ContentIRDocument }>) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");
  const kinds = useMemo(
    () => uniqueSortedStrings(document.nodes.map((node) => node.kind)),
    [document.nodes],
  );
  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return document.nodes.filter((node) => {
      if (kindFilter && node.kind !== kindFilter) {
        return false;
      }
      if (modeFilter && node.speech.speechPolicy.mode !== modeFilter) {
        return false;
      }
      return !normalizedQuery || contentIRNodeSearchText(node).includes(normalizedQuery);
    });
  }, [document.nodes, kindFilter, modeFilter, query]);
  const noteCount = document.nodes.filter((node) => node.warnings.length > 0).length;

  return (
    <div className="grid gap-4">
      <dl className="grid gap-3 rounded-md border bg-[var(--vs-surface)] p-4 text-sm vs-border sm:grid-cols-4">
        <MetadataItem label="Schema" value={document.schemaVersion} />
        <MetadataItem label="Adapter" value={document.adapterVersion} />
        <MetadataItem label="Source" value={document.sourceName} />
        <MetadataItem label="Nodes" value={document.nodes.length.toLocaleString()} />
      </dl>

      <div className="sticky top-0 z-10 grid gap-3 border-b bg-[var(--vs-raised)] pb-4 vs-border lg:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] lg:items-center">
        <input
          className="h-10 min-w-0 rounded-md border bg-[var(--vs-surface)] px-3 text-sm outline-none focus:border-orange-300 vs-border"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          placeholder="Filter nodes, locators, warnings"
          type="search"
          value={query}
        />
        <select
          className="h-10 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-sm outline-none focus:border-orange-300 vs-border"
          onChange={(event) => {
            setKindFilter(event.currentTarget.value);
          }}
          value={kindFilter}
        >
          <option value="">All kinds</option>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
        <select
          className="h-10 min-w-0 rounded-md border bg-[var(--vs-surface)] px-2 text-sm outline-none focus:border-orange-300 vs-border"
          onChange={(event) => {
            setModeFilter(event.currentTarget.value);
          }}
          value={modeFilter}
        >
          <option value="">All modes</option>
          <option value="speak">Speak</option>
          <option value="summarise">Summarise</option>
          <option value="literal">Literal</option>
          <option value="skip">Skip</option>
          <option value="onDemand">On demand</option>
          <option value="describeShort">Describe short</option>
          <option value="describeLong">Describe long</option>
        </select>
        <p className="vs-muted text-xs font-semibold">
          {filteredNodes.length.toLocaleString()} shown · {noteCount.toLocaleString()} with notes
        </p>
      </div>

      <div className="grid gap-2">
        {filteredNodes.map((node) => (
          <ContentIRNodeCard key={node.nodeId} node={node} />
        ))}
        {filteredNodes.length === 0 ? <DrawerMessage>No matching nodes.</DrawerMessage> : null}
      </div>
    </div>
  );
}

function uniqueSortedStrings(values: readonly string[]): string[] {
  const sorted: string[] = [];
  for (const value of new Set(values)) {
    const insertIndex = sorted.findIndex((item) => value.localeCompare(item) < 0);
    if (insertIndex === -1) {
      sorted.push(value);
    } else {
      sorted.splice(insertIndex, 0, value);
    }
  }
  return sorted;
}

function ContentIRNodeCard({ node }: Readonly<{ node: ContentIRNode }>) {
  const policy = node.speech.speechPolicy;
  const locator = formatContentIRLocator(node.provenance.locator);
  const preview = contentIRNodePreview(node);
  return (
    <article className="grid gap-3 rounded-md border bg-[var(--vs-raised)] p-3 text-sm vs-border">
      <div className="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded border px-2 py-1 text-xs font-semibold uppercase tracking-[0.12em] vs-border">
            {node.kind}
          </span>
          <span className="vs-muted rounded border px-2 py-1 text-xs font-semibold vs-border">
            {node.role || "unassigned"}
          </span>
          <ContentIRLanguageBadge node={node} />
          <span className="vs-muted min-w-0 truncate text-xs" title={node.nodeId}>
            {node.nodeId}
          </span>
        </div>
        <span className="vs-muted min-w-0 truncate text-xs sm:max-w-64" title={locator}>
          {locator}
        </span>
      </div>
      <dl className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,16rem)]">
        <MetadataItem label="Offsets" value={formatOffsets(node)} />
        <MetadataItem label="Policy" value={formatSpeechPolicy(policy)} />
        <MetadataItem
          label="Confidence"
          value={`${Math.round(node.confidence * 100).toString()}%`}
        />
        <MetadataItem label="Extractor" value={formatExtractor(node)} />
      </dl>
      <p className="max-h-24 overflow-hidden break-words rounded-md bg-[var(--vs-surface)] p-3 text-sm leading-6">
        {preview || "No spoken text"}
      </p>
      <ContentIRSpeechDifference node={node} />
      {node.warnings.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {node.warnings.map((warning) => (
            <span
              className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"
              key={warning}
            >
              {warning}
            </span>
          ))}
        </div>
      ) : null}
      {policy.explanation ? (
        <p className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
          {policy.explanation}
        </p>
      ) : null}
    </article>
  );
}

function ContentIRLanguageBadge({ node }: Readonly<{ node: ContentIRNode }>) {
  const render = speechRenderMetadata(node);
  const spanCount = render?.languageSpans?.length ?? 0;
  const lang = render?.lang ?? node.lang;
  if (!lang || lang === "und") {
    return null;
  }
  return (
    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
      {spanCount > 1 ? `${lang} · ${spanCount.toLocaleString()} spans` : lang}
    </span>
  );
}

function ContentIRSpeechDifference({ node }: Readonly<{ node: ContentIRNode }>) {
  const render = speechRenderMetadata(node);
  const speech = render?.plainText ?? node.speechText;
  const displayed = normalizeDrawerSpeechText(node.displayText);
  const spoken = normalizeDrawerSpeechText(speech);
  if (!displayed || !spoken || displayed === spoken) {
    return null;
  }
  return (
    <div className="grid gap-1 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
      <span className="font-semibold text-blue-900">Spoken as</span>
      <span className="max-h-12 overflow-hidden break-words">{speech}</span>
    </div>
  );
}

interface SpeechRenderMetadata {
  plainText?: string;
  lang?: string;
  languageSpans?: { lang?: string }[];
}

function speechRenderMetadata(node: ContentIRNode): SpeechRenderMetadata | null {
  const render = node.metadata?.speechRender;
  if (!render || typeof render !== "object") {
    return null;
  }
  return render;
}

function normalizeDrawerSpeechText(value: string): string {
  return value
    .replaceAll(/^#+\s*/g, "")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function MetadataItem({ label, value }: Readonly<{ label: string; value: string | number }>) {
  return (
    <div className="min-w-0">
      <dt className="vs-muted text-[0.68rem] font-semibold uppercase tracking-[0.16em]">{label}</dt>
      <dd className="mt-1 truncate font-medium" title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

function DrawerMessage({
  children,
  tone = "neutral",
}: Readonly<{ children: string; tone?: "neutral" | "error" }>) {
  const className =
    tone === "error" ? "border-red-200 bg-red-50 text-red-700" : "vs-border bg-[var(--vs-surface)]";
  return <p className={`rounded-md border p-4 text-sm ${className}`}>{children}</p>;
}

function formatSpeechPolicy(policy: ContentIRNode["speech"]["speechPolicy"]): string {
  const parts = [policy.profile, policy.elementMode ?? policy.mode, policy.mode].filter(Boolean);
  return parts.join(" · ");
}

function formatOffsets(node: ContentIRNode): string {
  return `${node.provenance.offsets.start.toLocaleString()}-${node.provenance.offsets.end.toLocaleString()}`;
}

function formatExtractor(node: ContentIRNode): string {
  const extraction = node.provenance.extraction;
  if (!extraction) {
    return node.adapterVersion;
  }
  return `${extraction.extractor} · ${extraction.supportTier}`;
}

function contentIRNodeSearchText(node: ContentIRNode): string {
  return [
    node.nodeId,
    node.kind,
    node.role,
    node.speechText,
    node.displayText,
    node.speech.speechPolicy.mode,
    node.speech.speechPolicy.elementMode,
    node.speech.speechPolicy.explanation,
    node.provenance.extraction?.extractor,
    node.provenance.extraction?.supportTier,
    formatContentIRLocator(node.provenance.locator),
    node.warnings.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}
