import { describe, expect, it } from "vitest";
import type { BookScope, BookSource, PreparedSource, VoiceJob } from "../../types";
import {
  findRestorableWorkbenchJob,
  voiceJobMatchesWorkbenchSource,
} from "./workbenchAudioRestore";

const PROJECT_ID = "project-1";

describe("workbench audio restore", () => {
  it("picks the newest playable prepared-source job", () => {
    const source = preparedSource({ id: "source-1", updatedAt: "2026-06-04T10:00:00Z" });
    const olderJob = voiceJob({
      id: "job-old",
      completedAt: "2026-06-04T10:15:00Z",
      preparedSourceId: source.id,
    });
    const newerJob = voiceJob({
      id: "job-new",
      completedAt: "2026-06-04T10:45:00Z",
      preparedSourceId: source.id,
    });

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [olderJob, newerJob],
        source: { mode: "prepared", source },
      })?.id,
    ).toBe(newerJob.id);
  });

  it("restores a completed prepared-source job with complete partial audio", () => {
    const source = preparedSource({ id: "source-1", updatedAt: "2026-06-04T10:00:00Z" });
    const partialJob = voiceJob({
      audioPartialUrl: "/api/jobs/job/audio/partial",
      audioReadySegments: 2,
      audioUrl: "",
      completedAt: "2026-06-04T10:15:00Z",
      preparedSourceId: source.id,
      retries: {
        attempts: 2,
        currentSegment: 2,
        maxRetries: 2,
        segmentAttempts: 2,
        totalSegments: 2,
      },
      segments: [
        { index: 1, status: "ready", text: "Prepared " },
        { index: 2, status: "ready", text: "narration text" },
      ],
    });

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [partialJob],
        source: { mode: "prepared", source },
      })?.id,
    ).toBe(partialJob.id);
  });

  it("rejects non-playable, stale, wrong-source, and wrong-project prepared jobs", () => {
    const source = preparedSource({ id: "source-1", updatedAt: "2026-06-04T10:00:00Z" });

    const restoredJob = findRestorableWorkbenchJob({
      activeProjectId: PROJECT_ID,
      currentJob: null,
      jobs: [
        voiceJob({
          id: "wrong-source",
          completedAt: "2026-06-04T10:30:00Z",
          preparedSourceId: "source-2",
        }),
        voiceJob({
          id: "stale",
          completedAt: "2026-06-04T09:59:00Z",
          preparedSourceId: source.id,
        }),
        voiceJob({ id: "missing-audio", audioUrl: "", preparedSourceId: source.id }),
        voiceJob({ id: "failed", preparedSourceId: source.id, status: "failed" }),
        voiceJob({ id: "cancelled", preparedSourceId: source.id, status: "cancelled" }),
        voiceJob({ id: "wrong-project", preparedSourceId: source.id, projectId: "project-2" }),
      ],
      source: { mode: "prepared", source },
    });

    expect(restoredJob).toBeNull();
  });

  it("matches book jobs only for the exact active book scope", () => {
    const source = bookSource({ id: "book-1" });
    const scope: BookScope = { chapterIndex: 1, type: "chapter" };
    const exactJob = voiceJob({
      bookScope: scope,
      bookSourceId: source.id,
      completedAt: "2026-06-04T10:30:00Z",
      id: "book-exact",
    });

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [
          voiceJob({
            bookScope: { chapterIndex: 2, type: "chapter" },
            bookSourceId: source.id,
            completedAt: "2026-06-04T10:45:00Z",
            id: "other-scope",
          }),
          voiceJob({
            bookScope: scope,
            bookSourceId: "book-2",
            completedAt: "2026-06-04T10:45:00Z",
            id: "other-book",
          }),
          exactJob,
        ],
        source: { mode: "book", scope, source },
      })?.id,
    ).toBe(exactJob.id);

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [exactJob],
        source: { mode: "book", scope: null, source },
      }),
    ).toBeNull();
  });

  it("does not auto-attach draft text by guessing text matches", () => {
    const matchingJob = voiceJob({
      inputText: "A very specific draft paragraph.",
      optimizedText: "A very specific draft paragraph.",
    });

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [matchingJob],
        source: { mode: "draft", text: "A very specific draft paragraph." },
      }),
    ).toBeNull();
  });

  it("does not replace an active running job", () => {
    const source = preparedSource({ id: "source-1" });
    const runningJob = voiceJob({ id: "running", preparedSourceId: source.id, status: "queued" });
    const completedJob = voiceJob({
      id: "completed",
      completedAt: "2026-06-04T10:30:00Z",
      preparedSourceId: source.id,
    });

    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: runningJob,
        jobs: [completedJob],
        source: { mode: "prepared", source },
      }),
    ).toBeNull();
  });

  it("allows legacy prepared text matches only for jobs without source ids", () => {
    const source = preparedSource({
      id: "source-1",
      speechText: "Hello world",
      text: "Hello world",
    });
    const structuredWrongSource = voiceJob({
      completedAt: "2026-06-04T10:45:00Z",
      id: "structured-wrong-source",
      inputText: "Hello world",
      optimizedText: "Hello world",
      preparedSourceId: "source-2",
    });
    const legacyJob = voiceJob({
      completedAt: "2026-06-04T10:15:00Z",
      id: "legacy",
      inputText: " Hello\nworld ",
      optimizedText: " Hello\nworld ",
    });

    expect(
      voiceJobMatchesWorkbenchSource(structuredWrongSource, { mode: "prepared", source }),
    ).toBe(false);
    expect(
      findRestorableWorkbenchJob({
        activeProjectId: PROJECT_ID,
        currentJob: null,
        jobs: [structuredWrongSource, legacyJob],
        source: { mode: "prepared", source },
      })?.id,
    ).toBe(legacyJob.id);
  });
});

function voiceJob(overrides: Partial<VoiceJob> = {}): VoiceJob {
  return {
    audioUrl: "/api/jobs/job/audio",
    completedAt: "2026-06-04T10:00:00Z",
    id: "job-1",
    inputText: "Prepared narration text",
    optimizedText: "Prepared narration text",
    projectId: PROJECT_ID,
    status: "completed",
    updatedAt: "2026-06-04T10:00:00Z",
    ...overrides,
  } as VoiceJob;
}

function preparedSource(overrides: Partial<PreparedSource> = {}): PreparedSource {
  return {
    blockCount: 1,
    createdAt: "2026-06-04T09:00:00Z",
    id: "source-1",
    kind: "text",
    projectId: PROJECT_ID,
    segmentCount: 1,
    sourceName: "Prepared source",
    speechPolicyProfile: "default",
    speechText: "Prepared narration text",
    status: "ready",
    summary: { description: "Prepared source", title: "Prepared source" },
    text: "Prepared narration text",
    updatedAt: "2026-06-04T09:00:00Z",
    wordCount: 3,
    ...overrides,
  } as PreparedSource;
}

function bookSource(overrides: Partial<BookSource> = {}): BookSource {
  return {
    chapterCount: 2,
    createdAt: "2026-06-04T09:00:00Z",
    id: "book-1",
    kind: "text",
    pageCount: 10,
    projectId: PROJECT_ID,
    sourceBytes: 100,
    sourceFile: "book.md",
    status: "ready",
    text: "Book narration text",
    title: "Book source",
    updatedAt: "2026-06-04T09:00:00Z",
    wordCount: 100,
    ...overrides,
  } as BookSource;
}
