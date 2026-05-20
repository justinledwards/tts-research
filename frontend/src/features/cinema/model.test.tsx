import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import { CinemaMobileSheet } from "./CinemaMobileSheet";
import {
  buildCinemaCurrentReadingPanel,
  buildCinemaInspectorPanel,
  buildCinemaWayfindingPanel,
} from "./CinemaInspectorPanels";
import { CinemaTransportBar, type CinemaTransportModel } from "./CinemaTransportBar";
import {
  buildCinemaLayoutState,
  cinemaFocusModeMeta,
  defaultCinemaPanelForMode,
  normalizeCinemaInspectorPanelId,
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
    expect(normalizeCinemaInspectorPanelId("policy")).toBe("policy");
    expect(normalizeCinemaInspectorPanelId("missing")).toBeNull();
  });

  it("falls back when active or pinned panel ids are no longer available", () => {
    const state = buildCinemaLayoutState({
      activePanelId: "notes",
      mode: "inspect",
      panels: makePanels(),
      pinnedPanelId: "debug",
    });

    expect(state.activePanelId).toBe("provenance");
    expect(state.pinnedPanelId).toBeNull();
    expect(state.railVisible).toBe(true);
  });

  it("exposes searchable focus-mode metadata", () => {
    expect(cinemaFocusModeMeta("review").keywords).toContain("bookmarks");
    expect(cinemaFocusModeMeta("read").description).toContain("canvas");
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

  it("renders shared current and wayfinding panel builders through the dock", () => {
    const panels = [
      buildCinemaCurrentReadingPanel({
        detail: "Block 3",
        emptyText: "No current passage",
        excerpt: "The current paragraph is narrated here.",
        label: "Readable Section",
      }),
      buildCinemaWayfindingPanel({
        bookmarks: [],
        canBookmark: true,
        outlineItems: [
          {
            detail: "Heading",
            id: "section-1",
            label: "Readable Section",
            target: "section-1",
          },
        ],
        recentItems: [],
        onAddBookmark: () => null,
        onBookmarkNavigate: () => null,
        onOutlineNavigate: () => null,
        onRecentNavigate: () => null,
      }),
      buildCinemaInspectorPanel({
        children: <p>Health body</p>,
        detail: "Generated audio",
        id: "health",
        modeAffinity: "debug",
        title: "Health",
      }),
    ];

    const markup = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="current"
        mode="review"
        panels={panels}
        pinnedPanelId={null}
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );

    expect(markup).toContain("Current passage");
    expect(markup).toContain("The current paragraph is narrated here.");
    expect(markup).not.toContain("Health body");
  });
});

describe("CinemaTransportBar", () => {
  it("renders shared seek, speed, bookmark, and display controls", () => {
    const markup = renderToStaticMarkup(<CinemaTransportBar model={makeTransportModel()} />);

    expect(markup).toContain("-10s");
    expect(markup).toContain("+10s");
    expect(markup).toContain("Bookmark");
    expect(markup).toContain("Playback speed");
    expect(markup).toContain("Display");
  });

  it("links the mobile More control to the active bottom sheet", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          mobileMore: {
            active: true,
            controlsId: "cinema-more-sheet",
            onClick: () => null,
          },
        }}
      />,
    );

    expect(markup).toContain('aria-controls="cinema-more-sheet"');
    expect(markup).toContain('aria-expanded="true"');
  });
});

describe("CinemaMobileSheet", () => {
  it("renders stable sheet semantics and display controls", () => {
    const markup = renderToStaticMarkup(
      <CinemaMobileSheet
        activePanelId="source"
        displayControls={<div>Display panel</div>}
        id="cinema-more-sheet"
        label="Cinema more controls"
        panels={[{ children: <p>Source body</p>, id: "source", label: "Source" }]}
        onPanelChange={() => null}
      />,
    );

    expect(markup).toContain('id="cinema-more-sheet"');
    expect(markup).toContain('aria-label="Cinema more controls"');
    expect(markup).toContain('data-cinema-mobile-display-controls=""');
    expect(markup).toContain("Display panel");
    expect(markup).toContain("Source body");
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

function makeTransportModel(): CinemaTransportModel {
  return {
    bookmark: {
      disabled: false,
      onClick: () => null,
    },
    displayControls: <span>Display</span>,
    mobileMore: {
      active: false,
      controlsId: "cinema-more-sheet",
      onClick: () => null,
    },
    playbackRate: {
      disabled: false,
      value: 1,
      onChange: () => null,
    },
    primary: {
      className: "bg-orange-600 text-white",
      disabled: false,
      label: "Play",
      onClick: () => null,
    },
    progress: {
      currentLabel: "0:10",
      durationLabel: "1:00",
      ratio: 0.2,
      waveform: <div>Waveform</div>,
    },
    restart: {
      disabled: false,
      onClick: () => null,
    },
    skipBackward: {
      disabled: false,
      onClick: () => null,
    },
    skipForward: {
      disabled: false,
      onClick: () => null,
    },
  };
}
