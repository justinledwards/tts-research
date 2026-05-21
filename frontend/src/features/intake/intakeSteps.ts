import type { IntakeIntentId, IntakeSourceChoice } from "./sourceTypeModel";

export type IntakeStepId = "intent" | "source" | "metadata" | "voice" | "destination";

export interface IntakeStepDefinition {
  description: string;
  id: IntakeStepId;
  label: string;
}

export interface IntakeIntentOption {
  description: string;
  id: IntakeIntentId;
  label: string;
  recommendedSourceChoice: IntakeSourceChoice;
}

export interface IntakeSourceChoiceOption {
  description: string;
  id: IntakeSourceChoice;
  label: string;
}

export const INTAKE_STEPS: readonly IntakeStepDefinition[] = [
  {
    description: "Choose what the studio should help you make.",
    id: "intent",
    label: "Intent",
  },
  {
    description: "Pick the source path without choosing an adapter by hand.",
    id: "source",
    label: "Source",
  },
  {
    description: "Confirm title, language, type, and detected structure.",
    id: "metadata",
    label: "Metadata",
  },
  {
    description: "Choose the initial voice/profile for Review, Preview, and Teleprompt.",
    id: "voice",
    label: "Voice",
  },
  {
    description: "Open the next studio stage with source context preserved.",
    id: "destination",
    label: "Open",
  },
] as const;

export const INTAKE_INTENT_OPTIONS: readonly IntakeIntentOption[] = [
  {
    description: "Long-form EPUB, PDF, DOCX, HTML, or scanned source.",
    id: "book",
    label: "Narrate a book",
    recommendedSourceChoice: "file",
  },
  {
    description: "PDF, DOCX, Markdown, logs, notes, or structured files.",
    id: "document",
    label: "Read a document",
    recommendedSourceChoice: "file",
  },
  {
    description: "Readable web page, article, or hosted document URL.",
    id: "webpage",
    label: "Read a webpage",
    recommendedSourceChoice: "url",
  },
  {
    description: "Inspect technical content, generated audio, or listener-readiness.",
    id: "technicalReview",
    label: "Create a technical/audio review",
    recommendedSourceChoice: "pastedText",
  },
  {
    description: "Move to the voice workflow with source context still visible.",
    id: "voiceClone",
    label: "Voice clone experiment",
    recommendedSourceChoice: "file",
  },
] as const;

export const INTAKE_SOURCE_CHOICE_OPTIONS: readonly IntakeSourceChoiceOption[] = [
  {
    description: "PDF, EPUB, DOCX, Markdown, HTML, image, text, CSV, JSON, or logs.",
    id: "file",
    label: "File",
  },
  {
    description: "Webpage, raw text URL, PDF URL, EPUB URL, or hosted document.",
    id: "url",
    label: "URL",
  },
  {
    description: "Draft text, copied prose, notes, or quick test material.",
    id: "pastedText",
    label: "Pasted text",
  },
  {
    description: "Reuse a prepared source or imported book from this project.",
    id: "existing",
    label: "Existing source",
  },
] as const;

export function nextIntakeStep(current: IntakeStepId): IntakeStepId {
  const index = INTAKE_STEPS.findIndex((step) => step.id === current);
  return INTAKE_STEPS[Math.min(INTAKE_STEPS.length - 1, index + 1)]?.id ?? "intent";
}

export function previousIntakeStep(current: IntakeStepId): IntakeStepId {
  const index = INTAKE_STEPS.findIndex((step) => step.id === current);
  return INTAKE_STEPS[Math.max(0, index - 1)]?.id ?? "intent";
}
