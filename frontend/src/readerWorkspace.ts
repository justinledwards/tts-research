import {
  getBookSource,
  getPreparedSource,
  getReaderWorkspace,
  isApiNotFoundError,
  putReaderWorkspace,
  ReaderWorkspacePreconditionError,
  type ReaderWorkspaceSnapshot,
  type ReaderWorkspaceVersionedSnapshot,
} from "./api";
import type {
  BookSource,
  PlaybackProgress,
  PreparedSource,
  ReadingPosition,
  VoiceJob,
} from "./types";

export type ReaderWorkspaceEvent =
  | "load-start"
  | "authoritative-load"
  | "write-ack"
  | "conflict-retry-pending"
  | "conflict-retry-ack"
  | "conflict-current"
  | "conflict-current-pending"
  | "load-error"
  | "write-error";

export interface ReaderWorkspaceView {
  readonly projectId: string | null;
  readonly snapshot: ReaderWorkspaceSnapshot | null;
  readonly baselineSnapshot?: ReaderWorkspaceSnapshot | null;
  readonly sentIntentGeneration?: number;
  readonly hasNewerIntent?: boolean;
  readonly etag: string | null;
  readonly status: "idle" | "loading" | "ready" | "empty" | "error";
  readonly event: ReaderWorkspaceEvent;
  readonly error: Error | null;
}

interface ReaderWorkspaceClientOptions {
  readonly get?: typeof getReaderWorkspace;
  readonly put?: typeof putReaderWorkspace;
  readonly onChange: (state: ReaderWorkspaceView) => void;
}

type MutableReaderField =
  | "nomination"
  | "readMode"
  | "readerLocator"
  | "playbackCursorMs"
  | "playbackRate"
  | "followPreference";

const SCALAR_READER_FIELDS = [
  "readMode",
  "playbackCursorMs",
  "playbackRate",
  "followPreference",
] as const;

export function mutableReaderStateEqual(
  left: ReaderWorkspaceSnapshot,
  right: ReaderWorkspaceSnapshot,
): boolean {
  return (
    left.sourceId === right.sourceId &&
    left.runId === right.runId &&
    semanticValueEqual(left.readerLocator, right.readerLocator) &&
    SCALAR_READER_FIELDS.every((field) => Object.is(left[field], right[field]))
  );
}

export type ReaderWorkspacePersistenceDecision = "blocked" | "unchanged" | "write";

export function readerWorkspaceBaselineResponseIsCurrent(
  installedResponseGeneration: number,
  candidateResponseGeneration: number,
): boolean {
  return candidateResponseGeneration >= installedResponseGeneration;
}

export function readerWorkspacePersistenceDecision(
  persisted: ReaderWorkspaceSnapshot,
  desired: ReaderWorkspaceSnapshot,
  blockedIntentGeneration: number | null,
  userIntentGeneration: number,
): ReaderWorkspacePersistenceDecision {
  if (blockedIntentGeneration !== null && blockedIntentGeneration === userIntentGeneration) {
    return "blocked";
  }
  return mutableReaderStateEqual(persisted, desired) ? "unchanged" : "write";
}

export function readerWorkspaceSuccessfulAckNeedsRestoration(
  sent: ReaderWorkspaceSnapshot,
  authoritative: ReaderWorkspaceSnapshot,
  sentIntentGeneration: number | undefined,
  currentIntentGeneration: number,
  hasNewerIntent: boolean | undefined,
): boolean {
  return (
    hasNewerIntent === false &&
    sentIntentGeneration === currentIntentGeneration &&
    !mutableReaderStateEqual(sent, authoritative)
  );
}

export function readerWorkspaceSuccessfulAckNeedsNavigationRestoration(
  sent: ReaderWorkspaceSnapshot,
  authoritative: ReaderWorkspaceSnapshot,
): boolean {
  return (
    sent.sourceId !== authoritative.sourceId ||
    sent.runId !== authoritative.runId ||
    sent.readMode !== authoritative.readMode ||
    !semanticValueEqual(sent.readerLocator, authoritative.readerLocator)
  );
}

