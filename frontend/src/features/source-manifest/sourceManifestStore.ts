import type {
  SourceManifestEvent,
  SourceManifestEventReplay,
  SourceManifestReplayRequest,
  SourceManifestSnapshotFallback,
  SourceManifestSnapshotRequest,
  SourceManifestStreamHandlers,
  SourceManifestStreamRequest,
} from "../../api";

export interface SourceManifestIdentity {
  readonly sourceId: string;
  readonly sourceRevisionId: string;
  readonly readingUnitManifestId: string;
  readonly readalongManifestId: string;
}

export interface SourceManifestStoreEntry {
  readonly key: string;
  readonly identity: SourceManifestIdentity;
  readonly sourceId: string;
  readonly latestSequence: number;
  readonly cursor?: string;
  readonly snapshotRequired: boolean;
  readonly snapshot: SourceManifestSnapshotFallback | null;
  readonly lastEvent: SourceManifestEvent | null;
  readonly updatedFrom: "event" | "snapshot";
}

export interface SourceManifestClient {
  replaySourceManifestEvents(
    request: SourceManifestReplayRequest,
  ): Promise<SourceManifestEventReplay>;
  getSourceManifestSnapshot(
    request: SourceManifestSnapshotRequest,
  ): Promise<SourceManifestSnapshotFallback>;
  subscribeToSourceManifestEvents?(
    request: SourceManifestStreamRequest,
    handlers: SourceManifestStreamHandlers,
  ): () => void;
}

export interface SourceManifestStoreScheduler {
  schedule(callback: () => void): void;
}

export interface ManualSourceManifestScheduler extends SourceManifestStoreScheduler {
  flush(): void;
  readonly pendingCount: number;
}

export interface SourceManifestStoreOptions {
  readonly scheduler?: SourceManifestStoreScheduler;
  readonly replayLimit?: number;
}

export type SourceManifestStoreListener = (entries: readonly SourceManifestStoreEntry[]) => void;

export function sourceManifestIdentityKey(identity: SourceManifestIdentity): string {
  return [
    identity.sourceId,
    identity.sourceRevisionId,
    identity.readingUnitManifestId,
    identity.readalongManifestId,
  ]
    .map((part) => encodeURIComponent(part))
    .join("|");
}

export function sourceManifestIdentityFromEvent(
  event: SourceManifestEvent,
): SourceManifestIdentity {
  return {
    sourceId: event.sourceId,
    sourceRevisionId: event.subject.sourceRevisionId ?? "",
    readingUnitManifestId: event.subject.readingUnitManifestId ?? "",
    readalongManifestId: event.subject.readalongManifestId ?? "",
  };
}

export function sourceManifestIdentityFromSnapshot(
  snapshot: SourceManifestSnapshotFallback,
): SourceManifestIdentity {
  const readalong = snapshot.currentReadalongManifest;
  const readingUnit = snapshot.currentReadingUnitManifest;
  return {
    sourceId: snapshot.sourceId,
    sourceRevisionId:
      snapshot.sourceRevisionId ??
      readalong?.sourceRevisionId ??
      readingUnit?.sourceRevisionId ??
      snapshot.sourceRevision?.revisionId ??
      snapshot.sourceEnvelope?.currentRevisionId ??
      "",
    readingUnitManifestId: readingUnit?.manifestId ?? readalong?.readingUnitManifestId ?? "",
    readalongManifestId: readalong?.manifestId ?? "",
  };
}

export function createManualSourceManifestScheduler(): ManualSourceManifestScheduler {
  const callbacks = new Set<() => void>();
  return {
    get pendingCount() {
      return callbacks.size;
    },
    schedule(callback: () => void) {
      callbacks.add(callback);
    },
    flush() {
      const queued = [...callbacks];
      callbacks.clear();
      for (const callback of queued) {
        callback();
      }
    },
  };
}

export function createMicrotaskSourceManifestScheduler(): SourceManifestStoreScheduler {
  return {
    schedule(callback: () => void) {
      globalThis.queueMicrotask(callback);
    },
  };
}

export class SourceManifestStore {
  private readonly client: SourceManifestClient;
  private readonly scheduler: SourceManifestStoreScheduler;
  private readonly replayLimit?: number;
  private readonly entries = new Map<string, SourceManifestStoreEntry>();
  private readonly latestSequenceBySource = new Map<string, number>();
  private readonly listeners = new Set<SourceManifestStoreListener>();
  private readonly streamDisposers = new Map<string, () => void>();
  private notifyScheduled = false;
  private disposed = false;

  constructor(client: SourceManifestClient, options: SourceManifestStoreOptions = {}) {
    this.client = client;
    this.scheduler = options.scheduler ?? createMicrotaskSourceManifestScheduler();
    this.replayLimit = options.replayLimit;
  }

  snapshot(): readonly SourceManifestStoreEntry[] {
    return sortedSourceManifestItems(this.entries.values(), compareSourceManifestEntries);
  }

  get(identityOrKey: SourceManifestIdentity | string): SourceManifestStoreEntry | undefined {
    const key =
      typeof identityOrKey === "string" ? identityOrKey : sourceManifestIdentityKey(identityOrKey);
    return this.entries.get(key);
  }

  latestSequence(sourceId: string): number {
    return this.latestSequenceBySource.get(sourceId) ?? 0;
  }

