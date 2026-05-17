import { describe, expect, it } from "vitest";
import { resolveHighlightCue, secondsForReadingPosition } from "./highlightMap";
import type { HighlightMap } from "./types";

function fixtureMap(mode: "word" | "phrase" = "word"): HighlightMap {
  return {
    schemaVersion: "highlight-map.v1",
    jobId: "job-1",
    status: "complete",
    source: "heuristic",
    mode,
    durationMs: 1000,
    generatedAt: new Date(0).toISOString(),
    summary: {
      status: "complete",
      source: "heuristic",
      mode,
      durationMs: 1000,
      fragmentCount: 1,
      tokenCount: 2,
      confidence: { overall: 0.74, segment: 0.74, token: 0.68 },
      drift: {
        meanAbsoluteMs: 0,
        maxAbsoluteMs: 0,
        maxRatio: 0,
        corrected: false,
        lowConfidence: false,
      },
      lowConfidence: mode === "phrase",
    },
    fragments: [
      {
        index: 0,
        segmentIndex: 1,
        text: "Hello world",
        startMs: 0,
        endMs: 1000,
        confidence: 0.74,
        tokenStart: 0,
        tokenEnd: 1,
        readingPosition: { activeWordIndex: 8, bookSourceId: "book", scopeKey: "chapter:1" },
      },
    ],
    tokens: [
      {
        index: 0,
        fragmentIndex: 0,
        segmentIndex: 1,
        text: "Hello",
        startMs: 0,
        endMs: 500,
        confidence: 0.68,
        mode,
        readingPosition: {
          activeWordIndex: 8,
          bookSourceId: "book",
          scopeKey: "chapter:1",
          locator: { type: "html", html: { href: "chapter.xhtml", fragment: "w8" } },
        },
      },
      {
        index: 1,
        fragmentIndex: 0,
        segmentIndex: 1,
        text: "world",
        startMs: 500,
        endMs: 1000,
        confidence: 0.68,
        mode,
        readingPosition: { activeWordIndex: 9, bookSourceId: "book", scopeKey: "chapter:1" },
      },
    ],
  };
}

describe("highlight map lookup", () => {
  it("returns word timing when the map is word-level", () => {
    const cue = resolveHighlightCue(fixtureMap("word"), 0.75);
    expect(cue?.mode).toBe("word");
    expect(cue?.activeWordIndex).toBe(9);
    expect(cue?.tokenIndex).toBe(1);
  });

  it("falls back to phrase range when the map is phrase-level", () => {
    const cue = resolveHighlightCue(fixtureMap("phrase"), 0.75);
    expect(cue?.mode).toBe("phrase");
    expect(cue?.phraseWordStart).toBe(8);
    expect(cue?.phraseWordEnd).toBe(9);
  });

  it("resolves resume seconds from locators before elapsed progress", () => {
    const seconds = secondsForReadingPosition(fixtureMap("word"), {
      activeWordIndex: 99,
      locator: { type: "html", html: { href: "chapter.xhtml", fragment: "w8" } },
    });
    expect(seconds).toBe(0);
  });

  it("resolves resume seconds from locator envelopes", () => {
    const seconds = secondsForReadingPosition(fixtureMap("word"), {
      activeWordIndex: 99,
      locatorEnvelope: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "book",
        locator: { type: "html", html: { href: "chapter.xhtml", fragment: "w8" } },
      },
    });
    expect(seconds).toBe(0);
  });
});
