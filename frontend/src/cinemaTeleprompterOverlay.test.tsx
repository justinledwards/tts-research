import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CinemaTeleprompterOverlay } from "./App";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "./features/book-cinema/model";
import { DEFAULT_READ_ALONG_PREFERENCES } from "./features/readalong";
import { DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS, type TeleprompterCue } from "./teleprompter";
import type { PreparedSource } from "./types";

function cue(overrides: Partial<TeleprompterCue> = {}): TeleprompterCue {
  return {
    activeWordIndex: 0,
    currentText: "Opening words",
    documentActiveWordIndex: 0,
    nextText: null,
    previousText: null,
    segmentCount: 3,
    segmentIndex: 0,
    segmentProgress: 0.9,
    tokens: [{ kind: "word", text: "Opening", wordIndex: 0 }],
    wordCount: 2,
    wordCues: [
      {
        endMs: 500,
        intensity: 1,
        progress: 0.2,
        startMs: 0,
        state: "active",
        wordIndex: 0,
      },
    ],
    ...overrides,
  };
}

function playbackControls() {
  return {
    isAvailable: true,
    isPlaying: false,
    isSeeking: false,
    pause: vi.fn(),
    play: vi.fn(),
    playbackRate: 1,
    restart: vi.fn(),
    setPlaybackRate: vi.fn(),
    skipBy: vi.fn(),
    seekTo: vi.fn(),
  };
}

function markdownSource(): PreparedSource {
  return {
    blockCount: 2,
    blocks: [
      {
        endOffset: 5,
        id: "first",
        index: 0,
        kind: "body",
        speakMode: "speak",
        speechPolicy: {
          explanation: "spoken",
          mode: "speak",
          profile: "default",
        },
        spokenText: "First",
        startOffset: 0,
        text: "First",
      },
      {
        endOffset: 12,
        id: "second",
        index: 1,
        kind: "body",
        speakMode: "speak",
        speechPolicy: {
          explanation: "spoken",
          mode: "speak",
          profile: "default",
        },
        spokenText: "Second",
        startOffset: 6,
        text: "Second",
      },
    ],
    createdAt: "2026-06-05T00:00:00.000Z",
    id: "source-1",
    kind: "file",
    projectId: "default",
    segmentCount: 2,
    sourceName: "Source",
    speechPolicyProfile: "default",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 0,
      sentenceSegmentCount: 2,
      skippedBlockCount: 0,
      spokenBlockCount: 2,
    },
    updatedAt: "2026-06-05T00:00:00.000Z",
    wordCount: 2,
  };
}

describe("CinemaTeleprompterOverlay", () => {
  it("uses the source title and full audio elapsed/remaining timeline", () => {
    const markup = renderToStaticMarkup(
      createElement(CinemaTeleprompterOverlay, {
        accessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
        audioDurationMs: 70_000,
        cue: cue(),
        isContextVisible: false,
        isFocusEnabled: true,
        isPlaybackActive: false,
        markdownActiveWordIndex: null,
        playbackActionDisabledReason: undefined,
        playbackLifecycle: "ready",
        playbackLifecycleReady: true,
        markdownSource: null,
        playbackControls: playbackControls(),
        playbackCursorSec: 12,
        readAlongPreferences: DEFAULT_READ_ALONG_PREFERENCES,
        resumeProgress: null,
        settings: DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
        sourceTitle: "Designing High-Function Cockpits",
        textSize: "large",
        themeName: "papery",
        onClose: vi.fn(),
        onContextToggle: vi.fn(),
        onFocusSettingsOpen: vi.fn(),
        onFocusToggle: vi.fn(),
        onPlayPause: vi.fn(),
        onRestart: vi.fn(),
        onResumeProgress: vi.fn(),
        onSkip: vi.fn(),
        onTextSizeChange: vi.fn(),
        onThemeChange: vi.fn(),
      }),
    );

    expect(markup).toContain("Designing High-Function Cockpits");
    expect(markup).toContain("Total 1:10");
    expect(markup).toContain("0:12");
    expect(markup).toContain("-0:58");
    expect(markup).toContain("width:17%");
    expect(markup).not.toContain("Ready for playback");
    expect(markup).not.toContain("width:90%");
  });

  it("honors an explicit Markdown Render active word index", () => {
    const markup = renderToStaticMarkup(
      createElement(CinemaTeleprompterOverlay, {
        accessibilitySettings: DEFAULT_READER_ACCESSIBILITY_SETTINGS,
        audioDurationMs: 70_000,
        cue: cue({ documentActiveWordIndex: 0 }),
        isContextVisible: false,
        isFocusEnabled: true,
        isPlaybackActive: true,
        markdownActiveWordIndex: 1,
        playbackActionDisabledReason: undefined,
        playbackLifecycle: "ready",
        playbackLifecycleReady: true,
        markdownSource: markdownSource(),
        playbackControls: playbackControls(),
        playbackCursorSec: 12,
        readAlongPreferences: {
          ...DEFAULT_READ_ALONG_PREFERENCES,
          highlightMotion: "smoothCursor",
        },
        resumeProgress: null,
        settings: DEFAULT_TELEPROMPTER_HIGHLIGHT_SETTINGS,
        sourceTitle: "Designing High-Function Cockpits",
        textSize: "large",
        themeName: "papery",
        onClose: vi.fn(),
        onContextToggle: vi.fn(),
        onFocusSettingsOpen: vi.fn(),
        onFocusToggle: vi.fn(),
        onPlayPause: vi.fn(),
        onRestart: vi.fn(),
        onResumeProgress: vi.fn(),
        onSkip: vi.fn(),
        onTextSizeChange: vi.fn(),
        onThemeChange: vi.fn(),
      }),
    );

    expect(markup).toMatch(/data-active="false"[\s\S]*data-active="true"/);
    expect(markup).toContain('data-readalong-highlight-motion="smoothCursor"');
  });
});
