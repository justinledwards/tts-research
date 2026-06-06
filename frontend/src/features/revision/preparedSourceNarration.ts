import type { CanonicalPreviewSpeechPlan } from "./revisionSpeechPlan";
import { canonicalPreviewSpeechPlanHasBlocks } from "./revisionSpeechPlan";
import { revisionBlockIsSpeakable, revisionTextIsStandaloneArtifactToken } from "./revisionFilters";
import type { NarrationBlock, PreparedSource } from "../../types";
import type { RevisionBlock } from "./revisionFilters";

export function narrationBlockIsPreparedSelectionSpeakable(block: NarrationBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  const policyMode = block.speechPolicy.mode.trim().toLowerCase();
  return (
    speakMode !== "skip" &&
    policyMode !== "skip" &&
    policyMode !== "ondemand" &&
    (block.spokenText ?? "").trim().length > 0 &&
    !revisionTextIsStandaloneArtifactToken(block.spokenText ?? block.text ?? block.label ?? "")
  );
}

export interface PreparedSourceNarrationTextOptions {
  applyReviewSession: boolean;
  reviewedNarrationSpeechText: string;
  useCanonicalPreviewPlan: boolean;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  narrationPreviewBlocks?: readonly RevisionBlock[];
}

export function resolvePreparedSourceNarrationText(
  source: PreparedSource,
  options: PreparedSourceNarrationTextOptions,
): string {
  const narrationPreviewBlocks = options.narrationPreviewBlocks ?? [];
  const selectedPreviewBlockIds = dedupeAndTrimOrderedBlockIds(
    options.applyReviewSession ? narrationPreviewBlocks.map((block) => block.id) : [],
  );
  const selectedBlockSource = source.blocks ?? [];
  if (options.applyReviewSession && options.useCanonicalPreviewPlan) {
    const sourceBlockById = new Map(
      selectedBlockSource.map((block) => {
        return [block.id, block] as const;
      }),
    );
    const canonicalBlockIds = dedupeAndTrimOrderedBlockIds(
      options.canonicalPreviewSpeechPlan.blockIds,
    );

    if (
      canonicalBlockIds.length === options.canonicalPreviewSpeechPlan.blockIds.length &&
      canonicalBlockIds.every((blockId) => {
        const block = sourceBlockById.get(blockId);
        return block ? narrationBlockIsPreparedSelectionSpeakable(block) : false;
      })
    ) {
      return options.canonicalPreviewSpeechPlan.text;
    }
    const canonicalFallbackBlockIds = resolvePreparedSourceNarrationSelectedBlockIds(source, {
      applyReviewSession: options.applyReviewSession,
      useCanonicalPreviewPlan: options.useCanonicalPreviewPlan,
      canonicalPreviewSpeechPlan: options.canonicalPreviewSpeechPlan,
      narrationPreviewBlocks,
    });
    const fallbackText = selectedBlockIdsToSpeechText(source, canonicalFallbackBlockIds, {
      applyReviewSession: options.applyReviewSession,
      narrationPreviewBlocks,
    });
    if (fallbackText.trim()) {
      return fallbackText;
    }
  }
  if (options.applyReviewSession && options.reviewedNarrationSpeechText.trim()) {
    return options.reviewedNarrationSpeechText;
  }
  if (options.applyReviewSession && selectedPreviewBlockIds.length > 0) {
    const fallbackBlockIds = resolvePreparedSourceNarrationSelectedBlockIds(source, {
      applyReviewSession: options.applyReviewSession,
      useCanonicalPreviewPlan: options.useCanonicalPreviewPlan,
      canonicalPreviewSpeechPlan: options.canonicalPreviewSpeechPlan,
      narrationPreviewBlocks,
    });
    const fallbackSpeechText = selectedBlockIdsToSpeechText(source, fallbackBlockIds, {
      applyReviewSession: options.applyReviewSession,
      narrationPreviewBlocks,
    });
    if (fallbackSpeechText) {
      return fallbackSpeechText;
    }
    return source.speechText ?? "";
  }
  return source.speechText ?? "";
}

export interface PreparedSourceSelectedBlockIdsOptions {
  applyReviewSession: boolean;
  useCanonicalPreviewPlan: boolean;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  narrationPreviewBlocks: readonly RevisionBlock[];
  fallbackSelectedBlockIds?: readonly string[];
}

function dedupeAndTrimOrderedBlockIds(blockIds: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const blockId of blockIds) {
    const next = blockId.trim();
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
    deduped.push(next);
  }

  return deduped;
}

