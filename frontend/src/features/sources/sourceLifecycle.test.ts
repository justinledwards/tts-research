import { describe, expect, it } from "vitest";
import type { BookSource, PreparedSource, VoiceJob } from "../../types";
import {
  bookSourceLifecycleModel,
  preparedSourceLifecycleModel,
  sourceLifecycleModelsFromSources,
} from "./sourceLifecycle";

describe("source lifecycle model", () => {
  it("maps prepared sources to one narratable lifecycle card model", () => {
    const model = preparedSourceLifecycleModel({
      ...preparedSourceFixture,
      kind: "url",
      sourceSpeechPolicyProfile: "Accessibility",
      sourceUrl: "https://example.test/article",
    });

    expect(model).toMatchObject({
      appliesToCopy: "Applies to this website source: Example article.",
      extractionState: "Extraction ready",
      hasPolicyPin: true,
      lifecycleState: "narratable",
      narratableScopeCount: 4,
      owner: "prepared",
      policyPinLabel: "Policy pinned",
      routeState: {
        canCinema: true,
        canPreview: true,
        canReview: true,
      },
      type: "website",
    });
  });

  it("maps book formats and disabled reasons without duplicate import state", () => {
    const failed = bookSourceLifecycleModel({
      ...bookSourceFixture,
      error: "OCR failed",
      status: "failed",
    });

    expect(failed.lifecycleState).toBe("failed");
    expect(failed.type).toBe("pdf");
    expect(failed.routeState.reviewDisabledReason).toBe("OCR failed");
    expect(failed.enabledDisabledReason).toBe("OCR failed");
  });

  it("gates routes on source readiness before Review opens", () => {
    const model = preparedSourceLifecycleModel({
      ...preparedSourceFixture,
      sourceReadiness: {
        detail: "Confirm title, source type, language, and structure before Review opens.",
        state: "needsMetadata",
        title: "Example article",
      },
    });

    expect(model.routeState).toMatchObject({
      canCinema: false,
      canPreview: false,
      canReview: false,
      reviewDisabledReason:
        "Needs metadata: Confirm title, source type, language, and structure before Review opens.",
    });
    expect(model.envelope.sourceReadiness.state).toBe("needsMetadata");
    expect(model.enabledDisabledReason).toBe(
      "Needs metadata: Confirm title, source type, language, and structure before Review opens.",
    );
  });

  it("sorts mixed source cards by recency and marks generated audio", () => {
    const job: VoiceJob = {
      audioReadySegments: 1,
      audioUrl: "/audio.wav",
      contentType: "audio/wav",
      createdAt: "2026-05-21T10:00:00Z",
      durationMs: 1000,
      id: "job-1",
      projectId: "project-1",
      optimizer: "test",
      progress: { activeStage: "completed", detail: "", message: "done" },
      provider: "mock",
      retries: {
        attempts: 1,
        currentSegment: 1,
        maxRetries: 0,
        segmentAttempts: 1,
        totalSegments: 1,
      },
      segments: [],
      stages: { checker: "done", optimization: "done", synthesis: "done" },
      status: "completed",
      inputText: "Hello",
      optimizedText: "Hello",
      updatedAt: "2026-05-21T10:00:00Z",
      voice: "default",
      voiceCheck: {
        complete: true,
        needsResume: false,
        provider: "mock",
        reason: "ok",
        similarity: 1,
        transcript: "Hello",
      },
      preparedSourceId: "prepared-1",
    };

    const models = sourceLifecycleModelsFromSources({
      activePreparedSourceId: "prepared-1",
      bookSources: [bookSourceFixture],
      jobs: [job],
      preparedSources: [preparedSourceFixture],
    });

    expect(models.map((model) => model.id)).toEqual(["book-1", "prepared-1"]);
    expect(models.find((model) => model.id === "prepared-1")).toMatchObject({
      activeStateLabel: "Active source",
      lifecycleState: "audioReady",
    });
  });
});

const preparedSourceFixture: PreparedSource = {
  blockCount: 5,
  createdAt: "2026-05-21T09:00:00Z",
  id: "prepared-1",
  kind: "file",
  projectId: "project-1",
  segmentCount: 7,
  sourceName: "example.md",
  speechPolicyProfile: "Enterprise",
  status: "ready",
  summary: {
    citationSkipCount: 0,
    headingCount: 1,
    sentenceSegmentCount: 7,
    skippedBlockCount: 1,
    spokenBlockCount: 4,
  },
  title: "Example article",
  updatedAt: "2026-05-21T09:00:00Z",
  wordCount: 320,
};

const bookSourceFixture: BookSource = {
  chapterCount: 2,
  createdAt: "2026-05-22T09:00:00Z",
  id: "book-1",
  kind: "pdf",
  pageCount: 12,
  projectId: "project-1",
  sourceBytes: 2048,
  sourceFile: "source.pdf",
  status: "ready",
  title: "PDF source",
  updatedAt: "2026-05-22T09:00:00Z",
  wordCount: 1200,
};
