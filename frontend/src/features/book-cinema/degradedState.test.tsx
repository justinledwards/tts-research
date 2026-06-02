import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BookSource, VoiceJob } from "../../types";
import {
  BookCinemaReaderNoticeList,
  BookCinemaStatusChip,
  BookCinemaTimingStatusChip,
  bookTransportStateDetail,
  bookTransportStateTitle,
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
    expect(statusMarkup).toContain("Audio missing");
  });

  it("maps explicit user cancellation to rebuild-oriented footer copy", () => {
    const job = {
      id: "job-cancelled",
      status: "cancelled",
      terminalReason: "user_cancelled",
    } as VoiceJob;

    expect(bookTransportStateTitle("degraded", job)).toBe("Generation cancelled");
    expect(
      bookTransportStateDetail({
        activeBookJob: job,
        createAudioScope: { type: "book" },
        playbackState: "degraded",
        scopeContent: null,
      }),
    ).toContain("cancelled by request");
    expect(
      renderToStaticMarkup(
        <BookCinemaStatusChip hasPlayableAudio={false} isPlaying={false} job={job} />,
      ),
    ).toContain("Cancelled");
  });

  it("maps provider failures to retry-oriented footer copy", () => {
    const job = {
      error: "Provider timed out",
      id: "job-failed",
      retriable: true,
      status: "failed",
      terminalReason: "provider_failed",
    } as VoiceJob;

    expect(bookTransportStateTitle("degraded", job)).toBe("Generation failed");
    expect(
      bookTransportStateDetail({
        activeBookJob: job,
        createAudioScope: { type: "book" },
        playbackState: "degraded",
        scopeContent: null,
      }),
    ).toBe("Provider timed out");
    expect(
      renderToStaticMarkup(
        <BookCinemaStatusChip hasPlayableAudio={false} isPlaying={false} job={job} />,
      ),
    ).toContain("Generation failed");
  });

  it("maps provider timeouts to timeout-specific retry copy", () => {
    const job = {
      error: "Kokoro synthesis timed out after 3600 seconds",
      id: "job-timeout",
      retriable: true,
      status: "failed",
      terminalReason: "provider_timeout",
    } as VoiceJob;

    expect(bookTransportStateTitle("degraded", job)).toBe("Generation failed");
    expect(
      bookTransportStateDetail({
        activeBookJob: job,
        createAudioScope: { type: "book" },
        playbackState: "degraded",
        scopeContent: null,
      }),
    ).toContain("timed out");
    expect(
      renderToStaticMarkup(
        <BookCinemaStatusChip hasPlayableAudio={false} isPlaying={false} job={job} />,
      ),
    ).toContain("Generation failed");
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
