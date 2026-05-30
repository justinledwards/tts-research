import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LocalizedPlaybackToolbar, localizedPlaybackStageLabel } from "./LocalizedPlaybackToolbar";

describe("LocalizedPlaybackToolbar", () => {
  it("renders one primary local playback surface with disabled reasons", () => {
    const markup = renderToStaticMarkup(
      <LocalizedPlaybackToolbar
        model={{
          activeDetail: "Block 2 of 5",
          activeLabel: "Selected cue",
          jumpToAudio: {
            disabled: true,
            disabledReason: "Audio timing is not available for this cue.",
            label: "Jump to Audio",
            onClick: () => null,
            testId: "jump",
          },
          playPause: {
            dataAttributes: { "data-playback-primary": "true" },
            disabled: true,
            disabledReason: "Generated audio is missing. Create & Listen before playback.",
            label: "Play",
            primary: true,
            onClick: () => null,
            testId: "play",
          },
          progress: { currentLabel: "0:02", durationLabel: "0:10", ratio: 0.2 },
          stage: "review",
          statusLabel: "Audio not generated",
        }}
      />,
    );

    expect(markup).toContain('data-localized-playback-toolbar="review"');
    expect(markup).toContain('data-playback-primary="true"');
    expect(markup).toContain("Generated audio is missing");
    expect(markup).toContain("Audio timing is not available");
  });

  it("uses high-contrast styling for theatre variants", () => {
    const markup = renderToStaticMarkup(
      <LocalizedPlaybackToolbar
        model={{
          activeLabel: "Theatre cue",
          playPause: { label: "Pause", primary: true, onClick: () => null },
          progress: { ratio: 0.5, waveformBars: [0.2, 0.9, 0.4] },
          stage: "theatre",
          variant: "theatre",
        }}
      />,
    );

    expect(markup).toContain("Theatre cue");
    expect(markup).toContain("bg-white/5");
    expect(localizedPlaybackStageLabel("cinema-theatre")).toBe("Cinema Theatre");
  });
});
