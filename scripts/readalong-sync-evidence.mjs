import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_READALONG_SYNC_THRESHOLDS = {
  maxDegradedTimePercentage: 35,
  maxMedianWordDriftMs: 150,
  maxMissedHighlightCount: 0,
  maxP95WordDriftMs: 150,
  maxPhraseDriftMs: 350,
  maxScrollJumpCount: 0,
  maxStaleHighlightCount: 0,
  maxWrongNodeCount: 0,
  maxWrongWordCount: 0,
  minFixtureCount: 10,
};

export async function loadReadAlongSyncFixtures(rootDir, configured = {}) {
  const manifestPath = path.resolve(rootDir, configured.manifest ?? "fixtures/sync/manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const files = manifest.fixtureFiles?.length
    ? manifest.fixtureFiles
    : ["fixtures/sync/fixtures.json"];
  const fixtures = [];
  for (const file of files) {
    const filePath = path.resolve(rootDir, file);
    const data = JSON.parse(await readFile(filePath, "utf8"));
    fixtures.push(
      ...(data.fixtures ?? []).map((fixture) => ({
        ...fixture,
        file: path.relative(rootDir, filePath),
      })),
    );
  }
  const requiredTypes = configured.requiredTypes ?? manifest.requiredTypes ?? [];
  const presentTypes = new Set(fixtures.map((fixture) => fixture.kind));
  const missingTypes = requiredTypes.filter((kind) => !presentTypes.has(kind));
  if (missingTypes.length > 0) {
    throw new Error(`Missing read-along sync fixture types: ${missingTypes.join(", ")}`);
  }
  return {
    fixtureFiles: files,
    fixtures: fixtures.map(normalizeFixture),
    manifest: {
      ...manifest,
      path: path.relative(rootDir, manifestPath),
    },
    requiredTypes,
  };
}

export function evaluateReadAlongSyncFixtures({
  fixtures,
  generatedAt = new Date().toISOString(),
  thresholds = DEFAULT_READALONG_SYNC_THRESHOLDS,
} = {}) {
  const normalizedFixtures = fixtures.map(normalizeFixture);
  const fixtureResults = normalizedFixtures.map(evaluateFixture);
  const timeline = fixtureResults.flatMap((fixture) => fixture.timeline);
  const wordDrifts = timeline
    .map((row) => row.wordDriftMs)
    .filter((value) => typeof value === "number");
  const phraseDrifts = timeline
    .map((row) => row.phraseDriftMs)
    .filter((value) => typeof value === "number");
  const totalObservedMs = timeline.reduce((sum, row) => sum + row.sampleDurationMs, 0);
  const degradedObservedMs = timeline
    .filter((row) => row.runtimeState === "degraded")
    .reduce((sum, row) => sum + row.sampleDurationMs, 0);

  const metrics = {
    degradedTimePercentage:
      totalObservedMs > 0 ? roundMetric((degradedObservedMs / totalObservedMs) * 100) : 0,
    fixtureCount: normalizedFixtures.length,
    maxPhraseDriftMs: roundMetric(max(phraseDrifts)),
    medianWordDriftMs: roundMetric(percentile(wordDrifts, 50)),
    missedHighlightCount: countIssues(timeline, "missed-highlight"),
    p95WordDriftMs: roundMetric(percentile(wordDrifts, 95)),
    phraseDriftSampleCount: phraseDrifts.length,
    resyncCount: timeline.filter((row) => row.runtimeState === "resyncing").length,
    scrollJumpCount: countIssues(timeline, "scroll-jump"),
    staleHighlightCount: countIssues(timeline, "stale-highlight"),
    wordDriftSampleCount: wordDrifts.length,
    wrongNodeCount: countIssues(timeline, "wrong-node"),
    wrongWordCount: countIssues(timeline, "wrong-word"),
  };
  const comparisons = compareReadAlongSyncThresholds(metrics, thresholds);
  const failures = [
    ...timeline.flatMap((row) => row.failures),
    ...comparisons
      .filter((comparison) => !comparison.passed)
      .map(
        (comparison) =>
          `${comparison.metric} ${formatNumber(comparison.actual)} ${comparison.operator} ${formatNumber(
            comparison.expected,
          )}`,
      ),
  ];
  return {
    comparisons,
    fixtureResults,
    generatedAt,
    metrics,
    schemaVersion: "readalong-sync-results.v1",
    status: failures.length === 0 ? "passed" : "failed",
    thresholds: {
      ...DEFAULT_READALONG_SYNC_THRESHOLDS,
      ...thresholds,
    },
    timeline,
    waivers: collectWaivers(normalizedFixtures),
  };
}

export async function writeReadAlongSyncArtifacts({
  outputDir,
  result,
  rootDir,
  screenshots = [],
}) {
  await mkdir(outputDir, { recursive: true });
  const metricsPath = path.join(outputDir, "sync-metrics.json");
  const timelinePath = path.join(outputDir, "drift-timeline.json");
  const summaryPath = path.join(outputDir, "sync-summary.md");
  const resultWithScreenshots = {
    ...result,
    screenshots: screenshots.map((screenshot) => path.relative(rootDir, screenshot)),
  };
  await writeFile(metricsPath, `${JSON.stringify(resultWithScreenshots, null, 2)}\n`);
  await writeFile(timelinePath, `${JSON.stringify(result.timeline, null, 2)}\n`);
  await writeFile(summaryPath, renderReadAlongSyncSummary(resultWithScreenshots));
  return {
    metrics: metricsPath,
    summary: summaryPath,
    timeline: timelinePath,
  };
}

export function formatReadAlongSyncBenchmark(result) {
  return [
    "Read-along sync benchmark",
    `Status: ${result.status.toUpperCase()}`,
    `Fixtures: ${String(result.metrics.fixtureCount)}`,
    `Word drift: median=${formatNumber(result.metrics.medianWordDriftMs)}ms p95=${formatNumber(
      result.metrics.p95WordDriftMs,
    )}ms samples=${String(result.metrics.wordDriftSampleCount)}`,
    `Phrase drift: max=${formatNumber(result.metrics.maxPhraseDriftMs)}ms samples=${String(
      result.metrics.phraseDriftSampleCount,
    )}`,
    `Integrity: wrong-node=${String(result.metrics.wrongNodeCount)} missed=${String(
      result.metrics.missedHighlightCount,
    )} stale=${String(result.metrics.staleHighlightCount)} scroll-jumps=${String(
      result.metrics.scrollJumpCount,
    )}`,
    `Runtime: resync=${String(result.metrics.resyncCount)} degraded=${formatNumber(
      result.metrics.degradedTimePercentage,
    )}%`,
    "Thresholds:",
    ...result.comparisons.map(
      (comparison) =>
        `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatNumber(
          comparison.actual,
        )} ${comparison.operator} ${formatNumber(comparison.expected)}`,
    ),
  ].join("\n");
}

export function renderReadAlongSyncSummary(result) {
  const lines = [
    "# Read-along Sync Evidence",
    "",
    `Status: **${result.status.toUpperCase()}**`,
    `Generated: ${result.generatedAt}`,
    "",
    "## Metrics",
    "",
    `- Median word drift: ${formatNumber(result.metrics.medianWordDriftMs)} ms`,
    `- P95 word drift: ${formatNumber(result.metrics.p95WordDriftMs)} ms`,
    `- Max phrase drift: ${formatNumber(result.metrics.maxPhraseDriftMs)} ms`,
    `- Resync count: ${String(result.metrics.resyncCount)}`,
    `- Degraded time: ${formatNumber(result.metrics.degradedTimePercentage)}%`,
    `- Missed highlights: ${String(result.metrics.missedHighlightCount)}`,
    `- Wrong-node highlights: ${String(result.metrics.wrongNodeCount)}`,
    `- Scroll jumps: ${String(result.metrics.scrollJumpCount)}`,
    `- Stale highlights: ${String(result.metrics.staleHighlightCount)}`,
    "",
    "## Fixture Coverage",
    "",
    "| Fixture | Kind | Timing | Status | Word p95 | Phrase max | Issues |",
    "| --- | --- | --- | --- | ---: | ---: | ---: |",
  ];
  for (const fixture of result.fixtureResults) {
    lines.push(
      `| ${escapeMarkdown(fixture.title)} | ${fixture.kind} | ${fixture.timingSource} | ${
        fixture.status
      } | ${formatNumber(fixture.metrics.p95WordDriftMs)} | ${formatNumber(
        fixture.metrics.maxPhraseDriftMs,
      )} | ${String(fixture.failures.length)} |`,
    );
  }
  lines.push("", "## Thresholds", "");
  for (const comparison of result.comparisons) {
    lines.push(
      `- ${comparison.passed ? "PASS" : "FAIL"} ${comparison.metric}: ${formatNumber(
        comparison.actual,
      )} ${comparison.operator} ${formatNumber(comparison.expected)}`,
    );
  }
  lines.push("", "## Waivers", "");
  if (result.waivers.length === 0) {
    lines.push("- None.");
  } else {
    for (const waiver of result.waivers) {
      lines.push(`- ${waiver.fixtureId}: ${waiver.reason} (owner: ${waiver.owner})`);
    }
  }
  if (result.screenshots?.length) {
    lines.push("", "## Browser Evidence", "");
    for (const screenshot of result.screenshots) {
      lines.push(`- ${screenshot}`);
    }
  }
  const failures = [
    ...result.timeline.flatMap((row) => row.failures),
    ...result.comparisons
      .filter((comparison) => !comparison.passed)
      .map(
        (comparison) =>
          `${comparison.metric} ${formatNumber(comparison.actual)} ${comparison.operator} ${formatNumber(
            comparison.expected,
          )}`,
      ),
  ];
  if (failures.length > 0) {
    lines.push("", "## Failures", "", ...failures.map((failure) => `- ${failure}`));
  }
  lines.push("");
  return lines.join("\n");
}

export function buildFixtureTimings(fixture) {
  const words = [];
  const phrases = [];
  let wordIndex = 0;
  let phraseIndex = 0;
  for (const node of fixture.nodes ?? []) {
    const nodeWords = tokenize(node.text);
    const wordDurationMs = Math.max(1, Math.floor(node.durationMs / Math.max(1, nodeWords.length)));
    const phraseWordCount = node.phraseWordCount ?? fixture.phraseWordCount ?? 4;
    for (const [localIndex, word] of nodeWords.entries()) {
      const startMs = node.startMs + localIndex * wordDurationMs;
      const endMs =
        localIndex === nodeWords.length - 1
          ? node.startMs + node.durationMs
          : startMs + wordDurationMs;
      words.push({
        endMs,
        nodeId: node.nodeId,
        startMs,
        text: word,
        wordIndex,
      });
      wordIndex += 1;
    }
    for (let offset = 0; offset < nodeWords.length; offset += phraseWordCount) {
      const first = words.find(
        (word) =>
          word.nodeId === node.nodeId && word.wordIndex >= wordIndex - nodeWords.length + offset,
      );
      const last = words.find(
        (word) =>
          word.nodeId === node.nodeId &&
          word.wordIndex ===
            Math.min(wordIndex - 1, wordIndex - nodeWords.length + offset + phraseWordCount - 1),
      );
      if (first && last) {
        phrases.push({
          endMs: last.endMs,
          nodeId: node.nodeId,
          phraseIndex,
          startMs: first.startMs,
          wordEndIndex: last.wordIndex,
          wordStartIndex: first.wordIndex,
        });
        phraseIndex += 1;
      }
    }
  }
  return { phrases, words };
}

export function renderSyncEvidenceHtml(fixture, timelineRows) {
  const timings = buildFixtureTimings(fixture);
  const rowMarkup = timelineRows.map((row) => renderObservationRow(row, timings)).join("\n");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(fixture.title)}</title>
    <style>
      body {
        margin: 0;
        background: #f8fafc;
        color: #172033;
        font: 16px/1.5 system-ui, sans-serif;
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 32px;
      }
      section {
        border: 1px solid #d8dee9;
        border-radius: 8px;
        background: #fff;
        margin-bottom: 16px;
        padding: 16px;
      }
      .active {
        border-bottom: 3px solid #155e75;
        background: #dff6ff;
      }
      .phrase {
        outline: 2px solid #64748b;
        outline-offset: 2px;
      }
      .degraded {
        border: 1px dashed #b45309;
        background: #fffbeb;
      }
      .stale {
        color: #7c2d12;
      }
      .word {
        display: inline-block;
        margin-right: 4px;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(fixture.title)}</h1>
      <p>${escapeHtml(fixture.kind)} · ${escapeHtml(fixture.timingSource)}</p>
      ${rowMarkup}
    </main>
  </body>
</html>`;
}

function evaluateFixture(fixture) {
  const timings = buildFixtureTimings(fixture);
  const timeline = fixture.observations.map((observation, index) =>
    evaluateObservation(fixture, timings, observation, index),
  );
  const wordDrifts = timeline
    .map((row) => row.wordDriftMs)
    .filter((value) => typeof value === "number");
  const phraseDrifts = timeline
    .map((row) => row.phraseDriftMs)
    .filter((value) => typeof value === "number");
  const failures = timeline.flatMap((row) => row.failures);
  return {
    file: fixture.file,
    id: fixture.id,
    kind: fixture.kind,
    metrics: {
      maxPhraseDriftMs: roundMetric(max(phraseDrifts)),
      medianWordDriftMs: roundMetric(percentile(wordDrifts, 50)),
      p95WordDriftMs: roundMetric(percentile(wordDrifts, 95)),
      sampleCount: timeline.length,
      wordDriftSampleCount: wordDrifts.length,
    },
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    timeline,
    timingSource: fixture.timingSource,
    title: fixture.title,
  };
}

function evaluateObservation(fixture, timings, observation, index) {
  const expectedWord = findTimingAt(timings.words, observation.audioTimeMs);
  const expectedPhrase = findTimingAt(timings.phrases, observation.audioTimeMs);
  const expectedLevel = observation.expectedLevel ?? fixture.expectedLevel ?? "word";
  const runtimeState = observation.runtimeState ?? runtimeStateForObservation(fixture, observation);
  const sampleDurationMs = observation.sampleDurationMs ?? fixture.sampleDurationMs ?? 250;
  const highlightedWord = findHighlightedWord(timings.words, observation);
  const highlightedPhrase = findHighlightedPhrase(timings.phrases, observation, highlightedWord);
  const wordDriftMs =
    expectedLevel === "word" && highlightedWord
      ? Math.max(
          driftFromRange(observation.audioTimeMs, highlightedWord),
          typeof observation.observedHighlightTimeMs === "number"
            ? Math.abs(observation.observedHighlightTimeMs - observation.audioTimeMs)
            : 0,
        )
      : null;
  const phraseDriftMs =
    (expectedLevel === "phrase" || runtimeState === "resyncing") && highlightedPhrase
      ? Math.max(
          driftFromRange(observation.audioTimeMs, highlightedPhrase),
          typeof observation.observedHighlightTimeMs === "number"
            ? Math.abs(observation.observedHighlightTimeMs - observation.audioTimeMs)
            : 0,
        )
      : null;
  const issues = [];
  const failures = [];

  if (observation.audioState === "stale") {
    if (observation.highlightedNodeId || observation.highlightedWordIndex !== null) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "stale-highlight",
        issues,
        message: "Stale audio drove a visible highlight.",
      });
    }
  } else if (expectedLevel === "word") {
    if (!highlightedWord) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "missed-highlight",
        issues,
        message: "Expected word-level highlight was missing.",
      });
    }
    if (highlightedWord && expectedWord && highlightedWord.nodeId !== expectedWord.nodeId) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "wrong-node",
        issues,
        message: `Highlighted node ${highlightedWord.nodeId} instead of ${expectedWord.nodeId}.`,
      });
    }
    if (
      highlightedWord &&
      expectedWord &&
      highlightedWord.nodeId === expectedWord.nodeId &&
      highlightedWord.wordIndex !== expectedWord.wordIndex
    ) {
      addIssue({
        failures,
        fixture,
        index,
        issue: "wrong-word",
        issues,
        message: `Highlighted word ${String(highlightedWord.wordIndex)} instead of ${String(
          expectedWord.wordIndex,
        )}.`,
      });
    }
  } else if (expectedLevel === "phrase" && !highlightedPhrase) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "missed-highlight",
      issues,
      message: "Expected phrase-level highlight was missing.",
    });
  }

  if ((observation.scrollJumpPx ?? 0) > (fixture.maxScrollJumpPx ?? 480)) {
    addIssue({
      failures,
      fixture,
      index,
      issue: "scroll-jump",
      issues,
      message: `Scroll jump ${String(observation.scrollJumpPx)}px exceeded budget.`,
    });
  }

  return {
    audioState: observation.audioState ?? "ready",
    audioTimeMs: observation.audioTimeMs,
    expectedLevel,
    expectedNodeId:
      expectedWord?.nodeId ?? expectedPhrase?.nodeId ?? observation.expectedNodeId ?? null,
    expectedPhraseIndex: expectedPhrase?.phraseIndex ?? null,
    expectedWordIndex: expectedWord?.wordIndex ?? null,
    failures,
    fixtureId: fixture.id,
    highlightedNodeId: observation.highlightedNodeId ?? null,
    highlightedPhraseIndex:
      highlightedPhrase?.phraseIndex ?? observation.highlightedPhraseIndex ?? null,
    highlightedWordIndex: highlightedWord?.wordIndex ?? observation.highlightedWordIndex ?? null,
    issues,
    observationId: observation.id ?? `${fixture.id}-${String(index + 1)}`,
    phraseDriftMs: phraseDriftMs === null ? null : roundMetric(phraseDriftMs),
    runtimeState,
    sampleDurationMs,
    scrollJumpPx: observation.scrollJumpPx ?? 0,
    wordDriftMs: wordDriftMs === null ? null : roundMetric(wordDriftMs),
  };
}

function normalizeFixture(fixture) {
  return {
    expectedLevel: "word",
    maxScrollJumpPx: 480,
    phraseWordCount: 4,
    sampleDurationMs: 250,
    waivers: [],
    ...fixture,
  };
}

function runtimeStateForObservation(fixture, observation) {
  if (observation.audioState === "stale") {
    return "stale-audio";
  }
  if ((observation.expectedLevel ?? fixture.expectedLevel) === "degraded") {
    return "degraded";
  }
  if (observation.resync) {
    return "resyncing";
  }
  if ((observation.expectedLevel ?? fixture.expectedLevel) === "phrase") {
    return "synced-phrase";
  }
  return "synced-word";
}

function findHighlightedWord(words, observation) {
  if (observation.highlightedWordIndex === null || observation.highlightedWordIndex === undefined) {
    return null;
  }
  return (
    words.find(
      (word) =>
        word.wordIndex === observation.highlightedWordIndex &&
        (!observation.highlightedNodeId || word.nodeId === observation.highlightedNodeId),
    ) ?? null
  );
}

function findHighlightedPhrase(phrases, observation, highlightedWord) {
  if (
    observation.highlightedPhraseIndex !== undefined &&
    observation.highlightedPhraseIndex !== null
  ) {
    return (
      phrases.find((phrase) => phrase.phraseIndex === observation.highlightedPhraseIndex) ?? null
    );
  }
  if (highlightedWord) {
    return (
      phrases.find(
        (phrase) =>
          phrase.nodeId === highlightedWord.nodeId &&
          highlightedWord.wordIndex >= phrase.wordStartIndex &&
          highlightedWord.wordIndex <= phrase.wordEndIndex,
      ) ?? null
    );
  }
  return null;
}

function findTimingAt(items, audioTimeMs) {
  return items.find((item) => audioTimeMs >= item.startMs && audioTimeMs <= item.endMs) ?? null;
}

function driftFromRange(audioTimeMs, range) {
  if (audioTimeMs >= range.startMs && audioTimeMs <= range.endMs) {
    return 0;
  }
  return Math.min(Math.abs(audioTimeMs - range.startMs), Math.abs(audioTimeMs - range.endMs));
}

function addIssue({ failures, fixture, index, issue, issues, message }) {
  issues.push(issue);
  failures.push(`${fixture.id}#${String(index + 1)} ${issue}: ${message}`);
}

