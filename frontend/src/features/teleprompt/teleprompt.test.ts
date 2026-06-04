import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  normalizeTelepromptPresetId,
  telepromptPresetHighlightSettings,
} from "./telepromptPresets";
import {
  DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
  applyTelepromptTheatrePreset,
  normalizeTelepromptTheatreSettings,
} from "./telepromptTheatreSettings";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS } from "../../teleprompter";
import { TelepromptStudio, type TelepromptStudioProps } from "./TelepromptStudio";
import {
  buildTelepromptWorkModeModel,
  defaultTelepromptWorkMode,
  telepromptCueSyncModeForWorkMode,
  telepromptGeneratedAudioReady,
} from "./telepromptStudioModel";
import {
  clearTelepromptReturnMemory,
  normalizeTelepromptReturnTarget,
  readTelepromptReturnSnapshot,
  rememberTelepromptReturnSnapshot,
  telepromptSourceKey,
  workspaceStageToTelepromptReturnTarget,
} from "./telepromptReturnMemory";
import {
  adjacentTelepromptBlockId,
  countTelepromptWords,
  estimateTelepromptDurationMs,
  formatTelepromptDuration,
  resolveTelepromptBlockIndex,
  resolveTelepromptShortcut,
  totalTelepromptWords,
} from "./telepromptToolbar";
import { telepromptFullscreenAvailability } from "./telepromptFullscreen";
import {
  DEFAULT_SHORTCUT_PREFERENCES,
  updateShortcutPreference,
} from "../shortcuts/shortcutRegistry";
import {
  TelepromptTheatre,
  TelepromptTheatreCueText,
  telepromptTheatreCrawlOffset,
  telepromptTheatreCrawlRowKey,
  telepromptTheatreCueParagraphs,
  telepromptTheatreCuePresentationKind,
  telepromptTheatreRenderedCueSections,
  telepromptTheatreCueSections,
  theatreReadingOnlyDetail,
  type TelepromptTheatreProps,
} from "./TelepromptTheatre";
import { resolveTelepromptTheatreShortcut } from "./telepromptTheatreShortcuts";
import type { TelepromptCueWordTiming } from "./telepromptCueTimeline";
import { buildTelepromptTheatreSummary } from "./telepromptTheatreState";
import type { GeneratedAudioLifecycleState } from "../playback";
import type { ReadAlongTimingState } from "../readalong";
import type { RevisionBlock } from "../revision";
import type { VoiceJob } from "../../types";

const blocks: RevisionBlock[] = [
  block({ id: "a", spokenText: "One two three." }),
  block({ id: "b", spokenText: "Four five." }),
  block({ id: "c", spokenText: "Six." }),
];

describe("teleprompt toolbar model", () => {
  it("resolves keyboard shortcuts while ignoring modified keys", () => {
    expect(resolveTelepromptShortcut({ key: " " })).toBe("playPause");
    expect(resolveTelepromptShortcut({ key: "ArrowRight" })).toBe("nextCue");
    expect(resolveTelepromptShortcut({ key: "Home" })).toBe("restart");
    expect(resolveTelepromptShortcut({ key: "[" })).toBe("speedDown");
    expect(resolveTelepromptShortcut({ key: "]" })).toBe("speedUp");
    expect(resolveTelepromptShortcut({ altKey: true, key: "j" })).toBe("jumpCurrentAudio");
    expect(resolveTelepromptShortcut({ key: "r" })).toBe("returnReview");
    expect(resolveTelepromptShortcut({ key: "t" })).toBe("openTheatre");
    expect(resolveTelepromptShortcut({ ctrlKey: true, key: "k" })).toBeNull();
  });

  it("accepts shortcut preferences while resolving Teleprompt commands", () => {
    const preferences = updateShortcutPreference(
      DEFAULT_SHORTCUT_PREFERENCES,
      "command.palette",
      "alt-k",
    );

    expect(resolveTelepromptShortcut({ key: "t" }, preferences)).toBe("openTheatre");
  });

  it("counts words, estimates time, and finds adjacent cues", () => {
    expect(countTelepromptWords("  one  two three ")).toBe(3);
    expect(totalTelepromptWords(blocks)).toBe(6);
    expect(formatTelepromptDuration(estimateTelepromptDurationMs(155))).toBe("1:00");
    expect(resolveTelepromptBlockIndex(blocks, "b")).toBe(1);
    expect(adjacentTelepromptBlockId(blocks, "b", 1)).toBe("c");
    expect(adjacentTelepromptBlockId(blocks, "a", -1)).toBe("a");
  });
});

