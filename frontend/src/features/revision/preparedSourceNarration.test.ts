import { describe, expect, it } from "vitest";
import type { NarrationBlock, PreparedSource } from "../../types";
import { buildCanonicalPreviewSpeechPlan } from "./revisionSpeechPlan";
import {
  narrationBlockIsPreparedSelectionSpeakable,
  resolvePreparedSourceNarrationSelectedBlockIds,
  resolvePreparedSourceNarrationText,
  shouldUseCanonicalPreviewPlanForPreparedSourceNarration,
  type PreparedSourceNarrationTextOptions,
  type PreparedSourceSelectedBlockIdsOptions,
} from "./preparedSourceNarration";
import type { RevisionBlock } from "./revisionFilters";

function buildNarrationBlock(overrides: Partial<NarrationBlock> = {}): NarrationBlock {
  return {
    id: "source-block",
    index: 1,
    kind: "body",
    speakMode: "speak",
    text: "source block text",
    spokenText: "source block text",
    startOffset: 0,
    endOffset: 24,
    speechPolicy: {
      profile: "default",
      mode: "speak",
      explanation: "",
    },
    ...overrides,
  };
}

function buildRevisionBlock(overrides: Partial<RevisionBlock> = {}): RevisionBlock {
  return {
    id: "revision-block",
    index: 1,
    confidence: 0.95,
    endOffset: 20,
    estimatedDurationMs: 1,
    kind: "body",
    label: "Revision block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Body",
    speakMode: "speak",
    spokenText: "revision block text",
    startOffset: 0,
    status: "waiting",
    text: "revision block text",
    warnings: [],
    ...overrides,
  };
}

function buildPreparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    id: "prepared-source-1",
    projectId: "project-1",
    status: "ready",
    kind: "text",
    sourceName: "Prepared source",
    speechPolicyProfile: "default",
    text: "source text",
    speechText: "Source speech text.",
    wordCount: 3,
    blockCount: 1,
    segmentCount: 1,
    summary: {
      headingCount: 0,
      spokenBlockCount: 1,
      skippedBlockCount: 0,
      citationSkipCount: 0,
      sentenceSegmentCount: 1,
    },
    createdAt: "2020-01-01T00:00:00Z",
    updatedAt: "2020-01-01T00:00:00Z",
    blocks: [buildNarrationBlock({ id: "source-shared-id" })],
    ...overrides,
  };
}

describe("prepared source narration resolution", () => {
  const reviewedNarrationSpeechText = "Reviewed speech text from active session.";

  const revisionBlocksForCanonical = [
    buildRevisionBlock({ id: "shared-id" }),
    buildRevisionBlock({ id: "canonical-only-id" }),
  ];
  const canonicalPreviewSpeechPlan = buildCanonicalPreviewSpeechPlan(revisionBlocksForCanonical);

  it("prefers the canonical preview plan when applying the active review session", () => {
    const source = buildPreparedSource({
      blocks: [
        buildNarrationBlock({ id: "source-shared-id" }),
        buildNarrationBlock({ id: "source-only-id" }),
      ],
    });

    const speechText = resolvePreparedSourceNarrationText(source, {
      applyReviewSession: true,
      reviewedNarrationSpeechText,
      useCanonicalPreviewPlan: true,
      canonicalPreviewSpeechPlan,
    } satisfies PreparedSourceNarrationTextOptions);
    const selectedBlockIds = resolvePreparedSourceNarrationSelectedBlockIds(source, {
      applyReviewSession: true,
      useCanonicalPreviewPlan: true,
      canonicalPreviewSpeechPlan,
      narrationPreviewBlocks: revisionBlocksForCanonical,
    } satisfies PreparedSourceSelectedBlockIdsOptions);

    expect(speechText).toBe(canonicalPreviewSpeechPlan.text);
    expect(selectedBlockIds).toEqual(canonicalPreviewSpeechPlan.blockIds);
  });

  it("uses source-local narration data for inactive prepared assets", () => {
    const source = buildPreparedSource({
      speechText: "Inactive prepared source speech text.",
      blocks: [
        buildNarrationBlock({ id: "shared-id", spokenText: "Source share text." }),
        buildNarrationBlock({ id: "source-only-id", text: "Source only text." }),
      ],
    });
    const inactiveTextOptions: PreparedSourceNarrationTextOptions = {
      applyReviewSession: false,
      reviewedNarrationSpeechText: reviewedNarrationSpeechText,
      useCanonicalPreviewPlan: false,
      canonicalPreviewSpeechPlan,
    };
    const inactiveSelectedBlockOptions: PreparedSourceSelectedBlockIdsOptions = {
      applyReviewSession: false,
      useCanonicalPreviewPlan: false,
      canonicalPreviewSpeechPlan,
      narrationPreviewBlocks: revisionBlocksForCanonical,
    };
    const speechText = resolvePreparedSourceNarrationText(source, inactiveTextOptions);
    const selectedBlockIds = resolvePreparedSourceNarrationSelectedBlockIds(
      source,
      inactiveSelectedBlockOptions,
    );

    expect(speechText).toBe("Inactive prepared source speech text.");
    expect(selectedBlockIds).toEqual(["shared-id", "source-only-id"]);
  });

  it("does not use canonical preview speech when review session is inactive", () => {
    const source = buildPreparedSource({
      blocks: [buildNarrationBlock({ id: "source-block", spokenText: "source block text" })],
    });

    const shouldUseCanonical = shouldUseCanonicalPreviewPlanForPreparedSourceNarration(
      false,
      canonicalPreviewSpeechPlan,
    );
    const speechText = resolvePreparedSourceNarrationText(source, {
      applyReviewSession: false,
      reviewedNarrationSpeechText,
      useCanonicalPreviewPlan: shouldUseCanonical,
      canonicalPreviewSpeechPlan,
    });

    expect(shouldUseCanonical).toBe(false);
    expect(speechText).toBe(source.speechText);
  });

  it("identifies source-local prepared selection blocks using source filters", () => {
    expect(
      narrationBlockIsPreparedSelectionSpeakable(
        buildNarrationBlock({
          id: "skip-block",
          speakMode: "skip",
          spokenText: "This should never be selected.",
        }),
      ),
    ).toBe(false);
  });
});
