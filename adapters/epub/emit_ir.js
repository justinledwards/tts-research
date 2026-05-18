import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import { extractHTMLBlocks } from "../html/emit_ir.js";
import {
  createDocument,
  estimateDurationMs,
  inlineText,
  nodesFromBlocks,
  slugify,
  textQuote,
  wordCount,
} from "../shared/ir.js";

export const EPUB_ADAPTER_VERSION = "epub-adapter-v1";

const xmlParser = new XMLParser({
  attributeNamePrefix: "@",
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: "#text",
});

export async function emitEPUBAdapterFromFile(sourcePath, options = {}) {
  const bytes = await readFile(sourcePath);
  return emitEPUBAdapter(bytes, options);
}

export async function emitEPUBAdapter(bytes, options = {}) {
  const zip = await JSZip.loadAsync(bytes);
  const sourceName = options.sourceName ?? "source.epub";
  const sourceId = options.sourceId ?? "epub-source";
  const projectId = options.projectId ?? "";
  const generatedAt = options.generatedAt ?? new Date(0).toISOString();
  const packagePath = await epubPackagePath(zip);
  const packageXML = await zipText(zip, packagePath);
  const packageDoc = xmlParser.parse(packageXML).package;
  if (!packageDoc) {
    throw new Error("EPUB package document is invalid.");
  }
  const baseDir = dirname(packagePath);
  const manifest = parseManifest(packageDoc, baseDir);
  const spine = parseSpine(packageDoc, manifest);
  const navLabels = await parseNavigationLabels(zip, packageDoc, manifest);
  const mediaOverlays = await parseMediaOverlays(zip, manifest);
  const metadata = packageMetadata(packageDoc);
  const blocks = [];
  const sections = [];
  const cssSpeechStyles = [];
  const pronunciationLexicons = [];
  const warnings = [];
  let chapterIndex = 1;
  for (const item of spine) {
    if (!item?.href || !htmlMedia(item.mediaType, item.href)) {
      continue;
    }
    let html;
    try {
      html = await zipText(zip, item.href);
    } catch {
      warnings.push(`epub_missing_spine_item:${item.href}`);
      continue;
    }
    const extracted = extractHTMLBlocks(html, {
      href: item.href,
      locatorType: "epub",
      sourceName: item.href,
    });
    cssSpeechStyles.push(...(extracted.metadata.cssSpeechStyles ?? []));
    pronunciationLexicons.push(...(extracted.metadata.pronunciationLexicons ?? []));
    if (extracted.blocks.length === 0) {
      continue;
    }
    const chapterTitle =
      navLabels.get(stripFragment(item.href)) ??
      extracted.title ??
      `Chapter ${String(chapterIndex)}`;
    const sectionId = `epub-${String(chapterIndex).padStart(4, "0")}`;
    const chapterBlocks = extracted.blocks.map((block, index) =>
      epubBlock(block, {
        chapterIndex,
        chapterTitle,
        href: item.href,
        index,
        item,
        sectionId,
        total: extracted.blocks.length,
      }),
    );
    const words = chapterBlocks.reduce((total, block) => total + wordCount(block.displayText), 0);
    sections.push({
      chapterIndex,
      estimatedDurationMs: estimateDurationMs(words),
      id: sectionId,
      index: sections.length,
      isNarratable: words > 0 && sectionRole(chapterTitle, item.href) === "body",
      kind: "chapter",
      role: sectionRole(chapterTitle, item.href),
      sourceHref: item.href,
      title: chapterTitle,
      wordCount: words,
    });
    blocks.push(...chapterBlocks);
    chapterIndex += 1;
  }
  if (blocks.length === 0) {
    throw new Error("EPUB has no readable XHTML spine content.");
  }
  const nodes = nodesFromBlocks(blocks, {
    adapterVersion: EPUB_ADAPTER_VERSION,
    dir: "ltr",
    format: "epub",
    lang: metadata.language || "und",
    sourceId,
  });
  const documentMetadata = {
    ...metadata,
    capabilities: epubCapabilities(),
    cssSpeechStyles: uniqueObjects(cssSpeechStyles),
    mediaOverlays,
    packagePath,
    pronunciationLexicons: uniqueObjects(pronunciationLexicons),
    sections,
  };
  return {
    adapterVersion: EPUB_ADAPTER_VERSION,
    author: metadata.author,
    capabilities: epubCapabilities(),
    diagnostics: {
      adapterId: "epub",
      available: true,
      mediaOverlayCount: mediaOverlays.length,
      spineItemCount: spine.length,
      status: "available",
      warnings,
    },
    document: createDocument({
      adapterVersion: EPUB_ADAPTER_VERSION,
      generatedAt,
      metadata: documentMetadata,
      nodes,
      projectId,
      sourceId,
      sourceName,
      sourceType: options.sourceType ?? "bookSource",
    }),
    metadata: documentMetadata,
    title: metadata.title,
    warnings,
  };
}