describe("teleprompt studio work modes", () => {
  it("defaults to audio-follow only when current generated audio is ready", () => {
    expect(
      defaultTelepromptWorkMode({
        generatedAudioLifecycle: "ready",
        playbackAvailable: true,
      }),
    ).toBe("audio-follow");
    expect(telepromptCueSyncModeForWorkMode("audio-follow")).toBe("audio-follow");
    expect(
      telepromptGeneratedAudioReady({
        generatedAudioLifecycle: "ready",
        playbackAvailable: true,
      }),
    ).toBe(true);

    const nonReadyStates: GeneratedAudioLifecycleState[] = [
      "missing",
      "queued",
      "generating",
      "stale",
      "degraded",
      "failed",
      "archived",
    ];
    for (const generatedAudioLifecycle of nonReadyStates) {
      expect(
        defaultTelepromptWorkMode({
          generatedAudioLifecycle,
          playbackAvailable: true,
        }),
      ).toBe("rehearsal");
      expect(
        telepromptGeneratedAudioReady({
          generatedAudioLifecycle,
          playbackAvailable: true,
        }),
      ).toBe(false);
    }
  });

  it("maps work modes onto cue-sync primitives", () => {
    expect(
      buildTelepromptWorkModeModel({
        mode: "rehearsal",
        playbackAvailable: false,
        playbackPlaying: false,
      }),
    ).toMatchObject({
      disabledReason: undefined,
      label: "Rehearsal",
      syncMode: "manual",
      tone: "neutral",
    });
    expect(
      buildTelepromptWorkModeModel({
        mode: "recording",
        playbackAvailable: false,
        playbackPlaying: false,
      }),
    ).toMatchObject({
      disabledReason: undefined,
      label: "Recording",
      syncMode: "manual",
      tone: "danger",
    });
    expect(
      buildTelepromptWorkModeModel({
        mode: "audio-follow",
        playbackAvailable: true,
        playbackPlaying: false,
      }),
    ).toMatchObject({
      detail: "Generated audio is ready. Play to follow cues automatically.",
      label: "Audio-follow",
      syncMode: "audio-follow",
      tone: "info",
    });
  });

  it("explains audio-dependent modes when generated audio is missing", () => {
    const audioFollow = buildTelepromptWorkModeModel({
      generatedAudioLifecycle: "missing",
      mode: "audio-follow",
      playbackAvailable: false,
      playbackPlaying: false,
    });
    const reviewPlayback = buildTelepromptWorkModeModel({
      generatedAudioLifecycle: "missing",
      mode: "review-playback",
      playbackAvailable: false,
      playbackPlaying: false,
    });
    const failed = buildTelepromptWorkModeModel({
      generatedAudioLifecycle: "failed",
      mode: "audio-follow",
      playbackAvailable: false,
      playbackPlaying: false,
    });

    expect(audioFollow.disabledReason).toBe(
      "Audio missing. Create & Listen before playback. Rehearsal remains available.",
    );
    expect(audioFollow.tone).toBe("warning");
    expect(audioFollow.dataAttributes["data-teleprompt-work-mode"]).toBe("audio-follow");
    expect(reviewPlayback.disabledReason).toBe("Audio missing. Create & Listen before playback.");
    expect(reviewPlayback.syncMode).toBe("review-playback");
    expect(failed.disabledReason).toBe(
      "Generation failed. Retry generation before playback. Rehearsal remains available.",
    );
  });
});

