import { describe, expect, it } from "vitest";
import type { PlaybackProgress } from "../../types";
import {
  playbackProgressForBookmark,
  readerBookmarksFromProgress,
  readerOutlineFromBookScopes,
  readerRecentPositionsFromProgress,
} from "./model";

describe("reader navigation model", () => {
  it("sorts recent positions by update time and hides hidden rows", () => {
    const progress = [
      playbackProgress({ targetId: "old", updatedAt: "2026-05-19T09:00:00Z" }),
      playbackProgress({
        targetId: "hidden",
        hidden: true,
        updatedAt: "2026-05-19T12:00:00Z",
      }),
      playbackProgress({
        preparedSourceId: "source-1",
        targetId: "prepared:source-1",
        updatedAt: "2026-05-19T11:00:00Z",
      }),
    ];

    expect(
      readerRecentPositionsFromProgress(progress, {
        preparedSources: new Map([["source-1", "Prepared article"]]),
      }).map((item) => [item.id, item.label]),
    ).toEqual([
      ["prepared:source-1", "Prepared article"],
      ["old", "Book chapter"],
    ]);
  });

  it("keeps the latest recent position per reader target", () => {
    const progress = [
      playbackProgress({
        currentTimeSec: 10,
        targetId: "book:book-1:chapter:1",
        updatedAt: "2026-05-19T09:00:00Z",
      }),
      playbackProgress({
        currentTimeSec: 80,
        progress: 0.75,
        targetId: "book:book-1:chapter:1",
        updatedAt: "2026-05-19T11:00:00Z",
      }),
      playbackProgress({
        currentTimeSec: 40,
        targetId: "book:book-1:chapter:2",
        updatedAt: "2026-05-19T10:00:00Z",
      }),
    ];

    expect(
      readerRecentPositionsFromProgress(progress).map((item) => [
        item.id,
        item.currentTimeSec,
        item.progress,
      ]),
    ).toEqual([
      ["book:book-1:chapter:1", 80, 0.75],
      ["book:book-1:chapter:2", 40, 0.25],
    ]);
  });

  it("derives bookmark rows and resume targets from saved progress", () => {
    const progress = playbackProgress({
      activeWordIndex: 3,
      bookmarks: [
        {
          activeWordIndex: 8,
          createdAt: "2026-05-19T12:00:00Z",
          currentTimeSec: 42,
          id: "bookmark-1",
          label: "Meaningful point",
          readingPosition: {
            activeWordIndex: 8,
            bookSourceId: "book-1",
            scopeKey: "chapter:1",
          },
        },
      ],
      currentTimeSec: 10,
    });

    const bookmarks = readerBookmarksFromProgress(progress);
    expect(bookmarks[0]?.label).toBe("Meaningful point");
    expect(bookmarks[0]?.detail).toBe("Scope chapter:1");

    const bookmark = bookmarks.at(0);
    if (bookmark === undefined) {
      throw new Error("expected bookmark fixture to create one bookmark");
    }
    const resume = playbackProgressForBookmark(progress, bookmark);
    expect(resume.currentTimeSec).toBe(42);
    expect(resume.activeWordIndex).toBe(8);
    expect(resume.readingPosition?.scopeKey).toBe("chapter:1");
  });

  it("maps book scopes into active outline rows", () => {
    const outline = readerOutlineFromBookScopes(
      [
        {
          key: "book",
          label: "Full book",
          scope: { type: "book" as const, label: "Full book" },
          wordCount: 100,
        },
        {
          key: "chapter:2",
          label: "Chapter Two",
          scope: { type: "chapter" as const, chapterIndex: 2, label: "Chapter Two" },
          wordCount: 20,
        },
      ],
      "chapter:2",
    );

    expect(outline.map((item) => [item.id, item.isActive, item.detail])).toEqual([
      ["book", false, "100 words"],
      ["chapter:2", true, "20 words"],
    ]);
  });
});

function playbackProgress(overrides: Partial<PlaybackProgress> = {}): PlaybackProgress {
  return {
    activeWordIndex: 1,
    bookScope: { type: "chapter", chapterIndex: 1, label: "Book chapter" },
    bookSourceId: "book-1",
    createdAt: "2026-05-19T08:00:00Z",
    currentTimeSec: 4,
    finished: false,
    hidden: false,
    progress: 0.25,
    projectId: "default",
    readingPosition: {
      activeWordIndex: 1,
      bookSourceId: "book-1",
      scopeKey: "chapter:1",
    },
    targetId: "book:book-1:chapter:1",
    updatedAt: "2026-05-19T10:00:00Z",
    ...overrides,
  };
}