export function epubCapabilities() {
  return {
    adapterId: "epub",
    extensions: [".epub"],
    features: {
      captions: true,
      epubCfi: "best-effort",
      fragments: true,
      mediaOverlays: true,
      metadata: true,
      pronunciationLexicons: true,
      speechMetadata: true,
      speechStyles: true,
      spineTraversal: true,
      tables: true,
    },
    mimeTypes: ["application/epub+zip"],
    sourceKinds: ["file", "url", "bookSource"],
  };
}

function epubBlock(block, context) {
  const hrefSlug = slugify(context.href.replaceAll("/", "-"), "spine");
  const localId = block.nodeId ?? `${block.kind}-${String(context.index + 1).padStart(4, "0")}`;
  const nodeId = `${hrefSlug}-${localId}`;
  const progression = context.total <= 1 ? 0 : context.index / Math.max(1, context.total - 1);
  return {
    ...block,
    locator: {
      epub: {
        ...block.locator.html,
        epubCfi: bestEffortCFI(context.item.idref ?? context.item.id, localId),
        href: context.href,
        progression,
        textQuote: block.locator.html?.textQuote ?? textQuote(block.displayText),
      },
      type: "epub",
    },
    metadata: {
      ...block.metadata,
      chapterIndex: context.chapterIndex,
      chapterTitle: context.chapterTitle,
      epubCfiBestEffort: true,
      manifestId: context.item.id,
      mediaOverlayId: context.item.mediaOverlayId,
      sectionId: context.sectionId,
      sectionIndex: context.chapterIndex - 1,
      sectionKind: "chapter",
      sectionTitle: context.chapterTitle,
      sourceHref: context.href,
      spineIdref: context.item.idref,
    },
    nodeId,
    section: {
      chapterIndex: context.chapterIndex,
      id: context.sectionId,
      index: context.chapterIndex - 1,
      isNarratable: true,
      kind: "chapter",
      role: sectionRole(context.chapterTitle, context.href),
      sourceHref: context.href,
      title: context.chapterTitle,
    },
    warnings: [...(block.warnings ?? []), "epub_cfi_best_effort"],
  };
}

async function epubPackagePath(zip) {
  const containerXML = await zipText(zip, "META-INF/container.xml");
  const container = xmlParser.parse(containerXML).container;
  const rootfile = first(asArray(container?.rootfiles?.rootfile));
  const packagePath = attr(rootfile, "full-path");
  if (!packagePath) {
    throw new Error("EPUB container does not declare a package document.");
  }
  return packagePath;
}

function parseManifest(packageDoc, baseDir) {
  const manifest = new Map();
  for (const item of asArray(packageDoc.manifest?.item)) {
    const id = attr(item, "id");
    const href = attr(item, "href");
    if (!id || !href) {
      continue;
    }
    manifest.set(id, {
      href: normalizeZipPath(baseDir, href),
      id,
      mediaOverlayId: attr(item, "media-overlay"),
      mediaType: attr(item, "media-type"),
      properties: attr(item, "properties"),
    });
  }
  return manifest;
}

function parseSpine(packageDoc, manifest) {
  const spine = [];
  for (const itemref of asArray(packageDoc.spine?.itemref)) {
    const idref = attr(itemref, "idref");
    const item = manifest.get(idref);
    if (item) {
      spine.push({ ...item, idref });
    }
  }
  return spine.length > 0
    ? spine
    : [...manifest.values()].filter((item) => htmlMedia(item.mediaType, item.href));
}