export function resolvePreparedSourceNarrationSelectedBlockIds(
  source: PreparedSource,
  options: PreparedSourceSelectedBlockIdsOptions,
): string[] {
  const sourceBlocks = source.blocks ?? [];
  const sourceBlockById = new Map(
    sourceBlocks.map((block) => {
      return [block.id, block] as const;
    }),
  );
  const sourceLocalBlockIds = sourceBlocks
    .filter((block) => narrationBlockIsPreparedSelectionSpeakable(block))
    .map((block) => block.id);
  const reviewFilteredSourceLocalBlockIds = () =>
    sourceLocalBlockIds.filter((blockId) =>
      reviewSpeakableBlockIds(options.narrationPreviewBlocks).has(blockId),
    );

  if (options.applyReviewSession && options.useCanonicalPreviewPlan) {
    const canonicalBlockIds = dedupeAndTrimOrderedBlockIds(
      options.canonicalPreviewSpeechPlan.blockIds,
    );

    if (
      canonicalBlockIds.length === 0 ||
      canonicalBlockIds.length !== options.canonicalPreviewSpeechPlan.blockIds.length
    ) {
      return reviewFilteredSourceLocalBlockIds();
    }

    for (const blockId of canonicalBlockIds) {
      const block = sourceBlockById.get(blockId);
      if (!block || !narrationBlockIsPreparedSelectionSpeakable(block)) {
        return reviewFilteredSourceLocalBlockIds();
      }
    }

    return canonicalBlockIds;
  }

  if (options.applyReviewSession) {
    return dedupeAndTrimOrderedBlockIds(
      options.narrationPreviewBlocks
        .filter((block) => revisionBlockIsSpeakable(block))
        .map((block) => block.id),
    );
  }

  const fallbackSelectedBlockIds = options.fallbackSelectedBlockIds ?? [];
  if (fallbackSelectedBlockIds.length > 0) {
    const fallbackNormalized = dedupeAndTrimOrderedBlockIds(fallbackSelectedBlockIds);
    const fallbackResolved = fallbackNormalized.filter((blockId) => {
      const block = sourceBlockById.get(blockId);
      return block ? narrationBlockIsPreparedSelectionSpeakable(block) : false;
    });
    if (fallbackResolved.length > 0) {
      return fallbackResolved;
    }
  }

  return sourceLocalBlockIds;
}

interface PreparedSourceSelectionSpeechTextOptions {
  applyReviewSession: boolean;
  narrationPreviewBlocks?: readonly RevisionBlock[];
}

function selectedBlockIdsToSpeechText(
  source: PreparedSource,
  selectedBlockIds: readonly string[],
  options: PreparedSourceSelectionSpeechTextOptions,
): string {
  const sourceBlockById = new Map(
    (source.blocks ?? []).map((block) => {
      return [block.id, block] as const;
    }),
  );
  const reviewBlocks = options.narrationPreviewBlocks ?? [];
  const reviewBlockById = new Map(
    reviewBlocks.map((block) => {
      return [block.id, block] as const;
    }),
  );

  const spokenParts: string[] = [];
  for (const selectedId of dedupeAndTrimOrderedBlockIds(selectedBlockIds)) {
    const sourceBlock = sourceBlockById.get(selectedId);
    if (!sourceBlock || !narrationBlockIsPreparedSelectionSpeakable(sourceBlock)) {
      continue;
    }
    const reviewBlock = reviewBlockById.get(selectedId);
    if (options.applyReviewSession && reviewBlock && !revisionBlockIsSpeakable(reviewBlock)) {
      continue;
    }
    const spokenText = (
      options.applyReviewSession && reviewBlock
        ? reviewBlock.spokenText
        : (sourceBlock.spokenText ?? "")
    ).trim();
    if (spokenText) {
      spokenParts.push(spokenText);
    }
  }

  return spokenParts.join("\n\n");
}

function reviewSpeakableBlockIds(blocks: readonly RevisionBlock[]): Set<string> {
  return new Set(
    dedupeAndTrimOrderedBlockIds(
      blocks.filter((block) => revisionBlockIsSpeakable(block)).map((block) => block.id),
    ),
  );
}

export function shouldUseCanonicalPreviewPlanForPreparedSourceNarration(
  applyReviewSession: boolean,
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan,
): boolean {
  return applyReviewSession && canonicalPreviewSpeechPlanHasBlocks(canonicalPreviewSpeechPlan);
}
