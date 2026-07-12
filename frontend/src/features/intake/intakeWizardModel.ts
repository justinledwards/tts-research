import type { StatusChipTone } from "../../design";
import { classifyUrlIntake, type URLIntakeSafety } from "../privacy";
import type { IntakeStepId } from "./intakeSteps";
import {
  extensionForName,
  sourceModeForType,
  sourceTypeLabel,
  type IntakeIntentId,
  type IntakeSourceChoice,
  type IntakeSourceDetection,
  type IntakeSourceMode,
  type IntakeSourceType,
} from "./sourceTypeModel";

export interface IntakeFileLike {
  name: string;
  size: number;
}

export interface IntakeExistingSourceLike {
  detail: string;
  disabledReason?: string;
  key: string;
  label: string;
  type: "book" | "prepared";
}

export interface IntakeSourceCandidate {
  adapterRouteLabel: string;
  confidencePrompt: string | null;
  detected: IntakeSourceDetection;
  hasSourceInput: boolean;
  inputSummary: string;
  preparationRoute: IntakeSourceMode;
  sourceChoice: IntakeSourceChoice;
  sourceLabel: string;
  sourceType: IntakeSourceType;
  urlSafety: URLIntakeSafety | null;
}

export type IntakeReadinessState =
  | {
      actionLabel: "Open Review";
      detail: string;
      status: "ready";
      title: "Ready for review";
      tone: StatusChipTone;
    }
  | {
      actionLabel: "Wait for import";
      detail: string;
      recoveryStep: IntakeStepId;
      status: "working";
      title: "Preparing source";
      tone: StatusChipTone;
    }
  | {
      actionLabel: string;
      detail: string;
      recoveryStep: IntakeStepId;
      status: "blocked";
      title: string;
      tone: StatusChipTone;
    };

export interface BuildIntakeSourceCandidateInput {
  detected: IntakeSourceDetection;
  draftText: string;
  existingSourceKey: string;
  selectedExistingSource?: IntakeExistingSourceLike;
  selectedFile: IntakeFileLike | null;
  sourceChoice: IntakeSourceChoice;
  sourceType: IntakeSourceType;
  sourceTypeWasEdited: boolean;
  sourceUrl: string;
}

export function buildIntakeSourceCandidate({
  detected,
  draftText,
  existingSourceKey,
  selectedExistingSource,
  selectedFile,
  sourceChoice,
  sourceType,
  sourceTypeWasEdited,
  sourceUrl,
}: BuildIntakeSourceCandidateInput): IntakeSourceCandidate {
  const urlSafety = sourceChoice === "url" ? classifyUrlIntake(sourceUrl) : null;
  return {
    adapterRouteLabel: adapterRouteLabel({
      selectedFile,
      sourceType,
      sourceTypeWasEdited,
      sourceUrl,
    }),
    confidencePrompt: confidencePrompt(detected, sourceTypeWasEdited),
    detected,
    hasSourceInput: hasSourceInput({
      draftText,
      existingSourceKey,
      selectedFile,
      sourceChoice,
      sourceUrl,
    }),
    inputSummary: inputSummary({
      draftText,
      selectedExistingSource,
      selectedFile,
      sourceChoice,
      sourceUrl,
    }),
    preparationRoute: sourceModeForType(sourceType),
    sourceChoice,
    sourceLabel: sourceChoiceLabel(sourceChoice),
    sourceType,
    urlSafety,
  };
}

export interface ResolveIntakeReadinessInput {
  backendError: string | null;
  candidate: IntakeSourceCandidate;
  draftText: string;
  intentId: IntakeIntentId;
  isWorking: boolean;
  selectedExistingSource?: IntakeExistingSourceLike;
  selectedFile: IntakeFileLike | null;
  sourceUrl: string;
}

export interface DetectedIntakeDefaultsInput {
  currentLanguage: string;
  currentSourceType: IntakeSourceType;
  detectedLanguage: string;
  detectedSourceType: IntakeSourceType;
  languageWasEdited: boolean;
  sourceTypeWasEdited: boolean;
}

