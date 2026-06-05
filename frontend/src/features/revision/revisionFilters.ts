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
  endOffset?: number;
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
  startOffset?: number;
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

export interface RevisionSpokenRepairReplacement {
  currentSpoken: string;
  original: string;
  replacement: string;
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

const REFERENCE_HEADING_LABELS = new Set([
  "bibliographies",
  "bibliography",
  "further reading",
  "reference",
  "reference list",
  "references",
  "selected references",
  "source",
  "source list",
  "sources",
  "work cited",
  "works cited",
]);

const REFERENCE_NUMBER_WORDS = new Set([
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
  "hundred",
  "thousand",
]);

const REFERENCE_URL_START_PATTERN = /\b(?:https?:\/\/|www\.|doi:|10\.\d{4,9}\/)/gi;

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

export function firstRevisionRepairBlockId(blocks: readonly RevisionBlock[]): string | null {
  const firstRepairItem = buildRevisionTriageItems(blocks).find(
    (item) => item.category !== "clean",
  );
  if (firstRepairItem) {
    return firstRepairItem.block.id;
  }
  return blocks[0]?.id ?? null;
}

export function revisionBlockIsCleanApprovable(block: RevisionBlock): boolean {
  return (
    revisionBlockTriageCategory(block) === "clean" &&
    block.status !== "approved" &&
    block.spokenText.trim().length > 0
  );
}

export function applyRevisionSpokenRepair(
  spokenText: string,
  repair: RevisionSpokenRepairReplacement,
): string {
  const replacement = repair.replacement.trim();
  if (!replacement) {
    return spokenText;
  }
  const candidates = uniqueRepairCandidates([repair.currentSpoken, repair.original]);
  for (const candidate of candidates) {
    const nextText = replaceFirstCaseInsensitive(spokenText, candidate, replacement);
    if (nextText !== spokenText) {
      return nextText;
    }
  }
  return spokenText.trim() ? spokenText : replacement;
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

export function revisionBlockIsNonSpeaking(block: RevisionBlock): boolean {
  if (revisionBlockIsSkipped(block)) {
    return true;
  }
  if (block.policyNoteType === "onDemand") {
    return true;
  }
  if (revisionTextIsStandaloneArtifactToken(firstRevisionText(block))) {
    return true;
  }
  if (block.spokenText.trim().length === 0) {
    return true;
  }
  if (revisionBlockLooksLikeReferenceSection(block)) {
    return true;
  }
  if (revisionBlockIsReferenceOnly(block)) {
    return true;
  }
  return false;
}

export function revisionBlockIsSpeakable(block: RevisionBlock): boolean {
  return !revisionBlockIsNonSpeaking(block);
}

export function revisionTextLooksLikeReferenceCueLeak(value: string): boolean {
  const text = value.trim();
  if (!text) {
    return false;
  }
  if (isDeepResearchReferenceMarker(text) || isReferenceHeadingLabel(text)) {
    return true;
  }
  return countReferenceLinks(text) >= 2 && hasEnumeratedReferenceLink(text);
}

export function revisionTextIsStandaloneArtifactToken(value: string): boolean {
  const text = value.trim();
  if (!text.includes("") || !text.includes("")) {
    return false;
  }
  const stripped = stripChatGPTPrivateUseTokens(text);
  if (stripped === text) {
    return false;
  }
  return trimReferenceMarkerPunctuation(stripped).trim() === "";
}

export function stripRevisionTrailingReferenceNumberText(value: string): string {
  const tokens = indexedReferenceSpeechTokens(value);
  if (tokens.length === 0) {
    return value;
  }
  const maxLength = Math.min(4, tokens.length);
  for (let length = maxLength; length >= 1; length -= 1) {
    const suffix = tokens.slice(tokens.length - length);
    if (!referenceNumberSpeechTokens(suffix)) {
      continue;
    }
    const stripped = value.slice(0, suffix[0].start).trim();
    return stripped.length > 0 ? stripped : value;
  }
  return value;
}

export function revisionBlockHasPolicyTransform(block: RevisionBlock): boolean {
  const speakMode = block.speakMode.trim().toLowerCase();
  return block.policyNoteType !== "spoken" || (speakMode.length > 0 && speakMode !== "speak");
}

function revisionBlockIsReferenceOnly(block: RevisionBlock): boolean {
  const kind = block.kind.trim().toLowerCase();
  if (
    !["artifact_token", "citation", "footnote", "reference", "unknown_inline_marker"].includes(kind)
  ) {
    return false;
  }
  const text =
    [block.text, block.spokenText, block.label].find((value) => value.trim().length > 0) ?? "";
  if (countReferenceLinks(text) > 0) {
    return true;
  }
  if (containsChatGPTArtifactToken(text) || containsTurnArtifactToken(text)) {
    return true;
  }
  const compact = trimReferenceMarkerPunctuation(text.trim().toLowerCase());
  if (/^\d{1,4}$/.test(compact)) {
    return true;
  }
  const words = compact.replaceAll("-", " ").split(/\s+/).filter(Boolean);
  return (
    words.length > 0 && words.length <= 4 && words.every((word) => REFERENCE_NUMBER_WORDS.has(word))
  );
}

function revisionBlockLooksLikeReferenceSection(block: RevisionBlock): boolean {
  return revisionTextLooksLikeReferenceCueLeak(firstRevisionText(block));
}

function firstRevisionText(block: RevisionBlock): string {
  return [block.text, block.spokenText, block.label].find((value) => value.trim().length > 0) ?? "";
}

function isDeepResearchReferenceMarker(text: string): boolean {
  const compact = text.toLowerCase().replaceAll(/\s+/g, "");
  return (
    compact === "<!--deep-research-references:start-->" ||
    compact === "<!--deep-research-references:end-->"
  );
}

function isReferenceHeadingLabel(text: string): boolean {
  let clean = text.trim();
  let headingDepth = 0;
  while (headingDepth < clean.length && clean[headingDepth] === "#") {
    headingDepth += 1;
  }
  if (headingDepth > 0 && headingDepth <= 6) {
    clean = clean.slice(headingDepth).trimStart();
  }
  clean = trimReferenceMarkerPunctuation(clean.toLowerCase())
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
  return REFERENCE_HEADING_LABELS.has(clean);
}

function countReferenceLinks(text: string): number {
  return [...text.matchAll(REFERENCE_URL_START_PATTERN)].length;
}

function hasEnumeratedReferenceLink(text: string): boolean {
  for (const match of text.matchAll(REFERENCE_URL_START_PATTERN)) {
    const matchIndex = match.index;
    const prefix = text.slice(Math.max(0, matchIndex - 48), matchIndex);
    if (referenceEnumeratorBeforeUrl(prefix)) {
      return true;
    }
  }
  return false;
}

function referenceEnumeratorBeforeUrl(prefix: string): boolean {
  const trimmed = prefix.trimEnd();
  if (!trimmed.endsWith(".") && !trimmed.endsWith(")")) {
    return false;
  }
  const words = trimmed.slice(0, -1).trimEnd().split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? "";
  const previous = words.at(-2) ?? "";
  return referenceEnumeratorToken(last) || referenceEnumeratorToken(`${previous} ${last}`);
}

function referenceEnumeratorToken(token: string): boolean {
  const clean = trimReferenceMarkerPunctuation(token.toLowerCase());
  if (/^\d{1,4}$/.test(clean)) {
    return true;
  }
  const words = clean.split(/\s+/).filter(Boolean);
  return (
    words.length > 0 && words.length <= 2 && words.every((word) => REFERENCE_NUMBER_WORDS.has(word))
  );
}

interface IndexedReferenceSpeechToken {
  readonly start: number;
  readonly text: string;
}

function indexedReferenceSpeechTokens(value: string): IndexedReferenceSpeechToken[] {
  const tokens: IndexedReferenceSpeechToken[] = [];
  let tokenStart: number | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      if (tokenStart !== null) {
        tokens.push({ start: tokenStart, text: value.slice(tokenStart, index) });
        tokenStart = null;
      }
      continue;
    }
    tokenStart ??= index;
  }
  if (tokenStart !== null) {
    tokens.push({ start: tokenStart, text: value.slice(tokenStart) });
  }
  return tokens;
}

