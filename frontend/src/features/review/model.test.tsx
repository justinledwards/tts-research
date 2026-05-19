import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewPaneAccordion, type ReviewPaneItem } from "./ReviewPaneAccordion";
import { buildReviewPaneSummaries, normalizeReviewPane, selectReviewBlockId } from "./model";

describe("review pane model", () => {
  it("normalizes active panes and falls back to blocks", () => {
    expect(normalizeReviewPane("script")).toBe("script");
    expect(normalizeReviewPane("validation")).toBe("validation");
    expect(normalizeReviewPane("preview")).toBe("blocks");
  });

  it("keeps the selected block when it exists and falls back to the first block", () => {
    const blocks = [{ id: "one" }, { id: "two" }];

    expect(selectReviewBlockId(blocks, "two")).toBe("two");
    expect(selectReviewBlockId(blocks, "missing")).toBe("one");
    expect(selectReviewBlockId([], "missing")).toBeNull();
  });

  it("summarizes validation transcript readiness", () => {
    expect(
      buildReviewPaneSummaries({
        blockCount: 2,
        hasSpokenScript: true,
        validationSimilarity: 0.91,
        validationTranscript: "spoken text",
      }),
    ).toContainEqual({
      detail: "Transcript ready · 91% match",
      id: "validation",
      title: "Validation Transcript",
    });
  });
});

describe("ReviewPaneAccordion", () => {
  it("renders only the active pane body", () => {
    const panes: ReviewPaneItem[] = [
      { children: <p>Blocks body</p>, detail: "3 blocks", id: "blocks", title: "Block Review" },
      { children: <p>Script body</p>, detail: "ready", id: "script", title: "Spoken Script" },
      {
        children: <p>Validation body</p>,
        detail: "waiting",
        id: "validation",
        title: "Validation Transcript",
      },
    ];

    const markup = renderToStaticMarkup(
      <ReviewPaneAccordion activePane="script" panes={panes} onActivePaneChange={() => null} />,
    );

    expect(markup).toContain("Script body");
    expect(markup).not.toContain("Blocks body");
    expect(markup).not.toContain("Validation body");
  });
});
