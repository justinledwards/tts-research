export type ReadAlongPerformanceCounter =
  | "dom-anchor-cache-hit"
  | "dom-anchor-resolve"
  | "cursor-tick"
  | "dom-highlight-swap"
  | "motion-cursor-measure"
  | "motion-cursor-update"
  | "react-cursor-commit"
  | "scroll-call"
  | "word-resolve";

export interface ReadAlongPerformanceSnapshot {
  counters: Record<ReadAlongPerformanceCounter, number>;
  elapsedMs: number;
  longTaskCount: number;
  longTasks: ReadAlongLongTaskSummary[];
  ratesPerSecond: Record<ReadAlongPerformanceCounter, number>;
  scenarioId: string | null;
  startedAtMs: number;
  surface: ReadAlongPerformanceSurface | null;
}

export interface ReadAlongLongTaskSummary {
  durationMs: number;
  name: string;
  startTimeMs: number;
}

export interface ResetReadAlongPerformanceOptions {
  scenarioId?: string | null;
  surface?: ReadAlongPerformanceSurface | null;
}

export type ReadAlongPerformanceSurface =
  | "book-cinema"
  | "markdown-render"
  | "prepared-cinema"
  | "teleprompter";

const COUNTERS: ReadAlongPerformanceCounter[] = [
  "dom-anchor-cache-hit",
  "dom-anchor-resolve",
  "cursor-tick",
  "dom-highlight-swap",
  "motion-cursor-measure",
  "motion-cursor-update",
  "react-cursor-commit",
  "scroll-call",
  "word-resolve",
];

const globalReadAlongPerformance = globalThis as {
  __readAlongPerformance?: ReadAlongPerformanceSnapshot;
  __readAlongLongTaskObserver?: PerformanceObserver;
};

export function markReadAlongPerformance(counter: ReadAlongPerformanceCounter): void {
  const snapshot = readAlongPerformanceSnapshot();
  snapshot.counters[counter] += 1;
  updateReadAlongPerformanceElapsed(snapshot);
  if (!readAlongPerformanceEnabled()) {
    return;
  }
  try {
    performance.mark(`readalong:${counter}`);
  } catch {
    // User Timing is diagnostic-only; never let it affect playback.
  }
}

export function readAlongPerformanceSnapshot(): ReadAlongPerformanceSnapshot {
  globalReadAlongPerformance.__readAlongPerformance ??= createReadAlongPerformanceSnapshot({});
  updateReadAlongPerformanceElapsed(globalReadAlongPerformance.__readAlongPerformance);
  return globalReadAlongPerformance.__readAlongPerformance;
}

export function resetReadAlongPerformanceSnapshot(
  options: ResetReadAlongPerformanceOptions = {},
): ReadAlongPerformanceSnapshot {
  globalReadAlongPerformance.__readAlongPerformance = createReadAlongPerformanceSnapshot(options);
  return globalReadAlongPerformance.__readAlongPerformance;
}

export function formatReadAlongPerformanceReport(snapshot: ReadAlongPerformanceSnapshot): string {
  const current = normalizedReadAlongPerformanceSnapshot(snapshot);
  const lines = [
    "# Read-Along Performance",
    "",
    `Scenario: ${current.scenarioId ?? "unspecified"}`,
    `Surface: ${current.surface ?? "unspecified"}`,
    `Elapsed: ${formatMs(current.elapsedMs)}`,
    `Long tasks >50ms: ${String(current.longTasks.length)}`,
    "",
    "| Counter | Count | Rate/sec |",
    "| --- | ---: | ---: |",
  ];
  for (const counter of COUNTERS) {
    lines.push(
      `| ${counter} | ${String(current.counters[counter])} | ${formatRate(
        current.ratesPerSecond[counter],
      )} |`,
    );
  }
  lines.push("");
  if (current.longTasks.length > 0) {
    lines.push("## Long Tasks", "");
    for (const task of current.longTasks) {
      lines.push(`- ${formatMs(task.durationMs)} at ${formatMs(task.startTimeMs)} (${task.name})`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function startReadAlongLongTaskObserver(): void {
  if (!readAlongPerformanceEnabled() || globalReadAlongPerformance.__readAlongLongTaskObserver) {
    return;
  }
  if (typeof PerformanceObserver === "undefined") {
    return;
  }
  try {
    const observer = new PerformanceObserver((list) => {
      const snapshot = readAlongPerformanceSnapshot();
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) {
          continue;
        }
        snapshot.longTasks.push({
          durationMs: roundPerformanceNumber(entry.duration),
          name: entry.name,
          startTimeMs: roundPerformanceNumber(entry.startTime),
        });
      }
      snapshot.longTaskCount = snapshot.longTasks.length;
      updateReadAlongPerformanceElapsed(snapshot);
    });
    observer.observe({ entryTypes: ["longtask"] });
    globalReadAlongPerformance.__readAlongLongTaskObserver = observer;
  } catch {
    // Some browsers or test environments do not expose longtask entries.
  }
}

function readAlongPerformanceEnabled(): boolean {
  return Boolean(
    import.meta.env.DEV ||
      (globalThis as { __readAlongPerformanceEnabled?: boolean }).__readAlongPerformanceEnabled,
  );
}

function createReadAlongPerformanceSnapshot(
  options: ResetReadAlongPerformanceOptions,
): ReadAlongPerformanceSnapshot {
  const startedAtMs = nowMs();
  return {
    counters: zeroReadAlongCounters(),
    elapsedMs: 0,
    longTaskCount: 0,
    longTasks: [],
    ratesPerSecond: zeroReadAlongCounters(),
    scenarioId: options.scenarioId ?? null,
    startedAtMs,
    surface: options.surface ?? null,
  };
}

function normalizedReadAlongPerformanceSnapshot(
  snapshot: ReadAlongPerformanceSnapshot,
): ReadAlongPerformanceSnapshot {
  updateReadAlongPerformanceElapsed(snapshot);
  return snapshot;
}

function updateReadAlongPerformanceElapsed(snapshot: ReadAlongPerformanceSnapshot): void {
  snapshot.elapsedMs = Math.max(0, nowMs() - snapshot.startedAtMs);
  snapshot.longTaskCount = snapshot.longTasks.length;
  const elapsedSeconds = snapshot.elapsedMs / 1000;
  snapshot.ratesPerSecond = Object.fromEntries(
    COUNTERS.map((counter) => [
      counter,
      elapsedSeconds > 0 ? roundPerformanceNumber(snapshot.counters[counter] / elapsedSeconds) : 0,
    ]),
  ) as Record<ReadAlongPerformanceCounter, number>;
}

function zeroReadAlongCounters(): Record<ReadAlongPerformanceCounter, number> {
  return Object.fromEntries(COUNTERS.map((counter) => [counter, 0])) as Record<
    ReadAlongPerformanceCounter,
    number
  >;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundPerformanceNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMs(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `${roundPerformanceNumber(value).toFixed(2)}ms`
    : "-";
}

function formatRate(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? roundPerformanceNumber(value).toFixed(2)
    : "-";
}
