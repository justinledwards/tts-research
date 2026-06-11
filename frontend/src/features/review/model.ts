export type ReviewPane = "blocks" | "script" | "validation";
export type ReviewOpenFocus = "needsRepair" | "normal";
export type ReviewMode = "quick" | "full" | "promotion";
export type ReviewDataScope = "project" | "temporary-session";

export interface ReviewOpenFocusRequest {
  focus: ReviewOpenFocus;
  requestId: number;
}

export interface ReviewBlockLike {
  id: string;
}

export interface TemporaryReviewPromotionMapping {
  editCount: number;
  noteCount: number;
  policyPinCount: number;
  pronunciationOverrideCount: number;
  summaryItems: string[];
}

export interface TemporaryReviewStateAdapter {
  dataScope: ReviewDataScope;
  headerLabel: string;
  mode: ReviewMode;
  promotionMapping: TemporaryReviewPromotionMapping;
  statusLabel: string;
}

export interface ReviewModeBlockLike {
  normalisationCount?: number;
  policyNoteType?: string;
  pronunciationCount?: number;
  speakMode?: string;
  spokenText?: string;
  status?: string;
  warnings?: readonly string[];
}

export interface TemporaryReviewAdapterInput {
  editedTextByBlockId: Readonly<Record<string, string>>;
  mode: ReviewMode;
  noteCount?: number;
  policyPinned?: boolean;
  pronunciationOverrideCount?: number;
  sourceOwner?: string;
  statusByBlockId: Readonly<Record<string, string>>;
}

export interface ReviewPaneSummaryInput {
  blockCount: number;
  hasSpokenScript: boolean;
  validationSimilarity: number;
  validationTranscript: string;
}

export interface ReviewPaneSummary {
  detail: string;
  id: ReviewPane;
  title: string;
}

export function normalizeReviewPane(value: unknown): ReviewPane {
  if (value === "script" || value === "validation" || value === "blocks") {
    return value;
  }
  return "blocks";
}

export function normalizeReviewMode(value: unknown, temporary = false): ReviewMode {
  if (value === "full" || value === "promotion" || value === "quick") {
    return value;
  }
  return temporary ? "quick" : "full";
}

export function reviewModeLabel(mode: ReviewMode): string {
  if (mode === "promotion") {
    return "Promotion Review";
  }
  if (mode === "full") {
    return "Full Review";
  }
  return "Quick Review";
}

export function buildTemporaryReviewStateAdapter({
  editedTextByBlockId,
  mode,
  noteCount = 0,
  policyPinned = false,
  pronunciationOverrideCount = 0,
  sourceOwner,
  statusByBlockId,
}: TemporaryReviewAdapterInput): TemporaryReviewStateAdapter {
  const isTemporary = sourceOwner === "temporary";
  const editCount = Object.keys(editedTextByBlockId).length;
  const decisionCount = Object.keys(statusByBlockId).length;
  const policyPinCount = policyPinned ? 1 : 0;
  const mapping: TemporaryReviewPromotionMapping = {
    editCount,
    noteCount: Math.max(0, noteCount),
    policyPinCount,
    pronunciationOverrideCount: Math.max(0, pronunciationOverrideCount),
    summaryItems: [
      `${editCount.toLocaleString()} spoken-form edit${editCount === 1 ? "" : "s"}`,
      `${decisionCount.toLocaleString()} repair decision${decisionCount === 1 ? "" : "s"}`,
      `${Math.max(0, pronunciationOverrideCount).toLocaleString()} pronunciation override${
        pronunciationOverrideCount === 1 ? "" : "s"
      }`,
      policyPinned ? "1 session policy override" : "0 policy pins",
    ],
  };
  return {
    dataScope: isTemporary ? "temporary-session" : "project",
    headerLabel: isTemporary ? "Temporary source · Review" : "Review",
    mode: normalizeReviewMode(mode, isTemporary),
    promotionMapping: mapping,
    statusLabel: isTemporary ? "Temporary review" : "Project review",
  };
}

export function reviewBlocksForMode<T extends ReviewModeBlockLike>(
  blocks: readonly T[],
  mode: ReviewMode,
): T[] {
  if (mode === "full") {
    return [...blocks];
  }
  return blocks.filter((block) => {
    if (mode === "promotion") {
      return (
        block.status === "approved" ||
        block.status === "needsReview" ||
        block.status === "skipped" ||
        Boolean(block.pronunciationCount) ||
        Boolean(block.normalisationCount) ||
        Boolean(block.warnings?.length)
      );
    }
    return (
      block.status === "retrying" ||
      block.status === "regenerating" ||
      block.status === "needsReview" ||
      block.status === "skipped" ||
      block.speakMode === "skip" ||
      block.policyNoteType === "skipped" ||
      !block.spokenText?.trim() ||
      Boolean(block.pronunciationCount) ||
      Boolean(block.normalisationCount) ||
      Boolean(block.warnings?.length)
    );
  });
}

export function selectReviewBlockId(
  blocks: readonly ReviewBlockLike[],
  selectedBlockId: string | null,
): string | null {
  if (selectedBlockId && blocks.some((block) => block.id === selectedBlockId)) {
    return selectedBlockId;
  }
  return blocks[0]?.id ?? null;
}

export function buildReviewPaneSummaries({
  blockCount,
  hasSpokenScript,
  validationSimilarity,
  validationTranscript,
}: ReviewPaneSummaryInput): ReviewPaneSummary[] {
  return [
    {
      detail: `${blockCount.toLocaleString()} block${blockCount === 1 ? "" : "s"}`,
      id: "blocks",
      title: "Block Review",
    },
    {
      detail: hasSpokenScript ? "Listener form ready" : "Waiting for spoken form",
      id: "script",
      title: "Spoken Script",
    },
    {
      detail: validationTranscript
        ? `Transcript ready · ${formatSimilaritySummary(validationSimilarity)}`
        : "Validation appears after synthesis",
      id: "validation",
      title: "Validation Transcript",
    },
  ];
}

function formatSimilaritySummary(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "waiting";
  }
  return `${Math.round(value * 100).toString()}% match`;
}
