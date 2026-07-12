import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  notifyPreparedReaderNavigation,
  PreparedSourceCinemaOverlay,
} from "./PreparedSourceCinemaBase";
import { DEFAULT_READER_ACCESSIBILITY_SETTINGS } from "../reader-accessibility";
import { DEFAULT_READ_ALONG_PREFERENCES } from "../readalong";
import { DEFAULT_SPEECH_POLICY_DEFINITION } from "../../speechPolicy";
import { defaultUiMemoryState } from "../preferences";
import {
  preparedSourceCinemaActionLabel,
  preparedSourceCinemaActiveBlock,
  preparedSourceCinemaDomain,
  preparedSourceCinemaKind,
  preparedSourceCinemaOutline,
  preparedSourceCinemaPlaybackStatusLabel,
  preparedSourceCinemaJobMatchesSource,
  preparedSourceCinemaLabel,
  preparedSourceCinemaPrimaryBlocks,
  preparedSourceCinemaSkippedGroups,
  preparedSourceCinemaSourceHref,
  preparedSourceCinemaTitle,
  isPreparedSourceMarkdownDocument,
} from "./preparedSourceModel";
import { preparedSourceCinemaPolicyNotes } from "./preparedSourcePolicyNotes";
import type { PreparedSource, VoiceJob } from "../../types";

const noop = () => {
  // Intentionally empty test callback.
};

