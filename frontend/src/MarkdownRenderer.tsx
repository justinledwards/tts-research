import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { documentCinemaInlineArtifactPlugin } from "./features/document-cinema/rendering/inlineArtifacts";
export { looksLikeMermaidDiagram } from "./markdownModel";

export function MarkdownRenderer({
  children,
  artifactRendering = "none",
  blockHighlight,
  className = "prose-markdown",
  wordHighlight,
}: Readonly<{
  artifactRendering?: "document-cinema" | "none";
  children: string;
  blockHighlight?: MarkdownBlockHighlight;
  className?: string;
  wordHighlight?: MarkdownWordHighlight;
}>) {
  const rehypePlugins = useMemo(
    () => [
      ...(artifactRendering === "document-cinema" ? [documentCinemaInlineArtifactPlugin] : []),
      ...(blockHighlight ? [createBlockHighlightPlugin(blockHighlight)] : []),
      ...(wordHighlight ? [createWordHighlightPlugin(wordHighlight)] : []),
    ],
    [artifactRendering, blockHighlight, wordHighlight],
  );

  return (
    <div className={className}>
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={rehypePlugins}
        remarkPlugins={[remarkGfm]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function MermaidDiagram({ chart }: Readonly<{ chart: string }>) {
  const rawId = useId();
  const diagramId = useMemo(() => `mermaid-${rawId.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`, [rawId]);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const trimmedChart = chart.trim();
    if (!trimmedChart) {
      setSvg(null);
      setError("Diagram source is empty.");
      return;
    }

    let isCancelled = false;
    setSvg(null);
    setError(null);

    void import("mermaid")
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          htmlLabels: false,
          securityLevel: "strict",
          startOnLoad: false,
          theme: "neutral",
        });
        return mermaid.render(diagramId, trimmedChart);
      })
      .then((result) => {
        if (!isCancelled) {
          setSvg(result.svg);
        }
      })
      .catch((caughtError: unknown) => {
        if (!isCancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Unable to render diagram.",
          );
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [chart, diagramId]);

  useEffect(() => {
    const output = outputRef.current;
    if (!output) {
      return;
    }
    output.replaceChildren();
    if (!svg) {
      return;
    }

    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (parsed.querySelector("parsererror")) {
      setError("Unable to render diagram.");
      return;
    }
    output.replaceChildren(document.importNode(parsed.documentElement, true));
  }, [svg]);

  if (error) {
    return (
      <pre className="mermaid-diagram mermaid-diagram--error whitespace-pre-wrap">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <div
      aria-busy={!svg}
      className="mermaid-diagram rounded-lg border bg-white p-4 text-center vs-border"
    >
      {svg ? (
        <div ref={outputRef} />
      ) : (
        <span className="vs-muted text-sm">Rendering diagram...</span>
      )}
    </div>
  );
}

const markdownComponents: Components = {
  a({ href, children, rel, target, ...props }) {
    return (
      <a
        target={target ?? "_blank"}
        rel={target === undefined || target === "_blank" ? (rel ?? "noopener noreferrer") : rel}
        href={href}
        {...props}
      >
        {children}
      </a>
    );
  },
  code({ children, className }) {
    const code = reactNodeToText(children).replace(/\n$/, "");
    const language = /language-([A-Za-z0-9_-]+)/.exec(className ?? "")?.[1]?.toLowerCase() ?? "";

    if (language === "mermaid") {
      return <MermaidDiagram chart={code} />;
    }

    if (language || code.includes("\n")) {
      return (
        <pre>
          <code className={className}>{children}</code>
        </pre>
      );
    }

    return <code className={className}>{children}</code>;
  },
  pre({ children }: { children?: ReactNode }) {
    return <>{children}</>;
  },
  span({ children, ...props }) {
    const spanProps = props as DocumentInlineArtifactChipProps;
    if (typeof spanProps["data-artifact-kind"] === "string") {
      return <DocumentInlineArtifactChip {...spanProps}>{children}</DocumentInlineArtifactChip>;
    }
    return <span {...props}>{children}</span>;
  },
};

type DocumentInlineArtifactChipProps = ComponentPropsWithoutRef<"span"> & {
  "data-artifact-kind"?: string;
  "data-artifact-marker-type"?: string;
  "data-artifact-reference-label"?: string;
  "data-speech-behavior"?: string;
  "data-speech-behavior-label"?: string;
};

function DocumentInlineArtifactChip({
  children,
  className,
  "data-artifact-kind": artifactKind = "citation",
  "data-artifact-marker-type": markerType = "",
  "data-artifact-reference-label": referenceLabel = "",
  "data-speech-behavior": speechBehavior = "skipped",
  "data-speech-behavior-label": speechBehaviorLabel = "Skipped in generated speech",
  ...props
}: Readonly<DocumentInlineArtifactChipProps>) {
  const rawId = useId();
  const detailsId = `citation-chip-${rawId.replaceAll(/[^A-Za-z0-9_-]/g, "-")}`;
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const kindLabel = formatInlineArtifactKindLabel(artifactKind);
  const shortReference = compactInlineArtifactReference(referenceLabel);
  const copyValue = [
    kindLabel,
    referenceLabel ? `reference ${referenceLabel}` : "",
    speechBehaviorLabel.toLowerCase(),
  ]
    .filter(Boolean)
    .join("; ");

  function copyCitation() {
    setCopied(false);
    void navigator.clipboard
      .writeText(copyValue)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  }

  return (
    <span className="document-inline-artifact-shell">
      <button
        aria-controls={detailsId}
        aria-expanded={open}
        aria-label={[kindLabel, referenceLabel || "", speechBehaviorLabel, "Show citation details"]
          .filter(Boolean)
          .join(". ")}
        className={className}
        data-artifact-kind={artifactKind}
        data-artifact-marker-type={markerType}
        data-artifact-reference-label={referenceLabel}
        data-speech-behavior={speechBehavior}
        data-speech-behavior-label={speechBehaviorLabel}
        data-speech-mode="skip"
        onClick={() => {
          setOpen((current) => !current);
        }}
        type="button"
        {...props}
      >
        <span>{children}</span>
        {shortReference ? (
          <span className="document-inline-artifact-ref">{shortReference}</span>
        ) : null}
      </button>
      <span
        className="document-inline-artifact-popover"
        hidden={!open}
        id={detailsId}
        role="status"
      >
        <span className="font-semibold">{kindLabel}</span>
        {referenceLabel ? <span>Reference: {referenceLabel}</span> : null}
        <span>Speech: {speechBehaviorLabel}.</span>
        <span>Raw marker is only shown in Debug.</span>
        <span className="document-inline-artifact-actions">
          <button onClick={copyCitation} type="button">
            Copy citation
          </button>
          <a href="#prepared-source-policy-notes">Show in policy notes</a>
        </span>
        {copied ? <span className="text-[0.68rem] font-semibold">Copied</span> : null}
      </span>
    </span>
  );
}

function formatInlineArtifactKindLabel(kind: string): string {
  switch (kind) {
    case "artifact_token": {
      return "Artifact token";
    }
    case "footnote": {
      return "Footnote marker";
    }
    case "reference": {
      return "Reference marker";
    }
    case "unknown_inline_marker": {
      return "Inline metadata marker";
    }
    default: {
      return "Citation marker";
    }
  }
}

function compactInlineArtifactReference(reference: string): string {
  const clean = reference.trim();
  if (!clean || clean === "unresolved citation") {
    return "";
  }
  if (clean.length <= 12) {
    return clean;
  }
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

function reactNodeToText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }
  if (isValidElement(node)) {
    return "";
  }
  return Children.toArray(node)
    .map((child) => reactNodeToText(child))
    .join("");
}