describe("teleprompt studio cue-first render", () => {
  it("renders one Theatre entry, a dominant current cue, and drawer context", () => {
    const markup = renderToStaticMarkup(createElement(TelepromptStudio, studioProps()));

    expect(markup).toContain('data-testid="teleprompt-current-cue-stage"');
    expect(markup).toContain('data-teleprompt-cue-priority="primary"');
    expect(markup).toContain('data-testid="teleprompt-current-cue"');
    expect(markup).toContain('data-teleprompt-work-mode="rehearsal"');
    expect(markup).toContain('data-testid="ui-action-teleprompt-cue-drawer"');
    expect(markup).toMatch(/<details[^>]*data-testid="teleprompt-cue-drawer"(?![^>]* open)/);
    expect(markup).toContain('data-testid="teleprompt-session-context"');
    expect(markup).toContain('data-testid="ui-action-teleprompt-display-presets"');
    expect(markup).toContain('data-testid="ui-action-teleprompt-back-review"');
    expect(markup).toContain('data-testid="teleprompt-script-scroll"');
    expect(markup).toContain("Previous block");
    expect(markup).toContain("Next block");
    expect(markup.match(/ui-action-teleprompt-enter-theatre/g)).toHaveLength(1);
    expect(markup).not.toContain("ui-action-teleprompt-workflow-theatre");
  });

  it("defaults to audio-follow when current generated audio is ready", () => {
    const markup = renderToStaticMarkup(
      createElement(TelepromptStudio, studioProps({ job: voiceJob() })),
    );

    expect(markup).toContain('data-teleprompt-work-mode="audio-follow"');
    expect(markup).not.toContain('data-testid="ui-action-teleprompt-audio-recovery"');
  });

  it("keeps failed audio recovery compact and labels retry generation", () => {
    const base = studioProps();
    const markup = renderToStaticMarkup(
      createElement(
        TelepromptStudio,
        studioProps({
          job: voiceJob({ audioUrl: "", status: "failed" }),
          playbackControls: { ...base.playbackControls, isAvailable: false },
        }),
      ),
    );

    expect(markup).toContain('data-teleprompt-work-mode="rehearsal"');
    expect(markup).toContain('data-testid="ui-action-teleprompt-audio-recovery"');
    expect(markup).toContain("Retry generation");
    expect(markup).toContain("Generation failed. Retry generation before playback.");
  });
});

