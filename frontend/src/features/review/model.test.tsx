import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewPaneAccordion, type ReviewPaneItem } from "./ReviewPaneAccordion";
import {
  buildTemporaryReviewStateAdapter,
  buildReviewPaneSummaries,
  normalizeReviewMode,
  normalizeReviewPane,
  reviewBlocksForMode,
  selectReviewBlockId,
} from "./model";

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

  it("defaults temporary review to quick mode and durable review to full mode", () => {
    expect(normalizeReviewMode(undefined, true)).toBe("quick");
    expect(normalizeReviewMode(undefined, false)).toBe("full");
    expect(normalizeReviewMode("promotion", true)).toBe("promotion");
  });

  it("adapts temporary review state with session-scoped promotion mapping", () => {
    const adapter = buildTemporaryReviewStateAdapter({
      editedTextByBlockId: { block1: "Corrected spoken form" },
      mode: "promotion",
      noteCount: 2,
      policyPinned: true,
      pronunciationOverrideCount: 1,
      sourceOwner: "temporary",
      statusByBlockId: { block1: "approved" },
    });

    expect(adapter.headerLabel).toBe("Temporary source · Review");
    expect(adapter.dataScope).toBe("temporary-session");
    expect(adapter.statusLabel).toBe("Temporary review");
    expect(adapter.promotionMapping.editCount).toBe(1);
    expect(adapter.promotionMapping.noteCount).toBe(2);
    expect(adapter.promotionMapping.pronunciationOverrideCount).toBe(1);
    expect(adapter.promotionMapping.summaryItems).toContain("1 session policy override");
  });

  it("filters quick review to blockers, skipped content, suspicious blocks, and pronunciation warnings", () => {
    const blocks = [
      { id: "clean", status: "waiting", spokenText: "Clean text.", warnings: [] },
      { id: "policy", policyNoteType: "summarized", status: "waiting", spokenText: "Summary." },
      { id: "blocker", status: "retrying", spokenText: "" },
      { id: "skipped", speakMode: "skip", status: "skipped", spokenText: "" },
      { id: "pronunciation", pronunciationCount: 1, status: "waiting", spokenText: "O A I." },
      { id: "warning", status: "waiting", spokenText: "Maybe.", warnings: ["Check structure"] },
    ];

    expect(reviewBlocksForMode(blocks, "quick").map((block) => block.id)).toEqual([
      "blocker",
      "skipped",
      "pronunciation",
      "warning",
    ]);
    expect(reviewBlocksForMode(blocks, "full").map((block) => block.id)).toEqual([
      "clean",
      "policy",
      "blocker",
      "skipped",
      "pronunciation",
      "warning",
    ]);
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
