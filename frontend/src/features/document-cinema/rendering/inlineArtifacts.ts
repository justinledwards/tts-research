const CITATION_GLYPH_PATTERN = /\uE200cite[^\uE201]*\uE201/g;
const CHATGPT_BRACKET_CITATION_PATTERN =
  /\[cite\]\s*\[\s*turn\d+(?:search|view|news|fetch)\d+\s*\]/gi;
const CONTENT_REFERENCE_PATTERN = /:contentReference\[[^\]\n]+\]\{[^}\n]*\}/g;
const MALFORMED_CITATION_PATTERN = /\[(?:cite|citation|source|reference)(?::[^\]\n]*)?\]/gi;
const TURN_CITATION_PATTERN = /\bturn\d+(?:search|view|news|fetch)\d+\b/g;
const TURN_LOCATOR_ID_PATTERN = /\bturn\d+(?:search|view|news|fetch)\d+\b/i;
const FOOTNOTE_REFERENCE_PATTERN = /\[\^[^\]\s]+\]/g;
const NUMERIC_REFERENCE_MARKER_PATTERN = /\[\d[\d\s,–-]*(?:p\.?\s*\d+)?\]/g;
const NAMED_REFERENCE_MARKER_PATTERN = /\[[A-Z][^\]\n]{0,40}(?:19|20)\d{2}[^\]\n]{0,20}\]/g;
const BRACKETED_METADATA_PATTERN =
  /\[(?:todo|note|metadata|draft|review|debug|loc(?:ator)?|id|ref)[:\s][^\]\n]{0,80}\]/gi;

export type DocumentInlineArtifactKind =
  | "artifact_token"
  | "citation"
  | "footnote"
  | "reference"
  | "unknown_inline_marker";

export type DocumentInlineArtifactSpeechBehavior =
  | "on-demand"
  | "skipped"
  | "spoken"
  | "summarized";

export interface DocumentInlineArtifact {
  end: number;
  kind: DocumentInlineArtifactKind;
  markerType: string;
  referenceLabel?: string;
  speechBehavior: DocumentInlineArtifactSpeechBehavior;
  speechBehaviorLabel: string;
  start: number;
  visualLabel: string;
}

interface ArtifactPattern {
  kind: DocumentInlineArtifactKind;
  markerType: string;
  pattern: RegExp;
  visualLabel: string;
}

interface HastNode {
  children?: HastNode[];
  properties?: Record<string, unknown>;
  tagName?: string;
  type: string;
  value?: string;
}

const ARTIFACT_PATTERNS: ArtifactPattern[] = [
  {
    kind: "citation",
    markerType: "chatgpt_glyph_citation",
    pattern: CITATION_GLYPH_PATTERN,
    visualLabel: "cite",
  },
  {
    kind: "citation",
    markerType: "chatgpt_bracket_citation",
    pattern: CHATGPT_BRACKET_CITATION_PATTERN,
    visualLabel: "cite",
  },
  {
    kind: "artifact_token",
    markerType: "content_reference",
    pattern: CONTENT_REFERENCE_PATTERN,
    visualLabel: "token",
  },
  {
    kind: "artifact_token",
    markerType: "raw_locator_token",
    pattern: TURN_CITATION_PATTERN,
    visualLabel: "token",
  },
  {
    kind: "footnote",
    markerType: "markdown_footnote_marker",
    pattern: FOOTNOTE_REFERENCE_PATTERN,
    visualLabel: "fn",
  },
  {
    kind: "citation",
    markerType: "malformed_citation_placeholder",
    pattern: MALFORMED_CITATION_PATTERN,
    visualLabel: "cite",
  },
  {
    kind: "reference",
    markerType: "numeric_reference_marker",
    pattern: NUMERIC_REFERENCE_MARKER_PATTERN,
    visualLabel: "ref",
  },
  {
    kind: "reference",
    markerType: "named_reference_marker",
    pattern: NAMED_REFERENCE_MARKER_PATTERN,
    visualLabel: "ref",
  },
  {
    kind: "unknown_inline_marker",
    markerType: "bracketed_metadata",
    pattern: BRACKETED_METADATA_PATTERN,
    visualLabel: "meta",
  },
];

