import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOCK_PROVIDER_CAPABILITIES } from "../provider-capabilities";
import type { TTSEngineDiagnostics } from "../../types";
import { DemoMode } from "./DemoMode";

const noop = () => {
  // Test callback.
};

describe("DemoMode", () => {
  it("renders the Studio tutorial as a non-modal drawer with a persistent hide control", () => {
    const markup = renderDemoMode();

    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-label="Studio tutorial"');
    expect(markup).not.toContain('aria-modal="true"');
    expect(markup).toContain('data-testid="studio-tutorial-drawer"');
    expect(markup).toContain('data-testid="ui-action-demo-collapse"');
    expect(markup).toContain("Hide tutorial");
    expect(markup).toContain('data-testid="ui-action-demo-finish"');
    expect(markup).toContain("Finish tutorial");
    expect(markup).toContain("Mock provider");
  });

  it("keeps disabled Create audio and Cinema tour states explainable", () => {
    const markup = renderDemoMode({ canCreateAudio: false, canOpenCinema: false });

    expect(markup).toContain('data-testid="ui-action-demo-tour-createAudio"');
    expect(markup).toContain("Load a demo source before creating mock audio.");
    expect(markup).toContain('data-testid="ui-action-demo-tour-openCinema"');
    expect(markup).toContain("Create audio with the mock provider before opening Cinema.");
  });

  it("marks the active tutorial step from the current workspace stage", () => {
    const markup = renderDemoMode({ currentStage: "preview" });

    expect(markup).toContain('data-testid="ui-action-demo-tour-preview"');
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain(">Preview</span>");
  });
});

function renderDemoMode(overrides: Partial<Parameters<typeof DemoMode>[0]> = {}): string {
  return renderToStaticMarkup(
    <DemoMode
      activeDemoProjectId={null}
      canCreateAudio
      canOpenCinema={false}
      currentStage="intake"
      hasGeneratedAudio={false}
      providerEngineId="mock"
      providerEngines={[mockEngine()]}
      onClose={noop}
      onCompleteTutorial={noop}
      onCreateAndListen={noop}
      onHideTutorial={noop}
      onOpenCinema={noop}
      onOpenDemoProject={noop}
      onStageSelect={noop}
      {...overrides}
    />,
  );
}

function mockEngine(): TTSEngineDiagnostics {
  return {
    capabilities: MOCK_PROVIDER_CAPABILITIES,
    default: true,
    experimental: false,
    id: "mock",
    label: "Mock/local provider",
    local: true,
    status: "ready",
    supportsReference: true,
    supportsSSML: true,
    supportsSwedish: true,
    supportsVoice: true,
  };
}
