import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createRunConfiguration } from "../../runConfig";
import { HelpPanel } from "./HelpPanel";

const noop = () => {
  // Test callback.
};

describe("HelpPanel", () => {
  it("renders compact contextual anchors instead of a long pipeline guide", () => {
    const markup = renderToStaticMarkup(
      <HelpPanel
        context={{
          activeCinema: null,
          runConfiguration: createRunConfiguration("checkedMaster"),
          sourceMode: "fileUrl",
          stage: "review",
          studioMode: "narration",
        }}
        isOpen
        job={null}
        profileSource={null}
        profileSourceDiagnostics={null}
        selectedProfile={null}
        onClose={noop}
      />,
    );

    expect(markup).toContain("Context Guide");
    expect(markup).toContain("Workflow anchors");
    expect(markup).toContain("Intake");
    expect(markup).toContain("Review");
    expect(markup).toContain("Preview");
    expect(markup).toContain("Teleprompt");
    expect(markup).toContain("Cinema");
    expect(markup).not.toContain("Voice Studio Flow");
  });
});
