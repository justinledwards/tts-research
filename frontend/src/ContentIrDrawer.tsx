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
  const filteredNodes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return document.nodes;
    }
    return document.nodes.filter((node) => contentIRNodeSearchText(node).includes(normalizedQuery));
  }, [document.nodes, query]);
  const noteCount = document.nodes.filter((node) => node.warnings.length > 0).length;

  return (
    <div className="grid gap-4">
      <dl className="grid gap-3 rounded-md border bg-[var(--vs-surface)] p-4 text-sm vs-border sm:grid-cols-4">
        <MetadataItem label="Schema" value={document.schemaVersion} />
        <MetadataItem label="Adapter" value={document.adapterVersion} />
        <MetadataItem label="Source" value={document.sourceName} />
        <MetadataItem label="Nodes" value={document.nodes.length.toLocaleString()} />
      </dl>

      <div className="sticky top-0 z-10 grid gap-3 border-b bg-[var(--vs-raised)] pb-4 vs-border sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <input
          className="h-10 min-w-0 rounded-md border bg-[var(--vs-surface)] px-3 text-sm outline-none focus:border-orange-300 vs-border"
          onChange={(event) => {
            setQuery(event.currentTarget.value);
          }}
          placeholder="Filter nodes, locators, warnings"
          type="search"
          value={query}
        />
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

function ContentIRNodeCard({ node }: Readonly<{ node: ContentIRNode }>) {
  const policy = node.speech.policyHint;
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
      </dl>
      <p className="max-h-24 overflow-hidden break-words rounded-md bg-[var(--vs-surface)] p-3 text-sm leading-6">
        {preview || "No spoken text"}
      </p>
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
    </article>
  );
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

function formatSpeechPolicy(policy: ContentIRNode["speech"]["policyHint"]): string {
  const parts = [policy.mode];
  if (policy.emphasis) {
    parts.push(policy.emphasis);
  }
  if (policy.pauseBeforeMs > 0 || policy.pauseAfterMs > 0) {
    parts.push(`${policy.pauseBeforeMs.toString()}ms/${policy.pauseAfterMs.toString()}ms`);
  }
  return parts.join(" · ");
}

function formatOffsets(node: ContentIRNode): string {
  return `${node.provenance.offsets.start.toLocaleString()}-${node.provenance.offsets.end.toLocaleString()}`;
}

function contentIRNodeSearchText(node: ContentIRNode): string {
  return [
    node.nodeId,
    node.kind,
    node.role,
    node.speechText,
    node.displayText,
    formatContentIRLocator(node.provenance.locator),
    node.warnings.join(" "),
  ]
    .join(" ")
    .toLowerCase();
}
