import { describe, expect, it } from "vitest";
import type { HighlightCue } from "../../highlightMap";
import type { ReadAlongRuntimeSnapshot } from "./readAlongState";
import {
  buildReadAlongSyncDebugSnapshot,
  makeSyncDebugManualMarker,
  serializeSyncDebugSnapshot,
  syncDebugSnapshotRows,
  withSyncDebugManualMarker,
} from "./syncDebugSnapshot";

describe("sync debug snapshot", () => {
  it("captures runtime follow-along fields with a reproducible source locator", () => {
    const snapshot = buildReadAlongSyncDebugSnapshot({
      activePhraseText: "hello synchronized world",
      activeWordText: "synchronized",
      capturedAt: "2026-05-26T21:50:00.000Z",
      currentSourceLocator: {
        activeWordIndex: 7,
        blockId: "chapter-1",
        kind: "book",
        sourceId: "book-1",
        sourceTitle: "Golden minute",
        value: "book:book-1:chapter-1:word-7",
      },
      runtime: runtimeSnapshot(),
      surface: "BookCinema",
    });

    expect(snapshot.schemaVersion).toBe("sync-debug-snapshot.v1");
    expect(snapshot.currentAudioTimestamp).toBe("00:12.35");
    expect(snapshot.activeSegment.label).toBe("Segment 3");
    expect(snapshot.activePhrase.text).toBe("hello synchronized world");
    expect(snapshot.activeWord.text).toBe("synchronized");
    expect(snapshot.timingSource).toBe("trusted-word");
    expect(snapshot.currentSourceLocator.value).toBe("book:book-1:chapter-1:word-7");
    expect(syncDebugSnapshotRows(snapshot).map((row) => row.label)).toContain("Drift");
  });

  it("keeps manual QA markers visible in copied/exported JSON", () => {
    const snapshot = buildReadAlongSyncDebugSnapshot({
      capturedAt: "2026-05-26T21:50:00.000Z",
      currentSourceLocator: {
        activeWordIndex: 4,
        kind: "prepared-source",
        sourceId: "source-1",
        value: "prepared-source:source-1:block-1:word-4",
      },
      runtime: runtimeSnapshot(),
      surface: "DocumentCinema",
    });
    const marked = withSyncDebugManualMarker(
      snapshot,
      makeSyncDebugManualMarker(snapshot, "Observed highlight drift.", "2026-05-26T21:51:00.000Z"),
    );

    expect(marked.manualQaMarker?.reason).toBe("Observed highlight drift.");
    expect(serializeSyncDebugSnapshot(marked)).toContain('"manualQaMarker"');
    expect(serializeSyncDebugSnapshot(marked)).toContain("prepared-source:source-1");
  });
});

function runtimeSnapshot(): ReadAlongRuntimeSnapshot {
  return {
    activeCue: cue(),
    activeTokenIndex: 4,
    audioTimeSec: 12.345,
    confidence: 0.91,
    driftMs: 42,
    expectedCue: cue(),
    expectedTokenIndex: 4,
    mode: "word",
    reason: "Trusted word timing is within the runtime drift budget.",
    resyncCount: 2,
    state: "synced-word",
    timingSource: "trusted-word",
  };
}

function cue(): HighlightCue {
  return {
    activeWordIndex: 7,
    fragment: {
      confidence: 0.9,
      endMs: 12_800,
      index: 3,
      readingPosition: { activeWordIndex: 7, nodeId: "chapter-1" },
      segmentIndex: 2,
      startMs: 12_000,
      text: "hello synchronized world",
    },
    fragmentIndex: 3,
    mode: "word",
    phraseWordEnd: 9,
    phraseWordStart: 7,
    readingPosition: { activeWordIndex: 7, nodeId: "chapter-1" },
    token: {
      confidence: 0.92,
      endMs: 12_500,
      fragmentIndex: 3,
      index: 4,
      mode: "word",
      readingPosition: { activeWordIndex: 7, nodeId: "chapter-1" },
      segmentIndex: 2,
      startMs: 12_300,
      text: "synchronized",
    },
    tokenIndex: 4,
  };
}
