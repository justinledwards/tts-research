import type { SyncDebugSnapshot, SyncDebugSourceLocator } from "./syncDebugSnapshot";

export const ALIGNMENT_REPAIR_SCHEMA_VERSION = "alignment-repair.v1";

export type AlignmentRepairOperationKind =
  | "adjust-fragment-boundary"
  | "split-fragment"
  | "merge-fragments"
  | "force-phrase-fallback"
  | "mark-token-unspoken"
  | "mark-inserted-audio"
  | "regenerate-segment";

export type AlignmentRepairBoundary = "end" | "start";
export type AlignmentRepairCandidateAction =
  | "adjust-offset"
  | "split-segment"
  | "merge-segment"
  | "phrase-fallback"
  | "regenerate-segment";

export interface AlignmentRepairCandidate {
  activeFragmentIndex?: number;
  activePhraseText?: string | null;
  activeSegmentId?: string | null;
  activeSegmentIndex?: number | null;
  activeTokenIndex?: number;
  actualHighlightedWord: string | null;
  audioTimeSec: number;
  audioTimestamp: string;
  confidence: number | null;
  createdAt: string;
  driftMs: number | null;
  expectedVisibleWord: string | null;
  id: string;
  recommendedActions: AlignmentRepairCandidateAction[];
  sourceLocator: SyncDebugSourceLocator;
  timingSource: string;
}

export interface AlignmentRepairOperation {
  boundary?: AlignmentRepairBoundary;
  candidateId?: string;
  createdAt: string;
  deltaMs?: number;
  fragmentIndex?: number;
  id: string;
  insertedAudioMs?: number;
  kind: AlignmentRepairOperationKind;
  reason: string;
  splitAtMs?: number;
  text?: string;
  tokenIndex?: number;
}

export interface AlignmentRepairMap {
  candidates: AlignmentRepairCandidate[];
  contentFingerprint: string;
  createdAt: string;
  generatedAudioId: string;
  invalidatedReason?: string;
  operations: AlignmentRepairOperation[];
  projectId: string;
  schemaVersion: typeof ALIGNMENT_REPAIR_SCHEMA_VERSION;
  sourceId: string;
  speechPlanId: string;
  updatedAt: string;
}

export interface AlignmentRepairContext {
  contentFingerprint: string;
  generatedAudioId: string;
  projectId: string;
  sourceId: string;
  speechPlanId: string;
}

export interface AlignmentRepairStaleReport {
  reason?: string;
  stale: boolean;
}

export function createAlignmentRepairMap(
  context: AlignmentRepairContext,
  now = new Date().toISOString(),
): AlignmentRepairMap {
  return {
    ...context,
    candidates: [],
    createdAt: now,
    operations: [],
    schemaVersion: ALIGNMENT_REPAIR_SCHEMA_VERSION,
    updatedAt: now,
  };
}

export function createAlignmentRepairCandidateFromSyncSnapshot(
  snapshot: SyncDebugSnapshot,
  now = new Date().toISOString(),
): AlignmentRepairCandidate {
  const activeCue = snapshot.activeCue ?? snapshot.expectedCue;
  return normalizeAlignmentRepairCandidate(
    {
      activeFragmentIndex: activeCue?.fragmentIndex ?? undefined,
      activePhraseText: snapshot.activePhrase.text ?? snapshot.expectedCue?.text ?? null,
      activeSegmentId: snapshot.activeSegment.id,
      activeSegmentIndex: snapshot.activeSegment.index,
      activeTokenIndex: activeCue?.tokenIndex ?? undefined,
      actualHighlightedWord: snapshot.activeWord.text ?? snapshot.activeCue?.text ?? null,
      audioTimeSec: snapshot.currentAudioTimeSec,
      audioTimestamp: snapshot.currentAudioTimestamp,
      confidence: snapshot.confidence,
      createdAt: now,
      driftMs: snapshot.driftMs,
      expectedVisibleWord:
        snapshot.currentSourceLocator.textQuote ??
        snapshot.expectedCue?.text ??
        snapshot.activeWord.text ??
        null,
      id: repairCandidateId(snapshot, now),
      recommendedActions: repairCandidateActions(snapshot),
      sourceLocator: snapshot.currentSourceLocator,
      timingSource: snapshot.timingSource,
    },
    now,
  );
}

