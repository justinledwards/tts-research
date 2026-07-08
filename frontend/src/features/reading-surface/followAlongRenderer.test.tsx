import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingFollowAlongRenderer } from "./ReadingFollowAlongRenderer";
import {
  READING_FOLLOW_ALONG_DISPLAY_PRESETS,
  READING_FOLLOW_ALONG_LINE_LENGTH_RULES,
  buildReadingFollowAlongTokensFromText,
  normalizeReadingFollowAlongCue,
  readingFollowAlongVisualMode,
  readingFollowAlongWindow,
  readingFollowAlongWordRole,
} from "./followAlongModel";

describe("reading follow-along renderer", () => {
  it("claims exact current word only when trusted timing and source identity agree", () => {
    const sourceWordIdByWordIndex = new Map([[0, "book-1:scope:word:41"]]);
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeSourceWordId="book-1:scope:word:41"
        activeWordIndex={0}
        cue={{
          cueText: "Hello trusted world.",
          spokenText: "Hello trusted world.",
          tokens: buildReadingFollowAlongTokensFromText("Hello trusted world.", {
            sourceWordIdByWordIndex,
          }),
        }}
        mode="audio-follow"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="trusted"
        transportCanClaimExactReadAlong
      />,
    );

    expect(markup).toContain('data-reading-followalong-renderer=""');
    expect(markup).toContain('data-reading-followalong-exact-word="true"');
    expect(markup).toContain('data-reading-followalong-visual-mode="word"');
    expect(markup).toContain('data-source-word-id="book-1:scope:word:41"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="active"');
  });

  it("falls back when exact transport evidence is omitted", () => {
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeWordIndex={1}
        cue="Omitted transport gate cannot claim exact"
        mode="audio-follow"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="trusted"
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).toContain('data-reading-followalong-visual-mode="phrase"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain('data-readalong-word-role="active"');
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });

  it("fails closed when source identity and active word index disagree", () => {
    const sourceWordIdByWordIndex = new Map([[1, "book-1:scope:word:41"]]);
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeSourceWordId="book-1:scope:word:41"
        activeWordIndex={0}
        cue={{
          cueText: "Hello trusted world.",
          tokens: buildReadingFollowAlongTokensFromText("Hello trusted world.", {
            sourceWordIdByWordIndex,
          }),
        }}
        mode="audio-follow"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="trusted"
        transportCanClaimExactReadAlong
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain('data-readalong-word-role="active"');
  });

  it("keeps recent and upcoming role context when a section does not contain the exact active token", () => {
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeWordIndex={5}
        cue={{
          cueText: "A cache follows audio.",
          tokens: buildReadingFollowAlongTokensFromText("A cache follows audio.").map((token) => ({
            ...token,
            wordIndex: token.wordIndex + 6,
          })),
        }}
        mode="audio-follow"
        recentWindow={2}
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="trusted"
        transportCanClaimExactReadAlong
        upcomingWindow={2}
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain('data-readalong-word-role="active"');
    expect(markup).toContain('data-readalong-word-index="6"');
    expect(markup).toContain('data-readalong-word-role="upcoming"');
  });

  it("falls estimated timing back to phrase emphasis without aria-current", () => {
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeWordIndex={2}
        cue="One two three four five"
        exactWordTiming={false}
        mode="audio-follow"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="estimated"
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).toContain('data-reading-followalong-visual-mode="phrase"');
    expect(markup).toContain('data-readalong-uncertainty="visible"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });

  it("falls back when transport cannot claim current checked exact read-along", () => {
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeWordIndex={1}
        cue="Unchecked current audio should not claim exact"
        mode="audio-follow"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="trusted"
        transportCanClaimExactReadAlong={false}
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).toContain('data-reading-followalong-visual-mode="phrase"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain('data-readalong-word-role="active"');
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });

  it("degrades stale and degraded timing without exact word claims", () => {
    for (const [timingState, visualMode] of [
      ["stale", "none"],
      ["degraded", "degraded"],
    ] as const) {
      const markup = renderToStaticMarkup(
        <ReadingFollowAlongRenderer
          activeWordIndex={1}
          cue="Stale degraded fallback"
          mode="audio-follow"
          surface="teleprompt"
          timingState={timingState}
          transportCanClaimExactReadAlong
        />,
      );

      expect(markup).toContain('data-reading-followalong-exact-word="false"');
      expect(markup).toContain(`data-reading-followalong-visual-mode="${visualMode}"`);
      expect(markup).not.toContain('aria-current="true"');
    }
  });

  it("downgrades exact word highlighting in low-resource mode", () => {
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        activeWordIndex={2}
        cue="Low resource still readable"
        lowResourceMode
        mode="audio-follow"
        requestedVisualMode="word"
        surface="teleprompt"
        timingState="trusted"
        transportCanClaimExactReadAlong
      />,
    );

    expect(markup).toContain('data-reading-followalong-exact-word="false"');
    expect(markup).toContain('data-reading-followalong-visual-mode="block"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).not.toContain('data-readalong-word-role="active"');
  });

  it("renders skipped and transformed token roles from shared token metadata", () => {
    const transformationByWordIndex = new Map([
      [0, "skipped" as const],
      [1, "transformed" as const],
    ]);
    const markup = renderToStaticMarkup(
      <ReadingFollowAlongRenderer
        cue={{
          cueText: "Skip transformed normal",
          tokens: buildReadingFollowAlongTokensFromText("Skip transformed normal", {
            transformationByWordIndex,
          }),
        }}
        mode="reading-only"
        surface="teleprompt"
        surfaceKind="spoken"
        timingState="estimated"
      />,
    );

    expect(markup).toContain('data-readalong-token-transformation="skipped"');
    expect(markup).toContain('data-readalong-word-role="skipped"');
    expect(markup).toContain('data-readalong-token-transformation="transformed"');
    expect(markup).toContain('data-readalong-word-role="transformed"');
  });

  it("formalizes cue text precedence, line length, and display presets", () => {
    expect(
      normalizeReadingFollowAlongCue({
        cueText: "",
        sourceText: "Raw source",
        spokenText: "Spoken form",
      }),
    ).toMatchObject({
      cueText: "Spoken form",
      displayTextSource: "spokenText",
    });
    expect(READING_FOLLOW_ALONG_LINE_LENGTH_RULES.spoken).toMatchObject({
      targetMaxCh: 66,
      targetMinCh: 58,
    });
    expect(READING_FOLLOW_ALONG_DISPLAY_PRESETS.highContrast).toMatchObject({
      highlightStyle: "highContrastShape",
      measure: "narrow",
    });
    expect(
      readingFollowAlongVisualMode({
        activeWordIndex: 1,
        exactWordTiming: false,
        mode: "audio-follow",
        timingState: "lowConfidence",
      }),
    ).toBe("phrase");
  });

  it("bounds recent and upcoming window roles around exact active words", () => {
    const tokens = buildReadingFollowAlongTokensFromText("zero one two three four five six");
    const window = readingFollowAlongWindow({
      activeWordIndex: 3,
      canClaimExactWord: true,
      recentWindow: 1,
      tokens,
      upcomingWindow: 2,
      visualMode: "word",
    });

    expect(window.firstWindowWordIndex).toBe(2);
    expect(window.lastWindowWordIndex).toBe(5);
    expect(window.tokens.map(({ inWindow }) => inWindow)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      false,
    ]);
    expect(window.tokens.map(({ role }) => role)).toEqual([
      "spoken",
      "spoken",
      "recent",
      "active",
      "upcoming",
      "upcoming",
      "idle",
    ]);
    expect(
      readingFollowAlongWordRole({
        active: true,
        activeWordIndex: 3,
        canClaimExactWord: true,
        cueRole: "current",
        phrase: false,
        token: tokens[3],
      }),
    ).toBe("active");
    expect(
      readingFollowAlongWordRole({
        active: true,
        activeWordIndex: 3,
        canClaimExactWord: false,
        cueRole: "current",
        phrase: false,
        token: tokens[3],
      }),
    ).toBe("idle");
  });

  it("fails closed when pure exact-window helpers omit exact evidence", () => {
    const tokens = buildReadingFollowAlongTokensFromText("zero one two three four five six");
    const window = readingFollowAlongWindow({
      activeWordIndex: 3,
      recentWindow: 1,
      tokens,
      upcomingWindow: 2,
      visualMode: "word",
    });

    expect(window.firstWindowWordIndex).toBeNull();
    expect(window.lastWindowWordIndex).toBeNull();
    expect(window.tokens.some(({ inWindow }) => inWindow)).toBe(false);
    expect(window.tokens.map(({ role }) => role)).not.toContain("active");
    expect(
      readingFollowAlongWordRole({
        active: true,
        activeWordIndex: 3,
        cueRole: "current",
        phrase: false,
        token: tokens[3],
      }),
    ).toBe("idle");
  });
});
