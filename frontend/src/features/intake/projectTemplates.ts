import type { BuiltInSpeechPolicyProfileName } from "../../types";
import type { IntakeIntentId, IntakeSourceChoice, IntakeSourceType } from "./sourceTypeModel";

export type IntakeTemplateId =
  | "technical-book"
  | "blog-article"
  | "education-reading"
  | "accessibility-full-content"
  | "enterprise-summary"
  | "language-learning";

export interface IntakeProjectTemplate {
  description: string;
  id: IntakeTemplateId;
  intentId: IntakeIntentId;
  label: string;
  language: string;
  sourceChoice: IntakeSourceChoice;
  sourceType: IntakeSourceType;
  speechPolicyProfile: BuiltInSpeechPolicyProfileName;
  voiceStrategy: "default" | "language" | "profile";
}

export const INTAKE_PROJECT_TEMPLATES: readonly IntakeProjectTemplate[] = [
  {
    description: "Long-form source with headings, tables, notes, math, and durable review context.",
    id: "technical-book",
    intentId: "book",
    label: "Technical book",
    language: "en-US",
    sourceChoice: "file",
    sourceType: "book",
    speechPolicyProfile: "TechnicalDocs",
    voiceStrategy: "default",
  },
  {
    description: "Readable web article or blog post with citations and section flow preserved.",
    id: "blog-article",
    intentId: "webpage",
    label: "Blog/article",
    language: "en-US",
    sourceChoice: "url",
    sourceType: "webpage",
    speechPolicyProfile: "Education",
    voiceStrategy: "default",
  },
  {
    description: "Classroom or study material with clearer lists, tables, and learning pacing.",
    id: "education-reading",
    intentId: "document",
    label: "Education reading",
    language: "en-US",
    sourceChoice: "file",
    sourceType: "document",
    speechPolicyProfile: "Education",
    voiceStrategy: "default",
  },
  {
    description: "Full-content reading that keeps more alternates, captions, and structural cues.",
    id: "accessibility-full-content",
    intentId: "document",
    label: "Accessibility full-content reading",
    language: "en-US",
    sourceChoice: "file",
    sourceType: "document",
    speechPolicyProfile: "Accessibility",
    voiceStrategy: "default",
  },
  {
    description: "Prose-first workplace reading with summaries for complex structures.",
    id: "enterprise-summary",
    intentId: "technicalReview",
    label: "Enterprise summary/prose-first",
    language: "en-US",
    sourceChoice: "pastedText",
    sourceType: "draft",
    speechPolicyProfile: "Enterprise",
    voiceStrategy: "default",
  },
  {
    description: "Practice-oriented reading with pronunciation and language-aware voice defaults.",
    id: "language-learning",
    intentId: "document",
    label: "Language learning",
    language: "en-US",
    sourceChoice: "pastedText",
    sourceType: "draft",
    speechPolicyProfile: "LanguageLearning",
    voiceStrategy: "language",
  },
] as const;

export function intakeTemplateById(id: string | null | undefined): IntakeProjectTemplate {
  return (
    INTAKE_PROJECT_TEMPLATES.find((template) => template.id === id) ?? INTAKE_PROJECT_TEMPLATES[0]
  );
}

export function defaultTemplateForIntent(intentId: IntakeIntentId): IntakeProjectTemplate {
  return (
    INTAKE_PROJECT_TEMPLATES.find((template) => template.intentId === intentId) ??
    INTAKE_PROJECT_TEMPLATES[0]
  );
}
