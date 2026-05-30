import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RailMiniStack, railColumnWidth } from "./index";

describe("workspace rail summaries", () => {
  it("collapses hidden rails to zero width for a task-dominant workspace", () => {
    expect(railColumnWidth("collapsed", "left")).toBe("0px");
    expect(railColumnWidth("collapsed", "right")).toBe("0px");
    expect(railColumnWidth("compact", "left")).toBe("140px");
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
});
