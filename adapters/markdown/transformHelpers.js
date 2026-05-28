import { toString as mdastToString } from "mdast-util-to-string";

export const ADMONITION_NAMES = new Set([
  "admonition",
  "attention",
  "caution",
  "danger",
  "error",
  "hint",
  "important",
  "note",
  "seealso",
  "tip",
  "todo",
  "warning",
]);

export const EMBEDDED_TYPES = new Set([
  "html",
  "mdxFlowExpression",
  "mdxJsxFlowElement",
  "mdxJsxTextElement",
  "mdxTextExpression",
  "mdxjsEsm",
]);

const CITATION_GLYPH_PATTERN = /\uE200cite[^\uE201]*\uE201/g;
const CHATGPT_BRACKET_CITATION_PATTERN =
  /\[cite\]\s*\[\s*turn\d+(?:search|view|news|fetch)\d+\s*\]/gi;
const CONTENT_REFERENCE_PATTERN = /:contentReference\[[^\]\n]+\]\{[^}\n]*\}/g;
const MALFORMED_CITATION_PATTERN = /\[(?:cite|citation|source|reference)(?:\:[^\]\n]*)?\]/gi;
const TURN_CITATION_PATTERN = /\bturn\d+(?:search|view|news|fetch)\d+\b/g;
const FOOTNOTE_REFERENCE_PATTERN = /\[\^[^\]\s]+\]/g;
const REFERENCE_MARKER_PATTERN =
  /\[(?:\d+(?:\s*(?:,|-|–)\s*\d+)*(?:,\s*p\.?\s*\d+)?|[A-Z][A-Za-z .'-]{1,40}(?:19|20)\d{2}[^\]\n]{0,20})\]/g;
const BRACKETED_METADATA_PATTERN =
  /\[(?:todo|note|metadata|draft|review|debug|loc(?:ator)?|id|ref)[:\s][^\]\n]{0,80}\]/gi;
const MYST_ROLE_PATTERN = /\{([A-Za-z][\w-]*)\}`([^`]+)`/g;

export const POLICY_INLINE_ARTIFACT_KINDS = new Set([
  "artifact_token",
  "citation",
  "footnote",
  "reference",
  "unknown_inline_marker",
]);

export function buildByteOffsetMap(source) {
  const map = new Array(source.length + 1).fill(0);
  let byteOffset = 0;
  let codeOffset = 0;
  for (const char of source) {
    map[codeOffset] = byteOffset;
    byteOffset += Buffer.byteLength(char, "utf8");
    codeOffset += char.length;
    map[codeOffset] = byteOffset;
  }
  for (let index = 1; index < map.length; index += 1) {
    if (map[index] === 0 && index !== 0) {
      map[index] = map[index - 1];
    }
  }
  return map;
}

export function parseCallout(raw) {
  const lines = raw.split("\n").map((line) => line.replaceAll(/^>\s?/g, ""));
  const match = /^\[!([A-Za-z]+)]\s*(.*)$/.exec(lines[0]?.trim() ?? "");
  if (!match) {
    return null;
  }
  const kind = match[1].toLowerCase();
  const title = match[2]?.trim();
  return {
    body: [title, ...lines.slice(1)].filter(Boolean).join("\n"),
    kind,
    label: title || labelForDirective(kind),
  };
}

export function parseMystDirectiveLanguage(language) {
  const match = /^\{([A-Za-z][\w-]*)}\s*(.*)$/.exec(language.trim());
  if (!match) {
    return null;
  }
  return {
    arguments: match[2]?.trim() ?? "",
    name: match[1].toLowerCase(),
  };
}

export function firstTitle(nodes) {
  return (
    nodes.find((node) => node.kind === "heading" || node.kind === "subheading")?.speechText ?? ""
  );
}

export function firstWords(value, count) {
  return value.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

export function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

export function sourceSlice(node, context) {
  const startOffset = node.position?.start?.offset ?? 0;
  const endOffset = node.position?.end?.offset ?? startOffset;
  return context.source.slice(startOffset, endOffset);
}

export function inlineText(node) {
  return cleanSpeechText(mdastToString(node));
}

export function inlineSpeechText(node) {
  return (node.children ?? [])
    .map((child) => inlineChildSpeech(child))
    .filter(Boolean)
    .join(" ");
}

function inlineChildSpeech(node) {
  if (EMBEDDED_TYPES.has(node.type)) {
    return "";
  }
  switch (node.type) {
    case "break":
    case "html":
      return " ";
    case "image":
      return node.alt ?? "";
    case "footnoteReference":
      return "";
    case "textDirective":
      if (node.name === "contentReference") {
        return "";
      }
      return (node.children ?? []).map((child) => inlineChildSpeech(child)).join(" ");
    case "inlineCode":
    case "text":
      return node.value ?? "";
    case "link":
    case "linkReference":
      return (node.children ?? []).map((child) => inlineChildSpeech(child)).join(" ");
    default:
      if (Array.isArray(node.children)) {
        return node.children.map((child) => inlineChildSpeech(child)).join(" ");
      }
      return node.value ?? "";
  }
}

export function cleanSpeechText(value) {
  let clean = stripInlineArtifactsForSpeech(value)
    .replaceAll(MYST_ROLE_PATTERN, "$2")
    .replaceAll("**", "")
    .replaceAll("__", "")
    .replaceAll("~~", "")
    .replaceAll("•", "");
  clean = clean.trim().replaceAll(/^[\s>*_.-]+|[\s`*_>-]+$/g, "");
  return clean
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .replaceAll(/\s+([.,;:!?])/g, "$1");
}

