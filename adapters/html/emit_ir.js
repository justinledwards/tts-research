import * as parse5 from "parse5";
import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { createDocument, inlineText, nodesFromBlocks, normalizeText } from "../shared/ir.js";
import {
  attr,
  createSection,
  cssSpeechStyles,
  findElement,
  firstNonEmpty,
  metaContent,
  pronunciationLexicons,
  sectionsFromBlocks,
  speechContextForNode,
  speechMetadataForBlock,
  textContent,
  walkSemantic,
  pushBlock,
} from "./emit_ir_helpers.js";

export const HTML_ADAPTER_VERSION = "html-adapter-v1";

export function emitHTMLAdapter(source, options = {}) {
  const sourceName = options.sourceName ?? "source.html";
  const sourceId = options.sourceId ?? "html-source";
  const projectId = options.projectId ?? "";
  const generatedAt = options.generatedAt ?? new Date(0).toISOString();
  const extracted = extractHTMLBlocks(source, {
    href: options.href ?? options.sourceUrl ?? sourceName,
    locatorType: "html",
    sourceName,
  });
  const nodes = nodesFromBlocks(extracted.blocks, {
    adapterVersion: HTML_ADAPTER_VERSION,
    dir: extracted.dir,
    format: "html",
    lang: extracted.lang,
    sourceId,
  });
  const metadata = {
    ...extracted.metadata,
    capabilities: htmlCapabilities(),
    sections: sectionsFromBlocks(extracted.blocks),
  };
  return {
    adapterVersion: HTML_ADAPTER_VERSION,
    capabilities: htmlCapabilities(),
    diagnostics: adapterDiagnostics("html", []),
    document: createDocument({
      adapterVersion: HTML_ADAPTER_VERSION,
      generatedAt,
      metadata,
      nodes,
      projectId,
      sourceId,
      sourceName,
      sourceType: options.sourceType ?? "bookSource",
    }),
    metadata,
    title: extracted.title,
    warnings: extracted.warnings,
  };
}

export async function emitHTMLAdapterFromFile(sourcePath, options = {}) {
  if (path.extname(sourcePath).toLowerCase() !== ".zip") {
    return emitHTMLAdapter(await readFile(sourcePath, "utf8"), options);
  }
  const zip = await JSZip.loadAsync(await readFile(sourcePath));
  const entry =
    zip.file(/(^|\/)index\.x?html?$/i)[0] ??
    zip.file(/\.x?html?$/i).sort((left, right) => left.name.localeCompare(right.name))[0];
  if (!entry) {
    throw new Error("Zipped HTML package does not contain an HTML entry.");
  }
  const source = await entry.async("text");
  return emitHTMLAdapter(source, {
    ...options,
    href: options.href ?? entry.name,
    sourceName: options.sourceName ?? entry.name,
  });
}

export function extractHTMLBlocks(source, options = {}) {
  const document = parse5.parse(String(source ?? ""), { sourceCodeLocationInfo: true });
  const html = findElement(document, (node) => node.tagName === "html");
  const body = findElement(document, (node) => node.tagName === "body");
  const lang = firstNonEmpty(attr(html, "lang"), options.lang, "und");
  const dir = firstNonEmpty(attr(html, "dir"), options.dir, "ltr");
  const title = firstNonEmpty(
    metaContent(document, "og:title"),
    metaContent(document, "twitter:title"),
    inlineText(textContent(findElement(document, (node) => node.tagName === "title"))),
    options.sourceName,
  );
  const root =
    findElement(document, (node) => node.tagName === "article") ??
    findElement(document, (node) => node.tagName === "main") ??
    findElement(document, (node) => attr(node, "role")?.toLowerCase() === "main") ??
    body ??
    document;
  const documentSpeechContext = speechContextForNode(html, {});
  const rootSpeechContext =
    body && root !== body && root !== html
      ? speechContextForNode(body, documentSpeechContext)
      : documentSpeechContext;
  const context = {
    blocks: [],
    currentSection: createSection("section-document", title, 1, "html"),
    href: options.href ?? options.sourceName ?? "source.html",
    lang,
    dir,
    locatorType: options.locatorType ?? "html",
    pronunciationLexicons: pronunciationLexicons(
      document,
      options.href ?? options.sourceName ?? "source.html",
    ),
    sectionIndex: 1,
    sourceName: options.sourceName ?? "source.html",
    usedFragments: new Set(),
    usedNodeIds: new Set(),
    usedSectionIds: new Set(),
    warnings: [],
  };
  walkSemantic(root, context, [], rootSpeechContext);
  if (context.blocks.length === 0) {
    const text = normalizeText(textContent(root));
    if (text) {
      pushBlock(context, {
        element: root,
        htmlPath: "/document",
        kind: "body",
        role: "body",
        speechMetadata: speechMetadataForBlock(root, rootSpeechContext),
        text,
      });
    }
  }
  for (const [index, block] of context.blocks.entries()) {
    block.locator.html.progression =
      context.blocks.length <= 1 ? 0 : index / Math.max(1, context.blocks.length - 1);
  }
  return {
    blocks: context.blocks,
    dir,
    lang,
    metadata: {
      description: firstNonEmpty(
        metaContent(document, "description"),
        metaContent(document, "og:description"),
      ),
      lang,
      dir,
      title,
      cssSpeechStyles: cssSpeechStyles(document),
      pronunciationLexicons: context.pronunciationLexicons,
    },
    title,
    warnings: context.warnings,
  };
}

export function htmlCapabilities() {
  return {
    adapterId: "html",
    extensions: [".html", ".htm", ".zip"],
    features: {
      altText: true,
      captions: true,
      figures: true,
      fragments: true,
      langPropagation: true,
      pronunciationLexicons: true,
      semanticBlocks: true,
      speechMetadata: true,
      speechStyles: true,
      tables: true,
    },
    mimeTypes: ["text/html", "application/xhtml+xml", "application/zip"],
    sourceKinds: ["file", "url", "bookSource"],
  };
}

export function adapterDiagnostics(adapterId, warnings = []) {
  return {
    adapterId,
    available: true,
    status: "available",
    warnings,
  };
}