  subscribe(listener: SourceManifestStoreListener): () => void {
    if (this.disposed) {
      listener([]);
      return noopSourceManifestStoreDispose;
    }
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async reconnectSource(sourceId: string): Promise<void> {
    if (this.disposed) {
      return;
    }
    const afterSequence = this.latestSequence(sourceId);
    const replay = await this.client.replaySourceManifestEvents({
      sourceId,
      afterSequence,
      limit: this.replayLimit,
    });
    await this.applyReplay(replay);
  }

  async connectSource(sourceId: string): Promise<() => void> {
    await this.reconnectSource(sourceId);
    if (this.disposed || !this.client.subscribeToSourceManifestEvents) {
      return noopSourceManifestStoreDispose;
    }
    this.streamDisposers.get(sourceId)?.();
    const dispose = this.client.subscribeToSourceManifestEvents(
      {
        sourceId,
        afterSequence: this.latestSequence(sourceId),
        limit: this.replayLimit,
      },
      {
        onEvent: (event) => {
          this.applyEvent(event);
        },
        onGap: (replay) => {
          void this.applyReplay(replay);
        },
        onError: noopSourceManifestStoreError,
      },
    );
    this.streamDisposers.set(sourceId, dispose);
    return () => {
      const currentDispose = this.streamDisposers.get(sourceId);
      if (currentDispose === dispose) {
        this.streamDisposers.delete(sourceId);
      }
      dispose();
    };
  }

  async applyReplay(replay: SourceManifestEventReplay): Promise<void> {
    if (this.disposed) {
      return;
    }
    const currentLatest = this.latestSequence(replay.sourceId);
    if (replay.snapshotRequired || replay.gap || replay.latestSequence < currentLatest) {
      const snapshot = await this.client.getSourceManifestSnapshot({ sourceId: replay.sourceId });
      this.replaceSourceSnapshot(snapshot);
      return;
    }
    for (const event of sortedSourceManifestItems(replay.events, compareSourceManifestEvents)) {
      this.applyEvent(event);
    }
    this.recordLatestSequence(replay.sourceId, replay.latestSequence);
  }

  applyEvent(event: SourceManifestEvent): void {
    if (this.disposed) {
      return;
    }
    const currentLatest = this.latestSequence(event.sourceId);
    if (event.sequence <= currentLatest) {
      return;
    }
    const identity = sourceManifestIdentityFromEvent(event);
    const key = sourceManifestIdentityKey(identity);
    const existing = this.entries.get(key);
    const entry: SourceManifestStoreEntry = {
      key,
      identity,
      sourceId: event.sourceId,
      latestSequence: event.sequence,
      cursor: event.cursor,
      snapshotRequired: false,
      snapshot: existing?.snapshot ?? null,
      lastEvent: event,
      updatedFrom: "event",
    };
    this.entries.set(key, entry);
    this.recordLatestSequence(event.sourceId, event.sequence);
    this.requestNotify();
  }

  replaceSourceSnapshot(
    snapshot: SourceManifestSnapshotFallback,
    latestSequence = snapshot.latestSequence,
  ): void {
    if (this.disposed) {
      return;
    }
    const identity = sourceManifestIdentityFromSnapshot(snapshot);
    const key = sourceManifestIdentityKey(identity);
    for (const [entryKey, entry] of this.entries) {
      if (entry.sourceId === snapshot.sourceId) {
        this.entries.delete(entryKey);
      }
    }
    this.entries.set(key, {
      key,
      identity,
      sourceId: snapshot.sourceId,
      latestSequence,
      cursor: snapshot.cursor,
      snapshotRequired: false,
      snapshot,
      lastEvent: null,
      updatedFrom: "snapshot",
    });
    this.latestSequenceBySource.set(snapshot.sourceId, latestSequence);
    this.requestNotify();
  }

  disposeSource(sourceId: string): void {
    this.streamDisposers.get(sourceId)?.();
    this.streamDisposers.delete(sourceId);
    this.latestSequenceBySource.delete(sourceId);
    let changed = false;
    for (const [key, entry] of this.entries) {
      if (entry.sourceId === sourceId) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.requestNotify();
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const dispose of this.streamDisposers.values()) {
      dispose();
    }
    this.streamDisposers.clear();
    this.entries.clear();
    this.latestSequenceBySource.clear();
    this.listeners.clear();
  }

  private recordLatestSequence(sourceId: string, sequence: number): void {
    if (sequence > this.latestSequence(sourceId)) {
      this.latestSequenceBySource.set(sourceId, sequence);
    }
  }

  private requestNotify(): void {
    if (this.disposed || this.notifyScheduled) {
      return;
    }
    this.notifyScheduled = true;
    this.scheduler.schedule(() => {
      this.notifyScheduled = false;
      if (this.disposed) {
        return;
      }
      const snapshot = this.snapshot();
      for (const listener of this.listeners) {
        listener(snapshot);
      }
    });
  }
}

function sortedSourceManifestItems<T>(
  items: Iterable<T>,
  compare: (left: T, right: T) => number,
): T[] {
  const sorted: T[] = [];
  for (const item of items) {
    const index = sorted.findIndex((candidate) => compare(item, candidate) < 0);
    if (index === -1) {
      sorted.push(item);
    } else {
      sorted.splice(index, 0, item);
    }
  }
  return sorted;
}

function compareSourceManifestEntries(
  left: SourceManifestStoreEntry,
  right: SourceManifestStoreEntry,
): number {
  return left.key.localeCompare(right.key);
}

function compareSourceManifestEvents(
  left: SourceManifestEvent,
  right: SourceManifestEvent,
): number {
  return left.sequence - right.sequence;
}

function noopSourceManifestStoreDispose(): void {
  return;
}

function noopSourceManifestStoreError(error: Error): void {
  if (error.name === "__source_manifest_stream_unreachable__") {
    throw error;
  }
}