describe("teleprompt theatre model", () => {
  it("resolves presenter shortcuts before falling back to cue shortcuts", () => {
    expect(resolveTelepromptTheatreShortcut({ key: "Escape" })).toBe("exitTheatre");
    expect(resolveTelepromptTheatreShortcut({ key: "f" })).toBe("toggleNativeFullscreen");
    expect(resolveTelepromptTheatreShortcut({ key: "m" })).toBe("toggleMirror");
    expect(resolveTelepromptTheatreShortcut({ key: "j" })).toBe("jumpCurrentAudio");
    expect(resolveTelepromptTheatreShortcut({ key: "t" })).toBe("toggleControls");
    expect(resolveTelepromptTheatreShortcut({ key: "?", shiftKey: true })).toBe("shortcutHelp");
    expect(resolveTelepromptTheatreShortcut({ key: "F1" })).toBe("shortcutHelp");
    expect(resolveTelepromptTheatreShortcut({ key: "r" })).toBe("returnReview");
    expect(resolveTelepromptTheatreShortcut({ key: "v" })).toBe("returnPreview");
    expect(resolveTelepromptTheatreShortcut({ key: "ArrowRight" })).toBe("nextCue");
  });

  it("summarizes presenter cue state and sync status", () => {
    const summary = buildTelepromptTheatreSummary({
      activeBlockId: "b",
      blocks,
      estimatedDurationMs: estimateTelepromptDurationMs(totalTelepromptWords(blocks)),
      isPlaybackActive: true,
      playbackAvailable: true,
      scopeLabel: "Chapter One",
      sourceLabel: "Demo Source",
    });

    expect(summary.cuePositionLabel).toBe("Cue 2 of 3");
    expect(summary.sourceScopeLabel).toBe("Demo Source · Chapter One");
    expect(summary.playbackStatusLabel).toBe("Playback running");
    expect(summary.syncStatusLabel).toBe("Audio-follow cue sync ready");
    expect(summary.progressPercent).toBe(67);
  });

  it("explains unavailable native fullscreen without blocking theatre fallback", () => {
    expect(telepromptFullscreenAvailability(null)).toMatchObject({
      supported: false,
    });
  });

  it("labels Theatre as reading-only when generated audio is missing", () => {
    expect(theatreReadingOnlyDetail("missing")).toBe(
      "Reading-only mode. Audio-follow and playback are unavailable because generated audio is missing. Use Create & Listen from Preview to generate audio.",
    );
  });

  it("keeps return, operator, and fullscreen controls out of hidden Theatre chrome", () => {
    const hiddenMarkup = renderToStaticMarkup(
      createElement(TelepromptTheatre, telepromptTheatreProps({ controlsVisible: false })),
    );
    const visibleMarkup = renderToStaticMarkup(
      createElement(TelepromptTheatre, telepromptTheatreProps({ controlsVisible: true })),
    );

    expect(hiddenMarkup).toContain('data-theatre-runtime-mode="audio-follow"');
    expect(hiddenMarkup).toContain('data-theatre-availability-state="ready"');
    expect(hiddenMarkup).toContain("Exit Theatre");
    expect(hiddenMarkup).toContain("Controls");
    expect(hiddenMarkup).not.toContain("Back to Review");
    expect(hiddenMarkup).not.toContain("Back to Preview");
    expect(hiddenMarkup).not.toContain("Native fullscreen");
    expect(hiddenMarkup).not.toContain("Operator");
    expect(visibleMarkup).toContain('data-focused-theatre-action-group="return"');
    expect(visibleMarkup).toContain('data-focused-theatre-action-group="operator"');
    expect(visibleMarkup).toContain('data-focused-theatre-action-group="environment"');
    expect(visibleMarkup).toContain("Back to Review");
    expect(visibleMarkup).toContain("Back to Preview");
    expect(visibleMarkup).toContain("Native fullscreen");
    expect(visibleMarkup).toContain("Operator");
  });

  it("surfaces low-confidence timing without treating confidence as ambient chrome", () => {
    const trustedMarkup = renderToStaticMarkup(
      createElement(
        TelepromptTheatre,
        telepromptTheatreProps({
          controlsVisible: false,
          currentTimingState: "trusted",
          summary: theatreSummary({ confidenceLabel: "92% confidence" }),
        }),
      ),
    );
    const lowConfidenceMarkup = renderToStaticMarkup(
      createElement(
        TelepromptTheatre,
        telepromptTheatreProps({
          controlsVisible: false,
          currentTimingState: "lowConfidence",
          summary: theatreSummary({ confidenceLabel: "42% confidence" }),
        }),
      ),
    );

    expect(trustedMarkup).not.toContain("92% confidence");
    expect(lowConfidenceMarkup).toContain('data-theatre-availability-state="low-confidence"');
    expect(lowConfidenceMarkup).toContain("Low-confidence sync");
    expect(lowConfidenceMarkup).toContain("42% confidence");
  });

  it("keeps theatre cue paragraphs instead of flattening multiline text", () => {
    expect(telepromptTheatreCueParagraphs("First paragraph.\n\nSecond paragraph.")).toEqual([
      { id: "0:First paragraph.", text: "First paragraph." },
      { id: "1:Second paragraph.", text: "Second paragraph." },
    ]);
  });

  it("renders theatre cue hierarchy from revision block kind", () => {
    expect(telepromptTheatreCuePresentationKind("heading")).toBe("heading");
    expect(telepromptTheatreCuePresentationKind("subheading")).toBe("subheading");
    expect(telepromptTheatreCuePresentationKind("body")).toBe("body");

    expect(renderCue("heading", "Chapter One")).toContain("<h1");
    expect(renderCue("subheading", "Executive summary")).toContain("<h2");
    const bodyMarkup = renderCue("body", "First paragraph.\n\nSecond paragraph.");

    expect(bodyMarkup.match(/<p/g)).toHaveLength(2);
    expect(bodyMarkup).toContain('data-teleprompt-theatre-cue-kind="body"');
  });

  it("splits combined cue text from adjacent structured blocks", () => {
    const activeBlock = block({
      id: "title",
      kind: "heading",
      spokenText: "Cache and Cache Coherency",
    });
    const previewBlocks = [
      block({ id: "summary", kind: "subheading", spokenText: "Executive summary" }),
      block({
        id: "body",
        kind: "body",
        spokenText: "A cache is a small, fast storage structure.",
      }),
    ];
    const text =
      "Cache and Cache Coherency Executive summary A cache is a small, fast storage structure.";

    const sections = telepromptTheatreCueSections({
      activeBlock,
      previewBlocks,
      text,
    });

    expect(sections.map((section) => section.kind)).toEqual(["heading", "subheading", "body"]);
    expect(renderCueWithBlocks({ activeBlock, previewBlocks, text })).toContain(
      'data-teleprompt-theatre-section-kind="subheading"',
    );
  });

  it("maps combined theatre cue sections onto cue-local word indexes", () => {
    const rendered = telepromptTheatreRenderedCueSections([
      { id: "heading", kind: "heading", text: "Cache and Cache Coherency" },
      { id: "summary", kind: "subheading", text: "Executive summary" },
      { id: "body", kind: "body", text: "A cache follows audio." },
    ]);

    expect(
      rendered.map((section) => [section.kind, section.startWordIndex, section.endWordIndex]),
    ).toEqual([
      ["heading", 0, 3],
      ["subheading", 4, 5],
      ["body", 6, 9],
    ]);
    expect(rendered[2]?.tokens.map((token) => token.wordIndex)).toEqual([6, 7, 8, 9]);
  });

  it("renders theatre active, spoken, and upcoming words inside combined cues", () => {
    const activeBlock = block({
      id: "title",
      kind: "heading",
      spokenText: "Cache and Cache Coherency",
    });
    const previewBlocks = [
      block({ id: "summary", kind: "subheading", spokenText: "Executive summary" }),
      block({ id: "body", kind: "body", spokenText: "A cache follows audio." }),
    ];
    const text = "Cache and Cache Coherency Executive summary A cache follows audio.";
    const markup = renderCueWithBlocks({ activeBlock, currentWordIndex: 5, previewBlocks, text });

    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain("teleprompter-word--spoken");
    expect(markup).toContain("teleprompter-word--active");
    expect(markup).toContain("teleprompter-word--upcoming");
    expect(markup).toContain('data-readalong-word-index="5"');
    expect(markup).toContain('data-readalong-word-role="recent"');
    expect(markup).toContain('data-readalong-word-role="active"');
    expect(markup).toContain('data-readalong-word-role="upcoming"');
    expect(markup).toContain('data-readalong-cue-role="current"');
  });

  it("renders theatre active words by source identity when available", () => {
    const activeBlock = block({
      id: "title",
      kind: "heading",
      spokenText: "Cache and Cache Coherency",
    });
    const previewBlocks = [
      block({ id: "summary", kind: "subheading", spokenText: "Executive summary" }),
      block({ id: "body", kind: "body", spokenText: "A cache follows audio." }),
    ];
    const text = "Cache and Cache Coherency Executive summary A cache follows audio.";
    const markup = renderCueWithBlocks({
      activeBlock,
      currentSourceWordId: "book-1:book:word:106",
      currentWordIndex: 6,
      previewBlocks,
      text,
      wordTimings: [
        {
          audioEndMs: 900,
          audioStartMs: 600,
          confidence: 1,
          sourceWordId: "book-1:book:word:106",
          sourceWordIndex: 106,
          spokenTokenId: "plan-1:token:6",
          text: "A",
          wordIndex: 6,
        },
      ],
    });

    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('data-source-word-id="book-1:book:word:106"');
  });

  it("falls low-confidence theatre timing back to phrase emphasis", () => {
    const activeBlock = block({
      id: "title",
      kind: "heading",
      spokenText: "Cache and Cache Coherency",
    });
    const previewBlocks = [
      block({ id: "summary", kind: "subheading", spokenText: "Executive summary" }),
      block({ id: "body", kind: "body", spokenText: "A cache follows audio." }),
    ];
    const text = "Cache and Cache Coherency Executive summary A cache follows audio.";
    const markup = renderCueWithBlocks({
      activeBlock,
      currentWordIndex: 6,
      previewBlocks,
      text,
      timingState: "lowConfidence",
    });

    expect(markup).toContain('data-reading-followalong-visual-mode="phrase"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });

  it("computes a cinematic theatre crawl offset with a reduced-motion fallback", () => {
    expect(
      telepromptTheatreCrawlOffset({
        activeCenterY: 720,
        contentHeight: 1800,
        currentOffsetPx: 0,
        reducedMotion: false,
        viewportHeight: 900,
      }),
    ).toBeLessThan(0);
    expect(
      telepromptTheatreCrawlOffset({
        activeCenterY: 720,
        contentHeight: 1800,
        currentOffsetPx: -120,
        reducedMotion: true,
        viewportHeight: 900,
      }),
    ).toBe(0);
  });

  it("keeps the cinematic crawl row key stable within the same visual row", () => {
    expect(telepromptTheatreCrawlRowKey({ height: 64.2, top: 180.3 })).toBe(
      telepromptTheatreCrawlRowKey({ height: 64.4, top: 180.1 }),
    );
    expect(telepromptTheatreCrawlRowKey({ height: 64.2, top: 252.3 })).not.toBe(
      telepromptTheatreCrawlRowKey({ height: 64.2, top: 180.3 }),
    );
  });

  it("splits legacy combined intro cues without changing ordinary body cues", () => {
    const sections = telepromptTheatreCueSections({
      blockKind: "body",
      text: "Cache and Cache Coherency Executive summary A cache is a small, fast storage structure.",
    });

    expect(sections.map((section) => section.kind)).toEqual(["heading", "subheading", "body"]);
    expect(sections[0]?.text).toBe("Cache and Cache Coherency");
    expect(
      telepromptTheatreCueSections({
        blockKind: "body",
        text: "A normal body cue keeps its original paragraph model.",
      }).map((section) => section.kind),
    ).toEqual(["body"]);
  });

  it("renders technical theatre cues as preformatted blocks", () => {
    const markup = renderCue("code", "const x = 1;\nreturn x;");

    expect(markup).toContain("<pre");
    expect(markup).toContain("const x = 1;");
    expect(markup).toContain("return x;");
  });
});

describe("teleprompt presets and return memory", () => {
  it("normalizes presets and strengthens high contrast highlighting", () => {
    expect(normalizeTelepromptPresetId("unknown")).toBe("standard");
    const settings = telepromptPresetHighlightSettings("highContrast");

    expect(settings.effectStyle).toBe("classic");
    expect(settings.activeIntensity).toBeGreaterThan(1);
  });

  it("applies reversible Theatre presets and normalizes invalid settings", () => {
    expect(DEFAULT_TELEPROMPT_THEATRE_SETTINGS).toMatchObject({
      cuePreviewCount: 0,
      nextCuePlacement: "hidden",
      operatorPanelVisible: false,
    });
    expect(applyTelepromptTheatrePreset("mirrorRig")).toMatchObject({
      mirrorMode: true,
      presetId: "mirrorRig",
    });
    expect(applyTelepromptTheatrePreset("operatorReview")).toMatchObject({
      operatorPanelVisible: true,
      syncOverlayVisible: true,
    });
    expect(
      normalizeTelepromptTheatreSettings({
        countdownSeconds: 4,
        cueFontSize: "huge",
        cuePreviewCount: 9,
        presetId: "lowVision",
      }),
    ).toMatchObject({
      countdownSeconds: 0,
      cueFontSize: "massive",
      cuePreviewCount: 0,
      presetId: "lowVision",
    });
  });

  it("normalizes return targets and stable source keys", () => {
    expect(normalizeTelepromptReturnTarget("preview")).toBe("preview");
    expect(normalizeTelepromptReturnTarget("intake")).toBe("review");
    expect(workspaceStageToTelepromptReturnTarget("preview")).toBe("preview");
    expect(workspaceStageToTelepromptReturnTarget("intake")).toBe("review");
    expect(
      telepromptSourceKey({
        scopeLabel: "Chapter One",
        sourceId: "source-1",
        sourceLabel: "Book Title",
        sourceType: "book",
      }),
    ).toBe("book:source-1:book-title:chapter-one");
  });

  it("persists precise return context for source, cue, voice, policy, and stage", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => {
        storage.delete(key);
      },
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    });
    clearTelepromptReturnMemory();
    const sourceKey = telepromptSourceKey({
      scopeLabel: "Chapter One",
      sourceId: "source-1",
      sourceLabel: "Book Title",
      sourceType: "book",
    });

    rememberTelepromptReturnSnapshot({
      activeBlockId: "block-2",
      activeBlockLabel: "Second paragraph",
      originatingStage: "preview",
      policyProfile: "technical",
      projectId: "Project Alpha",
      returnTarget: "preview",
      scrollTop: 412.8,
      selectedCueIndex: 2,
      sourceKey,
      sourceLabel: "Book Title",
      updatedAt: "2026-05-22T15:00:00.000Z",
      voiceProfile: "Default voice",
    });

    expect(readTelepromptReturnSnapshot("Project Alpha", sourceKey)).toMatchObject({
      activeBlockId: "block-2",
      activeBlockLabel: "Second paragraph",
      originatingStage: "preview",
      policyProfile: "technical",
      returnTarget: "preview",
      scrollTop: 413,
      selectedCueIndex: 2,
      sourceKey,
      sourceLabel: "Book Title",
      voiceProfile: "Default voice",
    });
    expect(readTelepromptReturnSnapshot("Project Alpha", "text:other:source:scope")).toBeNull();
    vi.unstubAllGlobals();
  });
});

