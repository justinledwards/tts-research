import { describe, expect, it } from "vitest";
import type {
  SourceManifestEvent,
  SourceManifestEventReplay,
  SourceManifestSnapshotFallback,
} from "../../api";
import {
  SourceManifestStore,
  createManualSourceManifestScheduler,
  sourceManifestIdentityFromEvent,
  sourceManifestIdentityFromSnapshot,
  sourceManifestIdentityKey,
} from "./sourceManifestStore";
import type { SourceManifestClient } from "./sourceManifestStore";

describe("source manifest store", () => {
  it("keys cache entries by full source/revision/manifest identity", () => {
    const key = sourceManifestIdentityKey({
      sourceId: "source|1",
      sourceRevisionId: "rev/1",
      readingUnitManifestId: "rum 1",
      readalongManifestId: "ram?1",
    });

    expect(key).toBe("source%7C1|rev%2F1|rum%201|ram%3F1");
    expect(
      sourceManifestIdentityFromEvent(
        event({
          sourceId: "source-1",
          sourceRevisionId: "rev-1",
          readingUnitManifestId: "rum-1",
          readalongManifestId: "ram-1",
          sequence: 1,
        }),
      ),
    ).toEqual({
      sourceId: "source-1",
      sourceRevisionId: "rev-1",
      readingUnitManifestId: "rum-1",
      readalongManifestId: "ram-1",
    });
    expect(sourceManifestIdentityFromSnapshot(snapshot({ latestSequence: 9 }))).toEqual({
      sourceId: "source-1",
      sourceRevisionId: "rev-1",
      readingUnitManifestId: "rum-1",
      readalongManifestId: "ram-1",
    });
  });

  it("applies replay events in sequence order and coalesces burst notifications", async () => {
    const scheduler = createManualSourceManifestScheduler();
    const client = fakeClient();
    const store = new SourceManifestStore(client, { scheduler });
    const emissions: number[] = [];
    store.subscribe((entries) => {
      emissions.push(entries.length);
    });

    await store.applyReplay({
      sourceId: "source-1",
      afterSequence: 0,
      events: [
        event({ sequence: 2, readingUnitManifestId: "rum-2", readalongManifestId: "ram-2" }),
        event({ sequence: 1, readingUnitManifestId: "rum-1", readalongManifestId: "ram-1" }),
        event({ sequence: 3, readingUnitManifestId: "rum-3", readalongManifestId: "ram-3" }),
      ],
      gap: false,
      snapshotRequired: false,
      latestSequence: 3,
    });

    expect(store.latestSequence("source-1")).toBe(3);
    expect(store.snapshot().map((entry) => entry.lastEvent?.sequence)).toEqual([1, 2, 3]);
    expect(scheduler.pendingCount).toBe(1);
    scheduler.flush();
    expect(emissions).toEqual([0, 3]);
  });

  it("ignores stale advisory events after newer events are applied", () => {
    const scheduler = createManualSourceManifestScheduler();
    const store = new SourceManifestStore(fakeClient(), { scheduler });

    store.applyEvent(event({ sequence: 3, readingUnitManifestId: "rum-3" }));
    store.applyEvent(event({ sequence: 2, readingUnitManifestId: "rum-2" }));
    scheduler.flush();

    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]?.lastEvent?.sequence).toBe(3);
  });

  it("fetches an authoritative snapshot and replaces source cache on replay gaps", async () => {
    const scheduler = createManualSourceManifestScheduler();
    const snapshotCalls: string[] = [];
    const client = fakeClient({
      snapshot: (request) => {
        snapshotCalls.push(`${request.sourceId}:${request.sourceRevisionId ?? "current"}`);
        return Promise.resolve(snapshot({ latestSequence: 12 }));
      },
    });
    const store = new SourceManifestStore(client, { scheduler });
    store.applyEvent(event({ sequence: 4, readingUnitManifestId: "stale-rum" }));
    scheduler.flush();

    await store.applyReplay({
      sourceId: "source-1",
      afterSequence: 4,
      events: [event({ sequence: 5, readingUnitManifestId: "truncated-rum" })],
      gap: true,
      snapshotRequired: true,
      latestSequence: 12,
    });
    scheduler.flush();

    expect(snapshotCalls).toEqual(["source-1:current"]);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({
      identity: {
        sourceId: "source-1",
        sourceRevisionId: "rev-1",
        readingUnitManifestId: "rum-1",
        readalongManifestId: "ram-1",
      },
      lastEvent: null,
      latestSequence: 12,
      updatedFrom: "snapshot",
    });
  });

  it("reconnects from the latest source cursor and uses snapshot fallback after restart gaps", async () => {
    const replayRequests: { sourceId: string; afterSequence?: number }[] = [];
    const client = fakeClient({
      replay: (request) => {
        replayRequests.push(request);
        if (request.afterSequence === 0) {
          return Promise.resolve(replay({ events: [event({ sequence: 4 })], latestSequence: 4 }));
        }
        return Promise.resolve(
          replay({
            afterSequence: request.afterSequence,
            gap: true,
            snapshotRequired: true,
            latestSequence: 4,
          }),
        );
      },
      snapshot: () => Promise.resolve(snapshot({ latestSequence: 4 })),
    });
    const store = new SourceManifestStore(client, {
      replayLimit: 32,
      scheduler: createManualSourceManifestScheduler(),
    });

    await store.reconnectSource("source-1");
    await store.reconnectSource("source-1");

    expect(replayRequests).toEqual([
      { sourceId: "source-1", afterSequence: 0, limit: 32 },
      { sourceId: "source-1", afterSequence: 4, limit: 32 },
    ]);
    expect(store.snapshot()[0]?.updatedFrom).toBe("snapshot");
  });

  it("resets source sequence to lower authoritative snapshot after restart gaps", async () => {
    const replayRequests: { sourceId: string; afterSequence?: number }[] = [];
    const scheduler = createManualSourceManifestScheduler();
    const client = fakeClient({
      replay: (request) => {
        replayRequests.push({ sourceId: request.sourceId, afterSequence: request.afterSequence });
        return Promise.resolve(
          replay({
            afterSequence: request.afterSequence,
            events: [event({ sequence: 2 })],
            latestSequence: 2,
          }),
        );
      },
      snapshot: () => Promise.resolve(snapshot({ latestSequence: 1, cursor: "source-1:1" })),
    });
    const store = new SourceManifestStore(client, { scheduler });
    store.applyEvent(event({ sequence: 4, readingUnitManifestId: "pre-restart-rum" }));
    scheduler.flush();

    await store.applyReplay({
      sourceId: "source-1",
      afterSequence: 4,
      events: [],
      gap: true,
      snapshotRequired: true,
      latestSequence: 4,
    });
    scheduler.flush();

    expect(store.latestSequence("source-1")).toBe(1);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({
      latestSequence: 1,
      updatedFrom: "snapshot",
    });

    await store.reconnectSource("source-1");
    scheduler.flush();

    expect(replayRequests).toEqual([{ sourceId: "source-1", afterSequence: 1 }]);
    const postRestartEntry = store.snapshot()[0];
    expect(postRestartEntry.latestSequence).toBe(2);
    expect(postRestartEntry.lastEvent?.sequence).toBe(2);
    expect(postRestartEntry.updatedFrom).toBe("event");
  });

  it("treats lower non-gap replay as restart reset and accepts post-restart events", async () => {
    const replayRequests: { sourceId: string; afterSequence?: number }[] = [];
    const snapshotCalls: string[] = [];
    const scheduler = createManualSourceManifestScheduler();
    const client = fakeClient({
      replay: (request) => {
        replayRequests.push({ sourceId: request.sourceId, afterSequence: request.afterSequence });
        return Promise.resolve(
          replay({
            afterSequence: request.afterSequence,
            events: [event({ sequence: 2, readingUnitManifestId: "post-restart-rum" })],
            latestSequence: 2,
          }),
        );
      },
      snapshot: (request) => {
        snapshotCalls.push(request.sourceId);
        return Promise.resolve(snapshot({ latestSequence: 1, cursor: "source-1:1" }));
      },
    });
    const store = new SourceManifestStore(client, { scheduler });
    store.applyEvent(event({ sequence: 4, readingUnitManifestId: "pre-restart-rum" }));
    scheduler.flush();

    await store.applyReplay({
      sourceId: "source-1",
      afterSequence: 4,
      events: [],
      gap: false,
      snapshotRequired: false,
      latestSequence: 1,
    });
    scheduler.flush();

    expect(snapshotCalls).toEqual(["source-1"]);
    expect(store.latestSequence("source-1")).toBe(1);
    expect(store.snapshot()).toHaveLength(1);
    expect(store.snapshot()[0]).toMatchObject({
      latestSequence: 1,
      updatedFrom: "snapshot",
    });

    await store.reconnectSource("source-1");
    scheduler.flush();

    expect(replayRequests).toEqual([{ sourceId: "source-1", afterSequence: 1 }]);
    const postRestartEntry = store.snapshot()[0];
    expect(postRestartEntry.latestSequence).toBe(2);
    expect(postRestartEntry.lastEvent?.sequence).toBe(2);
    expect(postRestartEntry.identity.readingUnitManifestId).toBe("post-restart-rum");
    expect(postRestartEntry.updatedFrom).toBe("event");
  });

  it("disposes source caches and stream subscriptions without durable residue", async () => {
    const disposed: string[] = [];
    const scheduler = createManualSourceManifestScheduler();
    const store = new SourceManifestStore(
      fakeClient({
        replay: () => Promise.resolve(replay({ latestSequence: 0 })),
        subscribe: (request) => {
          return () => disposed.push(request.sourceId);
        },
      }),
      { scheduler },
    );
    await store.connectSource("source-1");
    store.applyEvent(event({ sequence: 1 }));
    scheduler.flush();

    store.disposeSource("source-1");
    scheduler.flush();

    expect(disposed).toEqual(["source-1"]);
    expect(store.snapshot()).toEqual([]);
    expect(store.latestSequence("source-1")).toBe(0);

    await store.connectSource("source-1");
    store.dispose();
    expect(disposed).toEqual(["source-1", "source-1"]);
    expect(store.snapshot()).toEqual([]);
  });
});

