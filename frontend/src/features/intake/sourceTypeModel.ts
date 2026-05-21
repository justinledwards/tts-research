export type IntakeIntentId = "book" | "document" | "webpage" | "technicalReview" | "voiceClone";

export type IntakeSourceChoice = "file" | "url" | "pastedText" | "existing";

export type IntakeSourceType = "book" | "document" | "webpage" | "draft" | "voice-clone";

export type IntakeSourceMode = "book" | "fileUrl" | "text";

export type IntakePreparationTarget = "auto" | "book" | "prepared";

export interface IntakeSourceDetectionInput {
  existingSourceType?: IntakeSourceType | null;
  fileName?: string | null;
  intentId: IntakeIntentId;
  pastedText?: string | null;
  sourceChoice: IntakeSourceChoice;
  templateSourceType?: IntakeSourceType | null;
  url?: string | null;
}

export interface IntakeSourceDetection {
  confidence: "high" | "medium" | "low";
  language: string;
  reason: string;
  sourceMode: IntakeSourceMode;
  sourceType: IntakeSourceType;
  structureLabel: string;
  title: string;
}

const BOOK_EXTENSIONS = new Set([
  "epub",
  "pdf",
  "docx",
  "html",
  "htm",
  "zip",
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "bmp",
  "webp",
]);

const DOCUMENT_EXTENSIONS = new Set(["md", "markdown", "txt", "text", "log", "csv", "json"]);

const WEB_EXTENSIONS = new Set(["html", "htm"]);

export function detectIntakeSource(input: IntakeSourceDetectionInput): IntakeSourceDetection {
  const templateSourceType = input.templateSourceType ?? null;
  if (input.sourceChoice === "existing" && input.existingSourceType) {
    return {
      confidence: "high",
      language: "en-US",
      reason: "Existing source selected",
      sourceMode: sourceModeForType(input.existingSourceType),
      sourceType: input.existingSourceType,
      structureLabel: structureLabelForType(input.existingSourceType),
      title: "Existing source",
    };
  }

  if (input.sourceChoice === "file") {
    return detectFileSource(input.fileName, input.intentId, templateSourceType);
  }

  if (input.sourceChoice === "url") {
    return detectUrlSource(input.url, input.intentId, templateSourceType);
  }

  if (input.sourceChoice === "pastedText") {
    return detectPastedTextSource(input.pastedText, input.intentId, templateSourceType);
  }

  const sourceType = templateSourceType ?? defaultSourceTypeForIntent(input.intentId);
  return {
    confidence: "low",
    language: "en-US",
    reason: "Choose a source to improve detection",
    sourceMode: sourceModeForType(sourceType),
    sourceType,
    structureLabel: structureLabelForType(sourceType),
    title: titleForIntent(input.intentId),
  };
}

export function sourceModeForType(sourceType: IntakeSourceType): IntakeSourceMode {
  if (sourceType === "book") {
    return "book";
  }
  if (sourceType === "draft") {
    return "text";
  }
  return "fileUrl";
}

export function preparationTargetForSourceType(
  sourceType: IntakeSourceType,
): IntakePreparationTarget {
  return sourceType === "book" ? "book" : "prepared";
}

export function defaultSourceTypeForIntent(intentId: IntakeIntentId): IntakeSourceType {
  switch (intentId) {
    case "book": {
      return "book";
    }
    case "webpage": {
      return "webpage";
    }
    case "technicalReview": {
      return "document";
    }
    case "voiceClone": {
      return "voice-clone";
    }
    default: {
      return "document";
    }
  }
}

export function sourceTypeLabel(sourceType: IntakeSourceType): string {
  switch (sourceType) {
    case "book": {
      return "Book";
    }
    case "document": {
      return "Document";
    }
    case "webpage": {
      return "Webpage";
    }
    case "voice-clone": {
      return "Voice clone";
    }
    default: {
      return "Draft text";
    }
  }
}

export function languageLabel(language: string): string {
  switch (language) {
    case "sv-SE": {
      return "Swedish";
    }
    case "es-ES": {
      return "Spanish";
    }
    case "fr-FR": {
      return "French";
    }
    case "de-DE": {
      return "German";
    }
    default: {
      return "English";
    }
  }
}

export function extensionForName(value: string | null | undefined): string {
  const path = value?.split("?")[0]?.split("#")[0] ?? "";
  const last = path.split("/").pop() ?? path;
  const index = last.lastIndexOf(".");
  return index === -1 ? "" : last.slice(index + 1).toLowerCase();
}

function detectFileSource(
  fileName: string | null | undefined,
  intentId: IntakeIntentId,
  templateSourceType: IntakeSourceType | null,
): IntakeSourceDetection {
  const extension = extensionForName(fileName);
  const sourceType = sourceTypeForExtension(extension, intentId, templateSourceType);
  return {
    confidence: extension ? "high" : "medium",
    language: "en-US",
    reason: extension ? `${extension.toUpperCase()} file selected` : "File source selected",
    sourceMode: sourceModeForType(sourceType),
    sourceType,
    structureLabel: structureLabelForFile(extension, sourceType),
    title: titleFromFileName(fileName) || titleForIntent(intentId),
  };
}

