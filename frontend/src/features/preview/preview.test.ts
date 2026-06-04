import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRunConfiguration } from "../../runConfig";
import type { RunMode, VoiceJob } from "../../types";
import { RunPlannerSummaryPanel } from "../run-config/RunPlannerSummaryPanel";
import { buildRunPlannerSummary, compareRunPlannerSummaries } from "../run-config/runConfigSteps";
import type { RevisionBlock } from "../revision";
import {
  buildPreviewComparisonModel,
  buildPreviewQueue,
  findAdjacentPreviewQueueItem,
  formatPreviewClock,
  PreviewConfirmationStrip,
  PreviewGeneratedAudioPanel,
  previewComparisonSummary,
  previewQueueProgress,
  PreviewReadinessChecklist,
  resolvePreviewReadinessModel,
  resolvePreviewQueueIndex,
  VoiceAuditionPanel,
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

  it("makes ready partial segments playable while pending segments wait", () => {
    const partialJob = {
      ...job(),
      audioPartialUrl: "/audio/job-1-partial.wav",
      audioReadySegments: 1,
      audioUrl: "",
      status: "synthesizing",
      segments: [
        { index: 1, status: "ready", text: "Hello world." },
        { index: 2, status: "running", text: "" },
        { index: 3, status: "pending", text: "Next" },
        { index: 4, status: "pending", text: "block" },
      ],
    } satisfies VoiceJob;
    const queue = buildPreviewQueue(blocks, partialJob);

    expect(queue.hasGeneratedAudio).toBe(true);
    expect(queue.readyCount).toBe(1);
    expect(queue.items.map((item) => [item.id, item.audioReady, item.status])).toEqual([
      ["a", true, "ready"],
      ["b", false, "skipped"],
      ["c", false, "generating"],
    ]);
    expect(queue.items[2].disabledReason).toBe("Generated audio is not ready for this block yet.");
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

  it("renders the active spoken preview in full transport mode", () => {
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
        voiceOptions: [{ id: "default", label: "Default voice" }],
        voiceProfileLabel: "Default voice",
        onActiveBlockChange: noop,
        onOpenCinema: noop,
        onPolicyProfileChange: noop,
        onRunModeChange: noop,
        onVoiceProfileChange: noop,
      }),
    );

    expect(markup).toContain('data-testid="preview-active-spoken-text"');
    expect(markup).toContain("Hello ");
    expect(markup).toContain("world.");
    expect(markup).toContain('data-reading-active-emphasis="dominant"');
    expect(markup).toContain('data-readalong-cue-role="current"');
    expect(markup).toContain('data-readalong-timing-state="estimated"');
    expect(markup).toContain('data-reading-followalong-visual-mode="phrase"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });
});

describe("preview readiness model", () => {
  it("blocks create and teleprompt when no source is selected", () => {
    const model = resolvePreviewReadinessModel(readinessInput({ hasSource: false }));

    expect(model.canCreate).toBe(false);
    expect(model.canOpenTeleprompt).toBe(false);
    expect(model.createDisabledReason).toBe("Choose or prepare a source before creating audio.");
    expect(model.rows.find((row) => row.id === "source")).toMatchObject({
      status: "blocked",
    });
  });

  it("surfaces source preparation and missing spoken form", () => {
    const preparing = resolvePreviewReadinessModel(
      readinessInput({ hasSource: true, sourcePreparing: true }),
    );
    const noSpoken = resolvePreviewReadinessModel(
      readinessInput({ hasSource: true, hasSpokenText: false }),
    );

    expect(preparing.rows.find((row) => row.id === "source")?.detail).toBe(
      "Source preparation is still running.",
    );
    expect(preparing.canCreate).toBe(false);
    expect(noSpoken.createDisabledReason).toBe(
      "This source has no listener-ready text to audition or generate.",
    );
  });

  it("keeps voice provider blockers explicit", () => {
    const model = resolvePreviewReadinessModel(
      readinessInput({ voiceCapabilityReason: "Select a ready voice or TTS engine." }),
    );

    expect(model.canAudition).toBe(false);
    expect(model.createDisabledReason).toBe("Select a ready voice or TTS engine.");
  });

  it("surfaces Review warnings as Preview preflight blockers for generation", () => {
    const model = resolvePreviewReadinessModel(readinessInput({ reviewWarningCount: 3 }));

    expect(model.canCreate).toBe(false);
    expect(model.createDisabledReason).toBe(
      "3 review warnings need repair. Preview remains available while repairs continue.",
    );
    expect(model.rows.find((row) => row.id === "review")).toMatchObject({
      detail: "3 review warnings need repair. Preview remains available while repairs continue.",
      status: "warning",
    });
  });

  it("distinguishes missing, generating, failed, stale, and ready audio transitions", () => {
    const missing = resolvePreviewReadinessModel(
      readinessInput({ generatedAudioLifecycle: "missing" }),
    );
    const generating = resolvePreviewReadinessModel(
      readinessInput({ generatedAudioLifecycle: "generating" }),
    );
    const failed = resolvePreviewReadinessModel(
      readinessInput({ generatedAudioLifecycle: "failed" }),
    );
    const stale = resolvePreviewReadinessModel(
      readinessInput({ generatedAudioLifecycle: "stale" }),
    );
    const ready = resolvePreviewReadinessModel(
      readinessInput({ generatedAudioLifecycle: "ready" }),
    );

    expect(missing.generatedPlaybackDisabledReason).toBe(
      "Preview shows the listener-ready text. No generated audio exists yet. Create & Listen to generate audio for this scope.",
    );
    expect(missing.openTelepromptDetail).toBe(
      "Manual rehearsal is available. Audio-follow unlocks when generated audio and timing are ready.",
    );
    expect(missing.canOpenCinema).toBe(false);
    expect(missing.canOpenTheatre).toBe(true);
    expect(generating.canOpenCinema).toBe(false);
    expect(generating.cinemaDisabledReason).toBe(
      "Audio is generating. Playback unlocks when ready.",
    );
    expect(failed.cinemaDisabledReason).toContain("Generation failed");
    expect(failed.openTelepromptDetail).toBe(
      "Rehearsal only. Retry generation unlocks audio-follow.",
    );
    expect(failed.primaryLabel).toBe("Retry generation");
    expect(stale.cinemaDisabledReason).toContain("Audio needs rebuild");
    expect(ready.canOpenCinema).toBe(true);
    expect(ready.openTelepromptDetail).toBe("Teleprompt opens with generated cue playback ready.");
    expect(ready.primaryLabel).toBe("Create Again");
  });
});

describe("preview readiness UI", () => {
  it("renders the checklist and confirmation strip as a preflight surface", () => {
    const model = resolvePreviewReadinessModel(readinessInput());
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(PreviewReadinessChecklist, { model }),
        createElement(PreviewConfirmationStrip, { model }),
      ),
    );

    expect(markup).toContain('data-testid="preview-readiness-checklist"');
    expect(markup).toContain("Narration preflight");
    expect(markup).toContain("Ready to create");
    expect(markup).toContain("Spoken form");
    expect(markup).toContain("Voice/provider");
    expect(markup).toContain("Runtime/queue");
    expect(markup).toContain('data-testid="preview-confirmation-strip"');
    expect(markup).toContain("Preview source");
    expect(markup).toContain("Default voice");
    expect(markup).toContain("Checked Master");
    expect(markup).toContain("audio/wav");
  });

  it("renders the next-run summary and saved retry plan warning", () => {
    const currentSummary = buildRunPlannerSummary({
      configuration: createRunConfiguration("draftPreview"),
      policyLabel: "Enterprise",
      sampleText: "Selected spoken block sample.",
      scopeLabel: "Current source",
      sourceLabel: "Preview source",
      ttsEngines: [],
      voiceLabel: "Default voice",
    });
    const retrySummary = buildRunPlannerSummary({
      configuration: createRunConfiguration("publishMaster"),
      policyLabel: "Accessibility",
      sampleText: "Selected spoken block sample.",
      scopeLabel: "Current source",
      sourceLabel: "Preview source",
      ttsEngines: [],
      voiceLabel: "Default voice",
    });
    const markup = renderToStaticMarkup(
      createElement(RunPlannerSummaryPanel, {
        differences: compareRunPlannerSummaries(currentSummary, retrySummary),
        retrySummary,
        summary: currentSummary,
        onCreateWithCurrentPlan: vi.fn(),
      }),
    );

    expect(markup).toContain('data-testid="next-run-summary"');
    expect(markup).toContain("Next-run plan");
    expect(markup).toContain("Selected spoken block sample.");
    expect(markup).toContain("Before generation starts");
    expect(markup).toContain("Retry will reuse saved job plan");
    expect(markup).toContain("Wizard differs");
    expect(markup).toContain("Create with current plan");
  });

  it("renders selected-block audition with disabled-state copy", () => {
    const play = vi.fn();
    const markup = renderToStaticMarkup(
      createElement(VoiceAuditionPanel, {
        disabledReason: "Select a ready voice or TTS engine.",
        sampleText: "Selected spoken block sample.",
        state: {
          detail: "Audition the selected spoken block before full generation.",
          label: "Audition voice",
          metadata: "0:01 · mock · af_heart",
          play,
          status: "idle",
        },
      }),
    );

    expect(markup).toContain('data-testid="preview-audition-panel"');
    expect(markup).toContain("Selected spoken block sample.");
    expect(markup).toContain('data-testid="ui-action-preview-audition-voice"');
    expect(markup).toContain('data-disabled-reason="Select a ready voice or TTS engine."');
    expect(markup).toContain("Select a ready voice or TTS engine.");
    expect(markup).toContain("0:01 · mock · af_heart");
  });

  it("renders a compact generated-audio placeholder before playback is available", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewGeneratedAudioPanel, {
        detail:
          "Preview shows the listener-ready text. No generated audio exists yet. Create & Listen to generate audio for this scope.",
        playbackAvailable: false,
        playbackToolbar: createElement(
          "div",
          { "data-testid": "localized-preview-playback-toolbar" },
          "Transport",
        ),
        status: "waiting",
      }),
    );

    expect(markup).toContain('data-testid="preview-generated-audio-empty-state"');
    expect(markup).toContain("Audio not generated yet");
    expect(markup).toContain("No generated audio exists yet");
    expect(markup).not.toContain('data-testid="localized-preview-playback-toolbar"');
    expect(markup).not.toContain("Jump to Audio");
  });

  it("embeds generated-audio playback once playable audio is available", () => {
    const markup = renderToStaticMarkup(
      createElement(PreviewGeneratedAudioPanel, {
        detail: "Audio ready. Preview playback and Cinema are available.",
        playbackAvailable: true,
        playbackToolbar: createElement(
          "div",
          { "data-testid": "localized-preview-playback-toolbar" },
          "Transport",
        ),
        status: "ready",
      }),
    );

    expect(markup).toContain('data-testid="preview-generated-audio-playback"');
    expect(markup).toContain('data-testid="localized-preview-playback-toolbar"');
    expect(markup).not.toContain('data-testid="preview-generated-audio-empty-state"');
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

function readinessInput(
  overrides: Partial<Parameters<typeof resolvePreviewReadinessModel>[0]> = {},
): Parameters<typeof resolvePreviewReadinessModel>[0] {
  return {
    canCreate: true,
    generatedAudioLifecycle: "missing",
    hasSource: true,
    hasSpokenText: true,
    outputFormat: "audio/wav",
    policyLabel: "Enterprise",
    runLabel: "Checked Master",
    scopeLabel: "Current source",
    sourceLabel: "Preview source",
    sourcePreparing: false,
    voiceLabel: "Default voice",
    ...overrides,
  };
}
