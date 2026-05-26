export interface ReadAlongDomAnchor {
  anchorId?: string;
  fallbackTextQuote?: string;
  nodeId?: string;
  pageIndex?: number;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  sourceId?: string;
  tokenOffset?: number;
  wordIndex?: number;
}

export interface ReadAlongResolvedDomAnchor {
  element: Element | null;
  reason: string;
  selector: string | null;
  status: "not-found" | "resolved";
}

export function readAlongAnchorId(parts: {
  nodeId?: string | null;
  sourceId?: string | null;
  tokenOffset?: number | null;
  wordIndex?: number | null;
}): string {
  return [parts.sourceId, parts.nodeId, parts.wordIndex, parts.tokenOffset]
    .filter((part) => part !== null && part !== undefined && String(part).trim().length > 0)
    .map((part) => cssIdentifierPart(String(part)))
    .join(":");
}

export function readAlongAnchorForWord(input: {
  fallbackTextQuote?: string;
  nodeId?: string | null;
  pageIndex?: number;
  sourceId?: string | null;
  tokenOffset?: number | null;
  wordIndex?: number | null;
}): ReadAlongDomAnchor {
  const anchorId = readAlongAnchorId(input);
  return {
    anchorId: anchorId || undefined,
    fallbackTextQuote: input.fallbackTextQuote,
    nodeId: input.nodeId ?? undefined,
    pageIndex: input.pageIndex,
    sourceId: input.sourceId ?? undefined,
    tokenOffset: input.tokenOffset ?? undefined,
    wordIndex: input.wordIndex ?? undefined,
  };
}

export function readAlongAnchorForBlock(input: {
  fallbackTextQuote?: string;
  nodeId?: string | null;
  sourceId?: string | null;
}): ReadAlongDomAnchor {
  return {
    anchorId: readAlongAnchorId({
      nodeId: input.nodeId,
      sourceId: input.sourceId,
    }),
    fallbackTextQuote: input.fallbackTextQuote,
    nodeId: input.nodeId ?? undefined,
    sourceId: input.sourceId ?? undefined,
  };
}

export function readAlongAnchorSelectors(anchor: ReadAlongDomAnchor): string[] {
  const selectors: string[] = [];
  if (anchor.anchorId) {
    selectors.push(`[data-readalong-anchor-id="${cssAttributeValue(anchor.anchorId)}"]`);
  }
  if (anchor.sourceId && anchor.nodeId && anchor.wordIndex !== undefined) {
    selectors.push(
      [
        `[data-readalong-source-id="${cssAttributeValue(anchor.sourceId)}"]`,
        `[data-readalong-node-id="${cssAttributeValue(anchor.nodeId)}"]`,
        `[data-readalong-word-index="${String(anchor.wordIndex)}"]`,
      ].join(""),
    );
  }
  if (anchor.nodeId && anchor.wordIndex !== undefined) {
    selectors.push(
      [
        `[data-readalong-node-id="${cssAttributeValue(anchor.nodeId)}"]`,
        `[data-readalong-word-index="${String(anchor.wordIndex)}"]`,
      ].join(""),
    );
  }
  if (anchor.wordIndex !== undefined) {
    selectors.push(
      `[data-book-word="${String(anchor.wordIndex)}"]`,
      `[data-readalong-word-index="${String(anchor.wordIndex)}"]`,
    );
  }
  if (anchor.nodeId) {
    selectors.push(
      `#cinema-block-${cssIdentifier(anchor.nodeId)}`,
      `[data-readalong-node-id="${cssAttributeValue(anchor.nodeId)}"]`,
    );
  }
  return [...new Set(selectors)];
}

export function resolveReadAlongDomAnchor(
  root: ParentNode | null | undefined,
  anchor: ReadAlongDomAnchor | null | undefined,
  fallbackSelectors: readonly string[] = [],
): ReadAlongResolvedDomAnchor {
  if (!root || !anchor) {
    return {
      element: null,
      reason: "No reader root or anchor was available.",
      selector: null,
      status: "not-found",
    };
  }

  for (const selector of [...readAlongAnchorSelectors(anchor), ...fallbackSelectors]) {
    const element = root.querySelector(selector);
    if (element) {
      return {
        element,
        reason: "Anchor resolved from stable selector.",
        selector,
        status: "resolved",
      };
    }
  }

  const textMatch = resolveAnchorByText(root, anchor.fallbackTextQuote);
  if (textMatch) {
    return {
      element: textMatch,
      reason: "Anchor resolved from fallback text quote.",
      selector: null,
      status: "resolved",
    };
  }

  return {
    element: null,
    reason: "No matching reader anchor was found.",
    selector: null,
    status: "not-found",
  };
}

function resolveAnchorByText(root: ParentNode, textQuote: string | undefined): Element | null {
  const quote = normalizeAnchorText(textQuote ?? "");
  if (!quote) {
    return null;
  }
  const candidates = root.querySelectorAll<HTMLElement>(
    "[data-readalong-node-id], p, section, h1, h2, h3, h4, h5, h6",
  );
  for (const candidate of candidates) {
    if (normalizeAnchorText(candidate.textContent).includes(quote)) {
      return candidate;
    }
  }
  return null;
}

export function normalizeAnchorText(value: string): string {
  return value.trim().toLowerCase().replaceAll(/\s+/g, " ");
}

function cssIdentifierPart(value: string): string {
  return value.trim().replaceAll(/[^A-Za-z0-9_-]+/g, "-");
}

function cssIdentifier(value: string): string {
  return cssIdentifierPart(value);
}

function cssAttributeValue(value: string): string {
  const backslash = String.fromCodePoint(92);
  return value.replaceAll(backslash, `${backslash}${backslash}`).replaceAll('"', `${backslash}"`);
}
