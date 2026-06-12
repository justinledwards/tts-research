import { describe, expect, it } from "vitest";
import type { TemporarySourceSession } from "../../types";
import {
  temporarySessionPrefersBookCinema,
  temporarySessionToBookSource,
  temporarySessionToPreparedSource,
} from "./QuickListenPanel";
import { websiteExtractionQuality } from "../website-cinema";

describe("temporarySessionToPreparedSource", () => {
  it("adapts temporary webpages into Website Cinema sources with extraction metadata", () => {
    const source = temporarySessionToPreparedSource({
      artifacts: [],
      blockCount: 1,
      blocks: [
        {
          endOffset: 48,
          id: "block-1",
          index: 0,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "", mode: "speak", profile: "default" },
          spokenText: "Temporary webpage body for Website Cinema.",
          startOffset: 0,
          text: "Temporary webpage body for Website Cinema.",
        },
      ],
      createdAt: "2026-06-11T17:00:00Z",
      expiresAt: "2026-06-12T17:00:00Z",
      id: "temp-web-1",
      kind: "url",
      lastAccessedAt: "2026-06-11T17:00:00Z",
      metadata: {
        urlProvenance: {
          domain: "example.com",
          fetchedUrl: "https://example.com/article",
          requestedUrl: "https://example.com/article",
        },
        websiteExtractionQuality: {
          articleCandidateCount: 2,
          chosenContainer: "article",
          chromeTextRatio: 0.2,
          extractionConfidence: "high",
          headingDepth: 1,
          linkDensity: 0,
          narrationBlockCount: 1,
          readableTextRatio: 0.8,
          skippedBlockCount: 1,
        },
        websiteMetadata: {
          canonicalUrl: "https://example.com/article",
          siteName: "Example",
        },
      },
      promotionStatus: "notPromoted",
      sourceName: "https://example.com/article",
      sourceOwner: "temporary",
      sourceUrl: "https://example.com/article",
      status: "reviewable",
      temporarySourceId: "temp-web-1",
      text: "Temporary webpage body for Website Cinema.",
      title: "Temporary webpage",
      updatedAt: "2026-06-11T17:00:00Z",
      wordCount: 6,
    } satisfies TemporarySourceSession);

    expect(source.sourceOwner).toBe("temporary");
    expect(source.kind).toBe("url");
    expect(source.temporarySourceId).toBe("temp-web-1");
    expect(websiteExtractionQuality(source)?.extractionConfidence).toBe("high");
    expect(source.metadata?.urlProvenance).toMatchObject({
      domain: "example.com",
      requestedUrl: "https://example.com/article",
    });
  });

  it("adapts temporary PDFs into Book Cinema sources", () => {
    const source = temporaryBookSession();
    const book = temporarySessionToBookSource(source);

    expect(temporarySessionPrefersBookCinema(source)).toBe(true);
    expect(book.sourceOwner).toBe("temporary");
    expect(book.kind).toBe("pdf");
    expect(book.temporarySourceId).toBe("temp-book-1");
    expect(book.ingestion?.temporaryExpiresAt).toBe("2026-06-12T17:00:00Z");
    expect(book.wordSpans?.map((span) => span.text)).toEqual(["Temporary", "PDF", "body."]);
  });
});

function temporaryBookSession(): TemporarySourceSession {
  return {
    artifacts: [],
    createdAt: "2026-06-11T17:00:00Z",
    expiresAt: "2026-06-12T17:00:00Z",
    id: "temp-book-1",
    kind: "pdf",
    lastAccessedAt: "2026-06-11T17:00:00Z",
    promotionStatus: "notPromoted",
    sourceBytes: 120,
    sourceName: "brief.pdf",
    sourceOwner: "temporary",
    status: "reviewable",
    temporarySourceId: "temp-book-1",
    text: "Temporary PDF body.",
    title: "Temporary PDF",
    updatedAt: "2026-06-11T17:00:00Z",
    wordCount: 3,
  };
}
