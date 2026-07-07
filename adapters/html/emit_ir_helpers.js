import {
  inlineText,
  estimateDurationMs,
  normalizeText,
  stableHash,
  stableOrderKeyFromPosition,
  stableUnitNodeId,
  textQuote,
  uniqueSlug,
  wordCount,
} from "../shared/ir.js";
import path from "node:path";

const SKIP_TAGS = new Set([
  "head",
  "script",
  "style",
  "template",
  "svg",
  "noscript",
  "nav",
  "footer",
  "form",
]);

const BLOCK_TAGS = new Set([
  "article",
  "section",
  "main",
  "div",
  "p",
  "li",
  "blockquote",
  "td",
  "th",
  "caption",
  "figcaption",
  "pre",
  "code",
]);

const CSS_SPEECH_PROPERTIES = new Set([
  "cue",
  "cue-after",
  "cue-before",
  "pause",
  "pause-after",
  "pause-before",
  "rest",
  "rest-after",
  "rest-before",
  "speak",
  "speak-as",
  "voice-balance",
  "voice-duration",
  "voice-family",
  "voice-pitch",
  "voice-range",
  "voice-rate",
  "voice-stress",
  "voice-volume",
]);

const CSS_SPEECH_PROPERTIES_PATTERN = new RegExp(
  `\\b(?:${[...CSS_SPEECH_PROPERTIES].map((item) => item.replaceAll("-", "\\-")).join("|")})\\s*:`,
  "i",
);

export function walkSemantic(node, context, path, speechContext = {}) {
  if (!isElement(node)) {
    return;
  }
  const currentSpeechContext = speechContextForNode(node, speechContext);
  const tag = node.tagName;
  if (SKIP_TAGS.has(tag) || hidden(node) || chromeElement(node)) {
    return;
  }
  const htmlPath = [...path, tagWithIndex(node)].join("/");
  if (/^h[1-6]$/.test(tag)) {
    const text = textContent(node);
    if (text) {
      context.currentSection = createSection(
        sectionId(context, node, text),
        text,
        context.sectionIndex,
        "html",
      );
      context.sectionIndex += 1;
      pushBlock(context, {
        element: node,
        htmlPath,
        kind: tag === "h1" ? "heading" : "subheading",
        role: "body",
        speechMetadata: speechMetadataForBlock(node, currentSpeechContext),
        text,
      });
    }
    return;
  }
  if (tag === "figure") {
    for (const child of elementChildren(node)) {
      walkSemantic(child, context, [...path, tagWithIndex(node)], currentSpeechContext);
    }
    return;
  }
  if (tag === "img") {
    const text = firstNonEmpty(attr(node, "alt"), attr(node, "title"));
    if (text) {
      pushBlock(context, {
        element: node,
        htmlPath,
        kind: "image",
        metadata: {
          alt: attr(node, "alt") ?? "",
          src: attr(node, "src") ?? "",
          title: attr(node, "title") ?? "",
        },
        role: "body",
        speechMetadata: speechMetadataForBlock(node, currentSpeechContext),
        speechMode: "summarize",
        text,
        warnings: ["image_alt_text"],
      });
    }
    return;
  }
  const semantic = semanticForElement(node);
  if (semantic) {
    const text = semanticText(node, semantic.kind);
    if (text) {
      pushBlock(context, {
        element: node,
        htmlPath,
        kind: semantic.kind,
        metadata: semantic.metadata,
        role: semantic.role,
        speechMetadata: speechMetadataForBlock(node, currentSpeechContext),
        speechMode: semantic.speechMode,
        text,
        warnings: semantic.warnings,
      });
    }
    return;
  }
  for (const child of elementChildren(node)) {
    walkSemantic(child, context, [...path, tagWithIndex(node)], currentSpeechContext);
  }
}

export function findElement(node, predicate) {
  if (isElement(node) && predicate(node)) {
    return node;
  }
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, predicate);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function createSection(id, title, index, kind, sourceHref = "") {
  return {
    chapterIndex: index,
    id,
    index: index - 1,
    isNarratable: true,
    kind,
    role: "body",
    sourceHref,
    title: firstNonEmpty(title, `Section ${String(index)}`),
    wordCount: 0,
  };
}

export function sectionId(context, node, text) {
  const preferred = attr(node, "id") ?? attr(node, "name") ?? text;
  return uniqueSlug(preferred, context.usedSectionIds, "section");
}

export function fragmentForBlock(context, node, text) {
  const preferred = attr(node, "id") ?? attr(node, "name") ?? text;
  return uniqueSlug(preferred, context.usedFragments, "node");
}

function identityAnchorForBlock({ block, context, explicitNodeId, fragment, section, text }) {
  if (explicitNodeId) {
    return [context.href, block.kind, section.id, fragment, text].filter(Boolean).join("|");
  }
  return [context.href, block.kind, section.kind, section.title, `text:${inlineText(text)}`]
    .filter(Boolean)
    .join("|");
}

