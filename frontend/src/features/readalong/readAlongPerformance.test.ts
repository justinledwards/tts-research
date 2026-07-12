import { describe, expect, it } from "vitest";
import {
  formatReadAlongPerformanceReport,
  markReadAlongPerformance,
  readAlongPerformanceSnapshot,
  resetReadAlongPerformanceSnapshot,
} from "./readAlongPerformance";

describe("read-along performance snapshots", () => {
  it("records scenario metadata and derives counter rates", () => {
    const snapshot = resetReadAlongPerformanceSnapshot({
      scenarioId: "teleprompter-smooth-60s",
      surface: "teleprompter",
    });
    snapshot.startedAtMs -= 2000;

    markReadAlongPerformance("react-cursor-commit");
    markReadAlongPerformance("react-cursor-commit");
    markReadAlongPerformance("dom-highlight-swap");

    const current = readAlongPerformanceSnapshot();

    expect(current.scenarioId).toBe("teleprompter-smooth-60s");
    expect(current.surface).toBe("teleprompter");
    expect(current.elapsedMs).toBeGreaterThanOrEqual(2000);
    expect(current.ratesPerSecond["react-cursor-commit"]).toBeGreaterThan(0);
    expect(current.ratesPerSecond["dom-highlight-swap"]).toBeGreaterThan(0);
  });

  it("formats advisory reports with counters and long tasks", () => {
    const snapshot = resetReadAlongPerformanceSnapshot({
      scenarioId: "markdown-render-smooth-60s",
      surface: "markdown-render",
    });
    snapshot.elapsedMs = 60_000;
    snapshot.longTasks.push({ durationMs: 72.44, name: "self", startTimeMs: 1200.2 });

    const report = formatReadAlongPerformanceReport(snapshot);

    expect(report).toContain("Scenario: markdown-render-smooth-60s");
    expect(report).toContain("Surface: markdown-render");
    expect(report).toContain("Long tasks >50ms: 1");
    expect(report).toContain("| dom-highlight-swap |");
    expect(report).toContain("72.44ms");
  });
});
