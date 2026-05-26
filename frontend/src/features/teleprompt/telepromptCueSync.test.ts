import { describe, expect, it } from "vitest";
import type { ContentIRLocator } from "../../content-ir";
import type { HighlightMap } from "../../types";
import type { HighlightMapV2, HighlightMapV2Entry } from "../readalong";
import type { RevisionBlock } from "../revision";
import {
  buildTelepromptCueTimeline,
  resolveTelepromptCueSync,
  telepromptCueSeekSeconds,
} from "./telepromptCueTimeline";

const blocks: RevisionBlock[] = [
  block({ id: "intro", index: 1, spokenText: "Welcome to the studio." }),
  block({ id: "body", index: 2, spokenText: "Follow the generated audio timeline." }),
  block({ id: "close", index: 3, spokenText: "Return to cinema at this cue." }),
];

describe("teleprompt cue timeline sync", () => {
  it("derives cue timing from HighlightMap v2 and follows playback audio time", () => {
    const timeline = buildTelepromptCueTimeline({
      blocks,
      highlightMapV2: highlightMapV2([
        phraseEntry({
          audioEndMs: 1000,
          audioStartMs: 0,
          fragmentIndex: 0,
          spokenText: "Welcome to the studio.",
        }),
        phraseEntry({
          audioEndMs: 2400,
          audioStartMs: 1000,
          fragmentIndex: 1,
          spokenText: "Follow the generated audio timeline.",
        }),
        wordEntry({
          audioEndMs: 1300,
          audioStartMs: 1050,
          fragmentIndex: 1,
          spokenText: "Follow",
          tokenIndex: 0,
        }),
        wordEntry({
          audioEndMs: 1700,
          audioStartMs: 1320,
          fragmentIndex: 1,
          spokenText: "the",
          tokenIndex: 1,
        }),
        phraseEntry({
          audioEndMs: 3600,
          audioStartMs: 2400,
          fragmentIndex: 2,
          spokenText: "Return to cinema at this cue.",
        }),
      ]),
    });

    const sync = resolveTelepromptCueSync({
      activeBlockId: "intro",
      mode: "audio-follow",
      playbackAvailable: true,
      playbackCursorSec: 1.12,
      playbackPlaying: true,
      timeline,
    });

    expect(timeline.source).toBe("highlight-map-v2");
    expect(sync.activeCue?.sourceBlockId).toBe("body");
    expect(sync.activeCue?.currentWordIndex).toBe(0);
    expect(sync.nextCue?.sourceBlockId).toBe("close");
    expect(sync.previousCue?.sourceBlockId).toBe("intro");
    expect(sync.shouldUpdateActiveBlock).toBe(true);
    expect(sync.statusLabel).toBe("Audio-follow cue sync active");
  });

  it("preserves the selected cue in manual mode while audio keeps moving", () => {
    const timeline = buildTelepromptCueTimeline({
      blocks,
      highlightMapV2: highlightMapV2([
        phraseEntry({ audioEndMs: 1000, audioStartMs: 0, spokenText: blocks[0].spokenText }),
        phraseEntry({ audioEndMs: 2400, audioStartMs: 1000, spokenText: blocks[1].spokenText }),
        phraseEntry({ audioEndMs: 3600, audioStartMs: 2400, spokenText: blocks[2].spokenText }),
      ]),
    });

    const sync = resolveTelepromptCueSync({
      activeBlockId: "intro",
      mode: "manual",
      playbackAvailable: true,
      playbackCursorSec: 2.6,
      playbackPlaying: true,
      timeline,
    });

    expect(sync.activeCue?.sourceBlockId).toBe("intro");
    expect(sync.shouldFollowAudio).toBe(false);
    expect(sync.shouldUpdateActiveBlock).toBe(false);
    expect(sync.statusLabel).toBe("Manual cue mode");
  });

  it("keeps Cinema handoff anchored to the active cue start time", () => {
    const timeline = buildTelepromptCueTimeline({
      blocks,
      highlightMap: legacyHighlightMap(),
    });
    const sync = resolveTelepromptCueSync({
      activeBlockId: "body",
      mode: "review-playback",
      playbackAvailable: true,
      playbackCursorSec: 1.4,
      playbackPlaying: false,
      timeline,
    });

    expect(sync.activeCue?.sourceBlockId).toBe("body");
    expect(telepromptCueSeekSeconds(sync.activeCue)).toBe(1);
    expect(sync.statusLabel).toBe("Review playback sync");
  });
});