export function addAlignmentRepairCandidate(
  map: AlignmentRepairMap,
  candidate: Omit<AlignmentRepairCandidate, "createdAt" | "id"> &
    Partial<Pick<AlignmentRepairCandidate, "createdAt" | "id">>,
  now = new Date().toISOString(),
): AlignmentRepairMap {
  const nextCandidate = normalizeAlignmentRepairCandidate(candidate, now);
  return {
    ...map,
    candidates: [...map.candidates.filter((item) => item.id !== nextCandidate.id), nextCandidate],
    invalidatedReason: undefined,
    updatedAt: now,
  };
}

export function addAlignmentRepairOperation(
  map: AlignmentRepairMap,
  operation: Omit<AlignmentRepairOperation, "createdAt" | "id"> &
    Partial<Pick<AlignmentRepairOperation, "createdAt" | "id">>,
  now = new Date().toISOString(),
): AlignmentRepairMap {
  const nextOperation = normalizeAlignmentRepairOperation(operation, now);
  return {
    ...map,
    invalidatedReason: undefined,
    operations: [...map.operations, nextOperation],
    updatedAt: now,
  };
}

export function addAlignmentRepairOperationFromCandidate(
  map: AlignmentRepairMap,
  candidateId: string,
  action: AlignmentRepairCandidateAction,
  now = new Date().toISOString(),
): AlignmentRepairMap {
  const candidate = map.candidates.find((item) => item.id === candidateId);
  if (!candidate) {
    return map;
  }
  return addAlignmentRepairOperation(map, operationFromCandidate(candidate, action), now);
}

export function alignmentRepairMapStaleness(
  map: AlignmentRepairMap | null | undefined,
  context: AlignmentRepairContext,
): AlignmentRepairStaleReport {
  if (!map) {
    return { stale: false };
  }
  if (map.projectId !== context.projectId) {
    return { reason: "Repair map belongs to another project.", stale: true };
  }
  if (map.sourceId !== context.sourceId) {
    return { reason: "Repair map belongs to another source.", stale: true };
  }
  if (map.generatedAudioId !== context.generatedAudioId) {
    return { reason: "Generated audio changed; repair must be reviewed again.", stale: true };
  }
  if (map.speechPlanId !== context.speechPlanId) {
    return { reason: "Speech plan changed; repair must be reviewed again.", stale: true };
  }
  if (map.contentFingerprint !== context.contentFingerprint) {
    return { reason: "Source, policy, or run configuration changed.", stale: true };
  }
  if (map.invalidatedReason) {
    return { reason: map.invalidatedReason, stale: true };
  }
  return { stale: false };
}

export function alignmentRepairSummary(map: AlignmentRepairMap | null | undefined): string {
  if (!map || (map.operations.length === 0 && map.candidates.length === 0)) {
    return "No local alignment repairs saved.";
  }
  const counts = new Map<AlignmentRepairOperationKind, number>();
  for (const operation of map.operations) {
    counts.set(operation.kind, (counts.get(operation.kind) ?? 0) + 1);
  }
  const summary = [...counts.entries()]
    .map(([kind, count]) => `${alignmentRepairOperationLabel(kind)}: ${count.toLocaleString()}`)
    .join(" | ");
  const candidateSummary =
    map.candidates.length > 0 ? `Repair candidates: ${map.candidates.length.toLocaleString()}` : "";
  return [candidateSummary, summary].filter(Boolean).join(" | ");
}

export function alignmentRepairOperationLabel(kind: AlignmentRepairOperationKind): string {
  switch (kind) {
    case "adjust-fragment-boundary": {
      return "Boundary adjustment";
    }
    case "split-fragment": {
      return "Split fragment";
    }
    case "merge-fragments": {
      return "Merge fragments";
    }
    case "force-phrase-fallback": {
      return "Phrase fallback";
    }
    case "mark-token-unspoken": {
      return "Unspoken token";
    }
    case "mark-inserted-audio": {
      return "Inserted audio";
    }
    case "regenerate-segment": {
      return "Regenerate segment";
    }
  }
}

export function serializeAlignmentRepairMap(map: AlignmentRepairMap): string {
  return JSON.stringify(map, null, 2);
}

