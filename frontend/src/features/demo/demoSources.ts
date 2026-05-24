export type DemoSourceKind =
  | "education"
  | "technicalMarkdown"
  | "websiteArticle"
  | "epubChapter"
  | "telepromptScript"
  | "voiceComparison";

export interface DemoSource {
  readonly description: string;
  readonly fixtureLabel: string;
  readonly id: string;
  readonly kind: DemoSourceKind;
  readonly policyProfile: string;
  readonly sampleText: string;
  readonly scopeHint: string;
  readonly sourceLabel: string;
  readonly surfaceLabel: string;
  readonly title: string;
  readonly verificationGoals: readonly string[];
  readonly voiceId: string;
}

export const demoSources: readonly DemoSource[] = [
  {
    description: "A compact education passage for checking the whole narration loop.",
    fixtureLabel: "Local inline education fixture",
    id: "short-education-reading",
    kind: "education",
    policyProfile: "Education",
    sampleText:
      "Lesson opening. A good audio lesson gives the learner one idea at a time, then pauses long enough for the idea to settle.\n\nThe Studio review step keeps headings, citations, and emphasis visible before the mock voice creates a local listening draft.",
    scopeHint: "Whole lesson excerpt",
    sourceLabel: "Short education reading",
    surfaceLabel: "Intake",
    title: "Short Education Reading",
    verificationGoals: ["Review blocks", "Preview spoken form", "Create mock audio"],
    voiceId: "default",
  },
  {
    description: "A Markdown-shaped technical note with commands, acronyms, and review details.",
    fixtureLabel: "Local Markdown fixture",
    id: "technical-markdown-document",
    kind: "technicalMarkdown",
    policyProfile: "TechnicalDocs",
    sampleText:
      "# Local validation note\n\nRun `pnpm validate:local` before handing work back. The reader should preserve command names, file paths, and warning labels without turning them into noise.\n\n- Check Review for structure.\n- Check Preview for spoken form.\n- Use mock audio before opening Cinema.",
    scopeHint: "Technical Markdown sections",
    sourceLabel: "Technical Markdown document",
    surfaceLabel: "Review",
    title: "Technical Markdown Document",
    verificationGoals: ["Markdown structure", "Technical pronunciation", "Policy notes"],
    voiceId: "default",
  },
  {
    description: "A cleaned article body that makes page chrome and narration boundaries obvious.",
    fixtureLabel: "Local website article fixture",
    id: "website-article",
    kind: "websiteArticle",
    policyProfile: "Enterprise",
    sampleText:
      "Article headline. Local-first speech tools help teams review long-form material without sending private drafts to a hosted provider.\n\nThe extracted article body begins here. Navigation, newsletter prompts, and footer links are intentionally absent from the narration sample.",
    scopeHint: "Prepared article paragraphs",
    sourceLabel: "Website article",
    surfaceLabel: "Website Cinema",
    title: "Website Article",
    verificationGoals: ["Article body only", "Preview clean paragraphs", "Inspect source context"],
    voiceId: "default",
  },
  {
    description: "A chapter-style EPUB excerpt for long-form reader and resume expectations.",
    fixtureLabel: "Local EPUB chapter fixture",
    id: "epub-chapter",
    kind: "epubChapter",
    policyProfile: "Accessibility",
    sampleText:
      "Chapter one. The library window is quiet, and the narrator begins where the reader left off.\n\nA bookmark placed during playback should return to the same source, the same scope, and the same visible passage after reload.",
    scopeHint: "Single EPUB chapter",
    sourceLabel: "EPUB chapter",
    surfaceLabel: "Book Cinema",
    title: "EPUB Chapter",
    verificationGoals: ["Reader resume", "Bookmark handoff", "Cinema playback"],
    voiceId: "default",
  },
  {
    description: "Presenter cues for trying Teleprompt controls before recording real material.",
    fixtureLabel: "Local Teleprompt fixture",
    id: "teleprompt-script",
    kind: "telepromptScript",
    policyProfile: "Education",
    sampleText:
      "Cue one. Welcome the contributor and confirm that mock mode is running.\n\nCue two. Move through Review, Preview, and Teleprompt with keyboard controls.\n\nCue three. Create audio only when the sample should become local generated audio.",
    scopeHint: "Three presenter cues",
    sourceLabel: "Teleprompt script",
    surfaceLabel: "Teleprompt",
    title: "Teleprompt Script",
    verificationGoals: ["Cue navigation", "Return memory", "Presenter controls"],
    voiceId: "default",
  },
  {
    description: "A short line for comparing delivery choices before committing to a run.",
    fixtureLabel: "Local voice comparison fixture",
    id: "voice-comparison-sample",
    kind: "voiceComparison",
    policyProfile: "LanguageLearning",
    sampleText:
      "Compare this sentence in two preview choices. The better read is the one that makes the listener understand the source and trust the next action.",
    scopeHint: "Preview comparison line",
    sourceLabel: "Voice comparison sample",
    surfaceLabel: "Preview",
    title: "Voice Comparison Sample",
    verificationGoals: ["A/B preview", "Voice selection", "Mock provider fallback"],
    voiceId: "demo-bright",
  },
];

export function demoSourceById(id: string): DemoSource | null {
  return demoSources.find((source) => source.id === id) ?? null;
}
