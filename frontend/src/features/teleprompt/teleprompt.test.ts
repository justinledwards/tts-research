import { describe, expect, it, vi } from "vitest";
import {
  normalizeTelepromptPresetId,
  telepromptPresetHighlightSettings,
} from "./telepromptPresets";
import {
  applyTelepromptTheatrePreset,
  normalizeTelepromptTheatreSettings,
} from "./telepromptTheatreSettings";
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
import { resolveTelepromptTheatreShortcut } from "./telepromptTheatreShortcuts";
import { buildTelepromptTheatreSummary } from "./telepromptTheatreState";
import type { RevisionBlock } from "../revision";

const blocks: RevisionBlock[] = [
  block({ id: "a", spokenText: "One two three." }),
  block({ id: "b", spokenText: "Four five." }),
  block({ id: "c", spokenText: "Six." }),
];

describe("teleprompt toolbar model", () => {
  it("resolves keyboard shortcuts while ignoring modified keys", () => {
    expect(resolveTelepromptShortcut({ key: " " })).toBe("playPause");
    expect(resolveTelepromptShortcut({ key: "ArrowRight" })).toBe("nextCue");
    expect(resolveTelepromptShortcut({ key: "r" })).toBe("returnReview");
    expect(resolveTelepromptShortcut({ ctrlKey: true, key: "k" })).toBeNull();
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

describe("teleprompt theatre model", () => {
  it("resolves presenter shortcuts before falling back to cue shortcuts", () => {
    expect(resolveTelepromptTheatreShortcut({ key: "Escape" })).toBe("exitTheatre");
    expect(resolveTelepromptTheatreShortcut({ key: "f" })).toBe("toggleNativeFullscreen");
    expect(resolveTelepromptTheatreShortcut({ key: "m" })).toBe("toggleMirror");
    expect(resolveTelepromptTheatreShortcut({ key: "j" })).toBe("jumpCurrentAudio");
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
});

describe("teleprompt presets and return memory", () => {
  it("normalizes presets and strengthens high contrast highlighting", () => {
    expect(normalizeTelepromptPresetId("unknown")).toBe("standard");
    const settings = telepromptPresetHighlightSettings("highContrast");

    expect(settings.effectStyle).toBe("classic");
    expect(settings.activeIntensity).toBeGreaterThan(1);
  });

  it("applies reversible Theatre presets and normalizes invalid settings", () => {
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
