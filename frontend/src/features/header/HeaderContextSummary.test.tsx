import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeaderContextSummary } from "./HeaderContextSummary";

describe("HeaderContextSummary", () => {
  it("keeps full source and scope names available beside truncated visual text", () => {
    const markup = renderToStaticMarkup(
      <HeaderContextSummary
        metadata={[
          { label: "Policy", value: "Accessibility · Source + Session" },
          { label: "Voice", value: "Narrator Alpha" },
        ]}
        scopeTitle="Kappa integration chapter with a deliberately long label"
        sourceTitle="Borges collected works with another deliberately long display title"
        stateLabel="Review"
        surfaceName="Book Cinema"
      />,
    );

    expect(markup).toContain("Book Cinema");
    expect(markup).toContain("Borges collected works with another deliberately long display title");
    expect(markup).toContain("Kappa integration chapter with a deliberately long label");
    expect(markup).toContain("Show full Book Cinema context");
    expect(markup).toContain("Source");
    expect(markup).toContain("Scope");
    expect(markup).toContain("Policy");
  });
});
