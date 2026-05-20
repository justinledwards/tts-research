import { MARKDOWN_ADAPTER_VERSION, parseMarkdown, snapshotAst } from "./parse.js";
import { transformMarkdownAst } from "./transform.js";

export function emitMarkdownAdapter(source, options = {}) {
  const parseResult = parseMarkdown(source, options);
  const transformed = transformMarkdownAst(parseResult.tree, source, {
    parseWarnings: parseResult.warnings,
  });
  const blocks = transformed.nodes.map((node, index) => semanticNodeToBlock(node, index));
  return {
    adapterVersion: MARKDOWN_ADAPTER_VERSION,
    ast: options.includeAst ? snapshotAst(parseResult.tree) : undefined,
    blocks,
    document: options.includeDocument
      ? emitContentIRDocument(blocks, transformed, options)
      : undefined,
    metadata: transformed.metadata,
    parseMode: parseResult.parseMode,
    skippedItems: blocks
      .filter((block) => block.speakMode === "skip")
      .map((block) => ({
        id: block.id,
        kind: block.kind,
        offset: block.startOffset,
        reason: skippedReason(block),
        text: block.text,
      })),
    title: transformed.title,
    warnings: transformed.warnings,
  };
}

function semanticNodeToBlock(node, index) {
  return {
    confidence: confidenceForNode(node),
    endOffset: node.endOffset,
    id: `block-${String(index + 1).padStart(4, "0")}`,
    index: index + 1,
    kind: node.kind,
    label: node.label,
    language: node.language ?? "",
    metadata: {
      ...node.metadata,
      astPath: node.astPath,
      columnEnd: node.columnEnd,
      columnStart: node.columnStart,
      lineEnd: node.lineEnd,
      lineStart: node.lineStart,
      sourceSlice: node.sourceSlice,
    },
    speakMode: node.speakMode,
    spokenText: node.speechText,
    startOffset: node.startOffset,
    text: node.displayText,
    warnings: node.warnings,
  };
}

function emitContentIRDocument(blocks, transformed, options) {
  const sourceId = options.sourceId ?? "markdown-source";
  const sourceName = options.sourceName ?? "source.md";
  return {
    adapterVersion: MARKDOWN_ADAPTER_VERSION,
    generatedAt: options.generatedAt ?? new Date(0).toISOString(),
    id: sourceId,
    metadata: transformed.metadata,
    nodes: blocks.map((block, index) => ({
      adapterVersion: MARKDOWN_ADAPTER_VERSION,
      confidence: block.confidence,
      dir: "ltr",
      displayText: block.text.trim(),
      kind: block.kind,
      lang: block.language || "und",
      metadata: block.metadata,
      nodeId: block.id,
      normalisedText: normalizeText(block.text),
      orderKey: String(index + 1).padStart(8, "0"),
      parentId: "",
      provenance: {
        format: "markdown",
        locator: {
          markdown: {
            astPath: block.metadata.astPath ?? `/children/${index}`,
            columnEnd: block.metadata.columnEnd ?? 0,
            columnStart: block.metadata.columnStart ?? 0,
            lineEnd: block.metadata.lineEnd ?? 0,
            lineStart: block.metadata.lineStart ?? 0,
            path: sourceName,
          },
          type: "markdown",
        },
        offsets: {
          end: block.endOffset,
          start: block.startOffset,
        },
        sourceId,
      },
      rights: {
        notes: "",
        status: "unknown",
      },
      role: block.kind,
      script: "Latn",
      speech: {
        policyHint: {
          emphasis: "",
          mode: block.speakMode,
          pauseAfterMs: 0,
          pauseBeforeMs: 0,
        },
        speechPolicy: {
          explanation: "Policy has not been evaluated yet.",
          mode: block.speakMode,
          profile: "Enterprise",
        },
      },
      speechText: block.spokenText.trim(),
      ui: {
        highlightUnitHint: "node",
        progressionHint: "linear",
      },
      warnings: block.warnings,
    })),
    projectId: options.projectId ?? "",
    schemaVersion: "content-ir.v1",
    sourceId,
    sourceName,
    sourceType: "preparedSource",
  };
}

function confidenceForNode(node) {
  switch (node.kind) {
    case "directive":
    case "embedded":
      return 0.72;
    case "frontmatter":
      return 0.95;
    default:
      return 0.98;
  }
}

function skippedReason(block) {
  if (block.kind === "frontmatter") {
    return "frontmatter kept as metadata";
  }
  if (block.kind === "artifact_token") {
    return "raw artifact token kept out of spoken playback";
  }
  if (block.kind === "citation") {
    return "citation marker kept out of spoken playback";
  }
  if (block.kind === "embedded") {
    return "embedded construct kept as safe fallback";
  }
  if (block.kind === "footnote") {
    return "footnote marker available through citation policy";
  }
  if (block.kind === "reference") {
    return "reference marker available through citation policy";
  }
  if (block.kind === "unknown_inline_marker") {
    return "unknown inline marker kept out of spoken playback";
  }
  if (block.kind === "directive") {
    return "unsupported directive kept as safe fallback";
  }
  return "skipped by markdown adapter";
}

function normalizeText(value) {
  return String(value).trim().split(/\s+/).filter(Boolean).join(" ");
}
