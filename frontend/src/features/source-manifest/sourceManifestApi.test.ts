import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSourceManifestSnapshot,
  replaySourceManifestEvents,
  sourceManifestEventsStreamUrl,
  subscribeToSourceManifestEvents,
} from "../../api";
import type {
  SourceManifestEvent,
  SourceManifestEventReplay,
  SourceManifestEventSourceLike,
} from "../../api";

describe("source manifest API client", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches typed replay and snapshot fallback endpoints", async () => {
    const requests: string[] = [];
    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requests.push(url);
      if (url.startsWith("/api/source-manifest/events?")) {
        return Promise.resolve(Response.json(replayFixture));
      }
      return Promise.resolve(Response.json(snapshotFixture));
    });

    await expect(
      replaySourceManifestEvents({ sourceId: "source 1", afterSequence: 7, limit: 10 }),
    ).resolves.toMatchObject({ sourceId: "source-1", latestSequence: 9 });
    await expect(
      getSourceManifestSnapshot({ sourceId: "source 1", sourceRevisionId: "rev 1" }),
    ).resolves.toMatchObject({ sourceId: "source-1", sourceRevisionId: "rev-1" });

    expect(requests).toEqual([
      "/api/source-manifest/events?sourceId=source+1&afterSequence=7&limit=10",
      "/api/source-manifest/snapshot?sourceId=source+1&sourceRevisionId=rev+1",
    ]);
  });

  it("builds stream URLs and parses event/gap SSE payloads without a live backend", () => {
    const eventSource = new FakeEventSource();
    const events: SourceManifestEvent[] = [];
    const gaps: SourceManifestEventReplay[] = [];
    const errors: string[] = [];
    const dispose = subscribeToSourceManifestEvents(
      { sourceId: "source-1", afterSequence: 4, limit: 8, once: true },
      {
        onEvent: (event) => events.push(event),
        onGap: (gap) => gaps.push(gap),
        onError: (error) => errors.push(error.message),
      },
      { eventSourceFactory: (url) => eventSource.open(url) },
    );

    expect(eventSource.url).toBe(
      sourceManifestEventsStreamUrl({
        sourceId: "source-1",
        afterSequence: 4,
        limit: 8,
        once: true,
      }),
    );
    expect(eventSource.url).toBe(
      "/api/source-manifest/events/stream?sourceId=source-1&afterSequence=4&limit=8&once=true",
    );

    eventSource.emit("source-manifest-gap", replayFixture);
    eventSource.emit("source-manifest-event", replayFixture.events[0]);
    eventSource.emitRaw("source-manifest-event", "not-json");
    dispose();
    eventSource.emitRaw("error", "");

    expect(gaps).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(errors).toEqual([expect.stringContaining("Unexpected token")]);
    expect(eventSource.closed).toBe(true);
  });
});

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof URL) {
    return input.toString();
  }
  if (typeof input === "string") {
    return input;
  }
  return input.url;
}

class FakeEventSource implements SourceManifestEventSourceLike {
  url = "";
  closed = false;
  private readonly listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();

  open(url: string): SourceManifestEventSourceLike {
    this.url = url;
    return this;
  }

  addEventListener(type: string, listener: (event: Event | MessageEvent<string>) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, payload: unknown): void {
    this.emitRaw(type, JSON.stringify(payload));
  }

  emitRaw(type: string, data: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener({ data } as MessageEvent<string>);
    }
  }
}

const replayFixture: SourceManifestEventReplay = {
  sourceId: "source-1",
  afterSequence: 7,
  events: [
    {
      schemaVersion: "source-manifest-event.v1",
      eventId: "evt-source-1-000009",
      sourceId: "source-1",
      sequence: 9,
      occurredAt: "2026-07-07T09:00:00Z",
      eventType: "readalong_manifest_written",
      snapshotAvailable: true,
      cursor: "source-1:9",
      subject: {
        sourceRevisionId: "rev-1",
        extractionRevisionId: "extract-1",
        readingUnitManifestId: "rum-1",
        readalongManifestId: "ram-1",
        state: "current",
      },
      snapshotManifestId: "ram-1",
    },
  ],
  gap: false,
  snapshotRequired: false,
  latestSequence: 9,
  nextCursor: "source-1:9",
};

const snapshotFixture = {
  sourceId: "source-1",
  sourceRevisionId: "rev-1",
  cursor: "source-1:9",
  latestSequence: 9,
};