export function parseAlignmentRepairMap(raw: string): AlignmentRepairMap {
  const parsed = JSON.parse(raw) as Partial<Omit<AlignmentRepairMap, "schemaVersion">> & {
    schemaVersion?: string;
  };
  if (parsed.schemaVersion !== ALIGNMENT_REPAIR_SCHEMA_VERSION) {
    throw new Error("Unsupported alignment repair map schema.");
  }
  if (
    !parsed.projectId ||
    !parsed.sourceId ||
    !parsed.generatedAudioId ||
    !parsed.speechPlanId ||
    !parsed.contentFingerprint
  ) {
    throw new Error("Alignment repair map is missing versioning fields.");
  }
  return {
    candidates: Array.isArray(parsed.candidates)
      ? parsed.candidates.map((candidate) =>
          normalizeAlignmentRepairCandidate(candidate, candidate.createdAt),
        )
      : [],
    contentFingerprint: parsed.contentFingerprint,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    generatedAudioId: parsed.generatedAudioId,
    invalidatedReason: parsed.invalidatedReason,
    operations: Array.isArray(parsed.operations)
      ? parsed.operations.map((operation) =>
          normalizeAlignmentRepairOperation(operation, operation.createdAt),
        )
      : [],
    projectId: parsed.projectId,
    schemaVersion: ALIGNMENT_REPAIR_SCHEMA_VERSION,
    sourceId: parsed.sourceId,
    speechPlanId: parsed.speechPlanId,
    updatedAt: parsed.updatedAt ?? parsed.createdAt ?? new Date().toISOString(),
  };
}

function operationFromCandidate(
  candidate: AlignmentRepairCandidate,
  action: AlignmentRepairCandidateAction,
): Omit<AlignmentRepairOperation, "createdAt" | "id"> {
  const fragmentIndex = candidate.activeFragmentIndex ?? candidate.activeSegmentIndex ?? undefined;
  const tokenIndex = candidate.activeTokenIndex;
  const baseReason = repairCandidateReason(candidate);
  switch (action) {
    case "adjust-offset": {
      return {
        boundary: "start",
        candidateId: candidate.id,
        deltaMs: Math.round(candidate.driftMs ?? 0),
        fragmentIndex: numberOrUndefined(fragmentIndex),
        kind: "adjust-fragment-boundary",
        reason: `${baseReason} Suggested action: adjust highlight/audio offset at this point.`,
        tokenIndex,
      };
    }
    case "split-segment": {
      return {
        candidateId: candidate.id,
        fragmentIndex: numberOrUndefined(fragmentIndex),
        kind: "split-fragment",
        reason: `${baseReason} Suggested action: split this segment near the marked timestamp.`,
        splitAtMs: Math.round(candidate.audioTimeSec * 1000),
        text: candidate.activePhraseText ?? undefined,
        tokenIndex,
      };
    }
    case "merge-segment": {
      return {
        candidateId: candidate.id,
        fragmentIndex: numberOrUndefined(fragmentIndex),
        kind: "merge-fragments",
        reason: `${baseReason} Suggested action: merge the marked segment with the following segment.`,
        text: candidate.activePhraseText ?? undefined,
        tokenIndex,
      };
    }
    case "phrase-fallback": {
      return {
        candidateId: candidate.id,
        fragmentIndex: numberOrUndefined(fragmentIndex),
        kind: "force-phrase-fallback",
        reason: `${baseReason} Suggested action: use phrase-level fallback for this segment.`,
        tokenIndex,
      };
    }
    case "regenerate-segment": {
      return {
        candidateId: candidate.id,
        fragmentIndex: numberOrUndefined(fragmentIndex),
        kind: "regenerate-segment",
        reason: `${baseReason} Suggested action: regenerate this segment before trusting word highlights.`,
        tokenIndex,
      };
    }
  }
}

function normalizeAlignmentRepairOperation(
  operation: Partial<AlignmentRepairOperation> & Pick<AlignmentRepairOperation, "kind" | "reason">,
  now = new Date().toISOString(),
): AlignmentRepairOperation {
  const reason = operation.reason.trim();
  const text = operation.text?.trim();
  return {
    boundary: operation.boundary,
    candidateId: cleanString(operation.candidateId),
    createdAt: operation.createdAt ?? now,
    deltaMs: finiteNumber(operation.deltaMs),
    fragmentIndex: finiteNumber(operation.fragmentIndex),
    id: operation.id ?? `repair-${now}-${operation.kind}`,
    insertedAudioMs: finiteNumber(operation.insertedAudioMs),
    kind: operation.kind,
    reason: reason.length > 0 ? reason : "Operator alignment repair.",
    splitAtMs: finiteNumber(operation.splitAtMs),
    text: text && text.length > 0 ? text : undefined,
    tokenIndex: finiteNumber(operation.tokenIndex),
  };
}