function detectUrlSource(
  url: string | null | undefined,
  intentId: IntakeIntentId,
  templateSourceType: IntakeSourceType | null,
): IntakeSourceDetection {
  const extension = extensionForName(url);
  const sourceType =
    extension && BOOK_EXTENSIONS.has(extension)
      ? sourceTypeForExtension(extension, intentId, templateSourceType)
      : "webpage";
  return {
    confidence: url?.trim() ? "medium" : "low",
    language: "en-US",
    reason: url?.trim() ? "URL source selected" : "URL waiting",
    sourceMode: sourceModeForType(sourceType),
    sourceType,
    structureLabel:
      sourceType === "webpage" ? "Readable webpage blocks" : structureLabelForType(sourceType),
    title: titleFromUrl(url) || titleForIntent(intentId),
  };
}

function detectPastedTextSource(
  text: string | null | undefined,
  intentId: IntakeIntentId,
  templateSourceType: IntakeSourceType | null,
): IntakeSourceDetection {
  const clean = text?.trim() ?? "";
  const sourceType = templateSourceType === "document" ? "document" : "draft";
  const paragraphCount = estimateParagraphCount(clean);
  const paragraphLabel = `${paragraphCount.toLocaleString()} paragraph${paragraphCount === 1 ? "" : "s"}`;
  return {
    confidence: clean ? "medium" : "low",
    language: detectLanguage(clean),
    reason: clean ? "Pasted text available" : "Paste text to detect structure",
    sourceMode: "text",
    sourceType,
    structureLabel: clean ? paragraphLabel : structureLabelForType(sourceType),
    title: titleFromText(clean) || titleForIntent(intentId),
  };
}

function sourceTypeForExtension(
  extension: string,
  intentId: IntakeIntentId,
  templateSourceType: IntakeSourceType | null,
): IntakeSourceType {
  if (WEB_EXTENSIONS.has(extension) && intentId === "webpage") {
    return "webpage";
  }
  if (BOOK_EXTENSIONS.has(extension)) {
    return intentId === "book" || templateSourceType === "book" ? "book" : "document";
  }
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return templateSourceType === "book" ? "book" : "document";
  }
  return templateSourceType ?? defaultSourceTypeForIntent(intentId);
}

function structureLabelForFile(extension: string, sourceType: IntakeSourceType): string {
  if (extension === "epub") {
    return "Spine, chapters, and landmarks";
  }
  if (extension === "pdf") {
    return "Pages, text blocks, and tables";
  }
  if (extension === "docx") {
    return "Sections, headings, and comments";
  }
  if (extension === "md" || extension === "markdown") {
    return "Markdown headings and blocks";
  }
  if (WEB_EXTENSIONS.has(extension)) {
    return "HTML headings and readable regions";
  }
  return structureLabelForType(sourceType);
}

function structureLabelForType(sourceType: IntakeSourceType): string {
  switch (sourceType) {
    case "book": {
      return "Chapters, pages, and sections";
    }
    case "webpage": {
      return "Article body and readable regions";
    }
    case "draft": {
      return "Paragraphs and listener blocks";
    }
    case "voice-clone": {
      return "Reference audio readiness";
    }
    default: {
      return "Headings, blocks, notes, and skipped content";
    }
  }
}

function titleForIntent(intentId: IntakeIntentId): string {
  switch (intentId) {
    case "book": {
      return "New book source";
    }
    case "webpage": {
      return "New webpage source";
    }
    case "technicalReview": {
      return "Technical review source";
    }
    case "voiceClone": {
      return "Voice clone experiment";
    }
    default: {
      return "New document source";
    }
  }
}

function titleFromFileName(value: string | null | undefined): string {
  const fileName = value?.split("/").pop()?.trim() ?? "";
  if (!fileName) {
    return "";
  }
  return fileName.replaceAll(/\.[^.]+$/g, "").replaceAll(/[-_]+/g, " ");
}

function titleFromUrl(value: string | null | undefined): string {
  const clean = value?.trim();
  if (!clean) {
    return "";
  }
  try {
    const parsed = new URL(clean);
    const pathTitle = titleFromFileName(parsed.pathname);
    return pathTitle || parsed.hostname.replace(/^www\./, "");
  } catch {
    return clean.replace(/^https?:\/\//, "").slice(0, 80);
  }
}

function titleFromText(value: string): string {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : "";
}

function estimateParagraphCount(value: string): number {
  return Math.max(1, value.split(/\n{2,}/).filter((part) => part.trim().length > 0).length);
}

function detectLanguage(value: string): string {
  if (/[åäöÅÄÖ]/.test(value)) {
    return "sv-SE";
  }
  if (/[ñ¿¡]/.test(value)) {
    return "es-ES";
  }
  if (/[éèêàçù]/i.test(value)) {
    return "fr-FR";
  }
  if (/[ßü]/i.test(value)) {
    return "de-DE";
  }
  return "en-US";
}