function studioProps(overrides: Partial<TelepromptStudioProps> = {}): TelepromptStudioProps {
  const studioBlocks = [
    block({ id: "a", index: 1, label: "Opening", spokenText: "One two three." }),
    block({ id: "b", index: 2, label: "Middle", spokenText: "Four five." }),
    block({ id: "c", index: 3, label: "Close", spokenText: "Six." }),
  ];
  return {
    activeBlockId: "b",
    blocks: studioBlocks,
    canCreate: true,
    canOpenCinema: true,
    contextInspectorDensity: "summary",
    isPlaybackActive: false,
    job: null,
    playbackControls: {
      isAvailable: true,
      isPlaying: false,
      pause: () => null,
      play: vi.fn(),
      playbackRate: 1,
      restart: vi.fn(),
      setPlaybackRate: () => null,
    },
    playbackCursorSec: 0,
    policyProfile: "Technical",
    projectId: "project-1",
    rememberReturnMemory: false,
    returnStage: "preview",
    scopeLabel: "Chapter One",
    settings: DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
    sourceId: "source-1",
    sourceLabel: "Demo Source",
    sourceMeta: "3 blocks",
    sourceType: "book",
    theatreSettings: DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
    theatreSettingsMemoryEnabled: true,
    voiceProfile: "Default voice",
    onActiveBlockChange: () => null,
    onBackToPreview: () => null,
    onBackToReview: () => null,
    onCreateAndListen: () => null,
    onOpenCinema: () => null,
    onTheatreSettingsChange: () => null,
    ...overrides,
  };
}

