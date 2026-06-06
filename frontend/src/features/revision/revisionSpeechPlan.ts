import type { RevisionBlock } from "./revisionFilters";
import { revisionBlockIsSpeakable } from "./revisionFilters";

export interface CanonicalPreviewSpeechPlan {
  readonly blockIds: string[];
  readonly fingerprint: string;
  readonly skippedBlockIds: string[];
  readonly text: string;
}

export function buildCanonicalPreviewSpeechPlan(
  blocks: readonly RevisionBlock[],
): CanonicalPreviewSpeechPlan {
  const blockIds: string[] = [];
  const skippedBlockIds: string[] = [];
  const parts: string[] = [];

  for (const block of blocks) {
    if (!revisionBlockIsSpeakable(block)) {
      skippedBlockIds.push(block.id);
      continue;
    }
    const text = block.spokenText.trim();
    if (!text) {
      skippedBlockIds.push(block.id);
      continue;
    }
    blockIds.push(block.id);
    parts.push(text);
  }

  const text = parts.join("\n\n");
  const fingerprint = JSON.stringify({
    blockIds,
    skippedBlockIds,
    text: normalizePreviewSpeechPlanText(text),
  });

  return {
    blockIds,
    fingerprint,
    skippedBlockIds,
    text,
  };
}

export function canonicalPreviewSpeechPlanHasBlocks(plan: CanonicalPreviewSpeechPlan): boolean {
  return plan.blockIds.length + plan.skippedBlockIds.length > 0;
}

export function normalizePreviewSpeechPlanText(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ");
}

export function previewSpeechPlanMatchesJobInput(
  plan: CanonicalPreviewSpeechPlan,
  inputText: string | null | undefined,
): boolean {
  return (
    normalizePreviewSpeechPlanText(inputText ?? "") === normalizePreviewSpeechPlanText(plan.text)
  );
}

export function previewSpeechPlanJobInputIsStale(
  plan: CanonicalPreviewSpeechPlan,
  job: Readonly<{ inputText?: string | null; status?: string }> | null | undefined,
): boolean {
  return (
    job?.status === "completed" &&
    canonicalPreviewSpeechPlanHasBlocks(plan) &&
    !previewSpeechPlanMatchesJobInput(plan, job.inputText)
  );
}