function compareReadAlongSyncThresholds(metrics, thresholds = {}) {
  const effective = { ...DEFAULT_READALONG_SYNC_THRESHOLDS, ...thresholds };
  const mappings = {
    maxDegradedTimePercentage: ["degradedTimePercentage", "<="],
    maxMedianWordDriftMs: ["medianWordDriftMs", "<="],
    maxMissedHighlightCount: ["missedHighlightCount", "<="],
    maxP95WordDriftMs: ["p95WordDriftMs", "<="],
    maxPhraseDriftMs: ["maxPhraseDriftMs", "<="],
    maxScrollJumpCount: ["scrollJumpCount", "<="],
    maxStaleHighlightCount: ["staleHighlightCount", "<="],
    maxWrongNodeCount: ["wrongNodeCount", "<="],
    maxWrongWordCount: ["wrongWordCount", "<="],
    minFixtureCount: ["fixtureCount", ">="],
  };
  return Object.entries(mappings).map(([threshold, [metric, operator]]) => {
    const actual = metrics[metric];
    const expected = effective[threshold];
    return {
      actual,
      expected,
      metric,
      operator,
      passed: operator === "<=" ? actual <= expected : actual >= expected,
      threshold,
    };
  });
}

function countIssues(timeline, issue) {
  return timeline.filter((row) => row.issues.includes(issue)).length;
}

