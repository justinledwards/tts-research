import { describe, expect, it } from "vitest";
import type { ContentIRDocument, ContentIRLocator, SpeechPlanDocument } from "../../content-ir";
import { resolveReadAlongRuntimeSnapshot } from "./ReadAlongResyncController";
import type { HighlightMapV2, HighlightMapV2Entry } from "./highlightMapV2";
import { highlightMapV2ToLegacyHighlightMap } from "./highlightMapV2";
import { validateTimingArtifact } from "./timingArtifact";

describe("HighlightMap v2 timing artifact", () => {
  it("validates source, locator, spoken text, and monotonic word timing", () => {
    const artifact = baseArtifact();
    const report = validateTimingArtifact({
      artifact,
      contentIr: contentIrDocument(),
      speechPlan: speechPlanDocument(),
    });

    expect(report.status).toBe("passed");
    expect(report.issues).toEqual([]);
  });

  it("converts v2 timing into the legacy read-along runtime shape", () => {
    const artifact = baseArtifact();
    const legacyMap = highlightMapV2ToLegacyHighlightMap(artifact);
    const snapshot = resolveReadAlongRuntimeSnapshot({
      audioTimeSec: 0.4,
      generatedAudioState: "ready",
      isPlaying: true,
      timingArtifact: artifact,
    });

    expect(legacyMap.schemaVersion).toBe("highlight-map.v1");
    expect(legacyMap.tokens).toHaveLength(2);
    expect(snapshot.state).toBe("synced-word");
    expect(snapshot.activeCue?.activeWordIndex).toBe(1);
  });

  it("fails when an entry does not resolve to a Content IR node", () => {
    const artifact = baseArtifact({
      entries: [wordEntry({ nodeId: "missing-node" })],
      summary: { ...baseArtifact().summary, entryCount: 1, wordCount: 1 },
    });
    const report = validateTimingArtifact({
      artifact,
      contentIr: contentIrDocument(),
      speechPlan: speechPlanDocument(),
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("entry-node-not-found");
  });

  it("fails reversed and non-monotonic timing ranges", () => {
    const artifact = baseArtifact({
      entries: [
        wordEntry({ audioEndMs: 300, audioStartMs: 400, entryId: "reversed", tokenIndex: 0 }),
        wordEntry({ audioEndMs: 220, audioStartMs: 200, entryId: "non-monotonic", tokenIndex: 1 }),
      ],
    });
    const report = validateTimingArtifact({
      artifact,
      contentIr: contentIrDocument(),
      speechPlan: speechPlanDocument(),
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("audio-range-reversed");
    expect(report.issues.map((issue) => issue.id)).toContain("audio-range-not-monotonic");
  });

  it("fails overlapping word timing unless overlap is explicit", () => {
    const overlapping = baseArtifact({
      entries: [
        wordEntry({ audioEndMs: 500, audioStartMs: 0, entryId: "one", tokenIndex: 0 }),
        wordEntry({ audioEndMs: 800, audioStartMs: 400, entryId: "two", tokenIndex: 1 }),
      ],
    });
    const allowed = baseArtifact({
      entries: [
        wordEntry({
          allowsOverlap: true,
          audioEndMs: 500,
          audioStartMs: 0,
          entryId: "one",
          tokenIndex: 0,
        }),
        wordEntry({
          allowsOverlap: true,
          audioEndMs: 800,
          audioStartMs: 400,
          entryId: "two",
          tokenIndex: 1,
        }),
      ],
    });

    expect(
      validateTimingArtifact({
        artifact: overlapping,
        contentIr: contentIrDocument(),
        speechPlan: speechPlanDocument(),
      }).issues.map((issue) => issue.id),
    ).toContain("word-overlap");
    expect(
      validateTimingArtifact({
        artifact: allowed,
        contentIr: contentIrDocument(),
        speechPlan: speechPlanDocument(),
      }).issues.map((issue) => issue.id),
    ).not.toContain("word-overlap");
  });

  it("fails spoken text that is not traceable to source or policy transform", () => {
    const artifact = baseArtifact({
      entries: [
        wordEntry({
          rawText: "Dr",
          spokenText: "unrelated narration",
          traceability: undefined,
        }),
      ],
      summary: { ...baseArtifact().summary, entryCount: 1, wordCount: 1 },
    });
    const report = validateTimingArtifact({
      artifact,
      contentIr: contentIrDocument(),
      speechPlan: null,
    });

    expect(report.status).toBe("failed");
    expect(report.issues.map((issue) => issue.id)).toContain("spoken-text-not-traceable");
  });

  it("reports explicit degraded fallback without treating it as accurate word sync", () => {
    const artifact = baseArtifact({
      entries: [
        wordEntry({
          confidence: 0.42,
          fallbackMode: "block-only",
          level: "block",
          tokenIndex: null,
        }),
      ],
      summary: {
        ...baseArtifact().summary,
        blockCount: 1,
        degraded: true,
        entryCount: 1,
        fallbackMode: "block-only",
        primaryLevel: "block",
        wordCount: 0,
      },
      timingLevels: ["block"],
    });
    const report = validateTimingArtifact({
      artifact,
      contentIr: contentIrDocument(),
      speechPlan: speechPlanDocument(),
    });

    expect(report.status).toBe("degraded");
    expect(report.issues).toEqual([]);
  });
});

function baseArtifact(overrides: Partial<HighlightMapV2> = {}): HighlightMapV2 {
  const entries = overrides.entries ?? [
    wordEntry({ audioEndMs: 300, audioStartMs: 0, tokenIndex: 0 }),
    wordEntry({
      audioEndMs: 800,
      audioStartMs: 300,
      rawText: "Nguyen",
      spokenText: "Nguyen",
      tokenIndex: 1,
    }),
  ];
  return {
    contentIrVersion: "content-ir.v1",
    durationMs: 1200,
    entries,
    generatedAt: "2026-05-26T06:14:00Z",
    generatedAudioId: "audio",
    schemaVersion: "highlight-map.v2",
    scopeKey: "document",
    sourceId: "source",
    speechPlanId: "speech-plan",
    summary: {
      blockCount: 0,
      confidence: 0.96,
      degraded: false,
      driftBudgetMs: 150,
      entryCount: entries.length,
      fallbackMode: "none",
      phraseCount: 0,
      primaryLevel: "word",
      sentenceCount: 0,
      status: "complete",
      timingSources: ["provider-word"],
      wordCount: entries.filter((entry) => entry.level === "word").length,
    },
    timingLevels: ["word", "phrase", "sentence", "block"],
    ...overrides,
  };
}

function wordEntry(overrides: Partial<HighlightMapV2Entry> = {}): HighlightMapV2Entry {
  const tokenIndex = overrides.tokenIndex ?? 0;
  const entryId = overrides.tokenIndex === null ? "entry-block" : `entry-${tokenIndex.toString()}`;
  return {
    alignedEndMs: overrides.audioEndMs ?? 300,
    alignedStartMs: overrides.audioStartMs ?? 0,
    alignmentWarnings: [],
    audioEndMs: 300,
    audioStartMs: 0,
    confidence: 0.96,
    contentIrVersion: "content-ir.v1",
    driftBudgetMs: 150,
    entryId,
    fallbackMode: "none",
    fragmentIndex: 0,
    generatedAudioId: "audio",
    level: "word",
    nodeId: "node-1",
    normalizedText: "Dr",
    providerTimingEndMs: overrides.audioEndMs ?? 300,
    providerTimingStartMs: overrides.audioStartMs ?? 0,
    rawText: "Dr",
    scopeKey: "document",
    segmentId: "seg-1",
    sentenceIndex: 0,
    sourceId: "source",
    sourceLocator: locator(),
    speechPlanId: "speech-plan",
    spokenText: "Doctor",
    textQuote: "Dr Nguyen shipped v1.",
    timingSource: "provider-word",
    tokenIndex,
    traceability: { policyTransform: "lexicon" },
    ...overrides,
  };
}

function contentIrDocument(): ContentIRDocument {
  return {
    adapterVersion: "test",
    generatedAt: "2026-05-26T06:14:00Z",
    id: "source",
    nodes: [
      {
        adapterVersion: "test",
        confidence: 1,
        dir: "ltr",
        displayText: "Dr Nguyen shipped v1.",
        kind: "body",
        lang: "en",
        normalisedText: "Dr Nguyen shipped v1.",
        nodeId: "node-1",
        orderKey: "0001",
        parentId: "",
        provenance: {
          format: "markdown",
          locator: locator(),
          offsets: { end: 21, start: 0 },
          sourceId: "source",
        },
        rights: { notes: "", status: "unknown" },
        role: "body",
        script: "Latn",
        speech: {
          policyHint: {
            emphasis: "",
            mode: "speak",
            pauseAfterMs: 0,
            pauseBeforeMs: 0,
          },
          speechPolicy: {
            explanation: "prose",
            mode: "speak",
            profile: "Enterprise",
          },
        },
        speechText: "Doctor Nguyen shipped version one.",
        ui: {
          highlightUnitHint: "segment",
          progressionHint: "linear",
        },
        warnings: [],
      },
    ],
    projectId: "project",
    schemaVersion: "content-ir.v1",
    sourceId: "source",
    sourceName: "Source",
    sourceType: "markdown",
  };
}

function speechPlanDocument(): SpeechPlanDocument {
  return {
    generatedAt: "2026-05-26T06:14:00Z",
    id: "speech-plan",
    projectId: "project",
    schemaVersion: "speech-plan.v1",
    segments: [
      {
        index: 1,
        lang: "en",
        locatorEnvelope: {
          kind: "highlight",
          locator: locator(),
          nodeId: "node-1",
          schemaVersion: "locator-envelope.v1",
          sourceId: "source",
        },
        nodeId: "node-1",
        policyTrace: [{ profile: "Enterprise", scope: "projectOverride" }],
        segmentId: "seg-1",
        serializerTargets: {
          highlightMarks: [],
          plainText: "Doctor Nguyen shipped version one.",
        },
        speechPolicy: {
          explanation: "prose",
          mode: "speak",
          profile: "Enterprise",
        },
        text: "Doctor Nguyen shipped version one.",
      },
    ],
    sourceId: "source",
  };
}

function locator(): ContentIRLocator {
  return {
    markdown: {
      astPath: "/children/1",
      columnEnd: 22,
      columnStart: 1,
      lineEnd: 3,
      lineStart: 3,
      path: "contract.md",
    },
    type: "markdown",
  };
}
