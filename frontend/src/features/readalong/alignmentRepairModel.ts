export const ALIGNMENT_REPAIR_SCHEMA_VERSION = "alignment-repair.v1";

export type AlignmentRepairOperationKind =
  | "adjust-fragment-boundary"
  | "split-fragment"
  | "merge-fragments"
  | "force-phrase-fallback"
  | "mark-token-unspoken"
  | "mark-inserted-audio";

export type AlignmentRepairBoundary = "end" | "start";

export interface AlignmentRepairOperation {
  boundary?: AlignmentRepairBoundary;
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
    createdAt: now,
    operations: [],
    schemaVersion: ALIGNMENT_REPAIR_SCHEMA_VERSION,
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
  if (!map || map.operations.length === 0) {
    return "No local alignment repairs saved.";
  }
  const counts = new Map<AlignmentRepairOperationKind, number>();
  for (const operation of map.operations) {
    counts.set(operation.kind, (counts.get(operation.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([kind, count]) => `${alignmentRepairOperationLabel(kind)}: ${count.toLocaleString()}`)
    .join(" | ");
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

function normalizeAlignmentRepairOperation(
  operation: Partial<AlignmentRepairOperation> & Pick<AlignmentRepairOperation, "kind" | "reason">,
  now = new Date().toISOString(),
): AlignmentRepairOperation {
  const reason = operation.reason.trim();
  const text = operation.text?.trim();
  return {
    boundary: operation.boundary,
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

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
