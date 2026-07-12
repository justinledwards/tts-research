import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { BookSourceWordSpan, NarrationBlock, NarrationBlockKind } from "../../types";
import { HighlightRenderer } from "../readalong";
import type { BookPage } from "./model";
import { bookPageStructuredBlocks, displayGapBetweenBookSpans } from "./pageStructure";

describe("book page structure", () => {
  it("repairs display gaps for fused PDF words without breaking punctuation", () => {
    expect(displayGapBetweenBookSpans("", "by", "Nagarajan")).toBe(" ");
    expect(displayGapBetweenBookSpans("", "uses", "exact")).toBe(" ");
    expect(displayGapBetweenBookSpans("a", "broader", "MOESDIF")).toBe(" ");
    expect(displayGapBetweenBookSpans("s", "also", "need")).toBe(" ");
    expect(displayGapBetweenBookSpans("n", "need", "retries")).toBe(" ");
    expect(displayGapBetweenBookSpans("i", "conflict", "and")).toBe(" ");
    expect(displayGapBetweenBookSpans(" o", "family", "Real")).toBe(" ");
    expect(displayGapBetweenBookSpans(",", "small", "fast")).toBe(", ");
    expect(displayGapBetweenBookSpans("-", "write", "through")).toBe("-");
    expect(displayGapBetweenBookSpans("  \n ", "Cache", "coherence")).toBe(" ");
  });

  it("segments a page into source blocks and keeps display punctuation", () => {
    const text =
      "Cache and Cache Coherency\n\nExecutive summary\n\nA cache is small, fast storage.";
    const spans = spansFromText(text);
    const page = pageFromSpans(spans);
    const blocks = [
      block("title", "heading", text, "Cache and Cache Coherency"),
      block("summary", "subheading", text, "Executive summary"),
      block("body", "body", text, "A cache is small, fast storage."),
    ];

    const structured = bookPageStructuredBlocks({
      blocks,
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });

    expect(structured.map((item) => item.kind)).toEqual(["heading", "subheading", "body"]);
    expect(tokensText(structured[0])).toBe("Cache and Cache Coherency");
    expect(tokensText(structured[2])).toContain("small, fast storage.");
  });

  it("uses source word spans when raw PDF offsets introduce intra-word whitespace", () => {
    const text = "Goodman's earl y wor k framed c aching, and coher ence explicitly.";
    const spans: BookSourceWordSpan[] = [
      manualSpan(text, "Goodman's", "Goodman's", 0),
      manualSpan(text, "earl y", "early", 1),
      manualSpan(text, "wor k", "work", 2),
      manualSpan(text, "framed", "framed", 3),
      manualSpan(text, "c aching,", "caching", 4),
      manualSpan(text, "and", "and", 5),
      manualSpan(text, "coher ence", "coherence", 6),
      manualSpan(text, "explicitly.", "explicitly", 7),
    ];
    const page = pageFromSpans(spans);

    const structured = bookPageStructuredBlocks({
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });

    expect(tokensText(structured[0])).toBe(
      "Goodman's early work framed caching, and coherence explicitly.",
    );
  });

  it("rejects raw alphabetic gap artifacts while preserving source word anchors", () => {
    const text =
      "broader aMOESDIF family oReal protocols also sneed nretries gacknowledgements iand source.";
    const spans: BookSourceWordSpan[] = [
      manualSpan(text, "broader", "broader", 0),
      manualSpan(text, "MOESDIF", "MOESDIF", 1),
      manualSpan(text, "family", "family", 2),
      manualSpan(text, "Real", "Real", 3),
      manualSpan(text, "protocols", "protocols", 4),
      manualSpan(text, "also", "also", 5),
      manualSpan(text, "need", "need", 6),
      manualSpan(text, "retries", "retries", 7),
      manualSpan(text, "acknowledgements", "acknowledgements", 8),
      manualSpan(text, "and", "and", 9),
      manualSpan(text, "source.", "source", 10),
    ];
    const page = pageFromSpans(spans);

    const structured = bookPageStructuredBlocks({
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });

    const renderedText = tokensText(structured[0]);
    expect(renderedText).toBe(
      "broader MOESDIF family Real protocols also need retries acknowledgements and source.",
    );
    expect(structured[0].tokens.map((token) => token.wordIndex)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(structured[0].tokens[1].sourceWordId).toBe("book-1:book:word:1");
  });

  it("matches relative scope blocks against absolute source spans", () => {
    const fullText = "Preface words.\n\nChapter Title\n\nBody text, here.";
    const scopedText = "Chapter Title\n\nBody text, here.";
    const chapterStart = fullText.indexOf(scopedText);
    const spans = spansFromText(fullText).filter((span) => span.startOffset >= chapterStart);
    const page = pageFromSpans(spans);
    const blocks = [
      relativeBlock("chapter-title", "heading", scopedText, "Chapter Title"),
      relativeBlock("chapter-body", "body", scopedText, "Body text, here."),
    ];

    const structured = bookPageStructuredBlocks({
      blocks,
      page,
      scopeKey: "book",
      scopedText,
      sourceId: "book-1",
    });

    expect(structured.map((item) => item.kind)).toEqual(["heading", "body"]);
    expect(tokensText(structured[1])).toBe("Body text, here.");
  });

  it("falls back to body blocks when no source blocks are available", () => {
    const text = "Flat extracted text still keeps commas, periods, and spacing.";
    const page = pageFromSpans(spansFromText(text));

    const structured = bookPageStructuredBlocks({
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });

    expect(structured).toHaveLength(1);
    expect(structured[0]).toMatchObject({ isFallback: true, kind: "body" });
    expect(tokensText(structured[0])).toBe(text);
  });

  it("splits the legacy flat first page intro into display-only hierarchy", () => {
    const text =
      "Cache and Cache Coherency Executive summary A cache is a small, fast storage structure.";
    const page = pageFromSpans(spansFromText(text));

    const structured = bookPageStructuredBlocks({
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });

    expect(structured.map((item) => item.kind)).toEqual(["heading", "subheading", "body"]);
    expect(structured.every((item) => item.isFallback)).toBe(true);
    expect(tokensText(structured[0])).toBe("Cache and Cache Coherency");
    expect(tokensText(structured[1])).toBe("Executive summary");
    expect(tokensText(structured[2])).toBe("A cache is a small, fast storage structure.");
  });

  it("renders exactly one active source word across structured page blocks", () => {
    const text = "Title\n\nFirst body word. Second body word.";
    const spans = spansFromText(text).map((span, offset) => ({ ...span, index: offset + 20 }));
    const page = pageFromSpans(spans);
    const structured = bookPageStructuredBlocks({
      blocks: [
        block("title", "heading", text, "Title"),
        block("body", "body", text, "First body word. Second body word."),
      ],
      page,
      scopeKey: "book",
      scopedText: text,
      sourceId: "book-1",
    });
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        structured.map((item) =>
          createElement(HighlightRenderer, {
            activeWordIndex: 23,
            key: item.id,
            mode: "word",
            surface: "book",
            tokens: item.tokens,
          }),
        ),
      ),
    );

    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup).toContain('data-readalong-word-index="23"');
    expect(markup).toContain('data-source-word-id="book-1:book:word:23"');
    expect(markup).not.toContain('data-readalong-word-index="22" aria-current="true"');
  });
});

