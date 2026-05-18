import { describe, expect, it, vi } from "vitest";
import {
  defaultActivityFooterMode,
  nextActivityFooterMode,
  normalizeActivityFooterMode,
} from "./activityFooter";

describe("activity footer mode helpers", () => {
  it("normalizes stored footer mode values", () => {
    expect(normalizeActivityFooterMode("full")).toBe("full");
    expect(normalizeActivityFooterMode("compact")).toBe("compact");
    expect(normalizeActivityFooterMode("collapsed")).toBe("collapsed");
    expect(normalizeActivityFooterMode("tiny")).toBe("full");
    expect(normalizeActivityFooterMode(null)).toBe("full");
  });

  it("cycles through the three ergonomic footer states", () => {
    expect(nextActivityFooterMode("full")).toBe("compact");
    expect(nextActivityFooterMode("compact")).toBe("collapsed");
    expect(nextActivityFooterMode("collapsed")).toBe("full");
  });

  it("defaults mobile viewports to the compact footer", () => {
    const original = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
    expect(defaultActivityFooterMode()).toBe("compact");
    globalThis.matchMedia = original;
  });
});
