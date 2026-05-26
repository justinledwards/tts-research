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

  it("uses one normalized lifecycle summary instead of Lifecycle and Audio metadata chips", () => {
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

    expect(markup).toContain("Audio ready");
    expect(markup).toContain("Policy Enterprise");
    expect(markup).toContain("Voice Narrator Alpha");
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