export function sectionsFromBlocks(blocks) {
  const sections = [];
  const seen = new Set();
  for (const block of blocks) {
    const section = block.section;
    if (!section || seen.has(section.id)) {
      continue;
    }
    seen.add(section.id);
    const sectionBlocks = blocks.filter((item) => item.section?.id === section.id);
    const words = sectionBlocks.reduce((total, item) => total + (item.metadata.wordCount ?? 0), 0);
    sections.push({
      ...section,
      estimatedDurationMs: estimateDurationMs(words),
      isNarratable: words > 0 && section.role !== "frontmatter" && section.role !== "backmatter",
      wordCount: words,
    });
  }
  return sections;
}

export function speechContextForNode(node, context) {
  return {
    ...context,
    alphabet: firstNonEmpty(ssmlAttribute(node, "alphabet"), context.alphabet),
  };
}

export function pronunciationLexicons(document, baseHref) {
  return descendants(document, (item) => item.tagName === "link")
    .map((item) => {
      const rel = attr(item, "rel") ?? "";
      const type = attr(item, "type") ?? "";
      const href = attr(item, "href") ?? "";
      if (!rel.split(/\s+/).some((token) => token.toLowerCase() === "pronunciation")) {
        return undefined;
      }
      if (type.toLowerCase() !== "application/pls+xml" || !href) {
        return undefined;
      }
      return {
        href: normalizeLinkedHref(baseHref, href),
        hreflang: attr(item, "hreflang") ?? "",
        rel: "pronunciation",
        title: attr(item, "title") ?? "",
        type,
      };
    })
    .filter(Boolean);
}

export function cssSpeechStyles(document) {
  return descendants(document, (item) => item.tagName === "style")
    .map((item) => rawTextContent(item).trim())
    .filter((text) => text && CSS_SPEECH_PROPERTIES_PATTERN.test(text));
}

export function speechMetadataForBlock(node, speechContext) {
  const cssSpeech = cssSpeechHints(node);
  const phoneme = ssmlAttribute(node, "ph");
  const alphabet = firstNonEmpty(ssmlAttribute(node, "alphabet"), speechContext.alphabet);
  const pronunciationRefs = pronunciationRefsForBlock(node, speechContext);
  return {
    alphabet: phoneme ? alphabet : undefined,
    cssSpeech,
    lexiconEntryIds: [],
    pauseAfterMs: cssPauseMs(cssSpeech["pause-after"], cssSpeech.pause, "after"),
    pauseBeforeMs: cssPauseMs(cssSpeech["pause-before"], cssSpeech.pause, "before"),
    phoneme: phoneme || undefined,
    pronunciationRefs,
    sayAs: cssSpeech["speak-as"],
  };
}

export function pronunciationRefsForBlock(node, speechContext) {
  const blockText = normalizeText(textContent(node));
  const refs = [];
  let searchFrom = 0;
  const visit = (item, context) => {
    if (!isElement(item)) {
      return;
    }
    const currentContext = speechContextForNode(item, context);
    const phoneme = ssmlAttribute(item, "ph");
    if (phoneme) {
      const term = textContent(item);
      const start = Math.max(0, blockText.indexOf(term, searchFrom));
      const end = start + term.length;
      searchFrom = end;
      refs.push({
        alphabet: firstNonEmpty(ssmlAttribute(item, "alphabet"), currentContext.alphabet),
        endOffset: end,
        originalText: term,
        phoneme,
        source: "ssml",
        spoken: term,
        startOffset: start,
        term,
      });
      return;
    }
    for (const child of elementChildren(item)) {
      visit(child, currentContext);
    }
  };
  visit(node, speechContext);
  return refs.filter((ref) => ref.term && ref.phoneme);
}

function semanticForElement(node) {
  const tag = node.tagName;
  const className = attr(node, "class") ?? "";
  if (tag === "figcaption") {
    return { kind: "caption", role: "body" };
  }
  if (tag === "blockquote" || className.split(/\s+/).includes("commtext")) {
    return { kind: "quote", role: "body" };
  }
  if (tag === "li") {
    return { kind: "list", role: "body" };
  }
  if (tag === "table") {
    if (layoutTable(node)) {
      return undefined;
    }
    return { kind: "table", role: "body", speechMode: "summarize", warnings: ["table_policy"] };
  }
  if (tag === "pre" || tag === "code") {
    return { kind: "code", role: "body", speechMode: "summarize", warnings: ["code_policy"] };
  }
  if (tag === "p") {
    return { kind: "body", role: "body" };
  }
  return undefined;
}

function semanticText(node, kind) {
  if (kind === "table") {
    return tableText(node);
  }
  return normalizeText(textContent(node));
}

