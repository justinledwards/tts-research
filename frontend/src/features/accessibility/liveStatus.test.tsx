import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LiveStatusRegions,
  liveStatusMessages,
  shouldSuppressLiveStatusAnnouncement,
  type LiveStatusRecord,
} from "./liveStatus";

describe("live status accessibility", () => {
  it("renders polite and assertive live regions with atomic status semantics", () => {
    const markup = renderToStaticMarkup(
      <LiveStatusRegions
        assertiveMessage="Generation failed."
        politeMessage="Audio generation started."
      />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain('aria-atomic="true"');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain("Audio generation started.");
    expect(markup).toContain("Generation failed.");
  });

  it("names the key async reader and generation updates without word-level playback chatter", () => {
    const messages = [
      liveStatusMessages.audioGenerationStarted(),
      liveStatusMessages.audioGenerationCompleted(),
      liveStatusMessages.audioGenerationFailed(),
      liveStatusMessages.sourceExtractionCompleted(),
      liveStatusMessages.syncDegraded("Book Cinema", "Phrase fallback is active."),
      liveStatusMessages.syncRestored("Book Cinema"),
      liveStatusMessages.telepromptTheatreEntered(),
      liveStatusMessages.telepromptTheatreExited(),
      liveStatusMessages.cueChanged("3 of 7"),
      liveStatusMessages.bookmarkSaved(),
      liveStatusMessages.settingsReset("Reader"),
    ];

    expect(messages).toContain("Audio generation started.");
    expect(messages).toContain("Read-along sync restored in Book Cinema.");
    expect(messages).toContain("Cue changed to 3 of 7.");
    expect(messages.some((message) => /\bword\b/i.test(message))).toBe(false);
  });

  it("suppresses duplicate announcements inside the dedupe window", () => {
    const previous: LiveStatusRecord = {
      message: "Audio generation started.",
      priority: "polite",
      timestampMs: 1000,
    };

    expect(
      shouldSuppressLiveStatusAnnouncement(previous, {
        message: "Audio generation started.",
        priority: "polite",
        timestampMs: 1500,
      }),
    ).toBe(true);
    expect(
      shouldSuppressLiveStatusAnnouncement(previous, {
        message: "Generation failed.",
        priority: "assertive",
        timestampMs: 1500,
      }),
    ).toBe(false);
    expect(
      shouldSuppressLiveStatusAnnouncement(previous, {
        message: "Audio generation started.",
        priority: "polite",
        timestampMs: 3000,
      }),
    ).toBe(false);
  });
});
