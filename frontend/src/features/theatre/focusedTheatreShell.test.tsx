import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FocusedTheatreChrome } from "./FocusedTheatreShell";

describe("focused theatre shell", () => {
  it("keeps progress and escape visible while secondary controls are hidden", () => {
    const markup = renderToStaticMarkup(
      createElement(FocusedTheatreChrome, {
        activeLabel: "Cue 2",
        activeText: "This detail appears only when controls are visible.",
        controlsVisible: false,
        persistentAction: {
          label: "Exit Theatre",
          testId: "ui-action-exit-focused-theatre",
          onClick: vi.fn(),
        },
        progress: {
          currentLabel: "42%",
          durationLabel: "1:18 remaining",
          ratio: 0.42,
        },
        sourceLabel: "Demo Source",
        statusLabel: "Playback ready",
        surfaceLabel: "Theatre",
        onToggleControls: vi.fn(),
      }),
    );

    expect(markup).toContain('data-focused-theatre-controls="hidden"');
    expect(markup).toContain("42%");
    expect(markup).toContain("Exit Theatre");
    expect(markup).not.toContain("This detail appears only when controls are visible.");
  });

  it("renders exit actions and current text when controls are visible", () => {
    const markup = renderToStaticMarkup(
      createElement(FocusedTheatreChrome, {
        actions: [
          {
            label: "Back to Review",
            testId: "ui-action-back-review",
            onClick: vi.fn(),
          },
        ],
        activeLabel: "Cue 2",
        activeText: "Current cue text is readable.",
        controlsVisible: true,
        persistentAction: {
          label: "Exit Theatre",
          testId: "ui-action-exit-focused-theatre",
          onClick: vi.fn(),
        },
        progress: {
          currentLabel: "42%",
          durationLabel: "1:18 remaining",
          ratio: 0.42,
        },
        sourceLabel: "Demo Source",
        statusLabel: "Playback ready",
        surfaceLabel: "Theatre",
        onToggleControls: vi.fn(),
      }),
    );

    expect(markup).toContain('data-focused-theatre-controls="visible"');
    expect(markup).toContain("Current cue text is readable.");
    expect(markup).toContain("Back to Review");
  });
});
