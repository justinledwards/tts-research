import { toString as mdastToString } from "mdast-util-to-string";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

const ADMONITION_NAMES = new Set([
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

const EMBEDDED_TYPES = new Set([
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
const MALFORMED_CITATION_PATTERN = /\[(?:cite|citation|source|reference)(?::[^\]\n]*)?\]/gi;
const TURN_CITATION_PATTERN = /\bturn\d+(?:search|view|news|fetch)\d+\b/g;
const FOOTNOTE_REFERENCE_PATTERN = /\[\^[^\]\s]+\]/g;
const REFERENCE_MARKER_PATTERN =
  /\[(?:\d+(?:\s*(?:,|-|–)\s*\d+)*(?:,\s*p\.?\s*\d+)?|[A-Z][A-Za-z .'-]{1,40}(?:19|20)\d{2}[^\]\n]{0,20})\]/g;
const BRACKETED_METADATA_PATTERN =
  /\[(?:todo|note|metadata|draft|review|debug|loc(?:ator)?|id|ref)[:\s][^\]\n]{0,80}\]/gi;
const MYST_ROLE_PATTERN = /\{([A-Za-z][\w-]*)\}`([^`]+)`/g;
const POLICY_INLINE_ARTIFACT_KINDS = new Set([
  "artifact_token",
  "citation",
  "footnote",
  "reference",
  "unknown_inline_marker",
]);

export function transformMarkdownAst(tree, source, options = {}) {
  const byteMap = buildByteOffsetMap(source);
  const context = {
    byteMap,
    metadata: {
      capabilities: {
        commonmark: true,
        directives: true,
        frontmatter: true,
        gfm: true,
        mdx: true,
        mystSafeSubset: true,
      },
      frontmatter: [],
    },
    nodes: [],
    source,
    warnings: [...(options.parseWarnings ?? [])],
  };
  transformChildren(tree.children ?? [], "/children", "", context);
  return {
    metadata: context.metadata,
    nodes: context.nodes,
    title: firstTitle(context.nodes),
    warnings: uniqueStrings(context.warnings),
  };
}

function transformChildren(children, path, parentId, context) {
  for (const [index, child] of children.entries()) {
    transformNode(child, `${path}/${index}`, parentId, context);
  }
}

function transformNode(node, astPath, parentId, context) {
  switch (node.type) {
    case "yaml":
    case "toml":
      pushFrontmatter(node, astPath, parentId, context);
      return;
    case "heading":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: node.depth > 1 ? "subheading" : "heading",
        label: inlineText(node),
        speechText: inlineSpeechText(node),
      });
      return;
    case "paragraph":
      pushParagraph(node, astPath, parentId, context);
      return;
    case "blockquote":
      pushBlockquote(node, astPath, parentId, context);
      return;
    case "list":
      pushList(node, astPath, parentId, context);
      return;
    case "table":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "table",
        label: "Table",
        metadata: tableMetadata(node),
        speechText: sourceSlice(node, context),
        warnings: ["table_policy"],
      });
      return;
    case "code":
      pushCodeLike(node, astPath, parentId, context);
      return;
    case "math":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "math",
        label: "Math expression",
        speechText: sourceSlice(node, context),
        warnings: ["math_policy"],
      });
      return;
    case "image":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "image",
        label: "Image",
        metadata: {
          alt: node.alt ?? "",
          url: node.url ?? "",
        },
        speechText: cleanSpeechText(node.alt ?? ""),
        warnings: ["image_policy"],
      });
      return;
    case "definition":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "reference",
        label: "Reference",
        metadata: {
          identifier: node.identifier ?? "",
          url: node.url ?? "",
        },
        speakMode: "skip",
        speechText: "",
        warnings: ["reference_on_demand"],
      });
      return;
    case "footnoteDefinition":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "footnote",
        label: "Footnote",
        metadata: {
          identifier: node.identifier ?? "",
        },
        speechText: cleanSpeechText(mdastToString(node)),
        warnings: ["footnote_policy"],
      });
      return;
    case "thematicBreak":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "embedded",
        label: "Thematic break",
        speakMode: "skip",
        speechText: "",
        warnings: ["markdown_thematic_break"],
      });
      return;
    case "containerDirective":
    case "leafDirective":
    case "textDirective":
      pushDirective(node, astPath, parentId, context);
      return;
    default:
      if (EMBEDDED_TYPES.has(node.type)) {
        pushEmbedded(node, astPath, parentId, context, {
          family: node.type.startsWith("mdx") ? "mdx" : "html",
          name: node.name ?? node.type,
        });
        return;
      }
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "embedded",
        label: `Unsupported ${node.type}`,
        metadata: {
          embeddedFamily: "markdown",
          embeddedName: node.type,
        },
        speakMode: "skip",
        speechText: "",
        warnings: ["markdown_unknown_node"],
      });
  }
}

function pushFrontmatter(node, astPath, parentId, context) {
  const format = node.type;
  const warnings = ["frontmatter_metadata"];
  const metadata = {
    frontmatterFormat: format,
    frontmatterRaw: node.value ?? "",
  };
  try {
    metadata.frontmatter =
      format === "toml" ? parseToml(node.value ?? "") : parseYaml(node.value ?? "");
  } catch (error) {
    metadata.frontmatterParseError = String(error.message ?? error);
    warnings.push("frontmatter_parse_error");
  }
  context.metadata.frontmatter.push({
    format,
    metadata: metadata.frontmatter ?? null,
    raw: metadata.frontmatterRaw,
  });
  pushSemanticNode(node, astPath, parentId, context, {
    kind: "frontmatter",
    label: `${format.toUpperCase()} frontmatter`,
    metadata,
    speakMode: "skip",
    speechText: "",
    warnings,
  });
}

function pushParagraph(node, astPath, parentId, context) {
  const embeddedChildren = (node.children ?? [])
    .map((child, index) => ({ child, index }))
    .filter(({ child }) => EMBEDDED_TYPES.has(child.type));
  const mystRoles = findMystRoles(node, context);
  const inlineArtifacts = findInlineArtifacts(node, context);
  const warnings = [];
  if (embeddedChildren.length > 0 || mystRoles.length > 0) {
    warnings.push("embedded_fallback");
  }
  const speechText = cleanSpeechText(inlineSpeechText(node));
  const raw = sourceSlice(node, context);
  const emitsSyntheticArtifacts =
    inlineArtifacts.length > 0 && speechText !== "" && !shouldSkipCitationBlock(raw);
  if (speechText !== "") {
    pushSemanticNode(node, astPath, parentId, context, {
      kind: shouldSkipCitationBlock(raw) ? "citation" : "body",
      label: firstWords(speechText, 8),
      metadata:
        inlineArtifacts.length > 0
          ? {
              inlineArtifacts: inlineArtifacts.map((artifact) => artifactMetadata(artifact)),
            }
          : {},
      speechText,
      warnings: inlineArtifactWarnings(inlineArtifacts, raw, speechText, warnings),
    });
  } else if (inlineArtifacts.length > 0 || containsCitationMarkup(raw)) {
    pushSemanticNode(node, astPath, parentId, context, {
      kind: "citation",
      label: "Citation",
      metadata:
        inlineArtifacts.length > 0
          ? {
              inlineArtifacts: inlineArtifacts.map((artifact) => artifactMetadata(artifact)),
            }
          : {},
      speakMode: "skip",
      speechText: "",
      warnings: inlineArtifactWarnings(inlineArtifacts, raw, speechText, ["citation_skipped"]),
    });
  }
  for (const artifact of emitsSyntheticArtifacts ? inlineArtifacts : []) {
    if (POLICY_INLINE_ARTIFACT_KINDS.has(artifact.kind)) {
      pushSyntheticInlineArtifact(artifact, astPath, parentId, context);
    }
  }
  for (const { child, index } of embeddedChildren) {
    pushEmbedded(child, `${astPath}/children/${index}`, parentId, context, {
      family: child.type.startsWith("mdx") ? "mdx" : "html",
      name: child.name ?? child.type,
    });
  }
  for (const role of mystRoles) {
    pushSyntheticEmbedded(role, astPath, parentId, context);
  }
}

function pushBlockquote(node, astPath, parentId, context) {
  const raw = sourceSlice(node, context);
  const callout = parseCallout(raw);
  if (callout) {
    pushSemanticNode(node, astPath, parentId, context, {
      kind: "admonition",
      label: callout.label,
      metadata: {
        admonitionKind: callout.kind,
        directiveName: callout.kind,
      },
      speechText: cleanSpeechText(callout.body),
      warnings: ["admonition_callout"],
    });
    return;
  }
  pushSemanticNode(node, astPath, parentId, context, {
    kind: "quote",
    label: "Quote",
    speechText: cleanSpeechText(mdastToString(node)),
  });
}

function pushList(node, astPath, parentId, context) {
  for (const [index, child] of (node.children ?? []).entries()) {
    const speechText = cleanSpeechText(mdastToString(child));
    if (speechText === "") {
      continue;
    }
    pushSemanticNode(child, `${astPath}/children/${index}`, parentId, context, {
      kind: "body",
      label: firstWords(speechText, 8),
      metadata: {
        checked: child.checked ?? null,
        listOrdered: Boolean(node.ordered),
      },
      speechText,
    });
  }
}

function pushCodeLike(node, astPath, parentId, context) {
  const mystDirective = parseMystDirectiveLanguage(node.lang ?? "");
  if (mystDirective) {
    const kind = ADMONITION_NAMES.has(mystDirective.name) ? "admonition" : "directive";
    pushSemanticNode(node, astPath, parentId, context, {
      kind,
      label: labelForDirective(mystDirective.name, node.meta),
      metadata: {
        directiveName: mystDirective.name,
        directiveArguments: mystDirective.arguments,
        directiveFamily: "myst",
      },
      speakMode: kind === "admonition" ? "speak" : "skip",
      speechText: kind === "admonition" ? cleanSpeechText(node.value ?? "") : "",
      warnings: kind === "admonition" ? ["admonition_directive"] : ["directive_fallback"],
    });
    return;
  }
  pushSemanticNode(node, astPath, parentId, context, {
    kind: "code",
    label: "Code sample",
    language: node.lang ?? "",
    metadata: {
      codeMeta: node.meta ?? "",
      language: node.lang ?? "",
    },
    speechText: node.value ?? "",
    warnings: ["code_policy"],
  });
}

function pushDirective(node, astPath, parentId, context) {
  const directiveName = node.name ?? "directive";
  const kind = ADMONITION_NAMES.has(directiveName) ? "admonition" : "directive";
  pushSemanticNode(node, astPath, parentId, context, {
    kind,
    label: labelForDirective(directiveName, node.label),
    metadata: {
      directiveAttributes: node.attributes ?? {},
      directiveName,
      directiveType: node.type,
    },
    speakMode: kind === "admonition" ? "speak" : "skip",
    speechText: kind === "admonition" ? cleanSpeechText(mdastToString(node)) : "",
    warnings: kind === "admonition" ? ["admonition_directive"] : ["directive_fallback"],
  });
}

function pushEmbedded(node, astPath, parentId, context, metadata) {
  pushSemanticNode(node, astPath, parentId, context, {
    kind: "embedded",
    label: labelForEmbedded(metadata.name, metadata.family),
    metadata: {
      embeddedFamily: metadata.family,
      embeddedName: metadata.name,
    },
    speakMode: "skip",
    speechText: "",
    warnings: ["embedded_fallback"],
  });
}

function pushSyntheticEmbedded(role, astPath, parentId, context) {
  context.nodes.push({
    astPath: `${astPath}/myst-role/${role.index}`,
    columnEnd: role.columnEnd,
    columnStart: role.columnStart,
    displayText: role.raw,
    endOffset: role.endOffset,
    kind: "embedded",
    label: labelForEmbedded(role.name, "myst"),
    metadata: {
      embeddedFamily: "myst",
      embeddedName: role.name,
      fallbackText: role.text,
    },
    parentId,
    role: "embedded",
    sourceSlice: role.raw,
    speakMode: "skip",
    speechText: "",
    startOffset: role.startOffset,
    warnings: ["embedded_fallback"],
  });
}

function pushSyntheticInlineArtifact(artifact, astPath, parentId, context) {
  context.nodes.push({
    astPath: `${astPath}/inline-artifact/${artifact.index}`,
    columnEnd: artifact.columnEnd,
    columnStart: artifact.columnStart,
    displayText: artifact.raw,
    endOffset: artifact.endOffset,
    kind: artifact.kind,
    label: artifact.label,
    language: "",
    lineEnd: artifact.lineEnd,
    lineStart: artifact.lineStart,
    metadata: artifactMetadata(artifact),
    parentId,
    role: artifact.kind,
    sourceSlice: artifact.raw,
    speakMode: "skip",
    speechText: artifact.speechText,
    startOffset: artifact.startOffset,
    warnings: uniqueStrings(["inline_artifact", artifact.warning, `${artifact.kind}_policy`]),
  });
}

function pushSemanticNode(node, astPath, parentId, context, fields) {
  const span = spanForNode(node, context);
  const displayText = sourceSlice(node, context);
  context.nodes.push({
    astPath,
    columnEnd: span.columnEnd,
    columnStart: span.columnStart,
    displayText,
    endOffset: span.endOffset,
    kind: fields.kind,
    label: fields.label ?? "",
    language: fields.language ?? "",
    lineEnd: span.lineEnd,
    lineStart: span.lineStart,
    metadata: fields.metadata ?? {},
    parentId,
    role: fields.role ?? fields.kind,
    sourceSlice: displayText,
    speakMode: fields.speakMode ?? "speak",
    speechText: fields.speechText ?? cleanSpeechText(mdastToString(node)),
    startOffset: span.startOffset,
    warnings: fields.warnings ?? [],
  });
}

function tableMetadata(node) {
  const rows = (node.children ?? []).map((row) =>
    (row.children ?? []).map((cell) => cleanSpeechText(mdastToString(cell))),
  );
  return {
    align: node.align ?? [],
    headers: rows[0] ?? [],
    rows: rows.slice(1),
  };
}

function spanForNode(node, context) {
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

function sourceSlice(node, context) {
  const startOffset = node.position?.start?.offset ?? 0;
  const endOffset = node.position?.end?.offset ?? startOffset;
  return context.source.slice(startOffset, endOffset);
}

function inlineText(node) {
  return cleanSpeechText(mdastToString(node));
}

function inlineSpeechText(node) {
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

function cleanSpeechText(value) {
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

function inlineArtifactWarnings(artifacts, raw, speechText, warnings) {
  const output = [...warnings];
  for (const artifact of artifacts) {
    output.push(artifact.warning);
  }
  if (containsCitationMarkup(raw)) {
    output.push(shouldSkipCitationBlock(speechText) ? "citation_skipped" : "citation_removed");
  }
  return uniqueStrings(output);
}

function containsCitationMarkup(value) {
  return inlineArtifactPatterns().some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function shouldSkipCitationBlock(value) {
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

function findInlineArtifacts(node, context) {
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

function artifactMetadata(artifact) {
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

function parseCallout(raw) {
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

function parseMystDirectiveLanguage(language) {
  const match = /^\{([A-Za-z][\w-]*)}\s*(.*)$/.exec(language.trim());
  if (!match) {
    return null;
  }
  return {
    arguments: match[2]?.trim() ?? "",
    name: match[1].toLowerCase(),
  };
}

function findMystRoles(node, context) {
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

function labelForDirective(name, fallback = "") {
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

function labelForEmbedded(name, family) {
  return `${family.toUpperCase()} embedded ${name}`;
}

function firstTitle(nodes) {
  return (
    nodes.find((node) => node.kind === "heading" || node.kind === "subheading")?.speechText ?? ""
  );
}

function firstWords(value, count) {
  return value.split(/\s+/).filter(Boolean).slice(0, count).join(" ");
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildByteOffsetMap(source) {
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

function byteOffsetAt(map, codeOffset) {
  return map[Math.max(0, Math.min(codeOffset, map.length - 1))] ?? 0;
}
