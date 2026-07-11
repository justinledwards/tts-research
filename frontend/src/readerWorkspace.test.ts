import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  ReaderWorkspacePreconditionError,
  type ReaderWorkspaceSnapshot,
  type ReaderWorkspaceVersionedSnapshot,
} from "./api";
import {
  authoritativePreparedProgress,
  authoritativeResumePlan,
  locatorEnvelopeForReadingPosition,
  projectIdFromSearch,
  projectLoaderResponseIsCurrent,
  projectReaderWorkspaceIntent,
  ReaderWorkspaceClient,
  ReaderWorkspaceRestorationCoordinator,
  type ReaderWorkspaceView,
  readerWorkspaceBaselineResponseIsCurrent,
  readerWorkspaceBlockNavigationPosition,
  readerWorkspaceNominationFromBaseline,
  readerWorkspacePersistenceDecision,
  readerWorkspaceSuccessfulAckNeedsRestoration,
  resolveAuthoritativePreparedBlockId,
  resolveAuthoritativeSourceKind,
  serverWorkspaceOwnsNavigation,
  validateAuthoritativeVoiceJob,
  visibleAuthoritativePreparedProgress,
} from "./readerWorkspace";
import type { VoiceJob } from "./types";

function snapshot(overrides: Partial<ReaderWorkspaceSnapshot> = {}): ReaderWorkspaceSnapshot {
  return {
    schemaVersion: "reader_workspace_snapshot.v1",
    projectId: "project-1",
    projectRevision: 7,
    readMode: "paused",
    sourceId: "source-exact",
    sourceRevisionId: "revision-exact",
    sourceContentHash: "hash-exact",
    runId: "run-exact",
    runCompatibilityKey: "compat-exact",
    mediaManifestVersion: 31,
    timingRevision: 11,
    syncFidelity: "exact_word",
    readerLocator: null,
    playbackCursorMs: 4200,
    playbackRate: 1.25,
    followPreference: true,
    updatedAt: "2026-07-11T10:00:00Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, reject, resolve };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("reader workspace persistence", () => {
  it("rejects a delayed conflict-restoration baseline after a retry acknowledgement", () => {
    const conflictRestorationGeneration = 1;
    const retryAcknowledgementGeneration = 2;

    expect(
      readerWorkspaceBaselineResponseIsCurrent(
        conflictRestorationGeneration,
        retryAcknowledgementGeneration,
      ),
    ).toBe(true);
    expect(
      readerWorkspaceBaselineResponseIsCurrent(
        retryAcknowledgementGeneration,
        conflictRestorationGeneration,
      ),
    ).toBe(false);

    const appSource = readFileSync(new URL("App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain(
      "installReaderWorkspaceBaseline(authoritativeSnapshot, responseGeneration)",
    );
    expect(
      appSource.match(/installReaderWorkspaceBaseline\(restorationBaseline, responseGeneration\)/g),
    ).toHaveLength(3);
  });

  it("persists block navigation only with matching authoritative source provenance", () => {
    expect(readerWorkspaceBlockNavigationPosition("source-1", "source-1", "block-2")).toEqual({
      nodeId: "block-2",
    });
    expect(readerWorkspaceBlockNavigationPosition("source-1", "source-2", "block-2")).toBeNull();
    expect(readerWorkspaceBlockNavigationPosition(null, "source-1", "block-2")).toBeNull();
  });

  it("keeps App writes blocked across restoration until explicit reader intent advances", () => {
    const appSource = readFileSync(new URL("App.tsx", import.meta.url), "utf8");

    expect(appSource).toContain(
      "readerWorkspaceBlockedIntentGenerationRef.current =\n        readerWorkspaceUserIntentGenerationRef.current",
    );
    expect(appSource).toContain(
      "readerWorkspaceBlockedIntentGenerationRef.current,\n      readerWorkspaceUserIntentGeneration",
    );
    expect(appSource).toContain("setReaderWorkspaceUserIntentGeneration(nextGeneration)");
    expect(appSource).toContain(
      "readAlongPreferences.scrollFollow,\n    readerWorkspaceNomination,\n    readerWorkspaceUserIntentGeneration,",
    );
    expect(appSource.match(/playbackControls=\{userIntentPlaybackControls\}/g)).toHaveLength(6);
    expect(appSource).toContain(
      "seekPlaybackToSeconds(userIntentPlaybackControls, seekTargetSec, playbackCursorSec)",
    );
    expect(appSource).toContain(
      "(sourceId: string | null, blockId: string) => {\n      markReaderWorkspaceUserIntent();\n      setAuthoritativePreparedResume(null);\n      setPreparedReaderNavigationPosition(\n        readerWorkspaceBlockNavigationPosition(",
    );
    expect(appSource).toContain(
      "onUserNavigate={(blockId) => {\n                      markReaderWorkspaceBlockNavigation(workspaceContext.sourceId, blockId)",
    );
    expect(appSource).toContain(
      "onReviewBlockChange={(blockId) => {\n                setWorkspaceContext((currentContext) =>",
    );
    expect(appSource).toContain(
      "onReviewUserNavigate={(blockId) => {\n                markReaderWorkspaceBlockNavigation(workspaceContext.sourceId, blockId)",
    );
    expect(appSource).toContain(
      'state.event === "write-ack" || state.event === "conflict-retry-ack"',
    );
    expect(appSource).toContain("coordinator?.installBaseline(projectId)");
    expect(appSource).toContain(
      "readerWorkspaceRestorationRef.current?.cancelForUserIntent(projectId)",
    );
    expect(appSource).toContain(
      "if (nextIssueBlockId) {\n          markReaderWorkspaceBlockNavigation(workspaceContext.sourceId, nextIssueBlockId)",
    );
    expect(appSource.match(/markReaderWorkspaceBlockNavigation\(/g)?.length).toBeGreaterThanOrEqual(
      8,
    );
  });

  it("publishes the second-conflict warning after App clearing and hydration effects", () => {
    const appSource = readFileSync(new URL("App.tsx", import.meta.url), "utf8");
    const restoreStart = appSource.indexOf("readerWorkspaceStateHandlerRef.current = (state)");
    const restoreEnd = appSource.indexOf("\n  useEffect(() => {", restoreStart);
    const restoreSource = appSource.slice(restoreStart, restoreEnd);
    const clearIndex = restoreSource.indexOf("clearVisibleProjectWorkspace(projectId)");
    const applyIndex = restoreSource.indexOf("applyJobStatusState(restoredJob)");
    const finalReadyIndex = restoreSource.lastIndexOf("setProjectStateReadyId(projectId)");
    const finalWarningIndex = restoreSource.lastIndexOf(
      "if (conflictWarning) setError(conflictWarning)",
    );

    expect(restoreStart).toBeGreaterThanOrEqual(0);
    expect(restoreEnd).toBeGreaterThan(restoreStart);
    expect(clearIndex).toBeGreaterThanOrEqual(0);
    expect(applyIndex).toBeGreaterThan(clearIndex);
    expect(finalReadyIndex).toBeGreaterThan(applyIndex);
    expect(finalWarningIndex).toBeGreaterThan(finalReadyIndex);
  });

  it("resolves the deterministic clean-browser project query seam", () => {
    expect(projectIdFromSearch("?projectId=project%20one")).toBe("project one");
    expect(projectIdFromSearch("?projectId=%20%20")).toBeNull();
    expect(projectIdFromSearch("?jobId=old")).toBeNull();
  });

  it("resolves source kind only after both authoritative inventories are available", () => {
    expect(resolveAuthoritativeSourceKind("book-1", ["book-1"], ["prepared-1"])).toBe("book");
    expect(resolveAuthoritativeSourceKind("prepared-1", ["book-1"], ["prepared-1"])).toBe(
      "prepared",
    );
    expect(() => resolveAuthoritativeSourceKind("missing", ["book-1"], ["prepared-1"])).toThrow(
      /absent/,
    );
    expect(() => resolveAuthoritativeSourceKind("duplicate", ["duplicate"], ["duplicate"])).toThrow(
      /ambiguous/,
    );
  });

  it("builds the App resume transaction with exact cursor, locator, and no autoplay", () => {
    const locator = {
      activeWordIndex: 17,
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      locator: { html: { fragment: "node-exact", href: "chapter.html" }, type: "html" as const },
      sourceId: "source-exact",
      nodeId: "node-exact",
      scopeKey: "chapter:4",
      textQuote: "exact words",
    };
    const workspace = snapshot({ readerLocator: locator, playbackCursorMs: 4321 });
    const readingPosition = {
      activeWordIndex: 17,
      locator: locator.locator,
      locatorEnvelope: locator,
      nodeId: "node-exact",
      scopeKey: "chapter:4",
      textQuote: "exact words",
    };
    expect(authoritativeResumePlan(workspace)).toEqual({
      autoplay: false,
      playbackRate: 1.25,
      readingPosition,
      seconds: 4.321,
    });
    expect(authoritativePreparedProgress("project-1", workspace)).toMatchObject({
      activeWordIndex: 17,
      currentTimeSec: 4.321,
      preparedSourceId: "source-exact",
      projectId: "project-1",
      readingPosition,
      targetId: "prepared:source-exact",
    });
    expect(
      resolveAuthoritativePreparedBlockId(
        { id: "source-exact", blocks: [{ id: "node-exact", text: "exact words" }] },
        readingPosition,
      ),
    ).toBe("node-exact");
    expect(
      resolveAuthoritativePreparedBlockId(
        {
          id: "source-exact",
          blocks: [
            {
              id: "fallback-node",
              metadata: {
                locator: {
                  type: "html",
                  html: { href: "chapter.html", fragment: "node-exact" },
                },
              },
            },
          ],
        },
        {
          ...readingPosition,
          nodeId: undefined,
          locatorEnvelope: { ...locator, nodeId: undefined, scopeKey: undefined },
          scopeKey: undefined,
          textQuote: undefined,
        },
      ),
    ).toBe("fallback-node");
    const preparedProgress = authoritativePreparedProgress("project-1", {
      ...workspace,
      readerLocator: {
        ...locator,
        activeWordIndex: undefined,
        nodeId: "target-node",
      },
    });
    expect(
      preparedProgress &&
        visibleAuthoritativePreparedProgress(
          {
            id: "source-exact",
            blocks: [
              { id: "first-node", spokenText: "one two three" },
              { id: "target-node", spokenText: "four five" },
            ],
          },
          preparedProgress,
        ).activeWordIndex,
    ).toBe(3);
    expect(serverWorkspaceOwnsNavigation("project-1", "project-1")).toBe(true);
    expect(serverWorkspaceOwnsNavigation("project-1", null, "project-1")).toBe(true);
    expect(serverWorkspaceOwnsNavigation("project-1", "project-2", "project-2")).toBe(false);
    expect(projectLoaderResponseIsCurrent("project-a", 1, "project-a", 3)).toBe(false);
    expect(projectLoaderResponseIsCurrent("project-a", 3, "project-a", 3)).toBe(true);
    expect(
      locatorEnvelopeForReadingPosition({ activeWordIndex: 42 }, "prepared-source"),
    ).toBeNull();
    const baseline = snapshot({ playbackCursorMs: 1000 });
    const blocked = snapshot({ playbackCursorMs: 2000 });
    expect(readerWorkspacePersistenceDecision(baseline, blocked, 4, 4)).toBe("blocked");
    expect(
      readerWorkspacePersistenceDecision(
        baseline,
        snapshot({ playbackCursorMs: 3000, readerLocator: null }),
        4,
        4,
      ),
    ).toBe("blocked");
    expect(
      readerWorkspacePersistenceDecision(baseline, snapshot({ playbackCursorMs: 3000 }), 4, 5),
    ).toBe("write");
  });

  it("accepts only the exact run/project/exposed source identity", () => {
    const exact = snapshot({ projectId: "project-1", sourceId: "book-1", runId: "run-1" });
    const job = { id: "run-1", projectId: "project-1", bookSourceId: "book-1" } as VoiceJob;
    expect(() => {
      validateAuthoritativeVoiceJob(job, exact, "book");
    }).not.toThrow();
    expect(() => {
      validateAuthoritativeVoiceJob({ ...job, id: "newest-compatible" }, exact, "book");
    }).toThrow(/identity/);
    expect(() => {
      validateAuthoritativeVoiceJob({ ...job, bookSourceId: "book-2" }, exact, "book");
    }).toThrow(/different source/);
  });

  it("invalidates late restoration work on project switch or a newer snapshot", () => {
    const coordinator = new ReaderWorkspaceRestorationCoordinator();
    const first = coordinator.begin("first", snapshot({ projectId: "first" }));
    coordinator.invalidate("second");
    expect(coordinator.isCurrent(first)).toBe(false);

    const older = coordinator.begin(
      "second",
      snapshot({ projectId: "second", projectRevision: 1 }),
    );
    const newer = coordinator.begin(
      "second",
      snapshot({ projectId: "second", projectRevision: 2 }),
    );
    expect(coordinator.isCurrent(older)).toBe(false);
    expect(coordinator.isCurrent(newer)).toBe(true);
  });

  it("supersedes delayed conflict hydration with acknowledged hydration", () => {
    const coordinator = new ReaderWorkspaceRestorationCoordinator();
    const delayedConflict = coordinator.begin("project-1", snapshot({ playbackCursorMs: 1000 }));

    coordinator.invalidate("project-1");
    const acknowledged = coordinator.begin("project-1", snapshot({ playbackCursorMs: 2000 }));

    expect(coordinator.complete(delayedConflict)).toBe(false);
    expect(coordinator.isCurrent(acknowledged)).toBe(true);
    expect(coordinator.complete(acknowledged)).toBe(true);
  });

  it("cancels only acknowledgement hydration on intervening explicit intent", () => {
    const coordinator = new ReaderWorkspaceRestorationCoordinator();
    const initialLoad = coordinator.begin("project-1", snapshot(), { intentGeneration: 4 });

    expect(coordinator.cancelForUserIntent("project-1")).toBe(false);
    expect(coordinator.isCurrent(initialLoad, 5)).toBe(false);
    expect(coordinator.isPersistenceEnabled("project-1")).toBe(false);

    coordinator.installBaseline("project-1");
    const acknowledgement = coordinator.begin("project-1", snapshot({ playbackCursorMs: 0 }), {
      cancelOnUserIntent: true,
      intentGeneration: 5,
    });
    expect(coordinator.isCurrent(acknowledgement, 5)).toBe(true);
    expect(coordinator.isCurrent(acknowledgement, 6)).toBe(false);
    expect(coordinator.cancelForUserIntent("project-1")).toBe(true);
    expect(coordinator.complete(acknowledgement, 5)).toBe(false);
    expect(coordinator.isPersistenceEnabled("project-1")).toBe(true);
  });

  it("derives a cancellation nomination from only a source-bearing authoritative baseline", () => {
    const baseline = snapshot({ sourceId: "source-authoritative", runId: "run-authoritative" });

    expect(readerWorkspaceNominationFromBaseline(baseline)).toEqual({
      sourceId: "source-authoritative",
      runId: "run-authoritative",
    });
    expect(readerWorkspaceNominationFromBaseline({ sourceId: null, runId: null })).toBeNull();
    expect(readerWorkspaceNominationFromBaseline(null)).toBeNull();

    const replacement = { sourceId: "source-new", runId: "run-new" };
    expect(
      projectReaderWorkspaceIntent(baseline, replacement, {
        readMode: baseline.readMode,
        readingPosition: undefined,
        playbackCursorMs: baseline.playbackCursorMs ?? 0,
        playbackRate: baseline.playbackRate ?? 1,
        followPreference: baseline.followPreference ?? false,
      }),
    ).toMatchObject({
      sourceId: "source-new",
      runId: "run-new",
      readerLocator: null,
      playbackCursorMs: 0,
    });
  });

  it("restores exact server identity and paused state without inventing autoplay", async () => {
    const states: ReaderWorkspaceView[] = [];
    const exact = snapshot();
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: exact, etag: '"etag-7"' }),
      onChange: (state) => states.push(state),
    });

    await client.load("project-1");

    expect(states.at(-1)).toEqual({
      projectId: "project-1",
      snapshot: exact,
      baselineSnapshot: exact,
      etag: '"etag-7"',
      status: "ready",
      event: "authoritative-load",
      error: null,
    });
    expect(states.at(-1)?.snapshot).toMatchObject({
      readMode: "paused",
      sourceId: "source-exact",
      sourceRevisionId: "revision-exact",
      sourceContentHash: "hash-exact",
      runId: "run-exact",
      playbackCursorMs: 4200,
      playbackRate: 1.25,
      followPreference: true,
    });
    expect(states.at(-1)?.snapshot).not.toHaveProperty("autoplay");
  });

  it("ignores a late GET after switching projects", async () => {
    const first = deferred<ReaderWorkspaceVersionedSnapshot>();
    const second = deferred<ReaderWorkspaceVersionedSnapshot>();
    const states: ReaderWorkspaceView[] = [];
    const get = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const client = new ReaderWorkspaceClient({ get, onChange: (state) => states.push(state) });

    const firstLoad = client.load("first");
    const secondLoad = client.load("second");
    second.resolve({ snapshot: snapshot({ projectId: "second" }), etag: '"second"' });
    await secondLoad;
    first.resolve({ snapshot: snapshot({ projectId: "first" }), etag: '"first"' });
    await firstLoad;

    expect(states.at(-1)?.projectId).toBe("second");
    expect(states.at(-1)?.snapshot?.projectId).toBe("second");
  });

  it("serializes PUTs and coalesces to the latest desired update", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const calls: { etag: string; snapshot: ReaderWorkspaceSnapshot }[] = [];
    const put = vi.fn((_id, value: ReaderWorkspaceSnapshot, etag: string) => {
      calls.push({ etag, snapshot: value });
      if (calls.length === 1) return firstPut.promise;
      return Promise.resolve({ snapshot: value, etag: '"etag-9"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: vi.fn(),
    });
    await client.load("project-1");

    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    client.update((current) => ({ ...current, playbackCursorMs: 6000 }));
    client.update((current) => ({ ...current, playbackCursorMs: 7000 }));
    expect(put).toHaveBeenCalledTimes(1);
    const initialCall = calls[0];
    expect(initialCall.etag).toBe('"etag-7"');

    firstPut.resolve({ snapshot: initialCall.snapshot, etag: '"etag-8"' });
    await settle();

    expect(put).toHaveBeenCalledTimes(2);
    expect(calls[1]?.etag).toBe('"etag-8"');
    expect(calls[1]?.snapshot.playbackCursorMs).toBe(7000);
  });

  it("accepts 412 server-current and does not retry without newer unsaved intent", async () => {
    const serverCurrent = snapshot({ projectRevision: 8, playbackCursorMs: 9000 });
    const states: ReaderWorkspaceView[] = [];
    const put = vi
      .fn()
      .mockRejectedValue(new ReaderWorkspacePreconditionError("stale", serverCurrent, '"etag-8"'));
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");

    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    await settle();

    expect(put).toHaveBeenCalledTimes(1);
    expect(states.at(-1)?.snapshot).toBe(serverCurrent);
  });

  it("rebases only cursor-only newer intent over every unrelated server-current reader field", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const serverCurrent = snapshot({
      projectRevision: 8,
      sourceId: "server-source",
      sourceRevisionId: "server-revision",
      sourceContentHash: "server-hash",
      playbackCursorMs: 9000,
      playbackRate: 1.75,
      followPreference: false,
      readMode: "readable",
      readerLocator: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "server-source",
        nodeId: "server-locator",
      },
    });
    const calls: ReaderWorkspaceSnapshot[] = [];
    const put = vi.fn((_id, value: ReaderWorkspaceSnapshot) => {
      calls.push(value);
      if (calls.length === 1) return firstPut.promise;
      return Promise.reject(
        new ReaderWorkspacePreconditionError("stale again", serverCurrent, '"etag-9"'),
      );
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: vi.fn(),
    });
    await client.load("project-1");

    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    client.update((current) => ({ ...current, playbackCursorMs: 6000 }));
    firstPut.reject(new ReaderWorkspacePreconditionError("stale", serverCurrent, '"etag-8"'));
    await settle();

    expect(put).toHaveBeenCalledTimes(2);
    expect(calls[1]).toMatchObject({
      sourceId: "server-source",
      sourceRevisionId: "server-revision",
      sourceContentHash: "server-hash",
      playbackCursorMs: 6000,
      playbackRate: 1.75,
      followPreference: false,
      readMode: "readable",
      readerLocator: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "server-source",
        nodeId: "server-locator",
      },
    });
  });

  it("flushes new-project intent after an old-project PUT settles", async () => {
    const oldPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const calls: { projectId: string; value: ReaderWorkspaceSnapshot }[] = [];
    const put = vi.fn((projectId: string, value: ReaderWorkspaceSnapshot) => {
      calls.push({ projectId, value });
      if (projectId === "old") return oldPut.promise;
      return Promise.resolve({ snapshot: value, etag: '"new-2"' });
    });
    const get = vi
      .fn()
      .mockResolvedValueOnce({ snapshot: snapshot({ projectId: "old" }), etag: '"old-1"' })
      .mockResolvedValueOnce({ snapshot: snapshot({ projectId: "new" }), etag: '"new-1"' });
    const client = new ReaderWorkspaceClient({ get, put, onChange: vi.fn() });
    await client.load("old");
    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));

    await client.load("new");
    client.update((current) => ({ ...current, playbackCursorMs: 8000 }));
    expect(put).toHaveBeenCalledTimes(1);

    oldPut.resolve({ snapshot: snapshot({ projectId: "old" }), etag: '"old-2"' });
    await settle();

    expect(put).toHaveBeenCalledTimes(2);
    expect(calls[1]).toMatchObject({
      projectId: "new",
      value: { projectId: "new", playbackCursorMs: 8000 },
    });
  });

  it("defers conflict reconciliation until the final ack includes intent added during retry", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const retryPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const serverCurrent = snapshot({ projectRevision: 8, playbackRate: 1.75 });
    const states: ReaderWorkspaceView[] = [];
    const sent: ReaderWorkspaceSnapshot[] = [];
    const put = vi.fn((_id: string, value: ReaderWorkspaceSnapshot) => {
      sent.push(value);
      if (sent.length === 1) return firstPut.promise;
      if (sent.length === 2) return retryPut.promise;
      return Promise.resolve({ snapshot: value, etag: '"etag-10"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    client.update((current) => ({ ...current, playbackCursorMs: 6000 }));
    firstPut.reject(new ReaderWorkspacePreconditionError("stale", serverCurrent, '"etag-8"'));
    await settle();
    client.update((current) => ({ ...current, playbackCursorMs: 7000 }));
    const retrySnapshot = sent.at(1);
    if (!retrySnapshot) throw new Error("bounded retry was not issued");
    retryPut.resolve({ snapshot: retrySnapshot, etag: '"etag-9"' });
    await settle();

    expect(put).toHaveBeenCalledTimes(3);
    expect(states.at(-2)?.event).toBe("conflict-retry-pending");
    expect(states.at(-1)?.event).toBe("conflict-retry-ack");
    expect(states.at(-1)?.snapshot).toMatchObject({
      playbackCursorMs: 7000,
      playbackRate: 1.75,
    });
  });

  it("retains newer intent without a third automatic write when the bounded retry conflicts", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const retryPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const states: ReaderWorkspaceView[] = [];
    const sent: ReaderWorkspaceSnapshot[] = [];
    const put = vi.fn((_id: string, value: ReaderWorkspaceSnapshot) => {
      sent.push(value);
      if (sent.length === 1) return firstPut.promise;
      if (sent.length === 2) return retryPut.promise;
      return Promise.resolve({ snapshot: value, etag: '"etag-11"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    client.update((current) => ({ ...current, playbackCursorMs: 6000 }));
    firstPut.reject(
      new ReaderWorkspacePreconditionError("stale", snapshot({ playbackRate: 1.5 }), '"etag-8"'),
    );
    await settle();
    client.update((current) => ({ ...current, playbackCursorMs: 7000 }));
    retryPut.reject(
      new ReaderWorkspacePreconditionError(
        "stale again",
        snapshot({ playbackRate: 1.75 }),
        '"etag-9"',
      ),
    );
    await settle();

    expect(put).toHaveBeenCalledTimes(2);
    const blockedState = states.at(-1);
    expect(blockedState?.event).toBe("conflict-current-pending");
    expect(blockedState?.snapshot).toMatchObject({
      playbackCursorMs: 7000,
      playbackRate: 1.75,
    });
    expect(blockedState?.baselineSnapshot).toMatchObject({
      playbackCursorMs: 4200,
      playbackRate: 1.75,
    });
    if (!blockedState?.snapshot || !blockedState.baselineSnapshot) {
      throw new Error("blocked reconciliation state was incomplete");
    }
    expect(
      readerWorkspacePersistenceDecision(
        blockedState.baselineSnapshot,
        blockedState.snapshot,
        7,
        7,
      ),
    ).toBe("blocked");

    client.update((current) => ({ ...current, playbackCursorMs: 8000 }));
    await settle();
    expect(put).toHaveBeenCalledTimes(3);
    expect(states.at(-1)?.event).toBe("conflict-retry-ack");
    expect(states.at(-1)?.snapshot).toMatchObject({
      playbackCursorMs: 8000,
      playbackRate: 1.75,
    });
  });

  it("labels write acknowledgements without presenting them as authoritative loads", async () => {
    const states: ReaderWorkspaceView[] = [];
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put: vi.fn((_id: string, value: ReaderWorkspaceSnapshot) =>
        Promise.resolve({ snapshot: value, etag: '"etag-8"' }),
      ),
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    await settle();

    expect(states.at(-1)).toMatchObject({ event: "write-ack", etag: '"etag-8"' });
  });

  it("persists only exact-source locators with a non-empty node identity", () => {
    const withoutNode = {
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      sourceId: "source-exact",
      activeWordIndex: 9,
    };
    expect(
      locatorEnvelopeForReadingPosition({ locatorEnvelope: withoutNode }, "source-exact"),
    ).toBeNull();
    expect(
      locatorEnvelopeForReadingPosition(
        {
          activeWordIndex: 9,
          locator: { type: "html", html: { href: "chapter.html", fragment: "node-9" } },
          nodeId: "node-9",
          scopeKey: "chapter:9",
          textQuote: "durable words",
        },
        "source-exact",
      ),
    ).toEqual({
      schemaVersion: "locator-envelope.v1",
      kind: "resume",
      sourceId: "source-exact",
      nodeId: "node-9",
      scopeKey: "chapter:9",
      activeWordIndex: 9,
      locator: { type: "html", html: { href: "chapter.html", fragment: "node-9" } },
      textQuote: "durable words",
    });
  });

  it("distinguishes normalized successful intent from the authoritative baseline", async () => {
    const states: ReaderWorkspaceView[] = [];
    const sent = snapshot({
      playbackCursorMs: 9000,
      readerLocator: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "source-exact",
        nodeId: "node-9",
      },
    });
    const authoritative = snapshot({ runId: null, playbackCursorMs: 0, readerLocator: null });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put: vi.fn().mockResolvedValue({ snapshot: authoritative, etag: '"etag-8"' }),
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update(() => sent, 12);
    await settle();

    expect(states.at(-1)).toMatchObject({
      event: "write-ack",
      snapshot: sent,
      baselineSnapshot: authoritative,
      sentIntentGeneration: 12,
      hasNewerIntent: false,
    });
    expect(readerWorkspaceSuccessfulAckNeedsRestoration(sent, authoritative, 12, 12, false)).toBe(
      true,
    );
    expect(readerWorkspaceSuccessfulAckNeedsRestoration(sent, sent, 12, 12, false)).toBe(false);
    expect(readerWorkspaceSuccessfulAckNeedsRestoration(sent, authoritative, 12, 13, false)).toBe(
      false,
    );

    const appSource = readFileSync(new URL("App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain(
      'state.event === "write-ack" || state.event === "conflict-retry-ack"',
    );
    expect(appSource).toContain(
      "const snapshot = isSuccessfulAcknowledgement ? state.baselineSnapshot : state.snapshot;",
    );
  });

  it("retains an ordinary normalized ACK baseline when navigation cancels hydration", async () => {
    const states: ReaderWorkspaceView[] = [];
    const writes: ReaderWorkspaceSnapshot[] = [];
    const authoritative = snapshot({
      projectRevision: 13,
      sourceId: "source-authoritative",
      sourceRevisionId: "revision-authoritative",
      sourceContentHash: "hash-authoritative",
      runId: null,
      runCompatibilityKey: null,
      readerLocator: null,
      playbackCursorMs: 0,
    });
    const put = vi.fn((_projectId: string, value: ReaderWorkspaceSnapshot) => {
      writes.push(value);
      return Promise.resolve({
        snapshot: writes.length === 1 ? authoritative : value,
        etag: `"etag-${String(writes.length + 7)}"`,
      });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 9000 }), 12);
    await settle();

    const acknowledgement = states.at(-1);
    const retainedBaseline = acknowledgement?.baselineSnapshot;
    if (!retainedBaseline) throw new Error("ordinary acknowledgement omitted its baseline");
    const coordinator = new ReaderWorkspaceRestorationCoordinator();
    coordinator.installBaseline("project-1");
    const delayedHydration = coordinator.begin("project-1", retainedBaseline, {
      cancelOnUserIntent: true,
      intentGeneration: 12,
    });
    const nomination = readerWorkspaceNominationFromBaseline(retainedBaseline);

    expect(acknowledgement.event).toBe("write-ack");
    expect(retainedBaseline).toBe(authoritative);
    expect(coordinator.cancelForUserIntent("project-1")).toBe(true);
    expect(coordinator.complete(delayedHydration, 12)).toBe(false);
    expect(coordinator.isPersistenceEnabled("project-1")).toBe(true);
    expect(nomination).toEqual({ sourceId: "source-authoritative", runId: null });

    const navigation = projectReaderWorkspaceIntent(retainedBaseline, nomination, {
      readMode: retainedBaseline.readMode,
      readingPosition: { nodeId: "node-after-cancel" },
      playbackCursorMs: 3456,
      playbackRate: retainedBaseline.playbackRate ?? 1,
      followPreference: retainedBaseline.followPreference ?? false,
    });
    if (!navigation) throw new Error("baseline nomination did not project navigation");
    const writesBeforeNavigation = writes.length;
    expect(writesBeforeNavigation).toBe(1);
    client.update(() => navigation, 13);
    await settle();

    expect(writes).toHaveLength(writesBeforeNavigation + 1);
    expect(writes.at(-1)).toMatchObject({
      projectRevision: 13,
      sourceId: "source-authoritative",
      sourceRevisionId: "revision-authoritative",
      sourceContentHash: "hash-authoritative",
      runId: null,
      playbackCursorMs: 3456,
      readerLocator: {
        sourceId: "source-authoritative",
        nodeId: "node-after-cancel",
      },
    });

    const appSource = readFileSync(new URL("App.tsx", import.meta.url), "utf8");
    expect(appSource).toContain(
      'if (!isSuccessfulAcknowledgement && !state.event.startsWith("conflict-"))',
    );
    expect(appSource).toContain(
      "readerWorkspaceNominationFromBaseline(readerWorkspaceSnapshotRef.current)",
    );
  });

  it("carries normalized retry intent separately from its authoritative baseline", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const states: ReaderWorkspaceView[] = [];
    const sent: ReaderWorkspaceSnapshot[] = [];
    const authoritative = snapshot({
      projectRevision: 9,
      runId: null,
      readerLocator: null,
      playbackCursorMs: 0,
    });
    const put = vi.fn((_id: string, value: ReaderWorkspaceSnapshot) => {
      sent.push(value);
      return sent.length === 1
        ? firstPut.promise
        : Promise.resolve({ snapshot: authoritative, etag: '"etag-9"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 8000 }), 21);
    client.update((current) => ({ ...current, playbackCursorMs: 9000 }), 22);
    firstPut.reject(
      new ReaderWorkspacePreconditionError(
        "stale",
        snapshot({ projectRevision: 8, playbackRate: 1.5 }),
        '"etag-8"',
      ),
    );
    await settle();

    const retryAcknowledgement = states.at(-1);
    expect(retryAcknowledgement).toMatchObject({
      event: "conflict-retry-ack",
      snapshot: sent[1],
      baselineSnapshot: authoritative,
      sentIntentGeneration: 22,
      hasNewerIntent: false,
    });
    expect(
      readerWorkspaceSuccessfulAckNeedsRestoration(
        retryAcknowledgement?.snapshot ?? authoritative,
        retryAcknowledgement?.baselineSnapshot ?? authoritative,
        retryAcknowledgement?.sentIntentGeneration,
        22,
        retryAcknowledgement?.hasNewerIntent,
      ),
    ).toBe(true);
    expect(
      readerWorkspaceSuccessfulAckNeedsRestoration(
        retryAcknowledgement?.snapshot ?? authoritative,
        retryAcknowledgement?.baselineSnapshot ?? authoritative,
        retryAcknowledgement?.sentIntentGeneration,
        23,
        retryAcknowledgement?.hasNewerIntent,
      ),
    ).toBe(false);
  });

  it("retains a normalized retry ACK baseline when follow intent cancels hydration", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const states: ReaderWorkspaceView[] = [];
    const writes: ReaderWorkspaceSnapshot[] = [];
    const authoritative = snapshot({
      projectRevision: 14,
      sourceId: "source-retry-authoritative",
      sourceRevisionId: "revision-retry-authoritative",
      sourceContentHash: "hash-retry-authoritative",
      runId: "run-retry-authoritative",
      runCompatibilityKey: "compat-retry-authoritative",
      readerLocator: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "source-retry-authoritative",
        nodeId: "node-retry-authoritative",
      },
      playbackCursorMs: 2100,
      playbackRate: 1.75,
      followPreference: true,
    });
    const put = vi.fn((_projectId: string, value: ReaderWorkspaceSnapshot) => {
      writes.push(value);
      if (writes.length === 1) return firstPut.promise;
      return Promise.resolve({
        snapshot: writes.length === 2 ? authoritative : value,
        etag: `"etag-${String(writes.length + 7)}"`,
      });
    });
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put,
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 8000 }), 21);
    client.update((current) => ({ ...current, playbackCursorMs: 9000 }), 22);
    firstPut.reject(
      new ReaderWorkspacePreconditionError(
        "stale",
        snapshot({ projectRevision: 8, playbackRate: 1.5 }),
        '"etag-8"',
      ),
    );
    await settle();

    const acknowledgement = states.at(-1);
    const retainedBaseline = acknowledgement?.baselineSnapshot;
    if (!retainedBaseline) throw new Error("retry acknowledgement omitted its baseline");
    const coordinator = new ReaderWorkspaceRestorationCoordinator();
    coordinator.installBaseline("project-1");
    const delayedHydration = coordinator.begin("project-1", retainedBaseline, {
      cancelOnUserIntent: true,
      intentGeneration: 22,
    });
    const nomination = readerWorkspaceNominationFromBaseline(retainedBaseline);

    expect(acknowledgement.event).toBe("conflict-retry-ack");
    expect(retainedBaseline).toBe(authoritative);
    expect(coordinator.cancelForUserIntent("project-1")).toBe(true);
    expect(coordinator.complete(delayedHydration, 22)).toBe(false);
    expect(nomination).toEqual({
      sourceId: "source-retry-authoritative",
      runId: "run-retry-authoritative",
    });

    const followIntent = projectReaderWorkspaceIntent(retainedBaseline, nomination, {
      readMode: retainedBaseline.readMode,
      readingPosition: undefined,
      playbackCursorMs: retainedBaseline.playbackCursorMs ?? 0,
      playbackRate: retainedBaseline.playbackRate ?? 1,
      followPreference: false,
    });
    if (!followIntent) throw new Error("baseline nomination did not project follow intent");
    const writesBeforeFollowIntent = writes.length;
    expect(writesBeforeFollowIntent).toBe(2);
    client.update(() => followIntent, 23);
    await settle();

    expect(writes).toHaveLength(writesBeforeFollowIntent + 1);
    expect(writes.at(-1)).toMatchObject({
      projectRevision: 14,
      sourceId: "source-retry-authoritative",
      sourceRevisionId: "revision-retry-authoritative",
      sourceContentHash: "hash-retry-authoritative",
      runId: "run-retry-authoritative",
      runCompatibilityKey: "compat-retry-authoritative",
      playbackCursorMs: 2100,
      playbackRate: 1.75,
      followPreference: false,
      readerLocator: {
        sourceId: "source-retry-authoritative",
        nodeId: "node-retry-authoritative",
      },
    });
  });

  it("projects source-only and run-only nominations with source-safe destinations", () => {
    const locator = {
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      sourceId: "source-a",
      nodeId: "node-a",
    };
    const persisted = snapshot({ sourceId: "source-a", runId: "run-a", readerLocator: locator });
    const readerState = {
      readMode: "paused" as const,
      readingPosition: { locatorEnvelope: locator },
      playbackCursorMs: 7000,
      playbackRate: 1.5,
      followPreference: false,
    };

    expect(
      projectReaderWorkspaceIntent(persisted, { sourceId: "source-b", runId: null }, readerState),
    ).toMatchObject({
      sourceId: "source-b",
      runId: null,
      readerLocator: null,
      playbackCursorMs: 0,
    });
    expect(
      projectReaderWorkspaceIntent(
        persisted,
        { sourceId: "source-a", runId: "run-b" },
        readerState,
      ),
    ).toMatchObject({
      sourceId: "source-a",
      runId: "run-b",
      readerLocator: locator,
      playbackCursorMs: 7000,
    });
    expect(projectReaderWorkspaceIntent(persisted, null, readerState)).toBeNull();
  });

  it("fails closed for mismatched existing-envelope and book provenance", () => {
    const persistedLocator = {
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      sourceId: "source-b",
      nodeId: "persisted-node-b",
    };
    const persisted = snapshot({ sourceId: "source-b", readerLocator: persistedLocator });
    const state = {
      readMode: "paused" as const,
      playbackCursorMs: 7000,
      playbackRate: 1.25,
      followPreference: true,
    };
    const envelope = {
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      sourceId: "source-a",
    };

    expect(
      projectReaderWorkspaceIntent(
        persisted,
        { sourceId: "source-b", runId: null },
        {
          ...state,
          readingPosition: { locatorEnvelope: envelope },
        },
      )?.readerLocator,
    ).toBeNull();
    expect(
      projectReaderWorkspaceIntent(
        persisted,
        { sourceId: "source-b", runId: null },
        {
          ...state,
          readingPosition: { bookSourceId: "source-a", nodeId: "node-b" },
        },
      )?.readerLocator,
    ).toBeNull();
    expect(locatorEnvelopeForReadingPosition({ locatorEnvelope: envelope }, "source-b")).toBeNull();
    expect(
      projectReaderWorkspaceIntent(
        persisted,
        { sourceId: "source-b", runId: null },
        {
          ...state,
          readingPosition: undefined,
        },
      )?.readerLocator,
    ).toBe(persistedLocator);
  });

  it("rebases the nomination atomically over server C without a C/run-B hybrid", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const calls: ReaderWorkspaceSnapshot[] = [];
    const serverCurrent = snapshot({
      projectRevision: 12,
      sourceId: "source-c",
      sourceRevisionId: "revision-c",
      sourceContentHash: "hash-c",
      runId: "run-c",
      runCompatibilityKey: "compat-c",
      mediaManifestVersion: 99,
      timingRevision: 88,
      readerLocator: {
        schemaVersion: "locator-envelope.v1",
        kind: "resume",
        sourceId: "source-c",
        nodeId: "node-c",
      },
      playbackCursorMs: 12_000,
    });
    const put = vi.fn((_id: string, value: ReaderWorkspaceSnapshot) => {
      calls.push(value);
      return calls.length === 1
        ? firstPut.promise
        : Promise.resolve({ snapshot: value, etag: '"etag-9"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi
        .fn()
        .mockResolvedValue({ snapshot: snapshot({ sourceId: "source-a" }), etag: '"etag-7"' }),
      put,
      onChange: vi.fn(),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackRate: 1.5 }));
    client.update((current) => ({ ...current, sourceId: "source-b", runId: "run-b" }));
    firstPut.reject(new ReaderWorkspacePreconditionError("stale", serverCurrent, '"etag-8"'));
    await settle();

    expect(calls[1]).toMatchObject({
      sourceId: "source-b",
      runId: "run-b",
      readerLocator: null,
      playbackCursorMs: 0,
      sourceRevisionId: "revision-c",
      sourceContentHash: "hash-c",
      runCompatibilityKey: "compat-c",
      mediaManifestVersion: 99,
      timingRevision: 88,
      projectRevision: 12,
    });
  });

  it("does not rebase a semantically cloned locator over the server locator", async () => {
    const firstPut = deferred<ReaderWorkspaceVersionedSnapshot>();
    const calls: ReaderWorkspaceSnapshot[] = [];
    const locator = {
      schemaVersion: "locator-envelope.v1" as const,
      kind: "resume" as const,
      sourceId: "source-exact",
      locator: {
        html: { fragment: "chapter-start", href: "chapter.html" },
        type: "html" as const,
      },
    };
    const serverLocator = { ...locator, nodeId: "server-node" };
    const put = vi.fn((_id: string, value: ReaderWorkspaceSnapshot) => {
      calls.push(value);
      return calls.length === 1
        ? firstPut.promise
        : Promise.resolve({ snapshot: value, etag: '"etag-9"' });
    });
    const client = new ReaderWorkspaceClient({
      get: vi
        .fn()
        .mockResolvedValue({ snapshot: snapshot({ readerLocator: locator }), etag: '"etag-7"' }),
      put,
      onChange: vi.fn(),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, playbackCursorMs: 5000 }));
    client.update((current) => ({
      ...current,
      playbackCursorMs: 6000,
      readerLocator: structuredClone(locator),
    }));
    firstPut.reject(
      new ReaderWorkspacePreconditionError(
        "stale",
        snapshot({ readerLocator: serverLocator, playbackCursorMs: 9000 }),
        '"etag-8"',
      ),
    );
    await settle();

    expect(calls[1]?.readerLocator).toEqual(serverLocator);
    expect(calls[1]?.playbackCursorMs).toBe(6000);
  });

  it("keeps server-derived acknowledgement fields authoritative", async () => {
    const acknowledged = snapshot({
      projectRevision: 15,
      sourceId: "source-b",
      sourceRevisionId: "revision-b-server",
      sourceContentHash: "hash-b-server",
      runId: "run-b",
      runCompatibilityKey: "compat-b-server",
      mediaManifestVersion: 44,
      timingRevision: 55,
      syncFidelity: "exact_word",
      updatedAt: "2026-07-11T20:00:00Z",
    });
    const states: ReaderWorkspaceView[] = [];
    const client = new ReaderWorkspaceClient({
      get: vi.fn().mockResolvedValue({ snapshot: snapshot(), etag: '"etag-7"' }),
      put: vi.fn().mockResolvedValue({ snapshot: acknowledged, etag: '"etag-8"' }),
      onChange: (state) => states.push(state),
    });
    await client.load("project-1");
    client.update((current) => ({ ...current, sourceId: "source-b", runId: "run-b" }));
    await settle();

    expect(states.at(-1)?.snapshot).toMatchObject({ sourceId: "source-b", runId: "run-b" });
    expect(states.at(-1)?.snapshot).not.toBe(acknowledged);
    expect(states.at(-1)?.baselineSnapshot).toBe(acknowledged);
  });
});
