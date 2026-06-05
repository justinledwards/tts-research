import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("styles.css", import.meta.url), "utf8");

describe("global reading surface styles", () => {
  it("keeps active theatre highlights safe across wrapped rows", () => {
    expect(styles).toMatch(
      /\.teleprompter-word--active,[\s\S]*?\.readalong-word-role--active,[\s\S]*?box-decoration-break: clone;/,
    );
    expect(styles).toContain(".reading-surface--theatre .teleprompter-word--active");
    expect(styles).toContain(".reading-surface--theatre .readalong-word-role--active");
    expect(styles).not.toContain("0 0 0 0.22em #fff24a");
  });

  it("keeps smooth cursor animation compositor-friendly", () => {
    expect(styles).toContain("[data-readalong-motion-cursor]");
    expect(styles).toContain("transition-property: transform, opacity;");
    expect(styles).toContain("will-change: transform, opacity;");
    expect(styles).toContain('[data-reader-motion="reduced"] [data-readalong-motion-cursor]');
  });
});
