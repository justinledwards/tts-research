import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats milliseconds as seconds", () => {
    expect(formatDuration(1234)).toBe("1.2s");
  });

  it("handles invalid durations", () => {
    expect(formatDuration(Number.NaN)).toBe("0.0s");
  });
});
