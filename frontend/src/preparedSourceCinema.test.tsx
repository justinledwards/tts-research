import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PreparedSourceCinemaOverlay } from "./PreparedSourceCinema";
import {
  preparedSourceCinemaActionLabel,
  preparedSourceCinemaActiveBlock,
  preparedSourceCinemaDomain,
  preparedSourceCinemaKind,
  preparedSourceCinemaOutline,
  preparedSourceCinemaPlaybackStatusLabel,
  preparedSourceCinemaJobMatchesSource,
  preparedSourceCinemaLabel,
  preparedSourceCinemaSkippedGroups,
  preparedSourceCinemaSourceHref,
  preparedSourceCinemaTitle,
  isPreparedSourceMarkdownDocument,
} from "./preparedSourceCinema";
import type { PreparedSource, VoiceJob } from "./types";

const noop = () => {
  // Intentionally empty test callback.
};

describe("prepared source cinema helpers", () => {
  it("labels URL sources as Website Cinema and file sources as Source Cinema", () => {
    expect(preparedSourceCinemaActionLabel(makePreparedSource({ kind: "url" }))).toBe(
      "Open Website Cinema",
    );
    expect(preparedSourceCinemaActionLabel(makePreparedSource({ kind: "file" }))).toBe(
      "Open Document Cinema",
    );
    expect(
      preparedSourceCinemaActionLabel(
        makePreparedSource({ kind: "text", renderMode: "markdown", sourceName: "notes.md" }),
      ),
    ).toBe("Open Document Cinema");
    expect(preparedSourceCinemaLabel(makePreparedSource({ kind: "file" }))).toBe("Document Cinema");
    expect(
      preparedSourceCinemaKind(makePreparedSource({ kind: "text", renderMode: "plain" })),
    ).toBe("source");
    expect(
      isPreparedSourceMarkdownDocument(
        makePreparedSource({ kind: "file", sourceContentType: "text/markdown" }),
      ),
    ).toBe(true);
  });

  it("resolves URL, domain, title, active block, and matching prepared-source jobs", () => {
    const source = makePreparedSource();
    expect(preparedSourceCinemaTitle(source)).toBe("Example article");
    expect(preparedSourceCinemaSourceHref(source)).toBe("https://www.example.com/article");
    expect(preparedSourceCinemaDomain(source)).toBe("example.com");
    expect(preparedSourceCinemaActiveBlock(source, 3)?.id).toBe("block-2");
    expect(
      preparedSourceCinemaJobMatchesSource(makeVoiceJob({ preparedSourceId: source.id }), source),
    ).toBe(true);
    expect(
      preparedSourceCinemaJobMatchesSource(
        makeVoiceJob({ preparedSourceId: "other-source" }),
        source,
      ),
    ).toBe(false);
  });

  it("derives skipped-content groups, outline items, and playback status copy", () => {
    const source = makePreparedSource({
      skippedItems: [
        { id: "skip-1", kind: "embedded", reason: "Navigation menu", text: "Menu" },
        { id: "skip-2", kind: "citation", reason: "Superscript citation", text: "[1]" },
        { id: "skip-3", kind: "embedded", reason: "Promotional rail", text: "Sponsored" },
      ],
      summary: {
        citationSkipCount: 1,
        headingCount: 1,
        sentenceSegmentCount: 3,
        skippedBlockCount: 3,
        spokenBlockCount: 2,
      },
    });

    expect(preparedSourceCinemaSkippedGroups(source)).toEqual([
      { count: 1, key: "nav", label: "Nav / Menus" },
      { count: 1, key: "ads", label: "Ads / Promotions" },
      { count: 1, key: "related", label: "Related / Citations" },
    ]);
    expect(preparedSourceCinemaOutline(source).map((item) => item.label)).toEqual([
      "Example article",
    ]);
    expect(preparedSourceCinemaPlaybackStatusLabel(true, null)).toBe("Playing");
    expect(preparedSourceCinemaPlaybackStatusLabel(false, null)).toBe("Source ready");
    expect(preparedSourceCinemaPlaybackStatusLabel(false, makeVoiceJob())).toBe("Ready");
  });

  it("renders a code-native Website Cinema shell for a prepared URL source", () => {
    const source = makePreparedSource();
    const markup = renderToStaticMarkup(
      <PreparedSourceCinemaOverlay
        activeWordIndex={1}
        canCreateAudio
        importError={null}
        isImporting={false}
        isPlaybackActive
        isProcessing={false}
        job={makeVoiceJob({ preparedSourceId: source.id })}
        playbackControls={{
          isAvailable: true,
          isPlaying: true,
          pause: noop,
          play: noop,
          playbackRate: 1,
          restart: noop,
          skipBy: noop,
        }}
        playbackCursorSec={12}
        progress={null}
        source={source}
        sources={[source]}
        textSize="large"
        themeName="light"
        onClose={noop}
        onCreateAudio={noop}
        onInspectStructure={noop}
        onPrepareFile={() => Promise.resolve()}
        onPlayPause={noop}
        onRestart={noop}
        onResumeProgress={noop}
        onSelectSource={noop}
        onSkip={noop}
        onTextSizeChange={noop}
        onThemeChange={noop}
      />,
    );

    expect(markup).toContain("Website Cinema");
    expect(markup).toContain("Example article");
    expect(markup).toContain("Content Structure");
    expect(markup).toContain("Generated audio health");
    expect(markup).not.toContain("Segment timeline");
    expect(markup).toContain("Source provenance");
    expect(markup).toContain("https://www.example.com/article");
  });
});

function makePreparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 2,
    blocks: [
      {
        endOffset: 25,
        id: "block-1",
        index: 0,
        kind: "heading",
        segments: [],
        speakMode: "speak",
        speechPolicy: { explanation: "Heading is spoken.", mode: "speak", profile: "default" },
        spokenText: "Example article",
        startOffset: 0,
        text: "Example article",
      },
      {
        endOffset: 93,
        id: "block-2",
        index: 1,
        kind: "body",
        segments: [],
        speakMode: "speak",
        speechPolicy: { explanation: "Body is spoken.", mode: "speak", profile: "default" },
        spokenText: "This prepared website source is ready for cinema review.",
        startOffset: 26,
        text: "This prepared website source is ready for cinema review.",
      },
    ],
    createdAt: "2026-05-18T12:00:00Z",
    id: "source-1",
    kind: "url",
    markdownParseMode: "strict",
    metadata: {},
    projectId: "default",
    renderMode: "markdown",
    segmentCount: 3,
    skippedItems: [],
    sourceContentType: "text/html",
    sourceName: "https://www.example.com/article",
    sourceSpeechPolicyOverrides: {},
    sourceSpeechPolicyProfile: "default",
    sourceUrl: "https://www.example.com/article",
    speechPolicyProfile: "default",
    speechText: "Example article This prepared website source is ready for cinema review.",
    status: "ready",
    summary: {
      citationSkipCount: 0,
      headingCount: 1,
      sentenceSegmentCount: 3,
      skippedBlockCount: 0,
      spokenBlockCount: 2,
    },
    text: "# Example article\n\nThis prepared website source is ready for cinema review.",
    title: "Example article",
    updatedAt: "2026-05-18T12:00:00Z",
    warnings: [],
    wordCount: 9,
    ...overrides,
  };
}

function makeVoiceJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioUrl: "/audio/demo.mp3",
    completedAt: "2026-05-18T12:01:00Z",
    contentType: "audio/mpeg",
    createdAt: "2026-05-18T12:00:00Z",
    durationMs: 24_000,
    id: "job-1",
    inputText: "Example article This prepared website source is ready for cinema review.",
    optimizedText: "Example article This prepared website source is ready for cinema review.",
    optimizer: "rules",
    progress: { activeStage: "done", detail: "", message: "" },
    projectId: "default",
    provider: "mock",
    retries: {
      attempts: 0,
      currentSegment: 0,
      maxRetries: 0,
      segmentAttempts: 0,
      totalSegments: 0,
    },
    stages: { checker: "done", optimization: "done", synthesis: "done" },
    status: "completed",
    updatedAt: "2026-05-18T12:01:00Z",
    voice: "Alloy",
    voiceCheck: {
      complete: true,
      needsResume: false,
      provider: "mock",
      reason: "ok",
      similarity: 1,
      transcript: "Example article",
    },
    ...overrides,
  };
}
