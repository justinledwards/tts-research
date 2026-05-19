import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const readerTimingMetricNames = [
  "app-cold-usable",
  "studio-route-switch",
  "book-cinema-open",
  "reader-resume",
];

const thresholdMappings = [
  ["maxAppColdUsableMs", "app-cold-usable"],
  ["maxStudioRouteSwitchMs", "studio-route-switch"],
  ["maxBookCinemaOpenMs", "book-cinema-open"],
  ["maxReaderResumeMs", "reader-resume"],
];

export async function loadReaderTimingThresholds(rootDir) {
  const configured = process.env.BENCH_THRESHOLDS_PATH?.trim();
  const thresholdsPath = configured
    ? path.isAbsolute(configured)
      ? configured
      : path.join(rootDir, configured)
    : path.join(rootDir, "benches", "thresholds.json");
  const thresholds = JSON.parse(await readFile(thresholdsPath, "utf8"));
  return thresholds.readerTiming ?? {};
}

export function evaluateReaderTimingSummary(summary, thresholds) {
  const metrics = summarizeReaderTimingSummary(summary);
  const comparisons = compareReaderTimingBudgets(metrics, thresholds);
  return {
    metrics,
    output: formatReaderTimingReport(metrics, comparisons),
    thresholds: comparisons,
  };
}

export function summarizeReaderTimingSummary(summary) {
  const observationsByName = Object.fromEntries(
    readerTimingMetricNames.map((metricName) => [metricName, []]),
  );
  const degradedStateItems = [];

  for (const fixture of summary?.performance ?? []) {
    const kind = typeof fixture?.kind === "string" ? fixture.kind : "unknown";
    collectDegradedStates(fixture?.metrics, kind, degradedStateItems);
    const metrics = [
      ...(fixture?.metrics?.firstOpen?.metrics ?? []),
      ...(fixture?.metrics?.resumed?.metrics ?? []),
    ];
    for (const metric of metrics) {
      if (
        !readerTimingMetricNames.includes(metric?.name) ||
        typeof metric.durationMs !== "number" ||
        !Number.isFinite(metric.durationMs)
      ) {
        continue;
      }
      observationsByName[metric.name].push({
        detail: metric.detail ?? {},
        durationMs: roundMs(metric.durationMs),
        kind,
      });
    }
  }

  const byName = {};
  const missingMetrics = [];
  for (const metricName of readerTimingMetricNames) {
    const observations = observationsByName[metricName];
    if (observations.length === 0) {
      missingMetrics.push(metricName);
      byName[metricName] = {
        byKind: {},
        count: 0,
        maxMs: null,
        meanMs: null,
        minMs: null,
        p95Ms: null,
      };
      continue;
    }
    byName[metricName] = summarizeObservations(observations);
  }

  return {
    schemaVersion: "tts-research.reader-timing.v1",
    fixtureKinds: [...new Set((summary?.performance ?? []).map((fixture) => fixture.kind))].filter(
      Boolean,
    ),
    lowResourceMode: Boolean(summary?.lowResourceMode),
    degradedStates: summarizeDegradedStates(degradedStateItems),
    metrics: byName,
    missingMetrics,
  };
}

export function compareReaderTimingBudgets(metrics, thresholds = {}) {
  const comparisons = [];
  for (const [threshold, metricName] of thresholdMappings) {
    if (thresholds[threshold] === undefined) {
      continue;
    }
    const actual = metrics?.metrics?.[metricName]?.maxMs ?? null;
    const expected = thresholds[threshold];
    comparisons.push({
      actual,
      expected,
      metric: `${metricName}.maxMs`,
      operator: "<=",
      passed: typeof actual === "number" && actual <= expected,
      threshold,
    });
  }
  return comparisons;
}

export function formatReaderTimingReport(metrics, comparisons = []) {
  const lines = [
    `Reader timing performance${metrics.lowResourceMode ? " (low-resource)" : ""}`,
    `- Fixtures: ${metrics.fixtureKinds.join(", ") || "none"}`,
  ];
  for (const metricName of readerTimingMetricNames) {
    const metric = metrics.metrics[metricName];
    lines.push(
      `- ${metricName}: max=${formatMs(metric.maxMs)} p95=${formatMs(
        metric.p95Ms,
      )} mean=${formatMs(metric.meanMs)} samples=${String(metric.count)}`,
    );
  }
  if (metrics.missingMetrics.length > 0) {
    lines.push(`- Missing metrics: ${metrics.missingMetrics.join(", ")}`);
  }
  if (metrics.degradedStates.total > 0) {
    lines.push("Degraded states:");
    for (const item of metrics.degradedStates.items) {
      lines.push(
        `- ${item.name} (${item.surface}, ${item.kind}): ${formatDegradedDetail(item.detail)}`,
      );
    }
  } else {
    lines.push("- Degraded states: none");
  }
  if (comparisons.length > 0) {
    lines.push("Thresholds:");
    for (const comparison of comparisons) {
      lines.push(
        `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatMs(
          comparison.actual,
        )} ${comparison.operator} ${formatMs(comparison.expected)}`,
      );
    }
  }
  return lines.join("\n");
}

function collectDegradedStates(value, kind, output) {
  if (!value) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDegradedStates(item, kind, output);
    }
    return;
  }
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value.degradedStates)) {
    for (const state of value.degradedStates) {
      if (state?.name && state?.surface) {
        output.push({
          detail: state.detail ?? {},
          kind,
          name: state.name,
          surface: state.surface,
        });
      }
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (key !== "degradedStates") {
      collectDegradedStates(child, kind, output);
    }
  }
}

function summarizeDegradedStates(items) {
  const byName = {};
  const bySurface = {};
  for (const item of items) {
    byName[item.name] = (byName[item.name] ?? 0) + 1;
    bySurface[item.surface] = (bySurface[item.surface] ?? 0) + 1;
  }
  return {
    byName,
    bySurface,
    items,
    total: items.length,
  };
}

function formatDegradedDetail(detail) {
  const entries = Object.entries(detail ?? {}).filter(([, value]) => value !== null);
  if (entries.length === 0) {
    return "recorded";
  }
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function summarizeObservations(observations) {
  const values = observations.map((observation) => observation.durationMs);
  const byKind = {};
  for (const observation of observations) {
    byKind[observation.kind] = Math.max(byKind[observation.kind] ?? 0, observation.durationMs);
  }
  return {
    byKind,
    count: values.length,
    maxMs: roundMs(Math.max(...values)),
    meanMs: roundMs(values.reduce((sum, value) => sum + value, 0) / values.length),
    minMs: roundMs(Math.min(...values)),
    p95Ms: roundMs(percentile(values, 95)),
  };
}

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? null;
}

function formatMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "missing";
  }
  return `${value.toFixed(1)}ms`;
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