function block(overrides: Partial<RevisionBlock>): RevisionBlock {
  return {
    confidence: 1,
    estimatedDurationMs: 1200,
    id: "block",
    index: 1,
    kind: "text",
    label: "Block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Draft",
    speakMode: "speak",
    spokenText: "Text",
    status: "waiting",
    text: "Text",
    warnings: [],
    ...overrides,
  };
}

function highlightMapV2(entries: HighlightMapV2Entry[]): HighlightMapV2 {
  return {
    contentIrVersion: "content-ir.v1",
    durationMs: 3600,
    entries,
    generatedAt: "2026-05-26T05:00:00.000Z",
    generatedAudioId: "job-1",
    schemaVersion: "highlight-map.v2",
    scopeKey: "demo",
    sourceId: "source-1",
    speechPlanId: "plan-1",
    summary: {
      blockCount: 3,
      confidence: 0.95,
      degraded: false,
      driftBudgetMs: 150,
      entryCount: entries.length,
      fallbackMode: "none",
      phraseCount: entries.filter((entry) => entry.level === "phrase").length,
      primaryLevel: "word",
      sentenceCount: 0,
      status: "ready",
      timingSources: ["provider-word"],
      wordCount: entries.filter((entry) => entry.level === "word").length,
    },
    timingLevels: ["phrase", "word"],
  };
}

function phraseEntry(overrides: Partial<HighlightMapV2Entry>): HighlightMapV2Entry {
  return v2Entry({ level: "phrase", timingSource: "phrase-estimate", ...overrides });
}

function wordEntry(overrides: Partial<HighlightMapV2Entry>): HighlightMapV2Entry {
  return v2Entry({ level: "word", timingSource: "provider-word", ...overrides });
}

function v2Entry(overrides: Partial<HighlightMapV2Entry>): HighlightMapV2Entry {
  const spokenText = overrides.spokenText ?? "Text";
  return {
    alignedEndMs: null,
    alignedStartMs: null,
    alignmentWarnings: [],
    audioEndMs: 1000,
    audioStartMs: 0,
    confidence: 0.95,
    contentIrVersion: "content-ir.v1",
    driftBudgetMs: 150,
    fallbackMode: "none",
    fragmentIndex: 0,
    generatedAudioId: "job-1",
    level: "phrase",
    nodeId: "node-1",
    normalizedText: spokenText,
    providerTimingEndMs: null,
    providerTimingStartMs: null,
    rawText: spokenText,
    scopeKey: "demo",
    sentenceIndex: 0,
    sourceId: "source-1",
    sourceLocator: {} as ContentIRLocator,
    speechPlanId: "plan-1",
    spokenText,
    textQuote: spokenText,
    timingSource: "phrase-estimate",
    tokenIndex: null,
    ...overrides,
  };
}

function legacyHighlightMap(): HighlightMap {
  return {
    durationMs: 3600,
    fragments: [
      {
        confidence: 1,
        endMs: 1000,
        index: 0,
        segmentIndex: 0,
        startMs: 0,
        text: blocks[0].spokenText,
      },
      {
        confidence: 1,
        endMs: 2400,
        index: 1,
        segmentIndex: 1,
        startMs: 1000,
        text: blocks[1].spokenText,
      },
      {
        confidence: 1,
        endMs: 3600,
        index: 2,
        segmentIndex: 2,
        startMs: 2400,
        text: blocks[2].spokenText,
      },
    ],
    generatedAt: "2026-05-26T05:00:00.000Z",
    jobId: "job-1",
    mode: "phrase",
    schemaVersion: "highlight-map.v1",
    source: "heuristic",
    status: "ready",
    summary: {
      confidence: { overall: 1, segment: 1, token: 0 },
      drift: {
        corrected: false,
        lowConfidence: false,
        maxAbsoluteMs: 0,
        maxRatio: 0,
        meanAbsoluteMs: 0,
      },
      durationMs: 3600,
      fragmentCount: 3,
      lowConfidence: false,
      mode: "phrase",
      source: "heuristic",
      status: "ready",
      tokenCount: 0,
    },
    tokens: [],
  };
}
