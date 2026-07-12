import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TemporarySourceSession } from "../../types";
import { websiteExtractionQuality } from "../website-cinema";
import {
  QuickListenPanel,
  temporaryFileSupport,
  temporarySessionPrefersBookCinema,
  temporarySessionToBookSource,
  temporarySessionToPreparedSource,
} from "./QuickListenPanel";

describe("temporarySessionToPreparedSource", () => {
  it("exposes stable recovery action ids and disabled reasons for expired temporary sources", () => {
    const markup = renderToStaticMarkup(
      createElement(QuickListenPanel, {
        error: null,
        initialMode: "recent",
        isOpen: true,
        isSubmitting: false,
        recentSources: [temporaryBookSession({ status: "expired" })],
        onCleanup: () => Promise.resolve(),
        onClearExpired: () => Promise.resolve(),
        onClose: () => null,
        onCreateFromFile: () => Promise.resolve(),
        onCreateFromText: () => Promise.resolve(),
        onCreateFromUrl: () => Promise.resolve(),
        onDiscard: () => Promise.resolve(),
        onExtend: () => Promise.resolve(),
        onUseRecentSource: () => Promise.resolve(),
      }),
    );

    expect(markup).toContain('data-testid="quick-listen-temporary-source-temp-book-1"');
    expect(markup).toContain('data-testid="ui-action-quick-listen-temporary-open-temp-book-1"');
    expect(markup).toContain("col-span-2 sm:col-span-auto");
    expect(markup).toContain(
      "Temporary source expired after inactivity. Extend expiry before reopening it.",
    );
    expect(markup).toContain('data-testid="ui-action-quick-listen-temporary-discard-temp-book-1"');
    expect(markup).toContain(">Discard temporary source<");
  });

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
      scope: "temporary",
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
    expect(source.metadata?.temporarySourceUrl).toBe("https://example.com/article");
    expect(websiteExtractionQuality(source)?.extractionConfidence).toBe("high");
    expect(source.metadata?.urlProvenance).toMatchObject({
      domain: "example.com",
      requestedUrl: "https://example.com/article",
    });
  });

  it("offers a direct Website Cinema action for URL temporary sources", () => {
    const markup = renderToStaticMarkup(
      createElement(QuickListenPanel, {
        error: null,
        initialMode: "url",
        isOpen: true,
        isSubmitting: false,
        recentSources: [],
        onCleanup: () => Promise.resolve(),
        onClearExpired: () => Promise.resolve(),
        onClose: () => null,
        onCreateFromFile: () => Promise.resolve(),
        onCreateFromText: () => Promise.resolve(),
        onCreateFromUrl: () => Promise.resolve(),
        onDiscard: () => Promise.resolve(),
        onExtend: () => Promise.resolve(),
        onUseRecentSource: () => Promise.resolve(),
      }),
    );

    expect(markup).toContain('data-testid="ui-action-quick-listen-url-open-cinema"');
    expect(markup).toContain("Open Website Cinema");
    expect(markup).toContain("Source URL");
  });

  it("renders paste and file temporary source copy and direct cinema actions", () => {
    const pasteMarkup = renderToStaticMarkup(
      createElement(QuickListenPanel, {
        error: null,
        initialMode: "paste",
        isOpen: true,
        isSubmitting: false,
        recentSources: [],
        onCleanup: () => Promise.resolve(),
        onClearExpired: () => Promise.resolve(),
        onClose: () => null,
        onCreateFromFile: () => Promise.resolve(),
        onCreateFromText: () => Promise.resolve(),
        onCreateFromUrl: () => Promise.resolve(),
        onDiscard: () => Promise.resolve(),
        onExtend: () => Promise.resolve(),
        onUseRecentSource: () => Promise.resolve(),
      }),
    );
    expect(pasteMarkup).toContain("Temporary source text");
    expect(pasteMarkup).toContain('data-testid="ui-action-quick-listen-paste-open-cinema"');
    expect(pasteMarkup).toContain("Generated temporary audio");
    expect(pasteMarkup).toContain('data-status-tone="metadata"');
    expect(pasteMarkup).toContain(
      "Provider-backed generation can send request text, selected voice settings, and run configuration.",
    );

    const fileMarkup = renderToStaticMarkup(
      createElement(QuickListenPanel, {
        error: null,
        initialMode: "file",
        isOpen: true,
        isSubmitting: false,
        recentSources: [],
        onCleanup: () => Promise.resolve(),
        onClearExpired: () => Promise.resolve(),
        onClose: () => null,
        onCreateFromFile: () => Promise.resolve(),
        onCreateFromText: () => Promise.resolve(),
        onCreateFromUrl: () => Promise.resolve(),
        onDiscard: () => Promise.resolve(),
        onExtend: () => Promise.resolve(),
        onUseRecentSource: () => Promise.resolve(),
      }),
    );
    expect(fileMarkup).toContain("Supported file");
    expect(fileMarkup).toContain('data-testid="ui-action-quick-listen-file-open-cinema"');
    expect(fileMarkup).toContain("TXT, Markdown, HTML, CSV, JSON, or LOG");
  });

  it("classifies supported and unsupported temporary files before upload", () => {
    const supported = temporaryFileSupport(
      new File(["Temporary source text."], "scratch.md", { type: "text/markdown" }),
    );
    expect(supported.supported).toBe(true);
    expect(supported.confidence).toBe("high");
    expect(supported.detail).toContain("Extraction confidence is high");

    const unsupported = temporaryFileSupport(
      new File(["%PDF"], "book.pdf", { type: "application/pdf" }),
    );
    expect(unsupported.supported).toBe(false);
    expect(unsupported.detail).toContain("Unsupported file error state");
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

function temporaryBookSession(
  overrides: Partial<TemporarySourceSession> = {},
): TemporarySourceSession {
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
    scope: "temporary",
    status: "reviewable",
    temporarySourceId: "temp-book-1",
    text: "Temporary PDF body.",
    title: "Temporary PDF",
    updatedAt: "2026-06-11T17:00:00Z",
    wordCount: 3,
    ...overrides,
  };
}
