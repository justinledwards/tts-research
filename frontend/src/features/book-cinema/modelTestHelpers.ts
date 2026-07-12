import type { HighlightCue } from "../../highlightMap";
import type { BookSource, VoiceJob } from "../../types";
import type { HighlightMapV2, HighlightMapV2Entry } from "../readalong";

export function makeBookSource(text: string): BookSource {
  const words = text.split(/\s+/).filter(Boolean);
  let offset = 0;
  return {
    id: "book-1",
    projectId: "default",
    status: "ready",
    kind: "epub",
    sourceFile: "demo.epub",
    sourceBytes: 128,
    title: "Demo Book",
    text,
    wordCount: words.length,
    pageCount: 0,
    chapterCount: 1,
    chapters: [{ index: 1, title: "Chapter", text, wordCount: words.length }],
    wordSpans: words.map((word, index) => {
      const startOffset = offset;
      offset += word.length + 1;
      return {
        index,
        text: word,
        chapter: 1,
        startOffset,
        endOffset: startOffset + word.length,
      };
    }),
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  };
}

export function indexedSpans(
  text: string,
  indexBase: number,
): NonNullable<BookSource["wordSpans"]> {
  return (makeBookSource(text).wordSpans ?? []).map((span, offset) => ({
    ...span,
    index: indexBase + offset,
  }));
}

export function highlightCue({
  activeWordIndex,
  phraseWordEnd,
  phraseWordStart,
  tokenIndex,
  tokenText,
}: Readonly<{
  activeWordIndex: number;
  phraseWordEnd?: number;
  phraseWordStart?: number;
  tokenIndex?: number;
  tokenText: string;
}>): HighlightCue {
  return {
    activeWordIndex,
    mode: "word",
    phraseWordEnd,
    phraseWordStart,
    readingPosition: {
      activeWordIndex,
      bookSourceId: "book-1",
      scopeKey: "book",
      textQuote: tokenText,
    },
    token: {
      confidence: 1,
      endMs: 1000,
      fragmentIndex: 0,
      index: tokenIndex ?? activeWordIndex,
      mode: "word",
      readingPosition: {
        activeWordIndex,
        bookSourceId: "book-1",
        scopeKey: "book",
        textQuote: tokenText,
      },
      segmentIndex: 0,
      startMs: 0,
      text: tokenText,
    },
    tokenIndex: tokenIndex ?? activeWordIndex,
  };
}

export function highlightMapV2(entries: HighlightMapV2Entry[]): HighlightMapV2 {
  return {
    contentIrVersion: "content-ir.v1",
    durationMs: 3000,
    entries,
    generatedAt: "2026-05-27T00:00:00.000Z",
    generatedAudioId: "job-1",
    schemaVersion: "highlight-map.v2",
    scopeKey: "book",
    sourceId: "book-1",
    speechPlanId: "job-1",
    summary: {
      blockCount: 0,
      confidence: 1,
      degraded: false,
      driftBudgetMs: 150,
      entryCount: entries.length,
      fallbackMode: "none",
      phraseCount: entries.filter((entry) => entry.level === "phrase").length,
      primaryLevel: "word",
      sentenceCount: 0,
      status: "ready",
      timingSources: ["provider-word"],
      wordCount: entries.filter((entry) => entry.level === "word").length,
    },
    timingLevels: ["phrase", "word"],
  };
}

export function v2Entry(overrides: Partial<HighlightMapV2Entry>): HighlightMapV2Entry {
  const spokenText = overrides.spokenText ?? "word";
  return {
    alignedEndMs: null,
    alignedStartMs: null,
    alignmentWarnings: [],
    audioEndMs: 1000,
    audioStartMs: 0,
    confidence: 1,
    contentIrVersion: "content-ir.v1",
    driftBudgetMs: 150,
    fallbackMode: "none",
    fragmentIndex: 0,
    generatedAudioId: "job-1",
    level: "word",
    nodeId: "node-1",
    normalizedText: spokenText,
    providerTimingEndMs: null,
    providerTimingStartMs: null,
    rawText: spokenText,
    scopeKey: "book",
    sentenceIndex: null,
    sourceId: "book-1",
    sourceLocator: {
      html: { fragment: "chapter-1", href: "", textQuote: spokenText },
      type: "html",
    },
    speechPlanId: "job-1",
    spokenText,
    textQuote: spokenText,
    timingSource: "provider-word",
    tokenIndex: null,
    ...overrides,
  };
}

export function makePDFBookSource(): BookSource {
  const pages = [
    { index: 1, label: "Page 1", text: "Page one text", wordCount: 3 },
    { index: 2, label: "Page 2", text: "Page two text", wordCount: 3 },
    { index: 3, label: "Page 3", text: "Page three text", wordCount: 3 },
  ];
  const text = pages.map((page) => page.text).join("\n\n");
  let offset = 0;
  const wordSpans = pages.flatMap((page) =>
    page.text.split(/\s+/).map((word, localIndex) => {
      const startOffset = offset;
      offset += word.length + 1;
      return {
        index: (page.index - 1) * 3 + localIndex,
        text: word,
        pageIndex: page.index,
        startOffset,
        endOffset: startOffset + word.length,
      };
    }),
  );
  return {
    id: "pdf-1",
    projectId: "default",
    status: "ready",
    kind: "pdf",
    sourceFile: "demo.pdf",
    sourceBytes: 128,
    title: "Demo PDF",
    text,
    wordCount: wordSpans.length,
    pageCount: pages.length,
    chapterCount: 0,
    pages,
    wordSpans,
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
  };
}

export function makeVoiceJob(inputText: string, durationMs: number): VoiceJob {
  return {
    id: "job-1",
    projectId: "default",
    status: "completed",
    stages: { optimization: "done", synthesis: "done", checker: "done" },
    inputText,
    optimizedText: inputText,
    optimizer: "test",
    audioUrl: "/audio.wav",
    contentType: "audio/wav",
    durationMs,
    provider: "mock",
    voice: "default",
    retries: {
      maxRetries: 1,
      attempts: 1,
      segmentAttempts: 1,
      currentSegment: 1,
      totalSegments: 1,
    },
    voiceCheck: {
      complete: true,
      transcript: inputText,
      needsResume: false,
      reason: "ok",
      provider: "disabled",
      similarity: 1,
    },
    progress: { message: "done", detail: "", activeStage: "completed" },
    createdAt: "2026-05-15T00:00:00Z",
    updatedAt: "2026-05-15T00:00:00Z",
    completedAt: "2026-05-15T00:00:00Z",
  };
}
