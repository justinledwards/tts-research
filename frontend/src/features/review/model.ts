export type ReviewPane = "blocks" | "script" | "validation";
export type ReviewOpenFocus = "needsRepair" | "normal";

export interface ReviewOpenFocusRequest {
  focus: ReviewOpenFocus;
  requestId: number;
}

export interface ReviewBlockLike {
  id: string;
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