function tokensText(block: { tokens: readonly { text: string; trailingText?: string }[] }): string {
  return block.tokens
    .map((token) => `${token.text}${token.trailingText ?? ""}`)
    .join("")
    .trim();
}

function pageFromSpans(spans: BookSourceWordSpan[]): BookPage {
  if (spans.length === 0) {
    throw new Error("test page needs at least one word span");
  }
  const first = spans[0];
  const last = lastSpan(spans);
  return {
    endWordIndex: last.index,
    index: 0,
    spans,
    startWordIndex: first.index,
  };
}

function lastSpan(spans: BookSourceWordSpan[]): BookSourceWordSpan {
  const last = spans.at(-1);
  if (!last) {
    throw new Error("test page needs at least one word span");
  }
  return last;
}

function block(
  id: string,
  kind: NarrationBlockKind,
  sourceText: string,
  blockText: string,
): NarrationBlock {
  const startOffset = sourceText.indexOf(blockText);
  return narrationBlock({
    endOffset: startOffset + blockText.length,
    id,
    kind,
    startOffset,
    text: blockText,
  });
}

function manualSpan(
  sourceText: string,
  rawText: string,
  spanText: string,
  index: number,
): BookSourceWordSpan {
  const startOffset = sourceText.indexOf(rawText);
  if (startOffset === -1) {
    throw new Error(`missing test text: ${rawText}`);
  }
  return {
    endOffset: startOffset + rawText.length,
    index,
    startOffset,
    text: spanText,
  };
}

function relativeBlock(
  id: string,
  kind: NarrationBlockKind,
  scopedText: string,
  blockText: string,
): NarrationBlock {
  return block(id, kind, scopedText, blockText);
}

function narrationBlock(
  overrides: Pick<NarrationBlock, "endOffset" | "id" | "kind" | "startOffset" | "text">,
): NarrationBlock {
  return {
    confidence: 1,
    endOffset: overrides.endOffset,
    id: overrides.id,
    index: 0,
    kind: overrides.kind,
    speakMode: "speak",
    speechPolicy: {
      explanation: "",
      mode: "speak",
      profile: "Default",
    },
    spokenText: overrides.text,
    startOffset: overrides.startOffset,
    text: overrides.text,
  };
}

function spansFromText(text: string): BookSourceWordSpan[] {
  return [...text.matchAll(/\S+/g)].map((match, index) => {
    const raw = match[0];
    const startOffset = match.index;
    return {
      endOffset: startOffset + raw.length,
      index,
      startOffset,
      text: trimEdgePunctuation(raw),
    };
  });
}

function trimEdgePunctuation(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && !isAsciiLetterOrDigit(value.codePointAt(start) ?? 0)) {
    start += 1;
  }
  while (end > start && !isAsciiLetterOrDigit(value.codePointAt(end - 1) ?? 0)) {
    end -= 1;
  }
  return value.slice(start, end);
}

function isAsciiLetterOrDigit(code: number): boolean {
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}
