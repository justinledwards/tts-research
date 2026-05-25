import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinemaFocusModeToolbar } from "./CinemaFocusModeToolbar";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import { CinemaMobileSheet } from "./CinemaMobileSheet";
import {
  buildCinemaCurrentReadingSection,
  buildCinemaInspectorPanels,
  buildCinemaInspectorSection,
  buildCinemaWayfindingSection,
} from "./CinemaInspectorPanels";
import { CinemaTransportBar, type CinemaTransportModel } from "./CinemaTransportBar";
import {
  buildCinemaLayoutState,
  cinemaFocusModeMeta,
  defaultCinemaPanelForMode,
  deriveCinemaPlaybackState,
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

    expect(defaultCinemaPanelForMode(panels, "inspect")).toBe("overview");
    expect(defaultCinemaPanelForMode(panels, "review")).toBe("review");
    expect(defaultCinemaPanelForMode(panels, "debug")).toBe("diagnostics");
    expect(normalizeCinemaInspectorPanelId("policy")).toBe("policy");
    expect(normalizeCinemaInspectorPanelId("missing")).toBeNull();
  });

  it("falls back when active panel ids are no longer available", () => {
    const state = buildCinemaLayoutState({
      activePanelId: "history",
      mode: "inspect",
      panels: makePanels(),
      pinnedPanelId: null,
    });

    expect(state.activePanelId).toBe("overview");
    expect(state.pinnedPanelId).toBeNull();
    expect(state.railVisible).toBe(true);
  });

  it("exposes searchable focus-mode metadata", () => {
    expect(cinemaFocusModeMeta("review").keywords).toContain("bookmarks");
    expect(cinemaFocusModeMeta("read").description).toContain("canvas");
  });

  it("derives canonical playback state for transport visibility", () => {
    expect(deriveCinemaPlaybackState({})).toBe("preAudio");
    expect(deriveCinemaPlaybackState({ isGenerating: true })).toBe("generating");
    expect(
      deriveCinemaPlaybackState({
        hasAudio: true,
        isPlayable: true,
        isPlaying: true,
        progressRatio: 0.4,
      }),
    ).toBe("playing");
    expect(
      deriveCinemaPlaybackState({ hasAudio: true, isPlayable: true, progressRatio: 0.4 }),
    ).toBe("paused");
    expect(deriveCinemaPlaybackState({ hasAudio: true, isPlayable: true, progressRatio: 1 })).toBe(
      "completed",
    );
    expect(deriveCinemaPlaybackState({ status: "failed" })).toBe("degraded");
  });
});

describe("CinemaInspectorDock", () => {
  it("renders only the active panel body", () => {
    const markup = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="review"
        mode="review"
        panels={makePanels()}
        pinnedPanelId={null}
        surface="book"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );

    expect(markup).toContain("Review body");
    expect(markup).not.toContain("Policy body");
    expect(markup).not.toContain("Health body");
  });

  it("renders shared current and wayfinding panel builders through the dock", () => {
    const panels = buildCinemaInspectorPanels([
      buildCinemaCurrentReadingSection({
        detail: "Block 3",
        emptyText: "No current passage",
        excerpt: "The current paragraph is narrated here.",
        label: "Readable Section",
      }),
      buildCinemaWayfindingSection({
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
      buildCinemaInspectorSection({
        children: <p>Health body</p>,
        detail: "Generated audio",
        id: "generated-audio-health",
        kind: "generated-audio-health",
        modeAffinity: "debug",
        tabId: "diagnostics",
        title: "Health",
      }),
    ]);

    const markup = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="overview"
        mode="inspect"
        panels={panels}
        pinnedPanelId={null}
        surface="book"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );

    expect(markup).toContain("Current passage");
    expect(markup).toContain("The current paragraph is narrated here.");
    expect(markup).not.toContain("Health body");
  });

  it("shows pinned inspector panels as badges instead of selected tabs", () => {
    const markup = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="policy"
        mode="read"
        panels={makePanels()}
        pinnedPanelId="policy"
        surface="book"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );

    expect(markup).toContain("Pinned");
    expect(markup).not.toContain('aria-current="true"');
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

  it("renders pre-audio as create, summary, and settings without disabled playback controls", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          generationSettings: <span>Chapter 1</span>,
          playbackState: "preAudio",
          primary: {
            className: "bg-amber-400 text-zinc-950",
            disabled: false,
            label: "Create audio",
            onClick: () => null,
          },
          stateSummary: {
            detail: "Chapter 1 is ready to read.",
            title: "Ready to create audio",
          },
        }}
      />,
    );

    expect(markup).toContain("Create audio");
    expect(markup).toContain("Chapter 1 is ready to read.");
    expect(markup).toContain("Chapter 1");
    expect(markup).not.toContain("-10s");
    expect(markup).not.toContain("Playback speed");
    expect(markup).not.toContain("Bookmark");
    expect(markup).not.toContain("Waveform");
  });
});

describe("CinemaFocusModeToolbar", () => {
  it("labels active debug state as Diagnostics instead of selected More", () => {
    const markup = renderToStaticMarkup(
      <CinemaFocusModeToolbar
        activePanelId="diagnostics"
        mode="debug"
        onAdvancedAction={() => null}
        onModeChange={() => null}
      />,
    );

    expect(markup).toContain("Diagnostics");
    expect(markup).toContain("Active operator mode: Diagnostics");
    expect(markup).not.toContain(">More<");
  });

  it("keeps More as an unselected menu button in normal read state", () => {
    const markup = renderToStaticMarkup(
      <CinemaFocusModeToolbar mode="read" onModeChange={() => null} />,
    );

    expect(markup).toContain("More advanced modes");
    expect(markup).toContain(">More<");
    expect(markup).not.toContain("Active operator mode");
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
      detail: "Source and passage",
      id: "overview",
      modeAffinity: "inspect",
      sections: [
        {
          children: <p>Overview body</p>,
          detail: "Current passage",
          id: "current",
          kind: "current-passage",
          title: "Current",
        },
      ],
      title: "Overview",
    },
    {
      detail: "Review tasks",
      id: "review",
      modeAffinity: "review",
      sections: [
        {
          children: <p>Review body</p>,
          detail: "Block status",
          id: "review-blocks",
          kind: "narration-block-status",
          title: "Blocks",
        },
      ],
      title: "Review",
    },
    {
      detail: "Pinned policy",
      id: "policy",
      modeAffinity: ["inspect", "review"],
      sections: [
        {
          children: <p>Policy body</p>,
          detail: "Pinned policy",
          id: "policy-section",
          kind: "speech-policy",
          title: "Policy",
        },
      ],
      title: "Policy",
    },
    {
      detail: "Generated audio",
      id: "diagnostics",
      modeAffinity: "debug",
      sections: [
        {
          children: <p>Health body</p>,
          detail: "Generated audio",
          id: "health",
          kind: "generated-audio-health",
          title: "Health",
        },
      ],
      title: "Diagnostics",
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
    playbackState: "playing",
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