export function locatorEnvelopeForReadingPosition(
  readingPosition: ReadingPosition | null | undefined,
  sourceId: string | null | undefined,
): ReaderWorkspaceSnapshot["readerLocator"] {
  if (readingPosition?.locatorEnvelope) {
    return readingPosition.locatorEnvelope.sourceId === sourceId &&
      readingPosition.locatorEnvelope.nodeId?.trim()
      ? readingPosition.locatorEnvelope
      : null;
  }
  if (!readingPosition || !sourceId) return null;
  if (readingPosition.bookSourceId && readingPosition.bookSourceId !== sourceId) return null;
  const nodeId = readingPosition.nodeId?.trim();
  if (!nodeId) return null;
  return {
    schemaVersion: "locator-envelope.v1",
    kind: "resume",
    sourceId,
    nodeId,
    ...(readingPosition.scopeKey ? { scopeKey: readingPosition.scopeKey } : {}),
    ...(readingPosition.activeWordIndex === undefined
      ? {}
      : { activeWordIndex: readingPosition.activeWordIndex }),
    ...(readingPosition.locator ? { locator: readingPosition.locator } : {}),
    ...(readingPosition.textQuote ? { textQuote: readingPosition.textQuote } : {}),
  };
}

export interface ReaderWorkspaceNomination {
  readonly sourceId: string;
  readonly runId: string | null;
}

interface ReaderWorkspaceNominationBaseline {
  readonly sourceId: string | null;
  readonly runId: string | null;
}

export function readerWorkspaceNominationFromBaseline(
  baseline: ReaderWorkspaceNominationBaseline | null | undefined,
): ReaderWorkspaceNomination | null {
  if (!baseline?.sourceId) return null;
  return { sourceId: baseline.sourceId, runId: baseline.runId };
}

interface ReaderWorkspaceReaderState {
  readonly readMode: ReaderWorkspaceSnapshot["readMode"];
  readonly readingPosition: ReadingPosition | null | undefined;
  readonly playbackCursorMs: number;
  readonly playbackRate: number;
  readonly followPreference: boolean;
}

export function projectReaderWorkspaceIntent(
  persisted: ReaderWorkspaceSnapshot,
  nomination: ReaderWorkspaceNomination | null,
  readerState: ReaderWorkspaceReaderState,
): ReaderWorkspaceSnapshot | null {
  if (!nomination?.sourceId) return null;
  const sourceChanged = nomination.sourceId !== persisted.sourceId;
  const candidateLocator = sourceChanged
    ? null
    : locatorEnvelopeForReadingPosition(readerState.readingPosition, nomination.sourceId);
  const persistedLocator =
    !sourceChanged && persisted.readerLocator?.sourceId === nomination.sourceId
      ? persisted.readerLocator
      : null;
  const hasReadingPositionCandidate = readerState.readingPosition != null;
  let readerLocator = persistedLocator;
  if (sourceChanged) {
    readerLocator = null;
  } else if (hasReadingPositionCandidate) {
    readerLocator = candidateLocator;
  }
  return {
    ...persisted,
    sourceId: nomination.sourceId,
    runId: nomination.runId,
    readMode: readerState.readMode,
    readerLocator,
    playbackCursorMs: sourceChanged ? 0 : readerState.playbackCursorMs,
    playbackRate: readerState.playbackRate,
    followPreference: readerState.followPreference,
  };
}

export function readerWorkspaceBlockNavigationPosition(
  persistedSourceId: string | null | undefined,
  navigationSourceId: string | null | undefined,
  blockId: string,
): ReadingPosition | null {
  if (!persistedSourceId || navigationSourceId !== persistedSourceId) {
    return null;
  }
  return { nodeId: blockId };
}

