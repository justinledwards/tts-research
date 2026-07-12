import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import process from "node:process";
import { emitMarkdownAdapter } from "../../adapters/markdown/emit_ir.js";
import { parseMarkdown } from "../../adapters/markdown/parse.js";
import { transformMarkdownAst } from "../../adapters/markdown/transform.js";
import {
  evaluateGoldenMinuteSpeechFluency,
  loadGoldenMinuteFixture,
} from "../golden-minute-fixture.mjs";

const defaultAlignmentDir = "backend/internal/alignment/testdata/gold";
const defaultMarkdownFixtures = ["fixtures/markdown/plain.md"];

export async function loadBenchmarkConfig(rootDir) {
  const manifest = await readJSON(configPath(rootDir, "BENCH_FIXTURES_PATH", "fixtures.json"));
  const thresholds = await readJSON(
    configPath(rootDir, "BENCH_THRESHOLDS_PATH", "thresholds.json"),
  );
  return { manifest, thresholds };
}

export async function runAlignmentBenchmark({ rootDir, manifest, thresholds }) {
  const files = await alignmentFixturePaths(rootDir, manifest);
  if (files.length === 0) {
    throw new Error("No alignment fixtures configured.");
  }

  const fixtures = [];
  for (const file of files) {
    const fixture = JSON.parse(await readFile(path.join(rootDir, file), "utf8"));
    fixtures.push({
      file,
      ...scoreAlignmentFixture(fixture),
    });
  }

  const metrics = summarizeAlignment(fixtures);
  const comparisons = compareThresholds(metrics, thresholds?.alignment ?? {}, {
    maxMeanMaeMs: ["meanMaeMs", "<="],
    maxP95Ms: ["maxP95Ms", "<="],
    maxMeanDriftMs: ["meanDriftMs", "<="],
    minMeanCoverage: ["meanCoverage", ">="],
    minTokenCount: ["tokenCount", ">="],
  });
  const goldenMinute = await loadGoldenMinuteFixture(rootDir);
  const speechFluency = evaluateGoldenMinuteSpeechFluency(goldenMinute);
  const speechFluencyComparisons = compareThresholds(
    speechFluency.metrics,
    thresholds?.speechFluency ?? {},
    {
      maxClippedEndCount: ["clippedEndCount", "<="],
      maxClippedStartCount: ["clippedStartCount", "<="],
      maxDurationEstimateDeltaRatio: ["maxDurationEstimateDeltaRatio", "<="],
      maxExcessivePauseCount: ["excessivePauseCount", "<="],
      maxInterSegmentPauseMs: ["maxInterSegmentPauseMs", "<="],
      maxRepeatedSilenceCount: ["repeatedSilenceCount", "<="],
      maxSilentSegmentCount: ["silentSegmentCount", "<="],
    },
  );

  return {
    id: "alignment",
    metrics: {
      ...metrics,
      fixtures,
      speechFluency,
    },
    thresholds: [...comparisons, ...speechFluencyComparisons],
    output: [
      formatAlignmentBenchmark(fixtures, metrics, comparisons),
      "",
      formatSpeechFluencyBenchmark(speechFluency, speechFluencyComparisons),
    ].join("\n"),
  };
}

export async function runMarkdownBenchmark({ rootDir, manifest, thresholds }) {
  const files = manifest?.markdown?.fixtures?.length
    ? manifest.markdown.fixtures
    : defaultMarkdownFixtures;
  if (files.length === 0) {
    throw new Error("No Markdown benchmark fixtures configured.");
  }

  const fixtures = [];
  for (const file of files) {
    fixtures.push(await benchMarkdownFixture(rootDir, file));
  }
  const metrics = summarizeMarkdown(fixtures);
  const comparisons = compareThresholds(metrics, thresholds?.markdown ?? {}, {
    maxTotalParseMs: ["totalParseMs", "<="],
    maxTotalTransformMs: ["totalTransformMs", "<="],
    maxTotalEmitMs: ["totalEmitMs", "<="],
    maxTotalWarnings: ["totalWarnings", "<="],
    minTotalNodes: ["totalNodes", ">="],
  });

  return {
    id: "markdown",
    metrics: {
      ...metrics,
      fixtures,
    },
    thresholds: comparisons,
    output: formatMarkdownBenchmark(fixtures, metrics, comparisons),
  };
}

