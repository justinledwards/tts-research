import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BookSource, VoiceJob } from "../../types";
import {
  BookCinemaReaderNoticeList,
  BookCinemaStatusChip,
  BookCinemaTimingStatusChip,
  resolveBookCinemaAudioNotice,
} from "./BookCinemaPanel";

describe("Book Cinema degraded-state UI", () => {
  it("renders audio readiness and fallback notices as visible copy", () => {
    const markup = renderToStaticMarkup(
      <BookCinemaReaderNoticeList
        audioNotice="Generated audio is present, but playback controls are still initializing."
        isResumeRestoring
        resumeFallbackNotice="Saved locator could not be mapped."
        timingConfidence={{
          detail: "Phrase highlighting is active.",
          isDegraded: true,
          label: "Phrase timing",
          status: "phrase",
        }}
      />,
    );

    expect(markup).toContain("Phrase timing");
    expect(markup).toContain("Audio not ready");
    expect(markup).toContain("Resume fallback");
    expect(markup).toContain("Restoring saved point");
  });

  it("keeps timing and status chips concise while exposing detail", () => {
    const timingMarkup = renderToStaticMarkup(
      <BookCinemaTimingStatusChip
        display={{
          detail: "Timing confidence is below the word-highlight threshold.",
          isDegraded: true,
          label: "Low confidence",
          status: "low-confidence",
        }}
      />,
    );
    const statusMarkup = renderToStaticMarkup(
      <BookCinemaStatusChip hasPlayableAudio={false} isPlaying={false} job={null} />,
    );

    expect(timingMarkup).toContain("Low confidence");
    expect(timingMarkup).toContain("Timing confidence is below");
    expect(statusMarkup).toContain("Reader ready");
  });

  it("explains generated audio that is not playable yet", () => {
    const notice = resolveBookCinemaAudioNotice({
      activeBookJob: {
        audioUrl: "/api/voice-jobs/job-1/audio",
        id: "job-1",
        status: "completed",
      } as VoiceJob,
      book: { kind: "epub" } as BookSource,
      hasPlayableAudio: false,
      isProcessing: false,
    });

    expect(notice).toContain("playback controls are still initializing");
  });
});
