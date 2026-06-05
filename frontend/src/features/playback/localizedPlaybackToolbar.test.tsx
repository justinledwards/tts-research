import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LocalizedPlaybackToolbar,
  localizedPlaybackSeekSecondsForKey,
  localizedPlaybackSeekSecondsFromPointer,
  localizedPlaybackStageLabel,
} from "./LocalizedPlaybackToolbar";

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
    expect(markup).toContain(
      'data-testid="localized-playback-toolbar-review-disabled-reasons">Unavailable: Generated audio is missing',
    );
    expect(markup).not.toContain("Unavailable: Generated audio is missing. Audio timing");
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
    expect(markup).toContain("bg-[var(--vs-theatre-panel)]");
    expect(localizedPlaybackStageLabel("cinema-theatre")).toBe("Cinema Theatre");
  });

  it("renders seekable waveform progress with cue markers", () => {
    const markup = renderToStaticMarkup(
      <LocalizedPlaybackToolbar
        model={{
          activeLabel: "Selected cue",
          playPause: { label: "Play", primary: true, onClick: () => null },
          progress: {
            currentLabel: "0:30",
            durationLabel: "1:00",
            markers: [
              { id: "cue-1", label: "Cue 1", ratio: 0, active: true },
              { id: "cue-2", label: "Cue 2", ratio: 0.5 },
            ],
            ratio: 0.5,
            seek: {
              currentSec: 30,
              durationSec: 60,
              onSeekSeconds: () => null,
            },
            waveformBars: [0.2, 0.9, 0.4],
          },
          stage: "teleprompt",
        }}
      />,
    );

    expect(markup).toContain('role="slider"');
    expect(markup).toContain('aria-valuemax="60"');
    expect(markup).toContain('aria-valuenow="30"');
    expect(markup.match(/localized-playback-cue-marker/g)).toHaveLength(2);
    expect(markup).toContain('data-active="true"');
  });

  it("maps pointer and keyboard timeline seeking to clamped seconds", () => {
    expect(localizedPlaybackSeekSecondsFromPointer(150, 100, 200, 60)).toBe(15);
    expect(localizedPlaybackSeekSecondsFromPointer(20, 100, 200, 60)).toBe(0);
    expect(localizedPlaybackSeekSecondsFromPointer(400, 100, 200, 60)).toBe(60);
    expect(localizedPlaybackSeekSecondsForKey("Home", 22, 60)).toBe(0);
    expect(localizedPlaybackSeekSecondsForKey("End", 22, 60)).toBe(60);
    expect(localizedPlaybackSeekSecondsForKey("ArrowRight", 58, 60)).toBe(60);
    expect(localizedPlaybackSeekSecondsForKey("ArrowLeft", 3, 60)).toBe(0);
    expect(localizedPlaybackSeekSecondsForKey("PageUp", 20, 60)).toBe(50);
    expect(localizedPlaybackSeekSecondsForKey("Tab", 20, 60)).toBeNull();
  });
});