export function formatAlignmentBenchmark(fixtures, metrics, comparisons = []) {
  const lines = ["Alignment benchmark"];
  for (const fixture of fixtures) {
    lines.push(
      `- ${fixture.name}: MAE=${fixture.maeMs.toFixed(1)}ms p95=${fixture.p95Ms.toFixed(
        1,
      )}ms drift=${fixture.driftMs.toFixed(1)}ms coverage=${Math.round(
        fixture.coverage * 100,
      )}% tokens=${fixture.tokenCount} quality=${fixture.quality}`,
    );
  }
  lines.push(
    `Overall: MAE=${metrics.meanMaeMs.toFixed(1)}ms p95=${metrics.maxP95Ms.toFixed(
      1,
    )}ms drift=${metrics.meanDriftMs.toFixed(1)}ms coverage=${Math.round(
      metrics.meanCoverage * 100,
    )}% tokens=${metrics.tokenCount}`,
  );
  lines.push(
    `Quality: ${Object.entries(metrics.qualityCounts ?? {})
      .map(([quality, count]) => `${quality}=${count}`)
      .join(" ")}`,
  );
  appendComparisons(lines, comparisons);
  return lines.join("\n");
}

export function formatMarkdownBenchmark(fixtures, metrics, comparisons = []) {
  const lines = ["Markdown adapter benchmark"];
  for (const fixture of fixtures) {
    lines.push(
      `- ${fixture.file}: parse=${fixture.parseMs.toFixed(2)}ms transform=${fixture.transformMs.toFixed(
        2,
      )}ms emit=${fixture.emitMs.toFixed(2)}ms nodes=${fixture.nodes} blocks=${fixture.blocks} warnings=${fixture.warningCount}`,
    );
  }
  lines.push(
    `Overall: parse=${metrics.totalParseMs.toFixed(2)}ms transform=${metrics.totalTransformMs.toFixed(
      2,
    )}ms emit=${metrics.totalEmitMs.toFixed(2)}ms nodes=${metrics.totalNodes} warnings=${metrics.totalWarnings}`,
  );
  appendComparisons(lines, comparisons);
  return lines.join("\n");
}

export function formatSpeechFluencyBenchmark(report, comparisons = []) {
  const lines = [
    "Speech fluency benchmark",
    `Status: ${report.status.toUpperCase()}`,
    `Segments: ${String(report.metrics.segmentCount)} seams=${String(report.metrics.seamCount)}`,
    `Energy: clipped-starts=${String(report.metrics.clippedStartCount)} clipped-ends=${String(
      report.metrics.clippedEndCount,
    )} silent=${String(report.metrics.silentSegmentCount)}`,
    `Pauses: max-seam=${formatNumber(
      report.metrics.maxInterSegmentPauseMs,
    )}ms excessive=${String(report.metrics.excessivePauseCount)} repeated-silence=${String(
      report.metrics.repeatedSilenceCount,
    )}`,
    `Duration estimate: max-delta=${formatNumber(
      report.metrics.maxDurationEstimateDeltaRatio * 100,
    )}%`,
  ];
  appendComparisons(lines, comparisons);
  return lines.join("\n");
}

function scoreAlignmentFixture(fixture) {
  const expected = fixture.tokens ?? [];
  const actual = heuristicTokens(fixture);
  const count = Math.min(expected.length, actual.length);
  const errors = [];
  for (let index = 0; index < count; index += 1) {
    errors.push(Math.abs((actual[index]?.startMs ?? 0) - (expected[index]?.startMs ?? 0)));
    errors.push(Math.abs((actual[index]?.endMs ?? 0) - (expected[index]?.endMs ?? 0)));
  }
  const mae = errors.length > 0 ? errors.reduce((sum, value) => sum + value, 0) / errors.length : 0;
  const expectedEnd = expected.at(-1)?.endMs ?? fixture.durationMs ?? 0;
  const actualEnd = actual.at(-1)?.endMs ?? 0;
  return {
    coverage: expected.length > 0 ? count / expected.length : 0,
    driftMs: Math.abs(actualEnd - expectedEnd),
    maeMs: mae,
    name: fixture.name ?? "fixture",
    p95Ms: percentile(errors, 95),
    quality: alignmentQualityForScore({
      coverage: expected.length > 0 ? count / expected.length : 0,
      driftMs: Math.abs(actualEnd - expectedEnd),
      p95Ms: percentile(errors, 95),
    }),
    tokenCount: count,
  };
}

function heuristicTokens(fixture) {
  const tokens = [];
  for (const segment of fixture.segments ?? []) {
    const words = tokenize(segment.text);
    const segmentWeights = weights(words);
    const totalWeight = segmentWeights.reduce((sum, value) => sum + value, 0);
    let consumed = 0;
    for (const [index, word] of words.entries()) {
      const start =
        segment.startMs + Math.round((consumed / Math.max(1, totalWeight)) * segment.durationMs);
      consumed += segmentWeights[index] ?? 0;
      const end =
        segment.startMs + Math.round((consumed / Math.max(1, totalWeight)) * segment.durationMs);
      tokens.push({ text: word, startMs: start, endMs: Math.max(start + 1, end) });
    }
  }
  return tokens;
}

