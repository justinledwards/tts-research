import { describe, expect, it } from "vitest";
import type { HighlightFragment, HighlightMap, HighlightToken } from "../../types";
import { ReadAlongClock, startReadAlongPlaybackClock } from "./ReadAlongClock";
import { detectReadAlongDrift } from "./driftDetection";
import {
  ReadAlongResyncController,
  resolveReadAlongRuntimeSnapshot,
} from "./ReadAlongResyncController";

describe("read-along runtime drift detection", () => {
  it("keeps trusted word timing synced when the rendered token is inside budget", () => {
    const snapshot = resolveReadAlongRuntimeSnapshot({
      audioTimeSec: 0.2,
      generatedAudioState: "ready",
      highlightMap: highlightMap(),
      isPlaying: true,
    });

    expect(snapshot.state).toBe("synced-word");
    expect(snapshot.mode).toBe("word");
    expect(snapshot.activeCue?.activeWordIndex).toBe(0);
    expect(snapshot.driftMs).toBe(0);
  });

  it("snaps to phrase sync when a stale rendered word exceeds the word budget", () => {
    const map = highlightMap();
    const staleCue = {
      activeWordIndex: 0,
      fragment: map.fragments[0],
      fragmentIndex: 0,
      mode: "word" as const,
      phraseWordEnd: 2,
      phraseWordStart: 0,
      readingPosition: { activeWordIndex: 0 },
      token: map.tokens[0],
      tokenIndex: 0,
    };
    const controller = new ReadAlongResyncController();

    const snapshot = controller.resolve({
      activeCue: staleCue,
      audioTimeSec: 0.72,
      generatedAudioState: "ready",
      highlightMap: map,
      isPlaying: true,
    });

    expect(snapshot.state).toBe("resyncing");
    expect(snapshot.mode).toBe("phrase");
    expect(snapshot.activeCue?.token).toBeUndefined();
    expect(snapshot.expectedTokenIndex).toBe(2);
    expect(snapshot.resyncCount).toBe(1);
  });

  it("degrades explicitly when phrase drift exceeds budget", () => {
    const map = highlightMap({
      fragments: [fragment({ endMs: 400, startMs: 0 })],
      tokens: [token({ endMs: 100, index: 0, startMs: 0 })],
    });
    const staleCue = {
      activeWordIndex: 0,
      fragment: map.fragments[0],
      fragmentIndex: 0,
      mode: "phrase" as const,
      phraseWordEnd: 0,
      phraseWordStart: 0,
      readingPosition: { activeWordIndex: 0 },
    };

    const snapshot = resolveReadAlongRuntimeSnapshot({
      activeCue: staleCue,
      audioTimeSec: 1.4,
      generatedAudioState: "ready",
      highlightMap: map,
      isPlaying: true,
    });

    expect(snapshot.state).toBe("degraded");
    expect(snapshot.mode).toBe("block");
    expect(snapshot.reason).toContain("Phrase drift exceeded");
  });

  it("stops active highlight when generated audio is stale", () => {
    const snapshot = resolveReadAlongRuntimeSnapshot({
      audioTimeSec: 0.2,
      generatedAudioState: "stale",
      highlightMap: highlightMap(),
      isPlaying: true,
    });

    expect(snapshot.state).toBe("stale-audio");
    expect(snapshot.activeCue).toBeNull();
    expect(snapshot.reason).toContain("word highlight is stopped");
  });

  it("recomputes the active cue during seek from the audio clock", () => {
    const snapshot = resolveReadAlongRuntimeSnapshot({
      audioTimeSec: 0.72,
      generatedAudioState: "ready",
      highlightMap: highlightMap(),
      isPlaying: true,
      isSeeking: true,
    });

    expect(snapshot.state).toBe("seeking");
    expect(snapshot.activeCue?.activeWordIndex).toBe(2);
    expect(snapshot.reason).toContain("recomputed");
  });

  it("reports drift between rendered cue and audio-time cue", () => {
    const map = highlightMap();
    const report = detectReadAlongDrift({
      activeCue: {
        activeWordIndex: 0,
        fragment: map.fragments[0],
        fragmentIndex: 0,
        mode: "word",
        token: map.tokens[0],
        tokenIndex: 0,
      },
      audioTimeSec: 0.72,
      highlightMap: map,
    });

    expect(report.expectedCue?.tokenIndex).toBe(2);
    expect(report.wordDriftMs).toBeGreaterThan(150);
    expect(report.phraseDriftMs).toBe(0);
  });
});

