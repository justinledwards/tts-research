export type FrontendPerformanceMetricName =
  | "app-cold-usable"
  | "book-cinema-open"
  | "reader-resume"
  | "studio-route-switch";

export interface FrontendPerformanceMetric {
  detail?: Record<string, string | number | boolean | null>;
  durationMs: number;
  endedAt: number;
  name: FrontendPerformanceMetricName;
  startedAt: number;
}

interface FrontendPerformanceStore {
  metrics: FrontendPerformanceMetric[];
  spans: Partial<Record<FrontendPerformanceMetricName, number>>;
}

const maxStoredMetrics = 80;

export function recordFrontendMetric(
  name: FrontendPerformanceMetricName,
  durationMs: number,
  detail?: FrontendPerformanceMetric["detail"],
): void {
  const store = ensurePerformanceStore();
  const endedAt = now();
  const metric = {
    detail,
    durationMs: roundDuration(durationMs),
    endedAt,
    name,
    startedAt: roundDuration(endedAt - durationMs),
  };
  store.metrics.push(metric);
  if (store.metrics.length > maxStoredMetrics) {
    store.metrics.splice(0, store.metrics.length - maxStoredMetrics);
  }
}

export function startFrontendSpan(name: FrontendPerformanceMetricName): void {
  ensurePerformanceStore().spans[name] = now();
}

export function endFrontendSpan(
  name: FrontendPerformanceMetricName,
  detail?: FrontendPerformanceMetric["detail"],
): void {
  const store = ensurePerformanceStore();
  const startedAt = store.spans[name];
  if (startedAt === undefined) {
    return;
  }
  store.spans[name] = undefined;
  recordFrontendMetric(name, now() - startedAt, detail);
}

export function recordColdUsableMetric(detail?: FrontendPerformanceMetric["detail"]): void {
  const navigationStart = navigationStartMs();
  recordFrontendMetric("app-cold-usable", now() - navigationStart, detail);
}

function ensurePerformanceStore(): FrontendPerformanceStore {
  const existing = globalThis.__ttsResearchPerformance;
  if (existing) {
    return existing;
  }
  const store: FrontendPerformanceStore = { metrics: [], spans: {} };
  globalThis.__ttsResearchPerformance = store;
  return store;
}

function navigationStartMs(): number {
  const navigation = performance.getEntriesByType("navigation").at(0);
  if (navigation) {
    return navigation.startTime;
  }
  return 0;
}

function now(): number {
  return performance.now();
}

function roundDuration(value: number): number {
  return Math.round(value * 10) / 10;
}
