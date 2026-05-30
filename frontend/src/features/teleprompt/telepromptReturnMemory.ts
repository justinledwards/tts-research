import type { WorkspaceStage, WorkspaceSourceType } from "../workspace";

export type TelepromptReturnTarget = "preview" | "review";

export interface TelepromptReturnSnapshot {
  readonly activeBlockId: string | null;
  readonly activeBlockLabel: string | null;
  readonly originatingStage: WorkspaceStage;
  readonly policyProfile: string;
  readonly projectId: string;
  readonly returnTarget: TelepromptReturnTarget;
  readonly scrollTop: number;
  readonly selectedCueIndex: number | null;
  readonly sourceKey: string;
  readonly sourceLabel: string;
  readonly voiceProfile: string;
  readonly updatedAt: string;
}

export const TELEPROMPT_RETURN_MEMORY_KEY = "tts-teleprompt-studio-memory";

export function normalizeTelepromptReturnTarget(
  value: unknown,
  fallback: TelepromptReturnTarget = "review",
): TelepromptReturnTarget {
  return value === "preview" || value === "review" ? value : fallback;
}

export function workspaceStageToTelepromptReturnTarget(
  stage: WorkspaceStage,
): TelepromptReturnTarget {
  return stage === "preview" ? "preview" : "review";
}

export function telepromptSourceKey(input: {
  readonly scopeLabel: string;
  readonly sourceId: string | null;
  readonly sourceLabel: string;
  readonly sourceType: WorkspaceSourceType;
}): string {
  return [
    input.sourceType,
    cleanKeyPart(input.sourceId ?? "draft"),
    cleanKeyPart(input.sourceLabel),
    cleanKeyPart(input.scopeLabel),
  ].join(":");
}

export function readTelepromptReturnSnapshot(
  projectId: string,
  sourceKey: string,
): TelepromptReturnSnapshot | null {
  const snapshots = readTelepromptReturnMemory();
  const snapshot = snapshots[cleanKeyPart(projectId)];
  if (snapshot?.sourceKey !== sourceKey) {
    return null;
  }
  return snapshot;
}

export function rememberTelepromptReturnSnapshot(snapshot: TelepromptReturnSnapshot): void {
  const snapshots = readTelepromptReturnMemory();
  snapshots[cleanKeyPart(snapshot.projectId)] = {
    ...snapshot,
    activeBlockId: cleanOptionalSnapshotId(snapshot.activeBlockId),
    activeBlockLabel: cleanOptionalSnapshotLabel(snapshot.activeBlockLabel),
    originatingStage: normalizeSnapshotWorkspaceStage(snapshot.originatingStage),
    policyProfile: cleanSnapshotLabel(snapshot.policyProfile, "Default policy"),
    returnTarget: normalizeTelepromptReturnTarget(snapshot.returnTarget),
    scrollTop: Math.max(0, Math.round(snapshot.scrollTop)),
    selectedCueIndex: normalizeSelectedCueIndex(snapshot.selectedCueIndex),
    sourceLabel: cleanSnapshotLabel(snapshot.sourceLabel, "Unknown source"),
    updatedAt: snapshot.updatedAt.length > 0 ? snapshot.updatedAt : new Date().toISOString(),
    voiceProfile: cleanSnapshotLabel(snapshot.voiceProfile, "Default voice"),
  };
  safeStorageSet(TELEPROMPT_RETURN_MEMORY_KEY, JSON.stringify(snapshots));
}

export function clearTelepromptReturnMemory(): void {
  safeStorageRemove(TELEPROMPT_RETURN_MEMORY_KEY);
}

function readTelepromptReturnMemory(): Partial<Record<string, TelepromptReturnSnapshot>> {
  const raw = safeStorageGet(TELEPROMPT_RETURN_MEMORY_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return normalizeSnapshotMap(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

function normalizeSnapshotMap(
  value: Record<string, unknown>,
): Partial<Record<string, TelepromptReturnSnapshot>> {
  const snapshots: Partial<Record<string, TelepromptReturnSnapshot>> = {};
  for (const [projectId, snapshot] of Object.entries(value)) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }
    const candidate = snapshot as Partial<TelepromptReturnSnapshot>;
    if (typeof candidate.projectId !== "string" || typeof candidate.sourceKey !== "string") {
      continue;
    }
    snapshots[cleanKeyPart(projectId)] = {
      activeBlockId:
        typeof candidate.activeBlockId === "string" && candidate.activeBlockId.trim()
          ? candidate.activeBlockId
          : null,
      activeBlockLabel: cleanOptionalSnapshotLabel(candidate.activeBlockLabel ?? null),
      originatingStage: normalizeSnapshotWorkspaceStage(candidate.originatingStage),
      policyProfile: cleanSnapshotLabel(candidate.policyProfile ?? "", "Default policy"),
      projectId: candidate.projectId,
      returnTarget: normalizeTelepromptReturnTarget(candidate.returnTarget),
      scrollTop: Number.isFinite(candidate.scrollTop)
        ? Math.max(0, Number(candidate.scrollTop))
        : 0,
      selectedCueIndex: normalizeSelectedCueIndex(candidate.selectedCueIndex),
      sourceKey: candidate.sourceKey,
      sourceLabel: cleanSnapshotLabel(candidate.sourceLabel ?? "", "Unknown source"),
      updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
      voiceProfile: cleanSnapshotLabel(candidate.voiceProfile ?? "", "Default voice"),
    };
  }
  return snapshots;
}

function cleanKeyPart(value: string): string {
  return value.trim().replaceAll(/\s+/g, "-").toLowerCase();
}

function cleanOptionalSnapshotId(value: string | null): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned.length > 0 ? cleaned : null;
}

function cleanOptionalSnapshotLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function cleanSnapshotLabel(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function normalizeSelectedCueIndex(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.max(1, Math.round(Number(value)));
}

function normalizeSnapshotWorkspaceStage(value: unknown): WorkspaceStage {
  return value === "preview" || value === "review" || value === "teleprompt" || value === "theatre"
    ? value
    : "review";
}

function safeStorageGet(key: string): string | null {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private or test contexts; Teleprompt still works without it.
  }
}

function safeStorageRemove(key: string): void {
  try {
    globalThis.localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable in private or test contexts; Teleprompt still works without it.
  }
}