export function projectIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("projectId")?.trim() ?? "";
  return value.length > 0 ? value : null;
}

export function readerWorkspaceSnapshotIdentity(snapshot: ReaderWorkspaceSnapshot): string {
  return JSON.stringify([
    snapshot.projectId,
    snapshot.projectRevision,
    snapshot.updatedAt,
    snapshot.sourceId,
    snapshot.sourceRevisionId,
    snapshot.sourceContentHash,
    snapshot.runId,
    snapshot.runCompatibilityKey,
    snapshot.mediaManifestVersion,
    snapshot.timingRevision,
    snapshot.syncFidelity,
  ]);
}

export interface AuthoritativeResumePlan {
  readonly autoplay: false;
  readonly playbackRate: number;
  readonly readingPosition: ReadingPosition | undefined;
  readonly seconds: number;
}

export function authoritativeResumePlan(
  snapshot: ReaderWorkspaceSnapshot,
): AuthoritativeResumePlan {
  const locator = snapshot.readerLocator;
  return {
    autoplay: false,
    playbackRate: snapshot.playbackRate ?? 1,
    readingPosition: locator
      ? {
          activeWordIndex: locator.activeWordIndex,
          locator: locator.locator,
          locatorEnvelope: locator,
          nodeId: locator.nodeId,
          scopeKey: locator.scopeKey,
          textQuote: locator.textQuote,
        }
      : undefined,
    seconds: Math.max(0, (snapshot.playbackCursorMs ?? 0) / 1000),
  };
}

export function authoritativePreparedProgress(
  projectId: string,
  snapshot: ReaderWorkspaceSnapshot,
): PlaybackProgress | null {
  if (!snapshot.sourceId || !snapshot.readerLocator) return null;
  const resume = authoritativeResumePlan(snapshot);
  return {
    activeWordIndex: snapshot.readerLocator.activeWordIndex,
    createdAt: "1970-01-01T00:00:00.000Z",
    currentTimeSec: resume.seconds,
    finished: false,
    hidden: false,
    preparedSourceId: snapshot.sourceId,
    progress: 0,
    projectId,
    readingPosition: resume.readingPosition,
    targetId: `prepared:${snapshot.sourceId}`,
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

interface PreparedResumeSource {
  readonly id: string;
  readonly blocks?: readonly {
    readonly id: string;
    readonly metadata?: Record<string, unknown>;
    readonly speakMode?: string;
    readonly speechPolicy?: { readonly mode?: string };
    readonly spokenText?: string;
    readonly text?: string;
  }[];
}

function semanticValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => semanticValueEqual(value, right[index]))
    );
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const rightKeys = Object.keys(rightRecord);
  return (
    Object.keys(leftRecord).length === rightKeys.length &&
    rightKeys.every(
      (key) => key in leftRecord && semanticValueEqual(leftRecord[key], rightRecord[key]),
    )
  );
}

function containsSemanticValue(container: unknown, evidence: unknown): boolean {
  if (semanticValueEqual(container, evidence)) return true;
  if (!container || typeof container !== "object") return false;
  if (Array.isArray(container)) {
    return container.some((value) => containsSemanticValue(value, evidence));
  }
  return Object.values(container as Record<string, unknown>).some((value) =>
    containsSemanticValue(value, evidence),
  );
}

export function resolveAuthoritativePreparedBlockId(
  source: PreparedResumeSource,
  readingPosition: ReadingPosition | undefined,
): string | null {
  const envelope = readingPosition?.locatorEnvelope;
  if (envelope?.sourceId !== source.id) return null;
  const blocks = source.blocks ?? [];
  const nodeId = readingPosition?.nodeId ?? envelope.nodeId;
  if (nodeId && blocks.some((block) => block.id === nodeId)) return nodeId;

  const locatorEvidence = [
    readingPosition?.scopeKey,
    envelope.scopeKey,
    envelope.locator,
    envelope.readium,
  ].filter((value) => value !== undefined);
  const metadataMatch = blocks.find((block) =>
    locatorEvidence.some((value) => containsSemanticValue(block.metadata, value)),
  );
  if (metadataMatch) return metadataMatch.id;

  const quote =
    readingPosition?.textQuote ?? envelope.textQuote ?? envelope.readium?.text?.highlight;
  if (!quote) return null;
  return (
    blocks.find((block) => `${block.text ?? ""} ${block.spokenText ?? ""}`.includes(quote))?.id ??
    null
  );
}

