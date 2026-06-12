import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CinemaFocusModeToolbar } from "./CinemaFocusModeToolbar";
import { CinemaInspectorDock } from "./CinemaInspectorDock";
import {
  buildCinemaCurrentReadingSection,
  buildCinemaInspectorPanels,
  buildCinemaInspectorSection,
  buildCinemaTemporaryInspectorSections,
  buildCinemaWayfindingSection,
} from "./CinemaInspectorPanels";
import { CinemaMobileSheet } from "./CinemaMobileSheet";
import { CinemaTheatreChrome } from "./CinemaTheatre";
import { CinemaTransportBar, type CinemaTransportModel } from "./CinemaTransportBar";
import { cinemaCanvasBudgetFor } from "./canvasBudget";
import {
  CINEMA_MORE_ACTIONS,
  CINEMA_MORE_ACTION_BUDGETS,
  CINEMA_MORE_REQUIRED_SECTION_IDS,
  CINEMA_MORE_SECTIONS,
  activeCinemaMoreAction,
  cinemaMoreActionsBySection,
} from "./cinemaMoreActions";
import {
  buildCinemaLayoutState,
  type CinemaPanelDefinition,
  cinemaFocusModeMeta,
  cinemaRendererLifecycleDetail,
  defaultCinemaPanelForMode,
  deriveCinemaPlaybackState,
  deriveCinemaReadinessDisplay,
  isCinemaRendererReady,
  normalizeCinemaInspectorPanelId,
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
        isGenerating: true,
        isPlayable: true,
        isPlaying: false,
        status: "synthesizing",
      }),
    ).toBe("playable");
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

  it("derives header readiness from renderer and audio state together", () => {
    expect(
      deriveCinemaReadinessDisplay({
        playbackState: "playable",
        rendererLifecycle: "loading",
      }),
    ).toMatchObject({
      audioLabel: "Waiting for reader",
      label: "Preparing reader",
      readerLabel: "Preparing reader",
    });
    expect(
      deriveCinemaReadinessDisplay({
        isPlaybackActive: true,
        playbackState: "playing",
        rendererLifecycle: "ready",
      }),
    ).toMatchObject({
      audioLabel: "Playing",
      label: "Playing",
      readerLabel: "Reader ready",
    });
    expect(isCinemaRendererReady("ready")).toBe(true);
    expect(cinemaRendererLifecycleDetail("failed")).toContain("Renderer failed");
  });

  it("publishes reader canvas budgets for read and pinned modes", () => {
    expect(
      cinemaCanvasBudgetFor({ canvasFirst: true, focusMode: "read", hasInspector: false }),
    ).toMatchObject({
      kind: "read",
      minCanvasHeightRatio: 0.58,
      minCanvasWidthRatio: 0.9,
    });
    expect(
      cinemaCanvasBudgetFor({ canvasFirst: true, focusMode: "read", hasInspector: true }),
    ).toMatchObject({
      kind: "read-pinned",
      minCanvasHeightRatio: 0.54,
    });
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

  it("exposes temporary source overview, review, diagnostics, history, and promotion tabs", () => {
    const panels = buildCinemaInspectorPanels([
      ...buildCinemaTemporaryInspectorSections({
        artifactCount: 0,
        audioStatus: "No generated audio",
        bookmarkCount: 0,
        contract: {
          expiryLabel: "Expires Jun 12, 2026, 1:40 PM",
          historyScope: "temporary-session",
          isTemporary: true,
          ownershipLabel: "Temporary",
          provenanceLabel: "Temporary website cinema session",
          sourceOwner: "temporary",
          statusLabel: "Temporary source",
          surface: "website",
          temporarySourceId: "tmp-123",
        },
        diagnostics: [],
        originLabel: "https://example.test/story",
        policyLabel: "Session override",
        promotionItems: ["Temporary source text", "Project source pin"],
        pronunciationCount: 0,
        recentPositionCount: 0,
        repairNotes: [],
        reviewEditCount: 0,
        skippedCount: 0,
        sourceTypeLabel: "Website",
        timingConfidence: "No timing map",
        title: "Temporary Story",
        warnings: [],
      }),
    ]);

    expect(panels.map((panel) => panel.id)).toEqual([
      "overview",
      "review",
      "diagnostics",
      "policy",
      "history",
    ]);

    const overview = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="overview"
        mode="inspect"
        panels={panels}
        pinnedPanelId={null}
        surface="website"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );
    expect(overview).toContain("Temporary source");
    expect(overview).toContain("Temporary Story");
    expect(overview).toContain("Expires Jun 12, 2026, 1:40 PM");

    const review = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="review"
        mode="review"
        panels={panels}
        pinnedPanelId={null}
        surface="website"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );
    expect(review).toContain("No review edits or repair notes exist");

    const diagnostics = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="diagnostics"
        mode="debug"
        panels={panels}
        pinnedPanelId={null}
        surface="website"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );
    expect(diagnostics).toContain("No generated audio, skipped content, timing map");

    const history = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="history"
        mode="review"
        panels={panels}
        pinnedPanelId={null}
        surface="website"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );
    expect(history).toContain("Temporary session only");

    const policy = renderToStaticMarkup(
      <CinemaInspectorDock
        activePanelId="policy"
        mode="inspect"
        panels={panels}
        pinnedPanelId={null}
        surface="website"
        onActivePanelChange={() => null}
        onPinnedPanelChange={() => null}
      />,
    );
    expect(policy).toContain("Promotion");
    expect(policy).toContain("Temporary source text, Project source pin");
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
  it("renders compact shared seek, speed, bookmark, and display entry point", () => {
    const markup = renderToStaticMarkup(<CinemaTransportBar model={makeTransportModel()} />);

    expect(markup).toContain("-10s");
    expect(markup).toContain("+10s");
    expect(markup).toContain("Bookmark");
    expect(markup).toContain("Playback speed");
    expect(markup).toContain("Open reader display settings");
    expect(markup).toContain("Display");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Display panel");
  });

  it("keeps navigation entry points out of the transport footer", () => {
    const markup = renderToStaticMarkup(<CinemaTransportBar model={makeTransportModel()} />);

    expect(markup).not.toContain("Theatre");
    expect(markup).not.toContain(">More<");
    expect(markup).not.toContain("cinema-more-sheet");
  });

  it("explains disabled playback even when generated audio is ready", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          playbackState: "playable",
          primary: {
            className: "bg-[var(--vs-action-primary-hover)] text-[var(--vs-action-primary-text)]",
            disabled: true,
            label: "Play",
            onClick: () => null,
          },
        }}
      />,
    );

    expect(markup).toContain("data-disabled-reason=");
    expect(markup).toContain("reader can attach to generated audio");
  });

  it("renders pre-audio as create, summary, and settings without disabled playback controls", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          generationSettings: <span>Chapter 1</span>,
          playbackState: "preAudio",
          primary: {
            className: "bg-[var(--vs-status-warning)] text-[var(--vs-text-primary)]",
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

  it("renders first-segment preparation as status instead of a disabled fake action", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          playbackState: "generating",
          primary: {
            className: "bg-[var(--vs-action-primary-hover)] text-[var(--vs-action-primary-text)]",
            disabled: true,
            label: "Preparing first segment",
            onClick: () => null,
          },
          progress: {
            ...makeTransportModel().progress,
            currentLabel: "Preparing first segment",
            ratio: 0,
          },
          stateSummary: {
            detail: "Full book narration is preparing its first playable segment.",
            title: "Preparing first segment",
          },
        }}
      />,
    );

    expect(markup).toContain('data-cinema-generation-preparing=""');
    expect(markup).toContain("Preparing first segment");
    expect(markup).not.toContain("disabled");
  });

  it("surfaces degraded recovery details without navigation clutter", () => {
    const markup = renderToStaticMarkup(
      <CinemaTransportBar
        model={{
          ...makeTransportModel(),
          details: {
            disabled: false,
            label: "View details",
            onClick: () => null,
          },
          playbackState: "degraded",
          primary: {
            className: "bg-[var(--vs-action-primary-hover)] text-[var(--vs-action-primary-text)]",
            disabled: false,
            label: "Retry generation",
            onClick: () => null,
          },
          stateSummary: {
            detail: "Provider failed while creating audio.",
            title: "Generation failed",
          },
        }}
      />,
    );

    expect(markup).toContain("Generation failed");
    expect(markup).toContain("Provider failed while creating audio.");
    expect(markup).toContain("View details");
    expect(markup).toContain("Retry generation");
    expect(markup).not.toContain("Theatre");
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

    expect(markup).toContain("Open Cinema More menu");
    expect(markup).toContain(">More<");
    expect(markup).not.toContain("Active operator mode");
  });

  it("renders Theatre as a top-level focus control when available", () => {
    const markup = renderToStaticMarkup(
      <CinemaFocusModeToolbar mode="read" onModeChange={() => null} onTheatreMode={() => null} />,
    );

    expect(markup).toContain('data-testid="ui-action-cinema-theatre"');
    expect(markup).toContain("Open Cinema Theatre");
    expect(markup).toContain(">Theatre<");
  });

  it("groups Cinema More actions by useful information architecture", () => {
    const grouped = cinemaMoreActionsBySection(CINEMA_MORE_ACTIONS);

    for (const section of CINEMA_MORE_SECTIONS) {
      expect(grouped[section.id].length).toBeGreaterThan(0);
    }
    expect(CINEMA_MORE_SECTIONS.map((section) => section.id)).toEqual([
      "display",
      "theatre",
      "advanced",
      "diagnostics",
      "help-shortcuts",
    ]);
    expect(CINEMA_MORE_REQUIRED_SECTION_IDS).toEqual(
      CINEMA_MORE_SECTIONS.map((section) => section.id),
    );
    expect(grouped.display.every((action) => action.owner === "cinema-display")).toBe(true);
    expect(grouped.theatre.every((action) => action.owner === "cinema-theatre")).toBe(true);
    expect(grouped.advanced.every((action) => action.owner === "cinema-advanced")).toBe(true);
    expect(grouped.diagnostics.every((action) => action.owner === "cinema-diagnostics")).toBe(true);
    expect(grouped["help-shortcuts"].every((action) => action.owner === "cinema-help")).toBe(true);
    expect(grouped.diagnostics.map((action) => action.id)).toContain("alignment-repair");
    expect(grouped["help-shortcuts"].every((action) => action.shortcutHint)).toBe(true);
    expect(CINEMA_MORE_ACTIONS.map((action) => action.id)).not.toContain("compact-transport");
    expect(CINEMA_MORE_ACTIONS.length).toBeLessThanOrEqual(
      CINEMA_MORE_ACTION_BUDGETS.BookCinema.max,
    );
    expect(CINEMA_MORE_ACTIONS.length).toBeGreaterThanOrEqual(
      CINEMA_MORE_ACTION_BUDGETS.BookCinema.min,
    );
    expect(activeCinemaMoreAction({ activePanelId: "diagnostics", mode: "debug" })?.label).toBe(
      "Diagnostics",
    );
  });
});

