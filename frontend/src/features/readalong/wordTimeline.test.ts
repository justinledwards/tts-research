import { describe, expect, it } from "vitest";
import type { ContentIRLocator } from "../../content-ir";
import type { HighlightMapV2, HighlightMapV2Entry } from "./highlightMapV2";
import type { NarrationBlock, PreparedSource } from "../../types";
import {
  buildPreparedSourceWordLedger,
  wordTimelineFromPreparedSourceHighlightMapV2,
} from "./wordTimeline";

describe("prepared-source word timeline", () => {
  it("keeps skipped blocks out of the ledger and block-anchors summarized speech", () => {
    const source = preparedSource([
      block({
        endOffset: 10,
        id: "intro",
        spokenText: "Intro body",
        startOffset: 0,
        text: "Intro body",
      }),
      block({
        endOffset: 24,
        id: "reference",
        kind: "reference",
        speakMode: "skip",
        spokenText: "",
        startOffset: 12,
        text: "[1](https://example.com/ref)",
      }),
      block({
        endOffset: 94,
        id: "summary",
        speakMode: "summarize",
        speechMode: "summarize",
        spokenText: "Table summary",
        startOffset: 30,
        text: "| Raw | Source | Table | With | Many | Cells |",
      }),
      block({
        endOffset: 110,
        id: "outro",
        spokenText: "Tail",
        startOffset: 106,
        text: "Tail",
      }),
    ]);

    const ledger = buildPreparedSourceWordLedger({
      scopeKey: "prepared-source",
      source,
      sourceId: source.id,
    });

    expect(ledger.map((entry) => entry.text)).toEqual([
      "Intro",
      "body",
      "Table",
      "summary",
      "Tail",
    ]);
    expect(ledger.find((entry) => entry.blockId === "reference")).toBeUndefined();
    expect(ledger[2]).toMatchObject({
      blockId: "summary",
      endOffset: 94,
      sourceWordIndex: 2,
      startOffset: 30,
      text: "Table",
    });
    expect(ledger[2]?.anchorTokenOffset).toBeUndefined();
    expect(ledger[2]?.anchorWordIndex).toBeUndefined();
    expect(ledger[4]).toMatchObject({
      anchorTokenOffset: 0,
      anchorWordIndex: 0,
      blockId: "outro",
      sourceWordIndex: 4,
      text: "Tail",
    });
  });

  it("maps generated summary timing to the source block without a raw word anchor", () => {
    const source = preparedSource([
      block({
        endOffset: 10,
        id: "intro",
        spokenText: "Intro body",
        startOffset: 0,
        text: "Intro body",
      }),
      block({
        endOffset: 24,
        id: "reference",
        kind: "reference",
        speakMode: "skip",
        spokenText: "",
        startOffset: 12,
        text: "[1](https://example.com/ref)",
      }),
      block({
        endOffset: 94,
        id: "summary",
        speakMode: "summarize",
        speechMode: "summarize",
        spokenText: "Table summary",
        startOffset: 30,
        text: "| Raw | Source | Table | With | Many | Cells |",
      }),
      block({
        endOffset: 110,
        id: "outro",
        spokenText: "Tail",
        startOffset: 106,
        text: "Tail",
      }),
    ]);
    const timeline = wordTimelineFromPreparedSourceHighlightMapV2({
      map: highlightMap(["Intro", "body", "Table", "summary", "Tail"], source.id),
      source,
    });

    expect(timeline?.entries.map((entry) => entry.text)).toEqual([
      "Intro",
      "body",
      "Table",
      "summary",
      "Tail",
    ]);
    const summaryEntries = timeline?.entries.filter((entry) => entry.anchorNodeId === "summary");
    expect(summaryEntries).toHaveLength(2);
    expect(summaryEntries?.map((entry) => entry.sourceWordIndex)).toEqual([2, 3]);
    expect(summaryEntries?.map((entry) => entry.anchorTokenOffset)).toEqual([undefined, undefined]);
    expect(summaryEntries?.map((entry) => entry.anchorWordIndex)).toEqual([undefined, undefined]);
    expect(timeline?.entries[0]).toMatchObject({
      anchorNodeId: "intro",
      anchorTokenOffset: 0,
      anchorWordIndex: 0,
    });
  });
});