export function resolveDetectedIntakeDefaults({
  currentLanguage,
  currentSourceType,
  detectedLanguage,
  detectedSourceType,
  languageWasEdited,
  sourceTypeWasEdited,
}: DetectedIntakeDefaultsInput): { language: string; sourceType: IntakeSourceType } {
  return {
    language: languageWasEdited ? currentLanguage : detectedLanguage,
    sourceType: sourceTypeWasEdited ? currentSourceType : detectedSourceType,
  };
}

export function resolveIntakeReadiness({
  backendError,
  candidate,
  draftText,
  intentId,
  isWorking,
  selectedExistingSource,
  selectedFile,
  sourceUrl,
}: ResolveIntakeReadinessInput): IntakeReadinessState {
  if (isWorking) {
    return {
      actionLabel: "Wait for import",
      detail: "Source preparation is running. Review will be available when extraction finishes.",
      recoveryStep: "source",
      status: "working",
      title: "Preparing source",
      tone: "info",
    };
  }

  if (backendError) {
    return {
      actionLabel: "Choose another source",
      detail: backendError,
      recoveryStep: "source",
      status: "blocked",
      title: "Import needs attention",
      tone: "danger",
    };
  }

  if (intentId === "voiceClone") {
    return {
      actionLabel: "Open Review",
      detail: "Voice clone experiments continue in the dedicated voice workflow.",
      status: "ready",
      title: "Ready for review",
      tone: "success",
    };
  }

  const sourceBlocker = sourceInputBlocker({
    candidate,
    draftText,
    selectedExistingSource,
    selectedFile,
    sourceUrl,
  });
  if (sourceBlocker) {
    return sourceBlocker;
  }

  if (candidate.confidencePrompt) {
    return {
      actionLabel: "Correct source type",
      detail: candidate.confidencePrompt,
      recoveryStep: "metadata",
      status: "blocked",
      title: "Confirm detected source",
      tone: "warning",
    };
  }

  return {
    actionLabel: "Open Review",
    detail: `${candidate.sourceLabel} is ready to open with ${sourceTypeLabel(candidate.sourceType)} settings.`,
    status: "ready",
    title: "Ready for review",
    tone: "success",
  };
}

function sourceInputBlocker({
  candidate,
  draftText,
  selectedExistingSource,
  selectedFile,
  sourceUrl,
}: Pick<
  ResolveIntakeReadinessInput,
  "candidate" | "draftText" | "selectedExistingSource" | "selectedFile" | "sourceUrl"
>): IntakeReadinessState | null {
  switch (candidate.sourceChoice) {
    case "file": {
      return selectedFile
        ? null
        : missingSource(
            "Choose a file",
            "Pick a PDF, EPUB, DOCX, Markdown, HTML, image, text, CSV, JSON, or log file.",
          );
    }
    case "url": {
      return urlReadinessBlocker(candidate, sourceUrl);
    }
    case "pastedText": {
      return draftText.trim()
        ? null
        : missingSource("Paste text", "Add the text you want to make audible.");
    }
    case "existing": {
      return existingSourceBlocker(selectedExistingSource);
    }
  }
}

function urlReadinessBlocker(
  candidate: IntakeSourceCandidate,
  sourceUrl: string,
): IntakeReadinessState | null {
  if (!sourceUrl.trim()) {
    return missingSource("Enter a URL", "Paste an http or https URL before continuing.");
  }
  if (!candidate.urlSafety || candidate.urlSafety.allowedByDefault) {
    return null;
  }
  return {
    actionLabel: "Enter a public URL",
    detail: candidate.urlSafety.detail,
    recoveryStep: "source",
    status: "blocked",
    title: candidate.urlSafety.label,
    tone: candidate.urlSafety.tone,
  };
}

function existingSourceBlocker(
  selectedExistingSource: IntakeExistingSourceLike | undefined,
): IntakeReadinessState | null {
  if (!selectedExistingSource) {
    return missingSource(
      "Select an existing source",
      "Choose a prepared source or imported book from this project.",
    );
  }
  if (!selectedExistingSource.disabledReason) {
    return null;
  }
  return {
    actionLabel: "Choose a ready source",
    detail: selectedExistingSource.disabledReason,
    recoveryStep: "source",
    status: "blocked",
    title: "Existing source is not ready",
    tone: "warning",
  };
}

