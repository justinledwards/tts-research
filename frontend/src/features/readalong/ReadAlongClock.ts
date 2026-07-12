export type ReadAlongClockReason = "frame" | "metadata" | "play" | "seek" | "timeupdate";

import { markReadAlongPerformance } from "./readAlongPerformance";

export interface ReadAlongClockTick {
  audioTimeSec: number;
  reason: ReadAlongClockReason;
  timestampMs: number;
}

export interface ReadAlongClockRuntime {
  cancelAnimationFrame: (id: number) => void;
  now: () => number;
  requestAnimationFrame: (callback: (timestamp: number) => void) => number;
}

export interface ReadAlongClockOptions {
  audioElement: () => HTMLAudioElement | null;
  minFrameIntervalMs?: number;
  onTick: (tick: ReadAlongClockTick) => void;
  runtime?: ReadAlongClockRuntime;
}

export interface ReadAlongPlaybackClockOptions {
  audioElement: () => HTMLAudioElement | null;
  minCursorDeltaSec?: number;
  minFrameIntervalMs?: number;
  onCursor: (cursorSec: number) => void;
  runtime?: ReadAlongClockRuntime;
}

const DEFAULT_MIN_FRAME_INTERVAL_MS = 250;
const DEFAULT_MIN_CURSOR_DELTA_SEC = 0.025;

function noopReadAlongClockStop(): void {
  // No active clock was started.
}

export class ReadAlongClock {
  private isRunning = false;
  private frameId: number | null = null;
  private lastEmitMs = 0;
  private readonly minFrameIntervalMs: number;
  private readonly options: ReadAlongClockOptions;
  private readonly runtime: ReadAlongClockRuntime;

  constructor(options: ReadAlongClockOptions) {
    this.options = options;
    this.minFrameIntervalMs = options.minFrameIntervalMs ?? DEFAULT_MIN_FRAME_INTERVAL_MS;
    this.runtime = options.runtime ?? browserReadAlongClockRuntime();
  }

  sample(reason: ReadAlongClockReason): ReadAlongClockTick | null {
    const audio = this.options.audioElement();
    if (!audio) {
      return null;
    }
    const audioTimeSec = Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime) : 0;
    const tick = {
      audioTimeSec,
      reason,
      timestampMs: this.runtime.now(),
    };
    markReadAlongPerformance("cursor-tick");
    this.lastEmitMs = tick.timestampMs;
    this.options.onTick(tick);
    return tick;
  }

  start() {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.schedule();
  }

  stop() {
    this.isRunning = false;
    if (this.frameId === null) {
      return;
    }
    this.runtime.cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  private schedule() {
    if (!this.isRunning) {
      return;
    }
    this.frameId = this.runtime.requestAnimationFrame((timestamp) => {
      this.frameId = null;
      if (!this.isRunning) {
        return;
      }
      if (timestamp - this.lastEmitMs >= this.minFrameIntervalMs) {
        this.sample("frame");
      }
      this.schedule();
    });
  }
}

export function startReadAlongPlaybackClock({
  audioElement,
  minCursorDeltaSec = DEFAULT_MIN_CURSOR_DELTA_SEC,
  minFrameIntervalMs,
  onCursor,
  runtime,
}: ReadAlongPlaybackClockOptions): () => void {
  const audio = audioElement();
  if (!audio || audio.paused) {
    return noopReadAlongClockStop;
  }
  let lastPublishedCursorSec = -1;
  let stopClock = noopReadAlongClockStop;
  const clock = new ReadAlongClock({
    audioElement,
    minFrameIntervalMs,
    onTick: (tick) => {
      const currentAudio = audioElement();
      if (!currentAudio || currentAudio.paused) {
        stopClock();
        return;
      }
      if (
        tick.reason === "frame" &&
        Math.abs(tick.audioTimeSec - lastPublishedCursorSec) < minCursorDeltaSec
      ) {
        return;
      }
      lastPublishedCursorSec = tick.audioTimeSec;
      onCursor(tick.audioTimeSec);
    },
    runtime,
  });
  stopClock = clock.stop.bind(clock);
  clock.sample("play");
  clock.start();
  return stopClock;
}

function browserReadAlongClockRuntime(): ReadAlongClockRuntime {
  return {
    cancelAnimationFrame: (id) => {
      globalThis.cancelAnimationFrame(id);
    },
    now: () => performance.now(),
    requestAnimationFrame: (callback) => globalThis.requestAnimationFrame(callback),
  };
}
