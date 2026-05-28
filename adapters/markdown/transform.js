import { toString as mdastToString } from "mdast-util-to-string";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import {
  ADMONITION_NAMES,
  EMBEDDED_TYPES,
  POLICY_INLINE_ARTIFACT_KINDS,
  artifactMetadata,
  buildByteOffsetMap,
  cleanSpeechText,
  containsCitationMarkup,
  findInlineArtifacts,
  findMystRoles,
  firstTitle,
  firstWords,
  inlineArtifactWarnings,
  inlineSpeechText,
  inlineText,
  labelForDirective,
  labelForEmbedded,
  parseCallout,
  parseMystDirectiveLanguage,
  shouldSkipCitationBlock,
  spanForNode,
  sourceSlice,
  uniqueStrings,
} from "./transformHelpers.js";

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
