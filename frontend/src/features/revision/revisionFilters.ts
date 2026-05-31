import type { NormalisationDecision, PronunciationDecision } from "../../types";

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
export type RevisionTriageCategory =
  | "audioBlocker"
  | "clean"
  | "policyTransform"
  | "pronunciation"
  | "questionable"
  | "skipped";
export type RevisionPreviewReadiness = "ready" | "warning";

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
  normalisations?: readonly NormalisationDecision[];
  policyNote: string;
  policyNoteType: RevisionPolicyNoteType;
  pronunciationCount: number;
  pronunciations?: readonly PronunciationDecision[];
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

export interface RevisionTriageItem {
  block: RevisionBlock;
  category: RevisionTriageCategory;
  reason: string;
  severity: number;
}

export interface RevisionTriageGroup {
  category: RevisionTriageCategory;
  items: RevisionTriageItem[];
}

export interface RevisionHealthSummary extends RevisionSummary {
  audioBlockers: number;
  clean: number;
  needsRepair: number;
  policyTransforms: number;
  pronunciationBlocks: number;
  previewReadiness: RevisionPreviewReadiness;
  previewWarnings: number;
  questionable: number;
  ready: number;
}

export interface RevisionSessionState {
  editedTextByBlockId: Readonly<Record<string, string>>;
  statusByBlockId: Readonly<Record<string, RevisionStatus>>;
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

export const REVISION_TRIAGE_LABELS: Record<RevisionTriageCategory, string> = {
  audioBlocker: "Audio blockers",
  clean: "Clean blocks",
  policyTransform: "Policy transformations",
  pronunciation: "Pronunciation repair",
  questionable: "Questionable blocks",
  skipped: "Skipped content",
};

export const REVISION_TRIAGE_DESCRIPTIONS: Record<RevisionTriageCategory, string> = {
  audioBlocker: "These blocks cannot move cleanly into generation until repaired or retried.",
  clean: "These blocks have no detected review issues.",
  policyTransform: "These blocks were changed by speech policy and may only need confirmation.",
  pronunciation: "These blocks contain pronunciation or normalization decisions to verify.",
  questionable: "These blocks have warnings, low confidence, or an attention flag.",
  skipped: "These blocks are intentionally silent or excluded by policy.",
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

const REVISION_TRIAGE_ORDER: RevisionTriageCategory[] = [
  "audioBlocker",
  "pronunciation",
  "questionable",
  "policyTransform",
  "skipped",
  "clean",
];

const REVISION_TRIAGE_SEVERITY: Record<RevisionTriageCategory, number> = Object.fromEntries(
  REVISION_TRIAGE_ORDER.map((category, index) => [category, index]),
) as Record<RevisionTriageCategory, number>;

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
    skipped: blocks.filter((block) => revisionBlockIsSkipped(block)).length,
    total: blocks.length,
  };
}

export function applyRevisionSessionState(
  blocks: readonly RevisionBlock[],
  sessionState: RevisionSessionState,
): RevisionBlock[] {
  return blocks.map((block) => ({
    ...block,
    spokenText: sessionState.editedTextByBlockId[block.id] ?? block.spokenText,
    status: sessionState.statusByBlockId[block.id] ?? block.status,
  }));
}

