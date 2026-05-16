import { describe, expect, it } from "vitest";
import {
  bookScopeKey,
  bookScopeOptions,
  bookScopeText,
  bookSourceName,
  BOOK_SOURCE_ACCEPT,
  isSupportedBookSourceBatch,
  isSupportedBookSource,
  paginateBookSpans,
  resolveBookActiveWordIndex,
  resolveDisplayedBookActiveWordIndex,
  resolveDefaultBookScope,
  visibleBookSpans,
} from "./BookCinemaPanel";
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

  it("uses saved logical book fragment when playback has not resolved a cursor yet", () => {
    expect(
      resolveDisplayedBookActiveWordIndex(-1, {
        targetId: "book:book-1:chapter:1",
        projectId: "default",
        bookSourceId: "book-1",
        currentTimeSec: 2,
        progress: 0.5,
        activeWordIndex: 12,
        finished: false,
        hidden: false,
        createdAt: "2026-05-15T00:00:00Z",
        updatedAt: "2026-05-15T00:00:00Z",
      }),
    ).toBe(12);
    expect(resolveDisplayedBookActiveWordIndex(4, null)).toBe(4);
  });

  it("defaults EPUB narration to the first chapter", () => {
    const book = makeBookSource("one two three four");
    const scope = resolveDefaultBookScope(book);

    expect(bookScopeKey(scope)).toBe("chapter:1");
    expect(bookScopeText(book, scope)).toBe("one two three four");
  });

  it("prefers structured default sections over raw chapter order", () => {
    const book = {
      ...makeBookSource("copyright words one two"),
      defaultSectionId: "body-2",
      sections: [
        {
          id: "front-1",
          index: 0,
          title: "Copyright",
          role: "frontmatter" as const,
          isNarratable: false,
          kind: "chapter",
          chapterIndex: 1,
          wordCount: 4,
        },
        {
          id: "body-2",
          index: 1,
          title: "Chapter 1",
          role: "body" as const,
          isNarratable: true,
          kind: "chapter",
          chapterIndex: 2,
          wordCount: 5,
        },
      ],
      chapters: [
        { index: 1, title: "Copyright", text: "copyright words one two", wordCount: 4 },
        { index: 2, title: "Chapter 1", text: "chapter words one two three", wordCount: 5 },
      ],
    };

    expect(bookScopeKey(resolveDefaultBookScope(book))).toBe("chapter:2");
    expect(bookScopeOptions(book).map((option) => option.label)).toEqual([
      "Copyright",
      "Chapter 1",
    ]);
  });

  it("creates two-page PDF range options", () => {
    const book = makePDFBookSource();
    const options = bookScopeOptions(book);

    expect(options.map((option) => option.key)).toEqual(["pages:1-2", "pages:3-3"]);
    expect(bookScopeText(book, options[0]?.scope ?? { type: "book" })).toContain("Page one");
    expect(bookScopeText(book, options[0]?.scope ?? { type: "book" })).toContain("Page two");
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

  it("paginates book spreads with non-overlapping left and right pages", () => {
    const spans =
      makeBookSource(Array.from({ length: 90 }, (_, index) => `w${String(index)}`).join(" "))
        .wordSpans ?? [];

    const pagination = paginateBookSpans(spans, -1, { pagesPerSpread: 2, wordsPerPage: 20 });

    expect(pagination.totalPages).toBe(5);
    expect(pagination.pages).toHaveLength(2);
    expect(pagination.pages[0]?.spans[0]?.index).toBe(0);
    expect(pagination.pages[0]?.spans.at(-1)?.index).toBe(19);
    expect(pagination.pages[1]?.spans[0]?.index).toBe(20);
    expect(pagination.pages[1]?.spans.at(-1)?.index).toBe(39);
  });

  it("selects the spread containing the active word", () => {
    const spans =
      makeBookSource(Array.from({ length: 110 }, (_, index) => `w${String(index)}`).join(" "))
        .wordSpans ?? [];

    const pagination = paginateBookSpans(spans, 84, { pagesPerSpread: 2, wordsPerPage: 20 });

    expect(pagination.activePageIndex).toBe(4);
    expect(pagination.spreadIndex).toBe(2);
    expect(pagination.pages[0]?.spans[0]?.index).toBe(80);
    expect(pagination.pages[0]?.spans.at(-1)?.index).toBe(99);
    expect(pagination.pages[1]?.spans[0]?.index).toBe(100);
  });

  it("supports single-page pagination for narrow cinema viewports", () => {
    const spans =
      makeBookSource(Array.from({ length: 75 }, (_, index) => `w${String(index)}`).join(" "))
        .wordSpans ?? [];

    const pagination = paginateBookSpans(spans, 47, { pagesPerSpread: 1, wordsPerPage: 18 });

    expect(pagination.pagesPerSpread).toBe(1);
    expect(pagination.pages).toHaveLength(1);
    expect(pagination.pages[0]?.spans[0]?.index).toBe(36);
    expect(pagination.pages[0]?.spans.at(-1)?.index).toBe(53);
  });

  it("falls back to source filename when metadata has no title", () => {
    expect(bookSourceName({ ...makeBookSource("hello"), title: "" })).toBe("demo.epub");
  });

  it("accepts EPUB, PDF, DOCX, HTML, images, and zipped HTML packages", () => {
    expect(BOOK_SOURCE_ACCEPT).toContain(".docx");
    expect(BOOK_SOURCE_ACCEPT).toContain(".html");
    expect(BOOK_SOURCE_ACCEPT).toContain(".zip");
    expect(BOOK_SOURCE_ACCEPT).toContain(".png");
    expect(isSupportedBookSource(new File([""], "fixture.docx"))).toBe(true);
    expect(isSupportedBookSource(new File([""], "article.html", { type: "text/html" }))).toBe(true);
    expect(isSupportedBookSource(new File([""], "page.png", { type: "image/png" }))).toBe(true);
    expect(isSupportedBookSource(new File([""], "package.zip", { type: "application/zip" }))).toBe(
      true,
    );
    expect(
      isSupportedBookSourceBatch([
        new File([""], "page-001.png", { type: "image/png" }),
        new File([""], "page-002.jpg", { type: "image/jpeg" }),
      ]),
    ).toBe(true);
    expect(
      isSupportedBookSourceBatch([
        new File([""], "page-001.png", { type: "image/png" }),
        new File([""], "book.pdf", { type: "application/pdf" }),
      ]),
    ).toBe(false);
    expect(isSupportedBookSource(new File([""], "notes.txt"))).toBe(false);
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

function makePDFBookSource(): BookSource {
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
