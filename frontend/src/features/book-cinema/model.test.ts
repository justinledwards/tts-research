import { describe, expect, it } from "vitest";
import {
  BOOK_SOURCE_ACCEPT,
  bookCinemaKeyboardCommandForKey,
  bookCinemaLiveAnnouncement,
  bookCinemaPolicyNotes,
  bookScopeKey,
  bookScopeOptions,
  bookScopeText,
  bookSourceName,
  estimateBookWordsPerPage,
  isSupportedBookSource,
  isSupportedBookSourceBatch,
  nextBookCinemaPlaybackRate,
  normalizeBookScopeForBook,
  normalizeReaderAccessibilitySettings,
  paginateBookSpans,
  resolveBookActiveWordIndex,
  resolveBookTimingCueWordIndexes,
  resolveBookTimingMapV2WordIndexes,
  resolveDefaultBookScope,
  resolveDisplayedBookActiveWordIndex,
  shouldIgnoreBookCinemaKeyboardTarget,
  visibleBookSpans,
} from "./model";
import {
  highlightCue,
  highlightMapV2,
  indexedSpans,
  makeBookSource,
  makePDFBookSource,
  makeVoiceJob,
  v2Entry,
} from "./modelTestHelpers";

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

  it("normalizes narration-token timing cues to source word span indexes", () => {
    const spans = indexedSpans("one two three four five", 40);
    const cue = highlightCue({
      activeWordIndex: 2,
      phraseWordEnd: 3,
      phraseWordStart: 1,
      tokenIndex: 2,
      tokenText: "three",
    });

    expect(
      resolveBookTimingCueWordIndexes({
        cue,
        fallbackActiveWordIndex: -1,
        scopedSpans: spans,
      }),
    ).toEqual({
      activeWordIndex: 42,
      phraseWordEnd: 43,
      phraseWordStart: 41,
    });
  });

  it("keeps legacy timing cues that already point at source word span indexes", () => {
    const spans = indexedSpans("one two three four five", 40);
    const cue = highlightCue({
      activeWordIndex: 42,
      phraseWordEnd: 43,
      phraseWordStart: 41,
      tokenText: "three",
    });

    expect(
      resolveBookTimingCueWordIndexes({
        cue,
        fallbackActiveWordIndex: -1,
        scopedSpans: spans,
      }),
    ).toEqual({
      activeWordIndex: 42,
      phraseWordEnd: 43,
      phraseWordStart: 41,
    });
  });

  it("resolves raw v2 timing entries to source word span indexes across blocks", () => {
    const spans = indexedSpans("Heading Intro Alpha beta gamma delta", 80);
    const map = highlightMapV2([
      v2Entry({
        audioEndMs: 800,
        audioStartMs: 0,
        fragmentIndex: 0,
        level: "phrase",
        spokenText: "Heading Intro",
      }),
      v2Entry({
        audioEndMs: 2800,
        audioStartMs: 800,
        fragmentIndex: 1,
        level: "phrase",
        spokenText: "Alpha beta gamma delta",
      }),
      v2Entry({
        audioEndMs: 1800,
        audioStartMs: 1400,
        fragmentIndex: 1,
        level: "word",
        readingPosition: { activeWordIndex: 83, textQuote: "beta" },
        spokenText: "beta",
        tokenIndex: 3,
      }),
      v2Entry({
        audioEndMs: 2200,
        audioStartMs: 1800,
        fragmentIndex: 1,
        level: "word",
        readingPosition: { activeWordIndex: 84, textQuote: "gamma" },
        spokenText: "gamma",
        tokenIndex: 4,
      }),
    ]);

    expect(
      resolveBookTimingMapV2WordIndexes({
        map,
        playbackCursorSec: 1.9,
        scopedSpans: spans,
      }),
    ).toEqual({
      activeWordIndex: 84,
      phraseWordEnd: 84,
      phraseWordStart: 83,
    });
  });

  it("trusts v2 source identity across blocks even when spoken text is transformed", () => {
    const spans = indexedSpans("Heading Intro Alpha beta gamma delta", 80);
    const map = highlightMapV2([
      v2Entry({
        audioEndMs: 800,
        audioStartMs: 0,
        fragmentIndex: 0,
        level: "phrase",
        spokenText: "Heading Intro",
      }),
      v2Entry({
        audioEndMs: 2800,
        audioStartMs: 800,
        fragmentIndex: 1,
        level: "phrase",
        spokenText: "Alpha beta gamma delta",
      }),
      v2Entry({
        audioEndMs: 1800,
        audioStartMs: 1400,
        fragmentIndex: 1,
        level: "word",
        readingPosition: {
          activeWordIndex: 83,
          bookSourceId: "book-1",
          scopeKey: "book",
          textQuote: "beta",
        },
        sourceWordId: "book-1:book:word:83",
        sourceWordIndex: 83,
        spokenText: "bee ta",
        tokenIndex: 3,
      }),
      v2Entry({
        audioEndMs: 2200,
        audioStartMs: 1800,
        fragmentIndex: 1,
        level: "word",
        readingPosition: {
          activeWordIndex: 84,
          bookSourceId: "book-1",
          scopeKey: "book",
          textQuote: "gamma",
        },
        sourceWordId: "book-1:book:word:84",
        sourceWordIndex: 84,
        spokenText: "transformed gamma",
        tokenIndex: 4,
      }),
    ]);

    expect(
      resolveBookTimingMapV2WordIndexes({
        map,
        playbackCursorSec: 1.9,
        scopedSpans: spans,
      }),
    ).toEqual({
      activeWordIndex: 84,
      phraseWordEnd: 84,
      phraseWordStart: 83,
    });
  });

  it("maps v2 token indexes as scoped narration ordinals before accepting source indexes", () => {
    const spans = indexedSpans("one two three four", 40);
    const ordinalMap = highlightMapV2([
      v2Entry({
        audioEndMs: 1000,
        audioStartMs: 0,
        level: "word",
        spokenText: "three",
        tokenIndex: 2,
      }),
    ]);
    const sourceIndexMap = highlightMapV2([
      v2Entry({
        audioEndMs: 1000,
        audioStartMs: 0,
        level: "word",
        spokenText: "three",
        tokenIndex: 42,
      }),
    ]);

    expect(
      resolveBookTimingMapV2WordIndexes({
        map: ordinalMap,
        playbackCursorSec: 0.5,
        scopedSpans: spans,
      })?.activeWordIndex,
    ).toBe(42);
    expect(
      resolveBookTimingMapV2WordIndexes({
        map: sourceIndexMap,
        playbackCursorSec: 0.5,
        scopedSpans: spans,
      })?.activeWordIndex,
    ).toBe(42);
  });

  it("maps keyboard-first playback shortcuts without depending on focus text", () => {
    expect(bookCinemaKeyboardCommandForKey(" ")).toBe("togglePlayback");
    expect(bookCinemaKeyboardCommandForKey("K")).toBe("togglePlayback");
    expect(bookCinemaKeyboardCommandForKey("ArrowLeft")).toBe("seekBackward");
    expect(bookCinemaKeyboardCommandForKey("j")).toBe("seekBackward");
    expect(bookCinemaKeyboardCommandForKey("ArrowRight")).toBe("seekForward");
    expect(bookCinemaKeyboardCommandForKey("l")).toBe("seekForward");
    expect(bookCinemaKeyboardCommandForKey("Home")).toBe("restart");
    expect(bookCinemaKeyboardCommandForKey("[")).toBe("speedDown");
    expect(bookCinemaKeyboardCommandForKey("]")).toBe("speedUp");
    expect(bookCinemaKeyboardCommandForKey("b")).toBe("bookmark");
    expect(bookCinemaKeyboardCommandForKey("Escape")).toBe("close");
    expect(bookCinemaKeyboardCommandForKey("x")).toBeNull();
  });

  it("ignores reader shortcuts in editable and control targets", () => {
    const hadHTMLElement = Object.hasOwn(globalThis, "HTMLElement");
    const originalHTMLElement = globalThis.HTMLElement;
    class FakeHTMLElement extends EventTarget {
      isContentEditable = false;
      tagName: string;

      constructor(tagName: string) {
        super();
        this.tagName = tagName;
      }

      closest(selector: string): FakeHTMLElement | null {
        return selector.includes("[data-book-cinema-ignore-shortcuts]") && this.tagName === "DIV"
          ? this
          : null;
      }
    }
    globalThis.HTMLElement = FakeHTMLElement as unknown as typeof HTMLElement;

    try {
      const input = new FakeHTMLElement("INPUT");
      const select = new FakeHTMLElement("SELECT");
      const editable = new FakeHTMLElement("P");
      editable.isContentEditable = true;
      const ignoredRegion = new FakeHTMLElement("DIV");
      const plainSpan = new FakeHTMLElement("SPAN");

      expect(shouldIgnoreBookCinemaKeyboardTarget(input)).toBe(true);
      expect(shouldIgnoreBookCinemaKeyboardTarget(select)).toBe(true);
      expect(shouldIgnoreBookCinemaKeyboardTarget(editable)).toBe(true);
      expect(shouldIgnoreBookCinemaKeyboardTarget(ignoredRegion)).toBe(true);
      expect(shouldIgnoreBookCinemaKeyboardTarget(plainSpan)).toBe(false);
    } finally {
      if (hadHTMLElement) {
        globalThis.HTMLElement = originalHTMLElement;
      } else {
        Reflect.deleteProperty(globalThis, "HTMLElement");
      }
    }
  });

  it("normalizes reader accessibility state and speed stepping", () => {
    expect(normalizeReaderAccessibilitySettings({ highContrast: true })).toEqual({
      highContrast: true,
      lineSpacing: "comfortable",
      measure: "comfortable",
      reducedMotion: false,
      textScale: "large",
    });
    expect(normalizeReaderAccessibilitySettings({ reducedMotion: true })).toEqual({
      highContrast: false,
      lineSpacing: "comfortable",
      measure: "comfortable",
      reducedMotion: true,
      textScale: "large",
    });
    expect(
      normalizeReaderAccessibilitySettings({
        lineSpacing: "spacious",
        measure: "narrow",
        textScale: "compact",
      }),
    ).toEqual({
      highContrast: false,
      lineSpacing: "spacious",
      measure: "narrow",
      reducedMotion: false,
      textScale: "compact",
    });
    expect(nextBookCinemaPlaybackRate(1, 1)).toBe(1.25);
    expect(nextBookCinemaPlaybackRate(1, -1)).toBe(0.8);
    expect(nextBookCinemaPlaybackRate(1.5, 1)).toBe(1.5);
  });

  it("builds polite reader announcements from current scope and fragment", () => {
    const book = makeBookSource("one two three four");
    expect(
      bookCinemaLiveAnnouncement({
        book,
        fragmentIndex: 2,
        scope: { type: "chapter", chapterIndex: 1, label: "Chapter" },
      }),
    ).toBe("Demo Book. Chapter. Fragment 3");
    expect(
      bookCinemaLiveAnnouncement({
        activeWordIndex: 4,
        book,
        scope: { type: "book", label: "Full book" },
      }),
    ).toBe("Demo Book. Full book. Word 5");
  });

  it("collects policy explanations for skipped, summarized, and structural blocks", () => {
    const notes = bookCinemaPolicyNotes({
      bookSourceId: "book-1",
      scope: { type: "book", label: "Full book" },
      text: "Table text",
      wordSpans: [],
      wordCount: 0,
      sourceStructureValid: true,
      blocks: [
        {
          id: "block-1",
          index: 0,
          kind: "table",
          speakMode: "summarize",
          label: "Table",
          text: "Name | Value",
          spokenText: "Table summary",
          startOffset: 0,
          endOffset: 12,
          speechPolicy: {
            profile: "TechnicalDocs",
            element: "table",
            elementMode: "rowLinear",
            mode: "summarize",
            explanation: "This table is summarised by the selected profile.",
          },
        },
      ],
      skippedItems: [
        {
          id: "skip-1",
          kind: "citation",
          text: "[1]",
          reason: "This citation is available on demand.",
        },
      ],
    });

    expect(notes.map((note) => [note.kind, note.mode, note.explanation])).toEqual([
      ["table", "summarize", "This table is summarised by the selected profile."],
      ["citation", "skip", "This citation is available on demand."],
    ]);
  });

  it("defaults EPUB narration to the full book", () => {
    const book = makeBookSource("one two three four");
    const scope = resolveDefaultBookScope(book);

    expect(bookScopeKey(scope)).toBe("book");
    expect(bookScopeText(book, scope)).toBe("one two three four");
  });

  it("keeps structured sections available while defaulting to the full book", () => {
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

    expect(bookScopeKey(resolveDefaultBookScope(book))).toBe("book");
    expect(bookScopeOptions(book).map((option) => option.label)).toEqual([
      "Full book",
      "Copyright",
      "Chapter 1",
    ]);
  });

  it("normalizes section-backed chapter scopes without falling back to the full book", () => {
    const book = {
      ...makeBookSource("chapter words one two three"),
      chapters: [],
      sections: [
        {
          id: "body-1",
          index: 0,
          title: "Chapter One",
          role: "body" as const,
          isNarratable: true,
          kind: "chapter",
          chapterIndex: 1,
          wordCount: 5,
        },
      ],
    };

    const scope = normalizeBookScopeForBook(book, {
      type: "chapter",
      chapterIndex: 1,
      label: "Chapter One",
    });

    expect(bookScopeKey(scope)).toBe("chapter:1");
    expect(scope.label).toBe("Chapter One");
  });

  it("defaults Markdown documents to full-document cinema while preserving sections", () => {
    const text = "# Report\n\n## Executive summary\n\nThe whole document should be visible.";
    const book = {
      ...makeBookSource(text),
      kind: "markdown" as const,
      sourceFile: "report.md",
      defaultSectionId: "section-1",
      sections: [
        {
          id: "section-1",
          index: 0,
          title: "Report",
          role: "body" as const,
          isNarratable: true,
          kind: "chapter",
          chapterIndex: 1,
          wordCount: 1,
        },
        {
          id: "section-2",
          index: 1,
          title: "Executive summary",
          role: "body" as const,
          isNarratable: true,
          kind: "chapter",
          chapterIndex: 2,
          wordCount: 6,
        },
      ],
    };

    expect(bookScopeKey(resolveDefaultBookScope(book))).toBe("book");
    expect(bookScopeText(book, resolveDefaultBookScope(book))).toContain("Executive summary");
    expect(bookScopeOptions(book).map((option) => option.label)).toEqual([
      "Full document",
      "Report",
      "Executive summary",
    ]);
  });

  it("creates two-page PDF range options", () => {
    const book = makePDFBookSource();
    const options = bookScopeOptions(book);

    expect(options.map((option) => option.key)).toEqual(["book", "pages:1-2", "pages:3-3"]);
    expect(bookScopeText(book, options[1]?.scope ?? { type: "book" })).toContain("Page one");
    expect(bookScopeText(book, options[1]?.scope ?? { type: "book" })).toContain("Page two");
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

  it("estimates measured reader page capacity above the old sparse cap", () => {
    const desktopCapacity = estimateBookWordsPerPage({
      lineSpacing: "compact",
      pagesPerSpread: 2,
      textScale: "compact",
      viewportHeight: 960,
      viewportWidth: 2048,
    });
    const mobileCapacity = estimateBookWordsPerPage({
      lineSpacing: "compact",
      pagesPerSpread: 1,
      textScale: "compact",
      viewportHeight: 720,
      viewportWidth: 390,
    });

    expect(desktopCapacity).toBeGreaterThan(128);
    expect(desktopCapacity).toBeGreaterThan(mobileCapacity);
    expect(desktopCapacity).toBeLessThanOrEqual(320);
  });

  it("falls back to source filename when metadata has no title", () => {
    expect(bookSourceName({ ...makeBookSource("hello"), title: "" })).toBe("demo.epub");
  });

  it("accepts EPUB, PDF, DOCX, Markdown, HTML, images, and zipped HTML packages", () => {
    expect(BOOK_SOURCE_ACCEPT).toContain(".docx");
    expect(BOOK_SOURCE_ACCEPT).toContain(".md");
    expect(BOOK_SOURCE_ACCEPT).toContain("text/markdown");
    expect(BOOK_SOURCE_ACCEPT).toContain(".html");
    expect(BOOK_SOURCE_ACCEPT).toContain(".zip");
    expect(BOOK_SOURCE_ACCEPT).toContain(".png");
    expect(isSupportedBookSource(new File([""], "fixture.docx"))).toBe(true);
    expect(isSupportedBookSource(new File([""], "notes.md", { type: "text/markdown" }))).toBe(true);
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