function normalizeAlignmentRepairCandidate(
  candidate: Partial<AlignmentRepairCandidate> &
    Pick<AlignmentRepairCandidate, "audioTimeSec" | "sourceLocator" | "timingSource">,
  now = new Date().toISOString(),
): AlignmentRepairCandidate {
  const audioTimeSec = Math.max(0, finiteNumber(candidate.audioTimeSec) ?? 0);
  const audioTimestamp =
    cleanString(candidate.audioTimestamp) ?? formatAudioTimestamp(audioTimeSec);
  const recommendedActions =
    Array.isArray(candidate.recommendedActions) && candidate.recommendedActions.length > 0
      ? candidate.recommendedActions.filter(isRepairCandidateAction)
      : DEFAULT_REPAIR_CANDIDATE_ACTIONS;
  return {
    activeFragmentIndex: finiteNumber(candidate.activeFragmentIndex),
    activePhraseText: cleanStringOrNull(candidate.activePhraseText),
    activeSegmentId: cleanStringOrNull(candidate.activeSegmentId),
    activeSegmentIndex: finiteNullableNumber(candidate.activeSegmentIndex),
    activeTokenIndex: finiteNumber(candidate.activeTokenIndex),
    actualHighlightedWord: cleanStringOrNull(candidate.actualHighlightedWord),
    audioTimeSec,
    audioTimestamp,
    confidence: finiteNullableNumber(candidate.confidence),
    createdAt: candidate.createdAt ?? now,
    driftMs: finiteNullableNumber(candidate.driftMs),
    expectedVisibleWord: cleanStringOrNull(candidate.expectedVisibleWord),
    id: cleanString(candidate.id) ?? `repair-candidate-${now}`,
    recommendedActions,
    sourceLocator: normalizeSourceLocator(candidate.sourceLocator),
    timingSource: cleanString(candidate.timingSource) ?? "Unavailable",
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function finiteNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numberOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function cleanStringOrNull(value: unknown): string | null {
  return cleanString(value) ?? null;
}

const DEFAULT_REPAIR_CANDIDATE_ACTIONS: AlignmentRepairCandidateAction[] = [
  "adjust-offset",
  "split-segment",
  "merge-segment",
  "phrase-fallback",
  "regenerate-segment",
];

function repairCandidateActions(snapshot: SyncDebugSnapshot): AlignmentRepairCandidateAction[] {
  if (snapshot.highlightMode === "word" && snapshot.timingSource !== "Unavailable") {
    return DEFAULT_REPAIR_CANDIDATE_ACTIONS;
  }
  return ["phrase-fallback", "regenerate-segment", "adjust-offset"];
}

function repairCandidateId(snapshot: SyncDebugSnapshot, now: string): string {
  const locator = snapshot.currentSourceLocator.value.replaceAll(/[^a-z0-9]+/gi, "-").slice(0, 72);
  const ms = Math.round(snapshot.currentAudioTimeSec * 1000);
  return `repair-candidate-${locator || "unknown"}-${String(ms)}-${now}`;
}

function repairCandidateReason(candidate: AlignmentRepairCandidate): string {
  const expected = candidate.expectedVisibleWord ?? "unknown expected word";
  const actual = candidate.actualHighlightedWord ?? "no active highlight";
  return `QA drift marker at ${candidate.audioTimestamp}: expected "${expected}", highlighted "${actual}".`;
}

function isRepairCandidateAction(value: unknown): value is AlignmentRepairCandidateAction {
  return (
    value === "adjust-offset" ||
    value === "split-segment" ||
    value === "merge-segment" ||
    value === "phrase-fallback" ||
    value === "regenerate-segment"
  );
}

function normalizeSourceLocator(locator: unknown): SyncDebugSourceLocator {
  if (!locator || typeof locator !== "object") {
    return { kind: "unknown", value: "unknown" };
  }
  const partial = locator as Partial<SyncDebugSourceLocator>;
  return {
    activeWordIndex: finiteNullableNumber(partial.activeWordIndex),
    blockId: cleanStringOrNull(partial.blockId),
    bookmarkTarget: cleanStringOrNull(partial.bookmarkTarget),
    kind: normalizeSourceLocatorKind(partial.kind),
    pageIndex: finiteNullableNumber(partial.pageIndex),
    projectId: cleanStringOrNull(partial.projectId),
    scopeKey: cleanStringOrNull(partial.scopeKey),
    sourceId: cleanStringOrNull(partial.sourceId),
    sourceTitle: cleanStringOrNull(partial.sourceTitle),
    textQuote: cleanStringOrNull(partial.textQuote),
    value: cleanString(partial.value) ?? "unknown",
  };
}

function normalizeSourceLocatorKind(value: unknown): SyncDebugSourceLocator["kind"] {
  return value === "book" ||
    value === "fixture" ||
    value === "prepared-source" ||
    value === "unknown"
    ? value
    : "unknown";
}

function formatAudioTimestamp(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}
