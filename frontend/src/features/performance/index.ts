import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { HighlightMap } from "../../types";

export type FrontendPerformanceMetricName =
  | "app-cold-usable"
  | "book-cinema-open"
  | "command-palette-open-search"
  | "context-panel-tab-switch"
  | "prepared-source-cinema-open"
  | "preview-generation-handoff"
  | "reader-resume"
  | "settings-open"
  | "source-switch"
  | "studio-route-switch"
  | "teleprompt-cue-switch"
  | "transport-interaction-latency";

export type FrontendDegradedStateName =
  | "audio-not-ready"
  | "lazy-panel-loading"
  | "low-confidence-highlight"
  | "phrase-fallback"
  | "resume-position-fallback"
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

export interface InteractionTimingController {
  cancel: () => void;
  end: (detail?: FrontendPerformanceDetail) => FrontendPerformanceMetric | null;
  isStarted: () => boolean;
  start: (detail?: FrontendPerformanceDetail) => void;
}

export interface LazyPanelFallbackProps {
  detail?: string;
  label: string;
  minHeightClassName?: string;
  surface?: string;
}

const maxStoredMetrics = 80;
const maxStoredDegradedStates = 80;

export function recordFrontendMetric(
  name: FrontendPerformanceMetricName,
  durationMs: number,
  detail?: FrontendPerformanceMetric["detail"],
): FrontendPerformanceMetric {
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
  return metric;
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

export function useInteractionTiming(
  name: FrontendPerformanceMetricName,
): InteractionTimingController {
  const startedAtRef = useRef<number | null>(null);
  const startDetailRef = useRef<FrontendPerformanceDetail | undefined>(undefined);

  const start = useCallback((detail?: FrontendPerformanceDetail) => {
    startedAtRef.current = now();
    startDetailRef.current = detail;
  }, []);

  const end = useCallback(
    (detail?: FrontendPerformanceDetail) => {
      const startedAt = startedAtRef.current;
      if (startedAt === null) {
        return null;
      }
      startedAtRef.current = null;
      const startDetail = startDetailRef.current;
      startDetailRef.current = undefined;
      return recordFrontendMetric(name, now() - startedAt, {
        ...startDetail,
        ...detail,
      });
    },
    [name],
  );

  const cancel = useCallback(() => {
    startedAtRef.current = null;
    startDetailRef.current = undefined;
  }, []);

  const isStarted = useCallback(() => startedAtRef.current !== null, []);

  return useMemo(
    () => ({
      cancel,
      end,
      isStarted,
      start,
    }),
    [cancel, end, isStarted, start],
  );
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

export function LazyPanelFallback({
  detail = "Preparing this view locally.",
  label,
  minHeightClassName = "min-h-28",
  surface,
}: Readonly<LazyPanelFallbackProps>): ReactNode {
  const surfaceName = surface ?? lazySurfaceName(label);

  useEffect(() => {
    recordFrontendDegradedState("lazy-panel-loading", surfaceName, { label });
  }, [label, surfaceName]);

  return createElement(
    "div",
    {
      "aria-busy": "true",
      className: `grid ${minHeightClassName} min-w-0 content-start gap-3 rounded-md border border-dashed p-4 text-sm vs-border vs-raised`,
      "data-lazy-surface": surfaceName,
      role: "status",
    },
    createElement(
      "div",
      { className: "min-w-0" },
      createElement("p", { className: "font-semibold" }, label),
      createElement("p", { className: "mt-1 text-xs leading-5 vs-muted" }, detail),
    ),
    createElement(
      "div",
      { "aria-hidden": "true", className: "grid gap-2" },
      createElement("span", { className: "h-3 w-11/12 rounded bg-zinc-500/15" }),
      createElement("span", { className: "h-3 w-3/4 rounded bg-zinc-500/10" }),
      createElement("span", { className: "h-10 rounded-md border border-dashed vs-border" }),
    ),
  );
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

function lazySurfaceName(label: string): string {
  const normalized = label
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
  return normalized || "lazy-panel";
}