describe("ReadAlongClock", () => {
  it("samples HTMLAudioElement currentTime and emits frame ticks", () => {
    let frameCallback: ((timestamp: number) => void) | undefined;
    const ticks: number[] = [];
    const audio = { currentTime: 1.25 } as HTMLAudioElement;
    const clock = new ReadAlongClock({
      audioElement: () => audio,
      minFrameIntervalMs: 16,
      onTick: (tick) => {
        ticks.push(tick.audioTimeSec);
      },
      runtime: {
        cancelAnimationFrame: () => {
          frameCallback = undefined;
        },
        now: () => 10,
        requestAnimationFrame: (callback) => {
          frameCallback = callback;
          return 1;
        },
      },
    });

    clock.sample("play");
    expect(ticks).toEqual([1.25]);

    clock.start();
    audio.currentTime = 1.5;
    const scheduledFrame = frameCallback;
    if (!scheduledFrame) {
      throw new Error("Expected ReadAlongClock to schedule an animation frame");
    }
    scheduledFrame(40);
    clock.stop();

    expect(ticks).toEqual([1.25, 1.5]);
  });

  it("does not reschedule a frame after stop is called during a tick", () => {
    const scheduledFrames: ((timestamp: number) => void)[] = [];
    const audio = { currentTime: 0.25 } as HTMLAudioElement;
    const clock = new ReadAlongClock({
      audioElement: () => audio,
      minFrameIntervalMs: 16,
      onTick: () => {
        clock.stop();
      },
      runtime: {
        cancelAnimationFrame: () => {
          scheduledFrames.length = 0;
        },
        now: () => 0,
        requestAnimationFrame: (callback) => {
          scheduledFrames.push(callback);
          return scheduledFrames.length;
        },
      },
    });

    clock.start();
    const frame = scheduledFrames.shift();
    if (!frame) {
      throw new Error("Expected ReadAlongClock to schedule a frame");
    }
    frame(40);

    expect(scheduledFrames).toHaveLength(0);
  });

  it("stops the playback clock when the audio element pauses between frames", () => {
    const scheduledFrames: ((timestamp: number) => void)[] = [];
    const cursors: number[] = [];
    const audio = { currentTime: 1.25, paused: false } as HTMLAudioElement;
    const stop = startReadAlongPlaybackClock({
      audioElement: () => audio,
      onCursor: (cursorSec) => {
        cursors.push(cursorSec);
      },
      runtime: {
        cancelAnimationFrame: () => {
          scheduledFrames.length = 0;
        },
        now: () => 0,
        requestAnimationFrame: (callback) => {
          scheduledFrames.push(callback);
          return scheduledFrames.length;
        },
      },
    });

    expect(cursors).toEqual([1.25]);
    audio.currentTime = 1.5;
    Object.defineProperty(audio, "paused", { configurable: true, value: true });
    const frame = scheduledFrames.shift();
    if (!frame) {
      throw new Error("Expected playback clock to schedule a frame");
    }
    frame(100);
    stop();

    expect(cursors).toEqual([1.25]);
    expect(scheduledFrames).toHaveLength(0);
  });
});

function highlightMap(overrides: Partial<HighlightMap> = {}): HighlightMap {
  return {
    durationMs: 900,
    fragments: [fragment({})],
    generatedAt: "2026-05-25T00:00:00.000Z",
    jobId: "job",
    mode: "word",
    schemaVersion: "highlight-map.v1",
    source: "native",
    status: "ready",
    summary: {
      confidence: { overall: 0.96, segment: 0.95, token: 0.98 },
      drift: {
        corrected: false,
        lowConfidence: false,
        maxAbsoluteMs: 0,
        maxRatio: 0,
        meanAbsoluteMs: 0,
      },
      durationMs: 900,
      fragmentCount: 1,
      lowConfidence: false,
      mode: "word",
      source: "native",
      status: "ready",
      tokenCount: 3,
    },
    tokens: [
      token({ endMs: 250, index: 0, startMs: 0 }),
      token({ endMs: 550, index: 1, startMs: 260 }),
      token({ endMs: 850, index: 2, startMs: 560 }),
    ],
    ...overrides,
  };
}

function fragment(overrides: Partial<HighlightFragment>): HighlightFragment {
  return {
    confidence: 0.95,
    endMs: 900,
    index: 0,
    readingPosition: { activeWordIndex: 0 },
    segmentIndex: 0,
    startMs: 0,
    text: "One two three",
    tokenEnd: 3,
    tokenStart: 0,
    ...overrides,
  };
}

function token(overrides: Partial<HighlightToken>): HighlightToken {
  const index = overrides.index ?? 0;
  return {
    confidence: 0.98,
    endMs: 250,
    fragmentIndex: 0,
    index,
    mode: "word",
    readingPosition: { activeWordIndex: index },
    segmentIndex: 0,
    startMs: 0,
    text: ["One", "two", "three"][index] ?? "word",
    ...overrides,
  };
}