export function findDocumentInlineArtifacts(value: string): DocumentInlineArtifact[] {
  const artifacts = ARTIFACT_PATTERNS.flatMap((definition) => {
    definition.pattern.lastIndex = 0;
    return [...value.matchAll(definition.pattern)].map((match) =>
      artifactFromMatch(definition, match),
    );
  });
  return sortArtifacts(removeOverlappingArtifacts(artifacts), compareArtifactsByStart);
}

export function documentCinemaInlineArtifactPlugin() {
  return function transformDocumentCinemaInlineArtifacts(tree: HastNode) {
    transformNode(tree);
  };
}

function transformNode(node: HastNode) {
  if (!node.children) {
    return;
  }

  const nextChildren: HastNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      nextChildren.push(...splitTextArtifacts(child.value));
      continue;
    }
    if (child.type === "element") {
      enhanceArtifactElement(child);
    }
    transformNode(child);
    nextChildren.push(child);
  }
  node.children = nextChildren;
}

function splitTextArtifacts(value: string): HastNode[] {
  const artifacts = findDocumentInlineArtifacts(value);
  if (artifacts.length === 0) {
    return [{ type: "text", value }];
  }

  const nodes: HastNode[] = [];
  let cursor = 0;
  for (const artifact of artifacts) {
    if (artifact.start > cursor) {
      nodes.push({ type: "text", value: value.slice(cursor, artifact.start) });
    }
    nodes.push(chipNode(artifact));
    cursor = artifact.end;
  }
  if (cursor < value.length) {
    nodes.push({ type: "text", value: value.slice(cursor) });
  }
  return nodes;
}

function chipNode(artifact: DocumentInlineArtifact): HastNode {
  return {
    children: [{ type: "text", value: artifact.visualLabel.toUpperCase() }],
    properties: {
      "aria-label": artifactAccessibleLabel(artifact),
      className: ["document-inline-artifact", `document-inline-artifact--${artifact.kind}`],
      "data-artifact-kind": artifact.kind,
      "data-artifact-marker-type": artifact.markerType,
      "data-artifact-reference-label": artifact.referenceLabel ?? "",
      "data-speech-mode": "skip",
      "data-speech-behavior": artifact.speechBehavior,
      "data-speech-behavior-label": artifact.speechBehaviorLabel,
    },
    tagName: "span",
    type: "element",
  };
}

function enhanceArtifactElement(node: HastNode) {
  if (node.tagName === "a") {
    appendClass(node, "document-inline-artifact-link");
    setProperty(node, "data-artifact-kind", "reference");
    return;
  }
  if (node.tagName === "code" && !hasLanguageClass(node)) {
    appendClass(node, "document-inline-artifact-code");
    setProperty(node, "data-artifact-kind", "code");
  }
}

function appendClass(node: HastNode, className: string) {
  const properties = node.properties ?? {};
  const current = properties.className;
  if (Array.isArray(current)) {
    properties.className = [...current.map(String), className];
  } else if (typeof current === "string") {
    properties.className = [...current.split(/\s+/).filter(Boolean), className];
  } else {
    properties.className = [className];
  }
  node.properties = properties;
}

function setProperty(node: HastNode, key: string, value: string) {
  const properties = node.properties ?? {};
  properties[key] = value;
  node.properties = properties;
}

function hasLanguageClass(node: HastNode): boolean {
  const className = node.properties?.className;
  let classes: string[] = [];
  if (Array.isArray(className)) {
    classes = className.map(String);
  } else if (typeof className === "string") {
    classes = className.split(/\s+/);
  }
  return classes.some((item) => item.startsWith("language-"));
}

function artifactFromMatch(
  definition: ArtifactPattern,
  match: RegExpMatchArray,
): DocumentInlineArtifact {
  const raw = match[0];
  const index = match.index ?? 0;
  const speechBehavior = artifactSpeechBehavior(definition.kind);
  return {
    end: index + raw.length,
    kind: definition.kind,
    markerType: definition.markerType,
    referenceLabel: artifactReferenceLabel(definition.kind, definition.markerType, raw),
    speechBehavior,
    speechBehaviorLabel: artifactSpeechBehaviorLabel(speechBehavior),
    start: index,
    visualLabel: definition.visualLabel,
  };
}

