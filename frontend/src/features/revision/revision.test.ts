import { describe, expect, it } from "vitest";
import { applyRevisionBatchAction } from "./revisionBatchActions";
import {
  DEFAULT_REVISION_FILTERS,
  deriveRevisionBlockStatus,
  filterRevisionBlocks,
  normalizeRevisionPolicyNoteType,
  revisionFiltersAreDefault,
  summarizeRevisionBlocks,
  type RevisionBlock,
} from "./revisionFilters";

const blocks: RevisionBlock[] = [
  block({
    confidence: 0.95,
    id: "a",
    label: "Intro",
    policyNoteType: "spoken",
    sourceSection: "Chapter 1",
  }),
  block({
    confidence: 0.62,
    id: "b",
    label: "Equation",
    needsAttention: true,
    policyNote: "Math is spoken semantically.",
    policyNoteType: "math",
    sourceSection: "Chapter 1",
    status: "needsReview",
    warnings: ["Low confidence"],
  }),
  block({
    id: "c",
    label: "Citation",
    policyNoteType: "citation",
    sourceSection: "Notes",
    status: "skipped",
  }),
];

describe("revision filters", () => {
  it("filters by search, status, policy note, confidence, and attention", () => {
    expect(
      filterRevisionBlocks(blocks, {
        ...DEFAULT_REVISION_FILTERS,
        confidence: "low",
        needsAttention: "yes",
        policyNoteType: "math",
        search: "semantic",
        status: "needsReview",
      }).map((item) => item.id),
    ).toEqual(["b"]);
  });

  it("treats trimmed empty search as the default filter state", () => {
    expect(revisionFiltersAreDefault(DEFAULT_REVISION_FILTERS)).toBe(true);
    expect(revisionFiltersAreDefault({ ...DEFAULT_REVISION_FILTERS, search: "   " })).toBe(true);
    expect(revisionFiltersAreDefault({ ...DEFAULT_REVISION_FILTERS, status: "needsReview" })).toBe(
      false,
    );
  });

  it("summarizes revision health", () => {
    const summary = summarizeRevisionBlocks(blocks);

    expect(summary.averageConfidence).toBeCloseTo(0.823, 3);
    expect(summary).toMatchObject({
      needsAttention: 1,
      skipped: 1,
      total: 3,
    });
  });

  it("normalizes policy note types from source decisions", () => {
    expect(normalizeRevisionPolicyNoteType("on-demand citation")).toBe("citation");
    expect(normalizeRevisionPolicyNoteType("table_summary")).toBe("summarized");
    expect(normalizeRevisionPolicyNoteType("syntax-aware code")).toBe("code");
  });

  it("derives status from skipped blocks, warnings, and low confidence", () => {
    expect(deriveRevisionBlockStatus({ speakMode: "skip" })).toBe("skipped");
    expect(deriveRevisionBlockStatus({ warnings: ["needs review"] })).toBe("needsReview");
    expect(deriveRevisionBlockStatus({ confidence: 0.5 })).toBe("needsReview");
    expect(deriveRevisionBlockStatus({ confidence: 0.92 })).toBe("waiting");
  });
});

describe("revision batch actions", () => {
  it("updates selected block status and records history", () => {
    const result = applyRevisionBatchAction({
      actionId: "approveSelected",
      blocks,
      context: {
        policyProfile: "Technical Docs",
        runConfiguration: "Checked Master",
        voiceProfile: "Default voice",
      },
      selectedBlockIds: new Set(["a", "b"]),
      statusByBlockId: {},
    });

    expect(result.statusByBlockId).toMatchObject({ a: "approved", b: "approved" });
    expect(result.historyEntries).toHaveLength(2);
    expect(result.statusMessage).toContain("2 blocks");
  });
});

function block(overrides: Partial<RevisionBlock>): RevisionBlock {
  return {
    confidence: 0.9,
    estimatedDurationMs: 1200,
    id: "block",
    index: 1,
    kind: "body",
    label: "Block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken as prose.",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Body",
    speakMode: "speak",
    spokenText: "Spoken text.",
    status: "waiting",
    text: "Source text.",
    warnings: [],
    ...overrides,
  };
}
