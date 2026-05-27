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

const explicitBlockingWaiverEnv = "E2E_ALLOW_LOW_RESOURCE_BLOCKING_WAIVERS";

const lowResourceBudgetRegistry = {
  "book-cinema-open": {
    acceptedWaiver: false,
    breakdown: [
      {
        id: "cinema-overlay-boot",
        label: "Cinema overlay boot",
        phase: "first-run",
        targetMs: 450,
      },
      {
        id: "hash-resume-warm-open",
        label: "Warm hash resume open",
        phase: "warm-run",
        targetMs: 350,
      },
    ],
    classification: "blocking regression",
    owner: "WP52 cinema launch budget owner",
    reason:
      "Book Cinema open is a hard user-visible launch budget and should fail unless the regression is explicitly waived.",
    reviewDate: "2026-06-10",
    target: "Keep p99 and max below 450ms in low-resource mode.",
    targetMs: 450,
    trackingIssue: "WP52-1",
  },
  "command-palette-open-search": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "command-indexing-first-run",
        label: "First-run command indexing",
        phase: "first-run",
        targetMs: 2200,
      },
      {
        id: "warm-search-latency",
        label: "Warm-run search latency",
        phase: "warm-run",
        targetMs: 700,
      },
    ],
    classification: "known budget overrun",
    owner: "WP52 command palette indexing owner",
    reason: "The local low-resource smoke includes first-load command indexing under CPU throttle.",
    reviewDate: "2026-06-10",
    target: "Separate first-run command indexing from warm search and move warm p95 below 700ms.",
    targetMs: 2200,
    trackingIssue: "WP52-2",
  },
  "context-panel-tab-switch": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "context-panel-boot",
        label: "Context panel boot",
        phase: "first-run",
        targetMs: 950,
      },
      {
        id: "warm-tab-switch-variance",
        label: "Warm tab switch variance",
        phase: "warm-run",
        targetMs: 450,
      },
    ],
    classification: "flaky measurement",
    owner: "WP52 context panel variance owner",
    reason: "Tab-switch timing includes browser focus and lazy panel fallback variance.",
    reviewDate: "2026-06-10",
    target: "Characterize variance and hold warm tab-switch p95 below 450ms.",
    targetMs: 950,
    trackingIssue: "WP52-3",
  },
  "reader-resume": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "audio-context-resume",
        label: "Audio-context resume",
        phase: "warm-run",
        targetMs: 500,
      },
      {
        id: "locator-restore",
        label: "Locator and highlight restore",
        phase: "warm-run",
        targetMs: 300,
      },
    ],
    classification: "known budget overrun",
    owner: "WP52 reader resume owner",
    reason: "Reader resume remains above the strict 500ms target on constrained local runs.",
    reviewDate: "2026-06-10",
    target: "Keep warm reader resume p95 below 500ms, then tighten target with more samples.",
    targetMs: 500,
    trackingIssue: "WP52-4",
  },
  "settings-open": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "settings-lazy-chunk",
        label: "Settings lazy chunk",
        phase: "first-run",
        targetMs: 850,
      },
      {
        id: "settings-hydration",
        label: "Settings hydration",
        phase: "first-run",
        targetMs: 500,
      },
    ],
    classification: "known budget overrun",
    owner: "WP52 settings hydration owner",
    reason: "Settings first open still pays lazy chunk and preference hydration cost.",
    reviewDate: "2026-06-10",
    target: "Keep first settings open below 850ms and identify hydration-only warm cost.",
    targetMs: 850,
    trackingIssue: "WP52-5",
  },
  "source-switch": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "inspector-layout-switch",
        label: "Inspector layout switch",
        phase: "first-run",
        targetMs: 1200,
      },
    ],
    classification: "environmental variance",
    owner: "WP52 source-switch owner",
    reason: "The source-switch smoke crosses inspector layout work under CPU throttling.",
    reviewDate: "2026-06-10",
    target:
      "Hold source-switch p95 below 1200ms and remove environmental waiver after three clean runs.",
    targetMs: 1200,
    trackingIssue: "WP52-6",
  },
  "teleprompt-cue-switch": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "teleprompt-panel-boot",
        label: "Teleprompt panel boot",
        phase: "first-run",
        targetMs: 1100,
      },
      {
        id: "cue-render",
        label: "Cue render and selection",
        phase: "first-run",
        targetMs: 650,
      },
    ],
    classification: "known budget overrun",
    owner: "WP52 teleprompt cue owner",
    reason: "Teleprompt first cue switch includes lazy panel bootstrapping in low-resource mode.",
    reviewDate: "2026-06-10",
    target: "Split Teleprompt boot from cue switch and keep warm cue switch below 650ms.",
    targetMs: 1100,
    trackingIssue: "WP52-7",
  },
  "transport-interaction-latency": {
    acceptedWaiver: true,
    breakdown: [
      {
        id: "audio-context-resume",
        label: "Audio-context resume",
        phase: "first-run",
        targetMs: 850,
      },
      {
        id: "first-transport-render",
        label: "First transport render",
        phase: "first-run",
        targetMs: 450,
      },
    ],
    classification: "known budget overrun",
    owner: "WP52 audio transport owner",
    reason: "First transport play can include audio-context resume under CPU throttling.",
    reviewDate: "2026-06-10",
    target: "Prewarm or defer audio-context resume so first transport p95 stays below 850ms.",
    targetMs: 850,
    trackingIssue: "WP52-8",
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

export function evaluateReaderTimingSummary(summary, thresholds, options = {}) {
  const metrics = summarizeReaderTimingSummary(summary);
  const comparisons = compareReaderTimingBudgets(metrics, thresholds, options);
  return {
    failures: summarizeReaderTimingFailures(comparisons),
    metrics,
    output: formatReaderTimingReport(metrics, comparisons),
    thresholds: comparisons,
    waiverBurndown: buildLowResourceWaiverBurndown(metrics, comparisons),
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
      ...metricsWithSourcePhase(fixture?.metrics?.firstOpen?.metrics, "first-run"),
      ...metricsWithSourcePhase(fixture?.metrics?.resumed?.metrics, "warm-run"),
    ];
    for (const { metric, sourcePhase } of metrics) {
      if (
        !readerTimingMetricNames.includes(metric?.name) ||
        typeof metric.durationMs !== "number" ||
        !Number.isFinite(metric.durationMs)
      ) {
        continue;
      }
      const runPhase = normalizeRunPhase(metric.detail?.runPhase) ?? sourcePhase;
      observationsByName[metric.name].push({
        detail: metric.detail ?? {},
        durationMs: roundMs(metric.durationMs),
        kind,
        runPhase,
        sourcePhase,
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
        p50Ms: null,
        p95Ms: null,
        p99Ms: null,
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

export function compareReaderTimingBudgets(metrics, thresholds = {}, options = {}) {
  const allowBlockingWaivers =
    options.allowBlockingWaivers ?? isExplicitBlockingWaiverEnabled(process.env);
  const comparisons = [];
  for (const [threshold, metricName] of thresholdMappings) {
    if (thresholds[threshold] === undefined) {
      continue;
    }
    const metric = metrics?.metrics?.[metricName] ?? {};
    const actual = metric.maxMs ?? null;
    const expected = thresholds[threshold];
    const passed = typeof actual === "number" && actual <= expected;
    const policy = policyForComparison(metricName, actual, { allowBlockingWaivers });
    comparisons.push({
      actual,
      blocking: !passed && policy.blocking,
      classification: passed ? "passed" : policy.classification,
      count: metric.count ?? 0,
      expected,
      firstRunMaxMs: metric.byRunPhase?.["first-run"]?.maxMs ?? null,
      p50Ms: metric.p50Ms ?? null,
      p95Ms: metric.p95Ms ?? null,
      p99Ms: metric.p99Ms ?? null,
      metric: `${metricName}.maxMs`,
      operator: "<=",
      passed,
      target: policy.target ?? null,
      threshold,
      waiver:
        !passed && !policy.blocking && policy.id
          ? {
              id: policy.id,
              reviewDate: policy.reviewDate,
              owner: policy.owner,
              reason: policy.reason,
              target: policy.target,
              targetMs: policy.targetMs ?? expected,
              trackingIssue: policy.trackingIssue,
            }
          : null,
      warmRunMaxMs: metric.byRunPhase?.["warm-run"]?.maxMs ?? null,
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
    "| Interaction | Status | Max | P50 | P95 | P99 | First run | Warm run | Budget | Classification | Waiver |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |",
  ];
  for (const comparison of comparisons) {
    const status = comparison.passed ? "PASS" : comparison.blocking ? "BLOCKING" : "WAIVED";
    lines.push(
      `| ${comparison.metric} | ${status} | ${formatMs(comparison.actual)} | ${formatMs(
        comparison.p50Ms,
      )} | ${formatMs(comparison.p95Ms)} | ${formatMs(comparison.p99Ms)} | ${formatMs(
        comparison.firstRunMaxMs,
      )} | ${formatMs(comparison.warmRunMaxMs)} | ${formatMs(
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
        ? ` Waiver: ${item.waiver.id}; owner: ${item.waiver.owner}; target: ${item.waiver.target}; review: ${item.waiver.reviewDate}; reason: ${item.waiver.reason}`
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

export function buildLowResourceWaiverBurndown(metrics, comparisons = []) {
  const comparisonsByMetric = new Map(
    comparisons.map((comparison) => [comparison.metric.replace(/\.maxMs$/, ""), comparison]),
  );
  const items = Object.entries(lowResourceBudgetRegistry).map(([metricName, policy]) => {
    const metric = metrics.metrics?.[metricName] ?? null;
    const comparison = comparisonsByMetric.get(metricName) ?? null;
    const status = comparison?.passed
      ? "closed-under-budget"
      : comparison?.waiver
        ? "waived-over-budget"
        : comparison?.blocking
          ? "blocking"
          : "not-evaluated";
    return {
      actualMaxMs: comparison?.actual ?? metric?.maxMs ?? null,
      breakdown: buildLazyLoadBreakdown(metric, policy.breakdown ?? []),
      budgetMs: comparison?.expected ?? policy.targetMs ?? null,
      classification: comparison?.classification ?? policy.classification,
      metric: `${metricName}.maxMs`,
      owner: policy.owner,
      p50Ms: metric?.p50Ms ?? null,
      p95Ms: metric?.p95Ms ?? null,
      p99Ms: metric?.p99Ms ?? null,
      reviewDate: policy.reviewDate,
      runPhases: metric?.byRunPhase ?? {},
      status,
      subIssue: policy.trackingIssue,
      target: policy.target,
      targetMs: policy.targetMs ?? comparison?.expected ?? null,
      waiverId: comparison?.waiver?.id ?? null,
    };
  });
  return {
    activeWaivers: items.filter((item) => item.status === "waived-over-budget").length,
    blocking: items.filter((item) => item.status === "blocking").length,
    closedUnderBudget: items.filter((item) => item.status === "closed-under-budget").length,
    items,
    schemaVersion: "tts-research.low-resource-waiver-burndown.v1",
  };
}

export function formatLowResourceWaiverBurndownMarkdown(burndown) {
  const lines = [
    "# Low-Resource Waiver Burn-down",
    "",
    `Active waivers: ${String(burndown.activeWaivers ?? 0)}`,
    `Blocking items: ${String(burndown.blocking ?? 0)}`,
    `Closed under budget: ${String(burndown.closedUnderBudget ?? 0)}`,
    "",
    "| Sub-issue | Metric | Status | Owner | Target | Max | P95 | P99 |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const item of burndown.items ?? []) {
    lines.push(
      `| ${item.subIssue} | ${item.metric} | ${item.status} | ${item.owner} | ${item.target} | ${formatMs(
        item.actualMaxMs,
      )} | ${formatMs(item.p95Ms)} | ${formatMs(item.p99Ms)} |`,
    );
  }
  lines.push("", "## Lazy-load Breakdown", "");
  for (const item of burndown.items ?? []) {
    lines.push(`### ${item.subIssue}: ${item.metric}`, "");
    if (!item.breakdown?.length) {
      lines.push("- No breakdown registered.", "");
      continue;
    }
    for (const entry of item.breakdown) {
      lines.push(
        `- ${entry.label}: ${formatMs(entry.actualMs)} target ${formatMs(
          entry.targetMs,
        )} (${entry.phase}; samples=${String(entry.sampleCount)})`,
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

export function formatReaderTimingReport(metrics, comparisons = []) {
  const lines = [
    `Reader timing performance${metrics.lowResourceMode ? " (low-resource)" : ""}`,
    `- Fixtures: ${metrics.fixtureKinds.join(", ") || "none"}`,
  ];
  for (const metricName of readerTimingMetricNames) {
    const metric = metrics.metrics[metricName];
    lines.push(
      `- ${metricName}: max=${formatMs(metric.maxMs)} p50=${formatMs(
        metric.p50Ms,
      )} p95=${formatMs(metric.p95Ms)} p99=${formatMs(
        metric.p99Ms,
      )} first=${formatMs(metric.byRunPhase?.["first-run"]?.maxMs)} warm=${formatMs(
        metric.byRunPhase?.["warm-run"]?.maxMs,
      )} mean=${formatMs(metric.meanMs)} samples=${String(metric.count)}`,
    );
  }
  const burndown = buildLowResourceWaiverBurndown(metrics, comparisons);
  if (burndown.items.length > 0) {
    lines.push("Waiver burn-down:");
    for (const item of burndown.items) {
      lines.push(
        `- ${item.subIssue} ${item.metric}: ${item.status}; owner=${item.owner}; target=${item.target}`,
      );
    }
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

function policyForComparison(metricName, actual, { allowBlockingWaivers = false } = {}) {
  if (typeof actual !== "number" || !Number.isFinite(actual)) {
    return {
      blocking: true,
      classification: "blocking regression",
      owner: "local QA",
      reason: "Required interaction metric was not recorded.",
    };
  }
  const policy = lowResourceBudgetRegistry[metricName];
  if (policy?.acceptedWaiver || (policy && allowBlockingWaivers)) {
    return {
      ...policy,
      blocking: false,
      id: `${metricName}-low-resource-budget`,
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
  return `${waiver.id} (${waiver.owner}; target ${formatMs(waiver.targetMs)})`;
}

function buildLazyLoadBreakdown(metric, breakdown = []) {
  return breakdown.map((entry) => {
    const phase = entry.phase ?? "first-run";
    const phaseMetric = metric?.byRunPhase?.[phase] ?? null;
    return {
      actualMs: phaseMetric?.count > 0 ? phaseMetric.maxMs : null,
      id: entry.id,
      label: entry.label,
      phase,
      sampleCount: phaseMetric?.count ?? 0,
      targetMs: entry.targetMs ?? null,
    };
  });
}

function metricsWithSourcePhase(metrics, sourcePhase) {
  return (metrics ?? []).map((metric) => ({ metric, sourcePhase }));
}

function normalizeRunPhase(value) {
  if (value === "first-run" || value === "warm-run") {
    return value;
  }
  return null;
}

function isExplicitBlockingWaiverEnabled(env) {
  return env?.[explicitBlockingWaiverEnv] === "1";
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
    byRunPhase: {
      "first-run": summarizeObservationSubset(
        observations.filter((observation) => observation.runPhase === "first-run"),
      ),
      "warm-run": summarizeObservationSubset(
        observations.filter((observation) => observation.runPhase === "warm-run"),
      ),
    },
    count: values.length,
    maxMs: roundMs(Math.max(...values)),
    meanMs: roundMs(values.reduce((sum, value) => sum + value, 0) / values.length),
    minMs: roundMs(Math.min(...values)),
    observations,
    p50Ms: roundMs(percentile(values, 50)),
    p95Ms: roundMs(percentile(values, 95)),
    p99Ms: roundMs(percentile(values, 99)),
  };
}

function summarizeObservationSubset(observations) {
  if (observations.length === 0) {
    return {
      count: 0,
      maxMs: null,
      meanMs: null,
      minMs: null,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
    };
  }
  const values = observations.map((observation) => observation.durationMs);
  return {
    count: values.length,
    maxMs: roundMs(Math.max(...values)),
    meanMs: roundMs(values.reduce((sum, value) => sum + value, 0) / values.length),
    minMs: roundMs(Math.min(...values)),
    p50Ms: roundMs(percentile(values, 50)),
    p95Ms: roundMs(percentile(values, 95)),
    p99Ms: roundMs(percentile(values, 99)),
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