function replay(overrides: Partial<SourceManifestEventReplay> = {}): SourceManifestEventReplay {
  return {
    sourceId: "source-1",
    afterSequence: 0,
    events: [],
    gap: false,
    snapshotRequired: false,
    latestSequence: 0,
    ...overrides,
  };
}

function event(overrides: {
  sequence: number;
  sourceId?: string;
  sourceRevisionId?: string;
  readingUnitManifestId?: string;
  readalongManifestId?: string;
}): SourceManifestEvent {
  return {
    schemaVersion: "source-manifest-event.v1",
    eventId: `evt-${String(overrides.sequence)}`,
    sourceId: overrides.sourceId ?? "source-1",
    sequence: overrides.sequence,
    occurredAt: "2026-07-07T09:00:00Z",
    eventType: "readalong_manifest_written",
    snapshotAvailable: true,
    cursor: `${overrides.sourceId ?? "source-1"}:${String(overrides.sequence)}`,
    subject: {
      sourceRevisionId: overrides.sourceRevisionId ?? "rev-1",
      extractionRevisionId: "extract-1",
      readingUnitManifestId: overrides.readingUnitManifestId ?? "rum-1",
      readalongManifestId: overrides.readalongManifestId ?? "ram-1",
      state: "current",
    },
    snapshotManifestId: overrides.readalongManifestId ?? "ram-1",
  };
}