export interface MarkdownWordHighlight {
  activeWordOffset: number;
  blockEndOffset: number;
  blockStartOffset: number;
}

export interface MarkdownBlockHighlight {
  blockEndOffset: number;
  blockStartOffset: number;
}

interface HastPositionPoint {
  offset?: number;
}

interface HastPosition {
  end?: HastPositionPoint;
  start?: HastPositionPoint;
}

interface HastNode {
  children?: HastNode[];
  position?: HastPosition;
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
}

function createWordHighlightPlugin(highlight: MarkdownWordHighlight) {
  return function highlightMarkdownWord() {
    return function transformTree(tree: HastNode) {
      let blockWordOffset = 0;
      transformChildren(tree, highlight, () => blockWordOffset++);
    };
  };
}

function createBlockHighlightPlugin(highlight: MarkdownBlockHighlight) {
  return function highlightMarkdownBlock() {
    return function transformTree(tree: HastNode) {
      markHighlightedElements(tree, highlight);
    };
  };
}

function markHighlightedElements(node: HastNode, highlight: MarkdownBlockHighlight): boolean {
  const overlaps = nodePositionOverlapsHighlight(node.position, highlight);
  let childOverlaps = false;
  for (const child of node.children ?? []) {
    childOverlaps = markHighlightedElements(child, highlight) || childOverlaps;
  }
  if (node.type === "element" && overlaps && !childOverlaps) {
    const properties = node.properties ?? {};
    const className = properties.className;
    let classes: string[] = [];
    if (Array.isArray(className)) {
      classes = className.map(String);
    } else if (typeof className === "string") {
      classes = className.split(/\s+/);
    }
    properties.className = [...classes, "markdown-cinema-block-active"];
    node.properties = properties;
  }
  return overlaps || childOverlaps;
}

function transformChildren(
  node: HastNode,
  highlight: MarkdownWordHighlight,
  nextWordOffset: () => number,
) {
  if (!node.children) {
    return;
  }

  const nextChildren: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...splitHighlightedTextNode(child, highlight, nextWordOffset));
      continue;
    }
    if (isSpeechSkippedElement(child)) {
      nextChildren.push(child);
      continue;
    }
    transformChildren(child, highlight, nextWordOffset);
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

function isSpeechSkippedElement(node: HastNode): boolean {
  return node.type === "element" && node.properties?.["data-speech-mode"] === "skip";
}

function splitHighlightedTextNode(
  node: HastNode,
  highlight: MarkdownWordHighlight,
  nextWordOffset: () => number,
): HastNode[] {
  if (!nodePositionOverlapsHighlight(node.position, highlight) || !node.value) {
    return [node];
  }

  const parts: HastNode[] = [];
  const wordPattern = /\S+/g;
  let lastIndex = 0;
  for (const match of node.value.matchAll(wordPattern)) {
    const word = match[0];
    const index = match.index;
    if (index > lastIndex) {
      parts.push({ type: "text", value: node.value.slice(lastIndex, index) });
    }

    const wordOffset = nextWordOffset();
    parts.push(
      wordOffset === highlight.activeWordOffset
        ? {
            children: [{ type: "text", value: word }],
            properties: { className: ["markdown-cinema-word-active"] },
            tagName: "span",
            type: "element",
          }
        : { type: "text", value: word },
    );
    lastIndex = index + word.length;
  }

  if (lastIndex < node.value.length) {
    parts.push({ type: "text", value: node.value.slice(lastIndex) });
  }
  return parts.length > 0 ? parts : [node];
}

function nodePositionOverlapsHighlight(
  position: HastPosition | undefined,
  highlight: MarkdownBlockHighlight,
): boolean {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") {
    return false;
  }
  return start < highlight.blockEndOffset && end > highlight.blockStartOffset;
}
