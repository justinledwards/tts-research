import { readFile } from "node:fs/promises";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import {
  createDocument,
  estimateDurationMs,
  inlineText,
  nodesFromBlocks,
  normalizeText,
  uniqueSlug,
  wordCount,
} from "../shared/ir.js";

export const DOCX_ADAPTER_VERSION = "docx-adapter-v1";

const xmlParser = new XMLParser({
  attributeNamePrefix: "@",
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: "#text",
});

export async function emitDOCXAdapterFromFile(sourcePath, options = {}) {
  const bytes = await readFile(sourcePath);
  return emitDOCXAdapter(bytes, options);
}

export async function emitDOCXAdapter(bytes, options = {}) {
  const zip = await JSZip.loadAsync(bytes);
  const sourceName = options.sourceName ?? "source.docx";
  const sourceId = options.sourceId ?? "docx-source";
  const projectId = options.projectId ?? "";
  const generatedAt = options.generatedAt ?? new Date(0).toISOString();
  const documentXML = await zipText(zip, "word/document.xml");
  const comments = await noteMap(zip, "word/comments.xml", "comment");
  const footnotes = await noteMap(zip, "word/footnotes.xml", "footnote");
  const endnotes = await noteMap(zip, "word/endnotes.xml", "endnote");
  const relationships = await relationshipMap(zip);
  const core = await coreProperties(zip);
  const parsed = parseDocumentXML(documentXML, {
    comments,
    endnotes,
    footnotes,
    relationships,
  });
  const nodes = nodesFromBlocks(parsed.blocks, {
    adapterVersion: DOCX_ADAPTER_VERSION,
    dir: "ltr",
    format: "docx",
    lang: "und",
    sourceId,
  });
  const metadata = {
    ...core,
    capabilities: docxCapabilities(),
    comments: [...comments.values()],
    endnotes: [...endnotes.values()],
    footnotes: [...footnotes.values()],
    sections: sectionsFromBlocks(parsed.blocks),
  };
  return {
    adapterVersion: DOCX_ADAPTER_VERSION,
    author: core.author,
    capabilities: docxCapabilities(),
    diagnostics: {
      adapterId: "docx",
      available: true,
      commentCount: comments.size,
      endnoteCount: endnotes.size,
      footnoteCount: footnotes.size,
      status: "available",
      warnings: parsed.warnings,
    },
    document: createDocument({
      adapterVersion: DOCX_ADAPTER_VERSION,
      generatedAt,
      metadata,
      nodes,
      projectId,
      sourceId,
      sourceName,
      sourceType: options.sourceType ?? "bookSource",
    }),
    metadata,
    title: core.title,
    warnings: parsed.warnings,
  };
}

export function docxCapabilities() {
  return {
    adapterId: "docx",
    extensions: [".docx"],
    features: {
      captions: true,
      comments: true,
      endnotes: true,
      footnotes: true,
      headings: true,
      images: true,
      lists: true,
      paragraphRunProvenance: true,
      tables: true,
    },
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    sourceKinds: ["file", "bookSource"],
  };
}

function parseDocumentXML(documentXML, context) {
  const body = firstMatch(documentXML, /<w:body\b[\s\S]*?<\/w:body>/i) ?? documentXML;
  const blocks = [];
  const warnings = [];
  const usedSectionIds = new Set();
  let paragraphIndex = 0;
  let section = createSection("docx-document", "Document", 1);
  for (const match of body.matchAll(/<w:(p|tbl)\b[\s\S]*?<\/w:\1>/gi)) {
    if (match[1] === "tbl") {
      const tableBlock = tableBlockFromXML(match[0], paragraphIndex, section);
      if (tableBlock) {
        blocks.push(tableBlock);
      }
      paragraphIndex += countParagraphs(match[0]);
      continue;
    }
    const paragraph = paragraphFromXML(match[0], paragraphIndex, context);
    paragraphIndex += 1;
    if (!paragraph) {
      continue;
    }
    if (paragraph.kind === "heading") {
      const sectionId = uniqueSlug(paragraph.text, usedSectionIds, "docx-section");
      section = createSection(sectionId, paragraph.text, sectionsSeen(blocks) + 1);
    }
    blocks.push(blockFromParagraph(paragraph, section));
    for (const noteBlock of referencedNoteBlocks(paragraph, section, context)) {
      blocks.push(noteBlock);
    }
  }
  return { blocks, warnings };
}

