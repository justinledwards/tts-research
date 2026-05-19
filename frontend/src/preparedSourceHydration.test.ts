import { describe, expect, it } from "vitest";
import {
  isPreparedSourceDisplayIncomplete,
  mergePreparedSourcesPreservingFullContent,
} from "./App";
import type { PreparedSource } from "./types";

describe("prepared source hydration helpers", () => {
  it("marks markdown summary rows as incomplete", () => {
    expect(
      isPreparedSourceDisplayIncomplete(
        preparedSource({
          id: "markdown-summary",
          renderMode: "markdown",
          text: "",
          speechText: "",
        }),
      ),
    ).toBe(true);
  });

  it("marks non-markdown summary rows as incomplete", () => {
    expect(
      isPreparedSourceDisplayIncomplete(
        preparedSource({
          id: "text-summary",
          renderMode: "plain",
          text: "",
          speechText: "",
        }),
      ),
    ).toBe(true);
  });

  it("keeps full prepared source rows as complete", () => {
    expect(
      isPreparedSourceDisplayIncomplete(
        preparedSource({
          id: "full-source",
          renderMode: "plain",
          text: "full source content",
          speechText: "full spoken source content",
        }),
      ),
    ).toBe(false);
  });

  it("preserves a full in-memory source when merge receives a summary row with same timestamp", () => {
    const cachedSource = preparedSource({
      id: "same-time",
      updatedAt: "2026-01-01T00:00:00.000Z",
      renderMode: "plain",
      text: "full",
      speechText: "full speech",
    });
    const refreshedSummary = preparedSource({
      id: "same-time",
      updatedAt: "2026-01-01T00:00:00.000Z",
      renderMode: "plain",
      text: "",
      speechText: "",
    });

    const merged = mergePreparedSourcesPreservingFullContent([cachedSource], [refreshedSummary]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(cachedSource);
  });

  it("replaces an in-memory source when summary has a new timestamp", () => {
    const cachedSource = preparedSource({
      id: "new-time",
      updatedAt: "2026-01-01T00:00:00.000Z",
      renderMode: "plain",
      text: "full",
      speechText: "full speech",
    });
    const refreshedSummary = preparedSource({
      id: "new-time",
      updatedAt: "2026-01-02T00:00:00.000Z",
      renderMode: "plain",
      text: "",
      speechText: "",
    });

    const merged = mergePreparedSourcesPreservingFullContent([cachedSource], [refreshedSummary]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toBe(refreshedSummary);
  });
});

function preparedSource(
  overrides: Partial<PreparedSource> & { renderMode: PreparedSource["renderMode"] },
): PreparedSource {
  return {
    status: "ready",
    speechPolicyProfile: "default",
    blockCount: 0,
    segmentCount: 0,
    id: "default-id",
    kind: "text",
    wordCount: 1,
    projectId: "project-id",
    sourceName: "source",
    summary: {
      citationSkipCount: 0,
      headingCount: 0,
      sentenceSegmentCount: 0,
      skippedBlockCount: 0,
      spokenBlockCount: 0,
    },
    sourceFormat: "plaintext",
    text: "full source content",
    speechText: "full speech text",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}