export function shouldRouteFileAsBook(
  file: IntakeFileLike,
  sourceType: IntakeSourceType,
  sourceTypeWasEdited: boolean,
): boolean {
  if (sourceType === "book") {
    return true;
  }
  if (sourceTypeWasEdited) {
    return false;
  }
  return isBookCapableExtension(extensionForName(file.name));
}

export function shouldRouteUrlAsBook(
  url: string,
  sourceType: IntakeSourceType,
  sourceTypeWasEdited: boolean,
): boolean {
  if (sourceType === "book") {
    return true;
  }
  if (sourceTypeWasEdited) {
    return false;
  }
  return isBookCapableExtension(extensionForName(url));
}

function missingSource(title: string, detail: string): IntakeReadinessState {
  return {
    actionLabel: title,
    detail,
    recoveryStep: "source",
    status: "blocked",
    title,
    tone: "warning",
  };
}

function hasSourceInput({
  draftText,
  existingSourceKey,
  selectedFile,
  sourceChoice,
  sourceUrl,
}: Pick<
  BuildIntakeSourceCandidateInput,
  "draftText" | "existingSourceKey" | "selectedFile" | "sourceChoice" | "sourceUrl"
>): boolean {
  if (sourceChoice === "file") {
    return Boolean(selectedFile);
  }
  if (sourceChoice === "url") {
    return sourceUrl.trim().length > 0;
  }
  if (sourceChoice === "pastedText") {
    return draftText.trim().length > 0;
  }
  return existingSourceKey.trim().length > 0;
}

function inputSummary({
  draftText,
  selectedExistingSource,
  selectedFile,
  sourceChoice,
  sourceUrl,
}: Pick<
  BuildIntakeSourceCandidateInput,
  "draftText" | "selectedExistingSource" | "selectedFile" | "sourceChoice" | "sourceUrl"
>): string {
  if (sourceChoice === "file") {
    return selectedFile
      ? `${selectedFile.name} · ${selectedFile.size.toLocaleString()} bytes`
      : "Waiting for a file";
  }
  if (sourceChoice === "url") {
    return sourceUrl.trim() || "Waiting for a URL";
  }
  if (sourceChoice === "pastedText") {
    const wordCount = draftText.trim().split(/\s+/).filter(Boolean).length;
    return wordCount > 0 ? `${wordCount.toLocaleString()} pasted words` : "Waiting for text";
  }
  return selectedExistingSource
    ? `${selectedExistingSource.label} · ${selectedExistingSource.detail}`
    : "Waiting for an existing source";
}

function sourceChoiceLabel(sourceChoice: IntakeSourceChoice): string {
  switch (sourceChoice) {
    case "url": {
      return "URL source";
    }
    case "pastedText": {
      return "Pasted text";
    }
    case "existing": {
      return "Existing source";
    }
    default: {
      return "File source";
    }
  }
}

function adapterRouteLabel({
  selectedFile,
  sourceType,
  sourceTypeWasEdited,
  sourceUrl,
}: Pick<
  BuildIntakeSourceCandidateInput,
  "selectedFile" | "sourceType" | "sourceTypeWasEdited" | "sourceUrl"
>): string {
  const route = sourceModeForType(sourceType);
  if (route === "text") {
    return "Draft text route";
  }
  if (route === "book") {
    return "Book import route";
  }
  const sourceName = selectedFile?.name ?? sourceUrl;
  if (!sourceTypeWasEdited && isBookCapableExtension(extensionForName(sourceName))) {
    return "Book-capable source; auto-routes to book import unless corrected";
  }
  return "Prepared source route";
}

function confidencePrompt(
  detected: IntakeSourceDetection,
  sourceTypeWasEdited: boolean,
): string | null {
  if (detected.confidence !== "low" || sourceTypeWasEdited) {
    return null;
  }
  return "Detection is uncertain. Confirm the source type and language before opening Review.";
}

function isBookCapableExtension(extension: string): boolean {
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
