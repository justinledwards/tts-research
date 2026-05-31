import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HighlightRenderer } from "./HighlightRenderer";
import { readAlongAnchorForWord, readAlongAnchorSelectors } from "./domAnchorResolver";
import {
  readAlongHighlightModeLabel,
  readAlongVisualModeFromRuntime,
} from "./highlightVisualModes";
import { resolveReadAlongScrollPolicy } from "./scrollFollowPolicy";

describe("read-along highlight rendering", () => {
  it("renders stable word anchors for book pages without depending on abstract token only", () => {
    const markup = renderToStaticMarkup(
      <HighlightRenderer
        activeWordIndex={4}
        cueRole="current"
        mode="word"
        sourceId="book-1"
        surface="book"
        timingState="trusted"
        tokens={[
          { text: "First", title: "Page 2", trailingText: " ", wordIndex: 3 },
          { text: "target", title: "Page 2", trailingText: " ", wordIndex: 4 },
        ]}
      />,
    );

    expect(markup).toContain('data-readalong-renderer=""');
    expect(markup).toContain('data-readalong-surface="book"');
    expect(markup).toContain('data-book-word="4"');
    expect(markup).toContain('data-readalong-word-index="4"');
    expect(markup).toContain("book-cinema-word-active");
    expect(markup).toContain('aria-current="true"');
    expect(markup).toContain('data-readalong-word-role="active"');
    expect(markup).toContain('data-readalong-cue-role="current"');
    expect(markup).toContain('data-readalong-timing-state="trusted"');
  });

  it("renders phrase fallback as a range instead of pretending exact word sync", () => {
    const markup = renderToStaticMarkup(
      <HighlightRenderer
        activeWordIndex={9}
        cueRole="current"
        mode="phrase"
        phraseWordEnd={3}
        phraseWordStart={2}
        surface="website"
        timingState="lowConfidence"
        text="Before the active phrase continues calmly"
      />,
    );

    expect(markup).toContain('data-readalong-visual-mode="phrase"');
    expect(markup).toContain('data-readalong-uncertainty="visible"');
    expect(markup).not.toContain('aria-current="true"');
    expect(markup).toContain("readalong-highlight--phrase");
    expect(markup).toContain('data-readalong-word-role="activePhrase"');
  });

  it("normalizes stale and degraded runtime states into honest visual modes", () => {
    expect(
      readAlongVisualModeFromRuntime({
        mode: "word",
        state: "stale-audio",
      }),
    ).toBe("none");
    expect(
      readAlongVisualModeFromRuntime({
        mode: "block",
        state: "degraded",
      }),
    ).toBe("degraded");
    expect(readAlongHighlightModeLabel("degraded")).toBe("Degraded highlight");
  });

  it("builds resolver selectors from source, node, and word identity", () => {
    const anchor = readAlongAnchorForWord({
      fallbackTextQuote: "current word",
      nodeId: "chapter-1:block-2",
      sourceId: "book-1",
      tokenOffset: 2,
      wordIndex: 42,
    });

    expect(anchor.anchorId).toBe("book-1:chapter-1-block-2:42:2");
    expect(readAlongAnchorSelectors(anchor)).toContain('[data-readalong-word-index="42"]');
    expect(
      readAlongAnchorSelectors(anchor).some((selector) => selector.includes("chapter-1")),
    ).toBe(true);
  });

  it("keeps reduced-motion scroll bounded and disables auto-follow when requested", () => {
    expect(
      resolveReadAlongScrollPolicy({
        autoFollow: false,
        mode: "word",
        settings: { reducedMotion: false },
        surface: "document",
      }).policy,
    ).toBe("off");

    const reduced = resolveReadAlongScrollPolicy({
      autoFollow: true,
      mode: "word",
      settings: { reducedMotion: true },
      surface: "teleprompt",
    });

    expect(reduced.behavior).toBe("auto");
    expect(reduced.policy).toBe("gentle");
  });
});