function telepromptTheatreProps(
  overrides: Partial<TelepromptTheatreProps> = {},
): TelepromptTheatreProps {
  const activeBlock = blocks[1] ?? null;
  return {
    activeBlock,
    activeBlockIndex: 1,
    audioProgressPercent: 42,
    canCreate: true,
    canOpenCinema: true,
    cueSyncDetail: "Audio-follow cue sync ready.",
    cueSyncMode: "audio-follow",
    cueSyncStatusLabel: "Audio-follow cue sync ready",
    currentCueText: null,
    currentTimingState: "trusted",
    currentWordIndex: null,
    fullscreenActive: false,
    fullscreenAvailability: {
      reason: null,
      supported: true,
    },
    mode: "theatre",
    nextBlock: blocks[2] ?? null,
    playbackControlsAvailable: true,
    playbackControlsPlaying: false,
    playbackLifecycle: "ready",
    playbackRate: 1,
    presetId: "standard",
    countdownRemaining: null,
    controlsVisible: false,
    previewBlocks: blocks.slice(2),
    settings: DEFAULT_TELEPROMPT_THEATRE_SETTINGS,
    settingsMemoryEnabled: true,
    summary: theatreSummary(),
    theatreViewMode: "manual",
    onBackToPreview: vi.fn(),
    onBackToReview: vi.fn(),
    onBlurControls: vi.fn(),
    onCreateAndListen: vi.fn(),
    onExitTheatre: vi.fn(),
    onFocusControls: vi.fn(),
    onJumpToCurrentAudio: vi.fn(),
    onMoveCue: vi.fn(),
    onOpenCinema: vi.fn(),
    onPlaybackRateChange: vi.fn(),
    onPresetChange: vi.fn(),
    onRequestNativeFullscreen: vi.fn(),
    onRestart: vi.fn(),
    onRevealControls: vi.fn(),
    onSettingsChange: vi.fn(),
    onToggleControls: vi.fn(),
    onToggleMirror: vi.fn(),
    onToggleOperatorPreview: vi.fn(),
    onTogglePlayback: vi.fn(),
    ...overrides,
  };
}