function summarizeAlignment(fixtures) {
  const totals = fixtures.reduce(
    (accumulator, fixture) => ({
      coverage: accumulator.coverage + fixture.coverage,
      driftMs: accumulator.driftMs + fixture.driftMs,
      maeMs: accumulator.maeMs + fixture.maeMs,
      p95Ms: Math.max(accumulator.p95Ms, fixture.p95Ms),
      tokenCount: accumulator.tokenCount + fixture.tokenCount,
    }),
    { coverage: 0, driftMs: 0, maeMs: 0, p95Ms: 0, tokenCount: 0 },
  );
  return {
    fixtureCount: fixtures.length,
    maxP95Ms: totals.p95Ms,
    meanCoverage: totals.coverage / fixtures.length,
    meanDriftMs: totals.driftMs / fixtures.length,
    meanMaeMs: totals.maeMs / fixtures.length,
    qualityCounts: fixtures.reduce((counts, fixture) => {
      counts[fixture.quality] = (counts[fixture.quality] ?? 0) + 1;
      return counts;
    }, {}),
    tokenCount: totals.tokenCount,
  };
}

function alignmentQualityForScore({ coverage, driftMs, p95Ms }) {
  if (coverage >= 0.99 && p95Ms <= 50 && driftMs <= 50) {
    return "exact";
  }
  if (coverage >= 0.95 && p95Ms <= 150 && driftMs <= 150) {
    return "good";
  }
  if (coverage >= 0.75 && p95Ms <= 350) {
    return "phrase-only";
  }
  return "degraded";
}

async function benchMarkdownFixture(rootDir, file) {
  const source = await readFile(path.join(rootDir, file), "utf8");
  const parseStart = performance.now();
  const parsed = parseMarkdown(source);
  const parseMs = performance.now() - parseStart;

  const transformStart = performance.now();
  const transformed = transformMarkdownAst(parsed.tree, source, {
    parseWarnings: parsed.warnings,
  });
  const transformMs = performance.now() - transformStart;

  const emitStart = performance.now();
  const emitted = emitMarkdownAdapter(source, { sourceName: file });
  const emitMs = performance.now() - emitStart;

  return {
    blocks: emitted.blocks.length,
    bytes: Buffer.byteLength(source),
    emitMs: roundMs(emitMs),
    file,
    nodes: transformed.nodes.length,
    parseMs: roundMs(parseMs),
    transformMs: roundMs(transformMs),
    warningCount: emitted.warnings.length,
    warnings: emitted.warnings,
  };
}

function summarizeMarkdown(fixtures) {
  return {
    fixtureCount: fixtures.length,
    totalBlocks: fixtures.reduce((sum, fixture) => sum + fixture.blocks, 0),
    totalBytes: fixtures.reduce((sum, fixture) => sum + fixture.bytes, 0),
    totalEmitMs: roundMs(fixtures.reduce((sum, fixture) => sum + fixture.emitMs, 0)),
    totalNodes: fixtures.reduce((sum, fixture) => sum + fixture.nodes, 0),
    totalParseMs: roundMs(fixtures.reduce((sum, fixture) => sum + fixture.parseMs, 0)),
    totalTransformMs: roundMs(fixtures.reduce((sum, fixture) => sum + fixture.transformMs, 0)),
    totalWarnings: fixtures.reduce((sum, fixture) => sum + fixture.warningCount, 0),
  };
}

async function alignmentFixturePaths(rootDir, manifest) {
  if (manifest?.alignment?.fixtures?.length) {
    return manifest.alignment.fixtures;
  }
  const goldDir = path.join(rootDir, defaultAlignmentDir);
  const files = (await readdir(goldDir)).filter((file) => file.endsWith(".json")).sort();
  return files.map((file) => path.join(defaultAlignmentDir, file));
}

function compareThresholds(metrics, thresholds, mappings) {
  const comparisons = [];
  for (const [thresholdKey, [metricKey, operator]] of Object.entries(mappings)) {
    if (thresholds[thresholdKey] === undefined) {
      continue;
    }
    const actual = metrics[metricKey];
    const expected = thresholds[thresholdKey];
    comparisons.push({
      actual,
      expected,
      metric: metricKey,
      operator,
      passed: operator === "<=" ? actual <= expected : actual >= expected,
      threshold: thresholdKey,
    });
  }
  return comparisons;
}

function appendComparisons(lines, comparisons) {
  if (comparisons.length === 0) {
    return;
  }
  lines.push("Thresholds:");
  for (const comparison of comparisons) {
    lines.push(
      `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatNumber(
        comparison.actual,
      )} ${comparison.operator} ${formatNumber(comparison.expected)}`,
    );
  }
}

function tokenize(text) {
  return text.trim().match(/\S+/g) ?? [];
}

function weights(tokens) {
  return tokens.map((token) => Math.max(2, [...token.replace(/[^\p{L}\p{N}]/gu, "")].length));
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

async function readJSON(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function configPath(rootDir, envName, defaultFile) {
  const configured = process.env[envName]?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
  }
  return path.join(rootDir, "benches", defaultFile);
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}
