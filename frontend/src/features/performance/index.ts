import { useEffect, useState } from "react";
import type { HighlightMap } from "../../types";

export type FrontendPerformanceMetricName =
  | "app-cold-usable"
  | "book-cinema-open"
  | "prepared-source-cinema-open"
  | "reader-resume"
  | "studio-route-switch";

export type FrontendDegradedStateName =
  | "lazy-panel-loading"
  | "low-confidence-highlight"
  | "phrase-fallback"
  | "slow-resume";

export interface FrontendPerformanceMetric {
  detail?: FrontendPerformanceDetail;
  durationMs: number;
  endedAt: number;
  name: FrontendPerformanceMetricName;
  startedAt: number;
}

export interface FrontendDegradedState {
  detail?: FrontendPerformanceDetail;
  name: FrontendDegradedStateName;
  occurredAt: number;
  surface: string;
}

export interface FrontendPerformanceStore {
  degradedStateKeys?: Partial<Record<string, true>>;
  degradedStates: FrontendDegradedState[];
  metrics: FrontendPerformanceMetric[];
  spans: Partial<Record<FrontendPerformanceMetricName, number>>;
}

export interface TimingConfidenceDisplay {
  detail: string;
  isDegraded: boolean;
  label: string;
  status: "low-confidence" | "phrase" | "word";
}

type FrontendPerformanceDetail = Record<string, string | number | boolean | null | undefined>;

const maxStoredMetrics = 80;
const maxStoredDegradedStates = 80;

export function recordFrontendMetric(
  name: FrontendPerformanceMetricName,
  durationMs: number,
  detail?: FrontendPerformanceMetric["detail"],
): void {
  const store = ensurePerformanceStore();
  const endedAt = now();
  const metric = {
    detail: compactDetail(detail),
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
): FrontendPerformanceMetric | null {
  const store = ensurePerformanceStore();
  const startedAt = store.spans[name];
  if (startedAt === undefined) {
    return null;
  }
  store.spans[name] = undefined;
  const durationMs = now() - startedAt;
  recordFrontendMetric(name, durationMs, detail);
  return store.metrics.at(-1) ?? null;
}

export function recordColdUsableMetric(detail?: FrontendPerformanceMetric["detail"]): void {
  const navigationStart = navigationStartMs();
  recordFrontendMetric("app-cold-usable", now() - navigationStart, detail);
}

export function recordFrontendDegradedState(
  name: FrontendDegradedStateName,
  surface: string,
  detail?: FrontendDegradedState["detail"],
): void {
  const store = ensurePerformanceStore();
  const cleanDetail = compactDetail(detail);
  const key = `${name}:${surface}:${stableDetailKey(cleanDetail)}`;
  const degradedStateKeys = store.degradedStateKeys ?? {};
  store.degradedStateKeys = degradedStateKeys;
  if (degradedStateKeys[key]) {
    return;
  }
  degradedStateKeys[key] = true;
  store.degradedStates.push({
    detail: cleanDetail,
    name,
    occurredAt: roundDuration(now()),
    surface,
  });
  if (store.degradedStates.length > maxStoredDegradedStates) {
    store.degradedStates.splice(0, store.degradedStates.length - maxStoredDegradedStates);
  }
}

export function resolveTimingConfidenceDisplay(
  map: HighlightMap | null | undefined,
): TimingConfidenceDisplay {
  const summary = map?.summary;
  if (!summary) {
    return {
      detail: "Timing map pending",
      isDegraded: false,
      label: "Timing pending",
      status: "word",
    };
  }
  if (summary.lowConfidence) {
    return {
      detail: summary.reason ?? "Timing confidence is below the word-highlight threshold.",
      isDegraded: true,
      label: "Low confidence",
      status: "low-confidence",
    };
  }
  if (summary.mode === "phrase" || map.mode === "phrase") {
    return {
      detail: summary.reason ?? "Phrase highlighting is active.",
      isDegraded: true,
      label: "Phrase timing",
      status: "phrase",
    };
  }
  return {
    detail: "Word-level timing is active.",
    isDegraded: false,
    label: "Word timing",
    status: "word",
  };
}

export function useDelayedBusy(isBusy: boolean, delayMs = 250): boolean {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isBusy) {
      setIsVisible(false);
      return;
    }
    const timer = globalThis.setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [delayMs, isBusy]);

  return isVisible;
}

function ensurePerformanceStore(): FrontendPerformanceStore {
  const existing = globalThis.__ttsResearchPerformance;
  if (existing) {
    const legacyExisting = existing as FrontendPerformanceStore & {
      degradedStates?: FrontendDegradedState[];
    };
    if (!Array.isArray(legacyExisting.degradedStates)) {
      legacyExisting.degradedStates = [];
    }
    return existing;
  }
  const store: FrontendPerformanceStore = { degradedStates: [], metrics: [], spans: {} };
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

function compactDetail(detail: FrontendPerformanceDetail | undefined) {
  if (!detail) {
    return;
  }
  return Object.fromEntries(
    Object.entries(detail).filter((entry): entry is [string, string | number | boolean | null] => {
      const value = entry[1];
      return (
        value !== undefined &&
        (value === null || ["boolean", "number", "string"].includes(typeof value))
      );
    }),
  );
}

function stableDetailKey(detail: FrontendPerformanceDetail | undefined): string {
  if (!detail) {
    return "";
  }
  const entries = Object.entries(detail);
  entries.sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(Object.fromEntries(entries));
}
