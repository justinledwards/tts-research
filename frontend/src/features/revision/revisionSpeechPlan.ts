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

export function previewSpeechPlanMatchesJobText(
  plan: CanonicalPreviewSpeechPlan,
  ...jobTexts: (string | null | undefined)[]
): boolean {
  const planText = normalizePreviewSpeechPlanText(plan.text);
  return jobTexts.some((text) => normalizePreviewSpeechPlanText(text ?? "") === planText);
}

export function previewSpeechPlanJobTextIsStale(
  plan: CanonicalPreviewSpeechPlan,
  job:
    | Readonly<{ inputText?: string | null; optimizedText?: string | null; status?: string }>
    | null
    | undefined,
): boolean {
  return (
    job?.status === "completed" &&
    canonicalPreviewSpeechPlanHasBlocks(plan) &&
    !previewSpeechPlanMatchesJobText(plan, job.optimizedText, job.inputText)
  );
}
