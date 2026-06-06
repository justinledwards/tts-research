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
}

export function resolvePreparedSourceNarrationText(
  source: PreparedSource,
  options: PreparedSourceNarrationTextOptions,
): string {
  if (options.applyReviewSession && options.useCanonicalPreviewPlan) {
    return options.canonicalPreviewSpeechPlan.text;
  }
  if (options.applyReviewSession && options.reviewedNarrationSpeechText.trim()) {
    return options.reviewedNarrationSpeechText;
  }
  return source.speechText ?? "";
}

export interface PreparedSourceSelectedBlockIdsOptions {
  applyReviewSession: boolean;
  useCanonicalPreviewPlan: boolean;
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan;
  narrationPreviewBlocks: RevisionBlock[];
}

export function resolvePreparedSourceNarrationSelectedBlockIds(
  source: PreparedSource,
  options: PreparedSourceSelectedBlockIdsOptions,
): string[] {
  if (options.applyReviewSession && options.useCanonicalPreviewPlan) {
    return options.canonicalPreviewSpeechPlan.blockIds;
  }

  if (options.applyReviewSession) {
    return options.narrationPreviewBlocks
      .filter((block) => revisionBlockIsSpeakable(block))
      .map((block) => block.id);
  }

  return (source.blocks ?? [])
    .filter((block) => narrationBlockIsPreparedSelectionSpeakable(block))
    .map((block) => block.id);
}

export function shouldUseCanonicalPreviewPlanForPreparedSourceNarration(
  applyReviewSession: boolean,
  canonicalPreviewSpeechPlan: CanonicalPreviewSpeechPlan,
): boolean {
  return applyReviewSession && canonicalPreviewSpeechPlanHasBlocks(canonicalPreviewSpeechPlan);
}
