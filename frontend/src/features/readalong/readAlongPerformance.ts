export type ReadAlongPerformanceCounter =
  | "cursor-tick"
  | "dom-highlight-swap"
  | "motion-cursor-measure"
  | "motion-cursor-update"
  | "react-cursor-commit"
  | "scroll-call"
  | "word-resolve";

export interface ReadAlongPerformanceSnapshot {
  counters: Record<ReadAlongPerformanceCounter, number>;
  longTaskCount: number;
}

const COUNTERS: ReadAlongPerformanceCounter[] = [
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
  globalReadAlongPerformance.__readAlongPerformance ??= {
    counters: Object.fromEntries(COUNTERS.map((counter) => [counter, 0])) as Record<
      ReadAlongPerformanceCounter,
      number
    >,
    longTaskCount: 0,
  };
  return globalReadAlongPerformance.__readAlongPerformance;
}

export function resetReadAlongPerformanceSnapshot(): ReadAlongPerformanceSnapshot {
  globalReadAlongPerformance.__readAlongPerformance = {
    counters: Object.fromEntries(COUNTERS.map((counter) => [counter, 0])) as Record<
      ReadAlongPerformanceCounter,
      number
    >,
    longTaskCount: 0,
  };
  return globalReadAlongPerformance.__readAlongPerformance;
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
      readAlongPerformanceSnapshot().longTaskCount += list.getEntries().length;
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