function artifactLabel(kind: DocumentInlineArtifactKind): string {
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

function artifactAccessibleLabel(artifact: DocumentInlineArtifact): string {
  const reference = artifact.referenceLabel ? ` ${artifact.referenceLabel}` : "";
  return `${artifactLabel(artifact.kind)}${reference}, ${artifact.speechBehaviorLabel.toLowerCase()}. Show citation details.`;
}

function artifactSpeechBehavior(
  kind: DocumentInlineArtifactKind,
): DocumentInlineArtifactSpeechBehavior {
  switch (kind) {
    case "citation":
    case "footnote":
    case "reference": {
      return "on-demand";
    }
    case "artifact_token":
    case "unknown_inline_marker": {
      return "skipped";
    }
    default: {
      return "skipped";
    }
  }
}

function artifactSpeechBehaviorLabel(behavior: DocumentInlineArtifactSpeechBehavior): string {
  switch (behavior) {
    case "on-demand": {
      return "Available on demand";
    }
    case "spoken": {
      return "Spoken by the active speech profile";
    }
    case "summarized": {
      return "Summarized by the active speech profile";
    }
    default: {
      return "Skipped in generated speech";
    }
  }
}

function artifactReferenceLabel(
  kind: DocumentInlineArtifactKind,
  markerType: string,
  raw: string,
): string | undefined {
  const locator = TURN_LOCATOR_ID_PATTERN.exec(raw)?.[0];
  if (locator) {
    return locator;
  }
  if (markerType === "content_reference") {
    return contentReferenceLabel(raw);
  }
  if (kind === "footnote") {
    const footnote = stripWrappingBrackets(raw).replace(/^\^/, "").trim();
    return footnote ? `footnote ${footnote}` : "footnote";
  }
  if (kind === "reference") {
    return stripWrappingBrackets(raw) || "reference";
  }
  if (markerType === "malformed_citation_placeholder") {
    return "unresolved citation";
  }
  if (kind === "unknown_inline_marker") {
    return stripWrappingBrackets(raw) || "inline marker";
  }
  return undefined;
}

function contentReferenceLabel(raw: string): string {
  const start = raw.indexOf("[");
  if (start === -1) {
    return "content reference";
  }
  const end = raw.indexOf("]", start + 1);
  if (end === -1) {
    return "content reference";
  }
  const label = raw.slice(start + 1, end).trim();
  return label || "content reference";
}

function stripWrappingBrackets(raw: string): string {
  const clean = raw.trim();
  if (clean.startsWith("[") && clean.endsWith("]")) {
    return clean.slice(1, -1).trim();
  }
  return clean;
}

function removeOverlappingArtifacts(artifacts: DocumentInlineArtifact[]): DocumentInlineArtifact[] {
  const sorted = sortArtifacts(artifacts, compareArtifactsForOverlapRemoval);
  const output: DocumentInlineArtifact[] = [];
  for (const artifact of sorted) {
    const overlaps = output.some(
      (existing) => artifact.start < existing.end && artifact.end > existing.start,
    );
    if (!overlaps) {
      output.push(artifact);
    }
  }
  return output;
}

function sortArtifacts(
  artifacts: DocumentInlineArtifact[],
  compare: (left: DocumentInlineArtifact, right: DocumentInlineArtifact) => number,
): DocumentInlineArtifact[] {
  const sorted: DocumentInlineArtifact[] = [];
  for (const artifact of artifacts) {
    const insertAt = sorted.findIndex((existing) => compare(artifact, existing) < 0);
    if (insertAt === -1) {
      sorted.push(artifact);
    } else {
      sorted.splice(insertAt, 0, artifact);
    }
  }
  return sorted;
}

function compareArtifactsByStart(
  left: DocumentInlineArtifact,
  right: DocumentInlineArtifact,
): number {
  return left.start - right.start;
}

function compareArtifactsForOverlapRemoval(
  left: DocumentInlineArtifact,
  right: DocumentInlineArtifact,
): number {
  return left.start - right.start || right.end - right.start - (left.end - left.start);
}