describe("prepared source cinema helpers", () => {
  it("publishes genuine outline navigation through the reader callback seam", () => {
    const item = {
      blockId: "source:block-7",
      id: "outline:block-7",
      index: 7,
      label: "Results",
      level: 2,
    };
    const navigated: (typeof item)[] = [];

    notifyPreparedReaderNavigation(item, (nextItem) => navigated.push(nextItem));

    expect(navigated).toEqual([item]);
  });

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

  it("focuses website cinema blocks on the article instead of page chrome", () => {
    const source = makePreparedSource({
      blocks: [
        {
          endOffset: 8,
          id: "chrome-features",
          index: 0,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Legacy web chrome.", mode: "speak", profile: "default" },
          spokenText: "Features",
          startOffset: 0,
          text: "Features",
        },
        {
          endOffset: 18,
          id: "chrome-instagram",
          index: 1,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Legacy web chrome.", mode: "speak", profile: "default" },
          spokenText: "Instagram",
          startOffset: 10,
          text: "Instagram",
        },
        {
          endOffset: 128,
          id: "article-title",
          index: 2,
          kind: "heading",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Heading is spoken.", mode: "speak", profile: "default" },
          spokenText:
            "Amazon, Facebook, ICE, and the FBI have access to a private intelligence-sharing network operated by Seattle police",
          startOffset: 20,
          text: "Amazon, Facebook, ICE, and the FBI have access to a private intelligence-sharing network operated by Seattle police",
        },
        {
          endOffset: 238,
          id: "article-lede",
          index: 3,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Body is spoken.", mode: "speak", profile: "default" },
          spokenText:
            "Seattle Shield requests suspicious activity reports from local private companies.",
          startOffset: 130,
          text: "Seattle Shield requests suspicious activity reports from local private companies.",
        },
        {
          endOffset: 250,
          id: "footer",
          index: 4,
          kind: "body",
          segments: [],
          speakMode: "skip",
          speechPolicy: { explanation: "Footer skipped.", mode: "skip", profile: "default" },
          spokenText: "",
          startOffset: 240,
          text: "Subscribe",
        },
      ],
      title:
        "Amazon, Facebook, ICE, and the FBI have access to a private intelligence-sharing network operated by Seattle police",
    });

    expect(preparedSourceCinemaPrimaryBlocks(source).map((block) => block.id)).toEqual([
      "article-title",
      "article-lede",
    ]);
    expect(preparedSourceCinemaOutline(source).map((item) => item.label)).toEqual([
      "Amazon, Facebook, ICE, and the FBI have access to a private intelligence-sharing network operated by Seattle police",
    ]);
    expect(preparedSourceCinemaActiveBlock(source, -1)?.id).toBe("article-title");
  });

  it("keeps skipped document blocks visible for inspection", () => {
    const source = makePreparedSource({
      kind: "text",
      renderMode: "plain",
      sourceContentType: "text/plain",
      blocks: [
        {
          endOffset: 12,
          id: "intro",
          index: 0,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Body is spoken.", mode: "speak", profile: "default" },
          spokenText: "Intro words.",
          startOffset: 0,
          text: "Intro words.",
        },
        {
          endOffset: 52,
          id: "ref",
          index: 1,
          kind: "reference",
          segments: [],
          speakMode: "skip",
          speechPolicy: {
            explanation: "Reference is available on demand.",
            mode: "onDemand",
            profile: "default",
          },
          spokenText: "",
          startOffset: 13,
          text: "[6](https://example.com/reference)",
        },
        {
          endOffset: 64,
          id: "body",
          index: 2,
          kind: "body",
          segments: [],
          speakMode: "speak",
          speechPolicy: { explanation: "Body is spoken.", mode: "speak", profile: "default" },
          spokenText: "Body words.",
          startOffset: 53,
          text: "Body words.",
        },
      ],
    });

    expect(preparedSourceCinemaPrimaryBlocks(source).map((block) => block.id)).toEqual([
      "intro",
      "ref",
      "body",
    ]);
    expect(preparedSourceCinemaActiveBlock(source, -1)?.id).toBe("intro");
  });

  it("builds policy notes for inline document artifacts", () => {
    const source = makePreparedSource({
      blocks: [
        {
          endOffset: 64,
          id: "block-cited",
          index: 0,
          kind: "body",
          metadata: {
            inlineArtifacts: [
              {
                kind: "citation",
                startOffset: 42,
                visualLabel: "cite",
              },
            ],
          },
          segments: [],
          speakMode: "speak",
          speechPolicy: {
            explanation: "Prose is spoken because the Enterprise profile sets mode to speak.",
            mode: "speak",
            profile: "Enterprise",
          },
          spokenText: "The claim is ready.",
          startOffset: 0,
          text: "The claim is ready. [cite][turn40search10]",
          warnings: ["citation_removed"],
        },
        {
          endOffset: 64,
          id: "block-token",
          index: 1,
          kind: "artifact_token",
          segments: [],
          speakMode: "skip",
          speechPolicy: {
            element: "artifact_token",
            elementMode: "onDemand",
            explanation:
              "This artifact token is available on demand because the Enterprise profile sets artifact_token to onDemand.",
            mode: "onDemand",
            profile: "Enterprise",
          },
          spokenText: "",
          startOffset: 42,
          text: "turn40search10",
        },
      ],
      skippedItems: [
        {
          id: "block-token",
          kind: "artifact_token",
          reason: "Artifact token is available on demand.",
          text: "turn40search10",
        },
      ],
    });

    const notes = preparedSourceCinemaPolicyNotes(source);

    expect(notes.map((note) => [note.kind, note.mode])).toEqual([
      ["body", "speak"],
      ["citation", "skip"],
      ["artifact_token", "onDemand"],
      ["artifact_token", "skip"],
    ]);
    expect(notes.find((note) => note.kind === "citation")?.explanation).toContain(
      "Citations are available on demand in Enterprise profile",
    );
  });

  it("renders a code-native Website Cinema shell for a prepared URL source", () => {
    const source = makePreparedSource();
    const markup = renderToStaticMarkup(
      <PreparedSourceCinemaOverlay
        accessibilitySettings={DEFAULT_READER_ACCESSIBILITY_SETTINGS}
        activeWordIndex={1}
        canCreateAudio
        customPolicyProfiles={[]}
        highlightMap={null}
        highlightMapV2={null}
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
        policyDefinition={DEFAULT_SPEECH_POLICY_DEFINITION}
        policyError={null}
        policyOverrides={{}}
        policyProfile="Enterprise"
        policyProfiles={DEFAULT_SPEECH_POLICY_DEFINITION.profiles}
        progress={null}
        progressItems={[]}
        readAlongPreferences={DEFAULT_READ_ALONG_PREFERENCES}
        source={source}
        sourcePolicySaving={false}
        sources={[source]}
        theatreControlsSignal={0}
        theatreExitSignal={0}
        theatreOpenSignal={0}
        themeName="light"
        uiMemoryFocusState={defaultUiMemoryState().cinema.website}
        uiMemoryResetSignal={0}
        onAccessibilitySettingsChange={noop}
        onBookmark={noop}
        onClearSourcePolicy={noop}
        onClose={noop}
        onCreateAudio={noop}
        onInspectStructure={noop}
        onPrepareFile={() => Promise.resolve()}
        onPlayPause={noop}
        onRestart={noop}
        onResumeProgress={noop}
        onSaveSourcePolicy={noop}
        onSelectSource={noop}
        onSkip={noop}
        onThemeChange={noop}
        onUiMemoryFocusStateChange={noop}
      />,
    );

    expect(markup).toContain("Website Cinema");
    expect(markup).toContain("Example article");
    expect(markup).toContain('data-website-read-mode-calm="true"');
    expect(markup).toContain('data-source-identity-summary=""');
    expect(markup).toContain("Show full Website Cinema context");
    expect(markup).not.toContain("Article high");
    expect(markup).not.toContain("Review article");
    expect(markup).not.toContain("Select cinema source");
    expect(markup).toContain("Read");
    expect(markup).toContain("Inspect");
    expect(markup).toContain("Review");
    expect(markup).toContain("More");
    expect(markup).not.toContain("Debug");
    expect(markup).not.toContain("Source policy pin");
    expect(markup).not.toContain("Source provenance");
    expect(markup).not.toContain("Generated audio health");
    expect(markup).not.toContain("Segment timeline");
    expect(markup).not.toContain("https://www.example.com/article");
    expect(markup).toContain('data-reader-motion="standard"');
    expect(markup).toContain('data-reader-text-scale="large"');
    expect(markup).toContain('aria-live="polite"');
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
    metadata: {
      websiteExtractionQuality: {
        articleCandidateCount: 2,
        chosenContainer: "body > main > article#example",
        chromeTextRatio: 0.12,
        extractionConfidence: "high",
        extractionConfidenceScore: 0.82,
        headingDepth: 1,
        linkDensity: 0.04,
        narrationBlockCount: 2,
        readableTextRatio: 0.76,
        skippedBlockCount: 2,
        skippedBlocks: [
          {
            kind: "navigation",
            reason: "skipped page chrome: navigation",
            selector: "body > header > nav",
            text: "Home Search",
            wordCount: 2,
          },
        ],
      },
    },
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