function snapshot(
  overrides: Partial<SourceManifestSnapshotFallback> = {},
): SourceManifestSnapshotFallback {
  return {
    sourceId: "source-1",
    sourceRevisionId: "rev-1",
    cursor: "source-1:4",
    latestSequence: 4,
    sourceEnvelope: {
      schemaVersion: "source-envelope.v1",
      sourceId: "source-1",
      sourceKind: "project",
      projectId: "project-1",
      currentRevisionId: "rev-1",
      lifecycle: "active",
      origin: {},
      createdAt: "2026-07-07T09:00:00Z",
    },
    sourceRevision: {
      schemaVersion: "source-revision.v1",
      revisionId: "rev-1",
      sourceId: "source-1",
      createdAt: "2026-07-07T09:00:00Z",
      revisionOrdinal: 1,
      revisionState: "current",
      contentHash: "sha256:1",
      rawArtifact: {},
    },
    currentReadingUnitManifest: {
      schemaVersion: "reading-unit-manifest.v1",
      manifestId: "rum-1",
      sourceId: "source-1",
      sourceRevisionId: "rev-1",
      extractionRevisionId: "extract-1",
      manifestRevision: 1,
      state: "current",
      generatedAt: "2026-07-07T09:00:01Z",
      units: [],
      summary: { unitCount: 0 },
    },
    currentReadalongManifest: {
      schemaVersion: "readalong-manifest.v1",
      manifestId: "ram-1",
      sourceId: "source-1",
      sourceRevisionId: "rev-1",
      extractionRevisionId: "extract-1",
      readingUnitManifestId: "rum-1",
      manifestRevision: 1,
      state: "current",
      generatedAt: "2026-07-07T09:00:02Z",
      unitIds: [],
    },
    ...overrides,
  };
}

function fakeClient(
  overrides: {
    replay?: SourceManifestClient["replaySourceManifestEvents"];
    snapshot?: SourceManifestClient["getSourceManifestSnapshot"];
    subscribe?: NonNullable<SourceManifestClient["subscribeToSourceManifestEvents"]>;
  } = {},
): SourceManifestClient {
  return {
    replaySourceManifestEvents: overrides.replay ?? (() => Promise.resolve(replay())),
    getSourceManifestSnapshot: overrides.snapshot ?? (() => Promise.resolve(snapshot())),
    subscribeToSourceManifestEvents: overrides.subscribe,
  };
}