function referenceNumberSpeechTokens(tokens: readonly IndexedReferenceSpeechToken[]): boolean {
  if (tokens.length === 0 || tokens.length > 4) {
    return false;
  }
  const words: string[] = [];
  for (const token of tokens) {
    const clean = trimReferenceMarkerPunctuation(token.text.toLowerCase());
    if (!clean) {
      return false;
    }
    if (/^\d{1,4}$/.test(clean)) {
      words.push(clean);
      continue;
    }
    for (const part of clean.replaceAll("-", " ").split(/\s+/).filter(Boolean)) {
      if (!REFERENCE_NUMBER_WORDS.has(part)) {
        return false;
      }
      words.push(part);
    }
  }
  return words.length > 0;
}

function containsChatGPTArtifactToken(text: string): boolean {
  return revisionTextIsStandaloneArtifactToken(text) || (text.includes("") && text.includes(""));
}

function stripChatGPTPrivateUseTokens(value: string): string {
  let output = "";
  let cursor = 0;
  let removed = false;
  while (cursor < value.length) {
    const start = value.indexOf("", cursor);
    if (start === -1) {
      output += value.slice(cursor);
      break;
    }
    output += value.slice(cursor, start);
    const end = value.indexOf("", start + 1);
    if (end === -1) {
      output += value.slice(start);
      break;
    }
    output += " ";
    cursor = end + 1;
    removed = true;
  }
  return removed ? output : value;
}

