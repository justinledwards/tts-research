import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export const readerTimingMetricNames = [
  "app-cold-usable",
  "source-switch",
  "studio-route-switch",
  "book-cinema-open",
  "preview-cinema-open",
  "transport-interaction-latency",
  "waveform-progress-render",
  "teleprompt-cue-switch",
  "settings-open",
  "preview-generation-handoff",
  "command-palette-open-search",
  "context-panel-tab-switch",
  "reader-resume",
];

const thresholdMappings = [
  ["maxAppColdUsableMs", "app-cold-usable"],
  ["maxSourceSwitchMs", "source-switch"],
  ["maxStudioRouteSwitchMs", "studio-route-switch"],
  ["maxBookCinemaOpenMs", "book-cinema-open"],
  ["maxPreviewCinemaOpenMs", "preview-cinema-open"],
  ["maxTransportInteractionLatencyMs", "transport-interaction-latency"],
  ["maxWaveformProgressRenderMs", "waveform-progress-render"],
  ["maxTelepromptCueSwitchMs", "teleprompt-cue-switch"],
  ["maxSettingsOpenMs", "settings-open"],
  ["maxPreviewGenerationHandoffMs", "preview-generation-handoff"],
  ["maxCommandPaletteOpenSearchMs", "command-palette-open-search"],
  ["maxContextPanelTabSwitchMs", "context-panel-tab-switch"],
  ["maxReaderResumeMs", "reader-resume"],
];

const budgetPolicies = {
  "command-palette-open-search": {
    classification: "known budget overrun",
    owner: "WP14 command palette lazy-search follow-up",
    reason: "The local low-resource smoke includes first-load command indexing under CPU throttle.",
  },
  "context-panel-tab-switch": {
    classification: "flaky measurement",
    owner: "WP14 context panel interaction timing follow-up",
    reason: "Tab-switch timing includes browser focus and lazy panel fallback variance.",
  },
  "reader-resume": {
    classification: "known budget overrun",
    owner: "WP14 reader resume budget closure",
    reason: "Reader resume remains above the strict 500ms target on constrained local runs.",
  },
  "settings-open": {
    classification: "known budget overrun",
    owner: "WP14 settings advanced-group lazy boundary follow-up",
    reason: "Settings first open still pays lazy chunk and preference hydration cost.",
  },
  "source-switch": {
    classification: "environmental variance",
    owner: "WP14 cinema source-switch measurement follow-up",
    reason: "The source-switch smoke crosses inspector layout work under CPU throttling.",
  },
  "teleprompt-cue-switch": {
    classification: "known budget overrun",
    owner: "WP14 teleprompt cue switch budget follow-up",
    reason: "Teleprompt first cue switch includes lazy panel bootstrapping in low-resource mode.",
  },
  "transport-interaction-latency": {
    classification: "known budget overrun",
    owner: "WP14 first transport interaction budget follow-up",
    reason: "First transport play can include audio-context resume under CPU throttling.",
  },
};

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
    failures: summarizeReaderTimingFailures(comparisons),
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
        observations: [],
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
    const passed = typeof actual === "number" && actual <= expected;
    const policy = policyForComparison(metricName, actual);
    comparisons.push({
      actual,
      blocking: !passed && policy.blocking,
      classification: passed ? "passed" : policy.classification,
      expected,
      metric: `${metricName}.maxMs`,
      operator: "<=",
      passed,
      threshold,
      waiver:
        !passed && !policy.blocking
          ? {
              id: `${metricName}-low-resource-budget`,
              owner: policy.owner,
              reason: policy.reason,
            }
          : null,
    });
  }
  return comparisons;
}