export function visibleAuthoritativePreparedProgress(
  source: PreparedResumeSource,
  progress: PlaybackProgress,
): PlaybackProgress {
  if ((progress.activeWordIndex ?? -1) >= 0) return progress;
  const blockId = resolveAuthoritativePreparedBlockId(source, progress.readingPosition);
  if (!blockId) return progress;
  let activeWordIndex = 0;
  for (const block of source.blocks ?? []) {
    if (block.id === blockId) return { ...progress, activeWordIndex };
    const speakMode = block.speakMode?.trim().toLowerCase();
    const policyMode = block.speechPolicy?.mode?.trim().toLowerCase();
    if (speakMode === "skip" || policyMode === "skip" || policyMode === "ondemand") continue;
    activeWordIndex += (block.spokenText ?? block.text ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }
  return progress;
}

export function serverWorkspaceOwnsNavigation(
  activeProjectId: string,
  restoringProjectId: string | null,
  snapshotProjectId?: string,
): boolean {
  return restoringProjectId === activeProjectId || snapshotProjectId === activeProjectId;
}

export function projectLoaderResponseIsCurrent(
  requestProjectId: string,
  requestGeneration: number,
  activeProjectId: string,
  currentGeneration: number,
): boolean {
  return requestProjectId === activeProjectId && requestGeneration === currentGeneration;
}

export type AuthoritativeSourceKind = "book" | "prepared";

export type AuthoritativeReaderSource =
  | { readonly kind: "book"; readonly source: BookSource }
  | { readonly kind: "prepared"; readonly source: PreparedSource };

interface AuthoritativeReaderSourceOptions {
  readonly getBook?: typeof getBookSource;
  readonly getPrepared?: typeof getPreparedSource;
}

/** Resolve exactly one nominated source without hydrating either project-wide inventory. */
export async function resolveAuthoritativeReaderSource(
  sourceId: string,
  projectId: string,
  options: AuthoritativeReaderSourceOptions = {},
): Promise<AuthoritativeReaderSource> {
  const getPrepared = options.getPrepared ?? getPreparedSource;
  try {
    const source = await getPrepared(sourceId);
    if (source.id !== sourceId || source.projectId !== projectId) {
      throw new Error("The server workspace prepared source identity does not match.");
    }
    return { kind: "prepared", source };
  } catch (error) {
    if (!isApiNotFoundError(error)) throw error;
  }
  const getBook = options.getBook ?? getBookSource;
  const source = await getBook(sourceId);
  if (source.id !== sourceId || source.projectId !== projectId) {
    throw new Error("The server workspace book source identity does not match.");
  }
  return { kind: "book", source };
}

export function resolveAuthoritativeSourceKind(
  sourceId: string,
  bookSourceIds: readonly string[],
  preparedSourceIds: readonly string[],
): AuthoritativeSourceKind {
  const isBook = bookSourceIds.includes(sourceId);
  const isPrepared = preparedSourceIds.includes(sourceId);
  if (isBook === isPrepared) {
    throw new Error(
      isBook
        ? "The server workspace source is ambiguous across source inventories."
        : "The server workspace source is absent from the project inventories.",
    );
  }
  return isBook ? "book" : "prepared";
}

export function validateAuthoritativeVoiceJob(
  job: VoiceJob,
  snapshot: ReaderWorkspaceSnapshot,
  sourceKind: AuthoritativeSourceKind,
): void {
  if (job.id !== snapshot.runId || job.projectId !== snapshot.projectId) {
    throw new Error("The server workspace narration run identity does not match.");
  }
  const jobSourceId = sourceKind === "book" ? job.bookSourceId : job.preparedSourceId;
  if (jobSourceId !== snapshot.sourceId) {
    throw new Error("The server workspace narration run references a different source.");
  }
  // VoiceJob exposes none of the snapshot's revision/hash/compatibility/media/timing fields.
  // Preserve those identities in the snapshot; do not infer or fabricate job equivalents.
}

export interface ReaderWorkspaceRestoreToken {
  readonly generation: number;
  readonly intentGeneration: number | null;
  readonly projectId: string;
  readonly snapshotIdentity: string;
}

interface ReaderWorkspaceRestoreOptions {
  readonly cancelOnUserIntent?: boolean;
  readonly intentGeneration?: number;
}

export class ReaderWorkspaceRestorationCoordinator {
  private generation = 0;
  private projectId: string | null = null;
  private snapshotIdentity: string | null = null;
  private hydrated = false;
  private cancelOnUserIntent = false;

  begin(
    projectId: string,
    snapshot: ReaderWorkspaceSnapshot,
    options: ReaderWorkspaceRestoreOptions = {},
  ): ReaderWorkspaceRestoreToken {
    const token = {
      generation: ++this.generation,
      intentGeneration: options.intentGeneration ?? null,
      projectId,
      snapshotIdentity: readerWorkspaceSnapshotIdentity(snapshot),
    };
    this.projectId = projectId;
    this.snapshotIdentity = token.snapshotIdentity;
    this.hydrated = false;
    this.cancelOnUserIntent = options.cancelOnUserIntent === true;
    return token;
  }

  invalidate(projectId: string): void {
    this.generation += 1;
    this.projectId = projectId;
    this.snapshotIdentity = null;
    this.hydrated = false;
    this.cancelOnUserIntent = false;
  }

  installBaseline(projectId: string): void {
    this.generation += 1;
    this.projectId = projectId;
    this.snapshotIdentity = null;
    this.hydrated = true;
    this.cancelOnUserIntent = false;
  }

  cancelForUserIntent(projectId: string): boolean {
    if (this.projectId !== projectId || !this.cancelOnUserIntent) return false;
    this.installBaseline(projectId);
    return true;
  }

  isCurrent(token: ReaderWorkspaceRestoreToken, intentGeneration?: number): boolean {
    return (
      token.generation === this.generation &&
      token.projectId === this.projectId &&
      token.snapshotIdentity === this.snapshotIdentity &&
      (token.intentGeneration === null || token.intentGeneration === intentGeneration)
    );
  }

  complete(token: ReaderWorkspaceRestoreToken, intentGeneration?: number): boolean {
    if (!this.isCurrent(token, intentGeneration)) return false;
    this.hydrated = true;
    this.cancelOnUserIntent = false;
    return true;
  }

  isPersistenceEnabled(projectId: string): boolean {
    return this.hydrated && this.projectId === projectId;
  }
}

/**
 * Coalesces high-frequency automatic reader checkpoints while retaining an immediate seam for
 * explicit intent. The transport remains timer-free and continues to own CAS reconciliation.
 */
export class ReaderWorkspacePersistenceScheduler {
  private timer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private pending = false;

  constructor(
    private readonly persistLatest: () => void,
    private readonly delayMs = 5000,
  ) {}

  scheduleAutomatic(): void {
    this.pending = true;
    if (this.timer !== null) return;
    this.timer = globalThis.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.delayMs);
  }

  flush(): void {
    if (!this.pending) return;
    this.clearTimer();
    this.pending = false;
    this.persistLatest();
  }

  flushExplicit(): void {
    this.clearTimer();
    this.pending = false;
    this.persistLatest();
  }

  cancel(): void {
    this.clearTimer();
    this.pending = false;
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    globalThis.clearTimeout(this.timer);
    this.timer = null;
  }
}

