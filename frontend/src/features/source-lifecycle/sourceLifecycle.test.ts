import { describe, expect, it } from "vitest";
import type { BookSource, PreparedSource, VoiceJob } from "../../types";
import {
  ARTIFACT_COMPATIBILITY_UI_LABELS,
  SOURCE_LIFECYCLE_STATES,
  artifactCompatibilityUiLabel,
  bookSourceLifecycleEnvelope,
  generatedAudioIsStale,
  preparedSourceLifecycleEnvelope,
  sourceSelectionContinuitySummary,
  sourceSelectorOption,
} from "./index";

describe("canonical source lifecycle", () => {
  it("keeps the reviewed lifecycle vocabulary explicit", () => {
    expect(SOURCE_LIFECYCLE_STATES).toEqual([
      "new",
      "imported",
      "extracting",
      "extracted",
      "prepared",
      "reviewable",
      "previewable",
      "narratable",
      "generating",
      "audioReady",
      "stale",
      "failed",
      "archived",
    ]);
  });

  it("keeps artifact compatibility UI labels explicit", () => {
    expect(ARTIFACT_COMPATIBILITY_UI_LABELS).toEqual({
      alignmentMissing: "Alignment missing",
      audioReady: "Audio ready",
      audioStale: "Audio stale",
      highlightStale: "Highlight stale",
      regenerateRequired: "Regenerate required",
    });
    expect(artifactCompatibilityUiLabel("audioReady")).toBe("Audio ready");
    expect(artifactCompatibilityUiLabel("highlightStale")).toBe("Highlight stale");
    expect(artifactCompatibilityUiLabel("alignmentMissing")).toBe("Alignment missing");
    expect(artifactCompatibilityUiLabel("regenerateRequired")).toBe("Regenerate required");
  });

  it("builds one identity envelope for prepared Website Cinema sources", () => {
    const envelope = preparedSourceLifecycleEnvelope({
      ...preparedSourceFixture,
      kind: "url",
      sourceSpeechPolicyProfile: "Accessibility",
      sourceUrl: "https://example.test/article",
    });

    expect(envelope).toMatchObject({
      adapterKind: "url",
      canonicalState: "narratable",
      extractionState: "extracted",
      generatedAudioState: "missing",
      policyScope: "source",
      selectedScope: "Full source",
      sourceKind: "website",
      title: "Example article",
    });
    expect(sourceSelectorOption(envelope, "prepared").optionLabel).toContain("Example article");
    expect(sourceSelectorOption(envelope, "prepared").optionLabel).toContain("Narratable");
  });

  it("marks generated audio stale when the source changed after the run", () => {
    const envelope = preparedSourceLifecycleEnvelope(
      {
        ...preparedSourceFixture,
        updatedAt: "2026-05-21T11:00:00Z",
      },
      { job: completedPreparedJob },
    );

    expect(
      generatedAudioIsStale({
        audioUpdatedAt: completedPreparedJob.completedAt,
        sourceUpdatedAt: "2026-05-21T11:00:00Z",
      }),
    ).toBe(true);
    expect(envelope.generatedAudioState).toBe("stale");
    expect(envelope.canonicalState).toBe("stale");
  });

  it("keeps book scope, policy, audio, and active block visible on source switches", () => {
    const envelope = bookSourceLifecycleEnvelope(bookSourceFixture, {
      activeBlockId: "chapter-1",
      job: completedBookJob,
      selectedScope: { chapterIndex: 1, type: "chapter" },
    });

    expect(envelope).toMatchObject({
      activeBlockId: "chapter-1",
      canonicalState: "audioReady",
      generatedAudioState: "ready",
      policyScope: "project",
      selectedScope: "Chapter 1",
    });
    expect(
      sourceSelectionContinuitySummary(
        {
          activeBlockId: "chapter-1",
          generatedAudioState: "ready",
          policyScope: "project",
          selectedScope: "Chapter 1",
          sourceId: "book-1",
        },
        {
          activeBlockId: "chapter-2",
          generatedAudioState: "stale",
          policyScope: "source",
          selectedScope: "Chapter 2",
          sourceId: "book-2",
        },
      ),
    ).toContain("Selection changed Scope: Chapter 2; Policy: Source policy");
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
  chapters: [
    {
      index: 1,
      isNarratable: true,
      title: "One",
      wordCount: 600,
    },
  ],
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

const completedPreparedJob: VoiceJob = {
  audioReadySegments: 1,
  audioUrl: "/audio.wav",
  completedAt: "2026-05-21T10:00:00Z",
  contentType: "audio/wav",
  createdAt: "2026-05-21T10:00:00Z",
  durationMs: 1000,
  id: "job-prepared",
  inputText: "Hello",
  optimizedText: "Hello",
  optimizer: "test",
  preparedSourceId: "prepared-1",
  progress: { activeStage: "completed", detail: "", message: "done" },
  projectId: "project-1",
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
};

const completedBookJob: VoiceJob = {
  ...completedPreparedJob,
  bookSourceId: "book-1",
  bookScope: { chapterIndex: 1, type: "chapter" },
  completedAt: "2026-05-22T10:00:00Z",
  id: "job-book",
  preparedSourceId: undefined,
  updatedAt: "2026-05-22T10:00:00Z",
};