function collectWaivers(fixtures) {
  return fixtures.flatMap((fixture) =>
    (fixture.waivers ?? []).map((waiver) => ({
      fixtureId: fixture.id,
      owner: waiver.owner ?? "unassigned",
      reason: waiver.reason ?? "No reason provided.",
    })),
  );
}

function renderObservationRow(row, timings) {
  const highlightedPhrase =
    row.highlightedPhraseIndex === null
      ? null
      : (timings.phrases.find((phrase) => phrase.phraseIndex === row.highlightedPhraseIndex) ??
        null);
  const wordsMarkup = timings.words
    .filter((word) => word.nodeId === row.expectedNodeId)
    .map((word) => {
      const phraseActive =
        highlightedPhrase &&
        word.nodeId === highlightedPhrase.nodeId &&
        word.wordIndex >= highlightedPhrase.wordStartIndex &&
        word.wordIndex <= highlightedPhrase.wordEndIndex;
      const active = word.wordIndex === row.highlightedWordIndex || phraseActive;
      const className = [
        "word",
        active ? "active" : "",
        row.expectedLevel === "phrase" && active ? "phrase" : "",
        row.runtimeState === "degraded" ? "degraded" : "",
      ]
        .filter(Boolean)
        .join(" ");
      return `<span class="${className}" data-sync-node-id="${escapeHtml(
        word.nodeId,
      )}" data-sync-word-index="${String(word.wordIndex)}" data-sync-active="${
        active ? "true" : "false"
      }">${escapeHtml(word.text)}</span>`;
    })
    .join(" ");
  return `<section data-sync-observation-id="${escapeHtml(
    row.observationId,
  )}" data-sync-runtime-state="${escapeHtml(row.runtimeState)}" data-sync-expected-node="${escapeHtml(
    row.expectedNodeId ?? "",
  )}" data-sync-highlighted-node="${escapeHtml(row.highlightedNodeId ?? "")}">
  <h2>${escapeHtml(row.observationId)}</h2>
  <p class="${row.runtimeState === "stale-audio" ? "stale" : ""}">time=${String(
    row.audioTimeMs,
  )}ms · state=${escapeHtml(row.runtimeState)} · word drift=${formatNullableMs(
    row.wordDriftMs,
  )} · phrase drift=${formatNullableMs(row.phraseDriftMs)}</p>
  <p>${wordsMarkup || "No visible highlight expected."}</p>
</section>`;
}

function tokenize(text) {
  return text.trim().match(/\S+/g) ?? [];
}

function percentile(values, p) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function max(values) {
  return values.length > 0 ? Math.max(...values) : 0;
}

function roundMetric(value) {
  return Math.round(value * 100) / 100;
}

function formatNumber(value) {
  return typeof value === "number" && !Number.isInteger(value) ? value.toFixed(2) : String(value);
}

function formatNullableMs(value) {
  return typeof value === "number" ? `${formatNumber(value)}ms` : "-";
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
