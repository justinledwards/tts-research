import { describe, expect, it } from "vitest";
import { applyRevisionBatchAction } from "./revisionBatchActions";
import {
  DEFAULT_REVISION_FILTERS,
  applyRevisionSessionState,
  buildRevisionTriageItems,
  composeReviewedSpeechText,
  deriveRevisionBlockStatus,
  filterRevisionBlocks,
  groupRevisionTriageItems,
  normalizeRevisionPolicyNoteType,
  revisionPreviewReadinessLabel,
  revisionFiltersAreDefault,
  revisionNextActionLabel,
  summarizeRevisionHealth,
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

  it("derives repair queue severity and health from triage categories", () => {
    const triageBlocks = [
      block({
        id: "empty",
        index: 1,
        spokenText: "",
        status: "waiting",
      }),
      block({
        id: "pronunciation",
        index: 2,
        normalisationCount: 1,
        normalisations: [
          {
            endOffset: 4,
            kind: "abbreviation",
            original: "Dr.",
            rule: "doctor-title",
            spoken: "Doctor",
            startOffset: 0,
          },
        ],
        pronunciationCount: 1,
        pronunciations: [
          {
            endOffset: 9,
            originalText: "OpenAI",
            source: "project",
            spoken: "Open A I",
            startOffset: 0,
            term: "OpenAI",
          },
        ],
      }),
      block({
        id: "policy",
        index: 3,
        policyNote: "Citation is summarized for speech.",
        policyNoteType: "citation",
      }),
      block({
        id: "clean",
        index: 4,
        status: "approved",
      }),
    ];

    const items = buildRevisionTriageItems(triageBlocks);
    const groups = groupRevisionTriageItems(items);
    const summary = summarizeRevisionHealth(triageBlocks);

    expect(items.map((item) => [item.block.id, item.category])).toEqual([
      ["empty", "audioBlocker"],
      ["pronunciation", "pronunciation"],
      ["policy", "policyTransform"],
      ["clean", "clean"],
    ]);
    expect(groups.map((group) => group.category)).toEqual([
      "audioBlocker",
      "pronunciation",
      "policyTransform",
      "clean",
    ]);
    expect(summary).toMatchObject({
      audioBlockers: 1,
      needsRepair: 2,
      policyTransforms: 1,
      previewReadiness: "warning",
      previewWarnings: 3,
      pronunciationBlocks: 1,
      pronunciationItems: 2,
      ready: 1,
    });
    expect(revisionPreviewReadinessLabel(summary)).toContain("blocker");
    expect(revisionNextActionLabel(summary)).toBe("Repair blockers");
  });

  it("composes reviewed speech text from session edits and skipped decisions", () => {
    const sessionBlocks = applyRevisionSessionState(blocks, {
      editedTextByBlockId: { a: "Edited spoken intro." },
      statusByBlockId: { b: "skipped" },
    });

    expect(sessionBlocks.find((item) => item.id === "a")?.spokenText).toBe("Edited spoken intro.");
    expect(sessionBlocks.find((item) => item.id === "b")?.status).toBe("skipped");
    expect(composeReviewedSpeechText(sessionBlocks)).toBe("Edited spoken intro.");
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
