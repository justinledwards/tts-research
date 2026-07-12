import { describe, expect, it } from "vitest";
import { buildCanonicalPreviewSpeechPlan } from "./revisionSpeechPlan";
import type { RevisionBlock } from "./revisionFilters";
import { shouldUseCanonicalPreviewPlanForBookNarration } from "./bookNarration";

interface ScopeContent {
  blocks?: { id: string }[];
}

function buildRevisionBlock(overrides: Partial<RevisionBlock> = {}): RevisionBlock {
  return {
    confidence: 0.97,
    estimatedDurationMs: 42,
    endOffset: 24,
    id: "revision-block-id",
    index: 1,
    kind: "body",
    label: "Revision block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Body",
    speakMode: "speak",
    spokenText: "Revision block text",
    startOffset: 0,
    status: "waiting",
    text: "Revision block text",
    warnings: [],
    ...overrides,
  };
}

function makeScopeContent(scopeBlockIds: string[]): ScopeContent {
  return {
    blocks: scopeBlockIds.map((id) => ({ id })),
  };
}

describe("book narration canonical-plan eligibility", () => {
  it("accepts canonical preview plan when scope matches and block IDs align", () => {
    const plan = buildCanonicalPreviewSpeechPlan([
      buildRevisionBlock({ id: "scope-block-1" }),
      buildRevisionBlock({ id: "scope-block-2", index: 2 }),
    ]);
    const scopeContent = makeScopeContent(["scope-block-1", "scope-block-2"]);
    const canUse = shouldUseCanonicalPreviewPlanForBookNarration({
      applyReviewSession: true,
      canonicalPreviewSpeechPlan: plan,
      bookScopeContent: scopeContent,
      isMatchingScopeContent: true,
    });
    expect(canUse).toBe(true);
  });

  it("rejects canonical preview plan when scope IDs do not match", () => {
    const plan = buildCanonicalPreviewSpeechPlan([buildRevisionBlock({ id: "book-0" })]);
    const scopeContent = makeScopeContent(["scope-block-1"]);
    const canUse = shouldUseCanonicalPreviewPlanForBookNarration({
      applyReviewSession: true,
      canonicalPreviewSpeechPlan: plan,
      bookScopeContent: scopeContent,
      isMatchingScopeContent: true,
    });
    expect(canUse).toBe(false);
  });

  it("rejects canonical preview plan when scope content is unavailable", () => {
    const plan = buildCanonicalPreviewSpeechPlan([buildRevisionBlock({ id: "scope-block-1" })]);
    const canUse = shouldUseCanonicalPreviewPlanForBookNarration({
      applyReviewSession: true,
      canonicalPreviewSpeechPlan: plan,
      bookScopeContent: null,
      isMatchingScopeContent: false,
    });
    expect(canUse).toBe(false);
  });

  it("rejects canonical preview plan when revision session is inactive", () => {
    const plan = buildCanonicalPreviewSpeechPlan([buildRevisionBlock()]);
    const scopeContent = makeScopeContent(["revision-block-id"]);
    const canUse = shouldUseCanonicalPreviewPlanForBookNarration({
      applyReviewSession: false,
      canonicalPreviewSpeechPlan: plan,
      bookScopeContent: scopeContent,
      isMatchingScopeContent: true,
    });
    expect(canUse).toBe(false);
  });
});
