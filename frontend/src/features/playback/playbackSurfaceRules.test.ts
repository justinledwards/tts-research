import { describe, expect, it } from "vitest";
import { shouldShowGlobalPreviewPlayer } from "./playbackSurfaceRules";

describe("playback surface rules", () => {
  it("shows the floating preview player for Review and Preview stages", () => {
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "preview" })).toBe(true);
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "review" })).toBe(true);
  });

  it("hides the floating preview player behind dedicated playback surfaces", () => {
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "teleprompt" })).toBe(false);
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "theatre" })).toBe(false);
    expect(
      shouldShowGlobalPreviewPlayer({
        isCinemaOpen: true,
        owner: "preview",
        stage: "review",
      }),
    ).toBe(false);
    expect(shouldShowGlobalPreviewPlayer({ owner: "teleprompt", stage: "review" })).toBe(false);
  });
});
