import { describe, expect, it } from "vitest";
import type { PlaybackProgress, VoiceJob } from "../../types";
import {
  playbackDisplayCursorSec,
  playbackProgressRatio,
} from "./PreparedSourceCinemaTransportHelpers";

function voiceJob(durationMs: number): VoiceJob {
  return {
    durationMs,
  } as VoiceJob;
}

function playbackProgress(overrides: Partial<PlaybackProgress> = {}): PlaybackProgress {
  return {
    targetId: "prepared:source-1",
    projectId: "project-1",
    preparedSourceId: "source-1",
    currentTimeSec: 0,
    progress: 0,
    finished: false,
    hidden: false,
    createdAt: "2026-06-05T00:00:00Z",
    updatedAt: "2026-06-05T00:00:00Z",
    ...overrides,
  };
}

describe("PreparedSourceCinemaTransportHelpers", () => {
  it("uses completed job duration instead of saved progress ratio", () => {
    const job = voiceJob(100_000);
    const progress = playbackProgress({ currentTimeSec: 10, progress: 0.9 });

    expect(playbackProgressRatio(0, job, progress)).toBe(0.1);
    expect(playbackDisplayCursorSec(0, job, progress)).toBe(10);
  });

  it("uses live playback cursor before saved resume progress", () => {
    const job = voiceJob(100_000);
    const progress = playbackProgress({ currentTimeSec: 60, progress: 0.6 });

    expect(playbackProgressRatio(20, job, progress)).toBe(0.2);
    expect(playbackDisplayCursorSec(20, job, progress)).toBe(20);
  });

  it("resumes from saved current time before live playback advances", () => {
    const job = voiceJob(100_000);
    const progress = playbackProgress({ currentTimeSec: 25, progress: 0.75 });

    expect(playbackProgressRatio(0, job, progress)).toBe(0.25);
    expect(playbackDisplayCursorSec(0, job, progress)).toBe(25);
  });

  it("does not infer completed-audio cursor from saved progress ratio", () => {
    const job = voiceJob(100_000);
    const progress = playbackProgress({ currentTimeSec: 0, progress: 0.5 });

    expect(playbackProgressRatio(0, job, progress)).toBe(0);
    expect(playbackDisplayCursorSec(0, job, progress)).toBe(0);
  });

  it("clamps completed-audio progress to the full duration", () => {
    const job = voiceJob(100_000);
    const progress = playbackProgress({ currentTimeSec: 120, progress: 1.2 });

    expect(playbackProgressRatio(150, job, progress)).toBe(1);
    expect(playbackDisplayCursorSec(150, job, progress)).toBe(100);
  });

  it("keeps saved progress ratio for generation states without full duration", () => {
    const job = voiceJob(0);
    const progress = playbackProgress({ currentTimeSec: 11, progress: 0.4 });

    expect(playbackProgressRatio(0, job, progress)).toBe(0.4);
    expect(playbackDisplayCursorSec(0, job, progress)).toBe(11);
  });
});
