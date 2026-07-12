import { describe, expect, it } from "vitest";
import {
  READ_ALONG_DEFAULT_LOOKAHEAD_MS,
  READ_ALONG_DISPLAY_LOOKUP,
  resolveReadAlongTimingItem,
} from "./timingLookup";

const words = [
  { id: "first", startMs: 0, endMs: 500 },
  { id: "second", startMs: 500, endMs: 900 },
  { id: "third", startMs: 1200, endMs: 1500 },
];

describe("read-along timing lookup", () => {
  it("uses half-open token ranges so exact boundaries advance to the next word", () => {
    const result = resolveReadAlongTimingItem(words, 500);

    expect(result?.item.id).toBe("second");
    expect(result?.relation).toBe("current");
  });

  it("keeps the current word active instead of leading too early", () => {
    const result = resolveReadAlongTimingItem(words, 420, READ_ALONG_DISPLAY_LOOKUP);

    expect(READ_ALONG_DEFAULT_LOOKAHEAD_MS).toBe(80);
    expect(result?.item.id).toBe("first");
    expect(result?.relation).toBe("current");
    expect(result?.strictItem?.id).toBe("first");
  });

  it("holds the current or previous word when the next word is outside the lookahead window", () => {
    expect(resolveReadAlongTimingItem(words, 300, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe(
      "first",
    );
    expect(resolveReadAlongTimingItem(words, 1000, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe(
      "second",
    );
  });

  it("leads across token gaps only when the next word starts within the display window", () => {
    expect(resolveReadAlongTimingItem(words, 1130, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe(
      "third",
    );
    expect(resolveReadAlongTimingItem(words, 1000, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe(
      "second",
    );
  });

  it("handles first and last token edges without speculative jumps", () => {
    expect(resolveReadAlongTimingItem(words, 10, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe("first");
    expect(resolveReadAlongTimingItem(words, 1600, READ_ALONG_DISPLAY_LOOKUP)?.item.id).toBe(
      "third",
    );
    expect(resolveReadAlongTimingItem(words, 0, { mode: "strict" })?.item.id).toBe("first");
  });

  it("does not jump ahead while the actual current word is still active", () => {
    const denseWords = [
      { id: "first", startMs: 0, endMs: 1000 },
      { id: "second", startMs: 1040, endMs: 1120 },
      { id: "third", startMs: 1080, endMs: 1160 },
    ];

    const result = resolveReadAlongTimingItem(denseWords, 990, READ_ALONG_DISPLAY_LOOKUP);

    expect(result?.item.id).toBe("first");
    expect(result?.itemIndex).toBe(0);
  });
});