function theatreSummary(
  overrides: Partial<ReturnType<typeof buildTelepromptTheatreSummary>> = {},
): ReturnType<typeof buildTelepromptTheatreSummary> {
  return {
    ...buildTelepromptTheatreSummary({
      activeBlockId: "b",
      blocks,
      estimatedDurationMs: estimateTelepromptDurationMs(totalTelepromptWords(blocks)),
      isPlaybackActive: false,
      playbackAvailable: true,
      scopeLabel: "Chapter One",
      sourceLabel: "Demo Source",
    }),
    ...overrides,
  };
}

function voiceJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioUrl: "/audio/test.wav",
    durationMs: 6000,
    id: "job-1",
    segments: [],
    status: "completed",
    ...overrides,
  } as VoiceJob;
}

function block(overrides: Partial<RevisionBlock>): RevisionBlock {
  return {
    confidence: 1,
    estimatedDurationMs: 1000,
    id: "block",
    index: 1,
    kind: "text",
    label: "Block",
    needsAttention: false,
    normalisationCount: 0,
    policyNote: "Spoken",
    policyNoteType: "spoken",
    pronunciationCount: 0,
    segmentCount: 1,
    sourceSection: "Draft",
    speakMode: "speak",
    spokenText: "Text",
    status: "waiting",
    text: "Text",
    warnings: [],
    ...overrides,
  };
}

