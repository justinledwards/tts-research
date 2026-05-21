export const REVISION_TAB_IDS = [
  "overview",
  "blocks",
  "pronunciation",
  "diagnostics",
  "history",
] as const;

export type RevisionTabId = (typeof REVISION_TAB_IDS)[number];

export type RevisionStatus =
  | "approved"
  | "needsReview"
  | "regenerating"
  | "retrying"
  | "skipped"
  | "waiting";

export type RevisionPolicyNoteType =
  | "admonition"
  | "caption"
  | "citation"
  | "code"
  | "list"
  | "literal"
  | "math"
  | "onDemand"
  | "quote"
  | "skipped"
  | "spoken"
  | "summarized"
  | "table";

export type RevisionConfidenceFilter = "all" | "high" | "low" | "medium";
export type RevisionAttentionFilter = "all" | "no" | "yes";

export interface RevisionBlock {
  confidence: number | null;
  estimatedDurationMs: number;
  id: string;
  index: number;
  kind: string;
  label: string;
  mathSpeech?: string;
  needsAttention: boolean;
  normalisationCount: number;
  policyNote: string;
  policyNoteType: RevisionPolicyNoteType;
  pronunciationCount: number;
  segmentCount: number;
  sourceSection: string;
  speakMode: string;
  spokenText: string;
  status: RevisionStatus;
  text: string;
  warnings: string[];
}

export interface RevisionFilterState {
  confidence: RevisionConfidenceFilter;
  needsAttention: RevisionAttentionFilter;
  policyNoteType: RevisionPolicyNoteType | "all";
  search: string;
  sourceSection: string;
  status: RevisionStatus | "all";
}

export interface RevisionFilterOptions {
  policyNoteTypes: RevisionPolicyNoteType[];
  sourceSections: string[];
  statuses: RevisionStatus[];
}

export interface RevisionSummary {
  approved: number;
  averageConfidence: number | null;
  estimatedDurationMs: number;
  needsAttention: number;
  pronunciationItems: number;
  skipped: number;
  total: number;
}

export const DEFAULT_REVISION_FILTERS: RevisionFilterState = {
  confidence: "all",
  needsAttention: "all",
  policyNoteType: "all",
  search: "",
  sourceSection: "all",
  status: "all",
};

export function revisionFiltersAreDefault(filters: RevisionFilterState): boolean {
  return (
    filters.confidence === DEFAULT_REVISION_FILTERS.confidence &&
    filters.needsAttention === DEFAULT_REVISION_FILTERS.needsAttention &&
    filters.policyNoteType === DEFAULT_REVISION_FILTERS.policyNoteType &&
    filters.search.trim() === DEFAULT_REVISION_FILTERS.search &&
    filters.sourceSection === DEFAULT_REVISION_FILTERS.sourceSection &&
    filters.status === DEFAULT_REVISION_FILTERS.status
  );
}

export const REVISION_STATUS_LABELS: Record<RevisionStatus, string> = {
  approved: "Approved",
  needsReview: "Needs review",
  regenerating: "Regenerating",
  retrying: "Retrying",
  skipped: "Skipped",
  waiting: "Waiting",
};

export const REVISION_POLICY_NOTE_LABELS: Record<RevisionPolicyNoteType, string> = {
  admonition: "Admonition",
  caption: "Caption",
  citation: "Citation",
  code: "Code",
  list: "List",
  literal: "Literal",
  math: "Math",
  onDemand: "On demand",
  quote: "Quote",
  skipped: "Skipped",
  spoken: "Spoken",
  summarized: "Summarized",
  table: "Table",
};

export const REVISION_TAB_LABELS: Record<RevisionTabId, string> = {
  blocks: "Blocks",
  diagnostics: "Diagnostics",
  history: "History",
  overview: "Overview",
  pronunciation: "Pronunciation",
};

const REVISION_STATUS_ORDER: RevisionStatus[] = [
  "needsReview",
  "retrying",
  "regenerating",
  "waiting",
  "approved",
  "skipped",
];

const REVISION_POLICY_NOTE_ORDER: RevisionPolicyNoteType[] = [
  "skipped",
  "summarized",
  "onDemand",
  "literal",
  "code",
  "table",
  "citation",
  "math",
  "caption",
  "quote",
  "list",
  "admonition",
  "spoken",
];

export function normalizeRevisionTabId(
  value: unknown,
  fallback: RevisionTabId = "overview",
): RevisionTabId {
  return REVISION_TAB_IDS.includes(value as RevisionTabId) ? (value as RevisionTabId) : fallback;
}

export function deriveRevisionBlockStatus(
  input: Readonly<{
    confidence?: number | null;
    speakMode?: string | null;
    warnings?: readonly string[] | null;
  }>,
): RevisionStatus {
  const speakMode = input.speakMode?.toLowerCase() ?? "";
  if (speakMode === "skip") {
    return "skipped";
  }
  if ((input.warnings?.length ?? 0) > 0) {
    return "needsReview";
  }
  if (typeof input.confidence === "number" && input.confidence > 0 && input.confidence < 0.74) {
    return "needsReview";
  }
  return "waiting";
}