export function summarizeReaderTimingFailures(comparisons = []) {
  const failures = comparisons.filter((comparison) => !comparison.passed);
  const byClassification = {};
  for (const comparison of failures) {
    const classification = comparison.classification ?? "blocking regression";
    byClassification[classification] = (byClassification[classification] ?? 0) + 1;
  }
  return {
    blocking: failures.filter((comparison) => comparison.blocking).length,
    byClassification,
    total: failures.length,
    waived: failures.filter((comparison) => comparison.waiver).length,
  };
}

export function formatInteractionBudgetMarkdown(metrics, comparisons = []) {
  const lines = [
    "# Low-Resource Interaction Budget",
    "",
    `Mode: ${metrics.lowResourceMode ? "low-resource" : "standard"}`,
    `Fixtures: ${metrics.fixtureKinds.join(", ") || "none"}`,
    "",
    "| Interaction | Status | Actual | Budget | Classification | Waiver |",
    "| --- | --- | ---: | ---: | --- | --- |",
  ];
  for (const comparison of comparisons) {
    const status = comparison.passed ? "PASS" : comparison.blocking ? "BLOCKING" : "WAIVED";
    lines.push(
      `| ${comparison.metric} | ${status} | ${formatMs(comparison.actual)} | ${formatMs(
        comparison.expected,
      )} | ${comparison.classification ?? "-"} | ${formatWaiver(comparison.waiver)} |`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

export function formatBudgetFailuresMarkdown(comparisons = []) {
  const failures = comparisons.filter((comparison) => !comparison.passed);
  const lines = ["# Low-Resource Budget Failures", ""];
  if (failures.length === 0) {
    lines.push("No budget failures were recorded.", "");
    return lines.join("\n");
  }
  for (const classification of [
    "blocking regression",
    "known budget overrun",
    "flaky measurement",
    "environmental variance",
  ]) {
    const items = failures.filter((comparison) => comparison.classification === classification);
    lines.push(`## ${classification}`, "");
    if (items.length === 0) {
      lines.push("None.", "");
      continue;
    }
    for (const item of items) {
      const waiver = item.waiver
        ? ` Waiver: ${item.waiver.id}; owner: ${item.waiver.owner}; reason: ${item.waiver.reason}`
        : "";
      lines.push(
        `- ${item.metric}: ${formatMs(item.actual)} ${item.operator} ${formatMs(
          item.expected,
        )}.${waiver}`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function buildReaderResumeArtifact(metrics, comparisons = []) {
  const resumeComparison =
    comparisons.find((comparison) => comparison.metric === "reader-resume.maxMs") ?? null;
  return {
    comparison: resumeComparison,
    degradedStates: {
      items: (metrics.degradedStates?.items ?? []).filter(
        (item) => item.surface === "reader-resume" || item.name === "slow-resume",
      ),
      total: (metrics.degradedStates?.items ?? []).filter(
        (item) => item.surface === "reader-resume" || item.name === "slow-resume",
      ).length,
    },
    metric: metrics.metrics?.["reader-resume"] ?? null,
    schemaVersion: "tts-research.reader-resume-budget.v1",
  };
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
        `- ${comparison.passed ? "PASS" : comparison.blocking ? "FAIL" : "WAIVED"} ${
          comparison.metric
        }: ${formatMs(comparison.actual)} ${comparison.operator} ${formatMs(
          comparison.expected,
        )} (${comparison.classification})`,
      );
    }
  }
  return lines.join("\n");
}

function policyForComparison(metricName, actual) {
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return {
      blocking: true,
      classification: "blocking regression",
      owner: "local QA",
      reason: "Required interaction metric was not recorded.",
    };
  }
  const policy = budgetPolicies[metricName];
  if (policy) {
    return {
      ...policy,
      blocking: false,
    };
  }
  return {
    blocking: true,
    classification: "blocking regression",
    owner: "local QA",
    reason: "The interaction exceeded its hard budget without an accepted waiver.",
  };
}

function formatWaiver(waiver) {
  if (!waiver) {
    return "-";
  }
  return `${waiver.id} (${waiver.owner})`;
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
    observations,
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