function preparedSource(blocks: NarrationBlock[]): PreparedSource {
  return {
    blockCount: blocks.length,
    blocks,
    createdAt: "2026-06-05T18:30:00.000Z",
    id: "prepared-1",
    kind: "file",
    projectId: "project",
    renderMode: "markdown",
    segmentCount: 3,
    sourceFormat: "markdown",
    sourceName: "source.md",
    speechPolicyProfile: "Enterprise",
    speechText: "Intro body\n\nTable summary\n\nTail",
    status: "ready",
    summary: {
      citationSkipCount: 1,
      headingCount: 0,
      sentenceSegmentCount: 3,
      skippedBlockCount: 1,
      spokenBlockCount: 3,
    },
    text: "# Source",
    updatedAt: "2026-06-05T18:30:00.000Z",
    wordCount: 5,
  };
}

function block({
  endOffset,
  id,
  kind = "body",
  speakMode = "speak",
  speechMode = speakMode,
  spokenText,
  startOffset,
  text,
}: Readonly<{
  endOffset: number;
  id: string;
  kind?: NarrationBlock["kind"];
  speakMode?: NarrationBlock["speakMode"];
  speechMode?: NarrationBlock["speechPolicy"]["mode"];
  spokenText: string;
  startOffset: number;
  text: string;
}>): NarrationBlock {
  return {
    endOffset,
    id,
    index: 0,
    kind,
    segments: [],
    speakMode,
    speechPolicy: {
      explanation: "test",
      mode: speechMode,
      profile: "Enterprise",
    },
    spokenText,
    startOffset,
    text,
  };
}

function highlightMap(words: string[], sourceId: string): HighlightMapV2 {
  const entries = words.map((word, index) => wordEntry(word, index, sourceId));
  return {
    contentIrVersion: "content-ir.v1",
    durationMs: words.length * 100,
    entries,
    generatedAt: "2026-06-05T18:30:00.000Z",
    generatedAudioId: "job-1",
    schemaVersion: "highlight-map.v2",
    scopeKey: "prepared-source",
    sourceId,
    speechPlanId: "job-1",
    summary: {
      blockCount: 0,
      confidence: 1,
      degraded: false,
      driftBudgetMs: 150,
      entryCount: entries.length,
      fallbackMode: "none",
      phraseCount: 0,
      primaryLevel: "word",
      sentenceCount: 0,
      status: "complete",
      timingSources: ["provider-word"],
      wordCount: entries.length,
    },
    timingLevels: ["word"],
  };
}

function wordEntry(word: string, index: number, sourceId: string): HighlightMapV2Entry {
  return {
    alignedEndMs: null,
    alignedStartMs: null,
    alignmentWarnings: [],
    audioEndMs: (index + 1) * 100,
    audioStartMs: index * 100,
    confidence: 1,
    contentIrVersion: "content-ir.v1",
    driftBudgetMs: 150,
    entryId: `word:${index.toString()}`,
    fallbackMode: "none",
    fragmentIndex: 0,
    generatedAudioId: "job-1",
    level: "word",
    nodeId: `timing-node-${index.toString()}`,
    normalizedText: word,
    providerTimingEndMs: (index + 1) * 100,
    providerTimingStartMs: index * 100,
    rawText: word,
    scopeKey: "prepared-source",
    segmentId: `segment-${index.toString()}`,
    sentenceIndex: 0,
    sourceId,
    sourceLocator: locator(),
    sourceWordId: `${sourceId}:prepared-source:word:${index.toString()}`,
    sourceWordIndex: index,
    speechPlanId: "job-1",
    spokenText: word,
    textQuote: word,
    timingSource: "provider-word",
    tokenIndex: index,
    traceability: { spokenTextMatch: word },
  };
}

function locator(): ContentIRLocator {
  return {
    markdown: {
      astPath: "/children/1",
      columnEnd: 1,
      columnStart: 1,
      lineEnd: 1,
      lineStart: 1,
      path: "source.md",
    },
    type: "markdown",
  };
}
