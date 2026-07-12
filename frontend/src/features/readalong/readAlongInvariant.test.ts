import { describe, expect, it } from "vitest";
import type {
  HighlightFragment,
  HighlightMap,
  HighlightToken,
  NarrationBlock,
  PlaybackProgress,
  PreparedSource,
  ProgressBookmark,
} from "../../types";
import {
  evaluateBookReadAlongInvariant,
  evaluatePreparedSourceReadAlongInvariant,
  evaluateSourceSwitchInvariant,
  readAlongInvariantStatusLabel,
} from "./readAlongInvariant";

describe("read-along invariants", () => {
  it("passes when a book cue, source scope, visible word, and passage agree", () => {
    const report = evaluateBookReadAlongInvariant({
      activeBlock: block("chapter-1", "The first chapter begins with a stable read along passage."),
      activeSpan: { endOffset: 17, index: 4, startOffset: 12, text: "begins" },
      activeText: "The first chapter begins with a stable read along passage.",
      activeWordIndex: 4,
      bookSourceId: "epub-book",
      generatedAudioState: "ready",
      highlightCue: cue({
        fragment: makeFragment({
          readingPosition: {
            activeWordIndex: 4,
            bookSourceId: "epub-book",
            scopeKey: "chapter:1",
          },
          text: "chapter begins with a stable",
        }),
        token: makeToken({
          fragmentIndex: 0,
          readingPosition: {
            activeWordIndex: 4,
            bookSourceId: "epub-book",
            scopeKey: "chapter:1",
          },
        }),
      }),
      highlightMap: highlightMap(),
      jobMatchesSource: true,
      scopeKey: "chapter:1",
      visibleWordIndexes: [3, 4, 5],
    });

    expect(report.status).toBe("passed");
    expect(readAlongInvariantStatusLabel(report)).toBe("Read-along aligned");
  });

  it("flags an active token that is outside the active fragment", () => {
    const report = evaluateBookReadAlongInvariant({
      activeBlock: block("chapter-1", "Visible passage"),
      activeSpan: { endOffset: 8, index: 2, startOffset: 0, text: "passage" },
      activeText: "Visible passage",
      activeWordIndex: 2,
      bookSourceId: "pdf-book",
      highlightCue: cue({
        fragment: makeFragment({ index: 1, text: "Visible passage", tokenEnd: 5, tokenStart: 2 }),
        token: makeToken({ fragmentIndex: 0, index: 1 }),
      }),
      highlightMap: highlightMap({
        fragments: [makeFragment({ index: 1, tokenEnd: 5, tokenStart: 2 })],
      }),
      jobMatchesSource: true,
      scopeKey: "pages:1-2",
      visibleWordIndexes: [2],
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("token-fragment-mismatch");
  });

  it("stops stale generated audio from driving a current-word highlight", () => {
    const report = evaluateBookReadAlongInvariant({
      activeBlock: block("chapter-1", "A stale run should not highlight this text."),
      activeSpan: { endOffset: 7, index: 1, startOffset: 2, text: "stale" },
      activeText: "A stale run should not highlight this text.",
      activeWordIndex: 1,
      bookSourceId: "docx-book",
      generatedAudioState: "stale",
      highlightCue: cue({}),
      jobMatchesSource: true,
      scopeKey: "book",
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("stale-audio-highlight");
  });

  it("keeps prepared-source active words attached to the active narration block", () => {
    const source = preparedSource("markdown-source", [
      block("intro", "Intro text with citations [1]."),
      block("body", "The body carries the generated audio."),
    ]);

    const report = evaluatePreparedSourceReadAlongInvariant({
      activeBlock: source.blocks?.[1],
      activeText: "The body carries the generated audio.",
      activeWordIndex: 1,
      generatedAudioState: "ready",
      highlightCue: cue({
        token: makeToken({ readingPosition: { activeWordIndex: 1, nodeId: "intro" } }),
      }),
      jobMatchesSource: true,
      progress: progress({
        preparedSourceId: "markdown-source",
        targetId: "prepared:markdown-source",
      }),
      source,
      surface: "document",
      visibleNodeIds: ["body"],
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("prepared-active-block-mismatch");
    expect(report.issues.map((issue) => issue.id)).toContain("prepared-node-not-visible");
  });

  it("ensures bookmarks reopen the same source and scope", () => {
    const bookmark: ProgressBookmark = {
      activeWordIndex: 8,
      createdAt: "2026-05-24T00:00:00.000Z",
      currentTimeSec: 12,
      id: "bookmark-1",
      readingPosition: {
        activeWordIndex: 8,
        bookSourceId: "wrong-book",
        scopeKey: "chapter:2",
      },
    };

    const report = evaluateBookReadAlongInvariant({
      activeBlock: block("chapter-2", "Bookmark should reattach here."),
      activeSpan: { endOffset: 15, index: 8, startOffset: 9, text: "reattach" },
      activeText: "Bookmark should reattach here.",
      activeWordIndex: 8,
      bookSourceId: "epub-book",
      bookmark,
      jobMatchesSource: true,
      scopeKey: "chapter:2",
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("bookmark-source-mismatch");
  });

  it("requires source switches to clear incompatible active state", () => {
    const report = evaluateSourceSwitchInvariant({
      activeWordIndex: 12,
      nextSourceId: "website-source",
      previousHighlightCue: cue({}),
      previousProgress: progress({ bookSourceId: "epub-book" }),
      previousSourceId: "epub-book",
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toEqual([
      "source-switch-active-word",
      "source-switch-highlight-cue",
      "source-switch-progress",
    ]);
  });
});

function block(id: string, text: string): NarrationBlock {
  return {
    endOffset: text.length,
    id,
    index: id === "intro" ? 0 : 1,
    kind: "body",
    segments: [],
    speakMode: "speak",
    speechPolicy: { explanation: "", mode: "speak", profile: "default" },
    spokenText: text,
    startOffset: 0,
    text,
  };
}

function preparedSource(id: string, blocks: NarrationBlock[]): PreparedSource {
  return {
    blockCount: blocks.length,
    blocks,
    createdAt: "2026-05-24T00:00:00.000Z",
    id,
    kind: "file",
    projectId: "project",
    segmentCount: blocks.length,
    sourceName: `${id}.md`,
    speechPolicyProfile: "default",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 1,
      sentenceSegmentCount: blocks.length,
      skippedBlockCount: 0,
      spokenBlockCount: blocks.length,
    },
    updatedAt: "2026-05-24T00:00:00.000Z",
    wordCount: blocks.reduce((total, item) => total + (item.text ?? "").split(/\s+/).length, 0),
  };
}

function cue({
  fragment = makeFragment({}),
  token = makeToken({}),
}: {
  fragment?: HighlightFragment;
  token?: HighlightToken;
}) {
  return {
    activeWordIndex: token.readingPosition?.activeWordIndex ?? 0,
    fragment,
    fragmentIndex: fragment.index,
    mode: "word" as const,
    phraseWordEnd: token.readingPosition?.activeWordIndex ?? 0,
    phraseWordStart: token.readingPosition?.activeWordIndex ?? 0,
    readingPosition: token.readingPosition ?? fragment.readingPosition,
    token,
    tokenIndex: token.index,
  };
}

function makeFragment(overrides: Partial<HighlightFragment>): HighlightFragment {
  return {
    confidence: 0.96,
    endMs: 900,
    index: 0,
    segmentIndex: 0,
    startMs: 0,
    text: "Visible passage",
    tokenEnd: 2,
    tokenStart: 0,
    ...overrides,
  };
}

function makeToken(overrides: Partial<HighlightToken>): HighlightToken {
  return {
    confidence: 0.97,
    endMs: 300,
    fragmentIndex: 0,
    index: 0,
    mode: "word",
    readingPosition: { activeWordIndex: 0 },
    segmentIndex: 0,
    startMs: 0,
    text: "Visible",
    ...overrides,
  };
}

function highlightMap(overrides: Partial<HighlightMap> = {}): HighlightMap {
  return {
    durationMs: 900,
    fragments: [makeFragment({})],
    generatedAt: "2026-05-24T00:00:00.000Z",
    jobId: "job",
    mode: "word",
    schemaVersion: "highlight-map.v1",
    source: "heuristic",
    status: "ready",
    summary: {
      confidence: { overall: 0.96, segment: 0.95, token: 0.98 },
      drift: {
        corrected: false,
        lowConfidence: false,
        maxAbsoluteMs: 0,
        maxRatio: 0,
        meanAbsoluteMs: 0,
      },
      durationMs: 900,
      fragmentCount: 1,
      lowConfidence: false,
      mode: "word",
      source: "heuristic",
      status: "ready",
      tokenCount: 1,
    },
    tokens: [makeToken({})],
    ...overrides,
  };
}

function progress(overrides: Partial<PlaybackProgress>): PlaybackProgress {
  return {
    createdAt: "2026-05-24T00:00:00.000Z",
    currentTimeSec: 0,
    finished: false,
    hidden: false,
    progress: 0,
    projectId: "project",
    targetId: "target",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}
