import { describe, expect, it } from "vitest";
import { shouldShowGlobalPreviewPlayer } from "./playbackSurfaceRules";

describe("playback surface rules", () => {
  it("keeps the floating preview player out of the redesigned Preview stage", () => {
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "preview" })).toBe(false);
    expect(shouldShowGlobalPreviewPlayer({ owner: "preview", stage: "review" })).toBe(true);
  });

  it("hides the floating preview player behind dedicated playback surfaces", () => {
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