function paragraphFromXML(xml, paragraphIndex, context) {
  const text = normalizeText(extractText(xml));
  const imageAlt = imageAltText(xml);
  const relationshipIds = [...xml.matchAll(/\br:embed=["']([^"']+)["']/g)].map((match) => match[1]);
  const styleId = firstMatch(xml, /<w:pStyle\b[^>]*w:val=["']([^"']+)["']/i) ?? "";
  const bookmarkId = firstMatch(xml, /<w:bookmarkStart\b[^>]*w:name=["']([^"']+)["']/i) ?? "";
  const numberingId = firstMatch(xml, /<w:numId\b[^>]*w:val=["']([^"']+)["']/i) ?? "";
  const level = firstMatch(xml, /<w:ilvl\b[^>]*w:val=["']([^"']+)["']/i) ?? "";
  const runCount = [...xml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/gi)].length;
  const footnoteRefs = [...xml.matchAll(/<w:footnoteReference\b[^>]*w:id=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  const endnoteRefs = [...xml.matchAll(/<w:endnoteReference\b[^>]*w:id=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  const commentRefs = [...xml.matchAll(/<w:commentReference\b[^>]*w:id=["']([^"']+)["']/gi)].map(
    (match) => match[1],
  );
  if (!text && !imageAlt) {
    return undefined;
  }
  const kind = paragraphKind(styleId, numberingId, text, imageAlt);
  return {
    bookmarkId,
    commentRefs,
    endnoteRefs,
    footnoteRefs,
    imageAlt,
    kind,
    level,
    numberingId,
    paragraphIndex,
    relationshipIds,
    relationships: relationshipIds.map((id) => context.relationships.get(id)).filter(Boolean),
    runCount,
    styleId,
    text: text || imageAlt,
  };
}

function blockFromParagraph(paragraph, section) {
  const kind = paragraph.kind;
  const words = wordCount(paragraph.text);
  return {
    confidence: 0.9,
    displayText: paragraph.text,
    kind,
    locator: {
      docx: {
        bookmarkId: paragraph.bookmarkId,
        paragraphIndex: paragraph.paragraphIndex,
        runIndex: paragraph.runCount > 0 ? 0 : undefined,
      },
      type: "docx",
    },
    metadata: {
      bookmarkId: paragraph.bookmarkId,
      commentRefs: paragraph.commentRefs,
      endnoteRefs: paragraph.endnoteRefs,
      estimatedDurationMs: estimateDurationMs(words),
      footnoteRefs: paragraph.footnoteRefs,
      level: paragraph.level,
      numberingId: paragraph.numberingId,
      paragraphIndex: paragraph.paragraphIndex,
      relationshipIds: paragraph.relationshipIds,
      relationships: paragraph.relationships,
      runCount: paragraph.runCount,
      sectionId: section.id,
      sectionIndex: section.index,
      sectionKind: section.kind,
      sectionTitle: section.title,
      styleId: paragraph.styleId,
      wordCount: words,
    },
    nodeId: `docx-p${String(paragraph.paragraphIndex + 1).padStart(4, "0")}`,
    role: "body",
    section,
    speechMode: kind === "image" ? "summarize" : "speak",
    speechText: paragraph.text,
    warnings: kind === "image" ? ["image_alt_text"] : [],
  };
}

function referencedNoteBlocks(paragraph, section, context) {
  const output = [];
  for (const [kind, refs, map] of [
    ["footnote", paragraph.footnoteRefs, context.footnotes],
    ["endnote", paragraph.endnoteRefs, context.endnotes],
    ["comment", paragraph.commentRefs, context.comments],
  ]) {
    for (const id of refs) {
      const note = map.get(id);
      if (!note?.text) {
        continue;
      }
      const words = wordCount(note.text);
      output.push({
        confidence: 0.88,
        displayText: note.text,
        kind,
        locator: {
          docx: {
            paragraphIndex: paragraph.paragraphIndex,
          },
          type: "docx",
        },
        metadata: {
          estimatedDurationMs: estimateDurationMs(words),
          noteId: id,
          paragraphIndex: paragraph.paragraphIndex,
          sectionId: section.id,
          sectionIndex: section.index,
          sectionTitle: section.title,
          wordCount: words,
        },
        nodeId: `docx-p${String(paragraph.paragraphIndex + 1).padStart(4, "0")}-${kind}-${id}`,
        role: "body",
        section,
        speechMode: "summarize",
        speechText: note.text,
        warnings: [`docx_${kind}`],
      });
    }
  }
  return output;
}

function tableBlockFromXML(xml, paragraphIndex, section) {
  const rows = [];
  for (const row of xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)) {
    const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)]
      .map((cell) => inlineText(extractText(cell[0])))
      .filter(Boolean);
    if (cells.length > 0) {
      rows.push(cells.join(" | "));
    }
  }
  const text = normalizeText(rows.join("\n"));
  if (!text) {
    return undefined;
  }
  const words = wordCount(text);
  return {
    confidence: 0.84,
    displayText: text,
    kind: "table",
    locator: {
      docx: {
        paragraphIndex,
      },
      type: "docx",
    },
    metadata: {
      estimatedDurationMs: estimateDurationMs(words),
      paragraphIndex,
      rowCount: rows.length,
      sectionId: section.id,
      sectionIndex: section.index,
      sectionKind: section.kind,
      sectionTitle: section.title,
      tableCellPath: `table-${String(paragraphIndex + 1)}`,
      wordCount: words,
    },
    nodeId: `docx-table-${String(paragraphIndex + 1).padStart(4, "0")}`,
    role: "body",
    section,
    speechMode: "summarize",
    speechText: text,
    warnings: ["table_policy"],
  };
}

