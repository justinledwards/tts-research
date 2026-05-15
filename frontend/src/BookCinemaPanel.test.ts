import { describe, expect, it } from "vitest";
import { bookSourceName, resolveBookActiveWordIndex, visibleBookSpans } from "./BookCinemaPanel";
import type { BookSource, VoiceJob } from "./types";

describe("Book Cinema helpers", () => {
  it("maps playback progress onto book word spans without changing text color state", () => {
    const book = makeBookSource("one two three four");
    const job = makeVoiceJob(book.text ?? "", 4000);

    expect(resolveBookActiveWordIndex(book, job, 0)).toBe(-1);
    expect(resolveBookActiveWordIndex(book, job, 1.1)).toBe(1);
    expect(resolveBookActiveWordIndex(book, job, 3.9)).toBe(3);
  });

  it("does not highlight a book when the active job narrates different text", () => {
    const book = makeBookSource("one two three four");
    const job = makeVoiceJob("different text", 4000);

    expect(resolveBookActiveWordIndex(book, job, 2)).toBe(-1);
  });

  it("keeps the visible book span window close to the active word", () => {
    const spans = makeBookSource(
      Array.from({ length: 300 }, (_, index) => `w${String(index)}`).join(" "),
    ).wordSpans;

    const visible = visibleBookSpans(spans, 100);
    expect(visible).toHaveLength(220);
    expect(visible[0]?.index).toBe(12);
    expect(visible.at(-1)?.index).toBe(231);
  });

  it("falls back to source filename when metadata has no title", () => {
    expect(bookSourceName({ ...makeBookSource("hello"), title: "" })).toBe("demo.epub");
  });
});

function makeBookSource(text: string): BookSource {
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

function makeVoiceJob(inputText: string, durationMs: number): VoiceJob {
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
