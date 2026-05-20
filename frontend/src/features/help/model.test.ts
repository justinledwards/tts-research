import { describe, expect, it } from "vitest";
import { createRunConfiguration } from "../../runConfig";
import { HELP_ANCHORS, resolveActiveHelpAnchor, type HelpWorkflowContext } from "./model";

const baseContext: HelpWorkflowContext = {
  activeCinema: null,
  runConfiguration: createRunConfiguration("checkedMaster"),
  sourceMode: "text",
  stage: "intake",
  studioMode: "narration",
};

describe("help model", () => {
  it("keeps contextual help anchors compact and ordered", () => {
    expect(HELP_ANCHORS.map((anchor) => anchor.id)).toEqual([
      "intake",
      "review",
      "preview",
      "teleprompt",
      "run",
      "cinema",
    ]);
  });

  it("resolves the active anchor from workflow context", () => {
    expect(resolveActiveHelpAnchor(baseContext)).toBe("intake");
    expect(resolveActiveHelpAnchor({ ...baseContext, stage: "review" })).toBe("review");
    expect(resolveActiveHelpAnchor({ ...baseContext, stage: "preview" })).toBe("preview");
    expect(resolveActiveHelpAnchor({ ...baseContext, stage: "teleprompt" })).toBe("teleprompt");
    expect(resolveActiveHelpAnchor({ ...baseContext, studioMode: "voiceCloning" })).toBe("run");
    expect(resolveActiveHelpAnchor({ ...baseContext, activeCinema: "book" })).toBe("cinema");
  });
});
