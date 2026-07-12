import { describe, expect, it } from "vitest";
import { overlayDataAttributes, workspaceOverlayState } from "./overlayManager";

describe("overlay manager", () => {
  it("keeps the preview player floating only when all edge zones are collapsed", () => {
    expect(
      workspaceOverlayState({
        activityFooterMode: "collapsed",
        previewPlayerVisible: true,
        rightRailMode: "collapsed",
        stage: "preview",
      }),
    ).toMatchObject({
      previewPlacement: "floating",
      previewVariant: "full",
    });
  });

  it("moves preview playback inline when the right rail or activity footer claims space", () => {
    expect(
      workspaceOverlayState({
        activityFooterMode: "compact",
        previewPlayerVisible: true,
        rightRailMode: "compact",
        stage: "review",
      }),
    ).toMatchObject({
      previewPlacement: "inline",
      previewVariant: "compact",
    });
  });

  it("keeps the full A/B comparison affordances when Preview is inline", () => {
    expect(
      workspaceOverlayState({
        activityFooterMode: "full",
        previewPlayerVisible: true,
        rightRailMode: "full",
        stage: "preview",
      }),
    ).toMatchObject({
      previewPlacement: "inline",
      previewVariant: "full",
    });
  });

  it("hides preview playback when the ownership rules say it is unavailable", () => {
    expect(
      workspaceOverlayState({
        activityFooterMode: "full",
        previewPlayerVisible: false,
        rightRailMode: "full",
        stage: "teleprompt",
      }).previewPlacement,
    ).toBe("hidden");
  });

  it("emits stable overlay data attributes for browser geometry audits", () => {
    expect(overlayDataAttributes("preview-player", "floating-preview")).toEqual({
      "data-overlay-owner": "preview-player",
      "data-overlay-zone": "floating-preview",
    });
  });
});