function tableText(node) {
  const rows = descendants(node, (item) => item.tagName === "tr");
  const output = [];
  for (const row of rows) {
    const cells = elementChildren(row)
      .filter((item) => item.tagName === "td" || item.tagName === "th")
      .map((item) => inlineText(textContent(item)))
      .filter(Boolean);
    if (cells.length > 0) {
      output.push(cells.join(" | "));
    }
  }
  return output.length > 0 ? output.join("\n") : normalizeText(textContent(node));
}

function cssSpeechHints(node) {
  const declarations = styleDeclarations(attr(node, "style") ?? "");
  const output = {};
  for (const [property, value] of Object.entries(declarations)) {
    if (CSS_SPEECH_PROPERTIES.has(property)) {
      output[property] = value;
    }
  }
  return output;
}

function styleDeclarations(value) {
  const output = {};
  for (const part of String(value ?? "").split(";")) {
    const index = part.indexOf(":");
    if (index <= 0) {
      continue;
    }
    const property = part.slice(0, index).trim().toLowerCase();
    const declarationValue = part.slice(index + 1).trim();
    if (property && declarationValue) {
      output[property] = declarationValue;
    }
  }
  return output;
}

function cssPauseMs(value, shorthand, side) {
  const direct = cssTimeMs(value);
  if (direct > 0) {
    return direct;
  }
  const parts = String(shorthand ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return 0;
  }
  if (parts.length === 1) {
    return cssTimeMs(parts[0]);
  }
  return cssTimeMs(side === "before" ? parts[0] : parts[1]);
}

function cssTimeMs(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(text);
  if (!match) {
    return 0;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < 0) {
    return 0;
  }
  return match[2] === "s" ? Math.round(amount * 1000) : Math.round(amount);
}

function layoutTable(node) {
  const className = attr(node, "class") ?? "";
  const id = attr(node, "id") ?? "";
  if (/\b(?:itemlist|comment-tree|fatitem|spacer|pagetop)\b/i.test(className) || id === "hnmain") {
    return true;
  }
  const role = attr(node, "role") ?? "";
  if (/^(presentation|none)$/i.test(role)) {
    return true;
  }
  return descendants(node, (item) => item.tagName === "th").length === 0;
}

export function pushBlock(context, block) {
  const text = normalizeText(block.text);
  if (!text) {
    return;
  }
  const fragment = fragmentForBlock(context, block.element, text);
  const section = context.currentSection;
  const words = wordCount(text);
  const speechMetadata = block.speechMetadata ?? {};
  const location = sourceLocation(block.element);
  const explicitNodeId = attr(block.element, "id") || attr(block.element, "name");
  const identityAnchor = identityAnchorForBlock({
    block,
    context,
    explicitNodeId,
    fragment,
    section,
    text,
  });
  const nodeId = explicitNodeId
    ? uniqueSlug(explicitNodeId, context.usedNodeIds, "unit")
    : stableUnitNodeId({
        anchor: identityAnchor,
        format: context.locatorType,
        kind: block.kind,
        text,
        usedIds: context.usedNodeIds,
      });
  const fingerprint = explicitNodeId
    ? undefined
    : stableHash(
        {
          anchor: identityAnchor,
          displayText: inlineText(text),
          format: context.locatorType,
          href: context.href,
          kind: block.kind,
          nodeId,
          speechText: inlineText(block.speechText ?? text),
          version: "html-no-explicit-id-unit-fingerprint.v1",
        },
        32,
      );
  const orderKey = stableOrderKeyFromPosition(location?.startOffset, context.blocks.length);
  context.blocks.push({
    alphabet: speechMetadata.alphabet,
    confidence: block.confidence ?? 0.92,
    dir: firstNonEmpty(attr(block.element, "dir"), context.dir),
    displayText: text,
    kind: block.kind,
    lang: firstNonEmpty(attr(block.element, "lang"), context.lang),
    lexiconEntryIds: speechMetadata.lexiconEntryIds,
    locator: {
      html: {
        fragment,
        href: context.href,
        textQuote: textQuote(text),
      },
      type: context.locatorType,
    },
    metadata: {
      ...block.metadata,
      ...(speechMetadata.cssSpeech ? { cssSpeech: speechMetadata.cssSpeech } : {}),
      ...(speechMetadata.pronunciationRefs?.length
        ? { pronunciationRefs: speechMetadata.pronunciationRefs }
        : {}),
      estimatedDurationMs: estimateDurationMs(words),
      ...(fingerprint ? { fingerprint } : {}),
      htmlPath: block.htmlPath,
      ...(context.pronunciationLexicons.length
        ? { pronunciationLexicons: context.pronunciationLexicons }
        : {}),
      sectionId: section.id,
      sectionIndex: section.index,
      sectionKind: section.kind,
      sectionTitle: section.title,
      sourceLocation: location,
      wordCount: words,
      fingerprintAnchor: identityAnchor,
      identityAnchor,
      identityVersion: "stable-unit-identity.v1",
      orderAnchor: location
        ? `byte:${String(location.startOffset)}`
        : `block:${String(context.blocks.length)}`,
    },
    nodeId,
    orderKey,
    pauseAfterMs: speechMetadata.pauseAfterMs,
    pauseBeforeMs: speechMetadata.pauseBeforeMs,
    phoneme: speechMetadata.phoneme,
    pronunciationRefs: speechMetadata.pronunciationRefs,
    role: block.role,
    sayAs: speechMetadata.sayAs,
    section,
    speechMode: block.speechMode ?? "speak",
    speechText: text,
    startOffset: location?.startOffset,
    endOffset: location?.endOffset,
    extraction: {
      confidence: block.confidence ?? 0.92,
      extractor: context.locatorType === "epub" ? "epub-html" : "html",
      extractorVersion: context.locatorType === "epub" ? "epub-adapter-v1" : "html-adapter-v1",
      step: context.locatorType === "epub" ? "epub-spine-html-to-content-ir" : "html-to-content-ir",
      supportTier: "core",
    },
    warnings: block.warnings,
  });
}

