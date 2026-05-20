import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import {
  buildCinemaLayoutState,
  defaultCinemaPanelForMode,
  type CinemaPanelDefinition,
} from "./model";

describe("cinema focus layout model", () => {
  it("defaults read mode to canvas-first without a rail", () => {
    const state = buildCinemaLayoutState({
      mode: "read",
      panels: makePanels(),
    });

    expect(state.canvasFirst).toBe(true);
    expect(state.railVisible).toBe(false);
    expect(state.activePanelId).toBeNull();
  });

  it("keeps a pinned panel visible while read mode remains canvas-first", () => {
    const state = buildCinemaLayoutState({
      mode: "read",
      panels: makePanels(),
      pinnedPanelId: "policy",
    });

    expect(state.canvasFirst).toBe(true);
    expect(state.railVisible).toBe(true);
    expect(state.activePanelId).toBe("policy");
  });

  it("chooses mode-affinity defaults for inspector modes", () => {
    const panels = makePanels();

    expect(defaultCinemaPanelForMode(panels, "inspect")).toBe("provenance");
    expect(defaultCinemaPanelForMode(panels, "review")).toBe("current");
    expect(defaultCinemaPanelForMode(panels, "debug")).toBe("health");
  });
});

describe("CinemaInspectorDock", () => {
  it("renders only the active panel body", () => {
    const markup = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="current"
        mode="review"
        panels={makePanels()}
        pinnedPanelId={null}
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );

    expect(markup).toContain("Current body");
    expect(markup).not.toContain("Policy body");
    expect(markup).not.toContain("Health body");
  });
});

function makePanels(): CinemaPanelDefinition[] {
  return [
    {
      children: <p>Current body</p>,
      detail: "Current passage",
      id: "current",
      modeAffinity: "review",
      title: "Current",
    },
    {
      children: <p>Provenance body</p>,
      detail: "Source provenance",
      id: "provenance",
      modeAffinity: "inspect",
      title: "Provenance",
    },
    {
      children: <p>Policy body</p>,
      detail: "Pinned policy",
      id: "policy",
      modeAffinity: ["inspect", "review"],
      title: "Policy",
    },
    {
      children: <p>Health body</p>,
      detail: "Generated audio",
      id: "health",
      modeAffinity: "debug",
      title: "Health",
    },
  ];
}