describe("CinemaTheatreChrome", () => {
  it("keeps fullscreen out of hidden controls while surfacing degraded runtime state", () => {
    const hiddenMarkup = renderToStaticMarkup(
      <CinemaTheatreChrome
        activePassage="Current passage"
        controlsVisible={false}
        fullscreenActive={false}
        fullscreenAvailability={{ reason: null, supported: true }}
        highContrast={false}
        playbackState="degraded"
        progress={{ currentLabel: "0:10", durationLabel: "1:00", ratio: 0.2 }}
        rendererLifecycle="ready"
        scopeLabel="Full source"
        sourceLabel="Demo book"
        surfaceName="Book Cinema"
        onExit={() => null}
        onRequestFullscreen={() => null}
        onToggleControls={() => null}
      />,
    );
    const visibleMarkup = renderToStaticMarkup(
      <CinemaTheatreChrome
        activePassage="Current passage"
        controlsVisible
        fullscreenActive={false}
        fullscreenAvailability={{ reason: null, supported: true }}
        highContrast={false}
        playbackState="playable"
        progress={{ currentLabel: "0:10", durationLabel: "1:00", ratio: 0.2 }}
        rendererLifecycle="ready"
        scopeLabel="Full source"
        sourceLabel="Demo book"
        surfaceName="Book Cinema"
        onExit={() => null}
        onRequestFullscreen={() => null}
        onToggleControls={() => null}
      />,
    );

    expect(hiddenMarkup).toContain('data-theatre-runtime-mode="reading-only"');
    expect(hiddenMarkup).toContain('data-theatre-availability-state="generation-failed"');
    expect(hiddenMarkup).toContain("Generation failed");
    expect(hiddenMarkup).toContain("Exit Theatre");
    expect(hiddenMarkup).not.toContain("Native fullscreen");
    expect(visibleMarkup).toContain('data-focused-theatre-action-group="environment"');
    expect(visibleMarkup).toContain("Native fullscreen");
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

  it("keeps temporary action tabs stable when the mobile sheet has more than four panels", () => {
    const markup = renderToStaticMarkup(
      <CinemaMobileSheet
        activePanelId="keep"
        id="cinema-more-sheet"
        label="Cinema more controls"
        panels={[
          { children: <p>Keep body</p>, id: "keep", label: "Keep" },
          { children: <p>Discard body</p>, id: "discard", label: "Discard" },
          { children: <p>Source body</p>, id: "source", label: "Source" },
          { children: <p>Structure body</p>, id: "structure", label: "Structure" },
          { children: <p>Narration body</p>, id: "narration", label: "Narration" },
        ]}
        onPanelChange={() => null}
      />,
    );

    expect(markup).toContain("auto-cols-[minmax(6rem,1fr)]");
    expect(markup).toContain(">Keep<");
    expect(markup).toContain(">Discard<");
    expect(markup).toContain(">Source<");
    expect(markup).toContain(">Structure<");
    expect(markup).toContain(">Narration<");
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
    displayControls: <span>Display panel</span>,
    playbackRate: {
      disabled: false,
      value: 1,
      onChange: () => null,
    },
    playbackState: "playing",
    primary: {
      className: "bg-[var(--vs-action-primary-hover)] text-[var(--vs-action-primary-text)]",
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