function paragraphKind(styleId, numberingId, text, imageAlt) {
  if (imageAlt && !text) {
    return "image";
  }
  if (/^heading\s*1$/i.test(styleId) || /^title$/i.test(styleId)) {
    return "heading";
  }
  if (/^heading/i.test(styleId)) {
    return "subheading";
  }
  if (/^caption$/i.test(styleId) || /^(figure|table)\s+\d+/i.test(text)) {
    return "caption";
  }
  if (numberingId) {
    return "list";
  }
  return "body";
}

async function noteMap(zip, filename, tagName) {
  const xml = await zipText(zip, filename).catch(() => "");
  const map = new Map();
  if (!xml) {
    return map;
  }
  const pattern = new RegExp(
    `<w:${tagName}\\b[^>]*w:id=["']([^"']+)["'][\\s\\S]*?<\\/w:${tagName}>`,
    "gi",
  );
  for (const match of xml.matchAll(pattern)) {
    map.set(match[1], {
      id: match[1],
      text: normalizeText(extractText(match[0])),
    });
  }
  return map;
}

async function relationshipMap(zip) {
  const xml = await zipText(zip, "word/_rels/document.xml.rels").catch(() => "");
  const map = new Map();
  if (!xml) {
    return map;
  }
  const parsed = xmlParser.parse(xml).Relationships;
  for (const rel of asArray(parsed?.Relationship)) {
    const id = attr(rel, "Id");
    if (id) {
      map.set(id, {
        id,
        target: attr(rel, "Target"),
        type: attr(rel, "Type"),
      });
    }
  }
  return map;
}

async function coreProperties(zip) {
  const xml = await zipText(zip, "docProps/core.xml").catch(() => "");
  if (!xml) {
    return {};
  }
  const core = xmlParser.parse(xml).coreProperties ?? {};
  return {
    author: inlineText(core.creator?.["#text"] ?? core.creator ?? ""),
    created: inlineText(core.created?.["#text"] ?? core.created ?? ""),
    modified: inlineText(core.modified?.["#text"] ?? core.modified ?? ""),
    title: inlineText(core.title?.["#text"] ?? core.title ?? ""),
  };
}

function sectionsFromBlocks(blocks) {
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
      isNarratable: words > 0,
      wordCount: words,
    });
  }
  return sections;
}

function createSection(id, title, index) {
  return {
    chapterIndex: index,
    id,
    index: index - 1,
    isNarratable: true,
    kind: "chapter",
    role: "body",
    sourceHref: "",
    title,
    wordCount: 0,
  };
}

function sectionsSeen(blocks) {
  return new Set(blocks.map((block) => block.section?.id).filter(Boolean)).size;
}

function extractText(xml) {
  return decodeXML(
    [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => match[1]).join(" "),
  );
}

function imageAltText(xml) {
  return decodeXML(
    firstMatch(xml, /<wp:docPr\b[^>]*(?:descr|title)=["']([^"']+)["']/i) ??
      firstMatch(xml, /<pic:cNvPr\b[^>]*(?:descr|name)=["']([^"']+)["']/i) ??
      "",
  );
}

function countParagraphs(xml) {
  return Math.max(1, [...xml.matchAll(/<w:p\b/gi)].length);
}

async function zipText(zip, filename) {
  const file = zip.file(filename);
  if (!file) {
    throw new Error(`Missing DOCX file: ${filename}`);
  }
  return file.async("text");
}

function firstMatch(value, pattern) {
  return pattern.exec(value)?.[1];
}

function decodeXML(value) {
  return String(value ?? "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function attr(value, name) {
  return value?.[`@${name}`] ?? "";
}
