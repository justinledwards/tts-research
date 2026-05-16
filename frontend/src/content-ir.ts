export const CONTENT_IR_SCHEMA_VERSION = "content-ir.v1";

export interface ContentIRDocument {
  schemaVersion: typeof CONTENT_IR_SCHEMA_VERSION;
  id: string;
  sourceType: string;
  sourceId: string;
  projectId: string;
  sourceName: string;
  adapterVersion: string;
  generatedAt: string;
  metadata?: Record<string, unknown>;
  nodes: ContentIRNode[];
}

export interface ContentIRNode {
  nodeId: string;
  parentId: string;
  orderKey: string;
  kind: string;
  role: string;
  displayText: string;
  normalisedText: string;
  speechText: string;
  lang: string;
  script: string;
  dir: string;
  provenance: ContentIRProvenance;
  ui: ContentIRUIHints;
  speech: ContentIRSpeechMetadata;
  warnings: string[];
  confidence: number;
  rights: ContentIRRightsMetadata;
  metadata?: Record<string, unknown>;
  adapterVersion: string;
}

export interface ContentIRProvenance {
  format: string;
  sourceId: string;
  locator: ContentIRLocator;
  offsets: ContentIROffsets;
  extraction?: ContentIRExtractionProvenance;
}

export interface ContentIROffsets {
  start: number;
  end: number;
}

export interface ContentIRExtractionProvenance {
  extractor: string;
  extractorVersion: string;
  supportTier: string;
  step: string;
  confidence: number;
}

export interface ContentIRLocator {
  type: "markdown" | "html" | "epub" | "pdf" | "docx" | "ocr";
  markdown?: ContentIRMarkdownLocator;
  html?: ContentIRHTMLLocator;
  pdf?: ContentIRPDFLocator;
  docx?: ContentIRDOCXLocator;
  ocr?: ContentIROCRLocator;
}

export interface ContentIRMarkdownLocator {
  path: string;
  lineStart: number;
  lineEnd: number;
  columnStart: number;
  columnEnd: number;
  astPath: string;
}

export interface ContentIRHTMLLocator {
  href: string;
  fragment: string;
  textQuote?: string;
  progression?: number;
  epubCfi?: string;
}

export interface ContentIRPDFLocator {
  pageIndex: number;
  bbox?: ContentIRBBox;
  polygon?: ContentIRPoint[];
  readingOrderIndex?: number;
}

export interface ContentIRDOCXLocator {
  paragraphIndex: number;
  runIndex?: number;
  bookmarkId?: string;
}

export interface ContentIROCRLocator {
  pageIndex: number;
  polygon: ContentIRPoint[];
  ocrEngine: string;
  ocrConfidence: number;
}

export interface ContentIRBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentIRPoint {
  x: number;
  y: number;
}

export interface ContentIRUIHints {
  progressionHint: string;
  highlightUnitHint: string;
}

export interface ContentIRSpeechMetadata {
  policyHint: ContentIRSpeechPolicyHint;
  speechPolicy: ContentIRSpeechPolicy;
}

export interface ContentIRSpeechPolicyHint {
  mode: string;
  emphasis: string;
  pauseBeforeMs: number;
  pauseAfterMs: number;
}

export interface ContentIRSpeechPolicy {
  profile: string;
  element?: string;
  elementMode?: string;
  mode: string;
  explanation: string;
}

export interface ContentIRRightsMetadata {
  status: string;
  notes: string;
}

export function formatContentIRLocator(locator: ContentIRLocator): string {
  if (locator.markdown) {
    const range =
      locator.markdown.lineStart === locator.markdown.lineEnd
        ? `line ${locator.markdown.lineStart.toString()}`
        : `lines ${locator.markdown.lineStart.toString()}-${locator.markdown.lineEnd.toString()}`;
    return `${locator.markdown.path}:${range}`;
  }
  if (locator.html) {
    const suffix = locator.html.fragment ? `#${locator.html.fragment}` : "";
    return `${locator.html.href}${suffix}`;
  }
  if (locator.pdf) {
    return `page ${(locator.pdf.pageIndex + 1).toString()}`;
  }
  if (locator.docx) {
    return `paragraph ${(locator.docx.paragraphIndex + 1).toString()}`;
  }
  if (locator.ocr) {
    return `page ${(locator.ocr.pageIndex + 1).toString()} · ${locator.ocr.ocrEngine}`;
  }
  return locator.type;
}

export function contentIRNodePreview(node: ContentIRNode): string {
  const text = node.speechText.trim() || node.displayText.trim() || node.normalisedText.trim();
  return text.length > 180 ? `${text.slice(0, 179).trim()}…` : text;
}
