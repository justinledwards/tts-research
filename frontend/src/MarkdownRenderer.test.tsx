import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownRenderer, looksLikeMermaidDiagram } from "./MarkdownRenderer";
import {
  resolvePreparedSourceActiveBlockId,
  resolvePreparedSourceActiveWord,
} from "./markdownCinema";
import type { NarrationBlock, PreparedSource } from "./types";

describe("Markdown rendering helpers", () => {
  it("recognizes Mermaid flowchart source", () => {
    expect(looksLikeMermaidDiagram("flowchart LR\nA --> B")).toBe(true);
    expect(looksLikeMermaidDiagram("const value = 1;")).toBe(false);
  });

  it("renders Mermaid fences through the shared Markdown renderer", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer>{"```mermaid\nflowchart LR\nA --> B\n```"}</MarkdownRenderer>,
    );

    expect(markup).toContain("Rendering diagram");
  });

  it("renders GFM tables in the shared Markdown renderer", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer>{"| One | Two |\n|---|---|\n| A | B |"}</MarkdownRenderer>,
    );

    expect(markup).toContain("<table>");
    expect(markup).toContain("<td>A</td>");
  });

  it("marks the active word when source offsets overlap the rendered Markdown", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer
        wordHighlight={{ activeWordOffset: 1, blockEndOffset: 11, blockStartOffset: 0 }}
      >
        {"Hello world"}
      </MarkdownRenderer>,
    );

    expect(markup).toContain("markdown-cinema-word-active");
    expect(markup).toContain(">world</span>");
  });

  it("marks an active generated block without wrapping individual words", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer blockHighlight={{ blockEndOffset: 30, blockStartOffset: 0 }}>
        {"| One | Two |\n|---|---|\n| A | B |"}
      </MarkdownRenderer>,
    );

    expect(markup).toContain("markdown-cinema-block-active");
    expect(markup).not.toContain("markdown-cinema-word-active");
  });

  it("maps active teleprompter word indexes back to prepared-source blocks", () => {
    const source = makePreparedSource([
      makeBlock("block-1", "First two", "First two"),
      makeBlock("block-2", "Skipped diagram", "", "skip"),
      makeBlock("block-3", "Second block here", "Second block here"),
    ]);

    expect(resolvePreparedSourceActiveBlockId(source, 0)).toBe("block-1");
    expect(resolvePreparedSourceActiveBlockId(source, 2)).toBe("block-3");
    expect(resolvePreparedSourceActiveBlockId(source, 20)).toBe("block-3");
    expect(resolvePreparedSourceActiveWord(source, 3)?.wordOffset).toBe(1);
  });

  it("opens markdown links in a new tab with safe rel metadata", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer>{"[Open](/docs/example)"}</MarkdownRenderer>,
    );

    expect(markup).toContain('<a target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain('href="/docs/example"');
  });

  it("renders document citation artifacts as speech-safe chips", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer artifactRendering="document-cinema">
        {"Claim [cite][turn40search10] and :contentReference[oaicite:3]{index=3}."}
      </MarkdownRenderer>,
    );

    expect(markup).toContain("document-inline-artifact--citation");
    expect(markup).toContain("document-inline-artifact--artifact_token");
    expect(markup).toContain('data-speech-mode="skip"');
    expect(markup).toContain('data-speech-behavior="on-demand"');
    expect(markup).toContain("Available on demand");
    expect(markup).toContain("Copy citation");
    expect(markup).toContain('href="#prepared-source-policy-notes"');
    expect(markup).not.toContain("[cite]");
    expect(markup).not.toContain(":contentReference");
  });

  it("keeps document links and code spans visually classified", () => {
    const markup = renderToStaticMarkup(
      <MarkdownRenderer artifactRendering="document-cinema">
        {"Use [`voice_id`](https://example.com/docs) with `tts.run`."}
      </MarkdownRenderer>,
    );

    expect(markup).toContain("document-inline-artifact-link");
    expect(markup).toContain("document-inline-artifact-code");
    expect(markup).toContain("tts.run");
  });
});

function makePreparedSource(blocks: NarrationBlock[]): PreparedSource {
  return {
    id: "source-1",
    projectId: "default",
    status: "ready",
    kind: "file",
    sourceName: "demo.md",
    sourceFormat: "markdown",
    renderMode: "markdown",
    speechPolicyProfile: "Enterprise",
    text: "# Demo",
    speechText: "First two\n\nSecond block here",
    wordCount: 5,
    blockCount: blocks.length,
    segmentCount: 2,
    summary: {
      citationSkipCount: 0,
      headingCount: 0,
      skippedBlockCount: 1,
      sentenceSegmentCount: 2,
      spokenBlockCount: 2,
    },
    blocks,
    createdAt: "2026-05-16T12:00:00Z",
    updatedAt: "2026-05-16T12:00:00Z",
  };
}

function makeBlock(
  id: string,
  text: string,
  spokenText: string,
  speakMode: NarrationBlock["speakMode"] = "speak",
): NarrationBlock {
  return {
    id,
    index: 0,
    kind: "body",
    speakMode,
    text,
    spokenText,
    startOffset: 0,
    endOffset: text.length,
    speechPolicy: {
      explanation: "Test policy",
      mode: speakMode,
      profile: "Enterprise",
    },
  };
}
