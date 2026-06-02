import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SourceLifecycleEnvelope } from "../source-lifecycle";
import { HeaderContextSummary } from "./HeaderContextSummary";
import { buildHeaderLifecycleSentence, normalizeHeaderStateLabel } from "./headerLifecycleSentence";

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

  it("keeps ordinary lifecycle status out of the visible header badge", () => {
    const markup = renderToStaticMarkup(
      <HeaderContextSummary
        metadata={[
          { label: "Policy", value: "Enterprise" },
          { label: "Voice", value: "Narrator Alpha" },
        ]}
        scopeTitle="Full source"
        sourceLifecycle={sourceLifecycleFixture("audioReady", "ready")}
        sourceTitle="Long source title"
        stateLabel="Audio ready"
        surfaceName="Document Cinema"
        variant="bar"
      />,
    );

    expect(markup).not.toContain('data-status-chip=""');
    expect(markup).not.toContain(">Lifecycle<");
  });

  it("qualifies bare ready labels before they reach the visible status chip", () => {
    expect(normalizeHeaderStateLabel("Ready", "Preview")).toBe("Preview ready");
    expect(normalizeHeaderStateLabel("Ready", "Book Cinema")).toBe("Source ready");
    expect(
      buildHeaderLifecycleSentence({
        metadata: [],
        stateLabel: "Ready",
        surfaceName: "Preview",
      }).primaryLabel,
    ).toBe("Preview ready");
  });

  it("can keep lifecycle details available only through the info popover", () => {
    const markup = renderToStaticMarkup(
      <HeaderContextSummary
        inlineSummary={false}
        metadata={[
          { label: "Policy", value: "Education" },
          { label: "Voice", value: "Narrator Alpha" },
        ]}
        scopeTitle="Full source"
        sourceLifecycle={sourceLifecycleFixture("audioReady", "ready")}
        sourceTitle="Website fixture article"
        stateLabel="Audio ready"
        surfaceName="Website Cinema"
        variant="bar"
      />,
    );

    expect(markup).toContain('data-source-identity-summary=""');
    expect(markup).toContain('data-cinema-header-line="state"');
    expect(markup).toContain('data-cinema-header-line="source-title"');
    expect(markup).toContain('data-cinema-header-line="scope"');
    expect(markup).toContain("Show full Website Cinema context");
    expect(markup).toContain("Policy");
    expect(markup).toContain("Education");
    expect(markup).not.toContain("Lifecycle summary");
  });
});

function sourceLifecycleFixture(
  canonicalState: SourceLifecycleEnvelope["canonicalState"],
  generatedAudioState: SourceLifecycleEnvelope["generatedAudioState"],
): SourceLifecycleEnvelope {
  return {
    adapterKind: "markdown",
    canonicalState,
    extractionState: "extracted",
    generatedAudioState,
    language: "en",
    lastOpenedSurface: "Cinema",
    narrationState: canonicalState === "audioReady" ? "audioReady" : "narratable",
    policyScope: "project",
    projectId: "project-1",
    selectedScope: "Full source",
    sourceId: "source-1",
    sourceKind: "document",
    title: "Long source title",
  };
}