export function inlineArtifactWarnings(artifacts, raw, speechText, warnings) {
  const output = [...warnings];
  for (const artifact of artifacts) {
    output.push(artifact.warning);
  }
  if (containsCitationMarkup(raw)) {
    output.push(shouldSkipCitationBlock(speechText) ? "citation_skipped" : "citation_removed");
  }
  return uniqueStrings(output);
}

export function containsCitationMarkup(value) {
  return inlineArtifactPatterns().some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

export function shouldSkipCitationBlock(value) {
  const trimmed = String(value).trim();
  if (trimmed === "") {
    return false;
  }
  const citationStripped = stripInlineArtifactsForSpeech(trimmed);
  return citationStripped.replaceAll(/[\s[\]().,;:|]/g, "") === "";
}

function stripInlineArtifactsForSpeech(value) {
  let clean = String(value);
  for (const { pattern } of inlineArtifactPatterns()) {
    pattern.lastIndex = 0;
    clean = clean.replaceAll(pattern, " ");
  }
  return clean;
}

export function findInlineArtifacts(node, context) {
  const artifacts = [];
  collectInlineArtifacts(node, context, artifacts);
  return withoutOverlappingArtifacts(artifacts)
    .sort((left, right) => left.startCodeOffset - right.startCodeOffset)
    .map((artifact, index) => ({ ...artifact, index }));
}

function collectInlineArtifacts(node, context, artifacts) {
  for (const child of node.children ?? []) {
    switch (child.type) {
      case "text":
        artifacts.push(...findTextInlineArtifacts(child, context));
        break;
      case "inlineCode":
        artifacts.push(
          inlineArtifactForNode(child, context, {
            kind: "code",
            label: "Code span",
            markerType: "markdown_code_span",
            speechText: child.value ?? "",
            visualLabel: "code",
            warning: "inline_code_policy",
          }),
        );
        break;
      case "link":
      case "linkReference":
        artifacts.push(
          inlineArtifactForNode(child, context, {
            kind: "reference",
            label: "Link",
            markerType: "markdown_link",
            speechText: cleanSpeechText(mdastToString(child)),
            url: child.url ?? "",
            visualLabel: "link",
            warning: "link_reference",
          }),
        );
        break;
      case "footnoteReference":
        artifacts.push(
          inlineArtifactForNode(child, context, {
            identifier: child.identifier ?? "",
            kind: "footnote",
            label: "Footnote",
            markerType: "markdown_footnote_marker",
            speechText: footnoteSpeechText(child.identifier ?? sourceSlice(child, context)),
            visualLabel: "fn",
            warning: "footnote_reference",
          }),
        );
        break;
      case "textDirective":
        if (child.name === "contentReference") {
          artifacts.push(
            inlineArtifactForNode(child, context, {
              kind: "artifact_token",
              label: "Artifact token",
              markerType: "content_reference",
              speechText: "Artifact reference.",
              visualLabel: "token",
              warning: "artifact_token_removed",
            }),
          );
        } else if (Array.isArray(child.children)) {
          collectInlineArtifacts(child, context, artifacts);
        }
        break;
      default:
        if (Array.isArray(child.children)) {
          collectInlineArtifacts(child, context, artifacts);
        }
        break;
    }
  }
}

function findTextInlineArtifacts(node, context) {
  const value = node.value ?? "";
  const startCodeOffset = node.position?.start?.offset ?? 0;
  const span = spanForNode(node, context);
  const artifacts = [];
  for (const definition of inlineArtifactPatterns()) {
    definition.pattern.lastIndex = 0;
    let match = definition.pattern.exec(value);
    while (match) {
      const raw = match[0];
      artifacts.push(
        inlineArtifactFromMatch({
          context,
          definition,
          raw,
          startCodeOffset: startCodeOffset + match.index,
          endCodeOffset: startCodeOffset + match.index + raw.length,
          span,
        }),
      );
      match = definition.pattern.exec(value);
    }
  }
  return artifacts;
}

function inlineArtifactPatterns() {
  return [
    {
      kind: "citation",
      label: "Citation",
      markerType: "chatgpt_glyph_citation",
      pattern: CITATION_GLYPH_PATTERN,
      speechText: "Citation marker.",
      visualLabel: "cite",
      warning: "citation_removed",
    },
    {
      kind: "citation",
      label: "Citation",
      markerType: "chatgpt_bracket_citation",
      pattern: CHATGPT_BRACKET_CITATION_PATTERN,
      speechText: "Citation marker.",
      visualLabel: "cite",
      warning: "citation_removed",
    },
    {
      kind: "artifact_token",
      label: "Artifact token",
      markerType: "content_reference",
      pattern: CONTENT_REFERENCE_PATTERN,
      speechText: "Artifact reference.",
      visualLabel: "token",
      warning: "artifact_token_removed",
    },
    {
      kind: "artifact_token",
      label: "Artifact token",
      markerType: "raw_locator_token",
      pattern: TURN_CITATION_PATTERN,
      speechText: "Citation locator.",
      visualLabel: "token",
      warning: "artifact_token_removed",
    },
    {
      kind: "footnote",
      label: "Footnote",
      markerType: "markdown_footnote_marker",
      pattern: FOOTNOTE_REFERENCE_PATTERN,
      speechText: "Footnote marker.",
      visualLabel: "fn",
      warning: "footnote_reference",
    },
    {
      kind: "citation",
      label: "Citation",
      markerType: "malformed_citation_placeholder",
      pattern: MALFORMED_CITATION_PATTERN,
      speechText: "Citation placeholder.",
      visualLabel: "cite",
      warning: "malformed_citation_placeholder",
    },
    {
      kind: "reference",
      label: "Reference",
      markerType: "reference_marker",
      pattern: REFERENCE_MARKER_PATTERN,
      speechText: "Reference marker.",
      visualLabel: "ref",
      warning: "reference_marker_removed",
    },
    {
      kind: "unknown_inline_marker",
      label: "Inline marker",
      markerType: "bracketed_metadata",
      pattern: BRACKETED_METADATA_PATTERN,
      speechText: "Inline metadata marker.",
      visualLabel: "meta",
      warning: "unknown_inline_marker_removed",
    },
  ];
}

function inlineArtifactFromMatch({
  context,
  definition,
  raw,
  startCodeOffset,
  endCodeOffset,
  span,
}) {
  return {
    columnEnd: span.columnStart + (endCodeOffset - (span.startCodeOffset ?? startCodeOffset)),
    columnStart: span.columnStart + (startCodeOffset - (span.startCodeOffset ?? startCodeOffset)),
    endCodeOffset,
    endOffset: byteOffsetAt(context.byteMap, endCodeOffset),
    kind: definition.kind,
    label: definition.label,
    lineEnd: span.lineEnd,
    lineStart: span.lineStart,
    markerType: definition.markerType,
    raw,
    speechText: speechTextForInlineArtifact(definition, raw),
    startCodeOffset,
    startOffset: byteOffsetAt(context.byteMap, startCodeOffset),
    visualLabel: definition.visualLabel,
    warning: definition.warning,
  };
}

function inlineArtifactForNode(node, context, fields) {
  const span = spanForNode(node, context);
  const raw = sourceSlice(node, context);
  return {
    columnEnd: span.columnEnd,
    columnStart: span.columnStart,
    endCodeOffset: node.position?.end?.offset ?? node.position?.start?.offset ?? 0,
    endOffset: span.endOffset,
    identifier: fields.identifier ?? "",
    kind: fields.kind,
    label: fields.label,
    lineEnd: span.lineEnd,
    lineStart: span.lineStart,
    markerType: fields.markerType,
    raw,
    speechText: fields.speechText,
    startCodeOffset: node.position?.start?.offset ?? 0,
    startOffset: span.startOffset,
    url: fields.url ?? "",
    visualLabel: fields.visualLabel,
    warning: fields.warning,
  };
}

function speechTextForInlineArtifact(definition, raw) {
  if (definition.kind === "footnote") {
    return footnoteSpeechText(raw);
  }
  if (definition.kind === "reference") {
    const marker = raw.replaceAll(/^\[|\]$/g, "").trim();
    return marker ? `Reference ${marker}.` : definition.speechText;
  }
  return definition.speechText;
}

function footnoteSpeechText(value) {
  const marker = String(value)
    .replaceAll(/^\[\^?|\]$/g, "")
    .trim();
  return marker ? `Footnote ${marker}.` : "Footnote marker.";
}

export function artifactMetadata(artifact) {
  return {
    endOffset: artifact.endOffset,
    identifier: artifact.identifier ?? "",
    kind: artifact.kind,
    markerType: artifact.markerType,
    raw: artifact.raw,
    speechText: artifact.speechText,
    startOffset: artifact.startOffset,
    url: artifact.url ?? "",
    visualLabel: artifact.visualLabel,
  };
}

function withoutOverlappingArtifacts(artifacts) {
  const output = [];
  const sorted = [...artifacts].sort(
    (left, right) =>
      left.startCodeOffset - right.startCodeOffset ||
      right.endCodeOffset - right.startCodeOffset - (left.endCodeOffset - left.startCodeOffset),
  );
  for (const artifact of sorted) {
    if (
      output.some(
        (existing) =>
          artifact.startCodeOffset < existing.endCodeOffset &&
          artifact.endCodeOffset > existing.startCodeOffset,
      )
    ) {
      continue;
    }
    output.push(artifact);
  }
  return output;
}

export function findMystRoles(node, context) {
  const raw = sourceSlice(node, context);
  const span = spanForNode(node, context);
  const roles = [];
  MYST_ROLE_PATTERN.lastIndex = 0;
  let match = MYST_ROLE_PATTERN.exec(raw);
  while (match) {
    roles.push({
      columnEnd: span.columnStart + match.index + match[0].length,
      columnStart: span.columnStart + match.index,
      endOffset: span.startOffset + Buffer.byteLength(raw.slice(0, match.index + match[0].length)),
      index: roles.length,
      name: match[1],
      raw: match[0],
      startOffset: span.startOffset + Buffer.byteLength(raw.slice(0, match.index)),
      text: match[2],
    });
    match = MYST_ROLE_PATTERN.exec(raw);
  }
  return roles;
}

export function labelForDirective(name, fallback = "") {
  const label = String(fallback ?? "").trim();
  if (label !== "") {
    return label;
  }
  return name
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function labelForEmbedded(name, family) {
  return `${family.toUpperCase()} embedded ${name}`;
}

export function spanForNode(node, context) {
  const position = node.position ?? {};
  const start = position.start ?? {};
  const end = position.end ?? {};
  const startCodeOffset = start.offset ?? 0;
  const endCodeOffset = end.offset ?? startCodeOffset;
  return {
    columnEnd: end.column ?? 0,
    columnStart: start.column ?? 0,
    endOffset: byteOffsetAt(context.byteMap, endCodeOffset),
    endCodeOffset,
    lineEnd: end.line ?? 0,
    lineStart: start.line ?? 0,
    startCodeOffset,
    startOffset: byteOffsetAt(context.byteMap, startCodeOffset),
  };
}

function byteOffsetAt(map, codeOffset) {
  return map[Math.max(0, Math.min(codeOffset, map.length - 1))] ?? 0;
}
