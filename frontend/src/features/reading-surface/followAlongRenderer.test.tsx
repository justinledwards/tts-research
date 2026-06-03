import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReadingFollowAlongRenderer } from "./ReadingFollowAlongRenderer";
import {
  READING_FOLLOW_ALONG_DISPLAY_PRESETS,
  READING_FOLLOW_ALONG_LINE_LENGTH_RULES,
  buildReadingFollowAlongTokensFromText,
  normalizeReadingFollowAlongCue,
  readingFollowAlongVisualMode,
} from "./followAlongModel";

describe("reading follow-along renderer", () => {
  it("claims exact current word only when trusted timing and source identity agree", () => {
    const sourceWordIdByWordIndex = new Map([[1, "book-1:scope:word:41"]]);
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
      />,
    );

    expect(markup).toContain('data-reading-followalong-renderer=""');
    expect(markup).toContain('data-reading-followalong-exact-word="true"');
    expect(markup).toContain('data-reading-followalong-visual-mode="word"');
    expect(markup).toContain('data-source-word-id="book-1:scope:word:41"');
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="active"');
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
});