export class ReaderWorkspaceClient {
  private readonly get: typeof getReaderWorkspace;
  private readonly put: typeof putReaderWorkspace;
  private readonly onChange: ReaderWorkspaceClientOptions["onChange"];
  private generation = 0;
  private projectId: string | null = null;
  private current: ReaderWorkspaceVersionedSnapshot | null = null;
  private desired: ReaderWorkspaceSnapshot | null = null;
  private desiredIntentGeneration = 0;
  private pendingFields = new Set<MutableReaderField>();
  private writing = false;
  private retryAvailable = true;
  private conflictReconciliationPending = false;
  private conflictIntentBlocked = false;

  constructor(options: ReaderWorkspaceClientOptions) {
    this.get = options.get ?? getReaderWorkspace;
    this.put = options.put ?? putReaderWorkspace;
    this.onChange = options.onChange;
  }

  async load(projectId: string): Promise<void> {
    const generation = ++this.generation;
    this.projectId = projectId;
    this.current = null;
    this.desired = null;
    this.pendingFields.clear();
    this.retryAvailable = true;
    this.conflictReconciliationPending = false;
    this.conflictIntentBlocked = false;
    this.onChange({
      projectId,
      snapshot: null,
      etag: null,
      status: "loading",
      event: "load-start",
      error: null,
    });
    try {
      const result = await this.get(projectId);
      if (generation !== this.generation || projectId !== this.projectId) return;
      this.current = result;
      this.emitSnapshot(result, "authoritative-load");
    } catch (error) {
      if (generation !== this.generation || projectId !== this.projectId) return;
      this.onChange({
        projectId,
        snapshot: null,
        etag: null,
        status: "error",
        event: "load-error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  update(
    update: (snapshot: ReaderWorkspaceSnapshot) => ReaderWorkspaceSnapshot,
    intentGeneration = 0,
  ): void {
    const base = this.desired ?? this.current?.snapshot;
    if (!base || !this.projectId) return;
    const next = update(base);
    const fields = changedMutableFields(base, next);
    if (fields.size === 0) return;
    this.desired = next;
    this.desiredIntentGeneration = intentGeneration;
    this.conflictIntentBlocked = false;
    for (const field of fields) this.pendingFields.add(field);
    if (!this.writing) this.retryAvailable = true;
    void this.flush();
  }

  private emitSnapshot(
    versioned: ReaderWorkspaceVersionedSnapshot,
    event:
      | "authoritative-load"
      | "write-ack"
      | "conflict-retry-pending"
      | "conflict-retry-ack"
      | "conflict-current"
      | "conflict-current-pending",
    snapshot: ReaderWorkspaceSnapshot = versioned.snapshot,
    acknowledgement?: {
      readonly sentIntentGeneration: number;
      readonly hasNewerIntent: boolean;
    },
  ): void {
    this.onChange({
      projectId: this.projectId,
      snapshot,
      baselineSnapshot: versioned.snapshot,
      ...acknowledgement,
      etag: versioned.etag,
      status: versioned.snapshot.sourceId ? "ready" : "empty",
      event,
      error: null,
    });
  }

  private async flush(): Promise<void> {
    if (
      this.writing ||
      this.conflictIntentBlocked ||
      !this.desired ||
      !this.current ||
      !this.projectId
    )
      return;
    this.writing = true;
    const generation = this.generation;
    const projectId = this.projectId;
    const sent = this.desired;
    const sentIntentGeneration = this.desiredIntentGeneration;
    this.pendingFields.clear();
    try {
      const result = await this.put(projectId, sent, this.current.etag);
      if (!this.isCurrent(generation, projectId)) return;
      this.current = result;
      const hasNewerIntent = this.rebaseOrClearDesired(result.snapshot);
      let event: "write-ack" | "conflict-retry-pending" | "conflict-retry-ack" = "write-ack";
      if (this.conflictReconciliationPending) {
        event = hasNewerIntent ? "conflict-retry-pending" : "conflict-retry-ack";
        this.conflictReconciliationPending = hasNewerIntent;
      }
      this.emitSnapshot(result, event, sent, { hasNewerIntent, sentIntentGeneration });
    } catch (error) {
      if (!this.isCurrent(generation, projectId)) return;
      this.handleWriteFailure(error, projectId);
    } finally {
      this.writing = false;
      // A new project can queue intent while an old generation owns the write lock.
      // Always offer the lock to the current generation after the old request settles.
      void this.flush();
    }
  }

  private isCurrent(generation: number, projectId: string): boolean {
    return generation === this.generation && projectId === this.projectId;
  }

  private rebaseOrClearDesired(current: ReaderWorkspaceSnapshot): boolean {
    const newerFields = new Set(this.pendingFields);
    this.pendingFields.clear();
    if (newerFields.size === 0 || !this.desired) {
      this.desired = null;
      return false;
    }
    this.desired = rebaseReaderIntent(current, this.desired, newerFields);
    return true;
  }

  private handleWriteFailure(error: unknown, projectId: string): void {
    if (!(error instanceof ReaderWorkspacePreconditionError)) {
      this.desired = null;
      this.pendingFields.clear();
      this.onChange({
        projectId,
        snapshot: this.current?.snapshot ?? null,
        etag: this.current?.etag ?? null,
        status: "error",
        event: "write-error",
        error: error instanceof Error ? error : new Error(String(error)),
      });
      return;
    }

    this.current = { snapshot: error.current, etag: error.etag };
    const hasNewerIntent = this.rebaseOrClearDesired(error.current);
    if (hasNewerIntent && this.retryAvailable) {
      this.retryAvailable = false;
      this.conflictReconciliationPending = true;
      this.emitSnapshot(
        this.current,
        "conflict-retry-pending",
        this.desired ?? this.current.snapshot,
      );
      return;
    }
    if (hasNewerIntent) {
      this.conflictIntentBlocked = true;
      this.conflictReconciliationPending = true;
      this.emitSnapshot(
        this.current,
        "conflict-current-pending",
        this.desired ?? this.current.snapshot,
      );
      return;
    } else {
      this.desired = null;
      this.pendingFields.clear();
    }
    this.conflictReconciliationPending = false;
    this.emitSnapshot(this.current, "conflict-current");
  }
}

function changedMutableFields(
  previous: ReaderWorkspaceSnapshot,
  next: ReaderWorkspaceSnapshot,
): Set<MutableReaderField> {
  const fields = new Set<MutableReaderField>();
  if (previous.sourceId !== next.sourceId || previous.runId !== next.runId) {
    fields.add("nomination");
  }
  if (!semanticValueEqual(previous.readerLocator, next.readerLocator)) {
    fields.add("readerLocator");
  }
  for (const field of SCALAR_READER_FIELDS) {
    if (!Object.is(previous[field], next[field])) fields.add(field);
  }
  return fields;
}

function rebaseReaderIntent(
  current: ReaderWorkspaceSnapshot,
  desired: ReaderWorkspaceSnapshot,
  fields: ReadonlySet<MutableReaderField>,
): ReaderWorkspaceSnapshot {
  const rebased = { ...current };
  if (fields.has("nomination")) {
    rebased.sourceId = desired.sourceId;
    rebased.runId = desired.runId;
    if (desired.sourceId !== current.sourceId) {
      rebased.readerLocator = null;
      rebased.playbackCursorMs = 0;
    }
  }
  for (const field of fields) {
    if (field === "nomination") continue;
    Object.assign(rebased, { [field]: desired[field] });
  }
  return rebased;
}
