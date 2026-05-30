import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RunMode, VoiceJob } from "../../types";
import type { RevisionBlock } from "../revision";
import {
  buildPreviewComparisonModel,
  buildPreviewQueue,
  findAdjacentPreviewQueueItem,
  formatPreviewClock,
  previewComparisonSummary,
  previewQueueProgress,
  resolvePreviewQueueIndex,
  type PreviewComparisonChoice,
  type PreviewComparisonOption,
} from "./index";
import { GlobalPreviewPlayer } from "./GlobalPreviewPlayer";

const blocks: RevisionBlock[] = [
  block({ id: "a", index: 1, label: "Intro", segmentCount: 1, spokenText: "Hello world." }),
  block({
    id: "b",
    index: 2,
    label: "Skipped note",
    policyNoteType: "skipped",
    speakMode: "skip",
    spokenText: "",
    status: "skipped",
  }),
  block({ id: "c", index: 3, label: "Chapter", segmentCount: 2, spokenText: "Next spoken block." }),
];

describe("preview queue", () => {
  it("builds block timing from generated segment durations", () => {
    const queue = buildPreviewQueue(blocks, job());

    expect(queue.hasGeneratedAudio).toBe(true);
    expect(queue.readyCount).toBe(2);
    expect(queue.items.map((item) => [item.id, item.startSec, item.endSec, item.status])).toEqual([
      ["a", 0, 1, "ready"],
      ["b", 1, 2, "skipped"],
      ["c", 2, 7, "ready"],
    ]);
    expect(resolvePreviewQueueIndex(queue, null, 3)).toBe(2);
    expect(previewQueueProgress(queue, 3.5)).toMatchObject({
      currentLabel: "0:04",
      durationLabel: "0:08",
    });
  });

  it("skips silent policy blocks when moving through the queue", () => {
    const queue = buildPreviewQueue(blocks, job());

    expect(findAdjacentPreviewQueueItem(queue, 0, 1, { skipSilence: true })?.id).toBe("c");
    expect(findAdjacentPreviewQueueItem(queue, 2, -1, { skipSilence: true })?.id).toBe("a");
    expect(formatPreviewClock(65_400)).toBe("1:05");
  });
});

describe("preview A/B comparison", () => {
  it("summarizes changed voice, policy, and run settings", () => {
    const voiceOptions: PreviewComparisonOption[] = [
      { id: "default", label: "Default voice" },
      { id: "voice-b", label: "Narrator B" },
    ];
    const policyOptions: PreviewComparisonOption[] = [
      { id: "Enterprise", label: "Enterprise" },
      { id: "Accessibility", label: "Accessibility" },
    ];
    const choiceA: PreviewComparisonChoice = {
      policyId: "Enterprise",
      runMode: "checkedMaster",
      voiceId: "default",
    };
    const choiceB: PreviewComparisonChoice = {
      policyId: "Accessibility",
      runMode: "draftPreview",
      voiceId: "voice-b",
    };

    const model = buildPreviewComparisonModel(choiceA, choiceB, {
      policyOptions,
      voiceOptions,
    });

    expect(model.hasDifference).toBe(true);
    expect(previewComparisonSummary(model)).toContain("Voice: Default voice to Narrator B");
    expect(previewComparisonSummary(model)).toContain(
      "Run config: Checked Master to Draft Preview",
    );
  });

  it("keeps comparison controls without rendering a second dominant transport", () => {
    const option: PreviewComparisonOption = { id: "default", label: "Default voice" };
    const noop = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(GlobalPreviewPlayer, {
        activeBlockId: "a",
        blocks,
        canOpenCinema: true,
        currentPolicyId: "Enterprise",
        currentRunMode: "checkedMaster" as RunMode,
        currentVoiceId: "default",
        isPlaybackActive: false,
        job: job(),
        mode: "comparison-only",
        playbackControls: {
          isAvailable: true,
          isPlaying: false,
          pause: noop,
          play: noop,
          playbackRate: 1,
          restart: noop,
        },
        playbackCursorSec: 0,
        placement: "inline",
        policyOptions: [{ id: "Enterprise", label: "Enterprise" }],
        policyProfileLabel: "Enterprise",
        runConfigurationLabel: "Checked Master",
        scopeLabel: "Current source",
        sourceLabel: "Preview source",
        variant: "full",
        voiceOptions: [option],
        voiceProfileLabel: "Default voice",
        onActiveBlockChange: noop,
        onOpenCinema: noop,
        onPolicyProfileChange: noop,
        onRunModeChange: noop,
        onVoiceProfileChange: noop,
      }),
    );

    expect(markup).toContain('data-testid="global-preview-player"');
    expect(markup).not.toContain("ui-action-preview-mini-play");
    expect(markup).toContain("ui-action-preview-mini-audition-a");
  });
});

function block(overrides: Partial<RevisionBlock>): RevisionBlock {
  return {
    confidence: 1,
    estimatedDurationMs: 1000,
    id: "block",
    index: 1,
    kind: "body",
    label: "Block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken as prose.",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Body",
    speakMode: "speak",
    spokenText: "Spoken text.",
    status: "waiting",
    text: "Source text.",
    warnings: [],
    ...overrides,
  };
}

function job(): VoiceJob {
  return {
    audioReadySegments: 4,
    audioSegmentDurationsMs: [1000, 1000, 2000, 3000],
    audioUrl: "/audio/test.wav",
    contentType: "audio/wav",
    createdAt: "2026-05-21T00:00:00Z",
    durationMs: 7500,
    id: "job-1",
    inputText: "Input",
    optimizedText: "Output",
    optimizer: "rules",
    progress: {
      activeStage: "done",
      currentSegment: 4,
      detail: "Complete",
      message: "Done",
      totalSegments: 4,
    },
    projectId: "project",
    provider: "mock",
    retries: {
      attempts: 1,
      currentSegment: 4,
      maxRetries: 1,
      segmentAttempts: 4,
      totalSegments: 4,
    },
    runMode: "checkedMaster",
    segments: [
      { index: 1, status: "ready", text: "Hello world." },
      { index: 2, status: "ready", text: "" },
      { index: 3, status: "ready", text: "Next" },
      { index: 4, status: "ready", text: "block" },
    ],
    stages: { checker: "done", optimization: "done", synthesis: "done" },
    status: "completed",
    updatedAt: "2026-05-21T00:00:00Z",
    voice: "af_heart",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "ok",
      similarity: 0.99,
      transcript: "Output",
    },
  };
}
