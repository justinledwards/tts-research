import { demoVoiceLabel } from "./demoVoices";

export type DemoProjectKind = "book" | "website" | "document" | "teleprompt" | "voiceComparison";

export interface DemoProject {
  id: string;
  title: string;
  kind: DemoProjectKind;
  surfaceLabel: string;
  description: string;
  sourceLabel: string;
  voiceId: string;
  policyProfile: string;
  sampleText: string;
  scopeHint: string;
}

export const demoProjects: readonly DemoProject[] = [
  {
    description: "A compact chapter-style source for Review, Preview, and Cinema playback.",
    id: "short-book",
    kind: "book",
    policyProfile: "narration",
    sampleText:
      "Chapter one. The studio wakes with a clean source, a known voice, and one small goal: turn readable text into audio that can be reviewed, previewed, and played back without leaving the browser.\n\nThe narrator checks pacing, watches the highlighted phrase move through the passage, and opens Cinema only after the source is ready.",
    scopeHint: "Whole sample chapter",
    sourceLabel: "Short book fixture",
    surfaceLabel: "Book",
    title: "Short Book Walkthrough",
    voiceId: "default",
  },
  {
    description: "A web article shape with headline, summary, and quote-like passages.",
    id: "website-article",
    kind: "website",
    policyProfile: "news",
    sampleText:
      "A local-first speech studio can be evaluated without a cloud account. In the demo flow, the website source has already been extracted, cleaned, and prepared for narration.\n\nThe reviewer checks headings, skips navigation clutter, and previews only the paragraphs that should become spoken audio.",
    scopeHint: "Prepared article paragraphs",
    sourceLabel: "Website article fixture",
    surfaceLabel: "Website",
    title: "Website Article",
    voiceId: "default",
  },
  {
    description: "A technical document sample with terminology and structured review needs.",
    id: "technical-document",
    kind: "document",
    policyProfile: "technical",
    sampleText:
      "Release note. The renderer now reports degraded states, lazy panel loading, and transport latency as first-class local diagnostics.\n\nOperators should hear version numbers, file names, and acronyms clearly. Review is where pronunciation and structure are checked before final audio is created.",
    scopeHint: "Selected technical sections",
    sourceLabel: "DOCX/PDF technical fixture",
    surfaceLabel: "Document",
    title: "Technical Document",
    voiceId: "default",
  },
  {
    description: "Presenter-oriented cues for keyboard and mirrored Teleprompt testing.",
    id: "teleprompt-cues",
    kind: "teleprompt",
    policyProfile: "narration",
    sampleText:
      "Cue one. Welcome the contributor and confirm that mock mode is running.\n\nCue two. Move through Review, Preview, and Teleprompt with keyboard controls.\n\nCue three. Create audio only when the sample should be saved into the local project.",
    scopeHint: "Three presenter cues",
    sourceLabel: "Teleprompt cue set",
    surfaceLabel: "Teleprompt",
    title: "Teleprompt Cue Set",
    voiceId: "default",
  },
  {
    description: "A short script for previewing alternate voices before committing to a run.",
    id: "voice-comparison",
    kind: "voiceComparison",
    policyProfile: "conversational",
    sampleText:
      "Compare this line in two voices. The best preview is not the loudest one; it is the one that makes the listener trust the source and understand the next action.",
    scopeHint: "Preview sample line",
    sourceLabel: "Voice preview fixture",
    surfaceLabel: "Preview",
    title: "Voice Comparison",
    voiceId: "demo-bright",
  },
];

export function demoProjectById(id: string): DemoProject | null {
  return demoProjects.find((project) => project.id === id) ?? null;
}

export function demoProjectSummary(project: DemoProject): string {
  return `${project.surfaceLabel} · ${project.scopeHint} · ${demoVoiceLabel(project.voiceId)}`;
}
