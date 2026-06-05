import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RailMiniStack, railColumnWidth } from "./index";

describe("workspace rail summaries", () => {
  it("collapses hidden rails to zero width for a task-dominant workspace", () => {
    expect(railColumnWidth("collapsed", "left")).toBe("0px");
    expect(railColumnWidth("collapsed", "right")).toBe("0px");
    expect(railColumnWidth("compact", "left")).toBe("140px");
    expect(railColumnWidth("compact", "right")).toContain("clamp");
  });

  it("renders compact rail summaries without local layout mode controls", () => {
    const markup = renderToStaticMarkup(
      <RailMiniStack
        items={[
          { detail: "ready", label: "Source", value: "Draft" },
          { detail: "selected", label: "Voice", value: "Default" },
        ]}
      />,
    );

    expect(markup).toContain("Draft");
    expect(markup).not.toContain('data-segmented-control="rail-mode"');
    expect(markup).not.toContain("Full</button>");
    expect(markup).not.toContain("Slim</button>");
    expect(markup).not.toContain("Hide</button>");
  });

  it("renders compact rail summaries as actionable cards when handlers are provided", () => {
    const markup = renderToStaticMarkup(
      <RailMiniStack
        items={[
          {
            actionSurface: "Source Rail",
            detail: "Full source",
            label: "Source",
            onClick: () => null,
            testId: "rail-source",
            value: "Designing High-Function Cockpits",
          },
          {
            actionSurface: "Audio Rail",
            detail: "12:20",
            label: "Audio",
            onClick: () => null,
            testId: "rail-audio",
            tone: "ready",
            value: "Audio ready",
          },
        ]}
      />,
    );

    expect(markup).toContain('data-testid="rail-source"');
    expect(markup).toContain('data-testid="rail-audio"');
    expect(markup).toContain('data-ui-action-surface="Audio Rail"');
    expect(markup).toContain("Audio ready");
    expect(markup).toContain("bg-[var(--vs-success-soft)]");
  });
});