function descendants(node, predicate) {
  const output = [];
  for (const child of node.childNodes ?? []) {
    if (isElement(child) && predicate(child)) {
      output.push(child);
    }
    output.push(...descendants(child, predicate));
  }
  return output;
}

export function textContent(node) {
  if (!node) {
    return "";
  }
  if (node.nodeName === "#text") {
    return node.value ?? "";
  }
  if (!isElement(node) && node.childNodes === undefined) {
    return "";
  }
  if (isElement(node) && SKIP_TAGS.has(node.tagName)) {
    return "";
  }
  const separator = isElement(node) && BLOCK_TAGS.has(node.tagName) ? "\n" : " ";
  return (node.childNodes ?? []).map((child) => textContent(child)).join(separator);
}

function rawTextContent(node) {
  if (!node) {
    return "";
  }
  if (node.nodeName === "#text") {
    return node.value ?? "";
  }
  return (node.childNodes ?? []).map((child) => rawTextContent(child)).join("");
}

function elementChildren(node) {
  return (node.childNodes ?? []).filter(isElement);
}

function isElement(node) {
  return Boolean(node?.tagName);
}

export function attr(node, name) {
  if (!node?.attrs) {
    return undefined;
  }
  const item = node.attrs.find((attribute) => attribute.name.toLowerCase() === name.toLowerCase());
  return item?.value;
}

function ssmlAttribute(node, localName) {
  return (
    attr(node, `ssml:${localName}`) ??
    attr(node, localName) ??
    attr(node, `http://www.w3.org/2001/10/synthesis:${localName}`)
  );
}

export function normalizeLinkedHref(baseHref, href) {
  const cleanHref = String(href ?? "").trim();
  if (cleanHref === "" || /^[a-z][a-z0-9+.-]*:/i.test(cleanHref) || cleanHref.startsWith("#")) {
    return cleanHref;
  }
  const cleanBase = String(baseHref ?? "").trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(cleanBase)) {
    return new URL(cleanHref, cleanBase).toString();
  }
  const baseDir = path.posix.dirname(cleanBase || ".");
  return path.posix.normalize(path.posix.join(baseDir, cleanHref));
}

function hidden(node) {
  return (
    attr(node, "hidden") !== undefined ||
    attr(node, "aria-hidden") === "true" ||
    /\bdisplay\s*:\s*none\b/i.test(attr(node, "style") ?? "")
  );
}

function chromeElement(node) {
  const className = attr(node, "class") ?? "";
  return /\b(?:reply|votelinks|comhead|subtext|rank|sitebit|sitestr|navs)\b/i.test(className);
}

function tagWithIndex(node) {
  if (!node.parentNode) {
    return node.tagName;
  }
  const siblings = elementChildren(node.parentNode).filter((item) => item.tagName === node.tagName);
  const index = Math.max(0, siblings.indexOf(node));
  return `${node.tagName}[${String(index)}]`;
}

function sourceLocation(node) {
  const location = node.sourceCodeLocation;
  if (!location) {
    return undefined;
  }
  return {
    endOffset: location.endOffset,
    startOffset: location.startOffset,
  };
}

export function firstNonEmpty(...values) {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) {
      return text;
    }
  }
  return "";
}

export function metaContent(document, name) {
  const lower = name.toLowerCase();
  const meta = findElement(
    document,
    (node) =>
      node.tagName === "meta" &&
      (attr(node, "name")?.toLowerCase() === lower ||
        attr(node, "property")?.toLowerCase() === lower),
  );
  return attr(meta, "content");
}