async function parseNavigationLabels(zip, packageDoc, manifest) {
  const labels = new Map();
  const nav = [...manifest.values()].find((item) => /\bnav\b/i.test(item.properties ?? ""));
  if (nav) {
    const html = await zipText(zip, nav.href).catch(() => "");
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      labels.set(
        normalizeZipPath(dirname(nav.href), match[1]).split("#")[0],
        inlineText(stripTags(match[2])),
      );
    }
  }
  const tocID = attr(packageDoc.spine, "toc");
  const ncx = tocID
    ? manifest.get(tocID)
    : [...manifest.values()].find((item) => /\.ncx$/i.test(item.href));
  if (ncx) {
    const ncxXML = await zipText(zip, ncx.href).catch(() => "");
    const parsed = xmlParser.parse(ncxXML).ncx;
    for (const point of asArray(parsed?.navMap?.navPoint)) {
      const href = normalizeZipPath(dirname(ncx.href), attr(point.content, "src")).split("#")[0];
      const label = inlineText(point.navLabel?.text?.["#text"] ?? point.navLabel?.text ?? "");
      if (href && label && !labels.has(href)) {
        labels.set(href, label);
      }
    }
  }
  return labels;
}

async function parseMediaOverlays(zip, manifest) {
  const overlays = [];
  for (const item of manifest.values()) {
    if (!/smil/i.test(item.mediaType ?? "") && !/\.smil$/i.test(item.href)) {
      continue;
    }
    const xml = await zipText(zip, item.href).catch(() => "");
    const parsed = xml ? xmlParser.parse(xml).smil : undefined;
    const pars = [];
    collectSMILPars(parsed?.body, pars);
    overlays.push({
      audioRefs: pars.map((item) => item.audio).filter(Boolean),
      href: item.href,
      id: item.id,
      textRefs: pars.map((item) => item.text).filter(Boolean),
    });
  }
  return overlays;
}

function collectSMILPars(node, output) {
  if (!node || typeof node !== "object") {
    return;
  }
  for (const par of asArray(node.par)) {
    output.push({
      audio: attr(par.audio, "src"),
      text: attr(par.text, "src"),
    });
  }
  for (const seq of asArray(node.seq)) {
    collectSMILPars(seq, output);
  }
}

function packageMetadata(packageDoc) {
  const metadata = packageDoc.metadata ?? {};
  return {
    author: inlineText(metadata.creator?.["#text"] ?? metadata.creator ?? ""),
    language: inlineText(metadata.language?.["#text"] ?? metadata.language ?? ""),
    modified: firstMeta(metadata, "dcterms:modified"),
    publisher: inlineText(metadata.publisher?.["#text"] ?? metadata.publisher ?? ""),
    title: inlineText(metadata.title?.["#text"] ?? metadata.title ?? ""),
  };
}

function firstMeta(metadata, propertyName) {
  for (const item of asArray(metadata.meta)) {
    if (attr(item, "property") === propertyName) {
      return inlineText(item["#text"] ?? item);
    }
  }
  return "";
}

function sectionRole(title, href) {
  const lower = `${title} ${href}`.toLowerCase();
  if (/\b(copyright|title page|contents|toc|cover)\b/.test(lower)) {
    return "frontmatter";
  }
  if (/\b(appendix|appendices)\b/.test(lower)) {
    return "appendix";
  }
  if (/\b(about|acknowledg|bibliography|index|notes)\b/.test(lower)) {
    return "backmatter";
  }
  return "body";
}

function htmlMedia(mediaType, href) {
  return /html|xhtml/i.test(mediaType ?? "") || /\.x?html?$/i.test(href ?? "");
}

function bestEffortCFI(idref, fragment) {
  return `epubcfi(/6/${slugify(idref, "spine")}!/${slugify(fragment, "node")})`;
}

async function zipText(zip, filename) {
  const file = zip.file(filename);
  if (!file) {
    throw new Error(`Missing EPUB file: ${filename}`);
  }
  return file.async("text");
}

function normalizeZipPath(baseDir, href) {
  if (!href) {
    return "";
  }
  const [pathname, fragment] = href.split("#");
  const clean = path.posix
    .normalize(path.posix.join(baseDir || "", decodeURI(pathname)))
    .replaceAll(/^\/+/g, "");
  return fragment ? `${clean}#${fragment}` : clean;
}

function dirname(value) {
  const dir = path.posix.dirname(value);
  return dir === "." ? "" : dir;
}

function stripFragment(value) {
  return String(value ?? "").split("#")[0];
}

function stripTags(value) {
  return String(value ?? "").replaceAll(/<[^>]+>/g, " ");
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function uniqueObjects(values) {
  const seen = new Set();
  const output = [];
  for (const value of values ?? []) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(value);
  }
  return output;
}

function attr(value, name) {
  return value?.[`@${name}`] ?? "";
}

function first(values) {
  return values[0];
}
