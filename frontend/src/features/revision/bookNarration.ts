import {
  canonicalPreviewSpeechPlanHasBlocks,
  type CanonicalPreviewSpeechPlan,
} from "./revisionSpeechPlan";

interface BookScopeContentBlock {
  id: string;
}

interface BookScopeContentForCanonicalCheck {
  blocks?: BookScopeContentBlock[];
}

export interface BookNarrationCanonicalPlanOptions {
  applyReviewSession: boolean;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  bookScopeContent: BookScopeContentForCanonicalCheck | null;
  isMatchingScopeContent: boolean;
}

export function shouldUseCanonicalPreviewPlanForBookNarration({
  applyReviewSession,
  canonicalPreviewSpeechPlan,
  bookScopeContent,
  isMatchingScopeContent,
}: BookNarrationCanonicalPlanOptions): boolean {
  if (!applyReviewSession) {
    return false;
  }
  if (!canonicalPreviewSpeechPlanHasBlocks(canonicalPreviewSpeechPlan)) {
    return false;
  }
  if (!isMatchingScopeContent || !bookScopeContent?.blocks) {
    return false;
  }
  const scopeBlockIds = new Set(bookScopeContent.blocks.map((block) => block.id));
  const candidateBlockIds = [
    ...canonicalPreviewSpeechPlan.blockIds,
    ...canonicalPreviewSpeechPlan.skippedBlockIds,
  ];
  return candidateBlockIds.every((blockId) => scopeBlockIds.has(blockId));
}
