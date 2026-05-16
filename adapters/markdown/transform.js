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
const TURN_CITATION_PATTERN = /\bturn\d+(?:search|view|news|fetch)\d+\b/g;
const MYST_ROLE_PATTERN = /\{([A-Za-z][\w-]*)\}`([^`]+)`/g;

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
    case "thematicBreak":
    case "definition":
    case "footnoteDefinition":
      pushSemanticNode(node, astPath, parentId, context, {
        kind: "citation",
        label: "Citation",
        metadata: {
          identifier: node.identifier ?? "",
        },
        speechText: cleanSpeechText(mdastToString(node)),
        warnings: ["citation_skipped"],
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
  const warnings = [];
  if (embeddedChildren.length > 0 || mystRoles.length > 0) {
    warnings.push("embedded_fallback");
  }
  const speechText = cleanSpeechText(inlineSpeechText(node));
  const raw = sourceSlice(node, context);
  if (speechText !== "") {
    pushSemanticNode(node, astPath, parentId, context, {
      kind: shouldSkipCitationBlock(raw) ? "citation" : "body",
      label: firstWords(speechText, 8),
      speechText,
      warnings: citationWarnings(raw, speechText, warnings),
    });
  } else if (containsCitationMarkup(raw)) {
    pushSemanticNode(node, astPath, parentId, context, {
      kind: "citation",
      label: "Citation",
      speakMode: "skip",
      speechText: "",
      warnings: ["citation_skipped"],
    });
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
    lineEnd: end.line ?? 0,
    lineStart: start.line ?? 0,
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
    case "inlineCode":
    case "text":
      return node.value ?? "";
    default:
      if (Array.isArray(node.children)) {
        return node.children.map((child) => inlineChildSpeech(child)).join(" ");
      }
      return node.value ?? "";
  }
}

function cleanSpeechText(value) {
  let clean = String(value)
    .replaceAll(CITATION_GLYPH_PATTERN, " ")
    .replaceAll(TURN_CITATION_PATTERN, " ")
    .replaceAll(MYST_ROLE_PATTERN, "$2")
    .replaceAll("**", "")
    .replaceAll("__", "")
    .replaceAll("~~", "")
    .replaceAll("•", "");
  clean = clean.trim().replaceAll(/^[\s>*_.-]+|[\s`*_>-]+$/g, "");
  return clean.split(/\s+/).filter(Boolean).join(" ");
}

function citationWarnings(raw, speechText, warnings) {
  const output = [...warnings];
  if (containsCitationMarkup(raw)) {
    output.push(shouldSkipCitationBlock(speechText) ? "citation_skipped" : "citation_removed");
  }
  return uniqueStrings(output);
}

function containsCitationMarkup(value) {
  return (
    /\uE200cite[^\uE201]*\uE201/.test(value) ||
    /\bturn\d+(?:search|view|news|fetch)\d+\b/.test(value)
  );
}

function shouldSkipCitationBlock(value) {
  const trimmed = String(value).trim();
  if (trimmed === "") {
    return false;
  }
  const citationStripped = trimmed
    .replaceAll(CITATION_GLYPH_PATTERN, "")
    .replaceAll(TURN_CITATION_PATTERN, "");
  return citationStripped.replaceAll(/[\s[\]().,;:|]/g, "") === "";
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