export function composeReviewedSpeechText(blocks: readonly RevisionBlock[]): string {
  return blocks
    .filter((block) => !revisionBlockIsSkipped(block))
    .map((block) => block.spokenText.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function revisionBlockTriageCategory(block: RevisionBlock): RevisionTriageCategory {
  if (block.status === "retrying" || block.status === "regenerating") {
    return "audioBlocker";
  }
  if (!revisionBlockIsSkipped(block) && block.spokenText.trim().length === 0) {
    return "audioBlocker";
  }
  if (block.status === "needsReview") {
    return "questionable";
  }
  if (revisionBlockIsSkipped(block)) {
    return "skipped";
  }
  if (block.status === "approved") {
    return "clean";
  }
  if (block.pronunciationCount > 0 || block.normalisationCount > 0) {
    return "pronunciation";
  }
  if (
    block.needsAttention ||
    block.warnings.length > 0 ||
    confidenceBand(block.confidence) === "low"
  ) {
    return "questionable";
  }
  if (revisionBlockHasPolicyTransform(block)) {
    return "policyTransform";
  }
  return "clean";
}

export function revisionBlockTriageReason(block: RevisionBlock): string {
  const category = revisionBlockTriageCategory(block);
  switch (category) {
    case "audioBlocker": {
      if (block.status === "retrying") {
        return "Retry is queued for this block.";
      }
      if (block.status === "regenerating") {
        return "Regeneration is queued for this block.";
      }
      return "No spoken form is available for generation.";
    }
    case "pronunciation": {
      const total = block.pronunciationCount + block.normalisationCount;
      return `${total.toLocaleString()} pronunciation or normalization decision${total === 1 ? "" : "s"} to verify.`;
    }
    case "questionable": {
      if (block.warnings.length > 0) {
        return block.warnings[0];
      }
      if (confidenceBand(block.confidence) === "low") {
        return `Low confidence: ${formatRevisionConfidence(block.confidence)}.`;
      }
      return "Marked as needing review.";
    }
    case "skipped": {
      return block.policyNote || "Skipped by speech policy.";
    }
    case "policyTransform": {
      return (
        block.policyNote ||
        `${REVISION_POLICY_NOTE_LABELS[block.policyNoteType]} policy changed this block.`
      );
    }
    case "clean": {
      return block.status === "approved" ? "Approved for preview." : "No detected review issues.";
    }
  }
}

export function buildRevisionTriageItems(blocks: readonly RevisionBlock[]): RevisionTriageItem[] {
  const items: RevisionTriageItem[] = [];
  for (const block of blocks) {
    const category = revisionBlockTriageCategory(block);
    const item = {
      block,
      category,
      reason: revisionBlockTriageReason(block),
      severity: REVISION_TRIAGE_SEVERITY[category],
    };
    const insertIndex = items.findIndex(
      (candidate) => compareRevisionTriageItems(item, candidate) < 0,
    );
    if (insertIndex === -1) {
      items.push(item);
    } else {
      items.splice(insertIndex, 0, item);
    }
  }
  return items;
}

function compareRevisionTriageItems(left: RevisionTriageItem, right: RevisionTriageItem): number {
  return left.severity - right.severity || left.block.index - right.block.index;
}

export function groupRevisionTriageItems(
  items: readonly RevisionTriageItem[],
): RevisionTriageGroup[] {
  return REVISION_TRIAGE_ORDER.map((category) => ({
    category,
    items: items.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);
}

export function summarizeRevisionHealth(blocks: readonly RevisionBlock[]): RevisionHealthSummary {
  const summary = summarizeRevisionBlocks(blocks);
  const items = buildRevisionTriageItems(blocks);
  const countCategory = (category: RevisionTriageCategory) =>
    items.filter((item) => item.category === category).length;
  const audioBlockers = countCategory("audioBlocker");
  const clean = countCategory("clean");
  const policyTransforms = countCategory("policyTransform");
  const pronunciation = countCategory("pronunciation");
  const questionable = countCategory("questionable");
  const previewWarnings = audioBlockers + policyTransforms + pronunciation + questionable;
  const ready = clean;
  return {
    ...summary,
    audioBlockers,
    clean,
    needsRepair: audioBlockers + pronunciation + questionable,
    policyTransforms,
    pronunciationBlocks: pronunciation,
    previewReadiness: previewWarnings > 0 ? "warning" : "ready",
    previewWarnings,
    questionable,
    ready,
  };
}

export function revisionPreviewReadinessLabel(summary: RevisionHealthSummary): string {
  if (summary.previewReadiness === "ready") {
    return "Preview ready";
  }
  if (summary.audioBlockers > 0) {
    return `${summary.audioBlockers.toLocaleString()} blocker${summary.audioBlockers === 1 ? "" : "s"} before clean preview`;
  }
  return `${summary.previewWarnings.toLocaleString()} review warning${summary.previewWarnings === 1 ? "" : "s"} before clean preview`;
}

export function revisionNextActionLabel(summary: RevisionHealthSummary): string {
  if (summary.audioBlockers > 0) {
    return "Repair blockers";
  }
  if (summary.pronunciationBlocks > 0) {
    return "Verify pronunciation";
  }
  if (summary.questionable > 0) {
    return "Review flagged blocks";
  }
  if (summary.policyTransforms > 0) {
    return "Confirm policy transforms";
  }
  return "Preview Speech";
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

export function revisionBlockIsSkipped(block: RevisionBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  return block.status === "skipped" || speakMode === "skip" || block.policyNoteType === "skipped";
}

export function revisionBlockHasPolicyTransform(block: RevisionBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  return block.policyNoteType !== "spoken" || (speakMode.length > 0 && speakMode !== "speak");
}

function formatRevisionConfidence(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "waiting";
  }
  return `${Math.round(value * 100).toString()}%`;
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