function renderCue(kind: string, text: string): string {
  return renderToStaticMarkup(
    createElement(TelepromptTheatreCueText, {
      blockKind: kind,
      fallbackText: "No spoken text is available for this cue.",
      highlightSettings: telepromptPresetHighlightSettings("standard"),
      mirrorMode: false,
      text,
      textClassName: "text-xl",
      widthClassName: "max-w-3xl",
      wordSpacing: "0",
    }),
  );
}

function renderCueWithBlocks({
  activeBlock,
  currentSourceWordId,
  currentWordIndex,
  previewBlocks,
  text,
  timingState,
  wordTimings,
}: Readonly<{
  activeBlock: RevisionBlock;
  currentSourceWordId?: string | null;
  currentWordIndex?: number | null;
  previewBlocks: RevisionBlock[];
  text: string;
  timingState?: ReadAlongTimingState;
  wordTimings?: readonly TelepromptCueWordTiming[];
}>): string {
  return renderToStaticMarkup(
    createElement(TelepromptTheatreCueText, {
      activeBlock,
      blockKind: activeBlock.kind,
      currentSourceWordId,
      currentWordIndex,
      fallbackText: "No spoken text is available for this cue.",
      highlightSettings: telepromptPresetHighlightSettings("standard"),
      mirrorMode: false,
      previewBlocks,
      text,
      textClassName: "text-xl",
      timingState,
      widthClassName: "max-w-3xl",
      wordTimings,
      wordSpacing: "0",
    }),
  );
}