function containsTurnArtifactToken(text: string): boolean {
  const lower = text.toLowerCase();
  if (!lower.includes("turn")) {
    return false;
  }
  for (const chunk of lower.split("turn").slice(1)) {
    const digitCount = leadingDigitCount(chunk);
    if (digitCount === 0) {
      continue;
    }
    const rest = chunk.slice(digitCount);
    if (
      ["search", "view", "news", "fetch", "image"].some((marker) => {
        if (!rest.startsWith(marker)) {
          return false;
        }
        return leadingDigitCount(rest.slice(marker.length)) > 0;
      })
    ) {
      return true;
    }
  }
  return false;
}

function leadingDigitCount(value: string): number {
  let count = 0;
  while (
    count < value.length &&
    (value.codePointAt(count) ?? 0) >= 48 &&
    (value.codePointAt(count) ?? 0) <= 57
  ) {
    count += 1;
  }
  return count;
}

function trimReferenceMarkerPunctuation(value: string): string {
  const removable = new Set([
    " ",
    "\t",
    "\n",
    "\r",
    "[",
    "]",
    "(",
    ")",
    ".",
    ",",
    ";",
    ":",
    "|",
    "*",
    "_",
    "`",
    ">",
    '"',
    "'",
    "-",
  ]);
  let start = 0;
  let end = value.length;
  while (start < end && removable.has(value[start])) {
    start += 1;
  }
  while (end > start && removable.has(value[end - 1])) {
    end -= 1;
  }
  return value.slice(start, end);
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

function uniqueRepairCandidates(values: readonly string[]): string[] {
  const candidates: string[] = [];
  for (const value of values) {
    const candidate = value.trim();
    if (!candidate || candidates.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
      continue;
    }
    candidates.push(candidate);
  }
  return candidates;
}

function replaceFirstCaseInsensitive(text: string, search: string, replacement: string): string {
  const index = text.toLowerCase().indexOf(search.toLowerCase());
  if (index === -1) {
    return text;
  }
  return `${text.slice(0, index)}${replacement}${text.slice(index + search.length)}`;
}
