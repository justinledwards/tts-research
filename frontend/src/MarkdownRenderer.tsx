import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const MERMAID_START_PATTERN =
  /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|stateDiagram-v2|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph)\b/i;

export function looksLikeMermaidDiagram(value: string): boolean {
  return MERMAID_START_PATTERN.test(value);
}

export function MarkdownRenderer({
  children,
  className = "prose-markdown",
  wordHighlight,
}: Readonly<{ children: string; className?: string; wordHighlight?: MarkdownWordHighlight }>) {
  const rehypePlugins = useMemo(
    () => (wordHighlight ? [createWordHighlightPlugin(wordHighlight)] : []),
    [wordHighlight],
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
};

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
    transformChildren(child, highlight, nextWordOffset);
    nextChildren.push(child);
  }
  node.children = nextChildren;
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
  highlight: MarkdownWordHighlight,
): boolean {
  const start = position?.start?.offset;
  const end = position?.end?.offset;
  if (typeof start !== "number" || typeof end !== "number") {
    return false;
  }
  return start < highlight.blockEndOffset && end > highlight.blockStartOffset;
}