export function normalizeRevisionPolicyNoteType(value: unknown): RevisionPolicyNoteType {
  const normalized = normalizePolicyToken(value)
    .trim()
    .toLowerCase()
    .replaceAll(/[\s_-]+/g, "");
  if (normalized.includes("admonition")) {
    return "admonition";
  }
  if (normalized.includes("caption")) {
    return "caption";
  }
  if (normalized.includes("citation") || normalized.includes("cite")) {
    return "citation";
  }
  if (normalized.includes("code")) {
    return "code";
  }
  if (normalized.includes("list")) {
    return "list";
  }
  if (normalized.includes("literal") || normalized.includes("spell")) {
    return "literal";
  }
  if (normalized.includes("math") || normalized.includes("formula")) {
    return "math";
  }
  if (normalized.includes("ondemand") || normalized.includes("interactive")) {
    return "onDemand";
  }
  if (normalized.includes("quote")) {
    return "quote";
  }
  if (normalized.includes("skip")) {
    return "skipped";
  }
  if (
    normalized.includes("summary") ||
    normalized.includes("summaris") ||
    normalized.includes("summariz")
  ) {
    return "summarized";
  }
  if (normalized.includes("table")) {
    return "table";
  }
  return "spoken";
}

export function filterRevisionBlocks(
  blocks: readonly RevisionBlock[],
  filters: RevisionFilterState,
): RevisionBlock[] {
  const search = filters.search.trim().toLowerCase();
  return blocks.filter((block) => {
    if (filters.status !== "all" && block.status !== filters.status) {
      return false;
    }
    if (filters.sourceSection !== "all" && block.sourceSection !== filters.sourceSection) {
      return false;
    }
    if (filters.policyNoteType !== "all" && block.policyNoteType !== filters.policyNoteType) {
      return false;
    }
    if (filters.needsAttention === "yes" && !block.needsAttention) {
      return false;
    }
    if (filters.needsAttention === "no" && block.needsAttention) {
      return false;
    }
    if (filters.confidence !== "all" && confidenceBand(block.confidence) !== filters.confidence) {
      return false;
    }
    if (search && !revisionBlockMatchesSearch(block, search)) {
      return false;
    }
    return true;
  });
}

export function buildRevisionFilterOptions(
  blocks: readonly RevisionBlock[],
): RevisionFilterOptions {
  const statuses = new Set<RevisionStatus>();
  const sourceSections = new Set<string>();
  const policyNoteTypes = new Set<RevisionPolicyNoteType>();
  for (const block of blocks) {
    statuses.add(block.status);
    sourceSections.add(block.sourceSection);
    policyNoteTypes.add(block.policyNoteType);
  }
  return {
    policyNoteTypes: REVISION_POLICY_NOTE_ORDER.filter((type) => policyNoteTypes.has(type)),
    sourceSections: sortRevisionLabels(sourceSections),
    statuses: REVISION_STATUS_ORDER.filter((status) => statuses.has(status)),
  };
}

function sortRevisionLabels(values: Iterable<string>): string[] {
  const sorted: string[] = [];
  for (const value of values) {
    const insertIndex = sorted.findIndex((item) => value.localeCompare(item) < 0);
    if (insertIndex === -1) {
      sorted.push(value);
    } else {
      sorted.splice(insertIndex, 0, value);
    }
  }
  return sorted;
}

function normalizePolicyToken(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

export function summarizeRevisionBlocks(blocks: readonly RevisionBlock[]): RevisionSummary {
  const confidenceValues = blocks
    .map((block) => block.confidence)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return {
    approved: blocks.filter((block) => block.status === "approved").length,
    averageConfidence:
      confidenceValues.length > 0
        ? confidenceValues.reduce((total, value) => total + value, 0) / confidenceValues.length
        : null,
    estimatedDurationMs: blocks.reduce((total, block) => total + block.estimatedDurationMs, 0),
    needsAttention: blocks.filter((block) => block.needsAttention).length,
    pronunciationItems: blocks.reduce(
      (total, block) => total + block.pronunciationCount + block.normalisationCount,
      0,
    ),
    skipped: blocks.filter((block) => block.status === "skipped").length,
    total: blocks.length,
  };
}

export function confidenceBand(value: number | null): Exclude<RevisionConfidenceFilter, "all"> {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "low";
  }
  if (value >= 0.88) {
    return "high";
  }
  if (value >= 0.74) {
    return "medium";
  }
  return "low";
}

function revisionBlockMatchesSearch(block: RevisionBlock, search: string): boolean {
  return [
    block.id,
    block.kind,
    block.label,
    block.policyNote,
    block.sourceSection,
    block.speakMode,
    block.spokenText,
    block.text,
    ...block.warnings,
  ]
    .join(" ")
    .toLowerCase()
    .includes(search);
}
