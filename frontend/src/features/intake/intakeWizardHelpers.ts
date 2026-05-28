import type { BookSource, BookScope, PreparedSource } from "../../types";
import { normalizeBookScopeForBook, resolveDefaultBookScope } from "../book-cinema/model";
import {
  extensionForName,
  type IntakeIntentId,
  type IntakeSourceChoice,
  type IntakeSourceMode,
  type IntakeSourceType,
} from "./sourceTypeModel";
import type { IntakeProjectTemplate } from "./projectTemplates";
import type { SourceLifecycleEnvelope } from "../source-lifecycle/sourceLifecycle";
import type { BookSourceImportOptions } from "../../types";

export type IntakeExistingSource =
  | {
      detail: string;
      envelope: SourceLifecycleEnvelope;
      key: string;
      label: string;
      optionLabel: string;
      source: BookSource;
      type: "book";
    }
  | {
      detail: string;
      envelope: SourceLifecycleEnvelope;
      key: string;
      label: string;
      optionLabel: string;
      source: PreparedSource;
      type: "prepared";
    };

export function initialIntentForSelection(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): IntakeIntentId {
  return intentForHydratedSource(
    sourceMode,
    Boolean(selectedBookSource),
    selectedPreparedSource?.kind ?? null,
  );
}

export function intentForHydratedSource(
  sourceMode: IntakeSourceMode,
  hasBookSource: boolean,
  preparedSourceKind: PreparedSource["kind"] | null,
): IntakeIntentId {
  if (sourceMode === "book" && hasBookSource) {
    return "book";
  }
  if (sourceMode === "fileUrl" && preparedSourceKind === "url") {
    return "webpage";
  }
  if (sourceMode === "fileUrl" && preparedSourceKind) {
    return "document";
  }
  return "document";
}

export function initialSourceChoiceForSelection(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
  text: string,
): IntakeSourceChoice {
  if (
    (sourceMode === "book" && selectedBookSource) ||
    (sourceMode === "fileUrl" && selectedPreparedSource)
  ) {
    return "existing";
  }
  if (text.trim()) {
    return "pastedText";
  }
  return "file";
}

export function initialExistingSourceKey(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): string {
  if (sourceMode === "fileUrl" && selectedPreparedSource) {
    return `prepared:${selectedPreparedSource.id}`;
  }
  if (sourceMode === "book" && selectedBookSource) {
    return `book:${selectedBookSource.id}`;
  }
  if (selectedPreparedSource) {
    return `prepared:${selectedPreparedSource.id}`;
  }
  return "";
}

export function existingSourceTypeForDetection(
  source: IntakeExistingSource | undefined,
): IntakeSourceType | null {
  if (!source) {
    return null;
  }
  if (source.type === "book") {
    return "book";
  }
  return source.source.kind === "url" ? "webpage" : "document";
}

export function selectedSourceKeyForMode(
  sourceMode: IntakeSourceMode,
  selectedBookSource: BookSource | null,
  selectedPreparedSource: PreparedSource | null,
): string {
  return initialExistingSourceKey(sourceMode, selectedBookSource, selectedPreparedSource);
}

export function bookScopeForWizard(source: BookSource | null, selectedScope: BookScope | null) {
  if (!source) {
    return null;
  }
  return selectedScope
    ? normalizeBookScopeForBook(source, selectedScope)
    : resolveDefaultBookScope(source);
}

export function activeDestinationBook(
  existingSource: IntakeExistingSource | undefined,
  selectedBookSource: BookSource | null,
): BookSource | null {
  if (existingSource) {
    return existingSource.type === "book" ? existingSource.source : null;
  }
  return selectedBookSource?.status === "ready" ? selectedBookSource : null;
}

export function activeDestinationPrepared(
  existingSource: IntakeExistingSource | undefined,
  selectedPreparedSource: PreparedSource | null,
): PreparedSource | null {
  if (existingSource) {
    return existingSource.type === "prepared" ? existingSource.source : null;
  }
  return selectedPreparedSource?.status === "ready" ? selectedPreparedSource : null;
}

export function destinationStructureLabel(
  bookScopeContent: { blocks?: unknown[] } | null,
  activeBook: BookSource | null,
  detectedStructureLabel: string,
): string {
  const bookBlockCount = bookScopeContent?.blocks?.length ?? 0;
  if (bookBlockCount > 0 && activeBook) {
    return `${bookBlockCount.toLocaleString()} review blocks`;
  }
  return detectedStructureLabel;
}

export function shouldImportFileAsBook(file: File, sourceType: IntakeSourceType): boolean {
  return sourceType === "book" || isBookAdapterExtension(extensionForName(file.name));
}

export function shouldImportUrlAsBook(url: string, sourceType: IntakeSourceType): boolean {
  return sourceType === "book" || isBookAdapterExtension(extensionForName(url));
}

function isBookAdapterExtension(extension: string): boolean {
  return [
    "pdf",
    "epub",
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
  ].includes(extension);
}

export function bookImportOptionsForTemplate(
  template: IntakeProjectTemplate,
): BookSourceImportOptions {
  if (template.id === "technical-book") {
    return { importProfile: "scholarly", pdfTableMode: "structured" };
  }
  return {};
}
